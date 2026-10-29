import test from 'node:test';
import assert from 'node:assert/strict';
import {introductionBounds,introductionVisible,introductionSpawnPoint,eligibleIntroductionEnemy} from '../src/intro-visibility.js';
import {DIALOGUES} from '../src/dialogue-data.js';
test('full art canvas, not world-center, must fit viewport',()=>{
 const view={x:0,y:0,width:800,height:360};
 assert.ok(introductionVisible('bocianolak',400,240,view));
 assert.ok(!introductionVisible('bocianolak',40,240,view));
 assert.ok(!introductionVisible('zubrokryptyda',400,35,view));
 assert.ok(introductionVisible('zubrokryptyda',400,240,view));
 assert.ok(introductionBounds('zubrokryptyda',400,240).right-introductionBounds('zubrokryptyda',400,240).left>100);
});
test('safe on-screen candidate is optional, blocked candidates preserve normal fallback path',()=>{
 const view={x:600,y:400,width:800,height:360},player={x:1000,y:600};
 const candidate=introductionSpawnPoint('bocianolak',player,[],view,18);
 assert.ok(candidate);
 assert.ok(introductionVisible('bocianolak',candidate.x,candidate.y,view));
 assert.ok(Math.hypot(candidate.x-player.x,candidate.y-player.y)>=220);
 const blocked=[{type:'rock',alive:true,x:candidate.x,y:candidate.y}];
 assert.notDeepEqual(introductionSpawnPoint('bocianolak',player,blocked,view,18),candidate);
 assert.equal(introductionSpawnPoint('zubrokryptyda',player,[],{x:800,y:500,width:320,height:240},30),null);
});
test('only scene 3 changes Wald ek lines, all four dialogues remain',()=>{
 assert.equal(Object.keys(DIALOGUES).length,4);
 assert.equal(DIALOGUES['before-first-zubrokryptyda'][0][1],'ŻUBROKRYPTYDA');
 assert.equal(DIALOGUES['before-first-zubrokryptyda'][0][2],'Nikt nie będzie bezprawnie mordował naszych przyjaciół!');
 assert.equal(DIALOGUES['before-first-zubrokryptyda'][1][2],'Waldek, pokaż mu, gdzie raki zimują!');
});

test('pending intro selects next living visible specimen, never offscreen/dead, no mutation',()=>{
 const view={x:0,y:0,width:800,height:360};
 for(const type of ['bocianolak','zubrokryptyda']){
  const original={type,x:780,y:240,hp:8,dead:false,seed:11};
  const successor={type,x:390,y:240,hp:8,dead:false,seed:12};
  const enemies=[original,successor];
  assert.equal(eligibleIntroductionEnemy(type,[original],view),null,'outside camera remains pending');
  assert.equal(eligibleIntroductionEnemy(type,enemies,view),successor,'select later visible');
  original.x=400;original.dead=true;
  assert.equal(eligibleIntroductionEnemy(type,enemies,view),successor,'dead candidate ignored');
  successor.hp=0;
  assert.equal(eligibleIntroductionEnemy(type,enemies,view),null,'all dead, still pending');
  successor.hp=8;successor.x=400;
  assert.equal(eligibleIntroductionEnemy(type,enemies,view),successor,'later specimen becomes visible');
  assert.equal(enemies.length,2,'no extra spawn');
 }
});
