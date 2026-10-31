import {createObstacle} from '../src/obstacle-catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PANIC_PROFILES,createIgnitionState,igniteEnemy,advanceIgnition,isBurning,fleeStep} from '../src/enemy-panic.js';
import {ARENA} from '../src/movement.js';
import {resolveObstaclePosition} from '../src/obstacles.js';
for(const [type,duration,speed] of [['bobrozombi',2500,75],['bocianolak',1800,110],['zubrokryptyda',1200,35]]){
 test(type+' panic profile, fixed duration and immunity',()=>{
  assert.equal(PANIC_PROFILES[type].duration,duration);
  assert.equal(PANIC_PROFILES[type].speed,speed);
  const s=createIgnitionState();
  assert.equal(igniteEnemy(s,type,100),true);
  assert.equal(s.burningUntil,100+duration);
  assert.equal(igniteEnemy(s,type,300),false);
  assert.equal(s.burningUntil,100+duration);
  assert.equal(isBurning(s,100+duration-1),true);
  assert.equal(advanceIgnition(s,100+duration),true);
  assert.equal(isBurning(s,100+duration),false);
  assert.equal(igniteEnemy(s,type,100+duration+1000),false);
  assert.equal(igniteEnemy(s,type,100+duration+2000),true);
 });
 test(type+' flees at approved speed, clamped to arena',()=>{
  const enemy={x:500,y:500,type,hp:3,seed:0};
  const next=fleeStep(enemy,{x:550,y:500},1);
  assert.ok(Math.abs(next.x-(500-speed))<1e-8);
  assert.equal(next.y,500);
  const edge=fleeStep({...enemy,x:35,y:35},{x:550,y:550},10);
  assert.ok(edge.x>=0&&edge.x<=ARENA.width);
  assert.ok(edge.y>=0&&edge.y<=ARENA.height);
 });
}
test('overlap fallback deterministic and finite',()=>{
 const e={x:500,y:500,type:'bobrozombi',seed:4,hp:3};
 assert.deepEqual(fleeStep(e,e,0.1),fleeStep(e,e,0.1));
 assert.ok(Number.isFinite(fleeStep(e,e,0.1).x));
});
test('blocking obstacle resolver still controls resolved travel',()=>{
 const e={x:160,y:100,type:'bobrozombi',seed:1,hp:3};
 const next=fleeStep(e,{x:220,y:100},0.2);
 const stopped=resolveObstaclePosition(e,next,21,[createObstacle('rock',{id:'r',x:105,y:100,variant:'medium'})]);
 assert.ok(stopped.x>=105+31+21-0.001);
});
