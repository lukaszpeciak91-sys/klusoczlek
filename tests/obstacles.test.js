import {createObstacle} from '../src/obstacle-catalog.js';
import {generateArenaLayout,layoutSafe} from '../src/arena-layout.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ARENA,PLAYER_RADIUS} from '../src/movement.js';
import {OBSTACLE_RULES,resolveObstaclePosition,segmentObstacleHit,damageObstacle,inExplosion} from '../src/obstacles.js';
test('generated layouts replace fixed layouts with independent instance state',()=>{
 const a=generateArenaLayout(1),b=generateArenaLayout(1);
 assert.ok(layoutSafe(a.obstacles));
 const barrel=a.obstacles.find(o=>o.type==='toxic_barrel');damageObstacle(barrel,3);
 assert.equal(b.obstacles.find(o=>o.id===barrel.id).alive,true);
});
test('player and enemy cannot occupy static blocker circle',()=>{
 const layout=[createObstacle('rock',{id:'r',x:200,y:200,variant:'medium'})];
 for(const radius of [PLAYER_RADIUS,21]){
  const next=resolveObstaclePosition({x:100,y:200},{x:200,y:200},radius,layout);
  assert.ok(Math.hypot(next.x-200,next.y-200)>=31+radius-1e-8);
 }
});
test('projectiles collide with rock, log and alive barrel',()=>{
 for(const type of ['rock','fallen_log','toxic_barrel']){
  const o=createObstacle(type,{id:type,x:200,y:200});
  assert.equal(segmentObstacleHit({x:100,y:200},{x:300,y:200},[o]),o);
  o.alive=false;
  assert.equal(segmentObstacleHit({x:100,y:200},{x:300,y:200},[o]),null);
 }
});
test('barrel takes three projectile hits and explodes once',()=>{
 const b=createObstacle('toxic_barrel',{id:'b',x:100,y:100});
 assert.equal(damageObstacle(b).exploded,false);
 assert.equal(damageObstacle(b).exploded,false);
 assert.deepEqual(damageObstacle(b),{exploded:true,hp:0});
 assert.equal(b.alive,false);
 assert.equal(damageObstacle(b).exploded,false);
});
test('radial explosion includes edge and excludes outside',()=>{
 const b={x:100,y:100};
 assert.equal(inExplosion({x:210,y:100},b),true);
 assert.equal(inExplosion({x:211,y:100},b),false);
 assert.equal(OBSTACLE_RULES.enemyExplosionDamage,2);
 assert.equal(OBSTACLE_RULES.playerExplosionDamage,1);
});
