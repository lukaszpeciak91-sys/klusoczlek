import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRSHIP_LAYERS,scrollCloudLayers} from '../src/airship-contract.js';
import {CLOUD_TRAVEL_PX,CLOUD_FADE_START,CLOUD_OVERSCAN_PX,cloudHorizontalMargins,
  horizontalCloudState,backgroundCoverScale,smoothstep01,createHorizontalParallaxLayer} from '../src/airship-parallax.js';

test('Act II keeps four sky/cloud layers and the approved 0/5/12/23 px/s',()=>{
  assert.deepEqual(AIRSHIP_LAYERS.map(layer=>layer.speed),[0,5,12,23]);
  assert.equal(CLOUD_FADE_START>0.5,true);
  assert.equal(smoothstep01(-5),0);
  assert.equal(smoothstep01(5),1);
  assert.equal(smoothstep01(.5),.5);
});
test('horizontal pair always has complementary safe alpha through many cycles',()=>{
  for(const id of ['far','mid','near']){
    for(let step=0;step<15000;step++){
      const states=horizontalCloudState(step*.63,id);
      assert.equal(states.length,2);
      assert.ok(states.every(x=>x.alpha>=0&&x.alpha<=1));
      assert.ok(Math.abs(states[0].alpha+states[1].alpha-1)<1e-10);
      assert.ok(states.every(x=>Math.abs(x.xOffset)<=CLOUD_TRAVEL_PX));
      assert.equal(states[1].composition,states[0].composition+1);
      const a=Math.round(states[0].xOffset),b=Math.round(states[1].xOffset);
      assert.ok(b>=a);
    }
  }
});
test('overscan guarantees both whole image compositions cover viewport in 915x412 and 568x320',()=>{
  for(const [w,h] of [[915,412],[568,320],[960,540],[320,240]]){
    for(const [sourceW,sourceH] of [[1024,512],[512,256]]){
      const cover=backgroundCoverScale(sourceW,sourceH,w,h,true);
      const margins=cloudHorizontalMargins();
      assert.ok(sourceW*cover>=w+margins.left+margins.right-1e-7);
      assert.ok(sourceH*cover>=h+2*CLOUD_OVERSCAN_PX-1e-7);
      const staticCover=backgroundCoverScale(sourceW,sourceH,w,h,false);
      assert.ok(sourceW*staticCover>=w-1e-7&&sourceH*staticCover>=h-1e-7);
    }
  }
});
test('moving layers remain independent, and the sky stays completely static',()=>{
  const layers=AIRSHIP_LAYERS.map(l=>({speed:l.speed,tilePositionX:0}));
  scrollCloudLayers(layers,50);
  for(let i=0;i<4;i++)assert.ok(Math.abs(layers[i].tilePositionX-[0,.25,.6,1.15][i])<1e-9);
  const old=layers.map(l=>l.tilePositionX);
  scrollCloudLayers(layers,1000);
  for(let i=0;i<4;i++)assert.ok(Math.abs(layers[i].tilePositionX-(old[i]+AIRSHIP_LAYERS[i].speed*.05))<1e-9);
});
test('Phaser adapter allocates at most seven Images, recycles, resizes, and destroys cleanly',()=>{
  let made=0,destroyed=0;
  const objects=[];
  const scene={
    scale:{width:915,height:412},
    cameras:{main:{zoom:1}},
    textures:{get:()=>({getSourceImage:()=>({width:1024,height:512})})},
    add:{image:()=>{made++;const o={
      alpha:1,active:true,x:0,y:0,scale:1,
      setOrigin(){return this;},setScrollFactor(){return this;},setDepth(){return this;},
      setScale(x){this.scale=x;return this;},setPosition(x,y){this.x=x;this.y=y;return this;},
      setAlpha(x){this.alpha=x;return this;},setTexture(){return this;},
      destroy(){destroyed++;this.active=false;}
    };objects.push(o);return o;}}
  };
  const layers=AIRSHIP_LAYERS.map(def=>createHorizontalParallaxLayer(scene,def,'fallback'));
  assert.equal(made,7);
  const initialScale=layers[1].images[0].scale;
  scene.cameras.main.zoom=.6;
  layers.forEach(l=>l.update());
  assert.ok(layers[1].images[0].scale>initialScale/.7,'cinematic zoom must preserve full-screen coverage');
  scene.cameras.main.zoom=1;
  layers.forEach(l=>l.update());
  assert.ok(Math.abs(layers[1].images[0].scale-initialScale)<1e-9);
  for(let n=0;n<2200;n++){
    scrollCloudLayers(layers,50);
    layers.forEach(l=>l.update());
    assert.equal(layers[0].tilePositionX,0);
    assert.ok(layers.every(l=>l.images.every(o=>o.alpha>=0&&o.alpha<=1)));
  }
  for(const l of layers){l.setTexture('approved');l.setSize(568,320);}
  assert.equal(made,7);
  layers.forEach(l=>l.destroy());
  layers.forEach(l=>l.destroy());
  assert.equal(destroyed,7);
  assert.equal(objects.every(o=>!o.active),true);
});

test('PR77 cloud image overscan covers viewport whenever its blend alpha is nonzero',()=>{
 const {left,right}=cloudHorizontalMargins();
 assert.ok(left>=CLOUD_OVERSCAN_PX&&right>=CLOUD_TRAVEL_PX+CLOUD_OVERSCAN_PX);
 for(const [width,height] of [[915,412],[568,320],[1280,720],[960,540]]){
  const scale=backgroundCoverScale(1024,512,width,height,true);
  const half=1024*scale/2,center=(right-left)/2;
  for(const layerId of ['far','mid','near']){
   for(let step=0;step<=3000;step++){
    const distance=step*.51;
    for(const state of horizontalCloudState(distance,layerId)){
     if(state.alpha<1e-8)continue;
     const leftEdge=width/2+center+state.xOffset-half;
     const rightEdge=width/2+center+state.xOffset+half;
     assert.ok(leftEdge<=-CLOUD_OVERSCAN_PX+1.01,
       layerId+' visible left gap '+width+'x'+height+' at '+distance);
     assert.ok(rightEdge>=width+CLOUD_OVERSCAN_PX-1.01,
       layerId+' visible right gap '+width+'x'+height+' at '+distance);
    }
   }
  }
 }
});
test('PR77 fade is shorter but stays continuous at the composition recycle boundary',()=>{
 assert.ok(CLOUD_FADE_START>.75&&CLOUD_FADE_START<.9);
 for(const id of ['far','mid','near']){
  const before=horizontalCloudState(CLOUD_TRAVEL_PX-1e-6,id);
  const after=horizontalCloudState(CLOUD_TRAVEL_PX+1e-6,id);
  // Cycle phase offset means state composition indices must not jump more than 1.
  assert.ok(after[0].composition-before[0].composition<=1);
  for(let i=0;i<2;i++)assert.ok(before[i].alpha>=0&&before[i].alpha<=1);
  for(let i=0;i<2;i++)assert.ok(after[i].alpha>=0&&after[i].alpha<=1);
  // Both compositions still sum to one and keep the same bounded object count.
  assert.ok(Math.abs(before[0].alpha+before[1].alpha-1)<1e-9);
  assert.ok(Math.abs(after[0].alpha+after[1].alpha-1)<1e-9);
 }
});
