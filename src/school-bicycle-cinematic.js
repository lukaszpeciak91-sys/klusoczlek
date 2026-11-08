import {assetUrl} from './character-visual.js';

// This is the exact approved image contract, not an animation engine.
// Phaser owns frames, playback time, repeats and completion events.
export const ACT4_BICYCLE_CINEMATIC=Object.freeze({
  path:'player/act4-aloes-bicycle.png',
  textureKey:'act4-aloes-bicycle-cinematic',
  animationKey:'act4-aloes-bicycle-three-cycles',
  width:3072,height:1296,frameWidth:768,frameHeight:432,
  columns:4,rows:3,frames:12,frameRate:12,repeat:2,durationMs:3000
});

export function validAct4BicycleSheet(bytes){
  const c=ACT4_BICYCLE_CINEMATIC;
  const signature=[137,80,78,71,13,10,26,10];
  if(!bytes||bytes.length<45||!signature.every((b,i)=>bytes[i]===b))return false;
  const uint32=i=>(bytes[i]*16777216+bytes[i+1]*65536+bytes[i+2]*256+bytes[i+3])>>>0;
  if(uint32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR'||
    uint32(16)!==c.width||uint32(20)!==c.height||
    bytes[24]!==8||bytes[25]!==6||bytes[26]!==0||bytes[27]!==0||bytes[28]!==0||
    c.frameWidth*c.columns!==c.width||c.frameHeight*c.rows!==c.height)return false;
  let offset=8,hasData=false,finished=false;
  while(offset+12<=bytes.length){
    const length=uint32(offset);
    if(length>bytes.length-offset-12)return false;
    const name=String.fromCharCode(...bytes.slice(offset+4,offset+8));
    if(name==='IDAT')hasData=true;
    if(name==='IEND'){finished=true;break;}
    offset+=length+12;
  }
  return hasData&&finished;
}

export function fitAct4BicycleFrame(width,height){
  const c=ACT4_BICYCLE_CINEMATIC;
  const factor=Math.min(Math.max(1,width)/c.frameWidth,Math.max(1,height)/c.frameHeight);
  return {x:width/2,y:height/2,width:c.frameWidth*factor,height:c.frameHeight*factor};
}

export function createSchoolBicycleCinematic(scene,Phaser){
  const c=ACT4_BICYCLE_CINEMATIC;
  let disposed=false,ready=false,started=false,playing=false,cycles=0,completed=false;
  let backdrop=null,sprite=null;
  const controller=new AbortController();
  const loading=(async()=>{
    try{
      if(!scene.textures.exists(c.textureKey)){
        const response=await fetch(assetUrl(import.meta.env.BASE_URL,c.path),
          {cache:'no-cache',signal:controller.signal});
        if(!response.ok)throw Error('PNG HTTP '+response.status);
        const bytes=new Uint8Array(await response.arrayBuffer());
        if(!validAct4BicycleSheet(bytes))throw Error('invalid approved 3072x1296 RGBA8 sheet');
        const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        try{
          const image=new Image();
          await new Promise((resolve,reject)=>{
            image.onload=resolve;image.onerror=()=>reject(Error('PNG decode failed'));image.src=url;
          });
          if(disposed)return false;
          if(image.naturalWidth!==c.width||image.naturalHeight!==c.height)
            throw Error('decoded sheet geometry mismatch');
          if(!scene.textures.exists(c.textureKey))
            scene.textures.addSpriteSheet(c.textureKey,image,{
              frameWidth:c.frameWidth,frameHeight:c.frameHeight,margin:0,spacing:0
            });
        }finally{URL.revokeObjectURL(url);}
      }
      if(disposed)return false;
      const texture=scene.textures.get(c.textureKey);
      if(!Array.from({length:c.frames},(_,i)=>texture.has(String(i))).every(Boolean))
        throw Error('missing approved directional cinematic frames');
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      ready=true;return true;
    }catch(error){
      if(!disposed&&!controller.signal.aborted)
        console.info('[School] Bicycle cinematic unavailable, using fade-only fallback:',error.message);
      return false;
    }
  })();

  function resize(){
    if(!backdrop||!sprite)return;
    backdrop.setSize(scene.scale.width,scene.scale.height);
    const fit=fitAct4BicycleFrame(scene.scale.width,scene.scale.height);
    sprite.setPosition(fit.x,fit.y).setDisplaySize(fit.width,fit.height);
  }
  function show(){
    if(disposed||!ready||started)return false;
    started=true;
    // Opaque black behind the approved 16:9 frame is the only letterboxing.
    // Both objects are screen-fixed and cover the paused schoolyard/HUD.
    backdrop=scene.add.rectangle(0,0,scene.scale.width,scene.scale.height,0x000000,1)
      .setOrigin(0).setScrollFactor(0).setDepth(300);
    sprite=scene.add.sprite(0,0,c.textureKey,0)
      .setScrollFactor(0).setDepth(301);
    resize();
    return true;
  }
  function play(onComplete){
    if(disposed||!sprite?.active||playing||completed)return false;
    if(!scene.anims.exists(c.animationKey))
      scene.anims.create({key:c.animationKey,
        frames:scene.anims.generateFrameNumbers(c.textureKey,{start:0,end:11}),
        frameRate:c.frameRate,repeat:c.repeat});
    cycles=1;playing=true;
    sprite.on(Phaser.Animations.Events.ANIMATION_REPEAT,()=>{cycles++;});
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE,()=>{
      if(disposed||completed)return;
      completed=true;playing=false;
      onComplete?.();
    });
    sprite.play(c.animationKey);
    return true;
  }
  function hide(){
    if(sprite){
      sprite.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
      sprite.removeAllListeners(Phaser.Animations.Events.ANIMATION_REPEAT);
      sprite.anims.stop();sprite.destroy();sprite=null;
    }
    backdrop?.destroy();backdrop=null;playing=false;
  }
  function destroy(){
    if(disposed)return;
    disposed=true;controller.abort();hide();
  }
  return {loading,show,play,resize,hide,destroy,
    get ready(){return ready;},get started(){return started;},
    get playing(){return playing;},get cycles(){return cycles;},
    get completed(){return completed;},get sprite(){return sprite;},
    get backdrop(){return backdrop;}};
}
