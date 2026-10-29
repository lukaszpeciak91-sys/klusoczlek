// One reusable Phaser Graphics object per burning enemy; no textures, physics or timers.
const SHAPES=Object.freeze({
 bobrozombi:{width:19,height:23,y:-16},
 bocianolak:{width:14,height:32,y:-27},
 zubrokryptyda:{width:34,height:27,y:-45}
});
export function createBurningFx(scene,type){
 const shape=SHAPES[type];
 const graphics=scene.add.graphics().setDepth(11);
 return {
  graphics,
  update(enemy,now){
   if(!graphics.active)return;
   graphics.setPosition(enemy.x,enemy.y);
   graphics.clear();
   for(let i=-1;i<=1;i++){
    const wobble=Math.sin(now*0.014+i*2.4)*3;
    const x=i*shape.width*0.45+wobble;
    const base=shape.y+Math.sin(now*0.018+i)*2;
    const height=shape.height*(0.65+0.15*Math.sin(now*0.019+i*1.8));
    graphics.fillStyle(0xe94b1d,0.8).fillTriangle(x-shape.width*0.3,base+5,x+shape.width*0.3,base+5,x+wobble*0.4,base-height);
    graphics.fillStyle(0xffac26,0.9).fillTriangle(x-shape.width*0.18,base+3,x+shape.width*0.18,base+3,x+1,base-height*0.72);
    graphics.fillStyle(0xffef8c,0.84).fillCircle(x,base-3,2.5);
    graphics.fillStyle(0xffd65b,0.7).fillCircle(x+Math.sin(now*0.01+i)*5,base-height-5-(now/70+i*11)%8,1.4);
   }
  },
  destroy(){if(graphics.active)graphics.destroy();}
 };
}
