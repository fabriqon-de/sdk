import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
// @ts-expect-error Development-only JSON Schema checker has no public TypeScript API.
import { validateCatalog, validateBindings, validateState } from '../scripts/validate-sensor-contracts.mjs';
import {
  SensorConnector, applyImport, decodeReading, evaluateRuntime, isTopicAllowed, parseSensorBindings, parseSensorCatalog, parseSensorState, parseStrictJson,
  planSubscriptions, previewImport, scanDiscovery, utf8Length, type SensorCatalog, type SensorSignal,
} from '../src/sensors/index.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../examples/sensors/${name}.json`, import.meta.url), 'utf8'));
const catalog: SensorCatalog = fixture('catalog');
const bindings = fixture('bindings');
const assets = ['asset-climate-01', 'asset-door-01'];
const states = ['state-live', 'state-retained', 'state-disconnected', 'state-invalid'].map(fixture);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const at = (iso: string) => new Date(iso);

describe('contract validation agrees with the JSON Schema checker', () => {
  it('accepts every published example', () => {
    expect(parseSensorCatalog(catalog)).toEqual({ ok: true, value: catalog });
    expect(parseSensorBindings(bindings, catalog, assets).ok).toBe(true);
    for (const state of states) expect(parseSensorState(state, catalog).ok).toBe(true);
  });

  const catalogCases: [string, (c: SensorCatalog) => void][] = [
    ['unknown catalog property', (c) => void ((c as unknown as Record<string, unknown>).extra = 1)],
    ['unknown signal property', (c) => void ((c.signals[0] as unknown as Record<string, unknown>).extra = 1)],
    ['duplicate identity', (c) => void (c.signals[1].identity = c.signals[0].identity)],
    ['duplicate signal id', (c) => void (c.signals[1].id = c.signals[0].id)],
    ['unknown source', (c) => void (c.signals[0].sourceId = 'nope')],
    ['device of another source', (c) => { c.sources.push({ id: 'other', kind: 'json', name: 'Other' }); c.devices[0].sourceId = 'other'; }],
    ['unit on a boolean', (c) => void (c.signals[2].unit = 'x')],
    ['wildcard in a state topic', (c) => void (c.signals[0].mqtt!.stateTopic = 'lab/+/state')],
    ['ambiguous boolean payloads', (c) => void (c.signals[2].mqtt!.booleanPayloads = { on: 'A', off: 'A' })],
    ['discovery topic outside the prefix', (c) => void (c.signals[0].mqtt!.discoveryTopic = 'other/sensor/a/b/config')],
    ['bad pointer', (c) => void (c.signals[0].mqtt!.selector = { kind: 'json-pointer', pointer: 'temperature' })],
    ['id with a space', (c) => void (c.catalogId = 'bad id')],
    ['revision is not an integer', (c) => void (c.revision = 1.5)],
    ['credentials in a device URL', (c) => void (c.devices[0].configurationUrlCandidate = 'https://user:pw@example.test/x')],
    ['non-UTC timestamp', (c) => void (c.generatedAt = '2026-01-01T00:00:00+01:00')],
  ];
  it.each(catalogCases)('catalog: %s', (_name, mutate) => {
    const value = clone(catalog);
    mutate(value);
    let schemaOk = true;
    try { validateCatalog(value); } catch { schemaOk = false; }
    expect(schemaOk).toBe(false);
    expect(parseSensorCatalog(value).ok).toBe(false);
  });

  const opcuaCatalog = (over: Record<string, unknown> = {}, opcua: Record<string, unknown> = {}): SensorCatalog => {
    const c = clone(catalog);
    c.sources.push({ id: 'plc-1', kind: 'opcua', name: 'Steuerung 1' } as SensorCatalog['sources'][number]);
    c.signals.push({
      id: 'sig-plc-a', sourceId: 'plc-1', identity: { kind: 'external-id', component: 'sensor', value: 'ns=2;s=A' }, name: 'A', dataType: 'number', lifecycle: 'active',
      opcua: { nodeId: 'ns=2;s=A', samplingIntervalMs: 500, deadband: 0.5, ...opcua }, ...over,
    } as unknown as SensorCatalog['signals'][number]);
    return c;
  };

  it('OPC UA signals: schema checker and parser agree on valid and invalid catalogs', () => {
    const valid = [opcuaCatalog(), opcuaCatalog({}, { samplingIntervalMs: undefined, deadband: undefined }), opcuaCatalog({ identity: { kind: 'external-id', component: 'sensor', value: 'i=2258' } }, { nodeId: 'i=2258' }),
      opcuaCatalog({ identity: { kind: 'external-id', component: 'sensor', value: 'nsu=urn:werk:plc;s=Temp' } }, { nodeId: 'nsu=urn:werk:plc;s=Temp' })];
    for (const c of valid) {
      expect(() => validateCatalog(c)).not.toThrow();
      expect(parseSensorCatalog(c)).toMatchObject({ ok: true });
    }
    const invalid: SensorCatalog[] = [
      opcuaCatalog({}, { nodeId: 'Temperatur' }), opcuaCatalog({}, { nodeId: 'ns=2;s=' }), opcuaCatalog({}, { samplingIntervalMs: 10 }), opcuaCatalog({}, { deadband: -1 }),
      opcuaCatalog({}, { endpointUrl: 'opc.tcp://x' }), opcuaCatalog({}, { password: 'x' }),
      opcuaCatalog({ identity: { kind: 'external-id', component: 'sensor', value: 'ns=2;s=B' } }), opcuaCatalog({ identity: { kind: 'unique-id', component: 'sensor', value: 'ns=2;s=A' } }),
      opcuaCatalog({ dataType: 'string' }), opcuaCatalog({ mqtt: { stateTopic: 'lab/x', selector: { kind: 'text' } } }),
      opcuaCatalog({ identity: { kind: 'external-id', component: 'binary_sensor', value: 'ns=2;s=A' } }),
    ];
    for (const c of invalid) {
      let schemaOk = true;
      try { validateCatalog(c); } catch { schemaOk = false; }
      expect(schemaOk).toBe(false);
      expect(parseSensorCatalog(c).ok).toBe(false);
    }
  });

  it('is stricter than the schema for credential-like URL keys', () => {
    for (const url of ['https://example.test/x?token=abc', 'https://example.test/x#api_key=1', 'https://example.test/x?a=1&password=2']) {
      const value = clone(catalog);
      value.devices[0].configurationUrlCandidate = url;
      expect(() => validateCatalog(value)).not.toThrow();
      expect(parseSensorCatalog(value).ok).toBe(false);
    }
    const ok = clone(catalog);
    ok.devices[0].configurationUrlCandidate = 'https://example.test/x?page=2';
    expect(parseSensorCatalog(ok).ok).toBe(true);
  });

  it('binding and state rules', () => {
    const twice = clone(bindings);
    twice.bindings.push({ ...twice.bindings[0], id: 'binding.second', assetId: 'asset-door-01' });
    expect(() => validateBindings(twice, catalog, assets)).toThrow();
    expect(parseSensorBindings(twice, catalog, assets).ok).toBe(false);
    expect(parseSensorBindings(bindings, catalog, ['asset-door-01']).ok).toBe(false);
    const wrongCatalog = clone(bindings);
    wrongCatalog.catalogId = 'other';
    expect(parseSensorBindings(wrongCatalog, catalog, assets).ok).toBe(false);

    const fresh = clone(states[0]);
    fresh.sourceConnection = 'disconnected';
    expect(() => validateState(fresh, catalog)).toThrow();
    expect(parseSensorState(fresh, catalog).ok).toBe(false);
    const retained = clone(states[1]);
    retained.freshness = 'fresh';
    retained.reading.observedAt = null;
    expect(parseSensorState(retained, catalog).ok).toBe(false);
    const late = clone(states[0]);
    late.reading.receivedAt = '2099-01-01T00:00:00Z';
    expect(parseSensorState(late, catalog).ok).toBe(false);
  });

  it('never throws on arbitrary input', () => {
    for (const value of [null, undefined, 1, 'x', [], {}, { schemaVersion: 1 }, Object.create({ kind: 'x' })]) {
      expect(parseSensorCatalog(value).ok).toBe(false);
      expect(parseSensorState(value, catalog).ok).toBe(false);
    }
  });
});

describe('strict JSON', () => {
  it('rejects duplicate keys, __proto__, depth and size', () => {
    expect(parseStrictJson('{"a":1,"a":2}', 1000).ok).toBe(false);
    expect(parseStrictJson('{"__proto__":{}}', 1000).ok).toBe(false);
    expect(parseStrictJson('['.repeat(40) + ']'.repeat(40), 1000).ok).toBe(false);
    expect(parseStrictJson('{"a":"' + 'x'.repeat(2000) + '"}', 1000).ok).toBe(false);
    expect(parseStrictJson('{"a":[1,2,{"b":null}]}', 1000)).toEqual({ ok: true, value: { a: [1, 2, { b: null }] } });
    expect(parseStrictJson('{"a":1} x', 1000).ok).toBe(false);
  });
  it('counts UTF-8 bytes like TextEncoder', () => {
    for (const s of ['abc', 'äöü', '€', '😀', 'a😀€ä', '\ud800']) expect(utf8Length(s)).toBe(new TextEncoder().encode(s).length);
  });
});

const signal = (id: string) => catalog.signals.find((s) => s.id === id) as SensorSignal;

describe('decoding', () => {
  it('numbers, pointers and strict number syntax', () => {
    expect(decodeReading(signal('signal.temperature'), '{"temperature":22.4}')).toEqual({ value: 22.4, quality: 'valid' });
    expect(decodeReading(signal('signal.temperature'), '{"temperature":"22.4"}')).toEqual({ value: 22.4, quality: 'valid' });
    for (const bad of ['{"temperature":""}', '{"temperature":"0x10"}', '{"temperature":"NaN"}', '{"temperature":true}', '{"humidity":1}', 'not json', '{"temperature":1,"temperature":2}'])
      expect(decodeReading(signal('signal.temperature'), bad)).toEqual({ value: null, quality: 'invalid' });
  });
  it('booleans only through the two configured payloads', () => {
    expect(decodeReading(signal('signal.door'), 'OPEN')).toEqual({ value: true, quality: 'valid' });
    expect(decodeReading(signal('signal.door'), 'CLOSED')).toEqual({ value: false, quality: 'valid' });
    for (const bad of ['open', '1', 'true', '', 'ON']) expect(decodeReading(signal('signal.door'), bad).quality).toBe('invalid');
  });
});

describe('runtime evaluation', () => {
  const base = (over: object = {}) => ({
    signal: signal('signal.temperature'), now: at('2026-01-01T00:00:10Z'), connection: 'connected' as const, availabilityTopics: {},
    reading: { value: 21, quality: 'valid' as const, observedAt: null, receivedAt: '2026-01-01T00:00:05Z', retained: false }, ...over,
  });
  const online = { 'lab/env-01/availability': { state: 'online' as const, at: '2026-01-01T00:00:00Z' } };
  it('fresh only with connection, availability and a valid live reading', () => {
    expect(evaluateRuntime(base({ availabilityTopics: online })).freshness).toBe('fresh');
    expect(evaluateRuntime(base({ availabilityTopics: online, connection: 'disconnected' }))).toMatchObject({ freshness: 'stale', reason: 'disconnected' });
    expect(evaluateRuntime(base({ availabilityTopics: online, reading: null }))).toMatchObject({ freshness: 'unknown', reason: 'no-reading' });
    expect(evaluateRuntime(base({ availabilityTopics: online, denied: true }))).toMatchObject({ freshness: 'unknown', reason: 'denied' });
  });
  it('retained values without a measurement time are never fresh', () => {
    const retained = { value: 21, quality: 'valid' as const, observedAt: null, receivedAt: '2026-01-01T00:00:05Z', retained: true };
    expect(evaluateRuntime(base({ availabilityTopics: online, reading: retained }))).toMatchObject({ freshness: 'unknown', reason: 'observed-time-unknown', ageSeconds: null });
  });
  it('expiry and offline make a value stale', () => {
    const expiring = clone(signal('signal.temperature'));
    expiring.mqtt!.expireAfterSeconds = 3;
    expect(evaluateRuntime(base({ signal: expiring, availabilityTopics: online }))).toMatchObject({ freshness: 'stale', availability: 'offline', reason: 'expired' });
    const offline = { 'lab/env-01/availability': { state: 'offline' as const, at: '2026-01-01T00:00:06Z' } };
    expect(evaluateRuntime(base({ availabilityTopics: offline }))).toMatchObject({ freshness: 'stale', reason: 'offline' });
  });
});

describe('connector', () => {
  const policy = { sourceId: 'mqtt-home', allowedTopicPrefixes: ['lab'] };
  const ids = () => { let n = 0; return () => `stream-${++n}`; };
  it('subscribes only to exact allowed topics and reports the rest', () => {
    expect(planSubscriptions(catalog, policy).topics).toEqual(['lab/door-01/contact', 'lab/env-01/availability', 'lab/env-01/state']);
    const plan = planSubscriptions(catalog, { sourceId: 'mqtt-home', allowedTopicPrefixes: ['laboratory'] });
    expect(plan.topics).toEqual([]);
    expect(plan.rejected.length).toBe(3);
    expect(isTopicAllowed('lab/x', ['lab'])).toBe(true);
    expect(isTopicAllowed('laboratory/x', ['lab'])).toBe(false);
    expect(isTopicAllowed('lab/#', ['lab'])).toBe(false);
    expect(isTopicAllowed('lab/+/x', ['lab'])).toBe(false);
  });
  it('produces contract-conforming states, a new stream after a reconnect and denial reasons', () => {
    const connector = new SensorConnector(catalog, policy, ids());
    const t = (s: string) => at(`2026-01-01T00:00:${s}Z`);
    connector.setConnection('connected', t('00'));
    connector.handleMessage('lab/env-01/availability', 'online', false, t('01'));
    const out = connector.handleMessage('lab/env-01/state', '{"temperature":22.4,"humidity":47.2}', false, t('02'));
    expect(out.length).toBe(2);
    for (const live of out) expect(parseSensorState(live.state, catalog)).toMatchObject({ ok: true });
    expect(out.find((l) => l.state.signalId === 'signal.temperature')?.state).toMatchObject({ freshness: 'fresh', streamId: 'stream-1' });
    expect(connector.handleMessage('other/topic', 'x', false, t('03'))).toEqual([]);
    connector.setConnection('disconnected', t('04'));
    const again = connector.setConnection('connected', t('05'));
    expect(again.every((l) => l.state.streamId === 'stream-2' && l.state.sequence === 1)).toBe(true);
    const denied = connector.markDenied('lab/door-01/contact', true, t('06'));
    expect(denied[0]).toMatchObject({ reason: 'denied', state: { freshness: 'unknown' } });
    expect(connector.markDenied('lab/door-01/contact', true, t('07'))).toEqual([]);
  });
  it('never turns a failed decode into a value', () => {
    const connector = new SensorConnector(catalog, policy, ids());
    connector.setConnection('connected', at('2026-01-01T00:00:00Z'));
    const [live] = connector.handleMessage('lab/door-01/contact', 'maybe', false, at('2026-01-01T00:00:01Z'));
    expect(live.state.reading).toMatchObject({ value: null, quality: 'invalid' });
    expect(live.reason).toBe('invalid-reading');
  });
});

describe('discovery import', () => {
  const source = { id: 'mqtt-home', discoveryPrefix: 'homeassistant' };
  const examples = fixture('mqtt-discovery');
  const entity = examples.entityDiscovery.map((m: { topic: string; payload: unknown }) => ({ topic: m.topic, payload: JSON.stringify(m.payload) }));
  const device = examples.deviceDiscovery.map((m: { topic: string; payload: unknown }) => ({ topic: m.topic, payload: JSON.stringify(m.payload) }));

  it('normalises single and device discovery with short forms', () => {
    const single = scanDiscovery(entity, source);
    expect(single.errors).toEqual([]);
    expect(single.candidates.map((c) => c.identity.value)).toEqual(['env-01-temperature', 'door-01-contact']);
    expect(single.candidates[0]).toMatchObject({ dataType: 'number', unit: '°C', mqtt: { selector: { kind: 'json-pointer', pointer: '/temperature' }, expireAfterSeconds: 600 } });
    expect(single.candidates[1]).toMatchObject({ dataType: 'boolean', mqtt: { booleanPayloads: { on: 'OPEN', off: 'CLOSED' } } });
    const grouped = scanDiscovery(device, source);
    expect(grouped.errors).toEqual([]);
    expect(grouped.candidates.length).toBeGreaterThan(0);
    expect(grouped.candidates.every((c) => c.componentKey)).toBe(true);
  });
  it('marks unknown templates unsupported instead of guessing', () => {
    const scan = scanDiscovery([{ topic: 'homeassistant/sensor/a/b/config', payload: JSON.stringify({ unique_id: 'u', state_topic: 'lab/a', value_template: '{{ value_json.x | float * 2 }}' }) }], source);
    expect(scan.candidates).toEqual([]);
    expect(scan.unsupported[0].reason).toMatch(/value_template/);
  });
  it('rejects wildcards, duplicate keys and wrong prefixes', () => {
    const scan = scanDiscovery([
      { topic: 'homeassistant/sensor/a/b/config', payload: JSON.stringify({ unique_id: 'u', state_topic: 'lab/#' }) },
      { topic: 'homeassistant/sensor/c/d/config', payload: '{"unique_id":"x","unique_id":"y"}' },
      { topic: 'elsewhere/sensor/c/d/config', payload: '{}' },
      { topic: 'homeassistant/light/c/d/config', payload: '{}' },
    ], source);
    expect(scan.candidates).toEqual([]);
    expect(scan.unsupported.length).toBe(1);
    expect(scan.errors.length).toBe(1);
    expect(scan.ignored.length).toBe(2);
  });
  it('previews and adopts explicitly, idempotently, and the result conforms to the contract', () => {
    const scan = scanDiscovery(entity, source);
    const sourceDoc = { id: 'mqtt-home', kind: 'mqtt-discovery' as const, name: 'Import', discoveryPrefix: 'homeassistant' };
    const preview = previewImport(null, sourceDoc, scan);
    expect(preview.items.map((i) => i.status)).toEqual(['new', 'new']);
    const first = applyImport(null, sourceDoc, preview, { adopt: scan.candidates.map((c) => c.key), remove: [] }, { catalogId: 'catalog.import', now: at('2026-01-01T00:00:00Z') });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    validateCatalog(first.value);
    expect(first.value.revision).toBe(1);
    const again = previewImport(first.value, sourceDoc, scan);
    expect(again.items.map((i) => i.status)).toEqual(['unchanged', 'unchanged']);
    // A local staleAfterSeconds survives a changed re-import and the signal ID stays.
    const local = clone(first.value);
    local.signals[0].staleAfterSeconds = 30;
    const changed = scanDiscovery(entity.map((m: { topic: string; payload: string }, i: number) => (i === 0 ? { ...m, payload: m.payload.replace('Temperatur', 'Temp') } : m)), source);
    const second = previewImport(local, sourceDoc, changed);
    expect(second.items[0]).toMatchObject({ status: 'changed', changes: ['name'] });
    const next = applyImport(local, sourceDoc, second, { adopt: [changed.candidates[0].key], remove: [] }, { catalogId: 'x', now: at('2026-01-02T00:00:00Z') });
    expect(next.ok && next.value.signals[0]).toMatchObject({ id: local.signals[0].id, name: 'Temp', staleAfterSeconds: 30 });
  });
  it('removal needs an explicit message and an explicit choice', () => {
    const scan = scanDiscovery(entity, source);
    const sourceDoc = { id: 'mqtt-home', kind: 'mqtt-discovery' as const, name: 'Import', discoveryPrefix: 'homeassistant' };
    const first = applyImport(null, sourceDoc, previewImport(null, sourceDoc, scan), { adopt: scan.candidates.map((c) => c.key), remove: [] }, { catalogId: 'c', now: at('2026-01-01T00:00:00Z') });
    if (!first.ok) throw new Error(first.error);
    const absent = previewImport(first.value, sourceDoc, scanDiscovery([], source));
    expect(absent.removed).toEqual([]);
    const removal = previewImport(first.value, sourceDoc, scanDiscovery([{ topic: entity[0].topic, payload: '' }], source));
    expect(removal.removed.length).toBe(1);
    const refused = applyImport(first.value, sourceDoc, removal, { adopt: [], remove: ['not-proposed'] }, { catalogId: 'c', now: at('2026-01-02T00:00:00Z') });
    expect(refused.ok).toBe(false);
    const done = applyImport(first.value, sourceDoc, removal, { adopt: [], remove: [removal.removed[0].signalId] }, { catalogId: 'c', now: at('2026-01-02T00:00:00Z') });
    expect(done.ok && done.value.signals.find((s) => s.id === removal.removed[0].signalId)?.lifecycle).toBe('removed');
  });
});
