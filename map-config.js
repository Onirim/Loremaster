// ══════════════════════════════════════════════════════════════
// Camply — Configuration des Cartes (multi-cartes)
// Adaptez ce fichier selon votre projet.
// ══════════════════════════════════════════════════════════════

const MAP_CONFIG = {

  // ── Cartes disponibles (1 à 5) ────────────────────────────
  // Chaque carte a une clé unique (key), un nom affiché (name),
  // le chemin de son image et ses dimensions natives en pixels.
  //
  // ⚠️  La clé 'default' est réservée pour les données
  //     existantes migrées depuis la version mono-carte.
  //     Si vous aviez déjà des marqueurs, gardez une entrée
  //     avec key: 'default' comme première carte.
  maps: [
    {
      key:         'default',              // ← identifiant unique, ne pas changer si données existantes
      name:        'Galaxy Map',     // ← nom affiché dans le sélecteur
      image:       '/Camply/pictures/galaxy-regions-pretty.jpg',
      imageWidth:  4500,
      imageHeight: 4500,
    },
    // Décommentez et remplissez pour ajouter d'autres cartes :
    {
      key:         'city',
      name:        'Greybloom Fair',
      image:       '/Camply/pictures/greybloom_fair.png',
      imageWidth:  4372,
      imageHeight: 3836,
    },
    // {
    //   key:         'dungeon',
    //   name:        'Donjon',
    //   image:       '/Camply/pictures/dungeon.png',
    //   imageWidth:  2048,
    //   imageHeight: 2048,
    // },
    // {
    //   key:         'region',
    //   name:        'Région Nord',
    //   image:       '/Camply/pictures/region.png',
    //   imageWidth:  4096,
    //   imageHeight: 3000,
    // },
    // {
    //   key:         'sea',
    //   name:        'Carte Marine',
    //   image:       '/Camply/pictures/sea.png',
    //   imageWidth:  5000,
    //   imageHeight: 3500,
    // },
  ],

  // ── Comportement du zoom ──────────────────────────────────
  zoomMin:     0.15,
  zoomMax:     4.0,
  zoomStep:    0.15,
  zoomInitial: 'fit', // 'fit' = ajuste à la fenêtre, ou nombre (ex: 0.5)

  // ── Apparence des marqueurs ───────────────────────────────
  markerSize: 28,
  markerColors: [
    '#e05c5c',
    '#e07a3a',
    '#e8c46a',
    '#5cbf7a',
    '#5c9be0',
    '#9b7de8',
    '#e05c9b',
    '#5cbfbf',
  ],

  // ── Textes de l'interface ─────────────────────────────────
  labels: {
    tabName:                  'Carte',
    addMarkerHint:            'Maj+clic gauche pour ajouter un marqueur',
    markerModalTitle:         'Nouveau marqueur',
    editModalTitle:           'Modifier le marqueur',
    fieldName:                'Nom',
    fieldDesc:                'Description',
    fieldColor:               'Couleur',
    namePlaceholder:          'Ex : Taverne du Dragon d\'Or',
    descPlaceholder:          'Notes, description du lieu…',
    btnSave:                  'Enregistrer',
    btnCancel:                'Annuler',
    btnDelete:                'Supprimer',
    confirmDelete:            'Supprimer ce marqueur ?',
    toastAdded:               'Marqueur ajouté !',
    toastSaved:               'Marqueur sauvegardé !',
    toastDeleted:             'Marqueur supprimé.',
    toastError:               'Erreur lors de la sauvegarde.',
    emptyName:                'Veuillez saisir un nom.',
    imageError:               'Impossible de charger la carte. Vérifiez map-config.js.',
    toastLayerNotFound:       'Couche introuvable ou non publique.',
    toastLayerOwn:            'C\'est votre propre couche de carte !',
    toastLayerAlreadyFollowed:'Vous suivez déjà cette couche.',
    toastLayerUnsubscribed:   'Abonnement à la couche supprimé.',
    toastLayerSubscribed:     'Abonné à "${title}" !',
    layerPanelTitle:          'Partage',
    ownLayerSection:          'Ma couche',
    followedLayerSection:     'Couches suivies',
    mapSelectorLabel:         'Carte',
  },
};
