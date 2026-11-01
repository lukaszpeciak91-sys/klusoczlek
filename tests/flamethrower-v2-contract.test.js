import {createObstacle} from '../src/obstacle-catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBAT_TUNING,flameTargetVisible,cooldownReady} from '../src/weapon-combat.js';
import {createIgnitionState,igniteEnemy,advanceIgnition,isBurning} from '../src/enemy-panic.js';
import {WAVES,TOTAL_ENEMIES,TOTAL_WAVES,INTERMISSION_MS,HEALTH_AFTER_WAVES,createEpisode,recordSpawn,recordDeath,FINAL_ENCOUNTER,recordSpecialSpawn,nextType,waveCapacity,advanceEpisode,beginBossResolution,finishBossResolution} from '../src/episode.js';

test('flame damage and visual cone contract retain their original values',()=>{
 const t=COMBAT_TUNING.flamethrower;
 assert.equal(t.range,145);assert.equal(t.halfAngle,25*Math.PI/180);
 assert.equal(t.damage,1);assert.equal(t.damageInterval,250);
 assert.equal(t.particleInterval,22);assert.equal(t.maxParticles,60);
});
test('ignition is gated behind visibility AND per-target damage cooldown',()=>{
 const state=createIgnitionState(),hits=new Map(),enemy={x:90,y:0,type:'bobrozombi'};
 const origin={x:0,y:0},aim={x:1,y:0};
 const obstacles=[createObstacle('rock',{id:'r',x:45,y:0})];
 const hit=(now,blockers)=>{
  if(!flameTargetVisible(origin,aim,enemy,21,blockers))return false;
  if(!cooldownReady(hits,enemy,now,250))return false;
  return igniteEnemy(state,enemy.type,now);
 };
 assert.equal(hit(100,obstacles),false);
 assert.equal(state.ignitedAt,null);
 assert.equal(hit(100,[]),true);
 assert.equal(hit(140,[]),false);
 assert.equal(state.burningUntil,2600);
 assert.equal(hit(360,[]),false);
 assert.equal(state.burningUntil,2600);
});
test('hits during immunity remain damage eligible but do not restart panic',()=>{
 const state=createIgnitionState(),hits=new Map(),enemy={};
 assert.equal(igniteEnemy(state,'bobrozombi',100),true);
 assert.equal(advanceIgnition(state,2600),true);
 assert.equal(cooldownReady(hits,enemy,2700,250),true);
 assert.equal(igniteEnemy(state,'bobrozombi',2700),false);
 assert.equal(cooldownReady(hits,enemy,2950,250),true);
 assert.equal(isBurning(state,2950),false);
 assert.equal(igniteEnemy(state,'bobrozombi',4600),true);
});
test('exact expiry hit cannot skip immunity even without update frame',()=>{
 const state=createIgnitionState();
 assert.equal(igniteEnemy(state,'bocianolak',100),true);
 assert.equal(igniteEnemy(state,'bocianolak',1900),false);
 assert.equal(state.panicImmuneUntil,3900);
});
test('six-wave episode contract and exact spawn/death progression',()=>{
 const expected=[[12,0,0,4],[11,5,0,5],[11,8,1,6],[11,11,3,7],[12,14,4,8],[12,17,6,9]];
 assert.equal(TOTAL_ENEMIES,153);assert.equal(TOTAL_WAVES,6);
 assert.equal(INTERMISSION_MS,3000);
 assert.deepEqual(HEALTH_AFTER_WAVES,[2,4,5]);
 assert.deepEqual(WAVES.map(w=>[
  w.enemies.filter(t=>t==='bobrozombi').length,
  w.enemies.filter(t=>t==='bocianolak').length,
  w.enemies.filter(t=>t==='zubrokryptyda').length,w.maxAlive]),expected);
 const ep=createEpisode();
 for(let i=0;i<WAVES.length;i++){
  const wave=WAVES[i];assert.equal(waveCapacity(ep),expected[i][3]);
  for(let j=0;j<wave.enemies.length;j++){
   assert.equal(nextType(ep),wave.enemies[j]);
   assert.equal(recordSpawn(ep),true);
  }
  for(let j=0;j<wave.enemies.length;j++){
   const living=wave.enemies.length-j-1;
   const event=recordDeath(ep,living,i*10000);
   if(j<wave.enemies.length-1)assert.equal(event,null);
   else assert.equal(event,i===5?null:'wave-cleared');
  }
  if(i<5){
   assert.equal(advanceEpisode(ep,i*10000+2999),false);
   assert.equal(advanceEpisode(ep,i*10000+3000),true);
  }
 }
 for(const spec of FINAL_ENCOUNTER)recordSpecialSpawn(ep,spec.id);
 assert.equal(ep.state,'active');
 assert.equal(beginBossResolution(ep),true);
 assert.equal(finishBossResolution(ep),true);
 assert.equal(ep.state,'final-pending');
});
test('burning living final enemy never counts as a wave death',()=>{
 const ep=createEpisode(),wave=WAVES[0];
 for(const unused of wave.enemies)recordSpawn(ep);
 for(let i=0;i<wave.enemies.length-1;i++)recordDeath(ep,wave.enemies.length-i-1,100);
 const state=createIgnitionState();igniteEnemy(state,'bobrozombi',100);
 assert.equal(isBurning(state,150),true);
 assert.equal(ep.state,'active');assert.equal(ep.defeated,11);
 assert.equal(recordDeath(ep,0,160),'wave-cleared');
});
