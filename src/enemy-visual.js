import {makeFeedback,pose,hitActive} from './combat-feedback.js';
import {createEnemyGait,advanceEnemyGait} from './enemy-motion.js';
import { FACINGS, facingOf } from './combat-contract.js';
import { assetUrl, validPngHeader } from './character-visual.js';

export const BOBROZOMBI_ASSET=Object.freeze({path:'enemies/bobrozombi.png',key:'enemy-bobrozombi-v2',width:768,height:96,frameWidth:96,frameHeight:96});
export const BOBROZOMBI_VISUAL_SCALE=0.75;
export const BOCIANOLAK_ASSET=Object.freeze({path:'enemies/bocianolak.png',key:'enemy-bocianolak-v1',width:1024,height:160,frameWidth:128,frameHeight:160});
export const BOCIANOLAK_VISUAL_SCALE=0.65;
export const BOCIANOLAK_FEET_OFFSET=-47;
export const BOBROZOMBI_FEET_OFFSET=-13;
export const ZUBROKRYPTYDA_ASSET=Object.freeze({path:'enemies/zubrokryptyda.png',key:'enemy-zubrokryptyda-v2',width:1536,height:192,frameWidth:192,frameHeight:192});
export const ZUBROKRYPTYDA_VISUAL_SCALE=0.55;
// (184-96)*0.55 => 48.4 pixels above sprite-frame center.
export const ZUBROKRYPTYDA_FEET_OFFSET=-48.4;
export function bobrozombiFrame(x,y,playerX,playerY,lastFacing='s'){
  return FACINGS.indexOf(facingOf(playerX-x,playerY-y,lastFacing));
}
export function createBobrozombiRenderer(scene,Phaser){return createEnemyRenderer(scene,Phaser,'bobrozombi');}
export function createBocianolakRenderer(scene,Phaser){return createEnemyRenderer(scene,Phaser,'bocianolak');}
export function createZubrokryptydaRenderer(scene,Phaser){return createEnemyRenderer(scene,Phaser,'zubrokryptyda');}
function createEnemyRenderer(scene,Phaser,type){
  const stork=type==='bocianolak',heavy=type==='zubrokryptyda';
  const asset=heavy?ZUBROKRYPTYDA_ASSET:stork?BOCIANOLAK_ASSET:BOBROZOMBI_ASSET;
  const scale=heavy?ZUBROKRYPTYDA_VISUAL_SCALE:stork?BOCIANOLAK_VISUAL_SCALE:BOBROZOMBI_VISUAL_SCALE;
  const offset=heavy?ZUBROKRYPTYDA_FEET_OFFSET:stork?BOCIANOLAK_FEET_OFFSET:BOBROZOMBI_FEET_OFFSET;
  const artKey=type+'-art',facingKey=type+'-facing',gaitKey=type+'-gait',feedbackKey=type+'-feedback';
  const containers=new Set();
  let alive=true,ready=false,failed=false;
  const texture=scene.textures;
  const attach=container=>{
    if(!alive||!container.active||!ready||container.getData(artKey))return;
    const image=scene.add.sprite(0,offset,asset.key,container.getData(facingKey)??2)
      .setOrigin(0.5).setScale(scale);
    container.add(image);
    container.setData(artKey,image);
    const gait=container.getData(gaitKey);
    if(gait)image.setRotation(gait.rotation).setPosition(-Math.sin(gait.rotation)*offset,offset*Math.cos(gait.rotation)+gait.bob);
    for(const child of container.list)if(child!==image)child.setVisible(false);
  };
  const create=(x,y)=>{
    const container=scene.add.container(x,y).setDepth(9);
    if(heavy){
      // Distinctive massive horned beast, present even without optional approved PNG.
      container.add(scene.add.ellipse(0,-27,98,69,0x554833).setStrokeStyle(4,0x292923));
      container.add(scene.add.ellipse(0,-51,67,49,0x6d5c41).setStrokeStyle(3,0x30291f));
      container.add(scene.add.triangle(-39,-71,-59,-87,-34,-66,-18,-79,0xd9c7a0));
      container.add(scene.add.triangle(39,-71,18,-79,34,-66,59,-87,0xd9c7a0));
      container.add(scene.add.ellipse(0,-42,31,25,0x907959));
      container.add(scene.add.circle(-15,-57,4,0xe8b46e));
      container.add(scene.add.circle(15,-57,4,0xe8b46e));
      container.add(scene.add.rectangle(-28,10,15,33,0x392f25));
      container.add(scene.add.rectangle(28,10,15,33,0x392f25));
    }else if(stork){
      // Small visible stork silhouette remains playable when the approved PNG is absent.
      container.add(scene.add.ellipse(0,-13,23,40,0xe4e0d3).setStrokeStyle(2,0x343137));
      container.add(scene.add.ellipse(0,-39,16,26,0xf2ead6).setStrokeStyle(2,0x343137));
      container.add(scene.add.triangle(1,-37,4,-4,35,0,4,4,0xc45135).setRotation(0));
      container.add(scene.add.ellipse(-19,-14,16,10,0x323038));
      container.add(scene.add.ellipse(19,-14,16,10,0x323038));
      container.add(scene.add.rectangle(-5,18,4,31,0xb94936));
      container.add(scene.add.rectangle(5,18,4,31,0xb94936));
      container.add(scene.add.circle(3,-44,2,0x201b19));
    }else{
      container.add(scene.add.ellipse(0,0,42,37,0x745a44).setStrokeStyle(3,0x211b18));
      container.add(scene.add.rectangle(-11,-2,13,7,0xf1ddac));
      container.add(scene.add.rectangle(11,-2,13,7,0xf1ddac));
      container.add(scene.add.circle(-8,-9,4,0xe64b48));
      container.add(scene.add.circle(8,-9,4,0xe64b48));
    }
    container.setData('fallback-bases',container.list.map(child=>({child,x:child.x,y:child.y,rotation:child.rotation})));
    container.setData(feedbackKey,makeFeedback());
    containers.add(container);
    container.once(Phaser.GameObjects.Events.DESTROY,()=>containers.delete(container));
    attach(container);
    return container;
  };
  const update=(enemy,player,distance=0,seconds=0)=>{
    const direction=enemy.fleeFacingVector;
    const facing=direction?(Math.hypot(direction.x,direction.y)>0.4?FACINGS.indexOf(facingOf(direction.x,direction.y,enemy.facing||'s')):FACINGS.indexOf(enemy.facing||'s')):bobrozombiFrame(enemy.x,enemy.y,player.x,player.y,enemy.facing||'s');
    enemy.facing=FACINGS[facing];
    enemy.sprite.setPosition(enemy.x,enemy.y);
    enemy.sprite.setData(facingKey,facing);
    const art=enemy.sprite.getData(artKey);
    const feedback=enemy.sprite.getData(feedbackKey);
    const fx=pose(feedback,type,scene.time.now);
    if(art?.active){
      art.setFrame(facing);
      art.setTint(hitActive(feedback,scene.time.now)?0xff5a5a:0xffffff);
      let gait=enemy.sprite.getData(gaitKey);
      if(!gait){gait=createEnemyGait(type,enemy.seed);enemy.sprite.setData(gaitKey,gait);}
      advanceEnemyGait(gait,type,distance,seconds);
      // Counter-rotate the sprite center so its feet stay at the container anchor.
      art.setRotation(gait.rotation+fx.angle).setPosition(-Math.sin(gait.rotation)*offset+fx.x,offset*Math.cos(gait.rotation)+gait.bob+fx.y);
    }else{
      // Fallback parts keep stable local coordinates; offset the whole visual only,
      // never its world collision/container position.
      for(const base of enemy.sprite.getData('fallback-bases')||[]){
        if(!base.child.active)continue;
        base.child.setPosition(base.x+fx.x,base.y+fx.y).setRotation(base.rotation+fx.angle)
          .setAlpha(hitActive(feedback,scene.time.now)?0.7:1);
      }
    }
  };
  const feedbackOf=enemy=>enemy.sprite.getData(feedbackKey);
  const damagePoseOf=enemy=>{
    const art=enemy.sprite.getData(artKey);
    if(art?.active)return {art:true,x:enemy.sprite.x+art.x,y:enemy.sprite.y+art.y,angle:art.rotation,scale:art.scaleX};
    const fx=pose(enemy.sprite.getData(feedbackKey),type,scene.time.now);
    return {art:false,x:enemy.x+fx.x,y:enemy.y+fx.y};
  };
  const shutdown=()=>{alive=false;containers.clear();};
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,shutdown);
  // One request per Arena session, independent of individual enemy spawns.
  const loading=(async()=>{
    try{
      if(!texture.exists(asset.key)){
        const uri=assetUrl(import.meta.env.BASE_URL,asset.path);
        const response=await fetch(uri,{cache:'no-cache'});
        if(!response.ok)throw Error('PNG HTTP '+response.status);
        const bytes=new Uint8Array(await response.arrayBuffer());
        if(!validPngHeader(bytes,asset))throw Error('expected '+asset.width+'x'+asset.height+' 8-bit RGBA PNG');
        const local=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        try{
          const image=new Image();
          await new Promise((resolve,reject)=>{
            image.onload=resolve;
            image.onerror=()=>reject(Error('PNG decode failed'));
            image.src=local;
          });
          if(image.naturalWidth!==asset.width||image.naturalHeight!==asset.height)throw Error('decoded PNG dimensions mismatch');
          if(!alive)return;
          if(!texture.exists(asset.key))
            texture.addSpriteSheet(asset.key,image,{frameWidth:asset.frameWidth,frameHeight:asset.frameHeight});
        }finally{URL.revokeObjectURL(local);}
      }
      if(!alive)return;
      texture.get(asset.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      ready=true;
      for(const c of containers)attach(c);
    }catch(error){
      failed=true;
      if(alive)console.info('['+type+'] procedural fallback:',error.message);
    }
  })();
  return {create,update,feedbackOf,damagePoseOf,shutdown,loading,get loaded(){return ready;},get fallback(){return failed;}};
}
