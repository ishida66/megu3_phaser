// Home-scene per-frame update responsibilities extracted from Main.update().
// Loaded after game.js; methods retain Main scene context through prototype mixin.

Object.assign(Main.prototype, {
  updateVisitorHouseHost(time) {
    if (this.visitingHouse && this.visitingHouse.hostRenderer && this.visitingHouse.hostRenderer.layer && this.visitingHouse.hostRenderer.layer.active) {
      const visit=this.visitingHouse,renderer=visit.hostRenderer,host=renderer.sprite,friend=visit.hostPetTarget;
      const textureKey=friend && friend.key ? friend.key : renderer.atlasKey;
      const texture=this.textures.exists(textureKey)?this.textures.get(textureKey):null;
      if(friend&&texture){
        renderer.setDepth(4+(friend.y-400)*0.01);
        this.syncAccessoryForSprite(this,host,'visitorHostAccessorySprite',renderer.layer.depth+0.003,friend.accessories||[]);
        const petting=friend.petPoseUntil>time&&!!friend.petPoseFrame&&texture.has(friend.petPoseFrame);
        if(petting){
          if(renderer.state!==MeguRenderer.STATES.HAPPY)renderer.setState(MeguRenderer.STATES.HAPPY);
          friend._standing=false;friend._idleStill=false;
        }else{
          friend.petPoseUntil=0;friend.petPoseFrame=null;
          if(Math.hypot(friend.targetX-friend.x,friend.targetY-friend.y)<=0.5){
            if(time>=friend.nextWanderAt){
              const wanderPoint=randomHomeWalkablePoint();
              friend.targetX=wanderPoint.x;friend.targetY=wanderPoint.y;
              friend.nextWanderAt=time+Phaser.Math.Between(1800,4200);
            }
          }
          const dx=friend.targetX-friend.x,dy=friend.targetY-friend.y,d=Math.hypot(dx,dy);
          const moving=d>0.5;
          let movedThisStep=false;
          if(moving){
            if(!friend.nextMoveStepAt||time>=friend.nextMoveStepAt){
              const stepSize=2;
              const distance=Math.min(d,stepSize);
              const nextX=friend.x+dx/d*distance,nextY=friend.y+dy/d*distance;
              if(!isInsideHomeWalkableArea(nextX,nextY)){
                friend.targetX=friend.x;friend.targetY=friend.y;friend.nextWanderAt=time+Phaser.Math.Between(1800,4200);
              }else{
                friend.x=nextX;friend.y=nextY;
                movedThisStep=true;
              }
              friend.look=Math.sign(dx)||friend.look;
              friend.walkFrameToggle=!friend.walkFrameToggle;
              friend.nextMoveStepAt=time+500;
              if(distance>=d-0.001){friend.x=friend.targetX;friend.y=friend.targetY;friend.nextWanderAt=time+Phaser.Math.Between(1800,4200);}
            }
          }else{
            friend.nextMoveStepAt=time+500;
          }
          const facingDistance=Math.hypot(friend.targetX-friend.x,friend.targetY-friend.y);
          const idleForFacing=facingDistance<=0.5;
          if(idleForFacing){
            if(!friend.nextIdleFacingAt)friend.nextIdleFacingAt=time+Phaser.Math.Between(1200,3500);
            if(time>=friend.nextIdleFacingAt){friend.look=friend.look<0?1:-1;friend.nextIdleFacingAt=time+Phaser.Math.Between(1200,3500);}
          }else friend.nextIdleFacingAt=0;
          const idleEligible=!moving;
          const hasStill=renderer.hasState(MeguRenderer.STATES.HAPPY);
          if(!friend.nextIdleStillAt)friend.nextIdleStillAt=time+Phaser.Math.Between(18000,35000);
          if(friend.idleStillUntil&&(time>=friend.idleStillUntil||!idleEligible)){
            friend.idleStillUntil=0;friend.nextIdleStillAt=time+Phaser.Math.Between(18000,35000);
          }
          if(!friend.idleStillUntil&&time>=friend.nextIdleStillAt){
            if(idleEligible&&hasStill){friend.idleStillUntil=time+Phaser.Math.Between(4000,6500);friend.idleStillMirror=Math.random()<0.5;}
            else friend.nextIdleStillAt=time+Phaser.Math.Between(18000,35000);
          }
          const idleStill=!!friend.idleStillUntil&&time<friend.idleStillUntil&&idleEligible&&hasStill;
          if(moving){
            if(renderer.animation!=='walking'||!renderer.manualAnimation)renderer.playAnimation('walking',{manual:true});
            else if(movedThisStep)renderer.advanceAnimationFrame();
          }else if(idleStill){
            if(renderer.state!==MeguRenderer.STATES.HAPPY)renderer.setState(MeguRenderer.STATES.HAPPY);
          }else if(renderer.animation!=='standing'||renderer.manualAnimation){
            renderer.playAnimation('standing');
          }
          if(!moving&&!idleStill)friend._standing=true;
          else friend._standing=false;
          friend._idleStill=idleStill;
          renderer.setFlipX(idleStill?((friend.look>0)!==friend.idleStillMirror):(friend.look>0));
        }
        if(!renderer.isMovementLocked())renderer.setPosition(friend.x,friend.y);
        friend.x=host.x;friend.y=host.y;

      }
    }
  },
  updateHomeTransitionGate(time) {
    if (this.evolutionTransition && this.evolutionTransition.active) {
      this.updateEvolutionTransition(time);
      return true;
    }
    return false;
  },
  updateHomeAmbientVoice(time) {
    if (!this.levelUpRewardState && !this.stressCelebrationActive && !this.editMode && !this.menuOpen && this.audioUnlocked && this.nextMeguVoiceAt != null && time >= this.nextMeguVoiceAt) {
      this.playRandomMeguVoice(time);
    }
  },
  updateHomeFoodCompletion(time) {
    if (this.foodActionActive && time >= this.foodAnimationUntil) {
      this.foodActionActive = false;
      this.foodAnimationUntil = 0;
      if (this.foodSequenceStage === 'eating') {
        // Celebrate only after the full eating animation completes. Force the
        // large heart asset here; normal petting keeps its 60/30/10 random mix.
        if (this.foodStressBonus > 0) this.beginStressCelebration(this.foodTotalFriendshipReward, 'heart-l');
        else this.popHeart('heart-l');
        this.foodStressBonus = 0; this.foodTotalFriendshipReward = 0;
        this.foodSequenceStage = 'idle';
        this.foodSequenceActive = false;
        this.foodSequenceItem = null;
        // Feeding must always return the home renderer to its normal visible
        // body state. Other UI flows can hide the body sprite independently
        // of the renderer container, so restoring the container alone is not
        // sufficient.
        this.syncMeguMenuVisibility();
        this.clickMoveActive = false;
        this.nextMoveStepAt = time + 500;
        this.releaseUnusedFoodAtlases();
      }
    }
  },
  updateHomeBackground() {
    const preferredBackground = BG[GAME_ATTRIBUTES.bg];
    const B = (preferredBackground && this.textures.exists(preferredBackground.key) ? preferredBackground : null) ||
      BG.find(item => item && this.textures.exists(item.key));
    if (this.roomBg && B && this.textures.exists(B.key)) this.roomBg.setTexture(B.key).setDisplaySize(640, 640).setVisible(true);
    const bgg = this.bgg; bgg.clear();
    const fb = this.fb, ff = this.ff; fb.clear(); ff.clear();
  },
  cleanupHomeFurnitureSprites() {
    // Keep room props as sprites. Food selected from the Food menu can also be
    // stored as a persistent furniture-like object with its own atlas/frame.
    while (this.furnitureSprites.length > GAME_ATTRIBUTES.furn.length) this.furnitureSprites.pop().destroy();
    while (this.furniturePositionLabels.length > GAME_ATTRIBUTES.furn.length) {
      const label = this.furniturePositionLabels.pop();
      if (label && label.active) label.destroy();
    }
    while (this.furnitureAnimationFrameLabels.length > GAME_ATTRIBUTES.furn.length) {
      const label = this.furnitureAnimationFrameLabels.pop();
      if (label && label.active) label.destroy();
    }
  },
  renderHomeFurniture() {
    // The same explicit bottom-to-top order controls rendering, hit-testing and
    // the numeric debug ranks. It is deliberately independent of GAME_ATTRIBUTES.furn order/Y.
    const furnitureDepthByItem = this.getFurnitureDepthMap();
    const furnitureDepthIndexByItem = this.editMode
      ? new Map(this.furnitureDepthOrder.map((item, index) => [item, index]))
      : null;
    GAME_ATTRIBUTES.furn.forEach((q, i) => {
      const isFoodProp = q && q.kind === 'food';
      let item;
      let textureKey;
      let frameName;
      let displayWidth;
      let displayHeight;
      let tintFoodFallback = false;
      if (isFoodProp) {
        textureKey = q.key || 'food-atlas-0';
        frameName = q.frame;
        const textureExists = this.textures.exists(textureKey) && frameName && this.textures.get(textureKey).has(frameName);
        if (!textureExists) {
          textureKey = '__DEFAULT';
          frameName = undefined;
          tintFoodFallback = true;
        }
        displayWidth = Math.max(12, Number(q.displayWidth) || 48);
        displayHeight = Math.max(12, Number(q.displayHeight) || 48);
        item = { width: displayWidth, height: displayHeight };
      } else {
        item = this.getFurnitureDefinitionForObject(q);
        if (item) {
          if (item.animation) {
            this.queueFurnitureAnimation(item, true);
            const animationReady = this.textures.exists(item.animationAtlasKey) && this.anims.exists(item.animationKey);
            // Always prepare the standalone PNG as a fallback while the
            // animation atlas/sequence is unavailable, including atlas load
            // failures (not only malformed frame metadata).
            if (!animationReady && !this.textures.exists(item.assetKey)) {
              this.queueFurnitureImage(item, true);
            }
          } else {
            this.queueFurnitureImage(item, true);
          }
          const animatedReady = !!(item.animation && this.textures.exists(item.animationAtlasKey) && this.anims.exists(item.animationKey));
          textureKey = animatedReady ? item.animationAtlasKey : (this.textures.exists(item.assetKey) ? item.assetKey : '__DEFAULT');
          if (animatedReady) {
            const animationTexture = this.textures.get(textureKey);
            const animationFrames = animationTexture.getFrameNames(false);
            const firstToken = String(item.animation.list[0] == null ? '' : item.animation.list[0]).trim();
            frameName = animationTexture.has(firstToken)
              ? firstToken
              : (/^\d+$/.test(firstToken) && Number(firstToken) < animationFrames.length
                ? animationFrames[Number(firstToken)]
                : animationFrames[0]);
            // Animated furniture dimensions come from its own atlas JSON frame
            // metadata (sourceSize when trimmed), never the thumbnail atlas.
            const animationFrame = animationTexture.get(frameName);
            displayWidth = Math.max(1, Number(animationFrame && (animationFrame.realWidth || animationFrame.width)) || 64);
            displayHeight = Math.max(1, Number(animationFrame && (animationFrame.realHeight || animationFrame.height)) || 64);
          } else {
            frameName = undefined;
            // Static furniture dimensions come directly from the full-resolution
            // furniture PNG, not from the thumbnail atlas metadata.
            const furnitureTexture = this.textures.exists(item.assetKey) ? this.textures.get(item.assetKey) : null;
            const sourceImage = furnitureTexture && furnitureTexture.getSourceImage ? furnitureTexture.getSourceImage() : null;
            displayWidth = Math.max(1, Number(sourceImage && (sourceImage.naturalWidth || sourceImage.width)) || 64);
            displayHeight = Math.max(1, Number(sourceImage && (sourceImage.naturalHeight || sourceImage.height)) || 64);
          }
        } else {
          textureKey = '__DEFAULT';
          frameName = undefined;
          displayWidth = 48;
          displayHeight = 48;
          tintFoodFallback = true;
        }
      }
      // Furniture dimensions are taken from their actual PNG or animation JSON.
      // Food props retain their separately configured display dimensions.
      let sprite = this.furnitureSprites[i];
      if (!sprite) {
        sprite = this.add.sprite(q.x, q.y - displayHeight / 2, textureKey, frameName);
        this.furnitureSprites[i] = sprite;
      }
      const useAnimatedTexture = !isFoodProp && item && item.animation &&
        this.textures.exists(item.animationAtlasKey) && this.anims.exists(item.animationKey);
      // Do not call setTexture with a fixed frame on every render pass for an
      // animated sprite; that would continually reset its current animation frame.
      if (sprite.texture.key !== textureKey || (!useAnimatedTexture && sprite.frame.name !== frameName)) {
        sprite.setTexture(textureKey, frameName);
      }
      sprite.setPosition(q.x, q.y - displayHeight / 2)
        .setDisplaySize(displayWidth, displayHeight)
        .setFlipX(!!q.flipX)
        .setAlpha(1)
        .setTint(tintFoodFallback ? 0xffd34f : 0xffffff)
        // All furniture rendering follows the explicit bottom-to-top array.
        // Depth does not jump when an object moves across Y or when another is clicked.
        .setDepth(furnitureDepthByItem.get(q) ?? 0.2)
        .setVisible(!this.visitingHouse);
      if (useAnimatedTexture) {
        this.createFurnitureAnimation(item);
        if (sprite.anims && (!sprite.anims.currentAnim || sprite.anims.currentAnim.key !== item.animationKey)) sprite.play(item.animationKey);
      }

      // Animated furniture frame debug labels are intentionally disabled.

      // Item-name / coordinate debug labels are intentionally omitted in furniture edit mode.
      const debugLabel = this.furniturePositionLabels[i];
      if (debugLabel && debugLabel.active) debugLabel.setVisible(false);
    });
    this.g.clear();
  },
  updateHomePetMovement(time) {
    const step = Math.floor(time / 500), beat = step % 2;
    if (step !== this.lastStep) {
      this.lastStep = step;
      const foodApproach = this.foodSequenceActive && this.foodSequenceStage === 'approaching';
      const can = !this.bathMode && !this.editMode && Number(GAME_ATTRIBUTES.health) > 0 && !this.movementStopped && !this.foodActionActive && !this.foodSequenceActive;
      if ((this.movementStopped && !foodApproach) || this.foodActionActive || (this.foodSequenceActive && !foodApproach)) {
        this.target.x = this.pet.x; this.target.y = this.pet.y; this.wander = false;
      }
      if (can && Math.hypot(this.target.x - this.pet.x, this.target.y - this.pet.y) <= 0.5 && Math.random() < 0.1) {
        const wanderPoint = randomHomeWalkablePoint();
        this.target.x = wanderPoint.x;
        this.target.y = wanderPoint.y;
        this.wander = true;
      }
    }
    // Move in discrete, small increments on a short timer instead of smooth per-frame motion.
    const foodApproach = this.foodSequenceActive && this.foodSequenceStage === 'approaching';
    if (this.movementStopped && !foodApproach) { this.target.x = this.pet.x; this.target.y = this.pet.y; this.wander = false; }
    const canMove = !(this.levelUpCelebrationUntil && time < this.levelUpCelebrationUntil) && !this.stressCelebrationActive && !this.accessoryPickerOpen && !this.accessoryEditorOpen && !this.bathMode && !this.editMode && (Number(GAME_ATTRIBUTES.health) > 0 || foodApproach) && (!this.movementStopped || foodApproach) && !this.foodActionActive && (!this.foodSequenceActive || foodApproach) && !(this.petClickUntil && time < this.petClickUntil);
    const dx = this.target.x - this.pet.x, dy = this.target.y - this.pet.y, d = Math.hypot(dx, dy);
    if (canMove && d > 0.5) {
      if (!this.nextMoveStepAt || time >= this.nextMoveStepAt) {
        const stepSize = (this.wander ? 4 : 12) * (this.clickMoveActive ? 2 : 1) * 0.5;
        const distance = Math.min(d, stepSize);
        const nextX=this.pet.x+dx/d*distance, nextY=this.pet.y+dy/d*distance;
        if(!isInsideHomeWalkableArea(nextX,nextY)){
          this.target.x=this.pet.x; this.target.y=this.pet.y; this.wander=false; this.clickMoveActive=false;
        } else {
          this.pet.x=nextX; this.pet.y=nextY; this.look = Math.sign(dx);
        }
        // Toggle the walking frame exactly when a discrete movement step occurs.
        this.walkFrameToggle = !this.walkFrameToggle;
        if (this.meguRenderer && this.meguRenderer.animation === 'walking') this.meguRenderer.advanceAnimationFrame();
        this.nextMoveStepAt = time + (this.clickMoveActive ? 250 : 500);
        if (distance >= d - 0.001) this.clickMoveActive = false;
      }
    } else {
      this.nextMoveStepAt = time + 500;
      if (!this.editMode && (d <= 0.5 || !canMove)) {
        if (d <= 0.5) { this.pet.x = this.target.x; this.pet.y = this.target.y; this.wander = false; this.clickMoveActive = false; }
      }
    }

  },
  updateHomePetFacing(time) {
    // Randomly change MEGU's facing while stationary or being petted. Movement
    // still determines the facing direction, and the randomized interval avoids
    // a predictable rhythm. No visible hitbox/debug rectangle is drawn.
    const facingDistance = Math.hypot(this.target.x - this.pet.x, this.target.y - this.pet.y);
    const isIdleForFacing = facingDistance <= 0.5 && !this.clickMoveActive && !this.wander;
    const facingBusy = this.bathMode || this.editMode || this.foodActionActive || this.foodSequenceActive;
    const idleStillInProgress = !!this.idleStillUntil && time < this.idleStillUntil;
    const randomFacingAllowed = !facingBusy && !idleStillInProgress && (this.pettingActive || isIdleForFacing);
    if (randomFacingAllowed) {
      if (!this.nextIdleFacingAt) this.nextIdleFacingAt = time + Phaser.Math.Between(1200, 3500);
      if (time >= this.nextIdleFacingAt) {
        this.look = this.look < 0 ? 1 : -1;
        this.nextIdleFacingAt = time + Phaser.Math.Between(1200, 3500);
      }
    } else {
      this.nextIdleFacingAt = 0;
    }

  },
  renderHomeCharacter(time, delta) {
    const g = this.g;
    const r = 42, k = r / 84;
    const col = FALLBACK_CHARACTER[1];
    this.finishFoodApproachIfArrived(this.foodActionToken);
    const joy = time < this.joyUntil;
    const mood = joy ? 2 : 0;
    // Keep the character completely still while idle: no bounce or side-to-side sway.
    const bounce = 0;
    const sway = 0;
    const px = this.pet.x, py = this.pet.y - r;
    // No on-screen SFX debug label.
    // Do not render the character's internal ID/name label behind MEGU.
    if (this.characterNameText) this.characterNameText.setVisible(false);

    // Ground shadow is owned exclusively by MeguRenderer; do not draw a second one here.
    const activeDef = this.characterDefs && this.characterDefs[getCharacterIndex(this.characterDefs)];
    // The renderer's atlas is authoritative. Reconstructing a key from the
    // character ID can disagree with custom textureKey entries and make the
    // legacy fallback hide the renderer body while leaving its shadow alive.
    const atlasKey = this.meguRenderer && !this.meguRenderer.destroyed && this.meguRenderer.atlasKey
      ? this.meguRenderer.atlasKey
      : (activeDef ? meguTextureKey(activeDef.id, GAME_ATTRIBUTES.shiny === true) : 'ID1');
    const approachMoving = this.foodSequenceActive && this.foodSequenceStage === 'approaching';
    // Zero-HEALTH incapacitation is suspended while MEGU is going to eat.
    // This lets the character use its normal walking frames to reach the food.
    const healthIncapacitated = Number(GAME_ATTRIBUTES.health) <= 0 && !approachMoving;
    const moving = Math.hypot(this.target.x - this.pet.x, this.target.y - this.pet.y) > 1 && !healthIncapacitated && (!this.movementStopped || approachMoving) && !this.foodActionActive && (!this.foodSequenceActive || approachMoving);
    const clicked = !!this.petClickUntil && time < this.petClickUntil;
    const foodFrame = atlasKey + '_10-2x';
    const foodPose = this.foodActionActive && time < this.foodAnimationUntil && this.textures.exists(atlasKey) && this.textures.get(atlasKey).has(foodFrame);
    const stillFrame = atlasKey + '_11-2x';
    const hasStillFrame = !!(this.textures.exists(atlasKey) && this.textures.get(atlasKey).has(stillFrame));
    const petClickFrameActive = !!(clicked && this.petClickFrame && this.textures.exists(atlasKey) && this.textures.get(atlasKey).has(this.petClickFrame));
    if (!clicked) this.petClickFrame = null;
    const baseScreenForStill = !this.editMode && !this.menuOpen && !this.bOpen && !this.fOpen && !this.foodOpen && !this.footerMenuOpen;
    const idleEligibleForStill = !healthIncapacitated && baseScreenForStill && !moving && !clicked && !this.pettingActive && !this.foodActionActive && !this.foodSequenceActive;
    if (!this.nextIdleStillAt) this.nextIdleStillAt = time + Phaser.Math.Between(18000, 35000);
    if (this.idleStillUntil && (time >= this.idleStillUntil || !idleEligibleForStill)) {
      this.idleStillUntil = 0;
      this.nextIdleStillAt = time + Phaser.Math.Between(18000, 35000);
    }
    if (!this.idleStillUntil && time >= this.nextIdleStillAt) {
      if (idleEligibleForStill && hasStillFrame) {
        // Base duration is about five seconds; add natural timing variation.
        this.idleStillUntil = time + Phaser.Math.Between(4000, 6500);
        this.idleStillMirror = Math.random() < 0.5;
      } else {
        // If the pet is busy (or this character has no frame 11), try again later.
        this.nextIdleStillAt = time + Phaser.Math.Between(18000, 35000);
      }
    }
    const idleStillActive = !!this.idleStillUntil && time < this.idleStillUntil && idleEligibleForStill && hasStillFrame;
    const lowSatietyFrame = atlasKey + '_9-2x';
    const incapacitatedFrame = lowSatietyFrame;
    const lowSatietyIdle = !healthIncapacitated && !moving && !clicked && !foodPose && !idleStillActive &&
      Number(GAME_ATTRIBUTES.satiety) < 100 && this.textures.exists(atlasKey) && this.textures.get(atlasKey).has(lowSatietyFrame);
    const frameA = moving ? atlasKey + '_3-2x' : atlasKey + '_5-2x';
    const frameB = moving ? atlasKey + '_4-2x' : atlasKey + '_6-2x';
    // Walking frames toggle only when the character's position is updated.
    // Idle poses retain their independent, time-based standing animation.
    const walkFrame = this.walkFrameToggle ? frameA : frameB;
    const idleFrame = Math.floor(time / 500) % 2 ? frameA : frameB;
    const celebrationFrameCandidates = [atlasKey + '_10-2x', atlasKey + '_10'];
    const celebrationFrame = this.textures.exists(atlasKey)
      ? celebrationFrameCandidates.find(frame => this.textures.get(atlasKey).has(frame)) : null;
    const levelUpCelebrationActive = !!this.levelUpCelebrationUntil && time < this.levelUpCelebrationUntil && !!celebrationFrame;
    if (this.levelUpCelebrationUntil && time >= this.levelUpCelebrationUntil) this.levelUpCelebrationUntil = 0;
    let baseFrame = moving ? walkFrame : idleFrame;
    if (clicked && hasStillFrame) baseFrame = stillFrame;
    if (idleStillActive) baseFrame = stillFrame;
    if (lowSatietyIdle) baseFrame = lowSatietyFrame;
    if (petClickFrameActive) baseFrame = this.petClickFrame;
    if (foodPose) baseFrame = foodFrame;
    if (levelUpCelebrationActive) baseFrame = celebrationFrame;
    if (healthIncapacitated && this.textures.exists(atlasKey) && this.textures.get(atlasKey).has(incapacitatedFrame)) baseFrame = incapacitatedFrame;
    // Character name/ID label intentionally disabled on the home screen.
    const homeRendererSprite = this.meguRenderer && !this.meguRenderer.destroyed
      ? this.meguRenderer.sprite : null;
    if (homeRendererSprite && homeRendererSprite.active && this.textures.exists(atlasKey)) {
      // Keep the legacy alias synchronized with the renderer-owned sprite.
      this.characterSprite = homeRendererSprite;
      // The home scene decides gameplay state and position; MeguRenderer owns
      // frame selection, standing animation, blinking, and emotional pose locks.
      const characterFlipX = idleStillActive ? ((this.look > 0) !== this.idleStillMirror) : (this.look > 0);
      const characterDepth = 4 + (this.pet.y - 400) * 0.01;
      let requestedState = null;
      if (healthIncapacitated || lowSatietyIdle) requestedState = MeguRenderer.STATES.VERY_SAD;
      else if (levelUpCelebrationActive || foodPose) requestedState = MeguRenderer.STATES.VERY_HAPPY;
      else if (petClickFrameActive) {
        const match = String(this.petClickFrame || '').match(/_(9|10|11|12|13)(?:-2x)?$/);
        requestedState = ({9:MeguRenderer.STATES.VERY_SAD,10:MeguRenderer.STATES.VERY_HAPPY,11:MeguRenderer.STATES.HAPPY,12:MeguRenderer.STATES.WORRIED,13:MeguRenderer.STATES.SAD})[Number(match && match[1])] || MeguRenderer.STATES.HAPPY;
      } else if (clicked && hasStillFrame || idleStillActive) requestedState = MeguRenderer.STATES.HAPPY;

      const emotional = requestedState && MeguRenderer.EMOTIONAL_STATES.has(requestedState);
      if (!emotional) {
        if (moving) this.meguRenderer.playAnimation('walking', { manual: true });
        else this.meguRenderer.playAnimation('standing', { frameDuration: 500 });
        this.meguRenderer.setPosition(px, this.pet.y);
      } else {
        // Set the lock at the current home position before applying the pose.
        if (!this.meguRenderer.isMovementLocked()) this.meguRenderer.setPosition(px, this.pet.y);
        this.meguRenderer.setState(requestedState);
      }
      this.meguRenderer.setFlipX(characterFlipX);
      this.meguRenderer.setRotation(healthIncapacitated ? Math.PI / 2 : 0);
      this.meguRenderer.setDepth(characterDepth);
      this.syncMeguMenuVisibility();
      this.meguRenderer.update(time, delta);
      this.syncAccessoryForSprite(this, homeRendererSprite, 'accessoryHomeSprite', characterDepth + 0.03);
    } else if (!this.editMode && !homeRendererSprite) {
      // Only draw the legacy fallback when no renderer exists. Do not hide a
      // live renderer's body merely because a reconstructed atlas key or
      // compatibility alias is temporarily unavailable; its shadow is a
      // separate display object and would otherwise remain on its own.
      drawBody(g, px, py, r, col);
      g.fillStyle(col).fillEllipse(px - r * 0.45, py + r * 0.85, r * 0.5, r * 0.25).fillEllipse(px + r * 0.45, py + r * 0.85, r * 0.5, r * 0.25);
    }
    const ex = r * 0.38, ey = py - r * 0.255;
    if (!(this.characterSprite && this.textures.exists(atlasKey))) {
    g.lineStyle(5 * k, 0x222222);
    if (mood > 0) {
      [-1, 1].forEach(s => { g.beginPath(); g.arc(px + s * ex, ey + 4 * k, 11 * k, Math.PI, Math.PI * 2); g.strokePath(); });
    } else {
      g.fillStyle(0xffffff); [-1, 1].forEach(s => g.fillCircle(px + s * ex, ey, 14 * k));
      g.fillStyle(0x222222); [-1, 1].forEach(s => g.fillCircle(px + s * ex + this.look * 3 * k, ey + 2 * k, 7 * k));
    }
    g.lineStyle(5 * k, 0x222222); g.beginPath();
    if (mood === 2) g.fillStyle(0x7a2a2a).fillEllipse(px, py + r * 0.3, r * 0.5, r * 0.4);
    else g.arc(px, py + r * 0.255, r * 0.3, 0.15, Math.PI - 0.15);
    g.strokePath();
    if (mood > 0) { g.fillStyle(0xff7a9c, 0.6); [-1, 1].forEach(s => g.fillCircle(px + s * r * 0.65, py + r * 0.255, 10 * k)); }
    }


  },
});
