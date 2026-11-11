// Act IV spatial staging. Plain data and the approved School collision contract;
// no new AI, damage rules, artwork, or independent combat population.
import {SCHOOL_PLACES,schoolWalkable} from './school-contract.js';
import {ENCOUNTER} from './bobrozombi.js';
import {ENEMY_TYPES} from './enemy-types.js';
import {BLAZEJ_START} from './school-finale.js';
import {healOneHp,canCollectBogdanHeart} from './volcano-heart.js';

export const MACIEK_SEBA_RADIUS=280;
export const PITCH_ENCOUNTER_RADIUS=130;
export const SCHOOL_WAVE2_END_MS=75000; // 35 s + 40 s
export const SCHOOL_HEART_HEAL=2; // Approved Act III pre-boss heart recovery.
export const SCHOOL_HEART_POINTS=Object.freeze({
 wave2:Object.freeze({x:930,y:1015}),
 wave4:Object.freeze({x:1035,y:1050}),
});
export const SCHOOL_ENTOURAGE=Object.freeze([
 Object.freeze({type:'bobrozombi',x:1220,y:785}),
 Object.freeze({type:'bocianolak',x:1430,y:720}),
 Object.freeze({type:'zubrokryptyda',x:1320,y:900}),
]);
// All placements feed the single School wave director, never an extra timer.
// Two consecutive later opportunities occasionally choose quiet outdoor areas.
export const SCHOOL_SPAWN_PITCH=Object.freeze([
 Object.freeze({x:1140,y:990}),Object.freeze({x:1340,y:1050}),
 Object.freeze({x:1590,y:980}),Object.freeze({x:1490,y:1080}),
 Object.freeze({x:1370,y:680}),Object.freeze({x:1060,y:690}),
 Object.freeze({x:1690,y:945}),
]);
export const SCHOOL_SPAWN_REMOTE=Object.freeze([
 Object.freeze({x:600,y:900}),Object.freeze({x:450,y:550}),
 Object.freeze({x:850,y:450}),Object.freeze({x:1600,y:1110}),
]);
export function schoolDirectorSpawnSites(spawnIndex){
 const remote=spawnIndex%11===8||spawnIndex%11===9;
 const sites=remote?SCHOOL_SPAWN_REMOTE:SCHOOL_SPAWN_PITCH;
 const first=spawnIndex%sites.length;
 return [...sites.slice(first),...sites.slice(0,first)];
}
export const maciekSebaNearby=player=>player&&
 Math.hypot(player.x-SCHOOL_PLACES.maciek.x,player.y-SCHOOL_PLACES.maciek.y)<=MACIEK_SEBA_RADIUS;
export const pitchNearby=(player,boss=BLAZEJ_START)=>!!player&&!!boss&&
 Math.hypot(player.x-boss.x,player.y-boss.y)<=PITCH_ENCOUNTER_RADIUS;
export function schoolEntouragePoint(point,player,occupied=[]){
 const r=ENEMY_TYPES[point.type]?.radius;
 return Number.isFinite(r)&&schoolWalkable(point,r+4)&&
  Math.hypot(point.x-player.x,point.y-player.y)>=ENCOUNTER.minSpawnDistance&&
  occupied.every(e=>Math.hypot(point.x-e.x,point.y-e.y)>=r+ENEMY_TYPES[e.type].radius+12);
}
export function canSpawnSchoolHeart(id,spawned){
 const point=SCHOOL_HEART_POINTS[id];
 return !!point&&!spawned&&schoolWalkable(point,25);
}
export function collectSchoolHeart(player,point,hp,maxHp,collected=false){
 if(collected||hp>=maxHp||!canCollectBogdanHeart(player,point,false))return null;
 let recovered=hp;
 for(let i=0;i<SCHOOL_HEART_HEAL;i++)recovered=healOneHp(recovered,maxHp);
 return recovered;
}
