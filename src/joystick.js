import Phaser from 'phaser';
import { normalizeInput } from './movement.js';
import { arenaHudLayout } from './ui-layout.js';

export function createJoystick(scene, side='left') {
  const initial = arenaHudLayout(scene.scale.height, scene.scale.width);
  const radius = initial.joystickRadius;
  let x = side==='left'?initial.joystickX:initial.aimX;
  let y = side==='left'?initial.joystickY:initial.aimY;
  const base = scene.add.circle(x, y, radius, 0x1b2330, 0.65)
    .setStrokeStyle(3, 0xd4aa5a, 0.9).setScrollFactor(0).setDepth(50);
  const knob = scene.add.circle(x, y, 20, side==='left'?0xf3ca76:0x92d7e8, 0.85)
    .setScrollFactor(0).setDepth(51);
  const direction = { x: 0, y: 0 };
  let pointerId = null;
  let held=false;
  let touchIdentifier=null;
  const update = pointer => {
    // Pointer coordinates are screen-local; joystick elements ignore camera scrolling.
    const dx = pointer.x - x;
    const dy = pointer.y - y;
    const length = Math.hypot(dx, dy);
    const ratio = Math.min(length, radius) / radius;
    const normalized = normalizeInput(dx, dy);
    direction.x = normalized.x * ratio;
    direction.y = normalized.y * ratio;
    knob.setPosition(x + direction.x * radius, y + direction.y * radius);
  };
  const down = pointer => {
    if (pointerId !== null) return;
    if (Math.hypot(pointer.x - x, pointer.y - y) > radius * 1.4) return;
    if(pointer.wasTouch===false)return;
    pointerId = pointer.id;
    held=true;
    update(pointer);
  };
  const move = pointer => { if (pointer.id === pointerId) update(pointer); };
  const release = pointer => { if (pointer.id === pointerId) reset(); };
  function reset() {
    pointerId = null;
    held=false;
    touchIdentifier=null;
    direction.x = direction.y = 0;
    knob.setPosition(x, y);
  }
  // Native touch identifiers complement Phaser pointer IDs: some Chromium
  // multi-touch releases do not dispatch a matching Phaser pointerup.
  const canvas=scene.game.canvas;
  const nativeStart=event=>{
    if(touchIdentifier!==null)return;
    const rect=canvas.getBoundingClientRect();
    for(const touch of event.changedTouches){
      const px=(touch.clientX-rect.left)*scene.scale.width/rect.width;
      const py=(touch.clientY-rect.top)*scene.scale.height/rect.height;
      if(Math.hypot(px-x,py-y)<=radius*1.4){touchIdentifier=touch.identifier;break;}
    }
  };
  const nativeEnd=event=>{
    if(touchIdentifier!==null&&Array.from(event.changedTouches).some(t=>t.identifier===touchIdentifier))reset();
  };
  canvas.addEventListener('touchstart',nativeStart,{passive:true});
  canvas.addEventListener('touchend',nativeEnd,{passive:true});
  canvas.addEventListener('touchcancel',nativeEnd,{passive:true});
  scene.input.on('pointerdown', down);
  scene.input.on('pointermove', move);
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);
  scene.input.on('pointercancel', release);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    reset();
    canvas.removeEventListener('touchstart',nativeStart);
    canvas.removeEventListener('touchend',nativeEnd);
    canvas.removeEventListener('touchcancel',nativeEnd);
    scene.input.off('pointerdown', down);
    scene.input.off('pointermove', move);
    scene.input.off('pointerup', release);
    scene.input.off('pointerupoutside', release);
    scene.input.off('pointercancel', release);
  });
  function reposition(nextX, nextY) {
    reset();
    x = nextX;
    y = nextY;
    base.setPosition(x, y);
    knob.setPosition(x, y);
  }
  return { direction, reset, reposition, get held(){return held;},get pointerId(){return pointerId;},get touchIdentifier(){return touchIdentifier;} };
}
