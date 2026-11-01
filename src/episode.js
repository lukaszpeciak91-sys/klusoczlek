import {seededRandom} from './arena-layout.js';
// Immutable budgets; per-session bounded mixing uses an independent RNG instance.
const b='bobrozombi',s='bocianolak',h='zubrokryptyda';
const repeated=(type,n)=>Array(n).fill(type);
export const WAVES=Object.freeze([
 {enemies:repeated(b,12),maxAlive:4},
 {enemies:[...repeated(b,11),...repeated(s,5)],maxAlive:5},
 {enemies:[...repeated(b,11),...repeated(s,8),h],maxAlive:6},
 {enemies:[...repeated(b,11),...repeated(s,11),...repeated(h,3)],maxAlive:7},
 {enemies:[...repeated(b,12),...repeated(s,14),...repeated(h,4)],maxAlive:8},
 {enemies:[...repeated(b,12),...repeated(s,17),...repeated(h,6)],maxAlive:9},
].map((wave,index)=>Object.freeze({index:index+1,enemies:Object.freeze(wave.enemies),maxAlive:wave.maxAlive})));
export const TOTAL_WAVES=WAVES.length;
export const NORMAL_ENEMIES=WAVES.reduce((n,w)=>n+w.enemies.length,0);
export const WAVE_TIMING=Object.freeze([35000,40000,45000,50000,55000,Infinity].map((durationMs,index,durations)=>Object.freeze({startMs:durations.slice(0,index).reduce((a,b)=>a+b,0),durationMs})));
export const BOSS_INTRO_MS=260000;
export function mixedWaveOrder(seed,wave){
 const budget=WAVES[wave].enemies,random=seededRandom((seed^0x49c0ffee^Math.imul(wave+1,0x9e3779b9))>>>0);
 const heavy=budget.filter(t=>t===h).length,slots=new Set();
 for(let i=0;i<heavy;i++)slots.add(wave===2?0:Math.max(0,Math.min(budget.length-1,Math.floor((i+.5)*budget.length/heavy)+Math.floor(random()*3)-1)));
 const total={[b]:budget.filter(t=>t===b).length,[s]:budget.filter(t=>t===s).length},used={[b]:0,[s]:0},out=[];
 for(let i=0;i<budget.length;i++){
  if(slots.has(i)){out.push(h);continue;}
  let available=[b,s].filter(t=>used[t]<total[t]);
  if(available.length>1&&out.at(-1)===out.at(-2))available=available.filter(t=>t!==out.at(-1));
  let type;
  if(wave===1&&i===0)type=s;
  else {
   const step=used[b]+used[s]+1,sum=total[b]+total[s];
   type=available.map(t=>({t,score:step*total[t]/sum-used[t]+random()*.45})).sort((a,b)=>b.score-a.score)[0].t;
  }
  used[type]++;out.push(type);
 }
 return Object.freeze(out);
}
export const FINAL_ENCOUNTER=Object.freeze([
 {id:'marcin',type:'marcin'}, {id:'escort-1',type:'zubrokryptyda'}, {id:'escort-2',type:'zubrokryptyda'}
].map(Object.freeze));
export const REINFORCEMENTS=Object.freeze([
 ...Array.from({length:8},(_,i)=>Object.freeze({id:'reinforcement-b-'+(i+1),type:'bobrozombi'})),
 ...Array.from({length:4},(_,i)=>Object.freeze({id:'reinforcement-s-'+(i+1),type:'bocianolak'}))
]);
export const BOSS_NON_MARCIN_CAP=7;
export const TOTAL_ENEMIES=NORMAL_ENEMIES+FINAL_ENCOUNTER.length+REINFORCEMENTS.length;
export function beginBossResolution(episode){
 if(episode.state!=='active'||!episode.specialSpawned.has('marcin')||episode.specialDefeated.has('marcin'))return false;
 episode.specialDefeated.add('marcin');episode.state='boss-resolving';
 episode.cancelledByWave[episode.wave]+=episode.spawnQueue.length;episode.spawnQueue.length=0;return true;
}
export function finishBossResolution(episode){
 if(episode.state!=='boss-resolving')return false;
 episode.state='final-pending';return true;
}
export function remainingNormalEnemies(episode){return Math.max(0,episode.spawned-episode.defeated)+episode.spawnQueue.length;}
export function claimBossIntroduction(episode,elapsedMs=episode.elapsedMs){
 if(episode.state!=='active'||episode.wave!==TOTAL_WAVES-1||episode.bossIntroduced||!Number.isFinite(elapsedMs)||elapsedMs<BOSS_INTRO_MS)return false;
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
 const waveOrders=Object.freeze(WAVES.map((_,wave)=>mixedWaveOrder(seed,wave)));
 return {wave:0,spawned:0,defeated:0,state:'active',elapsedMs:0,ended:false,bossIntroduced:false,waveOrders,spawnQueue:[...waveOrders[0]],spawnedByWave:Array(TOTAL_WAVES).fill(0),defeatedByWave:Array(TOTAL_WAVES).fill(0),cancelledByWave:Array(TOTAL_WAVES).fill(0),specialSpawned:new Set(),specialDefeated:new Set(),reinforcementSpawned:new Set()};
}
export function nextType(episode,{blockedTypes=[],priorityTypes=[]}={}){
 if(episode.state!=='active')return null;
 const eligible=t=>!blockedTypes.includes(t)&&episode.spawnQueue.includes(t);
 return priorityTypes.find(eligible)??episode.spawnQueue.find(t=>!blockedTypes.includes(t))??null;
}
export function waveCapacity(episode){return WAVES[episode.wave]?.maxAlive??0;}
export function recordSpawn(episode,type=nextType(episode)){
 const index=episode.spawnQueue.indexOf(type);
 if(episode.state!=='active'||index<0)return false;
 episode.spawnQueue.splice(index,1);episode.spawned++;episode.spawnedByWave[episode.wave]++;return true;
}
export function recordDeath(episode,alive,now,specialId=null,originWave=episode.wave){
 if(episode.state!=='active')return null;
 if(specialId!==null){
  if(!episode.specialSpawned.has(specialId)||episode.specialDefeated.has(specialId))return null;
  episode.specialDefeated.add(specialId);
 }else {episode.defeatedByWave[originWave]++;episode.defeated=episode.defeatedByWave[episode.wave];}
 return null; // Deaths free capacity; only active time advances waves.
}
export function advanceTimedWaves(episode,elapsedMs){
 const crossed=[];
 if(episode.state!=='active'||!Number.isFinite(elapsedMs)||elapsedMs<0)return crossed;
 episode.elapsedMs=Math.max(episode.elapsedMs,elapsedMs);
 while(episode.wave<TOTAL_WAVES-1&&episode.elapsedMs>=WAVE_TIMING[episode.wave+1].startMs){
  episode.cancelledByWave[episode.wave]+=episode.spawnQueue.length;crossed.push(episode.wave+1);
  episode.wave++;episode.spawned=episode.spawnedByWave[episode.wave];episode.defeated=episode.defeatedByWave[episode.wave];episode.spawnQueue=[...episode.waveOrders[episode.wave]];
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
