import Phaser from 'phaser';
import { ArenaScene, MenuScene } from './scenes.js';
import { GAME_WIDTH, GAME_HEIGHT, setupViewport } from './viewport.js';
import './style.css';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0e101a',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: { pixelArt: true, antialias: false },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MenuScene, ArenaScene],
});

setupViewport(game);

async function toggleFullscreen() {
  const element = document.getElementById('game-shell');
  try {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
    } else if (element.requestFullscreen) {
      await element.requestFullscreen();
      try {
        if (screen.orientation?.lock) await screen.orientation.lock('landscape');
      } catch {
        // Orientation lock is optional.
      }
    }
  } catch {
    // Fullscreen permission and API support vary by browser.
  } finally {
    game.scale.refresh();
  }
}

document.getElementById('fullscreen-button').addEventListener('click', toggleFullscreen);
