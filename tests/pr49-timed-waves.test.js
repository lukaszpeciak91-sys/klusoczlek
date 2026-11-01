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
test('PR49 large jump discards old unspawned budgets once, yields exactly-once reward boundaries',()=>{
 const e=ep.createEpisode(1);for(let i=0;i<3;i++)ep.recordSpawn(e);
 assert.deepEqual(ep.advanceTimedWaves(e,225000),[1,2,3,4,5]);assert.equal(e.wave,5);assert.equal(e.spawned,0);
 assert.deepEqual(e.cancelledByWave,[9,16,20,25,30,0]);assert.equal(e.spawnQueue.length,35);assert.equal(e.state,'active');
 assert.deepEqual(ep.advanceTimedWaves(e,999999),[]);assert.equal(e.wave,5);
 assert.equal(e.spawnedByWave.reduce((a,b)=>a+b,0)+e.cancelledByWave.reduce((a,b)=>a+b,0)+e.spawnQueue.length,138);
});
test('PR49 kills do not advance waves; survivor deaths retain origin wave and terminal cancels future work',()=>{
 const e=ep.createEpisode(1);for(let i=0;i<12;i++){ep.recordSpawn(e);assert.equal(ep.recordDeath(e,0,999999),null);}assert.equal(e.wave,0);assert.equal(e.state,'active');
 ep.advanceTimedWaves(e,35000);ep.recordSpawn(e);ep.advanceTimedWaves(e,75000);
 ep.recordDeath(e,0,0,null,1);assert.equal(e.defeatedByWave[1],1);assert.equal(e.defeatedByWave[2],0);
 ep.advanceTimedWaves(e,260000);ep.recordSpecialSpawn(e,'marcin');assert.equal(ep.beginBossResolution(e),true);assert.equal(ep.nextType(e),null);assert.equal(e.spawnQueue.length,0);assert.deepEqual(ep.advanceTimedWaves(e,999999),[]);assert.ok(ep.finishBossResolution(e));assert.ok(ep.terminateEpisode(e,'victory'));
});
test('PR49 seeded bounded mix preserves every species budget and spreads heavies',()=>{
 const signatures=new Set();
 for(const seed of [0,1,2,3,4,41,104729,0xffffffff]){
  const orders=ep.WAVES.map((_,wave)=>ep.mixedWaveOrder(seed,wave));
  assert.deepEqual(orders,ep.WAVES.map((_,wave)=>ep.mixedWaveOrder(seed,wave)));signatures.add(JSON.stringify(orders));
  orders.forEach((order,w)=>{
   assert.deepEqual(count(order),count(ep.WAVES[w].enemies));
   const left=count(order);for(let i=0;i<order.length;i++){
    if(i>=2&&order[i]===order[i-1]&&order[i]===order[i-2])assert.ok(Object.entries(left).every(([t,n])=>t===order[i]||n===0),'unnecessary species block');
    left[order[i]]--;
   }
   if(w>=3){const heavy=order.flatMap((t,i)=>t==='zubrokryptyda'?[i]:[]);assert.ok(heavy[0]<order.length/3);assert.ok(heavy.at(-1)>=order.length*2/3);}
  });
  assert.equal(orders[1][0],'bocianolak');assert.equal(orders[2][0],'zubrokryptyda');
 }
 assert.ok(signatures.size>=6);assert.equal(ep.TOTAL_ENEMIES,153);
});
test('PR49 introduction priority uses current budget; blocked heavy cannot starve mixed common spawns',()=>{
 const e=ep.createEpisode(41);ep.advanceTimedWaves(e,120000);
 assert.equal(ep.nextType(e,{priorityTypes:['bocianolak','zubrokryptyda']}),'bocianolak');
 const next=ep.nextType(e,{blockedTypes:['zubrokryptyda'],priorityTypes:['zubrokryptyda']});assert.notEqual(next,'zubrokryptyda');
 const heavy=e.spawnQueue.filter(t=>t==='zubrokryptyda').length;assert.ok(ep.recordSpawn(e,next));assert.equal(e.spawnQueue.filter(t=>t==='zubrokryptyda').length,heavy);
 assert.equal(ep.recordSpawn(e,'marcin'),false);
});
test('PR49 sole gameplay clock excludes pauses/dialogues; NEW GAME resets independent schedule state',()=>{
 const c=createGameplayClock(),e=ep.createEpisode(1);advanceGameplayClock(c,0,true);advanceGameplayClock(c,34999,true);assert.deepEqual(ep.advanceTimedWaves(e,c.elapsedMs),[]);
 advanceGameplayClock(c,0,false);advanceGameplayClock(c,999999,true);assert.equal(c.elapsedMs,34999);advanceGameplayClock(c,1000000,true);assert.deepEqual(ep.advanceTimedWaves(e,c.elapsedMs),[1]);
 const fresh=ep.createEpisode(1);assert.equal(fresh.wave,0);assert.deepEqual(fresh.cancelledByWave,[0,0,0,0,0,0]);assert.deepEqual(fresh.waveOrders,e.waveOrders);assert.notEqual(fresh.spawnQueue,e.spawnQueue);
});
