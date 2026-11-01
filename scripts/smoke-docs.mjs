import assert from 'node:assert/strict';
const base = process.env.DOCS_SMOKE_URL || 'http://127.0.0.1:8081';
async function get(path, status=200) {
  const response = await fetch(new URL(path, base), {signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,status,`${path}: HTTP ${response.status}`);
  return {response,body:await response.text()};
}
assert.equal((await get('/healthz')).body.trim(),'ok');
for(const route of ['/','/guide/start','/guide/core','/guide/viewer','/guide/drawing','/api','/examples','/mcp','/haus-blick','/hosting','/license','/contributing','/security','/support','/code-of-conduct','/governance','/changelog','/architecture','/roadmap','/releases','/guide/sensors']) {
  const {body}=await get(route); assert(body.includes('PlantFrame') && body.includes('<h1'),'SSR documentation missing');
}
for(const name of ['sensor-catalog','sensor-bindings','sensor-state']) {
  const {body}=await get(`/contracts/${name}.v1.schema.json`);
  assert.equal(JSON.parse(body).$id,`https://docs.plantframe.de/contracts/${name}.v1.schema.json`);
}
assert((await get('/sitemap.xml')).body.includes('https://docs.plantframe.de/guide/start'));
assert((await get('/robots.txt')).body.includes('Disallow: /datenschutz'));
assert((await get('/license.txt')).body.includes('MIT License'));
const html=(await get('/guide/start')).body;
for(const path of new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(m=>m[1]))) await get(path);
for(const path of ['/.env','/.git/config','/package.json','/docs/.vitepress/config.mts','/not-a-doc']) await get(path,404);
console.log('Documentation container passed routes, assets, MIT license, sitemap and private-path checks.');
