import {assetUrl,validPngHeader} from './character-visual.js';
import {bobrozombiFrame} from './enemy-visual.js';
import {FACINGS} from './combat-contract.js';
import {MARCIN_ASSET,MARCIN_VISUAL_SCALE,MARCIN_FEET_OFFSET} from './marcin-visual.js';
export {MARCIN_ASSET,MARCIN_VISUAL_SCALE,MARCIN_FEET_OFFSET} from './marcin-visual.js';
import {makeFeedback,hitActive} from './combat-feedback.js';
// Approved optional sheet with unchanged procedural fallback. No texture edits.
// Feet=(0,0); body-aligned damage union is declared in enemy-damage.js.
export function createMarcinRenderer(scene,Phaser){
 const containers=new Set();let alive=true,ready=false,failed=false;
 const attach=c=>{
  if(!alive||!ready||!c.active||c.getData('marcin-art'))return;
  const art=scene.add.sprite(0,MARCIN_FEET_OFFSET,MARCIN_ASSET.key,c.getData('marcin-frame')??2).setOrigin(0.5).setScale(MARCIN_VISUAL_SCALE);
  c.add(art);c.setData('marcin-art',art);c.getData('body').setVisible(false);
 };
 const create=(x,y)=>{
  const c=scene.add.container(x,y).setDepth(9),g=scene.add.graphics();c.add(g);
  g.fillStyle(0x252019).fillEllipse(0,8,91,24);
  g.fillStyle(0x3f362a).fillRoundedRect(-42,-11,31,36,8).fillRoundedRect(11,-11,31,36,8);
  g.fillStyle(0x33271e).fillEllipse(-27,-48,88,89).fillEllipse(27,-48,88,89);
  g.fillStyle(0x806446).fillEllipse(0,-30,114,92);
  g.fillStyle(0x5e4835).fillCircle(0,-87,31).fillCircle(-27,-103,12).fillCircle(27,-103,12);
  g.fillStyle(0xa28761).fillEllipse(0,-77,46,30);
  g.fillStyle(0xefdcad).fillRect(-17,-82,14,17).fillRect(3,-82,14,17);
  g.fillStyle(0xdc4644).fillCircle(-13,-96,5).fillCircle(13,-96,5);
  c.setData('feedback',makeFeedback());c.setData('body',g);c.setData('marcin-frame',2);
  containers.add(c);c.once('destroy',()=>containers.delete(c));attach(c);return c;
 };
 const update=(e,player)=>{
  e.sprite.setPosition(e.x,e.y);
  const warning=e.attack?.phase==='warning';
  const flash=warning?0.65+0.35*Math.sin(e.attack.elapsed/50):hitActive(e.sprite.getData('feedback'),scene.time.now)?0.55:1;
  const frame=bobrozombiFrame(e.x,e.y,player.x,player.y,e.facing||'s');e.facing=FACINGS[frame];
  e.sprite.setData('marcin-frame',frame);
  const art=e.sprite.getData('marcin-art');
  if(art?.active)art.setFrame(frame).setAlpha(flash);
  else e.sprite.getData('body').setAlpha(flash);
 };
 const damagePoseOf=e=>{
  const art=e.sprite.getData('marcin-art');
  return art?.active?{art:true,x:e.sprite.x+art.x,y:e.sprite.y+art.y,angle:art.rotation,scale:art.scaleX,frame:Number(art.frame.name)}:null;
 };
 const shutdown=()=>{alive=false;containers.clear();};scene.events.once('shutdown',shutdown);
 const loading=(async()=>{
  try{
   const texture=scene.textures,asset=MARCIN_ASSET;
   if(!texture.exists(asset.key)){
    const response=await fetch(assetUrl(import.meta.env.BASE_URL,asset.path),{cache:'no-cache'});
    if(!response.ok)throw Error('PNG HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!validPngHeader(bytes,asset))throw Error('expected2048x256 8-bit RGBA PNG');
    const local=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    try{
     const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=local;});
     if(image.naturalWidth!==asset.width||image.naturalHeight!==asset.height)throw Error('decoded PNG dimensions mismatch');
     if(!alive)return;
     if(!texture.exists(asset.key))texture.addSpriteSheet(asset.key,image,{frameWidth:256,frameHeight:256});
    }finally{URL.revokeObjectURL(local);}
   }
   if(!alive)return;
   texture.get(asset.key).setFilter(Phaser.Textures.FilterMode.NEAREST);ready=true;for(const c of containers)attach(c);
  }catch(error){failed=true;if(alive)console.info('[marcin] procedural fallback:',String(error));}
 })();
 return {create,update,damagePoseOf,loading,feedbackOf:e=>e.sprite.getData('feedback'),shutdown,get loaded(){return ready;},get fallback(){return failed;}};
}
