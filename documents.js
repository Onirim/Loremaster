// ══════════════════════════════════════════════════════════════
// Quick TTRPG Manager — Module Documents
// ══════════════════════════════════════════════════════════════

// ── État ──────────────────────────────────────────────────────
let documents         = {};
let followedDocuments = {};
let followedDocIds    = [];
let editingDocId      = null;
let docState          = null;

// ── État tags documents ───────────────────────────────────────
let allDocTags          = [];
let docTagMap           = {};   // docId → [tagId, ...]
let followedDocTagMap   = {};   // docId → [tagId, ...]
let activeDocTagFilters = [];
let filterFollowedDocs  = false;

// ══════════════════════════════════════════════════════════════
// CHARGEMENT
// ══════════════════════════════════════════════════════════════

async function loadDocumentsFromDB() {
  const { data, error } = await sb
    .from('documents')
    .select('id, title, content, is_public, share_code, illustration_url, illustration_position, updated_at')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false });
  if (error) { console.error('Erreur chargement documents:', error); return; }
  documents = {};
  (data || []).forEach(r => { documents[r.id] = { ...r }; });
  await loadDocTagsFromDB();
  await loadFollowedDocumentsFromDB();
}

async function loadDocTagsFromDB() {
  const { data: tags } = await sb.from('doc_tags').select('*').eq('user_id', currentUser.id).order('name');
  allDocTags = tags || [];
  const { data: docTags } = await sb.from('document_tags').select('document_id, tag_id');
  docTagMap = {};
  (docTags || []).forEach(({ document_id, tag_id }) => {
    if (!docTagMap[document_id]) docTagMap[document_id] = [];
    docTagMap[document_id].push(tag_id);
  });
  const { data: followedTags } = await sb.from('followed_document_tags')
    .select('document_id, tag_id').eq('user_id', currentUser.id);
  followedDocTagMap = {};
  (followedTags || []).forEach(({ document_id, tag_id }) => {
    if (!followedDocTagMap[document_id]) followedDocTagMap[document_id] = [];
    followedDocTagMap[document_id].push(tag_id);
  });
}

async function saveDocTagsToDB(docId) {
  if (!docId) return;
  const newTagIds = (docState.tags || []).map(tg => tg.id);
  const oldTagIds = docTagMap[docId] || [];
  const toAdd    = newTagIds.filter(id => !oldTagIds.includes(id));
  const toRemove = oldTagIds.filter(id => !newTagIds.includes(id));
  if (toRemove.length) {
    await sb.from('document_tags').delete().eq('document_id', docId).in('tag_id', toRemove);
    for (const tagId of toRemove) {
      const { count } = await sb.from('document_tags')
        .select('*', { count: 'exact', head: true }).eq('tag_id', tagId);
      if (count === 0) {
        await sb.from('doc_tags').delete().eq('id', tagId);
        allDocTags = allDocTags.filter(x => x.id !== tagId);
      }
    }
  }
  if (toAdd.length) {
    await sb.from('document_tags').insert(toAdd.map(tag_id => ({ document_id: docId, tag_id })));
  }
  docTagMap[docId] = newTagIds;
}

async function loadFollowedDocumentsFromDB() {
  const { data: followed } = await sb
    .from('followed_documents')
    .select('document_id')
    .eq('user_id', currentUser.id);
  followedDocIds = (followed || []).map(r => r.document_id);
  if (!followedDocIds.length) { followedDocuments = {}; return; }

  const { data } = await sb
    .from('documents')
    .select('id, title, content, is_public, share_code, illustration_url, illustration_position, updated_at, user_id')
    .in('id', followedDocIds)
    .eq('is_public', true);

  const ownerIds = [...new Set((data || []).map(r => r.user_id))];
  let ownerMap = {};
  if (ownerIds.length) {
    const { data: profiles } = await sb.from('profiles').select('id, username').in('id', ownerIds);
    (profiles || []).forEach(p => { ownerMap[p.id] = p.username; });
  }

  followedDocuments = {};
  (data || []).forEach(r => {
    followedDocuments[r.id] = { ...r, _followed: true, _owner_name: ownerMap[r.user_id] || '?' };
  });
}

// ══════════════════════════════════════════════════════════════
// CRUD
// ══════════════════════════════════════════════════════════════

async function saveDocumentToDB() {
  if (!docState.title.trim()) { alert(t('alert_doc_no_title')); return; }
  const payload = {
    user_id:               currentUser.id,
    title:                 docState.title.trim(),
    content:               docState.content,
    is_public:             docState.is_public || false,
    illustration_url:      docState.illustration_url || '',
    illustration_position: docState.illustration_position || 0,
  };
  const isUUID = editingDocId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editingDocId);

  let result;
  if (isUUID) {
    result = await sb.from('documents').update(payload)
      .eq('id', editingDocId).select('id, share_code').single();
  } else {
    editingDocId = null;
    result = await sb.from('documents').insert(payload).select('id, share_code').single();
  }
  if (result.error) { showToast(t('toast_doc_save_error')); return; }

  editingDocId = result.data.id;
  docState.share_code = result.data.share_code;
  await saveDocTagsToDB(editingDocId);
  documents[editingDocId] = { ...docState, id: editingDocId };
  docTagMap[editingDocId] = (docState.tags || []).map(tg => tg.id);
  updateDocShareCodeBox();
  showToast(t('toast_doc_saved'));
}

async function deleteDocumentFromDB(id) {
  const title = documents[id]?.title || 'ce document';
  if (!confirm(ti('confirm_delete_doc', { title }))) return;
  const illustrationUrl = documents[id]?.illustration_url || '';
  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) { showToast(t('toast_doc_delete_error')); return; }
  delete documents[id];
  if (illustrationUrl) await deleteStorageFile(illustrationUrl);
  renderDocumentsList();
  showView('documents');
}

// ══════════════════════════════════════════════════════════════
// ABONNEMENT
// ══════════════════════════════════════════════════════════════

async function followDocByCode(code) {
  if (!code.trim()) return;
  const clean = code.trim().toUpperCase();
  const { data, error } = await sb
    .from('documents')
    .select('id, title, user_id, is_public')
    .eq('share_code', clean).eq('is_public', true).single();
  if (error || !data) { showToast(t('toast_doc_not_found')); return; }
  if (data.user_id === currentUser.id) { showToast(t('toast_doc_own')); return; }
  if (followedDocIds.includes(data.id)) { showToast(t('toast_doc_already_followed')); return; }
  const { error: err } = await sb.from('followed_documents')
    .insert({ user_id: currentUser.id, document_id: data.id });
  if (err) { showToast(t('toast_doc_follow_error')); return; }
  followedDocIds.push(data.id);
  await loadFollowedDocumentsFromDB();
  document.getElementById('doc-follow-input').value = '';
  renderDocumentsList();
  showToast(ti('toast_doc_subscribed', { title: data.title }));
}

async function unfollowDocument(id) {
  await sb.from('followed_documents').delete().eq('user_id', currentUser.id).eq('document_id', id);
  followedDocIds = followedDocIds.filter(i => i !== id);
  delete followedDocuments[id];
  renderDocumentsList();
  showToast(t('toast_doc_unsubscribed'));
}

// ══════════════════════════════════════════════════════════════
// RENDU — LISTE
// ══════════════════════════════════════════════════════════════

function renderDocumentsList() {
  renderDocFilters();
  const grid  = document.getElementById('doc-grid');
  const empty = document.getElementById('doc-empty-state');
  let ownKeys      = Object.keys(documents).sort((a,b) => (documents[a].title||'').localeCompare(documents[b].title||''));
  let followedKeys = Object.keys(followedDocuments).sort((a,b) => (followedDocuments[a].title||'').localeCompare(followedDocuments[b].title||''));
  if (filterFollowedDocs) ownKeys = [];
  if (activeDocTagFilters.length) {
    ownKeys      = ownKeys.filter(id => activeDocTagFilters.every(fid => (docTagMap[id]||[]).includes(fid)));
    followedKeys = followedKeys.filter(id => activeDocTagFilters.every(fid => (followedDocTagMap[id]||[]).includes(fid)));
  }
  const total = Object.keys(documents).length + Object.keys(followedDocuments).length;
  document.getElementById('doc-count-badge').textContent = total ? `(${total})` : '';
  const allKeys = [...ownKeys, ...followedKeys];
  if (!allKeys.length) { grid.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  grid.innerHTML = [
    ...ownKeys.map(id    => docCardHTML(id, documents[id], false)),
    ...followedKeys.map(id => docCardHTML(id, followedDocuments[id], true)),
  ].join('');
}

function renderDocFilters() {
  const bar      = document.getElementById('doc-filters');
  const list     = document.getElementById('doc-filter-tags-list');
  const clearBtn = document.getElementById('doc-filter-clear-btn');
  const hasFollowed = Object.keys(followedDocuments).length > 0;
  const hasFilters  = allDocTags.length || hasFollowed;
  if (!hasFilters) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const followedBtn = hasFollowed ? `
    <button class="filter-tag ${filterFollowedDocs ? 'active' : ''}"
      style="background:rgba(155,125,232,0.12);color:var(--sup)"
      onclick="toggleFollowedDocFilter()">${t('roster_filter_followed')}</button>` : '';
  list.innerHTML = followedBtn + allDocTags.map(tg => {
    const active = activeDocTagFilters.includes(tg.id);
    return `<button class="filter-tag ${active ? 'active' : ''}"
      style="background:${tg.color}18;color:${tg.color}"
      onclick="toggleDocTagFilter('${tg.id}')">${esc(tg.name)}</button>`;
  }).join('');
  clearBtn.style.display = (activeDocTagFilters.length || filterFollowedDocs) ? 'inline-block' : 'none';
}

function toggleFollowedDocFilter() {
  filterFollowedDocs = !filterFollowedDocs;
  renderDocumentsList();
}

function toggleDocTagFilter(tagId) {
  const idx = activeDocTagFilters.indexOf(tagId);
  if (idx >= 0) activeDocTagFilters.splice(idx, 1);
  else activeDocTagFilters.push(tagId);
  renderDocumentsList();
}

function clearDocTagFilters() {
  activeDocTagFilters = [];
  filterFollowedDocs = false;
  renderDocumentsList();
}

function docCardHTML(id, d, isFollowed) {
  const preview = (d.content || '')
    .replace(/#+\s*/g, '').replace(/\*+/g, '').replace(/!?\[.*?\]\(.*?\)/g, '')
    .split('\n').find(l => l.trim()) || '';
  const previewTxt = preview.length > 180 ? preview.slice(0, 180) + '…' : preview;
  const date = d.updated_at
    ? new Date(d.updated_at).toLocaleDateString(currentLang === 'en' ? 'en-GB' : 'fr-FR', { day:'numeric', month:'short', year:'numeric' })
    : '';

  if (isFollowed) {
    const cardTags = (followedDocTagMap[id]||[]).map(tid => {
      const tg = allDocTags.find(x => x.id === tid);
      return tg ? `<span class="tag-chip" style="background:${tg.color}22;color:${tg.color};border:1px solid ${tg.color}44">${esc(tg.name)}</span>` : '';
    }).join('');
    return `<div class="doc-card" onclick="openDocReader('${id}')">
      ${d.illustration_url ? `<img class="card-illus" src="${esc(d.illustration_url)}" style="object-position:center ${d.illustration_position||0}%" onclick="event.stopPropagation();openLightbox('${esc(d.illustration_url)}')" alt="">` : ''}
      <div class="doc-card-actions">
        <button class="icon-btn" onclick="event.stopPropagation();editFollowedDocTags('${id}')" title="${t('card_manage_tags')}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 4h14M1 8h10M1 12h6"/></svg>
        </button>
        <button class="icon-btn danger" onclick="event.stopPropagation();unfollowDocument('${id}')" title="${t('btn_unsubscribe')}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,4 13,4"/><path d="M5 4V2h6v2M6 7v5M10 7v5"/><path d="M4 4l1 10h6l1-10"/></svg>
        </button>
      </div>
      <div class="doc-card-title">${esc(d.title) || 'Sans titre'}</div>
      ${previewTxt ? `<div class="doc-card-preview">${esc(previewTxt)}</div>` : ''}
      ${cardTags ? `<div class="card-tags">${cardTags}</div>` : ''}
      <div class="doc-card-footer">
        <span class="followed-badge">${t('followed_badge')}</span>
        <span class="doc-card-owner">${t('followed_owner_prefix')}${esc(d._owner_name)}</span>
        <span class="doc-card-date">${date}</span>
      </div>
    </div>`;
  }

  const visTag = d.is_public
    ? `<span class="card-visibility public">${t('visibility_public')}</span>`
    : `<span class="card-visibility private">${t('visibility_private')}</span>`;
  const cardTags = (docTagMap[id]||[]).map(tid => {
    const tg = allDocTags.find(x => x.id === tid);
    return tg ? `<span class="tag-chip" style="background:${tg.color}22;color:${tg.color};border:1px solid ${tg.color}44">${esc(tg.name)}</span>` : '';
  }).join('');

  return `<div class="doc-card" onclick="openDocReader('${id}')">
    ${d.illustration_url ? `<img class="card-illus" src="${esc(d.illustration_url)}" style="object-position:center ${d.illustration_position||0}%" onclick="event.stopPropagation();openLightbox('${esc(d.illustration_url)}')" alt="">` : ''}
    <div class="doc-card-actions">
      <button class="icon-btn" onclick="event.stopPropagation();openDocEditor('${id}')" title="${t('btn_edit')}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-9 9H2v-3z"/></svg>
      </button>
      <button class="icon-btn danger" onclick="event.stopPropagation();deleteDocumentFromDB('${id}')" title="${t('btn_delete')}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3,4 13,4"/><path d="M5 4V2h6v2M6 7v5M10 7v5"/><path d="M4 4l1 10h6l1-10"/></svg>
      </button>
    </div>
    <div class="doc-card-title">${esc(d.title) || 'Sans titre'}</div>
    ${previewTxt ? `<div class="doc-card-preview">${esc(previewTxt)}</div>` : ''}
    ${cardTags ? `<div class="card-tags">${cardTags}</div>` : ''}
    <div class="doc-card-footer">
      ${visTag}
      <span class="doc-card-date">${date}</span>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// FORMULAIRE ÉDITEUR
// ══════════════════════════════════════════════════════════════

function newDocument() {
  editingDocId = null;
  docState = { title:'', content:'', is_public:false, share_code:null,
               illustration_url:'', illustration_position:0, tags:[] };
  showView('doc-editor');
  populateDocEditor();
}

function openDocEditor(id) {
  editingDocId = id;
  docState = { ...documents[id], tags:[] };
  if (editingDocId && docTagMap[editingDocId]) {
    docState.tags = docTagMap[editingDocId]
      .map(tid => allDocTags.find(tg => tg.id === tid))
      .filter(Boolean);
  }
  showView('doc-editor');
  populateDocEditor();
}

function populateDocEditor() {
  document.getElementById('doc-f-title').value   = docState.title || '';
  document.getElementById('doc-f-content').value = docState.content || '';
  const pub = document.getElementById('doc-f-public');
  pub.checked = docState.is_public || false;
  document.getElementById('doc-public-label').textContent =
    pub.checked ? t('share_code_active_doc') : t('share_code_inactive_doc');
  setDocIllusPreview(docState.illustration_url || '', docState.illustration_position || 0);
  renderDocTagChips();
  updateDocPreview();
  updateDocShareCodeBox();
}

function updateDocForm() {
  docState.title     = document.getElementById('doc-f-title').value;
  docState.content   = document.getElementById('doc-f-content').value;
  docState.is_public = document.getElementById('doc-f-public').checked;
  document.getElementById('doc-public-label').textContent =
    docState.is_public ? t('share_code_active_doc') : t('share_code_inactive_doc');
  updateDocShareCodeBox();
  updateDocPreview();
}

function updateDocPreview() {
  docState.title   = document.getElementById('doc-f-title').value;
  docState.content = document.getElementById('doc-f-content').value;
  const preview = document.getElementById('doc-preview-content');
  const titleHtml = docState.title
    ? `<h1 class="doc-reader-title">${esc(docState.title)}</h1>` : '';
  const bodyHtml = docState.content
    ? marked.parse(docState.content)
    : `<p class="doc-empty-preview">${t('doc_preview_empty')}</p>`;
  preview.innerHTML = titleHtml + `<div class="doc-reader-body">${bodyHtml}</div>`;
}

function updateDocShareCodeBox() {
  const box = document.getElementById('doc-share-code-box');
  const val = document.getElementById('doc-share-code-val');
  if (!box || !val) return;
  const code = docState?.share_code ||
    (editingDocId && documents[editingDocId]?.share_code) || null;
  if (docState?.is_public && code) { val.textContent = code; box.style.display = 'flex'; }
  else box.style.display = 'none';
}

function copyDocShareCode() {
  const code = document.getElementById('doc-share-code-val')?.textContent;
  if (!code || code === '—') return;
  navigator.clipboard.writeText(code)
    .then(() => showToast(ti('toast_code_copied', { code })))
    .catch(() => prompt(t('share_code_prompt_short'), code));
}

function shareDocBtn() {
  if (!docState?.is_public) { showToast(t('toast_chr_share_need_public')); return; }
  const code = docState?.share_code || (editingDocId && documents[editingDocId]?.share_code);
  if (!code) { showToast(t('toast_chr_share_need_save')); return; }
  copyUrl(buildShareUrl('doc', code));
}

function shareDocReaderBtn() {
  if (!editingDocId && !Object.keys(documents).length) return;
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('doc/')) {
    const docId = hash.replace('doc/', '');
    const d = documents[docId] || followedDocuments[docId];
    const code = d?.share_code;
    if (code) copyUrl(buildShareUrl('doc', code));
    else copyUrl(buildShareUrl('doc', docId)); // fallback UUID si pas de share_code
  }
}

function switchDocTab(tab) {
  const form    = document.getElementById('doc-editor-form');
  const preview = document.getElementById('doc-preview-panel');
  const btnF    = document.getElementById('doc-mob-tab-form');
  const btnP    = document.getElementById('doc-mob-tab-preview');
  if (tab === 'form') {
    form.classList.remove('mob-hidden'); preview.classList.add('mob-hidden');
    btnF?.classList.add('active');       btnP?.classList.remove('active');
  } else {
    form.classList.add('mob-hidden');    preview.classList.remove('mob-hidden');
    btnF?.classList.remove('active');    btnP?.classList.add('active');
  }
}

// ══════════════════════════════════════════════════════════════
// LECTEUR
// ══════════════════════════════════════════════════════════════

function openDocReader(id) {
  const d = followedDocuments[id] || documents[id];
  if (!d) return;
  const isOwn = !!documents[id];
  const illusHtml = d.illustration_url
    ? `<img class="doc-reader-illus" src="${esc(d.illustration_url)}"
        style="object-position:center ${d.illustration_position||0}%"
        onclick="openLightbox('${esc(d.illustration_url)}')" alt="">` : '';
  const bannerHtml = isOwn
    ? `<div class="doc-reader-header">
        <button class="btn-cancel" onclick="openDocEditor('${id}')">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M11 2l3 3-9 9H2v-3z"/></svg>
          ${t('btn_edit')}
        </button>
       </div>`
    : `<div class="shared-banner">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="3" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="12" cy="13" r="1.5"/>
          <line x1="5.5" y1="7" x2="10.5" y2="4.3"/><line x1="5.5" y1="9" x2="10.5" y2="11.7"/>
        </svg>
        ${t('doc_reader_banner')}
       </div>`;
  const metaHtml = d._owner_name
    ? `<div class="doc-reader-meta">${t('followed_owner_prefix')}${esc(d._owner_name)}</div>` : '';
  document.getElementById('doc-reader-content').innerHTML = `
    ${bannerHtml}
    ${illusHtml}
    <h1 class="doc-reader-title">${esc(d.title)}</h1>
    ${metaHtml}
    <div class="doc-reader-body">${d.content ? marked.parse(d.content) : ''}</div>`;
  showView('doc-reader');
  if (d.share_code) setHash('doc', d.share_code);
}

// ══════════════════════════════════════════════════════════════
// ILLUSTRATION
// ══════════════════════════════════════════════════════════════

function docIllusZoneClick() {
  if (!docState.illustration_url) document.getElementById('doc-illus-input').click();
}

function setDocIllusPreview(url, position) {
  const img         = document.getElementById('doc-illus-preview-img');
  const placeholder = document.getElementById('doc-illus-placeholder');
  const zone        = document.getElementById('doc-illus-zone');
  const sliderWrap  = document.getElementById('doc-illus-slider-wrap');
  const slider      = document.getElementById('doc-illus-pos-slider');
  const pos = position !== undefined ? position : (docState?.illustration_position || 0);
  if (url) {
    img.src = url; img.style.display = 'block';
    img.style.objectPosition = `center ${pos}%`;
    placeholder.style.display = 'none';
    zone.classList.add('has-image');
    sliderWrap.classList.add('visible'); slider.value = pos;
  } else {
    img.src = ''; img.style.display = 'none';
    placeholder.style.display = 'flex';
    zone.classList.remove('has-image');
    sliderWrap.classList.remove('visible'); slider.value = 0;
  }
}

function updateDocIllusPosition(val) {
  docState.illustration_position = parseInt(val);
  const img = document.getElementById('doc-illus-preview-img');
  if (img) img.style.objectPosition = `center ${val}%`;
}

async function uploadDocIllustration(input) {
  const file = input.files[0];
  if (!file) return;
  if (!currentUser) { showToast(t('toast_upload_no_user')); return; }
  if (file.size > 3 * 1024 * 1024) { showToast(t('toast_illus_too_large')); return; }
  document.getElementById('doc-illus-uploading').classList.add('active');
  const oldUrl = docState.illustration_url || '';
  const fileId = editingDocId || ('tmp_' + Date.now());
  const path   = `${currentUser.id}/doc_${fileId}.jpg`;
  const blob   = await compressImage(file);
  const { error } = await sb.storage
    .from('character-illustrations').upload(path, blob, { upsert:true, contentType:'image/jpeg' });
  document.getElementById('doc-illus-uploading').classList.remove('active');
  if (error) { showToast(t('toast_illus_upload_error') + error.message); return; }
  if (oldUrl && !oldUrl.includes(path)) await deleteStorageFile(oldUrl);
  const { data } = sb.storage.from('character-illustrations').getPublicUrl(path);
  docState.illustration_url      = data.publicUrl;
  docState.illustration_position = 0;
  setDocIllusPreview(docState.illustration_url, 0);
  showToast(t('toast_illus_added'));
  input.value = '';
}

async function removeDocIllustration() {
  if (!docState.illustration_url) return;
  await deleteStorageFile(docState.illustration_url);
  docState.illustration_url      = '';
  docState.illustration_position = 0;
  setDocIllusPreview('', 0);
}

// ══════════════════════════════════════════════════════════════
// TAGS — Formulaire éditeur document
// ══════════════════════════════════════════════════════════════

function renderDocTagChips() {
  const container = document.getElementById('doc-tags-chips-container');
  if (!container) return;
  container.innerHTML = (docState.tags || []).map((tg, i) => `
    <span class="tag-chip" style="background:${tg.color}22;color:${tg.color};border:1px solid ${tg.color}44">
      ${esc(tg.name)}
      <button class="tag-remove" onclick="removeDocTagFromState(${i})" tabindex="-1">×</button>
    </span>`).join('');
}

function removeDocTagFromState(i) {
  docState.tags.splice(i, 1);
  renderDocTagChips();
}

function onDocTagInput(val) {
  showDocTagAutocomplete(val);
}

function onDocTagKeydown(e) {
  const ac = document.getElementById('doc-tags-autocomplete');
  const items = ac.querySelectorAll('.tags-autocomplete-item');
  const activeIdx = [...items].findIndex(el => el.classList.contains('active'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = activeIdx < items.length - 1 ? activeIdx + 1 : 0;
    items.forEach((el, i) => el.classList.toggle('active', i === next));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = activeIdx > 0 ? activeIdx - 1 : items.length - 1;
    items.forEach((el, i) => el.classList.toggle('active', i === prev));
  } else if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const activeItem = ac.querySelector('.tags-autocomplete-item.active');
    if (activeItem) activeItem.click();
    else { const val = e.target.value.trim(); if (val) addOrCreateDocTag(val); }
  } else if (e.key === 'Escape') {
    hideDocTagAutocomplete();
  } else if (e.key === 'Backspace' && e.target.value === '') {
    if (docState.tags && docState.tags.length) { docState.tags.pop(); renderDocTagChips(); }
  }
}

function showDocTagAutocomplete(query) {
  const ac = document.getElementById('doc-tags-autocomplete');
  const q = query.trim().toLowerCase();
  const assigned = (docState.tags || []).map(tg => tg.id);
  const filtered = allDocTags.filter(tg =>
    !assigned.includes(tg.id) && (!q || tg.name.toLowerCase().includes(q))
  );
  const exactMatch = allDocTags.find(tg => tg.name.toLowerCase() === q);
  const showCreate = q && !exactMatch;
  if (!filtered.length && !showCreate) { ac.style.display = 'none'; return; }
  ac.innerHTML = [
    ...filtered.map(tg => `
      <div class="tags-autocomplete-item" onclick="selectExistingDocTag('${tg.id}')">
        <span class="dot" style="background:${tg.color}"></span>
        ${esc(tg.name)}
      </div>`),
    showCreate ? `
      <div class="tags-autocomplete-item" onclick="addOrCreateDocTag('${esc(query.trim())}')">
        <span class="dot" style="background:${randomTagColor()}"></span>
        ${esc(query.trim())}
        <span class="new-hint">${t('editor_tag_create_hint')}</span>
      </div>` : ''
  ].join('');
  ac.style.display = 'block';
}

function hideDocTagAutocomplete() {
  const ac = document.getElementById('doc-tags-autocomplete');
  if (ac) ac.style.display = 'none';
}

function selectExistingDocTag(tagId) {
  const tg = allDocTags.find(x => x.id === tagId);
  if (!tg) return;
  if (!docState.tags) docState.tags = [];
  if (!docState.tags.find(x => x.id === tagId)) { docState.tags.push(tg); renderDocTagChips(); }
  document.getElementById('doc-tag-text-input').value = '';
  hideDocTagAutocomplete();
}

async function addOrCreateDocTag(name) {
  name = name.trim();
  if (!name) return;
  let tg = allDocTags.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!tg) {
    const color = randomTagColor();
    const { data, error } = await sb.from('doc_tags')
      .insert({ user_id: currentUser.id, name, color })
      .select().single();
    if (error) { showToast(t('toast_tag_error')); return; }
    tg = data;
    allDocTags.push(tg);
    allDocTags.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (!docState.tags) docState.tags = [];
  if (!docState.tags.find(x => x.id === tg.id)) { docState.tags.push(tg); renderDocTagChips(); }
  document.getElementById('doc-tag-text-input').value = '';
  hideDocTagAutocomplete();
}

document.addEventListener('click', e => {
  const wrap = document.getElementById('doc-tags-input-wrap');
  const ac   = document.getElementById('doc-tags-autocomplete');
  if (wrap && ac && !wrap.contains(e.target) && !ac.contains(e.target)) hideDocTagAutocomplete();
});

// ══════════════════════════════════════════════════════════════
// TAGS — Documents suivis (modale)
// ══════════════════════════════════════════════════════════════

let editingFollowedDocId = null;

function editFollowedDocTags(docId) {
  editingFollowedDocId = docId;
  const d = followedDocuments[docId];
  const tags = (followedDocTagMap[docId] || [])
    .map(tid => allDocTags.find(x => x.id === tid)).filter(Boolean);
  renderFollowedDocTagChips(docId, tags);
  document.getElementById('followed-doc-tag-modal-name').textContent = d?.title || '';
  document.getElementById('followed-doc-tag-modal').style.display = 'flex';
  document.getElementById('followed-doc-tag-input').value = '';
  document.getElementById('followed-doc-tag-autocomplete').style.display = 'none';
}

function closeFollowedDocTagModal() {
  document.getElementById('followed-doc-tag-modal').style.display = 'none';
  editingFollowedDocId = null;
}

function renderFollowedDocTagChips(docId, tags) {
  const container = document.getElementById('followed-doc-tag-chips');
  const list = tags || (followedDocTagMap[docId] || [])
    .map(tid => allDocTags.find(x => x.id === tid)).filter(Boolean);
  container.innerHTML = list.map(tg => `
    <span class="tag-chip" style="background:${tg.color}22;color:${tg.color};border:1px solid ${tg.color}44">
      ${esc(tg.name)}
      <button class="tag-remove" onclick="removeFollowedDocTag('${docId}','${tg.id}')" tabindex="-1">×</button>
    </span>`).join('');
}

async function removeFollowedDocTag(docId, tagId) {
  followedDocTagMap[docId] = (followedDocTagMap[docId] || []).filter(id => id !== tagId);
  await sb.from('followed_document_tags')
    .delete().eq('user_id', currentUser.id).eq('document_id', docId).eq('tag_id', tagId);
  renderFollowedDocTagChips(docId);
  renderDocumentsList();
}

async function addFollowedDocTag(name) {
  name = name.trim();
  if (!name || !editingFollowedDocId) return;
  let tg = allDocTags.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!tg) {
    const color = randomTagColor();
    const { data, error } = await sb.from('doc_tags')
      .insert({ user_id: currentUser.id, name, color }).select().single();
    if (error) { showToast(t('toast_tag_error')); return; }
    tg = data;
    allDocTags.push(tg);
    allDocTags.sort((a, b) => a.name.localeCompare(b.name));
  }
  const docId = editingFollowedDocId;
  if (!(followedDocTagMap[docId] || []).includes(tg.id)) {
    if (!followedDocTagMap[docId]) followedDocTagMap[docId] = [];
    followedDocTagMap[docId].push(tg.id);
    await sb.from('followed_document_tags')
      .insert({ user_id: currentUser.id, document_id: docId, tag_id: tg.id });
    renderFollowedDocTagChips(docId);
    renderDocumentsList();
  }
  document.getElementById('followed-doc-tag-input').value = '';
  document.getElementById('followed-doc-tag-autocomplete').style.display = 'none';
}

function onFollowedDocTagInput(val) {
  const ac = document.getElementById('followed-doc-tag-autocomplete');
  const q = val.trim().toLowerCase();
  const assigned = followedDocTagMap[editingFollowedDocId] || [];
  const filtered = allDocTags.filter(tg => !assigned.includes(tg.id) && (!q || tg.name.toLowerCase().includes(q)));
  const exactMatch = allDocTags.find(tg => tg.name.toLowerCase() === q);
  const showCreate = q && !exactMatch;
  if (!filtered.length && !showCreate) { ac.style.display = 'none'; return; }
  ac.innerHTML = [
    ...filtered.map(tg => `
      <div class="tags-autocomplete-item" onclick="selectFollowedDocTag('${tg.id}')">
        <span class="dot" style="background:${tg.color}"></span>${esc(tg.name)}
      </div>`),
    showCreate ? `
      <div class="tags-autocomplete-item" onclick="addFollowedDocTag('${esc(val.trim())}')">
        <span class="dot" style="background:${randomTagColor()}"></span>${esc(val.trim())}
        <span class="new-hint">${t('editor_tag_create_hint')}</span>
      </div>` : ''
  ].join('');
  ac.style.display = 'block';
}

async function selectFollowedDocTag(tagId) {
  const tg = allDocTags.find(x => x.id === tagId);
  if (!tg || !editingFollowedDocId) return;
  const docId = editingFollowedDocId;
  if (!(followedDocTagMap[docId] || []).includes(tg.id)) {
    if (!followedDocTagMap[docId]) followedDocTagMap[docId] = [];
    followedDocTagMap[docId].push(tg.id);
    const { error } = await sb.from('followed_document_tags')
      .insert({ user_id: currentUser.id, document_id: docId, tag_id: tg.id });
    if (error) {
      followedDocTagMap[docId] = followedDocTagMap[docId].filter(id => id !== tg.id);
      showToast(t('toast_tag_add_error')); return;
    }
    renderFollowedDocTagChips(docId);
    renderDocumentsList();
  }
  document.getElementById('followed-doc-tag-input').value = '';
  document.getElementById('followed-doc-tag-autocomplete').style.display = 'none';
}

function onFollowedDocTagKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const ac = document.getElementById('followed-doc-tag-autocomplete');
    const active = ac.querySelector('.tags-autocomplete-item.active');
    if (active) active.click();
    else { const v = e.target.value.trim(); if (v) addFollowedDocTag(v); }
  } else if (e.key === 'Escape') {
    document.getElementById('followed-doc-tag-autocomplete').style.display = 'none';
  }
}
