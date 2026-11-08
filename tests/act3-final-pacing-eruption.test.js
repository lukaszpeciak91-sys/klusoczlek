import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {PLAYER_RADIUS} from '../src/movement.js';
import {VOLCANO_START,volcanoFootprintAllowed} from '../src/volcano-contract.js';
import {VOLCANO_ZONES,zoneForPosition,findZoneSpawn,approachEngagementDue,APPROACH_WAKE_DISTANCE,createPlatformProgression} from '../src/volcano-platforms.js';
import {LAVA_TYPES,createLavaEnemy,lavaEnemyStep} from '../src/volcano-combat.js';
import {apartmentReached,findMarlenaRoute} from '../src/volcano-bogdan.js';
import {eruptionFrame,ERUPTION_SEQUENCES,ERUPTION_CYCLE_MS,ERUPTION_GLOW_MS} from '../src/volcano-eruption.js';
import {createVolcanoFinaleState,ESCAPE_MS} from '../src/volcano-finale.js';

function productionAlphaMask(){
 const png=readFileSync(new URL('../public/assets/arenas/act3-volcano.png',import.meta.url));
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20),channels=4,stride=width*channels;
 assert.deepEqual([width,height,png[24],png[25],png[28]],[1800,1200,8,6,0]);
 let i=8;const chunks=[];
 while(i<png.length){
  const length=png.readUInt32BE(i),kind=png.toString('ascii',i+4,i+8);
  if(kind==='IDAT')chunks.push(png.subarray(i+8,i+8+length));
  i+=length+12;if(kind==='IEND')break;
 }
 const inflated=inflateSync(Buffer.concat(chunks)),pixels=new Uint8Array(width*height);
 let at=0,last=Buffer.alloc(stride);
 for(let y=0;y<height;y++){
  const filter=inflated[at++],row=Buffer.allocUnsafe(stride);
  for(let x=0;x<stride;x++){
   const left=x>=4?row[x-4]:0,up=last[x],diagonal=x>=4?last[x-4]:0;
   let p=0;
   if(filter===1)p=left;
   else if(filter===2)p=up;
   else if(filter===3)p=(left+up)>>1;
   else if(filter===4){
    const v=left+up-diagonal,a=Math.abs(v-left),b=Math.abs(v-up),c=Math.abs(v-diagonal);
    p=a<=b&&a<=c?left:b<=c?up:diagonal;
   }else assert.equal(filter,0);
   row[x]=(inflated[at++]+p)&255;
  }
  for(let x=0;x<width;x++)pixels[y*width+x]=row[x*4+3]>=32?1:0;
  last=row;
 }
 return {width,height,pixels};
}
const mask=productionAlphaMask();
function stageAll(){
 const staged=[];const avoid=[{...VOLCANO_START,radius:110}];
 for(const zone of VOLCANO_ZONES.filter(z=>z.id!=='fairy')){
  for(const [i,type] of zone.enemies.entries()){
   const radius=LAVA_TYPES[type].radius;
   const search=zone.id==='entrance'?65:zone.id==='apartment-approach'?80:zone.id==='fairy'?260:125;
   const point=findZoneSpawn(mask,zone,zone.spawns[i],radius,avoid,search);
   if(!point)throw Error('Unwalkable staged enemy '+zone.id+'/'+i+' preferred '+JSON.stringify(zone.spawns[i]));
   staged.push({zoneId:zone.id,type,...point,radius,engaged:false,dead:false});
   avoid.push({...point,radius});
  }
 }
 return staged;
}
test('production PNG: 3 middle + 3 lower approach enemies stage without lava or overlaps',()=>{
 const staged=stageAll(),middle=staged.filter(x=>x.zoneId==='middle'),approach=staged.filter(x=>x.zoneId==='apartment-approach');
 assert.equal(middle.length,3);assert.equal(approach.length,3);
 for(const enemy of approach){
  assert.ok(volcanoFootprintAllowed(mask,enemy.x,enemy.y,enemy.radius));
  assert.ok(!apartmentReached(enemy),'approach enemy next to apartment cutscene');
  assert.ok(enemy.y>565,'approach should precede the apartment');
  assert.ok(Math.hypot(enemy.x-1300,enemy.y-370)>260,'breathing room before Bogdan');
  assert.ok(staged.every(other=>other===enemy||Math.hypot(enemy.x-other.x,enemy.y-other.y)>=enemy.radius+other.radius+12),
   'staging collision');
  assert.ok(findMarlenaRoute(mask,VOLCANO_START,enemy,{radius:PLAYER_RADIUS,cell:12,maxNodes:26000})?.length,
   'inaccessible approach enemy');
 }
 console.log('Act III middle actual positions:',middle.map(e=>({x:e.x,y:e.y})));
 console.log('Act III approach actual positions:',approach.map(e=>({x:e.x,y:e.y})));
});
test('approach wake occurs near real staged actors while middle zone remains available',()=>{
 const staged=stageAll(),enemies=staged.filter(e=>e.zoneId==='apartment-approach');
 const closest=enemies[0];
 assert.equal(approachEngagementDue({x:closest.x,y:closest.y+APPROACH_WAKE_DISTANCE+1},[closest]),false);
 assert.equal(approachEngagementDue({x:closest.x,y:closest.y+APPROACH_WAKE_DISTANCE},[closest]),true);
 assert.equal(approachEngagementDue({x:closest.x,y:closest.y},enemies),true);
 assert.equal(approachEngagementDue({x:closest.x,y:closest.y},enemies.map(e=>({...e,engaged:true}))),false);
 assert.equal(zoneForPosition({x:900,y:920}),'middle');
 const progress=createPlatformProgression();
 assert.equal(progress.activate('middle',()=>true),true);
 assert.equal(progress.activate('middle',()=>{throw Error('duplicate middle wave');}),false);
 assert.equal(progress.activate('apartment-approach',()=>true),true);
 assert.equal(progress.activate('apartment-approach',()=>{throw Error('duplicate approach wave');}),false);
 assert.equal(progress.get('middle').alive,3);
 assert.equal(progress.get('apartment-approach').alive,3);
 assert.equal(progress.get('entrance').activated,false);
});
test('approach has movement-ready AI and never activates while dialogue is running',()=>{
 const staged=stageAll(),e=staged.find(x=>x.zoneId==='apartment-approach');
 const enemy=createLavaEnemy(e.type,e.x,e.y);
 const moved=lavaEnemyStep(enemy,{x:e.x-110,y:e.y+85},16,1000,mask);
 assert.ok(Math.hypot(moved.x-e.x,moved.y-e.y)>0,'enemy frozen on valid ground');
 const combat=readFileSync(new URL('../src/volcano-combat.js',import.meta.url),'utf8');
 assert.ok(combat.includes('scene.dialogueState.id){stopFire();return;}'));
 assert.ok(combat.includes('approachEngagementDue(scene.player,enemies.filter('));
 assert.ok(combat.includes("activateZone('apartment-approach')"));
 assert.ok(combat.includes('scene.lawosComplete&&!scene.apartmentPending'));
});
test('eruption phases are 2.5s/3.5s/4s with escalating irregular short jolts and quiet gaps',()=>{
 assert.deepEqual(ERUPTION_SEQUENCES.map(s=>s.duration),[2500,3500,4000]);
 assert.equal(ERUPTION_CYCLE_MS,10000);
 for(const sequence of ERUPTION_SEQUENCES){
  let end=0;
  for(const beat of sequence.beats){
   assert.ok(beat.at>=end,'overlapping shakes');
   assert.ok(beat.duration>=200&&beat.duration<=450);
   assert.ok(beat.intensity<=.01,'mobile camera shake limit');
   end=beat.at+beat.duration;
  }
  assert.ok(sequence.duration-end>=400,'must have a quiet interval before next chapter');
  assert.ok(sequence.duration-sequence.beats.at(-1).at-ERUPTION_GLOW_MS>=200,'rest after last lava glow');
 }
 assert.ok(Math.max(...ERUPTION_SEQUENCES[2].beats.map(e=>e.intensity))>
  Math.max(...ERUPTION_SEQUENCES[1].beats.map(e=>e.intensity)));
 assert.ok(Math.max(...ERUPTION_SEQUENCES[1].beats.map(e=>e.intensity))>
  Math.max(...ERUPTION_SEQUENCES[0].beats.map(e=>e.intensity)));
 assert.equal(eruptionFrame(2500).sequence,'collapse');
 assert.equal(eruptionFrame(6000).sequence,'critical');
 assert.equal(eruptionFrame(10000).sequence,'rupture');
 for(const [phase,offset] of [0,2500,6000].entries()){
  const sequence=ERUPTION_SEQUENCES[phase];
  for(const [index,beat] of sequence.beats.entries()){
   const at=offset+beat.at+10;
   const frame=eruptionFrame(at);
   assert.ok(frame.shake,'missing scheduled impulse');
   assert.equal(frame.shake.duration,beat.duration);
   assert.equal(frame.shake.intensity,beat.intensity);
   assert.equal(frame.shake.id,phase*10+index);
   assert.ok(eruptionFrame(at+beat.duration).shake===null||eruptionFrame(at+beat.duration).shake?.id!==frame.shake.id);
  }
 }
});
test('lava pulses are bounded, short and reset on finale success, retry or shutdown',()=>{
 for(let ms=0;ms<30000;ms+=40){
  const frame=eruptionFrame(ms);
  assert.ok(frame.lavaAlpha>=.86&&frame.lavaAlpha<=1);
  assert.ok(frame.pulse>=0&&frame.pulse<=1);
 }
 const quiet=eruptionFrame(9900);
 assert.equal(quiet.shake,null);assert.equal(quiet.lavaTint,null);
 const scene=readFileSync(new URL('../src/volcano-scene.js',import.meta.url),'utf8');
 assert.ok(scene.includes('this.updateEruption();'));
 assert.ok(scene.includes('this.cameras.main.shakeEffect.reset();'));
 assert.ok(scene.includes('this.escapeLastImpulse=null;'));
 assert.ok(scene.includes("if(frame.lavaTint===null)this.lava.clearTint();"));
 assert.ok(scene.includes('this.resetEruption();'));
 const finale=createVolcanoFinaleState();
 for(const state of ['BOGDAN_ACTIVE','BOGDAN_DEFEATED','FINAL_DIALOGUE','ARTIFACT_REWARD','BOGDAN_EXPLOSION','ALOES_WARNING'])assert.ok(finale.advance(state));
 assert.equal(finale.remaining,ESCAPE_MS);
 assert.equal(finale.tick(ESCAPE_MS),true);
 assert.equal(finale.state,'ESCAPE_RETRY');
 assert.equal(finale.retry(),true);
 assert.equal(finale.remaining,ESCAPE_MS);
 assert.equal(finale.advance('ESCAPE_ACTIVE'),true);
 assert.equal(finale.advance('CAPTAIN_EXTRACTION'),true);
 assert.equal(finale.completed,true);
});
test('PR102 entrance coordinates and immediate pursuit are preserved',()=>{
 const opening=VOLCANO_ZONES[0];
 assert.deepEqual(opening.spawns.slice(0,2),[{x:355,y:815},{x:480,y:820}]);
 const scene=readFileSync(new URL('../src/volcano-scene.js',import.meta.url),'utf8');
 const combat=readFileSync(new URL('../src/volcano-combat.js',import.meta.url),'utf8');
 assert.ok(scene.includes('lawosDialogueTrigger(this.combat.enemies.filter('));
 assert.ok(scene.includes('this.openingSafeUntil=this.time.now+1100'));
 assert.ok(!combat.includes('if(openingSafe){clearBark(enemy.barkState,enemy.bark);continue;}'));
});
