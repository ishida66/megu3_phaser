/* Home-scene pointer input for petting, editing, guestbook, and picker scrolling. */
Object.assign(Main.prototype, {
  initializePetInteractionInput() {
    this.input.on('pointerdown', pointer => {
      if (this.gymActive || this.gymClosing) return;
      // The level-up reward sequence is modal: its close button is the only
      // accepted input until every queued reward has been dismissed.
      if (this.levelUpRewardState) return;
      // Ignore all input while the room is fading/loading; once visible, Friend
      // Visit permits only petting the player's own MEGU.
      if (this.isUnifiedMenuBlockingHomeInput() || this.friendHouseTransition) return;
      if (this.visitingHouse) {
        if (this.foodOpen || this.fOpen || this.visitorGiftTransferActive) return;
        const hostTarget=this.visitingHouse.hostPetTarget;
        if (hostTarget && this.isFriendPetHit(pointer,hostTarget)) {
          this.beginFriendPetting(pointer,hostTarget);
        } else if (!this.bathMode && !this.foodSequenceActive && !this.foodActionActive &&
                   !this.footerMenuOpen && !this.isEvolutionAnimating && this.isPetHit(pointer)) {
          this.beginPetting(pointer);
        } else if (this.pettingActive) this.endPetting();
        return;
      }
      if (this.bathMode) {
        this.bathPointerDown = this.cleanMode
          ? (pointer.y >= 440 && pointer.y < 640)
          : this.isPetHit(pointer);
        this.bathLastPointer = this.bathPointerDown ? { x: pointer.x, y: pointer.y, time: this.time.now } : null;
        if (this.cleanMode && this.bathPointerDown) this.removeRoomDirtAt(pointer.x, pointer.y);
        return;
      }
      // Feeding is one uninterrupted sequence: ignore every pointer interaction
      // (including petting) from the throw through the end of the eating pose.
      if (this.foodSequenceActive || this.foodActionActive) return;
      const uiOpen = !!(this.foodOpen || this.menuOpen || this.bOpen || this.fOpen || this.accessoryPickerOpen || this.accessoryEditorOpen || this.editMode || this.footerMenuOpen || this.evolutionPickerObjects || this.jukeboxMenuOpen);
      if (!uiOpen && pointer.y >= 0 && pointer.y < 640) {
        const jukeboxIndex = this.findJukeboxFurnitureAt(pointer.x, pointer.y);
        if (jukeboxIndex >= 0) { this.openJukeboxMenu(jukeboxIndex); return; }
      }
      const friendHit = !uiOpen && this.hitFriendPet(pointer);
      if (friendHit) {
        this.beginFriendPetting(pointer, friendHit);
        return;
      }
      const onCharacter = !uiOpen && this.isPetHit(pointer);
      if (onCharacter) this.beginPetting(pointer);
      else if (this.pettingActive) this.endPetting();
      if (!this.audioUnlocked || !this.clickSound) return;
      if (!onCharacter) {
        this.clickSound.setVolume(this.sfxVolume);
        this.clickSound.play();
      }
    });
    this.input.on('pointermove', pointer => {
      if (this.gymActive || this.gymClosing) return;
      if (this.isUnifiedMenuBlockingHomeInput() || this.friendHouseTransition) return;
      if (this.visitingHouse) {
        if (this.pettingActive) this.trackPettingMovement(pointer);
        return;
      }
      if (this.bathMode) this.trackBathMovement(pointer); else this.trackPettingMovement(pointer);
    });
    this.input.on('pointerup', () => { if (this.gymActive || this.gymClosing) return; if (this.messageBoardUi || this.levelUpRewardState) return; this.endPetting(); this.bathPointerDown = false; this.bathLastPointer = null; });
    this.input.on('pointerupoutside', () => { if (this.gymActive || this.gymClosing) return; if (this.messageBoardUi || this.levelUpRewardState) return; this.endPetting(); this.bathPointerDown = false; this.bathLastPointer = null; });
  },
  initializePickerScrollingInput() {
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (pointer.y < 86 || pointer.y > 602) return;
      const direction = deltaY > 0 ? 1 : -1;
      const steps = Math.max(1, Math.round(Math.abs(deltaY) / 100));
      if (this.foodOpen) {
        // The Food item list uses the enlarged 2× layout (three rows from y=174 to y=546).
        const overFoodRows = pointer.y >= 174 && pointer.y <= 546 && pointer.x >= 145 && pointer.x <= 610;
        const overFoodScrollbar = pointer.y >= 178 && pointer.y <= 544 && pointer.x >= 590 && pointer.x <= 635;
        if (!overFoodRows && !overFoodScrollbar) return;
        this.foodScroll = Phaser.Math.Clamp(this.foodScroll + direction * steps, 0, Math.max(0, this.foodMenuDefs.length - this.foodVisibleRows));
        this.updateFoodMenu();
      } else if (this.fOpen) {
        if (pointer.y < 174 || pointer.y > 546 || pointer.x < 16 || pointer.x > 624) return;
        this.fScroll = Phaser.Math.Clamp(this.fScroll + direction * steps, 0, Math.max(0, (this.furnitureMenuDefs || []).length - this.fVisibleRows));
        this.updateFurnitureMenu();
      } else if (this.bOpen) {
        if (pointer.y < 174 || pointer.y > 546 || pointer.x < 140 || pointer.x > 624) return;
        this.bScroll = Phaser.Math.Clamp(this.bScroll + direction * steps, 0, Math.max(0, this.backgroundMenuDefs.length - this.bVisibleRows));
        this.updateBackgroundMenu();
      }
    });


  },
  initializeFurnitureEditingInput() {
this.input.on('pointerdown', p => {
  if (!this.editMode || p.y >= 640) return;
  // Controls sit over the room; don't accidentally pick furniture underneath them.
  if ((this.editExitButton && this.editExitButton.visible && this.editExitButton.getBounds().contains(p.x, p.y)) ||
      (this.deleteDropZoneBg && this.deleteDropZoneBg.visible && this.isOverFurnitureDeleteZone(p.x, p.y))) return;
  // Hit-test with the same authoritative depth map used for rendering. Do
  // not infer order from sprite.depth here: Phaser may not have completed the
  // next render sort yet after a rapid sequence of pointer events.
  const hitDepthByItem = this.getFurnitureDepthMap();
  const hitOrder = GAME_ATTRIBUTES.furn.map((item, index) => ({
    index,
    depth: hitDepthByItem.get(item) ?? (this.furnitureSprites[index] && this.furnitureSprites[index].active ? this.furnitureSprites[index].depth : -Infinity)
  })).sort((a, b) => b.depth - a.depth || b.index - a.index);
  for (const hitItem of hitOrder) {
    const i = hitItem.index;
    const q = GAME_ATTRIBUTES.furn[i];
    const sprite = this.furnitureSprites[i];
    let hit = false;
    if (sprite && sprite.active && sprite.visible) {
      const bounds = sprite.getBounds();
      hit = bounds.contains(p.x, p.y);
    } else {
      hit = Math.abs(p.x - q.x) < 50 && p.y > q.y - 90 && p.y < q.y + 8;
    }
    if (!hit) continue;
    // Most recently clicked item becomes the frontmost furniture. Preserve
    // the former selection immediately behind it, regardless of Y/index.
    this.prioritizeFurnitureSelection(q);
    this.editIdx = i;
    const now = this.time.now;
    const isDoubleClick = this.lastFurnitureClick && this.lastFurnitureClick.index === i &&
      now - this.lastFurnitureClick.time <= 350;
    if (isDoubleClick) {
      q.flipX = !q.flipX;
      this.lastFurnitureClick = null;
      this.drag = null;
      save();
      return;
    }
    this.lastFurnitureClick = { index: i, time: now };
    this.drag = { dx: q.x - p.x, dy: q.y - p.y, startX: p.x, startY: p.y, moved: false };
    return;
  }
  this.lastFurnitureClick = null;
});
// A placed chalkboard opens its guestbook in normal room mode. It remains
// draggable like other furniture only while the furniture editor is active.
this.input.on('pointerdown', pointer => {
  if (this.gymActive || this.gymClosing || this.editMode || this.isUnifiedMenuBlockingHomeInput() || this.visitingHouse || this.friendHouseTransition) return;
  const boardIndex = (GAME_ATTRIBUTES.furn || []).findIndex(object => object && this.getFurnitureDefinitionForObject(object)?.boardFlag === true);
  if (boardIndex < 0) return;
  const sprite = this.furnitureSprites && this.furnitureSprites[boardIndex];
  const boardObject = GAME_ATTRIBUTES.furn[boardIndex];
  const boardDefinition = this.getFurnitureDefinitionForObject(boardObject);
  if (boardDefinition && boardDefinition.boardFlag && sprite && sprite.active && sprite.getBounds().contains(pointer.x, pointer.y)) {
    if (pointer.event && pointer.event.stopPropagation) pointer.event.stopPropagation();
    this.openMessageBoardUi(false);
  }
});
this.input.on('pointermove', p => {
  if (this.gymActive || this.gymClosing) return;
  const q = this.drag && p.isDown && this.editMode ? GAME_ATTRIBUTES.furn[this.editIdx] : null;
  if (q) {
    if (!this.drag.moved && Math.hypot(p.x - this.drag.startX, p.y - this.drag.startY) > 5) {
      this.drag.moved = true;
      this.lastFurnitureClick = null;
    }
    const candidateX = Phaser.Math.Clamp(p.x + this.drag.dx, 50, 590);
    const candidateY = Phaser.Math.Clamp(p.y + this.drag.dy, 100, HOME_FURNITURE_MAX_Y);
    // Keep BOTH placement restrictions active: the polygon exclusion zone
    // (tested against the furniture bottom-center point) and the independent
    // y < 630 hard limit. Blocked polygon targets project to the nearest
    // edge, including diagonal sliding along sloped boundaries.
    const furnitureSprite = this.furnitureSprites && this.furnitureSprites[this.editIdx];
    const currentBounds = furnitureSprite && furnitureSprite.active
      ? furnitureSprite.getBounds()
      : null;
    const bottomCenterOffset = currentBounds
      ? {
          x: currentBounds.x + currentBounds.width / 2 - q.x,
          y: currentBounds.y + currentBounds.height - q.y
        }
      : { x: 0, y: 0 };
    const resolvedPosition = slideFurnitureCenterOutsideHomeWalkableArea(
      candidateX + bottomCenterOffset.x,
      candidateY + bottomCenterOffset.y,
      HOME_FURNITURE_MAX_Y + bottomCenterOffset.y
    );
    q.x = resolvedPosition.x - bottomCenterOffset.x;
    // Final independent hard limit on the furniture anchor (y must be < 630).
    q.y = Math.min(HOME_FURNITURE_MAX_Y, Math.max(100, resolvedPosition.y - bottomCenterOffset.y));
  }
  this.syncFurnitureDeleteZone(p.x, p.y);
});
this.input.on('pointerup', p => {
  const wasDragged = !!(this.drag && this.drag.moved);
  if (this.editMode && wasDragged && this.isOverFurnitureDeleteZone(p.x, p.y)) {
    this.deleteEditedFurniture();
  }
  this.drag = null;
  this.syncFurnitureDeleteZone(p.x, p.y);
});
  },
});
