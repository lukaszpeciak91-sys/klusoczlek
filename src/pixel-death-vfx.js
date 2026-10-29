import {DEATH_PROFILES,fragmentSpec} from './combat-feedback.js';
// One Graphics display object for the entire active burst; no fragment physics or timers.
export function createPixelBurst(scene,type,x,y,seed=0){
 const profile=DEATH_PROFILES[type],graphics=scene.add.graphics().setDepth(120);
 const fragments=Array.from({length:profile.count},(_,i)=>fragmentSpec(type,seed,i));
 let age=0,done=false;
 const update=delta=>{
  if(done)return false;
  age+=Math.max(0,Math.min(delta,50));
  const t=Math.min(1,age/profile.duration);
  graphics.clear();
  if(age<65){
   const flash=1-age/65;
   graphics.fillStyle(0xff192b,0.9*flash).fillEllipse(x,y+profile.offsetY,profile.width*0.95,profile.height*0.9);
  }
  for(const f of fragments){
   const px=x+f.x*(1-t)+f.vx*t*profile.duration/1000;
   const py=y+f.y*(1-t)+f.vy*t*profile.duration/1000+23*t*t;
   graphics.fillStyle(f.color,Math.max(0,1-t*t)).fillRect(Math.round(px),Math.round(py),f.size,f.size);
  }
  if(age>=profile.duration){destroy();return false;}
  return true;
 };
 const destroy=()=>{done=true;if(graphics.active)graphics.destroy();};
 // Render an initial full-red silhouette immediately (before the scene changes).
 update(0);
 return {update,destroy,graphics,get done(){return done;}};
}
export function updateBursts(list,delta){
 for(const effect of list)effect.update(delta);
 for(let i=list.length-1;i>=0;i--)if(list[i].done)list.splice(i,1);
}
export function destroyBursts(list){for(const effect of list)effect.destroy();list.length=0;}
