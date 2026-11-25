/* Shared stacked inventory operations for all item types. */
Object.assign(Main.prototype, {
    getStackedInventoryCount(storeKey, itemId) {
      const id = String(itemId);
      const inventory = Array.isArray(GAME_ATTRIBUTES[storeKey]) ? GAME_ATTRIBUTES[storeKey] : [];
      return inventory
        .filter(entry => String(entry.id) === id)
        .reduce((sum, entry) => sum + Math.max(0, Math.trunc(Number(entry.quantity) || 0)), 0);
    },
    addStackedInventoryItem(storeKey, itemId, quantity = 1, source = 'game') {
      const id = String(itemId);
      const amount = Math.max(1, Math.trunc(Number(quantity) || 1));
      const origin = ['store', 'game', 'player'].includes(String(source)) ? String(source) : 'game';
      if (!Array.isArray(GAME_ATTRIBUTES[storeKey])) GAME_ATTRIBUTES[storeKey] = [];
      const inventory = GAME_ATTRIBUTES[storeKey];
      const stack = inventory.find(entry => String(entry.id) === id && entry.source === origin);
      if (stack) stack.quantity = Math.max(0, Math.trunc(Number(stack.quantity) || 0)) + amount;
      else inventory.push({ id, quantity: amount, source: origin });
      save();
      return this.getStackedInventoryCount(storeKey, id);
    },
    removeStackedInventoryItem(storeKey, itemId, quantity = 1) {
      let remaining = Math.max(1, Math.trunc(Number(quantity) || 1));
      const id = String(itemId);
      const inventory = Array.isArray(GAME_ATTRIBUTES[storeKey]) ? GAME_ATTRIBUTES[storeKey] : [];
      // Consume oldest stacks first while retaining the provenance of remaining items.
      for (const entry of inventory) {
        if (remaining <= 0) break;
        if (String(entry.id) !== id) continue;
        const take = Math.min(remaining, Math.max(0, Math.trunc(Number(entry.quantity) || 0)));
        entry.quantity -= take;
        remaining -= take;
      }
      GAME_ATTRIBUTES[storeKey] = inventory.filter(entry => Number(entry.quantity) > 0);
      save();
      return remaining === 0;
    },
});
