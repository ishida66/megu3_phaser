/* ===== Merged from MeguProgressionSetup.js ===== */
// Extracted from Main.create(); initialization order is preserved at each call site.
Object.assign(Main.prototype, {
  initializeLevelProgressionData() {
      const levelTableRoot = this.cache.json.get('level-table') || {};
      const levelTableData = levelTableRoot.application && levelTableRoot.application.level_table;
      this.levelFriendshipTable = {};
      if (levelTableData && typeof levelTableData === 'object' && !Array.isArray(levelTableData)) {
        Object.entries(levelTableData).forEach(([level, requirement]) => {
          const key = String(Math.max(0, Math.trunc(Number(level))));
          const value = Math.max(1, Math.round(Number(requirement)));
          if (Number.isFinite(Number(level)) && Number.isFinite(Number(requirement)) && Number(level) >= 1 && value > 0) this.levelFriendshipTable[key] = value;
        });
      }
      if (!Object.keys(this.levelFriendshipTable).length) {
        console.warn(`[MEGU] Could not read application.level_table from ${ART.levelTable}; using the observed 4 × level² curve as a fallback.`);
      }
      const levelUpBonusRoot = this.cache.json.get('levelup-bonus') || {};
      const levelUpBonusRows = levelUpBonusRoot.application && Array.isArray(levelUpBonusRoot.application.levelup_bonus)
        ? levelUpBonusRoot.application.levelup_bonus : [];
      this.levelUpGoldByLevel = new Map();
      levelUpBonusRows.forEach(row => {
        if (!row || row.level == null) return;
        const level = Math.trunc(Number(row.level));
        const gold = Math.max(0, Math.trunc(Number(row.gold) || 0));
        if (Number.isFinite(level) && level >= 0) this.levelUpGoldByLevel.set(level, gold);
      });
      if (!levelUpBonusRows.length) console.warn(`[MEGU] Could not read application.levelup_bonus from ${ART.levelUpBonus}.`);
      this.initializeFriendshipProgress();
  }
});

/* ===== Merged from MeguStatsInteractions.js ===== */
/* MeguStatsInteractions: stress actions, editable stats strings, and attribute helpers. */
Object.assign(Main.prototype, {
    stressActionLabel(action = GAME_ATTRIBUTES.stressAction) {
      const labels = { pet8:'Get petted 8 times', eat:'Eat', bath:'Take a bath', buyFurniture:'Buy new furniture', sumo:'Play sumo', jumpRope:'Jump rope', ballToss:'Play ball toss', jockey:'Race in jockey', inviteFriend:'Invite a friend', visitFriend:'Visit a friend house' };
      return labels[action] || '';
    },
    ensureStressAssignment() {
      const now = Date.now();
      if ((Number(GAME_ATTRIBUTES.stressNextAt) || 0) > now) return;
      const actions = ['pet8','eat','bath','buyFurniture','sumo','jumpRope','ballToss','jockey','inviteFriend','visitFriend'];
      const previous = String(GAME_ATTRIBUTES.stressAction || '');
      let next = Phaser.Utils.Array.GetRandom(actions);
      if (next === previous) next = Phaser.Utils.Array.GetRandom(actions.filter(action => action !== previous));
      GAME_ATTRIBUTES.stressAction = next;
      GAME_ATTRIBUTES.stress = this.stressActionLabel(next);
      GAME_ATTRIBUTES.stressPetCount = 0;
      GAME_ATTRIBUTES.stressNextAt = now + 3600000;
      this.refreshBaseStatsValues(); save();
    },
    consumeStressAction(action) {
      if (String(GAME_ATTRIBUTES.stressAction || '') !== action) return 0;
      const maxFriendship = Math.max(0, Number(GAME_ATTRIBUTES.max_friendship) || this.getFriendshipRequirement(GAME_ATTRIBUTES.level));
      const bonus = Math.max(1, Math.round(maxFriendship * 0.30));
      GAME_ATTRIBUTES.stressAction = ''; GAME_ATTRIBUTES.stress = ''; GAME_ATTRIBUTES.stressPetCount = 0;
      this.refreshBaseStatsValues(); save(); return bonus;
    },
    completeStressAction(action) {
      if (this.stressCelebrationActive) return false;
      const bonus = this.consumeStressAction(action); if (!bonus) return false;
      this.addFriendship(bonus, 'stress'); this.beginStressCelebration(bonus); return true;
    },
    beginStressCelebration(reward, heartKey = null) {
      if (this.stressCelebrationActive) return;
      const gain = Math.max(0, Math.trunc(Number(reward) || 0));
      this.stressCelebrationActive = true; this.stressPreviousMovementStopped = !!this.movementStopped;
      this.movementStopped = true; this.wander = false; this.clickMoveActive = false;
      if (this.pet && this.target) { this.target.x = this.pet.x; this.target.y = this.pet.y; }
      if (this.pettingActive) this.endPetting();
      const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
      const atlasKey = activeDef ? meguTextureKey(activeDef.id, GAME_ATTRIBUTES.shiny === true) : 'ID1';
      const atlas = this.textures.exists(atlasKey) ? this.textures.get(atlasKey) : null;
      this.petClickFrame = atlas ? ([`${atlasKey}_10-2x`, `${atlasKey}_10`].find(frame => atlas.has(frame)) || null) : null;
      this.petClickUntil = this.time.now + 3000; this.joyUntil = this.time.now + 3000;
      this.popHeart(heartKey, gain);
      const idDigits = String(atlasKey).match(/\d+/); const meguId = idDigits ? String(Number(idDigits[0])) : '';
      const meguSize = this.meguSizesById && this.meguSizesById.get(meguId) || '1';
      const happySound = meguSize === '3' ? this.happySound3 : meguSize === '2' ? this.happySound2 : this.happySound1;
      (this.meguVoiceSounds || []).forEach(sound => { if (sound && sound.isPlaying) sound.stop(); });
      [this.happySound1, this.happySound2, this.happySound3].forEach(sound => { if (sound && sound.isPlaying) sound.stop(); });
      if (this.audioUnlocked && happySound) { happySound.setVolume(this.sfxVolume); happySound.play(); }
      this.stressPreviousInputEnabled = !this.input || this.input.enabled !== false;
      this.stressPreviousKeyboardEnabled = !this.input || !this.input.keyboard || this.input.keyboard.enabled !== false;
      if (this.input) this.input.enabled = false;
      if (this.input && this.input.keyboard) this.input.keyboard.enabled = false;
      if (this.stressCelebrationTimer) this.stressCelebrationTimer.remove(false);
      this.stressCelebrationTimer = this.time.delayedCall(3000, () => {
        this.stressCelebrationTimer = null; this.stressCelebrationActive = false;
        this.movementStopped = this.stressPreviousMovementStopped;
        if (this.input) this.input.enabled = this.stressPreviousInputEnabled;
        if (this.input && this.input.keyboard) this.input.keyboard.enabled = this.stressPreviousKeyboardEnabled;
        this.petClickUntil = 0; this.petClickFrame = null; this.joyUntil = 0;
        this.nextMoveStepAt = this.time.now + 500;
      });
      save();
    },
    extractMessageOptions(data, listKey) {
      const root = data && data.application && typeof data.application === 'object'
        ? data.application : (data || {});
      const source = root[listKey];
      const values = [];
      const wanted = this.language === 'ja' ? 'ja' : 'en';
      const add = (value, depth = 0) => {
        if (depth > 8 || value == null) return;
        if (typeof value === 'string') {
          const cleaned = value.trim();
          if (cleaned) values.push(cleaned);
          return;
        }
        if (Array.isArray(value)) {
          // A strings array may itself contain localized { _lang, ... } records.
          if (value.some(item => item && typeof item === 'object' && item._lang)) {
            const chosen = value.find(item => item && String(item._lang).toLowerCase() === wanted)
              || value.find(item => item && String(item._lang).toLowerCase() === (wanted === 'ja' ? 'en' : 'ja'));
            if (chosen) { add(chosen, depth + 1); return; }
          }
          value.forEach(item => add(item, depth + 1));
          return;
        }
        if (typeof value !== 'object') return;
        // Some text files wrap each entry in a localized `strings` array.
        if (Array.isArray(value.strings)) {
          const localized = this.getLocalizedString(value.strings);
          const candidate = ['value', 'text', 'name', 'message', listKey, 'title', 'description']
            .map(key => localized && localized[key]).find(item => typeof item === 'string' && item.trim());
          if (candidate) { add(candidate, depth + 1); return; }
        }
        // Also accept direct localized records and common text-property names.
        const candidate = ['value', 'text', 'name', 'message', listKey, 'title', 'description', wanted,
          wanted === 'ja' ? 'en' : 'ja']
          .map(key => value[key]).find(item => typeof item === 'string' && item.trim());
        if (candidate) { add(candidate, depth + 1); return; }
        // If this object is a localized record, do not accidentally expose metadata.
        if (value._lang) return;
        Object.entries(value).forEach(([key, item]) => {
          if (!['_lang', 'id', 'key', 'code'].includes(key)) add(item, depth + 1);
        });
      };
      if (source == null) {
        console.error(`[MEGU] ${ART[listKey === 'hobbies' ? 'meguHobbies' : listKey === 'honor' ? 'meguHonor' : listKey === 'myboom' ? 'meguMyboom' : 'meguIkigai']} loaded, but application.${listKey} is missing. Available application keys:`, Object.keys(root));
      } else {
        add(source);
      }
      const result = [...new Set(values)];
      if (!result.length && source != null) {
        console.error(`[MEGU] application.${listKey} exists but no usable text entries could be extracted. Raw value:`, source);
      }
      return result;
    },
    openStatsStringPicker(attribute, listKey, titleText) {
      if (this.statsStringPickerObjects && this.statsStringPickerObjects.length) return;
      const allOptions = this.statsStringOptions && this.statsStringOptions[listKey] || [];
      const isHonorPicker = attribute === 'honorSelectedIndex' && listKey === 'honor';
      const baseHonorCount = isHonorPicker ? (this.baseHonorOptions || allOptions).length : 0;
      const optionIndices = isHonorPicker
        ? [
            ...Array.from({ length: Math.min(baseHonorCount, Math.max(1, Math.trunc(Number(GAME_ATTRIBUTES.honorUnlockedIndex) || 0) + 1)) }, (_, index) => index),
            ...Array.from({ length: Math.max(0, allOptions.length - baseHonorCount) }, (_, index) => baseHonorCount + index)
          ]
        : allOptions.map((_, index) => index);
      const options = optionIndices.map(index => allOptions[index]);
      if (!options.length) {
        console.error(`[MEGU] Cannot open the ${titleText} picker: no options were loaded from application.${listKey} in the corresponding assets/texts JSON file.`);
        return;
      }
      const objects = this.statsStringPickerObjects = [];
      const add = object => { objects.push(object); return object; };
      const addText = (x, y, text, style = {}) => add(this.add.text(x, y, text, {
        fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#FFFFFF',
        align: 'center', wordWrap: { width: 440 }, ...style
      }).setOrigin(0.5).setDepth(82));
      add(this.add.rectangle(320, 475, 640, 950, 0x000000, 0.58).setDepth(80).setInteractive());
      add(this.add.rectangle(320, 475, 520, 520, 0x26334b, 0.98).setStrokeStyle(3, 0xffffff, 1).setDepth(81));
      addText(320, 235, titleText, { fontSize: '27px', color: '#FFF600', stroke: '#806F5A', strokeThickness: 5 });
      const closeBg = add(this.add.rectangle(548, 235, 38, 38, 0x7a3940, 1).setStrokeStyle(2, 0xffffff).setDepth(82).setInteractive({ useHandCursor: true }));
      addText(548, 234, '×', { fontSize: '28px' });
      closeBg.on('pointerdown', () => this.closeStatsStringPicker());
      let selected = isHonorPicker
        ? Math.max(0, optionIndices.indexOf(Math.trunc(Number(GAME_ATTRIBUTES[attribute]) || 0)))
        : Math.max(0, options.indexOf(String(GAME_ATTRIBUTES[attribute] || '')));
      let first = Math.max(0, Math.min(selected - 2, Math.max(0, options.length - 6)));
      const rowObjects = [];
      const visibleCount = 6;
      const rowTop = 285;
      const rowHeight = 48;
      const renderRows = () => {
        rowObjects.splice(0).forEach(item => item.destroy());
        for (let i = 0; i < visibleCount; i++) {
          const index = first + i;
          if (index >= options.length) break;
          const y = rowTop + i * rowHeight;
          const bg = this.add.rectangle(320, y, 460, 42, index === selected ? 0x557c9f : 0x3b4960, 1)
            .setStrokeStyle(index === selected ? 2 : 1, index === selected ? 0xfff600 : 0x8793a5, 1)
            .setDepth(82).setInteractive({ useHandCursor: true });
          const label = this.add.text(320, y, options[index], {
            fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#FFFFFF',
            align: 'center', wordWrap: { width: 430 }
          }).setOrigin(0.5).setDepth(83);
          bg.on('pointerdown', () => { selected = index; renderRows(); });
          rowObjects.push(bg, label);
        }
      };
      renderRows();
      const up = add(this.add.rectangle(85, 590, 54, 34, 0x52647b, 1).setStrokeStyle(1, 0xffffff).setDepth(82).setInteractive({ useHandCursor: true }));
      addText(85, 590, '▲', { fontSize: '18px' });
      const down = add(this.add.rectangle(555, 590, 54, 34, 0x52647b, 1).setStrokeStyle(1, 0xffffff).setDepth(82).setInteractive({ useHandCursor: true }));
      addText(555, 590, '▼', { fontSize: '18px' });
      up.on('pointerdown', () => { first = Math.max(0, first - 1); renderRows(); });
      down.on('pointerdown', () => { first = Math.min(Math.max(0, options.length - visibleCount), first + 1); renderRows(); });
      const cancel = add(this.add.rectangle(205, 680, 150, 54, 0x6b5555, 1).setStrokeStyle(2, 0xffffff).setDepth(82).setInteractive({ useHandCursor: true }));
      addText(205, 680, 'Cancel', { fontSize: '20px' });
      const confirm = add(this.add.rectangle(435, 680, 190, 54, 0x47784f, 1).setStrokeStyle(2, 0xffffff).setDepth(82).setInteractive({ useHandCursor: true }));
      addText(435, 680, 'Confirm', { fontSize: '20px' });
      cancel.on('pointerdown', () => this.closeStatsStringPicker());
      confirm.on('pointerdown', () => {
        GAME_ATTRIBUTES[attribute] = isHonorPicker ? optionIndices[selected] : options[selected];
        persistGameAttributes();
        this.refreshBaseStatsValues();
        this.updateGameAttributeDisplay();
        this.closeStatsStringPicker();
      });
      this.statsStringPickerRowObjects = rowObjects;
      this.statsStringPickerWheelHandler = (pointer, gameObjects, deltaX, deltaY) => {
        if (pointer.x < 70 || pointer.x > 570 || pointer.y < 275 || pointer.y > 575) return;
        first = Phaser.Math.Clamp(first + (deltaY > 0 ? 1 : -1), 0, Math.max(0, options.length - visibleCount));
        renderRows();
      };
      this.input.on('wheel', this.statsStringPickerWheelHandler);
    },
    closeStatsStringPicker() {
      if (this.statsStringPickerWheelHandler) this.input.off('wheel', this.statsStringPickerWheelHandler);
      this.statsStringPickerWheelHandler = null;
      const rowObjects = this.statsStringPickerRowObjects ? this.statsStringPickerRowObjects.splice(0) : [];
      const pickerObjects = this.statsStringPickerObjects ? this.statsStringPickerObjects.splice(0) : [];
      this.destroyUiObjects([...rowObjects, ...pickerObjects]);
      this.statsStringPickerObjects = null;
      this.statsStringPickerRowObjects = null;
    },
    currentGameAttributeSnapshot() {
      const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
      if (activeDef && activeDef.id) GAME_ATTRIBUTES.petId = String(activeDef.id);
      const localizedPetRecord = this.localizedRecord && this.characterRecordsById
        ? this.localizedRecord(this.characterRecordsById, GAME_ATTRIBUTES.petId) : null;
      GAME_ATTRIBUTES.petTypeName = String(localizedPetRecord && localizedPetRecord.name || (activeDef && activeDef.name) || GAME_ATTRIBUTES.petId);
      GAME_ATTRIBUTES.age = calendarDaysBetween(GAME_ATTRIBUTES.birthday);
      return GAME_ATTRIBUTES;
    },
    getFriendshipRequirement(level) {
      const normalizedLevel = Math.max(0, Math.trunc(Number(level) || 0));
      // Level 0 is reserved for the debug reset; use the level-1 threshold to
      // let the first friendship gain advance it into the normal level range.
      const tableLevel = Math.max(1, normalizedLevel);
      const configured = Number(this.levelFriendshipTable && this.levelFriendshipTable[String(tableLevel)]);
      return Number.isFinite(configured) && configured > 0 ? Math.round(configured) : Math.max(1, 4 * tableLevel * tableLevel);
    },

});
