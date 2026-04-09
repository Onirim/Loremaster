// ══════════════════════════════════════════════════════════════
// Camply — Module Carte
// Carte zoomable + pannable avec marqueurs personnels.
// Dépend de : supabase-client.js, map-config.js, scripts.js
// ══════════════════════════════════════════════════════════════

// ── État ──────────────────────────────────────────────────────
let mapMarkers        = {};   // id → marker object
let mapLoaded         = false;

// Transformation courante de la carte
let mapTransform = {
  x:     0,
  y:     0,
  scale: 1,
};

// État du drag (pan)
let mapDrag = {
  active:    false,
  startX:    0,
  startY:    0,
  originX:   0,
  originY:   0,
  moved:     false,   // distingue un clic d'un drag
};

// Popup ouverte
let mapOpenPopupId = null;

// Modale en cours (null | { mode: 'add'|'edit', x?, y?, id? })
let mapModalCtx = null;

// Couleur sélectionnée dans la modale
let mapModalColor = MAP_CONFIG.markerColors[0];

// ── Références DOM (initialisées dans initMap) ─────────────────
let _mapViewport = null;
let _mapCanvas   = null;
let _mapImage    = null;

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════

async function initMap() {
  if (mapLoaded) return;

  _mapViewport = document.getElementById('map-viewport');
  _mapCanvas   = document.getElementById('map-canvas');

  _buildMapImage();
  _bindMapEvents();
  await loadMapMarkersFromDB();

  mapLoaded = true;
}

function _buildMapImage() {
  const img = document.createElement('img');
  img.id        = 'map-image';
  img.className = 'map-image';
  img.alt       = 'Carte';
  img.draggable = false;

  img.onload = () => {
    _mapImage = img;
    _setInitialTransform();
    _renderAllMarkers();
    _updateZoomDisplay();
  };

  img.onerror = () => {
    const err = document.createElement('div');
    err.className = 'map-image-error';
    err.innerHTML = `
      <div class="icon">🗺️</div>
      <strong>${MAP_CONFIG.labels.imageError}</strong>
      <code>${MAP_CONFIG.image}</code>`;
    _mapCanvas.appendChild(err);
  };

  img.src = MAP_CONFIG.image;
  _mapCanvas.appendChild(img);
}

// ══════════════════════════════════════════════════════════════
// TRANSFORM — ZOOM & PAN
// ══════════════════════════════════════════════════════════════

function _setInitialTransform() {
  if (!_mapViewport || !_mapImage) return;

  const vw = _mapViewport.clientWidth;
  const vh = _mapViewport.clientHeight;
  const iw = MAP_CONFIG.imageWidth;
  const ih = MAP_CONFIG.imageHeight;

  let scale;
  if (MAP_CONFIG.zoomInitial === 'fit') {
    scale = Math.min(vw / iw, vh / ih) * 0.92;
    scale = Math.max(MAP_CONFIG.zoomMin, Math.min(MAP_CONFIG.zoomMax, scale));
  } else {
    scale = parseFloat(MAP_CONFIG.zoomInitial) || 1;
  }

  mapTransform.scale = scale;
  mapTransform.x     = (vw - iw * scale) / 2;
  mapTransform.y     = (vh - ih * scale) / 2;
  _applyTransform();
}

function _applyTransform() {
  if (!_mapCanvas) return;
  _mapCanvas.style.transform =
    `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.scale})`;

  // Met à jour l'échelle inverse des marqueurs
  const inv = 1 / mapTransform.scale;
  document.querySelectorAll('.map-marker').forEach(el => {
    el.style.transform = `translate(-50%, -100%) scale(${inv})`;
  });
}

function _updateZoomDisplay() {
  const el = document.getElementById('map-zoom-value');
  if (el) el.textContent = Math.round(mapTransform.scale * 100) + '%';
}

function _clampTransform() {
  if (!_mapImage) return;
  const vw = _mapViewport.clientWidth;
  const vh = _mapViewport.clientHeight;
  const iw = MAP_CONFIG.imageWidth  * mapTransform.scale;
  const ih = MAP_CONFIG.imageHeight * mapTransform.scale;
  const margin = 60;
  mapTransform.x = Math.min(vw - margin, Math.max(margin - iw, mapTransform.x));
  mapTransform.y = Math.min(vh - margin, Math.max(margin - ih, mapTransform.y));
}

// Zoom centré sur un point (cx, cy) dans le repère du viewport
function _zoomAt(cx, cy, newScale) {
  newScale = Math.max(MAP_CONFIG.zoomMin, Math.min(MAP_CONFIG.zoomMax, newScale));
  const ratio = newScale / mapTransform.scale;
  mapTransform.x     = cx - ratio * (cx - mapTransform.x);
  mapTransform.y     = cy - ratio * (cy - mapTransform.y);
  mapTransform.scale = newScale;
  _clampTransform();
  _applyTransform();
  _updateZoomDisplay();
  _repositionPopup();
}

function mapZoomIn()  { const c = _viewportCenter(); _zoomAt(c.x, c.y, mapTransform.scale + MAP_CONFIG.zoomStep); }
function mapZoomOut() { const c = _viewportCenter(); _zoomAt(c.x, c.y, mapTransform.scale - MAP_CONFIG.zoomStep); }
function mapZoomReset() { _setInitialTransform(); _updateZoomDisplay(); _closePopup(); }

function _viewportCenter() {
  return {
    x: _mapViewport.clientWidth  / 2,
    y: _mapViewport.clientHeight / 2,
  };
}

// ══════════════════════════════════════════════════════════════
// EVENTS — PAN, ZOOM MOLETTE, MAJ+CLIC
// ══════════════════════════════════════════════════════════════

function _bindMapEvents() {
  const vp = _mapViewport;

  // ── Molette → zoom ────────────────────────────────────────
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const rect   = vp.getBoundingClientRect();
    const cx     = e.clientX - rect.left;
    const cy     = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    _zoomAt(cx, cy, mapTransform.scale * factor);
  }, { passive: false });

  // ── Pinch-to-zoom (mobile) ────────────────────────────────
  let _lastPinchDist = null;
  vp.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      _lastPinchDist = _pinchDist(e);
    }
  }, { passive: true });
  vp.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && _lastPinchDist !== null) {
      const dist = _pinchDist(e);
      const cx   = (e.touches[0].clientX + e.touches[1].clientX) / 2 - vp.getBoundingClientRect().left;
      const cy   = (e.touches[0].clientY + e.touches[1].clientY) / 2 - vp.getBoundingClientRect().top;
      _zoomAt(cx, cy, mapTransform.scale * (dist / _lastPinchDist));
      _lastPinchDist = dist;
      e.preventDefault();
    }
  }, { passive: false });
  vp.addEventListener('touchend', () => { _lastPinchDist = null; });

  // ── Mousedown → pan ou Maj+clic ───────────────────────────
  vp.addEventListener('mousedown', e => {
    // Ferme la popup si clic en dehors d'elle
    const popup = document.getElementById('map-popup');
    if (popup && !popup.contains(e.target)) _closePopup();

    if (e.shiftKey && e.button === 0) {
      // Maj+clic gauche = ajout marqueur
      e.preventDefault();
      const pos = _viewportToMap(e.clientX, e.clientY);
      openMapMarkerModal('add', pos.x, pos.y);
      return;
    }
    if (e.button === 0) {
      mapDrag.active  = true;
      mapDrag.moved   = false;
      mapDrag.startX  = e.clientX;
      mapDrag.startY  = e.clientY;
      mapDrag.originX = mapTransform.x;
      mapDrag.originY = mapTransform.y;
    }
  });

  window.addEventListener('mousemove', e => {
    if (!mapDrag.active) return;
    const dx = e.clientX - mapDrag.startX;
    const dy = e.clientY - mapDrag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mapDrag.moved = true;
    mapTransform.x = mapDrag.originX + dx;
    mapTransform.y = mapDrag.originY + dy;
    _clampTransform();
    _applyTransform();
    _repositionPopup();
  });

  window.addEventListener('mouseup', () => {
    mapDrag.active = false;
  });

  // ── Touch pan (1 doigt) ───────────────────────────────────
  let _touchStart = null;
  vp.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      _touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY,
                      ox: mapTransform.x, oy: mapTransform.y };
    }
  }, { passive: true });
  vp.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && _touchStart) {
      mapTransform.x = _touchStart.ox + e.touches[0].clientX - _touchStart.x;
      mapTransform.y = _touchStart.oy + e.touches[0].clientY - _touchStart.y;
      _clampTransform();
      _applyTransform();
    }
  }, { passive: true });
  vp.addEventListener('touchend', () => { _touchStart = null; });

  // ── Resize → recalcul ─────────────────────────────────────
  window.addEventListener('resize', () => {
    if (mapLoaded) { _clampTransform(); _applyTransform(); }
  });
}

function _pinchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Convertit des coordonnées viewport (px) en position relative image (0→1)
function _viewportToMap(clientX, clientY) {
  const rect = _mapViewport.getBoundingClientRect();
  const lx   = (clientX - rect.left - mapTransform.x) / mapTransform.scale;
  const ly   = (clientY - rect.top  - mapTransform.y) / mapTransform.scale;
  return {
    x: lx / MAP_CONFIG.imageWidth,
    y: ly / MAP_CONFIG.imageHeight,
  };
}

// Convertit une position relative (0→1) en coordonnées canvas (px)
function _mapToCanvas(rx, ry) {
  return {
    x: rx * MAP_CONFIG.imageWidth,
    y: ry * MAP_CONFIG.imageHeight,
  };
}

// ══════════════════════════════════════════════════════════════
// DB — CRUD MARQUEURS
// ══════════════════════════════════════════════════════════════

async function loadMapMarkersFromDB() {
  if (!currentUser) return;
  const { data, error } = await sb
    .from('map_markers')
    .select('id, x, y, name, description, color')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });
  if (error) { console.error('Erreur chargement marqueurs:', error); return; }
  mapMarkers = {};
  (data || []).forEach(m => { mapMarkers[m.id] = m; });
  _renderAllMarkers();
  _updateMarkerCount();
}

async function _saveMarkerToDB(payload) {
  if (mapModalCtx.mode === 'add') {
    const { data, error } = await sb
      .from('map_markers')
      .insert({ ...payload, user_id: currentUser.id })
      .select('id, x, y, name, description, color')
      .single();
    if (error) { showToast(MAP_CONFIG.labels.toastError); return; }
    mapMarkers[data.id] = data;
    _renderMarker(data);
    _updateMarkerCount();
    showToast(MAP_CONFIG.labels.toastAdded);
  } else {
    const id = mapModalCtx.id;
    const { data, error } = await sb
      .from('map_markers')
      .update(payload)
      .eq('id', id)
      .select('id, x, y, name, description, color')
      .single();
    if (error) { showToast(MAP_CONFIG.labels.toastError); return; }
    mapMarkers[id] = data;
    // Met à jour le DOM du marqueur existant
    const el = document.getElementById('marker-' + id);
    if (el) {
      el.querySelector('.map-marker-pin circle').setAttribute('fill', data.color);
      el.querySelector('.map-marker-pin path').setAttribute('fill', data.color);
      el.querySelector('.map-marker-label').textContent = data.name;
    }
    showToast(MAP_CONFIG.labels.toastSaved);
  }
}

async function deleteMapMarker(id) {
  if (!confirm(MAP_CONFIG.labels.confirmDelete)) return;
  const { error } = await sb.from('map_markers').delete().eq('id', id);
  if (error) { showToast(MAP_CONFIG.labels.toastError); return; }
  delete mapMarkers[id];
  const el = document.getElementById('marker-' + id);
  if (el) el.remove();
  _updateMarkerCount();
  _closePopup();
  showToast(MAP_CONFIG.labels.toastDeleted);
}

// ══════════════════════════════════════════════════════════════
// RENDU DES MARQUEURS
// ══════════════════════════════════════════════════════════════

function _renderAllMarkers() {
  // Supprime les anciens marqueurs du DOM
  _mapCanvas.querySelectorAll('.map-marker').forEach(el => el.remove());
  Object.values(mapMarkers).forEach(m => _renderMarker(m));
  _updateMarkerCount();
}

function _renderMarker(m) {
  if (!_mapCanvas) return;

  const { x: cx, y: cy } = _mapToCanvas(m.x, m.y);
  const size = MAP_CONFIG.markerSize;
  const inv  = 1 / mapTransform.scale;

  const el = document.createElement('div');
  el.className = 'map-marker';
  el.id        = 'marker-' + m.id;
  el.style.left      = cx + 'px';
  el.style.top       = cy + 'px';
  el.style.transform = `translate(-50%, -100%) scale(${inv})`;

  el.innerHTML = `
    <svg class="map-marker-pin"
      width="${size}" height="${Math.round(size * 1.4)}"
      viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26s14-16.667 14-26C28 6.268 21.732 0 14 0z"
        fill="${m.color}" opacity="0.92"/>
      <circle cx="14" cy="14" r="5.5" fill="white" opacity="0.95"/>
    </svg>
    <div class="map-marker-label">${esc(m.name)}</div>`;

  el.addEventListener('click', e => {
    e.stopPropagation();
    if (mapDrag.moved) return; // ignore si l'utilisateur était en train de panner
    _openPopup(m.id, el);
  });

  _mapCanvas.appendChild(el);
}

function _updateMarkerCount() {
  const el = document.getElementById('map-marker-count');
  if (!el) return;
  const n = Object.keys(mapMarkers).length;
  el.innerHTML = `<span>${n}</span> marqueur${n !== 1 ? 's' : ''}`;
}

// ══════════════════════════════════════════════════════════════
// POPUP D'INFO
// ══════════════════════════════════════════════════════════════

function _openPopup(markerId, markerEl) {
  const m = mapMarkers[markerId];
  if (!m) return;
  mapOpenPopupId = markerId;

  // Supprime une éventuelle popup existante
  const old = document.getElementById('map-popup');
  if (old) old.remove();

  const popup = document.createElement('div');
  popup.className = 'map-popup';
  popup.id        = 'map-popup';

  popup.innerHTML = `
    <div class="map-popup-header">
      <div class="map-popup-color-dot" style="background:${m.color}"></div>
      <div class="map-popup-name">${esc(m.name)}</div>
      <button class="map-popup-close" onclick="_closePopup()">✕</button>
    </div>
    ${m.description
      ? `<div class="map-popup-desc">${esc(m.description)}</div>`
      : ''}
    <div class="map-popup-actions">
      <button class="map-popup-edit-btn"
        onclick="openMapMarkerModal('edit', null, null, '${markerId}')">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
          width="11" height="11"><path d="M11 2l3 3-9 9H2v-3z"/></svg>
        ${MAP_CONFIG.labels.btnSave === 'Enregistrer' ? 'Modifier' : 'Edit'}
      </button>
      <button class="map-popup-delete-btn" onclick="deleteMapMarker('${markerId}')">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
          width="11" height="11">
          <polyline points="3,4 13,4"/>
          <path d="M5 4V2h6v2M6 7v5M10 7v5"/>
          <path d="M4 4l1 10h6l1-10"/>
        </svg>
        ${MAP_CONFIG.labels.btnDelete}
      </button>
    </div>`;

  // Positionne la popup dans le viewport au-dessus du marqueur
  _mapViewport.appendChild(popup);
  _repositionPopupOn(markerId, popup);
}

function _repositionPopup() {
  if (!mapOpenPopupId) return;
  const popup = document.getElementById('map-popup');
  if (popup) _repositionPopupOn(mapOpenPopupId, popup);
}

function _repositionPopupOn(markerId, popup) {
  const m = mapMarkers[markerId];
  if (!m) return;
  const { x: cx, y: cy } = _mapToCanvas(m.x, m.y);
  // Position du pin dans le viewport
  const vx = cx * mapTransform.scale + mapTransform.x;
  const vy = cy * mapTransform.scale + mapTransform.y;
  const size = MAP_CONFIG.markerSize;
  const pw = popup.offsetWidth  || 240;
  const ph = popup.offsetHeight || 120;
  const vw = _mapViewport.clientWidth;
  const vh = _mapViewport.clientHeight;

  let left = vx - pw / 2;
  let top  = vy - size / mapTransform.scale * 1.4 - ph - 8;

  // Anti-débordement
  if (left < 8)       left = 8;
  if (left + pw > vw) left = vw - pw - 8;
  if (top  < 8)       top  = vy + size + 8;   // affiche en dessous si ça déborde en haut

  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';
}

function _closePopup() {
  const popup = document.getElementById('map-popup');
  if (popup) popup.remove();
  mapOpenPopupId = null;
}

// ══════════════════════════════════════════════════════════════
// MODALE AJOUT / ÉDITION
// ══════════════════════════════════════════════════════════════

function openMapMarkerModal(mode, rx, ry, markerId) {
  mapModalCtx = { mode, x: rx, y: ry, id: markerId };

  const m = (mode === 'edit' && markerId) ? mapMarkers[markerId] : null;
  mapModalColor = m?.color || MAP_CONFIG.markerColors[0];

  const modal = document.getElementById('map-marker-modal');
  const title = document.getElementById('map-modal-title-text');
  const nameInput = document.getElementById('map-modal-name');
  const descInput = document.getElementById('map-modal-desc');

  title.textContent = mode === 'add'
    ? MAP_CONFIG.labels.markerModalTitle
    : MAP_CONFIG.labels.editModalTitle;

  nameInput.value = m?.name        || '';
  descInput.value = m?.description || '';

  // Rendu des swatches de couleur
  const swatchContainer = document.getElementById('map-modal-swatches');
  swatchContainer.innerHTML = MAP_CONFIG.markerColors.map(c => `
    <div class="map-color-swatch ${c === mapModalColor ? 'selected' : ''}"
      style="background:${c}"
      onclick="selectMapModalColor('${c}', this)"
      title="${c}"></div>`).join('');

  modal.classList.add('open');
  requestAnimationFrame(() => nameInput.focus());

  _closePopup();
}

function selectMapModalColor(color, el) {
  mapModalColor = color;
  document.querySelectorAll('.map-color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

function closeMapMarkerModal() {
  document.getElementById('map-marker-modal').classList.remove('open');
  mapModalCtx = null;
}

async function submitMapMarkerModal() {
  const name = document.getElementById('map-modal-name').value.trim();
  const desc = document.getElementById('map-modal-desc').value.trim();
  if (!name) { document.getElementById('map-modal-name').focus(); return; }

  const payload = {
    name,
    description: desc,
    color:       mapModalColor,
    ...(mapModalCtx.mode === 'add' && {
      x: Math.max(0, Math.min(1, mapModalCtx.x)),
      y: Math.max(0, Math.min(1, mapModalCtx.y)),
    }),
  };

  closeMapMarkerModal();
  await _saveMarkerToDB(payload);
}

// ══════════════════════════════════════════════════════════════
// RACCOURCIS CLAVIER DANS LA MODALE
// ══════════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  const modal = document.getElementById('map-marker-modal');
  if (modal?.classList.contains('open')) {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      submitMapMarkerModal();
    }
    if (e.key === 'Escape') closeMapMarkerModal();
  }
});
