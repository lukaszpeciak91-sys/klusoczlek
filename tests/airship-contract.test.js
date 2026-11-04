import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRSHIP_WORLD,DECK_POLYGON,DECK_MARGIN,AIRSHIP_LAYERS,AIRSHIP_LANDING_ZONES,
  insideDeck,clampToDeck,stepDeckPosition,scrollCloudLayers,avoidWheelhouse,WHEELHOUSE_FOOTPRINT} from '../src/airship-contract.js';
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
