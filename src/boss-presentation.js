// Minimal shared boss-presentation contract for existing and future Acts.
// Owns presentation state only; combat HP, AI and sprite loading stay in each boss.
export function bossHpRatio(hp,maxHp){return maxHp>0?Math.max(0,Math.min(1,hp/maxHp)):0;}
export function createBossPresentationState(){
 let active=false,defeated=false,disposed=false;
 return {
  activate(){if(active||defeated||disposed)return false;active=true;return true;},
  defeat(){if(!active||defeated||disposed)return false;active=false;defeated=true;return true;},
  dispose(){active=false;disposed=true;},
  get visible(){return active&&!defeated&&!disposed;},
  get defeated(){return defeated;},get disposed(){return disposed;}
 };
}
