// Furniture, food, and character atlas loading and texture-lifecycle helpers.
// Loaded after game.js and mixed into Main.prototype to preserve scene context.
Object.assign(Main.prototype, {
  releaseInactiveCharacterAtlases(activeKey) {
    if (!this.characterAtlasManagedKeys) return;
    const keep = String(activeKey || '');
    this.characterAtlasManagedKeys.forEach(key => {
      if (key === keep) return;
      // Keep atlases referenced by any live sprite, including a visitor's host
      // MEGU or a friend currently sharing the local room.
      this.removeTextureIfUnused(key);
    });
  },

  queueFurnitureAnimation(item, startLoading = true) {
    if (!item || !item.animation || !item.animation.list || !item.animation.list.length) return;
    const atlasKey = item.animationAtlasKey || `furniture-animation-atlas-${item.id}`;
    const animKey = item.animationKey || `furniture-animation-${item.id}`;
    if (!this.furnitureAnimationLoadKeys) this.furnitureAnimationLoadKeys = new Set();
    if (!this.furnitureAnimationPendingKeys) this.furnitureAnimationPendingKeys = new Set();
    if (this.textures.exists(atlasKey)) {
      this.createFurnitureAnimation(item);
      return;
    }
    if (this.furnitureAnimationLoadKeys.has(atlasKey)) return;
    this.furnitureAnimationLoadKeys.add(atlasKey);
    this.furnitureAnimationPendingKeys.add(atlasKey);
    const cleanup = () => {
      this.furnitureAnimationPendingKeys.delete(atlasKey);
      this.load.off('loaderror', onError);
    };
    const onComplete = () => {
      cleanup();
      this.createFurnitureAnimation(item);
    };
    const onError = file => {
      if (!file || (file.key !== atlasKey && file.key !== `${atlasKey}-json` && file.key !== `${atlasKey}-image`)) return;
      cleanup();
      // Keep this failed atlas marked as attempted for the session. The room
      // renderer independently loads the static PNG fallback, avoiding a
      // network retry on every render frame.
    };
    this.load.once(`filecomplete-atlas-${atlasKey}`, onComplete);
    this.load.on('loaderror', onError);
    this.load.atlas(atlasKey, item.animationImagePath || `assets/furniture/KG${item.id}@2x.png`, item.animationJsonPath || `assets/furniture/KG${item.id}@2x.json`);
    if (startLoading && !(this.load.isLoading && this.load.isLoading())) this.load.start();
  },

  createFurnitureAnimation(item) {
    if (!item || !item.animation || !this.textures.exists(item.animationAtlasKey)) return false;
    const atlasKey = item.animationAtlasKey;
    const animKey = item.animationKey;
    const texture = this.textures.get(atlasKey);
    const available = texture.getFrameNames(false);
    // Animation metadata can contain either exact atlas frame names or numeric
    // zero-based positions in the atlas frame list. Do not fuzzy-match numbers
    // against frame names: e.g. token "2" must not accidentally match frame 12.
    const resolveFrame = token => {
      const value = String(token).trim();
      if (!value) return null;
      if (texture.has(value)) return value;
      if (/^\d+$/.test(value)) {
        const index = Number(value);
        return Number.isSafeInteger(index) && index >= 0 && index < available.length
          ? available[index]
          : null;
      }
      return null;
    };
    // Preserve the metadata order exactly. A partial animation is more harmful
    // than a static fallback because it silently skips poses in the sequence.
    const frames = item.animation.list.map(resolveFrame);
    if (!frames.length || frames.some(frame => !frame)) {
      console.warn(`Furniture animation ${item.id} has unresolved frame tokens`, item.animation.list);
      return false;
    }
    // This method is called during room rendering. Recreating an existing Phaser
    // animation every render pass interrupts its timeline and can make animated
    // furniture appear frozen, flicker, or jump back to its first frame.
    if (this.anims.exists(animKey)) return true;
    this.anims.create({
      key: animKey,
      frames: frames.map(frame => ({ key: atlasKey, frame })),
      // Twice the original 4 / duration playback rate.
      frameRate: 8 / Math.max(0.01, Number(item.animation.duration) || 1),
      repeat: -1
    });
    return true;
  },

  queueFurnitureImage(item, startLoading = true) {
    // Full-resolution individual PNGs are loaded only for objects present in the
    // room. Thumbnail atlases never serve as in-room textures.
    if (!item || !item.assetKey || !item.assetPath) return;
    if (!this.furnitureImageLoadKeys) this.furnitureImageLoadKeys = new Set();
    if (!this.furnitureImagePendingKeys) this.furnitureImagePendingKeys = new Set();
    if (this.textures.exists(item.assetKey)) {
      this.furnitureImageLoadKeys.add(item.assetKey);
      return;
    }
    if (this.furnitureImageLoadKeys.has(item.assetKey)) return;
    const key = item.assetKey;
    this.furnitureImageLoadKeys.add(key);
    this.furnitureImagePendingKeys.add(key);
    const onComplete = () => {
      this.furnitureImagePendingKeys.delete(key);
      this.load.off('loaderror', onError);
      // If the object was removed before its network request finished, don't keep
      // the resulting full-size texture in memory.
      if (!this.isFurnitureImageUsed(key)) {
        this.removeTextureIfUnused(key);
        this.furnitureImageLoadKeys.delete(key);
      }
    };
    const onError = file => {
      if (file && file.key === key) {
        this.furnitureImagePendingKeys.delete(key);
        this.load.off(`filecomplete-image-${key}`, onComplete);
        this.load.off('loaderror', onError);
        // Retain the key for this session to avoid retrying a missing asset every frame.
      }
    };
    this.load.once(`filecomplete-image-${key}`, onComplete);
    this.load.on('loaderror', onError);
    this.load.image(key, item.assetPath);
    // Initial room images are queued before the first dynamic load.start(); new
    // selections start the queue immediately after the menu closes.
    if (startLoading && !(this.load.isLoading && this.load.isLoading())) this.load.start();
  },

  isFurnitureImageUsed(assetKey) {
    const rewardState = this.levelUpRewardState;
    const activeReward = rewardState && rewardState.queue && rewardState.queue[rewardState.index];
    if (activeReward && activeReward.type === 'furniture' && activeReward.item && activeReward.item.assetKey === assetKey) return true;
    return (Array.isArray(GAME_ATTRIBUTES.furn) ? GAME_ATTRIBUTES.furn : []).some(object => {
      if (!object || object.kind === 'food') return false;
      const item = this.getFurnitureDefinitionForObject(object);
      return !!item && item.assetKey === assetKey;
    });
  },

  releaseUnusedFurnitureImages() {
    if (!this.furnitureImageLoadKeys) return;
    Array.from(this.furnitureImageLoadKeys).forEach(key => {
      if (this.isFurnitureImageUsed(key)) return;
      if (this.furnitureImagePendingKeys && this.furnitureImagePendingKeys.has(key)) return;
      this.removeTextureIfUnused(key);
      this.furnitureImageLoadKeys.delete(key);
    });
  },

  findTransientAtlasConfig(key) {
    return ART.furnitureThumbnailAtlases.concat(ART.foodAtlases).find(atlas => atlas.key === key) || null;
  },

  loadTransientAtlas(atlas) {
    if (!atlas) return Promise.resolve(false);
    if (this.textures.exists(atlas.key)) return Promise.resolve(true);
    if (this.transientAtlasLoadPromises.has(atlas.key)) return this.transientAtlasLoadPromises.get(atlas.key);

    let resolvePromise;
    let settled = false;
    const promise = new Promise(resolve => { resolvePromise = resolve; });
    this.transientAtlasLoadPromises.set(atlas.key, promise);
    if (!this.transientAtlasLoadingKeys) this.transientAtlasLoadingKeys = new Set();
    this.transientAtlasLoadingKeys.add(atlas.key);
    const finish = loaded => {
      if (settled) return;
      settled = true;
      this.transientAtlasLoadingKeys.delete(atlas.key);
      this.load.off('filecomplete', onFileComplete);
      this.load.off(`filecomplete-atlas-${atlas.key}`, onAtlasComplete);
      this.load.off(`filecomplete-atlasjson-${atlas.key}`, onAtlasComplete);
      this.load.off('loaderror', onLoadError);
      this.load.off('complete', onLoaderComplete);
      if (!loaded) this.transientAtlasLoadPromises.delete(atlas.key);
      resolvePromise(!!loaded);
    };
    const onAtlasComplete = () => finish(this.textures.exists(atlas.key));
    const onFileComplete = (fileKey) => {
      if (fileKey === atlas.key && this.textures.exists(atlas.key)) finish(true);
    };
    const onLoaderComplete = () => finish(this.textures.exists(atlas.key));
    const onLoadError = file => {
      const failedKey = String(file && (file.key || file.textureKey) || '');
      const failedUrl = String(file && (file.url || file.src) || '');
      if (failedKey === atlas.key || failedKey.startsWith(atlas.key + '-') ||
          failedUrl === atlas.image || failedUrl === atlas.json) finish(false);
    };
    // Phaser versions differ in whether atlas completion is emitted as `atlas`
    // or `atlasjson`; generic filecomplete plus these aliases keeps loading robust.
    this.load.on('filecomplete', onFileComplete);
    this.load.once(`filecomplete-atlas-${atlas.key}`, onAtlasComplete);
    this.load.once(`filecomplete-atlasjson-${atlas.key}`, onAtlasComplete);
    this.load.once('complete', onLoaderComplete);
    this.load.on('loaderror', onLoadError);
    this.load.atlas(atlas.key, atlas.image, atlas.json);
    if (!(this.load.isLoading && this.load.isLoading())) this.load.start();
    return promise;
  },

  requestMenuAtlases(menuKind, visibleItems, additionalKeys = []) {
    const isFurniture = menuKind === 'furniture';
    const isOpen = () => isFurniture ? this.fOpen : this.foodOpen;
    const pending = isFurniture ? this.furnitureAtlasPendingKeys : this.foodAtlasPendingKeys;
    const failed = isFurniture ? this.furnitureAtlasFailedThisOpen : this.foodAtlasFailedThisOpen;
    const keys = new Set(additionalKeys || []);
    (visibleItems || []).forEach(item => {
      const key = item && (isFurniture ? item.thumbnailKey : item.key);
      if (key) keys.add(key);
    });
    keys.forEach(key => {
      if (this.textures.exists(key) || pending.has(key) || failed.has(key)) return;
      const config = this.findTransientAtlasConfig(key);
      if (!config) return;
      pending.add(key);
      this.loadTransientAtlas(config).then(loaded => {
        pending.delete(key);
        if (!loaded) failed.add(key);
        if (isOpen()) {
          if (isFurniture) this.updateFurnitureMenu();
          else this.updateFoodMenu();
        } else if (isFurniture) {
          this.releaseAtlasTexture(key);
        } else {
          this.releaseUnusedFoodAtlases();
        }
      });
    });
  },

  isTextureUsedByActiveObjects(textureKey) {
    if (!textureKey || !this.children || !Array.isArray(this.children.list)) return false;
    const pending = [...this.children.list];
    const seen = new Set();
    while (pending.length) {
      const object = pending.pop();
      if (!object || seen.has(object)) continue;
      seen.add(object);
      // Phaser still renders visible GameObjects when active=false; that flag
      // only controls update processing. Treat every visible reference as live.
      if (object.visible !== false && object.texture && object.texture.key === textureKey) return true;
      // Phaser Containers can hold live sprites that are not direct display-list
      // children. Inspect nested children too before allowing a texture eviction.
      if (typeof object.getChildren === 'function') {
        const nested = object.getChildren();
        if (Array.isArray(nested)) pending.push(...nested);
      }
    }
    return false;
  },

  removeTextureIfUnused(textureKey) {
    if (!textureKey || !this.textures.exists(textureKey)) return false;
    if (this.isTextureUsedByActiveObjects(textureKey)) return false;
    this.textures.remove(textureKey);
    if (this.cache && this.cache.json && this.cache.json.exists(textureKey)) this.cache.json.remove(textureKey);
    return true;
  },

  releaseAtlasTexture(key) {
    if (!key) return;
    // Atlas textures may be shared by room props, visitor-house props, menu
    // previews, and active character sprites. Never evict one still being drawn.
    this.removeTextureIfUnused(key);
    // Do not forget an in-flight request: otherwise reopening a menu can queue
    // the same atlas key a second time before Phaser finishes the first request.
    if (!this.transientAtlasLoadingKeys || !this.transientAtlasLoadingKeys.has(key)) {
      this.transientAtlasLoadPromises.delete(key);
    }
  },

  releaseUnneededFurnitureAtlases(requiredKeys) {
    const needed = requiredKeys || new Set();
    ART.furnitureThumbnailAtlases.forEach(atlas => {
      if (!needed.has(atlas.key)) this.releaseAtlasTexture(atlas.key);
    });
  },

  getFoodAtlasesRequiredOutsideMenu() {
    const required = new Set();
    const addFoodProps = objects => {
      (Array.isArray(objects) ? objects : []).forEach(object => {
        if (object && object.kind === 'food') required.add(String(object.key || 'food-atlas-0'));
      });
    };
    // Food props in the local home remain live while visiting another house.
    addFoodProps(GAME_ATTRIBUTES.furn);
    // The visitor room has its own live food sprites. Keep their atlases loaded
    // when the food gift picker closes or refreshes its visible inventory.
    addFoodProps(this.visitingHouse && this.visitingHouse.house && this.visitingHouse.house.furn);
    if (this.foodSequenceActive && this.foodSequenceStage !== 'eating' && this.foodSequenceItem && this.foodSequenceItem.key) {
      required.add(String(this.foodSequenceItem.key));
    }
    if (this.foodProjectile && this.foodProjectile.active && this.foodSequenceItem && this.foodSequenceItem.key) {
      required.add(String(this.foodSequenceItem.key));
    }
    return required;
  },

  releaseUnneededFoodAtlases(menuRequiredKeys) {
    const needed = new Set(menuRequiredKeys || []);
    this.getFoodAtlasesRequiredOutsideMenu().forEach(key => needed.add(key));
    ART.foodAtlases.forEach(atlas => {
      if (!needed.has(atlas.key)) this.releaseAtlasTexture(atlas.key);
    });
  },

  releaseUnusedFoodAtlases() {
    this.releaseUnneededFoodAtlases(new Set());
  }
,
  // Ownership moved from the furniture inventory module.
    checkInitialRoomAssets(attempt = 0) {
      const missing = [];
      const addMissing = (type, data) => missing.push({ type, ...data });
  
      const bg = BG.find(item => item && item.key === this.activeBackgroundKey) || BG[GAME_ATTRIBUTES.bg] || BG[0];
      if (bg && !this.textures.exists(bg.key)) addMissing('background', { item: bg });
  
      const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
      // The startup validator must inspect the same atlas variant that the active
      // pet loader requests. A shiny save uses IDX{id}, not the logical ID{id}.
      const characterKey = activeDef
        ? meguTextureKey(activeDef.id, GAME_ATTRIBUTES.shiny === true)
        : '';
      const characterTextureReady = !!(characterKey && this.textures.exists(characterKey) && (() => {
        const texture = this.textures.get(characterKey);
        return [characterKey + '_5-2x', characterKey + '_6-2x', characterKey + '_3-2x', characterKey + '_4-2x']
          .some(frame => texture.has(frame));
      })());
      if (activeDef && !characterTextureReady) addMissing('character', { item: activeDef, key: characterKey });
  
      const foodAtlasByKey = new Map(ART.foodAtlases.map(atlas => [atlas.key, atlas]));
      (Array.isArray(GAME_ATTRIBUTES.furn) ? GAME_ATTRIBUTES.furn : []).forEach(object => {
        if (!object) return;
        if (object.kind === 'food') {
          const key = String(object.key || 'food-atlas-0');
          const atlas = foodAtlasByKey.get(key);
          const ready = !!(atlas && this.textures.exists(key) && object.frame && this.textures.get(key).has(object.frame));
          if (atlas && !ready) addMissing('food', { atlas, key });
          else if (!atlas) {
            console.warn('[MEGU] Saved food prop references an unknown atlas:', key, object.frame);
            addMissing('unresolved-food', { object, key });
          }
          return;
        }
        const item = this.getFurnitureDefinitionForObject(object);
        if (!item) {
          console.warn('[MEGU] Could not resolve saved furniture during startup asset check:', object);
          addMissing('unresolved-furniture', { object });
          return;
        }
        if (item.animation) {
          const animatedReady = this.textures.exists(item.animationAtlasKey) && this.anims.exists(item.animationKey);
          // An animated item is room-ready when either its atlas/animation works
          // or its standalone PNG fallback is available. If the atlas is missing,
          // malformed, or has unresolved frame names, the static image is enough
          // to let the room render without blocking startup forever.
          const staticFallbackReady = this.textures.exists(item.assetKey);
          if (!animatedReady && !staticFallbackReady) {
            addMissing('furniture-image', { item });
          }
        } else if (!this.textures.exists(item.assetKey)) {
          addMissing('furniture-image', { item });
        }
      });
  
      if (!missing.length) {
        this._initialSplashLoadComplete = true;
        const status = document.getElementById('initial-splash-status');
        if (status) status.hidden = true;
        console.info('[MEGU] Initial room asset check passed.');
        this.tryDismissInitialSplash();
        return;
      }
  
      console.warn(`[MEGU] Initial room asset check found ${missing.length} missing or incomplete asset(s).`,
        missing.map(entry => entry.item ? (entry.item.id || entry.item.key || entry.item.name) : entry.key));
      const status = document.getElementById('initial-splash-status');
      if (status) {
        status.hidden = false;
        status.textContent = attempt < 4
          ? `Checking game assets… retry ${attempt + 1}/4`
          : 'Unable to load required game assets. Check your connection and refresh the page.';
      }
      if (attempt >= 4) {
        // Keep the splash in place rather than showing a room with placeholder
        // textures or silently substituted furniture.
        return;
      }
  
      missing.forEach(entry => {
        if (entry.type === 'background') {
          this.load.image(entry.item.key, entry.item.path);
        } else if (entry.type === 'character') {
          if (this.textures.exists(entry.key)) this.textures.remove(entry.key);
          this.characterAtlasQueuedKeys.delete(entry.key);
          this.requestCharacterAtlas(entry.item, false);
        } else if (entry.type === 'furniture-image') {
          this.furnitureImageLoadKeys.delete(entry.item.assetKey);
          this.furnitureImagePendingKeys.delete(entry.item.assetKey);
          this.queueFurnitureImage(entry.item, false);
        } else if (entry.type === 'food') {
          if (this.textures.exists(entry.key)) this.textures.remove(entry.key);
          if (this.cache.json.exists(entry.key)) this.cache.json.remove(entry.key);
          this.load.atlas(entry.key, entry.atlas.image, entry.atlas.json);
        }
      });
  
      this.load.once('complete', () => this.checkInitialRoomAssets(attempt + 1));
      if (!(this.load.isLoading && this.load.isLoading())) this.load.start();
    },
    requestCharacterAtlas(def, startLoading = true) {
      if (!def) return;
      const logicalId = String(def.id || '').trim();
      const key = String(def.textureKey || (logicalId.toUpperCase() === String(GAME_ATTRIBUTES.petId || '').toUpperCase() && GAME_ATTRIBUTES.shiny === true ? meguTextureKey(logicalId, true) : logicalId));
      if (!key) return;
      const assetPaths = def.textureKey ? { image: def.image, json: def.json } : meguAssetPaths(logicalId, key.startsWith('IDX'));
      if (!this.characterAtlasQueuedKeys) this.characterAtlasQueuedKeys = new Set();
      if (!this.characterAtlasManagedKeys) this.characterAtlasManagedKeys = new Set();
      this.characterAtlasManagedKeys.add(key);
      if (this.textures.exists(key)) {
        if (this.activateCharacterAtlas(def)) this.releaseInactiveCharacterAtlases(key);
        return;
      }
      if (!this.characterAtlasQueuedKeys.has(key)) {
        this.characterAtlasQueuedKeys.add(key);
        this.load.atlas(key, assetPaths.image || `assets/megu/${key}.png`, assetPaths.json || `assets/megu/${key}.json`);
      }
      if (startLoading && !(this.load.isLoading && this.load.isLoading())) this.load.start();
    },
    onCharacterAssetsLoaded() {
      if (this.characterAtlasQueuedKeys) this.characterAtlasQueuedKeys.clear();
      const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
      const activeKey = activeDef ? meguTextureKey(activeDef.id, GAME_ATTRIBUTES.shiny === true) : '';
      if (activeDef && this.textures.exists(activeKey)) {
        if (this.activateCharacterAtlas(activeDef)) this.releaseInactiveCharacterAtlases(activeKey);
      } else if (this.pendingCharacterBgmResume) {
        // A missing/corrupt atlas should not strand the game with its BGM stopped.
        this.pendingCharacterBgmResume = false;
        this.resumeBgmAfterCharacterMenu();
      }
    },
    activateCharacterAtlas(def) {
      if (!def) return false;
      const logicalId = String(def.id || '').trim();
      const key = String(def.textureKey || meguTextureKey(logicalId, logicalId.toUpperCase() === String(GAME_ATTRIBUTES.petId || '').toUpperCase() && GAME_ATTRIBUTES.shiny === true));
      if (!key || !this.textures.exists(key)) return false;
      const texture = this.textures.get(key);
      const hasUsableFrame = [key + '_5-2x', key + '_6-2x', key + '_3-2x', key + '_4-2x']
        .some(frame => texture.has(frame));
      if (!hasUsableFrame) return false;
  
      const x = this.pet ? this.pet.x : W / 2;
      const y = this.pet ? this.pet.y : 510;
      // MeguRenderer owns creation and lifecycle of the body, eye overlays,
      // blink layer, and ground shadow. Keep the legacy sprite aliases below
      // only for existing accessory, hit-test, and capture integrations.
      if (this.meguRenderer) {
        if (!this.meguRenderer.setAtlas(key)) return false;
        this.meguRenderer.setPosition(x, y);
      } else {
        this.meguRenderer = new MeguRenderer(this, {
          atlasKey: key, x, y, autoUpdate: false,
          state: MeguRenderer.STATES.STANDING_1,
          originX: 0.5, originY: 1, depth: 4.15
        });
      }
      this.characterSprite = this.meguRenderer.sprite;
      this.characterOverlay = this.meguRenderer.overlay;
      this.characterBlink = this.meguRenderer.blink;
      this.syncMeguMenuVisibility();
      this.activeCharacterTextureKey = key;
      if (this.pendingCharacterBgmResume && !this.menuOpen) {
        this.pendingCharacterBgmResume = false;
        this.resumeBgmAfterCharacterMenu();
      }
      return true;
    }
});
