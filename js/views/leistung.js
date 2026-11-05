// leistung.js – Leistungskontrolle (Test, Arbeitsauftrag, Heftkontrolle …) eintragen und bearbeiten.
// Eine Leistungskontrolle gilt für die ganze Klasse: Art, Bezeichnung und Datum einmal angeben,
// darunter für jede Person eine Bewertung (frei: "2", "+", "18/24", "nicht abgegeben" …).
// Gespeichert wird sie als Beobachtungen (siehe db.js, "Leistungskontrollen").

import { app } from '../state.js';
import * as db from '../db.js';
import { el, toast, zeigeDialog, feld, avatar } from '../util/ui.js';
import { LK_ARTEN, fuerDatum, zeitpunktAm } from '../util/beobachtung.js';

// lkId = null: neue Leistungskontrolle.
// fokus: Person, deren Feld beim Öffnen ausgewählt ist (Bewertung in der Übersicht oder im Verlauf angetippt).
// Rückgabe: true, wenn etwas gespeichert oder gelöscht wurde.
export async function leistungDialog({ klasseId, lkId = null, fokus = null }) {
  const [personen, vorher, bisherigeArten] = await Promise.all([
    db.ladePersonen(klasseId),
    lkId ? db.ladeLeistungskontrolle(klasseId, lkId) : [],
    db.ladeLeistungsArten(),
  ]);
  const istNeu = vorher.length === 0;
  const erste = vorher[0];
  const nachPerson = new Map(vorher.map((b) => [b.personId, b]));
  const fokusDa = personen.some((p) => p.id === fokus);

  const art = el('input', {
    required: true, maxlength: 40, value: erste?.art || '', placeholder: 'z. B. Test',
    list: 'lk-arten', autocomplete: 'off', autofocus: !fokusDa,
  });
  const vorschlaege = el('datalist', { id: 'lk-arten' },
    [...new Set([...LK_ARTEN, ...bisherigeArten])].map((a) => el('option', { value: a })));
  const titel = el('input', { maxlength: 60, value: erste?.titel || '', placeholder: 'z. B. Bruchrechnung' });
  const datum = el('input', { type: 'date', required: true, value: fuerDatum(erste?.zeitpunkt ?? new Date().toISOString()) });

  const bewertung = new Map(personen.map((p) => [p.id, el('input', {
    value: nachPerson.get(p.id)?.bewertung || '',
    maxlength: 20,
    autocomplete: 'off',
    enterkeyhint: 'next',
    autofocus: p.id === fokus,
    onfocus: (e) => e.target.select(), // Tippen ersetzt die alte Bewertung
  })]));

  // Enter springt ins nächste Feld (wie in einer Tabelle), erst im letzten speichert Enter
  const reihenfolge = [art, titel, datum, ...bewertung.values()];
  reihenfolge.forEach((eingabe, i) => eingabe.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && reihenfolge[i + 1]) { e.preventDefault(); reihenfolge[i + 1].focus(); }
  }));

  const knoepfe = [{ text: 'Abbrechen' }, { text: 'Speichern', wert: 'ok', primaer: true }];
  if (!istNeu) knoepfe.unshift({ text: 'Löschen', wert: 'loeschen', gefahr: true });

  const ergebnis = await zeigeDialog({
    titel: istNeu ? 'Leistungskontrolle eintragen' : 'Leistungskontrolle bearbeiten',
    breit: true,
    inhalt: [
      el('div', { class: 'lk-felder' },
        feld('Art', art), feld('Bezeichnung (optional)', titel), feld('Datum', datum)),
      vorschlaege,
      el('div', { class: 'lk-ueberschrift' },
        el('h3', { text: 'Bewertung' }),
        el('span', { class: 'hinweis', text: 'Leer = nicht bewertet · Enter = nächste Person' })),
      el('div', { class: 'lk-liste' }, personen.map((p) => el('label', { class: 'lk-person' },
        avatar(p),
        el('span', { class: 'lk-name', text: `${p.nachname} ${p.vorname}`.trim() }),
        bewertung.get(p.id)))),
    ],
    knoepfe,
  });

  if (ergebnis === 'ok') {
    const werte = new Map([...bewertung].map(([id, eingabe]) => [id, eingabe.value.trim()]));
    const anzahl = [...werte.values()].filter(Boolean).length;
    if (anzahl === 0 && istNeu) {
      toast('Keine Bewertung eingetragen – nichts gespeichert.', { dauer: 3500 });
      return false;
    }
    if (anzahl === 0) return loeschen(klasseId, lkId);
    // Datum unverändert: Zeitpunkt behalten (sonst rutscht die Spalte in der Übersicht)
    const zeitpunkt = erste && fuerDatum(erste.zeitpunkt) === datum.value ? erste.zeitpunkt : zeitpunktAm(datum.value);
    await db.speichereLeistungskontrolle(
      { lkId: lkId || db.neueId(), klasseId, art: art.value.trim(), titel: titel.value.trim(), zeitpunkt }, werte);
    toast(`${art.value.trim()}: ${anzahl === 1 ? '1 Bewertung' : anzahl + ' Bewertungen'} gespeichert.`);
    return true;
  }
  if (ergebnis === 'loeschen') return loeschen(klasseId, lkId);
  return false;
}

async function loeschen(klasseId, lkId) {
  const weg = await db.loescheLeistungskontrolle(klasseId, lkId);
  toast('Leistungskontrolle gelöscht.', {
    knopf: 'Rückgängig', dauer: 6000,
    aktion: async () => { await db.speichereBeobachtungen(weg); app.neuZeichnen(); },
  });
  return true;
}
