// beobachtung.js – Hilfsfunktionen rund um Beobachtungen:
// Kategorienamen, Zeiträume (Heute, Woche, Semester …), Summen und Datumsformat.
// Ohne Oberfläche, damit leicht nachvollziehbar und testbar.

// Feste Kategorien. Dazu kommen die Schnellbuttons ('sb-<id>').
export const KATEGORIEN = {
  mitarbeit: 'Mitarbeit',
  verhalten: 'Verhalten',
  notiz: 'Notiz',
};

// Lesbarer Name einer Kategorie (auch für Schnellbuttons)
export function kategorieName(kategorie, schnellbuttons) {
  if (KATEGORIEN[kategorie]) return KATEGORIEN[kategorie];
  const sb = schnellbuttons.find((s) => 'sb-' + s.id === kategorie);
  return sb ? sb.name : kategorie;
}

// Alle Kategorien für Filter und Tabellen: Mitarbeit, Verhalten, Schnellbuttons, Notiz
export function alleKategorien(schnellbuttons, mitGeloeschten = false) {
  return [
    { id: 'mitarbeit', name: 'Mitarbeit' },
    { id: 'verhalten', name: 'Verhalten' },
    ...schnellbuttons
      .filter((s) => mitGeloeschten || !s.geloescht)
      .map((s) => ({ id: 'sb-' + s.id, name: s.name })),
    { id: 'notiz', name: 'Notiz' },
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
// Ergebnis: { mitarbeit: { plus: 3, minus: 1, summe: 2 }, 'sb-hue': { …, anzahl: 2 }, … }
export function summen(beobachtungen) {
  const s = {};
  for (const b of beobachtungen) {
    const k = (s[b.kategorie] ||= { plus: 0, minus: 0, summe: 0, anzahl: 0 });
    k.anzahl++;
    if (b.wert > 0) k.plus++;
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

// "+", "−" oder "•"
export function wertZeichen(wert) {
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

// Für <input type="datetime-local">: "2026-10-08T09:35" in ORTSZEIT
export function fuerEingabe(iso) {
  const d = new Date(iso);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
