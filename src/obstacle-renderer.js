import {assetUrl,validPngHeader} from './character-visual.js';
import {FOREST_ATLAS,OBSTACLE_ART,obstacleArt} from './forest-obstacle-art.js';
export {FOREST_ATLAS,OBSTACLE_ART,obstacleArt} from './forest-obstacle-art.js';
const renderers=new WeakMap();
export function obstacleAtlasRenderer(scene){
 if(renderers.has(scene))return renderers.get(scene);
 const containers=new Set(),controller=new AbortController();let alive=true,loaded=false,failed=false;
 const attach=c=>{
  if(!alive||!loaded||!c.active||c.getData('atlasSprite'))return;
  const a=c.getData('obstacleArt');
  const image=scene.add.image(0,a.offsetY,FOREST_ATLAS.key,a.frame).setOrigin(a.anchor.x/256,a.anchor.y/256).setScale(a.scale);
  if(a.upright)image.setPosition(Math.sin(c.rotation)*a.offsetY,Math.cos(c.rotation)*a.offsetY).setRotation(-c.rotation);
  c.add(image);c.setData('atlasSprite',image);c.getData('fallback').setVisible(false);
 };
 const create=o=>{
  const c=scene.add.container(o.x,o.y).setRotation(o.angle).setDepth(4),fallback=createObstacleFallback(scene,o);
  fallback.setPosition(0,0).setRotation(0);c.add(fallback);
  c.setData('fallback',fallback);c.setData('obstacleArt',obstacleArt(o));c.setData('obstacleAsset',o.render.asset);
  containers.add(c);c.once('destroy',()=>containers.delete(c));attach(c);return c;
 };
 const shutdown=()=>{alive=false;controller.abort();containers.clear();renderers.delete(scene);};scene.events.once('shutdown',shutdown);
 const loading=(async()=>{
  const asset=FOREST_ATLAS,texture=scene.textures;
  try{
   if(!texture.exists(asset.key)){
    const response=await fetch(assetUrl(import.meta.env.BASE_URL,asset.path),{cache:'no-cache',signal:controller.signal});
    if(!response.ok)throw Error('PNG HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());if(!validPngHeader(bytes,asset))throw Error('expected1024x768 RGBA8 atlas');
    const local=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    try{
     const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=local;});
     if(!alive)return;
     if(image.naturalWidth!==1024||image.naturalHeight!==768)throw Error('decoded atlas size mismatch');
     if(!texture.exists(asset.key))texture.addSpriteSheet(asset.key,image,{frameWidth:256,frameHeight:256,margin:0,spacing:0});
    }finally{URL.revokeObjectURL(local);}
   }
   if(!alive)return;
   texture.get(asset.key).setFilter(1); // Phaser.Textures.FilterMode.NEAREST
   loaded=true;for(const c of containers)attach(c);
  }catch(error){failed=true;if(alive)console.info('[forest atlas] visible procedural fallback:',String(error));}
 })();
 const renderer={create,loading,get loaded(){return loaded;},get failed(){return failed;},get count(){return containers.size;}};
 renderers.set(scene,renderer);return renderer;
}
export function createObstacleVisual(scene,obstacle){return obstacleAtlasRenderer(scene).create(obstacle);}

// Visible procedural fallback. Local (0,0) is the authoritative footprint
// center; production art metadata never changes this geometry.
export function createObstacleFallback(scene,obstacle){
 const s=obstacle.footprint,type=obstacle.type;
 const g=scene.add.graphics().setPosition(s.x,s.y).setRotation(s.angle).setDepth(4);
 const colors={rock:0x777b77,stump:0x987142,fallen_log:0x795434,bush:0x3e6038,toxic_barrel:0x94733c,toi_toi:0x447b7b,tire_pile:0x3d4140,broken_wheelbarrow:0x976044};
 g.fillStyle(colors[type],1).lineStyle(2,0x263022,1);
 if(s.shape==='circle'){g.fillCircle(0,0,s.radius);g.strokeCircle(0,0,s.radius);}
 if(s.shape==='capsule'){
  const h=s.length/2-s.radius;
  g.fillRoundedRect(-s.length/2,-s.radius,s.length,2*s.radius,s.radius);
  g.strokeRoundedRect(-s.length/2,-s.radius,s.length,2*s.radius,s.radius);
  if(type==='fallen_log'){
   g.lineStyle(2,0xb99a65).strokeCircle(-h,0,s.radius*.7).strokeCircle(h,0,s.radius*.7);
   g.lineStyle(2,0x493723).lineBetween(-h,-s.radius*.5,h,-s.radius*.5).lineBetween(-h,s.radius*.5,h,s.radius*.5);
  }else if(type==='bush'){
   g.fillStyle(0x587944).fillCircle(-h,0,s.radius*.65).fillCircle(h,0,s.radius*.65);
  }
 }
 if(s.shape==='box'){
  g.fillRect(-s.width/2,-s.height/2,s.width,s.height).strokeRect(-s.width/2,-s.height/2,s.width,s.height);
  g.lineStyle(2,0xabc5a9).strokeRect(-s.width*.32,-s.height*.35,s.width*.64,s.height*.7);
  g.fillStyle(0xe2d9a4).fillCircle(s.width*.2,0,2);
  g.lineStyle(3,0x253f42).lineBetween(-s.width*.3,-s.height*.23,s.width*.3,-s.height*.23);
 }
 if(type==='stump'){
  g.lineStyle(2,0xc7a26c).strokeCircle(0,0,s.radius*.7).strokeCircle(1,0,s.radius*.35);
  g.lineStyle(2,0x594426).lineBetween(0,0,s.radius*.65,s.radius*.4);
 }
 if(type==='rock'){
  g.fillStyle(0x989c90).fillTriangle(-s.radius*.6,-s.radius*.3,s.radius*.1,-s.radius*.8,s.radius*.5,s.radius*.15);
  g.lineStyle(2,0x53594f).lineBetween(-s.radius*.6,s.radius*.4,s.radius*.55,s.radius*.2);
 }
 if(type==='bush'&&s.shape==='circle')g.fillStyle(0x638149).fillCircle(-s.radius*.3,-s.radius*.25,s.radius*.45).fillCircle(s.radius*.3,s.radius*.15,s.radius*.4);
 if(type==='toxic_barrel'){
  g.lineStyle(4,0x534932).lineBetween(-18,-10,18,-10).lineBetween(-18,10,18,10);
  g.fillStyle(0xcbd254).fillTriangle(0,-8,8,7,-8,7);
  g.lineStyle(2,0x2e3924).lineBetween(0,-4,0,2).lineBetween(0,4,0,5);
 }
 // Always visible until the optional atlas has been validated and attached.
 g.setData('obstacleAsset',obstacle.render.asset);
 return g;
}
