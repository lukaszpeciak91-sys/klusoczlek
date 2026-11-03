import {PLAYER_RADIUS,PLAYER_SPEED} from './movement.js';

// Provisional logical world dimensions, NOT final PNG dimensions.
export const AIRSHIP_WORLD=Object.freeze({width:960,height:540,start:Object.freeze({x:480,y:270})});
export const DECK_POLYGON=Object.freeze([
  [142,78],[818,78],[882,140],[882,400],[818,462],[142,462],[78,400],[78,140],
].map(([x,y])=>Object.freeze({x,y})));
export const DECK_MARGIN=PLAYER_RADIUS+8;
export const AIRSHIP_LANDING_ZONES=Object.freeze([
  Object.freeze({id:'port-aft',x:240,y:270,radius:45}),
  Object.freeze({id:'starboard-fore',x:730,y:270,radius:45}),
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
