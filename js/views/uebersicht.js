// uebersicht.js – Klassenübersicht: eine Zeile pro Person mit den Summen je Kategorie,
// rechts dazu eine Spalte pro Leistungskontrolle (Test, Heftkontrolle …) mit der Bewertung.
// Hilfreich für die Leistungsbeurteilung. Spaltenköpfe antippen = sortieren,
// Zeile antippen = Verlauf der Person, Bewertung antippen = Leistungskontrolle bearbeiten.

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, tipp, avatar } from '../util/ui.js';
import { icon } from '../util/icons.js';
import { zeitraumGrenzen, summen, summeText, ZEITRAEUME, leistungskontrollen, datumKurz } from '../util/beobachtung.js';
import { csvEintraege, csvUebersicht } from '../util/sicherung.js';
import { filterLeiste } from './person.js';
import { leistungDialog } from './leistung.js';

export async function zeichneUebersicht(container) {
  const klasse = aktuelleKlasse();
  const f = state.filter;
  const { ab, bis } = zeitraumGrenzen(f.zeitraum, new Date(), f.von, f.bis);
  const [personen, beobachtungen, alleButtons] = await Promise.all([
    db.ladePersonen(klasse.id),
    db.ladeBeobachtungenKlasse(klasse.id, ab, bis),
    db.ladeSchnellbuttons(),
  ]);

  container.append(filterLeiste());

  if (personen.length === 0) {
    container.append(tipp('Noch keine SuS in dieser Klasse.', 'SuS eintragen',
      () => { state.ansicht = 'schueler'; app.neuZeichnen(); }));
    return;
  }

  // Gelöschte Schnellbuttons nur zeigen, wenn es im Zeitraum Einträge dazu gibt
  const vorhanden = new Set(beobachtungen.map((b) => b.kategorie));
  const buttons = alleButtons.filter((s) => !s.geloescht || vorhanden.has('sb-' + s.id));
  // Leistungskontrollen im Zeitraum, älteste zuerst (= links)
  const lks = leistungskontrollen(beobachtungen);

  // ---------- Werte pro Person berechnen ----------
  const nachPerson = new Map(personen.map((p) => [p.id, []]));
  for (const b of beobachtungen) nachPerson.get(b.personId)?.push(b);

  const zeilen = personen.map((p) => {
    const s = summen(nachPerson.get(p.id));
    const w = { name: `${p.nachname} ${p.vorname}`.trim() };
    for (const k of ['mitarbeit', 'verhalten']) {
      w[k + '-plus'] = s[k]?.plus || 0;
      w[k + '-minus'] = s[k]?.minus || 0;
      w[k + '-summe'] = s[k]?.summe || 0;
    }
    w['mitarbeit-passt'] = s.mitarbeit?.neutral || 0; // Mitarbeit ✓
    for (const sb of buttons) w['sb-' + sb.id] = s['sb-' + sb.id]?.anzahl || 0;
    w.abwesend = s.abwesend?.anzahl || 0;
    w.notiz = s.notiz?.anzahl || 0;
    for (const lk of lks) w['lk-' + lk.id] = lk.ergebnisse.get(p.id)?.bewertung || '';
    return { person: p, w };
  });

  // ---------- Sortieren ----------
  const { spalte, absteigend } = state.sortierung;
  const istLk = spalte.startsWith('lk-');
  zeilen.sort((a, b) => {
    const x = a.w[spalte], y = b.w[spalte];
    // Leistungskontrolle: Wer (noch) keine Bewertung hat, steht immer unten
    if (istLk && !x !== !y) return x ? -1 : 1;
    const v = typeof x === 'string' ? x.localeCompare(y, 'de', { numeric: true }) : x - y;
    return (absteigend ? -v : v) || a.w.name.localeCompare(b.w.name, 'de');
  });

  // ---------- Tabelle ----------
  // Spaltenkopf, der beim Antippen sortiert
  const kopf = (id, text, { klasse = '', ...extra } = {}) => el('th', {
    ...extra,
    class: 'sortierbar' + (spalte === id ? ' sortiert' : '') + (klasse ? ' ' + klasse : ''),
    'aria-sort': spalte === id ? (absteigend ? 'descending' : 'ascending') : null,
    onclick: () => {
      // Zahlen zuerst absteigend (die meisten oben), Namen und Bewertungen aufsteigend (1, 2, 3 …)
      state.sortierung = spalte === id
        ? { spalte: id, absteigend: !absteigend }
        : { spalte: id, absteigend: id !== 'name' && !id.startsWith('lk-') };
      app.neuZeichnen();
    },
  }, text, spalte === id ? (absteigend ? ' ▾' : ' ▴') : '');

  // Kopf einer Leistungskontrolle: Art und Datum (Bezeichnung als Tooltip)
  const lkKopf = (lk, i) => kopf('lk-' + lk.id,
    [el('span', { class: 'lk-art', text: lk.art }), el('small', { text: datumKurz(lk.zeitpunkt) })],
    { klasse: 'lk-kopf' + (i === 0 ? ' lk-start' : ''), title: `${lkName(lk)} (${datumKurz(lk.zeitpunkt, true)})` });

  const thead = el('thead', {},
    el('tr', {},
      kopf('name', 'Name', { rowspan: 2 }),
      el('th', { colspan: 4, class: 'gruppe', text: 'Mitarbeit' }),
      el('th', { colspan: 3, class: 'gruppe', text: 'Verhalten' }),
      buttons.map((sb) => kopf('sb-' + sb.id, sb.name, { rowspan: 2 })),
      kopf('abwesend', 'Abwesend', { rowspan: 2 }),
      kopf('notiz', 'Notizen', { rowspan: 2 }),
      lks.length ? el('th', { colspan: lks.length, class: 'gruppe lk-start', text: 'Leistungskontrollen' }) : null,
    ),
    el('tr', {},
      kopf('mitarbeit-plus', '+'), kopf('mitarbeit-passt', '✓', { title: 'passt, nichts Auffälliges' }),
      kopf('mitarbeit-minus', '−'), kopf('mitarbeit-summe', 'Σ'),
      kopf('verhalten-plus', '+'), kopf('verhalten-minus', '−'), kopf('verhalten-summe', 'Σ'),
      lks.map(lkKopf),
    ),
  );
  // Die Name-Spalte braucht beide Klassen (sortierbar + fixiert)
  thead.querySelector('th').classList.add('name-spalte');

  const zahl = (n, art = '') => el('td', { class: 'zahl ' + art + (n === 0 ? ' null' : '') }, String(n));
  const summeZelle = (n) => el('td', { class: 'zahl summe ' + (n > 0 ? 'positiv' : n < 0 ? 'negativ' : 'null') },
    summeText(n));
  // Bewertung einer Leistungskontrolle (leer = nicht bewertet): antippen = Kontrolle bearbeiten statt Verlauf
  const lkZelle = (lk, i, person, text) => el('td', {
    class: 'lk' + (i === 0 ? ' lk-start' : ''),
    title: `${lkName(lk)}: ${text || 'nicht bewertet'}\nAntippen = Bewertung ändern`,
    onclick: async (e) => {
      e.stopPropagation();
      if (await leistungDialog({ klasseId: klasse.id, lkId: lk.id, fokus: person.id })) app.neuZeichnen();
    },
  }, text);

  const tbody = el('tbody', {}, zeilen.map(({ person, w }) => el('tr', {
    tabindex: 0,
    onclick: () => oeffnePerson(person.id),
    onkeydown: (e) => { if (e.key === 'Enter') oeffnePerson(person.id); },
  },
    el('th', { scope: 'row', class: 'name-spalte' },
      el('span', { class: 'name-zelle' }, avatar(person), el('span', { text: w.name }))),
    zahl(w['mitarbeit-plus'], 'positiv'), zahl(w['mitarbeit-passt'], 'passt'),
    zahl(w['mitarbeit-minus'], 'negativ'), summeZelle(w['mitarbeit-summe']),
    zahl(w['verhalten-plus'], 'positiv'), zahl(w['verhalten-minus'], 'negativ'), summeZelle(w['verhalten-summe']),
    buttons.map((sb) => zahl(w['sb-' + sb.id])),
    zahl(w.abwesend),
    zahl(w.notiz),
    lks.map((lk, i) => lkZelle(lk, i, person, w['lk-' + lk.id])),
  )));

  container.append(
    el('div', { class: 'leiste uebersicht-kopf' },
      el('p', { class: 'unterzeile', text: `${beobachtungen.length} Einträge · ${personen.length} SuS` }),
      el('button', {
        class: 'knopf klein primaer',
        onclick: async () => { if (await leistungDialog({ klasseId: klasse.id })) app.neuZeichnen(); },
      }, icon('plus'), 'Leistungskontrolle eintragen'),
    ),
    el('div', { class: 'tabelle-huelle', dataset: { scroll: 'uebersicht' } },
      el('table', { class: 'tabelle' }, thead, tbody)),
    el('p', {
      class: 'hinweis',
      text: 'Spaltenkopf antippen = sortieren · Zeile antippen = Verlauf'
        + (lks.length ? ' · Bewertung antippen = ändern' : ''),
    }),
    el('div', { class: 'leiste fuellen' },
      el('button', {
        class: 'knopf klein',
        onclick: () => csvUebersicht(klasse,
          ['Nachname', 'Vorname', 'Mitarbeit +', 'Mitarbeit ✓', 'Mitarbeit −', 'Mitarbeit Summe',
            'Verhalten +', 'Verhalten −', 'Verhalten Summe', ...buttons.map((sb) => sb.name), 'Abwesend', 'Notizen',
            ...lks.map((lk) => `${lkName(lk)} (${datumKurz(lk.zeitpunkt, true)})`), 'Zeitraum'],
          zeilen.map(({ person, w }) => [person.nachname, person.vorname,
            w['mitarbeit-plus'], w['mitarbeit-passt'], w['mitarbeit-minus'], w['mitarbeit-summe'],
            w['verhalten-plus'], w['verhalten-minus'], w['verhalten-summe'],
            ...buttons.map((sb) => w['sb-' + sb.id]), w.abwesend, w.notiz,
            ...lks.map((lk) => w['lk-' + lk.id]), zeitraumName()])),
      }, icon('herunter'), 'Übersicht als CSV'),
      el('button', {
        class: 'knopf klein',
        onclick: () => csvEintraege(klasse, beobachtungen, personen, alleButtons),
      }, icon('herunter'), 'Alle Einträge als CSV'),
    ),
  );
}

// "Dieses Semester" bzw. "01.10.2026 – 08.10.2026" für die CSV-Datei
function zeitraumName() {
  const f = state.filter;
  if (f.zeitraum !== 'eigen') return ZEITRAEUME.find((z) => z.id === f.zeitraum)?.name || '';
  const de = (t) => (t ? t.split('-').reverse().join('.') : '…');
  return `${de(f.von)} – ${de(f.bis)}`;
}

// "Test – Bruchrechnung" bzw. nur "Test"
function lkName(lk) {
  return lk.titel ? `${lk.art} – ${lk.titel}` : lk.art;
}

function oeffnePerson(id) {
  state.personId = id;
  state.zurueck = 'uebersicht';
  state.ansicht = 'person';
  app.neuZeichnen();
}
