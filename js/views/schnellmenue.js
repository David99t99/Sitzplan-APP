// schnellmenue.js – das Menü, das sich im Unterrichtsmodus beim Antippen einer Person öffnet.
//
// Ziel: ein Tipp = ein Eintrag. Nach dem Eintragen schließt sich das Menü sofort,
// unten erscheint für einige Sekunden "Rückgängig".
// Auf dem Handy erscheint es als Blatt von unten (gut mit dem Daumen erreichbar),
// am Laptop als Fenster in der Mitte.

import { state, app } from '../state.js';
import * as db from '../db.js';
import { el, toast, avatar, vollerName } from '../util/ui.js';
import { icon } from '../util/icons.js';
import { kategorieName, wertZeichen, uhrzeitText } from '../util/beobachtung.js';

// person:      die angetippte Person
// heute:       ihre Einträge von heute (für die Anzeige im Kopf)
export async function oeffneSchnellmenue(person, heute = []) {
  const schnellbuttons = (await db.ladeSchnellbuttons()).filter((s) => !s.geloescht);

  const dialog = el('dialog', { class: 'dialog blatt', 'aria-label': 'Beobachtung für ' + vollerName(person) });
  const schliessen = () => dialog.close();

  // Eintrag speichern, Menü schließen, Rückgängig anbieten
  async function eintragen(kategorie, wert, text = '') {
    schliessen();
    const b = await db.legeBeobachtungAn({ personId: person.id, klasseId: person.klasseId, kategorie, wert, text });
    await app.neuZeichnen();
    toast(`${person.vorname}: ${kategorieName(kategorie, schnellbuttons)} ${wertZeichen(wert)}`, {
      knopf: 'Rückgängig',
      dauer: 5000,
      aktion: async () => {
        await db.loescheBeobachtung(b.id);
        await app.neuZeichnen();
        toast('Eintrag entfernt.');
      },
    });
  }

  // Zeile "Mitarbeit  [ + ] [ − ]"
  const plusMinus = (kategorie) => el('div', { class: 'pm-zeile' },
    el('span', { class: 'pm-titel', text: kategorieName(kategorie, schnellbuttons) }),
    el('button', { class: 'pm plus', 'aria-label': kategorieName(kategorie, []) + ' plus', onclick: () => eintragen(kategorie, 1) }, icon('plus')),
    el('button', { class: 'pm minus', 'aria-label': kategorieName(kategorie, []) + ' minus', onclick: () => eintragen(kategorie, -1) }, icon('minus')),
  );

  // Notiz: Enter oder Knopf speichert
  const notiz = el('input', { type: 'text', placeholder: 'Kurze Notiz …', enterkeyhint: 'done', maxlength: 200 });
  const notizSpeichern = () => {
    const text = notiz.value.trim();
    if (text) eintragen('notiz', 0, text);
  };
  notiz.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); notizSpeichern(); } });

  // Heutige Einträge als kleine Liste (die letzten zuerst)
  const heuteListe = heute.length
    ? el('p', { class: 'heute-liste' },
      'Heute: ',
      heute.slice(0, 6).map((b) => el('span', { class: 'heute-eintrag ' + wertKlasse(b.wert) },
        `${uhrzeitText(b.zeitpunkt)} ${kategorieName(b.kategorie, schnellbuttons)} ${wertZeichen(b.wert)}`)),
      heute.length > 6 ? ` … (+${heute.length - 6})` : '')
    : el('p', { class: 'heute-liste', text: 'Heute noch keine Einträge.' });

  dialog.append(el('div', { class: 'blatt-inhalt' },
    // Kopf: Foto, Name, Verlauf, Schließen
    el('div', { class: 'blatt-kopf' },
      avatar(person),
      el('div', { class: 'blatt-name' },
        el('strong', { text: vollerName(person) }),
        person.notiz ? el('small', { text: person.notiz }) : null,
      ),
      el('button', {
        class: 'knopf klein',
        onclick: () => {
          schliessen();
          state.personId = person.id;
          state.zurueck = 'plan';
          state.ansicht = 'person';
          app.neuZeichnen();
        },
      }, icon('verlauf'), 'Verlauf'),
      el('button', { class: 'knopf rund leise', 'aria-label': 'Schließen', onclick: schliessen }, icon('x')),
    ),
    heuteListe,
    plusMinus('mitarbeit'),
    plusMinus('verhalten'),
    schnellbuttons.length ? el('div', { class: 'sb-raster' },
      schnellbuttons.map((s) => el('button', {
        class: 'knopf sb ' + wertKlasse(s.wert),
        text: s.name,
        onclick: () => eintragen('sb-' + s.id, s.wert),
      })),
    ) : null,
    el('div', { class: 'notiz-zeile' },
      notiz,
      el('button', { class: 'knopf', text: 'Notieren', onclick: notizSpeichern }),
    ),
  ));

  // Tippen auf den abgedunkelten Hintergrund schließt das Menü
  dialog.addEventListener('click', (e) => { if (e.target === dialog) schliessen(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  // Kein automatischer Fokus aufs Notizfeld (sonst springt am iPhone die Tastatur auf)
  dialog.querySelector('.knopf.rund').focus();
}

export function wertKlasse(wert) {
  return wert > 0 ? 'positiv' : wert < 0 ? 'negativ' : 'neutral';
}
