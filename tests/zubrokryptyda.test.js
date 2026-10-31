import {createObstacle} from '../src/obstacle-catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ENEMY_TYPES,ENEMY_SCHEDULE,HEAVY_ORDINALS,TOTAL_ENEMIES,moveEnemy,typeAt} from '../src/enemy-types.js';
import {ZUBROKRYPTYDA_ASSET,ZUBROKRYPTYDA_VISUAL_SCALE,ZUBROKRYPTYDA_FEET_OFFSET,bobrozombiFrame} from '../src/enemy-visual.js';
import {validPngHeader,assetUrl} from '../src/character-visual.js';
import {assetManifest,validateAssetManifest} from '../src/asset-manifest.js';
import {safeEnemySpawn} from '../src/weapon-progression.js';
test('approved Żubrokryptyda V2 exact 8-bit RGBA 1536x192 sheet',()=>{
 assert.deepEqual([ZUBROKRYPTYDA_ASSET.path,ZUBROKRYPTYDA_ASSET.width,ZUBROKRYPTYDA_ASSET.height,ZUBROKRYPTYDA_ASSET.frameWidth,ZUBROKRYPTYDA_ASSET.frameHeight],['enemies/zubrokryptyda.png',1536,192,192,192]);
 assert.equal(assetUrl('/klusoczlek/',ZUBROKRYPTYDA_ASSET.path),'/klusoczlek/assets/enemies/zubrokryptyda.png');
 const b=new Uint8Array(26);b.set([137,80,78,71,13,10,26,10]);const v=new DataView(b.buffer);v.setUint32(16,1536);v.setUint32(20,192);b[24]=8;b[25]=6;
 assert.equal(validPngHeader(b,ZUBROKRYPTYDA_ASSET),true);
 b[25]=2;assert.equal(validPngHeader(b,ZUBROKRYPTYDA_ASSET),false);
 const m=assetManifest.find(e=>e.id==='zubrokryptyda');
 assert.deepEqual([m.columns,m.rows,m.width,m.height],[8,1,1536,192]);
 assert.ok(validateAssetManifest());
 assert.equal(ZUBROKRYPTYDA_VISUAL_SCALE,0.55);
 assert.equal(ZUBROKRYPTYDA_FEET_OFFSET,-48.4);
 assert.deepEqual([[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]].map(([x,y])=>bobrozombiFrame(0,0,x,y)),[0,1,2,3,4,5,6,7]);
});
test('registry preserves two old enemies, heavy 8HP/42px/r30',()=>{
 assert.deepEqual([ENEMY_TYPES.bobrozombi.hp,ENEMY_TYPES.bobrozombi.speed,ENEMY_TYPES.bobrozombi.radius],[3,65,21]);
 assert.deepEqual([ENEMY_TYPES.bocianolak.hp,ENEMY_TYPES.bocianolak.speed,ENEMY_TYPES.bocianolak.radius],[2,85,18]);
 assert.deepEqual([ENEMY_TYPES.zubrokryptyda.hp,ENEMY_TYPES.zubrokryptyda.speed,ENEMY_TYPES.zubrokryptyda.radius],[8,42,30]);
 const e={type:'zubrokryptyda',x:250,y:300,hp:8},p={x:850,y:300};
 assert.equal(moveEnemy(e,p,1).x,292);
 assert.equal(moveEnemy(e,p,.5).x,271);
 assert.equal(moveEnemy(e,p,0).x,250);
 assert.equal(moveEnemy({...e,x:30,y:30},{x:-100,y:-100},10).x,30);
});
test('heavy schedule inserted without changing original 28 relative positions',()=>{
 assert.equal(TOTAL_ENEMIES,32);
 assert.deepEqual(HEAVY_ORDINALS,[13,20,27,32]);
 assert.deepEqual(ENEMY_SCHEDULE.flatMap((t,i)=>t==='zubrokryptyda'?[i+1]:[]),HEAVY_ORDINALS);
 assert.equal(ENEMY_SCHEDULE.filter(t=>t==='bobrozombi').length,18);
 assert.equal(ENEMY_SCHEDULE.filter(t=>t==='bocianolak').length,10);
 assert.equal(ENEMY_SCHEDULE.filter(t=>t==='zubrokryptyda').length,4);
 assert.deepEqual(ENEMY_SCHEDULE.slice(0,3),['bobrozombi','bobrozombi','bobrozombi']);
 assert.equal(typeAt(31),'zubrokryptyda');
 assert.equal(typeAt(32),null);
});
test('heavy spawns honor own radius and obstacle clearance',()=>{
 const player={x:900,y:600};
 const point=safeEnemySpawn(player,[],12,30);
 assert.ok(point.x>=30&&point.y>=30);
 const blocked=Array.from({length:8},(_,i)=>{const r=55;return [{x:r,y:r},{x:1800-r,y:r},{x:1800-r,y:1200-r},{x:r,y:1200-r},{x:900,y:r},{x:1800-r,y:600},{x:900,y:1200-r},{x:r,y:600}][i]});
 assert.equal(safeEnemySpawn(player,blocked.map((p,i)=>createObstacle('rock',{id:'r'+i,...p})),12,30),null);
});
