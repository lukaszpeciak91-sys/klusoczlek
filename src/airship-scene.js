import Phaser from 'phaser';
import {AIRSHIP_WORLD,DECK_POLYGON,AIRSHIP_LAYERS,stepDeckPosition,scrollCloudLayers} from './airship-contract.js';
import {currentCampaignRun,prepareActStart,updateRunEquipment} from './campaign-run.js';
import {createPlayer} from './player.js';
import {createPlayerVisual,assetUrl} from './character-visual.js';
import {createJoystick} from './joystick.js';
import {createHpFaceHud} from './hp-face-hud.js';
import {arenaHudLayout} from './ui-layout.js';
import {normalizeInput} from './movement.js';
import {facingOf} from './combat-contract.js';
import {WEAPONS,cycleUnlockedWeapon} from './weapon-progression.js';
import {enforceOrientationOnSceneStart} from './viewport.js';

const DECK_TEXTURE='airship-deck-approved';
export class AirshipScene extends Phaser.Scene {
  constructor(){super('Airship');}
  init(data={}){this.handoff=data.handoff??null;}
  create(){
    this.campaignRun=currentCampaignRun(this.game);
    const registered=new Set(Object.keys(this.scene.manager.keys));
    if(!prepareActStart(this.campaignRun,this.handoff,registered)){
      console.warn('[Airship] Missing or invalid Act II campaign handoff');
      this.scene.start('Menu');return;
    }
    this.cameras.main.setBackgroundColor('#6b9db7');
    this.cameras.main.setBounds(0,0,AIRSHIP_WORLD.width,AIRSHIP_WORLD.height);
    this.layers=[];
    this.optionalArtStatus={};
    this.artAbort=new AbortController();
    this.artAlive=true;
    const skyColors=[0x6798b4,0xd0d7d3,0xb9ced0,0xf0e7d9];
    for(let i=0;i<AIRSHIP_LAYERS.length;i++){
      const def=AIRSHIP_LAYERS[i],key='airship-fallback-'+def.id;
      if(!this.textures.exists(key)){
        const graphics=this.make.graphics({x:0,y:0});
        graphics.fillStyle(i===0?skyColors[0]:skyColors[i],i===0?1:0.65);
        graphics.fillRect(0,0,512,256);
        if(i>0){
          graphics.fillStyle(0xffffff,0.4+i*.11);
          for(let k=0;k<6;k++){
            const x=k*96+17,y=58+(k%3)*63;
            graphics.fillEllipse(x,y,130,45);
            graphics.fillEllipse(x+35,y-12,91,37);
          }
        }
        graphics.generateTexture(key,512,256);
        graphics.destroy();
      }
      const tile=this.add.tileSprite(0,0,this.scale.width,this.scale.height,key)
        .setOrigin(0).setScrollFactor(0).setDepth(def.depth);
      tile.speed=def.speed;tile.layerId=def.id;
      this.layers.push(tile);
      void this.loadOptional(def.path,'airship-approved-'+def.id,tile);
    }
    const geometry=this.add.graphics().setDepth(0);
    geometry.fillStyle(0x141e25,0.46).fillEllipse(480,289,855,410);
    geometry.fillStyle(0x6c4c32).fillPoints(DECK_POLYGON,true);
    geometry.lineStyle(7,0xd2ac67,1).strokePoints(DECK_POLYGON,true);
    geometry.lineStyle(2,0x332a27,1).strokePoints(DECK_POLYGON,true);
    geometry.lineStyle(2,0x96734d,0.55);
    for(let y=124;y<452;y+=27)geometry.lineBetween(132,y,828,y);
    this.deckVisual=geometry;
    this.deckArt=this.add.image(480,270,'airship-fallback-sky').setDepth(1).setVisible(false);
    const artMask=this.make.graphics({x:0,y:0});
    artMask.fillStyle(0xffffff).fillPoints(DECK_POLYGON,true);
    this.deckArt.setMask(artMask.createGeometryMask());
    this.deckMask=artMask;
    void this.loadOptional('arenas/airship-deck.png',DECK_TEXTURE,this.deckArt,true);
    // The rails stay above the artwork and expose the only traversable perimeter.
    this.rails=this.add.graphics().setDepth(5);
    this.rails.lineStyle(6,0x2b2423,1).strokePoints(DECK_POLYGON,true);
    this.rails.lineStyle(3,0xe4c183,1).strokePoints(DECK_POLYGON,true);
    this.player=createPlayer(this,AIRSHIP_WORLD.start.x,AIRSHIP_WORLD.start.y);
    this.player.body.setVelocity(0,0);
    this.facingMarker=this.add.triangle(this.player.x,this.player.y,0,-28,-7,-15,7,-15,0xe9d6ab).setDepth(11);
    this.playerVisual=createPlayerVisual(this,this.player,this.facingMarker,Phaser);
    this.weapon=this.campaignRun.selectedWeapon;
    this.unlockedWeapons=new Set(this.campaignRun.unlockedWeapons);
    if(this.weapon&&Object.hasOwn(WEAPONS,this.weapon))void this.playerVisual.setVariant(this.weapon);
    this.playerHp=this.campaignRun.hp;
    this.maxHp=this.campaignRun.maxHp;
    this.joystick=createJoystick(this,'left');
    this.aimJoystick=createJoystick(this,'right');
    this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.lastFacing='s';
    this.input.keyboard.on('keydown-Q',()=>this.cycleWeapon());
    this.hudLayout=arenaHudLayout(this.scale.height,this.scale.width);
    this.menuButton=this.add.rectangle(0,0,80,38,0x2b3324,0.95)
      .setStrokeStyle(2,0xb9a16b).setScrollFactor(0).setDepth(60).setInteractive({useHandCursor:true});
    this.menuLabel=this.add.text(0,0,'MENU',{fontFamily:'monospace',fontSize:'17px',color:'#e8d6a5'})
      .setOrigin(.5).setScrollFactor(0).setDepth(61);
    this.menuButton.on('pointerdown',()=>this.openMenu());
    this.hpFace=createHpFaceHud(this,Phaser);
    this.hpFace.setHp(this.playerHp);
    this.hpText=this.add.text(0,0,'HP '+this.playerHp+'/'+this.maxHp,{fontFamily:'monospace',fontSize:'13px',color:'#f3e8d1'})
      .setOrigin(.5,0).setScrollFactor(0).setDepth(81);
    this.weaponToken=this.add.container(0,0).setScrollFactor(0).setDepth(66);
    this.weaponBody=this.add.circle(0,0,21,0x303b2b).setStrokeStyle(2,0xb9a16b);
    this.weaponText=this.add.text(0,0,'—',{fontFamily:'monospace',fontSize:'21px',color:'#ffffff'}).setOrigin(.5);
    this.weaponToken.add([this.weaponBody,this.weaponText]);
    this.switchLabel=this.add.text(0,0,'',{fontFamily:'monospace',fontSize:'11px',color:'#f6e9cc'})
      .setOrigin(.5).setScrollFactor(0).setDepth(67);
    this.syncWeaponHud();
    const touchSwitch=pointer=>{
      if(pointer.id===this.joystick.pointerId||pointer.id===this.aimJoystick.pointerId)return;
      const l=this.hudLayout;
      if(Math.hypot(pointer.x-l.switchX,pointer.y-l.switchY)<l.switchSize/2)this.cycleWeapon();
    };
    this.input.on('pointerdown',touchSwitch);
    const resize=()=>{
      const w=this.scale.width,h=this.scale.height,l=arenaHudLayout(h,w);
      this.hudLayout=l;
      for(const tile of this.layers)tile.setSize(w,h);
      this.joystick.reposition(l.joystickX,l.joystickY,l.joystickRadius);
      this.aimJoystick.reposition(l.aimX,l.aimY,l.joystickRadius);
      this.menuButton.setPosition(l.menuX,l.menuY).setSize(l.menuWidth,l.menuHeight);
      this.menuLabel.setPosition(l.menuX,l.menuY).setFontSize(l.menuFont);
      this.hpFace.resize(l);this.hpText.setPosition(l.hpX,l.hpY);
      this.weaponToken.setPosition(l.switchX,l.switchY).setScale(l.switchSize/42);
      this.switchLabel.setPosition(l.switchX,l.switchY-l.switchSize/2-12);
      this.cameras.main.setZoom(Math.min(w/AIRSHIP_WORLD.width,h/AIRSHIP_WORLD.height)).centerOn(480,270);
    };
    resize();
    this.scale.on(Phaser.Scale.Events.RESIZE,resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.artAlive=false;this.artAbort.abort();
      this.scale.off(Phaser.Scale.Events.RESIZE,resize);
      this.input.off('pointerdown',touchSwitch);
      window.removeEventListener('blur',this.onBlur);
      window.removeEventListener('focus',this.onFocus);
      document.removeEventListener('visibilitychange',this.onVisibility);
      this.deckMask.destroy();this.playerVisual.destroy();this.hpFace.destroy();
    });
    this.resetMovement=()=>{this.joystick.reset();this.aimJoystick.reset();this.input.keyboard.resetKeys();};
    this.onBlur=()=>{this.resetMovement();this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);};
    this.onFocus=()=>{const allowed=!document.hidden&&window.innerWidth>=window.innerHeight&&!this.scene.isPaused();this.joystick.setEnabled(allowed);this.aimJoystick.setEnabled(allowed);};
    this.onVisibility=()=>document.hidden?this.onBlur():this.onFocus();
    window.addEventListener('blur',this.onBlur);
    window.addEventListener('focus',this.onFocus);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.events.on(Phaser.Scenes.Events.RESUME,()=>{document.getElementById('fullscreen-button').hidden=true;this.onFocus();});
    document.getElementById('fullscreen-button').hidden=true;
    this.onFocus();
    enforceOrientationOnSceneStart(this);
  }
  async loadOptional(path,key,target,deck=false){
    try{
      if(!this.textures.exists(key)){
        const response=await fetch(assetUrl(import.meta.env.BASE_URL,path),{signal:this.artAbort.signal});
        if(!response.ok)throw Error('HTTP '+response.status);
        const blob=await response.blob(),image=await createImageBitmap(blob);
        if(!this.artAlive){image.close();return;}
        this.textures.addImage(key,image);
      }
      if(!this.artAlive)return;
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      target.setTexture(key);
      if(deck){target.setDisplaySize(804,384).setVisible(true);}
      this.optionalArtStatus[path]='loaded';
    }catch(error){
      if(this.artAlive){this.optionalArtStatus[path]='fallback';console.info('[Airship] procedural fallback for '+path+': '+error.message);}
    }
  }
  syncWeaponHud(){
    const def=this.weapon?WEAPONS[this.weapon]:null;
    this.weaponText?.setText(def?.symbol??'—');
    this.weaponBody?.setFillStyle(def?.color??0x6b6153);
    this.switchLabel?.setText(def?.label??'BEZ BRONI');
  }
  cycleWeapon(){
    if(this.scene.isPaused()||document.hidden)return false;
    const next=cycleUnlockedWeapon(this.weapon,this.unlockedWeapons);
    if(!next||next===this.weapon)return false;
    this.weapon=next;
    updateRunEquipment(this.campaignRun,this.unlockedWeapons,next);
    if(Object.hasOwn(WEAPONS,next))void this.playerVisual.setVariant(next);
    this.syncWeaponHud();return true;
  }
  openMenu(){
    if(this.scene.isPaused()||this.scene.isActive('Menu'))return;
    this.resetMovement();this.joystick.setEnabled(false);this.aimJoystick.setEnabled(false);
    this.scene.pause();this.scene.launch('Menu');this.scene.bringToTop('Menu');
  }
  update(time,delta){
    if(document.hidden||window.innerWidth<window.innerHeight||this.scene.isPaused())return;
    scrollCloudLayers(this.layers,delta);
    const key=this.keys;
    const input=normalizeInput(this.joystick.direction.x+Number(key.D.isDown||key.RIGHT.isDown)-Number(key.A.isDown||key.LEFT.isDown),
      this.joystick.direction.y+Number(key.S.isDown||key.DOWN.isDown)-Number(key.W.isDown||key.UP.isDown));
    const point=stepDeckPosition(this.player,input,delta);
    this.player.setPosition(point.x,point.y);
    this.player.body.reset(point.x,point.y);
    const aim=this.aimJoystick.held?this.aimJoystick.direction:{x:0,y:0};
    this.lastFacing=facingOf(aim.x||input.x,aim.y||input.y,this.lastFacing);
    this.facingMarker.setPosition(point.x,point.y);
    this.playerVisual.update(this.lastFacing,Math.hypot(input.x,input.y)>0.1,delta);
    this.hpFace.update(delta);
  }
}
