import { unitVector } from './combat-contract.js';
export const FIRE_INTERVAL_MS=180;
export const PROJECTILE_SPEED=510;
export const AIM_DEADZONE=0.24;
export function resolveAim(x,y,threshold=AIM_DEADZONE){
 const length=Math.hypot(x,y);
 return length>threshold?unitVector(x,y):{x:0,y:0};
}
export function shouldFire(now,last,active){
 return Boolean(active&&Number.isFinite(now)&&(last===null||now-last>=FIRE_INTERVAL_MS));
}
export function muzzlePoint(x,y,aim){return {x:x+aim.x*24,y:y+aim.y*24};}
