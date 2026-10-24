export const ARENA = Object.freeze({ width: 1800, height: 1200 });
export const PLAYER_SPEED = 235;
export const PLAYER_RADIUS = 17;

export function normalizeInput(x, y) {
  const length = Math.hypot(x, y);
  if (!length) return { x: 0, y: 0 };
  const scale = Math.min(1, 1 / length);
  return { x: x * scale, y: y * scale };
}

export function clampPlayer(x, y, width = ARENA.width, height = ARENA.height, radius = PLAYER_RADIUS) {
  return {
    x: Math.max(radius, Math.min(width - radius, x)),
    y: Math.max(radius, Math.min(height - radius, y)),
  };
}
