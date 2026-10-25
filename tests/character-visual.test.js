import test from 'node:test';
import assert from 'node:assert/strict';
import {assetUrl,validPngHeader,visualMotion,visualPosition,VISUAL_MOTION} from '../src/character-visual.js';
function header(width,height,type=6){const b=new Uint8Array(26);b.set([137,80,78,71,13,10,26,10]);const d=new DataView(b.buffer);d.setUint32(16,width);d.setUint32(20,height);b[24]=8;b[25]=type;return b;}
test('BASE_URL resolves project root and nested deployments',()=>{assert.equal(assetUrl('/klusoczlek/','player/player.png'),'/klusoczlek/assets/player/player.png');assert.equal(assetUrl('/','player/player.png'),'/assets/player/player.png');});
test('PNG requires exact RGBA dimensions, bit depth and signature',()=>{
 assert.ok(validPngHeader(header(512,64)));
 assert.equal(validPngHeader(header(256,1536)),false);
 assert.equal(validPngHeader(header(512,64,2)),false);
 assert.equal(validPngHeader(new Uint8Array(10)),false);
 const corrupt=header(512,64);corrupt[0]=0;assert.equal(validPngHeader(corrupt),false);
});
test('visual motion does not move physics coordinates and settles when idle',()=>{
 let blend=0,active=false;
 for(let i=0;i<30;i++){const motion=visualMotion({delta:1/60,elapsed:i/60},true,blend);blend=motion.blend;if(Math.abs(motion.angle)>0||Math.abs(motion.bob)>0)active=true;assert.ok(Math.abs(motion.angle)<=VISUAL_MOTION.swayDegrees*Math.PI/180+1e-9);assert.ok(Math.abs(motion.bob)<=VISUAL_MOTION.bobPixels+1e-9);}
 assert.ok(active);
 for(let i=0;i<80;i++){const motion=visualMotion({delta:1/60,elapsed:(30+i)/60},false,blend);blend=motion.blend;}
 assert.ok(blend<0.0001);
 assert.deepEqual(visualPosition({x:230,y:410},1.5),{x:230,y:411.5});
 const noMotion=visualMotion({delta:0.2,elapsed:1},true,1,{...VISUAL_MOTION,enabled:false});assert.equal(noMotion.angle,0);assert.equal(noMotion.bob,0);
});
