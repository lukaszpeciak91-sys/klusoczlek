import test from 'node:test';
import assert from 'node:assert/strict';
import * as ep from '../src/episode.js';
import {createGameplayClock,advanceGameplayClock} from '../src/gameplay-clock.js';
import {introductionSpawnPoint,introductionVisible} from '../src/intro-visibility.js';
const count=xs=>Object.fromEntries(['bobrozombi','bocianolak','zubrokryptyda'].map(t=>[t,xs.filter(x=>x===t).length]));
test('PR49 prompt safe introductions use available568px edges without reducing220px distance',()=>{
 for(const type of ['bocianolak','zubrokryptyda']){
  const view={x:616,y:440,width:568,height:320},p=introductionSpawnPoint(type,{x:900,y:600},[],view,30);
  assert.ok(p&&introductionVisible(type,p.x,p.y,view));assert.ok(Math.hypot(p.x-900,p.y-600)>=220);
 }
});
test('PR49 authoritative immutable active-time boundaries and timed boss, no old kill gate',()=>{
 assert.deepEqual(ep.WAVE_TIMING.map(w=>w.startMs),[0,35000,75000,120000,170000,225000]);
 assert.equal(ep.BOSS_INTRO_MS,260000);assert.ok(Object.isFrozen(ep.WAVE_TIMING));assert.ok(ep.WAVE_TIMING.every(Object.isFrozen));
 for(let i=1;i<6;i++){const e=ep.createEpisode(1);ep.advanceTimedWaves(e,ep.WAVE_TIMING[i].startMs-1);assert.equal(e.wave,i-1);assert.deepEqual(ep.advanceTimedWaves(e,ep.WAVE_TIMING[i].startMs),[i]);assert.equal(e.wave,i);assert.deepEqual(ep.advanceTimedWaves(e,ep.WAVE_TIMING[i].startMs),[]);}
 const e=ep.createEpisode(41);ep.advanceTimedWaves(e,225000);e.defeated=35;
 assert.equal(ep.claimBossIntroduction(e,259999),false);assert.equal(ep.claimBossIntroduction(e,260000),true);assert.equal(ep.claimBossIntroduction(e,999999),false);
});
test('PR51 large jumps cross each timed reward boundary once without deleting survivors',()=>{
 const e=ep.createEpisode(1);for(let i=0;i<3;i++)ep.recordSpawn(e,'bobrozombi');
 assert.deepEqual(ep.advanceTimedWaves(e,225000),[1,2,3,4,5]);
 assert.equal(e.spawned,3);assert.equal(e.wave,5);
 assert.deepEqual(ep.advanceTimedWaves(e,999999),[]);
});
test('PR51 kills never advance waves and retain their origin',()=>{
 const e=ep.createEpisode(1);
 ep.recordSpawn(e,'bobrozombi');ep.recordDeath(e,0,999999);
 assert.equal(e.wave,0);assert.equal(e.defeated,1);
 ep.advanceTimedWaves(e,35000);
 ep.recordSpawn(e,'bocianolak');ep.recordDeath(e,0,0,null,1);
 assert.equal(e.defeatedByWave[1],1);
 ep.advanceTimedWaves(e,260000);ep.recordSpecialSpawn(e,'marcin');
 assert.equal(ep.beginBossResolution(e),true);assert.equal(ep.nextType(e),null);
});
test('PR49 sole gameplay clock excludes pauses/dialogues; NEW GAME resets independent schedule state',()=>{
 const c=createGameplayClock(),e=ep.createEpisode(1);advanceGameplayClock(c,0,true);advanceGameplayClock(c,34999,true);assert.deepEqual(ep.advanceTimedWaves(e,c.elapsedMs),[]);
 advanceGameplayClock(c,0,false);advanceGameplayClock(c,999999,true);assert.equal(c.elapsedMs,34999);advanceGameplayClock(c,1000000,true);assert.deepEqual(ep.advanceTimedWaves(e,c.elapsedMs),[1]);
 const fresh=ep.createEpisode(1);assert.equal(fresh.wave,0);assert.equal(fresh.spawned,0);assert.equal(fresh.defeated,0);
});
