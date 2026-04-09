// ══════════════════════════════════════════════════════════════
// Camply TTRPG Manager — Système générique
// Remplacez ce fichier par votre propre game-system.js.
//
// Contrat : les fonctions et constantes exportées ci-dessous
// DOIVENT toutes être présentes et respecter leur signature.
// ══════════════════════════════════════════════════════════════


// ── 1. IDENTITÉ DU JEU ────────────────────────────────────────

const GAME_NAME     = 'Generic RPG';
const GAME_SUBTITLE = 'Gestionnaire de campagne';


// ── 2. ÉTAT INITIAL D'UN PERSONNAGE ──────────────────────────

function freshState() {
  return {
    name:                  '',
    subtitle:              '',      // titre / occupation
    race_class:            '',      // race / classe
    level:                 0,       // 0 = pas de niveau affiché
    is_public:             false,
    illustration_url:      '',
    illustration_position: 0,
    tags:                  [],
    characteristics:       [],     // [{ id, name, trigram, score }]
    skills:                [],     // [{ id, name, score }]
    traits:                [],     // [{ id, name, score, detail }]
    description:           '',
    background:            '',
  };
}


// ── 3. HELPERS INTERNES ───────────────────────────────────────

function _uid() {
  return Math.random().toString(36).slice(2, 10);
}

function _clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}


// ══════════════════════════════════════════════════════════════
// 4. RENDU CARTE ROSTER
// ══════════════════════════════════════════════════════════════

function renderCharCardBody(c) {
  // Race/classe + niveau (niveau masqué si 0)
  const rcTag = c.race_class
    ? `<span class="card-rc-tag">${esc(c.race_class)}</span>` : '';
  const lvlTag = c.level !== undefined && c.level !== 0 && c.level !== null
    ? `<span class="card-rank">${t('card_level')}${c.level}</span>` : '';

  // Extrait de la description (tronqué)
  const rawDescription = String(c.description || '').replace(/\s+/g, ' ').trim();
  const maxDescriptionLength = 180;
  const descriptionExcerpt = rawDescription
    ? rawDescription.slice(0, maxDescriptionLength).trimEnd() + (rawDescription.length > maxDescriptionLength ? '…' : '')
    : '';
  const descriptionHtml = descriptionExcerpt
    ? `<div class="card-desc">${esc(descriptionExcerpt)}</div>`
    : '';

  return `
    <div class="card-name">${esc(c.name) || '—'}</div>
    ${c.subtitle ? `<div class="card-sub">${esc(c.subtitle)}</div>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${rcTag}${lvlTag}
    </div>
    ${descriptionHtml}
  `;
}


// ══════════════════════════════════════════════════════════════
// 5. RENDU FICHE COMPLÈTE (preview éditeur + vue partagée)
// ══════════════════════════════════════════════════════════════

function renderCharSheet(data) {

  // ── Illustration ──────────────────────────────────────────
  const illusHtml = data.illustration_url
    ? `<img class="preview-illus"
         src="${esc(data.illustration_url)}"
         style="object-position:center ${data.illustration_position || 0}%"
         onclick="openLightbox('${esc(data.illustration_url)}')" alt="">` : '';

  // ── En-tête ───────────────────────────────────────────────
  const rcTag = data.race_class
    ? `<span class="card-rc-tag" style="margin-top:8px">${esc(data.race_class)}</span>` : '';

  // Niveau masqué si 0 ou null
  const lvlBadge = data.level !== undefined && data.level !== 0 && data.level !== null
    ? `<div class="preview-rank-badge">${t('card_level')}${data.level ?? 0}</div>` : '';

  const headerHtml = `
    <div class="preview-header">
      <div class="preview-name">${esc(data.name) || '—'}</div>
      ${data.subtitle ? `<div class="preview-sub">${esc(data.subtitle)}</div>` : ''}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
        ${rcTag}
        ${lvlBadge}
      </div>
    </div>`;

  // ── Caractéristiques (toutes, sans limite) ─────────────────
  const chars = data.characteristics || [];
  const charsHtml = chars.length ? `
    <div class="preview-section-title">${t('section_characteristics')}</div>
    <div class="preview-attrs">
      ${chars.map(ch => `
        <div class="preview-attr" style="border-left:3px solid var(--accent)">
          <div class="val" style="color:var(--accent);font-size:26px">${ch.score ?? 0}</div>
          <div class="lbl">${esc(ch.trigram || '???')}</div>
          <div class="cost" style="font-size:11px;color:var(--text2);margin-top:2px">${esc(ch.name)}</div>
        </div>`).join('')}
    </div>` : '';

  // ── Compétences ───────────────────────────────────────────
  const skills = data.skills || [];
  const skillsHtml = skills.length ? `
    <div class="preview-section-title">${t('section_skills')}</div>
    <div class="apt-preview-grid">
      ${skills.map(sk => `
        <div class="apt-preview-row">
          <span class="name">${esc(sk.name)}</span>
          <span class="rank-num">${sk.score ?? 0}</span>
        </div>`).join('')}
    </div>` : '';

  // ── Traits (sans type, juste nom + score + description) ───
  const traits = data.traits || [];
  const traitsHtml = traits.length ? `
    <div class="preview-section-title">${t('section_traits')}</div>
    <div class="compl-preview">
      ${traits.map(tr => `
        <div class="compl-chip">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>${esc(tr.name)}</span>
            ${tr.score !== '' && tr.score !== undefined && tr.score !== null
              ? `<span style="font-family:var(--font-mono);font-size:12px;color:var(--accent);font-weight:700">${tr.score}</span>`
              : ''}
          </div>
          ${tr.detail ? `<div class="compl-detail">${esc(tr.detail)}</div>` : ''}
        </div>`).join('')}
    </div>` : '';

  // ── Description ───────────────────────────────────────────
  const descriptionHtml = data.description ? `
    <div class="preview-section-title">${t('section_description')}</div>
    <div class="background-preview">${esc(data.description)}</div>` : '';

  // ── Background ────────────────────────────────────────────
  const bgHtml = data.background ? `
    <div class="preview-section-title">${t('section_background')}</div>
    <div class="background-preview">${esc(data.background)}</div>` : '';

  return `${illusHtml}${headerHtml}${charsHtml}${skillsHtml}${traitsHtml}${descriptionHtml}${bgHtml}`;
}


// ══════════════════════════════════════════════════════════════
// 6. TRADUCTIONS (clés spécifiques au jeu)
// ══════════════════════════════════════════════════════════════

const GAME_I18N = {
  fr: {
    // Identité
    editor_field_subtitle:     'Titre / Occupation',
    editor_field_subtitle_ph:  'Ex : Guerrier, Mage, Voleur…',
    editor_field_race_class:   'Race / Classe',
    editor_field_race_class_ph:'Ex : Elfe Rôdeur, Humain Paladin…',
    editor_field_level:        'Niveau',

    // Carte roster
    card_level: 'Niv. ',

    // Sections fiche
    section_characteristics: 'Caractéristiques',
    section_skills:          'Compétences',
    section_traits:          'Traits',
    section_description:     'Description',
    section_background:      'Background',

    // Éditeur — caractéristiques
    editor_section_characteristics:   'Caractéristiques',
    editor_char_name_ph:              'Nom complet (ex : Force)',
    editor_char_trigram_ph:           'TRI',
    editor_char_score_label:          'Score',
    editor_char_score_hint:           'Shift+clic : ±10',
    editor_add_characteristic:        '+ Ajouter une caractéristique',

    // Éditeur — compétences
    editor_section_skills:    'Compétences',
    editor_skill_name_ph:     'Nom de la compétence',
    editor_skill_score_hint:  'Shift+clic : ±10',
    editor_add_skill:         '+ Ajouter une compétence',

    // Éditeur — traits
    editor_section_traits:    'Traits',
    editor_trait_name_ph:     'Nom du trait',
    editor_trait_detail_ph:   'Description ou détail (optionnel)',
    editor_trait_score_hint:  'Valeur (optionnel)',
    editor_add_trait:         '+ Ajouter un trait',

    // Éditeur — background
    editor_section_description: 'Description',
    editor_description_ph:      'Description du personnage, apparence, attitude…',
    
    editor_section_background: 'Background',
    editor_background_ph:      'Histoire du personnage, origines, motivations…',

    // Alertes
    alert_char_no_name:  'Veuillez donner un nom au personnage.',
    alert_trigram_3:     'Le trigramme doit faire exactement 3 lettres.',
  },

  en: {
    editor_field_subtitle:     'Title / Occupation',
    editor_field_subtitle_ph:  'E.g. Warrior, Mage, Rogue…',
    editor_field_race_class:   'Race / Class',
    editor_field_race_class_ph:'E.g. Elf Ranger, Human Paladin…',
    editor_field_level:        'Level',

    card_level: 'Lv. ',

    section_characteristics: 'Characteristics',
    section_skills:          'Skills',
    section_traits:          'Traits',
    section_description:     'Description',
    section_background:      'Background',

    editor_section_characteristics:   'Characteristics',
    editor_char_name_ph:              'Full name (e.g. Strength)',
    editor_char_trigram_ph:           'TRI',
    editor_char_score_label:          'Score',
    editor_char_score_hint:           'Shift+click: ±10',
    editor_add_characteristic:        '+ Add a characteristic',

    editor_section_skills:    'Skills',
    editor_skill_name_ph:     'Skill name',
    editor_skill_score_hint:  'Shift+click: ±10',
    editor_add_skill:         '+ Add a skill',

    editor_section_traits:    'Traits',
    editor_trait_name_ph:     'Trait name',
    editor_trait_detail_ph:   'Description or detail (optional)',
    editor_trait_score_hint:  'Value (optional)',
    editor_add_trait:         '+ Add a trait',

    editor_section_description: 'Description',
    editor_description_ph:      'Character description, appearance, attitude…',

    editor_section_background: 'Background',
    editor_background_ph:      'Character history, origins, motivations…',

    alert_char_no_name:  'Please give the character a name.',
    alert_trigram_3:     'Trigram must be exactly 3 letters.',
  },
};

Object.keys(GAME_I18N).forEach(lang => {
  if (TRANSLATIONS[lang]) Object.assign(TRANSLATIONS[lang], GAME_I18N[lang]);
});
