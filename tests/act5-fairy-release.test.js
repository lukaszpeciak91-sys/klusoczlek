import test from 'node:test';
import assert from 'node:assert/strict';
import {CATACOMBS,catacombsFairyArrival,catacombsWalkable} from '../src/catacombs-contract.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
test('approved fairy point is retained when safe',()=>{
 const result=catacombsFairyArrival(CATACOMBS.marianStart,CATACOMBS.playerStart);
 assert.deepEqual(result,CATACOMBS.fairyStart);
});
test('fairy arrival remains reachable for boss deaths close to preferred location',()=>{
 const preferred=CATACOMBS.fairyStart;
 for(const radius of [0,20,55,90,109]){
  for(let i=0;i<16;i++){
   const angle=i*Math.PI/8;
   const boss={x:preferred.x+Math.cos(angle)*radius,y:preferred.y+Math.sin(angle)*radius};
   const result=catacombsFairyArrival(boss,CATACOMBS.playerStart);
   assert.ok(result,'candidate should exist');
   assert.ok(catacombsWalkable(result,CATACOMBS.enemyRadius));
   assert.ok(distance(result,boss)>=110);
   assert.ok(distance(result,CATACOMBS.playerStart)>=CATACOMBS.enemyRadius+17+12);
  }
 }
});
test('fairy arrival stays fully visible above dialogue in mobile landscape',()=>{
 for(const [width,height] of [[568,320],[800,360],[844,390]]){
  const left=480-width/2,top=350-height/2;
  const reserve=Math.min(165,Math.max(112,height*.42));
  const bounds={left,right:left+width,top,bottom:top+height-reserve};
  const boss={...CATACOMBS.fairyStart};
  const result=catacombsFairyArrival(boss,CATACOMBS.playerStart,CATACOMBS.fairyStart,bounds);
  assert.ok(result, 'visible walkable fairy position required');
  assert.ok(result.x>=bounds.left+39&&result.x<=bounds.right-39);
  assert.ok(result.y>=bounds.top+39&&result.y<=bounds.bottom-39);
  assert.ok(distance(result,boss)>=110);
  assert.ok(catacombsWalkable(result,CATACOMBS.enemyRadius));
 }
});
test('fairy arrival avoids nearby player, altar and pillars',()=>{
 for(const player of [CATACOMBS.fairyStart,{x:500,y:390},{x:760,y:438}]){
  const result=catacombsFairyArrival(CATACOMBS.fairyStart,player);
  assert.ok(result&&catacombsWalkable(result,CATACOMBS.enemyRadius));
  assert.ok(distance(result,player)>=CATACOMBS.enemyRadius+17+12);
 }
});
test('intro positioning fits Marian transformation and Aloes in narrow landscape',()=>{
 assert.ok(catacombsWalkable(CATACOMBS.playerStart));
 assert.ok(catacombsWalkable(CATACOMBS.marianStart,CATACOMBS.bossRadius));
 const transformedHeight=256*.62*1.23;
 for(const height of [177,220,240,320,360,390]){
  const cameraCenterY=Math.min(200,height/2+40);
  const viewTop=cameraCenterY-height/2;
  assert.ok(CATACOMBS.marianStart.y-transformedHeight>=viewTop,
   'Marian head must remain visible even beneath Android browser bars');
  const spriteTop=CATACOMBS.playerStart.y-64*1.30/2;
  const spriteBottom=CATACOMBS.playerStart.y+64*1.30/2;
  const dialogueTop=height-Math.max(112,Math.min(108,Math.round(height*.32))+24)-12;
  assert.ok(spriteTop-viewTop<dialogueTop,'Aloes head must remain visible');
  if(height>=240)assert.ok(spriteBottom-viewTop<dialogueTop,
   'Aloes sprite must clear the dialogue panel when space allows');
 }
});
