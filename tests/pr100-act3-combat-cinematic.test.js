import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bogdanCombatBounds,bogdanCombatHit,bogdanConeTarget,BOGDAN_HP,BOGDAN_HIT_RADIUS} from '../src/volcano-bogdan.js';
import {VOLCANO_ZONES,createPlatformProgression} from '../src/volcano-platforms.js';
import {DEATH_PROFILES} from '../src/combat-feedback.js';
import {LAVA_TYPES} from '../src/volcano-combat.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Bogdan combat hitbox spans head, torso, arms and feet without enlarging movement radius',()=>{
 const actor={x:500,y:500,displayWidth:102,displayHeight:126};
 const bounds=bogdanCombatBounds(actor);
 assert.equal(bounds.top,369);assert.equal(bounds.bottom,505);
 for(const [x,y] of [[500,380],[500,435],[453,440],[547,440],[500,498]])assert.equal(bogdanCombatHit(actor,x,y),true);
 for(const [x,y] of [[500,350],[430,430],[500,530],[560,430]])assert.equal(bogdanCombatHit(actor,x,y),false);
 assert.equal(bogdanConeTarget(actor).y,(bounds.top+bounds.bottom)/2);
 assert.equal(BOGDAN_HIT_RADIUS,38);assert.equal(BOGDAN_HP,80);
});
test('normal apartment approach adds three enemies independent of escape',()=>{
 const zone=VOLCANO_ZONES.find(z=>z.id==='apartment-approach');
 assert.equal(zone.enemies.length,3);
 assert.ok(zone.enemies.includes('lawostworek-1'));
 assert.ok(zone.enemies.includes('lawostworek-2'));
 assert.equal(LAVA_TYPES['lawostworek-1'].hp,3);
 assert.equal(LAVA_TYPES['lawostworek-2'].hp,6);
 const progress=createPlatformProgression();
 assert.equal(progress.activate(zone.id,()=>true),true);
 assert.equal(progress.get(zone.id).alive,3);
 assert.equal(progress.defeated(zone.id),false);
 assert.equal(progress.defeated(zone.id),false);
 assert.equal(progress.defeated(zone.id),true);
});
test('distinct volcanic pixel death effects outlast hit flash',()=>{
 for(const type of ['lawostworek-1','lawostworek-2']){
  const p=DEATH_PROFILES[type];assert.ok(p.count>=50);assert.ok(p.duration>=450);
 }
 const s=read('../src/volcano-combat.js');
 assert.ok(s.includes("enemy.type==='lawostworek-2'?'lawostworek-2':'lawostworek-1'"));
});
test('Bogdan screen HUD and combat feedback use Marcin visual contract',()=>{
 const s=read('../src/volcano-bogdan.js');
 assert.ok(s.includes('setScrollFactor(0)'));
 assert.ok(s.includes('Math.min(210,scene.scale.width*.38)'));
 assert.ok(s.includes('fillStyle(0xd64b44)'));
 assert.ok(!s.includes('showDamageNumber('));
 assert.ok(s.includes('bossPresentation.defeat()'));
});
test('both Act III hearts use Act I token presentation and preserve healing values',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes('createHealthToken(this,candidate.x,candidate.y)'));
 assert.ok(s.includes('createHealthToken(this,point.x,point.y)'));
 assert.ok(s.includes('this.run.hp+2'));
 assert.ok(s.includes('healOneHp(this.run.hp,this.run.maxHp)'));
 const token=read('../src/health-token.js');
 for(const fragment of ['ellipse(0,13,42,13','circle(0,0,18,0xb93542','fontSize:\'21px\''])assert.ok(token.includes(fragment));
});
test('Bogdan explosion completion is lifecycle-driven before dialogue lock',()=>{
 const s=read('../src/volcano-scene.js');
 assert.ok(s.includes('this.advanceBogdanExplosion(delta);'));
 assert.ok(s.indexOf('this.advanceBogdanExplosion(delta);')<s.indexOf('if(!this.controlsAllowed()||this.defeated)return;'));
 assert.ok(s.includes('if(this.escapeBurst.done){this.escapeBurst=null;this.finishBogdanExplosion();}'));
 assert.ok(!s.includes('this.time.delayedCall(750'));
});
