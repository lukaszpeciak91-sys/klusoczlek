import test from 'node:test';
import assert from 'node:assert/strict';
import {ATTACK_PROFILES,DEATH_PROFILES,makeFeedback,recordAttack,recordHit,pose,hitActive,fragmentSpec} from '../src/combat-feedback.js';
import {WAVES,WAVE_TIMING,HEALTH_AFTER_WAVES,createEpisode,recordSpawn,recordDeath,advanceTimedWaves} from '../src/episode.js';
import {COMBAT_TUNING} from '../src/weapon-combat.js';
test('distinct enemy attack poses peak and return without world-coordinate mutation',()=>{
 const state=makeFeedback(),from={x:20,y:40},to={x:40,y:40};
 for(const type of Object.keys(ATTACK_PROFILES)){
  recordAttack(state,type,1000,from,to);
  assert.ok(pose(state,type,1000+ATTACK_PROFILES[type].duration/2).x>0);
  assert.equal(pose(state,type,1000+ATTACK_PROFILES[type].duration+1).x,0);
  assert.deepEqual(from,{x:20,y:40});
 }
 assert.deepEqual(Object.values(ATTACK_PROFILES).map(p=>p.duration),[290,210,170,260]);
});
test('hit feedback throttles repeated events and fades',()=>{
 const state=makeFeedback();
 assert.equal(recordHit(state,100,{x:0,y:0},{x:1,y:0}),true);
 assert.equal(recordHit(state,110,{x:0,y:0},{x:1,y:0}),false);
 assert.ok(hitActive(state,150));
 assert.equal(hitActive(state,210),false);
 assert.equal(pose(state,'aloes',290).x,0);
});
test('red fragment profiles deterministic, bounded and distinct',()=>{
 for(const [type,p] of Object.entries(DEATH_PROFILES)){
  assert.ok(p.count<=(type==='marcin'?88:65)&&p.duration>=300&&p.duration<=(type==='marcin'?650:450));
  const points=Array.from({length:p.count},(_,i)=>fragmentSpec(type,7,i));
  assert.deepEqual(points[0],fragmentSpec(type,7,0));
  assert.ok(points.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.size>0));
 }
 assert.deepEqual(Object.values(DEATH_PROFILES).map(p=>p.count),[88,30,36,58,36]);
});
test('six timed waves, healing and flamethrower tuning unchanged',()=>{
 assert.equal(WAVES.length,6);assert.equal(153);
 assert.deepEqual(WAVES.map(w=>w.maxAlive),[6,7,8,9,9,10]);
 assert.equal(WAVE_TIMING[1].startMs,35000);assert.deepEqual(HEALTH_AFTER_WAVES,[2,4,5]);
 assert.equal(COMBAT_TUNING.flamethrower.damage,1);
 assert.equal(COMBAT_TUNING.flamethrower.damageInterval,250);
 const state=createEpisode();
 for(let i=0;i<12;i++)recordSpawn(state,'bobrozombi');
 for(let i=0;i<11;i++)assert.equal(recordDeath(state,11-i,200),null);
 assert.equal(state.state,'active');
 assert.equal(recordDeath(state,0,200),null);assert.equal(state.wave,0);assert.deepEqual(advanceTimedWaves(state,35000),[1]);
});
