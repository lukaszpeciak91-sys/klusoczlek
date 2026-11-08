import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dialoguePortraitSize} from '../src/dialogue-ui.js';
import {ACT2_HEALTH_SPAWN_MS,ACT2_HEALTH_POINTS,act2HealthPoint,shouldSpawnAct2Health,collectAct2Health} from '../src/act2-health-pickup.js';
import {insideDeck,DECK_MARGIN,AIRSHIP_PLAYER_LOWER_MARGIN,WHEELHOUSE_FOOTPRINT} from '../src/airship-contract.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('portrait scales to 108 on large landscape, remains responsive on smaller screens',()=>{
 assert.equal(dialoguePortraitSize(960,540),108);
 assert.equal(dialoguePortraitSize(800,360),108);
 assert.ok(dialoguePortraitSize(640,280)<=90);
 assert.ok(dialoguePortraitSize(390,300)<=64);
 const s=read('../src/dialogue-ui.js');
 assert.ok(s.includes('setDisplaySize(portrait,portrait)'));
 assert.ok(s.includes('setWordWrapWidth(tw)'));
 assert.ok(s.includes('button.setPosition(bx,by)'));
});
test('90-second pickup clock excludes cinematic/dialogue and only spawns once',()=>{
 assert.equal(ACT2_HEALTH_SPAWN_MS,90000);
 assert.equal(shouldSpawnAct2Health(89999,false,true),false);
 assert.equal(shouldSpawnAct2Health(90000,false,true),true);
 assert.equal(shouldSpawnAct2Health(90000,true,true),false);
 assert.equal(shouldSpawnAct2Health(100000,false,false),false);
});
test('all fallback heart positions lie inside deck and outside wheelhouse',()=>{
 for(const p of ACT2_HEALTH_POINTS){
  assert.ok(insideDeck(p,DECK_MARGIN,AIRSHIP_PLAYER_LOWER_MARGIN));
  const d=Math.hypot((p.x-WHEELHOUSE_FOOTPRINT.x)/(WHEELHOUSE_FOOTPRINT.rx+26),
    (p.y-WHEELHOUSE_FOOTPRINT.y)/(WHEELHOUSE_FOOTPRINT.ry+26));
  assert.ok(d>1);
 }
 assert.ok(act2HealthPoint({x:480,y:315}));
});
test('pickup requires proximity and missing HP, heals two and clamps to max',()=>{
 const p={x:480,y:315};
 assert.equal(collectAct2Health(p,p,2,5),4);
 assert.equal(collectAct2Health(p,p,4,5),5);
 assert.equal(collectAct2Health(p,p,5,5),null);
 assert.equal(collectAct2Health({x:100,y:100},p,1,5),null);
});
test('airship keeps separate weapon pickup, health cleanup and DEBUG timer compatibility',()=>{
 const s=read('../src/airship-scene.js');
 assert.ok(s.includes('this.pickup?.setVisible(true)'));
 assert.ok(s.includes('this.healthPickupSpawned=true'));
 assert.ok(s.includes('this.collectHealthPickup()'));
 assert.ok(s.includes('this.healthPickup?.destroy()'));
 assert.ok(s.includes('this.defense.elapsedMs=165000'));
 assert.ok(s.includes('shouldSpawnAct2Health(this.defense.elapsedMs'));
 assert.ok(s.includes('this.applyDamage(next)'));
});
