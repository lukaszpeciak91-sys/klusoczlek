import {assetUrl} from './character-visual.js';
export function validDialoguePng(bytes){
 const signature=[137,80,78,71,13,10,26,10];
 if(bytes.length<26||!signature.every((b,i)=>bytes[i]===b))return false;
 const value=i=>(bytes[i]*16777216+bytes[i+1]*65536+bytes[i+2]*256+bytes[i+3])>>>0;
 return value(16)===192&&value(20)===192&&bytes[24]===8&&(bytes[25]===2||bytes[25]===6);
}
import {currentDialogue,advanceDialogue} from './dialogue-data.js';
const PORTRAITS=['aloes','bobrozombi','bocianolak','zubrokryptyda','marcin'];
export function createDialoguePanel(scene,Phaser,onFinish){
 const shell=scene.add.container(0,0).setDepth(110).setScrollFactor(0).setVisible(false);
 const bg=scene.add.rectangle(0,0,100,100,0x171b20,0.92).setStrokeStyle(2,0xb39a64).setOrigin(0);
 const portraitBox=scene.add.rectangle(0,0,60,60,0x45372b).setStrokeStyle(1,0xc9a76a).setOrigin(0);
 const initial=scene.add.text(0,0,'?',{fontFamily:'monospace',fontSize:'28px',color:'#f4deb0'}).setOrigin(0.5);
 const speaker=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'16px',fontStyle:'bold',color:'#f0c97f'}).setOrigin(0);
 const text=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'15px',color:'#f5ead7',wordWrap:{width:350,useAdvancedWrap:true}}).setOrigin(0);
 const button=scene.add.rectangle(0,0,85,32,0x4e4030).setStrokeStyle(1,0xdac184).setScrollFactor(0).setDepth(112).setInteractive({useHandCursor:true}).setVisible(false);
 const caption=scene.add.text(0,0,'DALEJ',{fontFamily:'monospace',fontSize:'15px',color:'#fff4db'}).setOrigin(0.5).setScrollFactor(0).setDepth(113).setVisible(false);
 shell.add([bg,portraitBox,initial,speaker,text]);
 const images=new Map();
 let disposed=false,active=false,blockedUntil=0;
 const layout=()=>{
  const w=scene.scale.width,h=scene.scale.height;
  const margin=Math.max(5,Math.min(12,w*.015)),width=w-2*margin,x=margin;
  const compact=w<400;
  const portrait=Math.round(Math.min(compact?55:78,Math.max(43,h*.23)));
  const px=x+10,tx=px+portrait+12,tw=Math.max(70,width-portrait-36);
  const font=compact?13:w<650?16:18;
  const speakerFont=compact?12:w<650?15:17;
  const buttonHeight=compact?29:33;
  // Measure the actual wrapped line before allocating panel height.
  text.setFontSize(font).setWordWrapWidth(tw);
  speaker.setFontSize(speakerFont).setWordWrapWidth(tw);
  const speakerTop=10,bodyTop=speakerTop+speaker.height+7;
  const needed=bodyTop+text.height+buttonHeight+21;
  const height=Math.min(h-2*margin,Math.max(portrait+24,needed,compact?104:112));
  const y=h-height-margin,py=y+11;
  bg.setPosition(x,y).setSize(width,height);
  portraitBox.setPosition(px,py).setSize(portrait,portrait);
  initial.setPosition(px+portrait/2,py+portrait/2).setFontSize(Math.round(portrait*.36));
  speaker.setPosition(tx,y+speakerTop);
  text.setPosition(tx,y+bodyTop);
  const by=y+height-buttonHeight/2-8,bx=x+width-51;
  // If content genuinely exceeds the available viewport, fit typography gently.
  for(let size=font;size>=10&&text.y+text.height>by-buttonHeight/2-5;size-=.5)text.setFontSize(size);
  button.setPosition(bx,by).setSize(compact?72:88,buttonHeight);
  caption.setPosition(bx,by).setFontSize(compact?12:15);
  for(const image of images.values())image.setPosition(px,py).setDisplaySize(portrait,portrait);
 };
 const render=state=>{
  const line=currentDialogue(state);if(!line)return;
  speaker.setText(line[1]);text.setText(line[2]);initial.setText(line[1].slice(0,1));
  layout();
  for(const [key,image] of images)image.setVisible(key===line[0]);
  initial.setVisible(!images.has(line[0]));
 };
 const loaded=new Set();
 async function load(){
  await Promise.all(PORTRAITS.map(async key=>{
   try{
    const response=await fetch(assetUrl(import.meta.env.BASE_URL,'dialogue/dialogue-'+key+'.png'),{cache:'no-cache'});
    if(!response.ok)throw Error('missing');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!validDialoguePng(bytes))throw Error('invalid portrait');
    const blob=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    try{
     const image=new Image();
     await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=blob;});
     if(image.naturalWidth!==192||image.naturalHeight!==192)throw Error('invalid portrait geometry');
     if(disposed)return;
     const texture='dialogue-'+key;
     if(!scene.textures.exists(texture))scene.textures.addImage(texture,image);
     const sprite=scene.add.image(0,0,texture).setOrigin(0).setVisible(false);
     shell.addAt(sprite,2);images.set(key,sprite);loaded.add(key);
    }finally{URL.revokeObjectURL(blob);}
   }catch{ /* Per-character square fallback keeps dialogue playable. */ }
  }));
  if(!disposed)layout();
 }
 const loading=load();
 button.on('pointerdown',()=>{
  if(!active||disposed||scene.game.loop.time<blockedUntil||document.hidden||window.innerHeight>window.innerWidth)return;
  blockedUntil=scene.game.loop.time+180;
  const ended=advanceDialogue(scene.dialogueState);
  if(ended==='next'){render(scene.dialogueState);return;}
  if(ended){active=false;shell.setVisible(false);button.setVisible(false);caption.setVisible(false);onFinish(ended);}
 });
 const resize=()=>{if(!disposed)layout();};
 scene.scale.on(Phaser.Scale.Events.RESIZE,resize);
 scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
  disposed=true;scene.scale.off(Phaser.Scale.Events.RESIZE,resize);shell.destroy();button.destroy();caption.destroy();images.clear();
 });
 layout();
 return {loading,loaded,get active(){return active;},show(state){active=true;blockedUntil=scene.game.loop.time+180;render(state);layout();shell.setVisible(true);button.setVisible(true);caption.setVisible(true);},
  hide(){active=false;shell.setVisible(false);button.setVisible(false);caption.setVisible(false);},get shell(){return shell;},get button(){return button;},get text(){return text;}};
}
