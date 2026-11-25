/* MeguHouseLayouts: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    readHouseLayoutSlots() {
      try {
        const parsed = JSON.parse(localStorage.getItem(HOUSE_LAYOUTS_KEY) || '[]');
        return Array.from({ length: HOUSE_LAYOUT_SLOT_COUNT }, (_, index) => {
          const slot = Array.isArray(parsed) ? parsed[index] : null;
          return slot && slot.version === 1 && Array.isArray(slot.furn) ? slot : null;
        });
      } catch (error) {
        console.warn('Could not read saved house layouts:', error);
        return Array(HOUSE_LAYOUT_SLOT_COUNT).fill(null);
      }
    },
    writeHouseLayoutSlots(slots) {
      try {
        localStorage.setItem(HOUSE_LAYOUTS_KEY, JSON.stringify(slots));
        return true;
      } catch (error) {
        console.warn('Could not store house layouts in this browser:', error);
        return false;
      }
    },
    makeHouseLayoutSnapshot() {
      return new Promise((resolve, reject) => {
        const capture = image => {
          try {
            const thumb = document.createElement('canvas');
            thumb.width = 160;
            thumb.height = 237;
            const context = thumb.getContext('2d');
            context.fillStyle = '#f4ead7';
            context.fillRect(0, 0, thumb.width, thumb.height);
            context.drawImage(image, 0, 0, thumb.width, thumb.height);
            resolve(thumb.toDataURL('image/jpeg', 0.58));
          } catch (error) { reject(error); }
        };
        try {
          const renderer = this.game && this.game.renderer;
          if (renderer && typeof renderer.snapshot === 'function') {
            renderer.snapshot(capture, 'image/jpeg', 0.58);
          } else {
            capture(this.game.canvas);
          }
        } catch (error) { reject(error); }
      });
    },
    downloadHouseLayoutFile(layout, slotIndex) {
      try {
        const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `megu-house-layout-${slotIndex + 1}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        console.warn('Could not export house layout file:', error);
      }
    },
    validateHouseLayout(layout) {
      if (!layout || layout.format !== 'kawaii-pet-megu-house-layout' || layout.version !== 1 || !Array.isArray(layout.furn)) return false;
      if (!layout.backgroundId || !BG.some(item => String(item.id) === String(layout.backgroundId))) return false;
      return layout.furn.every(item => item && typeof item === 'object' && Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)));
    },
    showLayoutMemoryMessage(message) {
      if (this.layoutMemoryMessage && this.layoutMemoryMessage.active) this.layoutMemoryMessage.destroy();
      this.layoutMemoryMessage = this.add.text(W / 2, 785, message, {
        fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#fff8df',
        backgroundColor: '#463b31', padding: { x: 10, y: 7 }, align: 'center',
        wordWrap: { width: 540 }
      }).setOrigin(0.5).setDepth(52).setScrollFactor(0);
      this.time.delayedCall(2600, () => {
        if (this.layoutMemoryMessage && this.layoutMemoryMessage.active) this.layoutMemoryMessage.destroy();
        this.layoutMemoryMessage = null;
      });
    },
    askHouseLayoutDescription(cardNumber, currentDescription = '') {
      // A DOM text field is used because Phaser canvas text cannot accept keyboard input.
      // The overlay stays above the canvas and prevents menu taps while editing.
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);font-family:Arial,sans-serif;';
        const panel = document.createElement('form');
        panel.style.cssText = 'box-sizing:border-box;width:min(90vw,420px);padding:22px;border:3px solid #8a6845;border-radius:12px;background:#f5e9d2;color:#59412c;box-shadow:0 8px 30px #0008;';
        const title = document.createElement('div');
        title.textContent = `MEMORY CARD ${cardNumber}`;
        title.style.cssText = 'font-weight:bold;font-size:22px;margin-bottom:10px;';
        const label = document.createElement('label');
        label.textContent = 'Save description (optional)';
        label.style.cssText = 'display:block;font-size:15px;margin-bottom:8px;';
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 80;
        input.value = currentDescription;
        input.placeholder = `MEMORY CARD ${cardNumber}`;
        input.autocomplete = 'off';
        input.style.cssText = 'box-sizing:border-box;width:100%;height:42px;padding:8px;border:2px solid #8a6845;border-radius:5px;background:white;color:#3e3024;font-size:17px;';
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;justify-content:flex-end;gap:12px;margin-top:18px;';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        const saveButton = document.createElement('button');
        saveButton.type = 'submit';
        saveButton.textContent = 'Save';
        for (const button of [cancel, saveButton]) button.style.cssText = 'padding:10px 20px;border:2px solid #8a6845;border-radius:6px;background:#fff7e5;color:#59412c;font-size:16px;font-weight:bold;cursor:pointer;';
        actions.append(cancel, saveButton);
        label.appendChild(input);
        panel.append(title, label, actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        let finished = false;
        const finish = value => {
          if (finished) return;
          finished = true;
          document.removeEventListener('keydown', onKey, true);
          overlay.remove();
          resolve(value);
        };
        const onKey = event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); }
          else event.stopPropagation();
        };
        document.addEventListener('keydown', onKey, true);
        cancel.addEventListener('click', () => finish(null));
        panel.addEventListener('submit', event => { event.preventDefault(); finish(input.value.trim() || `MEMORY CARD ${cardNumber}`); });
        overlay.addEventListener('pointerdown', event => event.stopPropagation());
        input.focus();
      });
    },
    openLayoutMemoryUi(mode) {
      const objects = this.beginFooterMenu({ closePickers: true });
      this.layoutMemoryMode = mode === 'save' ? 'save' : 'load';
      this.layoutMemoryScroll = Phaser.Math.Clamp(this.layoutMemoryScroll || 0, 0, Math.max(0, HOUSE_LAYOUT_SLOT_COUNT - 3));
      const scope = this.createFooterMenuScope(objects);
      const add = (object, depth = 43) => {
        object.setDepth(depth).setScrollFactor(0);
        objects.push(object);
        return object;
      };
      const shade = add(this.add.rectangle(W / 2, CANVAS_H / 2, W, CANVAS_H, 0x101018, .8).setInteractive(), 40);
      shade.on('pointerdown', (pointer, x, y, event) => event?.stopPropagation?.());
      // Shared 640x950 menu artwork; both actions use the same background.
      if (this.textures.exists('menu-layout')) {
        add(this.add.image(0, 0, 'menu-layout').setOrigin(0, 0), 41);
      } else {
        add(this.add.rectangle(320, CANVAS_H / 2, 620, CANVAS_H - 20, 0xf5e9d2).setStrokeStyle(3, 0x8a6845), 41);
      }
      const rowLayouts = MeguScrollableMenu.rows;
      const rowUis = [];
      const slots = this.readHouseLayoutSlots();
      let selected = -1;
      let busy = false;
      const render = () => {
        if (!scope.active) return;
        rowUis.forEach((row, i) => {
          const index = this.layoutMemoryScroll + i;
          const slot = slots[index];
          const visible = index < HOUSE_LAYOUT_SLOT_COUNT;
          row.all.forEach(object => object.setVisible(visible));
          if (!visible) return;
          row.hit.setFillStyle(selected === index ? 0xffd34f : 0xffffff, selected === index ? .25 : .001);
          row.name.setText(`MEMORY CARD ${index + 1}`);
          row.detail.setText(slot ? (slot.savedAt ? new Date(slot.savedAt).toLocaleString() : 'Date unavailable') : 'Not saved yet');
          row.info.setText(slot ? (slot.description || `MEMORY CARD ${index + 1}`) : '');
          row.preview.setTexture('__DEFAULT').setVisible(false);
          row.empty.setVisible(!slot?.thumbnail);
          if (slot?.thumbnail) {
            const url = slot.thumbnail;
            const img = new Image();
            img.onload = () => {
              if (!scope.active || this.layoutMemoryScroll + i !== index || slots[index]?.thumbnail !== url) return;
              const key = `layout-memory-thumb-${index}-${Date.now()}`;
              try {
                this.textures.addImage(key, img);
                row.preview.setTexture(key).setDisplaySize(80, 116).setVisible(true);
                row.empty.setVisible(false);
              } catch (e) { row.empty.setVisible(true); }
            };
            img.src = url;
          }
        });
        scrollbar.update();
      };
      for (let i = 0; i < 3; i++) {
        const layout = rowLayouts[i];
        const cy = layout.thumb.y + 61;
        const hit = add(this.add.rectangle(321, layout.desc.y + 59, 578, 118, 0xffffff, .001)
          .setInteractive({ useHandCursor: true }), 44);
        const preview = add(this.add.image(93, cy, '__DEFAULT').setDisplaySize(80, 116).setVisible(false), 45);
        const empty = add(this.add.text(93, cy, 'EMPTY', { fontFamily: 'Arial', fontSize: '14px', color: '#8e795f' }).setOrigin(.5), 45);
        const name = add(this.add.text(168, layout.desc.y + 6, '', { fontFamily: 'Arial', fontSize: '21px', fontStyle: 'bold', color: '#59412c' }), 45);
        const detail = add(this.add.text(168, layout.desc.y + 44, '', { fontFamily: 'Arial', fontSize: '16px', color: '#715b43' }), 45);
        const info = add(this.add.text(168, layout.desc.y + 80, '', { fontFamily: 'Arial', fontSize: '15px', color: '#715b43' }), 45);
        rowUis.push({ hit, preview, empty, name, detail, info, all: [hit, preview, empty, name, detail, info] });
        MeguScrollableMenu.bindRow(this, scope, hit, {
          getIndex: () => this.layoutMemoryScroll + i,
          getCount: () => HOUSE_LAYOUT_SLOT_COUNT,
          getScroll: () => this.layoutMemoryScroll,
          setScroll: value => { this.layoutMemoryScroll = value; render(); },
          onSelect: index => { selected = index; render(); void perform(); },
          visible: 3, rowHeight: 124
        });
      }
      const scrollbar = MeguScrollableMenu.createScrollbar(this, {
        scope, add: object => add(object, 46),
        getCount: () => HOUSE_LAYOUT_SLOT_COUNT,
        getIndex: () => this.layoutMemoryScroll,
        setIndex: value => { this.layoutMemoryScroll = value; render(); },
        visible: 3, depth: 46
      });
      const perform = async () => {
        if (busy || selected < 0) return;
        busy = true;
        if (this.layoutMemoryMode === 'load') {
          const slot = this.readHouseLayoutSlots()[selected];
          if (slot) await this.applyHouseLayout(slot);
          else this.showLayoutMemoryMessage('This memory card is empty.');
          busy = false;
          return;
        }
        const existing = this.readHouseLayoutSlots()[selected];
        if (existing && !window.confirm(`Overwrite memory card ${selected + 1}?`)) { busy = false; return; }
        const description = await this.askHouseLayoutDescription(selected + 1, existing?.description || '');
        if (description === null || !scope.active) { busy = false; return; }
        // Hide the modal while capturing the room snapshot, then restore it.
        const hidden = objects.filter(object => object?.active && typeof object.setVisible === 'function');
        hidden.forEach(object => object.setVisible(false));
        try {
          const thumb = await this.makeHouseLayoutSnapshot();
          const background = BG[Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.bg) || 0, 0, Math.max(0, BG.length - 1))];
          const layout = { format: 'kawaii-pet-megu-house-layout', version: 1,
            savedAt: new Date().toISOString(), description, backgroundId: background ? String(background.id) : '',
            furn: JSON.parse(JSON.stringify(GAME_ATTRIBUTES.furn || [])), thumbnail: thumb };
          const latest = this.readHouseLayoutSlots();
          latest[selected] = layout;
          if (!this.writeHouseLayoutSlots(latest)) throw new Error('Browser storage is full');
          this.downloadHouseLayoutFile(layout, selected);
          if (scope.active) {
            this.showLayoutMemoryMessage(`Memory card ${selected + 1} saved. JSON file exported.`);
            this.refreshLayoutMemoryUi();
          }
        } catch (error) {
          if (scope.active) this.showLayoutMemoryMessage('Could not save this layout. Browser storage may be full.');
        } finally {
          if (scope.active) hidden.forEach(object => { if (object?.active) object.setVisible(true); });
          busy = false;
        }
      };
      // No legacy footer buttons or title: the artwork and unified rows own the UI.
      // A transparent quit hit area uses the same placement as other unified pickers.
      const quit = add(this.add.zone(510, 657, 65, 49)
        .setInteractive({ useHandCursor: true }), 47);
      quit.on('pointerdown', (pointer, lx, ly, event) => {
        event?.stopPropagation?.();
        this.closeFooterMenu();
      });
      render();
    },
    refreshLayoutMemoryUi() {
      const mode = this.layoutMemoryMode;
      if (mode && this.footerMenuOpen) this.openLayoutMemoryUi(mode);
    },
    importHouseLayoutFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const layout = JSON.parse(await file.text());
          if (!this.validateHouseLayout(layout)) throw new Error('Invalid layout file');
          const slots = this.readHouseLayoutSlots();
          let index = slots.findIndex(slot => !slot);
          if (index < 0) {
            index = 0;
            if (!window.confirm('All memory cards are full. Replace memory card 1 with this file?')) return;
          }
          slots[index] = layout;
          if (!this.writeHouseLayoutSlots(slots)) throw new Error('Browser storage is full');
          this.refreshLayoutMemoryUi();
          this.showLayoutMemoryMessage(`Imported file into memory card ${index + 1}.`);
        } catch (error) {
          this.showLayoutMemoryMessage('Could not import this layout file.');
        }
      };
      input.click();
    },
    addCareMenuHotspot(objects, x, y, width, height, action) {
      // Care controls are fixed to the canvas, not the scrolling world. Keep
      // their hit areas in screen space and above the artwork/shade so clicks
      // always reach the intended action.
      const zone = this.add.zone(x + width / 2, y + height / 2, width, height)
        .setScrollFactor(0)
        .setDepth(34)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', (pointer, localX, localY, event) => {
        if (event && event.stopPropagation) event.stopPropagation();
        this.handleCareMenuAction(action);
      });
      objects.push(zone);
      return zone;
    },
    async applyHouseLayout(layout) {
      if (!this.validateHouseLayout(layout)) {
        this.showLayoutMemoryMessage('This layout file is invalid or uses an unknown house.');
        return;
      }
      const background = BG.find(item => String(item.id) === String(layout.backgroundId));
      if (!background) return;
      this.showLayoutMemoryMessage('Loading house layout…');
      const apply = () => {
        if (!this.textures.exists(background.key)) {
          this.showLayoutMemoryMessage('Could not load the house image.');
          return;
        }
        const previousBackgroundKey = this.activeBackgroundKey;
        this.roomBg.setTexture(background.key).setOrigin(0, 0).setDisplaySize(640, 640).setVisible(true);
        this.activeBackgroundKey = background.key;
        if (previousBackgroundKey !== background.key && this.houseChangedSound) {
          if (this.houseChangedSound.isPlaying) this.houseChangedSound.stop();
          this.houseChangedSound.setVolume(this.sfxVolume);
          this.houseChangedSound.play();
        }
        GAME_ATTRIBUTES.bg = BG.findIndex(item => String(item.id) === String(layout.backgroundId));
        GAME_ATTRIBUTES.furn = JSON.parse(JSON.stringify(layout.furn));
        // Food props reference transient food atlases; queue those before the next
        // render so imported layouts do not briefly degrade to fallback sprites.
        const requiredFoodAtlases = new Set(GAME_ATTRIBUTES.furn
          .filter(object => object && object.kind === 'food' && object.key)
          .map(object => String(object.key)));
        requiredFoodAtlases.forEach(key => {
          const atlas = this.findTransientAtlasConfig(key);
          if (atlas) this.loadTransientAtlas(atlas);
        });
        this.furnitureSprites.forEach(sprite => { if (sprite && sprite.active) sprite.destroy(); });
        this.furniturePositionLabels.forEach(label => { if (label && label.active) label.destroy(); });
        (this.furnitureAnimationFrameLabels || []).forEach(label => { if (label && label.active) label.destroy(); });
        this.furnitureSprites = [];
        this.furniturePositionLabels = [];
        this.furnitureAnimationFrameLabels = [];
        this.furnitureDepthOrder = [];
        this.furnitureDepthOrderInitialized = false;
        this.editIdx = -1;
        this.drag = null;
        this.syncFurnitureDepthOrderRanks();
        save();
        this.closeFooterMenu();
        this.showLayoutMemoryMessage('House layout loaded.');
        if (this.houseChangedSound) {
          if (this.houseChangedSound.isPlaying) this.houseChangedSound.stop();
          this.houseChangedSound.setVolume(this.sfxVolume);
          this.houseChangedSound.play();
        }
      };
      if (this.textures.exists(background.key)) {
        apply();
        return;
      }
      this.load.image(background.key, background.path || `assets/background/ID${background.id}@2x.png`);
      this.load.once('complete', apply);
      this.load.once('loaderror', file => {
        if (file && file.key === background.key) this.showLayoutMemoryMessage('Could not load the house image.');
      });
      this.load.start();
    },
});
