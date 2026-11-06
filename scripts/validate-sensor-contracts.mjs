// Development conformance checker. Not a broker client or a shipped runtime dependency.
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const root=new URL('../',import.meta.url);
const ajv=new Ajv2020({allErrors:true,strict:true,allowUnionTypes:true,strictNumbers:true});
addFormats(ajv);
const validators=Object.fromEntries(['sensor-catalog','sensor-bindings','sensor-state'].map(name=>[name,ajv.compile(JSON.parse(readFileSync(new URL(`contracts/${name}.v1.schema.json`,root),'utf8')))]));
function requireValue(condition,message){if(!condition)throw new Error(message);}
function unique(values,label){requireValue(new Set(values).size===values.length,`Duplicate ${label}`);}
export function validateDocument(name,value){
 const validate=validators[name];requireValue(!!validate,'Unknown contract');
 requireValue(validate(value),`${name}: ${ajv.errorsText(validate.errors)}`);return value;
}
export function validateCatalog(value){
 const catalog=validateDocument('sensor-catalog',value);
 unique(catalog.sources.map(s=>s.id),'source ID');unique(catalog.devices.map(s=>s.id),'device ID');unique(catalog.signals.map(s=>s.id),'signal ID');
 const sources=new Map(catalog.sources.map(s=>[s.id,s])),devices=new Map(catalog.devices.map(d=>[d.id,d]));
 const deviceAliases=[];
 for(const device of catalog.devices){
  requireValue(sources.has(device.sourceId),'Unknown device source');
  for(const id of device.externalIds)deviceAliases.push(JSON.stringify([device.sourceId,id.kind,id.type??null,id.value]));
 }
 unique(deviceAliases,'device alias');
 const identities=[];
 for(const signal of catalog.signals){
  const source=sources.get(signal.sourceId);requireValue(source,'Unknown signal source');
  identities.push(JSON.stringify([signal.sourceId,signal.identity.component,signal.identity.kind,signal.identity.value]));
  if(signal.deviceId)requireValue(devices.get(signal.deviceId)?.sourceId===signal.sourceId,'Device belongs to another or unknown source');
  requireValue((source.kind==='mqtt-discovery'||source.kind==='aas-interfaces')===!!signal.mqtt,'MQTT binding/source mismatch');
  if(!signal.mqtt)continue;
  const mqtt=signal.mqtt;
  if(source.kind==='aas-interfaces'){
   requireValue(mqtt.discoveryTopic===undefined&&mqtt.componentKey===undefined,'Interface signal has no discovery configuration');
   requireValue(signal.identity.kind==='external-id','Interface signal needs an external-id identity');
  }else{
   requireValue(['unique-id','discovery-topic'].includes(signal.identity.kind),'Invalid MQTT identity kind');
   const prefix=source.discoveryPrefix;
   requireValue(prefix && !/[+#\u0000-\u001f]/.test(prefix) && !prefix.endsWith('/'),'Missing or invalid discovery prefix');
   requireValue(mqtt.discoveryTopic!==undefined,'Discovery topic missing');
   requireValue(mqtt.discoveryTopic.startsWith(prefix+'/'),'Discovery topic outside prefix');
   const parts=mqtt.discoveryTopic.slice(prefix.length+1).split('/');
   requireValue([3,4].includes(parts.length)&&parts.at(-1)==='config'&&parts.every(Boolean),'Invalid discovery locator');
   if(parts[0]==='device')requireValue(!!mqtt.componentKey,'Device discovery needs componentKey');
   else requireValue(parts[0]===signal.identity.component&&!mqtt.componentKey,'Component discovery mismatch');
   if(signal.identity.kind==='discovery-topic')requireValue(signal.identity.value===JSON.stringify([mqtt.discoveryTopic,mqtt.componentKey??null]),'Noncanonical fallback identity');
  }
  const binary=signal.identity.component==='binary_sensor';
  requireValue(binary===(signal.dataType==='boolean'),'Component/value type mismatch');
  requireValue(binary===!!mqtt.booleanPayloads,'Binary payload mapping missing or inappropriate');
  if(binary)requireValue(mqtt.booleanPayloads.on!==mqtt.booleanPayloads.off,'Ambiguous binary payloads');
  if(mqtt.availability){unique(mqtt.availability.topics.map(t=>t.topic),'availability topic');for(const t of mqtt.availability.topics)requireValue(t.online!==t.offline,'Ambiguous availability payloads');}
 }
 unique(identities,'external signal identity');return catalog;
}
export function validateBindings(value,catalog,assetIds){
 validateCatalog(catalog);const doc=validateDocument('sensor-bindings',value);
 requireValue(doc.catalogId===catalog.catalogId,'Catalog mismatch');unique(doc.bindings.map(b=>b.id),'binding ID');unique(doc.bindings.map(b=>b.signalId),'signal assignment');
 const signals=new Set(catalog.signals.map(s=>s.id)),assets=new Set(assetIds);
 for(const b of doc.bindings){requireValue(signals.has(b.signalId),'Unknown signal binding');requireValue(assets.has(b.assetId),'Unknown model asset');}
 return doc;
}
export function validateState(value,catalog){
 validateCatalog(catalog);const state=validateDocument('sensor-state',value),signal=catalog.signals.find(s=>s.id===state.signalId);
 requireValue(state.catalogId===catalog.catalogId&&signal?.sourceId===state.sourceId,'State identity mismatch');
 requireValue(signal.lifecycle==='active','Removed signal has no active runtime state');
 if(state.reading?.quality==='valid')requireValue(typeof state.reading.value===signal.dataType,'State value type mismatch');
 if(state.freshness==='fresh'){
  requireValue(state.sourceConnection==='connected'&&state.availability==='online'&&state.reading?.quality==='valid','Invalid freshness claim');
  requireValue(!state.reading.retained||state.reading.observedAt!==null,'Retained value without observed time is not fresh');
 }
 if(state.reading)requireValue(Date.parse(state.reading.receivedAt)<=Date.parse(state.emittedAt),'Reading received after state emission');
 return state;
}
