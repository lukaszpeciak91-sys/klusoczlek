// ActTitle-only preparation. Validated decoded textures are installed directly
// in Phaser's shared cache; scene-specific loaders consequently reuse them.
// Do not include later-act or finale art when opening an earlier act.
import {assetUrl,validPngHeader} from './character-visual.js';
import {PLAYER_VARIANTS,LEGACY_PLAYER} from './player-variants.js';
import {BOBROZOMBI_ASSET,BOCIANOLAK_ASSET,ZUBROKRYPTYDA_ASSET,BLAZEJ_ASSET} from './enemy-visual.js';
import {FOREST_ATLAS} from './forest-obstacle-art.js';
import {CAPTAIN_SHEET} from './captain-sheet-contract.js';
import {AIRSHIP_LAYERS} from './airship-contract.js';
import {GLIDER_ART_KEY,GLIDER_ART_PATH} from './glider-delivery.js';
import {GLIDER_FRAME_SIZE,GLIDER_SHEET_WIDTH,GLIDER_SHEET_HEIGHT} from './glider-spritesheet.js';
import {VOLCANO_ASSETS,validVolcanoPng,createVolcanoWalkability,nearestVolcanoSpawn,VOLCANO_START} from './volcano-contract.js';
import {SCHOOL_ART,validSchoolyardBackground} from './schoolyard-art.js';
import {HP_FACE_ASSETS} from './hp-face-hud.js';
import {DIALOGUES} from './dialogue-data.js';
import {PLAYER_RADIUS} from './movement.js';

export const ACT_TITLE_MIN_MS=1900;
export const REQUIRED_ASSET_TIMEOUT_MS=10000;
const players=Object.values(PLAYER_VARIANTS).map(v=>({...v,width:512,height:64,frameWidth:64,frameHeight:64}));
const legacy={...LEGACY_PLAYER,width:512,height:64,frameWidth:64,frameHeight:64};
const portraits={
 act1:['before-wave-1','before-first-bocianolak','before-first-zubrokryptyda','after-final-enemy','act1-captain','before-marcin','after-first-bocianolak-hit'],
 act2:['act2-opening','act2-finale'],
 act3:['act3-opening','act3-lawostworki','act3-apartment-argument','act3-bogdan-confrontation','act3-swinia-wrozka','act3-bogdan-final','act3-eruption-warning','act3-captain-extraction'],
 act4:['act4-captain-opening','act4-maciek-seba','act4-blazej-observer','act4-blazej-confrontation','act4-blazej-final','act4-chapel-ending']
};
export function actPortraitKeys(actId){
 return [...new Set((portraits[actId]??[]).flatMap(id=>(DIALOGUES[id]??[]).map(line=>line[0])))].filter(key=>key!=='chapel');
}
export function scenePortraitKeys(sceneKey){
 return actPortraitKeys(({Arena:'act1',Airship:'act2',Volcano:'act3',School:'act4'})[sceneKey]);
}
const asAsset=(v,required=true)=>({...v,required});
const portrait=key=>asAsset({path:'dialogue/dialogue-'+key+'.png',key:'dialogue-'+key,width:192,height:192},false);
const hp=()=>asAsset({path:HP_FACE_ASSETS[0].path,key:'aloes-hud-hp_5',width:128,height:128},false);
const enemy=def=>asAsset(def);
const player=variant=>asAsset(variant??players[0]);
const captain=()=>asAsset({...CAPTAIN_SHEET,key:'npc-captain'},false);
const atlas=()=>asAsset(FOREST_ATLAS,false);
const shared=()=>[player(players[0]),hp()];
const actorSheet=(path,key,width,height,frameWidth,frameHeight,required=false)=>
 asAsset({path,key,width,height,frameWidth,frameHeight},required);

export function actRequiredAssets(actId){
 const common=shared(),first=actPortraitKeys(actId).map(portrait);
 switch(actId){
  case 'act1':return [...common,enemy(BOBROZOMBI_ASSET),enemy(BOCIANOLAK_ASSET),enemy(ZUBROKRYPTYDA_ASSET),
    atlas(),...first];
  case 'act2':return [...common,...AIRSHIP_LAYERS.map(v=>asAsset({path:v.path,key:'airship-approved-'+v.id},true)),
    asAsset({path:'arenas/airship-deck.png',key:'airship-deck-approved'},true),
    asAsset({path:'obstacles/airship-wheelhouse.png',key:'airship-wheelhouse-approved'},true),
    asAsset({path:'obstacles/airship-paddlewheel.png',key:'airship-paddlewheel-approved'},false),
    actorSheet(GLIDER_ART_PATH,GLIDER_ART_KEY,GLIDER_SHEET_WIDTH,GLIDER_SHEET_HEIGHT,GLIDER_FRAME_SIZE,GLIDER_FRAME_SIZE),
    enemy(BOBROZOMBI_ASSET),enemy(BOCIANOLAK_ASSET),captain(),...first];
  case 'act3':return [...common,
    asAsset({...VOLCANO_ASSETS.terrain,key:'volcano-production-terrain',collision:true},true),
    asAsset({...VOLCANO_ASSETS.lava,key:'volcano-production-lava'},true),
    player(players.find(p=>p.key==='aloes-flamethrower')),
    actorSheet('enemies/lawostworek-1.png','lawostworek-1',768,96,96,96,true),
    actorSheet('enemies/lawostworek-2.png','lawostworek-2',1024,128,128,128,true),
    actorSheet('enemies/lawostworek-1.png','volcano-npc-lawostworek-1',768,96,96,96,false),
    actorSheet('enemies/lawostworek-2.png','volcano-npc-lawostworek-2',1024,128,128,128,false),
    actorSheet('enemies/bogdan.png','volcano-apartment-bogdan',1024,160,128,160,false),
    actorSheet('npcs/marlena.png','volcano-apartment-marlena',1024,160,128,160,false),
    actorSheet('npcs/swinia-wrozka.png','volcano-npc-swinia-wrozka',256,256,256,256,false),
    captain(),...first];
  case 'act4':return [...common,...Object.entries(SCHOOL_ART).map(([id,v])=>
    asAsset({path:v.path,key:v.key,width:id==='background'?1800:(v.sourceWidth??v.width),
      height:id==='background'?1200:(v.sourceHeight??v.height),schoolBackground:id==='background'},true)),
    enemy(BOBROZOMBI_ASSET),enemy(BOCIANOLAK_ASSET),enemy(ZUBROKRYPTYDA_ASSET),
    enemy(BLAZEJ_ASSET),captain(),atlas(),...first];
  default:return [];
 }
}
const sessions=new WeakMap();
function session(game){
 let current=sessions.get(game);
 if(!current){current={inFlight:new Map(),masks:new Map(),failures:new Map()};sessions.set(game,current);}
 return current;
}
export function preparedVolcanoMask(game){return session(game).masks.get('act3')??null;}
export function actLoadStatus(game,actId){return session(game).failures.get(actId)??null;}
export function isRequiredCollisionFailure(failures){return failures.some(f=>f.collision);}
export function validProductionAsset(bytes,def){
 if(def.collision)return validVolcanoPng(bytes,VOLCANO_ASSETS.terrain);
 if(def.key==='volcano-production-lava')return validVolcanoPng(bytes,VOLCANO_ASSETS.lava);
 if(def.schoolBackground)return validSchoolyardBackground(bytes);
 if(!bytes||bytes.length<33||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return false;
 const n=i=>(bytes[i]*16777216+bytes[i+1]*65536+bytes[i+2]*256+bytes[i+3])>>>0;
 if(n(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')return false;
 if(bytes[24]!==8||![2,6].includes(bytes[25])||bytes[26]!==0||bytes[27]!==0||bytes[28]!==0)return false;
 if(def.width&&n(16)!==def.width||def.height&&n(20)!==def.height)return false;
 return def.frameWidth? n(16)%def.frameWidth===0&&n(20)%def.frameHeight===0:true;
}
function decodeImage(bytes,signal){
 const objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
 return new Promise((resolve,reject)=>{
  const img=new Image();
  const cleanup=()=>{img.onload=null;img.onerror=null;URL.revokeObjectURL(objectUrl);};
  const abort=()=>{img.src='';cleanup();reject(Error('image preparation aborted'));};
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  img.onload=()=>{signal?.removeEventListener('abort',abort);cleanup();resolve(img);};
  img.onerror=()=>{signal?.removeEventListener('abort',abort);cleanup();reject(Error('PNG decode failed'));};
  img.src=objectUrl;
 });
}
export async function prepareActAsset(game,def,{signal}={}){
 const state=session(game),texture=game.textures;
 if(texture.exists(def.key)&&(!def.collision||state.masks.has('act3')))return {key:def.key,cached:true};
 if(state.inFlight.has(def.key))return state.inFlight.get(def.key);
 const work=(async()=>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),REQUIRED_ASSET_TIMEOUT_MS);
  const stop=()=>controller.abort();
  signal?.addEventListener('abort',stop,{once:true});
  try{
   const response=await fetch(assetUrl(import.meta.env.BASE_URL,def.path),{signal:controller.signal});
   if(!response.ok)throw Error('asset HTTP '+response.status);
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(!validProductionAsset(bytes,def))throw Error('invalid approved PNG '+def.path);
   const img=await decodeImage(bytes,controller.signal);
   if(controller.signal.aborted)throw Error('asset preparation aborted');
   if(def.width&&img.naturalWidth!==def.width||def.height&&img.naturalHeight!==def.height)
    throw Error('decoded PNG dimensions mismatch');
   if(def.collision){
    const canvas=document.createElement('canvas');
    canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('required collision canvas unavailable');
    ctx.drawImage(img,0,0);
    const mask=createVolcanoWalkability(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
    const spawn=nearestVolcanoSpawn(mask,VOLCANO_START.x,VOLCANO_START.y,PLAYER_RADIUS);
    if(!spawn)throw Error('no safe initial volcano spawn');
    state.masks.set('act3',{mask,spawn});
   }
   if(!texture.exists(def.key)){
    if(def.frameWidth)texture.addSpriteSheet(def.key,img,{frameWidth:def.frameWidth,frameHeight:def.frameHeight});
    else texture.addImage(def.key,img);
   }
   texture.get(def.key).setFilter(1);
   return {key:def.key,cached:false};
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',stop);}
 })();
 state.inFlight.set(def.key,work);
 try{return await work;}finally{state.inFlight.delete(def.key);}
}
export async function prepareActAssets(game,actId,{signal}={}){
 const entries=actRequiredAssets(actId);
 const settled=await Promise.allSettled(entries.map(def=>prepareActAsset(game,def,{signal})));
 const failed=entries.filter((def,i)=>settled[i].status==='rejected')
  .map(def=>({path:def.path,key:def.key,collision:!!def.collision,required:def.required}));
 session(game).failures.set(actId,failed);
 return {actId,ready:!isRequiredCollisionFailure(failed),failed,
   required:entries.filter(x=>x.required).length,loaded:settled.filter(x=>x.status==='fulfilled').length};
}
