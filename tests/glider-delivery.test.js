import test from 'node:test';
import assert from 'node:assert/strict';
import {GLIDER_DEMO,GLIDER_ART_PATH,GLIDER_ART_KEY,GLIDER_PHASES,
  LANDING_MS,landingPosition,makeFlight,stepFlight,stepLanding} from '../src/glider-delivery.js';
import {AIRSHIP_WORLD,insideDeck,AIRSHIP_LANDING_ZONES} from '../src/airship-contract.js';
import {BOBROZOMBI_ASSET,BOCIANOLAK_ASSET,ZUBROKRYPTYDA_ASSET} from '../src/enemy-visual.js';

test('airborne gliders compose existing approved enemy sprite identities and optional empty vehicle art',()=>{
  assert.deepEqual(GLIDER_DEMO.map(d=>d.type),['bobrozombi','bocianolak']);
  assert.equal(ZUBROKRYPTYDA_ASSET.path,'enemies/zubrokryptyda.png');
  assert.equal(BOBROZOMBI_ASSET.path,'enemies/bobrozombi.png');
  assert.equal(BOCIANOLAK_ASSET.path,'enemies/bocianolak.png');
  assert.equal(GLIDER_ART_PATH,'vehicles/hang-glider.png');
  assert.match(GLIDER_ART_KEY,/hang-glider/);
  assert.deepEqual(GLIDER_PHASES,['approaching','dropping','departing','finished']);
});
test('one passenger drop at most; flight departs and reaches cleaned finished state',()=>{
  for(const spec of GLIDER_DEMO){
    const flight=makeFlight(spec),landings=[];
    let drops=0,finished=0,phases=new Set(),landing=null;
    for(let n=0;n<130;n++){
      phases.add(flight.phase);
      const point=flight.phase==='dropping'?landingPosition(flight.zoneId,AIRSHIP_WORLD.start,[]):null;
      const event=stepFlight(flight,50,point);
      if(event.drop){drops++;landing={id:flight.id,type:flight.type,elapsed:0,finished:false};landings.push(landing);}
      if(event.finished)finished++;
    }
    assert.equal(drops,1,flight.id);
    assert.equal(landings.length,1);
    assert.equal(finished,1);
    assert.equal(flight.phase,'finished');
    assert.equal(flight.finished,true);
    assert.ok(flight.released);
    assert.ok(insideDeck(flight.landingPoint));
    assert.deepEqual([...phases],['approaching','dropping','departing','finished']);
    let touches=0;
    for(let n=0;n<30;n++)if(stepLanding(landing,50))touches++;
    assert.equal(touches,1);
    assert.equal(landing.elapsed,LANDING_MS);
    assert.equal(stepFlight(flight,50,landingPosition(flight.zoneId,AIRSHIP_WORLD.start,[])).drop,false);
  }
});
test('landing never overlaps player, existing ground passengers or rail margins',()=>{
  const first=landingPosition('port-aft',AIRSHIP_WORLD.start,[]);
  assert.ok(first&&insideDeck(first));
  const occupied=[{...first,radius:21}];
  const second=landingPosition('port-aft',AIRSHIP_WORLD.start,occupied,21);
  assert.ok(second&&insideDeck(second));
  assert.ok(Math.hypot(first.x-second.x,first.y-second.y)>=21+21+26);
  const forbidden=landingPosition('port-aft',{x:AIRSHIP_LANDING_ZONES[0].x,y:AIRSHIP_LANDING_ZONES[0].y},
    AIRSHIP_LANDING_ZONES.flatMap(z=>[[0,0],[32,30],[-32,-30],[38,-30],[-38,30]].map(([dx,dy])=>({x:z.x+dx,y:z.y+dy,radius:200}))));
  assert.equal(forbidden,null,'blocked gliders must not release passenger into unsafe placement');
});
test('blocked drop departs without fake ground enemy or infinite retries',()=>{
  const f=makeFlight(GLIDER_DEMO[0]);
  for(let i=0;i<150;i++)stepFlight(f,50,null);
  assert.equal(f.released,false);
  assert.equal(f.landingPoint,null);
  assert.equal(f.finished,true);
});
