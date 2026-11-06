import Phaser from 'phaser';
import {ARENA,PLAYER_SPEED,PLAYER_RADIUS,normalizeInput} from './movement.js';
import {createPlayer} from './player.js';
import {createPlayerVisual} from './character-visual.js';
import {createJoystick} from './joystick.js';
import {currentCampaignRun,prepareActStart} from './campaign-run.js';
import {enforceOrientationOnSceneStart} from './viewport.js';
import {volcanoStep,VOLCANO_START,VOLCANO_ASSETS} from './volcano-contract.js';

// Act III foundation only: authored temporary geometry, no enemies or final art assumptions.
export class VolcanoScene extends Phaser.Scene {
  constructor(){super('Volcano');}
  init(data={}){this.handoff=data.handoff??null;this.debugCheckpoint=data.debugCheckpoint??null;}
  create(){
    this.run=currentCampaignRun(this.game);
    if(this.run.actId!=='act3'&&!prepareActStart(this.run,this.handoff,new Set(Object.keys(this.scene.manager.keys)))){
      this.scene.start('Menu');return;
    }
    this.cameras.main.setBackgroundColor('#220b08');
    this.physics.world.setBounds(0,0,ARENA.width,ARENA.height);
    this.cameras.main.setBounds(0,0,ARENA.width,ARENA.height);
    // A procedural, clearly temporary lava surface. No asset is required to boot.
    const lava=this.add.graphics().setDepth(-20);
    lava.fillStyle(0x6e1b0b).fillRect(0,0,ARENA.width,ARENA.height);
    for(let y=0;y<ARENA.height;y+=56){
      lava.lineStyle(3,0xc54b16,.5);
      lava.beginPath();
      for(let x=0;x<=ARENA.width;x+=48){
        const wave=Math.sin(x*.012+y*.027)*13;
        if(x===0)lava.moveTo(x,y+wave);else lava.lineTo(x,y+wave);
      }
      lava.strokePath();
    }
    const floor=this.add.graphics().setDepth(-10);
    floor.fillStyle(0x4b3b32);
    // Temporary walkable rock mass with an inset notch; geometry is authoritative.
    floor.fillRoundedRect(155,120,1490,960,45);
    floor.fillStyle(0x655247);
    floor.fillRoundedRect(188,150,1424,900,35);
    floor.lineStyle(7,0x251b1a);
    floor.strokeRoundedRect(155,120,1490,960,45);
    this.player=createPlayer(this,VOLCANO_START.x,VOLCANO_START.y);
    this.playerVisual=createPlayerVisual(this,this.player,this.player,Phaser);
    this.cameras.main.startFollow(this.player,true,.12,.12);
    this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.joystick=createJoystick(this,'left');
    this.aimJoystick=createJoystick(this,'right');
    this.facing='s';
    this.hud=this.add.text(16,16,'AKT III — PRZYTULNE M4 W CENTRUM WULKANU\nFUNDAMENT / TEREN TYMCZASOWY',{
      fontFamily:'monospace',fontSize:'16px',color:'#ffe4ba',
      backgroundColor:'#21130c',padding:{x:9,y:7}
    }).setScrollFactor(0).setDepth(100);
    const menu=this.add.text(16,90,'MENU',{fontFamily:'monospace',fontSize:'22px',color:'#ffffff',backgroundColor:'#372218',padding:{x:12,y:7}})
      .setScrollFactor(0).setDepth(101).setInteractive();
    menu.on('pointerdown',()=>{this.resetMovement();this.scene.pause();this.scene.launch('Menu');});
    const resize=()=>{this.hud.setPosition(16,16);menu.setPosition(16,90);};
    this.scale.on(Phaser.Scale.Events.RESIZE,resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.scale.off(Phaser.Scale.Events.RESIZE,resize);
      this.playerVisual.destroy();
    });
    enforceOrientationOnSceneStart(this);
  }
  resetMovement(){this.joystick?.setEnabled(false);this.aimJoystick?.setEnabled(false);}
  update(_time,delta){
    if(document.hidden||!document.hasFocus()||window.innerWidth<window.innerHeight){
      this.resetMovement();return;
    }
    const k=this.keys;
    const input=normalizeInput(this.joystick.direction.x+Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),
      this.joystick.direction.y+Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown));
    const next=volcanoStep(this.player,input,Math.min(delta,50),PLAYER_SPEED,PLAYER_RADIUS);
    this.player.setPosition(next.x,next.y);this.player.body.reset(next.x,next.y);
    if(input.x||input.y)this.facing=Math.abs(input.x)>Math.abs(input.y)?(input.x>0?'e':'w'):(input.y>0?'s':'n');
    this.playerVisual.update(this.facing,Boolean(input.x||input.y),delta);
  }
}
