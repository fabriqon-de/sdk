import * as THREE from 'three';
import { createAssetObject } from './assets.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseDrawingPlan, parseSceneModel, type SceneAsset, type SceneModel, type DrawingPlan } from './model.js';

export interface ViewerOptions {
  background?: number;
  onSelect?: (id: string | null) => void;
  autoRotate?: boolean;
  /** Returned objects and their resources are owned and disposed by this viewer. */
  assetFactory?: (asset: SceneAsset) => THREE.Object3D;
}
export interface PlantFrameViewer {
  setModel(model: SceneModel, options?: { fit?: boolean }): void;
  select(id: string | null): void;
  fit(): void;
  dispose(): void;
}

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

export function createViewer(container: HTMLElement, options: ViewerOptions = {}): PlantFrameViewer {
  if (typeof window === 'undefined' || !container || typeof container.append !== 'function' || typeof ResizeObserver === 'undefined') throw new Error('Viewer requires a browser element and ResizeObserver.');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(options.background ?? 0x0f1720);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0; canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'PlantFrame 3D viewer. Arrow keys select assets; Escape clears selection.');
  canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
  container.append(canvas);
  const scene = new THREE.Scene(), content = new THREE.Group(); scene.add(content);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 1000000);
  camera.position.set(15, 15, 15);
  const controls = new OrbitControls(camera, canvas);
  canvas.style.touchAction = 'pan-y'; controls.enableZoom = false;
  controls.enableDamping = true;
  controls.autoRotate = !!options.autoRotate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x243244, 3));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(5, 20, 10); scene.add(light);
  let model: SceneModel | null = null, selected: string | null = null, outline: THREE.BoxHelper | null = null, disposed = false;
  const byId = new Map<string, THREE.Object3D>();
  const requireActive = () => { if (disposed) throw new Error('Viewer has been disposed.'); };
  function select(id: string | null) {
    requireActive();
    if (id !== null && !byId.has(id)) throw new Error('Unknown asset ID.');
    if (outline) { scene.remove(outline); disposeObjects(outline); outline = null; }
    selected = id;
    if (id) { outline = new THREE.BoxHelper(byId.get(id)!, 0xffb703); scene.add(outline); }
    options.onSelect?.(id);
  }
  function fit() {
    requireActive();
    const box = new THREE.Box3().setFromObject(content);
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 2, 10));
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z, 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.copy(center).add(new THREE.Vector3(1, .85, 1).normalize().multiplyScalar(distance));
    controls.target.copy(center); camera.lookAt(center); controls.update();
  }
  function setModel(input: SceneModel, settings: { fit?: boolean } = {}) {
    requireActive();
    const next = parseSceneModel(input); // Invalid input leaves the current model intact.
    if (outline) { scene.remove(outline); disposeObjects(outline); outline = null; }
    disposeObjects(content); content.clear(); byId.clear(); model = next;
    for (const asset of next.assets) {
      let object: THREE.Object3D;
      if (options.assetFactory) object = options.assetFactory(asset);
      else object = createAssetObject(asset);
      object.position.set(asset.position.x, asset.position.y + asset.size.y / 2, asset.position.z);
      object.userData.plantframeId = asset.id; byId.set(asset.id, object); content.add(object);
    }
    for (const connection of next.connections) {
      const from = byId.get(connection.sourceId)!.position, to = byId.get(connection.targetId)!.position;
      content.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), new THREE.LineBasicMaterial({ color: 0x61aee0 })));
    }
    for (const zone of next.zones ?? []) {
      if (!zone.bounds) continue;
      const b = zone.bounds;
      const points = [[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ]].map(([x,z]) => new THREE.Vector3(x,.035,z));
      content.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffb703 })));
    }
    if (next.drawing) content.add(createDrawingObject(next.drawing));
    if (selected && !byId.has(selected)) selected = null;
    if (selected) { outline = new THREE.BoxHelper(byId.get(selected)!, 0xffb703); scene.add(outline); }
    if (settings.fit !== false) fit();
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let down = { x: 0, y: 0 };
  const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
  const pointerUp = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...byId.values()], true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.plantframeId) object = object.parent;
    select(object?.userData.plantframeId ?? null);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') select(null);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const ids = model?.assets.map(a => a.id) ?? []; if (!ids.length) return;
      event.preventDefault(); const index = selected ? ids.indexOf(selected) : -1;
      select(ids[(index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]);
    }
  };
  const resize = new ResizeObserver(() => { const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); });
  resize.observe(container);
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('keydown', keyDown);
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
  return { setModel, select, fit, dispose() {
    if (disposed) return; disposed = true; renderer.setAnimationLoop(null); resize.disconnect(); controls.dispose();
    canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('keydown', keyDown);
    disposeObjects(scene); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  } };
}
