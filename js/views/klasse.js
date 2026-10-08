// klasse.js – Klassen anlegen, Angaben ändern (Name, Fach, Raum, Schuljahr), löschen.

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, zeigeDialog, feld } from '../util/ui.js';

// Die Ansicht "Klasse" in der unteren Navigation
export async function zeichneKlasse(container) {
  const klasse = aktuelleKlasse();
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
    el('h2', { text: 'Klasse' }),
    f.elemente,
    el('button', { class: 'knopf primaer', type: 'submit', text: 'Speichern' }),
  );

  const loeschen = el('div', { class: 'karte' },
    el('h2', { text: 'Klasse löschen' }),
    el('p', { class: 'hinweis', text: 'Löscht die Klasse mit allen SuS, Fotos, Sitzplänen und Beobachtungen. Das lässt sich nicht rückgängig machen.' }),
    el('button', {
      class: 'knopf gefahr', text: `„${klasse.name}“ löschen`,
      onclick: async () => {
        if (!confirm(`„${klasse.name}“ mit allen SuS und Daten endgültig löschen?`)) return;
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

  container.append(formular, await schnellbuttonsKarte(), loeschen, await speicherInfo());
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
    el('h2', { text: 'Schnellbuttons' }),
    el('p', { class: 'hinweis', text: 'Zusätzliche Knöpfe im Schnellmenü. Gelten für alle Klassen. Bereits erfasste Einträge bleiben beim Entfernen erhalten.' }),
    el('ul', { class: 'liste' }, liste.filter((s) => !s.geloescht).map((s) => el('li', { class: 'sb-eintrag' },
      el('span', { class: 'eintrag-zeichen ' + (s.wert > 0 ? 'positiv' : s.wert < 0 ? 'negativ' : 'neutral'), text: zeichen[s.wert] }),
      el('span', { class: 'wachsen', text: s.name }),
      el('button', {
        class: 'knopf rund', 'aria-label': s.name + ' entfernen', text: '✕',
        onclick: async () => {
          if (!confirm(`Schnellbutton „${s.name}“ entfernen?`)) return;
          s.geloescht = true; // nur ausblenden, damit alte Einträge ihren Namen behalten
          await db.speichereSchnellbuttons(liste);
          app.neuZeichnen();
        },
      }),
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
    }, name, wert, el('button', { class: 'knopf', type: 'submit', text: 'Hinzufügen' })),
  );
}

// Dialog "Neue Klasse" – danach geht es direkt zum Raumraster
export async function neueKlasseDialog() {
  const f = klassenFelder({ schuljahr: aktuellesSchuljahr() });
  const ergebnis = await zeigeDialog({
    titel: 'Neue Klasse',
    inhalt: f.elemente,
    knoepfe: [{ text: 'Abbrechen' }, { text: 'Anlegen', wert: 'ok', primaer: true }],
  });
  if (ergebnis !== 'ok') return;

  const klasse = await db.legeKlasseAn(f.werte());
  state.klassen = await db.ladeKlassen();
  state.klasseId = klasse.id;
  state.ansicht = 'raum';
  state.auswahl = null;
  await db.speichereEinstellung('letzteKlasse', klasse.id);
  await app.neuZeichnen();
  toast('Klasse angelegt. Tippe jetzt die Sitzplätze an.', { dauer: 3500 });
}

// Die Eingabefelder einer Klasse (für Dialog und Ansicht)
function klassenFelder(k) {
  const name = el('input', { required: true, maxlength: 30, value: k.name || '', placeholder: 'z. B. 1a GWB' });
  const fach = el('input', { value: k.fach || '', placeholder: 'z. B. Informatik' });
  const raum = el('input', { value: k.raum || '', placeholder: 'z. B. 12 oder EDV-Saal' });
  const schuljahr = el('input', { value: k.schuljahr || '', placeholder: 'z. B. 2026/27' });
  return {
    elemente: [
      feld('Name', name),
      feld('Fach (optional)', fach),
      feld('Raum (optional)', raum),
      feld('Schuljahr (optional)', schuljahr),
    ],
    werte: () => ({
      name: name.value.trim(),
      fach: fach.value.trim(),
      raum: raum.value.trim(),
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
    el('h2', { text: 'Speicher' }),
    el('p', { class: 'hinweis', text: 'Alle Daten liegen nur auf diesem Gerät. Nichts wird ins Internet übertragen.' }),
    el('p', { class: 'hinweis', text: (dauerhaft ? '✓ Dauerhafte Speicherung aktiv' : '⚠︎ Dauerhafte Speicherung nicht bestätigt') + belegt }),
  );
}
