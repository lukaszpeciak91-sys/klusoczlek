import { playerFrame } from './combat-contract.js';
import { assetManifest } from './asset-manifest.js';

export const VISUAL_MOTION=Object.freeze({enabled:true,swayDegrees:2.5,bobPixels:1.5,hertz:2.2,blendRate:9});
export const PLAYER_VISUAL_SCALE=1.30;
export const CONTACT_SHADOW=Object.freeze({width:35,height:12,fill:0x241b16,alpha:0.24,offsetY:17,depth:10});
export const PLAYER_ART_KEY='aloes-eight-directions';
const PLAYER_ART=assetManifest.find(a=>a.id==='player');
export const PLAYER_ART_PATH=PLAYER_ART.path;
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
 let shadow=null,sprite=null,alive=true,elapsed=0,blend=0;
 const texture=scene.textures;
 async function load(){
  const uri=assetUrl(import.meta.env.BASE_URL,PLAYER_ART_PATH);
  try{
   if(!texture.exists(PLAYER_ART_KEY)){
    const response=await fetch(uri,{cache:'no-cache'});
    if(!response.ok)throw Error('image HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!validPngHeader(bytes))throw Error('expected 512x64 8-bit RGBA PNG');
    const image=new Image();
    image.decoding='async';
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('PNG decode failed'));image.src=uri;});
    if(!alive)return;
    if(image.naturalWidth!==PLAYER_ART.width||image.naturalHeight!==PLAYER_ART.height)throw Error('decoded image dimensions mismatch');
    texture.addSpriteSheet(PLAYER_ART_KEY,image,{frameWidth:64,frameHeight:64});
   }
   if(!alive)return;
   sprite=scene.add.sprite(player.x,player.y,PLAYER_ART_KEY,playerFrame('s')).setOrigin(0.5).setDepth(11);
   sprite.setScale(PLAYER_VISUAL_SCALE);
   const shadowAt=shadowPosition(player);
   shadow=scene.add.ellipse(shadowAt.x,shadowAt.y,CONTACT_SHADOW.width,CONTACT_SHADOW.height,CONTACT_SHADOW.fill,CONTACT_SHADOW.alpha).setDepth(CONTACT_SHADOW.depth);
   sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
   player.setVisible(false);indicator.setVisible(false);
  }catch(err){if(alive)console.info('[Aloes] procedural fallback:',err.message);}
 }
 // The source remains a plain HTML Image; no bytes are written to repository or disk.
 load();
 function update(facing,moving,deltaMs){
  if(!sprite||!sprite.active)return;
  elapsed+=deltaMs/1000;
  const motion=visualMotion({delta:Math.min(deltaMs/1000,0.05),elapsed},moving,blend);
  blend=motion.blend;
  const p=visualPosition(player,motion.bob);
  sprite.setPosition(p.x,p.y).setRotation(motion.angle).setFrame(playerFrame(facing));
  if(shadow?.active){const at=shadowPosition(player);shadow.setPosition(at.x,at.y);}
 }
 function destroy(){alive=false;if(sprite){sprite.destroy();sprite=null;}if(shadow){shadow.destroy();shadow=null;}player.setVisible(true);indicator.setVisible(true);}
 return {update,destroy,get sprite(){return sprite;},get shadow(){return shadow;},get loaded(){return Boolean(sprite?.active);}};
}