// Deterministic episode 1 encounter. No runtime random wave generation.
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
 episode.specialDefeated.add('marcin');episode.state='boss-resolving';episode.intermissionUntil=null;return true;
}
export function finishBossResolution(episode){
 if(episode.state!=='boss-resolving')return false;
 episode.state='final-pending';return true;
}
export function remainingNormalEnemies(episode){return WAVES[episode.wave].enemies.length-episode.defeated;}
export function claimBossIntroduction(episode){
 if(episode.state!=='active'||episode.wave!==TOTAL_WAVES-1||episode.bossIntroduced||remainingNormalEnemies(episode)>6)return false;
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
export const INTERMISSION_MS=3000;
export const HEALTH_AFTER_WAVES=Object.freeze([2,4,5]);
export function createEpisode(){return {wave:0,spawned:0,defeated:0,state:'active',intermissionUntil:null,ended:false,bossIntroduced:false,specialSpawned:new Set(),specialDefeated:new Set(),reinforcementSpawned:new Set()};}
export function nextType(episode){return episode.state==='active'?WAVES[episode.wave].enemies[episode.spawned]??null:null;}
export function waveCapacity(episode){return WAVES[episode.wave]?.maxAlive??0;}
export function recordSpawn(episode){if(!nextType(episode))return false;episode.spawned++;return true;}
export function recordDeath(episode,alive,now,specialId=null){
 if(episode.state!=='active')return null;
 if(specialId!==null){
  if(!episode.specialSpawned.has(specialId)||episode.specialDefeated.has(specialId))return null;
  episode.specialDefeated.add(specialId);
 }else episode.defeated++;
 const wave=WAVES[episode.wave];
 if(episode.spawned!==wave.enemies.length||episode.defeated!==wave.enemies.length||alive!==0)return null;
 if(episode.wave===WAVES.length-1){
  return null; // Boss death is the only authoritative finale gate.
  // Not reached: boss victory is governed by beginBossResolution.
 }
 episode.state='intermission';episode.intermissionUntil=now+INTERMISSION_MS;
 return 'wave-cleared';
}
export function advanceEpisode(episode,now){
 if(episode.state!=='intermission'||now<episode.intermissionUntil)return false;
 episode.wave++;episode.spawned=0;episode.defeated=0;episode.intermissionUntil=null;episode.state='active';
 return true;
}
export function terminateEpisode(episode,outcome){
 if(episode.state==='victory'||episode.state==='defeat')return false;
 if(outcome==='defeat')episode.state='defeat';
 else if(outcome==='victory'&&episode.state==='final-pending')episode.state='victory';
 else return false;
 episode.intermissionUntil=null;episode.ended=true;return true;
}
export function healedHp(hp,max=5){return Math.min(max,hp+2);}
