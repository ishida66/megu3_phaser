/* Shared menu geometry and Background-Picker-standard scrolling.
 * All listeners and display objects belong to the supplied UI lifecycle scope.
 */
const MeguScrollableMenu = {
  rows: Object.freeze([174, 300, 424].map((y, i) => ({
    thumb: { x: 32, y, w: 122, h: 122 },
    desc: { x: 168, y: [178, 302, 426][i], w: 444, h: 118 }
  }))),
  createScrollbar(scene, options) {
    const { scope, add, getCount, getIndex, setIndex, visible = 3,
      x = 611, top = 178, height = 366, width = 8, hitWidth = 24,
      minThumb = 26, depth = 74 } = options;
    const own = object => add ? add(object) : scope.add(object);
    const track = own(scene.add.rectangle(x, top + height / 2, width, height, 0x8a775c, .7)
      .setStrokeStyle(1, 0x594a38, .85).setDepth(depth).setScrollFactor(0));
    // Background Picker uses separate track and thumb hit targets, not a single zone.
    const hit = own(scene.add.rectangle(x, top + height / 2, hitWidth, height, 0xffffff, .001)
      .setDepth(depth + 1).setScrollFactor(0).setInteractive({ useHandCursor: true }));
    const thumb = own(scene.add.rectangle(x, top + height / 2, width, height, 0xf4d89b, 1)
      .setStrokeStyle(1, 0x594a38, 1).setDepth(depth + 2).setScrollFactor(0)
      .setInteractive({ useHandCursor: true }));
    let dragging = null;
    const max = () => Math.max(0, getCount() - visible);
    const thumbSize = () => getCount() ? Math.min(height, Math.max(minThumb, height * visible / getCount())) : height;
    const update = () => {
      if (!thumb.active) return;
      const size = thumbSize();
      const travel = Math.max(0, height - size);
      // Resize both the visual geometry AND the interactive hit area. Phaser does
      // not automatically resize an existing hit area when displaySize changes.
      thumb.setSize(width, size).setDisplaySize(width, size)
        .setPosition(x, top + size / 2 + (max() ? getIndex() / max() * travel : 0));
      if (thumb.input && thumb.input.hitArea && thumb.input.hitArea.setTo)
        thumb.input.hitArea.setTo(0, 0, width, size);
    };
    const change = value => {
      const next = Phaser.Math.Clamp(Math.round(value), 0, max());
      if (next !== getIndex()) setIndex(next);
      update();
    };
    const begin = (pointer, jump, event) => {
      event?.stopPropagation?.();
      const size = thumbSize();
      const travel = Math.max(0, height - size);
      if (jump && travel > 0 && max() > 0) {
        change((pointer.y - top - size / 2) / travel * max());
      }
      dragging = { id: pointer.id, startY: pointer.y, startIndex: getIndex(), travel, maxScroll: max() };
    };
    hit.on('pointerdown', (pointer, lx, ly, event) => begin(pointer, true, event));
    thumb.on('pointerdown', (pointer, lx, ly, event) => begin(pointer, false, event));
    scope.listen(scene.input, 'pointermove', pointer => {
      if (!scope.active || !dragging || pointer.id !== dragging.id || !pointer.isDown) return;
      if (dragging.travel > 0 && dragging.maxScroll > 0)
        change(dragging.startIndex + (pointer.y - dragging.startY) / dragging.travel * dragging.maxScroll);
    });
    const end = pointer => { if (!pointer || !dragging || pointer.id === dragging.id) dragging = null; };
    scope.listen(scene.input, 'pointerup', end);
    scope.listen(scene.input, 'pointerupoutside', end);
    if (options.wheel !== false) scope.listen(scene.input, 'wheel', (pointer, gameObjects, dx, dy) => {
      if (!scope.active || !dy) return;
      const bounds = options.wheelBounds || { left: 16, right: 635, top: 174, bottom: 546 };
      if (pointer.x < bounds.left || pointer.x > bounds.right || pointer.y < bounds.top || pointer.y > bounds.bottom) return;
      const steps = Math.max(1, Math.round(Math.abs(dy) / 100));
      change(getIndex() + Math.sign(dy) * steps);
    });
    update();
    return { track, hit, thumb, update, scrollBy: delta => change(getIndex() + delta) };
  },
  // Background Picker row gesture: short press selects, 12px+ drag scrolls.
  bindRow(scene, scope, target, options) {
    const { getIndex, getCount, getScroll, setScroll, onSelect,
      visible = 3, rowHeight = 124 } = options;
    let press = null;
    target.on('pointerdown', (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      const index = getIndex();
      if (index < 0 || index >= getCount()) return;
      press = { id: pointer.id, index, startY: pointer.y, startScroll: getScroll(), moved: false };
    });
    scope.listen(scene.input, 'pointermove', pointer => {
      if (!scope.active || !press || pointer.id !== press.id || !pointer.isDown) return;
      const delta = pointer.y - press.startY;
      if (Math.abs(delta) > 12) press.moved = true;
      if (press.moved) {
        const maxScroll = Math.max(0, getCount() - visible);
        // Map a drag across the visible rows to the entire list, not just 3 entries.
        const dragRange = Math.max(1, rowHeight * visible);
        const next = Phaser.Math.Clamp(
          Math.round(press.startScroll - delta / dragRange * maxScroll), 0, maxScroll);
        if (next !== getScroll()) setScroll(next);
      }
    });
    const release = pointer => {
      if (!press || (pointer && pointer.id !== press.id)) return;
      const previous = press;
      press = null;
      if (scope.active && !previous.moved) onSelect(previous.index);
    };
    scope.listen(scene.input, 'pointerup', release);
    scope.listen(scene.input, 'pointerupoutside', () => { press = null; });
  }
};
