// Procedural placeholders only. Local (0,0) is the PR40 footprint center;
// graphics rotate with it. Final PNG dimensions/anchors await art approval.
export function createObstacleVisual(scene,obstacle){
 const s=obstacle.footprint,type=obstacle.type;
 const g=scene.add.graphics().setPosition(s.x,s.y).setRotation(s.angle).setDepth(4);
 const colors={rock:0x777b77,stump:0x987142,fallen_log:0x795434,bush:0x3e6038,toxic_barrel:0x94733c,toi_toi:0x447b7b};
 g.fillStyle(colors[type],1).lineStyle(2,0x263022,1);
 if(s.shape==='circle'){g.fillCircle(0,0,s.radius);g.strokeCircle(0,0,s.radius);}
 if(s.shape==='capsule'){
  const h=s.length/2-s.radius;
  g.fillRoundedRect(-s.length/2,-s.radius,s.length,2*s.radius,s.radius);
  g.strokeRoundedRect(-s.length/2,-s.radius,s.length,2*s.radius,s.radius);
  if(type==='fallen_log'){
   g.lineStyle(2,0xb99a65).strokeCircle(-h,0,s.radius*.7).strokeCircle(h,0,s.radius*.7);
   g.lineStyle(2,0x493723).lineBetween(-h,-s.radius*.5,h,-s.radius*.5).lineBetween(-h,s.radius*.5,h,s.radius*.5);
  }else{
   g.fillStyle(0x587944).fillCircle(-h,0,s.radius*.65).fillCircle(h,0,s.radius*.65);
  }
 }
 if(s.shape==='box'){
  g.fillRect(-s.width/2,-s.height/2,s.width,s.height).strokeRect(-s.width/2,-s.height/2,s.width,s.height);
  g.lineStyle(2,0xabc5a9).strokeRect(-s.width*.32,-s.height*.35,s.width*.64,s.height*.7);
  g.fillStyle(0xe2d9a4).fillCircle(s.width*.2,0,2);
  g.lineStyle(3,0x253f42).lineBetween(-s.width*.3,-s.height*.23,s.width*.3,-s.height*.23);
 }
 if(type==='stump'){
  g.lineStyle(2,0xc7a26c).strokeCircle(0,0,s.radius*.7).strokeCircle(1,0,s.radius*.35);
  g.lineStyle(2,0x594426).lineBetween(0,0,s.radius*.65,s.radius*.4);
 }
 if(type==='rock'){
  g.fillStyle(0x989c90).fillTriangle(-s.radius*.6,-s.radius*.3,s.radius*.1,-s.radius*.8,s.radius*.5,s.radius*.15);
  g.lineStyle(2,0x53594f).lineBetween(-s.radius*.6,s.radius*.4,s.radius*.55,s.radius*.2);
 }
 if(type==='bush'&&s.shape==='circle')g.fillStyle(0x638149).fillCircle(-s.radius*.3,-s.radius*.25,s.radius*.45).fillCircle(s.radius*.3,s.radius*.15,s.radius*.4);
 if(type==='toxic_barrel'){
  g.lineStyle(4,0x534932).lineBetween(-18,-10,18,-10).lineBetween(-18,10,18,10);
  g.fillStyle(0xcbd254).fillTriangle(0,-8,8,7,-8,7);
  g.lineStyle(2,0x2e3924).lineBetween(0,-4,0,2).lineBetween(0,4,0,5);
 }
 // Metadata is explicit but carries no guessed PNG dimensions or load policy.
 g.setData('obstacleAsset',obstacle.render.asset);
 return g;
}
