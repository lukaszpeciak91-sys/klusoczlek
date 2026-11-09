import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATACOMBS,CATACOMBS_OBSTACLES,CATACOMBS_SUMMON_SITES,
 catacombsWalkable,catacombsStep,catacombsResolve,MARIAN_FINAL_ASSETS} from '../src/catacombs-contract.js';
import {createFinalBossState,FINAL_BOSS,finalBossVulnerable,finalBossDamage,
 finalBossStart,finalBossBeginSummon,finalBossAddSummon,finalBossClearSummon,
 finalBossStep} from '../src/marian-final-boss.js';
import {createDebugFixture} from '../src/debug-checkpoints.js';
import {DIALOGUES,createDialogueState,beginDialogue,advanceDialogue,currentDialogue} from '../src/dialogue-data.js';
import {prepareActStart,completeCampaignAct,nextActHandoff} from '../src/campaign-run.js';
import {availableWeapons} from '../src/weapon-progression.js';
import {getAct,nextAvailableAct} from '../src/campaign.js';
import {serializeCampaignCheckpoint,readCampaignCheckpoint,clearCampaignCheckpoint,CAMPAIGN_SAVE_KEY} from '../src/campaign-save.js';
import {actRequiredAssets,actPortraitKeys,scenePortraitKeys} from '../src/act-asset-preparation.js';
const src=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('final chapter is registered, reached through original ActTitle flow and terminal',()=>{
 assert.equal(getAct('act5').title,'TOŻSAMOŚĆ MARIANA');
 assert.equal(getAct('act5').scene,'Catacombs');
 assert.equal(nextAvailableAct('act4')?.id,'act5');
 assert.equal(nextAvailableAct('act5'),null);
 const school=src('../src/school-scene.js'),main=src('../src/main.js');
 assert.ok(school.includes("this.scene.start('ActTitle',{actId:'act5',handoff})"));
 assert.ok(school.includes('updateRunHealth(this.run,this.run.maxHp)'));
 assert.ok(main.includes('CatacombsScene]'));
});
test('three Act V DEBUG checkpoints have full HP, correct predecessor and artifacts',()=>{
 for(const id of ['act5-opening','act5-boss','act5-ending']){
  const fixture=createDebugFixture(id);
  assert.ok(fixture,id);
  assert.equal(fixture.run.actId,'act4');
  assert.deepEqual([...fixture.run.completedActs],['act1','act2','act3','act4']);
  assert.deepEqual([...fixture.run.artifacts].sort(),['blazej-bicycle','bogdan-hunting-horn','marcin-mohawk']);
  assert.equal(fixture.run.hp,5);
  assert.equal(fixture.handoff.actId,'act5');
  assert.equal(fixture.handoff.scene,'Catacombs');
  assert.equal(prepareActStart(fixture.run,fixture.handoff,new Set(['Catacombs'])),true);
  assert.equal(fixture.run.actId,'act5');
  assert.ok(!availableWeapons(fixture.run.unlockedWeapons,'act5').includes('water-flamethrower'));
  assert.equal(fixture.run.selectedWeapon,'rifle');
 }
});
test('catacombs walls, altar and four columns are solid while player, boss and summons are safe',()=>{
 assert.equal(CATACOMBS_OBSTACLES.length,5);
 assert.deepEqual(CATACOMBS_OBSTACLES.map(x=>x.id).sort(),
  ['altar','pillar-left-lower','pillar-left-upper','pillar-right-lower','pillar-right-upper']);
 assert.ok(catacombsWalkable(CATACOMBS.playerStart));
 assert.ok(catacombsWalkable(CATACOMBS.marianStart,CATACOMBS.bossRadius));
 assert.ok(catacombsWalkable(CATACOMBS.fairyStart));
 for(const site of CATACOMBS_SUMMON_SITES)assert.ok(catacombsWalkable(site,CATACOMBS.enemyRadius),site.type);
 assert.equal(catacombsWalkable({x:480,y:312}),false,'altar');
 assert.equal(catacombsWalkable({x:7,y:120}),false,'outer wall');
 assert.equal(catacombsWalkable({x:200,y:210}),false,'pillar');
 const blocked=catacombsStep({x:480,y:440},{x:0,y:-1},1500);
 assert.ok(catacombsWalkable(blocked),'movement sweep cannot go inside altar');
 const p=catacombsResolve({x:480,y:440},{x:480,y:312});
 assert.ok(catacombsWalkable(p),'direct displacement avoids solid altar');
});
test('Marian transformed PNG and portrait are clean optional configuration hooks',()=>{
 assert.equal(MARIAN_FINAL_ASSETS.transformed.key,'act5-marian-transformed');
 assert.equal(MARIAN_FINAL_ASSETS.transformed.width,2048);
 assert.equal(MARIAN_FINAL_ASSETS.transformed.height,256);
 assert.equal(MARIAN_FINAL_ASSETS.transformed.frameWidth,256);
 assert.equal(MARIAN_FINAL_ASSETS.transformed.frameHeight,256);
 assert.equal(MARIAN_FINAL_ASSETS.portrait.key,'dialogue-marian-transformed');
 assert.equal(MARIAN_FINAL_ASSETS.normal.key,'npc-captain');
 const scene=src('../src/catacombs-scene.js');
 assert.ok(scene.includes('selectMarianAppearance(true)'));
 assert.ok(scene.includes('this.bossArt.setTexture(effective'));
 assert.ok(scene.includes('this.bossFallback.setVisible(true)'));
});
test('approved 17-panel Rudolf reveal and 3-panel fairy ending are exact and sequential',()=>{
 const lengths={'act5-betrayal':17,'act5-fairy':3};
 for(const [id,count] of Object.entries(lengths)){
  const lines=DIALOGUES[id];
  assert.equal(lines.length,count);
  assert.ok(lines.every(line=>line.length===3&&line[2].length<155));
  const state=createDialogueState();
  assert.equal(beginDialogue(state,id),true);
  for(let i=0;i<count;i++){
   assert.deepEqual(currentDialogue(state),lines[i]);
   assert.equal(advanceDialogue(state),i===count-1?id:'next');
  }
 }
 assert.deepEqual(DIALOGUES['act5-betrayal'].map(x=>x[2]),[
  'Ha, ha, ha! Nareszcie odzyskałem pełnię mocy!',
  'Kapitan Marian?!',
  'Nie Kapitan Marian, lecz Rudolf Kłusoczłek!',
  'To pan za tym wszystkim stał?! Ale jak to?',
  'Gdy trafiłem do tego świata, był on pełen rzadkich gatunków, na które mogłem kłusować.',
  'Do poszukiwań wykorzystywałem posłuszne mi Bobrozombi, Bocianołaki i Żubrokryptydy.',
  'Wszystko szło jak z płatka! Na ścianach zaczynało brakować miejsca na trofea!',
  'Brakowało mi tylko jednego... ŁBA ŚWINI-WRÓŻKI!',
  'Ta bestia okazała się jednak sprytniejsza. Użyła magii, by zwrócić moją własną moc przeciwko mnie!',
  'Moje stwory miały odtąd tylko jeden cel: ZABIĆ KŁUSOCZŁEKA!',
  'A ja, pozbawiony mocy, nie miałem siły, by stawić im czoła. Potrzebowałem kogoś, kim mógłbym się wyręczyć.',
  'Zanim cię zabiję, wypada mi podziękować. Dzięki tobie odzyskałem moje atrybuty — irokeza i róg!',
  'Jednego nie rozumiem... Po co był rower?',
  'Ano, zawsze taki chciałem dostać na pierwszą komunię!',
  'Poza tym musiałem cię czymś zająć, dopóki nie odprawię rytuału.',
  'A TERAZ GOTUJ SIĘ NA ŚMIERĆ!',
  'Po moim trupie!'
 ],'approved panel order and text must remain exact');
 assert.equal(DIALOGUES['act5-betrayal'][0][1],'KAPITAN MARIAN');
 assert.equal(DIALOGUES['act5-betrayal'][1][2],'Kapitan Marian?!');
 assert.equal(DIALOGUES['act5-betrayal'][2][0],'marian-transformed');
 assert.equal(DIALOGUES['act5-betrayal'][2][1],'RUDOLF KŁUSOCZŁEK');
 assert.ok(DIALOGUES['act5-betrayal'].slice(2).filter(x=>x[1]==='RUDOLF KŁUSOCZŁEK').every(x=>x[0]==='marian-transformed'));
 assert.equal(DIALOGUES['act5-betrayal'][16][2],'Po moim trupie!');
 assert.equal(DIALOGUES['act5-fairy'][2][2],'No to trzeba było tak od razu. MYK!');
 assert.equal(DIALOGUES['act5-home'],undefined,'obsolete home scene removed');
});
test('one-shot dialogue gate starts transformation after first completed panel, not after monologue',()=>{
 const s=src('../src/catacombs-scene.js'),ui=src('../src/dialogue-ui.js');
 assert.ok(s.includes('state.index!==1')&&s.includes("state.id!=='act5-betrayal'"));
 assert.ok(s.includes('this.transformationStarted=true'));
 assert.ok(s.includes('this.dialoguePanel.suspend()'));
 assert.ok(s.includes('this.transformationCompleted=true'));
 assert.ok(s.includes('this.dialoguePanel.resume()'));
 assert.ok(s.includes("id==='act5-betrayal'&&this.transformationCompleted)this.startBoss()"));
 assert.ok(ui.includes('suspend(){active=false;shell.setVisible(false)'));
 assert.ok(ui.includes('resume(){if(disposed||!scene.dialogueState?.id)return false'));
 assert.ok(!s.includes('showHomeEnding()'));
 assert.ok(!s.includes("this.showDialogue('act5-home')"));
});
test('boss starts after final dialogue and projectiles run with bounded finite attack state',()=>{
 const b=createFinalBossState();
 assert.equal(b.phase,'staging');
 assert.equal(finalBossDamage(b,1),false);
 assert.ok(finalBossStart(b));assert.ok(!finalBossStart(b));
 assert.equal(b.phase,'gun');assert.equal(finalBossVulnerable(b),true);
 let count=0;
 for(let i=0;i<800;i++)count+=finalBossStep(b,50).shots.length;
 assert.ok(count>=FINAL_BOSS.burstCount&&count<180,'bounded rotating projectiles');
 assert.equal(FINAL_BOSS.maxProjectiles,38);
 assert.ok(FINAL_BOSS.transformationMs<3000);
 const scene=src('../src/catacombs-scene.js');
 assert.ok(scene.includes('this.phase=\'transform\''));
 assert.ok(scene.includes('delay:155,repeat:12,callback:flash'));
 assert.ok(scene.includes('finalBossStep(this.boss,delta)'));
});
test('horn summons limited three active, immunity and reinforcements return vulnerability',()=>{
 const b=createFinalBossState();finalBossStart(b);
 assert.ok(finalBossDamage(b,18,1000));assert.ok(finalBossBeginSummon(b));
 assert.equal(b.phase,'summon');assert.equal(finalBossVulnerable(b),false);
 assert.equal(finalBossDamage(b,10,1300),false);
 for(let i=0;i<FINAL_BOSS.maxSummons;i++)assert.ok(finalBossAddSummon(b,{id:'s'+i}));
 assert.equal(finalBossAddSummon(b,{id:'overflow'}),false);
 for(let i=0;i<FINAL_BOSS.maxSummons;i++)assert.ok(finalBossClearSummon(b,'s'+i));
 assert.equal(b.phase,'gun');
 assert.equal(finalBossVulnerable(b),true);
 assert.ok(finalBossDamage(b,1,2000));
});
test('summon timeout prevents softlock and no unlimited summon loops',()=>{
 const b=createFinalBossState();finalBossStart(b);
 for(const at of [1000,22000,44000]){
  b.hp=Math.floor(b.maxHp*(FINAL_BOSS.summonAt[b.summonIndex]-.01));
  assert.ok(finalBossBeginSummon(b));
  assert.ok(finalBossAddSummon(b,{id:'stuck'}));
  let timeout=false;for(let t=0;t<FINAL_BOSS.summonTimeoutMs+500;t+=50)
   timeout=finalBossStep(b,50).summonTimeout||timeout;
  assert.ok(timeout);assert.equal(b.phase,'gun');
 }
 assert.equal(finalBossBeginSummon(b),false);
 assert.equal(b.summonIndex,FINAL_BOSS.maxSummonPhases);
});
test('Marian boss 0 HP defeats once, clears shield and prevents further shots',()=>{
 const b=createFinalBossState();finalBossStart(b);
 assert.ok(finalBossDamage(b,FINAL_BOSS.hp,1000));
 assert.equal(b.defeated,true);assert.equal(b.phase,'defeated');
 assert.equal(b.defeatEvents,1);
 assert.equal(finalBossDamage(b,2,2000),false);
 assert.deepEqual(finalBossStep(b,500),{shots:[],summonTimeout:false});
 const scene=src('../src/catacombs-scene.js');
 assert.ok(scene.includes('if(this.finalized)return false'));
 assert.ok(scene.includes('this.clearShots();this.clearSummons();this.resetMovement();'));
 assert.ok(scene.includes("this.showDialogue('act5-fairy')"));
});
test('full HP after Act IV, Act V save entry, finale completion and menu reset',()=>{
 const fixture=createDebugFixture('act5-opening'),run=fixture.run;
 const raw=serializeCampaignCheckpoint(run,'act5');
 assert.ok(raw);
 const store=new Map([[CAMPAIGN_SAVE_KEY,raw]]);
 const storage={getItem:k=>store.get(k)??null,removeItem:k=>store.delete(k)};
 const loaded=readCampaignCheckpoint(storage);
 assert.deepEqual([...loaded.artifacts].sort(),['blazej-bicycle','bogdan-hunting-horn','marcin-mohawk']);
 assert.equal(loaded.hp,5);
 assert.equal(prepareActStart(run,fixture.handoff,new Set(['Catacombs'])),true);
 const done=completeCampaignAct(run,'act5',{hp:3,maxHp:5,unlockedWeapons:run.unlockedWeapons,
  selectedWeapon:'rifle',kills:3,activeCombatMs:85000});
 assert.ok(done);assert.ok(run.completedActs.has('act5'));
 assert.equal(completeCampaignAct(run,'act5',{hp:3,maxHp:5,unlockedWeapons:run.unlockedWeapons,
  selectedWeapon:'rifle',kills:3,activeCombatMs:85000}),false);
 assert.ok(clearCampaignCheckpoint(storage));assert.equal(readCampaignCheckpoint(storage),null);
 const scene=src('../src/catacombs-scene.js');
 assert.ok(scene.includes("this.scene.start('Menu')"));
 assert.ok(scene.includes('if(!this.run.isDebugRun)clearCampaignCheckpoint()'));
});
test('Act V required loading stays scoped; no new PNGs needed for fallback catacombs',()=>{
 const manifest=actRequiredAssets('act5'),files=manifest.map(x=>x.path);
 assert.ok(files.includes('npcs/captain.png'));
 assert.ok(files.includes('npcs/swinia-wrozka.png'));
 assert.ok(files.includes('enemies/marian-transformed.png'));
 assert.ok(!manifest.find(x=>x.path==='enemies/marian-transformed.png').required);
 assert.ok(!files.some(p=>p.includes('act4-aloes-bicycle.png')));
 assert.ok(actPortraitKeys('act5').includes('swinia-wrozka'));
 assert.deepEqual(scenePortraitKeys('Catacombs'),actPortraitKeys('act5'));
});
test('Act V combat UI and pause guard reuses existing HUD, controls and reveal gate',()=>{
 const s=src('../src/catacombs-scene.js');
 assert.ok(s.includes('createJoystick(this,\'left\')'));
 assert.ok(s.includes('createJoystick(this,\'right\')'));
 assert.ok(s.includes('createHpFaceHud(this,Phaser)'));
 assert.ok(s.includes('beginSceneReveal(this,required'));
 assert.ok(s.includes('this.scene.pause()'));
 assert.ok(s.includes('this.phase===\'boss\''));
 assert.ok(s.includes('if(this.disposed||!this.entryGateReady)return'));
});
