// ══════════════════════════════════════════════════════════════
// Camply — Export des objets visibles (propriétés + abonnements)
// ══════════════════════════════════════════════════════════════

function _safeName(value, fallback = 'objet') {
  const v = String(value || '').trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\-. ]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return v || fallback;
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function _extractMarkdownImageUrls(md = '') {
  const urls = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    if (m[1]) urls.push(m[1]);
  }
  return urls;
}

async function _fetchImageBlob(url) {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}

function _guessImageExt(url, blob) {
  const fromUrl = (url || '').split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/)?.[1];
  if (fromUrl) return fromUrl.toLowerCase();
  const mime = blob?.type || '';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'bin';
}

function _fmtDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function _renderObjectMarkdown(obj) {
  const lines = [];
  function walk(value, depth = 2, key = null) {
    const prefix = '#'.repeat(Math.min(depth, 6));
    if (key !== null) lines.push(`${prefix} ${key}`);

    if (value === null || value === undefined || value === '') {
      lines.push('');
      return;
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        lines.push('- (vide)', '');
        return;
      }
      value.forEach((item, idx) => {
        if (item && typeof item === 'object') {
          lines.push(`- Élément ${idx + 1}`);
          Object.entries(item).forEach(([k, v]) => walk(v, Math.min(depth + 1, 6), k));
        } else {
          lines.push(`- ${String(item)}`);
        }
      });
      lines.push('');
      return;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) {
        lines.push('- (vide)', '');
        return;
      }
      entries.forEach(([k, v]) => walk(v, Math.min(depth + 1, 6), k));
      lines.push('');
      return;
    }

    lines.push(String(value), '');
  }

  Object.entries(obj || {}).forEach(([k, v]) => {
    if (k.startsWith('_')) return;
    walk(v, 2, k);
  });

  return lines.join('\n').trim() + '\n';
}

async function _appendImages(zipFolder, urls = []) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  if (!unique.length) return 0;

  const imgFolder = zipFolder.folder('images');
  let added = 0;
  for (let i = 0; i < unique.length; i += 1) {
    const url = unique[i];
    const blob = await _fetchImageBlob(url);
    if (!blob) continue;
    const ext = _guessImageExt(url, blob);
    imgFolder.file(`image_${String(i + 1).padStart(2, '0')}.${ext}`, blob);
    added += 1;
  }
  return added;
}

async function _collectChronicleEntries(chronicleIds) {
  if (!chronicleIds.length) return [];
  const { data, error } = await sb.from('chronicle_entries')
    .select('id, chronicle_id, title, content, created_at, updated_at')
    .in('chronicle_id', chronicleIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Erreur de chargement des entrées de chronique');
  return data || [];
}

async function _collectOwnMapMarkers() {
  const { data, error } = await sb.from('map_markers')
    .select('id, x, y, name, description, color, map_key')
    .eq('user_id', currentUser.id);
  if (error) throw new Error(error.message || 'Erreur de chargement des marqueurs de carte');
  return data || [];
}

async function exportVisibleData() {
  toggleUserMenu(false);

  if (!window.JSZip) {
    showToast(t('export_error_zip_lib'));
    return;
  }

  try {
    showToast(t('export_in_progress'));
    if (typeof ensureMapLayersCacheLoaded === 'function') {
      await ensureMapLayersCacheLoaded();
    }

    const zip = new JSZip();
    const root = zip.folder(`camply_export_${new Date().toISOString().slice(0, 10)}`);

    const personnages = root.folder('personnages');
    const chroniquesDir = root.folder('chroniques');
    const documentsDir = root.folder('documents');
    const cartesDir = root.folder('cartes');

    const allChars = [
      ...Object.values(chars || {}).map(c => ({ ...c, _source: 'owned' })),
      ...Object.values(followedChars || {}).map(c => ({ ...c, _source: 'followed' })),
    ];

    for (const c of allChars) {
      const name = _safeName(c.name, 'personnage');
      const objDir = personnages.folder(`${name}_${c.share_code || c._db_id || ''}`);
      objDir.file('personnage.md', `# ${c.name || 'Personnage'}\n\n${_renderObjectMarkdown(c)}`);
      await _appendImages(objDir, [c.illustration_url]);
    }

    const allChronicles = [
      ...Object.values(chronicles || {}).map(c => ({ ...c, _source: 'owned' })),
      ...Object.values(followedChronicles || {}).map(c => ({ ...c, _source: 'followed' })),
    ];
    const chrIds = allChronicles.map(c => c.id).filter(Boolean);
    const allEntries = await _collectChronicleEntries(chrIds);
    const entriesByChronicle = {};
    allEntries.forEach(e => {
      if (!entriesByChronicle[e.chronicle_id]) entriesByChronicle[e.chronicle_id] = [];
      entriesByChronicle[e.chronicle_id].push(e);
    });

    for (const chr of allChronicles) {
      const name = _safeName(chr.title, 'chronique');
      const objDir = chroniquesDir.folder(`${name}_${chr.share_code || chr.id || ''}`);
      const head = [
        `# ${chr.title || 'Chronique'}`,
        '',
        chr.description || '',
        '',
        `- Source: ${chr._source === 'owned' ? 'propriétaire' : 'abonné'}`,
        `- Code: ${chr.share_code || '—'}`,
        `- Dernière mise à jour: ${_fmtDate(chr.updated_at)}`,
        ''
      ].join('\n');
      objDir.file('README.md', head);

      const entries = entriesByChronicle[chr.id] || [];
      entries.forEach((e, index) => {
        const file = `${String(index + 1).padStart(3, '0')}_${_safeName(e.title, 'entree')}.md`;
        objDir.file(file, `# ${e.title || 'Entrée'}\n\n${e.content || ''}\n`);
      });

      const imageUrls = [chr.illustration_url];
      entries.forEach(e => imageUrls.push(..._extractMarkdownImageUrls(e.content || '')));
      await _appendImages(objDir, imageUrls);
    }

    const allDocs = [
      ...Object.values(documents || {}).map(d => ({ ...d, _source: 'owned' })),
      ...Object.values(followedDocuments || {}).map(d => ({ ...d, _source: 'followed' })),
    ];

    for (const d of allDocs) {
      const name = _safeName(d.title, 'document');
      const objDir = documentsDir.folder(`${name}_${d.share_code || d.id || ''}`);
      const md = [
        `# ${d.title || 'Document'}`,
        '',
        `- Source: ${d._source === 'owned' ? 'propriétaire' : 'abonné'}`,
        `- Code: ${d.share_code || '—'}`,
        `- Dernière mise à jour: ${_fmtDate(d.updated_at)}`,
        '',
        d.content || '',
        ''
      ].join('\n');
      objDir.file('document.md', md);
      await _appendImages(objDir, [d.illustration_url, ..._extractMarkdownImageUrls(d.content || '')]);
    }

    const ownMarkers = await _collectOwnMapMarkers();
    const ownLayers = Object.values(mapOwnLayers || {}).map(layer => ({
      layer,
      markers: ownMarkers.filter(m => _normalizeMapKey(m.map_key) === _normalizeMapKey(layer.map_key)),
      source: 'owned'
    }));
    const followedLayers = Object.values(mapFollowedLayers || {}).map(({ layer, markers }) => ({
      layer,
      markers: Object.values(markers || {}).filter(m => _normalizeMapKey(m.map_key) === _normalizeMapKey(layer.map_key)),
      source: 'followed'
    }));

    for (const item of [...ownLayers, ...followedLayers]) {
      const layer = item.layer || {};
      const name = _safeName(layer.title || layer.map_key || 'carte', 'carte');
      const objDir = cartesDir.folder(`${name}_${layer.share_code || layer.id || ''}`);
      const mapLabel = (MAP_CONFIG.maps || []).find(m => m.key === layer.map_key)?.name || layer.map_key || 'default';
      const lines = [
        `# ${layer.title || 'Couche de carte'}`,
        '',
        `- Source: ${item.source === 'owned' ? 'propriétaire' : 'abonné'}`,
        `- Carte: ${mapLabel}`,
        `- Code: ${layer.share_code || '—'}`,
        '',
        '## Marqueurs',
        ''
      ];
      if (!item.markers.length) {
        lines.push('- (aucun marqueur)', '');
      } else {
        item.markers.forEach((m, idx) => {
          lines.push(`### ${idx + 1}. ${m.name || 'Sans nom'}`);
          lines.push(`- Position: x=${m.x}, y=${m.y}`);
          lines.push(`- Couleur: ${m.color || '—'}`);
          lines.push('');
          if (m.description) lines.push(m.description, '');
        });
      }
      objDir.file(`couche_${_safeName(layer.map_key || 'default')}.md`, lines.join('\n'));
    }

    root.file('README.md', [
      '# Export Camply',
      '',
      `Date: ${new Date().toISOString()}`,
      '',
      '- Contient les objets visibles : propriétaires + abonnements.',
      '- Dossiers de catégories : personnages, chroniques, documents, cartes.',
      ''
    ].join('\n'));

    const blob = await zip.generateAsync({ type: 'blob' });
    _downloadBlob(blob, `camply_export_${new Date().toISOString().slice(0, 10)}.zip`);
    showToast(t('export_done'));
  } catch (err) {
    console.error(err);
    showToast(`${t('export_error')}: ${err.message || 'inconnue'}`);
  }
}
