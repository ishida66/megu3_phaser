// Invited friend MEGU pets: spawning, interaction, feeding, movement, and cleanup.
// Loaded after game.js; methods are mixed into Main.prototype to preserve scene context.
Object.assign(Main.prototype, {
  addFriendPet(profile) {
    // Never spawn invited visitors while visiting another player's house or
    // while the room transition is in progress.
    if (this.visitingHouse || this.friendHouseTransition) return false;
    if (!profile || !profile.userId || profile.userId === (meguAuthUser && meguAuthUser.id)) return false;
    if (!this.friendPets) this.friendPets = [];
    if (!this.friendPetInvitePending) this.friendPetInvitePending = new Set();
    const alreadyHere=this.friendPets.find(friend=>friend.userId===profile.userId);
    if (alreadyHere) {
      this.showMeguMessage(`${alreadyHere.petName} is in the house`,false,0,true);
      return false;
    }
    if (this.friendPetInvitePending.has(profile.userId)) return false;
    this.friendPetInvitePending.add(profile.userId);
    const id = String(profile.petId || 'ID1').toUpperCase();
    const renderKey = meguTextureKey(id, profile.shiny === true);
    const key = renderKey;
    const create = () => {
      this.friendPetInvitePending.delete(profile.userId);
      // Recheck after asynchronous atlas loading to prevent duplicate creation.
      const existing=this.friendPets.find(friend=>friend.userId===profile.userId);
      if(existing){this.showMeguMessage(`${existing.petName} is in the house`,false,0,true);return;}
      if (!this.textures.exists(key) || !this.textures.get(key).has(key+'_5-2x')) return;
      const index = this.friendPets.length;
      const x = Phaser.Math.Clamp(this.pet.x + (index%2 ? 105 : -105), 55, 585);
      const y = Phaser.Math.Clamp(this.pet.y + 28 + Math.floor(index/2)*25, 455, 625);
      const baseDepth=4+(y-400)*0.01;
      // Invited home visitors use the shared renderer for body, eyes, blinking,
      // and their size-aware ground shadow. Keep sprite aliases for existing
      // hit-testing, accessory placement, and petting code.
      const renderer = new MeguRenderer(this, {
        atlasKey: renderKey, framePrefix: renderKey, x, y, depth: baseDepth,
        state: MeguRenderer.STATES.STANDING_1,
        shadow: { widthRatio: 0.62, height: 13, yOffset: 3, color: 0x101010, alpha: 0.27 }
      });
      const sprite = renderer.sprite;
      const friend = {userId:profile.userId,username:profile.username,petName:profile.petName,petId:id,key:renderKey,shiny:profile.shiny===true,x,y,targetX:x,targetY:y,look:Math.random()<.5?-1:1,renderer,sprite,accessories:Array.isArray(profile.accessories) ? profile.accessories : (profile.accessory ? [profile.accessory] : []),following:false,followOffset:{x:0,y:0},walkToggle:false,nextStep:0,food:null,foodUntil:0,petPoseUntil:0,petPoseFrame:null};
      // Give the friend its own pointer target. The scene-level fallback below also
      // checks sprite bounds, but this handler avoids the room tap stealing the press.
      sprite.setInteractive();
      sprite.on('pointerdown',(pointer,localX,localY,event)=>{
        if(event&&event.stopPropagation)event.stopPropagation();
        if(this.levelUpRewardState)return;
        const uiOpen=!!(this.foodOpen||this.menuOpen||this.bOpen||this.fOpen||this.accessoryPickerOpen||this.accessoryEditorOpen||this.editMode||this.footerMenuOpen||this.evolutionPickerObjects);
        if(uiOpen||this.foodSequenceActive||this.foodActionActive)return;
        this.beginFriendPetting(pointer,friend);
      });
      this.friendPets.push(friend);
      this.updateFriendPartWaysButton();
      if (this.audioUnlocked && this.cache.audio.exists('friend-join-sfx')) this.sound.play('friend-join-sfx',{volume:this.sfxVolume});
      this.showMeguMessage(`${friend.petName} joined`, false, 0, true);
      this.completeStressAction('inviteFriend');
    };
    const friendPaths=meguAssetPaths(id, profile.shiny === true);
    if (this.textures.exists(friendPaths.key)) { create(); return; }
    const def = this.characterDefs.find(item => String(item.id).toUpperCase() === id)
      || {id};
    this.load.atlas(friendPaths.key,friendPaths.image,friendPaths.json);
    this.load.once('complete',create);
    if (!(this.load.isLoading && this.load.isLoading())) this.load.start();
    return true;
  },
  hitFriendPet(pointer) {
    if (!this.friendPets || !pointer) return null;
    // Resolve overlapping friends from front to back, using each rendered sprite's
    // actual bounds rather than a small fixed circle near its feet.
    const ordered=[...this.friendPets].filter(friend=>friend.sprite&&friend.sprite.active)
      .sort((a,b)=>(b.sprite.depth||0)-(a.sprite.depth||0));
    for (const friend of ordered) {
      const bounds=friend.sprite.getBounds();
      const padX=Math.max(12,bounds.width*.08),padY=Math.max(10,bounds.height*.06);
      if(pointer.x>=bounds.x-padX&&pointer.x<=bounds.right+padX&&
         pointer.y>=bounds.y-padY&&pointer.y<=bounds.bottom+padY)return friend;
    }
    return null;
  },
  updateFriendPartWaysButton() {
    if (!this.friendPets || !this.friendPets.length) {
      if (this.partWaysButton) { this.partWaysButton.destroy(); this.partWaysButton=null; }
      if (this.partWaysHit) { this.partWaysHit.destroy(); this.partWaysHit=null; }
      return;
    }
    if (!this.partWaysButton || !this.partWaysButton.active) {
      this.partWaysButton=this.add.text(12,612,'Part Ways',{fontFamily:'Arial',fontSize:'14px',fontStyle:'bold',color:'#ffffff',backgroundColor:'#8d493f',padding:{x:9,y:6}}).setDepth(32).setScrollFactor(0);
      this.partWaysHit=this.add.zone(64,625,110,36).setDepth(33).setScrollFactor(0).setInteractive({useHandCursor:true});
      this.partWaysHit.on('pointerdown',()=>this.dismissFriendPets());
    }
  },
  dismissFriendPets() {
    (this.friendPets || []).forEach(friend=>{
      if(friend.renderer&&!friend.renderer.destroyed)friend.renderer.destroy();
      [this[`friendAccessory_${friend.userId}`],friend.food&&friend.food.sprite,friend.food&&friend.food.shadow].forEach(object=>{if(object&&object.active)object.destroy();});
      this[`friendAccessory_${friend.userId}`] = null;
      if(friend.food&&friend.food.tween)friend.food.tween.stop();
      this.stopFriendEatingSound(friend.food);
    });
    this.friendPets=[];
    this.updateFriendPartWaysButton();
  },
  feedFriendPets(item) {
    const friends=this.friendPets || [];
    // Alternate only across friends that actually receive a projectile. Using
    // the raw array index can repeat a side when an inactive friend is skipped.
    let launchedCount=0;
    friends.forEach((friend)=>{
      if (!friend.sprite || !friend.sprite.active) return;
      const slot=launchedCount++;
      const side=slot%2===0?-1:1;
      const row=Math.floor(slot/2);
      const targetX=Phaser.Math.Clamp(friend.x + side*(85 + Math.floor(row/2)*30),45,595);
      const targetY=Phaser.Math.Clamp(500 + row*18,465,625);
      const startX=side<0?-24:W+24;
      const hasFrame=this.textures.exists(item.key)&&this.textures.get(item.key).has(item.frame);
      const sprite=hasFrame?this.add.sprite(startX,500,item.key,item.frame).setOrigin(.5).setDepth(25):this.add.circle(startX,500,14,0xffd34f).setDepth(25);
      if(hasFrame){
        const frame=this.textures.get(item.key).get(item.frame);
        const scale=frame?Math.min(42/Math.max(1,frame.width),42/Math.max(1,frame.height)):1;
        sprite.setScale(scale*2);
      } else sprite.setScale(2);
      const shadow=this.add.ellipse(startX,510,62,15,0x000000,.24).setDepth(2.5);
      const flight={t:0};
      const tween=this.tweens.add({targets:flight,t:1,duration:900,ease:'Sine.inOut',onUpdate:()=>{
        const t=flight.t,xx=startX+(targetX-startX)*t;
        sprite.setPosition(xx,500-45*Math.sin(Math.PI*t));shadow.setPosition(xx,510);
      },onComplete:()=>{
        if(!friend.sprite||!friend.sprite.active){sprite.destroy();shadow.destroy();return;}
        friend.food={sprite,shadow,targetX,targetY,phase:'approach',tween:null};
        friend.following=false;friend.targetX=targetX;friend.targetY=targetY;
      }});
      friend.food={sprite,shadow,targetX,targetY,phase:'throw',tween};
    });
  },
  playFriendEatingSound(friend, foodState) {
    if (!friend || !foodState || !this.audioUnlocked) return;
    const foodSound = this.sound.add('food-sfx', { volume: this.sfxVolume });
    foodState.audio = foodSound;
    const cleanupFoodSound = () => {
      if (foodState.audio === foodSound) foodState.audio = null;
      foodSound.off('complete', onFoodComplete);
      foodSound.destroy();
    };
    const onFoodComplete = () => {
      cleanupFoodSound();
      if (!this.friendPets || !this.friendPets.includes(friend) || friend.food !== foodState || foodState.phase !== 'eating') return;
      foodState.happyDelay = this.time.delayedCall(300, () => {
        foodState.happyDelay = null;
        if (!this.friendPets || !this.friendPets.includes(friend) || friend.food !== foodState || foodState.phase !== 'eating') return;
        const digits = String(friend.petId || '').match(/\d+/);
        const id = digits ? String(Number(digits[0])) : '';
        const size = this.meguSizesById.get(id) || '1';
        const happyKey = size === '3' ? 'happy3-sfx' : size === '2' ? 'happy2-sfx' : 'happy1-sfx';
        this.sound.play(happyKey, { volume: this.sfxVolume });
      });
    };
    foodSound.once('complete', onFoodComplete);
    foodSound.play();
  },
  stopFriendEatingSound(foodState) {
    if (!foodState) return;
    if (foodState.happyDelay) { foodState.happyDelay.remove(false); foodState.happyDelay = null; }
    if (foodState.audio) {
      foodState.audio.off('complete');
      if (foodState.audio.isPlaying) foodState.audio.stop();
      foodState.audio.destroy();
      foodState.audio = null;
    }
  },
  updateFriendPets(time) {
    if (this.stressCelebrationActive || this.visitingHouse || this.accessoryPickerOpen || this.accessoryEditorOpen || !this.friendPets || !this.friendPets.length) return;
    this.friendPets.forEach((friend,index)=>{
      const renderer=friend.renderer;
      if (!renderer || renderer.destroyed || !friend.sprite || !friend.sprite.active) return;
      if (friend.food && friend.food.phase==='eating') {
        if (time>=friend.foodUntil) { this.stopFriendEatingSound(friend.food); friend.food.phase='done'; friend.food=null; }
      }
      if (friend.food && friend.food.phase==='approach') {
        friend.targetX=friend.food.targetX;friend.targetY=friend.food.targetY;
      } else if (friend.following) {
        friend.targetX=Phaser.Math.Clamp(this.pet.x+friend.followOffset.x,45,595);
        friend.targetY=Phaser.Math.Clamp(this.pet.y+friend.followOffset.y,455,630);
      } else if (!friend.food && this.pettingActive && this.friendPettingTarget===friend) {
        // Keep the friend being petted stationary; don't let its random-wander
        // target pull it away while the player is rubbing it.
        friend.targetX=friend.x;friend.targetY=friend.y;
      } else if (!friend.food && Math.random()<0.002) {
        friend.targetX=Phaser.Math.Clamp(friend.x+Phaser.Math.Between(-65,65),45,595);
        friend.targetY=Phaser.Math.Clamp(friend.y+Phaser.Math.Between(-25,25),455,630);
      }
      const dx=friend.targetX-friend.x,dy=friend.targetY-friend.y,d=Math.hypot(dx,dy);
      const moving=d>2 && (!friend.food || friend.food.phase==='approach');
      let positionChanged=false;
      if(moving && time>=friend.nextStep){
        const step=Math.min(d,6);friend.x+=dx/d*step;friend.y+=dy/d*step;
        friend.look=Math.sign(dx)||friend.look;friend.walkToggle=!friend.walkToggle;friend.nextStep=time+260;
        positionChanged=true;
      } else if(!moving && !friend.food) friend.nextStep=time+300;
      const key=friend.key,texture=this.textures.exists(key)?this.textures.get(key):null;
      if(!texture)return;
      if(friend.food && friend.food.phase==='approach' && d<=7){
        friend.food.phase='eating';friend.food.sprite.destroy();friend.food.shadow.destroy();friend.foodUntil=time+3500;
        this.playFriendEatingSound(friend, friend.food);
      }

      const baseDepth=4+(friend.y-400)*0.01;
      if(positionChanged)renderer.setPosition(friend.x,friend.y);
      renderer.setFlipX(friend.look>0);
      renderer.setDepth(baseDepth);

      if(friend.food && friend.food.phase==='eating') {
        renderer.setState(MeguRenderer.STATES.VERY_HAPPY);
      } else if(friend.petPoseUntil>time && friend.petPoseFrame) {
        const suffix=String(friend.petPoseFrame).match(/_(9|10|11|12|13)(?:-2x)?$/);
        const poseState=({9:MeguRenderer.STATES.VERY_SAD,10:MeguRenderer.STATES.VERY_HAPPY,11:MeguRenderer.STATES.HAPPY,12:MeguRenderer.STATES.WORRIED,13:MeguRenderer.STATES.SAD})[Number(suffix&&suffix[1])];
        if(!poseState || !renderer.setState(poseState))renderer.setState(MeguRenderer.STATES.STANDING_1);
      } else {
        friend.petPoseUntil=0;friend.petPoseFrame=null;
        if(moving){
          renderer.playAnimation('walking',{manual:true});
          if(positionChanged)renderer.advanceAnimationFrame();
        } else {
          renderer.playAnimation('standing',{frameDuration:550});
        }
      }
      // Renderer owns the eye overlay/blink and shadow; accessories remain a
      // separate layer above the complete character renderer.
      this.syncAccessoryForSprite(this, friend.sprite, `friendAccessory_${friend.userId}`, baseDepth + 0.003, friend.accessories || []);
    });
  },
  beginFriendPetting(pointer, friend) {
    if (!pointer || this.accessoryPickerOpen || this.accessoryEditorOpen || !friend || !friend.sprite || !friend.sprite.active || this.bathMode || this.evolutionPickerObjects || this.editMode) return;
    this.endPetting();
    this.friendPettingTarget=friend;
    this.pettingActive=true;
    this.pettingMoveMs=0;
    this.pettingLastPointer={x:pointer.x,y:pointer.y,time:this.time.now,inside:true};
    const canvas=this.game&&this.game.canvas;
    if(canvas){this.pettingPreviousCursor=canvas.style.cursor||'';if(this.input&&typeof this.input.setDefaultCursor==='function')this.input.setDefaultCursor('none');canvas.style.cursor='none';}
    if(this.pettingHandSprite)this.pettingHandSprite.destroy();
    this.pettingHandSprite=this.textures&&this.textures.exists('petting-hand-cursor')
      ?this.add.image(pointer.x,pointer.y,'petting-hand-cursor').setOrigin(.08,.08).setScale(.5).setDepth(100000).setScrollFactor(0):null;
  },
  isFriendPetHit(pointer, friend) {
    if(!pointer||!friend||!friend.sprite||!friend.sprite.active)return false;
    const bounds=friend.sprite.getBounds();
    const padX=Math.max(10,bounds.width*.06),padY=Math.max(8,bounds.height*.04);
    return pointer.x>=bounds.x-padX&&pointer.x<=bounds.x+bounds.width+padX&&pointer.y>=bounds.y-padY&&pointer.y<=bounds.y+bounds.height+padY;
  },
  actFriendPet(friend) {
    if(!friend||!friend.sprite||!friend.sprite.active||!friend.renderer||friend.renderer.destroyed)return;
    if(this.audioUnlocked&&this.cache.audio.exists('pet-sfx'))this.sound.play('pet-sfx',{volume:this.sfxVolume});
    const visitorHost=!!friend.isVisitorHost;
    // In another player's house the host MEGU must always use its own _11
    // petting frame. Do not let the critical-petting roll select _10 there.
    // The 5% _10 critical animation remains enabled for invited friend pets
    // in the player's own house.
    const critical=!visitorHost&&Math.random()<.05;
    const atlas=this.textures.exists(friend.key)?this.textures.get(friend.key):null;
    const candidates=visitorHost
      ?[friend.key+'_11-2x',friend.key+'_11']
      :(critical
        ?[friend.key+'_10-2x',friend.key+'_10']
        :[friend.key+'_11-2x',friend.key+'_11']);
    friend.petPoseFrame=atlas?candidates.find(frame=>atlas.has(frame))||null:null;
    friend.petPoseUntil=this.time.now+1000;
    if(visitorHost){
      ++friend.petPoseToken;
      if(!friend.petPoseFrame){
        const available=atlas?atlas.getFrameNames().filter(name=>String(name).includes('_11')):[];
        console.error('[MEGU] VISITOR PETTING FRAME MISSING — refusing to use standing fallback.',{atlasKey:friend.key,requestedFrames:candidates,available11Frames:available,allFrames:atlas?atlas.getFrameNames():[],currentFrame:friend.sprite.frame&&friend.sprite.frame.name});
        friend.petPoseUntil=0;
        return;
      }
      if(!friend.renderer.hasState(MeguRenderer.STATES.HAPPY)){
        console.error('[MEGU] VISITOR PETTING FRAME MISSING — renderer has no _11 frame.',{atlasKey:friend.key,requestedFrames:candidates});
        friend.petPoseUntil=0;
        return;
      }
      friend.renderer.setState(MeguRenderer.STATES.HAPPY);
    }else if(!friend.petPoseFrame){
      friend.petPoseFrame=friend.key+'_5-2x';
    }
    const heartKey=Math.random()<.6?'heart-s':(Math.random()<.75?'heart-m':'heart-l');
    if(this.textures.exists(heartKey)){
      const heart=this.add.image(friend.x,friend.y-100,heartKey).setOrigin(.5).setScale(.5).setDepth(8);
      this.tweens.add({targets:heart,y:friend.y-170,alpha:0,duration:900,onComplete:()=>heart.destroy()});
    }
  }
});
