// Opaque scene-construction boundary. The act's native art and spawn settle
// before the player can see or control the world. Scene-specific loaders retain
// responsibility for their own validated fallback decisions.
export function beginSceneReveal(scene,preparation,{critical=()=>true,onReady=()=>{},onRetry=null}={}){
 let disposed=false,ready=false,revealed=false,attempt=0;
 const shield=scene.add.rectangle(0,0,scene.scale.width,scene.scale.height,0x000000,1)
  .setOrigin(0).setScrollFactor(0).setDepth(10000).setInteractive();
 const notice=scene.add.text(scene.scale.width/2,scene.scale.height*.52,'',{
  fontFamily:'monospace',fontSize:'17px',color:'#f2d6a2',align:'center',
  wordWrap:{width:Math.max(120,scene.scale.width-30)}
 }).setOrigin(.5).setScrollFactor(0).setDepth(10001).setVisible(false);
 const retry=scene.add.text(scene.scale.width/2,scene.scale.height*.68,'PONÓW',{
  fontFamily:'monospace',fontSize:'18px',color:'#ffe6ad',
  backgroundColor:'#3b2d25',padding:{x:18,y:10}
 }).setOrigin(.5).setScrollFactor(0).setDepth(10002).setInteractive().setVisible(false);
 const resize=()=>{
  shield.setSize(scene.scale.width,scene.scale.height);
  notice.setPosition(scene.scale.width/2,scene.scale.height*.52).setWordWrapWidth(scene.scale.width-30);
  retry.setPosition(scene.scale.width/2,scene.scale.height*.68);
 };
 scene.scale.on('resize',resize);
 scene.events.once('shutdown',()=>{
  disposed=true;attempt++;scene.scale.off('resize',resize);
  shield.destroy();notice.destroy();retry.destroy();
 });
 scene.entryGateReady=false;
 function release(){
  if(disposed||revealed)return;
  revealed=true;ready=true;
  // Settle the camera at the final physical position before removing black.
  if(scene.player?.body&&scene.cameras?.main?.followOffset){
   scene.player.body.reset(scene.player.x,scene.player.y);
   scene.cameras.main.centerOn(scene.player.x,scene.player.y);
  }
  onReady();
  scene.entryGateReady=true;
  notice.setVisible(false);retry.setVisible(false);
  scene.tweens.add({targets:shield,alpha:0,duration:300,ease:'Linear',
   onComplete:()=>{if(!disposed)shield.destroy();}});
 }
 async function run(task){
  const id=++attempt;
  notice.setVisible(false);retry.setVisible(false);
  let timedOut=false;
  const timeout=new Promise(resolve=>setTimeout(()=>{timedOut=true;resolve(null);},12000));
  try{
   await Promise.race([Promise.resolve(typeof task==='function'?task():task),timeout]);
   if(disposed||id!==attempt)return;
   if(critical()&&(!timedOut||!onRetry)){release();return;}
  }catch(error){if(!disposed)console.warn('[Scene ready] required preparation:',error.message);}
  if(disposed||id!==attempt)return;
  if(critical()){release();return;}
  notice.setText('NIE MOŻNA BEZPIECZNIE WCZYTAĆ PLANSZY.');
  notice.setVisible(true);retry.setVisible(Boolean(onRetry));
 }
 retry.on('pointerdown',()=>{if(onRetry&&!disposed)void run(onRetry);});
 void run(preparation);
 return {get ready(){return ready;},get visible(){return shield.active&&shield.alpha>0;},retry:()=>onRetry&&run(onRetry)};
}
