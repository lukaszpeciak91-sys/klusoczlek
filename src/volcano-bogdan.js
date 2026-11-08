import {createBossPresentationState,bossHpRatio} from './boss-presentation.js';
import {createBarkState,makeMonsterBark,showMonsterBark,syncMonsterBark,clearBark,BOGDAN_BARKS} from './monster-bark.js';
import {assetUrl} from './character-visual.js';
import {volcanoFootprintAllowed,volcanoStep,nearestVolcanoSpawn} from './volcano-contract.js';
import {facingOf,playerFrame} from './combat-contract.js';
import {applyPlayerContact} from './bobrozombi.js';

export const APARTMENT=Object.freeze({
 trigger:Object.freeze({x:1300,y:370,radius:185}),
 marlena:Object.freeze({x:1400,y:305}),
 bogdan:Object.freeze({x:1500,y:315}),
 exit:Object.freeze([{x:1350,y:330},{x:1250,y:400},{x:1150,y:440},{x:1030,y:470}])
});
export const MARLENA_BARKS=Object.freeze(['Mama miała rację!','Niech sam w tym smrodzie siedzi, pajac!']);
export const BOGDAN_HP=80;
export const BOGDAN_HIT_RADIUS=38;
export function bossRepositionVector(boss,player,now,phase=1){
 const dx=player.x-boss.x,dy=player.y-boss.y,d=Math.max(1,Math.hypot(dx,dy));
 const orbit=Math.sin(now/1100+phase)*.9,close=d>210?1:d<105?-.6:.22;
 return {x:(dx/d)*close-(dy/d)*orbit,y:(dy/d)*close+(dx/d)*orbit};
}
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
// Bounded deterministic A* on the decoded terrain footprint. Every traversed
// edge is swept by volcanoStep; a blocked waypoint is never a despawn event.
export function findMarlenaRoute(mask,from,to,{radius=14,cell=12,maxNodes=18000}={}){
 if(!mask||!volcanoFootprintAllowed(mask,from.x,from.y,radius))return null;
 const valid=(x,y)=>volcanoFootprintAllowed(mask,x,y,radius);
 const destination=valid(to.x,to.y)?to:null;
 if(!destination)return null;
 const key=(x,y)=>x+','+y,open=[],best=new Map(),closed=new Set();
 const start={x:Math.round(from.x/cell),y:Math.round(from.y/cell)};
 const goal={x:Math.round(to.x/cell),y:Math.round(to.y/cell)};
 const startKey=key(start.x,start.y),goalKey=key(goal.x,goal.y);
 const h=(x,y)=>Math.hypot(goal.x-x,goal.y-y);
 open.push({...start,g:0,f:h(start.x,start.y),parent:null});best.set(startKey,0);
 const steps=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 let visited=0;
 while(open.length&&visited++<maxNodes){
  open.sort((a,b)=>a.f-b.f||a.g-b.g||a.y-b.y||a.x-b.x);
  const node=open.shift(),id=key(node.x,node.y);
  if(closed.has(id))continue;
  closed.add(id);
  if(id===goalKey||Math.hypot(node.x*cell-to.x,node.y*cell-to.y)<=cell){
   const route=[{x:to.x,y:to.y}];let n=node;
   while(n?.parent){route.unshift({x:n.x*cell,y:n.y*cell});n=n.parent;}
   return route;
  }
  for(const [dx,dy] of steps){
   const x=node.x+dx,y=node.y+dy,k=key(x,y),px=x*cell,py=y*cell;
   if(closed.has(k)||!valid(px,py))continue;
   if(dx&&dy&&(!valid((node.x+dx)*cell,node.y*cell)||!valid(node.x*cell,(node.y+dy)*cell)))continue;
   const cost=node.g+Math.hypot(dx,dy);
   if(cost>=(best.get(k)??Infinity))continue;
   best.set(k,cost);open.push({x,y,g:cost,f:cost+h(x,y),parent:node});
  }
 }
 return null;
}
export function marlenaOffscreen(actor,camera,margin=90){
 const view=camera.worldView;
 return actor.x<view.x-margin||actor.x>view.right+margin||
        actor.y<view.y-margin||actor.y>view.bottom+margin;
}
export function createBogdanEncounter(scene,Phaser){
 let disposed=false,ready=false,failed=false,started=false,argumentDone=false,departing=false,
  departed=false,leftApartment=false,confrontation=false,active=false,defeated=false,attackIndex=0,attack=null,
  hp=BOGDAN_HP,lastHit=-Infinity,projectiles=[],actors=[],marlena=null,bogdan=null,defeatPending=false;
 const graphics=scene.add.graphics().setDepth(17);
 const bossLabel=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'16px',color:'#ffce85',
  stroke:'#281018',strokeThickness:4}).setOrigin(.5).setDepth(22).setVisible(false);
 const bossPresentation=createBossPresentationState();
 const bossHealth=scene.add.graphics().setDepth(23).setVisible(false);
 const bark=makeMonsterBark(scene,0,0);
 const bossBark=makeMonsterBark(scene,0,0);
 const bossBarkState=createBarkState();
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
    const desired=APARTMENT[key];
    const p=nearestVolcanoSpawn(scene.walkability,desired.x,desired.y,18,0,null,70);
    if(!p||!volcanoFootprintAllowed(scene.walkability,p.x,p.y,18)){
     console.warn('[Volcano Boss] invalid apartment NPC footprint: '+key);failed=true;return false;
    }
    if(actors.some(actor=>Math.hypot(actor.x-p.x,actor.y-p.y)<70)){
     console.warn('[Volcano Boss] apartment actors would overlap: '+key);failed=true;return false;
    }
    const actor=scene.add.sprite(p.x,p.y,textures[i],2).setOrigin(.5,1).setDepth(12).setScale(key==='bogdan'?.79:.72);
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
 let departureTick=null;
 function depart(){
  if(!started||departing||departed||!marlena||disposed)return false;
  departing=true;
  const destinations=[{x:1030,y:680},{x:940,y:760},{x:1080,y:820},{x:820,y:850}];
  let route=null,index=0,elapsed=0,barkIndex=0,stalled=0,retries=0,barkUntil=0;
  const showBark=()=>{
   if(barkIndex>=MARLENA_BARKS.length)return;
   bark.setText(MARLENA_BARKS[barkIndex++]).setVisible(true);
   barkUntil=elapsed+2200;
  };
  const reroute=()=>{
   route=null;index=0;
   for(let i=0;i<destinations.length;i++){
    const target=destinations[(retries+i)%destinations.length];
    const candidate=findMarlenaRoute(scene.walkability,marlena,target);
    if(candidate?.length){route=candidate;retries+=i+1;return true;}
   }
   console.warn('[Volcano Boss] no safe Marlena route to middle arena; NPC retained until offscreen');
   return false;
  };
  reroute();showBark();
  departureTick=dt=>{
   if(disposed||!departing||!marlena?.active)return;
   elapsed+=dt;
   if(elapsed>=2450&&barkIndex===1)showBark();
   // Story gate is independent of eventual offscreen removal and pathfinding.
   if(elapsed>=4750&&barkIndex===2)leftApartment=true;
   if(elapsed>=barkUntil)bark.setVisible(false);
   if(!route||index>=route.length){
    if(marlenaOffscreen(marlena,scene.cameras.main)){
     departing=false;departed=true;marlena.destroy();marlena=null;bark.setVisible(false);
    }else if(!route&&retries<8){retries++;reroute();}
    else if(index>=route?.length&&retries<8){retries++;reroute();}
    return;
   }
   const target=route[index],dx=target.x-marlena.x,dy=target.y-marlena.y,d=Math.hypot(dx,dy);
   if(d<7){index++;return;}
   const next=volcanoStep(marlena,{x:dx/d,y:dy/d},dt,145,14,scene.walkability);
   const moved=Math.hypot(next.x-marlena.x,next.y-marlena.y);
   if(moved<.1){
    stalled+=dt;
    if(stalled>=450){stalled=0;if(retries<8){retries++;reroute();}
     else console.warn('[Volcano Boss] Marlena path blocked after bounded alternate routing');}
    return;
   }
   stalled=0;
   marlena.setFrame(playerFrame(facingOf(next.x-marlena.x,next.y-marlena.y,'s'))).setPosition(next.x,next.y);
   marlena.setAngle(Math.sin(elapsed*.013)*1.6);
   bark.setPosition(marlena.x,marlena.y-105);
  };
  return true;
 }
 function beginConfrontation(){
  if(!leftApartment||!ready||confrontation||scene.defeated||scene.dialogueState.id)return false;
  confrontation=true;return true;
 }
 function activate(){
  if(!confrontation||active||disposed)return false;
  active=true;attack={mode:'recovery',remaining:900};
  clearBark(bossBarkState,bossBark);
  bossPresentation.activate();bossLabel.setVisible(true);bossHealth.setVisible(true);return true;
 }
 function showDamageNumber(amount){
  if(!bogdan?.active||disposed)return;
  const label=scene.add.text(bogdan.x,bogdan.y-145,'-'+amount,{
   fontFamily:'monospace',fontSize:'23px',fontStyle:'bold',color:'#ffe5a0',
   stroke:'#34130d',strokeThickness:4
  }).setOrigin(.5).setDepth(24);
  scene.tweens.add({targets:label,y:label.y-34,alpha:0,duration:620,
   onComplete:()=>label.destroy()});
 }
 function damage(amount,now){
  if(!active||defeated||now-lastHit<150)return false;
  lastHit=now;const applied=Math.min(hp,Math.max(0,amount));hp=Math.max(0,hp-applied);
  if(applied>0)showDamageNumber(applied);
  if(bogdan?.active){bogdan.setTintFill(0xffffff);scene.time.delayedCall(110,()=>{if(!disposed&&bogdan?.active)bogdan.clearTint();});}
  if(hp>0&&scene.finale?.state==='BOGDAN_ACTIVE'&&!scene.dialogueState.id)
   showMonsterBark(bossBark,bossBarkState,BOGDAN_BARKS.damage,now,{cooldown:5600});
  if(hp===0){
   defeated=true;active=false;attack=null;projectiles.length=0;graphics.clear();
   clearBark(bossBarkState,bossBark);
   defeatPending=true;bossPresentation.defeat();bossHealth.clear().setVisible(false);
   bossLabel.setText('BOGDAN POKONANY — '+hp+'/'+BOGDAN_HP);
  }
  return true;
 }
 function removeDefeatedSprite(){if(!defeated||!bogdan?.active)return false;bogdan.destroy();bogdan=null;bossLabel.setVisible(false);bossHealth.clear().setVisible(false);return true;}
 function consumeDefeat(){if(!defeatPending)return false;defeatPending=false;return true;}
 function hurtPlayer(now){
  if(scene.dialogueState.id||scene.defeated||scene.run.hp<=0)return;
  const contact=applyPlayerContact({hp:scene.run.hp,invulnerableUntil:scene.playerInvulnerableUntil??0},now);
  scene.run.hp=contact.hp;scene.playerInvulnerableUntil=contact.invulnerableUntil;
  if(scene.run.hp<=0)scene.lockDeath();
 }
 function update(dt,now){
  if(disposed||scene.defeated||scene.dialogueState.id)return;
  if(departing)departureTick?.(Math.min(50,dt));
  if(!active||defeated||!bogdan?.active){clearBark(bossBarkState,bossBark);return;}
  const delta=Math.min(50,dt),phase=bossPhase(hp),p=scene.player;
  graphics.clear();
  bossLabel.setPosition(bogdan.x,bogdan.y-120).setText('BOGDAN '+hp+'/'+BOGDAN_HP);
  bossHealth.clear().fillStyle(0x0e0b10,1).fillRoundedRect(bogdan.x-62,bogdan.y-105,124,13,3)
   .fillStyle(0xf04835,1).fillRect(bogdan.x-59,bogdan.y-102,118*bossHpRatio(hp,BOGDAN_HP),7)
   .lineStyle(3,0xffe8aa).strokeRoundedRect(bogdan.x-62,bogdan.y-105,124,13,3);
  syncMonsterBark(bossBark,bossBarkState,now,bogdan.x,bogdan.y-150,scene.finale?.state==='BOGDAN_ACTIVE');
  for(let i=projectiles.length-1;i>=0;i--){
   const shot=projectiles[i];shot.age+=delta;
   const nx=shot.x+shot.vx*delta/1000,ny=shot.y+shot.vy*delta/1000;
   if(shot.age>2600||!volcanoFootprintAllowed(scene.walkability,nx,ny,6,0)){projectiles.splice(i,1);continue;}
   shot.x=nx;shot.y=ny;
   graphics.fillStyle(0xff6a19).fillCircle(shot.x,shot.y,9);
   graphics.fillStyle(0xffe16b).fillCircle(shot.x,shot.y,4);
   if(Math.hypot(p.x-shot.x,p.y-shot.y)<22){hurtPlayer(now);projectiles.splice(i,1);}
  }
  if(attack.mode==='recovery'){
   const v=bossRepositionVector(bogdan,p,now,phase);
   const next=volcanoStep(bogdan,v,delta,phase===2?125:92,BOGDAN_HIT_RADIUS,scene.walkability);
   const mx=next.x-bogdan.x,my=next.y-bogdan.y;
   if(Math.hypot(mx,my)>.05)bogdan.setFrame(playerFrame(facingOf(mx,my,'s'))).setPosition(next.x,next.y);
  }
  attack.remaining-=delta;
  if(attack.mode==='recovery'){
   if(attack.remaining>0){
    if(Math.hypot(p.x-bogdan.x,p.y-bogdan.y)<250)
     showMonsterBark(bossBark,bossBarkState,BOGDAN_BARKS.pursuit,now,{cooldown:7000});
    return;
   }
   const type=bossAttackFor(attackIndex++,phase),angle=Math.atan2(p.y-bogdan.y,p.x-bogdan.x);
   showMonsterBark(bossBark,bossBarkState,type==='charge'?BOGDAN_BARKS.charge:BOGDAN_BARKS.pursuit,now,{cooldown:4400});
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
   const next=volcanoStep(bogdan,{x:Math.cos(attack.angle),y:Math.sin(attack.angle)},delta,410,BOGDAN_HIT_RADIUS,scene.walkability);
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
  disposed=true;bossPresentation.dispose();departureTick=null;projectiles.length=0;graphics.destroy();bossLabel.destroy();bossHealth.destroy();bark.destroy();bossBark.destroy();
  for(const actor of actors)if(actor.active)actor.destroy();
 });
 return {prepare,beginArgument,depart,beginConfrontation,activate,damage,update,consumeDefeat,removeDefeatedSprite,
  get ready(){return ready;},get failed(){return failed;},get argumentStarted(){return started;},
  get leftApartment(){return leftApartment;},get departed(){return departed;},get active(){return active;},get defeated(){return defeated;},
  get hp(){return hp;},get deathPoint(){return bogdan?.active?{x:bogdan.x,y:bogdan.y}:null;},get hitRadius(){return BOGDAN_HIT_RADIUS;},get hostileProjectileCount(){return projectiles.length;},get defeatPending(){return defeatPending;},get bogdan(){return bogdan;},get marlena(){return marlena;}};
}
