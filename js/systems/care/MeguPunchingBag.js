/* Gym punching bag: Sumo SLAP-inspired approach, three impacts, pause, three impacts. */
Object.assign(Main.prototype, {
  startMeguPunchingBag() {
    const renderer = this.meguRenderer;
    if (!this.gymActive || this.gymClosing || !this.pet || !renderer || renderer.destroyed || !this.textures.exists('megu-gym-punching-bag')) return;
    this.stopMeguPunchingBag();
    this.stopMeguBarbell();
    this.stopMeguBallBalance();
    this.meguDance = null;
    renderer.killTweens();
    renderer.endJump();
    renderer.lockedPosition = null;
    renderer.setRotation(0);

    const baseY = Phaser.Math.Clamp(this.pet.y, 315, 610);
    const bag = this.add.image(520, baseY + 12, 'megu-gym-punching-bag')
      .setOrigin(0.5, 1).setDepth(50002).setScrollFactor(0);
    // The image includes its stand; preserve its proportions and leave room for MEGU.
    bag.setScale(Math.min(250 / Math.max(1, bag.height), 165 / Math.max(1, bag.width)));
    const baseX = 320;
    const contactX = Math.min(440, 520 - bag.displayWidth * 0.5 - 32);
    this.meguPunchingBag = { bag, startedAt: this.time.now, baseX, contactX, baseY,
      approachMs: 420, hitMs: 320, pauseMs: 850, retreatMs: 360,
      spriteScaleX: renderer.sprite?.scaleX, spriteScaleY: renderer.sprite?.scaleY, lastImpact: -1 };
    renderer.setDepth(50001, 50000.5);
    renderer.setFlipX(true); // Face right, toward the bag.
    renderer.playAnimation('walking', { frameDuration: 105 });
  },

  updateMeguPunchingBag(time, delta, renderer = this.meguRenderer) {
    const routine = this.meguPunchingBag;
    if (!routine || !renderer || renderer.destroyed) return false;
    const { approachMs, hitMs, pauseMs, retreatMs, baseX, contactX, baseY } = routine;
    const elapsed = Math.max(0, time - routine.startedAt);
    const strikeDuration = 6 * hitMs + pauseMs;
    let x = baseX;
    let squash = 0;
    let bagSway = 0;
    let walking = true;
    if (elapsed < approachMs) {
      const t = elapsed / approachMs;
      x = Phaser.Math.Linear(baseX, contactX - 13, 0.5 - 0.5 * Math.cos(Math.PI * t));
    } else if (elapsed < approachMs + strikeDuration) {
      let t = elapsed - approachMs;
      if (t >= 3 * hitMs && t < 3 * hitMs + pauseMs) {
        x = contactX - 13;
        walking = false;
      } else {
        if (t >= 3 * hitMs + pauseMs) t -= pauseMs;
        const hitIndex = Math.min(5, Math.floor(t / hitMs));
        const phase = (t % hitMs) / hitMs;
        // Sumo SLAP impact: play once when each lunge reaches contact.
        if (phase >= 0.22 && routine.lastImpact !== hitIndex) {
          routine.lastImpact = hitIndex;
          if (this.cache.audio.exists('sumo-sfx-beat')) {
            this.sound.play('sumo-sfx-beat', { volume: 0.85 });
          }
        }
        // Sumo's quick 70ms lunge and 45ms squash, with a short recovery.
        const lunge = phase < 0.22 ? phase / 0.22 : phase < 0.48 ? 1 : Math.max(0, 1 - (phase - 0.48) / 0.52);
        x = contactX - 13 + lunge * 13;
        squash = phase >= 0.22 && phase < 0.51 ? Math.sin(Math.PI * (phase - 0.22) / 0.29) : 0;
        bagSway = phase >= 0.22 ? Math.sin((phase - 0.22) * Math.PI * 1.6) * 5 : 0;
        routine.bag.setAngle(bagSway * 0.6);
        routine.bag.setX(520 + bagSway);
        if (hitIndex === 5 && phase > 0.9) routine.bag.setAngle(0);
      }
    } else if (elapsed < approachMs + strikeDuration + retreatMs) {
      const t = (elapsed - approachMs - strikeDuration) / retreatMs;
      x = Phaser.Math.Linear(contactX - 13, baseX, 0.5 - 0.5 * Math.cos(Math.PI * t));
    } else {
      this.stopMeguPunchingBag();
      renderer.setPosition(this.pet.x, this.pet.y);
      renderer.setFlipX(Number(this.look) > 0);
      renderer.playAnimation('standing');
      renderer.update(time, delta);
      return true;
    }
    renderer.setFlipX(true);
    renderer.setRotation(0);
    renderer.setPosition(x, baseY);
    if (walking) renderer.playAnimation('walking', { frameDuration: 105 });
    else renderer.playAnimation('standing');
    renderer.update(time, delta);
    if (renderer.sprite?.active && Number.isFinite(routine.spriteScaleY)) {
      renderer.sprite.setScale(routine.spriteScaleX, routine.spriteScaleY);
    }
    // Sumo's SLAP impact briefly compresses the attacker (scaleY .7392).
    if (renderer.sprite && renderer.sprite.active && squash > 0) {
      // Apply to the visual sprite only, never to the renderer-owned shadow.
      renderer.sprite.setScale(routine.spriteScaleX, routine.spriteScaleY * (1 - 0.2608 * squash));
    }
    return true;
  },

  stopMeguPunchingBag() {
    const routine = this.meguPunchingBag;
    if (!routine) return;
    if (routine.bag?.active) routine.bag.destroy();
    if (this.meguRenderer?.sprite?.active && Number.isFinite(routine.spriteScaleY)) {
      this.meguRenderer.sprite.setScale(routine.spriteScaleX, routine.spriteScaleY);
    }
    this.meguPunchingBag = null;
    if (this.meguRenderer && !this.meguRenderer.destroyed) {
      this.meguRenderer.lockedPosition = null;
      this.meguRenderer.setRotation(0);
    }
  }
});
