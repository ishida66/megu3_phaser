/* Gym barbell lifting routine: five repetitions, then two seconds of exhaustion. */
Object.assign(Main.prototype, {
  startMeguBarbell() {
    const renderer = this.meguRenderer;
    if (!this.gymActive || this.gymClosing || !this.pet || !renderer || renderer.destroyed) return;
    if (!this.textures.exists('megu-gym-barbell')) {
      console.warn('[Gym] Barbell image is not loaded: assets/minigame/barbell@2x.png');
      return;
    }
    this.stopMeguBarbell();
    this.stopMeguBallBalance();
    this.meguDance = null;
    renderer.killTweens();
    renderer.endJump();
    renderer.lockedPosition = null;
    renderer.setRotation(0);
    const x = this.pet.x;
    // MEGU is bottom-anchored. Place the barbell near the left side of its body,
    // using the rendered sprite width so the offset follows character scaling.
    const spriteWidth = renderer.sprite?.displayWidth || 128;
    const barbellX = x - spriteWidth * 0.36 - 30;
    const floorY = this.pet.y + 28;
    const barbell = this.add.image(barbellX, floorY, 'megu-gym-barbell')
      .setOrigin(0.5, 1).setDepth(50002).setScrollFactor(0);
    this.meguBarbell = { barbell, startedAt: this.time.now, x, barbellX, floorY,
      repetitionMs: 900, repetitions: 5, exhaustedMs: 2000 };
    renderer.setDepth(50001, 50000.5);
    renderer.setPosition(x, this.pet.y);
    renderer.setFlipX(false); // Left-facing for the entire routine.
    renderer.setState(MeguRenderer.STATES.WORRIED);
  },

  updateMeguBarbell(time, delta, renderer = this.meguRenderer) {
    const routine = this.meguBarbell;
    if (!routine || !renderer || renderer.destroyed) return false;
    const elapsed = Math.max(0, time - routine.startedAt);
    const liftingMs = routine.repetitionMs * routine.repetitions;
    renderer.setPosition(routine.x, this.pet.y);
    renderer.setRotation(0);
    renderer.setFlipX(false);
    if (elapsed < liftingMs) {
      // Spend 85% of each 900ms repetition lifting and 15% lowering.
      // Both halves ease at their endpoints to keep the motion continuous.
      const phase = (elapsed % routine.repetitionMs) / routine.repetitionMs;
      const ascentFraction = 0.85;
      const lift = phase < ascentFraction
        ? 0.5 - 0.5 * Math.cos(Math.PI * phase / ascentFraction)
        : 0.5 + 0.5 * Math.cos(Math.PI * (phase - ascentFraction) / (1 - ascentFraction));
      routine.barbell.setPosition(routine.barbellX, routine.floorY - lift * 105);
      renderer.setState(MeguRenderer.STATES.WORRIED);
    } else if (elapsed < liftingMs + routine.exhaustedMs) {
      routine.barbell.setPosition(routine.barbellX, routine.floorY);
      renderer.setState(MeguRenderer.STATES.VERY_SAD);
    } else {
      this.stopMeguBarbell();
      renderer.playAnimation('standing');
    }
    renderer.update(time, delta);
    return true;
  },

  stopMeguBarbell() {
    const routine = this.meguBarbell;
    if (!routine) return;
    if (routine.barbell?.active) routine.barbell.destroy();
    this.meguBarbell = null;
  }
});
