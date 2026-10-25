import Phaser from 'phaser';
import { normalizeInput } from './movement.js';

export function createJoystick(scene) {
  const radius = 59;
  let x = 110;
  let y = scene.scale.height - 115;
  const base = scene.add.circle(x, y, radius, 0x1b2330, 0.65)
    .setStrokeStyle(3, 0xd4aa5a, 0.9).setScrollFactor(0).setDepth(50);
  const knob = scene.add.circle(x, y, 24, 0xf3ca76, 0.85)
    .setScrollFactor(0).setDepth(51);
  const direction = { x: 0, y: 0 };
  let pointerId = null;
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
    pointerId = pointer.id;
    update(pointer);
  };
  const move = pointer => { if (pointer.id === pointerId) update(pointer); };
  const release = pointer => { if (pointer.id === pointerId) reset(); };
  function reset() {
    pointerId = null;
    direction.x = direction.y = 0;
    knob.setPosition(x, y);
  }
  scene.input.on('pointerdown', down);
  scene.input.on('pointermove', move);
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    reset();
    scene.input.off('pointerdown', down);
    scene.input.off('pointermove', move);
    scene.input.off('pointerup', release);
    scene.input.off('pointerupoutside', release);
  });
  function reposition(nextX, nextY) {
    reset();
    x = nextX;
    y = nextY;
    base.setPosition(x, y);
    knob.setPosition(x, y);
  }
  return { direction, reset, reposition };
}
