import test from 'node:test';
import assert from 'node:assert/strict';
import {ARENA,PLAYER_RADIUS} from '../src/movement.js';
import {OBSTACLE_LAYOUTS,OBSTACLE_RULES,getObstacleLayout,layoutValid,resolveObstaclePosition,segmentObstacleHit,damageObstacle,inExplosion} from '../src/obstacles.js';
test('four fixed safe traversable layouts and fresh copies',()=>{
 assert.equal(OBSTACLE_LAYOUTS.length,4);
 for(let i=0;i<4;i++){
 const layout=getObstacleLayout(i);
 assert.equal(layoutValid(layout),true);
 assert.deepEqual(layout.map(o=>o.type),['rock','log','barrel']);
 assert.equal(layout.filter(o=>o.type==='barrel').length,1);
 }
 const first=getObstacleLayout(0);damageObstacle(first[2],3);
 assert.equal(getObstacleLayout(0)[2].alive,true);
});
test('player and enemy cannot occupy static blocker circle',()=>{
 const layout=[{x:200,y:200,type:'rock',alive:true}];
 for(const radius of [PLAYER_RADIUS,21]){
  const next=resolveObstaclePosition({x:100,y:200},{x:200,y:200},radius,layout);
  assert.ok(Math.hypot(next.x-200,next.y-200)>=OBSTACLE_RULES.rockRadius+radius-1e-8);
 }
});
test('projectiles collide with rock, log and alive barrel',()=>{
 for(const type of ['rock','log','barrel']){
  const o={x:200,y:200,type,alive:true,hp:3};
  assert.equal(segmentObstacleHit({x:100,y:200},{x:300,y:200},[o]),o);
  o.alive=false;
  assert.equal(segmentObstacleHit({x:100,y:200},{x:300,y:200},[o]),null);
 }
});
test('barrel takes three projectile hits and explodes once',()=>{
 const b={type:'barrel',alive:true,hp:3,x:100,y:100};
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
