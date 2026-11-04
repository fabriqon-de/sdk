import { MAX_DISCOVERY_BYTES, type SensorSignal, type SensorState } from './contract.js';
import { parseStrictJson } from './strictJson.js';

/**
 * Decoding of raw messages and evaluation of connection, availability and freshness.
 * Pure functions without a network: an adapter delivers messages and time, this module judges them.
 */

export type DecodedValue = number | boolean | string | null;
export interface Decoded { value: DecodedValue; quality: 'valid' | 'invalid' }

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** RFC 6901 on own properties only, never through the prototype chain. */
export function resolvePointer(doc: unknown, pointer: string): { found: true; value: unknown } | { found: false } {
  if (pointer === '') return { found: true, value: doc };
  let current: unknown = doc;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(key)) return { found: false };
      const index = Number(key);
      if (index >= current.length) return { found: false };
      current = current[index];
    } else if (current !== null && typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, key)) return { found: false };
      current = (current as Record<string, unknown>)[key];
    } else return { found: false };
  }
  return { found: true, value: current };
}

const INVALID: Decoded = { value: null, quality: 'invalid' };

/**
 * Value of a message for a signal. A value that does not fit gives quality = invalid and value = null.
 * No unit conversion and no JavaScript truthiness: booleans are recognised only through the two payloads.
 */
export function decodeReading(signal: SensorSignal, payload: string): Decoded {
  const mqtt = signal.mqtt;
  if (!mqtt) return INVALID;
  let leaf: unknown;
  if (mqtt.selector.kind === 'text') leaf = payload;
  else {
    const parsed = parseStrictJson(payload, MAX_DISCOVERY_BYTES);
    if (!parsed.ok) return INVALID;
    const found = resolvePointer(parsed.value, mqtt.selector.pointer);
    if (!found.found) return INVALID;
    leaf = found.value;
  }
  if (signal.dataType === 'number') {
    if (typeof leaf === 'number') return Number.isFinite(leaf) ? { value: leaf, quality: 'valid' } : INVALID;
    if (typeof leaf !== 'string') return INVALID;
    const trimmed = leaf.trim();
    if (!NUMBER.test(trimmed)) return INVALID;
    const n = Number(trimmed);
    return Number.isFinite(n) ? { value: n, quality: 'valid' } : INVALID;
  }
  if (signal.dataType === 'boolean') {
    const payloads = mqtt.booleanPayloads;
    if (!payloads) return INVALID;
    const candidate = typeof leaf === 'string' ? leaf : typeof leaf === 'boolean' || typeof leaf === 'number' ? String(leaf) : null;
    if (candidate === payloads.on) return { value: true, quality: 'valid' };
    if (candidate === payloads.off) return { value: false, quality: 'valid' };
    return INVALID;
  }
  if (typeof leaf === 'string' && leaf.length <= 1024) return { value: leaf, quality: 'valid' };
  return INVALID;
}

export type Availability = SensorState['availability'];
export type Connection = SensorState['sourceConnection'];
export type Freshness = SensorState['freshness'];
export type AvailabilityConfig = NonNullable<NonNullable<SensorSignal['mqtt']>['availability']>;

export interface TopicAvailability {
  state: Availability;
  /** Receive time as ISO string. Decides for mode = latest. */
  at: string;
}

export function aggregateAvailability(config: AvailabilityConfig, states: Record<string, TopicAvailability | undefined>): Availability {
  const known = config.topics.map((t) => states[t.topic]);
  if (config.mode === 'latest') {
    let latest: TopicAvailability | undefined;
    for (const s of known) if (s && (!latest || Date.parse(s.at) > Date.parse(latest.at))) latest = s;
    return latest?.state ?? 'unknown';
  }
  const values = known.map((s) => s?.state ?? 'unknown');
  if (config.mode === 'all') {
    if (values.includes('offline')) return 'offline';
    return values.every((v) => v === 'online') ? 'online' : 'unknown';
  }
  if (values.includes('online')) return 'online';
  return values.every((v) => v === 'offline') ? 'offline' : 'unknown';
}

/** Translates an availability message through the configured payloads. An unknown payload gives unknown. */
export function decodeAvailability(config: AvailabilityConfig, topicName: string, payload: string): Availability {
  const entry = config.topics.find((t) => t.topic === topicName);
  if (!entry) return 'unknown';
  if (payload === entry.online) return 'online';
  if (payload === entry.offline) return 'offline';
  return 'unknown';
}

export interface StoredReading {
  value: DecodedValue;
  quality: 'valid' | 'unknown' | 'invalid';
  observedAt: string | null;
  receivedAt: string;
  retained: boolean;
}

export interface RuntimeInput {
  signal: SensorSignal;
  now: Date;
  connection: Connection;
  availabilityTopics: Record<string, TopicAvailability | undefined>;
  reading: StoredReading | null;
  /** The broker refused the subscription of the state topic (for example through an ACL). */
  denied?: boolean;
}

/** Stable reason codes. A UI maps them to its own language. */
export type RuntimeReason =
  | 'denied'
  | 'no-reading'
  | 'expired'
  | 'disconnected'
  | 'invalid-reading'
  | 'observed-time-unknown'
  | 'stale'
  | 'offline'
  | 'connection-unknown'
  | 'availability-unknown';

export interface RuntimeView {
  sourceConnection: Connection;
  availability: Availability;
  freshness: Freshness;
  /** Reason code, null for a fresh value. */
  reason: RuntimeReason | null;
  /** Age in seconds, null when the measurement age is unknown. */
  ageSeconds: number | null;
}

/**
 * Evaluation without invented deadlines:
 * - Without an availability profile, "online" only follows a real, valid live measurement (not retained).
 * - A lost connection makes known values stale. It never produces 0 or false.
 * - expireAfterSeconds of the source: expired = stale and offline.
 * - staleAfterSeconds (local) warns earlier without claiming "offline".
 * - A retained value without a known measurement time is never fresh.
 */
export function evaluateRuntime(input: RuntimeInput): RuntimeView {
  const { signal, now, connection, reading } = input;
  if (input.denied) return { sourceConnection: connection, availability: 'unknown', freshness: 'unknown', reason: 'denied', ageSeconds: null };
  const nowMs = now.getTime();
  const config = signal.mqtt?.availability;
  let availability: Availability = config
    ? aggregateAvailability(config, input.availabilityTopics)
    : reading && !reading.retained && reading.quality === 'valid'
      ? 'online'
      : 'unknown';

  const base = (freshness: Freshness, reason: RuntimeReason | null, ageSeconds: number | null): RuntimeView => ({ sourceConnection: connection, availability, freshness, reason, ageSeconds });
  if (!reading) return base('unknown', 'no-reading', null);

  const measuredAt = reading.observedAt ?? (reading.retained ? null : reading.receivedAt);
  const age = measuredAt === null ? null : Math.max(0, Math.round((nowMs - Date.parse(measuredAt)) / 1000));
  const sinceReceive = Math.max(0, (nowMs - Date.parse(reading.receivedAt)) / 1000);

  const expire = signal.mqtt?.expireAfterSeconds;
  if (expire !== undefined && sinceReceive > expire) {
    availability = 'offline';
    return base('stale', 'expired', age);
  }
  if (connection === 'disconnected') return base('stale', 'disconnected', age);
  if (reading.quality !== 'valid') return base('unknown', 'invalid-reading', age);
  if (reading.retained && reading.observedAt === null) return base('unknown', 'observed-time-unknown', null);
  if (signal.staleAfterSeconds !== undefined && age !== null && age > signal.staleAfterSeconds) return base('stale', 'stale', age);
  if (availability === 'offline') return base('stale', 'offline', age);
  if (connection === 'connected' && availability === 'online') return base('fresh', null, age);
  return base('unknown', connection === 'unknown' ? 'connection-unknown' : 'availability-unknown', age);
}
