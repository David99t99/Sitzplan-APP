// plan.js – die Hauptansicht: der Sitzplan der Klasse.
//
// Zwei Modi:
//   Unterricht  – gesperrt, nichts lässt sich verschieben. Antippen öffnet das Schnellmenü
//                 für Beobachtungen; am Platz stehen die Zähler von heute.
//   Bearbeiten  – SuS auf Plätze setzen, tauschen, zufällig verteilen
//
// Zuweisen geht auf zwei Arten:
//   a) Ziehen: Person mit dem Finger auf einen Platz ziehen
//   b) Antippen: erst Person antippen (wird markiert), dann den Platz

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, avatar, kurznamen, zeigeDialog } from '../util/ui.js';
import {
  FELDTYPEN, feldKey, belegterBereich, anzeigeReihenfolge,
  platzieren, freigeben, aufraeumen, zufaelligVerteilen,
} from '../util/raster.js';
import { ziehbarMachen, warGeradeGezogen } from '../util/ziehen.js';
import { zeitraumGrenzen } from '../util/beobachtung.js';
import { oeffneSchnellmenue } from './schnellmenue.js';
import { versionSpeichernDialog } from './versionen.js';

const LUECKE = 4; // Abstand zwischen den Feldern in px (muss zu --luecke in app.css passen)

export async function zeichnePlan(container) {
  const klasse = aktuelleKlasse();
  const [plan, personen, heuteAlle] = await Promise.all([
    db.ladeAktuellenPlan(klasse.id),
    db.ladePersonen(klasse.id),
    db.ladeBeobachtungenKlasse(klasse.id, zeitraumGrenzen('heute').ab),
  ]);
  // Heutige Einträge nach Person sortiert: Map personId -> [Einträge]
  const heute = new Map();
  for (const b of heuteAlle) {
    if (!heute.has(b.personId)) heute.set(b.personId, []);
    heute.get(b.personId).push(b);
  }
  const bearbeiten = state.modus === 'bearbeiten';
  const personNachId = new Map(personen.map((p) => [p.id, p]));
  const namen = kurznamen(personen);

  // Verwaiste Zuordnungen entfernen (gelöschte Person / Platz existiert nicht mehr)
  const vorher = Object.keys(plan.zuordnung).length;
  aufraeumen(plan, new Set(personNachId.keys()));
  if (Object.keys(plan.zuordnung).length !== vorher) await db.speicherePlan(plan);

  // ---------- Kopfleiste: Modus + Sicht ----------
  container.append(
    el('div', { class: 'leiste' },
      el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Modus' },
        modusKnopf('unterricht', '🔒 Unterricht'),
        modusKnopf('bearbeiten', '✏️ Bearbeiten'),
      ),
      sichtKnopf(),
    ),
  );

  // Kleine Infozeile (Fach · Raum)
  const info = [klasse.fach, klasse.raum && `Raum ${klasse.raum}`].filter(Boolean).join(' · ');
  if (info) container.append(el('p', { class: 'unterzeile', text: info }));

  // ---------- Noch keine Sitzplätze? ----------
  const bereich = belegterBereich(plan);
  if (!bereich) {
    container.append(el('div', { class: 'karte leer-hinweis' },
      el('p', { text: 'Für diese Klasse sind noch keine Sitzplätze festgelegt.' }),
      el('button', {
        class: 'knopf primaer', text: 'Sitzplätze festlegen',
        onclick: () => { state.ansicht = 'raum'; app.neuZeichnen(); },
      }),
    ));
    return;
  }

  // ---------- Das Raster ----------
  const zeilen = anzeigeReihenfolge(bereich.zMin, bereich.zMax, state.lehrersicht);
  const spalten = anzeigeReihenfolge(bereich.sMin, bereich.sMax, state.lehrersicht);
  const raster = el('div', {
    class: 'raster' + (bearbeiten ? ' bearbeiten' : ''),
    style: { '--spalten': spalten.length, '--zelle': zellGroesse(spalten.length, 44, 110, zeilen.length) + 'px' },
  });
  for (const z of zeilen) {
    for (const s of spalten) raster.append(zelle(feldKey(z, s)));
  }
  container.append(el('div', { class: 'raster-huelle', dataset: { scroll: 'plan' } }, raster));

  // ---------- Bearbeitungsmodus: Hinweis, Zufall, Leiste "Ohne Platz" ----------
  const besetzt = new Set(Object.values(plan.zuordnung));
  const ohnePlatz = personen.filter((p) => !besetzt.has(p.id));

  if (bearbeiten) {
    container.append(
      el('p', {
        class: 'hinweis',
        text: 'Person ziehen – oder antippen und dann den Platz antippen. Auf einen besetzten Platz = tauschen.',
      }),
      el('div', { class: 'leiste' },
        el('button', { class: 'knopf', text: '🎲 Zufällig verteilen', onclick: zufall }),
        el('button', { class: 'knopf', text: '💾 Version speichern', onclick: versionSpeichernDialog }),
        el('button', {
          class: 'knopf', text: '🕘 Versionen',
          onclick: () => { state.ansicht = 'versionen'; state.auswahl = null; app.neuZeichnen(); },
        }),
      ),
      leisteOhnePlatz(),
    );
  } else if (ohnePlatz.length > 0) {
    // Auch SuS ohne Platz sollen im Unterricht Einträge bekommen können
    container.append(el('section', { class: 'ohne-platz' },
      el('h3', { text: `Ohne Platz (${ohnePlatz.length})` }),
      el('div', { class: 'chips' }, ohnePlatz.map((p) => el('button', {
        class: 'chip',
        onclick: () => oeffneSchnellmenue(p, heute.get(p.id)),
      }, avatar(p), el('span', { text: namen.get(p.id) }), marken(p.id)))),
    ));
  }

  // ======================= Hilfsfunktionen ==================================

  // Ein Feld des Rasters
  function zelle(key) {
    const typ = plan.felder[key];
    if (!typ) return el('div', { class: 'zelle leer' });
    if (typ !== 'sitz') return el('div', { class: 'zelle ' + typ, text: FELDTYPEN[typ].symbol });

    const person = personNachId.get(plan.zuordnung[key]);
    const feld = el('div', {
      class: 'zelle sitz'
        + (person ? ' besetzt' : '')
        + (person && state.auswahl === person.id ? ' ausgewaehlt' : ''),
      dataset: { ziel: 'sitz', key },
      onclick: () => sitzAntippen(key),
    });
    if (person) {
      feld.append(avatar(person), el('span', { class: 'name', text: namen.get(person.id) }));
      if (!bearbeiten) feld.append(marken(person.id));
      if (bearbeiten) ziehbarMachen(feld, { onDrop: (ziel) => fallenLassen(person.id, ziel) });
    }
    return feld;
  }

  async function sitzAntippen(key) {
    if (warGeradeGezogen()) return;
    const personId = plan.zuordnung[key];

    if (!bearbeiten) {
      if (personId) oeffneSchnellmenue(personNachId.get(personId), heute.get(personId));
      return;
    }

    if (state.auswahl) {
      if (state.auswahl !== personId) {
        platzieren(plan, state.auswahl, key);
        await db.speicherePlan(plan);
      }
      state.auswahl = null;
    } else if (personId) {
      state.auswahl = personId; // Person markieren, als Nächstes den Zielplatz antippen
    }
    app.neuZeichnen();
  }

  async function fallenLassen(personId, ziel) {
    if (!ziel) return;
    if (ziel.dataset.ziel === 'sitz') platzieren(plan, personId, ziel.dataset.key);
    else if (ziel.dataset.ziel === 'leiste') freigeben(plan, personId);
    else return;
    state.auswahl = null;
    await db.speicherePlan(plan);
    app.neuZeichnen();
  }

  function leisteOhnePlatz() {
    let inhalt;
    if (ohnePlatz.length > 0) {
      inhalt = el('div', { class: 'chips' }, ohnePlatz.map(chip));
    } else {
      inhalt = el('p', {
        class: 'hinweis',
        text: personen.length ? 'Alle haben einen Platz. ✓' : 'Noch keine SuS – lege sie unter „SuS“ an.',
      });
    }
    return el('section', {
      class: 'ohne-platz',
      dataset: { ziel: 'leiste' },
      // Antippen der Leiste, während eine sitzende Person markiert ist: Person vom Platz nehmen
      onclick: async () => {
        if (warGeradeGezogen() || !state.auswahl || !besetzt.has(state.auswahl)) return;
        freigeben(plan, state.auswahl);
        state.auswahl = null;
        await db.speicherePlan(plan);
        app.neuZeichnen();
      },
    }, el('h3', { text: `Ohne Platz (${ohnePlatz.length})` }), inhalt);
  }

  // Kleine Zähler für heute: grün = positive, rot = negative Einträge, Punkt = Notiz
  function marken(personId) {
    const liste = heute.get(personId) || [];
    const plus = liste.filter((b) => b.wert > 0).length;
    const minus = liste.filter((b) => b.wert < 0).length;
    const notiz = liste.some((b) => b.wert === 0);
    return el('span', { class: 'marken', 'aria-label': `heute ${plus} plus, ${minus} minus` },
      plus ? el('span', { class: 'marke positiv', text: '+' + plus }) : null,
      minus ? el('span', { class: 'marke negativ', text: '−' + minus }) : null,
      notiz ? el('span', { class: 'marke neutral', text: '•' }) : null,
    );
  }

  // Eine Person in der Leiste "Ohne Platz"
  function chip(person) {
    const c = el('div', {
      class: 'chip' + (state.auswahl === person.id ? ' ausgewaehlt' : ''),
      onclick: (e) => {
        e.stopPropagation();
        if (warGeradeGezogen()) return;
        state.auswahl = state.auswahl === person.id ? null : person.id;
        app.neuZeichnen();
      },
    }, avatar(person), el('span', { text: namen.get(person.id) }));
    ziehbarMachen(c, { onDrop: (ziel) => fallenLassen(person.id, ziel) });
    return c;
  }

  async function zufall() {
    // Vorher fragen – und anbieten, die bisherige Sitzordnung als Version zu sichern
    const sichern = el('input', { type: 'checkbox', checked: Object.keys(plan.zuordnung).length > 0 });
    const ergebnis = await zeigeDialog({
      titel: 'Zufällig verteilen',
      inhalt: [
        el('p', { text: 'Alle SuS werden zufällig neu auf die Sitzplätze verteilt.' }),
        el('label', { class: 'haken' }, sichern, el('span', { text: 'Bisherige Sitzordnung vorher als Version speichern' })),
      ],
      knoepfe: [{ text: 'Abbrechen' }, { text: 'Verteilen', wert: 'ok', primaer: true }],
    });
    if (ergebnis !== 'ok') return;
    if (sichern.checked) await db.speichereVersion(plan, 'Vor Zufallsverteilung');
    const uebrig = zufaelligVerteilen(plan, personen);
    await db.speicherePlan(plan);
    state.auswahl = null;
    await app.neuZeichnen();
    toast(uebrig > 0 ? `Verteilt. ${uebrig} SuS haben keinen Platz bekommen.` : 'Zufällig verteilt.');
  }
}

// Knopf im Umschalter Unterricht/Bearbeiten
function modusKnopf(modus, text) {
  return el('button', {
    class: 'umschalter-knopf' + (state.modus === modus ? ' aktiv' : ''),
    'aria-pressed': String(state.modus === modus),
    text,
    onclick: () => { state.modus = modus; state.auswahl = null; app.neuZeichnen(); },
  });
}

// Umschalten Lehrersicht (Tafel unten) / Schülersicht (Tafel oben).
// Wird auch im Raum-Editor verwendet.
export function sichtKnopf() {
  return el('button', {
    class: 'knopf klein',
    title: 'Ansicht drehen',
    text: state.lehrersicht ? '⇅ Lehrer' : '⇅ Schüler',
    onclick: async () => {
      state.lehrersicht = !state.lehrersicht;
      await db.speichereEinstellung('lehrersicht', state.lehrersicht);
      app.neuZeichnen();
    },
  });
}

// Wie groß darf ein Feld sein, damit das Raster in die Breite passt?
// Wird anzahlZeilen angegeben, muss es auch in die Höhe passen (wichtig im Querformat).
// Nie kleiner als "min" (Touch-Fläche), nie größer als "max".
export function zellGroesse(anzahlSpalten, min, max, anzahlZeilen = 0) {
  const inhalt = document.getElementById('inhalt');
  const breite = inhalt.clientWidth - 30; // Ränder der Ansicht (2 × 12 px) + Rand des Rasters
  let passend = Math.floor((breite - (anzahlSpalten - 1) * LUECKE) / anzahlSpalten);
  if (anzahlZeilen) {
    const hoehe = inhalt.clientHeight - 110; // Platz für Modus-Leiste und Infozeile
    passend = Math.min(passend, Math.floor((hoehe - (anzahlZeilen - 1) * LUECKE) / anzahlZeilen));
  }
  return Math.max(min, Math.min(max, passend));
}
