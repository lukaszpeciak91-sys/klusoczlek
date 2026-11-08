import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {PLAYER_RADIUS} from '../src/movement.js';
import {VOLCANO_START,volcanoFootprintAllowed} from '../src/volcano-contract.js';
import {VOLCANO_ZONES,findZoneSpawn,lawosDialogueTrigger,lawosTriggerReached,createPlatformProgression} from '../src/volcano-platforms.js';
import {LAVA_TYPES,createLavaEnemy,lavaEnemyStep,lawosContactProtected} from '../src/volcano-combat.js';
import {findMarlenaRoute} from '../src/volcano-bogdan.js';

// Read the actual approved RGBA PNG, not an invented rectangular walkability mock.
// PNG reconstruction is intentionally local to this test; no production decoder change.
function approvedTerrainMask(){
 const png=readFileSync(new URL('../public/assets/arenas/act3-volcano.png',import.meta.url));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20),bpp=4,stride=width*bpp;
 assert.deepEqual([width,height,png[24],png[25],png[28]],[1800,1200,8,6,0]);
 let offset=8;const chunks=[];
 while(offset<png.length){
  const bytes=png.readUInt32BE(offset),name=png.toString('ascii',offset+4,offset+8);
  if(name==='IDAT')chunks.push(png.subarray(offset+8,offset+8+bytes));
  offset+=bytes+12;
  if(name==='IEND')break;
 }
 const raw=inflateSync(Buffer.concat(chunks));
 assert.equal(raw.length,height*(stride+1));
 const pixels=new Uint8Array(width*height);
 let previous=Buffer.alloc(stride),cursor=0;
 for(let y=0;y<height;y++){
  const filter=raw[cursor++],current=Buffer.allocUnsafe(stride);
  for(let x=0;x<stride;x++){
   const left=x>=bpp?current[x-bpp]:0,up=previous[x],upperLeft=x>=bpp?previous[x-bpp]:0;
   let predictor=0;
   if(filter===1)predictor=left;
   else if(filter===2)predictor=up;
   else if(filter===3)predictor=Math.floor((left+up)/2);
   else if(filter===4){
    const p=left+up-upperLeft,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-upperLeft);
    predictor=a<=b&&a<=c?left:b<=c?up:upperLeft;
   }else assert.equal(filter,0,'supported PNG row filter');
   current[x]=(raw[cursor++]+predictor)&255;
  }
  for(let x=0;x<width;x++)pixels[y*width+x]=current[x*4+3]>=32?1:0;
  previous=current;
 }
 return {width,height,pixels};
}
const terrain=approvedTerrainMask(),entrance=VOLCANO_ZONES[0];
function stagedEntrance(){
 const placed=[],avoid=[{...VOLCANO_START,radius:110}];
 for(const [index,type] of entrance.enemies.entries()){
  const def=LAVA_TYPES[type],point=findZoneSpawn(terrain,entrance,entrance.spawns[index],def.radius,avoid,65);
  assert.ok(point,'upper-platform spawn missing for '+type+' at '+JSON.stringify(entrance.spawns[index]));
  placed.push({...point,type,radius:def.radius});
  avoid.push({...point,radius:def.radius});
 }
 return placed;
}
test('real PNG alpha: both opening enemies stage on separated, walkable upper ground',()=>{
 assert.ok(volcanoFootprintAllowed(terrain,VOLCANO_START.x,VOLCANO_START.y,PLAYER_RADIUS));
 const enemies=stagedEntrance();
 for(const enemy of enemies){
  assert.ok(volcanoFootprintAllowed(terrain,enemy.x,enemy.y,enemy.radius),'full enemy footprint on terrain');
  assert.ok(enemy.y<=885,'enemy must stay on the higher entrance platform');
  assert.ok(Math.hypot(enemy.x-VOLCANO_START.x,enemy.y-VOLCANO_START.y)>165,'too close to Aloes');
  assert.ok(findMarlenaRoute(terrain,VOLCANO_START,enemy,{radius:PLAYER_RADIUS,cell:12,maxNodes:22000})?.length,
   'enemy must be reachable by the approved entrance walkable route');
 }
 assert.ok(Math.hypot(enemies[0].x-enemies[1].x,enemies[0].y-enemies[1].y)>95,'Lawostworki overlap visually');
 console.log('Real alpha-validated entrance:',enemies);
});
test('dialogue trigger is anchored to the actual spawns, ahead of contact and not at scene start',()=>{
 const enemies=stagedEntrance(),trigger=lawosDialogueTrigger(enemies);
 assert.ok(trigger);
 assert.equal(lawosTriggerReached(VOLCANO_START,trigger),false);
 assert.ok(Math.hypot(trigger.x-VOLCANO_START.x,trigger.y-VOLCANO_START.y)>trigger.radius+35);
 assert.ok(enemies.every(e=>Math.hypot(e.x-trigger.x,e.y-trigger.y)<trigger.radius));
 const approaching={x:trigger.x,y:trigger.y+trigger.radius};
 assert.equal(lawosTriggerReached(approaching,trigger),true);
 assert.ok(enemies.every(e=>Math.hypot(e.x-approaching.x,e.y-approaching.y)>e.radius+PLAYER_RADIUS+55),
  'trigger boundary must precede melee contact');
 assert.equal(lawosDialogueTrigger([]),null);
});
test('DEBUG Lawostworki approach remains walkable and safely pre-contact',()=>{
 const enemies=stagedEntrance(),point=findZoneSpawn(terrain,entrance,{x:385,y:930},PLAYER_RADIUS,[],100);
 assert.ok(point);
 assert.ok(enemies.every(e=>Math.hypot(e.x-point.x,e.y-point.y)>e.radius+PLAYER_RADIUS+55));
});
test('dialogue freezes combat but post-dialogue AI can move during contact grace',()=>{
 assert.equal(lawosContactProtected(2000,3100),true);
 assert.equal(lawosContactProtected(3100,3100),false);
 const width=1800,height=1200,mask={width,height,pixels:new Uint8Array(width*height).fill(1)};
 const enemy=createLavaEnemy('lawostworek-1',350,750,0),player={x:350,y:950};
 const next=lavaEnemyStep(enemy,player,16,2000,mask);
 assert.ok(Math.hypot(next.x-enemy.x,next.y-enemy.y)>0,'AI movement must not wait for grace');
 const scene=readFileSync(new URL('../src/volcano-scene.js',import.meta.url),'utf8');
 const combat=readFileSync(new URL('../src/volcano-combat.js',import.meta.url),'utf8');
 assert.ok(combat.includes('scene.dialogueState.id){stopFire();return;}'),'attacks blocked during dialogue');
 assert.ok(combat.includes('if(!openingSafe&&Math.hypot('),'only contact is guarded');
 assert.ok(!combat.includes('if(openingSafe){clearBark(enemy.barkState,enemy.bark);continue;}'),'no AI grace freeze');
 assert.ok(scene.includes('this.openingSafeUntil=this.time.now+1100'));
});
test('entrance activation is one-shot and two kills preserve zone progression',()=>{
 const p=createPlatformProgression();
 assert.equal(p.activate('entrance',()=>true),true);
 assert.equal(p.activate('entrance',()=>{throw Error('duplicate activation');}),false);
 assert.equal(p.get('entrance').alive,2);
 assert.equal(p.defeated('entrance'),false);
 assert.equal(p.defeated('entrance'),true);
 assert.equal(p.get('entrance').cleared,true);
 assert.equal(p.get('middle').activated,false);
 assert.equal(p.get('fairy').activated,false);
});
