/**
 * viewerSync.js
 *
 * Keeps two Cesium viewers' cameras locked together while BOTH remain
 * independently interactive — move/zoom/rotate either one and the other
 * follows, rather than one being a fixed "master" and the other a
 * passive, uncontrollable "follower".
 *
 * Re-entrancy guard
 * ──────────────────
 * Both viewers listen to each other's scene.postRender to push their own
 * camera over. Without a guard this is an infinite ping-pong: A renders →
 * pushes to B → B's setView triggers B to render → B's listener fires →
 * pushes back to A → forever. `syncing` is a single shared flag set right
 * before we push a camera update to the OTHER viewer; that other viewer's
 * own listener checks the flag first and bails immediately if it's set,
 * since the render it's reacting to was caused by us, not by the user
 * interacting with that viewer directly.
 *
 * Usage:
 *   const stop = startCameraSync(window.viewer, viewer2)
 *   // ...later, when leaving split view or destroying viewer2:
 *   stop()
 */

export function startCameraSync(primary, secondary) {
  if (!primary || !secondary) return () => {}

  let syncing = false

  function copyCamera(from, to) {
    const cam = from.camera
    to.camera.setView({
      destination: cam.positionWC.clone(),
      orientation: {
        heading: cam.heading,
        pitch:   cam.pitch,
        roll:    cam.roll,
      },
    })
  }

  function onPrimaryRender() {
    if (syncing) return
    if (!secondary || secondary.isDestroyed?.()) return
    syncing = true
    copyCamera(primary, secondary)
    // Deferred, not synchronous: requesting secondary's render from INSIDE
    // primary's own postRender (i.e. still inside primary's Scene.render()
    // call stack) can let the two scenes' render passes interleave on the
    // same tick. Cesium's per-tile-content systems that queue `persists:
    // true` ComputeCommands (e.g. DynamicEnvironmentMapManager / IBL for
    // glTF/3D Tiles content) aren't guaranteed to bind their queued command
    // to the context of the scene that *queued* it — they get drained by
    // whichever scene's executeComputeCommands runs next. If that's the
    // OTHER viewer's render, mid-stack, you get
    // "framebufferTexture2D: object does not belong to this context".
    // requestAnimationFrame makes secondary's render its own top-level
    // tick, after primary's render call stack has fully unwound.
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

  // postRender fires every frame a scene actually renders — since both
  // viewers use requestRenderMode, this only runs on real camera
  // movement / tile loads, not a busy 60fps loop either direction.
  primary.scene.postRender.addEventListener(onPrimaryRender)
  secondary.scene.postRender.addEventListener(onSecondaryRender)

  // Both viewers' canvases may still be mid-resize right when split view
  // opens (primary: 100% → split width; secondary: just mounted) and the
  // browser may not have painted that layout yet. Forcing resize() on
  // both before the initial sync — and once more a frame later — means
  // the camera math runs against each canvas's FINAL aspect ratio instead
  // of a stale one, which is what caused A/B to look "shifted" relative
  // to each other right after entering split view.
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