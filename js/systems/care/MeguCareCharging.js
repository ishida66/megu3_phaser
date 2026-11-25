/* MeguCareCharging: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    openNameChangeUi() {
      const screen = document.getElementById('megu-namechange-screen');
      const userInput = document.getElementById('megu-new-username');
      const petInput = document.getElementById('megu-new-petname');
      const personalMessageInput = document.getElementById('megu-new-personal-message');
      const message = document.getElementById('megu-namechange-message');
      if (!screen || !userInput || !petInput || !personalMessageInput) return;
      userInput.value = String(GAME_ATTRIBUTES.userName || '');
      petInput.value = String(GAME_ATTRIBUTES.petName || '');
      personalMessageInput.value = String(GAME_ATTRIBUTES.personalMessage || '');
      message.textContent = '';
      screen.hidden = false;
      userInput.focus();
    },
    openChargingRoom() {
      if (this.chargingRoomActive || this.chargingRoomClosing) return;
      this.closeFooterMenu();
      this.chargingRoomActive = true;
      this.chargingRoomClosing = false;
      this.endPetting();
      // Prevent the home navigation hitboxes from receiving input while the
      // Charging Room is active. Options is intentionally left available.
      [this.careMenuButton, this.outingMenuButton, this.storeMenuButton, this.meguMenuButton]
        .forEach(button => { if (button && button.input) button.input.enabled = false; });
      this.chargingRoomObjects = [];
      this.chargingRoomBlinkUntil = 0;
      this.chargingRoomNextBlinkAt = (this.time ? this.time.now : 0) + Phaser.Math.Between(2200, 4800);
      if (this.meguMessageTimer) { this.meguMessageTimer.remove(false); this.meguMessageTimer = null; }
      if (this.meguMessageContainer && this.meguMessageContainer.active) this.meguMessageContainer.destroy(true);
      this.meguMessageContainer = null;
      if (this.meguVoiceSounds) this.meguVoiceSounds.forEach(sound => { if (sound && sound.isPlaying) sound.stop(); });
      this.currentMeguVoiceKey = '';
      if (this.dailyChargeAnimationRun) this.dailyChargeAnimationRun.cleanup();
      this.pendingFullChargeEvolution = false;
  
      const camera = this.cameras && this.cameras.main;
      const buildRoom = () => {
        if (!this.chargingRoomActive) return;
        const add = object => { this.chargingRoomObjects.push(object); return object; };
        // The Charging Room background replaces only the 640x640 play area.
        // Keep the stats panel and bottom menu UI below the game screen visible.
        const background = this.textures.exists('charging-room-background')
          ? add(this.add.image(0, 0, 'charging-room-background').setOrigin(0, 0).setDisplaySize(W, 640))
          : add(this.add.rectangle(W / 2, 320, W, 640, 0x000000));
        background.setDepth(50000).setScrollFactor(0).setInteractive({ useHandCursor: false });
  
        const atlasKey = meguTextureKey(GAME_ATTRIBUTES.petId || 'ID1', GAME_ATTRIBUTES.shiny === true);
        const texture = this.textures.exists(atlasKey) ? this.textures.get(atlasKey) : null;
        const renderer = this.meguRenderer;
        if (this.characterSprite && this.characterSprite.active && texture && renderer && !renderer.destroyed) {
          // Let MeguRenderer own atlas frames, eye layers, blink timing and the
          // ground shadow. The Charging Room changes only renderer state,
          // position and outer display depth.
          renderer.setAtlas(atlasKey);
          renderer.setState(MeguRenderer.STATES.STANDING_1);
          renderer.setPosition(150, 442);
          renderer.setFlipX(false);
          renderer.setRotation(0);
          renderer.setVisible(true);
          renderer.setDepth(50001, 50000.5);
        }
  
        const addButton = (id, x, y, width, height, callback) => {
          const zone = MeguMenuLayouts.zone(this,'charging_room',id,{x,y,width,height})
            .setScrollFactor(0).setDepth(50020).setInteractive({ useHandCursor: true });
          zone.on('pointerdown', (pointer, localX, localY, event) => {
            if (event && event.stopPropagation) event.stopPropagation();
            callback();
          });
          add(zone);
          return zone;
        };
  
        // Owner/pet name editing remains available here, not on the old MEGU menu.
        addButton('rename', 19, 542, 85, 85, () => this.openNameChangeUi());
        addButton('random_evolution', 340, 42, 85, 85, () => this.evolveRandom());
        addButton('devolution', 340, 127, 85, 85, () => this.devolution());
        addButton('super_devolution', 340, 212, 85, 85, () => this.openSuperDevolutionPicker());
        addButton('super_evolution', 340, 297, 85, 85, () => this.openSuperEvolutionMenu());
        addButton('shiny', 340, 382, 85, 85, () => this.toggleShinyForm());
  
        const powerKey = GAME_ATTRIBUTES.allowEvolution ? 'daily-powercharge-1' : 'daily-powercharge-0';
        const powerHitbox = MeguMenuLayouts.button(this,'charging_room','evolution_toggle',{x:340,y:467,width:85,height:85});
        if (this.textures.exists(powerKey)) {
          const power = add(this.add.image(0, 0, powerKey)
            .setPosition(
              powerHitbox.x + powerHitbox.width / 2,
              powerHitbox.y + powerHitbox.height / 2
            )
            .setDisplaySize(powerHitbox.width, powerHitbox.height)
            .setDepth(50019)
            .setScrollFactor(0));
          this.chargingRoomPowerImage = power;
        }
        addButton('evolution_toggle',powerHitbox.x, powerHitbox.y, powerHitbox.width, powerHitbox.height, () => {
          GAME_ATTRIBUTES.allowEvolution = !GAME_ATTRIBUTES.allowEvolution;
          if (!GAME_ATTRIBUTES.allowEvolution) this.pendingFullChargeEvolution = false;
          const key = GAME_ATTRIBUTES.allowEvolution ? 'daily-powercharge-1' : 'daily-powercharge-0';
          if (this.chargingRoomPowerImage && this.chargingRoomPowerImage.active && this.textures.exists(key)) {
            this.chargingRoomPowerImage.setTexture(key);
          }
          persistGameAttributes();
          // A daily reward blocked at 3 charges remains pending until
          // evolution is enabled; lower charges are awarded normally.
          if (GAME_ATTRIBUTES.allowEvolution) {
            this.checkDailyCharge?.();
            // Also handle a fourth charge already stored before the toggle.
            if (Number(GAME_ATTRIBUTES.charge) >= 4) this.addEvolutionCharge?.(0);
          }
        });
        addButton('close', 449, 530, 63, 52, () => this.closeChargingRoom());
  
      };
  
      if (camera) {
        camera.once('camerafadeoutcomplete', () => {
          buildRoom();
          camera.fadeIn(300, 0, 0, 0);
        });
        camera.fadeOut(300, 0, 0, 0);
      } else buildRoom();
    },
    closeChargingRoom(afterClose = null) {
      if (!this.chargingRoomActive || this.chargingRoomClosing) return;
      this.chargingRoomClosing = true;
      const camera = this.cameras && this.cameras.main;
      const finish = () => {
        (this.chargingRoomObjects || []).forEach(object => { if (object && object.active) object.destroy(); });
        this.chargingRoomObjects = [];
        this.chargingRoomPowerImage = null;
        this.chargingRoomActive = false;
        this.chargingRoomClosing = false;
        // Restore the four home navigation hitboxes only after leaving the room.
        [this.careMenuButton, this.outingMenuButton, this.storeMenuButton, this.meguMenuButton]
          .forEach(button => { if (button && button.input) button.input.enabled = true; });
        this.meguRenderer?.setDepth(4.15);
        this.syncMeguMenuVisibility();
        this.nextMeguVoiceAt = this.time ? this.time.now + Phaser.Math.Between(5000, 10000) : null;
        if (afterClose) afterClose();
        if (camera) camera.fadeIn(300, 0, 0, 0);
      };
      if (camera) {
        camera.once('camerafadeoutcomplete', finish);
        camera.fadeOut(250, 0, 0, 0);
      } else finish();
    },
    setChargingRoomCharacterPosition() {
      const renderer = this.meguRenderer;
      if (!this.chargingRoomActive || !renderer || renderer.destroyed || !renderer.sprite?.active) return;
      // Fixed Charging Room anchor; do not inherit the normal Home pet coordinates.
      // Position and facing are routed through MeguRenderer so its eyes and
      // ground shadow stay synchronized without scene-level child manipulation.
      renderer.setPosition(150, 442);
      renderer.setFlipX(false);
      renderer.setRotation(0);
      renderer.update(this.time ? this.time.now : 0, 0);
    },
    updateChargingRoom(time, delta = 16) {
      if (!this.chargingRoomActive || !this.characterSprite || !this.characterSprite.active) return;
      const renderer = this.meguRenderer;
      if (!renderer || renderer.destroyed) return;
      // The Charging Room background is at depth 50000; the renderer container
      // (not its child sprites) must be above it. The renderer owns idle frames,
      // blink timing, eye alignment and its scaled ground shadow.
      renderer.setDepth(50001, 50000.5);
      renderer.setRotation(0);
      renderer.setFlipX(false);
      renderer.setVisible(true);
      if (!renderer.animation || renderer.animation !== 'standing') {
        renderer.playAnimation('standing', { frameDuration: 500 });
      }
      renderer.update(time, delta);
      // Atlas swaps after evolution can reset the sprite to Home coordinates.
      this.setChargingRoomCharacterPosition();
    },
    handleCareMenuAction(action) {
      if (!this.footerMenuOpen) return;
      // Remove the modal and all hitboxes before another menu or edit mode opens.
      this.closeFooterMenu();
      switch (action) {
        case 'food':
          this.toggleFood(true);
          break;
        case 'furniture':
          this.toggleFurn(true);
          break;
        case 'accessory':
          this.openAccessoryPicker();
          break;
        case 'clearFurniture':
          this.clearAllFurnitureFromCareMenu();
          break;
        case 'editFurniture':
          this.closeOtherPickersForFooterMenu();
          this.editIdx = -1;
          this.setEdit(true);
          break;
        case 'background':
          this.toggleBg(true);
          break;
        case 'bath':
          this.startBathMode();
          break;
        case 'clean':
          this.startCleanMode();
          break;
        case 'evolve':
          // The Care-menu Evolution button opens the full Super Evolution
          // character picker, allowing direct selection of any available ID.
          // Automatic charge-based evolution continues to use its own candidate flow.
          this.toggleMenu(true);
          break;
        case 'devolve':
          this.devolution();
          break;
        case 'evolveRandom':
          this.evolveRandom();
          break;
        case 'jukebox':
          this.startJukeboxPlacement();
          break;
        case 'messageBoard':
          if ((GAME_ATTRIBUTES.furn || []).some(object => object && this.getFurnitureDefinitionForObject(object)?.boardFlag === true)) {
            this.showMeguMessage('message board already placed', false, 0, true);
            break;
          }
          const chalkboard = (this.furnitureDefs || []).find(def => def.boardFlag === true);
          if (!chalkboard) {
            console.warn('[MEGU] Message board furniture not found: set board_flag to 1 in furniture_description.json and include its thumbnail atlas.');
            this.showMeguMessage('message board unavailable', false, 0, true);
            break;
          }
          this.startEdit(chalkboard, false);
          break;
        case 'layoutSave':
          this.openLayoutMemoryUi('save');
          break;
        case 'layoutLoad':
          this.openLayoutMemoryUi('load');
          break;
        case 'nameChange':
          this.openNameChangeUi();
          break;
        case 'close':
          // The Care window is already closed; the room returns to its default view.
          break;
      }
    },
    clearAllFurnitureFromCareMenu() {
      // This command intentionally removes every placed prop, including food used as furniture.
      this.closeFooterMenu();
      this.closeOtherPickersForFooterMenu();
      (this.furnitureSprites || []).forEach(sprite => { if (sprite && sprite.active) sprite.destroy(); });
      (this.furniturePositionLabels || []).forEach(label => { if (label && label.active) label.destroy(); });
      (this.furnitureAnimationFrameLabels || []).forEach(label => { if (label && label.active) label.destroy(); });
      this.furnitureSprites = [];
      this.furniturePositionLabels = [];
      this.furnitureAnimationFrameLabels = [];
      GAME_ATTRIBUTES.furn = [];
      this.furnitureDepthOrder = [];
      this.furnitureDepthOrderInitialized = true;
      this.editIdx = -1;
      this.drag = null;
      this.lastFurnitureClick = null;
      this.syncFurnitureDepthOrderRanks();
      this.releaseUnusedFurnitureImages();
      this.releaseUnusedFoodAtlases();
      save();
    }
});
