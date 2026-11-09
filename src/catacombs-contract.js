import {PLAYER_RADIUS,PLAYER_SPEED,normalizeInput} from './movement.js';
import {footprintOverlap} from './obstacle-geometry.js';
import {resolveObstaclePosition} from './obstacles.js';

// Deliberately self-contained geometry: artwork will not own collision.
export const CATACOMBS=Object.freeze({
 width:960,height:640,
 playerStart:Object.freeze({x:480,y:420}),
 marianStart:Object.freeze({x:480,y:246}),
 fairyStart:Object.freeze({x:650,y:410}),
 wall:38, bossRadius:25,enemyRadius:17
});
const obstacle=(id,x,y,width,height)=>Object.freeze({
 id,x,y,alive:true,gameplayClass:'solid',
 footprint:Object.freeze({shape:'box',x,y,width,height,angle:0})
});
export const CATACOMBS_OBSTACLES=Object.freeze([
 obstacle('altar',480,312,158,76),
 obstacle('pillar-left-upper',200,210,54,54),
 obstacle('pillar-right-upper',760,210,54,54),
 obstacle('pillar-left-lower',200,438,54,54),
 obstacle('pillar-right-lower',760,438,54,54)
]);
export function catacombsWalkable(p,radius=PLAYER_RADIUS){
 if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
 if(p.x<CATACOMBS.wall+radius||p.y<CATACOMBS.wall+radius||
 p.x>CATACOMBS.width-CATACOMBS.wall-radius||
 p.y>CATACOMBS.height-CATACOMBS.wall-radius)return false;
 return CATACOMBS_OBSTACLES.every(o=>!footprintOverlap(o.footprint,p,radius));
}
export function catacombsResolve(from,to,radius=PLAYER_RADIUS){
 const p=resolveObstaclePosition(from,to,radius,CATACOMBS_OBSTACLES);
 return {x:Math.min(CATACOMBS.width-CATACOMBS.wall-radius,Math.max(CATACOMBS.wall+radius,p.x)),
 y:Math.min(CATACOMBS.height-CATACOMBS.wall-radius,Math.max(CATACOMBS.wall+radius,p.y))};
}
export function catacombsStep(from,input,delta,speed=PLAYER_SPEED,radius=PLAYER_RADIUS){
 const d=normalizeInput(input?.x??0,input?.y??0);
 const dt=Math.max(0,Math.min(50,Number.isFinite(delta)?delta:0))/1000;
 return catacombsResolve(from,{x:from.x+d.x*speed*dt,y:from.y+d.y*speed*dt},radius);
}
export const MARIAN_FINAL_ASSETS=Object.freeze({
 normal:Object.freeze({path:'npcs/captain.png',key:'npc-captain',width:1024,height:128,frameWidth:128,frameHeight:128}),
 transformed:Object.freeze({path:'enemies/marian-transformed.png',key:'act5-marian-transformed',width:2048,height:256,frameWidth:256,frameHeight:256}),
 portrait:Object.freeze({path:'dialogue/dialogue-marian-transformed.png',key:'dialogue-marian-transformed',width:192,height:192})
});
// Artwork pixels map to the existing 960×640 world at an exact 8/15 scale.
// Obstacle centers and collision footprints below are authoritative for both
// graphics and physics: artwork draws from these same immutable definitions.
export const CATACOMBS_ART=Object.freeze({
 scale:CATACOMBS.width/1800,
 background:Object.freeze({path:'backgrounds/act5-catacombs.png',key:'act5-catacombs-background',width:1800,height:1200}),
 altar:Object.freeze({path:'obstacles/act5-altar.png',key:'act5-altar',width:266,height:176}),
 column:Object.freeze({path:'obstacles/act5-column.png',key:'act5-column',width:96,height:221})
});
export const catacombsArtPlacement=o=>{
 const art=o.id==='altar'?CATACOMBS_ART.altar:CATACOMBS_ART.column;
 // Tall columns have transparent upper portions and solid bases at their feet.
 // Bottom aligned to the obstacle footprint; altar uses the same base anchor.
 const bottom=o.footprint.y+o.footprint.height/2;
 return {key:art.key,x:o.x,y:bottom,
  width:art.width*CATACOMBS_ART.scale,height:art.height*CATACOMBS_ART.scale,
  originX:.5,originY:1};
};
export const CATACOMBS_SUMMON_SITES=Object.freeze([
 Object.freeze({x:110,y:170,type:'bobrozombi'}),
 Object.freeze({x:850,y:170,type:'bocianolak'}),
 Object.freeze({x:128,y:515,type:'zubrokryptyda'}),
 Object.freeze({x:830,y:515,type:'bobrozombi'})
]);
