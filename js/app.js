// app.js – Startpunkt der App.
// Lädt die Daten, baut Kopf (Klassen-Tabs), Inhalt und Navigation auf
// und registriert den Service Worker für den Offline-Betrieb.

import { state, app, aktuelleKlasse } from './state.js';
import * as db from './db.js';
import { el, toast } from './util/ui.js';
import { zeichnePlan } from './views/plan.js';
import { zeichneRaum } from './views/raum.js';
import { zeichneSchueler } from './views/schueler.js';
import { zeichneKlasse, neueKlasseDialog } from './views/klasse.js';

// Die vier Ansichten der unteren Navigation
const ANSICHTEN = [
  { id: 'plan', name: 'Sitzplan', symbol: '▦', zeichne: zeichnePlan },
  { id: 'schueler', name: 'SuS', symbol: '👥', zeichne: zeichneSchueler },
  { id: 'raum', name: 'Raum', symbol: '✎', zeichne: zeichneRaum },
  { id: 'klasse', name: 'Klasse', symbol: '⚙︎', zeichne: zeichneKlasse },
];

// ---------------------------------------------------------------------------
// Neu zeichnen: baut die ganze Oberfläche aus "state" + Datenbank neu auf.
// Einfach und robust: nach jeder Änderung einmal alles neu.
// ---------------------------------------------------------------------------
let zeichenNummer = 0;

async function neuZeichnen() {
  const meineNummer = ++zeichenNummer;
  zeichneKopf();
  zeichneNavi();

  const neu = el('div', { class: 'ansicht' });
  if (!aktuelleKlasse()) {
    zeichneWillkommen(neu);
  } else {
    const ansicht = ANSICHTEN.find((a) => a.id === state.ansicht) || ANSICHTEN[0];
    await ansicht.zeichne(neu);
  }

  // Wurde inzwischen schon wieder neu gezeichnet (schnelles Tippen)? Dann verwerfen.
  if (meineNummer !== zeichenNummer) return;

  // Waagrechte Scroll-Position des Rasters merken und wiederherstellen
  const inhalt = document.getElementById('inhalt');
  const scroll = {};
  inhalt.querySelectorAll('[data-scroll]').forEach((e) => { scroll[e.dataset.scroll] = e.scrollLeft; });
  inhalt.replaceChildren(neu);
  inhalt.querySelectorAll('[data-scroll]').forEach((e) => { e.scrollLeft = scroll[e.dataset.scroll] || 0; });
}
app.neuZeichnen = neuZeichnen;

// Oben: ein Tab pro Klasse + "+" für eine neue Klasse
function zeichneKopf() {
  const tabs = state.klassen.map((k) => el('button', {
    class: 'tab' + (k.id === state.klasseId ? ' aktiv' : ''),
    text: k.name,
    onclick: () => klasseWechseln(k.id),
  }));
  tabs.push(el('button', { class: 'tab plus', 'aria-label': 'Neue Klasse', text: '+', onclick: neueKlasseDialog }));

  const kopf = document.getElementById('kopf');
  kopf.replaceChildren(el('div', { class: 'tabs' }, tabs));
  // Aktiven Tab sichtbar machen, falls die Leiste gescrollt ist
  kopf.querySelector('.tab.aktiv')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

// Unten: Navigation zwischen den Ansichten
function zeichneNavi() {
  const navi = document.getElementById('navi');
  if (!aktuelleKlasse()) { navi.replaceChildren(); return; }
  navi.replaceChildren(...ANSICHTEN.map((a) => el('button', {
    class: 'navi-knopf' + (state.ansicht === a.id ? ' aktiv' : ''),
    'aria-current': state.ansicht === a.id ? 'page' : null,
    onclick: () => { state.ansicht = a.id; state.auswahl = null; neuZeichnen(); },
  }, el('span', { class: 'navi-symbol', text: a.symbol }), el('span', { text: a.name }))));
}

async function klasseWechseln(id) {
  state.klasseId = id;
  state.auswahl = null;
  await db.speichereEinstellung('letzteKlasse', id);
  neuZeichnen();
}

// Erster Start: noch keine Klasse vorhanden
function zeichneWillkommen(container) {
  container.append(el('div', { class: 'karte leer-hinweis' },
    el('h2', { text: 'Willkommen!' }),
    el('p', { text: 'Lege deine erste Klasse an. Danach legst du die Sitzplätze fest und trägst die SuS ein.' }),
    el('button', { class: 'knopf primaer', text: '+ Erste Klasse anlegen', onclick: neueKlasseDialog }),
    el('p', { class: 'hinweis', text: 'Alle Daten bleiben ausschließlich auf diesem Gerät.' }),
  ));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  state.klassen = await db.ladeKlassen();
  const letzte = await db.ladeEinstellung('letzteKlasse');
  state.klasseId = state.klassen.some((k) => k.id === letzte) ? letzte : (state.klassen[0]?.id ?? null);
  state.lehrersicht = await db.ladeEinstellung('lehrersicht', true);
  state.modus = 'unterricht'; // beim Start immer gesperrt

  await neuZeichnen();
  db.dauerhaftSpeichern(); // Browser bitten, die Daten nicht zu löschen

  // Bei Drehen des Handys / Größenänderung: Raster neu berechnen (leicht verzögert)
  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(neuZeichnen, 150);
  });
}

// Service Worker registrieren (macht die App offline-fähig).
// Funktioniert nur über https:// oder http://localhost.
if ('serviceWorker' in navigator) {
  const hatteSchonEinen = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker:', e));
  // Neue Version wurde installiert -> einmal neu laden, damit sie sofort gilt
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteSchonEinen || neuGeladen) return;
    neuGeladen = true;
    location.reload();
  });
}

// Unerwartete Fehler sichtbar machen statt still zu scheitern
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Fehler: ' + (e.reason?.message || e.reason), { dauer: 5000 });
});

start();
