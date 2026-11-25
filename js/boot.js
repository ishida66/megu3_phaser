// Phaser startup. Loaded only after every scene class has been registered.
// Do not construct the Phaser scene until authentication and the cloud save
// have finished loading. This ensures Main.preload/create use the correct pet,
// house, and furniture from the very first frame.
let meguGameBooted = false;
async function startMeguGame() {
  if (meguGameBooted || !meguAuthUser) return;
  meguGameBooted = true;
  // Load the web font before Phaser measures or rasterizes text.
  try {
    await Promise.race([document.fonts.load('16px "Bebas Neue"'), new Promise(resolve => setTimeout(resolve, 4000))]);
  } catch (error) { console.warn("[MEGU] Bebas Neue unavailable; using fallback font.", error); }
  window.game = new Phaser.Game({
    // Canvas rendering avoids the oversaturated SDR captures seen with WebGL
    // on some Windows HDR / color-managed display and capture pipelines.
    type: Phaser.CANVAS,
    width: W, height: CANVAS_H,
    parent: 'game',
    backgroundColor: '#1f2a44',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Keep Phaser's own update loop running on tab blur where the browser allows it.
    // Hidden-tab throttling and OS audio policies can still suspend playback.
    disableVisibilityChange: true,
    render: {
      antialias: true,
      transparent: false,
      clearBeforeRender: true,
      preserveDrawingBuffer: true
    },
    scene: [Main, SumoMinigame, BallTossMinigame, JumpRopeMinigame, JockeyMinigame, AdventureIntroScene, AdventureMinigame, WalkMinigame, TakePhotoMode]
  });
  window.meguHitboxDebug?.attach(window.game);
  // Keep the game from spending CPU/GPU time rendering an unseen tab. Phaser's
  // visibility handling is disabled above so we control exactly which scenes
  // pause and can reconcile wall-clock stats before resuming them.
  let hiddenSceneKeys = [];
  document.addEventListener('visibilitychange', () => {
    if (!window.game || !window.game.scene) return;

    if (document.visibilityState !== 'visible') {
      // Remember only scenes that were actively running. This avoids resuming
      // scenes that were already paused by an in-game menu or mode transition.
      hiddenSceneKeys = window.game.scene.getScenes(true).map(scene => scene.scene.key);
      hiddenSceneKeys.forEach(key => {
        try { window.game.scene.pause(key); } catch (error) {
          console.debug('[MEGU] Could not pause scene while hidden:', key, error);
        }
      });
      if (window.game.sound && typeof window.game.sound.pauseAll === 'function') {
        window.game.sound.pauseAll();
      }
      return;
    }

    // Apply elapsed-time pet care changes before the home scene is rendered
    // again. This uses the same timestamp-based calculation as normal tracking.
    const mainScene = window.game.scene.getScene('default');
    if (mainScene && typeof mainScene.reconcileBackgroundTime === 'function') {
      mainScene.reconcileBackgroundTime();
    }

    const scenesToResume = hiddenSceneKeys.slice();
    hiddenSceneKeys = [];
    scenesToResume.forEach(key => {
      try {
        if (window.game.scene.isPaused(key)) window.game.scene.resume(key);
      } catch (error) {
        console.debug('[MEGU] Could not resume scene after visibility restore:', key, error);
      }
    });

    // Resume paused tracks from their existing playback positions where the
    // browser permits it; autoplay policy may still require a user gesture.
    if (window.game.sound) {
      if (typeof window.game.sound.resumeAll === 'function') window.game.sound.resumeAll();
      const audioContext = window.game.sound.context;
      if (audioContext && audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
        audioContext.resume().catch(error => console.debug('[MEGU] Audio resume deferred by browser policy:', error));
      }
    }
  });
}

// If there is no session, the login screen stays available and the game is
// created only after a successful login. A signed-in session loads its cloud
// save before Phaser starts.
initializeMeguAccounts().then(() => {
  if (meguAuthUser) startMeguGame();
}).catch(error => {
  console.error('[MEGU] Account initialization failed:', error);
  showMeguAuth();
  setMeguAuthMessage('Could not connect to Supabase. Check your internet connection and project settings.');
});
