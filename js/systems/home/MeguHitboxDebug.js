/* Admin/tester, visual-only hit area inspection across every active Phaser scene. */
(function () {
  let enabled = false;
  const overlays = new WeakMap();
  const tracked = new Set();
  function isTester() { return typeof meguHasRole === 'function' && meguHasRole('tester'); }
  function removeAll() {
    tracked.forEach(scene => {
      const overlay = overlays.get(scene);
      if (overlay && overlay.active) overlay.destroy();
      overlays.delete(scene);
    });
    tracked.clear();
  }
  function drawScene(scene) {
    if (!scene.sys?.isActive() || !scene.add || !scene.input) return;
    let graphics = overlays.get(scene);
    if (!graphics || !graphics.active) {
      graphics = scene.add.graphics().setDepth(1000000).setScrollFactor(1);
      overlays.set(scene, graphics);
      tracked.add(scene);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (graphics.active) graphics.destroy();
        overlays.delete(scene);
        tracked.delete(scene);
      });
    }
    graphics.clear();
    const inputs = scene.input._list || [];
    inputs.forEach(obj => {
      if (!obj || !obj.active || !obj.visible || !obj.input?.enabled || obj === graphics) return;
      const area = obj.input.hitArea;
      if (!area || typeof obj.getWorldTransformMatrix !== 'function') return;
      const matrix = obj.getWorldTransformMatrix();
      const ox = obj.displayOriginX || 0;
      const oy = obj.displayOriginY || 0;
      const points = [];
      const addPoint = (x, y) => {
        const p = matrix.transformPoint(x - ox, y - oy);
        points.push(p);
      };
      if (typeof area.width === 'number' && typeof area.height === 'number') {
        const x = area.x || 0, y = area.y || 0;
        addPoint(x, y); addPoint(x + area.width, y);
        addPoint(x + area.width, y + area.height); addPoint(x, y + area.height);
      } else if (typeof area.radius === 'number') {
        const cx = area.x || 0, cy = area.y || 0;
        for (let i = 0; i < 32; i++) {
          const a = i * Math.PI * 2 / 32;
          addPoint(cx + Math.cos(a) * area.radius, cy + Math.sin(a) * area.radius);
        }
      } else if (Array.isArray(area.points)) {
        area.points.forEach(p => addPoint(p.x, p.y));
      } else return;
      if (points.length < 3) return;
      graphics.fillStyle(0xff3333, 0.12);
      graphics.lineStyle(2, 0xff3333, 0.95);
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
    });
  }
  window.meguHitboxDebug = {
    get enabled() { return enabled && isTester(); },
    toggle() {
      if (!isTester()) { enabled = false; removeAll(); return false; }
      enabled = !enabled;
      if (!enabled) removeAll();
      return enabled;
    },
    attach(game) {
      if (!game || game.__meguHitboxDebugAttached) return;
      game.__meguHitboxDebugAttached = true;
      game.events.on(Phaser.Core.Events.POST_STEP, () => {
        if (!enabled || !isTester()) {
          if (tracked.size) removeAll();
          return;
        }
        game.scene.getScenes(true).forEach(drawScene);
      });
    }
  };
})();
