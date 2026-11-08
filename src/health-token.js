// Shared Act I health-token appearance; gameplay scenes own collection and healing.
export function createHealthToken(scene,x,y){
 const token=scene.add.container(x,y).setDepth(16);
 token.add(scene.add.ellipse(0,13,42,13,0x17120f,0.35));
 token.add(scene.add.circle(0,0,18,0xb93542).setStrokeStyle(3,0x282027));
 token.add(scene.add.text(0,-1,'♥',{fontFamily:'monospace',fontSize:'21px',color:'#ffffff',fontStyle:'bold'}).setOrigin(.5));
 return token;
}
