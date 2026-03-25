// ══════════════════════════════════════════════════════════════
// Mystic Falls — Module Règles du jeu
// Charge rulebook.md depuis la racine, rend le Markdown,
// et construit un index latéral (H1 / H2 / H3) avec
// suivi de la position de lecture.
// ══════════════════════════════════════════════════════════════

let rulebookLoaded = false;

// ══════════════════════════════════════════════════════════════
// CHARGEMENT ET RENDU
// ══════════════════════════════════════════════════════════════

async function loadRulebook() {
  if (rulebookLoaded) return;

  const contentEl = document.getElementById('rulebook-body');
  const tocEl     = document.getElementById('rulebook-toc-list');

  // Affiche le spinner
  contentEl.innerHTML = `
    <div class="rulebook-loading">
      <div class="spinner"></div>
      <div style="font-family:var(--font-mono);font-size:12px;letter-spacing:0.08em">Chargement du grimoire…</div>
    </div>`;
  tocEl.innerHTML = '';

  try {
    // Récupère rulebook.md à la racine du site
    const base = window.location.pathname.replace(/\/[^/]*$/, '/');
    const res  = await fetch(base + 'rulebook.md?v=' + Date.now());

    if (!res.ok) {
      throw new Error(`Fichier introuvable (${res.status})`);
    }

    const markdown = await res.text();
    renderRulebook(markdown, contentEl, tocEl);
    rulebookLoaded = true;

  } catch (err) {
    contentEl.innerHTML = `
      <div class="rulebook-error">
        <strong>Impossible de charger les règles du jeu</strong>
        Assurez-vous que le fichier <code>rulebook.md</code> est bien présent à la racine du site.<br>
        <span style="opacity:0.7;font-size:11px;margin-top:6px;display:block">${esc(err.message)}</span>
      </div>`;
    tocEl.innerHTML = '';
  }
}

function renderRulebook(markdown, contentEl, tocEl) {
  // ── 1. Parse le Markdown avec marked ─────────────────────────
  const html = marked.parse(markdown);

  // ── 2. Inject dans un conteneur temporaire ────────────────────
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // ── 3. Collecte les titres et insère des ancres ───────────────
  const headings = [];
  const allHeadings = tmp.querySelectorAll('h1, h2, h3');

  allHeadings.forEach((el, idx) => {
    const level = parseInt(el.tagName[1]);
    const text  = el.textContent.trim();
    const id    = 'rulebook-h-' + idx + '-' + slugify(text);

    // Ajoute un attribut id sur le titre lui-même
    el.id = id;

    headings.push({ level, text, id });
  });

  // ── 4. Injecte le HTML final ──────────────────────────────────
  contentEl.innerHTML = `<div class="rulebook-body">${tmp.innerHTML}</div>`;

  // ── 5. Construit le TOC ───────────────────────────────────────
  buildTOC(headings, tocEl);

  // ── 6. Active le suivi de la position de lecture ──────────────
  initScrollSpy(headings);
}

// ══════════════════════════════════════════════════════════════
// TABLE DES MATIÈRES
// ══════════════════════════════════════════════════════════════

function buildTOC(headings, tocEl) {
  if (!headings.length) {
    tocEl.innerHTML = `<li style="padding:10px 20px;font-size:12px;color:var(--text3);font-style:italic">Aucun titre trouvé.</li>`;
    return;
  }

  const items = headings.map((h, i) => {
    // Ajoute un séparateur avant chaque H1 (sauf le premier)
    const sep = (h.level === 1 && i > 0)
      ? `<div class="rulebook-toc-separator"></div>`
      : '';

    return `${sep}<li class="rulebook-toc-item">
      <div class="rulebook-toc-link"
        data-level="${h.level}"
        data-target="${h.id}"
        onclick="rulebookScrollTo('${h.id}')"
        title="${esc(h.text)}">
        ${esc(h.text)}
      </div>
    </li>`;
  }).join('');

  tocEl.innerHTML = items;
}

function rulebookScrollTo(id) {
  const target = document.getElementById(id);
  if (!target) return;

  const contentPane = document.querySelector('.rulebook-content');
  if (!contentPane) return;

  // Calcule la position relative dans le panneau scrollable
  const paneTop    = contentPane.getBoundingClientRect().top;
  const targetTop  = target.getBoundingClientRect().top;
  const offset     = targetTop - paneTop + contentPane.scrollTop - 24;

  contentPane.scrollTo({ top: offset, behavior: 'smooth' });

  // Sur mobile : ferme le TOC après navigation
  const tocList = document.getElementById('rulebook-toc-list');
  if (tocList) tocList.classList.remove('mob-open');
  updateTocToggle(false);
}

// ══════════════════════════════════════════════════════════════
// SCROLL SPY (surlignage du titre courant dans le TOC)
// ══════════════════════════════════════════════════════════════

function initScrollSpy(headings) {
  const contentPane = document.querySelector('.rulebook-content');
  if (!contentPane || !headings.length) return;

  // Débranche un éventuel observer précédent
  if (window._rulebookObserver) {
    window._rulebookObserver.disconnect();
  }

  const MARGIN = '-10% 0px -80% 0px';

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setActiveTocLink(entry.target.id);
      }
    });
  }, {
    root: contentPane,
    rootMargin: MARGIN,
    threshold: 0,
  });

  headings.forEach(h => {
    const el = document.getElementById(h.id);
    if (el) observer.observe(el);
  });

  window._rulebookObserver = observer;
}

function setActiveTocLink(id) {
  document.querySelectorAll('.rulebook-toc-link').forEach(el => {
    el.classList.toggle('active', el.dataset.target === id);
  });
}

// ══════════════════════════════════════════════════════════════
// RECHERCHE DANS LE TOC
// ══════════════════════════════════════════════════════════════

function rulebookTocSearch(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('.rulebook-toc-link').forEach(el => {
    const text = el.textContent.trim().toLowerCase();
    el.classList.toggle('hidden', q.length > 0 && !text.includes(q));
  });
  // Cache aussi les séparateurs si tout ce qui suit est masqué
  document.querySelectorAll('.rulebook-toc-separator').forEach(sep => {
    const next = sep.nextElementSibling;
    sep.style.display = (next && next.querySelector('.rulebook-toc-link.hidden')) ? 'none' : '';
  });
}

// ══════════════════════════════════════════════════════════════
// TOGGLE MOBILE
// ══════════════════════════════════════════════════════════════

function toggleRulebookToc() {
  const list = document.getElementById('rulebook-toc-list');
  const open = list.classList.toggle('mob-open');
  updateTocToggle(open);
}

function updateTocToggle(open) {
  const btn = document.getElementById('rulebook-toc-toggle-btn');
  if (!btn) return;
  btn.innerHTML = `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
      <line x1="1" y1="4" x2="15" y2="4"/>
      <line x1="1" y1="8" x2="10" y2="8"/>
      <line x1="1" y1="12" x2="7" y2="12"/>
    </svg>
    ${open ? 'Masquer l\'index' : 'Afficher l\'index'}
  `;
}

// ══════════════════════════════════════════════════════════════
// UTILITAIRE
// ══════════════════════════════════════════════════════════════

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
