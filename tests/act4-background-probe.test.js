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
function label([r,g,b]){let max=Math.max(r,g,b),min=Math.min(r,g,b),v=(r+g+b)/3;
 if(v<48)return '#';if(max-min<17)return v>175?'W':v>110?'s':'d';
 if(g>r*1.25&&g>b*1.12)return 'G';
 if(b>r*1.24&&b>g*1.08)return 'B';
 if(r>g*1.35&&r>b*1.2)return 'R';
 if(r>120&&g>95&&b<g*.85)return 'Y';
 if(r>g&&g>b)return 'o';
 return 'x';
}

function pngChunk(name,data){
 const n=Buffer.alloc(4),type=Buffer.from(name),size=Buffer.alloc(4);
 size.writeUInt32BE(data.length,0);
 let crc=0xffffffff;
 for(const c of Buffer.concat([type,data])){
  crc^=c;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
 }
 n.writeUInt32BE((crc^0xffffffff)>>>0,0);
 return Buffer.concat([size,type,data,n]);
}
function cropPreview(bg){
 const w=170,h=110,raw=Buffer.alloc(h*(w*4+1));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=bg.pixel(1050+x*4,y*4),i=y*(w*4+1)+1+x*4;
  raw[i]=p[0];raw[i+1]=p[1];raw[i+2]=p[2];raw[i+3]=255;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);
 const b64=png.toString('base64');console.log('BGPNG_START '+b64.length);
 for(let i=0;i<b64.length;i+=500)console.log('BGPNG_PART '+b64.slice(i,i+500));
 console.log('BGPNG_END');
}

test('diagnostic: actual approved background color map, upper-right region',()=>{
 const bg=decode('backgrounds/act4-schoolyard.png');
 assert.deepEqual([bg.w,bg.h],[1800,1200]);
 cropPreview(bg);
 console.log('SCHOOL_BG_MAP: x=900..1800 in 15px cells, y=0..720 in 15px cells; # dark G green B blue R red Y yellow o brown s grey W light');
 for(let y=0;y<720;y+=15){let line='';for(let x=900;x<1800;x+=15)line+=label(bg.pixel(x+7,y+7));console.log('BG '+String(y).padStart(3,'0')+' '+line);}
 const school=decode('obstacles/act4-school.png');console.log('SCHOOL PNG RGBA:',school.w,school.h);
 const samples=[];
 for(let y=100;y<school.h-30;y+=25)for(let x=45;x<school.w-35;x+=25){
  let p=school.pixel(x,y);if(p[3]>200)samples.push([x,y,p]);
 }
 let matches=[];
 for(const scale of [.5,.6,.7,.8,.9,1,1.1])for(let top=0;top<=460;top+=10)for(let left=850;left<=1580;left+=10){
  if(left+school.w*scale>1800||top+school.h*scale>690)continue;
  let score=0;
  for(const [x,y,p] of samples){
   const q=bg.pixel(Math.round(left+x*scale),Math.round(top+y*scale));
   score+=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;
  }
  matches.push({left,top,scale,mse:Math.round(score/(samples.length*3))});
 }
 matches.sort((a,b)=>a.mse-b.mse);
 console.log('SCHOOL_BAKED_TEMPLATE_BEST:',JSON.stringify(matches.slice(0,15)));

 // Quantized color palette of each 20px world cell in upper-right background.
 // Same RGB mapping across rows: each symbol corresponds to fixed 64-unit RGB bin.
 const entries=new Map();for(let y=50;y<610;y+=20)for(let x=1120;x<1780;x+=20){
  let [r,g,b]=bg.pixel(x+10,y+10),k=[r>>6,g>>6,b>>6].join('');
  entries.set(k,(entries.get(k)||0)+1);
 }
 const palette=[...entries.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20);
 console.log('PALETTE TOP:',JSON.stringify(palette));
 const symbols='0123456789ABCDEFGHIJKLMNOPQRSTUV';
 for(let y=50;y<610;y+=20){let line='';
  for(let x=1120;x<1780;x+=20){
   const [r,g,b]=bg.pixel(x+10,y+10),k=[r>>6,g>>6,b>>6].join('');
   const n=palette.findIndex(e=>e[0]===k);
   line+=n<0?'.':symbols[n];
  }
  console.log('SCHOOL_COLOR '+String(y).padStart(3,'0')+' '+line);
 }
 const rects=[{x0:1100,x1:1760,y0:60,y1:600},{x0:1180,x1:1710,y0:140,y1:430}];
 for(const rect of rects){const rows=[];for(let y=rect.y0;y<=rect.y1;y+=10){
  let total=0,count=0;
  for(let x=rect.x0;x<rect.x1;x+=4){let c=bg.pixel(x,y-3),d=bg.pixel(x,y+3);
   total+=Math.abs(c[0]-d[0])+Math.abs(c[1]-d[1])+Math.abs(c[2]-d[2]);count++;
  }rows.push([y,Math.round(total/count)]);
 }console.log('SCHOOL_HORIZONTAL_EDGES',JSON.stringify(rows.sort((a,b)=>b[1]-a[1]).slice(0,18)));}

});