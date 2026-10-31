// Test-only decoder for approved 8-bit RGBA PNG fixtures; no runtime sampling.
import {inflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
export function pngAlpha(path){
 const png=readFileSync(path),width=png.readUInt32BE(16),height=png.readUInt32BE(20),chunks=[];
 if(png[24]!==8||png[25]!==6||png[28]!==0)throw Error('Expected noninterlaced RGBA8 fixture');
 for(let p=8;p<png.length;){const n=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8);if(type==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=12+n;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(width*height*4);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)];
  for(let x=0;x<stride;x++){
   const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;
   const prediction=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
   if(prediction===undefined)throw Error('Invalid PNG filter');pixels[i]=(raw[y*(stride+1)+1+x]+prediction)&255;
  }
 }
 return {width,height,at:(x,y)=>pixels[(y*width+x)*4+3]};
}
