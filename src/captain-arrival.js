import Phaser from 'phaser';
import {assetUrl} from './character-visual.js';
import {playerFrame} from './combat-contract.js';
import {resolveObstaclePosition} from './obstacles.js';

export const CAPTAIN_SHEET=Object.freeze({path:'npcs/captain.png',width:768,height:96,frameWidth:96,frameHeight:96,directions:['e','se','s','sw','w','nw','n','ne']});
export function createCaptainArrival(scene){
  let actor=null,elapsed=0,from=null,to=null,arrived=false,disposed=false;
  const visiblePoint=(x,y)=>{const v=scene.cameras.main.worldView;return x>=v.x+32&&x<=v.right-32&&y>=v.y+48&&y<=v.bottom-32;};
  const safe=(x,y)=>{const p=resolveObstaclePosition({x,y},{x,y},26,scene.obstacles);return Math.hypot(p.x-x,p.y-y)<2&&visiblePoint(x,y);};
  function start(){
    if(actor||disposed)return false;
    const p=scene.player;
    const options=[{x:-112,y:55},{x:112,y:55},{x:-112,y:-35},{x:112,y:-35},{x:0,y:110}];
    const target=options.map(o=>({x:p.x+o.x*.58,y:p.y+o.y*.58})).find(o=>safe(o.x,o.y));
    const initial=options.map(o=>({x:p.x+o.x,y:p.y+o.y})).find(o=>safe(o.x,o.y)&&target&&Math.hypot(o.x-target.x,o.y-target.y)>25);
    const point=initial||target||{x:p.x+58,y:p.y+35};
    from=point;to=target||point;elapsed=0;arrived=false;
    actor=scene.add.container(point.x,point.y).setDepth(11);
    const body=scene.add.rectangle(0,-24,39,53,0x456e83).setStrokeStyle(2,0xbfa477);
    const head=scene.add.circle(0,-61,17,0xe6b38a).setStrokeStyle(2,0x4e3c30);
    const cap=scene.add.rectangle(0,-79,38,11,0xe6e2cb);
    const label=scene.add.text(0,8,'KAPITAN',{fontFamily:'monospace',fontSize:'10px',color:'#f4e6d0'}).setOrigin(.5);
    actor.add([body,head,cap,label]);
    void (async()=>{
      try{
        const res=await fetch(assetUrl(import.meta.env.BASE_URL,CAPTAIN_SHEET.path),{cache:'no-cache'});
        if(!res.ok)throw Error('missing Captain sheet');
        const bytes=new Uint8Array(await res.arrayBuffer());
        const n=i=>(bytes[i]*16777216+bytes[i+1]*65536+bytes[i+2]*256+bytes[i+3])>>>0;
        if(bytes.length<26||!([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))||n(16)!==768||n(20)!==96||bytes[24]!==8||bytes[25]!==6)throw Error('invalid Captain sheet');
        const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        try{
          const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
          if(disposed||!actor?.active)return;
          const key='npc-captain';
          if(!scene.textures.exists(key))scene.textures.addSpriteSheet(key,img,{frameWidth:96,frameHeight:96});
          scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
          const facing=to.x<scene.player.x?'e':'w';
          const sprite=scene.add.sprite(0,-43,key,playerFrame(facing)).setOrigin(.5);
          actor.addAt(sprite,0);for(const part of [body,head,cap,label])part.setVisible(false);
        }finally{URL.revokeObjectURL(url);}
      }catch{/* Visible fallback actor remains. */}
    })();
    return true;
  }
  function update(delta){
    if(!actor||arrived)return Boolean(actor&&arrived);
    elapsed=Math.min(800,elapsed+Math.max(0,Math.min(50,delta)));
    const t=elapsed/800;
    actor.setPosition(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t);
    if(t>=1)arrived=true;
    return arrived;
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{disposed=true;actor?.destroy();actor=null;});
  return {start,update,get actor(){return actor;},get arrived(){return arrived;}};
}
