import test from 'node:test';
import assert from 'node:assert/strict';
import {VOLCANO_ZONES,FAIRY_ZONE,zoneForPosition,inVolcanoZone,findZoneSpawn,createPlatformProgression} from '../src/volcano-platforms.js';
import {FAIRY_MARK} from '../src/volcano-npcs.js';
import {VOLCANO_START} from '../src/volcano-contract.js';

test('four explicit zones, 2/3/3/4 enemies, 12 total',()=>{
 assert.deepEqual(VOLCANO_ZONES.map(z=>z.id),['entrance','middle','apartment-approach','fairy']);
 assert.deepEqual(VOLCANO_ZONES.map(z=>z.enemies.length),[2,3,3,4]);
 assert.equal(VOLCANO_ZONES.reduce((sum,z)=>sum+z.enemies.length,0),12);
 assert.deepEqual(VOLCANO_ZONES[3].enemies,['lawostworek-1','lawostworek-1','lawostworek-2','lawostworek-2']);
 assert.equal(zoneForPosition(VOLCANO_START),'entrance');
 assert.equal(zoneForPosition(FAIRY_MARK),'fairy');
 assert.equal(inVolcanoZone(FAIRY_ZONE,{x:1000,y:900}),false);
});
test('zone activation is one-shot and leaving/re-entering does not duplicate enemies',()=>{
 const p=createPlatformProgression(),spawned=[];
 assert.equal(p.activate('entrance',(z,t,i)=>{spawned.push([z.id,t,i]);return true;}),true);
 assert.equal(p.activate('entrance',()=>{throw Error('duplicate');}),false);
 assert.equal(p.get('entrance').alive,2);
 assert.equal(p.activate('middle',(z,t,i)=>{spawned.push([z.id,t,i]);return true;}),true);
 assert.equal(p.activate('apartment-approach',(z,t,i)=>{spawned.push([z.id,t,i]);return true;}),true);
 assert.equal(p.activate('apartment-approach',()=>{throw Error('duplicate apartment activation');}),false);
 assert.equal(p.get('apartment-approach').alive,3);
 assert.equal(p.activate('fairy',(z,t,i)=>{spawned.push([z.id,t,i]);return true;}),true);
 assert.equal(spawned.length,12);
 assert.equal(p.fairyReveal,false);
 assert.equal(p.defeated('middle'),false);
 assert.equal(p.defeated('middle'),false);
 assert.equal(p.defeated('middle'),true);
 assert.equal(p.fairyReveal,false);
 for(let i=0;i<3;i++)assert.equal(p.defeated('fairy'),false);
 assert.equal(p.fairyReveal,false);
 assert.equal(p.defeated('fairy'),true);
 assert.equal(p.fairyReveal,true);
 assert.equal(p.get('entrance').alive,2);
});
test('invalid spawn is not counted alive and empty encounter cannot fake victory',()=>{
 const p=createPlatformProgression();
 assert.equal(p.activate('fairy',()=>false),true);
 assert.equal(p.get('fairy').failed,4);
 assert.equal(p.get('fairy').alive,0);
 assert.equal(p.get('fairy').cleared,false);
 assert.equal(p.defeated('fairy'),false);
 assert.equal(p.fairyReveal,false);
});
test('same-zone footprint validation prevents cross-platform fallback',()=>{
 const width=1800,height=1200,pixels=new Uint8Array(width*height);
 // Only the middle platform is walkable; fairy candidates must not relocate there.
 for(let y=700;y<1050;y++)for(let x=850;x<1150;x++)pixels[y*width+x]=1;
 const mask={width,height,pixels};
 assert.equal(findZoneSpawn(mask,FAIRY_ZONE,{x:330,y:250},21),null);
 const middle=VOLCANO_ZONES[1];
 const spawn=findZoneSpawn(mask,middle,{x:900,y:920},21,[{x:900,y:920,radius:17}]);
 assert.ok(spawn);
 assert.ok(inVolcanoZone(middle,spawn));
 assert.ok(Math.hypot(spawn.x-900,spawn.y-920)>=50);
});
test('failed zone activation never reactivates or spawns duplicates',()=>{
 const p=createPlatformProgression();
 let attempts=0;
 p.activate('middle',()=>{attempts++;return attempts===1;});
 assert.equal(attempts,3);
 assert.equal(p.get('middle').alive,1);
 assert.equal(p.get('middle').failed,2);
 assert.equal(p.activate('middle',()=>{attempts++;return true;}),false);
 assert.equal(attempts,3);
 assert.equal(p.defeated('middle'),true);
});
