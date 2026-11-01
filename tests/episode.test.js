import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVES,TOTAL_WAVES,TOTAL_ENEMIES,HEALTH_AFTER_WAVES,createEpisode,nextType,waveCapacity,recordSpawn,recordDeath,advanceTimedWaves,WAVE_TIMING,terminateEpisode,healedHp,FINAL_ENCOUNTER,recordSpecialSpawn,REINFORCEMENTS,beginBossResolution,finishBossResolution,recordReinforcementSpawn,BOSS_NON_MARCIN_CAP} from '../src/episode.js';
test('Episode 1 six deterministic waves and species introduction',()=>{
 assert.equal(TOTAL_WAVES,6);assert.equal(TOTAL_ENEMIES,153);
 assert.deepEqual(WAVES.map(w=>w.enemies.length),[12,16,20,25,30,35]);
 assert.deepEqual(WAVES.map(w=>w.maxAlive),[4,5,6,7,8,9]);
 assert.ok(WAVES[0].enemies.every(x=>x==='bobrozombi'));
 assert.ok(WAVES[1].enemies.includes('bocianolak'));
 assert.ok(WAVES[2].enemies.includes('zubrokryptyda'));
 assert.deepEqual(HEALTH_AFTER_WAVES,[2,4,5]);
});
test('timed scheduler advances without cleanup and never on death',()=>{
 const e=createEpisode();assert.equal(nextType(e),'bobrozombi');
 for(let n=0;n<12;n++){assert.equal(recordSpawn(e),true);assert.equal(recordDeath(e,0,999999),null);}
 assert.equal(e.wave,0);assert.equal(e.state,'active');assert.deepEqual(advanceTimedWaves(e,34999),[]);
 assert.deepEqual(advanceTimedWaves(e,35000),[1]);assert.equal(e.wave,1);assert.equal(nextType(e),'bocianolak');
});
test('six timed budgets preserve all138 possible spawns; only boss reaches finale',()=>{
 const e=createEpisode(41);
 for(let i=0;i<6;i++){
  for(let n=0;n<WAVES[i].enemies.length;n++){assert.ok(nextType(e));recordSpawn(e);assert.equal(recordDeath(e,0,1000),null);}
  assert.equal(e.state,'active');if(i<5)assert.deepEqual(advanceTimedWaves(e,WAVE_TIMING[i+1].startMs),[i+1]);
 }
 assert.equal(e.spawnedByWave.reduce((a,b)=>a+b,0),138);
 recordSpecialSpawn(e,'marcin');assert.equal(beginBossResolution(e),true);assert.equal(finishBossResolution(e),true);
 assert.equal(e.state,'final-pending');assert.equal(terminateEpisode(e,'victory'),true);assert.equal(terminateEpisode(e,'victory'),false);
});
test('defeat wins terminal precedence and healing respects bounds',()=>{
 const e=createEpisode();assert.equal(terminateEpisode(e,'victory'),false);
 assert.equal(terminateEpisode(e,'defeat'),true);assert.equal(terminateEpisode(e,'victory'),false);
 assert.equal(e.state,'defeat');
 assert.equal(healedHp(1),3);assert.equal(healedHp(4),5);assert.equal(healedHp(5),5);
});

import {arenaHudLayout} from '../src/ui-layout.js';
test('compact wave counter remains in the shared HUD ribbon at supported landscape widths',()=>{
 for(const [w,h] of [[320,240],[568,320],[800,360],[960,540]]){
  const ui=arenaHudLayout(h,w);
  const right=ui.waveX+(w<390?39:w<600?53:67);
  assert.ok(ui.waveX>ui.killsX+28,`wave overlaps kills at ${w}`);
  assert.ok(right<=ui.portraitX-ui.portraitSize/2,`wave overlaps portrait at ${w}`);
  assert.ok(ui.waveY>=ui.panelY&&ui.waveY<=ui.panelY+ui.panelHeight,`wave outside ribbon at ${w}`);
 }
});

test('new heavy participation is increasing without exceeding one living heavy spawn gate',()=>{
 const counts=WAVES.map(w=>w.enemies.filter(x=>x==='zubrokryptyda').length);
 assert.deepEqual(counts,[0,0,1,3,4,6]);
 assert.ok(WAVES.every(w=>w.enemies.filter(x=>x==='zubrokryptyda').length<w.enemies.length/2));
});
test('timer layout stays inside original ribbon at landscape widths',()=>{
 for(const [w,h] of [[320,240],[568,320],[800,360]]){
  const u=arenaHudLayout(h,w);
  assert.ok(u.timerX>=u.weaponX+u.tokenSize/2-10);
  assert.ok(u.timerX+70<u.portraitX-u.portraitSize/2);
  assert.ok(u.timerY>=u.panelY&&u.timerY+u.timerFont/2<u.panelY+u.panelHeight);
 }
});

test('PR48 finite encounter roster and irreversible boss death',()=>{
 assert.equal(REINFORCEMENTS.length,12);
 assert.equal(REINFORCEMENTS.filter(x=>x.type==='bobrozombi').length,8);
 assert.equal(REINFORCEMENTS.filter(x=>x.type==='bocianolak').length,4);
 assert.equal(new Set(REINFORCEMENTS.map(x=>x.id)).size,12);
 assert.equal(BOSS_NON_MARCIN_CAP,7);
 const e=createEpisode();e.wave=5;
 assert.equal(beginBossResolution(e),false);
 assert.equal(recordSpecialSpawn(e,'marcin'),true);
 assert.equal(recordReinforcementSpawn(e,REINFORCEMENTS[0].id),true);
 assert.equal(recordReinforcementSpawn(e,REINFORCEMENTS[0].id),false);
 assert.equal(beginBossResolution(e),true);
 assert.equal(beginBossResolution(e),false);
 assert.equal(recordReinforcementSpawn(e,REINFORCEMENTS[1].id),false);
 assert.equal(nextType(e),null);
 assert.equal(finishBossResolution(e),true);
 assert.equal(finishBossResolution(e),false);
 assert.equal(terminateEpisode(e,'victory'),true);
});
