// DOM sizing and orientation are separate from game simulation.
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export function isPortrait(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > width;
}

export function fitWithin(width, height, baseWidth = GAME_WIDTH, baseHeight = GAME_HEIGHT) {
  if (!(width > 0 && height > 0 && baseWidth > 0 && baseHeight > 0)) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(width / baseWidth, height / baseHeight);
  return { width: baseWidth * scale, height: baseHeight * scale };
}

export function setupViewport(game) {
  const rotateMessage = document.getElementById('rotate-message');
  const update = () => {
    const portrait = isPortrait(window.innerWidth, window.innerHeight);
    rotateMessage.hidden = !portrait;
    document.body.classList.toggle('portrait', portrait);
    if (portrait) {
      for (const scene of game.scene.getScenes(true)) {
        pausedByOrientation.add(scene.scene.key);
        scene.scene.pause();
      }
    }
    // Pause only scenes paused by this orientation handler.
    if (!portrait) {
      for (const key of pausedByOrientation) {
        if (game.scene.isPaused(key)) game.scene.resume(key);
      }
      pausedByOrientation.clear();
    }
    game.scale.refresh();
  };
  const pausedByOrientation = new Set();
  const synchronize = () => update();
  window.addEventListener('resize', synchronize);
  window.addEventListener('orientationchange', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  game.events.once('destroy', () => {
    window.removeEventListener('resize', synchronize);
    window.removeEventListener('orientationchange', synchronize);
    document.removeEventListener('visibilitychange', synchronize);
  });
  synchronize();
  return synchronize;
}
