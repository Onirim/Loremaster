// ══════════════════════════════════════════════════════════════
// Quick TTRPG Manager — Module Campagnes
// ══════════════════════════════════════════════════════════════

// ── État ──────────────────────────────────────────────────────
let campaigns          = {};   // id → campagne (owned)
let followedCampaigns  = {};   // id → campagne (followed)
let followedCampaignIds = [];
let campaignItems      = {};   // campaignId → [{ id, item_type, share_code, _resolved }]

let activeCampaignId   = null;
let editingCampaignId  = null;
let campaignState      = null;

// Sélection en cours dans l'éditeur : sets de share_codes par type
let campaignSelection  = { char: new Set(), chr: new Set(), doc: new Set() };

// ══════════════════════════════════════════════════════════════
// CHARGEMENT
// ══════════════════════════════════════════════════════════════

async function loadCampaignsFromDB() {
  const { data, error } = await sb
    .from('campaigns')
    .select('id, title, description, is_public, share_code, created_at, updated_at')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false });
  if (error) { console.error('Erreur chargement campagnes:', error); return; }

  campaigns = {};
  (data || []).forEach(r => { campaigns[r.id] = { ...r }; });

  await loadFollowedCampaignsFromDB();
  await syncFollowedCampaignItems(); // pull automatique au chargement
}

async function loadFollowedCampaignsFromDB() {
  const { data: followed } = await sb
    .from('followed_campaigns')
    .select('campaign_id')
    .eq('user_id', currentUser.id);
  followedCampaignIds = (followed || []).map(r => r.campaign_id);
  if (!followedCampaignIds.length) { followedCampaigns = {}; return; }

  const { data } = await sb
    .from('campaigns')
    .select('id, title, description, is_public, share_code, updated_at, user_id')
    .in('id', followedCampaignIds)
    .eq('is_public', true);

  const ownerIds = [...new Set((data || []).map(r => r.user_id))];
  let ownerMap = {};
  if (ownerIds.length) {
    const { data: profiles } = await sb.from('profiles').select('id, username').in('id', ownerIds);
    (profiles || []).forEach(p => { ownerMap[p.id] = p.username; });
  }

  followedCampaigns = {};
  (data || []).forEach(r => {
    followedCampaigns[r.id] = { ...r, _followed: true, _owner_name: ownerMap[r.user_id] || '?' };
  });
}

async function loadCampaignItems(campaignId) {
  const { data, error } = await sb
    .from('campaign_items')
    .select('id, item_type, share_code, added_at')
    .eq('campaign_id', campaignId)
    .order('added_at', { ascending: true });
  if (error) { console.error('Erreur chargement items:', error); return; }
  campaignItems[campaignId] = data || [];
}

// ══════════════════════════════════════════════════════════════
// SYNC AUTOMATIQUE — Pull au chargement
// Pour chaque campagne suivie, abonne automatiquement les items
// que le joueur ne suit pas encore.
// ══════════════════════════════════════════════════════════════

async function syncFollowedCampaignItems() {
  if (!followedCampaignIds.length) return;

  // Charge tous les items de toutes les campagnes suivies en une seule requête
  const { data: items } = await sb
    .from('campaign_items')
    .select('campaign_id, item_type, share_code')
    .in('campaign_id', followedCampaignIds);

  if (!items || !items.length) return;

  const toFollowChar = [];
  const toFollowChr  = [];
  const toFollowDoc  = [];

  for (const item of items) {
    if (item.item_type === 'char') {
      const alreadyOwn      = Object.values(chars).some(c => c.share_code === item.share_code);
      const alreadyFollowed = Object.values(followedChars).some(c => c.share_code === item.share_code);
      if (!alreadyOwn && !alreadyFollowed) toFollowChar.push(item.share_code);
    } else if (item.item_type === 'chr') {
      const alreadyOwn      = Object.values(chronicles).some(c => c.share_code === item.share_code);
      const alreadyFollowed = Object.values(followedChronicles).some(c => c.share_code === item.share_code);
      if (!alreadyOwn && !alreadyFollowed) toFollowChr.push(item.share_code);
    } else if (item.item_type === 'doc') {
      const alreadyOwn      = Object.values(documents).some(d => d.share_code === item.share_code);
      const alreadyFollowed = Object.values(followedDocuments).some(d => d.share_code === item.share_code);
      if (!alreadyOwn && !alreadyFollowed) toFollowDoc.push(item.share_code);
    }
  }

  let newlyFollowed = 0;

  // Personnages
  if (toFollowChar.length) {
    const { data: charRows } = await sb
      .from('characters')
      .select('id, name, rank, is_public, share_code, data, user_id')
      .in('share_code', toFollowChar)
      .eq('is_public', true);
    for (const row of (charRows || [])) {
      if (row.user_id === currentUser.id) continue;
      if (followedIds.includes(row.id)) continue;
      const { error } = await sb.from('followed_characters')
        .insert({ user_id: currentUser.id, character_id: row.id });
      if (!error) { followedIds.push(row.id); newlyFollowed++; }
    }
    if (charRows?.length) await loadFollowedCharsFromDB();
  }

  // Chroniques
  if (toFollowChr.length) {
    const { data: chrRows } = await sb
      .from('chronicles')
      .select('id, title, user_id, is_public, share_code')
      .in('share_code', toFollowChr)
      .eq('is_public', true);
    for (const row of (chrRows || [])) {
      if (row.user_id === currentUser.id) continue;
      if (followedChrIds.includes(row.id)) continue;
      const { error } = await sb.from('followed_chronicles')
        .insert({ user_id: currentUser.id, chronicle_id: row.id });
      if (!error) { followedChrIds.push(row.id); newlyFollowed++; }
    }
    if (chrRows?.length) await loadFollowedChroniclesFromDB();
  }

  // Documents
  if (toFollowDoc.length) {
    const { data: docRows } = await sb
      .from('documents')
      .select('id, title, user_id, is_public, share_code')
      .in('share_code', toFollowDoc)
      .eq('is_public', true);
    for (const row of (docRows || [])) {
      if (row.user_id === currentUser.id) continue;
      if (followedDocIds.includes(row.id)) continue;
      const { error } = await sb.from('followed_documents')
        .insert({ user_id: currentUser.id, document_id: row.id });
      if (!error) { followedDocIds.push(row.id); newlyFollowed++; }
    }
    if (docRows?.length) await loadFollowedDocumentsFromDB();
  }

  if (newlyFollowed > 0) {
    showToast(ti('toast_campaign_synced', { n: newlyFollowed }));
  }
}

// ══════════════════════════════════════════════════════════════
// CRUD — CAMPAGNES
// ══════════════════════════════════════════════════════════════

async function saveCampaignToDB() {
  if (!campaignState.title.trim()) { alert(t('alert_campaign_no_title')); return; }

  const payload = {
    user_id:     currentUser.id,
    title:       campaignState.title.trim(),
    description: campaignState.description || '',
    is_public:   campaignState.is_public || false,
  };

  const isUUID = editingCampaignId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editingCampaignId);

  let result;
  if (isUUID) {
    result = await sb.from('campaigns').update(payload)
      .eq('id', editingCampaignId).select('id, share_code').single();
  } else {
    editingCampaignId = null;
    result = await sb.from('campaigns').insert(payload).select('id, share_code').single();
  }
  if (result.error) { showToast(t('toast_campaign_save_error')); return; }

  editingCampaignId = result.data.id;
  campaignState.share_code = result.data.share_code;
  campaigns[editingCampaignId] = { ...campaignState, id: editingCampaignId };

  // Sauvegarde des items sélectionnés
  await saveCampaignItemsToDB(editingCampaignId);

  updateCampaignShareCodeBox();
  showToast(t('toast_campaign_saved'));
}

async function saveCampaignItemsToDB(campaignId) {
  // Récupère les items actuels en base
  const { data: existing } = await sb
    .from('campaign_items')
    .select('id, item_type, share_code')
    .eq('campaign_id', campaignId);

  const existingSet = new Set((existing || []).map(r => `${r.item_type}:${r.share_code}`));
  const selectedSet = new Set([
    ...([...campaignSelection.char].map(c => `char:${c}`)),
    ...([...campaignSelection.chr ].map(c => `chr:${c}`)),
    ...([...campaignSelection.doc ].map(c => `doc:${c}`)),
  ]);

  const toAdd    = [...selectedSet].filter(k => !existingSet.has(k));
  const toRemove = [...existingSet].filter(k => !selectedSet.has(k));

  if (toRemove.length) {
    for (const key of toRemove) {
      const [type, code] = key.split(':');
      await sb.from('campaign_items').delete()
        .eq('campaign_id', campaignId)
        .eq('item_type', type)
        .eq('share_code', code);
    }
  }

  if (toAdd.length) {
    const rows = toAdd.map(key => {
      const [item_type, share_code] = key.split(':');
      return { campaign_id: campaignId, item_type, share_code };
    });
    await sb.from('campaign_items').insert(rows);
  }

  // Recharge les items en mémoire
  await loadCampaignItems(campaignId);
  // Met à jour le comptage sur la campagne
  campaigns[campaignId] = {
    ...campaigns[campaignId],
    _item_count: (campaignItems[campaignId] || []).length,
  };
}

async function deleteCampaignFromDB(id) {
  const title = campaigns[id]?.title || 'cette campagne';
  if (!confirm(ti('confirm_delete_campaign', { title }))) return;
  const { error } = await sb.from('campaigns').delete().eq('id', id);
  if (error) { showToast(t('toast_campaign_delete_error')); return; }
  delete campaigns[id];
  delete campaignItems[id];
  renderCampaignsList();
  showView('campaigns');
}

// ══════════════════════════════════════════════════════════════
// ABONNEMENT
// ══════════════════════════════════════════════════════════════

async function followCampaignByCode(code) {
  if (!code.trim()) return;
  const clean = code.trim().toUpperCase();
  const { data, error } = await sb
    .from('campaigns')
    .select('id, title, user_id, is_public')
    .eq('share_code', clean)
    .eq('is_public', true)
    .single();
  if (error || !data) { showToast(t('toast_campaign_not_found')); return; }
  if (data.user_id === currentUser.id) { showToast(t('toast_campaign_own')); return; }
  if (followedCampaignIds.includes(data.id)) { showToast(t('toast_campaign_already_followed')); return; }

  const { error: err } = await sb.from('followed_campaigns')
    .insert({ user_id: currentUser.id, campaign_id: data.id });
  if (err) { showToast(t('toast_campaign_follow_error')); return; }

  followedCampaignIds.push(data.id);
  await loadFollowedCampaignsFromDB();
  // Synchronise immédiatement les items de cette nouvelle campagne
  await syncFollowedCampaignItems();

  document.getElementById('campaign-follow-input').value = '';
  renderCampaignsList();
  showToast(ti('toast_campaign_subscribed', { title: data.title }));
}

async function unfollowCampaign(id) {
  await sb.from('followed_campaigns')
    .delete().eq('user_id', currentUser.id).eq('campaign_id', id);
  followedCampaignIds = followedCampaignIds.filter(i => i !== id);
  delete followedCampaigns[id];
  renderCampaignsList();
  showToast(t('toast_campaign_unsubscribed'));
}

// ══════════════════════════════════════════════════════════════
// RENDU — LISTE
// ══════════════════════════════════════════════════════════════

function renderCampaignsList() {
  const grid  = document.getElementById('campaign-grid');
  const empty = document.getElementById('campaign-empty-state');

  const ownKeys      = Object.keys(campaigns).sort((a,b) => (campaigns[a].title||'').localeCompare(campaigns[b].title||''));
  const followedKeys = Object.keys(followedCampaigns).sort((a,b) => (followedCampaigns[a].title||'').localeCompare(followedCampaigns[b].title||''));
  const total = ownKeys.length + followedKeys.length;

  document.getElementById('campaign-count-badge').textContent = total ? `(${total})` : '';

  if (!total) { grid.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  grid.innerHTML = [
    ...ownKeys.map(id    => campaignCardHTML(id, campaigns[id], false)),
    ...followedKeys.map(id => campaignCardHTML(id, followedCampaigns[id], true)),
  ].join('');
}

function campaignCardHTML(id, c, isFollowed) {
  const itemCount = (campaignItems[id] || []).length;
  const charCount = (campaignItems[id] || []).filter(i => i.item_type === 'char').length;
  const chrCount  = (campaignItems[id] || []).filter(i => i.item_type === 'chr').length;
  const docCount  = (campaignItems[id] || []).filter(i => i.item_type === 'doc').length;

  const desc = c.description
    ? (c.description.length > 200 ? c.description.slice(0, 200) + '…' : c.description)
    : '';

  const countsHtml = `
    <div class="campaign-item-counts">
      ${charCount ? `<span class="campaign-count-chip"><span class="n">${charCount}</span> ${t('campaign_type_char')}</span>` : ''}
      ${chrCount  ? `<span class="campaign-count-chip"><span class="n">${chrCount}</span> ${t('campaign_type_chr')}</span>` : ''}
      ${docCount  ? `<span class="campaign-count-chip"><span class="n">${docCount}</span> ${t('campaign_type_doc')}</span>` : ''}
      ${!itemCount ? `<span class="campaign-count-chip" style="font-style:italic">${t('campaign_empty_items')}</span>` : ''}
    </div>`;

  if (isFollowed) {
    return `<div class="campaign-card" onclick="showCampaignDetail('${id}')">
      <div class="campaign-card-actions">
        <button class="icon-btn danger" onclick="event.stopPropagation();unfollowCampaign('${id}')"
          title="${t('btn_unsubscribe')}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="3,4 13,4"/>
            <path d="M5 4V2h6v2M6 7v5M10 7v5"/>
            <path d="M4 4l1 10h6l1-10"/>
          </svg>
        </button>
      </div>
      <div class="campaign-card-title">${esc(c.title) || 'Sans titre'}</div>
      ${desc ? `<div class="campaign-card-desc">${esc(desc)}</div>` : ''}
      <div class="campaign-card-footer">
        ${countsHtml}
        <span class="campaign-followed-badge">👁 ${t('followed_badge')}</span>
        <span class="campaign-owner-label">${t('followed_owner_prefix')}${esc(c._owner_name)}</span>
      </div>
    </div>`;
  }

  const visTag = c.is_public
    ? `<span class="card-visibility public">${t('visibility_public')}</span>`
    : `<span class="card-visibility private">${t('visibility_private')}</span>`;

  return `<div class="campaign-card" onclick="showCampaignDetail('${id}')">
    <div class="campaign-card-actions">
      <button class="icon-btn" onclick="event.stopPropagation();openCampaignEditor('${id}')"
        title="${t('btn_edit')}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M11 2l3 3-9 9H2v-3z"/>
        </svg>
      </button>
      <button class="icon-btn danger" onclick="event.stopPropagation();deleteCampaignFromDB('${id}')"
        title="${t('btn_delete')}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <polyline points="3,4 13,4"/>
          <path d="M5 4V2h6v2M6 7v5M10 7v5"/>
          <path d="M4 4l1 10h6l1-10"/>
        </svg>
      </button>
    </div>
    <div class="campaign-card-title">${esc(c.title) || 'Sans titre'}</div>
    ${desc ? `<div class="campaign-card-desc">${esc(desc)}</div>` : ''}
    <div class="campaign-card-footer">
      ${countsHtml}
      ${visTag}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// VUE DÉTAIL
// ══════════════════════════════════════════════════════════════

async function showCampaignDetail(campaignId) {
  activeCampaignId = campaignId;
  await loadCampaignItems(campaignId);
  renderCampaignDetail();
  showView('campaign-detail');
}

function renderCampaignDetail() {
  const c = campaigns[activeCampaignId] || followedCampaigns[activeCampaignId];
  if (!c) return;
  const isOwn = !!campaigns[activeCampaignId];
  const items = campaignItems[activeCampaignId] || [];

  // Résolution des noms à partir des stores en mémoire
  const resolve = (item) => {
    if (item.item_type === 'char') {
      const found = Object.values(chars).find(x => x.share_code === item.share_code)
                 || Object.values(followedChars).find(x => x.share_code === item.share_code);
      return { name: found?.name || item.share_code, sub: found?.subtitle || '' };
    } else if (item.item_type === 'chr') {
      const found = Object.values(chronicles).find(x => x.share_code === item.share_code)
                 || Object.values(followedChronicles).find(x => x.share_code === item.share_code);
      return { name: found?.title || item.share_code, sub: '' };
    } else {
      const found = Object.values(documents).find(x => x.share_code === item.share_code)
                 || Object.values(followedDocuments).find(x => x.share_code === item.share_code);
      return { name: found?.title || item.share_code, sub: '' };
    }
  };

  const renderSection = (type, labelKey, typeCls) => {
    const sectionItems = items.filter(i => i.item_type === type);
    if (!sectionItems.length) return '';
    const rows = sectionItems.map(item => {
      const info = resolve(item);
      return `<div class="campaign-item-row" onclick="navigateToCampaignItem('${item.item_type}', '${item.share_code}')">
        <span class="campaign-item-row-type ${typeCls}">${t(labelKey)}</span>
        <div>
          <div class="campaign-item-row-name">${esc(info.name)}</div>
          ${info.sub ? `<div class="campaign-item-row-meta">${esc(info.sub)}</div>` : ''}
        </div>
        ${isOwn ? `<button class="icon-btn danger campaign-item-remove"
          onclick="event.stopPropagation();removeItemFromCampaign('${activeCampaignId}','${item.id}')"
          title="${t('btn_delete')}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
            <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
          </svg>
        </button>` : ''}
      </div>`;
    }).join('');
    return `<div class="campaign-section">
      <div class="campaign-section-title">
        ${t(labelKey + '_plural')}
        <span class="campaign-section-count">(${sectionItems.length})</span>
      </div>
      ${rows}
    </div>`;
  };

  const visTag = c.is_public
    ? `<span class="card-visibility public">${t('visibility_public')}</span>`
    : `<span class="card-visibility private">${t('visibility_private')}</span>`;

  const followedBanner = !isOwn ? `
    <div class="campaign-followed-banner">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="3" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="12" cy="13" r="1.5"/>
        <line x1="5.5" y1="7" x2="10.5" y2="4.3"/><line x1="5.5" y1="9" x2="10.5" y2="11.7"/>
      </svg>
      ${t('campaign_followed_banner')} ${esc(c._owner_name || '')}
    </div>` : '';

  const noItems = !items.length
    ? `<div style="color:var(--text3);font-size:13px;font-style:italic;padding:20px 0">${t('campaign_no_items')}</div>` : '';

  document.getElementById('campaign-detail-content').innerHTML = `
    <div class="campaign-detail-inner">
      ${followedBanner}
      <div class="campaign-detail-header">
        <div>
          <div class="campaign-detail-title">${esc(c.title)}</div>
          ${c.description ? `<div class="campaign-detail-desc">${esc(c.description)}</div>` : ''}
          <div class="campaign-detail-meta">
            ${isOwn ? visTag : ''}
            ${c._owner_name ? `<span class="campaign-owner-label">${t('followed_owner_prefix')}${esc(c._owner_name)}</span>` : ''}
          </div>
        </div>
        ${isOwn ? `<div class="campaign-detail-actions">
          <button class="btn-cancel" onclick="openCampaignEditor('${activeCampaignId}')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
              <path d="M11 2l3 3-9 9H2v-3z"/>
            </svg>
            ${t('btn_edit')}
          </button>
        </div>` : ''}
      </div>
      ${noItems}
      ${renderSection('char', 'campaign_type_char', 'campaign-item-type-char')}
      ${renderSection('chr',  'campaign_type_chr',  'campaign-item-type-chr')}
      ${renderSection('doc',  'campaign_type_doc',  'campaign-item-type-doc')}
    </div>`;
}

// Navigation depuis le détail vers l'entité
function navigateToCampaignItem(type, shareCode) {
  if (type === 'char') navigateToChar(shareCode);
  else if (type === 'chr') navigateToChr(shareCode);
  else if (type === 'doc') navigateToDoc(shareCode);
}

async function removeItemFromCampaign(campaignId, itemId) {
  const { error } = await sb.from('campaign_items').delete().eq('id', itemId);
  if (error) { showToast(t('toast_campaign_save_error')); return; }
  await loadCampaignItems(campaignId);
  renderCampaignDetail();
}

// ══════════════════════════════════════════════════════════════
// ÉDITEUR CAMPAGNE — formulaire + sélection en masse
// ══════════════════════════════════════════════════════════════

function newCampaign() {
  editingCampaignId = null;
  campaignState = { title: '', description: '', is_public: false, share_code: null };
  campaignSelection = { char: new Set(), chr: new Set(), doc: new Set() };
  showView('campaign-editor');
  renderCampaignEditor();
}

async function openCampaignEditor(id) {
  editingCampaignId = id;
  campaignState = { ...campaigns[id] };
  // Charge les items existants et pré-remplit la sélection
  await loadCampaignItems(id);
  const items = campaignItems[id] || [];
  campaignSelection = { char: new Set(), chr: new Set(), doc: new Set() };
  items.forEach(item => campaignSelection[item.item_type]?.add(item.share_code));
  showView('campaign-editor');
  renderCampaignEditor();
}

function renderCampaignEditor() {
  document.getElementById('campaign-f-title').value       = campaignState.title || '';
  document.getElementById('campaign-f-description').value = campaignState.description || '';
  const pub = document.getElementById('campaign-f-public');
  pub.checked = campaignState.is_public || false;
  document.getElementById('campaign-public-label').textContent =
    pub.checked ? t('share_code_active') : t('share_code_inactive');
  updateCampaignShareCodeBox();
  renderSelectionSummary();
  renderSelectableItems();
}

function updateCampaignForm() {
  campaignState.title       = document.getElementById('campaign-f-title').value;
  campaignState.description = document.getElementById('campaign-f-description').value;
  campaignState.is_public   = document.getElementById('campaign-f-public').checked;
  document.getElementById('campaign-public-label').textContent =
    campaignState.is_public ? t('share_code_active') : t('share_code_inactive');
  updateCampaignShareCodeBox();
}

function updateCampaignShareCodeBox() {
  const box = document.getElementById('campaign-share-code-box');
  const val = document.getElementById('campaign-share-code-val');
  if (!box || !val) return;
  const code = campaignState?.share_code
    || (editingCampaignId && campaigns[editingCampaignId]?.share_code) || null;
  if (campaignState?.is_public && code) { val.textContent = code; box.style.display = 'flex'; }
  else box.style.display = 'none';
}

function copyCampaignShareCode() {
  const code = document.getElementById('campaign-share-code-val')?.textContent;
  if (!code || code === '—') return;
  navigator.clipboard.writeText(code)
    .then(() => showToast(ti('toast_code_copied', { code })))
    .catch(() => prompt(t('share_code_prompt_short'), code));
}

function shareCampaignBtn() {
  if (!campaignState?.is_public) { showToast(t('toast_chr_share_need_public')); return; }
  const code = campaignState?.share_code || (editingCampaignId && campaigns[editingCampaignId]?.share_code);
  if (!code) { showToast(t('toast_chr_share_need_save')); return; }
  copyUrl(buildShareUrl('campaign', code));
}

// ── Sélection ────────────────────────────────────────────────

// Construit la liste complète des items sélectionnables pour un type donné :
// d'abord les objets owned (sans badge), puis les objets suivis (avec badge owner).
// Un objet suivi sans share_code est ignoré (ne peut pas être partagé).
function buildSelectableList(type) {
  if (type === 'char') {
    const own = Object.values(chars)
      .filter(c => c.share_code && c.is_public)
      .map(c => ({ code: c.share_code, name: c.name, sub: c.subtitle || '', owner: null }));
    const followed = Object.values(followedChars)
      .filter(c => c.share_code && c.is_public)
      .map(c => ({ code: c.share_code, name: c.name, sub: c.subtitle || '', owner: c._owner_name || '?' }));
    return [...own, ...followed];
  }
  if (type === 'chr') {
    const own = Object.values(chronicles)
      .filter(c => c.share_code && c.is_public)
      .map(c => ({ code: c.share_code, name: c.title, sub: c.description ? c.description.slice(0, 60) : '', owner: null }));
    const followed = Object.values(followedChronicles)
      .filter(c => c.share_code && c.is_public)
      .map(c => ({ code: c.share_code, name: c.title, sub: c.description ? c.description.slice(0, 60) : '', owner: c._owner_name || '?' }));
    return [...own, ...followed];
  }
  if (type === 'doc') {
    const own = Object.values(documents)
      .filter(d => d.share_code && d.is_public)
      .map(d => ({ code: d.share_code, name: d.title, sub: '', owner: null }));
    const followed = Object.values(followedDocuments)
      .filter(d => d.share_code && d.is_public)
      .map(d => ({ code: d.share_code, name: d.title, sub: '', owner: d._owner_name || '?' }));
    return [...own, ...followed];
  }
  return [];
}

function renderSelectableItems() {
  renderSelectableSection('char', document.getElementById('campaign-selector-chars'));
  renderSelectableSection('chr',  document.getElementById('campaign-selector-chrs'));
  renderSelectableSection('doc',  document.getElementById('campaign-selector-docs'));
}

function renderSelectableSection(type, container) {
  if (!container) return;
  const items = buildSelectableList(type);
  if (!items.length) {
    container.innerHTML = `<div style="color:var(--text3);font-size:12px;font-style:italic;padding:6px 0">${t('campaign_selector_empty')}</div>`;
    return;
  }
  const grid = items.map(item => {
    const sel = campaignSelection[type]?.has(item.code);
    const ownerBadge = item.owner
      ? `<span style="font-size:10px;color:var(--text3);font-style:italic;white-space:nowrap;margin-left:4px">${t('followed_owner_prefix')}${esc(item.owner)}</span>`
      : '';
    return `<div class="campaign-selectable-item ${sel ? 'selected' : ''}"
      onclick="toggleCampaignItem('${type}', '${item.code}', this)">
      <div class="campaign-selectable-check"></div>
      <div style="flex:1;overflow:hidden;min-width:0">
        <div style="display:flex;align-items:baseline;gap:4px;flex-wrap:wrap">
          <div class="campaign-selectable-name">${esc(item.name) || '—'}</div>
          ${ownerBadge}
        </div>
        ${item.sub ? `<div class="campaign-selectable-sub">${esc(item.sub)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="campaign-selectable-grid">${grid}</div>`;
  updateSelectAllBtn(type);
}

function toggleCampaignItem(type, code, el) {
  if (campaignSelection[type].has(code)) {
    campaignSelection[type].delete(code);
    el.classList.remove('selected');
  } else {
    campaignSelection[type].add(code);
    el.classList.add('selected');
  }
  renderSelectionSummary();
  updateSelectAllBtn(type);
}

function selectAllOfType(type) {
  const allItems = getAllItemsOfType(type);
  const allSelected = allItems.every(c => campaignSelection[type].has(c));
  if (allSelected) {
    allItems.forEach(c => campaignSelection[type].delete(c));
  } else {
    allItems.forEach(c => campaignSelection[type].add(c));
  }
  renderSelectableItems();
  renderSelectionSummary();
}

function getAllItemsOfType(type) {
  return buildSelectableList(type).map(item => item.code);
}

function updateSelectAllBtn(type) {
  const btn = document.getElementById(`campaign-select-all-${type}`);
  if (!btn) return;
  const all = getAllItemsOfType(type);
  const allSel = all.length > 0 && all.every(c => campaignSelection[type].has(c));
  btn.textContent = allSel ? t('campaign_deselect_all') : t('campaign_select_all');
}

function renderSelectionSummary() {
  const charN = campaignSelection.char.size;
  const chrN  = campaignSelection.chr.size;
  const docN  = campaignSelection.doc.size;
  const total = charN + chrN + docN;

  const summaryEl = document.getElementById('campaign-selection-summary');
  if (!summaryEl) return;

  if (!total) {
    summaryEl.querySelector('.summary-text').textContent = t('campaign_selection_none');
    summaryEl.querySelector('.summary-chips').innerHTML = '';
    return;
  }

  summaryEl.querySelector('.summary-text').textContent =
    ti('campaign_selection_count', { n: total });

  const chips = [
    charN ? `<span class="campaign-summary-chip campaign-item-type-char">${charN} ${t('campaign_type_char')}</span>` : '',
    chrN  ? `<span class="campaign-summary-chip campaign-item-type-chr">${chrN} ${t('campaign_type_chr')}</span>` : '',
    docN  ? `<span class="campaign-summary-chip campaign-item-type-doc">${docN} ${t('campaign_type_doc')}</span>` : '',
  ].join('');
  summaryEl.querySelector('.summary-chips').innerHTML = chips;
}
