// ══════════════════════════════════════════════════════════════
// Camply TTRPG Manager — Éditeur générique
// ══════════════════════════════════════════════════════════════

function newChar() {
  editingId = null;
  state     = freshState();
  populateEditor();
  showView('editor');
}

function editChar(id, dataOverride) {
  editingId = id;
  const src = dataOverride || (id ? chars[id] : null) || freshState();
  state = JSON.parse(JSON.stringify(src));
  if (!state.characteristics) state.characteristics = [];
  if (!state.skills)          state.skills          = [];
  if (!state.traits)          state.traits          = [];
  if (!state.tags)            state.tags            = [];
  // Niveau : 0 est valide (pas de niveau)
  if (state.level === undefined || state.level === null) state.level = 0;
  if (editingId && charTagMap[editingId]) {
    state.tags = charTagMap[editingId]
      .map(tid => allTags.find(tg => tg.id === tid))
      .filter(Boolean);
  }
  populateEditor();
  showView('editor');
}

function populateEditor() {
  document.getElementById('f-name').value       = state.name || '';
  document.getElementById('f-sub').value        = state.subtitle || '';
  document.getElementById('f-race-class').value = state.race_class || '';
  document.getElementById('f-level').value      = state.level ?? 0;
  const lvlDisplay = document.getElementById('level-display');
  if (lvlDisplay) lvlDisplay.textContent = state.level ?? 0;

  const pubCb = document.getElementById('f-public');
  if (pubCb) {
    pubCb.checked = state.is_public || false;
    document.getElementById('public-label').textContent =
      pubCb.checked ? t('share_code_active') : t('share_code_inactive');
  }
  _updateShareCodeBox();

  renderCharacteristics();
  renderSkills();
  renderTraits();

  const bgField = document.getElementById('f-background');
  if (bgField) bgField.value = state.background || '';
  const descriptionField = document.getElementById('f-description');
  if (descriptionField) descriptionField.value = state.description || '';

  renderTagChips();
  setIllusPreview(state.illustration_url || '', state.illustration_position || 0);
  updatePreview();
}

// ── Share code ────────────────────────────────────────────────
function _updateShareCodeBox() {
  const scBox = document.getElementById('share-code-box');
  const scVal = document.getElementById('share-code-val');
  if (!scBox || !scVal) return;
  const code = state.share_code || (editingId && chars[editingId]?.share_code) || null;
  if (state.is_public && code) {
    scVal.textContent   = code;
    scBox.style.display = 'flex';
  } else {
    scBox.style.display = 'none';
  }
}


// ══════════════════════════════════════════════════════════════
// CARACTÉRISTIQUES
// ══════════════════════════════════════════════════════════════

function renderCharacteristics() {
  const list = document.getElementById('characteristics-list');
  if (!list) return;
  list.innerHTML = (state.characteristics || []).map((ch, i) => characteristicHTML(ch, i)).join('');
}

function characteristicHTML(ch, i) {
  return `<div class="generic-entry" id="char-entry-${i}">
    <div class="generic-entry-row">
      <input type="text"
        class="generic-input"
        placeholder="${t('editor_char_name_ph')}"
        value="${esc(ch.name || '')}"
        oninput="state.characteristics[${i}].name=this.value;updatePreview()">
      <input type="text"
        class="generic-input trigram-input"
        placeholder="${t('editor_char_trigram_ph')}"
        maxlength="3"
        value="${esc(ch.trigram || '')}"
        oninput="this.value=this.value.toUpperCase();state.characteristics[${i}].trigram=this.value;updatePreview()">
      <div class="score-ctrl">
        <button onclick="changeScore('characteristics',${i},-1,event)">−</button>
        <div class="score-val">${ch.score ?? 0}</div>
        <button onclick="changeScore('characteristics',${i},1,event)">+</button>
      </div>
      <button class="rm-btn" onclick="removeCharacteristic(${i})">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="3" y1="3" x2="13" y2="13"/>
          <line x1="13" y1="3" x2="3" y2="13"/>
        </svg>
      </button>
    </div>
  </div>`;
}

function addCharacteristic() {
  state.characteristics.push({ id: _uid(), name: '', trigram: '', score: 0 });
  renderCharacteristics();
  updatePreview();
}

function removeCharacteristic(i) {
  state.characteristics.splice(i, 1);
  renderCharacteristics();
  updatePreview();
}


// ══════════════════════════════════════════════════════════════
// COMPÉTENCES
// ══════════════════════════════════════════════════════════════

function renderSkills() {
  const list = document.getElementById('skills-list');
  if (!list) return;
  list.innerHTML = (state.skills || []).map((sk, i) => skillHTML(sk, i)).join('');
}

function skillHTML(sk, i) {
  return `<div class="generic-entry skill-entry">
    <input type="text"
      class="generic-input"
      placeholder="${t('editor_skill_name_ph')}"
      value="${esc(sk.name || '')}"
      style="flex:1"
      oninput="state.skills[${i}].name=this.value;updatePreview()">
    <div class="score-ctrl">
      <button onclick="changeScore('skills',${i},-1,event)">−</button>
      <div class="score-val">${sk.score ?? 0}</div>
      <button onclick="changeScore('skills',${i},1,event)">+</button>
    </div>
    <button class="rm-btn" onclick="removeSkill(${i})">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="3" y1="3" x2="13" y2="13"/>
        <line x1="13" y1="3" x2="3" y2="13"/>
      </svg>
    </button>
  </div>`;
}

function addSkill() {
  state.skills.push({ id: _uid(), name: '', score: 0 });
  renderSkills();
  updatePreview();
}

function removeSkill(i) {
  state.skills.splice(i, 1);
  renderSkills();
  updatePreview();
}


// ══════════════════════════════════════════════════════════════
// TRAITS (sans champ "type")
// ══════════════════════════════════════════════════════════════

function renderTraits() {
  const list = document.getElementById('traits-list');
  if (!list) return;
  list.innerHTML = (state.traits || []).map((tr, i) => traitHTML(tr, i)).join('');
}

function traitHTML(tr, i) {
  return `<div class="generic-entry trait-entry">
    <div class="generic-entry-row" style="gap:6px">
      <input type="text"
        class="generic-input"
        placeholder="${t('editor_trait_name_ph')}"
        value="${esc(tr.name || '')}"
        style="flex:1"
        oninput="state.traits[${i}].name=this.value;updatePreview()">
      <div class="score-ctrl">
        <button onclick="changeScore('traits',${i},-1,event)">−</button>
        <div class="score-val trait-score">${tr.score !== '' && tr.score !== undefined && tr.score !== null ? tr.score : '—'}</div>
        <button onclick="changeScore('traits',${i},1,event)">+</button>
      </div>
      <button class="rm-btn" onclick="removeTrait(${i})">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="3" y1="3" x2="13" y2="13"/>
          <line x1="13" y1="3" x2="3" y2="13"/>
        </svg>
      </button>
    </div>
    <textarea
      class="generic-textarea"
      placeholder="${t('editor_trait_detail_ph')}"
      oninput="state.traits[${i}].detail=this.value;updatePreview()">${esc(tr.detail || '')}</textarea>
  </div>`;
}

function addTrait() {
  state.traits.push({ id: _uid(), name: '', detail: '', score: '' });
  renderTraits();
  updatePreview();
}

function removeTrait(i) {
  state.traits.splice(i, 1);
  renderTraits();
  updatePreview();
}


// ══════════════════════════════════════════════════════════════
// SCORE UNIVERSEL
// Shift+clic → ±10 ; clic normal → ±1
// Caractéristiques et compétences : peuvent être négatifs
// Traits : score optionnel (chaîne vide = pas de score)
// ══════════════════════════════════════════════════════════════

function changeScore(section, idx, delta, event) {
  const step = (event && event.shiftKey) ? delta * 10 : delta;
  const item = state[section][idx];

  if (section === 'traits') {
    // Score optionnel : si vide, on démarre à 0
    const current = item.score === '' || item.score === undefined || item.score === null
      ? 0 : parseInt(item.score) || 0;
    const nv = current + step;
    item.score = nv === 0 ? '' : nv;
  } else {
    // Caractéristiques et compétences : pas de minimum (négatif autorisé)
    item.score = (parseInt(item.score) || 0) + step;
  }

  // Rafraîchit le DOM localement
  const scoreEl = event?.target?.closest('.generic-entry')?.querySelector('.score-val');
  if (scoreEl) {
    if (section === 'traits') {
      scoreEl.textContent = item.score === '' || item.score === undefined ? '—' : item.score;
    } else {
      scoreEl.textContent = item.score;
    }
  }

  if (section === 'characteristics') renderCharacteristics();
  if (section === 'skills')          renderSkills();
  if (section === 'traits')          renderTraits();

  updatePreview();
}


// ══════════════════════════════════════════════════════════════
// NIVEAU (0 = pas de niveau ; peut aller en négatif si besoin)
// ══════════════════════════════════════════════════════════════

function changeLevel(delta, event) {
  const step = (event && event.shiftKey) ? delta * 10 : delta;
  // Niveau minimum : 0 (pas de niveau négatif pour le niveau)
  state.level = Math.max(0, (state.level ?? 0) + step);
  const el = document.getElementById('level-display');
  if (el) el.textContent = state.level;
  const hidden = document.getElementById('f-level');
  if (hidden) hidden.value = state.level;
  updatePreview();
}


// ══════════════════════════════════════════════════════════════
// PREVIEW
// ══════════════════════════════════════════════════════════════

function updatePreview() {
  state.name       = document.getElementById('f-name').value;
  state.subtitle   = document.getElementById('f-sub').value;
  state.race_class = document.getElementById('f-race-class').value;
  state.level      = parseInt(document.getElementById('f-level')?.value) ?? 0;
  state.description = document.getElementById('f-description')?.value || state.description || '';
  state.background = document.getElementById('f-background')?.value || state.background || '';

  const pubCb = document.getElementById('f-public');
  if (pubCb) {
    state.is_public = pubCb.checked;
    document.getElementById('public-label').textContent =
      pubCb.checked ? t('share_code_active') : t('share_code_inactive');
  }
  _updateShareCodeBox();

  document.getElementById('preview-content').innerHTML = renderCharSheet(state);
}


// ══════════════════════════════════════════════════════════════
// SAVE / SHARE
// ══════════════════════════════════════════════════════════════

function saveChar() { saveCharToDB(); }

function shareChar() {
  if (!state.is_public) { showToast(t('toast_share_need_public')); return; }
  const code = state.share_code || (editingId && chars[editingId]?.share_code);
  if (!code) { showToast(t('toast_share_need_save')); return; }
  copyUrl(buildShareUrl('char', code));
}

function copyShareCode() {
  const code = document.getElementById('share-code-val')?.textContent;
  if (!code || code === '—') return;
  navigator.clipboard.writeText(code)
    .then(() => showToast(ti('toast_code_copied', { code })))
    .catch(() => prompt(t('share_code_prompt_short'), code));
}


// ══════════════════════════════════════════════════════════════
// MOBILE TABS
// ══════════════════════════════════════════════════════════════

function switchMobTab(tab) {
  const form    = document.getElementById('editor-form');
  const preview = document.getElementById('preview-panel');
  const btnForm = document.getElementById('mob-tab-form');
  const btnPrev = document.getElementById('mob-tab-preview');
  if (!form || !preview) return;
  if (tab === 'form') {
    form.classList.remove('mob-hidden');   preview.classList.add('mob-hidden');
    btnForm?.classList.add('active');      btnPrev?.classList.remove('active');
  } else {
    form.classList.add('mob-hidden');      preview.classList.remove('mob-hidden');
    btnForm?.classList.remove('active');   btnPrev?.classList.add('active');
  }
}

// ── Utilitaire ────────────────────────────────────────────────
function _uid() {
  return Math.random().toString(36).slice(2, 10);
}
