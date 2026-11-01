import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntroEvidence,rememberOrdinaryDeath,introductionEvidence,claimIntroduction,MAX_DEATHS} from '../src/introduction-evidence.js';
import {createDirector,directorOpportunity} from '../src/encounter-director.js';
const B='before-first-bocianolak',Z='before-first-zubrokryptyda';
const kill=(s,type,wave,at,other={})=>rememberOrdinaryDeath(s,{type,wave,at,...other});
const ready=(s,id,wave,at,visible=true,previousIntroduced=false,boss=false)=>introductionEvidence(s,id,{wave,at,visible,previousIntroduced,boss});
test('recent bobrozombi kill before/after visible Bocianołak and exactly once',()=>{
 for(const arrivalFirst of [false,true]){
  const s=createIntroEvidence();
  if(arrivalFirst)assert.equal(ready(s,B,1,36000),null);
  kill(s,'bobrozombi',1,36500);
  assert.ok(ready(s,B,1,arrivalFirst?36500:38000));
  assert.equal(claimIntroduction(s,ready(s,B,1,38000)),true);
  assert.equal(claimIntroduction(s,ready(s,B,1,38000)),false);
  assert.equal(ready(s,B,1,38000),null);
 }
});
test('stale/pre-wave Bobrozombi deaths, invisible specimen, and kill during wave one never authorize',()=>{
 const s=createIntroEvidence();
 kill(s,'bobrozombi',0,34999);
 assert.equal(ready(s,B,1,35000),null);
 kill(s,'bobrozombi',1,36000);
 assert.equal(ready(s,B,1,41001),null);
 assert.equal(ready(s,B,1,39999,false),null);
 assert.ok(ready(s,B,1,40000));
});
test('heavy requires prior Bocianołak intro and two last-eight-second ordinary kills, one in wave three',()=>{
 const s=createIntroEvidence();
 kill(s,'bobrozombi',1,119000);kill(s,'bocianolak',2,121000);
 assert.equal(ready(s,Z,2,121000,true,false),null);
 assert.ok(ready(s,Z,2,121000,true,true));
 assert.equal(ready(s,Z,2,127001,true,true),null);
 kill(s,'bobrozombi',2,127001);
 assert.ok(ready(s,Z,2,127001,true,true));
 const c=ready(s,Z,2,127001,true,true);
 assert.ok(claimIntroduction(s,c));
 assert.equal(ready(s,Z,2,127001,true,true),null);
 assert.deepEqual(s.contexts.get(Z).killTimes,c.killTimes);
});
test('insufficient, stale, pre-wave-three only, and scripted deaths never trigger heavy',()=>{
 const s=createIntroEvidence();
 kill(s,'bobrozombi',1,115000);kill(s,'bobrozombi',1,116000);
 assert.equal(ready(s,Z,2,120000,true,true),null);
 kill(s,'zubrokryptyda',2,126000,{special:true});
 assert.equal(ready(s,Z,2,126000,true,true),null);
 kill(s,'bocianolak',2,126001,{playerEarned:false});
 assert.equal(ready(s,Z,2,126001,true,true),null);
 kill(s,'bocianolak',2,126002);assert.equal(ready(s,Z,2,126002,true,true),null);
 kill(s,'bobrozombi',2,126100);assert.ok(ready(s,Z,2,126100,true,true));
 assert.equal(ready(s,Z,2,126100,true,true,true),null);
});
test('paused active clock preserves kill recency and history is bounded',()=>{
 const s=createIntroEvidence();kill(s,'bobrozombi',1,36000);
 // Wall time may advance for minutes; gameplay elapsed remains unchanged.
 assert.ok(ready(s,B,1,38000));
 for(let i=0;i<100;i++)kill(s,'bobrozombi',1,50000+i*10);
 assert.equal(s.deaths.length,MAX_DEATHS);
 assert.ok(s.deaths.every(d=>d.at>=50000));
});
test('waiting dialogue never changes director pressure, wave and boss are not gated',()=>{
 const d=createDirector(41);const s=createIntroEvidence();
 let spawned=0;
 for(let t=35000;t<44000;t+=500){
  const o=directorOpportunity(d,{elapsedMs:t,wave:1,population:{living:0,visible:0,nearby:0},introPending:false});
  if(o.spawn)spawned++;
  assert.equal(ready(s,B,1,t),null);
 }
 assert.ok(spawned>=9);
 assert.equal(ready(s,B,5,260000,true,false,true),null);
});
