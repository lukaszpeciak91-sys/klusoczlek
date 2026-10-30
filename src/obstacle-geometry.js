// Geometry is independent of art, Arcade bodies and scene state.
// Shape coordinates are in world pixels; angle is expressed in radians.
const EPS=1e-9;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function local(shape,p){
 const a=shape.angle||0,c=Math.cos(a),s=Math.sin(a),dx=p.x-shape.x,dy=p.y-shape.y;
 return {x:dx*c+dy*s,y:-dx*s+dy*c};
}
function pointSegmentDistance(p,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
 const t=l2?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l2,0,1):0;
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function footprintDistance(shape,point){
 const p=local(shape,point);
 if(shape.shape==='circle')return Math.hypot(p.x,p.y)-shape.radius;
 if(shape.shape==='box'){
  const dx=Math.abs(p.x)-shape.width/2,dy=Math.abs(p.y)-shape.height/2;
  return Math.hypot(Math.max(0,dx),Math.max(0,dy))+Math.min(Math.max(dx,dy),0);
 }
 if(shape.shape==='capsule'){
  const half=Math.max(0,(shape.length-2*shape.radius)/2);
  return pointSegmentDistance(p,{x:-half,y:0},{x:half,y:0})-shape.radius;
 }
 throw new RangeError('Unsupported obstacle shape: '+shape.shape);
}
export function footprintOverlap(shape,point,actorRadius=0){
 return footprintDistance(shape,point)<=actorRadius+EPS;
}
export function inflatedBounds(shape,padding=0){
 const a=shape.angle||0,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
 if(shape.shape==='circle')return {minX:shape.x-shape.radius-padding,maxX:shape.x+shape.radius+padding,minY:shape.y-shape.radius-padding,maxY:shape.y+shape.radius+padding};
 let hx,hy;
 if(shape.shape==='box'){hx=shape.width/2;hy=shape.height/2;}
 else if(shape.shape==='capsule'){hx=Math.max(0,(shape.length-2*shape.radius)/2);hy=0;}
 else throw new RangeError('Unsupported obstacle shape');
 const r=shape.shape==='capsule'?shape.radius:0;
 const ex=c*hx+s*hy+r+padding,ey=s*hx+c*hy+r+padding;
 return {minX:shape.x-ex,maxX:shape.x+ex,minY:shape.y-ey,maxY:shape.y+ey};
}
// Conservative interval subdivision with bisection at entry. Avoids treating
// the closest center as the first segment impact for elongated shapes.
export function segmentFootprintHit(from,to,shape,projectileRadius=0){
 const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy);
 const at=t=>({x:from.x+dx*t,y:from.y+dy*t});
 if(footprintOverlap(shape,from,projectileRadius))return {t:0,point:{...from}};
 if(len<EPS)return null;
 // Signed distance is 1-Lipschitz: a positive distance d guarantees the
 // next d/len fraction of the segment cannot intersect the footprint.
 let t=0;
 for(let i=0;i<8192&&t<1;i++){
  const d=footprintDistance(shape,at(t))-projectileRadius;
  if(d<=EPS)return {t,point:at(t)};
  const step=Math.max(EPS,d/len);
  const next=Math.min(1,t+step);
  if(next===t)break;
  t=next;
 }
 return footprintOverlap(shape,to,projectileRadius)?{t:1,point:{...to}}:null;
}
export function firstFootprintHit(from,to,instances,radius=0){
 let best=null;
 for(const obstacle of instances){
  if(obstacle.alive===false||obstacle.gameplayClass==='decorative')continue;
  const shape=obstacle.footprint||obstacle;
  const hit=segmentFootprintHit(from,to,shape,radius);
  if(hit&&(!best||hit.t<best.t))best={...hit,obstacle};
 }
 return best;
}
// A conservative grid snapshot is intended for validation and reward selection,
// not a replacement for enemy AI. Corner cutting is forbidden.
export function reachableCells({width,height,cellSize=12,actorRadius,obstacles,origin,margin=0}){
 if(!(width>0&&height>0&&cellSize>0&&actorRadius>=0))throw new RangeError('Invalid navigation parameters');
 const cols=Math.ceil(width/cellSize),rows=Math.ceil(height/cellSize);
 const blocked=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);
 const index=(x,y)=>y*cols+x,at=(x,y)=>({x:(x+.5)*cellSize,y:(y+.5)*cellSize});
 const radius=actorRadius+margin+cellSize*Math.SQRT2/2;
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const p=at(x,y);
  const out=p.x-radius<0||p.y-radius<0||p.x+radius>width||p.y+radius>height;
  blocked[index(x,y)]=out||obstacles.some(o=>o.alive!==false&&o.gameplayClass!=='decorative'&&footprintOverlap(o.footprint||o,p,radius))?1:0;
 }
 const cell=p=>({x:Math.floor(p.x/cellSize),y:Math.floor(p.y/cellSize)});
 const start=cell(origin),inside=(x,y)=>x>=0&&x<cols&&y>=0&&y<rows;
 const queue=[];
 if(inside(start.x,start.y)&&!blocked[index(start.x,start.y)]){
  seen[index(start.x,start.y)]=1;queue.push(start);
 }
 for(let k=0;k<queue.length;k++){
  const p=queue[k];
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=p.x+dx,y=p.y+dy;
   if(!inside(x,y)||blocked[index(x,y)]||seen[index(x,y)])continue;
   seen[index(x,y)]=1;queue.push({x,y});
  }
 }
 return {cols,rows,cellSize,visited:queue.length,free:blocked.reduce((n,v)=>n+(v===0),0),
  isReachable(point){const p=cell(point);return inside(p.x,p.y)&&!!seen[index(p.x,p.y)]&&!blocked[index(p.x,p.y)];},
  isLocallyClear(point){const p=cell(point);return inside(p.x,p.y)&&!blocked[index(p.x,p.y)];}
 };
}
