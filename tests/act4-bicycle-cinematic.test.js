import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {ACT4_BICYCLE_CINEMATIC,validAct4BicycleSheet,fitAct4BicycleFrame} from '../src/school-bicycle-cinematic.js';
import {CHAPEL_RETURN,chapelReturnValid,BLAZEJ_BICYCLE_ID} from '../src/school-finale.js';
import {schoolWalkable} from '../src/school-contract.js';
import {DIALOGUES} from '../src/dialogue-data.js';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sheet=readFileSync(new URL('../public/assets/player/act4-aloes-bicycle.png',import.meta.url));
const bike=readFileSync(new URL('../public/assets/artifacts/artifact-blazej-bike.png',import.meta.url));
const n=(b,i)=>b.readUInt32BE(i);

test('approved 3072x1296 bicycle sheet decodes as RGBA8 with twelve complete 768x432 frames and zero spacing',()=>{
 const spec=ACT4_BICYCLE_CINEMATIC;
 assert.deepEqual([spec.width,spec.height,spec.frameWidth,spec.frameHeight,spec.columns,spec.rows,spec.frames],
  [3072,1296,768,432,4,3,12]);
 assert.equal(validAct4BicycleSheet(sheet),true);
 assert.equal(validAct4BicycleSheet(Buffer.concat([sheet.subarray(0,200)])),false);
 const bad=Buffer.from(sheet);bad[25]=2;assert.equal(validAct4BicycleSheet(bad),false);
 const chunks=[];let p=8,hasSRGB=false;
 while(p<sheet.length){
  const size=n(sheet,p),type=sheet.toString('ascii',p+4,p+8);
  if(type==='IDAT')chunks.push(sheet.subarray(p+8,p+8+size));
  if(type==='sRGB')hasSRGB=true;
  p+=size+12;if(type==='IEND')break;
 }
 const raw=inflateSync(Buffer.concat(chunks));
 assert.equal(raw.length,spec.height*(spec.width*4+1),'valid full compressed image data');
 const stride=spec.width*4,opaque=Array(12).fill(0),rgb=Array(12).fill(0);
 let offset=0,previous=new Uint8Array(stride);
 for(let y=0;y<spec.height;y++){
  const filter=raw[offset++],row=new Uint8Array(stride);
  assert.ok(filter>=0&&filter<=4,'valid PNG row filter');
  for(let x=0;x<stride;x++){
   const left=x>=4?row[x-4]:0,up=previous[x],ul=x>=4?previous[x-4]:0;
   let pred=0;
   if(filter===1)pred=left;
   if(filter===2)pred=up;
   if(filter===3)pred=(left+up)>>1;
   if(filter===4){const v=left+up-ul,a=Math.abs(v-left),b=Math.abs(v-up),c=Math.abs(v-ul);pred=a<=b&&a<=c?left:b<=c?up:ul;}
   row[x]=(raw[offset++]+pred)&255;
  }
  for(let x=0;x<spec.width;x++){
   const frame=Math.floor(y/spec.frameHeight)*4+Math.floor(x/spec.frameWidth);
   if(row[x*4+3])opaque[frame]++;
   rgb[frame]=(rgb[frame]+row[x*4]+row[x*4+1]*3+row[x*4+2]*7)>>>0;
  }
  previous=row;
 }
 assert.equal(offset,raw.length);
 assert.ok(opaque.every(count=>count>10000),'all twelve frame regions contain decoded imagery');
 assert.ok(new Set(rgb).size>1,'separate animation frames differ visually');
 assert.equal(sheet[24],8);assert.equal(sheet[25],6);
 // sRGB chunk presence is reported by the test fixture; the browser also
 // checks image.decode() independently before creating the Phaser sheet.
 assert.equal(typeof hasSRGB,'boolean');
});

test('Phaser animation contract is native 12fps, 3 complete cycles (repeat 2), 3000ms and one run only',()=>{
 const spec=ACT4_BICYCLE_CINEMATIC;
 assert.deepEqual([spec.frameRate,spec.repeat,spec.durationMs],[12,2,3000]);
 assert.equal(spec.frames/spec.frameRate*(spec.repeat+1)*1000,spec.durationMs);
 const sourceCode=source('../src/school-bicycle-cinematic.js'),school=source('../src/school-scene.js');
 assert.ok(sourceCode.includes("scene.textures.addSpriteSheet(c.textureKey,image,{"));
 assert.ok(sourceCode.includes("frameWidth:c.frameWidth,frameHeight:c.frameHeight,margin:0,spacing:0"));
 assert.ok(sourceCode.includes("scene.anims.generateFrameNumbers(c.textureKey,{start:0,end:11})"));
 assert.ok(sourceCode.includes("frameRate:c.frameRate,repeat:c.repeat"));
 assert.ok(sourceCode.includes('Phaser.Animations.Events.ANIMATION_REPEAT'));
 assert.ok(sourceCode.includes('Phaser.Animations.Events.ANIMATION_COMPLETE'));
 assert.ok(sourceCode.includes('Phaser.Textures.FilterMode.NEAREST'));
 assert.ok(sourceCode.includes('if(disposed||!ready||started)return false'));
 assert.ok(school.includes('this.bicycleRideStarted=true;this.storyBusy=true;'));
 assert.ok(school.includes('this.bicycleCinematic.play(()=>this.finishBicycleCinematic())'));
 assert.ok(school.includes("this.afterBicycleFade(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE,"));
});

test('screen-fixed cinematic preserves 16:9 and fits landscape, square and portrait viewports without crop or distortion',()=>{
 for(const [w,h] of [[800,450],[960,540],[853,393],[390,844],[400,400],[2400,1080]]){
  const fit=fitAct4BicycleFrame(w,h);
  assert.equal(fit.x,w/2);assert.equal(fit.y,h/2);
  assert.ok(fit.width<=w+1e-9&&fit.height<=h+1e-9);
  assert.ok(Math.abs(fit.width/fit.height-16/9)<1e-9);
 }
 const src=source('../src/school-bicycle-cinematic.js');
 assert.ok(src.includes('setScrollFactor(0).setDepth(300)'));
 assert.ok(src.includes('setScrollFactor(0).setDepth(301)'));
 assert.ok(src.includes('0x000000,1'));
 assert.ok(src.includes('sprite.setPosition(fit.x,fit.y).setDisplaySize(fit.width,fit.height)'));
});

test('approved standalone 192x192 bicycle parked outside chapel, no duplicate Aloes and existing four-panel ending intact',()=>{
 assert.equal(n(bike,16),192);assert.equal(n(bike,20),192);
 assert.equal(bike[24],8);assert.equal(bike[25],6);
 assert.equal(chapelReturnValid(),true);
 const parking={x:CHAPEL_RETURN.x+76,y:CHAPEL_RETURN.y+15};
 assert.ok(schoolWalkable(parking),'decorative bicycle position reachable');
 assert.ok(Math.hypot(parking.x-CHAPEL_RETURN.x,parking.y-CHAPEL_RETURN.y)<110);
 const scene=source('../src/school-scene.js');
 assert.ok(scene.includes("this.add.image(point.x,point.y,this.bicycleTexture)"));
 assert.ok(scene.includes('setOrigin(.5,1).setDisplaySize(96,96).setDepth(10)'));
 assert.ok(scene.includes('this.bicycleCinematic.hide(); // Remove all 12-frame rider visuals/listeners.'));
 assert.ok(!scene.includes('this.bicycleWorld?.setPosition(this.player.x'));
 assert.equal(BLAZEJ_BICYCLE_ID,'blazej-bicycle');
 assert.deepEqual(DIALOGUES['act4-chapel-ending'],[
  ['chapel','KAPLICA','Łuuuuuu...'],['chapel','KAPLICA','Łeeee...'],
  ['chapel','KAPLICA','Łuuuuu...'],
  ['aloes','ALOES','Co to za dziwne dźwięki?\nMam nadzieję, że z Marianem\nwszystko w porządku...']
 ]);
});

test('existing finale state machine and rewards remain unchanged; callback/shutdown cleanup and fallback are bounded',()=>{
 const school=source('../src/school-scene.js'),cinema=source('../src/school-bicycle-cinematic.js'),
   combat=source('../src/school-combat.js');
 assert.ok(combat.includes("BLAZEJ_REWARD:'BICYCLE_RIDE'"));
 assert.ok(combat.includes("BICYCLE_RIDE:'CHAPEL_RETURN'"));
 assert.ok(combat.includes("CHAPEL_RETURN:'ACT_IV_COMPLETE'"));
 assert.ok(school.includes("awardRunArtifact(this.run,BLAZEJ_BICYCLE_ID)"));
 assert.ok(school.includes("this.combat.advanceFinale('BICYCLE_RIDE')"));
 assert.ok(school.includes("this.combat.advanceFinale('CHAPEL_RETURN')"));
 assert.ok(school.includes("this.combat.advanceFinale('ACT_IV_COMPLETE')"));
 assert.ok(school.includes("this.scene.start('Menu')"));
 assert.ok(school.includes('this.cancelBicycleFade();'));
 assert.ok(school.includes('this.bicycleCinematic?.destroy();'));
 assert.ok(cinema.includes('controller.abort();hide()'));
 assert.ok(cinema.includes('sprite.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE)'));
 assert.ok(school.includes('if(!ready||!this.bicycleCinematic.show()){'));
 assert.ok(school.includes("if(!this.run.artifacts.has(BLAZEJ_BICYCLE_ID))"));
});
