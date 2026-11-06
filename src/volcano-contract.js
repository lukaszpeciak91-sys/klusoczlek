import {ARENA} from './movement.js';

export const VOLCANO_START=Object.freeze({x:900,y:600});
export const VOLCANO_LAVA_SPEED=24; // world pixels/second, down-positive
export const VOLCANO_DEPTH=Object.freeze({lava:-20,terrain:-10,player:11,controls:50,hud:100});
export const VOLCANO_ASSETS=Object.freeze({
  terrain:Object.freeze({path:'arenas/act3-volcano.png',width:1800,height:1200,format:'RGBA PNG',status:'pending'}),
  lava:Object.freeze({path:'backgrounds/act3-lava.png',width:512,height:512,format:'RGB/RGBA PNG',status:'pending',repeat:'seamless both axes'}),
});
export function validVolcanoPng(data,asset){
  const b=data instanceof Uint8Array?data:new Uint8Array(data);
  if(b.length<33)return false;
  const signature=[137,80,78,71,13,10,26,10];
  if(!signature.every((n,i)=>b[i]===n))return false;
  const read32=i=>((b[i]*16777216)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3])>>>0;
  if(read32(8)!==13||String.fromCharCode(...b.slice(12,16))!=='IHDR')return false;
  const type=b[25];
  return read32(16)===asset.width&&read32(20)===asset.height&&b[24]===8&&
    (asset===VOLCANO_ASSETS.terrain?type===6:(type===2||type===6))&&
    b[26]===0&&b[27]===0&&b[28]===0;
}
export function advanceVolcanoLava(offset,deltaMs,active=true,speed=VOLCANO_LAVA_SPEED){
  if(!active)return offset;
  return offset+Math.max(0,Math.min(50,Number.isFinite(deltaMs)?deltaMs:0))*speed/1000;
}
export function volcanoControlsAllowed({hidden,focused,landscape,paused}){
  return !hidden&&focused&&landscape&&!paused;
}
export function volcanoFacing(input,previous='s'){
  if(Math.hypot(input.x,input.y)<.01)return previous;
  const a=Math.atan2(input.y,input.x);
  const directions=['e','se','s','sw','w','nw','n','ne'];
  return directions[(Math.round(a/(Math.PI/4))+8)%8];
}
// Temporary rectangle; never infer final walkability from terrain alpha.
export const VOLCANO_TEMP_BOUNDS=Object.freeze({left:190,top:155,right:1610,bottom:1045});
export function volcanoStep(position,input,deltaMs,speed,radius){
  const dt=Math.max(0,Math.min(50,Number.isFinite(deltaMs)?deltaMs:0))/1000;
  const b=VOLCANO_TEMP_BOUNDS;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  return {
    x:clamp(position.x+input.x*speed*dt,Math.max(radius,b.left),Math.min(ARENA.width-radius,b.right)),
    y:clamp(position.y+input.y*speed*dt,Math.max(radius,b.top),Math.min(ARENA.height-radius,b.bottom)),
  };
}
