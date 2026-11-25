/* Editable UI layouts. Loaded by Phaser at startup; changes require page refresh. */
const MeguMenuLayouts = {
  button(scene, menu, id, fallback) {
    const config = scene.cache && scene.cache.json.get('megu-menu-' + menu);
    const overrides = config && config.buttons && config.buttons[id] || {};
    const result = { ...fallback };
    for (const key of ['x','y','width','height','hitboxX','hitboxY','hitboxWidth','hitboxHeight']) {
      if (typeof overrides[key] === 'number' && Number.isFinite(overrides[key])) result[key] = overrides[key];
    }
    return result;
  },
  zone(scene, menu, id, fallback) {
    const b = this.button(scene, menu, id, fallback);
    const x = b.hitboxX ?? b.x, y = b.hitboxY ?? b.y;
    const w = b.hitboxWidth ?? b.width, h = b.hitboxHeight ?? b.height;
    return scene.add.zone(x + w / 2, y + h / 2, w, h);
  }
};
