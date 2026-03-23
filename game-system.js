// ══════════════════════════════════════════════════════════════
// GAME SYSTEM — Fichier à personnaliser pour chaque jeu de rôle
//
// Ce fichier est le SEUL fichier métier à remplacer pour adapter
// le template à un nouveau système de jeu.
//
// Contrat : les fonctions et constantes exportées ci-dessous
// DOIVENT toutes être présentes et respecter leur signature.
// Le reste du template (chroniques, documents, campagnes, auth...)
// n'y touche pas.
// ══════════════════════════════════════════════════════════════


// ── 1. IDENTITÉ DU JEU ────────────────────────────────────────
// Utilisé dans le <title>, le manifest, le logo topbar.

const GAME_NAME       = 'Energy System';
const GAME_SUBTITLE   = 'Gestionnaire de campagne'; // affiché sous le logo


// ── 2. ÉTAT INITIAL D'UN PERSONNAGE ──────────────────────────
// Retourne un objet "vide" représentant un nouveau personnage.
// Toutes les clés ici seront stockées en base dans la colonne `data` (JSONB).

function freshState() {
  return {
    name:                 '',
    subtitle:             '',
    rank:                 5,
    maturity:             'adulte',
    energy:               1,
    recovery:             1,
    vigor:                1,
    is_public:            false,
    illustration_url:     '',
    illustration_position: 0,
    xp_hero:              0,
    xp_apt:               0,
    tags:                 [],
    powers:               [],
    aptitudes:            {},
    traits:               [],
    complications:        [],
    background:           '',
  };
}


// ── 3. CONSTANTES DE RÈGLES ───────────────────────────────────

// Points de héros disponibles par rang (index = rang, 0 inutilisé)
const RANK_PTS = [0, 9, 17, 24, 32, 39, 47, 54, 62, 69, 77, 84];

// Points d'aptitudes disponibles par niveau de maturité
const MATURITY_PTS = { adolescent: 12, adulte: 16, veteran: 20 };


// ── 4. LISTES DYNAMIQUES (dépendent de la langue active) ─────
// Ces fonctions sont appelées après que i18n est initialisé.

// Types de pouvoirs disponibles dans le formulaire
function POWER_TYPES() {
  return [
    { value: 'offc', label: t('power_type_offc'), desc: t('power_type_offc_desc') },
    { value: 'offd', label: t('power_type_offd'), desc: t('power_type_offd_desc') },
    { value: 'def',  label: t('power_type_def'),  desc: t('power_type_def_desc')  },
    { value: 'mov',  label: t('power_type_mov'),  desc: t('power_type_mov_desc')  },
    { value: 'sup',  label: t('power_type_sup'),  desc: t('power_type_sup_desc')  },
  ];
}

// Modificateurs de pouvoir
function MOD_OPTIONS() {
  return [
    { value: '0',  label: t('mod_none'), cost: 3 },
    { value: '+1', label: '+1',          cost: 5 },
    { value: '+2', label: '+2',          cost: 7 },
    { value: '-1', label: '−1',          cost: 2 },
    { value: '-2', label: '−2',          cost: 1 },
  ];
}

// Noms des aptitudes affichés dans l'UI (traduits)
function APTITUDES() {
  return [
    t('aptitude_art'),              t('aptitude_athletisme'),
    t('aptitude_bagout'),           t('aptitude_filouterie'),
    t('aptitude_medecine'),         t('aptitude_nature'),
    t('aptitude_occultisme'),       t('aptitude_sciences_exactes'),
    t('aptitude_sciences_humaines'),t('aptitude_technologie'),
    t('aptitude_vehicules'),        t('aptitude_vigilance'),
  ];
}

// Clés stables en français pour la persistance en base de données.
// ⚠️ NE PAS MODIFIER ces clés une fois des personnages créés,
// elles sont stockées dans la colonne `data` JSONB.
const APTITUDES_KEYS = [
  'Art', 'Athlétisme', 'Bagout', 'Filouterie',
  'Médecine', 'Nature', 'Occultisme', 'Sciences exactes',
  'Sciences humaines', 'Technologie', 'Véhicules', 'Vigilance',
];


// ── 5. CALCUL DES POINTS ──────────────────────────────────────

// Coût en points de héros des attributs
function calcAttrCost(state) {
  return (state.energy * 2) + (state.recovery * 3) + state.vigor;
}

// Coût d'un pouvoir individuel
function powerCost(p) {
  const m = { '+1': 2, '+2': 4, '-1': -1, '-2': -2 };
  return Math.max(1, 3 + (m[p.mod] || 0));
}

// Coût total de tous les pouvoirs
function calcPowersCost(state) {
  return (state.powers || []).reduce((s, p) => s + powerCost(p), 0);
}

// Coût total du personnage (attributs + pouvoirs)
function totalCost(state) {
  return calcAttrCost(state) + calcPowersCost(state);
}

// Budget max en points de héros selon le rang + XP
function maxPts(state) {
  return (RANK_PTS[Math.min(state.rank, 11)] || 39) + (state.xp_hero || 0);
}

// Coût total en points d'aptitudes (aptitudes + traits)
function calcAptPts(state) {
  return Object.values(state.aptitudes || {}).reduce((s, v) => s + v, 0)
       + (state.traits || []).reduce((s, tr) => s + (tr.bonus || 1), 0);
}

// Budget max en points d'aptitudes selon la maturité + XP
function maxAptPts(state) {
  return (MATURITY_PTS[state.maturity || 'adulte'] || 16) + (state.xp_apt || 0);
}


// ── 6. RENDU CARTE ROSTER ─────────────────────────────────────
// Retourne le HTML interne de la carte personnage dans la liste.
// Appelé par cardHTML() dans scripts.js.
// Paramètre : `c` = objet personnage complet.

function renderCharCardBody(c) {
  const pwrTags = (c.powers || []).map(p => {
    const pt = POWER_TYPES().find(x => x.value === p.type);
    const style = POWER_TYPE_STYLES[p.type] || '';
    return `<span class="card-power-tag" style="${style}">${pt?.label || p.type}</span>`;
  }).join('');

  return `
    <div class="card-name">${esc(c.name) || '—'}</div>
    <div class="card-sub">${esc(c.subtitle) || ''}</div>
    <div class="card-rank">${t('card_rank')}${c.rank}</div>
    <div class="card-attrs">
      <div class="card-attr e">
        <div class="val">${c.energy || 1}</div>
        <div class="lbl">${t('card_attr_energy')}</div>
      </div>
      <div class="card-attr r">
        <div class="val">${c.recovery || 1}</div>
        <div class="lbl">${t('card_attr_recovery')}</div>
      </div>
      <div class="card-attr v">
        <div class="val">${c.vigor || 1}</div>
        <div class="lbl">${t('card_attr_vigor')}</div>
      </div>
    </div>
    <div class="card-powers">${pwrTags}</div>
  `;
}

// Styles CSS inline pour les badges de type de pouvoir sur les cartes
const POWER_TYPE_STYLES = {
  offc: 'background:rgba(224,92,92,0.15);color:#e05c5c;',
  offd: 'background:rgba(224,122,58,0.15);color:#e07a3a;',
  def:  'background:rgba(92,155,224,0.15);color:#5c9be0;',
  mov:  'background:rgba(92,191,122,0.15);color:#5cbf7a;',
  sup:  'background:rgba(155,125,232,0.15);color:#9b7de8;',
};


// ── 7. RENDU PREVIEW / VUE PARTAGÉE ──────────────────────────
// Retourne le HTML complet du personnage pour la preview éditeur
// et la vue lecture seule (showSharedChar).
// Paramètre : `data` = objet personnage complet.

function renderCharSheet(data) {
  const used    = totalCost(data);
  const max     = maxPts(data);
  const ptColor = used > max ? 'var(--offc)' : used === max ? 'var(--accent)' : 'var(--mov)';

  const powHtml = (data.powers || []).filter(p => p.name).map(p => {
    const pt     = POWER_TYPES().find(x => x.value === p.type);
    const modTag = p.mod && p.mod !== '0'
      ? `<span class="pow-mod-tag">${p.mod}</span>` : '';
    return `<div class="preview-power">
      <span class="pow-badge ${p.type}">${pt?.label || p.type}</span>
      <div class="pow-body">
        <div class="pow-name">${esc(p.name)}${modTag}</div>
        ${p.desc ? `<div class="pow-desc">${esc(p.desc)}</div>` : ''}
      </div>
      <div class="pow-cost">${powerCost(p)} pts</div>
    </div>`;
  }).join('');

  const aptEntries = Object.entries(data.aptitudes || {}).filter(([, v]) => v > 0);
  const aptUsed    = calcAptPts(data);
  const aptMax     = maxAptPts(data);
  const aptColor   = aptUsed > aptMax ? 'var(--offc)' : aptUsed === aptMax ? 'var(--accent)' : 'var(--mov)';

  const aptHtml = aptEntries.length ? `
    <div class="preview-section-title">
      ${t('preview_section_aptitudes')}
      <span style="color:${aptColor};font-family:var(--font-mono);font-size:10px;margin-left:4px">
        ${aptUsed} / ${aptMax} pts
      </span>
    </div>
    <div class="apt-preview-grid">
      ${aptEntries.map(([frKey, val]) => {
        const idx   = APTITUDES_KEYS.indexOf(frKey);
        const label = idx >= 0 ? APTITUDES()[idx] : frKey;
        return `<div class="apt-preview-row">
          <span class="name">${label}</span>
          <span class="rank-num">${val}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  const traitsHtml = (data.traits || []).filter(tr => tr.name).length ? `
    <div class="preview-section-title">${t('preview_section_traits')}</div>
    <div class="trait-preview">
      ${(data.traits || []).filter(tr => tr.name).map(tr =>
        `<div class="trait-chip">${esc(tr.name)}<span class="bonus">+${tr.bonus}</span></div>`
      ).join('')}
    </div>` : '';

  const complList = (data.complications || []).filter(c => typeof c === 'object' ? c.label : c);
  const complHtml = complList.length ? `
    <div class="preview-section-title">${t('preview_section_complications')}</div>
    <div class="compl-preview">
      ${complList.map(c => {
        const label  = typeof c === 'object' ? c.label  : c;
        const detail = typeof c === 'object' ? c.detail : '';
        return `<div class="compl-chip">
          ${esc(label)}
          ${detail ? `<div class="compl-detail">${esc(detail)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>` : '';

  const bgHtml = data.background ? `
    <div class="preview-section-title">${t('preview_section_background')}</div>
    <div class="background-preview">${esc(data.background)}</div>` : '';

  return `
    ${data.illustration_url
      ? `<img class="preview-illus"
           src="${esc(data.illustration_url)}"
           style="object-position:center ${data.illustration_position || 0}%"
           onclick="openLightbox('${esc(data.illustration_url)}')" alt="">`
      : ''}
    <div class="preview-header">
      <div class="preview-name">${esc(data.name) || '—'}</div>
      ${data.subtitle ? `<div class="preview-sub">${esc(data.subtitle)}</div>` : ''}
      <div class="preview-rank-badge">${t('rank_label')}${data.rank}</div>
    </div>

    <div class="preview-section-title">
      ${t('preview_section_attrs')}
      <span style="color:${ptColor};font-family:var(--font-mono);font-size:10px;margin-left:4px">
        ${used} / ${max} pts
      </span>
    </div>
    <div class="preview-attrs">
      <div class="preview-attr e">
        <div class="val">${data.energy}</div>
        <div class="lbl">${t('preview_attr_energy')}</div>
        <div class="cost">${data.energy * 2} ${t('preview_attr_cost_energy')}</div>
        <div class="pips">${pipRow(data.energy, 'e', 10)}</div>
      </div>
      <div class="preview-attr r">
        <div class="val">${data.recovery}</div>
        <div class="lbl">${t('preview_attr_recovery')}</div>
        <div class="cost">${data.recovery * 3} ${t('preview_attr_cost_recovery')}</div>
        <div class="pips">${pipRow(data.recovery, 'r', 10)}</div>
      </div>
      <div class="preview-attr v">
        <div class="val">${data.vigor}</div>
        <div class="lbl">${t('preview_attr_vigor')}</div>
        <div class="cost">${data.vigor} ${t('preview_attr_cost_vigor')}</div>
        <div class="pips">${pipRow(data.vigor, 'v', 10)}</div>
      </div>
    </div>

    ${(data.powers || []).filter(p => p.name).length
      ? `<div class="preview-section-title">${t('preview_section_powers')}</div>${powHtml}`
      : ''}
    ${aptHtml}${traitsHtml}${complHtml}${bgHtml}
  `;
}


// ── 8. CLÉS i18n SPÉCIFIQUES AU JEU ──────────────────────────
// Ces entrées s'ajoutent aux clés génériques de i18n.js.
// Elles sont mergées au chargement dans TRANSLATIONS.

const GAME_I18N = {
  fr: {
    // Rangs
    rank_1:  'Rang 1 — Civils (9 pts)',
    rank_2:  'Rang 2 — Flics & Voyous (17 pts)',
    rank_3:  'Rang 3 — Agents spéciaux (24 pts)',
    rank_4:  'Rang 4 — Supers mineurs (32 pts)',
    rank_5:  'Rang 5 — Supers débutants (39 pts)',
    rank_6:  'Rang 6 — Supers compétents (47 pts)',
    rank_7:  'Rang 7 — Supers reconnus (54 pts)',
    rank_8:  'Rang 8 — Supers puissants (62 pts)',
    rank_9:  'Rang 9 — Supers majeurs (69 pts)',
    rank_10: 'Rang 10 — Plus puissants sur Terre (77 pts)',
    rank_11: 'Rang 11+ — Cosmiques (84+ pts)',
    rank_label: 'Rang ',

    // Maturités
    maturity_adolescent: 'Adolescent (12 pts d\'aptitudes)',
    maturity_adulte:     'Adulte (16 pts d\'aptitudes)',
    maturity_veteran:    'Vétéran (20 pts d\'aptitudes)',

    // Types de pouvoir
    power_type_offc:      'Off-C',
    power_type_offd:      'Off-D',
    power_type_def:       'Def',
    power_type_mov:       'Mov',
    power_type_sup:       'Sup',
    power_type_offc_desc: 'Offensif contact',
    power_type_offd_desc: 'Offensif distance',
    power_type_def_desc:  'Défensif',
    power_type_mov_desc:  'Mouvement',
    power_type_sup_desc:  'Support',

    // Modificateurs
    mod_none: 'Aucun',

    // Aptitudes
    aptitude_art:              'Art',
    aptitude_athletisme:       'Athlétisme',
    aptitude_bagout:           'Bagout',
    aptitude_filouterie:       'Filouterie',
    aptitude_medecine:         'Médecine',
    aptitude_nature:           'Nature',
    aptitude_occultisme:       'Occultisme',
    aptitude_sciences_exactes: 'Sciences exactes',
    aptitude_sciences_humaines:'Sciences humaines',
    aptitude_technologie:      'Technologie',
    aptitude_vehicules:        'Véhicules',
    aptitude_vigilance:        'Vigilance',

    // Attributs dans la preview
    preview_attr_energy:       'Énergie',
    preview_attr_recovery:     'Récupération',
    preview_attr_vigor:        'Vigueur',
    preview_attr_cost_energy:  'pts de héros',
    preview_attr_cost_recovery:'pts de héros',
    preview_attr_cost_vigor:   'pts de héros',

    // Sections preview
    preview_section_attrs:        'Attributs',
    preview_section_powers:       'Pouvoirs',
    preview_section_aptitudes:    'Aptitudes',
    preview_section_traits:       'Traits',
    preview_section_complications:'Complications',
    preview_section_background:   'Background',

    // Carte roster
    card_rank:          'Rang ',
    card_attr_energy:   'Énergie',
    card_attr_recovery: 'Récup.',
    card_attr_vigor:    'Vigueur',

    // Éditeur — sections
    editor_section_attrs:         'Attributs',
    editor_attr_energy:           'Énergie',
    editor_attr_energy_cost:      '(2 pts/+1)',
    editor_attr_recovery:         'Récupération',
    editor_attr_recovery_cost:    '(3 pts/+1)',
    editor_attr_vigor:            'Vigueur',
    editor_attr_vigor_cost:       '(1 pt/+1)',
    editor_pts_hero:              'Points de héros',
    editor_section_powers:        'Pouvoirs',
    editor_power_name_ph:         'Nom du pouvoir',
    editor_power_desc_ph:         'Description courte (optionnelle)',
    editor_add_power:             '+ Ajouter un pouvoir',
    editor_section_aptitudes:     'Aptitudes',
    editor_pts_aptitudes:         'Points d\'aptitudes',
    editor_section_traits:        'Traits',
    editor_trait_name_ph:         'Nom du trait',
    editor_add_trait:             '+ Ajouter un trait',
    editor_section_complications: 'Complications',
    editor_complications_max:     '(max 5)',
    editor_complication_name_ph:  'Nom de la complication',
    editor_complication_detail_ph:'Détails (optionnel)',
    editor_add_complication:      '+ Ajouter une complication',
    editor_section_background:    'Background',
    editor_background_ph:         'Histoire du personnage, origines, motivations…',
    editor_section_xp:            'Expérience',
    editor_xp_hero_label:         'Pts de héros bonus',
    editor_xp_hero_detail:        'S\'ajoutent au budget du rang',
    editor_xp_apt_label:          'Pts d\'aptitudes bonus',
    editor_xp_apt_detail:         'S\'ajoutent au budget de maturité',
    editor_field_rank:            'Rang de puissance initial',
    editor_field_maturity:        'Maturité initiale',

    // Alertes
    alert_char_no_name: 'Veuillez donner un nom au personnage.',
  },
  en: {
    // Ranks
    rank_1:  'Rank 1 — Civilians (9 pts)',
    rank_2:  'Rank 2 — Cops & Thugs (17 pts)',
    rank_3:  'Rank 3 — Special Agents (24 pts)',
    rank_4:  'Rank 4 — Minor Supers (32 pts)',
    rank_5:  'Rank 5 — Rookie Supers (39 pts)',
    rank_6:  'Rank 6 — Capable Supers (47 pts)',
    rank_7:  'Rank 7 — Renowned Supers (54 pts)',
    rank_8:  'Rank 8 — Powerful Supers (62 pts)',
    rank_9:  'Rank 9 — Major Supers (69 pts)',
    rank_10: 'Rank 10 — Earth\'s Mightiest (77 pts)',
    rank_11: 'Rank 11+ — Cosmic (84+ pts)',
    rank_label: 'Rank ',

    // Maturities
    maturity_adolescent: 'Teenager (12 aptitude pts)',
    maturity_adulte:     'Adult (16 aptitude pts)',
    maturity_veteran:    'Veteran (20 aptitude pts)',

    // Power types
    power_type_offc:      'Off-C',
    power_type_offd:      'Off-D',
    power_type_def:       'Def',
    power_type_mov:       'Mov',
    power_type_sup:       'Sup',
    power_type_offc_desc: 'Melee offensive',
    power_type_offd_desc: 'Ranged offensive',
    power_type_def_desc:  'Defensive',
    power_type_mov_desc:  'Movement',
    power_type_sup_desc:  'Support',

    // Modifiers
    mod_none: 'None',

    // Aptitudes
    aptitude_art:              'Art',
    aptitude_athletisme:       'Athletics',
    aptitude_bagout:           'Persuasion',
    aptitude_filouterie:       'Trickery',
    aptitude_medecine:         'Medicine',
    aptitude_nature:           'Nature',
    aptitude_occultisme:       'Occultism',
    aptitude_sciences_exactes: 'Hard Sciences',
    aptitude_sciences_humaines:'Social Sciences',
    aptitude_technologie:      'Technology',
    aptitude_vehicules:        'Vehicles',
    aptitude_vigilance:        'Vigilance',

    // Attributes in preview
    preview_attr_energy:       'Energy',
    preview_attr_recovery:     'Recovery',
    preview_attr_vigor:        'Toughness',
    preview_attr_cost_energy:  'hero pts',
    preview_attr_cost_recovery:'hero pts',
    preview_attr_cost_vigor:   'hero pts',

    // Preview sections
    preview_section_attrs:        'Attributes',
    preview_section_powers:       'Powers',
    preview_section_aptitudes:    'Skills',
    preview_section_traits:       'Traits',
    preview_section_complications:'Complications',
    preview_section_background:   'Background',

    // Roster card
    card_rank:          'Rank ',
    card_attr_energy:   'Energy',
    card_attr_recovery: 'Recov.',
    card_attr_vigor:    'Vigor',

    // Editor sections
    editor_section_attrs:         'Attributes',
    editor_attr_energy:           'Energy',
    editor_attr_energy_cost:      '(2 pts/+1)',
    editor_attr_recovery:         'Recovery',
    editor_attr_recovery_cost:    '(3 pts/+1)',
    editor_attr_vigor:            'Vigor',
    editor_attr_vigor_cost:       '(1 pt/+1)',
    editor_pts_hero:              'Hero points',
    editor_section_powers:        'Powers',
    editor_power_name_ph:         'Power name',
    editor_power_desc_ph:         'Short description (optional)',
    editor_add_power:             '+ Add a power',
    editor_section_aptitudes:     'Aptitudes',
    editor_pts_aptitudes:         'Aptitude points',
    editor_section_traits:        'Traits',
    editor_trait_name_ph:         'Trait name',
    editor_add_trait:             '+ Add a trait',
    editor_section_complications: 'Complications',
    editor_complications_max:     '(max 5)',
    editor_complication_name_ph:  'Complication name',
    editor_complication_detail_ph:'Details (optional)',
    editor_add_complication:      '+ Add a complication',
    editor_section_background:    'Background',
    editor_background_ph:         'Character history, origins, motivations…',
    editor_section_xp:            'Experience',
    editor_xp_hero_label:         'Bonus hero pts',
    editor_xp_hero_detail:        'Added to rank budget',
    editor_xp_apt_label:          'Bonus aptitude pts',
    editor_xp_apt_detail:         'Added to maturity budget',
    editor_field_rank:            'Starting power rank',
    editor_field_maturity:        'Starting maturity',

    // Alerts
    alert_char_no_name: 'Please give the character a name.',
  },
};

// ── Merge automatique dans TRANSLATIONS au chargement ─────────
// (ce bloc s'exécute après i18n.js)
Object.keys(GAME_I18N).forEach(lang => {
  if (TRANSLATIONS[lang]) {
    Object.assign(TRANSLATIONS[lang], GAME_I18N[lang]);
  }
});
