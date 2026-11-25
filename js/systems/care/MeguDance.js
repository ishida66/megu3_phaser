/* MeguDance: reusable choreography data and animation controller.
 * Load before room/mode scripts that call startMeguDance/updateMeguDance.
 */
// One five-second dance with a discrete jump, without backflips.
// Alternative choreography variants remain removed.
window.MEGU_DANCE_SEQUENCES = [[
  { pose: 'walk', x: -105, speed: 1.8 },
  { pose: 'happy', x: 35, speed: 1.0 },
  { pose: 'jump', x: 95, speed: 1.5 },
  { pose: 'veryHappy', x: -25, speed: 1.2 },
  { pose: 'idle', x: 0, speed: 0.8 }
]];

Object.assign(Main.prototype, {
  startMeguDance(sequenceOrIndex, options = {}) {
    if (!this.pet || !this.meguRenderer) return;
    const sequence = Array.isArray(sequenceOrIndex)
      ? sequenceOrIndex
      : MEGU_DANCE_SEQUENCES[sequenceOrIndex];
    if (!sequence) return;
    const renderer = this.meguRenderer;
    renderer.killTweens();
    renderer.endJump();
    renderer.setRotation(0);
    this.meguDance = {
      sequenceIndex: Array.isArray(sequenceOrIndex) ? null : sequenceOrIndex,
      sequence,
      duration: Number.isFinite(options.duration) ? Math.max(1, options.duration) : 5000,
      startedAt: this.time.now,
      stepIndex: -1,
      stepStartedAt: this.time.now,
      startX: this.pet.x,
      baseX: this.pet.x,
      baseY: this.pet.y,
      direction: Number(this.look) > 0 ? -1 : 1,
      jumpSpin: Math.random() < 0.5
    };
  },

  updateMeguDance(time, delta, renderer) {
    const dance = this.meguDance;
    if (!dance) return false;
    const actualElapsed = Math.max(0, time - dance.startedAt);
    if (actualElapsed >= dance.duration) {
      this.meguDance = null;
      renderer.endJump();
      renderer.lockedPosition = null;
      renderer.setRotation(0);
      renderer.setPosition(this.pet.x, dance.baseY);
      renderer.setFlipX(Number(this.look) > 0);
      renderer.playAnimation('standing', { frameDuration: 420 });
      this.pet.y = dance.baseY;
      return true;
    }

    // Advance the entire choreography on a fixed 50 ms grid (20 FPS).
    // Position, jump height, bobbing, and mirroring hold between ticks; no backflips.
    const discreteElapsed = Math.floor(actualElapsed / 50) * 50;
    time = dance.startedAt + discreteElapsed;
    const elapsed = discreteElapsed;
    const index = Math.min(4, Math.floor(elapsed / 1000));
    const step = dance.sequence[index];
    if (index !== dance.stepIndex) {
      dance.stepIndex = index;
      dance.stepStartedAt = time;
      dance.startX = this.pet.x;
      renderer.endJump();
      if (step.pose === 'walk') {
        renderer.playAnimation('walking', { frameDuration: Math.max(45, 145 / step.speed) });
      } else if (step.pose === 'happy') {
        renderer.setState(MeguRenderer.STATES.HAPPY);
        renderer.lockedPosition = null;
      } else if (step.pose === 'jump') {
        renderer.startJump(dance.baseY);
      } else if (step.pose === 'veryHappy') {
        renderer.setState(MeguRenderer.STATES.VERY_HAPPY);
        renderer.lockedPosition = null;
      } else {
        renderer.playAnimation('standing', { frameDuration: 260 });
      }
    }

    const stepElapsed = Math.min(1, Math.max(0, (time - dance.stepStartedAt) / 1000));
    const eased = stepElapsed < 0.5
      ? 2 * stepElapsed * stepElapsed
      : 1 - Math.pow(-2 * stepElapsed + 2, 2) / 2;
    const targetX = Phaser.Math.Clamp(dance.baseX + step.x, 55, W - 55);
    const speedCurve = Math.min(1, stepElapsed * Math.max(0.5, step.speed));
    const x = Phaser.Math.Linear(dance.startX, targetX, Math.min(1, eased * speedCurve + (step.speed > 1 ? stepElapsed * (step.speed - 1) * 0.22 : 0)));
    const bob = step.pose === 'walk' ? Math.sin(stepElapsed * Math.PI * 8) * 3 : 0;
    renderer.setPosition(x, dance.baseY + bob);
    this.pet.x = x;
    this.pet.y = dance.baseY;
    if (step.pose === 'jump') {
      const jumpPhase = stepElapsed * Math.PI;
      const heightRatio = Math.max(0, Math.sin(jumpPhase));
      renderer.setJumpHeight(heightRatio * (42 + 8 * step.speed), heightRatio);
    }

    // Restore brief left/right mirroring bursts, with at least two seconds
    // between them. No rotation or aerial backflip is applied.
    const burstStart = elapsed >= 3400 ? 3400 : (elapsed >= 600 && elapsed < 1300 ? 600 : -1);
    const mirroring = burstStart >= 0 && elapsed < burstStart + 700;
    // Optional jump + spin combo: rapid left/right sprite mirroring while
    // following the existing jump arc. No actual rotation/backflip.
    const jumpSpin = dance.jumpSpin && step.pose === 'jump' &&
      stepElapsed >= 0.15 && stepElapsed < 0.85;
    const flipOdd = jumpSpin
      ? Math.floor((stepElapsed - 0.15) * 1000 / 100) % 2 === 1
      : mirroring && Math.floor((elapsed - burstStart) / 150) % 2 === 1;
    renderer.setRotation(0);
    renderer.setFlipX(flipOdd ? !Boolean(this.look > 0) : Boolean(this.look > 0));
    renderer.setDepth(50001, 50000.5);
    renderer.update(time, delta);
    return true;
  },

});
