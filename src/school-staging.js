// Act IV spatial staging. Plain data and the approved School collision contract;
// no new AI, damage rules, artwork, or independent combat population.
import {SCHOOL_PLACES,schoolWalkable} from './school-contract.js';
import {ENCOUNTER} from './bobrozombi.js';
import {ENEMY_TYPES} from './enemy-types.js';
import {healOneHp,canCollectBogdanHeart} from './volcano-heart.js';

export const MACIEK_SEBA_RADIUS=150;
export const PITCH_ENCOUNTER_RADIUS=245;
export const SCHOOL_WAVE2_END_MS=75000; // 35 s + 40 s
export const SCHOOL_HEART_HEAL=2; // Approved Act III pre-boss heart recovery.
export const SCHOOL_HEART_POINTS=Object.freeze({
 wave2:Object.freeze({x:930,y:1015}),
 wave4:Object.freeze({x:1035,y:1050}),
});
export const SCHOOL_ENTOURAGE=Object.freeze([
 Object.freeze({type:'bobrozombi',x:1365,y:945}),
 Object.freeze({type:'bocianolak',x:1280,y:1010}),
 Object.freeze({type:'zubrokryptyda',x:1450,y:960}),
]);
export const maciekSebaNearby=player=>player&&
 Math.hypot(player.x-SCHOOL_PLACES.maciek.x,player.y-SCHOOL_PLACES.maciek.y)<=MACIEK_SEBA_RADIUS;
export const pitchNearby=player=>player&&
 Math.hypot(player.x-SCHOOL_PLACES.pitchApproach.x,player.y-SCHOOL_PLACES.pitchApproach.y)<=PITCH_ENCOUNTER_RADIUS;
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
