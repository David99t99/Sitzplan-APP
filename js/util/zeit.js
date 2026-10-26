// zeit.js – Uhrzeiten für Stundenzeiten und Stundenplan.
//
// Uhrzeiten sind Texte wie "07:50" (so liefert sie <input type="time">). Mit
// führender Null lassen sie sich auch als Text vergleichen und sortieren.

export const TAGE = [
  { nr: 1, kurz: 'Mo', name: 'Montag' },
  { nr: 2, kurz: 'Di', name: 'Dienstag' },
  { nr: 3, kurz: 'Mi', name: 'Mittwoch' },
  { nr: 4, kurz: 'Do', name: 'Donnerstag' },
  { nr: 5, kurz: 'Fr', name: 'Freitag' },
];

// So viele Minuten vor der ersten Stunde zeigt der Sitzplan schon "1. Stunde ab 07:50"
const VORLAUF = 30;

// "07:50" -> 470 (Minuten seit Mitternacht); kein gültiger Wert -> null
export function minuten(text) {
  const t = /^(\d{1,2}):(\d{2})/.exec(text || '');
  return t ? Number(t[1]) * 60 + Number(t[2]) : null;
}

// 470 -> "07:50"
export function uhrzeit(min) {
  const z = (n) => String(n).padStart(2, '0');
  return `${z(Math.floor(min / 60) % 24)}:${z(min % 60)}`;
}

// 15 -> "15 Min", 80 -> "1 Std 20 Min"
export function dauerText(min) {
  if (min < 60) return `${min} Min`;
  const std = Math.floor(min / 60);
  return min % 60 ? `${std} Std ${min % 60} Min` : `${std} Std`;
}

// Wochentag 1 (Montag) … 7 (Sonntag)
export function wochentag(datum = new Date()) {
  return ((datum.getDay() + 6) % 7) + 1;
}

// Sekunden seit Mitternacht (für "noch … Min" und den Fortschrittsbalken)
export function sekunden(datum = new Date()) {
  return datum.getHours() * 3600 + datum.getMinutes() * 60 + datum.getSeconds();
}

// Wo steht die Uhr gerade in den Stundenzeiten einer Schule?
//   { art: 'stunde',  nr: 3, von, bis, rest: 12, anteil: 0.76 }  die 3. Stunde läuft, noch 12 Minuten
//   { art: 'pause',   nr: 4, von, bis, rest: 4 }                 Pause, die 4. Stunde beginnt in 4 Minuten
//   { art: 'vorher',  nr: 1, von, bis, rest: 20 }                kurz vor der ersten Stunde
//   null  Wochenende, lange vor der ersten oder nach der letzten Stunde
// Stunden ohne gültige Uhrzeit werden übersprungen.
export function stundeJetzt(stunden, jetzt = new Date()) {
  if (wochentag(jetzt) > 5) return null;
  const sek = sekunden(jetzt);
  let erste = true;
  for (const [i, s] of stunden.entries()) {
    const von = minuten(s.von), bis = minuten(s.bis);
    if (von === null || bis === null || bis <= von) continue;
    const lage = { nr: i + 1, von: s.von, bis: s.bis };
    if (sek < von * 60) {
      const rest = Math.ceil((von * 60 - sek) / 60);
      if (erste && rest > VORLAUF) return null;
      return { ...lage, art: erste ? 'vorher' : 'pause', rest };
    }
    if (sek < bis * 60) {
      return {
        ...lage, art: 'stunde',
        rest: Math.ceil((bis * 60 - sek) / 60),
        anteil: (sek - von * 60) / ((bis - von) * 60),
      };
    }
    erste = false;
  }
  return null;
}

// ----------------------------------------------------------------- Mitlaufende Anzeige
//
// Ein Element, das mit der Uhr mitgeht ("noch 12 Min"), ohne dass die ganze Seite
// neu gezeichnet wird (das würde z. B. ein gerade begonnenes Antippen abbrechen).
// berechne(element) füllt das Element: gleich jetzt und dann alle 10 Sekunden,
// solange es auf der Seite steht.
const berechnungen = new WeakMap();

export function mitlaufend(element, berechne) {
  element.classList.add('mitlaufend');
  berechnungen.set(element, berechne);
  berechne(element);
  return element;
}

function alleAktualisieren() {
  for (const e of document.querySelectorAll('.mitlaufend')) berechnungen.get(e)?.(e);
}
setInterval(alleAktualisieren, 10000);
// Zurück aus dem Hintergrund: sofort, nicht erst beim nächsten Takt
document.addEventListener('visibilitychange', () => { if (!document.hidden) alleAktualisieren(); });
