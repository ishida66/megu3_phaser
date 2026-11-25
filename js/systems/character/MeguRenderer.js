/* ===== Merged from MeguRenderer.js ===== */
// Shared MEGU character renderer. Loaded before the game entry script.
// Exposed on window to preserve classic-script and file:// compatibility.
window.MeguRenderer = class MeguRenderer {
  static STATES = Object.freeze({
    WALKING_1: 'walking_1', WALKING_2: 'walking_2', JUMP: 'jump',
    STANDING_1: 'standing_1', STANDING_2: 'standing_2',
    EYES_OPEN: 'eyes_open', EYES_CLOSED: 'eyes_closed',
    VERY_SAD: 'very_sad', VERY_HAPPY: 'very_happy', HAPPY: 'happy',
    WORRIED: 'worried', SAD: 'sad'
  });
  static FRAME_SUFFIX = Object.freeze({
    walking_1: 3, walking_2: 4, standing_1: 5, standing_2: 6,
    eyes_open: 7, eyes_closed: 8, very_sad: 9, very_happy: 10,
    happy: 11, worried: 12, sad: 13
  });
  static EMOTIONAL_STATES = new Set(['very_sad', 'very_happy', 'happy', 'worried', 'sad']);
  static DEFAULT_SHADOW = Object.freeze({
    widthRatio: 0.62, height: 13, yOffset: 3,
    color: 0x101010, alpha: 0.27, followSpriteScale: true, followSpritePosition: true, scaleX: 1, scaleY: 1
  });
  static ANIMATIONS = Object.freeze({
    walking: Object.freeze({ states: ['walking_1', 'walking_2'], frameDuration: 180, loop: true }),
    standing: Object.freeze({ states: ['standing_1', 'standing_2'], frameDuration: 500, loop: true })
  });

  constructor(scene, options = {}) {
    this.scene = scene;
    this.atlasKey = String(options.atlasKey || '');
    this.framePrefix = String(options.framePrefix || this.atlasKey);
    this.state = null;
    this.destroyed = false;
    this.lockedPosition = null;
    this.isJumping = false;
    this.jumpGroundY = null;
    this.jumpLift = 0;
    this.jumpHeightRatio = 0;
    this.animation = null;
    this.animationFrameIndex = 0;
    this.animationElapsed = 0;
    this.animationFrameDuration = 0;
    this.animationLoop = true;
    this.nextBlinkAt = scene.time ? scene.time.now + Phaser.Math.Between(1800, 4200) : 1800;
    this.blinkUntil = 0;
    this.originX = options.originX ?? 0.5;
    this.originY = options.originY ?? 1;
    this.depth = options.depth ?? 10;
    this.flipX = !!options.flipX;
    // Shadows are renderer-owned by default. Pass shadow:false only when a
    // scene deliberately supplies its own custom ground shadow.
    this.shadowOptions = options.shadow === false ? null : {
      ...MeguRenderer.DEFAULT_SHADOW,
      ...(options.shadow && typeof options.shadow === 'object' ? options.shadow : {})
    };
    this.autoUpdate = options.autoUpdate !== false;
    this.manualAnimation = false;
    const atlas = this.atlasKey && scene.textures.exists(this.atlasKey) ? scene.textures.get(this.atlasKey) : null;
    if (!atlas) throw new Error(`[MeguRenderer] Character atlas not available: ${this.atlasKey}`);
    this.frames = {};
    for (const [state, suffix] of Object.entries(MeguRenderer.FRAME_SUFFIX)) {
      const candidates = [`${this.framePrefix}_${suffix}-2x`, `${this.framePrefix}_${suffix}`];
      this.frames[state] = candidates.find(frame => atlas.has(frame)) || null;
    }
    if (!this.frames.walking_1 && !this.frames.walking_2 && !this.frames.standing_1 && !this.frames.standing_2) {
      throw new Error(`[MeguRenderer] No usable character frames in atlas: ${this.atlasKey}`);
    }
    const initialState = options.state || MeguRenderer.STATES.STANDING_1;
    const initialFrame = this.frames[initialState] || this.frames.standing_1 || this.frames.standing_2 || this.frames.walking_1 || this.frames.walking_2;
    this.sprite = options.sprite || scene.add.sprite(options.x ?? 0, options.y ?? 0, this.atlasKey, initialFrame);
    this.sprite.setTexture(this.atlasKey, initialFrame).setOrigin(this.originX, this.originY).setDepth(this.depth).setFlipX(this.flipX);
    this.overlay = options.overlay || (this.frames.eyes_open
      ? scene.add.sprite(this.sprite.x, this.sprite.y, this.atlasKey, this.frames.eyes_open)
          .setOrigin(this.originX, this.originY).setDepth(this.depth + 0.01).setFlipX(this.flipX).setVisible(false)
      : null);
    this.blink = options.blink || (this.frames.eyes_closed
      ? scene.add.sprite(this.sprite.x, this.sprite.y, this.atlasKey, this.frames.eyes_closed)
          .setOrigin(this.originX, this.originY).setDepth(this.depth + 0.02).setFlipX(this.flipX).setVisible(false)
      : null);

    // Keep the body and eye layers inside one Phaser Container. Phaser sorts
    // the container as a single display object, so no scene sprite can ever
    // be inserted between the body and its eyes. Within the container, the
    // body is hard-coded at local depth 0 and both eye layers at local depth 1.
    this.layer = scene.add.container(0, 0);
    this.sprite.setDepth(0);
    if (this.overlay) this.overlay.setDepth(1);
    if (this.blink) this.blink.setDepth(1);
    this.layer.add([this.sprite, this.overlay, this.blink].filter(Boolean));
    this.layer.setDepth(this.depth);

    this.shadow = null;
    if (this.shadowOptions) {
      const scaleX = this.shadowOptions.followSpriteScale ? Math.abs(this.sprite.scaleX || 1) : Math.abs(this.shadowOptions.scaleX || 1);
      const scaleY = this.shadowOptions.followSpriteScale ? Math.abs(this.sprite.scaleY || 1) : Math.abs(this.shadowOptions.scaleY || 1);
      const width = Math.max(1, (this.sprite.width || 64) * scaleX * this.shadowOptions.widthRatio);
      const shadowX = this.shadowOptions.followSpritePosition
        ? this.sprite.x + (this.originX === 0 ? this.sprite.displayWidth / 2 : 0)
        : (Number.isFinite(this.shadowOptions.anchorX) ? this.shadowOptions.anchorX : this.sprite.x);
      const shadowGroundY = this.shadowOptions.followSpritePosition
        ? this.sprite.y
        : (Number.isFinite(this.shadowOptions.anchorY) ? this.shadowOptions.anchorY : this.sprite.y);
      this.shadow = scene.add.ellipse(
        shadowX,
        shadowGroundY - this.shadowOptions.yOffset,
        width, this.shadowOptions.height * scaleY,
        this.shadowOptions.color, this.shadowOptions.alpha
      ).setDepth(this.depth - 0.01);
    }
    this.setState(initialState);
    if (this.autoUpdate) scene.events.on('update', this.update, this);
  }

  setAtlas(atlasKey, framePrefix = atlasKey) {
    const key = String(atlasKey || '');
    const atlas = key && this.scene.textures.exists(key) ? this.scene.textures.get(key) : null;
    if (!atlas) return false;
    this.atlasKey = key;
    this.framePrefix = String(framePrefix || key);
    for (const [state, suffix] of Object.entries(MeguRenderer.FRAME_SUFFIX)) {
      const candidates = [`${this.framePrefix}_${suffix}-2x`, `${this.framePrefix}_${suffix}`];
      this.frames[state] = candidates.find(frame => atlas.has(frame)) || null;
    }
    const state = this.frames.standing_1 ? MeguRenderer.STATES.STANDING_1 :
      (this.frames.standing_2 ? MeguRenderer.STATES.STANDING_2 :
        (this.frames.walking_1 ? MeguRenderer.STATES.WALKING_1 : MeguRenderer.STATES.WALKING_2));
    const frame = this.frames[state] || this.frames.standing_2 || this.frames.walking_1 || this.frames.walking_2;
    if (!frame) return false;
    this.stopAnimation();
    this.lockedPosition = null;
    this.sprite.setTexture(key, frame);
    if (this.overlay && this.frames.eyes_open) this.overlay.setTexture(key, this.frames.eyes_open);
    if (this.blink && this.frames.eyes_closed) this.blink.setTexture(key, this.frames.eyes_closed);
    this.state = state;
    this.syncEyes(false);
    return true;
  }

  setState(state) {
    if (this.destroyed || !Object.values(MeguRenderer.STATES).includes(state)) return false;
    if (state === MeguRenderer.STATES.JUMP) return this.startJump();
    if (this.isJumping) this.endJump();
    if (state === MeguRenderer.STATES.EYES_OPEN || state === MeguRenderer.STATES.EYES_CLOSED) {
      // Eye states are overlays, never independent base-body states.
      if (!this.isStanding()) return false;
      this.blinkUntil = state === MeguRenderer.STATES.EYES_CLOSED ? (this.scene.time ? this.scene.time.now + 120 : 120) : 0;
      this.syncEyes(state === MeguRenderer.STATES.EYES_CLOSED);
      return true;
    }
    if (!this.animation && this.state === state) return true;
    this.stopAnimation();
    return this.applyBaseState(state);
  }

  // Begin an airborne state. The body animates with the existing walk frames;
  // the renderer keeps the ground anchor separately so the shadow never follows
  // the body upward. Call setJumpHeight() each frame, then setState() to land.
  startJump(groundY = this.sprite?.y) {
    if (this.destroyed || !this.sprite) return false;
    if (this.isJumping) return true;
    if (!this.isJumping) {
      this.isJumping = true;
      this.jumpGroundY = !this.shadowOptions?.followSpritePosition && Number.isFinite(this.shadowOptions?.anchorY)
        ? this.shadowOptions.anchorY
        : (Number.isFinite(groundY) ? groundY : this.sprite.y);
      this.jumpLift = 0;
      this.jumpHeightRatio = 0;
    }
    this.stopAnimation();
    this.playAnimation('walking');
    this.state = MeguRenderer.STATES.JUMP;
    this.syncEyes(false);
    this.update();
    return true;
  }

  setJumpHeight(lift, heightRatio = 0) {
    if (this.destroyed || !this.isJumping || !this.sprite) return false;
    this.jumpLift = Math.max(0, Number(lift) || 0);
    this.jumpHeightRatio = Phaser.Math.Clamp(Number(heightRatio) || 0, 0, 1);
    this.sprite.setY(this.jumpGroundY - this.jumpLift);
    this.update();
    return true;
  }

  endJump() {
    if (!this.isJumping) return false;
    this.sprite.setY(this.jumpGroundY);
    this.isJumping = false;
    this.jumpGroundY = null;
    this.jumpLift = 0;
    this.jumpHeightRatio = 0;
    this.update();
    return true;
  }

  applyBaseState(state) {
    const frame = this.frames[state];
    if (!frame) return false;
    if (MeguRenderer.EMOTIONAL_STATES.has(state)) {
      this.lockedPosition = { x: this.sprite.x, y: this.sprite.y };
      try { this.scene.tweens.killTweensOf(this.sprite); } catch (e) {}
    } else {
      this.lockedPosition = null;
    }
    this.state = state;
    this.sprite.setFrame(frame);
    this.blinkUntil = 0;
    this.syncEyes(false);
    return true;
  }

  playAnimation(name, options = {}) {
    if (this.destroyed) return false;
    const definition = MeguRenderer.ANIMATIONS[name];
    if (!definition) return false;
    const states = definition.states.filter(state => this.frames[state]);
    if (!states.length) return false;
    const manual = options.manual === true;
    const duration = Math.max(1, Number(options.frameDuration ?? definition.frameDuration));
    if (this.animation === name && this.manualAnimation === manual && this.animationFrameDuration === duration) return true;
    this.animation = name;
    this.animationStates = states;
    this.animationFrameIndex = 0;
    this.animationElapsed = 0;
    this.animationFrameDuration = duration;
    this.animationLoop = options.loop ?? definition.loop;
    this.manualAnimation = manual;
    return this.applyBaseState(states[0]);
  }

  setAnimationFrameDuration(duration) {
    if (!this.animation) return false;
    const value = Number(duration);
    if (!Number.isFinite(value) || value <= 0) return false;
    this.animationFrameDuration = Math.max(1, value);
    return true;
  }

  advanceAnimationFrame() {
    if (!this.animation || !this.manualAnimation || !this.animationStates || this.animationStates.length < 2 || this.lockedPosition) return false;
    this.animationFrameIndex = (this.animationFrameIndex + 1) % this.animationStates.length;
    const state = this.animationStates[this.animationFrameIndex];
    this.state = state;
    this.sprite.setFrame(this.frames[state]);
    this.syncEyes(false);
    return true;
  }

  stopAnimation() {
    this.animation = null;
    this.animationStates = null;
    this.animationFrameIndex = 0;
    this.animationElapsed = 0;
    this.manualAnimation = false;
  }

  isStanding() {
    return this.state === MeguRenderer.STATES.STANDING_1 || this.state === MeguRenderer.STATES.STANDING_2;
  }

  hasState(state) {
    return !!this.frames[state];
  }

  // Set an exact atlas frame for editors/previews that cycle through poses
  // outside the standard animation state machine.
  setCustomFrame(frameName) {
    if (this.destroyed || !this.scene.textures.exists(this.atlasKey) ||
        !this.scene.textures.get(this.atlasKey).has(frameName)) return false;
    this.stopAnimation();
    this.lockedPosition = null;
    this.sprite.setFrame(frameName);
    const suffix = String(frameName).match(/_(\d+)(?:-2x)?$/)?.[1];
    const state = Object.entries(MeguRenderer.FRAME_SUFFIX).find(([, value]) => String(value) === suffix)?.[0] || null;
    this.state = state;
    this.blinkUntil = 0;
    this.syncEyes(false);
    return true;
  }

  setEyeOverlayVisible(visible) {
    if (this.destroyed || !this.overlay) return false;
    const show = !!visible && this.isStanding() && !!this.sprite.visible;
    this.syncOverlayTransform(this.overlay);
    this.overlay.setVisible(show);
    if (this.blink) this.blink.setVisible(false);
    return show;
  }

  isMovementLocked() {
    return !!this.lockedPosition;
  }

  syncOverlayTransform(overlay, depthOffset = 0) {
    if (!overlay || !this.sprite) return;
    // Eye layers must inherit the body's complete transform. This matters for
    // minigames such as Jump Rope that squash/stretch and rotate the body sprite.
    overlay.setPosition(this.sprite.x, this.sprite.y)
      .setScale(this.sprite.scaleX, this.sprite.scaleY)
      .setRotation(this.sprite.rotation)
      .setFlipX(this.sprite.flipX)
      .setFlipY(this.sprite.flipY)
      .setAlpha(this.sprite.alpha)
      .setDepth(1);
  }

  syncEyes(closed = false) {
    const standing = this.isStanding() && !!(this.sprite && this.sprite.visible);
    const showClosed = standing && closed && !!this.blink;
    if (this.overlay) {
      this.syncOverlayTransform(this.overlay, 0.01);
      this.overlay.setVisible(standing && !showClosed);
    }
    if (this.blink) {
      this.syncOverlayTransform(this.blink, 0.02);
      this.blink.setVisible(showClosed);
    }
    // Standing always has one visible eye layer. If no closed-eye frame exists,
    // the open-eye overlay remains visible throughout the idle state.
    if (standing && !this.overlay) {
      console.warn('[MeguRenderer] Standing requires an eyes-open (_7) atlas frame:', this.atlasKey);
    }
  }

  setPosition(x, y) {
    if (this.destroyed || this.lockedPosition) return false;
    if (this.isJumping) {
      this.jumpGroundY = y;
      this.sprite.setPosition(x, y - this.jumpLift);
    } else this.sprite.setPosition(x, y);
    this.update();
    return true;
  }

  setScale(x, y = x) {
    if (this.destroyed || !this.sprite) return false;
    this.sprite.setScale(x, y);
    this.update();
    return true;
  }

  setRotation(rotation) {
    if (this.destroyed || !this.sprite) return false;
    this.sprite.setRotation(rotation);
    this.update();
    return true;
  }

  setVisible(visible) {
    if (this.destroyed || !this.layer) return false;
    this.layer.setVisible(!!visible);
    if (visible) this.syncEyes(!!(this.blink && this.blink.visible));
    return true;
  }

  setBodyVisible(visible) {
    if (this.destroyed || !this.sprite) return false;
    this.sprite.setVisible(!!visible);
    this.syncEyes(false);
    return true;
  }

  setEyesVisible(visible) {
    if (this.destroyed) return false;
    if (visible) this.syncEyes(false);
    else {
      if (this.overlay) this.overlay.setVisible(false);
      if (this.blink) this.blink.setVisible(false);
    }
    return true;
  }

  setFlipX(value) {
    if (this.destroyed) return;
    this.flipX = !!value;
    this.sprite.setFlipX(this.flipX);
    this.syncEyes(this.blink && this.blink.visible);
  }

  setFlipY(value) {
    if (this.destroyed || !this.sprite) return false;
    this.sprite.setFlipY(!!value);
    this.update();
    return true;
  }

  setAlpha(alpha) {
    if (this.destroyed || !this.sprite) return false;
    this.sprite.setAlpha(alpha);
    if (this.overlay) this.overlay.setAlpha(alpha);
    if (this.blink) this.blink.setAlpha(alpha);
    this.update();
    return true;
  }

  setDepth(depth, shadowDepth = depth - 0.01) {
    if (this.destroyed || !this.layer) return false;
    this.layer.setDepth(depth);
    if (this.shadow && this.shadow.active) this.shadow.setDepth(shadowDepth);
    return true;
  }

  setShadowVisible(visible) {
    if (this.destroyed || !this.shadow || !this.shadow.active) return false;
    this.shadow.setVisible(!!visible);
    return true;
  }

  tweenTo(properties, config = {}) {
    if (this.destroyed || !this.sprite || !this.scene?.tweens) return null;
    return this.scene.tweens.add({ ...config, targets: this.sprite, ...properties });
  }

  killTweens() {
    if (this.destroyed || !this.sprite || !this.scene?.tweens) return false;
    this.scene.tweens.killTweensOf(this.sprite);
    return true;
  }

  setTint(color) {
    if (this.destroyed || !this.sprite) return false;
    this.sprite.setTint(color);
    return true;
  }

  clearTint() {
    if (this.destroyed || !this.sprite) return false;
    this.sprite.clearTint();
    return true;
  }

  update(time, delta) {
    if (this.destroyed || !this.sprite || !this.sprite.active) return;
    const now = Number.isFinite(time) ? time : (this.scene.time ? this.scene.time.now : 0);
    const elapsed = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 250)) : 0;
    if (this.animation && !this.manualAnimation && this.animationStates && this.animationStates.length > 1 && !this.lockedPosition) {
      this.animationElapsed += elapsed;
      while (this.animationElapsed >= this.animationFrameDuration) {
        this.animationElapsed -= this.animationFrameDuration;
        if (this.animationFrameIndex + 1 >= this.animationStates.length) {
          if (!this.animationLoop) { this.stopAnimation(); break; }
          this.animationFrameIndex = 0;
        } else this.animationFrameIndex++;
        const state = this.animationStates[this.animationFrameIndex];
        this.state = this.isJumping ? MeguRenderer.STATES.JUMP : state;
        this.sprite.setFrame(this.frames[state]);
      }
    }
    if (this.lockedPosition) this.sprite.setPosition(this.lockedPosition.x, this.lockedPosition.y);
    const standing = this.isStanding();
    if (!standing) {
      this.blinkUntil = 0;
      this.nextBlinkAt = now + Phaser.Math.Between(1800, 4200);
    } else {
      if (this.blinkUntil && now >= this.blinkUntil) this.blinkUntil = 0;
      if (!this.blinkUntil && now >= this.nextBlinkAt) {
        this.blinkUntil = now + 120;
        this.nextBlinkAt = now + Phaser.Math.Between(2200, 5000);
      }
      this.syncEyes(!!this.blinkUntil);
    }
    if (this.shadow && this.shadow.active && this.shadowOptions) {
      const followsPosition = this.shadowOptions.followSpritePosition !== false;
      const x = followsPosition
        ? this.sprite.x + (this.originX === 0 ? this.sprite.displayWidth / 2 : 0)
        : (Number.isFinite(this.shadowOptions.anchorX) ? this.shadowOptions.anchorX : this.sprite.x);
      const scaleX = this.shadowOptions.followSpriteScale ? Math.abs(this.sprite.scaleX || 1) : Math.abs(this.shadowOptions.scaleX || 1);
      const scaleY = this.shadowOptions.followSpriteScale ? Math.abs(this.sprite.scaleY || 1) : Math.abs(this.shadowOptions.scaleY || 1);
      const groundY = this.isJumping
        ? this.jumpGroundY
        : (followsPosition ? this.sprite.y : (Number.isFinite(this.shadowOptions.anchorY) ? this.shadowOptions.anchorY : this.sprite.y));
      // At the jump apex the shadow is 65% of its normal size. Its ground
      // position remains fixed while the body rises and falls above it.
      const shadowScale = this.isJumping ? 1 - 0.35 * this.jumpHeightRatio : 1;
      this.shadow.setPosition(x, groundY - this.shadowOptions.yOffset)
        .setDisplaySize(
          Math.max(1, this.sprite.width * scaleX * this.shadowOptions.widthRatio * shadowScale),
          Math.max(1, this.shadowOptions.height * scaleY * shadowScale)
        );
    }
    if (this.overlay && this.overlay.active) this.syncOverlayTransform(this.overlay, 0.01);
    if (this.blink && this.blink.active) this.syncOverlayTransform(this.blink, 0.02);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.autoUpdate) this.scene.events.off('update', this.update, this);
    if (this.layer && this.layer.active) this.layer.destroy(true);
    if (this.shadow && this.shadow.active) this.shadow.destroy();
    this.layer = null;
    this.sprite = this.overlay = this.blink = this.shadow = null;
  }
};
