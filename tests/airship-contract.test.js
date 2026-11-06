import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRSHIP_WORLD,DECK_POLYGON,DECK_MARGIN,AIRSHIP_PLAYER_LOWER_MARGIN,AIRSHIP_LAYERS,AIRSHIP_LANDING_ZONES,
  insideDeck,clampToDeck,stepDeckPosition,scrollCloudLayers,avoidWheelhouse,stepAroundWheelhouse,wheelhouseSegmentHit,WHEELHOUSE_FOOTPRINT} from '../src/airship-contract.js';
import {createCampaignRun,completeCampaignAct,nextActHandoff,prepareActStart} from '../src/campaign-run.js';

test('provisional beveled deck contains spawn but excludes sky and rail edges',()=>{
  assert.ok(AIRSHIP_WORLD.width<1800&&AIRSHIP_WORLD.height<1200);
  assert.equal(DECK_POLYGON.length,8);
  assert.ok(insideDeck(AIRSHIP_WORLD.start));
  for(const p of [{x:0,y:0},{x:960,y:540},{x:105,y:105},{x:900,y:270},{x:480,y:50}]){
    assert.equal(insideDeck(p),false,JSON.stringify(p));
    assert.equal(insideDeck(clampToDeck(p)),true,JSON.stringify(p));
  }
  for(const zone of AIRSHIP_LANDING_ZONES)assert.ok(insideDeck(zone));
});
test('deck projection keeps high-speed player movement inside polygon',()=>{
  let p={...AIRSHIP_WORLD.start};
  for(let n=0;n<300;n++){
    p=stepDeckPosition(p,{x:n%2?10:-10,y:n%3?10:-10},2000);
    assert.equal(insideDeck(p),true);
  }
  assert.equal(insideDeck(stepDeckPosition({x:75,y:75},{x:-1,y:-1},500)),true);
});
test('cloud drift cannot change deck geometry or actor world coordinates',()=>{
  const layers=AIRSHIP_LAYERS.map(layer=>({speed:layer.speed,tilePositionX:0}));
  const deck=JSON.stringify(DECK_POLYGON),player={...AIRSHIP_WORLD.start};
  scrollCloudLayers(layers,40);
  assert.equal(layers[0].tilePositionX,0);
  assert.ok(layers[3].tilePositionX>layers[2].tilePositionX&&layers[2].tilePositionX>layers[1].tilePositionX);
  assert.deepEqual(player,AIRSHIP_WORLD.start);
  assert.equal(JSON.stringify(DECK_POLYGON),deck);
  assert.equal(DECK_MARGIN>0,true);
});
test('Act I completion hands exact nullable equipment and HP to Airship only when registered',()=>{
  for(const selected of [null,'rifle','flamethrower']){
    const run=createCampaignRun();
    const weapons=new Set(['blunderbuss','rifle','flamethrower']);
    assert.equal(completeCampaignAct(run,'act1',{
      hp:3,maxHp:5,unlockedWeapons:weapons,selectedWeapon:selected,kills:42,activeCombatMs:1234.25,
    }),true);
    assert.equal(nextActHandoff(run,new Set(['Arena'])),null);
    const handoff=nextActHandoff(run,new Set(['Arena','Airship']));
    assert.deepEqual([handoff.actId,handoff.scene,handoff.hp,handoff.maxHp,handoff.selectedWeapon],['act2','Airship',3,5,selected]);
    assert.equal(prepareActStart(run,handoff,new Set(['Arena','Airship'])),true);
    assert.equal(run.actId,'act2');
    assert.equal(prepareActStart(run,handoff,new Set(['Arena','Airship'])),false);
    assert.equal(nextActHandoff(run,new Set(['Arena','Airship'])),null);
  }
});

test('wheelhouse footing blocks actors, not the full tall sprite',()=>{
  const f=WHEELHOUSE_FOOTPRINT;
  const radius=17;
  for(const p of [
    {x:f.x,y:f.y},{x:f.x+9,y:f.y-6},{x:f.x-22,y:f.y+14},
  ]){
    const projected=avoidWheelhouse(p,radius);
    assert.ok(Math.hypot((projected.x-f.x)/(f.rx+radius),
      (projected.y-f.y)/(f.ry+radius))>=1-1e-6);
    assert.equal(insideDeck(projected),true);
  }
  for(const zone of AIRSHIP_LANDING_ZONES)
    assert.deepEqual(avoidWheelhouse(zone,45),{x:zone.x,y:zone.y});
  assert.deepEqual(avoidWheelhouse(AIRSHIP_WORLD.start,radius),AIRSHIP_WORLD.start);
});

test('PR75 shared lower railing limit constrains player, enemies and landing footprints',()=>{
  const lowerEdge=Math.max(...DECK_POLYGON.map(p=>p.y));
  assert.equal(lowerEdge,371);
  assert.equal(AIRSHIP_PLAYER_LOWER_MARGIN,42);
  assert.ok(insideDeck({x:480,y:329},25,AIRSHIP_PLAYER_LOWER_MARGIN),'Aloes may reach the last safe playable line');
  assert.equal(insideDeck({x:480,y:330},25,AIRSHIP_PLAYER_LOWER_MARGIN),false,'player cannot cross lower edge');
  for(const [label,radius] of [['bobrozombi',21],['bocianolak',18]]){
    const margin=radius+8;
    const projected=clampToDeck({x:480,y:500},margin);
    assert.ok(projected.y<=lowerEdge-margin+1e-6,label);
    assert.ok(insideDeck(projected,margin),label);
  }
  for(const zone of AIRSHIP_LANDING_ZONES){
    assert.ok(insideDeck(zone,45),'preferred glider landing remains clear of tightened boundary');
  }
  assert.equal(insideDeck({x:480,y:445},0),false,'outside deck even before actor padding');
  assert.equal(insideDeck({x:480,y:300},25),true,'central dodge space unchanged');
});

test('final deck: eight input directions and both lower diagonals preserve player visual footprint',()=>{
  // Source character frames are 64px, displayed at 1.30x about the player.
  // At max center y=329, the entire centered 83.2px sprite stays above inner rail y=371.
  const spriteHalfHeight=64*1.30/2,visibleLowerRail=371;
  for(const start of [{x:480,y:350},{x:220,y:355},{x:740,y:355}]){
    for(let i=0;i<8;i++){
      let p={...start};
      const a=i*Math.PI/4,dir={x:Math.cos(a),y:Math.sin(a)};
      for(let n=0;n<90;n++){
        p=stepDeckPosition(p,dir,50);
        assert.ok(insideDeck(p,25),'direction '+i+' '+JSON.stringify(p));
      }
      if(p.y>310)assert.ok(p.y+spriteHalfHeight<=visibleLowerRail+1e-6);
    }
  }
  for(const point of [{x:92,y:396},{x:868,y:396}]){
    const projected=clampToDeck(point,25);
    assert.ok(insideDeck(projected,25));
    assert.ok(projected.y<=346);
  }
});
test('final wheelhouse: all approach segments reject entry and side tunneling',()=>{
  const f=WHEELHOUSE_FOOTPRINT;
  assert.deepEqual([f.rx,f.ry],[62,28]);
  for(const [from,to] of [
    [{x:480,y:330},{x:480,y:125}],
    [{x:480,y:95},{x:480,y:310}],
    [{x:310,y:194},{x:650,y:194}],
    [{x:650,y:194},{x:310,y:194}],
    [{x:380,y:290},{x:580,y:125}],
  ]){
    assert.equal(wheelhouseSegmentHit(from,to,24),true);
    let p={...from};
    const dx=to.x-from.x,dy=to.y-from.y;
    for(let n=1;n<=120;n++){
      const proposal={x:from.x+dx*n/120,y:from.y+dy*n/120};
      const next=stepAroundWheelhouse(p,proposal,17);
      assert.equal(wheelhouseSegmentHit(p,next,24),false,
        'wall crossing '+JSON.stringify({from,to,p,next}));
      assert.ok(insideDeck(next,25));
      p=next;
    }
  }
});
