/* MeguFurnitureEditing: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    startEdit(item, consumeInventory = true) {
      if (!item || item.id == null) return;
      if (consumeInventory && !this.furnitureStoreMode && this.getFurnitureInventoryCount(item.id) > 0) this.removeFurnitureFromInventory(item.id, 1);
      this.toggleFurn(false);
      if (item.animation) this.queueFurnitureAnimation(item, true);
      else this.queueFurnitureImage(item, true);
      const placedFurniture = {
        kind: 'furniture',
        furnitureId: String(item.id),
        assetStem: String(item.assetStem || `KG${item.id}`),
        jukeboxFlag: !!item.jukeboxFlag,
        x: W / 2, y: 430, flipX: false
      };
      GAME_ATTRIBUTES.furn.push(placedFurniture);
      // A newly placed item is the newest selection; the prior selection becomes
      // the second-highest layer while all other saved furniture ordering stays intact.
      this.prioritizeFurnitureSelection(placedFurniture);
      this.editIdx = GAME_ATTRIBUTES.furn.length - 1;
      this.lastFurnitureClick = null;
      this.setEdit(true);
      save();
      this.updateGameAttributeDisplay();
    },
    isOverFurnitureDeleteZone(x, y) {
      const z = this.deleteDropZoneBounds;
      return !!z && x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height;
    },
    syncFurnitureDeleteZone(pointerX = -9999, pointerY = -9999) {
      if (!this.deleteDropZoneBg || !this.deleteDropZoneText) return;
      const visible = !!this.editMode;
      const draggingOver = visible && !!(this.drag && this.drag.moved) && this.isOverFurnitureDeleteZone(pointerX, pointerY);
      this.deleteDropZoneBg.setVisible(visible).setAlpha(draggingOver ? 0.65 : 1);
      this.deleteDropZoneText.setVisible(visible)
        .setText(draggingOver ? 'Release to delete' : 'Remove furniture')
        .setStyle({ fontSize: '11px', wordWrap: { width: 85 } });
    },
    ensureFurnitureDepthOrder() {
      const items = Array.isArray(GAME_ATTRIBUTES.furn) ? GAME_ATTRIBUTES.furn : [];
      const validItems = new Set(items);
      const uniqueValidOrder = source => {
        const seen = new Set();
        const result = [];
        for (const item of source || []) {
          if (validItems.has(item) && !seen.has(item)) {
            seen.add(item);
            result.push(item);
          }
        }
        return result;
      };
  
      let order = uniqueValidOrder(this.furnitureDepthOrder);
      if (!this.furnitureDepthOrderInitialized) {
        // Start new depth ordering from the current saved furniture array order.
        // Legacy saved-rank and Y-position migration is intentionally retired.
        order = items.slice();
        this.furnitureDepthOrderInitialized = true;
      }
  
      // Remove stale/duplicate references and append new furniture without reordering existing items.
      order = uniqueValidOrder(order);
      const inOrder = new Set(order);
      for (const item of items) {
        if (!inOrder.has(item)) {
          inOrder.add(item);
          order.push(item);
        }
      }
      this.furnitureDepthOrder = order;
      this.syncFurnitureDepthOrderRanks();
      return order;
    },
    syncFurnitureDepthOrderRanks() {
      const order = Array.isArray(this.furnitureDepthOrder) ? this.furnitureDepthOrder : [];
      order.forEach((item, index) => {
        if (item && typeof item === 'object') item.depthOrder = index; // bottom = 0, frontmost = length - 1
      });
    },
    captureFurnitureEditBaseOrder() {
      // Kept as the edit-mode entry hook, but no longer snapshots/recalculates
      // depths: the explicit array persists across selection, dragging, and exit.
      this.ensureFurnitureDepthOrder();
    },
    getFurnitureDepthMap() {
      const order = this.ensureFurnitureDepthOrder();
      const depths = new Map();
      // Fit all furniture between the room plane and the main UI regardless of
      // how many items exist. The order array decides all overlaps; Y never does.
      const minDepth = 0.2, maxDepth = 1.8, count = order.length;
      order.forEach((item, index) => {
        const depth = minDepth + ((index + 1) / (count + 1)) * (maxDepth - minDepth);
        depths.set(item, depth);
      });
      return depths;
    },
    prioritizeFurnitureSelection(item) {
      if (!item || !Array.isArray(GAME_ATTRIBUTES.furn) || !GAME_ATTRIBUTES.furn.includes(item)) return;
      const order = this.ensureFurnitureDepthOrder();
      const currentIndex = order.indexOf(item);
      if (currentIndex !== -1) order.splice(currentIndex, 1);
      order.push(item); // The newest selection is always the highest-ranked array entry.
      this.furnitureDepthOrder = order;
      this.syncFurnitureDepthOrderRanks();
      save();
    },
    openMessageBoardUi(visitorMode = false) {
      if (this.isUnifiedMenuBlockingHomeInput()) return;
      if (this.messageBoardUi) return;
      const visit = visitorMode && this.visitingHouse;
      const house = visit ? this.visitingHouse.house : null;
      const messages = visit
        ? (Array.isArray(house.messageBoardMessages) ? house.messageBoardMessages : [])
        : (Array.isArray(GAME_ATTRIBUTES.messageBoardMessages) ? GAME_ATTRIBUTES.messageBoardMessages : []);

      const disabledInputs = [];
      this.children.list.forEach(object => {
        if (object && object.active && object.input && object.input.enabled) {
          disabledInputs.push(object);
          object.input.enabled = false;
        }
      });
      this.endPetting();
      this.pettingActive = false;
      this.bathPointerDown = false;
      this.baseStatsSwipeStart = null;
      if (this.meguMessageDeferredTimer) { this.meguMessageDeferredTimer.remove(false); this.meguMessageDeferredTimer = null; }
      if (this.meguMessageTimer) { this.meguMessageTimer.remove(false); this.meguMessageTimer = null; }
      if (this.meguMessageContainer && this.meguMessageContainer.active) this.meguMessageContainer.destroy(true);
      this.meguMessageContainer = null;
      this.pendingMeguMessage = null;

      const boardLayout = (id, x, y, width, height) =>
        MeguMenuLayouts.button(this, 'message_board', id, { x, y, width, height });
      const objects = [];
      const add = object => { objects.push(object); return object; };
      const makeText = (x, y, text, style = {}) =>
        add(this.add.text(x, y, text, { fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#f4edb4', ...style })
          .setDepth(120).setScrollFactor(0));
      const panel = boardLayout('panel', 16, 95, 608, 462);
      add(this.add.image(panel.x + panel.width / 2, panel.y + panel.height / 2, 'message-board-ui-background').setDisplaySize(panel.width, panel.height).setDepth(118).setScrollFactor(0));

      const pet = visit ? String(house.petName || 'MEGU') : String(GAME_ATTRIBUTES.petName || 'MEGU');
      const titleLayout = boardLayout('title', 160, 107, 320, 20);
      makeText(titleLayout.x + titleLayout.width / 2, titleLayout.y + titleLayout.height / 2, `${pet}'s Message Board`, {
        fontSize: '20px', fontStyle: 'bold', color: '#fff2a5'
      }).setOrigin(0.5);

      // The close button is inset 10px from the top and 16px from the right edge.
      const closeKey = 'message-board-close';
      const okKey = 'message-board-ok';
      const closeTexture = this.textures.get(closeKey).getSourceImage();
      const closeWidth = closeTexture.width, closeHeight = closeTexture.height;
      const closeLayout = boardLayout('close', 624 - 16 - closeWidth, 105, closeWidth, closeHeight);
      const closeButton = add(this.add.image(closeLayout.x + closeLayout.width / 2, closeLayout.y + closeLayout.height / 2, closeKey)
        .setDisplaySize(closeLayout.width, closeLayout.height)
        .setDepth(125).setScrollFactor(0).setInteractive({ useHandCursor: true }));
      const closeHit = boardLayout('close', closeLayout.x, closeLayout.y, closeLayout.width, closeLayout.height);
      if (closeHit.hitboxWidth != null || closeHit.hitboxHeight != null || closeHit.hitboxX != null || closeHit.hitboxY != null) {
        const hitX = closeHit.hitboxX ?? closeHit.x, hitY = closeHit.hitboxY ?? closeHit.y;
        const hitW = closeHit.hitboxWidth ?? closeHit.width, hitH = closeHit.hitboxHeight ?? closeHit.height;
        closeButton.input.hitArea.setTo((hitX - closeLayout.x) * closeWidth / closeLayout.width,
          (hitY - closeLayout.y) * closeHeight / closeLayout.height,
          hitW * closeWidth / closeLayout.width, hitH * closeHeight / closeLayout.height);
      }

      const listLayout = boardLayout('message_list', 32, 151, 562, 348);
      const listTop = listLayout.y, listBottom = listLayout.y + listLayout.height;
      const lineHeight = boardLayout('message_row', 32, 151, 562, 74).height;
      const rows = [];
      let scroll = 0, closed = false, posting = false;
      const maxScroll = () => Math.max(0, messages.length * lineHeight - (listBottom - listTop));
      const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
      maskShape.fillStyle(0xffffff).fillRect(listLayout.x, listTop, listLayout.width, listBottom - listTop);
      const rowMask = maskShape.createGeometryMask();

      const trackLayout = boardLayout('scrollbar', 600.5, 151, 9, 348);
      const trackX = trackLayout.x + trackLayout.width / 2, trackTop = trackLayout.y, trackHeight = trackLayout.height;
      add(this.add.rectangle(trackX, trackTop + trackHeight / 2, trackLayout.width, trackHeight, 0x24351d, 0.85)
        .setStrokeStyle(1, 0xb5b58b).setDepth(123).setScrollFactor(0));
      const thumb = add(this.add.rectangle(trackX, trackTop + 20, 7, 40, 0xe8dca1)
        .setDepth(124).setScrollFactor(0).setInteractive({ useHandCursor: true }));
      const scrollbarHit = add(this.add.zone(trackX, trackTop + trackHeight / 2, 22, trackHeight)
        .setDepth(123).setScrollFactor(0).setInteractive({ useHandCursor: true }));

      const redraw = () => {
        rows.forEach(o => { if (o && o.active) o.destroy(); });
        rows.length = 0;
        const ordered = messages.slice().sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        scroll = Phaser.Math.Clamp(scroll, 0, maxScroll());
        ordered.forEach((message, index) => {
          const y = listTop + index * lineHeight - scroll;
          if (y < listTop - lineHeight || y > listBottom) return;
          const own = !!message.isOwner;
          const iconKey = own ? 'message-board-owner-icon' : 'message-board-visitor-icon';
          const push = object => { object.setMask(rowMask); rows.push(object); return object; };
          if (this.textures.exists(iconKey)) {
            push(this.add.image(47, y + 12, iconKey).setDisplaySize(22, 22).setDepth(121).setScrollFactor(0));
          }
          const name = String(message.ownerName || message.username || 'Visitor');
          const petName = String(message.petName || 'MEGU');
          const date = new Date(message.createdAt || Date.now());
          const stamp = Number.isNaN(date.getTime()) ? '' :
            `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          push(this.add.text(64, y, `${name}'s ${petName}   ${stamp}`, {
            fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f2df73'
          }).setDepth(121).setScrollFactor(0));
          push(this.add.text(38, y + 24, String(message.text || ''), {
            fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#ffffff',
            wordWrap: { width: 540 }, maxLines: 2
          }).setDepth(121).setScrollFactor(0));
          const line = this.add.graphics().lineStyle(1, 0xd8d49a, 0.85)
            .lineBetween(36, y + 65, 590, y + 65).setDepth(121).setScrollFactor(0);
          push(line);
        });
        const totalHeight = Math.max(trackHeight, messages.length * lineHeight);
        const thumbHeight = Math.max(28, trackHeight * trackHeight / totalHeight);
        thumb.setSize(7, thumbHeight).setDisplaySize(7, thumbHeight);
        thumb.y = trackTop + thumbHeight / 2 +
          (maxScroll() ? scroll / maxScroll() * (trackHeight - thumbHeight) : 0);
      };

      const wheel = (pointer, dx, dy) => {
        if (!this.messageBoardUi) return;
        scroll = Phaser.Math.Clamp(scroll + dy * 0.7, 0, maxScroll());
        redraw();
      };
      this.input.on('wheel', wheel);
      const scrollToPointer = pointer => {
        const fraction = Phaser.Math.Clamp((pointer.y - trackTop) / trackHeight, 0, 1);
        scroll = fraction * maxScroll();
        redraw();
      };
      scrollbarHit.on('pointerdown', scrollToPointer);
      thumb.on('pointerdown', scrollToPointer);
      this.input.setDraggable(thumb);
      thumb.on('drag', pointer => scrollToPointer(pointer));

      // Native editable field over the Phaser canvas, positioned in canvas pixels.
      // The green composer spans 608px; text remains confined to the left of OK.
      const composerLayout = boardLayout('input_background', 16, 564, 608, 48);
      const textLayout = boardLayout('text_input', 16, 564, 548, 48);
      const okLayout = boardLayout('ok', 568, 566, 48, 44);
      const canvas = this.game.canvas;
      const inputBackground = document.createElement('div');
      Object.assign(inputBackground.style, {
        position: 'fixed', zIndex: '9999', boxSizing: 'border-box',
        background: 'rgb(51, 77, 0)', border: '4px solid rgb(234, 155, 71)', borderRadius: '4px',
        pointerEvents: 'none'
      });
      document.body.appendChild(inputBackground);
      const input = document.createElement('textarea');
      input.maxLength = 180;
      input.rows = 1;
      input.placeholder = 'Write a message...';
      input.setAttribute('aria-label', 'Message board text');
      Object.assign(input.style, {
        position: 'fixed', zIndex: '10000', boxSizing: 'border-box',
        resize: 'none', overflowY: 'auto', padding: '12px 10px 4px',
        background: 'transparent', border: 'none', borderRadius: '0',
        color: '#ffffff', fontFamily: 'Arial, sans-serif', fontSize: '17px',
        lineHeight: '22px', outline: 'none', margin: '0'
      });
      document.body.appendChild(input);
      // DOM control must sit above the DOM textarea; Phaser canvas depth cannot do that.
      const okButton = document.createElement('img');
      okButton.src = 'assets/menus/buttons/btn_ok@2x.png';
      okButton.alt = 'Post message';
      okButton.setAttribute('role', 'button');
      okButton.tabIndex = 0;
      Object.assign(okButton.style, { position: 'fixed', zIndex: '10001',
        cursor: 'pointer', objectFit: 'contain', margin: '0' });
      document.body.appendChild(okButton);
      const updateInputPosition = () => {
        if (closed || !canvas.isConnected) return;
        const rect = canvas.getBoundingClientRect();
        const sx = rect.width / this.scale.width, sy = rect.height / this.scale.height;
        inputBackground.style.left = `${rect.left + composerLayout.x * sx}px`;
        inputBackground.style.top = `${rect.top + composerLayout.y * sy}px`;
        inputBackground.style.width = `${composerLayout.width * sx}px`;
        inputBackground.style.height = `${composerLayout.height * sy}px`;
        input.style.left = `${rect.left + textLayout.x * sx}px`;
        input.style.top = `${rect.top + textLayout.y * sy}px`;
        input.style.width = `${textLayout.width * sx}px`;
        input.style.height = `${textLayout.height * sy}px`;
        input.style.fontSize = `${17 * sy}px`;
        input.style.padding = `${Math.max(2, 12 * sy)}px ${Math.max(2, 10 * sx)}px ${Math.max(0, 4 * sy)}px`;
        // 44px high, vertically centered within the 48px input field.
        okButton.style.left = `${rect.left + okLayout.x * sx}px`;
        okButton.style.top = `${rect.top + okLayout.y * sy}px`;
        okButton.style.width = `${okLayout.width * sx}px`;
        okButton.style.height = `${okLayout.height * sy}px`;
      };
      updateInputPosition();
      window.addEventListener('resize', updateInputPosition);
      window.addEventListener('scroll', updateInputPosition, true);
      const reposition = this.time.addEvent({
        delay: 200, loop: true, callback: updateInputPosition
      });


      const close = () => {
        if (closed) return;
        closed = true;
        this.input.off('wheel', wheel);
        if (reposition) reposition.remove(false);
        window.removeEventListener('resize', updateInputPosition);
        window.removeEventListener('scroll', updateInputPosition, true);
        input.remove();
        inputBackground.remove();
        okButton.remove();
        maskShape.destroy();
        rowMask.destroy();
        this.destroyUiObjects([...objects.splice(0), ...rows.splice(0)]);
        disabledInputs.forEach(o => { if (o && o.active && o.input) o.input.enabled = true; });
        this.messageBoardUi = null;
      };
      const writeMessage = async () => {
        if (closed || posting) return;
        const value = input.value.trim().slice(0, 180);
        if (!value) return;
        posting = true;
        okButton.style.pointerEvents = 'none';
        const authorName = visit ? String(GAME_ATTRIBUTES.userName || 'Visitor') :
          String(GAME_ATTRIBUTES.userName || 'MEGU');
        const authorPet = visit ? String(GAME_ATTRIBUTES.petName || 'MEGU') : pet;
        const entry = {
          ownerName: authorName, petName: authorPet, text: value,
          createdAt: new Date().toISOString(), isOwner: !visit, username: authorName
        };
        try {
          if (visit) {
            if (!meguSupabase || !meguAuthUser) throw new Error('Log in to post a visitor message.');
            const { error } = await meguSupabase.rpc('post_megu_board_message', {
              target_user_id: house.userId, message_text: value,
              visitor_name: String(GAME_ATTRIBUTES.userName || 'Visitor'),
              visitor_pet_name: String(GAME_ATTRIBUTES.petName || 'MEGU')
            });
            if (error) throw error;
            messages.unshift({ ...entry, isOwner: false });
            house.messageBoardMessages = messages;
          } else {
            messages.unshift(entry);
            GAME_ATTRIBUTES.messageBoardMessages = messages.slice(0, 200);
            save();
          }
          if (!closed) { input.value = ''; scroll = 0; redraw(); }
        } catch (error) {
          if (!closed) this.showMeguMessage(error.message || 'Could not post message.', false, 0, true);
        } finally {
          posting = false;
          if (!closed) okButton.style.pointerEvents = 'auto';
        }
      };
      input.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          writeMessage();
        }
      });
      input.addEventListener('keyup', event => event.stopPropagation());
      closeButton.on('pointerdown', (pointer, x, y, event) => {
        if (event && event.stopPropagation) event.stopPropagation();
        close();
      });
      okButton.addEventListener('click', event => { event.stopPropagation(); writeMessage(); });
      okButton.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); writeMessage(); }
      });
      this.messageBoardUi = { close, objects, rows, redraw, disabledInputs, writeMessage };
      redraw();
    },
    deleteEditedFurniture() {
      const idx = this.editIdx;
      if (idx < 0 || idx >= GAME_ATTRIBUTES.furn.length) return;
      const deletedItem = GAME_ATTRIBUTES.furn[idx];
      const sprite = this.furnitureSprites[idx];
      if (sprite && sprite.active) sprite.destroy();
      this.furnitureSprites.splice(idx, 1);
      const positionLabel = this.furniturePositionLabels[idx];
      if (positionLabel && positionLabel.active) positionLabel.destroy();
      this.furniturePositionLabels.splice(idx, 1);
      const animationFrameLabel = this.furnitureAnimationFrameLabels && this.furnitureAnimationFrameLabels[idx];
      if (animationFrameLabel && animationFrameLabel.active) animationFrameLabel.destroy();
      if (this.furnitureAnimationFrameLabels) this.furnitureAnimationFrameLabels.splice(idx, 1);
      GAME_ATTRIBUTES.furn.splice(idx, 1);
      this.furnitureDepthOrder = (this.furnitureDepthOrder || []).filter(item => item !== deletedItem);
      this.furnitureDepthOrderInitialized = true;
      this.syncFurnitureDepthOrderRanks();
      this.releaseUnusedFurnitureImages();
      if (deletedItem && deletedItem.kind === 'food') this.releaseUnusedFoodAtlases();
      // The last remaining item in the depth array stays on top after deletion.
      this.editIdx = -1;
      this.drag = null;
      this.lastFurnitureClick = null;
      save();
      this.updateGameAttributeDisplay();
      this.syncFurnitureDeleteZone();
    },
    setEdit(on) {
      on = !!on;
      if (on === this.editMode) {
        this.mainUI.forEach(o => o.setVisible(!on));
        this.editUI.forEach(o => o.setVisible(on));
        if (this.editExitButton) this.editExitButton.setVisible(on);
        if (this.editExitLabel) this.editExitLabel.setVisible(on);
        this.syncFurnitureDeleteZone();
        return;
      }
  
      if (on) {
        // Freeze the room's current stacking order once. Edit-mode drawing uses
        // this snapshot instead of recalculating depth from current Y coordinates.
        this.captureFurnitureEditBaseOrder();
        // Remember movement state so MEGU can resume after furniture editing, but
        // never wander or advance while hidden behind the editor.
        this.editSavedPetMotion = {
          target: { x: this.target.x, y: this.target.y },
          wander: this.wander,
          clickMoveActive: this.clickMoveActive,
          look: this.look,
          nextMoveStepAt: this.nextMoveStepAt
        };
        this.target.x = this.pet.x;
        this.target.y = this.pet.y;
        this.wander = false;
        this.clickMoveActive = false;
        this.nextMoveStepAt = this.time.now + 500;
        this.blinkUntil = 0;
  
        // Hide all character layers and labels, and silence the random voice/message loop.
        if (this.characterNameText) this.characterNameText.setVisible(false);
        // No on-screen SFX debug label.
        if (this.g) this.g.setVisible(false);
        if (this.meguMessageTimer) { this.meguMessageTimer.remove(false); this.meguMessageTimer = null; }
        if (this.meguMessageContainer && this.meguMessageContainer.active) this.meguMessageContainer.destroy(true);
        this.meguMessageContainer = null;
        (this.meguVoiceSounds || []).forEach(sound => {
          if (!sound) return;
          sound.off('complete');
          if (sound.isPlaying) sound.stop();
        });
        this.currentMeguVoiceKey = '';
        this.nextMeguVoiceAt = null;
      } else {
        // Resume the movement target that was in effect before edit mode.
        const savedMotion = this.editSavedPetMotion;
        if (savedMotion) {
          this.target.x = savedMotion.target.x;
          this.target.y = savedMotion.target.y;
          this.wander = !!savedMotion.wander;
          this.clickMoveActive = !!savedMotion.clickMoveActive;
          this.look = Number(savedMotion.look) || 0;
          this.nextMoveStepAt = this.time.now + 500;
        }
        this.editSavedPetMotion = null;
        if (this.characterNameText) this.characterNameText.setVisible(true);
        if (this.g) this.g.setVisible(true);
        // No on-screen SFX debug label.
        // Start a fresh randomized interval instead of firing a voice immediately on exit.
        if (this.audioUnlocked) this.nextMeguVoiceAt = this.time.now + Phaser.Math.Between(5000, 10000);
      }
  
      this.editMode = on;
      this.syncMeguMenuVisibility();
      this.mainUI.forEach(o => o.setVisible(!on));
      this.editUI.forEach(o => o.setVisible(on));
      if (this.editExitButton) this.editExitButton.setVisible(on);
      if (this.editExitLabel) this.editExitLabel.setVisible(on);
      this.syncFurnitureDeleteZone();
      if (on && this.editIdx >= 0 && GAME_ATTRIBUTES.furn[this.editIdx]) {
        this.prioritizeFurnitureSelection(GAME_ATTRIBUTES.furn[this.editIdx]);
      }
      if (!on) {
        this.editIdx = -1;
        this.drag = null;
        this.lastFurnitureClick = null;
        // Keep furnitureDepthOrder and each item's depthOrder so the scene stack
        // remains stable after leaving edit mode and after a reload.
        save();
      }
    },
    playMenuSound(sound, volume) {
      if (!sound) return;
      if (sound.isPlaying) sound.stop();
      sound.setVolume(Phaser.Math.Clamp(Number(volume) || 0, 0, 1));
      sound.play();
    },
    resumeBgmAfterCharacterMenu() {
      const shouldResume = !!this.characterMenuBgmShouldResume;
      this.characterMenuBgmShouldResume = false;
      if (shouldResume && this.bgmSound) {
        this.bgmSound.setVolume(this.musicVolume);
        if (!this.bgmSound.isPlaying) this.bgmSound.play();
      }
      if (this.audioUnlocked) this.nextMeguVoiceAt = this.time.now + Phaser.Math.Between(5000, 10000);
    }
});
