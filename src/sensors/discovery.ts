import {
  MAX_DISCOVERY_BYTES,
  deviceAliasKey,
  isHttpLink,
  parseSensorCatalog,
  parseSensorSignal,
  signalIdentityKey,
  type Parsed,
  type SensorCatalog,
  type SensorDevice,
  type SensorMqtt,
  type SensorSignal,
  type SensorSource,
} from './contract.js';
import { parseStrictJson } from './strictJson.js';

/**
 * MQTT discovery profile v1 (Home Assistant discovery, sensor and binary_sensor only).
 * Nothing is connected and nothing is subscribed. The functions normalise discovery messages
 * to candidates, compare them with the existing catalog (preview) and adopt only explicitly
 * chosen entries. A configuration that is not understood is reported as unsupported and is
 * never interpreted differently by leaving parts out.
 */

export interface DiscoveryMessage {
  topic: string;
  /** Raw payload as text. An empty payload means removal. */
  payload: string;
}

type Obj = Record<string, unknown>;

export interface CandidateDevice {
  aliases: SensorDevice['externalIds'];
  name: string;
  manufacturer?: string;
  model?: string;
  suggestedArea?: string;
  configurationUrlCandidate?: string;
}

export interface Candidate {
  /** Unique key within a source: JSON tuple of the external identity. */
  key: string;
  identity: SensorSignal['identity'];
  /** true without a unique_id (fallback identity from the discovery topic). */
  weak: boolean;
  discoveryTopic: string;
  componentKey?: string;
  name: string;
  dataType: SensorSignal['dataType'];
  unit?: string;
  deviceClass?: string;
  stateClass?: SensorSignal['stateClass'];
  mqtt: Omit<SensorMqtt, 'discoveryTopic' | 'componentKey'>;
  device?: CandidateDevice;
  warnings: string[];
}

export interface Unsupported {
  topic: string;
  componentKey?: string;
  name?: string;
  reason: string;
}

export interface Removal {
  topic: string;
  componentKey?: string;
}

export interface DiscoveryScan {
  candidates: Candidate[];
  removals: Removal[];
  unsupported: Unsupported[];
  ignored: { topic: string; reason: string }[];
  errors: { topic: string; error: string }[];
}

const MAX_LISTED = 200;
const SUPPORTED = ['sensor', 'binary_sensor'] as const;
type Component = (typeof SUPPORTED)[number];

const ABBREVIATIONS: Record<string, string> = {
  avty: 'availability',
  avty_mode: 'availability_mode',
  avty_t: 'availability_topic',
  avty_tpl: 'availability_template',
  cmps: 'components',
  dev: 'device',
  dev_cla: 'device_class',
  exp_aft: 'expire_after',
  o: 'origin',
  p: 'platform',
  pl_avail: 'payload_available',
  pl_not_avail: 'payload_not_available',
  pl_off: 'payload_off',
  pl_on: 'payload_on',
  stat_cla: 'state_class',
  stat_t: 'state_topic',
  uniq_id: 'unique_id',
  unit_of_meas: 'unit_of_measurement',
  val_tpl: 'value_template',
};
const DEVICE_ABBREVIATIONS: Record<string, string> = {
  ids: 'identifiers',
  cns: 'connections',
  mf: 'manufacturer',
  mdl: 'model',
  sa: 'suggested_area',
  cu: 'configuration_url',
};

class Conflict extends Error {}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Resolve short forms to long forms. Contradicting duplicates are an error. */
function longForm(source: Obj, map: Record<string, string>): Obj {
  const out: Obj = {};
  for (const [key, value] of Object.entries(source)) {
    const target = map[key] ?? key;
    if (target in out && JSON.stringify(out[target]) !== JSON.stringify(value)) throw new Conflict(`Contradicting values for ${target}`);
    out[target] = value;
  }
  return out;
}

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code > 0x1f && code !== 0x7f) out += ch;
  }
  out = out.trim().slice(0, max);
  return out.length ? out : undefined;
}

function expandTopic(value: string, base: string | undefined): string {
  if (base === undefined) return value;
  if (value.startsWith('~')) return base + value.slice(1);
  if (value.endsWith('~')) return value.slice(0, -1) + base;
  return value;
}

const validTopic = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 1024 && !/[\u0000-\u001f\u007f+#]/.test(v);

/** Translates only the simple forms {{ value }} and {{ value_json.path }}. Anything else is unsupported (null). */
export function translateTemplate(template: string): SensorMqtt['selector'] | null {
  const t = template.trim();
  if (/^\{\{\s*value\s*\}\}$/.test(t)) return { kind: 'text' };
  const m = /^\{\{\s*value_json((?:\.[A-Za-z_][A-Za-z0-9_]*|\[\s*(?:'[^']*'|"[^"]*"|\d+)\s*\])+)\s*\}\}$/.exec(t);
  if (!m) return null;
  const segments: string[] = [];
  const part = /\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*(?:'([^']*)'|"([^"]*)"|(\d+))\s*\]/g;
  let match: RegExpExecArray | null;
  while ((match = part.exec(m[1])) !== null) segments.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  const pointer = segments.map((s) => '/' + s.replace(/~/g, '~0').replace(/\//g, '~1')).join('');
  return pointer.length <= 512 ? { kind: 'json-pointer', pointer } : null;
}

function parseLocator(topic: string, prefix: string): { kind: string; segments: number } | null {
  if (!topic.startsWith(`${prefix}/`)) return null;
  const parts = topic.slice(prefix.length + 1).split('/');
  if (![3, 4].includes(parts.length) || parts[parts.length - 1] !== 'config' || !parts.every(Boolean)) return null;
  return { kind: parts[0], segments: parts.length };
}

function deviceFrom(raw: unknown, warnings: string[]): CandidateDevice | undefined {
  if (!isObj(raw)) return undefined;
  const dev = longForm(raw, DEVICE_ABBREVIATIONS);
  const aliases: SensorDevice['externalIds'] = [];
  const ids = Array.isArray(dev.identifiers) ? dev.identifiers : dev.identifiers !== undefined ? [dev.identifiers] : [];
  for (const id of ids) {
    const value = typeof id === 'number' ? String(id) : clean(id, 512);
    if (value) aliases.push({ kind: 'identifier', value });
  }
  if (Array.isArray(dev.connections)) {
    for (const c of dev.connections) {
      if (Array.isArray(c) && c.length === 2) {
        const type = clean(c[0], 64);
        const value = clean(c[1], 512);
        if (type && value) aliases.push({ kind: 'connection', type, value });
      }
    }
  }
  const unique = new Map(aliases.map((a) => [JSON.stringify(a), a]));
  if (unique.size === 0) return undefined;
  const list = [...unique.values()].slice(0, 64);
  const result: CandidateDevice = { aliases: list, name: clean(dev.name, 200) ?? list[0].value.slice(0, 200) };
  const manufacturer = clean(dev.manufacturer, 200);
  const model = clean(dev.model, 200);
  const area = clean(dev.suggested_area, 200);
  if (manufacturer) result.manufacturer = manufacturer;
  if (model) result.model = model;
  if (area) result.suggestedArea = area;
  if (dev.configuration_url !== undefined) {
    const url = clean(dev.configuration_url, 2048);
    if (url && isHttpLink(url)) result.configurationUrlCandidate = url;
    else warnings.push('configuration_url was not adopted (invalid or possible credentials)');
  }
  return result;
}

type Built = { candidate: Candidate } | { unsupported: string };

function build(discoveryTopic: string, componentKey: string | undefined, component: Component, cfg: Obj, objectId: string, device: CandidateDevice | undefined): Built {
  const warnings: string[] = [];
  const base = typeof cfg['~'] === 'string' ? cfg['~'] : undefined;

  if (cfg.value_template !== undefined && typeof cfg.value_template !== 'string') return { unsupported: 'value_template is not a string' };
  let selector: SensorMqtt['selector'] = { kind: 'text' };
  if (typeof cfg.value_template === 'string' && cfg.value_template.trim() !== '') {
    const translated = translateTemplate(cfg.value_template);
    if (!translated) return { unsupported: `value_template is not supported: ${cfg.value_template.slice(0, 120)}` };
    selector = translated;
  }

  if (typeof cfg.state_topic !== 'string') return { unsupported: 'state_topic is missing' };
  const stateTopic = expandTopic(cfg.state_topic, base);
  if (!validTopic(stateTopic)) return { unsupported: 'state_topic is invalid or contains wildcards' };

  if (cfg.availability_template !== undefined) return { unsupported: 'availability_template is not supported' };
  if (cfg.availability !== undefined && cfg.availability_topic !== undefined) return { unsupported: 'availability and availability_topic together' };
  let availability: SensorMqtt['availability'];
  if (cfg.availability_topic !== undefined) {
    const topic = typeof cfg.availability_topic === 'string' ? expandTopic(cfg.availability_topic, base) : null;
    if (!validTopic(topic)) return { unsupported: 'availability_topic is invalid' };
    const online = clean(cfg.payload_available, 128) ?? 'online';
    const offline = clean(cfg.payload_not_available, 128) ?? 'offline';
    if (online === offline) return { unsupported: 'Availability payloads are not distinguishable' };
    availability = { mode: 'latest', topics: [{ topic, online, offline }] };
  } else if (cfg.availability !== undefined) {
    if (!Array.isArray(cfg.availability) || cfg.availability.length === 0 || cfg.availability.length > 32) return { unsupported: 'availability is invalid' };
    const topics: NonNullable<SensorMqtt['availability']>['topics'] = [];
    for (const raw of cfg.availability) {
      if (!isObj(raw)) return { unsupported: 'availability entry is invalid' };
      const entry = longForm(raw, ABBREVIATIONS);
      if (entry.value_template !== undefined) return { unsupported: 'A template in availability is not supported' };
      const topic = typeof entry.topic === 'string' ? expandTopic(entry.topic, base) : null;
      if (!validTopic(topic)) return { unsupported: 'availability topic is invalid' };
      const online = clean(entry.payload_available, 128) ?? 'online';
      const offline = clean(entry.payload_not_available, 128) ?? 'offline';
      if (online === offline) return { unsupported: 'Availability payloads are not distinguishable' };
      topics.push({ topic, online, offline });
    }
    if (new Set(topics.map((t) => t.topic)).size !== topics.length) return { unsupported: 'Duplicate availability topic' };
    const mode = cfg.availability_mode ?? 'latest';
    if (mode !== 'all' && mode !== 'any' && mode !== 'latest') return { unsupported: 'availability_mode is invalid' };
    availability = { mode, topics };
  }

  let expireAfterSeconds: number | undefined;
  if (cfg.expire_after !== undefined) {
    const v = cfg.expire_after;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 31_536_000) return { unsupported: 'expire_after is invalid' };
    if (v > 0) expireAfterSeconds = v;
  }

  const options = Array.isArray(cfg.options) ? cfg.options : null;
  const deviceClass = clean(cfg.device_class, 64);
  const isString = component === 'sensor' && (deviceClass === 'enum' || options !== null);
  const dataType: SensorSignal['dataType'] = component === 'binary_sensor' ? 'boolean' : isString ? 'string' : 'number';

  const mqtt: Candidate['mqtt'] = { stateTopic, selector };
  if (availability) mqtt.availability = availability;
  if (expireAfterSeconds !== undefined) mqtt.expireAfterSeconds = expireAfterSeconds;
  if (component === 'binary_sensor') {
    const on = clean(cfg.payload_on, 128) ?? 'ON';
    const off = clean(cfg.payload_off, 128) ?? 'OFF';
    if (on === off) return { unsupported: 'payload_on und payload_off sind gleich' };
    mqtt.booleanPayloads = { on, off };
  }

  const candidate: Candidate = {
    key: '',
    identity: { kind: 'discovery-topic', component, value: '' },
    weak: true,
    discoveryTopic,
    name: clean(cfg.name, 200) ?? device?.name ?? componentKey ?? objectId,
    dataType,
    mqtt,
    warnings,
  };
  if (componentKey) candidate.componentKey = componentKey;
  if (device) candidate.device = device;
  if (dataType === 'number') {
    const unit = clean(cfg.unit_of_measurement, 32);
    if (unit) candidate.unit = unit;
    if (cfg.state_class !== undefined) {
      if (cfg.state_class !== 'measurement' && cfg.state_class !== 'total' && cfg.state_class !== 'total_increasing') return { unsupported: `state_class is not supported: ${String(cfg.state_class).slice(0, 40)}` };
      candidate.stateClass = cfg.state_class;
    }
  } else if (cfg.unit_of_measurement !== undefined || cfg.state_class !== undefined) warnings.push('Unit and state_class apply to numbers only and were not adopted');
  if (deviceClass) candidate.deviceClass = deviceClass;

  const uniqueId = typeof cfg.unique_id === 'string' || typeof cfg.unique_id === 'number' ? clean(String(cfg.unique_id), 2048) : undefined;
  if (uniqueId) {
    candidate.identity = { kind: 'unique-id', component, value: uniqueId };
    candidate.weak = false;
  } else {
    candidate.identity = { kind: 'discovery-topic', component, value: JSON.stringify([discoveryTopic, componentKey ?? null]) };
    warnings.push('No unique_id: weak identity from the discovery topic');
  }
  return { candidate };
}

/** Normalises a set of discovery messages. Does not connect and changes nothing. */
export function scanDiscovery(messages: DiscoveryMessage[], source: Pick<SensorSource, 'id' | 'discoveryPrefix'>): DiscoveryScan {
  const scan: DiscoveryScan = { candidates: [], removals: [], unsupported: [], ignored: [], errors: [] };
  const prefix = source.discoveryPrefix;
  const ignore = (topic: string, reason: string) => {
    if (scan.ignored.length < MAX_LISTED) scan.ignored.push({ topic, reason });
  };
  const unsupported = (u: Unsupported) => {
    if (scan.unsupported.length < MAX_LISTED) scan.unsupported.push(u);
  };
  if (!prefix || /[+#]/.test(prefix) || prefix.endsWith('/')) {
    scan.errors.push({ topic: '', error: 'Discovery prefix of the source is missing or invalid' });
    return scan;
  }
  const push = (candidate: Candidate) => {
    candidate.key = signalIdentityKey({ sourceId: source.id, identity: candidate.identity });
    scan.candidates.push(candidate);
  };
  for (const message of messages) {
    const locator = typeof message.topic === 'string' ? parseLocator(message.topic, prefix) : null;
    if (!locator) {
      ignore(String(message.topic).slice(0, 200), 'Topic is not part of the discovery profile of this source');
      continue;
    }
    const isDevice = locator.kind === 'device';
    if (!isDevice && !(SUPPORTED as readonly string[]).includes(locator.kind)) {
      ignore(message.topic, `Component "${locator.kind}" is not adopted`);
      continue;
    }
    if (typeof message.payload !== 'string') {
      scan.errors.push({ topic: message.topic, error: 'Nutzlast ist kein Text' });
      continue;
    }
    if (message.payload.trim() === '') {
      scan.removals.push({ topic: message.topic });
      continue;
    }
    const parsed = parseStrictJson(message.payload, MAX_DISCOVERY_BYTES);
    if (!parsed.ok) {
      scan.errors.push({ topic: message.topic, error: parsed.error });
      continue;
    }
    if (!isObj(parsed.value)) {
      scan.errors.push({ topic: message.topic, error: 'Nutzlast ist kein JSON-Objekt' });
      continue;
    }
    try {
      const objectId = message.topic.split('/').slice(-2)[0];
      if (!isDevice) {
        const cfg = longForm(parsed.value, ABBREVIATIONS);
        const warnings: string[] = [];
        const device = deviceFrom(cfg.device, warnings);
        const built = build(message.topic, undefined, locator.kind as Component, cfg, objectId, device);
        if ('unsupported' in built) unsupported({ topic: message.topic, name: clean(cfg.name, 200), reason: built.unsupported });
        else {
          built.candidate.warnings.push(...warnings);
          push(built.candidate);
        }
        continue;
      }
      const top = longForm(parsed.value, ABBREVIATIONS);
      const components = top.components;
      if (!isObj(components)) {
        scan.errors.push({ topic: message.topic, error: 'Device discovery without components' });
        continue;
      }
      const warnings: string[] = [];
      const device = deviceFrom(top.device, warnings);
      const shared: Obj = { ...top };
      delete shared.components;
      delete shared.device;
      delete shared.origin;
      for (const [key, raw] of Object.entries(components)) {
        if (!isObj(raw)) {
          scan.errors.push({ topic: message.topic, error: `Komponente ${key} ist kein Objekt` });
          continue;
        }
        const own = longForm(raw, ABBREVIATIONS);
        const platform = own.platform;
        if (Object.keys(own).every((k) => k === 'platform')) {
          scan.removals.push({ topic: message.topic, componentKey: key });
          continue;
        }
        if (typeof platform !== 'string' || !(SUPPORTED as readonly string[]).includes(platform)) {
          ignore(`${message.topic}#${key}`, `Platform "${String(platform)}" is not adopted`);
          continue;
        }
        const merged: Obj = { ...shared, ...own };
        // The own availability of a component replaces the shared one completely.
        if ('availability' in own || 'availability_topic' in own || 'availability_template' in own) {
          for (const k of ['availability', 'availability_topic', 'availability_template']) if (!(k in own)) delete merged[k];
        }
        const built = build(message.topic, key, platform as Component, merged, objectId, device);
        if ('unsupported' in built) unsupported({ topic: message.topic, componentKey: key, name: clean(own.name, 200), reason: built.unsupported });
        else {
          built.candidate.warnings.push(...warnings);
          push(built.candidate);
        }
      }
    } catch (e) {
      scan.errors.push({ topic: message.topic, error: e instanceof Conflict ? e.message : 'Nutzlast konnte nicht ausgewertet werden' });
    }
  }
  return scan;
}

export type PreviewStatus = 'new' | 'changed' | 'unchanged' | 'ambiguous';

export interface PreviewItem {
  status: PreviewStatus;
  candidate: Candidate;
  /** Existing signal ID for changed/unchanged and for a confirmable re-assignment. */
  signalId?: string;
  changes: string[];
  /** Grund bei ambiguous. */
  reason?: string;
  /** true when an ambiguous row may be adopted after explicit confirmation. */
  confirmable: boolean;
}

export interface ImportPreview {
  sourceId: string;
  items: PreviewItem[];
  removed: { signalId: string; name: string }[];
  unsupported: Unsupported[];
  ignored: DiscoveryScan['ignored'];
  errors: DiscoveryScan['errors'];
}

function describeChanges(existing: SensorSignal, c: Candidate): string[] {
  const changes: string[] = [];
  if (existing.lifecycle === 'removed') changes.push('reactivated');
  if (existing.name !== c.name) changes.push('name');
  if (existing.dataType !== c.dataType) changes.push('dataType');
  if ((existing.unit ?? null) !== (c.unit ?? null)) changes.push('unit');
  if ((existing.deviceClass ?? null) !== (c.deviceClass ?? null)) changes.push('deviceClass');
  if ((existing.stateClass ?? null) !== (c.stateClass ?? null)) changes.push('stateClass');
  const m = existing.mqtt;
  if (!m) return [...changes, 'transport'];
  if (m.discoveryTopic !== c.discoveryTopic || (m.componentKey ?? null) !== (c.componentKey ?? null)) changes.push('discoveryTopic');
  if (m.stateTopic !== c.mqtt.stateTopic) changes.push('stateTopic');
  if (JSON.stringify(m.selector) !== JSON.stringify(c.mqtt.selector)) changes.push('selector');
  if (JSON.stringify(m.booleanPayloads ?? null) !== JSON.stringify(c.mqtt.booleanPayloads ?? null)) changes.push('booleanPayloads');
  if (JSON.stringify(m.availability ?? null) !== JSON.stringify(c.mqtt.availability ?? null)) changes.push('availability');
  if ((m.expireAfterSeconds ?? null) !== (c.mqtt.expireAfterSeconds ?? null)) changes.push('expireAfterSeconds');
  return changes;
}

/**
 * Compares a scan with the existing catalog. Mere absence deletes nothing:
 * only explicitly removed components appear under "removed".
 */
export function previewImport(current: SensorCatalog | null, source: Pick<SensorSource, 'id'>, scan: DiscoveryScan): ImportPreview {
  const signals = (current?.signals ?? []).filter((s) => s.sourceId === source.id);
  const byKey = new Map(signals.map((s) => [signalIdentityKey(s), s]));
  const counts = new Map<string, number>();
  for (const c of scan.candidates) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
  const devices = (current?.devices ?? []).filter((d) => d.sourceId === source.id);
  const aliasOwner = new Map<string, Set<string>>();
  for (const d of devices) for (const a of d.externalIds) aliasOwner.set(deviceAliasKey(source.id, a), new Set([d.id]));

  const items: PreviewItem[] = scan.candidates.map((c) => {
    const item: PreviewItem = { status: 'new', candidate: c, changes: [], confirmable: false };
    if ((counts.get(c.key) ?? 0) > 1) return { ...item, status: 'ambiguous', reason: 'The same identity occurs more than once in this import' };
    if (c.device) {
      const owners = new Set<string>();
      for (const a of c.device.aliases) for (const id of aliasOwner.get(deviceAliasKey(source.id, a)) ?? []) owners.add(id);
      if (owners.size > 1) return { ...item, status: 'ambiguous', reason: 'The device matches more than one existing device' };
    }
    const existing = byKey.get(c.key);
    if (existing) {
      const changes = describeChanges(existing, c);
      return { ...item, status: changes.length ? 'changed' : 'unchanged', signalId: existing.id, changes };
    }
    // Possible re-assignment: same discovery location, other identity kind.
    const sameLocation = signals.find((s) => s.mqtt?.discoveryTopic === c.discoveryTopic && (s.mqtt.componentKey ?? null) === (c.componentKey ?? null) && s.identity.component === c.identity.component && s.identity.kind !== c.identity.kind);
    if (sameLocation) {
      return {
        ...item,
        status: 'ambiguous',
        signalId: sameLocation.id,
        confirmable: true,
        reason: c.weak
          ? `Possibly the same signal as "${sameLocation.name}" (which has a unique_id)`
          : `The weak identity of "${sameLocation.name}" gains a unique_id. Confirm the re-assignment.`,
      };
    }
    return item;
  });

  const removed: ImportPreview['removed'] = [];
  for (const s of signals) {
    if (s.lifecycle !== 'active' || !s.mqtt) continue;
    const hit = scan.removals.some((r) => r.topic === s.mqtt?.discoveryTopic && (r.componentKey === undefined || r.componentKey === s.mqtt.componentKey));
    if (hit) removed.push({ signalId: s.id, name: s.name });
  }
  return { sourceId: source.id, items, removed, unsupported: scan.unsupported, ignored: scan.ignored, errors: scan.errors };
}

export interface ImportChoice {
  /** Candidate.key of the rows to adopt. */
  adopt: string[];
  /** Signal IDs to mark as removed (explicitly confirmed). */
  remove: string[];
}

function hash8(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function freshId(prefix: string, seed: string, label: string, used: Set<string>): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
  let id = `${prefix}.${slug}.${hash8(seed)}`;
  for (let n = 2; used.has(id); n++) id = `${prefix}.${slug}.${hash8(seed)}-${n}`;
  used.add(id);
  return id;
}

/**
 * Adopts explicitly chosen rows into a new catalog state (revision + 1).
 * - Signal IDs and local settings (staleAfterSeconds) survive a re-import.
 * - Removed signals stay in the catalog as lifecycle = removed (binding and archive remain possible).
 * - Ambiguous rows are adopted only when confirmable and explicitly chosen.
 * - The result is checked with the same contract as a file import.
 */
export function applyImport(
  current: SensorCatalog | null,
  source: SensorSource,
  preview: ImportPreview,
  choice: ImportChoice,
  options: { catalogId: string; now: Date },
): Parsed<SensorCatalog> {
  const next: SensorCatalog = current
    ? clone(current)
    : { schemaVersion: 1, kind: 'fabriqon.sensor-catalog', catalogId: options.catalogId, revision: 0, generatedAt: options.now.toISOString(), sources: [], devices: [], signals: [] };
  const known = next.sources.find((s) => s.id === source.id);
  if (!known) next.sources.push(source);
  else if (known.kind !== source.kind || known.discoveryPrefix !== source.discoveryPrefix) return { ok: false, error: 'Kind or discovery prefix of the source differs from the catalog' };

  const usedSignalIds = new Set(next.signals.map((s) => s.id));
  const usedDeviceIds = new Set(next.devices.map((d) => d.id));
  const adopt = new Set(choice.adopt);

  for (const item of preview.items) {
    if (!adopt.has(item.candidate.key)) continue;
    const c = item.candidate;
    if (item.status === 'unchanged') continue;
    if (item.status === 'ambiguous' && !item.confirmable) return { ok: false, error: `Row "${c.name}" is ambiguous and cannot be adopted: ${item.reason ?? ''}` };

    let deviceId: string | undefined;
    if (c.device) {
      const sourceDevices = next.devices.filter((d) => d.sourceId === source.id);
      const keys = new Set(c.device.aliases.map((a) => deviceAliasKey(source.id, a)));
      const hit = sourceDevices.find((d) => d.externalIds.some((a) => keys.has(deviceAliasKey(source.id, a))));
      if (hit) {
        deviceId = hit.id;
        hit.name = c.device.name;
        if (c.device.manufacturer) hit.manufacturer = c.device.manufacturer;
        if (c.device.model) hit.model = c.device.model;
        if (c.device.suggestedArea) hit.suggestedArea = c.device.suggestedArea;
        if (c.device.configurationUrlCandidate) hit.configurationUrlCandidate = c.device.configurationUrlCandidate;
        const have = new Set(hit.externalIds.map((a) => deviceAliasKey(source.id, a)));
        for (const a of c.device.aliases) if (!have.has(deviceAliasKey(source.id, a)) && hit.externalIds.length < 64) hit.externalIds.push(a);
      } else {
        deviceId = freshId('device', JSON.stringify([...keys].sort()), c.device.name, usedDeviceIds);
        next.devices.push({ id: deviceId, sourceId: source.id, externalIds: c.device.aliases, name: c.device.name, ...(c.device.manufacturer && { manufacturer: c.device.manufacturer }), ...(c.device.model && { model: c.device.model }), ...(c.device.suggestedArea && { suggestedArea: c.device.suggestedArea }), ...(c.device.configurationUrlCandidate && { configurationUrlCandidate: c.device.configurationUrlCandidate }) });
      }
    }

    const mqtt: SensorMqtt = { discoveryTopic: c.discoveryTopic, ...(c.componentKey && { componentKey: c.componentKey }), ...c.mqtt };
    const target = item.signalId ? next.signals.find((s) => s.id === item.signalId) : undefined;
    const fields = {
      sourceId: source.id,
      ...(deviceId && { deviceId }),
      identity: c.identity,
      name: c.name,
      dataType: c.dataType,
      ...(c.unit && { unit: c.unit }),
      ...(c.deviceClass && { deviceClass: c.deviceClass }),
      ...(c.stateClass && { stateClass: c.stateClass }),
      lifecycle: 'active' as const,
      mqtt,
    };
    if (target) {
      // Lokale Vorgabe bleibt erhalten, Quellmetadaten werden aktualisiert.
      const keepStale = target.staleAfterSeconds;
      for (const k of ['deviceId', 'unit', 'deviceClass', 'stateClass'] as const) delete target[k];
      Object.assign(target, fields);
      if (keepStale !== undefined) target.staleAfterSeconds = keepStale;
    } else {
      next.signals.push({ id: freshId('signal', c.key, c.name, usedSignalIds), ...fields });
    }
  }

  const removable = new Set(preview.removed.map((r) => r.signalId));
  for (const id of choice.remove) {
    if (!removable.has(id)) return { ok: false, error: `Signal ${id} ist nicht als entfernt vorgeschlagen` };
    const s = next.signals.find((x) => x.id === id);
    if (s) s.lifecycle = 'removed';
  }

  next.revision = (current?.revision ?? 0) + 1;
  next.generatedAt = options.now.toISOString();
  // Check each signal on its own before the whole catalog is validated.
  for (const s of next.signals) {
    const check = parseSensorSignal(s);
    if (!check.ok) return { ok: false, error: `Signal ${s.name}: ${check.error}` };
  }
  return parseSensorCatalog(next);
}
