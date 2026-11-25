// Evolution, charge, medicine, and character transformation lifecycle.
// Loaded after game.js; methods are mixed into Main.prototype to preserve scene context.
Object.assign(Main.prototype, {
  startEvolutionTransition(nextIndex, reason = 'evolve', cost = {}) {
    if (this.evolutionTransition && this.evolutionTransition.active) return false;
    const nextDef = this.characterDefs[nextIndex];
    const logicalNextId = String(nextDef && nextDef.id || '');
    const currentDef = this.characterDefs[getCharacterIndex(this.characterDefs)] || null;
    const logicalCurrentId = String(currentDef && currentDef.id || GAME_ATTRIBUTES.petId || '');
    const currentId = meguTextureKey(logicalCurrentId, GAME_ATTRIBUTES.shiny === true);
    const nextId = reason === 'shiny' ? meguTextureKey(logicalNextId, GAME_ATTRIBUTES.shiny !== true) : meguTextureKey(logicalNextId, false);
    const nextAssetPaths = meguAssetPaths(logicalNextId, nextId.startsWith('IDX'));
    if (!nextId || !currentId || !this.textures.exists(currentId)) return false;

    // Hide the existing home-screen MEGU synchronously, before any sound,
    // tween, fade, or transformation sprite is created. This prevents the
    // home-scene character from appearing for even a frame during fade-out.
    const inChargingRoom = !!this.chargingRoomActive;
    const suppressedHomeSprites = [];
    if (inChargingRoom) {
      const sceneManager = this.game && this.game.scene;
      const liveScenes = sceneManager && sceneManager.getScenes
        ? sceneManager.getScenes(false) : [this];
      const seenObjects = new Set();
      const hideObject = (object, isKnownCharacter = false) => {
        if (!object || !object.active || seenObjects.has(object)) return;
        seenObjects.add(object);
        const textureKey = object.texture && object.texture.key;
        const frameName = String(object.frame && object.frame.name || '');
        const isCurrentMeguLayer = textureKey === currentId &&
          (frameName === currentId || frameName.startsWith(currentId + '_'));
        if (isKnownCharacter || isCurrentMeguLayer) {
          suppressedHomeSprites.push({
            object,
            wasVisible: object.visible !== false,
            wasAlpha: Number.isFinite(object.alpha) ? object.alpha : 1
          });
          object.setVisible(false).setAlpha(0);
        }
        // Some scenes keep the home character inside a Container rather than
        // directly in the display list, so recurse through nested children too.
        if (object.list && Array.isArray(object.list)) {
          object.list.slice().forEach(child => hideObject(child, false));
        }
      };
      liveScenes.forEach(scene => {
        if (!scene) return;
        const knownCharacterObjects = new Set([
          scene.characterSprite, scene.characterOverlay, scene.characterBlink,
          scene.homeCharacterSprite, scene.homeMeguSprite, scene.megu
        ].filter(Boolean));
        const children = scene.children && scene.children.list ? scene.children.list.slice() : [];
        children.forEach(object => hideObject(object, knownCharacterObjects.has(object)));
        // Also catch known scene references that are not currently in the list.
        knownCharacterObjects.forEach(object => hideObject(object, true));
      });
      // Keep all Charging Room controls and its idle character hidden while
      // the transition runs; the transformation sprites are created afterward.
      (this.chargingRoomObjects || []).slice(1).forEach(object => {
        if (object && object.active) object.setVisible(false);
      });
    }

    this.isEvolutionAnimating = true;
    // The renderer shadow is independent of its character container. Hide it
    // synchronously so it cannot remain at the Home position during Charging
    // Room evolution.
    this.meguRenderer?.setShadowVisible(false);
    this.pettingActive = false;
    this.endPetting && this.endPetting();
    this.clickMoveActive = false;
    this.foodActionActive = false;
    this.foodSequenceActive = false;
    this.idleStillUntil = 0;
    this.blinkUntil = 0;
    if (this.meguMessageTimer) { this.meguMessageTimer.remove(false); this.meguMessageTimer = null; }
    if (this.meguMessageContainer && this.meguMessageContainer.active) this.meguMessageContainer.destroy(true);
    this.meguMessageContainer = null;
    if (this.bgmSound && this.bgmSound.isPlaying) this.bgmSound.stop();
    if (this.characterChangingSound) {
      if (this.characterChangingSound.isPlaying) this.characterChangingSound.stop();
      this.characterChangingSound.setVolume(this.sfxVolume);
      this.characterChangingSound.play();
    }
    if (this.meguVoiceSounds) this.meguVoiceSounds.forEach(sound => { if (sound && sound.isPlaying) sound.stop(); });
    this.currentMeguVoiceKey = '';
    this.nextMeguVoiceAt = this.time.now + 17000 + 15000;

    // Black out the room area while a transparent full-canvas hit shield
    // prevents taps on the still-visible bottom HUD during the sequence.
    const transitionX = inChargingRoom ? 156 : 320;
    const transitionY = inChargingRoom ? 442 : 475;
    const shadeDepth = inChargingRoom ? 50010 : 80;
    const oldDepth = inChargingRoom ? 50012 : 90;
    const newDepth = inChargingRoom ? 50014 : 92;
    const blockerDepth = inChargingRoom ? 50050 : 110;
    const shade = this.add.rectangle(320, 320, 640, 640, 0x000000, 0)
      .setOrigin(0.5).setDepth(shadeDepth).setInteractive();
    const blocker = this.add.rectangle(320, 475, 640, 950, 0x000000, 0.001)
      .setOrigin(0.5).setDepth(blockerDepth).setInteractive();
    const transition = this.evolutionTransition = {
      active: true, startedAt: 0, duration: 17000, shade, blocker,
      oldBase: null, oldEyes: null, newBase: null, newEyes: null,
      oldKey: currentId, newKey: nextId, oldPetId: logicalCurrentId, newPetId: logicalNextId, nextIndex, reason,
      inChargingRoom, transitionX, transitionY, oldDepth, newDepth,
      suppressedHomeSprites, cancelButton: null,
      chargeBefore: GAME_ATTRIBUTES.charge, natural: cost.natural === true, itemKey: cost.itemKey || null
    };
    // The close artwork is preloaded by MeguPreload as level-reward-close.
    // Put it above the full-canvas input shield, including in Charging Room.
    if (this.textures.exists('level-reward-close')) {
      const cancel = this.add.image(590, 590, 'level-reward-close')
        .setOrigin(0.5).setDisplaySize(92, 76).setDepth(blockerDepth + 2)
        .setInteractive({ useHandCursor: true });
      cancel.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation?.();
        this.cancelEvolutionTransition(transition);
      });
      transition.cancelButton = cancel;
    } else {
      console.error('[MEGU Asset Error] Missing level-reward-close (assets/menus/buttons/btn_close@2x.png) during evolution.');
    }
    this.tweens.add({ targets: shade, fillAlpha: 1, duration: 900, ease: 'Sine.easeInOut' });

    const begin = () => {
      if (!this.evolutionTransition || this.evolutionTransition !== transition) return;
      // Treat _5 (body) and _8 (closed-eye overlay) as one visual unit.
      // Both layers always share exactly the same visibility and alpha.
      const makeLayer = (key, suffixes, depth, visible) => {
        const texture = this.textures.get(key);
        const frame = suffixes.map(suffix => key + suffix).find(name => texture && texture.has(name));
        if (!frame) return null;
        return this.add.sprite(transitionX, transitionY, key, frame)
          .setOrigin(0.5, 1).setDepth(depth).setVisible(visible).setAlpha(visible ? 1 : 0);
      };
      const makeForm = (key, visible, depth) => {
        const base = makeLayer(key, ['_5-2x', '_5-2', '_5'], depth, visible);
        const eyes = makeLayer(key, ['_8-2x', '_8-2', '_8'], depth + 0.01, visible);
        if (!base || !eyes) {
          if (base) base.destroy();
          if (eyes) eyes.destroy();
          return null;
        }
        return { base, eyes };
      };
      const oldForm = makeForm(currentId, true, oldDepth);
      const newForm = makeForm(nextId, false, newDepth);
      if (!oldForm || !newForm) {
        console.warn('[MEGU] Transformation _5/_8 frame pair is missing; using an immediate character switch.');
        if (oldForm) { oldForm.base.destroy(); oldForm.eyes.destroy(); }
        if (newForm) { newForm.base.destroy(); newForm.eyes.destroy(); }
        this.finishEvolutionTransition(transition, true);
        return;
      }
      transition.oldBase = oldForm.base;
      transition.oldEyes = oldForm.eyes;
      transition.newBase = newForm.base;
      transition.newEyes = newForm.eyes;
      transition.startedAt = this.time.now;
      transition.started = true;

      const petName = String(GAME_ATTRIBUTES.petName || '').trim() ||
        (this.localizedRecord ? (this.localizedRecord(this.characterRecordsById, currentId) || {}).name : '') ||
        (this.localizedName ? this.localizedName(this.characterNamesById || new Map(), currentId, currentDef && currentDef.name || currentId) : '') ||
        (currentDef && currentDef.name) || currentId || 'MEGU';
      this.showMeguMessage(`Something is going on with ${petName}..!`, true, 0, true);
    };

    if (this.textures.exists(nextId)) {
      begin();
    } else {
      if (!this.characterAtlasQueuedKeys) this.characterAtlasQueuedKeys = new Set();
      if (!this.characterAtlasQueuedKeys.has(nextId)) {
        this.characterAtlasQueuedKeys.add(nextId);
        this.load.atlas(nextId, nextAssetPaths.image, nextAssetPaths.json);
      }
      this.load.once('complete', begin);
      if (!(this.load.isLoading && this.load.isLoading())) this.load.start();
    }
    return true;
  },
  updateEvolutionTransition(time) {
    if (!this.evolutionTransition || !this.evolutionTransition.active) return;
    const transition = this.evolutionTransition;
    if (transition.started) {
      const elapsed = Math.max(0, Math.min(17000, time - transition.startedAt));
      // Total sequence is 17s. The old form fades out over 10.5s;
      // the new form begins fading in at 6.5s, giving a 4s crossfade.
      const OLD_FADE_MS = 10500;
      const NEW_FADE_START_MS = 6500;
      const NEW_FADE_MS = 10500;
      const smoothstep = (a, b, x) => {
        const t = Phaser.Math.Clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
      };
      const applyFormAlpha = (base, eyes, alpha) => {
        const visible = alpha > 0.001;
        if (base) base.setVisible(visible).setAlpha(alpha);
        if (eyes) eyes.setVisible(visible).setAlpha(alpha);
      };

      // Sprite blinking is a visibility/opacity pulse of the whole _5+_8
      // pair, separate from the character's own eye animation.
      // Old form: slow -> fast, reaching the 4Hz maximum by the end of the old-form fade-out.
      const oldT = Phaser.Math.Clamp(elapsed / OLD_FADE_MS, 0, 1);
      const oldFade = 1 - smoothstep(0, 1, oldT);
      const oldStartHz = 0.5;
      const oldEndHz = 4;
      const oldCycles = (OLD_FADE_MS / 1000) *
        (oldStartHz * oldT + 0.5 * (oldEndHz - oldStartHz) * oldT * oldT);
      const oldPhase = 2 * Math.PI * oldCycles;
      const oldBlinkWave = 0.5 + 0.5 * Math.cos(oldPhase);
      const oldBlinkOpacity = 1 - 0.82 * (1 - oldBlinkWave);
      applyFormAlpha(transition.oldBase, transition.oldEyes, oldFade * oldBlinkOpacity);

      // New form: starts at the shared 4Hz maximum at 6.5s, then slows smoothly to zero by 17s.
      const newElapsed = Math.max(0, elapsed - NEW_FADE_START_MS);
      const newT = Phaser.Math.Clamp(newElapsed / NEW_FADE_MS, 0, 1);
      const newFade = smoothstep(0, 1, newT);
      const newStartHz = 4;
      const newCycles = newStartHz * (newT - 0.5 * newT * newT) * (NEW_FADE_MS / 1000);
      const newPhase = 2 * Math.PI * newCycles;
      const newBlinkWave = 0.5 - 0.5 * Math.cos(newPhase);
      const newBlinkStrength = 0.72 * (1 - newT);
      const newBlinkOpacity = 1 - newBlinkStrength * (1 - newBlinkWave);
      const incomingAlpha = elapsed < NEW_FADE_START_MS ? 0 : newFade * newBlinkOpacity;
      applyFormAlpha(transition.newBase, transition.newEyes, incomingAlpha);
      if (elapsed >= 17000) this.finishEvolutionTransition(transition, true);
    }

  },
  cancelEvolutionTransition(transition = this.evolutionTransition) {
    if (!transition || transition !== this.evolutionTransition || !transition.active) return;
    transition.active = false;
    if (this.characterChangingSound?.isPlaying) this.characterChangingSound.stop();
    if (this.meguMessageTimer) { this.meguMessageTimer.remove(false); this.meguMessageTimer = null; }
    if (this.meguMessageContainer?.active) this.meguMessageContainer.destroy(true);
    this.meguMessageContainer = null;
    this.meguMessageMinUntil = 0;
    this.pendingMeguMessage = null;
    if (this.meguMessageDeferredTimer) { this.meguMessageDeferredTimer.remove(false); this.meguMessageDeferredTimer = null; }
    this.finishEvolutionTransition(transition, false);
    // Use the standard message card, but shorten its normal 5s lifetime to 3s.
    this.showMeguMessage('Uh! Nothing happened!', true, 0, true);
    const card = this.meguMessageContainer;
    if (card?.active) {
      if (this.meguMessageTimer) this.meguMessageTimer.remove(false);
      this.meguMessageTimer = this.time.delayedCall(3000, () => {
        if (card.active) card.destroy(true);
        if (this.meguMessageContainer === card) this.meguMessageContainer = null;
        this.meguMessageTimer = null;
      });
    }
  },
  finishEvolutionTransition(transition, commit) {
    if (!transition || this.evolutionTransition !== transition) return;
    if (transition.timer && transition.timer.remove) transition.timer.remove(false);
    if (transition.updateEvent && transition.updateEvent.remove) transition.updateEvent.remove(false);
    // Stop any remaining transition-only tweens before disposing their targets.
    [transition.oldBase, transition.oldEyes, transition.newBase, transition.newEyes,
      transition.shade, transition.blocker, transition.cancelButton].forEach(object => {
      if (object) this.tweens.killTweensOf(object);
    });
    // Leave only the new _5+_8 sprite pair visible for the final instant.
    if (transition.oldBase) transition.oldBase.setVisible(false).setAlpha(0);
    if (transition.oldEyes) transition.oldEyes.setVisible(false).setAlpha(0);
    if (transition.newBase) transition.newBase.setVisible(true).setAlpha(1);
    if (transition.newEyes) transition.newEyes.setVisible(true).setAlpha(1);
    if (commit) {
      GAME_ATTRIBUTES.charge = 0;
      if (transition.itemKey) {
        GAME_ATTRIBUTES[transition.itemKey] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[transition.itemKey]) || 0) - 1);
      }
      if (transition.reason === 'shiny') {
        GAME_ATTRIBUTES.shiny = transition.newKey.startsWith('IDX');
      } else {
        this.recordMeguIdHistory(transition.oldPetId || transition.oldKey, transition.newPetId || transition.newKey);
        GAME_ATTRIBUTES.petId = transition.newPetId || transition.newKey;
        GAME_ATTRIBUTES.shiny = false;
      }
      // Actual species changes clear form-specific accessories; toggling shiny
      // keeps the current equipment because the underlying MEGU species is unchanged.
      if (transition.reason !== 'shiny') {
        GAME_ATTRIBUTES.accessories = [];
        GAME_ATTRIBUTES.accessory = { id: '', poses: {} };
        this.destroyPlayerAccessoryOverlays();
      }
      this.applyCurrentMeguWeightBounds();
      save();
      this.characterMenuBgmShouldResume = !!this.audioUnlocked;
      this.pendingCharacterBgmResume = true;
    }
    if (!commit) {
      GAME_ATTRIBUTES.charge = transition.natural ? 3 : transition.chargeBefore;
      save();
    }
    [transition.oldBase, transition.oldEyes, transition.newBase, transition.newEyes, transition.blocker, transition.cancelButton]
      .forEach(object => { if (object && object.active) object.destroy(); });
    this.evolutionTransition = null;
    this.isEvolutionAnimating = false;
    this.updateMedicineHud?.();
    this.updateGameAttributeDisplay();
    this.syncMeguMenuVisibility();
    if (transition.inChargingRoom && this.chargingRoomActive) {
      if (this.meguRenderer) { this.meguRenderer.setBodyVisible(true); this.meguRenderer.setPosition(156, 442); }
      if (this.meguRenderer) this.meguRenderer.setEyesVisible(true);
      // A cancelled transition restores the previous display state. On a
      // successful evolution, leave every stale old-form copy hidden; the
      // active home sprite is refreshed by activateCharacterAtlas below.
      if (!commit) {
        (transition.suppressedHomeSprites || []).forEach(entry => {
          if (entry.object && entry.object.active) entry.object.setVisible(entry.wasVisible).setAlpha(entry.wasAlpha);
        });
      }
    }
    if (commit) {
      // Play the completed-change cue only after the full transformation.
      if (this.houseChangedSound) this.playMenuSound(this.houseChangedSound, this.sfxVolume);
      const activeDef = this.characterDefs[getCharacterIndex(this.characterDefs)];
      const activated = this.activateCharacterAtlas(activeDef);
      // The transformation sprites are temporary. Rebind the persistent home
      // sprite to the committed atlas and explicitly restore it after the
      // transition, because activateCharacterAtlas can inherit a stale
      // menuOpen/footerMenuOpen flag from the menu that launched evolution.
      // Without this reset, the new atlas is active but the actual pet remains
      // invisible after the transition objects are destroyed.
      if (activated && this.characterSprite && this.characterSprite.active) {
        this.meguRenderer?.setBodyVisible(!this.editMode);
        this.meguRenderer?.setAlpha(1);
        if (this.characterOverlay && this.characterOverlay.active) {
          this.meguRenderer?.setEyesVisible(!this.editMode && !this.menuOpen);
        }
      }
      this.updateGameAttributeDisplay();
    } else if (this.bgmSound && this.audioUnlocked && !this.bgmSound.isPlaying) {
      this.bgmSound.play();
    }
    // Fade only the 640x640 room shade away. Camera-wide fades would also
    // affect the stats panel, HUD, and bottom menu outside the play area.
    if (transition.shade && transition.shade.active) {
      transition.shade.setVisible(true).setAlpha(1);
      this.tweens.add({
        targets: transition.shade,
        fillAlpha: 0,
        duration: commit ? 700 : 0,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (transition.shade && transition.shade.active) transition.shade.destroy();
          if (transition.inChargingRoom && this.chargingRoomActive) {
            (this.chargingRoomObjects || []).slice(1).forEach(object => {
              if (object && object.active) object.setVisible(true);
            });
          }
        }
      });
    }
  },
  getEvolutionCandidates(currentId) {
    const currentKey = this.normalizeMeguId(currentId);
    const currentRow = (this.meguDescriptionRows || []).find(row =>
      this.normalizeMeguId(row && row.id) === currentKey
    );
    if (!currentRow) return [];
    const rawCandidates = [
      currentRow.change,
      currentRow.special && currentRow.special.special_change
    ];
    const seen = new Set();
    return rawCandidates.map(value => String(value == null ? '' : value).trim())
      .filter(value => {
        if (!value) return false;
        const key = this.normalizeMeguId(value);
        if (!key || seen.has(key) || this.findCharacterIndexById(value) < 0) return false;
        seen.add(key);
        return true;
      });
  },
  // Natural charges (daily login, tester rewards) are the only charges that
  // can reach level 4 and trigger evolution. Medicine uses addMedicineCharge.
  addEvolutionCharge(amount = 1) {
    const allowEvolution = GAME_ATTRIBUTES.allowEvolution !== false;
    const increment = Math.max(0, Math.trunc(Number(amount) || 0));
    const previousCharge = Phaser.Math.Clamp(Math.trunc(Number(GAME_ATTRIBUTES.charge) || 0), 0, 4);
    GAME_ATTRIBUTES.charge = Math.min(4, previousCharge + increment);
    const chargeIncrease = GAME_ATTRIBUTES.charge - previousCharge;

    // Every successful charge increase plays the animation exactly once.
    if (chargeIncrease > 0 && this.scene && this.scene.isActive()) {
      this.playDailyChargeAnimation();
    }

    if (GAME_ATTRIBUTES.charge >= 4 && !allowEvolution) {
      this.showMedicineNotice('MEGU fully charge');
    }

    if (allowEvolution && GAME_ATTRIBUTES.charge >= 4 && !this.pendingFullChargeEvolution) {
      const triggerEvolution = () => {
        this.showMedicineNotice('MEGU fully charge');
        this.pendingFullChargeEvolution = false;
        if (GAME_ATTRIBUTES.charge < 4) return;
        const currentDef = this.characterDefs[getCharacterIndex(this.characterDefs)] || null;
        const currentId = String(currentDef && currentDef.id || GAME_ATTRIBUTES.petId || '');
        const candidates = this.getEvolutionCandidates(currentId);
        if (candidates.length === 1) {
          this.switchMeguById(candidates[0], 'evolve', { natural: true });
        } else if (candidates.length > 1) {
          this.openEvolutionPicker(candidates, { natural: true });
        } else {
          console.warn(`[MEGU] No valid evolution target is defined for character ${currentId}; charge remains at 4.`);
        }
        this.updateGameAttributeDisplay();
      };

      const chargeAnimation = this.dailyChargeAnimationRun;
      if (chargeAnimation && !chargeAnimation.finished) {
        this.pendingFullChargeEvolution = true;
        chargeAnimation.onComplete = triggerEvolution;
      } else {
        triggerEvolution();
      }
    }
    this.updateGameAttributeDisplay();
  },
  // Voltamin and Voltamin-Lite have a separate non-evolving charge path.
  // Both are capped at 3 charges (99 W), even if natural charging can reach 4.
  addMedicineCharge(amount = 1, fill = false) {
    const previous = Phaser.Math.Clamp(Math.trunc(Number(GAME_ATTRIBUTES.charge) || 0), 0, 4);
    if (previous >= 3) return false;
    const increment = Math.max(0, Math.trunc(Number(amount) || 0));
    const next = fill ? 3 : Math.min(3, previous + increment);
    if (next <= previous) return false;
    GAME_ATTRIBUTES.charge = next;
    if (this.scene && this.scene.isActive()) this.playDailyChargeAnimation();
    if (this.updateVoltageIcon) this.updateVoltageIcon();
    this.updateGameAttributeDisplay();
    return true;
  },
  openEvolutionPicker(candidateIds, cost = {}) {
    if (this.evolutionPickerObjects?.length || this.evolutionTransition?.active) return;
    if (this.pettingActive) this.endPetting();
    const candidates = (candidateIds || []).slice(0, 2).map(id => {
      const index = this.findCharacterIndexById(id);
      return index >= 0 ? this.characterDefs[index] : null;
    }).filter(Boolean);
    if (candidates.length < 2) return;

    const generation = this.evolutionPickerGeneration = (this.evolutionPickerGeneration || 0) + 1;
    const objects = this.evolutionPickerObjects = [];
    const add = object => { objects.push(object); return object; };
    const panel = { x: 320, y: 320, width: 600, height: 526 };
    const panelLeft = panel.x - panel.width / 2;
    // Button and selection X coordinates are local to the panel's left edge.
    const cfg = (name, defaults) => {
      const c = MeguMenuLayouts.button(this, 'evolution_picker', name, defaults);
      return { ...c, x: c.x + panelLeft, hitboxX: (c.hitboxX ?? c.x) + panelLeft };
    };
    // Positions below follow the supplied 600x526 layout, offset into the game canvas.
    add(this.add.rectangle(320, 475, 640, 950, 0x000000, 0.68).setDepth(900).setInteractive());
    // Verify the texture before constructing the image. Phaser otherwise silently
    // displays its built-in missing-texture graphic when a key was not loaded.
    const pickerTextureKey = 'megutate-select-background';
    const pickerTexturePath = 'assets/menus/megutate_select@2x.png';
    const pickerTexture = this.textures.exists(pickerTextureKey)
      ? this.textures.get(pickerTextureKey) : null;
    const pickerImage = pickerTexture?.getSourceImage?.();
    const pickerValid = !!(pickerImage && pickerImage.width > 0 && pickerImage.height > 0);
    if (!pickerValid) {
      console.error(`[MEGU Asset Error] Missing or invalid texture '${pickerTextureKey}' for ${pickerTexturePath}. Rendering evolution picker fallback.`);
      add(this.add.rectangle(panel.x, panel.y, panel.width, panel.height, 0xf2e8d8)
        .setDepth(901));
    } else {
      add(this.add.image(panel.x, panel.y, pickerTextureKey)
        .setDisplaySize(panel.width, panel.height).setDepth(901));
    }
    let selected = 0;
    const previews = [];
    const slots = [
      { x: panelLeft + 160, bottom: 407, nameY: 430 },
      { x: panelLeft + 440, bottom: 407, nameY: 430 }
    ];
    const highlight = add(this.add.graphics().setDepth(902));
    const redraw = () => {
      highlight.clear();
      const slot = slots[selected];
      highlight.lineStyle(4, 0xffdf55, 1);
      highlight.strokeRoundedRect(slot.x - 124, 152, 248, 255, 28);
    };
    candidates.forEach((def, i) => {
      const slot = slots[i];
      const key = String(def.id);
      const record = this.localizedRecord && this.characterRecordsById
        ? this.localizedRecord(this.characterRecordsById, key) : null;
      const name = String(record?.name || def.name || key);
      add(this.add.text(slot.x, slot.nameY, name, {
        fontFamily: 'Arial, sans-serif', fontSize: '21px', color: '#000000',
        align: 'center', fontStyle: 'bold', wordWrap: { width: 245 }
      }).setOrigin(0.5).setDepth(904));
      const hit = cfg(i === 0 ? 'option_a' : 'option_b', {
        x: slot.x, y: 282, width: 256, height: 260
      });
      add(this.add.zone(hit.x, hit.y, hit.hitboxWidth || hit.width, hit.hitboxHeight || hit.height)
        .setDepth(905).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { selected = i; redraw(); }));
      const placeholder = add(this.add.text(slot.x, 285, 'Loading...', {
        fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#222222'
      }).setOrigin(0.5).setDepth(903));
      previews.push({ def, key, slot, placeholder });
    });
    redraw();
    const action = (name, fallback, fn) => {
      const c = cfg(name, fallback);
      const zone = add(this.add.zone(c.hitboxX ?? c.x, c.hitboxY ?? c.y,
        c.hitboxWidth ?? c.width, c.hitboxHeight ?? c.height)
        .setDepth(906).setInteractive({ useHandCursor: true }));
      zone.on('pointerdown', (pointer, x, y, event) => {
        event?.stopPropagation?.(); fn();
      });
    };
    // Buttons are painted into megutate_select@2x.png: OK left, X right.
    action('confirm', { x: 258, y: 520, width: 60, height: 60 }, () => {
      if (this.switchMeguById(candidates[selected].id, 'evolve', cost)) {
        this.closeEvolutionPicker();
      }
    });
    action('cancel', { x: 340, y: 520, width: 60, height: 60 }, () => {
      this.closeEvolutionPicker();
    });
    const pending = [];
    previews.forEach(({def,key}) => {
      if (this.textures.exists(key)) return;
      this.characterAtlasQueuedKeys ||= new Set();
      if (!this.characterAtlasQueuedKeys.has(key)) {
        this.characterAtlasQueuedKeys.add(key);
        this.load.atlas(key, def.image || `assets/megu/${key}.png`,
          def.json || `assets/megu/${key}.json`);
      }
      pending.push(key);
    });
    const renderPreviews = () => {
      if (!this.evolutionPickerObjects || generation !== this.evolutionPickerGeneration) return;
      previews.forEach(({key,slot,placeholder}) => {
        const texture = this.textures.exists(key) ? this.textures.get(key) : null;
        const frame = texture && [key + '_3-2x', key + '_3-2', key + '_3', key + '_5']
          .find(name => texture.has(name));
        if (!frame) { placeholder.setText(key); return; }
        const img = add(this.add.image(slot.x, slot.bottom, key, frame)
          .setOrigin(0.5, 1).setDepth(903));
        const source = texture.get(frame);
        img.setScale(Math.min(180 / Math.max(1, source.width),
          215 / Math.max(1, source.height)));
        placeholder.destroy();
      });
    };
    if (pending.length) {
      this.load.once('complete', renderPreviews);
      if (!(this.load.isLoading && this.load.isLoading())) this.load.start();
    } else renderPreviews();
  },
  closeEvolutionPicker() {
    if (this.superDevolutionWheelHandler) this.input.off('wheel', this.superDevolutionWheelHandler);
    this.superDevolutionWheelHandler = null;
    this.evolutionPickerGeneration = (this.evolutionPickerGeneration || 0) + 1;
    const objects = this.evolutionPickerObjects ? this.evolutionPickerObjects.splice(0) : [];
    this.destroyUiObjects(objects);
    this.evolutionPickerObjects = null;
    this.evolutionPickerCards = null;
  },
  openSuperDevolutionPicker() {
    if (this.evolutionTransition && this.evolutionTransition.active) return false;
    if (this.menuOpen || (this.evolutionPickerObjects && this.evolutionPickerObjects.length)) return false;
    const quantity = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.superDevoMedicine) || 0));
    if (quantity <= 0) {
      this.showMedicineNotice('You need Super Devolution Medicine');
      return false;
    }

    const currentKey = this.normalizeMeguId(GAME_ATTRIBUTES.petId || 'ID1');
    const history = Array.isArray(GAME_ATTRIBUTES.pastPetIds) ? GAME_ATTRIBUTES.pastPetIds : [];
    const seen = new Set();
    const candidateDefs = [];
    // Newest previously visited form first. Exclude the active form because
    // selecting it would not produce a transformation.
    [...history].reverse().forEach(id => {
      const key = this.normalizeMeguId(id);
      if (!id || key === currentKey || seen.has(key)) return;
      seen.add(key);
      const index = this.findCharacterIndexById(id);
      if (index >= 0) candidateDefs.push(this.characterDefs[index]);
    });

    if (!candidateDefs.length) {
      this.showMedicineNotice('MEGU has no past evolution');
      return false;
    }

    // Reuse the exact Super Evolution character picker: same menu artwork,
    // three-row layout, thumbnails, scrolling, selection highlight and buttons.
    this.toggleMenu(true, { mode: 'superDevolution', candidateDefs });
    return !!this.menuOpen;
  },
  evolveRandom() {
    if (this.evolutionTransition && this.evolutionTransition.active) return false;
    const betaVoltamin = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.betaVoltamin) || 0));
    if (betaVoltamin <= 0) {
      this.showMedicineNotice('You need Beta-Voltamin');
      return false;
    }
    const currentDef = this.characterDefs[getCharacterIndex(this.characterDefs)] || null;
    const currentKey = this.normalizeMeguId(currentDef && currentDef.id || GAME_ATTRIBUTES.petId);
    const availableIds = Array.from(new Set((this.meguDescriptionRows || [])
      .map(row => String(row && row.id != null ? row.id : '').trim())
      .filter(id => id && this.findCharacterIndexById(id) >= 0)
      .filter(id => this.normalizeMeguId(id) !== currentKey)));

    if (!availableIds.length) {
      console.warn('[MEGU] No other available character IDs were found in megu_description.json.');
      return false;
    }

    const selectedId = availableIds[Math.floor(Math.random() * availableIds.length)];
    return this.switchMeguById(selectedId, 'evolve', { itemKey: 'betaVoltamin' });
  },
  toggleShinyForm() {
    if (this.evolutionTransition && this.evolutionTransition.active) return false;
    if (this.chargingRoomActive !== true) return false;
    const rainbowZ = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.rainbowZ) || 0));
    if (rainbowZ < 1) { this.showMedicineNotice('You need Rainbow Z'); return false; }
    const currentIndex = getCharacterIndex(this.characterDefs);
    return this.startEvolutionTransition(currentIndex, 'shiny', { itemKey: 'rainbowZ' });
  },
  showMedicineNotice(message) {
    if (typeof this.showMeguMessage === 'function') {
      this.showMeguMessage(message, false, 0, true);
    } else {
      console.warn('[MEGU]', message);
    }
  },
  useMeguMedicine(itemKey) {
    const effects = {
      elixir: () => {
        GAME_ATTRIBUTES.max_health = 1000;
        GAME_ATTRIBUTES.health = 1000;
        this.updateCurrentMeguMaxSatiety();
        GAME_ATTRIBUTES.satiety = Math.max(0, Math.round(Number(GAME_ATTRIBUTES.max_satiety) || 0));
        return 'Elixir restored MEGU';
      },
      voltamin: () => {
        // Charge level 3 is the maximum electricity display (99 W); level 4
        // is reserved for the evolution trigger and must not be granted here.
        this.addMedicineCharge(0, true);
        return 'Voltamin restored electricity';
      },
      voltaminLite: () => {
        // Voltamin-Lite may fill the meter, but medicine must never evolve MEGU.
        this.addMedicineCharge(1);
        return 'Voltamin-Lite added one charge';
      },
    };
    const key = String(itemKey || '');
    if (!Object.prototype.hasOwnProperty.call(effects, key)) return false;
    const quantity = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[key]) || 0));
    if (quantity <= 0) {
      this.showMedicineNotice(`Item was not used. You have no ${key === 'voltaminLite' ? 'Voltamin-Lite' : key.charAt(0).toUpperCase() + key.slice(1)}.`);
      return false;
    }
    // Medicines are consumed only when they can change the current state.
    // Check before invoking effects or decrementing inventory.
    if (key === 'elixir') {
      this.updateCurrentMeguMaxSatiety();
      const healthFull = Number(GAME_ATTRIBUTES.health) >= 1000;
      const maxSatiety = Math.max(0, Math.round(Number(GAME_ATTRIBUTES.max_satiety) || 0));
      const satietyFull = Number(GAME_ATTRIBUTES.satiety) >= maxSatiety;
      if (healthFull && satietyFull) {
        this.showMedicineNotice('Item was not used. Health and satiety are already full.');
        return false;
      }
    }
    if ((key === 'voltamin' || key === 'voltaminLite') &&
        Math.trunc(Number(GAME_ATTRIBUTES.charge) || 0) >= 3) {
      this.showMedicineNotice('Item was not used. Charge is already full.');
      return false;
    }
    const message = effects[key]();
    GAME_ATTRIBUTES[key] = quantity - 1;
    if (this.updateMedicineHud) this.updateMedicineHud();
    this.updateGameAttributeDisplay();
    persistGameAttributes();
    this.showMedicineNotice(message);
    return true;
  },
  devolution() {
    const currentDef = this.characterDefs[getCharacterIndex(this.characterDefs)] || null;
    const currentId = String(currentDef && currentDef.id || GAME_ATTRIBUTES.petId || '');
    const currentKey = this.normalizeMeguId(currentId);
    // The current form declares its own previous form in `degeneration`.
    // `change` remains the forward/evolution relationship only.
    const currentRow = (this.meguDescriptionRows || []).find(row =>
      this.normalizeMeguId(row && row.id) === currentKey
    );
    const previousId = currentRow && String(currentRow.degeneration == null ? '' : currentRow.degeneration).trim();
    if (Number(GAME_ATTRIBUTES.devoMedicine) <= 0) {
      this.showMedicineNotice('You need Devolution Medicine');
      return false;
    }
    if (!previousId) {
      this.showMedicineNotice('MEGU has no past evolution');
      return false;
    }
    if (!this.switchMeguById(previousId, 'devolve', { itemKey: 'devoMedicine' })) {
      this.showMedicineNotice('MEGU has no past evolution');
      console.warn(`[MEGU] No valid degeneration target is defined for character ${currentId}.`);
      return false;
    }
    return true;
  }
});
