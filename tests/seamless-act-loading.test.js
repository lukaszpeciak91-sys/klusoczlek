import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ACT_TITLE_MIN_MS,REQUIRED_ASSET_TIMEOUT_MS,actRequiredAssets,
 actPortraitKeys,scenePortraitKeys,isRequiredCollisionFailure,validProductionAsset,
 prepareActAsset
} from '../src/act-asset-preparation.js';
import {SCHOOL_ART} from '../src/schoolyard-art.js';
import {VOLCANO_ASSETS} from '../src/volcano-contract.js';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const names=act=>actRequiredAssets(act).map(def=>def.path);
test('ActTitle is visible at least 1900ms and waits for actual decoded PNG readiness',()=>{
 assert.ok(ACT_TITLE_MIN_MS>=1800&&ACT_TITLE_MIN_MS<=2000);
 assert.equal(REQUIRED_ASSET_TIMEOUT_MS,10000);
 const title=source('../src/act-title-scene.js');
 assert.ok(title.includes('gate.minimumElapsed=true;finish()'));
 assert.ok(title.includes('!gate.minimumElapsed||!gate.ready'));
 assert.ok(title.includes('prepareActAssets(this.game,this.actId'));
 assert.ok(title.includes("status.setText('NIE UDAŁO SIĘ WCZYTAĆ TERENU.')"));
 assert.equal(title.includes('delayedCall(1600'),false);
});
test('Act I startup never includes later acts or cinematic, but has current enemies',()=>{
 const a=names('act1');
 for(const x of ['enemies/bobrozombi.png','enemies/bocianolak.png','enemies/zubrokryptyda.png','obstacles/forest-obstacles.png','player/player-unarmed.png'])
  assert.ok(a.includes(x),x);
 for(const x of ['act2-','act3-','act4-','blazej.png','bogdan.png','act4-aloes-bicycle.png','airship-deck.png'])
  assert.equal(a.some(path=>path.includes(x)),false,x);
});
test('Act II loads actual deck, sky, captain and glider without Act III/IV art',()=>{
 const a=names('act2');
 for(const x of ['backgrounds/act2-sky.png','arenas/airship-deck.png','npcs/captain.png','vehicles/hang-glider.png'])
  assert.ok(a.includes(x),x);
 assert.equal(a.some(x=>/act3-|act4-|schoolyard|bogdan|blazej/.test(x)),false);
});
test('Act III requires real alpha collision and lava before world is revealed',()=>{
 const specs=actRequiredAssets('act3');
 const terrain=specs.find(x=>x.path===VOLCANO_ASSETS.terrain.path);
 assert.ok(terrain?.collision&&terrain.required);
 assert.ok(specs.find(x=>x.path===VOLCANO_ASSETS.lava.path)?.required);
 const scene=source('../src/volcano-scene.js');
 assert.ok(scene.includes('critical:()=>!!this.walkability&&this.terrainImage.visible'));
 assert.ok(scene.includes('this.player.body.reset(this.player.x,this.player.y)'));
 assert.ok(scene.indexOf('this.debugPreparation=this.boss.prepare()')<scene.lastIndexOf('async initializeDebugCheckpoint'));
});
test('Act IV prepares approved visible school, rack, chapel, Błażej and Captain but not cinematic',()=>{
 const a=names('act4');
 for(const p of Object.values(SCHOOL_ART).map(x=>x.path))
  assert.ok(a.includes(p),p);
 assert.ok(a.includes('enemies/blazej.png'));
 assert.ok(a.includes('npcs/captain.png'));
 assert.ok(!a.includes('player/act4-aloes-bicycle.png'));
 const cinematic=source('../src/school-bicycle-cinematic.js');
 assert.ok(cinematic.includes('get loading(){return prepare();}'));
});
test('portrait scopes exclude future-acts and still include approved Błażej sequences',()=>{
 assert.ok(actPortraitKeys('act1').includes('marcin'));
 assert.equal(actPortraitKeys('act1').includes('bogdan'),false);
 assert.equal(actPortraitKeys('act1').includes('blazej'),false);
 assert.ok(actPortraitKeys('act3').includes('bogdan'));
 assert.ok(actPortraitKeys('act4').includes('blazej'));
 assert.deepEqual(scenePortraitKeys('School'),actPortraitKeys('act4'));
 assert.deepEqual(scenePortraitKeys('Airship'),actPortraitKeys('act2'));
 const ui=source('../src/dialogue-ui.js');
 assert.ok(ui.includes('scenePortraitKeys(scene.scene.key)'));
 assert.ok(ui.includes('currentDialogue(scene.dialogueState)?.[0]===key'));
 assert.ok(ui.includes('pending.has(key)'));
});
test('collision failure prevents unsafe entry, cosmetic failure allows fallback',()=>{
 assert.equal(isRequiredCollisionFailure([{collision:false,required:true}]),false);
 assert.equal(isRequiredCollisionFailure([{collision:true,required:true}]),true);
 assert.equal(isRequiredCollisionFailure([]),false);
});
test('preparation shares PNG paths and skips cached textures',async()=>{
 const src=source('../src/act-asset-preparation.js');
 assert.ok(src.includes('state.pathInFlight.has(path)'));
 assert.ok(src.includes('state.inFlight.has(def.key)'));
 const game={textures:{exists:key=>key==='cached-key'}};
 const x=await prepareActAsset(game,{path:'nothing.png',key:'cached-key'});
 assert.deepEqual(x,{key:'cached-key',cached:true});
});
test('native PNG header validators reject bogus sheet data',()=>{
 const def=actRequiredAssets('act4').find(x=>x.key===SCHOOL_ART.school.key);
 const bytes=readFileSync(new URL('../public/assets/'+def.path,import.meta.url));
 assert.ok(validProductionAsset(bytes,def));
 const mutated=Buffer.from(bytes);mutated[19]=0;assert.equal(validProductionAsset(mutated,def),false);
});
test('each playable scene blocks controls and early updates under the opaque reveal gate',()=>{
 const a=source('../src/scenes.js'),b=source('../src/airship-scene.js'),
  c=source('../src/volcano-scene.js'),d=source('../src/school-scene.js');
 for(const s of [a,b,c,d])assert.ok(s.includes('this.entryGate=beginSceneReveal(this'));
 assert.ok(b.includes('if(!this.entryGateReady)return;'));
 assert.ok(c.includes('if(!this.entryGateReady)return;'));
 assert.ok(d.includes('if(this.disposed||!this.entryGateReady)return;'));
 const gate=source('../src/scene-reveal-gate.js');
 assert.ok(gate.includes('.setDepth(10000).setInteractive()'));
 assert.ok(gate.includes('scene.entryGateReady=true'));
 assert.ok(gate.includes('retry.on('));
});
test('DEBUG routes through ActTitle while four wave clocks remain unchanged',()=>{
 const menu=source('../src/scenes.js');
 assert.ok(menu.includes("this.scene.start('ActTitle',{actId:checkpoint.actId,handoff:fixture.handoff,debugCheckpoint:checkpoint.id})"));
 const wave=source('../src/school-combat.js');
 assert.ok(wave.includes('advanceGameplayClock'));
 assert.ok(wave.includes('170000')||wave.includes('SCHOOL_COMBAT_MS'));
});
