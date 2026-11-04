import { SensorConnector, isTopicAllowed, type LiveState } from './connector.js';
import type { SensorCatalog } from './contract.js';
import type { DiscoveryMessage } from './discovery.js';
import { utf8Length } from './strictJson.js';

/**
 * Read-only MQTT bridge. The SDK has no MQTT dependency: the caller passes a factory that returns a client
 * (for example `() => mqtt.connect(url, options)` from mqtt.js). The client only has to fit MqttClientLike.
 * Needs timers, so it is a separate entry (`@fabriqon/sdk/sensors/mqtt`) and not part of the DOM-free core.
 *
 * - Only exact topics inside the operator-approved prefixes are subscribed, never wildcards
 *   (the single exception is the bounded discovery scan, see scanDiscovery).
 * - Nothing is published. There are no commands.
 * - Oversized messages and messages above the rate limit are dropped.
 * - The connection opens with the first subscription and closes after an idle time.
 * - The broker's refusal of a subscription (SUBACK code 128 or higher) is reported, not swallowed.
 *   Mosquitto accepts ACL-blocked subscriptions silently, so a missing message is no proof of access.
 */

export interface MqttClientLike {
  readonly connected: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, listener: (...args: any[]) => void): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe(topics: string[], options: { qos: 0 }, callback?: (error: Error | null | undefined, granted?: any, packet?: any) => void): unknown;
  unsubscribe(topics: string[]): unknown;
  end(force?: boolean): unknown;
}

export interface MqttSourceOptions {
  /** Same ID as the catalog source this link serves. */
  id: string;
  /** Approved topic prefixes without wildcards. */
  allowedTopicPrefixes: string[];
  /** Home Assistant discovery prefix. Needed for scanDiscovery only. */
  discoveryPrefix?: string;
  /** Messages per second beyond this limit are dropped. Default 100. */
  maxMessagesPerSecond?: number;
  /** Larger messages are dropped. Default 64 KiB. */
  maxPayloadBytes?: number;
  /** The connection closes after this idle time without subscriptions. Default 60 s. */
  idleMs?: number;
  now?: () => number;
  /** Connection errors as a short code only. Never an address or credentials. */
  onError?: (code: string) => void;
}

export const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;
export const DEFAULT_IDLE_MS = 60_000;
export const DEFAULT_MAX_MESSAGES_PER_SECOND = 100;

export type LinkStatus = 'connected' | 'disconnected' | 'unknown';
export type MessageListener = (topic: string, payload: string, retained: boolean) => void;
export type ConnectionListener = (status: Exclude<LinkStatus, 'unknown'>) => void;
export type DeniedListener = (topic: string, denied: boolean) => void;
export type ReplayListener = (topic: string, payload: string, retained: boolean, receivedAt: Date) => void;

export interface ScanLimits { durationMs: number; maxMessages: number; maxBytes: number }

const decoder = new TextDecoder('utf-8');
const unref = (timer: unknown) => (timer as { unref?: () => void }).unref?.();

export class MqttSourceLink {
  private client: MqttClientLike | null = null;
  private status: LinkStatus = 'unknown';
  private readonly refs = new Map<string, number>();
  private readonly messageListeners = new Set<MessageListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly deniedListeners = new Set<DeniedListener>();
  private readonly denied = new Set<string>();
  /** Last message per subscribed topic. The broker delivers retained messages only on a real subscribe, so a later consumer needs this. */
  private readonly last = new Map<string, { payload: string; retained: boolean; at: Date }>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private windowStart = 0;
  private windowCount = 0;
  private scan: { pattern: RegExp; messages: DiscoveryMessage[]; bytes: number; limits: ScanLimits; subscribed: boolean } | null = null;
  private readonly now: () => number;

  constructor(readonly options: MqttSourceOptions, private readonly connect: () => MqttClientLike) {
    this.now = options.now ?? Date.now;
  }

  getStatus(): LinkStatus {
    return this.status;
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => void this.messageListeners.delete(listener);
  }

  /** Calls the listener at once with the known status (if known) and on every change. */
  onConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    if (this.status !== 'unknown') listener(this.status);
    return () => void this.connectionListeners.delete(listener);
  }

  /** Reports topics the broker refused to subscribe, and the end of a refusal after a new subscribe. */
  onDenied(listener: DeniedListener): () => void {
    this.deniedListeners.add(listener);
    for (const topic of this.denied) listener(topic, true);
    return () => void this.deniedListeners.delete(listener);
  }

  /** The granted codes arrive in the SUBACK packet in topic order. A code of 128 or higher means refused. */
  private subscribeChecked(client: MqttClientLike, topics: string[]): void {
    client.subscribe(topics, { qos: 0 }, (error, granted, packet) => {
      const codes: number[] | undefined = (packet as { granted?: number[] } | undefined)?.granted ?? (error ? undefined : (granted as { qos: number }[] | undefined)?.map((g) => g.qos));
      if (!codes || codes.length !== topics.length) return;
      topics.forEach((topic, i) => {
        const refused = codes[i] >= 128;
        if (refused === this.denied.has(topic)) return;
        if (refused) this.denied.add(topic);
        else this.denied.delete(topic);
        for (const l of this.deniedListeners) l(topic, refused);
      });
    });
  }

  private setStatus(next: Exclude<LinkStatus, 'unknown'>): void {
    if (this.status === next) return;
    this.status = next;
    for (const l of this.connectionListeners) l(next);
  }

  private ensureClient(): MqttClientLike {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.client) return this.client;
    const client = this.connect();
    this.client = client;
    client.on('connect', () => {
      // A new session knows no subscriptions: subscribe to everything currently needed again.
      const topics = [...this.refs.keys()];
      if (topics.length) this.subscribeChecked(client, topics);
      if (this.scan?.subscribed) client.subscribe(this.scanPatterns(), { qos: 0 });
      this.setStatus('connected');
    });
    client.on('close', () => this.setStatus('disconnected'));
    client.on('offline', () => this.setStatus('disconnected'));
    client.on('error', (error: Error & { code?: unknown }) => this.options.onError?.(String(error?.code ?? error?.name ?? 'error')));
    client.on('message', (topic: string, payload: Uint8Array | string, packet?: { retain?: boolean }) => this.dispatch(topic, payload, packet?.retain === true));
    return client;
  }

  private dispatch(topic: string, payload: Uint8Array | string, retained: boolean): void {
    const size = typeof payload === 'string' ? utf8Length(payload) : payload.length;
    if (size > (this.options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES)) return;
    const second = Math.floor(this.now() / 1000);
    if (second !== this.windowStart) {
      this.windowStart = second;
      this.windowCount = 0;
    }
    if (++this.windowCount > (this.options.maxMessagesPerSecond ?? DEFAULT_MAX_MESSAGES_PER_SECOND)) return;
    const text = typeof payload === 'string' ? payload : decoder.decode(payload);
    if (this.scan && this.scan.pattern.test(topic)) {
      const scan = this.scan;
      if (scan.messages.length < scan.limits.maxMessages && scan.bytes + size <= scan.limits.maxBytes) {
        scan.messages.push({ topic, payload: text });
        scan.bytes += size + topic.length;
      }
      return;
    }
    if (!this.refs.has(topic)) return;
    this.last.set(topic, { payload: text, retained, at: new Date(this.now()) });
    for (const l of this.messageListeners) l(topic, text, retained);
  }

  /** Gives a new consumer the last received message per topic with its original receive time. */
  replay(topics: string[], listener: ReplayListener): void {
    for (const topic of topics) {
      const entry = this.last.get(topic);
      if (entry) listener(topic, entry.payload, entry.retained, entry.at);
    }
  }

  /**
   * Subscribes to exact topics (reference counted). Throws when a topic contains wildcards or lies outside
   * the approval. The returned function releases the subscriptions.
   */
  acquire(topics: string[]): () => void {
    for (const t of topics) if (!isTopicAllowed(t, this.options.allowedTopicPrefixes)) throw new Error(`Topic not approved: ${t.slice(0, 80)}`);
    const unique = [...new Set(topics)];
    const client = this.ensureClient();
    const fresh: string[] = [];
    for (const t of unique) {
      const n = this.refs.get(t) ?? 0;
      this.refs.set(t, n + 1);
      if (n === 0) fresh.push(t);
    }
    if (fresh.length && client.connected) this.subscribeChecked(client, fresh);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const gone: string[] = [];
      for (const t of unique) {
        const n = (this.refs.get(t) ?? 1) - 1;
        if (n <= 0) {
          this.refs.delete(t);
          gone.push(t);
        } else this.refs.set(t, n);
      }
      for (const t of gone) {
        this.denied.delete(t);
        this.last.delete(t);
      }
      if (gone.length && this.client?.connected) this.client.unsubscribe(gone);
      this.scheduleIdle();
    };
  }

  private scheduleIdle(): void {
    if (this.refs.size > 0 || this.scan || !this.client || this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.refs.size === 0 && !this.scan) this.close();
    }, this.options.idleMs ?? DEFAULT_IDLE_MS);
    unref(this.idleTimer);
  }

  private scanPatterns(): string[] {
    const prefix = this.options.discoveryPrefix!;
    return [`${prefix}/+/+/config`, `${prefix}/+/+/+/config`];
  }

  private async waitConnected(timeoutMs: number): Promise<boolean> {
    const client = this.ensureClient();
    if (client.connected) return true;
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        client.off('connect', onConnect);
        resolve(ok);
      };
      const onConnect = () => done(true);
      const timer = setTimeout(() => done(false), timeoutMs);
      client.on('connect', onConnect);
    });
  }

  /**
   * Reads the discovery configurations below the discovery prefix for a limited time.
   * Only the two discovery patterns below the configured prefix, never an arbitrary topic.
   * A wildcard pattern reads more than the exact topics of a catalog: let only administrators trigger it.
   * Configurations that a device sends at start-up without the retained flag appear only if they arrive in this window.
   */
  async scanDiscovery(limits: ScanLimits): Promise<{ ok: true; messages: DiscoveryMessage[] } | { ok: false; error: string }> {
    const prefix = this.options.discoveryPrefix;
    if (!prefix) return { ok: false, error: 'No discovery prefix is configured for this source.' };
    if (/[+#\u0000-\u001f\u007f]/.test(prefix)) return { ok: false, error: 'The discovery prefix is invalid.' };
    if (this.scan) return { ok: false, error: 'A scan is already running.' };
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    this.scan = { pattern: new RegExp(`^${escaped}/[^/+#]+/[^/+#]+(?:/[^/+#]+)?/config$`), messages: [], bytes: 0, limits, subscribed: false };
    try {
      if (!(await this.waitConnected(10_000))) return { ok: false, error: 'Cannot connect to the broker.' };
      const client = this.client!;
      await new Promise<void>((resolve, reject) => client.subscribe(this.scanPatterns(), { qos: 0 }, (error) => (error ? reject(error) : resolve())));
      this.scan.subscribed = true;
      await new Promise((resolve) => setTimeout(resolve, limits.durationMs));
      if (this.client?.connected) this.client.unsubscribe(this.scanPatterns());
      return { ok: true, messages: this.scan.messages };
    } catch {
      return { ok: false, error: 'The broker refused the scan or the connection dropped.' };
    } finally {
      this.scan = null;
      this.scheduleIdle();
    }
  }

  close(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const client = this.client;
    this.client = null;
    this.status = 'unknown';
    client?.end(true);
  }
}

export interface AttachedConnector {
  connector: SensorConnector;
  /** Releases the subscriptions and listeners of this catalog. The link stays usable for others. */
  detach: () => void;
}

/**
 * The bridge: wires a catalog to a link. Subscribes to the planned exact topics, feeds messages, the
 * cached replay, connection events and refusals into a SensorConnector and hands every resulting
 * state document to onStates. Order matters: replay first, then connection events.
 */
export function attachConnector(link: MqttSourceLink, catalog: SensorCatalog, onStates: (states: LiveState[]) => void, now: () => Date = () => new Date()): AttachedConnector {
  const connector = new SensorConnector(catalog, { sourceId: link.options.id, allowedTopicPrefixes: link.options.allowedTopicPrefixes });
  const offs: (() => void)[] = [];
  if (connector.plan.topics.length) {
    offs.push(link.acquire(connector.plan.topics));
    offs.push(link.onMessage((topic, payload, retained) => onStates(connector.handleMessage(topic, payload, retained, now()))));
    link.replay(connector.plan.topics, (topic, payload, retained, receivedAt) => onStates(connector.handleMessage(topic, payload, retained, now(), receivedAt)));
    offs.push(link.onConnection((status) => onStates(connector.setConnection(status, now()))));
    offs.push(link.onDenied((topic, denied) => onStates(connector.markDenied(topic, denied, now()))));
  }
  let detached = false;
  return { connector, detach: () => { if (detached) return; detached = true; for (const off of offs) off(); } };
}
