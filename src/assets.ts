import * as THREE from 'three';
import type { SceneAsset } from './model.js';

/** Small procedural equipment library. Dimensions are supplied by the model. */
export function createAssetObject(asset: SceneAsset): THREE.Object3D {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: asset.color ?? 0xcbd2da, roughness: .7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: .65 });
  const signal = new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: .6 });
  const box = (size: [number, number, number], at: [number, number, number], material = shell) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...at); group.add(mesh); return mesh;
  };
  const cylinder = (radius: number, height: number, at: [number, number, number], material = dark) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), material); mesh.position.set(...at); group.add(mesh); return mesh;
  };
  switch (asset.kind) {
    case 'machine':
      box([1, .15, 1], [0, -.425, 0], dark); box([.9, .85, .9], [0, .075, 0]);
      box([.52, .48, .025], [-.12, .14, .46], dark); box([.18, .25, .04], [.32, .15, .48], signal); break;
    case 'robot':
      cylinder(.36, .16, [0, -.42, 0]); cylinder(.2, .4, [0, -.17, 0], signal);
      box([.17, .5, .18], [.1, .1, 0], signal).rotation.z = -.65;
      box([.48, .14, .16], [.24, .32, 0], signal); box([.12, .16, .16], [.45, .22, 0], dark); break;
    case 'conveyor':
      box([1, .25, 1], [0, .1, 0], dark);
      for (let i = 0; i < 7; i++) { const roller = cylinder(.055, .88, [-.43 + i * .145, .28, 0]); roller.rotation.x = Math.PI / 2; }
      for (const x of [-.4, .4]) for (const z of [-.38, .38]) box([.08, .6, .08], [x, -.18, z]); break;
    case 'controller': case 'server': case 'gateway':
      box([.9, 1, .9], [0, 0, 0]);
      for (let i = 0; i < 5; i++) box([.7, .09, .03], [0, -.3 + i * .15, .46], dark);
      box([.06, .06, .04], [.32, .4, .47], signal); break;
    case 'sensor':
      cylinder(.35, .8, [0, 0, 0]); cylinder(.38, .12, [0, .42, 0], signal); break;
    default: {
      const geometry = asset.shape === 'sphere' ? new THREE.SphereGeometry(.5, 20, 12) : asset.shape === 'cylinder' ? new THREE.CylinderGeometry(.5, .5, 1, 20) : new THREE.BoxGeometry(1, 1, 1);
      group.add(new THREE.Mesh(geometry, shell));
    }
  }
  // Dispose unused materials so a factory call never leaves orphaned resources.
  const used = new Set<THREE.Material>(); group.traverse(o => { const m = (o as THREE.Mesh).material; if (m) for (const value of Array.isArray(m) ? m : [m]) used.add(value); });
  for (const material of [shell, dark, signal]) if (!used.has(material)) material.dispose();
  group.scale.set(asset.size.x, asset.size.y, asset.size.z);
  return group;
}
