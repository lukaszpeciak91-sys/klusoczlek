import { playerFrame } from './combat-contract.js';
import { PLAYER_VARIANTS, DEFAULT_PLAYER_VARIANT, LEGACY_PLAYER, PLAYER_SHEET, playerVariant } from './player-variants.js';

export const VISUAL_MOTION=Object.freeze({enabled:true,swayDegrees:2.5,bobPixels:1.5,hertz:2.2,blendRate:9});
export const PLAYER_VISUAL_SCALE=1.30;
export const CONTACT_SHADOW=Object.freeze({width:35,height:12,fill:0x241b16,alpha:0.24,offsetY:17,depth:10});
export const PLAYER_ART_KEY=LEGACY_PLAYER.key;
const PLAYER_ART=PLAYER_SHEET;
export const PLAYER_ART_PATH=LEGACY_PLAYER.path;
export function assetUrl(base,path){return base.replace(/\/?$/,'/')+'assets/'+path;}
export function validPngHeader(data,asset=PLAYER_ART){
 const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
 if(bytes.length<26)return false;
 const signature=[137,80,78,71,13,10,26,10];
 if(!signature.every((b,i)=>bytes[i]===b))return false;
 const read32=i=>((bytes[i]*16777216)+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3])>>>0;
 return read32(16)===asset.width&&read32(20)===asset.height&&bytes[24]===8&&bytes[25]===6;
}
export function visualMotion(seconds,moving,blend=0,options=VISUAL_MOTION){
 const weight=options.enabled?Math.max(0,Math.min(1,blend+(Number(moving)-blend)*Math.min(1,seconds.delta*options.blendRate))):0;
 const phase=seconds.elapsed*2*Math.PI*options.hertz;
 return {blend:weight,angle:Math.sin(phase)*options.swayDegrees*Math.PI/180*weight,
 bob:Math.sin(phase*2)*options.bobPixels*weight};
}
export function visualPosition(player,bob=0){return {x:player.x,y:player.y+bob};}
export function shadowPosition(player){return {x:player.x,y:player.y+CONTACT_SHADOW.offsetY};}
export function createPlayerVisual(scene,player,indicator,Phaser){
 let shadow=null,sprite=null,alive=true,elapsed=0,blend=0,requested=DEFAULT_PLAYER_VARIANT,applied=null,requestId=0;
 let lastFacing='s';
 const inFlight=new Map();
 const texture=scene.textures;
 async function ensureTexture(def){
  if(texture.exists(def.key))return def.key;
  if(inFlight.has(def.key))return inFlight.get(def.key);
  const promise=(async()=>{
   const uri=assetUrl(import.meta.env.BASE_URL,def.path);
   const response=await fetch(uri,{cache:'no-cache'});
   if(!response.ok)throw Error('image HTTP '+response.status);
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(!validPngHeader(bytes))throw Error('expected 512x64 8-bit RGBA PNG');
   const blob=new Blob([bytes],{type:'image/png'}),local=URL.createObjectURL(blob);
   try{
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('PNG decode failed'));image.src=local;});
    if(image.naturalWidth!==PLAYER_ART.width||image.naturalHeight!==PLAYER_ART.height)throw Error('decoded size mismatch');
    if(!alive)return null;
    if(!texture.exists(def.key))texture.addSpriteSheet(def.key,image,{frameWidth:64,frameHeight:64});
    return def.key;
   }finally{URL.revokeObjectURL(local);}
  })();
  inFlight.set(def.key,promise);
  try{return await promise;}finally{inFlight.delete(def.key);}
 }
 async function select(id){
  playerVariant(id); // Validate before changing the requested appearance.
  requested=id;
  const current=++requestId;
  let key=null;
  try{key=await ensureTexture(PLAYER_VARIANTS[id]);}
  catch(error){if(alive&&current===requestId)console.info('[Aloes] variant fallback:',error.message);}
  if(!alive||current!==requestId)return;
  if(!key){
   try{key=await ensureTexture(LEGACY_PLAYER);}
   catch(error){if(alive&&current===requestId)console.info('[Aloes] procedural fallback:',error.message);}
  }
  if(!alive||current!==requestId||!key)return;
  if(sprite?.active){sprite.setTexture(key,playerFrame(lastFacing));}
  else{
   sprite=scene.add.sprite(player.x,player.y,key,playerFrame(lastFacing)).setOrigin(0.5).setDepth(11);
   sprite.setScale(PLAYER_VISUAL_SCALE);
   const p=shadowPosition(player);
   shadow=scene.add.ellipse(p.x,p.y,CONTACT_SHADOW.width,CONTACT_SHADOW.height,CONTACT_SHADOW.fill,CONTACT_SHADOW.alpha).setDepth(CONTACT_SHADOW.depth);
  }
  sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  player.setVisible(false);indicator.setVisible(false);
  applied=key===LEGACY_PLAYER.key?'legacy':id;
 }
 // Start with the approved flamethrower appearance; legacy artwork remains the fallback.
 void select(DEFAULT_PLAYER_VARIANT);
 function update(facing,moving,deltaMs){
  lastFacing=facing;
  if(!sprite||!sprite.active)return;
  elapsed+=deltaMs/1000;
  const motion=visualMotion({delta:Math.min(deltaMs/1000,0.05),elapsed},moving,blend);
  blend=motion.blend;
  const p=visualPosition(player,motion.bob);
  sprite.setPosition(p.x,p.y).setRotation(motion.angle).setFrame(playerFrame(facing));
  if(shadow?.active){const at=shadowPosition(player);shadow.setPosition(at.x,at.y);}
 }
 function destroy(){alive=false;requestId++;if(sprite){sprite.destroy();sprite=null;}if(shadow){shadow.destroy();shadow=null;}player.setVisible(true);indicator.setVisible(true);}
 return {update,destroy,setVariant:select,get requestedVariant(){return requested;},get appliedVariant(){return applied;},get sprite(){return sprite;},get shadow(){return shadow;},get loaded(){return Boolean(sprite?.active);}};
}