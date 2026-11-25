// Phaser scene module. Loaded after js/game.js and before js/boot.js.
class WalkMinigame extends Phaser.Scene {
  constructor() { super({ key: 'WalkMinigame' }); }
  init(data = {}) {
    this.playerMeguDef = data.playerMeguDef || null;
    this.round = 0;
    this.ending = false;
    this.cleaned = false;
    this._returned = false;
    this.meguRenderer = null;
    this.friendMeguRenderer = null;
    this.walkMusic = null;
    this.mainScene = null;
    this.mainInputWasEnabled = true;
    this.roundObjects = [];
    this.choiceArrows = [];
    this.lives = 3;
    this.lifeHearts = [];
    this.lifeHeartKey = `${this.walkAssetToken}-life-heart`;
    this.deadendKeys = [];
    this.badSfxKey = `${this.walkAssetToken}-bad-sfx`;
    this.badSfx = null;
    this.deadendActive = false;
    // Public-friend rescue is rolled independently on every failed step.
    this.deadendTimers = [];
    this.walkFailMessage = null;
    this.walkFailMessageTimer = null;
    this.megu = null;
    this.meguIsIdle = false;
    this.meguRunTween = null;
    this.meguStepTimer = null;
    this.meguIdleTimer = null;
    this.walkHudRefreshTimer = null;
    this.walkHudObjects = [];
    this.walkHudValues = [];
    this.choiceTimer = null;
    this.roundTransitionTimer = null;
    this.bgKeys = [];
    this.walkDescription = null;
    this.walkAssetsReady = false;
    // Unique Phaser keys force this scene to decode fresh files instead of
    // silently reusing textures/audio left by an earlier visit. The global
    // loader patch also appends a per-page URL cache-buster to every asset.
    this.walkAssetToken = `walk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Build all per-run asset keys only after the unique token exists.
    this.lifeHeartKey = `${this.walkAssetToken}-life-heart`;
    this.badSfxKey = `${this.walkAssetToken}-bad-sfx`;
    this.walkDescriptionKey = `${this.walkAssetToken}-description`;
    this.backgroundKey = `${this.walkAssetToken}-background`;
    this.sideKeys = [];
    this.arrowKeys = ['left', 'right', 'up'].map(name => `${this.walkAssetToken}-arrow-${name}`);
    this.walkMusicKey = `${this.walkAssetToken}-bgm`;
    this.friendVoiceKeys = Array.from({ length: 10 }, (_, i) => `${this.walkAssetToken}-megu-voice-${i + 1}`);
    this.walkMeguTextureKey = null;
    this.walkMeguFramePrefix = null;
  }
  preload() {
    // The side-scene filenames and main background are data-driven. Always
    // fetch the description JSON from its canonical asset path on scene entry.
    this.load.json(this.walkDescriptionKey, 'assets/walk/walk_description.json');
    this.load.once(`filecomplete-json-${this.walkDescriptionKey}`, () => {
      const description = this.cache.json.get(this.walkDescriptionKey);
      const walk = description?.application?.walk;
      if (!walk || typeof walk.bg_loiter_bg !== 'string' ||
          !Array.isArray(walk.bg_loiter_side) || !walk.bg_loiter_side.length ||
          !walk.bg_loiter_side.every(file => typeof file === 'string' && file.length)) {
        console.error('[Walk] Invalid assets/walk/walk_description.json: expected application.walk.bg_loiter_bg and bg_loiter_side.');
        return;
      }
      this.walkDescription = walk;
      this.bgKeys = walk.bg_loiter_side.slice();
      this.sideKeys = this.bgKeys.map((_, i) => `${this.walkAssetToken}-side-${i}`);
      this.load.image(this.backgroundKey, `assets/walk/${walk.bg_loiter_bg}`);
      this.bgKeys.forEach((file, i) => this.load.image(this.sideKeys[i], `assets/walk/${file}`));
      this.load.image(this.arrowKeys[0], 'assets/walk/btn_arrow_left@2x.png');
      this.load.image(this.arrowKeys[1], 'assets/walk/btn_arrow_right@2x.png');
      this.load.image(this.arrowKeys[2], 'assets/walk/btn_arrow_up@2x.png');
      const deadendFiles = walk.bg_deadend;
      if (!Array.isArray(deadendFiles) || !deadendFiles.length ||
          !deadendFiles.every(file => typeof file === 'string' && file.length)) {
        console.error('[Walk] Invalid assets/walk/walk_description.json: expected application.walk.bg_deadend array.');
        return;
      }
      this.deadendKeys = deadendFiles.map((_, i) => `${this.walkAssetToken}-deadend-${i}`);
      deadendFiles.forEach((file, i) => this.load.image(this.deadendKeys[i], `assets/walk/${file}`));
      this.load.image(this.lifeHeartKey, 'assets/objects/heart_s.png');
      this.load.audio(this.badSfxKey, 'assets/sound/sfx/SE_bad.wav');
      this.load.audio(this.walkMusicKey, 'assets/sound/bgm/BGM_loiter.mp3');
      this.friendVoiceKeys.forEach((key, i) => this.load.audio(key, `assets/sound/sfx/SE_megu${i + 1}.wav`));
      const def = this.playerMeguDef;
      if (def && def.id && def.image && def.json) {
        this.walkMeguTextureKey = `${this.walkAssetToken}-megu`;
        this.walkMeguFramePrefix = String(def.id);
        this.load.atlas(this.walkMeguTextureKey, def.image, def.json);
      }
      this.walkAssetsReady = true;
    });
  }
  create() {
    this.mainScene = this.scene.get('default');
    this.mainInputWasEnabled = this.mainScene?.input ? this.mainScene.input.enabled : true;
    if (this.mainScene?.input) this.mainScene.input.enabled = false;
    try { if (this.mainScene?.bgmSound?.isPlaying) this.mainScene.bgmSound.stop(); } catch (e) {}
    try {
      this.walkMusic = this.sound.add(this.walkMusicKey, {
        loop: true, volume: Number(this.mainScene?.musicVolume ?? 0.5)
      });
      this.walkMusic.play();
    } catch (e) { console.warn('[Walk] Could not play BGM_loiter.mp3', e); }

    // A Phaser scene instance is reused when launched again. Reset every
    // camera FX/alpha state before drawing or fading in; otherwise a previous
    // run that ended during a fade can leave this camera fully black.
    const walkCamera = this.cameras.main;
    try { walkCamera.resetFX(); } catch (e) {}
    walkCamera.setAlpha(1);
    walkCamera.setVisible(true);
    walkCamera.setViewport(0, 0, 640, 950);
    walkCamera.setBounds(0, 0, 640, 950);
    walkCamera.setBackgroundColor('#000000');
    this.events.once('shutdown', this.cleanup, this);
    this.createLifeHearts();
    this.createWalkBottomNavigation();
    this.createWalkMegu();
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.beginRound(true);
  }
  createWalkBottomNavigation() {
    // Restore the standard home navigation artwork at the bottom of Walk.
    // The home scene is sleeping underneath, so its own footer is not visible.
    if (this.textures.exists('bottom-bar')) {
      this.walkBottomBar = this.add.image(0, 844, 'bottom-bar')
        .setOrigin(0, 0).setDisplaySize(640, 106).setDepth(100);
    }
    const main = this.mainScene;
    const footerActions = [
      { x: 8 + 56, key: 'care' },
      { x: 131 + 56, key: 'outing' },
      { x: 256 + 56, key: 'store' },
      { x: 380 + 56.5, key: 'megu' },
      { x: 520 + 56, key: 'options' }
    ];
    this.walkFooterZones = footerActions.map(({ x, key }) => {
      const zone = this.add.zone(x, 844 + 52, 112, 92)
        .setDepth(101).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.ending || !main) return;
        if (typeof main.openFooterMenu === 'function') main.openFooterMenu(key);
      });
      return zone;
    });
  }
  createLifeHearts() {
    this.lifeHearts = [];
    for (let i = 0; i < 3; i++) {
      const heart = this.add.image(550 + i * 28, 28, this.lifeHeartKey)
        .setOrigin(0.5).setDepth(90).setScale(0.72);
      this.lifeHearts.push(heart);
    }
    try { this.badSfx = this.sound.add(this.badSfxKey, { volume: Number(this.mainScene?.sfxVolume ?? 0.7) }); }
    catch (e) { console.warn('[Walk] Could not prepare SE_bad.wav', e); }
  }
  updateLifeHearts() {
    this.lifeHearts.forEach((heart, i) => {
      if (heart?.active) heart.setVisible(i < this.lives);
    });
  }
  scheduleDeadend(delay, callback) {
    const timer = this.time.delayedCall(delay, () => {
      this.deadendTimers = this.deadendTimers.filter(t => t !== timer);
      if (!this.ending) callback();
    });
    this.deadendTimers.push(timer);
    return timer;
  }
  showWalkFailMessage(phrase) {
    // Render the same speech bar artwork and typography as the home scene,
    // but create it on this scene's display list so it remains visible while
    // the home scene is asleep underneath the minigame.
    if (this.walkFailMessageTimer) {
      this.walkFailMessageTimer.remove(false);
      this.walkFailMessageTimer = null;
    }
    if (this.walkFailMessage?.active) this.walkFailMessage.destroy(true);

    const card = this.add.container(320, 200).setDepth(130);
    let background;
    if (this.textures.exists('megu-message-bg')) {
      const source = this.textures.get('megu-message-bg').getSourceImage();
      const sourceWidth = Math.max(1, source?.width || 640);
      const sourceHeight = Math.max(1, source?.height || 100);
      const scale = 640 / sourceWidth;
      background = this.add.image(0, 0, 'megu-message-bg').setOrigin(0.5)
        .setDisplaySize(640, sourceHeight * scale);
    } else {
      background = this.add.rectangle(0, 0, 640, 82, 0x26392b, 0.96)
        .setStrokeStyle(2, 0x8bd889);
    }
    const message = String(phrase || 'oh no its a dead-end');
    const text = this.add.text(0, 0, message, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#c9ff9f',
      stroke: '#18351b', strokeThickness: 3,
      align: 'center', wordWrap: { width: 608 },
      maxLines: 3, padding: { x: 8, y: 4 }
    }).setOrigin(0.5, 0.5);
    if (this.mainScene?.fitTextToBounds) {
      this.mainScene.fitTextToBounds(text, message, {
        width: 608, height: 62, baseSize: 16, jaBaseSize: 16,
        jaMinSize: 8, jaMaxLines: 3, enBaseSize: 16, enMaxLines: 3
      });
    }
    card.add([background, text]);
    this.walkFailMessage = card;
    this.walkFailMessageTimer = this.time.delayedCall(3000, () => {
      if (card.active) card.destroy(true);
      if (this.walkFailMessage === card) this.walkFailMessage = null;
      this.walkFailMessageTimer = null;
    });
    return card;
  }
  handleDeadend(direction) {
    if (this.ending || this.deadendActive) return;
    this.deadendActive = true;
    // Preserve the exact choice that caused this failure. The rescue route
    // must be selected from directions that differ from this failed choice.
    this.selectedWalkDirection = direction;
    this.failedWalkDirection = direction;
    const sideScene = this.currentSideScene || {};
    // Snapshot BOTH side-background assets exactly as they were rendered.
    // The rescue scene must restore the complete previous composition, not
    // choose a single side based on the failed exit direction.
    this.failedSideScene = {
      left: {
        id: sideScene.leftId || null, key: sideScene.leftKey || null,
        position: 'left', x: 160, flip: false
      },
      right: {
        id: sideScene.rightId || null, key: sideScene.rightKey || null,
        position: 'right', x: 480, flip: true
      }
    };

    const camera = this.cameras.main;
    let sceneSwitched = false;
    const enterDeadend = () => {
      if (sceneSwitched || this.ending) return;
      sceneSwitched = true;
      camera.off('camerafadeoutcomplete', enterDeadend);
      this.clearRoundObjects();

      // Keep the loiter background visible in the failure scene as well.
      const failLoiterBackground = this.add.image(0, 950, this.backgroundKey)
        .setOrigin(0, 1).setDepth(0);
      this.roundObjects.push(failLoiterBackground);
      const deadendKey = Phaser.Utils.Array.GetRandom(this.deadendKeys);
      const deadend = this.add.image(320, 320, deadendKey)
        .setDisplaySize(640, 640).setDepth(1);
      this.roundObjects.push(deadend);

      if (this.megu?.active) {
        this.meguIsIdle = false;
        this.meguRenderer?.setVisible(true);
        this.setWalkCharacterPosition(this.megu, 320, 830);
        this.setWalkCharacterFlipX(this.megu, false);
      }

      // Fade the dead-end scene in as MEGU walks into it.
      camera.fadeIn(500, 0, 0, 0);
      if (this.megu?.active) {
        this.runMeguTo(320, 680, 2000, () => {
          // The home scene is asleep during this minigame, so render the
          // home-screen message-box design directly on the active Walk scene.
          this.showWalkFailMessage('oh no its a dead-end');
          if (this.badSfx) {
            try {
              this.badSfx.setVolume(Number(this.mainScene?.sfxVolume ?? 0.7));
              this.badSfx.play();
            } catch (e) { console.warn('[Walk] Could not play SE_bad.wav', e); }
          }
          this.meguRenderer?.setState(MeguRenderer.STATES.WORRIED);

          // Keep the fail pose visible; the standard home message remains on
          // screen for its normal five-second duration.
          // After the normal fail message, roll for a public-friend rescue.
          // This chance is available again on every later failed step.
          this.scheduleDeadend(3000, () => this.tryFriendRescue());
        });
      } else {
        this.scheduleDeadend(3000, () => this.tryFriendRescue());
      }
    };

    // Match the success exit exactly: MEGU walks toward the selected exit
    // first, then the choice scene fades out before the dead-end scene appears.
    const targets = direction === 'left' ? { x: -100, y: 750, flip: false }
      : direction === 'right' ? { x: 740, y: 750, flip: true }
      : { x: 320, y: 20, flip: false };
    const beginFade = () => {
      if (this.ending || sceneSwitched) return;
      camera.once('camerafadeoutcomplete', enterDeadend);
      camera.fadeOut(250, 0, 0, 0);
      // Defensive fallback in case a renderer misses the fade completion event.
      this.scheduleDeadend(400, enterDeadend);
    };
    if (this.megu?.active) {
      this.setWalkCharacterFlipX(this.megu, targets.flip);
      this.meguRenderer?.playAnimation('walking', { frameDuration: 180 });
      // Start the exit walk, but begin the fade on the same fixed 2-second
      // schedule as the successful-choice path. runMeguTo's stepped movement
      // can take longer than its nominal duration, so do not wait for its
      // completion callback before fading.
      this.runMeguTo(targets.x, targets.y, 2000, null);
      this.scheduleDeadend(2000, beginFade);
    } else {
      beginFade();
    }
  }
  async tryFriendRescue() {
    if (this.ending || !this.deadendActive) return;
    // Each failed step gets an independent 25% public-friend rescue roll.
    // deadendActive prevents overlapping failure sequences; there is no
    // per-session rescue limit.
    if (Math.random() >= 0.25) {
      this.applyWalkFailureLifeLoss();
      return;
    }
    try {
      // This RPC-backed helper returns only discoverable/public profiles and
      // excludes the current player; never read another player's private save.
      const profiles = await fetchMeguPublicProfiles();
      if (this.ending || !this.deadendActive) return;
      if (!profiles.length) {
        this.applyWalkFailureLifeLoss();
        return;
      }
      const friend = Phaser.Utils.Array.GetRandom(profiles);
      await this.loadWalkFriendAtlas(friend);
      if (this.ending || !this.deadendActive || !this.megu?.active) {
        this.applyWalkFailureLifeLoss();
        return;
      }
      this.animateFriendRescue(friend);
    } catch (error) {
      console.warn('[Walk] Public friend rescue could not be loaded:', error);
      this.applyWalkFailureLifeLoss();
    }
  }
  applyWalkFailureLifeLoss() {
    if (this.ending || !this.deadendActive) return;
    this.lives = Math.max(0, this.lives - 1);
    this.updateLifeHearts();
    if (this.lives <= 0) {
      this.finishWalk();
      return;
    }
    this.runMeguTo(320, 830, 2000, () => this.transitionAfterDeadend());
  }
  async loadWalkFriendAtlas(profile) {
    const paths = meguAssetPaths(profile.petId, profile.shiny === true);
    const prefix = paths.key;
    const hasFrames = () => {
      const atlas = this.textures.exists(paths.key) ? this.textures.get(paths.key) : null;
      return !!(atlas && (atlas.has(`${prefix}_3-2x`) || atlas.has(`${prefix}_3`)));
    };
    if (!hasFrames()) {
      await new Promise((resolve, reject) => {
        const onComplete = () => {
          this.load.off('loaderror', onError);
          resolve();
        };
        const onError = file => {
          if (file && file.key === paths.key) {
            this.load.off('complete', onComplete);
            reject(new Error(`Could not load friend character ${profile.petId}`));
          }
        };
        this.load.once('complete', onComplete);
        this.load.on('loaderror', onError);
        this.load.atlas(paths.key, paths.image, paths.json);
        if (!this.load.isLoading()) this.load.start();
      });
    }
    if (!hasFrames()) throw new Error(`Friend atlas has no walking frames: ${profile.petId}`);
    this.friendMeguTextureKey = paths.key;
    this.friendMeguFramePrefix = prefix;
  }
  animateFriendRescue(profile) {
    if (this.ending || !this.megu?.active) return;
    const prefix = this.friendMeguFramePrefix;

    const fromLeft = Math.random() < 0.5;
    // Spawn the friend slightly inward from the screen corners.
    const startX = fromLeft ? 164 : 476;
    const stopX = fromLeft ? this.megu.x - 100 : this.megu.x + 100;
    // Render visiting friends through the shared renderer as well. This keeps
    // their body/eyes/shadow lifecycle and depth behavior consistent with the
    // player character instead of maintaining a second manual sprite path.
    try {
      this.friendMeguRenderer?.destroy();
      this.friendMeguRenderer = new MeguRenderer(this, {
        atlasKey: this.friendMeguTextureKey, framePrefix: prefix,
        x: startX, y: 840, originX: 0.5, originY: 1,
        depth: 21, autoUpdate: false, state: MeguRenderer.STATES.WALKING_1,
        flipX: fromLeft,
        shadow: { widthRatio: 0.62, height: 13, yOffset: 3, color: 0x101010, alpha: 0.27 }
      });
      this.friendMeguRenderer.setScale(0.62);
      this.friendMeguRenderer.playAnimation('walking', { frameDuration: 120, manual: true });
      this.friendMegu = this.friendMeguRenderer.sprite;
    } catch (error) {
      console.warn('[Walk] Could not create friend MeguRenderer:', error);
      this.friendMeguRenderer = null;
      this.applyWalkFailureLifeLoss();
      return;
    }
    const friend = this.friendMegu;
    const friendShadow = this.friendMeguRenderer.shadow;
    this.friendCelebrateState = this.friendMeguRenderer.hasState(MeguRenderer.STATES.HAPPY)
      ? MeguRenderer.STATES.HAPPY
      : (this.friendMeguRenderer.hasState(MeguRenderer.STATES.VERY_HAPPY)
        ? MeguRenderer.STATES.VERY_HAPPY : MeguRenderer.STATES.WALKING_1);
    this.roundObjects.push(this.friendMeguRenderer.layer, friendShadow);

    const approachStepDistance = 9;
    const approachStepInterval = 120;
    const stopWalkingAnimation = () => {
      if (this.friendWalkTimer) { this.friendWalkTimer.remove(false); this.friendWalkTimer = null; }
    };
    const facePlayer = fromLeft;
    this.friendMeguRenderer?.setFlipX(facePlayer);
    this.friendWalkTimer = this.time.addEvent({
      delay: approachStepInterval, loop: true,
      callback: () => {
        if (!friend.active || this.ending) {
          stopWalkingAnimation();
          return;
        }
        // Approach with the same discrete step cadence and step size used
        // by the rescue exit; do not use a smooth tween for this movement.
        const dx = stopX - friend.x;
        const dy = 680 - friend.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= approachStepDistance) {
          this.setWalkCharacterPosition(friend, stopX, 680);
          this.friendMeguRenderer?.update(this.time.now, 0);
          stopWalkingAnimation();
          onFriendArrived();
          return;
        }
        this.setWalkCharacterPosition(friend,
          friend.x + dx / distance * approachStepDistance,
          friend.y + dy / distance * approachStepDistance);
        this.friendMeguRenderer?.advanceAnimationFrame();
        this.friendMeguRenderer?.update(this.time.now, 0);
      }
    });
    const onFriendArrived = () => {
        stopWalkingAnimation();
        if (this.ending || !friend.active || !this.megu?.active) return;
        // One randomly selected MEGU voice plays once at the meeting point;
        // walking-frame changes and later scene transitions remain silent.
        const meetingVoiceKey = Phaser.Utils.Array.GetRandom(this.friendVoiceKeys || []);
        if (meetingVoiceKey && this.cache.audio.exists(meetingVoiceKey)) {
          try { this.sound.play(meetingVoiceKey, { volume: Number(this.mainScene?.sfxVolume ?? 0.7) }); } catch (e) {}
        }
        // The arriving friend uses the dedicated _11 meeting pose.
        this.friendMeguRenderer?.setState(this.friendCelebrateState || MeguRenderer.STATES.HAPPY);
        this.meguIsIdle = true;
        this.meguRenderer?.setState(MeguRenderer.STATES.VERY_HAPPY);

        const ownerName = String(profile.username || 'A friend').trim();
        const petName = String(profile.petName || 'MEGU').trim();
        this.showWalkFailMessage(`${ownerName}’s ${petName} came to show the way.`, 2000);
        // Hold the meeting/celebration pose for exactly two seconds, then
        // fade out before restoring the complete side-background scene.
        this.scheduleDeadend(2000, () => this.startFriendRescueExit(friend));
    };
  }
  startFriendRescueExit(friend) {
    if (this.ending || !this.megu?.active || !friend?.active ||
        !this.meguRenderer || this.meguRenderer.destroyed ||
        !this.friendMeguRenderer || this.friendMeguRenderer.destroyed) return;
    if (this.walkFailMessageTimer) {
      this.walkFailMessageTimer.remove(false);
      this.walkFailMessageTimer = null;
    }
    if (this.walkFailMessage?.active) this.walkFailMessage.destroy(true);
    this.walkFailMessage = null;

    const camera = this.cameras.main;
    const friendRenderer = this.friendMeguRenderer;
    const friendShadow = friendRenderer.shadow;
    const stepDistance = 9;
    const stepInterval = 160;
    friendRenderer.playAnimation('walking', { frameDuration: stepInterval, manual: true });
    this.meguRenderer.playAnimation('walking', { frameDuration: stepInterval, manual: true });
    const movementTimers = [];
    const stopMovementTimers = () => {
      for (const timer of movementTimers) if (timer) timer.remove(false);
      movementTimers.length = 0;
      for (const key of ['friendWalkTimer', 'friendMainWalkTimer', 'friendRescueStepTimer']) {
        if (this[key]) { this[key].remove(false); this[key] = null; }
      }
    };
    const stepCharacter = (renderer, sprite, dx, dy) => {
      if (this.ending || !sprite?.active || !renderer || renderer.destroyed) return;
      renderer.setPosition(sprite.x + dx, sprite.y + dy);
      renderer.advanceAnimationFrame();
      renderer.update(this.time.now, 0);
    };
    const walkTo = (renderer, sprite, targetX, targetY, onDone, delay = stepInterval) => {
      const timer = this.time.addEvent({
        delay, loop: true,
        callback: () => {
          if (this.ending || !sprite?.active || !renderer || renderer.destroyed) {
            timer.remove(false);
            onDone?.();
            return;
          }
          const dx = targetX - sprite.x, dy = targetY - sprite.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= stepDistance) {
            stepCharacter(renderer, sprite, dx, dy);
            renderer.setPosition(targetX, targetY);
            renderer.update(this.time.now, 0);
            timer.remove(false);
            onDone?.();
            return;
          }
          stepCharacter(renderer, sprite, dx / distance * stepDistance,
            dy / distance * stepDistance);
        }
      });
      movementTimers.push(timer);
      return timer;
    };

    // First departure: preserve the exact positions at the meeting point.
    friendRenderer.setVisible(true);
    friendRenderer.setFlipY(false);
    friendRenderer.setDepth(21, friendShadow?.depth);
    this.meguRenderer.setVisible(true);
    this.meguRenderer.setFlipY(false);
    this.meguIsIdle = false;
    friendRenderer.update(this.time.now, 0);
    friendRenderer.setShadowVisible(true);
    this.roundObjects.push(friendRenderer?.layer);
    if (friendShadow?.active) this.roundObjects.push(friendShadow);

    this.friendRescueStepTimer = this.time.addEvent({
      delay: stepInterval, loop: true,
      callback: () => {
        if (!friend?.active || this.ending) return;
        this.setWalkCharacterPosition(friend, friend.x, friend.y + stepDistance);
        friendRenderer?.advanceAnimationFrame();
        friendRenderer?.update(this.time.now, 0);
      }
    });
    movementTimers.push(this.friendRescueStepTimer);
    this.scheduleDeadend(1000, () => {
      if (this.ending || !friend?.active || !this.megu?.active) return;
      this.friendMainWalkTimer = this.time.addEvent({
        delay: stepInterval, loop: true,
        callback: () => {
          this.setWalkCharacterPosition(this.megu, this.megu.x, this.megu.y + stepDistance);
          this.meguRenderer.advanceAnimationFrame();
        }
      });
      movementTimers.push(this.friendMainWalkTimer);
    });

    // After three seconds of departure, fade into the original side-scene.
    this.scheduleDeadend(3000, () => {
      stopMovementTimers();
      camera.once('camerafadeoutcomplete', () => {
        if (this.ending || !friend?.active || !this.megu?.active) return;
        // Keep the two characters alive while replacing only the scene artwork.
        this.roundObjects = this.roundObjects.filter(o => o !== friendRenderer?.layer && o !== friendShadow);
        this.clearRoundObjects();
        const base = this.add.image(0, 950, this.backgroundKey).setOrigin(0, 1).setDepth(0);
        this.roundObjects.push(base);
        const savedSides = this.failedSideScene || {};
        for (const sideName of ['left', 'right']) {
          const side = savedSides[sideName];
          if (!side?.key || !this.textures.exists(side.key)) continue;
          this.roundObjects.push(this.add.image(side.x, 0, side.key)
            .setOrigin(0.5, 0).setFlipX(!!side.flip).setDepth(2));
        }
        // Enter from below, keeping the friend slightly ahead and on the left.
        const friendRestX = 280, playerRestX = 360, restY = 750;
        this.setWalkCharacterPosition(friend, friendRestX, 810);
        friendRenderer?.setVisible(true);
        friendRenderer?.setDepth(21, friendShadow?.depth);
        this.setWalkCharacterPosition(this.megu, playerRestX, 830);
        this.meguRenderer?.setVisible(true);
        friendRenderer?.update(this.time.now, 0);
        friendRenderer.setShadowVisible(true);
        this.roundObjects.push(friendRenderer?.layer, friendShadow);
        camera.fadeIn(300, 0, 0, 0);

        // Both characters begin entering the restored side-scene at the same time.
        walkTo(friendRenderer, friend, friendRestX, restY, null, stepInterval);
        walkTo(this.meguRenderer, this.megu, playerRestX, restY, () => {
          this.meguIsIdle = true;
          this.meguRenderer?.stopAnimation();
          this.meguRenderer?.playAnimation('standing', { frameDuration: 500 });
          // Guide the player toward the opposite horizontal exit from the failed choice.
          const failedDirection = this.failedWalkDirection || this.selectedWalkDirection;
          const correctDirection = failedDirection === 'left' ? 'right' : 'left';
          const targetX = correctDirection === 'left' ? -100 : 740;
          const targetY = restY;
          friendRenderer?.setFlipX(correctDirection === 'right');
          this.setWalkCharacterFlipX(this.megu, correctDirection === 'right');
          const startGuiding = () => {
            if (this.ending || !friend?.active || !this.megu?.active) return;
            this.meguIsIdle = false;
            walkTo(friendRenderer, friend, targetX, targetY, null);
            this.scheduleDeadend(1000, () => {
              if (this.ending || !this.megu?.active) return;
              this.meguRenderer?.playAnimation('walking', { frameDuration: stepInterval, manual: true });
              walkTo(this.meguRenderer, this.megu, targetX + (correctDirection === 'left' ? 80 : -80), targetY, null);
            });
            this.scheduleDeadend(3000, () => {
              stopMovementTimers();
              camera.fadeOut(300, 0, 0, 0);
              this.scheduleDeadend(350, () => {
                this.deadendActive = false;
                this.round += 1;
                if (this.round >= 9) this.finishWalk();
                else {
                  if (this.friendMeguRenderer) {
                    this.friendMeguRenderer.destroy();
                    this.friendMeguRenderer = null;
                    this.friendMegu = null;
                  }
                  this.clearRoundObjects();
                  camera.fadeIn(300, 0, 0, 0);
                  this.beginRound(false);
                }
              });
            });
          };
          // The friend begins guiding once MEGU has reached the resting row.
          startGuiding();
        });
      });
      camera.fadeOut(300, 0, 0, 0);
    });
  }
  transitionAfterDeadend() {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.scheduleDeadend(320, () => {
      this.deadendActive = false;
      this.round += 1;
      if (this.round >= 9) this.finishWalk();
      else {
        this.clearRoundObjects();
        this.cameras.main.fadeIn(300, 0, 0, 0);
        this.beginRound(false);
      }
    });
  }
  update(time, delta) {
    if (this.meguRenderer && !this.meguRenderer.destroyed) this.meguRenderer.update(time, delta);
    if (this.friendMeguRenderer && !this.friendMeguRenderer.destroyed) this.friendMeguRenderer.update(time, delta);
  }
  createWalkMegu() {
    const main = this.mainScene;
    const def = this.playerMeguDef || (main?.characterDefs &&
      (main.characterDefs[getCharacterIndex(main.characterDefs)] || main.characterDefs[0]));
    const key = this.walkMeguTextureKey || String(def?.id || main?.activeCharacterTextureKey ||
      main?.characterSprite?.texture?.key || '');
    const atlas = key && this.textures.exists(key) ? this.textures.get(key) : null;
    if (!atlas) { console.warn('[Walk] Character atlas unavailable:', key); return; }
    const framePrefix = this.walkMeguFramePrefix || key;
    const hasWalking = atlas.has(`${framePrefix}_3-2x`) || atlas.has(`${framePrefix}_3`) ||
      atlas.has(`${framePrefix}_4-2x`) || atlas.has(`${framePrefix}_4`);
    const hasStanding = atlas.has(`${framePrefix}_5-2x`) || atlas.has(`${framePrefix}_5`) ||
      atlas.has(`${framePrefix}_6-2x`) || atlas.has(`${framePrefix}_6`);
    if (!hasWalking && !hasStanding) { console.warn('[Walk] Character atlas has no usable frames:', key); return; }
    try {
      this.meguRenderer = new MeguRenderer(this, {
        atlasKey: key, framePrefix, x: 320, y: 750, originX: 0.5, originY: 1,
        depth: 20, autoUpdate: false, state: MeguRenderer.STATES.STANDING_1,
        shadow: { widthRatio: 0.62, height: 13, yOffset: 3, color: 0x101010, alpha: 0.27 }
      });
      this.megu = this.meguRenderer.sprite;
      this.meguRenderer.setScale(0.62);
      this.walkMeguFramePrefix = framePrefix;
    } catch (error) {
      console.warn('[Walk] Could not create MeguRenderer:', error);
      this.meguRenderer = null;
    }
  }
  clearRoundObjects() {
    if (this.meguRunTween) { this.meguRunTween.stop(); this.meguRunTween = null; }
    if (this.meguStepTimer) { this.meguStepTimer.remove(false); this.meguStepTimer = null; }
    this.roundObjects.forEach(o => { try { if (o?.active) o.destroy(); } catch (e) {} });
    this.roundObjects = [];
    this.choiceArrows = [];
  }
  beginRound(isFirst = false) {
    if (this.ending) return;
    this.clearRoundObjects();
    const bg = this.add.image(0, 950, this.backgroundKey).setOrigin(0, 1).setDepth(0);
    this.roundObjects.push(bg);
    const selected = Phaser.Utils.Array.Shuffle([...this.sideKeys]).slice(0, 2);
    this.currentSideScene = {
      leftKey: selected[0], rightKey: selected[1],
      leftId: this.bgKeys?.[this.sideKeys.indexOf(selected[0])] || null,
      rightId: this.bgKeys?.[this.sideKeys.indexOf(selected[1])] || null
    };
    // Side scenes are anchored to the top edge of the play area (y = 0).
    // Preserve their source dimensions; only mirror the right-hand image.
    const left = this.add.image(160, 0, selected[0]).setOrigin(0.5, 0).setDepth(2);
    const right = this.add.image(480, 0, selected[1]).setOrigin(0.5, 0)
      .setFlipX(true).setDepth(2);
    this.roundObjects.push(left, right);
    if (this.megu?.active) {
      this.meguIsIdle = false;
      this.setWalkCharacterPosition(this.megu, 320, 830);
      this.meguRenderer?.setVisible(true);
      this.setWalkCharacterFlipX(this.megu, false);
      // Keep the player above the full-screen walk background (depth 0) and side scenery.
      // The renderer is created before the round background, so depth 0 would place
      // its container behind that later-added image and make the character disappear.
      this.meguRenderer?.setDepth(20);
      this.runMeguTo(320, 750, 2000, () => this.showChoices(), 1);
    } else {
      this.showChoices();
    }
  }
  getWalkRenderer(sprite) {
    const renderer = sprite === this.megu ? this.meguRenderer
      : sprite === this.friendMegu ? this.friendMeguRenderer : null;
    return renderer && !renderer.destroyed ? renderer : null;
  }
  setWalkCharacterPosition(sprite, x, y) {
    if (!sprite?.active) return false;
    return this.getWalkRenderer(sprite)?.setPosition(x, y) ?? false;
  }
  setWalkCharacterFlipX(sprite, value) {
    if (!sprite?.active) return false;
    return this.getWalkRenderer(sprite)?.setFlipX(value) ?? false;
  }

  runMeguTo(x, y, duration, onComplete, frequencyMultiplier = 1) {
    if (!this.megu?.active || !this.meguRenderer || this.meguRenderer.destroyed) { onComplete?.(); return; }
    if (this.meguStepTimer) { this.meguStepTimer.remove(false); this.meguStepTimer = null; }
    this.meguIsIdle = false;
    this.meguRenderer.setVisible(true);
    this.meguRenderer.playAnimation('walking', { frameDuration: 180, manual: true });
    const startX = this.megu.x, startY = this.megu.y;
    // Keep every movement step the same size. Faster travel increases the
    // step frequency instead of making the character jump farther per step.
    const stepDistance = 9; // 1.5x the previous 6-pixel step.
    const distance = Math.hypot(x - startX, y - startY);
    const steps = Math.max(1, Math.ceil(distance / stepDistance));
    // Use one fixed reference cadence for every direction and every entry.
    // Deriving the interval from a shorter vertical approach made bottom-entry
    // movement use a different apparent speed from the left/right/top routes.
    const referenceStepCount = Math.max(1, Math.ceil(420 / 6));
    const stepInterval = Math.max(16, (duration / referenceStepCount) * 3 / Math.max(1, frequencyMultiplier));
    let step = 0;
    const advance = () => {
      if (this.ending || !this.megu?.active) { this.meguStepTimer = null; return; }
      step++;
      const t = Math.min(1, step / steps);
      this.setWalkCharacterPosition(this.megu, startX + (x - startX) * t, startY + (y - startY) * t);
      this.meguRenderer.advanceAnimationFrame();
      if (step >= steps) {
        this.meguStepTimer = null;
        onComplete?.();
      } else {
        this.meguStepTimer = this.time.delayedCall(stepInterval, advance);
      }
    };
    this.meguStepTimer = this.time.delayedCall(stepInterval, advance);
  }
  showChoices() {
    if (this.ending || this.round >= 9) return;
    if (this.megu?.active) {
      this.meguIsIdle = true;
      this.meguRenderer?.stopAnimation();
      this.meguRenderer?.playAnimation('standing', { frameDuration: 500 });
      this.setWalkCharacterPosition(this.megu, 320, 750);
      if (this.meguStepTimer) { this.meguStepTimer.remove(false); this.meguStepTimer = null; }
      if (this.meguIdleTimer) this.meguIdleTimer.remove(false);
    }
    this.failDirection = Phaser.Utils.Array.GetRandom(['left', 'right', 'up']);
    const specs = [
      [this.arrowKeys[0], 'left', 205, 690],
      [this.arrowKeys[1], 'right', 435, 690],
      [this.arrowKeys[2], 'up', 320, 585]
    ];
    specs.forEach(([key, direction, cx, cy]) => {
      const cfg = MeguMenuLayouts.button(this, 'walk', direction, {x:cx-34, y:cy-34, width:68, height:68});
      const arrow = this.add.image(cfg.x + cfg.width/2, cfg.y + cfg.height/2, key)
        .setDisplaySize(cfg.width, cfg.height).setDepth(50);
      const hitX = cfg.hitboxX ?? cfg.x, hitY = cfg.hitboxY ?? cfg.y;
      const hitW = cfg.hitboxWidth ?? cfg.width, hitH = cfg.hitboxHeight ?? cfg.height;
      arrow.setInteractive(new Phaser.Geom.Rectangle(
        hitX - (arrow.x - arrow.displayOriginX), hitY - (arrow.y - arrow.displayOriginY), hitW, hitH
      ), Phaser.Geom.Rectangle.Contains).input.cursor = 'pointer';
      arrow.on('pointerdown', (pointer, lx, ly, event) => {
        if (event?.stopPropagation) event.stopPropagation();
        this.chooseDirection(direction);
      });
      this.choiceArrows.push(arrow);
      this.roundObjects.push(arrow);
    });
  }
  chooseDirection(direction) {
    if (this.ending || this.choiceTimer || !this.choiceArrows.length) return;
    const isFail = direction === this.failDirection;
    this.choiceArrows.forEach(a => { if (a?.active) a.destroy(); });
    this.choiceArrows = [];
    if (this.meguIdleTimer) { this.meguIdleTimer.remove(false); this.meguIdleTimer = null; }
    // Store the selected direction before resolving success/failure so the
    // rescue sequence can never accidentally repeat a failed choice.
    this.selectedWalkDirection = direction;
    if (isFail) {
      this.handleDeadend(direction);
      return;
    }
    if (this.megu?.active) {
      this.meguIsIdle = false;
      // Home-screen facing convention: flipX=true faces right, false faces left.
      const targets = direction === 'left' ? { x: -100, y: 750, flip: false }
        : direction === 'right' ? { x: 740, y: 750, flip: true }
        : { x: 320, y: 20, flip: false };
      this.setWalkCharacterFlipX(this.megu, targets.flip);
      this.runMeguTo(targets.x, targets.y, 2000, null);
    }
    this.choiceTimer = this.time.delayedCall(2000, () => {
      this.choiceTimer = null;
      this.round += 1;
      if (this.round >= 9) this.finishWalk();
      else this.transitionRound();
    });
  }
  transitionRound() {
    if (this.ending) return;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.roundTransitionTimer = this.time.delayedCall(270, () => {
      this.roundTransitionTimer = null;
      if (this.ending) return;
      this.clearRoundObjects();
      this.cameras.main.fadeIn(300, 0, 0, 0);
      this.beginRound(false);
    });
  }
  finishWalk() {
    if (this.ending) return;
    this.ending = true;
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.time.delayedCall(370, () => this.returnHome());
  }
  returnHome() {
    if (this._returned) return;
    this._returned = true;
    const manager = this.game?.scene;
    const main = this.mainScene || (manager && manager.getScene('default'));
    let recoveryDone = false;
    let recoveryFallbackTimer = null;
    const recover = () => {
      if (recoveryDone) return;
      recoveryDone = true;
      if (recoveryFallbackTimer) { clearTimeout(recoveryFallbackTimer); recoveryFallbackTimer = null; }
      try {
        if (manager && main) {
          if (manager.isSleeping('default')) manager.wake('default');
          else if (manager.isPaused('default')) manager.resume('default');
          else if (!manager.isActive('default')) manager.start('default');
          if (main.time) main.time.paused = false;
          if (main.input) main.input.enabled = this.mainInputWasEnabled !== false;
          if (main.input?.manager) main.input.manager.enabled = true;
          if (main.cameras?.main) { main.cameras.main.resetFX(); main.cameras.main.setAlpha(1); }
          manager.bringToTop('default');
          if (main.bgmSound) { main.bgmSound.setVolume(main.musicVolume); if (!main.bgmSound.isPlaying) main.bgmSound.play(); }
        }
      } catch (e) { console.error('[Walk] Home recovery failed', e); }
    };
    this.events.once('shutdown', recover);
    this.cleanup();
    try { if (manager) manager.stop('WalkMinigame'); } catch (e) { recover(); }
    if (!recoveryDone) {
      recoveryFallbackTimer = setTimeout(() => {
        try { if (manager && !manager.isActive('WalkMinigame') && !manager.isSleeping('WalkMinigame')) recover(); }
        catch (e) { recover(); }
      }, 400);
    }
  }

  cleanup() {
    if (this.walkFailMessageTimer) { try { this.walkFailMessageTimer.remove(false); } catch (e) {} this.walkFailMessageTimer = null; }
    if (this.walkFailMessage?.active) { try { this.walkFailMessage.destroy(true); } catch (e) {} }
    this.walkFailMessage = null;
    if (this.cleaned) return;
    this.cleaned = true;
    this.ending = true;
    [...this.deadendTimers, this.choiceTimer, this.roundTransitionTimer, this.meguIdleTimer, this.walkHudRefreshTimer].forEach(timer => { try { timer?.remove(false); } catch (e) {} });
    this.deadendTimers = [];
    this.choiceTimer = this.roundTransitionTimer = this.meguIdleTimer = this.walkHudRefreshTimer = null;
    // Remove any untracked delayed calls (for example the final fade/return
    // callback) before this persistent scene instance is launched again.
    try { this.time?.removeAllEvents(); } catch (e) {}
    if (this.meguRunTween) { try { this.meguRunTween.stop(); } catch (e) {} this.meguRunTween = null; }
    if (this.friendWalkTween) { try { this.friendWalkTween.stop(); } catch (e) {} this.friendWalkTween = null; }
    if (this.friendWalkTimer) { try { this.friendWalkTimer.remove(false); } catch (e) {} this.friendWalkTimer = null; }
    try { this.tweens?.killAll(); } catch (e) {}
    if (this.friendMeguRenderer) { try { this.friendMeguRenderer.destroy(); } catch (e) {} }
    this.friendMeguRenderer = null;
    this.clearRoundObjects();
    this.lifeHearts.forEach(o => { try { if (o?.active) o.destroy(); } catch (e) {} });
    this.lifeHearts = [];
    if (this.badSfx) { try { this.badSfx.stop(); this.badSfx.destroy(); } catch (e) {} this.badSfx = null; }
    this.walkHudObjects.forEach(o => { try { if (o?.active) o.destroy(); } catch (e) {} });
    this.walkHudObjects = []; this.walkHudValues = [];
    this.walkBottomBar = null; this.walkFooterZones = [];
    if (this.walkMusic) { try { this.walkMusic.stop(); this.walkMusic.destroy(); } catch (e) {} this.walkMusic = null; }
    if (this.meguRenderer) { try { this.meguRenderer.destroy(); } catch (e) {} }
    this.meguRenderer = null;
    this.meguIsIdle = false;
    this.megu = null;
    this.friendMegu = null;
    this.friendCelebrateState = null;
    this.friendMeguTextureKey = null;
    this.friendMeguFramePrefix = null;
    if (this.meguStepTimer) { try { this.meguStepTimer.remove(false); } catch (e) {} this.meguStepTimer = null; }
    try { this.cameras?.main?.resetFX(); this.cameras?.main?.setAlpha(1); } catch (e) {}
    if (this.mainScene?.input) this.mainScene.input.enabled = this.mainInputWasEnabled !== false;
  }
}
