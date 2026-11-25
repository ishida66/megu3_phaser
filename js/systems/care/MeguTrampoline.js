/* Gym trampoline: five-second, fixed-step jumps without a character shadow. */
Object.assign(Main.prototype, {
  startMeguTrampoline() {
    const renderer = this.meguRenderer;
    if (!this.gymActive || this.gymClosing || !this.pet || !renderer || renderer.destroyed ||
        !this.textures.exists('megu-gym-trampoline')) return;
    this.stopMeguTrampoline();
    this.stopMeguTreadmill();
    this.stopMeguPunchingBag();
    this.stopMeguBarbell();
    this.stopMeguBallBalance();
    this.meguDance = null;
    renderer.killTweens();
    renderer.endJump();
    renderer.lockedPosition = null;
    renderer.setRotation(0);

    // Image is centered horizontally; the top of its original bounds is y=475.
    const trampoline = this.add.image(320, 475, 'megu-gym-trampoline')
      .setOrigin(0.5, 0).setDepth(50000.75).setScrollFactor(0);
    const groundY = trampoline.y + 5;
    const spriteHeight = renderer.sprite.displayHeight || 128;
    // Variable jump peaks, all <= 1.2x the character's rendered height.
    const heights = [0.55, 0.9, 0.7, 1.2, 0.8].map(mult => spriteHeight * mult);
    const durations = [900, 950, 900, 1150, 1100]; // exactly 5000ms
    const jumps = [];
    let cursor = 0;
    durations.forEach((duration, index) => {
      jumps.push({ start: cursor, duration, height: heights[index],
        pose: index === 1 ? 'happy' : index === 3 ? 'veryHappy' : 'jump' });
      cursor += duration;
    });
    this.meguTrampoline = {
      trampoline, start: this.time.now, groundY, x: trampoline.x,
      jumps, lastTick: -1, facing: Number(this.look) > 0
    };
    renderer.setDepth(50001, 50000.5);
    const shadowWasVisible = !!(renderer.shadow?.active && renderer.shadow.visible);
    this.meguTrampoline.shadowWasVisible = shadowWasVisible;
    renderer.setShadowVisible(false);
    renderer.setPosition(trampoline.x, groundY);
    renderer.setState(MeguRenderer.STATES.WALKING_1);
  },

  updateMeguTrampoline(time, delta, renderer = this.meguRenderer) {
    const run = this.meguTrampoline;
    if (!run || !renderer || renderer.destroyed) return false;
    const elapsed = Math.max(0, time - run.start);
    if (elapsed >= 5000) {
      this.stopMeguTrampoline();
      renderer.setPosition(this.pet.x, this.pet.y);
      renderer.setFlipX(Number(this.look) > 0);
      renderer.playAnimation('standing');
      renderer.update(time, delta);
      return true;
    }
    // Every visual property holds between 50ms ticks (20fps); no tweening.
    const tick = Math.floor(elapsed / 50);
    if (tick === run.lastTick) return true;
    run.lastTick = tick;
    const discreteElapsed = tick * 50;
    const jump = run.jumps.find(j => discreteElapsed >= j.start && discreteElapsed < j.start + j.duration) || run.jumps[run.jumps.length - 1];
    const phase = Math.min(1, (discreteElapsed - jump.start) / jump.duration);
    const lift = Math.round(jump.height * 4 * phase * (1 - phase));
    const contact = phase < 0.11 || phase > 0.89;
    const compression = contact ? (phase < 0.11 ? 1 - phase / 0.11 : (phase - 0.89) / 0.11) : 0;
    // Compress the trampoline on contact and spring back at takeoff.
    run.trampoline.setScale(1 + compression * 0.045, 1 - compression * 0.11);
    run.trampoline.setY(475 + Math.round(compression * 4));

    // Alternate jumping frames and happy poses without aerial rotation.
    if (contact) {
      renderer.setState(tick % 2 ? MeguRenderer.STATES.WALKING_1 : MeguRenderer.STATES.WALKING_2);
    } else if (jump.pose === 'happy') {
      renderer.setState(MeguRenderer.STATES.HAPPY);
    } else if (jump.pose === 'veryHappy' && (phase < 0.3 || phase > 0.7)) {
      renderer.setState(MeguRenderer.STATES.VERY_HAPPY);
    } else {
      renderer.setState(tick % 2 ? MeguRenderer.STATES.WALKING_1 : MeguRenderer.STATES.WALKING_2);
    }
    // Trampoline-only exception: emotional poses lock position in MeguRenderer.
    // Clear that lock after selecting the pose so the jump arc continues.
    renderer.lockedPosition = null;
    renderer.setPosition(run.x, run.groundY - lift);
    // Change facing direction only while airborne, using discrete side switches.
    // No sprite rotation or somersault: MEGU stays upright.
    const airborneTurn = !contact && (jump === run.jumps[1] || jump === run.jumps[3]) && phase >= 0.45;
    renderer.setFlipX(airborneTurn ? !run.facing : run.facing);
    renderer.update(time, delta);
    // Hide the character shadow throughout the routine.
    renderer.setShadowVisible(false);
    return true;
  },

  stopMeguTrampoline() {
    const run = this.meguTrampoline;
    if (!run) return;
    if (run.trampoline?.active) run.trampoline.destroy();
    this.meguTrampoline = null;
    if (this.meguRenderer && !this.meguRenderer.destroyed) {
      this.meguRenderer.setRotation(0);
      this.meguRenderer.lockedPosition = null;
      this.meguRenderer.setShadowVisible(run.shadowWasVisible);
    }
  }
});
