import { assetManifest } from './asset-manifest.js';
import { assetUrl } from './character-visual.js';

export const GROUND_KEY='klusoczlek-arena-ground';
const ground=assetManifest.find(a=>a.id==='terrain_ground');
export function isApprovedGroundPng(data) {
 const b=data instanceof Uint8Array?data:new Uint8Array(data);
 if(b.length<29||![137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return false;
 const u32=i=>((b[i]*16777216)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3])>>>0;
 return u32(16)===ground.width&&u32(20)===ground.height&&b[24]===8&&[2,6].includes(b[25]);
}
export function groundTextureUrl(base){return assetUrl(base,ground.path);}
export function createArenaGround(scene,width,height,Phaser,colors){
 const fallback=()=>{
  scene.ground=scene.add.rectangle(width/2,height/2,width,height,0x283c32)
   .setStrokeStyle(6,colors.border).setDepth(-20);
  scene.groundGrid=scene.add.grid(width/2,height/2,width-8,height-8,50,50,0x283c32,1,0x415746,0.36).setDepth(-19);
 };
 let disposed=false;
 scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{disposed=true;});
 // Visible fallback exists immediately until validated image is ready.
 fallback();
 async function load(){
  try {
   if(!scene.textures.exists(GROUND_KEY)){
    const response=await fetch(groundTextureUrl(import.meta.env.BASE_URL),{cache:'no-cache'});
    if(!response.ok)throw Error('ground HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!isApprovedGroundPng(bytes))throw Error('ground PNG must be 1024x1024 opaque-compatible RGB/RGBA');
    const blob=new Blob([bytes],{type:'image/png'});
    const objectUrl=URL.createObjectURL(blob);
    const image=new Image();
    try {
     await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('ground PNG decode failed'));image.src=objectUrl;});
     if(image.naturalWidth!==ground.width||image.naturalHeight!==ground.height)throw Error('decoded ground size mismatch');
     if(disposed)return;
     scene.textures.addImage(GROUND_KEY,image);
    } finally {URL.revokeObjectURL(objectUrl);}
   }
   if(disposed)return;
   const tiled=scene.add.tileSprite(0,0,width,height,GROUND_KEY)
    .setOrigin(0,0).setDepth(-20);
   // No scaling or tilePosition updates: world-space repeat at 1024px.
   scene.ground.destroy();scene.groundGrid.destroy();
   scene.ground=tiled;scene.groundGrid=null;
  } catch(error){if(!disposed)console.info('[Arena ground] procedural fallback:',error.message);}
 }
 load();
}
