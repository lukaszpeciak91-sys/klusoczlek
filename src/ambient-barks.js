// Cosmetic state has its own deterministic RNG, never coupled to encounter logic.
export const BARK_PHRASES=Object.freeze(['Na niego!','Bić! Zabić!','Aaaaaaaa','Umrzyj!','Cośmy Ci zrobili?!','Atak!','Kruca dosyć tego!']);
export const EXTRA_BARKS=Object.freeze(['BRAĆ GO!','NIE UCIEKNIESZ!','TY BYDLAKU!!','ZARAZ CIĘ DOPADNĘ!']);
export const HIT_BARKS=Object.freeze({
 bobrozombi:['AUA!!!!!','AAAAAAA!','COŚ TY MI ZROBIŁ?!','TY BYDLAKU!!'],
 bocianolak:['NIE PO NOGACH!','AAAAA CO ZA BÓL!!','AŁĆ!','TY BYDLAKU!!'],
 zubrokryptyda:['TO BOLAŁO!','JAK ŚMIESZ?!','AAAAAAA!','ZARAZ CIĘ DOPADNĘ!']
});
export const MAX_BUBBLES=2;
const unit=rng=>{const n=rng();return Number.isFinite(n)?Math.max(0,Math.min(1-Number.EPSILON,n)):0;};
const interval=(rng,min,max)=>min+Math.floor(unit(rng)*(max-min+1));
export function createBarkSchedule(rng){return {remaining:interval(rng,3000,5000),echoRemaining:-1,active:[],attempts:0,shown:0,hitAttempts:0,hitShown:0,suppressed:0,lastPhrase:null,lastDamageAt:-Infinity,elapsed:0,enemyCooldown:new WeakMap(),lastSpeaker:null};}
export function advanceBarks(state,delta,allowed,candidates,rng){
 if(!allowed){state.active.length=0;state.echoRemaining=-1;return null;}
 const ms=Number.isFinite(delta)?Math.max(0,delta):0;state.elapsed+=ms;
 state.active=state.active.filter(x=>{x.age+=ms;return x.age<x.life&&x.speaker&&!x.speaker.dead&&x.speaker.hp>0;});
 const speak=()=>{
  if(state.active.length>=MAX_BUBBLES)return null;
  const choices=candidates().filter(x=>!state.active.some(a=>a.speaker===x));
  if(!choices.length)return null;
  const alternatives=choices.filter(x=>x!==state.lastSpeaker);
  const pool=alternatives.length?alternatives:choices;
  const speaker=pool[Math.floor(unit(rng)*pool.length)];
  const phrases=[...BARK_PHRASES,...EXTRA_BARKS].filter(x=>x!==state.lastPhrase);
  const phrase=phrases[Math.floor(unit(rng)*phrases.length)];
  const event={speaker,phrase,kind:'spontaneous',priority:1,life:interval(rng,1200,2100),age:0};
  state.lastPhrase=phrase;state.lastSpeaker=speaker;state.active.push(event);state.shown++;return event;
 };
 // Independent, occasional short response enables two genuinely overlapping
 // spontaneous speakers without making the whole system fire every second.
 if(state.echoRemaining>=0){
  state.echoRemaining-=ms;
  if(state.echoRemaining<=0){state.echoRemaining=-1;speak();}
 }
 state.remaining-=ms;
 if(state.remaining>0)return null;
 state.remaining=interval(rng,3000,6000);state.attempts++;
 const event=speak();
 if(event&&state.active.length===1&&unit(rng)<0.24)state.echoRemaining=interval(rng,300,900);
 return event;
}
export function damageBark(state,enemy,at,rng){
 if(!enemy||enemy.dead||enemy.hp<=0||!HIT_BARKS[enemy.type]||!Number.isFinite(at))return null;
 state.hitAttempts++;
 if(unit(rng)>=0.35)return null;
 if(at-(state.enemyCooldown.get(enemy)??-Infinity)<4500||at-state.lastDamageAt<400)return null;
 const old=state.active.find(e=>e.speaker===enemy);
 if(old?.kind==='damage')return null;
 if(state.active.length>=MAX_BUBBLES&&!old){
  const lower=state.active.find(e=>e.kind==='spontaneous'&&e.age>=250);
  if(!lower){state.suppressed++;return null;}
  state.active.splice(state.active.indexOf(lower),1);
 }
 if(old)state.active.splice(state.active.indexOf(old),1);
 const phrases=HIT_BARKS[enemy.type].filter(x=>x!==state.lastPhrase);
 const phrase=phrases[Math.floor(unit(rng)*phrases.length)];
 const event={speaker:enemy,phrase,kind:'damage',priority:2,life:interval(rng,1200,1900),age:0};
 state.active.push(event);state.lastPhrase=phrase;state.lastSpeaker=enemy;
 state.enemyCooldown.set(enemy,at);state.lastDamageAt=at;state.hitShown++;return event;
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

export function boxesOverlap(a,b,space=5){return !!a&&!!b&&a.x<a.width+b.x+space&&a.x+a.width+space>b.x&&a.y<b.y+b.height+space&&a.y+a.height+space>b.y;}
