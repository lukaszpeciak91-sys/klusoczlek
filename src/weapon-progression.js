import { ARENA } from './movement.js';
import { ENCOUNTER } from './bobrozombi.js';
import {footprintOverlap} from './obstacle-geometry.js';

export const WEAPONS=Object.freeze({
 blunderbuss:Object.freeze({label:'PUKAWKA',color:0xb59b46,symbol:'ϟ'}),
 rifle:Object.freeze({label:'KARABIN',color:0x2499ad,symbol:'⊕'}),
 flamethrower:Object.freeze({label:'MIOTACZ',color:0xd65d32,symbol:'♨'}),
});
const CLEARANCE=29;
export function clearPoint(point,obstacles,margin=CLEARANCE,navigation=null){
 return point.x>=margin&&point.y>=margin&&point.x<=ARENA.width-margin&&point.y<=ARENA.height-margin&&
 (!navigation||navigation.isReachable(point))&&
 obstacles.every(o=>o.alive===false||o.gameplayClass==='decorative'||!footprintOverlap(o.footprint,point,margin));
}
export function initialPickupPoint(player,camera,scale,obstacles,navigation=null){
 // Camera follow is initially centered (or world-clamped) on player.
 const width=Math.max(320,scale.width),height=Math.max(240,scale.height);
 const left=Math.max(0,Math.min(ARENA.width-width,player.x-width/2));
 const top=Math.max(0,Math.min(ARENA.height-height,player.y-height/2));
 const inView=p=>p.x>left+36&&p.x<left+width-36&&p.y>top+36&&p.y<top+height-36;
 for(const [dx,dy] of [[100,0],[0,85],[-100,0],[0,-85],[75,75],[-75,75]]){
  const point={x:player.x+dx,y:player.y+dy};
  if(inView(point)&&clearPoint(point,obstacles,CLEARANCE,navigation)&&Math.hypot(dx,dy)>53)return point;
 }
 return null;
}
export function dropPoint(enemy,obstacles,navigation=null){
 for(const [dx,dy] of [[0,0],[36,0],[-36,0],[0,36],[0,-36],[50,50],[-50,50],[50,-50],[-50,-50]]){
  const p={x:enemy.x+dx,y:enemy.y+dy};
  if(clearPoint(p,obstacles,CLEARANCE,navigation))return p;
 }
 return null;
}
export function safeEnemySpawn(player,obstacles,index,radius=ENCOUNTER.enemyRadius,navigation=null){
 const r=radius+25;
 const options=[
  {x:r,y:r},{x:ARENA.width-r,y:r},{x:ARENA.width-r,y:ARENA.height-r},{x:r,y:ARENA.height-r},
  {x:ARENA.width/2,y:r},{x:ARENA.width-r,y:ARENA.height/2},{x:ARENA.width/2,y:ARENA.height-r},{x:r,y:ARENA.height/2}
 ];
 for(let i=0;i<options.length;i++){
  const point=options[(index+i)%options.length];
  if(Math.hypot(point.x-player.x,point.y-player.y)>=ENCOUNTER.minSpawnDistance&&clearPoint(point,obstacles,radius+4,navigation))return point;
 }
 return null;
}
export function pickupCollected(player,pickup){return Math.hypot(player.x-pickup.x,player.y-pickup.y)<=43;}

export function fallbackRewardPoint(player,obstacles,navigation=null){
 // Finite lazy search: ordinary rewards return from the first nearby ring;
 // never allocate a world-sized candidate list on gameplay frames.
 const acceptable=p=>clearPoint(p,obstacles,CLEARANCE,navigation)&&Math.hypot(p.x-player.x,p.y-player.y)>52;
 for(const distance of [85,130,190,260]){
  for(let step=0;step<8;step++){
   const angle=step*Math.PI/4;
   const p={x:player.x+Math.cos(angle)*distance,y:player.y+Math.sin(angle)*distance};
   if(acceptable(p))return p;
  }
 }
 for(let y=48;y<ARENA.height-48;y+=64)for(let x=48;x<ARENA.width-48;x+=64){
  const p={x,y};if(acceptable(p))return p;
 }
 return null;
}
