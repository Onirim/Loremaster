// ══════════════════════════════════════════════════════════════
// Quick TTRPG Manager — Module Chroniques v2
// ══════════════════════════════════════════════════════════════

// ── État ──────────────────────────────────────────────────────
let chronicles         = {};
let followedChronicles = {};
let followedChrIds     = [];
let chrEntries         = {};

let activeChrId        = null;
let editingChrId       = null;
let editingEntryId     = null;
let chrState           = null;
let entryState         = null;

// ══════════════════════════════════════════════════════════════
// CHARGEMENT
// ══════════════════════════════════════════════════════════════

async function loadChroniclesFromDB() {
  const { data, error } = await sb
    .from('chronicles')
    .select('id, title, description, is_public, share_code, illustration_url, illustration_position, updated_at')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false });
  if (error) { console.error('Erreur chargement chroniques:', error); return; }

  const ids = (data || []).map(r => r.id);
  let countMap = {};
  if (ids.length) {
    const { data: counts } = await sb
      .from('chronicle_entries')
      .select('chronicle_id')
      .in('chronicle_id', ids);
    (counts || []).forEach(r => {
      countMap[r.chronicle_id] = (countMap[r.chronicle_id] || 0) + 1;
    });
  }

  chronicles = {};
  (data || []).forEach(r => {
    chronicles[r.id] = { ...r, entry_count: countMap[r.id] || 0 };
  });
  await loadFollowedChroniclesFromDB();
}

async function loadFollowedChroniclesFromDB() {
  const { data: followed } = await sb
    .from('followed_chronicles')
    .select('chronicle_id')
    .eq('user_id', currentUser.id);
  followedChrIds = (followed || []).map(r => r.chronicle_id);
  if (!followedChrIds.length) { followedChronicles = {}; return; }

  const { data } = await sb
    .from('chronicles')
    .select('id, title, description, is_public, share_code, illustration_url, illustration_position, updated_at, user_id')
    .in('id', followedChrIds)
    .eq('is_public', true);

  const ownerIds = [...new Set((data || []).map(r => r.user_id))];
  let ownerMap = {};
  if (ownerIds.length) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username')
      .in('id', ownerIds);
    (profiles || []).forEach(p => { ownerMap[p.id] = p.username; });
  }

  const ids = (data || []).map(r => r.id);
  let countMap = {};
  if (ids.length) {
    const { data: entries } = await sb
      .from('chronicle_entries')
      .select('chronicle_id')
      .in('chronicle_id', ids);
    (entries || []).forEach(e => {
      countMap[e.chronicle_id] = (countMap[e.chronicle_id] || 0) + 1;
    });
  }

  followedChronicles = {};
  (data || []).forEach(r => {
    followedChronicles[r.id] = {
      ...r, _followed: true,
      _owner_name: ownerMap[r.user_id] || '?',
      entry_count: countMap[r.id] || 0,
    };
  });
}

async function loadEntriesForChronicle(chrId) {
  const { data, error } = await sb
    .from('chronicle_entries')
    .select('id, title, content, created_at, updated_at')
    .eq('chronicle_id', chrId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Erreur chargement entrées:', error); return; }
  chrEntries[chrId] = data || [];
}

// ══════════════════════════════════════════════════════════════
// CRUD — CHRONIQUES
// ══════════════════════════════════════════════════════════════

async function saveChronicleToDB() {
  if (!chrState.title.trim()) { alert(t('alert_chr_no_title')); return; }
  const payload = {
    user_id:               currentUser.id,
    title:                 chrState.title.trim(),
    description:           chrState.description,
    is_public:             chrState.is_public || false,
    illustration_url:      chrState.illustration_url || '',
    illustration_position: chrState.illustration_position || 0,
  };
  const isUUID = editingChrId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editingChrId);

  let result;
  if (isUUID) {
    result = await sb.from('chronicles').update(payload)
      .eq('id', editingChrId).select('id, share_code').single();
  } else {
    editingChrId = null;
    result = await sb.from('chronicles').insert(payload)
      .select('id, share_code').single();
  }
  if (result.error) { showToast(t('toast_chr_save_error')); return; }

  editingChrId = result.data.id;
  chrState.share_code = result.data.share_code;
  chronicles[editingChrId] = { ...chrState, id: editingChrId };
  updateChrShareCodeBox();
  showToast(t('toast_chr_saved'));
}

async function deleteChronicleFromDB(id) {
  const title = chronicles[id]?.title || 'cette chronique';
  if (!confirm(ti('confirm_delete_chr', { title }))) return;

  const illustrationUrl = chronicles[id]?.illustration_url || '';

  const { error } = await sb.from('chronicles').delete().eq('id', id);
  if (error) { showToast(t('toast_chr_delete_error')); return; }
  delete chronicles[id];
  delete chrEntries[id];

  if (illustrationUrl) await deleteStorageFile(illustrationUrl);

  renderChroniclesList();
  showView('chronicles');
}

// ══════════════════════════════════════════════════════════════
// CRUD — ENTRÉES
// ══════════════════════════════════════════════════════════════

async function saveEntryToDB() {
  if (!entryState.title.trim()) { alert(t('alert_entry_no_title')); return; }
  const payload = {
    chronicle_id: activeChrId,
    title:        entryState.title.trim(),
    content:      entryState.content,
  };
  const isUUID = editingEntryId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editingEntryId);

  let result;
  if (isUUID) {
    result = await sb.from('chronicle_entries').update(payload)
      .eq('id', editingEntryId).select('id').single();
  } else {
    editingEntryId = null;
    result = await sb.from('chronicle_entries').insert(payload)
      .select('id').single();
  }
  if (result.error) { showToast(t('toast_entry_save_error')); return; }

  const isNewEntry = !isUUID;
  editingEntryId = result.data.id;
  await loadEntriesForChronicle(activeChrId);

  if (isNewEntry && chronicles[activeChrId]) {
    chronicles[activeChrId].entry_count = (chronicles[activeChrId].entry_count || 0) + 1;
    chronicles[activeChrId].updated_at = new Date().toISOString();
  }

  showToast(t('toast_entry_saved'));
  showChrDetail(activeChrId);
}

async function deleteEntryFromDB(entryId) {
  const entry = (chrEntries[activeChrId] || []).find(e => e.id === entryId);
  if (!confirm(ti('confirm_delete_entry', { title: entry?.title || 'cette entrée' }))) return;
  const { error } = await sb.from('chronicle_entries').delete().eq('id', entryId);
  if (error) { showToast(t('toast_entry_delete_error')); return; }
  await loadEntriesForChronicle(activeChrId);

  if (chronicles[activeChrId]) {
    chronicles[activeChrId].entry_count = Math.max(0, (chronicles[activeChrId].entry_count || 1) - 1);
  }

  renderChrDetail();
}

// ══════════════════════════════════════════════════════════════
// ABONNEMENT
// ══════════════════════════════════════════════════════════════

async function followChrByCode(code) {
  if (!code.trim()) return;
  const clean = code.trim().toUpperCase();
  const { data, error } = await sb
    .from('chronicles')
    .select('id, title, user_id, is_public')
    .eq('share_code', clean)
    .eq('is_public', true)
    .single();
  if (error || !data) { showToast(t('toast_chr_not_found')); return; }
  if (data.user_id === currentUser.id) { showToast(t('toast_chr_own')); return; }
  if (followedChrIds.includes(data.id)) { showToast(t('toast_chr_already_followed')); return; }

  const { error: err } = await sb.from('followed_chronicles')
    .insert({ user_id: currentUser.id, chronicle_id: data.id });
  if (err) { showToast(t('toast_chr_follow_error')); return; }

  followedChrIds.push(data.id);
  await loadFollowedChroniclesFromDB();
  document.getElementById('chr-follow-input').value = '';
  renderChroniclesList();
  showToast(ti('toast_chr_subscribed', { title: data.title }));
}

async function unfollowChronicle(id) {
  await sb.from('followed_chronicles')
    .delete().eq('user_id', currentUser.id).eq('chronicle_id', id);
  followedChrIds = followedChrIds.filter(i => i !== id);
  delete followedChronicles[id];
  renderChroniclesList();
  showToast(t('toast_chr_unsubscribed'));
}

// ══════════════════════════════════════════════════════════════
// RENDU — LISTE DES CHRONIQUES
// ══════════════════════════════════════════════════════════════

function renderChroniclesList() {
  const grid  = document.getElementById('chr-grid');
  const empty = document.getElementById('chr-empty-state');
  const ownKeys      = Object.keys(chronicles);
  const followedKeys = Object.keys(followedChronicles);
  const total = ownKeys.length + followedKeys.length;

  document.getElementById('chr-count-badge').textContent = total ? `(${total})` : '';

  if (!total) { grid.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  grid.innerHTML = [
    ...ownKeys.map(id    => chrCardHTML(id, chronicles[id], false)),
    ...followedKeys.map(id => chrCardHTML(id, followedChronicles[id], true)),
  ].join('');
}

function chrEntryCountLabel(n) {
  if (n === 0) return t('chr_entry_count_zero');
  if (n === 1) return t('chr_entry_count_one');
  return ti('chr_entry_count_many', { n });
}

function chrCardHTML(id, c, isFollowed) {
  const desc = c.description
    ? (c.description.length > 220 ? c.description.slice(0, 220) + '…' : c.description)
    : '';
  const lastDate = c.updated_at
    ? new Date(c.updated_at).toLocaleDateString(currentLang === 'en' ? 'en-GB' : 'fr-FR', { day:'numeric', month:'short', year:'numeric' })
    : '';
  const entryCount = c.entry_count ?? 0;
  const entryLabel = chrEntryCountLabel(entryCount);

  const metaHtml = `
    <div class="chr-card-meta">
      <span class="chr-card-entry-count">${entryLabel}</span>
      ${lastDate ? `<span class="chr-card-last-date">${t('chr_last_update')}${lastDate}</span>` : ''}
    </div>`;

  if (isFollowed) {
    return `<div class="chr-card" onclick="showChrDetail('${id}')">
      ${c.illustration_url ? `<img class="card-illus" src="${esc(c.illustration_url)}" style="object-position:center ${c.illustration_position||0}%" onclick="event.stopPropagation();openLightbox('${esc(c.illustration_url)}')" alt="">` : ''}
      <div class="chr-card-actions">
        <button class="icon-btn danger" onclick="event.stopPropagation();unfollowChronicle('${id}')" title="${t('btn_unsubscribe')}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,4 13,4"/><path d="M5 4V2h6v2M6 7v5M10 7v5"/><path d="M4 4l1 10h6l1-10"/></svg>
        </button>
      </div>
      <div class="chr-card-title">${esc(c.title) || 'Sans titre'}</div>
      ${desc ? `<div class="chr-card-desc">${esc(desc)}</div>` : ''}
      ${metaHtml}
      <div class="chr-card-footer">
        <span class="followed-badge">${t('followed_badge')}</span>
        <span class="chr-card-owner">${t('chr_followed_owner')}${esc(c._owner_name)}</span>
      </div>
    </div>`;
  }

  const visTag = c.is_public
    ? `<span class="card-visibility public">${t('visibility_public_chr')}</span>`
    : `<span class="card-visibility private">${t('visibility_private_chr')}</span>`;

  return `<div class="chr-card" onclick="showChrDetail('${id}')">
    ${c.illustration_url ? `<img class="card-illus" src="${esc(c.illustration_url)}" style="object-position:center ${c.illustration_position||0}%" onclick="event.stopPropagation();openLightbox('${esc(c.illustration_url)}')" alt="">` : ''}
    <div class="chr-card-actions">
      <button class="icon-btn" onclick="event.stopPropagation();openChrEditor('${id}')" title="${t('btn_edit')}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3z"/></svg>
      </button>
      <button class="icon-btn danger" onclick="event.stopPropagation();deleteChronicleFromDB('${id}')" title="${t('btn_delete')}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,4 13,4"/><path d="M5 4V2h6v2M6 7v5M10 7v5"/><path d="M4 4l1 10h6l1-10"/></svg>
      </button>
    </div>
    <div class="chr-card-title">${esc(c.title) || 'Sans titre'}</div>
    ${desc ? `<div class="chr-card-desc">${esc(desc)}</div>` : ''}
    ${metaHtml}
    <div class="chr-card-footer">
      ${visTag}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// VUE DÉTAIL — liste des entrées
// ══════════════════════════════════════════════════════════════

async function showChrDetail(chrId) {
  activeChrId = chrId;
  await loadEntriesForChronicle(chrId);
  renderChrDetail();
  showView('chr-detail');
  const chr = chronicles[chrId] || followedChronicles[chrId];
  if (chr?.share_code) setHash('chr', chr.share_code);
}

function renderChrDetail() {
  const chr = chronicles[activeChrId] || followedChronicles[activeChrId];
  if (!chr) return;
  const isOwn = !!chronicles[activeChrId];
  const entries = chrEntries[activeChrId] || [];

  const visTag = chr.is_public
    ? `<span class="card-visibility public">${t('visibility_public_chr')}</span>`
    : `<span class="card-visibility private">${t('visibility_private_chr')}</span>`;
  const ownerTag = chr._owner_name
    ? `<span class="chr-detail-owner">${t('chr_followed_owner')}${esc(chr._owner_name)}</span>` : '';

  const entriesHtml = entries.length
    ? entries.map(e => entryRowHTML(e, isOwn)).join('')
    : `<div class="chr-no-entries">${t('chr_no_entries')}</div>`;

  document.getElementById('chr-detail-content').innerHTML = `
    <div class="chr-detail-inner">
      ${chr.illustration_url ? `<img class="chr-detail-illus" src="${esc(chr.illustration_url)}" style="object-position:center ${chr.illustration_position||0}%" onclick="openLightbox('${esc(chr.illustration_url)}')" alt="">` : ''}
      <div class="chr-detail-header">
      <div>
        <div class="chr-detail-title">${esc(chr.title)}</div>
        ${chr.description ? `<div class="chr-detail-desc">${esc(chr.description)}</div>` : ''}
        <div class="chr-detail-meta">${visTag}${ownerTag}</div>
      </div>
      ${isOwn ? `<div class="chr-detail-actions">
        <button class="btn-cancel" onclick="openChrEditor('${activeChrId}')">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M11 2l3 3-9 9H2v-3z"/></svg>
          ${t('chr_detail_btn_edit')}
        </button>
        <button class="btn-primary" onclick="newEntry()">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
          ${t('chr_detail_btn_new_entry')}
        </button>
      </div>` : ''}
    </div>
    <div class="chr-entries-list">${entriesHtml}</div>
    </div>
  `;
}

function entryRowHTML(e, isOwn) {
  const date = e.created_at
    ? new Date(e.created_at).toLocaleDateString(currentLang === 'en' ? 'en-GB' : 'fr-FR', { day:'numeric', month:'long', year:'numeric' })
    : '';
  const preview = (e.content || '').replace(/#+\s*/g,'').replace(/\*+/g,'').replace(/\n/g,' ').slice(0, 160);

  return `<div class="entry-row" onclick="openEntryReader('${e.id}')">
    <div class="entry-row-header">
      <div class="entry-row-title">${esc(e.title)}</div>
      <div class="entry-row-date">${date}</div>
      ${isOwn ? `<div class="entry-row-actions" onclick="event.stopPropagation()">
        <button class="icon-btn" onclick="openEntryEditor('${e.id}')" title="${t('btn_edit')}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3z"/></svg>
        </button>
        <button class="icon-btn danger" onclick="deleteEntryFromDB('${e.id}')" title="${t('btn_delete')}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,4 13,4"/><path d="M5 4V2h6v2M6 7v5M10 7v5"/><path d="M4 4l1 10h6l1-10"/></svg>
        </button>
      </div>` : ''}
    </div>
    ${preview ? `<div class="entry-row-preview">${esc(preview)}…</div>` : ''}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// FORMULAIRE — CHRONIQUE
// ══════════════════════════════════════════════════════════════

function newChronicle() {
  editingChrId = null;
  chrState = { title: '', description: '', is_public: false, share_code: null,
               illustration_url: '', illustration_position: 0 };
  showView('chr-editor');
  populateChrEditor();
}

function openChrEditor(id) {
  editingChrId = id;
  chrState = { ...chronicles[id] };
  showView('chr-editor');
  populateChrEditor();
}

function populateChrEditor() {
  document.getElementById('chr-f-title').value       = chrState.title || '';
  document.getElementById('chr-f-description').value = chrState.description || '';
  const pub = document.getElementById('chr-f-public');
  pub.checked = chrState.is_public || false;
  document.getElementById('chr-public-label').textContent =
    pub.checked ? t('share_code_active_chr') : t('share_code_inactive_chr');
  setChrIllusPreview(chrState.illustration_url || '', chrState.illustration_position || 0);
  updateChrShareCodeBox();
}

function updateChrForm() {
  chrState.title       = document.getElementById('chr-f-title').value;
  chrState.description = document.getElementById('chr-f-description').value;
  chrState.is_public   = document.getElementById('chr-f-public').checked;
  document.getElementById('chr-public-label').textContent =
    chrState.is_public ? t('share_code_active_chr') : t('share_code_inactive_chr');
  updateChrShareCodeBox();
}

function updateChrShareCodeBox() {
  const box = document.getElementById('chr-share-code-box');
  const val = document.getElementById('chr-share-code-val');
  if (!box || !val) return;
  const code = chrState?.share_code ||
    (editingChrId && chronicles[editingChrId]?.share_code) || null;
  if (chrState?.is_public && code) { val.textContent = code; box.style.display = 'flex'; }
  else box.style.display = 'none';
}

function copyChrShareCode() {
  const code = document.getElementById('chr-share-code-val')?.textContent;
  if (!code || code === '—') return;
  navigator.clipboard.writeText(code)
    .then(() => showToast(ti('toast_code_copied', { code })))
    .catch(() => prompt(t('share_code_prompt_short'), code));
}

function shareChrBtn() {
  if (!chrState?.is_public) { showToast(t('toast_chr_share_need_public')); return; }
  const code = chrState?.share_code || (editingChrId && chronicles[editingChrId]?.share_code);
  if (!code) { showToast(t('toast_chr_share_need_save')); return; }
  copyUrl(buildShareUrl('chr', code));
}

function shareChrDetailBtn() {
  if (!activeChrId) return;
  const chr = chronicles[activeChrId] || followedChronicles[activeChrId];
  if (!chr?.is_public) { showToast(t('toast_chr_share_need_public')); return; }
  const code = chr.share_code;
  if (!code) { showToast(t('toast_chr_share_need_save')); return; }
  copyUrl(buildShareUrl('chr', code));
}

function shareEntryReaderBtn() {
  if (!activeChrId) return;
  const chr = chronicles[activeChrId] || followedChronicles[activeChrId];
  if (!chr?.is_public) { showToast(t('toast_chr_share_need_public')); return; }
  const chrCode = chr.share_code;
  if (!chrCode) return;
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('entry/')) {
    const entryId = hash.split('/')[2];
    copyUrl(buildShareUrl('entry', chrCode, entryId));
  }
}

// ══════════════════════════════════════════════════════════════
// FORMULAIRE — ENTRÉE
// ══════════════════════════════════════════════════════════════

function newEntry() {
  editingEntryId = null;
  entryState = { title: '', content: '' };
  populateEntryEditor();
  showView('entry-editor');
}

function openEntryEditor(entryId) {
  editingEntryId = entryId;
  const entry = (chrEntries[activeChrId] || []).find(e => e.id === entryId);
  entryState = entry ? { ...entry } : { title: '', content: '' };
  populateEntryEditor();
  showView('entry-editor');
}

function populateEntryEditor() {
  document.getElementById('entry-f-title').value   = entryState.title || '';
  document.getElementById('entry-f-content').value = entryState.content || '';
  updateEntryPreview();
}

function updateEntryPreview() {
  entryState.title   = document.getElementById('entry-f-title').value;
  entryState.content = document.getElementById('entry-f-content').value;
  const preview = document.getElementById('entry-preview-content');
  const titleHtml = entryState.title
    ? `<h1 class="chr-reader-title">${esc(entryState.title)}</h1>` : '';
  const bodyHtml = entryState.content
    ? marked.parse(entryState.content)
    : `<p class="chr-empty-preview">${t('entry_preview_empty')}</p>`;
  preview.innerHTML = titleHtml + `<div class="chr-reader-body">${bodyHtml}</div>`;
}

function switchEntryTab(tab) {
  const form    = document.getElementById('entry-editor-form');
  const preview = document.getElementById('entry-preview-panel');
  const btnF    = document.getElementById('entry-mob-tab-form');
  const btnP    = document.getElementById('entry-mob-tab-preview');
  if (tab === 'form') {
    form.classList.remove('mob-hidden'); preview.classList.add('mob-hidden');
    btnF?.classList.add('active');       btnP?.classList.remove('active');
  } else {
    form.classList.add('mob-hidden');    preview.classList.remove('mob-hidden');
    btnF?.classList.remove('active');    btnP?.classList.add('active');
  }
}

// ══════════════════════════════════════════════════════════════
// LECTEUR D'ENTRÉE
// ══════════════════════════════════════════════════════════════

function openEntryReader(entryId) {
  const entry = (chrEntries[activeChrId] || []).find(e => e.id === entryId);
  if (!entry) return;
  const chr = chronicles[activeChrId] || followedChronicles[activeChrId];
  const date = entry.created_at
    ? new Date(entry.created_at).toLocaleDateString(currentLang === 'en' ? 'en-GB' : 'fr-FR', { day:'numeric', month:'long', year:'numeric' })
    : '';
  document.getElementById('entry-reader-content').innerHTML = `
    <div class="chr-reader-breadcrumb" onclick="showChrDetail('${activeChrId}')">
      ← ${esc(chr?.title || 'Chronique')}
    </div>
    <h1 class="chr-reader-title">${esc(entry.title)}</h1>
    <div class="chr-reader-meta">${date}</div>
    <div class="chr-reader-body">${entry.content ? marked.parse(entry.content) : ''}</div>
  `;
  showView('entry-reader');
  const chrShareCode = (chronicles[activeChrId] || followedChronicles[activeChrId])?.share_code;
  if (chrShareCode) setHash('entry', chrShareCode, entryId);
}

// ══════════════════════════════════════════════════════════════
// ILLUSTRATION — CHRONIQUE
// ══════════════════════════════════════════════════════════════

function chrIllusZoneClick() {
  if (!chrState.illustration_url) document.getElementById('chr-illus-input').click();
}

function setChrIllusPreview(url, position) {
  const img         = document.getElementById('chr-illus-preview-img');
  const placeholder = document.getElementById('chr-illus-placeholder');
  const zone        = document.getElementById('chr-illus-zone');
  const sliderWrap  = document.getElementById('chr-illus-slider-wrap');
  const slider      = document.getElementById('chr-illus-pos-slider');
  const pos = position !== undefined ? position : (chrState?.illustration_position || 0);
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

function updateChrIllusPosition(val) {
  chrState.illustration_position = parseInt(val);
  const img = document.getElementById('chr-illus-preview-img');
  if (img) img.style.objectPosition = `center ${val}%`;
}

async function uploadChrIllustration(input) {
  const file = input.files[0];
  if (!file) return;
  if (!currentUser) { showToast(t('toast_upload_no_user')); return; }
  if (file.size > 3 * 1024 * 1024) { showToast(t('toast_illus_too_large')); return; }

  document.getElementById('chr-illus-uploading').classList.add('active');

  const oldUrl = chrState.illustration_url || '';
  const fileId = editingChrId || ('tmp_' + Date.now());
  const path   = `${currentUser.id}/chr_${fileId}_${Date.now()}.jpg`;

  const blob = await compressImage(file);
  const { error } = await sb.storage
    .from('character-illustrations')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  document.getElementById('chr-illus-uploading').classList.remove('active');
  if (error) { showToast(t('toast_illus_upload_error') + error.message); return; }

  if (oldUrl && !oldUrl.includes(path)) await deleteStorageFile(oldUrl);

  const { data } = sb.storage.from('character-illustrations').getPublicUrl(path);
  chrState.illustration_url      = data.publicUrl;
  chrState.illustration_position = 0;
  setChrIllusPreview(chrState.illustration_url, 0);
  showToast(t('toast_illus_added'));
  input.value = '';
}

async function removeChrIllustration() {
  if (!chrState.illustration_url) return;
  await deleteStorageFile(chrState.illustration_url);
  chrState.illustration_url      = '';
  chrState.illustration_position = 0;
  setChrIllusPreview('', 0);
}
