import { describe, expect, it } from 'vitest';
import { importDxf } from '../src/drawing.js';
import { parseDrawingPlan, parseSceneModel } from '../src/model.js';

const poly = (layer: string, vertices: number[][], closed = true) => [0, 'LWPOLYLINE', 8, layer, 90, vertices.length, 70, closed ? 1 : 0, ...vertices.flatMap(([x, y]) => [10, x, 20, y])];
const dxf = (entities: Array<string | number>, unit = 6) => [0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, unit, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES', ...entities, 0, 'ENDSEC', 0, 'EOF'].join('\n') + '\n';

describe('SDK model contract', () => {
  const model = { schemaVersion: 1, name: 'Example', assets: [{ id: 'a', name: 'Asset', shape: 'box', position: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 2, z: 1 } }], connections: [] };
  it('validates independently of the app and returns a detached model', () => {
    const parsed = parseSceneModel(model); parsed.assets[0].position.x = 10;
    expect(model.assets[0].position.x).toBe(0);
    expect(() => parseSceneModel({ ...model, connections: [{ id: 'c', sourceId: 'a', targetId: 'missing' }] })).toThrow();
    expect(() => parseSceneModel({ ...model, assets: [...model.assets, ...model.assets] })).toThrow();
    expect(() => parseSceneModel({ ...model, assets: [{ ...model.assets[0], position: { x: NaN, y: 0, z: 0 } }] })).toThrow();
  });
  it('keeps logical zone membership explicit instead of inferring it from geometry', () => {
    expect(() => parseSceneModel({ ...model, zones: [{ id: 'zone-1', name: 'Area', assetIds: ['missing'] }] })).toThrow();
    const result = parseSceneModel({ ...model, zones: [{ id: 'zone-1', name: 'Area', assetIds: ['a'] }] });
    expect(result.zones?.[0].assetIds).toEqual(['a']);
  });
});

describe('prepared DXF import', () => {
  it('converts declared millimetres into centred metre geometry with walls and rooms', () => {
    const { plan } = importDxf(dxf(poly('ROOM:Kitchen', [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]), 4));
    expect(plan.unit).toBe('m'); expect(plan.rooms[0].name).toBe('Kitchen');
    expect(plan.walls).toHaveLength(4); expect(plan.rooms).toHaveLength(1);
    expect(plan.rooms[0].polygon[0]).toEqual({ x: -2, z: 1.5 });
    expect(plan.walls[0].start).toEqual(plan.rooms[0].polygon[0]);
    expect(() => parseDrawingPlan(plan)).not.toThrow();
  });

  it('deduplicates a shared room edge and preserves explicit wall dimensions', () => {
    const rooms = [...poly('ROOM:A', [[0,0],[2,0],[2,2],[0,2]]), ...poly('ROOM:B', [[2,0],[4,0],[4,2],[2,2]])];
    expect(importDxf(dxf(rooms)).plan.walls).toHaveLength(7);
    const line = [0,'LINE',8,'WALLS',10,0,20,0,11,4,21,0];
    const result = importDxf(dxf([...rooms, ...line]), { height: 3, thickness: .2, center: false });
    expect(result.plan.walls).toHaveLength(1);
    expect(result.plan.walls[0]).toMatchObject({ height: 3, thickness: .2, start: { x: 0, z: -0 }, end: { x: 4, z: -0 } });
  });

  it('requires explicit units if the drawing does not declare supported units', () => {
    const text = dxf(poly('ROOMS', [[0,0],[2,0],[2,2],[0,2]]), 0);
    expect(() => importDxf(text)).toThrow(/units/);
    expect(importDxf(text, { unit: 'm' }).plan.rooms).toHaveLength(1);
  });

  it('rejects open, degenerate and crossing room outlines', () => {
    expect(() => importDxf(dxf(poly('ROOMS', [[0,0],[2,0],[2,2]], false)))).toThrow(/closed/);
    expect(() => importDxf(dxf(poly('ROOMS', [[0,0],[2,2],[0,2],[2,0]])))).toThrow();
    expect(() => importDxf(dxf(poly('ROOMS', [[0,0],[1,0],[2,0]])))).toThrow();
  });

  it('does not silently approximate arcs, 3D entities or unsupported wall geometry', () => {
    const room = poly('ROOMS', [[0,0],[2,0],[2,2],[0,2]]);
    expect(() => importDxf(dxf([...room,42,.5]))).toThrow(/Curved/);
    expect(() => importDxf(dxf([...room,38,2]))).toThrow(/2D/);
    expect(() => importDxf(dxf([0,'CIRCLE',8,'WALLS',10,0,20,0,40,1]))).toThrow(/Unsupported/);
    expect(() => importDxf('AutoCAD Binary DXF\0')).toThrow();
  });
});

describe('dependency-free validation boundaries', () => {
  const asset = { id: 'a', name: 'Asset', shape: 'box', position: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 2, z: 1 } };
  const model = { schemaVersion: 1, name: 'Contract', assets: [asset], connections: [] };
  it('rejects unknown fields, unsafe numbers, sparse arrays and non-JSON objects', () => {
    for (const input of [null, [], new Date(), { ...model, extra: true }, { ...model, assets: Array(1) }, JSON.parse('{"schemaVersion":1,"name":"x","assets":[],"connections":[],"__proto__":{}}')]) expect(() => parseSceneModel(input)).toThrow();
    for (const x of [NaN, Infinity, -Infinity, 100001, '1', null]) expect(() => parseSceneModel({ ...model, assets: [{ ...asset, position: { x, y: 0, z: 0 } }] })).toThrow();
    for (const x of [0, -1, 100001]) expect(() => parseSceneModel({ ...model, assets: [{ ...asset, size: { x, y: 1, z: 1 } }] })).toThrow();
    expect(() => parseSceneModel({ ...model, assets: [{ ...asset, color: .5 }] })).toThrow();
  });
  it('preserves limits and reference checks for exported and external models', () => {
    expect(() => parseSceneModel({ ...model, assets: Array(2001).fill(asset) })).toThrow();
    expect(() => parseSceneModel({ ...model, connections: [{ id: 'loop', sourceId: 'a', targetId: 'a' }] })).toThrow();
    expect(() => parseSceneModel({ ...model, zones: [{ id: 'zone', name: 'Zone', assetIds: ['a', 'a'] }] })).toThrow();
    expect(() => parseSceneModel({ ...model, zones: [{ id: 'zone', name: 'Zone', assetIds: ['a'], bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 1 } }] })).toThrow();
  });
  it('returns detached geometry and reports the path of malformed nested drawing data', () => {
    const { plan } = importDxf(dxf(poly('ROOM:A', [[0,0],[2,0],[2,2],[0,2]])));
    const parsed = parseSceneModel({ ...model, drawing: plan }); parsed.drawing!.rooms[0].polygon[0].x = 42;
    expect(plan.rooms[0].polygon[0].x).toBe(-1);
    expect(() => parseDrawingPlan({ ...plan, walls: [plan.walls[0], plan.walls[0]] })).toThrow(/Duplicate/);
    expect(() => parseDrawingPlan({ ...plan, walls: [{ ...plan.walls[0], height: 0 }] })).toThrow(/drawing.walls\[0\].height/);
    expect(() => parseDrawingPlan({ ...plan, walls: [{ ...plan.walls[0], end: plan.walls[0].start }] })).toThrow(/Zero-length/);
  });
});
