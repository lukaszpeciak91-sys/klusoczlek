import Phaser from 'phaser';
import {retroAudio} from './retro-audio.js';
import {BIRTHDAY_DEDICATION,FINAL_CREDITS} from './final-credits-data.js';

export const CREDITS_SCROLL_PX_PER_SECOND=47;

// A terminal presentation scene, not another narrative checkpoint. The run
// has already been completed and saved/cleared by CatacombsScene.
export class CreditsScene extends Phaser.Scene {
 constructor(){super('Credits');}
 create(){
  this.returning=false;
  this.finished=false;
  this.elapsedScroll=0;
  this.scrollDistance=0;
  this.scrollGroup=this.add.container(0,0).setDepth(8);
  this.lines=[];
  this.cameras.main.setBackgroundColor('#07080f');
  retroAudio.credits();
  // Deliberately keep looped credits music through a potentially long
  // stationary birthday screen. Menu.enter replaces the track on return.
  const heading=this.add.text(0,0,'NEPAHU STUDIOS',{
   fontFamily:'monospace',fontSize:'12px',color:'#88734a'
  }).setOrigin(.5).setDepth(12);
  const ending=this.add.text(0,0,BIRTHDAY_DEDICATION,{
   fontFamily:'monospace',fontSize:'28px',fontStyle:'bold',color:'#f6cb70',
   align:'center',wordWrap:{width:600,useAdvancedWrap:true}
  }).setOrigin(.5).setDepth(10).setVisible(false);
  const backBG=this.add.rectangle(0,0,100,40,0x1b2330,.96)
   .setStrokeStyle(2,0xd4aa5a).setInteractive({useHandCursor:true}).setDepth(21);
  const backText=this.add.text(0,0,'WRÓĆ',{
   fontFamily:'monospace',fontSize:'17px',color:'#f4d58c'
  }).setOrigin(.5).setDepth(22);
  this.backButton=backBG;
  const back=()=>{
   if(this.returning)return;
   this.returning=true;
   this.scene.start('Menu');
  };
  backBG.on('pointerdown',back);
  const rebuild=()=>{
   const w=this.scale.width,h=this.scale.height;
   const progress=this.scrollDistance?this.elapsedScroll/this.scrollDistance:0;
   for(const item of this.lines)item.destroy();
   this.lines=[];
   this.scrollGroup.removeAll();
   const maxTextWidth=Math.max(180,w-Math.min(160,w*.22)-32);
   const headerSize=Math.max(11,Math.min(18,h*.044));
   const nameSize=Math.max(13,Math.min(22,h*.055));
   const lineGap=Math.max(13,h*.047);
   const sectionGap=Math.max(32,h*.093);
   const centerX=w*.46;
   let y=h+Math.max(36,h*.18);
   for(const entry of FINAL_CREDITS){
    const headingLine=this.add.text(centerX,y,entry.role,{
     fontFamily:'monospace',fontSize:headerSize+'px',fontStyle:'bold',color:'#f1c874',
     align:'center',wordWrap:{width:maxTextWidth,useAdvancedWrap:true},
     lineSpacing:3
    }).setOrigin(.5,0);
    this.scrollGroup.add(headingLine);this.lines.push(headingLine);
    y+=headingLine.height+lineGap;
    const nameLine=this.add.text(centerX,y,entry.name,{
     fontFamily:'monospace',fontSize:nameSize+'px',color:'#f8f1db',
     align:'center',wordWrap:{width:maxTextWidth,useAdvancedWrap:true},
     lineSpacing:3
    }).setOrigin(.5,0);
    this.scrollGroup.add(nameLine);this.lines.push(nameLine);
    y+=nameLine.height+sectionGap;
   }
   this.scrollDistance=y+Math.max(20,h*.06);
   this.elapsedScroll=Math.min(this.scrollDistance,Math.max(0,progress*this.scrollDistance));
   this.scrollGroup.y=-this.elapsedScroll;
   heading.setPosition(w*.46,Math.max(12,h*.054))
    .setFontSize(Math.max(10,Math.min(13,h*.035)))
    .setVisible(!this.finished);
   ending.setPosition(w/2,h/2).setWordWrapWidth(Math.max(130,w-Math.min(158,w*.23)-24))
    .setFontSize(Math.max(17,Math.min(34,h*.083))).setVisible(this.finished);
   backBG.setSize(Math.min(112,Math.max(75,w*.14)),Math.min(43,Math.max(34,h*.11)))
    .setPosition(w-Math.max(8,Math.min(18,w*.025))-backBG.width/2,
     Math.max(11,Math.min(25,h*.06))+backBG.height/2);
   backText.setPosition(backBG.x,backBG.y).setFontSize(Math.max(13,Math.min(18,h*.046)));
  };
  this.resizeCredits=rebuild;
  rebuild();
  this.scale.on(Phaser.Scale.Events.RESIZE,rebuild);
  this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
   this.scale.off(Phaser.Scale.Events.RESIZE,rebuild);
   backBG.off('pointerdown',back);
  });
  this.dedication=ending;
 }
 update(_now,delta){
  if(this.returning||this.finished||typeof document!=='undefined'&&document.hidden)return;
  // Delta is Phaser's per-frame time, so focus loss and scene pauses never
  // advance by wall-clock time or skip the dedication.
  this.elapsedScroll=Math.min(this.scrollDistance,this.elapsedScroll+
   Math.max(0,Math.min(70,delta))*CREDITS_SCROLL_PX_PER_SECOND/1000);
  this.scrollGroup.y=-this.elapsedScroll;
  if(this.elapsedScroll>=this.scrollDistance){
   this.finished=true;
   this.scrollGroup.setVisible(false);
   this.dedication.setVisible(true);
   const brand=this.children.list.find(x=>x.type==='Text'&&x.text==='NEPAHU STUDIOS');
   brand?.setVisible(false);
  }
 }
}
