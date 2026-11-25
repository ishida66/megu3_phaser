/* MeguUiLifecycle: Main-scene methods extracted from game.js. */
Object.assign(Main.prototype, {
    isUnifiedMenuBlockingHomeInput() {
      // A modal's own hit areas remain interactive; only Home/room actions
      // must be blocked. Do not rely on event.stopPropagation alone: Phaser's
      // scene-level input listeners can still receive the same pointer event.
      return !!(this.footerMenuOpen || this.accessoryPickerOpen ||
        this.accessoryEditorOpen || this.foodOpen || this.fOpen ||
        this.bOpen || this.menuOpen || this.evolutionPickerObjects ||
        this.medicineConfirmationObjects || this.jukeboxMenuOpen ||
        this.messageBoardUi || this.levelUpRewardState);
    },
    syncMeguMenuVisibility() {
      const renderer = this.meguRenderer;
      if (!renderer || renderer.destroyed) return;
      // The local player's MEGU remains present while visiting a friend's house;
      // only hide the home renderer during the fade transition itself. The host
      // has a separate renderer owned by the visitor-room lifecycle.
      const homeVisible = !this.friendHouseTransition;
      const layerVisible = homeVisible && !this.editMode &&
        !this.accessoryPickerOpen && !this.accessoryEditorOpen;
      renderer.setVisible(layerVisible);
      // The shadow is a separate display object from the renderer container,
      // so it must follow the same lifecycle visibility explicitly.
      renderer.setShadowVisible(layerVisible && !this.isEvolutionAnimating);
      renderer.setBodyVisible(layerVisible && !this.menuOpen && !this.bOpen &&
        !this.fOpen && !this.foodOpen && !this.footerMenuOpen);
      renderer.setEyesVisible(layerVisible && !this.menuOpen);
    } ,
    destroyUiObjects(objects, { removeListeners = false, destroyInactive = false } = {}) {
      const uniqueObjects = Array.from(new Set(Array.isArray(objects) ? objects : []));
      uniqueObjects.forEach(object => {
        if (!object) return;
        try { if (object.disableInteractive) object.disableInteractive(); } catch (e) {}
        if (removeListeners) {
          try { if (object.removeAllListeners) object.removeAllListeners(); } catch (e) {}
        }
        try {
          if ((destroyInactive || object.active) && object.destroy) object.destroy();
        } catch (e) {}
      });
      return uniqueObjects.length;
    } ,
    openStandardPicker(flag, { prepare = true, allow = null, closeFooter = true } = {}) {
      if (this[flag]) return false;
      if (typeof allow === 'function' && !allow()) return false;
      if (prepare && !this.prepareForExternalInteraction()) return false;
      if (closeFooter) this.closeFooterMenu();
      this[flag] = true;
      return true;
    } ,
    closeStandardPicker(flag, objectsKey, pressKeys = []) {
      this[flag] = false;
      pressKeys.forEach(key => { this[key] = null; });
      const objects = Array.isArray(this[objectsKey]) ? this[objectsKey].slice() : [];
      this[objectsKey] = [];
      this.destroyUiObjects(objects);
    } ,
    beginFooterMenu({ closePickers = false } = {}) {
      // Every footer-level modal starts with the same clean state and an object
      // registry that is available immediately to async callbacks.
      this.closeFooterMenu();
      if (closePickers) this.closeOtherPickersForFooterMenu();
      this.footerMenuOpen = true;
      const objects = [];
      this.footerMenuObjects = objects;
      return objects;
    } ,
    createUiResourceScope() {
      // Shared ownership for non-footer modals (including accessory picker/editor).
      const scene = this;
      const resources = new Set();
      const listeners = [];
      let disposed = false;
      return {
        get active() { return !disposed; },
        add(object) {
          if (disposed) { scene.destroyUiObjects([object], { destroyInactive: true }); return object; }
          if (object) resources.add(object);
          return object;
        },
        listen(emitter, event, callback, once = false) {
          if (disposed) return callback;
          if (once) emitter.once(event, callback); else emitter.on(event, callback);
          listeners.push([emitter, event, callback]);
          return callback;
        },
        destroy() {
          if (disposed) return;
          disposed = true;
          for (const [emitter, event, callback] of listeners) {
            try { emitter.off(event, callback); } catch (e) {}
          }
          listeners.length = 0;
          scene.destroyUiObjects(Array.from(resources), { destroyInactive: true });
          resources.clear();
        }
      };
    } ,
    createFooterMenuScope(objects = this.footerMenuObjects) {
      // A scope owns Phaser objects, transient row objects, listeners and loader
      // callbacks. Its disposal is part of the normal footer lifecycle.
      const scene = this;
      const resources = new Set();
      const listeners = [];
      let disposed = false;
      const scope = {
        get active() { return !disposed && scene.footerMenuOpen && scene.footerMenuObjects === objects; },
        add(object) { if (object) resources.add(object); return object; },
        remove(object) { resources.delete(object); return object; },
        clear() {
          scene.destroyUiObjects(Array.from(resources), {destroyInactive:true});
          resources.clear();
        },
        listen(emitter, event, callback, once = false) {
          if (!this.active) return callback;
          if (once) emitter.once(event, callback);
          else emitter.on(event, callback);
          listeners.push([emitter,event,callback]);
          return callback;
        },
        destroy() {
          if (disposed) return;
          disposed = true;
          for (const [emitter,event,callback] of listeners) {
            try { emitter.off(event,callback); } catch(e) {}
          }
          listeners.length = 0;
          this.clear();
        }
      };
      objects.push(scope);
      return scope;
    } ,
    closeFooterMenu() {
      const menuObjects = Array.isArray(this.footerMenuObjects) ? this.footerMenuObjects.slice() : [];
      // Always clear the menu state, even if a previous callback left the flag
      // and object list out of sync. This prevents an orphaned overlay/hit area.
      this.footerMenuOpen = false;
      this.footerMenuObjects = [];
      // Disable hit areas before destroying the menu so a pointer still held
      // during Cancel cannot activate an object from the previous panel.
      // Footer scopes report inactive as soon as footerMenuOpen is cleared.
      // Destroy inactive resources too, otherwise scopes and their children leak.
      this.destroyUiObjects(menuObjects, { destroyInactive: true });
      this.settingsVolumeMarkers = null;
      // Cancel is a return to the ordinary home screen, not a scene transition.
      // Restore the home scene's input state in case a previous transition was interrupted.
      try {
        const home = this.scene.get('default');
        if (home && this.scene.isPaused('default')) this.scene.resume('default');
        if (home && home.input) home.input.enabled = true;
      } catch (e) {}
      try { if (this.input) this.input.enabled = true; } catch (e) {}
      // Footer menus can be opened from other menus that hide the renderer's
      // body sprite directly. Restoring only the parent layer is not sufficient:
      // Phaser keeps each child's own visible flag, so explicitly restore the
      // home character layers after every footer-menu exit (including QUIT with
      // no selection).
      this.syncMeguMenuVisibility();
    } ,
    closeOtherPickersForFooterMenu() {
      if (this.foodOpen) this.toggleFood(false);
      if (this.menuOpen) this.toggleMenu(false);
      if (this.bOpen) this.toggleBg(false);
      if (this.fOpen) this.toggleFurn(false);
      if (this.accessoryPickerOpen || this.accessoryEditorOpen) this.closeAccessoryUi(false);
      if (this.editMode) this.setEdit(false);
    } 
});
