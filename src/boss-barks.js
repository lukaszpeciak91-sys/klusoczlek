import {bubblePlacement} from './ambient-barks.js';

// Cosmetic-only boss barks; never change combat RNG, HP, timings or input.
export const MARCIN_BARKS=Object.freeze([
 'Aaaaaa',
 'Odwal się od moich przyjaciół',
 'Gdzie uciekasz?!',
 'Ataaaaak!',
 'Twoje dni są policzone!'
]);
export const KLUSOCZLEK_BARKS=Object.freeze([
 'Niech Cię kule biją!',
 'Wracaj tutaj!',
 'Będziesz pięknie wyglądał gdy Cię wypcham',
 'Takiego trofeum nie miałem '
]);

export function createBossBarks(scene,{phrases,speaker,allowed,offsetY=118,otherBubbles=()=>false}){
 const root=scene.add.container(0,0).setScrollFactor(0).setDepth(51).setVisible(false);
 const bg=scene.add.graphics();
 const caption=scene.add.text(0,0,'',{
  fontFamily:'monospace',fontSize:'13px',color:'#f7edd7',align:'center',
  wordWrap:{width:240,useAdvancedWrap:true}
 }).setOrigin(.5,0);
 root.add([bg,caption]);
 let elapsed=0,showing=0,index=0,disposed=false;
 const hide=()=>{root.setVisible(false);showing=0;};
 const canSpeak=()=>!disposed&&scene.sys.isActive()&&!scene.scene.isPaused()&&
  !document.hidden&&document.hasFocus()&&window.innerWidth>=window.innerHeight&&
  allowed()&&!otherBubbles();
 const position=()=>{
  const target=speaker(),camera=scene.cameras.main;
  if(!target||!camera||!target.active)return false;
  const world=camera.getWorldPoint(0,0);
  const x=(target.x-world.x)*camera.zoom;
  const y=(target.y-offsetY-world.y)*camera.zoom;
  const w=Math.ceil(caption.width)+20,h=Math.ceil(caption.height)+17;
  const box=bubblePlacement({x,y},w,h,scene.scale.width,scene.scale.height,scene.hudLayout);
  if(!box)return false;
  root.setPosition(box.x,box.y);
  caption.setPosition(w/2,4);
  const pointer=Math.max(10,Math.min(w-10,x-box.x));
  bg.clear().fillStyle(0x151a20,.94).lineStyle(1,0xb6a789,.95)
   .fillRoundedRect(0,0,w,h-6,5).strokeRoundedRect(0,0,w,h-6,5)
   .fillTriangle(pointer-5,h-6,pointer+5,h-6,pointer,h);
  return true;
 };
 const suspend=()=>{elapsed=0;hide();};
 const tick=delta=>{
  if(!canSpeak()){suspend();return;}
  const ms=Math.max(0,Math.min(50,Number.isFinite(delta)?delta:0));
  elapsed+=ms;
  if(root.visible){
   showing-=ms;
   if(showing<=0||!position())hide();
   return;
  }
  if(elapsed<5200)return;
  elapsed=0;
  caption.setText(phrases[index%phrases.length]);
  if(!position())return;
  index++;
  showing=2500;root.setVisible(true);
 };
 scene.events.on('pause',suspend);
 const destroy=()=>{if(disposed)return;disposed=true;scene.events.off('pause',suspend);root.destroy();};
 scene.events.once('shutdown',destroy);
 return {root,caption,tick,suspend,destroy,get shown(){return index;}};
}
