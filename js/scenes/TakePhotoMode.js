// Phaser scene module. Loaded after js/game.js and before js/boot.js.
class TakePhotoMode extends Phaser.Scene {
  constructor() { super({ key: 'TakePhotoMode' }); }
  init(data = {}) {
    this.playerMeguDef = data.playerMeguDef || null;
    this.cameraStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recording = false;
    this.recordingStarting = false;
    this.recordingStartedAt = 0;
    this.recordingTimer = null;
    this.recordingStream = null;
    this.microphoneStream = null;
    this.microphoneEnabled = true;
    this.gameAudioDestination = null;
    this.gameAudioSource = null;
    this._mutedBgm = null;
    this.modeClosed = false;
    this._cameraCleanedUp = false;
    this.facingMode = 'user';
    const ua = navigator.userAgent || '';
    this.deviceStyle = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ? 'ios' : (/Android/i.test(ua) ? 'android' : 'desktop');
    this.zoom = 1;
    this._pinch = null;
    this._pinchZoomQueued = false;
    this._pinchRequestedZoom = null;
    this.hardwareZoom = false;
    this.zoomRange = { min: 1, max: 5, step: 0.1 };
    this.lensDevices = [];
    this.activeLens = null;
    this.lensBaseZoom = 1;
    this._lensSwitching = false;
    this.cameraRequestId = 0;
    this.cameraRecovering = false;
    this.cameraSuspended = false;
    this.cameraNeedsGesture = false;
    this.cameraReady = false;
    this._cameraListeners = [];
    this._cameraTrackEnded = null;
    this._focusRequestId = 0;
    this.pendingSave = null;
    this.pendingPhotoSave = null;
    this.previewActive = false;
    this.previewUrl = null;
    this.previewVideo = null;
    this.previewImage = null;
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') ||
      !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }
  preload() { this.load.audio('take-photo-shutter', 'assets/sound/sfx/SE_shutter.wav'); }
  create() {
    this.mainScene = this.scene.get('default');
    this.mainInputWasEnabled = this.mainScene && this.mainScene.input ? this.mainScene.input.enabled : true;
    if (this.mainScene && this.mainScene.input) this.mainScene.input.enabled = false;
    this.mutePhotoBgm();
    this.outputCanvas = document.createElement('canvas');
    this.outputCanvas.width = W; this.outputCanvas.height = CANVAS_H;
    this.outputContext = this.outputCanvas.getContext('2d');
    this.video = document.createElement('video');
    this.video.autoplay = true; this.video.muted = true; this.video.playsInline = true;
    if (this.textures.exists('take-photo-composite')) this.textures.remove('take-photo-composite');
    this.cameraTexture = this.textures.addCanvas('take-photo-composite', this.outputCanvas);
    this.compositeImage = this.add.image(W / 2, CANVAS_H / 2, 'take-photo-composite').setOrigin(0.5).setDepth(0);

    this.cameras.main.setBackgroundColor('#08090b');
    this.statusText = this.add.text(W / 2, 27, 'Allow camera access to start', {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#ffffff', stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(30).setVisible(false);
    if (this.deviceStyle === 'desktop') {
      this.exitButton = this.makeButton('exit', 70, 24, '× Exit', 92, () => this.exitMode(), 0x8c3545);
      this.createCameraControls();
      this.photoButton = this.makeButton('take_photo', W / 2 - 150, CANVAS_H - 72, 'Take Photo', 132, () => this.takePhoto(), 0x287aaf);
      this.recordButton = this.makeButton('record', W / 2 + 12, CANVAS_H - 72, 'Start Recording', 160, () => this.toggleRecording(), 0xb64a50);
      this.photoButtonLabel = this.children.list.filter(o => o.type === 'Text').slice(-2)[0] || null;
      this.recordButtonLabel = this.children.list.filter(o => o.type === 'Text').slice(-1)[0] || null;
    } else {
      this.createMobileCameraUI();
    }

    // Forward taps and rub gestures to the same handlers used on the home screen.
    this.installPinchZoom();
    // A preview tap can request a fresh autofocus pass where the browser exposes it.
    // WebKit does not expose a standard focus-point API, so never claim point focus.
    this.input.on('pointerdown', pointer => {
      if (this.modeClosed || this.previewActive || this._pinch || this._pinchSuppressed ||
          this.isOverControls(pointer) || this.input.manager.pointers.filter(p => p.isDown).length > 1) return;
      this.requestTapFocus();
    });
    this.input.on('pointerdown', pointer => { if (!this._pinch && !this._pinchSuppressed) this.forwardPointerDown(pointer); });
    this.input.on('pointermove', pointer => {
      if (this.mainScene && this.mainScene.pettingActive) this.mainScene.trackPettingMovement(pointer);
    });
    this.input.on('pointerup', () => { if (this.mainScene) this.mainScene.endPetting(); });
    this.input.on('pointerupoutside', () => { if (this.mainScene) this.mainScene.endPetting(); });

    this.recordingTimer = this.add.text(W / 2, this.deviceStyle === 'desktop' ? 60 : 45, '● 00:00', { fontFamily: 'Arial, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#a51823', padding: { x: 12, y: 6 } }).setOrigin(0.5).setDepth(35).setVisible(false);
    this.createMicrophoneControl();
    this.createCapturePreview();
    this.createResumeCameraButton();
    this.installCameraRecoveryListeners();
    this.startCamera();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }
  // Native-inspired layouts are drawn in Phaser rather than relying on device-specific DOM UI.
  cameraControl(x, y, radius, label, callback, options = {}) {
    const depth = options.depth || 25;
    const fill = options.fill === undefined ? 0x252525 : options.fill;
    const circle = this.add.circle(x, y, radius, fill, options.alpha === undefined ? 0.8 : options.alpha)
      .setDepth(depth).setStrokeStyle(options.strokeWidth || 0, options.stroke || 0xffffff, 0.9);
    const text = this.add.text(x, y, label, { fontFamily: 'Arial, sans-serif', fontSize: `${options.fontSize || 19}px`,
      fontStyle: options.bold ? 'bold' : 'normal', color: options.color || '#ffffff' })
      .setOrigin(0.5).setDepth(depth + 1);
    const hit = this.add.zone(x, y, Math.max(48, radius * 2), Math.max(48, radius * 2))
      .setDepth(depth + 2).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (pointer, lx, ly, event) => { event?.stopPropagation?.(); callback(); });
    return { circle, text, hit };
  }
  createMobileCameraUI() {
    const ios = this.deviceStyle === 'ios';
    this.captureMode = 'photo';
    // iPhone 16 reference: a slim mode strip at the bottom, not a tall opaque footer.
    this.add.rectangle(W / 2, CANVAS_H - 39, W, 78, 0x08090b, ios ? 0.92 : 0.94).setDepth(19);
    this.add.rectangle(W / 2, 18, W, 36, 0x08090b, 0.5).setDepth(19);
    this.exitButton = this.cameraControl(31, 29, 19, '×', () => this.exitMode(),
      { fill: 0x202124, alpha: 0.72, fontSize: 29 });
    this.cameraButton = this.cameraControl(W - 76, CANVAS_H - 39, 27, '', () => this.switchCamera(),
      { fill: ios ? 0x303035 : 0x363940 });
    // iPhone-style camera flip: camera outline with two curved rotation arrows.
    // Vector artwork avoids platform-dependent Unicode glyph rendering.
    const flipX = this.cameraButton.circle.x, flipY = this.cameraButton.circle.y;
    const flipIcon = this.add.graphics().setDepth(27);
    flipIcon.lineStyle(2.3, 0xffffff, 1);
    flipIcon.strokeRoundedRect(flipX - 15, flipY - 9, 30, 21, 5);
    flipIcon.strokeRoundedRect(flipX - 8, flipY - 13, 12, 5, 2);
    flipIcon.strokeCircle(flipX, flipY + 1, 5);
    flipIcon.lineStyle(2, 0xffffff, 1);
    flipIcon.beginPath();
    flipIcon.arc(flipX, flipY + 1, 10, -2.6, -0.35, false);
    flipIcon.strokePath();
    flipIcon.fillStyle(0xffffff, 1);
    flipIcon.fillTriangle(flipX + 10, flipY - 4, flipX + 14, flipY - 5, flipX + 12, flipY + 1);
    flipIcon.beginPath();
    flipIcon.arc(flipX, flipY + 1, 10, 0.55, 2.8, false);
    flipIcon.strokePath();
    flipIcon.fillTriangle(flipX - 10, flipY + 6, flipX - 14, flipY + 7, flipX - 12, flipY + 1);
    this.cameraButton.icon = flipIcon;
    // A single shutter toggles between photo capture and video recording based on the mode tab.
    this.shutterOuter = this.add.circle(W / 2, CANVAS_H - 147, 43, 0xffffff, ios ? 0.25 : 0.16)
      .setStrokeStyle(ios ? 3 : 4, 0xffffff).setDepth(23);
    this.shutterInner = this.add.circle(W / 2, CANVAS_H - 147, 34, 0xffffff).setDepth(24);
    this.shutterHit = this.add.zone(W / 2, CANVAS_H - 147, 94, 94).setDepth(27)
      .setInteractive({ useHandCursor: true });
    this.shutterHit.on('pointerdown', (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      if (this._pinch || this._pinchSuppressed) return;
      if (this.captureMode === 'photo') this.takePhoto(); else this.toggleRecording();
    });
    this.galleryButton = this.cameraControl(76, CANVAS_H - 39, 27, '▧', () => this.savePendingCapture(),
      { fill: 0x292c30, fontSize: 26, strokeWidth: 1, stroke: 0x6c7179 });
    this.modePhoto = this.add.text(W / 2 - 47, CANVAS_H - 39, 'PHOTO', {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(24).setInteractive({ useHandCursor: true });
    this.modeVideo = this.add.text(W / 2 + 47, CANVAS_H - 39, 'VIDEO', {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#c5c5c5'
    }).setOrigin(0.5).setDepth(24).setInteractive({ useHandCursor: true });
    this.modePhoto.on('pointerdown', () => this.setCaptureMode('photo'));
    this.modeVideo.on('pointerdown', () => this.setCaptureMode('video'));
    this.add.text(W - 30, 29, ios ? '⌄' : '⚙', { fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#ffffff' })
      .setOrigin(0.5).setDepth(24);
    this.createCameraControls();
    this.setCaptureMode('photo');
  }
  mutePhotoBgm() {
    const bgm = this.mainScene && this.mainScene.bgmSound;
    if (bgm && !this._mutedBgm) {
      this._mutedBgm = { sound: bgm, volume: bgm.volume };
      bgm.setVolume(0);
    }
  }
  restorePhotoBgm() {
    if (this._mutedBgm) {
      const { sound, volume } = this._mutedBgm;
      if (sound && !sound.pendingRemove) { try { sound.setVolume(volume); } catch (e) {} }
      this._mutedBgm = null;
    }
  }
  createMicrophoneControl() {
    this.micButton = this.cameraControl(W - 42, 84, 23, 'MIC', () => this.toggleMicrophone(),
      { fill: 0x30343b, fontSize: 12, depth: 36 });
    this.refreshMicrophoneControl();
  }
  refreshMicrophoneControl() {
    if (!this.micButton) return;
    this.micButton.circle.setFillStyle(this.microphoneEnabled ? 0x2a654d : 0x7a3434, .95);
    this.micButton.text.setText(this.microphoneEnabled ? 'MIC' : 'OFF');
  }
  toggleMicrophone() {
    this.microphoneEnabled = !this.microphoneEnabled;
    if (this.microphoneStream) this.microphoneStream.getAudioTracks().forEach(track => { track.enabled = this.microphoneEnabled; });
    this.refreshMicrophoneControl();
  }
  connectGameAudioForRecording() {
    // Phaser's WebAudio master gain contains game SFX. BGM is muted separately.
    const manager = this.sound;
    const ctx = manager && manager.context;
    const master = manager && (manager.masterGain || manager.masterVolumeNode);
    if (!ctx || !master || !ctx.createMediaStreamDestination) return null;
    const destination = ctx.createMediaStreamDestination();
    master.connect(destination);
    this.gameAudioDestination = destination;
    this.gameAudioSource = master;
    return destination;
  }
  disconnectGameAudioRecording() {
    if (this.gameAudioSource && this.gameAudioDestination) {
      try { this.gameAudioSource.disconnect(this.gameAudioDestination); } catch (e) {}
    }
    if (this.gameAudioDestination) this.gameAudioDestination.stream.getTracks().forEach(t => t.stop());
    this.gameAudioDestination = null;
    this.gameAudioSource = null;
  }
  setCaptureMode(mode) {
    if (this.recording && mode !== 'video') return;
    this.captureMode = mode;
    if (!this.modePhoto) return;
    this.modePhoto.setColor(mode === 'photo' ? '#ffffff' : '#b9b9b9');
    this.modeVideo.setColor(mode === 'video' ? '#ffffff' : '#b9b9b9');
    this.modePhoto.setFontStyle(mode === 'photo' ? 'bold' : 'normal');
    this.modeVideo.setFontStyle(mode === 'video' ? 'bold' : 'normal');
    this.refreshShutter();
  }
  refreshShutter() {
    if (!this.shutterInner) return;
    const video = this.captureMode === 'video';
    this.shutterInner.setFillStyle(video ? 0xe73c3c : 0xffffff);
    this.shutterInner.setRadius(video ? (this.recording ? 18 : 30) : 34);
  }
  savePendingCapture() {
    const pending = this.pendingPhotoSave || this.pendingSave;
    if (!pending) return;
    // Invoke the native share sheet directly from the tap gesture, before
    // changing the preview or destroying its media resources.
    this.saveBlob(pending.blob, pending.filename,
      this.pendingPhotoSave ? 'Megu Photo' : 'Megu Video').then(saved => {
        if (saved && !this.modeClosed) this.discardPreview();
      });
  }
  createCapturePreview() {
    // A modal preview prevents taps from reaching the camera and home scene.
    this.previewBackdrop = this.add.rectangle(W / 2, CANVAS_H / 2, W, CANVAS_H, 0x08090b, 0.96)
      .setDepth(60).setInteractive().setVisible(false);
    this.previewTitle = this.add.text(W / 2, 42, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(64).setVisible(false);
    // Preserve the capture's original aspect ratio; letterbox rather than stretch.
    const previewMaxW = W, previewMaxH = CANVAS_H - 170;
    const previewScale = Math.min(previewMaxW / W, previewMaxH / CANVAS_H);
    this.previewFrame = this.add.image(W / 2, CANVAS_H / 2 - 32, 'take-photo-composite')
      .setDepth(63).setScale(previewScale).setVisible(false);
    this.previewSave = this.cameraControl(W / 2 + 104, CANVAS_H - 68, 45, 'Save', () => this.savePendingCapture(),
      { fill: 0x237c57, fontSize: 19, bold: true, depth: 70 });
    this.previewCancel = this.cameraControl(W / 2 - 104, CANVAS_H - 68, 45, 'Discard', () => this.discardPreview(),
      { fill: 0x494949, fontSize: 15, bold: true, depth: 70 });
    this.setPreviewVisible(false);
  }
  setPreviewVisible(visible) {
    this.previewActive = visible;
    for (const obj of [this.previewBackdrop, this.previewTitle, this.previewFrame]) obj.setVisible(visible);
    for (const button of [this.previewSave, this.previewCancel]) {
      for (const obj of [button.circle, button.text, button.hit]) obj.setVisible(visible);
      if (visible) button.hit.setInteractive({ useHandCursor: true });
      else button.hit.disableInteractive();
    }
  }
  showCapturePreview(kind) {
    if (this.modeClosed) return;
    this.previewTitle.setText(kind === 'video' ? 'Video Preview' : 'Photo Preview');
    if (kind === 'photo') {
      this.previewImage = document.createElement('canvas');
      this.previewImage.width = W; this.previewImage.height = CANVAS_H;
      this.previewImage.getContext('2d').drawImage(this.outputCanvas, 0, 0);
    } else if (this.pendingSave) {
      this.previewUrl = URL.createObjectURL(this.pendingSave.blob);
      this.previewVideo = document.createElement('video');
      this.previewVideo.src = this.previewUrl;
      this.previewVideo.muted = true;
      this.previewVideo.loop = true;
      this.previewVideo.playsInline = true;
      this.previewVideo.play().catch(() => {});
    }
    this.setPreviewVisible(true);
  }
  discardPreview() {
    this.pendingPhotoSave = null;
    this.pendingSave = null;
    this.setPreviewVisible(false);
    if (this.previewVideo) {
      this.previewVideo.pause(); this.previewVideo.removeAttribute('src'); this.previewVideo.load();
      this.previewVideo = null;
    }
    if (this.previewUrl) { URL.revokeObjectURL(this.previewUrl); this.previewUrl = null; }
    this.previewImage = null;
    if (this.photoButtonLabel && this.photoButtonLabel.active) this.photoButtonLabel.setText('Take Photo');
    if (this.recordButtonLabel && this.recordButtonLabel.active) this.recordButtonLabel.setText('Start Recording');
    if (this.photoButton) this.photoButton.setFillStyle(0x287aaf);
    if (this.recordButton) this.recordButton.setFillStyle(0xb64a50);
  }
  makeButton(id, x, y, label, width, callback, color) {
    // The JSON uses center-based coordinates, matching the original Phaser rectangles.
    const cfg = MeguMenuLayouts.button(this, 'take_photo', id, { x, y, width, height: 48 });
    const bg = this.add.rectangle(cfg.x, cfg.y, cfg.width, cfg.height, color, 0.94)
      .setStrokeStyle(2, 0xffffff).setDepth(12);
    const text = this.add.text(cfg.x, cfg.y, label, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(13);
    const hitX = cfg.hitboxX ?? cfg.x - cfg.width / 2;
    const hitY = cfg.hitboxY ?? cfg.y - cfg.height / 2;
    const hitWidth = cfg.hitboxWidth ?? cfg.width;
    const hitHeight = cfg.hitboxHeight ?? cfg.height;
    const hitZone = this.add.zone(hitX + hitWidth / 2, hitY + hitHeight / 2, hitWidth, hitHeight)
      .setDepth(14).setInteractive({ useHandCursor: true });
    hitZone.on('pointerdown', () => bg.emit('pointerdown'));
    bg.on('pointerdown', callback);
    // Keep the existing return value and dynamic recording callback behavior.
    bg.menuHitZone = hitZone;
    return bg;
  }
  isOverControls(pointer) {
    if (!pointer) return true;
    return pointer.y < (this.deviceStyle === 'desktop' ? 155 : 85) || pointer.y > (this.deviceStyle === 'desktop' ? CANVAS_H - 155 : CANVAS_H - 235);
  }
  forwardPointerDown(pointer) {
    const main = this.mainScene;
    if (!main || this.previewActive || this.isOverControls(pointer)) return;
    const uiOpen = !!(main.foodOpen || main.menuOpen || main.bOpen || main.fOpen || main.footerMenuOpen || main.editMode);
    if (uiOpen) return;
    // Camera-mode forwarded input must obey the same full feeding lock.
    if (main.foodSequenceActive || main.foodActionActive) return;
    if (main.isPetHit(pointer)) {
      main.beginPetting(pointer);
      return;
    }
    if (main.pettingActive) main.endPetting();
    if (main.movementStopped || pointer.x < 0 || pointer.x > W || pointer.y < 450 || pointer.y > CANVAS_H) return;
    main.wander = false;
    main.clickMoveActive = true;
    main.target.x = Phaser.Math.Clamp(pointer.x, 50, 590);
    main.target.y = Phaser.Math.Clamp(pointer.y + 42, 450, 640);
  }
  createCameraControls() {
    const ios = this.deviceStyle === 'ios';
    const android = this.deviceStyle === 'android';
    const mobile = ios || android;
    const bgColor = ios ? 0x18191b : (android ? 0x24262b : 0x253044);
    const selectedColor = ios ? 0xffd34e : (android ? 0xd2e3fc : 0xffffff);
    const y = mobile ? CANVAS_H - 248 : 114;
    if (!mobile) {
      this.add.rectangle(W / 2, 112, 430, 68, bgColor, 0.82)
        .setDepth(11).setStrokeStyle(1, 0x777777, 0.6);
      this.zoomLabel = this.add.text(W / 2, 73, 'Camera zoom',
        { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(13);
    }
    this.zoomButtons = [];
    [0.5, 1, 2, ...(ios ? [5] : [3])].forEach((value, index) => {
      const x = W / 2 - 117 + index * 78;
      const circle = this.add.ellipse(x, y, ios ? 48 : 57, ios ? 48 : 45, bgColor, mobile ? 0.8 : 0.95)
        .setDepth(21).setStrokeStyle(android ? 1 : 0, 0x999999, 0.5);
      const label = this.add.text(x, y, `${value}×`, {
        fontFamily: 'Arial, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#ffffff'
      }).setOrigin(0.5).setDepth(22);
      const hit = this.add.zone(x, y, 72, 55).setDepth(26).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (pointer, lx, ly, event) => { event?.stopPropagation?.(); this.setZoom(value); });
      this.zoomButtons.push({ value, circle, label, selectedColor, bgColor });
    });
    this.zoomInfo = this.add.text(W / 2, mobile ? 67 : CANVAS_H - 139, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#ffffff',
      stroke: '#10131b', strokeThickness: 3
    }).setOrigin(0.5).setDepth(22);
    this.refreshZoomControls();
  }
  refreshZoomControls() {
    if (!this.zoomButtons) return;
    this.zoomButtons.forEach(button => {
      const supported = button.value !== 0.5 || this.lensDevices.some(l => l.base === 0.5) || (this.hardwareZoom && this.zoomRange.min <= 0.5);
      button.label.setAlpha(supported ? 1 : 0.3);
      button.circle.setAlpha(supported ? 1 : 0.3);
      const selected = supported && Math.abs(this.zoom - button.value) < 0.05;
      button.circle.setFillStyle(button.bgColor, selected ? 0.95 : 0.45);
      button.label.setColor(selected ? (this.deviceStyle === 'ios' ? '#ffd33d' : '#d2e3fc') : '#ffffff');
    });
    if (this.zoomInfo) this.zoomInfo.setText(this._pinch ? `${this.zoom.toFixed(1)}×` : '');
  }
  async discoverLenses() {
    if (!navigator.mediaDevices?.enumerateDevices || this.facingMode !== 'environment') {
      this.lensDevices = []; return;
    }
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      // Labels vary across iOS versions. Only explicitly identified physical lenses
      // are assigned optical magnification; generic virtual cameras remain 1×.
      this.lensDevices = devices.filter(d => !/front|facetime|selfie|user/i.test(d.label)).map(d => {
        const name = d.label.toLowerCase();
        const base = /ultra[ -]?wide|ultrawide|0[.,]5x/.test(name) ? 0.5
          : /telephoto|tele lens|5x/.test(name) ? 5
          : /3x/.test(name) ? 3
          : /2x/.test(name) ? 2 : 1;
        return { id: d.deviceId, label: d.label, base };
      });
    } catch (e) { this.lensDevices = []; }
  }
  async setZoom(requested) {
    if (this.modeClosed) return;
    const zoom = Phaser.Math.Clamp(requested, 0.5, 5);
    const lenses = this.facingMode === 'environment' ? this.lensDevices : [];
    // Pick the highest available optical base not exceeding requested zoom.
    // At exact 0.5×, use ultra-wide if the browser exposes it.
    const candidates = lenses.filter(l => l.base <= zoom + 0.001).sort((a,b) => b.base-a.base);
    const target = candidates[0] || lenses.find(l => l.base === 1);
    if (zoom < 1 && (!target || target.base !== 0.5) && !(this.hardwareZoom && this.zoomRange.min <= zoom)) {
      this.statusText.setText('Ultra-wide camera is not exposed by this browser'); return;
    }
    if (target && this.activeLens?.id !== target.id && !this._lensSwitching) {
      this._lensSwitching = true;
      try {
        await this.startCamera(true, target);
        if (!this.cameraReady) return;
      } finally { this._lensSwitching = false; }
    }
    const track = this.cameraStream?.getVideoTracks()[0];
    const ratio = zoom / (this.lensBaseZoom || 1);
    // A physical camera switch provides the optical base; apply track zoom only
    // within that lens's advertised range. The remainder is digital cropping.
    this.digitalZoom = Math.max(1, ratio);
    if (this.hardwareZoom && track?.applyConstraints) {
      const nativeZoom = Math.max(this.zoomRange.min, Math.min(this.zoomRange.max, ratio));
      try {
        await track.applyConstraints({ advanced: [{ zoom: nativeZoom }] });
        this.digitalZoom = Math.max(1, ratio / nativeZoom);
      } catch (e) { /* Keep digital fallback without disabling future optical switches. */ }
    }
    this.zoom = zoom;
    this.refreshZoomControls();
  }
  // Two-pointer pinch works on iOS/Android Phaser canvas without a DOM overlay.
  // Zoom updates are coalesced so repeated applyConstraints calls cannot race.
  installPinchZoom() {
    if (!this.isMobile) return;
    this.input.addPointer(2);
    const active = () => this.input.manager.pointers.filter(p => p.isDown);
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const start = () => {
      const points = active();
      if (points.length < 2 || this.previewActive) return;
      this._pinch = { ids: [points[0].id, points[1].id], distance: Math.max(1, distance(points[0], points[1])), zoom: this.zoom };
      this._pinchSuppressed = true;
      if (this.mainScene && this.mainScene.pettingActive) this.mainScene.endPetting();
    };
    this.input.on('pointerdown', start);
    this.input.on('pointermove', () => {
      if (!this._pinch || this.modeClosed || this.previewActive) return;
      const points = active();
      const a = points.find(p => p.id === this._pinch.ids[0]);
      const b = points.find(p => p.id === this._pinch.ids[1]);
      if (!a || !b) return;
      const min = this.hardwareZoom ? Math.max(0.5, this.zoomRange.min) : 1;
      const max = Math.max(5, this.zoomRange.max);
      const next = Phaser.Math.Clamp(this._pinch.zoom * distance(a, b) / this._pinch.distance, min, max);
      // Immediate digital preview, even when hardware constraints are asynchronous.
      this._pinchRequestedZoom = Math.round(next * 100) / 100;
      this.queuePinchZoom();
    });
    const end = () => {
      if (!this._pinch) return;
      if (active().length < 2) {
        this._pinch = null;
        this.refreshZoomControls();
        // Do not treat the last lifted finger as a tap on the pet or camera controls.
        this._pinchSuppressed = true;
        this.time.delayedCall(120, () => { this._pinchSuppressed = false; });
      }
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
  }
  async queuePinchZoom() {
    if (this._pinchZoomQueued) return;
    this._pinchZoomQueued = true;
    try {
      while (this._pinchRequestedZoom !== null && !this.modeClosed) {
        const value = this._pinchRequestedZoom;
        this._pinchRequestedZoom = null;
        await this.setZoom(value);
      }
    } finally { this._pinchZoomQueued = false; }
  }
  createResumeCameraButton() {
    this.resumeCameraButton = this.cameraControl(W / 2, CANVAS_H / 2, 83, 'Resume Camera',
      () => this.recoverCamera(true), { fill: 0x30343b, fontSize: 17, depth: 85 });
    this.showResumeCameraButton(false);
  }
  showResumeCameraButton(visible) {
    if (!this.resumeCameraButton) return;
    for (const obj of [this.resumeCameraButton.circle, this.resumeCameraButton.text, this.resumeCameraButton.hit]) {
      obj.setVisible(visible);
    }
    if (visible) this.resumeCameraButton.hit.setInteractive({ useHandCursor: true });
    else this.resumeCameraButton.hit.disableInteractive();
  }
  installCameraRecoveryListeners() {
    const listen = (target, event, handler) => {
      target.addEventListener(event, handler);
      this._cameraListeners.push([target, event, handler]);
    };
    const suspend = () => {
      if (this.modeClosed) return;
      this.cameraSuspended = true;
      this.cameraReady = false;
      // Browser backgrounding interrupts video recording. Finalize it without
      // destroying an already captured photo or video preview.
      if (this.recording && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        try { this.mediaRecorder.stop(); } catch (e) {}
      }
      if (this.video) { try { this.video.pause(); } catch (e) {} }
    };
    const resume = () => {
      if (this.modeClosed || document.hidden) return;
      this.cameraSuspended = false;
      if (this.previewActive) return;
      this.recoverCamera(false);
    };
    listen(document, 'visibilitychange', () => document.hidden ? suspend() : resume());
    listen(window, 'pagehide', suspend);
    listen(window, 'pageshow', resume);
    listen(window, 'blur', suspend);
    listen(window, 'focus', resume);
  }
  async recoverCamera(fromGesture = false) {
    if (this.modeClosed || document.hidden || this.previewActive || this.cameraSuspended || this.cameraRecovering) return;
    // On iOS, a backgrounded track may still report "live" and video.play()
    // may resolve while the actual camera frames remain black. Reopening the
    // stream (as the working camera-flip button does) is more reliable than
    // trusting readyState/videoWidth alone.
    this.cameraRecovering = true;
    const previousZoom = this.zoom;
    try {
      await this.startCamera(true);
      if (!this.modeClosed && this.cameraReady && previousZoom !== 1) {
        await this.setZoom(previousZoom);
      }
      if (!this.cameraReady) this.cameraNeedsGesture = true;
    } finally {
      this.cameraRecovering = false;
      if (!this.modeClosed && !this.previewActive) this.showResumeCameraButton(this.cameraNeedsGesture);
    }
  }
  async enableContinuousAutofocus(track) {
    if (!track || !track.applyConstraints || !track.getCapabilities) return false;
    try {
      const modes = track.getCapabilities()?.focusMode;
      if (!Array.isArray(modes) || !modes.includes('continuous')) return false;
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      return true;
    } catch (error) {
      console.debug('Continuous autofocus not available; using browser default', error);
      return false;
    }
  }
  async requestTapFocus() {
    const track = this.cameraStream?.getVideoTracks()[0];
    if (!this.cameraReady || !track || !track.applyConstraints || !track.getCapabilities) return;
    const requestId = ++this._focusRequestId;
    try {
      const modes = track.getCapabilities()?.focusMode;
      if (!Array.isArray(modes) || !modes.includes('single-shot')) return;
      await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
      // Return to continuous autofocus after the one-shot pass, if available.
      if (requestId === this._focusRequestId && track === this.cameraStream?.getVideoTracks()[0]) {
        await this.enableContinuousAutofocus(track);
      }
    } catch (error) {
      console.debug('Tap autofocus unavailable; keeping browser default', error);
    }
  }
  async startCamera(recovering = false, lens = null) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.statusText.setText('Camera access requires HTTPS and a supported browser'); return;
    }
    const requestId = ++this.cameraRequestId;
    this.cameraReady = false;
    if (this._cameraTrackEnded) {
      const [track, callback] = this._cameraTrackEnded;
      track.removeEventListener('ended', callback);
      this._cameraTrackEnded = null;
    }
    const oldStream = this.cameraStream;
    this.cameraStream = null;
    if (oldStream) oldStream.getTracks().forEach(track => track.stop());
    // Detach the old capture session before requesting a new one. Otherwise
    // WebKit can keep displaying a stale/black frame after backgrounding.
    if (this.video) {
      try { this.video.pause(); this.video.srcObject = null; } catch (e) {}
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: lens?.id ? { deviceId: { exact: lens.id } } : { facingMode: { ideal: this.facingMode } }, audio: false
      });
      if (this.modeClosed || requestId !== this.cameraRequestId) {
        stream.getTracks().forEach(track => track.stop()); return;
      }
      this.cameraStream = stream;
      const actualId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
      this.activeLens = lens || this.lensDevices.find(l => l.id === actualId) || null;
      this.lensBaseZoom = this.activeLens?.base || 1;
      this.digitalZoom = 1;
      this.video.srcObject = stream;
      await this.video.play();
      if (this.modeClosed || requestId !== this.cameraRequestId) {
        stream.getTracks().forEach(t => t.stop()); return;
      }
      this.cameraReady = true;
      this.cameraNeedsGesture = false;
      this.showResumeCameraButton(false);
      const track = stream.getVideoTracks()[0];
      const caps = track && typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
      if (track) {
        const ended = () => {
          if (!this.modeClosed && !this.cameraSuspended && !this.previewActive) this.recoverCamera(false);
        };
        track.addEventListener('ended', ended);
        this._cameraTrackEnded = [track, ended];
      }
      // Apply on every new stream, including physical lens changes and focus recovery.
      await this.enableContinuousAutofocus(track);
      const range = caps.zoom;
      this.hardwareZoom = !!(range && Number.isFinite(range.min) && Number.isFinite(range.max));
      this.zoomRange = this.hardwareZoom
        ? { min: range.min, max: Math.max(5, range.max), step: range.step || 0.1 }
        : { min: 1, max: 5, step: 0.1 };
      if (!recovering) this.zoom = 1;
      if (!lens) {
        await this.discoverLenses();
        this.activeLens = this.lensDevices.find(l => l.id === actualId) || null;
        this.lensBaseZoom = this.activeLens?.base || 1;
      }
      this.refreshZoomControls();
      this.statusText.setText(this.facingMode === 'user' ? 'Front camera — Megu is ready!' : 'Back camera — Megu is ready!');
    } catch (error) {
      if (requestId !== this.cameraRequestId || this.modeClosed) return;
      this.cameraReady = false;
      this.cameraNeedsGesture = true;
      this.showResumeCameraButton(!this.previewActive && !document.hidden);
      console.warn('Take a Photo camera error:', error);
      this.statusText.setText(error && error.name === 'NotAllowedError' ? 'Camera permission was denied' : 'Could not start the camera');
    }
  }
  async switchCamera() {
    if (!this.isMobile || this.modeClosed) return;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    this.activeLens = null; this.lensDevices = []; this.lensBaseZoom = 1;
    this.statusText.setText('Switching camera…');
    await this.startCamera();
  }
  drawSprite(ctx, sprite) {
    if (!sprite || !sprite.active || !sprite.visible || !sprite.frame) return;
    const frame = sprite.frame;
    const source = frame.source && frame.source.image;
    if (!source) return;
    const dw = Math.abs(sprite.displayWidth || frame.width);
    const dh = Math.abs(sprite.displayHeight || frame.height);
    const ox = sprite.originX == null ? 0.5 : sprite.originX;
    const oy = sprite.originY == null ? 0.5 : sprite.originY;
    ctx.save();
    if (sprite.flipX) { ctx.translate(sprite.x * 2, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      sprite.x - ox * dw, sprite.y - oy * dh, dw, dh);
    ctx.restore();
  }
  drawComposition() {
    const ctx = this.outputContext, video = this.video;
    if (this.previewActive) {
      if (this.previewImage) ctx.drawImage(this.previewImage, 0, 0, W, CANVAS_H);
      else if (this.previewVideo && this.previewVideo.readyState >= 2) {
        ctx.fillStyle = '#08090b'; ctx.fillRect(0, 0, W, CANVAS_H);
        ctx.drawImage(this.previewVideo, 0, 0, W, CANVAS_H);
      }
      if (this.cameraTexture) this.cameraTexture.refresh();
      return;
    }
    ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, W, CANVAS_H);
    if (video && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      // A sub-1× preset is only optical if a real ultra-wide lens is selected;
      // otherwise retain the widest available view rather than falsely zooming out.
      const digitalZoom = this.digitalZoom || Math.max(1, this.zoom / (this.lensBaseZoom || 1));
      const scale = Math.max(W / video.videoWidth, CANVAS_H / video.videoHeight) * digitalZoom;
      const sw = W / scale, sh = CANVAS_H / scale;
      ctx.save();
      if (this.facingMode === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, W, CANVAS_H);
      ctx.restore();
    }
    const main = this.mainScene;
    if (main && main.characterSprite && main.characterSprite.visible) {
      if (main.pet) {
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.ellipse(main.pet.x, main.pet.y, 46, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      this.drawSprite(ctx, main.characterSprite);
      this.drawSprite(ctx, main.characterOverlay);
      (main.accessoryHomeSpriteItems || [main.accessoryHomeSprite]).forEach(sprite => this.drawSprite(ctx, sprite));
      this.drawSprite(ctx, main.characterBlink);
      this.drawSprite(ctx, main.pettingHandSprite);
      // Petting hearts are part of the home-screen interaction feedback too.
      (main.children && main.children.list ? main.children.list : []).forEach(child => {
        if (child && child.active && child.texture && /^heart-[sml]$/.test(child.texture.key || '')) this.drawSprite(ctx, child);
      });
    }
    if (this.cameraTexture) this.cameraTexture.refresh();
  }
  update() { if (!this.modeClosed) { this.drawComposition(); this.updateRecordingTimer(); } }
  async saveBlob(blob, filename, title) {
    if (!blob) return false;
    const ext = filename.split('.').pop().toLowerCase();
    const type = blob.type || (ext === 'png' ? 'image/png' : ext === 'mp4' ? 'video/mp4' : 'video/webm');
    const file = new File([blob], filename, { type });
    try {
      // iOS and Android use the system Save/Share sheet. Do not substitute
      // an automatic browser download if sharing is unavailable or cancelled.
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title });
        return true;
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return false;
      console.warn('Native file share unavailable:', error);
    }
    if (this.deviceStyle === 'desktop') {
      this.downloadBlob(blob, filename);
      return true;
    }
    console.warn('This browser does not support sharing this file. Capture retained for retry.');
    return false;
  }
  takePhoto() {
    if (this.previewActive || this.modeClosed) return;
    if (!this.video || this.video.readyState < 2) { this.statusText.setText('Camera is not ready yet'); return; }
    // Snapshot immediately, before the asynchronous PNG encoding completes.
    const snapshot = document.createElement('canvas');
    snapshot.width = W; snapshot.height = CANVAS_H;
    snapshot.getContext('2d').drawImage(this.outputCanvas, 0, 0);
    this.playShutterSound();
    snapshot.toBlob(blob => {
      if (!blob || this.modeClosed) return;
      this.pendingPhotoSave = { blob, filename: `megu-photo-${Date.now()}.png` };
      this.previewImage = snapshot;
      this.showCapturePreview('photo');
    }, 'image/png');
  }
  playShutterSound() {
    try {
      const volume = this.mainScene && Number.isFinite(this.mainScene.sfxVolume) ? this.mainScene.sfxVolume : 0.8;
      const sound = this.sound.add('take-photo-shutter', { volume });
      sound.once('complete', () => sound.destroy());
      sound.play();
    } catch (error) { console.warn('Shutter sound unavailable:', error); }
  }
  // Short camera-like cues, generated locally without downloading audio assets.
  playCameraCue(kind) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = this._cueAudioContext || (this._cueAudioContext = new AudioContextClass());
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (kind === 'photo') {
        // Original mechanical shutter-like click, not an Apple system recording.
        const duration = 0.085, sampleRate = ctx.sampleRate;
        const buffer = ctx.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const t = i / sampleRate;
          const first = Math.exp(-t * 115) * (Math.random() * 2 - 1);
          const second = t > 0.036 ? Math.exp(-(t - 0.036) * 100) * (Math.random() * 2 - 1) : 0;
          data[i] = (first + second * 0.7) * 0.42;
        }
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        filter.type = 'bandpass'; filter.frequency.value = 1650; filter.Q.value = 0.7;
        gain.gain.value = 0.7;
        source.buffer = buffer; source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        source.start();
        return;
      }
      const tones = kind === 'start' ? [[780, 0, .09]] : [[660, 0, .065], [440, .09, .09]];
      for (const [frequency, delay, duration] of tones) {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        oscillator.type = kind === 'photo' ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        const at = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.11, at + .008);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.start(at); oscillator.stop(at + duration + .01);
      }
    } catch (error) { console.warn('Camera cue unavailable:', error); }
  }
  updateRecordingTimer() {
    if (!this.recordingTimer || !this.recordingTimer.active) return;
    if (!this.recording) { this.recordingTimer.setVisible(false); return; }
    const seconds = Math.max(0, Math.floor((performance.now() - this.recordingStartedAt) / 1000));
    this.recordingTimer.setText(`● ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    this.recordingTimer.setVisible(true);
  }
  showCameraError(message, duration = 5000) {
    if (!this.statusText || !this.statusText.active) return;
    this.statusText.setText(message).setVisible(true);
    if (this._cameraStatusTimer) this._cameraStatusTimer.remove(false);
    if (duration > 0) this._cameraStatusTimer = this.time.delayedCall(duration, () => {
      if (this.statusText && this.statusText.active) this.statusText.setVisible(false);
    });
  }
  async toggleRecording() {
    if (this.previewActive || this.modeClosed || this.recordingStarting) return;
    if (this.recording) {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch (e) { console.warn(e); }
      }
      return;
    }
    if (!this.outputCanvas.captureStream || typeof MediaRecorder === 'undefined') {
      this.showCameraError('Video recording is not supported by this browser'); return;
    }
    this.recordingStarting = true;
    this.showCameraError('Starting recording…', 0);
    let videoStream = null, micStream = null;
    try {
      // Ask for microphone permission only when starting a video, never when opening Photo Mode.
      // Microphone permission may require a separate iOS prompt.
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      } catch (micError) {
        console.warn('Microphone unavailable; recording silent video:', micError);
        this.showCameraError('Microphone denied — check Safari/Chrome site microphone permissions', 6000);
      }
      if (this.modeClosed || this.cameraSuspended || this.previewActive) {
        if (micStream) micStream.getTracks().forEach(track => track.stop()); return;
      }
      videoStream = this.outputCanvas.captureStream(30);
      // Route game sound and microphone into a single WebAudio mix, so MediaRecorder
      // receives exactly one audio track even on browsers that reject multiple tracks.
      const gameDestination = this.connectGameAudioForRecording();
      let audioTracks = [];
      if (gameDestination && micStream) {
        const ctx = this.sound.context;
        const micSource = ctx.createMediaStreamSource(micStream);
        micSource.connect(gameDestination);
        this._micAudioSource = micSource;
        audioTracks = gameDestination.stream.getAudioTracks();
      } else if (gameDestination) {
        audioTracks = gameDestination.stream.getAudioTracks();
      } else if (micStream) {
        audioTracks = micStream.getAudioTracks();
      }
      if (micStream) micStream.getAudioTracks().forEach(track => { track.enabled = this.microphoneEnabled; });
      const combined = new MediaStream([...videoStream.getVideoTracks(), ...audioTracks]);
      const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = types.find(type => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type));
      this.recordedChunks = [];
      const recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);
      this.mediaRecorder = recorder;
      this.recordingStream = videoStream;
      this.microphoneStream = micStream;
      recorder.ondataavailable = event => { if (event.data && event.data.size) this.recordedChunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: recorder.mimeType || mime || 'video/webm' });
        const filename = `megu-video-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
        combined.getTracks().forEach(track => track.stop());
        if (micStream) micStream.getTracks().forEach(track => track.stop());
        if (this._micAudioSource) { try { this._micAudioSource.disconnect(); } catch (e) {} this._micAudioSource = null; }
        this.disconnectGameAudioRecording();
        this.recordingStream = null;
        this.microphoneStream = null;
        this.recording = false;
        this.updateRecordingTimer();
        if (this.modeClosed) return;
        this.playCameraCue('stop');
        this.pendingSave = { blob, filename };
        this.showCapturePreview('video');
        if (this.recordButton) this.recordButton.setFillStyle(0x287aaf);
        this.refreshShutter();
        if (this.recordButtonLabel && this.recordButtonLabel.active) this.recordButtonLabel.setText('Save Video');
      };
      recorder.onerror = event => { console.warn('MediaRecorder error:', event); this.showCameraError('Recording failed — try again'); };
      recorder.start(250);
      this.recording = true;
      if (micStream) this.statusText.setVisible(false);
      this.recordingStartedAt = performance.now();
      this.updateRecordingTimer();
      this.playCameraCue('start');
      if (this.recordButton) this.recordButton.setFillStyle(0x477e55);
      this.refreshShutter();
      if (this.recordButtonLabel && this.recordButtonLabel.active) this.recordButtonLabel.setText('Stop Recording');
    } catch (error) {
      if (videoStream) videoStream.getTracks().forEach(track => track.stop());
      if (this._micAudioSource) { try { this._micAudioSource.disconnect(); } catch (e) {} this._micAudioSource = null; }
      this.disconnectGameAudioRecording();
      if (micStream) micStream.getTracks().forEach(track => track.stop());
      console.warn('Video recording/microphone error:', error);
      this.showCameraError('Unable to start recording on this device');
    } finally { this.recordingStarting = false; }
  }
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  exitMode() {
    if (this.modeClosed) return;
    this.modeClosed = true;
    this.cameraRequestId++;
    // Let the scene's SHUTDOWN event own cleanup exactly once. In particular,
    // do not remove its texture while its display objects still reference it.
    this.scene.stop('TakePhotoMode');
  }
  cleanup() {
    if (this._cameraCleanedUp) return;
    this._cameraCleanedUp = true;
    this.modeClosed = true;
    this.cameraRequestId++;
    for (const [target, event, handler] of this._cameraListeners || []) target.removeEventListener(event, handler);
    this._cameraListeners = [];
    if (this._cameraTrackEnded) {
      const [track, callback] = this._cameraTrackEnded;
      track.removeEventListener('ended', callback);
      this._cameraTrackEnded = null;
    }
    if (this.recording && this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      try { this.mediaRecorder.stop(); } catch (e) {}
    }
    this.recording = false;
    if (this.recordingStream) this.recordingStream.getTracks().forEach(track => track.stop());
    if (this.microphoneStream) this.microphoneStream.getTracks().forEach(track => track.stop());
    this.recordingStream = null; this.microphoneStream = null;
    if (this._micAudioSource) { try { this._micAudioSource.disconnect(); } catch (e) {} this._micAudioSource = null; }
    this.disconnectGameAudioRecording();
    this.restorePhotoBgm();
    if (this._cueAudioContext) { this._cueAudioContext.close().catch(() => {}); this._cueAudioContext = null; }
    if (this.cameraStream) this.cameraStream.getTracks().forEach(track => { try { track.stop(); } catch (e) {} });
    this.cameraStream = null;
    if (this.video) { try { this.video.pause(); this.video.srcObject = null; } catch (e) {} }
    // Avoid calling setVisible/setInteractive on objects being destroyed by Phaser.
    if (this.previewVideo) {
      try { this.previewVideo.pause(); this.previewVideo.removeAttribute('src'); this.previewVideo.load(); } catch (e) {}
      this.previewVideo = null;
    }
    if (this.previewUrl) { URL.revokeObjectURL(this.previewUrl); this.previewUrl = null; }
    this.previewImage = null;
    this.pendingPhotoSave = null;
    this.pendingSave = null;
    // The main scene remains running under the camera; re-enable its input.
    if (this.mainScene && this.mainScene.pettingActive) this.mainScene.endPetting();
    if (this.mainScene && this.mainScene.input) this.mainScene.input.enabled = true;
    if (this.scene.isPaused('default')) this.scene.resume('default');
    // Defer texture removal until the scene's game objects have been destroyed.
    const textures = this.textures;
    if (textures && textures.exists('take-photo-composite')) {
      // Reuse the canvas texture next time if still referenced; create() will
      // remove it safely before re-adding a new one.
    }
    this.cameraTexture = null;
  }
}
