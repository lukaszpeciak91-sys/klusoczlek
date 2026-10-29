import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVES,TOTAL_WAVES,TOTAL_ENEMIES,HEALTH_AFTER_WAVES,createEpisode,nextType,waveCapacity,recordSpawn,recordDeath,advanceEpisode,terminateEpisode,healedHp} from '../src/episode.js';
test('Episode 1 six deterministic waves and species introduction',()=>{
 assert.equal(TOTAL_WAVES,6);assert.equal(TOTAL_ENEMIES,66);
 assert.deepEqual(WAVES.map(w=>w.enemies.length),[8,10,12,12,12,12]);
 assert.deepEqual(WAVES.map(w=>w.maxAlive),[3,3,4,4,4,5]);
 assert.ok(WAVES[0].enemies.every(x=>x==='bobrozombi'));
 assert.ok(WAVES[1].enemies.includes('bocianolak'));
 assert.ok(WAVES[2].enemies.includes('zubrokryptyda'));
 assert.deepEqual(HEALTH_AFTER_WAVES,[2,4,5]);
});
test('scheduler cannot advance a wave before all spawns and kills',()=>{
 const e=createEpisode();assert.equal(nextType(e),'bobrozombi');
 for(let n=0;n<7;n++){assert.equal(recordSpawn(e),true);assert.equal(recordDeath(e,1,100),null);}
 assert.equal(advanceEpisode(e,4000),false);
 assert.equal(recordSpawn(e),true);assert.equal(recordDeath(e,0,100),'wave-cleared');
 assert.equal(nextType(e),null);assert.equal(advanceEpisode(e,3099),false);
 assert.equal(advanceEpisode(e,3100),true);assert.equal(e.wave,1);
});
test('all six waves reach final pending exactly once',()=>{
 const e=createEpisode();
 for(let i=0;i<6;i++){
  for(let n=0;n<WAVES[i].enemies.length;n++){
   assert.ok(nextType(e));recordSpawn(e);
   assert.equal(recordDeath(e,n===WAVES[i].enemies.length-1?0:1,1000),n===WAVES[i].enemies.length-1?(i===5?'final-cleared':'wave-cleared'):null);
  }
  if(i<5)assert.equal(advanceEpisode(e,4000),true);
 }
 assert.equal(e.state,'final-pending');assert.equal(terminateEpisode(e,'victory'),true);
 assert.equal(terminateEpisode(e,'victory'),false);
});
test('defeat wins terminal precedence and healing respects bounds',()=>{
 const e=createEpisode();assert.equal(terminateEpisode(e,'victory'),false);
 assert.equal(terminateEpisode(e,'defeat'),true);assert.equal(terminateEpisode(e,'victory'),false);
 assert.equal(e.state,'defeat');
 assert.equal(healedHp(1),3);assert.equal(healedHp(4),5);assert.equal(healedHp(5),5);
});
