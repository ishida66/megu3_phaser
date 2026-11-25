/* MeguFooterMenus: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    closeMedicineConfirmation() {
      const modal = this.medicineConfirmationObjects;
      this.medicineConfirmationObjects = null;
      if (modal) modal.forEach(object => { if (object && object.active) object.destroy(); });
    },
    openMedicineConfirmation(itemKey) {
      this.closeMedicineConfirmation();
      this.closeFooterMenu();
      const objects = [];
      this.medicineConfirmationObjects = objects;
      const add = object => { objects.push(object); return object; };
      const cx = W / 2, cy = H / 2;
      const depth = 100100;
      const shade = add(this.add.rectangle(cx, cy, W, H, 0x000000, 0.72)
        .setScrollFactor(0).setDepth(depth).setInteractive());
      shade.on('pointerdown', (pointer, x, y, event) => {
        if (event && event.stopPropagation) event.stopPropagation();
      });
      const panel = add(this.add.image(cx, cy, 'level-reward-message-bg')
        .setScrollFactor(0).setDepth(depth + 1));
      // The shared medium message artwork is 470x330 at its intended canvas size.
      panel.setDisplaySize(470, 330);
      const top = cy - 165;
      const medicines = {
        elixir: { name: 'Elixir', icon: 'elixir-confirm-icon', description: 'Restore health and satiety to max.' },
        voltamin: { name: 'Voltamin', icon: 'voltamin-confirm-icon', description: 'Restore electricity to 99 W (3 charges).' },
        voltaminLite: { name: 'Voltamin-Lite', icon: 'voltamin-lite-confirm-icon', description: 'Add one charge, up to 99 W (3 charges).' }
      };
      const medicine = medicines[itemKey];
      if (!medicine) return;
      const quantity = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[itemKey]) || 0));
      const icon = add(this.add.image(cx, top + 77, medicine.icon)
        .setScrollFactor(0).setDepth(depth + 2));
      const iconScale = Math.min(1, 68 / Math.max(icon.width, icon.height));
      icon.setScale(iconScale);
      add(this.add.text(cx, top + 137, `Do you want to use ${medicine.name}? Holds: ${quantity}`, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#c9ff9f',
        stroke: '#18351b', strokeThickness: 3, align: 'center',
        wordWrap: { width: 424 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 2));
      add(this.add.text(cx, top + 197, medicine.description, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#c9ff9f',
        stroke: '#18351b', strokeThickness: 3, align: 'center',
        lineSpacing: 5, wordWrap: { width: 420 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 2));
      const buttonWidth = 78, buttonHeight = 54, gap = 6;
      const buttonY = top + 287;
      const okX = cx - (buttonWidth + gap) / 2;
      const cancelX = cx + (buttonWidth + gap) / 2;
      const makeButton = (x, texture, callback) => {
        const button = add(this.add.image(x, buttonY, texture)
          .setDisplaySize(buttonWidth, buttonHeight)
          .setScrollFactor(0).setDepth(depth + 3)
          .setInteractive({ useHandCursor: true }));
        button.on('pointerdown', (pointer, localX, localY, event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          // Destroy first, even if the medicine fails (e.g. inventory is empty).
          this.closeMedicineConfirmation();
          callback();
        });
      };
      makeButton(okX, 'elixir-confirm-ok', () => this.useMeguMedicine(itemKey));
      makeButton(cancelX, 'elixir-confirm-close', () => {});
    },
    openFooterMenu(kind) {
      // Bottom-bar menus are unavailable in Friend Visit; RETURN HOME is the
      // only room control besides petting the player's MEGU.
      if (this.visitingHouse || this.friendHouseTransition) return;
      if (!this.prepareForExternalInteraction()) return;
      const menuConfig = {
        care: { key: 'menu-care', label: 'Care menu' },
        options: { key: 'menu-options', label: 'Settings menu' },
        outing: { key: 'menu-outing', label: '' },
        megu: { key: 'menu-megu', label: '' },
        store: { key: 'menu-store', label: 'Store menu' }
      }[kind];
      if (!menuConfig) return;
      const objects = this.beginFooterMenu({ closePickers: true });
      const isCareMenu = kind === 'care';
      const isOutingMenu = kind === 'outing';
      const isOptionsMenu = kind === 'options';
      const isMeguMenu = kind === 'megu';
      const isStoreMenu = kind === 'store';
      const isArtworkMenu = isCareMenu || isOutingMenu || isMeguMenu || isStoreMenu || isOptionsMenu;
      const menuCanvasHeight = isArtworkMenu ? CANVAS_H : H;
      const menuCenterY = menuCanvasHeight / 2;
      // Care button coordinates are authored in the Care artwork's own logical
      // 640x950 coordinate space. Convert them through the actual displayed
      // artwork bounds so hitboxes remain aligned if the artwork is scaled.
      let careMenuTransform = { left: 0, top: 0, scaleX: 1, scaleY: 1 };
      let outingMenuTransform = { left: 0, top: 0, scaleX: 1, scaleY: 1 };
      let storeMenuTransform = { left: 0, top: 0, scaleX: 1, scaleY: 1 };
      const shade = this.add.rectangle(W / 2, menuCenterY, W, menuCanvasHeight, 0x080d19, 0.72)
        .setScrollFactor(0).setDepth(30).setInteractive({ useHandCursor: false });
      shade.on('pointerdown', () => { /* Modal shade absorbs clicks without closing. */ });
      objects.push(shade);
  
      if (this.textures.exists(menuConfig.key)) {
        const menuImage = this.add.image(isArtworkMenu ? 0 : W / 2, isArtworkMenu ? 0 : menuCenterY, menuConfig.key)
          .setOrigin(isArtworkMenu ? 0 : 0.5).setScrollFactor(0).setDepth(31);
        const src = this.textures.get(menuConfig.key).getSourceImage();
        const srcW = Math.max(1, src && src.width || menuImage.width);
        const srcH = Math.max(1, src && src.height || menuImage.height);
        // Keep the popup artwork inside the canvas. Care hotspots are mapped
        // from the artwork's local logical coordinates to its displayed bounds.
        // Preserve the original artwork sizing behavior for Store as well.
        // The Store hitboxes below use fixed canvas coordinates and are not
        // scaled or otherwise modified here.
        const scale = isArtworkMenu
          ? Math.min(W / srcW, menuCanvasHeight / srcH)
          : Math.min(1.0, (W - 16) / srcW, (menuCanvasHeight - 16) / srcH);
        menuImage.setScale(scale);
        if (isOptionsMenu) menuImage.setDisplaySize(640, 840);
        if (isArtworkMenu) {
          // Care and Outing artwork are anchored to the screen's top-left corner.
          // Button coordinates remain local to its 640x950 logical artwork space.
          const artworkTransform = {
            left: menuImage.x,
            top: menuImage.y,
            scaleX: menuImage.displayWidth / W,
            scaleY: menuImage.displayHeight / CANVAS_H
          };
          if (isCareMenu) careMenuTransform = artworkTransform;
          else if (isOutingMenu) outingMenuTransform = artworkTransform;
          else if (isStoreMenu) {
            // Store artwork is displayed at exactly half native @2x resolution:
            // 1280x1536 source pixels become 640x768 canvas pixels. It is
            // anchored at canvas (0,0), so the supplied hitbox coordinates are
            // already absolute canvas coordinates. Do not multiply them again.
            storeMenuTransform = { left: 0, top: 0, scaleX: 1, scaleY: 1 };
            console.info('[STORE] Artwork origin=(0,0) canvas; native=', srcW, 'x', srcH,
              'display=', menuImage.displayWidth, 'x', menuImage.displayHeight,
              'scale=', scale);
          }
        }
        // Edit retains click-to-close. Care and Settings stay open unless one of
        // their explicitly defined controls is clicked.
        if (!isCareMenu && !isOptionsMenu && kind !== 'outing' && !isMeguMenu && !isStoreMenu) {
          menuImage.setInteractive({ useHandCursor: true });
          menuImage.on('pointerdown', () => this.closeFooterMenu());
        }
        objects.push(menuImage);
      } else {
        // Fallback artwork is non-interactive for Care and Settings: those menus
        // close only through their explicit controls, even if the PNG is missing.
        const panel = this.add.rectangle(W / 2, menuCenterY, 320, 220, 0x24304f, 1)
          .setStrokeStyle(3, 0xffd34f).setDepth(31);
        if (!isCareMenu && !isOptionsMenu && !isMeguMenu && !isStoreMenu) {
          panel.setInteractive({ useHandCursor: true });
          panel.on('pointerdown', () => this.closeFooterMenu());
        }
        const fallbackHint = isCareMenu || isOptionsMenu || isMeguMenu || isStoreMenu ? '' : '\nClick to return';
        const fallbackText = kind === 'outing' ? fallbackHint.trim() : `${menuConfig.label}${fallbackHint}`;
        const title = this.add.text(W / 2, menuCenterY, fallbackText, {
          fontFamily: 'sans-serif', fontSize: '22px', color: '#ffffff', align: 'center',
          lineSpacing: 12
        }).setOrigin(0.5).setDepth(32);
        objects.push(panel, title);
      }
  
      if (kind === 'outing') {
        // Outing artwork and controls use the same top-left anchored local
        // coordinate system as the Care menu.
        const launchMegu = () => { const def=this.characterDefs && (this.characterDefs[getCharacterIndex(this.characterDefs)] || this.characterDefs[0]); if(!def)return def; const paths=meguAssetPaths(def.id,GAME_ATTRIBUTES.shiny===true); return {...def,logicalId:def.id,id:paths.key,image:paths.image,json:paths.json,textureKey:paths.key}; };
        const outingItems = [
          { x: 68, y: 143, action: async () => { this.closeFooterMenu(); const guestCandidates = await fetchMeguPublicCompetitionGuests(); this.scene.pause('default'); this.scene.launch('SumoMinigame', { playerMeguDef: launchMegu(), guestCandidates }); this.scene.bringToTop('SumoMinigame'); } },
          { x: 208, y: 143, action: async () => { this.closeFooterMenu(); const guestCandidates = await fetchMeguPublicCompetitionGuests(); this.scene.pause('default'); this.scene.launch('JockeyMinigame', { playerMeguDef: launchMegu(), pet_name: GAME_ATTRIBUTES.petName || '', guestCandidates }); this.scene.bringToTop('JockeyMinigame'); } },
          { x: 348, y: 143, action: () => {
            // Always restart Play Ball from a clean scene state. A previous run
            // can leave the Phaser scene active/paused, in which case launch()
            // alone will not create a fresh minigame session.
            this.closeFooterMenu();
            try { this.scene.stop('BallTossMinigame'); } catch (e) {}
            this.scene.pause('default');
            this.scene.launch('BallTossMinigame', { playerMeguDef: launchMegu() });
            this.scene.bringToTop('BallTossMinigame');
          } },
          { x: 488, y: 143, action: () => { this.closeFooterMenu(); this.scene.pause('default'); this.scene.launch('JumpRopeMinigame', { playerMeguDef: launchMegu() }); this.scene.bringToTop('JumpRopeMinigame'); } },
          { x: 68, y: 274, action: () => this.openAdventureModeMenu() },
          { x: 208, y: 274, action: () => {
            const playerMeguDef = launchMegu();
            this.closeFooterMenu();
            // Fade the home scene before starting Walk; the minigame then fades in
            // over the paused home scene so no home interactions remain available.
            this.cameras.main.fadeOut(250, 0, 0, 0);
            this.time.delayedCall(260, () => {
              this.scene.pause('default');
              this.scene.launch('WalkMinigame', { playerMeguDef });
              this.scene.bringToTop('WalkMinigame');
            });
          } }, // Walk pick-a-door minigame.
          { x: 348, y: 274, action: () => { this.closeFooterMenu(); this.scene.resume('default'); this.scene.launch('TakePhotoMode', { playerMeguDef: launchMegu() }); this.scene.bringToTop('TakePhotoMode'); } },
          { x: 488, y: 274, action: () => this.openFriendInviteMenu() }, // Friend invite.
          { x: 68, y: 404, action: () => this.openFriendVisitMenu() }, // Friend visit.
          { x: 208, y: 404, action: () => {
            const playerMeguDef = launchMegu();
            if (!playerMeguDef) return;
            this.closeFooterMenu();
            this.openGymMode(playerMeguDef);
          } } // Gym.
        ];
        outingItems.forEach((item, index) => {
          const cfg = MeguMenuLayouts.button(this, 'outing', ['sumo','jockey','ball_toss','jump_rope','adventure','walk','photo','invite_friend','visit_friend','gym'][index], {x:item.x,y:item.y,width:85,height:85});
          const x = cfg.hitboxX ?? cfg.x;
          const y = cfg.hitboxY ?? cfg.y;
          // Exact top-left canvas coordinates and 85x85 dimensions supplied for Outing.
          const width = cfg.hitboxWidth ?? cfg.width;
          const height = cfg.hitboxHeight ?? cfg.height;
          const zone = this.add.zone(x + width / 2, y + height / 2, width, height)
            .setScrollFactor(0).setDepth(34).setInteractive({ useHandCursor: true });
          zone.on('pointerdown', item.action);
          objects.push(zone);
        });
  
        // Quit button: 49x37 in the Outing artwork's local coordinate space.
        const quitCfg = MeguMenuLayouts.button(this, 'outing', 'close', {x:523,y:726,width:49,height:37});
        const quitX = quitCfg.hitboxX ?? quitCfg.x;
        const quitY = quitCfg.hitboxY ?? quitCfg.y;
        const quitW = quitCfg.hitboxWidth ?? quitCfg.width;
        const quitH = quitCfg.hitboxHeight ?? quitCfg.height;
        const quit = this.add.zone(quitX + quitW / 2, quitY + quitH / 2, quitW, quitH)
          .setScrollFactor(0).setDepth(35).setInteractive({ useHandCursor: true });
        const closeOutingMenu = (pointer, localX, localY, event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          this.closeFooterMenu();
        };
        quit.on('pointerdown', closeOutingMenu);
        quit.on('pointerup', closeOutingMenu);
        objects.push(quit);
      }
  
      if (isMeguMenu) {
        // MEGU menu controls use the supplied top-left anchored 640x950 artwork.
        const meguItems = [
          { x: 68, y: 143, action: () => { this.closeFooterMenu(); this.openChargingRoom(); } }
        ];
        meguItems.forEach(item => {
          const zone = MeguMenuLayouts.zone(this, 'megu', 'charging_room', {x:item.x,y:item.y,width:85,height:85})
            .setScrollFactor(0).setDepth(34).setInteractive({ useHandCursor: true });
          zone.on('pointerdown', item.action);
          objects.push(zone);
        });
  
        // Medicine actions occupy the second row (y=274).
        const medicineButtons = [
          { x: 68, key: 'elixir' },
          { x: 208, key: 'voltamin' },
          { x: 348, key: 'voltaminLite' }
          // Random Evolution, Devolution, and Super Evolution are not bound here;
          // their dedicated Charging Room controls remain unchanged.
        ];
        medicineButtons.forEach(item => {
          const x = item.x, y = 274, w = 85, h = 85;
          const zone = MeguMenuLayouts.zone(this, 'megu', {elixir:'elixir',voltamin:'voltamin',voltaminLite:'voltamin_lite'}[item.key], {x,y,width:w,height:h})
            .setScrollFactor(0).setDepth(34).setInteractive({ useHandCursor: true });
          zone.on('pointerdown', (pointer, localX, localY, event) => {
            if (event && event.stopPropagation) event.stopPropagation();
            this.openMedicineConfirmation(item.key);
          });
          objects.push(zone);
        });
  
        const quit = MeguMenuLayouts.zone(this, 'megu', 'close', {x:523,y:725,width:49,height:37})
          .setScrollFactor(0).setDepth(35).setInteractive({ useHandCursor: true });
        quit.on('pointerdown', (pointer, localX, localY, event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          this.closeFooterMenu();
        });
        objects.push(quit);
      }
  
      if (isCareMenu) {
        // Care button coordinates are top-left canvas positions. All action
        // hitboxes are exactly 85x85; the quit hotspot is 49x37.
        const careButtons = [
          [68, 143, 'food'],
          [208, 143, 'bath'],
          [348, 143, 'clean'],
          [488, 143, 'background'],
          [68, 274, 'furniture'],
          [208, 274, 'editFurniture'],
          [348, 274, 'clearFurniture'],
          [488, 274, 'accessory'],
          [68, 404, 'jukebox'],
          [208, 404, 'messageBoard'],
          [348, 404, 'layoutSave'],
          [488, 404, 'layoutLoad']
        ];
        careButtons.forEach(([x, y, action]) => {
          const tx = x;
          const ty = y;
          const buttonW = 85;
          const buttonH = 85;
          const cfg = MeguMenuLayouts.button(this, 'care', action, {x:tx,y:ty,width:buttonW,height:buttonH});
          this.addCareMenuHotspot(objects, cfg.hitboxX ?? cfg.x, cfg.hitboxY ?? cfg.y, cfg.hitboxWidth ?? cfg.width, cfg.hitboxHeight ?? cfg.height, action);
        });
  
        // Quit/close control uses the same Care-artwork-local coordinate space.
        const quitCfg = MeguMenuLayouts.button(this, 'care', 'close', {x:523,y:726,width:49,height:37});
        const quitX = quitCfg.hitboxX ?? quitCfg.x;
        const quitY = quitCfg.hitboxY ?? quitCfg.y;
        const quitW = quitCfg.hitboxWidth ?? quitCfg.width;
        const quitH = quitCfg.hitboxHeight ?? quitCfg.height;
        const quit = this.add.zone(quitX + quitW / 2, quitY + quitH / 2, quitW, quitH)
          .setScrollFactor(0).setDepth(35).setInteractive({ useHandCursor: true });
        quit.on('pointerdown', (pointer, localX, localY, event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          this.closeFooterMenu();
        });
        objects.push(quit);
      }
  
      if (isStoreMenu) {
        // Store hitboxes use absolute canvas coordinates; keep these values
        // independent from the artwork scaling.
        const addStoreHotspot = (x, y, width, height, action) => {
          const zone = this.add.zone(x + width / 2, y + height / 2, width, height)
            .setScrollFactor(0).setDepth(50).setInteractive({ useHandCursor: true });
          zone.on('pointerdown', (pointer, localX, localY, event) => {
            if (event && event.stopPropagation) event.stopPropagation();
            action();
          });
          objects.push(zone);
        };
        const storeButtons = [
          { x: 68, y: 143, action: () => { this.closeFooterMenu(); this.toggleFoodStore(); } },
          { x: 208, y: 143, action: () => { this.closeFooterMenu(); this.toggleFurnitureStore(); } },
          { x: 348, y: 143, action: () => { this.closeFooterMenu(); this.toggleBg(true, true); } },
          { x: 488, y: 143, action: () => { this.closeFooterMenu(); this.toggleSpecialStore(); } },
          { x: 68, y: 274, action: () => { this.closeFooterMenu(); this.toggleFurnitureSell(); } }
        ];
        storeButtons.forEach((item,index) => {
          const cfg=MeguMenuLayouts.button(this,'store',['food','furniture','background','special','sell_furniture'][index],{x:item.x,y:item.y,width:85,height:85});
          addStoreHotspot(cfg.hitboxX ?? cfg.x,cfg.hitboxY ?? cfg.y,cfg.hitboxWidth ?? cfg.width,cfg.hitboxHeight ?? cfg.height,item.action);
        });
        const storeClose=MeguMenuLayouts.button(this,'store','close',{x:522,y:728,width:49,height:37});
        addStoreHotspot(storeClose.hitboxX ?? storeClose.x,storeClose.hitboxY ?? storeClose.y,storeClose.hitboxWidth ?? storeClose.width,storeClose.hitboxHeight ?? storeClose.height,() => this.closeFooterMenu());
      }
  
      if (isOptionsMenu) {
        const addSettingsHotspot = (x, y, width, height, callback, label = 'SETTING') => {
          const id = label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_$/,'');
          const zone = MeguMenuLayouts.zone(this,'options',id,{x,y,width,height})
            .setScrollFactor(0).setDepth(34).setInteractive({ useHandCursor: true });
          zone.on('pointerdown', callback);
          objects.push(zone);
          return zone;
        };
        const scope = this.createFooterMenuScope(objects);
        const add = object => scope.add(object.setScrollFactor(0));
        const style = { fontFamily: 'Bebas Neue, Arial, sans-serif', fontSize: '18px', color: '#000000' };
        const bars = {};
        let dragging = null;
        const updateBar = (channel, pointer) => {
          const bar = bars[channel];
          const value = Phaser.Math.Clamp((pointer.x - bar.left) / bar.width, 0, 1);
          if (channel === 'bgm') this.setMusicVolume(value);
          else this.setSfxVolume(value);
        };
        for (const [channel, y] of [['bgm', 172], ['sfx', 202]]) {
          const left = 280, width = 180, height = 18;
          add(this.add.rectangle(left, y, width, height, 0xd0d0d0).setOrigin(0, 0.5).setStrokeStyle(1, 0x555555).setDepth(32));
          const fill = add(this.add.rectangle(left, y, width, height, 0x777777).setOrigin(0, 0.5).setDepth(33));
          const knob = add(this.add.rectangle(left, y, 4, height, 0x333333).setDepth(33));
          bars[channel] = { left, width, fill, knob };
          const zone = addSettingsHotspot(left, y - 12, width, 24, pointer => {
            dragging = { channel, id: pointer.id }; updateBar(channel, pointer);
          }, channel + ' volume');
        }
        this.settingsVolumeMarkers = { refresh: () => {
          for (const [channel, bar] of Object.entries(bars)) {
            const value = Phaser.Math.Clamp(channel === 'bgm' ? this.musicVolume : this.sfxVolume, 0, 1);
            bar.fill.setScale(value, 1);
            bar.knob.setX(bar.left + bar.width * value);
          }
        }};
        this.updateSettingsVolumeMarkers();
        scope.listen(this.input, 'pointermove', pointer => {
          if (dragging && dragging.id === pointer.id && pointer.isDown) updateBar(dragging.channel, pointer);
        });
        scope.listen(this.input, 'pointerup', () => { dragging = null; });
        scope.listen(this.input, 'pointerupoutside', () => { dragging = null; });
        add(this.add.rectangle(518, 187, 90, 28, 0xffffff).setStrokeStyle(1, 0x555555).setDepth(32));
        add(this.add.text(518, 187, 'MUTE ALL', style).setOrigin(0.5).setDepth(33));
        addSettingsHotspot(473, 173, 90, 28, () => { this.setMusicVolume(0); this.setSfxVolume(0); }, 'mute all');
        const privacyBox = add(this.add.rectangle(290, 232, 18, 18, 0xffffff).setStrokeStyle(1, 0x555555).setDepth(33));
        const privacyCheck = add(this.add.text(290, 232, GAME_ATTRIBUTES.hideFromDiscovery ? '✓' : '', {
          fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#000000'
        }).setOrigin(0.5).setDepth(34));
        let privacySaving = false;
        addSettingsHotspot(281, 223, 18, 18, async () => {
          if (privacySaving) return;
          privacySaving = true;
          const previous = !!GAME_ATTRIBUTES.hideFromDiscovery;
          GAME_ATTRIBUTES.hideFromDiscovery = !previous;
          privacyCheck.setText(GAME_ATTRIBUTES.hideFromDiscovery ? '✓' : '');
          persistGameAttributes();
          try {
            await saveMeguCloudData();
            this.showMeguMessage(GAME_ATTRIBUTES.hideFromDiscovery
              ? 'Your account is hidden from friend search' : 'Your account is visible to friends', false, 0, true);
          } catch (error) {
            GAME_ATTRIBUTES.hideFromDiscovery = previous;
            if (privacyCheck.active) privacyCheck.setText(previous ? '✓' : '');
            persistGameAttributes();
            console.warn('[MEGU] Could not save friend discovery setting:', error);
            this.showMeguMessage('Could not save privacy setting', false, 0, true);
          } finally { privacySaving = false; }
        }, 'HIDE ACCOUNT FROM FRIENDS');
        addSettingsHotspot(117, 253, 270, 80, () => exportMeguAccountBackup(this), 'EXPORT ACCOUNT BACKUP');
        addSettingsHotspot(117, 343, 270, 80, () => chooseMeguAccountBackup(this), 'RESTORE ACCOUNT BACKUP');
        addSettingsHotspot(179, 433, 208, 80, async () => {
          this.closeFooterMenu();
          await logoutMeguAccount();
        }, 'SETTINGS LOG OUT');
        addSettingsHotspot(522, 728, 49, 37, () => this.closeFooterMenu(), 'SETTINGS QUIT');
      }
    },
    initializeHomeNavigationControls() {
      // Sumo stat training is available in the dedicated Gym mode.
      this.homeSumoTrainingButtons = null;
      // Developer-only Sumo controls are restricted to tester/admin accounts.
      if (typeof meguHasRole === 'function' && meguHasRole('tester')) {
        this.sumoDebugButton = this.add.rectangle(565, 620, 126, 28, 0x49334f, 0.96)
          .setStrokeStyle(2, 0xffe7ac).setDepth(19).setInteractive({ useHandCursor:true });
        this.sumoDebugButtonLabel = this.add.text(565, 620, 'SUMO DEBUG', { ...textStyle(11), color:'#ffffff', fontStyle:'bold' })
          .setOrigin(0.5).setDepth(20);
        this.sumoDebugButton.on('pointerdown', () => this.openSumoDebugMenu());
      }

      // Bottom bar occupies y=844..950 (640x106).
      this.bottomBar = null;
      if (this.textures.exists('bottom-bar')) {
        this.bottomBar = this.add.image(0, 844, 'bottom-bar')
          .setOrigin(0, 0).setDisplaySize(W, 106).setDepth(6);
      }
      // Re-enabled Care menu button: local bottom-bar bounds (8, 6, 112, 92).
      // Convert its local artwork coordinates to game-canvas coordinates.
      this.careMenuButton = MeguMenuLayouts.zone(this,'footer','care',{x:8,y:850,width:112,height:92})
        .setDepth(20).setInteractive({ useHandCursor: true });
      this.careMenuButton.on('pointerdown', () => this.openFooterMenu('care'));
      // Store menu button: local bottom-bar bounds (256, 6, 112, 92).
      this.storeMenuButton = MeguMenuLayouts.zone(this,'footer','store',{x:256,y:850,width:112,height:92})
        .setDepth(20).setInteractive({ useHandCursor: true });
      this.storeMenuButton.on('pointerdown', () => this.openFooterMenu('store'));
      // Outing menu button: local bottom-bar bounds (131, 6, 112, 92).
      this.outingMenuButton = MeguMenuLayouts.zone(this,'footer','outing',{x:131,y:850,width:112,height:92})
        .setDepth(20).setInteractive({ useHandCursor: true });
      this.outingMenuButton.on('pointerdown', () => this.openFooterMenu('outing'));
      // Options menu button: local bottom-bar bounds (520, 6, 112, 92).
      this.optionsMenuButton = MeguMenuLayouts.zone(this,'footer','options',{x:520,y:850,width:112,height:92})
        .setDepth(20).setInteractive({ useHandCursor: true });
      this.optionsMenuButton.on('pointerdown', () => this.openFooterMenu('options'));
      // MEGU menu button: local bottom-bar bounds (380, 6, 113, 92).
      this.meguMenuButton = MeguMenuLayouts.zone(this,'footer','megu',{x:380,y:850,width:113,height:92})
        .setDepth(20).setInteractive({ useHandCursor: true });
      this.meguMenuButton.on('pointerdown', () => this.openFooterMenu('megu'));
    },
});
