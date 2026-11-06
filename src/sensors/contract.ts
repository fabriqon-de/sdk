/**
 * Sensor contract v1: catalog, model bindings and runtime state.
 * The JSON Schemas in contracts/ are the file-format authority. This module checks the same rules
 * without any runtime dependency, plus the reference and identity rules a schema cannot express.
 * No DOM and no platform globals.
 */

export const MAX_SOURCES = 64;
export const MAX_DEVICES = 2000;
export const MAX_SIGNALS = 10_000;
export const MAX_BINDINGS = 10_000;
/** Size limits before JSON parsing, in UTF-8 bytes. */
export const MAX_CATALOG_BYTES = 5 * 1024 * 1024;
export const MAX_DISCOVERY_BYTES = 256 * 1024;

/**
 * `aas-interfaces`: MQTT-Signale, die aus der Asset Interfaces Description (IDTA 02017) einer Verwaltungsschale
 * stammen. Sie haben keine Discovery-Konfiguration; Identität ist `external-id`.
 */
export type SensorSourceKind = 'mqtt-discovery' | 'aas-interfaces' | 'home-assistant' | 'csv' | 'json';
export type SensorDataType = 'number' | 'boolean' | 'string';
export type SensorStateClass = 'measurement' | 'total' | 'total_increasing';

export interface SensorSource { id: string; kind: SensorSourceKind; name: string; discoveryPrefix?: string }
export type DeviceAlias = { kind: 'identifier'; value: string } | { kind: 'connection'; type: string; value: string };
export interface SensorDevice {
  id: string; sourceId: string; externalIds: DeviceAlias[]; name: string;
  manufacturer?: string; model?: string; suggestedArea?: string; configurationUrlCandidate?: string;
}
export type Selector = { kind: 'text' } | { kind: 'json-pointer'; pointer: string };
export interface AvailabilityTopic { topic: string; online: string; offline: string }
export interface SensorAvailability { mode: 'all' | 'any' | 'latest'; topics: AvailabilityTopic[] }
export interface SensorMqtt {
  /** Pflicht bei Quellen `mqtt-discovery`, bei `aas-interfaces` nicht erlaubt. */
  discoveryTopic?: string; componentKey?: string; stateTopic: string; selector: Selector;
  booleanPayloads?: { on: string; off: string }; availability?: SensorAvailability; expireAfterSeconds?: number;
}
export interface SensorSignal {
  id: string; sourceId: string; deviceId?: string;
  identity: { kind: 'unique-id' | 'discovery-topic' | 'entity-id' | 'external-id'; component: 'sensor' | 'binary_sensor'; value: string };
  name: string; dataType: SensorDataType; unit?: string; deviceClass?: string; stateClass?: SensorStateClass;
  lifecycle: 'active' | 'removed'; staleAfterSeconds?: number; mqtt?: SensorMqtt;
}
export interface SensorCatalog {
  schemaVersion: 1; kind: 'fabriqon.sensor-catalog'; catalogId: string; revision: number; generatedAt: string;
  sources: SensorSource[]; devices: SensorDevice[]; signals: SensorSignal[];
}
export interface BindingLink { label: string; url: string }
export interface SensorBinding {
  id: string; signalId: string; assetId: string; displayName?: string; links?: { history?: BindingLink; source?: BindingLink };
}
export interface SensorBindings {
  schemaVersion: 1; kind: 'fabriqon.sensor-bindings'; catalogId: string; projectId: string; revision: number; modelRevision: number;
  bindings: SensorBinding[];
}
export interface SensorReading {
  value: number | boolean | string | null; quality: 'valid' | 'unknown' | 'invalid';
  observedAt: string | null; receivedAt: string; retained: boolean;
}
export interface SensorState {
  schemaVersion: 1; kind: 'fabriqon.sensor-state'; catalogId: string; sourceId: string; signalId: string; streamId: string;
  sequence: number; reason: 'measurement' | 'availability' | 'connection'; emittedAt: string;
  sourceConnection: 'connected' | 'disconnected' | 'unknown'; availability: 'online' | 'offline' | 'unknown';
  freshness: 'fresh' | 'stale' | 'unknown'; reading: SensorReading | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

class Fail extends Error {}
const fail = (path: string, message: string): never => { throw new Fail(`${path}: ${message}`); };

/** Control characters are checked by code, not by a regular expression. */
export function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

type Raw = Record<string, unknown>;

function strict(value: unknown, path: string, required: string[], optional: string[] = []): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'Expected an object');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return fail(path, 'Expected a plain object');
  const record = value as Raw;
  for (const key of Object.keys(record)) if (!required.includes(key) && !optional.includes(key)) fail(`${path}.${key}`, 'Unknown property');
  for (const key of required) if (!(key in record) || record[key] === undefined) fail(`${path}.${key}`, 'Required');
  return record;
}
function plain(value: unknown, path: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) return fail(path, `Expected a string of ${min}–${max} characters`);
  return value;
}
const text = (value: unknown, path: string, max: number): string => {
  const s = plain(value, path, 1, max);
  if (hasControl(s)) fail(path, 'Control characters are not allowed');
  return s;
};
const matching = (value: unknown, path: string, pattern: RegExp, message: string): string => {
  if (typeof value !== 'string' || !pattern.test(value)) return fail(path, message);
  return value;
};
const DOC_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const docId = (v: unknown, p: string) => matching(v, p, DOC_ID, 'ID of 1–128 characters from letters, digits, . _ -');
const assetRef = (v: unknown, p: string) => matching(v, p, /^[\w.-]{1,128}$/, 'Invalid asset ID');
function timestamp(value: unknown, path: string): string {
  const s = matching(value, path, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, 'Expected a UTC timestamp ending in Z');
  if (s.length > 40 || Number.isNaN(Date.parse(s))) return fail(path, 'Invalid timestamp');
  return s;
}
function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return fail(path, `Expected an integer from ${min} to ${max}`);
  return value;
}
const counter = (v: unknown, p: string) => integer(v, p, 0, Number.MAX_SAFE_INTEGER);
const seconds = (v: unknown, p: string) => integer(v, p, 1, 31_536_000);
function oneOf<const T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) return fail(path, `Expected one of ${allowed.join(', ')}`);
  return value as T;
}
function array(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) return fail(path, `Expected a list of ${min}–${max} entries`);
  return value;
}
function topic(value: unknown, path: string): string {
  const s = plain(value, path, 1, 1024);
  if (hasControl(s) || /[+#]/.test(s)) fail(path, 'Topic without control characters and wildcards (+, #)');
  return s;
}

const SENSITIVE_KEY = /(^|[-_.])(pass(word)?|pwd|secret|token|api[-_]?key|apikey|auth(orization)?|credential)s?($|[-_.])/i;
const HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;
function sensitiveKeys(part: string): boolean {
  for (const pair of part.split('&')) {
    let key = pair.split('=')[0].replace(/\+/g, ' ');
    try { key = decodeURIComponent(key); } catch { /* keep the raw key */ }
    if (key && SENSITIVE_KEY.test(key)) return true;
  }
  return false;
}
/** Confirmed links: http(s) only, no credentials in the authority, no suspicious keys in query or fragment. */
export function isHttpLink(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 2048) return false;
  const match = /^https?:\/\/([^/@\s?#]+)([/?#][^\s]*)?$/.exec(value);
  if (!match || !HOST.test(match[1])) return false;
  const rest = match[2] ?? '';
  const hash = rest.indexOf('#');
  const beforeHash = hash < 0 ? rest : rest.slice(0, hash);
  const fragment = hash < 0 ? '' : rest.slice(hash + 1);
  const query = beforeHash.indexOf('?');
  return !(query >= 0 && sensitiveKeys(beforeHash.slice(query + 1))) && !sensitiveKeys(fragment);
}
const httpUrl = (value: unknown, path: string): string => (isHttpLink(value) ? value : fail(path, 'Only an http(s) URL without credentials is allowed'));
const pointer = (v: unknown, p: string) => {
  const s = plain(v, p, 0, 512);
  return matching(s, p, /^(?:\/(?:[^~/\u0000-\u001f]|~[01])*)*$/, 'Invalid JSON pointer (RFC 6901)');
};

function source(value: unknown, path: string): SensorSource {
  const r = strict(value, path, ['id', 'kind', 'name'], ['discoveryPrefix']);
  const out: SensorSource = { id: docId(r.id, `${path}.id`), kind: oneOf(r.kind, `${path}.kind`, ['mqtt-discovery', 'aas-interfaces', 'home-assistant', 'csv', 'json']), name: text(r.name, `${path}.name`, 200) };
  if (r.discoveryPrefix !== undefined) out.discoveryPrefix = text(r.discoveryPrefix, `${path}.discoveryPrefix`, 128);
  return out;
}
function alias(value: unknown, path: string): DeviceAlias {
  if (value && typeof value === 'object' && (value as Raw).kind === 'connection') {
    const r = strict(value, path, ['kind', 'type', 'value']);
    return { kind: 'connection', type: text(r.type, `${path}.type`, 64), value: text(r.value, `${path}.value`, 512) };
  }
  const r = strict(value, path, ['kind', 'value']);
  if (r.kind !== 'identifier') fail(`${path}.kind`, 'Expected identifier or connection');
  return { kind: 'identifier', value: text(r.value, `${path}.value`, 512) };
}
function device(value: unknown, path: string): SensorDevice {
  const r = strict(value, path, ['id', 'sourceId', 'externalIds', 'name'], ['manufacturer', 'model', 'suggestedArea', 'configurationUrlCandidate']);
  const out: SensorDevice = {
    id: docId(r.id, `${path}.id`), sourceId: docId(r.sourceId, `${path}.sourceId`),
    externalIds: array(r.externalIds, `${path}.externalIds`, 1, 64).map((a, i) => alias(a, `${path}.externalIds.${i}`)), name: text(r.name, `${path}.name`, 200),
  };
  for (const key of ['manufacturer', 'model', 'suggestedArea'] as const) if (r[key] !== undefined) out[key] = text(r[key], `${path}.${key}`, 200);
  if (r.configurationUrlCandidate !== undefined) out.configurationUrlCandidate = httpUrl(r.configurationUrlCandidate, `${path}.configurationUrlCandidate`);
  return out;
}
function mqtt(value: unknown, path: string): SensorMqtt {
  const r = strict(value, path, ['stateTopic', 'selector'], ['discoveryTopic', 'componentKey', 'booleanPayloads', 'availability', 'expireAfterSeconds']);
  const sel = r.selector && typeof r.selector === 'object' ? (r.selector as Raw) : null;
  let selector: Selector;
  if (sel?.kind === 'json-pointer') {
    const s = strict(sel, `${path}.selector`, ['kind', 'pointer']);
    selector = { kind: 'json-pointer', pointer: pointer(s.pointer, `${path}.selector.pointer`) };
  } else {
    strict(r.selector, `${path}.selector`, ['kind']);
    if (sel?.kind !== 'text') fail(`${path}.selector.kind`, 'Expected text or json-pointer');
    selector = { kind: 'text' };
  }
  const out: SensorMqtt = { stateTopic: topic(r.stateTopic, `${path}.stateTopic`), selector };
  if (r.discoveryTopic !== undefined) out.discoveryTopic = topic(r.discoveryTopic, `${path}.discoveryTopic`);
  if (r.componentKey !== undefined) out.componentKey = text(r.componentKey, `${path}.componentKey`, 128);
  if (r.booleanPayloads !== undefined) {
    const b = strict(r.booleanPayloads, `${path}.booleanPayloads`, ['on', 'off']);
    out.booleanPayloads = { on: text(b.on, `${path}.booleanPayloads.on`, 128), off: text(b.off, `${path}.booleanPayloads.off`, 128) };
  }
  if (r.availability !== undefined) {
    const a = strict(r.availability, `${path}.availability`, ['mode', 'topics']);
    out.availability = {
      mode: oneOf(a.mode, `${path}.availability.mode`, ['all', 'any', 'latest']),
      topics: array(a.topics, `${path}.availability.topics`, 1, 32).map((t, i) => {
        const p = `${path}.availability.topics.${i}`;
        const e = strict(t, p, ['topic', 'online', 'offline']);
        return { topic: topic(e.topic, `${p}.topic`), online: text(e.online, `${p}.online`, 128), offline: text(e.offline, `${p}.offline`, 128) };
      }),
    };
  }
  if (r.expireAfterSeconds !== undefined) out.expireAfterSeconds = seconds(r.expireAfterSeconds, `${path}.expireAfterSeconds`);
  return out;
}
function signal(value: unknown, path: string): SensorSignal {
  const r = strict(value, path, ['id', 'sourceId', 'identity', 'name', 'dataType', 'lifecycle'], ['deviceId', 'unit', 'deviceClass', 'stateClass', 'staleAfterSeconds', 'mqtt']);
  const i = strict(r.identity, `${path}.identity`, ['kind', 'component', 'value']);
  const out: SensorSignal = {
    id: docId(r.id, `${path}.id`), sourceId: docId(r.sourceId, `${path}.sourceId`),
    identity: {
      kind: oneOf(i.kind, `${path}.identity.kind`, ['unique-id', 'discovery-topic', 'entity-id', 'external-id']),
      component: oneOf(i.component, `${path}.identity.component`, ['sensor', 'binary_sensor']), value: text(i.value, `${path}.identity.value`, 2048),
    },
    name: text(r.name, `${path}.name`, 200), dataType: oneOf(r.dataType, `${path}.dataType`, ['number', 'boolean', 'string']),
    lifecycle: oneOf(r.lifecycle, `${path}.lifecycle`, ['active', 'removed']),
  };
  if (r.deviceId !== undefined) out.deviceId = docId(r.deviceId, `${path}.deviceId`);
  if (r.unit !== undefined) out.unit = text(r.unit, `${path}.unit`, 32);
  if (r.deviceClass !== undefined) out.deviceClass = text(r.deviceClass, `${path}.deviceClass`, 64);
  if (r.stateClass !== undefined) out.stateClass = oneOf(r.stateClass, `${path}.stateClass`, ['measurement', 'total', 'total_increasing']);
  if (r.staleAfterSeconds !== undefined) out.staleAfterSeconds = seconds(r.staleAfterSeconds, `${path}.staleAfterSeconds`);
  if (r.mqtt !== undefined) out.mqtt = mqtt(r.mqtt, `${path}.mqtt`);
  if (out.dataType !== 'number' && (out.unit !== undefined || out.stateClass !== undefined)) fail(path, 'Unit and stateClass are only allowed for numbers');
  return out;
}
function link(value: unknown, path: string): BindingLink {
  const r = strict(value, path, ['label', 'url']);
  return { label: text(r.label, `${path}.label`, 80), url: httpUrl(r.url, `${path}.url`) };
}

function catalogShape(value: unknown): SensorCatalog {
  const r = strict(value, 'catalog', ['schemaVersion', 'kind', 'catalogId', 'revision', 'generatedAt', 'sources', 'devices', 'signals']);
  if (r.schemaVersion !== 1) fail('catalog.schemaVersion', 'Expected 1');
  if (r.kind !== 'fabriqon.sensor-catalog') fail('catalog.kind', 'Expected fabriqon.sensor-catalog');
  return {
    schemaVersion: 1, kind: 'fabriqon.sensor-catalog', catalogId: docId(r.catalogId, 'catalog.catalogId'), revision: counter(r.revision, 'catalog.revision'),
    generatedAt: timestamp(r.generatedAt, 'catalog.generatedAt'),
    sources: array(r.sources, 'catalog.sources', 1, MAX_SOURCES).map((s, i) => source(s, `catalog.sources.${i}`)),
    devices: array(r.devices, 'catalog.devices', 0, MAX_DEVICES).map((d, i) => device(d, `catalog.devices.${i}`)),
    signals: array(r.signals, 'catalog.signals', 0, MAX_SIGNALS).map((s, i) => signal(s, `catalog.signals.${i}`)),
  };
}
function bindingsShape(value: unknown): SensorBindings {
  const r = strict(value, 'bindings', ['schemaVersion', 'kind', 'catalogId', 'projectId', 'revision', 'modelRevision', 'bindings']);
  if (r.schemaVersion !== 1) fail('bindings.schemaVersion', 'Expected 1');
  if (r.kind !== 'fabriqon.sensor-bindings') fail('bindings.kind', 'Expected fabriqon.sensor-bindings');
  return {
    schemaVersion: 1, kind: 'fabriqon.sensor-bindings', catalogId: docId(r.catalogId, 'bindings.catalogId'), projectId: docId(r.projectId, 'bindings.projectId'),
    revision: counter(r.revision, 'bindings.revision'), modelRevision: counter(r.modelRevision, 'bindings.modelRevision'),
    bindings: array(r.bindings, 'bindings.bindings', 0, MAX_BINDINGS).map((b, i) => {
      const p = `bindings.bindings.${i}`;
      const e = strict(b, p, ['id', 'signalId', 'assetId'], ['displayName', 'links']);
      const out: SensorBinding = { id: docId(e.id, `${p}.id`), signalId: docId(e.signalId, `${p}.signalId`), assetId: assetRef(e.assetId, `${p}.assetId`) };
      if (e.displayName !== undefined) out.displayName = text(e.displayName, `${p}.displayName`, 200);
      if (e.links !== undefined) {
        const l = strict(e.links, `${p}.links`, [], ['history', 'source']);
        out.links = {};
        if (l.history !== undefined) out.links.history = link(l.history, `${p}.links.history`);
        if (l.source !== undefined) out.links.source = link(l.source, `${p}.links.source`);
      }
      return out;
    }),
  };
}
function stateShape(value: unknown): SensorState {
  const r = strict(value, 'state', ['schemaVersion', 'kind', 'catalogId', 'sourceId', 'signalId', 'streamId', 'sequence', 'reason', 'emittedAt', 'sourceConnection', 'availability', 'freshness', 'reading']);
  if (r.schemaVersion !== 1) fail('state.schemaVersion', 'Expected 1');
  if (r.kind !== 'fabriqon.sensor-state') fail('state.kind', 'Expected fabriqon.sensor-state');
  let reading: SensorReading | null = null;
  if (r.reading !== null) {
    const e = strict(r.reading, 'state.reading', ['value', 'quality', 'observedAt', 'receivedAt', 'retained']);
    const v = e.value;
    if (!(v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 1024))) fail('state.reading.value', 'Expected a number, boolean, string up to 1024 characters or null');
    if (typeof e.retained !== 'boolean') fail('state.reading.retained', 'Expected a boolean');
    const parsed: SensorReading = {
      value: v as SensorReading['value'], quality: oneOf(e.quality, 'state.reading.quality', ['valid', 'unknown', 'invalid']),
      observedAt: e.observedAt === null ? null : timestamp(e.observedAt, 'state.reading.observedAt'), receivedAt: timestamp(e.receivedAt, 'state.reading.receivedAt'), retained: e.retained as boolean,
    };
    if (parsed.quality === 'valid' ? parsed.value === null : parsed.value !== null) fail('state.reading', 'quality = valid needs a value, otherwise value must be null');
    reading = parsed;
  }
  return {
    schemaVersion: 1, kind: 'fabriqon.sensor-state', catalogId: docId(r.catalogId, 'state.catalogId'), sourceId: docId(r.sourceId, 'state.sourceId'),
    signalId: docId(r.signalId, 'state.signalId'), streamId: docId(r.streamId, 'state.streamId'), sequence: counter(r.sequence, 'state.sequence'),
    reason: oneOf(r.reason, 'state.reason', ['measurement', 'availability', 'connection']), emittedAt: timestamp(r.emittedAt, 'state.emittedAt'),
    sourceConnection: oneOf(r.sourceConnection, 'state.sourceConnection', ['connected', 'disconnected', 'unknown']),
    availability: oneOf(r.availability, 'state.availability', ['online', 'offline', 'unknown']), freshness: oneOf(r.freshness, 'state.freshness', ['fresh', 'stale', 'unknown']), reading,
  };
}

/**
 * ID der vom Betreiber freigegebenen Quelle (Verbindung), über die eine Katalogquelle läuft. Bei `aas-interfaces`
 * heißt die Katalogquelle `aas.<Betreiberquelle>`, damit dieselbe Verbindung neben einer Discovery-Quelle im selben Katalog
 * stehen kann (Quellen-IDs sind im Katalog eindeutig). Alle anderen Quellen nutzen ihre eigene ID.
 */
export const operatorSourceId = (source: Pick<SensorSource, 'id' | 'kind'>): string => (source.kind === 'aas-interfaces' ? source.id.slice('aas.'.length) : source.id);

const duplicates = (values: string[]) => new Set(values).size !== values.length;
export const deviceAliasKey = (sourceId: string, a: DeviceAlias) => JSON.stringify([sourceId, a.kind, a.kind === 'connection' ? a.type : null, a.value]);
export const signalIdentityKey = (s: Pick<SensorSignal, 'sourceId' | 'identity'>) => JSON.stringify([s.sourceId, s.identity.component, s.identity.kind, s.identity.value]);

/** Reference, identity and transport rules that a schema alone does not express. */
function checkCatalog(catalog: SensorCatalog): string | null {
  if (duplicates(catalog.sources.map((s) => s.id))) return 'Duplicate source ID';
  for (const s of catalog.sources) if (s.kind === 'aas-interfaces' && !/^aas\.[A-Za-z0-9][A-Za-z0-9._-]{0,123}$/.test(s.id)) return `Source ${s.id}: an aas-interfaces source ID must be "aas." followed by the operator source ID`;
  if (duplicates(catalog.devices.map((d) => d.id))) return 'Duplicate device ID';
  if (duplicates(catalog.signals.map((s) => s.id))) return 'Duplicate signal ID';
  const sources = new Map(catalog.sources.map((s) => [s.id, s]));
  const devices = new Map(catalog.devices.map((d) => [d.id, d]));
  const aliases: string[] = [];
  for (const d of catalog.devices) {
    if (!sources.has(d.sourceId)) return `Device ${d.id}: unknown source`;
    for (const a of d.externalIds) aliases.push(deviceAliasKey(d.sourceId, a));
  }
  if (duplicates(aliases)) return 'Duplicate device alias within a source';
  const identities: string[] = [];
  for (const s of catalog.signals) {
    const src = sources.get(s.sourceId);
    if (!src) return `Signal ${s.id}: unknown source`;
    identities.push(signalIdentityKey(s));
    if (s.deviceId && devices.get(s.deviceId)?.sourceId !== s.sourceId) return `Signal ${s.id}: device belongs to another or unknown source`;
    const mqttSource = src.kind === 'mqtt-discovery' || src.kind === 'aas-interfaces';
    if (mqttSource !== !!s.mqtt) return `Signal ${s.id}: MQTT binding does not match the source`;
    const m = s.mqtt;
    if (!m) continue;
    if (src.kind === 'aas-interfaces') {
      if (m.discoveryTopic !== undefined || m.componentKey !== undefined) return `Signal ${s.id}: an interface signal has no discovery configuration`;
      if (s.identity.kind !== 'external-id') return `Signal ${s.id}: an interface signal needs an external-id identity`;
    } else {
      if (!['unique-id', 'discovery-topic'].includes(s.identity.kind)) return `Signal ${s.id}: invalid MQTT identity`;
      const prefix = src.discoveryPrefix;
      if (!prefix || /[+#]/.test(prefix) || hasControl(prefix) || prefix.endsWith('/')) return `Source ${src.id}: discovery prefix missing or invalid`;
      if (m.discoveryTopic === undefined) return `Signal ${s.id}: discovery topic missing`;
      if (!m.discoveryTopic.startsWith(`${prefix}/`)) return `Signal ${s.id}: discovery topic outside the prefix`;
      const parts = m.discoveryTopic.slice(prefix.length + 1).split('/');
      if (![3, 4].includes(parts.length) || parts[parts.length - 1] !== 'config' || !parts.every(Boolean)) return `Signal ${s.id}: invalid discovery topic`;
      if (parts[0] === 'device') {
        if (!m.componentKey) return `Signal ${s.id}: device discovery needs a componentKey`;
      } else if (parts[0] !== s.identity.component || m.componentKey) return `Signal ${s.id}: component does not match the discovery topic`;
      if (s.identity.kind === 'discovery-topic' && s.identity.value !== JSON.stringify([m.discoveryTopic, m.componentKey ?? null])) return `Signal ${s.id}: fallback identity is not canonical`;
    }
    const binary = s.identity.component === 'binary_sensor';
    if (binary !== (s.dataType === 'boolean')) return `Signal ${s.id}: component and value type do not match`;
    if (binary !== !!m.booleanPayloads) return `Signal ${s.id}: binary payload mapping missing or unexpected`;
    if (m.booleanPayloads && m.booleanPayloads.on === m.booleanPayloads.off) return `Signal ${s.id}: ambiguous binary payloads`;
    if (m.availability) {
      if (duplicates(m.availability.topics.map((t) => t.topic))) return `Signal ${s.id}: duplicate availability topic`;
      if (m.availability.topics.some((t) => t.online === t.offline)) return `Signal ${s.id}: ambiguous availability payloads`;
    }
  }
  if (duplicates(identities)) return 'Duplicate external signal identity';
  return null;
}

function run<T>(parse: () => T, check: (value: T) => string | null): Parsed<T> {
  try {
    const value = parse();
    const problem = check(value);
    return problem ? { ok: false, error: problem } : { ok: true, value };
  } catch (error) {
    if (error instanceof Fail) return { ok: false, error: error.message };
    throw error;
  }
}

/** Never throws for invalid input; returns the first problem found. */
export const parseSensorCatalog = (value: unknown): Parsed<SensorCatalog> => run(() => catalogShape(value), checkCatalog);
/** A single signal, for example before it is added to a catalog. */
export const parseSensorSignal = (value: unknown): Parsed<SensorSignal> => run(() => signal(value, 'signal'), () => null);

export function parseSensorBindings(value: unknown, catalog: SensorCatalog, assetIds: Iterable<string>): Parsed<SensorBindings> {
  return run(() => bindingsShape(value), (doc) => {
    if (doc.catalogId !== catalog.catalogId) return 'Bindings belong to another catalog';
    if (duplicates(doc.bindings.map((b) => b.id))) return 'Duplicate binding ID';
    if (duplicates(doc.bindings.map((b) => b.signalId))) return 'A signal is assigned to more than one asset';
    const signals = new Set(catalog.signals.map((s) => s.id));
    const assets = new Set(assetIds);
    for (const b of doc.bindings) {
      if (!signals.has(b.signalId)) return `Binding ${b.id}: unknown signal`;
      if (!assets.has(b.assetId)) return `Binding ${b.id}: unknown asset in the model`;
    }
    return null;
  });
}

export function parseSensorState(value: unknown, catalog: SensorCatalog): Parsed<SensorState> {
  return run(() => stateShape(value), (state) => {
    const s = catalog.signals.find((x) => x.id === state.signalId);
    if (state.catalogId !== catalog.catalogId || s?.sourceId !== state.sourceId) return 'State does not match catalog or source';
    if (s.lifecycle !== 'active') return 'A removed signal has no active runtime state';
    if (state.reading?.quality === 'valid' && typeof state.reading.value !== s.dataType) return 'State value type does not match the signal';
    if (state.freshness === 'fresh') {
      if (state.sourceConnection !== 'connected' || state.availability !== 'online' || state.reading?.quality !== 'valid') return 'Invalid freshness claim';
      if (state.reading.retained && state.reading.observedAt === null) return 'A retained value without a measurement time is not fresh';
    }
    if (state.reading && Date.parse(state.reading.receivedAt) > Date.parse(state.emittedAt)) return 'Reading was received after the state was emitted';
    return null;
  });
}
