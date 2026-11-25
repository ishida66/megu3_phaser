/* Gym treadmill: deterministic, discrete six-second walk/run/exhaustion routine. */
Object.assign(Main.prototype, {
  startMeguTreadmill() {
    const renderer = this.meguRenderer;
    if (!this.gymActive || this.gymClosing || !this.pet || !renderer || renderer.destroyed ||
        !this.textures.exists('megu-gym-treadmill')) return;
    this.stopMeguTreadmill();
    this.stopMeguPunchingBag();
    this.stopMeguBarbell();
    this.stopMeguBallBalance();
    this.meguDance = null;
    renderer.killTweens();
    renderer.endJump();
    renderer.lockedPosition = null;
    renderer.setRotation(0);

    // Coordinates are measured from the treadmill image's top-left corner.
    // The character's bottom-center is exactly (100, 180) in that space.
    const treadmill = this.add.image(220, 315, 'megu-gym-treadmill')
      .setOrigin(0, 0).setDepth(50000.75).setScrollFactor(0);
    this.meguTreadmill = {
      treadmill,
      start: this.time.now,
      x: treadmill.x + 100,
      y: treadmill.y + 180,
      lastStep: -1,
      lastPhase: -1,
      facing: true // Always face right while using the treadmill.
    };
    renderer.setDepth(50001, 50000.5);
    renderer.setFlipX(this.meguTreadmill.facing);
    renderer.playAnimation('walking', { manual: true });
    renderer.setPosition(this.meguTreadmill.x, this.meguTreadmill.y);
  },

  updateMeguTreadmill(time, delta, renderer = this.meguRenderer) {
    const run = this.meguTreadmill;
    if (!run || !renderer || renderer.destroyed) return false;
    const elapsed = Math.max(0, time - run.start);
    if (elapsed >= 6000) {
      this.stopMeguTreadmill();
      renderer.setPosition(this.pet.x, this.pet.y);
      renderer.setFlipX(Number(this.look) > 0);
      renderer.playAnimation('standing');
      renderer.update(time, delta);
      return true;
    }

    // 0–2s: 1x; 2–4s: 2x; 4–5s: 4x; 5–6s: very sad.
    const phase = elapsed < 2000 ? 0 : elapsed < 4000 ? 1 : elapsed < 5000 ? 2 : 3;
    if (phase === 3) {
      if (run.lastPhase !== phase) renderer.setState(MeguRenderer.STATES.VERY_SAD);
      run.treadmill.setY(run.y - 180);
      renderer.setPosition(run.x, run.y);
    } else {
      const frameMs = [180, 90, 45][phase];
      const phaseStart = [0, 2000, 4000][phase];
      const step = Math.floor((elapsed - phaseStart) / frameMs);
      if (run.lastPhase !== phase) {
        renderer.playAnimation('walking', { manual: true, frameDuration: frameMs });
        run.lastStep = -1;
      }
      if (step !== run.lastStep) {
        // No tweens or interpolated movement: alternating walking sprites and
        // treadmill/character vertical positions on the same discrete beat.
        renderer.setState(step % 2 ? MeguRenderer.STATES.WALKING_2 : MeguRenderer.STATES.WALKING_1);
        run.lastStep = step;
      }
      const lift = step % 2 ? -5 : 0;
      run.treadmill.setY(run.y - 180 + lift);
      renderer.setPosition(run.x, run.y + lift);
    }
    run.lastPhase = phase;
    renderer.setFlipX(run.facing);
    renderer.setRotation(0);
    renderer.update(time, delta);
    return true;
  },

  stopMeguTreadmill() {
    const run = this.meguTreadmill;
    if (!run) return;
    if (run.treadmill?.active) run.treadmill.destroy();
    this.meguTreadmill = null;
    if (this.meguRenderer && !this.meguRenderer.destroyed) {
      this.meguRenderer.setRotation(0);
      this.meguRenderer.lockedPosition = null;
    }
  }
});
