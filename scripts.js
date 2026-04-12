// ══════════════════════════════════════════════════════════════
// Camply TTRPG Manager — Core
// Auth, DB, vues, roster, illustration, routing
// ══════════════════════════════════════════════════════════════

// ── État global ───────────────────────────────────────────────
let currentUser      = null;
let isAppReady       = false;
let chars            = {};
let editingId        = null;
let state            = null;
let allTags          = [];
let activeTagFilters = [];
let charTagMap       = {};
let followedChars    = {};
let followedIds      = [];
let followedTagMap   = {};
let filterFollowed   = false;

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

async function doDiscordLogin() {
  const btn   = document.getElementById('btn-discord');
  const errEl = document.getElementById('discord-error');
  errEl.classList.remove('show');
  btn.disabled = true;
  btn.innerHTML = `<span style="opacity:0.7">${t('auth_redirecting')}</span>`;
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    errEl.textContent = t('auth_error_prefix') + error.message;
    errEl.classList.add('show');
    btn.disabled = false;
    btn.innerHTML = discordBtnInner();
  }
}

function discordBtnInner() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
  <span data-i18n="auth_login_discord">${t('auth_login_discord')}</span>`;
}

async function doLogout() {
  toggleUserMenu(false);
  await sb.auth.signOut();
}

function toggleUserMenu(force) {
  const dd = document.getElementById('user-dropdown');
  dd.classList.toggle('open', force !== undefined ? force : !dd.classList.contains('open'));
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('user-menu-wrap');
  if (wrap && !wrap.contains(e.target)) toggleUserMenu(false);
});

function updateUserUI(user) {
  if (!user) return;
  const username = user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.user_metadata?.username
    || user.email?.split('@')[0]
    || 'Joueur';
  document.getElementById('user-avatar').textContent = username.charAt(0).toUpperCase();
  document.getElementById('user-label').textContent  = username;
  document.getElementById('dd-username').textContent = username;
  document.getElementById('dd-email').textContent    = user.email || '';
}

// ══════════════════════════════════════════════════════════════
// DB — PERSONNAGES
// ══════════════════════════════════════════════════════════════

async function loadCharsFromDB() {
  const { data, error } = await sb
    .from('characters')
    .select('id, name, rank, is_public, share_code, data, updated_at')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false });
  if (error) { console.error('Erreur chargement:', error); return; }
  chars = {};
  (data || []).forEach(row => {
    chars[row.id] = {
      ...row.data,
      name: row.name, rank: row.rank,
      is_public: row.is_public, share_code: row.share_code,
      _db_id: row.id,
    };
  });
  await loadTagsFromDB();
  await loadFollowedCharsFromDB();
}

async function saveCharToDB() {
  if (!state.name.trim()) { alert(t('alert_char_no_name')); return; }
  setSaveIndicator('saving', t('save_saving'));
  const payload = {
    user_id:   currentUser.id,
    name:      state.name.trim(),
    rank:      state.rank,
    is_public: state.is_public || false,
    data:      state,
  };
  const isValidUUID = editingId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editingId);
  const result = isValidUUID
    ? await sb.from('characters').update(payload).eq('id', editingId).select('id, share_code').single()
    : await sb.from('characters').insert(payload).select('id, share_code').single();
  if (!isValidUUID && editingId) editingId = null;
  if (result.error) {
    setSaveIndicator('error', t('save_error'));
    showToast(t('toast_char_save_error'));
    return;
  }
  editingId        = result.data.id;
  state.share_code = result.data.share_code;
  await saveCharTagsToDB(editingId);
  chars[editingId]    = { ...state, _db_id: editingId };
  charTagMap[editingId] = (state.tags || []).map(tg => tg.id);
  const scBox = document.getElementById('share-code-box');
  const scVal = document.getElementById('share-code-val');
  if (scBox && scVal && state.is_public && state.share_code) {
    scVal.textContent  = state.share_code;
    scBox.style.display = 'flex';
  }
  setSaveIndicator('saved', t('save_saved'));
  showToast(t('toast_char_saved'));
}

async function deleteCharFromDB(id) {
  const name = chars[id]?.name || '';
  if (!confirm(ti('confirm_delete_char', { name }))) return;
  const tagIds         = charTagMap[id] || [];
  const illustrationUrl = chars[id]?.illustration_url || '';
  const { error } = await sb.from('characters').delete().eq('id', id);
  if (error) { showToast(t('toast_char_deleted_error')); return; }
  delete chars[id];
  delete charTagMap[id];
  if (illustrationUrl) await deleteStorageFile(illustrationUrl);
  for (const tagId of tagIds) {
  const { count: c1 } = await sb.from('character_tags')
    .select('*', { count:'exact', head:true }).eq('tag_id', tagId);
  const { count: c2 } = await sb.from('followed_character_tags')
    .select('*', { count:'exact', head:true }).eq('tag_id', tagId);
  if ((c1 + c2) === 0) {
    await sb.from('tags').delete().eq('id', tagId);
    allTags = allTags.filter(tg => tg.id !== tagId);
  }
}
  renderList();
}

// ══════════════════════════════════════════════════════════════
// DB — TAGS
// ══════════════════════════════════════════════════════════════

async function loadTagsFromDB() {
  const { data: tags } = await sb.from('tags')
    .select('*').eq('user_id', currentUser.id).order('name');
  allTags = tags || [];
  const { data: charTags } = await sb.from('character_tags').select('character_id, tag_id');
  charTagMap = {};
  (charTags || []).forEach(({ character_id, tag_id }) => {
    if (!charTagMap[character_id]) charTagMap[character_id] = [];
    charTagMap[character_id].push(tag_id);
  });
  const { data: followedTags } = await sb.from('followed_character_tags')
    .select('character_id, tag_id').eq('user_id', currentUser.id);
  followedTagMap = {};
  (followedTags || []).forEach(({ character_id, tag_id }) => {
    if (!followedTagMap[character_id]) followedTagMap[character_id] = [];
    followedTagMap[character_id].push(tag_id);
  });
}

// ══════════════════════════════════════════════════════════════
// DB — SUIVI DE PERSONNAGES
// ══════════════════════════════════════════════════════════════

async function loadFollowedCharsFromDB() {
  const { data: followed } = await sb.from('followed_characters')
    .select('character_id').eq('user_id', currentUser.id);
  followedIds = (followed || []).map(r => r.character_id);
  if (!followedIds.length) { followedChars = {}; return; }
  const { data: chars_data } = await sb.from('characters')
    .select('id, name, rank, is_public, share_code, data, user_id')
    .in('id', followedIds).eq('is_public', true);
  const ownerIds = [...new Set((chars_data || []).map(r => r.user_id))];
  let ownerMap = {};
  if (ownerIds.length) {
    const { data: profiles } = await sb.from('profiles')
      .select('id, username').in('id', ownerIds);
    (profiles || []).forEach(p => { ownerMap[p.id] = p.username; });
  }
  followedChars = {};
  (chars_data || []).forEach(row => {
    followedChars[row.id] = {
      ...row.data, name: row.name, rank: row.rank,
      is_public: row.is_public, share_code: row.share_code, _db_id: row.id,
      _followed: true, _owner_name: ownerMap[row.user_id] || '?',
    };
  });
}

async function followCharByCode(code) {
  if (!code.trim()) return;
  const clean = code.trim().toUpperCase();
  const { data, error } = await sb.from('characters')
    .select('id, name, user_id, is_public')
    .eq('share_code', clean).eq('is_public', true).single();
  if (error || !data) { showToast(t('toast_char_not_found')); return; }
  if (data.user_id === currentUser.id) { showToast(t('toast_char_own')); return; }
  if (followedIds.includes(data.id))  { showToast(t('toast_char_already_followed')); return; }
 
  const { error: insertError } = await sb.from('followed_characters')
    .insert({ user_id: currentUser.id, character_id: data.id });
  if (insertError) { showToast(t('toast_char_follow_error')); return; }
 
  followedIds.push(data.id);
  await syncOwnerTagsToMe('char', data.id);   // ← sync tags propriétaire
  await loadFollowedCharsFromDB();
  await loadTagsFromDB();
  document.getElementById('follow-code-input').value = '';
  renderList();
  showToast(ti('toast_char_added', { name: data.name }));
}

async function unfollowChar(charId) {
  const char = followedChars[charId];
  const blockingCampaigns = await getFollowedCampaignTitlesByItem('char', char?.share_code);
  if (blockingCampaigns.length) {
    showToast(ti('toast_unfollow_blocked_by_campaigns', {
      type: t('campaign_type_char'),
      campaigns: blockingCampaigns.join(', ')
    }));
    return;
  }
  // 1. Supprime les tags locaux liés à ce personnage
  await sb.from('followed_character_tags')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('character_id', charId);
 
  // 2. Désabonnement
  await sb.from('followed_characters')
    .delete().eq('user_id', currentUser.id).eq('character_id', charId);
 
  followedIds = followedIds.filter(id => id !== charId);
  delete followedChars[charId];
  delete followedTagMap[charId];
 
  // 3. Purge les tags orphelins dans `tags`
  await cleanupOrphanTags('char');
  await loadTagsFromDB();   // rafraîchit allTags + charTagMap + followedTagMap
 
  renderList();
  showToast(t('toast_char_unfollowed'));
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════

async function init() {
  const safetyTimer = setTimeout(() => onSignedOut(), 5000);
  try {
    const { data: { session } } = await sb.auth.getSession();
    clearTimeout(safetyTimer);
    if (session?.user) await onSignedIn(session.user);
    else onSignedOut();
  } catch (e) {
    clearTimeout(safetyTimer);
    onSignedOut();
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && !isAppReady) await onSignedIn(session.user);
    else if (event === 'SIGNED_OUT') { isAppReady = false; onSignedOut(); }
  });
}

async function onSignedIn(user) {
  currentUser = user;
  updateUserUI(currentUser);
  const username = user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.user_metadata?.username
    || user.email?.split('@')[0]
    || 'Joueur';
  await sb.from('profiles').update({ username }).eq('id', user.id);
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('loading-overlay').classList.add('active');
  document.getElementById('app').style.display = 'flex';
  await unreadMarkers.initFromDB(currentUser.id);
  await Promise.all([
    loadCharsFromDB(),
    loadChroniclesFromDB(),
    loadDocumentsFromDB(),
  ]);
  await Promise.all([
    loadCampaignsFromDB(),
    (typeof ensureMapLayersCacheLoaded === 'function'
      ? ensureMapLayersCacheLoaded()
      : Promise.resolve()),
  ]);
  document.getElementById('loading-overlay').classList.remove('active');
  isAppReady = true;
  if (!navigateFromHash()) {
    renderList();
    showView('list');
  }
}

function onSignedOut() {
  currentUser = null;
  unreadMarkers.resetCache();
  chars = {};
  document.getElementById('loading-overlay').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app').style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// VUES
// ══════════════════════════════════════════════════════════════

function showView(view) {
  const views = [
    'list', 'editor', 'shared',
    'chronicles', 'chr-detail', 'chr-editor', 'entry-editor', 'entry-reader',
    'documents', 'doc-editor', 'doc-reader',
    'campaigns', 'campaign-detail', 'campaign-editor',
    'map',
    'rulebook',
  ];
  views.forEach(v => document.getElementById('view-' + v)?.classList.toggle('active', v === view));

  const inPer      = ['list', 'editor', 'shared'].includes(view);
  const inChr      = ['chronicles', 'chr-detail', 'chr-editor', 'entry-editor', 'entry-reader'].includes(view);
  const inDoc      = ['documents', 'doc-editor', 'doc-reader'].includes(view);
  const inCampaign = ['campaigns', 'campaign-detail', 'campaign-editor'].includes(view);
  const inMap = view === 'map';
  const inRulebook = view === 'rulebook';

  document.getElementById('nav-list').classList.toggle('active', inPer);
  document.getElementById('nav-chronicles').classList.toggle('active', inChr);
  document.getElementById('nav-documents').classList.toggle('active', inDoc);
  document.getElementById('nav-campaigns').classList.toggle('active', inCampaign);
  document.getElementById('nav-map')?.classList.toggle('active', inMap);
  document.getElementById('nav-rulebook')?.classList.toggle('active', inRulebook);

  // Boutons de partage
  const shareButtons = {
    'share-btn':              view === 'editor',
    'chr-share-btn':          view === 'chr-editor',
    'doc-share-btn':          view === 'doc-editor',
    'campaign-share-btn':     view === 'campaign-editor',
    'chr-detail-share-btn':   view === 'chr-detail',
    'entry-reader-share-btn': view === 'entry-reader',
    'doc-reader-share-btn':   view === 'doc-reader',
    'shared-char-share-btn':  view === 'shared',
  };
  Object.entries(shareButtons).forEach(([id, visible]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? 'flex' : 'none';
  });

  const si = document.getElementById('save-indicator');
  if (si) si.classList.remove('show');

  if (view === 'editor') {
    const mobilePreviewByDefault = window.matchMedia('(max-width: 768px)').matches;
    switchMobTab(mobilePreviewByDefault ? 'preview' : 'form');
    clearHash();
  }
  if (view === 'list')            { renderList(); clearHash(); }
  if (view === 'chronicles')      { renderChroniclesList(); clearHash(); }
  if (view === 'documents')       { renderDocumentsList(); clearHash(); }
  if (view === 'campaigns')       { renderCampaignsList(); clearHash(); }
  if (view === 'entry-editor')    { switchEntryTab('form'); clearHash(); }
  if (view === 'doc-editor')      { switchDocTab('form'); clearHash(); }
  if (view === 'chr-editor')      clearHash();
  if (view === 'campaign-editor') clearHash();
  if (view === 'map') { clearHash(); initMap(); }
  if (view === 'rulebook') { clearHash(); loadRulebook(); }
  applyTranslations();
}

// ══════════════════════════════════════════════════════════════
// ROSTER — liste et cartes
// ══════════════════════════════════════════════════════════════

function renderList() {
  renderRosterFilters();
  let keys         = Object.keys(chars).sort((a,b) => (chars[a].name||'').localeCompare(chars[b].name||''));
  let followedKeys = Object.keys(followedChars).sort((a,b) => (followedChars[a].name||'').localeCompare(followedChars[b].name||''));
  if (filterFollowed) keys = [];
  if (activeTagFilters.length) {
    keys         = keys.filter(id => activeTagFilters.every(fid => (charTagMap[id] || []).includes(fid)));
    followedKeys = followedKeys.filter(id => activeTagFilters.every(fid => (followedTagMap[id] || []).includes(fid)));
  }
  const total = Object.keys(chars).length + Object.keys(followedChars).length;
  document.getElementById('list-count-badge').textContent = total ? `(${total})` : '';
  const grid  = document.getElementById('char-grid');
  const empty = document.getElementById('empty-state');
  const allKeys = [...keys, ...followedKeys];
  if (!allKeys.length) { grid.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  grid.innerHTML = [
    ...keys.map(id         => cardHTML(id, chars[id], false)),
    ...followedKeys.map(id => cardHTML(id, followedChars[id], true)),
  ].join('');
  unreadMarkers.refreshNavBadges({ followedChars, followedDocuments, followedChronicles, chrEntries });
}

function cardHTML(id, c, isFollowed = false) {
  // Le corps de la carte est délégué à game-system.js
  const body     = renderCharCardBody(c);
  const cardTags = _buildTagChips(id, isFollowed ? followedTagMap : charTagMap);

  if (isFollowed) {
    const unreadDot = unreadMarkers.cardDotHTML(unreadMarkers.isCharacterUnread(id, false));
    return `<div class="char-card" onclick="showSharedChar(followedChars['${id}'])">${unreadDot}
      ${c.illustration_url ? _cardIllus(c) : ''}
      <div class="card-actions">
        <button class="icon-btn" onclick="event.stopPropagation();editFollowedTags('${id}')"
          title="${t('card_manage_tags')}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M1 4h14M1 8h10M1 12h6"/>
          </svg>
        </button>
        <button class="icon-btn danger" onclick="event.stopPropagation();unfollowChar('${id}')"
          title="${t('card_unfollow')}">
          ${_trashIcon()}
        </button>
      </div>
      ${body}
      ${cardTags ? `<div class="card-tags">${cardTags}</div>` : ''}
      <div class="followed-badge">${t('followed_badge')}</div>
      <div class="card-followed-owner">${t('followed_owner_prefix')}${esc(c._owner_name)}</div>
    </div>`;
  }

  const visTag = c.is_public
    ? `<span class="card-visibility public">${t('visibility_public')}</span>`
    : `<span class="card-visibility private">${t('visibility_private')}</span>`;

  return `<div class="char-card" onclick="editChar('${id}')">
    ${c.illustration_url ? _cardIllus(c) : ''}
    <div class="card-actions">
      <button class="icon-btn" onclick="event.stopPropagation();editChar('${id}')"
        title="${t('btn_edit')}">
        ${_editIcon()}
      </button>
      <button class="icon-btn danger" onclick="event.stopPropagation();deleteCharFromDB('${id}')"
        title="${t('btn_delete')}">
        ${_trashIcon()}
      </button>
    </div>
    ${body}
    ${cardTags ? `<div class="card-tags">${cardTags}</div>` : ''}
    ${visTag}
  </div>`;
}

// Helpers HTML internes
function _cardIllus(c) {
  return `<img class="card-illus"
    src="${esc(c.illustration_url)}"
    style="object-position:center ${c.illustration_position || 0}%"
    onclick="event.stopPropagation();openLightbox('${esc(c.illustration_url)}')" alt="">`;
}
function _buildTagChips(id, tagMap) {
  return (tagMap[id] || []).map(tid => {
    const tg = allTags.find(x => x.id === tid);
    return tg
      ? `<span class="tag-chip" style="background:${tg.color}22;color:${tg.color};border:1px solid ${tg.color}44">${esc(tg.name)}</span>`
      : '';
  }).join('');
}
function _editIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3z"/></svg>`;
}
function _trashIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,4 13,4"/><path d="M5 4V2h6v2M6 7v5M10 7v5"/><path d="M4 4l1 10h6l1-10"/></svg>`;
}

// ══════════════════════════════════════════════════════════════
// VUE PARTAGÉE (personnage suivi en lecture seule)
// ══════════════════════════════════════════════════════════════

let currentSharedCharCode = null;

function showSharedChar(data) {
  document.getElementById('shared-content').innerHTML = `
    <div class="shared-banner">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="3" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="12" cy="13" r="1.5"/>
        <line x1="5.5" y1="7" x2="10.5" y2="4.3"/>
        <line x1="5.5" y1="9" x2="10.5" y2="11.7"/>
      </svg>
      ${t('shared_view_banner')}
    </div>
    ${renderCharSheet(data)}
  `;
  showView('shared');
  if (data?.id) unreadMarkers.markCharacterRead(data.id);
  unreadMarkers.refreshNavBadges({ followedChars, followedDocuments, followedChronicles, chrEntries });
  currentSharedCharCode = data.share_code || null;
  if (data.share_code) setHash('char', data.share_code);
}

function shareSharedChar() {
  if (!currentSharedCharCode) { showToast(t('toast_char_not_found')); return; }
  copyUrl(buildShareUrl('char', currentSharedCharCode));
}

// ══════════════════════════════════════════════════════════════
// ILLUSTRATION & STORAGE
// ══════════════════════════════════════════════════════════════

function illusZoneClick() {
  if (!state.illustration_url) document.getElementById('illus-input').click();
}

function setIllusPreview(url, position) {
  const img         = document.getElementById('illus-preview-img');
  const placeholder = document.getElementById('illus-placeholder');
  const zone        = document.getElementById('illus-zone');
  const sliderWrap  = document.getElementById('illus-slider-wrap');
  const slider      = document.getElementById('illus-pos-slider');
  const pos = position !== undefined ? position : (state.illustration_position || 0);
  if (url) {
    img.src = url; img.style.display = 'block';
    img.style.objectPosition = `center ${pos}%`;
    placeholder.style.display = 'none';
    zone.classList.add('has-image');
    sliderWrap.classList.add('visible');
    slider.value = pos;
  } else {
    img.src = ''; img.style.display = 'none';
    placeholder.style.display = 'flex';
    zone.classList.remove('has-image');
    sliderWrap.classList.remove('visible');
    slider.value = 0;
  }
}

function updateIllusPosition(val) {
  state.illustration_position = parseInt(val);
  const img = document.getElementById('illus-preview-img');
  if (img) img.style.objectPosition = `center ${val}%`;
  const previewImg = document.querySelector('#preview-content .preview-illus');
  if (previewImg) previewImg.style.objectPosition = `center ${val}%`;
}

function compressImage(file) {
  return new Promise((resolve) => {
    const MAX    = 1200;
    const reader = new FileReader();
    reader.onload = e => {
      const img  = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(resolve, 'image/jpeg', 0.75);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadIllustration(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { showToast(t('toast_illus_too_large')); return; }
  document.getElementById('illus-uploading').classList.add('active');
  const oldUrl = state.illustration_url || '';
  const path   = `${currentUser.id}/${editingId || ('tmp_' + Date.now())}.jpg`;
  const blob   = await compressImage(file);
  const { error } = await sb.storage
    .from('character-illustrations').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  document.getElementById('illus-uploading').classList.remove('active');
  if (error) { showToast(t('toast_illus_upload_error') + error.message); return; }
  if (oldUrl && !oldUrl.includes(path)) await deleteStorageFile(oldUrl);
  const { data } = sb.storage.from('character-illustrations').getPublicUrl(path);
  state.illustration_url      = `${data.publicUrl}?v=${Date.now()}`;
  state.illustration_position = 0;
  setIllusPreview(state.illustration_url, 0);
  updatePreview();
  showToast(t('toast_illus_added'));
  input.value = '';
}

async function deleteStorageFile(url) {
  if (!url) return;
  const match = url.match(/character-illustrations\/([^?#]+)/);
  if (match) await sb.storage.from('character-illustrations').remove([match[1]]);
}

async function removeIllustration() {
  if (!state.illustration_url) return;
  await deleteStorageFile(state.illustration_url);
  state.illustration_url      = '';
  state.illustration_position = 0;
  setIllusPreview('', 0);
  updatePreview();
}

function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// ══════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════

function setSaveIndicator(st, msg) {
  const el = document.getElementById('save-indicator');
  el.textContent = msg;
  el.className   = `save-indicator show ${st}`;
  if (st === 'saved') setTimeout(() => el.classList.remove('show'), 3000);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function normalizeMarkdownTypography(text) {
  if (!text) return '';
  return String(text).replace(/(^|[\s\(\[{"'])--(?=\s|$|[\)\]}",.!?:;])/g, '$1—');
}

function normalizeMarkdownTextarea(textarea) {
  if (!textarea) return '';
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const normalized = normalizeMarkdownTypography(textarea.value);
  if (normalized !== textarea.value) {
    textarea.value = normalized;
    const nextStart = Math.max(0, start - 1);
    const nextEnd = Math.max(0, end - 1);
    textarea.setSelectionRange(nextStart, nextEnd);
  }
  return textarea.value;
}

function renderMarkdown(md) {
  return marked.parse(normalizeMarkdownTypography(md || ''));
}

function pipRow(val, cls, max) {
  return Array.from({ length: max }, (_, i) =>
    `<div class="pip ${i < val ? cls : 'empty'}"></div>`
  ).join('');
}

// ══════════════════════════════════════════════════════════════
// ROUTAGE PAR URL (hash)
// Format : #char/CODE | #chr/CODE | #entry/CHR_CODE/ENTRY_ID
//          #doc/CODE  | #campaign/CODE
// ══════════════════════════════════════════════════════════════

function buildShareUrl(type, ...ids) {
  const base = window.location.href.split('#')[0];
  return `${base}#${type}/${ids.join('/')}`;
}

function copyUrl(url) {
  navigator.clipboard.writeText(url)
    .then(() => showToast(t('toast_url_copied')))
    .catch(() => prompt(t('share_code_prompt_short'), url));
}

function setHash(type, ...ids) {
  history.replaceState(null, '', `#${type}/${ids.join('/')}`);
}

function clearHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

function navigateFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  const [type, ...ids] = hash.split('/');
  switch (type) {
    case 'char':     return navigateToChar(ids[0]);
    case 'chr':      return navigateToChr(ids[0]);
    case 'entry':    return navigateToEntry(ids[0], ids[1]);
    case 'doc':      return navigateToDoc(ids[0]);
    case 'campaign': return navigateToCampaign(ids[0]);
    default:         return false;
  }
}

function navigateToChar(shareCode) {
  if (!shareCode) return false;
  const ownChar  = Object.values(chars).find(c => c.share_code === shareCode);
  if (ownChar)   { editChar(ownChar._db_id); return true; }
  const followed = Object.values(followedChars).find(c => c.share_code === shareCode);
  if (followed)  { showSharedChar(followed); return true; }
  sb.from('characters')
    .select('id, name, rank, is_public, share_code, data, user_id')
    .eq('share_code', shareCode).eq('is_public', true).single()
    .then(({ data: row, error }) => {
      if (error || !row) { showToast(t('toast_char_not_found')); showView('list'); renderList(); return; }
      const charData = {
        ...row.data, name: row.name, rank: row.rank,
        is_public: row.is_public, share_code: row.share_code, _db_id: row.id,
      };
      showSharedChar(charData);
    });
  return true;
}

function navigateToChr(chrCode) {
  if (!chrCode) return false;
  const inOwn      = Object.values(chronicles).find(c => c.share_code === chrCode);
  const inFollowed = Object.values(followedChronicles).find(c => c.share_code === chrCode);
  if (inOwn)      { showChrDetail(inOwn.id);      return true; }
  if (inFollowed) { showChrDetail(inFollowed.id); return true; }
  sb.from('chronicles')
    .select('id, title, description, is_public, share_code, illustration_url, illustration_position, updated_at, user_id')
    .eq('share_code', chrCode).eq('is_public', true).single()
    .then(async ({ data: row, error }) => {
      if (error || !row) { showToast(t('toast_chr_not_found')); showView('chronicles'); return; }
      const { data: profile } = await sb.from('profiles').select('username').eq('id', row.user_id).single();
      followedChronicles[row.id] = { ...row, _followed: true, _owner_name: profile?.username || '?', entry_count: 0 };
      showChrDetail(row.id);
    });
  return true;
}

function navigateToEntry(chrCode, entryId) {
  if (!chrCode || !entryId) return false;
  const resolveChrId = () => {
    const inOwn      = Object.values(chronicles).find(c => c.share_code === chrCode);
    const inFollowed = Object.values(followedChronicles).find(c => c.share_code === chrCode);
    return inOwn?.id || inFollowed?.id || null;
  };
  const openEntry = (chrId) => {
    activeChrId = chrId;
    loadEntriesForChronicle(chrId).then(() => {
      const entry = (chrEntries[chrId] || []).find(e => e.id === entryId);
      if (!entry) { showToast(t('toast_entry_not_found')); showView('chronicles'); return; }
      openEntryReader(entryId);
    });
  };
  const chrId = resolveChrId();
  if (chrId) { openEntry(chrId); return true; }
  navigateToChr(chrCode);
  const wait = setInterval(() => {
    const resolved = resolveChrId();
    if (resolved) { clearInterval(wait); openEntry(resolved); }
  }, 100);
  setTimeout(() => clearInterval(wait), 5000);
  return true;
}

function navigateToDoc(docCode) {
  if (!docCode) return false;
  const inOwn      = Object.values(documents).find(d => d.share_code === docCode);
  const inFollowed = Object.values(followedDocuments).find(d => d.share_code === docCode);
  if (inOwn)      { openDocReader(inOwn.id);     return true; }
  if (inFollowed) { openDocReader(inFollowed.id); return true; }
  sb.from('documents')
    .select('id, title, content, is_public, share_code, illustration_url, illustration_position, updated_at, user_id')
    .eq('share_code', docCode).eq('is_public', true).single()
    .then(async ({ data: row, error }) => {
      if (error || !row) { showToast(t('toast_doc_not_found')); showView('documents'); return; }
      const { data: profile } = await sb.from('profiles').select('username').eq('id', row.user_id).single();
      followedDocuments[row.id] = { ...row, _followed: true, _owner_name: profile?.username || '?' };
      openDocReader(row.id);
    });
  return true;
}

function navigateToCampaign(campaignCode) {
  if (!campaignCode) return false;
  const inOwn      = Object.values(campaigns).find(c => c.share_code === campaignCode);
  const inFollowed = Object.values(followedCampaigns).find(c => c.share_code === campaignCode);
  if (inOwn)      { showCampaignDetail(inOwn.id);      return true; }
  if (inFollowed) { showCampaignDetail(inFollowed.id); return true; }
  sb.from('campaigns')
    .select('id, title, description, is_public, share_code, updated_at, user_id')
    .eq('share_code', campaignCode).eq('is_public', true).single()
    .then(async ({ data: row, error }) => {
      if (error || !row) { showToast(t('toast_campaign_not_found')); showView('campaigns'); return; }
      const { data: profile } = await sb.from('profiles').select('username').eq('id', row.user_id).single();
      followedCampaigns[row.id] = { ...row, _followed: true, _owner_name: profile?.username || '?' };
      showCampaignDetail(row.id);
    });
  return true;
}

/**
 * Appelle sync_owner_tags via RPC.
 * p_item_id est passé en string (TEXT) pour éviter le cast UUID
 * que PostgREST ne sait pas faire automatiquement depuis le JSON.
 */
async function syncOwnerTagsToMe(type, itemId) {
  try {
    const { error } = await sb.rpc('sync_owner_tags', {
      p_item_type: type,
      p_item_id:   String(itemId),   // ← TEXT, pas UUID
    });
    if (error) console.warn('syncOwnerTagsToMe:', error.message);
  } catch (err) {
    console.warn('syncOwnerTagsToMe: non-fatal error', err);
  }
}
 
/**
 * Appelle cleanup_orphan_char_tags ou cleanup_orphan_doc_tags.
 * À appeler après un désabonnement ou la suppression d'un tag local.
 */
async function cleanupOrphanTags(type) {
  try {
    const fn = type === 'doc' ? 'cleanup_orphan_doc_tags' : 'cleanup_orphan_char_tags';
    await sb.rpc(fn, { p_user_id: currentUser.id });
  } catch (err) {
    console.warn('cleanupOrphanTags: non-fatal error', err);
  }
}

// ── Boot ──────────────────────────────────────────────────────
document.getElementById('app').style.display = 'none';
init();
