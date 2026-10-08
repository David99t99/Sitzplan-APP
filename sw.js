// sw.js – Service Worker
// Er speichert alle Dateien der App im Cache des Browsers. Dadurch startet die
// App auch ohne Internet. Die DATEN (Klassen, SuS …) liegen NICHT hier, sondern
// in IndexedDB (siehe js/db.js).
//
// WICHTIG: Nach jeder Code-Änderung VERSION erhöhen (z. B. v2, v3 …).
// Sonst lädt das Handy weiterhin die alte, gecachte Version.
const VERSION = 'sitzplan-v5';

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
  './js/util/beobachtung.js',
  './js/util/datei.js',
  './js/util/sicherung.js',
  './js/views/plan.js',
  './js/views/raum.js',
  './js/views/schueler.js',
  './js/views/klasse.js',
  './js/views/schnellmenue.js',
  './js/views/person.js',
  './js/views/uebersicht.js',
  './js/views/versionen.js',
  './js/views/sperre.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 1) Installation: alle Dateien in einen neuen Cache laden
self.addEventListener('install', (event) => {
  // cache: 'reload' = Dateien wirklich frisch vom Server holen. Ohne das nimmt der
  // Browser evtl. seine eigene Zwischenkopie (GitHub Pages erlaubt 10 Minuten) und
  // die "neue" Version bestünde dann aus den alten Dateien.
  const frisch = DATEIEN.map((datei) => new Request(datei, { cache: 'reload' }));
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(frisch)));
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
