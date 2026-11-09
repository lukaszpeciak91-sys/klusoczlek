import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FINAL_CREDITS,BIRTHDAY_DEDICATION} from '../src/final-credits-data.js';
import {TRACKS} from '../src/retro-audio.js';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('approved scroll credits cover every role in exact stable order',()=>{
 assert.equal(FINAL_CREDITS.length,25);
 assert.deepEqual(FINAL_CREDITS[0],{
  role:'OPARTE NA MOTYWACH SMS-OWEJ OPOWIASTKI',
  name:'"LEŚNI PRZYJACIELE"\nMICHAŁA ALOESA ŚWIDERSKIEGO'
 });
 assert.deepEqual(FINAL_CREDITS.slice(1,4),[
  {role:'KŁUSOCZŁEK',name:'A NEPAHU STUDIOS GAME'},
  {role:'POMYSŁ, SCENARIUSZ I PRODUKCJA',name:'Łukasz Peciak'},
  {role:'REŻYSERIA',name:'Łukasz Peciak'}
 ]);
 assert.deepEqual(FINAL_CREDITS.at(-1),{
  role:'SPECJALNE PODZIĘKOWANIA',name:'Wszystkim Leśnym Przyjaciołom'
 });
 assert.ok(FINAL_CREDITS.some(x=>x.role==='PROGRAMOWANIE I REALIZACJA'&&x.name==='Łukasz Peciak i AI'));
 assert.ok(FINAL_CREDITS.some(x=>x.role==='MUZYKA'&&x.name==='Suno AI'));
 assert.ok(FINAL_CREDITS.some(x=>x.role==='OSOBA ODPOWIEDZIALNA\nZA CAŁE ZAMIESZANIE'&&x.name==='Michał Aloes Świderski'));
 assert.ok(!FINAL_CREDITS.some(x=>/kaw|ekspres/i.test(x.role+x.name)));
 assert.equal(BIRTHDAY_DEDICATION,'WSZYSTKIEGO NAJLEPSZEGO MICHAŁ!');
});
test('boot-only Nepahu scene and Credits scene are integrated into real Phaser registry',()=>{
 const main=source('../src/main.js'),intro=source('../src/studio-intro-scene.js');
 const credits=source('../src/credits-scene.js'),cat=source('../src/catacombs-scene.js');
 assert.ok(main.includes('scene: [StudioIntroScene, MenuScene'));
 assert.ok(main.includes('CatacombsScene, CreditsScene]'));
 assert.ok(intro.includes("super('StudioIntro')"));
 assert.ok(intro.includes("this.scene.start('Menu')"));
 assert.ok(intro.includes("this.input.on('pointerdown',skip)"));
 assert.ok(intro.includes("this.input.keyboard?.on('keydown',skip)"));
 assert.ok(credits.includes("super('Credits')"));
 assert.ok(credits.includes('retroAudio.credits()'));
 assert.ok(credits.includes("this.scene.start('Menu')"));
 assert.ok(credits.includes('Math.min(70,delta)'));
 assert.ok(cat.includes("this.scene.start('Credits')"));
 assert.ok(!cat.includes("this.finaleText=this.add.text"));
 assert.ok(!cat.includes("this.scene.start('Menu');\n  });\n  return true;"));
});
test('credit audio loops using original audio manager without changing settings storage',()=>{
 const audio=source('../src/retro-audio.js'),credits=source('../src/credits-scene.js');
 assert.equal(TRACKS.Credits,'credits');
 assert.equal(TRACKS.Menu,'menu');
 assert.ok(audio.includes('audio.loop=true'));
 assert.ok(audio.includes("const KEY='klusoczlek-audio-v1'"));
 assert.ok(credits.includes('this.returning=true'));
 assert.ok(credits.includes('this.finished=true'));
 assert.ok(credits.includes('this.dedication.setVisible(true)'));
 assert.ok(!credits.includes('new Audio('));
});
