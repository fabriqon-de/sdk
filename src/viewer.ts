import * as THREE from 'three';
import { createAssetObject } from './assets.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseDrawingPlan, parseSceneModel, type SceneAsset, type SceneModel, type DrawingPlan, type SceneConnection, type Vector3 } from './model.js';

export interface ViewerSceneContext {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
}
export interface ViewerFrameContext extends ViewerSceneContext {
  /** Seconds of active animation; zero delta while paused. */
  readonly delta: number;
  readonly elapsed: number;
}
export interface ViewerOptions {
  background?: number;
  canvas?: HTMLCanvasElement;
  onSelect?: (id: string | null) => void;
  autoRotate?: boolean;
  /** Limit updates and rendering to 1–60 frames per second. Default: 60. */
  maxFps?: number;
  keyboard?: 'select' | 'camera';
  /** Returned objects and their resources are owned and disposed by this viewer. */
  assetFactory?: (asset: SceneAsset) => THREE.Object3D;
  connectionFactory?: (connection: SceneConnection, source: THREE.Object3D, target: THREE.Object3D) => THREE.Object3D;
  /** Add decoration or configure rendering. Attached scene resources become viewer-owned. */
  configure?: (context: ViewerSceneContext) => void;
  /** Update custom animation and labels before rendering. Must not create another render loop. */
  onFrame?: (context: ViewerFrameContext) => void;
  onContextLost?: () => void;
}
export interface FabriqonViewer {
  setModel(model: SceneModel, options?: { fit?: boolean }): void;
  select(id: string | null): void;
  fit(): void;
  setCamera(position: Vector3, target?: Vector3): void;
  setPaused(paused: boolean): void;
  setAutoRotate(enabled: boolean): void;
  dispose(): void;
}

/** @deprecated Use FabriqonViewer. Retained for source compatibility. */
export type PlantFrameViewer = FabriqonViewer;

function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  const textures = new Set<THREE.Texture>();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

export function createDrawingObject(input: DrawingPlan): THREE.Group {
  const plan = parseDrawingPlan(input);
  const group = new THREE.Group();
    for (const room of plan.rooms) {
      const shape = new THREE.Shape(room.polygon.map(p => new THREE.Vector2(p.x, -p.z)));
      const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x61aee0, side: THREE.DoubleSide, transparent: true, opacity: .25 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = .015; group.add(floor);
    }
    for (const wall of plan.walls) {
      const dx = wall.end.x - wall.start.x, dz = wall.end.z - wall.start.z;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz), wall.height, wall.thickness), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
      mesh.position.set((wall.start.x + wall.end.x) / 2, wall.height / 2, (wall.start.z + wall.end.z) / 2); mesh.rotation.y = -Math.atan2(dz, dx); group.add(mesh);
    }
  return group;
}

export function createViewer(container: HTMLElement, options: ViewerOptions = {}): FabriqonViewer {
  if (typeof window === 'undefined' || !container || typeof container.append !== 'function' || typeof ResizeObserver === 'undefined') throw new Error('Viewer requires a browser element and ResizeObserver.');
  const maxFps = options.maxFps ?? 60;
  if (!Number.isFinite(maxFps) || maxFps < 1 || maxFps > 60) throw new Error('maxFps must be between 1 and 60.');
  const renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setClearColor(options.background ?? 0x0f1720);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  if (!options.canvas) canvas.setAttribute('role', 'application');
  if (!canvas.hasAttribute('aria-label')) canvas.setAttribute('aria-label', 'Fabriqon 3D viewer. Arrow keys select assets; Escape clears selection.');
  if (!options.canvas) {
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
  }
  if (!options.canvas) container.append(canvas);
  const scene = new THREE.Scene(), content = new THREE.Group(); scene.add(content);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 1000000);
  camera.position.set(15, 15, 15);
  const controls = new OrbitControls(camera, canvas);
  canvas.style.touchAction = 'pan-y'; controls.enableZoom = false; controls.enablePan = false;
  controls.enableDamping = true; controls.dampingFactor = .08;
  controls.minPolarAngle = .25; controls.maxPolarAngle = 1.35; controls.autoRotateSpeed = .35;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motion.matches, autoRotate = !!options.autoRotate, visible = true, lost = false;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x243244, 3));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(5, 20, 10); scene.add(light);
  const context = { scene, camera, renderer };
  let model: SceneModel | null = null, selected: string | null = null, outline: THREE.BoxHelper | null = null, disposed = false;
  const byId = new Map<string, THREE.Object3D>();
  const requireActive = () => { if (disposed) throw new Error('Viewer has been disposed.'); };
  function select(id: string | null) {
    requireActive();
    if (id !== null && !byId.has(id)) throw new Error('Unknown asset ID.');
    if (selected === id) return; // Callbacks may synchronize another selection control.
    if (outline) { scene.remove(outline); disposeObjects(outline); outline = null; }
    selected = id;
    if (id) { outline = new THREE.BoxHelper(byId.get(id)!, 0xffb703); scene.add(outline); }
    options.onSelect?.(id);
  }
  function setCamera(position: Vector3, target?: Vector3) {
    requireActive();
    for (const point of [position, target].filter(Boolean) as Vector3[]) {
      if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Camera coordinates must be finite.');
    }
    // Flush damping before applying an explicit view, so old drag momentum cannot move it.
    controls.enableDamping = false; controls.autoRotate = false; controls.update();
    camera.position.set(position.x, position.y, position.z);
    if (target) controls.target.set(target.x, target.y, target.z);
    camera.lookAt(controls.target); controls.update(); controls.enableDamping = true;
  }
  function fit() {
    requireActive();
    const box = new THREE.Box3().setFromObject(content);
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 2, 10));
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z, 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    setCamera(center.clone().add(new THREE.Vector3(1, .85, 1).normalize().multiplyScalar(distance)), center);
  }
  function setModel(input: SceneModel, settings: { fit?: boolean } = {}) {
    requireActive();
    const next = parseSceneModel(input); // Invalid input leaves the current model intact.
    const staged = new THREE.Group(), nextById = new Map<string, THREE.Object3D>();
    try {
      for (const asset of next.assets) {
        const object = options.assetFactory ? options.assetFactory(asset) : createAssetObject(asset);
        object.position.set(asset.position.x, asset.position.y + asset.size.y / 2, asset.position.z);
        object.userData.fabriqonId = asset.id; nextById.set(asset.id, object); staged.add(object);
      }
      for (const connection of next.connections) {
        const source = nextById.get(connection.sourceId)!, target = nextById.get(connection.targetId)!;
        staged.add(options.connectionFactory ? options.connectionFactory(connection, source, target) : new THREE.Line(new THREE.BufferGeometry().setFromPoints([source.position, target.position]), new THREE.LineBasicMaterial({ color: 0x61aee0 })));
      }
      for (const zone of next.zones ?? []) {
        if (!zone.bounds) continue;
        const b = zone.bounds;
        const points = [[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ]].map(([x,z]) => new THREE.Vector3(x,.035,z));
        staged.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffb703 })));
      }
      if (next.drawing) staged.add(createDrawingObject(next.drawing));
    } catch (error) { disposeObjects(staged); throw error; }
    if (outline) { scene.remove(outline); disposeObjects(outline); outline = null; }
    disposeObjects(content); content.clear(); content.add(...staged.children.slice());
    byId.clear(); nextById.forEach((object, id) => byId.set(id, object)); model = next;
    if (selected && !byId.has(selected)) { selected = null; options.onSelect?.(null); }
    if (selected) { outline = new THREE.BoxHelper(byId.get(selected)!, 0xffb703); scene.add(outline); }
    if (settings.fit !== false) fit();
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const stopRotation = () => { autoRotate = false; };
  const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; stopRotation(); };
  const pointerUp = (event: PointerEvent) => {
    const start = down; down = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...byId.values()], true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.fabriqonId) object = object.parent;
    select(object?.userData.fabriqonId ?? null);
  };
  const pointerCancel = () => { down = null; };
  const keyDown = (event: KeyboardEvent) => {
    if (options.keyboard === 'camera') {
      const relative = camera.position.clone().sub(controls.target);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') relative.applyAxisAngle(new THREE.Vector3(0,1,0), event.key === 'ArrowLeft' ? -.13 : .13);
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') relative.y = THREE.MathUtils.clamp(relative.y + (event.key === 'ArrowUp' ? 2 : -2), 6, 45);
      else if (['+','=','-'].includes(event.key)) relative.multiplyScalar(event.key === '-' ? 1.08 : .92).clampLength(5, 1000000);
      else return;
      event.preventDefault(); stopRotation(); setCamera(relative.add(controls.target)); return;
    }
    if (event.key === 'Escape') select(null);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const ids = model?.assets.map(a => a.id) ?? []; if (!ids.length) return;
      event.preventDefault(); const index = selected ? ids.indexOf(selected) : -1;
      select(ids[(index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]);
    }
  };
  function setPaused(value: boolean) {
    requireActive(); paused = value;
    if (value) { controls.autoRotate = false; controls.enableDamping = false; controls.update(); controls.enableDamping = true; }
  }
  let last: number | null = null, elapsed = 0;
  const resetClock = () => { last = null; };
  const motionChange = () => { if (motion.matches) setPaused(true); };
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; renderer.setAnimationLoop(null); options.onContextLost?.(); };
  const resize = new ResizeObserver(() => { const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); });
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resetClock(); });
  function dispose() {
    if (disposed) return; disposed = true; renderer.setAnimationLoop(null); resize.disconnect(); observer?.disconnect(); controls.dispose();
    canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerCancel); canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('webglcontextlost', contextLost);
    document.removeEventListener('visibilitychange', resetClock); motion.removeEventListener('change', motionChange);
    disposeObjects(scene); renderer.dispose(); renderer.forceContextLoss();
    if (!options.canvas) canvas.remove();
  }
  try {
    options.configure?.(context);
    resize.observe(container); observer?.observe(container);
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerCancel); canvas.addEventListener('keydown', keyDown); canvas.addEventListener('webglcontextlost', contextLost);
    document.addEventListener('visibilitychange', resetClock); motion.addEventListener('change', motionChange);
    renderer.setAnimationLoop((time: number) => {
      if (!visible || document.hidden || lost) { resetClock(); return; }
      // Leave headroom for scrolling/input; skipping a frame must not slow animation time.
      if (last !== null && time - last < 1000 / maxFps - .5) return;
      const delta = paused || last === null ? 0 : Math.min((time - last) / 1000, Math.max(.06, 1 / maxFps)); last = time;
      elapsed += delta; controls.autoRotate = autoRotate && !paused && !motion.matches;
      controls.update(delta); options.onFrame?.({ ...context, delta, elapsed }); renderer.render(scene, camera);
    });
  } catch (error) { dispose(); throw error; }
  return { setModel, select, fit, setCamera, setPaused, setAutoRotate(value) { requireActive(); autoRotate = value; }, dispose };
}
