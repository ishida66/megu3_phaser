// Phaser scene module. Loaded after js/game.js and before js/boot.js.
class JumpRopeMinigame extends Phaser.Scene {
  constructor() { super({ key: 'JumpRopeMinigame' }); }
  init(data = {}) { this.entryPlayerMeguDef = data.playerMeguDef || null; this.objects = []; this.score = 0; this.misses = 0; this.ended = false; this.returned = false; this._jumpRopeCleaned = false; this._quitRequestedAt = 0; this._returnSequenceStarted = false; this.isJumping = false; this.lastJumpAt = -1000; this.ropePhase = 0; this.ropeSpeed = 1.8; this.baseRopeSpeed = 1.8; this.baseJumpDuration = 520; this.currentJumpDuration = 520; this.successfulJumpsForSpeed = 0; this.pendingHygieneCost = 0; this.started = false; this.stressGameCompleted = false; }
  preload() {
    this.load.json('megu-menu-jump_rope', 'js/config/menus/jump_rope.json');
    this.load.image('jumprope-bg', 'assets/background/ID1001@2x.png');
    this.load.image('jumprope-close', 'assets/menus/buttons/btn_close@2x.png');
    this.load.audio('jumprope-bgm', 'assets/sound/bgm/BGM_undokai2.mp3');
    this.load.audio('jumprope-hit', 'assets/sound/sfx/SE_balltoss.wav');
    this.load.audio('jumprope-miss', 'assets/sound/sfx/SE_beat.wav');
    const main = this.scene.get('default');
    const defs = main && main.characterDefs;
    const def = this.entryPlayerMeguDef || (defs && (defs[getCharacterIndex(defs)] || defs[0]));
    this.meguId = String(def && def.id || 'ID1');
    this.meguDef = def || { image:`assets/megu/${this.meguId}.png`, json:`assets/megu/${this.meguId}.json` };
    this.textureKey = this.meguId;
    if (!this.textures.exists(this.textureKey)) this.load.atlas(this.textureKey, this.meguDef.image || `assets/megu/${this.meguId}.png`, this.meguDef.json || `assets/megu/${this.meguId}.json`);
  }
  create() {
    this.cameras.main.fadeIn(250,0,0,0);
    const add = o => { this.objects.push(o); return o; };
    add(this.add.image(W/2,PLAY_AREA_H/2,'jumprope-bg').setDisplaySize(W,PLAY_AREA_H).setDepth(0));
    // Keep status updates available internally, but hide all instructional/message text.
    this.status = add(this.add.text(-1000, -1000, '', {...textStyle(13),color:'#fff2d6'}).setVisible(false).setDepth(4));
    this.scoreText = add(this.add.text(W - 14, 592, 'Jumps: 0', {...textStyle(12), fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3, fontStyle: 'bold'}).setOrigin(1, 1).setDepth(12));
    const quitBox = MeguMenuLayouts.button(this, 'jump_rope', 'quit', {x:544,y:552,width:92,height:76});
    this.quitBox = quitBox;
    this.quitHitbox = new Phaser.Geom.Rectangle(quitBox.hitboxX ?? quitBox.x, quitBox.hitboxY ?? quitBox.y, quitBox.hitboxWidth ?? quitBox.width, quitBox.hitboxHeight ?? quitBox.height);
    this.quitButton = add(this.add.image(quitBox.x + quitBox.width/2, quitBox.y + quitBox.height/2, 'jumprope-close').setDisplaySize(quitBox.width, quitBox.height).setDepth(8));
    this.quitButton.setInteractive({ useHandCursor: true });
    this.quitButton.on('pointerdown', () => this.quit());
    this.jumpFrameToggle = 0;
    this.centerX = W/2; this.groundY = 430; this.baseY = this.groundY + 145; this.ropeHitWindow = 1.1;
    // Anchor Megu by her feet; MeguRenderer owns standing, walking/jump, blink and emotional poses.
    this.meguRenderer = new MeguRenderer(this, {
      atlasKey: this.textureKey, x: this.centerX, y: this.baseY,
      originX: 0.5, originY: 1, depth: 4, autoUpdate: false,
      state: MeguRenderer.STATES.STANDING_1,
      // Keep the shadow independent from the sprite's squash/stretch visual cue.
      // It stays at the character's feet/ground anchor and retains its base size.
      shadow: { widthRatio: 0.62, height: 13, yOffset: 3, color: 0x101010, alpha: 0.27, followSpriteScale: false, followSpritePosition: false, anchorX: this.centerX, anchorY: this.baseY, scaleX: 1.25, scaleY: 1.25 }
    });
    this.megu = this.meguRenderer.sprite;
    // Explicitly enforce a feet anchor after construction and scaling. The
    // world-space foot position remains baseY, so the character does not jump
    // or shift on screen as a result of changing the anchor.
    this.meguRenderer.setPosition(this.centerX, this.baseY);
    this.meguShadow = this.meguRenderer.shadow;
    [this.meguRenderer.layer, this.meguShadow].filter(Boolean).forEach(add);
    this.idleFrame = this.meguRenderer.frames.standing_1 || this.meguRenderer.frames.standing_2;
    this.endFrame = this.meguRenderer.frames.very_sad;
    this.missFrame = this.meguRenderer.frames.worried || this.meguRenderer.frames.sad;
    this.jumpFrames = [this.meguRenderer.frames.walking_1, this.meguRenderer.frames.walking_2].filter(Boolean);
    this.meguRenderer.setScale(1.25);
    this.meguRenderer.setPosition(this.centerX, this.baseY);
    this.meguBaseScaleX = 1.25; this.meguBaseScaleY = 1.25;
    // Ground shadow remains owned and positioned by MeguRenderer.
    this.ropeApproachMarker = add(this.add.ellipse(this.centerX, this.baseY - 5, 94, 18, 0x35df72, 0.14).setStrokeStyle(2, 0x35df72, 0.75).setDepth(3));
    this.ropeApproachMarker.setVisible(false);
    this.rope = add(this.add.graphics().setDepth(3));
    // Bottom HUD: three spaced hearts, one removed per failure.
    this.triesHearts = [];
    for (let i = 0; i < 3; i++) {
      const heart = add(this.add.image(24 + i * 34, 580, 'heart-s').setScale(0.7).setDepth(12));
      this.triesHearts.push(heart);
    }
    this.ropeAngle = Math.PI / 2; this.ropeFrameCount = 16; this.ropeFrameAngle = 0; this.lastCrossing = -1; this.lastMissCycle = -1; this.successfulJumpThisCycle = false; this.jumpUntil = 0; this.missedCrossing = -1; this.missUntil = 0; this.missAfterJump = false;
    this.mainScene = this.scene.get('default');
    this.events.on('update', () => {
      if (this.mainScene && this.mainScene.syncAccessoryForSprite) this.mainScene.syncAccessoryForSprite(this, this.megu, 'accessoryMeguSprite', (this.megu && this.megu.depth || 4) + 0.03);
    });
    try { if (this.mainScene?.bgmSound?.isPlaying) this.mainScene.bgmSound.stop(); } catch(e) {}
    this.sound.getAllPlaying().forEach(sound => { if (sound.key && /bgm|music/i.test(sound.key) && sound.isPlaying) sound.stop(); });
    try { this.music = this.sound.add('jumprope-bgm',{loop:true,volume:this.mainScene ? this.mainScene.musicVolume : 0}); this.music.play(); } catch(e) {}
    this.jumpHandler = pointer => {
      // Clicking the quit control should quit, not also start/jump.
      if (pointer && this.quitHitbox.contains(pointer.x, pointer.y)) return;
      if (!this.started) { this.started = true; this.status.setText('Tap / click or press SPACE to jump'); return; }
      this.tryJump();
    };
    this.input.on('pointerdown', this.jumpHandler);
    this.spaceKey = this.input.keyboard ? this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) : null;
    this.events.once('shutdown', this.cleanup, this);
  }
  updateTriesHud() {
    if (!this.triesHearts) return;
    const remaining = Math.max(0, 3 - this.misses);
    this.triesHearts.forEach((heart, index) => heart.setVisible(index < remaining));
  }
  tryJump() {
    if (this.ended) return;
    if (!this.started) { this.started = true; this.status.setText('Tap / click or press SPACE to jump'); return; }
    // Every click triggers a jump. Timing only determines whether it counts as a miss.
    const rawPhase = ((this.ropeAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const frameStep = (Math.PI*2) / this.ropeFrameCount;
    const phase = Math.round(rawPhase / frameStep) * frameStep;
    const distance = Math.abs(phase - Math.PI/2);
    const success = distance < this.ropeHitWindow;
    // Immediately clear the pre-jump anticipation pose when input is accepted.
    // Do this before starting the jump so the crouch/bounce cannot linger for a frame.
    this.meguRenderer?.setPosition(this.centerX, this.baseY);
    this.meguRenderer?.setScale(this.meguBaseScaleX, this.meguBaseScaleY);
    this.meguRenderer?.setRotation(0);
    this.meguRenderer?.setAlpha(1);
    this.meguRenderer?.clearTint();
    this.meguRenderer?.setState(MeguRenderer.STATES.JUMP);
    this.lastJumpAt = this.time.now;
    this.isJumping = true;
    this.currentJumpDuration = this.baseJumpDuration * (this.baseRopeSpeed / this.ropeSpeed);
    this.jumpUntil = this.time.now + this.currentJumpDuration;
    this.missAfterJump = !success;
    this.currentJumpWasSuccess = success;
    this.missUntil = 0;
    if (success) {
      this.successfulJumpThisCycle = true;
      this.score++;
      this.status.setText('Nice jump!');
      this.scoreText.setText(`Jumps: ${this.score}`);
      try { this.sound.play('jumprope-hit',{volume:.45}); } catch(e) {}
    } else {
      this.misses++;
      this.updateTriesHud();
      this.status.setText('Missed! Jumping anyway…');
      try { this.sound.play('jumprope-miss',{volume:.75}); } catch(e) {}
      if (this.misses >= 3) this.finishAfterMiss = true;
    }
  }
  update(time, delta) {
    if (this.ended) return;
    if (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) { if (!this.started) { this.started = true; this.status.setText('Tap / click or press SPACE to jump'); } else this.tryJump(); }
    if (this.started) this.ropeAngle += delta / 1000 * this.ropeSpeed;
    const rawRopePhase = ((this.ropeAngle % (Math.PI*2)) + 2*Math.PI) % (2*Math.PI);
    const frameStep = (Math.PI*2) / this.ropeFrameCount;
    const phase = Math.round(rawRopePhase / frameStep) * frameStep;
    if (this.started) {
      const cycle = Math.floor(this.ropeAngle / (Math.PI * 2));
      const previousPhase = ((this.previousRawRopePhase ?? rawRopePhase) + Math.PI * 2) % (Math.PI * 2);
      const crossedTarget = previousPhase < Math.PI / 2 && rawRopePhase >= Math.PI / 2;
      if (crossedTarget && this.lastMissCycle !== cycle) {
        if (!this.successfulJumpThisCycle && !this.isJumping && !this.missUntil) {
          this.misses++;
          this.updateTriesHud();
          this.status.setText(`Too late! Fails: ${this.misses}/3`);
          this.meguRenderer?.setState(MeguRenderer.STATES.WORRIED);
          this.missUntil = time + Math.min(500, 500 * (1.8 / Math.max(0.1, this.ropeSpeed)));
          try { this.sound.play('jumprope-miss', { volume: .75 }); } catch (e) {}
          if (this.misses >= 3) this.finishAfterMiss = true;
        }
        this.successfulJumpThisCycle = false;
        this.lastMissCycle = cycle;
      }
      this.previousRawRopePhase = rawRopePhase;
    }
    if (this.isJumping) {
      const remaining = Math.max(0,this.jumpUntil-time);
      const progress = 1 - remaining / this.currentJumpDuration;
      const jumpLift = Math.sin(progress*Math.PI)*39;
      this.meguRenderer?.setJumpHeight(jumpLift, jumpLift / 39);
      if (time >= this.jumpUntil) { this.isJumping = false; if (this.currentJumpWasSuccess) { this.successfulJumpsForSpeed++; this.currentJumpWasSuccess = false; /* Apply exercise costs and increase speed only after each fifth successful jump animation has fully completed. */ if (this.successfulJumpsForSpeed % 5 === 0) { const weightRange = Math.max(0, (Number(GAME_ATTRIBUTES.max_weight) || 0) - (Number(GAME_ATTRIBUTES.min_weight) || 0)); applyExerciseCost(weightRange * 0.02, 0.10, this.mainScene); this.pendingHygieneCost++; this.ropeSpeed = Math.min(10.0, this.ropeSpeed + 0.8); } } if (this.missAfterJump) { this.meguRenderer?.setState(MeguRenderer.STATES.WORRIED); this.missUntil = time + Math.min(500, 500 * (1.8 / Math.max(0.1, this.ropeSpeed))); this.missAfterJump = false; } else { this.meguRenderer?.setState(MeguRenderer.STATES.STANDING_1); } }
    }
    // Keep the fail pose for its full 0.5s, then restore the minigame idle pose.
    if (!this.isJumping && this.missUntil && time >= this.missUntil) { this.meguRenderer?.setState(MeguRenderer.STATES.STANDING_1); this.missUntil = 0; if (this.finishAfterMiss) { this.finish(); return; } }
    // Rope ends stay pinned to the left and right edges. The center sweeps
    // through a broad arc; draw it in front while descending and behind while rising.
    const jumpDistance = Math.abs(phase - Math.PI/2);
    const jumpReady = jumpDistance < this.ropeHitWindow;
    const approaching = jumpDistance < 1.35;
    this.ropeApproachMarker.setVisible(this.started && approaching && !this.isJumping);
    this.ropeApproachMarker.setAlpha(jumpReady ? 0.9 : 0.5);
    if (!this.isJumping && !this.missUntil) {
      // Anticipation: a small knee-bend/bob before the rope reaches the jump window.
      const crouch = this.started && approaching ? Math.sin((1.35 - jumpDistance) / 1.35 * Math.PI) : 0;
      this.meguRenderer?.setPosition(this.centerX, this.baseY + crouch * 9);
      this.meguRenderer?.clearTint();
      this.meguRenderer?.setScale(this.meguBaseScaleX * (1 + crouch * 0.045), this.meguBaseScaleY * (1 - crouch * 0.252));
      if (!approaching) this.meguRenderer?.setScale(this.meguBaseScaleX, this.meguBaseScaleY);
    }
    // Use MeguRenderer's standard shadow positioning and sizing without
    // scene-specific overrides.
    this.meguRenderer?.update(time, delta);
    const descending = Math.cos(phase) > 0;
    this.rope.setDepth(descending ? 5 : 3);
    this.rope.clear();
    // Keep endpoint X coordinates fixed; set both endpoint Y coordinates to 475.
    // The arc's lowest center point aligns with Megu's feet at baseY.
    const amplitude = 180; // doubled from 90 for manual arc debugging
    const endpointY = 395; // Set both rope endpoints to y=395.
    const arcHeight = this.started ? Math.sin(phase) * amplitude : amplitude;
    const steps = 32;
    const drawArc = (width, color, alpha) => {
      this.rope.lineStyle(width, color, alpha);
      this.rope.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = t * W;
        const y = endpointY + Math.sin(Math.PI * t) * arcHeight;
        if (i === 0) this.rope.moveTo(0, endpointY);
        else this.rope.lineTo(x, y);
      }
      this.rope.lineTo(W, endpointY);
      this.rope.strokePath();
    };
    drawArc(8, 0x6b4634, 0.30);
    drawArc(4, 0xf5d7a1, 0.98);
  }
  quit() {
    if (this.returned || this._returnSequenceStarted) return;
    this.ended = true;
    if (this._finishHoldTimer) { clearTimeout(this._finishHoldTimer); this._finishHoldTimer = null; }
    if (this._returnFallbackTimer) { clearTimeout(this._returnFallbackTimer); this._returnFallbackTimer = null; }
    this._returnSequenceStarted = true;
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    this._diag('quit button pressed; fading out before return');
    let fadeStarted = false;
    const beginReturn = () => {
      if (this._returnFallbackTimer) { clearTimeout(this._returnFallbackTimer); this._returnFallbackTimer = null; }
      this.returnHome();
    };
    try {
      const camera = this.cameras && this.cameras.main;
      if (camera) {
        camera.once('camerafadeoutcomplete', beginReturn);
        camera.fadeOut(650, 0, 0, 0);
        fadeStarted = true;
      }
    } catch (e) { console.warn('Jump Rope quit fade failed; returning home', e); }
    this._returnFallbackTimer = setTimeout(beginReturn, fadeStarted ? 1000 : 0);
  }
  finish() {
    if (this.ended) return;
    this.stressGameCompleted = true;
    const previousBest = Math.max(0, Number(GAME_ATTRIBUTES.jumpRopeMaxRecord) || 0);
    if (this.score > previousBest) {
      GAME_ATTRIBUTES.jumpRopeMaxRecord = Math.max(0, Math.trunc(this.score));
      save();
      try { this.mainScene?.updateCurrentHonor?.(); this.mainScene?.updateGameAttributeDisplay?.(); } catch (e) {}
    }
    this.ended = true;
    if (!this._normalHygieneCostApplied) { this._normalHygieneCostApplied = true; applyHygieneCost(this.pendingHygieneCost || 0, this.mainScene); }
    // Hold the dedicated ID{id}_9 pose throughout the normal result sequence.
    try { if (this.meguRenderer) this.meguRenderer.setState(MeguRenderer.STATES.VERY_SAD); } catch (e) {}
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    try { if (this.status) this.status.setText(`Finished — ${this.score} jumps`); } catch (e) {}
    this._quitRequestedAt = performance.now();
    this._diag('finish requested');

    // Keep the final score visible for three seconds, then fade out before returning home.
    // Browser timers remain reliable if Phaser's scene clock is paused or cleaned up.
    if (this._finishHoldTimer) clearTimeout(this._finishHoldTimer);
    this._finishHoldTimer = setTimeout(() => {
      if (this._returnSequenceStarted || this.returned) return;
      this._returnSequenceStarted = true;
      let camera = null;
      try { camera = this.cameras && this.cameras.main; } catch (e) {}
      let fadeStarted = false;
      const beginReturn = () => {
        if (this._returnFallbackTimer) clearTimeout(this._returnFallbackTimer);
        this.returnHome();
      };
      if (camera) {
        try {
          camera.once('camerafadeoutcomplete', beginReturn);
          camera.fadeOut(650, 0, 0, 0);
          fadeStarted = true;
        } catch (e) { console.warn('Jump Rope fade failed; returning home', e); }
      }
      // Fallback protects against a missed fade event and is idempotent with the event path.
      this._returnFallbackTimer = setTimeout(beginReturn, fadeStarted ? 1000 : 0);
    }, 3000);
  }
  _diag(message) {
    const manager = this.game && this.game.scene;
    let states = {};
    for (const key of ['default', 'JumpRopeMinigame', 'SumoMinigame', 'BallTossMinigame']) {
      try { states[key] = { active: manager.isActive(key), paused: manager.isPaused(key), sleeping: manager.isSleeping(key) }; }
      catch (e) { states[key] = 'unavailable'; }
    }
    const row = { at: Math.round(performance.now()), message, states };
    window.__jumpRopeQuitDiagnostics = window.__jumpRopeQuitDiagnostics || [];
    window.__jumpRopeQuitDiagnostics.push(row);
    if (window.__jumpRopeQuitDiagnostics.length > 80) window.__jumpRopeQuitDiagnostics.shift();
    console.info('[JumpRope lifecycle]', row);
  }
  returnHome() {
    if (this.returned) return;
    this.returned = true;
    const manager = this.game && this.game.scene;
    let main = this.mainScene || null;
    try { if (!main && manager) main = manager.getScene('default'); } catch (e) {}
    this._diag('returnHome begin');

    // Recover only after Phaser confirms the opaque minigame scene has shut
    // down. This avoids a race between queued stop/resume operations.
    const recover = () => {
      try {
        if (!manager || !main) return;
        const otherActive = ['SumoMinigame', 'BallTossMinigame'].some(k => {
          try { return manager.isActive(k) && !manager.isPaused(k); } catch (e) { return false; }
        });
        if (otherActive) { this._diag('recovery skipped: another minigame active'); return; }
        // Ensure the home scene is running, not merely visible underneath a
        // stale paused state. Perform scene operations in one ordered pass.
        if (manager.isSleeping('default')) manager.wake('default');
        else if (manager.isPaused('default')) manager.resume('default');
        else if (!manager.isActive('default')) manager.start('default');
        try { if (main.time) main.time.paused = false; } catch (e) {}
        try { if (main.tweens && main.tweens.resumeAll) main.tweens.resumeAll(); } catch (e) {}
        try { if (main.anims && main.anims.resumeAll) main.anims.resumeAll(); } catch (e) {}
        try { if (main.cameras && main.cameras.main) main.cameras.main.resetFX(); } catch (e) {}
        try { if (main.cameras && main.cameras.main) main.cameras.main.setAlpha(1); } catch (e) {}
        try { if (main.input) main.input.enabled = true; } catch (e) {}
        try { if (main.input && main.input.manager) main.input.manager.enabled = true; } catch (e) {}
        manager.bringToTop('default');
        try {
          if (main.bgmSound) {
            main.bgmSound.setVolume(main.musicVolume);
            if (!main.bgmSound.isPlaying) main.bgmSound.play();
          }
        } catch (e) {}
        if (this.stressGameCompleted && typeof main.completeStressAction === 'function' && main.time) main.time.delayedCall(350, () => main.completeStressAction('jumpRope'));
        this._diag('home recovery complete');
      } catch (e) {
        console.error('JumpRope home recovery failed', e);
        this._diag('home recovery exception: ' + (e && e.message || e));
      }
    };
    // Recover once, after Phaser has actually shut this scene down. The
    // fallback runs only if shutdown was missed; it cannot repeat recovery.
    let recoveryDone = false;
    const recoverOnce = () => {
      if (recoveryDone) return;
      recoveryDone = true;
      recover();
    };
    this.events.once('shutdown', () => {
      this._diag('shutdown event');
      recoverOnce();
    });
    this.cleanup();
    try { if (manager) manager.stop('JumpRopeMinigame'); } catch (e) { console.error(e); }
    // Fallback only for an unexpectedly missed shutdown event.
    setTimeout(() => {
      try {
        if (!recoveryDone && manager && !manager.isActive('JumpRopeMinigame') && !manager.isSleeping('JumpRopeMinigame')) {
          this._diag('shutdown fallback');
          recoverOnce();
        }
      } catch (e) {
        if (!recoveryDone) recoverOnce();
      }
    }, 400);
  }
  cleanup() {
    // Idempotent teardown: no minigame-owned callbacks, tweens, input, audio,
    // or display objects should survive leaving this scene.
    if (this._jumpRopeCleaned) return;
    this._jumpRopeCleaned = true;
    this.ended = true;
    if (this._finishHoldTimer) { clearTimeout(this._finishHoldTimer); this._finishHoldTimer = null; }
    if (this._returnFallbackTimer) { clearTimeout(this._returnFallbackTimer); this._returnFallbackTimer = null; }
    try { if (this.input) { if (this.jumpHandler) this.input.off('pointerdown', this.jumpHandler); this.input.enabled = false; } } catch (e) {}
    try { if (this.spaceKey && this.input && this.input.keyboard) this.input.keyboard.removeKey(this.spaceKey, true); } catch (e) {}
    try { if (this.time) this.time.removeAllEvents(); } catch (e) {}
    try { if (this.tweens) this.tweens.killAll(); } catch (e) {}
    try { if (this.anims) this.anims.pauseAll(); } catch (e) {}
    try { if (this.music) { this.music.stop(); this.music.destroy(); this.music = null; } } catch (e) {}
    try { this.meguRenderer?.destroy(); } catch (e) {}
    this.meguRenderer = null;
    // Stop any scene-local sounds (including hit/miss effects) that may still be playing.
    try { if (this.sound) this.sound.getAllPlaying().forEach(sound => { try { if (/^jumprope-/.test(sound.key || '')) sound.stop(); } catch (e) {} }); } catch (e) {}
    (this.objects || []).forEach(o => { try { if (o && o.destroy) o.destroy(); } catch (e) {} });
    this.objects = [];
    this.megu = this.rope = null;
  }
}


// Camera/photo mode reuses the live home scene's Megu sprite and interaction
// state. Only the camera feed and Megu are drawn into the export canvas.
