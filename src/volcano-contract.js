import {ARENA} from './movement.js';

export const VOLCANO_START=Object.freeze({x:900,y:600});
export const VOLCANO_ASSETS=Object.freeze({
  terrain:Object.freeze({path:'arenas/act3-volcano.png',width:1800,height:1200,format:'RGBA PNG',status:'pending'}),
  lava:Object.freeze({path:'backgrounds/act3-lava.png',width:512,height:512,format:'RGB/RGBA PNG',status:'pending',repeat:'seamless both axes'}),
});
// Temporary rectangle inset from lava. Replace only after artist-approved
// terrain/mask alignment; never derive collision from decorative PNG pixels.
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
