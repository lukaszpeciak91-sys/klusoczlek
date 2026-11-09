// Act V visual damage geometry is independent from the feet collision footprint.
export const RUDOLF_DAMAGE_BOX=Object.freeze({halfWidth:65,top:-151,bottom:-8});
export const FAIRY_ARRIVAL=Object.freeze({pauseMs:300,fadeMs:480,bossExplosionMs:950});
export function rudolfDamageBox(feet,box=RUDOLF_DAMAGE_BOX){
 return {left:feet.x-box.halfWidth,right:feet.x+box.halfWidth,
  top:feet.y+box.top,bottom:feet.y+box.bottom};
}
export function segmentRudolfHit(from,to,feet,radius=0){
 const b=rudolfDamageBox(feet),minX=b.left-radius,maxX=b.right+radius,
  minY=b.top-radius,maxY=b.bottom+radius;
 const dx=to.x-from.x,dy=to.y-from.y;
 let low=0,high=1;
 for(const [p,v,min,max] of [[from.x,dx,minX,maxX],[from.y,dy,minY,maxY]]){
  if(Math.abs(v)<1e-8){if(p<min||p>max)return false;continue;}
  const a=(min-p)/v,c=(max-p)/v;
  low=Math.max(low,Math.min(a,c));high=Math.min(high,Math.max(a,c));
  if(low>high)return false;
 }
 return true;
}
export function rudolfFlameTarget(feet){
 return {x:feet.x,y:feet.y-73};
}
