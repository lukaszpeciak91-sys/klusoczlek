import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAMPAIGN_ACTS,sceneForAct} from '../src/campaign.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';
import {arenaHudLayout} from '../src/ui-layout.js';
import {faceForHp} from '../src/hp-face-hud.js';
import {VOLCANO_ASSETS,validVolcanoPng} from '../src/volcano-contract.js';

test('campaign remains exactly five acts with Volcano registered',()=>{
 assert.deepEqual(CAMPAIGN_ACTS.map(a=>a.id),['act1','act2','act3','act4','act5']);
 assert.equal(sceneForAct('act3'),'Volcano');
});
test('Act III debug run preserves predecessor handoff and health',()=>{
 const f=createDebugFixture('act3-opening');
 assert.ok(f);assert.equal(f.handoff.scene,'Volcano');
 assert.equal(f.handoff.hp,f.run.hp);
 assert.deepEqual([...f.handoff.unlockedWeapons].sort(),[...f.run.unlockedWeapons].sort());
});
test('HUD layout fits MENU and HP within Android landscape',()=>{
 for(const [w,h] of [[568,320],[800,360],[960,540]]){
   const l=arenaHudLayout(h,w);
   assert.ok(l.menuX-l.menuWidth/2>=0);
   assert.ok(l.portraitX+l.portraitSize/2<=w);
   assert.ok(l.hpY<h);
 }
});
test('HP portrait selection follows inherited health',()=>{
 for(const hp of [1,2,3,4,5])assert.equal(faceForHp(hp),'hp_'+hp);
});
test('Volcano scene uses standard HUD and no gameplay development label',()=>{
 const source=readFileSync(new URL('../src/volcano-scene.js',import.meta.url),'utf8');
 assert.match(source,/createHpFaceHud\(this,Phaser\)/);
 assert.match(source,/this\.hpFace\.setHp\(this\.run\.hp\)/);
 assert.match(source,/this\.menuButton\.on\('pointerdown',\(\)=>this\.openMenu\(\)\)/);
 assert.doesNotMatch(source,/FUNDAMENT \/ TEREN TYMCZASOWY/);
 assert.match(source,/this\.scene\.launch\('Menu'\)/);
 assert.match(source,/this\.fullscreenButton\.hidden=true/);
 assert.match(source,/this\.fullscreenButton\.hidden=this\.fullscreenPreviousHidden/);
});
test('invalid terrain PNG is rejected independently of missing assets',()=>{
 assert.equal(VOLCANO_ASSETS.terrain.width,1800);
 assert.equal(validVolcanoPng(new Uint8Array([13,10]),VOLCANO_ASSETS.terrain),false);
});
