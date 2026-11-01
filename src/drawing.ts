import { parseDrawingPlan, type DrawingPlan, type Point } from './model.js';

export interface DxfOptions { unit?: 'm' | 'cm' | 'mm'; name?: string; height?: number; thickness?: number; center?: boolean }
export interface DrawingImport { plan: DrawingPlan; warnings: string[] }

/** Prepared ASCII DXF: LINE/LWPOLYLINE on WALLS/ROOMS layers; all output distances are metres. */
export function importDxf(text: string, options: DxfOptions = {}): DrawingImport {
  if (text.length > 5000000 || text.includes('\0')) throw new Error('DXF must be ASCII text smaller than 5 MB.');
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trimEnd().split('\n');
  if (lines.length % 2) throw new Error('Invalid DXF code/value pairs.');
  const pairs: Array<{ code: number; value: string }> = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (!/^\s*\d+\s*$/.test(lines[i])) throw new Error('Invalid DXF group code.');
    pairs.push({ code: Number(lines[i]), value: lines[i + 1].trim() });
  }
  let unit = options.unit;
  if (!unit) {
    const at = pairs.findIndex(p => p.code === 9 && p.value === '$INSUNITS');
    const value = at >= 0 && pairs[at + 1]?.code === 70 ? Number(pairs[at + 1].value) : 0;
    unit = ({ 4: 'mm', 5: 'cm', 6: 'm' } as const)[value as 4 | 5 | 6];
  }
  if (!unit) throw new Error('DXF units are missing or unsupported. Select m, cm or mm explicitly.');
  const scale = { m: 1, cm: .01, mm: .001 }[unit];
  const plan: DrawingPlan = { schemaVersion: 1, name: options.name ?? 'Imported drawing', unit: 'm', walls: [], rooms: [] };
  const height = options.height ?? 2.7, thickness = options.thickness ?? .15;
  const numeric = (value: string | undefined) => {
    if (value === undefined || !value.trim() || !Number.isFinite(Number(value))) throw new Error('DXF contains an invalid coordinate.');
    return Number(value);
  };
  const point = (x: string | undefined, y: string | undefined): Point => ({ x: numeric(x) * scale, z: -numeric(y) * scale });
  const wall = (start: Point, end: Point) => { plan.walls.push({ id: `wall-${plan.walls.length + 1}`, start, end, height, thickness }); if (plan.walls.length > 5000) throw new Error('Too many walls.'); };
  let inEntities = false, ignored = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'SECTION') { inEntities = pairs[i + 1]?.code === 2 && pairs[i + 1].value === 'ENTITIES'; continue; }
    if (pairs[i].code === 0 && pairs[i].value === 'ENDSEC') { inEntities = false; continue; }
    if (!inEntities || pairs[i].code !== 0) continue;
    const type = pairs[i].value, fields: Array<{code: number; value: string}> = [];
    while (pairs[i + 1] && pairs[i + 1].code !== 0) fields.push(pairs[++i]);
    const get = (code: number) => fields.find(p => p.code === code)?.value;
    const rawLayer = get(8) ?? '', layer = rawLayer.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const isWall = /^(WALLS?|MAUERN)(:|$)/.test(layer), isRoom = /^(ROOMS?|RAUME?|RAEUME)(:|$)/.test(layer);
    if (!isWall && !isRoom) { ignored++; continue; }
    if (fields.some(p => [30, 31, 38].includes(p.code) && numeric(p.value) !== 0)) throw new Error('Only planar 2D drawings at elevation zero are supported.');
    if (type === 'LINE' && isWall) { wall(point(get(10), get(20)), point(get(11), get(21))); continue; }
    if (type !== 'LWPOLYLINE') throw new Error(`Unsupported entity ${type} on layer ${rawLayer}. Use LINE or LWPOLYLINE.`);
    if (fields.some(p => p.code === 42 && numeric(p.value) !== 0)) throw new Error('Curved polyline segments are not supported; do not silently replace arcs with straight walls.');
    const vertices: Point[] = [];
    for (let j = 0; j < fields.length; j++) {
      if (fields[j].code !== 10) continue;
      const x = fields[j].value;
      let y: string | undefined;
      for (let k = j + 1; k < fields.length && fields[k].code !== 10; k++) if (fields[k].code === 20) { y = fields[k].value; break; }
      vertices.push(point(x, y));
      if (vertices.length > 256) throw new Error('Too many vertices in a polyline.');
    }
    if (get(90) !== undefined && numeric(get(90)) !== vertices.length) throw new Error('DXF vertex count does not match its polyline.');
    const repeats = vertices.length > 1 && vertices[0].x === vertices.at(-1)!.x && vertices[0].z === vertices.at(-1)!.z;
    const flags = Number(get(70) ?? 0);
    if (!Number.isInteger(flags) || flags < 0 || flags > 255) throw new Error('Invalid polyline flags.');
    const closed = ((flags & 1) === 1) || repeats;
    if (repeats) vertices.pop();
    if (isRoom) {
      if (!closed) throw new Error('A room must be a closed polyline.');
      plan.rooms.push({ id: `room-${plan.rooms.length + 1}`, name: rawLayer.includes(':') ? rawLayer.split(':').slice(1).join(':').trim() : `Room ${plan.rooms.length + 1}`, polygon: vertices });
      if (plan.rooms.length > 200) throw new Error('Too many rooms.');
    } else {
      if (vertices.length < 2) throw new Error('A wall polyline needs at least two vertices.');
      for (let j = 1; j < vertices.length; j++) wall(vertices[j - 1], vertices[j]);
      if (closed) wall(vertices.at(-1)!, vertices[0]);
    }
  }
  if (!plan.walls.length && !plan.rooms.length) throw new Error('No walls or rooms found. Prepare WALLS and ROOM:<name> layers.');
  if (!plan.walls.length) {
    const edges = new Set<string>();
    for (const room of plan.rooms) for (let i = 0; i < room.polygon.length; i++) {
      const a = room.polygon[i], b = room.polygon[(i + 1) % room.polygon.length];
      const key = [a, b].map(p => `${p.x.toFixed(6)},${p.z.toFixed(6)}`).sort().join('|');
      if (!edges.has(key)) { edges.add(key); wall(a, b); }
    }
  }
  if (options.center !== false) {
    const points = [...plan.walls.flatMap(w => [w.start, w.end]), ...plan.rooms.flatMap(r => r.polygon)];
    const x = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2;
    const z = (Math.min(...points.map(p => p.z)) + Math.max(...points.map(p => p.z))) / 2;
    for (const p of new Set(points)) { p.x -= x; p.z -= z; }
  }
  return { plan: parseDrawingPlan(plan), warnings: ignored ? [`${ignored} entities on other layers were ignored.`] : [] };
}
