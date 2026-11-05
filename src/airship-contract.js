import {PLAYER_RADIUS,PLAYER_SPEED} from './movement.js';

// Provisional logical world dimensions, NOT final PNG dimensions.
export const AIRSHIP_WORLD=Object.freeze({width:960,height:540,start:Object.freeze({x:480,y:270})});
export const DECK_POLYGON=Object.freeze([
  [142,78],[818,78],[882,140],[882,400],[818,430],[142,430],[78,400],[78,140],
].map(([x,y])=>Object.freeze({x,y})));
export const DECK_MARGIN=PLAYER_RADIUS+8;
// The wheelhouse's solid footing is much smaller than its tall transparent PNG.
// Coordinates describe the base resting on the deck, not the image's bounding box.
export const WHEELHOUSE_FOOTPRINT=Object.freeze({x:480,y:194,rx:57,ry:25});
export function wheelhouseSegmentHit(from,to,margin=0){
  const f=WHEELHOUSE_FOOTPRINT,a=f.rx+margin,b=f.ry+margin;
  const sx=(from.x-f.x)/a,sy=(from.y-f.y)/b;
  const dx=(to.x-from.x)/a,dy=(to.y-from.y)/b;
  const A=dx*dx+dy*dy,B=2*(sx*dx+sy*dy),C=sx*sx+sy*sy-1;
  if(C<=0)return true;
  const discriminant=B*B-4*A*C;
  if(A<1e-12||discriminant<0)return false;
  const t=(-B-Math.sqrt(discriminant))/(2*A);
  return t>=0&&t<=1;
}
export function avoidWheelhouse(point,radius=PLAYER_RADIUS){
  const {x,y,rx,ry}=WHEELHOUSE_FOOTPRINT;
  const a=rx+radius,b=ry+radius;
  let dx=point.x-x,dy=point.y-y;
  const distance=Math.hypot(dx/a,dy/b);
  if(distance>=1)return {x:point.x,y:point.y};
  if(distance<1e-6){dx=0;dy=b;return {x:x,y:y+dy};}
  return {x:x+dx/distance,y:y+dy/distance};
}

export const AIRSHIP_LANDING_ZONES=Object.freeze([
  Object.freeze({id:'port-aft',x:320,y:306,radius:45}),
  Object.freeze({id:'starboard-fore',x:638,y:305,radius:45}),
]);
export const AIRSHIP_LAYERS=Object.freeze([
  Object.freeze({id:'sky',path:'backgrounds/act2-sky.png',speed:0,depth:-40}),
  Object.freeze({id:'far',path:'backgrounds/act2-clouds-far.png',speed:5,depth:-30}),
  Object.freeze({id:'mid',path:'backgrounds/act2-clouds-mid.png',speed:12,depth:-20}),
  Object.freeze({id:'near',path:'backgrounds/act2-clouds-near.png',speed:23,depth:-10}),
]);
// Inward projection onto the eight edges, retaining the player radius from rails.
// The polygon is convex and clockwise in Phaser's down-positive coordinates.
export function insideDeck(point,margin=DECK_MARGIN){
  for(let i=0;i<DECK_POLYGON.length;i++){
    const a=DECK_POLYGON[i],b=DECK_POLYGON[(i+1)%DECK_POLYGON.length];
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    const cross=dx*(point.y-a.y)-dy*(point.x-a.x);
    if(cross<margin*length-1e-6)return false;
  }
  return true;
}
export function clampToDeck(point,margin=DECK_MARGIN){
  let {x,y}=point;
  for(let pass=0;pass<3;pass++){
    for(let i=0;i<DECK_POLYGON.length;i++){
      const a=DECK_POLYGON[i],b=DECK_POLYGON[(i+1)%DECK_POLYGON.length];
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      const signed=(dx*(y-a.y)-dy*(x-a.x))/length;
      if(signed<margin){const shift=margin-signed;x-=dy/length*shift;y+=dx/length*shift;}
    }
  }
  return {x,y};
}
export function stepDeckPosition(point,input,deltaMs,speed=PLAYER_SPEED){
  const dt=Math.max(0,Math.min(50,deltaMs))/1000;
  return clampToDeck({x:point.x+input.x*speed*dt,y:point.y+input.y*speed*dt});
}
export function scrollCloudLayers(layers,deltaMs){
  const seconds=Math.max(0,Math.min(50,deltaMs))/1000;
  for(const layer of layers)layer.tilePositionX+=layer.speed*seconds;
}
