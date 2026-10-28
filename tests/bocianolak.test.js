import test from 'node:test';
import assert from 'node:assert/strict';
import {ENEMY_TYPES,ENEMY_SCHEDULE,TOTAL_ENEMIES,moveEnemy} from '../src/enemy-types.js';
import {BOCIANOLAK_ASSET,BOCIANOLAK_VISUAL_SCALE,BOCIANOLAK_FEET_OFFSET,bobrozombiFrame} from '../src/enemy-visual.js';
import {validateAssetManifest,assetManifest} from '../src/asset-manifest.js';
test('28 deterministic mixed enemies, starts with three beavers',()=>{
 assert.equal(TOTAL_ENEMIES,28);
 assert.equal(ENEMY_SCHEDULE.filter(x=>x==='bobrozombi').length,18);
 assert.equal(ENEMY_SCHEDULE.filter(x=>x==='bocianolak').length,10);
 assert.deepEqual(ENEMY_SCHEDULE.slice(0,3),['bobrozombi','bobrozombi','bobrozombi']);
 assert.ok(ENEMY_SCHEDULE.slice(3,16).includes('bocianolak'));
});
test('type registry preserves beaver balance and adds slightly faster stork',()=>{
 assert.deepEqual([ENEMY_TYPES.bobrozombi.hp,ENEMY_TYPES.bobrozombi.speed,ENEMY_TYPES.bobrozombi.radius],[3,65,21]);
 assert.deepEqual([ENEMY_TYPES.bocianolak.hp,ENEMY_TYPES.bocianolak.speed,ENEMY_TYPES.bocianolak.radius],[2,85,18]);
});
test('approved Bocianołak horizontal sheet and eight directional frame indices',()=>{
 assert.deepEqual([BOCIANOLAK_ASSET.path,BOCIANOLAK_ASSET.width,BOCIANOLAK_ASSET.height,BOCIANOLAK_ASSET.frameWidth,BOCIANOLAK_ASSET.frameHeight],['enemies/bocianolak.png',1024,160,128,160]);
 assert.equal(BOCIANOLAK_VISUAL_SCALE,0.65);assert.equal(BOCIANOLAK_FEET_OFFSET,-47);
 assert.ok(validateAssetManifest());
 assert.ok(assetManifest.some(a=>a.id==='bocianolak'&&a.columns===8&&a.rows===1));
 assert.deepEqual([[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]].map(([x,y])=>bobrozombiFrame(0,0,x,y)),[0,1,2,3,4,5,6,7]);
});
test('stork bounded deterministic weave, timestep stable and distinct from beaver',()=>{
 const enemy={type:'bocianolak',seed:3,hp:2,x:280,y:280},player={x:900,y:650};
 const a=moveEnemy(enemy,player,0.1,2.1);
 assert.deepEqual(a,moveEnemy(enemy,player,0.1,2.1));
 assert.ok(Math.hypot(a.x-enemy.x,a.y-enemy.y)<=8.51);
 const b=moveEnemy({...enemy,type:'bobrozombi',hp:3},player,0.1,2.1);
 assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>1);
 const boundary=moveEnemy({...enemy,x:18,y:18}, {x:-1000,y:-1000},2,1);
 assert.ok(boundary.x>=18&&boundary.y>=18);
});
