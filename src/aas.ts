/**
 * Asset Administration Shell (AAS) metamodel V3, JSON serialization.
 * Neutral building blocks: types, a bounded parser, the Digital Nameplate (IDTA 02006-3-0),
 * Hierarchical Structures (IDTA 02011-1-1) and a reader for Asset Interfaces Description (IDTA 02017).
 * No runtime imports or platform globals.
 */
import { ModelValidationError } from './model.js';

export interface LangString { language: string; text: string }
export interface AasKey { type: string; value: string }
export interface AasReference { type: 'ExternalReference' | 'ModelReference'; keys: AasKey[] }
export interface AasQualifier { type: string; valueType: string; value?: string; kind?: string; semanticId?: AasReference }
export interface AasAdministration { version?: string; revision?: string }

interface Referable {
  idShort?: string;
  displayName?: LangString[];
  description?: LangString[];
  category?: string;
  semanticId?: AasReference;
  supplementalSemanticIds?: AasReference[];
  qualifiers?: AasQualifier[];
}

export interface AasProperty extends Referable { modelType: 'Property'; valueType: string; value?: string; valueId?: AasReference }
export interface AasMultiLanguageProperty extends Referable { modelType: 'MultiLanguageProperty'; value?: LangString[]; valueId?: AasReference }
export interface AasRange extends Referable { modelType: 'Range'; valueType: string; min?: string; max?: string }
export interface AasFile extends Referable { modelType: 'File'; contentType?: string; value?: string }
/** Blob content is not kept: only the content type survives parsing. */
export interface AasBlob extends Referable { modelType: 'Blob'; contentType?: string }
export interface AasReferenceElement extends Referable { modelType: 'ReferenceElement'; value?: AasReference }
export interface AasRelationshipElement extends Referable { modelType: 'RelationshipElement'; first?: AasReference; second?: AasReference }
export interface AasAnnotatedRelationshipElement extends Referable { modelType: 'AnnotatedRelationshipElement'; first?: AasReference; second?: AasReference; annotations?: AasSubmodelElement[] }
export interface AasEntity extends Referable { modelType: 'Entity'; entityType?: 'CoManagedEntity' | 'SelfManagedEntity'; globalAssetId?: string; statements?: AasSubmodelElement[] }
export interface AasCollection extends Referable { modelType: 'SubmodelElementCollection'; value?: AasSubmodelElement[] }
export interface AasList extends Referable {
  modelType: 'SubmodelElementList'; typeValueListElement: string; valueTypeListElement?: string;
  semanticIdListElement?: AasReference; orderRelevant?: boolean; value?: AasSubmodelElement[];
}
/** Operations, capabilities and events are kept as descriptive leaves without variables or broker settings. */
export interface AasOtherElement extends Referable { modelType: 'Operation' | 'Capability' | 'BasicEventElement' }

export type AasSubmodelElement =
  | AasProperty | AasMultiLanguageProperty | AasRange | AasFile | AasBlob | AasReferenceElement
  | AasRelationshipElement | AasAnnotatedRelationshipElement | AasEntity | AasCollection | AasList | AasOtherElement;

export interface AasSpecificAssetId { name: string; value: string; semanticId?: AasReference }
export interface AasAssetInformation {
  assetKind: 'Instance' | 'Type' | 'NotApplicable';
  globalAssetId?: string;
  specificAssetIds?: AasSpecificAssetId[];
  assetType?: string;
  defaultThumbnail?: { path: string; contentType?: string };
}
export interface AasShell extends Omit<Referable, 'semanticId' | 'supplementalSemanticIds' | 'qualifiers'> {
  modelType: 'AssetAdministrationShell'; id: string; administration?: AasAdministration;
  assetInformation: AasAssetInformation; submodels?: AasReference[];
}
export interface AasSubmodel extends Referable {
  modelType: 'Submodel'; id: string; kind?: 'Instance' | 'Template'; administration?: AasAdministration;
  submodelElements?: AasSubmodelElement[];
}
export interface AasConceptDescription extends Omit<Referable, 'semanticId' | 'supplementalSemanticIds' | 'qualifiers'> {
  modelType: 'ConceptDescription'; id: string; isCaseOf?: AasReference[];
}
export interface AasEnvironment {
  assetAdministrationShells?: AasShell[];
  submodels?: AasSubmodel[];
  conceptDescriptions?: AasConceptDescription[];
}

export interface AasLimits {
  /** Shells + submodels + concept descriptions + submodel elements */
  maxElements: number;
  maxDepth: number;
  /** Characters per string value */
  maxString: number;
}
export const AAS_LIMITS: AasLimits = { maxElements: 50_000, maxDepth: 32, maxString: 20_000 };

const SME_TYPES = [
  'Property', 'MultiLanguageProperty', 'Range', 'File', 'Blob', 'ReferenceElement', 'RelationshipElement',
  'AnnotatedRelationshipElement', 'Entity', 'SubmodelElementCollection', 'SubmodelElementList', 'Operation', 'Capability', 'BasicEventElement',
] as const;
const ASSET_KINDS = ['Instance', 'Type', 'NotApplicable'] as const;
/** AASd-002 (metamodel V3.0) */
const ID_SHORT = /^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9_]+$|^[a-zA-Z]$/;

function fail(path: string, message: string): never { throw new ModelValidationError(path, message); }

class Reader {
  private count = 0;
  constructor(private readonly limits: AasLimits) {}
  tick(path: string) { if (++this.count > this.limits.maxElements) fail(path, `More than ${this.limits.maxElements} elements`); }
  obj(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'Expected an object');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return fail(path, 'Expected a plain object');
    return value as Record<string, unknown>;
  }
  str(value: unknown, path: string, min = 0): string {
    if (typeof value !== 'string' || value.length < min || value.length > this.limits.maxString) return fail(path, `Expected a string of ${min}–${this.limits.maxString} characters`);
    return value;
  }
  optStr(value: unknown, path: string): string | undefined { return value === undefined || value === null ? undefined : this.str(value, path); }
  arr(value: unknown, path: string): unknown[] | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) return fail(path, 'Expected an array');
    if (value.length > this.limits.maxElements) return fail(path, 'Too many entries');
    return value;
  }
  idShort(value: unknown, path: string): string | undefined {
    const result = this.optStr(value, path);
    if (result !== undefined && (result.length > 128 || !ID_SHORT.test(result))) return fail(path, 'Invalid idShort');
    return result;
  }
  identifier(value: unknown, path: string): string {
    const result = this.str(value, path, 1);
    if (result.length > 2000) return fail(path, 'Identifier longer than 2000 characters');
    return result;
  }
  langs(value: unknown, path: string): LangString[] | undefined {
    const list = this.arr(value, path);
    if (!list) return undefined;
    return list.map((entry, i) => {
      const o = this.obj(entry, `${path}[${i}]`);
      return { language: this.str(o.language, `${path}[${i}].language`, 1), text: this.str(o.text, `${path}[${i}].text`) };
    });
  }
  ref(value: unknown, path: string): AasReference | undefined {
    if (value === undefined || value === null) return undefined;
    const o = this.obj(value, path);
    const type = o.type === 'ExternalReference' || o.type === 'ModelReference' ? o.type : fail(`${path}.type`, 'Expected ExternalReference or ModelReference');
    const keys = this.arr(o.keys, `${path}.keys`) ?? fail(`${path}.keys`, 'Keys are missing');
    if (keys.length === 0) fail(`${path}.keys`, 'Keys are missing');
    return { type, keys: keys.map((k, i) => { const ko = this.obj(k, `${path}.keys[${i}]`); return { type: this.str(ko.type, `${path}.keys[${i}].type`, 1), value: this.identifier(ko.value, `${path}.keys[${i}].value`) }; }) };
  }
  refs(value: unknown, path: string): AasReference[] | undefined {
    return this.arr(value, path)?.map((entry, i) => this.ref(entry, `${path}[${i}]`)!);
  }
  referable(o: Record<string, unknown>, path: string): Referable {
    return clean({
      idShort: this.idShort(o.idShort, `${path}.idShort`),
      displayName: this.langs(o.displayName, `${path}.displayName`),
      description: this.langs(o.description, `${path}.description`),
      category: this.optStr(o.category, `${path}.category`),
      semanticId: this.ref(o.semanticId, `${path}.semanticId`),
      supplementalSemanticIds: this.refs(o.supplementalSemanticIds, `${path}.supplementalSemanticIds`),
      qualifiers: this.arr(o.qualifiers, `${path}.qualifiers`)?.map((q, i) => {
        const qo = this.obj(q, `${path}.qualifiers[${i}]`);
        return clean({ type: this.str(qo.type, `${path}.qualifiers[${i}].type`, 1), valueType: this.str(qo.valueType, `${path}.qualifiers[${i}].valueType`, 1), value: this.optStr(qo.value, `${path}.qualifiers[${i}].value`), kind: this.optStr(qo.kind, `${path}.qualifiers[${i}].kind`), semanticId: this.ref(qo.semanticId, `${path}.qualifiers[${i}].semanticId`) });
      }),
    });
  }
  administration(value: unknown, path: string): AasAdministration | undefined {
    if (value === undefined || value === null) return undefined;
    const o = this.obj(value, path);
    return clean({ version: this.optStr(o.version, `${path}.version`), revision: this.optStr(o.revision, `${path}.revision`) });
  }
  elements(value: unknown, path: string, depth: number): AasSubmodelElement[] | undefined {
    return this.arr(value, path)?.map((entry, i) => this.element(entry, `${path}[${i}]`, depth));
  }
  element(value: unknown, path: string, depth: number): AasSubmodelElement {
    if (depth > this.limits.maxDepth) fail(path, `Nested deeper than ${this.limits.maxDepth}`);
    this.tick(path);
    const o = this.obj(value, path);
    const modelType = SME_TYPES.find((t) => t === o.modelType) ?? fail(`${path}.modelType`, 'Unknown submodel element type');
    const base = this.referable(o, path);
    const p = (key: string) => `${path}.${key}`;
    switch (modelType) {
      case 'Property': return clean({ modelType, ...base, valueType: this.str(o.valueType, p('valueType'), 1), value: this.optStr(o.value, p('value')), valueId: this.ref(o.valueId, p('valueId')) });
      case 'MultiLanguageProperty': return clean({ modelType, ...base, value: this.langs(o.value, p('value')), valueId: this.ref(o.valueId, p('valueId')) });
      case 'Range': return clean({ modelType, ...base, valueType: this.str(o.valueType, p('valueType'), 1), min: this.optStr(o.min, p('min')), max: this.optStr(o.max, p('max')) });
      case 'File': return clean({ modelType, ...base, contentType: this.optStr(o.contentType, p('contentType')), value: this.optStr(o.value, p('value')) });
      case 'Blob': return clean({ modelType, ...base, contentType: this.optStr(o.contentType, p('contentType')) });
      case 'ReferenceElement': return clean({ modelType, ...base, value: this.ref(o.value, p('value')) });
      case 'RelationshipElement': return clean({ modelType, ...base, first: this.ref(o.first, p('first')), second: this.ref(o.second, p('second')) });
      case 'AnnotatedRelationshipElement': return clean({ modelType, ...base, first: this.ref(o.first, p('first')), second: this.ref(o.second, p('second')), annotations: this.elements(o.annotations, p('annotations'), depth + 1) });
      case 'Entity': {
        const entityType = o.entityType === undefined || o.entityType === null ? undefined : o.entityType === 'CoManagedEntity' || o.entityType === 'SelfManagedEntity' ? o.entityType : fail(p('entityType'), 'Unknown entity type');
        const globalAssetId = o.globalAssetId === undefined || o.globalAssetId === null ? undefined : this.identifier(o.globalAssetId, p('globalAssetId'));
        return clean({ modelType, ...base, entityType, globalAssetId, statements: this.elements(o.statements, p('statements'), depth + 1) });
      }
      case 'SubmodelElementCollection': return clean({ modelType, ...base, value: this.elements(o.value, p('value'), depth + 1) });
      case 'SubmodelElementList': {
        const orderRelevant = o.orderRelevant === undefined || o.orderRelevant === null ? undefined : typeof o.orderRelevant === 'boolean' ? o.orderRelevant : fail(p('orderRelevant'), 'Expected a boolean');
        return clean({ modelType, ...base, typeValueListElement: this.str(o.typeValueListElement, p('typeValueListElement'), 1), valueTypeListElement: this.optStr(o.valueTypeListElement, p('valueTypeListElement')), semanticIdListElement: this.ref(o.semanticIdListElement, p('semanticIdListElement')), orderRelevant, value: this.elements(o.value, p('value'), depth + 1) });
      }
      default: return { modelType, ...base };
    }
  }
}

/** Removes undefined values so parsed objects serialize like their input. */
function clean<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) if (value[key] === undefined) delete value[key];
  return value;
}

/**
 * Validates an AAS V3 JSON environment and returns a detached copy that contains only known fields.
 * Extensions, embedded data specifications, blob content and operation variables are dropped.
 */
export function parseAasEnvironment(value: unknown, limits: Partial<AasLimits> = {}): AasEnvironment {
  const r = new Reader({ ...AAS_LIMITS, ...limits });
  const o = r.obj(value, 'environment');
  const shells = r.arr(o.assetAdministrationShells, 'assetAdministrationShells')?.map((entry, i): AasShell => {
    const path = `assetAdministrationShells[${i}]`;
    r.tick(path);
    const s = r.obj(entry, path);
    const { idShort, displayName, description, category } = r.referable({ idShort: s.idShort, displayName: s.displayName, description: s.description, category: s.category }, path);
    const ai = r.obj(s.assetInformation, `${path}.assetInformation`);
    const assetKind = ASSET_KINDS.find((k) => k === ai.assetKind) ?? fail(`${path}.assetInformation.assetKind`, 'Unknown asset kind');
    const thumb = ai.defaultThumbnail === undefined || ai.defaultThumbnail === null ? undefined : r.obj(ai.defaultThumbnail, `${path}.assetInformation.defaultThumbnail`);
    return clean({
      modelType: 'AssetAdministrationShell' as const, id: r.identifier(s.id, `${path}.id`), idShort, displayName, description, category,
      administration: r.administration(s.administration, `${path}.administration`),
      assetInformation: clean({
        assetKind,
        globalAssetId: ai.globalAssetId === undefined || ai.globalAssetId === null ? undefined : r.identifier(ai.globalAssetId, `${path}.assetInformation.globalAssetId`),
        specificAssetIds: r.arr(ai.specificAssetIds, `${path}.assetInformation.specificAssetIds`)?.map((sa, j) => {
          const so = r.obj(sa, `${path}.assetInformation.specificAssetIds[${j}]`);
          return clean({ name: r.str(so.name, `${path}.assetInformation.specificAssetIds[${j}].name`, 1), value: r.str(so.value, `${path}.assetInformation.specificAssetIds[${j}].value`, 1), semanticId: r.ref(so.semanticId, `${path}.assetInformation.specificAssetIds[${j}].semanticId`) });
        }),
        assetType: r.optStr(ai.assetType, `${path}.assetInformation.assetType`),
        defaultThumbnail: thumb && clean({ path: r.str(thumb.path, `${path}.assetInformation.defaultThumbnail.path`, 1), contentType: r.optStr(thumb.contentType, `${path}.assetInformation.defaultThumbnail.contentType`) }),
      }),
      submodels: r.refs(s.submodels, `${path}.submodels`),
    });
  });
  const submodels = r.arr(o.submodels, 'submodels')?.map((entry, i): AasSubmodel => {
    const path = `submodels[${i}]`;
    r.tick(path);
    const s = r.obj(entry, path);
    const kind = s.kind === undefined || s.kind === null ? undefined : s.kind === 'Instance' || s.kind === 'Template' ? s.kind : fail(`${path}.kind`, 'Unknown kind');
    return clean({ modelType: 'Submodel' as const, id: r.identifier(s.id, `${path}.id`), ...r.referable(s, path), kind, administration: r.administration(s.administration, `${path}.administration`), submodelElements: r.elements(s.submodelElements, `${path}.submodelElements`, 1) });
  });
  const conceptDescriptions = r.arr(o.conceptDescriptions, 'conceptDescriptions')?.map((entry, i): AasConceptDescription => {
    const path = `conceptDescriptions[${i}]`;
    r.tick(path);
    const c = r.obj(entry, path);
    const { idShort, displayName, description, category } = r.referable({ idShort: c.idShort, displayName: c.displayName, description: c.description, category: c.category }, path);
    return clean({ modelType: 'ConceptDescription' as const, id: r.identifier(c.id, `${path}.id`), idShort, displayName, description, category, isCaseOf: r.refs(c.isCaseOf, `${path}.isCaseOf`) });
  });
  for (const [name, list] of [['assetAdministrationShells', shells], ['submodels', submodels], ['conceptDescriptions', conceptDescriptions]] as const) {
    const seen = new Set<string>();
    for (const item of list ?? []) {
      if (seen.has(item.id)) fail(name, `Duplicate id ${item.id}`);
      seen.add(item.id);
    }
  }
  return clean({ assetAdministrationShells: shells, submodels, conceptDescriptions });
}

export function serializeAasEnvironment(environment: AasEnvironment): string {
  return JSON.stringify(parseAasEnvironment(environment), null, 2);
}

// ─── references and lookup ───────────────────────────────────────────────────

export const globalReference = (value: string): AasReference => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value }] });
export const submodelReference = (id: string): AasReference => ({ type: 'ModelReference', keys: [{ type: 'Submodel', value: id }] });
export const semanticIdOf = (item: { semanticId?: AasReference }): string | undefined => item.semanticId?.keys[0]?.value;

/** Submodels a shell references, in reference order. Missing submodels are skipped. */
export function submodelsOf(environment: AasEnvironment, shell: AasShell): AasSubmodel[] {
  const byId = new Map((environment.submodels ?? []).map((s) => [s.id, s]));
  return (shell.submodels ?? []).flatMap((ref) => {
    const key = ref.keys.find((k) => k.type === 'Submodel') ?? ref.keys[ref.keys.length - 1];
    const submodel = key && byId.get(key.value);
    return submodel ? [submodel] : [];
  });
}

/**
 * Valid, sibling-unique idShort from free text. Written idShorts use the strict V3.0 form
 * `[a-zA-Z][a-zA-Z0-9_]*`; the parser also accepts the hyphen allowed by V3.1.
 */
export function toIdShort(text: string, used?: Set<string>): string {
  let base = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^[^a-zA-Z]+/, '').replace(/_+$/, '').slice(0, 120);
  if (!base) base = 'Item';
  let result = base;
  for (let n = 2; used?.has(result); n++) result = `${base}_${n}`;
  used?.add(result);
  return result;
}

// ─── Digital Nameplate ───────────────────────────────────────────────────────

export const NAMEPLATE_V3 = {
  submodel: 'https://admin-shell.io/idta/nameplate/3/0/Nameplate',
  addressInformation: 'https://admin-shell.io/zvei/nameplate/1/0/ContactInformations/AddressInformation',
} as const;
/** Older nameplate versions are read but never written. */
export const NAMEPLATE_LEGACY = ['https://admin-shell.io/zvei/nameplate/2/0/Nameplate', 'https://admin-shell.io/zvei/nameplate/1/0/Nameplate'] as const;

export interface NameplateData {
  uriOfTheProduct?: string;
  manufacturerName?: string;
  manufacturerProductDesignation?: string;
  manufacturerProductType?: string;
  orderCodeOfManufacturer?: string;
  productArticleNumberOfManufacturer?: string;
  serialNumber?: string;
  yearOfConstruction?: string;
  dateOfManufacture?: string;
  hardwareVersion?: string;
  firmwareVersion?: string;
  softwareVersion?: string;
  countryOfOrigin?: string;
}
type NameplateField = keyof NameplateData;

/** idShort, element type and IEC CDD semantic ID per IDTA 02006-3-0; V2 IRDIs (ECLASS) for reading older nameplates. */
const NAMEPLATE_FIELDS: ReadonlyArray<{ key: NameplateField; idShort: string; mlp: boolean; valueType?: string; v3: string; v2: string; required?: boolean }> = [
  { key: 'uriOfTheProduct', idShort: 'URIOfTheProduct', mlp: false, valueType: 'xs:anyURI', v3: '0112/2///61987#ABN590#002', v2: '0173-1#02-AAY811#001', required: true },
  { key: 'manufacturerName', idShort: 'ManufacturerName', mlp: true, v3: '0112/2///61987#ABA565#009', v2: '0173-1#02-AAO677#002', required: true },
  { key: 'manufacturerProductDesignation', idShort: 'ManufacturerProductDesignation', mlp: true, v3: '0112/2///61987#ABA567#009', v2: '0173-1#02-AAW338#001', required: true },
  { key: 'manufacturerProductType', idShort: 'ManufacturerProductType', mlp: false, v3: '0112/2///61987#ABA300#008', v2: '0173-1#02-AAO057#002' },
  { key: 'orderCodeOfManufacturer', idShort: 'OrderCodeOfManufacturer', mlp: false, v3: '0112/2///61987#ABA950#008', v2: '0173-1#02-AAO227#002', required: true },
  { key: 'productArticleNumberOfManufacturer', idShort: 'ProductArticleNumberOfManufacturer', mlp: false, v3: '0112/2///61987#ABA581#007', v2: '0173-1#02-AAO676#003' },
  { key: 'serialNumber', idShort: 'SerialNumber', mlp: false, v3: '0112/2///61987#ABA951#009', v2: '0173-1#02-AAM556#002' },
  { key: 'yearOfConstruction', idShort: 'YearOfConstruction', mlp: false, v3: '0112/2///61987#ABP000#002', v2: '0173-1#02-AAP906#001' },
  { key: 'dateOfManufacture', idShort: 'DateOfManufacture', mlp: false, valueType: 'xs:date', v3: '0112/2///61987#ABB757#007', v2: '0173-1#02-AAR972#002' },
  { key: 'hardwareVersion', idShort: 'HardwareVersion', mlp: false, v3: '0112/2///61987#ABA926#008', v2: '0173-1#02-AAN270#002' },
  { key: 'firmwareVersion', idShort: 'FirmwareVersion', mlp: false, v3: '0112/2///61987#ABA302#006', v2: '0173-1#02-AAM985#002' },
  { key: 'softwareVersion', idShort: 'SoftwareVersion', mlp: false, v3: '0112/2///61987#ABA601#008', v2: '0173-1#02-AAM737#002' },
  { key: 'countryOfOrigin', idShort: 'CountryOfOrigin', mlp: false, v3: '0112/2///61987#ABP462#001', v2: '0173-1#02-AAO259#004' },
];

export const isNameplate = (submodel: AasSubmodel): boolean => {
  const sid = semanticIdOf(submodel);
  return sid === NAMEPLATE_V3.submodel || (NAMEPLATE_LEGACY as readonly string[]).includes(sid ?? '');
};

function pickLang(values: LangString[] | undefined, languages: readonly string[]): string | undefined {
  if (!values?.length) return undefined;
  for (const lang of languages) {
    const hit = values.find((v) => v.language.toLowerCase().split('-')[0] === lang);
    if (hit?.text.trim()) return hit.text.trim();
  }
  return values.find((v) => v.text.trim())?.text.trim();
}

/** Reads nameplate values by semantic ID, falling back to idShort. Unknown or empty values stay undefined. */
export function readNameplate(submodel: AasSubmodel, languages: readonly string[] = ['de', 'en']): NameplateData {
  const result: NameplateData = {};
  for (const field of NAMEPLATE_FIELDS) {
    const element = submodel.submodelElements?.find((e) => { const sid = semanticIdOf(e); return sid === field.v3 || sid === field.v2; })
      ?? submodel.submodelElements?.find((e) => e.idShort === field.idShort);
    if (!element) continue;
    const text = element.modelType === 'Property' ? element.value?.trim() : element.modelType === 'MultiLanguageProperty' ? pickLang(element.value, languages) : undefined;
    if (text) result[field.key] = text;
  }
  return result;
}

export interface NameplateResult { submodel: AasSubmodel; missing: string[] }

/**
 * Builds a Digital Nameplate (IDTA 02006-3-0) instance. Only given values are written; nothing is invented.
 * `missing` lists the template's mandatory elements that are absent, so the caller can show them.
 */
export function buildNameplate(id: string, data: NameplateData, language = 'de'): NameplateResult {
  const elements: AasSubmodelElement[] = [];
  const missing: string[] = [];
  for (const field of NAMEPLATE_FIELDS) {
    const value = data[field.key]?.trim();
    if (!value) {
      if (field.required) missing.push(field.idShort);
      continue;
    }
    elements.push(field.mlp
      ? { modelType: 'MultiLanguageProperty', idShort: field.idShort, semanticId: globalReference(field.v3), value: [{ language, text: value }] }
      : { modelType: 'Property', idShort: field.idShort, semanticId: globalReference(field.v3), valueType: field.valueType ?? 'xs:string', value });
  }
  // The manufacturer address is mandatory in the template but not part of NameplateData.
  missing.push('AddressInformation');
  return {
    submodel: { modelType: 'Submodel', id, idShort: 'Nameplate', kind: 'Instance', semanticId: globalReference(NAMEPLATE_V3.submodel), administration: { version: '3', revision: '0' }, ...(elements.length > 0 && { submodelElements: elements }) },
    missing,
  };
}

// ─── Hierarchical Structures enabling Bills of Material ──────────────────────

export const HIERARCHICAL_STRUCTURES = {
  submodel: 'https://admin-shell.io/idta/HierarchicalStructures/1/1/Submodel',
  entryNode: 'https://admin-shell.io/idta/HierarchicalStructures/EntryNode/1/0',
  node: 'https://admin-shell.io/idta/HierarchicalStructures/Node/1/0',
  hasPart: 'https://admin-shell.io/idta/HierarchicalStructures/HasPart/1/0',
  archeType: 'https://admin-shell.io/idta/HierarchicalStructures/ArcheType/1/0',
} as const;

export interface StructureNode { idShort: string; globalAssetId: string }

/** One level down: the entry node (e.g. a plant) has the given parts. */
export function buildBillOfMaterial(id: string, entry: StructureNode, parts: readonly StructureNode[]): AasSubmodel {
  const used = new Set<string>();
  const entryIdShort = toIdShort(entry.idShort, used);
  const nodes: AasSubmodelElement[] = [];
  const relations: AasSubmodelElement[] = [];
  for (const part of parts) {
    const idShort = toIdShort(part.idShort, used);
    nodes.push({ modelType: 'Entity', idShort, semanticId: globalReference(HIERARCHICAL_STRUCTURES.node), entityType: 'SelfManagedEntity', globalAssetId: part.globalAssetId });
    const path = (...keys: AasKey[]): AasReference => ({ type: 'ModelReference', keys: [{ type: 'Submodel', value: id }, { type: 'Entity', value: entryIdShort }, ...keys] });
    relations.push({ modelType: 'RelationshipElement', idShort: toIdShort(`HasPart_${idShort}`, used), semanticId: globalReference(HIERARCHICAL_STRUCTURES.hasPart), first: path(), second: path({ type: 'Entity', value: idShort }) });
  }
  return {
    modelType: 'Submodel', id, idShort: 'HierarchicalStructures', kind: 'Instance', semanticId: globalReference(HIERARCHICAL_STRUCTURES.submodel), administration: { version: '1', revision: '1' },
    submodelElements: [
      { modelType: 'Property', idShort: 'ArcheType', semanticId: globalReference(HIERARCHICAL_STRUCTURES.archeType), valueType: 'xs:string', value: 'OneDown' },
      { modelType: 'Entity', idShort: entryIdShort, semanticId: globalReference(HIERARCHICAL_STRUCTURES.entryNode), entityType: 'SelfManagedEntity', globalAssetId: entry.globalAssetId, ...(parts.length > 0 && { statements: [...nodes, ...relations] }) },
    ],
  };
}

// ─── Asset Interfaces Description (read only) ───────────────────────────────

export const ASSET_INTERFACES = {
  submodels: ['https://admin-shell.io/idta/AssetInterfacesDescription/1/0/Submodel', 'https://admin-shell.io/idta/AssetInterfacesDescription/1/1/Submodel'],
  interface: ['https://admin-shell.io/idta/AssetInterfacesDescription/1/0/Interface', 'https://admin-shell.io/idta/AssetInterfacesDescription/1/1/Interface'],
} as const;

export interface InterfaceProperty { key: string; title?: string; href?: string; unit?: string; type?: string; observable?: boolean }
export interface AssetInterface {
  idShort: string;
  title?: string;
  protocol: 'mqtt' | 'http' | 'modbus' | 'opcua' | 'other';
  /** Endpoint without user information; credentials are never returned. */
  base?: string;
  properties: InterfaceProperty[];
}

export const isAssetInterfaces = (submodel: AasSubmodel): boolean => (ASSET_INTERFACES.submodels as readonly string[]).includes(semanticIdOf(submodel) ?? '') || submodel.idShort === 'AssetInterfacesDescription';

const childrenOf = (element: AasSubmodelElement | undefined): AasSubmodelElement[] =>
  element && (element.modelType === 'SubmodelElementCollection' || element.modelType === 'SubmodelElementList') ? element.value ?? [] : [];
const child = (element: AasSubmodelElement | undefined, idShort: string) => childrenOf(element).find((e) => e.idShort === idShort);
const text = (element: AasSubmodelElement | undefined) => (element?.modelType === 'Property' ? element.value?.trim() || undefined : undefined);

/** Removes user information (user:password@) from an endpoint or href. */
export function stripCredentials(value: string): string {
  return value.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1');
}

/**
 * Copy of an environment without user information in URL-like values (Property and File values,
 * specific asset IDs, global asset IDs, reference key values). Returns the number of removed credentials.
 */
export function stripEnvironmentCredentials(environment: AasEnvironment): { environment: AasEnvironment; removed: number } {
  let removed = 0;
  const strip = (value: string): string => { const next = stripCredentials(value); if (next !== value) removed++; return next; };
  const copy: AasEnvironment = JSON.parse(JSON.stringify(environment));
  const ref = (r?: AasReference) => r?.keys.forEach((k) => { k.value = strip(k.value); });
  const walk = (elements?: AasSubmodelElement[]): void => elements?.forEach((e) => {
    if ((e.modelType === 'Property' || e.modelType === 'File') && e.value !== undefined) e.value = strip(e.value);
    if (e.modelType === 'ReferenceElement') ref(e.value);
    if (e.modelType === 'Entity') { if (e.globalAssetId) e.globalAssetId = strip(e.globalAssetId); walk(e.statements); }
    if (e.modelType === 'SubmodelElementCollection' || e.modelType === 'SubmodelElementList') walk(e.value);
    if (e.modelType === 'AnnotatedRelationshipElement') walk(e.annotations);
  });
  copy.assetAdministrationShells?.forEach((s) => {
    const ai = s.assetInformation;
    if (ai.globalAssetId) ai.globalAssetId = strip(ai.globalAssetId);
    ai.specificAssetIds?.forEach((sa) => { sa.value = strip(sa.value); });
  });
  copy.submodels?.forEach((sm) => walk(sm.submodelElements));
  return { environment: copy, removed };
}

function protocolOf(base: string | undefined, element: AasSubmodelElement): AssetInterface['protocol'] {
  const scheme = base?.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
  if (scheme === 'mqtt' || scheme === 'mqtts') return 'mqtt';
  if (scheme === 'http' || scheme === 'https') return 'http';
  if (scheme === 'modbus+tcp' || scheme === 'modbus') return 'modbus';
  if (scheme === 'opc.tcp') return 'opcua';
  const hints = (element.supplementalSemanticIds ?? []).map((r) => r.keys[0]?.value ?? '').join(' ').toLowerCase();
  if (hints.includes('mqtt')) return 'mqtt';
  if (hints.includes('modbus')) return 'modbus';
  if (hints.includes('opc')) return 'opcua';
  if (hints.includes('http')) return 'http';
  return 'other';
}

/** Lists interfaces and their property affordances. Security definitions are not read. */
export function readAssetInterfaces(submodel: AasSubmodel): AssetInterface[] {
  return (submodel.submodelElements ?? [])
    .filter((e) => e.modelType === 'SubmodelElementCollection' && ((ASSET_INTERFACES.interface as readonly string[]).includes(semanticIdOf(e) ?? '') || child(e, 'InteractionMetadata')))
    .map((e) => {
      const rawBase = text(child(child(e, 'EndpointMetadata'), 'base'));
      const base = rawBase && stripCredentials(rawBase);
      const properties = childrenOf(child(child(e, 'InteractionMetadata'), 'properties')).map((p): InterfaceProperty => {
        const form = child(p, 'forms');
        const href = text(child(form, 'href'));
        const observable = text(child(p, 'observable'));
        return clean({ key: text(child(p, 'key')) ?? p.idShort ?? '', title: text(child(p, 'title')), href: href && stripCredentials(href), unit: text(child(p, 'unit')), type: text(child(p, 'type')), observable: observable === undefined ? undefined : observable === 'true' });
      }).filter((p) => p.key);
      return clean({ idShort: e.idShort ?? '', title: text(child(e, 'title')), protocol: protocolOf(base, e), base, properties });
    });
}
