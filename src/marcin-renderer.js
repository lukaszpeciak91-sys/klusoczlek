import {makeFeedback,hitActive} from './combat-feedback.js';
// Code-drawn provisional art; no stretched Bobrozombi texture or asset request.
// Feet=(0,0); body-aligned damage union is declared in enemy-damage.js.
export function createMarcinRenderer(scene){
 const create=(x,y)=>{
  const c=scene.add.container(x,y).setDepth(9),g=scene.add.graphics();c.add(g);
  g.fillStyle(0x252019).fillEllipse(0,8,91,24);
  g.fillStyle(0x3f362a).fillRoundedRect(-42,-11,31,36,8).fillRoundedRect(11,-11,31,36,8);
  g.fillStyle(0x33271e).fillEllipse(-27,-48,88,89).fillEllipse(27,-48,88,89);
  g.fillStyle(0x806446).fillEllipse(0,-30,114,92);
  g.fillStyle(0x5e4835).fillCircle(0,-87,31).fillCircle(-27,-103,12).fillCircle(27,-103,12);
  g.fillStyle(0xa28761).fillEllipse(0,-77,46,30);
  g.fillStyle(0xefdcad).fillRect(-17,-82,14,17).fillRect(3,-82,14,17);
  g.fillStyle(0xdc4644).fillCircle(-13,-96,5).fillCircle(13,-96,5);
  c.setData('feedback',makeFeedback());c.setData('body',g);return c;
 };
 const update=(e)=>{
  e.sprite.setPosition(e.x,e.y);
  const warning=e.attack?.phase==='warning';
  const flash=warning?0.65+0.35*Math.sin(e.attack.elapsed/50):hitActive(e.sprite.getData('feedback'),scene.time.now)?0.55:1;
  e.sprite.getData('body').setAlpha(flash);
 };
 return {create,update,feedbackOf:e=>e.sprite.getData('feedback'),shutdown(){}};
}
