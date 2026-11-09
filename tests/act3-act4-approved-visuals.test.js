import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {BLAZEJ_ASSET,ZUBROKRYPTYDA_ASSET,ZUBROKRYPTYDA_VISUAL_SCALE,
 ZUBROKRYPTYDA_FEET_OFFSET} from '../src/enemy-visual.js';
import {FACINGS} from '../src/combat-contract.js';
import {DIALOGUES} from '../src/dialogue-data.js';
import {validPngHeader} from '../src/character-visual.js';
import {validDialoguePng} from '../src/dialogue-ui.js';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const asset=path=>readFileSync(new URL('../public/assets/'+path,import.meta.url));

// Decode complete compressed image data; count only real unfiltered RGBA alpha.
// Thus a PNG with valid dimensions but corrupted IDAT or blank frames fails.
function pngAlpha(path,frameWidth=null){
 const bytes=asset(path),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(bytes[24],8,'8-bit channel depth');assert.equal(bytes[25],6,'RGBA');
 assert.equal(bytes[28],0,'non-interlaced PNG');
 const data=[];let p=8;
 while(p+12<=bytes.length){
  const size=bytes.readUInt32BE(p),kind=bytes.toString('ascii',p+4,p+8);
  if(kind==='IDAT')data.push(bytes.subarray(p+8,p+8+size));
  p+=size+12;if(kind==='IEND')break;
 }
 assert.ok(data.length,'PNG IDAT exists');
 const raw=inflateSync(Buffer.concat(data));
 const stride=width*4;assert.equal(raw.length,height*(stride+1),'full PNG decoding');
 const frameCount=frameWidth?width/frameWidth:1;
 assert.equal(Number.isInteger(frameCount),true,'whole frames only');
 const stats=Array.from({length:frameCount},()=>({opaque:0,transparent:0}));
 let at=0,previous=new Uint8Array(stride);
 for(let y=0;y<height;y++){
  const filter=raw[at++],row=new Uint8Array(stride);
  assert.ok(filter>=0&&filter<=4);
  for(let j=0;j<stride;j++){
   const left=j>=4?row[j-4]:0,up=previous[j],upLeft=j>=4?previous[j-4]:0;
   let predictor=0;
   if(filter===1)predictor=left;
   else if(filter===2)predictor=up;
   else if(filter===3)predictor=(left+up)>>1;
   else if(filter===4){
    const estimate=left+up-upLeft,da=Math.abs(estimate-left),db=Math.abs(estimate-up),dc=Math.abs(estimate-upLeft);
    predictor=da<=db&&da<=dc?left:db<=dc?up:upLeft;
   }
   row[j]=(raw[at++]+predictor)&255;
  }
  for(let x=0;x<width;x++){
   const frame=frameWidth?Math.floor(x/frameWidth):0;
   if(row[x*4+3]===0)stats[frame].transparent++;
   else stats[frame].opaque++;
  }
  previous=row;
 }
 assert.equal(at,raw.length);
 for(const frame of stats){
  assert.ok(frame.opaque>250,'each frame has visible approved art');
  assert.ok(frame.transparent>0,'transparent PNG canvas retained');
 }
 return {width,height,stats,bytes};
}

test('approved Bogdan horn exists, is a fully decoded transparent 192x192 RGBA PNG',()=>{
 const horn=pngAlpha('artifacts/artifact-bogdan-horn.png');
 assert.deepEqual([horn.width,horn.height],[192,192]);
 assert.equal(validPngHeader(horn.bytes,{width:192,height:192}),true);
 const volcano=source('../src/volcano-scene.js');
 assert.ok(volcano.includes("artifacts/artifact-bogdan-horn.png"));
 assert.ok(volcano.includes("this.rewardRoot.addAt(this.hornRewardImage,2)"));
 assert.ok(volcano.includes("const size=Math.min(110,y*.32)"));
 assert.ok(volcano.includes("horn.setPosition(x,hasArt?y*.70:y*.47)"));
 assert.ok(volcano.includes("detail.setPosition(x,hasArt?y*.83:y*.66)"));
 assert.ok(volcano.includes("this.rewardRoot.setVisible(true)"));
 assert.ok(volcano.includes("awardRunArtifact(this.run,HORN_ID)"));
 assert.ok(volcano.includes("this.finale.advance('ARTIFACT_REWARD')"));
 assert.ok(volcano.includes("beginDialogue(this.dialogueState,'act3-eruption-warning')"));
});

test('dedicated Błażej world sheet contains all eight directional RGBA frames, original heavy geometry unaffected',()=>{
 assert.deepEqual(FACINGS,['e','se','s','sw','w','nw','n','ne']);
 assert.equal(BLAZEJ_ASSET.path,'enemies/blazej.png');
 assert.deepEqual([BLAZEJ_ASSET.width,BLAZEJ_ASSET.height,BLAZEJ_ASSET.frameWidth,BLAZEJ_ASSET.frameHeight],
  [1536,192,192,192]);
 assert.notEqual(BLAZEJ_ASSET.key,ZUBROKRYPTYDA_ASSET.key);
 const art=pngAlpha(BLAZEJ_ASSET.path,192);
 assert.equal(art.stats.length,8);
 assert.equal(validPngHeader(art.bytes,BLAZEJ_ASSET),true);
 const ordinary=pngAlpha(ZUBROKRYPTYDA_ASSET.path,192);
 assert.equal(ordinary.stats.length,8);
 assert.equal(ZUBROKRYPTYDA_VISUAL_SCALE,.55);
 assert.equal(ZUBROKRYPTYDA_FEET_OFFSET,-48.4);
 const renderer=source('../src/enemy-visual.js');
 const boss=source('../src/school-blazej.js');
 assert.ok(renderer.includes("return createEnemyRenderer(scene,Phaser,'zubrokryptyda',BLAZEJ_ASSET)"));
 assert.ok(renderer.includes("return createEnemyRenderer(scene,Phaser,'zubrokryptyda');"));
 assert.ok(renderer.includes("const asset=visualAsset??("));
 assert.ok(renderer.includes("texture.addSpriteSheet(asset.key,image,{frameWidth:asset.frameWidth,frameHeight:asset.frameHeight})"));
 assert.ok(renderer.includes('FACINGS.indexOf(facingOf('));
 assert.ok(renderer.includes('advanceEnemyGait(gait,type,distance,seconds)'));
 assert.ok(boss.includes('createBlazejRenderer(scene,Phaser)'));
 assert.ok(boss.includes("type:'zubrokryptyda'"));
 assert.ok(boss.includes('renderer.update(actor,scene.player,'));
 assert.ok(boss.includes("createPixelBurst(scene,'zubrokryptyda'"));
 assert.ok(boss.includes("createBurningFx(scene,'zubrokryptyda')"));
});

test('Błażej dialogue has his approved portrait; ordinary enemy portrait and all original lines remain',()=>{
 const portrait=pngAlpha('dialogue/dialogue-blazej.png');
 assert.deepEqual([portrait.width,portrait.height],[192,192]);
 assert.equal(validDialoguePng(portrait.bytes),true);
 const sharedPortrait=asset('dialogue/dialogue-zubrokryptyda.png');
 assert.equal(validDialoguePng(sharedPortrait),true,'untouched ordinary portrait may be RGB or RGBA');
 const ui=source('../src/dialogue-ui.js');
 assert.ok(ui.includes('scenePortraitKeys(scene.scene.key)'));
 assert.ok(DIALOGUES['act4-blazej-observer'].some(([who])=>who==='blazej'));
 assert.ok(DIALOGUES['act4-blazej-confrontation'].some(([who])=>who==='blazej'));
 assert.ok(DIALOGUES['act4-blazej-final'].some(([who])=>who==='blazej'));
 assert.ok(ui.includes("'dialogue/dialogue-'")||ui.includes("'dialogue/dialogue-'+key+'.png'"));
 for(const id of ['act4-blazej-observer','act4-blazej-confrontation','act4-blazej-final']){
  for(const [portraitKey,speaker,line] of DIALOGUES[id]){
   if(speaker==='BŁAŻEJ')assert.equal(portraitKey,'blazej',id+' '+line);
   else assert.notEqual(portraitKey,'blazej','only Błażej uses approved portrait');
  }
 }
 assert.deepEqual(DIALOGUES['act4-blazej-final'],[['blazej','BŁAŻEJ','Ech, kazał pan, musiał sam!']]);
 assert.deepEqual(DIALOGUES['act4-blazej-observer'][1],['bobrozombi','BOBROZOMBI','Ty to jednak Błażej jesteś gość']);
 assert.equal(DIALOGUES['act4-blazej-confrontation'].length,4);
});
