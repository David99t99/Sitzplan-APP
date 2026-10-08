// person.js – Verlauf einer Person: alle Beobachtungen chronologisch,
// filterbar nach Zeitraum und Kategorie, mit Summen. Einträge bearbeiten, löschen, nachtragen.

import { state, app } from '../state.js';
import * as db from '../db.js';
import { el, toast, zeigeDialog, feld, avatar, vollerName } from '../util/ui.js';
import {
  ZEITRAEUME, zeitraumGrenzen, imZeitraum, summen, alleKategorien, kategorieName,
  wertZeichen, summeText, tagText, uhrzeitText, fuerEingabe,
} from '../util/beobachtung.js';
import { wertKlasse } from './schnellmenue.js';

export async function zeichnePerson(container) {
  const person = await db.ladePerson(state.personId);
  if (!person) { state.ansicht = state.zurueck; return app.neuZeichnen(); }

  const [alle, schnellbuttons] = await Promise.all([
    db.ladeBeobachtungenPerson(person.id),
    db.ladeSchnellbuttons(),
  ]);
  const f = state.filter;
  const grenzen = zeitraumGrenzen(f.zeitraum, new Date(), f.von, f.bis);
  const imZeitraumListe = alle.filter((b) => imZeitraum(b, grenzen));
  const gefiltert = imZeitraumListe.filter((b) => f.kategorie === 'alle' || b.kategorie === f.kategorie);
  const s = summen(imZeitraumListe);

  // ---------- Kopf ----------
  container.append(
    el('div', { class: 'leiste' },
      el('button', {
        class: 'knopf klein', text: '‹ Zurück',
        onclick: () => { state.ansicht = state.zurueck; app.neuZeichnen(); },
      }),
    ),
    el('div', { class: 'person-kopf' },
      avatar(person),
      el('div', {},
        el('h2', { text: vollerName(person) }),
        person.notiz ? el('p', { class: 'hinweis', text: person.notiz }) : null,
      ),
    ),
    filterLeiste({ mitKategorie: true, kategorien: alleKategorien(schnellbuttons, true) }),
  );

  // ---------- Summen (immer über ALLE Kategorien des Zeitraums) ----------
  const kachel = (titel, inhalt, kategorie) => el('button', {
    class: 'kachel' + (f.kategorie === kategorie ? ' aktiv' : ''),
    title: 'Nach dieser Kategorie filtern',
    onclick: () => { f.kategorie = f.kategorie === kategorie ? 'alle' : kategorie; app.neuZeichnen(); },
  }, el('span', { class: 'kachel-titel', text: titel }), inhalt);

  const pm = (k) => {
    const x = s[k] || { plus: 0, minus: 0, summe: 0 };
    return el('span', { class: 'kachel-wert' },
      el('span', { class: 'positiv', text: '+' + x.plus }), ' ',
      el('span', { class: 'negativ', text: '−' + x.minus }), ' ',
      el('strong', { text: '= ' + summeText(x.summe) }));
  };
  const anzahl = (k) => el('span', { class: 'kachel-wert' }, el('strong', { text: String(s[k]?.anzahl || 0) }));

  container.append(el('div', { class: 'kacheln' },
    kachel('Mitarbeit', pm('mitarbeit'), 'mitarbeit'),
    kachel('Verhalten', pm('verhalten'), 'verhalten'),
    schnellbuttons.filter((sb) => !sb.geloescht || s['sb-' + sb.id])
      .map((sb) => kachel(sb.name, anzahl('sb-' + sb.id), 'sb-' + sb.id)),
    kachel('Notizen', anzahl('notiz'), 'notiz'),
  ));

  // ---------- Liste, nach Tagen gruppiert ----------
  container.append(el('div', { class: 'leiste' },
    el('h3', { class: 'wachsen', text: `${gefiltert.length} Einträge` }),
    el('button', {
      class: 'knopf klein', text: '+ Eintrag nachtragen',
      onclick: async () => {
        const neu = { personId: person.id, klasseId: person.klasseId, kategorie: 'mitarbeit', wert: 1, text: '', zeitpunkt: new Date().toISOString() };
        if (await eintragDialog(neu, schnellbuttons, true)) app.neuZeichnen();
      },
    }),
  ));

  if (gefiltert.length === 0) {
    container.append(el('p', { class: 'hinweis', text: 'Keine Einträge in diesem Zeitraum.' }));
    return;
  }

  let letzterTag = '';
  const liste = el('ul', { class: 'liste eintraege' });
  for (const b of gefiltert) {
    const t = tagText(b.zeitpunkt);
    if (t !== letzterTag) {
      liste.append(el('li', { class: 'tag-kopf', text: t }));
      letzterTag = t;
    }
    liste.append(el('li', {},
      el('button', {
        class: 'zeile eintrag',
        onclick: async () => { if (await eintragDialog({ ...b }, schnellbuttons, false)) app.neuZeichnen(); },
      },
        el('span', { class: 'eintrag-zeichen ' + wertKlasse(b.wert), text: wertZeichen(b.wert) }),
        el('span', { class: 'zeile-text' },
          el('strong', { text: kategorieName(b.kategorie, schnellbuttons) }),
          b.text ? el('small', { text: b.text }) : null,
        ),
        el('span', { class: 'eintrag-zeit', text: uhrzeitText(b.zeitpunkt) }),
      ),
    ));
  }
  container.append(liste);
}

// ---------------------------------------------------------------------------
// Filterleiste (wird auch von der Klassenübersicht verwendet)
// ---------------------------------------------------------------------------
export function filterLeiste({ mitKategorie = false, kategorien = [] } = {}) {
  const f = state.filter;
  const zeitraum = el('select', { 'aria-label': 'Zeitraum', onchange: (e) => { f.zeitraum = e.target.value; app.neuZeichnen(); } },
    ZEITRAEUME.map((z) => el('option', { value: z.id, selected: z.id === f.zeitraum, text: z.name })));

  const teile = [el('label', { class: 'feld kompakt' }, el('span', { text: 'Zeitraum' }), zeitraum)];

  if (f.zeitraum === 'eigen') {
    const datum = (wert, setze, titel) => el('label', { class: 'feld kompakt' }, el('span', { text: titel }),
      el('input', { type: 'date', value: wert, onchange: (e) => { setze(e.target.value); app.neuZeichnen(); } }));
    teile.push(datum(f.von, (v) => { f.von = v; }, 'von'), datum(f.bis, (v) => { f.bis = v; }, 'bis'));
  }

  if (mitKategorie) {
    teile.push(el('label', { class: 'feld kompakt' }, el('span', { text: 'Kategorie' }),
      el('select', { onchange: (e) => { f.kategorie = e.target.value; app.neuZeichnen(); } },
        el('option', { value: 'alle', text: 'Alle' }),
        kategorien.map((k) => el('option', { value: k.id, selected: k.id === f.kategorie, text: k.name })))));
  }
  return el('div', { class: 'filter' }, teile);
}

// ---------------------------------------------------------------------------
// Dialog: Eintrag bearbeiten oder nachtragen. Rückgabe: true, wenn etwas geändert wurde.
// ---------------------------------------------------------------------------
async function eintragDialog(b, schnellbuttons, istNeu) {
  const kategorien = alleKategorien(schnellbuttons, true)
    .filter((k) => !k.id.startsWith('sb-') || k.id === b.kategorie
      || !schnellbuttons.find((s) => 'sb-' + s.id === k.id)?.geloescht);

  const kategorie = el('select', {}, kategorien.map((k) =>
    el('option', { value: k.id, selected: k.id === b.kategorie, text: k.name })));
  const wert = el('select', {},
    el('option', { value: '1', selected: b.wert > 0, text: '+ positiv' }),
    el('option', { value: '-1', selected: b.wert < 0, text: '− negativ' }),
    el('option', { value: '0', selected: b.wert === 0, text: '• neutral (zählt nicht)' }));
  // Beim Wechsel der Kategorie den passenden Wert vorschlagen
  kategorie.addEventListener('change', () => {
    const sb = schnellbuttons.find((s) => 'sb-' + s.id === kategorie.value);
    if (sb) wert.value = String(sb.wert);
    else if (kategorie.value === 'notiz') wert.value = '0';
  });
  const zeit = el('input', { type: 'datetime-local', value: fuerEingabe(b.zeitpunkt), required: true });
  const text = el('textarea', { rows: 2, value: b.text || '', maxlength: 500 });

  const knoepfe = [{ text: 'Abbrechen' }, { text: 'Speichern', wert: 'ok', primaer: true }];
  if (!istNeu) knoepfe.unshift({ text: 'Löschen', wert: 'loeschen', gefahr: true });

  const ergebnis = await zeigeDialog({
    titel: istNeu ? 'Eintrag nachtragen' : 'Eintrag bearbeiten',
    inhalt: [feld('Kategorie', kategorie), feld('Wertung', wert), feld('Datum und Uhrzeit', zeit), feld('Notiz', text)],
    knoepfe,
  });

  if (ergebnis === 'ok') {
    b.kategorie = kategorie.value;
    b.wert = Number(wert.value);
    b.zeitpunkt = new Date(zeit.value).toISOString(); // Eingabe ist Ortszeit
    b.text = text.value.trim();
    if (istNeu) b.id = db.neueId();
    await db.speichereBeobachtung(b);
    toast(istNeu ? 'Eintrag gespeichert.' : 'Änderung gespeichert.');
    return true;
  }
  if (ergebnis === 'loeschen') {
    await db.loescheBeobachtung(b.id);
    toast('Eintrag gelöscht.', {
      knopf: 'Rückgängig', dauer: 5000,
      aktion: async () => { await db.speichereBeobachtung(b); app.neuZeichnen(); },
    });
    return true;
  }
  return false;
}
