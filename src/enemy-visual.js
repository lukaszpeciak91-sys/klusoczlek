import { FACINGS, facingOf } from './combat-contract.js';
import { assetUrl, validPngHeader } from './character-visual.js';

export const BOBROZOMBI_ASSET=Object.freeze({path:'enemies/bobrozombi.png',key:'enemy-bobrozombi-v2',width:768,height:96,frameWidth:96,frameHeight:96});
export const BOBROZOMBI_VISUAL_SCALE=0.75;
export const BOCIANOLAK_ASSET=Object.freeze({path:'enemies/bocianolak.png',key:'enemy-bocianolak-v1',width:1024,height:160,frameWidth:128,frameHeight:160});
export const BOCIANOLAK_VISUAL_SCALE=0.65;
export const BOCIANOLAK_FEET_OFFSET=-47;
export const BOBROZOMBI_FEET_OFFSET=-13;
export function bobrozombiFrame(x,y,playerX,playerY,lastFacing='s'){
  return FACINGS.indexOf(facingOf(playerX-x,playerY-y,lastFacing));
}
export function createBobrozombiRenderer(scene,Phaser){return createEnemyRenderer(scene,Phaser,'bobrozombi');}
export function createBocianolakRenderer(scene,Phaser){return createEnemyRenderer(scene,Phaser,'bocianolak');}
function createEnemyRenderer(scene,Phaser,type){
  const stork=type==='bocianolak';
  const asset=stork?BOCIANOLAK_ASSET:BOBROZOMBI_ASSET;
  const scale=stork?BOCIANOLAK_VISUAL_SCALE:BOBROZOMBI_VISUAL_SCALE;
  const offset=stork?BOCIANOLAK_FEET_OFFSET:BOBROZOMBI_FEET_OFFSET;
  const artKey=type+'-art',facingKey=type+'-facing';
  const containers=new Set();
  let alive=true,ready=false,failed=false;
  const texture=scene.textures;
  const attach=container=>{
    if(!alive||!container.active||!ready||container.getData(artKey))return;
    const image=scene.add.sprite(0,offset,asset.key,container.getData(facingKey)??2)
      .setOrigin(0.5).setScale(scale);
    container.add(image);
    container.setData(artKey,image);
    for(const child of container.list)if(child!==image)child.setVisible(false);
  };
  const create=(x,y)=>{
    const container=scene.add.container(x,y).setDepth(9);
    container.add(scene.add.ellipse(0,0,stork?30:42,stork?54:37,stork?0xd8d3be:0x745a44).setStrokeStyle(3,0x211b18));
    container.add(scene.add.rectangle(-11,-2,13,7,0xf1ddac));
    container.add(scene.add.rectangle(11,-2,13,7,0xf1ddac));
    container.add(scene.add.circle(-8,-9,4,0xe64b48));
    container.add(scene.add.circle(8,-9,4,0xe64b48));
    containers.add(container);
    container.once(Phaser.GameObjects.Events.DESTROY,()=>containers.delete(container));
    attach(container);
    return container;
  };
  const update=(enemy,player)=>{
    const facing=bobrozombiFrame(enemy.x,enemy.y,player.x,player.y,enemy.facing||'s');
    enemy.facing=FACINGS[facing];
    enemy.sprite.setPosition(enemy.x,enemy.y);
    enemy.sprite.setData(facingKey,facing);
    const art=enemy.sprite.getData(artKey);
    if(art?.active)art.setFrame(facing);
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
  return {create,update,shutdown,loading,get loaded(){return ready;},get fallback(){return failed;}};
}
