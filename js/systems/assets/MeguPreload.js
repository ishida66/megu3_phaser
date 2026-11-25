// Initial Phaser asset queueing for the Main scene.
// Loaded after game.js; the lifecycle method delegates here during Phaser startup.
Object.assign(Main.prototype, {
  preloadGameAssets() {
    // Report failed text JSON requests explicitly; stats pickers and messages depend on them.
    const textJsonPaths = {
      'megu-hobbies': ART.meguHobbies,
      'megu-myboom': ART.meguMyboom,
      'megu-honor': ART.meguHonor,
      'levelup-bonus': ART.levelUpBonus,
      'megu-messages': ART.meguMessages,
      'megu-ikigai': ART.meguIkigai,
      'megu-food-messages': ART.meguFoodMessages,
      'megu-touch-messages': ART.meguTouchMessages,
      'megu-health': ART.meguHealth
    };
    this.load.on('loaderror', file => {
      if (!file) return;
      const expectedPath = textJsonPaths[file.key] || (file.key === 'megutate-select-background'
        ? 'assets/menus/megutate_select@2x.png' : file.src || '(unknown source)');
      console.error(`[MEGU Asset Error] Failed to load asset: ${expectedPath} (key: ${file.key}).`,
        'Loader source:', file.src || '(not reported)', 'File type:', file.type || '(unknown)');
    });
    ['care','outing','store','megu','options','charging_room','gym','footer','food_picker','evolution_picker','furniture_picker','accessory_picker','accessory_editor','friend_invite','friend_visit','message_board','friend_visit_room','walk','adventure','take_photo','level_reward'].forEach(name => this.load.json('megu-menu-' + name, 'js/config/menus/' + name + '.json'));
    this.load.json('background-description', ART.backgroundDescription);
    this.load.json('megu-description', ART.meguDescription);
    // Queue thumbnail metadata after the description JSON arrives, within the
    // same Phaser preload cycle (before Main.create initializes the catalog).
    this.load.once('filecomplete-json-furniture-description', () => {
      const description = this.cache.json.get('furniture-description') || {};
      const application = description.application || description;
      const names = Array.isArray(application.furniture_thumbnail_list)
        ? application.furniture_thumbnail_list : [];
      const seen = new Set();
      ART.furnitureThumbnailAtlases = names.filter(name => {
        return typeof name === 'string' && /^furniture_thumbnails_\d+$/.test(name) && !seen.has(name) && seen.add(name);
      }).map(name => ({
        key: name.replace(/_/g, '-'),
        image: `assets/furniture/${name}.png`,
        json: `assets/furniture/${name}.json`
      }));
      ART.furnitureThumbnailAtlases.forEach(atlas => {
        this.load.json(`${atlas.key}-data`, atlas.json);
      });
    });
    this.load.json('furniture-description', ART.furnitureDescription);
    this.load.json('special-store-description', ART.specialStoreDescription);
    this.load.json('accessory-description', ART.accessoryDescription);
    this.load.json('food-description', ART.foodDescription);
    this.load.json('level-table', ART.levelTable);
    this.load.json('levelup-bonus', ART.levelUpBonus);
    this.load.json('jukebox-data', ART.jukebox);
    this.load.json('adventure-description', ART.adventureDescription);
    this.load.image('megutate-select-background', 'assets/menus/megutate_select@2x.png');
    this.load.image('menu-adventure', 'assets/menus/menu_adventure@2x.png');
    this.load.atlas('adventure-thumbnails', 'assets/adventure/spritesheet_thumbnail.png', 'assets/adventure/spritesheet_thumbnail.json');
    this.load.json('megu-hobbies', ART.meguHobbies);
    this.load.json('megu-myboom', ART.meguMyboom);
    this.load.json('megu-honor', ART.meguHonor);
    this.load.json('layout-bonus', ART.layoutBonus);
    this.load.json('megu-messages', ART.meguMessages);
    this.load.json('megu-ikigai', ART.meguIkigai);
    this.load.json('megu-food-messages', ART.meguFoodMessages);
    this.load.json('megu-bath-messages', ART.meguBathMessages);
    this.load.json('megu-touch-messages', ART.meguTouchMessages);
    this.load.json('megu-health', ART.meguHealth);
    this.load.image('megu-message-bg', ART.meguMessageBackground);
    this.load.image('level-up-image', ART.levelUpImage);
    this.load.image('daily-powercharge-0', ART.dailyPowerCharge0);
    this.load.image('daily-powercharge-1', ART.dailyPowerCharge1);
    this.load.image('gold-icon', ART.goldIcon);
    this.load.image('elixir-hud-icon', 'assets/objects/icon_hiyaku_pink@2x.png');
    this.load.image('level-reward-message-bg', ART.levelRewardMessageBackground);
    this.load.image('gym-training-icon', 'assets/menus/buttons/button_warumegu.png');
    this.load.image('elixir-confirm-icon', 'assets/menus/buttons/listIcon_elixir.png');
    this.load.image('voltamin-confirm-icon', 'assets/menus/buttons/listIcon_voltamin.png');
    this.load.image('voltamin-lite-confirm-icon', 'assets/menus/buttons/listIcon_voltamin_lite.png');
    this.load.image('elixir-confirm-ok', 'assets/menus/buttons/btn_ok@2x.png');
    this.load.image('elixir-confirm-close', 'assets/menus/buttons/btn_close@2x.png');
    this.load.image('level-reward-gold', ART.levelRewardGold);
    this.load.image('level-reward-close', ART.levelRewardClose);
    this.load.image('hygiene-fly', 'assets/objects/fly@2x.png');
    this.load.image('room-dirt', ART.dirtImage);
    this.load.image('clean-broom-cursor', ART.broomCursor);
    this.load.image('bath-bubble', 'assets/objects/awa@2x.png');
    this.load.image('edit-remove-furniture-icon', 'assets/menus/buttons/listIcon_kagu_undo.png');
    this.load.image('edit-close-icon', 'assets/menus/buttons/btn_close.png');
    this.load.image('heart-s', ART.heartSmall);
    this.load.image('heart-m', ART.heartMedium);
    this.load.image('heart-l', ART.heartLarge);
    this.load.image('transparent-selection', ART.transparentSelection);
    // Cursor image is also loaded as an asset; the actual pointer uses the same URL as CSS.
    this.load.image('petting-hand-cursor', ART.handCursor);
    // Catalog atlases only need their small JSON metadata at startup. The PNG
    // textures are loaded lazily for visible menu rows and released when unused.
    ART.foodAtlases.forEach(a => this.load.json(`${a.key}-data`, a.json));
    // Character thumbnail JSON is small metadata and remains cached; the large
    // atlas PNGs are loaded only while the character picker is open.
    ART.characterThumbnailAtlases.forEach(a => this.load.json(`${a.key}-data`, a.json));
    // Food furniture already saved in the room needs its atlas at startup. Do not
    // load any unrelated food sheet unless a legacy save does not identify one.
    const knownFoodAtlasKeys = new Set(ART.foodAtlases.map(a => a.key));
    const savedFoodObjects = (Array.isArray(GAME_ATTRIBUTES.furn) ? GAME_ATTRIBUTES.furn : []).filter(o => o && o.kind === 'food');
    const savedFoodKeys = new Set(savedFoodObjects.map(o => String(o.key || '')).filter(k => knownFoodAtlasKeys.has(k)));
    const hasUnmappedSavedFood = savedFoodObjects.some(o => !knownFoodAtlasKeys.has(String(o.key || '')));
    ART.foodAtlases.forEach(a => {
      if (savedFoodKeys.has(a.key) || hasUnmappedSavedFood) this.load.atlas(a.key, a.image, a.json);
    });
    this.load.audio('megu-bgm', ART.bgm);
    this.load.audio('character-changing-sfx', ART.characterChangingSfx);
    this.load.audio('level-up-sfx', ART.levelUpSfx);
    this.load.audio('house-changed-sfx', ART.houseChangedSfx);
    this.load.audio('house-complete-sfx', 'assets/sound/sfx/SE_Complete.wav');
    this.load.audio('pet-sfx', ART.petSfx);
    this.load.audio('friend-join-sfx', 'assets/sound/sfx/SE_Complete.wav');
    this.load.audio('wash-sfx', ART.washSfx);
    this.load.audio('sweep-sfx', ART.sweepSfx);
    this.load.audio('click-sfx', ART.clickSfx);
    this.load.audio('gold-sfx', ART.goldSfx);
    this.load.audio('bad-sfx', ART.badSfx);
    ART.meguVoiceSfx.forEach((path, i) => this.load.audio(`megu-voice-${i + 1}`, path));
    this.load.audio('food-sfx', ART.foodSfx);
    this.load.audio('happy1-sfx', ART.happySfx1);
    this.load.audio('happy2-sfx', ART.happySfx2);
    this.load.audio('happy3-sfx', ART.happySfx3);
    this.load.image('base-stats', ART.baseStats);
    this.load.image('visit-bar', ART.visitBar);
    this.load.image('message-board-ui-background', 'assets/message_board/board_ready@2x.png');
    this.load.image('message-board-close', 'assets/menus/buttons/btn_close.png');
    this.load.image('message-board-ok', 'assets/menus/buttons/btn_ok@2x.png');
    this.load.image('message-board-owner-icon', 'assets/message_board/board_icon_owner@2x.png');
    this.load.image('message-board-visitor-icon', 'assets/message_board/board_icon_visitor@2x.png');
    this.load.image('visit-back-button', ART.visitBackButton);
    this.load.image('voltage-0', 'assets/objects/icon_voltage0@2x.png');
    this.load.image('voltage-1', 'assets/objects/icon_voltage1@2x.png');
    this.load.image('voltage-2', 'assets/objects/icon_voltage2@2x.png');
    this.load.image('voltage-3', 'assets/objects/icon_voltage3@2x.png');
    this.load.image('bottom-bar', ART.bottomBar);
    this.load.image('menu-food', ART.menuFood);
    this.load.image('menu-house', ART.menuHouse);
    this.load.image('menu-character', ART.menuSuperEvolution);
    this.load.image('menu-friend', 'assets/menus/menu_friend@2x.png');
    this.load.image('menu-furniture', ART.menuFurniture);
    this.load.image('menu-layout', ART.menuLayout);
    this.load.image('menu-accessory', ART.menuAccessory);
    this.load.image('menu-care', ART.menuCare);
    this.load.image('menu-outing', ART.menuOuting);
    this.load.image('menu-options', ART.menuOptions);
    this.load.image('menu-megu', ART.menuMegu);
    this.load.image('menu-store', ART.menuStore);
    this.load.image('charging-room-background', 'assets/menus/charging_room@2x.png');
    this.load.image('gym-background', 'assets/minigame/gym@2x.png');
    this.load.image('megu-gym-barbell', 'assets/minigame/barbell@2x.png');
  }
});
