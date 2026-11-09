import {PLAYER_RADIUS,PLAYER_SPEED,normalizeInput} from './movement.js';
import {footprintOverlap} from './obstacle-geometry.js';
import {resolveObstaclePosition} from './obstacles.js';

// Deliberately self-contained geometry: artwork will not own collision.
export const CATACOMBS=Object.freeze({
 width:960,height:640,
 playerStart:Object.freeze({x:480,y:530}),
 marianStart:Object.freeze({x:480,y:158}),
 fairyStart:Object.freeze({x:480,y:160}),
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
 transformed:Object.freeze({path:'enemies/marian-transformed.png',key:'act5-marian-transformed',width:1024,height:160,frameWidth:128,frameHeight:160}),
 portrait:Object.freeze({path:'dialogue/dialogue-marian-transformed.png',key:'dialogue-marian-transformed',width:192,height:192})
});
export const CATACOMBS_SUMMON_SITES=Object.freeze([
 Object.freeze({x:110,y:170,type:'bobrozombi'}),
 Object.freeze({x:850,y:170,type:'bocianolak'}),
 Object.freeze({x:128,y:515,type:'zubrokryptyda'}),
 Object.freeze({x:830,y:515,type:'bobrozombi'})
]);
