import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirector,directorPopulation,directorOpportunity,nextDirectorType,recordDirectorSpawn,PROFILES,PREBOSS_STOP_MS} from '../src/encounter-director.js';
import {createEpisode,advanceTimedWaves,recordSpawn,recordDeath,BOSS_INTRO_MS,claimBossIntroduction,recordSpecialSpawn,beginBossResolution,finishBossResolution,REINFORCEMENTS,BOSS_NON_MARCIN_CAP} from '../src/episode.js';
const p=(living=0,visible=0,nearby=0)=>({living,visible,nearby,heavy:false});
test('PR51 profiles and fixed active-time transitions',()=>{
 assert.deepEqual(PROFILES.map(x=>[x.target,x.cap]),[[4,6],[5,7],[6,8],[7,9],[7,9],[8,10]]);
 const e=createEpisode(41);
 assert.deepEqual(advanceTimedWaves(e,34999),[]);
 for(const [i,ms] of [35000,75000,120000,170000,225000].entries())assert.deepEqual(advanceTimedWaves(e,ms),[i+1]);
 assert.equal(claimBossIntroduction(e,259999),false);
 assert.equal(claimBossIntroduction(e,BOSS_INTRO_MS),true);
 assert.equal(claimBossIntroduction(e,BOSS_INTRO_MS),false);
});
test('continuous opportunities recover after kills and never accumulate pause debt',()=>{
 const d=createDirector(41);let count=0;
 for(let t=0;t<34000;t+=600){const o=directorOpportunity(d,{elapsedMs:t,wave:0,population:p()});if(o.spawn){recordDirectorSpawn(d,0,'bobrozombi');count++;}}
 assert.ok(count>15);
 const before=d.ordinal;assert.equal(directorOpportunity(d,{elapsedMs:100000,wave:0,population:p(),active:false}).due,false);
 assert.equal(d.ordinal,before);
 const jump=directorOpportunity(d,{elapsedMs:100000,wave:0,population:p()});assert.equal(jump.due,true);
 assert.ok(d.nextMs>100000);assert.equal(d.ordinal,before+1);
});
test('hard caps, soft targets and low-pressure recovery',()=>{
 const d=createDirector(1);
 assert.equal(directorOpportunity(d,{elapsedMs:0,wave:0,population:p(6)}).spawn,false);
 const o=directorOpportunity(d,{elapsedMs:d.nextMs,wave:0,population:p(4,1,1)});assert.equal(o.spawn,false);
 const low=directorOpportunity(d,{elapsedMs:d.nextMs,wave:0,population:p(4,0,0)});assert.equal(low.spawn,true);
 const stop=directorOpportunity(d,{elapsedMs:PREBOSS_STOP_MS,wave:5,population:p()});assert.equal(stop.spawn,false);
});
test('weighted-deficit selection and replay: no ordinary heavy streaks',()=>{
 const runs=[];
 for(const seed of [1,41,104729]){
  const d=createDirector(seed),types=[];
  for(let i=0;i<100;i++){
   const type=nextDirectorType(d,5);types.push(type);recordDirectorSpawn(d,5,type);d.ordinal++;
  }
  const counts=['bobrozombi','bocianolak','zubrokryptyda'].map(t=>types.filter(x=>x===t).length);
  assert.deepEqual(counts,[35,45,20]);
  const replay=createDirector(seed);
  assert.deepEqual(types,Array.from({length:100},()=>{const t=nextDirectorType(replay,5);recordDirectorSpawn(replay,5,t);replay.ordinal++;return t;}));
  runs.push(types.join(','));
 }
 assert.equal(new Set(runs).size>=1,true);
});
test('camera and near-player threat exclude distant living entities without lifting population cap',()=>{
 const enemies=[{type:'bobrozombi',x:900,y:900,hp:1,dead:false},{type:'zubrokryptyda',x:10,y:10,hp:2,dead:false}];
 const c=directorPopulation(enemies,{x:0,y:0,width:320,height:240},{x:160,y:120});
 assert.deepEqual([c.living,c.visible,c.nearby,c.heavy],[2,1,1,true]);
 assert.equal(directorOpportunity(createDirector(1),{elapsedMs:0,wave:0,population:p(6,0,0)}).spawn,false);
});
test('boss finite fourteen additions and true terminal state remain separate',()=>{
 const e=createEpisode();advanceTimedWaves(e,260000);assert.equal(claimBossIntroduction(e),true);
 assert.equal(REINFORCEMENTS.length,12);assert.equal(BOSS_NON_MARCIN_CAP,7);
 assert.equal(recordSpecialSpawn(e,'marcin'),true);assert.equal(beginBossResolution(e),true);
 assert.equal(finishBossResolution(e),true);assert.equal(e.state,'final-pending');
});
