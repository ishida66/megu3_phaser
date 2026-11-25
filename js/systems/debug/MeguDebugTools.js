/* Tester-only Sumo and race debug controls. */
Object.assign(Main.prototype, {
    openSumoDebugMenu() {
      if (typeof meguHasRole !== 'function' || !meguHasRole('tester')) return;
      if (this.sumoDebugMenuObjects && this.sumoDebugMenuObjects.length) return;
      const selected = this.characterDefs && (this.characterDefs[getCharacterIndex(this.characterDefs)] || this.characterDefs[0]);
      const characterId = String(selected && selected.id || 'ID1');
      const record = getSumoCharacterStatRecord(characterId, GAME_ATTRIBUTES.shiny === true);
      const objects = [];
      this.sumoDebugMenuObjects = objects;
      const add = object => { objects.push(object); return object; };
      add(this.add.rectangle(320, 330, 500, 390, 0x21152c, 0.99).setStrokeStyle(3, 0xffe7ac).setDepth(90));
      add(this.add.text(320, 225, 'SUMO DEBUG TOOLS', { ...textStyle(20), fontStyle:'bold', color:'#fff2d6' }).setOrigin(0.5).setDepth(91));
      add(this.add.text(320, 270, `Applies to ${characterId}${GAME_ATTRIBUTES.shiny ? ' (Shiny)' : ''}`, { ...textStyle(12), color:'#ffffff' }).setOrigin(0.5).setDepth(91));
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        objects.forEach(object => { if (object && object.destroy) object.destroy(); });
        this.sumoDebugMenuObjects = null;
      };
      const makeButton = (x, y, label, color, action) => {
        const plate = add(this.add.rectangle(x, y, 205, 48, color, 1).setStrokeStyle(2, 0xffffff).setDepth(92).setInteractive({ useHandCursor:true }));
        add(this.add.text(x, y, label, { ...textStyle(13), color:'#ffffff', fontStyle:'bold', align:'center', wordWrap:{width:185} }).setOrigin(0.5).setDepth(93));
        plate.on('pointerdown', () => { if (closed) return; action(); close(); });
      };
      makeButton(205, 345, 'RESET: ALL STATS 5\nRANK: BOTTOM', 0x8a4f42, () => {
        const career = GAME_ATTRIBUTES.sumoCareer || (GAME_ATTRIBUTES.sumoCareer = {});
        career.rankIndex = 0;
        career.rankPoints = 0;
        career.promotion = null;
        career.wins = 0;
        career.losses = 0;
        career.ozekiDefeats = 0;
        record.training = { power:0, agility:0, technique:0, endurance:0 };
        delete record.debugMaxed;
        record.stats = { power:5, agility:5, technique:5, endurance:5 };
        save();
      });
      makeButton(435, 345, `MAX ALL STATS\nP/E ${getCharacterStatCap('power', characterId, GAME_ATTRIBUTES.shiny === true)} · A/T ${getCharacterStatCap('agility', characterId, GAME_ATTRIBUTES.shiny === true)}`, 0x477e55, () => {
        record.stats = { power:getCharacterStatCap('power', characterId, GAME_ATTRIBUTES.shiny === true), endurance:getCharacterStatCap('endurance', characterId, GAME_ATTRIBUTES.shiny === true), agility:getCharacterStatCap('agility', characterId, GAME_ATTRIBUTES.shiny === true), technique:getCharacterStatCap('technique', characterId, GAME_ATTRIBUTES.shiny === true) };
        save();
      });
      makeButton(205, 410, 'DEMOTE TO OZEKI', 0x8a4f42, () => {
        const career = GAME_ATTRIBUTES.sumoCareer || (GAME_ATTRIBUTES.sumoCareer = {});
        const ozekiIndex = SUMO_RANKS.findIndex(rank => rank.title === 'Ozeki' && rank.side === 'East');
        if (ozekiIndex < 0) return;
        career.rankIndex = ozekiIndex;
        career.rankPoints = 0;
        career.promotion = null;
        career.ozekiDefeats = 0;
        save();
      });
      makeButton(435, 410, 'REFRESH DAI YOKOZUNA DAILY LIMIT', 0x8a6b32, () => {
        const career = GAME_ATTRIBUTES.sumoCareer || (GAME_ATTRIBUTES.sumoCareer = {});
        career.daiYokozunaChallengeDay = '';
        save();
      });
      makeButton(320, 475, 'REFRESH BOSS RACE DAILY LIMIT', 0x8a6b32, () => {
        GAME_ATTRIBUTES.lastBossRaceDay = '';
        save();
      });
      const cancel = add(this.add.rectangle(320, 535, 130, 34, 0x65566b, 1).setStrokeStyle(1, 0xffffff).setDepth(92).setInteractive({ useHandCursor:true }));
      add(this.add.text(320, 535, 'CLOSE', { ...textStyle(11), color:'#ffffff', fontStyle:'bold' }).setOrigin(0.5).setDepth(93));
      cancel.on('pointerdown', close);
    },
});
