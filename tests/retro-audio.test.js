import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACKS,RetroAudio,loadAudioSettings} from '../src/retro-audio.js';

test('approved music routing across all five acts',()=>{
 assert.deepEqual(TRACKS,{Menu:'menu',Arena:'act1',Airship:'act2',Volcano:'act3',School:'act4',Catacombs:'act5',Credits:'credits'});
});
test('default mix, clamp and saved settings',()=>{
 const store={getItem:()=>null};
 assert.deepEqual(loadAudioSettings(store),{music:.45,sfx:.65,muted:false});
 const a=new RetroAudio();let saved='';
 globalThis.localStorage={getItem:()=>null,setItem:(_k,value)=>{saved=value;}};
 a.volume('music',2);a.volume('sfx',-.8);a.mute(true);
 assert.equal(a.settings.music,1);assert.equal(a.settings.sfx,0);assert.equal(a.settings.muted,true);
 assert.deepEqual(JSON.parse(saved),a.settings);
 delete globalThis.localStorage;
});
test('invalid stored settings fail safe',()=>{
 assert.deepEqual(loadAudioSettings({getItem:()=>'{'}),{music:.45,sfx:.65,muted:false});
 assert.deepEqual(loadAudioSettings({getItem:()=>JSON.stringify({music:5,sfx:-3,muted:true})}),{music:1,sfx:0,muted:true});
});
test('silent fallback does not crash with no browser audio',()=>{
 const a=new RetroAudio();a.enter('Arena');a.enter('Arena');
 assert.equal(a.track,'act1');
 a.shot('rifle');a.shot('blunderbuss');a.stream('flamethrower',true);
 a.hurt();a.enemyDeath();a.death();a.stopStream();
 assert.equal(a.voices,0);
});
test('rate limiter bounds rifle and concurrent enemy deaths',()=>{
 const a=new RetroAudio();
 assert.equal(a.limited('rifle',5000),true);
 assert.equal(a.limited('rifle',5000),false);
 assert.equal(a.limited('enemyDeath',5000),true);
 assert.equal(a.limited('enemyDeath',5000),false);
});
test('stream stop is idempotent and does not allocate',()=>{
 const a=new RetroAudio();a.stream('water-flamethrower',true);a.stopStream();a.stopStream();
 assert.equal(a.streamVoice,null);
});
