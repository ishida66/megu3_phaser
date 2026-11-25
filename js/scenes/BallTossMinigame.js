// Phaser scene module. Loaded after js/game.js and before js/boot.js.
class BallTossMinigame extends Phaser.Scene {
  constructor() { super({ key: 'BallTossMinigame' }); }
  init(data = {}) {
    this.entryPlayerMeguDef = data.playerMeguDef || null;
    this.ended = false;
    this.objects = [];
    this.ballInFlight = false;
    this.score = 0;
    this.returned = false;
    this._quitInProgress = false;
    this._returnSequenceStarted = false;
    this._finishHoldTimer = null;
    this._returnFallbackTimer = null;
    this._quitFallbackTimer = null;
    this._homeRecoveryStarted = false;
    this.stressGameCompleted = false;
    this.firstClassWinMessage = '';
  }
  preload() {
    this.load.json('megu-menu-ball_toss', 'js/config/menus/ball_toss.json');
    this.load.image('balltoss-bg', 'assets/background/ID1001@2x.png');
    this.load.image('balltoss-furniture', 'assets/furniture/KG506@2x.png');
    this.load.audio('balltoss-bgm', 'assets/sound/bgm/BGM_race.mp3');
    this.load.audio('balltoss-hit', 'assets/sound/sfx/SE_balltoss.wav');
    // Load the close icon in this scene explicitly; do not depend on another
    // minigame having populated Phaser's shared texture cache first.
    this.load.image('balltoss-close', 'assets/menus/buttons/btn_close@2x.png');
    const main = this.scene.get('default');
    const def = this.entryPlayerMeguDef || (main && main.characterDefs && main.characterDefs[getCharacterIndex(main.characterDefs)]) || (main && main.characterDefs && main.characterDefs[0]);
    this.meguId = String(def && def.id || 'ID1');
    this.meguDef = def || { image:`assets/megu/${this.meguId}.png`, json:`assets/megu/${this.meguId}.json` };
    this.textureKey = this.meguId;
    if (!this.textures.exists(this.textureKey)) this.load.atlas(this.textureKey, this.meguDef.image || `assets/megu/${this.meguId}.png`, this.meguDef.json || `assets/megu/${this.meguId}.json`);
  }
  create() {
    // Phaser reuses this Scene instance across launches; never carry terminal flags
    // from the previous run into the next one.
    this.ended = false;
    this.returned = false;
    this._quitInProgress = false;
    this._returnSequenceStarted = false;
    this._homeRecoveryStarted = false;
    this._finishHoldTimer = null;
    this._returnFallbackTimer = null;
    this._quitFallbackTimer = null;
    // Confine Ball Toss rendering to the 640x640 playfield; keep the footer clear.
    this.cameras.main.setViewport(0, 0, 640, 640);
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(250,0,0,0);
    const add = o => { this.objects.push(o); return o; };
    add(this.add.image(0,0,'balltoss-bg').setOrigin(0,0).setDisplaySize(640,640).setDepth(0));
    add(this.add.rectangle(W/2,35,W,70,0x172333,.65).setDepth(1));
    this.status = add(this.add.text(W/2,20,'BALL TOSS  •  Click to throw', { ...textStyle(18), color:'#ffffff', fontStyle:'bold' }).setOrigin(.5).setDepth(5));
    // Keep rally/speed diagnostics separate from gameplay messages and visible near the top.
    this.debugStatus = add(this.add.text(18,48,'Rallies: 0  •  Speed: 1.00x', { ...textStyle(13), color:'#9fffd0', fontStyle:'bold' }).setOrigin(0,0.5).setDepth(6));
    const quitBox = MeguMenuLayouts.button(this, 'ball_toss', 'quit', {x:544,y:552,width:92,height:76});
    this.quitBox = quitBox;
    this.quitHitbox = new Phaser.Geom.Rectangle(quitBox.hitboxX ?? quitBox.x, quitBox.hitboxY ?? quitBox.y, quitBox.hitboxWidth ?? quitBox.width, quitBox.hitboxHeight ?? quitBox.height);
    this.quitButton = add(this.add.image(quitBox.x + quitBox.width/2, quitBox.y + quitBox.height/2, 'balltoss-close').setDisplaySize(quitBox.width, quitBox.height).setDepth(8));
    this.quitButton.setInteractive({ useHandCursor: true });
    this.quitButton.on('pointerdown', () => this.quit());
    this.mainScene = this.scene.get('default');
    // The game scene is opaque, so the home room and its furniture stay hidden underneath.
    try { if (this.mainScene.bgmSound && this.mainScene.bgmSound.isPlaying) this.mainScene.bgmSound.stop(); } catch(e) {}
    this.playerX = 90; this.playerY = 535; this.meguX = 320; this.meguY = 500;
    // The shared renderer owns the character's idle, walking, blinking and result poses.
    // Only the chasing MEGU is visible; the player is represented by the near-screen throw origin.
    this.meguRenderer = new MeguRenderer(this, {
      atlasKey: this.textureKey, x: this.meguX, y: this.meguY,
      originX: 0.5, originY: 1, depth: 3, flipX: true,
      state: MeguRenderer.STATES.STANDING_1,
      shadow: { widthRatio: 0.62, height: 13, color: 0x101010, alpha: 0.27 }
    });
    this.megu = this.meguRenderer.sprite;
    this.meguShadow = this.meguRenderer.shadow;
    // Use MeguRenderer's standard shadow offset; no scene-specific correction.
    this.meguRenderer.update(this.time.now, 0);
    [this.meguRenderer.layer, this.meguShadow].filter(Boolean).forEach(add);
    this.idleFrame = this.meguRenderer.frames.standing_1 || this.meguRenderer.frames.standing_2;
    this.endFrame = this.meguRenderer.frames.very_sad;
    this.events.on('update', () => {
      if (this.mainScene && this.mainScene.syncAccessoryForSprite) this.mainScene.syncAccessoryForSprite(this, this.megu, 'accessoryMeguSprite', (this.megu.depth || 3) + 0.03);
    });
    // Keep MEGU bottom-anchored. Movement and ball targeting continue to use
    // the character's estimated visual center, converted to/from foot position.
    this.getMeguHalfHeight = () => Math.max(0, (this.megu?.displayHeight || 0) / 2);
    this.getMeguCenterY = () => this.megu.y - this.getMeguHalfHeight();
    this.getMeguYBounds = () => {
      const halfHeight = this.getMeguHalfHeight();
      return { min: halfHeight, max: Math.max(halfHeight, 630 - halfHeight) };
    };
    this.clampMeguY = centerY => {
      const bounds = this.getMeguYBounds();
      return Phaser.Math.Clamp(centerY, bounds.min, bounds.max);
    };
    this.setMeguCenterPosition = (x, centerY) => {
      this.meguRenderer?.setPosition(x, this.clampMeguY(centerY) + this.getMeguHalfHeight());
    };
    // Preserve the previous initial visual center (y = 500).
    this.setMeguCenterPosition(this.meguX, this.meguY);
    // Use the KG506 furniture artwork as the tossed object; retain the same
    // 80x80 base footprint so perspective scaling and the hitbox stay aligned.
    this.ball = add(this.add.container(this.playerX+28,this.playerY-44).setDepth(4));
    this.ballArtwork = this.add.image(0,0,'balltoss-furniture').setDisplaySize(80,80);
    this.ball.add(this.ballArtwork);
    this.ball.setSize(80,80); this.ball.setScale(1.5); this.ballFlightToken = 0; this.ballAngularVelocity = 0; this.idleWalkTimer = null;
    // No visible reticle/debug outline around the ball.
    // Use one scene-level pointer handler for both throwing and returning the
    // ball. Container hit areas can become stale after a stopped scene is
    // launched again, even when the sprites render correctly.
    this.input.enabled = true;
    if (this.input.manager) this.input.manager.enabled = true;
    this.ballPointerHandler = pointer => {
      if (this.ended || !this.input.enabled) return;
      if (this.awaitingReturn && this.ball && this.ball.active) {
        const bounds = this.ball.getBounds();
        if (bounds.contains(pointer.x, pointer.y)) {
          this.playBallTouchSound();
          this.ballAngularVelocity = Phaser.Math.Between(240, 720) * (Math.random() < 0.5 ? -1 : 1);
          this.score++;
          if (this.score % 5 === 0) {
            const weightRange = Math.max(0, (Number(GAME_ATTRIBUTES.max_weight) || 0) - (Number(GAME_ATTRIBUTES.min_weight) || 0));
            applyExerciseCost(weightRange * 0.02, 0.10, this.mainScene);
            this.pendingHygieneCost = (this.pendingHygieneCost || 0) + 1;
          }
          this.updateDebugStatus('Player touched the ball');
          this.awaitingReturn = false;
          this.stopSlowRandomWalk();
          this.playerReturn();
        }
        return;
      }
      if (this.ballInFlight || this.awaitingReturn || pointer.y < 70 || this.quitHitbox.contains(pointer.x, pointer.y)) return;
      this.throwBallToMegu(pointer.x, pointer.y);
    };
    this.input.on('pointerdown', this.ballPointerHandler);
    // Only BGM while playing Ball Toss.
    this.sound.getAllPlaying().forEach(s => { if (s.key && /bgm|music/i.test(s.key)) { try{s.stop();}catch(e){} } });
    try { this.music = this.sound.add('balltoss-bgm',{loop:true,volume:this.mainScene ? this.mainScene.musicVolume : .5}); this.music.play(); } catch(e) {}
    this.updateDebugStatus();
    this.events.once('shutdown', () => this.cleanup());
  }
  playBallTouchSound() {
    if (this.ended) return;
    try { this.sound.play('balltoss-hit'); } catch (e) {}
  }
  // Ball speed increases by 0.0125x for every successful return.
  getBallSpeedMultiplier() { return 1 + (Math.max(0, this.score || 0) * 0.0125); }
  updateDebugStatus(message) {
    if (this.status && message) this.status.setText(message);
    if (this.debugStatus) this.debugStatus.setText(`Rallies: ${this.score}  •  Speed: ${this.getBallSpeedMultiplier().toFixed(2)}x`);
  }
  startSlowRandomWalk() {
    this.stopSlowRandomWalk();
    const wander = () => {
      if (this.ended || !this.megu || !this.megu.active || !this.awaitingReturn) return;
      const dx = Phaser.Math.Between(-24, 24), dy = Phaser.Math.Between(-12, 12);
      const tx = Phaser.Math.Clamp(this.megu.x + dx, 36, W - 36);
      const yBounds = this.getMeguYBounds();
      const centerY = this.getMeguCenterY();
      const ty = Phaser.Math.Clamp(centerY + dy, Math.max(yBounds.min, Math.floor(640 * 0.55)), yBounds.max);
      const distance = Phaser.Math.Distance.Between(this.megu.x, centerY, tx, ty);
      if (distance < 3) { this.idleWalkTimer = this.time.delayedCall(Phaser.Math.Between(500, 1200), wander); return; }
      this.meguRenderer?.setFlipX(tx > this.megu.x);
      const duration = Phaser.Math.Between(1400, 2600);
      this.meguRenderer?.playAnimation('walking');
      this.meguRenderer?.tweenTo({ x: tx, y: ty + this.getMeguHalfHeight() }, { duration, ease: 'Linear', onComplete: () => { if (!this.ended && this.awaitingReturn) { this.meguRenderer?.setState(MeguRenderer.STATES.STANDING_1); this.idleWalkTimer = this.time.delayedCall(Phaser.Math.Between(500, 1400), wander); } } });
    };
    this.idleWalkTimer = this.time.delayedCall(250, wander);
  }
  stopSlowRandomWalk() {
    if (this.idleWalkTimer) { this.idleWalkTimer.remove(false); this.idleWalkTimer = null; }
    this.meguRenderer?.killTweens();
    if (this.meguRenderer) this.meguRenderer.setState(MeguRenderer.STATES.STANDING_1);
  }
  getBallFlightDuration() {
    // Start at the current 1300ms base duration; speed rises gradually each rally
    // and reaches 2x at rally 80 (half the original flight duration).
    return Math.max(90, 1300 / this.getBallSpeedMultiplier());
  }
  throwBallToMegu(x,y) {
    this.awaitingReturn = false;
    this.stopSlowRandomWalk();
    this.ballInFlight = true; this.updateDebugStatus('Your throw!');
    const targetX = Phaser.Math.Clamp(x,180,570), targetY = this.clampMeguY(Phaser.Math.Clamp(y,300,570));
    // Calculate the landing point first, then move the ball and MEGU at the same time.
    const startX = this.ball.x, startY = this.ball.y;
    const flightDuration = this.getBallFlightDuration();
    this.chaseBall(targetX,targetY,flightDuration);
    this.animateArc(startX,startY,targetX,targetY,flightDuration,() => {
      if (this.ended) return;
      this.ball.setPosition(targetX,targetY);
      this.playBallTouchSound(); // MEGU makes contact with the ball.
      if (Phaser.Math.Distance.Between(this.megu.x,this.getMeguCenterY(),targetX,targetY) <= 24) {
        this.setMeguCenterPosition(targetX,targetY); this.meguRenderer?.setState(MeguRenderer.STATES.STANDING_1);
        this.throwBack();
      } else {
        this.finish();
      }
    },1.5,0.5);
  }
  animateArc(x1,y1,x2,y2,duration,onComplete,scaleStart=0.5,scaleEnd=1.5) {
    // Each flight gets a token so a mid-air click can interrupt the return flight.
    const token = ++this.ballFlightToken;
    const steps = Math.max(8, Math.round(duration / 55));
    let step = 0;
    const tick = () => {
      if (this.ended || !this.ball || !this.ball.active || token !== this.ballFlightToken) return;
      step++;
      const t = Math.min(1, step / steps);
      const arcHeight = 118;
      this.ball.setPosition(
        Phaser.Math.Linear(x1, x2, t),
        Phaser.Math.Linear(y1, y2, t) - Math.sin(Math.PI * t) * arcHeight
      );
      // Apply continuous spin in degrees per second, rather than snapping to an angle.
      this.ball.setAngle(this.ball.angle + this.ballAngularVelocity * (55 / 1000));
      const depthScale = Phaser.Math.Linear(scaleStart, scaleEnd, t);
      const arcScale = 1 + Math.sin(Math.PI * t) * 0.256;
      this.ball.setScale(depthScale * arcScale);
        if (step >= steps) {
        this.ball.setPosition(x2,y2);
        this.ball.setScale(scaleEnd);
            onComplete();
      } else {
        this.time.delayedCall(55, tick);
      }
    };
    tick();
  }
  chaseBall(x,y,flightDuration=650) {
    if (this.ended) return;
    this.status.setText('MEGU is chasing!');
    this.updateDebugStatus();
    let chaseStep = 0;
    const chaseTick = () => {
      if (this.ended) return;
      const centerY = this.getMeguCenterY();
      const dx = x - this.megu.x, dy = y - centerY;
      const distance = Math.hypot(dx,dy);
      if (distance <= 24) {
        this.setMeguCenterPosition(x,y); this.meguRenderer?.setState(MeguRenderer.STATES.STANDING_1);
        return;
      }
      this.meguRenderer?.setFlipX(dx > 0);
      this.meguRenderer?.playAnimation('walking');
      // Chase movement scales with remaining distance: longer chases cover more
      // ground per tick, then naturally slow as MEGU approaches the landing point.
      // Occasionally add a burst so the chase speed is not perfectly uniform.
      const distanceRate = 0.18 * (650 / Math.max(90, flightDuration));
      const speedBurst = Math.random() < 0.28 ? Phaser.Math.FloatBetween(1.2, 1.55) : Phaser.Math.FloatBetween(0.88, 1.12);
      const stepSize = Math.min(distance * 0.68, distance * distanceRate * speedBurst);
      this.setMeguCenterPosition(this.megu.x + dx / distance * stepSize, centerY + dy / distance * stepSize);
      this.time.delayedCall(55, chaseTick);
    };
    chaseTick();
  }
  throwBack() {
    if (this.ended) return;
    this.meguRenderer?.setState(MeguRenderer.STATES.STANDING_1); this.updateDebugStatus('Click the ball in the air to return it!');
    const fromX=this.ball.x, fromY=this.ball.y;
    // Expand the return landing zone gradually as the rally grows. It starts
    // relatively compact, then spreads toward the side edges and farther upward.
    const spreadProgress = Phaser.Math.Clamp((this.score || 0) / 24, 0, 1);
    const horizontalMargin = Math.round(Phaser.Math.Linear(180, 48, spreadProgress));
    const upperLandingLimit = Math.round(Phaser.Math.Linear(500, 300, spreadProgress));
    const targetX = Phaser.Math.Between(horizontalMargin, W - horizontalMargin);
    const targetY = Phaser.Math.Between(upperLandingLimit, 640 - 48);
    this.ballInFlight=true; this.awaitingReturn=true;
    // A 40px circle hit area scales with the 80px ball container, matching its visible size.
    // Pointer hit-testing is handled by the scene-level handler using the
    // ball's current rendered bounds; do not attach a stale container hit area.
    this.startSlowRandomWalk();
    this.animateArc(fromX,fromY,targetX,targetY,this.getBallFlightDuration(),()=>{
      this.ball.setPosition(targetX,targetY); this.ball.setScale(1.5); this.ballInFlight=false;
      this.updateDebugStatus('Too late! Ball reached the final position.');
        // The player must click during the return flight, before the ball reaches its destination.
      if (this.awaitingReturn) this.finish();
    },0.5,1.5);
  }
  playerReturn() {
    this.stopSlowRandomWalk();
    // Keep the ball at the exact point where the player clicked it in mid-air.
    const launchX = this.ball.x, launchY = this.ball.y;
    // Invalidate the current return-to-player arc before starting the new throw.
    this.ballFlightToken++;
    this.ball.removeAllListeners('pointerdown'); this.ball.disableInteractive();
    this.ballInFlight=false;
    // Preserve the current mid-air scale at the exact click/launch point.
    this.ball.setPosition(launchX,launchY);
    const x=Phaser.Math.Between(210,560), y=Phaser.Math.Between(330,565);
    this.throwBallToMegu(x,y);
  }
  quit() {
    // A single transition owns the exit. Ignore pointer repeats and any
    // delayed completion callbacks after the first request.
    if (this.returned || this._quitInProgress || this._returnSequenceStarted) return;
    this._quitInProgress = true;
    this._returnSequenceStarted = true;
    this.ended = true;
    if (this._finishHoldTimer) { clearTimeout(this._finishHoldTimer); this._finishHoldTimer = null; }
    if (this._returnFallbackTimer) { clearTimeout(this._returnFallbackTimer); this._returnFallbackTimer = null; }
    // Disable input only for this scene. Phaser's InputManager is shared by
    // every scene; disabling it here can leave the paused Home scene unable to
    // receive iOS touch events after Ball Toss shuts down.
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    try { this.ballFlightToken = (this.ballFlightToken || 0) + 1; } catch (e) {}
    try { this.stopSlowRandomWalk(); } catch (e) {}
    try { if (this.time) this.time.removeAllEvents(); } catch (e) {}
    try { if (this.tweens) this.tweens.killAll(); } catch (e) {}

    let fadeStarted = false;
    try {
      const camera = this.cameras && this.cameras.main;
      if (camera) {
        camera.once('camerafadeoutcomplete', () => {
          if (!this.returned) this.returnHome();
        });
        camera.fadeOut(250, 0, 0, 0);
        fadeStarted = true;
      }
    } catch (e) { console.warn('Ball Toss quit fade failed', e); }
    // Fallback is mutually exclusive with the fade event via returnHome guard.
    this._quitFallbackTimer = setTimeout(() => {
      this._quitFallbackTimer = null;
      if (!this.returned) this.returnHome();
    }, fadeStarted ? 400 : 0);
  }
  finish() {
    if (this.ended || this.returned || this._returnSequenceStarted) return;
    this.stressGameCompleted = true;
    const previousBest = Math.max(0, Number(GAME_ATTRIBUTES.ballTossMaxRecord) || 0);
    if (this.score > previousBest) {
      GAME_ATTRIBUTES.ballTossMaxRecord = Math.max(0, Math.trunc(this.score));
      save();
      try { this.mainScene?.updateCurrentHonor?.(); this.mainScene?.updateGameAttributeDisplay?.(); } catch (e) {}
    }
    if (!this._normalHygieneCostApplied) { this._normalHygieneCostApplied = true; applyHygieneCost(this.pendingHygieneCost || 0, this.mainScene); }
    // Freeze Ball Toss movement first so its walk tween cannot overwrite the
    // requested ID{id}_9 end pose during the result hold.
    try { this.stopSlowRandomWalk(); } catch (e) {}
    try { if (this.idleWalkTimer) { this.idleWalkTimer.remove(false); this.idleWalkTimer = null; } } catch (e) {}
    this.ended = true;
    try { if (this.meguRenderer) this.meguRenderer.setState(MeguRenderer.STATES.VERY_SAD); } catch (e) {}
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    try { if (this.status) this.status.setText('Game over'); } catch (e) {}
    // The 3-second result hold applies only to normal game completion.
    this._finishHoldTimer = setTimeout(() => {
      this._finishHoldTimer = null;
      if (this._returnSequenceStarted || this.returned) return;
      this._returnSequenceStarted = true;
      let fadeStarted = false;
      const beginReturn = () => {
        if (this.returned) return;
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
      } catch (e) { console.warn('Ball Toss end fade failed', e); }
      this._returnFallbackTimer = setTimeout(beginReturn, fadeStarted ? 1000 : 0);
    }, 3000);
  }
  returnHome() {
    if (this.returned) return;
    this.returned = true;
    this._quitInProgress = false;
    if (this._quitFallbackTimer) { clearTimeout(this._quitFallbackTimer); this._quitFallbackTimer = null; }
    if (this._finishHoldTimer) { clearTimeout(this._finishHoldTimer); this._finishHoldTimer = null; }
    if (this._returnFallbackTimer) { clearTimeout(this._returnFallbackTimer); this._returnFallbackTimer = null; }
    const manager = this.game.scene;
    let main = null;
    try { main = manager.getScene('default'); } catch (e) {}

    // Stop Play Ball first; Phaser processes scene operations on its scene step.
    try { if (manager) manager.stop('BallTossMinigame'); } catch (e) {}

    // Retry Home recovery after the shutdown handoff, but never raise Home over
    // a different minigame if one has already been launched in the meantime.
    const recoverMain = () => {
      try {
        if (!manager || !main) return;
        const sumoActive = typeof manager.isActive === 'function' && manager.isActive('SumoMinigame');
        const ballActive = typeof manager.isActive === 'function' && manager.isActive('BallTossMinigame');
        if (sumoActive || ballActive) return;

        try {
          if (typeof manager.isSleeping === 'function' && manager.isSleeping('default')) manager.wake('default');
          else if (typeof manager.isPaused !== 'function' || manager.isPaused('default')) manager.resume('default');
        } catch (e) {}
        try { if (typeof manager.bringToTop === 'function') manager.bringToTop('default'); } catch (e) {}
        try {
          if (main.cameras && main.cameras.main) {
            // Home's camera was never faded out; only clear stale effects and
            // restore opacity. A fadeIn here creates an unnecessary flash.
            main.cameras.main.resetFX();
            main.cameras.main.setAlpha(1);
          }
        } catch (e) {}
        try {
          if (main.input) {
            // Re-enable the Home scene plugin and the shared manager only
            // after Ball Toss has been stopped and Home has resumed.
            main.input.enabled = true;
            if (main.input.manager) main.input.manager.enabled = true;
            if (typeof main.input.setTopOnly === 'function') main.input.setTopOnly(true);
          }
          if (main.time) main.time.paused = false;
          if (main.tweens && main.tweens.resumeAll) main.tweens.resumeAll();
          if (main.anims && main.anims.resumeAll) main.anims.resumeAll();
          if (main.meguRenderer) main.meguRenderer.setBodyVisible(!main.editMode);
          if (main.meguRenderer) main.meguRenderer.setEyesVisible(!main.editMode);
        } catch (e) {}
        try {
          if (main.bgmSound) {
            main.bgmSound.setVolume(main.musicVolume);
            if (!main.bgmSound.isPlaying) main.bgmSound.play();
          }
        } catch (e) {}
        if (this.stressGameCompleted && typeof main.completeStressAction === 'function' && main.time) main.time.delayedCall(350, () => main.completeStressAction('ballToss'));
      } catch (e) { console.warn('BallTossMinigame: Home recovery failed', e); }
    };
    // Run recovery once after Phaser processes the scene stop; avoid stacking
    // multiple home-camera fade-ins (the source of the quit-screen flashing).
    setTimeout(() => {
      if (this._homeRecoveryStarted) return;
      this._homeRecoveryStarted = true;
      recoverMain();
    }, 120);
  }
  cleanup(){
    if (this._finishHoldTimer) { clearTimeout(this._finishHoldTimer); this._finishHoldTimer = null; }
    if (this._returnFallbackTimer) { clearTimeout(this._returnFallbackTimer); this._returnFallbackTimer = null; }
    if (this._quitFallbackTimer) { clearTimeout(this._quitFallbackTimer); this._quitFallbackTimer = null; }
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    try { if (this.time) this.time.removeAllEvents(); } catch (e) {}
    try { if (this.tweens) this.tweens.killAll(); } catch (e) {}
    try { if (this.ballPointerHandler && this.input) this.input.off('pointerdown', this.ballPointerHandler); } catch (e) {}
    this.ballPointerHandler = null;
    if(this.music){try{this.music.stop();this.music.destroy();}catch(e){}}
    try { this.meguRenderer?.destroy(); } catch (e) {}
    this.meguRenderer = null;
    (this.objects||[]).forEach(o=>{try{o.destroy();}catch(e){}}); this.objects=[];
  }
}
