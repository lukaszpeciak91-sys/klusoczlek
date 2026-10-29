// Deterministic episode 1 encounter. No runtime random wave generation.
const b='bobrozombi',s='bocianolak',h='zubrokryptyda';
const repeated=(type,n)=>Array(n).fill(type);
export const WAVES=Object.freeze([
 {enemies:repeated(b,8),maxAlive:3},
 {enemies:[...repeated(b,7),...repeated(s,3)],maxAlive:3},
 {enemies:[...repeated(b,6),...repeated(s,5),h],maxAlive:4},
 {enemies:[...repeated(b,5),...repeated(s,5),...repeated(h,2)],maxAlive:4},
 {enemies:[...repeated(b,5),...repeated(s,5),...repeated(h,2)],maxAlive:4},
 {enemies:[...repeated(b,4),...repeated(s,5),...repeated(h,3)],maxAlive:5},
].map((wave,index)=>Object.freeze({index:index+1,enemies:Object.freeze(wave.enemies),maxAlive:wave.maxAlive})));
export const TOTAL_WAVES=WAVES.length;
export const TOTAL_ENEMIES=WAVES.reduce((n,w)=>n+w.enemies.length,0);
export const INTERMISSION_MS=3000;
export const HEALTH_AFTER_WAVES=Object.freeze([2,4,5]);
export function createEpisode(){return {wave:0,spawned:0,defeated:0,state:'active',intermissionUntil:null,ended:false};}
export function nextType(episode){return episode.state==='active'?WAVES[episode.wave].enemies[episode.spawned]??null:null;}
export function waveCapacity(episode){return WAVES[episode.wave]?.maxAlive??0;}
export function recordSpawn(episode){if(!nextType(episode))return false;episode.spawned++;return true;}
export function recordDeath(episode,alive,now){
 if(episode.state!=='active')return null;
 episode.defeated++;
 const wave=WAVES[episode.wave];
 if(episode.spawned!==wave.enemies.length||episode.defeated!==wave.enemies.length||alive!==0)return null;
 if(episode.wave===WAVES.length-1){episode.state='final-pending';return 'final-cleared';}
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
