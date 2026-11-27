const CACHE_NAME = 'ritm-v2.0.0-ui-polish';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './js/app.js',
  './js/domain/entities.js',
  './js/domain/DateUtils.js',
  './js/repositories/StorageRepository.js',
  './js/repositories/LocalStorageAdapter.js',
  './js/services/RecurrenceService.js',
  './js/services/StatusLifecycleService.js',
  './js/services/CompensationEngine.js',
  './js/services/SeedService.js',
  './js/ui/AgendaView.js',
  './js/ui/CompensationsView.js',
  './js/ui/RecurrencesView.js',
  './js/ui/SettingsView.js',
  './js/ui/ModalManager.js',
  './js/ui/ToastManager.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-First: busca sempre a versão atualizada online; se offline, cai para o cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});