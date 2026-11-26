// Persistent MEGU game attributes, save migration, and shared inventory/stat costs.
function save() {
  persistGameAttributes();
}
let gameAttributeSaveTick = 0;

// Persistent player-facing game attributes are stored separately from the
// existing pet simulation save, so adding these fields never replaces legacy saves.
const GAME_ATTRIBUTES_KEY = 'tama.gameAttributes';
const HOUSE_LAYOUTS_KEY = 'tama.houseLayouts.v1';
const HOUSE_LAYOUT_SLOT_COUNT = 100;
const localCalendarDay = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
// Daily gifting follows the same local-noon cycle as the daily electricity charge.
const localDailyChargeCycleDay = (date = new Date()) => {
  const cycleStart = new Date(date);
  if (cycleStart.getHours() < 12) cycleStart.setDate(cycleStart.getDate() - 1);
  return localCalendarDay(cycleStart);
};
const calendarDaysBetween = (startDay, endDay = localCalendarDay()) => {
  const parse = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  };
  return Math.max(0, Math.floor((parse(endDay) - parse(startDay)) / 86400000));
};
let GAME_ATTRIBUTES_IS_NEW_PLAYER = false;
const DEFAULT_GAME_ATTRIBUTES = {
  birthday: localCalendarDay(), lastAccessed: '', health: 1000, max_health: 1000,
  level: 1, current_exp: 100, exp_for_lvlup: 1000, pending_outgoing_gift_food_friendship: 0,
  reliability: 'A lovely MEGU', myboom: '', myboomNextChangeAt: 0, electricity: 99, weight: 5.50,
  charge: 0, lastDailyChargeDay: '', allowEvolution: true, petId: 'ID1', shiny: false, bg: 0, furn: [], userName: '', petName: '', personalMessage: '', hideFromDiscovery: false,
  hobby: 'making a new MEGU game.', stress: '', stressAction: '', stressNextAt: 0, stressPetCount: 0, gold: 1000, food_store: [], furniture_store: [], furniture_shop_stock: {}, unlocked_backgrounds: [], accessories: [], accessory: { id: '', poses: {} },
  elixir: 50, voltamin: 50, voltaminLite: 50, betaVoltamin: 50, superVoltamin: 50, devoMedicine: 50, superDevoMedicine: 50, rainbowZ: 50, regularFlightTicket: 50, goldenFlightTicket: 50,
  pastPetIds: [], sumoCareer: { rankIndex: 0, rankPoints: 0, archetype: '', promotion: null, wins: 0, losses: 0, ozekiDefeats: 0 },
  sumoCharacterStats: {}, sumoTrainingLastFreeDay: '', race_skill: 'explosive_start', lastBossRaceDay: '',
  satiety: 500, max_satiety: 1000, hygiene: 100, hygieneLastUpdatedAt: '', clean: 100, cleanLastUpdatedAt: '', friendship: 999999, max_friendship: 999999,
  satisfaction: 'planting tomatoes.', honor: 0, honorUnlockedIndex: 0, honorSelectedIndex: 0, honorCompetitionBonus: 0, sumoHonorHighestRankIndex: 0, sumoHonorTopClassAwarded: false, sumoHonorDaiYokozunaAwarded: false, jockeyHonorClasses: [], jockeyHonorTopClassAwarded: false, jockeyHonorBossAwarded: false, ballTossMaxRecord: 0, jumpRopeMaxRecord: 0, hobbyNextChangeAt: 0
};
function isMeguLowSatiety(attributes = GAME_ATTRIBUTES) {
  const satiety = Number(attributes.satiety);
  const maximum = Number(attributes.max_satiety);
  return Number.isFinite(satiety) && Number.isFinite(maximum) && maximum > 0 && satiety < maximum * 0.1;
}
function loadGameAttributes() {
  try {
    const raw = localStorage.getItem(GAME_ATTRIBUTES_KEY);
    GAME_ATTRIBUTES_IS_NEW_PLAYER = !raw;
    const saved = raw ? JSON.parse(raw) : {};
    const attributes = { ...DEFAULT_GAME_ATTRIBUTES, ...(saved && typeof saved === 'object' ? saved : {}) };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(attributes.birthday || ''))) attributes.birthday = localCalendarDay();
    // Migrate the earlier placeholder string to the requested numeric satiety value.
    if (!Number.isFinite(Number(attributes.satiety))) attributes.satiety = 1000;
    attributes.honorUnlockedIndex = Number.isFinite(Number(attributes.honorUnlockedIndex)) ? Math.max(0, Math.trunc(Number(attributes.honorUnlockedIndex))) : 0;
    attributes.honorSelectedIndex = Number.isFinite(Number(attributes.honorSelectedIndex)) ? Math.max(0, Math.trunc(Number(attributes.honorSelectedIndex))) : 0;
    attributes.ballTossMaxRecord = Number.isFinite(Number(attributes.ballTossMaxRecord)) ? Math.max(0, Math.trunc(Number(attributes.ballTossMaxRecord))) : 0;
    attributes.jumpRopeMaxRecord = Number.isFinite(Number(attributes.jumpRopeMaxRecord)) ? Math.max(0, Math.trunc(Number(attributes.jumpRopeMaxRecord))) : 0;
    attributes.satiety = Math.max(0, Math.round(Number(attributes.satiety)));
    attributes.max_satiety = Number.isFinite(Number(attributes.max_satiety)) ? Math.max(0, Math.round(Number(attributes.max_satiety))) : 1000;
    // Health now uses a 0–1000 scale. Preserve the percentage from older 0–100 saves.
    const savedHealthMax = saved.max_health != null ? Number(saved.max_health) : 100;
    const savedHealth = Number(attributes.health);
    if (!Number.isFinite(savedHealth)) attributes.health = 900;
    else if (Number.isFinite(savedHealthMax) && savedHealthMax > 0 && savedHealthMax <= 100) {
      attributes.health = Math.round(Phaser.Math.Clamp(savedHealth / savedHealthMax, 0, 1) * 1000);
    }
    attributes.hygiene = Number.isFinite(Number(attributes.hygiene)) ? Phaser.Math.Clamp(Number(attributes.hygiene), 0, 100) : 100;
    attributes.clean = Number.isFinite(Number(attributes.clean)) ? Math.round(Phaser.Math.Clamp(Number(attributes.clean), 0, 100)) : 100;
    if (!attributes.cleanLastUpdatedAt || !Number.isFinite(Date.parse(attributes.cleanLastUpdatedAt))) attributes.cleanLastUpdatedAt = new Date().toISOString();
    if (!attributes.hygieneLastUpdatedAt || !Number.isFinite(Date.parse(attributes.hygieneLastUpdatedAt))) attributes.hygieneLastUpdatedAt = new Date().toISOString();
    attributes.sumoCareer = attributes.sumoCareer && typeof attributes.sumoCareer === 'object' && !Array.isArray(attributes.sumoCareer) ? attributes.sumoCareer : {};
    attributes.sumoCareer.rankIndex = Math.max(0, Math.trunc(Number(attributes.sumoCareer.rankIndex) || 0));
    attributes.sumoYokozunaUnlocked = attributes.sumoYokozunaUnlocked === true || attributes.sumoCareer.rankIndex >= 728;
    attributes.sumoCareer.rankPoints = Math.max(0, Math.trunc(Number(attributes.sumoCareer.rankPoints) || 0));
    attributes.sumoCareer.ozekiDefeats = Math.max(0, Math.trunc(Number(attributes.sumoCareer.ozekiDefeats) || 0));
    attributes.sumoCareer.archetype = ['powerhouse','speedster','technician','veteran'].includes(attributes.sumoCareer.archetype) ? attributes.sumoCareer.archetype : '';
    attributes.sumoCareer.promotion = attributes.sumoCareer.promotion && typeof attributes.sumoCareer.promotion === 'object' ? attributes.sumoCareer.promotion : null;
    attributes.sumoCareer.wins = Math.max(0, Math.trunc(Number(attributes.sumoCareer.wins) || 0));
    attributes.sumoCareer.losses = Math.max(0, Math.trunc(Number(attributes.sumoCareer.losses) || 0));
    attributes.sumoCareer.daiYokozunaChallengeDay = /^\d{4}-\d{2}-\d{2}$/.test(String(attributes.sumoCareer.daiYokozunaChallengeDay || '')) ? String(attributes.sumoCareer.daiYokozunaChallengeDay) : '';
    attributes.honorCompetitionBonus = Math.max(0, Math.trunc(Number(attributes.honorCompetitionBonus) || 0));
    // Existing saves start tracking from their current Sumo rank, avoiding retroactive rank rewards.
    attributes.sumoHonorHighestRankIndex = saved.sumoHonorHighestRankIndex == null
      ? attributes.sumoCareer.rankIndex
      : Math.max(attributes.sumoCareer.rankIndex, Math.trunc(Number(saved.sumoHonorHighestRankIndex) || 0));
    attributes.sumoHonorTopClassAwarded = saved.sumoHonorTopClassAwarded === true;
    attributes.sumoHonorDaiYokozunaAwarded = saved.sumoHonorDaiYokozunaAwarded === true;
    attributes.jockeyHonorClasses = Array.isArray(attributes.jockeyHonorClasses)
      ? [...new Set(attributes.jockeyHonorClasses.map(value => Math.trunc(Number(value))).filter(value => value >= 0 && value <= 9))] : [];
    attributes.jockeyHonorTopClassAwarded = saved.jockeyHonorTopClassAwarded === true;
    attributes.jockeyHonorBossAwarded = saved.jockeyHonorBossAwarded === true;
    attributes.sumoCharacterStats = attributes.sumoCharacterStats && typeof attributes.sumoCharacterStats === 'object' && !Array.isArray(attributes.sumoCharacterStats) ? attributes.sumoCharacterStats : {};
    attributes.raceWatermelonUnlocked = attributes.raceWatermelonUnlocked && typeof attributes.raceWatermelonUnlocked === 'object' && !Array.isArray(attributes.raceWatermelonUnlocked) ? attributes.raceWatermelonUnlocked : {};
    for (const [characterKey, record] of Object.entries(attributes.sumoCharacterStats)) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
      record.training = record.training && typeof record.training === 'object' && !Array.isArray(record.training) ? record.training : {};
      for (const key of ['power','agility','technique','endurance']) record.training[key] = Math.max(0, Math.trunc(Number(record.training[key]) || 0));
      record.stats = record.stats && typeof record.stats === 'object' && !Array.isArray(record.stats) ? record.stats : {power:5,agility:5,technique:5,endurance:5};
      const [savedCharacterId, savedVariant] = String(characterKey).split(':');
      for (const key of ['power','agility','technique','endurance']) {
        const savedStatCap = getCharacterStatCap(key, savedCharacterId, savedVariant === 'shiny', attributes);
        record.stats[key] = Phaser.Math.Clamp(Math.trunc(Number(record.stats[key]) || 5), 5, savedStatCap);
      }
    }
    attributes.sumoTrainingLastFreeDay = /^\d{4}-\d{2}-\d{2}$/.test(String(attributes.sumoTrainingLastFreeDay || '')) ? String(attributes.sumoTrainingLastFreeDay) : '';
    attributes.lastBossRaceDay = /^\d{4}-\d{2}-\d{2}$/.test(String(attributes.lastBossRaceDay || '')) ? String(attributes.lastBossRaceDay) : '';
    attributes.race_skill = ['explosive_start','technical_run','second_wind','heavy_push','feather_dash','final_sprint'].includes(attributes.race_skill) ? attributes.race_skill : 'explosive_start';
    attributes.max_health = 1000;
    attributes.health = Math.round(Phaser.Math.Clamp(Number(attributes.health), 0, 1000));
    attributes.level = Number.isFinite(Number(attributes.level)) ? Number(attributes.level) : 1;
    attributes.charge = Number.isFinite(Number(attributes.charge)) ? Phaser.Math.Clamp(Math.trunc(Number(attributes.charge)), 0, 4) : 0;
    attributes.allowEvolution = attributes.allowEvolution !== false;
    attributes.lastDailyChargeDay = /^\d{4}-\d{2}-\d{2}$/.test(String(attributes.lastDailyChargeDay || '')) ? String(attributes.lastDailyChargeDay) : '';
    attributes.petId = String(attributes.petId || 'ID1');
    // Track forms encountered from this save onward. Older saves cannot reveal
    // forms used before this history field existed.
    attributes.pastPetIds = Array.isArray(attributes.pastPetIds)
      ? [...new Map(attributes.pastPetIds.filter(id => id != null && String(id).trim()).map(id => [String(id).toUpperCase(), String(id)])).values()]
      : [];
    if (!attributes.pastPetIds.some(id => String(id).toUpperCase() === attributes.petId.toUpperCase())) {
      attributes.pastPetIds.push(attributes.petId);
    }
    attributes.bg = Number.isFinite(Number(attributes.bg)) ? Math.max(0, Math.trunc(Number(attributes.bg))) : 0;
    attributes.unlocked_backgrounds = Array.isArray(attributes.unlocked_backgrounds) ? [...new Set(attributes.unlocked_backgrounds.map(value => String(value))) ] : [];
    // The starting house is always owned, including for saves created before house unlocking existed.
    const initialBackground = '1';
    if (!attributes.unlocked_backgrounds.includes(initialBackground)) attributes.unlocked_backgrounds.push(initialBackground);
    attributes.furn = Array.isArray(attributes.furn) ? attributes.furn : [];
    attributes.food_store = Array.isArray(attributes.food_store) ? attributes.food_store.filter(entry => entry && entry.id != null && Number(entry.quantity) > 0).map(entry => ({ id: String(entry.id), quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)), source: ['store', 'game', 'player'].includes(String(entry.source)) ? String(entry.source) : 'game' })) : [];
    attributes.furniture_store = Array.isArray(attributes.furniture_store) ? attributes.furniture_store.filter(entry => entry && entry.id != null && Number(entry.quantity) > 0).map(entry => ({ id: String(entry.id), quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)), source: ['store', 'game', 'player'].includes(String(entry.source)) ? String(entry.source) : 'game' })) : [];
    attributes.furniture_store = attributes.furniture_store.length ? attributes.furniture_store : [];
    attributes.furniture_shop_stock = attributes.furniture_shop_stock && typeof attributes.furniture_shop_stock === 'object' && !Array.isArray(attributes.furniture_shop_stock) ? attributes.furniture_shop_stock : {};
    attributes.accessory = attributes.accessory && typeof attributes.accessory === 'object' && !Array.isArray(attributes.accessory) ? attributes.accessory : { id: '', poses: {} };
    attributes.accessory.id = attributes.accessory.id == null ? '' : String(attributes.accessory.id);
    attributes.accessory.poses = attributes.accessory.poses && typeof attributes.accessory.poses === 'object' && !Array.isArray(attributes.accessory.poses) ? attributes.accessory.poses : {};
    // Migrate old single-accessory local saves and sanitize the new collection.
    if (!Array.isArray(attributes.accessories) || (!attributes.accessories.length && attributes.accessory.id)) {
      attributes.accessories = attributes.accessory.id ? [JSON.parse(JSON.stringify(attributes.accessory))] : [];
    }
    attributes.accessories = attributes.accessories.filter(item => item && item.id != null && String(item.id) !== '')
      .map(item => ({ ...item, id: String(item.id), poses: item.poses && typeof item.poses === 'object' && !Array.isArray(item.poses) ? item.poses : {} }));
    attributes.accessory = attributes.accessories[0] || { id: '', poses: {} };
    attributes.stressAction = ['pet8','eat','bath','buyFurniture','sumo','jumpRope','ballToss','jockey','inviteFriend','visitFriend'].includes(String(attributes.stressAction || '')) ? String(attributes.stressAction) : '';
    attributes.stressNextAt = Number.isFinite(Number(attributes.stressNextAt)) ? Math.max(0, Number(attributes.stressNextAt)) : 0;
    attributes.stressPetCount = Number.isFinite(Number(attributes.stressPetCount)) ? Math.max(0, Math.trunc(Number(attributes.stressPetCount))) : 0;
    attributes.stress = attributes.stressAction ? String(attributes.stress || '') : '';
    attributes.shiny = attributes.shiny === true;
    attributes.userName = String(attributes.userName || '');
    attributes.petName = String(attributes.petName || '');
    attributes.personalMessage = String(attributes.personalMessage || '');
    attributes.current_exp = Number.isFinite(Number(attributes.current_exp)) ? Number(attributes.current_exp) : 100;
    attributes.exp_for_lvlup = Number.isFinite(Number(attributes.exp_for_lvlup)) && Number(attributes.exp_for_lvlup) > 0 ? Number(attributes.exp_for_lvlup) : 1000;
    attributes.friendship = Number.isFinite(Number(attributes.friendship)) ? Number(attributes.friendship) : 999999;
    attributes.gold = Number.isFinite(Number(attributes.gold)) ? Math.max(0, Math.trunc(Number(attributes.gold))) : 500000;
    // Special medicines are persistent integer inventory parameters. New accounts start with 50 each.
    // Yarukimin A is deprecated; discard any legacy inventory value during migration.
    delete attributes.yarukiminA;
    for (const itemKey of ['elixir', 'voltamin', 'voltaminLite', 'betaVoltamin', 'superVoltamin', 'devoMedicine', 'superDevoMedicine', 'rainbowZ', 'regularFlightTicket', 'goldenFlightTicket']) {
      attributes[itemKey] = Number.isFinite(Number(attributes[itemKey])) ? Math.max(0, Math.trunc(Number(attributes[itemKey]))) : 50;
    }
    attributes.max_friendship = Number.isFinite(Number(attributes.max_friendship)) ? Number(attributes.max_friendship) : 999999;
    // Honor is now a calculated numeric character parameter; migrate the old text placeholder.
    attributes.honor = Number.isFinite(Number(attributes.honor)) ? Number(attributes.honor) : 0;
    return attributes;
  } catch (e) { GAME_ATTRIBUTES_IS_NEW_PLAYER = true; return { ...DEFAULT_GAME_ATTRIBUTES }; }
}
let GAME_ATTRIBUTES = loadGameAttributes();
const getCharacterIndex = defs => {
  const roster = Array.isArray(defs) ? defs : [];
  const petId = String(GAME_ATTRIBUTES.petId || 'ID1').toUpperCase();
  const index = roster.findIndex(def => String(def && def.id || '').toUpperCase() === petId);
  return index >= 0 ? index : Math.max(0, roster.findIndex(def => String(def && def.id || '').toUpperCase() === 'ID1'));
};
const meguTextureKey = (id, shiny = false) => `${shiny ? 'IDX' : 'ID'}${String(id || '1').replace(/^IDX?/i, '').replace(/^0+/, '') || '1'}`;
const meguAssetPaths = (id, shiny = false) => { const key = meguTextureKey(id, shiny); return { key, image: `assets/megu/${key}.png`, json: `assets/megu/${key}.json` }; };
function persistGameAttributes() {
  try { localStorage.setItem(GAME_ATTRIBUTES_KEY, JSON.stringify(GAME_ATTRIBUTES)); } catch (e) {}
  scheduleMeguCloudSave();
}

// One-time milestone reward: one of every consumable medicine/ticket currently in MEGU.
const MEGU_CONSUMABLE_ITEM_KEYS = ['elixir', 'voltamin', 'voltaminLite', 'betaVoltamin', 'superVoltamin', 'devoMedicine', 'superDevoMedicine', 'rainbowZ', 'regularFlightTicket', 'goldenFlightTicket'];
function awardOneOfEveryConsumableItem(scene = null) {
  for (const key of MEGU_CONSUMABLE_ITEM_KEYS) {
    GAME_ATTRIBUTES[key] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[key]) || 0)) + 1;
  }
  save();
  if (scene && typeof scene.updateMedicineHud === 'function') scene.updateMedicineHud();
  return MEGU_CONSUMABLE_ITEM_KEYS.length;
}
function awardConsumableItem(key, amount = 1, scene = null) {
  const count = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!count) return 0;
  GAME_ATTRIBUTES[key] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[key]) || 0)) + count;
  save();
  if (scene && typeof scene.updateMedicineHud === 'function') scene.updateMedicineHud();
  return count;
}

// Apply exercise costs to the persistent weight and satiety attributes.
// Weight is always kept inside the active MEGU's configured bounds.
// Hygiene costs from minigames are persisted immediately and reflected on the home HUD.
function applyHygieneCost(amount, mainScene = null) {
  const current = Phaser.Math.Clamp(Number(GAME_ATTRIBUTES.hygiene) || 0, 0, 100);
  GAME_ATTRIBUTES.hygiene = Math.max(0, current - Math.max(0, Number(amount) || 0));
  GAME_ATTRIBUTES.hygieneLastUpdatedAt = new Date().toISOString();
  persistGameAttributes();
  try {
    const scene = mainScene || null;
    if (scene && typeof scene.updateGameAttributeDisplay === 'function') scene.updateGameAttributeDisplay();
  } catch (e) {}
  return GAME_ATTRIBUTES.hygiene;
}
function applyExerciseCost(weightReduction, satietyFraction, mainScene = null) {
  const configuredMin = Number(GAME_ATTRIBUTES.min_weight);
  const configuredMax = Number(GAME_ATTRIBUTES.max_weight);
  const minWeight = Number.isFinite(configuredMin) ? configuredMin : 0;
  const maxWeight = Number.isFinite(configuredMax) && configuredMax >= minWeight ? configuredMax : minWeight;
  const currentWeight = Number.isFinite(Number(GAME_ATTRIBUTES.weight)) ? Number(GAME_ATTRIBUTES.weight) : minWeight;
  // Clamp explicitly against the active MEGU's bounds after every exercise cost.
  GAME_ATTRIBUTES.weight = Math.max(minWeight, Math.min(maxWeight, currentWeight - Math.max(0, Number(weightReduction) || 0)));
  const maxSatiety = Math.max(0, Number(GAME_ATTRIBUTES.max_satiety) || 0);
  const currentSatiety = Math.max(0, Number(GAME_ATTRIBUTES.satiety) || 0);
  GAME_ATTRIBUTES.satiety = Math.max(0, Math.round(currentSatiety - maxSatiety * Phaser.Math.Clamp(Number(satietyFraction) || 0, 0, 1)));
  persistGameAttributes();
  // Refresh the home HUD while it is still underneath the minigame. The
  // home scene is resumed only after this cost has been applied.
  try {
    const scene = mainScene || (window.game && window.game.scene ? window.game.scene.getScene('default') : null);
    if (scene && typeof scene.updateGameAttributeDisplay === 'function') scene.updateGameAttributeDisplay();
  } catch (e) { console.warn('[MEGU] Could not refresh stats after exercise cost', e); }
}
