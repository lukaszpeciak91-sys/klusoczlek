import Phaser from 'phaser';
import {assetUrl} from './character-visual.js';
import {facingOf,playerFrame} from './combat-contract.js';
import {resolveObstaclePosition} from './obstacles.js';

export const CAPTAIN_SHEET=Object.freeze({path:'npcs/captain.png',width:1024,height:128,frameWidth:128,frameHeight:128,directions:['e','se','s','sw','w','nw','n','ne']});
export const CAPTAIN_VISUAL_SCALE=0.75;
export const CAPTAIN_ARRIVAL_MS=800;

// One session-level asset request; no world actor exists until the cinematic.
export function createCaptainArrival(scene){
  let actor=null,art=null,shadow=null,elapsed=0,from=null,to=null,arrived=false,disposed=false;
  let loadStatus='pending',frameSize=CAPTAIN_SHEET.frameWidth,selectedAppearance=false;
  const key='npc-captain';
  const loading=(async()=>{
    try{
      if(!scene.textures.exists(key)){
        const response=await fetch(assetUrl(import.meta.env.BASE_URL,CAPTAIN_SHEET.path),{cache:'no-cache'});
        if(!response.ok)throw Error('PNG HTTP '+response.status);
        const bytes=new Uint8Array(await response.arrayBuffer());
        const n=i=>(bytes[i]*16777216+bytes[i+1]*65536+bytes[i+2]*256+bytes[i+3])>>>0;
        if(bytes.length<26||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||
          n(16)!==n(20)*8||n(20)<64||bytes[24]!==8||![2,6].includes(bytes[25]))
          throw Error('expected eight horizontal square Captain frames');
        frameSize=n(20);
        const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        try{
          const img=new Image();
          await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('PNG decode failed'));img.src=url;});
          if(disposed)return;
          if(!scene.textures.exists(key))scene.textures.addSpriteSheet(key,img,{frameWidth:frameSize,frameHeight:frameSize});
        }finally{URL.revokeObjectURL(url);}
      }else frameSize=scene.textures.get(key).source[0].height;
      if(disposed)return;
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      loadStatus='ready';
    }catch(error){
      if(!disposed){loadStatus='failed';console.warn('[Captain] PNG fallback:',error.message);}
    }
  })();

  const visiblePoint=(x,y)=>{const v=scene.cameras.main.worldView;return x>=v.x+32&&x<=v.right-32&&y>=v.y+48&&y<=v.bottom-32;};
  const safe=(x,y)=>{const p=resolveObstaclePosition({x,y},{x,y},26,scene.obstacles);return Math.hypot(p.x-x,p.y-y)<2&&visiblePoint(x,y);};
  function start(){
    if(actor||disposed)return false;
    const p=scene.player;
    const options=[{x:112,y:45},{x:-112,y:45},{x:112,y:-35},{x:-112,y:-35},{x:0,y:110}];
    const target=options.map(o=>({x:p.x+o.x*.58,y:p.y+o.y*.58})).find(o=>safe(o.x,o.y));
    const initial=options.map(o=>({x:p.x+o.x,y:p.y+o.y})).find(o=>safe(o.x,o.y)&&target&&Math.hypot(o.x-target.x,o.y-target.y)>25);
    from=initial||target||{x:p.x+58,y:p.y+35};to=target||from;elapsed=0;arrived=false;
    actor=scene.add.container(from.x,from.y).setDepth(11);
    // Ground shadow is independent of sprite bob/sway; actor world coordinates stay unchanged.
    shadow=scene.add.ellipse(0,1,38,10,0x241b16,0.24);
    actor.add(shadow);
    selectedAppearance=loadStatus==='ready';
    if(selectedAppearance){
      art=scene.add.sprite(0,-frameSize*CAPTAIN_VISUAL_SCALE/2,key,playerFrame(facingOf(to.x-from.x,to.y-from.y,'s')))
        .setScale(CAPTAIN_VISUAL_SCALE).setOrigin(.5);
      actor.add(art);
    }else{
      // Chosen once, under the black fade: no mid-scene replacement.
      const body=scene.add.rectangle(0,-24,39,53,0x456e83).setStrokeStyle(2,0xbfa477);
      const head=scene.add.circle(0,-61,17,0xe6b38a).setStrokeStyle(2,0x4e3c30);
      const cap=scene.add.rectangle(0,-79,38,11,0xe6e2cb);
      actor.add([body,head,cap]);
      if(loadStatus==='pending')console.warn('[Captain] PNG still pending at arrival; using stable fallback');
    }
    return true;
  }
  function update(delta){
    if(!actor||arrived)return Boolean(actor&&arrived);
    const previous=elapsed;
    elapsed=Math.min(CAPTAIN_ARRIVAL_MS,elapsed+Math.max(0,Math.min(50,delta)));
    const t=elapsed/CAPTAIN_ARRIVAL_MS;
    actor.setPosition(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t);
    if(art){
      const dx=to.x-from.x,dy=to.y-from.y,moving=Math.hypot(dx,dy)>1&&elapsed>previous&&t<1;
      const facing=moving?facingOf(dx,dy,'s'):facingOf(scene.player.x-actor.x,scene.player.y-actor.y,'s');
      art.setFrame(playerFrame(facing));
      // Distance-driven footfall: no walking in place, neutral on the final frame.
      const traveled=Math.hypot(dx,dy)*t;
      const weight=moving?Math.sin(Math.PI*t):0;
      art.setRotation(Math.sin(traveled/6)*0.035*weight)
        .setY(-frameSize*CAPTAIN_VISUAL_SCALE/2-Math.abs(Math.sin(traveled/8))*1.7*weight);
    }
    if(t>=1){arrived=true;if(art){art.setRotation(0).setY(-frameSize*CAPTAIN_VISUAL_SCALE/2);art.setFrame(playerFrame(facingOf(scene.player.x-actor.x,scene.player.y-actor.y,'s')));}}
    return arrived;
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{disposed=true;actor?.destroy();actor=null;art=null;shadow=null;});
  return {loading,start,update,get actor(){return actor;},get sprite(){return art;},get arrived(){return arrived;},get loadStatus(){return loadStatus;},get selectedAppearance(){return selectedAppearance;}};
}
