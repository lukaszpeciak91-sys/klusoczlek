import Phaser from 'phaser';

// Boot-only scene. Its lifetime is one page load; no persisted intro flag is needed.
export class StudioIntroScene extends Phaser.Scene {
 constructor(){super('StudioIntro');}
 create(){
  this.finished=false;
  this.cameras.main.setBackgroundColor('#000000');
  const w=this.scale.width,h=this.scale.height;
  const studio=this.add.text(w/2,h*.43,'NEPAHU STUDIOS',{
   fontFamily:'monospace',fontSize:'36px',fontStyle:'bold',color:'#f5cd70',
   align:'center'
  }).setOrigin(.5).setAlpha(0).setScale(.92);
  const presents=this.add.text(w/2,h*.59,'PRESENTS',{
   fontFamily:'monospace',fontSize:'20px',color:'#f4e7c6'
  }).setOrigin(.5).setAlpha(0);
  const flash=this.add.rectangle(0,0,w,h,0xffd783,.11).setOrigin(0).setAlpha(0);
  const resize=()=>{
   const width=this.scale.width,height=this.scale.height;
   studio.setPosition(width/2,height*.43).setFontSize(Math.max(18,Math.min(38,height*.105)));
   presents.setPosition(width/2,height*.59).setFontSize(Math.max(13,Math.min(23,height*.065)));
   flash.setSize(width,height);
  };
  resize();
  this.scale.on(Phaser.Scale.Events.RESIZE,resize);
  this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
   this.scale.off(Phaser.Scale.Events.RESIZE,resize);
   this.input.off('pointerdown',skip);
   this.input.keyboard?.off('keydown',skip);
  });
  const finish=()=>{
   if(this.finished)return;
   this.finished=true;
   this.scene.start('Menu');
  };
  const skip=()=>finish();
  this.input.on('pointerdown',skip);
  this.input.keyboard?.on('keydown',skip);
  this.tweens.add({targets:studio,alpha:1,scale:1,duration:660,ease:'Sine.Out'});
  this.tweens.add({targets:presents,alpha:1,duration:520,delay:950});
  this.tweens.add({targets:flash,alpha:.17,duration:85,delay:1410,yoyo:true});
  this.time.delayedCall(2420,()=>{
   if(this.finished)return;
   this.tweens.add({targets:[studio,presents],alpha:0,duration:440,onComplete:finish});
  });
 }
}
