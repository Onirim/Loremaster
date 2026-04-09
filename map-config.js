// ══════════════════════════════════════════════════════════════
// Camply — Configuration de la Carte
// Adaptez ce fichier selon votre projet.
// ══════════════════════════════════════════════════════════════

const MAP_CONFIG = {

  // ── Image de la carte ─────────────────────────────────────
  // Chemin relatif depuis la racine du site, ou URL absolue.
  // L'image doit être hébergée sur votre serveur (ou CDN).
  image: '/Camply/map.png',            // ← MODIFIEZ ICI

  // Dimensions natives de l'image source (en pixels)
  // Indispensable pour un positionnement précis des marqueurs.
  imageWidth:  4095,             // ← MODIFIEZ ICI
  imageHeight: 4095,             // ← MODIFIEZ ICI

  // ── Comportement du zoom ──────────────────────────────────
  zoomMin:  0.15,   // zoom minimum (vue éloignée)
  zoomMax:  4.0,    // zoom maximum (vue rapprochée)
  zoomStep: 0.15,   // incrément par clic sur les boutons +/−
  zoomInitial: 'fit', // 'fit' = ajuste à la fenêtre, ou nombre (ex: 0.5)

  // ── Apparence des marqueurs ───────────────────────────────
  markerSize: 28,          // diamètre du marqueur en px (taille visuelle fixe)
  markerColors: [
    '#e05c5c',   // rouge
    '#e07a3a',   // orange
    '#e8c46a',   // jaune
    '#5cbf7a',   // vert
    '#5c9be0',   // bleu
    '#9b7de8',   // violet
    '#e05c9b',   // rose
    '#5cbfbf',   // cyan
  ],

  // ── Textes de l'interface (i18n simple) ──────────────────
  // Ces chaînes ne passent PAS par le moteur i18n.js ;
  // dupliquez le bloc si vous souhaitez un support FR/EN.
  labels: {
    tabName:           'Carte',
    addMarkerHint:     'Maj+clic gauche pour ajouter un marqueur',
    markerModalTitle:  'Nouveau marqueur',
    editModalTitle:    'Modifier le marqueur',
    fieldName:         'Nom',
    fieldDesc:         'Description',
    fieldColor:        'Couleur',
    namePlaceholder:   'Ex : Taverne du Dragon d\'Or',
    descPlaceholder:   'Notes, description du lieu…',
    btnSave:           'Enregistrer',
    btnCancel:         'Annuler',
    btnDelete:         'Supprimer',
    confirmDelete:     'Supprimer ce marqueur ?',
    toastAdded:        'Marqueur ajouté !',
    toastSaved:        'Marqueur sauvegardé !',
    toastDeleted:      'Marqueur supprimé.',
    toastError:        'Erreur lors de la sauvegarde.',
    emptyName:         'Veuillez saisir un nom.',
    imageError:        'Impossible de charger la carte. Vérifiez map-config.js.',
  },
};
