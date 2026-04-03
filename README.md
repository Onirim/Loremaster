# Camply - a Lite TTRPG Campaign Manager

Template de site de gestion de campagne pour jeux de rôle sur table.  
Stack : HTML/CSS/JS vanilla + Supabase + GitHub Pages.

## Ce que le template gère (ne pas modifier)

- Auth Discord via Supabase
- Chroniques (récits de campagne avec entrées Markdown)
- Documents (documents Markdown partageables)
- Campagnes (collections regroupant personnages + chroniques + documents)
- Système de partage par code à 8 caractères
- Abonnement aux contenus d'autres joueurs
- Transferts de propriété des objets
- Tags et filtres
- Upload d'illustrations
- i18n FR/EN
- PWA (service worker, manifest)


## A adapter pour chaque jeu

- `game-system.js`
- `editor.js`

---

## Setup d'un nouveau projet

### 1. Créer le repo GitHub

- Cliquer sur **"Use this template"** sur GitHub
- Donner un nom au repo (ex: `mon-jeu-campaign-manager`)
- Activer GitHub Pages sur la branche `main` (Settings > Pages)

### 2. Créer l'application d'Auth Discord
- Dans OAuth2 récupérer l'identification du client et la clé secrète
- Dans Redictions insérer l'URL de Callback du projet Supabase (voir plus loin)

### 3. Créer le projet Supabase

- Nouveau projet sur [supabase.com](https://supabase.com)
- Dans SQL Editor, exécuter dans cet ordre :
  1. `sql/00_schema.sql`
  2. `sql/01_tags.sql`
  3. `sql/02_followed.sql`
  4. `sql/03_chronicles.sql`
  5. `sql/04_documents.sql`
  6. `sql/05_document_tags.sql`
  7. `sql/06_storage.sql`
  8. `sql/07_migration_campaigns.sql`
  9. `sql/08_fix_profiles-v2.sql`
  10. `sql/09_character_tag.sql`
  11. `sql/10_transfer.sql`
  12. `sql/11_transfer_auto_follow.sql`
  13. `sql/12_transfer_fix_double`
- Configurer l'auth Discord dans Authentication > Providers
- Ajouter l'URL GitHub Pages dans Authentication > URL Configuration

### 4. Remplir `supabase-client.js`

```js
const SUPABASE_URL = 'https://XXXX.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XXXX';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

### 5. Adapter `game-system.js` et `editor.js`

Ce sont les deux seuls fichier vraiment spécifiques au jeu. Voir la section ci-dessous.

### 6. Mettre à jour le branding

Dans `index.html` :
```html
<title>Mon Jeu — Gestionnaire de campagne</title>
```

Dans `site.webmanifest` :
```json
{
  "name": "Mon Jeu",
  "short_name": "Mon Jeu",
  "start_url": "/mon-repo/"
}
```

Dans `sw.js`, changer le nom du cache :
```js
const CACHE_NAME = 'mon-jeu-v1';
```
Et mettre à jour `PRECACHE_ASSETS` avec le bon chemin `/mon-repo/`.

---

## Adapter `game-system.js`

### Fonctions obligatoires à implémenter

| Fonction / Constante | Rôle |
|---|---|
| `GAME_NAME` | Nom affiché dans le logo |
| `GAME_SUBTITLE` | Sous-titre sous le logo |
| `freshState()` | Retourne un personnage vide |
| `renderCharCardBody(c)` | HTML de la carte dans le roster |
| `renderCharSheet(data)` | HTML complet de la fiche (preview + vue partagée) |
| `GAME_I18N` | Traductions FR/EN spécifiques au jeu |

### Fonctions utilitaires fournies (à garder ou adapter)

| Fonction | Rôle |
|---|---|
| `totalCost(state)` | Coût total du personnage |
| `maxPts(state)` | Budget max en points |
| `calcAptPts(state)` | Points d'aptitudes utilisés |
| `maxAptPts(state)` | Budget max en aptitudes |
| `powerCost(p)` | Coût d'un pouvoir |

### Exemple minimal pour un jeu simple (sans pouvoirs)

```js
const GAME_NAME     = 'Mon JDR';
const GAME_SUBTITLE = 'Gestionnaire de campagne';

function freshState() {
  return {
    name: '', subtitle: '', level: 1,
    strength: 10, dexterity: 10, intelligence: 10,
    is_public: false, illustration_url: '', illustration_position: 0,
    tags: [], background: '',
  };
}

function renderCharCardBody(c) {
  return `
    <div class="card-name">${esc(c.name) || '—'}</div>
    <div class="card-sub">${esc(c.subtitle) || ''}</div>
    <div class="card-rank">Niveau ${c.level}</div>
    <div class="card-attrs">
      <div class="card-attr e">
        <div class="val">${c.strength}</div>
        <div class="lbl">FOR</div>
      </div>
      <div class="card-attr r">
        <div class="val">${c.dexterity}</div>
        <div class="lbl">DEX</div>
      </div>
      <div class="card-attr v">
        <div class="val">${c.intelligence}</div>
        <div class="lbl">INT</div>
      </div>
    </div>
  `;
}

function renderCharSheet(data) {
  return `
    <div class="preview-header">
      <div class="preview-name">${esc(data.name) || '—'}</div>
      <div class="preview-rank-badge">Niveau ${data.level}</div>
    </div>
    <!-- ... le reste de ta fiche ... -->
  `;
}

const GAME_I18N = {
  fr: { alert_char_no_name: 'Donnez un nom au personnage.' },
  en: { alert_char_no_name: 'Please name the character.' },
};

Object.keys(GAME_I18N).forEach(lang => {
  if (TRANSLATIONS[lang]) Object.assign(TRANSLATIONS[lang], GAME_I18N[lang]);
});
```

---

## Ordre de chargement des scripts dans `index.html`

```html
<script src="i18n.js"></script>        <!-- en premier, toujours -->
<script src="supabase-client.js"></script>
<script src="game-system.js"></script> <!-- avant editor.js et scripts.js -->
<script src="chronicles.js"></script>
<script src="documents.js"></script>
<script src="campaigns.js"></script>
<script src="tags.js"></script>
<script src="editor.js"></script>
<script src="transfer.js"></script>
<script src="scripts.js"></script>     <!-- en dernier -->
```

---

## Checklist de lancement

- [ ] Repo GitHub créé depuis le template
- [ ] GitHub Pages activé
- [ ] Projet Supabase créé
- [ ] 8 fichiers SQL exécutés dans l'ordre
- [ ] Auth Discord configurée dans Supabase
- [ ] `supabase-client.js` rempli
- [ ] `game-system.js` adapté au jeu
- [ ] Branding mis à jour (`index.html`, `site.webmanifest`, `sw.js`)
- [ ] Test de connexion Discord
- [ ] Test de création d'un personnage
