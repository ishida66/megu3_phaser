/* MeguAdventure: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    getAdventureEntries() {
      const root = this.cache.json.get('adventure-description') || {};
      const app = root.application || root;
      const defs = Array.isArray(app.adventure) ? app.adventure : [];
      const wantedLang = String(this.language || 'en').toLowerCase();
      return defs.map((entry, index) => {
        const localizedStrings = Array.isArray(entry && entry.strings) ? entry.strings : [];
        const selectedStrings = localizedStrings.find(item => item && String(item._lang || '').toLowerCase() === wantedLang)
          || localizedStrings.find(item => item && String(item._lang || '').toLowerCase() === 'en')
          || localizedStrings[0];
        const name = selectedStrings && selectedStrings.name;
        return {
          id: String(entry && entry.id != null ? entry.id : index + 1),
          name: String(name == null ? '' : name).trim(),
          description: String((selectedStrings && (selectedStrings.description ?? selectedStrings.desc ?? selectedStrings.detail)) ?? entry?.description ?? '').trim(),
          bgm: String(entry && typeof entry.bgm === 'string' ? entry.bgm : '').trim()
        };
      }).filter(entry => entry.name);
    },
    launchAdventureEntry(entry) {
      if (!entry || this._adventureLaunchPending) return;
      this._adventureLaunchPending = true;
      this.closeFooterMenu();
  
      // Fade only the 640px-high play area. The bottom menu/status region lives
      // below PLAY_AREA_H and must remain visible while Adventure is launched.
      let playAreaFade = null;
      const launch = () => {
        if (playAreaFade && playAreaFade.active) playAreaFade.destroy();
        playAreaFade = null;
        try {
          const adventureLaunchData = {
            adventureId: entry.id,
            adventureBgm: entry.bgm,
            playerMeguDef: (()=>{const d=this.characterDefs && (this.characterDefs[getCharacterIndex(this.characterDefs)] || this.characterDefs[0]);if(!d)return d;const p=meguAssetPaths(d.id,GAME_ATTRIBUTES.shiny===true);return {...d,logicalId:d.id,id:p.key,image:p.image,json:p.json,textureKey:p.key};})()
          };
          this.scene.launch('AdventureIntroScene', adventureLaunchData);
          this.scene.bringToTop('AdventureIntroScene');
        } catch (error) {
          this._adventureLaunchPending = false;
          console.error('[Adventure] Could not launch minigame.', error);
        }
      };
  
      if (this.add && this.tweens) {
        playAreaFade = this.add.rectangle(0, 0, W, PLAY_AREA_H, 0x000000, 0)
          .setOrigin(0, 0).setScrollFactor(0).setDepth(20000);
        this.tweens.add({
          targets: playAreaFade,
          alpha: 1,
          duration: 450,
          ease: 'Linear',
          onComplete: launch
        });
      } else launch();
    },
    openAdventureModeMenu() {
      const regularCount = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.regularFlightTicket) || 0));
      const goldenCount = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.goldenFlightTicket) || 0));
      const entries = this.getAdventureEntries();
      const objects = this.beginFooterMenu();
      const add = obj => { objects.push(obj); return obj; };
      const panelY = H / 2;
      add(this.add.rectangle(W/2, panelY, W, H, 0x080d19, .78).setDepth(40).setInteractive());
      add(this.add.rectangle(W/2, panelY, 440, 390, 0x24304f, .98).setStrokeStyle(3, 0xffd34f).setDepth(41));
      add(this.add.text(W/2, panelY-155, 'Adventure', {fontFamily:'sans-serif',fontSize:'26px',color:'#ffffff',fontStyle:'bold'}).setOrigin(.5).setDepth(42));
      add(this.add.text(W/2, panelY-112, 'Choose how to travel', {fontFamily:'sans-serif',fontSize:'16px',color:'#dce7ff'}).setOrigin(.5).setDepth(42));
  
      const makeChoice = (y, title, detail, count, color, action) => {
        const bg = add(this.add.rectangle(W/2, y, 370, 82, color, 1).setStrokeStyle(2, 0xffffff).setDepth(42).setInteractive({useHandCursor:true}));
        add(this.add.text(W/2, y-17, title, {fontFamily:'sans-serif',fontSize:'19px',color:'#ffffff',fontStyle:'bold'}).setOrigin(.5).setDepth(43));
        add(this.add.text(W/2, y+13, `${detail}  •  Tickets: ${count}`, {fontFamily:'sans-serif',fontSize:'14px',color:'#ffffff'}).setOrigin(.5).setDepth(43));
        bg.on('pointerdown', action);
        return bg;
      };
      const showMessage = message => {
        const old = objects.find(o => o && o.name === 'adventure-ticket-warning');
        if (old && old.active) old.destroy();
        const label = this.add.text(W/2, panelY+126, message, {fontFamily:'sans-serif',fontSize:'14px',color:'#ffb8a8',align:'center',wordWrap:{width:380}})
          .setOrigin(.5).setDepth(44);
        label.name = 'adventure-ticket-warning';
        objects.push(label);
      };
      makeChoice(panelY-35, 'Random destination', 'Uses 1 Flight Ticket', regularCount, 0x477ec8, () => {
        if (!entries.length) { showMessage('No adventure destinations are available.'); return; }
        if (Number(GAME_ATTRIBUTES.regularFlightTicket) < 1) { showMessage('You need 1 Flight Ticket.'); return; }
        GAME_ATTRIBUTES.regularFlightTicket = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.regularFlightTicket) || 0) - 1);
        persistGameAttributes();
        const entry = Phaser.Utils.Array.GetRandom(entries);
        this.launchAdventureEntry(entry);
      });
      makeChoice(panelY+65, 'Choose destination', 'Uses 1 Golden Flight Ticket', goldenCount, 0x9870c9, () => {
        if (!entries.length) { showMessage('No adventure destinations are available.'); return; }
        if (Number(GAME_ATTRIBUTES.goldenFlightTicket) < 1) { showMessage('You need 1 Golden Flight Ticket.'); return; }
        this.openAdventureSelectionMenu(entries);
      });
      const close = add(this.add.rectangle(W/2,panelY+155,130,36,0x606a80,1).setStrokeStyle(1,0xffffff).setDepth(42).setInteractive({useHandCursor:true}));
      add(this.add.text(close.x,close.y,'Cancel',{fontFamily:'sans-serif',fontSize:'16px',color:'#ffffff'}).setOrigin(.5).setDepth(43));
      close.on('pointerdown',()=>this.closeFooterMenu());
    },
    openAdventureSelectionMenu(entries = this.getAdventureEntries()) {
      const items = entries;
      const objects = this.beginFooterMenu({ closePickers: true });
      const scope = this.createFooterMenuScope(objects);
      const add = (object, depth = 43) => {
        object.setDepth(depth).setScrollFactor(0);
        objects.push(object);
        return object;
      };
      // The artwork owns the appearance. No legacy panels, headers or action buttons.
      const shade = add(this.add.rectangle(320, 320, 640, 640, 0x000000, .65).setInteractive(), 40);
      shade.on('pointerdown', (pointer, lx, ly, event) => event?.stopPropagation?.());
      if (this.textures.exists('menu-adventure'))
        add(this.add.image(0, 0, 'menu-adventure').setOrigin(0, 0), 41);
      else
        add(this.add.rectangle(320, 320, 640, 640, 0xf5e9d2), 41);

      let scroll = 0;
      let selected = -1;
      let locked = false;
      const rowYs = [238, 362, 484];
      const rows = rowYs.map((y, slot) => {
        // Same selectable-row treatment as the Background/Food menus.
        const hit = add(this.add.rectangle(320, y, 574, 118, 0xffd34f, .001)
          .setStrokeStyle(1, 0xffd34f, 0)
          .setInteractive({ useHandCursor: true }), 46);
        const thumb = add(this.add.image(93, y, '__DEFAULT').setVisible(false), 44);
        const fallback = add(this.add.rectangle(93, y, 104, 104, 0xb7a68e, .6), 43);
        const title = add(this.add.text(174, y - 37, '', {
          fontFamily: 'Arial, sans-serif', fontSize: '21px', color: '#3e3024', fontStyle: 'bold',
          wordWrap: { width: 415 }
        }).setOrigin(0, .5), 44);
        const detail = add(this.add.text(174, y - 13, '', {
          fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#5b4c3a',
          wordWrap: { width: 415 }
        }).setOrigin(0, 0), 44);
        MeguScrollableMenu.bindRow(this, scope, hit, {
          getIndex: () => scroll + slot, getCount: () => items.length,
          getScroll: () => scroll, setScroll: value => { scroll = value; render(); },
          visible: 3, rowHeight: 124, onSelect: index => { selected = index; render(); }
        });
        return { hit, thumb, fallback, title, detail };
      });
      const warning = add(this.add.text(320, 580, '', {
        fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#9b3325',
        backgroundColor: '#fff0d9', padding: { x: 8, y: 5 }
      }).setOrigin(.5).setVisible(false), 77);
      const showWarning = message => { warning.setText(message).setVisible(true); };
      const choose = entry => {
        if (!entry || locked) return;
        const ticket = 'goldenFlightTicket';
        if (Number(GAME_ATTRIBUTES[ticket]) < 1) {
          showWarning('You need 1 Golden Flight Ticket.');
          return;
        }
        locked = true;
        GAME_ATTRIBUTES[ticket] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[ticket]) || 0) - 1);
        persistGameAttributes();
        this.launchAdventureEntry(entry);
      };
      const render = () => {
        if (!scope.active) return;
        rows.forEach((row, slot) => {
          const entry = items[scroll + slot];
          const visible = !!entry;
          Object.values(row).forEach(object => object.setVisible(visible));
          if (!entry) return;
          row.hit.setFillStyle(0xffd34f, scroll + slot === selected ? .16 : .001);
          row.hit.setStrokeStyle(scroll + slot === selected ? 3 : 1, 0xffd34f, scroll + slot === selected ? .98 : 0);
          row.title.setText(entry.name);
          row.title.setColor('#3e3024');
          row.detail.setText(entry.description || '');
          const frame = `ADV${entry.id}`;
          const hasThumb = this.textures.exists('adventure-thumbnails')
            && this.textures.get('adventure-thumbnails').has(frame);
          row.thumb.setVisible(hasThumb);
          row.fallback.setVisible(!hasThumb);
          if (hasThumb) row.thumb.setTexture('adventure-thumbnails', frame).setDisplaySize(104, 104);
        });
      };
      const scrollbar = MeguScrollableMenu.createScrollbar(this, {
        scope, add, getCount: () => items.length, getIndex: () => scroll,
        setIndex: index => { scroll = index; render(); }, visible: 3,
        x: 618, top: 181, height: 362, depth: 73,
        wheelBounds: { left: 32, right: 608, top: 178, bottom: 544 }
      });
      // Native artwork buttons: Back (478..543, 633..682), OK (549..609, 633..682).
      const back = add(this.add.rectangle(511, 658, 66, 50, 0xffffff, .001)
        .setInteractive({ useHandCursor: true }), 80);
      back.on('pointerdown', (pointer, lx, ly, event) => {
        event?.stopPropagation?.();
        this.openAdventureModeMenu();
      });
      const ok = add(this.add.rectangle(579, 658, 60, 50, 0xffffff, .001)
        .setInteractive({ useHandCursor: true }), 80);
      ok.on('pointerdown', (pointer, lx, ly, event) => {
        event?.stopPropagation?.();
        if (selected < 0 || !items[selected]) { showWarning('Select a destination first.'); return; }
        choose(items[selected]);
      });
      render();
    },
});
