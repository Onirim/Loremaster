// ══════════════════════════════════════════════════════════════
// RPG CAMPAIGN MANAGER — Éditeur de personnage
// Les calculs de points et le rendu de fiche sont délégués
// à game-system.js. Ce fichier gère uniquement l'UI de l'éditeur.
// ══════════════════════════════════════════════════════════════

function newChar() {
  editingId = null;
  state     = freshState();         // défini dans game-system.js
  populateEditor();
  showView('editor');
}

function editChar(id, dataOverride) {
  editingId = id;
  const src = dataOverride || (id ? chars[id] : null) || freshState();
  state = JSON.parse(JSON.stringify(src));
  // Champs qui doivent toujours exister
  if (!state.aptitudes)     state.aptitudes     = {};
  if (!state.powers)        state.powers        = [];
  if (!state.traits)        state.traits        = [];
  if (!state.complications) state.complications = [];
  if (!state.tags)          state.tags          = [];
  if (editingId && charTagMap[editingId]) {
    state.tags = charTagMap[editingId]
      .map(tid => allTags.find(tg => tg.id === tid))
      .filter(Boolean);
  }
  populateEditor();
  showView('editor');
}

function populateEditor() {
  document.getElementById('f-name').value     = state.name || '';
  document.getElementById('f-sub').value      = state.subtitle || '';
  document.getElementById('f-rank').value     = state.rank || 5;
  document.getElementById('f-maturity').value = state.maturity || 'adulte';

  const pubCb = document.getElementById('f-public');
  if (pubCb) {
    pubCb.checked = state.is_public || false;
    document.getElementById('public-label').textContent =
      pubCb.checked ? t('share_code_active') : t('share_code_inactive');
  }
  _updateShareCodeBox();

  document.getElementById('val-e').textContent = state.energy;
  document.getElementById('val-r').textContent = state.recovery;
  document.getElementById('val-v').textContent = state.vigor;

  renderPowers();
  renderAptitudes();
  renderTraits();
  renderComplications();

  const bgField = document.getElementById('f-background');
  if (bgField) bgField.value = state.background || '';

  document.getElementById('xp-hero-val').textContent = state.xp_hero || 0;
  document.getElementById('xp-apt-val').textContent  = state.xp_apt  || 0;

  renderTagChips();
  setIllusPreview(state.illustration_url || '', state.illustration_position || 0);
  updatePreview();
  updatePtsDisplay();
  updateAptPtsDisplay();
}

// ── Share code box ─────────────────────────────────────────────
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

// ── Attributs ─────────────────────────────────────────────────
function changeAttr(attr, delta) {
  const key = { e: 'energy', r: 'recovery', v: 'vigor' }[attr];
  const nv  = Math.max(1, state[key] + delta);
  if (attr === 'r' && nv > state.energy) return;
  state[key] = nv;
  document.getElementById('val-' + attr).textContent = nv;
  updatePtsDisplay();
  updatePreview();
}

function updatePtsDisplay() {
  const used = totalCost(state);   // game-system.js
  const max  = maxPts(state);      // game-system.js
  const el   = document.getElementById('pts-display');
  el.textContent = `${used} / ${max}`;
  el.className   = 'pts-value ' + (used > max ? 'over' : 'ok');

  const attrCosts = { e: 2, r: 3, v: 1 };
  const attrKeys  = { e: 'energy', r: 'recovery', v: 'vigor' };
  ['e', 'r', 'v'].forEach(a => {
    document.getElementById('cost-' + a).textContent =
      `${state[attrKeys[a]] * attrCosts[a]} pts`;
  });
}

function updateRankMax() {
  state.rank = parseInt(document.getElementById('f-rank').value);
  updatePtsDisplay();
  updatePreview();
}

// ── Pouvoirs ──────────────────────────────────────────────────
function renderPowers() {
  document.getElementById('powers-list').innerHTML =
    state.powers.map((p, i) => powerEntryHTML(p, i)).join('');
}

function powerEntryHTML(p, i) {
  const typeOpts = POWER_TYPES().map(pt =>    // game-system.js
    `<option value="${pt.value}" ${p.type === pt.value ? 'selected' : ''}>
      ${pt.label} — ${pt.desc}
    </option>`
  ).join('');
  const modOpts = MOD_OPTIONS().map(m =>       // game-system.js
    `<option value="${m.value}" ${p.mod === m.value ? 'selected' : ''}>${m.label}</option>`
  ).join('');

  return `<div class="power-entry" id="pow-${i}">
    <div class="power-entry-header">
      <input type="text"
        placeholder="${t('editor_power_name_ph')}"
        value="${esc(p.name || '')}"
        oninput="state.powers[${i}].name=this.value;updatePreview()">
      <button class="rm-btn" onclick="removePower(${i})">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="3" y1="3" x2="13" y2="13"/>
          <line x1="13" y1="3" x2="3" y2="13"/>
        </svg>
      </button>
    </div>
    <div class="power-entry-footer">
      <select onchange="state.powers[${i}].type=this.value;updatePreview()">${typeOpts}</select>
      <select class="mod-select"
        onchange="state.powers[${i}].mod=this.value;updatePtsDisplay();updatePreview()">
        ${modOpts}
      </select>
      <div class="power-cost-display">${powerCost(p)} pts</div>
    </div>
    <div style="margin-top:7px">
      <input type="text"
        placeholder="${t('editor_power_desc_ph')}"
        style="width:100%;background:var(--bg4);border:1px solid var(--border);border-radius:4px;
               color:var(--text);font-size:12px;padding:5px 8px;outline:none"
        value="${esc(p.desc || '')}"
        oninput="state.powers[${i}].desc=this.value;updatePreview()"
        onfocus="this.style.borderColor='var(--accent)'"
        onblur="this.style.borderColor='var(--border)'">
    </div>
  </div>`;
}

function addPower() {
  state.powers.push({ name: '', type: 'offc', mod: '0', desc: '' });
  renderPowers();
  updatePtsDisplay();
  updatePreview();
}
function removePower(i) {
  state.powers.splice(i, 1);
  renderPowers();
  updatePtsDisplay();
  updatePreview();
}

// ── Aptitudes ─────────────────────────────────────────────────
function renderAptitudes() {
  const grid    = document.getElementById('aptitude-grid');
  const aptList = APTITUDES();               // game-system.js
  const half    = Math.ceil(aptList.length / 2);
  const left    = aptList.slice(0, half);
  const right   = aptList.slice(half);

  const cell = (label, frKey) => label ? `
    <div class="apt-row">
      <div class="apt-name">${label}</div>
      <div class="apt-ctrl">
        <button onclick="changeApt('${frKey}', -1)">−</button>
        <div class="apt-val ${(state.aptitudes[frKey] || 0) === 0 ? 'zero' : ''}"
          id="apt-${frKey.replace(/\s/g, '_')}">
          ${state.aptitudes[frKey] || 0}
        </div>
        <button onclick="changeApt('${frKey}', 1)">+</button>
      </div>
    </div>` : '<div></div>';

  let rows = '';
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const keyL = left[i]  ? APTITUDES_KEYS[i]        : null;
    const keyR = right[i] ? APTITUDES_KEYS[i + half] : null;
    rows += cell(left[i], keyL) + '<div class="aptitude-col-sep"></div>' + cell(right[i], keyR);
  }
  grid.innerHTML = rows;
}

function changeApt(frKey, delta) {
  const nv = Math.max(0, (state.aptitudes[frKey] || 0) + delta);
  state.aptitudes[frKey] = nv;
  const el = document.getElementById(`apt-${frKey.replace(/\s/g, '_')}`);
  if (el) { el.textContent = nv; el.className = `apt-val ${nv === 0 ? 'zero' : ''}`; }
  updateAptPtsDisplay();
  updatePreview();
}

function updateAptPtsDisplay() {
  const used = calcAptPts(state);    // game-system.js
  const max  = maxAptPts(state);     // game-system.js
  const el   = document.getElementById('apt-pts-display');
  el.textContent = `${used} / ${max}`;
  el.className   = `val ${used > max ? 'over' : 'ok'}`;
}

// ── Traits ────────────────────────────────────────────────────
function renderTraits() {
  document.getElementById('traits-list').innerHTML = (state.traits || []).map((tr, i) => `
    <div class="trait-row">
      <input class="trait-name" type="text"
        placeholder="${t('editor_trait_name_ph')}"
        value="${esc(tr.name || '')}"
        oninput="state.traits[${i}].name=this.value;updatePreview()">
      <div class="trait-bonus">
        <button style="width:22px;height:22px;border-radius:3px;background:var(--bg4);
          border:1px solid var(--border);color:var(--text2);cursor:pointer;font-size:13px;
          display:flex;align-items:center;justify-content:center"
          onclick="changeTrait(${i}, -1)">−</button>
        <div class="trait-bonus-val">+${tr.bonus || 1}</div>
        <button style="width:22px;height:22px;border-radius:3px;background:var(--bg4);
          border:1px solid var(--border);color:var(--text2);cursor:pointer;font-size:13px;
          display:flex;align-items:center;justify-content:center"
          onclick="changeTrait(${i}, 1)">+</button>
        <span style="font-size:10px;color:var(--text3);margin-left:2px">
          ${tr.bonus || 1} pt${(tr.bonus || 1) > 1 ? 's' : ''}
        </span>
      </div>
      <button class="rm-btn" onclick="removeTrait(${i})">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="3" y1="3" x2="13" y2="13"/>
          <line x1="13" y1="3" x2="3" y2="13"/>
        </svg>
      </button>
    </div>`).join('');
}

function addTrait() {
  state.traits.push({ name: '', bonus: 1 });
  renderTraits();
  updateAptPtsDisplay();
  updatePreview();
}
function removeTrait(i) {
  state.traits.splice(i, 1);
  renderTraits();
  updateAptPtsDisplay();
  updatePreview();
}
function changeTrait(i, delta) {
  state.traits[i].bonus = Math.max(1, (state.traits[i].bonus || 1) + delta);
  renderTraits();
  updateAptPtsDisplay();
  updatePreview();
}

// ── Expérience ────────────────────────────────────────────────
function changeXP(type, delta) {
  const key  = type === 'hero' ? 'xp_hero' : 'xp_apt';
  const elId = type === 'hero' ? 'xp-hero-val' : 'xp-apt-val';
  state[key] = Math.max(0, (state[key] || 0) + delta);
  document.getElementById(elId).textContent = state[key];
  if (type === 'hero') updatePtsDisplay();
  else updateAptPtsDisplay();
  updatePreview();
}

// ── Complications ─────────────────────────────────────────────
function renderComplications() {
  document.getElementById('complications-list').innerHTML = (state.complications || []).map((c, i) => {
    const label  = typeof c === 'object' ? (c.label  || '') : c;
    const detail = typeof c === 'object' ? (c.detail || '') : '';
    return `<div class="compl-entry">
      <div class="compl-entry-header">
        <input type="text"
          placeholder="${t('editor_complication_name_ph')}"
          value="${esc(label)}"
          oninput="setComplLabel(${i}, this.value)">
        <button class="rm-btn" onclick="removeComplication(${i})">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="3" y1="3" x2="13" y2="13"/>
            <line x1="13" y1="3" x2="3" y2="13"/>
          </svg>
        </button>
      </div>
      <textarea
        placeholder="${t('editor_complication_detail_ph')}"
        oninput="setComplDetail(${i}, this.value)">${esc(detail)}</textarea>
    </div>`;
  }).join('');
  document.getElementById('add-compl-btn').style.display =
    (state.complications || []).length >= 5 ? 'none' : 'block';
}

function setComplLabel(i, val) {
  if (typeof state.complications[i] !== 'object')
    state.complications[i] = { label: '', detail: '' };
  state.complications[i].label = val;
  updatePreview();
}
function setComplDetail(i, val) {
  if (typeof state.complications[i] !== 'object')
    state.complications[i] = { label: '', detail: '' };
  state.complications[i].detail = val;
  updatePreview();
}
function addComplication() {
  if ((state.complications || []).length >= 5) return;
  state.complications.push({ label: '', detail: '' });
  renderComplications();
}
function removeComplication(i) {
  state.complications.splice(i, 1);
  renderComplications();
  updatePreview();
}

// ── Preview ───────────────────────────────────────────────────
function updatePreview() {
  // Synchronise l'état depuis les champs
  state.name       = document.getElementById('f-name').value;
  state.subtitle   = document.getElementById('f-sub').value;
  state.rank       = parseInt(document.getElementById('f-rank').value);
  state.maturity   = document.getElementById('f-maturity').value;
  state.background = document.getElementById('f-background')?.value || state.background || '';

  const pubCb = document.getElementById('f-public');
  if (pubCb) {
    state.is_public = pubCb.checked;
    document.getElementById('public-label').textContent =
      pubCb.checked ? t('share_code_active') : t('share_code_inactive');
  }
  _updateShareCodeBox();
  updateAptPtsDisplay();

  // Délègue le rendu HTML à game-system.js
  document.getElementById('preview-content').innerHTML = renderCharSheet(state);
}

// ── Save / Share ──────────────────────────────────────────────
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

// ── Mobile tabs ───────────────────────────────────────────────
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
