import {assetUrl,validPngHeader} from './character-visual.js';
import {currentDialogue,advanceDialogue} from './dialogue-data.js';
const PORTRAITS=['aloes','bobrozombi','bocianolak','zubrokryptyda'];
export function createDialoguePanel(scene,Phaser,onFinish){
 const shell=scene.add.container(0,0).setDepth(110).setScrollFactor(0).setVisible(false);
 const bg=scene.add.rectangle(0,0,100,100,0x171b20,0.92).setStrokeStyle(2,0xb39a64).setOrigin(0);
 const portraitBox=scene.add.rectangle(0,0,60,60,0x45372b).setStrokeStyle(1,0xc9a76a).setOrigin(0);
 const initial=scene.add.text(0,0,'?',{fontFamily:'monospace',fontSize:'28px',color:'#f4deb0'}).setOrigin(0.5);
 const speaker=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'16px',fontStyle:'bold',color:'#f0c97f'}).setOrigin(0);
 const text=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'15px',color:'#f5ead7',wordWrap:{width:350,useAdvancedWrap:true}}).setOrigin(0);
 const button=scene.add.rectangle(0,0,85,32,0x4e4030).setStrokeStyle(1,0xdac184).setInteractive({useHandCursor:true});
 const caption=scene.add.text(0,0,'DALEJ',{fontFamily:'monospace',fontSize:'15px',color:'#fff4db'}).setOrigin(0.5);
 shell.add([bg,portraitBox,initial,speaker,text,button,caption]);
 const images=new Map();
 let disposed=false,active=false,blockedUntil=0;
 const layout=()=>{
  const w=scene.scale.width,h=scene.scale.height;
  const margin=Math.max(5,Math.min(14,w*0.018)),height=Math.min(172,Math.max(116,h*0.43));
  const width=w-margin*2,x=margin,y=h-height-margin;
  const p=Math.min(110,height-32,Math.max(60,width*0.20));
  const px=x+13,py=y+12,tx=px+p+12,tw=Math.max(75,width-p-40);
  bg.setPosition(x,y).setSize(width,height);
  portraitBox.setPosition(px,py).setSize(p,p);
  initial.setPosition(px+p/2,py+p/2).setFontSize(Math.round(p*0.36));
  speaker.setPosition(tx,y+11).setFontSize(Math.max(11,Math.min(16,w/47)));
  text.setPosition(tx,y+32).setFontSize(Math.max(11,Math.min(15,w/53))).setWordWrapWidth(tw);
  const by=y+height-19,bx=x+width-52;
  button.setPosition(bx,by).setSize(Math.min(88,Math.max(68,width*0.16)),31);
  caption.setPosition(bx,by).setFontSize(Math.max(11,Math.min(15,w/55)));
  for(const image of images.values())image.setPosition(px,py).setDisplaySize(p,p);
 };
 const render=state=>{
  const line=currentDialogue(state);if(!line)return;
  speaker.setText(line[1]);text.setText(line[2]);initial.setText(line[1].slice(0,1));
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
    if(!validPngHeader(bytes,{width:192,height:192}))throw Error('invalid portrait');
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
  if(!active||disposed||scene.game.loop.time<blockedUntil||!scene.canResume())return;
  blockedUntil=scene.game.loop.time+180;
  const ended=advanceDialogue(scene.dialogueState);
  if(ended==='next'){render(scene.dialogueState);return;}
  if(ended){active=false;shell.setVisible(false);onFinish(ended);}
 });
 const resize=()=>{if(!disposed)layout();};
 scene.scale.on(Phaser.Scale.Events.RESIZE,resize);
 scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
  disposed=true;scene.scale.off(Phaser.Scale.Events.RESIZE,resize);shell.destroy();images.clear();
 });
 layout();
 return {loading,loaded,get active(){return active;},show(state){active=true;blockedUntil=scene.game.loop.time+180;render(state);layout();shell.setVisible(true);},
  hide(){active=false;shell.setVisible(false);},get shell(){return shell;},get button(){return button;},get text(){return text;}};
}
