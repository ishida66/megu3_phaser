/* Reusable five-second ball-balance animation. Requires a loaded 'megu-balance-ball' texture. */
Object.assign(Main.prototype, {
  startMeguBallBalance(options = {}) {
    const renderer = this.meguRenderer;
    if (!this.pet || !renderer || renderer.destroyed || !this.textures.exists('megu-balance-ball')) return;
    this.stopMeguBallBalance();
    this.meguDance = null;
    renderer.killTweens();
    renderer.endJump();
    renderer.lockedPosition = null;
    renderer.setRotation(0);

    const ball = this.add.image(320, 442, 'megu-balance-ball')
      .setDisplaySize(112, 112).setDepth(50000.75).setScrollFactor(0);
    this.meguBallBalance = {
      ball,
      startedAt: this.time.now,
      duration: Number.isFinite(options.duration) ? Math.max(1, options.duration) : 5000,
      lastOffset: 0,
      lastTime: this.time.now,
      facingRight: Number(this.look) > 0
    };
    renderer.setDepth(50001, 50000.5);
    renderer.playAnimation('walking', { frameDuration: 140 });
  },

  updateMeguBallBalance(time, delta, renderer = this.meguRenderer) {
    const balance = this.meguBallBalance;
    if (!balance || !renderer || renderer.destroyed) return false;
    const elapsed = time - balance.startedAt;
    if (elapsed >= balance.duration) {
      this.stopMeguBallBalance();
      renderer.setPosition(this.pet.x, this.pet.y);
      renderer.setFlipX(Number(this.look) > 0);
      renderer.playAnimation('standing');
      renderer.update(time, delta);
      return true;
    }

    const t = elapsed / 1000;
    // Small irregular steps to keep balance, rather than a mechanical single sine wave.
    const offset = 19 * Math.sin(t * 5.1) + 7 * Math.sin(t * 9.3 + 0.7);
    const velocity = offset - balance.lastOffset;
    if (Math.abs(velocity) > 0.05) balance.facingRight = velocity > 0;
    const ballX = 320 + offset;
    balance.ball.setX(ballX);
    // Left movement rolls clockwise; right movement rolls counterclockwise.
    // 56px is the rendered ball radius, so rotation follows horizontal travel.
    balance.ball.rotation -= (offset - balance.lastOffset) / 56;
    balance.lastOffset = offset;
    balance.lastTime = time;

    renderer.setPosition(ballX, 386 + Math.sin(t * 10.2) * 2);
    renderer.setFlipX(balance.facingRight);
    renderer.setRotation(0);
    renderer.playAnimation('walking', { frameDuration: 125 });
    renderer.update(time, delta);
    // Keep the renderer-owned shadow on the floor beneath the rolling ball,
    // rather than at MEGU's elevated feet position.
    if (renderer.shadow?.active) {
      renderer.shadow.setPosition(ballX, 498 - (renderer.shadowOptions?.yOffset || 0));
    }
    return true;
  },

  stopMeguBallBalance() {
    const balance = this.meguBallBalance;
    if (!balance) return;
    if (balance.ball?.active) balance.ball.destroy();
    this.meguBallBalance = null;
    if (this.meguRenderer && !this.meguRenderer.destroyed) {
      this.meguRenderer.setRotation(0);
      this.meguRenderer.lockedPosition = null;
    }
  }
});
