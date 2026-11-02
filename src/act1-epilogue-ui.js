import {assetUrl} from './character-visual.js';

// Self-contained epilogue overlays; input is armed only after the panel is visible.
export function createAct1Panels(scene, Phaser, onReward, onResults) {
  const root=scene.add.container(0,0).setScrollFactor(0).setDepth(210).setVisible(false);
  const bg=scene.add.rectangle(0,0,1,1,0x101417,0.96).setOrigin(0);
  const title=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'22px',fontStyle:'bold',color:'#f2d18c',align:'center'}).setOrigin(0.5);
  const subtitle=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'16px',color:'#f3e9d5',align:'center'}).setOrigin(0.5);
  const details=scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'16px',color:'#f3e9d5',align:'center'}).setOrigin(0.5);
  const fallback=scene.add.text(0,0,'✦',{fontFamily:'monospace',fontSize:'55px',color:'#a5d175'}).setOrigin(0.5);
  const button=scene.add.rectangle(0,0,114,35,0x655039).setStrokeStyle(2,0xd9bd80).setInteractive({useHandCursor:true});
  const buttonText=scene.add.text(0,0,'DALEJ',{fontFamily:'monospace',fontSize:'17px',color:'#fff2d6'}).setOrigin(0.5);
  root.add([bg,title,subtitle,details,fallback,button,buttonText]);
  let image=null,mode=null,disposed=false,armedAt=0;
  function layout(){
    const w=scene.scale.width,h=scene.scale.height;
    bg.setSize(w,h);
    const small=h<350,center=w/2;
    const art=Math.min(small?85:128,Math.max(65,h*.27));
    title.setFontSize(small?15:Math.min(23,w*.034)).setWordWrapWidth(w-22);
    subtitle.setFontSize(small?12:16).setWordWrapWidth(w-20);
    details.setFontSize(small?12:16).setWordWrapWidth(w-24);
    const reward=mode==='reward';
    title.setPosition(center,reward?h*.15:h*.22);
    fallback.setPosition(center,h*.45).setFontSize(art*.65);
    if(image)image.setPosition(center,h*.45).setDisplaySize(art,art);
    subtitle.setPosition(center,reward?h*.70:h*.39);
    details.setPosition(center,h*.61);
    button.setPosition(center,h-25);buttonText.setPosition(center,h-25);
  }
  button.on('pointerdown',()=>{
    if(!mode||scene.game.loop.time<armedAt||document.hidden)return;
    const action=mode;hide();
    if(action==='reward')onReward();else onResults();
  });
  function hide(){mode=null;root.setVisible(false);}
  function showReward(){
    if(disposed)return;
    mode='reward';title.setText('ZDOBYŁEŚ IROKEZ MARCINA!');
    subtitle.setText('ARTEFAKT 1/3');details.setText('');
    fallback.setVisible(!image);if(image)image.setVisible(true);
    armedAt=scene.game.loop.time+200;layout();root.setVisible(true);
  }
  function showResults(kills,time){
    if(disposed)return;
    mode='results';title.setText('KONIEC AKTU I — LAS');
    subtitle.setText('Gratulacje! Las może wreszcie odetchnąć. Chyba.');
    details.setText('POKONANI WROGOWIE — '+kills+'\nCZAS WALKI — '+time+'\nARTEFAKT 1/3 — IROKEZ MARCINA');
    fallback.setVisible(false);if(image)image.setVisible(false);
    armedAt=scene.game.loop.time+200;layout();root.setVisible(true);
  }
  // Missing/invalid PNG never blocks the scripted transition.
  void (async()=>{
    try{
      const response=await fetch(assetUrl(import.meta.env.BASE_URL,'artifacts/artifact-marcin-mohawk.png'));
      if(!response.ok)throw Error('missing artifact');
      const blob=await response.blob();const bitmap=await createImageBitmap(blob);
      if(bitmap.width!==192||bitmap.height!==192)throw Error('invalid artifact');
      if(disposed){bitmap.close();return;}
      const key='act1-artifact-mohawk';
      if(!scene.textures.exists(key))scene.textures.addImage(key,bitmap);
      image=scene.add.image(0,0,key).setOrigin(.5);
      root.addAt(image,4);image.setVisible(mode==='reward');
      fallback.setVisible(mode==='reward'&&!image);
      layout();
    }catch{/* Text/graphic fallback is deliberate. */}
  })();
  scene.scale.on(Phaser.Scale.Events.RESIZE,layout);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{disposed=true;scene.scale.off(Phaser.Scale.Events.RESIZE,layout);root.destroy();});
  return {showReward,showResults,hide,get mode(){return mode;},get button(){return button;},get details(){return details;}};
}
