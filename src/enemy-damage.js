import {ENEMY_TYPES} from './enemy-types.js';
import {segmentFootprintHit} from './obstacle-geometry.js';
import {flameTargetVisible} from './weapon-combat.js';
// Approved 192px frames, coordinates relative to their (96,96) image center.
// All eight silhouettes support the same main-body approximation; horns,
// claws, alpha margins and individual leg gaps do not become a frame-sized box.
const ART_BODY=Object.freeze([
 Object.freeze({x:0,y:-41,radius:36}),
 Object.freeze({x:0,y:0,radius:65}),
 Object.freeze({x:0,y:39,radius:43})
]);
const FALLBACK_BODY=Object.freeze([
 Object.freeze({x:-15,y:-27,radius:34}),
 Object.freeze({x:15,y:-27,radius:34}),
 Object.freeze({x:0,y:-51,radius:24})
]);
const BOSS_BODY=Object.freeze([{x:0,y:-87,radius:31},{x:-25,y:-48,radius:43},{x:25,y:-48,radius:43},{x:0,y:-20,radius:44}].map(Object.freeze));
export function damageFootprints(enemy,visual=null){
 if(enemy.type==='marcin')return BOSS_BODY.map(p=>({shape:'circle',x:enemy.x+p.x,y:enemy.y+p.y,angle:0,radius:p.radius}));
 if(enemy.type!=='zubrokryptyda')return [{shape:'circle',x:enemy.x,y:enemy.y,angle:0,radius:ENEMY_TYPES[enemy.type].radius}];
 const art=visual?.art===true,parts=art?ART_BODY:FALLBACK_BODY;
 const x=visual?.x??enemy.x,y=visual?.y??enemy.y,scale=art?visual.scale:1,angle=art?visual.angle:0;
 const c=Math.cos(angle),s=Math.sin(angle);
 return parts.map(p=>({shape:'circle',x:x+(p.x*c-p.y*s)*scale,y:y+(p.x*s+p.y*c)*scale,angle:0,radius:p.radius*scale}));
}
export function enemyProjectileHit(from,to,enemy,radius=0,visual=null){
 let best=null;
 for(const shape of damageFootprints(enemy,visual)){
  const hit=segmentFootprintHit(from,to,shape,radius);
  if(hit&&(!best||hit.t<best.t))best=hit;
 }
 return best;
}
export function enemyFlameVisible(origin,aim,enemy,obstacles,visual=null){
 // Reuse the exact existing range/cone/obstacle predicate for every component.
 return damageFootprints(enemy,visual).some(shape=>flameTargetVisible(origin,aim,shape,shape.radius,obstacles));
}
