// MEGU account, authentication, cloud-save, and account-backup lifecycle.
// Loaded after game.js because it uses the shared GAME_ATTRIBUTES/save helpers.
// Supabase account + cloud-save integration. Usernames are mapped to an
// internal, non-deliverable email address because Supabase Auth's password
// provider uses an email/phone identifier. No real email is collected.
const MEGU_SAVE_TABLE = 'megu_saves';
let meguSupabase = null;
let meguAuthUser = null;
let meguUserRole = 'player';
let meguLoginUsername = ''; // Immutable login identifier for the active session; separate from the editable display name.
let meguCloudSaveTimer = null;
let meguCloudReady = false;
let meguAuthMode = 'login';
const meguUsernameEmail = username => `${String(username || '').trim().toLowerCase()}@accounts.megu.invalid`;
function meguHasRole(requiredRole = 'tester') {
  const levels = { player: 0, tester: 1, admin: 2 };
  return (levels[meguUserRole] ?? 0) >= (levels[requiredRole] ?? 99);
}
async function refreshMeguUserRole() {
  meguUserRole = 'player';
  if (!meguSupabase || !meguAuthUser) return meguUserRole;
  const { data, error } = await meguSupabase.rpc('get_my_megu_role');
  if (error) {
    console.warn('[MEGU] Could not load account permissions; using player access:', error.message || error);
    return meguUserRole;
  }
  const role = String(data || '').toLowerCase();
  meguUserRole = ['player', 'tester', 'admin'].includes(role) ? role : 'player';
  return meguUserRole;
}
async function listMeguAdminAccounts() {
  if (!meguHasRole('admin')) throw new Error('Admin permission required.');
  const { data, error } = await meguSupabase.rpc('admin_list_megu_users');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
async function changeMeguAccountRole(username, role) {
  if (!meguHasRole('admin')) throw new Error('Admin permission required.');
  const cleanUsername = String(username || '').trim();
  const cleanRole = String(role || '').toLowerCase();
  if (!/^[A-Za-z0-9_]{3,24}$/.test(cleanUsername) || !['player', 'tester', 'admin'].includes(cleanRole)) {
    throw new Error('Enter a valid username and role.');
  }
  const { data, error } = await meguSupabase.rpc('admin_set_megu_user_role', {
    target_username: cleanUsername,
    new_role: cleanRole
  });
  if (error) throw error;
  return data;
}
async function openMeguAdminManager() {
  if (!meguHasRole('admin')) return;
  try {
    const users = await listMeguAdminAccounts();
    const summary = users.map(user => `${user.username || '(unnamed)'} — ${user.role}`).join('\n');
    const username = window.prompt(`MEGU accounts\n\n${summary || 'No accounts found.'}\n\nEnter the username to change:`);
    if (!username) return;
    const role = window.prompt('Enter role: player, tester, or admin');
    if (!role) return;
    await changeMeguAccountRole(username, role);
    window.alert(`Updated ${username.trim()} to ${role.toLowerCase()}.`);
  } catch (error) {
    console.error('[MEGU] Admin account update failed:', error);
    window.alert(`Could not update account: ${error.message || error}`);
  }
}

function setMeguAuthMessage(message, isError = true) {
  const el = document.getElementById('megu-auth-message');
  if (el) { el.textContent = message || ''; el.style.color = isError ? '#a13b32' : '#34734a'; }
}
function setMeguAuthMode(mode) {
  meguAuthMode = mode === 'register' ? 'register' : 'login';
  const registering = meguAuthMode === 'register';
  document.getElementById('megu-login-tab').classList.toggle('active', !registering);
  document.getElementById('megu-register-tab').classList.toggle('active', registering);
  document.getElementById('megu-petname-label').hidden = !registering;
  document.getElementById('megu-petname').hidden = !registering;
  document.getElementById('megu-petname').required = registering;
  document.getElementById('megu-password').autocomplete = registering ? 'new-password' : 'current-password';
  document.getElementById('megu-auth-submit').textContent = registering ? 'Create account' : 'Log in';
  setMeguAuthMessage('');
}
function showMeguAuth() {
  meguCloudReady = false;
  document.getElementById('megu-auth-screen').hidden = false;
  document.getElementById('megu-account-bar').hidden = true;
}
function hideMeguAuth() {
  document.getElementById('megu-auth-screen').hidden = true;
  document.getElementById('megu-account-bar').hidden = false;
}
function scheduleMeguCloudSave() {
  if (!meguSupabase || !meguAuthUser || !meguCloudReady) return;
  if (meguCloudSaveTimer) clearTimeout(meguCloudSaveTimer);
  meguCloudSaveTimer = setTimeout(() => { meguCloudSaveTimer = null; saveMeguCloudData(); }, 1200);
}
async function claimMeguPendingGifts() {
  if (!meguSupabase || !meguAuthUser) return [];
  const { data, error } = await meguSupabase.rpc('claim_megu_gifts');
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  const gifts = result && Array.isArray(result.gifts) ? result.gifts : [];
  for (const gift of gifts) {
    const quantity = Math.max(1, Math.trunc(Number(gift.quantity) || 1));
    if (gift.category === 'special') {
      const key = String(gift.item_id || '');
      if (MEGU_CONSUMABLE_ITEM_KEYS.includes(key)) GAME_ATTRIBUTES[key] = Math.max(0, Math.trunc(Number(GAME_ATTRIBUTES[key]) || 0)) + quantity;
    } else {
      const key = gift.category === 'food' ? 'food_store' : 'furniture_store';
      if (!['food_store','furniture_store'].includes(key)) continue;
      if (!Array.isArray(GAME_ATTRIBUTES[key])) GAME_ATTRIBUTES[key] = [];
      const id = String(gift.item_id);
      const stack = GAME_ATTRIBUTES[key].find(entry => String(entry.id) === id && entry.source === 'player');
      if (stack) stack.quantity = Math.max(0, Math.trunc(Number(stack.quantity) || 0)) + quantity;
      else GAME_ATTRIBUTES[key].push({ id, quantity, source: 'player' });
    }
  }
  if (gifts.length) {
    try { localStorage.setItem(GAME_ATTRIBUTES_KEY, JSON.stringify(GAME_ATTRIBUTES)); } catch (_) {}
    const scene = window.game?.scene?.getScene('default');
    scene?.updateMedicineHud?.();
    if (scene?.foodOpen) scene.updateFoodMenu?.();
    if (scene?.fOpen) scene.updateFurnitureMenu?.();
  }
  return gifts;
}

async function saveMeguCloudData() {
  if (!meguSupabase || !meguAuthUser || !meguCloudReady) return;
  // Gift claims are applied to the cloud save transactionally before the local
  // snapshot is uploaded, so another player's gifts cannot be overwritten by
  // an older in-memory inventory.
  try { await claimMeguPendingGifts(); }
  catch (giftError) {
    if (!String(giftError?.message || giftError).includes('cloud save could not be found')) console.warn('[MEGU] Gift inbox claim failed:', giftError.message || giftError);
  }
  const payload = {
    user_id: meguAuthUser.id,
    username: String(GAME_ATTRIBUTES.userName || meguAuthUser.user_metadata?.username || ''),
    pet_name: String(GAME_ATTRIBUTES.petName || ''),
    save_data: GAME_ATTRIBUTES,
    updated_at: new Date().toISOString()
  };
  const { error } = await meguSupabase.from(MEGU_SAVE_TABLE).upsert(payload, { onConflict: 'user_id' });
  if (error) console.warn('[MEGU] Cloud save failed:', error.message);
}
async function fetchMeguPublicCompetitionGuests() {
  if (!meguSupabase || !meguAuthUser) return [];
  try {
    const { data, error } = await meguSupabase.rpc('get_megu_public_competition_guests');
    if (error) throw error;
    return (Array.isArray(data) ? data : []).filter(row => row && row.user_id && /^ID\d+$/i.test(String(row.pet_id || '')))
      .map(row => {
        const stats = row.sumo_stats && typeof row.sumo_stats === 'object' ? row.sumo_stats : {};
        const cleanStats = {};
        for (const key of ['power', 'agility', 'technique', 'endurance']) {
          cleanStats[key] = Phaser.Math.Clamp(Math.trunc(Number(stats[key]) || 5), 5, 120);
        }
        return {
          userId: String(row.user_id), username: String(row.username || 'Player').slice(0, 32),
          petName: String(row.pet_name || 'MEGU').slice(0, 32), petId: String(row.pet_id).toUpperCase(),
          shiny: meguPublicBoolean(row.shiny), weight: Phaser.Math.Clamp(Number(row.weight) || 3, 0, 100),
          sumoRankIndex: Phaser.Math.Clamp(Math.trunc(Number(row.sumo_rank_index) || 0), 0, SUMO_RANKS.length - 1),
          sumoStats: cleanStats, raceSkill: String(row.race_skill || 'explosive_start')
        };
      });
  } catch (error) {
    console.warn('[MEGU] Could not load public competition guests. Apply supabase_megu_competition_guests.sql:', error.message || error);
    return [];
  }
}

async function fetchMeguPublicPetForms() {
  if (!meguSupabase || !meguAuthUser) return new Map();
  // This narrow RPC exposes only the public pet form for discoverable users;
  // it avoids exposing another player's complete private save_data payload.
  const { data, error } = await meguSupabase.rpc('get_megu_public_pet_forms');
  if (error) {
    console.warn('[MEGU] Public shiny-form lookup failed. Apply supabase_megu_shiny_rpc.sql:', error.message);
    return new Map();
  }
  return new Map((Array.isArray(data) ? data : []).filter(row => row && row.user_id).map(row => [String(row.user_id), row]));
}
function meguPublicBoolean(value) {
  return value === true || value === 1 || (typeof value === 'string' && ['true', '1', 't', 'yes'].includes(value.trim().toLowerCase()));
}
async function fetchMeguPublicProfiles() {
  if (!meguSupabase || !meguAuthUser) throw new Error('Log in to invite friends.');
  // Server-side filtering keeps opted-out accounts out of both Invite and Visit.
  const [{ data, error }, petForms] = await Promise.all([
    meguSupabase.rpc('get_megu_discoverable_profiles'),
    fetchMeguPublicPetForms()
  ]);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).filter(row => row && row.user_id && row.user_id !== meguAuthUser.id)
    .map(row => {
      // Public-profile RPC versions may expose accessory data in either field.
      const saved = row.save_data && typeof row.save_data === 'object' ? row.save_data : (row.public_data && typeof row.public_data === 'object' ? row.public_data : {});
      const petForm = petForms.get(String(row.user_id)) || {};
      const rawAccessories = [row.accessories, saved.accessories, row.public_data && row.public_data.accessories]
        .find(value => Array.isArray(value));
      const legacyAccessory = [row.accessory, saved.accessory, row.public_data && row.public_data.accessory]
        .find(value => value && typeof value === 'object' && value.id);
      const accessories = (rawAccessories || (legacyAccessory ? [legacyAccessory] : []))
        .filter(value => value && typeof value === 'object' && value.id)
        .map(value => JSON.parse(JSON.stringify(value)));
      const shiny = [row.shiny, petForm.shiny, saved.shiny, row.public_data && row.public_data.shiny]
        .some(meguPublicBoolean);
      return { userId: String(row.user_id), username: String(row.username || 'Player'),
        petName: String(row.pet_name || 'MEGU'), petId: String(row.pet_id || petForm.pet_id || saved.petId || 'ID1').toUpperCase(),
        level: Number(row.level ?? row.pet_level ?? petForm.level ?? saved.level) || null, shiny, accessories };
    });
}

// House visits use a narrowly scoped RPC rather than reading another player's
// private megu_saves row from the browser. The RPC returns only public room data.
async function fetchMeguPublicHouse(userId) {
  if (!meguSupabase || !meguAuthUser) throw new Error('Log in to visit a house.');
  const { data, error } = await meguSupabase.rpc('get_megu_public_house', { target_user_id: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !Array.isArray(row.furn) || !Number.isFinite(Number(row.bg))) {
    throw new Error('This player has not published a visitable house yet.');
  }
  const saved = row.save_data && typeof row.save_data === 'object' ? row.save_data : (row.public_data && typeof row.public_data === 'object' ? row.public_data : {});
  const petForms = await fetchMeguPublicPetForms();
  const petForm = petForms.get(String(userId)) || {};
  const rawAccessories = [row.accessories, saved.accessories, row.public_data && row.public_data.accessories]
    .find(value => Array.isArray(value));
  const legacyAccessory = [row.accessory, saved.accessory, row.public_data && row.public_data.accessory]
    .find(value => value && typeof value === 'object' && value.id);
  const accessories = (rawAccessories || (legacyAccessory ? [legacyAccessory] : []))
    .filter(value => value && typeof value === 'object' && value.id)
    .map(value => JSON.parse(JSON.stringify(value)));
  // The public-house RPC may intentionally omit the private save_data JSON.
  // Fetch the board's public message list through its dedicated, read-only RPC
  // so visitor boards do not depend on the shape of the house RPC response.
  let boardMessages = [
    row.messageBoardMessages, row.message_board_messages,
    saved.messageBoardMessages, saved.message_board_messages,
    row.public_data && row.public_data.messageBoardMessages,
    row.public_data && row.public_data.message_board_messages
  ].find(Array.isArray) || [];
  try {
    const { data: publicMessages, error: boardError } = await meguSupabase.rpc(
      'get_megu_public_board_messages', { target_user_id: userId }
    );
    if (boardError) throw boardError;
    const result = Array.isArray(publicMessages) && publicMessages.length === 1 && Array.isArray(publicMessages[0])
      ? publicMessages[0] : publicMessages;
    if (Array.isArray(result)) boardMessages = result;
  } catch (error) {
    console.warn('[MEGU] Could not load the dedicated public message-board feed; using messages included with the house response:', error.message || error);
  }
  return {
    userId: String(row.user_id || userId), username: String(row.username || 'Player'),
    petName: String(row.pet_name || 'MEGU'), petId: String(row.pet_id || petForm.pet_id || saved.petId || 'ID1').toUpperCase(), shiny: [row.shiny, petForm.shiny, saved.shiny, row.public_data && row.public_data.shiny].some(meguPublicBoolean),
    bg: Number(row.bg), furn: row.furn.filter(item => item && typeof item === 'object'), accessories,
    messageBoardMessages: boardMessages.filter(item => item && typeof item === 'object')
  };
}

async function transferMeguGift(targetUserId, category, itemId, quantity = 1) {
  if (!meguSupabase || !meguAuthUser) throw new Error('Log in to send gifts.');
  if (!targetUserId || targetUserId === meguAuthUser.id) throw new Error('You cannot gift yourself.');
  const { data, error } = await meguSupabase.rpc('gift_megu_inventory_item', {
    p_target_user_id: targetUserId,
    p_category: category,
    p_item_id: String(itemId),
    p_quantity: Math.max(1, Math.min(99, Math.trunc(Number(quantity) || 1))),
    p_cycle_day: localDailyChargeCycleDay()
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (result && result.success === false) throw new Error(result.message || 'The gift could not be transferred.');
  return result || { success: true };
}

async function loadMeguCloudData(user, fallbackPetName = '') {
  const { data, error } = await meguSupabase.from(MEGU_SAVE_TABLE)
    .select('username, pet_name, save_data').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (data && data.save_data && typeof data.save_data === 'object') {
    GAME_ATTRIBUTES_IS_NEW_PLAYER = false;
    GAME_ATTRIBUTES = { ...DEFAULT_GAME_ATTRIBUTES, ...data.save_data };
    // Migrate the former single-accessory save into the multi-accessory format.
    if (!Array.isArray(GAME_ATTRIBUTES.accessories) || (!GAME_ATTRIBUTES.accessories.length && GAME_ATTRIBUTES.accessory && GAME_ATTRIBUTES.accessory.id)) {
      GAME_ATTRIBUTES.accessories = GAME_ATTRIBUTES.accessory && GAME_ATTRIBUTES.accessory.id
        ? [JSON.parse(JSON.stringify(GAME_ATTRIBUTES.accessory))] : [];
    }
    GAME_ATTRIBUTES.accessories = GAME_ATTRIBUTES.accessories.filter(item => item && item.id != null)
      .map(item => JSON.parse(JSON.stringify(item)));
    GAME_ATTRIBUTES.accessory = GAME_ATTRIBUTES.accessories[0] || { id: '', poses: {} };
    GAME_ATTRIBUTES.userName = String(data.username || user.user_metadata?.username || GAME_ATTRIBUTES.userName || '');
    GAME_ATTRIBUTES.petName = String(data.pet_name || GAME_ATTRIBUTES.petName || '');
    persistGameAttributes();
  } else {
    GAME_ATTRIBUTES_IS_NEW_PLAYER = true;
    GAME_ATTRIBUTES = { ...DEFAULT_GAME_ATTRIBUTES };
    GAME_ATTRIBUTES.userName = String(user.user_metadata?.username || GAME_ATTRIBUTES.userName || '');
    GAME_ATTRIBUTES.petName = String(fallbackPetName || user.user_metadata?.pet_name || GAME_ATTRIBUTES.petName || '');
    meguCloudReady = true;
    await saveMeguCloudData();
    return;
  }
  meguCloudReady = true;
  await saveMeguCloudData();
}
async function activateMeguAccount(user, fallbackPetName = '') {
  meguAuthUser = user;
  await refreshMeguUserRole();
  await loadMeguCloudData(user, fallbackPetName);
  const username = GAME_ATTRIBUTES.userName || user.user_metadata?.username || 'Player';
  document.getElementById('megu-account-label').textContent = `Owner: ${username}`;
  hideMeguAuth();
  // Award after the login overlay is gone so the charging animation is visible.
  // This runs against the authenticated cloud save, never the temporary data.
  window.game?.scene?.getScene('default')?.reconcileBackgroundTime?.();
}
function closeMeguNameChangeUi() {
  const screen = document.getElementById('megu-namechange-screen');
  if (screen) screen.hidden = true;
}
async function confirmMeguNameChange() {
  const userInput = document.getElementById('megu-new-username');
  const petInput = document.getElementById('megu-new-petname');
  const personalMessageInput = document.getElementById('megu-new-personal-message');
  const message = document.getElementById('megu-namechange-message');
  const confirm = document.getElementById('megu-namechange-confirm');
  const username = String(userInput?.value || '').trim();
  const petName = String(petInput?.value || '').trim();
  const personalMessage = String(personalMessageInput?.value || '').trim();
  if (!username || !petName) { message.textContent = 'Please enter both names.'; return; }
  if (username.length > 24 || petName.length > 32 || personalMessage.length > 120) { message.textContent = 'One or more entries are too long.'; return; }
  if (!meguAuthUser || !meguCloudReady) { message.textContent = 'Please log in first.'; return; }
  confirm.disabled = true;
  message.style.color = '#667085';
  message.textContent = 'Saving…';
  const oldUsername = GAME_ATTRIBUTES.userName;
  const oldPetName = GAME_ATTRIBUTES.petName;
  const oldPersonalMessage = GAME_ATTRIBUTES.personalMessage;
  try {
    // Display names are game profile data. The Supabase auth user ID and
    // username-derived login email are deliberately never changed here.
    GAME_ATTRIBUTES.userName = username;
    GAME_ATTRIBUTES.petName = petName;
    GAME_ATTRIBUTES.personalMessage = personalMessage;
    persistGameAttributes();
    const scene = window.game?.scene?.getScene('Main');
    if (scene && scene.scene.isActive()) {
      scene.updateGameAttributeDisplay?.();
      scene.fitFooterNameText?.(scene.ownerNameText, username);
      scene.fitFooterNameText?.(scene.petNameText, petName);
    }
    const accountLabel = document.getElementById('megu-account-label');
    if (accountLabel) accountLabel.textContent = `Owner: ${username}`;
    // Persist editable display names in the game profile only. The login name,
    // auth email, and Supabase user ID remain unchanged.
    await saveMeguCloudData();
    message.style.color = '#34734a';
    message.textContent = 'Names updated.';
    closeMeguNameChangeUi();
  } catch (error) {
    GAME_ATTRIBUTES.userName = oldUsername;
    GAME_ATTRIBUTES.petName = oldPetName;
    GAME_ATTRIBUTES.personalMessage = oldPersonalMessage;
    persistGameAttributes();
    const scene = window.game?.scene?.getScene('Main');
    if (scene && scene.scene.isActive()) {
      scene.updateGameAttributeDisplay?.();
      scene.fitFooterNameText?.(scene.ownerNameText, String(oldUsername || ''));
      scene.fitFooterNameText?.(scene.petNameText, String(oldPetName || ''));
    }
    const accountLabel = document.getElementById('megu-account-label');
    if (accountLabel) accountLabel.textContent = `Owner: ${oldUsername || ''}`;
    message.style.color = '#a13b32';
    message.textContent = `Could not save names: ${error.message || error}`;
  } finally {
    confirm.disabled = false;
  }
}
document.getElementById('megu-namechange-cancel')?.addEventListener('click', closeMeguNameChangeUi);
document.getElementById('megu-namechange-confirm')?.addEventListener('click', confirmMeguNameChange);
document.getElementById('megu-namechange-screen')?.addEventListener('click', event => {
  if (event.target?.id === 'megu-namechange-screen') closeMeguNameChangeUi();
});

async function initializeMeguAccounts() {
  const cfg = window.MEGU_BACKEND_CONFIG;
  if (!window.MEGU_BACKEND_CONFIGURED || !window.supabase?.createClient) {
    showMeguAuth();
    setMeguAuthMessage('Supabase configuration or library is unavailable. Check your connection and project settings.');
    return;
  }
  meguSupabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const { data, error } = await meguSupabase.auth.getSession();
  if (error) console.warn('[MEGU] Session lookup:', error.message);
  if (data?.session?.user) {
    try { await activateMeguAccount(data.session.user); }
    catch (e) { console.error('[MEGU] Could not load cloud save:', e); showMeguAuth(); setMeguAuthMessage(`Could not load your save: ${e.message}`); }
  } else {
    showMeguAuth();
  }
  meguSupabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { meguAuthUser = null; meguLoginUsername = ''; meguUserRole = 'player'; meguCloudReady = false; showMeguAuth(); }
  });
}
async function submitMeguAuth(event) {
  event.preventDefault();
  if (!meguSupabase) { setMeguAuthMessage('Supabase is not initialized.'); return; }
  const username = document.getElementById('megu-username').value.trim();
  const petName = document.getElementById('megu-petname').value.trim();
  const password = document.getElementById('megu-password').value;
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) { setMeguAuthMessage('Username must be 3–24 letters, numbers, or underscores.'); return; }
  if (password.length < 6) { setMeguAuthMessage('Password must be at least 6 characters.'); return; }
  if (meguAuthMode === 'register' && !petName) { setMeguAuthMessage('Please enter your MEGU name.'); return; }
  const submit = document.getElementById('megu-auth-submit');
  submit.disabled = true; submit.textContent = 'Please wait…'; setMeguAuthMessage('', false);
  try {
    meguLoginUsername = username;
    const email = meguUsernameEmail(meguLoginUsername);
    let result;
    if (meguAuthMode === 'register') {
      result = await meguSupabase.auth.signUp({
        email, password,
        options: { data: { username, pet_name: petName } }
      });
      if (result.error) throw result.error;
      if (!result.data.session || !result.data.user) {
        setMeguAuthMessage('Account created. Disable email confirmations in Supabase Authentication settings, then log in.', false);
        return;
      }
      GAME_ATTRIBUTES.userName = username;
      GAME_ATTRIBUTES.petName = petName;
      await activateMeguAccount(result.data.user, petName);
      startMeguGame();
    } else {
      result = await meguSupabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      await activateMeguAccount(result.data.user);
      startMeguGame();
    }
    setMeguAuthMessage('');
  } catch (e) {
    console.error('[MEGU] Authentication failed:', e);
    const msg = String(e.message || 'Authentication failed');
    setMeguAuthMessage(msg.includes('Invalid login credentials') ? 'Incorrect username or password.' : msg);
  } finally {
    submit.disabled = false;
    submit.textContent = meguAuthMode === 'register' ? 'Create account' : 'Log in';
  }
}
document.getElementById('megu-login-tab').addEventListener('click', () => setMeguAuthMode('login'));
document.getElementById('megu-register-tab').addEventListener('click', () => setMeguAuthMode('register'));
document.getElementById('megu-auth-form').addEventListener('submit', submitMeguAuth);
async function logoutMeguAccount() {
  if (!meguSupabase) return;
  try {
    // Flush the active account's save before clearing this browser's session data.
    if (meguCloudSaveTimer) { clearTimeout(meguCloudSaveTimer); meguCloudSaveTimer = null; }
    if (meguAuthUser && meguCloudReady) await saveMeguCloudData();
    const { error } = await meguSupabase.auth.signOut();
    if (error) throw error;

    // Zero the in-memory game attributes, then remove the local account cache.
    // The cloud save remains intact and will be restored when that user logs in again.
    GAME_ATTRIBUTES = Object.fromEntries(Object.entries(GAME_ATTRIBUTES).map(([key, value]) => [
      key, Array.isArray(value) ? [] : (typeof value === 'number' ? 0 : (typeof value === 'boolean' ? false : ''))
    ]));
    try {
      localStorage.removeItem(GAME_ATTRIBUTES_KEY);
      localStorage.removeItem(HOUSE_LAYOUTS_KEY);
    } catch (storageError) {
      console.warn('[MEGU] Could not clear local game cache:', storageError);
    }

    // A full reload resets every scene/global runtime variable and recreates
    // the initial splash before returning to the login screen.
    window.location.reload();
  } catch (error) {
    console.error('[MEGU] Logout failed:', error);
    const scene = window.game && window.game.scene && window.game.scene.getScene('Main');
    if (scene && typeof scene.showMeguMessage === 'function') scene.showMeguMessage(`Logout failed: ${error.message || error}`, false, 0, true);
  }
}
document.getElementById('megu-logout-button').addEventListener('click', logoutMeguAccount);

// Account backup contains game/profile data and local house-layout cards only.
// Authentication passwords, access tokens, refresh tokens, and session data are never exported.
function makeMeguBackupPayload(scene = null) {
  const safeAttributes = {};
  Object.entries(GAME_ATTRIBUTES || {}).forEach(([key, value]) => {
    if (!/(password|passwd|token|session|secret|credential|auth)/i.test(key)) safeAttributes[key] = value;
  });
  let houseLayouts = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HOUSE_LAYOUTS_KEY) || '[]');
    houseLayouts = Array.isArray(parsed) ? parsed : [];
  } catch (_) {}
  return {
    format: 'kawaii-pet-megu-account-backup',
    format_version: 1,
    exported_at: new Date().toISOString(),
    account: { username: String(GAME_ATTRIBUTES.userName || meguAuthUser?.user_metadata?.username || '') },
    game_attributes: safeAttributes,
    house_layouts: houseLayouts,
    settings: {
      language: localStorage.getItem('tama.language') === 'ja' ? 'ja' : 'en',
      bgm_volume: Number.isFinite(Number(scene?.musicVolume)) ? Number(scene.musicVolume) : null,
      sfx_volume: Number.isFinite(Number(scene?.sfxVolume)) ? Number(scene.sfxVolume) : null
    }
  };
}
async function exportMeguAccountBackup(scene = null) {
  if (!meguAuthUser || !meguCloudReady) { scene?.showMeguMessage?.('Log in before exporting a backup', false, 0, true); return; }
  try {
    if (meguCloudSaveTimer) { clearTimeout(meguCloudSaveTimer); meguCloudSaveTimer = null; }
    await saveMeguCloudData();
    const payload = makeMeguBackupPayload(scene);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const username = String(payload.account.username || 'account').replace(/[^A-Za-z0-9_-]/g, '_');
    anchor.href = url;
    anchor.download = `megu_backup_${username}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    scene?.showMeguMessage?.('Account backup exported', false, 0, true);
  } catch (error) {
    console.error('[MEGU] Backup export failed:', error);
    scene?.showMeguMessage?.('Could not export account backup', false, 0, true);
  }
}
async function restoreMeguAccountBackupFile(file, scene = null) {
  if (!meguAuthUser || !meguCloudReady) throw new Error('Log in before restoring a backup.');
  if (!file || file.size > 10 * 1024 * 1024) throw new Error('Backup file is missing or larger than 10 MB.');
  const backup = JSON.parse(await file.text());
  if (!backup || backup.format !== 'kawaii-pet-megu-account-backup' || backup.format_version !== 1 ||
      !backup.game_attributes || typeof backup.game_attributes !== 'object' || Array.isArray(backup.game_attributes)) {
    throw new Error('This is not a supported MEGU account backup.');
  }
  const incoming = { ...backup.game_attributes };
  Object.keys(incoming).forEach(key => { if (/(password|passwd|token|session|secret|credential|auth)/i.test(key)) delete incoming[key]; });
  if (incoming.furn != null && !Array.isArray(incoming.furn)) throw new Error('The backup contains an invalid house layout.');
  if (incoming.petId != null && !/^ID\d+$/i.test(String(incoming.petId))) throw new Error('The backup contains an invalid MEGU character ID.');
  if (backup.house_layouts != null && !Array.isArray(backup.house_layouts)) throw new Error('The backup contains invalid saved house cards.');
  if (!window.confirm(`Restore this MEGU backup${backup.account?.username ? ` from ${backup.account.username}` : ''}? Your current game data will be replaced.`)) return false;

  const previousAttributes = GAME_ATTRIBUTES;
  let previousLayouts = '[]';
  try { previousLayouts = localStorage.getItem(HOUSE_LAYOUTS_KEY) || '[]'; } catch (_) {}
  try {
    GAME_ATTRIBUTES = { ...DEFAULT_GAME_ATTRIBUTES, ...incoming };
    if (!Array.isArray(GAME_ATTRIBUTES.accessories) || (!GAME_ATTRIBUTES.accessories.length && GAME_ATTRIBUTES.accessory && GAME_ATTRIBUTES.accessory.id)) {
      GAME_ATTRIBUTES.accessories = GAME_ATTRIBUTES.accessory && GAME_ATTRIBUTES.accessory.id
        ? [JSON.parse(JSON.stringify(GAME_ATTRIBUTES.accessory))] : [];
    }
    GAME_ATTRIBUTES.accessory = GAME_ATTRIBUTES.accessories[0] || { id: '', poses: {} };
    // Backups restore game progress, not the login identity or credentials.
    GAME_ATTRIBUTES.userName = String(meguAuthUser.user_metadata?.username || previousAttributes.userName || '');
    GAME_ATTRIBUTES.petName = String(incoming.petName || previousAttributes.petName || '');
    if (backup.house_layouts) localStorage.setItem(HOUSE_LAYOUTS_KEY, JSON.stringify(backup.house_layouts));
    if (backup.settings?.language === 'ja' || backup.settings?.language === 'en') localStorage.setItem('tama.language', backup.settings.language);
    localStorage.setItem(GAME_ATTRIBUTES_KEY, JSON.stringify(GAME_ATTRIBUTES));
    if (meguCloudSaveTimer) { clearTimeout(meguCloudSaveTimer); meguCloudSaveTimer = null; }
    const { error: restoreSaveError } = await meguSupabase.from(MEGU_SAVE_TABLE).upsert({
      user_id: meguAuthUser.id,
      username: String(GAME_ATTRIBUTES.userName || meguAuthUser.user_metadata?.username || ''),
      pet_name: String(GAME_ATTRIBUTES.petName || ''),
      save_data: GAME_ATTRIBUTES,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (restoreSaveError) throw restoreSaveError;
    if (backup.settings && scene) {
      if (Number.isFinite(Number(backup.settings.bgm_volume))) scene.setMusicVolume?.(Phaser.Math.Clamp(Number(backup.settings.bgm_volume), 0, 1));
      if (Number.isFinite(Number(backup.settings.sfx_volume))) scene.setSfxVolume?.(Phaser.Math.Clamp(Number(backup.settings.sfx_volume), 0, 1));
    }
    scene?.showMeguMessage?.('Backup restored. Reloading your house…', false, 0, true);
    window.location.reload();
    return true;
  } catch (error) {
    GAME_ATTRIBUTES = previousAttributes;
    try { localStorage.setItem(GAME_ATTRIBUTES_KEY, JSON.stringify(previousAttributes)); localStorage.setItem(HOUSE_LAYOUTS_KEY, previousLayouts); } catch (_) {}
    throw error;
  }
}
const meguBackupFileInput = document.getElementById('megu-backup-file');
meguBackupFileInput.addEventListener('change', async event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const scene = window.game?.scene?.getScene('Main');
  try { await restoreMeguAccountBackupFile(file, scene); }
  catch (error) {
    console.error('[MEGU] Backup restore failed:', error);
    scene?.showMeguMessage?.(error.message || 'Could not restore backup', false, 0, true);
    if (!scene) setMeguAuthMessage(error.message || 'Could not restore backup');
  } finally { event.target.value = ''; }
});
function chooseMeguAccountBackup(scene = null) {
  if (!meguAuthUser || !meguCloudReady) { scene?.showMeguMessage?.('Log in before restoring a backup', false, 0, true); return; }
  meguBackupFileInput.click();
}
