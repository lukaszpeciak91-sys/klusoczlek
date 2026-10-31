import test from 'node:test';
import assert from 'node:assert/strict';
import {pngAlpha} from './png-alpha.mjs';
import {damageFootprints,enemyProjectileHit,enemyFlameVisible} from '../src/enemy-damage.js';
import {segmentFootprintHit,footprintDistance,firstFootprintHit} from '../src/obstacle-geometry.js';
import {createObstacle} from '../src/obstacle-catalog.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
const enemy={type:'zubrokryptyda',x:600,y:600,hp:8};
const pose={art:true,x:600,y:551.6,angle:0,scale:.55};
test('PR42 approved eight-pose head/shoulder/torso pixels hit without frame-wide boxes',()=>{
 const alpha=pngAlpha(new URL('../public/assets/enemies/zubrokryptyda.png',import.meta.url));
 for(let frame=0;frame<8;frame++){
  const shapes=damageFootprints(enemy,pose);
  for(const [x,y] of [[96,55],[52,90],[140,90],[96,125]]){
   assert.ok(alpha.at(frame*192+x,y)>128,`approved opaque pixel ${frame} ${x},${y}`);
   const p={x:pose.x+(x-96)*.55,y:pose.y+(y-96)*.55};
   assert.ok(shapes.some(s=>footprintDistance(s,p)<=0),`body pixel outside union ${frame}`);
   assert.ok(enemyProjectileHit({x:p.x-1,y:p.y},{x:p.x+1,y:p.y},enemy,0,pose));
  }
  for(const [x,y] of [[0,0],[191,0],[0,191],[191,191]]){
   assert.equal(alpha.at(frame*192+x,y),0);
   const p={x:pose.x+(x-96)*.55,y:pose.y+(y-96)*.55};
   assert.equal(enemyProjectileHit(p,p,enemy,0,pose),null);
  }
 }
 const from={x:500,y:545},to={x:700,y:545};
 assert.equal(segmentFootprintHit(from,to,{shape:'circle',x:600,y:600,angle:0,radius:30},3),null);
 assert.ok(enemyProjectileHit(from,to,enemy,3,pose));
});
test('PR42 exact visual transform, first surface, projectile radii and unchanged movement',()=>{
 const a=damageFootprints(enemy,pose),turned=damageFootprints(enemy,{...pose,x:604,y:550,angle:.1});
 assert.equal(a.length,3);assert.ok(turned.some((s,i)=>Math.abs(s.x-a[i].x)>1));
 for(const radius of [3,5]){
  const from={x:400,y:550},to={x:800,y:550},hit=enemyProjectileHit(from,to,enemy,radius,pose);
  const exact=a.map(s=>segmentFootprintHit(from,to,s,radius)).filter(Boolean).sort((x,y)=>x.t-y.t)[0];
  assert.equal(hit.t,exact.t);
  const before=createObstacle('rock',{id:'before',x:480,y:550});
  const after=createObstacle('rock',{id:'after',x:720,y:550});
  assert.ok(firstFootprintHit(from,to,[before],radius).t<hit.t);
  assert.ok(firstFootprintHit(from,to,[after],radius).t>hit.t);
 }
 assert.equal(ENEMY_TYPES.zubrokryptyda.radius,30);assert.equal(ENEMY_TYPES.zubrokryptyda.hp,8);
 for(const type of ['bobrozombi','bocianolak'])assert.deepEqual(damageFootprints({...enemy,type},pose),[{shape:'circle',x:600,y:600,angle:0,radius:ENEMY_TYPES[type].radius}]);
});
test('PR42 body-compatible flame cone, range, obstacle occlusion and missing-art fallback',()=>{
 const from={x:500,y:550},aim={x:1,y:0};
 assert.ok(enemyFlameVisible(from,aim,enemy,[],pose));
 assert.equal(enemyFlameVisible(from,aim,enemy,[createObstacle('fallen_log',{id:'wall',x:550,y:550,angle:Math.PI/2})],pose),false);
 assert.equal(enemyFlameVisible({x:200,y:550},aim,enemy,[],pose),false);
 assert.equal(enemyFlameVisible(from,{x:-1,y:0},enemy,[],pose),false);
 assert.ok(enemyProjectileHit({x:500,y:570},{x:700,y:570},enemy,3));
 assert.ok(damageFootprints(enemy).every(s=>Number.isFinite(s.radius)&&s.radius>0));
});
