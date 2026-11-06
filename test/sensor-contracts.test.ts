import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { operatorSourceId } from '../src/sensors/contract.js';
// @ts-expect-error Development-only JSON Schema checker has no public TypeScript API.
import { validateDocument, validateCatalog, validateBindings, validateState } from '../scripts/validate-sensor-contracts.mjs';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`../examples/sensors/${name}.json`,import.meta.url),'utf8'));
const catalog=fixture('catalog'),bindings=fixture('bindings');
const assets=['asset-climate-01','asset-door-01'];
describe('sensor import contract conformance',()=>{
 it('validates catalog, explicit bindings and each runtime state example',()=>{
  expect(validateCatalog(catalog)).toEqual(catalog);
  expect(validateBindings(bindings,catalog,assets)).toEqual(bindings);
  for(const name of ['state-live','state-retained','state-disconnected','state-invalid'])expect(validateState(fixture(name),catalog)).toBeTruthy();
 });
 it('rejects duplicate identities and cross-source device assignments',()=>{
  const duplicate=structuredClone(catalog);duplicate.signals[1].identity=duplicate.signals[0].identity;
  expect(()=>validateCatalog(duplicate)).toThrow(/Duplicate external/);
  const foreign=structuredClone(catalog);foreign.sources.push({id:'other',kind:'json',name:'Other'});foreign.devices[0].sourceId='other';
  expect(()=>validateCatalog(foreign)).toThrow(/Device belongs/);
 });
 it('rejects unknown assets, duplicate assignments and wrong catalog references',()=>{
  expect(()=>validateBindings(bindings,catalog,[])).toThrow(/Unknown model asset/);
  const duplicate=structuredClone(bindings);duplicate.bindings[1].signalId=duplicate.bindings[0].signalId;
  expect(()=>validateBindings(duplicate,catalog,assets)).toThrow(/Duplicate signal assignment/);
  expect(()=>validateBindings({...bindings,catalogId:'other'},catalog,assets)).toThrow(/Catalog mismatch/);
 });
 it('rejects wildcard topics, ambiguous binary mappings and executable selectors',()=>{
  const wildcard=structuredClone(catalog);wildcard.signals[0].mqtt.stateTopic='private/#';
  expect(()=>validateCatalog(wildcard)).toThrow();
  const binary=structuredClone(catalog);binary.signals[2].mqtt.booleanPayloads.off='OPEN';
  expect(()=>validateCatalog(binary)).toThrow(/Ambiguous binary/);
  const code=structuredClone(catalog);code.signals[0].mqtt.selector={kind:'javascript',code:'return 1'};
  expect(()=>validateCatalog(code)).toThrow();
 });
 it('rejects secret fields, incompatible versions and unsafe link schemes/userinfo',()=>{
  expect(()=>validateDocument('sensor-catalog',{...catalog,password:'not-a-real-secret'})).toThrow();
  expect(()=>validateDocument('sensor-catalog',{...catalog,schemaVersion:2})).toThrow();
  for(const url of ['javascript:alert(1)','data:text/html,hello','https://user:pass@example.test/']){
   const bad=structuredClone(bindings);bad.bindings[0].links.source.url=url;expect(()=>validateBindings(bad,catalog,assets)).toThrow();
  }
 });
 it('rejects non-finite values, wrong types and false freshness from retained messages',()=>{
  const infinite=fixture('state-live');infinite.reading.value=Infinity;expect(()=>validateState(infinite,catalog)).toThrow();
  const wrong=fixture('state-live');wrong.reading.value='22.4';expect(()=>validateState(wrong,catalog)).toThrow(/value type/);
  const retained=fixture('state-retained');retained.freshness='fresh';retained.availability='online';expect(()=>validateState(retained,catalog)).toThrow(/Retained/);
  const disconnected=fixture('state-disconnected');disconnected.freshness='fresh';expect(()=>validateState(disconnected,catalog)).toThrow(/freshness/);
 });
 it('allows either discovery locator for a stable identity and rejects noncanonical topic fallback',()=>{
  const fallback=structuredClone(catalog);const s=fallback.signals[0];s.identity.kind='discovery-topic';s.identity.value=JSON.stringify([s.mqtt.discoveryTopic,s.mqtt.componentKey]);expect(validateCatalog(fallback)).toBeTruthy();
  s.identity.value='temperature';expect(()=>validateCatalog(fallback)).toThrow(/fallback/);
  const moved=structuredClone(catalog);moved.signals[0].mqtt={...moved.signals[0].mqtt,discoveryTopic:'homeassistant/sensor/env-01/temperature/config'};delete moved.signals[0].mqtt.componentKey;
  expect(validateCatalog(moved).signals[0].identity).toEqual(catalog.signals[0].identity);
 });
 it('keeps current values out of catalogs and model placement out of discovery facts',()=>{
  const value=structuredClone(catalog);value.signals[0].value=22.4;expect(()=>validateCatalog(value)).toThrow();
  const placement=structuredClone(catalog);placement.devices[0].position={x:0,y:0,z:0};expect(()=>validateCatalog(placement)).toThrow();
 });
 it('accepts interface signals from a Verwaltungsschale without a discovery configuration',()=>{
  const aas=structuredClone(catalog);
  aas.sources.push({id:'aas.shell',kind:'aas-interfaces',name:'Verwaltungsschale'});
  aas.signals.push({id:'sig-shell-temp',sourceId:'aas.shell',identity:{kind:'external-id',component:'sensor',value:'https://hersteller.example/asset/1#MQTT/temperature'},name:'temperature',dataType:'number',unit:'CEL',lifecycle:'active',mqtt:{stateTopic:'lab/plc/temp',selector:{kind:'text'}}});
  expect(validateCatalog(aas).signals.at(-1).mqtt.discoveryTopic).toBeUndefined();
  expect(operatorSourceId({id:'aas.broker-1',kind:'aas-interfaces'})).toBe('broker-1');
  expect(operatorSourceId({id:'broker-1',kind:'mqtt-discovery'})).toBe('broker-1');
 });
 it('keeps the discovery rules strict for discovery sources and strict about interface signals',()=>{
  const missing=structuredClone(catalog);delete missing.signals[0].mqtt.discoveryTopic;
  expect(()=>validateCatalog(missing)).toThrow(/Discovery topic missing/);
  const base=structuredClone(catalog);
  base.sources.push({id:'aas.shell',kind:'aas-interfaces',name:'Verwaltungsschale'});
  const signal={id:'sig-shell-temp',sourceId:'aas.shell',identity:{kind:'external-id',component:'sensor',value:'urn:x#MQTT/t'},name:'t',dataType:'number',lifecycle:'active',mqtt:{stateTopic:'lab/plc/temp',selector:{kind:'text'}}};
  const withDiscovery=structuredClone(base);withDiscovery.signals.push({...signal,mqtt:{...signal.mqtt,discoveryTopic:'homeassistant/sensor/a/b/config'}});
  expect(()=>validateCatalog(withDiscovery)).toThrow(/no discovery configuration/i);
  const wrongIdentity=structuredClone(base);wrongIdentity.signals.push({...signal,identity:{kind:'unique-id',component:'sensor',value:'x'}});
  expect(()=>validateCatalog(wrongIdentity)).toThrow(/external-id/i);
  const noMqtt=structuredClone(base);const {mqtt:_m,...bare}=signal;void _m;noMqtt.signals.push(bare);
  expect(()=>validateCatalog(noMqtt)).toThrow(/MQTT binding/);
  const wrongId=structuredClone(base);wrongId.sources.at(-1).id='shell';wrongId.signals.push({...signal,sourceId:'shell'});
  expect(()=>validateCatalog(wrongId)).toThrow(/aas\./);
  const wildcard=structuredClone(base);wildcard.signals.push({...signal,mqtt:{stateTopic:'lab/#',selector:{kind:'text'}}});
  expect(()=>validateCatalog(wildcard)).toThrow();
  const binary=structuredClone(base);binary.signals.push({...signal,identity:{kind:'external-id',component:'binary_sensor',value:'urn:x#MQTT/b'},dataType:'boolean'});
  expect(()=>validateCatalog(binary)).toThrow(/Binary payload/);
 });
 it('accepts read-only OPC UA signals and keeps them apart from MQTT',()=>{
  const base=structuredClone(catalog);
  base.sources.push({id:'plc-1',kind:'opcua',name:'Steuerung 1'});
  const signal={id:'sig-plc-temp',sourceId:'plc-1',identity:{kind:'external-id',component:'sensor',value:'ns=2;s=Kessel.Temperatur'},name:'Temperatur',dataType:'number',unit:'CEL',lifecycle:'active',opcua:{nodeId:'ns=2;s=Kessel.Temperatur',samplingIntervalMs:1000,deadband:0.1}};
  const ok=structuredClone(base);ok.signals.push(signal);
  expect(validateCatalog(ok).signals.at(-1).opcua.nodeId).toBe('ns=2;s=Kessel.Temperatur');
  expect(operatorSourceId({id:'plc-1',kind:'opcua'})).toBe('plc-1');
  const withMqtt=structuredClone(base);withMqtt.signals.push({...signal,mqtt:{stateTopic:'lab/x',selector:{kind:'text'}}});
  expect(()=>validateCatalog(withMqtt)).toThrow(/MQTT binding/);
  const onMqttSource=structuredClone(base);onMqttSource.signals.push({...signal,sourceId:catalog.sources[0].id});
  expect(()=>validateCatalog(onMqttSource)).toThrow();
  const noOpcua=structuredClone(base);const {opcua:_o,...bare}=signal;void _o;noOpcua.signals.push(bare);
  expect(()=>validateCatalog(noOpcua)).toThrow(/OPC UA binding/);
 });
 it('rejects malformed NodeIds, wrong identities, unsuitable deadbands and unknown OPC UA fields',()=>{
  const base=structuredClone(catalog);base.sources.push({id:'plc-1',kind:'opcua',name:'Steuerung 1'});
  const signal={id:'sig-plc-temp',sourceId:'plc-1',identity:{kind:'external-id',component:'sensor',value:'ns=2;s=A'},name:'A',dataType:'number',lifecycle:'active',opcua:{nodeId:'ns=2;s=A'}};
  const make=(over:object)=>{const c=structuredClone(base);c.signals.push({...signal,...over});return c;};
  for(const nodeId of ['','Temperatur','ns=2','ns=x;s=A','ns=2;x=A','s=','i=abc','ns=2;s=a\nb','ns=123456;s=A']){
   expect(()=>validateCatalog(make({opcua:{nodeId},identity:{...signal.identity,value:nodeId||'x'}})),nodeId).toThrow();
  }
  expect(()=>validateCatalog(make({identity:{kind:'external-id',component:'sensor',value:'ns=2;s=B'}}))).toThrow(/NodeId/);
  expect(()=>validateCatalog(make({identity:{kind:'unique-id',component:'sensor',value:'ns=2;s=A'}}))).toThrow(/external-id/);
  expect(()=>validateCatalog(make({dataType:'string',opcua:{nodeId:'ns=2;s=A',deadband:1}}))).toThrow(/Deadband|deadband/i);
  expect(()=>validateCatalog(make({opcua:{nodeId:'ns=2;s=A',samplingIntervalMs:10}}))).toThrow();
  expect(()=>validateCatalog(make({opcua:{nodeId:'ns=2;s=A',deadband:-1}}))).toThrow();
  expect(()=>validateCatalog(make({opcua:{nodeId:'ns=2;s=A',endpointUrl:'opc.tcp://x'}}))).toThrow();
  expect(()=>validateCatalog(make({opcua:{nodeId:'ns=2;s=A',password:'x'}}))).toThrow();
  expect(()=>validateCatalog(make({identity:{kind:'external-id',component:'binary_sensor',value:'ns=2;s=A'}}))).toThrow(/Component|type/);
 });
});
