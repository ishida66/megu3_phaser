// Phaser scene module. Loaded after js/game.js and before js/boot.js.
class AdventureMinigame extends Phaser.Scene {
  constructor() { super({ key: 'AdventureMinigame' }); }
  init(data = {}) {
    this.adventureId = String(data.adventureId || '');
    this.continuingAdventureMusic = data.continuingAdventureMusic || null;
    // Use the adventure's optional BGM field; fall back to the standard track.
    // Restrict the filename to a simple asset basename from the JSON.
    const requestedBgm = String(data.adventureBgm || '').trim().replace(/\.mp3$/i, '');
    this.adventureBgmName = /^[a-zA-Z0-9_-]+$/.test(requestedBgm) ? requestedBgm : 'BGM_Adventure';
    this.adventureBgmKey = `adventure-bgm-${this.adventureBgmName}`;
    this.defaultAdventureBgmName = 'BGM_Adventure';
    this.defaultAdventureBgmKey = 'adventure-bgm-BGM_Adventure';
    this.playerMeguDef = data.playerMeguDef || null;
    this.adventureDuration = 65000;
    this.adventurePhaseTimer = null;
    // Phaser reuses this Scene instance when it is launched again. Reset all
    // per-run state here; otherwise the previous run's ending=true prevents
    // both animation updates and the next return-to-home transition.
    this.ending = false;
    this.panTween = null;
    this.meguMoveTween = null;
    this.adventureMusic = null;
    this.adventureMegu = null;
    this.meguRenderer = null;
    this.adventureMeguShadow = null;
    this.adventureMeguOverlay = null;
    this.adventureMeguBlink = null;
    this.nextMeguBlinkAt = 0;
    this.meguIsMoving = true;
    this.meguActionTween = null;
    this.meguActionTimer = null;
    this.meguAction = 'walk';
    this.meguPoseFrame = null;
    this.adventurePhase = 1;
    this.adventureMessage = null;
    this.adventureMessageTimer = null;
    this.meguFacingRight = true;
    this.mainScene = null;
    this.mainInputWasEnabled = true;
    this.adventureQuitButton = null;
    this._returnSequenceStarted = false;
    this._returned = false;
    this._quitFallbackTimer = null;
    this.adventureHeadObject = null;
    this.adventureHeadObjectImage = null;
    this.adventureHeadObjectFadeTimer = null;
    this.adventureHeadObjectMoveTween = null;
    this.adventureHeadObjectQueue = [];
    this.adventureHeadObjectCooldownTimer = null;
    this.adventureHeadObjectNextSpawnAt = 0;
  }
  preload() {
    if (!this.textures.exists('adventure-close')) this.load.image('adventure-close', 'assets/menus/buttons/btn_close@2x.png');
    [
      ['stroll-exclamation', 'stroll_exclamation@2x.png'],
      ['stroll-question', 'stroll_question@2x.png'],
      ['stroll-note8', 'stroll_note8@2x.png'],
      ['stroll-note16', 'stroll_note16@2x.png']
    ].forEach(([key, filename]) => {
      if (!this.textures.exists(key)) this.load.image(key, `assets/objects/${filename}`);
    });
    const key = `adventure-${this.adventureId}`;
    // Phaser textures and audio are global caches and survive scene.stop().
    // Do not enqueue duplicate keys when the same adventure is played again.
    if (!this.textures.exists(key)) {
      this.load.atlas(
        key,
        `assets/adventure/ADV${this.adventureId}.png`,
        `assets/adventure/ADV${this.adventureId}.json`
      );
    }
    if (!this.cache.audio.exists(this.adventureBgmKey)) {
      this.load.audio(this.adventureBgmKey, `assets/sound/bgm/${this.adventureBgmName}.mp3`);
    }
    // Always preload the standard fallback when a custom track is selected.
    if (this.adventureBgmKey !== this.defaultAdventureBgmKey &&
        !this.cache.audio.exists(this.defaultAdventureBgmKey)) {
      this.load.audio(this.defaultAdventureBgmKey,
        `assets/sound/bgm/${this.defaultAdventureBgmName}.mp3`);
    }
  }
  showAdventureMessage(message) {
    if (this.adventureMessageTimer) {
      try { this.adventureMessageTimer.remove(false); } catch (e) {}
      this.adventureMessageTimer = null;
    }
    if (this.adventureMessage) {
      try { this.adventureMessage.destroy(); } catch (e) {}
      this.adventureMessage = null;
    }
    const label = this.add.text(320, 18, message, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff',
      backgroundColor: '#7a241f', padding: { left: 10, right: 10, top: 6, bottom: 6 },
      align: 'center', wordWrap: { width: 590 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);
    this.adventureMessage = label;
    this.adventureMessageTimer = this.time.delayedCall(5000, () => {
      this.adventureMessageTimer = null;
      if (this.adventureMessage) this.adventureMessage.destroy();
      this.adventureMessage = null;
    });
  }
  create() {
    this.mainScene = this.scene.get('default');
    // AdventureIntroScene intentionally disables home input before launching
    // this scene. Do not capture that temporary disabled state as the state
    // to restore on return: the home scene must be interactive again.
    this.mainInputWasEnabled = true;
    this.scene.pause('default');
    if (this.mainScene.input) this.mainScene.input.enabled = false;
    try {
      if (this.mainScene.bgmSound && this.mainScene.bgmSound.isPlaying) this.mainScene.bgmSound.stop();
    } catch (e) {}
    const selectedTrackAvailable = this.cache.audio.exists(this.adventureBgmKey);
    const fallbackAvailable = this.cache.audio.exists(this.defaultAdventureBgmKey);
    const playbackKey = selectedTrackAvailable ? this.adventureBgmKey
      : (fallbackAvailable ? this.defaultAdventureBgmKey : null);
    if (!selectedTrackAvailable) {
      const warning = fallbackAvailable
        ? `BGM not found: ${this.adventureBgmName}.mp3 — using ${this.defaultAdventureBgmName}.mp3`
        : `BGM not found: ${this.adventureBgmName}.mp3 (default music is also unavailable)`;
      console.warn('[Adventure] ' + warning);
      this.showAdventureMessage(warning);
    }
    try {
      if (this.continuingAdventureMusic && this.continuingAdventureMusic.isPlaying) {
        // Adopt the same sound instance started during the departure cutscene.
        this.adventureMusic = this.continuingAdventureMusic;
        this.adventureMusic.setVolume(Number(this.mainScene.musicVolume ?? .5));
      } else if (playbackKey) {
        this.adventureMusic = this.sound.add(playbackKey, {
          loop: true, volume: Number(this.mainScene.musicVolume ?? .5)
        });
        this.adventureMusic.play();
      } else if (selectedTrackAvailable === false) {
        this.showAdventureMessage(`Unable to load Adventure BGM: ${this.adventureBgmName}.mp3`);
      }
    } catch (e) {
      console.warn('[Adventure] BGM playback failed.', e);
      this.showAdventureMessage(`Could not play BGM: ${this.adventureBgmName}.mp3`);
    }

    const atlasKey = `adventure-${this.adventureId}`;
    const texture = this.textures.exists(atlasKey) ? this.textures.get(atlasKey) : null;
    const frameNames = texture ? texture.getFrameNames() : [];
    const findFrame = expected => {
      if (!texture) return null;
      if (texture.has(expected)) return expected;
      if (texture.has(expected + '.png')) return expected + '.png';
      return frameNames.find(name => String(name).split('/').pop() === expected)
        || frameNames.find(name => String(name).split('/').pop() === expected + '.png')
        || null;
    };

    // Each pair forms one 1280x640 layer: the first tile at x=0, second at x=640.
    // Different scroll factors create a restrained parallax depth effect:
    // distant scenery drifts slowly, midground moves at an intermediate rate,
    // and the immediate foreground tracks the camera at full speed.
    const layerPairs = [
      ['main background', 1, 2, 0, 0.35],
      ['secondary background', 3, 4, 1, 0.65],
      ['foreground', 5, 6, 20, 1.0]
    ];
    let loadedCount = 0;
    layerPairs.forEach(([label, leftNumber, rightNumber, depth, scrollFactor]) => {
      [leftNumber, rightNumber].forEach((number, side) => {
        const expected = `ADV${this.adventureId}_0${number}`;
        const frame = findFrame(expected);
        if (!frame) {
          console.error(`[Adventure] ${label} atlas frame missing: ${expected}`, frameNames);
          return;
        }
        this.add.image(side * 640, 0, atlasKey, frame)
          .setOrigin(0, 0).setDisplaySize(640, 640)
          .setScrollFactor(scrollFactor, 1).setDepth(depth);
        loadedCount++;
      });
    });
    if (!loadedCount) {
      this.cameras.main.setBackgroundColor('#172333');
      this.add.text(W / 2, PLAY_AREA_H / 2, 'Adventure assets could not be loaded', {
        fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff',
        align: 'center', wordWrap: { width: 500 }
      }).setOrigin(.5);
    }

    this.createAdventureMegu();

    const camera = this.cameras.main;
    camera.resetFX();
    camera.setAlpha(1);
    camera.setViewport(0, 0, 640, 640);
    camera.setBounds(0, 0, 1280, 640);
    camera.setScroll(0, 0);
    // Fixed-to-camera close control, matching the other minigames.
    const closeCfg = MeguMenuLayouts.button(this, 'adventure', 'quit', {x:544,y:552,width:92,height:76});
    this.adventureQuitButton = this.add.image(closeCfg.x + closeCfg.width/2, closeCfg.y + closeCfg.height/2, 'adventure-close')
      .setDisplaySize(closeCfg.width, closeCfg.height).setOrigin(0.5).setScrollFactor(0).setDepth(1100);
    this.adventureQuitButton.setInteractive({ useHandCursor: true });
    this.adventureQuitButton.on("pointerdown", (pointer, localX, localY, event) => {
      event?.stopPropagation?.();
      this.quit();
    });
    this.events.once('shutdown', this.cleanup, this);
    // Five-phase camera sequence:
    // 1) left-edge pause (15s), 2) left-to-middle pan (10s),
    // 3) midpoint pause (15s), 4) middle-to-right pan (10s),
    // 5) right-edge pause (15s). Megu's randomized behavior continues
    // throughout, including while the camera is stationary.
    camera.setScroll(0, 0);
    camera.fadeIn(500, 0, 0, 0);
    this.adventureMoving = false;
    this.adventurePhase = 1;
    this.adventurePhaseTimer = this.time.delayedCall(15000, () => {
      this.adventurePhaseTimer = null;
      this.startAdventurePhaseTwo();
    });
    // The character now runs an independent randomized behavior loop. Its
    // targets are selected relative to the camera's current viewport so it
    // remains visible while the camera is moving or paused.
    if (this.adventureMegu) this.scheduleMeguAction(250);
  }
  startAdventurePhaseTwo() {
    if (this.ending || !this.scene.isActive('AdventureMinigame')) return;
    const camera = this.cameras.main;
    // Phase 2: travel from the left edge to the midpoint (10s).
    this.adventurePhase = 2;
    this.adventureMoving = true;
    this.panTween = this.tweens.add({
      targets: camera, scrollX: 320, duration: 10000,
      ease: 'Linear', onComplete: () => {
        this.panTween = null;
        camera.setScroll(320, 0);
        this.adventureMoving = false;
        // Phase 3: midpoint pause (15s).
        this.adventurePhase = 3;
        this.adventurePhaseTimer = this.time.delayedCall(15000, () => {
          this.adventurePhaseTimer = null;
          this.startAdventurePhaseFour();
        });
      }
    });
  }
  startAdventurePhaseFour() {
    if (this.ending || !this.scene.isActive('AdventureMinigame')) return;
    const camera = this.cameras.main;
    // Phase 4: travel from the midpoint to the right edge (10s).
    this.adventurePhase = 4;
    this.adventureMoving = true;
    this.panTween = this.tweens.add({
      targets: camera, scrollX: 640, duration: 10000,
      ease: 'Linear', onComplete: () => {
        this.panTween = null;
        camera.setScroll(640, 0);
        this.adventureMoving = false;
        // Phase 5: right-edge pause (15s), then return home.
        this.adventurePhase = 5;
        this.adventurePhaseTimer = this.time.delayedCall(15000, () => {
          this.adventurePhaseTimer = null;
          this.finish();
        });
      }
    });
  }
  queueAdventureHeadObject() {
    if (this.ending) return;
    const choices = [
      'stroll-exclamation', 'stroll-question',
      'stroll-note8', 'stroll-note16'
    ].filter(key => this.textures.exists(key));
    if (!choices.length) {
      console.warn('[Adventure] No stroll object textures were loaded.');
      return;
    }
    // Every completed walk queues one randomized overhead effect. If an
    // earlier effect is still visible, the next one waits rather than being lost.
    this.adventureHeadObjectQueue.push(Phaser.Utils.Array.GetRandom(choices));
    this.tryShowNextAdventureHeadObject();
  }
  tryShowNextAdventureHeadObject() {
    if (this.ending || this.adventureHeadObject || !this.adventureHeadObjectQueue.length) return;
    const remainingCooldown = this.adventureHeadObjectNextSpawnAt - this.time.now;
    if (remainingCooldown > 0) {
      if (!this.adventureHeadObjectCooldownTimer) {
        this.adventureHeadObjectCooldownTimer = this.time.delayedCall(remainingCooldown, () => {
          this.adventureHeadObjectCooldownTimer = null;
          this.tryShowNextAdventureHeadObject();
        });
      }
      return;
    }
    this.showAdventureHeadObject(this.adventureHeadObjectQueue.shift());
  }
  showAdventureHeadObject(key) {
    const megu = this.adventureMegu;
    if (!megu || !megu.active || this.ending || this.adventureHeadObject || !this.textures.exists(key)) return;
    const width = Math.max(24, megu.displayWidth || megu.width || 64);
    const height = Math.max(24, megu.displayHeight || megu.height || 64);
    const isNote = key === 'stroll-note8' || key === 'stroll-note16';

    // Raise random effects by 50px from their previous position.
    // Non-note effects stay attached to the Adventure walker; musical notes
    // keep their own world position and animate independently of the walker.
    const anchor = this.add.container(megu.x + width * 0.5, megu.y - height + 45)
      .setDepth(30).setAlpha(0);
    const sprite = this.add.image(0, 0, key)
      .setOrigin(0.5, 1).setScale(isNote ? 0.58 : 0.68);
    anchor.add(sprite);
    this.adventureHeadObject = anchor;
    this.adventureHeadObjectImage = sprite;
    // Enforce at least 10 seconds between actual random-object spawns.
    this.adventureHeadObjectNextSpawnAt = this.time.now + 10000;

    if (isNote) {
      const direction = Math.random() < 0.5 ? -1 : 1;
      this.adventureHeadObjectMoveTween = this.tweens.add({
        targets: sprite,
        x: direction * Phaser.Math.Between(42, 76),
        y: -Phaser.Math.Between(35, 62),
        angle: direction * Phaser.Math.Between(12, 24),
        duration: 3000,
        ease: 'Sine.easeOut'
      });
    }
    this.tweens.add({ targets: anchor, alpha: 1, duration: 300, ease: 'Linear' });
    this.adventureHeadObjectFadeTimer = this.time.delayedCall(2400, () => {
      this.adventureHeadObjectFadeTimer = null;
      if (!anchor.active) return;
      this.tweens.add({
        targets: anchor, alpha: 0, duration: 600, ease: 'Linear',
        onComplete: () => {
          if (anchor.active) anchor.destroy();
          if (this.adventureHeadObject === anchor) this.adventureHeadObject = null;
          this.adventureHeadObjectImage = null;
          this.adventureHeadObjectMoveTween = null;
          // Immediately show the next effect queued by a later walking stop.
          this.tryShowNextAdventureHeadObject();
        }
      });
    });
  }
  createAdventureMegu() {
    const main = this.mainScene;
    const def = this.playerMeguDef || (main.characterDefs && (main.characterDefs[getCharacterIndex(main.characterDefs)] || main.characterDefs[0]));
    const key = String((def && def.id) || main.activeCharacterTextureKey || (main.characterSprite && main.characterSprite.texture && main.characterSprite.texture.key) || '');
    if (!key || !this.textures.exists(key)) {
      console.warn('[Adventure] Home Megu atlas is not available:', key);
      return;
    }
    try {
      this.meguRenderer = new MeguRenderer(this, {
        atlasKey: key,
        x: 12,
        y: 500,
        originX: 0,
        originY: 1,
        depth: 10,
        flipX: true,
        state: MeguRenderer.STATES.WALKING_1,
        shadow: { widthRatio: 0.62, yOffset: 3, height: 13, color: 0x101010, alpha: 0.27 }
      });
    } catch (error) {
      console.warn('[Adventure] Could not create shared MeguRenderer:', error);
      return;
    }
    // Keep the existing scene movement code pointed at the renderer-owned
    // sprite. All frame/overlay/shadow rendering is now owned by MeguRenderer.
    this.adventureMegu = this.meguRenderer.sprite;
    this.adventureMeguShadow = this.meguRenderer.shadow;
    this.meguFrames = {
      walk: [MeguRenderer.STATES.WALKING_1, MeguRenderer.STATES.WALKING_2].filter(state => this.meguRenderer.hasState(state)),
      stand: [MeguRenderer.STATES.STANDING_1, MeguRenderer.STATES.STANDING_2].filter(state => this.meguRenderer.hasState(state)),
      poses: [MeguRenderer.STATES.VERY_HAPPY, MeguRenderer.STATES.HAPPY].filter(state => this.meguRenderer.hasState(state)),
      rarePoses: [MeguRenderer.STATES.VERY_SAD, MeguRenderer.STATES.WORRIED, MeguRenderer.STATES.SAD].filter(state => this.meguRenderer.hasState(state))
    };
    if (!this.meguFrames.walk.length) {
      console.warn('[Adventure] No walking frames are available for this character.');
      this.meguRenderer.destroy();
      this.meguRenderer = null;
      this.adventureMegu = null;
      return;
    }
    this.meguAnimationClock = 0;
    this.meguIsMoving = true;
    this.adventureMoving = true;
    this.meguAction = 'walk';
    this.meguFacingRight = true;
    this.meguWalkDirection = 1;
    this.syncMeguOverlays();
  }
  syncMeguOverlays() {
    if (!this.meguRenderer || !this.adventureMegu || !this.adventureMegu.active) return;
    this.meguRenderer.update();
    if (this.mainScene && this.mainScene.syncAccessoryForSprite) {
      this.mainScene.syncAccessoryForSprite(this, this.adventureMegu, 'accessoryAdventureSprite', (this.adventureMegu.depth || 10) + 0.03);
    }
  }
  cancelMeguActionTimer() {
    if (this.meguActionTimer) {
      try { this.meguActionTimer.remove(false); } catch (e) {}
      this.meguActionTimer = null;
    }
  }
  cancelMeguActionTween() {
    if (this.meguActionTween) {
      try { this.meguActionTween.stop(); } catch (e) {}
      this.meguActionTween = null;
    }
  }
  scheduleMeguAction(delay = 0) {
    if (this.ending || !this.adventureMegu || !this.adventureMegu.active) return;
    this.cancelMeguActionTimer();
    this.meguActionTimer = this.time.delayedCall(delay, () => {
      this.meguActionTimer = null;
      this.chooseMeguAction();
    });
  }
  chooseMeguAction() {
    if (this.ending || !this.adventureMegu || !this.adventureMegu.active) return;
    const roll = Math.random();
    const inPhaseTwo = this.adventurePhase === 3;
    const standChance = inPhaseTwo ? 0.18 : 0.22;
    const commonPoseChance = inPhaseTwo ? 0.40 : 0.16;
    const rarePoseChance = inPhaseTwo ? 0.025 : 0.005;
    if (roll < standChance) return this.beginMeguPause('stand');
    if (roll < standChance + commonPoseChance && this.meguFrames.poses.length) {
      return this.beginMeguPause('pose');
    }
    if (roll < standChance + commonPoseChance + rarePoseChance && this.meguFrames.rarePoses.length) {
      return this.beginMeguPause('pose', Phaser.Utils.Array.GetRandom(this.meguFrames.rarePoses));
    }
    this.beginMeguWalk();
  }
  beginMeguPause(type, selectedPoseFrame = null) {
    this.cancelMeguActionTween();
    this.meguAction = type;
    this.meguIsMoving = false;
    if (type === 'pose' && (selectedPoseFrame || this.meguFrames.poses.length)) {
      const state = selectedPoseFrame || Phaser.Utils.Array.GetRandom(this.meguFrames.poses);
      this.meguRenderer.setState(state);
      this.syncMeguOverlays();
    } else {
      this.meguAction = 'stand';
      if (this.meguFrames.stand.length) this.meguRenderer.playAnimation('standing');
      this.syncMeguOverlays();
    }
    // Standing pauses and poses last 1–3 seconds. Pose frames _10/_11 are
    // exclusive: the standing eye overlays stay hidden during a pose.
    this.scheduleMeguAction(Phaser.Math.Between(1000, 3000));
  }
  beginMeguWalk(forcedDirection = 0) {
    if (this.ending || !this.adventureMegu || !this.adventureMegu.active) return;
    this.cancelMeguActionTween();
    this.meguAction = 'walk';
    this.meguIsMoving = true;
    this.meguBlinkUntil = 0;
    const megu = this.adventureMegu;
    const camera = this.cameras.main;
    const margin = 8;
    const spriteW = Math.max(1, megu.displayWidth || megu.width || 1);
    const minWorldX = camera.scrollX + margin;
    const maxWorldX = Math.max(minWorldX, camera.scrollX + 640 - spriteW - margin);
    const currentScreenX = megu.x - camera.scrollX;
    const currentScreenY = megu.y;
    // Bias away from edges so the character naturally turns back into view.
    let direction;
    if (forcedDirection === 1 || forcedDirection === -1) direction = forcedDirection;
    else if (currentScreenX < 70) direction = 1;
    else if (currentScreenX > 570 - spriteW) direction = -1;
    else direction = Math.random() < 0.5 ? -1 : 1;
    this.meguWalkDirection = direction;
    const distance = Phaser.Math.Between(35, 210);
    let targetScreenX = currentScreenX + direction * distance;
    if (targetScreenX < margin) targetScreenX = Math.min(640 - spriteW - margin, currentScreenX + Phaser.Math.Between(45, 150));
    if (targetScreenX > 640 - spriteW - margin) targetScreenX = Math.max(margin, currentScreenX - Phaser.Math.Between(45, 150));
    targetScreenX = Phaser.Math.Clamp(targetScreenX, margin, Math.max(margin, 640 - spriteW - margin));
    const targetX = Phaser.Math.Clamp(camera.scrollX + targetScreenX, minWorldX, maxWorldX);
    const targetY = Phaser.Math.Between(445, 520); // feet anchor is sprite.y (origin 0,1)
    const dx = targetX - megu.x;
    const dy = targetY - currentScreenY;
    // Direction follows horizontal travel. Existing atlas convention: flipX=true faces right.
    if (Math.abs(dx) > 3) {
      this.meguFacingRight = dx > 0;
      megu.setFlipX(this.meguFacingRight);
    }
    const speed = Phaser.Math.Between(45, 115);
    const duration = Phaser.Math.Clamp(Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / speed * 1000), 650, 4200);
    if (this.meguFrames && this.meguFrames.walk.length) this.meguRenderer.playAnimation('walking');
    this.syncMeguOverlays();
    this.meguActionTween = this.tweens.add({
      targets: megu,
      x: targetX,
      y: targetY,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.meguActionTween = null;
        if (this.ending) return;
        this.queueAdventureHeadObject();
        this.scheduleMeguAction(Phaser.Math.Between(150, 650));
      }
    });
  }
  keepMeguOnScreen() {
    const megu = this.adventureMegu;
    if (!megu || !megu.active || (this.meguRenderer && this.meguRenderer.isMovementLocked())) return;
    const camera = this.cameras.main;
    const margin = 8;
    const spriteW = Math.max(1, megu.displayWidth || megu.width || 1);
    const minX = camera.scrollX + margin;
    const maxX = Math.max(minX, camera.scrollX + 640 - spriteW - margin);
    const screenX = megu.x - camera.scrollX;

    // Left-edge safety has priority over random pauses or direction choices:
    // as soon as Megu enters this zone, immediately walk right.
    if (screenX <= 64 && !(this.meguAction === 'walk' && this.meguWalkDirection === 1)) {
      this.cancelMeguActionTimer();
      this.cancelMeguActionTween();
      megu.x = Math.max(megu.x, minX);
      this.beginMeguWalk(1);
    }

    if (megu.x < minX) {
      megu.x = minX;
      this.meguFacingRight = true;
      megu.setFlipX(true);
      // If the camera catches up from the left, immediately continue rightward.
      if (this.meguAction === 'walk' && this.meguActionTween) {
        this.cancelMeguActionTween();
        this.scheduleMeguAction(0);
      }
    } else if (megu.x > maxX) {
      megu.x = maxX;
      this.meguFacingRight = false;
      megu.setFlipX(false);
      if (this.meguAction === 'walk' && this.meguActionTween) {
        this.cancelMeguActionTween();
        this.scheduleMeguAction(0);
      }
    }
    // Clamp the feet anchor, not the sprite center, to the requested Y band.
    megu.y = Phaser.Math.Clamp(megu.y, 445, 520);
  }
  update(time) {
    if (!this.adventureMegu || !this.adventureMegu.active || this.ending) return;
    const megu = this.adventureMegu;
    const frames = this.meguFrames;
    if (!this.meguRenderer.isMovementLocked()) this.keepMeguOnScreen();
    // Frame sequencing and standing-only blinking are renderer-owned.
    this.syncMeguOverlays();
    if (this.adventureHeadObject && this.adventureHeadObject.active) {
      const key = this.adventureHeadObjectImage && this.adventureHeadObjectImage.texture
        ? this.adventureHeadObjectImage.texture.key : '';
      const isNote = key === 'stroll-note8' || key === 'stroll-note16';
      // Keep exclamation/question effects at the raised position over the walker.
      // Musical notes are deliberately excluded so they never track MEGU.
      if (!isNote) {
        const width = Math.max(24, megu.displayWidth || megu.width || 64);
        const height = Math.max(24, megu.displayHeight || megu.height || 64);
        this.adventureHeadObject.setPosition(megu.x + width * 0.5, megu.y - height + 45);
      }
    }
  }
  finish() {
    if (this.ending || this._returnSequenceStarted) return;
    this.ending = true;
    this.startReturnSequence(250);
  }
  quit() {
    if (this.ending || this._returnSequenceStarted || this._returned) return;
    this.ending = true;
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    this.startReturnSequence(650);
  }
  startReturnSequence(fadeDuration = 650) {
    if (this._returnSequenceStarted || this._returned) return;
    this._returnSequenceStarted = true;
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    let fadeStarted = false;
    const beginReturn = () => {
      if (this._quitFallbackTimer) {
        clearTimeout(this._quitFallbackTimer);
        this._quitFallbackTimer = null;
      }
      this.returnHome();
    };
    try {
      const camera = this.cameras && this.cameras.main;
      if (camera) {
        camera.once('camerafadeoutcomplete', beginReturn);
        camera.fadeOut(fadeDuration, 0, 0, 0);
        fadeStarted = true;
      }
    } catch (e) {
      console.warn('[Adventure] Quit fade failed; returning home.', e);
    }
    // Match Jump Rope's fade-and-return sequence, with a fallback if the
    // camera fade event is missed or the scene clock is interrupted.
    this._quitFallbackTimer = setTimeout(beginReturn, fadeStarted ? fadeDuration + 400 : 0);
  }
  returnHome() {
    if (this._returned) return;
    this._returned = true;
    const manager = this.game && this.game.scene;
    const main = this.mainScene || (manager && manager.getScene('default'));
    let recoveryDone = false;
    const recover = () => {
      if (recoveryDone) return;
      recoveryDone = true;
      try {
        if (!manager || !main) return;
        if (manager.isSleeping('default')) manager.wake('default');
        else if (manager.isPaused('default')) manager.resume('default');
        else if (!manager.isActive('default')) manager.start('default');
        try { if (main.time) main.time.paused = false; } catch (e) {}
        try { if (main.tweens && main.tweens.resumeAll) main.tweens.resumeAll(); } catch (e) {}
        try { if (main.anims && main.anims.resumeAll) main.anims.resumeAll(); } catch (e) {}
        try { if (main.cameras && main.cameras.main) main.cameras.main.resetFX(); } catch (e) {}
        try { if (main.cameras && main.cameras.main) main.cameras.main.setAlpha(1); } catch (e) {}
        // The home scene's input was deliberately disabled by the intro
        // sequence. Always restore it on return, regardless of the value
        // observed while AdventureMinigame was being created.
        try { if (main.input) main.input.enabled = true; } catch (e) {}
        try { main._adventureLaunchPending = false; } catch (e) {}
        try { if (main.input && main.input.manager) main.input.manager.enabled = true; } catch (e) {}
        manager.bringToTop('default');
        try {
          if (main.bgmSound) {
            main.bgmSound.setVolume(main.musicVolume);
            if (!main.bgmSound.isPlaying) main.bgmSound.play();
          }
        } catch (e) {}
      } catch (e) {
        console.error('[Adventure] Home recovery failed.', e);
      }
    };
    // Recover after Adventure has actually shut down, avoiding a race between
    // queued stop/resume operations. The timeout is an idempotent fallback.
    this.events.once('shutdown', recover);
    try { if (manager) manager.stop('AdventureMinigame'); } catch (e) { console.error(e); }
    setTimeout(() => {
      try {
        if (!recoveryDone && manager && !manager.isActive('AdventureMinigame') && !manager.isSleeping('AdventureMinigame')) recover();
      } catch (e) { recover(); }
    }, 400);
  }
  cleanup() {
    if (this._quitFallbackTimer) { clearTimeout(this._quitFallbackTimer); this._quitFallbackTimer = null; }
    if (this.adventureQuitButton) {
      try { this.adventureQuitButton.removeAllListeners(); } catch (e) {}
      this.adventureQuitButton = null;
    }
    if (this.panTween) { try { this.panTween.stop(); } catch (e) {} this.panTween = null; }
    if (this.meguMoveTween) { try { this.meguMoveTween.stop(); } catch (e) {} this.meguMoveTween = null; }
    this.cancelMeguActionTween();
    this.cancelMeguActionTimer();
    if (this.adventurePhaseTimer) { try { this.adventurePhaseTimer.remove(false); } catch (e) {} this.adventurePhaseTimer = null; }
    if (this.adventureHeadObjectFadeTimer) { try { this.adventureHeadObjectFadeTimer.remove(false); } catch (e) {} this.adventureHeadObjectFadeTimer = null; }
    if (this.adventureHeadObjectCooldownTimer) { try { this.adventureHeadObjectCooldownTimer.remove(false); } catch (e) {} this.adventureHeadObjectCooldownTimer = null; }
    if (this.adventureHeadObjectMoveTween) { try { this.adventureHeadObjectMoveTween.stop(); } catch (e) {} this.adventureHeadObjectMoveTween = null; }
    if (this.adventureHeadObject && this.adventureHeadObject.active) { try { this.adventureHeadObject.destroy(); } catch (e) {} }
    this.adventureHeadObject = null;
    this.adventureHeadObjectImage = null;
    this.adventureHeadObjectQueue = [];
    if (this.adventureMusic) {
      try { this.adventureMusic.stop(); this.adventureMusic.destroy(); } catch (e) {}
      this.adventureMusic = null;
    }
    if (this.adventureMessageTimer) {
      try { this.adventureMessageTimer.remove(false); } catch (e) {}
      this.adventureMessageTimer = null;
    }
    if (this.adventureMessage) {
      try { this.adventureMessage.destroy(); } catch (e) {}
      this.adventureMessage = null;
    }
    // Scene shutdown destroys its display-list GameObjects. Clear references
    // as well so a later launch cannot accidentally reuse old sprites.
    if (this.meguRenderer) {
      try { this.meguRenderer.destroy(); } catch (e) {}
      this.meguRenderer = null;
    }
    this.adventureMegu = null;
    this.adventureMeguShadow = null;
    this.adventureMeguOverlay = null;
    this.adventureMeguBlink = null;
    this.meguFrames = null;
    this.adventureMoving = false;
    this.meguAction = 'stopped';
    if (this.mainScene && this.mainScene.input) this.mainScene.input.enabled = this.mainInputWasEnabled !== false;
  }
}
