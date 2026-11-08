import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LAVA_BARKS,LAVA_INEFFECTIVE_BARKS,LAVA_TYPES,lavaDamage} from '../src/volcano-combat.js';
import {VOLCANO_ZONES,createPlatformProgression} from '../src/volcano-platforms.js';
import {CONTINUOUS_PALETTES,continuousDamageAllowed} from '../src/continuous-weapon.js';
import {shouldSpawnAct2Health,collectAct2Health} from '../src/act2-health-pickup.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('pursuit and ineffective bark pools are disjoint',()=>{
 assert.ok(LAVA_BARKS.includes('I co mi zrobisz?!'));
 assert.ok(LAVA_INEFFECTIVE_BARKS.includes('Łaskocze!'));
 assert.ok(LAVA_BARKS.every(x=>!LAVA_INEFFECTIVE_BARKS.includes(x)));
});
test('normal encounter is pre-staged before zone activation and has no numeric hit labels',()=>{
 const s=source('../src/volcano-combat.js');
 assert.ok(s.includes('function prepareZones()'));
 assert.ok(s.includes('enemy.engaged=false'));
 assert.ok(s.includes('enemy.engaged=true'));
 assert.ok(s.includes('if(enemy.dead||enemy.engaged===false)continue'));
 assert.ok(!s.includes("'-'+applied"));
 assert.ok(!s.includes('showDamageNumber('));
 assert.equal(LAVA_TYPES['lawostworek-1'].hp,3);
 assert.equal(LAVA_TYPES['lawostworek-2'].hp,6);
 assert.equal(lavaDamage('water-flamethrower',1),1);
});
test('apartment zone preserves three distinct enemies and one-shot activation',()=>{
 const z=VOLCANO_ZONES.find(x=>x.id==='apartment-approach');
 assert.equal(z.enemies.length,3);
 assert.ok(z.spawns.slice(0,3).every(p=>p.y>=500));
 const p=createPlatformProgression();let count=0;
 assert.equal(p.activate(z.id,()=>{count++;return true;}),true);
 assert.equal(p.activate(z.id,()=>{count++;return true;}),false);
 assert.equal(count,3);
});
test('water stream is geometrically separate from fire, not a blue triangular flame',()=>{
 const s=source('../src/continuous-weapon.js');
 const a=s.indexOf("if(weapon==='water-flamethrower'){"),b=s.indexOf(' for(const [color,factor,alpha] of palette.layers)',a);
 assert.ok(a>=0&&b>a);
 const water=s.slice(a,b);
 assert.ok(water.includes('lineBetween('));
 assert.ok(!water.includes('fillTriangle('));
 assert.ok(s.slice(b).includes('fillTriangle('));
 assert.ok(CONTINUOUS_PALETTES['water-flamethrower']);
 assert.equal(continuousDamageAllowed('water-flamethrower','lawostworek-2'),true);
});
test('Act II reuses health token without changing heal and timing',()=>{
 const s=source('../src/airship-scene.js');
 assert.ok(s.includes('createHealthToken(this,point.x,point.y)'));
 assert.equal(shouldSpawnAct2Health(90000,false,true),true);
 assert.equal(collectAct2Health({x:10,y:10},{x:10,y:10},3,5),5);
 assert.equal(collectAct2Health({x:10,y:10},{x:10,y:10},5,5),null);
});
test('eruption pulses are bounded to escape and cleanup restores camera/lava',()=>{
 const s=source('../src/volcano-scene.js');
 assert.ok(s.includes("this.finale.state==='ESCAPE_ACTIVE'"));
 assert.ok(s.includes('this.cameras.main.shake(strong?340:230,strong?.005:.003)'));
 assert.ok(s.includes('this.cameras.main.shakeEffect.reset();this.lava.setAlpha(1).clearTint()'));
 assert.ok(s.includes('this.combat.prepareZones()'));
});
