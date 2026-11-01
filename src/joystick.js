import Phaser from 'phaser';
import { normalizeInput } from './movement.js';
import { arenaHudLayout } from './ui-layout.js';

export function createJoystick(scene, side='left') {
  const initial = arenaHudLayout(scene.scale.height, scene.scale.width);
  let radius = initial.joystickRadius;
  let x = side==='left'?initial.joystickX:initial.aimX;
  let y = side==='left'?initial.joystickY:initial.aimY;
  const base = scene.add.circle(x, y, radius, 0x20271e, 0.58)
    .setStrokeStyle(3, 0xb9a16b, 0.85).setScrollFactor(0).setDepth(50);
  const knob = scene.add.circle(x, y, radius * 0.42, side==='left'?0xc9ab68:0x88b6c5, 0.82)
    .setScrollFactor(0).setDepth(51);
  const direction = { x: 0, y: 0 };
  let pointerId = null;
  let held=false;
  let enabled=true;
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
    if (!enabled || !scene.sys.isActive() || pointerId !== null) return;
    if (Math.hypot(pointer.x - x, pointer.y - y) > radius * 1.45) return;
    if(pointer.wasTouch===false)return;
    pointerId = pointer.id;
    held=true;
    update(pointer);
  };
  const move = pointer => { if (enabled && pointer.id === pointerId) update(pointer); };
  const release = pointer => { if (pointer.id === pointerId) reset(); };
  function reset() {
    pointerId = null;
    held=false;
    direction.x = direction.y = 0;
    knob.setPosition(x, y);
  }
  function setEnabled(value) {
    enabled=Boolean(value);
    reset();
    base.setVisible(enabled);
    knob.setVisible(enabled);
  }
  scene.input.on('pointerdown', down);
  scene.input.on('pointermove', move);
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);
  scene.input.on('pointercancel', release);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    reset();
    scene.input.off('pointerdown', down);
    scene.input.off('pointermove', move);
    scene.input.off('pointerup', release);
    scene.input.off('pointerupoutside', release);
    scene.input.off('pointercancel', release);
  });
  function reposition(nextX, nextY, nextRadius=radius) {
    reset();
    x = nextX;
    y = nextY;
    radius = nextRadius;
    base.setRadius(radius);
    knob.setRadius(radius * 0.42);
    base.setPosition(x, y);
    knob.setPosition(x, y);
  }
  return { direction, reset, reposition, setEnabled, get enabled(){return enabled;},get base(){return base;},get knob(){return knob;},get held(){return held;},get pointerId(){return pointerId;} };
}
