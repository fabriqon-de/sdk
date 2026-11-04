import type { SensorCatalog, SensorSignal, SensorState } from './contract.js';
import { decodeAvailability, decodeReading, evaluateRuntime, type Connection, type RuntimeReason, type StoredReading, type TopicAvailability } from './runtime.js';

/**
 * Logic of a read-only broker connector, without a network. A transport (MQTT client) delivers messages
 * and connection events. This class decides what may be subscribed, decodes values and produces the
 * state documents of the sensor contract (stream ID, sequence, snapshot).
 *
 * Limits (docs/guide/sensors.md):
 * - Only exact state and availability topics of active signals are subscribed, never wildcards.
 * - The operator sets allowed topic prefixes per source. A catalog cannot subscribe to anything outside
 *   that approval, because a catalog is project data and not trusted.
 * - Nothing is published.
 * - After a reconnect a new stream begins. Retained values stay marked as retained.
 */

export interface SourcePolicy {
  sourceId: string;
  /** Allowed topic prefixes without wildcards, for example "lab" allows "lab/env-01/state". */
  allowedTopicPrefixes: string[];
}

/** State document of the contract plus a display reason (not part of the contract, so kept separate). */
export interface LiveState {
  state: SensorState;
  reason: RuntimeReason | null;
}

export interface SubscriptionPlan {
  topics: string[];
  rejected: { signalId: string; topic: string; reason: 'topic-not-allowed' }[];
}

const allowed = (topic: string, prefixes: string[]) =>
  prefixes.some((p) => p.length > 0 && !/[+#]/.test(p) && (topic === p || topic.startsWith(p.endsWith('/') ? p : `${p}/`)));

/** Exact topic without wildcards inside an approved prefix ("lab" allows "lab/x", not "laboratory/x"). */
export const isTopicAllowed = (topic: string, prefixes: string[]): boolean =>
  topic.length > 0 && !/[+#\u0000-\u001f\u007f]/.test(topic) && allowed(topic, prefixes);

function activeSignals(catalog: SensorCatalog, sourceId: string): SensorSignal[] {
  return catalog.signals.filter((s) => s.sourceId === sourceId && s.lifecycle === 'active' && s.mqtt);
}

/** The exact topics that may be subscribed for this source. */
export function planSubscriptions(catalog: SensorCatalog, policy: SourcePolicy): SubscriptionPlan {
  const topics = new Set<string>();
  const rejected: SubscriptionPlan['rejected'] = [];
  for (const signal of activeSignals(catalog, policy.sourceId)) {
    const mqtt = signal.mqtt!;
    const wanted = [mqtt.stateTopic, ...(mqtt.availability?.topics.map((t) => t.topic) ?? [])];
    const blocked = wanted.find((t) => !allowed(t, policy.allowedTopicPrefixes));
    if (blocked !== undefined) {
      rejected.push({ signalId: signal.id, topic: blocked, reason: 'topic-not-allowed' });
      continue;
    }
    for (const t of wanted) topics.add(t);
  }
  return { topics: [...topics].sort(), rejected };
}

interface SignalRuntime {
  signal: SensorSignal;
  reading: StoredReading | null;
  availability: Record<string, TopicAvailability | undefined>;
  sequence: number;
  denied: boolean;
}

let streamCounter = 0;
const defaultStreamId = () => `stream-${Date.now().toString(36)}-${(streamCounter++).toString(36)}`;

export class SensorConnector {
  private readonly runtimes = new Map<string, SignalRuntime>();
  private readonly byTopic = new Map<string, SignalRuntime[]>();
  private connection: Connection = 'unknown';
  readonly plan: SubscriptionPlan;
  streamId: string;

  constructor(
    private readonly catalog: SensorCatalog,
    private readonly policy: SourcePolicy,
    private readonly newStreamId: () => string = defaultStreamId,
  ) {
    this.plan = planSubscriptions(catalog, policy);
    const subscribed = new Set(this.plan.topics);
    for (const signal of activeSignals(catalog, policy.sourceId)) {
      const mqtt = signal.mqtt!;
      if (!subscribed.has(mqtt.stateTopic)) continue;
      const runtime: SignalRuntime = { signal, reading: null, availability: {}, sequence: 0, denied: false };
      this.runtimes.set(signal.id, runtime);
      for (const topic of [mqtt.stateTopic, ...(mqtt.availability?.topics.map((t) => t.topic) ?? [])]) {
        const list = this.byTopic.get(topic) ?? [];
        list.push(runtime);
        this.byTopic.set(topic, list);
      }
    }
    this.streamId = this.newStreamId();
  }

  private emit(runtime: SignalRuntime, reason: SensorState['reason'], now: Date): LiveState {
    const view = evaluateRuntime({ signal: runtime.signal, now, connection: this.connection, availabilityTopics: runtime.availability, reading: runtime.reading, denied: runtime.denied });
    runtime.sequence += 1;
    const state: SensorState = {
      schemaVersion: 1,
      kind: 'fabriqon.sensor-state',
      catalogId: this.catalog.catalogId,
      sourceId: this.policy.sourceId,
      signalId: runtime.signal.id,
      streamId: this.streamId,
      sequence: runtime.sequence,
      reason,
      emittedAt: now.toISOString(),
      sourceConnection: view.sourceConnection,
      availability: view.availability,
      freshness: view.freshness,
      reading: runtime.reading,
    };
    return { state, reason: view.reason };
  }

  /** Connection event of the transport. Only a reconnect begins a new stream; the first connect keeps the initial stream. */
  setConnection(next: Connection, now: Date): LiveState[] {
    if (next === 'connected' && this.connection === 'disconnected') {
      this.streamId = this.newStreamId();
      for (const r of this.runtimes.values()) r.sequence = 0;
    }
    this.connection = next;
    return [...this.runtimes.values()].map((r) => this.emit(r, 'connection', now));
  }

  /** The broker refused the subscription of a topic (ACL). Affected signals show the reason instead of "no reading". */
  markDenied(topic: string, denied: boolean, now: Date): LiveState[] {
    const out: LiveState[] = [];
    for (const runtime of this.byTopic.get(topic) ?? []) {
      if (runtime.signal.mqtt!.stateTopic !== topic || runtime.denied === denied) continue;
      runtime.denied = denied;
      out.push(this.emit(runtime, 'connection', now));
    }
    return out;
  }

  /** Processes a message. Topics outside the plan are ignored. */
  handleMessage(topic: string, payload: string, retained: boolean, now: Date, receivedAt: Date = now): LiveState[] {
    const targets = this.byTopic.get(topic);
    if (!targets) return [];
    const out: LiveState[] = [];
    for (const runtime of targets) {
      const mqtt = runtime.signal.mqtt!;
      if (topic === mqtt.stateTopic) {
        const decoded = decodeReading(runtime.signal, payload);
        runtime.reading = { value: decoded.value, quality: decoded.quality, observedAt: null, receivedAt: receivedAt.toISOString(), retained };
        out.push(this.emit(runtime, 'measurement', now));
      } else if (mqtt.availability) {
        runtime.availability[topic] = { state: decodeAvailability(mqtt.availability, topic, payload), at: receivedAt.toISOString() };
        out.push(this.emit(runtime, 'availability', now));
      }
    }
    return out;
  }

  /** Current snapshot of all signals. Time passes: expiry is evaluated again. */
  snapshot(now: Date): LiveState[] {
    return [...this.runtimes.values()].map((r) => this.emit(r, 'availability', now));
  }
}
