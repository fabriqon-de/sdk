import { test, expect } from '@playwright/test';
const model={schemaVersion:1,name:'Viewer test',assets:[{id:'a',name:'A',shape:'box',position:{x:-2,y:0,z:0},size:{x:2,y:2,z:2}},{id:'b',name:'B',shape:'box',position:{x:2,y:0,z:0},size:{x:2,y:2,z:2}}],connections:[{id:'a-b',sourceId:'a',targetId:'b'}]};
async function start(page, settings={}) {
  await page.goto('/tests/viewer/index.html');
  await page.evaluate(async ({model,settings})=>{
    const { createViewer }=await import('/dist/viewer.js');
    const THREE=await import('three');
    window.stats={frames:0,elapsed:0,delta:0,selections:[],disposed:0,contextLost:0};
    window.createViewer=createViewer;window.THREE=THREE;window.model=model;
    const options={autoRotate:true,...settings,
      onSelect(id){stats.selections.push(id);window.viewer.select(id);},
      configure(ctx){window.context=ctx;},
      onFrame(ctx){stats.frames++;stats.elapsed=ctx.elapsed;stats.delta=ctx.delta;},
      assetFactory(asset){const geometry=new THREE.BoxGeometry(asset.size.x,asset.size.y,asset.size.z);geometry.addEventListener('dispose',()=>stats.disposed++);return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());},
      connectionFactory(){const group=new THREE.Group();group.name='custom-connection';group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2,1,0),new THREE.Vector3(0,3,0),new THREE.Vector3(2,1,0)]),new THREE.LineBasicMaterial()));return group;},
      onContextLost(){stats.contextLost++;}
    };
    if(settings.borrowCanvas){const canvas=document.createElement('canvas');canvas.id='borrowed';document.querySelector('#scene').append(canvas);options.canvas=canvas;}
    window.viewer=createViewer(document.querySelector('#scene'),options);viewer.setModel(model);
  },{model,settings});
  await expect.poll(()=>page.evaluate(()=>stats.frames)).toBeGreaterThan(1);
}
test('custom geometry, connections, camera, pause/resume and reentrant selection',async({page})=>{
  await start(page);
  await expect.poll(()=>page.evaluate(()=>stats.elapsed)).toBeGreaterThan(.03);
  await page.evaluate(()=>{viewer.setCamera({x:12,y:10,z:16},{x:0,y:1,z:0});viewer.setAutoRotate(false);viewer.setPaused(true);viewer.select('a');});
  const before=await page.evaluate(()=>({elapsed:stats.elapsed,camera:context.camera.position.toArray()}));
  await expect.poll(()=>page.evaluate(()=>stats.delta)).toBe(0);
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>stats.elapsed)).toBe(before.elapsed);
  expect(await page.evaluate(()=>context.camera.position.toArray())).toEqual(before.camera);
  expect(await page.evaluate(()=>stats.selections)).toEqual(['a']);
  expect(await page.evaluate(()=>context.scene.getObjectByName('custom-connection').children.length)).toBe(1);
  await page.evaluate(()=>viewer.setPaused(false));
  await expect.poll(()=>page.evaluate(()=>stats.elapsed)).toBeGreaterThan(before.elapsed);
});
test('invalid replacement and factory failures preserve the previous model',async({page})=>{
  await start(page);
  const result=await page.evaluate(()=>{
    let rejected=false;
    try{viewer.setModel({...model,connections:[{id:'bad',sourceId:'a',targetId:'missing'}]});}catch{rejected=true;}
    viewer.select('b');
    return {rejected,disposed:stats.disposed,selections:stats.selections};
  });
  expect(result).toEqual({rejected:true,disposed:0,selections:['b']});
  const staged=await page.evaluate(()=>{
    let failing=false,disposals=0;
    const host=document.createElement('div');host.style.height='200px';document.body.append(host);
    const v=createViewer(host,{assetFactory(asset){if(failing && asset.id==='b')throw Error('factory failure');const g=new THREE.BoxGeometry();g.addEventListener('dispose',()=>disposals++);return new THREE.Mesh(g,new THREE.MeshStandardMaterial());}});
    v.setModel(model);failing=true;let rejected=false;
    try{v.setModel(model);}catch{rejected=true;}
    v.select('b');const partial=disposals;v.dispose();return {rejected,partial,all:disposals};
  });
  expect(staged).toEqual({rejected:true,partial:1,all:3});
});
test('borrowed canvas survives idempotent disposal; listeners and frames stop',async({page})=>{
  await start(page,{borrowCanvas:true});
  await page.evaluate(()=>{viewer.dispose();viewer.dispose();});
  const frames=await page.evaluate(()=>stats.frames);
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>stats.frames)).toBe(frames);
  expect(await page.evaluate(()=>stats.disposed)).toBe(2);
  await expect(page.locator('#borrowed')).toHaveCount(1);
  await page.locator('#borrowed').focus();await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(()=>stats.selections)).toEqual([]);
  expect(await page.evaluate(()=>{try{viewer.select('a');return false;}catch{return true;}})).toBe(true);
});
test('reduced motion, camera keyboard mode and context loss',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await start(page,{keyboard:'camera'});
  expect(await page.evaluate(()=>stats.elapsed)).toBe(0);
  const initial=await page.evaluate(()=>context.camera.position.toArray());
  await page.locator('canvas').focus();await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(()=>context.camera.position.toArray())).not.toEqual(initial);
  expect(await page.evaluate(()=>stats.selections)).toEqual([]);
  await page.evaluate(()=>context.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await expect.poll(()=>page.evaluate(()=>stats.contextLost)).toBe(1);
});
