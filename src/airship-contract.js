import {PLAYER_RADIUS,PLAYER_SPEED} from './movement.js';
import {PLAYER_VISUAL_SCALE} from './character-visual.js';

// Provisional logical world dimensions, NOT final PNG dimensions.
export const AIRSHIP_WORLD=Object.freeze({width:960,height:540,start:Object.freeze({x:480,y:270})});
export const DECK_POLYGON=Object.freeze([
  [142,78],[818,78],[882,140],[882,365],[818,371],[142,371],[78,365],[78,140],
].map(([x,y])=>Object.freeze({x,y})));
export const DECK_MARGIN=PLAYER_RADIUS+8;
// Aloes's 64px centered artwork extends farther than his 17px hit circle.
// Reserve its half-height ONLY against the lower rail and lower chamfers.
export const AIRSHIP_PLAYER_LOWER_MARGIN=Math.ceil(64*PLAYER_VISUAL_SCALE/2);
// The wheelhouse's solid footing is much smaller than its tall transparent PNG.
// Coordinates describe the base resting on the deck, not the image's bounding box.
export const WHEELHOUSE_FOOTPRINT=Object.freeze({x:480,y:194,rx:62,ry:28});
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

// A movement segment must never pass through the building's solid footing.
// Preserve the legal previous position and slide along a clear axis rather
// than projecting the player to the opposite side of the ellipse.
export function stepAroundWheelhouse(from,to,radius=PLAYER_RADIUS){
  const margin=radius+7;
  const current=clampToDeck(from,radius+8,AIRSHIP_PLAYER_LOWER_MARGIN);
  const desired=clampToDeck(to,radius+8,AIRSHIP_PLAYER_LOWER_MARGIN);
  if(!wheelhouseSegmentHit(current,desired,margin))return desired;
  const sideways=clampToDeck({x:desired.x,y:current.y},radius+8,AIRSHIP_PLAYER_LOWER_MARGIN);
  const vertical=clampToDeck({x:current.x,y:desired.y},radius+8,AIRSHIP_PLAYER_LOWER_MARGIN);
  const first=Math.abs(desired.x-current.x)>=Math.abs(desired.y-current.y)?sideways:vertical;
  const second=first===sideways?vertical:sideways;
  for(const candidate of [first,second]){
    if(!wheelhouseSegmentHit(current,candidate,margin))return candidate;
  }
  return current;
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
export function insideDeck(point,margin=DECK_MARGIN,lowerMargin=margin){
  for(let i=0;i<DECK_POLYGON.length;i++){
    const a=DECK_POLYGON[i],b=DECK_POLYGON[(i+1)%DECK_POLYGON.length];
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    const cross=dx*(point.y-a.y)-dy*(point.x-a.x);
    const edgeMargin=i>=3&&i<=5?lowerMargin:margin;
    if(cross<edgeMargin*length-1e-6)return false;
  }
  return true;
}
export function clampToDeck(point,margin=DECK_MARGIN,lowerMargin=margin){
  let {x,y}=point;
  for(let pass=0;pass<3;pass++){
    for(let i=0;i<DECK_POLYGON.length;i++){
      const a=DECK_POLYGON[i],b=DECK_POLYGON[(i+1)%DECK_POLYGON.length];
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      const signed=(dx*(y-a.y)-dy*(x-a.x))/length;
      const edgeMargin=i>=3&&i<=5?lowerMargin:margin;
      if(signed<edgeMargin){const shift=edgeMargin-signed;x-=dy/length*shift;y+=dx/length*shift;}
    }
  }
  return {x,y};
}
export function stepDeckPosition(point,input,deltaMs,speed=PLAYER_SPEED){
  const dt=Math.max(0,Math.min(50,deltaMs))/1000;
  return clampToDeck({x:point.x+input.x*speed*dt,y:point.y+input.y*speed*dt},DECK_MARGIN,AIRSHIP_PLAYER_LOWER_MARGIN);
}
export function scrollCloudLayers(layers,deltaMs){
  const seconds=Math.max(0,Math.min(50,deltaMs))/1000;
  for(const layer of layers)layer.tilePositionX+=layer.speed*seconds;
}
