// uebersicht.js – Klassenübersicht: eine Zeile pro Person mit den Summen je Kategorie.
// Hilfreich für die Leistungsbeurteilung. Spaltenköpfe antippen = sortieren,
// Zeile antippen = Verlauf der Person.

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, avatar } from '../util/ui.js';
import { zeitraumGrenzen, summen, summeText, ZEITRAEUME } from '../util/beobachtung.js';
import { csvEintraege, csvUebersicht } from '../util/sicherung.js';
import { filterLeiste } from './person.js';

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
    container.append(el('p', { class: 'hinweis', text: 'Noch keine SuS in dieser Klasse.' }));
    return;
  }

  // Gelöschte Schnellbuttons nur zeigen, wenn es im Zeitraum Einträge dazu gibt
  const vorhanden = new Set(beobachtungen.map((b) => b.kategorie));
  const buttons = alleButtons.filter((s) => !s.geloescht || vorhanden.has('sb-' + s.id));

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
    for (const sb of buttons) w['sb-' + sb.id] = s['sb-' + sb.id]?.anzahl || 0;
    w.notiz = s.notiz?.anzahl || 0;
    return { person: p, w };
  });

  // ---------- Sortieren ----------
  const { spalte, absteigend } = state.sortierung;
  zeilen.sort((a, b) => {
    const x = a.w[spalte], y = b.w[spalte];
    const v = typeof x === 'string' ? x.localeCompare(y, 'de') : x - y;
    return (absteigend ? -v : v) || a.w.name.localeCompare(b.w.name, 'de');
  });

  // ---------- Tabelle ----------
  // Spaltenkopf, der beim Antippen sortiert
  const kopf = (id, text, extra = {}) => el('th', {
    ...extra,
    class: 'sortierbar' + (spalte === id ? ' sortiert' : ''),
    'aria-sort': spalte === id ? (absteigend ? 'descending' : 'ascending') : null,
    onclick: () => {
      // Zahlen zuerst absteigend (die meisten oben), Namen aufsteigend
      state.sortierung = spalte === id
        ? { spalte: id, absteigend: !absteigend }
        : { spalte: id, absteigend: id !== 'name' };
      app.neuZeichnen();
    },
  }, text, spalte === id ? (absteigend ? ' ▾' : ' ▴') : '');

  const thead = el('thead', {},
    el('tr', {},
      kopf('name', 'Name', { rowspan: 2 }),
      el('th', { colspan: 3, class: 'gruppe', text: 'Mitarbeit' }),
      el('th', { colspan: 3, class: 'gruppe', text: 'Verhalten' }),
      buttons.map((sb) => kopf('sb-' + sb.id, sb.name, { rowspan: 2 })),
      kopf('notiz', 'Notizen', { rowspan: 2 }),
    ),
    el('tr', {},
      ['mitarbeit', 'verhalten'].flatMap((k) => [
        kopf(k + '-plus', '+'), kopf(k + '-minus', '−'), kopf(k + '-summe', 'Σ'),
      ]),
    ),
  );
  // Die Name-Spalte braucht beide Klassen (sortierbar + fixiert)
  thead.querySelector('th').classList.add('name-spalte');

  const zahl = (n, art = '') => el('td', { class: 'zahl ' + art + (n === 0 ? ' null' : '') }, String(n));
  const summeZelle = (n) => el('td', { class: 'zahl summe ' + (n > 0 ? 'positiv' : n < 0 ? 'negativ' : 'null') },
    summeText(n));

  const tbody = el('tbody', {}, zeilen.map(({ person, w }) => el('tr', {
    tabindex: 0,
    onclick: () => oeffnePerson(person.id),
    onkeydown: (e) => { if (e.key === 'Enter') oeffnePerson(person.id); },
  },
    el('th', { scope: 'row', class: 'name-spalte' },
      el('span', { class: 'name-zelle' }, avatar(person), el('span', { text: w.name }))),
    zahl(w['mitarbeit-plus'], 'positiv'), zahl(w['mitarbeit-minus'], 'negativ'), summeZelle(w['mitarbeit-summe']),
    zahl(w['verhalten-plus'], 'positiv'), zahl(w['verhalten-minus'], 'negativ'), summeZelle(w['verhalten-summe']),
    buttons.map((sb) => zahl(w['sb-' + sb.id])),
    zahl(w.notiz),
  )));

  container.append(
    el('p', { class: 'unterzeile', text: `${beobachtungen.length} Einträge · ${personen.length} SuS` }),
    el('div', { class: 'tabelle-huelle', dataset: { scroll: 'uebersicht' } },
      el('table', { class: 'tabelle' }, thead, tbody)),
    el('p', { class: 'hinweis', text: 'Spaltenkopf antippen = sortieren · Zeile antippen = Verlauf' }),
    el('div', { class: 'leiste' },
      el('button', {
        class: 'knopf klein', text: '⬇︎ Übersicht als CSV',
        onclick: () => csvUebersicht(klasse,
          ['Nachname', 'Vorname', 'Mitarbeit +', 'Mitarbeit −', 'Mitarbeit Summe',
            'Verhalten +', 'Verhalten −', 'Verhalten Summe', ...buttons.map((sb) => sb.name), 'Notizen',
            'Zeitraum'],
          zeilen.map(({ person, w }) => [person.nachname, person.vorname,
            w['mitarbeit-plus'], w['mitarbeit-minus'], w['mitarbeit-summe'],
            w['verhalten-plus'], w['verhalten-minus'], w['verhalten-summe'],
            ...buttons.map((sb) => w['sb-' + sb.id]), w.notiz, zeitraumName()])),
      }),
      el('button', {
        class: 'knopf klein', text: '⬇︎ Alle Einträge als CSV',
        onclick: () => csvEintraege(klasse, beobachtungen, personen, alleButtons),
      }),
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

function oeffnePerson(id) {
  state.personId = id;
  state.zurueck = 'uebersicht';
  state.ansicht = 'person';
  app.neuZeichnen();
}
