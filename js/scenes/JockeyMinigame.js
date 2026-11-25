// Phaser scene module. Loaded after js/game.js and before js/boot.js.
class JockeyMinigame extends Phaser.Scene {
  constructor() { super({ key: 'JockeyMinigame' }); }
  init(data = {}) {
    this.entryPlayerMeguDef = data.playerMeguDef || null;
    this.guestCandidates = Array.isArray(data.guestCandidates) ? data.guestCandidates : [];
    this.guestRaceCandidates = [];
    this.petName = String(data.pet_name || '').trim();
    this.raceStarted = false;
    this.ended = false;
    this.returned = false;
    this.cleaned = false;
    this._returnSequenceStarted = false;
    this._jockeyDepthOrder = null;
    this.cameraPanComplete = false;
    this.raceStartTime = 0;
    this.countdownValue = 0;
    this.countdownTimer = null;
    this.raceTween = null;
    this.resultTimer = null;
    this.returnFallbackTimer = null;
    this.cameraTween = null;
    this.music = null;
    this.predictions = null;
    this.predictionObjects = [];
    this.predictionRows = null;
    this.jockeys = [];
    this.meguRenderers = [];
    this.finishOrder = [];
    this.objects = [];
    this.playerBoostUntil = 0;
    this.playerBoostUsed = false;
    this.skillCutscene = false;
    this.playerRaceSkill = 'explosive_start';
    this.skillSelectionText = null;
    this.bossRaceMode = data.bossRace === true;
    this.stressGameCompleted = false;
  }
  preload() {
    this.load.json('megu-menu-jockey', 'js/config/menus/jockey.json');
    if (!this.textures.exists('jockey-race-bg-far')) this.load.image('jockey-race-bg-far', 'assets/minigame/RACE_01.png');
    if (!this.textures.exists('jockey-race-bg-near')) this.load.image('jockey-race-bg-near', 'assets/minigame/RACE_02.png');
    if (!this.textures.exists('jockey-ready')) this.load.image('jockey-ready', 'assets/minigame/ready@2x.png');
    if (!this.textures.exists('jockey-go')) this.load.image('jockey-go', 'assets/minigame/go@2x.png');
    if (!this.textures.exists('jockey-close')) this.load.image('jockey-close', 'assets/menus/buttons/btn_close@2x.png');
    if (!this.cache.audio.exists('jockey-bgm')) this.load.audio('jockey-bgm', 'assets/sound/bgm/BGM_undokai.mp3');
    if (!this.cache.audio.exists('jockey-start')) this.load.audio('jockey-start', 'assets/sound/sfx/SE_beat.wav');
    if (!this.cache.audio.exists('jockey-whistle')) this.load.audio('jockey-whistle', 'assets/sound/sfx/SE_whistle.wav');

    const main = this.scene.get('default');
    const allDefs = (main && main.characterDefs) || [];
    const playerDef = this.entryPlayerMeguDef || allDefs[getCharacterIndex(allDefs)] || allDefs[0];
    const descriptionRows = (main && main.meguDescriptionRows) || [];
    const normalize = value => String(value || '').replace(/^ID/i, '').replace(/\D/g, '').replace(/^0+/, '') || '0';
    const descriptionById = new Map(descriptionRows.map(row => [normalize(row.id), row]));
    const playerId = normalize(playerDef && playerDef.id);
    const describedIds = new Set(descriptionRows.map(row => normalize(row && row.id)));
    const describedCandidates = allDefs.filter(def => normalize(def.id) !== playerId && describedIds.has(normalize(def.id)));
    const candidates = describedCandidates.length >= 4
      ? describedCandidates
      : allDefs.filter(def => normalize(def.id) !== playerId);
    Phaser.Utils.Array.Shuffle(candidates);
    const chosen = [playerDef, ...candidates.slice(0, 3)];
    const language = String(main && main.language || 'en').toLowerCase();
    this.roster = chosen.map((def, index) => {
      const id = String(def && def.id || 'ID1');
      const row = descriptionById.get(normalize(id));
      const strings = row && Array.isArray(row.strings) ? row.strings : [];
      const localized = strings.find(item => item && String(item._lang || '').toLowerCase() === language)
        || strings.find(item => item && String(item._lang || '').toLowerCase() === 'en') || strings[0];
      const name = index === 0 && this.petName ? this.petName : String((localized && localized.name) || (def && def.name) || id);
      const textureKey = `jockey-${id}`;
      return { id, name, originalName: name, def, textureKey, normalTextureKey: textureKey, index };
    });
    const playerCharacterId = String(playerDef && (playerDef.logicalId || playerDef.id) || 'ID1');
    const playerGuestStats = getSumoCharacterStatRecord(playerCharacterId, GAME_ATTRIBUTES.shiny === true).stats;
    const playerGuestTotal = ['power','agility','technique','endurance'].reduce((sum,key) => sum + (Number(playerGuestStats[key]) || 5), 0);
    const playerGuestClass = this.getRaceClassIndex(playerGuestTotal);
    const sampledGuests = this.bossRaceMode ? [] : Phaser.Utils.Array.Shuffle([...(this.guestCandidates || [])].filter(guest => {
      const total = ['power','agility','technique','endurance'].reduce((sum,key) => sum + (Number(guest.sumoStats?.[key]) || 5), 0);
      return Math.abs(this.getRaceClassIndex(total) - playerGuestClass) <= 1;
    })).slice(0, 12);
    const loadedGuestKeys = new Set();
    sampledGuests.forEach(guest => {
      const paths = meguAssetPaths(guest.petId, guest.shiny === true);
      guest.textureKey = paths.key;
      guest.framePrefix = paths.key;
      guest.raceStats = { ...guest.sumoStats };
      const key = `${paths.key}`;
      if (!loadedGuestKeys.has(key) && !this.textures.exists(key)) this.load.atlas(key, paths.image, paths.json);
      loadedGuestKeys.add(key);
      this.guestRaceCandidates.push(guest);
    });
    this.roster.forEach((entry, index) => {
      const existingKey = entry.id;
      if (this.textures.exists(existingKey)) entry.textureKey = existingKey;
      else if (!this.textures.exists(entry.textureKey)) {
        this.load.atlas(entry.textureKey, entry.def.image || `assets/megu/${entry.id}.png`, entry.def.json || `assets/megu/${entry.id}.json`);
      }
      entry.normalTextureKey = entry.textureKey;
      if (index === 1) {
        const shinyPaths = meguAssetPaths(entry.def.logicalId || entry.id, true);
        entry.shinyTextureKey = `jockey-boss-${String(entry.def.logicalId || entry.id).replace(/^ID/i, '')}`;
        entry.shinyFramePrefix = shinyPaths.key;
        entry.shinyImage = shinyPaths.image;
        entry.shinyJson = shinyPaths.json;
        if (!this.textures.exists(entry.shinyTextureKey)) {
          this.load.atlas(entry.shinyTextureKey, entry.shinyImage, entry.shinyJson);
        }
      }
    });
  }
  create() {
    this.mainScene = this.scene.get('default');

    // Racing uses the active MEGU's persistent four-stat record. Opponents
    // are generated around those values, with variation scaling as the
    // character accumulates more total stat points.
    const playerEntry = this.roster && this.roster[0];
    const playerCharacterId = String(playerEntry && playerEntry.def && (playerEntry.def.logicalId || playerEntry.def.id) || 'ID1');
    const playerRaceRecord = getSumoCharacterStatRecord(playerCharacterId, GAME_ATTRIBUTES.shiny === true);
    this.playerRaceStats = { ...playerRaceRecord.stats };
    const raceSkillIds = ['explosive_start','technical_run','second_wind','heavy_push','feather_dash','final_sprint'];
    this.playerRaceSkill = raceSkillIds.includes(GAME_ATTRIBUTES.race_skill) ? GAME_ATTRIBUTES.race_skill : 'explosive_start';
    save();
    const statTotal = ['power', 'agility', 'technique', 'endurance']
      .reduce((sum, key) => sum + (Number(this.playerRaceStats[key]) || 5), 0);
    this.raceClasses = [
      'Cherry', 'Ichigo', 'Kiwi', 'Orange', 'Apple',
      'Pear', 'Grape', 'Melon', 'Pineapple', 'Watermelon'
    ].map((name, index, names) => ({
      index,
      name,
      averageTotal: Math.round(20 + (340 * index) / (names.length - 1))
    }));
    this.playerRaceTotal = statTotal;
    this.playerRaceClassIndex = this.getRaceClassIndex(statTotal);
    if (this.playerRaceClassIndex === 9) {
      if (!GAME_ATTRIBUTES.raceWatermelonUnlocked || typeof GAME_ATTRIBUTES.raceWatermelonUnlocked !== 'object') GAME_ATTRIBUTES.raceWatermelonUnlocked = {};
      GAME_ATTRIBUTES.raceWatermelonUnlocked[`${playerCharacterId.toUpperCase()}:${GAME_ATTRIBUTES.shiny === true ? 'shiny' : 'normal'}`] = true;
    }
    this.availableRaceClassIndices = [this.playerRaceClassIndex - 1, this.playerRaceClassIndex, this.playerRaceClassIndex + 1]
      .filter(index => index >= 0 && index < this.raceClasses.length);
    this.selectedRaceClassIndex = this.playerRaceClassIndex;
    if (this.bossRaceMode) {
      this.selectedRaceClassIndex = 9;
      this.availableRaceClassIndices = [9];
    }
    const initialGuestAssignments = this.pickRaceGuestAssignments(this.selectedRaceClassIndex);
    this.roster = (this.roster || []).map((entry, index) => {
      const isBoss = this.bossRaceMode && index === 1;
      const rivalClassIndex = this.bossRaceMode ? 9 : this.selectedRaceClassIndex;
      const guest = index > 0 && !isBoss ? initialGuestAssignments[index - 1] : null;
      return {
        ...entry,
        originalId: entry.originalId || entry.id,
        id: guest ? `guest-${guest.userId}` : entry.id,
        name: isBoss ? 'SHINY BOSS' : guest ? `${guest.petName} (${guest.username})` : entry.name,
        textureKey: isBoss ? entry.shinyTextureKey : guest ? guest.textureKey : entry.textureKey,
        framePrefix: guest ? guest.framePrefix : entry.id,
        isGuest: !!guest,
        guestUserId: guest ? guest.userId : null,
        raceStats: index === 0 ? { ...this.playerRaceStats } : (isBoss
          ? { power: 120, agility: 120, technique: 120, endurance: 120 }
          : guest ? { ...guest.raceStats } : this.generateRaceClassStats(rivalClassIndex)),
        raceClassIndex: index === 0 ? this.playerRaceClassIndex : rivalClassIndex,
        isBoss,
        raceSkill: index === 0 ? this.playerRaceSkill : guest && ['explosive_start','technical_run','second_wind','heavy_push','feather_dash','final_sprint'].includes(guest.raceSkill) ? guest.raceSkill : Phaser.Utils.Array.GetRandom(raceSkillIds)
      };
    });

    // Weight has a meaningful, continuous effect on race running speed.
    // Lightest (3 kg): +15%; midpoint (11.5 kg): neutral; heaviest (20 kg): -15%.
    // This changes race performance only; it never changes the gold payout.
    const raceWeight = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.weight) || 3, 3, 20);
    const weightProgress = (raceWeight - 3) / (20 - 3);
    this.playerWeightSpeedMultiplier = 1.15 - 0.30 * weightProgress;

    this.mainInputWasEnabled = this.mainScene && this.mainScene.input ? this.mainScene.input.enabled : true;
    if (this.mainScene && this.mainScene.input) this.mainScene.input.enabled = false;
    try { if (this.mainScene && this.mainScene.bgmSound && this.mainScene.bgmSound.isPlaying) this.mainScene.bgmSound.stop(); } catch (e) {}
    try { this.sound.getAllPlaying().forEach(sound => { if (sound.key && /bgm|music/i.test(sound.key) && sound.isPlaying) sound.stop(); }); } catch (e) {}

    const camera = this.cameras.main;
    camera.resetFX(); camera.setAlpha(1); camera.setViewport(0, 0, 640, 640);
    camera.setBounds(0, 0, 1920, 640); camera.setScroll(0, 0);
    const add = obj => { this.objects.push(obj); return obj; };
    const jockeyBox = (id, x, y, width, height) => MeguMenuLayouts.button(this, 'jockey', id, {x:x-width/2,y:y-height/2,width,height});
    this.jockeyBox = jockeyBox;
    this.jockeyHitbox = (object, box) => {
      const left = box.hitboxX ?? box.x, top = box.hitboxY ?? box.y;
      const width = box.hitboxWidth ?? box.width, height = box.hitboxHeight ?? box.height;
      const originLeft = object.x - object.displayOriginX;
      const originTop = object.y - object.displayOriginY;
      object.setInteractive(new Phaser.Geom.Rectangle(left-originLeft, top-originTop, width, height), Phaser.Geom.Rectangle.Contains, true);
      return object;
    };
    // Two independent camera-scroll layers create a subtle sense of depth:
    // RACE_01 (far layer) moves at 85% of the camera, while RACE_02
    // (near layer) stays at the full 100% race speed.
    add(this.add.image(0, 0, 'jockey-race-bg-far')
      .setOrigin(0, 0).setDisplaySize(1920, 640).setScrollFactor(0.85, 1).setDepth(0));
    add(this.add.image(0, 0, 'jockey-race-bg-near')
      .setOrigin(0, 0).setDisplaySize(1920, 640).setScrollFactor(1, 1).setDepth(1));

    // Fixed camera-space controls and countdown/results.
    const quitBox = jockeyBox('quit',590,590,92,76);
    this.quitButton = add(this.add.image(quitBox.x+quitBox.width/2, quitBox.y+quitBox.height/2, 'jockey-close').setDisplaySize(quitBox.width,quitBox.height).setScrollFactor(0).setDepth(100));
    this.quitButton.setInteractive({ useHandCursor: true });
    this.quitButton.on('pointerdown', () => this.quit());
    this.countText = add(this.add.text(320, 300, '3', { fontFamily: 'sans-serif', fontSize: '88px', color: '#ffffff', stroke: '#202020', strokeThickness: 9, fontStyle: 'bold' }).setOrigin(.5).setScrollFactor(0).setDepth(90));
    this.readyImage = add(this.add.image(320, 300, 'jockey-ready').setScrollFactor(0).setDepth(90).setVisible(false));
    this.goImage = add(this.add.image(320, 300, 'jockey-go').setScrollFactor(0).setDepth(90).setVisible(false));
    this.resultText = add(this.add.text(320, 320, '', { fontFamily: 'sans-serif', fontSize: '25px', color: '#ffffff', stroke: '#202020', strokeThickness: 6, fontStyle: 'bold', align: 'center', lineSpacing: 12, wordWrap: { width: 570 } }).setOrigin(.5).setScrollFactor(0).setDepth(95).setVisible(false));

    // One-use player skill button, available during the race when its timing window opens.
    this.boostButton = add(this.add.circle(50,590,50,0x555555).setStrokeStyle(1,0xffffff).setScrollFactor(0).setDepth(100).setVisible(false));
    this.boostButton.on('pointerdown', () => {
      const player = this.jockeys[0];
      if (!this.canActivateRaceSkill(player,this.playerRaceSkill,this.time.now) || this.playerBoostUsed) return;
      this.playerBoostUsed = true;
      this.markSkillButtonUsed();
      this.playSkillCutscene(player);
    });

    // Four runners occupy evenly spaced lanes. Feet are anchored to the lane Y.
    // The race starts one-third of a viewport in from the left edge.
    const laneYs = [630, 553.33, 476.67, 400];
    this.roster.forEach((entry, i) => {
      const texture = this.textures.get(entry.textureKey);
      if (!texture) { console.error('[Jockey] Missing Megu texture:', entry.id); return; }
      const framePrefix = entry.isBoss ? entry.shinyFramePrefix : (entry.framePrefix || entry.id);
      const laneDepth = 3 - i; // Lower screen lanes render in front of higher lanes.
      const renderer = new MeguRenderer(this, {
        atlasKey: entry.textureKey, framePrefix,
        x: 640 / 3 - 50, y: laneYs[i], originX: 0, originY: 1,
        depth: 10 + laneDepth, flipX: true,
        state: MeguRenderer.STATES.HAPPY,
        shadow: { widthRatio: 0.62, height: 9, yOffset: 3, color: 0x101010, alpha: 0.27 }
      });
      this.meguRenderers.push(renderer);
      const sprite = renderer.sprite;
      renderer.setScale(0.42);
      renderer.update(0, 0);
      const shadow = renderer.shadow;
      const label = add(this.add.text(0, 0, entry.name, { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#171717', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(.5, 1).setDepth(40 + laneDepth));
      const runnerMaxSpeed = 74;
      this.jockeys.push({ ...entry, renderer, sprite, shadow, label, laneY: laneYs[i], speed: 0, targetSpeed: 0, maxSpeed: runnerMaxSpeed, weightSpeedMultiplier: i === 0 ? this.playerWeightSpeedMultiplier : 1, speedChangeAt: 0, failureUntil: 0, finished: false, rank: 0, skillUsed: false, skillUntil: 0, skillMultiplier: 1, skillVisual: null, aiSkillUseAt: i === 0 ? 0 : (entry.raceSkill === 'explosive_start' ? Phaser.Math.Between(500, 2600) : entry.raceSkill === 'final_sprint' ? Phaser.Math.Between(17000, 19000) : Phaser.Math.Between(4500, 15500)) });
      this.positionJockeyLabel(this.jockeys[this.jockeys.length - 1]);
    });
    // Keep fixed lane-based rendering layers: runners nearer the bottom of
    // the screen are in front. Do not sort depth dynamically by race position.
    if (this.jockeys.length !== 4) {
      this.countText.setText('Could not load all four MEGU characters');
      console.error('[Jockey] Expected four loaded characters, got', this.jockeys.length);
      this.time.delayedCall(2500, () => this.quit());
      return;
    }


    try {
      this.music = this.sound.add('jockey-bgm', { loop: true, volume: Number(this.mainScene && this.mainScene.musicVolume != null ? this.mainScene.musicVolume : .5) });
      this.music.play();
    } catch (e) { console.warn('[Jockey] Could not play BGM_undokai.mp3', e); }

    this.createPredictionUI();
    this.events.once('shutdown', this.cleanup, this);
  }
  getRaceClassIndex(totalPoints) {
    const maxIndex = 9;
    return Phaser.Math.Clamp(Math.round((Number(totalPoints || 20) - 20) / 340 * maxIndex), 0, maxIndex);
  }
  generateRaceClassStats(classIndex) {
    const raceClass = this.raceClasses[Phaser.Math.Clamp(classIndex, 0, this.raceClasses.length - 1)];
    const progress = Phaser.Math.Clamp((raceClass.averageTotal - 20) / 340, 0, 1);
    // Keep the established +/-2..15 variation scale, but distribute each
    // class's exact point budget among the four stats so the class averages
    // remain true even near the 5/99 stat limits, with Watermelon capped at 360 total points.
    const maxVariation = Math.round(2 + progress * 13);
    const keys = ['power', 'agility', 'technique', 'endurance'];
    const base = Math.floor(raceClass.averageTotal / keys.length);
    const stats = Object.fromEntries(keys.map(key => [key, base]));
    let remainder = raceClass.averageTotal - base * keys.length;
    Phaser.Utils.Array.Shuffle([...keys]).slice(0, remainder).forEach(key => { stats[key] += 1; });
    const shuffledKeys = Phaser.Utils.Array.Shuffle([...keys]);
    for (let pair = 0; pair < 2; pair++) {
      const first = shuffledKeys[pair * 2];
      const second = shuffledKeys[pair * 2 + 1];
      const shift = Phaser.Math.Between(-maxVariation, maxVariation);
      const donor = shift >= 0 ? first : second;
      const receiver = shift >= 0 ? second : first;
      const amount = Math.min(Math.abs(shift), stats[donor] - 5, 99 - stats[receiver]);
      stats[donor] -= amount;
      stats[receiver] += amount;
    }
    return stats;
  }
  pickRaceGuestAssignments(classIndex) {
    if (this.bossRaceMode) return [null, null, null];
    const pool = Phaser.Utils.Array.Shuffle([...(this.guestRaceCandidates || [])].filter(guest => {
      const total = ['power','agility','technique','endurance'].reduce((sum,key) => sum + (Number(guest.sumoStats?.[key]) || 5), 0);
      return this.getRaceClassIndex(total) === classIndex;
    }));
    const used = new Set();
    return [1,2,3].map(() => {
      if (!pool.length || Phaser.Math.Between(1, 100) > 48) return null;
      const guest = pool.find(candidate => !used.has(candidate.userId));
      if (!guest) return null;
      used.add(guest.userId);
      return guest;
    });
  }
  buildRaceGuestFrames(entry) {
    const texture = this.textures.get(entry.textureKey);
    if (!texture) return null;
    const names = texture.getFrameNames();
    const prefix = entry.framePrefix || entry.id;
    const pick = suffixes => suffixes.map(suffix => names.find(n => n === `${prefix}_${suffix}-2x`) || names.find(n => n === `${prefix}_${suffix}`) || names.find(n => String(n).endsWith(`/${prefix}_${suffix}-2x`)) || names.find(n => String(n).endsWith(`/${prefix}_${suffix}`))).find(Boolean) || names[0];
    return { walk:[pick(['3']),pick(['4'])].filter(Boolean), stand:[pick(['5']),pick(['6'])].filter(Boolean), initial:pick(['11']), failure:pick(['9']), first:pick(['10']), second:pick(['11']), fourth:pick(['12']) };
  }
  selectRaceClass(classIndex) {
    if (this.bossRaceMode || this.raceStarted || this.ended || !this.availableRaceClassIndices.includes(classIndex)) return;
    this.selectedRaceClassIndex = classIndex;
    const guestAssignments = this.pickRaceGuestAssignments(classIndex);
    this.roster = this.roster.map((entry, index) => {
      if (index === 0) return { ...entry, raceClassIndex: this.playerRaceClassIndex, raceStats: { ...this.playerRaceStats } };
      const guest = guestAssignments[index - 1];
      if (guest) return { ...entry, id: `guest-${guest.userId}`, name: `${guest.petName} (${guest.username})`, originalName: entry.originalName, textureKey: guest.textureKey, framePrefix: guest.framePrefix, isGuest: true, guestUserId: guest.userId, raceStats: { ...guest.raceStats }, raceClassIndex: classIndex, raceSkill: ['explosive_start','technical_run','second_wind','heavy_push','feather_dash','final_sprint'].includes(guest.raceSkill) ? guest.raceSkill : 'technical_run' };
      return { ...entry, id: entry.originalId || entry.id, name: entry.originalName || entry.name, isGuest: false, guestUserId: null, textureKey: entry.normalTextureKey || entry.textureKey, framePrefix: entry.originalId || entry.id, isBoss: false, raceClassIndex: classIndex, raceStats: this.generateRaceClassStats(classIndex) };
    });
    this.roster.forEach((entry, index) => {
      if (this.jockeys[index]) {
        const jockey = this.jockeys[index];
        jockey.raceStats = { ...entry.raceStats };
        jockey.raceClassIndex = entry.raceClassIndex;
        jockey.raceSkill = entry.raceSkill || 'technical_run';
        jockey.name = entry.name;
        jockey.id = entry.id;
        jockey.isGuest = !!entry.isGuest;
        jockey.guestUserId = entry.guestUserId || null;
        jockey.isBoss = !!entry.isBoss;
        jockey.label.setText(entry.name);
        if (jockey.sprite.texture.key !== entry.textureKey) {
          const framePrefix = entry.isBoss ? entry.shinyFramePrefix : (entry.framePrefix || entry.id);
          if (jockey.renderer.setAtlas(entry.textureKey, framePrefix)) {
            jockey.renderer.setState(MeguRenderer.STATES.HAPPY);
          }
        }
      }
    });
    this.refreshRaceClassSelection();
    this.refreshPredictionLabels();
  }
  cycleRaceClass(direction) {
    if (this.bossRaceMode || this.raceStarted || this.ended) return;
    const nextClassIndex = this.selectedRaceClassIndex + direction;
    if (this.availableRaceClassIndices.includes(nextClassIndex)) this.selectRaceClass(nextClassIndex);
  }
  refreshRaceClassSelection() {
    if (!this.raceClassSelectionText || !this.raceClassInfoText) return;
    const selected = this.raceClasses[this.selectedRaceClassIndex];
    const playerClass = this.raceClasses[this.playerRaceClassIndex];
    this.raceClassSelectionText.setText(this.bossRaceMode ? 'WATERMELON CLASS' : selected.name.toUpperCase());
    this.raceClassInfoText.setText(this.bossRaceMode ? 'SHINY BOSS: 120 IN ALL STATS' : `Average ${selected.averageTotal} points  •  YOUR CLASS: ${playerClass.name.toUpperCase()}`);
    if (this.bossRaceMode) { this.raceClassPrevText?.setVisible(false); this.raceClassNextText?.setVisible(false); }
    const choiceColor = this.selectedRaceClassIndex > this.playerRaceClassIndex ? '#8b641c' : this.selectedRaceClassIndex < this.playerRaceClassIndex ? '#245b2a' : '#34495e';
    this.raceClassSelectionText.setStyle({ backgroundColor: choiceColor });
    this.raceClassPrevText?.setVisible(this.availableRaceClassIndices.includes(this.selectedRaceClassIndex - 1));
    this.raceClassNextText?.setVisible(this.availableRaceClassIndices.includes(this.selectedRaceClassIndex + 1));
  }
  rollRaceTargetSpeed(j, raceProgress = 0) {
    const stats = j && j.raceStats ? j.raceStats : { power: 5, agility: 5, technique: 5, endurance: 5 };
    const power = Phaser.Math.Clamp(Number(stats.power) || 5, 5, 120);
    const technique = Phaser.Math.Clamp(Number(stats.technique) || 5, 5, 120);
    const endurance = Phaser.Math.Clamp(Number(stats.endurance) || 5, 5, 120);
    const rawSpeed = Phaser.Math.Between(47, 74);
    const neutralSpeed = 60.5;
    let variation = rawSpeed - neutralSpeed;
    if (variation >= 0) {
      // Power creates stronger acceleration; Technique makes favorable
      // fluctuations more efficient.
      variation *= (0.8 + power / 200) * (0.9 + technique / 500);
    } else {
      // Technique smooths unfavorable fluctuations. Endurance becomes
      // increasingly valuable as the race progresses.
      const progress = Phaser.Math.Clamp(raceProgress, 0, 1);
      const techniqueDamping = 1 - technique / 400;
      const enduranceDamping = 1 - (endurance / 250) * (0.25 + 0.75 * progress);
      variation *= techniqueDamping * enduranceDamping;
      if (j.skillId === 'technical_run' && this.time && this.time.now < j.skillUntil) variation *= 0.65;
    }
    return Phaser.Math.Clamp(neutralSpeed + variation, 35, Number(j.maxSpeed) || 74);
  }
  positionJockeyLabel(j) {
    if (!j || !j.label || !j.sprite) return;
    const headY = j.laneY - j.sprite.displayHeight - 7;
    j.label.setPosition(j.sprite.x + j.sprite.displayWidth / 2, headY);
  }
  createPredictionUI() {
    this.predictions = [0, 1, 2];
    this.predictionObjects = [];
    const addUI = obj => { this.predictionObjects.push(obj); return obj; };
    const cfg = (id,x,y,w,h) => this.jockeyBox(id,x,y,w,h);
    const center = b => [b.x+b.width/2,b.y+b.height/2];
    const hit = (obj,b) => this.jockeyHitbox(obj,b);
    const prev = cfg('class_previous',170,185,42,40);
    const next = cfg('class_next',470,185,42,40);
    const skill = cfg('skill_selection',320,482,220,39);
    const startBox = cfg('start_race',320,548,180,44);
    addUI(this.add.rectangle(320, 320, 520, 500, 0x101820, .96).setScrollFactor(0).setDepth(110));
    addUI(this.add.rectangle(320, 320, 512, 492, 0x000000, 0).setStrokeStyle(3, 0xffffff, .9).setScrollFactor(0).setDepth(111));
    addUI(this.add.text(320, 100, this.bossRaceMode ? 'DAILY BOSS RACE' : 'CHOOSE YOUR RACE CLASS', { fontFamily: 'sans-serif', fontSize: '23px', color: '#ffffff', stroke: '#202020', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(.5).setScrollFactor(0).setDepth(112));
    addUI(this.add.text(320, 130, this.bossRaceMode ? 'Defeat the shiny boss and two Watermelon rivals' : 'Race against the class above, yours, or below', { fontFamily: 'sans-serif', fontSize: '13px', color: '#e5e5e5' }).setOrigin(.5).setScrollFactor(0).setDepth(112));
    this.raceClassPrevText = addUI(this.add.text(...center(prev), '◀', { fontFamily: 'sans-serif', fontSize: '24px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#34495e', padding: { left: 9, right: 9, top: 3, bottom: 3 } }).setOrigin(.5).setScrollFactor(0).setDepth(112).setInteractive({ useHandCursor: true }));
    hit(this.raceClassPrevText,prev);
    this.raceClassPrevText.on('pointerdown', () => this.cycleRaceClass(-1));
    this.raceClassSelectionText = addUI(this.add.text(320, 185, '', { fontFamily: 'sans-serif', fontSize: '21px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#34495e', padding: { left: 18, right: 18, top: 7, bottom: 7 } }).setOrigin(.5).setScrollFactor(0).setDepth(112));
    this.raceClassNextText = addUI(this.add.text(...center(next), '▶', { fontFamily: 'sans-serif', fontSize: '24px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#34495e', padding: { left: 9, right: 9, top: 3, bottom: 3 } }).setOrigin(.5).setScrollFactor(0).setDepth(112).setInteractive({ useHandCursor: true }));
    hit(this.raceClassNextText,next);
    this.raceClassNextText.on('pointerdown', () => this.cycleRaceClass(1));
    this.raceClassInfoText = addUI(this.add.text(320, 225, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffe66d' }).setOrigin(.5).setScrollFactor(0).setDepth(112));
    addUI(this.add.text(320, 280, 'PICK THE TOP 3 FINISHERS', { fontFamily: 'sans-serif', fontSize: '19px', color: '#ffffff', stroke: '#202020', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(.5).setScrollFactor(0).setDepth(112));
    addUI(this.add.text(320, 302, 'Tap a name to change your prediction', { fontFamily: 'sans-serif', fontSize: '12px', color: '#e5e5e5' }).setOrigin(.5).setScrollFactor(0).setDepth(112));
    this.predictionRows = [];
    const labels = ['1ST PLACE', '2ND PLACE', '3RD PLACE'];
    labels.forEach((label, slot) => {
      const row = cfg('prediction_'+(slot+1),300,332+slot*39,220,36);
      const y = row.y+row.height/2;
      addUI(this.add.text(105, y, label, { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffe66d', fontStyle: 'bold' }).setOrigin(0, .5).setScrollFactor(0).setDepth(112));
      const choice = addUI(this.add.text(...center(row), '', { fontFamily: 'sans-serif', fontSize: '17px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#34495e', padding: { left: 12, right: 12, top: 5, bottom: 5 } }).setOrigin(.5).setScrollFactor(0).setDepth(112).setInteractive({ useHandCursor: true }));
      hit(choice,row);
      choice.on('pointerdown', () => this.cyclePrediction(slot));
      this.predictionRows.push(choice);
    });
    addUI(this.add.text(320, 455, 'CHOOSE ONE RACE SKILL', { fontFamily: 'sans-serif', fontSize: '17px', color: '#9de7ff', fontStyle: 'bold' }).setOrigin(.5).setScrollFactor(0).setDepth(112));
    this.skillSelectionText = addUI(this.add.text(...center(skill), '', { fontFamily: 'sans-serif', fontSize: '17px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#245b2a', padding: { left: 16, right: 16, top: 6, bottom: 6 } }).setOrigin(.5).setScrollFactor(0).setDepth(112).setInteractive({ useHandCursor: true }));
    hit(this.skillSelectionText,skill);
    this.skillSelectionText.on('pointerdown', () => this.cycleRaceSkill());
    this.skillDescriptionText = addUI(this.add.text(320, 510, '', { fontFamily: 'sans-serif', fontSize: '11px', color: '#c7d2da' }).setOrigin(.5).setScrollFactor(0).setDepth(112));
    const start = addUI(this.add.text(...center(startBox), 'START RACE', { fontFamily: 'sans-serif', fontSize: '19px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#237a42', padding: { left: 26, right: 26, top: 7, bottom: 7 } }).setOrigin(.5).setScrollFactor(0).setDepth(112).setInteractive({ useHandCursor: true }));
    hit(start,startBox);
    start.on('pointerdown', () => this.confirmPredictions());
    this.refreshRaceClassSelection();
    if (this.bossRaceMode) { this.raceClassPrevText?.setVisible(false); this.raceClassNextText?.setVisible(false); }
    this.refreshPredictionLabels();
    this.refreshRaceSkillSelection();
    this.countText.setVisible(false);
  }
  cycleRaceSkill() {
    if (this.raceStarted || this.ended) return;
    const skills = ['explosive_start','technical_run','second_wind','heavy_push','feather_dash','final_sprint'];
    const current = Math.max(0, skills.indexOf(this.playerRaceSkill));
    this.playerRaceSkill = skills[(current + 1) % skills.length];
    GAME_ATTRIBUTES.race_skill = this.playerRaceSkill;
    save();
    this.refreshRaceSkillSelection();
  }
  refreshRaceSkillSelection() {
    if (!this.skillSelectionText) return;
    const names = { explosive_start: 'EXPLOSIVE START', technical_run: 'TECHNICAL RUN', second_wind: 'SECOND WIND', heavy_push: 'HEAVY PUSH', feather_dash: 'FEATHER DASH', final_sprint: 'FINAL SPRINT' };
    const descriptions = { explosive_start: 'Fast opening acceleration', technical_run: 'Smooths bad speed fluctuations', second_wind: 'Recovers speed mid-race', heavy_push: 'Powerful momentum burst', feather_dash: 'Quick lightweight dash', final_sprint: 'Strong boost in the final seconds' };
    this.skillSelectionText.setText(`${names[this.playerRaceSkill]}  ◀ ▶`);
    this.skillSelectionText.setStyle({ backgroundColor: this.playerRaceSkill === 'final_sprint' ? '#8b641c' : '#245b2a' });
    if (this.skillDescriptionText && this.skillDescriptionText.active) this.skillDescriptionText.setText(descriptions[this.playerRaceSkill] || '');
  }
  cyclePrediction(slot) {
    if (this.raceStarted || this.ended) return;
    const usedByOthers = new Set(this.predictions.filter((_, i) => i !== slot));
    let next = this.predictions[slot];
    for (let step = 1; step <= this.roster.length; step++) {
      const candidate = (this.predictions[slot] + step) % this.roster.length;
      if (!usedByOthers.has(candidate)) { next = candidate; break; }
    }
    this.predictions[slot] = next;
    this.refreshPredictionLabels();
  }
  refreshPredictionLabels() {
    if (!this.predictionRows) return;
    this.predictionRows.forEach((row, slot) => row.setText(this.roster[this.predictions[slot]].name));
  }
  confirmPredictions() {
    if (this.raceStarted || this.ended) return;
    this.predictionObjects.forEach(obj => obj.destroy());
    this.predictionObjects = [];
    this.predictionRows = null;
    this.countdownValue = 3;
    this.countText.setVisible(false);
    this.readyImage.setVisible(true);
    this.pulseReadyImage();
    this.countdownTimer = this.time.addEvent({ delay: 1000, repeat: 2, callback: () => {
      if (this.ended) return;
      this.countdownValue--;
      if (this.countdownValue > 0) this.pulseReadyImage();
      else this.startRace();
    }});
  }
  pulseReadyImage() {
    if (!this.readyImage || !this.readyImage.active) return;
    this.tweens.killTweensOf(this.readyImage);
    this.readyImage.setScale(1);
    this.tweens.add({
      targets: this.readyImage,
      scaleX: 0.82, scaleY: 0.82,
      duration: 220,
      ease: 'Sine.easeInOut',
      yoyo: true
    });
  }
  startRace() {
    if (this.ended || this.raceStarted) return;
    if (this.bossRaceMode) {
      const today = localCalendarDay();
      if (GAME_ATTRIBUTES.lastBossRaceDay === today) {
        this.mainScene?.showMeguMessage?.('You have already raced the Boss Race today.', false, 0, true);
        this.quit();
        return;
      }
      GAME_ATTRIBUTES.lastBossRaceDay = today;
      save();
    }
    this.raceStarted = true;
    this.countText.setVisible(false);
    if (this.readyImage?.active) { this.tweens.killTweensOf(this.readyImage); this.readyImage.setVisible(false).setScale(1); }
    if (this.goImage && this.goImage.active) this.goImage.setVisible(true);
    try { this.sound.play('jockey-start', { volume: Number(this.mainScene && this.mainScene.sfxVolume != null ? this.mainScene.sfxVolume : .7) }); } catch (e) {}
    this.jockeys.forEach(j => {
      // Hide all character names once the race begins. Finish-place labels
      // (1st/2nd/3rd/4th) are shown separately when runners finish.
      j.label.setVisible(false);
      j.speed = 0;
      j.targetSpeed = this.rollRaceTargetSpeed(j, 0);
      j.speedChangeAt = this.time.now + 3000;
      j.renderer.playAnimation('walking');
      j.renderer.setAnimationFrameDuration?.(150);
      j.skillUsed = false; j.skillUntil = 0; j.skillMultiplier = 1;
    });
    this.raceStartTime = this.time.now;
    this.cameraPanComplete = false;
    const r = this.jockeys[0].renderer;
    if (r.frames.happy) {
      this.boostButtonIcon = this.add.image(50,590,r.atlasKey,r.frames.happy).setScrollFactor(0).setDepth(101).setFlipX(r.sprite.flipX);
      this.boostButtonIcon.setScale(80 / Math.max(this.boostButtonIcon.width,this.boostButtonIcon.height));
      this.objects.push(this.boostButtonIcon);
    }
    this.boostButton.setVisible(true).setInteractive(new Phaser.Geom.Circle(50,50,50),Phaser.Geom.Circle.Contains,true);
    this.boostButton.setFillStyle(this.skillColor());
    this.cameraTween = this.tweens.add({ targets: this.cameras.main, scrollX: 1280, duration: 20000, ease: 'Linear', onComplete: () => { this.cameraTween = null; this.cameraPanComplete = true; this.maybeFinishRace(); } });
    this.time.delayedCall(700, () => {
      if (this.goImage && this.goImage.active) this.goImage.setVisible(false);
    });
  }
  skillColor() {
    return ({explosive_start:0xff7138,technical_run:0x45d9ff,second_wind:0x68e68b,heavy_push:0xd69a55,feather_dash:0x9beaff,final_sprint:0xffd83d})[this.playerRaceSkill] || 0x555555;
  }
  markSkillButtonUsed() {
    this.boostButton?.disableInteractive().setVisible(true).setFillStyle(0x777777, 1).setStrokeStyle(1, 0xaaaaaa);
    this.boostButtonIcon?.setVisible(true).setTint(0x999999).setAlpha(.65);
  }
  playSkillCutscene(player) {
    this.skillCutscene = true;
    const start = this.time.now;
    const camera = this.cameraTween;
    camera?.pause();
    const states = this.jockeys.map(j => [j.renderer,j.renderer.manualAnimation]);
    states.forEach(([r]) => { r.manualAnimation = true; });
    // Independent screen-space actor; never change the race runner's pose.
    const r = player.renderer;
    const walk = [r.frames.walking_1, r.frames.walking_2].filter(Boolean);
    const happy = r.frames.very_happy || r.frames.happy || r.sprite.frame.name;
    const actor = this.add.image(-180,320,r.atlasKey,walk[0] || happy)
      .setOrigin(.5).setScrollFactor(0).setDepth(112).setFlipX(r.sprite.flipX);
    const fit = frame => {
      actor.setFrame(frame);
      actor.setScale(320 / Math.max(actor.width,actor.height));
    };
    fit(walk[0] || happy);
    const shade = this.add.rectangle(320,320,640,640,0x000000,.42).setScrollFactor(0).setDepth(109);
    const flash = this.add.rectangle(320,320,640,640,0xffffff,.16).setScrollFactor(0).setDepth(113);
    // Screen-space manga action lines, behind the independent cutscene actor.
    const lines = this.add.graphics().setScrollFactor(0).setDepth(111);
    const color = this.skillColor();
    const drawLines = (radial, phase = 0) => {
      lines.clear();
      if (radial) {
        for (let i = 0; i < 48; i++) {
          const a = (i + .22 * Math.sin(i * 7)) * Math.PI / 24;
          const dx = Math.cos(a), dy = Math.sin(a);
          const outer = 340 / Math.max(Math.abs(dx), Math.abs(dy));
          const inner = 170 + (i * 37 % 65);
          const w = 3 + (i * 13 % 9);
          lines.fillStyle(i % 3 === 0 ? color : 0xffffff, .87);
          lines.fillTriangle(320 + dx * inner, 320 + dy * inner,
            320 + dx * outer - dy * w, 320 + dy * outer + dx * w,
            320 + dx * outer + dy * w, 320 + dy * outer - dx * w);
        }
      } else {
        for (let i = 0; i < 32; i++) {
          const y = 10 + i * 20;
          const x = ((i * 173 - phase * 2.8) % 900 + 900) % 900 - 130;
          const length = 85 + (i * 47 % 175);
          const w = 1 + (i * 7 % 4);
          lines.fillStyle(i % 3 === 0 ? color : 0xffffff, .78);
          lines.fillTriangle(x, y, x + length, y - w, x + length, y + w);
        }
      }
    };
    let radial = false;
    drawLines(false);
    const lineTimer = this.time.addEvent({delay: 32, loop: true, callback: () => {
      if (!radial && lines.active) drawLines(false, this.time.now - start);
    }});
    this.objects.push(actor,shade,flash,lines);
    this.tweens.add({targets:flash,alpha:0,duration:250});
    let frameIndex = 0;
    const run = this.time.addEvent({delay:65,loop:true,callback:()=>{
      if (walk.length) fit(walk[++frameIndex % walk.length]);
    }});
    this.tweens.add({targets:actor,x:320,duration:250,ease:'Cubic.Out',onComplete:()=>{
      run.paused = true;
      fit(happy);
      radial = true;
      drawLines(true);
      // Single fading reveal flash, stronger than the entrance.
      this.tweens.killTweensOf(flash);
      flash.setAlpha(.50);
      this.tweens.add({targets:flash,alpha:0,duration:320,ease:"Sine.Out"});
      const baseScale = actor.scaleX;
      actor.setScale(baseScale * 1.15);
      this.tweens.add({targets:actor,scaleX:baseScale,scaleY:baseScale,duration:220,ease:"Cubic.Out"});
      this.time.delayedCall(1000,()=>{
        if (this.ended || this.cleaned) return;
        fit(walk[0] || happy);
        run.paused = false;
        radial = false;
        drawLines(false, this.time.now - start);
        this.tweens.add({targets:actor,x:820,duration:250,ease:'Cubic.In'});
      });
    }});
    this.time.delayedCall(1500,()=>{
      if (this.ended || this.cleaned) return;
      run.remove(false);
      lineTimer.remove(false);
      this.tweens.killTweensOf(actor);
      [actor,shade,flash,lines].forEach(o=>o.destroy());
      const elapsed = this.time.now-start;
      this.raceStartTime += elapsed;
      this.jockeys.forEach(j=>{ for (const key of ['speedChangeAt','failureUntil','skillUntil']) if (j[key]>0) j[key]+=elapsed; });
      states.forEach(([r,manual])=>{r.manualAnimation=manual;});
      this.activateRaceSkill(player,this.playerRaceSkill,true);
      this.skillCutscene=false;
      camera?.resume();
    });
  }
  getRaceSkillName(skillId) {
    return ({ explosive_start: 'EXPLOSIVE START', technical_run: 'TECHNICAL RUN', second_wind: 'SECOND WIND', heavy_push: 'HEAVY PUSH', feather_dash: 'FEATHER DASH', final_sprint: 'FINAL SPRINT' })[skillId] || 'RACE SKILL';
  }
  canActivateRaceSkill(runner, skillId, time) {
    if (!runner || runner.finished || runner.skillUsed || !this.raceStarted || this.ended) return false;
    const elapsed = Math.max(0, time - this.raceStartTime);
    if (skillId === 'explosive_start') return elapsed <= 6500;
    if (skillId === 'final_sprint') return elapsed >= 16500 && elapsed <= 20500;
    return elapsed >= 1000;
  }
  activateRaceSkill(runner, skillId, isPlayer = false) {
    if (!runner || runner.skillUsed) return false;
    const stats = runner.raceStats || { power: 5, agility: 5, technique: 5, endurance: 5 };
    const power = Phaser.Math.Clamp(Number(stats.power) || 5, 5, 120);
    const agility = Phaser.Math.Clamp(Number(stats.agility) || 5, 5, 120);
    const technique = Phaser.Math.Clamp(Number(stats.technique) || 5, 5, 120);
    const endurance = Phaser.Math.Clamp(Number(stats.endurance) || 5, 5, 120);
    const weight = runner.index === 0 ? Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.weight) || 3, 3, 20) : Phaser.Math.Clamp(11.5 + (5 - (Number(stats.agility) || 5)) * 0.08, 3, 20);
    const weightProgress = (weight - 3) / 17;
    const effects = {
      // Race skills are deliberately modest: they provide a tactical edge,
      // but cannot erase a large stat gap or stack into a guaranteed upset.
      explosive_start: { duration: 1200, multiplier: 1.08 + power / 1200 + agility / 1800, color: 0xff7138, label: 'EXPLOSIVE START!', symbol: '!!' },
      technical_run: { duration: 2200, multiplier: 1.025 + technique / 2000, color: 0x45d9ff, label: 'TECHNICAL RUN!', symbol: '◎' },
      second_wind: { duration: 1800, multiplier: 1.05 + endurance / 1200, color: 0x68e68b, label: 'SECOND WIND!', symbol: '+' },
      heavy_push: { duration: 1400, multiplier: 1.05 + power / 1300 + weightProgress * 0.025, color: 0xd69a55, label: 'HEAVY PUSH!', symbol: '◆' },
      feather_dash: { duration: 1200, multiplier: 1.06 + agility / 1100 + (1 - weightProgress) * 0.03, color: 0x9beaff, label: 'FEATHER DASH!', symbol: '»' },
      final_sprint: { duration: 1000 + endurance * 3, multiplier: 1.04 + power / 2000 + endurance / 2500, color: 0xffd83d, label: 'FINAL SPRINT!', symbol: '★' }
    };
    const effect = effects[skillId];
    if (!effect) return false;
    runner.skillUsed = true;
    runner.skillId = skillId;
    runner.skillUntil = this.time.now + effect.duration;
    runner.skillMultiplier = effect.multiplier;
    // Second Wind restores only part of the current speed deficit; it is
    // not an instant catch-up. Explosive Start and Feather Dash rely on their
    // short multiplier instead of teleporting speed to a high fixed floor.
    if (skillId === 'second_wind') runner.speed += (runner.targetSpeed - runner.speed) * 0.15;
    this.showRaceSkillEffect(runner, effect, skillId);
    if (isPlayer) {
      this.markSkillButtonUsed();
    }
    return true;
  }
  showRaceSkillEffect(runner, effect, skillId) {
    const cx = runner.sprite.x + runner.sprite.displayWidth / 2;
    const cy = runner.laneY - runner.sprite.displayHeight / 2;
    const ring = this.add.ellipse(cx, cy, runner.sprite.displayWidth + 28, runner.sprite.displayHeight + 22, effect.color, skillId === 'second_wind' ? 0.2 : 0.13)
      .setStrokeStyle(skillId === 'technical_run' ? 3 : 5, effect.color, 0.95).setBlendMode(Phaser.BlendModes.ADD).setDepth(30 + (3 - runner.index));
    const inner = this.add.ellipse(cx, cy, runner.sprite.displayWidth + 8, runner.sprite.displayHeight + 8, effect.color, 0.08)
      .setStrokeStyle(2, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(30.1 + (3 - runner.index));
    const callout = this.add.text(cx, cy - runner.sprite.displayHeight - 18, `${effect.symbol} ${effect.label}`, {
      fontFamily: 'sans-serif', fontSize: skillId === 'technical_run' ? '13px' : '15px', color: `#${effect.color.toString(16).padStart(6, '0')}`,
      stroke: '#17202a', strokeThickness: 4, fontStyle: 'bold'
    }).setOrigin(.5).setDepth(60 + (3 - runner.index));
    this.objects.push(ring, inner, callout);
    runner.skillVisual = { ring, inner, callout, color: effect.color, kind: skillId };
    const ringTween = skillId === 'heavy_push' ? { scaleX: 1.65, scaleY: 0.65, alpha: 0, duration: 480 } :
      skillId === 'feather_dash' ? { scaleX: 1.55, scaleY: 1.25, alpha: 0.08, duration: 260 } :
      skillId === 'technical_run' ? { scaleX: 0.9, scaleY: 1.18, alpha: 0.32, duration: 360 } :
      { scaleX: 1.22, scaleY: 1.16, alpha: 0.42, duration: 230 };
    this.tweens.add({ targets: ring, ...ringTween, yoyo: true, repeat: skillId === 'technical_run' ? 8 : 2, ease: 'Sine.InOut' });
    this.tweens.add({ targets: inner, scaleX: 0.82, scaleY: 0.86, alpha: 0.3, duration: 180, yoyo: true, repeat: 4 });
    this.tweens.add({ targets: callout, y: callout.y - 25, alpha: 0, duration: 1100, ease: 'Cubic.Out', onComplete: () => { if (callout.active) callout.destroy(); } });
    if (skillId === 'explosive_start' || skillId === 'heavy_push' || skillId === 'final_sprint') {
      this.cameras.main.shake(skillId === 'heavy_push' ? 180 : 240, skillId === 'heavy_push' ? 0.006 : 0.009, true);
    }
    if (skillId === 'second_wind') {
      const plus = this.add.text(cx, cy - 18, '+', { fontFamily: 'sans-serif', fontSize: '44px', color: '#aaffbd', stroke: '#176c36', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(.5).setDepth(65 + (3 - runner.index));
      this.objects.push(plus);
      this.tweens.add({ targets: plus, y: plus.y - 55, alpha: 0, scale: 1.35, duration: 850, onComplete: () => { if (plus.active) plus.destroy(); } });
    }
    if (skillId === 'feather_dash') {
      for (let k = 0; k < 3; k++) {
        const streak = this.add.rectangle(cx - 35 - k * 13, cy + (k - 1) * 12, 34, 3, 0xc8f5ff, 0.9).setDepth(29 + (3 - runner.index));
        this.objects.push(streak);
        this.tweens.add({ targets: streak, x: streak.x - 55, alpha: 0, duration: 320 + k * 50, onComplete: () => { if (streak.active) streak.destroy(); } });
      }
    }
  }
  updateRaceSkillVisual(runner) {
    const visual = runner && runner.skillVisual;
    if (!visual) return;
    const cx = runner.sprite.x + runner.sprite.displayWidth / 2;
    const cy = runner.laneY - runner.sprite.displayHeight / 2;
    if (visual.ring && visual.ring.active) visual.ring.setPosition(cx, cy);
    if (visual.inner && visual.inner.active) visual.inner.setPosition(cx, cy);
    if (visual.callout && visual.callout.active && visual.callout.alpha > 0) visual.callout.setX(cx);
    if (this.time.now >= runner.skillUntil) {
      [visual.ring, visual.inner].forEach(obj => { if (obj && obj.active) obj.destroy(); });
      runner.skillVisual = null;
    }
  }
  maybeUseOpponentRaceSkill(runner, time) {
    if (!runner || runner.index === 0 || runner.skillUsed || runner.finished || !runner.raceSkill || time < this.raceStartTime + runner.aiSkillUseAt) return;
    const skill = runner.raceSkill;
    if (!this.canActivateRaceSkill(runner, skill, time)) return;
    this.activateRaceSkill(runner, skill, false);
  }
  activatePlayerBoostAura() {
    const player = this.jockeys[0];
    if (!player || !player.sprite) return;
    const cx = player.sprite.x + player.sprite.displayWidth / 2;
    const cy = player.laneY - player.sprite.displayHeight / 2;
    const depth = 30 + (3 - player.index);
    const outer = this.add.ellipse(cx, cy, player.sprite.displayWidth + 34, player.sprite.displayHeight + 28, 0xffd400, 0.18)
      .setStrokeStyle(4, 0xffe600, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
    const inner = this.add.ellipse(cx, cy, player.sprite.displayWidth + 18, player.sprite.displayHeight + 14, 0xfff176, 0.12)
      .setStrokeStyle(2, 0xffffff, 0.95).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 0.1);
    this.objects.push(outer, inner);
    this.playerBoostAura = { outer, inner };
    this.tweens.add({ targets: outer, scaleX: 1.16, scaleY: 1.12, alpha: 0.48, duration: 240, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.tweens.add({ targets: inner, scaleX: 0.88, scaleY: 0.9, alpha: 0.32, duration: 190, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }
  playBoostActivationEffects() {
    // Brief flash and camera impact make the button press feel dramatic.
    this.cameras.main.flash(220, 255, 255, 255);
    this.cameras.main.shake(260, 0.012, true);

    // Create a small spark texture locally; no additional asset is required.
    if (!this.textures.exists('jockey-boost-spark')) {
      const spark = this.make.graphics({ x: 0, y: 0, add: false });
      spark.fillStyle(0xffffff, 1);
      spark.fillCircle(8, 8, 7);
      spark.generateTexture('jockey-boost-spark', 16, 16);
      spark.destroy();
    }
    const player = this.jockeys[0];
    const burstX = player ? player.sprite.x + player.sprite.displayWidth / 2 : 320;
    const burstY = player ? player.laneY - player.sprite.displayHeight / 2 : 320;
    const burst = this.add.particles(burstX, burstY, 'jockey-boost-spark', {
      speed: { min: 150, max: 430 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 350, max: 700 },
      quantity: 28,
      blendMode: 'ADD',
      emitting: false
    }).setDepth(35);
    burst.explode(28);
    this.time.delayedCall(800, () => { if (burst && burst.active) burst.destroy(); });

    const flash = this.add.rectangle(320, 320, 640, 640, 0xffef8a, 0.62)
      .setScrollFactor(0).setDepth(108);
    this.tweens.add({ targets: flash, alpha: 0, duration: 320, ease: 'Cubic.Out', onComplete: () => flash.destroy() });

    const callout = this.add.text(320, 265, 'MEGU BOOST!!', {
      fontFamily: 'sans-serif', fontSize: '42px', color: '#fff36a',
      stroke: '#b52a18', strokeThickness: 10, fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(112).setScale(0.15).setAlpha(0);
    this.tweens.add({
      targets: callout, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out',
      yoyo: true, hold: 220, onComplete: () => callout.destroy()
    });
  }

  update(time, delta) {
    if (this.ended || this.skillCutscene) return;
    const playerRunner = this.jockeys && this.jockeys[0];
    if (playerRunner && this.mainScene && this.mainScene.syncAccessoryForSprite) {
      this.mainScene.syncAccessoryForSprite(this, playerRunner.sprite, 'playerAccessorySprite', (playerRunner.renderer.layer.depth || 3) + 0.03);
    }
    if (!this.raceStarted) {
      // Hold the dedicated ID{id}_11 pose throughout the countdown.
      return;
    }
    const dt = Math.min(0.05, Math.max(0, delta / 1000));
    const cameraLeft = this.cameras.main.scrollX;
    const cameraRight = cameraLeft + 640;
    const finishCandidates = [];
    this.jockeys.forEach(j => {
      if (j.finished) return;
      if (j.failureUntil > time) {
        if (j.renderer.state !== MeguRenderer.STATES.VERY_SAD) j.renderer.setState(MeguRenderer.STATES.VERY_SAD);
        this.positionJockeyLabel(j);
        return;
      }
      if (j.failureUntil && j.failureUntil <= time) {
        j.failureUntil = 0;
        j.renderer.playAnimation('walking');
      }
      this.maybeUseOpponentRaceSkill(j, time);
      if (j.skillUntil && time >= j.skillUntil) { j.skillUntil = 0; j.skillMultiplier = 1; j.skillId = ''; }
      if (!j.failureUntil && Math.random() < 0.0000025 * delta) {
        j.failureUntil = time + 2000;
        j.renderer.setState(MeguRenderer.STATES.VERY_SAD);
        return;
      }
      if (time >= j.speedChangeAt) {
        const raceProgress = Phaser.Math.Clamp((time - this.raceStartTime) / 20000, 0, 1);
        j.targetSpeed = this.rollRaceTargetSpeed(j, raceProgress);
        j.speedChangeAt = time + 3000;
      }
      // Give every runner an immediate 2x velocity for the first two seconds;
      // after that, return to the normal acceleration response.
      // The final three seconds retain the modest 1.3x sprint boost.
      const openingInstantSpeed = time < this.raceStartTime + 2000;
      if (openingInstantSpeed) j.speed = j.targetSpeed;
      else {
        const agility = Phaser.Math.Clamp(Number(j.raceStats && j.raceStats.agility) || 5, 5, 120);
        const responseRate = 1.2 * (0.65 + agility / 100 * 0.7);
        j.speed += (j.targetSpeed - j.speed) * Math.min(1, dt * responseRate);
      }
      const finalSprint = time >= this.raceStartTime + 17000;
      const playerBoostActive = j.index === 0 && time < this.playerBoostUntil;
      const speedMultiplier = openingInstantSpeed ? 2 : (finalSprint ? 1.3 : 1);
      // Normal target speeds are capped at 74 px/s. While the button boost
      // is active, the player's speed is fixed at 2x that maximum for 3s.
      const activeSkillMultiplier = j.skillUntil > time ? j.skillMultiplier : 1;
      const weightSpeedMultiplier = Number(j.weightSpeedMultiplier) || 1;
      const effectiveSpeed = (playerBoostActive ? j.maxSpeed * 2 : j.speed * speedMultiplier * activeSkillMultiplier) * weightSpeedMultiplier;
      const previousX = j.sprite.x;
      const nextX = previousX + effectiveSpeed * dt;
      // Keep runners in the moving viewport and never allow one to run ahead
      // of the camera's visible right edge.
      const minX = cameraLeft + 2;
      const spriteWidth = Math.max(24, j.sprite.displayWidth);
      const finishLeftX = 1900 - spriteWidth;
      const maxX = Math.min(finishLeftX, cameraRight - spriteWidth - 2);
      if (cameraRight >= 1900 && nextX >= finishLeftX && previousX < finishLeftX) {
        const distance = Math.max(0.0001, nextX - previousX);
        finishCandidates.push({ runner: j, fraction: Phaser.Math.Clamp((finishLeftX - previousX) / distance, 0, 1), finishLeftX });
      }
      j.renderer.setPosition(Phaser.Math.Clamp(nextX, minX, Math.max(minX, maxX)), j.laneY);
      this.positionJockeyLabel(j);
      this.updateRaceSkillVisual(j);
      // Preserve the previous speed-scaled cadence while the renderer owns
      // frame selection, blinking, and animation playback.
      const animationDuration = 150 * 85 / Math.max(1, effectiveSpeed);
      if (j.renderer.animationFrameDuration !== animationDuration) {
        j.renderer.setAnimationFrameDuration(animationDuration);
      }
    });
    // Show the equipped skill throughout its valid activation window.
    if (this.boostButton && this.boostButton.active && this.raceStarted && !this.playerBoostUsed) {
      const player = this.jockeys[0];
      const ready = this.canActivateRaceSkill(player, this.playerRaceSkill, time);
      this.boostButton.setVisible(ready || this.playerRaceSkill === 'final_sprint' && time < this.raceStartTime + 16500 || this.playerRaceSkill === 'explosive_start' && time < this.raceStartTime + 6500);
      this.boostButtonIcon?.setVisible(this.boostButton.visible).setAlpha(ready ? 1 : .45);
      this.boostButton.setFillStyle(this.skillColor(),ready ? .96 : .4);

    }
    // Keep the aura attached to the player's current world position. The
    // aura is a plain { outer, inner } object (not a Phaser Game Object), so
    // check its child objects rather than a nonexistent aura.active property.
    if (this.playerBoostAura) {
      const player = this.jockeys[0];
      const outer = this.playerBoostAura.outer;
      const inner = this.playerBoostAura.inner;
      if (player && player.sprite && !player.finished && time < this.playerBoostUntil && outer && outer.active && inner && inner.active) {
        const cx = player.sprite.x + player.sprite.displayWidth / 2;
        const cy = player.laneY - player.sprite.displayHeight / 2;
        outer.setPosition(cx, cy);
        inner.setPosition(cx, cy);
      } else {
        if (outer && outer.active) outer.destroy();
        if (inner && inner.active) inner.destroy();
        this.playerBoostAura = null;
      }
    }

    // Resolve finishers together, ordered by their interpolated crossing point
    // within this frame. This avoids lane/update-loop order deciding close finishes.
    finishCandidates.sort((a, b) => a.fraction - b.fraction);
    finishCandidates.forEach(candidate => {
      const j = candidate.runner;
      if (j.finished) return;
      j.renderer.setPosition(candidate.finishLeftX, j.laneY);
      j.finished = true;
      j.rank = this.finishOrder.length + 1;
      this.finishOrder.push(j);
      const ordinal = ['1st', '2nd', '3rd', '4th'][j.rank - 1];
      j.label.setText(ordinal).setVisible(true);
      this.positionJockeyLabel(j);
      if (this.finishOrder.length === 4) {
        try { this.sound.play('jockey-whistle', { volume: Number(this.mainScene && this.mainScene.sfxVolume != null ? this.mainScene.sfxVolume : .7) }); } catch (e) { console.warn('[Jockey] Could not play SE_whistle.wav', e); }
      }
      j.speed = 0;
      const resultState = j.rank === 1 ? MeguRenderer.STATES.VERY_HAPPY
        : (j.rank === 2 ? MeguRenderer.STATES.HAPPY
          : (j.rank === 3 ? MeguRenderer.STATES.WORRIED : MeguRenderer.STATES.VERY_SAD));
      j.renderer.setState(resultState);
    });
    this.maybeFinishRace();
  }
  maybeFinishRace() {
    if (this.ended || this.finishOrder.length !== 4 || !this.cameraPanComplete) return;
    this.finishRace();
  }
  finishRace() {
    if (this.ended) return;
    this.stressGameCompleted = true;
    this.ended = true;
    if (!this._normalHygieneCostApplied) { this._normalHygieneCostApplied = true; applyHygieneCost(30, this.mainScene); }
    if (this.boostButton) this.boostButton.setVisible(false);
    if (this.boostButtonIcon) this.boostButtonIcon.setVisible(false);
    // Refresh the limits from the currently selected MEGU before applying the
    // reduction, so a stale saved bound can never let weight fall below min_weight.
    const activeMeguDef = (this.mainScene && this.mainScene.characterDefs || [])[getCharacterIndex(this.mainScene && this.mainScene.characterDefs)] || {};
    const activeMinWeight = Number(activeMeguDef.min_weight);
    const activeMaxWeight = Number(activeMeguDef.max_weight);
    if (Number.isFinite(activeMinWeight)) GAME_ATTRIBUTES.min_weight = activeMinWeight;
    if (Number.isFinite(activeMaxWeight) && activeMaxWeight >= Number(GAME_ATTRIBUTES.min_weight)) GAME_ATTRIBUTES.max_weight = activeMaxWeight;
    // Completing a jockey race consumes 50% of current weight and 50% of max satiety.
    applyExerciseCost(Math.max(0, Number(GAME_ATTRIBUTES.weight) || 0) * 0.50, 0.50, this.mainScene);
    if (this.cameraTween) { this.cameraTween.stop(); this.cameraTween = null; }
    const top = this.finishOrder.slice(0, 3);
    const predicted = (this.predictions || []).map(index => this.roster[index]);
    const exactFirst = !!top[0] && !!predicted[0] && predicted[0].id === top[0].id;
    const exactSecond = exactFirst && !!top[1] && !!predicted[1] && predicted[1].id === top[1].id;
    const exactThird = exactSecond && !!top[2] && !!predicted[2] && predicted[2].id === top[2].id;
    const award = exactThird ? 'TRIFECTA!' : exactSecond ? 'EXACTA!' : exactFirst ? 'WIN!' : 'NO WIN';

    // A first-place finish grants a one-time +5 to every racing stat the first
    // time this MEGU wins in each regular race class. Boss Race is a separate
    // special event and does not unlock a regular class reward.
    const playerRunner = this.roster && this.roster[0];
    const playerWonRace = !!top[0] && !!playerRunner && top[0].id === playerRunner.id;
    let bossRaceTicketMessage = '';
    if (playerWonRace && this.bossRaceMode) {
      if (GAME_ATTRIBUTES.jockeyHonorBossAwarded !== true) {
        GAME_ATTRIBUTES.honorCompetitionBonus = Math.max(0, Number(GAME_ATTRIBUTES.honorCompetitionBonus) || 0) + 1000;
        GAME_ATTRIBUTES.jockeyHonorBossAwarded = true;
        bossRaceTicketMessage = '+1,000 HONOR: FIRST BOSS DEFEAT';
      }
      const wonGoldenTicket = Phaser.Math.Between(1, 10) === 1;
      if (wonGoldenTicket) {
        GAME_ATTRIBUTES.goldenFlightTicket = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.goldenFlightTicket) || 0)) + 1;
        bossRaceTicketMessage = `${bossRaceTicketMessage ? bossRaceTicketMessage + '\n' : ''}GOLDEN FLIGHT TICKET WON!`;
      } else {
        bossRaceTicketMessage = `${bossRaceTicketMessage ? bossRaceTicketMessage + '\n' : ''}NO GOLDEN FLIGHT TICKET (10% CHANCE)`;
      }
      save();
      this.mainScene?.updateMedicineHud?.();
    }
    if (playerWonRace && !this.bossRaceMode) {
      const classIndex = Phaser.Math.Clamp(Math.trunc(Number(this.selectedRaceClassIndex) || 0), 0, this.raceClasses.length - 1);
      const className = this.raceClasses[classIndex].name;
      const characterId = String(playerRunner.def && (playerRunner.def.logicalId || playerRunner.def.id) || playerRunner.id);
      const isShiny = GAME_ATTRIBUTES.shiny === true;
      const characterKey = `${characterId.toUpperCase()}:${isShiny ? 'shiny' : 'normal'}`;
      if (!GAME_ATTRIBUTES.raceClassWins || typeof GAME_ATTRIBUTES.raceClassWins !== 'object' || Array.isArray(GAME_ATTRIBUTES.raceClassWins)) GAME_ATTRIBUTES.raceClassWins = {};
      const wonClasses = Array.isArray(GAME_ATTRIBUTES.raceClassWins[characterKey]) ? GAME_ATTRIBUTES.raceClassWins[characterKey] : [];
      // Honor class conquests are account-wide and awarded only once per class.
      if (!Array.isArray(GAME_ATTRIBUTES.jockeyHonorClasses)) GAME_ATTRIBUTES.jockeyHonorClasses = [];
      if (!GAME_ATTRIBUTES.jockeyHonorClasses.includes(classIndex)) {
        GAME_ATTRIBUTES.jockeyHonorClasses.push(classIndex);
        GAME_ATTRIBUTES.honorCompetitionBonus = Math.max(0, Number(GAME_ATTRIBUTES.honorCompetitionBonus) || 0) + 500;
        this.firstClassWinMessage = `+500 HONOR: FIRST ${className.toUpperCase()} CLASS CONQUERED.`;
      }
      if (!wonClasses.includes(classIndex)) {
        const record = getSumoCharacterStatRecord(characterId, isShiny);
        for (const stat of ['agility', 'technique']) {
          record.stats[stat] = Phaser.Math.Clamp(Math.trunc(Number(record.stats[stat]) || 5) + 5, 5, getCharacterStatCap(stat, characterId, isShiny));
        }
        GAME_ATTRIBUTES.raceClassWins[characterKey] = [...wonClasses, classIndex];
        awardConsumableItem('voltamin', 1, this.mainScene);
        this.firstClassWinMessage = `${this.firstClassWinMessage ? this.firstClassWinMessage + ' ' : ''}First ${className} Class victory! +5 AGILITY & TECHNIQUE · +1 VOLTAMIN.`;
      }
      // The first Watermelon-class race victory grants one of every consumable.
      // This account-wide flag is independent of per-character stat rewards.
      if (classIndex === 9 && GAME_ATTRIBUTES.jockeyHonorTopClassAwarded !== true) {
        GAME_ATTRIBUTES.honorCompetitionBonus = Math.max(0, Number(GAME_ATTRIBUTES.honorCompetitionBonus) || 0) + 1000;
        GAME_ATTRIBUTES.jockeyHonorTopClassAwarded = true;
        this.firstClassWinMessage = `${this.firstClassWinMessage ? this.firstClassWinMessage + ' ' : ''}+1,000 HONOR: WATERMELON CLASS`;
      }
      if (classIndex === 9 && GAME_ATTRIBUTES.raceWatermelonConsumablesAwarded !== true) {
        awardOneOfEveryConsumableItem(this.mainScene);
        GAME_ATTRIBUTES.raceWatermelonConsumablesAwarded = true;
        this.firstClassWinMessage = `${this.firstClassWinMessage ? this.firstClassWinMessage + ' ' : ''}WATERMELON CLASS MILESTONE: +1 OF EVERY CONSUMABLE.`;
      }
      this.mainScene?.updateCurrentHonor?.();
      save();
    }
    if (playerWonRace && this.bossRaceMode) {
      this.mainScene?.updateCurrentHonor?.();
      save();
    }

    // The class base payout scales linearly from Cherry (1,000) to
    // Watermelon (20,000). Boss Race always uses a 40,000 base payout.
    const selectedClass = this.raceClasses[Phaser.Math.Clamp(this.selectedRaceClassIndex, 0, this.raceClasses.length - 1)];
    const classProgress = Phaser.Math.Clamp(((selectedClass && selectedClass.averageTotal) || 20) - 20, 0, 340) / 340;
    const basePayout = this.bossRaceMode ? 40000 : Math.round(1000 + 19000 * classProgress);
    const payoutMultiplier = exactThird ? 5 : exactSecond ? 2 : exactFirst ? 1 : 0;
    const payout = basePayout * payoutMultiplier;
    if (payout > 0) {
      if (this.mainScene && typeof this.mainScene.changeGold === 'function') this.mainScene.changeGold(payout);
      else { GAME_ATTRIBUTES.gold = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.gold) || 0)) + payout; save(); }
    }
    const payoutLine = payout > 0 ? `\n+${payout.toLocaleString('en-US')} GOLD` : '\nNO GOLD REWARD';
    const ticketLine = bossRaceTicketMessage ? `\n${bossRaceTicketMessage}` : '';
    const lines = top.map((j, i) => `${i + 1}. ${j.name}`).join('\n');
    this.resultText.setText(`${award}${payoutLine}${ticketLine}\n\nOFFICIAL RESULTS\n${lines}`).setVisible(true);
    this.resultTimer = this.time.delayedCall(5000, () => this.beginReturnSequence());
  }
  quit() { if (this.returned || this.ended) return; this.ended = true; this.beginReturnSequence(); }
  beginReturnSequence() {
    if (this.returned || this._returnSequenceStarted) return;
    this._returnSequenceStarted = true;
    this.ended = true;
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    try { if (this.cameras && this.cameras.main) this.cameras.main.fadeOut(650, 0, 0, 0); } catch (e) {}
    this.time.delayedCall(700, () => this.returnHome());
    this.returnFallbackTimer = setTimeout(() => this.returnHome(), 1100);
  }
  returnHome() {
    if (this.returned) return;
    this.returned = true;
    const manager = this.game && this.game.scene;
    const main = this.mainScene || (manager && manager.getScene('default'));
    let recoveryDone = false;
    let recoveryFallbackTimer = null;
    const recover = () => {
      if (recoveryDone) return;
      recoveryDone = true;
      if (recoveryFallbackTimer) { clearTimeout(recoveryFallbackTimer); recoveryFallbackTimer = null; }
      try {
        if (manager && main) {
          if (manager.isSleeping('default')) manager.wake('default');
          else if (manager.isPaused('default')) manager.resume('default');
          else if (!manager.isActive('default')) manager.start('default');
          if (main.time) main.time.paused = false;
          if (main.input) main.input.enabled = true;
          if (main.input && main.input.manager) main.input.manager.enabled = true;
          if (main.cameras && main.cameras.main) { main.cameras.main.resetFX(); main.cameras.main.setAlpha(1); }
          manager.bringToTop('default');
          if (main.bgmSound) { main.bgmSound.setVolume(main.musicVolume); if (!main.bgmSound.isPlaying) main.bgmSound.play(); }
          if (this.firstClassWinMessage && typeof main.showMeguMessage === 'function') {
            const message = this.firstClassWinMessage;
            this.firstClassWinMessage = '';
            if (main.time) main.time.delayedCall(450, () => main.showMeguMessage(message, false, 0, true));
            else main.showMeguMessage(message, false, 0, true);
          }
          if (this.stressGameCompleted && typeof main.completeStressAction === 'function' && main.time) main.time.delayedCall(350, () => main.completeStressAction('jockey'));
        }
      } catch (e) { console.error('[Jockey] Home recovery failed', e); }
    };
    this.events.once('shutdown', recover);
    this.cleanup();
    try { if (manager) manager.stop('JockeyMinigame'); } catch (e) { recover(); }
    if (!recoveryDone) {
      recoveryFallbackTimer = setTimeout(() => {
        try { if (manager && !manager.isActive('JockeyMinigame') && !manager.isSleeping('JockeyMinigame')) recover(); }
        catch (e) { recover(); }
      }, 400);
    }
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    this.ended = true;
    if (this.returnFallbackTimer) { clearTimeout(this.returnFallbackTimer); this.returnFallbackTimer = null; }
    if (this.cameraTween) { try { this.cameraTween.stop(); } catch (e) {} this.cameraTween = null; }
    if (this.countdownTimer) { try { this.countdownTimer.remove(false); } catch (e) {} this.countdownTimer = null; }
    if (this.resultTimer) { try { this.resultTimer.remove(false); } catch (e) {} this.resultTimer = null; }
    try { if (this.time) this.time.removeAllEvents(); } catch (e) {}
    try { if (this.tweens) this.tweens.killAll(); } catch (e) {}
    try { if (this.music) { this.music.stop(); this.music.destroy(); this.music = null; } } catch (e) {}
    try { if (this.input) this.input.enabled = false; } catch (e) {}
    (this.meguRenderers || []).forEach(renderer => { try { renderer.destroy(); } catch (e) {} });
    this.meguRenderers = [];
    (this.objects || []).forEach(o => { try { if (o && o.destroy) o.destroy(); } catch (e) {} });
    this.objects = []; this.jockeys = [];

    // Jockey-only assets live in Phaser's global texture/audio caches, not in
    // the scene. Remove every key owned by this minigame after its display
    // objects and sounds have been destroyed so decoded image/audio data can
    // be released. Do not touch shared MEGU atlases or other scene assets.
    try {
      const textureKeys = Object.keys((this.textures && this.textures.list) || {});
      textureKeys.forEach(key => {
        if (key.startsWith('jockey-') && this.textures.exists(key)) {
          try { this.textures.remove(key); } catch (e) { console.warn('[Jockey] Could not release texture:', key, e); }
        }
      });
    } catch (e) { console.warn('[Jockey] Texture cache cleanup failed', e); }
    try {
      const audioCache = this.cache && this.cache.audio;
      const audioEntries = audioCache && audioCache.entries;
      Object.keys(audioEntries || {}).forEach(key => {
        if (key.startsWith('jockey-')) {
          try { audioCache.remove(key); } catch (e) { console.warn('[Jockey] Could not release audio:', key, e); }
        }
      });
    } catch (e) { console.warn('[Jockey] Audio cache cleanup failed', e); }

    if (this.mainScene && this.mainScene.input) this.mainScene.input.enabled = true;
  }
}
