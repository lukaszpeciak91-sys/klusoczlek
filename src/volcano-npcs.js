import Phaser from 'phaser';
import {assetUrl} from './character-visual.js';
import {nearestVolcanoSpawn} from './volcano-contract.js';

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
export function createVolcanoNpcs(scene){
 let disposed=false,lawos=[],fairy=null,departing=false,departed=false;
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
 async function place(){
  if(disposed||!scene.walkability)return;
  const mask=scene.walkability,p=scene.player;
  const spots=[{x:p.x+92,y:p.y-78},{x:p.x+150,y:p.y-76}];
  const results=await Promise.all([
   ...spots.map((spot,i)=>{
    const at=nearestVolcanoSpawn(mask,spot.x,spot.y,16,0,null,80);
    return at?spawn(i===0?'lawostworek-1':'lawostworek-2',at):Promise.resolve(null);
   }),
   (()=>{
    // Keep the fairy on the marked upper-left platform; never relocate far away.
    const at=nearestVolcanoSpawn(mask,FAIRY_MARK.x,FAIRY_MARK.y,14,0,null,50);
    return at?spawn('swinia-wrozka',at):Promise.resolve(null);
   })()
  ]);
  if(disposed)return;
  lawos=results.slice(0,2).filter(Boolean);
  fairy=results[2];
  if(fairy){
   fairy.actor.setVisible(true);
   fairy.idle=scene.tweens.add({targets:fairy.sprite,y:-5,rotation:.035,scaleX:SHEETS['swinia-wrozka'].scale*1.025,
    scaleY:SHEETS['swinia-wrozka'].scale*1.025,duration:900,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
  }
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
  for(const actor of actors)if(actor.active)actor.destroy();
  lawos=[];fairy=null;
 });
 return {place,finishLawos,departFairy,get fairy(){return fairy;},get lawos(){return lawos;},
  get departed(){return departed;},get departing(){return departing;}};
}
