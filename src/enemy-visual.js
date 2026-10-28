import { FACINGS, facingOf } from './combat-contract.js';
import { assetUrl, validPngHeader } from './character-visual.js';

export const BOBROZOMBI_ASSET=Object.freeze({path:'enemies/bobrozombi.png',key:'enemy-bobrozombi-v2',width:768,height:96,frameWidth:96,frameHeight:96});
export const BOBROZOMBI_VISUAL_SCALE=0.75;
export const BOBROZOMBI_FEET_OFFSET=-13;
export function bobrozombiFrame(x,y,playerX,playerY,lastFacing='s'){
  return FACINGS.indexOf(facingOf(playerX-x,playerY-y,lastFacing));
}
export function createBobrozombiRenderer(scene,Phaser){
  const containers=new Set();
  let alive=true,ready=false,failed=false;
  const texture=scene.textures;
  const attach=container=>{
    if(!alive||!container.active||!ready||container.getData('bobrozombi-art'))return;
    const image=scene.add.sprite(0,BOBROZOMBI_FEET_OFFSET,BOBROZOMBI_ASSET.key,container.getData('bobrozombi-facing')??2)
      .setOrigin(0.5).setScale(BOBROZOMBI_VISUAL_SCALE);
    container.add(image);
    container.setData('bobrozombi-art',image);
    for(const child of container.list)if(child!==image)child.setVisible(false);
  };
  const create=(x,y)=>{
    const container=scene.add.container(x,y).setDepth(9);
    container.add(scene.add.ellipse(0,0,42,37,0x745a44).setStrokeStyle(3,0x211b18));
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
    enemy.sprite.setData('bobrozombi-facing',facing);
    const art=enemy.sprite.getData('bobrozombi-art');
    if(art?.active)art.setFrame(facing);
  };
  const shutdown=()=>{alive=false;containers.clear();};
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,shutdown);
  // One request per Arena session, independent of individual enemy spawns.
  const loading=(async()=>{
    try{
      if(!texture.exists(BOBROZOMBI_ASSET.key)){
        const uri=assetUrl(import.meta.env.BASE_URL,BOBROZOMBI_ASSET.path);
        const response=await fetch(uri,{cache:'no-cache'});
        if(!response.ok)throw Error('PNG HTTP '+response.status);
        const bytes=new Uint8Array(await response.arrayBuffer());
        if(!validPngHeader(bytes,BOBROZOMBI_ASSET))throw Error('expected 768x96 8-bit RGBA PNG');
        const local=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        try{
          const image=new Image();
          await new Promise((resolve,reject)=>{
            image.onload=resolve;
            image.onerror=()=>reject(Error('PNG decode failed'));
            image.src=local;
          });
          if(image.naturalWidth!==768||image.naturalHeight!==96)throw Error('decoded PNG dimensions mismatch');
          if(!alive)return;
          if(!texture.exists(BOBROZOMBI_ASSET.key))
            texture.addSpriteSheet(BOBROZOMBI_ASSET.key,image,{frameWidth:96,frameHeight:96});
        }finally{URL.revokeObjectURL(local);}
      }
      if(!alive)return;
      texture.get(BOBROZOMBI_ASSET.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      ready=true;
      for(const c of containers)attach(c);
    }catch(error){
      failed=true;
      if(alive)console.info('[Bobrozombi] procedural fallback:',error.message);
    }
  })();
  return {create,update,shutdown,loading,get loaded(){return ready;},get fallback(){return failed;}};
}
