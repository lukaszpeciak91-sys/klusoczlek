import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACKS,RetroAudio,loadAudioSettings,effectiveMusicGain,sfxBusGain,SFX_MASTER} from '../src/retro-audio.js';

test('approved music routing across all five acts',()=>{
 assert.deepEqual(TRACKS,{Menu:'menu',Arena:'act1',Airship:'act2',Volcano:'act3',School:'act4',Catacombs:'act5',Credits:'credits'});
});
test('default mix, clamp and saved settings',()=>{
 const store={getItem:()=>null};
 assert.deepEqual(loadAudioSettings(store),{music:.20,sfx:.40,muted:false});
 const a=new RetroAudio();let saved='';
 globalThis.localStorage={getItem:()=>null,setItem:(_k,value)=>{saved=value;}};
 a.volume('music',2);a.volume('sfx',-.8);a.mute(true);
 assert.equal(a.settings.music,1);assert.equal(a.settings.sfx,0);assert.equal(a.settings.muted,true);
 assert.deepEqual(JSON.parse(saved),a.settings);
 delete globalThis.localStorage;
});
test('invalid stored settings fail safe',()=>{
 assert.deepEqual(loadAudioSettings({getItem:()=>'{'}),{music:.20,sfx:.40,muted:false});
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

test('Gridfall calibrated gains have single SFX master attenuation',()=>{
 assert.ok(Math.abs(effectiveMusicGain(.20)-.14)<1e-10);
 assert.ok(Math.abs(sfxBusGain(.40)-.54)<1e-10);
 assert.equal(SFX_MASTER,.28);
 assert.ok(Math.abs(sfxBusGain(.40)*SFX_MASTER-.1512)<1e-10);
 assert.equal(effectiveMusicGain(0),0);
 assert.equal(sfxBusGain(0),0);
 assert.equal(sfxBusGain(1),1);
 assert.ok(Math.abs(effectiveMusicGain(1)-.70)<1e-10);
});
test('legacy saved values survive migration with mute and one-percent steps',()=>{
 const saved={music:.45,sfx:.65,muted:true};
 assert.deepEqual(loadAudioSettings({getItem:()=>JSON.stringify(saved)}),saved);
 const a=new RetroAudio();a.settings={...saved};
 a.volume('music',.21);a.volume('sfx',.41);
 assert.deepEqual(a.settings,{music:.21,sfx:.41,muted:true});
 a.mute(false);
 assert.equal(a.settings.music,.21);
 assert.equal(a.settings.sfx,.41);
});
test('live music volume without restarting track',()=>{
 const a=new RetroAudio();let starts=0;
 a.music={volume:0,play:()=>{starts++;},paused:false};
 a.volume('music',.37);
 assert.ok(Math.abs(a.music.volume-.259)<1e-12);
 assert.equal(starts,0);
 a.mute(true);assert.equal(a.music.volume,0);
 a.mute(false);assert.ok(Math.abs(a.music.volume-.259)<1e-12);
});
test('live continuous SFX gain updates without recreation',()=>{
 const a=new RetroAudio();
 const voice={gain:{gain:{value:0}}};a.streamVoice=voice;
 a.volume('sfx',.4);
 assert.ok(Math.abs(voice.gain.gain.value-.095*.54)<1e-10);
 a.mute(true);assert.equal(a.streamVoice,null);
});
