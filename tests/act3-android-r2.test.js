import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LAVA_TYPES,createLavaEnemy,lavaDamage,ordinaryLavaBarkDue} from '../src/volcano-combat.js';
import {VOLCANO_START,volcanoStep} from '../src/volcano-contract.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('one movement integration, unchanged speed and dialogue input lock',()=>{
 const s=read('../src/volcano-scene.js');
 const update=s.slice(s.indexOf('  update(_time,delta){'));
 assert.equal((update.match(/volcanoStep\(this.player,input,delta,PLAYER_SPEED,PLAYER_RADIUS,this.walkability\)/g)||[]).length,1);
 assert.ok(update.includes('if(!this.openingComplete||!this.walkability||this.dialogueState.id){this.resetMovement();return;}'));
 assert.ok(update.includes('this.startLawosEncounter()'));
});
test('Lawostworek 2 has six HP, first has three and both accept water',()=>{
 assert.equal(LAVA_TYPES['lawostworek-1'].hp,3);
 assert.equal(LAVA_TYPES['lawostworek-2'].hp,6);
 for(const type of Object.keys(LAVA_TYPES)){
  const e=createLavaEnemy(type,100,100);
  const damage=lavaDamage('water-flamethrower',1);
  assert.ok(damage>0);
  for(let i=0;i<LAVA_TYPES[type].hp;i++)e.hp=Math.max(0,e.hp-damage);
  assert.equal(e.hp,0);
 }
});
test('pursuit bark cooldown and dialogue priority',()=>{
 const e=createLavaEnemy('lawostworek-1',100,100,0);
 assert.equal(ordinaryLavaBarkDue(e,3999,false),false);
 assert.equal(ordinaryLavaBarkDue(e,4000,false),true);
 assert.equal(ordinaryLavaBarkDue(e,4000,true),false);
 assert.equal(ordinaryLavaBarkDue(e,4000,false,1),false);
 e.dead=true;assert.equal(ordinaryLavaBarkDue(e,5000,false),false);
 const s=read('../src/volcano-combat.js');
 assert.ok(s.includes("['BOGDAN_ACTIVE','ESCAPE_ACTIVE']"));
 assert.ok(s.includes('cooldown:6000,duration:1700'));
});
test('fairy sprite is 70% of previous scale and departure retains scale',()=>{
 const s=read('../src/volcano-npcs.js');
 assert.ok(s.includes("frame:null,scale:.35"));
 assert.ok(s.includes("setScale(SHEETS['swinia-wrozka'].scale)"));
});
test('Bogdan HP bar uses rendered height and separates bark',()=>{
 const s=read('../src/volcano-bogdan.js');
 assert.ok(s.includes('bogdan.y-bogdan.displayHeight'));
 assert.ok(s.includes('const barTop=spriteTop-24'));
 assert.ok(s.includes('barTop-46'));
});
test('pre-boss +2 HP pickup and existing post-boss +1 remain independent',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes('spawnPreBossHeart()'));
 assert.ok(s.includes('this.run.hp=Math.min(this.run.maxHp,this.run.hp+2)'));
 assert.ok(s.includes('this.run.hp>=this.run.maxHp'));
 assert.ok(s.includes('this.preBossHeartCollected=true'));
 assert.ok(s.includes('this.spawnBogdanHeart()'));
 assert.ok(s.includes('healOneHp(this.run.hp,this.run.maxHp)'));
});
test('escape spawns route-ahead, respects active cap and retry',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes('this.extractionPoint.x-this.player.x'));
 assert.ok(s.includes('const offsets=[{ahead:225,side:105}'));
 assert.ok(s.includes('if(living.length<6)'));
 assert.ok(s.includes('this.escapeSuccessfulSpawns<3'));
 assert.ok(s.includes('this.combat.clearEscapeEnemies();this.escapeSpawned=0'));
});
