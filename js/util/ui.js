// ui.js – kleine Hilfsfunktionen für die Oberfläche.

import { icon } from './icons.js';

// el('button', { class: 'knopf', onclick: f }, 'Text')  ->  <button class="knopf">Text</button>
// Eigenschaften:
//   class, text, value, style (Objekt), dataset (Objekt), on<Ereignis> (Funktion),
//   alles andere wird als HTML-Attribut gesetzt (true = Attribut ohne Wert).
export function el(tag, eigenschaften = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eigenschaften)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'value') e.value = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k === 'style') for (const [s, w] of Object.entries(v)) e.style.setProperty(s, w);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kind of kinder.flat()) {
    if (kind !== null && kind !== undefined && kind !== false) e.append(kind);
  }
  return e;
}

// Kurze Meldung unten am Bildschirm. Optional mit einem Knopf (z. B. "Rückgängig").
let toastTimer = null;
export function toast(text, { knopf = null, aktion = null, dauer = 2500 } = {}) {
  const box = document.getElementById('toast');
  box.replaceChildren(el('span', { text }));
  if (knopf && aktion) {
    box.append(el('button', {
      class: 'toast-knopf', text: knopf,
      onclick: () => { box.classList.remove('sichtbar'); aktion(); },
    }));
  }
  box.classList.add('sichtbar');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('sichtbar'), dauer);
}

// Zeigt einen Dialog (Popup) und wartet, bis ein Knopf gedrückt wird.
// Rückgabe: der "wert" des gedrückten Knopfs, oder null bei Abbrechen/Escape.
//
//   const ergebnis = await zeigeDialog({
//     titel: 'Neue Klasse',
//     inhalt: [eingabefeld1, eingabefeld2],
//     knoepfe: [{ text: 'Abbrechen' }, { text: 'Speichern', wert: 'ok', primaer: true }],
//   });
export function zeigeDialog({ titel, inhalt = [], knoepfe = [{ text: 'OK', wert: 'ok', primaer: true }] }) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: 'dialog' });
    // method="dialog": ein Absende-Knopf schließt den Dialog und setzt returnValue
    const form = el('form', { method: 'dialog' },
      el('h2', { text: titel }),
      el('div', { class: 'dialog-inhalt' }, inhalt),
      // Die Knöpfe stehen im HTML in UMGEKEHRTER Reihenfolge (CSS dreht sie wieder um).
      // Grund: Die Enter-Taste löst immer den ERSTEN Knopf aus – das soll der
      // Hauptknopf (zuletzt angegeben, z. B. "Speichern") sein, nie "Löschen".
      el('div', { class: 'dialog-knoepfe' },
        [...knoepfe].reverse().map((k) => el('button', {
          type: 'submit',
          value: k.wert || '',
          // "gefahr" als Hauptknopf = rot gefüllt (Sicherheitsfrage),
          // als Nebenknopf = nur rote Schrift (z. B. "Löschen" neben "Speichern")
          class: 'knopf' + (k.gefahr ? (k.primaer ? ' gefahr' : ' gefahr-leise') : (k.primaer ? ' primaer' : '')),
          // Abbrechen/Löschen sollen auch bei leeren Pflichtfeldern funktionieren
          formnovalidate: !k.primaer,
          // "fokus": dieser Knopf ist beim Öffnen ausgewählt (Enter löst ihn aus)
          autofocus: k.fokus,
          text: k.text,
        })),
      ),
    );
    dialog.append(form);
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue || null);
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

// Sicherheitsfrage im Stil der App (statt des Browser-Fensters von confirm()).
// Rückgabe: true, wenn bestätigt wurde. Mehrere Absätze im Text mit "\n" trennen.
// Bei "gefahr" (Löschen) ist "Abbrechen" vorausgewählt, damit ein versehentliches
// Enter nichts zerstört.
//
//   if (!await bestaetigen({ titel: 'Version löschen?', knopf: 'Löschen', gefahr: true })) return;
export async function bestaetigen({ titel, text = '', knopf = 'OK', gefahr = false }) {
  const ergebnis = await zeigeDialog({
    titel,
    inhalt: text.split('\n').filter(Boolean).map((absatz) => el('p', { text: absatz })),
    knoepfe: [{ text: 'Abbrechen', fokus: gefahr }, { text: knopf, wert: 'ok', primaer: true, gefahr }],
  });
  return ergebnis === 'ok';
}

// Beschriftetes Eingabefeld: <label>Text <input></label>
export function feld(beschriftung, eingabe) {
  return el('label', { class: 'feld' }, el('span', { text: beschriftung }), eingabe);
}

// Kopf einer Karte: farbiges Symbol + Überschrift
export function kartenKopf(symbol, titel, gefahr = false) {
  return el('div', { class: 'karten-kopf' },
    el('span', { class: 'karten-symbol' + (gefahr ? ' gefahr' : '') }, icon(symbol)),
    el('h2', { text: titel }),
  );
}

// Farbiger Hinweis mit Knopf für den nächsten Schritt:
//   "3 SuS haben noch keinen Platz."  [Plätze zuweisen ›]
export function tipp(text, knopfText, onclick) {
  return el('div', { class: 'tipp' },
    el('span', { class: 'wachsen', text }),
    el('button', { class: 'knopf klein primaer', onclick }, knopfText, icon('rechts')),
  );
}

// ----------------------------- Personen-Darstellung -----------------------

export function initialen(person) {
  return ((person.vorname || '').charAt(0) + (person.nachname || '').charAt(0)).toUpperCase() || '?';
}

// Foto oder farbiger Kreis mit Initialen
export function avatar(person) {
  if (person.foto) {
    return el('img', { class: 'avatar', src: person.foto, alt: '', draggable: 'false' });
  }
  return el('div', {
    class: 'avatar',
    style: { background: `hsl(${person.farbe ?? 210} 55% 45%)` },
  }, el('span', { text: initialen(person) }));
}

// Kurznamen für den Sitzplan: nur Vorname. Wenn zwei denselben Vornamen haben,
// kommt der erste Buchstabe des Nachnamens dazu ("Lena M.", "Lena S.").
export function kurznamen(personen) {
  const anzahl = {};
  for (const p of personen) anzahl[p.vorname] = (anzahl[p.vorname] || 0) + 1;
  const namen = new Map();
  for (const p of personen) {
    const doppelt = anzahl[p.vorname] > 1 && p.nachname;
    namen.set(p.id, doppelt ? `${p.vorname} ${p.nachname.charAt(0)}.` : (p.vorname || p.nachname));
  }
  return namen;
}

export function vollerName(person) {
  return `${person.vorname} ${person.nachname}`.trim();
}
