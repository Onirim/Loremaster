// ══════════════════════════════════════════════════════════════
// ENERGY SYSTEM — Service Worker (cache production)
// Stratégie :
//   - Assets statiques (JS, CSS, fonts, icons) → Cache First
//   - Pages HTML → Network First (toujours fraîche)
//   - Images Supabase → Network First avec fallback cache
// ══════════════════════════════════════════════════════════════

const CACHE_NAME = 'energy-system-v8';

// Assets mis en cache dès l'installation
const PRECACHE_ASSETS = [
  '/Energy-System/',
  '/Energy-System/index.html',
  '/Energy-System/styles.css',
  '/Energy-System/chronicles.css',
  '/Energy-System/documents.css',
  '/Energy-System/campaigns.css',
  '/Energy-System/i18n.js',
  '/Energy-System/supabase-client.js',
  '/Energy-System/scripts.js',
  '/Energy-System/editor.js',
  '/Energy-System/chronicles.js',
  '/Energy-System/documents.js',
  '/Energy-System/campaigns.js',
  '/Energy-System/tags.js',
];

// ── Installation : pré-cache des assets statiques ─────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activation : supprime les anciens caches ──────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie selon le type de ressource ──────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore les requêtes non-GET (API Supabase, auth, etc.)
  if (request.method !== 'GET') return;

  // Ignore les requêtes vers Supabase API (données dynamiques)
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/')) return;
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/auth/')) return;

  // Images Supabase Storage → Network First avec fallback cache
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Fonts Google → Cache First (elles ne changent jamais)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // CDN (supabase-js, marked) → Cache First
  if (url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Assets locaux (JS, CSS, images statiques) → Cache First
  if (url.hostname === self.location.hostname) {
    // HTML → Network First pour toujours avoir la dernière version
    if (request.destination === 'document') {
      event.respondWith(networkFirstWithCache(request));
      return;
    }
    // Tout le reste (JS, CSS, fonts locales, icônes) → Cache First
    event.respondWith(cacheFirst(request));
    return;
  }
});

// ── Helpers ───────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
