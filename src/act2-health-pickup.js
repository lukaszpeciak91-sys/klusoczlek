import {insideDeck,WHEELHOUSE_FOOTPRINT,AIRSHIP_PLAYER_LOWER_MARGIN,DECK_MARGIN} from './airship-contract.js';
export const ACT2_HEALTH_SPAWN_MS=90000;
export const ACT2_HEALTH_HEAL=2;
export const ACT2_HEALTH_PICKUP_RADIUS=34;
export const ACT2_HEALTH_POINTS=Object.freeze([
 Object.freeze({x:480,y:315}),Object.freeze({x:435,y:318}),
 Object.freeze({x:525,y:318}),Object.freeze({x:390,y:300}),
 Object.freeze({x:570,y:300}),Object.freeze({x:480,y:275})
]);
export function act2HealthPoint(player){
 return ACT2_HEALTH_POINTS.find(p=>insideDeck(p,DECK_MARGIN,AIRSHIP_PLAYER_LOWER_MARGIN)&&
  Math.hypot((p.x-WHEELHOUSE_FOOTPRINT.x)/(WHEELHOUSE_FOOTPRINT.rx+26),
             (p.y-WHEELHOUSE_FOOTPRINT.y)/(WHEELHOUSE_FOOTPRINT.ry+26))>1&&
  Math.hypot(p.x-player.x,p.y-player.y)>70)??null;
}
export function shouldSpawnAct2Health(elapsedMs,spawned,active){
 return active&&!spawned&&elapsedMs>=ACT2_HEALTH_SPAWN_MS;
}
export function collectAct2Health(player,point,hp,maxHp){
 if(!point||hp>=maxHp||Math.hypot(player.x-point.x,player.y-point.y)>=ACT2_HEALTH_PICKUP_RADIUS)return null;
 return Math.min(maxHp,hp+ACT2_HEALTH_HEAL);
}
