import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA } from '../src/movement.js';
import { ENCOUNTER, enemySpawns, advanceEnemy, applyEnemyHit, applyPlayerContact, segmentHitsCircle } from '../src/bobrozombi.js';
test('deterministic safe spawns',()=>{
 const p={x:ARENA.width/2,y:ARENA.height/2};
 const a=enemySpawns(p);
 assert.deepEqual(a,enemySpawns(p));
 assert.equal(a.length,3);
 for(const e of a){assert.ok(e.x>=ENCOUNTER.enemyRadius&&e.x<=ARENA.width-ENCOUNTER.enemyRadius);assert.ok(e.y>=ENCOUNTER.enemyRadius&&e.y<=ARENA.height-ENCOUNTER.enemyRadius);assert.ok(Math.hypot(e.x-p.x,e.y-p.y)>=ENCOUNTER.minSpawnDistance);}
});
test('pursuit is normalized and frame-rate independent',()=>{
 const e={x:100,y:100,hp:3};
 const a=advanceEnemy(e,{x:500,y:100},1);
 let b={...e};for(let i=0;i<10;i++)b=advanceEnemy(b,{x:500,y:100},0.1);
 assert.ok(Math.abs(a.x-b.x)<1e-8);assert.equal(a.y,b.y);assert.equal(a.x,165);
 assert.deepEqual(advanceEnemy({...e,hp:0},{x:500,y:100},1),{...e,hp:0});
});
test('enemy hit and death saturates and does not revive',()=>{
 assert.equal(applyEnemyHit(3,1),2);assert.equal(applyEnemyHit(1,1),0);assert.equal(applyEnemyHit(0,1),0);
});
test('swept bullet segment hits once per projectile',()=>{
 assert.equal(segmentHitsCircle({x:0,y:0},{x:100,y:0},{x:50,y:2},5),true);
 assert.equal(segmentHitsCircle({x:0,y:0},{x:100,y:0},{x:50,y:20},5),false);
});
test('contact invulnerability and defeat',()=>{
 let a=applyPlayerContact({hp:5,invulnerableUntil:0},1000);
 assert.deepEqual(a,{hp:4,invulnerableUntil:1800});
 assert.deepEqual(applyPlayerContact(a,1799),a);
 a=applyPlayerContact(a,1800);assert.equal(a.hp,3);
 for(let i=0;i<3;i++)a=applyPlayerContact(a,2600+i*800);
 assert.equal(a.hp,0);assert.deepEqual(applyPlayerContact(a,9999),a);
});
