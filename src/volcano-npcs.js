import {assetUrl} from './character-visual.js';
import {nearestVolcanoSpawn,volcanoFootprintAllowed} from './volcano-contract.js';

// White X in the approved 1536x1024 overview: about (284,205).
// Convert to the existing 1800x1200 world, without changing terrain art.
export const FAIRY_MARK=Object.freeze({x:333,y:240});
export const FAIRY_TRIGGER_RADIUS=112;
export const FAIRY_DEPARTURE_MS=1300;
const SHEETS=Object.freeze({
 'lawostworek-1':Object.freeze({path:'enemies/lawostworek-1.png',width:768,height:96,frame:96,scale:.75}),
 'lawostworek-2':Object.freeze({path:'enemies/lawostworek-2.png',width:1024,height:128,frame:128,scale:.68}),
 'swinia-wrozka':Object.freeze({path:'npcs/swinia-wrozka.png',frame:null,scale:.78})
});
export function fairyTrigger(player,position=FAIRY_MARK,radius=FAIRY_TRIGGER_RADIUS){
 return Math.hypot(player.x-position.x,player.y-position.y)<=radius;
}
// A bounded connected-component search prevents crossing lava into another island.
export function findFairyIslandSpawn(mask,mark=FAIRY_MARK,radius=14,maxDistance=180){
 if(!mask)return null;
 const w=mask.width,h=mask.height,seedX=Math.round(mark.x),seedY=Math.round(mark.y);
 const validCenter=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&mask.pixels[y*w+x]===1;
 if(!validCenter(seedX,seedY))return null;
 if(volcanoFootprintAllowed(mask,seedX,seedY,radius))return {x:seedX,y:seedY};
 const queue=[[seedX,seedY]],seen=new Set([seedY*w+seedX]);
 let best=null,bestDistance=Infinity;
 for(let i=0;i<queue.length;i++){
  const [x,y]=queue[i],distance=Math.hypot(x-mark.x,y-mark.y);
  if(distance>maxDistance)continue;
  if(distance<bestDistance&&volcanoFootprintAllowed(mask,x,y,radius)){
   best={x,y};bestDistance=distance;
  }
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const nx=x+dx,ny=y+dy,id=ny*w+nx;
   if(!validCenter(nx,ny)||seen.has(id)||Math.hypot(nx-mark.x,ny-mark.y)>maxDistance)continue;
   seen.add(id);queue.push([nx,ny]);
  }
 }
 return best;
}
export function createNpcReadiness(){
 let state='pending',movement=false,started=false;
 return {
  requestMovement(){movement=true;return this.consume();},
  resolve(ready){state=ready?'ready':'failed';return this.consume();},
  consume(){if(started||!movement||state==='pending')return null;started=true;return state;},
  get state(){return state;},get started(){return started;},get movement(){return movement;}
 };
}
export function createVolcanoNpcs(scene,Phaser){
 let disposed=false,placing=null,lawos=[],fairy=null,departing=false,departed=false,lawosReady=false;
 const actors=[];
 async function load(key){
  const def=SHEETS[key],texture='volcano-npc-'+key;
  if(scene.textures.exists(texture))return {texture,frame:scene.textures.get(texture).source[0].height};
  const response=await fetch(assetUrl(import.meta.env.BASE_URL,def.path),{cache:'no-cache'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const n=i=>((bytes[i]*16777216)+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3])>>>0;
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||
   bytes[24]!==8||![2,6].includes(bytes[25])||
   n(16)!==8*n(20)||n(20)<64||
   (def.width&&(n(16)!==def.width||n(20)!==def.height)))
   throw Error('invalid 8-direction horizontal spritesheet');
  const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
  try{
   const image=new Image();
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
   if(disposed)return null;
   if(!scene.textures.exists(texture))scene.textures.addSpriteSheet(texture,image,{frameWidth:n(20),frameHeight:n(20)});
   scene.textures.get(texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
   return {texture,frame:n(20)};
  }finally{URL.revokeObjectURL(url);}
 }
 function spawn(key,position){
  const def=SHEETS[key];
  return load(key).then(info=>{
   if(!info||disposed)return null;
   const actor=scene.add.container(position.x,position.y).setDepth(12);
   const sprite=scene.add.sprite(0,0,info.texture,2).setOrigin(.5,1).setScale(def.scale);
   actor.add(sprite);
   actors.push(actor);
   return {actor,sprite,position};
  }).catch(error=>{if(!disposed)console.warn('[Volcano NPC] '+key+': '+error.message);return null;});
 }
 function place(){
  if(placing)return placing;
  placing=placeOnce();return placing;
 }
 async function placeOnce(){
  if(disposed||!scene.walkability)return false;
  const mask=scene.walkability,p=scene.player;
  const spots=[{x:p.x+92,y:p.y-78},{x:p.x+150,y:p.y-76}];
  const results=await Promise.all([
   ...spots.map((spot,i)=>{
    const at=nearestVolcanoSpawn(mask,spot.x,spot.y,16,0,null,80);
    return at?spawn(i===0?'lawostworek-1':'lawostworek-2',at):Promise.resolve(null);
   }),
   (()=>{
    // Keep the fairy on the marked upper-left platform; never relocate far away.
    const at=findFairyIslandSpawn(mask);
    if(!at)console.warn('[Volcano NPC] Świnia-Wróżka: no valid spawn on marked upper-left island at (333,240)');
    return at?spawn('swinia-wrozka',at):Promise.resolve(null);
   })()
  ]);
  if(disposed)return false;
  lawos=results.slice(0,2).filter(Boolean);
  lawosReady=lawos.length===2&&lawos.every(n=>n.actor.active&&n.sprite.active&&n.actor.visible);
  if(!lawosReady)console.warn('[Volcano NPC] Lawostworki unavailable: skipping dialogue safely');
  fairy=results[2];
  if(fairy){
   fairy.actor.setVisible(true);
   fairy.idle=scene.tweens.add({targets:fairy.sprite,y:-5,rotation:.035,scaleX:SHEETS['swinia-wrozka'].scale*1.025,
    scaleY:SHEETS['swinia-wrozka'].scale*1.025,duration:900,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
  }
  return lawosReady;
 }
 function finishLawos(){
  for(const npc of lawos)npc.actor.destroy();
  lawos=[];
 }
 function departFairy(){
  if(!fairy||departing||departed)return false;
  departing=true;
  fairy.idle?.stop();
  fairy.sprite.setY(0).setRotation(0).setScale(SHEETS['swinia-wrozka'].scale);
  scene.tweens.add({targets:fairy.actor,y:fairy.actor.y-180,scale:.75,alpha:0,
   duration:FAIRY_DEPARTURE_MS,ease:'Cubic.easeIn',
   onComplete:()=>{fairy?.actor.destroy();fairy=null;departing=false;departed=true;}});
  return true;
 }
 scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
  disposed=true;
  for(const actor of actors){scene.tweens.killTweensOf(actor);for(const child of actor.list)scene.tweens.killTweensOf(child);if(actor.active)actor.destroy();}
  lawos=[];fairy=null;
 });
 return {place,finishLawos,departFairy,get lawosReady(){return lawosReady;},get fairy(){return fairy;},get lawos(){return lawos;},
  get departed(){return departed;},get departing(){return departing;}};
}
