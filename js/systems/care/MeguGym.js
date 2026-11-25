/* MeguGym: Gym mode implemented as a Main-scene room, like Charging Room. */
Object.assign(Main.prototype, {
  startGymTrainingExercise(statKey) {
    if (!this.gymActive || this.gymClosing) {
      console.warn('[Gym] Training animation skipped: Gym inactive', { statKey, gymActive: this.gymActive, gymClosing: this.gymClosing });
      return false;
    }
    const exercise = statKey === 'power'
      ? (Math.random() < 0.5 ? 'barbell' : 'punching')
      : statKey === 'agility'
        ? (Math.random() < 0.5 ? 'trampoline' : 'balance')
        : statKey === 'technique' ? 'dance'
        : statKey === 'endurance' ? 'treadmill' : null;
    if (!exercise) return false;
    if (this.pet && this.meguRenderer && !this.meguRenderer.destroyed) {
      this.pet.x = 320; this.pet.y = 580;
      if (this.target) { this.target.x = 320; this.target.y = 580; }
      this.meguRenderer.lockedPosition = null;
      this.meguRenderer.setPosition(320, 580);
    }
    const starters = {
      barbell: () => this.startMeguBarbell(),
      punching: () => this.startMeguPunchingBag(),
      trampoline: () => this.startMeguTrampoline(),
      balance: () => this.startMeguBallBalance(),
      dance: () => this.startMeguDance(0),
      treadmill: () => this.startMeguTreadmill()
    };
    console.info('[Gym] Starting training exercise', { statKey, exercise });
    starters[exercise]();
    const active = exercise === 'barbell' ? !!this.meguBarbell
      : exercise === 'punching' ? !!this.meguPunchingBag
      : exercise === 'trampoline' ? !!this.meguTrampoline
      : exercise === 'balance' ? !!this.meguBallBalance
      : exercise === 'dance' ? !!this.meguDance
      : !!this.meguTreadmill;
    if (!active) console.warn('[Gym] Routine did not activate', { statKey, exercise });
    return active;
  },
    openGymTrainingConfirmation(statKey) {
      if (!['power', 'agility', 'technique', 'endurance'].includes(statKey) || !this.gymActive || this.gymClosing) return;
      if (this.gymTrainingModalObjects?.length) return;
      const selected = this.characterDefs && (this.characterDefs[getCharacterIndex(this.characterDefs)] || this.characterDefs[0]);
      const characterId = String(selected?.id || 'ID1');
      const record = getSumoCharacterStatRecord(characterId, GAME_ATTRIBUTES.shiny === true);
      const cap = getCharacterStatCap(statKey, characterId, GAME_ATTRIBUTES.shiny === true);
      const today = localCalendarDay();
      const free = GAME_ATTRIBUTES.sumoTrainingLastFreeDay !== today;
      const elixir = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.elixir) || 0));
      const weightCost = statKey === 'agility' || statKey === 'endurance';
      const objects = [];
      this.gymTrainingModalObjects = objects;
      const add = object => { objects.push(object); return object; };
      const depth = 100100, cx = 320, cy = 320, top = cy - 165;
      const shade = add(this.add.rectangle(cx, cy, 640, 640, 0x000000, 0.72).setDepth(depth).setInteractive());
      shade.on('pointerdown', (p, x, y, e) => e?.stopPropagation?.());
      add(this.add.image(cx, cy, 'level-reward-message-bg').setDisplaySize(470, 330).setDepth(depth + 1));
      if (this.textures.exists('gym-training-icon')) {
        const icon = add(this.add.image(cx, top + 77, 'gym-training-icon').setDepth(depth + 2));
        icon.setScale(Math.min(1, 68 / Math.max(icon.width, icon.height)));
      }
      const style = { fontFamily:'sans-serif', fontSize:'16px', color:'#c9ff9f', stroke:'#18351b', strokeThickness:3, align:'center', wordWrap:{width:420} };
      add(this.add.text(cx, top + 137, `Train ${statKey.toUpperCase()} +1?`, style).setOrigin(0.5).setDepth(depth + 2));
      const costText = free ? 'Free training available today.' : `Cost: 1 Elixir (Holds: ${elixir}).`;
      add(this.add.text(cx, top + 202, `${costText}\n30% Satiety + 30 Hygiene.${weightCost ? '\nWeight decreases by 10%.' : ''}`, {...style, fontSize:'14px'}).setOrigin(0.5).setDepth(depth + 2));
      const close = () => {
        if (this.gymTrainingModalObjects !== objects) return;
        this.gymTrainingModalObjects = null;
        objects.forEach(o => { if (o?.active) o.destroy(); });
      };
      const notice = message => {
        if (typeof this.showMeguMessage === 'function') this.showMeguMessage(message);
        else if (typeof this.showMessage === 'function') this.showMessage(message);
      };
      const confirm = () => {
        close();
        if (Number(record.stats[statKey]) >= cap) { notice('Training failed: stat is already at maximum.'); return; }
        const stillFree = GAME_ATTRIBUTES.sumoTrainingLastFreeDay !== localCalendarDay();
        if (!stillFree && Number(GAME_ATTRIBUTES.elixir || 0) < 1) { notice('Training failed: not enough Elixir.'); return; }
        if (stillFree) GAME_ATTRIBUTES.sumoTrainingLastFreeDay = localCalendarDay();
        else GAME_ATTRIBUTES.elixir = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.elixir) || 0) - 1);
        record.training[statKey] = Math.max(0, Math.trunc(Number(record.training[statKey]) || 0)) + 1;
        record.stats[statKey] = Phaser.Math.Clamp(Math.trunc(Number(record.stats[statKey]) || 5) + 1, 5, cap);
        applyExerciseCost(weightCost ? Math.max(0, Number(GAME_ATTRIBUTES.weight) || 0) * 0.10 : 0, 0.30, this);
        applyHygieneCost(30, this);
        save(); this.updateMedicineHud?.(); this.refreshGymAttributeHud?.();
        // Start directly after successful training. The previous delayed callback
        // could be skipped by its scene-active guard without reporting an error.
        // The standalone Gym buttons run their routines synchronously as well.
        this.startGymTrainingExercise(statKey);
      };
      const makeButton = (x, texture, action) => {
        const button = add(this.add.image(x, top + 287, texture).setDisplaySize(78, 54).setDepth(depth + 3).setInteractive({useHandCursor:true}));
        button.on('pointerdown', (p, x, y, e) => { e?.stopPropagation?.(); action(); });
      };
      makeButton(cx - 42, 'elixir-confirm-ok', confirm);
      makeButton(cx + 42, 'elixir-confirm-close', close);
    },
  openGymMode(playerMeguDef = null) {
    if (this.gymActive || this.gymClosing || this.chargingRoomActive || this.chargingRoomClosing) return;
    if (!this.prepareForExternalInteraction()) return;

    this.closeFooterMenu();
    this.endPetting();
    this.gymActive = true;
    this.gymClosing = false;
    // Cancel any Home destination already queued before Gym was opened.
    if (this.pet && this.target) {
      this.target.x = this.pet.x;
      this.target.y = this.pet.y;
    }
    this.wander = false;
    this.clickMoveActive = false;
    // Disable the Home room hit-zone itself while Gym owns the play area.
    if (this.room?.input) this.room.input.enabled = false;
    this.gymObjects = [];
    this.gymMeguDef = playerMeguDef;
    this.gymStatRecord = null;

    [this.careMenuButton, this.outingMenuButton, this.storeMenuButton, this.meguMenuButton, this.optionsMenuButton]
      .forEach(button => { if (button && button.input) button.input.enabled = false; });

    if (this.meguMessageTimer) {
      this.meguMessageTimer.remove(false);
      this.meguMessageTimer = null;
    }
    if (this.meguMessageContainer?.active) this.meguMessageContainer.destroy(true);
    this.meguMessageContainer = null;
    if (this.meguVoiceSounds) this.meguVoiceSounds.forEach(sound => {
      if (sound && sound.isPlaying) sound.stop();
    });
    this.currentMeguVoiceKey = '';

    const camera = this.cameras.main;
    const buildGym = () => {
      if (!this.gymActive) return;
      const add = object => { this.gymObjects.push(object); return object; };

      // Match Charging Room: cover only the 640x640 play area. The original
      // Home stats panel (y=644..844) and bottom bar (y=844..950) stay intact.
      const background = this.textures.exists('gym-background')
        ? this.add.image(0, 0, 'gym-background').setOrigin(0, 0).setDisplaySize(W, 640)
        : this.add.rectangle(W / 2, 320, W, 640, 0x171321);
      // The Gym background consumes empty-area clicks; only Gym's own controls
      // above it receive pointer input. The Home room zone is disabled as well.
      add(background.setDepth(50000).setScrollFactor(0).setInteractive());
      background.on('pointerdown', (pointer, localX, localY, event) => {
        if (event?.stopPropagation) event.stopPropagation();
      });

      const selected = this.characterDefs && (this.characterDefs[getCharacterIndex(this.characterDefs)] || this.characterDefs[0]);
      const characterId = String(selected?.id || this.gymMeguDef?.logicalId || this.gymMeguDef?.id || 'ID1');
      this.gymCharacterId = characterId;
      this.gymStatRecord = getSumoCharacterStatRecord(characterId, GAME_ATTRIBUTES.shiny === true);

      add(this.add.rectangle(320, 31, 604, 48, 0x20182a, 0.86)
        .setStrokeStyle(2, 0xffe7ac).setDepth(50020));
      add(this.add.text(320, 13, 'MEGU TRAINING', {
        ...textStyle(13), fontStyle: 'bold', color: '#ffe7ac'
      }).setOrigin(0.5).setDepth(50021));
      this.gymAttributeText = add(this.add.text(320, 39, '', {
        ...textStyle(13), fontStyle: 'bold', color: '#ffffff', align: 'center'
      }).setOrigin(0.5).setDepth(50021));
      this.refreshGymAttributeHud();

      // Compact two-column exercise controls keep the center of the Gym
      // clear for MEGU and training equipment.
      const gymExercises = [
        { label: 'DANCE', x: 112, y: 153, start: () => {
          this.stopMeguTrampoline(); this.stopMeguTreadmill(); this.stopMeguPunchingBag();
          this.stopMeguBarbell(); this.stopMeguBallBalance();
          this.startMeguDance(0);
        } },
        { label: 'BALL BALANCE', x: 528, y: 153, start: () => {
          this.stopMeguTrampoline(); this.stopMeguTreadmill(); this.stopMeguPunchingBag();
          this.stopMeguBarbell(); this.meguDance = null;
          this.startMeguBallBalance();
        } },
        { label: 'LIFT BARBELL', x: 112, y: 205, start: () => {
          this.stopMeguTrampoline(); this.stopMeguTreadmill(); this.stopMeguPunchingBag();
          this.stopMeguBallBalance(); this.meguDance = null;
          this.startMeguBarbell();
        } },
        { label: 'PUNCHING BAG', x: 528, y: 205, start: () => {
          this.stopMeguTrampoline(); this.stopMeguTreadmill(); this.stopMeguBarbell();
          this.stopMeguBallBalance(); this.meguDance = null;
          this.startMeguPunchingBag();
        } },
        { label: 'TREADMILL', x: 112, y: 257, start: () => {
          this.stopMeguTrampoline(); this.meguDance = null;
          this.startMeguTreadmill();
        } },
        { label: 'TRAMPOLINE', x: 528, y: 257, start: () => {
          this.meguDance = null; this.startMeguTrampoline();
        } }
      ];
      gymExercises.forEach(exercise => {
        const cfg=MeguMenuLayouts.button(this,'gym',exercise.label.toLowerCase().replace(/ /g,'_'),{x:exercise.x,y:exercise.y,width:176,height:36});
        const button = add(this.add.rectangle(cfg.x, cfg.y, cfg.width, cfg.height, 0x70465f, 0.98)
          .setStrokeStyle(2, 0xffd5ec).setDepth(50024)
          .setInteractive({ useHandCursor: true }));
        add(this.add.text(cfg.x, cfg.y, exercise.label, {
          ...textStyle(11), color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(50025));
        button.on('pointerdown', (pointer, localX, localY, event) => {
          if (event?.stopPropagation) event.stopPropagation();
          if (!this.gymClosing) {
            // Give every Gym animation the same starting position before its
            // own choreography/equipment positioning takes over.
            if (this.pet && this.meguRenderer && !this.meguRenderer.destroyed) {
              this.pet.x = 320;
              this.pet.y = 580;
              if (this.target) {
                this.target.x = 320;
                this.target.y = 580;
              }
              this.meguRenderer.lockedPosition = null;
              this.meguRenderer.setPosition(320, 580);
            }
            exercise.start();
          }
        });
      });

      const stats = [
        { key: 'power', label: 'POWER +1', x: 80 },
        { key: 'agility', label: 'AGILITY +1', x: 240 },
        { key: 'technique', label: 'TECHNIQUE +1', x: 400 },
        { key: 'endurance', label: 'ENDURANCE +1', x: 560 }
      ];
      stats.forEach(stat => {
        const cfg=MeguMenuLayouts.button(this,'gym','train_'+stat.key,{x:stat.x,y:94,width:142,height:30});
        const plate = add(this.add.rectangle(cfg.x, cfg.y, cfg.width, cfg.height, 0x49334f, 0.97)
          .setStrokeStyle(2, 0xffe7ac).setDepth(50022)
          .setInteractive({ useHandCursor: true }));
        add(this.add.text(cfg.x, cfg.y, stat.label, {
          ...textStyle(10), color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(50023));
        plate.on('pointerdown', (pointer, localX, localY, event) => {
          if (event?.stopPropagation) event.stopPropagation();
          if (!this.gymClosing) this.openGymTrainingConfirmation(stat.key);
        });
      });

      if (typeof meguHasRole === 'function' && meguHasRole('tester')) {
        const reset = add(this.add.rectangle(320, 135, 205, 28, 0x70465f, 0.98)
          .setStrokeStyle(2, 0xffd5ec).setDepth(50024).setInteractive({useHandCursor:true}));
        add(this.add.text(320, 135, 'RESET DAILY TRAINING', {...textStyle(11), color:'#ffffff'}).setOrigin(0.5).setDepth(50025));
        reset.on('pointerdown', (pointer, x, y, event) => {
          event?.stopPropagation?.();
          GAME_ATTRIBUTES.sumoTrainingLastFreeDay = '';
          save();
        });
      }

      const closeTexture = this.textures.exists('level-reward-close')
        ? 'level-reward-close' : 'edit-close-icon';
      if (this.textures.exists(closeTexture)) {
        const closeCfg=MeguMenuLayouts.button(this,'gym','close',{x:590,y:590,width:92,height:76});
        const close = add(this.add.image(closeCfg.x, closeCfg.y, closeTexture).setDisplaySize(closeCfg.width, closeCfg.height)
          .setDepth(50040).setInteractive({ useHandCursor: true }));
        close.on('pointerdown', (pointer, localX, localY, event) => {
          if (event?.stopPropagation) event.stopPropagation();
          this.closeGymMode();
        });
      }

      const atlasKey = meguTextureKey(GAME_ATTRIBUTES.petId || 'ID1', GAME_ATTRIBUTES.shiny === true);
      if (this.meguRenderer && !this.meguRenderer.destroyed && this.characterSprite?.active && this.textures.exists(atlasKey)) {
        this.meguRenderer.setAtlas(atlasKey);
        this.meguRenderer.setState(MeguRenderer.STATES.STANDING_1);
        this.meguRenderer.setPosition(this.pet.x, this.pet.y);
        this.meguRenderer.setFlipX(Number(this.look) > 0);
        this.meguRenderer.setRotation(0);
        this.meguRenderer.setVisible(true);
        this.meguRenderer.setDepth(50001, 50000.5);
      }
      camera.fadeIn(250, 0, 0, 0);
    };

    // Load the Gym-only ball before entering; it is not part of Home's preload.
    const enterGym = () => {
      if (!this.gymActive || this.gymClosing) return;
      camera.once('camerafadeoutcomplete', buildGym);
      camera.fadeOut(250, 0, 0, 0);
    };
    // Load both Gym-only training props on entry; remove them on exit.
    const needBalance = !this.textures.exists('megu-balance-ball');
    const needPunch = !this.textures.exists('megu-gym-punching-bag');
    const needPunchSound = !this.cache.audio.exists('sumo-sfx-beat');
    const needTreadmill = !this.textures.exists('megu-gym-treadmill');
    const needTrampoline = !this.textures.exists('megu-gym-trampoline');
    if (needBalance) this.load.image('megu-balance-ball', 'assets/minigame/balance_ball@2x.png');
    if (needPunch) this.load.image('megu-gym-punching-bag', 'assets/minigame/punching_bag@2x.png');
    if (needPunchSound) this.load.audio('sumo-sfx-beat', 'assets/sound/sfx/SE_beat.wav');
    if (needTreadmill) this.load.image('megu-gym-treadmill', 'assets/minigame/treadmill@2x.png');
    if (needTrampoline) this.load.image('megu-gym-trampoline', 'assets/minigame/trampouline@2x.png');
    if (needBalance || needPunch || needPunchSound || needTreadmill || needTrampoline) {
      this.load.once('complete', enterGym);
      this.load.start();
    } else enterGym();
  },

  refreshGymAttributeHud() {
    if (!this.gymAttributeText?.active || !this.gymStatRecord) return;
    const stats = this.gymStatRecord.stats;
    this.gymAttributeText.setText(
      `POWER ${stats.power}     AGILITY ${stats.agility}     TECHNIQUE ${stats.technique}     ENDURANCE ${stats.endurance}`
    );
  },


  updateGymMode(time, delta = 16) {
    if (!this.gymActive || this.gymClosing) return;
    // Gym freezes Home movement. Do not run updateHomePetMovement here.
    if (this.pet && this.target) {
      this.target.x = this.pet.x;
      this.target.y = this.pet.y;
    }
    this.wander = false;
    this.clickMoveActive = false;
    const renderer = this.meguRenderer;
    if (!renderer || renderer.destroyed || !this.pet) return;
    renderer.setVisible(true);
    renderer.setDepth(50001, 50000.5);
    if (this.meguTrampoline) {
      this.updateMeguTrampoline(time, delta, renderer);
      return;
    }
    if (this.meguTreadmill) {
      this.updateMeguTreadmill(time, delta, renderer);
      return;
    }
    if (this.meguPunchingBag) {
      this.updateMeguPunchingBag(time, delta, renderer);
      return;
    }
    if (this.meguBarbell) {
      this.updateMeguBarbell(time, delta, renderer);
      return;
    }
    if (this.meguBallBalance) {
      this.updateMeguBallBalance(time, delta, renderer);
      return;
    }
    if (this.meguDance) {
      this.updateMeguDance(time, delta, renderer);
      return;
    }
    this.updateHomePetFacing(time);
    renderer.setPosition(this.pet.x, this.pet.y);
    renderer.setFlipX(Number(this.look) > 0);
    renderer.setRotation(0);
    renderer.playAnimation('standing');
    renderer.update(time, delta);
  },

  closeGymMode() {
    if (!this.gymActive || this.gymClosing) return;
    this.gymClosing = true;
    if (this.gymTrainingModalObjects) {
      this.gymTrainingModalObjects.forEach(object => { if (object?.active) object.destroy(); });
      this.gymTrainingModalObjects = null;
    }
    this.meguDance = null;
    this.stopMeguTrampoline();
    this.stopMeguTreadmill();
    this.stopMeguBallBalance();
    this.stopMeguBarbell();
    this.stopMeguPunchingBag();
    const camera = this.cameras.main;
    camera.once('camerafadeoutcomplete', () => {
      (this.gymObjects || []).forEach(object => { if (object?.active) object.destroy(); });
      this.gymObjects = [];
      // Release the Gym-only ball texture after its sprite has been destroyed.
      if (this.textures.exists('megu-balance-ball')) this.textures.remove('megu-balance-ball');
      if (this.textures.exists('megu-gym-punching-bag')) this.textures.remove('megu-gym-punching-bag');
      if (this.textures.exists('megu-gym-treadmill')) this.textures.remove('megu-gym-treadmill');
      if (this.textures.exists('megu-gym-trampoline')) this.textures.remove('megu-gym-trampoline');
      this.gymAttributeText = null;
      this.gymStatRecord = null;
      this.gymActive = false;
      this.gymClosing = false;
      if (this.room?.input) this.room.input.enabled = true;
      [this.careMenuButton, this.outingMenuButton, this.storeMenuButton, this.meguMenuButton, this.optionsMenuButton]
        .forEach(button => { if (button && button.input) button.input.enabled = true; });
      if (this.meguRenderer && !this.meguRenderer.destroyed) {
        this.meguRenderer.endJump();
        this.meguRenderer.lockedPosition = null;
        this.meguRenderer.setState(MeguRenderer.STATES.STANDING_1);
        this.meguRenderer.setDepth(4.15);
        this.meguRenderer.setPosition(this.pet.x, this.pet.y);
        this.meguRenderer.setFlipX(Number(this.look) > 0);
        this.meguRenderer.setRotation(0);
      }
      this.syncMeguMenuVisibility();
      this.nextMeguVoiceAt = this.time ? this.time.now + Phaser.Math.Between(5000, 10000) : null;
      camera.fadeIn(250, 0, 0, 0);
    });
    camera.fadeOut(250, 0, 0, 0);
  }
});
