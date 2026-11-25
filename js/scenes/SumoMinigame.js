// Phaser scene module. Loaded after js/game.js and before js/boot.js.
// Shared by HUD creation and match-selection callbacks.
const sumoVerticalText = value => Array.from(String(value || '').toUpperCase()).join('\n');
const sumoVerticalRank = value => sumoVerticalText(String(value || '').replace(/\s*[-:–—]?\s*(?:east|west)\s*$/i, ''));

class SumoMinigame extends Phaser.Scene {
  constructor() { super({ key: 'SumoMinigame' }); }
  init(data = {}) { this.entryPlayerMeguDef = data && data.playerMeguDef ? data.playerMeguDef : null; this.guestCandidates = Array.isArray(data.guestCandidates) ? data.guestCandidates : []; this.guestOpponent = null; this.isGuestOpponent = false; this.maxHP = 10; this.playerMaxHP = 10; this.cpuMaxHP = 10; this.playerLives = 10; this.cpuLives = 10; this.playerWeight = Number(GAME_ATTRIBUTES.weight) || 0; this.cpuWeight = 0; this.pendingGrabDamage = { player: 0, cpu: 0 }; this.finished = false; this.roundBusy = false; this.lastPlayerMove = null; this.lastCpuMove = null; this.debugCpuMove = null; this._cleaned = false; this._returned = false; this._quitInProgress = false; this._quitFallbackTimer = null; this._sumoReturnCameraHandler = null; this._sumoShadowUpdateHandler = null; this._normalHygieneCostApplied = false; this.stressGameCompleted = false; this.meguTextureKey = null; this.endureUsed = false; this.opponentSelected = false; this.sumoCareer = GAME_ATTRIBUTES.sumoCareer; this.zabutonThrowStarted = false; this.zabutonObjects = []; this._sumoPromotionNotice = null; }
  preload() {
    this.load.json('megu-menu-sumo', 'js/config/menus/sumo.json');
    this.load.image('sumo-house', 'assets/minigame/dohyou@2x.png');
    this.load.image('sumo-zabuton', 'assets/furniture/KG6@2x.png');
    this.load.image('sumo-close', 'assets/menus/buttons/btn_close@2x.png');
    this.load.image('sumo-select-panel', 'assets/menus/sumo_select@2x.png');
    this.load.image('sumo-select-rankup-panel', 'assets/menus/sumo_select_rankup@2x.png');
    this.load.audio('sumo-bgm', 'assets/sound/bgm/BGM_sumo.mp3');
    this.load.audio('sumo-sfx-hyoshiki', 'assets/sound/sfx/SE_hyoshiki.wav');
    this.load.audio('sumo-sfx-hakkeyoi', 'assets/sound/sfx/SE_hakkeyoi.wav');
    this.load.audio('sumo-sfx-stamp', 'assets/sound/sfx/SE_Stamp.wav');
    this.load.audio('sumo-sfx-beat', 'assets/sound/sfx/SE_beat.wav');
    this.load.audio('sumo-sfx-sweep', 'assets/sound/sfx/SE_sweep.wav');
    this.load.json('sumo-default-names', 'assets/texts/default_sumo_names.json');
    const main = this.scene.get('default');
    const defs = main && main.characterDefs;
    // Use the exact character definition passed from the home screen at launch.
    // This avoids silently falling back to ID1 if the global selection changes.
    const def = this.entryPlayerMeguDef || (defs && defs[getCharacterIndex(defs)]);
    // Keep the player's selected MEGU, and choose a random available catalog MEGU for the opponent.
    this.playerMeguId = String(def && def.id || 'ID1');
    this.playerMeguDef = def || { id: this.playerMeguId, image: `assets/megu/${this.playerMeguId}.png`, json: `assets/megu/${this.playerMeguId}.json` };
    const opponentCandidates = (defs || []).filter(item => item && item.id != null && item.image && item.json);
    const alreadyDefeated = this.sumoCareer?.promotion?.defeatedIds || [];
    const freshPromotionOpponents = opponentCandidates.filter(item => !alreadyDefeated.includes(String(item.id)));
    const eligibleOpponents = freshPromotionOpponents.length ? freshPromotionOpponents : opponentCandidates;
    const playerStatId = String(this.playerMeguDef.logicalId || this.playerMeguDef.id || this.playerMeguId);
    const playerStats = getSumoCharacterStatRecord(playerStatId, GAME_ATTRIBUTES.shiny === true).stats;
    const playerStatTotal = ['power','agility','technique','endurance'].reduce((sum,key) => sum + (Number(playerStats[key]) || 5), 0);
    const playerRank = Phaser.Math.Clamp(Math.trunc(Number(GAME_ATTRIBUTES.sumoCareer?.rankIndex) || 0), 0, SUMO_RANKS.length - 1);
    const compatibleGuests = this.guestCandidates.filter(guest => {
      const total = ['power','agility','technique','endurance'].reduce((sum,key) => sum + (Number(guest.sumoStats?.[key]) || 5), 0);
      return Math.abs(Number(guest.sumoRankIndex) - playerRank) <= 10 && Math.abs(total - playerStatTotal) <= 52;
    });
    this.guestOpponent = compatibleGuests.length ? Phaser.Utils.Array.GetRandom(compatibleGuests) : null;
    const fallbackOpponentMeguDef = eligibleOpponents.length ? Phaser.Utils.Array.GetRandom(eligibleOpponents) : this.playerMeguDef;
    if (this.guestOpponent) {
      const guestPaths = meguAssetPaths(this.guestOpponent.petId, this.guestOpponent.shiny === true);
      this.opponentMeguId = guestPaths.key;
      this.opponentMeguDef = { ...fallbackOpponentMeguDef, id: guestPaths.key, logicalId: this.guestOpponent.petId, image: guestPaths.image, json: guestPaths.json };
    } else {
      this.opponentMeguDef = fallbackOpponentMeguDef;
      this.opponentMeguId = String(this.opponentMeguDef.id || this.playerMeguId);
    }
    // Four distinct contenders are prepared before the selection screen opens.
    const previewPool = opponentCandidates.length ? opponentCandidates : [this.opponentMeguDef];
    const shuffled = Phaser.Utils.Array.Shuffle([...previewPool]);
    this.sumoSelectionCandidates = Array.from({length:4}, (_, i) => shuffled[i % shuffled.length]);
    this.sumoSelectionCandidates.forEach((candidate, i) => {
      const key = `sumo-select-opponent-${candidate.id}`;
      if (!this.textures.exists(key)) this.load.atlas(key, candidate.image, candidate.json);
    });
    const opponentMinWeight = Number(this.opponentMeguDef.min_weight);
    const opponentMaxWeight = Number(this.opponentMeguDef.max_weight);
    const minOpponentWeight = Number.isFinite(opponentMinWeight) ? opponentMinWeight : 0;
    const maxOpponentWeight = Number.isFinite(opponentMaxWeight) ? Math.max(minOpponentWeight, opponentMaxWeight) : minOpponentWeight;
    this.playerWeight = Number(GAME_ATTRIBUTES.weight) || 0;
    this.cpuWeight = Number(Phaser.Math.FloatBetween(minOpponentWeight, maxOpponentWeight).toFixed(2));
    this.meguId = this.playerMeguId; // compatibility with existing player animation logic
    this.playerTextureKey = this.playerMeguId;
    this.opponentTextureKey = 'sumo-opponent-' + this.opponentMeguId;
    this.meguTextureKey = this.playerTextureKey;
    if (!this.textures.exists(this.playerTextureKey)) {
      this.load.atlas(this.playerTextureKey, this.playerMeguDef.image || ('assets/megu/' + this.playerMeguId + '.png'), this.playerMeguDef.json || ('assets/megu/' + this.playerMeguId + '.json'));
    }
    if (!this.textures.exists(this.opponentTextureKey)) {
      this.load.atlas(this.opponentTextureKey, this.opponentMeguDef.image || 'assets/megu/ID2.png', this.opponentMeguDef.json || 'assets/megu/ID2.json');
    }
  }
  create() {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    // Play the opening sumo announcement until the player chooses a move.
    try {
      this.sumoHyoshikiSound = this.sound.add('sumo-sfx-hyoshiki', { volume: 0.85 });
      this.sumoHyoshikiSound.play();
    } catch (e) { this.sumoHyoshikiSound = null; }
    this.sumoHakkeyoiPlayed = false;
    this.objects = [];
    const add = obj => { this.objects.push(obj); return obj; };
    const bg = add(this.add.image(W/2,PLAY_AREA_H/2,'sumo-house'));
    bg.setDisplaySize(W,PLAY_AREA_H).setDepth(0);
    const sumoBox = (id, x, y, width, height) => MeguMenuLayouts.button(this, 'sumo', id, {x:x-width/2,y:y-height/2,width,height});
    const sumoPlate = (id, x, y, width, height, color, depth, strokeWidth, strokeColor) => {
      const b = sumoBox(id,x,y,width,height);
      const plate = add(this.add.rectangle(b.x+b.width/2,b.y+b.height/2,b.width,b.height,color,1).setStrokeStyle(strokeWidth,strokeColor).setDepth(depth));
      const hx=b.hitboxX??b.x, hy=b.hitboxY??b.y, hw=b.hitboxWidth??b.width, hh=b.hitboxHeight??b.height;
      if (hx!==b.x || hy!==b.y || hw!==b.width || hh!==b.height) {
        const zone=add(this.add.zone(hx+hw/2,hy+hh/2,hw,hh).setDepth(depth+0.1).setInteractive({useHandCursor:true}));
        return {plate,hit:zone};
      }
      plate.setInteractive({useHandCursor:true}); return {plate,hit:plate};
    };
    this.sumoBox=sumoBox; this.sumoPlate=sumoPlate;
    // Keep the top of the dohyo unobstructed; retain the exit control below the top HUD.
    const quitCfg = sumoBox('quit',590,590,92,76);
    this.quitButton = add(this.add.image(quitCfg.x+quitCfg.width/2,quitCfg.y+quitCfg.height/2,'sumo-close').setDisplaySize(quitCfg.width,quitCfg.height).setDepth(10));
    const quitHit = add(MeguMenuLayouts.zone(this,'sumo','quit',{x:544,y:552,width:92,height:76}).setDepth(11).setInteractive({useHandCursor:true}));
    quitHit.on('pointerdown', () => this.quit());
    this.mainScene = this.scene.get('default');
    const localizedCharacterName = (id, fallback) => {
      const digits = String(id || '').match(/\d+/);
      const names = this.mainScene && this.mainScene.characterNamesById;
      const localized = digits && names && (names.get(String(Number(digits[0]))) || names.get(String(digits[0])));
      return String(localized || (fallback && fallback.name) || id || 'MEGU');
    };
    const playerPetName = String(GAME_ATTRIBUTES.petName || '').trim() || localizedCharacterName(this.playerMeguId, this.playerMeguDef);
    this.playerWinnerName = playerPetName;
    const sumoNames = this.cache.json.get('sumo-default-names') || {};
    const pickNamePart = value => {
      const list = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : []);
      const usable = list.map(v => String(v ?? '').trim()).filter(Boolean);
      return usable.length ? usable[Phaser.Math.Between(0, usable.length - 1)] : '';
    };
    const generatedOpponentName = [pickNamePart(sumoNames.application?.default_sumo_name), pickNamePart(sumoNames.application?.default_sumo_surname)].filter(Boolean).join('');
    this.generateSumoOpponentName = () => [pickNamePart(sumoNames.application?.default_sumo_name), pickNamePart(sumoNames.application?.default_sumo_surname)].filter(Boolean).join('');
    this.generatedOpponentName = generatedOpponentName || localizedCharacterName(this.opponentMeguId, this.opponentMeguDef);
    this.opponentWinnerName = this.generatedOpponentName;
    this.sumoCareer = GAME_ATTRIBUTES.sumoCareer || (GAME_ATTRIBUTES.sumoCareer = {rankIndex:0,rankPoints:0,archetype:'',promotion:null,wins:0,losses:0});
    this.sumoCareer.rankIndex = Phaser.Math.Clamp(Math.trunc(Number(this.sumoCareer.rankIndex)||0),0,SUMO_RANKS.length-1);
    this.playerRankIndex = this.sumoCareer.rankIndex;
    // The home-screen launch payload rewrites `id` to the rendered texture key
    // (for example IDX198 for a shiny pet). Sumo stats are keyed by the logical
    // catalog ID (ID198) plus the separate shiny flag, matching the Home debug
    // tools and training record. Use logicalId here to avoid reading a second,
    // empty stat record for shiny characters.
    this.playerStatCharacterId = String(this.playerMeguDef?.logicalId || this.playerMeguDef?.id || this.playerMeguId);
    this.playerStatRecord = getSumoCharacterStatRecord(this.playerStatCharacterId, GAME_ATTRIBUTES.shiny === true);
    this.playerStats = { ...this.playerStatRecord.stats };
    save();
    this.playerMaxHP = this.playerStats.endurance * 2;
    this.playerLives = this.playerMaxHP;
    this.playerDisplayName = `${sumoRankName(this.playerRankIndex)} ${playerPetName}`;
    this.opponentDisplayName = `Opponent ${this.opponentWinnerName}`;
    // Randomize which side the player occupies; all side labels and HUD elements follow.
    this.playerOnLeft = Phaser.Math.Between(0, 1) === 0;
    const playerHud = this.playerOnLeft ? { x:30, right:false, side:'WEST' } : { x:610, right:true, side:'EAST' };
    const cpuHud = this.playerOnLeft ? { x:610, right:true, side:'EAST' } : { x:30, right:false, side:'WEST' };
    // Vertical shikona: WEST rank/name read from x=36/60; EAST from x=604/580.
    // Each character occupies one line, in top-to-bottom reading order.
    const makeVerticalLabel = (cfg, x, content, fontSize, letterSpacing) => add(this.add.text(x, 174, sumoVerticalText(content), {
      fontFamily: 'Arial, sans-serif', fontSize: `${fontSize}px`,
      color: '#000000', fontStyle: 'bold', align: 'center', lineSpacing: letterSpacing
    }).setOrigin(cfg.right ? 1 : 0, 0).setDepth(5));
    const rankX = cfg => cfg.right ? 604 : 36;
    const nameX = cfg => cfg.right ? 580 : 60;
    this.playerCounter = makeVerticalLabel(playerHud, rankX(playerHud), String(sumoRankName(this.playerRankIndex)).replace(/\s*[-:–—]?\s*(?:east|west)\s*$/i, ''), 10, -3);
    this.playerNameLabel = makeVerticalLabel(playerHud, nameX(playerHud), this.playerWinnerName, 18, -5);
    this.cpuCounter = makeVerticalLabel(cpuHud, rankX(cpuHud), '', 10, -3);
    this.cpuNameLabel = makeVerticalLabel(cpuHud, nameX(cpuHud), this.opponentWinnerName, 18, -5);
    const makeHudText = (cfg, content, y) => add(this.add.text(cfg.x, y, content, {
      ...textStyle(11), color:'#ffffff', fontStyle:'bold', align:cfg.right?'right':'left', lineSpacing:2
    }).setOrigin(cfg.right?1:0,0).setDepth(5));
    const makeHpHud = (cfg, prefix) => {
      const left = cfg.right ? 390 : 30, origin = cfg.right ? 1 : 0;
      this[`${prefix}HPBack`] = add(this.add.rectangle(cfg.right ? 610 : 30, 96, 220, 13, 0x321f32, 1).setOrigin(origin,0.5).setStrokeStyle(1,0xffffff).setDepth(4));
      this[`${prefix}HPFill`] = add(this.add.rectangle(cfg.right ? 608 : 32, 96, 216, 9, 0x55df72, 1).setOrigin(origin,0.5).setDepth(5));
      this[`${prefix}HPText`] = makeHudText(cfg, 'HP 10 / 10', 108);
    };
    makeHpHud(playerHud, 'player'); makeHpHud(cpuHud, 'cpu');
    const canUseDebugTools = typeof meguHasRole === 'function' && meguHasRole('tester');
    this.weightDebug = canUseDebugTools ? add(this.add.text(320, 126, `DEBUG WEIGHT — YOU: ${this.playerWeight} | CPU: ${this.cpuWeight}`, { ...textStyle(12), color:'#ffe7ac', fontStyle:'bold' }).setOrigin(.5,0).setDepth(5)) : null;
    this.status = add(this.add.text(320, 152, 'Choose your move!', { ...textStyle(20), fontStyle:'bold', color:'#fff7d6', stroke:'#37264a', strokeThickness:4 }).setOrigin(.5).setDepth(5));
    this.statsHudText = add(this.add.text(320, 184, '', { ...textStyle(10), color:'#ffe7ac', fontStyle:'bold', align:'center' }).setOrigin(.5,0).setDepth(5));
    this.status.setVisible(false);
    this.statsHudText.setVisible(false);
    this.weightDebug?.setVisible(false);
    this.matchHudObjects = [this.playerCounter, this.playerNameLabel, this.cpuCounter, this.cpuNameLabel, this.playerHPBack, this.playerHPFill, this.playerHPText, this.cpuHPBack, this.cpuHPFill, this.cpuHPText].filter(Boolean);
    this.matchHudObjects.forEach(object => object.setVisible(false));
    const playerTexture = this.playerTextureKey && this.textures.exists(this.playerTextureKey) ? this.textures.get(this.playerTextureKey) : null;
    const opponentTexture = this.opponentTextureKey && this.textures.exists(this.opponentTextureKey) ? this.textures.get(this.opponentTextureKey) : null;
    const playerFrame = names => names.find(n => playerTexture && playerTexture.has(n)) || null;
    const opponentFrame = names => names.find(n => opponentTexture && opponentTexture.has(n)) || null;
    this.staticFrames = [playerFrame([`${this.playerMeguId}_5-2x`,`${this.playerMeguId}_5`]), playerFrame([`${this.playerMeguId}_6-2x`,`${this.playerMeguId}_6`])].filter(Boolean);
    this.walkFrames = [playerFrame([`${this.playerMeguId}_3-2x`,`${this.playerMeguId}_3`]), playerFrame([`${this.playerMeguId}_4-2x`,`${this.playerMeguId}_4`])].filter(Boolean);
    this.opponentWalkFrames = [opponentFrame([`${this.opponentMeguId}_3-2x`,`${this.opponentMeguId}_3`]), opponentFrame([`${this.opponentMeguId}_4-2x`,`${this.opponentMeguId}_4`])].filter(Boolean);
    this.blinkFrames = [playerFrame([`${this.playerMeguId}_7-2x`,`${this.playerMeguId}_7`]), playerFrame([`${this.playerMeguId}_8-2x`,`${this.playerMeguId}_8`])].filter(Boolean);
    this.opponentStaticFrames = [opponentFrame([`${this.opponentMeguId}_5-2x`,`${this.opponentMeguId}_5`]), opponentFrame([`${this.opponentMeguId}_6-2x`,`${this.opponentMeguId}_6`])].filter(Boolean);
    this.opponentBlinkFrames = [opponentFrame([`${this.opponentMeguId}_7-2x`,`${this.opponentMeguId}_7`]), opponentFrame([`${this.opponentMeguId}_8-2x`,`${this.opponentMeguId}_8`])].filter(Boolean);
    this.contactFrame = playerFrame([`${this.playerMeguId}_13-2x`,`${this.playerMeguId}_13`]);
    this.grabFrame = playerFrame([`${this.playerMeguId}_9-2x`,`${this.playerMeguId}_9`]);
    this.slapFrame = playerFrame([`${this.playerMeguId}_10-2x`,`${this.playerMeguId}_10`]);
    this.opponentContactFrame = opponentFrame([`${this.opponentMeguId}_13-2x`,`${this.opponentMeguId}_13`]);
    this.opponentGrabFrame = opponentFrame([`${this.opponentMeguId}_9-2x`,`${this.opponentMeguId}_9`]);
    this.opponentSlapFrame = opponentFrame([`${this.opponentMeguId}_10-2x`,`${this.opponentMeguId}_10`]);
    this.winFrame = playerFrame([`${this.playerMeguId}_11-2x`,`${this.playerMeguId}_11`]);
    this.loseFrame = playerFrame([`${this.playerMeguId}_12-2x`,`${this.playerMeguId}_12`]);
    this.opponentWinFrame = opponentFrame([`${this.opponentMeguId}_11-2x`,`${this.opponentMeguId}_11`]);
    this.opponentLoseFrame = opponentFrame([`${this.opponentMeguId}_12-2x`,`${this.opponentMeguId}_12`]);
    const idle = this.staticFrames[0] || this.blinkFrames[0];
    const opponentIdle = this.opponentStaticFrames[0] || this.opponentBlinkFrames[0];
    if (idle && opponentIdle) {
      // Place each character on its randomized side and face toward the ring center.
      this.playerRenderer = new MeguRenderer(this, {
        atlasKey: this.playerTextureKey, framePrefix: this.playerMeguId,
        x: 0, y: 429, depth: 3, originX: .5, originY: 1,
        flipX: this.playerOnLeft, state: MeguRenderer.STATES.STANDING_1,
        shadow: { widthRatio: 0.62, height: 13, yOffset: 3, color: 0x101010, alpha: 0.27 }
      });
      this.cpuRenderer = new MeguRenderer(this, {
        atlasKey: this.opponentTextureKey, framePrefix: this.opponentMeguId,
        x: 0, y: 429, depth: 3, originX: .5, originY: 1,
        flipX: !this.playerOnLeft, state: MeguRenderer.STATES.STANDING_1,
        shadow: { widthRatio: 0.62, height: 13, yOffset: 3, color: 0x101010, alpha: 0.27 }
      });
      this.playerSprite = this.playerRenderer.sprite;
      this.cpuSprite = this.cpuRenderer.sprite;
      this.playerRenderer.setScale(0.84);
      this.cpuRenderer.setScale(0.84);
      this.playerStartX = this.getSafeSumoX(this.playerSprite, this.playerOnLeft ? 290 - this.playerSprite.displayWidth / 2 : 350 + this.playerSprite.displayWidth / 2);
      this.cpuStartX = this.getSafeSumoX(this.cpuSprite, this.playerOnLeft ? 350 + this.cpuSprite.displayWidth / 2 : 290 - this.cpuSprite.displayWidth / 2);
      this.playerRenderer.setPosition(this.playerStartX, 429);
      this.cpuRenderer.setPosition(this.cpuStartX, 429);
      // Each MeguRenderer now owns its fighter's ground shadow and keeps it
      // aligned with the sprite as the fighters move and change scale.
      this.playerShadow = this.playerRenderer.shadow;
      this.cpuShadow = this.cpuRenderer.shadow;
      // MeguRenderer owns both fighters' standing eye overlays and blink timing.
      this.events.on('update', this.updateIdleAnimation, this);
    this.events.on('update', this.syncSumoPlayerAccessory, this);
    } else {
      console.warn('SumoMinigame: idle frames missing for player/opponent', this.playerMeguId, this.opponentMeguId);
    }
    // Debug opponent move selector is only rendered for tester/admin accounts.
    this.cpuDebugButtons = {};
    if (canUseDebugTools) {
      add(this.add.text(320, 510, 'DEBUG CPU NEXT MOVE (all OFF = random)', { ...textStyle(10), color:'#ffe7ac', fontStyle:'bold' }).setOrigin(.5).setDepth(6));
      [{key:'rock',label:'GRAB',x:225},{key:'paper',label:'SLAP',x:320},{key:'scissors',label:'PULL',x:415}].forEach(m => {
        const control = sumoPlate('debug_'+m.key,m.x,535,74,26,0x49334f,6,2,0xffe7ac); const plate=control.plate;
        const label = add(this.add.text(plate.x, plate.y, `${m.label}: OFF`, { ...textStyle(10), color:'#ffffff', fontStyle:'bold' }).setOrigin(.5).setDepth(7));
        this.cpuDebugButtons[m.key] = { plate, hit:control.hit, label };
        control.hit.on('pointerdown', () => {
          if (this.roundBusy || this.finished) return;
          this.debugCpuMove = this.debugCpuMove === m.key ? null : m.key;
          Object.entries(this.cpuDebugButtons).forEach(([key, btn]) => {
            const active = this.debugCpuMove === key;
            btn.label.setText(`${btn.label.text.split(':')[0]}: ${active ? 'ON' : 'OFF'}`);
            btn.plate.setFillStyle(active ? 0x8a4f42 : 0x49334f);
          });
        });
      });
    }
    this.moveButtons = [];
    const moves = [{key:'rock',icon:'✊',label:'GRAB',x:180},{key:'paper',icon:'✋',label:'SLAP',x:320},{key:'scissors',icon:'✌️',label:'PULL',x:460}];
    moves.forEach(m => {
      const control=sumoPlate('move_'+m.key,m.x,590,104,52,0xffe7ac,6,3,0x613b4a); const plate=control.plate;
      add(this.add.text(plate.x, plate.y-10, m.icon, {fontFamily:'sans-serif',fontSize:'23px',color:'#2c2137'}).setOrigin(.5).setDepth(7));
      add(this.add.text(plate.x, plate.y+16, m.label, { ...textStyle(10), fontStyle:'bold', color:'#3a263e' }).setOrigin(.5).setDepth(7));
      control.hit.on('pointerdown', () => this.playRound(m.key)); this.moveButtons.push(control.hit);
    });
    this.moveButtons.forEach(button=>button.disableInteractive());
    this.showOpponentSelection(add);
    this.refreshLives();
    // Sumo is the only BGM while this scene is active; inherit the main volume slider.
    this.mainScene = this.scene.get('default');
    this.returnMusicVolume = this.mainScene ? this.mainScene.musicVolume : 0.35;
    if (this.mainScene?.bgmSound?.isPlaying) this.mainScene.bgmSound.stop();
    this.sound.getAllPlaying().forEach(sound => {
      if (sound !== this.sumoMusic && sound.key && /bgm|music/i.test(sound.key) && sound.isPlaying) sound.stop();
    });
    try { this.sumoMusic = this.sound.add('sumo-bgm', {loop:true, volume:this.returnMusicVolume}); this.sumoMusic.play(); } catch(e) {}
    this.events.once('shutdown', this.cleanup, this);
  }
  showOpponentSelection(add) {
    const selectionStartIndex = this.objects.length;
    const promotion = this.sumoCareer.promotion;
    const daiChallengeUsedToday = String(this.sumoCareer.daiYokozunaChallengeDay || '') === localCalendarDay();
    const options = promotion
      ? [{key:'promotion',label:'Promotion bout',description:`Bout ${(Number(promotion.wins)||0)+1} of ${promotion.required}`,rankIndex:promotion.targetRankIndex}]
      : [...sumoOpponentRankOptions(this.playerRankIndex), {key:'dai_yokozuna',label:'Dai Yokozuna challenge',description:daiChallengeUsedToday?'Daily challenge used · Available tomorrow':'Once per day · All stats: 120 · 100,000 Gold + 5% Golden Ticket',rankIndex:SUMO_RANKS.length-1,disabled:daiChallengeUsedToday}];
    // The artwork contains the card frames, labels and OK artwork.
    // Display at native size, top-left anchored, without stretching.
    const panelKey = promotion ? 'sumo-select-rankup-panel' : 'sumo-select-panel';
    const panelTexture = this.textures.get(panelKey).getSourceImage();
    const panelLeft = (640 - panelTexture.width) / 2;
    const panelTop = (640 - panelTexture.height) / 2;
    const sx = x => panelLeft + x;
    const sy = y => panelTop + y;
    const panel = add(this.add.image(panelLeft, panelTop, panelKey).setOrigin(0).setDepth(20));
    add(this.add.text(sx(320), sy(45), `Rank: ${sumoRankName(this.playerRankIndex)}`, {
      ...textStyle(19), fontStyle:'bold', color:'#000000', align:'center'
    }).setOrigin(.5).setDepth(23));
    // Match the four slots in the supplied 640x340 reference.
    const slots = [80, 240, 400, 560];
    const ordered = promotion ? [options[0]] : [options[3], options[0], options[1], options[2]];
    const cards = [];
    const contenderNames = this.sumoSelectionCandidates.map((candidate, i) => {
      if (i === 0) return this.generatedOpponentName; // Dai-Yokozuna keeps its established name.
      const generated = this.generateSumoOpponentName?.();
      return generated || String(candidate?.name || candidate?.id || `MEGU ${i + 1}`);
    });
    let chosenIndex = -1;
    const selectCard = index => {
      if (chosenIndex === index || this.opponentSelected) return;
      chosenIndex = index;
      cards.forEach(card => card.highlight.setVisible(card.index === index));
    };
    ordered.forEach((option, i) => {
      if (!option) return;
      const candidateIndex = promotion ? 2 : i;
      const x = sx(promotion ? 320 : slots[i]);
      const candidate = this.sumoSelectionCandidates[candidateIndex];
      const textureKey = `sumo-select-opponent-${candidate.id}`;
      const prefix = String(candidate?.id || this.opponentMeguId);
      const texture = this.textures.get(textureKey);
      const frame = [`${prefix}_3-2x`, `${prefix}_3`].find(name => texture?.has(name));
      if (frame) add(this.add.image(x, sy(231), textureKey, frame).setOrigin(.5, 1).setDisplaySize(150,150).setDepth(22));
      const name = contenderNames[candidateIndex];
      const rank = option.key === 'dai_yokozuna' ? 'Dai Yokozuna' : sumoRankName(option.rankIndex);
      add(this.add.text(x, sy(235), `${name}\n${rank}`, {
        ...textStyle(12), fontStyle:'bold', color:'#000000', align:'center',
        wordWrap:{width:148}, lineSpacing:1
      }).setOrigin(.5,0).setDepth(23));
      const highlight = add(this.add.rectangle(x, sy(155), 150, 150, 0xffffff, 0)
        .setStrokeStyle(4, 0xffff66, 1).setDepth(23).setVisible(false));
      const hit = add(this.add.zone(x, sy(155), 150, 150).setDepth(24).setInteractive({useHandCursor:true}));
      if (!option.disabled) hit.on('pointerdown', () => selectCard(i));
      else add(this.add.text(x, sy(151), 'USED TODAY', {...textStyle(12),fontStyle:'bold',color:'#ffffff',stroke:'#000000',strokeThickness:3}).setOrigin(.5).setDepth(24));
      cards.push({index:i,highlight});
    });
    const ok = add(this.add.zone(sx(325), sy(315), 45, 34).setDepth(25).setInteractive({useHandCursor:true}));
    ok.on('pointerdown', () => {
      if (chosenIndex < 0 || this.opponentSelected || this.finished) return;
      const option = ordered[chosenIndex];
      if (!option || option.disabled) return;
      const candidateIndex = promotion ? 2 : chosenIndex;
      const candidate = this.sumoSelectionCandidates[candidateIndex];
      this.selectedSumoOpponentName = contenderNames[candidateIndex];
      if (candidate && this.cpuRenderer) {
        const key = `sumo-select-opponent-${candidate.id}`;
        if (this.cpuRenderer.setAtlas(key, String(candidate.id))) {
          this.opponentTextureKey = key;
          this.opponentMeguId = String(candidate.id);
          this.opponentMeguDef = candidate;
          const tex = this.textures.get(key);
          const frame = suffix => [`${candidate.id}_${suffix}-2x`, `${candidate.id}_${suffix}`].find(f => tex.has(f));
          this.opponentWalkFrames = [frame(3),frame(4)].filter(Boolean);
          this.opponentStaticFrames = [frame(5),frame(6)].filter(Boolean);
          this.opponentBlinkFrames = [frame(7),frame(8)].filter(Boolean);
          this.opponentContactFrame = frame(13);
          this.opponentGrabFrame = frame(9);
          this.opponentSlapFrame = frame(10);
          this.opponentWinFrame = frame(11);
          this.opponentLoseFrame = frame(12);
        }
      }
        if (option.key==='dai_yokozuna') {
          const today = localCalendarDay();
          if (String(this.sumoCareer.daiYokozunaChallengeDay || '') === today) return;
          this.sumoCareer.daiYokozunaChallengeDay = today;
          save();
        }
        this.opponentSelected=true;
        this.opponentCategory=option.key;
        this.isDaiYokozunaChallenge = option.key==='dai_yokozuna';
        this.matchHudObjects?.forEach(object=>object.setVisible(true));
        const guest = this.guestOpponent;
        const guestRank = guest ? Number(guest.sumoRankIndex) : -999;
        const guestTotal = guest ? ['power','agility','technique','endurance'].reduce((sum,key) => sum + (Number(guest.sumoStats?.[key]) || 5), 0) : 0;
        const targetStats = sumoStatsForRank(option.rankIndex, 'technician');
        const targetTotal = ['power','agility','technique','endurance'].reduce((sum,key) => sum + (Number(targetStats[key]) || 5), 0);
        this.isGuestOpponent = !!guest && !this.isDaiYokozunaChallenge
          && Math.abs(guestRank - option.rankIndex) <= 3
          && Math.abs(guestTotal - targetTotal) <= 28
          && Phaser.Math.Between(1, 100) <= 55;
        this.opponentRankIndex = this.isGuestOpponent ? guestRank : option.rankIndex;
        this.opponentArchetype=this.isDaiYokozunaChallenge ? 'dai_yokozuna' : Phaser.Utils.Array.GetRandom(Object.keys(SUMO_ARCHETYPES));
        this.opponentStats=this.isDaiYokozunaChallenge
          ? {power:120,agility:120,technique:120,endurance:120}
          : this.isGuestOpponent ? { ...guest.sumoStats } : sumoStatsForRank(this.opponentRankIndex,this.opponentArchetype);
        this.opponentWinnerName = this.isGuestOpponent ? `${guest.petName} (${guest.username})` : (this.selectedSumoOpponentName || this.generatedOpponentName);
        if (this.isGuestOpponent) this.cpuWeight = Number(guest.weight) || this.cpuWeight;
        this.cpuMaxHP=this.opponentStats.endurance * 2;
        this.cpuLives=this.cpuMaxHP;
        this.opponentDisplayName=`${this.isDaiYokozunaChallenge?'Dai Yokozuna':sumoRankName(this.opponentRankIndex)} ${this.opponentWinnerName}`;
        this.cpuNameLabel?.setText(sumoVerticalText(this.opponentWinnerName));
        this.cpuCounter?.setText(sumoVerticalRank(this.isDaiYokozunaChallenge ? 'Dai Yokozuna' : sumoRankName(this.opponentRankIndex)));
        this.weightDebug?.setText(`DEBUG WEIGHT — YOU: ${this.playerWeight} | CPU: ${this.cpuWeight}`);
        this.playerDisplayName=`${sumoRankName(this.playerRankIndex)} ${this.playerWinnerName}`;
        this.playerCounter?.setText(sumoVerticalRank(sumoRankName(this.playerRankIndex)));
        this.cpuCounter?.setText(sumoVerticalRank(this.isDaiYokozunaChallenge ? 'Dai Yokozuna' : sumoRankName(this.opponentRankIndex)));
        this.selectionOverlayObjects?.forEach(o=>o.destroy());
        this.selectionOverlayObjects=[];
        this.status.setText(this.isDaiYokozunaChallenge ? `${this.opponentDisplayName} — ALL STATS 120` : this.isGuestOpponent ? `${this.opponentDisplayName} — GUEST PLAYER` : `${this.opponentDisplayName} — ${SUMO_ARCHETYPES[this.opponentArchetype].label}`);
        const statLine = stats => `PWR ${Math.round(stats.power)}  AGI ${Math.round(stats.agility)}  TEC ${Math.round(stats.technique)}  END ${Math.round(stats.endurance)}`;
        this.statsHudText?.setText(`YOU  ${statLine(this.playerStats)}     CPU  ${statLine(this.opponentStats)}`);
        this.moveButtons.forEach(b=>b.setInteractive({useHandCursor:true}));
        this.refreshLives();
    });
    this.selectionOverlayObjects = this.objects.slice(selectionStartIndex);
  }
  async requestEndure() {
    if (this.endureUsed || Number(GAME_ATTRIBUTES.elixir||0)<1) return false;
    return await new Promise(resolve=>{
      const objects=[];
      const add=o=>{objects.push(o);return o;};
      add(this.add.rectangle(320,315,470,170,0x21152c,.97).setStrokeStyle(3,0xffe7ac).setDepth(40));
      add(this.add.text(320,270,'ENDURE ACTIVATION',{...textStyle(20),fontStyle:'bold',color:'#fff2d6'}).setOrigin(.5).setDepth(41));
      add(this.add.text(320,305,'Use 1 Elixir to survive this hit at 1 HP?',{...textStyle(14),color:'#ffffff',align:'center'}).setOrigin(.5).setDepth(41));
      const finish=accepted=>{
        objects.forEach(o=>o.destroy());
        if(accepted){
          GAME_ATTRIBUTES.elixir=Math.max(0,Math.trunc(Number(GAME_ATTRIBUTES.elixir)||0)-1);
          this.mainScene?.updateMedicineHud?.();
          save(); this.endureUsed=true;
          if(this.mainScene?.medicineHudText?.active){
            const count=k=>Math.max(0,Math.trunc(Number(GAME_ATTRIBUTES[k])||0));
            this.mainScene.medicineHudText.setText(`ELX ${count('elixir')}   VOL ${count('voltamin')}   V-L ${count('voltaminLite')}   B-V ${count('betaVoltamin')}   S-V ${count('superVoltamin')}   DEVO ${count('devoMedicine')}   S-DV ${count('superDevoMedicine')}   RZ ${count('rainbowZ')}   RFT ${count('regularFlightTicket')}   GFT ${count('goldenFlightTicket')}`);
          }
        }
        resolve(accepted);
      };
      const yesControl=this.sumoPlate('elixir_yes',245,365,120,38,0x5a9b65,41,2,0xffffff); const yes=yesControl.plate; objects.push(yes); if(yesControl.hit!==yes) objects.push(yesControl.hit);
      add(this.add.text(yes.x,yes.y,'USE ELIXIR',{...textStyle(12),fontStyle:'bold',color:'#ffffff'}).setOrigin(.5).setDepth(42));
      const noControl=this.sumoPlate('elixir_no',395,365,120,38,0x8a4f42,41,2,0xffffff); const no=noControl.plate; objects.push(no); if(noControl.hit!==no) objects.push(noControl.hit);
      add(this.add.text(no.x,no.y,'NO THANKS',{...textStyle(12),fontStyle:'bold',color:'#ffffff'}).setOrigin(.5).setDepth(42));
      yesControl.hit.on('pointerdown',()=>finish(true)); noControl.hit.on('pointerdown',()=>finish(false));
    });
  }
  awardSumoPromotionStats(points) {
    const amount = Math.max(0, Math.trunc(Number(points) || 0));
    if (!amount) return;
    const record = this.playerStatRecord || getSumoCharacterStatRecord(this.playerStatCharacterId, GAME_ATTRIBUTES.shiny === true);
    for (const stat of ['power','endurance']) record.stats[stat] = Phaser.Math.Clamp(Math.trunc(Number(record.stats[stat]) || 5) + amount, 5, getCharacterStatCap(stat, this.playerStatCharacterId, GAME_ATTRIBUTES.shiny === true));
    this.playerStats = { ...record.stats };
    save();
  }
  recordSumoVictory() {
    const career=this.sumoCareer;
    const previousRankTitle = SUMO_RANKS[career.rankIndex]?.title;
    const previousRankIndex = career.rankIndex;
    let sumoClassUps = 0;
    let promotionCompleted = false;
    if (this.isDaiYokozunaChallenge) {
      const currentRank = SUMO_RANKS[career.rankIndex];
      const currentDivision = currentRank?.division;
      let divisionTop = career.rankIndex;
      while (divisionTop + 1 < SUMO_RANKS.length && SUMO_RANKS[divisionTop + 1].division === currentDivision) divisionTop++;
      career.rankPoints = 0;
      career.ozekiDefeats = 0;

      const sekiwakeEast = SUMO_RANKS.findIndex(rank => rank.title === 'Sekiwake' && rank.side === 'East');
      const ozekiWest = SUMO_RANKS.findIndex(rank => rank.title === 'Ozeki' && rank.side === 'West');
      const yokozunaWest = SUMO_RANKS.findIndex(rank => rank.title === 'Yokozuna' && rank.side === 'West');

      if (currentRank?.division === 'Makuuchi' && currentRank.title !== 'Sekiwake') {
        // A Dai Yokozuna victory can lift a Makuuchi wrestler to Sekiwake,
        // but cannot skip the Sekiwake-to-Ozeki promotion tournament.
        career.rankIndex = sekiwakeEast >= 0 ? sekiwakeEast : divisionTop;
        career.promotion = null;
        this.awardSumoPromotionStats(5);
        this.rankProgressMessage = `DAI YOKOZUNA DEFEATED! ${sumoRankName(career.rankIndex)} · SEKIWAKE CLASS REACHED · +5 POWER & ENDURANCE`;
      } else if (currentRank?.title === 'Sekiwake') {
        // Sekiwake must complete the established three-bout Ozeki test.
        career.rankIndex = sekiwakeEast >= 0 ? sekiwakeEast : divisionTop;
        career.promotion = ozekiWest >= 0 ? { targetRankIndex:ozekiWest, required:3, wins:0, defeatedIds:[] } : null;
        this.rankProgressMessage = career.promotion
          ? `DAI YOKOZUNA DEFEATED! ${sumoRankName(career.rankIndex)} · OZEKI PROMOTION TEST READY (0/3)`
          : `DAI YOKOZUNA DEFEATED! ${sumoRankName(career.rankIndex)}`;
      } else if (currentRank?.title === 'Ozeki') {
        // Only an existing Ozeki may enter the five-bout Yokozuna test.
        career.rankIndex = divisionTop;
        career.promotion = yokozunaWest >= 0 ? { targetRankIndex:yokozunaWest, required:5, wins:0, defeatedIds:[] } : null;
        this.rankProgressMessage = career.promotion
          ? `DAI YOKOZUNA DEFEATED! ${sumoRankName(career.rankIndex)} · YOKOZUNA PROMOTION TEST READY (0/5)`
          : `DAI YOKOZUNA DEFEATED! ${sumoRankName(career.rankIndex)}`;
      } else if (currentRank?.title === 'Yokozuna') {
        career.rankIndex = divisionTop;
        career.promotion = null;
        this.rankProgressMessage = `DAI YOKOZUNA DEFEATED! TOP RANK ACHIEVED`;
      } else {
        // Preserve the existing division-top reward for ranks below Makuuchi.
        career.rankIndex = divisionTop;
        if (divisionTop + 1 < SUMO_RANKS.length) {
          career.promotion = { targetRankIndex:divisionTop + 1, required:1, wins:0, defeatedIds:[] };
          this.rankProgressMessage = `DAI YOKOZUNA DEFEATED! ${sumoRankName(divisionTop)} · PROMOTION TEST READY`;
        } else {
          career.promotion = null;
          this.rankProgressMessage = `DAI YOKOZUNA DEFEATED! TOP RANK ACHIEVED`;
        }
      }
      if (SUMO_RANKS[career.rankIndex]?.title !== previousRankTitle && career.rankIndex > 0) sumoClassUps = 1;
      if (career.promotion) { this.awardSumoPromotionStats(5); this.rankProgressMessage += ' · +5 POWER & ENDURANCE'; }
    } else if(career.promotion){
      career.promotion.defeatedIds=Array.isArray(career.promotion.defeatedIds)?career.promotion.defeatedIds:[];
      if(this.opponentMeguId && !career.promotion.defeatedIds.includes(String(this.opponentMeguId))) career.promotion.defeatedIds.push(String(this.opponentMeguId));
      career.promotion.wins=(Number(career.promotion.wins)||0)+1;
      if(career.promotion.wins>=career.promotion.required){
        career.rankIndex=career.promotion.targetRankIndex;
        career.rankPoints=0;
        career.promotion=null;
        const promotedTitle = SUMO_RANKS[career.rankIndex]?.title;
        const promotionBonus = promotedTitle === 'Yokozuna' ? 10 : promotedTitle === 'Ozeki' ? 5 : 0;
        sumoClassUps = 1;
        if (promotionBonus) this.awardSumoPromotionStats(promotionBonus);
        promotionCompleted = true;
        this.rankProgressMessage=`promoted to ${sumoRankName(career.rankIndex)}`;
      } else this.rankProgressMessage=`PROMOTION BOUT ${career.promotion.wins}/${career.promotion.required} WON!`;
    } else if (SUMO_RANKS[career.rankIndex]?.title === 'Yokozuna') {
      // Yokozuna is the terminal career class: stop counting rank-up points.
      career.rankPoints = 0;
      this.rankProgressMessage = 'YOKOZUNA · TOP RANK';
    } else {
      const difference=this.opponentRankIndex-this.playerRankIndex;
      const gained=Phaser.Math.Clamp(10+difference*5,5,50);
      career.rankPoints+=gained;
      const rankUps=[];
      // One rank position costs 10 points. Carry leftover points and
      // process every eligible rank-up from this victory.
      while(career.rankPoints>=10 && career.rankIndex<SUMO_RANKS.length-1 && !career.promotion){
        career.rankPoints-=10;
        const target=career.rankIndex+1;
        const currentRank=SUMO_RANKS[career.rankIndex];
        const nextRank=SUMO_RANKS[target];
        const divisionPromotion=currentRank.division!==nextRank.division;
        const ozekiPromotion=currentRank.title==='Sekiwake' && nextRank.title==='Ozeki';
        const yokozunaPromotion=currentRank.title==='Ozeki' && nextRank.title==='Yokozuna';
        if(divisionPromotion || ozekiPromotion || yokozunaPromotion){
          const required=yokozunaPromotion?5:ozekiPromotion?3:1;
          career.promotion={targetRankIndex:target,required,wins:0,defeatedIds:[]};
          this.rankProgressMessage=`+${gained} POINTS · PROMOTION CHALLENGE: ${nextRank.name}`;
          break;
        }
        career.rankIndex=target;
        rankUps.push(sumoRankName(target));
      }
      if (SUMO_RANKS[career.rankIndex]?.title === 'Yokozuna') career.rankPoints = 0;
      sumoClassUps = rankUps.length;
      if (rankUps.length > 0) promotionCompleted = true;
      if (career.promotion) this.awardSumoPromotionStats(5);
      if(!career.promotion){
        this.rankProgressMessage=rankUps.length
          ? `promoted to ${sumoRankName(career.rankIndex)}`
          : `+${gained} RANK POINTS (${career.rankPoints}/10)`;
      }
    }
    // Permanent Honor achievements: +500 for each newly attained Sumo rank.
    const highestHonorRank = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.sumoHonorHighestRankIndex) || 0));
    if (career.rankIndex > highestHonorRank) {
      GAME_ATTRIBUTES.honorCompetitionBonus = Math.max(0, Number(GAME_ATTRIBUTES.honorCompetitionBonus) || 0) + (career.rankIndex - highestHonorRank) * 500;
      GAME_ATTRIBUTES.sumoHonorHighestRankIndex = career.rankIndex;
    }
    // Reaching Yokozuna for the first time grants an additional +1,000 Honor.
    if (SUMO_RANKS[career.rankIndex]?.title === 'Yokozuna' && GAME_ATTRIBUTES.sumoHonorTopClassAwarded !== true) {
      GAME_ATTRIBUTES.honorCompetitionBonus = Math.max(0, Number(GAME_ATTRIBUTES.honorCompetitionBonus) || 0) + 1000;
      GAME_ATTRIBUTES.sumoHonorTopClassAwarded = true;
      this.rankProgressMessage += ' · +1,000 HONOR: YOKOZUNA';
    }
    // First-ever Dai-Yokozuna victory grants a separate +1,000 Honor.
    if (this.isDaiYokozunaChallenge && GAME_ATTRIBUTES.sumoHonorDaiYokozunaAwarded !== true) {
      GAME_ATTRIBUTES.honorCompetitionBonus = Math.max(0, Number(GAME_ATTRIBUTES.honorCompetitionBonus) || 0) + 1000;
      GAME_ATTRIBUTES.sumoHonorDaiYokozunaAwarded = true;
      this.rankProgressMessage += ' · +1,000 HONOR: DAI YOKOZUNA';
    }
    this.mainScene?.updateCurrentHonor?.();

    // Every completed Sumo rank/class advancement grants Voltamin. Reaching Ozeki also grants Super Voltamin.
    if (sumoClassUps > 0) {
      awardConsumableItem('voltamin', sumoClassUps, this.mainScene);
      if (previousRankTitle !== 'Ozeki' && SUMO_RANKS[career.rankIndex]?.title === 'Ozeki') {
        awardConsumableItem('superVoltamin', 1, this.mainScene);
        this.rankProgressMessage += ' · +1 SUPER VOLTAMIN';
      }
      this.rankProgressMessage += ` · +${sumoClassUps} VOLTAMIN`;
    }
    // First Yokozuna milestone: award one of every consumable exactly once per account.
    if (SUMO_RANKS[career.rankIndex]?.title === 'Yokozuna' && GAME_ATTRIBUTES.sumoYokozunaConsumablesAwarded !== true) {
      awardOneOfEveryConsumableItem(this.mainScene);
      GAME_ATTRIBUTES.sumoYokozunaConsumablesAwarded = true;
      this.rankProgressMessage += ' · YOKOZUNA MILESTONE: +1 OF EVERY CONSUMABLE';
    }
    // Dai-Yokozuna victories can promote directly without setting promotionCompleted.
    // Compare the final rank against the rank at the start of this victory.
    if (career.rankIndex > previousRankIndex) promotionCompleted = true;
    if (promotionCompleted) {
      this.rankProgressMessage = `promoted to ${sumoRankName(career.rankIndex)}`;
      this._sumoPromotionNotice = `Promoted to ${sumoRankName(career.rankIndex)}!`;
    }
    career.wins=(Number(career.wins)||0)+1;
    save();
  }
  recordSumoDefeat() {
    const career=this.sumoCareer;
    career.losses=(Number(career.losses)||0)+1;
    if(career.promotion){ career.promotion.wins=0; career.promotion.defeatedIds=[]; }

    const current=SUMO_RANKS[career.rankIndex];
    if(current?.title==='Yokozuna'){
      this.rankProgressMessage='YOKOZUNA IMMUNE TO DEMOTION';
    } else if(current?.title==='Ozeki'){
      career.ozekiDefeats=(Number(career.ozekiDefeats)||0)+1;
      if(career.ozekiDefeats>=3){
        const sekiwakeEast=SUMO_RANKS.findIndex(rank=>rank.title==='Sekiwake' && rank.side==='East');
        if(sekiwakeEast>=0){
          career.rankIndex=sekiwakeEast;
          career.rankPoints=0;
          career.ozekiDefeats=0;
          career.promotion=null;
          this.rankProgressMessage=`DEMOTED TO ${sumoRankName(career.rankIndex)} AFTER 3 DEFEATS`;
        }
      } else this.rankProgressMessage=`OZEKI PROTECTION: ${career.ozekiDefeats}/3 DEFEATS`;
    } else {
      const demotionCount=this.opponentCategory==='ambitious'?0:this.opponentCategory==='even'?1:2;
      let nextIndex=career.rankIndex;
      for(let i=0;i<demotionCount;i++){
        if(nextIndex<=0) break;
        const candidate=nextIndex-1;
        // Demotion cannot cross a professional division boundary.
        if(SUMO_RANKS[candidate].division!==SUMO_RANKS[nextIndex].division) break;
        nextIndex=candidate;
      }
      const demoted=career.rankIndex-nextIndex;
      career.rankIndex=nextIndex;
      if(demoted>0){ career.rankPoints=0; this.rankProgressMessage=`DEMOTED ${demoted} RANK${demoted===1?'':'S'} TO ${sumoRankName(nextIndex)}`; }
      else this.rankProgressMessage='NO DEMOTION';
    }
    save();
  }
  updateIdleAnimation(time) {
    if (this.finished || !this.playerSprite?.active) return;
    // Scene code decides whether the fighters are moving; MeguRenderer owns
    // their discrete walking/standing frames and the standing-only eye blink.
    if (this.walkingActive) {
      if (!this.poseHoldSides?.player) this.playerRenderer?.playAnimation('walking');
      if (!this.poseHoldSides?.cpu) this.cpuRenderer?.playAnimation('walking');
    } else if (time >= (this.idleResumeAt || 0)) {
      if (!this.poseHoldSides?.player && !this.playerRenderer?.isMovementLocked()) this.playerRenderer?.playAnimation('standing');
      if (!this.poseHoldSides?.cpu && !this.cpuRenderer?.isMovementLocked()) this.cpuRenderer?.playAnimation('standing');
    }
    if (this.playerSprite?.active && !this.playerRenderer?.isMovementLocked()) this.playerRenderer.setPosition(this.getSafeSumoX(this.playerSprite, this.playerSprite.x), this.playerSprite.y);
    if (this.cpuSprite?.active && !this.cpuRenderer?.isMovementLocked()) this.cpuRenderer.setPosition(this.getSafeSumoX(this.cpuSprite, this.cpuSprite.x), this.cpuSprite.y);
    this.syncSumoPlayerAccessory();
  }
  syncSumoPlayerAccessory() {
    if (!this.mainScene || !this.mainScene.syncAccessoryForSprite || !this.playerSprite?.active) return;
    // The sumo atlas frames use the same pose keys as Home. Reposition the
    // accessory from the current live frame every tick so flips, walk poses,
    // hit reactions, and tweened movement cannot leave it behind.
    // The accessory is placed just above the renderer container, keeping it
    // above both the body and its inseparable eye layer.
    const accessoryDepth = (this.playerRenderer?.layer?.depth ?? 3) + 0.01;
    this.mainScene.syncAccessoryForSprite(this, this.playerSprite, 'playerAccessorySprite', accessoryDepth);
    // Enforce the same layer on every equipped accessory after the helper has
    // created/repositioned the sprites.
    (this.playerAccessorySpriteItems || []).forEach(sprite => {
      if (sprite && sprite.active) sprite.setDepth(accessoryDepth);
    });
  }
  refreshLives() {
    const p = Math.max(0, Math.min(this.playerMaxHP, this.playerLives));
    const c = Math.max(0, Math.min(this.cpuMaxHP, this.cpuLives));
    if (this.playerCounter?.active) this.playerCounter.setText(sumoVerticalRank(sumoRankName(this.playerRankIndex)));
    if (this.cpuCounter?.active) this.cpuCounter.setText(sumoVerticalRank(this.isDaiYokozunaChallenge ? 'Dai Yokozuna' : sumoRankName(this.opponentRankIndex ?? this.playerRankIndex)));
    if (this.playerHPFill?.active) this.playerHPFill.setDisplaySize(216 * p / this.playerMaxHP, 9).setFillStyle(p <= 3 ? 0xe94b55 : 0x55df72);
    if (this.cpuHPFill?.active) this.cpuHPFill.setDisplaySize(216 * c / this.cpuMaxHP, 9).setFillStyle(c <= 3 ? 0xe94b55 : 0x55df72);
    if (this.playerHPText?.active) this.playerHPText.setText(`HP ${p.toFixed(1).replace(/\.0$/, '')} / ${this.playerMaxHP.toFixed(1).replace(/\.0$/, '')}`);
    if (this.cpuHPText?.active) this.cpuHPText.setText(`HP ${c.toFixed(1).replace(/\.0$/, '')} / ${this.cpuMaxHP.toFixed(1).replace(/\.0$/, '')}`);
    if (this.weightDebug?.active) this.weightDebug.setText(`WEIGHT YOU: ${this.playerWeight} | CPU: ${this.cpuWeight}`);
  }
  setWalking(active) {
    this.walkingActive = !!active;
    if (active) {
      this.idleResumeAt = 0;
      if (!this.poseHoldSides?.player) this.playerRenderer?.playAnimation('walking');
      if (!this.poseHoldSides?.cpu) this.cpuRenderer?.playAnimation('walking');
    } else {
      // Preserve the existing 350ms transition before renderer-owned standing
      // animation resumes. Emotional poses remain locked until that transition.
      this.idleResumeAt = this.time.now + 350;
    }
  }
  // Keep the complete rendered sprite inside the 640px sumo arena. Frame
  // widths vary between MEGU, so calculate the limit from each live sprite.
  getSafeSumoX(sprite, requestedX) {
    const halfWidth = Math.max(0, Number(sprite && sprite.displayWidth) || 0) / 2;
    const margin = 8;
    const minX = halfWidth + margin;
    const maxX = W - halfWidth - margin;
    if (maxX < minX) return W / 2;
    return Phaser.Math.Clamp(Number(requestedX) || W / 2, minX, maxX);
  }
  tweenPositions(playerX, cpuX, duration, ease='Sine.InOut') {
    return new Promise(resolve => {
      let pending = 2;
      const done = () => { if (--pending === 0) resolve(); };
      this.playerRenderer.tweenTo({ x:this.getSafeSumoX(this.playerSprite, playerX) }, { duration, ease, onComplete:done });
      this.cpuRenderer.tweenTo({ x:this.getSafeSumoX(this.cpuSprite, cpuX) }, { duration, ease, onComplete:done });
    });
  }
  playSumoSfx(key) {
    try {
      if (this.cache.audio.exists(key)) this.sound.play(key, { volume: 0.85 });
    } catch (e) { /* Sound playback should never interrupt the match animation. */ }
  }
  async animateMixedInteraction(playerMove, cpuMove) {
    const startP = this.playerStartX, startC = this.cpuStartX;
    const playerIsPull = playerMove === 'scissors', cpuIsPull = cpuMove === 'scissors';
    const playerIsGrab = playerMove === 'rock', cpuIsGrab = cpuMove === 'rock';
    const playerIsSlap = playerMove === 'paper', cpuIsSlap = cpuMove === 'paper';
    // Keep the fighters 20 pixels apart at contact.
    // Keep player/CPU coordinates and every animation vector relative to the
    // player's assigned side. Positive X points toward EAST; reverse the
    // contact ordering when the player starts on EAST.
    const playerTowardCenter = this.playerOnLeft ? 1 : -1;
    const contactP = this.playerOnLeft ? 310 : 330;
    const contactC = this.playerOnLeft ? 330 : 310;
    const isPullSlap = (playerIsPull && cpuIsSlap) || (cpuIsPull && playerIsSlap);
    const isPullGrab = (playerIsPull && cpuIsGrab) || (cpuIsPull && playerIsGrab);
    const isGrabSlap = (playerIsGrab && cpuIsSlap) || (cpuIsGrab && playerIsSlap);
    if (isPullGrab) this.playSumoSfx('sumo-sfx-sweep');
    else if (isGrabSlap) this.playSumoSfx('sumo-sfx-stamp');
    else if (isPullSlap) { /* Played on each slap collision below. */ }
    this.setWalking(true);
    // Keep the walking animation active during the approach; emotional poses
    // are applied only after movement stops so their position lock is respected.
    if (isPullSlap) {
      // Slap advances to contact; Pull holds its starting position during the approach.
      const slapSprite = playerIsSlap ? this.playerSprite : this.cpuSprite;
      const slapRenderer = playerIsSlap ? this.playerRenderer : this.cpuRenderer;
      const slapTargetX = this.getSafeSumoX(slapSprite, playerIsSlap ? contactP : contactC);
      await new Promise(resolve => {
        slapRenderer.tweenTo({ x:slapTargetX }, { duration:420, ease:'Sine.InOut', onComplete:resolve });
      });
    } else {
      await this.tweenPositions(contactP, contactC, 420, 'Sine.InOut');
    }
    // Other matchups
    // use the contact frame for both fighters.
    // isPullGrab was determined before the approach so its sound starts with the interaction.
    if (!isGrabSlap && !isPullSlap && !isPullGrab) {
      if (this.contactFrame) this.playerRenderer?.setState(MeguRenderer.STATES.SAD);
      if (this.opponentContactFrame) this.cpuRenderer?.setState(MeguRenderer.STATES.SAD);
    } else if (isGrabSlap) {
      if (playerIsSlap && this.contactFrame) this.playerRenderer?.setState(MeguRenderer.STATES.SAD);
      if (cpuIsSlap && this.opponentContactFrame) this.cpuRenderer?.setState(MeguRenderer.STATES.SAD);
    }

    if (isPullGrab || isGrabSlap || isPullSlap) {
      // Match-up order: SLAP beats PULL, GRAB beats SLAP, and PULL beats GRAB.
      const playerLoses = isPullGrab ? playerIsGrab : isGrabSlap ? playerIsSlap : playerIsPull;
      const cpuLoses = isPullGrab ? cpuIsGrab : isGrabSlap ? cpuIsSlap : cpuIsPull;
      this.pullLoserSide = playerLoses ? 'player' : 'cpu';
      this.slapWinnerSide = null;

      if (isPullSlap) {
        // Slap wins against Pull: repeat three quick slap-like collisions.
        this.pullLoserSide = null;
        // Slap walks throughout; Pull is held on its defeat pose after the first hit.
        const slapSprite = playerIsSlap ? this.playerSprite : this.cpuSprite;
        const pullSprite = playerIsPull ? this.playerSprite : this.cpuSprite;
        const slapRenderer = playerIsSlap ? this.playerRenderer : this.cpuRenderer;
        const pullRenderer = playerIsPull ? this.playerRenderer : this.cpuRenderer;
        const slapIsPlayer = playerIsSlap;
        const pullBaseX = pullSprite.x;
        // Push the Pull loser away from the actual Slap attacker. The old
        // expression assumed the player always stood on the west/left side.
        const slapAttackerIsLeft = slapIsPlayer ? this.playerOnLeft : !this.playerOnLeft;
        const pullAway = slapAttackerIsLeft ? 1 : -1;
        const slapHomeX = slapSprite.x;
        const pullTexture = this.textures.get(playerIsPull ? this.playerTextureKey : this.opponentTextureKey);
        const pullId = playerIsPull ? this.playerMeguId : this.opponentMeguId;
        const pullLoseFrame = [`${pullId}_13-2x`, `${pullId}_13`].find(name => pullTexture?.has(name)) || (playerIsPull ? this.contactFrame : this.opponentContactFrame);
        this.pullLoserSide = playerIsPull ? 'player' : 'cpu';
        this.setWalking(true);
        for (let i = 0; i < 3; i++) {
          this.playSumoSfx('sumo-sfx-beat');
          const pullPushX = this.getSafeSumoX(pullSprite, pullBaseX + pullAway * (24 + i * 28));
          await new Promise(resolve => {
            let pending = 2;
            const done = () => { if (--pending === 0) resolve(); };
            slapRenderer.tweenTo({ x:this.getSafeSumoX(slapSprite, slapHomeX + (slapIsPlayer ? playerTowardCenter : -playerTowardCenter) * 7) }, { duration:70, ease:'Cubic.Out', onComplete:done });
            pullRenderer.tweenTo({ x:pullPushX }, { duration:105 + i * 12, ease:'Sine.Out', onComplete:done });
          });
          await new Promise(resolve => {
            slapRenderer.tweenTo({ scaleX:1.0248, scaleY:.7392 }, { duration:45, yoyo:true, onComplete:resolve });
          }, 160);
          if (i < 2) await new Promise(resolve => slapRenderer.tweenTo({ x:this.getSafeSumoX(slapSprite, slapHomeX) }, { duration:30, ease:'Cubic.Out', onComplete:resolve }));
        }
        // Only after all three hits may Pull return to the walk cycle for the trip home.
        this.pullLoserSide = null;
        this.setWalking(true);
        await this.tweenPositions(startP, startC, 220, 'Cubic.Out');
        (playerIsSlap ? this.playerRenderer : this.cpuRenderer)?.setState(MeguRenderer.STATES.VERY_HAPPY);
        (playerIsPull ? this.playerRenderer : this.cpuRenderer)?.setState(MeguRenderer.STATES.SAD);
      } else if (isPullGrab) {
        // Capture Pull's exact starting coordinate before any animation/state changes.
        const pullSprite = playerIsPull ? this.playerSprite : this.cpuSprite;
        const pullInitialX = pullSprite.x;
        const pullInitialY = pullSprite.y;
        const grabSprite = playerIsGrab ? this.playerSprite : this.cpuSprite;
        const grabIsPlayer = playerIsGrab;
        const toward = grabIsPlayer ? 1 : -1;
        const grabRenderer = grabIsPlayer ? this.playerRenderer : this.cpuRenderer;
        const pullRenderer = playerIsPull ? this.playerRenderer : this.cpuRenderer;
        grabRenderer?.setDepth(4, grabRenderer.shadow?.depth);
        pullRenderer?.setDepth(3, pullRenderer.shadow?.depth);
        this.poseHoldSides = { player: false, cpu: false };
        // Renderer-managed eye layers follow each fighter and remain hidden
        // automatically while an emotional pose is active.
        this.setWalking(true);
        // Use only the pre-animation snapshot as Grab's fixed target. Pull is not moved.
        const grabTargetX = pullInitialX;
        // Exactly one fast Grab tween: original Grab position -> original Pull position.
        // Do not tween, offset, or otherwise update Pull during this phase.
        await new Promise(resolve => grabRenderer.tweenTo(
          { x: this.getSafeSumoX(grabSprite, grabTargetX) },
          { duration: 240, ease: 'Cubic.Out', onComplete: resolve }
        ));
        const grabTexture = this.textures.get(playerIsGrab ? this.playerTextureKey : this.opponentTextureKey);
        const grabId = playerIsGrab ? this.playerMeguId : this.opponentMeguId;
        const grabPose = [`${grabId}_13-2x`, `${grabId}_13`].find(name => grabTexture?.has(name));
        const pullTexture = this.textures.get(playerIsPull ? this.playerTextureKey : this.opponentTextureKey);
        const pullId = playerIsPull ? this.playerMeguId : this.opponentMeguId;
        const pullPose = [`${pullId}_11-2x`, `${pullId}_11`].find(name => pullTexture?.has(name));
        if (!grabPose) throw new Error(`Missing required Grab pose frame: ${grabId}_13[-2x]`);
        if (!pullPose) throw new Error(`Missing required Pull pose frame: ${pullId}_11[-2x]`);
        (grabIsPlayer ? this.playerRenderer : this.cpuRenderer)?.setState(MeguRenderer.STATES.SAD);
        (playerIsPull ? this.playerRenderer : this.cpuRenderer)?.setState(MeguRenderer.STATES.HAPPY);
        this.poseHoldSides = { player: true, cpu: true };
        this.setWalking(false);
        await new Promise(resolve => this.time.delayedCall(2000, resolve));
        this.poseHoldSides = null;
        this.setWalking(true);
        await new Promise(resolve => {
          let pending = 2;
          const done = () => { if (--pending === 0) resolve(); };
          this.playerRenderer.tweenTo({ x:this.getSafeSumoX(this.playerSprite, startP), y:429 }, { duration:280, ease:'Cubic.InOut', onComplete:done });
          this.cpuRenderer.tweenTo({ x:this.getSafeSumoX(this.cpuSprite, startC), y:429 }, { duration:280, ease:'Cubic.InOut', onComplete:done });
        });
        grabRenderer?.setDepth(3, grabRenderer.shadow?.depth);
      } else {
        // Grab beats Slap: move together toward the losing Slap side, then reset.
        if (playerLoses && this.contactFrame) this.playerRenderer?.setState(MeguRenderer.STATES.SAD);
        if (cpuLoses && this.opponentContactFrame) this.cpuRenderer?.setState(MeguRenderer.STATES.SAD);
        this.setWalking(true);
        const direction = cpuLoses ? playerTowardCenter : -playerTowardCenter;
        const travelDistance = 42;
        await this.tweenPositions(contactP + direction * travelDistance, contactC + direction * travelDistance, 2000, 'Sine.InOut');
        await this.tweenPositions(startP, startC, 1400, 'Sine.InOut');
      }
      this.pullLoserSide = null;
      this.slapWinnerSide = null;
      this.poseHoldSides = null;
    }

    this.playerRenderer.setScale(0.84); this.cpuRenderer.setScale(0.84);
    this.setWalking(false);
  }
  async animateDrawInteraction(playerMove) {
    const startP = this.playerStartX, startC = this.cpuStartX;
    if (playerMove === 'scissors') {
      // Both fighters pull away from each other, then return to their exact
      // starting positions. Derive direction locally (it is not shared with
      // animateMixedInteraction) so the draw animation cannot throw a
      // ReferenceError and leave roundBusy permanently set.
      const playerTowardCenter = this.playerOnLeft ? 1 : -1;
      this.setWalking(true);
      await this.tweenPositions(startP - playerTowardCenter * 42, startC + playerTowardCenter * 42, 1400, 'Sine.InOut');
      await this.tweenPositions(startP, startC, 1400, 'Sine.InOut');
      this.setWalking(false);
    } else if (playerMove === 'rock') {
      this.playSumoSfx('sumo-sfx-stamp');
      this.setWalking(true);
      await this.tweenPositions(this.playerOnLeft ? 300 : 340, this.playerOnLeft ? 340 : 300, 230, 'Cubic.Out');
      await new Promise(resolve => this.time.delayedCall(1000, resolve));
      await this.tweenPositions(startP, startC, 1100, 'Sine.InOut');
      this.setWalking(false);
    } else if (playerMove === 'paper') {
      this.setWalking(true);
      for (let i = 0; i < 3; i++) {
        this.playSumoSfx('sumo-sfx-beat');
        await this.tweenPositions(this.playerOnLeft ? 300 : 340, this.playerOnLeft ? 340 : 300, 105, 'Cubic.Out');
        // Squash/stretch plus recoil makes each collision read as a bounce.
        await new Promise(resolve => {
          this.playerRenderer.tweenTo({ scaleX:1.0248, scaleY:.7392 }, { duration:55, yoyo:true, onComplete:resolve });
          this.cpuRenderer.tweenTo({ scaleX:1.0248, scaleY:.7392 }, { duration:55, yoyo:true });
        });
        await this.tweenPositions(startP, startC, 115, 'Cubic.Out');
      }
      this.playerRenderer.setScale(0.84); this.cpuRenderer.setScale(0.84);
      this.setWalking(false);
    }
  }
  async playRound(playerMove) {
    if (this.finished || this.roundBusy) return;
    if (this.sumoHyoshikiSound) {
      try { this.sumoHyoshikiSound.stop(); this.sumoHyoshikiSound.destroy(); } catch (e) {}
      this.sumoHyoshikiSound = null;
    }
    if (!this.sumoHakkeyoiPlayed) {
      this.sumoHakkeyoiPlayed = true;
      if (this.cache.audio.exists('sumo-sfx-hakkeyoi')) this.sound.play('sumo-sfx-hakkeyoi', { volume: 0.85 });
    }
    this.roundBusy = true; this.lastPlayerMove=playerMove;
    this.moveButtons.forEach(b => b.disableInteractive());
    Object.values(this.cpuDebugButtons || {}).forEach(b => b.hit.disableInteractive());
    const cpuMove=this.debugCpuMove || Phaser.Utils.Array.GetRandom(['rock','paper','scissors']); this.lastCpuMove=cpuMove;
    // A debug selection is a one-round override, then returns to random CPU behavior.
    if (this.debugCpuMove) { this.debugCpuMove = null; Object.values(this.cpuDebugButtons || {}).forEach(btn => { btn.label.setText(`${btn.label.text.split(':')[0]}: OFF`); btn.plate.setFillStyle(0x49334f); }); }
    const moveNames = { rock: 'GRAB', paper: 'SLAP', scissors: 'PULL' };
    // Match-up order: PULL < SLAP < GRAB < PULL.
    const wins = { scissors: 'rock', paper: 'scissors', rock: 'paper' };
    const result = playerMove===cpuMove ? 'draw' : wins[playerMove]===cpuMove ? 'player' : 'cpu';
    const pw = this.playerWeight, cw = this.cpuWeight;
    // Damage is calibrated for an approximately five-round max-stat match.
    // Preserve the existing weight relationships and attribute multipliers,
    // while applying one scale to all moves and deferred grab damage.
    const damageScale = 34;
    const slap = weight => (weight / 4) * damageScale;
    const pull = weight => (4 / Math.max(1, weight)) * damageScale;
    const grab = (a, d) => (4 * Math.abs(a - d) / Math.max(a, d, 1)) * damageScale;
    const playerPower = 1 + (Number(this.playerStats?.power)||0)/100;
    const cpuPower = 1 + (Number(this.opponentStats?.power)||0)/100;
    const playerTechnique = 1 + (Number(this.playerStats?.technique)||0)/100;
    const cpuTechnique = 1 + (Number(this.opponentStats?.technique)||0)/100;
    const playerAgility = 1 + (Number(this.playerStats?.agility)||0)/100;
    const cpuAgility = 1 + (Number(this.opponentStats?.agility)||0)/100;
    let damageToPlayer = 0, damageToCpu = 0;
    let pendingPlayer = 0, pendingCpu = 0;
    // A simultaneous Pull cancels the deferred double-Grab damage and is a
    // clean draw: neither fighter takes carryover or new damage.
    const bothPull = playerMove === 'scissors' && cpuMove === 'scissors';
    if (bothPull) {
      this.pendingGrabDamage = { player: 0, cpu: 0 };
    } else {
      damageToPlayer += this.pendingGrabDamage.player;
      damageToCpu += this.pendingGrabDamage.cpu;
      this.pendingGrabDamage = { player: 0, cpu: 0 };
    }
    if (playerMove === 'paper' && cpuMove === 'paper') {
      // Both slap: each hit scales with the opponent's weight.
      damageToPlayer += slap(cw) * cpuPower; damageToCpu += slap(pw) * playerPower;
    } else if (playerMove === 'scissors' && cpuMove === 'scissors') {
      // Both pull: no new damage.
    } else if (playerMove === 'rock' && cpuMove === 'rock') {
      // Both grab: accumulate normalized damage and defer it to next round.
      pendingPlayer = grab(cw, pw); pendingCpu = grab(pw, cw);
      this.pendingGrabDamage = { player: pendingPlayer, cpu: pendingCpu };
    } else {
      // Only the winning move deals damage in a non-draw matchup.
      if (result === 'player') {
        const baseDamage = playerMove === 'paper' ? slap(pw) * playerPower : playerMove === 'scissors' ? pull(pw) * playerAgility : grab(pw, cw) * playerTechnique;
        damageToCpu += baseDamage * 2;
        this.playerLives += baseDamage; // Recover half of the doubled damage dealt.
      } else if (result === 'cpu') {
        const baseDamage = cpuMove === 'paper' ? slap(cw) * cpuPower : cpuMove === 'scissors' ? pull(cw) * cpuAgility : grab(cw, pw) * cpuTechnique;
        damageToPlayer += baseDamage * 2;
        this.cpuLives += baseDamage; // Recover half of the doubled damage dealt.
      }
    }
    // Resolve and display the round's actual damage first. Endure is a
    // player-only last-chance option and must not interrupt damage resolution.
    this.playerLives = Math.max(0, Math.min(this.playerMaxHP, this.playerLives - damageToPlayer));
    this.cpuLives = Math.max(0, Math.min(this.cpuMaxHP, this.cpuLives - damageToCpu));
    // If simultaneous Slaps knock both fighters out in the same round,
    // keep the match going with both fighters at 1 HP instead of ending it.
    if (playerMove === 'paper' && cpuMove === 'paper' && this.playerLives <= 0 && this.cpuLives <= 0) {
      this.playerLives = 1;
      this.cpuLives = 1;
    }
    this.status.setText(`YOU: ${moveNames[playerMove]}     CPU: ${moveNames[cpuMove]}`);
    this.refreshLives();
    (async () => {
      if (playerMove === cpuMove && ['rock','paper','scissors'].includes(playerMove)) await this.animateDrawInteraction(playerMove);
      else if (['rock','paper','scissors'].includes(playerMove) && ['rock','paper','scissors'].includes(cpuMove) && ((playerMove === 'scissors' && cpuMove === 'rock') || (playerMove === 'rock' && cpuMove === 'scissors') || (playerMove === 'rock' && cpuMove === 'paper') || (playerMove === 'paper' && cpuMove === 'rock') || (playerMove === 'scissors' && cpuMove === 'paper') || (playerMove === 'paper' && cpuMove === 'scissors'))) await this.animateMixedInteraction(playerMove, cpuMove);
      else await new Promise(resolve => this.time.delayedCall(420, resolve));
      if (this.finished) return;

      // Only the player's MEGU can use Endure. The prompt appears after the
      // damage and round animation have completed, with the player visibly at 0 HP.
      if (this.playerLives <= 0 && !this.endureUsed && Number(GAME_ATTRIBUTES.elixir || 0) > 0) {
        const endureAccepted = await this.requestEndure();
        if (endureAccepted) {
          this.playerLives = 1;
          this.refreshLives();
        }
      }
      if (this.playerLives<=0 || this.cpuLives<=0) this.endGame(this.playerLives>0?'player':'cpu', result==='player'?playerMove:result==='cpu'?cpuMove:(this.playerLives>0?playerMove:cpuMove));
      else {
        this.status.setText(result==='draw' ? (playerMove==='rock' ? 'DOUBLE GRAB — DAMAGE CARRIED TO NEXT ROUND' : playerMove==='scissors' ? 'DOUBLE PULL — NO DAMAGE' : 'DOUBLE SLAP — BOTH TAKE DAMAGE') : result==='player'?'YOU WIN THE ROUND!':'CPU WINS THE ROUND!');
        this.roundBusy=false;
        this.moveButtons.forEach(b => b.setInteractive({useHandCursor:true}));
        Object.values(this.cpuDebugButtons || {}).forEach(b => b.hit.setInteractive({useHandCursor:true}));
      }
    })();
  }
  quit() {
    if (this._returned || this._quitInProgress) return;
    this._quitInProgress = true;
    this.finished = true;
    this.roundBusy = true;
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    try { (this.moveButtons || []).forEach(button => button.disableInteractive()); } catch (e) {}
    const returnHome = () => this._returnToMain();
    let fadeStarted = false;
    try {
      const camera = this.cameras && this.cameras.main;
      if (camera) {
        this._sumoReturnCameraHandler = returnHome;
        camera.once('camerafadeoutcomplete', this._sumoReturnCameraHandler);
        camera.fadeOut(650, 0, 0, 0);
        fadeStarted = true;
      }
    } catch (e) { console.warn('Sumo quit fade failed; returning home', e); }
    // The fallback and fade event share the idempotent return path.
    this._quitFallbackTimer = setTimeout(returnHome, fadeStarted ? 1000 : 0);
  }
  throwZabutons() {
    if (this.zabutonThrowStarted || !this.textures.exists('sumo-zabuton')) return;
    this.zabutonThrowStarted = true;
    const throws = 64;
    this.zabutonObjects = [];
    // Keep the landing area clear of the wrestlers in the middle of the dohyo.
    const landingZones = [
      { minX: 24, maxX: 225 },
      { minX: 415, maxX: 616 }
    ];
    for (let i = 0; i < throws; i++) {
      const fromLeft = i % 2 === 0;
      const zone = landingZones[fromLeft ? 0 : 1];
      const startX = fromLeft ? -42 : 682;
      const startY = Phaser.Math.Between(270, 355);
      const endX = Phaser.Math.Between(zone.minX, zone.maxX);
      const endY = Phaser.Math.Between(454, 535);
      const controlX = (startX + endX) / 2 + Phaser.Math.Between(-35, 35);
      const controlY = Phaser.Math.Between(55, 115);
      const cushionScale = Phaser.Math.FloatBetween(1, 2);
      // Give every cushion its own random spin direction and number of turns.
      const spinDirection = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
      const spinTurns = Phaser.Math.FloatBetween(1.25, 3.75);
      const cushion = this.add.image(startX, startY, 'sumo-zabuton')
        .setDisplaySize(54 * cushionScale, 38 * cushionScale)
        .setOrigin(0.5)
        .setDepth(4.5);
      this.objects.push(cushion);
      this.zabutonObjects.push(cushion);
      this.time.delayedCall(i * 35, () => {
        if (!cushion.active || this._cleaned) return;
        const progress = { t: 0 };
        this.tweens.add({
          targets: progress,
          t: 1,
          duration: Phaser.Math.Between(1900, 2400),
          ease: 'Linear',
          onUpdate: () => {
            const t = progress.t;
            const inv = 1 - t;
            // Quadratic Bezier creates the high arched throw.
            cushion.x = inv * inv * startX + 2 * inv * t * controlX + t * t * endX;
            cushion.y = inv * inv * startY + 2 * inv * t * controlY + t * t * endY;
            // Randomized in-flight rotation: each cushion spins in its own direction
            // and completes a different number of turns during its 1.9–2.4s flight.
            cushion.rotation = spinDirection * spinTurns * Math.PI * 2 * t;
            cushion.setFlipX(Math.floor(t * 12) % 2 === 1);
          },
          onComplete: () => {
            if (!cushion.active) return;
            cushion.setPosition(endX, endY).setFlipX(false);
            this.tweens.add({ targets: cushion, y: endY - 3, duration: 100, yoyo: true, repeat: 1, ease: 'Sine.easeOut' });
          }
        });
      });
    }
    // Remove the landed cushions after the full volley has finished. This avoids
    // retaining old display objects when the Phaser scene is reused for another match.
    this.time.delayedCall((throws - 1) * 35 + 2700, () => {
      const oldCushions = this.zabutonObjects || [];
      oldCushions.forEach(cushion => {
        try { if (cushion && cushion.active) cushion.destroy(); } catch (e) {}
      });
      this.objects = (this.objects || []).filter(object => !oldCushions.includes(object));
      this.zabutonObjects = [];
    });
  }
  endGame(winner, move) {
    if (this.finished) return;
    this.stressGameCompleted = true;
    this.finished=true; this.roundBusy=true;
    if (!this._normalHygieneCostApplied) { this._normalHygieneCostApplied = true; applyHygieneCost(30, this.mainScene); }
    // A completed Sumo match costs 30% of the active MEGU's maximum satiety.
    // endGame() is already guarded by `finished`, so this runs once per match.
    // Do not keep a scene-instance flag here: Phaser may reuse the scene for
    // subsequent matches, which would otherwise suppress later costs.
    applyExerciseCost(0, 0.30, this.mainScene);
    let victoryGold = 0;
    let specialRewardMessage = '';
    if (winner === 'player' && this.opponentSelected) {
      if (this.isDaiYokozunaChallenge) {
        victoryGold = 100000;
        const wonGoldenTicket = Phaser.Math.Between(1,10)===1;
        if (wonGoldenTicket) GAME_ATTRIBUTES.goldenFlightTicket = Math.max(0,Math.trunc(Number(GAME_ATTRIBUTES.goldenFlightTicket)||0))+1;
        specialRewardMessage = wonGoldenTicket ? 'GOLDEN FLIGHT TICKET WON!' : 'NO GOLDEN FLIGHT TICKET (10% CHANCE)';
      } else {
        const rankProgress = this.opponentRankIndex / Math.max(1,SUMO_RANKS.length-1);
        // Balance normal Sumo income against racing: at the top rank this
        // pays 2,300 gold per win, or about 19.7k gold/min at a 7s match cycle.
        victoryGold = Math.round(100 + rankProgress * 2200);
      }
      if (this.mainScene?.changeGold) this.mainScene.changeGold(victoryGold);
      else { GAME_ATTRIBUTES.gold = Math.max(0,Math.trunc(Number(GAME_ATTRIBUTES.gold)||0))+victoryGold; save(); }
      if (this.isDaiYokozunaChallenge) this.mainScene?.updateMedicineHud?.();
      this.recordSumoVictory();
    } else {
      this.recordSumoDefeat();
    }
    this.moveButtons.forEach(b=>b.disableInteractive());
    // Stop all blinking/overlay layers before applying the final pose. Otherwise
    // the always-on 7/8 overlay can remain drawn over the win/lose frame.
    const isYokozunaPromotionBout = this.opponentCategory === 'promotion'
      && SUMO_RANKS[this.sumoCareer?.promotion?.targetRankIndex ?? this.opponentRankIndex]?.title === 'Yokozuna';
    const defeatedYokozunaFromOzekiOrLower = winner === 'player'
      && !this.isDaiYokozunaChallenge
      && (SUMO_RANKS[this.opponentRankIndex]?.title === 'Yokozuna' || isYokozunaPromotionBout)
      && SUMO_RANKS[this.playerRankIndex]?.title !== 'Yokozuna';
    if (this.playerSprite && this.cpuSprite) {
      if (winner==='player') {
        if (this.winFrame) this.playerRenderer?.setState(MeguRenderer.STATES.HAPPY);
        if (this.opponentLoseFrame) this.cpuRenderer?.setState(MeguRenderer.STATES.WORRIED);
      } else {
        // Use the same atlas-frame selection convention for the opponent as
        // the player, while keeping each character on its own atlas texture.
        if (this.opponentWinFrame) this.cpuRenderer?.setState(MeguRenderer.STATES.HAPPY);
        if (this.loseFrame) this.playerRenderer?.setState(MeguRenderer.STATES.WORRIED);
      }
      this.playerRenderer?.setVisible(true);
      this.cpuRenderer?.setVisible(true);
    }
    if (defeatedYokozunaFromOzekiOrLower) this.throwZabutons();
    const moveNames = { paper: 'SLAP', scissors: 'PULL', rock: 'GRAB', slap: 'SLAP', pull: 'PULL', grab: 'GRAB' };
    const winnerName = winner === 'player' ? this.playerWinnerName : this.opponentWinnerName;
    const resultLine = winner==='player' ? `${winnerName} wins by ${moveNames[String(move).toLowerCase()] || String(move).toUpperCase()}\n+${victoryGold.toLocaleString('en-US')} GOLD  ·  ${specialRewardMessage ? specialRewardMessage+'\n' : ''}${this.rankProgressMessage||sumoRankName(this.sumoCareer.rankIndex)}` : `${winnerName} wins by ${moveNames[String(move).toLowerCase()] || String(move).toUpperCase()}\n${this.rankProgressMessage||sumoRankName(this.sumoCareer.rankIndex)}`;
    this.status.setText(resultLine).setFontSize(winner==='player'?18:25);
    if (this._sumoPromotionNotice) {
      // Display the Home-style message in the active Sumo scene, before fade-out.
      const notice = this._sumoPromotionNotice;
      this._sumoPromotionNotice = null;
      const width = this.scale.width || 640;
      const card = this.add.container(width / 2, 200).setDepth(10000);
      if (this.textures.exists('megu-message-bg')) {
        const source = this.textures.get('megu-message-bg').getSourceImage();
        const imageWidth = Math.max(1, source?.width || width);
        card.add(this.add.image(0, 0, 'megu-message-bg')
          .setOrigin(0.5).setDisplaySize(width, (source?.height || 100) * width / imageWidth));
      } else {
        card.add(this.add.rectangle(0, 0, width, 82, 0x26392b, 0.96)
          .setStrokeStyle(2, 0x8bd889));
      }
      card.add(this.add.text(0, 0, notice, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#c9ff9f',
        stroke: '#18351b', strokeThickness: 3, align: 'center',
        wordWrap: { width: width - 32 }, maxLines: 3, padding: { x: 8, y: 4 }
      }).setOrigin(0.5));
    }
    this.time.delayedCall(3000, () => {
      if (this._cleaned || !this.cameras || !this.cameras.main) return;
      const camera = this.cameras.main;
      // Register the event before starting the fade and keep a timeout fallback:
      // the main scene must never remain paused if the camera event is missed.
      this._sumoReturnCameraHandler = () => this._returnToMain();
      camera.once('camerafadeoutcomplete', this._sumoReturnCameraHandler);
      camera.fadeOut(650, 0, 0, 0);
      this.time.delayedCall(1000, () => this._returnToMain());
    });
  }
  _returnToMain() {
    if (this._returned) return;
    this._returned = true;
    if (this._quitFallbackTimer) { clearTimeout(this._quitFallbackTimer); this._quitFallbackTimer = null; }
    const manager = this.game && this.game.scene;
    let main = null;
    try { main = manager && manager.getScene('default'); } catch (e) {
      console.error('SumoMinigame: could not retrieve Main scene', e);
    }

    // Resume the home scene first. Keep every restoration step isolated so a
    // stale menu object or audio error cannot prevent the scene from resuming.
    if (manager) {
      try {
        if (typeof manager.isPaused !== 'function' || manager.isPaused('default')) manager.resume('default');
        else if (typeof manager.isSleeping === 'function' && manager.isSleeping('default')) manager.wake('default');
      } catch (e) {
        console.error('SumoMinigame: Main scene resume failed; retrying directly', e);
        try { manager.resume('default'); } catch (resumeError) {
          console.error('SumoMinigame: fallback resume failed', resumeError);
        }
      }
    }

    if (main) {
      const safely = (label, fn) => { try { fn(); } catch (e) { console.warn('SumoMinigame: restore step failed (' + label + ')', e); } };
      safely('animation manager', () => { if (main.anims && main.anims.resumeAll) main.anims.resumeAll(); });
      safely('tween manager', () => { if (main.tweens && main.tweens.resumeAll) main.tweens.resumeAll(); });
      safely('main clock', () => { if (main.time) main.time.paused = false; });
      safely('furniture menu', () => { if (typeof main.updateFurnitureMenu === 'function') main.updateFurnitureMenu(); });
      safely('background menu', () => { if (typeof main.updateBackgroundMenu === 'function') main.updateBackgroundMenu(); });
      safely('character menu', () => { if (typeof main.updateCharacterMenu === 'function') main.updateCharacterMenu(); });
      safely('food menu', () => { if (typeof main.updateFoodMenu === 'function') main.updateFoodMenu(); });
      safely('character visibility', () => {
        if (main.meguRenderer) main.meguRenderer.setBodyVisible(!main.editMode);
        if (main.meguRenderer) main.meguRenderer.setEyesVisible(!main.editMode);
        if (main.meguRenderer) main.meguRenderer.syncEyes(false);
      });
      safely('main music', () => {
        if (main.bgmSound) {
          main.bgmSound.setVolume(main.musicVolume);
          if (!main.bgmSound.isPlaying) main.bgmSound.play();
        }
      });
      if (this.stressGameCompleted) safely('stress objective', () => main.time.delayedCall(400, () => main.completeStressAction('sumo')));

    }

    // Stop Sumo before the final recovery. Phaser queues scene operations, so
    // restore Main again on the browser event loop after the shutdown handoff.
    try { if (manager) manager.stop('SumoMinigame'); }
    catch (e) { console.error('SumoMinigame: stop error', e); }

    // Do not schedule delayed scene recovery here. The Main scene has already been
    // resumed above; stale timers could raise it over a newly launched minigame.
  }

  cleanup() {
    // Idempotent: Phaser calls this from the scene shutdown event.
    if (this._cleaned) return;
    this._cleaned = true;

    // Cancel callbacks that could otherwise retain this scene after it closes.
    if (this._quitFallbackTimer) { clearTimeout(this._quitFallbackTimer); this._quitFallbackTimer = null; }
    if (this._sumoReturnCameraHandler && this.cameras && this.cameras.main) {
      this.cameras.main.off('camerafadeoutcomplete', this._sumoReturnCameraHandler);
    }
    this._sumoReturnCameraHandler = null;
    if (this._sumoShadowUpdateHandler) this.events.off('update', this._sumoShadowUpdateHandler);
    this._sumoShadowUpdateHandler = null;
    this.events.off('update', this.updateIdleAnimation, this);
    this.events.off('update', this.syncSumoPlayerAccessory, this);

    // Stop scene-owned timers, tweens and audio before releasing object refs.
    try { if (this.time) this.time.removeAllEvents(); } catch (e) {}
    try { if (this.tweens) this.tweens.killAll(); } catch (e) {}
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    if (this.sumoHyoshikiSound) {
      try { this.sumoHyoshikiSound.stop(); } catch (e) {}
      try { this.sumoHyoshikiSound.destroy(); } catch (e) {}
      this.sumoHyoshikiSound = null;
    }
    if (this.sumoMusic) {
      try { this.sumoMusic.stop(); } catch (e) {}
      try { this.sumoMusic.destroy(); } catch (e) {}
      this.sumoMusic = null;
    }
    try {
      if (this.sound && this.sound.getAllPlaying) {
        this.sound.getAllPlaying().forEach(sound => {
          if (sound && /^sumo-(bgm|sfx-)/.test(String(sound.key || ''))) sound.stop();
        });
      }
    } catch (e) {}

    // Destroy renderer containers before releasing the remaining scene objects.
    try { this.playerRenderer?.destroy(); } catch (e) {}
    try { this.cpuRenderer?.destroy(); } catch (e) {}
    this.playerRenderer = this.cpuRenderer = null;

    // Destroy every remaining display object created by this scene, including
    // controls, shadows, debug labels and accessory layers.
    const list = this.objects || [];
    for (const o of list) {
      try { if (o && o.destroy) o.destroy(); } catch (e) {}
    }
    this.objects = [];

    // Release references to destroyed game objects and per-match data. Phaser
    // reuses Scene instances, so leaving these here would retain the prior match.
    const objectRefs = [
      'quitButton','status','weightDebug','statsHudText','playerCounter','playerNameLabel','cpuCounter','cpuNameLabel',
      'playerHPBack','playerHPFill','playerHPText','cpuHPBack','cpuHPFill','cpuHPText',
      'playerSprite','cpuSprite','playerShadow','cpuShadow',
    ];
    objectRefs.forEach(key => { this[key] = null; });
    this.cpuDebugButtons = null;
    this.selectionOverlayObjects = [];
    this.moveButtons = [];
    [
      'staticFrames','walkFrames','opponentWalkFrames','blinkFrames',
      'opponentStaticFrames','opponentBlinkFrames'
    ].forEach(key => { this[key] = []; });
    [
      'contactFrame','grabFrame','slapFrame','opponentContactFrame','opponentGrabFrame',
      'opponentSlapFrame','winFrame','loseFrame','opponentWinFrame','opponentLoseFrame',
      'entryPlayerMeguDef','playerMeguDef','opponentMeguDef','mainScene',
      'playerTextureKey','opponentTextureKey','meguTextureKey','playerMeguId','opponentMeguId',
      'meguId','playerWinnerName','opponentWinnerName','playerDisplayName','opponentDisplayName',
      'playerStartX','cpuStartX','pendingGrabDamage','poseHoldSides','pullLoserSide',
      'slapWinnerSide','lastPlayerMove','lastCpuMove','debugCpuMove'
    ].forEach(key => { this[key] = null; });
    this.walkingActive = false;
    this.idleResumeAt = 0;
  }}
