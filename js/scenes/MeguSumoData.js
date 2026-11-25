// MEGU sumo career ranks, stat caps, and per-character progression data.
// Loaded before game.js because save migration uses getCharacterStatCap().
// Career order is stored bottom-to-top: index 0 is the lowest slot and
// index 729 is the highest. Within each numbered/title rank, West precedes East.
function buildSumoRanks() {
  const ranks = [];
  const addNumberedDivision = (title, highestNumber, division=title) => {
    for (let number = highestNumber; number >= 1; number--) {
      for (const side of ['West', 'East']) {
        ranks.push({ name:`${title} ${number} ${side}`, division, title, number, side });
      }
    }
  };
  addNumberedDivision('Jonokuchi', 40);
  addNumberedDivision('Jonidan', 130);
  addNumberedDivision('Sandanme', 100);
  addNumberedDivision('Makushita', 60);
  addNumberedDivision('Juryo', 14);
  addNumberedDivision('Maegashira', 17, 'Makuuchi');
  for (const title of ['Komusubi', 'Sekiwake', 'Ozeki', 'Yokozuna']) {
    // Ozeki and Yokozuna are separate career classes, not part of Makuuchi.
    const division = title === 'Ozeki' ? 'Ozeki' : title === 'Yokozuna' ? 'Yokozuna' : 'Makuuchi';
    for (const side of ['West', 'East']) {
      ranks.push({ name:`${title} ${side}`, division, title, side });
    }
  }
  return ranks;
}
const SUMO_RANKS = buildSumoRanks();
if (SUMO_RANKS.length !== 730) console.error('[MEGU] Sumo rank table must contain exactly 730 slots; found', SUMO_RANKS.length);
function isYokozunaStatCapUnlocked(attributes = GAME_ATTRIBUTES) {
  const rankIndex = Math.max(0, Math.trunc(Number(attributes?.sumoCareer?.rankIndex) || 0));
  // Yokozuna occupies the final two slots in the 730-rank career table.
  return attributes?.sumoYokozunaUnlocked === true || rankIndex >= 728;
}
function getCharacterStatCap(statKey = 'power', characterId = null, shiny = GAME_ATTRIBUTES?.shiny === true, attributes = GAME_ATTRIBUTES) {
  if (statKey === 'power' || statKey === 'endurance') return isYokozunaStatCapUnlocked(attributes) ? 120 : 99;
  if (statKey === 'agility' || statKey === 'technique') {
    const id = String(characterId || attributes?.selectedCharacterId || 'ID1').toUpperCase();
    const characterKey = `${id}:${shiny ? 'shiny' : 'normal'}`;
    const savedRecord = attributes?.sumoCharacterStats?.[characterKey];
    const total = ['power','agility','technique','endurance'].reduce((sum, key) => sum + Math.max(0, Number(savedRecord?.stats?.[key]) || 0), 0);
    const watermelonReached = attributes?.raceWatermelonUnlocked?.[characterKey] === true || total >= 341;
    return watermelonReached ? 120 : 99;
  }
  return 99;
}
const SUMO_ARCHETYPES = {
  powerhouse:{label:'Powerhouse',primary:'power',mods:{power:20,agility:-5,technique:-3,endurance:3}},
  speedster:{label:'Speedster',primary:'agility',mods:{power:-4,agility:20,technique:3,endurance:-3}},
  technician:{label:'Technician',primary:'technique',mods:{power:-3,agility:3,technique:20,endurance:-4}},
  veteran:{label:'Veteran',primary:'endurance',mods:{power:2,agility:-3,technique:5,endurance:20}}
};
function sumoRankName(index) { return SUMO_RANKS[Phaser.Math.Clamp(Math.trunc(index||0),0,SUMO_RANKS.length-1)].name; }
function sumoStatsForRank(rankIndex, archetype, bonusRankIndex=rankIndex, training={}) {
  // The lowest rank starts with four 5-point attributes. Progression raises
  // their shared baseline smoothly to 90 at Yokozuna before training points.
  const progress = Phaser.Math.Clamp(rankIndex / Math.max(1,SUMO_RANKS.length-1),0,1);
  const base = 5 + progress * 85;
  const role = SUMO_ARCHETYPES[archetype] || SUMO_ARCHETYPES.technician;
  const keys = ['power','agility','technique','endurance'];
  const averageRoleMod = keys.reduce((sum,key)=>sum+(Number(role.mods[key])||0),0)/keys.length;
  const stats = {};
  for (const key of keys) {
    // Archetypes specialize one attribute while keeping the four-stat average
    // at the rank baseline. The small modifier avoids overpowering rank scaling.
    const roleAdjustment = ((Number(role.mods[key])||0)-averageRoleMod) * 0.45 * progress;
    const trained = Math.max(0,Math.trunc(Number(training[key])||0));
    stats[key] = Phaser.Math.Clamp(Math.round(base + roleAdjustment) + trained, 5, 99);
  }
  return stats;
}
function getSumoCharacterStatRecord(characterId, shiny=false) {
  const key = `${String(characterId || 'ID1').toUpperCase()}:${shiny ? 'shiny' : 'normal'}`;
  if (!GAME_ATTRIBUTES.sumoCharacterStats || typeof GAME_ATTRIBUTES.sumoCharacterStats !== 'object') GAME_ATTRIBUTES.sumoCharacterStats = {};
  let record = GAME_ATTRIBUTES.sumoCharacterStats[key];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    record = { stats:{power:5,agility:5,technique:5,endurance:5}, training:{power:0,agility:0,technique:0,endurance:0} };
    GAME_ATTRIBUTES.sumoCharacterStats[key] = record;
  }
  if (!record.training || typeof record.training !== 'object') record.training = {};
  if (!record.stats || typeof record.stats !== 'object') record.stats = {power:5,agility:5,technique:5,endurance:5};
  for (const stat of ['power','agility','technique','endurance']) {
    record.training[stat] = Math.max(0,Math.trunc(Number(record.training[stat])||0));
    record.stats[stat] = Phaser.Math.Clamp(Math.trunc(Number(record.stats[stat])||5),5,getCharacterStatCap(stat, characterId, shiny));
  }
  return record;
}

function sumoOpponentRankOptions(playerRank) {
  const max = SUMO_RANKS.length-1;
  return [
    {key:'ambitious',label:'Ambitious',description:'A much higher-ranked opponent',offset:Phaser.Math.Between(5,10)},
    {key:'even',label:'Competitive',description:'A nearby-ranked opponent',offset:Phaser.Math.Between(1,3)},
    {key:'favorable',label:'Favorable',description:'An equal or lower-ranked opponent',offset:Phaser.Math.Between(-2,0)}
  ].map(option=>({...option,rankIndex:Phaser.Math.Clamp(playerRank+option.offset,0,max)}));
}

