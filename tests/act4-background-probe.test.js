import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
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
function label([r,g,b]){let max=Math.max(r,g,b),min=Math.min(r,g,b),v=(r+g+b)/3;
 if(v<48)return '#';if(max-min<17)return v>175?'W':v>110?'s':'d';
 if(g>r*1.25&&g>b*1.12)return 'G';
 if(b>r*1.24&&b>g*1.08)return 'B';
 if(r>g*1.35&&r>b*1.2)return 'R';
 if(r>120&&g>95&&b<g*.85)return 'Y';
 if(r>g&&g>b)return 'o';
 return 'x';
}
test('diagnostic: actual approved background color map, upper-right region',()=>{
 const bg=decode('backgrounds/act4-schoolyard.png');
 assert.deepEqual([bg.w,bg.h],[1800,1200]);
 console.log('SCHOOL_BG_MAP: x=900..1800 in 15px cells, y=0..720 in 15px cells; # dark G green B blue R red Y yellow o brown s grey W light');
 for(let y=0;y<720;y+=15){let line='';for(let x=900;x<1800;x+=15)line+=label(bg.pixel(x+7,y+7));console.log('BG '+String(y).padStart(3,'0')+' '+line);}
 const school=decode('obstacles/act4-school.png');console.log('SCHOOL PNG RGBA:',school.w,school.h);
});