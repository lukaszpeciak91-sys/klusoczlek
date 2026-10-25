// Positions are in Phaser logical viewport coordinates (safe areas are handled by #game).
export function menuLayout(width) {
  return { centerX: width / 2, titleY: 148, subtitleY: 211, startY: 330 };
}
export function arenaHudLayout(height) {
  return { menuX: 105, menuY: 40, joystickX: 110, joystickY: height - 115 };
}
export function pauseLayout(width) {
  return { centerX: width / 2, titleY: 150, resumeY: 285, exitY: 383 };
}
