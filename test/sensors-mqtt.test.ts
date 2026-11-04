import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MqttSourceLink, attachConnector, type MqttClientLike } from '../src/sensors/mqtt.js';
import type { LiveState, SensorCatalog } from '../src/sensors/index.js';

const catalog: SensorCatalog = JSON.parse(readFileSync(new URL('../examples/sensors/catalog.json', import.meta.url), 'utf8'));

type Listener = (...args: unknown[]) => void;
class FakeClient implements MqttClientLike {
  connected = false;
  ended = false;
  subscriptions: string[][] = [];
  unsubscribed: string[][] = [];
  /** Granted codes per topic, default 0. A code of 128 or higher is a refusal. */
  codes = new Map<string, number>();
  /** Report the codes through the packet (mqtt.js style) instead of the granted list. */
  viaPacket = true;
  private readonly listeners = new Map<string, Set<Listener>>();
  on(event: string, listener: Listener) { (this.listeners.get(event) ?? this.listeners.set(event, new Set()).get(event)!).add(listener); return this; }
  off(event: string, listener: Listener) { this.listeners.get(event)?.delete(listener); return this; }
  emit(event: string, ...args: unknown[]) { for (const l of [...(this.listeners.get(event) ?? [])]) l(...args); }
  subscribe(topics: string[], _o: { qos: 0 }, callback?: (e: Error | null, granted?: unknown, packet?: unknown) => void) {
    this.subscriptions.push(topics);
    const codes = topics.map((t) => this.codes.get(t) ?? 0);
    if (this.viaPacket) callback?.(codes.some((c) => c >= 128) ? new Error('refused') : null, undefined, { granted: codes });
    else callback?.(null, topics.map((t, i) => ({ topic: t, qos: codes[i] })), undefined);
  }
  unsubscribe(topics: string[]) { this.unsubscribed.push(topics); }
  end() { this.ended = true; this.connected = false; }
  up() { this.connected = true; this.emit('connect'); }
  down() { this.connected = false; this.emit('close'); }
  message(topic: string, payload: string | Uint8Array, retain = false) { this.emit('message', topic, payload, { retain }); }
}

const options = { id: 'mqtt-home', allowedTopicPrefixes: ['lab'], discoveryPrefix: 'homeassistant' };
let client: FakeClient;
let clock = 1_000_000;
const make = (over = {}) => new MqttSourceLink({ ...options, now: () => clock, ...over }, () => (client = new FakeClient()));

beforeEach(() => { client = new FakeClient(); clock = 1_000_000; });
afterEach(() => vi.useRealTimers());

describe('MqttSourceLink', () => {
  it('refuses wildcards and topics outside the approval before it connects', () => {
    let connects = 0;
    const link = new MqttSourceLink(options, () => { connects++; return new FakeClient(); });
    for (const topic of ['lab/#', 'lab/+/x', 'laboratory/x', 'other/x', '', 'lab/\u0000']) expect(() => link.acquire([topic])).toThrow(/not approved/);
    expect(connects).toBe(0);
  });

  it('subscribes after connect, subscribes again after a new session and reference counts', () => {
    const link = make();
    const a = link.acquire(['lab/a', 'lab/b']);
    expect(client.subscriptions).toEqual([]);
    client.up();
    expect(client.subscriptions).toEqual([['lab/a', 'lab/b']]);
    const b = link.acquire(['lab/b', 'lab/c']);
    expect(client.subscriptions.at(-1)).toEqual(['lab/c']);
    a();
    expect(client.unsubscribed).toEqual([['lab/a']]);
    client.down();
    client.up();
    expect(client.subscriptions.at(-1)?.sort()).toEqual(['lab/b', 'lab/c']);
    b();
    b();
    expect(client.unsubscribed.at(-1)?.sort()).toEqual(['lab/b', 'lab/c']);
  });

  it.each([true, false])('reports refused subscriptions (codes from packet: %s) and their end', (viaPacket) => {
    const link = make();
    client = new FakeClient();
    const events: [string, boolean][] = [];
    link.onDenied((t, d) => events.push([t, d]));
    const fresh = new FakeClient();
    fresh.viaPacket = viaPacket;
    fresh.codes.set('lab/blocked', 135);
    const l = new MqttSourceLink(options, () => fresh);
    l.onDenied((t, d) => events.push([t, d]));
    l.acquire(['lab/ok', 'lab/blocked']);
    fresh.up();
    expect(events).toEqual([['lab/blocked', true]]);
    fresh.codes.delete('lab/blocked');
    fresh.down();
    fresh.up();
    expect(events).toEqual([['lab/blocked', true], ['lab/blocked', false]]);
  });

  it('delivers messages for subscribed topics only, decodes bytes and keeps the retained flag', () => {
    const link = make();
    const seen: [string, string, boolean][] = [];
    link.onMessage((t, p, r) => seen.push([t, p, r]));
    link.acquire(['lab/a']);
    client.up();
    client.message('lab/a', new TextEncoder().encode('äö'), true);
    client.message('lab/other', 'x');
    client.message('lab/a', '21.5');
    expect(seen).toEqual([['lab/a', 'äö', true], ['lab/a', '21.5', false]]);
  });

  it('drops oversized messages and the surplus above the rate limit', () => {
    const link = make({ maxMessagesPerSecond: 2, maxPayloadBytes: 8 });
    const seen: string[] = [];
    link.onMessage((_t, p) => seen.push(p));
    link.acquire(['lab/a']);
    client.up();
    client.message('lab/a', '123456789');
    client.message('lab/a', '1');
    client.message('lab/a', '2');
    client.message('lab/a', '3');
    expect(seen).toEqual(['1', '2']);
    clock += 1000;
    client.message('lab/a', '4');
    expect(seen).toEqual(['1', '2', '4']);
  });

  it('replays the last message with its original receive time to a later consumer', () => {
    const link = make();
    link.acquire(['lab/a']);
    client.up();
    client.message('lab/a', 'first', true);
    clock += 5000;
    client.message('lab/a', 'second');
    const replayed: [string, string, boolean, number][] = [];
    link.replay(['lab/a', 'lab/none'], (t, p, r, at) => replayed.push([t, p, r, at.getTime()]));
    expect(replayed).toEqual([['lab/a', 'second', false, 1_005_000]]);
  });

  it('reports status to late listeners and errors only as a code', () => {
    const errors: string[] = [];
    const link = make({ onError: (c: string) => errors.push(c) });
    link.acquire(['lab/a']);
    client.up();
    const statuses: string[] = [];
    link.onConnection((s) => statuses.push(s));
    client.down();
    client.emit('error', Object.assign(new Error('mqtts://user:secret@host failed'), { code: 'ECONNREFUSED' }));
    expect(statuses).toEqual(['connected', 'disconnected']);
    expect(errors).toEqual(['ECONNREFUSED']);
  });

  it('closes after the idle time and reconnects with the next subscription', () => {
    vi.useFakeTimers();
    const link = make({ idleMs: 1000 });
    const release = link.acquire(['lab/a']);
    const first = client;
    first.up();
    release();
    vi.advanceTimersByTime(999);
    expect(first.ended).toBe(false);
    vi.advanceTimersByTime(2);
    expect(first.ended).toBe(true);
    expect(link.getStatus()).toBe('unknown');
    link.acquire(['lab/a']);
    expect(client).not.toBe(first);
  });

  it('scans only the two discovery patterns, within limits, and rejects parallel scans', async () => {
    vi.useFakeTimers();
    const link = make();
    const first = link.scanDiscovery({ durationMs: 1000, maxMessages: 2, maxBytes: 1000 });
    const parallel = await link.scanDiscovery({ durationMs: 1, maxMessages: 1, maxBytes: 1 });
    expect(parallel.ok).toBe(false);
    client.up();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.subscriptions).toEqual([['homeassistant/+/+/config', 'homeassistant/+/+/+/config']]);
    client.message('homeassistant/sensor/a/b/config', '{"a":1}');
    client.message('homeassistant/device/x/config', '{"b":1}');
    client.message('homeassistant/sensor/c/d/config', '{"c":1}');
    client.message('lab/not-discovery/config', 'x');
    client.message('homeassistant/a/b/c/d/e/config', 'x');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await first;
    expect(result).toEqual({ ok: true, messages: [{ topic: 'homeassistant/sensor/a/b/config', payload: '{"a":1}' }, { topic: 'homeassistant/device/x/config', payload: '{"b":1}' }] });
    expect(client.unsubscribed.at(-1)).toEqual(['homeassistant/+/+/config', 'homeassistant/+/+/+/config']);
    expect((await new MqttSourceLink({ id: 'x', allowedTopicPrefixes: ['lab'] }, () => new FakeClient()).scanDiscovery({ durationMs: 1, maxMessages: 1, maxBytes: 1 })).ok).toBe(false);
  });
});

describe('attachConnector', () => {
  it('turns broker messages into contract states and tears down cleanly', () => {
    const link = make();
    const out: LiveState[] = [];
    const attached = attachConnector(link, catalog, (states) => out.push(...states), () => new Date('2026-01-01T00:00:10Z'));
    expect(attached.connector.plan.topics).toEqual(['lab/door-01/contact', 'lab/env-01/availability', 'lab/env-01/state']);
    client.up();
    client.message('lab/env-01/availability', 'online');
    client.message('lab/env-01/state', '{"temperature":22.4,"humidity":47.2}');
    client.message('lab/door-01/contact', 'OPEN');
    const temperature = out.filter((l) => l.state.signalId === 'signal.temperature').at(-1)!;
    expect(temperature.state).toMatchObject({ freshness: 'fresh', availability: 'online', sourceConnection: 'connected', reading: { value: 22.4, retained: false } });
    expect(out.filter((l) => l.state.signalId === 'signal.door').at(-1)!.state.reading).toMatchObject({ value: true });
    const count = out.length;
    attached.detach();
    attached.detach();
    client.message('lab/env-01/state', '{"temperature":30}');
    expect(out.length).toBe(count);
    expect(client.unsubscribed.flat().sort()).toEqual(['lab/door-01/contact', 'lab/env-01/availability', 'lab/env-01/state']);
  });

  it('shows the cached value to a second catalog consumer', () => {
    const link = make();
    const first: LiveState[] = [];
    attachConnector(link, catalog, (s) => first.push(...s), () => new Date('2026-01-01T00:00:10Z'));
    client.up();
    client.message('lab/env-01/state', '{"temperature":21}', true);
    const second: LiveState[] = [];
    attachConnector(link, catalog, (s) => second.push(...s), () => new Date('2026-01-01T00:00:20Z'));
    const replayed = second.find((l) => l.state.signalId === 'signal.temperature' && l.state.reason === 'measurement')!;
    expect(replayed.state.reading).toMatchObject({ value: 21, retained: true, receivedAt: new Date(1_000_000).toISOString() });
    expect(replayed.state.freshness).not.toBe('fresh');
  });

  it('subscribes nothing outside the approval, even for a hostile catalog', () => {
    const link = new MqttSourceLink({ ...options, allowedTopicPrefixes: ['zigbee'] }, () => (client = new FakeClient()));
    const attached = attachConnector(link, catalog, () => {});
    expect(attached.connector.plan.topics).toEqual([]);
    expect(attached.connector.plan.rejected.length).toBe(3);
    expect(client.subscriptions).toEqual([]);
  });
});
