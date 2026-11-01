import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), 'plantframe-core-'));
try {
  const manifest = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8' }));
  assert(!manifest[0].files.some(file => file.path.startsWith('docs/.vitepress/')), 'Documentation build output must not enter the SDK archive');
  assert(manifest[0].files.some(file => file.path === 'LICENSE'), 'SDK package must contain its MIT license');
  const archive = path.join(temporary, manifest[0].filename), consumer = path.join(temporary, 'consumer');
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { '@plantframe/sdk': `file:${archive}` } }));
  execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--package-lock=false'], { cwd: consumer, stdio: 'pipe' });
  writeFileSync(path.join(consumer, 'verify.mjs'), `
    import assert from 'node:assert/strict';
    import { parseSceneModel, serializeSceneModel, ModelValidationError } from '@plantframe/sdk';
    import { importDxf } from '@plantframe/sdk/drawing';
    const model = parseSceneModel({schemaVersion:1,name:'Independent',assets:[],connections:[]});
    assert.equal(JSON.parse(serializeSceneModel(model)).name, 'Independent');
    assert.throws(() => parseSceneModel(null), ModelValidationError);
    const text = [0,'SECTION',2,'ENTITIES',0,'LINE',8,'WALLS',10,0,20,0,11,2,21,0,0,'ENDSEC',0,'EOF'].join('\\n')+'\\n';
    assert.equal(importDxf(text,{unit:'m'}).plan.walls.length,1);
    for(const name of ['three','zod','react','next']) assert.throws(() => import.meta.resolve(name), /Cannot find package/);
    assert.equal(typeof document,'undefined');
    console.log('Packed Core and DXF import work with no external runtime packages.');
  `);
  execFileSync(process.execPath, [path.join(consumer, 'verify.mjs')], { cwd: consumer, stdio: 'inherit' });
} finally { rmSync(temporary, { recursive: true, force: true }); }
