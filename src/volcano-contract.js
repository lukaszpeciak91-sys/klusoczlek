import {ARENA} from './movement.js';

export const VOLCANO_START=Object.freeze({x:300,y:1000});
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
// Collision is sourced exclusively from the decoded terrain alpha channel.
// The mask is built once at image load; no per-frame canvas reads.
export const VOLCANO_ALPHA_THRESHOLD=32;
export const VOLCANO_COLLISION_CLEARANCE=2;
export function createVolcanoWalkability(imageData,width=ARENA.width,height=ARENA.height,threshold=VOLCANO_ALPHA_THRESHOLD){
  if(width!==ARENA.width||height!==ARENA.height||imageData.length!==width*height*4)
    throw new Error('Volcano collision: invalid terrain pixel dimensions');
  const pixels=new Uint8Array(width*height);
  for(let i=0;i<pixels.length;i++)pixels[i]=imageData[i*4+3]>=threshold?1:0;
  return Object.freeze({width,height,pixels,threshold});
}
export function volcanoFootprintAllowed(mask,x,y,radius,clearance=VOLCANO_COLLISION_CLEARANCE){
  if(!mask||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(radius))return false;
  const r=Math.max(0,radius+clearance);
  if(x-r<0||y-r<0||x+r>=mask.width||y+r>=mask.height)return false;
  const samples=Math.max(12,Math.ceil(2*Math.PI*r/3));
  const valid=(px,py)=>mask.pixels[Math.floor(py)*mask.width+Math.floor(px)]===1;
  if(!valid(x,y))return false;
  // Sample the full footprint, not only its center or circumference.
  for(let ring=1;ring<=Math.ceil(r/3);ring++){
    const rr=Math.min(r,ring*3);
    const count=Math.max(8,Math.ceil(samples*rr/r));
    for(let i=0;i<count;i++){
      const angle=i*2*Math.PI/count;
      if(!valid(x+Math.cos(angle)*rr,y+Math.sin(angle)*rr))return false;
    }
  }
  return true;
}
export function volcanoStep(position,input,deltaMs,speed,radius,mask){
  if(!mask)return {x:position.x,y:position.y};
  const dt=Math.max(0,Math.min(50,Number.isFinite(deltaMs)?deltaMs:0))/1000;
  const dx=(Number.isFinite(input.x)?input.x:0)*speed*dt;
  const dy=(Number.isFinite(input.y)?input.y:0)*speed*dt;
  // 3px swept substeps stop tunnelling, including during fast enemy lunges.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/3));
  let x=position.x,y=position.y;
  if(!volcanoFootprintAllowed(mask,x,y,radius))return {x,y};
  for(let i=0;i<steps;i++){
    const nx=x+dx/steps,ny=y+dy/steps;
    if(volcanoFootprintAllowed(mask,nx,ny,radius)){x=nx;y=ny;}
    else {
      if(volcanoFootprintAllowed(mask,nx,y,radius))x=nx;
      if(volcanoFootprintAllowed(mask,x,ny,radius))y=ny;
    }
  }
  return {x,y};
}
export function nearestVolcanoSpawn(mask,x,y,radius,minimumDistance=0,avoid=null,maxSearch=240){
  if(!mask)return null;
  const safe=(px,py)=>volcanoFootprintAllowed(mask,px,py,radius)&&
    (!avoid||Math.hypot(px-avoid.x,py-avoid.y)>=minimumDistance);
  if(safe(x,y))return {x,y};
  for(let r=4;r<=maxSearch;r+=4){
    const count=Math.max(16,Math.ceil(2*Math.PI*r/5));
    for(let i=0;i<count;i++){
      const angle=2*Math.PI*i/count,px=Math.round(x+Math.cos(angle)*r),py=Math.round(y+Math.sin(angle)*r);
      if(safe(px,py))return {x:px,y:py};
    }
  }
  return null;
}
