import test from 'node:test';
import assert from 'node:assert/strict';
import {GLIDER_DEMO,GLIDER_ART_PATH,GLIDER_ART_KEY,GLIDER_PHASES,
  LANDING_MS,GLIDER_HOLD_MS,GLIDER_EXPANDED_SEARCH_MS,landingPosition,makeFlight,stepFlight,stepLanding} from '../src/glider-delivery.js';
import {AIRSHIP_WORLD,insideDeck,AIRSHIP_LANDING_ZONES,WHEELHOUSE_FOOTPRINT} from '../src/airship-contract.js';
import {BOBROZOMBI_ASSET,BOCIANOLAK_ASSET,ZUBROKRYPTYDA_ASSET} from '../src/enemy-visual.js';
import {GLIDER_FRAME_SIZE,GLIDER_SHEET_WIDTH,GLIDER_SHEET_HEIGHT,GLIDER_DIRECTION_ORDER,flightDirectionFrame} from '../src/glider-spritesheet.js';
import {ENEMY_TYPES} from '../src/enemy-types.js';
import {createAirshipDefense,tickAirshipDefense,AIRSHIP_SURVIVAL_MS,AIRSHIP_GROUND_CAP,AIRSHIP_GLIDER_CAP} from '../src/airship-defense.js';

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
test('blocked landing holds attached passenger, retries, then drops once when clear',()=>{
  const f=makeFlight(GLIDER_DEMO[0]);
  for(let i=0;i<110;i++)stepFlight(f,50,null);
  assert.equal(f.phase,'dropping');
  assert.equal(f.released,false);
  assert.equal(f.finished,false);
  const safe=landingPosition(f.zoneId,AIRSHIP_WORLD.start,[]);
  const result=stepFlight(f,50,safe);
  assert.equal(result.drop,true);
  assert.equal(f.released,true);
  assert.equal(f.phase,'departing');
  let finished=0;
  for(let i=0;i<100;i++)if(stepFlight(f,50).finished)finished++;
  assert.equal(finished,1);
  assert.equal(f.phase,'finished');
  assert.ok(f.x>AIRSHIP_WORLD.width||f.x<0,'empty glider must exit visible deck bounds');
});
test('permanently blocked passenger is accounted for explicitly at bounded timeout',()=>{
  const f=makeFlight(GLIDER_DEMO[0]);
  let blocked=0,drops=0;
  for(let i=0;i<350;i++){
    const event=stepFlight(f,50,null);
    if(event.blocked)blocked++;
    if(event.drop)drops++;
  }
  assert.equal(blocked,1);
  assert.equal(drops,0);
  assert.equal(f.blocked,true);
  assert.equal(f.finished,true);
  assert.equal(f.released,false);
  assert.ok(GLIDER_HOLD_MS>GLIDER_EXPANDED_SEARCH_MS);
});
test('expanded search preserves playable deck and wheelhouse clearance',()=>{
  const f=WHEELHOUSE_FOOTPRINT;
  const original=landingPosition('port-aft',AIRSHIP_WORLD.start,[],21);
  const expanded=landingPosition('port-aft',AIRSHIP_WORLD.start,[{...original,radius:150}],21,true);
  assert.ok(expanded);
  assert.equal(insideDeck(expanded,29),true);
  assert.ok(Math.hypot((expanded.x-f.x)/(f.rx+29),(expanded.y-f.y)/(f.ry+29))>=1);
  assert.ok(Math.hypot(expanded.x-AIRSHIP_WORLD.start.x,expanded.y-AIRSHIP_WORLD.start.y)>=106);
});

test('180-second ordinary defense director delivers passengers without starvation or duplicate activations',()=>{
  const defense=createAirshipDefense();
  defense.state='active';
  const flights=[],landings=[],ground=[];
  const started=new Set(),activated=new Set();
  let drops=0,blocked=0,maxAirborne=0,maxGroundPending=0;
  for(let now=0;now<=AIRSHIP_SURVIVAL_MS;now+=50){
    // Simulate the moving player and the ordinary player killing ground enemies.
    const player=now%13000<6500?{x:240,y:270}:{x:730,y:270};
    if(now>0&&now%4000===0&&ground.length)ground.shift();
    const airborne=flights.filter(f=>!f.finished).length;
    const pending=flights.filter(f=>!f.released&&!f.finished).length+landings.filter(l=>!l.finished).length;
    maxAirborne=Math.max(maxAirborne,airborne);
    maxGroundPending=Math.max(maxGroundPending,ground.length+pending);
    assert.ok(airborne<=AIRSHIP_GLIDER_CAP);
    assert.ok(ground.length+pending<=AIRSHIP_GROUND_CAP);
    const directive=tickAirshipDefense(defense,now,{active:true,ground:ground.length,airborne,pending});
    if(directive?.outcome){
      assert.equal(directive.outcome,'survived');
      break;
    }
    if(directive?.delivery){
      assert.equal(started.has(directive.delivery.id),false);
      started.add(directive.delivery.id);
      flights.push(makeFlight(directive.delivery));
    }
    for(const flight of flights){
      if(flight.finished)continue;
      const occupied=[...ground,...landings.filter(l=>!l.finished)].map(e=>({x:e.x,y:e.y,radius:e.radius}));
      const radius=ENEMY_TYPES[flight.type].radius;
      const point=flight.phase==='dropping'&&!flight.released
        ?landingPosition(flight.zoneId,player,occupied,radius,flight.elapsed>=GLIDER_EXPANDED_SEARCH_MS):null;
      const event=stepFlight(flight,50,point);
      if(event.blocked)blocked++;
      if(event.drop){
        drops++;
        assert.equal(insideDeck(flight.landingPoint,radius+8),true);
        assert.ok(Math.hypot(flight.landingPoint.x-player.x,flight.landingPoint.y-player.y)>=radius+85);
        assert.ok(!occupied.some(o=>Math.hypot(flight.landingPoint.x-o.x,flight.landingPoint.y-o.y)<radius+o.radius+26));
        landings.push({id:flight.id,type:flight.type,x:flight.landingPoint.x,y:flight.landingPoint.y,radius,elapsed:0,finished:false});
      }
    }
    for(const landing of landings){
      if(landing.finished)continue;
      if(stepLanding(landing,50)){
        assert.equal(activated.has(landing.id),false,'ground activation must happen exactly once');
        activated.add(landing.id);
        ground.push(landing);
      }
    }
  }
  assert.ok(started.size>=15,'director must keep delivering over full three-minute fight');
  assert.equal(blocked,0,'ordinary moving-player scenario should find safe alternative landing spots');
  // A flight launched in the last approach window is intentionally cleaned up
  // by the 180-second victory transition rather than forced to land instantly.
  const stillCarried=flights.filter(f=>!f.released&&!f.finished).length;
  const stillDescending=landings.filter(l=>!l.finished).length;
  assert.equal(started.size-drops,stillCarried,'no passenger may disappear during an active flight');
  assert.ok(stillCarried<=AIRSHIP_GLIDER_CAP,'only bounded in-flight passengers at victory');
  assert.equal(drops-activated.size,stillDescending,'no released passenger may silently skip activation');
  assert.ok(maxAirborne>=1&&maxAirborne<=AIRSHIP_GLIDER_CAP);
  assert.ok(maxGroundPending>=1&&maxGroundPending<=AIRSHIP_GROUND_CAP);
});

test('PR69 R2 approved 2560x320 atlas is exactly eight unrotated 320px directional frames',()=>{
  assert.equal(GLIDER_SHEET_WIDTH,2560);
  assert.equal(GLIDER_SHEET_HEIGHT,320);
  assert.equal(GLIDER_FRAME_SIZE,320);
  assert.equal(GLIDER_SHEET_WIDTH/GLIDER_FRAME_SIZE,8);
  assert.equal(GLIDER_SHEET_HEIGHT/GLIDER_FRAME_SIZE,1);
  assert.deepEqual(GLIDER_DIRECTION_ORDER,['e','se','s','sw','w','nw','n','ne']);
  const origin={x:0,y:0};
  const headings=[[1,0,0],[1,1,1],[0,1,2],[-1,1,3],[-1,0,4],[-1,-1,5],[0,-1,6],[1,-1,7]];
  for(const [x,y,frame] of headings)assert.equal(flightDirectionFrame(origin,{x,y}),frame);
  assert.equal(flightDirectionFrame(GLIDER_DEMO[0].from,AIRSHIP_LANDING_ZONES[0]),1);
  assert.equal(flightDirectionFrame(AIRSHIP_LANDING_ZONES[0],{x:1120,y:115}),0);
  assert.equal(flightDirectionFrame(GLIDER_DEMO[1].from,AIRSHIP_LANDING_ZONES[1]),5);
  assert.equal(flightDirectionFrame(AIRSHIP_LANDING_ZONES[1],{x:-160,y:390}),4);
});
