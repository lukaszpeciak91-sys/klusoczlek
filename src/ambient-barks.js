// Cosmetic session state only. Injected RNG never touches layout/combat RNG.
export const BARK_PHRASES=Object.freeze(['Na niego!','Bić! Zabić!','Aaaaaaaa','Umrzyj!','Cośmy Ci zrobili?!','Atak!','Kruca dosyć tego!']);
const unit=rng=>{const n=rng();return Number.isFinite(n)?Math.max(0,Math.min(1-Number.EPSILON,n)):0;};
const interval=(rng,min,max)=>min+Math.floor(unit(rng)*(max-min+1));
export function createBarkSchedule(rng){return {remaining:interval(rng,12000,20000),lastPhrase:-1,active:null,attempts:0,shown:0};}
export function advanceBarks(state,delta,allowed,candidates,rng){
 if(!allowed){state.active=null;return null;}
 const ms=Number.isFinite(delta)?Math.max(0,delta):0;
 if(state.active){state.active.age+=ms;if(state.active.age>=state.active.life)state.active=null;}
 state.remaining-=ms;
 if(state.remaining>0)return null;
 // Exactly one opportunity, scheduled from now. Never replay missed intervals.
 state.remaining=interval(rng,15000,25000);state.attempts++;
 if(state.active)return null;
 const choices=candidates();if(!choices.length)return null;
 const speaker=choices[Math.floor(unit(rng)*choices.length)];
 let index=Math.floor(unit(rng)*(state.lastPhrase<0?BARK_PHRASES.length:BARK_PHRASES.length-1));
 if(state.lastPhrase>=0&&index>=state.lastPhrase)index++;
 state.lastPhrase=index;state.shown++;
 state.active={speaker,phrase:BARK_PHRASES[index],life:interval(rng,1800,2300),age:0};
 return state.active;
}
export function eligibleBarkSpeaker(enemy,anchor,view){
 if(!enemy||!['bobrozombi','bocianolak','zubrokryptyda'].includes(enemy.type)||!Number.isFinite(enemy.hp)||enemy.hp<=0||enemy.dead||enemy.dying||enemy.spawning||enemy.landing||!anchor)return false;
 if(!['x','y','left','right','top','bottom'].every(k=>Number.isFinite(anchor[k]))||anchor.right<=anchor.left||anchor.bottom<=anchor.top)return false;
 return anchor.x>=view.x&&anchor.x<view.x+view.width&&anchor.y>=view.y&&anchor.y<view.y+view.height&&anchor.right>view.x&&anchor.left<view.x+view.width&&anchor.bottom>view.y&&anchor.top<view.y+view.height;
}
export function bubblePlacement(anchor,width,height,viewWidth,viewHeight,hud){
 const margin=8,top=hud.panelY+hud.panelHeight+6;
 if(width>viewWidth-2*margin||height<1)return null;
 const x=Math.max(margin,Math.min(viewWidth-margin-width,anchor.x-width/2));
 const y=anchor.y-height-6;
 // Never move a bubble below its speaker to force a fit under the HUD.
 if(y<top||y+height>viewHeight-margin)return null;
 for(const [cx,cy] of [[hud.joystickX,hud.joystickY],[hud.aimX,hud.aimY??hud.joystickY]]){
  const r=hud.joystickRadius*1.4+6; // complete native touch capture area + margin
  const px=Math.max(x,Math.min(x+width,cx)),py=Math.max(y,Math.min(y+height,cy));
  if(Math.hypot(cx-px,cy-py)<=r)return null;
 }
 return {x,y,width,height};
}
