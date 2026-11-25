// Gym mode: a full-height 640x950 training room for MEGU's minigame attributes.
class GymMode extends Phaser.Scene {
  constructor() { super({ key: 'GymMode' }); }

  init(data = {}) {
    this.playerMeguDef = data.playerMeguDef || null;
    this.assetToken = `gym-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.backgroundKey = `${this.assetToken}-background`;
    this.closeKey = `${this.assetToken}-close`;
    this.characterTextureKey = `${this.assetToken}-megu`;
    this.objects = [];
    this.trainingButtons = [];
    this.mainScene = null;
    this.meguRenderer = null;
    this.ending = false;
    this._gymCleaned = false;
    this._lastMoveFrameToggle = false;
  }

  preload() {
    this.load.image(this.backgroundKey, 'assets/minigame/gym@2x.png');
    this.load.image(this.closeKey, 'assets/menus/buttons/btn_close@2x.png');
    const main = this.scene.get('default');
    const defs = main?.characterDefs;
    const def = this.playerMeguDef || (defs && (defs[getCharacterIndex(defs)] || defs[0]));
    if (!def) return;
    const paths = def.image && def.json ? def : meguAssetPaths(def.logicalId || def.id, GAME_ATTRIBUTES.shiny === true);
    this.playerMeguDef = { ...def, image: paths.image, json: paths.json };
    this.load.atlas(this.characterTextureKey, this.playerMeguDef.image, this.playerMeguDef.json);
  }

  create() {
    this.mainScene = this.scene.get('default');
    this.mainInputWasEnabled = this.mainScene?.input ? this.mainScene.input.enabled : true;
    if (this.mainScene?.input) this.mainScene.input.enabled = false;
    if (this.mainScene?.bgmSound?.isPlaying) this.mainScene.bgmSound.stop();

    // Keep the same 640x950 canvas as the main Home screen.
    this.game.scale.resize(640, 950);
    this.cameras.main.setViewport(0, 0, 640, 950).setBounds(0, 0, 640, 950);
    // Explicitly keep the overlay camera transparent. A missing background
    // color is not sufficient on every renderer/configuration: the overlay can
    // otherwise clear the paused Home scene, hiding its original stats panel
    // and footer. The Gym artwork itself covers only y=0..644.
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');

    const add = object => { this.objects.push(object); return object; };
    // Only cover the playfield. The Home scene's own status panel and footer
    // remain visible and retain their original rendering implementation.
    add(this.add.image(320, 322, this.backgroundKey).setDisplaySize(640, 644).setDepth(0));
    this.createAttributeHud(add);
    this.createTrainingButtons(add);
    this.createBottomUI(add);
    this.createCloseButton(add);
    this.createGymMegu(add);

    this.input.on('pointerdown', pointer => {
      if (this.ending || pointer.y < 135 || pointer.y >= 644) return;
      const main = this.mainScene;
      if (!main?.pet || !main?.target) return;
      const target = { x: Phaser.Math.Clamp(pointer.x, 20, 620), y: Phaser.Math.Clamp(pointer.y, 145, 630) };
      if (typeof isInsideHomeWalkableArea === 'function' && !isInsideHomeWalkableArea(target.x, target.y)) return;
      main.target.x = target.x;
      main.target.y = target.y;
      main.wander = false;
      main.clickMoveActive = true;
      main.movementStopped = false;
    });

    this.events.once('shutdown', this.cleanup, this);
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  createAttributeHud(add) {
    const main = this.mainScene;
    const selected = main?.characterDefs && (main.characterDefs[getCharacterIndex(main.characterDefs)] || main.characterDefs[0]);
    const characterId = String(selected?.id || this.playerMeguDef?.logicalId || this.playerMeguDef?.id || 'ID1');
    this.characterId = characterId;
    this.statRecord = getSumoCharacterStatRecord(characterId, GAME_ATTRIBUTES.shiny === true);
    add(this.add.rectangle(320, 31, 604, 48, 0x20182a, 0.86).setStrokeStyle(2, 0xffe7ac).setDepth(20));
    add(this.add.text(320, 13, 'MEGU TRAINING', {
      ...textStyle(13), fontStyle: 'bold', color: '#ffe7ac'
    }).setOrigin(0.5).setDepth(21));
    this.attributeText = add(this.add.text(320, 39, '', {
      ...textStyle(13), fontStyle: 'bold', color: '#ffffff', align: 'center'
    }).setOrigin(0.5).setDepth(21));
    this.refreshAttributeHud();
  }

  refreshAttributeHud() {
    if (!this.attributeText?.active || !this.statRecord) return;
    const s = this.statRecord.stats;
    this.attributeText.setText(`POWER ${s.power}     AGILITY ${s.agility}     TECHNIQUE ${s.technique}     ENDURANCE ${s.endurance}`);
  }

  createTrainingButtons(add) {
    const stats = [
      { key: 'power', label: 'POWER +1', x: 80 },
      { key: 'agility', label: 'AGILITY +1', x: 240 },
      { key: 'technique', label: 'TECHNIQUE +1', x: 400 },
      { key: 'endurance', label: 'ENDURANCE +1', x: 560 }
    ];
    for (const stat of stats) {
      const plate = add(this.add.rectangle(stat.x, 94, 142, 30, 0x49334f, 0.97)
        .setStrokeStyle(2, 0xffe7ac).setDepth(22).setInteractive({ useHandCursor: true }));
      add(this.add.text(stat.x, 94, stat.label, {
        ...textStyle(10), color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(23));
      plate.on('pointerdown', () => {
        if (this.ending || !this.mainScene) return;
        this.mainScene.openHomeSumoTraining(stat.key, this);
      });
      this.trainingButtons.push(plate);
    }
  }


  createBottomUI(add) {
    const main = this.mainScene;
    const footerY = 844;

    // The Home scene's original bottom-bar artwork remains visible beneath Gym.
    // These Gym-owned zones only forward taps after returning to Home.

    const buttons = [
      { kind: 'care', x: 64, width: 112 },
      { kind: 'outing', x: 187, width: 112 },
      { kind: 'store', x: 312, width: 112 },
      { kind: 'megu', x: 436.5, width: 113 },
      { kind: 'options', x: 576, width: 112 }
    ];

    for (const button of buttons) {
      const zone = add(this.add.zone(button.x, footerY + 52, button.width, 92)
        .setDepth(60).setInteractive({ useHandCursor: true }));
      zone.on('pointerdown', () => {
        if (this.ending || typeof main?.openFooterMenu !== 'function') return;
        this.exitGym(() => main.openFooterMenu(button.kind));
      });
    }
  }

  createCloseButton(add) {
    const cfg = MeguMenuLayouts.button(this, 'gym', 'close', {x:590,y:590,width:92,height:76});
    const close = add(this.add.image(cfg.x, cfg.y, this.closeKey).setDisplaySize(cfg.width, cfg.height)
      .setDepth(40).setInteractive({ useHandCursor: true }));
    close.on('pointerdown', () => this.exitGym());
  }

  createGymMegu() {
    const key = this.textures.exists(this.characterTextureKey)
      ? this.characterTextureKey
      : String(this.playerMeguDef?.id || this.mainScene?.activeCharacterTextureKey || '');
    if (!key || !this.textures.exists(key)) {
      console.warn('[Gym] Character atlas unavailable:', key);
      return;
    }
    const framePrefix = String(this.playerMeguDef?.logicalId || this.playerMeguDef?.id || this.mainScene?.activeCharacterTextureKey || key);
    const main = this.mainScene;
    const x = Phaser.Math.Clamp(Number(main?.pet?.x) || 320, 20, 620);
    const y = Phaser.Math.Clamp(Number(main?.pet?.y) || 475, 145, 630);
    if (main?.pet) main.pet.y = y;
    if (main?.target) main.target.y = Phaser.Math.Clamp(Number(main.target.y) || y, 145, 630);
    try {
      this.meguRenderer = new MeguRenderer(this, {
        atlasKey: key, framePrefix, x, y, originX: 0.5, originY: 1,
        depth: 5, autoUpdate: false, state: MeguRenderer.STATES.STANDING_1,
        shadow: { widthRatio: 0.62, height: 13, yOffset: 3, color: 0x101010, alpha: 0.27 }
      });
      this.meguRenderer.setScale(1);
      this.meguRenderer.setPosition(x, y);
    } catch (error) {
      console.warn('[Gym] Could not create MeguRenderer:', error);
      this.meguRenderer = null;
    }
  }

  update(time, delta) {
    if (this.ending || !this.mainScene || !this.meguRenderer || this.meguRenderer.destroyed) return;
    const main = this.mainScene;
    if (typeof main.updateHomePetMovement === 'function') main.updateHomePetMovement(time);
    if (typeof main.updateHomePetFacing === 'function') main.updateHomePetFacing(time);

    const pet = main.pet;
    if (pet) {
      this.meguRenderer.setPosition(pet.x, pet.y);
      this.meguRenderer.setFlipX(Number(main.look) > 0);
      const moving = Math.hypot((main.target?.x ?? pet.x) - pet.x, (main.target?.y ?? pet.y) - pet.y) > 0.5;
      if (moving) this.meguRenderer.playAnimation('walking');
      else this.meguRenderer.playAnimation('standing');
    }
    this.meguRenderer.update(time, delta);
  }

  exitGym(afterExit = null) {
    if (this.ending) return;
    this.ending = true;
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.scale.resize(640, 950);
      const main = this.mainScene;
      this.scene.stop('GymMode');
      if (main) {
        main.cameras.main.resetFX();
        main.cameras.main.setViewport(0, 0, 640, 950);
        if (main.input) main.input.enabled = this.mainInputWasEnabled !== false;
      }
      this.scene.resume('default');
      if (main) {
        if (typeof afterExit === 'function') main.cameras.main.once('camerafadeincomplete', afterExit);
        main.cameras.main.fadeIn(250, 0, 0, 0);
      } else if (typeof afterExit === 'function') {
        afterExit();
      }
    });
    this.cameras.main.fadeOut(250, 0, 0, 0);
  }

  cleanup() {
    if (this._gymCleaned) return;
    this._gymCleaned = true;
    if (this.trainingModalObjects) {
      this.trainingModalObjects.forEach(object => { try { object?.destroy(); } catch (e) {} });
      this.trainingModalObjects = null;
    }
    if (this.meguRenderer && !this.meguRenderer.destroyed) this.meguRenderer.destroy();
    this.meguRenderer = null;
    this.objects.forEach(object => { try { object?.destroy(); } catch (e) {} });
    this.objects = [];
  }
}
