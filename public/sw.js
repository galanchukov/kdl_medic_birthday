/* ============================================================
   SERVICE WORKER — Уведомления о днях рождения врачей
   Стратегия: Cache-First для статики + уведомления
   ============================================================ */

const CACHE_NAME = 'kdl-bd-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/doctors.json',
];

/* ---------- Install: кешируем статику ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ---------- Activate: удаляем старый кеш ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ---------- Fetch: Cache-First ---------- */
self.addEventListener('fetch', (event) => {
  // Только GET-запросы, только к нашему origin
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Кешируем успешные ответы
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

/* ---------- Push-уведомление (от main thread) ---------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_BIRTHDAY_NOTIFICATION') {
    const { doctors } = event.data;
    if (!doctors || doctors.length === 0) return;

    doctors.forEach((doctor) => {
      self.registration.showNotification('🎂 День рождения завтра!', {
        body: `У ${doctor.name} (${doctor.department}) завтра день рождения!`,
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        tag: `birthday-${doctor.id}`,           // предотвращает дублирование
        renotify: false,
        requireInteraction: false,
        data: { doctorId: doctor.id },
        actions: [
          { action: 'open', title: 'Открыть приложение' },
          { action: 'dismiss', title: 'Закрыть' },
        ],
      });
    });
  }
});

/* ---------- Клик по уведомлению ---------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Если приложение уже открыто — фокусируемся на нём
      const existingClient = clientList.find((c) => c.url.includes(self.location.origin));
      if (existingClient) return existingClient.focus();
      // Иначе открываем новую вкладку
      return clients.openWindow('/');
    })
  );
});
