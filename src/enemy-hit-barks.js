export const BARK_TEXT='Tylko nie po nogach!';
export const BARK_LIMIT=3;
export const BARK_MS=1700;
export function claimFirstHitBark(enemy,before,after){
 if(enemy.type!=='bocianolak'||enemy.dead||enemy.firstHitBark||!Number.isFinite(before)||!Number.isFinite(after)||before<=0||after<0||after>=before)return false;
 enemy.firstHitBark=true;return true;
}
// Cosmetic only: scene-owned text, no interactive objects, timers or boundaries.
export function createEnemyHitBarks(scene){
 const active=[],gameEvents=scene.game.events;
 const visibleLimit=()=>Math.min(BARK_LIMIT,Math.max(1,Math.floor((scene.scale.height-208)/22)));
 const remove=()=>{const entry=active.shift();entry?.text.destroy();};
 const position=(entry,index=0)=>{
  if(!entry.enemy.dead&&entry.enemy.hp>0){entry.x=entry.enemy.x;entry.y=entry.enemy.y-68;}
  const view=scene.cameras.main.worldView,zoom=scene.cameras.main.zoom;
  const half=entry.text.width/2+5,w=scene.scale.width,h=scene.scale.height;
  const x=Math.max(half,Math.min(w-half,(entry.x-view.x)*zoom));
  const top=108+entry.text.height/2,bottom=Math.max(top,h-100-entry.text.height/2);
  const baseBottom=Math.max(top,bottom-(active.length-1)*22);
  const y=Math.max(top,Math.min(baseBottom,(entry.y-view.y)*zoom-entry.age*.008))+index*22;
  entry.text.setPosition(x,y);
 };
 const api={
  accept(enemy,before,after){
   if(!claimFirstHitBark(enemy,before,after))return false;
   // A 240px-high viewport has room for one readable line below the HUD.
   const limit=visibleLimit();
   while(active.length>=limit)remove();
   const text=scene.add.text(0,0,BARK_TEXT,{fontFamily:'monospace',fontSize:'12px',color:'#fff2ca',backgroundColor:'#242619',padding:{x:4,y:3},wordWrap:{width:168},align:'center'})
    .setOrigin(.5).setScrollFactor(0).setDepth(64);
   const entry={text,enemy,x:enemy.x,y:enemy.y-68,age:0};active.push(entry);position(entry,active.length-1);return true;
  },
  update(delta){
   while(active.length>visibleLimit())remove();
   for(let i=active.length-1;i>=0;i--){
    const e=active[i];e.age+=Math.max(0,delta);
    if(e.age>=BARK_MS){e.text.destroy();active.splice(i,1);}else position(e,i);
   }
  },
  destroy(){while(active.length)remove();gameEvents.off('step',step);},
  get size(){return active.length;}
 };
 const step=()=>api.update(scene.game.loop.delta);
 gameEvents.on('step',step);scene.events.once('shutdown',()=>api.destroy());
 return api;
}
