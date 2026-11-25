/* MeguVisitorInteractions: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    prepareForExternalInteraction() {
      // All menus and external controls remain locked until the full food
      // consumption sequence (including the eating animation) has completed.
      if (this.foodSequenceActive || this.foodActionActive) return false;
      return true;
    },
    setVisitorGiftPickerBlocking(blocked) {
      const visit = this.visitingHouse;
      if (!visit) return;
      if (blocked) {
        // The visitor board and leave button sit above the inventory menu in the
        // display list, so hide and disable them while a gift picker is active.
        if (visit.visitorBoardHit && visit.visitorBoardHit.active) {
          visit.visitorBoardHit.setVisible(false);
          if (visit.visitorBoardHit.input) visit.visitorBoardHit.input.enabled = false;
        }
        if (visit.quitIcon && visit.quitIcon.active) visit.quitIcon.setVisible(false);
        if (visit.quitHit && visit.quitHit.active) {
          visit.quitHit.setVisible(false);
          if (visit.quitHit.input) visit.quitHit.input.enabled = false;
        }
        if (!visit.giftPickerInputShield || !visit.giftPickerInputShield.active) {
          // This shield is above the visitor room/footer but below the picker
          // background and controls (depths 20+), so only the picker can receive
          // input while it is open.
          visit.giftPickerInputShield = this.add.zone(W / 2, CANVAS_H / 2, W, CANVAS_H)
            .setDepth(8).setScrollFactor(0).setInteractive({ useHandCursor: false });
          visit.giftPickerInputShield.on('pointerdown', (pointer, localX, localY, event) => {
            if (event && event.stopPropagation) event.stopPropagation();
          });
        }
        return;
      }
      if (visit.giftPickerInputShield && visit.giftPickerInputShield.active) {
        visit.giftPickerInputShield.destroy();
      }
      visit.giftPickerInputShield = null;
      if (visit.visitorBoardHit && visit.visitorBoardHit.active) {
        visit.visitorBoardHit.setVisible(true);
        if (visit.visitorBoardHit.input) visit.visitorBoardHit.input.enabled = true;
      }
      if (visit.quitIcon && visit.quitIcon.active) visit.quitIcon.setVisible(true);
      if (visit.quitHit && visit.quitHit.active) {
        visit.quitHit.setVisible(true);
        if (visit.quitHit.input) visit.quitHit.input.enabled = true;
      }
    },
    openVisitorGiftPicker(category) {
      if (!this.visitingHouse || this.friendHouseTransition || this.foodOpen || this.fOpen || this.visitorGiftStatusLoading) return;
      if (!['food','furniture','special'].includes(category)) return;
      const targetId = String(this.visitingHouse.house.userId || '');
      if (!targetId) { this.showMeguMessage('This house cannot receive gifts right now.', false, 0, true); return; }
  
      // Do not run a preflight RPC here. It previously raced the picker opening
      // and could immediately close it (or leave the button locked while pending).
      // The server validates inventory and recipient; there is no per-day gift cap.
      // when the player confirms an item.
      this.giftMode = category;
      this.giftTargetUserId = targetId;
      if (category === 'food') this.toggleFood(true, false, false, true);
      else this.toggleFurn(true, false, false, category === 'special', true);
    },
    async openFriendInviteMenu() {
      return this.openFriendRosterMenu('invite');
    },
    async openFriendVisitMenu() {
      return this.openFriendRosterMenu('visit');
    },
    async openFriendRosterMenu(mode) {
      if (this.visitingHouse || this.friendHouseTransition) return;
      const isVisit = mode === 'visit';
      const menuName = isVisit ? 'friend_visit' : 'friend_invite';
      const geom = (id, x, y, width, height) => {
        const v = MeguMenuLayouts.button(this, menuName, id, { x:x-width/2, y:y-height/2, width, height });
        return {x:v.x+v.width/2,y:v.y+v.height/2,width:v.width,height:v.height,
          hitX:(v.hitboxX??v.x)+(v.hitboxWidth??v.width)/2,
          hitY:(v.hitboxY??v.y)+(v.hitboxHeight??v.height)/2,
          hitWidth:v.hitboxWidth??v.width,hitHeight:v.hitboxHeight??v.height};
      };
      const objects = this.beginFooterMenu();
      const scope = this.createFooterMenuScope(objects);
      const add = object => {objects.push(object);return object;};
      add(this.add.rectangle(W/2,CANVAS_H/2,W,CANVAS_H,0x080d19,.8).setDepth(70).setScrollFactor(0).setInteractive());
      // The artwork is a top-left anchored panel, never a stretched backdrop.
      if (this.textures.exists('menu-friend')) {
        add(this.add.image(0,0,'menu-friend').setOrigin(0,0).setDepth(71).setScrollFactor(0));
      }
      const style = (size=20) => ({fontFamily:'Arial',fontSize:`${size}px`,color:'#3d3024'});
      let profiles=[],selected=null,scrollIndex=0;
      const rows = this.createFooterMenuScope(objects);
      const visibleRows=3, trackTop=178, trackHeight=366;
      const rowLayouts=MeguScrollableMenu.rows;
      let rowGestures = null;
      const clearRows=()=>{
        if (rowGestures) { rowGestures.destroy(); rowGestures = null; }
        rows.clear();
      };
      const pending=new Set();
      const loadVisible=()=>{
        let queued=false;
        profiles.slice(scrollIndex,scrollIndex+visibleRows).forEach(profile=>{
          const paths=meguAssetPaths(String(profile.petId||'ID1').toUpperCase(),profile.shiny===true);
          if(this.textures.exists(paths.key)||pending.has(paths.key))return;
          pending.add(paths.key);this.load.atlas(paths.key,paths.image,paths.json);queued=true;
        });
        if(queued){scope.listen(this.load,'complete',()=>{
          pending.clear();if(scope.active)redraw();
        },true);if(!(this.load.isLoading&&this.load.isLoading()))this.load.start();}
      };
      const redraw=()=>{
        clearRows();
        rowGestures = this.createFooterMenuScope(objects);
        const addRow=o=>rows.add(o);
        profiles.slice(scrollIndex,scrollIndex+visibleRows).forEach((profile,i)=>{
          const {thumb,desc}=rowLayouts[i];
          const chosen=selected&&selected.userId===profile.userId;
          addRow(this.add.rectangle(321,desc.y+desc.h/2,578,desc.h,0xffd34f,.001)
            .setStrokeStyle(chosen?3:1,0xc19c55,chosen?1:.25).setDepth(72).setScrollFactor(0));
          addRow(this.add.text(desc.x,desc.y,String(profile.username||''),style(20)).setDepth(74).setScrollFactor(0).setWordWrapWidth(desc.w));
          addRow(this.add.text(desc.x,desc.y+38,String(profile.petName||''),style(20)).setDepth(74).setScrollFactor(0).setWordWrapWidth(desc.w));
          const level=Number(profile.level);
          const levelText=Number.isFinite(level)&&level>0?String(Math.trunc(level)):'—';
          addRow(this.add.text(desc.x,desc.y+76,`Level: ${levelText}`,style(20)).setDepth(74).setScrollFactor(0).setWordWrapWidth(desc.w));
          const atlasKey=meguTextureKey(profile.petId,profile.shiny===true);
          if(this.textures.exists(atlasKey)&&this.textures.get(atlasKey).has(atlasKey+'_3-2x')){
            const preview=addRow(this.add.sprite(thumb.x+thumb.w/2,thumb.y+thumb.h/2,atlasKey,atlasKey+'_3-2x')
              .setOrigin(.5,.5).setDisplaySize(thumb.w,thumb.h).setDepth(74).setScrollFactor(0));
            const accessories=[];
            this.attachAccessoryToFriendThumbnail(profile,preview,accessories,objects);
            accessories.forEach(object=>rows.add(object));
          }else{
            addRow(this.add.text(thumb.x+thumb.w/2,thumb.y+thumb.h/2,'…',style(22)).setOrigin(.5).setDepth(74).setScrollFactor(0));
          }
          const rowHit = addRow(this.add.zone(321,desc.y+desc.h/2,578,desc.h)
            .setDepth(75).setScrollFactor(0).setInteractive({useHandCursor:true}));
          const rowIndex = scrollIndex + i;
          MeguScrollableMenu.bindRow(this, rowGestures, rowHit, {
            getIndex: () => rowIndex,
            getCount: () => profiles.length,
            getScroll: () => scrollIndex,
            setScroll: index => { scrollIndex = index; redraw(); loadVisible(); },
            onSelect: index => { selected = profiles[index]; redraw(); },
            visible: visibleRows
          });
        });
      };
      const rosterScrollbar = MeguScrollableMenu.createScrollbar(this, {
        scope, add, getCount: () => profiles.length, getIndex: () => scrollIndex,
        setIndex: index => { scrollIndex = index; redraw(); loadVisible(); },
        visible: visibleRows, top: trackTop, height: trackHeight, depth: 74
      });
      // Super Evolution uses button artwork embedded in its menu background.
      // Match its exact bottom hitboxes; do not draw extra button sprites.
      const buttonHitbox=(x,y,width,height,callback)=>{
        const hit=add(this.add.rectangle(x+width/2,y+height/2,width,height,0xffd34f,.001)
          .setDepth(76).setScrollFactor(0).setInteractive({useHandCursor:true}));
        hit.on('pointerover',()=>hit.setFillStyle(0xffd34f,.14));
        hit.on('pointerout',()=>hit.setFillStyle(0xffd34f,.001));
        hit.on('pointerdown',(pointer,localX,localY,event)=>{event?.stopPropagation?.();callback();});
      };
      buttonHitbox(549,633,59,49,async()=>{
        if(!selected){this.showMeguMessage('Select a player first.',false,0,true);return;}
        if(isVisit){
          const target=selected;
          try{await this.visitFriendHouse(target);}
          catch(error){if(scope.active)this.showMeguMessage(`Could not visit this house: ${String(error&&error.message||error)}`,false,0,true);}
        }else{
          const alreadyHere=(this.friendPets||[]).find(friend=>friend.userId===selected.userId);
          if(alreadyHere){this.showMeguMessage(`${alreadyHere.petName} is in the house`,false,0,true);this.closeFooterMenu();return;}
          this.addFriendPet(selected);this.closeFooterMenu();
        }
      });
      buttonHitbox(478,633,65,49,()=>this.closeFooterMenu());
      try{
        profiles=await fetchMeguPublicProfiles();
        if(!scope.active)return;
        rosterScrollbar.update();
        if(!profiles.length)this.showMeguMessage('No other registered players were found.',false,0,true);
        redraw();loadVisible();
      }catch(error){
        if(scope.active)this.showMeguMessage(`Could not load friend list: ${String(error&&error.message||error)}`,false,0,true);
      }
    },
    async visitFriendHouse(profile) {
      if(this.visitingHouse || this.friendHouseTransition) return;
      const homeBgmTrackId = this.currentJukeboxTrackId != null ? this.currentJukeboxTrackId : this.getConfiguredHouseBgmTrackId();
      this.friendHouseTransition=true;
      const camera=this.cameras&&this.cameras.main;
      const fadeCamera=show=>new Promise(resolve=>{
        if(!camera){resolve();return;}
        const event=show?'camerafadeincomplete':'camerafadeoutcomplete';
        camera.once(event,resolve);
        if(show) camera.fadeIn(350,0,0,0);
        else camera.fadeOut(350,0,0,0);
      });
      let uncommittedHostRenderer=null;
      try {
        // Keep the home scene hidden while the remote house is fetched and built.
        await fadeCamera(false);

      const house=await fetchMeguPublicHouse(profile.userId);
      const background=BG[house.bg];
      if(!background) throw new Error('The saved house background is unavailable.');
      const hostBaseDef=this.characterDefs.find(item=>String(item.id).toUpperCase()===house.petId)||{id:house.petId};
      const hostPaths=meguAssetPaths(house.petId, house.shiny === true || profile.shiny === true);
      const hostDef={...hostBaseDef,textureKey:hostPaths.key,image:hostPaths.image,json:hostPaths.json};
      const furniture=house.furn.map(object=>{
        if(object.kind==='food') return {object,item:null};
        const item=this.getFurnitureDefinitionForObject(object);
        if(!item) throw new Error(`Could not resolve furniture ${object.furnitureId||object.id||''}.`);
        return {object,item};
      });
      // Queue all room dependencies together and do not expose a partially loaded house.
      const pending=[];
      const queueImage=(key,path)=>{
        if(this.textures.exists(key))return;
        pending.push(new Promise((resolve,reject)=>{
          const complete=()=>{cleanup();this.textures.exists(key)?resolve():reject(new Error(`Missing asset: ${path}`));};
          const fail=file=>{if(file&&file.key===key){cleanup();reject(new Error(`Could not load ${path}`));}};
          const cleanup=()=>{this.load.off(`filecomplete-image-${key}`,complete);this.load.off('loaderror',fail);};
          this.load.once(`filecomplete-image-${key}`,complete);this.load.on('loaderror',fail);this.load.image(key,path);
        }));
      };
      queueImage(background.key,background.path);
      // The host character must be loaded as an atlas (image + JSON), not as a plain image.
      const hostAtlasNeeded=!this.textures.exists(hostDef.textureKey);
      if(hostAtlasNeeded)this.load.atlas(hostDef.textureKey,hostDef.image,hostDef.json);
      let furnitureAnimationQueued=false;
      furniture.forEach(({item})=>{
        if(!item)return;
        if(item.animation){
          const atlasKey=item.animationAtlasKey||`furniture-animation-atlas-${item.id}`;
          const atlasWasMissing=!this.textures.exists(atlasKey);
          this.queueFurnitureAnimation(item,false);
          if(atlasWasMissing && this.furnitureAnimationPendingKeys && this.furnitureAnimationPendingKeys.has(atlasKey)){
            furnitureAnimationQueued=true;
          }
        }
        // Keep the home room's static-image fallback available if the animation
        // atlas or its frame metadata cannot be used.
        queueImage(item.assetKey,item.assetPath);
      });
      const foodKeys=new Set(furniture.filter(x=>x.object.kind==='food').map(x=>String(x.object.key||'food-atlas-0')));
      foodKeys.forEach(key=>{
        if(this.textures.exists(key))return;
        const config=this.findTransientAtlasConfig(key);if(!config)throw new Error(`Unknown food asset set: ${key}`);
        this.load.atlas(key,config.image,config.json);
      });
      if(pending.length||hostAtlasNeeded||furnitureAnimationQueued||Array.from(foodKeys).some(key=>!this.textures.exists(key))){
        const loaderDone=new Promise(resolve=>this.load.once('complete',resolve));
        if(!(this.load.isLoading&&this.load.isLoading()))this.load.start();
        await loaderDone;
      }
      await Promise.all(pending);
      for(const key of foodKeys){if(!this.textures.exists(key))throw new Error(`Could not load food asset set: ${key}`);}
      const hostTexture=this.textures.get(hostDef.textureKey);
      if(!hostTexture||!hostTexture.has(hostDef.textureKey+'_5-2x'))throw new Error(`The host MEGU atlas ${hostDef.id} is incomplete.`);
      // Do not abort house entry when _11 is missing. The petting handler logs
      // the exact missing frame and atlas contents at the moment petting occurs.
      const bgSprite=this.add.image(0,0,background.key).setOrigin(0,0).setDisplaySize(640,640).setDepth(0.9);
      const propSprites=[];
      furniture.forEach(({object,item})=>{
        let key,frame,width,height,sprite;
        if(object.kind==='food'){
          key=String(object.key||'food-atlas-0');frame=object.frame;
          if(!this.textures.exists(key)||!frame||!this.textures.get(key).has(frame))return;
          width=Math.max(12,Number(object.displayWidth)||48);height=Math.max(12,Number(object.displayHeight)||48);
          sprite=this.add.sprite(Number(object.x)||0,(Number(object.y)||0)-height/2,key,frame);
        }else{
          const animatedReady=!!(item.animation&&this.textures.exists(item.animationAtlasKey)&&this.createFurnitureAnimation(item));
          if(animatedReady){
            key=item.animationAtlasKey;
            const texture=this.textures.get(key);
            const available=texture.getFrameNames(false);
            const firstToken=String(item.animation.list[0]==null?'':item.animation.list[0]).trim();
            frame=texture.has(firstToken)?firstToken:
              (/^\d+$/.test(firstToken)&&Number(firstToken)>=0&&Number(firstToken)<available.length?available[Number(firstToken)]:null);
            const animationFrame=frame?texture.get(frame):null;
            width=Math.max(1,Number(animationFrame&&(animationFrame.realWidth||animationFrame.width))||64);
            height=Math.max(1,Number(animationFrame&&(animationFrame.realHeight||animationFrame.height))||64);
            if(frame){
              sprite=this.add.sprite(Number(object.x)||0,(Number(object.y)||0)-height/2,key,frame);
              sprite.play(item.animationKey);
            }
          }
          if(!sprite&&this.textures.exists(item.assetKey)){
            const staticTexture=this.textures.get(item.assetKey);
            const sourceImage=staticTexture.getSourceImage?staticTexture.getSourceImage():null;
            width=Math.max(1,Number(sourceImage&&(sourceImage.naturalWidth||sourceImage.width))||64);
            height=Math.max(1,Number(sourceImage&&(sourceImage.naturalHeight||sourceImage.height))||64);
            sprite=this.add.sprite(Number(object.x)||0,(Number(object.y)||0)-height/2,item.assetKey);
          }
          if(!sprite){
            throw new Error(`Friend Visit could not render furniture ${item.id}.`);
          }
        }
        const depth=Number.isFinite(Number(object.depthOrder))?1+Number(object.depthOrder)*0.001:1.25+propSprites.length*0.001;
        sprite.setDisplaySize(width,height).setFlipX(!!object.flipX).setDepth(depth);
        propSprites.push(sprite);
      });
      const hostSpawnCandidate={x:Phaser.Math.Clamp(this.pet.x+115,0,640),y:this.pet.y};
      const hostSpawn=isInsideHomeWalkableArea(hostSpawnCandidate.x,hostSpawnCandidate.y)?hostSpawnCandidate:randomHomeWalkablePoint();
      const hostRenderer=uncommittedHostRenderer=new MeguRenderer(this,{
        atlasKey:hostDef.textureKey,framePrefix:hostDef.textureKey,x:hostSpawn.x,y:hostSpawn.y,
        depth:4.14,state:MeguRenderer.STATES.STANDING_1,
        shadow:{widthRatio:.62,height:13,yOffset:3,color: 0x101010,alpha: 0.27}
      });
      hostRenderer.setScale(this.characterSprite?this.characterSprite.scaleX:1,this.characterSprite?this.characterSprite.scaleY:1);
      hostRenderer.update();
      // Keep the existing hostBase alias for hit testing and accessory placement;
      // all character layers and the ground shadow are owned by MeguRenderer.
      const hostBase=hostRenderer.sprite;
      const hostAccessories = Array.isArray(house.accessories) && house.accessories.length
        ? house.accessories : (Array.isArray(profile.accessories) ? profile.accessories : (profile.accessory ? [profile.accessory] : []));
      const hostPetTarget={key:hostDef.textureKey,petId:hostDef.id,shiny:house.shiny===true || profile.shiny===true,accessories:hostAccessories,x:hostBase.x,y:hostBase.y,targetX:hostBase.x,targetY:hostBase.y,look:Math.random()<.5?-1:1,walkFrameToggle:false,nextMoveStepAt:0,nextWanderAt:this.time.now+Phaser.Math.Between(700,1800),nextIdleFacingAt:0,idleStillUntil:0,nextIdleStillAt:this.time.now+Phaser.Math.Between(18000,35000),idleStillMirror:false,sprite:hostBase,renderer:hostRenderer,isVisitorHost:true,petPoseToken:0,petPoseUntil:0,petPoseFrame:null};
      // Swap the home HUD for a compact visitor-room header and information bar.
      const homeUiObjects = [
        this.goldHudIcon, this.goldHudText, this.elixirHudIcon, this.elixirHudText,
        ...(this.topStatusHud || []).flatMap(item => [item.label, item.bar]),
        this.voltageIcon, this.baseStats, ...(this.baseStatsTextObjects || []),
        ...(this.baseStatsPageDots || []), this.bottomBar,
        this.careMenuButton, this.outingMenuButton, this.storeMenuButton, this.optionsMenuButton, this.meguMenuButton,
        this.setSatietyZeroButton, this.setHealthZeroButton, this.resetLevelFriendshipButton,
        this.giveAllInventoryDebugButton, this.clearInventoryAndHousesDebugButton,
        this.addFiftyLevelsFriendshipDebugButton, this.meguAdminButton
      ].filter(Boolean);
      homeUiObjects.forEach(object => {
        if (!object || !object.active) return;
        object.setVisible(false);
        // Hide AND disable the home navigation hitboxes for the entire visit.
        if (object.input) object.input.enabled = false;
      });
      const roomLayout = (id, x, y, width, height) => MeguMenuLayouts.button(this, 'friend_visit_room', id, { x, y, width, height });
      const visitBarLayout = roomLayout('visit_bar', 0, 644, W, 200);
      const visitBar=this.add.image(visitBarLayout.x,visitBarLayout.y,'visit-bar').setOrigin(0,0).setDisplaySize(visitBarLayout.width,visitBarLayout.height).setDepth(5.95);
      const ownerName=String(house.username || profile.username || 'MEGU Friend');
      const visitorPetName=String(house.petName || profile.petName || 'MEGU');
      const ownerMessage=String(house.message || profile.message || ['Welcome to my house!','Please make yourself at home!','Thanks for visiting!'][Phaser.Math.Between(0,2)]);
      const visitInfoStyle={fontFamily:'Arial, sans-serif',fontSize:'22px',fontStyle:'bold',color:'#FFFFFF',stroke:'#806F5A',strokeThickness:5,padding:{x:1,y:1}};
      const visitOwnerText=this.add.text(roomLayout('owner_label',18,662,220,22).x,roomLayout('owner_label',18,662,220,22).y,`Owner: ${ownerName}`,visitInfoStyle).setDepth(6.1).setScrollFactor(0);
      const visitPetText=this.add.text(roomLayout('pet_label',18,718,220,22).x,roomLayout('pet_label',18,718,220,22).y,`MEGU: ${visitorPetName}`,visitInfoStyle).setDepth(6.1).setScrollFactor(0);
      const visitMessageText=this.add.text(roomLayout('message_label',18,774,220,22).x,roomLayout('message_label',18,774,220,22).y,`Message: ${ownerMessage}`,{...visitInfoStyle,fontSize:'18px',fontStyle:'normal',wordWrap:{width:220}}).setDepth(6.1).setScrollFactor(0);
      const visitorGiftButtons = [];
      const giftPositions = { food: 235, furniture: 375, special: 515 };
      [
        { x: 235, label: 'GIFT FOOD', category: 'food' },
        { x: 375, label: 'GIFT FURNITURE', category: 'furniture' },
        { x: 515, label: 'GIFT ITEMS', category: 'special' }
      ].forEach(({x,label,category}) => {
        const b=roomLayout('gift_'+category,x-55,759,110,42);
        const bx=b.x+b.width/2,by=b.y+b.height/2;
        const button=this.add.rectangle(bx, by, b.width, b.height, 0xffd76a, 0.98).setStrokeStyle(2,0x806f5a).setDepth(7.2).setScrollFactor(0);
        const text=this.add.text(bx,by,label,{fontFamily:'Arial, sans-serif',fontSize:'11px',fontStyle:'bold',color:'#493522',align:'center'}).setOrigin(.5).setDepth(7.3).setScrollFactor(0);
        const hit=this.add.zone((b.hitboxX??b.x)+(b.hitboxWidth??b.width)/2,(b.hitboxY??b.y)+(b.hitboxHeight??b.height)/2,b.hitboxWidth??b.width,b.hitboxHeight??b.height).setDepth(7.4).setScrollFactor(0).setInteractive({useHandCursor:true});
        hit.on('pointerdown',(pointer,localX,localY,event)=>{if(event&&event.stopPropagation)event.stopPropagation();this.openVisitorGiftPicker(category);});
        visitorGiftButtons.push(button,text,hit);
      });
      const visitorBoardIndex=house.furn.findIndex(object=>object&&this.getFurnitureDefinitionForObject(object)?.boardFlag===true);
      let visitorBoardHit=null;
      if(visitorBoardIndex>=0){const boardObject=house.furn[visitorBoardIndex];visitorBoardHit=this.add.zone(Number(boardObject.x)||320,(Number(boardObject.y)||430)-231,608,462).setDepth(90).setInteractive({useHandCursor:true});visitorBoardHit.on('pointerdown',()=>{if(!this.isUnifiedMenuBlockingHomeInput())this.openMessageBoardUi(true);});}
      const quitLayout=roomLayout('quit',560,558,64,64);
      const quitIcon=this.add.image(quitLayout.x+quitLayout.width/2,quitLayout.y+quitLayout.height/2,'visit-back-button').setDisplaySize(quitLayout.width,quitLayout.height).setDepth(91).setScrollFactor(0);
      const quitHit=this.add.zone((quitLayout.hitboxX??554)+(quitLayout.hitboxWidth??76)/2,(quitLayout.hitboxY??552)+(quitLayout.hitboxHeight??76)/2,quitLayout.hitboxWidth??76,quitLayout.hitboxHeight??76).setDepth(92).setScrollFactor(0).setInteractive({useHandCursor:true});
      quitHit.on('pointerdown',()=>this.leaveFriendHouse());
      const roomTitle=roomLayout('house_title',12,14,300,20);
      const title=this.add.text(roomTitle.x,roomTitle.y,`${visitorPetName}'s house`,{fontFamily:'Arial, sans-serif',fontSize:'16px',fontStyle:'bold',color:'#FFFFFF',stroke:'#000000',strokeThickness:4,padding:{x:1,y:1}}).setOrigin(0,0).setDepth(89).setScrollFactor(0);
      // A visitor room is a single-player viewing session: dismiss every invited
      // MEGU from the local house and remove its Part Ways control before entry.
      this.dismissFriendPets();
      this.pendingMeguMessage = null;
      if (this.meguMessageDeferredTimer) { this.meguMessageDeferredTimer.remove(false); this.meguMessageDeferredTimer = null; }
      if (this.meguMessageTimer) { this.meguMessageTimer.remove(false); this.meguMessageTimer = null; }
      if (this.meguMessageContainer && this.meguMessageContainer.active) this.meguMessageContainer.destroy(true);
      this.meguMessageContainer = null;
      this.visitorGiftStatusLoading = false;
      this.visitingHouse={house,bgSprite,propSprites,hostRenderer,hostBase,hostPetTarget,visitBar,visitOwnerText,visitPetText,visitMessageText,visitorGiftButtons,visitorBoardHit,quitIcon,quitHit,title,homeUiObjects,homeBgmTrackId};
      uncommittedHostRenderer=null;
      this.closeFooterMenu();
      const visitingBgmTrackId = this.getConfiguredHouseBgmTrackId(house.furn);
      await this.playJukeboxTrack(visitingBgmTrackId);
      if (this.meguRenderer) this.meguRenderer.setBodyVisible(true);
      // Allow a full render while the camera is black, then validate the room.
      await new Promise(resolve=>this.time.delayedCall(80,resolve));
      const renderedVisit=this.visitingHouse;
      if(!renderedVisit || !renderedVisit.bgSprite.active || !renderedVisit.hostRenderer || !renderedVisit.hostRenderer.layer || !renderedVisit.hostRenderer.layer.active || renderedVisit.propSprites.some(sprite=>!sprite.active)) {
        throw new Error('The visitor room did not finish rendering correctly.');
      }
      await fadeCamera(true);
    
      } catch(error) {
        if(uncommittedHostRenderer)uncommittedHostRenderer.destroy();
        const partial=this.visitingHouse;
        try { await this.playJukeboxTrack(homeBgmTrackId); } catch (bgmError) { console.warn('[MEGU] Could not restore home BGM after failed visit:', bgmError); }
        if(partial) {
          [partial.bgSprite,...partial.propSprites,this.visitorHostAccessorySprite,partial.visitBar,partial.visitOwnerText,partial.visitPetText,partial.visitMessageText,partial.visitorBoardHit,partial.quitIcon,partial.quitHit,partial.giftPickerInputShield,partial.title]
            .forEach(object=>{if(object&&object.active)object.destroy();});
          if(partial.hostRenderer)partial.hostRenderer.destroy();
          this.visitingHouse=null;
          this.ensureRoomDirt();
          this.updateHygieneEffects(this.game.loop.time);
          (partial.homeUiObjects||[]).forEach(object=>{
            if(!object||!object.active)return;
            object.setVisible(true);
            if(object.input)object.input.enabled=true;
          });
        }
        await fadeCamera(true);
        throw error;
      } finally {
        this.friendHouseTransition=false;
      }
    },
    async giftSelectedInventoryItem(category, itemId) {
      if (!this.visitingHouse || !this.giftMode || this.visitorGiftTransferActive) return;
      const targetId = this.giftTargetUserId;
      const id = String(itemId);
      let available = 0;
      if (category === 'food') available = this.getFoodInventoryCount(id);
      else if (category === 'furniture') available = this.getFurnitureInventoryCount(id);
      else if (category === 'special') available = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[id]) || 0));
      if (available < 1) { this.showMeguMessage('You no longer have that item.', false, 0, true); return; }
      this.visitorGiftTransferActive = true;
      try {
        const foodDef = category === 'food'
          ? (this.foodDescriptionById?.get(id) || this.foodDefs?.find(item => String(item.id) === id))
          : null;
        const giftFriendshipReward = category === 'food' ? Math.max(0, Math.trunc(Number(foodDef?.nutrition) || 0)) : 0;
        await transferMeguGift(targetId, category, id, 1);
        // Award the sender on their next return home. This is recorded only after
        // the server confirms the gift transaction, and does not depend on the
        // recipient claiming or successfully receiving the item.
        if (giftFriendshipReward > 0) {
          GAME_ATTRIBUTES.pending_outgoing_gift_food_friendship =
            Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.pending_outgoing_gift_food_friendship) || 0)) + giftFriendshipReward;
          save();
        }
        if (category === 'food') this.removeFoodFromInventory(id, 1);
        else if (category === 'furniture') this.removeFurnitureFromInventory(id, 1);
        else GAME_ATTRIBUTES[id] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[id]) || 0) - 1);
        save();
        // Close the picker before rebuilding any inventory UI. Rebuilding the
        // special-item/furniture picker after its last item was removed could
        // leave the visitor scene with only its background visible.
        if (category === 'food' && this.foodOpen) this.toggleFood(false);
        else if (this.fOpen) this.toggleFurn(false);
        // Explicitly restore the visitor-room controls and input shield state.
        this.setVisitorGiftPickerBlocking(false);
        this.updateMedicineHud();
        const senderPetName = String(GAME_ATTRIBUTES.petName || '').trim() || 'MEGU';
        const visitingPetName = String(this.visitingHouse?.house?.petName || this.visitingHouse?.profile?.petName || 'MEGU').trim() || 'MEGU';
        let giftedItemName = id;
        if (category === 'food') {
          const definition = foodDef || this.foodDescriptionById?.get(id);
          giftedItemName = String(definition?.name || `Food ${id}`);
        } else if (category === 'furniture') {
          const record = this.furnitureRecordsById?.get(String(id).trim().toLowerCase());
          giftedItemName = String(record?.name || `Furniture ${id}`);
        } else if (category === 'special') {
          const definition = (this.specialStoreDefs || []).find(item => String(item.itemName) === id);
          giftedItemName = String(definition?.name || `Item ${id}`);
        }
        this.showMeguMessage(`${senderPetName} gave ${giftedItemName} to ${visitingPetName}. Hope they like it.`, false, 0, true, true);
      } catch (error) {
        const giftErrorText = String(error && (error.message || error.details || error.hint || error.code) || 'Could not send the gift.');
        console.error('[MEGU] Gift transfer failed:', { message: giftErrorText, code: error && error.code, details: error && error.details, hint: error && error.hint, error });
        this.showMeguMessage(giftErrorText, false, 0, true);
      } finally {
        this.visitorGiftTransferActive = false;
      }
    },
    async leaveFriendHouse() {
      if (this.messageBoardUi) this.messageBoardUi.close();
      const visit=this.visitingHouse;
      if(!visit || this.friendHouseTransition) return;
      if (this.foodOpen) this.toggleFood(false);
      if (this.fOpen) this.toggleFurn(false);
      this.giftMode = null; this.giftTargetUserId = null; this.visitorGiftTransferActive = false;
      this.visitorGiftStatusLoading = false;
      this.friendHouseTransition=true;
      const camera=this.cameras&&this.cameras.main;
      const fadeCamera=show=>new Promise(resolve=>{
        if(!camera){resolve();return;}
        const event=show?'camerafadeincomplete':'camerafadeoutcomplete';
        camera.once(event,resolve);
        if(show) camera.fadeIn(350,0,0,0);
        else camera.fadeOut(350,0,0,0);
      });
      try {
        await fadeCamera(false);
        [visit.bgSprite,...visit.propSprites,this.visitorHostAccessorySprite,visit.visitBar,visit.visitOwnerText,visit.visitPetText,visit.visitMessageText,...(visit.visitorGiftButtons||[]),visit.visitorBoardHit,visit.quitIcon,visit.quitHit,visit.giftPickerInputShield,visit.title]
          .forEach(object=>{if(object&&object.active)object.destroy();});
        if(visit.hostRenderer)visit.hostRenderer.destroy();
        this.visitingHouse=null;
        this.ensureRoomDirt();
        this.updateHygieneEffects(this.game.loop.time);
        try { await this.playJukeboxTrack(visit.homeBgmTrackId); }
        catch (bgmError) {
          console.warn('[MEGU] Could not restore configured home BGM; falling back to default:', bgmError);
          await this.playJukeboxTrack(null);
        }
        (visit.homeUiObjects||[]).forEach(object=>{
          if(!object||!object.active)return;
          object.setVisible(true);
          if(object.input)object.input.enabled=true;
        });
        (this.friendPets||[]).forEach(friend=>{
          if(!friend.renderer||friend.renderer.destroyed)return;
          friend.renderer.setVisible(true);
          friend.renderer.setShadowVisible(true);
        });
        await new Promise(resolve=>this.time.delayedCall(80,resolve));
        await fadeCamera(true);
        this.completeStressAction('visitFriend');
        this.applyPendingOutgoingGiftFoodFriendship();
      } finally {
        this.friendHouseTransition=false;
        this.syncMeguMenuVisibility();
      }
    },

  // Ownership moved from the furniture inventory module.
    applyPendingOutgoingGiftFoodFriendship() {
      const pending = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES.pending_outgoing_gift_food_friendship) || 0));
      if (!pending) return 0;
      // Clear and persist together with the friendship update so a later home
      // entry cannot replay the same successful gift transaction.
      GAME_ATTRIBUTES.pending_outgoing_gift_food_friendship = 0;
      this.addFriendship(pending, 'gift-food');
      save();
      const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
      const atlasKey = activeDef ? meguTextureKey(activeDef.id, GAME_ATTRIBUTES.shiny === true) : 'ID1';
      const atlas = this.textures.exists(atlasKey) ? this.textures.get(atlasKey) : null;
      this.petClickFrame = atlas
        ? ([`${atlasKey}_11-2x`, `${atlasKey}_11`].find(frame => atlas.has(frame)) || null)
        : null;
      this.petClickUntil = this.time.now + 2000;
      this.joyUntil = this.time.now + 2000;
      if (this.audioUnlocked && this.cache.audio.exists('pet-sfx')) {
        this.sound.play('pet-sfx', { volume: this.sfxVolume });
      }
      this.popHeart(null, pending);
      return pending;
    },
    applyPendingGiftFoodFriendship() {
      const pending = Array.isArray(GAME_ATTRIBUTES.pending_gift_food_friendship)
        ? GAME_ATTRIBUTES.pending_gift_food_friendship : [];
      if (!pending.length || !Array.isArray(this.foodDefs) || !this.foodDefs.length) return 0;
      let friendship = 0;
      const remaining = [];
      for (const gift of pending) {
        const id = String(gift?.id ?? '');
        const quantity = Math.max(1, Math.trunc(Number(gift?.quantity) || 1));
        const food = this.foodDescriptionById?.get(id)
          || this.foodDefs.find(item => String(item.id) === id);
        const nutrition = Math.max(0, Number(food?.nutrition) || 0);
        if (nutrition > 0) friendship += nutrition * quantity;
        else remaining.push({ id, quantity });
      }
      GAME_ATTRIBUTES.pending_gift_food_friendship = remaining;
      if (friendship > 0) this.addFriendship(friendship, 'gift-food');
      else persistGameAttributes();
      return friendship;
    }
});
