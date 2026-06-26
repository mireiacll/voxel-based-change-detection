/**
 * viewerSync.js
 *
 * Keeps two Cesium viewers' cameras synched together while both are enabled to move.
 *
 * Re-entrancy guard: both viewers listen to each other's postRender.
 * Without a guard this would be an infinite ping-pong (A renders → pushes to B → B renders → pushes to A → ...)
 * The `syncing` flag is set before the camera update so the other viewer's listener knows to skip it
 *
 * Usage:
 *   const stop = startCameraSync(window.viewer, viewer2)
 *   // later, when leaving split view:
 *   stop()
 */

export function startCameraSync(primary, secondary) {
  if (!primary || !secondary) return () => {}

  let syncing = false

  function copyCamera(from, to) {
    const cam = from.camera
    to.camera.setView({
      destination: cam.positionWC.clone(),
      orientation: { heading: cam.heading, pitch: cam.pitch, roll: cam.roll },
    })
  }

  function onPrimaryRender() {
    if (syncing) return
    if (!secondary || secondary.isDestroyed?.()) return
    syncing = true
    copyCamera(primary, secondary)
    // Defer secondary's render to its own animation frame 
    // If we requested from inside primary's postRender, two scenes' render passes can be interleaved on the same tick, 
    // which causes WebGL errors ("object does not belong to this context") 
    requestAnimationFrame(() => {
      if (!secondary || secondary.isDestroyed?.()) return
      secondary.scene.requestRender()
    })
    syncing = false
  }

  function onSecondaryRender() {
    if (syncing) return
    if (!primary || primary.isDestroyed?.()) return
    syncing = true
    copyCamera(secondary, primary)
    requestAnimationFrame(() => {
      if (!primary || primary.isDestroyed?.()) return
      primary.scene.requestRender()
    })
    syncing = false
  }

  // postRender fires every frame a scene actually renders 
  primary.scene.postRender.addEventListener(onPrimaryRender)
  secondary.scene.postRender.addEventListener(onSecondaryRender)

  // Both canvases may still be mid-resize when split view opens, so force a resize and sync
  function resizeAndSync() {
    if (primary && !primary.isDestroyed?.())     primary.resize()
    if (secondary && !secondary.isDestroyed?.()) secondary.resize()
    onPrimaryRender()
  }

  resizeAndSync()
  requestAnimationFrame(resizeAndSync)

  return function stopCameraSync() {
    if (primary && !primary.isDestroyed?.()) {
      primary.scene.postRender.removeEventListener(onPrimaryRender)
    }
    if (secondary && !secondary.isDestroyed?.()) {
      secondary.scene.postRender.removeEventListener(onSecondaryRender)
    }
  }
}