import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync,deflateSync} from 'node:zlib';
function decode(path){
 const b=readFileSync(new URL('../public/assets/'+path,import.meta.url));
 const w=b.readUInt32BE(16),h=b.readUInt32BE(20),channels=b[25]===6?4:3;
 const chunks=[];let p=8;while(p<b.length){let n=b.readUInt32BE(p),k=b.toString('ascii',p+4,p+8);if(k==='IDAT')chunks.push(b.subarray(p+8,p+8+n));p+=n+12;if(k==='IEND')break;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=w*channels,out=new Uint8Array(h*stride);
 let at=0,prev=new Uint8Array(stride);
 for(let y=0;y<h;y++){let filter=raw[at++],row=out.subarray(y*stride,(y+1)*stride);
  for(let i=0;i<stride;i++){let a=i>=channels?row[i-channels]:0,c=prev[i],d=i>=channels?prev[i-channels]:0;
   let pred=filter===1?a:filter===2?c:filter===3?(a+c)>>1:0;
   if(filter===4){let q=a+c-d,da=Math.abs(q-a),db=Math.abs(q-c),dc=Math.abs(q-d);pred=da<=db&&da<=dc?a:db<=dc?c:d;}
   row[i]=(raw[at++]+pred)&255;
  }prev=row;
 }
 return {w,h,channels,out,pixel(x,y){let i=(Math.min(h-1,Math.max(0,y))*w+Math.min(w-1,Math.max(0,x)))*channels;return [out[i],out[i+1],out[i+2],channels===4?out[i+3]:255];}};
}
import {SCHOOL_ART,validSchoolyardBackground} from '../src/schoolyard-art.js';
import {SCHOOL_PLACES,SCHOOL_VISIBLE_FOOTPRINTS,schoolWalkable} from '../src/school-contract.js';
import {PLAYER_RADIUS} from '../src/movement.js';
test('native schoolyard background includes school paving, with a separately approved school building',()=>{
 const bytes=readFileSync(new URL('../public/assets/'+SCHOOL_ART.background.path,import.meta.url));
 assert.equal(validSchoolyardBackground(bytes),true);
 const bg=decode('backgrounds/act4-schoolyard.png');
 const foundation=bg.pixel(1500,200),grass=bg.pixel(980,650);
 const difference=[0,1,2].reduce((sum,i)=>sum+Math.abs(foundation[i]-grass[i]),0);
 assert.ok(difference>30,'native paving and grass are visibly distinct');
 const school=readFileSync(new URL('../public/assets/'+SCHOOL_ART.school.path,import.meta.url));
 assert.deepEqual([school.readUInt32BE(16),school.readUInt32BE(20)],[610,450]);
 assert.deepEqual([SCHOOL_ART.school.width,SCHOOL_ART.school.height],[520,384]);
 assert.deepEqual([SCHOOL_ART.school.sourceWidth,SCHOOL_ART.school.sourceHeight],[610,450]);
 const loader=readFileSync(new URL('../src/schoolyard-art.js',import.meta.url),'utf8');
 assert.ok(loader.includes('Object.keys(SCHOOL_ART).map(open)'),'native school must load as a separate sprite');
 assert.ok(loader.includes('.setDisplaySize(def.width,def.height).setDepth(12)'));
 assert.ok(schoolWalkable(SCHOOL_PLACES.schoolEntrance,PLAYER_RADIUS));
 assert.equal(schoolWalkable(SCHOOL_VISIBLE_FOOTPRINTS.school),false);
});
