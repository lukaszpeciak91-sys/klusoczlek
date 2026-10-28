import {assetManifest} from './asset-manifest.js';
export const HP_FACE_ASSETS=Object.freeze([5,4,3,2,1].map(hp=>assetManifest.find(a=>a.id==='hp_'+hp)));
export function faceForHp(hp){return 'hp_'+Math.max(1,Math.min(5,Math.floor(Number.isFinite(hp)?hp:1)));}
export function isValidPortraitPng(data){
 const b=data instanceof Uint8Array?data:new Uint8Array(data);
 if(b.length<26||![137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))return false;
 const dimension=i=>((b[i]*16777216)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3])>>>0;
 return dimension(16)===128&&dimension(20)===128&&b[24]===8&&b[25]===6;
}
export function createHpFaceHud(scene,Phaser){
 const texture=scene.textures,keys=new Set(),pending=new Map();
 let alive=true,request=0,hp=5,pulse=0,image=null;
 const root=scene.add.container(0,0).setScrollFactor(0).setDepth(80);
 const frame=scene.add.circle(0,0,37,0x000000,0).setStrokeStyle(3,0xb18b46);
 const placeholder=scene.add.circle(0,0,33,0x40352d).setStrokeStyle(2,0x9d8255);
 const faceText=scene.add.text(0,0,'5',{fontFamily:'monospace',fontSize:'26px',color:'#f2d6a2'}).setOrigin(0.5);
 root.add([placeholder,faceText,frame]);
 const url=(path)=>import.meta.env.BASE_URL.replace(/\/?$/,'/')+'assets/'+path;
 async function load(asset){
  const key='aloes-hud-'+asset.id;
  if(texture.exists(key))return key;
  if(pending.has(key))return pending.get(key);
  const promise=(async()=>{
    const response=await fetch(url(asset.path),{cache:'no-cache'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!isValidPortraitPng(bytes))throw Error('invalid 128x128 RGBA portrait');
    const blob=new Blob([bytes],{type:'image/png'}),local=URL.createObjectURL(blob);
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=local;});
      if(img.naturalWidth!==128||img.naturalHeight!==128)throw Error('invalid decoded portrait dimensions');
      if(alive&&!texture.exists(key))texture.addImage(key,img);
      return alive?key:null;
    }finally{URL.revokeObjectURL(local);}
  })();
  pending.set(key,promise);
  try{return await promise;}finally{pending.delete(key);}
 }
 async function select(){
  const index=++request,asset=HP_FACE_ASSETS.find(a=>a.id===faceForHp(hp));
  let key=null;
  try{key=await load(asset);}catch{ /* User art may not have been uploaded. */ }
  if(!alive||index!==request)return;
  if(key){
    if(!image){image=scene.add.image(0,0,key).setOrigin(0.5);root.addAt(image,0);}
    else image.setTexture(key);
    image.setDisplaySize(68,68);
    image.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    image.setVisible(true);placeholder.setVisible(false);faceText.setVisible(false);
  }else{
    image?.setVisible(false);placeholder.setVisible(true);faceText.setVisible(true);
  }
 }
 function setHp(next){
  const value=Math.max(0,Math.min(5,Math.floor(next)));
  if(value===hp)return;
  const lost=value<hp;hp=value;
  faceText.setText(String(value));
  if(lost)pulse=160;
  void select();
 }
 function resize(layout){
  root.setPosition(layout.portraitX,layout.portraitY);
  root.setScale(layout.portraitSize/74);
 }
 function update(delta){
  pulse=Math.max(0,pulse-delta);
  const t=pulse/160;
  frame.setStrokeStyle(3,t?0xb18b46+0:0xb18b46);
  if(t)frame.setStrokeStyle(3,0xb85343,1);
  root.setScale((root.getData('diameter')||74)/74);
  if(image)image.setAlpha(hp===0?0.45:1);
  placeholder.setAlpha(hp===0?0.6:1);
 }
 function destroy(){alive=false;request++;root.destroy();}
 void select();
 return {setHp,resize(layout){root.setData('diameter',layout.portraitSize);resize(layout);},update,destroy,get hp(){return hp;},get current(){return faceForHp(hp);},get root(){return root;},get image(){return image;},get pulse(){return pulse;}};
}
