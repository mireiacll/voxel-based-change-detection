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

  function canRender(v) {
    if (!v || v.isDestroyed?.()) return false
    const el = v.canvas
    return el && el.clientWidth > 0 && el.clientHeight > 0
  }

  function copyCamera(from, to) {
    const cam = from.camera
    to.camera.setView({
      destination: cam.positionWC.clone(),
      orientation: { heading: cam.heading, pitch: cam.pitch, roll: cam.roll },
    })
  }

  function onPrimaryRender() {
    if (syncing) return
    if (!canRender(secondary)) return
    syncing = true
    copyCamera(primary, secondary)
    requestAnimationFrame(() => {
      if (canRender(secondary)) secondary.scene.requestRender()
    })
    syncing = false
  }

  function onSecondaryRender() {
    if (syncing) return
    if (!canRender(primary)) return
    syncing = true
    copyCamera(secondary, primary)
    requestAnimationFrame(() => {
      if (canRender(primary)) primary.scene.requestRender()
    })
    syncing = false
  }

  primary.scene.postRender.addEventListener(onPrimaryRender)
  secondary.scene.postRender.addEventListener(onSecondaryRender)

  function resizeAndSync() {
    if (primary && !primary.isDestroyed?.())     primary.resize()
    if (secondary && !secondary.isDestroyed?.()) secondary.resize()
    if (canRender(primary)) onPrimaryRender()
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