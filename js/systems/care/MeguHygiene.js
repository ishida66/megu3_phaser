// Bathing, room-cleaning, and hygiene-effect behavior for the Main scene.
// Loaded after game.js and mixed into Main.prototype to preserve scene context.
Object.assign(Main.prototype, {
  startBathMode() {
    if (this.visitingHouse || this.friendHouseTransition) return;
    if (this.bathMode || this.evolutionTransition || this.isEvolutionAnimating) return;
    if (!this.prepareForExternalInteraction()) return;
    const startingHygiene = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.hygiene) || 0, 0, 100);
    if (startingHygiene >= 100) {
      if (this.bathMessagePhrases && this.bathMessagePhrases.length) {
        this.showMeguMessage(this.bathMessagePhrases[0], false, 0, true);
      }
      return;
    }
    this.bathStartingHygiene = startingHygiene;
    this.closeFooterMenu();
    this.closeOtherPickersForFooterMenu();
    this.endPetting();
    this.bathMode = true;
    this.bathPointerDown = false;
    this.bathLastPointer = null;
    this.bathRubMs = 0;
    this.bathSoundPlayed = false;
    this.bathBubbleLastSpawnAt = 0;
    this.target.x = this.pet.x;
    this.target.y = this.pet.y;
    this.wander = false;
    this.clickMoveActive = false;
    this.idleStillUntil = 0;
    // Keep the existing hygiene flies and their trails visible throughout the bath.
    // They are removed only after finishBathMode restores hygiene to 100%.
    this.bathBubbles = [];
    this.bathInstructionText = null;
    const petName = String(GAME_ATTRIBUTES.petName || '').trim() || 'MEGU';
    this.showMeguMessage(`Give ${petName} a bath`, false, 0, true);
  },

  startCleanMode() {
    if (this.visitingHouse || this.friendHouseTransition) return;
    if (this.bathMode || this.evolutionTransition || this.isEvolutionAnimating) return;
    if (!this.prepareForExternalInteraction()) return;
    const startingClean = Math.round(Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.clean) || 0, 0, 100));
    if (startingClean >= 75) { this.showMeguMessage('The room is already clean', false, 0, true); return; }
    this.cleanMode = true;
    this.bathMode = true;
    const cleanCanvas = this.game && this.game.canvas;
    this.cleanPreviousCursor = cleanCanvas ? (cleanCanvas.style.cursor || '') : '';
    if (this.input && typeof this.input.setDefaultCursor === 'function') this.input.setDefaultCursor('none');
    if (cleanCanvas) cleanCanvas.style.cursor = 'none';
    if (this.cleanBroomSprite) this.cleanBroomSprite.destroy();
    const cleanPointer = this.input && this.input.activePointer;
    this.cleanBroomSprite = this.add.image(cleanPointer ? cleanPointer.x + 12 : 320, cleanPointer ? cleanPointer.y + 10 : 500, 'clean-broom-cursor')
      .setOrigin(0.12, 0.82).setScale(0.55).setDepth(100000).setScrollFactor(0);

    this.bathStartingClean = startingClean;
    this.closeFooterMenu();
    this.closeOtherPickersForFooterMenu();
    this.endPetting();
    this.bathPointerDown = false;
    this.bathLastPointer = null;
    this.bathRubMs = 0;
    this.bathSoundPlayed = false;
    this.cleanLastDirtAt = 0;
    this.target.x = this.pet.x; this.target.y = this.pet.y;
    this.wander = false; this.clickMoveActive = false; this.idleStillUntil = 0;
    this.bathBubbles = [];
    this.showMeguMessage('Clean the room', false, 0, true);
    this.ensureRoomDirt();
  },

  trackBathMovement(pointer) {
    if (!this.bathMode || !pointer) return;
    if (this.cleanMode) {
      if (this.cleanBroomSprite && this.cleanBroomSprite.active) this.cleanBroomSprite.setPosition(pointer.x + 12, pointer.y + 10);
      // Cleaning is a deliberate press-and-swipe gesture (mouse or touch), not hover.
      if (pointer.isDown && this.bathPointerDown && pointer.y >= 440 && pointer.y < 640) {
        this.removeRoomDirtAt(pointer.x, pointer.y);
      }
      return;
    }
    if (!pointer.isDown) { this.bathLastPointer = null; return; }
    if (!this.isPetHit(pointer)) { this.bathLastPointer = null; return; }
    const now = this.time.now;
    const previous = this.bathLastPointer;
    if (previous) {
      const distance = Math.hypot(pointer.x - previous.x, pointer.y - previous.y);
      if (distance >= 0.75) {
        this.bathRubMs += Phaser.Math.Clamp(now - previous.time, 0, 80);
        if (now - (this.bathBubbleLastSpawnAt || 0) >= 65) {
          this.spawnBathBubble();
          this.bathBubbleLastSpawnAt = now;
        }
        if (!this.bathSoundPlayed && this.washSound) {
          this.washSound.setVolume(this.sfxVolume);
          this.washSound.play();
          this.bathSoundPlayed = true;
        }
      }
    }
    this.bathLastPointer = { x: pointer.x, y: pointer.y, time: now };
    if (this.bathRubMs >= 1200) this.finishBathMode();
  },

  ensureRoomDirt() {
    if (!this.roomDirtPatches) this.roomDirtPatches = [];
    this.roomDirtPatches = this.roomDirtPatches.filter(d => d && d.active);
    // Dirt belongs to the player's own room only. Hide it during a friend's
    // house visit and restore the correct amount as soon as Home returns.
    if (this.visitingHouse) {
      this.roomDirtPatches.forEach(d => { if (d && d.active) d.setVisible(false); });
      return;
    }
    const clean = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.clean) || 0, 0, 100);
    // Keep the established cleanliness thresholds: 0 patches at 75+, 2 at
    // 35–74, and 4 below 35.
    const desired = clean >= 75 ? 0 : Math.max(1, Math.ceil((75 - clean) / 40)) * 2;
    // During an active sweep, retain the original patch set until the user
    // finishes cleaning; otherwise the target would shrink while patches fade.
    if (this.cleanMode) {
      this.roomDirtPatches.forEach(d => { if (d && d.active) d.setVisible(true); });
      return;
    }
    // Reconcile in both directions. Previously this only added patches, so
    // clean rooms could retain stale dirt and later screens showed old visuals.
    while (this.roomDirtPatches.length > desired) {
      const stale = this.roomDirtPatches.pop();
      if (stale && stale.active) stale.destroy();
    }
    while (this.roomDirtPatches.length < desired) {
      const x = Phaser.Math.Between(35, 605), y = Phaser.Math.Between(465, 625);
      const scale = Phaser.Math.FloatBetween(0.65, 2.0);
      const dirt = this.add.image(x, y, 'room-dirt').setOrigin(0.5, 0.5).setScale(scale)
        .setFlipX(Math.random() < 0.5).setDepth(1.7);
      const bounds = dirt.getBounds();
      dirt.setData('radius', Math.max(bounds.width, bounds.height) * 0.42);
      this.roomDirtPatches.push(dirt);
    }
    this.roomDirtPatches.forEach(d => { if (d && d.active) d.setVisible(true); });
  },

  removeRoomDirtAt(x, y) {
    if (!this.roomDirtPatches) return;
    const world = this.cameras.main.getWorldPoint(x, y);
    let removedPatch = null;
    this.roomDirtPatches.forEach(d => {
      if (!d || !d.active || removedPatch) return;
      const radius = Number(d.getData('radius')) || 18;
      if (!d.getData('beingRemoved') && Math.hypot(world.x - d.x, world.y - d.y) <= radius + 18) { d.setData('beingRemoved', true); removedPatch = d; }
    });
    const removed = !!removedPatch;
    if (removed) {
      // One sweep at a time: stop any previous instance before starting the next.
      if (this.sweepSound && this.audioUnlocked) {
        if (this.sweepSound.isPlaying) this.sweepSound.stop();
        this.sweepSound.setVolume(this.sfxVolume);
        this.sweepSound.play();
      }
      const remaining = this.roomDirtPatches.filter(d => d && d.active && !d.getData('beingRemoved')).length;
      const total = Math.max(1, Math.ceil((75 - (Number(this.bathStartingClean) || 0)) / 40)) * 2;
      GAME_ATTRIBUTES.clean = Phaser.Math.Clamp(Math.round(100 - (remaining / total) * (100 - (Number(this.bathStartingClean) || 0))), 0, 100);
      this.updateGameAttributeDisplay();
      // Dirt visibly shrinks away instead of vanishing instantly.
      const patch = removedPatch;
      if (patch) {
        this.tweens.add({ targets: patch, scaleX: 0.01, scaleY: 0.01, alpha: 0, duration: 220, ease: 'Cubic.easeIn', onComplete: () => {
          if (patch && patch.active) patch.destroy();
          const left = (this.roomDirtPatches || []).filter(d => d && d.active).length;
          if (this.cleanMode && left === 0) this.finishCleanMode();
        }});
      }
    }
  },

  finishCleanMode() {
    if (!this.cleanMode) return;
    this.cleanMode = false; this.bathMode = false;
    if (this.cleanBroomSprite) { this.cleanBroomSprite.destroy(); this.cleanBroomSprite = null; }
    const cleanCanvas = this.game && this.game.canvas;
    if (this.input && typeof this.input.setDefaultCursor === 'function') this.input.setDefaultCursor(this.cleanPreviousCursor || 'default');
    if (cleanCanvas) cleanCanvas.style.cursor = this.cleanPreviousCursor || 'default';
    this.cleanPreviousCursor = '';
    this.bathPointerDown = false; this.bathLastPointer = null; this.bathRubMs = 0;
    (this.roomDirtPatches || []).forEach(d => { if (d && d.active) d.destroy(); });
    this.roomDirtPatches = [];
    GAME_ATTRIBUTES.clean = 100;
    GAME_ATTRIBUTES.cleanLastUpdatedAt = new Date().toISOString();

    // Reuse the bath's completion reward, happy pose, size-specific voice and save flow.
    const requirement = Number(GAME_ATTRIBUTES.max_friendship) || this.getFriendshipRequirement(GAME_ATTRIBUTES.level);
    const reward = Math.round(requirement * 0.250 * (1 - (Number(this.bathStartingClean) || 0) / 100));
    if (reward > 0) { this.addFriendship(reward, 'clean'); this.popHeart('heart-l', reward); }
    const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
    const atlasKey = activeDef ? meguTextureKey(activeDef.id, GAME_ATTRIBUTES.shiny === true) : 'ID1';
    const atlas = this.textures.exists(atlasKey) ? this.textures.get(atlasKey) : null;
    const happyFrames = [`${atlasKey}_10-2x`, `${atlasKey}_10`];
    this.petClickFrame = atlas ? (happyFrames.find(frame => atlas.has(frame)) || null) : null;
    this.petClickUntil = this.game.loop.time + 1200;
    const idDigits = String(atlasKey).match(/\d+/);
    const meguId = idDigits ? String(Number(idDigits[0])) : '';
    const meguSize = this.meguSizesById && this.meguSizesById.get(meguId) || '1';
    const happySound = meguSize === '3' ? this.happySound3 : meguSize === '2' ? this.happySound2 : this.happySound1;
    if (this.audioUnlocked && happySound) {
      // Prevent the sweep sound from overlapping the completion voice.
      if (this.sweepSound && this.sweepSound.isPlaying) this.sweepSound.stop();
      happySound.setVolume(this.sfxVolume); happySound.play();
    }
    this.updateGameAttributeDisplay();
    save();
    this.showMeguMessage('The room is sparkling clean!', false, 0, true);
    // Normal home scene controls and movement are restored by ending bathMode above.
  },

  spawnBathBubble() {
    if (!this.bathMode || !this.textures.exists('bath-bubble') || !this.characterSprite || !this.characterSprite.active) return;
    const bounds = this.characterSprite.getBounds();
    // Keep bubbles within the central area of the sprite, rather than near its edges.
    const x = bounds.centerX + Phaser.Math.FloatBetween(-bounds.width * 0.22, bounds.width * 0.22);
    const y = bounds.centerY + Phaser.Math.FloatBetween(-bounds.height * 0.27, bounds.height * 0.27);
    const size = Phaser.Math.Between(16, 34);
    const bubble = this.add.image(x, y, 'bath-bubble')
      .setDisplaySize(size, size)
      .setFlipX(Math.random() < 0.5)
      .setAlpha(0)
      .setScale(0.25)
      // Character depth is Y-sorted (typically 4.4–5.2), so keep bath bubbles
      // above the character and its eye overlays.
      .setDepth(Math.max(6, (this.characterSprite.depth || 0) + 0.1))
      .setRotation(Phaser.Math.FloatBetween(-0.35, 0.35));
    this.bathBubbles = (this.bathBubbles || []).filter(item => item && item.active);
    this.bathBubbles.push(bubble);

    // Use timed size/opacity steps so the original pop-in/pop-out feel is retained,
    // but the motion is visibly discrete and a little slower.
    const steps = 5;
    const stepMs = 85;
    let step = 0;
    const appear = () => {
      if (!bubble.active || !this.bathMode) return;
      step += 1;
      const progress = step / steps;
      bubble.setScale(0.25 + 0.75 * progress).setAlpha(0.92 * progress);
      if (step < steps) this.time.delayedCall(stepMs, appear);
      else this.time.delayedCall(220, disappear);
    };
    const disappear = () => {
      if (!bubble.active) return;
      step -= 1;
      const progress = Math.max(0, step / steps);
      bubble.setScale(0.72 + 0.28 * progress).setAlpha(0.92 * progress);
      if (step > 0) this.time.delayedCall(stepMs, disappear);
      else {
        bubble.destroy();
        this.bathBubbles = (this.bathBubbles || []).filter(item => item && item.active);
      }
    };
    this.time.delayedCall(stepMs, appear);
  },

  finishBathMode() {
    if (this.cleanMode) { this.finishCleanMode(); return; }
    if (!this.bathMode) return;
    this.bathMode = false;
    this.bathPointerDown = false;
    this.bathLastPointer = null;
    this.bathRubMs = 0;
    (this.bathBubbles || []).forEach(bubble => { if (bubble && bubble.active) bubble.destroy(); });
    this.bathBubbles = [];
    const startingHygiene = Phaser.Math.Clamp(Number(this.bathStartingHygiene) || 0, 0, 100);
    const hygieneRestored = 100 - startingHygiene;
    GAME_ATTRIBUTES.hygiene = 100;
    GAME_ATTRIBUTES.hygieneLastUpdatedAt = new Date().toISOString();
    if (this.bathInstructionText && this.bathInstructionText.active) this.bathInstructionText.destroy();
    this.bathInstructionText = null;
    this.hygieneFlySprites.forEach(sprite => { if (sprite && sprite.active) sprite.destroy(); });
    this.hygieneFlySprites = [];
    this.hygieneFlyNextStepAt = [];

    // Bathing grants up to 10% of the current level's friendship requirement,
    // scaled linearly by the percentage of hygiene restored.
    const requirement = Number(GAME_ATTRIBUTES.max_friendship) || this.getFriendshipRequirement(GAME_ATTRIBUTES.level);
    const bathReward = Math.round(requirement * 0.250 * (hygieneRestored / 100));
    const bathStressBonus = this.consumeStressAction('bath');
    const totalBathReward = bathReward + bathStressBonus;
    if (totalBathReward > 0) this.addFriendship(totalBathReward, bathStressBonus ? 'stress-bath' : 'bath');
    if (!bathStressBonus && bathReward > 0) this.popHeart('heart-l', bathReward);

    // Switch to MEGU's _10 happy pose and play the same size-specific happy voice
    // used after eating.
    const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
    const atlasKey = activeDef ? meguTextureKey(activeDef.id, GAME_ATTRIBUTES.shiny === true) : 'ID1';
    const atlas = this.textures.exists(atlasKey) ? this.textures.get(atlasKey) : null;
    const happyFrames = [`${atlasKey}_10-2x`, `${atlasKey}_10`];
    if (!bathStressBonus) {
      this.petClickFrame = atlas ? (happyFrames.find(frame => atlas.has(frame)) || null) : null;
      this.petClickUntil = this.game.loop.time + 1200;
      const idDigits = String(atlasKey).match(/\d+/);
      const meguId = idDigits ? String(Number(idDigits[0])) : '';
      const meguSize = this.meguSizesById && this.meguSizesById.get(meguId) || '1';
      const happySound = meguSize === '3' ? this.happySound3 : meguSize === '2' ? this.happySound2 : this.happySound1;
      if (this.audioUnlocked && happySound) { happySound.setVolume(this.sfxVolume); happySound.play(); }
    }

    // bath[0] is reserved for already-clean MEGU. The remaining eleven entries
    // map linearly from a 1% hygiene recovery through a full 100-point recovery.
    const bathPhrases = this.bathMessagePhrases || [];
    if (bathPhrases.length > 1) {
      const progress = Phaser.Math.Clamp((hygieneRestored - 1) / 99, 0, 1);
      const phraseIndex = 1 + Math.round(progress * 10);
      const phrase = bathPhrases[Math.min(phraseIndex, bathPhrases.length - 1)];
      if (phrase) this.showMeguMessage(phrase, false, 0, true);
    }
    if (bathStressBonus > 0) this.beginStressCelebration(totalBathReward, 'heart-l');
    this.updateGameAttributeDisplay();
    save();
  },

  updateHygieneEffects(time) {
    const hygiene = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.hygiene) || 0, 0, 100);
    const showFlies = hygiene <= 75 && !this.editMode && !this.footerMenuOpen && !this.foodOpen && !this.menuOpen && !this.bOpen && !this.fOpen;
    // Fly population doubles at each 25-point hygiene threshold.
    const flyCount = hygiene <= 0 ? 8 : (hygiene <= 25 ? 4 : (hygiene <= 50 ? 2 : (hygiene <= 75 ? 1 : 0)));
    if (!this.hygieneFlySprites) this.hygieneFlySprites = [];
    if (!this.hygieneFlyNextStepAt) this.hygieneFlyNextStepAt = [];
    while (this.hygieneFlySprites.length < flyCount) {
      const index = this.hygieneFlySprites.length;
      if (!this.textures.exists('hygiene-fly')) break;
      const characterRenderDepth = this.meguRenderer && this.meguRenderer.layer && Number.isFinite(this.meguRenderer.layer.depth)
        ? this.meguRenderer.layer.depth
        : (this.characterSprite && Number.isFinite(this.characterSprite.depth) ? this.characterSprite.depth : 4.15);
      this.hygieneFlySprites[index] = this.add.image(this.pet.x, this.pet.y, 'hygiene-fly')
        // MeguRenderer draws the character inside a container; use the container's
        // world depth rather than the child sprite's local depth (usually zero).
        .setDepth(characterRenderDepth + 1);
      this.hygieneFlyNextStepAt[index] = time + Phaser.Math.Between(20, 120);
    }
    this.hygieneFlySprites.forEach((fly, index) => {
      const active = index < flyCount && showFlies && !!(this.characterSprite && this.characterSprite.visible);
      if (!fly || !fly.active) return;
      fly.setVisible(active);
      if (!active) return;
      // Character depth can change with its position. The renderer sprite is a
      // child of a container, so its own depth is local; compare against the
      // renderer container's world depth to keep flies in front of the model.
      const characterRenderDepth = this.meguRenderer && this.meguRenderer.layer && Number.isFinite(this.meguRenderer.layer.depth)
        ? this.meguRenderer.layer.depth
        : (Number.isFinite(this.characterSprite.depth) ? this.characterSprite.depth : 4.15);
      fly.setDepth(characterRenderDepth + 1);

      const bounds = this.characterSprite.getBounds();
      // Keep the flies around the middle of the model rather than orbiting above its head.
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const radiusX = Phaser.Math.Clamp(bounds.width * 0.259, 24, 48);
      const radiusY = Phaser.Math.Clamp(bounds.height * 0.257, 22, 38);

      // Flies make irregular, abrupt darts with short pauses and frequent direction changes.
      if (!this.hygieneFlyNextStepAt[index] || time >= this.hygieneFlyNextStepAt[index]) {
        const dart = Math.random() < 0.24;
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const distance = Math.sqrt(Math.random()) * (dart ? 1 : 0.72);
        const x = centerX + Math.cos(angle) * radiusX * distance;
        const y = centerY + Math.sin(angle) * radiusY * distance;
        const dx = x - fly.x;
        const dy = y - fly.y;
        fly.setPosition(x, y)
          .setRotation(0)
          .setFlipX(dx < 0);
        this.hygieneFlyNextStepAt[index] = time + (dart
          ? Phaser.Math.Between(35, 75)
          : Phaser.Math.Between(65, 145));
      }
    });
  }

 });
