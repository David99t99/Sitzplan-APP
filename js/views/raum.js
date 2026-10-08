// raum.js – die Ansicht "Räume".
//
// Räume gehören zu keiner Klasse: Mehrere Klassen können im selben Raum sitzen.
// Wird ein Raum geändert, gilt das für alle Klassen, die darin sitzen.
//
//   Liste   – alle Räume, darüber die Auswahl, in welchem Raum die geöffnete Klasse sitzt
//   Editor  – das Raster eines Raums: Welche Felder sind Sitzplätze, wo ist Tafel, Tür, Lehrertisch?
//             Bedienung: Werkzeug wählen, dann Felder antippen.
//             Ein Feld, das schon diesen Typ hat, wird beim Antippen wieder geleert.

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, initialen, zeigeDialog, bestaetigen, feld, kartenKopf } from '../util/ui.js';
import { icon } from '../util/icons.js';
import { FELDTYPEN, feldKey, ausKey, anzeigeReihenfolge, sitzplaetze, ohneSitzplatz } from '../util/raster.js';
import { sichtKnopf, zellGroesse } from './plan.js';

const MIN_GROESSE = 2;
const MAX_GROESSE = 20;

export async function zeichneRaum(container) {
  const raum = await db.ladeRaum(state.raumId);
  if (raum) return zeichneEditor(container, raum);
  state.raumId = null;
  return zeichneListe(container);
}

// Die Klassen, die in einem Raum sitzen
const klassenIn = (raumId) => state.klassen.filter((k) => k.raumId === raumId);

function oeffneRaum(id) {
  state.raumId = id;
  app.neuZeichnen();
}

// ============================ Liste aller Räume ============================

async function zeichneListe(container) {
  const klasse = aktuelleKlasse();
  const raeume = await db.ladeRaeume();

  // ---------- In welchem Raum sitzt die geöffnete Klasse? ----------
  const wahl = el('select', {
    onchange: async () => {
      await raumZuteilen(klasse, wahl.value || null);
      app.neuZeichnen(); // auch nach "Abbrechen": die Auswahl springt dann zurück
    },
  },
    el('option', { value: '', text: '– kein Raum –' }),
    raeume.map((r) => el('option', { value: r.id, text: r.name })),
  );
  wahl.value = klasse.raumId || '';

  container.append(
    el('h3', { class: 'abschnitt-titel', text: `Raum von „${klasse.name}“` }),
    el('div', { class: 'karte' },
      raeume.length
        ? feld('Diese Klasse sitzt in', wahl)
        : el('p', { class: 'hinweis', text: 'Lege zuerst einen Raum an – danach kannst du ihn dieser Klasse zuteilen.' }),
    ),
    el('h3', { class: 'abschnitt-titel', text: 'Alle Räume' }),
    el('p', { class: 'hinweis', text: 'Räume gelten für alle Klassen: Änderst du einen Raum, ändert er sich bei jeder Klasse, die darin sitzt.' }),
  );

  if (raeume.length) {
    container.append(el('ul', { class: 'liste' }, raeume.map((r) => el('li', {},
      el('button', { class: 'zeile', onclick: () => oeffneRaum(r.id) },
        el('span', { class: 'zeile-text' },
          el('strong', { text: r.name }),
          el('small', { text: `${sitzplaetze(r).length} Plätze · ${klassenIn(r.id).map((k) => k.name).join(', ') || 'keine Klasse'}` }),
        ),
        r.id === klasse.raumId ? el('span', { class: 'etikett', text: 'diese Klasse' }) : null,
        el('span', { class: 'pfeil' }, icon('rechts')),
      ),
    ))));
  }
  container.append(el('div', { class: 'leiste fuellen' },
    el('button', { class: 'knopf primaer', onclick: () => neuerRaum(klasse) }, icon('plus'), 'Neuer Raum')));
}

// Dialog "Neuer Raum" – danach geht es gleich in den Editor
async function neuerRaum(klasse) {
  // Hat die Klasse noch keinen Raum, ist der neue vermutlich ihrer
  const zuteilen = el('input', { type: 'checkbox', checked: !klasse.raumId });
  const name = await raumNameDialog('Neuer Raum', '', 'Anlegen',
    el('label', { class: 'haken' }, zuteilen, el('span', { text: `„${klasse.name}“ sitzt in diesem Raum` })));
  if (!name) return;
  const raum = await db.legeRaumAn({ name });
  if (zuteilen.checked && !await raumZuteilen(klasse, raum.id)) {
    await db.loescheRaum(raum.id); // Zuteilen abgebrochen: nichts anlegen
    return;
  }
  state.raumId = raum.id;
  await app.neuZeichnen();
  toast('Raum angelegt. Tippe jetzt die Sitzplätze an.', { dauer: 3500 });
}

// Fragt nach einem Raumnamen. Rückgabe: der Name, oder null bei Abbrechen.
async function raumNameDialog(titel, vorgabe, knopf, ...zusatz) {
  const name = el('input', { required: true, maxlength: 40, value: vorgabe, placeholder: 'z. B. Raum 12 oder EDV Nord' });
  const ergebnis = await zeigeDialog({
    titel,
    inhalt: [feld('Name des Raums', name), ...zusatz],
    knoepfe: [{ text: 'Abbrechen' }, { text: knopf, wert: 'ok', primaer: true }],
  });
  return ergebnis === 'ok' ? name.value.trim() || null : null;
}

// Teilt der Klasse einen Raum zu (raumId = null: kein Raum). Fragt nach, wenn
// dabei SuS ihren Platz verlieren. Rückgabe: true, wenn zugeteilt wurde.
export async function raumZuteilen(klasse, raumId) {
  if (raumId === (klasse.raumId || null)) return true;
  const [plan, raum] = await Promise.all([db.ladeAktuellenPlan(klasse.id), db.ladeRaum(raumId)]);
  const verlieren = ohneSitzplatz(plan.zuordnung, raum).length;
  if (verlieren && !await bestaetigen({
    titel: raum ? `„${klasse.name}“ in „${raum.name}“ setzen?` : `„${klasse.name}“ ohne Raum?`,
    text: (verlieren === 1
      ? 'Eine Person sitzt auf einem Platz, den es dort nicht gibt. Sie kommt in „Ohne Platz“.'
      : `${verlieren} SuS sitzen auf Plätzen, die es dort nicht gibt. Sie kommen in „Ohne Platz“.`)
      + '\nDie bisherige Sitzordnung wird vorher als Version gespeichert.',
    knopf: raum ? 'Raum wechseln' : 'Raum entfernen',
  })) return false;
  await db.weiseRaumZu(klasse, raumId);
  toast(raum ? `„${klasse.name}“ sitzt jetzt in „${raum.name}“.` : `„${klasse.name}“ hat jetzt keinen Raum.`);
  return true;
}

// ============================ Editor für einen Raum ========================

async function zeichneEditor(container, raum) {
  const klasse = aktuelleKlasse();
  const klassen = klassenIn(raum.id);
  const klassenNamen = klassen.map((k) => k.name).join(', ');
  // Sitzt die geöffnete Klasse in diesem Raum, zeigen besetzte Plätze ihre Initialen
  const eigener = klasse.raumId === raum.id;
  const [plan, personen] = eigener
    ? await Promise.all([db.ladeAktuellenPlan(klasse.id), db.ladePersonen(klasse.id)])
    : [null, []];
  const personNachId = new Map(personen.map((p) => [p.id, p]));

  // ---------- Kopf: zurück zur Liste, Name, wer hier sitzt ----------
  container.append(
    el('div', { class: 'leiste' },
      el('button', {
        class: 'knopf klein',
        onclick: () => oeffneRaum(null),
      }, icon('links'), 'Räume'),
      el('h2', { class: 'wachsen', text: raum.name }),
    ),
    klassen.length > 1
      ? el('div', { class: 'tipp' },
        el('span', { class: 'wachsen', text: `Hier sitzen ${klassenNamen}. Änderungen gelten für alle diese Klassen.` }))
      : el('div', { class: 'leiste' },
        el('p', { class: 'hinweis wachsen', text: klassen.length ? `Hier sitzt ${klassenNamen}.` : 'In diesem Raum sitzt noch keine Klasse.' }),
        // Klasse ohne Raum: gleich anbieten, sie hierher zu setzen
        klasse.raumId ? null : el('button', {
          class: 'knopf klein primaer',
          onclick: async () => { await raumZuteilen(klasse, raum.id); app.neuZeichnen(); },
        }, `„${klasse.name}“ zuteilen`),
      ),
  );

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
    stepper('Spalten', raum.spalten, (n) => groesseAendern(raum.zeilen, n)),
    stepper('Zeilen', raum.zeilen, (n) => groesseAendern(n, raum.spalten)),
    el('div', { class: 'regler' },
      el('span', { class: 'regler-titel', text: state.lehrersicht ? 'Lehrersicht' : 'Schülersicht' }),
      sichtKnopf(true),
    ),
  ));

  // ---------- Das komplette Raster ----------
  const zeilen = anzeigeReihenfolge(0, raum.zeilen - 1, state.lehrersicht);
  const spalten = anzeigeReihenfolge(0, raum.spalten - 1, state.lehrersicht);
  const raster = el('div', {
    class: 'raster editor',
    style: { '--spalten': spalten.length, '--zelle': zellGroesse({ spalten: spalten.map(() => 1), min: 40, max: 72 }) + 'px' },
  });
  for (const z of zeilen) {
    for (const s of spalten) {
      const key = feldKey(z, s);
      const typ = raum.felder[key];
      const person = personNachId.get(plan?.zuordnung[key]);
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
  // Der nächste Schritt hängt davon ab, ob die geöffnete Klasse hier sitzt und schon SuS hat
  const weiter = !eigener
    ? el('button', { class: 'knopf primaer', text: 'Fertig', onclick: () => oeffneRaum(null) })
    : personen.length === 0
      ? el('button', {
        class: 'knopf primaer',
        onclick: () => { state.ansicht = 'schueler'; app.neuZeichnen(); },
      }, 'Weiter: SuS eintragen', icon('rechts'))
      : el('button', {
        class: 'knopf primaer',
        onclick: () => { state.ansicht = 'plan'; state.modus = 'bearbeiten'; app.neuZeichnen(); },
      }, 'Fertig: SuS setzen', icon('rechts'));
  container.append(
    el('p', { class: 'unterzeile', text: `${sitzplaetze(raum).length} Sitzplätze` + (eigener ? ` · ${personen.length} SuS` : '') }),
    el('div', { class: 'leiste fuellen' },
      el('button', { class: 'knopf gefahr-leise', text: 'Alles leeren', onclick: allesLeeren }),
      weiter,
    ),
    el('div', { class: 'karte' },
      kartenKopf('raum', 'Raum verwalten'),
      el('p', { class: 'hinweis', text: 'Eine Kopie ist ein eigener Raum – praktisch für einen zweiten, ähnlich eingerichteten Raum.' }),
      el('div', { class: 'leiste fuellen' },
        el('button', { class: 'knopf', text: 'Umbenennen', onclick: umbenennen }),
        el('button', { class: 'knopf', text: 'Kopie anlegen', onclick: kopieren }),
        el('button', { class: 'knopf gefahr-leise', text: 'Raum löschen', onclick: loeschen }),
      ),
    ),
  );

  // ======================= Hilfsfunktionen ==================================

  async function feldAntippen(key) {
    const alt = raum.felder[key];
    const neu = (state.werkzeug === 'leer' || alt === state.werkzeug) ? null : state.werkzeug;
    if (neu) raum.felder[key] = neu;
    else delete raum.felder[key];

    // Wird ein besetzter Sitzplatz entfernt, kommt die Person in "Ohne Platz" –
    // in jeder Klasse dieses Raums. Deshalb lässt sich das gleich zurücknehmen.
    const entfernt = await db.speichereRaum(raum);
    if (entfernt.length) {
      const person = entfernt.length === 1 ? personNachId.get(entfernt[0].personId) : null;
      const betroffen = klassen.filter((k) => entfernt.some((e) => e.klasseId === k.id)).map((k) => k.name);
      toast(person ? `${person.vorname} ist jetzt ohne Platz.` : `Ohne Platz: ${entfernt.length} SuS (${betroffen.join(', ')}).`, {
        dauer: 6000,
        knopf: 'Rückgängig',
        aktion: async () => {
          const frisch = await db.ladeRaum(raum.id); // inzwischen kann mehr geändert worden sein
          if (!frisch) return;
          frisch.felder[key] = 'sitz';
          await db.speichereRaum(frisch);
          await db.gibPlaetzeZurueck(entfernt);
          app.neuZeichnen();
        },
      });
    }
    app.neuZeichnen();
  }

  async function groesseAendern(neueZeilen, neueSpalten) {
    neueZeilen = Math.max(MIN_GROESSE, Math.min(MAX_GROESSE, neueZeilen));
    neueSpalten = Math.max(MIN_GROESSE, Math.min(MAX_GROESSE, neueSpalten));

    // Markierte Felder, die beim Verkleinern wegfallen würden
    const weg = Object.keys(raum.felder).filter((k) => {
      const [z, s] = ausKey(k);
      return z >= neueZeilen || s >= neueSpalten;
    });
    if (weg.length && !await bestaetigen({
      titel: 'Raster verkleinern?',
      text: `${weg.length} markierte Felder liegen außerhalb und werden entfernt.` + fuerAlle(),
      knopf: 'Verkleinern',
    })) return;

    for (const k of weg) delete raum.felder[k];
    raum.zeilen = neueZeilen;
    raum.spalten = neueSpalten;
    await db.speichereRaum(raum);
    app.neuZeichnen();
  }

  async function allesLeeren() {
    if (!await bestaetigen({
      titel: 'Alles leeren?',
      text: 'Alle Markierungen werden entfernt. Alle SuS kommen in „Ohne Platz“.' + fuerAlle(),
      knopf: 'Alles leeren', gefahr: true,
    })) return;
    raum.felder = {};
    await db.speichereRaum(raum);
    app.neuZeichnen();
  }

  // Zusatz für Sicherheitsfragen, wenn mehrere Klassen betroffen sind (eigener Absatz)
  function fuerAlle() {
    return klassen.length > 1 ? `\nDas gilt für alle Klassen in diesem Raum: ${klassenNamen}.` : '';
  }

  async function umbenennen() {
    const name = await raumNameDialog('Raum umbenennen', raum.name, 'Speichern');
    if (!name) return;
    raum.name = name;
    await db.speichereRaum(raum);
    app.neuZeichnen();
  }

  async function kopieren() {
    const name = await raumNameDialog('Kopie anlegen', `${raum.name} (Kopie)`, 'Anlegen',
      el('p', { class: 'hinweis', text: 'Die Kopie übernimmt das Raster. Die Klassen bleiben im bisherigen Raum.' }));
    if (!name) return;
    const neu = await db.legeRaumAn({ ...raum, name });
    state.raumId = neu.id;
    await app.neuZeichnen();
    toast(`„${name}“ angelegt.`);
  }

  async function loeschen() {
    if (klassen.length) {
      await zeigeDialog({
        titel: 'Raum wird noch verwendet',
        inhalt: [el('p', { text: `In „${raum.name}“ sitzt noch: ${klassenNamen}. Teile diesen Klassen zuerst einen anderen Raum zu.` })],
      });
      return;
    }
    if (!await bestaetigen({ titel: `„${raum.name}“ löschen?`, knopf: 'Löschen', gefahr: true })) return;
    await db.loescheRaum(raum.id);
    state.raumId = null;
    await app.neuZeichnen();
    toast('Raum gelöscht.');
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
