// beobachtung.js – Hilfsfunktionen rund um Beobachtungen:
// Kategorienamen, Zeiträume (Heute, Woche, Semester …), Summen und Datumsformat.
// Ohne Oberfläche, damit leicht nachvollziehbar und testbar.

// Feste Kategorien. Dazu kommen die Schnellbuttons ('sb-<id>').
export const KATEGORIEN = {
  mitarbeit: 'Mitarbeit',
  verhalten: 'Verhalten',
  abwesend: 'Abwesend',
  notiz: 'Notiz',
  leistung: 'Leistungskontrolle',
};

// Abwesenheit: ein Eintrag mit kategorie 'abwesend' und wert 0 (zählt nicht als plus/minus).
// Wer heute so einen Eintrag hat, gilt im Sitzplan als abwesend.
export const ABWESEND = 'abwesend';

export function istAbwesend(eintraege = []) {
  return eintraege.some((b) => b.kategorie === ABWESEND);
}

// Mitarbeit hat drei Stufen: + (wert 1), ✓ "passt, nichts Auffälliges" (wert 0) und − (wert −1).
// ✓ zählt nicht in die Summe, wird aber mitgezählt (summen(): "neutral").
export const istPasst = (b) => b.kategorie === 'mitarbeit' && b.wert === 0;

// Leistungskontrolle (Test, Arbeitsauftrag, Heftkontrolle …): ein Eintrag pro bewerteter Person mit
// kategorie 'leistung', wert 0 (zählt nicht als plus/minus) und dazu lkId, art, titel und bewertung (Text).
// Alle Einträge einer Kontrolle haben dieselbe lkId und denselben Zeitpunkt (siehe db.js).
export const LEISTUNG = 'leistung';

// Vorschläge für die Art (frei tippen geht trotzdem)
export const LK_ARTEN = ['Test', 'Schularbeit', 'Arbeitsauftrag', 'Heftkontrolle', 'Hausübung', 'Referat',
  'Mündliche Wiederholung', 'Projekt'];

// Fasst die Einträge zu Leistungskontrollen zusammen, älteste zuerst:
// [{ id, art, titel, zeitpunkt, ergebnisse: Map personId -> Eintrag }]
export function leistungskontrollen(beobachtungen) {
  const nachId = new Map();
  for (const b of beobachtungen) {
    if (b.kategorie !== LEISTUNG) continue;
    if (!nachId.has(b.lkId)) {
      nachId.set(b.lkId, { id: b.lkId, art: b.art, titel: b.titel, zeitpunkt: b.zeitpunkt, ergebnisse: new Map() });
    }
    nachId.get(b.lkId).ergebnisse.set(b.personId, b);
  }
  return [...nachId.values()].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt) || a.art.localeCompare(b.art, 'de'));
}

// Lesbarer Name einer Kategorie (auch für Schnellbuttons)
export function kategorieName(kategorie, schnellbuttons) {
  if (KATEGORIEN[kategorie]) return KATEGORIEN[kategorie];
  const sb = schnellbuttons.find((s) => 'sb-' + s.id === kategorie);
  return sb ? sb.name : kategorie;
}

// Alle Kategorien für Filter und Tabellen: Mitarbeit, Verhalten, Schnellbuttons, Abwesend, Notiz, Leistungskontrolle
export function alleKategorien(schnellbuttons, mitGeloeschten = false) {
  return [
    { id: 'mitarbeit', name: 'Mitarbeit' },
    { id: 'verhalten', name: 'Verhalten' },
    ...schnellbuttons
      .filter((s) => mitGeloeschten || !s.geloescht)
      .map((s) => ({ id: 'sb-' + s.id, name: s.name })),
    { id: ABWESEND, name: 'Abwesend' },
    { id: 'notiz', name: 'Notiz' },
    { id: LEISTUNG, name: 'Leistungskontrolle' },
  ];
}

// ----------------------------------------------------------------- Zeiträume
//
// Österreich: Das Schuljahr beginnt im September, das 2. Semester ungefähr im Februar.
// Den genauen Semesterwechsel hier bei Bedarf anpassen (Monat 1 = Februar, da 0 = Jänner).
const SEMESTER2_MONAT = 1;
const SEMESTER2_TAG = 1;

export const ZEITRAEUME = [
  { id: 'heute', name: 'Heute' },
  { id: 'woche', name: 'Diese Woche' },
  { id: 'monat', name: 'Dieser Monat' },
  { id: 'semester', name: 'Dieses Semester' },
  { id: 'schuljahr', name: 'Dieses Schuljahr' },
  { id: 'alle', name: 'Alle' },
  { id: 'eigen', name: 'Eigener Zeitraum …' },
];

// Liefert { ab, bis } als ISO-Texte (bis = exklusiv) oder null für "unbegrenzt".
// Bei 'eigen' werden von/bis als "JJJJ-MM-TT" aus Datumsfeldern übergeben.
export function zeitraumGrenzen(id, jetzt = new Date(), von = '', bis = '') {
  const tag = (j, m, t) => new Date(j, m, t).toISOString(); // lokale Mitternacht
  const j = jetzt.getFullYear(), m = jetzt.getMonth(), t = jetzt.getDate();

  switch (id) {
    case 'heute':
      return { ab: tag(j, m, t), bis: null };
    case 'woche': {
      const seitMontag = (jetzt.getDay() + 6) % 7; // Mo = 0 … So = 6
      return { ab: tag(j, m, t - seitMontag), bis: null };
    }
    case 'monat':
      return { ab: tag(j, m, 1), bis: null };
    case 'semester': {
      const sjStart = m >= 8 ? j : j - 1;               // Schuljahr ab September
      const wechsel = new Date(sjStart + 1, SEMESTER2_MONAT, SEMESTER2_TAG);
      return jetzt < wechsel
        ? { ab: tag(sjStart, 8, 1), bis: null }           // 1. Semester
        : { ab: wechsel.toISOString(), bis: null };       // 2. Semester
    }
    case 'schuljahr':
      return { ab: tag(m >= 8 ? j : j - 1, 8, 1), bis: null };
    case 'eigen': {
      const [vj, vm, vt] = (von || '').split('-').map(Number);
      const [bj, bm, bt] = (bis || '').split('-').map(Number);
      return {
        ab: von ? tag(vj, vm - 1, vt) : null,
        bis: bis ? tag(bj, bm - 1, bt + 1) : null, // "bis" inklusive des ganzen Tages
      };
    }
    default:
      return { ab: null, bis: null };
  }
}

export function imZeitraum(b, { ab, bis }) {
  return (!ab || b.zeitpunkt >= ab) && (!bis || b.zeitpunkt < bis);
}

// ----------------------------------------------------------------- Summen
//
// Ergebnis: { mitarbeit: { plus: 3, neutral: 2, minus: 1, summe: 2 }, 'sb-hue': { …, anzahl: 2 }, … }
// "neutral" zählt die Einträge mit wert 0 (bei Mitarbeit: ✓).
export function summen(beobachtungen) {
  const s = {};
  for (const b of beobachtungen) {
    const k = (s[b.kategorie] ||= { plus: 0, neutral: 0, minus: 0, summe: 0, anzahl: 0 });
    k.anzahl++;
    if (b.wert > 0) k.plus++;
    if (b.wert === 0) k.neutral++;
    if (b.wert < 0) k.minus++;
    k.summe += b.wert;
  }
  return s;
}

// ----------------------------------------------------------------- Anzeige

// Summe mit Vorzeichen und echtem Minuszeichen: "+3", "−1", "0"
export function summeText(n) {
  return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
}

// "+", "−" oder "•" – bei Mitarbeit steht für wert 0 das "✓"
export function wertZeichen(wert, kategorie = '') {
  if (wert === 0 && kategorie === 'mitarbeit') return '✓';
  return wert > 0 ? '+' : wert < 0 ? '−' : '•';
}

// "Mi, 08.10.2026, 09:35"
const datumFormat = new Intl.DateTimeFormat('de-AT', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
export function datumText(iso) {
  return datumFormat.format(new Date(iso));
}

// "Mittwoch, 8. Oktober 2026" – Überschrift für Tagesgruppen
const tagFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export function tagText(iso) {
  return tagFormat.format(new Date(iso));
}

const zeitFormat = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' });
export function uhrzeitText(iso) {
  return zeitFormat.format(new Date(iso));
}

// "12.10." (Spaltenköpfe), mit Jahr "12.10.2026"
const kurzFormat = new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit' });
const kurzMitJahrFormat = new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
export function datumKurz(iso, mitJahr = false) {
  return (mitJahr ? kurzMitJahrFormat : kurzFormat).format(new Date(iso));
}

// Für <input type="datetime-local">: "2026-10-08T09:35" in ORTSZEIT
export function fuerEingabe(iso) {
  const d = new Date(iso);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

// Für <input type="date">: "2026-10-08" in ORTSZEIT
export function fuerDatum(iso) {
  return fuerEingabe(iso).slice(0, 10);
}

// Zeitpunkt zu einem gewählten Datum ("2026-10-08"): heute = jetzt, sonst 12 Uhr an diesem Tag
export function zeitpunktAm(tag, jetzt = new Date()) {
  if (tag === fuerDatum(jetzt.toISOString())) return jetzt.toISOString();
  const [j, m, t] = tag.split('-').map(Number);
  return new Date(j, m - 1, t, 12).toISOString();
}
