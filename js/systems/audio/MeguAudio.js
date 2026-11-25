/* ===== Merged from MeguAudio.js ===== */
/* Audio preferences, sound instances, and volume controls for Main. */
Object.assign(Main.prototype, {
  initializeAudio() {
      this.settingsVolumeMarkers = null;
      this.updateSettingsVolumeMarkers = () => this.settingsVolumeMarkers?.refresh?.();
      // Persist audio preferences locally so logging out or signing into another
      // account does not reset the user's volume sliders.
      const readSavedAudioVolume = (key, fallback) => {
        try {
          const raw = localStorage.getItem(key);
          if (raw === null || raw.trim() === '') return fallback;
          const value = Number(raw);
          return Number.isFinite(value) ? Phaser.Math.Clamp(value, 0, 1) : fallback;
        } catch (_) { return fallback; }
      };
      const saveAudioVolume = (key, value) => {
        try { localStorage.setItem(key, String(Phaser.Math.Clamp(value, 0, 1))); } catch (_) {}
      };
      // Audio starts on the first user interaction to satisfy browser autoplay rules.
      this.musicVolume = readSavedAudioVolume('megu.audio.bgm_volume', 0);
      this.defaultBgmSound = this.sound.add('megu-bgm', { loop: true, volume: this.musicVolume });
      this.bgmSound = this.defaultBgmSound;
      this.currentJukeboxTrackId = null;
      this.jukeboxAudioLoadPromises = new Map();
      this.jukeboxMenuOpen = false;
      this.jukeboxMenuObjects = [];
      this.jukeboxMenuPage = 0;
      this.jukeboxMenuFurnitureIndex = -1;
      // Character-menu audio pauses the BGM and uses the same user-controlled music volume.
      this.characterMenuBgmShouldResume = false;
      this.pendingCharacterBgmResume = false;
      this.characterChangingSound = this.cache.audio.exists('character-changing-sfx')
        ? this.sound.add('character-changing-sfx', { volume: this.musicVolume }) : null;
      this.audioUnlocked = false;
      this.nextMeguVoiceAt = null;
      this.currentMeguVoiceKey = '';
      this.input.once('pointerdown', () => {
        this.audioUnlocked = true;
        this.playJukeboxTrack(this.getConfiguredHouseBgmTrackId()).catch(error => console.warn('[MEGU] Could not start configured house BGM:', error));
        // Start voices after a randomized delay, then repeat about every 15 seconds on average.
        this.nextMeguVoiceAt = this.time.now + Phaser.Math.Between(5000, 10000);
      });
      this.volumeLabel = this.add.text(418, 40, this.uiText('BGM volume'), textStyle(12)).setOrigin(0.5).setDepth(3);
      this.volumeTrack = this.add.rectangle(478, 40, 48, 8, 0x7b8499).setDepth(3).setInteractive({ useHandCursor: true });
      this.volumeFill = this.add.rectangle(454, 40, 0, 8, 0xffd34f).setOrigin(0, 0.5).setDepth(3);
      this.volumeKnob = this.add.circle(454, 40, 7, 0xffffff).setDepth(4).setStrokeStyle(2, 0x4f7cff).setInteractive({ useHandCursor: true });
      this.volumeHit = this.add.rectangle(478, 40, 70, 28, 0xffffff, 0.001).setDepth(5).setInteractive({ useHandCursor: true });
      [this.volumeLabel, this.volumeTrack, this.volumeFill, this.volumeKnob, this.volumeHit].forEach(o => { if (o) { o.setVisible(false); o.disableInteractive && o.disableInteractive(); } });
      this.setMusicVolume = value => {
        this.musicVolume = Phaser.Math.Clamp(value, 0, 1);
        saveAudioVolume('megu.audio.bgm_volume', this.musicVolume);
        if (this.bgmSound) this.bgmSound.setVolume(this.musicVolume);
        if (this.characterChangingSound) this.characterChangingSound.setVolume(this.musicVolume);
        const left = 454, right = 502, x = left + (right - left) * this.musicVolume;
        this.volumeKnob.setPosition(x, 40);
        this.volumeFill.setSize(Math.max(0, x - left), 8);
        this.volumeLabel.setText(this.uiText('BGM volume'));
        if (this.updateSettingsVolumeMarkers) this.updateSettingsVolumeMarkers();
      };
      this.volumeDragging = false;
      const setVolumeFromPointer = pointer => this.setMusicVolume(Phaser.Math.Clamp((pointer.x - 454) / 48, 0, 1));
      const beginVolumeDrag = pointer => { this.volumeDragging = true; setVolumeFromPointer(pointer); };
      // Top-screen volume controls are removed; volume remains adjustable in Options.
      this.volumeTrack.disableInteractive();
      this.volumeHit.disableInteractive();
      this.volumeKnob.disableInteractive();
      this.input.on('pointermove', pointer => { if (this.volumeDragging && pointer.isDown) setVolumeFromPointer(pointer); });
      this.input.on('pointerup', () => { this.volumeDragging = false; });
      this.setMusicVolume(this.musicVolume);
      this.sfxVolume = readSavedAudioVolume('megu.audio.sfx_volume', 0.8);
      this.clickSound = this.sound.add('click-sfx', { volume: this.sfxVolume });
      this.meguVoiceSounds = ART.meguVoiceSfx.map((_, i) => this.sound.add(`megu-voice-${i + 1}`, { volume: this.sfxVolume }));
      this.foodSound = this.sound.add('food-sfx', { volume: this.sfxVolume });
      this.washSound = this.sound.add('wash-sfx', { volume: this.sfxVolume });
      this.sweepSound = this.sound.add('sweep-sfx', { volume: this.sfxVolume });
      this.bathMode = false;
      this.cleanMode = false;
      this.bathPointerDown = false;
      this.bathLastPointer = null;
      this.bathRubMs = 0;
      this.bathSoundPlayed = false;
      this.bathInstructionText = null;
      this.bathBubbles = [];
      this.hygieneFlySprites = [];
      this.hygieneFlyNextStepAt = [];
      this.happySound1 = this.sound.add('happy1-sfx', { volume: this.sfxVolume });
      this.happySound2 = this.sound.add('happy2-sfx', { volume: this.sfxVolume });
      this.happySound3 = this.sound.add('happy3-sfx', { volume: this.sfxVolume });
      this.houseChangedSound = this.cache.audio.exists('house-complete-sfx')
        ? this.sound.add('house-complete-sfx', { volume: this.sfxVolume }) : null;
      this.sfxLabel = this.add.text(278, 40, this.uiText('SFX volume'), textStyle(12)).setOrigin(0.5).setDepth(3);
      this.sfxTrack = this.add.rectangle(337, 40, 48, 8, 0x7b8499).setDepth(3).setInteractive({ useHandCursor: true });
      this.sfxFill = this.add.rectangle(313, 40, 0, 8, 0xffd34f).setOrigin(0, 0.5).setDepth(3);
      this.sfxKnob = this.add.circle(313, 40, 7, 0xffffff).setDepth(4).setStrokeStyle(2, 0x4f7cff).setInteractive({ useHandCursor: true });
      this.sfxHit = this.add.rectangle(337, 40, 70, 28, 0xffffff, 0.001).setDepth(5).setInteractive({ useHandCursor: true });
      [this.sfxLabel, this.sfxTrack, this.sfxFill, this.sfxKnob, this.sfxHit].forEach(o => { if (o) { o.setVisible(false); o.disableInteractive && o.disableInteractive(); } });
      this.setSfxVolume = value => {
        this.sfxVolume = Phaser.Math.Clamp(value, 0, 1);
        saveAudioVolume('megu.audio.sfx_volume', this.sfxVolume);
        if (this.clickSound) this.clickSound.setVolume(this.sfxVolume);
        if (this.meguVoiceSounds) this.meguVoiceSounds.forEach(sound => sound.setVolume(this.sfxVolume));
        if (this.foodSound) this.foodSound.setVolume(this.sfxVolume);
        if (this.washSound) this.washSound.setVolume(this.sfxVolume);
        if (this.happySound1) this.happySound1.setVolume(this.sfxVolume);
        if (this.happySound2) this.happySound2.setVolume(this.sfxVolume);
        if (this.happySound3) this.happySound3.setVolume(this.sfxVolume);
        if (this.characterCompleteSound) this.characterCompleteSound.setVolume(this.sfxVolume);
        if (this.houseChangedSound) this.houseChangedSound.setVolume(this.sfxVolume);
        const left = 313, right = 361, x = left + (right - left) * this.sfxVolume;
        this.sfxKnob.setPosition(x, 40);
        this.sfxFill.setSize(Math.max(0, x - left), 8);
        if (this.updateSettingsVolumeMarkers) this.updateSettingsVolumeMarkers();
      };
      this.sfxDragging = false;
      const setSfxFromPointer = pointer => this.setSfxVolume(Phaser.Math.Clamp((pointer.x - 313) / 48, 0, 1));
      const beginSfxDrag = pointer => { this.sfxDragging = true; setSfxFromPointer(pointer); };
      this.sfxTrack.disableInteractive();
      this.sfxHit.disableInteractive();
      this.sfxKnob.disableInteractive();
      this.input.on('pointermove', pointer => { if (this.sfxDragging && pointer.isDown) setSfxFromPointer(pointer); });
      this.input.on('pointerup', () => { this.sfxDragging = false; });
      this.setSfxVolume(this.sfxVolume);
  },
});


/* ===== Merged from MeguJukebox.js ===== */
/* MeguJukebox: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    isJukeboxFurnitureObject(object) {
      if (!object || object.kind === 'food') return false;
      const item = this.getFurnitureDefinitionForObject(object);
      return !!(object.jukeboxFlag || (item && item.jukeboxFlag));
    },
    getConfiguredHouseBgmTrackId(furniture = GAME_ATTRIBUTES.furn) {
      const objects = Array.isArray(furniture) ? furniture : [];
      for (let i = objects.length - 1; i >= 0; i--) {
        const object = objects[i];
        if (!this.isJukeboxFurnitureObject(object)) continue;
        const id = object.jukeboxTrackId != null ? object.jukeboxTrackId : object.bgmId;
        if (id != null && this.jukeboxTracks.some(track => String(track.id) === String(id))) return String(id);
      }
      return null;
    },
    findJukeboxFurnitureAt(x, y) {
      const objects = Array.isArray(GAME_ATTRIBUTES.furn) ? GAME_ATTRIBUTES.furn : [];
      const depthMap = this.getFurnitureDepthMap();
      const order = objects.map((object, index) => ({ object, index, depth: depthMap.get(object) || 0 }))
        .filter(entry => this.isJukeboxFurnitureObject(entry.object))
        .sort((a, b) => b.depth - a.depth || b.index - a.index);
      for (const entry of order) {
        const sprite = this.furnitureSprites && this.furnitureSprites[entry.index];
        if (sprite && sprite.active && sprite.visible && sprite.alpha > 0.05 && sprite.getBounds().contains(x, y)) return entry.index;
        // A furniture image can still be loading when the user clicks it. Keep
        // the placed object's hit area available so the jukebox is not locked
        // behind the temporary placeholder texture.
        if ((!sprite || !sprite.active || !sprite.visible || sprite.alpha <= 0.05) &&
            Math.abs(x - Number(entry.object.x || 0)) <= 56 &&
            y >= Number(entry.object.y || 0) - 100 && y <= Number(entry.object.y || 0) + 12) return entry.index;
      }
      return -1;
    },
    startJukeboxPlacement() {
      // A house can contain only one jukebox. Check persisted furniture, not sprites:
      // sprites may not yet be loaded when the player presses the menu button.
      const placed = Array.isArray(GAME_ATTRIBUTES.furn) ? GAME_ATTRIBUTES.furn : [];
      const alreadyPlaced = placed.some(object => object && object.kind !== 'food' && (
        this.isJukeboxFurnitureObject(object) ||
        String(object.furnitureId ?? object.id ?? '') === '99998' ||
        String(object.assetStem ?? '').toUpperCase() === 'KG99998'
      ));
      if (alreadyPlaced) {
        if (typeof this.showMeguMessage === 'function') this.showMeguMessage('A jukebox is already placed.');
        return;
      }
      // ID 99998 is the requested jukebox placement item. Fall back to its canonical
      // asset definition if the thumbnail atlas omitted it from the picker index.
      const item = (this.furnitureDefsById && this.furnitureDefsById.get('99998'))
        || this.makeFurnitureDefinition('KG99998', '99998', 64, 64);
      item.jukeboxFlag = true;
      this.closeFooterMenu();
      this.closeJukeboxMenu();
      this.toggleFurn(false);
      this.startEdit(item, false);
    },
    closeJukeboxMenu() {
      // Invalidate pending preview loads before removing the modal. This prevents
      // a late audio load from changing music after Cancel/Close.
      this.jukeboxPlaybackRequestId = (this.jukeboxPlaybackRequestId || 0) + 1;
      // Destroy every modal object, even if Phaser has already marked it inactive.
      // In particular, never leave the dimming backdrop or its hit area behind.
      this.destroyUiObjects(this.jukeboxMenuObjects, { removeListeners: true, destroyInactive: true });
      this.jukeboxMenuObjects = [];
      this.jukeboxMenuOpen = false;
      this.jukeboxMenuClosing = false;
      this.jukeboxMenuFurnitureIndex = -1;
      this.jukeboxMenuSelectedTrackId = null;
      this.jukeboxMenuOriginalTrackId = null;
      // The backdrop is an ordinary scene object, not a camera fade. Reset both
      // camera FX and alpha so no interrupted transition can leave the house dim.
      const camera = this.cameras && this.cameras.main;
      if (camera) { camera.resetFX(); camera.setAlpha(1); }
    },
    openJukeboxMenu(furnitureIndex) {
      if (this.visitingHouse || this.friendHouseTransition || this.jukeboxMenuOpen) return;
      const object = GAME_ATTRIBUTES.furn && GAME_ATTRIBUTES.furn[furnitureIndex];
      if (!this.isJukeboxFurnitureObject(object)) return;
      this.closeFooterMenu();
      this.jukeboxMenuOpen = true;
      this.jukeboxMenuFurnitureIndex = furnitureIndex;
      this.jukeboxMenuPage = 0;
      this.jukeboxMenuOriginalTrackId = object.jukeboxTrackId != null ? String(object.jukeboxTrackId)
        : (object.bgmId != null ? String(object.bgmId) : null);
      this.jukeboxMenuSelectedTrackId = this.jukeboxMenuOriginalTrackId;
      const objects = this.jukeboxMenuObjects = [];
      const add = item => { objects.push(item); return item; };
      // The modal backdrop deliberately does not close the picker. It consumes
      // clicks outside the panel so world interactions cannot leak through.
      const backdrop = add(this.add.rectangle(W / 2, CANVAS_H / 2, W, CANVAS_H, 0x080d19, 0.82)
        .setDepth(100).setScrollFactor(0).setInteractive());
      // Clicking outside the panel is an explicit cancel, not a pass-through click.
      // This also guarantees the backdrop is removed rather than leaving the room dim.
      backdrop.on('pointerdown', pointer => {
        if (pointer && pointer.event && pointer.event.stopPropagation) pointer.event.stopPropagation();
        if (this.jukeboxMenuOpen) this.cancelJukeboxMenu();
      });
      const panel = add(this.add.rectangle(W / 2, 425, 570, 650, 0xf4ead7, 1)
        .setStrokeStyle(5, 0x806f5a).setDepth(101).setScrollFactor(0).setInteractive());
      panel.on('pointerdown', pointer => { if (pointer && pointer.event && pointer.event.stopPropagation) pointer.event.stopPropagation(); });
      add(this.add.text(W / 2, 125, 'JUKEBOX', { fontFamily: 'Arial', fontSize: '28px', fontStyle: 'bold', color: '#5a402c' })
        .setOrigin(0.5).setDepth(102).setScrollFactor(0));
      const close = add(this.add.text(575, 126, '✕', { fontFamily: 'Arial', fontSize: '26px', fontStyle: 'bold', color: '#8a493d' })
        .setOrigin(0.5).setDepth(103).setScrollFactor(0).setInteractive({ useHandCursor: true }));
      close.on('pointerdown', () => this.cancelJukeboxMenu());
      const rowObjects = [];
      const addRowObject = item => { rowObjects.push(item); objects.push(item); return item; };
      const pageSize = 7;
      const drawPage = () => {
        rowObjects.forEach(item => {
          if (item && item.active) {
            if (item.disableInteractive) item.disableInteractive();
            item.destroy();
          }
        });
        rowObjects.length = 0;
        const tracks = this.jukeboxTracks || [];
        const pageCount = Math.max(1, Math.ceil(tracks.length / pageSize));
        this.jukeboxMenuPage = Phaser.Math.Clamp(this.jukeboxMenuPage, 0, pageCount - 1);
        tracks.slice(this.jukeboxMenuPage * pageSize, (this.jukeboxMenuPage + 1) * pageSize).forEach((track, rowIndex) => {
          const y = 190 + rowIndex * 62;
          const unlocked = Number(track.level || 1) <= Math.max(1, Number(GAME_ATTRIBUTES.level) || 1);
          const selected = this.jukeboxMenuSelectedTrackId === String(track.id);
          const row = addRowObject(this.add.rectangle(W / 2, y + 24, 510, 54, selected ? 0xffd86b : 0xffffff, unlocked ? 0.96 : 0.48)
            .setStrokeStyle(selected ? 4 : 1, selected ? 0xb37b25 : 0xc8b99f).setDepth(104).setScrollFactor(0));
          const label = this.add.text(88, y + 9, `${selected ? '♫ ' : ''}${track.name || `Track ${track.id}`}`, {
            fontFamily: 'Arial', fontSize: '16px', fontStyle: selected ? 'bold' : 'normal', color: unlocked ? '#4b3828' : '#8b8175',
            wordWrap: { width: 425 }
          }).setDepth(105).setScrollFactor(0);
          addRowObject(label);
          const lock = !unlocked ? addRowObject(this.add.text(548, y + 23, `Lv.${track.level}`, { fontFamily: 'Arial', fontSize: '12px', color: '#8b493d' }).setOrigin(1, 0.5).setDepth(106).setScrollFactor(0)) : null;
          // Every catalogue entry remains selectable. The level label is shown
          // as information, but it must not silently disable the row's hit area.
          const selectTrack = async pointer => {
            if (pointer && pointer.event && pointer.event.stopPropagation) pointer.event.stopPropagation();
            if (!this.jukeboxMenuOpen) return;
            const targetObject = GAME_ATTRIBUTES.furn && GAME_ATTRIBUTES.furn[this.jukeboxMenuFurnitureIndex];
            if (!targetObject || !this.isJukeboxFurnitureObject(targetObject)) { this.closeJukeboxMenu(); return; }
            this.jukeboxMenuSelectedTrackId = String(track.id);
            drawPage();
            try {
              // A pointer gesture unlocks browser audio; preview the highlighted
              // track immediately, while Confirm remains the only save action.
              this.audioUnlocked = true;
              await this.playJukeboxTrack(track.id);
            } catch (error) {
              console.warn('[MEGU] Jukebox preview could not be played:', error);
            }
          };
          // A transparent hit target above both the row and its label makes the
          // entire visible entry reliably clickable on mouse and touch.
          const hitZone = addRowObject(this.add.rectangle(W / 2, y + 24, 510, 54, 0xffffff, 0.001)
            .setDepth(107).setScrollFactor(0).setInteractive({ useHandCursor: true }));
          hitZone.on('pointerdown', selectTrack);
          label.setInteractive({ useHandCursor: true });
          label.on('pointerdown', selectTrack);
        });
        const pageText = addRowObject(this.add.text(W / 2, 642, `${this.jukeboxMenuPage + 1} / ${pageCount}`, { fontFamily: 'Arial', fontSize: '15px', color: '#5a402c' })
          .setOrigin(0.5).setDepth(103).setScrollFactor(0));
        const prev = addRowObject(this.add.text(185, 642, '◀ PREV', { fontFamily: 'Arial', fontSize: '15px', color: this.jukeboxMenuPage > 0 ? '#5a402c' : '#b7ad9e' })
          .setOrigin(0.5).setDepth(104).setScrollFactor(0).setInteractive({ useHandCursor: true }));
        const next = addRowObject(this.add.text(455, 642, 'NEXT ▶', { fontFamily: 'Arial', fontSize: '15px', color: this.jukeboxMenuPage < pageCount - 1 ? '#5a402c' : '#b7ad9e' })
          .setOrigin(0.5).setDepth(104).setScrollFactor(0).setInteractive({ useHandCursor: true }));
        prev.on('pointerdown', () => { if (this.jukeboxMenuPage > 0) { this.jukeboxMenuPage--; drawPage(); } });
        next.on('pointerdown', () => { if (this.jukeboxMenuPage < pageCount - 1) { this.jukeboxMenuPage++; drawPage(); } });
      };
      if (!this.jukeboxTracks.length) {
        add(this.add.text(W / 2, 390, 'No BGM tracks are available.', { fontFamily: 'Arial', fontSize: '18px', color: '#5a402c' })
          .setOrigin(0.5).setDepth(103).setScrollFactor(0));
      } else drawPage();
  
      const cancelButton = add(this.add.text(215, 710, 'CANCEL', {
        fontFamily: 'Arial', fontSize: '18px', fontStyle: 'bold', color: '#754b3b', backgroundColor: '#e4d3bd', padding: { x: 22, y: 12 }
      }).setOrigin(0.5).setDepth(106).setScrollFactor(0).setInteractive({ useHandCursor: true }));
      cancelButton.on('pointerdown', () => this.cancelJukeboxMenu());
      const confirmButton = add(this.add.text(425, 710, 'CONFIRM', {
        fontFamily: 'Arial', fontSize: '18px', fontStyle: 'bold', color: '#49351f', backgroundColor: '#ffd86b', padding: { x: 22, y: 12 }
      }).setOrigin(0.5).setDepth(106).setScrollFactor(0).setInteractive({ useHandCursor: true }));
      confirmButton.on('pointerdown', () => {
        const targetObject = GAME_ATTRIBUTES.furn && GAME_ATTRIBUTES.furn[this.jukeboxMenuFurnitureIndex];
        if (!targetObject || !this.isJukeboxFurnitureObject(targetObject)) { this.closeJukeboxMenu(); return; }
        if (this.jukeboxMenuSelectedTrackId == null || this.jukeboxMenuSelectedTrackId === '') {
          delete targetObject.jukeboxTrackId;
          delete targetObject.bgmId;
          this.playJukeboxTrack(null);
        } else {
          targetObject.jukeboxTrackId = String(this.jukeboxMenuSelectedTrackId);
          delete targetObject.bgmId;
        }
        save();
        this.closeJukeboxMenu();
      });
    },
    async playJukeboxTrack(trackId) {
      // Each request gets a monotonically increasing token. If another track is
      // selected while an MP3 is loading, only the newest request may take over.
      const playbackRequestId = (this.jukeboxPlaybackRequestId || 0) + 1;
      this.jukeboxPlaybackRequestId = playbackRequestId;
      const track = trackId == null ? null : this.jukeboxTracks.find(item => String(item.id) === String(trackId));
      if (trackId != null && !track) throw new Error(`Unknown jukebox track: ${trackId}`);

      let nextSound = this.defaultBgmSound;
      if (track) {
        const key = `jukebox-bgm-${String(track.id).replace(/[^a-z0-9_-]/gi, '-')}`;
        if (!this.cache.audio.exists(key)) {
          let pending = this.jukeboxAudioLoadPromises.get(key);
          if (!pending) {
            pending = new Promise((resolve, reject) => {
              const cleanup = () => {
                this.load.off(`filecomplete-audio-${key}`, complete);
                this.load.off('loaderror', fail);
                this.jukeboxAudioLoadPromises.delete(key);
              };
              const complete = () => {
                cleanup();
                this.cache.audio.exists(key) ? resolve() : reject(new Error(`Missing audio: ${track.file}.mp3`));
              };
              const fail = file => {
                if (file && file.key === key) {
                  cleanup();
                  reject(new Error(`Could not load ${track.file}.mp3`));
                }
              };
              this.load.once(`filecomplete-audio-${key}`, complete);
              this.load.on('loaderror', fail);
              this.load.audio(key, `assets/sound/bgm/${track.file}.mp3`);
              if (!(this.load.isLoading && this.load.isLoading())) this.load.start();
            });
            this.jukeboxAudioLoadPromises.set(key, pending);
          }
          await pending;
        }
        // Create a fresh instance for every selection. Reusing a previously
        // stopped Phaser sound can leave its WebAudio source in a stale state.
        nextSound = this.sound.add(key, { loop: true, volume: this.musicVolume });
      }

      // A newer preview/cancel may have been requested while this track loaded.
      if (playbackRequestId !== this.jukeboxPlaybackRequestId) {
        if (nextSound && nextSound !== this.defaultBgmSound && nextSound.destroy) nextSound.destroy();
        return false;
      }

      const previous = this.bgmSound;
      // Stop unconditionally: Phaser's isPlaying flag can be false during an
      // audio-context transition even though the old instance still owns a node.
      if (previous && previous !== nextSound) {
        try { previous.stop(); } catch (e) {}
        if (previous !== this.defaultBgmSound && previous.destroy) {
          try { previous.destroy(); } catch (e) {}
        }
      }

      this.bgmSound = nextSound;
      this.currentJukeboxTrackId = track ? String(track.id) : null;
      if (nextSound) {
        nextSound.setVolume(this.musicVolume);
        // Start the new sound even when switching from another preview. The
        // browser audio context is unlocked by the user's track-selection click.
        if (!nextSound.isPlaying) {
          const played = nextSound.play({ loop: true, volume: this.musicVolume });
          if (played === false) {
            try {
              const context = this.sound && this.sound.context;
              if (context && context.state === 'suspended' && context.resume) context.resume();
            } catch (e) {}
          }
        }
      }
      return true;
    },
    async cancelJukeboxMenu() {
      if (!this.jukeboxMenuOpen || this.jukeboxMenuClosing) return;
      this.jukeboxMenuClosing = true;
      const originalTrackId = this.jukeboxMenuOriginalTrackId;
      this.closeJukeboxMenu();
      try {
        await this.playJukeboxTrack(originalTrackId == null || originalTrackId === '' ? null : originalTrackId);
      } catch (error) {
        console.warn('[MEGU] Could not restore jukebox music after cancelling:', error);
      }
    },
});
