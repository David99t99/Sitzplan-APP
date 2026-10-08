// raum.js – Raumraster festlegen: Welche Felder sind Sitzplätze, wo ist Tafel, Tür, Lehrertisch?
//
// Bedienung: Werkzeug wählen, dann Felder antippen.
// Ein Feld, das schon diesen Typ hat, wird beim Antippen wieder geleert.

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, initialen, zeigeDialog, bestaetigen, feld, kartenKopf } from '../util/ui.js';
import { icon } from '../util/icons.js';
import { FELDTYPEN, feldKey, ausKey, anzeigeReihenfolge, sitzplaetze } from '../util/raster.js';
import { sichtKnopf, zellGroesse } from './plan.js';

const MIN_GROESSE = 2;
const MAX_GROESSE = 20;

export async function zeichneRaum(container) {
  const klasse = aktuelleKlasse();
  const [plan, personen] = await Promise.all([
    db.ladeAktuellenPlan(klasse.id),
    db.ladePersonen(klasse.id),
  ]);
  const personNachId = new Map(personen.map((p) => [p.id, p]));

  // ---------- Werkzeuge ----------
  const werkzeuge = [...Object.entries(FELDTYPEN), ['leer', { name: 'Radierer' }]];
  container.append(
    el('p', { class: 'hinweis', text: 'Werkzeug wählen, dann Felder antippen. Nochmal antippen entfernt die Markierung.' }),
    el('div', { class: 'werkzeuge', role: 'group', 'aria-label': 'Werkzeug' },
      werkzeuge.map(([id, typ]) => el('button', {
        class: 'werkzeug' + (state.werkzeug === id ? ' aktiv' : ''),
        'aria-pressed': String(state.werkzeug === id),
        onclick: () => { state.werkzeug = id; app.neuZeichnen(); },
      },
        el('span', { class: 'muster ' + id }, id === 'tuer' ? icon('tuer') : id === 'leer' ? icon('x') : null),
        el('span', { text: typ.name }),
      )),
    ),
  );

  // ---------- Größe + Sicht (drei beschriftete Regler in einer Zeile) ----------
  container.append(el('div', { class: 'regler-zeile' },
    stepper('Spalten', plan.spalten, (n) => groesseAendern(plan.zeilen, n)),
    stepper('Zeilen', plan.zeilen, (n) => groesseAendern(n, plan.spalten)),
    el('div', { class: 'regler' },
      el('span', { class: 'regler-titel', text: state.lehrersicht ? 'Lehrersicht' : 'Schülersicht' }),
      sichtKnopf(true),
    ),
  ));

  // ---------- Das komplette Raster ----------
  const zeilen = anzeigeReihenfolge(0, plan.zeilen - 1, state.lehrersicht);
  const spalten = anzeigeReihenfolge(0, plan.spalten - 1, state.lehrersicht);
  const raster = el('div', {
    class: 'raster editor',
    style: { '--spalten': spalten.length, '--zelle': zellGroesse({ spalten: spalten.map(() => 1), min: 40, max: 72 }) + 'px' },
  });
  for (const z of zeilen) {
    for (const s of spalten) {
      const key = feldKey(z, s);
      const typ = plan.felder[key];
      const person = personNachId.get(plan.zuordnung[key]);
      raster.append(el('div', {
        class: 'zelle ' + (typ || 'leer'),
        role: 'button',
        'aria-label': typ ? FELDTYPEN[typ].name : 'leeres Feld',
        // Besetzte Plätze zeigen die Initialen, damit man sieht, wer dort sitzt
        text: person ? initialen(person) : '',
        onclick: () => feldAntippen(key),
      }, typ === 'tuer' ? icon('tuer') : null));
    }
  }
  // "Vorne" = Zeile 0. In der Lehrersicht ist vorne unten.
  const vorne = el('div', { class: 'vorne-markierung', text: 'vorne (Tafelseite)' });
  container.append(el('div', { class: 'raster-huelle', dataset: { scroll: 'raum' } },
    state.lehrersicht ? '' : vorne, raster, state.lehrersicht ? vorne : ''));

  // ---------- Zusammenfassung + Aktionen ----------
  const anzahlPlaetze = sitzplaetze(plan).length;
  container.append(
    el('p', { class: 'unterzeile', text: `${anzahlPlaetze} Sitzplätze · ${personen.length} SuS` }),
    el('div', { class: 'leiste fuellen' },
      el('button', { class: 'knopf gefahr-leise', text: 'Alles leeren', onclick: allesLeeren }),
      // Der nächste Schritt hängt davon ab, ob es schon SuS gibt
      personen.length === 0
        ? el('button', {
          class: 'knopf primaer',
          onclick: () => { state.ansicht = 'schueler'; app.neuZeichnen(); },
        }, 'Weiter: SuS eintragen', icon('rechts'))
        : el('button', {
          class: 'knopf primaer',
          onclick: () => { state.ansicht = 'plan'; state.modus = 'bearbeiten'; app.neuZeichnen(); },
        }, 'Fertig: SuS setzen', icon('rechts')),
    ),
  );

  // ---------- Raumvorlagen ----------
  container.append(await vorlagenKarte(plan, klasse));

  // ======================= Hilfsfunktionen ==================================

  async function feldAntippen(key) {
    const alt = plan.felder[key];
    const neu = (state.werkzeug === 'leer' || alt === state.werkzeug) ? null : state.werkzeug;
    if (neu) plan.felder[key] = neu;
    else delete plan.felder[key];

    // Wird ein besetzter Sitzplatz entfernt, kommt die Person in "Ohne Platz"
    if (neu !== 'sitz' && plan.zuordnung[key]) {
      const p = personNachId.get(plan.zuordnung[key]);
      delete plan.zuordnung[key];
      if (p) toast(`${p.vorname} ist jetzt ohne Platz.`);
    }
    await db.speicherePlan(plan);
    app.neuZeichnen();
  }

  async function groesseAendern(neueZeilen, neueSpalten) {
    neueZeilen = Math.max(MIN_GROESSE, Math.min(MAX_GROESSE, neueZeilen));
    neueSpalten = Math.max(MIN_GROESSE, Math.min(MAX_GROESSE, neueSpalten));

    // Markierte Felder, die beim Verkleinern wegfallen würden
    const weg = Object.keys(plan.felder).filter((k) => {
      const [z, s] = ausKey(k);
      return z >= neueZeilen || s >= neueSpalten;
    });
    if (weg.length && !await bestaetigen({
      titel: 'Raster verkleinern?',
      text: `${weg.length} markierte Felder liegen außerhalb und werden entfernt.`,
      knopf: 'Verkleinern',
    })) return;

    for (const k of weg) { delete plan.felder[k]; delete plan.zuordnung[k]; }
    plan.zeilen = neueZeilen;
    plan.spalten = neueSpalten;
    await db.speicherePlan(plan);
    app.neuZeichnen();
  }

  async function allesLeeren() {
    if (!await bestaetigen({
      titel: 'Alles leeren?',
      text: 'Alle Markierungen werden entfernt. Alle SuS kommen in „Ohne Platz“.',
      knopf: 'Alles leeren', gefahr: true,
    })) return;
    plan.felder = {};
    plan.zuordnung = {};
    await db.speicherePlan(plan);
    app.neuZeichnen();
  }
}

// Beschriftung, darunter [−] 8 [+]
function stepper(beschriftung, wert, setze) {
  return el('div', { class: 'regler' },
    el('span', { class: 'regler-titel', text: beschriftung }),
    el('div', { class: 'stepper' },
      el('button', { class: 'knopf rund', 'aria-label': beschriftung + ' weniger', onclick: () => setze(wert - 1) }, icon('minus')),
      el('output', { text: String(wert) }),
      el('button', { class: 'knopf rund', 'aria-label': beschriftung + ' mehr', onclick: () => setze(wert + 1) }, icon('plus')),
    ),
  );
}

// Raumvorlagen: aktuelles Raster als Vorlage speichern oder eine Vorlage übernehmen.
// Praktisch, wenn mehrere Klassen im selben Raum sitzen (z. B. „EDV-Saal“).
async function vorlagenKarte(plan, klasse) {
  const vorlagen = await db.ladeVorlagen();

  const speichern = el('button', {
    class: 'knopf',
    onclick: async () => {
      const name = el('input', { required: true, maxlength: 40, value: klasse.raum ? `Raum ${klasse.raum}` : '', placeholder: 'z. B. Raum 12 oder EDV-Saal' });
      const ergebnis = await zeigeDialog({
        titel: 'Raumvorlage speichern',
        inhalt: [el('p', { class: 'hinweis', text: 'Speichert nur das Raster (Plätze, Tafel, Tür …), keine SuS.' }), feld('Name der Vorlage', name)],
        knoepfe: [{ text: 'Abbrechen' }, { text: 'Speichern', wert: 'ok', primaer: true }],
      });
      if (ergebnis !== 'ok') return;
      await db.speichereVorlage(name.value.trim(), plan);
      toast('Vorlage gespeichert.');
      app.neuZeichnen();
    },
  }, icon('merken'), 'Als Vorlage speichern');

  if (vorlagen.length === 0) {
    return el('div', { class: 'karte' },
      kartenKopf('raum', 'Raumvorlagen'),
      el('p', { class: 'hinweis', text: 'Speichere dieses Raster als Vorlage, um es für andere Klassen im selben Raum wiederzuverwenden.' }),
      el('div', { class: 'leiste fuellen' }, speichern));
  }

  const auswahl = el('select', { 'aria-label': 'Vorlage' },
    vorlagen.map((v) => el('option', { value: v.id, text: v.name })));
  const gewaehlt = () => vorlagen.find((v) => v.id === auswahl.value);

  return el('div', { class: 'karte' },
    kartenKopf('raum', 'Raumvorlagen'),
    el('div', { class: 'leiste' }, auswahl),
    el('div', { class: 'leiste fuellen' },
      el('button', {
        class: 'knopf primaer', text: 'Übernehmen',
        onclick: async () => {
          const v = gewaehlt();
          if (!await bestaetigen({
            titel: `„${v.name}“ übernehmen?`,
            text: 'Das aktuelle Raster wird ersetzt. SuS behalten ihren Platz, wenn er weiterhin ein Sitzplatz ist.',
            knopf: 'Übernehmen',
          })) return;
          db.vorlageAnwenden(plan, v);
          await db.speicherePlan(plan);
          toast(`„${v.name}“ übernommen.`);
          app.neuZeichnen();
        },
      }),
      el('button', {
        class: 'knopf gefahr-leise', text: 'Vorlage löschen',
        onclick: async () => {
          const v = gewaehlt();
          if (!await bestaetigen({
            titel: `Vorlage „${v.name}“ löschen?`,
            text: 'Bestehende Sitzpläne bleiben unverändert.',
            knopf: 'Löschen', gefahr: true,
          })) return;
          await db.loescheVorlage(v.id);
          app.neuZeichnen();
        },
      }),
      speichern,
    ),
  );
}
