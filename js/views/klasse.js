// klasse.js – die Seite "Mehr": Angaben zur Klasse (Name, Fach, Schuljahr, Raum, Reihenfolge),
// Datensicherung, PIN-Sperre, Schnellbuttons, Klasse löschen, Speicher-Info.
// Außerdem der Dialog "Neue Klasse".

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, zeigeDialog, bestaetigen, feld, kartenKopf } from '../util/ui.js';
import { icon } from '../util/icons.js';
import { datumText } from '../util/beobachtung.js';
import { backupExportieren, backupPruefen, backupErinnerung } from '../util/sicherung.js';
import { dateiWaehlen } from '../util/datei.js';
import { pinKarte } from './sperre.js';

// Die Ansicht "Mehr" in der unteren Navigation
export async function zeichneKlasse(container) {
  const klasse = aktuelleKlasse();
  const raum = await db.ladeRaum(klasse.raumId);
  const f = klassenFelder(klasse);

  const formular = el('form', {
    class: 'karte',
    onsubmit: async (e) => {
      e.preventDefault(); // Seite nicht neu laden
      Object.assign(klasse, f.werte());
      await db.speichereKlasse(klasse);
      toast('Gespeichert.');
      app.neuZeichnen(); // Tab-Name aktualisieren
    },
  },
    kartenKopf('klasse', 'Angaben zur Klasse'),
    f.elemente,
    el('button', { class: 'knopf primaer', type: 'submit', text: 'Speichern' }),
    // Der Raum wird unter "Räume" zugeteilt (dort stehen alle Räume)
    el('div', { class: 'leiste' },
      el('span', { class: 'hinweis wachsen', text: raum ? `Raum: ${raum.name}` : 'Noch kein Raum zugeteilt' }),
      el('button', {
        type: 'button', class: 'knopf klein',
        onclick: () => { state.ansicht = 'raum'; state.raumId = null; app.neuZeichnen(); },
      }, 'Raum ändern', icon('rechts')),
    ),
    // Reihenfolge der Tabs oben
    state.klassen.length > 1 ? el('div', { class: 'leiste' },
      el('span', { class: 'hinweis wachsen', text: 'Position in der Leiste oben (oder den Tab oben gedrückt halten und ziehen)' }),
      el('button', { type: 'button', class: 'knopf rund', 'aria-label': 'nach links', onclick: () => verschieben(-1) }, icon('links')),
      el('button', { type: 'button', class: 'knopf rund', 'aria-label': 'nach rechts', onclick: () => verschieben(1) }, icon('rechts')),
    ) : null,
  );

  async function verschieben(richtung) {
    await db.verschiebeKlasse(klasse.id, richtung);
    state.klassen = await db.ladeKlassen();
    app.neuZeichnen();
  }

  const loeschen = el('div', { class: 'karte' },
    kartenKopf('papierkorb', 'Klasse löschen', true),
    el('p', { class: 'hinweis', text: 'Löscht die Klasse mit allen SuS, Fotos, Sitzplänen und Beobachtungen. Das lässt sich nicht rückgängig machen.' }),
    el('button', {
      class: 'knopf gefahr-leise', text: `„${klasse.name}“ löschen`,
      onclick: async () => {
        if (!await bestaetigen({
          titel: `„${klasse.name}“ löschen?`,
          text: 'Die Klasse wird mit allen SuS, Fotos, Sitzplänen und Beobachtungen endgültig gelöscht.',
          knopf: 'Endgültig löschen', gefahr: true,
        })) return;
        await db.loescheKlasse(klasse.id);
        state.klassen = await db.ladeKlassen();
        state.klasseId = state.klassen[0]?.id ?? null;
        state.ansicht = 'plan';
        await db.speichereEinstellung('letzteKlasse', state.klasseId);
        toast('Klasse gelöscht.');
        app.neuZeichnen();
      },
    }),
  );

  // Oben, was nur DIESE Klasse betrifft – darunter, was für die ganze App gilt
  container.append(
    el('h3', { class: 'abschnitt-titel', text: `Klasse „${klasse.name}“` }),
    formular,
    el('h3', { class: 'abschnitt-titel', text: 'Für alle Klassen' }),
    await sicherungKarte(),
    await schnellbuttonsKarte(),
    await pinKarte(app.neuZeichnen),
    await speicherInfo(),
    el('h3', { class: 'abschnitt-titel', text: 'Gefahrenbereich' }),
    loeschen,
  );
}

// Datensicherung: Backup erstellen/einspielen, Erinnerung einstellen
async function sicherungKarte() {
  const letztes = await db.ladeEinstellung('letztesBackup');
  const intervall = el('select', {
    onchange: async (e) => {
      await db.speichereEinstellung('backupIntervall', Number(e.target.value));
      state.backupFaellig = await backupErinnerung(state.klassen.length);
      toast('Gespeichert.');
      app.neuZeichnen();
    },
  }, [[7, 'wöchentlich'], [14, 'alle 2 Wochen'], [30, 'monatlich'], [0, 'nie']]
    .map(([w, t]) => el('option', { value: w, text: t })));
  intervall.value = String(await db.ladeEinstellung('backupIntervall', 30));

  return el('div', { class: 'karte' },
    kartenKopf('sicherung', 'Datensicherung'),
    letztes
      ? el('p', { class: 'status gut' }, icon('haken'), `Letztes Backup: ${datumText(letztes)}`)
      : el('p', { class: 'status warnung', text: 'Noch kein Backup erstellt.' }),
    el('p', { class: 'hinweis', text: 'Das Backup ist eine Datei mit allen Klassen, SuS, Fotos, Sitzplänen und Beobachtungen. Damit überträgst du auch die Daten zwischen iPhone und Laptop. Die Datei enthält Schülerdaten – sicher aufbewahren.' }),
    el('div', { class: 'leiste fuellen' },
      el('button', { class: 'knopf primaer', onclick: backupErstellen }, icon('herunter'), 'Backup erstellen'),
      el('button', { class: 'knopf', onclick: backupEinspielen }, icon('hinauf'), 'Backup einspielen'),
    ),
    feld('Erinnerung an ein Backup', intervall),
  );
}

export async function backupErstellen() {
  if (await backupExportieren()) {
    state.backupFaellig = null;
    toast('Backup erstellt.');
    app.neuZeichnen();
  }
}

export async function backupEinspielen() {
  const datei = await dateiWaehlen('.json,application/json');
  if (!datei) return;
  let backup;
  try {
    backup = backupPruefen(datei.text);
  } catch (e) {
    await zeigeDialog({ titel: 'Import nicht möglich', inhalt: [el('p', { text: e.message })] });
    return;
  }
  const ergebnis = await zeigeDialog({
    titel: 'Backup einspielen?',
    inhalt: [
      el('p', { text: `Backup vom ${backup.erstellt ? datumText(backup.erstellt) : '?'}:` }),
      el('p', {}, el('strong', { text: backup.zusammenfassung })),
      el('p', { class: 'hinweis-warnung', text: 'Alle Klassen, SuS und Beobachtungen auf DIESEM Gerät werden durch das Backup ersetzt. Erstelle vorher ein Backup, falls du hier etwas Neueres hast.' }),
    ],
    knoepfe: [{ text: 'Abbrechen' }, { text: 'Ersetzen', wert: 'ok', primaer: true, gefahr: true }],
  });
  if (ergebnis !== 'ok') return;
  await db.alleDatenErsetzen(backup.daten);
  location.reload(); // App mit den neuen Daten neu starten
}

// Schnellbuttons im Schnellmenü konfigurieren (gelten für alle Klassen)
async function schnellbuttonsKarte() {
  const liste = await db.ladeSchnellbuttons();
  const zeichen = { '1': '+', '-1': '−', '0': '•' };

  const name = el('input', { placeholder: 'z. B. Referat gehalten', maxlength: 30 });
  const wert = el('select', { 'aria-label': 'Wertung' },
    el('option', { value: '-1', text: '− negativ' }),
    el('option', { value: '1', text: '+ positiv' }),
    el('option', { value: '0', text: '• neutral' }));

  return el('div', { class: 'karte' },
    kartenKopf('blitz', 'Schnellbuttons'),
    el('p', { class: 'hinweis', text: 'Zusätzliche Knöpfe im Schnellmenü, das sich im Unterricht beim Antippen einer Person öffnet. Bereits erfasste Einträge bleiben beim Entfernen erhalten.' }),
    el('ul', { class: 'liste' }, liste.filter((s) => !s.geloescht).map((s) => el('li', { class: 'sb-eintrag' },
      el('span', { class: 'eintrag-zeichen ' + (s.wert > 0 ? 'positiv' : s.wert < 0 ? 'negativ' : 'neutral'), text: zeichen[s.wert] }),
      el('span', { class: 'wachsen', text: s.name }),
      el('button', {
        class: 'knopf rund', 'aria-label': s.name + ' entfernen',
        onclick: async () => {
          if (!await bestaetigen({
            titel: `„${s.name}“ entfernen?`,
            text: 'Bereits erfasste Einträge bleiben erhalten.',
            knopf: 'Entfernen', gefahr: true,
          })) return;
          s.geloescht = true; // nur ausblenden, damit alte Einträge ihren Namen behalten
          await db.speichereSchnellbuttons(liste);
          app.neuZeichnen();
        },
      }, icon('x')),
    ))),
    el('form', {
      class: 'sb-neu',
      onsubmit: async (e) => {
        e.preventDefault();
        const n = name.value.trim();
        if (!n) return;
        liste.push({ id: db.neueId().slice(0, 8), name: n, wert: Number(wert.value) });
        await db.speichereSchnellbuttons(liste);
        toast(`„${n}“ hinzugefügt.`);
        app.neuZeichnen();
      },
    }, name, wert, el('button', { class: 'knopf', type: 'submit' }, icon('plus'), 'Hinzufügen')),
  );
}

// Dialog "Neue Klasse". Die Klasse kommt in einen vorhandenen Raum (dann geht es
// gleich zu den SuS) oder bekommt einen neuen (dann zuerst die Sitzplätze antippen).
export async function neueKlasseDialog() {
  const f = klassenFelder({ schuljahr: aktuellesSchuljahr() });
  const raeume = await db.ladeRaeume();

  const neuerName = el('input', { maxlength: 40, placeholder: 'z. B. Raum 12 oder EDV Nord' });
  const neuerRaum = feld(raeume.length ? 'Name des neuen Raums' : 'Raum', neuerName);
  const wahl = el('select', { required: true, onchange: zeigeNeuenRaum },
    el('option', { value: '', text: '– Raum wählen –' }),
    raeume.map((r) => el('option', { value: r.id, text: r.name })),
    el('option', { value: 'neu', text: '+ Neuer Raum' }));
  if (raeume.length === 0) wahl.value = 'neu'; // noch kein Raum: nur nach dem Namen fragen
  // Das Namensfeld gibt es nur bei "Neuer Raum" (ausgeblendet darf es kein Pflichtfeld sein)
  function zeigeNeuenRaum() {
    neuerRaum.hidden = wahl.value !== 'neu';
    neuerName.required = wahl.value === 'neu';
  }
  zeigeNeuenRaum();

  const ergebnis = await zeigeDialog({
    titel: 'Neue Klasse',
    inhalt: [...f.elemente, raeume.length ? feld('Raum', wahl) : null, neuerRaum],
    knoepfe: [{ text: 'Abbrechen' }, { text: 'Anlegen', wert: 'ok', primaer: true }],
  });
  if (ergebnis !== 'ok') return;

  const werte = f.werte();
  const neu = wahl.value === 'neu';
  const raum = neu
    ? await db.legeRaumAn({ name: neuerName.value.trim() || `Raum ${werte.name}` })
    : raeume.find((r) => r.id === wahl.value);
  const klasse = await db.legeKlasseAn({ ...werte, raumId: raum.id });
  state.klassen = await db.ladeKlassen();
  state.klasseId = klasse.id;
  state.ansicht = neu ? 'raum' : 'schueler';
  state.raumId = neu ? raum.id : null; // neuer Raum: gleich in dessen Editor
  state.auswahl = null;
  await db.speichereEinstellung('letzteKlasse', klasse.id);
  await app.neuZeichnen();
  toast(neu ? 'Klasse angelegt. Tippe jetzt die Sitzplätze an.' : 'Klasse angelegt. Trage jetzt die SuS ein.', { dauer: 3500 });
}

// Die Eingabefelder einer Klasse (für Dialog und Ansicht)
function klassenFelder(k) {
  const name = el('input', { required: true, maxlength: 30, value: k.name || '', placeholder: 'z. B. 1a GWB' });
  const fach = el('input', { value: k.fach || '', placeholder: 'z. B. Informatik' });
  const schuljahr = el('input', { value: k.schuljahr || '', placeholder: 'z. B. 2026/27' });
  return {
    elemente: [
      feld('Name', name),
      el('div', { class: 'feld-reihe' },
        feld('Fach (optional)', fach),
        feld('Schuljahr (optional)', schuljahr),
      ),
    ],
    werte: () => ({
      name: name.value.trim(),
      fach: fach.value.trim(),
      schuljahr: schuljahr.value.trim(),
    }),
  };
}

// Schuljahr beginnt im September: Oktober 2026 -> "2026/27", März 2027 -> "2026/27"
export function aktuellesSchuljahr(datum = new Date()) {
  const start = datum.getMonth() >= 8 ? datum.getFullYear() : datum.getFullYear() - 1;
  return `${start}/${String(start + 1).slice(-2)}`;
}

// Zeigt, ob der Browser die Daten dauerhaft aufbewahrt und wie viel Platz sie brauchen
async function speicherInfo() {
  const dauerhaft = await db.dauerhaftSpeichern();
  let belegt = '';
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    belegt = ` · belegt ca. ${(usage / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }
  return el('div', { class: 'karte' },
    kartenKopf('speicher', 'Speicher'),
    el('p', { class: 'hinweis', text: 'Alle Daten liegen nur auf diesem Gerät. Nichts wird ins Internet übertragen.' }),
    dauerhaft
      ? el('p', { class: 'status gut' }, icon('haken'), 'Dauerhafte Speicherung aktiv' + belegt)
      : el('p', { class: 'status warnung', text: 'Dauerhafte Speicherung nicht bestätigt' + belegt }),
  );
}
