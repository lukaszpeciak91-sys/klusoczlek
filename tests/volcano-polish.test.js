import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGUES} from '../src/dialogue-data.js';
import {bossRepositionVector,BOGDAN_HIT_RADIUS} from '../src/volcano-bogdan.js';
import {createPlatformProgression} from '../src/volcano-platforms.js';
import {CONTINUOUS_PALETTES} from '../src/continuous-weapon.js';

test('Act III Captain introduces the water weapon before Lawostworki',()=>{
 assert.equal(DIALOGUES['act3-opening'][0][2],'Masz to! To miotacz wody! Przyda Ci się!');
 assert.equal(DIALOGUES['act3-opening'].length,4);
});
test('Lawostworki speakers are Krzyś and Andrzejek with original portrait keys',()=>{
 const lines=DIALOGUES['act3-lawostworki'];
 assert.ok(lines.every(l=>l[1]===(l[0]==='lawostworek-2'?'KRZYŚ':l[0]==='lawostworek-1'?'ANDRZEJEK':'ALOES')));
});
test('Bogdan repositions deterministically and keeps a boss-sized radius',()=>{
 assert.ok(BOGDAN_HIT_RADIUS>25);
 const b={x:0,y:0},p={x:300,y:0};
 assert.deepEqual(bossRepositionVector(b,p,1200,2),bossRepositionVector(b,p,1200,2));
 assert.ok(Math.hypot(...Object.values(bossRepositionVector(b,p,1200,2)))>.1);
 assert.notDeepEqual(bossRepositionVector(b,p,1200,2),bossRepositionVector(b,p,3200,2));
});
test('fairy reveal waits for active island combat, but does not softlock on invalid spawns',()=>{
 const p=createPlatformProgression();
 assert.equal(p.fairyReveal,false);
 p.activate('fairy',()=>false);
 assert.equal(p.fairyReveal,false);
 const q=createPlatformProgression();
 q.activate('fairy',()=>true);
 assert.equal(q.fairyReveal,false);
 for(let i=0;i<4;i++)q.defeated('fairy');
 assert.equal(q.fairyReveal,true);
});
test('water keeps its distinct cyan palette',()=>{
 assert.ok(CONTINUOUS_PALETTES['water-flamethrower'].particles.length>=3);
});
