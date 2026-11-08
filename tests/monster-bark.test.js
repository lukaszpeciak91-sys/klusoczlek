import test from 'node:test';
import assert from 'node:assert/strict';
import {createBarkState,chooseBark,barkVisible,clearBark,WATER_BARKS,BOGDAN_BARKS,MONSTER_BARK_STYLE} from '../src/monster-bark.js';
import {MARLENA_BARKS} from '../src/volcano-bogdan.js';

test('water-specific bark pool and Bogdan context lines stay approved',()=>{
 assert.deepEqual(WATER_BARKS,['Tylko nie wodą!','Ty łajzo!']);
 assert.deepEqual(BOGDAN_BARKS.pursuit,['NIE POKONASZ BOGDANA!','ZARAZ CIE DOPADNE','ZROBIE CI Z DUPY KROPKE NAD I']);
 assert.deepEqual(BOGDAN_BARKS.damage,['Aaaaaaaaa!']);
 assert.deepEqual(BOGDAN_BARKS.charge,['Lewatywaaaaa!']);
 assert.deepEqual(MARLENA_BARKS,['Mama miała rację!','Niech sam w tym smrodzie siedzi, pajac!']);
});
test('deterministic cooldown blocks continuous water spam and overlaps',()=>{
 const s=createBarkState();
 assert.equal(chooseBark(s,WATER_BARKS,1000),'Tylko nie wodą!');
 assert.equal(chooseBark(s,WATER_BARKS,1200),null);
 assert.equal(chooseBark(s,WATER_BARKS,3500),null);
 assert.equal(chooseBark(s,WATER_BARKS,5500),'Ty łajzo!');
 assert.equal(chooseBark(s,WATER_BARKS,10000),'Tylko nie wodą!');
});
test('bark visibility and cleanup on death or despawn',()=>{
 const s=createBarkState(),calls=[];
 const text={active:true,setVisible(v){calls.push(v);return this;}};
 chooseBark(s,BOGDAN_BARKS.damage,200);
 assert.equal(barkVisible(s,400),true);
 assert.equal(barkVisible(s,400,false),false);
 assert.equal(barkVisible(s,2500),false);
 clearBark(s,text);
 assert.equal(barkVisible(s,500),false);
 assert.deepEqual(calls,[false]);
});
test('shared monster style retains retro typography and outline',()=>{
 assert.equal(MONSTER_BARK_STYLE.fontFamily,'monospace');
 assert.equal(MONSTER_BARK_STYLE.fontSize,'13px');
 assert.equal(MONSTER_BARK_STYLE.fontStyle,'bold');
 assert.equal(MONSTER_BARK_STYLE.color,'#fff1c9');
 assert.equal(MONSTER_BARK_STYLE.backgroundColor,'#1c2028');
 assert.deepEqual(MONSTER_BARK_STYLE.padding,{x:5,y:3});
});
