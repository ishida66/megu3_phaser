/* MeguFood: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    getFoodInventoryCount(foodId) {
      return this.getStackedInventoryCount('food_store', foodId);
    },
    addFoodToInventory(foodId, quantity = 1, source = 'game') {
      return this.addStackedInventoryItem('food_store', foodId, quantity, source);
    },
    removeFoodFromInventory(foodId, quantity = 1) {
      return this.removeStackedInventoryItem('food_store', foodId, quantity);
    },
    toggleFoodStore() {
      this.toggleFood(true, false, true);
    },
    purchaseSelectedFood() {
      const item = this.foodMenuDefs[this.foodSelected];
      if (!item || !this.foodStoreMode) return;
      const price = Math.max(0, Math.trunc(Number(item.price) || 0));
      const gold = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.gold) || 0));
      const maxAffordable = price > 0 ? Math.floor(gold / price) : 9999;
      if (maxAffordable < 1) {
        if (this.foodNoResultsLabel) this.foodNoResultsLabel.setText('Not enough gold.').setVisible(true);
        return;
      }
      const requested = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? window.prompt(`How many ${item.name || 'of this food'} would you like to buy?\nPrice: ${price} gold each (you can afford ${maxAffordable}).`, '1')
        : null;
      if (requested === null || requested === undefined) return;
      const quantityText = String(requested).trim();
      if (!/^\d+$/.test(quantityText)) {
        if (this.foodNoResultsLabel) this.foodNoResultsLabel.setText('Please enter a whole number.').setVisible(true);
        return;
      }
      const quantity = Number(quantityText);
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        if (this.foodNoResultsLabel) this.foodNoResultsLabel.setText('Please enter at least 1.').setVisible(true);
        return;
      }
      const totalPrice = price * quantity;
      if (!Number.isSafeInteger(totalPrice) || totalPrice > gold) {
        if (this.foodNoResultsLabel) this.foodNoResultsLabel.setText('Not enough gold for that quantity.').setVisible(true);
        return;
      }
      this.changeGold(-totalPrice);
      this.addFoodToInventory(item.id, quantity, 'store');
      // A completed purchase returns directly to the home scene.
      this.toggleFood(false);
      this.closeFooterMenu();
    },
    toggleFood(open, keepAtlases = false, storeMode = false, giftMode = false) {
      if (this.friendHouseTransition || (open && this.visitingHouse && !giftMode)) return;
      if (open) {
        if (!this.openStandardPicker('foodOpen', {
          prepare: !giftMode,
          allow: () => !this.friendHouseTransition && (!this.visitingHouse || !!giftMode)
        })) return;
        this.foodStoreMode = !!storeMode;
        this.foodGiftMode = !!giftMode;
        this.foodAtlasFailedThisOpen = new Set();
        this.foodFilter = null;
        this.foodMenuDefs = this.getFilteredFoodDefs();
        this.foodScroll = 0;
        this.foodSelected = -1;
        this.foodPress = null;
        this.foodScrollbarPress = null;
        this.foodScrollScope = this.createUiResourceScope();
        this.buildFoodMenu();
        if (giftMode) this.setVisitorGiftPickerBlocking(true);
        return;
      }
      if (this.foodScrollScope) { this.foodScrollScope.destroy(); this.foodScrollScope = null; }
      this.closeStandardPicker('foodOpen', 'foodMenuObjects', ['foodPress', 'foodScrollbarPress']);
      if (this.visitingHouse) this.setVisitorGiftPickerBlocking(false);
      this.foodStoreMode = false;
      this.foodGiftMode = false;
      if (!this.fOpen) { this.giftMode = null; this.giftTargetUserId = null; }
      // The shared lifecycle has disabled and destroyed every picker object.
      // Menu-specific references and texture release remain local to this picker.
      this.foodRowsUI = [];
      this.foodFilterUI = [];
      this.foodMenuDefs = [];
      this.foodSelectButton = null;
      this.foodSelectLabel = null;
      this.foodFurnitureButton = null;
      this.foodFurnitureLabel = null;
      this.foodCancelButton = null;
      this.foodCancelLabel = null;
      this.foodScrollTrack = null;
      this.foodScrollTrackHit = null;
      this.foodScrollThumb = null;
      this.foodSharedScrollbar = null;
      this.foodMenuBackground = null;
      this.foodScrollLabel = null;
      this.foodNoResultsLabel = null;
      if (!keepAtlases) this.releaseUnusedFoodAtlases();
    },
    getFilteredFoodDefs() {
      let available = this.foodDefs;
      if (this.foodStoreMode) {
        const level = Number(GAME_ATTRIBUTES.level) || 1;
        available = available.filter(item => {
          const notSale = ['1', 'true', 'yes'].includes(String(item.not_sale == null ? '' : item.not_sale).trim().toLowerCase());
          return !notSale && Number(item.level || 0) <= level;
        });
      } else {
        available = available.filter(item => this.getFoodInventoryCount(item.id) > 0);
      }
      if (!this.foodFilter) return available;
      const selected = normalizeFoodClassification(this.foodFilter);
      return available.filter(item => normalizeFoodClassification(item.classification) === selected);
    },
    setFoodFilter(category) {
      const normalized = normalizeFoodClassification(category);
      this.foodFilter = this.foodFilter && normalizeFoodClassification(this.foodFilter) === normalized ? null : category;
      this.foodScroll = 0;
      this.foodSelected = -1;
      this.foodPress = null;
      this.foodScrollbarPress = null;
      this.foodMenuDefs = this.getFilteredFoodDefs();
      this.updateFoodMenu();
    },
    buildFoodMenu() {
      const add = (o, depth = 22) => {
        if (o && o.setDepth) o.setDepth(depth);
        if (o && o.setVisible) o.setVisible(true);
        this.foodMenuObjects.push(o);
        if (this.foodScrollScope) this.foodScrollScope.add(o);
        return o;
      };
  
      // Use the original menu artwork as the base, retaining the cleaned-up
      // interaction code and current Food row/filter layout. The image also acts
      // as an input shield so clicks do not reach the room underneath.
      if (this.textures.exists('menu-food')) {
        this.foodMenuBackground = add(
          this.add.image(0, 0, 'menu-food').setOrigin(0, 0).setDisplaySize(W, H)
            .setInteractive({ useHandCursor: false }),
          20
        );
      } else {
        // Keep menu controls usable if the artwork is temporarily unavailable.
        this.foodMenuBackground = add(
          this.add.rectangle(W / 2, H / 2, W, H, 0x382e2a, 0.98)
            .setInteractive({ useHandCursor: false }),
          20
        );
      }
  
      // Classification filters use the dedicated left column of the Food menu.
      // Clicking the active category again clears the filter and shows all food.
      this.foodFilterUI = [];
      for (const [category, y] of FOOD_CLASS_FILTERS) {
        const filterBox = MeguMenuLayouts.button(this, 'food_picker', 'category_filter', {x:84,y:y+7.5,width:100,height:15});
        const rect = add(this.add.rectangle(filterBox.x, filterBox.y, filterBox.width, filterBox.height, 0xffd34f, 0.001)
          .setStrokeStyle(1, 0xffd34f, 0)
          .setInteractive({ useHandCursor: true }), 28);
        // Center filter labels in their 100×15 hitboxes; 12px is one point larger than before.
        const label = add(this.add.text(filterBox.x, filterBox.y, category, textStyle(12, '#4a3628'))
          .setOrigin(0.5, 0.5).setDepth(29), 29);
        const filterUI = { category, rect, label, hovered: false };
        rect.on('pointerover', () => { filterUI.hovered = true; this.updateFoodFilterUI(); });
        rect.on('pointerout', () => { filterUI.hovered = false; this.updateFoodFilterUI(); });
        rect.on('pointerdown', (pointer, localX, localY, event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          this.setFoodFilter(category);
        });
        this.foodFilterUI.push(filterUI);
      }
  
      if (this.foodGiftMode) this.foodFilterUI.forEach(item => { item.rect.setVisible(false).disableInteractive(); item.label.setVisible(false); });
  
      // Food rows keep the configured thumbnail and description coordinates.
      const defaultRowLayouts = [
        { thumb: { x: 150, y: 176, w: 122, h: 122 }, desc: { x: 285, y: 178, w: 231, h: 118 } },
        { thumb: { x: 150, y: 301, w: 122, h: 122 }, desc: { x: 285, y: 303, w: 231, h: 118 } },
        { thumb: { x: 150, y: 424, w: 122, h: 122 }, desc: { x: 285, y: 426, w: 231, h: 118 } }
      ];
      const rowLayouts = defaultRowLayouts.map((layout, index) => {
        const thumb = MeguMenuLayouts.button(this, 'food_picker', `row_${index + 1}_thumbnail`, {x:layout.thumb.x,y:layout.thumb.y,width:layout.thumb.w,height:layout.thumb.h});
        const desc = MeguMenuLayouts.button(this, 'food_picker', `row_${index + 1}_description`, {x:layout.desc.x,y:layout.desc.y,width:layout.desc.w,height:layout.desc.h});
        return {thumb:{x:thumb.x,y:thumb.y,w:thumb.width,h:thumb.height},desc:{x:desc.x,y:desc.y,w:desc.width,h:desc.height}};
      });
      this.foodVisibleRows = 3;
      this.foodRowHeight = 124;
      this.foodRowsUI = [];
  
      for (let i = 0; i < rowLayouts.length; i++) {
        const layout = rowLayouts[i];
        const top = layout.thumb.y;
        const thumbBox = layout.thumb;
        const descBox = layout.desc;
        const cy = top + thumbBox.h / 2;
        const rowCard = MeguMenuLayouts.button(this, 'food_picker', 'row_card', {x:378,y:cy,width:456,height:thumbBox.h});
        const card = add(this.add.rectangle(rowCard.x, rowCard.y, rowCard.width, rowCard.height, 0xffffff, 0.48)
          .setStrokeStyle(1, 0xd9c8ac, 0.9), 21);
        // Highlight spans the full item row from x=150 to the scrollbar at x=606.
        const rowHit = MeguMenuLayouts.button(this, 'food_picker', 'row_select', {x:150,y:cy,width:456,height:thumbBox.h});
        const highlightX = rowHit.x, highlightWidth = rowHit.width;
        const rc = add(this.add.rectangle(highlightX + highlightWidth / 2, rowHit.y, highlightWidth, rowHit.height, 0xffd34f, 0.001)
          .setStrokeStyle(2, 0xffd34f, 0)
          .setInteractive({ useHandCursor: true }), 22);
        const nm = add(this.add.text(descBox.x, descBox.y, '', textStyle(24, '#3d3024'))
          .setOrigin(0, 0).setWordWrapWidth(descBox.w).setDepth(24), 24);
        const detail = add(this.add.text(descBox.x, descBox.y + 32, '', textStyle(16, '#55504a'))
          .setOrigin(0, 0).setWordWrapWidth(descBox.w).setDepth(24), 24);
        const price = add(this.add.text(descBox.x + 22, descBox.y + 76, '', textStyle(18, '#ff7900'))
          .setOrigin(0, 0).setDepth(24), 24);
        const hold = add(this.add.text(descBox.x + 92, descBox.y + 76, '', textStyle(15, '#438dc9'))
          .setOrigin(0, 0).setDepth(24), 24);
        const stats = add(this.add.text(descBox.x + 92, descBox.y + 98, '', textStyle(15, '#438dc9'))
          .setOrigin(0, 0).setDepth(24), 24);
        const goldMark = add(this.add.image(descBox.x + 9, descBox.y + 86, 'gold-icon')
          .setDisplaySize(18, 18).setOrigin(0.5).setDepth(24), 24);
        const row = { card, rc, nm, detail, price, hold, stats, goldMark, preview: null, top, cy, renderedIndex: -1, thumbBox, descBox };
        MeguScrollableMenu.bindRow(this, this.foodScrollScope, rc, {
          getIndex: () => this.foodScroll + i,
          getCount: () => (this.foodMenuDefs || []).length,
          getScroll: () => this.foodScroll,
          setScroll: value => { this.foodScroll = value; this.updateFoodMenu(); },
          onSelect: index => { this.foodSelected = index; this.updateFoodMenu(); },
          visible: this.foodVisibleRows, rowHeight: 124
        });
        this.foodRowsUI.push(row);
      }
  
      // Fixed visual scrollbar at the requested coordinates (607,178,8,366).
      // Shared Background-standard scrollbar; its listeners and objects are scope-owned.
      this.foodSharedScrollbar = MeguScrollableMenu.createScrollbar(this, {
        scope: this.foodScrollScope,
        add: object => add(object, object.depth),
        getCount: () => (this.foodMenuDefs || []).length,
        getIndex: () => this.foodScroll,
        setIndex: value => { this.foodScroll = value; this.updateFoodMenu(); },
        visible: this.foodVisibleRows,
        wheel: false, // The scene's existing wheel handler owns this picker.
        depth: 22
      });
      this.foodScrollTrack = this.foodSharedScrollbar.track;
      this.foodScrollTrackHit = this.foodSharedScrollbar.hit;
      this.foodScrollThumb = this.foodSharedScrollbar.thumb;
      this.foodNoResultsLabel = add(this.add.text(285, 300, 'No food in this category.', textStyle(16, '#4a3628'))
        .setOrigin(0, 0).setVisible(false), 26);

  
      // Invisible button hitboxes use the art beneath them for their visual design.
      const buttonHitbox = (id, x, y, width, height, action) => {
        const cfg = MeguMenuLayouts.button(this, 'food_picker', id, {x,y,width,height});
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
  
      // (486,128,63,52) Add selected food as a furniture object.
      this.foodFurnitureButton = buttonHitbox('add_as_furniture', 486, 128, 63, 52, () => this.addFoodAsFurniture());
      if (this.foodGiftMode) this.foodFurnitureButton.setVisible(false).disableInteractive();
      // (549,633,59,49) Confirm and enter the existing give-food/eating sequence.
      this.foodSelectButton = buttonHitbox('confirm', 549, 633, 59, 49, () => this.foodGiftMode ? this.giftSelectedInventoryItem('food', (this.foodMenuDefs || [])[this.foodSelected]?.id) : (this.foodStoreMode ? this.purchaseSelectedFood() : this.eatSelectedFood()));
      // (478,633,65,49) Close the picker and return to the room.
      this.foodCancelButton = buttonHitbox('close', 478, 633, 65, 49, () => this.toggleFood(false));
  
      this.updateFoodMenu();
    },
    updateFoodFilterUI() {
      (this.foodFilterUI || []).forEach(filterUI => {
        const active = !!this.foodFilter && normalizeFoodClassification(this.foodFilter) === normalizeFoodClassification(filterUI.category);
        const alpha = active ? 0.42 : filterUI.hovered ? 0.22 : 0.001;
        filterUI.rect.setFillStyle(0xffd34f, alpha).setStrokeStyle(active ? 1 : 0, 0xb58a43, active ? 0.95 : 0);
        filterUI.label.setColor(active ? '#2f241a' : '#4a3628');
        filterUI.label.setAlpha(active ? 1 : 0.9);
      });
    },
    updateFoodMenu() {
      if (!this.foodOpen || !this.foodRowsUI.length) return;
      this.foodMenuDefs = this.getFilteredFoodDefs();
      const defs = this.foodMenuDefs;
      const maxScroll = Math.max(0, defs.length - this.foodVisibleRows);
      this.foodScroll = Phaser.Math.Clamp(this.foodScroll, 0, maxScroll);
      const visibleItems = defs.slice(this.foodScroll, this.foodScroll + this.foodVisibleRows);
      if (this.foodNoResultsLabel) this.foodNoResultsLabel.setVisible(defs.length === 0);
      const selectedItem = defs[this.foodSelected];
      const requiredAtlasKeys = new Set(visibleItems.map(item => item.key).filter(Boolean));
      if (selectedItem && selectedItem.key) requiredAtlasKeys.add(selectedItem.key);
      this.requestMenuAtlases('food', visibleItems, selectedItem && selectedItem.key ? [selectedItem.key] : []);
  
      this.foodRowsUI.forEach((row, i) => {
        const idx = this.foodScroll + i;
        const item = defs[idx];
        row.card.setVisible(!!item);
        row.rc.setVisible(!!item);
        row.nm.setVisible(!!item);
        row.detail.setVisible(!!item && !!item.detail);
        row.price.setVisible(!!item && this.foodStoreMode); row.hold.setVisible(!!item); row.goldMark.setVisible(!!item && this.foodStoreMode);
        if (!item) {
          if (row.preview) row.preview.setVisible(false).setTexture('__DEFAULT');
          row.renderedIndex = -1;
          return;
        }
  
        const selected = idx === this.foodSelected;
        row.rc.setFillStyle(0xffd34f, selected ? 0.16 : 0.001);
        row.rc.setStrokeStyle(selected ? 3 : 1, 0xffd34f, selected ? 0.98 : 0);
  
        // Refresh text when the actual item changes, not just when its row index changes.
        // Filtering replaces the item at row 0/1/2 while the numeric list index stays the same.
        const renderedDataKey = [item.id, item.key, item.frame, item.name || '', item.detail || '', item.price, item.nutrition, item.exp, item.calorie, this.foodStoreMode].join('|');
        if (row.renderedDataKey !== renderedDataKey) {
          const box = row.descBox;
          row.nm.setPosition(box.x, box.y);
          row.detail.setPosition(box.x, box.y + 38);
          this.fitTextToBounds(row.nm, item.name || `Food ${item.id}`, {
            width: box.w, height: 32, jaBaseSize: 18, jaMinSize: 11, jaMaxLines: 1,
            enBaseSize: 18, enMaxLines: 1, lineSpacing: 0
          });
          this.fitTextToBounds(row.detail, item.detail || '', {
            width: box.w, height: 40, jaBaseSize: 14, jaMinSize: 9, jaMaxLines: 2,
            enBaseSize: 14, enMaxLines: 2, lineSpacing: 0
          });
          row.price.setText(this.foodStoreMode ? String(Math.max(0, Math.trunc(Number(item.price) || 0))) : '');
          row.hold.setText(`Hold:${String(this.getFoodInventoryCount(item.id)).padStart(2, '0')} Carbo:${Math.max(0, Math.trunc(Number(item.nutrition) || 0))}`);
          row.stats.setText(`Yuminess:${Math.max(0, Math.trunc(Number(item.exp) || 0))} Fat:${Math.max(0, Math.trunc(Number(item.calorie) || 0))}`);
          row.price.setVisible(this.foodStoreMode);
          row.goldMark.setVisible(this.foodStoreMode);
          row.renderedDataKey = renderedDataKey;
          row.renderedIndex = idx;
        }
  
        if (this.textures.exists(item.key) && this.textures.get(item.key).has(item.frame)) {
          if (!row.preview) {
            row.preview = this.add.sprite(row.thumbBox.x + row.thumbBox.w / 2, row.top + row.thumbBox.h / 2, item.key, item.frame)
              .setOrigin(0.5).setDepth(24);
            this.foodMenuObjects.push(row.preview);
            if (this.foodScrollScope) this.foodScrollScope.add(row.preview);
          if (this.foodScrollScope) this.foodScrollScope.add(row.preview);
          }
          const frame = this.textures.get(item.key).get(item.frame);
          // Food thumbnails occupy about 75% of their box, centered horizontally
          // and resting on its bottom edge. The scale preserves each item's aspect ratio.
          const fitScale = frame
            ? Math.min(row.thumbBox.w / Math.max(1, frame.width), row.thumbBox.h / Math.max(1, frame.height))
            : 1;
          const scale = fitScale * 0.75;
          row.preview.setTexture(item.key, item.frame)
            .setOrigin(0.5, 1)
            .setPosition(row.thumbBox.x + row.thumbBox.w / 2, row.top + row.thumbBox.h)
            .setScale(scale).setVisible(true);
        } else if (row.preview) {
          // Detach from the atlas before its texture can be evicted.
          row.preview.setVisible(false).setTexture('__DEFAULT');
        }
      });
  
      this.releaseUnneededFoodAtlases(requiredAtlasKeys);
  
      // Keep the thumb proportional to the number of entries and the selected scroll offset.
      if (this.foodSharedScrollbar) this.foodSharedScrollbar.update();
  
      this.updateFoodFilterUI();
      const canSelect = this.foodSelected >= 0 && !!defs[this.foodSelected];
      const satietyMax = Math.max(0, Number(GAME_ATTRIBUTES.max_satiety) || 0);
      const satietyNow = Math.max(0, Number(GAME_ATTRIBUTES.satiety) || 0);
      const foodBlockedBySatiety = satietyMax > 0 && satietyNow > satietyMax * 0.9;
      // Keep Confirm available for a selected item even when MEGU is too full;
      // pressing it displays the refusal message over the still-open food menu.
      const canGiveFood = canSelect && (this.foodGiftMode || (!this.foodStoreMode || Math.max(0, Number(GAME_ATTRIBUTES.gold) || 0) >= Math.max(0, Number(defs[this.foodSelected] && defs[this.foodSelected].price) || 0)));
      this.foodSelectButton && this.foodSelectButton.setAlpha(canGiveFood ? 0.24 : 0.001);
      this.foodSelectLabel && this.foodSelectLabel.setAlpha(canGiveFood ? 1 : 0.45);
      this.foodFurnitureButton && this.foodFurnitureButton.setAlpha(canSelect ? 0.24 : 0.001);
      this.foodFurnitureLabel && this.foodFurnitureLabel.setAlpha(canSelect ? 1 : 0.45);
    },
    addFoodAsFurniture() {
      const item = this.foodMenuDefs[this.foodSelected];
      if (!item || this.foodSequenceActive || this.foodActionActive) return;
      // Close the catalog first, then use the familiar furniture drag editor.
      this.toggleFood(false, true);
      this.closeFooterMenu();
      this.toggleFurn(false);
      const sourceWidth = Math.max(1, Number(item.width) || 64);
      const sourceHeight = Math.max(1, Number(item.height) || 64);
      const scale = Math.min(1, 80 / Math.max(sourceWidth, sourceHeight));
      GAME_ATTRIBUTES.furn.push({
        kind: 'food', id: null, foodId: String(item.id), key: item.key, frame: item.frame,
        name: item.name || `Food ${item.id}`, sourceWidth, sourceHeight,
        displayWidth: Math.max(12, sourceWidth * scale), displayHeight: Math.max(12, sourceHeight * scale),
        x: W / 2, y: 510, flipX: false
      });
      this.editIdx = GAME_ATTRIBUTES.furn.length - 1;
      this.lastFurnitureClick = null;
      this.setEdit(true);
      save();
    },
    eatSelectedFood() {
      const item = this.foodMenuDefs[this.foodSelected];
      const satietyMax = Math.max(0, Number(GAME_ATTRIBUTES.max_satiety) || 0);
      const satietyNow = Math.max(0, Number(GAME_ATTRIBUTES.satiety) || 0);
      if (!item || this.foodSequenceActive || this.foodActionActive) return;
      if (satietyMax > 0 && satietyNow > satietyMax * 0.9) {
        this.showFoodReaction(0, true);
        return;
      }
      this.foodActionToken += 1;
      const token = this.foodActionToken;
      this.foodSequenceActive = true;
      this.foodSequenceStage = 'throwing';
      this.foodSequenceItem = item;
      if (!this.foodStoreMode) this.removeFoodFromInventory(item.id, 1);
      this.feedFriendPets(item);
      // Retain the selected atlas through the flight / approach sequence.
      this.toggleFood(false, true);
      this.foodActionActive = false;
      this.foodAnimationUntil = 0;
      this.wander = false;
      this.clickMoveActive = false;
      this.target.x = this.pet.x;
      this.target.y = this.pet.y;
      this.nextMoveStepAt = this.time.now + 500;
  
      // Throw from the side farthest from MEGU so the fast approach crosses
      // more of the room. Mirror the trajectory when launching from the right.
      const leftDistance = this.pet.x;
      const rightDistance = W - this.pet.x;
      const throwFromLeft = leftDistance >= rightDistance;
      const throwStartX = throwFromLeft ? -20 : W + 20;
      const throwLandX = throwFromLeft ? 100 : W - 100;
  
      // The ground shadow tracks the thrown food horizontally while the food arcs above it.
      this.foodProjectileShadow = this.add.ellipse(throwStartX, 510, 62, 15, 0x000000, 0.24).setDepth(2.5);
  
      // Prefer the real atlas frame; use a small labelled token if art is unavailable.
      const hasFrame = this.textures.exists(item.key) && this.textures.get(item.key).has(item.frame);
      if (hasFrame) {
        this.foodProjectile = this.add.sprite(throwStartX, 500, item.key, item.frame).setOrigin(0.5, 0.5).setDepth(25);
        const frame = this.textures.get(item.key).get(item.frame);
        const scale = frame ? Math.min(42 / Math.max(1, frame.width), 42 / Math.max(1, frame.height)) : 1;
        this.foodProjectile.setScale(scale * 2);
      } else {
        const badge = this.add.container(throwStartX, 500).setDepth(25);
        badge.add(this.add.circle(0, 0, 18, 0xffd34f).setStrokeStyle(2, 0xffffff));
        badge.add(this.add.text(0, 0, String(item.id || 'FOOD'), {
          fontFamily: 'sans-serif', fontSize: '10px', color: '#10172b', align: 'center',
          wordWrap: { width: 34 }
        }).setOrigin(0.5));
        badge.setScale(2);
        this.foodProjectile = badge;
      }
  
      // A one-second upward arc. Right-side throws are the horizontal mirror
      // of the left-side trajectory: (660, 500) to (540, 500).
      const flight = { progress: 0 };
      this.foodThrowTween = this.tweens.add({
        targets: flight,
        progress: 1,
        duration: 1000,
        ease: 'Sine.inOut',
        onUpdate: () => {
          if (token !== this.foodActionToken || !this.foodProjectile || !this.foodProjectile.active) return;
          const t = flight.progress;
          const foodX = throwStartX + (throwLandX - throwStartX) * t;
          const arcHeight = Math.sin(Math.PI * t);
          this.foodProjectile.setPosition(foodX, 500 - 62 * arcHeight);
          if (this.foodProjectileShadow && this.foodProjectileShadow.active) {
            this.foodProjectileShadow.setPosition(foodX, 510);
          }
        },
        onComplete: () => {
          this.foodThrowTween = null;
          if (token !== this.foodActionToken || !this.foodSequenceActive) {
            if (this.foodProjectile && this.foodProjectile.active) this.foodProjectile.destroy();
            this.foodProjectile = null;
            if (this.foodProjectileShadow && this.foodProjectileShadow.active) this.foodProjectileShadow.destroy();
            this.foodProjectileShadow = null;
            return;
          }
          if (this.foodProjectile && this.foodProjectile.active) this.foodProjectile.setPosition(throwLandX, 500);
          this.foodSequenceStage = 'approaching';
          this.wander = false;
          this.clickMoveActive = true;
          this.target.x = throwLandX;
          this.target.y = 500;
          // Use the existing clicked-movement mode (2x step size, 250 ms steps).
          this.nextMoveStepAt = this.time.now;
          this.look = Math.sign(this.target.x - this.pet.x) || this.look;
          this.finishFoodApproachIfArrived(token);
        }
      });
    },
    finishFoodApproachIfArrived(token) {
      if (token !== this.foodActionToken || this.foodSequenceStage !== 'approaching') return;
      if (Math.hypot(this.target.x - this.pet.x, this.target.y - this.pet.y) > 0.5) return;
  
      // MEGU has reached the food: remove it, then run the existing eating pose
      // and sound sequence from this point (rather than during the throw).
      if (this.foodProjectile && this.foodProjectile.active) this.foodProjectile.destroy();
      this.foodProjectile = null;
      if (this.foodProjectileShadow && this.foodProjectileShadow.active) this.foodProjectileShadow.destroy();
      this.foodProjectileShadow = null;
      this.foodSequenceStage = 'eating';
      this.releaseUnusedFoodAtlases();
      const satietyCap = Math.max(0, Number(GAME_ATTRIBUTES.max_satiety) || 0);
      const currentSatiety = Math.max(0, Number(GAME_ATTRIBUTES.satiety) || 0);
      const nutrition = Math.max(0, Number(this.foodSequenceItem && this.foodSequenceItem.nutrition) || 0);
      const experience = Math.max(0, Number(this.foodSequenceItem && this.foodSequenceItem.exp) || 0);
      const currentLevel = Number(GAME_ATTRIBUTES.level) || 0;
      const foodLevel = Number(this.foodSequenceItem && this.foodSequenceItem.level) || 0;
      const remainingSatiety = Math.max(0, satietyCap - currentSatiety);
      const levelNeed = remainingSatiety > 0 ? (currentLevel - foodLevel) / remainingSatiety : Infinity;
      const foodPhrases = this.foodMessagePhrases || [];
      if (foodPhrases.length) {
        let reactionIndex;
        if (levelNeed < 5) reactionIndex = foodPhrases.length - 1;
        else if (levelNeed > 20) reactionIndex = Math.min(1, foodPhrases.length - 1);
        else {
          const topIndex = Math.min(1, foodPhrases.length - 1);
          const bottomIndex = foodPhrases.length - 1;
          const progress = Phaser.Math.Clamp((levelNeed - 5) / 15, 0, 1);
          reactionIndex = Math.round(bottomIndex + (topIndex - bottomIndex) * progress);
        }
        this.showFoodReaction(reactionIndex);
      }
      GAME_ATTRIBUTES.satiety = Math.round(Math.min(satietyCap, currentSatiety + nutrition));
      GAME_ATTRIBUTES.max_health = 1000;
      GAME_ATTRIBUTES.health = Math.round(Math.min(1000, Math.max(0, Number(GAME_ATTRIBUTES.health) || 0) + nutrition));
      const calorie = Phaser.Math.Clamp(Number(this.foodSequenceItem && this.foodSequenceItem.calorie) || 0, 0, 1200);
      const maxWeight = Math.max(0, Number(GAME_ATTRIBUTES.max_weight) || 0);
      const minWeight = Math.max(0, Number(GAME_ATTRIBUTES.min_weight) || 0);
      if (maxWeight > 0 && maxWeight >= minWeight) {
        // 1200 calories adds 3 kg at max_weight 6.0; scale linearly by both.
        const weightGain = (calorie / 1200) * (maxWeight / 6) * 3;
        GAME_ATTRIBUTES.weight = Phaser.Math.Clamp((Number(GAME_ATTRIBUTES.weight) || minWeight) + weightGain, minWeight, maxWeight);
      }
      // Fold the Eat objective bonus into the food's normal friendship reward.
      const foodStressBonus = this.consumeStressAction('eat');
      this.foodStressBonus = foodStressBonus;
      this.foodTotalFriendshipReward = experience + foodStressBonus;
      this.addFriendship(this.foodTotalFriendshipReward, foodStressBonus ? 'stress-food' : 'food');
      this.updateGameAttributeDisplay();
      this.foodActionActive = true;
      this.foodAnimationUntil = this.game.loop.time + 5000;
      this.target.x = this.pet.x;
      this.target.y = this.pet.y;
      this.wander = false;
      this.clickMoveActive = false;
      this.nextMoveStepAt = this.foodAnimationUntil;
      this.pop('Yum!', this.pet.x, this.pet.y - 100, '#ff9f43');
      save();
  
      if (this.foodSound) {
        this.foodSound.stop();
        if (this.happySound1) this.happySound1.stop();
        if (this.happySound2) this.happySound2.stop();
        if (this.happySound3) this.happySound3.stop();
        this.foodSound.off('complete');
        this.foodSound.once('complete', () => {
          // The happy sound starts 300 ms after SE_food.wav finishes.
          if (this.foodActionToken !== token || !this.audioUnlocked || this.foodStressBonus > 0) return;
          this.foodHappyDelay = this.time.delayedCall(300, () => {
            this.foodHappyDelay = null;
            if (this.foodActionToken !== token || !this.audioUnlocked) return;
            const currentCharacter = this.characterDefs[getCharacterIndex(this.characterDefs)] || {};
            const idDigits = String(currentCharacter.id || '').match(/\d+/);
            const meguId = idDigits ? String(Number(idDigits[0])) : '';
            const meguSize = this.meguSizesById.get(meguId) || '1';
            const happySound = meguSize === '3' ? this.happySound3 : meguSize === '2' ? this.happySound2 : this.happySound1;
            if (happySound) {
              happySound.setVolume(this.sfxVolume);
              happySound.play();
            }
          });
        });
        if (this.audioUnlocked) {
          this.foodSound.setVolume(this.sfxVolume);
          this.foodSound.play();
        }
      }
    }
});
