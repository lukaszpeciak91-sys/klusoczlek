import {assetUrl} from './character-visual.js';
import {volcanoFootprintAllowed,volcanoStep} from './volcano-contract.js';
import {facingOf,playerFrame} from './combat-contract.js';
import {applyPlayerContact} from './bobrozombi.js';

export const APARTMENT=Object.freeze({
 trigger:Object.freeze({x:1300,y:370,radius:185}),
 marlena:Object.freeze({x:1400,y:225}),
 bogdan:Object.freeze({x:1500,y:235}),
 exit:Object.freeze([{x:1350,y:330},{x:1250,y:400},{x:1150,y:440},{x:1030,y:470}])
});
export const MARLENA_BARKS=Object.freeze(['Mama miała rację!','Niech sam w tym smrodzie siedzi, pajac!']);
export const BOGDAN_HP=80;
export const BOSS_TELEGRAPH_MS=Object.freeze({beam:900,spread:500,charge:550});
export const BOSS_BEAM_MS=700;
export function apartmentReached(player){
 return Math.hypot(player.x-APARTMENT.trigger.x,player.y-APARTMENT.trigger.y)<=APARTMENT.trigger.radius;
}
export function bossPhase(hp,maxHp=BOGDAN_HP){return hp/maxHp<=.4?2:1;}
export function bossAttackFor(index,phase){
 return (phase===2?['beam','spread','charge','charge']:['beam','spread','charge'])[index%(phase===2?4:3)];
}
export function bossFan(origin,angle,phase){
 const count=phase===2?7:5,arc=phase===2?Math.PI*.85:Math.PI*.65;
 return Array.from({length:count},(_,i)=>{
  const a=angle-arc/2+arc*i/(count-1);
  return {x:origin.x,y:origin.y,vx:Math.cos(a)*210,vy:Math.sin(a)*210};
 });
}
export function bossBeamPoint(origin,angle,length,mask,step=4){
 let end={...origin};
 for(let d=step;d<=length;d+=step){
  const p={x:origin.x+Math.cos(angle)*d,y:origin.y+Math.sin(angle)*d};
  if(!volcanoFootprintAllowed(mask,p.x,p.y,3,0))break;
  end=p;
 }
 return end;
}
export function createBogdanEncounter(scene,Phaser){
 let disposed=false,ready=false,failed=false,started=false,argumentDone=false,departing=false,
  departed=false,confrontation=false,active=false,defeated=false,attackIndex=0,attack=null,
  hp=BOGDAN_HP,lastHit=-Infinity,projectiles=[],actors=[],marlena=null,bogdan=null;
 const graphics=scene.add.graphics().setDepth(17);
 const bossLabel=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'16px',color:'#ffce85',
  stroke:'#281018',strokeThickness:4}).setOrigin(.5).setDepth(22).setVisible(false);
 const bark=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'17px',color:'#fff2ca',
  stroke:'#201018',strokeThickness:5,align:'center'}).setOrigin(.5).setDepth(22).setVisible(false);
 const keys={marlena:'npcs/marlena.png',bogdan:'enemies/bogdan.png'};
 async function load(key){
  const texture='volcano-apartment-'+key;
  if(scene.textures.exists(texture))return texture;
  const response=await fetch(assetUrl(import.meta.env.BASE_URL,keys[key]),{cache:'no-cache'});
  if(!response.ok)throw Error(key+' HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const n=i=>((bytes[i]*16777216)+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3])>>>0;
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||
   bytes[24]!==8||![2,6].includes(bytes[25])||n(16)!==1024||n(20)!==160)
   throw Error(key+' invalid 1024x160 spritesheet');
  const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
  try{
   const image=new Image();
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
   if(disposed)return null;
   if(!scene.textures.exists(texture))scene.textures.addSpriteSheet(texture,image,{frameWidth:128,frameHeight:160});
   scene.textures.get(texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
   return texture;
  }finally{URL.revokeObjectURL(url);}
 }
 async function prepare(){
  try{
   const textures=await Promise.all([load('marlena'),load('bogdan')]);
   if(disposed||textures.some(x=>!x))return false;
   for(const [i,key] of ['marlena','bogdan'].entries()){
    const p=APARTMENT[key];
    if(!volcanoFootprintAllowed(scene.walkability,p.x,p.y,18)){
     console.warn('[Volcano Boss] invalid apartment NPC footprint: '+key);failed=true;return false;
    }
    const actor=scene.add.sprite(p.x,p.y,textures[i],2).setOrigin(.5,1).setDepth(12).setScale(.72);
    actors.push(actor);
    if(key==='marlena')marlena=actor;else bogdan=actor;
   }
   ready=true;return true;
  }catch(error){failed=true;if(!disposed)console.warn('[Volcano Boss] NPC assets unavailable: '+error.message);return false;}
 }
 function beginArgument(){
  if(!ready||started||disposed||scene.dialogueState.id||scene.defeated)return false;
  started=true;return true;
 }
 function depart(){
  if(!started||departing||departed||!marlena)return false;
  departing=true;
  const path=APARTMENT.exit;
  let segment=0,elapsed=0,barkIndex=0;
  const showBark=()=>{
   if(barkIndex>=MARLENA_BARKS.length)return;
   bark.setText(MARLENA_BARKS[barkIndex++]).setVisible(true);
  };
  showBark();
  function tick(dt){
   if(disposed||!departing||!marlena?.active)return;
   elapsed+=dt;
   if(elapsed>1250&&barkIndex===1)showBark();
   if(elapsed>2550)bark.setVisible(false);
   const target=path[segment];
   if(!target){departing=false;departed=true;marlena.destroy();marlena=null;bark.setVisible(false);return;}
   const dx=target.x-marlena.x,dy=target.y-marlena.y,d=Math.hypot(dx,dy);
   if(d<5){segment++;return;}
   const next=volcanoStep(marlena,{x:dx/d,y:dy/d},dt,145,14,scene.walkability);
   if(Math.hypot(next.x-marlena.x,next.y-marlena.y)<.05){
    console.warn('[Volcano Boss] Marlena route blocked, ending departure safely');
    departing=false;departed=true;marlena.destroy();marlena=null;bark.setVisible(false);return;
   }
   marlena.setPosition(next.x,next.y).setFrame(playerFrame(facingOf(dx,dy,'s')));
   bark.setPosition(marlena.x,marlena.y-105);
  }
  departureTick=tick;
  return true;
 }
 let departureTick=null;
 function beginConfrontation(){
  if(!departed||!ready||confrontation||scene.defeated||scene.dialogueState.id)return false;
  confrontation=true;return true;
 }
 function activate(){
  if(!confrontation||active||disposed)return false;
  active=true;attack={mode:'recovery',remaining:900};
  bossLabel.setVisible(true);return true;
 }
 function damage(amount,now){
  if(!active||defeated||now-lastHit<150)return false;
  lastHit=now;hp=Math.max(0,hp-amount);
  if(hp===0){
   defeated=true;active=false;attack=null;projectiles.length=0;graphics.clear();
   bossLabel.setText('BOGDAN POKONANY — '+hp+'/'+BOGDAN_HP);
  }
  return true;
 }
 function hurtPlayer(now){
  if(scene.dialogueState.id||scene.defeated||scene.run.hp<=0)return;
  const contact=applyPlayerContact({hp:scene.run.hp,invulnerableUntil:scene.playerInvulnerableUntil??0},now);
  scene.run.hp=contact.hp;scene.playerInvulnerableUntil=contact.invulnerableUntil;
  if(scene.run.hp<=0)scene.lockDeath();
 }
 function update(dt,now){
  if(disposed||scene.defeated||scene.dialogueState.id)return;
  if(departing)departureTick?.(Math.min(50,dt));
  if(!active||defeated||!bogdan?.active)return;
  const delta=Math.min(50,dt),phase=bossPhase(hp),p=scene.player;
  graphics.clear();
  bossLabel.setPosition(bogdan.x,bogdan.y-120).setText('BOGDAN '+hp+'/'+BOGDAN_HP);
  for(let i=projectiles.length-1;i>=0;i--){
   const shot=projectiles[i];shot.age+=delta;
   const nx=shot.x+shot.vx*delta/1000,ny=shot.y+shot.vy*delta/1000;
   if(shot.age>2600||!volcanoFootprintAllowed(scene.walkability,nx,ny,6,0)){projectiles.splice(i,1);continue;}
   shot.x=nx;shot.y=ny;
   graphics.fillStyle(0xff6a19).fillCircle(shot.x,shot.y,9);
   graphics.fillStyle(0xffe16b).fillCircle(shot.x,shot.y,4);
   if(Math.hypot(p.x-shot.x,p.y-shot.y)<22){hurtPlayer(now);projectiles.splice(i,1);}
  }
  attack.remaining-=delta;
  if(attack.mode==='recovery'){
   if(attack.remaining>0)return;
   const type=bossAttackFor(attackIndex++,phase),angle=Math.atan2(p.y-bogdan.y,p.x-bogdan.x);
   attack={mode:'telegraph',type,angle,remaining:BOSS_TELEGRAPH_MS[type],charges:phase===2&&type==='charge'?2:1};
  }
  if(attack.mode==='telegraph'){
   const a=attack.angle;
   if(attack.type==='beam'){
    const end=bossBeamPoint(bogdan,a,540,scene.walkability);
    graphics.lineStyle(8,0xff5620,.7).lineBetween(bogdan.x,bogdan.y,end.x,end.y);
   }else{
    graphics.lineStyle(3,0xffb039,.75).strokeCircle(bogdan.x,bogdan.y,35);
   }
   if(attack.remaining>0)return;
   if(attack.type==='spread'){
    projectiles.push(...bossFan({x:bogdan.x,y:bogdan.y-18},a,phase).map(v=>({...v,age:0})));
    attack={mode:'recovery',remaining:phase===2?650:1000};return;
   }
   if(attack.type==='beam'){attack.mode='beam';attack.remaining=BOSS_BEAM_MS;return;}
   attack.mode='charge';attack.remaining=350;return;
  }
  if(attack.mode==='beam'){
   const end=bossBeamPoint(bogdan,attack.angle,540,scene.walkability);
   graphics.lineStyle(22,0xff4510,.92).lineBetween(bogdan.x,bogdan.y,end.x,end.y);
   graphics.lineStyle(9,0xffe16d,.85).lineBetween(bogdan.x,bogdan.y,end.x,end.y);
   const vx=end.x-bogdan.x,vy=end.y-bogdan.y,len=Math.hypot(vx,vy);
   if(len>0){
    const t=Math.max(0,Math.min(1,((p.x-bogdan.x)*vx+(p.y-bogdan.y)*vy)/(len*len)));
    if(Math.hypot(p.x-(bogdan.x+vx*t),p.y-(bogdan.y+vy*t))<27)hurtPlayer(now);
   }
   if(attack.remaining<=0)attack={mode:'recovery',remaining:phase===2?600:1050};
  }else if(attack.mode==='charge'){
   const next=volcanoStep(bogdan,{x:Math.cos(attack.angle),y:Math.sin(attack.angle)},delta,410,20,scene.walkability);
   if(Math.hypot(next.x-bogdan.x,next.y-bogdan.y)<.1)attack.remaining=0;
   bogdan.setPosition(next.x,next.y).setFrame(playerFrame(facingOf(Math.cos(attack.angle),Math.sin(attack.angle),'s')));
   if(Math.hypot(p.x-bogdan.x,p.y-bogdan.y)<42)hurtPlayer(now);
   if(attack.remaining<=0){
    if(--attack.charges>0)attack={mode:'telegraph',type:'charge',angle:Math.atan2(p.y-bogdan.y,p.x-bogdan.x),remaining:BOSS_TELEGRAPH_MS.charge,charges:1};
    else attack={mode:'recovery',remaining:phase===2?650:1100};
   }
  }

 }
 scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
  disposed=true;departureTick=null;projectiles.length=0;graphics.destroy();bossLabel.destroy();bark.destroy();
  for(const actor of actors)if(actor.active)actor.destroy();
 });
 return {prepare,beginArgument,depart,beginConfrontation,activate,damage,update,
  get ready(){return ready;},get failed(){return failed;},get argumentStarted(){return started;},
  get departed(){return departed;},get active(){return active;},get defeated(){return defeated;},
  get hp(){return hp;},get bogdan(){return bogdan;},get marlena(){return marlena;}};
}
