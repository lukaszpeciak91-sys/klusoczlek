import {BARK_PHRASES,EXTRA_BARKS,HIT_BARKS,createBarkSchedule,advanceBarks,damageBark,eligibleBarkSpeaker,bubblePlacement,boxesOverlap,MAX_BUBBLES} from './ambient-barks.js';
// Two persistent independent Phaser bubbles. Neither takes input or advances game time.
export function createAmbientBarks(scene,rng){
 const state=createBarkSchedule(rng),pool=Array.from({length:MAX_BUBBLES},()=>{
  const root=scene.add.container(0,0).setScrollFactor(0).setDepth(49).setVisible(false);
  const graphics=scene.add.graphics();
  const text=scene.add.text(0,4,'',{fontFamily:'monospace',fontSize:'12px',color:'#f7edd7'}).setOrigin(.5,0);
  root.add([graphics,text]);return {root,graphics,text,event:null,bounds:null};
 });
 let lastElapsed=null,disposed=false;
 const allowed=()=>!disposed&&scene.sys.isActive()&&!scene.scene.isPaused()&&!scene.scene.isActive('Menu')&&!scene.physics.world.isPaused&&scene.canResume()&&!scene.dialogueLoading&&!scene.dialogueState?.id&&!scene.episode.ended&&scene.episode.state==='active'&&!scene.bossEntrance&&!scene.bossEntrancePending&&!scene.narrativeEvents.has('before-marcin');
 const suspend=()=>{state.active.length=0;state.echoRemaining=-1;lastElapsed=null;pool.forEach(p=>{p.event=null;p.bounds=null;p.root.setVisible(false);});};
 const anchorOf=e=>scene.enemyRenderers[e.type]?.speechAnchorOf?.(e)??null;
 const measure=(p,phrase)=>{
  p.text.setFontSize(scene.scale.width<600?12:13).setText(phrase);
  const width=Math.ceil(p.text.width)+16,height=Math.ceil(p.text.height)+13;
  p.text.setPosition(width/2,4);return {width,height};
 };
 const place=(enemy,dimensions)=>{
  const anchor=anchorOf(enemy),camera=scene.cameras.main,view=camera.worldView;
  if(!eligibleBarkSpeaker(enemy,anchor,view))return null;
  const start=camera.getWorldPoint(0,0),zoom=camera.zoom;
  const screen={x:(anchor.x-start.x)*zoom,y:(anchor.y-start.y)*zoom};
  const box=bubblePlacement(screen,dimensions.width,dimensions.height,scene.scale.width,scene.scale.height,scene.hudLayout);
  return box?{...box,anchorX:screen.x}:null;
 };
 const candidates=()=>scene.enemies.filter(e=>!!place(e,{width:105,height:30}));
 const display=()=>{
  const ordered=[...state.active].sort((a,b)=>b.priority-a.priority);
  const placed=[];
  for(let i=0;i<pool.length;i++){
   const p=pool[i],event=ordered[i];
   p.event=event||null;p.bounds=null;p.root.setVisible(false);
   if(!event)continue;
   const size=measure(p,event.phrase);
   const box=place(event.speaker,size);
   if(!box||placed.some(b=>boxesOverlap(b,box))){if(!event.layoutSuppressed){state.suppressed++;event.layoutSuppressed=true;}continue;}
   event.layoutSuppressed=false;placed.push(box);p.bounds=box;
   const camera=scene.cameras.main,z=camera.zoom,cx=camera.width/2,cy=camera.height/2;
   p.root.setPosition(cx+(box.x-cx)/z,cy+(box.y-cy)/z).setScale(1/z).setVisible(true);
   const pointer=Math.max(9,Math.min(box.width-9,box.anchorX-box.x));
   p.graphics.clear().fillStyle(0x151a20,.92).lineStyle(1,0xb6a789,.9)
    .fillRoundedRect(0,0,box.width,box.height-5,4).strokeRoundedRect(0,0,box.width,box.height-5,4)
    .fillTriangle(pointer-4,box.height-5,pointer+4,box.height-5,pointer,box.height);
  }
 };
 const guard=()=>{if(!allowed())suspend();};
 const tick=elapsed=>{
  if(!allowed()){suspend();return;}
  const delta=lastElapsed===null?0:Math.max(0,elapsed-lastElapsed);lastElapsed=elapsed;
  advanceBarks(state,delta,true,candidates,rng);
  display();
 };
 const hit=(enemy,at)=>{
  if(!allowed())return null;
  if(!place(enemy,{width:125,height:30}))return null;
  const event=damageBark(state,enemy,at,rng);
  if(event)display();return event;
 };
 const resize=()=>{if(disposed)return;guard();if(allowed())display();};
 scene.scale.on('resize',resize);scene.events.on('pause',suspend);
 const destroy=()=>{if(disposed)return;disposed=true;suspend();scene.scale.off('resize',resize);scene.events.off('pause',suspend);pool.forEach(p=>p.root.destroy());};
 scene.events.once('shutdown',destroy);
 return {state,pool,root:pool[0].root,text:pool[0].text,graphics:pool[0].graphics,guard,tick,hit,suspend,destroy,
 speakerDied(enemy){state.active=state.active.filter(e=>e.speaker!==enemy);display();},
 get bounds(){return pool[0].root.visible?pool[0].bounds:null;},
 get eligible(){return allowed();}};
}
