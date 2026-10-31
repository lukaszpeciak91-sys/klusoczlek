import {ENCOUNTER} from './bobrozombi.js';
import {clearPoint} from './weapon-progression.js';
import {BOCIANOLAK_ASSET,BOCIANOLAK_VISUAL_SCALE,BOCIANOLAK_FEET_OFFSET,ZUBROKRYPTYDA_ASSET,ZUBROKRYPTYDA_VISUAL_SCALE,ZUBROKRYPTYDA_FEET_OFFSET} from './enemy-visual.js';
const PROFILES={
 bocianolak:{asset:BOCIANOLAK_ASSET,scale:BOCIANOLAK_VISUAL_SCALE,offset:BOCIANOLAK_FEET_OFFSET},
 zubrokryptyda:{asset:ZUBROKRYPTYDA_ASSET,scale:ZUBROKRYPTYDA_VISUAL_SCALE,offset:ZUBROKRYPTYDA_FEET_OFFSET}
};
export function introductionBounds(type,x,y){
 const p=PROFILES[type];if(!p)return null;
 const halfW=p.asset.frameWidth*p.scale/2,halfH=p.asset.frameHeight*p.scale/2;
 // Conservative full spritesheet canvas envelope (including existing feet offset and subtle sway).
 return {left:x-halfW-5,right:x+halfW+5,top:y+p.offset-halfH-5,bottom:y+p.offset+halfH+5};
}
export function introductionVisible(type,x,y,view){
 const b=introductionBounds(type,x,y);
 return !!b&&b.left>=view.x&&b.right<=view.x+view.width&&b.top>=view.y&&b.bottom<=view.y+view.height;
}
export function introductionSpawnPoint(type,player,obstacles,view,radius,navigation=null){
 const center={x:view.x+view.width/2,y:view.y+view.height/2};
 const candidates=[
  {x:center.x+view.width*.32,y:center.y},
  {x:center.x-view.width*.32,y:center.y},
  {x:center.x,y:center.y+view.height*.32},
  {x:center.x,y:center.y-view.height*.32},
  {x:center.x+view.width*.26,y:center.y+view.height*.25},
  {x:center.x-view.width*.26,y:center.y-view.height*.25}
 ];
 return candidates.find(p=>introductionVisible(type,p.x,p.y,view)
   &&Math.hypot(p.x-player.x,p.y-player.y)>=ENCOUNTER.minSpawnDistance
   &&clearPoint(p,obstacles,radius+4,navigation))??null;
}

export function eligibleIntroductionEnemy(type,enemies,view){
 return enemies.find(enemy=>enemy.type===type&&!enemy.dead&&enemy.hp>0
   &&introductionVisible(type,enemy.x,enemy.y,view))??null;
}
