import {PROFILES,TYPES} from './encounter-director.js';
export const WAVES=Object.freeze(PROFILES.map((p,i)=>Object.freeze({index:i+1,target:p.target,maxAlive:p.cap,weights:p.weights})));
export const TOTAL_WAVES=WAVES.length;
export const WAVE_TIMING=Object.freeze([35000,40000,45000,50000,55000,Infinity].map((durationMs,index,durations)=>Object.freeze({startMs:durations.slice(0,index).reduce((a,b)=>a+b,0),durationMs})));
export const BOSS_INTRO_MS=260000;
export const EARLY_BOSS_MS=240000;
export const BOSS_ALLY_TARGET=12;
export const BOSS_SCENE_HARD_CAP=16;
export function allyShortfall(survivors,target=BOSS_ALLY_TARGET){return Math.max(0,target-Math.max(0,Math.floor(survivors)));}
export const FINAL_ENCOUNTER=Object.freeze([
 {id:'marcin',type:'marcin'}, {id:'escort-1',type:'zubrokryptyda'}, {id:'escort-2',type:'zubrokryptyda'}
].map(Object.freeze));
export const REINFORCEMENTS=Object.freeze([
 ...Array.from({length:8},(_,i)=>Object.freeze({id:'reinforcement-b-'+(i+1),type:'bobrozombi'})),
 ...Array.from({length:4},(_,i)=>Object.freeze({id:'reinforcement-s-'+(i+1),type:'bocianolak'}))
]);
export const BOSS_NON_MARCIN_CAP=7;
// Only the fourteen special non-Marcin actors and Marcin form a finite roster.
export function beginBossResolution(episode){
 if(episode.state!=='active'||!episode.specialSpawned.has('marcin')||episode.specialDefeated.has('marcin'))return false;
 episode.specialDefeated.add('marcin');episode.state='boss-resolving';
 return true;
}
export function finishBossResolution(episode){
 if(episode.state!=='boss-resolving')return false;
 episode.state='final-pending';return true;
}
export function remainingNormalEnemies(episode){return Math.max(0,episode.spawned-episode.defeated);}
export function claimBossIntroduction(episode,elapsedMs=episode.elapsedMs,{ordinaryAlive=Infinity,narrativePending=false}={}){
 if(episode.state!=='active'||episode.wave!==TOTAL_WAVES-1||episode.bossIntroduced||!Number.isFinite(elapsedMs))return false;
 if(elapsedMs<BOSS_INTRO_MS&&(elapsedMs<EARLY_BOSS_MS||ordinaryAlive!==0||narrativePending))return false;
 episode.bossIntroduced=true;return true;
}
export function recordReinforcementSpawn(episode,id){
 if(episode.state!=='active'||!episode.specialSpawned.has('marcin')||episode.reinforcementSpawned.has(id)||!REINFORCEMENTS.some(s=>s.id===id))return false;
 episode.reinforcementSpawned.add(id);return true;
}
export function recordSpecialSpawn(episode,id){
 if(episode.wave!==TOTAL_WAVES-1||episode.state!=='active'||!FINAL_ENCOUNTER.some(e=>e.id===id)||episode.specialSpawned.has(id))return false;
 episode.specialSpawned.add(id);return true;
}
export const HEALTH_AFTER_WAVES=Object.freeze([2,4,5]);
export function createEpisode(seed=0){
 return {seed,wave:0,spawned:0,defeated:0,state:'active',elapsedMs:0,ended:false,bossIntroduced:false,spawnedByWave:Array(TOTAL_WAVES).fill(0),defeatedByWave:Array(TOTAL_WAVES).fill(0),specialSpawned:new Set(),specialDefeated:new Set(),reinforcementSpawned:new Set()};
}
export function nextType(episode,{blockedTypes=[]}={}){
 if(episode.state!=='active'||episode.bossIntroduced)return null;
 return TYPES.find((t,i)=>WAVES[episode.wave].weights[i]>0&&!blockedTypes.includes(t))??null;
}
export function waveCapacity(episode){return WAVES[episode.wave]?.maxAlive??0;}
export function recordSpawn(episode,type){
 if(episode.state!=='active'||!TYPES.includes(type))return false;
 episode.spawned++;episode.spawnedByWave[episode.wave]++;return true;
}
export function recordDeath(episode,alive,now,specialId=null,originWave=episode.wave){
 if(episode.state!=='active')return null;
 if(specialId!==null){
  if(!episode.specialSpawned.has(specialId)||episode.specialDefeated.has(specialId))return null;
  episode.specialDefeated.add(specialId);
 }else if(originWave>=0&&originWave<TOTAL_WAVES){
  episode.defeatedByWave[originWave]++;episode.defeated++;
 }
 return null;
}
export function advanceTimedWaves(episode,elapsedMs){
 const crossed=[];
 if(episode.state!=='active'||!Number.isFinite(elapsedMs)||elapsedMs<0)return crossed;
 episode.elapsedMs=Math.max(episode.elapsedMs,elapsedMs);
 while(episode.wave<TOTAL_WAVES-1&&episode.elapsedMs>=WAVE_TIMING[episode.wave+1].startMs){
  crossed.push(++episode.wave);
 }
 return crossed;
}
export function terminateEpisode(episode,outcome){
 if(episode.state==='victory'||episode.state==='defeat')return false;
 if(outcome==='defeat')episode.state='defeat';
 else if(outcome==='victory'&&episode.state==='final-pending')episode.state='victory';
 else return false;
 episode.ended=true;return true;
}
export function healedHp(hp,max=5){return Math.min(max,hp+2);}
