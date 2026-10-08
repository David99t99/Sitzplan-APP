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
//
// Damit der Raum auch am Handy ganz auf den Bildschirm passt, werden leere
// Spalten und Zeilen (Gänge) schmal gezeichnet. Nebeneinander liegende Tafel-
// oder Lehrertisch-Felder verschmelzen zu einem beschrifteten Block.

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, tipp, avatar, kurznamen, vollerName, zeigeDialog } from '../util/ui.js';
import { icon } from '../util/icons.js';
import {
  FELDTYPEN, feldKey, belegterBereich, anzeigeReihenfolge, sitzplaetze,
  platzieren, freigeben, aufraeumen, zufaelligVerteilen,
} from '../util/raster.js';
import { ziehbarMachen, warGeradeGezogen } from '../util/ziehen.js';
import { zeitraumGrenzen } from '../util/beobachtung.js';
import { oeffneSchnellmenue } from './schnellmenue.js';
import { versionSpeichernDialog } from './versionen.js';

const LUECKE = 5;    // Abstand zwischen den Feldern in px (muss zu --luecke in app.css passen)
const GANG = 0.35;   // Gang (Spalte/Zeile ohne Plätze): so viel von einem normalen Feld
const FLACH = 0.6;   // Spalte/Zeile, in der nur Tafel oder Tür liegen

export async function zeichnePlan(container) {
  const klasse = aktuelleKlasse();
  // plan = wer sitzt wo (gehört der Klasse), raum = wo die Plätze sind (gilt für alle Klassen im Raum)
  const [plan, raum, personen, heuteAlle] = await Promise.all([
    db.ladeAktuellenPlan(klasse.id),
    db.ladeRaum(klasse.raumId),
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
  aufraeumen(plan, raum, new Set(personNachId.keys()));
  if (Object.keys(plan.zuordnung).length !== vorher) await db.speicherePlan(plan);

  // ---------- Noch kein Raum oder keine Sitzplätze? Dann nur den nächsten Schritt zeigen ----------
  const bereich = raum && belegterBereich(raum);
  if (!bereich || sitzplaetze(raum).length === 0) {
    container.append(el('div', { class: 'karte leer-hinweis' },
      el('div', { class: 'leer-symbol' }, icon('raum')),
      el('h2', { text: raum ? 'Noch keine Sitzplätze' : 'Noch kein Raum' }),
      el('p', {
        class: 'hinweis',
        text: raum
          ? `Lege zuerst fest, wo in „${raum.name}“ Sitzplätze, Tafel und Tür sind.`
          : 'Teile dieser Klasse zuerst einen Raum zu.',
      }),
      el('button', {
        class: 'knopf primaer',
        // Mit Raum direkt in dessen Editor, sonst zur Liste der Räume
        onclick: () => { state.ansicht = 'raum'; state.raumId = raum?.id ?? null; app.neuZeichnen(); },
      }, raum ? 'Sitzplätze festlegen' : 'Raum wählen'),
    ));
    return;
  }

  const besetzt = new Set(Object.values(plan.zuordnung));
  const ohnePlatz = personen.filter((p) => !besetzt.has(p.id));
  const gewaehlt = bearbeiten ? personNachId.get(state.auswahl) : null;

  // ---------- Kopfleiste: Modus ----------
  // Zeile darunter: links Fach · Raum (Unterricht) bzw. die Anleitung (Bearbeiten),
  // rechts "Ansicht drehen". Gleiche Höhe in beiden Modi, damit das Raster nicht springt.
  let info = [klasse.fach, raum.name].filter(Boolean).join(' · ');
  if (gewaehlt) info = `${namen.get(gewaehlt.id)} ist markiert – jetzt den Platz antippen.`;
  else if (bearbeiten) info = 'Person ziehen – oder antippen und dann den Platz antippen.';
  container.append(el('div', { class: 'plan-kopf' },
    el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Modus' },
      modusKnopf('unterricht', 'unterricht', 'Unterricht'),
      modusKnopf('bearbeiten', 'stift', 'Bearbeiten'),
    ),
    el('div', { class: 'plan-info' },
      el('p', { class: 'unterzeile wachsen' + (gewaehlt ? ' akzent' : ''), text: info }),
      sichtKnopf(),
    ),
  ));

  // ---------- Das Raster ----------
  const zeilen = anzeigeReihenfolge(bereich.zMin, bereich.zMax, state.lehrersicht);
  const spalten = anzeigeReihenfolge(bereich.sMin, bereich.sMax, state.lehrersicht);
  // Größe jeder Spalte/Zeile als Faktor: volle Größe brauchen nur Sitzplätze und Lehrertisch.
  // Eine Tafel, die quer über einen Gang reicht, macht den Gang NICHT breiter.
  const braucht = (typen) => typen.some((t) => t === 'sitz' || t === 'pult');
  const spaltenSpuren = spalten.map((s) => {
    const typen = zeilen.map((z) => raum.felder[feldKey(z, s)]);
    return braucht(typen) ? 1 : typen.includes('tuer') ? FLACH : GANG;
  });
  const zeilenSpuren = zeilen.map((z) => {
    const typen = spalten.map((s) => raum.felder[feldKey(z, s)]);
    return braucht(typen) ? 1 : typen.some(Boolean) ? FLACH : GANG;
  });
  const spuren = (liste) => liste.map((f) => (f === 1 ? 'var(--zelle)' : `calc(var(--zelle) * ${f})`)).join(' ');

  const raster = el('div', {
    class: 'raster plan' + (bearbeiten ? ' bearbeiten' : '') + (gewaehlt ? ' waehlt' : ''),
    style: {
      '--zelle': zellGroesse({
        spalten: spaltenSpuren, zeilen: zeilenSpuren, min: 44, max: 110,
        reserve: bearbeiten ? 330 : 140, // Platz für Umschalter, Infozeile (+ Aktionen und Leiste)
      }) + 'px',
      'grid-template-columns': spuren(spaltenSpuren),
      'grid-template-rows': spuren(zeilenSpuren),
    },
  });
  zeilen.forEach((z, zi) => {
    for (let si = 0; si < spalten.length; si++) {
      const key = feldKey(z, spalten[si]);
      const typ = raum.felder[key];
      if (!typ) continue;
      // Tafel/Lehrertisch/Tür: gleiche Felder nebeneinander zu EINEM Block zusammenfassen
      let breite = 1;
      if (typ !== 'sitz') {
        while (raum.felder[feldKey(z, spalten[si + breite])] === typ) breite++;
      }
      const feld = typ === 'sitz' ? sitz(key) : moebel(typ, breite);
      feld.style.gridRow = String(zi + 1);
      feld.style.gridColumn = `${si + 1} / span ${breite}`;
      raster.append(feld);
      si += breite - 1;
    }
  });
  container.append(el('div', { class: 'raster-huelle', dataset: { scroll: 'plan' } }, raster));

  // ---------- Unter dem Raster ----------
  if (bearbeiten) {
    const aktion = (symbol, text, onclick) =>
      el('button', { class: 'werkzeug', onclick }, icon(symbol), el('span', { text }));
    container.append(
      el('div', { class: 'werkzeuge drei' },
        aktion('wuerfel', 'Zufällig verteilen', zufall),
        aktion('merken', 'Version speichern', versionSpeichernDialog),
        aktion('verlauf', 'Versionen', () => { state.ansicht = 'versionen'; state.auswahl = null; app.neuZeichnen(); }),
      ),
      leisteOhnePlatz(),
    );
    return;
  }

  // Unterricht: Wenn noch etwas fehlt, den nächsten Schritt anbieten
  if (personen.length === 0) {
    container.append(tipp('Noch keine SuS in dieser Klasse.', 'SuS eintragen',
      () => { state.ansicht = 'schueler'; app.neuZeichnen(); }));
  } else if (besetzt.size === 0) {
    container.append(tipp('Noch niemand hat einen Platz.', 'Plätze zuweisen',
      () => { state.modus = 'bearbeiten'; app.neuZeichnen(); }));
  } else if (heuteAlle.length === 0) {
    container.append(el('p', { class: 'unterzeile', text: 'Person antippen, um Mitarbeit oder Verhalten einzutragen.' }));
  }

  if (ohnePlatz.length > 0) {
    // Auch SuS ohne Platz sollen im Unterricht Einträge bekommen können
    container.append(el('section', { class: 'ohne-platz' },
      el('div', { class: 'ohne-platz-kopf' }, el('h3', { text: `Ohne Platz (${ohnePlatz.length})` })),
      el('div', { class: 'chips' }, ohnePlatz.map((p) => el('button', {
        class: 'chip',
        onclick: () => oeffneSchnellmenue(p, heute.get(p.id)),
      }, avatar(p), el('span', { text: namen.get(p.id) }), marken(p.id)))),
    ));
  }

  // ======================= Hilfsfunktionen ==================================

  // Ein Sitzplatz (frei oder besetzt)
  function sitz(key) {
    const person = personNachId.get(plan.zuordnung[key]);
    const feld = el('div', {
      class: 'zelle sitz'
        + (person ? ' besetzt' : '')
        + (person && state.auswahl === person.id ? ' ausgewaehlt' : ''),
      dataset: { ziel: 'sitz', key },
      onclick: () => sitzAntippen(key),
    });
    if (!person) return feld;

    feld.append(avatar(person), el('span', { class: 'name', text: namen.get(person.id) }));
    if (bearbeiten) {
      ziehbarMachen(feld, { onDrop: (ziel) => fallenLassen(person.id, ziel) });
    } else {
      const zaehler = marken(person.id);
      if (zaehler) feld.append(zaehler);
      // Am Laptop auch mit Tab + Enter erreichbar
      feld.setAttribute('role', 'button');
      feld.setAttribute('tabindex', '0');
      feld.setAttribute('aria-label', vollerName(person));
      feld.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sitzAntippen(key); }
      });
    }
    return feld;
  }

  // Tafel, Lehrertisch oder Tür ("breite" = Anzahl der zusammengefassten Felder)
  function moebel(typ, breite) {
    if (typ === 'tuer') return el('div', { class: 'zelle tuer', title: FELDTYPEN.tuer.name }, icon('tuer'));
    const text = breite > 1 ? FELDTYPEN[typ].name : FELDTYPEN[typ].kurz;
    return el('div', { class: 'zelle ' + typ }, el('span', { class: 'moebel-text', text }));
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

  // Bearbeiten: die Leiste "Ohne Platz". Sie bleibt unten am Bildschirm stehen.
  function leisteOhnePlatz() {
    // Ist eine SITZENDE Person markiert, wird die Leiste zur Ablage "vom Platz nehmen"
    const ablage = gewaehlt && besetzt.has(gewaehlt.id);
    let inhalt;
    if (ohnePlatz.length > 0) {
      inhalt = el('div', { class: 'chips reihe', dataset: { scroll: 'ohne-platz' } }, ohnePlatz.map(chip));
    } else if (personen.length === 0) {
      inhalt = tipp('Noch keine SuS in dieser Klasse.', 'SuS eintragen',
        () => { state.ansicht = 'schueler'; app.neuZeichnen(); });
    } else if (!ablage) {
      inhalt = el('p', { class: 'hinweis', text: 'Alle haben einen Platz. Zum Entfernen eine Person hierher ziehen.' });
    }
    return el('section', {
      class: 'ohne-platz haftend' + (ablage ? ' ablage' : ''),
      dataset: { ziel: 'leiste' },
      // Antippen der Leiste, während eine sitzende Person markiert ist: Person vom Platz nehmen
      onclick: async () => {
        if (warGeradeGezogen() || !ablage) return;
        freigeben(plan, state.auswahl);
        state.auswahl = null;
        await db.speicherePlan(plan);
        app.neuZeichnen();
      },
    },
      el('div', { class: 'ohne-platz-kopf' },
        el('h3', { text: `Ohne Platz (${ohnePlatz.length})` }),
        ablage ? el('span', { class: 'hinweis', text: `Hier antippen: ${namen.get(gewaehlt.id)} vom Platz nehmen` }) : null,
      ),
      inhalt,
    );
  }

  // Kleine Zähler für heute: links rot = negative, rechts grün = positive Einträge, Punkt = Notiz
  function marken(personId) {
    const liste = heute.get(personId) || [];
    const plus = liste.filter((b) => b.wert > 0).length;
    const minus = liste.filter((b) => b.wert < 0).length;
    const notiz = liste.some((b) => b.wert === 0);
    if (!plus && !minus && !notiz) return null;
    return el('span', { class: 'marken', 'aria-label': `heute ${plus} plus, ${minus} minus` },
      el('span', { class: 'marken-seite' },
        minus ? el('span', { class: 'marke negativ', text: '−' + minus }) : null),
      el('span', { class: 'marken-seite rechts' },
        plus ? el('span', { class: 'marke positiv', text: '+' + plus }) : null,
        notiz ? el('span', { class: 'marke neutral', title: 'Notiz' }) : null),
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
    const uebrig = zufaelligVerteilen(plan, raum, personen);
    await db.speicherePlan(plan);
    state.auswahl = null;
    await app.neuZeichnen();
    toast(uebrig > 0 ? `Verteilt. ${uebrig} SuS haben keinen Platz bekommen.` : 'Zufällig verteilt.');
  }
}

// Knopf im Umschalter Unterricht/Bearbeiten
function modusKnopf(modus, symbol, text) {
  return el('button', {
    class: 'umschalter-knopf ' + modus + (state.modus === modus ? ' aktiv' : ''),
    'aria-pressed': String(state.modus === modus),
    onclick: () => { state.modus = modus; state.auswahl = null; app.neuZeichnen(); },
  }, icon(symbol), text);
}

// Umschalten Lehrersicht (Tafel unten) / Schülersicht (Tafel oben).
// Wird auch im Raum-Editor verwendet (dort nur als Symbol, die Beschriftung steht darüber).
export function sichtKnopf(nurSymbol = false) {
  return el('button', {
    class: nurSymbol ? 'knopf rund' : 'knopf klein leise',
    title: 'Ansicht um 180° drehen',
    'aria-label': nurSymbol ? 'Ansicht um 180° drehen' : null,
    onclick: async () => {
      state.lehrersicht = !state.lehrersicht;
      await db.speichereEinstellung('lehrersicht', state.lehrersicht);
      app.neuZeichnen();
    },
  }, icon('drehen'), nurSymbol ? null : (state.lehrersicht ? 'Lehrersicht' : 'Schülersicht'));
}

// Wie groß darf ein Feld sein, damit das Raster in die Breite passt?
//   spalten / zeilen: je Spalte bzw. Zeile ein Faktor (1 = volles Feld, kleiner = Gang).
// Wird "zeilen" angegeben, muss es auch in die Höhe passen (wichtig im Querformat);
// "reserve" ist der Platz in px, den Umschalter, Leisten usw. in der Höhe brauchen.
// Nie kleiner als "min" (Touch-Fläche), nie größer als "max".
export function zellGroesse({ spalten, zeilen = null, min, max, reserve = 0 }) {
  const inhalt = document.getElementById('inhalt');
  const passt = (platz, spuren) =>
    Math.floor((platz - (spuren.length - 1) * LUECKE) / spuren.reduce((summe, f) => summe + f, 0));
  // Die Ansicht ist höchstens 900 px breit (.ansicht); neben dem Raster bleiben je 6 px Rand (.raster-huelle)
  let groesse = passt(Math.min(inhalt.clientWidth, 900) - 12, spalten);
  if (zeilen) groesse = Math.min(groesse, passt(inhalt.clientHeight - reserve, zeilen));
  return Math.max(min, Math.min(max, groesse));
}
