import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVES,TOTAL_WAVES,HEALTH_AFTER_WAVES,createEpisode,nextType,waveCapacity,recordSpawn,recordDeath,advanceTimedWaves,WAVE_TIMING,terminateEpisode,healedHp,FINAL_ENCOUNTER,recordSpecialSpawn,REINFORCEMENTS,beginBossResolution,finishBossResolution,recordReinforcementSpawn,BOSS_NON_MARCIN_CAP} from '../src/episode.js';
test('six timed continuous profiles and no finite spawn exhaustion',()=>{
 assert.equal(TOTAL_WAVES,6);
 assert.deepEqual(WAVES.map(w=>[w.target,w.maxAlive]),[[4,6],[5,7],[6,8],[7,9],[7,9],[8,10]]);
 assert.deepEqual(HEALTH_AFTER_WAVES,[2,4,5]);
 const e=createEpisode(41);
 for(let n=0;n<200;n++){assert.equal(recordSpawn(e,'bobrozombi'),true);recordDeath(e,0,0);}
 assert.equal(e.wave,0);assert.deepEqual(advanceTimedWaves(e,35000),[1]);assert.equal(e.spawned,200);
 assert.deepEqual(advanceTimedWaves(e,260000),[2,3,4,5]);
 assert.equal(recordSpecialSpawn(e,'marcin'),true);assert.equal(beginBossResolution(e),true);
 assert.equal(finishBossResolution(e),true);assert.equal(terminateEpisode(e,'victory'),true);
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

test('heavy weights unlock at wave 3',()=>{assert.deepEqual(WAVES.map(w=>w.weights[2]),[0,0,10,15,15,20]);});
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
 assert.equal(BOSS_NON_MARCIN_CAP,16);
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
