/* MeguStats: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    refreshLocalizedData() {
      const nameMap = rows => {
        const map = new Map();
        (rows || []).forEach(item => {
          if (!item || item.id == null) return;
          const entry = this.getLocalizedString(item.strings);
          if (!entry.name) return;
          const id = String(item.id).trim();
          [id.toLowerCase(), id.replace(/^0+/, '').toLowerCase(), id.replace(/\.(png|jpg|jpeg|webp)$/i, '').toLowerCase()].forEach(key => map.set(key, entry.name));
        });
        return map;
      };
      const recordMap = rows => {
        const map = new Map();
        (rows || []).forEach(item => {
          if (!item || item.id == null) return;
          const entry = this.getLocalizedString(item.strings);
          const record = { name: String(entry.name || ''), detail: String(entry.detail || '') };
          const rawId = String(item.id).trim();
          const digits = rawId.match(/\d+/);
          const keys = [rawId.toLowerCase(), rawId.replace(/^0+/, '').toLowerCase()];
          if (digits) { keys.push(String(Number(digits[0]))); keys.push('id' + Number(digits[0])); }
          keys.forEach(key => map.set(key, record));
        });
        return map;
      };
      const numericId = value => {
        const digits = String(value == null ? '' : value).match(/\d+/);
        return digits ? String(Number(digits[0])) : String(value == null ? '' : value).trim().toLowerCase();
      };
  
      this.backgroundNamesById = nameMap(this.backgroundDescriptionRows);
      this.characterNamesById = nameMap(this.meguDescriptionRows);
      this.backgroundRecordsById = recordMap(this.backgroundDescriptionRows);
      this.characterRecordsById = recordMap(this.meguDescriptionRows);
  
      this.furnitureNamesById = new Map();
      this.furnitureDetailsById = new Map();
      this.furnitureRecordsById = new Map();
      (this.furnitureDescriptionRows || []).forEach(item => {
        if (!item || item.id == null) return;
        const id = String(item.id).trim().toLowerCase();
        const entry = this.getLocalizedString(item.strings);
        const sourceRow = (this.furnitureDescriptionRows || []).find(row => String(row && row.id) === String(item.id));
        const jukeboxFlag = !!(sourceRow && (sourceRow.jukebox_flag === true || ['1', 'true', 'yes'].includes(String(sourceRow.jukebox_flag || '').trim().toLowerCase())));
        const boardFlag = !!(sourceRow && (sourceRow.board_flag === true || ['1', 'true', 'yes'].includes(String(sourceRow.board_flag || '').trim().toLowerCase())));
        const record = { id, name: entry.name || `KG${id}`, detail: entry.detail || '', jukeboxFlag, boardFlag };
        this.furnitureRecordsById.set(id, record);
        if (record.name) this.furnitureNamesById.set(id, record.name);
        if (record.detail) this.furnitureDetailsById.set(id, record.detail);
      });
      (this.furnitureDefs || []).forEach(item => {
        const record = this.furnitureRecordsById.get(String(item.id).trim().toLowerCase());
        item.name = record && record.name || `KG${item.id}`;
        item.detail = record && record.detail || '';
      });
  
      this.foodDescriptionById = new Map();
      (this.foodDescriptionRows || []).forEach(item => {
        if (!item || item.id == null) return;
        const id = numericId(item.id);
        const entry = this.getLocalizedString(item.strings);
        this.foodDescriptionById.set(id, { id, name: entry.name || `Food ${id}`, detail: entry.detail || '', classification: item.classification || '', nutrition: Number(item.nutrition) || 0, calorie: Number(item.calorie) || 0, exp: Number(item.exp) || 0, level: Number(item.level) || 0 });
      });
      (this.foodDefs || []).forEach(item => {
        const record = this.foodDescriptionById.get(numericId(item.id));
        if (record) { item.name = record.name; item.detail = record.detail; }
      });
      (this.backgroundMenuDefs || []).forEach(item => {
        const record = this.localizedRecord(this.backgroundRecordsById, item.id);
        item.name = record.name || `House ${item.id}`;
        item.detail = record.detail || '';
      });
      BG.forEach(item => {
        const record = this.localizedRecord(this.backgroundRecordsById, item.id);
        item.name = record.name || `House ${item.id}`;
        item.detail = record.detail || '';
      });
      (this.characterDefs || []).forEach(item => {
        const record = this.localizedRecord(this.characterRecordsById, item.id);
        if (record.name) item.name = record.name;
        else if (!item.name) item.name = item.id;
      });
      // Character metadata is stored in characterDefs; no legacy CH roster is needed.
  
      (this.charRowsUI || []).forEach(row => { row.renderedIndex = -1; });
      (this.bRowsUI || []).forEach(row => { row.renderedIndex = -1; });
      (this.fRowsUI || []).forEach(row => { row.renderedIndex = -1; });
      (this.foodRowsUI || []).forEach(row => { row.renderedIndex = -1; });
      if (this.menuOpen) this.updateCharacterMenu();
      if (this.bOpen) this.updateBackgroundMenu();
      if (this.fOpen) this.updateFurnitureMenu();
      if (this.foodOpen) this.updateFoodMenu();
    },
    toggleLanguage() {
      this.language = this.language === 'ja' ? 'en' : 'ja';
      try { localStorage.setItem('tama.language', this.language); } catch (e) {}
      if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = 'en';
      this.refreshLocalizedData();
      this.updateGameAttributeDisplay();
      this.fitFooterNameText(this.ownerNameText, GAME_ATTRIBUTES.userName || '');
      this.fitFooterNameText(this.petNameText, GAME_ATTRIBUTES.petName || '');
      if (this.languageButtonText) this.languageButtonText.setText(this.language === 'en' ? 'Switch to JA' : 'Switch to EN');
      if (this.volumeLabel) this.volumeLabel.setText(this.uiText('BGM volume'));
      if (this.sfxLabel) this.sfxLabel.setText(this.uiText('SFX volume'));
    },
    healthStatusText(value = GAME_ATTRIBUTES.health) {
      const entries = this.statsStringOptions && this.statsStringOptions.health || [];
      if (!entries.length) return String(value ?? '');
      const health = Phaser.Math.Clamp(Number(value) || 0, 0, 1000);
      // Divide the complete 0..1000 health range into one equal band per
      // description. With 13 entries, each entry covers roughly 1/13 of max
      // health; 1000 is explicitly clamped to the final entry.
      const index = Math.min(entries.length - 1, Math.floor((health / 1000) * entries.length));
      return entries[index];
    },
    baseStatsValuesForPage() {
      const a = this.currentGameAttributeSnapshot();
      if (this.baseStatsPage === 1) {
        const honorOptions = this.statsStringOptions && this.statsStringOptions.honor || [];
        const honorIndex = Phaser.Math.Clamp(Math.trunc(Number(GAME_ATTRIBUTES.honorSelectedIndex) || 0), 0, Math.max(0, honorOptions.length - 1));
        const honorTitle = honorOptions[honorIndex] || String(a.honor ?? '');
        return [`${a.satiety} / ${a.max_satiety}`, `${a.petName || 'MEGU'} ${a.age} days old`, String(a.satisfaction ?? ''), ` ${a.friendship} / ${a.max_friendship} `, String(a.petTypeName || a.petId || ''), String(honorTitle)];
      }
      const charge = Phaser.Math.Clamp(Math.trunc(Number(a.charge) || 0), 0, 3);
      const electricityByCharge = [0, 40, 80, 99];
      return [this.healthStatusText(a.health), `${electricityByCharge[charge]} W`, String(a.hobby ?? ''), String(a.myboom ?? ''), `${(Math.trunc((Number(a.weight) || 0) * 100) / 100).toFixed(2)} kgs`, String(a.stress || this.stressActionLabel(a.stressAction) || 'is bone lazy')];
    },
    refreshBaseStatsValues() {
      if (!this.baseStatsValueObjects || !this.baseStatsValueObjects.length) return;
      const values = this.baseStatsValuesForPage();
      this.baseStatsValueObjects.forEach((valueObject, index) => {
        valueObject.setText(values[index] ?? '');
        // Honor is the last value in the right column on stats page 2.
        // Keep the normal 24px font unless its rendered width exceeds 290px.
        if ((this.baseStatsPage === 1 && index === 5) || (this.baseStatsPage === 0 && index === 3)) {
          valueObject.setFontSize(24);
          if (valueObject.width > 290) {
            valueObject.setFontSize(24 * 290 / valueObject.width);
          }
        }
      });
    },
    initializeFriendshipProgress() {
      let level = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.level) || 0));
      let friendship = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.friendship) || 0));
      // The old save's 999999/999999 values were placeholders, not earned points.
      if (level === 1 && friendship === 999999 && Number(GAME_ATTRIBUTES.max_friendship) === 999999) friendship = 0;
      let requirement = this.getFriendshipRequirement(level);
      // Preserve legitimate saved overflow by resolving it against the loaded table.
      let safety = 0;
      while (friendship >= requirement && safety++ < 2000) {
        friendship -= requirement;
        level += 1;
        requirement = this.getFriendshipRequirement(level);
      }
      GAME_ATTRIBUTES.level = level;
      GAME_ATTRIBUTES.friendship = friendship;
      GAME_ATTRIBUTES.max_friendship = requirement;
      persistGameAttributes();
    },
    addFriendship(amount, source = 'interaction') {
      const gain = Math.max(0, Number(amount) || 0);
      if (!gain) return 0;
      const previousLevel = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.level) || 0));
      let level = previousLevel;
      let friendship = Math.max(0, Number(GAME_ATTRIBUTES.friendship) || 0) + gain;
      let requirement = this.getFriendshipRequirement(level);
      let levelsGained = 0;
      // Keep subtracting the current level's requirement so excess points carry
      // over and a large food reward can trigger several level-ups at once.
      while (friendship >= requirement && levelsGained < 2000) {
        friendship -= requirement;
        level += 1;
        levelsGained += 1;
        requirement = this.getFriendshipRequirement(level);
      }
      GAME_ATTRIBUTES.level = level;
      GAME_ATTRIBUTES.friendship = Math.max(0, Math.floor(friendship));
      GAME_ATTRIBUTES.max_friendship = requirement;
      this.updateGameAttributeDisplay();
      if (levelsGained > 0) {
        const levelUpRewards = [];
        let totalLevelUpGold = 0;
        for (let attainedLevel = previousLevel + 1; attainedLevel <= level; attainedLevel += 1) {
          totalLevelUpGold += Math.max(0, Math.trunc(Number(this.levelUpGoldByLevel && this.levelUpGoldByLevel.get(attainedLevel)) || 0));
        }
        if (totalLevelUpGold > 0) {
          this.changeGold(totalLevelUpGold);
          levelUpRewards.push({ type: 'gold', message: `you earned ${totalLevelUpGold.toLocaleString('en-US')} of gold as level up reward.` });
        }
  
        // Announce each catalogue item that became purchasable across all levels
        // crossed in this one friendship gain. Not-for-sale entries are excluded.
        const newlyUnlockedFoods = (this.foodDefs || []).filter(item => {
          const itemLevel = Math.max(0, Math.trunc(Number(item.level) || 0));
          const notSale = ['1', 'true', 'yes'].includes(String(item.not_sale == null ? '' : item.not_sale).trim().toLowerCase());
          return !notSale && itemLevel > previousLevel && itemLevel <= level;
        });
        newlyUnlockedFoods.forEach(item => {
          const name = String(item.name || `Food ${item.id}`);
          levelUpRewards.push({ type: 'food', item, message: `now you can buy ${name} at the food store.` });
        });
        const newlyUnlockedFurniture = (this.furnitureDefs || []).filter(item => {
          const itemLevel = Math.max(0, Math.trunc(Number(item.level) || 0));
          const notSale = ['1', 'true', 'yes'].includes(String(item.not_sale == null ? '' : item.not_sale).trim().toLowerCase());
          return !notSale && itemLevel > previousLevel && itemLevel <= level;
        });
        newlyUnlockedFurniture.forEach(item => {
          const name = String(item.name || `KG${item.id}`);
          levelUpRewards.push({ type: 'furniture', item, message: `now you can buy ${name} at the furniture store.` });
        });
        const newlyUnlockedHouses = (this.backgroundDescriptionRows || []).filter(item => {
          const itemLevel = Math.max(0, Math.trunc(Number(item && item.level) || 0));
          const notSale = ['1', 'true', 'yes'].includes(String(item && item.not_sale == null ? '' : item.not_sale).trim().toLowerCase());
          return item && item.id != null && !notSale && itemLevel > previousLevel && itemLevel <= level;
        });
        newlyUnlockedHouses.forEach(item => {
          const id = String(item.id).replace(/^ID/i, '').replace(/^0+/, '');
          const record = this.localizedRecord ? this.localizedRecord(this.backgroundRecordsById, id) : {};
          const name = record.name || `House ${id}`;
          levelUpRewards.push({ type: 'house', item: BG.find(entry => String(entry.id) === id) || { id, path: `assets/background/ID${id}@2x.png`, key: `room-background-${id}`, name }, message: `you unlocked ${name}.` });
        });
        if (levelUpRewards.length) this.showLevelUpRewardSequence(levelUpRewards);
        const levelUpBadge = this.add.image(this.pet.x, this.pet.y - 175, 'level-up-image')
          .setOrigin(0.5).setScale(0.5).setDepth(50);
        // Rise into position, remain fully visible for two seconds, then fade out.
        this.tweens.add({
          targets: levelUpBadge,
          y: levelUpBadge.y - 70,
          duration: 900,
          ease: 'Cubic.Out',
          onComplete: () => {
            if (!levelUpBadge.active) return;
            this.time.delayedCall(2000, () => {
              if (!levelUpBadge.active) return;
              this.tweens.add({
                targets: levelUpBadge,
                alpha: 0,
                duration: 350,
                onComplete: () => levelUpBadge.destroy()
              });
            });
          }
        });
        this.levelUpCelebrationUntil = this.time.now + 5000;
        if (this.audioUnlocked && this.cache.audio.exists('level-up-sfx')) {
          this.sound.play('level-up-sfx', { volume: this.sfxVolume });
        }
      }
      persistGameAttributes();
      return levelsGained;
    },
    updateCurrentMeguMaxFriendship() {
      const level = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.level) || 0));
      GAME_ATTRIBUTES.max_friendship = this.getFriendshipRequirement(level);
      GAME_ATTRIBUTES.friendship = Math.max(0, Math.floor(Number(GAME_ATTRIBUTES.friendship) || 0));
    },
    updateCurrentMeguMaxSatiety() {
      const activeMegu = (this.characterDefs || [])[getCharacterIndex(this.characterDefs)] || {};
      const characterSize = Number(activeMegu.character_size);
      if (!Number.isFinite(characterSize) || characterSize <= 0) return;
      const hungry = Phaser.Math.Clamp(Number(activeMegu.hungry) || 5, 1, 10);
      const currentLevel = Math.max(0, Number(GAME_ATTRIBUTES.level) || 0);
      // Max satiety scales with the active MEGU's size and hunger stat, plus level squared.
      const maxSatiety = Math.round(characterSize * 100 + Math.pow(currentLevel, 2) * hungry / 8);
      GAME_ATTRIBUTES.max_satiety = maxSatiety;
      if (GAME_ATTRIBUTES_IS_NEW_PLAYER) {
        GAME_ATTRIBUTES.satiety = Math.round(maxSatiety * 0.5);
        GAME_ATTRIBUTES_IS_NEW_PLAYER = false;
        persistGameAttributes();
      } else {
        GAME_ATTRIBUTES.satiety = Math.round(Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.satiety) || 0, 0, maxSatiety));
      }
    },
    updateCurrentHonor() {
      const level = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.level) || 0));
      const furnitureRows = Array.isArray(this.furnitureDescriptionRows) ? this.furnitureDescriptionRows : [];
      const furniturePricesById = new Map();
      furnitureRows.forEach(row => {
        if (!row || row.id == null) return;
        const id = String(row.id).trim().replace(/^0+/, '').toLowerCase();
        const price = Number(row.price);
        if (Number.isFinite(price)) furniturePricesById.set(id, price);
      });
      // Repeated copies of one furniture item contribute diminishing honor:
      // 100% for the first, 50% for the second, 25% for the third, and so on.
      const placedFurnitureIds = new Set();
      const furnitureOccurrenceCounts = new Map();
      const furniturePrice = (Array.isArray(GAME_ATTRIBUTES.furn) ? GAME_ATTRIBUTES.furn : [])
        .reduce((sum, object) => {
          if (!object || object.kind === 'food') return sum;
          const definition = this.getFurnitureDefinitionForObject(object);
          if (!definition || definition.id == null) return sum;
          const id = String(definition.id).trim().replace(/^0+/, '').toLowerCase();
          placedFurnitureIds.add(id);
          const occurrence = furnitureOccurrenceCounts.get(id) || 0;
          furnitureOccurrenceCounts.set(id, occurrence + 1);
          return sum + (furniturePricesById.get(id) || 0) * Math.pow(0.5, occurrence);
        }, 0);
  
      const houseRows = Array.isArray(this.backgroundDescriptionRows) ? this.backgroundDescriptionRows : [];
      const unlockedBackgroundIds = new Set((Array.isArray(GAME_ATTRIBUTES.unlocked_backgrounds) ? GAME_ATTRIBUTES.unlocked_backgrounds : []).map(id => String(id)));
      const unlockedComforts = houseRows
        .filter(row => row && row.id != null && unlockedBackgroundIds.has(String(row.id).replace(/^ID/i, '').replace(/^0+/, '')))
        .map(row => row && row.comfort != null ? Number(row.comfort) : NaN)
        .filter(Number.isFinite);
      // House honor contribution is the best comfort value among every house the
      // player has permanently unlocked, regardless of the currently equipped house.
      const maxHouseComfort = unlockedComforts.length ? Math.max(...unlockedComforts) : 0;
      const furnitureContribution = furniturePrice / 1000;
  
      // Match every layout bonus whose required furniture is present. A house
      // condition is optional; when supplied, it must match the active room ID.
      const bonusRoot = this.cache.json.get('layout-bonus');
      const bonusRows = bonusRoot && bonusRoot.application && Array.isArray(bonusRoot.application.layout_bonus)
        ? bonusRoot.application.layout_bonus : [];
      const activeBackground = BG[Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.bg) || 0, 0, Math.max(0, BG.length - 1))] || null;
      const activeHouseId = activeBackground ? String(activeBackground.id).trim().replace(/^0+/, '').toLowerCase() : '';
      const activeLayoutBonuses = [];
      let layoutBonusScore = 0;
      bonusRows.forEach((bonus, index) => {
        if (!bonus || !bonus.layout || typeof bonus.layout !== 'object') return;
        const requiredHouse = bonus.layout.house;
        const hasHouseCondition = requiredHouse != null && String(requiredHouse).trim() !== '';
        if (hasHouseCondition && String(requiredHouse).trim().replace(/^0+/, '').toLowerCase() !== activeHouseId) return;
        const requiredFurniture = Array.isArray(bonus.layout.furniture) ? bonus.layout.furniture : [];
        if (!hasHouseCondition && requiredFurniture.length === 0) return;
        const allFurniturePresent = requiredFurniture.every(id =>
          placedFurnitureIds.has(String(id).trim().replace(/^0+/, '').toLowerCase())
        );
        if (!allFurniturePresent) return;
        const score = Number(bonus.score);
        if (Number.isFinite(score)) layoutBonusScore += score;
        const localized = this.getLocalizedString(Array.isArray(bonus.strings) ? bonus.strings : []);
        const name = String(localized && localized.name || '').trim();
        if (name) activeLayoutBonuses.push({ index, name, score: Number.isFinite(score) ? score : 0 });
      });
  
      GAME_ATTRIBUTES.honorFurniturePrice = furnitureContribution;
      GAME_ATTRIBUTES.honorMaxHouseComfort = maxHouseComfort;
      GAME_ATTRIBUTES.honorLayoutBonus = layoutBonusScore;
      const ballTossHonor = Math.max(0, Number(GAME_ATTRIBUTES.ballTossMaxRecord) || 0) * 10;
      const jumpRopeHonor = Math.max(0, Number(GAME_ATTRIBUTES.jumpRopeMaxRecord) || 0) * 10;
      const competitionHonor = Math.max(0, Number(GAME_ATTRIBUTES.honorCompetitionBonus) || 0);
      GAME_ATTRIBUTES.honorBallTossRecord = ballTossHonor;
      GAME_ATTRIBUTES.honorJumpRopeRecord = jumpRopeHonor;
      GAME_ATTRIBUTES.honorCompetitionBonus = competitionHonor;
      GAME_ATTRIBUTES.honor = level * 150 + furnitureContribution + maxHouseComfort + layoutBonusScore + ballTossHonor + jumpRopeHonor + competitionHonor;
  
      // Standard Honor titles are unlocked in 500-point tiers. Active layout
      // bonus names are additional titles that can be selected while their set
      // remains placed in the room; they do not shift the standard tier indexes.
      const baseHonorOptions = this.baseHonorOptions || (this.statsStringOptions && this.statsStringOptions.honor) || [];
      const activeBonusNames = [...new Set(activeLayoutBonuses.map(item => item.name))];
      this.activeLayoutHonorTitles = activeBonusNames;
      if (this.statsStringOptions) this.statsStringOptions.honor = [...baseHonorOptions, ...activeBonusNames];
      if (baseHonorOptions.length) {
        const reachedIndex = Phaser.Math.Clamp(Math.floor(Math.max(0, GAME_ATTRIBUTES.honor) / 500), 0, baseHonorOptions.length - 1);
        const previousUnlocked = Phaser.Math.Clamp(Math.trunc(Number(GAME_ATTRIBUTES.honorUnlockedIndex) || 0), 0, baseHonorOptions.length - 1);
        GAME_ATTRIBUTES.honorUnlockedIndex = reachedIndex;
        const allHonorOptions = this.statsStringOptions.honor;
        const selectedIndex = Math.trunc(Number(GAME_ATTRIBUTES.honorSelectedIndex) || 0);
        // A newly reached standard tier is equipped automatically. A currently
        // selected set title stays equipped while that set remains active.
        if (reachedIndex > previousUnlocked) GAME_ATTRIBUTES.honorSelectedIndex = reachedIndex;
        else if (selectedIndex < baseHonorOptions.length && selectedIndex > reachedIndex) {
          GAME_ATTRIBUTES.honorSelectedIndex = reachedIndex;
        } else if (selectedIndex >= allHonorOptions.length) {
          GAME_ATTRIBUTES.honorSelectedIndex = reachedIndex;
        }
        GAME_ATTRIBUTES.honorSelectedIndex = Phaser.Math.Clamp(
          Math.trunc(Number(GAME_ATTRIBUTES.honorSelectedIndex) || 0), 0, Math.max(reachedIndex, allHonorOptions.length - 1)
        );
      }
      return GAME_ATTRIBUTES.honor;
    },
    updateGameAttributeDisplay() {
      GAME_ATTRIBUTES.max_health = 1000;
      GAME_ATTRIBUTES.health = Math.round(Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.health) || 0, 0, 1000));
      this.updateCurrentMeguMaxSatiety();
      this.updateCurrentMeguMaxFriendship();
      this.updateCurrentHonor();
      const a = this.currentGameAttributeSnapshot();
      const lastAccess = a.lastAccessed ? new Date(a.lastAccessed).toLocaleString() : '—';
      const lines = [
        `USER: ${a.userName || '—'}   PET: ${a.petName || '—'}   ID: ${a.petId}`,
        `BIRTHDAY: ${a.birthday}   AGE: ${a.age} day(s)`,
        `LAST ACCESSED: ${lastAccess}`,
        `HEALTH: ${a.health} / ${a.max_health}   MY BOOM: ${a.myboom || '—'}`,
        `LEVEL: ${a.level}   EXP: ${a.current_exp} / ${a.exp_for_lvlup}`,
        `ELECTRICITY: ${a.electricity}   WEIGHT: ${Number(a.weight).toFixed(2)}`,
        `HOBBY: ${a.hobby}`,
        `STRESS: ${a.stress}`,
        `SATIETY: ${a.satiety} / ${a.max_satiety}   FRIENDSHIP: ${a.friendship} / ${a.max_friendship}`,
        `CLEAN: ${Math.round(Number(GAME_ATTRIBUTES.clean) || 0)} / 100   HYGIENE: ${Math.round(Number(GAME_ATTRIBUTES.hygiene) || 0)} / 100`,
        `MEGU'S TYPE: ${a.petTypeName}`,
        `SATISFACTION: ${a.satisfaction}`,
        `HONOR: ${Number(a.honor).toFixed(2)}`
      ];
      if (this.gameAttributesText && this.gameAttributesText.active) this.gameAttributesText.setText(lines.join('\n'));
      this.refreshBaseStatsValues();
      if (this.updateTopStatusHud) this.updateTopStatusHud();
      if (this.updateVoltageIcon) this.updateVoltageIcon();
      persistGameAttributes();
    },
    applyCurrentMeguWeightBounds() {
      const def = (this.characterDefs || [])[getCharacterIndex(this.characterDefs)] || {};
      const minWeight = Number(def.min_weight);
      const maxWeight = Number(def.max_weight);
      if (Number.isFinite(minWeight)) GAME_ATTRIBUTES.min_weight = minWeight;
      if (Number.isFinite(maxWeight) && maxWeight > 0) GAME_ATTRIBUTES.max_weight = maxWeight;
      const min = Number(GAME_ATTRIBUTES.min_weight);
      const max = Number(GAME_ATTRIBUTES.max_weight);
      if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
        GAME_ATTRIBUTES.weight = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.weight) || min, min, max);
      }
      persistGameAttributes();
      this.updateGameAttributeDisplay();
    },
    playDailyChargeAnimation() {
      const textureKeys = ['daily-powercharge-0', 'daily-powercharge-1'];
      if (!textureKeys.every(key => this.textures.exists(key))) {
        console.warn('[MEGU] Daily charge animation textures are not loaded:', textureKeys);
        return;
      }
  
      // Clean up any interrupted/previous run before creating this sequence.
      const previous = this.dailyChargeAnimationRun;
      if (previous) previous.cleanup();
  
      // Center both overlays within the main 640x642 gameplay area.
      const chargeCenterX = W / 2;
      const chargeCenterY = PLAY_AREA_H / 2;
      const first = this.add.image(chargeCenterX, chargeCenterY, textureKeys[0])
        .setOrigin(0.5).setScale(1).setAlpha(0)
        .setScrollFactor(0).setDepth(10000);
      const second = this.add.image(chargeCenterX, chargeCenterY, textureKeys[1])
        .setOrigin(0.5).setScale(1).setAlpha(0)
        .setScrollFactor(0).setDepth(10001);
  
      const run = {
        images: [first, second],
        tweens: [],
        timers: [],
        finished: false,
        cleanup: null
      };
      const cleanup = () => {
        if (run.finished) return;
        run.finished = true;
        run.timers.forEach(timer => {
          if (timer && timer.remove) timer.remove(false);
          else if (timer && timer.destroy) timer.destroy();
        });
        run.tweens.forEach(tween => {
          if (tween && tween.stop) tween.stop();
        });
        this.tweens.killTweensOf(run.images);
        run.images.forEach(image => {
          if (image && image.active) image.destroy();
        });
        run.timers.length = 0;
        run.tweens.length = 0;
        run.images.length = 0;
        if (this.dailyChargeAnimationRun === run) this.dailyChargeAnimationRun = null;
      };
      run.cleanup = cleanup;
      this.dailyChargeAnimationRun = run;
  
      const delay = (duration, callback) => {
        const timer = this.time.delayedCall(duration, () => {
          run.timers = run.timers.filter(item => item !== timer);
          if (!run.finished) callback();
        });
        run.timers.push(timer);
      };
      const fade = (target, alpha, duration, onComplete) => {
        const tween = this.tweens.add({
          targets: target,
          alpha,
          duration,
          ease: 'Linear',
          onComplete: () => {
            run.tweens = run.tweens.filter(item => item !== tween);
            if (!run.finished && onComplete) onComplete();
          }
        });
        run.tweens.push(tween);
      };
  
      // 00 fades in and holds for 1.5s. Start 01's fade-in 75ms
      // before fading 00 out, creating a slightly staggered crossfade.
      fade(first, 1, 150, () => {
        delay(1500, () => {
          let completed = 0;
          const onCrossfadeComplete = () => {
            completed += 1;
            if (completed === 2) {
              delay(2000, () => fade(second, 0, 150, () => {
                const onComplete = run.onComplete;
                cleanup();
                if (onComplete) onComplete();
              }));
            }
          };
          fade(second, 1, 150, onCrossfadeComplete);
          delay(75, () => fade(first, 0, 150, onCrossfadeComplete));
        });
      });
  
      // Also release every timer, tween, and image if the scene is shut down.
      run.shutdownHandler = cleanup;
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    },
    startGameAttributeTracking() {
      // Set the first-access birthday only once; every launch refreshes lastAccessed.
      if (!GAME_ATTRIBUTES.birthday) GAME_ATTRIBUTES.birthday = localCalendarDay();
      const recordAccess = () => {
        const now = Date.now();
        const previous = Date.parse(GAME_ATTRIBUTES.lastAccessed || '');
        if (Number.isFinite(previous) && previous > 0 && now > previous) {
          const elapsedMs = now - previous;
          const maxSatiety = Math.max(0, Number(GAME_ATTRIBUTES.max_satiety) || 0);
          const activeMegu = (this.characterDefs || [])[getCharacterIndex(this.characterDefs)] || {};
          const hungry = Phaser.Math.Clamp(Number(activeMegu.hungry) || 5, 1, 10);
          // Preserve the existing MEGU-specific satiety depletion rate.
          const satietyDecayPerMs = (maxSatiety * 0.02 * hungry) / 3600000;
          const satietyBefore = Math.max(0, Number(GAME_ATTRIBUTES.satiety) || 0);
          const timeUntilEmpty = satietyDecayPerMs > 0 && satietyBefore > 0
            ? satietyBefore / satietyDecayPerMs : 0;
          const starvingMs = satietyBefore <= 0 ? elapsedMs : Math.max(0, elapsedMs - timeUntilEmpty);
          GAME_ATTRIBUTES.satiety = Math.max(0, Math.round(satietyBefore - elapsedMs * satietyDecayPerMs));
          // HEALTH drains by 2.5% of its maximum per hour, but only for the
          // portion of elapsed time during which satiety was actually at zero.
          if (starvingMs > 0) {
            const healthMax = 1000;
            const healthLoss = healthMax * 0.025 * (starvingMs / 3600000);
            GAME_ATTRIBUTES.health = Math.max(0, Math.round(Number(GAME_ATTRIBUTES.health) - healthLoss));
          }
        }
        const cleanPrevious = Date.parse(GAME_ATTRIBUTES.cleanLastUpdatedAt || '');
        if (Number.isFinite(cleanPrevious) && now > cleanPrevious) {
          const elapsedCleanMs = now - cleanPrevious;
          const cleanBefore = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.clean) || 0, 0, 100);
          const timeUntilDirty = cleanBefore > 0 ? cleanBefore / (100 / (18 * 3600000)) : 0;
          const dirtyMs = cleanBefore <= 0 ? elapsedCleanMs : Math.max(0, elapsedCleanMs - timeUntilDirty);
          GAME_ATTRIBUTES.clean = Math.max(0, Math.round(cleanBefore - (100 * elapsedCleanMs / (18 * 3600000))));
          if (dirtyMs > 0) {
            GAME_ATTRIBUTES.health = Math.max(0, Math.round(Number(GAME_ATTRIBUTES.health) - 1000 * 0.05 * (dirtyMs / 3600000)));
            GAME_ATTRIBUTES.hygiene = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.hygiene) - (100 * 2 * dirtyMs / 86400000), 0, 100);
          } else {
            GAME_ATTRIBUTES.hygiene = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.hygiene) - (100 * elapsedCleanMs / 86400000), 0, 100);
          }
        }
        GAME_ATTRIBUTES.cleanLastUpdatedAt = new Date(now).toISOString();
        GAME_ATTRIBUTES.hygieneLastUpdatedAt = new Date(now).toISOString();
        GAME_ATTRIBUTES.lastAccessed = new Date(now).toISOString();
        this.updateGameAttributeDisplay();
      };
      const checkDailyCharge = () => {
        // Do not award against the temporary local attributes while Supabase
        // is still loading the authenticated player's cloud save.
        if (typeof meguCloudReady !== 'undefined' && !meguCloudReady) return;
        const now = new Date();
        // One charge per local calendar day, beginning with the first login.
        // Disabling evolution must not block ordinary daily charging below 3.
        // At 3, hold the reward until evolution is enabled, rather than
        // consuming the day or awarding the evolution-triggering fourth charge.
        const today = localCalendarDay(now);
        if (GAME_ATTRIBUTES.lastDailyChargeDay === today) return;
        const currentCharge = Phaser.Math.Clamp(Math.trunc(Number(GAME_ATTRIBUTES.charge) || 0), 0, 4);
        if (GAME_ATTRIBUTES.allowEvolution === false && currentCharge >= 3) return;
        // At three charges, the natural daily reward MUST reach four and
        // start evolution. Only an already pending fourth charge blocks a
        // second daily award.
        if (currentCharge >= 4) {
          this.addEvolutionCharge(0); // Resume an interrupted evolution.
          return;
        }
        // Award first, then mark the day as claimed. Medicine has its own
        // capped path and must never be used for this daily reward.
        this.addEvolutionCharge(1);
        GAME_ATTRIBUTES.lastDailyChargeDay = today;
        persistGameAttributes();
      };
      const checkMyboomRotation = () => {
        const now = Date.now();
        const options = this.statsStringOptions && this.statsStringOptions.myboom || [];
        if (!options.length) return;
        const intervalMs = 6 * 60 * 60 * 1000;
        const nextChangeAt = Number(GAME_ATTRIBUTES.myboomNextChangeAt) || 0;
        if (!nextChangeAt || !Number.isFinite(nextChangeAt)) {
          if (!GAME_ATTRIBUTES.myboom || !options.includes(GAME_ATTRIBUTES.myboom)) {
            GAME_ATTRIBUTES.myboom = options[Math.floor(Math.random() * options.length)];
          }
          GAME_ATTRIBUTES.myboomNextChangeAt = now + intervalMs;
          this.updateGameAttributeDisplay();
          return;
        }
        if (now < nextChangeAt) return;
        // Keep the six-hour schedule anchored to wall-clock time across closed or suspended sessions.
        const periodsElapsed = Math.floor((now - nextChangeAt) / intervalMs) + 1;
        GAME_ATTRIBUTES.myboomNextChangeAt = nextChangeAt + periodsElapsed * intervalMs;
        if (options.length === 1) {
          GAME_ATTRIBUTES.myboom = options[0];
        } else {
          const alternatives = options.filter(option => option !== GAME_ATTRIBUTES.myboom);
          const pool = alternatives.length ? alternatives : options;
          GAME_ATTRIBUTES.myboom = pool[Math.floor(Math.random() * pool.length)];
        }
        this.updateGameAttributeDisplay();
      };
      const checkHobbyRotation = () => {
        const now = Date.now();
        const options = this.statsStringOptions && this.statsStringOptions.hobbies || [];
        if (!Number.isFinite(Number(GAME_ATTRIBUTES.hobbyNextChangeAt)) || Number(GAME_ATTRIBUTES.hobbyNextChangeAt) <= 0) {
          GAME_ATTRIBUTES.hobbyNextChangeAt = now + 30 * 60 * 1000;
          persistGameAttributes();
          return;
        }
        if (now < Number(GAME_ATTRIBUTES.hobbyNextChangeAt) || !options.length) return;
        // Keep the schedule anchored to real elapsed wall-clock time, even if the
        // browser was closed or suspended for one or more 30-minute periods.
        const periodsElapsed = Math.floor((now - Number(GAME_ATTRIBUTES.hobbyNextChangeAt)) / (30 * 60 * 1000)) + 1;
        GAME_ATTRIBUTES.hobbyNextChangeAt = Number(GAME_ATTRIBUTES.hobbyNextChangeAt) + periodsElapsed * 30 * 60 * 1000;
        if (options.length === 1) {
          GAME_ATTRIBUTES.hobby = options[0];
        } else {
          const alternatives = options.filter(option => option !== GAME_ATTRIBUTES.hobby);
          const pool = alternatives.length ? alternatives : options;
          GAME_ATTRIBUTES.hobby = pool[Math.floor(Math.random() * pool.length)];
        }
        this.updateGameAttributeDisplay();
      };
      // Charging Room can claim an unclaimed daily reward as soon as the
      // player enables charging, without waiting for the polling interval.
      this.checkDailyCharge = checkDailyCharge;
      // Expose wall-clock reconciliation so returning from a suspended tab can
      // catch up immediately instead of waiting for the next throttled interval.
      this.reconcileBackgroundTime = () => {
        recordAccess();
        checkDailyCharge();
        checkMyboomRotation();
        checkHobbyRotation();
      };
      this.reconcileBackgroundTime();
      if (this.gameAttributeInterval) clearInterval(this.gameAttributeInterval);
      if (this.hobbyRotationInterval) clearInterval(this.hobbyRotationInterval);
      this.gameAttributeInterval = setInterval(recordAccess, 60000);
      // Polling is only a wake-up mechanism; the decision uses Date.now(), not
      // accumulated timer ticks, so browser throttling does not shift the schedule.
      this.hobbyRotationInterval = setInterval(() => { checkDailyCharge(); checkMyboomRotation(); checkHobbyRotation(); }, 10000);
      this.events.once('shutdown', () => {
        if (this.gameAttributeInterval) clearInterval(this.gameAttributeInterval);
        if (this.hobbyRotationInterval) clearInterval(this.hobbyRotationInterval);
        this.gameAttributeInterval = null;
        this.hobbyRotationInterval = null;
      });
    },
    initializeBaseStatsPanel() {
      // Stats panel occupies y=644..844.
      this.baseStats = null;
      if (this.textures.exists('base-stats')) {
        this.baseStats = this.add.image(0, 644, 'base-stats')
          .setOrigin(0, 0).setDisplaySize(W, 200).setDepth(5.9);
      }
      // Live Phaser text layered over the stats artwork (the artwork supplies
      // only the background panels; all lettering is rendered as text objects).
      this.baseStatsTextObjects = [];
      this.baseStatsHeadingObjects = [];
      this.baseStatsValueObjects = [];
      this.baseStatsPage = 0;
      if (this.baseStats) {
        const statsColumns = [
          { x: 8, rows: [
            { y: 0, label: 'HEALTH', value: 'Doing great' },
            { y: 58, label: 'ELECTRICITY', value: '12 W' },
            { y: 116, label: 'HOBBY', value: 'Chasing toys' }
          ]},
          // Right-column headings share the box's left edge, shifted 2px left.
          { x: 324, rows: [
            { y: 0, label: 'MY BOOM', value: '...' },
            { y: 58, label: 'WEIGHT', value: '8.20 kg' },
            { y: 116, label: 'STRESS', value: 'Perfectly relaxed.' }
          ]}
        ];
        for (const column of statsColumns) {
          for (const row of column.rows) {
            const heading = this.add.text(column.x, 644 + row.y, row.label, {
              fontFamily: 'Arial, sans-serif', fontSize: '26px', color: '#FFF600',
              stroke: '#806F5A', strokeThickness: 8, padding: { x: 1, y: 0 }
            }).setOrigin(0, 0).setDepth(6.01);
            const valueX = column.x + (column.x > 300 ? 7 : 4);
            const value = this.add.text(valueX, 644 + row.y + 31, row.value, {
              fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#FFFFFF',
              padding: { x: 1, y: 0 }
            }).setOrigin(0, 0).setDepth(6.01);
            this.baseStatsHeadingObjects.push(heading);
            this.baseStatsValueObjects.push(value);
            this.baseStatsTextObjects.push(heading, value);
          }
        }
        // The second stats page reuses the same panel and value positions; only
        // the six category headings change. Swipe horizontally across the panel
        // to switch pages without interfering with the room or bottom-bar UI.
        const alternateLabels = ['SATIETY', 'AGE', 'SATISFACTION', 'FRIENDSHIP', "MEGU'S TYPE", 'HONOR'];
        // Small white pagination dots centered near the bottom of the stats panel.
        // The current page is shown by the larger, fully opaque dot.
        this.baseStatsPageDots = [
          this.add.circle(W / 2 - 10, 829, 4, 0xFFFFFF, 1).setDepth(6.02),
          this.add.circle(W / 2 + 10, 829, 4, 0xFFFFFF, 1).setDepth(6.02)
        ];
        const updateBaseStatsPageDots = () => {
          this.baseStatsPageDots.forEach((dot, index) => {
            const active = index === this.baseStatsPage;
            dot.setScale(active ? 1.25 : 0.75).setAlpha(active ? 1 : 0.5);
          });
        };
        updateBaseStatsPageDots();
        this.baseStatsSwipeStart = null;
        this.input.on('pointerdown', pointer => {
          if (this.chargingRoomActive || this.chargingRoomClosing || this.gymActive || this.gymClosing || this.messageBoardUi || this.visitingHouse || this.friendHouseTransition) { this.baseStatsSwipeStart = null; return; }
          if (pointer.y >= 644 && pointer.y <= 844 && !this.footerMenuOpen && !this.editMode) {
            this.baseStatsSwipeStart = { x: pointer.x, y: pointer.y, id: pointer.id };
          } else {
            this.baseStatsSwipeStart = null;
          }
        });
        this.input.on('pointerup', pointer => {
          if (this.chargingRoomActive || this.chargingRoomClosing || this.gymActive || this.gymClosing || this.messageBoardUi || this.visitingHouse || this.friendHouseTransition) { this.baseStatsSwipeStart = null; return; }
          const start = this.baseStatsSwipeStart;
          this.baseStatsSwipeStart = null;
          if (!start || (start.id !== undefined && pointer.id !== undefined && start.id !== pointer.id)) return;
          const dx = pointer.x - start.x;
          const dy = pointer.y - start.y;
          // Handle stats-cell taps centrally rather than relying on a separate
          // Phaser zone, which can lose pointer events to overlapping game objects.
          // The lower-left cell is Hobby on page 1 and Satisfaction on page 2.
          const isTap = Math.abs(dx) < 22 && Math.abs(dy) < 22;
          const isUpperRightCell = start.x >= W / 2 && start.x <= W && start.y >= 644 && start.y < 702;
          const isLowerLeftCell = start.x >= 0 && start.x < W / 2 && start.y >= 760 && start.y <= 844;
          const isLowerRightCell = start.x >= W / 2 && start.x <= W && start.y >= 760 && start.y <= 844;
          if (isTap && !this.footerMenuOpen && !this.editMode && !this.statsStringPickerObjects) {
            if (isUpperRightCell && this.baseStatsPage === 0) {
              this.openStatsStringPicker('myboom', 'myboom', 'Choose your MY BOOM');
              return;
            }
            if (isLowerLeftCell) {
              if (this.baseStatsPage === 0) {
                this.openStatsStringPicker('hobby', 'hobbies', 'Choose a hobby');
              } else {
                this.openStatsStringPicker('satisfaction', 'ikigai', 'Choose a satisfaction');
              }
              return;
            }
            if (isLowerRightCell && this.baseStatsPage === 1) {
              this.openStatsStringPicker('honorSelectedIndex', 'honor', 'Choose an honor');
              return;
            }
          }
          if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
          this.baseStatsPage = dx < 0 ? 1 : 0;
          updateBaseStatsPageDots();
          this.baseStatsHeadingObjects.forEach((heading, index) => {
            const originalLabels = ['HEALTH', 'ELECTRICITY', 'HOBBY', 'MY BOOM', 'WEIGHT', 'STRESS'];
            heading.setText(this.baseStatsPage === 1 ? alternateLabels[index] : originalLabels[index]);
          });
          this.refreshBaseStatsValues();
        });
        this.input.on('pointerupoutside', () => { this.baseStatsSwipeStart = null; });
        this.refreshBaseStatsValues();
        // Lower-left stats-cell taps are handled by the stats panel pointerup listener above.
        // Honor title is selectable up to the highest title unlocked by the calculated score.
      }
    },
});
