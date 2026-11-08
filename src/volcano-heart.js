export const BOGDAN_HEART_RADIUS=37;
export function healOneHp(hp,maxHp){return Math.min(maxHp,Math.max(0,hp)+1);}
export function canCollectBogdanHeart(player,point,collected){
 return !collected&&!!point&&Math.hypot(player.x-point.x,player.y-point.y)<=BOGDAN_HEART_RADIUS;
}
