import Phaser from 'phaser';
import {retroAudio} from './retro-audio.js';
import {FIRST_ACT_ID,getAct,sceneForAct} from './campaign.js';
import {currentCampaignRun} from './campaign-run.js';
import {writeCampaignCheckpoint} from './campaign-save.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {ACT_TITLE_MIN_MS,prepareActAssets,actAssetProgress} from './act-asset-preparation.js';

// Short opaque intertitle; the playable Arena is not constructed until completion.
export class ActTitleScene extends Phaser.Scene {
  constructor(){super('ActTitle');}
  init(data={}){this.actId=data.actId??FIRST_ACT_ID;this.nextScene=sceneForAct(this.actId);this.handoff=data.handoff??null;this.debugCheckpoint=data.debugCheckpoint??null;}
  get assetProgress(){return actAssetProgress(this.game);}
  create(){
    // Silence begins before any title frames or asynchronous asset preparation.
    retroAudio.beginActTitle();
    const act=getAct(this.actId);
    if(!act||!this.nextScene){this.scene.start('Menu');return;}
    // Commit the next ACT ENTRY before its title animation. Save must remain
    // independent of scene timing and never include debug fixture progress.
    if(!currentCampaignRun(this.game).isDebugRun&&!currentCampaignRun(this.game).isReplayRun&&this.handoff&&this.handoff.actId===this.actId){
      writeCampaignCheckpoint(currentCampaignRun(this.game),this.actId);
    }
    this.cameras.main.setBackgroundColor('#000000');
    this.assetGate={ready:false,minimumElapsed:false,failed:[],starting:false};
    this.preparationAttempts=0;this.lastPreparationError=null;
    this.assetAbort=new AbortController();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.assetAbort.abort());
    const w=this.scale.width,h=this.scale.height;
    const background=this.add.rectangle(w/2,h/2,w,h,0x000000).setOrigin(.5);
    const number=this.add.text(w/2,h*.41,act.label,{
      fontFamily:'monospace',fontSize:'36px',fontStyle:'bold',color:'#eee4cf',align:'center'
    }).setOrigin(.5).setAlpha(0);
    const name=this.add.text(w/2,h*.59,act.title,{
      fontFamily:'monospace',fontSize:'25px',fontStyle:'bold',color:'#d4aa5a',align:'center',
      wordWrap:{width:Math.max(120,w-32),useAdvancedWrap:true}
    }).setOrigin(.5).setAlpha(0);
    const status=this.add.text(w/2,h*.80,'PRZYGOTOWYWANIE AKTU…',{
      fontFamily:'monospace',fontSize:'13px',color:'#baa783',align:'center'
    }).setOrigin(.5);
    const retry=this.add.text(w/2,h*.88,'PONÓW',{
      fontFamily:'monospace',fontSize:'18px',color:'#f4d184',backgroundColor:'#29221b',
      padding:{x:18,y:9}
    }).setOrigin(.5).setVisible(false).setInteractive({useHandCursor:true});
    const resize=()=>{
      const width=this.scale.width,height=this.scale.height;
      background.setPosition(width/2,height/2).setSize(width,height);
      number.setPosition(width/2,height*.41).setFontSize(Math.max(22,Math.min(42,height*.105)));
      name.setPosition(width/2,height*.59).setFontSize(Math.max(15,Math.min(29,height*.075)));
      name.setWordWrapWidth(Math.max(120,width-32));
      status.setPosition(width/2,height*.80);
      retry.setPosition(width/2,height*.88);
    };
    resize();
    this.scale.on(Phaser.Scale.Events.RESIZE,resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.scale.off(Phaser.Scale.Events.RESIZE,resize));
    this.tweens.add({targets:number,alpha:1,duration:380,ease:'Linear'});
    this.time.delayedCall(260,()=>this.tweens.add({targets:name,alpha:1,duration:440,ease:'Linear'}));
    const gate=this.assetGate;
    let watchdog=null,launchPending=false,launched=false;
    const eligible=()=>this.sys.isActive()&&!this.assetAbort.signal.aborted&&
      !this.scene.isPaused()&&!document.hidden&&document.hasFocus()&&
      window.innerWidth>=window.innerHeight;
    const cleanup=()=>{clearTimeout(watchdog);watchdog=null;};
    const launch=()=>{
      if(launched||!launchPending||!gate.minimumElapsed||!gate.ready||
         !sceneForAct(this.actId)||this.assetAbort.signal.aborted)return;
      if(!eligible()){cleanup();watchdog=setTimeout(launch,150);return;}
      launched=true;cleanup();
      this.scene.start(this.nextScene,{handoff:this.handoff,debugCheckpoint:this.debugCheckpoint});
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,cleanup);
    const finish=()=>{
      if(!eligible()||gate.starting||!gate.minimumElapsed||!gate.ready)return;
      gate.starting=true;status.setVisible(false);retry.setVisible(false);
      launchPending=true;
      this.tweens.add({targets:[number,name],alpha:0,duration:220,ease:'Linear',
        onComplete:launch
      });
      watchdog=setTimeout(launch,500);
    };
    const prepare=()=>{
      // create() runs before Phaser marks the scene fully active. Do not
      // suppress the first preparation call during the create lifecycle.
      if(this.assetAbort.signal.aborted)return;
      this.preparationAttempts++;
      retry.setVisible(false);status.setText('PRZYGOTOWYWANIE AKTU…');
      void prepareActAssets(this.game,this.actId,{signal:this.assetAbort.signal}).then(result=>{
        if(!this.sys.isActive()||this.assetAbort.signal.aborted)return;
        gate.failed=result.failed;gate.ready=result.ready;
        if(!result.ready){
          const required=result.failed.filter(asset=>asset.required);
          console.warn('[ActTitle] required assets unavailable',this.actId,required);
          status.setText(this.actId==='act5'?'BŁĄD PLIKÓW AKTU V — PONÓW':'NIE UDAŁO SIĘ WCZYTAĆ TERENU.');
          retry.setVisible(true);
        }else{
          status.setText(result.failed.length?'GOTOWE (ELEMENTY OPCJONALNE POMINIĘTE)':'GOTOWE');
          finish();
        }
      }).catch(error=>{
        if(this.assetAbort.signal.aborted)return;
        this.lastPreparationError=String(error?.message??error);
        console.warn('[ActTitle] preparation failed:',error);
        status.setText('BŁĄD ŁADOWANIA — SPRÓBUJ PONOWNIE');retry.setVisible(true);
      });
    };
    retry.on('pointerdown',prepare);
    this.time.delayedCall(ACT_TITLE_MIN_MS,()=>{gate.minimumElapsed=true;finish();});
    prepare();
    enforceOrientationOnSceneStart(this);
  }
}
