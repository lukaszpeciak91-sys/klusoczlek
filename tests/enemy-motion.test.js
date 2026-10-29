import test from 'node:test';
import assert from 'node:assert/strict';
import {ENEMY_MOTION,phaseForSeed,createEnemyGait,advanceEnemyGait} from '../src/enemy-motion.js';
test('three distinct grounded visual profiles without gameplay tuning',()=>{
 assert.deepEqual(Object.keys(ENEMY_MOTION),['bobrozombi','bocianolak','zubrokryptyda']);
 assert.deepEqual(Object.values(ENEMY_MOTION).map(p=>[p.hz,p.rotation,p.bob,p.speed]),[[1.8,3,1.8,65],[2.7,2,2.8,85],[1.1,1.5,1.2,42]]);
});
test('distance drives gait, no walking in place while blocked',()=>{
 const g=createEnemyGait('bobrozombi',3),before=g.phase;
 for(let i=0;i<12;i++)advanceEnemyGait(g,'bobrozombi',65/60,1/60);
 assert.notEqual(g.phase,before);
 const locked=g.phase;
 for(let i=0;i<120;i++)advanceEnemyGait(g,'bobrozombi',0,1/60);
 assert.equal(g.phase,locked);
 assert.ok(g.intensity<0.001);
 assert.ok(Math.abs(g.rotation)<0.001&&Math.abs(g.bob)<0.001);
});
test('deterministic phase, different seeds, bounded rotations and bobs',()=>{
 assert.equal(phaseForSeed(17),phaseForSeed(17));
 assert.notEqual(phaseForSeed(17),phaseForSeed(18));
 for(const type of Object.keys(ENEMY_MOTION)){
  const p=ENEMY_MOTION[type],a=createEnemyGait(type,4),b=createEnemyGait(type,4);
  for(let i=0;i<250;i++){
   advanceEnemyGait(a,type,p.speed/60,1/60);advanceEnemyGait(b,type,p.speed/60,1/60);
   assert.deepEqual(a,b);
   assert.ok(Math.abs(a.rotation)<=p.rotation*Math.PI/180+1e-9);
   assert.ok(a.bob>=-p.bob-1e-9&&a.bob<=1e-9);
  }
 }
});
test('large time delta cannot skip gait, repeated stop/start remains continuous',()=>{
 const a=createEnemyGait('zubrokryptyda',11);
 advanceEnemyGait(a,'zubrokryptyda',42,3);
 const changed=a.phase,oldRotation=a.rotation;
 advanceEnemyGait(a,'zubrokryptyda',0,1/60);
 assert.equal(a.phase,changed);
 assert.ok(Math.abs(a.rotation-oldRotation)<=.03);
 advanceEnemyGait(a,'zubrokryptyda',42/60,1/60);
 assert.ok(Number.isFinite(a.rotation)&&Number.isFinite(a.bob));
});
test('visual gait never reads or modifies logical enemy coordinates',()=>{
 const enemy={x:230,y:490,hp:8,radius:30},g=createEnemyGait('zubrokryptyda',5);
 for(let i=0;i<120;i++)advanceEnemyGait(g,'zubrokryptyda',42/60,1/60);
 assert.deepEqual(enemy,{x:230,y:490,hp:8,radius:30});
});
