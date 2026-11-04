import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRSHIP_LAYERS,scrollCloudLayers} from '../src/airship-contract.js';
import {CLOUD_TRAVEL_PX,CLOUD_FADE_START,CLOUD_OVERSCAN_PX,
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
      assert.ok(sourceW*cover>=w+2*(CLOUD_TRAVEL_PX+CLOUD_OVERSCAN_PX)-1e-7);
      assert.ok(sourceH*cover>=h+2*CLOUD_OVERSCAN_PX-1e-7);
      const staticCover=backgroundCoverScale(sourceW,sourceH,w,h,false);
      assert.ok(sourceW*staticCover>=w-1e-7&&sourceH*staticCover>=h-1e-7);
    }
  }
});
test('moving layers remain independent, and the sky stays completely static',()=>{
  const layers=AIRSHIP_LAYERS.map(l=>({speed:l.speed,tilePositionX:0}));
  scrollCloudLayers(layers,50);
  assert.deepEqual(layers.map(l=>l.tilePositionX),[0,.25,.6,1.15]);
  const old=layers.map(l=>l.tilePositionX);
  scrollCloudLayers(layers,1000);
  assert.deepEqual(layers.map(l=>l.tilePositionX),old.map((v,i)=>v+AIRSHIP_LAYERS[i].speed*.05));
});
test('Phaser adapter allocates at most seven Images, recycles, resizes, and destroys cleanly',()=>{
  let made=0,destroyed=0;
  const objects=[];
  const scene={
    scale:{width:915,height:412},
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
