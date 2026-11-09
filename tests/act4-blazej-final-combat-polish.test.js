import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PITCH_ENCOUNTER_RADIUS,pitchNearby} from '../src/school-staging.js';
import {BLAZEJ_START,BLAZEJ_RADIUS,BLAZEJ_JUMP_MAX_TRAVEL,blazejJumpLanding} from '../src/school-finale.js';
import {BLAZEJ_HP,BLAZEJ_ATTACK} from '../src/school-blazej.js';
import {BLAZEJ_JUMP_DURATION_MS,BLAZEJ_JUMP_LIFT_PX,blazejJumpFrame} from '../src/school-blazej-jump.js';
import {SCHOOL_OBSTACLES,schoolWalkable} from '../src/school-contract.js';
import {firstFootprintHit} from '../src/obstacle-geometry.js';
import {DIALOGUES} from '../src/dialogue-data.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Błażej observer is at actual boss position, 200px silent and 125px triggers',()=>{
 assert.equal(PITCH_ENCOUNTER_RADIUS,130);
 assert.equal(pitchNearby({x:BLAZEJ_START.x-200,y:BLAZEJ_START.y}),false);
 assert.equal(pitchNearby({x:BLAZEJ_START.x-125,y:BLAZEJ_START.y}),true);
 assert.equal(pitchNearby({x:1065,y:870}),false);
 assert.equal(pitchNearby({x:200,y:200},{x:250,y:250}),true,'uses supplied live boss position');
 assert.ok(source('../src/school-scene.js').includes('pitchNearby(this.player,this.blazej.actor)'));
 assert.equal(DIALOGUES['act4-blazej-observer'].length,2);
 assert.equal(DIALOGUES['act4-blazej-confrontation'].length,4);
 assert.equal(DIALOGUES['act4-blazej-final'][0][0],'blazej');
});
test('safe forward leap searches near captured Aloes position and obeys 240px cap',()=>{
 const player={x:1170,y:785},landing=blazejJumpLanding(BLAZEJ_START,player);
 assert.ok(landing&&schoolWalkable(landing,BLAZEJ_RADIUS));
 assert.ok(Math.hypot(landing.x-BLAZEJ_START.x,landing.y-BLAZEJ_START.y)>60,'must visibly advance');
 assert.ok(Math.hypot(landing.x-player.x,landing.y-player.y)<=65,'near Aloes rather than 72px fixed short');
 assert.equal(firstFootprintHit(BLAZEJ_START,landing,SCHOOL_OBSTACLES,BLAZEJ_RADIUS),null);
 assert.ok(Math.hypot(landing.x-BLAZEJ_START.x,landing.y-BLAZEJ_START.y)<=BLAZEJ_JUMP_MAX_TRAVEL);
 assert.equal(BLAZEJ_JUMP_DURATION_MS,360);assert.equal(BLAZEJ_JUMP_LIFT_PX,55);
 const halfway=blazejJumpFrame(BLAZEJ_START,landing,180);
 assert.ok(halfway.lift>54&&halfway.x!==BLAZEJ_START.x);
 assert.equal(blazejJumpFrame(BLAZEJ_START,landing,360).complete,true);
});
test('blocked jump uses safe nearest alternative or in-place only if necessary',()=>{
 const start={x:1335,y:830},player={x:1660,y:830};
 const landing=blazejJumpLanding(start,player);
 assert.ok(landing&&schoolWalkable(landing,BLAZEJ_RADIUS));
 assert.equal(firstFootprintHit(start,landing,SCHOOL_OBSTACLES,BLAZEJ_RADIUS),null);
 assert.ok(landing.x<1400,'rack cannot be crossed');
 assert.ok(Math.hypot(landing.x-start.x,landing.y-start.y)<=BLAZEJ_JUMP_MAX_TRAVEL);
});
test('sprite warning flashes without either preattack circle and resets safely',()=>{
 const boss=source('../src/school-blazej.js');
 assert.equal(BLAZEJ_HP,54);assert.equal(BLAZEJ_ATTACK.warning,900);
 assert.ok(boss.includes("bossArt.setTint(Math.floor(attack.elapsed/100)%2===0?0xffe1a3:0xffffff)"));
 assert.ok(boss.includes('bossArt.clearTint()'));
 assert.equal(boss.includes('0xffd06a'),false);
 assert.equal(boss.includes('0xff6c39'),false);
 assert.ok(boss.includes('capturedPlayer={x:scene.player.x,y:scene.player.y}'));
 assert.ok(boss.includes('jumpCount++;landings++;'));
 assert.ok(boss.includes('shockwaveMs=210'));
});
test('async approved Błażej portrait refreshes the active matching panel with no index reset',()=>{
 const ui=source('../src/dialogue-ui.js');
 assert.ok(ui.includes("const texture='dialogue-'+key"));
 assert.ok(ui.includes("images.set(key,sprite);loaded.add(key)"));
 assert.ok(ui.includes("currentDialogue(scene.dialogueState)?.[0]===key"));
 assert.ok(ui.includes("render(scene.dialogueState)"));
 assert.ok(!ui.includes('beginDialogue(scene.dialogueState'));
 for(const key of ['act4-blazej-observer','act4-blazej-confrontation','act4-blazej-final'])
  assert.ok(DIALOGUES[key].some(([who])=>who==='blazej'));
 const png=readFileSync(new URL('../public/assets/dialogue/dialogue-blazej.png',import.meta.url));
 assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[192,192]);
});
