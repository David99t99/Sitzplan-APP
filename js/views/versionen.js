// versionen.js – frühere Sitzordnungen einer Klasse ansehen, wiederherstellen, löschen.

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, zeigeDialog, bestaetigen, feld, kurznamen } from '../util/ui.js';
import { icon } from '../util/icons.js';
import { feldKey, belegterBereich, anzeigeReihenfolge, ohneSitzplatz } from '../util/raster.js';
import { datumText } from '../util/beobachtung.js';

export async function zeichneVersionen(container) {
  const klasse = aktuelleKlasse();
  const [versionen, personen, raum] = await Promise.all([
    db.ladeVersionen(klasse.id),
    db.ladePersonen(klasse.id),
    db.ladeRaum(klasse.raumId),
  ]);
  const personNachId = new Map(personen.map((p) => [p.id, p]));
  const namen = kurznamen(personen);

  container.append(
    el('div', { class: 'leiste' },
      el('button', {
        class: 'knopf klein',
        onclick: () => { state.ansicht = 'plan'; state.versionId = null; app.neuZeichnen(); },
      }, icon('links'), 'Zurück'),
      el('h2', { class: 'wachsen', text: 'Frühere Sitzordnungen' }),
    ),
    el('div', { class: 'leiste fuellen' },
      el('button', {
        class: 'knopf primaer',
        onclick: async () => {
          if (await versionSpeichernDialog()) app.neuZeichnen();
        },
      }, icon('merken'), 'Aktuelle Sitzordnung speichern'),
    ),
  );

  if (versionen.length === 0) {
    container.append(el('p', { class: 'hinweis', text: 'Noch keine gespeicherten Versionen. Speichere die Sitzordnung, bevor du umsetzt – dann kannst du später zurück.' }));
    return;
  }

  const liste = el('ul', { class: 'liste' });
  for (const v of versionen) {
    const offen = state.versionId === v.id;
    const anzahl = Object.values(v.zuordnung).filter((id) => personNachId.has(id)).length;
    liste.append(el('li', {},
      el('button', {
        class: 'zeile',
        'aria-expanded': String(offen),
        onclick: () => { state.versionId = offen ? null : v.id; app.neuZeichnen(); },
      },
        el('span', { class: 'zeile-text' },
          el('strong', { text: datumText(v.datum) }),
          el('small', { text: (v.bezeichnung ? v.bezeichnung + ' · ' : '') + `${anzahl} SuS` }),
        ),
        el('span', { class: 'pfeil' }, icon(offen ? 'unten' : 'rechts')),
      ),
      offen ? el('div', { class: 'version-details' },
        vorschau(v, personNachId, namen),
        el('div', { class: 'leiste fuellen' },
          el('button', {
            class: 'knopf primaer', text: 'Wiederherstellen',
            onclick: async () => {
              // Das Raster gehört dem Raum: Plätze von damals, die es heute nicht gibt, bleiben leer
              const fehlen = ohneSitzplatz(v.zuordnung, raum).filter((key) => personNachId.has(v.zuordnung[key])).length;
              if (!await bestaetigen({
                titel: 'Sitzordnung wiederherstellen?',
                text: 'Die aktuelle Sitzordnung wird vorher automatisch als Version gespeichert.'
                  + (fehlen ? `\nIm heutigen Raum gibt es nicht alle Plätze von damals. Ohne Platz: ${fehlen} SuS.` : ''),
                knopf: 'Wiederherstellen',
              })) return;
              await db.stelleVersionWiederHer(v);
              state.versionId = null;
              state.ansicht = 'plan';
              await app.neuZeichnen();
              toast('Sitzordnung wiederhergestellt.');
            },
          }),
          el('button', {
            class: 'knopf gefahr-leise', text: 'Löschen',
            onclick: async () => {
              if (!await bestaetigen({ titel: 'Diese Version löschen?', knopf: 'Löschen', gefahr: true })) return;
              await db.loescheVersion(v.id);
              state.versionId = null;
              app.neuZeichnen();
            },
          }),
        ),
      ) : null,
    ));
  }
  container.append(liste);
}

// Dialog: Bezeichnung eingeben und den aktuellen Plan als Version speichern
export async function versionSpeichernDialog() {
  const klasse = aktuelleKlasse();
  const bezeichnung = el('input', { maxlength: 60, placeholder: 'z. B. vor dem Umsetzen im Oktober' });
  const ergebnis = await zeigeDialog({
    titel: 'Sitzordnung speichern',
    inhalt: [
      el('p', { class: 'hinweis', text: 'Speichert die aktuelle Sitzordnung mit Datum. Du kannst sie später unter „Versionen“ ansehen und wiederherstellen.' }),
      feld('Bezeichnung (optional)', bezeichnung),
    ],
    knoepfe: [{ text: 'Abbrechen' }, { text: 'Speichern', wert: 'ok', primaer: true }],
  });
  if (ergebnis !== 'ok') return false;
  const plan = await db.ladeAktuellenPlan(klasse.id);
  await db.speichereVersion(plan, bezeichnung.value.trim());
  toast('Version gespeichert.');
  return true;
}

// Kleine, nicht bedienbare Ansicht einer Version (nur Namen).
// Eine Version hat ihr eigenes Raster: so, wie der Raum beim Speichern war.
function vorschau(plan, personNachId, namen) {
  const bereich = belegterBereich(plan);
  if (!bereich) return el('p', { class: 'hinweis', text: 'Leeres Raster.' });
  const zeilen = anzeigeReihenfolge(bereich.zMin, bereich.zMax, state.lehrersicht);
  const spalten = anzeigeReihenfolge(bereich.sMin, bereich.sMax, state.lehrersicht);
  const raster = el('div', { class: 'raster vorschau', style: { '--spalten': spalten.length } });
  for (const z of zeilen) {
    for (const s of spalten) {
      const key = feldKey(z, s);
      const typ = plan.felder[key];
      const person = personNachId.get(plan.zuordnung[key]);
      raster.append(el('div', {
        class: 'zelle ' + (typ || 'leer') + (person ? ' besetzt' : ''),
        text: person ? namen.get(person.id) : '',
      }));
    }
  }
  return el('div', { class: 'raster-huelle' }, raster);
}
