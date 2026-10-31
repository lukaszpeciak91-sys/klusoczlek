import {BARK_PHRASES,createBarkSchedule,advanceBarks,eligibleBarkSpeaker,bubblePlacement} from './ambient-barks.js';
// Three pooled display objects for the whole session; no input/physics/timers.
export function createAmbientBarks(scene,rng){
 const state=createBarkSchedule(rng);
 const root=scene.add.container(0,0).setScrollFactor(0).setDepth(49).setVisible(false);
 const graphics=scene.add.graphics();
 const text=scene.add.text(0,4,'',{fontFamily:'monospace',fontSize:'12px',color:'#f7edd7'}).setOrigin(.5,0);
 root.add([graphics,text]);
 let lastElapsed=null,disposed=false,width=0,height=0,lastBox=null;
 const allowed=()=>!disposed&&scene.sys.isActive()&&!scene.scene.isPaused()&&!scene.scene.isActive('Menu')&&!scene.physics.world.isPaused&&scene.canResume()&&!scene.dialogueLoading&&!scene.dialogueState?.id&&!scene.episode.ended&&scene.episode.state==='active'&&!scene.bossEntrance&&!scene.bossEntrancePending&&!scene.narrativeEvents.has('before-marcin');
 const suspend=()=>{state.active=null;lastElapsed=null;root.setVisible(false);};
 const measure=()=>{
  text.setFontSize(scene.scale.width<600?12:13).setText(BARK_PHRASES.reduce((a,b)=>a.length>=b.length?a:b));
  width=Math.ceil(text.width)+16;height=Math.ceil(text.height)+13;
  text.setPosition(width/2,4);if(state.active)text.setText(state.active.phrase);
 };
 measure();
 const anchorOf=e=>scene.enemyRenderers[e.type]?.speechAnchorOf?.(e)??null;
 const place=(enemy)=>{
  const anchor=anchorOf(enemy),camera=scene.cameras.main,view=camera.worldView;
  if(!eligibleBarkSpeaker(enemy,anchor,view))return null;
  const start=camera.getWorldPoint(0,0),zoom=camera.zoom;
  const screen={x:(anchor.x-start.x)*zoom,y:(anchor.y-start.y)*zoom};
  const box=bubblePlacement(screen,width,height,scene.scale.width,scene.scale.height,scene.hudLayout);
  return box?{...box,anchorX:screen.x}:null;
 };
 const candidates=()=>scene.enemies.filter(e=>!!place(e));
 const display=()=>{
  if(!state.active){root.setVisible(false);return;}
  const box=place(state.active.speaker);if(!box){state.active=null;root.setVisible(false);return;}
  lastBox=box;
  const camera=scene.cameras.main,z=camera.zoom,cx=camera.width/2,cy=camera.height/2;
  root.setPosition(cx+(box.x-cx)/z,cy+(box.y-cy)/z).setScale(1/z).setVisible(true);
  const pointer=Math.max(9,Math.min(width-9,box.anchorX-box.x));
  graphics.clear().fillStyle(0x151a20,.92).lineStyle(1,0xb6a789,.9)
   .fillRoundedRect(0,0,width,height-5,4).strokeRoundedRect(0,0,width,height-5,4)
   .fillTriangle(pointer-4,height-5,pointer+4,height-5,pointer,height);
 };
 const guard=()=>{if(!allowed())suspend();};
 const tick=elapsed=>{
  if(!allowed()){suspend();return;}
  const delta=lastElapsed===null?0:Math.max(0,elapsed-lastElapsed);lastElapsed=elapsed;
  const event=advanceBarks(state,delta,true,candidates,rng);
  if(event)text.setText(event.phrase);
  display();
 };
 const resize=()=>{if(disposed)return;measure();guard();if(state.active)display();};
 scene.scale.on('resize',resize);scene.events.on('pause',suspend);
 const destroy=()=>{if(disposed)return;disposed=true;state.active=null;lastElapsed=null;scene.scale.off('resize',resize);scene.events.off('pause',suspend);root.setVisible(false);root.destroy();};
 scene.events.once('shutdown',destroy);
 return {state,root,text,graphics,guard,tick,suspend,destroy,speakerDied(enemy){if(state.active?.speaker===enemy){state.active=null;root.setVisible(false);}},get bounds(){return root.visible?lastBox:null;},get eligible(){return allowed();}};
}
