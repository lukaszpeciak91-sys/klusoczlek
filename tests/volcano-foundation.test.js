import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPAIGN_ACTS,sceneForAct} from '../src/campaign.js';
import {VOLCANO_START,VOLCANO_ASSETS,volcanoStep,createVolcanoWalkability,volcanoFootprintAllowed,nearestVolcanoSpawn,validVolcanoPng,advanceVolcanoLava,volcanoControlsAllowed,volcanoFacing} from '../src/volcano-contract.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';

test('Act III is registered with approved title',()=>{
 const act=CAMPAIGN_ACTS.find(a=>a.id==='act3');
 assert.equal(act.title,'PRZYTULNE M4 W CENTRUM WULKANU');
 assert.equal(sceneForAct('act3'),'Volcano');
});
test('alpha terrain blocks lava, diagonal crossings and tunnelling, including larger enemies',()=>{
 const width=1800,height=1200,rgba=new Uint8Array(width*height*4);
 for(let y=100;y<1100;y++)for(let x=100;x<1700;x++){
   if(x>=800&&x<850&&!(y>=540&&y<650))continue;
   rgba[(y*width+x)*4+3]=255;
 }
 const mask=createVolcanoWalkability(rgba,width,height);
 assert.equal(volcanoFootprintAllowed(mask,500,500,17),true);
 assert.equal(volcanoFootprintAllowed(mask,820,500,17),false);
 assert.equal(volcanoFootprintAllowed(mask,810,600,27),false);
 assert.equal(volcanoFootprintAllowed(null,500,500,17),false);
 const blocked=volcanoStep({x:760,y:400},{x:1,y:0},100000,10000,17,mask);
 assert.ok(blocked.x<800-17);
 const diagonal=volcanoStep({x:760,y:400},{x:1,y:1},100000,10000,17,mask);
 assert.equal(volcanoFootprintAllowed(mask,diagonal.x,diagonal.y,17),true);
 const crossing=volcanoStep({x:760,y:590},{x:1,y:0},100000,10000,17,mask);
 assert.ok(crossing.x>850+17,'wide rocky connection remains passable');
 const enemy=volcanoStep({x:760,y:400},{x:1,y:0},100000,10000,27,mask);
 assert.ok(enemy.x<800-27);
 const spawn=nearestVolcanoSpawn(mask,820,400,17,80,{x:760,y:400},160);
 assert.ok(spawn&&volcanoFootprintAllowed(mask,spawn.x,spawn.y,17));
 assert.deepEqual(volcanoStep({x:500,y:500},{x:1,y:0},100,235,17,null),{x:500,y:500});
});
test('Act III debug checkpoint carries completed predecessors and equipment',()=>{
 const fixture=createDebugFixture('act3-opening');
 assert.ok(fixture);
 assert.equal(fixture.handoff.scene,'Volcano');
 assert.ok(fixture.run.completedActs.has('act1'));
 assert.ok(fixture.run.completedActs.has('act2'));
 assert.ok(fixture.run.unlockedWeapons.has('rifle'));
});
test('artist asset paths and dimensions are explicit',()=>{
 assert.equal(VOLCANO_ASSETS.terrain.width,1800);
 assert.equal(VOLCANO_ASSETS.terrain.height,1200);
 assert.equal(VOLCANO_ASSETS.terrain.status,'pending');
 assert.equal(VOLCANO_ASSETS.lava.repeat,'seamless both axes');
});

test('lava scroll is vertical, deterministic, frame capped and suspends',()=>{
 assert.equal(advanceVolcanoLava(10,100),11.2);
 assert.equal(advanceVolcanoLava(10,100,false),10);
 assert.equal(advanceVolcanoLava(10,-5),10);
 assert.equal(advanceVolcanoLava(10,25),10.6);
});
test('PNG header enforces dimensions, bit depth and RGBA terrain',()=>{
 const header=(w,h,bit,type)=>{
   const b=new Uint8Array(33);b.set([137,80,78,71,13,10,26,10]);b[11]=13;
   b.set([73,72,68,82],12);
   const view=new DataView(b.buffer);view.setUint32(16,w);view.setUint32(20,h);
   b[24]=bit;b[25]=type;return b;
 };
 assert.equal(validVolcanoPng(header(1800,1200,8,6),VOLCANO_ASSETS.terrain),true);
 assert.equal(validVolcanoPng(header(1800,1200,8,2),VOLCANO_ASSETS.terrain),false);
 assert.equal(validVolcanoPng(header(512,512,8,2),VOLCANO_ASSETS.lava),true);
 assert.equal(validVolcanoPng(header(512,512,8,6),VOLCANO_ASSETS.lava),true);
 assert.equal(validVolcanoPng(header(512,513,8,6),VOLCANO_ASSETS.lava),false);
 assert.equal(validVolcanoPng(header(512,512,16,6),VOLCANO_ASSETS.lava),false);
 assert.equal(validVolcanoPng(new Uint8Array(33),VOLCANO_ASSETS.lava),false);
});
test('input is disabled while paused, hidden, unfocused or portrait',()=>{
 const ready={hidden:false,focused:true,landscape:true,paused:false};
 assert.equal(volcanoControlsAllowed(ready),true);
 for(const key of ['hidden','focused','landscape','paused']){
   assert.equal(volcanoControlsAllowed({...ready,[key]:key==='focused'||key==='landscape'?false:true}),false);
 }
});
test('player uses eight-way facing and holds last facing at rest',()=>{
 assert.equal(volcanoFacing({x:1,y:0}),'e');
 assert.equal(volcanoFacing({x:1,y:1}),'se');
 assert.equal(volcanoFacing({x:0,y:-1}),'n');
 assert.equal(volcanoFacing({x:-1,y:-1}),'nw');
 assert.equal(volcanoFacing({x:0,y:0},'sw'),'sw');
});
