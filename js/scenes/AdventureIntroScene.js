// Phaser scene module. Loaded after js/game.js and before js/boot.js.
class AdventureIntroScene extends Phaser.Scene {
  constructor() { super({ key: 'AdventureIntroScene' }); }
  init(data = {}) {
    this.launchData = data;
    this.playerMeguDef = data.playerMeguDef || null;
    this.walkTimer = null;
    this.walkTween = null;
    this.cameraFollowTween = null;
    this.cameraFinalTween = null;
    this.introFinished = false;
    this.introMegu = null;
    this.meguRenderer = null;
    this.introWalkFrameIndex = 0;
    this.introFade = null;
    this.introBgm = null;
    this.departureBgm = null;
    this.departureSfx = null;
    this.departureObjects = [];
    this.departureTweens = [];
    this.departureShakeTimer = null;
    this.departureSequenceStarted = false;
  }
  preload() {
    const assets = [
      ['ad-intro-distant', 'assets/adventure/AD_RW_BHD@2x.png'],
      ['ad-intro-middle', 'assets/adventure/AD_RW_01@2x.png'],
      ['ad-intro-foreground', 'assets/adventure/AD_RW_FRT@2x.png'],
      ['ad-intro-airplane', 'assets/adventure/AD_RW_SA@2x.png'],
      ['ad-departure-background', 'assets/adventure/AD_WD_01@2x.png'],
      ['ad-departure-foreground', 'assets/adventure/AD_WD_WD@2x.png'],
      ['ad-departure-cloud-1', 'assets/adventure/AD_WD_CLD01@2x.png'],
      ['ad-departure-cloud-2', 'assets/adventure/AD_WD_CLD02@2x.png']
    ];
    if (!this.cache.audio.exists('ad-intro-stroll-bgm')) {
      this.load.audio('ad-intro-stroll-bgm', 'assets/sound/bgm/BGM_stroll.mp3');
    }
    if (!this.cache.audio.exists('ad-departure-sfx')) {
      this.load.audio('ad-departure-sfx', 'assets/sound/sfx/SE_Departure.wav');
    }
    const requestedBgm = String(this.launchData && this.launchData.adventureBgm || '').trim().replace(/\.mp3$/i, '');
    this.departureBgmName = /^[a-zA-Z0-9_-]+$/.test(requestedBgm) ? requestedBgm : 'BGM_Adventure';
    this.departureBgmKey = `adventure-bgm-${this.departureBgmName}`;
    if (!this.cache.audio.exists(this.departureBgmKey)) {
      this.load.audio(this.departureBgmKey, `assets/sound/bgm/${this.departureBgmName}.mp3`);
    }
    assets.forEach(([key, path]) => {
      if (!this.textures.exists(key)) this.load.image(key, path);
    });
    const def = this.playerMeguDef;
    const key = String((def && def.id) || '');
    if (def && key && def.image && def.json && !this.textures.exists(key)) {
      this.load.atlas(key, def.image, def.json);
    }
  }
  create() {
    const main = this.scene.get('default');
    if (main && main.input) main.input.enabled = false;
    try { if (main && main.bgmSound && main.bgmSound.isPlaying) main.bgmSound.stop(); } catch (e) {}
    if (this.scene.isActive('default')) this.scene.pause('default');
    if (this.cache.audio.exists('ad-intro-stroll-bgm')) {
      this.introBgm = this.sound.add('ad-intro-stroll-bgm', { loop: true });
      this.introBgm.play();
    } else {
      console.warn('[Adventure intro] Stroll BGM was not loaded.');
    }

    // The scene's world is 1280x640; the 640x640 viewport pans across it.
    const layerSpecs = [
      ['ad-intro-distant', 0, 0.35],
      ['ad-intro-middle', 1, 0.65],
      ['ad-intro-foreground', 20, 1]
    ];
    layerSpecs.forEach(([key, depth, scrollFactor]) => {
      if (!this.textures.exists(key)) {
        console.error('[Adventure intro] Missing scenery asset:', key);
        return;
      }
      // Slightly overlap adjacent tiles to prevent sub-pixel seams while
      // parallax scrolling interpolates the camera position.
      this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(641, 640)
        .setScrollFactor(scrollFactor, 1).setDepth(depth);
      this.add.image(639, 0, key).setOrigin(0, 0).setDisplaySize(641, 640)
        .setScrollFactor(scrollFactor, 1).setDepth(depth);
    });

    // The aircraft sits above the midground and behind the foreground layer.
    if (this.textures.exists('ad-intro-airplane')) {
      this.introAirplane = this.add.image(445, 417, 'ad-intro-airplane').setOrigin(0, 1).setDepth(5);
    } else {
      console.error('[Adventure intro] Missing airplane asset: AD_RW_SA@2x.png');
    }

    this.createIntroMegu();
    // The home screen has already faded to black before this scene launches.
    // Fade the intro scene in so the transition is a clean fade-out/fade-in.
    const introFadeIn = this.add.rectangle(0, 0, 640, 640, 0x000000, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(30000);
    this.tweens.add({
      targets: introFadeIn,
      alpha: 0,
      duration: 500,
      ease: 'Linear',
      onComplete: () => { if (introFadeIn && introFadeIn.active) introFadeIn.destroy(); }
    });
    const camera = this.cameras.main;
    camera.setViewport(0, 0, 640, 640);
    camera.setBounds(0, 0, 1280, 640);
    camera.setScroll(0, 0);
    camera.setLerp(1, 0);
    if (this.introMegu) {
      // Stop panning 30 pixels beyond the point where the airplane fully fits.
      camera.stopFollow();
      camera.setScroll(0, 0);
      this.cameraPanTween = this.tweens.add({
        targets: camera,
        scrollX: Math.min(640, Math.max(0, this.introAirplane ? this.introAirplane.x + this.introAirplane.displayWidth - 640 + 30 : 0)),
        duration: 10400 * (445 - 128) / (845 - 128),
        ease: 'Linear',
        onComplete: () => camera.setScroll(Math.min(640, Math.max(0, this.introAirplane ? this.introAirplane.x + this.introAirplane.displayWidth - 640 + 30 : 0)), 0)
      });
      this.beginIntroWalk();
    } else {
      console.error('[Adventure intro] Character atlas or walking frames unavailable.');
      this.time.delayedCall(500, () => this.finishIntro());
    }
    this.events.once('shutdown', this.cleanup, this);
  }
  createIntroMegu() {
    const def = this.playerMeguDef;
    const key = String((def && def.id) || '');
    if (!key || !this.textures.exists(key)) return;
    this.meguRenderer = new MeguRenderer(this, {
      atlasKey: key, x: 128, y: 417, originX: 0, originY: 1,
      depth: 10, flipX: true, state: MeguRenderer.STATES.WALKING_1,
      shadow: { widthRatio: 0.62, height: 13, yOffset: 3, alpha: 0.27, color: 0x101010 }
    });
    this.introMegu = this.meguRenderer.sprite;
    this.introContactFrame = this.meguRenderer.frames[MeguRenderer.STATES.HAPPY];
    if (!this.meguRenderer.frames[MeguRenderer.STATES.WALKING_1] && !this.meguRenderer.frames[MeguRenderer.STATES.WALKING_2]) {
      this.meguRenderer.destroy(); this.meguRenderer = null; this.introMegu = null;
    }
  }
  beginIntroWalk() {
    if (!this.introMegu || this.introFinished) return;
    // The shared renderer owns the discrete walk-frame sequence and cadence.
    this.meguRenderer.playAnimation('walking');
    // MEGU stops at the aircraft's bottom-left anchor point.
    const airplaneAnchor = { x: 445, y: 417 };
    this.walkTween = this.tweens.add({
      targets: this.introMegu,
      x: airplaneAnchor.x,
      y: airplaneAnchor.y,
      duration: 10400 * (445 - 128) / (845 - 128),
      ease: 'Linear',
      onUpdate: () => {
        if (this.meguRenderer) this.meguRenderer.update();
      },
      onComplete: () => this.finishWalkAtAirplane()
    });
  }
  finishWalkAtAirplane() {
    if (this.introFinished || !this.introMegu) return;
    if (this.walkTimer) { this.walkTimer.remove(false); this.walkTimer = null; }
    if (this.meguRenderer) this.meguRenderer.setPosition(445, 417);

    // Keep the camera following MEGU through the end of the intro; do not
    // stop it or add a separate destination pan.
    if (this.meguRenderer) this.meguRenderer.setState(MeguRenderer.STATES.HAPPY);
    this.finishIntro();
  }
  finishIntro() {
    if (this.introFinished) return;
    this.introFinished = true;
    if (this.walkTimer) { this.walkTimer.remove(false); this.walkTimer = null; }
    if (this.walkTween) { this.walkTween.stop(); this.walkTween = null; }
    if (this.cameraFinalTween) { this.cameraFinalTween.stop(); this.cameraFinalTween = null; }
    if (this.cameraPanTween) { this.cameraPanTween.stop(); this.cameraPanTween = null; }
    if (this.meguRenderer) this.meguRenderer.setState(MeguRenderer.STATES.HAPPY);
    // Hold the contact pose for two seconds, then fade to the actual adventure.
    this.time.delayedCall(2000, () => {
      if (!this.scene.isActive('AdventureIntroScene')) return;
      this.introFade = this.add.rectangle(0, 0, 640, 640, 0x000000, 0)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(30000);
      this.tweens.add({
        targets: this.introFade,
        alpha: 1,
        duration: 650,
        ease: 'Linear',
        onComplete: () => {
          if (!this.scene.isActive('AdventureIntroScene')) return;
          if (this.introBgm) {
            try { this.introBgm.stop(); this.introBgm.destroy(); } catch (e) {}
            this.introBgm = null;
          }
          this.startDepartureSequence();
        }
      });
    });
  }
  startDepartureSequence() {
    if (this.departureSequenceStarted) return;
    this.departureSequenceStarted = true;
    const camera = this.cameras.main;
    camera.stopFollow();
    camera.setBounds(0, 0, 640, 640);
    camera.setScroll(0, 0);
    // Remove the completed intro fade so it cannot remain as a black overlay.
    if (this.introFade && this.introFade.active) this.introFade.destroy();
    this.introFade = null;
    // Clear the first cutscene from view while retaining this scene's lifecycle.
    [this.introMegu, this.introMeguShadow, this.introAirplane].forEach(o => {
      if (o && o.active) o.setVisible(false);
    });
    this.children.list.forEach(o => {
      if (o && o.active && o !== this.introFade && o.setVisible &&
          (o.depth === 0 || o.depth === 1 || o.depth === 5 || o.depth === 9 || o.depth === 10 || o.depth === 20)) {
        o.setVisible(false);
      }
    });

    const bg = this.add.image(300, 320, 'ad-departure-background').setDepth(0);
    const fg = this.add.image(320, 320, 'ad-departure-foreground').setDepth(20);
    this.departureBackground = bg;
    this.departureForeground = fg;
    this.departureObjects.push(bg, fg);

    // The requested three cloud sprites travel left continuously for exactly 3s.
    // Their 190px center spacing remains constant throughout the movement.
    const cloudKeys = ['ad-departure-cloud-1', 'ad-departure-cloud-2', 'ad-departure-cloud-1'];
    for (let i = 0; i < cloudKeys.length; i++) {
      const cloud = this.add.image(760 + i * 190, 250 + Math.random() * 140, cloudKeys[i])
        .setDepth(10);
      this.departureObjects.push(cloud);
      const cloudTween = this.tweens.add({
        targets: cloud,
        x: cloud.x - 1100,
        duration: 3000,
        ease: 'Linear'
      });
      this.departureTweens.push(cloudTween);
    }

    this.departureTweens.push(this.tweens.add({
      targets: bg, x: 260, duration: 3000, ease: 'Linear'
    }));
    const foregroundHome = { x: 320, y: 320 };
    const shake = () => {
      if (!this.departureSequenceStarted || !fg.active) return;
      const nextX = foregroundHome.x + Phaser.Math.Between(-8, 8);
      const nextY = foregroundHome.y + Phaser.Math.Between(-8, 8);
      const tween = this.tweens.add({
        targets: fg, x: nextX, y: nextY,
        duration: 650 + Math.random() * 300,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (this.departureSequenceStarted && fg.active) shake();
        }
      });
      this.departureTweens.push(tween);
    };
    shake();

    try {
      if (this.cache.audio.exists('ad-departure-sfx')) {
        this.departureSfx = this.sound.add('ad-departure-sfx', {
          volume: Number(this.scene.get('default')?.sfxVolume ?? 0.7)
        });
        this.departureSfx.play();
      }
      if (this.cache.audio.exists(this.departureBgmKey)) {
        this.departureBgm = this.sound.add(this.departureBgmKey, {
          loop: true, volume: Number(this.scene.get('default')?.musicVolume ?? 0.5)
        });
        this.departureBgm.play();
      } else {
        console.warn('[Adventure departure] Selected minigame BGM was not loaded:', this.departureBgmName);
      }
    } catch (e) { console.warn('[Adventure departure] Audio playback failed:', e); }

    const fadeIn = this.add.rectangle(0, 0, 640, 640, 0x000000, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(30000);
    this.departureObjects.push(fadeIn);
    this.tweens.add({ targets: fadeIn, alpha: 0, duration: 450, ease: 'Linear',
      onComplete: () => { if (fadeIn.active) fadeIn.destroy(); } });

    // Fade out during the final 500ms so the complete departure transition is exactly 3s.
    this.time.delayedCall(2500, () => {
      if (!this.scene.isActive('AdventureIntroScene')) return;
      if (this.departureShakeTimer) { this.departureShakeTimer.remove(false); this.departureShakeTimer = null; }
      if (this.departureForeground && this.departureForeground.active) this.departureForeground.setPosition(320, 320);
      this.departureFade = this.add.rectangle(0, 0, 640, 640, 0x000000, 0)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(30001);
      this.tweens.add({ targets: this.departureFade, alpha: 1, duration: 500, ease: 'Linear',
        onComplete: () => {
          if (!this.scene.isActive('AdventureIntroScene')) return;
          // Transfer the already-playing departure BGM to the minigame.
          // Do not stop/recreate it at the scene boundary: playback must
          // continue from the same position without restarting.
          const continuingAdventureMusic = this.departureBgm;
          this.departureBgm = null;
          if (this.departureSfx) { try { this.departureSfx.stop(); this.departureSfx.destroy(); } catch (e) {} this.departureSfx = null; }
          // Keep this fully black intro scene alive above the paused home scene
          // until the minigame has completed its create() method. Launching and
          // stopping this scene in the same tick can expose the home screen for
          // one frame while Phaser schedules the minigame's startup.
          const minigameScene = this.scene.get('AdventureMinigame');
          if (!minigameScene || !minigameScene.events) {
            console.error('[Adventure departure] Minigame scene is unavailable; keeping transition covered.');
            return;
          }
          minigameScene.events.once('create', () => {
            if (!this.scene.isActive('AdventureIntroScene')) return;
            this.scene.bringToTop('AdventureMinigame');
            this.scene.stop('AdventureIntroScene');
          });
          this.scene.launch('AdventureMinigame', {
            ...this.launchData,
            continuingAdventureMusic
          });
        }
      });
    });
  }
  cleanup() {
    if (this.departureShakeTimer) { try { this.departureShakeTimer.remove(false); } catch (e) {} this.departureShakeTimer = null; }
    (this.departureTweens || []).forEach(t => { try { if (t && t.stop) t.stop(); } catch (e) {} });
    this.departureTweens = [];
    if (this.departureBgm) { try { this.departureBgm.stop(); this.departureBgm.destroy(); } catch (e) {} this.departureBgm = null; }
    if (this.departureSfx) { try { this.departureSfx.stop(); this.departureSfx.destroy(); } catch (e) {} this.departureSfx = null; }
    if (this.introBgm) {
      try { this.introBgm.stop(); this.introBgm.destroy(); } catch (e) {}
      this.introBgm = null;
    }
    if (this.walkTimer) { try { this.walkTimer.remove(false); } catch (e) {} this.walkTimer = null; }
    if (this.walkTween) { try { this.walkTween.stop(); } catch (e) {} this.walkTween = null; }
    if (this.cameraFinalTween) { try { this.cameraFinalTween.stop(); } catch (e) {} this.cameraFinalTween = null; }
    if (this.cameraPanTween) { try { this.cameraPanTween.stop(); } catch (e) {} this.cameraPanTween = null; }
    if (this.meguRenderer) { this.meguRenderer.destroy(); this.meguRenderer = null; this.introMegu = null; }
    if (!this.introFinished) {
      try {
        const home = this.scene.get('default');
        if (home && this.scene.isPaused('default')) this.scene.resume('default');
        if (home && home.input) home.input.enabled = true;
      } catch (e) {}
    }
  }
}
