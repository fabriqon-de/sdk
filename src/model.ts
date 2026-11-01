/** Renderer-independent model contract. No runtime imports or platform globals. */
export interface Point { x: number; z: number }
export interface DrawingWall { id: string; start: Point; end: Point; height: number; thickness: number }
export interface DrawingRoom { id: string; name: string; polygon: Point[] }
export interface DrawingPlan { schemaVersion: 1; name: string; unit: 'm'; walls: DrawingWall[]; rooms: DrawingRoom[] }
export interface Vector3 { x: number; y: number; z: number }
export interface SceneAsset {
  id: string; name: string; shape: 'box' | 'cylinder' | 'sphere';
  kind?: 'machine' | 'robot' | 'conveyor' | 'controller' | 'server' | 'gateway' | 'sensor' | 'generic';
  position: Vector3; size: Vector3; color?: number;
}
export interface SceneConnection { id: string; sourceId: string; targetId: string }
export interface SceneZone {
  id: string; name: string; assetIds: string[];
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}
export interface SceneModel {
  schemaVersion: 1; name: string; assets: SceneAsset[]; connections: SceneConnection[];
  zones?: SceneZone[]; drawing?: DrawingPlan;
}
export interface ValidationIssue { path: string; message: string }
export class ModelValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ModelValidationError';
    this.issues = [{ path, message }];
  }
}
function fail(path: string, message: string): never { throw new ModelValidationError(path, message); }
function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'Expected an object');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail(path, 'Expected a plain object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, 'Unknown property');
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string, min = 0, max = 200): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) return fail(path, `Expected a string of ${min}–${max} characters`);
  return value;
}
function id(value: unknown, path: string): string {
  const result = string(value, path, 1, 128);
  if (!/^[\w.-]+$/.test(result)) return fail(path, 'Invalid ID');
  return result;
}
function number(value: unknown, path: string, min = -100000, max = 100000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(path, `Expected a finite number from ${min} to ${max}`);
  return value;
}
function positive(value: unknown, path: string): number {
  const result = number(value, path, 0);
  if (result === 0) return fail(path, 'Expected a positive dimension');
  return result;
}
function literal<T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) return fail(path, `Expected ${expected}`);
  return expected;
}
function enumeration<const T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) return fail(path, `Expected one of ${allowed.join(', ')}`);
  return value as T;
}
function array<T>(value: unknown, path: string, max: number, parse: (value: unknown, path: string) => T, min = 0): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) return fail(path, `Expected ${min}–${max} entries`);
  return Array.from(value, (entry, index) => parse(entry, `${path}[${index}]`));
}
function unique(values: string[], path: string) {
  if (new Set(values).size !== values.length) fail(path, 'Duplicate ID');
}
function point(value: unknown, path: string): Point {
  const p = object(value, path, ['x', 'z']);
  return { x: number(p.x, `${path}.x`), z: number(p.z, `${path}.z`) };
}
function vector(value: unknown, path: string, dimension = false): Vector3 {
  const p = object(value, path, ['x', 'y', 'z']), parse = dimension ? positive : number;
  return { x: parse(p.x, `${path}.x`), y: parse(p.y, `${path}.y`), z: parse(p.z, `${path}.z`) };
}
function polygonValid(points: Point[]): boolean {
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const on = (a: Point, b: Point, p: Point) => Math.abs(cross(a, b, p)) < 1e-8 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.z >= Math.min(a.z, b.z) && p.z <= Math.max(a.z, b.z);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1e-8) return false;
    area += a.x * b.z - b.x * a.z;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) return false;
    }
  }
  return Math.abs(area) > 1e-6;
}
function drawing(value: unknown, path: string): DrawingPlan {
  const p = object(value, path, ['schemaVersion', 'name', 'unit', 'walls', 'rooms']);
  const result: DrawingPlan = {
    schemaVersion: literal(p.schemaVersion, 1, `${path}.schemaVersion`), name: string(p.name, `${path}.name`, 1), unit: literal(p.unit, 'm', `${path}.unit`),
    walls: array(p.walls, `${path}.walls`, 5000, (value, path) => {
      const w = object(value, path, ['id', 'start', 'end', 'height', 'thickness']);
      const wall = { id: id(w.id, `${path}.id`), start: point(w.start, `${path}.start`), end: point(w.end, `${path}.end`), height: positive(w.height, `${path}.height`), thickness: positive(w.thickness, `${path}.thickness`) };
      if (Math.hypot(wall.start.x - wall.end.x, wall.start.z - wall.end.z) <= 1e-8) fail(path, 'Zero-length wall');
      return wall;
    }),
    rooms: array(p.rooms, `${path}.rooms`, 200, (value, path) => {
      const r = object(value, path, ['id', 'name', 'polygon']);
      const room = { id: id(r.id, `${path}.id`), name: string(r.name, `${path}.name`, 1), polygon: array(r.polygon, `${path}.polygon`, 256, point, 3) };
      if (!polygonValid(room.polygon)) fail(`${path}.polygon`, 'Room polygon is degenerate or self-intersecting');
      return room;
    })
  };
  unique(result.walls.map(w => w.id), `${path}.walls`); unique(result.rooms.map(r => r.id), `${path}.rooms`);
  return result;
}
/** Validate and return a detached copy. Invalid input throws ModelValidationError. */
export function parseDrawingPlan(value: unknown): DrawingPlan { return drawing(value, 'drawing'); }
/** Validate and return a detached copy, with finite bounds and checked references. */
export function parseSceneModel(value: unknown): SceneModel {
  const p = object(value, 'model', ['schemaVersion', 'name', 'assets', 'connections', 'zones', 'drawing']);
  const result: SceneModel = {
    schemaVersion: literal(p.schemaVersion, 1, 'model.schemaVersion'), name: string(p.name, 'model.name', 1),
    assets: array(p.assets, 'model.assets', 2000, (value, path) => {
      const a = object(value, path, ['id', 'name', 'shape', 'kind', 'position', 'size', 'color']);
      const asset: SceneAsset = { id: id(a.id, `${path}.id`), name: string(a.name, `${path}.name`), shape: enumeration(a.shape, ['box', 'cylinder', 'sphere'], `${path}.shape`), position: vector(a.position, `${path}.position`), size: vector(a.size, `${path}.size`, true) };
      if (a.kind !== undefined) asset.kind = enumeration(a.kind, ['machine', 'robot', 'conveyor', 'controller', 'server', 'gateway', 'sensor', 'generic'], `${path}.kind`);
      if (a.color !== undefined) { asset.color = number(a.color, `${path}.color`, 0, 0xffffff); if (!Number.isInteger(asset.color)) fail(`${path}.color`, 'Expected an integer color'); }
      return asset;
    }),
    connections: array(p.connections, 'model.connections', 10000, (value, path) => {
      const c = object(value, path, ['id', 'sourceId', 'targetId']);
      return { id: id(c.id, `${path}.id`), sourceId: id(c.sourceId, `${path}.sourceId`), targetId: id(c.targetId, `${path}.targetId`) };
    })
  };
  if (p.zones !== undefined) result.zones = array(p.zones, 'model.zones', 200, (value, path) => {
    const z = object(value, path, ['id', 'name', 'assetIds', 'bounds']);
    const zone: SceneZone = { id: id(z.id, `${path}.id`), name: string(z.name, `${path}.name`), assetIds: array(z.assetIds, `${path}.assetIds`, 2000, id) };
    unique(zone.assetIds, `${path}.assetIds`);
    if (z.bounds !== undefined) {
      const b = object(z.bounds, `${path}.bounds`, ['minX', 'maxX', 'minZ', 'maxZ']);
      zone.bounds = { minX: number(b.minX, `${path}.bounds.minX`), maxX: number(b.maxX, `${path}.bounds.maxX`), minZ: number(b.minZ, `${path}.bounds.minZ`), maxZ: number(b.maxZ, `${path}.bounds.maxZ`) };
      if (zone.bounds.maxX <= zone.bounds.minX || zone.bounds.maxZ <= zone.bounds.minZ) fail(`${path}.bounds`, 'Zone has no area');
    }
    return zone;
  });
  if (p.drawing !== undefined) result.drawing = drawing(p.drawing, 'model.drawing');
  unique(result.assets.map(a => a.id), 'model.assets'); unique(result.connections.map(c => c.id), 'model.connections'); unique((result.zones ?? []).map(z => z.id), 'model.zones');
  const assets = new Set(result.assets.map(a => a.id));
  for (const [index, c] of result.connections.entries()) if (!assets.has(c.sourceId) || !assets.has(c.targetId) || c.sourceId === c.targetId) fail(`model.connections[${index}]`, 'Invalid connection endpoint');
  for (const [index, z] of (result.zones ?? []).entries()) if (z.assetIds.some(id => !assets.has(id))) fail(`model.zones[${index}].assetIds`, 'Invalid logical zone membership');
  return result;
}
export function serializeSceneModel(model: SceneModel): string { return JSON.stringify(parseSceneModel(model), null, 2); }
