// Main-scene catalog and description-data initialization.
// Loaded as a classic-script mixin after game.js and before boot.js.
Object.assign(Main.prototype, {
  initializeCatalogData() {
    // The MEGU roster and metadata come exclusively from megu_description.json.
    // Character asset filenames are derived from each numeric description ID.
    const meguDescriptionData = this.cache.json.get('megu-description') || {};
    const meguDescriptionRoot = meguDescriptionData.application || meguDescriptionData;
    const meguRosterRows = Array.isArray(meguDescriptionRoot.megu) ? meguDescriptionRoot.megu : [];
    this.characterDefs = meguRosterRows.filter(row => row && row.id != null).map(row => {
      const rawId = String(row.id).trim();
      const digits = rawId.match(/\d+/);
      if (!digits) return null;
      const id = `ID${Number(digits[0])}`;
      const localized = this.getLocalizedString(Array.isArray(row.strings) ? row.strings : []);
      return {
        ...row,
        id,
        name: String(localized.name || id),
        detail: String(localized.detail || ''),
        image: `assets/megu/${id}.png`,
        json: `assets/megu/${id}.json`
      };
    }).filter(Boolean);
    // Keep the roster in numeric ID order; entries absent from the description
    // file are intentionally not synthesized or sourced from a second catalog.
    const charIdNumber = id => {
      const match = String(id || '').match(/^ID0*(\d+)$/i);
      return match ? Number(match[1]) : null;
    };
    // Thumbnail image atlases are intentionally not loaded at startup. Their
    // frame map is populated on demand when the character picker opens.
    this.characterThumbnailById = new Map();
    this.characterDefs.sort((a, b) => {
      const an = charIdNumber(a.id), bn = charIdNumber(b.id);
      if (an !== null && bn !== null) return an - bn;
      if (an !== null) return -1;
      if (bn !== null) return 1;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
    const furnitureDescription = this.cache.json.get('furniture-description');
    const furnitureRows = furnitureDescription && furnitureDescription.application && Array.isArray(furnitureDescription.application.furniture) ? furnitureDescription.application.furniture : [];
    this.furnitureDescriptionRows = furnitureRows;
    const specialStoreDescription = this.cache.json.get('special-store-description') || {};
    const specialStoreRows = specialStoreDescription.application && Array.isArray(specialStoreDescription.application.special_store)
      ? specialStoreDescription.application.special_store : [];
    this.specialStoreDefs = specialStoreRows.filter(row => row && row.id != null && row.item_name && String(row.item_name) !== 'yarukiminA').map(row => {
      const localized = this.getLocalizedString(Array.isArray(row.strings) ? row.strings : []);
      const id = String(row.id).trim();
      return { id, itemName: String(row.item_name), name: localized.name || `Special item ${id}`, detail: localized.detail || '', price: Math.max(0, Math.trunc(Number(row.price) || 0)), iconKey: `special-store-icon-${id}`, iconPath: `assets/special_store/ID${id}@2x.png` };
    }).sort((a, b) => Number(a.id) - Number(b.id));
    this.specialStoreIconPending = new Set();
    const accessoryDescription = this.cache.json.get('accessory-description') || {};
    const accessoryRows = accessoryDescription.application && Array.isArray(accessoryDescription.application.accessory)
      ? accessoryDescription.application.accessory : [];
    this.accessoryDescriptionRows = accessoryRows;
    this.accessoryDefs = accessoryRows.filter(row => row && row.id != null).map(row => {
      const localized = this.getLocalizedString(Array.isArray(row.strings) ? row.strings : []);
      const id = String(row.id).trim();
      return { id, name: localized.name || `Accessory ${id}`, detail: localized.detail || '', level: Math.max(0, Number(row.level) || 0), price: Math.max(0, Number(row.price) || 0), not_sale: row.not_sale };
    }).sort((a, b) => Number(a.id) - Number(b.id));
    this.accessoryDefsById = new Map(this.accessoryDefs.map(item => [String(item.id), item]));
    const jukeboxData = this.cache.json.get('jukebox-data');
    this.jukeboxTracks = Array.isArray(jukeboxData && jukeboxData.application && jukeboxData.application.BGM)
      ? jukeboxData.application.BGM.filter(track => track && track.id != null && track.file)
      : [];
    this.furnitureNamesById = new Map();
    this.furnitureDetailsById = new Map();
    this.furnitureRecordsById = new Map();
    furnitureRows.forEach(item => {
      if (!item || item.id == null) return;
      const id = String(item.id).trim().toLowerCase();
      const strings = Array.isArray(item.strings) ? item.strings : [];
      const en = this.getLocalizedString(strings);
      const animation = item.animation && typeof item.animation === 'object' ? {
        list: String(item.animation.list || '').split(',').map(value => value.trim()).filter(Boolean),
        duration: Math.max(0.01, Number(item.animation.duration) || 1)
      } : null;
      const jukeboxFlag = item.jukebox_flag === true || ['1', 'true', 'yes'].includes(String(item.jukebox_flag || '').trim().toLowerCase());
      const boardFlag = item.board_flag === true || ['1', 'true', 'yes'].includes(String(item.board_flag || '').trim().toLowerCase());
      const record = { id, name: en.name || `KG${id}-2x`, detail: en.detail || '', animation, jukeboxFlag, boardFlag, price: Math.max(0, Number(item.price) || 0), level: Math.max(0, Number(item.level) || 0), not_sale: item.not_sale }; 
      this.furnitureRecordsById.set(id, record);
      if (en.name) this.furnitureNamesById.set(id, en.name);
      if (en.detail) this.furnitureDetailsById.set(id, en.detail);
    });
    // Build furniture definitions from atlas JSON only. The actual thumbnail
    // PNGs are fetched when their rows become visible in the Furniture menu.
    this.furnitureDefs = [];
    const seenFurnitureIds = new Set();
    ART.furnitureThumbnailAtlases.forEach(atlas => {
      const atlasData = this.cache.json.get(`${atlas.key}-data`) || this.cache.json.get(atlas.key);
      atlasFrameEntries(atlasData).forEach(([frameName, frameData]) => {
        if (!frameName || frameName === '__BASE') return;
        const rawStem = String(frameName).replace(/\.(png|jpe?g|webp)$/i, '');
        const assetStem = rawStem.replace(/(?:-2x|@2x)$/i, '');
        const match = assetStem.match(/^KG0*(\d+)$/i);
        if (!match) return;
        const id = String(Number(match[1]));
        if (seenFurnitureIds.has(id)) return;
        seenFurnitureIds.add(id);
        const dimensions = atlasFrameDimensions(frameData);
        const record = this.furnitureRecordsById.get(id) || {};
        const canonicalStem = `KG${id}`;
        const safeStem = canonicalStem.replace(/[^a-z0-9_-]/gi, '-');
        this.furnitureDefs.push({
          id,
          frameName: canonicalStem,
          assetStem: canonicalStem,
          assetKey: `furniture-image-${safeStem}`,
          assetPath: `assets/furniture/${canonicalStem}@2x.png`,
          thumbnailKey: atlas.key,
          thumbnailFrame: frameName,
          width: dimensions.width,
          height: dimensions.height,
          name: record.name || canonicalStem,
          detail: record.detail || '',
          jukeboxFlag: !!record.jukeboxFlag,
          boardFlag: !!record.boardFlag,
          price: Number(record.price) || 0, level: Number(record.level) || 0, not_sale: record.not_sale,
          animation: record.animation || null,
          animationAtlasKey: `furniture-animation-atlas-${id}`,
          animationKey: `furniture-animation-${id}`,
          animationJsonPath: `assets/furniture/KG${id}@2x.json`,
          animationImagePath: `assets/furniture/KG${id}@2x.png`
        });
      });
    });
    // Metadata is only needed to build the definitions; don't keep duplicate JSON
    // objects in the cache after initialization.
    ART.furnitureThumbnailAtlases.forEach(atlas => {
      if (this.cache.json.exists(`${atlas.key}-data`)) this.cache.json.remove(`${atlas.key}-data`);
      if (this.cache.json.exists(atlas.key)) this.cache.json.remove(atlas.key);
    });
    // Register flagged message boards even when absent from a thumbnail atlas.
    // The furniture ID comes from metadata, never from a hardcoded board ID.
    for (const record of this.furnitureRecordsById.values()) {
      if (!record.boardFlag || this.furnitureDefs.some(def => def.id === record.id)) continue;
      const definition = this.makeFurnitureDefinition(`KG${record.id}`, record.id, 152, 116);
      definition.name = record.name || definition.name;
      definition.detail = record.detail || definition.detail;
      definition.price = record.price;
      definition.level = record.level;
      definition.not_sale = record.not_sale;
      this.furnitureDefs.push(definition);
    }
    this.furnitureDefs.sort((a, b) => {
      const an = Number(a.id), bn = Number(b.id);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
    this.furnitureDefs.forEach((item, index) => { item.furnIndex = index; });
    this.furnitureDefsById = new Map(this.furnitureDefs.map(item => [String(item.id), item]));
    this.furnitureDefsByStem = new Map(this.furnitureDefs.map(item => [String(item.assetStem).toLowerCase(), item]));
    this.furnitureImageLoadKeys = new Set();
    this.furnitureImagePendingKeys = new Set();
    this.transientAtlasLoadPromises = new Map();
    // Keep in-flight atlas requests registered until they settle. A menu closing
    // during a request must not allow a second request for the same texture key.
    this.transientAtlasLoadingKeys = new Set();
    this.furnitureAtlasPendingKeys = new Set();
    this.foodAtlasPendingKeys = new Set();
    this.furnitureAtlasFailedThisOpen = new Set();
    this.foodAtlasFailedThisOpen = new Set();
    this.furnitureThumbnailInMenu = false;
    // Restore previously placed furniture using on-demand full-resolution image loading.
    // Legacy saves used a zero-based array index (KG1 was index 0); the resolver below
    // maps those records to the corresponding KG{id} filename.
    GAME_ATTRIBUTES.furn.forEach(object => {
      if (!object || object.kind === 'food') return;
      const item = this.getFurnitureDefinitionForObject(object);
      if (item) {
        if (item.animation) this.queueFurnitureAnimation(item, false);
        else this.queueFurnitureImage(item, false);
      }
    });
    // Localized display names for background and character pickers.
    const descriptionRows = (data, candidateKeys) => {
      if (!data) return [];
      const root = data.application || data;
      for (const key of candidateKeys) if (Array.isArray(root[key])) return root[key];
      // Some exports wrap collections one level deeper.
      for (const value of Object.values(root)) if (value && typeof value === 'object') {
        for (const key of candidateKeys) if (Array.isArray(value[key])) return value[key];
      }
      return [];
    };
    const localizedNameMap = rows => {
      const map = new Map();
      rows.forEach(item => {
        const en = item && Array.isArray(item.strings) ? this.getLocalizedString(item.strings) : null;
        if (item && item.id != null && en && en.name) {
          const id = String(item.id).trim();
          map.set(id.toLowerCase(), en.name);
          map.set(id.replace(/^0+/, '').toLowerCase(), en.name);
          map.set(id.replace(/\.(png|jpg|jpeg|webp)$/i, '').toLowerCase(), en.name);
        }
      });
      return map;
    };
    this.backgroundDescriptionRows = descriptionRows(this.cache.json.get('background-description'), ['house']);
    this.backgroundNamesById = localizedNameMap(this.backgroundDescriptionRows);
    const meguDescriptionRows = descriptionRows(this.cache.json.get('megu-description'), ['megu']);
    this.meguDescriptionRows = meguDescriptionRows;
    this.characterNamesById = localizedNameMap(meguDescriptionRows);
    const meguStatsById = new Map();
    meguDescriptionRows.forEach(row => {
      if (!row || row.id == null) return;
      const raw = String(row.id).trim();
      const digits = raw.match(/\d+/);
      const keys = [raw.toLowerCase()];
      if (digits) { keys.push(String(Number(digits[0])), `id${Number(digits[0])}`); }
      keys.forEach(key => meguStatsById.set(key, {
        character_size: Number.isFinite(Number(row.size)) ? Number(row.size) : 1,
        hungry: Phaser.Math.Clamp(Number(row.hungry) || 5, 1, 10),
        min_weight: Number.isFinite(Number(row.min_weight)) ? Number(row.min_weight) : 0,
        max_weight: Number.isFinite(Number(row.max_weight)) ? Number(row.max_weight) : 0,
        change: row.change == null ? '' : String(row.change).trim()
      }));
    });
    this.characterDefs.forEach(def => {
      const raw = String(def.id || '').toLowerCase();
      const digits = raw.match(/\d+/);
      const stats = meguStatsById.get(raw) || (digits && (meguStatsById.get(String(Number(digits[0]))) || meguStatsById.get(`id${Number(digits[0])}`)));
      if (stats) Object.assign(def, stats);
    });
    // Keep localized detail text for the scrollable menu rows, preferring English.
    const localizedRecordMap = rows => {
      const map = new Map();
      rows.forEach(item => {
        if (!item || item.id == null) return;
        const strings = Array.isArray(item.strings) ? item.strings : [];
        const entry = this.getLocalizedString(strings);
        const record = { name: String(entry.name || ''), detail: String(entry.detail || '') };
        const rawId = String(item.id).trim();
        const digits = rawId.match(/\d+/);
        const keys = [rawId.toLowerCase(), rawId.replace(/^0+/, '').toLowerCase()];
        if (digits) { keys.push(String(Number(digits[0]))); keys.push('id' + Number(digits[0])); }
        keys.forEach(key => map.set(key, record));
      });
      return map;
    };
    const localizedRecord = (map, id) => {
      const raw = String(id == null ? '' : id).trim();
      const digits = raw.match(/\d+/);
      const keys = [raw.toLowerCase(), raw.replace(/^ID/i, '').toLowerCase()];
      if (digits) { keys.push(String(Number(digits[0]))); keys.push('id' + Number(digits[0])); }
      for (const key of keys) if (map && map.has(key)) return map.get(key);
      return { name: '', detail: '' };
    };
    this.localizedRecord = localizedRecord;
    this.backgroundRecordsById = localizedRecordMap(this.backgroundDescriptionRows);
    this.characterRecordsById = localizedRecordMap(meguDescriptionRows);
    const textJson = {
      hobbies: this.cache.json.get('megu-hobbies'),
      myboom: this.cache.json.get('megu-myboom'),
      honor: this.cache.json.get('megu-honor'),
      messages: this.cache.json.get('megu-messages'),
      ikigai: this.cache.json.get('megu-ikigai'),
      foodMessages: this.cache.json.get('megu-food-messages'),
      bathMessages: this.cache.json.get('megu-bath-messages'),
      touchMessages: this.cache.json.get('megu-touch-messages'),
      health: this.cache.json.get('megu-health')
    };
    const textJsonPaths = {
      hobbies: ART.meguHobbies,
      myboom: ART.meguMyboom,
      honor: ART.meguHonor,
      messages: ART.meguMessages,
      ikigai: ART.meguIkigai,
      foodMessages: ART.meguFoodMessages,
      bathMessages: ART.meguBathMessages,
      touchMessages: ART.meguTouchMessages,
      health: ART.meguHealth
    };
    Object.entries(textJson).forEach(([key, data]) => {
      if (!data || typeof data !== 'object') {
        console.error(`[MEGU] ${textJsonPaths[key]} was not loaded or did not contain valid JSON.`);
      } else if (!data.application || typeof data.application !== 'object') {
        console.error(`[MEGU] ${textJsonPaths[key]} loaded, but the expected "application" object is missing.`);
      }
    });
    this.statsStringOptions = {
      hobbies: this.extractMessageOptions(textJson.hobbies, 'hobbies'),
      myboom: this.extractMessageOptions(textJson.myboom, 'myboom'),
      honor: this.extractMessageOptions(textJson.honor, 'honor'),
      ikigai: this.extractMessageOptions(textJson.ikigai, 'ikigai'),
      foodMessages: this.extractMessageOptions(textJson.foodMessages, 'food_message'),
      bathMessages: this.extractMessageOptions(textJson.bathMessages, 'bath'),
      touchMessages: this.extractMessageOptions(textJson.touchMessages, 'touch_message'),
      health: this.extractMessageOptions(textJson.health, 'health')
    };
    this.baseHonorOptions = this.statsStringOptions.honor.slice();
    const messageRoot = textJson.messages && textJson.messages.application ? textJson.messages.application : {};
    this.meguMessagePhrases = Array.isArray(messageRoot.messages)
      ? messageRoot.messages.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
      : [];
    this.foodMessagePhrases = this.statsStringOptions.foodMessages || [];
    this.bathMessagePhrases = this.statsStringOptions.bathMessages || [];
    this.touchMessagePhrases = this.statsStringOptions.touchMessages || [];
    this.pettingCount = 0;
    this.petClickFrame = null;
    this.meguMessageContainer = null;
    this.meguMessageTimer = null;
    this.meguMessageMinUntil = 0;
    this.pendingMeguMessage = null;
    this.meguMessageDeferredTimer = null;
    this.meguSizesById = new Map();
    meguDescriptionRows.forEach(item => {
      if (!item || item.id == null || item.size == null) return;
      const digits = String(item.id).match(/\d+/);
      if (digits) this.meguSizesById.set(String(Number(digits[0])), String(item.size).trim());
    });
    const localizedName = (map, id, fallback) => {
      const raw = String(id == null ? '' : id);
      const base = raw.split('/').pop().replace(/\.(png|jpg|jpeg|webp)$/i, '');
      const variants = [raw, base, base.replace(/-2x$/i, ''), base.replace(/^ID/i, ''), base.replace(/^ID/i, '').replace(/-2x$/i, '')];
      for (const v of variants) {
        const name = map.get(v.toLowerCase()) || map.get(v.replace(/^0+/, '').toLowerCase());
        if (name) return name;
      }
      return fallback;
    };
    this.localizedName = localizedName;

    // Food options are built from both food atlases and localized description data.
    // The frame name may be FD1064-2x, FOOD_1064-2x, or another name containing
    // the numeric food ID; match any numeric token to application.food[].id.
    const foodDescription = this.cache.json.get('food-description');
    const foodDescriptionRows = descriptionRows(foodDescription, ['food']).slice().sort((a, b) => {
      const an = Number(a && a.id), bn = Number(b && b.id);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a && a.id || '').localeCompare(String(b && b.id || ''), undefined, { numeric: true });
    });
    this.foodDescriptionRows = foodDescriptionRows;
    const normalizeNumericId = value => {
      const digits = String(value == null ? '' : value).trim().match(/\d+/);
      return digits ? String(Number(digits[0])) : String(value == null ? '' : value).trim().toLowerCase();
    };
    this.foodDescriptionById = new Map();
    foodDescriptionRows.forEach(item => {
      if (!item || item.id == null) return;
      const strings = Array.isArray(item.strings) ? item.strings : [];
      const text = this.getLocalizedString(strings);
      this.foodDescriptionById.set(normalizeNumericId(item.id), {
        id: normalizeNumericId(item.id),
        name: text.name || `Food ${item.id}`,
        detail: text.detail || '',
        classification: item.classification || '',
        nutrition: Number(item.nutrition) || 0,
        calorie: Number(item.calorie) || 0,
        exp: Number(item.exp) || 0,
        level: Number(item.level) || 0,
        price: Number(item.price) || 0,
        not_sale: item.not_sale
      });
    });
    this.foodDefs = [];
    const seenFoodIds = new Set();
    ART.foodAtlases.forEach(atlas => {
      const atlasData = this.cache.json.get(`${atlas.key}-data`) || this.cache.json.get(atlas.key);
      atlasFrameEntries(atlasData).forEach(([frameName, frameData]) => {
        if (!frameName || frameName === '__BASE') return;
        const cleanFrame = String(frameName).replace(/\.(png|jpe?g|webp)$/i, '').replace(/(?:[-_]?2x)$/i, '');
        const numberTokens = (cleanFrame.match(/\d+/g) || []).map(normalizeNumericId);
        const matchedId = numberTokens.find(token => this.foodDescriptionById.has(token));
        const fallbackId = numberTokens.length ? numberTokens[0] : cleanFrame;
        const foodId = matchedId || fallbackId;
        if (seenFoodIds.has(String(foodId))) return;
        seenFoodIds.add(String(foodId));
        const localized = this.foodDescriptionById.get(foodId);
        const dimensions = atlasFrameDimensions(frameData);
        this.foodDefs.push({
          id: foodId,
          key: atlas.key,
          frame: frameName,
          name: localized && localized.name ? localized.name : cleanFrame,
          detail: localized && localized.detail ? localized.detail : '',
          classification: localized && localized.classification ? localized.classification : '',
          nutrition: localized ? localized.nutrition : 0,
          calorie: localized ? localized.calorie : 0,
          exp: localized ? localized.exp : 0,
          level: localized ? localized.level : 0,
          price: localized ? localized.price : 0,
          not_sale: localized ? localized.not_sale : 0,
          width: dimensions.width,
          height: dimensions.height
        });
      });
    });
    // A description-only fallback still allows the menu to render names if a frame
    // manifest is absent; thumbnails remain hidden until their atlas loads.
    if (!this.foodDefs.length && foodDescriptionRows.length) {
      this.foodDefs = foodDescriptionRows.map(item => {
        const id = normalizeNumericId(item.id);
        const strings = Array.isArray(item.strings) ? item.strings : [];
        const text = this.getLocalizedString(strings);
        return { id, key: 'food-atlas-0', frame: `FD${id}-2x`, name: text.name || `Food ${id}`, detail: text.detail || '', classification: item.classification || '', nutrition: Number(item.nutrition) || 0, calorie: Number(item.calorie) || 0, exp: Number(item.exp) || 0, level: Number(item.level) || 0, price: Number(item.price) || 0, not_sale: item.not_sale, width: 64, height: 64 };
      });
    }
    this.foodDefs.sort((a, b) => {
      const an = Number(a && a.id), bn = Number(b && b.id);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a && a.id || '').localeCompare(String(b && b.id || ''), undefined, { numeric: true });
    });
    this.applyPendingGiftFoodFriendship();
    ART.foodAtlases.forEach(atlas => {
      if (this.cache.json.exists(`${atlas.key}-data`)) this.cache.json.remove(`${atlas.key}-data`);
      // The live food atlas JSON is not needed after frame definitions are captured.
      if (this.cache.json.exists(atlas.key)) this.cache.json.remove(atlas.key);
    });
    this.foodScroll = 0;
    this.foodSelected = -1;
    this.foodFilter = null;
    this.foodMenuDefs = this.foodDefs.slice();
    this.foodFilterUI = [];
    this.foodOpen = false;
    this.foodStoreMode = false;
    this.furnitureStoreMode = false;
    this.specialStoreMode = false;
    this.foodMenuObjects = [];
    this.foodRowsUI = [];
    this.foodPress = null;
    this.foodScrollbarPress = null;
    this.foodScrollTrack = null;
    this.foodScrollTrackHit = null;
    this.foodScrollThumb = null;
    this.foodFurnitureButton = null;
    this.foodFurnitureLabel = null;
    this.foodActionActive = false;
    this.foodAnimationUntil = 0;
    this.foodActionToken = 0;
    this.foodSequenceActive = false;
    this.foodSequenceStage = 'idle'; // idle -> throwing -> approaching -> eating
    this.foodSequenceItem = null;
    this.foodProjectile = null;
    this.foodProjectileShadow = null;
    this.foodThrowTween = null;
    this.foodHappyDelay = null;

  }
});
