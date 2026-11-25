/* MeguCharacterMenu: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    openSuperEvolutionMenu() {
      // Super Evolution requires one Super Voltamin. Check before opening the picker.
      if (Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.superVoltamin) || 0)) <= 0) {
        this.showTopMessage('You need Super Voltamin');
        return false;
      }
      this.toggleMenu(true);
      return !!this.menuOpen;
    },
    loadCharacterThumbnailAtlases() {
      if (this.characterThumbnailLoadPending) return;
      const atlases = ART.characterThumbnailAtlases;
      const pending = atlases.filter(atlas => !this.textures.exists(atlas.key));
  
      // The thumbnail JSON uses TexturePacker hash entries such as "ID6_3".
      // The numeric part is the MEGU ID; the suffix identifies the thumbnail
      // frame. Build the ID map directly from the JSON instead of depending on
      // Phaser's atlas parser or on its frame-name enumeration.
      const registerFrames = () => {
        this.characterThumbnailById = new Map();
        atlases.forEach(atlas => {
          if (!this.textures.exists(atlas.key)) return;
          const texture = this.textures.get(atlas.key);
          const atlasData = this.cache.json.get(`${atlas.key}-data`)
            || this.cache.json.get(atlas.key);
          atlasFrameEntries(atlasData).forEach(([frameName, frameData]) => {
            if (!frameName || frameName === '__BASE' || !frameData) return;
            const stem = String(frameName).split(/[\\/]/).pop().replace(/\.(png|jpe?g|webp)$/i, '');
            const match = stem.match(/^ID0*(\d+)(?:_|$)/i);
            if (!match) return;
            const id = `ID${Number(match[1])}`;
            const rect = frameData.frame || frameData;
            const x = Number(rect.x), y = Number(rect.y);
            const width = Number(rect.w != null ? rect.w : rect.width);
            const height = Number(rect.h != null ? rect.h : rect.height);
            if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
            if (!texture.has(frameName)) {
              try {
                texture.add(frameName, 0, x, y, width, height);
              } catch (error) {
                console.warn(`[MEGU] Could not register thumbnail frame ${frameName}`, error);
                return;
              }
            }
            // Keep the first valid thumbnail frame for each character ID.
            if (!this.characterThumbnailById.has(id) && texture.has(frameName)) {
              const frame = texture.get(frameName);
              this.characterThumbnailById.set(id, {
                key: atlas.key,
                frame: frameName,
                width: frame ? frame.width : width,
                height: frame ? frame.height : height
              });
            }
          });
        });
      };
  
      if (!pending.length) {
        registerFrames();
        if (this.menuOpen) this.updateCharacterMenu();
        return;
      }
  
      this.characterThumbnailLoadPending = true;
      // Load only the two PNG sheets. Their JSON metadata was fetched at scene
      // startup, so frames can be registered deterministically after the images
      // are decoded and added to the Texture Manager.
      this.load.once('complete', () => {
        this.characterThumbnailLoadPending = false;
        registerFrames();
        if (this.menuOpen) {
          this.updateCharacterMenu();
        } else {
          atlases.forEach(atlas => {
            // A late thumbnail load must not evict an atlas still referenced by
            // another live UI object (for example, a rapidly reopened picker).
            this.removeTextureIfUnused(atlas.key);
          });
        }
      });
      pending.forEach(atlas => this.load.image(atlas.key, atlas.image));
      if (!this.load.isLoading()) this.load.start();
    },
    releaseCharacterThumbnailAtlases() {
      // Preview GameObjects are destroyed by toggleMenu before this is called.
      ART.characterThumbnailAtlases.forEach(atlas => {
        // Use the same live-reference guard as food/furniture/background assets.
        this.removeTextureIfUnused(atlas.key);
      });
      this.characterThumbnailById = new Map();
    },
    toggleMenu(open, options = null) {
      if (open) {
        if (!this.openStandardPicker('menuOpen')) return;
        this.characterMenuBgmShouldResume = !!(this.audioUnlocked || (this.bgmSound && this.bgmSound.isPlaying));
        this.pendingCharacterBgmResume = false;
        if (this.bgmSound && this.bgmSound.isPlaying) this.bgmSound.stop();
        if (this.characterChangingSound) this.playMenuSound(this.characterChangingSound, this.musicVolume);
        // Avoid overlapping randomized pet voices with the character-change cue.
        if (this.meguVoiceSounds) this.meguVoiceSounds.forEach(sound => { if (sound && sound.isPlaying) sound.stop(); });
        this.currentMeguVoiceKey = '';
        // No on-screen SFX debug label.
        if (this.meguMessageTimer) { this.meguMessageTimer.remove(false); this.meguMessageTimer = null; }
        if (this.meguMessageContainer && this.meguMessageContainer.active) this.meguMessageContainer.destroy(true);
        this.meguMessageContainer = null;
        this.characterMenuMode = options && options.mode === 'superDevolution' ? 'superDevolution' : 'superEvolution';
        if (this.characterMenuMode === 'superDevolution') {
          this.characterMenuOriginalDefs = this.characterDefs;
          this.characterDefs = (options.candidateDefs || []).slice();
        }
        this.charSelected = -1;
        this.charPress = null;
        this.charScrollbarPress = null;
        this.characterScrollbarScope?.destroy();
        this.characterScrollbarScope = null;
        this.charScroll = this.characterMenuMode === 'superDevolution'
          ? 0
          : Math.floor(Math.max(0, getCharacterIndex(this.characterDefs)) / this.charVisibleRows) * this.charVisibleRows;
        this.syncMeguMenuVisibility();
        this.buildCharacterMenu();
        this.loadCharacterThumbnailAtlases();
        if (this.chargingRoomActive) {
          // Keep the Charging Room backdrop, but temporarily hide its controls
          // while the full-screen character picker is open.
          (this.chargingRoomObjects || []).slice(1).forEach(object => {
            if (object && object.active) object.setVisible(false);
          });
          (this.mItems || []).forEach(object => {
            if (object && object.active && object.setDepth) object.setDepth((object.depth || 0) + 50040);
          });
        }
        return;
      }
      this.characterScrollbarScope?.destroy();
      this.characterScrollbarScope = null;
      this.characterMenuScrollbar = null;
      this.closeStandardPicker('menuOpen', 'mItems', ['charPress', 'charScrollbarPress']);
      if (this.chargingRoomActive && !(this.evolutionTransition && this.evolutionTransition.active)) {
        (this.chargingRoomObjects || []).slice(1).forEach(object => {
          if (object && object.active) object.setVisible(true);
        });
      }
      if (this.characterChangingSound && this.characterChangingSound.isPlaying) this.characterChangingSound.stop();
      // If no new character was committed, return to the base screen with BGM.
      // A committed change keeps BGM paused until the new character atlas activates.
      if (!this.pendingCharacterBgmResume) this.resumeBgmAfterCharacterMenu();
      this.syncMeguMenuVisibility();
      if (this.chargingRoomActive) this.setChargingRoomCharacterPosition();
      // Destroy all temporary picker UI and previews so thumbnails are not retained
      // after the menu closes.
      // Shared lifecycle has disabled and destroyed all character picker objects.
      this.releaseCharacterThumbnailAtlases();
      this.cells = [];
      this.charRowsUI = [];
      this.charSelectButton = null;
      this.charCancelButton = null;
      this.charScrollTrack = null;
      this.charScrollTrackHit = null;
      this.charScrollThumb = null;
      this.charMenuBackground = null;
      if (this.characterMenuMode === 'superDevolution' && this.characterMenuOriginalDefs) {
        this.characterDefs = this.characterMenuOriginalDefs;
        this.characterMenuOriginalDefs = null;
      }
      this.characterMenuMode = null;
    },
    buildCharacterMenu() {
      this.characterScrollbarScope?.destroy();
      this.characterScrollbarScope = this.createUiResourceScope();
      const add = (o, depth = 20) => {
        if (o && o.setDepth) o.setDepth(depth);
        if (o && o.setVisible) o.setVisible(true);
        this.mItems.push(o);
        return o;
      };
  
      // Use the supplied 2x menu artwork, matching the Background picker.
      if (this.textures.exists('menu-character')) {
        this.charMenuBackground = add(
          this.add.image(0, 0, 'menu-character').setOrigin(0, 0).setDisplaySize(W, H)
            .setInteractive({ useHandCursor: false }), 20
        );
      } else {
        this.charMenuBackground = add(
          this.add.rectangle(W / 2, H / 2, W, H, 0x382e2a, 0.98)
            .setInteractive({ useHandCursor: false }), 20
        );
        add(this.add.text(W / 2, 44, this.uiText('Characters'), textStyle(24, '#f5e9d4')).setOrigin(0.5), 21);
      }
  
      // Same 3-row geometry, selection highlight, and scrollbar as Background.
      const rowLayouts = MeguScrollableMenu.rows;
      this.charRowsUI = [];
      for (let i = 0; i < rowLayouts.length; i++) {
        const layout = rowLayouts[i];
        const thumbBox = layout.thumb;
        const descBox = layout.desc;
        const rc = add(this.add.rectangle(32 + 578 / 2, descBox.y + descBox.h / 2, 578, descBox.h, 0xffd34f, 0.001)
          .setStrokeStyle(1, 0xffd34f, 0).setInteractive({ useHandCursor: true }), 22);
        const nm = add(this.add.text(descBox.x, descBox.y, '', textStyle(24, '#3d3024'))
          .setOrigin(0, 0).setWordWrapWidth(descBox.w), 24);
        const detail = add(this.add.text(descBox.x, descBox.y + 38, '', textStyle(20, '#3d3024'))
          .setOrigin(0, 0).setWordWrapWidth(descBox.w), 24);
        const row = {
          rc, nm, detail, preview: null, thumbFallback: null,
          top: thumbBox.y, cy: thumbBox.y + thumbBox.h / 2,
          renderedIndex: -1, previewItemId: null, thumbBox, descBox
        };
        MeguScrollableMenu.bindRow(this, this.characterScrollbarScope, rc, {
          getIndex: () => this.charScroll + i,
          getCount: () => this.characterDefs.length,
          getScroll: () => this.charScroll,
          setScroll: index => { this.charScroll = index; this.updateCharacterMenu(); },
          onSelect: index => { this.charSelected = index; this.updateCharacterMenu(); },
          visible: this.charVisibleRows
        });
        this.charRowsUI.push(row);
        this.cells.push(row);
      }
  
      this.characterMenuScrollbar = MeguScrollableMenu.createScrollbar(this, {
        scope: this.characterScrollbarScope,
        add: object => { this.mItems.push(object); return object; },
        getCount: () => this.characterDefs.length,
        getIndex: () => this.charScroll,
        setIndex: index => { this.charScroll = index; this.charPress = null; this.updateCharacterMenu(); },
        visible: this.charVisibleRows, depth: 22, wheelBounds: { left: 16, right: 624, top: 174, bottom: 546 }
      });
      this.charScrollTrack = this.characterMenuScrollbar.track;
      this.charScrollTrackHit = this.characterMenuScrollbar.hit;
      this.charScrollThumb = this.characterMenuScrollbar.thumb;

      const buttonHitbox = (x, y, width, height, action) => {
        const rect = add(this.add.rectangle(x + width / 2, y + height / 2, width, height, 0xffd34f, 0.001)
          .setInteractive({ useHandCursor: true }), 30);
        rect.on('pointerover', () => rect.setFillStyle(0xffd34f, 0.14));
        rect.on('pointerout', () => rect.setFillStyle(0xffd34f, 0.001));
        rect.on('pointerdown', (pointer, localX, localY, event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          if (rect === this.charSelectButton && (this.charSelected < 0 || !this.characterDefs?.[this.charSelected])) return;
          action();
        });
        return rect;
      };
      this.charSelectButton = buttonHitbox(549, 633, 59, 49, () => this.applyCharacterSelection());
      this.charCancelButton = buttonHitbox(478, 633, 65, 49, () => this.toggleMenu(false));
      this.updateCharacterMenu();
    },
    updateCharacterMenu() {
      if (!this.menuOpen || !this.charRowsUI.length) return;
      // The Charging Room occupies depth 50000+. Picker objects that are created
      // asynchronously after its initial depth lift must use the same offset.
      const pickerDepthOffset = this.chargingRoomActive ? 50040 : 0;
      const defs = this.characterDefs || [];
      const maxScroll = Math.max(0, defs.length - this.charVisibleRows);
      this.charScroll = Phaser.Math.Clamp(this.charScroll, 0, maxScroll);
      this.charRowsUI.forEach((row, i) => {
        const idx = this.charScroll + i;
        const item = defs[idx];
        row.rc.setVisible(!!item);
        row.nm.setVisible(!!item);
        row.detail.setVisible(!!item && !!this.localizedRecord(this.characterRecordsById, item.id).detail);
        if (!item) {
          if (row.preview) row.preview.setVisible(false);
          row.renderedIndex = -1;
          row.previewItemId = null;
          return;
        }
  
        const record = this.localizedRecord(this.characterRecordsById, item.id);
        const name = record.name || item.name || item.id;
        const detail = record.detail || '';
        row.rc.setFillStyle(0xffd34f, idx === this.charSelected ? 0.16 : 0.001);
        row.rc.setStrokeStyle(idx === this.charSelected ? 3 : 1, 0xffd34f, idx === this.charSelected ? 0.98 : 0);
        if (row.renderedIndex !== idx) {
          const box = row.descBox;
          row.nm.setPosition(box.x, box.y);
          row.detail.setPosition(box.x, box.y + 38);
          this.fitTextToBounds(row.nm, name, {
            width: box.w, height: 36, jaBaseSize: 24, jaMinSize: 14, jaMaxLines: 1,
            enBaseSize: 24, enMaxLines: 1, lineSpacing: 0
          });
          this.fitTextToBounds(row.detail, detail, {
            width: box.w, height: box.h - 38, jaBaseSize: 18, jaMinSize: 12, jaMaxLines: 3,
            enBaseSize: 20, enMaxLines: 3, lineSpacing: 0
          });
          row.renderedIndex = idx;
        }
  
        const idMatch = String(item.id || '').match(/\d+/);
        const thumbId = idMatch ? `ID${Number(idMatch[0])}` : String(item.id || '').toUpperCase();
        const thumb = this.characterThumbnailById && this.characterThumbnailById.get(thumbId);
        const ready = !!(thumb && this.textures.exists(thumb.key) && this.textures.get(thumb.key).has(thumb.frame));
        if (ready) {
          if (!row.preview || !row.preview.active) {
            row.preview = this.add.image(0, 0, thumb.key, thumb.frame)
              .setDepth(24 + pickerDepthOffset).setOrigin(0.5, 0.5);
            this.mItems.push(row.preview);
          }
          const frame = this.textures.get(thumb.key).get(thumb.frame);
          const fw = frame ? Number(frame.width) : Number(thumb.width);
          const fh = frame ? Number(frame.height) : Number(thumb.height);
          const scale = Math.min(row.thumbBox.w / Math.max(1, fw || 64), row.thumbBox.h / Math.max(1, fh || 64));
          row.preview.setTexture(thumb.key, thumb.frame)
            .setDepth(24 + pickerDepthOffset)
            .setPosition(row.thumbBox.x + row.thumbBox.w / 2, row.thumbBox.y + row.thumbBox.h / 2)
            .setScale(scale).setVisible(true);
          if (row.thumbFallback && row.thumbFallback.active) row.thumbFallback.setVisible(false);
        } else {
          if (!row.thumbFallback || !row.thumbFallback.active) {
            row.thumbFallback = this.add.text(0, 0, '', { ...textStyle(16, '#3d3024'), align: 'center' })
              .setOrigin(0.5).setDepth(24 + pickerDepthOffset);
            this.mItems.push(row.thumbFallback);
          }
          row.thumbFallback.setText(String(item.id))
            .setDepth(24 + pickerDepthOffset)
            .setPosition(row.thumbBox.x + row.thumbBox.w / 2, row.thumbBox.y + row.thumbBox.h / 2)
            .setVisible(true);
          if (row.preview && row.preview.active) row.preview.setVisible(false);
        }
        row.renderedIndex = idx;
        row.previewItemId = String(item.id);
      });
  
      this.characterMenuScrollbar?.update();
      if (this.charSelectButton && this.charSelectButton.active) {
        const canSelect = this.charSelected >= 0 && !!defs[this.charSelected];
        this.charSelectButton.setAlpha(canSelect ? 0.24 : 0.001);
      }
    },
    normalizeMeguId(value) {
      return String(value == null ? '' : value)
        .replace(/^ID/i, '').replace(/\D/g, '').replace(/^0+/, '') || '0';
    },
    findCharacterIndexById(id) {
      const wanted = this.normalizeMeguId(id);
      return (this.characterDefs || []).findIndex(def => this.normalizeMeguId(def && def.id) === wanted);
    },
    recordMeguIdHistory(...ids) {
      const history = Array.isArray(GAME_ATTRIBUTES.pastPetIds) ? GAME_ATTRIBUTES.pastPetIds.slice() : [];
      const seen = new Set(history.map(value => String(value).toUpperCase()));
      ids.forEach(value => {
        const id = String(value == null ? '' : value).trim();
        if (!id) return;
        const key = id.toUpperCase();
        if (!seen.has(key)) { history.push(id); seen.add(key); }
      });
      GAME_ATTRIBUTES.pastPetIds = history;
      return history;
    },
    switchMeguById(id, reason = 'character change', cost = {}) {
      const nextIndex = this.findCharacterIndexById(id);
      if (nextIndex < 0) {
        console.warn(`[MEGU] Cannot ${reason}: character ID ${id} is not available in the loaded character roster.`);
        return false;
      }
      const nextDef = this.characterDefs[nextIndex];
      const nextId = String(nextDef.id);
      const currentDef = this.characterDefs[getCharacterIndex(this.characterDefs)] || null;
      if (currentDef && this.normalizeMeguId(currentDef.id) === this.normalizeMeguId(nextId)) return false;
  
      // Evolution and devolution use the dedicated 17-second transformation scene.
      if (reason === 'evolve' || reason === 'devolve' || reason === 'superDevolve') {
        return this.startEvolutionTransition(nextIndex, reason, cost);
      }
  
      this.characterMenuBgmShouldResume = !!(this.audioUnlocked || (this.bgmSound && this.bgmSound.isPlaying));
      this.pendingCharacterBgmResume = true;
      if (this.bgmSound && this.bgmSound.isPlaying) this.bgmSound.stop();
      if (this.characterChangingSound && this.characterChangingSound.isPlaying) this.characterChangingSound.stop();
      if (this.characterCompleteSound) this.playMenuSound(this.characterCompleteSound, this.sfxVolume);
  
      this.recordMeguIdHistory(currentDef && currentDef.id, nextId);
      GAME_ATTRIBUTES.petId = nextId;
      GAME_ATTRIBUTES.shiny = false;
      this.applyCurrentMeguWeightBounds();
      save();
      this.updateGameAttributeDisplay();
  
      if (this.meguRenderer) this.meguRenderer.setBodyVisible(false);
      if (this.meguRenderer) this.meguRenderer.setEyesVisible(false);
      this.requestCharacterAtlas(nextDef, true);
      if (this.textures.exists(nextId) && this.pendingCharacterBgmResume && this.activeCharacterTextureKey !== nextId) {
        this.pendingCharacterBgmResume = false;
        this.resumeBgmAfterCharacterMenu();
      }
      return true;
    },
    applyCharacterSelection() {
      if (this.charSelected < 0 || !this.characterDefs[this.charSelected]) return;
      const selectedId = String(this.characterDefs[this.charSelected].id);
      const isSuperDevolution = this.characterMenuMode === 'superDevolution';
      if (isSuperDevolution) {
        const quantity = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.superDevoMedicine) || 0));
        if (quantity <= 0) {
          this.showTopMessage('You need Super Devolution Medicine');
          this.toggleMenu(false);
          return;
        }
        // Close the picker first; toggleMenu(false) restores the complete roster
        // so the normal evolution transition can resolve the selected ID.
        this.toggleMenu(false);
        this.switchMeguById(selectedId, 'superDevolve', { itemKey: 'superDevoMedicine' });
        return;
      }
  
      const actualIndex = this.characterDefs.findIndex(item => String(item.id) === selectedId);
      if (actualIndex < 0) return;
      const currentDef = this.characterDefs[getCharacterIndex(this.characterDefs)] || null;
      const changed = !currentDef || String(currentDef.id) !== selectedId;
      this.toggleMenu(false);
      if (!changed) return;
  
      // Super Evolution consumes one Super Voltamin only after a different
      // character successfully completes the transformation.
      const superVoltamin = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.superVoltamin) || 0));
      if (superVoltamin <= 0) {
        this.showTopMessage('You need Super Voltamin');
        return;
      }
      this.switchMeguById(selectedId, 'evolve', { itemKey: 'superVoltamin' });
    },
    pop(txt, x, y, color) {
      x = this.pet.x + (x - W / 2);
      y = Number.isFinite(Number(y)) ? Number(y) : this.pet.y - 100;
      const t = this.add.text(x, y, txt, { fontFamily: 'sans-serif', fontSize: '36px', color: color || '#ff5c8a' }).setOrigin(0.5).setDepth(3);
      this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    }
});
