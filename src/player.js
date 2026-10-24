import { PLAYER_RADIUS } from './movement.js';

// The visual is deliberately isolated; replacing it with a sprite later
// won't affect the physics body, camera target or movement controller.
export function createPlayer(scene, x, y) {
  const marker = scene.add.circle(x, y, PLAYER_RADIUS, 0xf3ca76)
    .setStrokeStyle(3, 0x111111);
  scene.physics.add.existing(marker);
  marker.body.setCircle(PLAYER_RADIUS);
  marker.body.setCollideWorldBounds(true);
  return marker;
}
