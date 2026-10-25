// Browser fullscreen API is optional; Phaser remains the only canvas scaler.
export async function toggleFullscreen(element, refresh) {
  try {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
    } else if (element?.requestFullscreen) {
      await element.requestFullscreen();
      try {
        if (screen.orientation?.lock) await screen.orientation.lock('landscape');
      } catch {
        // Optional on mobile browsers.
      }
    }
  } catch {
    // Browser may reject fullscreen without user gesture.
  } finally {
    refresh();
  }
}
