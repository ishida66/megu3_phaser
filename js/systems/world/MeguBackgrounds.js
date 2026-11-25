/* ===== Merged from MeguBackgroundCatalogSetup.js ===== */
// Extracted from Main.create(); initialization order is preserved at each call site.
Object.assign(Main.prototype, {
  initializeBackgroundCatalog() {
      // The description data is the sole source of background IDs and metadata.
      // Every application.house entry with an ID maps directly to
      // assets/background/ID{id}@2x.png; no separate background list is required.
      const backgroundSources = this.backgroundDescriptionRows
        .filter(row => row && row.id != null)
        .map(row => ({ id: String(row.id), name: null }));

      const seenBackgroundIds = new Set();
      backgroundSources.forEach(entry => {
        const digits = String(entry.id || '').match(/(?:^ID)?(\d+)$/i);
        if (!digits) return;
        const houseId = String(Number(digits[1]));
        if (seenBackgroundIds.has(houseId)) return;
        seenBackgroundIds.add(houseId);
        const fallbackName = entry.name || ('House ' + houseId);
        const displayName = this.localizedName
          ? this.localizedName(this.backgroundNamesById || new Map(), houseId, fallbackName)
          : fallbackName;
        const assetPath = `assets/background/ID${houseId}@2x.png`;
        // Stable ID-based key. Only the active background is loaded at full resolution.
        const key = 'room-background-' + houseId;
        BG.push({ name: displayName, id: houseId, key, path: assetPath, index: BG.length });
      });
      this.backgroundMenuDefs = BG.slice().sort((a, b) => {
        const an = Number(a.id), bn = Number(b.id);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      });
      const equippedBackground = BG[Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.bg) || 0, 0, Math.max(0, BG.length - 1))];
      if (equippedBackground) {
        if (!Array.isArray(GAME_ATTRIBUTES.unlocked_backgrounds)) GAME_ATTRIBUTES.unlocked_backgrounds = [];
        if (!GAME_ATTRIBUTES.unlocked_backgrounds.map(String).includes(String(equippedBackground.id))) {
          GAME_ATTRIBUTES.unlocked_backgrounds.push(String(equippedBackground.id));
          save();
        }
      }
  }
});

/* ===== Merged from MeguBackgroundLoadingSetup.js ===== */
// Extracted from Main.create(); initialization order is preserved at each call site.
Object.assign(Main.prototype, {
  initializeInitialBackgroundLoading() {
      // Background-menu thumbnails are generated on demand from the exact background
      // PNG path and kept in a small LRU cache. This avoids loading every full-size
      // background into the Phaser texture manager just to populate the picker.
      this.backgroundThumbnailCache = new Map(); // texture key -> { id, lastUsed }
      this.backgroundThumbnailPending = new Map(); // id -> queued/in-flight task
      this.backgroundThumbnailFailures = new Set(); // avoid retry loops for missing background files
      this.backgroundThumbnailQueue = [];
      this.backgroundThumbnailInFlight = 0;
      this.backgroundThumbnailUseClock = 0;
      this.backgroundThumbnailCacheLimit = 12;
      this.backgroundThumbnailConcurrency = 2;
      this.backgroundApplyPendingKey = null;

      const initialBgIndex = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.bg) || 0, 0, Math.max(0, BG.length - 1));
      const initialBackground = BG[initialBgIndex] || BG[0] || null;
      this.activeBackgroundKey = initialBackground ? initialBackground.key : null;
      // The first preload batch has already loaded manifests, UI art and sounds.
      // Keep the splash through this second batch, which brings in the active room
      // background and active MEGU atlas. Catalog thumbnails and other furniture/food
      // assets remain lazy-loaded on demand to preserve the memory optimizations.
      this._initialSplashLoadComplete = false;
      this._initialSplashSceneReady = false;
      this.tryDismissInitialSplash = () => {
        if (!this._initialSplashLoadComplete || !this._initialSplashSceneReady) return;
        const gate = typeof window !== 'undefined' ? window.__meguSplashGate : null;
        if (gate && typeof gate.markGameReady === 'function') gate.markGameReady();
      };
      // Do not dismiss the splash just because Phaser's queue is empty. Verify
      // that every asset needed to render this saved room is actually available.
      this.load.once('complete', () => this.checkInitialRoomAssets(0));
      if (initialBackground) this.load.image(initialBackground.key, initialBackground.path);
      this.load.once('complete', () => {
        if (!BG.length || !this.roomBg) return;
        const preferred = initialBackground;
        const usable = (preferred && this.textures.exists(preferred.key) ? preferred : null) || BG.find(item => this.textures.exists(item.key));
        if (usable) {
          this.roomBg.setTexture(usable.key).setDisplaySize(640, 640).setVisible(true);
          this.activeBackgroundKey = usable.key;
          const actualIndex = BG.findIndex(item => item.id === usable.id);
          if (actualIndex >= 0 && actualIndex !== Number(GAME_ATTRIBUTES.bg)) { GAME_ATTRIBUTES.bg = actualIndex; save(); }
        }
      });
      this.roomBg = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDisplaySize(640, 640).setDepth(-2);
      this.roomBg.setVisible(false);
      // Initial pass loads the active character plus shared UI and only the chosen full-resolution background.
      this.load.start();
  }
});

/* ===== Merged from MeguBackgrounds.js ===== */
// Background selection, store, and thumbnail lifecycle for the Main scene.
// Loaded after game.js; methods retain Main scene context through prototype mixin.

Object.assign(Main.prototype, {
  toggleBg(open, storeMode = false) {
      if (open) {
        if (!this.openStandardPicker('bOpen')) return;
        this.backgroundStoreMode = !!storeMode;
        const unlocked = new Set((GAME_ATTRIBUTES.unlocked_backgrounds || []).map(String));
        this.backgroundMenuDefs = (BG || []).filter(item => {
          const row = (this.backgroundDescriptionRows || []).find(entry => String(entry.id).replace(/^ID/i, '').replace(/^0+/, '') === String(item.id).replace(/^0+/, '')) || {};
          const owned = unlocked.has(String(item.id));
          if (this.backgroundStoreMode) return !owned && Number(row.not_sale || 0) !== 1 && Number(row.level || 0) <= Number(GAME_ATTRIBUTES.level || 1);
          return owned;
        }).sort((a,b) => Number(a.id)-Number(b.id));
        const currentBackground = BG[Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.bg) || 0, 0, Math.max(0, BG.length - 1))];
        const selectedMenuIndex = currentBackground
          ? this.backgroundMenuDefs.findIndex(item => item.id === currentBackground.id)
          : -1;
        this.bScroll = selectedMenuIndex >= 0
          ? Math.floor(selectedMenuIndex / this.bVisibleRows) * this.bVisibleRows
          : 0;
        this.bSel = -1;
        this.bPress = null;
        this.bScrollScope = this.createUiResourceScope();
        this.buildBackgroundMenu();
        return;
      }
      if (this.bScrollScope) { this.bScrollScope.destroy(); this.bScrollScope = null; }
      this.closeStandardPicker('bOpen', 'bMenuObjects', ['bPress', 'bScrollbarPress']);
      this.backgroundStoreMode = false;
      // Closing/canceling the picker cancels any not-yet-applied background choice.
      this.backgroundPendingSelection = null;
      if (this.bSelectButton && this.bSelectButton.active) this.bSelectButton.setInteractive().setAlpha(1);
      // Shared lifecycle has disabled and destroyed all background picker objects.
      this.bRowsUI = [];
      this.bSelectButton = null;
      this.bCancelButton = null;
      this.bSelectLabel = null;
      this.bScrollLabel = null;
      this.bScrollTrack = null;
      this.bScrollTrackHit = null;
      this.bScrollThumb = null;
      this.bSharedScrollbar = null;
      this.bMenuBackground = null;
    },

  buildBackgroundMenu() {
      const add = (o, depth = 20) => {
        if (o && o.setDepth) o.setDepth(depth);
        if (o && o.setVisible) o.setVisible(true);
        this.bMenuObjects.push(o);
        if (this.bScrollScope) this.bScrollScope.add(o);
        return o;
      };
  
      // Background menu uses its provided artwork, matching the Food menu layout.
      // A full-screen interactive base prevents room clicks leaking through.
      if (this.textures.exists('menu-house')) {
        this.bMenuBackground = add(
          this.add.image(0, 0, 'menu-house').setOrigin(0, 0).setDisplaySize(W, H)
            .setInteractive({ useHandCursor: false }), 20
        );
      } else {
        this.bMenuBackground = add(
          this.add.rectangle(W / 2, H / 2, W, H, 0x382e2a, 0.98)
            .setInteractive({ useHandCursor: false }), 20
        );
      }
  
      // Coordinates are doubled to match the menu artwork's 2x design scale.
      // Thumbnails are 122x122; description boxes use the matching doubled geometry.
      const rowLayouts = [
        { thumb: { x: 32, y: 174, w: 122, h: 122 }, desc: { x: 168, y: 178, w: 444, h: 118 } },
        { thumb: { x: 32, y: 300, w: 122, h: 122 }, desc: { x: 168, y: 302, w: 444, h: 118 } },
        { thumb: { x: 32, y: 424, w: 122, h: 122 }, desc: { x: 168, y: 426, w: 444, h: 118 } }
      ];
      this.bRowsUI = [];
      for (let i = 0; i < rowLayouts.length; i++) {
        const layout = rowLayouts[i];
        const top = layout.thumb.y;
        const thumbBox = layout.thumb;
        const descBox = layout.desc;
        const cy = top + thumbBox.h / 2;
        // Selection bar begins at x=16 and spans 289px, as requested.
        const rc = add(this.add.rectangle(32 + 578 / 2, descBox.y + descBox.h / 2, 578, descBox.h, 0xffd34f, 0.001)
          .setStrokeStyle(1, 0xffd34f, 0).setInteractive({ useHandCursor: true }), 22);
        const nm = add(this.add.text(descBox.x, descBox.y, '', textStyle(24, '#3d3024'))
          .setOrigin(0, 0).setWordWrapWidth(descBox.w), 24);
        const detail = add(this.add.text(descBox.x, descBox.y + 36, '', textStyle(16, '#3d3024'))
          .setOrigin(0, 0).setWordWrapWidth(descBox.w), 24);
        const price = add(this.add.text(descBox.x + 22, descBox.y + 88, '', textStyle(16, '#f28b22'))
          .setOrigin(0, 0).setVisible(false), 24);
        const hold = add(this.add.text(descBox.x + 118, descBox.y + 88, '', textStyle(14, '#438dc9'))
          .setOrigin(0, 0).setVisible(false), 24);
        const goldMark = add(this.add.image(descBox.x + 9, descBox.y + 96, 'gold-icon')
          .setDisplaySize(18, 18).setOrigin(0.5).setVisible(false), 24);
        const row = { rc, nm, detail, price, hold, stats: null, goldMark, preview: null, previewKey: null, previewItemId: null, top, cy, renderedIndex: -1, thumbBox, descBox };
        MeguScrollableMenu.bindRow(this, this.bScrollScope, rc, {
          getIndex: () => this.bScroll + i,
          getCount: () => (this.backgroundMenuDefs || []).length,
          getScroll: () => this.bScroll,
          setScroll: value => { this.bScroll = value; this.updateBackgroundMenu(); },
          onSelect: index => { this.bSel = index; this.updateBackgroundMenu(); },
          visible: this.bVisibleRows, rowHeight: 124
        });
        this.bRowsUI.push(row);
      }
  
      // Scrollbar visual/reference exactly follows the Food menu coordinates.
      // Shared Background-standard scrollbar; its listeners and objects are scope-owned.
      this.bSharedScrollbar = MeguScrollableMenu.createScrollbar(this, {
        scope: this.bScrollScope,
        add: object => add(object, object.depth),
        getCount: () => (this.backgroundMenuDefs || []).length,
        getIndex: () => this.bScroll,
        setIndex: value => { this.bScroll = value; this.updateBackgroundMenu(); },
        visible: this.bVisibleRows,
        wheel: false, // The scene's existing wheel handler owns this picker.
        depth: 22
      });
      this.bScrollTrack = this.bSharedScrollbar.track;
      this.bScrollTrackHit = this.bSharedScrollbar.hit;
      this.bScrollThumb = this.bSharedScrollbar.thumb;

  
      const buttonHitbox = (x, y, width, height, action) => {
        const rect = add(this.add.rectangle(x + width / 2, y + height / 2, width, height, 0xffd34f, 0.001)
          .setInteractive({ useHandCursor: true }), 30);
        rect.on('pointerover', () => rect.setFillStyle(0xffd34f, 0.14));
        rect.on('pointerout', () => rect.setFillStyle(0xffd34f, 0.001));
        rect.on('pointerdown', (pointer, localX, localY, event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          action();
        });
        return rect;
      };
  
      // Artwork carries the button labels; use invisible hitboxes at the requested coordinates.
      this.bSelectButton = buttonHitbox(549, 633, 59, 49, () => this.backgroundStoreMode ? this.purchaseSelectedBackground() : this.applyBackgroundSelection());
      this.bSelectLabel = null;
      this.bCancelButton = buttonHitbox(478, 633, 65, 49, () => this.toggleBg(false));
      this.bScrollLabel = null;
      this.updateBackgroundMenu();
    },

  updateBackgroundMenu() {
      if (!this.bOpen || !this.bRowsUI.length) return;
      const defs = this.backgroundMenuDefs || [];
      const maxScroll = Math.max(0, defs.length - this.bVisibleRows);
      this.bScroll = Phaser.Math.Clamp(this.bScroll, 0, maxScroll);
      this.bRowsUI.forEach((row, i) => {
        const idx = this.bScroll + i;
        const item = defs[idx];
        row.rc.setVisible(!!item);
        row.nm.setVisible(!!item);
        if (!item) {
          row.detail.setVisible(false);
          if (row.preview) row.preview.setVisible(false);
          row.renderedIndex = -1;
          row.previewItemId = null;
          return;
        }
        const id = String(item.id);
        const record = this.localizedRecord(this.backgroundRecordsById, item.id);
        const name = record.name || item.name || `House ${item.id}`;
        // Display the source description from application.house[].strings in the
        // selected language directly beneath the localized house name.
        const detail = record.detail || item.detail || '';
        row.detail.setVisible(!!detail);
        row.rc.setFillStyle(0xffd34f, idx === this.bSel ? 0.16 : 0.001);
        row.rc.setStrokeStyle(idx === this.bSel ? 3 : 1, 0xffd34f, idx === this.bSel ? 0.98 : 0);
        const metadata = (this.backgroundDescriptionRows || []).find(entry => String(entry.id).replace(/^ID/i, '').replace(/^0+/, '') === id.replace(/^0+/, '')) || {};
        const isUnlocked = (GAME_ATTRIBUTES.unlocked_backgrounds || []).map(String).includes(id);
        row.price.setVisible(!!item && this.backgroundStoreMode && !isUnlocked);
        row.goldMark.setVisible(!!item && this.backgroundStoreMode && !isUnlocked);
        if (this.backgroundStoreMode && !isUnlocked) row.price.setText(String(Math.max(0, Math.trunc(Number(metadata.price) || 0))));
        if (row.renderedIndex !== idx || row.renderedStoreMode !== this.backgroundStoreMode) {
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
          row.renderedStoreMode = this.backgroundStoreMode;
        }
        if (row.previewItemId !== id) {
          if (row.preview) row.preview.setVisible(false);
          row.previewItemId = id;
        }
        this.ensureBackgroundThumbnail(item, row, idx);
      });
  
      if (this.bSharedScrollbar) this.bSharedScrollbar.update();
  
      const canSelect = this.bSel >= 0 && !!defs[this.bSel] && !this.backgroundApplyPendingKey;
      if (this.bSelectButton && this.bSelectButton.active) this.bSelectButton.setAlpha(canSelect ? 0.24 : 0.001);
    },

  isBackgroundThumbnailVisible(id) {
      const target = String(id);
      return !!this.bOpen && (this.bRowsUI || []).some(row =>
        row && row.renderedIndex >= 0 && String(row.previewItemId) === target);
    },

  ensureBackgroundThumbnail(item, row, index) {
      if (!item || !row) return;
      const id = String(item.id);
      const key = `background-thumb-${id}`;
      const cached = this.backgroundThumbnailCache && this.backgroundThumbnailCache.get(key);
      if (this.textures.exists(key)) {
        if (cached) cached.lastUsed = ++this.backgroundThumbnailUseClock;
        else this.backgroundThumbnailCache.set(key, { id, lastUsed: ++this.backgroundThumbnailUseClock });
        this.showBackgroundThumbnail(item, key);
        return;
      }
      if (this.backgroundThumbnailFailures.has(id) || this.backgroundThumbnailPending.has(id)) return;
      const task = { id, key, item };
      this.backgroundThumbnailPending.set(id, task);
      this.backgroundThumbnailQueue.push(task);
      this.pumpBackgroundThumbnailQueue();
    },

  pumpBackgroundThumbnailQueue() {
      if (!this.backgroundThumbnailQueue) return;
      while (this.backgroundThumbnailInFlight < this.backgroundThumbnailConcurrency && this.backgroundThumbnailQueue.length) {
        const task = this.backgroundThumbnailQueue.shift();
        if (!this.isBackgroundThumbnailVisible(task.id)) {
          this.backgroundThumbnailPending.delete(task.id);
          continue;
        }
        this.backgroundThumbnailInFlight++;
        this.loadBackgroundThumbnailSource(task.item).then(sourceInfo => {
          try {
            if (!sourceInfo || !sourceInfo.image) {
              this.backgroundThumbnailFailures.add(task.id);
            }
            if (sourceInfo && sourceInfo.image && this.isBackgroundThumbnailVisible(task.id) && !this.textures.exists(task.key)) {
              const canvasTexture = this.textures.createCanvas(task.key, 122, 122);
              if (canvasTexture) {
                const ctx = canvasTexture.getContext();
                const source = sourceInfo.image;
                const sourceW = Math.max(1, source.naturalWidth || source.width || 1);
                const sourceH = Math.max(1, source.naturalHeight || source.height || 1);
                const scale = Math.min(122 / sourceW, 122 / sourceH);
                const drawW = Math.max(1, sourceW * scale);
                const drawH = Math.max(1, sourceH * scale);
                ctx.clearRect(0, 0, 122, 122);
                ctx.imageSmoothingEnabled = true;
                if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(source, (122 - drawW) / 2, (122 - drawH) / 2, drawW, drawH);
                canvasTexture.refresh();
                this.backgroundThumbnailCache.set(task.key, { id: task.id, lastUsed: ++this.backgroundThumbnailUseClock });
                this.showBackgroundThumbnail(task.item, task.key);
                this.trimBackgroundThumbnailCache();
              }
            }
          } catch (error) {
            console.warn('Could not create background thumbnail for ID' + task.id, error);
          } finally {
            if (sourceInfo && sourceInfo.temporary && sourceInfo.image) {
              sourceInfo.image.onload = null;
              sourceInfo.image.onerror = null;
              sourceInfo.image.src = '';
            }
            this.backgroundThumbnailPending.delete(task.id);
            this.backgroundThumbnailInFlight = Math.max(0, this.backgroundThumbnailInFlight - 1);
            // If a row was recycled while the request was active, re-queue only if
            // this background is visible now (the normal row update may have skipped it).
            (this.bRowsUI || []).forEach(row => {
              if (row && row.renderedIndex >= 0 && row.previewItemId != null && !this.backgroundThumbnailCache.has(`background-thumb-${row.previewItemId}`)) {
                const visibleItem = this.backgroundMenuDefs[row.renderedIndex];
                if (visibleItem && !this.backgroundThumbnailFailures.has(String(visibleItem.id)) && !this.backgroundThumbnailPending.has(String(visibleItem.id))) {
                  const visibleKey = `background-thumb-${visibleItem.id}`;
                  if (!this.textures.exists(visibleKey)) {
                    const visibleTask = { id: String(visibleItem.id), key: visibleKey, item: visibleItem };
                    this.backgroundThumbnailPending.set(visibleTask.id, visibleTask);
                    this.backgroundThumbnailQueue.push(visibleTask);
                  }
                }
              }
            });
            this.pumpBackgroundThumbnailQueue();
          }
        }).catch(error => {
          console.warn('Could not load background thumbnail for ID' + task.id, error);
          this.backgroundThumbnailPending.delete(task.id);
          this.backgroundThumbnailInFlight = Math.max(0, this.backgroundThumbnailInFlight - 1);
          this.pumpBackgroundThumbnailQueue();
        });
      }
    },

  loadBackgroundThumbnailSource(item) {
      // Reuse the active full-size background's already-decoded image when possible.
      if (item && this.textures.exists(item.key)) {
        const texture = this.textures.get(item.key);
        const image = texture && texture.getSourceImage ? texture.getSourceImage() : null;
        if (image) return Promise.resolve({ image, temporary: false });
      }
      return new Promise(resolve => {
        let image;
        try { image = new Image(); } catch (error) { resolve(null); return; }
        image.decoding = 'async';
        image.onload = () => resolve({ image, temporary: true });
        image.onerror = () => resolve(null);
        let src = item.path;
        try { src = new URL(item.path, document.baseURI).href; } catch (e) {}
        image.src = src;
      });
    },

  showBackgroundThumbnail(item, key) {
      if (!this.bOpen || !this.bRowsUI) return;
      (this.bRowsUI || []).forEach(row => {
        if (!row || row.renderedIndex < 0 || String(row.previewItemId) !== String(item.id)) return;
        if (!row.preview) {
          row.preview = this.add.image(row.thumbBox.x + row.thumbBox.w / 2, row.cy, key).setDepth(23);
          this.bMenuObjects.push(row.preview);
          if (this.bScrollScope) this.bScrollScope.add(row.preview);
        } else if (row.previewKey !== key) {
          row.preview.setTexture(key);
        }
        row.previewKey = key;
        row.preview.setTexture(key)
          .setPosition(row.thumbBox.x + row.thumbBox.w / 2, row.cy)
          .setDisplaySize(row.thumbBox.w, row.thumbBox.h).setDepth(23).setVisible(true);
      });
    },

  trimBackgroundThumbnailCache() {
      const cache = this.backgroundThumbnailCache;
      if (!cache || cache.size <= this.backgroundThumbnailCacheLimit) return;
      const visibleIds = new Set((this.bRowsUI || [])
        .filter(row => row && row.renderedIndex >= 0 && row.previewItemId != null)
        .map(row => String(row.previewItemId)));
      const entries = Array.from(cache.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (const [key, data] of entries) {
        if (cache.size <= this.backgroundThumbnailCacheLimit) break;
        if (visibleIds.has(String(data.id))) continue;
        (this.bRowsUI || []).forEach(row => {
          if (row && row.previewKey === key) {
            row.previewKey = null;
            // Detach the hidden menu preview before attempting to evict its texture.
            if (row.preview) row.preview.setVisible(false).setTexture('__DEFAULT');
          }
        });
        this.removeTextureIfUnused(key);
        cache.delete(key);
      }
    },

  purchaseSelectedBackground() {
      const item = this.backgroundMenuDefs[this.bSel];
      if (!item || !this.backgroundStoreMode) return;
      const id = String(item.id);
      const metadata = (this.backgroundDescriptionRows || []).find(entry => String(entry.id).replace(/^ID/i, '').replace(/^0+/, '') === id.replace(/^0+/, '')) || {};
      const price = Math.max(0, Math.trunc(Number(metadata.price) || 0));
      if ((GAME_ATTRIBUTES.unlocked_backgrounds || []).map(String).includes(id)) return;
      if (Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.gold) || 0)) < price) {
        this.showMeguMessage('Not enough gold.', false, 0, true);
        return;
      }
      this.changeGold(-price);
      if (!Array.isArray(GAME_ATTRIBUTES.unlocked_backgrounds)) GAME_ATTRIBUTES.unlocked_backgrounds = [];
      GAME_ATTRIBUTES.unlocked_backgrounds.push(id);
      GAME_ATTRIBUTES.unlocked_backgrounds = [...new Set(GAME_ATTRIBUTES.unlocked_backgrounds.map(String))];
      save();
      this.updateGameAttributeDisplay();
      this.showHouseMoveConfirmation(item);
    },

  showHouseMoveConfirmation(item) {
      if (this.houseMovePopupObjects) this.houseMovePopupObjects.forEach(object => object && object.destroy && object.destroy());
      const objects = [];
      const add = object => { objects.push(object); return object; };
      add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.62).setDepth(80).setInteractive());
      add(this.add.rectangle(W / 2, H / 2, 430, 190, 0xfff0c8, 1).setStrokeStyle(5, 0x8a6241).setDepth(81));
      add(this.add.text(W / 2, H / 2 - 42, 'lets move to the new house?', textStyle(23, '#493526')).setOrigin(0.5).setDepth(82));
      const yes = add(this.add.rectangle(W / 2 - 85, H / 2 + 45, 112, 48, 0x79b96a, 1).setStrokeStyle(2, 0x476c3c).setDepth(82).setInteractive({useHandCursor:true}));
      add(this.add.text(yes.x, yes.y, 'Yes', textStyle(20, '#ffffff')).setOrigin(0.5).setDepth(83));
      const no = add(this.add.rectangle(W / 2 + 85, H / 2 + 45, 112, 48, 0xc47a72, 1).setStrokeStyle(2, 0x854a45).setDepth(82).setInteractive({useHandCursor:true}));
      add(this.add.text(no.x, no.y, 'No', textStyle(20, '#ffffff')).setOrigin(0.5).setDepth(83));
      const close = () => { objects.forEach(object => object && object.destroy && object.destroy()); this.houseMovePopupObjects = null; };
      yes.on('pointerdown', () => {
        close();
        const index = this.backgroundMenuDefs.findIndex(entry => String(entry.id) === String(item.id));
        if (index >= 0) this.bSel = index;
        this.backgroundStoreMode = false;
        this.applyBackgroundSelection();
      });
      no.on('pointerdown', () => { close(); this.toggleBg(false); });
      this.houseMovePopupObjects = objects;
    },

  applyBackgroundSelection() {
      const item = this.backgroundMenuDefs[this.bSel];
      if (!item || this.backgroundApplyPendingKey) return;
      const actualIndex = BG.findIndex(bg => bg.id === item.id);
      if (actualIndex < 0) return;
  
      const finishSelection = () => {
        // A user may cancel the picker while a background is loading. In that case
        // discard the newly loaded full-size texture rather than changing the room.
        if (!this.bOpen || String(this.backgroundPendingSelection) !== String(item.id)) {
          if (this.activeBackgroundKey !== item.key) this.removeTextureIfUnused(item.key);
          return;
        }
        if (!this.textures.exists(item.key)) {
          this.backgroundPendingSelection = null;
          this.backgroundApplyPendingKey = null;
          this.updateBackgroundMenu();
          return;
        }
        const oldKey = this.activeBackgroundKey;
        const oldBackground = BG.find(bg => bg.key === oldKey) || BG[Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.bg) || 0, 0, Math.max(0, BG.length - 1))] || null;
        const previousBackgroundId = oldBackground ? String(oldBackground.id) : '';
        this.roomBg.setTexture(item.key).setOrigin(0, 0).setDisplaySize(640, 640).setVisible(true);
        this.activeBackgroundKey = item.key;
        GAME_ATTRIBUTES.bg = actualIndex;
        save();
        if (previousBackgroundId !== String(item.id) && this.houseChangedSound) {
          if (this.houseChangedSound.isPlaying) this.houseChangedSound.stop();
          this.houseChangedSound.setVolume(this.sfxVolume);
          this.houseChangedSound.play();
        }
        this.backgroundPendingSelection = null;
        this.backgroundApplyPendingKey = null;
        if (this.bSelectButton && this.bSelectButton.active) this.bSelectButton.setInteractive();
        this.toggleBg(false);
        // Release the previous full-resolution texture only after the room has
        // switched. Its generated thumbnail, if cached, is a separate tiny texture.
        if (oldKey && oldKey !== item.key) {
          this.time.delayedCall(0, () => {
            if (this.activeBackgroundKey !== oldKey) this.removeTextureIfUnused(oldKey);
          });
        }
      };
  
      this.backgroundPendingSelection = String(item.id);
      if (this.textures.exists(item.key)) {
        finishSelection();
        return;
      }
  
      this.backgroundApplyPendingKey = item.key;
      if (this.bSelectButton && this.bSelectButton.active) this.bSelectButton.disableInteractive().setAlpha(0.5);
      const eventName = `filecomplete-image-${item.key}`;
      const onComplete = () => {
        this.load.off('loaderror', onError);
        this.backgroundApplyPendingKey = this.backgroundApplyPendingKey === item.key ? null : this.backgroundApplyPendingKey;
        if (this.bSelectButton && this.bSelectButton.active) this.bSelectButton.setInteractive();
        finishSelection();
      };
      const onError = file => {
        if (!file || file.key !== item.key) return;
        this.load.off(eventName, onComplete);
        this.load.off('loaderror', onError);
        if (this.backgroundApplyPendingKey === item.key) this.backgroundApplyPendingKey = null;
        if (String(this.backgroundPendingSelection) === String(item.id)) this.backgroundPendingSelection = null;
        if (this.bSelectButton && this.bSelectButton.active) this.bSelectButton.setInteractive().setAlpha(1);
        console.warn('Could not load background image: ' + item.path);
        this.updateBackgroundMenu();
      };
      this.load.once(eventName, onComplete);
      this.load.on('loaderror', onError);
      this.load.image(item.key, item.path);
      if (!(this.load.isLoading && this.load.isLoading())) this.load.start();
    }
});
