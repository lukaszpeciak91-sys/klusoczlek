import Phaser from 'phaser';
import {FIRST_ACT_ID,getAct,sceneForAct} from './campaign.js';
import {currentCampaignRun} from './campaign-run.js';
import {writeCampaignCheckpoint} from './campaign-save.js';
import {enforceOrientationOnSceneStart} from './viewport.js';

// Short opaque intertitle; the playable Arena is not constructed until completion.
export class ActTitleScene extends Phaser.Scene {
  constructor(){super('ActTitle');}
  init(data={}){this.actId=data.actId??FIRST_ACT_ID;this.nextScene=sceneForAct(this.actId);this.handoff=data.handoff??null;}
  create(){
    const act=getAct(this.actId);
    if(!act||!this.nextScene){this.scene.start('Menu');return;}
    // Commit the next ACT ENTRY before its title animation. Save must remain
    // independent of scene timing and never include debug fixture progress.
    if(this.handoff&&this.handoff.actId===this.actId){
      writeCampaignCheckpoint(currentCampaignRun(this.game),this.actId);
    }
    this.cameras.main.setBackgroundColor('#000000');
    const w=this.scale.width,h=this.scale.height;
    const background=this.add.rectangle(w/2,h/2,w,h,0x000000).setOrigin(.5);
    const number=this.add.text(w/2,h*.41,act.label,{
      fontFamily:'monospace',fontSize:'36px',fontStyle:'bold',color:'#eee4cf',align:'center'
    }).setOrigin(.5).setAlpha(0);
    const name=this.add.text(w/2,h*.59,act.title,{
      fontFamily:'monospace',fontSize:'25px',fontStyle:'bold',color:'#d4aa5a',align:'center',
      wordWrap:{width:Math.max(120,w-32),useAdvancedWrap:true}
    }).setOrigin(.5).setAlpha(0);
    const resize=()=>{
      const width=this.scale.width,height=this.scale.height;
      background.setPosition(width/2,height/2).setSize(width,height);
      number.setPosition(width/2,height*.41).setFontSize(Math.max(22,Math.min(42,height*.105)));
      name.setPosition(width/2,height*.59).setFontSize(Math.max(15,Math.min(29,height*.075)));
      name.setWordWrapWidth(Math.max(120,width-32));
    };
    resize();
    this.scale.on(Phaser.Scale.Events.RESIZE,resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.scale.off(Phaser.Scale.Events.RESIZE,resize));
    this.tweens.add({targets:number,alpha:1,duration:380,ease:'Linear'});
    this.time.delayedCall(260,()=>this.tweens.add({targets:name,alpha:1,duration:440,ease:'Linear'}));
    this.time.delayedCall(1600,()=>this.tweens.add({
      targets:[number,name],alpha:0,duration:220,ease:'Linear',
      onComplete:()=>{if(this.sys.isActive()&&sceneForAct(this.actId))this.scene.start(this.nextScene,{handoff:this.handoff});}
    }));
    enforceOrientationOnSceneStart(this);
  }
}
