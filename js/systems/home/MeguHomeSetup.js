/* ===== Merged from MeguHomeLifecycleSetup.js ===== */
// Home-scene initialization fragments extracted from Main.create().
// Calls remain at their original positions to preserve initialization order.
Object.assign(Main.prototype, {
  initializeHomeReturnLifecycleHandlers() {
      // A starving MEGU reacts with SE_bad whenever the Home scene is resumed or woken.
      // Listen to both lifecycle paths because minigames use both pause/resume and sleep/wake.
      this._playStarvingReturnSfx = () => {
        if (Number(GAME_ATTRIBUTES.satiety) >= 100) return;
        if (!this.cache.audio.exists('bad-sfx')) return;
        try { this.sound.play('bad-sfx', { volume: Number.isFinite(Number(this.sfxVolume)) ? this.sfxVolume : 0.7 }); }
        catch (error) { console.warn('[MEGU] Could not play SE_bad.wav on Home return:', error); }
      };
      // Reconcile room dirt and hygiene visuals whenever Home becomes active
      // again after a scene transition (minigame, charging room, sleep/wake).
      this._refreshRoomConditionOnReturn = () => {
        if (this.visitingHouse || this.chargingRoomActive || this.chargingRoomClosing) return;
        this.ensureRoomDirt();
        this.updateHygieneEffects(this.game.loop.time);
      };
      this.events.on('resume', this._playStarvingReturnSfx);
      this.events.on('wake', this._playStarvingReturnSfx);
      this.events.on('resume', this._refreshRoomConditionOnReturn);
      this.events.on('wake', this._refreshRoomConditionOnReturn);
    },
  initializeLanguagePreference() {
      this.language = (() => { try { return localStorage.getItem('tama.language') === 'ja' ? 'ja' : 'en'; } catch (e) { return 'en'; } })();
      if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = 'en';
    },
  initializeFooterMenuFoundation() {
      this.footerMenuOpen = false;
      this.footerMenuObjects = [];
      this.add.rectangle(W / 2, 642, W, 4, 0x000000, 1).setOrigin(0.5, 0.5).setDepth(5.8);
    },
  initializeFriendHouseLifecycleState() {
      this.friendPets = this.friendPets || [];
      this.events.once('shutdown', () => { if (this.visitingHouse) this.leaveFriendHouse(); });
    },
  initializeHomePetMovementState() {
      this.movementStopped = false;
      this.pet = { x: W / 2, y: 510 }; this.target = { x: W / 2, y: 510 }; this.lastStep = -1; this.look = Math.random() < 0.5 ? -1 : 1; this.wander = false; this.clickMoveActive = false; this.joyUntil = 0; this.nextIdleFacingAt = 0;
    },
  initializeIdlePoseSchedule() {
      this.idleStillUntil = 0;
      this.idleStillMirror = false;
      this.nextIdleStillAt = this.time.now + Phaser.Math.Between(18000, 35000);
    },
  initializePettingInteractionState() {
      this.pettingActive = false;
      this.friendPettingTarget = null;
      this.pettingMoveMs = 0;
      this.pettingLastPointer = null;
      this.pettingPreviousCursor = '';
      this.pettingHandSprite = null; // Phaser-rendered hand shown at the held pointer position.
      this.petClickFrame = null;
    },
  initializeHomeCharacterLabels() {
      this.characterNameText = this.add.text(W / 2, 400, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#10172b', strokeThickness: 3, align: 'center' }).setOrigin(0.5).setDepth(4);
      // Voice/SFX debug text is intentionally not displayed on the base screen.
      this.meguVoiceLabel = null;
    },
  initializeRetiredHomeControlState() {
      // Character, furniture and background picker buttons have been removed
      // from the top of the room; use the Care menu to access them.
      this.mainMenuLabels = null;
      // Language switching remains available through toggleLanguage(), but its
      // temporary top-screen button is hidden until it is placed elsewhere.
      this.languageButton = null;
      this.languageButtonText = null;
  
      // Furniture editing is available through the Care menu only.
      this.enterFurnitureEditButton = null;
      this.enterFurnitureEditLabel = null;
      this.mainUI = [];
    },
  completeHomeSceneInitialization() {
      this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });
      // Scene construction is complete; the splash gate still waits for the active
      // character/background load batch and for splash_screen.png itself to settle.
      this._initialSplashSceneReady = true;
      this.tryDismissInitialSplash();
    }
});


/* ===== Merged from MeguDebugSetup.js ===== */
// Extracted Home scene initialization; loaded as a classic script after game.js.
Object.assign(Main.prototype, {
  initializeDebugControls() {
    this.gameAttributesPanel = null;
    this.gameAttributesText = null;
    this.setSatietyZeroButton = this.add.text(278, 12, 'Satiety = 0', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#8A3D35', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.setSatietyZeroButton.on('pointerdown', (pointer, localX, localY, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      GAME_ATTRIBUTES.satiety = 0;
      save();
      this.updateGameAttributeDisplay();
    });

    this.setHealthZeroButton = this.add.text(365, 12, 'Health = 0', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#8A3D35', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.setHealthZeroButton.on('pointerdown', (pointer, localX, localY, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      GAME_ATTRIBUTES.health = 0;
      save();
      this.updateGameAttributeDisplay();
    });
    this.resetLevelFriendshipButton = this.add.text(278, 42, 'Level = 0', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#8A3D35', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.resetLevelFriendshipButton.on('pointerdown', (pointer, localX, localY, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      GAME_ATTRIBUTES.level = 0;
      GAME_ATTRIBUTES.friendship = 0;
      GAME_ATTRIBUTES.max_friendship = this.getFriendshipRequirement(0);
      save();
      this.updateGameAttributeDisplay();
    });
    this.giveAllInventoryDebugButton = this.add.text(365, 42, 'Give 99 of all', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#356B4A', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.giveAllInventoryDebugButton.on('pointerdown', (pointer, localX, localY, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      (this.foodDefs || []).forEach(item => this.addFoodToInventory(item.id, 99, 'game'));
      (this.furnitureDefs || []).forEach(item => this.addFurnitureToInventory(item.id, 99, 'game'));
      (MEGU_CONSUMABLE_ITEM_KEYS || []).forEach(key => {
        GAME_ATTRIBUTES[key] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[key]) || 0)) + 99;
      });
      const houseIds = (BG || []).map(item => String(item.id));
      GAME_ATTRIBUTES.unlocked_backgrounds = [...new Set([
        ...(GAME_ATTRIBUTES.unlocked_backgrounds || []).map(String), ...houseIds
      ])];
      save();
      this.updateMedicineHud?.();
      if (this.foodOpen) this.updateFoodMenu();
      if (this.fOpen) this.updateFurnitureMenu();
    });
    this.clearInventoryAndHousesDebugButton = this.add.text(278, 72, 'Clear inventory + houses', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#8A3D35', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.clearInventoryAndHousesDebugButton.on('pointerdown', (pointer, localX, localY, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      GAME_ATTRIBUTES.food_store = [];
      GAME_ATTRIBUTES.furniture_store = [];
      (MEGU_CONSUMABLE_ITEM_KEYS || []).forEach(key => { GAME_ATTRIBUTES[key] = 0; });
      GAME_ATTRIBUTES.furn = [];
      // Remove saved house-memory cards as well as owned house unlocks.
      try { localStorage.removeItem(HOUSE_LAYOUTS_KEY); } catch (error) {
        console.warn('[MEGU] Could not clear saved house layouts:', error);
      }
      const firstHouseId = BG && BG.length ? String(BG[0].id) : '1';
      GAME_ATTRIBUTES.unlocked_backgrounds = [firstHouseId];
      GAME_ATTRIBUTES.bg = 0;
      if (this.roomBg && this.roomBg.active && BG && BG[0] && this.textures.exists(BG[0].key)) {
        this.roomBg.setTexture(BG[0].key).setOrigin(0, 0).setDisplaySize(640, 640).setVisible(true);
        this.activeBackgroundKey = BG[0].key;
      }
      (this.furnitureSprites || []).forEach(sprite => { if (sprite && sprite.active) sprite.destroy(); });
      (this.furniturePositionLabels || []).forEach(label => { if (label && label.active) label.destroy(); });
      (this.furnitureAnimationFrameLabels || []).forEach(label => { if (label && label.active) label.destroy(); });
      this.furnitureSprites = [];
      this.furniturePositionLabels = [];
      this.furnitureAnimationFrameLabels = [];
      save();
      this.updateMedicineHud?.();
      this.updateGameAttributeDisplay();
      if (this.foodOpen) this.updateFoodMenu();
      if (this.fOpen) this.updateFurnitureMenu();
      if (this.bOpen) this.updateBackgroundMenu();
    });
    this.addFiftyLevelsFriendshipDebugButton = this.add.text(278, 102, '+50 Levels Friendship', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#356B4A', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.addFiftyLevelsFriendshipDebugButton.on('pointerdown', (pointer, localX, localY, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      if (this.levelUpRewardState) return;
      const currentLevel = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.level) || 0));
      const currentProgress = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.friendship) || 0));
      let friendshipForFiftyLevels = 0;
      for (let levelOffset = 0; levelOffset < 50; levelOffset += 1) {
        friendshipForFiftyLevels += this.getFriendshipRequirement(currentLevel + levelOffset);
      }
      // Account for current partial progress so this advances exactly 50 levels.
      const friendshipToAdd = Math.max(0, friendshipForFiftyLevels - currentProgress);
      this.addFriendship(friendshipToAdd, 'debug-level-boost');
    });
    // Tester-only evolution controls, independent of medicine and daily charge.
    this.debugEvolveButton = this.add.text(278, 132, 'EVOLVE', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#356B4A', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.debugEvolveButton.on('pointerdown', (pointer, x, y, event) => {
      event?.stopPropagation?.();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      if (this.evolutionTransition?.active || this.evolutionPickerObjects?.length) return;
      const current = this.characterDefs[getCharacterIndex(this.characterDefs)];
      const candidates = this.getEvolutionCandidates(String(current?.id || GAME_ATTRIBUTES.petId || ''));
      if (candidates.length > 1) this.openEvolutionPicker(candidates);
      else if (candidates.length === 1) this.switchMeguById(candidates[0], 'evolve'); else if (!candidates.length) this.showTopMessage('No evolution available');
    });
    this.debugDevolveButton = this.add.text(365, 132, 'DEVOLVE', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#8A3D35', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.debugDevolveButton.on('pointerdown', (pointer, x, y, event) => {
      event?.stopPropagation?.();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      if (this.evolutionTransition?.active || this.evolutionPickerObjects?.length) return;
      const current = this.characterDefs[getCharacterIndex(this.characterDefs)];
      const key = this.normalizeMeguId(String(current?.id || GAME_ATTRIBUTES.petId || ''));
      const row = (this.meguDescriptionRows || []).find(item =>
        this.normalizeMeguId(item?.id) === key);
      const previous = String(row?.degeneration ?? '').trim();
      if (!previous || !this.switchMeguById(previous, 'devolve')) this.showTopMessage('No previous evolution available');
    });
    // Tester-only charging controls. Use the same path as a normal charge so
    // the power-charge animation and evolution threshold remain consistent.
    this.debugGiveChargeButton = this.add.text(278, 162, '+1 Charge', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#356B4A', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.debugGiveChargeButton.on('pointerdown', (pointer, x, y, event) => {
      event?.stopPropagation?.();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      if (this.evolutionTransition?.active || this.pendingFullChargeEvolution || this.evolutionPickerObjects?.length) return;
      if (GAME_ATTRIBUTES.allowEvolution === false && Number(GAME_ATTRIBUTES.charge) >= 3) return;
      this.addEvolutionCharge(1);
      persistGameAttributes();
      this.updateGameAttributeDisplay();
    });
    this.debugRedoDailyLoginButton = this.add.text(365, 162, 'Redo Daily Login', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
      backgroundColor: '#356B4A', padding: { x: 7, y: 5 }
    }).setOrigin(0, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
    this.debugRedoDailyLoginButton.on('pointerdown', (pointer, x, y, event) => {
      event?.stopPropagation?.();
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      if (typeof meguCloudReady !== 'undefined' && !meguCloudReady) return;
      if (this.evolutionTransition?.active || this.pendingFullChargeEvolution || this.evolutionPickerObjects?.length) return;
      GAME_ATTRIBUTES.lastDailyChargeDay = '';
      // Persist the reset even when Allow Charging is disabled or the meter
      // is full, so the pending daily claim is available later.
      persistGameAttributes();
      this.checkDailyCharge?.();
      this.updateGameAttributeDisplay();
    });
    const debugControls = [this.setSatietyZeroButton, this.setHealthZeroButton,
      this.resetLevelFriendshipButton, this.giveAllInventoryDebugButton,
      this.clearInventoryAndHousesDebugButton, this.addFiftyLevelsFriendshipDebugButton,
      this.debugEvolveButton, this.debugDevolveButton,
      this.debugGiveChargeButton, this.debugRedoDailyLoginButton];
    const debugAllowed = typeof meguHasRole === 'function' && meguHasRole('tester');
    debugControls.forEach(control => {
      control.setVisible(debugAllowed);
      if (control.input) control.input.enabled = debugAllowed;
    });
    if (typeof meguHasRole === 'function' && meguHasRole('tester')) {
      this.meguHitboxToggleButton = this.add.text(430, 592, 'HITBOXES: OFF', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
        backgroundColor: '#49334f', padding: { x: 7, y: 5 }
      }).setOrigin(0, 0).setDepth(50030).setScrollFactor(0).setInteractive({ useHandCursor: true });
      this.meguHitboxToggleButton.on('pointerdown', (pointer, localX, localY, event) => {
        if (event?.stopPropagation) event.stopPropagation();
        const active = window.meguHitboxDebug?.toggle() || false;
        this.meguHitboxToggleButton.setText(`HITBOXES: ${active ? 'ON' : 'OFF'}`);
      });
    }
    if (typeof meguHasRole === 'function' && meguHasRole('admin')) {
      this.meguAdminButton = this.add.text(430, 620, 'ADMIN', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#FFFFFF',
        backgroundColor: '#49334f', padding: { x: 7, y: 5 }
      }).setOrigin(1, 0).setDepth(30.2).setInteractive({ useHandCursor: true });
      this.meguAdminButton.on('pointerdown', (pointer, localX, localY, event) => {
        if (event?.stopPropagation) event.stopPropagation();
        openMeguAdminManager();
      });
    }
  }
});


/* ===== Merged from MeguRoomInteractionSetup.js ===== */
// Extracted Home scene initialization; loaded as a classic script after game.js.
Object.assign(Main.prototype, {
  initializeRoomInteraction() {
    this.room = this.add.zone(W / 2, 320, W, 640).setDepth(0.1).setInteractive(); // UI controls above the room zone must receive clicks first.
    this.room.on('pointerdown', p => {
      // Gym reuses the Main scene and its room hit-zone; block this independent
      // click-to-move handler as well as the global MeguInput handlers.
      if (this.gymActive || this.gymClosing || this.room?.input?.enabled === false) return;
      if (this.levelUpRewardState || this.messageBoardUi || this.visitingHouse || this.friendHouseTransition) return;
      if (this.bathMode || this.editMode || Number(GAME_ATTRIBUTES.health) <= 0 || this.foodOpen || this.menuOpen || this.bOpen || this.fOpen || this.footerMenuOpen) return;
      // Do not let room taps redirect MEGU while any part of feeding is active.
      if (this.foodSequenceActive || this.foodActionActive) return;
      // A character press starts the hold-and-rub petting gesture via the global
      // pointerdown listener. Never turn that press into a walking destination.
      if (this.hitFriendPet(p) || this.isPetHit(p)) return;
      if (this.movementStopped) return;
      // Ignore taps outside the strict home-room walkable polygon.
      if (!isInsideHomeWalkableArea(p.x,p.y)) return;
      const destination={x:Phaser.Math.Clamp(p.x,0,640),y:Phaser.Math.Clamp(p.y+42,480,640)};
      if(!isInsideHomeWalkableArea(destination.x,destination.y)) { destination.x=p.x; destination.y=p.y; }
      if(!isInsideHomeWalkableArea(destination.x,destination.y)) return;
      this.wander = false;
      this.clickMoveActive = true;
      this.target.x = destination.x;
      this.target.y = destination.y;
    });
  }
});


/* ===== Merged from MeguPickerStateSetup.js ===== */
// Extracted Home scene initialization; loaded as a classic script after game.js.
Object.assign(Main.prototype, {
  initializeBackgroundAndFurniturePickerState() {
    // Background picker uses the same scrollable row UI as Food. Objects are
    // created on open and destroyed on close to avoid leaving hidden UI behind.
    this.bOpen = false;
    this.bScroll = 0;
    this.bSel = -1;
    this.bPress = null;
    this.bScrollbarPress = null;
    this.bMenuObjects = [];
    this.bRowsUI = [];
    this.bVisibleRows = 3;
    this.bRowHeight = 124;
    this.bScrollTrack = null;
    this.bScrollTrackHit = null;
    this.bScrollThumb = null;
    this.bMenuBackground = null;

    // Furniture picker mirrors the Food/background/character list UI and is
    // created only while open so all rows and thumbnails can be destroyed on close.
    this.fOpen = false;
    this.fScroll = 0;
    this.fSel = -1;
    this.fPress = null;
    this.fMenuObjects = [];
    this.fRowsUI = [];
    this.fVisibleRows = 3;
    this.fRowHeight = 124;
    this.fScrollbarPress = null;
    this.fScrollTrack = null;
    this.fScrollTrackHit = null;
    this.fScrollThumb = null;
    this.fMenuBackground = null;
    this.fNoResultsLabel = null;
    this.furnitureMenuDefs = [];
    this.fCancelButton = null;
    this.accessoryPickerOpen = false;
    this.accessoryEditorOpen = false;
    this.accessoryPickerObjects = [];
    this.accessoryPickerRows = [];
    this.accessorySelectedIndex = -1;
    this.accessoryPreviewSprites = [];
    this.accessoryPreviewFrames = [];
    this.accessoryPreviewFrameIndex = 0;
    this.accessoryPreviewDrag = false;
    this.accessoryPreviewPose = null;
    this.accessoryHomeSprite = null;
    this.accessoryTextureLoading = new Set();
    this.editMode = false; this.editIdx = -1; this.drag = null;
  }
});


/* ===== Merged from MeguFurnitureEditSetup.js ===== */
// Extracted Home scene initialization; loaded as a classic script after game.js.
Object.assign(Main.prototype, {
  initializeFurnitureEditControls() {
    // furniture edit mode UI
    this.editUI = [];
    const eb = (x, label, fn) => {
      const r = this.add.rectangle(x, 680, 160, 56, 0x2ea043).setDepth(2).setStrokeStyle(3, 0xffffff).setInteractive({ useHandCursor: true }).setVisible(false);
      const t = this.add.text(x, 680, label, textStyle(22)).setOrigin(0.5).setDepth(2).setVisible(false);
      r.on('pointerdown', fn);
      this.editUI.push(r, t);
    };
    eb(230, 'Finish', () => this.setEdit(false));
    eb(410, 'Delete', () => this.deleteEditedFurniture());
    this.lastFurnitureClick = null;

    // Furniture removal drop target: icon with a compact description below it.
    // Keep the full visual footprint as the drag-to-delete target.
    this.deleteDropZoneBounds = { x: 8, y: 132, width: 102, height: 112 };
    this.deleteDropZoneBg = this.add.image(59, 169, 'edit-remove-furniture-icon')
      .setDisplaySize(64, 64).setDepth(12).setVisible(false);
    this.deleteDropZoneText = this.add.text(59, 218, 'Remove furniture', {
      fontFamily: 'sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#000000',
      stroke: '#ffffff', strokeThickness: 2,
      align: 'center', wordWrap: { width: 85 }, lineSpacing: 0
    }).setOrigin(0.5).setDepth(13).setVisible(false);
    // Place the close button at the lower-right edge of the room, above the HUD.
    // The room ends at y=645; keep a 16px inset from its right and bottom edges.
    this.editExitButton = this.add.image(602.75, 607.75, 'edit-close-icon')
      .setDisplaySize(42.5, 42.5).setDepth(14).setVisible(false).setInteractive({ useHandCursor: true });
    this.editExitLabel = null;
    this.editExitButton.on('pointerdown', (pointer, localX, localY, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.setEdit(false);
    });
    this.lastFurnitureClick = null;
  }
});


/* ===== Merged from MeguCharacterPickerSetup.js ===== */
// Extracted Home scene initialization; loaded as a classic script after game.js.
Object.assign(Main.prototype, {
  initializeCharacterPickerState() {
    // Character picker mirrors the three-row Background menu layout.
    this.menuOpen = false;
    this.charScroll = 0;
    this.charSelected = -1;
    this.charPress = null;
    this.charScrollbarPress = null;
    this.mItems = [];
    this.cells = [];
    this.charRowsUI = [];
    this.charVisibleRows = 3;
    this.charRowHeight = 125;
    this.charScrollTrack = null;
    this.charScrollTrackHit = null;
    this.charScrollThumb = null;
    this.charMenuBackground = null;
    this.charSelectButton = null;
    this.charCancelButton = null;
  }
});


/* ===== Merged from MeguHomeSceneSetup.js ===== */
// Extracted from Main.create(); initialization order is preserved at each call site.
Object.assign(Main.prototype, {
  initializeHomeRoomFoundation() {
      this.rb = this.add.rectangle(320, 320, 640, 640, 0x1f2a44).setVisible(false);
      this.rw = this.add.rectangle(W / 2, 150, W, 300, 0xf4efe2).setStrokeStyle(4, 0x8a7f66).setVisible(false);
      this.rf = this.add.rectangle(W / 2, 470, W, 340, 0xc9b98f).setVisible(false);
      this.bgg = this.add.graphics();
      this.fb = this.add.graphics();
      this.ff = this.add.graphics().setDepth(0.5);
      this.g = this.add.graphics().setDepth(4.15);
      this.voltageIcon = this.add.image(10, 630, 'voltage-0')
        .setOrigin(0, 1).setDisplaySize(64, 64).setDepth(7);
      this.updateVoltageIcon = () => {
        if (!this.voltageIcon || !this.voltageIcon.active) return;
        const charge = Phaser.Math.Clamp(Math.trunc(Number(GAME_ATTRIBUTES.charge) || 0), 0, 3);
        const textureKey = `voltage-${charge}`;
        if (this.textures.exists(textureKey)) this.voltageIcon.setTexture(textureKey);
      };
      this.furnitureSprites = [];
      this.furniturePositionLabels = [];
      this.furnitureAnimationFrameLabels = [];
      // AUTHORITATIVE FURNITURE DEPTH ARRAY, ordered bottom-to-top.
      // Selecting furniture moves that object to the end of this array, so its
      // depth is deterministic and never recalculated from Y or GAME_ATTRIBUTES.furn array order.
      // Each item's depthOrder is serialized with GAME_ATTRIBUTES.furn to preserve order on reload.
      this.furnitureDepthOrder = [];
      this.furnitureDepthOrderInitialized = false;
      if (!Array.isArray(GAME_ATTRIBUTES.messageBoardMessages)) GAME_ATTRIBUTES.messageBoardMessages = [];
      this.messageBoardUi = null;

  },
  initializeTopStatusHud() {
      this.topStatusHud = [];
      const statusRows = [
        { key: 'satiety', label: 'SATIETY', color: 0xFF9A36 },
        { key: 'health', label: 'HEALTH', color: 0xF04444 },
        { key: 'experience', label: `LVL ${GAME_ATTRIBUTES.level}`, color: 0x42D66B }
      ];
      // Each HUD row has a 212x26 translucent rounded black backing.
      // The 200x14 colored meter is centered inside it; its empty area stays
      // fully transparent and only the 2px white outline remains visible.
      const statusBackingWidth = 212;
      const statusBackingHeight = 26;
      const statusBarWidth = 200;
      const statusBarHeight = 14;
      const statusBackingX = W - 6 - statusBackingWidth;
      const statusStartY = 22;
      const statusBackingGap = 14; // Exact clear space between adjacent black backings.
      const statusRowGap = statusBackingHeight + statusBackingGap;
      statusRows.forEach((row, index) => {
        const y = statusStartY + index * statusRowGap;
        const label = this.add.text(statusBackingX - 2, y + statusBackingHeight / 2, row.label, {
          fontFamily: 'Arial, sans-serif', fontSize: '12px', fontStyle: 'bold',
          color: '#FFFFFF', stroke: '#55483F', strokeThickness: 3,
          padding: { x: 1, y: 1 }
        }).setOrigin(1, 0.5).setDepth(18.1);
        const bar = this.add.graphics().setDepth(18);
        this.topStatusHud.push({
          key: row.key, color: row.color, label, bar,
          x: statusBackingX, y, backingWidth: statusBackingWidth,
          backingHeight: statusBackingHeight,
          meterX: statusBackingX + (statusBackingWidth - statusBarWidth) / 2,
          meterY: y + (statusBackingHeight - statusBarHeight) / 2,
          width: statusBarWidth, height: statusBarHeight
        });
      });
      this.updateTopStatusHud = () => {
        const a = this.currentGameAttributeSnapshot();
        const rows = [
          { fraction: Number(a.max_satiety) > 0 ? Number(a.satiety) / Number(a.max_satiety) : 0 },
          { fraction: Number(a.max_health) > 0 ? Number(a.health) / Number(a.max_health) : 0 },
          { fraction: Number(a.max_friendship) > 0 ? Number(a.friendship) / Number(a.max_friendship) : 0 }
        ];
        this.topStatusHud.forEach((item, index) => {
          if (index === 2) item.label.setText(`LVL ${a.level}`);
          const fraction = Phaser.Math.Clamp(Number(rows[index].fraction) || 0, 0, 1);
          item.bar.clear();
          // Soft black panel behind the meter. The unfilled meter interior is
          // intentionally left transparent so the panel remains visible through it.
          item.bar.fillStyle(0x000000, 0.5)
            .fillRoundedRect(item.x, item.y, item.backingWidth, item.backingHeight, 5);
          const innerWidth = Math.max(0, (item.width - 2) * fraction);
          if (innerWidth > 0) {
            item.bar.fillStyle(item.color, 1)
              .fillRect(item.meterX + 1, item.meterY + 1, innerWidth, item.height - 2);
          }
          item.bar.lineStyle(2, 0xFFFFFF, 1)
            .strokeRect(item.meterX, item.meterY, item.width, item.height);
        });
      };
      this.updateTopStatusHud();
  },
  initializeGoldAndMedicineHud() {
      // Player gold HUD: icon followed by a comma-separated balance.
      // Match the HEALTH label's bold white lettering with a black outline.
      this.goldHudIcon = this.add.image(20, 22, 'gold-icon')
        .setDisplaySize(28, 28).setOrigin(0, 0.5).setDepth(30);
      this.goldHudText = this.add.text(55, 22, '', {
        fontFamily: 'Arial, sans-serif', fontSize: '25px', fontStyle: 'bold',
        color: '#FFFFFF', stroke: '#000000', strokeThickness: 4,
        padding: { x: 1, y: 1 }
      }).setOrigin(0, 0.5).setDepth(30);
      this.updateGoldHud = () => {
        this.goldHudText.setText(Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.gold) || 0)).toLocaleString('en-US'));
      };
      // Route every balance change through this helper so the gold sound is
      // consistently played for both gains and deductions.
      this.changeGold = (amount) => {
        const before = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.gold) || 0));
        const delta = Math.trunc(Number(amount) || 0);
        const after = Math.max(0, before + delta);
        if (after === before) return false;
        GAME_ATTRIBUTES.gold = after;
        if (this.cache.audio.exists('gold-sfx')) this.sound.play('gold-sfx');
        if (this.updateGoldHud) this.updateGoldHud();
        save();
        return true;
      };
      this.updateGoldHud();
      // Elixir counter: 2px below the gold icon (gold ends at y=36).
      this.elixirHudIcon = this.add.image(34, 52, 'elixir-hud-icon')
        .setDisplaySize(28, 28).setOrigin(0.5, 0.5).setDepth(30);
      this.elixirHudText = this.add.text(55, 52, '', {
        fontFamily: 'Arial, sans-serif', fontSize: '25px', fontStyle: 'bold',
        color: '#FFFFFF', stroke: '#000000', strokeThickness: 4,
        padding: { x: 1, y: 1 }
      }).setOrigin(0, 0.5).setDepth(30);
      // Special medicine inventory, styled like the gold counter and kept beside it.
      this.medicineHudText = this.add.text(160, 22, '', {
        fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold',
        color: '#FFFFFF', stroke: '#000000', strokeThickness: 4,
        padding: { x: 1, y: 1 }
      }).setOrigin(0, 0.5).setDepth(30).setVisible(false); // Keep inventory updates available without showing the debug counter on the main screen.
      this.updateMedicineHud = () => {
        const count = key => Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[key]) || 0));
        this.elixirHudText?.setText(count('elixir').toLocaleString('en-US'));
        this.medicineHudText.setText(`ELX ${count('elixir')}   VOL ${count('voltamin')}   V-L ${count('voltaminLite')}   B-V ${count('betaVoltamin')}   S-V ${count('superVoltamin')}   DEVO ${count('devoMedicine')}   S-DV ${count('superDevoMedicine')}   RZ ${count('rainbowZ')}   RFT ${count('regularFlightTicket')}   GFT ${count('goldenFlightTicket')}`);
      };
      this.updateMedicineHud();
      this.medicineHudText.setVisible(false);

  }
});

/* ===== Character atlas initialization (formerly MeguCharacterSetup.js) ===== */
// Extracted from Main.create(); initialization order is preserved at each call site.
Object.assign(Main.prototype, {
  initializeActiveCharacterAtlas() {
      // The active character is resolved by GAME_ATTRIBUTES.petId; no legacy index is needed.
      // Full-size character atlas loading is on-demand: only the currently active
      // character is queued. Thumbnail atlases are used exclusively by the picker.
      this.activeCharacterTextureKey = null;
      this.meguRenderer = null;
      this.characterAtlasQueuedKeys = new Set();
      this.characterAtlasManagedKeys = new Set();
      this.characterPreviewSprites = [];
      this.load.on('complete', () => this.onCharacterAssetsLoaded());
      this.requestCharacterAtlas(this.characterDefs[getCharacterIndex(this.characterDefs)] || this.characterDefs[0], false);
  }
});
