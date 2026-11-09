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

 // Test across the actual body rectangle; no oversized spherical proxy.
export function rudolfFlameVisible(origin,aim,feet,obstacles,tune){
 const box=rudolfDamageBox(feet),r=tune.range,half=tune.halfAngle;
 // Rectangle contact is sampled at ≤12px, including corners and edges.
 for(let y=box.top;y<=box.bottom+11;y+=12){
  for(let x=box.left;x<=box.right+11;x+=12){
   const point={x:Math.min(x,box.right),y:Math.min(y,box.bottom)};
   const dx=point.x-origin.x,dy=point.y-origin.y,d=Math.hypot(dx,dy);
   if(d>r)continue;
   if(d>0.0001&&(dx*aim.x+dy*aim.y)/d<Math.cos(half))continue;
   if(obstacles.some(o=>segmentSolidFootprint(origin,point,o)))continue;
   return true;
  }
 }
 return false;
}
function segmentSolidFootprint(from,to,obstacle){
 const p=obstacle.footprint;
 if(p.shape!=='box')return false;
 const x1=p.x-p.width/2,x2=p.x+p.width/2,y1=p.y-p.height/2,y2=p.y+p.height/2;
 let lo=0,hi=1;
 for(const [v,d,min,max] of [[from.x,to.x-from.x,x1,x2],[from.y,to.y-from.y,y1,y2]]){
  if(Math.abs(d)<1e-8){if(v<min||v>max)return false;continue;}
  const a=(min-v)/d,b=(max-v)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
  if(lo>hi)return false;
 }
 return true;
}
