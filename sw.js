// sw.js – Service Worker
// Er speichert alle Dateien der App im Cache des Browsers. Dadurch startet die
// App auch ohne Internet. Die DATEN (Klassen, SuS …) liegen NICHT hier, sondern
// in IndexedDB (siehe js/db.js).
//
// WICHTIG: Nach jeder Code-Änderung VERSION erhöhen (z. B. v2, v3 …).
// Sonst lädt das Handy weiterhin die alte, gecachte Version.
const VERSION = 'sitzplan-v1';

// Alle Dateien, die offline verfügbar sein müssen.
// Neue Datei angelegt? -> hier eintragen!
const DATEIEN = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './lib/dexie.mjs',
  './js/app.js',
  './js/state.js',
  './js/db.js',
  './js/util/ui.js',
  './js/util/raster.js',
  './js/util/foto.js',
  './js/util/ziehen.js',
  './js/views/plan.js',
  './js/views/raum.js',
  './js/views/schueler.js',
  './js/views/klasse.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 1) Installation: alle Dateien in einen neuen Cache laden
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(DATEIEN)));
  self.skipWaiting(); // neue Version sofort aktivieren
});

// 2) Aktivierung: alte Caches (frühere Versionen) löschen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// 3) Jede Anfrage: zuerst im Cache suchen, sonst aus dem Netz holen ("Cache first")
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((treffer) => treffer || fetch(event.request))
  );
});
