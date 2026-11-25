// Accessory customization, placement, and overlay lifecycle.
// Loaded after game.js; methods are mixed into Main.prototype to preserve scene context.
Object.assign(Main.prototype, {
  attachAccessoryToFriendThumbnail(profile, preview, rowObjects, menuObjects) {
    const accessories = profile && Array.isArray(profile.accessories) ? profile.accessories
      : (profile && profile.accessory ? [profile.accessory] : []);
    if (!preview || !preview.active || !accessories.length) return;
    const propertyName = `friendListAccessory_${String(profile.userId || profile.petId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    (this[`${propertyName}Items`] || []).forEach(sprite => { if (sprite && sprite.active) sprite.destroy(); });
    this[propertyName] = null;
    this[`${propertyName}Items`] = [];
    preview.once('destroy', () => {
      (this[`${propertyName}Items`] || []).forEach(sprite => { if (sprite && sprite.active) sprite.destroy(); });
      this[`${propertyName}Items`] = [];
      this[propertyName] = null;
    });
    this.syncAccessoryForSprite(this, preview, propertyName, 74.2, accessories);
    (this[`${propertyName}Items`] || []).forEach(overlay => {
      if (overlay && overlay.active) { rowObjects.push(overlay); menuObjects.push(overlay); }
    });
  },
  ensureAccessoryTexture(accessoryId, onReady = null) {
    const id = String(accessoryId == null ? '' : accessoryId).trim();
    if (!id) return false;
    const key = `accessory-image-${id}`;
    if (this.textures.exists(key)) { if (onReady) onReady(key); return true; }
    if (this.accessoryTextureLoading.has(id)) return false;
    this.accessoryTextureLoading.add(id);
    const completeEvent = `filecomplete-image-${key}`;
    const done = () => {
      this.accessoryTextureLoading.delete(id);
      if (this.textures.exists(key) && onReady) onReady(key);
    };
    this.load.once(completeEvent, done);
    this.load.once('loaderror', file => {
      if (file && file.key === key) this.accessoryTextureLoading.delete(id);
    });
    this.load.image(key, `assets/accessories/FUKU${id}.png`);
    if (!(this.load.isLoading && this.load.isLoading())) this.load.start();
    return false;
  },
  getAccessoryPoseKey(frameName) {
    const match = String(frameName || '').match(/_(\d+)(?:-2x)?$/i);
    return match ? String(Number(match[1])) : '5';
  },
  getEquippedAccessories() {
    if (!Array.isArray(GAME_ATTRIBUTES.accessories) || (!GAME_ATTRIBUTES.accessories.length && GAME_ATTRIBUTES.accessory && GAME_ATTRIBUTES.accessory.id)) {
      GAME_ATTRIBUTES.accessories = GAME_ATTRIBUTES.accessory && GAME_ATTRIBUTES.accessory.id
        ? [JSON.parse(JSON.stringify(GAME_ATTRIBUTES.accessory))] : [];
    }
    return GAME_ATTRIBUTES.accessories.filter(item => item && item.id != null);
  },
  getAccessoryPose(frameName, accessoryData = null) {
    const key = this.getAccessoryPoseKey(frameName);
    const poses = accessoryData && accessoryData.poses && typeof accessoryData.poses === 'object' ? accessoryData.poses : {};
    const pose = poses[key] && typeof poses[key] === 'object' ? poses[key] : {};
    return {
      x: Number.isFinite(Number(pose.x)) ? Number(pose.x) : 0,
      y: Number.isFinite(Number(pose.y)) ? Number(pose.y) : -24,
      scale: Phaser.Math.Clamp(Number(pose.scale) || 1, 0.1, 5),
      rotation: Number.isFinite(Number(pose.rotation)) ? Number(pose.rotation) : 0,
      mirror: !!pose.mirror,
      flip: !!pose.flip
    };
  },
  syncAccessoryForSprite(scene, characterSprite, propertyName = 'accessorySprite', depth = null, accessoryData = null) {
    const isPlayerAccessoryProperty = ['accessoryHomeSprite', 'accessoryMeguSprite', 'playerAccessorySprite', 'accessoryAdventureSprite'].includes(propertyName);
    const dataList = Array.isArray(accessoryData) ? accessoryData
      : (accessoryData && accessoryData.id ? [accessoryData]
        : (accessoryData == null && isPlayerAccessoryProperty ? this.getEquippedAccessories() : []));
    const listProperty = `${propertyName}Items`;
    const current = Array.isArray(scene && scene[listProperty]) ? scene[listProperty] : [];
    if (!scene || !characterSprite || !characterSprite.active || !dataList.length) {
      current.forEach(sprite => { if (sprite && sprite.active) sprite.destroy(); });
      if (scene) {
        scene[listProperty] = [];
        if (scene[propertyName] && scene[propertyName].active) scene[propertyName].destroy();
        scene[propertyName] = null;
      }
      return;
    }

    const frameName = characterSprite.frame && characterSprite.frame.name ? characterSprite.frame.name : '';
    const spriteScaleX = Number(characterSprite.scaleX) || 1;
    const spriteScaleY = Number(characterSprite.scaleY) || 1;
    const frameWidth = characterSprite.frame && (characterSprite.frame.realWidth || characterSprite.frame.width)
      ? (characterSprite.frame.realWidth || characterSprite.frame.width) : characterSprite.width;
    const frameHeight = characterSprite.frame && (characterSprite.frame.realHeight || characterSprite.frame.height)
      ? (characterSprite.frame.realHeight || characterSprite.frame.height) : characterSprite.height;
    const originX = Number.isFinite(Number(characterSprite.originX)) ? Number(characterSprite.originX) : 0.5;
    const originY = Number.isFinite(Number(characterSprite.originY)) ? Number(characterSprite.originY) : 0.5;
    const anchorX = characterSprite.x + (0.5 - originX) * frameWidth * spriteScaleX;
    const anchorY = characterSprite.y + (1 - originY) * frameHeight * spriteScaleY;
    const next = [];

    dataList.forEach((data, index) => {
      if (!data || !data.id) return;
      const id = String(data.id);
      const key = `accessory-image-${id}`;
      if (!this.textures.exists(key)) {
        if (current[index] && current[index].active) { current[index].setVisible(false); next[index] = current[index]; }
        this.ensureAccessoryTexture(id, () => this.syncAccessoryForSprite(scene, characterSprite, propertyName, depth, accessoryData));
        return;
      }
      let overlay = current[index];
      if (!overlay || !overlay.active) {
        overlay = scene.add.image(anchorX, anchorY, key).setOrigin(0.5)
          .setData('meguAccessoryOverlay', true)
          .setData('playerAccessoryOverlay', isPlayerAccessoryProperty);
      }
      const pose = this.getAccessoryPose(frameName, data);
      const characterFlippedX = !!characterSprite.flipX;
      // The accessory's local placement is reflected with the character. Its
      // rotation must be reflected too; otherwise a rotated item leans the
      // opposite way when MEGU turns around. The explicit MIRROR setting is
      // another horizontal reflection, so two flips cancel each other.
      const accessoryFlippedX = characterFlippedX !== !!pose.mirror;
      const xOffset = pose.x * spriteScaleX * (characterFlippedX ? -1 : 1);
      const yOffset = pose.y * spriteScaleY;
      const rotation = pose.rotation * (accessoryFlippedX ? -1 : 1);
      overlay.setTexture(key).setPosition(anchorX + xOffset, anchorY + yOffset)
        .setScale(pose.scale * spriteScaleX, pose.scale * spriteScaleY)
        .setRotation(rotation * Math.PI / 180)
        .setFlipX(accessoryFlippedX)
        .setFlipY(!!pose.flip)
        .setDepth((depth == null ? (characterSprite.depth || 0) + 0.02 : depth) + index * 0.0001)
        .setVisible(characterSprite.visible && !this.accessoryPickerOpen && !this.accessoryEditorOpen);
      overlay.setData('meguAccessoryOverlay', true).setData('playerAccessoryOverlay', isPlayerAccessoryProperty);
      next[index] = overlay;
    });
    current.forEach((sprite, index) => {
      if (sprite && sprite.active && !next.includes(sprite)) sprite.destroy();
    });
    scene[listProperty] = next;
    scene[propertyName] = next.find(Boolean) || null;
  },
  updateAccessoryHomeOverlay() {
    if (!this.characterSprite || !this.characterSprite.active) {
      (this.accessoryHomeSpriteItems || []).forEach(sprite => { if (sprite && sprite.active) sprite.setVisible(false); });
      return;
    }
    const rendererDepth = this.meguRenderer && this.meguRenderer.layer && this.meguRenderer.layer.active
      ? this.meguRenderer.layer.depth : (this.characterSprite.depth || 0);
    this.syncAccessoryForSprite(this, this.characterSprite, 'accessoryHomeSprite', rendererDepth + 0.03);
  },
  openAccessoryPicker() {
    if (this.accessoryPickerOpen || this.accessoryEditorOpen) return;
    if (!this.prepareForExternalInteraction()) return;
    this.closeFooterMenu();
    this.closeOtherPickersForFooterMenu();
    this.purgeAccessoryUiObjects();
    // Purge any stale furniture-catalogue display objects so they cannot leak
    // into the accessory screen after a menu transition.
    if (this.fOpen) this.toggleFurn(false);
    if (this.fMenuObjects && this.fMenuObjects.length) {
      this.fMenuObjects.forEach(obj => { if (obj && obj.active) obj.destroy(); });
      this.fMenuObjects = [];
      this.fRowsUI = [];
      this.fSelectButton = null;
      this.fSelectLabel = null;
      this.fScrollLabel = null;
      this.fScrollTrack = null;
      this.fScrollTrackHit = null;
      this.fScrollThumb = null;
      this.fMenuBackground = null;
      this.fCancelButton = null;
      this.fNoResultsLabel = null;
    }
    this.accessoryUiScope = this.createUiResourceScope();
    this.accessoryPickerOpen = true;
    this.pendingMeguMessage = null;
    if (this.meguMessageDeferredTimer) { this.meguMessageDeferredTimer.remove(false); this.meguMessageDeferredTimer = null; }
    if (this.meguMessageTimer) { this.meguMessageTimer.remove(false); this.meguMessageTimer = null; }
    if (this.meguMessageContainer && this.meguMessageContainer.active) this.meguMessageContainer.destroy(true);
    this.meguMessageContainer = null;
    this.accessorySelectedIndex = -1;
    this.accessoryPickerScroll = 0;
    this.accessoryPickerObjects = [];
    this.accessoryPickerRows = [];
    this.accessoryPickerScrollPress = null;

    const add = (obj, depth = 20) => {
      if (obj && obj.setDepth) obj.setDepth(depth);
      if (obj && obj.setVisible) obj.setVisible(true);
      if (obj && obj.setData) obj.setData('accessoryUiObject', true);
      this.accessoryPickerObjects.push(obj);
      this.accessoryUiScope.add(obj);
      return obj;
    };

    // Match the furniture catalogue's artwork, row positions, preview sizing,
    // selection highlight, scrollbar and confirm/cancel hit areas.
    if (this.textures.exists('menu-accessory')) {
      add(this.add.image(0, 0, 'menu-accessory').setOrigin(0, 0).setDisplaySize(W, H)
        .setInteractive({ useHandCursor: false }), 20);
    } else {
      add(this.add.rectangle(W / 2, H / 2, W, H, 0x382e2a, 0.98)
        .setInteractive({ useHandCursor: false }), 20);
    }

    const layout = (id, fallback) => MeguMenuLayouts.button(this, 'accessory_picker', id, fallback);
    const rowLayouts = [1, 2, 3].map((i, index) => {
      const thumb = layout('row_' + i + '_thumbnail', { x: 32, y: [174, 300, 424][index], width: 122, height: 122 });
      const desc = layout('row_' + i + '_description', { x: 168, y: [178, 302, 426][index], width: 444, height: 118 });
      return { thumb: { x: thumb.x, y: thumb.y, w: thumb.width, h: thumb.height },
        desc: { x: desc.x, y: desc.y, w: desc.width, h: desc.height } };
    });
    this.accessoryPickerNoResults = add(this.add.text(W / 2, 360, 'No accessories available.', textStyle(20, '#5a4430'))
      .setOrigin(0.5).setVisible(false), 26);

    for (let i = 0; i < rowLayouts.length; i++) {
      const rowLayout = rowLayouts[i];
      const box = rowLayout.thumb;
      const desc = rowLayout.desc;
      const cy = box.y + box.h / 2;
      const select = layout('row_' + (i + 1) + '_select', { x: 32, y: desc.y, width: 578, height: desc.h });
      const hitX = select.hitboxX ?? select.x, hitY = select.hitboxY ?? select.y;
      const hitW = select.hitboxWidth ?? select.width, hitH = select.hitboxHeight ?? select.height;
      const rc = add(this.add.rectangle(hitX + hitW / 2, hitY + hitH / 2, hitW, hitH, 0xffd34f, 0.001)
        .setStrokeStyle(1, 0xffd34f, 0).setInteractive({ useHandCursor: true }), 22);
      const name = add(this.add.text(desc.x, desc.y, '', textStyle(24, '#3d3024')).setOrigin(0, 0).setWordWrapWidth(desc.w), 24);
      const detail = add(this.add.text(desc.x, desc.y + 38, '', textStyle(16, '#3d3024')).setOrigin(0, 0).setWordWrapWidth(desc.w), 24);
      const row = { rc, name, detail, preview: null, previewId: null, thumbBox: box, descBox: desc, cy, index: -1, renderedIndex: -1 };
      MeguScrollableMenu.bindRow(this, this.accessoryUiScope, rc, {
        getIndex: () => row.index,
        getCount: () => this.accessoryDefs.length,
        getScroll: () => this.accessoryPickerScroll,
        setScroll: index => { this.accessoryPickerScroll = index; this.updateAccessoryPicker(); },
        onSelect: index => { this.accessorySelectedIndex = index; this.updateAccessoryPicker(); }
      });
      this.accessoryPickerRows.push(row);
    }

    const scrollbar = layout('scrollbar', { x: 611, y: 178, width: 8, height: 366, hitboxWidth: 24 });
    this.accessoryMenuScrollbar = MeguScrollableMenu.createScrollbar(this, {
      scope: this.accessoryUiScope,
      add: object => add(object, object.depth),
      x: scrollbar.x, top: scrollbar.y, height: scrollbar.height,
      width: scrollbar.width, hitWidth: scrollbar.hitboxWidth ?? 24,
      depth: 23, visible: 3,
      getCount: () => this.accessoryDefs.length,
      getIndex: () => this.accessoryPickerScroll,
      setIndex: index => { this.accessoryPickerScroll = index; this.updateAccessoryPicker(); }
    });
    this.accessoryPickerScrollTrack = this.accessoryMenuScrollbar.track;
    this.accessoryPickerScrollTrackHit = this.accessoryMenuScrollbar.hit;
    this.accessoryPickerScrollThumb = this.accessoryMenuScrollbar.thumb;

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
    const confirm = layout('confirm', { x: 549, y: 633, width: 59, height: 49 });
    const cancel = layout('cancel', { x: 478, y: 633, width: 65, height: 49 });
    this.accessoryPickerConfirmButton = buttonHitbox(confirm.hitboxX ?? confirm.x, confirm.hitboxY ?? confirm.y,
      confirm.hitboxWidth ?? confirm.width, confirm.hitboxHeight ?? confirm.height, () => {
      const item = this.accessoryDefs[this.accessorySelectedIndex];
      if (item) this.openAccessoryEditor(item);
    });
    this.accessoryPickerCancelButton = buttonHitbox(cancel.hitboxX ?? cancel.x, cancel.hitboxY ?? cancel.y,
      cancel.hitboxWidth ?? cancel.width, cancel.hitboxHeight ?? cancel.height, () => this.closeAccessoryUi(false));
    const remove = layout('remove_all', { x: 320, y: 590, width: 142, height: 38 });
    const removeAll = add(this.add.rectangle(remove.x, remove.y, remove.width, remove.height, 0x9b4540, 1)
      .setStrokeStyle(2, 0xffe7ad).setInteractive({ useHandCursor: true }), 30);
    add(this.add.text(remove.x, remove.y, 'REMOVE ALL', textStyle(15, '#ffffff')).setOrigin(0.5), 31);
    // Separate invisible hit target when hitbox overrides are supplied.
    const rhx = remove.hitboxX ?? (remove.x - remove.width / 2);
    const rhy = remove.hitboxY ?? (remove.y - remove.height / 2);
    const rhw = remove.hitboxWidth ?? remove.width, rhh = remove.hitboxHeight ?? remove.height;
    const removeHit = add(this.add.zone(rhx + rhw / 2, rhy + rhh / 2, rhw, rhh)
      .setInteractive({ useHandCursor: true }), 32);
    removeHit.on('pointerdown', (pointer, x, y, event) => { event?.stopPropagation(); this.removeAllAccessories(); });
    removeAll.on('pointerdown', (pointer, x, y, event) => { event?.stopPropagation(); this.removeAllAccessories(); });
    this.accessoryPickerRemoveAllButton = removeAll;
    this.updateAccessoryPicker();
  },
  removeAllAccessories() {
    if (!this.accessoryPickerOpen) return;
    GAME_ATTRIBUTES.accessories = [];
    GAME_ATTRIBUTES.accessory = { id: '', poses: {} };
    save();
    this.destroyPlayerAccessoryOverlays();
    this.updateAccessoryHomeOverlay();
    (this.accessoryPickerRows || []).forEach(row => { row.renderedIndex = -1; });
    this.updateAccessoryPicker();
  },
  updateAccessoryPicker() {
    if (!this.accessoryPickerOpen || !this.accessoryPickerRows) return;
    const defs = this.accessoryDefs || [];
    const maxScroll = Math.max(0, defs.length - 3);
    this.accessoryPickerScroll = Phaser.Math.Clamp(this.accessoryPickerScroll || 0, 0, maxScroll);
    const start = this.accessoryPickerScroll;
    const visibleItems = defs.slice(start, start + 3);
    if (this.accessoryPickerNoResults) this.accessoryPickerNoResults.setVisible(defs.length === 0);

    this.accessoryPickerRows.forEach((row, i) => {
      const index = start + i;
      const item = defs[index];
      row.index = item ? index : -1;
      row.rc.setVisible(!!item);
      row.name.setVisible(!!item);
      row.detail.setVisible(!!item && !!item.detail);
      if (!item) {
        if (row.preview) row.preview.setVisible(false);
        row.renderedIndex = -1;
        row.previewId = null;
        return;
      }
      const selected = index === this.accessorySelectedIndex;
      row.rc.setFillStyle(0xffd34f, selected ? 0.16 : 0.001)
        .setStrokeStyle(selected ? 3 : 1, 0xffd34f, selected ? 0.98 : 0);
      if (row.renderedIndex !== index) {
        row.name.setPosition(row.descBox.x, row.descBox.y);
        row.detail.setPosition(row.descBox.x, row.descBox.y + 38);
        this.fitTextToBounds(row.name, item.name, {
          width: row.descBox.w, height: 32, jaBaseSize: 20, jaMinSize: 12, jaMaxLines: 1,
          enBaseSize: 20, enMaxLines: 1, lineSpacing: 0
        });
        const isEquipped = this.getEquippedAccessories().some(accessory => String(accessory.id) === String(item.id));
        this.fitTextToBounds(row.detail, `${isEquipped ? 'EQUIPPED  •  ' : ''}${item.detail || ''}`, {
          width: row.descBox.w, height: 52, jaBaseSize: 16, jaMinSize: 10, jaMaxLines: 2,
          enBaseSize: 16, enMaxLines: 2, lineSpacing: 0
        });
        row.renderedIndex = index;
      }
      const id = String(item.id);
      if (row.previewId !== id) {
        if (row.preview) row.preview.setVisible(false);
        row.previewId = id;
      }
      const textureKey = `accessory-image-${id}`;
      if (this.textures.exists(textureKey)) {
        const texture = this.textures.get(textureKey);
        const frame = texture.get();
        if (!row.preview) {
          row.preview = this.add.image(row.thumbBox.x + row.thumbBox.w / 2, row.cy, textureKey)
            .setOrigin(0.5).setDepth(23);
          row.preview.setData('accessoryUiObject', true);
          this.accessoryPickerObjects.push(row.preview);
          this.accessoryUiScope?.add(row.preview);
        }
        const width = frame ? frame.width : 64;
        const height = frame ? frame.height : 64;
        const scale = Math.min(1.5, 112 / Math.max(1, width), 112 / Math.max(1, height));
        row.preview.setTexture(textureKey).setPosition(row.thumbBox.x + row.thumbBox.w / 2, row.cy)
          .setScale(scale).setVisible(true);
      } else {
        if (row.preview) row.preview.setVisible(false);
        const pickerScope = this.accessoryUiScope;
        this.ensureAccessoryTexture(id, () => {
          if (pickerScope?.active && this.accessoryUiScope === pickerScope && this.accessoryPickerOpen) this.updateAccessoryPicker();
        });
      }
    });

    this.accessoryMenuScrollbar?.update();
    if (this.accessoryPickerConfirmButton && this.accessoryPickerConfirmButton.active) {
      this.accessoryPickerConfirmButton.setAlpha(this.accessorySelectedIndex >= 0 && !!defs[this.accessorySelectedIndex] ? 0.24 : 0.001);
    }
  },
  purgeAccessoryUiObjects() {
    // Both picker and editor use the shared UI lifecycle resource scope.
    this.stopAccessoryAdjustHold();
    if (this.accessoryPreviewRenderer && !this.accessoryPreviewRenderer.destroyed) {
      this.accessoryPreviewRenderer.destroy();
    }
    this.accessoryPreviewRenderer = null;
    this.accessoryUiScope?.destroy();
    this.accessoryUiScope = null;
    this.accessoryPickerObjects = [];
    this.accessoryPreviewAccessory = null;
    this.accessoryPreviewCharacter = null;
    this.accessoryPreviewEyes = null;
    this.accessoryPreviewStatus = null;
    this.accessoryPreviewBox = null;
  },
  openAccessoryEditor(item) {
    if (!item) return;
    this.accessoryPickerOpen = false;
    this.purgeAccessoryUiObjects();
    this.accessoryUiScope = this.createUiResourceScope();
    this.accessoryEditorOpen = true;
    this.accessoryEditingItem = item;
    const id = String(item.id);
    const equipped = this.getEquippedAccessories().find(accessory => String(accessory.id) === id);
    this._accessoryEditorData = equipped ? JSON.parse(JSON.stringify(equipped)) : { id, poses: {} };
    const characterId = meguTextureKey(GAME_ATTRIBUTES.petId || 'ID1', GAME_ATTRIBUTES.shiny === true);
    const texture = this.textures.exists(characterId) ? this.textures.get(characterId) : null;
    if (!texture) {
      this.accessoryEditorOpen = false;
      this.openAccessoryPicker();
      return;
    }
    const previewFrameByNumber = new Map();
    texture.getFrameNames().forEach(name => {
      const match = String(name).match(new RegExp('^' + characterId + '_(\\d+)(-2x)?$'));
      if (!match || Number(match[1]) === 7 || Number(match[1]) === 8) return;
      const number = String(Number(match[1]));
      if (!previewFrameByNumber.has(number) || match[2]) previewFrameByNumber.set(number, name);
    });
    this.accessoryPreviewFrames = Array.from(previewFrameByNumber.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0])).map(entry => entry[1]);
    if (!this.accessoryPreviewFrames.length) {
      this.closeAccessoryUi(false);
      return;
    }
    const standingIndex = this.accessoryPreviewFrames.findIndex(frame => this.getAccessoryPoseKey(frame) === '5');
    this.accessoryPreviewFrameIndex = Math.max(0, standingIndex);
    // Existing saved poses and every pose visited in this editing session are
    // initialized; the first-pose convenience copy must leave them untouched.
    const savedInitialized = Array.isArray(this._accessoryEditorData.initializedPoses)
      ? this._accessoryEditorData.initializedPoses.map(String) : [];
    // A pose with existing saved coordinates is also considered initialized,
    // preserving placements made by earlier versions of the editor.
    this._accessoryEditorInitializedPoses = new Set([
      ...savedInitialized,
      ...Object.keys(this._accessoryEditorData.poses || {}).map(String)
    ]);
    this._accessoryEditorFirstPoseKey = this.getAccessoryPoseKey(this.accessoryPreviewFrames[this.accessoryPreviewFrameIndex]);
    const add = (obj, depth = 120) => {
      obj.setDepth(depth).setScrollFactor(0).setData('accessoryUiObject', true);
      this.accessoryPickerObjects.push(obj);
      this.accessoryUiScope.add(obj);
      return obj;
    };

    // Center-anchored geometry for the accessory placement editor.
    // Each control has independently editable artwork and hitbox dimensions.
    const editorButton = (name, x, y, width, height) =>
      MeguMenuLayouts.button(this, 'accessory_editor', name, { x, y, width, height });
    const editorHit = (rect, config) => {
      const w = config.hitboxWidth ?? config.width;
      const h = config.hitboxHeight ?? config.height;
      const hx = config.hitboxX ?? config.x;
      const hy = config.hitboxY ?? config.y;
      // Phaser's rectangle hit area is in local top-left coordinates.
      rect.setInteractive(new Phaser.Geom.Rectangle(
        (hx - w / 2) - (config.x - config.width / 2),
        (hy - h / 2) - (config.y - config.height / 2), w, h
      ), Phaser.Geom.Rectangle.Contains);
      rect.input.cursor = 'pointer';
      return rect;
    };
    const editorRect = (name, x, y, width, height, color, border) => {
      const b = editorButton(name, x, y, width, height);
      return { b, rect: add(editorHit(this.add.rectangle(b.x, b.y, b.width, b.height, color, 1)
        .setStrokeStyle(2, border), b)) };
    };
    // The editor is a square 640 x 640 modal. The character preview is centered
    // in the available canvas area, with all controls kept inside its bounds.
    add(this.add.rectangle(320, 320, 640, 640, 0x171411, 0.98));
    add(this.add.text(320, 28, `PLACE ${item.name}`, { ...textStyle(23), color: '#fff1c8', fontStyle: 'bold' }).setOrigin(0.5));

    const initialFrameData = texture.get(this.accessoryPreviewFrames[this.accessoryPreviewFrameIndex]);
    const previewWidth = Math.max(1, initialFrameData.width || 64);
    const previewHeight = Math.max(1, initialFrameData.height || 64);
    const previewPosition = editorButton('preview', 320, 270, previewWidth, previewHeight);
    const previewCenterX = previewPosition.x;
    const previewCenterY = previewPosition.y;
    const previewTop = previewCenterY - previewHeight / 2;
    const previewBottom = previewCenterY + previewHeight / 2;
    this.accessoryPreviewBox = add(this.add.rectangle(previewCenterX, previewCenterY, previewWidth, previewHeight, 0x5c4938, 0.35)
      .setStrokeStyle(2, 0xffe0a1, 0.9));
    // The preview uses the same renderer as live characters. It has no ground
    // shadow because this is a floating editor preview, not a gameplay actor.
    this.accessoryPreviewRenderer?.destroy();
    this.accessoryPreviewRenderer = new MeguRenderer(this, {
      atlasKey: characterId, framePrefix: characterId,
      x: previewCenterX, y: previewBottom, depth: 120,
      state: MeguRenderer.STATES.STANDING_1,
      autoUpdate: false, shadow: false
    });
    const previewLayer = add(this.accessoryPreviewRenderer.layer);
    previewLayer.setDepth(120).setScrollFactor(0).setData('accessoryUiObject', true);
    this.accessoryPickerObjects.push(previewLayer);
    this.accessoryUiScope.add(previewLayer);
    this.accessoryPreviewCharacter = this.accessoryPreviewRenderer.sprite;
    this.accessoryPreviewEyes = this.accessoryPreviewRenderer.overlay;
    this.accessoryPreviewAccessory = null;
    this.accessoryPreviewStatus = add(this.add.text(320, 425, '', textStyle(14, '#fff0c7')).setOrigin(0.5));

    const arrows = (name, x, label, delta) => {
      const { b, rect } = editorRect(name, x, previewCenterY, 48, 58, 0x79583b, 0xffe7ad);
      add(this.add.text(b.x, b.y, label, textStyle(27, '#fff4d8')).setOrigin(0.5));
      rect.on('pointerdown', () => this.changeAccessoryPreviewFrame(delta));
    };
    arrows('previous_pose', Math.max(34, previewCenterX - previewWidth / 2 - 42), '‹', -1);
    arrows('next_pose', Math.min(606, previewCenterX + previewWidth / 2 + 42), '›', 1);

    const control = (name, x, y, label, fn, width = 104) => {
      const { b, rect } = editorRect(name, x, y, width, 40, 0x79583b, 0xffe7ad);
      add(this.add.text(b.x, b.y, label, textStyle(16, '#fff4d8')).setOrigin(0.5));
      rect.on('pointerdown', fn);
    };
    const holdControl = (name, x, y, label, property, direction) => {
      const { b, rect } = editorRect(name, x, y, 104, 40, 0x79583b, 0xffe7ad);
      add(this.add.text(b.x, b.y, label, textStyle(16, '#fff4d8')).setOrigin(0.5));
      rect.on('pointerdown', pointer => {
        if (pointer && pointer.leftButtonDown && !pointer.leftButtonDown()) return;
        this.startAccessoryAdjustHold(property, direction);
      });
    };
    holdControl('size_decrease', 130, 480, 'SIZE −', 'scale', -1);
    holdControl('size_increase', 250, 480, 'SIZE +', 'scale', 1);
    holdControl('rotation_decrease', 390, 480, 'ROT −', 'rotation', -1);
    holdControl('rotation_increase', 510, 480, 'ROT +', 'rotation', 1);
    control('mirror', 210, 525, 'MIRROR', () => this.toggleAccessoryPoseFlip('mirror'), 112);
    control('flip', 430, 525, 'FLIP', () => this.toggleAccessoryPoseFlip('flip'), 112);
    control('copy_placement', 320, 570, 'COPY PLACEMENT TO OTHER POSES', () => this.copyAccessoryPlacementToOtherPoses(), 300);

    const confirmButton = editorRect('confirm', 425, 615, 150, 40, 0x438b50, 0xffffff);
    add(this.add.text(confirmButton.b.x, confirmButton.b.y, 'CONFIRM', textStyle(17, '#ffffff')).setOrigin(0.5));
    confirmButton.rect.on('pointerdown', () => this.confirmAccessoryPlacement());
    const quitButton = editorRect('quit', 215, 615, 150, 40, 0x79583b, 0xffe7ad);
    add(this.add.text(quitButton.b.x, quitButton.b.y, 'QUIT', textStyle(17, '#fff4d8')).setOrigin(0.5));
    quitButton.rect.on('pointerdown', () => this.closeAccessoryUi(false));

    this.accessoryPreviewDrag = false;
    const editorScope = this.accessoryUiScope;
    this.ensureAccessoryTexture(id, key => {
      if (!editorScope?.active || this.accessoryUiScope !== editorScope || !this.accessoryEditorOpen) return;
      this.accessoryPreviewAccessory = this.add.image(previewCenterX, previewCenterY, key).setOrigin(0.5)
        .setDepth(124).setScrollFactor(0).setData('accessoryUiObject', true)
        .setInteractive({ useHandCursor: true, draggable: true });
      this.accessoryPickerObjects.push(this.accessoryPreviewAccessory);
      this.accessoryUiScope?.add(this.accessoryPreviewAccessory);
      this.input.setDraggable(this.accessoryPreviewAccessory);
      this.accessoryPreviewAccessory.on('drag', (pointer, dragX, dragY) => {
        const pose = this.currentAccessoryEditorPose();
        const scaleX = this.accessoryPreviewCharacter.scaleX || 1;
        const scaleY = this.accessoryPreviewCharacter.scaleY || 1;
        pose.x = (dragX - this.accessoryPreviewCharacter.x) / scaleX;
        pose.y = (dragY - this.accessoryPreviewCharacter.y) / scaleY;
        this.applyAccessoryPreviewPose();
      });
      this.applyAccessoryPreviewPose();
    });
    this.changeAccessoryPreviewFrame(0);
  },
  currentAccessoryEditorPose() {
    const id = String(this.accessoryEditingItem && this.accessoryEditingItem.id || '');
    const equipped = this.getEquippedAccessories().find(accessory => String(accessory.id) === id);
    const data = this._accessoryEditorData || (equipped ? JSON.parse(JSON.stringify(equipped)) : { id, poses: {} });
    if (!data.poses || typeof data.poses !== 'object') data.poses = {};
    const key = this.getAccessoryPoseKey(this.accessoryPreviewFrames[this.accessoryPreviewFrameIndex]);
    if (!data.poses[key]) data.poses[key] = { x: 0, y: -24, scale: 1, rotation: 0, mirror: false, flip: false };
    this._accessoryEditorData = data;
    return data.poses[key];
  },
  applyAccessoryPreviewPose() {
    if (!this.accessoryEditorOpen || !this.accessoryPreviewCharacter) return;
    const frameName = this.accessoryPreviewFrames[this.accessoryPreviewFrameIndex];
    this.accessoryPreviewRenderer?.setCustomFrame(frameName);
    const poseNumber = this.getAccessoryPoseKey(frameName);
    if (this.accessoryPreviewRenderer) {
      this.accessoryPreviewRenderer.setEyeOverlayVisible(poseNumber === '5' || poseNumber === '6');
      this.accessoryPreviewRenderer.update(this.time.now, 0);
    }
    const poseKey = this.getAccessoryPoseKey(frameName);
    if (this._accessoryEditorInitializedPoses) this._accessoryEditorInitializedPoses.add(poseKey);
    const pose = this.currentAccessoryEditorPose();
    if (this.accessoryPreviewAccessory && this.accessoryPreviewAccessory.active) {
      const previewFlippedX = !!this.accessoryPreviewCharacter.flipX !== !!pose.mirror;
      const previewRotation = (Number(pose.rotation) || 0) * (previewFlippedX ? -1 : 1);
      this.accessoryPreviewAccessory.setPosition(this.accessoryPreviewCharacter.x + pose.x, this.accessoryPreviewCharacter.y + pose.y)
        .setScale(Phaser.Math.Clamp(Number(pose.scale) || 1, 0.1, 5))
        .setRotation(previewRotation * Math.PI / 180)
        .setFlipX(previewFlippedX).setFlipY(!!pose.flip);
    }
    if (this.accessoryPreviewStatus) this.accessoryPreviewStatus.setText(`Sprite ${this.accessoryPreviewFrameIndex + 1}/${this.accessoryPreviewFrames.length}  •  Drag item to place`);
  },
  changeAccessoryPreviewFrame(delta) {
    if (!this.accessoryEditorOpen || !this.accessoryPreviewFrames.length) return;
    const count = this.accessoryPreviewFrames.length;
    this.accessoryPreviewFrameIndex = (this.accessoryPreviewFrameIndex + delta + count) % count;
    this.applyAccessoryPreviewPose();
  },
  startAccessoryAdjustHold(property, direction) {
    this.stopAccessoryAdjustHold();
    if (!this.accessoryEditorOpen) return;
    const startedAt = this.time ? this.time.now : Date.now();
    const step = () => {
      const elapsed = (this.time ? this.time.now : Date.now()) - startedAt;
      const multiplier = elapsed >= 6000 ? 10 : elapsed >= 4000 ? 5 : elapsed >= 2000 ? 2 : 1;
      const amount = property === 'scale' ? 0.02 * multiplier : multiplier;
      this.adjustAccessoryPose(property, direction * amount);
    };
    step();
    this._accessoryAdjustHoldEvent = this.time.addEvent({ delay: 75, loop: true, callback: step });
    this._accessoryAdjustHoldRelease = () => this.stopAccessoryAdjustHold();
    this.input.on('pointerup', this._accessoryAdjustHoldRelease);
    this.input.on('gameout', this._accessoryAdjustHoldRelease);
  },
  stopAccessoryAdjustHold() {
    if (this._accessoryAdjustHoldEvent) {
      this._accessoryAdjustHoldEvent.remove(false);
      this._accessoryAdjustHoldEvent = null;
    }
    if (this._accessoryAdjustHoldRelease && this.input) {
      this.input.off('pointerup', this._accessoryAdjustHoldRelease);
      this.input.off('gameout', this._accessoryAdjustHoldRelease);
      this._accessoryAdjustHoldRelease = null;
    }
  },
  adjustAccessoryPose(property, amount) {
    if (!this.accessoryEditorOpen) return;
    const pose = this.currentAccessoryEditorPose();
    if (property === 'scale') pose.scale = Phaser.Math.Clamp((Number(pose.scale) || 1) + amount, 0.1, 5);
    else if (property === 'rotation') pose.rotation = ((Number(pose.rotation) || 0) + amount) % 360;
    this.applyAccessoryPreviewPose();
  },
  toggleAccessoryPoseFlip(property) {
    if (!this.accessoryEditorOpen || !['mirror', 'flip'].includes(property)) return;
    const pose = this.currentAccessoryEditorPose();
    pose[property] = !pose[property];
    this.applyAccessoryPreviewPose();
  },
  copyAccessoryPlacementToOtherPoses() {
    if (!this.accessoryEditorOpen || !this.accessoryPreviewFrames || !this.accessoryPreviewFrames.length) return;
    const sourceKey = this.getAccessoryPoseKey(this.accessoryPreviewFrames[this.accessoryPreviewFrameIndex]);
    const source = this.currentAccessoryEditorPose();
    const copied = {
      x: Number(source.x) || 0,
      y: Number(source.y) || 0,
      scale: Phaser.Math.Clamp(Number(source.scale) || 1, 0.1, 5),
      rotation: Number(source.rotation) || 0,
      mirror: !!source.mirror,
      flip: !!source.flip
    };
    const data = this._accessoryEditorData || { id: String(this.accessoryEditingItem && this.accessoryEditingItem.id || ''), poses: {} };
    if (!data.poses || typeof data.poses !== 'object') data.poses = {};
    this.accessoryPreviewFrames.forEach(frameName => {
      const key = this.getAccessoryPoseKey(frameName);
      if (key !== sourceKey) data.poses[key] = { ...copied };
    });
    this._accessoryEditorData = data;
    if (this.accessoryPreviewStatus) this.accessoryPreviewStatus.setText('Placement copied to all other poses');
  },
  confirmAccessoryPlacement() {
    if (!this.accessoryEditorOpen || !this.accessoryEditingItem) return;
    const editorData = this._accessoryEditorData || { id: String(this.accessoryEditingItem.id), poses: {} };
    if (!editorData.poses || typeof editorData.poses !== 'object') editorData.poses = {};
    editorData.id = String(this.accessoryEditingItem.id);
    const accessories = this.getEquippedAccessories().filter(accessory => String(accessory.id) !== editorData.id);
    accessories.push(JSON.parse(JSON.stringify(editorData)));
    GAME_ATTRIBUTES.accessories = accessories;
    GAME_ATTRIBUTES.accessory = accessories[0] || { id: '', poses: {} }; // Legacy-save compatibility.
    save();
    const selectedId = String(this.accessoryEditingItem.id);
    this.closeAccessoryUi(true);
    this.ensureAccessoryTexture(selectedId, () => this.updateAccessoryHomeOverlay());
    this.updateAccessoryHomeOverlay();
  },
  closeAccessoryUi(confirmed = false) {
    this.stopAccessoryAdjustHold();
    this.accessoryPickerOpen = false;
    this.accessoryEditorOpen = false;
    this.accessoryPreviewRenderer?.destroy();
    this.accessoryPreviewRenderer = null;
    this.purgeAccessoryUiObjects();
    this.accessoryPickerRows = [];
    this.accessoryPickerScrollPress = null;
    this.accessoryMenuScrollbar = null;
    if (this._accessoryPickerPointerMove) { this.input.off('pointermove', this._accessoryPickerPointerMove); this._accessoryPickerPointerMove = null; }
    if (this._accessoryPickerPointerUp) { this.input.off('pointerup', this._accessoryPickerPointerUp); this._accessoryPickerPointerUp = null; }
    this.accessoryPickerConfirmButton = null;
    this.accessoryPickerCancelButton = null;
    this.accessoryPickerScrollThumb = null;
    this.accessoryPickerScrollTrackHit = null;
    this.accessoryPickerScrollTrack = null;
    this.accessoryPickerNoResults = null;
    this.accessoryPreviewCharacter = null;
    this.accessoryPreviewEyes = null;
    this.accessoryPreviewRenderer = null;
    this.accessoryPreviewAccessory = null;
    this.accessoryPreviewStatus = null;
    this.accessoryEditingItem = null;
    this._accessoryEditorData = null;
    this._accessoryEditorInitializedPoses = null;
    this._accessoryEditorFirstPoseKey = null;
    this.accessoryPreviewFrames = [];
    this.accessoryPreviewBox = null;
    this.syncMeguMenuVisibility();
    this.updateAccessoryHomeOverlay();
  },
  destroyPlayerAccessoryOverlays() {
    // Remove every player-accessory image from every live scene, including
    // overlays whose owning sprite was already destroyed or replaced.
    const manager = this.game && this.game.scene;
    const scenes = manager && manager.getScenes ? manager.getScenes(false) : [this];
    scenes.forEach(scene => {
      if (!scene) return;
      const children = scene.children && scene.children.list ? scene.children.list.slice() : [];
      children.forEach(object => {
        const isPlayerAccessory = object && object.active && object.getData &&
          (object.getData('playerAccessoryOverlay') || object === scene.accessoryHomeSprite || object === scene.accessoryMeguSprite);
        if (isPlayerAccessory) object.destroy();
      });
      ['accessoryHomeSprite', 'accessoryMeguSprite', 'playerAccessorySprite', 'accessoryAdventureSprite']
        .forEach(property => {
          (scene[`${property}Items`] || []).forEach(object => { if (object && object.active) object.destroy(); });
          scene[`${property}Items`] = [];
          const object = scene[property];
          if (object && object.active) object.destroy();
          scene[property] = null;
        });
    });
  }
});
