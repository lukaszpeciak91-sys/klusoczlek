import test from 'node:test';
import assert from 'node:assert/strict';
import {WAVES,TOTAL_WAVES,TOTAL_ENEMIES,HEALTH_AFTER_WAVES,createEpisode,nextType,waveCapacity,recordSpawn,recordDeath,advanceEpisode,terminateEpisode,healedHp} from '../src/episode.js';
test('Episode 1 six deterministic waves and species introduction',()=>{
 assert.equal(TOTAL_WAVES,6);assert.equal(TOTAL_ENEMIES,138);
 assert.deepEqual(WAVES.map(w=>w.enemies.length),[12,16,20,25,30,35]);
 assert.deepEqual(WAVES.map(w=>w.maxAlive),[4,5,6,7,8,9]);
 assert.ok(WAVES[0].enemies.every(x=>x==='bobrozombi'));
 assert.ok(WAVES[1].enemies.includes('bocianolak'));
 assert.ok(WAVES[2].enemies.includes('zubrokryptyda'));
 assert.deepEqual(HEALTH_AFTER_WAVES,[2,4,5]);
});
test('scheduler cannot advance a wave before all spawns and kills',()=>{
 const e=createEpisode();assert.equal(nextType(e),'bobrozombi');
 for(let n=0;n<11;n++){assert.equal(recordSpawn(e),true);assert.equal(recordDeath(e,1,100),null);}
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
