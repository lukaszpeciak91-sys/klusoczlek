import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLavaEnemy,lavaDamage,LAVA_TYPES} from '../src/volcano-combat.js';
import {applyEnemyHit} from '../src/bobrozombi.js';
import {BOGDAN_HIT_RADIUS} from '../src/volcano-bogdan.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('water damages and kills both Lawostworki variants',()=>{
 for(const type of Object.keys(LAVA_TYPES)){
  const enemy=createLavaEnemy(type,100,100);
  const damage=lavaDamage('water-flamethrower',1);
  assert.ok(damage>0);
  for(let i=0;i<LAVA_TYPES[type].hp;i++)enemy.hp=applyEnemyHit(enemy.hp,damage);
  assert.equal(enemy.hp,0);
 }
});
test('Lawostworki death grants zone progress once and uses charcoal VFX',()=>{
 const s=read('../src/volcano-combat.js');
 assert.ok(s.includes('if(enemy.dead)return;'));
 assert.ok(s.includes('enemy.dead=true;enemy.bark.destroy()'));
 assert.ok(s.includes('progression.defeated(enemy.zoneId)'));
 assert.ok(s.includes('extinguish:true'));
 assert.ok(s.includes('scene.time.delayedCall(145'));
});
test('fairy smaller and Bogdan enlarged without changing Marlena scale',()=>{
 assert.ok(read('../src/volcano-npcs.js').includes('scale:.35'));
 const s=read('../src/volcano-bogdan.js');
 assert.ok(s.includes("key==='bogdan'?.79:.72"));
 assert.equal(BOGDAN_HIT_RADIUS,38);
});
test('opening Lawostworki uses fixed region rather than travel accumulation',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes('lawosTriggerReached(this.player,this.lawosTrigger)'));
 assert.ok(s.includes('lawosDialogueTrigger(this.combat.enemies.filter('));
 assert.equal(s.includes('if(this.lawosTravel>=125)'),false);
 assert.ok(s.includes('this.openingSafeUntil=this.time.now+1100'));
 assert.equal(s.includes('this.openingSafeUntil=this.time.now+3500'),false);
});
