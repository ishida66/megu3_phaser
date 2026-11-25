/* MeguFurnitureInventory: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    getFurnitureInventoryCount(furnitureId) {
      return this.getStackedInventoryCount('furniture_store', furnitureId);
    },
    addFurnitureToInventory(furnitureId, quantity = 1, source = 'game') {
      return this.addStackedInventoryItem('furniture_store', furnitureId, quantity, source);
    },
    removeFurnitureFromInventory(furnitureId, quantity = 1) {
      return this.removeStackedInventoryItem('furniture_store', furnitureId, quantity);
    },
    toggleFurnitureStore() {
      this.toggleFurn(true, true);
    },
    toggleSpecialStore() {
      this.toggleFurn(true, false, false, true);
    },
    purchaseSelectedSpecialItem() {
      const item = (this.furnitureMenuDefs || [])[this.fSel];
      if (!item || !this.specialStoreMode) return;
      const price = Math.max(0, Math.trunc(Number(item.price) || 0));
      const gold = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.gold) || 0));
      if (gold < price) {
        if (this.fNoResultsLabel) this.fNoResultsLabel.setText('Not enough gold.').setVisible(true);
        return;
      }
      const inventoryKey = String(item.itemName || '');
      if (!inventoryKey) return;
      GAME_ATTRIBUTES[inventoryKey] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[inventoryKey]) || 0)) + 1;
      this.changeGold(-price);
      save();
      this.toggleFurn(false);
      this.closeFooterMenu();
    },
    purchaseSelectedFurniture() {
      const item = (this.furnitureMenuDefs || [])[this.fSel];
      if (!item || !this.furnitureStoreMode) return;
      const price = Math.max(0, Math.trunc(Number(item.price) || 0));
      const gold = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.gold) || 0));
      if (gold < price) {
        if (this.fNoResultsLabel) this.fNoResultsLabel.setText('Not enough gold.').setVisible(true);
        return;
      }
      this.changeGold(-price);
      this.addFurnitureToInventory(item.id, 1, 'store');
      if (this.isFurnitureNotForSale(item)) {
        const stock = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.furniture_shop_stock[String(item.id)]) || 0));
        if (stock <= 1) delete GAME_ATTRIBUTES.furniture_shop_stock[String(item.id)];
        else GAME_ATTRIBUTES.furniture_shop_stock[String(item.id)] = stock - 1;
        save();
      }
      this.toggleFurn(false);
      this.closeFooterMenu();
      this.completeStressAction('buyFurniture');
    },
    isFurnitureNotForSale(item) {
      return !!item && ['1', 'true', 'yes'].includes(String(item.not_sale == null ? '' : item.not_sale).trim().toLowerCase());
    },
    toggleFurnitureSell() {
      this.toggleFurn(true, false, true);
    },
    sellSelectedFurniture() {
      const item = (this.furnitureMenuDefs || [])[this.fSel];
      if (!item || !this.furnitureSellMode) return;
      const held = this.getFurnitureInventoryCount(item.id);
      if (held < 1) return;
      let quantity = 1;
      if (held > 1) {
        const requested = typeof window !== 'undefined' && typeof window.prompt === 'function'
          ? window.prompt(`How many ${item.name || 'of this furniture'} would you like to sell?\nYou have ${held}. Refund: ${Math.max(0, Math.trunc(Number(item.price) || 0))} gold each.`, '1')
          : null;
        if (requested === null || requested === undefined) return;
        const value = String(requested).trim();
        if (!/^\d+$/.test(value)) {
          if (this.fNoResultsLabel) this.fNoResultsLabel.setText('Please enter a whole number.').setVisible(true);
          return;
        }
        quantity = Number(value);
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > held) {
          if (this.fNoResultsLabel) this.fNoResultsLabel.setText(`Enter a quantity from 1 to ${held}.`).setVisible(true);
          return;
        }
      }
      const unitPrice = Math.max(0, Math.trunc(Number(item.price) || 0));
      const refund = unitPrice * quantity;
      if (!Number.isSafeInteger(refund)) return;
      if (!this.removeFurnitureFromInventory(item.id, quantity)) return;
      this.changeGold(refund);
      if (this.isFurnitureNotForSale(item)) {
        if (!GAME_ATTRIBUTES.furniture_shop_stock || typeof GAME_ATTRIBUTES.furniture_shop_stock !== 'object') GAME_ATTRIBUTES.furniture_shop_stock = {};
        const key = String(item.id);
        GAME_ATTRIBUTES.furniture_shop_stock[key] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.furniture_shop_stock[key]) || 0)) + quantity;
      }
      save();
      this.updateFurnitureMenu();
    },
    toggleFurn(open, storeMode = false, sellMode = false, specialStoreMode = false, giftMode = false) {
      if (open) {
        if (!this.openStandardPicker('fOpen', {
          prepare: !giftMode,
          allow: () => !this.visitingHouse || !!giftMode
        })) return;
        this.furnitureStoreMode = !!storeMode;
        this.furnitureSellMode = !!sellMode;
        this.specialStoreMode = !!specialStoreMode;
        this.giftPickerMode = giftMode ? (specialStoreMode ? 'special' : 'furniture') : null;
        this.fVisibleRows = 3;
        this.fRowHeight = 124;
        this.fScroll = 0;
        this.fSel = -1;
        this.fPress = null;
        this.fScrollbarPress = null;
        this.furnitureAtlasFailedThisOpen = new Set();
        this.fScrollScope = this.createUiResourceScope();
        this.buildFurnitureMenu();
        if (giftMode) this.setVisitorGiftPickerBlocking(true);
        return;
      }
      if (this.fScrollScope) { this.fScrollScope.destroy(); this.fScrollScope = null; }
      this.closeStandardPicker('fOpen', 'fMenuObjects', ['fPress', 'fScrollbarPress']);
      if (this.visitingHouse) this.setVisitorGiftPickerBlocking(false);
      this.furnitureStoreMode = false;
      this.furnitureSellMode = false;
      this.specialStoreMode = false;
      this.giftPickerMode = null;
      if (!this.foodOpen) { this.giftMode = null; this.giftTargetUserId = null; }
      // Shared lifecycle has disabled and destroyed all furniture picker objects.
      this.fRowsUI = [];
      this.fSelectButton = null;
      this.fSelectLabel = null;
      this.fScrollLabel = null;
      this.fScrollTrack = null;
      this.fScrollTrackHit = null;
      this.fScrollThumb = null;
      this.fSharedScrollbar = null;
      this.fMenuBackground = null;
      this.fCancelButton = null;
      this.fNoResultsLabel = null;
      this.furnitureMenuDefs = [];
      this.furnitureThumbnailInMenu = false;
      this.releaseUnneededFurnitureAtlases(new Set());
    },
    makeFurnitureDefinition(assetStem, id, width = 64, height = 64, thumbnailFrame = null) {
      const safeStem = String(assetStem || `KG${id}`).replace(/[^a-z0-9_-]/gi, '-');
      const numericId = String(id == null ? '' : id).match(/\d+/);
      const normalizedId = numericId ? String(Number(numericId[0])) : String(id);
      const record = this.furnitureRecordsById && this.furnitureRecordsById.get(normalizedId) || {};
      const canonicalStem = `KG${normalizedId}`;
      return {
        id: normalizedId,
        frameName: canonicalStem,
        assetStem: canonicalStem,
        assetKey: `furniture-image-${canonicalStem.replace(/[^a-z0-9_-]/gi, '-')}`,
        // Actual room props load this individual file directly. Thumbnail atlas
        // keys are referenced only when drawing rows in the furniture catalog.
        assetPath: `assets/furniture/${canonicalStem}@2x.png`,
        thumbnailKey: ART.furnitureThumbnailAtlases[0].key,
        thumbnailFrame,
        width: Number(width) || 64,
        height: Number(height) || 64,
        name: record.name || canonicalStem,
        detail: record.detail || '',
        jukeboxFlag: !!record.jukeboxFlag,
        boardFlag: !!record.boardFlag
      };
    },
    getFurnitureDefinitionForObject(object) {
      if (!object || object.kind === 'food') return null;
      let item = null;
      if (object.assetStem && this.furnitureDefsByStem) {
        item = this.furnitureDefsByStem.get(String(object.assetStem).toLowerCase()) || null;
      }
      if (!item && object.furnitureId != null && this.furnitureDefsById) {
        const digits = String(object.furnitureId).match(/\d+/);
        if (digits) item = this.furnitureDefsById.get(String(Number(digits[0]))) || null;
      }
      if (!item && object.id != null) {
        // Backward compatibility for saves from the old catalog, where id was an index.
        const legacyIndex = Number(object.id);
        if (Number.isInteger(legacyIndex) && legacyIndex >= 0) {
          const legacyId = String(legacyIndex + 1);
          item = this.furnitureDefsById && this.furnitureDefsById.get(legacyId) || null;
          if (!item) item = this.makeFurnitureDefinition(`KG${legacyId}`, legacyId, 64, 64);
        }
      }
      return item;
    },
    buildFurnitureMenu() {
      const add = (o, depth = 20) => {
        if (o && o.setDepth) o.setDepth(depth);
        if (o && o.setVisible) o.setVisible(true);
        this.fMenuObjects.push(o);
        if (this.fScrollScope) this.fScrollScope.add(o);
        return o;
      };
  
      // Furniture uses the same full-screen 2x menu artwork and three-row layout as House.
      if (this.textures.exists('menu-furniture')) {
        this.fMenuBackground = add(
          this.add.image(0, 0, 'menu-furniture').setOrigin(0, 0).setDisplaySize(W, H)
            .setInteractive({ useHandCursor: false }), 20
        );
      } else {
        this.fMenuBackground = add(
          this.add.rectangle(W / 2, H / 2, W, H, 0x382e2a, 0.98)
            .setInteractive({ useHandCursor: false }), 20
        );
      }
  
      const rowLayouts = [
        { thumb: { x: 32, y: 174, w: 122, h: 122 }, desc: { x: 168, y: 178, w: 444, h: 118 } },
        { thumb: { x: 32, y: 300, w: 122, h: 122 }, desc: { x: 168, y: 302, w: 444, h: 118 } },
        { thumb: { x: 32, y: 424, w: 122, h: 122 }, desc: { x: 168, y: 426, w: 444, h: 118 } }
      ].map((row, index) => {
        const thumb = MeguMenuLayouts.button(this, 'furniture_picker', `row_${index + 1}_thumbnail`, {x:row.thumb.x,y:row.thumb.y,width:row.thumb.w,height:row.thumb.h});
        const desc = MeguMenuLayouts.button(this, 'furniture_picker', `row_${index + 1}_description`, {x:row.desc.x,y:row.desc.y,width:row.desc.w,height:row.desc.h});
        return {thumb:{x:thumb.x,y:thumb.y,w:thumb.width,h:thumb.height},desc:{x:desc.x,y:desc.y,w:desc.width,h:desc.height}};
      });
      this.fRowsUI = [];
      this.fNoResultsLabel = add(this.add.text(W / 2, 360, '', textStyle(20, '#5a4430')).setOrigin(0.5).setVisible(false), 26);
      for (let i = 0; i < rowLayouts.length; i++) {
        const layout = rowLayouts[i];
        const thumbBox = layout.thumb;
        const descBox = layout.desc;
        const top = thumbBox.y;
        const cy = top + thumbBox.h / 2;
        const rowHit = MeguMenuLayouts.button(this, 'furniture_picker', 'row_select', {x:32,y:descBox.y,width:578,height:descBox.h});
        const rc = add(this.add.rectangle((rowHit.hitboxX ?? rowHit.x) + (rowHit.hitboxWidth ?? rowHit.width) / 2, (rowHit.hitboxY ?? rowHit.y) + (rowHit.hitboxHeight ?? rowHit.height) / 2, rowHit.hitboxWidth ?? rowHit.width, rowHit.hitboxHeight ?? rowHit.height, 0xffd34f, 0.001)
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
        MeguScrollableMenu.bindRow(this, this.fScrollScope, rc, {
          getIndex: () => this.fScroll + i,
          getCount: () => (this.furnitureMenuDefs || []).length,
          getScroll: () => this.fScroll,
          setScroll: value => { this.fScroll = value; this.updateFurnitureMenu(); },
          onSelect: index => { this.fSel = index; this.updateFurnitureMenu(); },
          visible: this.fVisibleRows, rowHeight: 124
        });
        this.fRowsUI.push(row);
      }
  
      const scrollCfg = MeguMenuLayouts.button(this, 'furniture_picker', 'scrollbar', {x:611,y:178,width:8,height:366,hitboxWidth:24});
      // Shared Background-standard scrollbar; its listeners and objects are scope-owned.
      this.fSharedScrollbar = MeguScrollableMenu.createScrollbar(this, {
        scope: this.fScrollScope,
        add: object => add(object, object.depth),
        getCount: () => (this.furnitureMenuDefs || []).length,
        getIndex: () => this.fScroll,
        setIndex: value => { this.fScroll = value; this.updateFurnitureMenu(); },
        visible: this.fVisibleRows,
        wheel: false, // The scene's existing wheel handler owns this picker.
        depth: 22
      });
      this.fScrollTrack = this.fSharedScrollbar.track;
      this.fScrollTrackHit = this.fSharedScrollbar.hit;
      this.fScrollThumb = this.fSharedScrollbar.thumb;

  
      // These hitboxes align with the image artwork's existing Confirm and Cancel buttons.
      const buttonHitbox = (id, x, y, width, height, action) => {
        const cfg = MeguMenuLayouts.button(this, 'furniture_picker', id, {x,y,width,height});
        const hx = cfg.hitboxX ?? cfg.x, hy = cfg.hitboxY ?? cfg.y;
        const hw = cfg.hitboxWidth ?? cfg.width, hh = cfg.hitboxHeight ?? cfg.height;
        const rect = add(this.add.rectangle(hx + hw / 2, hy + hh / 2, hw, hh, 0xffd34f, 0.001)
          .setInteractive({ useHandCursor: true }), 30);
        rect.on('pointerover', () => rect.setFillStyle(0xffd34f, 0.14));
        rect.on('pointerout', () => rect.setFillStyle(0xffd34f, 0.001));
        rect.on('pointerdown', (pointer, localX, localY, event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          action();
        });
        return rect;
      };
      this.fSelectButton = buttonHitbox('confirm', 549, 633, 59, 49, () => {
        const item = (this.furnitureMenuDefs || [])[this.fSel];
          if (item) this.giftPickerMode ? this.giftSelectedInventoryItem(this.giftPickerMode, this.giftPickerMode === 'special' ? item.itemName : item.id) : (this.specialStoreMode ? this.purchaseSelectedSpecialItem() : (this.furnitureSellMode ? this.sellSelectedFurniture() : (this.furnitureStoreMode ? this.purchaseSelectedFurniture() : this.startEdit(item))));
      });
      this.fSelectLabel = null;
      this.fCancelButton = buttonHitbox('close', 478, 633, 65, 49, () => this.toggleFurn(false));
      this.fScrollLabel = null;
      this.updateFurnitureMenu();
    },
    updateFurnitureMenu() {
      if (!this.fOpen || !this.fRowsUI.length) return;
      const allDefs = this.furnitureDefs || [];
      const level = Math.max(0, Number(GAME_ATTRIBUTES.level) || 1);
      const defs = this.giftPickerMode === 'special'
        ? (this.specialStoreDefs || []).filter(item => Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[item.itemName]) || 0)) > 0)
        : (this.specialStoreMode ? (this.specialStoreDefs || []) : (this.furnitureStoreMode
        ? allDefs.filter(item => {
            if (this.isFurnitureNotForSale(item)) {
              // Returned not-for-sale furniture is limited shop stock. Once the
              // player sells it back, it must be visible regardless of level;
              // the level gate applies only to regular catalogue furniture.
              return Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.furniture_shop_stock[String(item.id)]) || 0)) > 0;
            }
            return Number(item.level || 0) <= level;
          })
        : allDefs.filter(item => this.getFurnitureInventoryCount(item.id) > 0)));
      this.furnitureMenuDefs = defs;
      const maxScroll = Math.max(0, defs.length - this.fVisibleRows);
      this.fScroll = Phaser.Math.Clamp(this.fScroll, 0, maxScroll);
      const visibleItems = defs.slice(this.fScroll, this.fScroll + this.fVisibleRows);
      if (this.fNoResultsLabel) this.fNoResultsLabel.setText(defs.length ? '' : (this.specialStoreMode ? 'No special items available.' : (this.furnitureStoreMode ? 'No furniture available.' : 'No furniture in inventory.'))).setVisible(defs.length === 0);
      const requiredAtlasKeys = new Set(visibleItems.map(item => item.thumbnailKey).filter(Boolean));
      if (!this.specialStoreMode) this.requestMenuAtlases('furniture', visibleItems);
      else this.requestSpecialStoreIcons(visibleItems);
  
      this.fRowsUI.forEach((row, i) => {
        const idx = this.fScroll + i;
        const item = defs[idx];
        row.rc.setVisible(!!item);
        row.nm.setVisible(!!item);
        row.detail.setVisible(!!item && !!item.detail);
        row.price.setVisible(!!item && !this.giftPickerMode && (this.specialStoreMode || this.furnitureStoreMode || this.furnitureSellMode)); row.hold.setVisible(!!item && (!this.specialStoreMode || this.giftPickerMode === 'special')); row.goldMark.setVisible(!!item && !this.giftPickerMode && (this.specialStoreMode || this.furnitureStoreMode || this.furnitureSellMode));
        if (!item) {
          if (row.preview) row.preview.setVisible(false).setTexture('__DEFAULT');
          row.renderedIndex = -1;
          row.previewItemId = null;
          return;
        }
  
        const record = this.specialStoreMode ? item : this.localizedRecord(this.furnitureRecordsById, item.id);
        const name = record.name || item.name || `${this.specialStoreMode ? 'Special item' : 'Furniture'} ${item.id}`;
        const detail = record.detail || '';
        const selected = idx === this.fSel;
        row.rc.setFillStyle(0xffd34f, selected ? 0.16 : 0.001);
        row.rc.setStrokeStyle(selected ? 3 : 1, 0xffd34f, selected ? 0.98 : 0);
        if (row.renderedIndex !== idx) {
          const box = row.descBox;
          row.nm.setPosition(box.x, box.y);
          row.detail.setPosition(box.x, box.y + 38);
          this.fitTextToBounds(row.nm, name, {
            width: box.w, height: 32, jaBaseSize: 20, jaMinSize: 12, jaMaxLines: 1,
            enBaseSize: 20, enMaxLines: 1, lineSpacing: 0
          });
          this.fitTextToBounds(row.detail, detail, {
            width: box.w, height: 52, jaBaseSize: 16, jaMinSize: 10, jaMaxLines: 2,
            enBaseSize: 16, enMaxLines: 2, lineSpacing: 0
          });
          row.price.setText((this.specialStoreMode || this.furnitureStoreMode || this.furnitureSellMode) && !this.giftPickerMode ? `${this.furnitureSellMode ? '+' : ''}${Math.max(0, Math.trunc(Number(item.price) || 0))}` : '');
          const limitedStock = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.furniture_shop_stock[String(item.id)]) || 0));
          row.hold.setText(this.giftPickerMode === 'special' ? `Hold:${String(Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[item.itemName]) || 0))).padStart(2, '0')}` : (this.furnitureStoreMode && this.isFurnitureNotForSale(item) ? `Stock:${String(limitedStock).padStart(2, '0')}` : `Hold:${String(this.getFurnitureInventoryCount(item.id)).padStart(2, '0')}`));
          row.price.setVisible(!this.giftPickerMode && (this.specialStoreMode || this.furnitureStoreMode || this.furnitureSellMode));
          row.hold.setVisible(!this.specialStoreMode || this.giftPickerMode === 'special');
          row.goldMark.setVisible(!this.giftPickerMode && (this.specialStoreMode || this.furnitureStoreMode || this.furnitureSellMode));
          row.renderedIndex = idx;
        }
        if (this.giftPickerMode === 'special') {
          row.price.setVisible(false); row.goldMark.setVisible(false); row.hold.setVisible(true);
          row.hold.setText(`Hold:${String(Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[item.itemName]) || 0))).padStart(2, '0')}`);
        } else if (this.giftPickerMode === 'furniture') {
          row.price.setVisible(false); row.goldMark.setVisible(false); row.hold.setVisible(true);
          row.hold.setText(`Hold:${String(this.getFurnitureInventoryCount(item.id)).padStart(2, '0')}`);
        }
        const id = String(item.id);
        if (row.previewItemId !== id) {
          if (row.preview) row.preview.setVisible(false);
          row.previewItemId = id;
        }
        if (this.specialStoreMode) {
          if (this.textures.exists(item.iconKey)) {
            if (!row.preview) {
              row.preview = this.add.image(row.thumbBox.x + row.thumbBox.w / 2, row.cy, item.iconKey).setOrigin(0.5).setDepth(23);
              this.fMenuObjects.push(row.preview);
            if (this.fScrollScope) this.fScrollScope.add(row.preview);
          if (this.fScrollScope) this.fScrollScope.add(row.preview);
            }
            const source = this.textures.get(item.iconKey).getSourceImage();
            const iconWidth = Math.max(1, Number(source && (source.naturalWidth || source.width)) || 1);
            const iconHeight = Math.max(1, Number(source && (source.naturalHeight || source.height)) || 1);
            const iconScale = Math.min(112 / iconWidth, 112 / iconHeight);
            row.preview.setTexture(item.iconKey).setPosition(row.thumbBox.x + row.thumbBox.w / 2, row.cy)
              .setDisplaySize(iconWidth * iconScale, iconHeight * iconScale).setVisible(true);
          } else if (row.preview) row.preview.setVisible(false);
        } else if (this.textures.exists(item.thumbnailKey) && this.textures.get(item.thumbnailKey).has(item.thumbnailFrame)) {
          if (!row.preview) {
            row.preview = this.add.sprite(row.thumbBox.x + row.thumbBox.w / 2, row.cy, item.thumbnailKey, item.thumbnailFrame)
              .setOrigin(0.5).setDepth(23);
            this.fMenuObjects.push(row.preview);
            if (this.fScrollScope) this.fScrollScope.add(row.preview);
          if (this.fScrollScope) this.fScrollScope.add(row.preview);
          }
          const frame = this.textures.get(item.thumbnailKey).get(item.thumbnailFrame);
          const width = frame ? frame.width : item.width;
          const height = frame ? frame.height : item.height;
          // Furniture-menu previews preserve aspect ratio and fit within 112px.
          // This menu-only cap must not affect furniture rendered in the room.
          const scale = Math.min(
            1.5,
            112 / Math.max(1, width),
            112 / Math.max(1, height)
          );
          row.preview.setTexture(item.thumbnailKey, item.thumbnailFrame)
            .setOrigin(0.5, 0.5)
            .setPosition(row.thumbBox.x + row.thumbBox.w / 2, row.cy)
            .setScale(scale).setVisible(true);
        } else if (row.preview) {
          // Detach the preview before an unused thumbnail atlas is evicted.
          row.preview.setVisible(false).setTexture('__DEFAULT');
        }
      });
  
      if (!this.specialStoreMode) this.releaseUnneededFurnitureAtlases(requiredAtlasKeys);
      if (this.fSharedScrollbar) this.fSharedScrollbar.update();
      const canSelect = this.fSel >= 0 && !!defs[this.fSel];
      const selectedPrice = canSelect ? Math.max(0, Number(defs[this.fSel].price) || 0) : 0;
      const canAfford = !!this.giftPickerMode || (!(this.furnitureStoreMode || this.specialStoreMode) || Math.max(0, Number(GAME_ATTRIBUTES.gold) || 0) >= selectedPrice);
      if (this.fSelectButton && this.fSelectButton.active) this.fSelectButton.setAlpha(canSelect && canAfford ? 0.24 : 0.001);
    },
    requestSpecialStoreIcons(items) {
      const pending = (items || []).filter(item => item && !this.textures.exists(item.iconKey) && !this.specialStoreIconPending.has(item.iconKey));
      if (!pending.length) return;
      pending.forEach(item => {
        this.specialStoreIconPending.add(item.iconKey);
        this.load.image(item.iconKey, item.iconPath);
        this.load.once(`filecomplete-image-${item.iconKey}`, () => {
          this.load.off('loaderror', onIconError);
          this.specialStoreIconPending.delete(item.iconKey);
          if (this.fOpen && this.specialStoreMode) this.updateFurnitureMenu();
        });
        const onIconError = file => {
          if (!file || file.key !== item.iconKey) return;
          this.load.off('loaderror', onIconError);
          this.specialStoreIconPending.delete(item.iconKey);
          console.error(`[MEGU] Failed to load special-store icon: ${item.iconPath}`);
        };
        this.load.on('loaderror', onIconError);
      });
      if (!this.load.isLoading()) this.load.start();
    },

});
