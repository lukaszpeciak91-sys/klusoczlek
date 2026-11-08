// Act IV approved art loader. Artwork never defines collisions or player
// navigation, and no substitute images or fabricated PNGs are generated.
import {assetUrl,validPngHeader} from './character-visual.js';
import {SCHOOL_WORLD,SCHOOL_PLACES} from './school-contract.js';

export const SCHOOL_ART=Object.freeze({
 background:Object.freeze({path:'backgrounds/act4-schoolyard.png',key:'schoolyard-approved-bg'}),
 school:Object.freeze({path:'obstacles/act4-school.png',key:'schoolyard-approved-school',width:610,height:450}),
 chapel:Object.freeze({path:'obstacles/act4-chapel.png',key:'schoolyard-approved-chapel',width:235,height:235}),
 bicycleRack:Object.freeze({path:'obstacles/act4-bicycle-rack.png',key:'schoolyard-approved-rack',width:330,height:255}),
});
export function validSchoolyardBackground(bytes){
 if(bytes.length<26||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return false;
 const n=i=>((bytes[i]*16777216)+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3])>>>0;
 return bytes[24]===8&&[2,6].includes(bytes[25])&&
  n(16)>=1200&&n(16)<=6000&&n(20)>=800&&n(20)<=5000;
}
export function createSchoolyardArt(scene){
 const controller=new AbortController(),loaded=new Set();let disposed=false;
 const images=[];
 scene.events.once('shutdown',()=>{disposed=true;controller.abort();});
 async function open(id){
  const def=SCHOOL_ART[id];
  try{
   if(!scene.textures.exists(def.key)){
    const response=await fetch(assetUrl(import.meta.env.BASE_URL,def.path),
     {cache:'no-cache',signal:controller.signal});
    if(!response.ok)return;
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!(id==='background'?validSchoolyardBackground(bytes):validPngHeader(bytes,def)))return;
    const blob=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    try{
     const image=new Image();
     await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=blob;});
     if(disposed||id==='background'&&!(image.naturalWidth>=1200&&image.naturalHeight>=800)||
         id!=='background'&&(image.naturalWidth!==def.width||image.naturalHeight!==def.height))return;
     scene.textures.addImage(def.key,image);
    }finally{URL.revokeObjectURL(blob);}
   }
   if(disposed)return;
   scene.textures.get(def.key).setFilter(1);
   const p=SCHOOL_PLACES[id];
   const image=id==='background'?
     scene.add.image(0,0,def.key).setOrigin(0).setDisplaySize(SCHOOL_WORLD.width,SCHOOL_WORLD.height).setDepth(-18):
     scene.add.image(p.x,p.y+p.height/2,def.key).setOrigin(.5,1)
       .setDisplaySize(p.width,p.width*def.height/def.width).setDepth(-7);
   images.push(image);loaded.add(id);
   if(id==='background')for(const placeholder of scene.schoolTerrainPlaceholders??[])placeholder.setVisible(false);
   else for(const placeholder of scene.schoolPlacePlaceholders?.get(id)??[])placeholder.setVisible(false);
  }catch(error){if(!disposed&&error.name!=='AbortError')console.info('[School art] awaiting approved '+id);}
 }
 const loading=Promise.allSettled(Object.keys(SCHOOL_ART).map(open));
 return {loading,loaded,images};
}
