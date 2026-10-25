// Asset handoff contract only. Paths resolve through Vite BASE_URL in runtime integration.
export const assetManifest=Object.freeze([
  {id:'player',path:'player/player.png',width:512,height:64,frameWidth:64,frameHeight:64,columns:8,rows:1,alpha:true,kind:'sheet',status:'pending'},
  ...['bobrozombi','zubrokryptyda','enemy_fast'].map(id=>({id,path:`enemies/${id}.png`,width:384,height:48,frameWidth:48,frameHeight:48,columns:8,rows:1,alpha:true,kind:'sheet',status:'pending'})),
  ...['rapid','heavy','spread'].map(id=>({id:`weapon_${id}`,path:`weapons/${id}.png`,width:96,height:32,frameWidth:32,frameHeight:32,columns:3,rows:1,alpha:true,kind:'sheet',status:'pending'})),
  {id:'health_beer',path:'pickups/health_beer.png',width:32,height:32,frameWidth:32,frameHeight:32,columns:1,rows:1,alpha:true,kind:'image',status:'pending'},
  ...['high','medium','low'].map(id=>({id:`hp_${id}`,path:`portraits/hp_${id}.png`,width:128,height:128,frameWidth:128,frameHeight:128,columns:1,rows:1,alpha:true,kind:'image',status:'pending'})),
  {id:'terrain_ground',path:'terrain/ground.png',width:64,height:64,frameWidth:64,frameHeight:64,columns:1,rows:1,alpha:false,kind:'tile',status:'pending'},
  {id:'terrain_obstacle',path:'terrain/obstacle.png',width:64,height:64,frameWidth:64,frameHeight:64,columns:1,rows:1,alpha:true,kind:'image',status:'pending'},
  ...['player','aloes','narrator'].map(id=>({id:`dialogue_${id}`,path:`dialogue/${id}.png`,width:192,height:192,frameWidth:192,frameHeight:192,columns:1,rows:1,alpha:true,kind:'image',status:'pending',approval:id==='aloes'?'approved_identity':'provisional_identity'})),
]);
export function validateAssetManifest(entries=assetManifest){
  const paths=new Set(),ids=new Set();
  for(const a of entries){
    if(!/^[a-z0-9_/-]+\.png$/.test(a.path)||a.path.includes('..')||ids.has(a.id)||paths.has(a.path)||a.status!=='pending'||
      !Number.isInteger(a.columns)||!Number.isInteger(a.rows)||a.columns<1||a.rows<1||
      a.width!==a.frameWidth*a.columns||a.height!==a.frameHeight*a.rows) return false;
    ids.add(a.id);paths.add(a.path);
  }
  return true;
}
