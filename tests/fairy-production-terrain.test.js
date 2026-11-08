import {APARTMENT} from '../src/volcano-bogdan.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {createVolcanoWalkability,volcanoFootprintAllowed,VOLCANO_START,nearestVolcanoSpawn} from '../src/volcano-contract.js';
import {findFairyRouteSpawn} from '../src/volcano-npcs.js';
import {findMarlenaRoute} from '../src/volcano-bogdan.js';

// Decode the production RGBA PNG in CI, not a synthetic approximation.
function decodeRgbaPng(file){
 const bytes=readFileSync(file),signature=Buffer.from([137,80,78,71,13,10,26,10]);
 assert.ok(bytes.subarray(0,8).equals(signature),'PNG signature');
 let width=0,height=0,depth=0,color=0;const parts=[];
 for(let p=8;p<bytes.length;){
  const length=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,p+8+length);
  if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];color=data[9];assert.equal(data[12],0,'no interlace');}
  if(type==='IDAT')parts.push(data);
  p+=length+12;
  if(type==='IEND')break;
 }
 assert.equal(depth,8);assert.equal(color,6,'RGBA required');
 const compressed=inflateSync(Buffer.concat(parts)),stride=width*4,pixels=new Uint8Array(stride*height);
 let offset=0;
 for(let y=0;y<height;y++){
  const filter=compressed[offset++];
  for(let x=0;x<stride;x++){
   const raw=compressed[offset++],left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,ul=y&&x>=4?pixels[(y-1)*stride+x-4]:0;
   let predictor=0;
   if(filter===1)predictor=left;
   else if(filter===2)predictor=up;
   else if(filter===3)predictor=Math.floor((left+up)/2);
   else if(filter===4){const p=left+up-ul,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-ul);predictor=a<=b&&a<=c?left:b<=c?up:ul;}
   else assert.equal(filter,0,'known PNG row filter');
   pixels[y*stride+x]=(raw+predictor)&255;
  }
 }
 return createVolcanoWalkability(pixels,width,height);
}
test('fairy spawn is safe and reachable on actual approved production terrain PNG',()=>{
 const mask=decodeRgbaPng(new URL('../public/assets/arenas/act3-volcano.png',import.meta.url));
 const start=VOLCANO_START;
 const point=findFairyRouteSpawn(mask,start,findMarlenaRoute);
 assert.ok(point,'No safe reachable fairy spawn: revise approved route coordinates before merging');
 assert.ok(volcanoFootprintAllowed(mask,point.x,point.y,17));
 assert.ok(Math.hypot(point.x-1400,point.y-225)>=450);
 assert.ok(Math.hypot(point.x-1500,point.y-235)>=450);
 const route=findMarlenaRoute(mask,start,point,{radius:17,cell:12,maxNodes:26000});
 assert.ok(route?.length);
 console.log('VERIFIED FAIRY SPAWN',JSON.stringify(point),'reachable route waypoints',route.length);
});

test('apartment actors move down to reachable walkable terrain without overlap',()=>{
 const mask=decodeRgbaPng(new URL('../public/assets/arenas/act3-volcano.png',import.meta.url));
 const marlena=nearestVolcanoSpawn(mask,APARTMENT.marlena.x,APARTMENT.marlena.y,18,0,null,70);
 const bogdan=nearestVolcanoSpawn(mask,APARTMENT.bogdan.x,APARTMENT.bogdan.y,18,0,null,70);
 if(!marlena){const choices=[];for(let y=240;y<=550;y+=20)for(let x=1150;x<=1650;x+=25)if(volcanoFootprintAllowed(mask,x,y,18))choices.push({x,y});console.log('VALID LOWER APARTMENT SAMPLES',JSON.stringify(choices.slice(0,60)));}
 assert.ok(marlena,'Marlena has no valid lower position');
 assert.ok(bogdan,'Bogdan has no valid lower position');
 assert.ok(volcanoFootprintAllowed(mask,marlena.x,marlena.y,18));
 assert.ok(volcanoFootprintAllowed(mask,bogdan.x,bogdan.y,18));
 assert.ok(Math.hypot(marlena.x-bogdan.x,marlena.y-bogdan.y)>=70);
 assert.ok(findMarlenaRoute(mask,VOLCANO_START,marlena,{radius:17,cell:12,maxNodes:26000})?.length);
 assert.ok(findMarlenaRoute(mask,VOLCANO_START,bogdan,{radius:17,cell:12,maxNodes:26000})?.length);
 console.log('VERIFIED APARTMENT ACTORS',JSON.stringify({marlena,bogdan}));
});
