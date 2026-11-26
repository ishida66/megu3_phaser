// Main MEGU game entry and scene definitions.
const W = 640, H = 720, CANVAS_H = 950, PLAY_AREA_H = 640;
const textStyle = (size, color = '#ffffff') => ({ fontFamily: 'sans-serif', fontSize: `${size}px`, color });
// Lightweight fallback appearance used only while the active MEGU sprite atlas is unavailable.
const FALLBACK_CHARACTER = ['MEGU', 0xffb3c7, 1, 1, 0, 1];
function drawBody(g, px, py, r, col) {
  const [, , ear, pat, tail, w] = FALLBACK_CHARACTER, bw = r * w;
  const dk = Phaser.Display.Color.ValueToColor(col).darken(25).color;
  if (tail) g.fillStyle(dk).fillCircle(px + bw * 0.95, py + r * 0.5, r * 0.22);
  [-1, 1].forEach(s => {
    g.fillStyle(col);
    if (ear === 1) g.fillTriangle(px + s * bw * 0.8, py - r * 0.5, px + s * bw * 0.45, py - r * 0.9, px + s * bw * 0.2, py - r * 0.8);
    else if (ear === 2) g.fillCircle(px + s * bw * 0.6, py - r * 0.8, r * 0.25);
    else if (ear === 3) g.fillEllipse(px + s * bw * 0.35, py - r * 1.1, r * 0.3, r * 0.8);
    else if (ear === 4) g.fillStyle(dk).fillTriangle(px + s * bw * 0.55, py - r * 0.7, px + s * bw * 0.25, py - r * 0.8, px + s * bw * 0.6, py - r * 1.2);
    else if (ear === 8) g.fillStyle(dk).fillEllipse(px + s * bw * 0.95, py - r * 0.05, r * 0.3, r * 0.7);
  });
  if (ear === 5) { g.lineStyle(2, 0x222222).lineBetween(px, py - r * 0.8, px, py - r * 1.15); g.fillStyle(dk).fillCircle(px, py - r * 1.2, r * 0.253); }
  if (ear === 6) g.fillStyle(dk).fillTriangle(px - bw * 0.25, py - r * 0.8, px + bw * 0.25, py - r * 0.8, px, py - r * 1.25);
  if (ear === 7) g.fillStyle(0x5fbf5f).fillCircle(px, py - r * 0.95, r * 0.255).fillCircle(px - bw * 0.2, py - r * 0.9, r * 0.251).fillCircle(px + bw * 0.2, py - r * 0.9, r * 0.251);
  g.fillStyle(col).fillEllipse(px, py, bw * 2, r * 1.8);
  if (pat === 1) g.fillStyle(0xffffff, 0.55).fillEllipse(px, py + r * 0.45, bw * 1.1, r * 0.8);
  else if (pat === 2) g.fillStyle(dk, 0.8).fillCircle(px - bw * 0.55, py + r * 0.35, r * 0.252).fillCircle(px + bw * 0.5, py - r * 0.45, r * 0.25).fillCircle(px + bw * 0.4, py + r * 0.5, r * 0.254);
  else if (pat === 3) { g.lineStyle(r * 0.25, dk); [-1, 0, 1].forEach(s => g.lineBetween(px + s * bw * 0.25, py - r * 0.85, px + s * bw * 0.25, py - r * 0.6)); }
}
const clamp = v => Math.max(0, Math.min(100, v));
const FOOD_CLASS_FILTERS = [
  ['american',120], ['bakery',136], ['beverages',151], ['brazilian',166],
  ['cakes',181], ['candies',196], ['chinese',211], ['chocolate',226],
  ['east asian',241], ['french',256], ['fruits',271], ['ice cream',286],
  ['indian',301], ['italian',316], ['japanese sweets',331],
  ['japanese washoku',346], ['japanese yoshoku',361], ['korean',376],
  ['meat and fish',391], ['mediterranean',406], ['mexican',421], ['misc',436],
  ['patisserie',451], ['pies',466], ['pudding',481], ['vegetarian',496],
  ['snacks',511], ['soups',526], ['special',541]
];
const normalizeFoodClassification = value => {
  const normalized = String(value == null ? '' : value)
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  // The food data uses "Meat fish", while the menu category is labelled
  // "Meat and Fish". Treat both spellings as the same classification.
  if (normalized === 'meat fish') return 'meat and fish';
  return normalized;
};

// Background PNGs are loaded from background_description.json IDs.
const BG = [];
const ART = {
  backgroundDescription: 'assets/background/background_description.json',
  meguDescription: 'assets/megu/megu_description.json',
  furnitureDescription: 'assets/furniture/furniture_description.json',
  specialStoreDescription: 'assets/special_store/special_store_description.json',
  accessoryDescription: 'assets/accessories/accessory_description.json',
  foodDescription: 'assets/food/food_description.json',
  levelTable: 'assets/json/level_table.json',
  levelUpBonus: 'assets/json/levelup_bonus_dl.json',
  jukebox: 'assets/json/jukebox.json',
  meguHobbies: 'assets/texts/hobbies.json',
  meguMyboom: 'assets/texts/myboom.json',
  meguHonor: 'assets/texts/honor.json',
  layoutBonus: 'assets/json/layout_bonus_dl.json',
  meguMessages: 'assets/texts/messages.json',
  meguIkigai: 'assets/texts/ikigai.json',
  meguFoodMessages: 'assets/texts/food_message.json',
  meguBathMessages: 'assets/texts/bath_message.json',
  meguTouchMessages: 'assets/texts/touch_message.json',
  meguHealth: 'assets/texts/health.json',
  adventureDescription: 'assets/adventure/adventure_description.json',
  meguMessageBackground: 'assets/objects/bg_message@2x.png',
  levelRewardMessageBackground: 'assets/objects/bg_message_medium@2x.png',
  goldIcon: 'assets/objects/gold_icon.png',
  levelRewardGold: 'assets/objects/gold@2x.png',
  levelRewardClose: 'assets/menus/buttons/btn_close@2x.png',
  bgm: 'assets/sound/bgm/MEGU_BGM.mp3',
  characterChangingSfx: 'assets/sound/sfx/SE_changing.wav',
  levelUpSfx: 'assets/sound/sfx/SE_levelup.wav',
  levelUpImage: 'assets/objects/LVUP@2x.png',
  dailyPowerCharge0: 'assets/objects/powercharge00@2x.png',
  dailyPowerCharge1: 'assets/objects/powercharge01@2x.png',
  houseChangedSfx: 'assets/sound/sfx/SE_changed.wav',
  petSfx: 'assets/sound/sfx/SE_pet.wav',
  washSfx: 'assets/sound/sfx/SE_wash.wav',
  sweepSfx: 'assets/sound/sfx/SE_sweep.wav',
  clickSfx: 'assets/sound/sfx/SE_click.wav',
  goldSfx: 'assets/sound/sfx/SE_gold.wav',
  badSfx: 'assets/sound/sfx/SE_bad.wav',
  handCursor: 'assets/cursor/hand@2x.png',
  broomCursor: 'assets/objects/houki@2x.png',
  dirtImage: 'assets/objects/hokori.png',
  heartSmall: 'assets/objects/heart_s@2x.png',
  heartMedium: 'assets/objects/heart_m@2x.png',
  heartLarge: 'assets/objects/heart_l@2x.png',
  transparentSelection: 'assets/objects/transparentselection@2x.png',
  meguVoiceSfx: Array.from({ length: 10 }, (_, i) => `assets/sound/sfx/SE_megu${i + 1}.wav`),
  foodSfx: 'assets/sound/sfx/SE_food.wav',
  happySfx1: 'assets/sound/sfx/SE_happy1.wav',
  happySfx2: 'assets/sound/sfx/SE_happy2.wav',
  happySfx3: 'assets/sound/sfx/SE_happy3.wav',
  baseStats: 'assets/menus/base_stats@2x.png',
  visitBar: 'assets/menus/visit_bar@2x.png',
  visitBackButton: 'assets/menus/buttons/btn_back@2x.png',
  bottomBar: 'assets/menus/bottom_bar@2x.png',
  menuFood: 'assets/menus/menu_food@2x.png',
  menuHouse: 'assets/menus/menu_house@2x.png',
  menuSuperEvolution: 'assets/menus/menu_megutate@2x.png',
  menuFurniture: 'assets/menus/menu_furniture@2x.png',
  menuLayout: 'assets/menus/menu_layout@2x.png',
  menuAccessory: 'assets/menus/menu_accessory@2x.png',
  menuCare: 'assets/menus/menu_care@2x.png',
  menuOuting: 'assets/menus/menu_outing@2x.png',
  menuOptions: 'assets/menus/menu_options@2x.png',
  menuMegu: 'assets/menus/menu_megu@2x.png',
  menuStore: 'assets/menus/menu_store@2x.png',
  foodAtlases: [
    { key: 'food-atlas-0', image: 'assets/food/spritesheet_food_0.png', json: 'assets/food/spritesheet_food_0.json' },
    { key: 'food-atlas-1', image: 'assets/food/spritesheet_food_1.png', json: 'assets/food/spritesheet_food_1.json' }
  ],
  // Populated from furniture_description.json during preload.
  furnitureThumbnailAtlases: [],
  characterThumbnailAtlases: [
    { key: 'megu-thumbnails-0', image: 'assets/megu/megu_thumbnails_0.png', json: 'assets/megu/megu_thumbnails_0.json' },
    { key: 'megu-thumbnails-1', image: 'assets/megu/megu_thumbnails_1.png', json: 'assets/megu/megu_thumbnails_1.json' }
  ]
};

// Read TexturePacker-style atlas metadata without loading its image texture.
// Keeping frame metadata separate lets menus load only the atlas images they need.
function atlasFrameEntries(atlasData) {
  const frames = atlasData && atlasData.frames;
  if (Array.isArray(frames)) {
    return frames.map((entry, index) => [
      String(entry && (entry.filename || entry.name || entry.frameName) || index), entry
    ]).filter(([name]) => !!name);
  }
  return frames && typeof frames === 'object' ? Object.entries(frames) : [];
}
function atlasFrameDimensions(frameData) {
  const frame = frameData && frameData.frame ? frameData.frame : (frameData || {});
  return {
    width: Math.max(1, Number(frame.w != null ? frame.w : frame.width) || 64),
    height: Math.max(1, Number(frame.h != null ? frame.h : frame.height) || 64)
  };
}

class Main extends Phaser.Scene {


  preload() {
    this.preloadGameAssets();
  }

  create() {
    this.initializeHomeReturnLifecycleHandlers();
    this.initializeLanguagePreference();
    this.initializeLevelProgressionData();
    this.initializeCatalogData();
    this.initializeActiveCharacterAtlas();
    this.initializeBackgroundCatalog();

    this.initializeInitialBackgroundLoading();
    this.initializeHomeRoomFoundation();
    // The canvas stacks the 640px base game, a 4px black divider, stats, and bottom bar.
    this.initializeFooterMenuFoundation();
    this.initializeBaseStatsPanel();
    this.initializeHomeNavigationControls();
    this.initializeAudio();
    this.initializePetInteractionInput();
    // The Stop moving and top-row Characters/Furniture/Background buttons were
    // removed; these controls are now accessed through the Care menu.
    this.initializeFriendHouseLifecycleState();
    this.initializeHomePetMovementState();
    // Top-right status HUD: live attribute-driven bars matching the supplied reference.
    this.initializeTopStatusHud();

    this.initializeGoldAndMedicineHud();
    this.initializeDebugControls();
    this.updateVoltageIcon();
    this.applyCurrentMeguWeightBounds();
    this.startGameAttributeTracking();
    // The initial Home scene is also a return point: check starvation only
    // after login-time offline satiety decay has been applied above.
    this._playStarvingReturnSfx();
    // Random base-screen idle pose: use ID_N_11-2x for ~5s, with duration and
    // recurrence jitter. A separate mirror toggle lets this still appear flipped
    // even when the currently chosen facing direction would normally be unchanged.
    this.initializeIdlePoseSchedule();
    this.initializePettingInteractionState();
    this.initializeHomeCharacterLabels();
    this.initializeRoomInteraction();

    this.initializeRetiredHomeControlState();

    this.initializeBackgroundAndFurniturePickerState();

    this.initializeFurnitureEditControls();

    this.initializeFurnitureEditingInput();

    this.initializeCharacterPickerState();

    this.initializePickerScrollingInput();

    this.completeHomeSceneInitialization();
  }














  // The home renderer's menu visibility is derived from the complete UI state.
  // Menus should call this instead of independently restoring body/eye layers.
  // Special non-menu animations and transitions retain their own explicit overrides.





  // Food and furniture inventories share the same stack/provenance rules.
  // Keep the category-specific methods below as stable call sites for menus and gameplay.








  update(time, delta) {
    this.ensureStressAssignment();
    // Charging Room suspends all home simulation, pet interactions, random
    // messages, movement and ambient updates while keeping its dedicated idle animation.
    if (this.chargingRoomActive || this.chargingRoomClosing) {
      if (this.evolutionTransition && this.evolutionTransition.active) this.updateEvolutionTransition(time);
      else this.updateChargingRoom(time, delta);
      return;
    }
    if (this.gymActive || this.gymClosing) {
      this.updateGymMode(time, delta);
      return;
    }
    this.updateVisitorHouseHost(time);
    if (this.updateHomeTransitionGate(time)) return;
    this.updateHomeAmbientVoice(time);
    this.updateHomeFoodCompletion(time);
    this.updateHomeBackground();
    this.cleanupHomeFurnitureSprites();
    this.renderHomeFurniture();
    this.updateHomePetMovement(time);
    this.updateHomePetFacing(time);
    this.renderHomeCharacter(time, delta);
    this.updateFurnitureMenu();
    this.updateAccessoryHomeOverlay();
    this.updateBackgroundMenu();
    this.updateCharacterMenu();
    this.updateFoodMenu();
    this.updateHygieneEffects(time);
    this.ensureRoomDirt();
    this.updateFriendPets(time);
  }
}

// Shared renderer loaded by kawaii_pet_megu_2.0_revival.html before this file.
const MeguRenderer = window.MeguRenderer;
