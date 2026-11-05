import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRSHIP_PHASES,AIRSHIP_SURVIVAL_MS,AIRSHIP_GLIDER_CAP,AIRSHIP_GROUND_CAP,
 createAirshipDefense,nextDeliverySpec,tickAirshipDefense,currentDefensePhase,finishAirshipDefense} from '../src/airship-defense.js';
import {makeFlight,stepFlight,stepLanding,landingPosition,landingPointSafe,GLIDER_EXPANDED_SEARCH_MS}
 from '../src/glider-delivery.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';

const view=(ground,flights,landings)=>({
 ground:ground.length,
 airborne:flights.filter(f=>!f.finished).length,
 pending:flights.filter(f=>!f.finished&&!f.released&&!f.blocked).length+
   landings.filter(l=>!l.finished).length,
});
function simulate(killMs,scenario){
 const d=createAirshipDefense();d.state='active';
 const ground=[],flights=[],landings=[],ids=new Set(),launches=[],phaseCounts=[0,0,0];
 let landed=0,blocked=0,maxAirborne=0,maxThreat=0,capacityMs=0;
 let lastCovered=0,maxGap=0,firstLaunch=null,complete=false;
 let overlapping=false,crowdedWithIncoming=false;
 const player={x:480,y:350};
 tickAirshipDefense(d,0,{active:true,ground:0,airborne:0,pending:0});
 for(let ms=50;ms<=AIRSHIP_SURVIVAL_MS;ms+=50){
  // Independent model of kill cadence; existing combat HP and damage remain unchanged.
  for(let i=ground.length-1;i>=0;i--)if(ms-ground[i].born>=killMs)ground.splice(i,1);
  const counts=view(ground,flights,landings);
  const threats=counts.ground+counts.pending;
  maxAirborne=Math.max(maxAirborne,counts.airborne);
  maxThreat=Math.max(maxThreat,threats);
  assert.ok(counts.airborne<=AIRSHIP_GLIDER_CAP);
  assert.ok(threats<=AIRSHIP_GROUND_CAP);
  if(threats===AIRSHIP_GROUND_CAP||counts.airborne===AIRSHIP_GLIDER_CAP)capacityMs+=50;
  if(firstLaunch!==null){
   if(threats>0){maxGap=Math.max(maxGap,ms-lastCovered-50);lastCovered=ms;}
  }
  if(counts.ground>=2&&counts.pending>=1)crowdedWithIncoming=true;
  const event=tickAirshipDefense(d,ms,{active:true,...counts});
  if(event?.outcome){assert.equal(event.outcome,'survived');complete=true;break;}
  if(event?.delivery){
   const spec=event.delivery;
   assert.equal(ids.has(spec.id),false,'duplicate flight id');
   ids.add(spec.id);
   const occupied=[...ground,...landings.filter(l=>!l.finished),
     ...flights.filter(f=>!f.finished&&!f.released&&!f.blocked&&f.landingPoint)
       .map(f=>({...f.landingPoint,radius:ENEMY_TYPES[f.type].radius}))];
   const safe=landingPosition(spec.zoneId,player,occupied,ENEMY_TYPES[spec.type].radius);
   const f=makeFlight(spec,safe);
   f.groupId=spec.groupId;flights.push(f);
   launches.push({ms,groupId:spec.groupId,type:spec.type,from:spec.from.x});
   if(firstLaunch===null)firstLaunch=ms;
   phaseCounts[currentDefensePhase(ms)]++;
   if(launches.some(x=>x.groupId!==spec.groupId&&x.ms<ms&&x.ms>ms-15000))overlapping=true;
  }
  for(const flight of flights){
   if(flight.finished)continue;
   const occupied=[...ground,...landings.filter(l=>!l.finished),
     ...flights.filter(f=>f!==flight&&!f.finished&&!f.released&&!f.blocked&&f.landingPoint)
       .map(f=>({...f.landingPoint,radius:ENEMY_TYPES[f.type].radius}))];
   const radius=ENEMY_TYPES[flight.type].radius;
   const point=!flight.released&&flight.phase!=='departing'
     ?(landingPointSafe(flight.landingPoint,player,occupied,radius)?flight.landingPoint:
       landingPosition(flight.zoneId,player,occupied,radius,flight.age>=GLIDER_EXPANDED_SEARCH_MS))
     :null;
   const e=stepFlight(flight,50,point);
   if(e.drop){
    assert.ok(flight.landingPoint);
    assert.ok(Math.abs(flight.x-flight.landingPoint.x)<=1.5);
    landings.push({id:flight.id,type:flight.type,x:flight.landingPoint.x,y:flight.landingPoint.y,
      radius,elapsed:0,finished:false});
   }
   if(e.blocked)blocked++;
  }
  for(const landing of landings){
   if(landing.finished)continue;
   if(stepLanding(landing,50)){
    landed++;
    ground.push({x:landing.x,y:landing.y,radius:landing.radius,born:ms});
   }
  }
 }
 assert.equal(complete,true);
 assert.equal(d.elapsedMs,AIRSHIP_SURVIVAL_MS);
 assert.ok(firstLaunch<=1500,'first assault promptly follows dialogue');
 assert.ok(ids.size>=12,'director cannot starve across full survival');
 assert.ok(phaseCounts.every(n=>n>0),'must sustain all three phases');
 assert.ok(maxAirborne<=2&&maxThreat<=7);
 assert.ok(launches.some((l,i)=>i&&l.groupId===launches[i-1].groupId),'short stagger within assault');
 assert.ok(launches.some((l,i)=>i&&l.from===launches[i-1].from),'avoid strict alternation');
 assert.ok(launches.some(l=>l.type==='bocianolak')&&launches.some(l=>l.type==='bobrozombi'));
 assert.ok(overlapping,'different groups launched while prior threats may remain');
 const result={scenario,planned:d.plannedCount,launched:ids.size,landed,blocked,
  pending:d.groups.reduce((n,g)=>n+g.size-g.launched,0),
  maxAirborne,maxThreat,maxGapMs:maxGap,capacityS:Number((capacityMs/1000).toFixed(2)),
  byPhase:phaseCounts,overlapping,crowdedWithIncoming,
  trace:launches.map(x=>[x.ms,x.groupId,x.type,x.from])};
 assert.equal(finishAirshipDefense(d,'survived'),true);
 assert.equal(d.groups.length,0);
 assert.equal(finishAirshipDefense(d,'defeat'),false);
 return result;
}
test('PR77 grouped pacing and entry direction are phase-scaled, deterministic, and nonalternating',()=>{
 assert.deepEqual(AIRSHIP_PHASES.map(p=>[p.groupMin,p.groupMax]),[[2,3],[3,4],[4,5]]);
 assert.ok(AIRSHIP_PHASES[0].groupMs>AIRSHIP_PHASES[1].groupMs&&AIRSHIP_PHASES[1].groupMs>AIRSHIP_PHASES[2].groupMs);
 assert.ok(AIRSHIP_PHASES[0].launchMs>AIRSHIP_PHASES[1].launchMs&&AIRSHIP_PHASES[1].launchMs>AIRSHIP_PHASES[2].launchMs);
 const first=Array.from({length:16},(_,i)=>nextDeliverySpec(i,i<5?0:i<10?1:2,Math.floor(i/3),i%4));
 const sides=first.map(s=>s.from.x);
 assert.ok(sides.includes(125)&&sides.includes(835));
 assert.ok(sides.some((side,i)=>i&&side===sides[i-1]));
 assert.equal(new Set(first.map(s=>s.id)).size,16);
 assert.ok(first.some(s=>s.type==='bocianolak'));
});
test('PR77 no launches before combat, during pause, or after outcome and exactly at 180s',()=>{
 const d=createAirshipDefense(),free={ground:0,airborne:0,pending:0};
 assert.equal(tickAirshipDefense(d,50000,{active:true,...free}),null);
 assert.equal(d.plannedCount,0);
 d.state='active';
 tickAirshipDefense(d,90000,{active:true,...free});
 tickAirshipDefense(d,91500,{active:true,...free});
 const elapsed=d.elapsedMs, launched=d.deliveryOrdinal;
 assert.equal(tickAirshipDefense(d,190000,{active:false,...free}),null);
 tickAirshipDefense(d,260000,{active:true,...free});
 assert.equal(d.elapsedMs,elapsed,'pause cannot advance combat clock');
 const resume=tickAirshipDefense(d,260050,{active:true,...free});
 assert.ok(d.deliveryOrdinal-launched<=1,'no catch-up burst after focus resume');
 d.clock.elapsedMs=179999;
 assert.deepEqual(tickAirshipDefense(d,260100,{active:true,...free}),{outcome:'survived'});
 finishAirshipDefense(d,'survived');
 assert.equal(tickAirshipDefense(d,300000,{active:true,...free}),null);
});
test('PR77 backpressure preserves scheduled group and resumes one glider at a time',()=>{
 const d=createAirshipDefense();d.state='active';
 const open={ground:0,airborne:0,pending:0};
 tickAirshipDefense(d,0,{active:true,...open});
 let e;
 for(let t=50;t<=1250;t+=50)e=tickAirshipDefense(d,t,{active:true,...open});
 assert.ok(e?.delivery);
 const ord=d.deliveryOrdinal,planned=d.plannedCount;
 for(let t=1300;t<=9000;t+=50){
  const full=tickAirshipDefense(d,t,{active:true,ground:6,airborne:1,pending:1});
  assert.equal(full,null);
 }
 assert.equal(d.deliveryOrdinal,ord);
 assert.ok(d.plannedCount>=planned);
 e=tickAirshipDefense(d,9050,{active:true,...open});
 assert.ok(e?.delivery);
 assert.equal(d.deliveryOrdinal,ord+1);
 assert.equal(tickAirshipDefense(d,9100,{active:true,...open}),null,'no burst next frame');
 assert.ok(d.groups.length<=2);
});
for(const [name,killMs] of [['fast elimination',1700],['typical elimination',6800],['crowded slow elimination',30000]]){
 test('PR77 full 180s deterministic flight/landing/cap simulation — '+name,()=>{
  const result=simulate(killMs,name);
  const copy=simulate(killMs,name);
  assert.deepEqual(copy,result,'identical inputs produce deterministic boarding behavior');
  console.log('PR77 SIMULATION '+JSON.stringify({...result,trace:undefined}));
 });
}
