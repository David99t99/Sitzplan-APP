// app.js – Startpunkt der App.
// Lädt die Daten, baut Kopf (Klassen-Tabs), Inhalt und Navigation auf
// und registriert den Service Worker für den Offline-Betrieb.

import { state, app, aktuelleKlasse } from './state.js';
import * as db from './db.js';
import { el, toast } from './util/ui.js';
import { icon } from './util/icons.js';
import { zeichnePlan } from './views/plan.js';
import { zeichneRaum } from './views/raum.js';
import { zeichneSchueler } from './views/schueler.js';
import { zeichneKlasse, neueKlasseDialog, backupErstellen, backupEinspielen } from './views/klasse.js';
import { zeichneUebersicht } from './views/uebersicht.js';
import { zeichnePerson } from './views/person.js';
import { zeichneVersionen } from './views/versionen.js';
import { sperren, automatischSperren } from './views/sperre.js';
import { backupErinnerung, erinnerungVerschieben } from './util/sicherung.js';

// Die Ansichten. "versteckt" = erscheint nicht in der unteren Navigation.
// "breit" = darf am Laptop die ganze Breite nutzen (Tabellen).
const ANSICHTEN = [
  { id: 'plan', name: 'Sitzplan', symbol: 'sitzplan', zeichne: zeichnePlan },
  { id: 'uebersicht', name: 'Übersicht', symbol: 'uebersicht', zeichne: zeichneUebersicht, breit: true },
  { id: 'schueler', name: 'SuS', symbol: 'sus', zeichne: zeichneSchueler },
  { id: 'raum', name: 'Raum', symbol: 'raum', zeichne: zeichneRaum },
  { id: 'klasse', name: 'Mehr', symbol: 'mehr', zeichne: zeichneKlasse },
  { id: 'person', name: 'Verlauf', zeichne: zeichnePerson, versteckt: true },
  { id: 'versionen', name: 'Versionen', zeichne: zeichneVersionen, versteckt: true },
];

// ---------------------------------------------------------------------------
// Neu zeichnen: baut die ganze Oberfläche aus "state" + Datenbank neu auf.
// Einfach und robust: nach jeder Änderung einmal alles neu.
// ---------------------------------------------------------------------------
let zeichenNummer = 0;
let letzteSeite = '';   // zuletzt gezeigte Ansicht + Klasse (für die Scroll-Position)

async function neuZeichnen() {
  const meineNummer = ++zeichenNummer;
  zeichneKopf();
  zeichneNavi();

  const ansicht = ANSICHTEN.find((a) => a.id === state.ansicht) || ANSICHTEN[0];
  const neu = el('div', { class: 'ansicht' + (ansicht.breit ? ' breit' : '') });
  if (!aktuelleKlasse()) {
    zeichneWillkommen(neu);
  } else {
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

  // Andere Ansicht oder andere Klasse: wieder ganz oben beginnen
  const seite = [state.ansicht, state.klasseId, state.ansicht === 'person' ? state.personId : ''].join('|');
  if (seite !== letzteSeite) inhalt.scrollTop = 0;
  letzteSeite = seite;
}
app.neuZeichnen = neuZeichnen;

// Welche Version läuft gerade? Der Service Worker legt den Cache unter dem Namen
// VERSION aus sw.js an (z. B. "sitzplan-v3") – daraus lesen wir "v3" ab.
// So gibt es nur EINE Stelle, an der die Version steht: sw.js.
let appVersion = '';
async function ladeAppVersion() {
  if (!('caches' in window)) return;
  const namen = await caches.keys();
  const treffer = namen.map((n) => /^sitzplan-(v\d+)$/.exec(n)).filter(Boolean).map((t) => t[1]);
  // Falls kurz zwei Caches existieren (während eines Updates): die höchste Nummer
  treffer.sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  appVersion = treffer[0] || '';
  document.querySelector('#kopf .version')?.replaceChildren(appVersion);
}

// Oben: ein Tab pro Klasse + "+" für eine neue Klasse
function zeichneKopf() {
  const tabs = state.klassen.map((k) => el('button', {
    class: 'tab' + (k.id === state.klasseId ? ' aktiv' : ''),
    text: k.name,
    onclick: () => klasseWechseln(k.id),
  }));
  tabs.push(el('button', { class: 'tab plus', 'aria-label': 'Neue Klasse', title: 'Neue Klasse', onclick: neueKlasseDialog }, icon('plus')));

  const kopf = document.getElementById('kopf');
  kopf.replaceChildren(el('div', { class: 'kopf-zeile' },
    el('div', { class: 'tabs' }, tabs),
    el('span', { class: 'version', title: 'Version der App', text: appVersion }),
  ));

  // Erinnerung an ein Backup (unter den Tabs)
  if (state.backupFaellig) {
    kopf.append(el('div', { class: 'banner' },
      el('span', { class: 'wachsen' }, icon('sicherung'), state.backupFaellig),
      el('button', { class: 'knopf klein primaer', text: 'Jetzt sichern', onclick: backupErstellen }),
      el('button', {
        class: 'knopf klein', text: 'Später',
        onclick: async () => { await erinnerungVerschieben(3); state.backupFaellig = null; neuZeichnen(); },
      }),
    ));
  }
  // Aktiven Tab sichtbar machen, falls die Leiste gescrollt ist
  kopf.querySelector('.tab.aktiv')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

// Unten: Navigation zwischen den Ansichten
function zeichneNavi() {
  const navi = document.getElementById('navi');
  if (!aktuelleKlasse()) { navi.replaceChildren(); return; }
  // In versteckten Ansichten bleibt der Knopf markiert, von dem man gekommen ist
  const aktiv = state.ansicht === 'person' ? state.zurueck
    : state.ansicht === 'versionen' ? 'plan' : state.ansicht;
  navi.replaceChildren(...ANSICHTEN.filter((a) => !a.versteckt).map((a) => el('button', {
    class: 'navi-knopf' + (aktiv === a.id ? ' aktiv' : ''),
    'aria-current': aktiv === a.id ? 'page' : null,
    onclick: () => { state.ansicht = a.id; state.auswahl = null; neuZeichnen(); },
  }, el('span', { class: 'navi-symbol' }, icon(a.symbol)), el('span', { text: a.name }))));
}

async function klasseWechseln(id) {
  state.klasseId = id;
  state.auswahl = null;
  if (state.ansicht === 'person') state.ansicht = state.zurueck; // Verlauf gehört zur alten Klasse
  state.versionId = null;
  await db.speichereEinstellung('letzteKlasse', id);
  neuZeichnen();
}

// Erster Start: noch keine Klasse vorhanden
function zeichneWillkommen(container) {
  container.append(el('div', { class: 'karte willkommen' },
    el('img', { class: 'logo', src: './icons/icon-192.png', alt: '' }),
    el('h2', { text: 'Willkommen!' }),
    el('p', { class: 'hinweis', text: 'In drei Schritten zu deinem ersten Sitzplan:' }),
    el('ol', { class: 'schritte' },
      el('li', { text: 'Klasse anlegen' }),
      el('li', { text: 'Sitzplätze im Raum festlegen' }),
      el('li', { text: 'SuS eintragen und auf die Plätze setzen' }),
    ),
    el('button', { class: 'knopf primaer breit', onclick: neueKlasseDialog }, icon('plus'), 'Erste Klasse anlegen'),
    el('p', { class: 'hinweis', text: 'Alle Daten bleiben ausschließlich auf diesem Gerät.' }),
    el('div', { class: 'trenner' }),
    el('p', { class: 'hinweis', text: 'Schon Daten auf einem anderen Gerät? Dort unter „Mehr“ ein Backup erstellen und hier einspielen.' }),
    el('button', { class: 'knopf breit', onclick: backupEinspielen }, icon('hinauf'), 'Backup einspielen'),
  ));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  await sperren();          // PIN abfragen (nur wenn eine gesetzt ist)
  automatischSperren();     // nach einer Pause im Hintergrund wieder sperren

  state.klassen = await db.ladeKlassen();
  const letzte = await db.ladeEinstellung('letzteKlasse');
  state.klasseId = state.klassen.some((k) => k.id === letzte) ? letzte : (state.klassen[0]?.id ?? null);
  state.lehrersicht = await db.ladeEinstellung('lehrersicht', true);
  state.modus = 'unterricht'; // beim Start immer gesperrt
  state.backupFaellig = await backupErinnerung(state.klassen.length);

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
  // Versionsanzeige oben rechts füllen (beim allerersten Start erst, wenn der Cache angelegt ist)
  ladeAppVersion();
  navigator.serviceWorker.ready.then(ladeAppVersion);
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
