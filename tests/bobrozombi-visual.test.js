import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assetManifest,validateAssetManifest } from '../src/asset-manifest.js';
import { BOBROZOMBI_ASSET, BOBROZOMBI_VISUAL_SCALE, bobrozombiFrame } from '../src/enemy-visual.js';
import { validPngHeader,assetUrl } from '../src/character-visual.js';
import { ENCOUNTER,applyEnemyHit,advanceEnemy } from '../src/bobrozombi.js';

function syntheticHeader(width=768,height=96,depth=8,type=6){
 const b=new Uint8Array(26);
 b.set([137,80,78,71,13,10,26,10]);
 const view=new DataView(b.buffer);
 view.setUint32(16,width);view.setUint32(20,height);
 b[24]=depth;b[25]=type;
 return b;
}
test('exact Bobrozombi V2 asset path, size, frame layout and manifest',()=>{
 assert.equal(BOBROZOMBI_ASSET.path,'enemies/bobrozombi.png');
 assert.equal(assetUrl('/klusoczlek/',BOBROZOMBI_ASSET.path),'/klusoczlek/assets/enemies/bobrozombi.png');
 assert.deepEqual([BOBROZOMBI_ASSET.width,BOBROZOMBI_ASSET.height,BOBROZOMBI_ASSET.frameWidth,BOBROZOMBI_ASSET.frameHeight],[768,96,96,96]);
 const entry=assetManifest.find(a=>a.id==='bobrozombi');
 assert.equal(entry.width,768);assert.equal(entry.height,96);
 assert.equal(entry.columns,8);assert.equal(entry.rows,1);
 assert.equal(entry.frameWidth,96);assert.equal(entry.frameHeight,96);
 assert.ok(validateAssetManifest());
 for(const id of ['enemy_fast']){
   const other=assetManifest.find(a=>a.id===id);
   assert.equal(other.width,384);assert.equal(other.frameWidth,48);
 }
 assert.equal(BOBROZOMBI_VISUAL_SCALE,0.75);
});
test('valid PNG metadata and rejected incompatible metadata',()=>{
 assert.equal(validPngHeader(syntheticHeader(),BOBROZOMBI_ASSET),true);
 for(const args of [[384,48,8,6],[768,96,16,6],[768,96,8,2],[767,96,8,6]]){
   assert.equal(validPngHeader(syntheticHeader(...args),BOBROZOMBI_ASSET),false);
 }
 const bad=syntheticHeader();bad[0]=0;
 assert.equal(validPngHeader(bad,BOBROZOMBI_ASSET),false);
 assert.equal(validPngHeader(new Uint8Array(4),BOBROZOMBI_ASSET),false);
});
test('all octants and zero-distance facing persistence',()=>{
 const expected=[['e',1,0],['se',1,1],['s',0,1],['sw',-1,1],['w',-1,0],['nw',-1,-1],['n',0,-1],['ne',1,-1]];
 expected.forEach(([name,x,y],i)=>assert.equal(bobrozombiFrame(0,0,x,y),i,name));
 assert.equal(bobrozombiFrame(2,3,2,3,'nw'),5);
});
test('combat invariants remain independent of source sprite resolution',()=>{
 assert.equal(ENCOUNTER.enemyHp,3);assert.equal(ENCOUNTER.enemySpeed,65);assert.equal(ENCOUNTER.enemyRadius,21);
 assert.equal(applyEnemyHit(3,1),2);assert.equal(applyEnemyHit(1,1),0);
 const out=advanceEnemy({x:100,y:100,hp:3},{x:200,y:100},1);
 assert.equal(out.x,165);assert.equal(out.y,100);
});
test('both types use the shared renderer and retain death cleanup',()=>{
 const src=readFileSync(new URL('../src/scenes.js',import.meta.url),'utf8');
 assert.match(src,/this\.enemyRenderers=\{bobrozombi:createBobrozombiRenderer/);
 assert.match(src,/bocianolak:createBocianolakRenderer/);
 assert.match(src,/this\.enemyRenderers\[type\]\.create/);
 assert.match(src,/this\.enemyRenderers\[enemy\.type\]\.update/);
 assert.match(src,/enemy\.sprite\.destroy\(\)/);
 assert.match(src,/renderer\.shutdown\(\)/);
 assert.match(src,/if\(this\.kills===TOTAL_ENEMIES\)/);
});
