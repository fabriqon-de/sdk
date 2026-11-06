import { describe, expect, it } from 'vitest';
import * as jsonization from '@aas-core-works/aas-core3.0-typescript/jsonization';
import * as verification from '@aas-core-works/aas-core3.0-typescript/verification';
import {
  buildBillOfMaterial, buildNameplate, isNameplate, parseAasEnvironment, readAssetInterfaces, readNameplate,
  serializeAasEnvironment, stripCredentials, stripEnvironmentCredentials, submodelReference, submodelsOf, toIdShort, NAMEPLATE_V3, type AasEnvironment,
} from '../src/aas.js';
import { ModelValidationError } from '../src/model.js';

/** Checks an environment against the official AAS V3 metamodel implementation (aas-core-works). */
function officialErrors(environment: AasEnvironment): string[] {
  const parsed = jsonization.environmentFromJsonable(JSON.parse(serializeAasEnvironment(environment)));
  if (parsed.error !== null) return [`${parsed.error.path}: ${parsed.error.message}`];
  return [...verification.verify(parsed.mustValue())].map((e) => `${e.path}: ${e.message}`);
}

const nameplate = buildNameplate('urn:example:sm:nameplate:1', {
  manufacturerName: 'Beispiel GmbH', manufacturerProductDesignation: 'Steuerung S1', serialNumber: 'SN-42', yearOfConstruction: '2025', firmwareVersion: '2.1',
});
const env: AasEnvironment = {
  assetAdministrationShells: [{
    modelType: 'AssetAdministrationShell', id: 'urn:example:aas:1', idShort: 'Controller',
    assetInformation: { assetKind: 'Instance', globalAssetId: 'urn:example:asset:1', specificAssetIds: [{ name: 'serialNumber', value: 'SN-42' }] },
    submodels: [submodelReference(nameplate.submodel.id)],
  }],
  submodels: [nameplate.submodel],
};

describe('AAS environment', () => {
  it('writes a nameplate that the official metamodel accepts and reads it back', () => {
    expect(officialErrors(env)).toEqual([]);
    const parsed = parseAasEnvironment(JSON.parse(serializeAasEnvironment(env)));
    const [sm] = submodelsOf(parsed, parsed.assetAdministrationShells![0]);
    expect(isNameplate(sm)).toBe(true);
    expect(readNameplate(sm)).toEqual({ manufacturerName: 'Beispiel GmbH', manufacturerProductDesignation: 'Steuerung S1', serialNumber: 'SN-42', yearOfConstruction: '2025', firmwareVersion: '2.1' });
  });

  it('lists missing mandatory template elements instead of inventing them', () => {
    expect(nameplate.missing).toEqual(['URIOfTheProduct', 'OrderCodeOfManufacturer', 'AddressInformation']);
    expect(JSON.stringify(nameplate.submodel)).not.toContain('URIOfTheProduct');
  });

  it('reads older nameplates by ECLASS IRDI and prefers the requested language', () => {
    const sm = parseAasEnvironment({ submodels: [{ modelType: 'Submodel', id: 'x', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate' }] }, submodelElements: [
      { modelType: 'MultiLanguageProperty', idShort: 'Hersteller', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '0173-1#02-AAO677#002' }] }, value: [{ language: 'en', text: 'Example Ltd' }, { language: 'de', text: 'Beispiel GmbH' }] },
      { modelType: 'Property', idShort: 'SerialNumber', valueType: 'xs:string', value: ' 7 ' },
    ] }] }).submodels![0];
    expect(isNameplate(sm)).toBe(true);
    expect(readNameplate(sm)).toEqual({ manufacturerName: 'Beispiel GmbH', serialNumber: '7' });
    expect(readNameplate(sm, ['en']).manufacturerName).toBe('Example Ltd');
  });

  it('keeps known fields, drops extensions and blob content, and detaches from the input', () => {
    const input = { submodels: [{ modelType: 'Submodel', id: 's', extensions: [{ name: 'x' }], submodelElements: [{ modelType: 'Blob', idShort: 'B', contentType: 'image/png', value: 'AAAA' }] }] };
    const parsed = parseAasEnvironment(input);
    expect(parsed.submodels![0]).toEqual({ modelType: 'Submodel', id: 's', submodelElements: [{ modelType: 'Blob', idShort: 'B', contentType: 'image/png' }] });
    (parsed.submodels![0] as { id: string }).id = 'changed';
    expect(input.submodels[0].id).toBe('s');
  });

  it('rejects invalid shapes, duplicates and oversized input', () => {
    expect(() => parseAasEnvironment(null)).toThrow(ModelValidationError);
    expect(() => parseAasEnvironment({ submodels: [{ modelType: 'Submodel', id: 's', submodelElements: [{ modelType: 'Script' }] }] })).toThrow(/Unknown submodel element/);
    expect(() => parseAasEnvironment({ submodels: [{ modelType: 'Submodel', id: 's', idShort: '1bad' }] })).toThrow(/idShort/);
    expect(() => parseAasEnvironment({ submodels: [{ modelType: 'Submodel', id: 's' }, { modelType: 'Submodel', id: 's' }] })).toThrow(/Duplicate/);
    const deep = (n: number): unknown => (n === 0 ? { modelType: 'Property', valueType: 'xs:string' } : { modelType: 'SubmodelElementCollection', value: [deep(n - 1)] });
    expect(() => parseAasEnvironment({ submodels: [{ modelType: 'Submodel', id: 's', submodelElements: [deep(40)] }] })).toThrow(/deeper/);
    const many = Array.from({ length: 30 }, () => ({ modelType: 'Property', valueType: 'xs:string' }));
    expect(() => parseAasEnvironment({ submodels: [{ modelType: 'Submodel', id: 's', submodelElements: many }] }, { maxElements: 20 })).toThrow(/Too many|elements/);
  });

  it('builds a one-level bill of material accepted by the official metamodel', () => {
    const bom = buildBillOfMaterial('urn:example:sm:bom', { idShort: 'Halle 1', globalAssetId: 'urn:example:plant' }, [{ idShort: 'PLC.1', globalAssetId: 'urn:example:asset:1' }, { idShort: 'PLC-1', globalAssetId: 'urn:example:asset:2' }]);
    expect(officialErrors({ submodels: [bom] })).toEqual([]);
    expect(JSON.stringify(bom)).toContain('OneDown');
  });

  it('creates valid, unique idShorts', () => {
    const used = new Set<string>();
    expect(['1-PLC', 'Förderband', 'PLC', 'PLC', '_x-'].map((t) => toIdShort(t, used))).toEqual(['PLC', 'Forderband', 'PLC_2', 'PLC_3', 'x']);
  });
});

describe('Asset Interfaces Description', () => {
  const prop = (idShort: string, value: string) => ({ modelType: 'Property', idShort, valueType: 'xs:string', value });
  const sm = parseAasEnvironment({ submodels: [{ modelType: 'Submodel', id: 'aid', idShort: 'AssetInterfacesDescription', submodelElements: [{
    modelType: 'SubmodelElementCollection', idShort: 'MQTT', semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/idta/AssetInterfacesDescription/1/0/Interface' }] },
    value: [
      prop('title', 'Sensor'),
      { modelType: 'SubmodelElementCollection', idShort: 'EndpointMetadata', value: [prop('base', 'mqtts://user:secret@broker.example:8883')] },
      { modelType: 'SubmodelElementCollection', idShort: 'InteractionMetadata', value: [{ modelType: 'SubmodelElementCollection', idShort: 'properties', value: [{
        modelType: 'SubmodelElementCollection', idShort: 'temperature', value: [prop('key', 'temperature'), prop('unit', 'CEL'), prop('observable', 'true'), { modelType: 'SubmodelElementCollection', idShort: 'forms', value: [prop('href', '/lab/temp')] }],
      }] }] },
    ],
  }] }] }).submodels![0];

  it('lists MQTT properties and never returns user information', () => {
    expect(readAssetInterfaces(sm)).toEqual([{ idShort: 'MQTT', title: 'Sensor', protocol: 'mqtt', base: 'mqtts://broker.example:8883', properties: [{ key: 'temperature', href: '/lab/temp', unit: 'CEL', observable: true }] }]);
    expect(stripCredentials('opc.tcp://a:b@host:4840')).toBe('opc.tcp://host:4840');
    const { environment, removed } = stripEnvironmentCredentials({ submodels: [sm] });
    expect(removed).toBe(1);
    expect(JSON.stringify(environment)).not.toContain('secret');
    expect(JSON.stringify(sm)).toContain('secret');
  });

  it('exports the nameplate semantic ID of IDTA 02006-3-0', () => {
    expect(NAMEPLATE_V3.submodel).toBe('https://admin-shell.io/idta/nameplate/3/0/Nameplate');
  });
});
