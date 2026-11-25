/* MeguPettingMessages: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    isPetHit(pointer) {
      if (!pointer || !this.pet) return false;
      const sprite = this.characterSprite;
      if (sprite && sprite.active && sprite.visible && sprite.width > 0 && sprite.height > 0) {
        const bounds = sprite.getBounds();
        const padX = Math.max(10, bounds.width * 0.06);
        const padY = Math.max(8, bounds.height * 0.04);
        return pointer.x >= bounds.x - padX && pointer.x <= bounds.x + bounds.width + padX &&
          pointer.y >= bounds.y - padY && pointer.y <= bounds.y + bounds.height + padY;
      }
      // Fallback hitbox covers the character silhouette, not just the old small point above it.
      return Math.abs(pointer.x - this.pet.x) <= 76 &&
        pointer.y >= this.pet.y - 220 && pointer.y <= this.pet.y + 8;
    },
    beginPetting(pointer) {
      if (!pointer || this.chargingRoomActive || this.chargingRoomClosing || this.menuOpen || this.bathMode || this.evolutionPickerObjects || this.editMode || Number(GAME_ATTRIBUTES.health) <= 0 || !this.isPetHit(pointer)) return;
      this.pettingActive = true;
      this.pettingMoveMs = 0;
      this.pettingLastPointer = { x: pointer.x, y: pointer.y, time: this.time.now, inside: true };
      this.target.x = this.pet.x;
      this.target.y = this.pet.y;
      this.wander = false;
      this.clickMoveActive = false;
      this.look = Math.random() < 0.5 ? -1 : 1;
      this.nextIdleFacingAt = this.time.now + Phaser.Math.Between(1200, 3500);
      const canvas = this.game && this.game.canvas;
      if (canvas) {
        this.pettingPreviousCursor = canvas.style.cursor || '';
        // Hide the native cursor and render the supplied hand PNG inside the Phaser canvas.
        // This makes the hand visible at the game pointer coordinates even when CSS image
        // cursors are ignored or scaled differently by the browser.
        if (this.input && typeof this.input.setDefaultCursor === 'function') this.input.setDefaultCursor('none');
        canvas.style.cursor = 'none';
      }
      if (this.pettingHandSprite) { this.pettingHandSprite.destroy(); this.pettingHandSprite = null; }
      if (this.textures && this.textures.exists('petting-hand-cursor')) {
        this.pettingHandSprite = this.add.image(pointer.x, pointer.y, 'petting-hand-cursor')
          .setOrigin(0.08, 0.08)
          .setScale(0.5)
          .setDepth(100000)
          .setScrollFactor(0);
      }
    },
    trackPettingMovement(pointer) {
      if (this.chargingRoomActive || this.chargingRoomClosing || this.menuOpen || this.accessoryPickerOpen || this.accessoryEditorOpen || this.evolutionPickerObjects) { this.endPetting(); return; }
      if (!this.pettingActive || !pointer) return;
      if (!pointer.isDown) { this.endPetting(); return; }
      const canvas = this.game && this.game.canvas;
      if (canvas) canvas.style.cursor = 'none';
      // Keep the visible hand sprite exactly attached to the current pointer while held.
      if (this.pettingHandSprite && this.pettingHandSprite.active) {
        this.pettingHandSprite.setPosition(pointer.x, pointer.y).setVisible(true);
      }
      const now = this.time.now;
      const friendTarget=this.friendPettingTarget;
      const inside = !this.editMode && (friendTarget ? this.isFriendPetHit(pointer,friendTarget) : Number(GAME_ATTRIBUTES.health) > 0 && this.isPetHit(pointer));
      const previous = this.pettingLastPointer;
      if (!inside) {
        // Pause rubbing-time accumulation outside the hitbox, but preserve accrued
        // progress. Re-entering the hitbox resumes from the previous progress.
        this.pettingLastPointer = { x: pointer.x, y: pointer.y, time: now, inside: false };
        return;
      }
      if (previous && previous.inside) {
        const distance = Math.hypot(pointer.x - previous.x, pointer.y - previous.y);
        if (distance >= 0.75) {
          // Count only time associated with actual in-hitbox pointer motion. Cap gaps
          // between events so a pause/stall cannot complete the rubbing threshold.
          this.pettingMoveMs += Phaser.Math.Clamp(now - previous.time, 0, 50);
          // 0.9-second rubbing threshold; each successful rub resets the timer.
          if (this.pettingMoveMs >= 900) {
            this.pettingMoveMs = 0;
            if(friendTarget){this.actFriendPet(friendTarget);this.pettingLastPointer={x:pointer.x,y:pointer.y,time:now,inside:true};return;}
            this.petClickUntil = now + 1000;
            this.target.x = this.pet.x;
            this.target.y = this.pet.y;
            this.wander = false;
            this.clickMoveActive = false;
            this.act('pet');
          }
        }
      }
      this.pettingLastPointer = { x: pointer.x, y: pointer.y, time: now, inside: true };
    },
    endPetting() {
      if (!this.pettingActive) return;
      this.pettingActive = false;
      this.friendPettingTarget = null;
      this.pettingMoveMs = 0;
      this.pettingLastPointer = null;
      if (this.pettingHandSprite) { this.pettingHandSprite.destroy(); this.pettingHandSprite = null; }
      const canvas = this.game && this.game.canvas;
      const restoreCursor = this.pettingPreviousCursor || '';
      if (this.input && typeof this.input.setDefaultCursor === 'function') this.input.setDefaultCursor(restoreCursor || 'default');
      if (canvas) canvas.style.cursor = restoreCursor || 'default';
      this.pettingPreviousCursor = '';
    },
    popHeart(forcedKey = null, friendshipGain = 0) {
      const roll = Math.random();
      const key = forcedKey || (roll < 0.60 ? 'heart-s' : (roll < 0.90 ? 'heart-m' : 'heart-l'));
      // Use only the configured heart sprites. Do not fall back to the legacy text heart.
      if (!this.textures.exists(key)) return;
  
      // Center each heart horizontally over MEGU, then float it upward.
      const x = this.pet.x;
      const y = this.pet.y - 100;
      const heart = this.add.image(x, y, key).setOrigin(0.5).setScale(0.5).setDepth(8);
      const animatedEffects = [heart];
      const gain = Math.max(0, Math.trunc(Number(friendshipGain) || 0));
      if (gain > 0) {
        const gainX = x + heart.displayWidth / 2 + 8;
        // Draw a 6px white stroke underneath the 3px pink stroke, leaving
        // approximately 3px of white visible as the outer outline.
        const gainOuterOutline = this.add.text(gainX, y, `+${gain}`, {
          fontFamily: 'Arial, sans-serif', fontSize: '30px',
          color: '#ffd6d6', stroke: '#ffffff', strokeThickness: 6,
          align: 'left'
        }).setOrigin(0, 0.5).setDepth(9);
        const gainLabel = this.add.text(gainX, y, `+${gain}`, {
          fontFamily: 'Arial, sans-serif', fontSize: '30px',
          color: '#ffd6d6', stroke: '#ff89a1', strokeThickness: 3,
          align: 'left'
        }).setOrigin(0, 0.5).setDepth(10);
        animatedEffects.push(gainOuterOutline, gainLabel);
      }
      // The reward label shares the heart's rise and fade so it stays alongside it.
      this.tweens.add({
        targets: animatedEffects, y: y - 70, alpha: 0, duration: 900,
        onComplete: () => animatedEffects.forEach(effect => effect.destroy())
      });
    },
    act(a) {
      if (a === 'pet') {
        if (this.audioUnlocked && this.cache.audio.exists('pet-sfx')) this.sound.play('pet-sfx', { volume: this.sfxVolume });
        const criticalHit = Math.random() < 0.05;
        const friendshipRatio = criticalHit ? 0.05 : 0.01;
        const friendshipRequirement = Number(GAME_ATTRIBUTES.max_friendship) || this.getFriendshipRequirement(GAME_ATTRIBUTES.level);
        const pettingReward = this.visitingHouse ? 0 : Math.max(1, Math.round(friendshipRequirement * friendshipRatio));
        const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
        const atlasKey = activeDef ? meguTextureKey(activeDef.id, GAME_ATTRIBUTES.shiny === true) : 'ID1';
        const atlas = this.textures.exists(atlasKey) ? this.textures.get(atlasKey) : null;
        const poseCandidates = criticalHit
          ? [`${atlasKey}_10-2x`, `${atlasKey}_10`]
          : [`${atlasKey}_11-2x`, `${atlasKey}_11`];
        this.petClickFrame = atlas ? (poseCandidates.find(frame => atlas.has(frame)) || null) : null;
        this.pettingCount = (this.pettingCount || 0) + 1;
        let stressBonus = 0;
        if (!this.visitingHouse && GAME_ATTRIBUTES.stressAction === 'pet8') {
          GAME_ATTRIBUTES.stressPetCount = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.stressPetCount) || 0)) + 1;
          if (GAME_ATTRIBUTES.stressPetCount >= 8) stressBonus = this.consumeStressAction('pet8');
        }
        const totalPettingReward = pettingReward + stressBonus;
        if (totalPettingReward > 0) this.addFriendship(totalPettingReward, stressBonus ? 'stress-petting' : 'petting');
        this.joyUntil = this.game.loop.time + 2000;
        if (stressBonus) this.beginStressCelebration(totalPettingReward);
        else this.popHeart(null, pettingReward);
        if (!this.visitingHouse && !stressBonus && this.pettingCount % 4 === 0 && this.touchMessagePhrases && this.touchMessagePhrases.length) {
          const phrase = this.touchMessagePhrases[Phaser.Math.Between(0, this.touchMessagePhrases.length - 1)];
          this.showMeguMessage(phrase, false, 3000);
        }
        if (!this.visitingHouse) save();
      }
    },
    playRandomMeguVoice(time) {
      if (this.levelUpRewardState || !this.audioUnlocked || !this.meguVoiceSounds || !this.meguVoiceSounds.length) return;
      const index = Phaser.Math.Between(0, this.meguVoiceSounds.length - 1);
      const sound = this.meguVoiceSounds[index];
      const key = `SE_megu${index + 1}.wav`;
      // Keep voice clips mutually exclusive so the label always identifies the sound heard.
      this.meguVoiceSounds.forEach(other => { if (other !== sound && other.isPlaying) other.stop(); });
      this.currentMeguVoiceKey = key;
      // Do not show the currently-playing voice/SFX key on the base screen.
      sound.setVolume(this.sfxVolume);
      sound.once('complete', () => {
        if (this.currentMeguVoiceKey === key) {
          this.currentMeguVoiceKey = '';
          // No on-screen SFX debug label.
        }
      });
      sound.play();
      if (!this.friendPets || !this.friendPets.length) this.showRandomMeguMessage();
      // Randomize every interval from 5 to 10 seconds (about 7.5 seconds on average).
      this.nextMeguVoiceAt = time + Phaser.Math.Between(5000, 10000);
    },
    showRandomMeguMessage() {
      if (this.levelUpRewardState) return;
      const phrases = this.meguMessagePhrases || [];
      if (!phrases.length) return;
      this.showMeguMessage(phrases[Phaser.Math.Between(0, phrases.length - 1)]);
    },
    showFoodReaction(messageIndex, overlay = false) {
      const phrases = this.foodMessagePhrases || [];
      if (!phrases.length) return;
      const index = Phaser.Math.Clamp(Math.trunc(Number(messageIndex) || 0), 0, phrases.length - 1);
      // Food reactions use the food_message.json phrase verbatim, without the pet-name prefix.
      this.showMeguMessage(phrases[index], overlay, 0, true);
    },
    showLevelUpRewardSequence(rewards) {
      const queue = (Array.isArray(rewards) ? rewards : []).filter(reward => reward && reward.message);
      if (!queue.length) return;
      // Stop an in-progress petting gesture before making the reward screen modal,
      // and restart the ambient voice timer so it won't fire immediately on close.
      if (this.pettingActive) this.endPetting();
      if (this.audioUnlocked) this.nextMeguVoiceAt = this.time.now + Phaser.Math.Between(5000, 10000);
      if (this.levelUpRewardState && this.levelUpRewardState.container && this.levelUpRewardState.container.active) {
        this.levelUpRewardState.container.destroy(true);
      }
      this.levelUpRewardState = { queue, index: 0, container: null, temporaryTextureKey: null, atlasKey: null };
      this.showLevelUpRewardAtIndex(0);
    },
    showLevelUpRewardAtIndex(index) {
      const state = this.levelUpRewardState;
      if (!state || index < 0 || index >= state.queue.length) {
        if (state) this.levelUpRewardState = null;
        return;
      }
      if (state.container && state.container.active) state.container.destroy(true);
      if (state.temporaryTextureKey && this.textures.exists(state.temporaryTextureKey)) this.removeTextureIfUnused(state.temporaryTextureKey);
      state.temporaryTextureKey = null;
      state.atlasKey = null;
      state.index = index;
      const reward = state.queue[index];
      const layout = (id, fallback) => MeguMenuLayouts.button(this, 'level_reward', id, fallback);
      const popup = layout('panel', { x: W / 2 - 235, y: 155, width: 470, height: 330 });
      const popupCenterX = popup.x + popup.width / 2;
      const popupCenterY = popup.y + popup.height / 2;
      const local = (id, fallback) => {
        const item = layout(id, fallback);
        return { ...item, cx: item.x + item.width / 2 - popupCenterX, cy: item.y + item.height / 2 - popupCenterY };
      };
      const imageArea = local('reward_image', { x: W / 2 - 60, y: 170, width: 120, height: 120 });
      const messageArea = local('message', { x: W / 2 - 135, y: 333, width: 270, height: 66 });
      const closeArea = local('close', { x: W / 2 - 24, y: 427, width: 48, height: 48 });
      const container = this.add.container(popupCenterX, popupCenterY).setDepth(1200);
      state.container = container;
  
      // An invisible modal surface consumes taps outside the close button. The
      // reward can only advance/dismiss through the explicit close image.
      const blocker = this.add.rectangle(0, 0, 1280, 1280, 0xffffff, 0).setInteractive();
      blocker.setDepth(0);
      container.add(blocker);
  
      // White reward-image frame. Use a native rectangle GameObject so it is
      // reliably rendered as a child of the reward container on every renderer.
      const imageBox = this.add.rectangle(imageArea.cx, imageArea.cy, imageArea.width, imageArea.height, 0xffffff, 1)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0xd8d8d8, 1);
      imageBox.setDepth(1);
      container.add(imageBox);
  
      // Expand the existing speech-card background to surround the complete
      // reward layout: 10px above the 120x120 item frame and 10px below the
      // 48px close button. The frame spans y=-155..-35 and the close button
      // spans y=107..155, fitting the centered 470x330 medium background.
      const rewardCardTop = -155;
      const rewardCardBottom = 155;
      const rewardCardHeight = rewardCardBottom - rewardCardTop;
      const rewardCardCenterY = (rewardCardTop + rewardCardBottom) / 2;
      let rewardMessageBackground;
      if (this.textures.exists('level-reward-message-bg')) {
        // Dedicated medium artwork for reward popups only; keep its 470x330
        // dimensions and center it on the reward container.
        rewardMessageBackground = this.add.image(0, 0, 'level-reward-message-bg')
          .setOrigin(0.5)
          .setDisplaySize(popup.width, popup.height);
      } else {
        rewardMessageBackground = this.add.rectangle(0, 0, popup.width, popup.height, 0x26392b, 0.96)
          .setOrigin(0.5)
          .setStrokeStyle(2, 0x8bd889);
      }
      rewardMessageBackground.setDepth(0);
      container.add(rewardMessageBackground);
  
      const addRewardImage = (key, frame, sourceWidth, sourceHeight) => {
        if (!container.active || !this.textures.exists(key)) return;
        const image = this.add.image(imageArea.cx, imageArea.cy, key, frame);
        image.setOrigin(0.5);
        const width = Math.max(1, Number(sourceWidth) || image.width || 1);
        const height = Math.max(1, Number(sourceHeight) || image.height || 1);
        const scale = Math.min((imageArea.width - 12) / width, (imageArea.height - 12) / height);
        image.setScale(scale).setDepth(2);
        container.add(image);
      };
  
      if (reward.type === 'gold') {
        if (this.textures.exists('level-reward-gold')) addRewardImage('level-reward-gold');
      } else if (reward.type === 'food' && reward.item) {
        const item = reward.item;
        const atlas = this.findTransientAtlasConfig(item.key);
        if (atlas) {
          state.atlasKey = atlas.key;
          this.loadTransientAtlas(atlas).then(loaded => {
            if (loaded && container.active && this.textures.exists(item.key) && this.textures.get(item.key).has(item.frame)) {
              const frame = this.textures.get(item.key).get(item.frame);
              addRewardImage(item.key, item.frame, frame && frame.width, frame && frame.height);
            }
          });
        }
      } else if (reward.type === 'furniture' && reward.item) {
        const item = reward.item;
        if (this.textures.exists(item.assetKey)) addRewardImage(item.assetKey);
        else {
          const key = item.assetKey;
          this.load.once(`filecomplete-image-${key}`, () => {
            if (container.active && this.textures.exists(key)) addRewardImage(key);
            else if (this.textures.exists(key) && !this.isFurnitureImageUsed(key)) this.removeTextureIfUnused(key);
          });
          this.queueFurnitureImage(item, true);
        }
      } else if (reward.type === 'house' && reward.item) {
        const item = reward.item;
        this.loadBackgroundThumbnailSource(item).then(sourceInfo => {
          if (!sourceInfo || !sourceInfo.image || !container.active) {
            if (sourceInfo && sourceInfo.temporary && sourceInfo.image) sourceInfo.image.src = '';
            return;
          }
          const key = `level-reward-house-${String(item.id).replace(/[^a-z0-9_-]/gi, '-')}`;
          if (!this.textures.exists(key)) {
            const texture = this.textures.createCanvas(key, 120, 120);
            if (texture) {
              const ctx = texture.getContext();
              const source = sourceInfo.image;
              const sw = Math.max(1, source.naturalWidth || source.width || 1);
              const sh = Math.max(1, source.naturalHeight || source.height || 1);
              const scale = Math.min(108 / sw, 108 / sh);
              const dw = sw * scale, dh = sh * scale;
              ctx.clearRect(0, 0, 120, 120);
              ctx.imageSmoothingEnabled = true;
              if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(source, (120 - dw) / 2, (120 - dh) / 2, dw, dh);
              texture.refresh();
              state.temporaryTextureKey = key;
              addRewardImage(key);
            }
          } else {
            state.temporaryTextureKey = key;
            addRewardImage(key);
          }
          if (sourceInfo.temporary && sourceInfo.image) sourceInfo.image.src = '';
        });
      }
  
      const message = this.add.text(messageArea.cx, messageArea.cy, reward.message, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#c9ff9f',
        stroke: '#18351b', strokeThickness: 3,
        align: 'center', wordWrap: { width: messageArea.width }, maxLines: 3,
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5, 0.5).setDepth(3);
      this.fitTextToBounds(message, reward.message, {
        width: messageArea.width, height: messageArea.height, baseSize: 16, jaBaseSize: 16,
        jaMinSize: 8, jaMaxLines: 3, enBaseSize: 16, enMaxLines: 3
      });
      container.add(message);
  
      if (this.textures.exists('level-reward-close')) {
        const close = this.add.image(closeArea.cx, closeArea.cy, 'level-reward-close').setOrigin(0.5).setDepth(4);
        const source = this.textures.get('level-reward-close').getSourceImage();
        const sw = Math.max(1, source && source.width || close.width || 1);
        const sh = Math.max(1, source && source.height || close.height || 1);
        const scale = Math.min(closeArea.width / sw, closeArea.height / sh);
        close.setScale(scale).setInteractive({ useHandCursor: true });
        const closeHitbox = this.add.zone(
          (closeArea.hitboxX ?? closeArea.x) + (closeArea.hitboxWidth ?? closeArea.width) / 2 - popupCenterX,
          (closeArea.hitboxY ?? closeArea.y) + (closeArea.hitboxHeight ?? closeArea.height) / 2 - popupCenterY,
          closeArea.hitboxWidth ?? closeArea.width, closeArea.hitboxHeight ?? closeArea.height
        ).setInteractive({ useHandCursor: true }).setDepth(5);
        closeHitbox.on('pointerdown', pointer => {
          if (pointer && pointer.event && pointer.event.stopPropagation) pointer.event.stopPropagation();
          if (!this.levelUpRewardState || this.levelUpRewardState.container !== container) return;
          const nextIndex = state.index + 1;
          if (container.active) container.destroy(true);
          if (state.temporaryTextureKey && this.textures.exists(state.temporaryTextureKey)) this.removeTextureIfUnused(state.temporaryTextureKey);
          if (state.atlasKey) this.releaseUnusedFoodAtlases();
          state.index = -1;
          if (reward.type === 'furniture' && reward.item && !this.isFurnitureImageUsed(reward.item.assetKey)) {
            this.removeTextureIfUnused(reward.item.assetKey);
            if (this.furnitureImageLoadKeys) this.furnitureImageLoadKeys.delete(reward.item.assetKey);
          }
          state.container = null;
          state.temporaryTextureKey = null;
          state.atlasKey = null;
          if (nextIndex < state.queue.length) this.showLevelUpRewardAtIndex(nextIndex);
          else this.levelUpRewardState = null;
        });
        container.add([close, closeHitbox]);
      }
    },
    showMeguMessage(phrase, overlay = false, minimumDisplayMs = 0, suppressPetName = false, allowVisitingHouse = false) {
      // Reward screens suppress all ordinary/random character message popups.
      if (this.levelUpRewardState) return;
      // Speech/messages are disabled in another player's house; petting remains
      // the only permitted interaction and must not trigger room messages.
      if (this.messageBoardUi || (this.visitingHouse && !allowVisitingHouse) || this.editMode || this.accessoryPickerOpen || this.accessoryEditorOpen || !phrase) return;
  
      // A touch message must remain visible for at least three seconds. If another
      // message arrives during that window, keep only the latest one and show it
      // once the protected interval has elapsed.
      const hasCurrentMessage = this.meguMessageContainer && this.meguMessageContainer.active;
      const remainingMinimum = this.meguMessageMinUntil - this.time.now;
      if (hasCurrentMessage && remainingMinimum > 0) {
        this.pendingMeguMessage = { phrase, overlay, minimumDisplayMs, suppressPetName, allowVisitingHouse };
        if (this.meguMessageDeferredTimer) this.meguMessageDeferredTimer.remove(false);
        this.meguMessageDeferredTimer = this.time.delayedCall(remainingMinimum, () => {
          this.meguMessageDeferredTimer = null;
          const pending = this.pendingMeguMessage;
          this.pendingMeguMessage = null;
          if (pending) this.showMeguMessage(pending.phrase, pending.overlay, pending.minimumDisplayMs, pending.suppressPetName, pending.allowVisitingHouse);
        });
        return;
      }
  
      // Only one speech card is displayed at once; a new message replaces the previous card.
      if (this.meguMessageTimer) {
        this.meguMessageTimer.remove(false);
        this.meguMessageTimer = null;
      }
      if (this.meguMessageContainer && this.meguMessageContainer.active) {
        this.meguMessageContainer.destroy(true);
      }
  
      let message = String(phrase);
      if (!suppressPetName) {
        const def = (this.characterDefs || [])[getCharacterIndex(this.characterDefs)] || {};
        const record = this.localizedRecord ? this.localizedRecord(this.characterRecordsById, def.id) : {};
        const characterName = String(GAME_ATTRIBUTES.petName || '').trim() || record.name ||
          (this.localizedName ? this.localizedName(this.characterNamesById || new Map(), def.id, def.name || def.id) : (def.name || def.id)) || 'MEGU';
        message = `${characterName} ${message}`;
      }
  
      // Refusal messages can be displayed above an open menu without closing it.
      const card = this.add.container(W / 2, 200).setDepth(overlay ? 100 : 14);
      let background;
      // The speech-bar artwork spans the full 640px play canvas, centered at x=320.
      const cardWidth = W;
      if (this.textures.exists('megu-message-bg')) {
        const sourceImage = this.textures.get('megu-message-bg').getSourceImage();
        const sourceWidth = Math.max(1, sourceImage && sourceImage.width || W);
        const sourceHeight = Math.max(1, sourceImage && sourceImage.height || 100);
        const scale = W / sourceWidth;
        background = this.add.image(0, 0, 'megu-message-bg').setOrigin(0.5).setScale(scale);
        // Preserve the image aspect ratio while stretching its display width to the canvas width.
        background.setDisplaySize(W, sourceHeight * scale);
      } else {
        // Fallback panel also spans the full canvas width when artwork is unavailable.
        background = this.add.rectangle(0, 0, W, 82, 0x26392b, 0.96)
          .setStrokeStyle(2, 0x8bd889);
      }
      card.add(background);
      const text = this.add.text(0, 0, message, {
        fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#c9ff9f',
        stroke: '#18351b', strokeThickness: 3,
        align: 'center', wordWrap: { width: W - 32 },
        maxLines: 3, padding: { x: 8, y: 4 }
      }).setOrigin(0.5, 0.5);
      this.fitTextToBounds(text, message, { width: W - 32, height: 62, baseSize: 20, jaBaseSize: 20, jaMinSize: 8, jaMaxLines: 3, enBaseSize: 20, enMaxLines: 3 });
      card.add(text);
      this.meguMessageContainer = card;
      this.meguMessageMinUntil = minimumDisplayMs > 0 ? this.time.now + Math.max(3000, minimumDisplayMs) : 0;
      this.meguMessageTimer = this.time.delayedCall(5000, () => {
        if (card.active) card.destroy(true);
        if (this.meguMessageContainer === card) this.meguMessageContainer = null;
        this.meguMessageTimer = null;
      });
    },
    tick() {
      // Visiting another player's house is read-only; suppress the periodic save heartbeat.
      if (this.editMode || this.visitingHouse) return;
      gameAttributeSaveTick = (gameAttributeSaveTick + 1) % 5;
      if (gameAttributeSaveTick === 0) save();
    }
});
