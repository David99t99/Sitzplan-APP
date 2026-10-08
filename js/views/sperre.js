// sperre.js – optionale PIN-Sperre.
//
// WICHTIG: Die PIN ist ein Sichtschutz (z. B. wenn jemand kurz das Handy in die Hand
// nimmt), keine Verschlüsselung. Die Daten selbst schützt die Gerätesperre des iPhones.
//
// Gespeichert wird nie die PIN selbst, sondern nur ein "Fingerabdruck" (Hash)
// aus PIN + Zufallswert ("Salt").

import * as db from '../db.js';
import { el, toast, bestaetigen, feld, kartenKopf } from '../util/ui.js';
import { icon } from '../util/icons.js';

// ----------------------------------------------------------------- Hash

async function hashBerechnen(pin, salt) {
  const text = salt + ':' + pin;
  if (crypto.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Rückfall ohne https (z. B. Test im WLAN über http): einfacher Hash (FNV-1a)
  let h = 0x811c9dc5;
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'fnv-' + h.toString(16);
}

export async function pinLaden() {
  return db.ladeEinstellung('pin', null); // { salt, hash, laenge } oder null
}

export async function pinSetzen(pin) {
  const salt = db.neueId();
  await db.speichereEinstellung('pin', { salt, hash: await hashBerechnen(pin, salt), laenge: pin.length });
}

export async function pinEntfernen() {
  await db.speichereEinstellung('pin', null);
}

async function pinStimmt(pin, gespeichert) {
  return (await hashBerechnen(pin, gespeichert.salt)) === gespeichert.hash;
}

// ----------------------------------------------------------------- Sperrbildschirm

let sperreOffen = false;

// Zeigt den Sperrbildschirm, falls eine PIN gesetzt ist. Wartet, bis die richtige PIN eingegeben wurde.
export async function sperren() {
  const gespeichert = await pinLaden();
  if (!gespeichert || sperreOffen) return;
  sperreOffen = true;

  // Offene Fenster (z. B. Schnellmenü) schließen, damit nichts über der Sperre liegt
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  document.body.classList.add('gesperrt');

  await new Promise((resolve) => {
    let eingabe = '';
    const punkte = el('div', { class: 'pin-punkte', 'aria-live': 'polite' });
    const meldung = el('p', { class: 'pin-meldung' });

    const zeigePunkte = () => punkte.replaceChildren(
      ...Array.from({ length: gespeichert.laenge }, (_, i) => el('span', { class: 'pin-punkt' + (i < eingabe.length ? ' voll' : '') })));
    zeigePunkte();

    async function ziffer(z) {
      if (eingabe.length >= gespeichert.laenge) return;
      eingabe += z;
      zeigePunkte();
      if (eingabe.length < gespeichert.laenge) return;

      if (await pinStimmt(eingabe, gespeichert)) {
        aufheben();
      } else {
        meldung.textContent = 'Falsche PIN';
        box.classList.add('wackeln');
        setTimeout(() => { box.classList.remove('wackeln'); eingabe = ''; zeigePunkte(); }, 450);
      }
    }
    const loeschen = () => { eingabe = eingabe.slice(0, -1); meldung.textContent = ''; zeigePunkte(); };

    // Tastatur am Laptop: Ziffern, Rücktaste
    const taste = (e) => {
      if (/^\d$/.test(e.key)) ziffer(e.key);
      else if (e.key === 'Backspace') loeschen();
    };
    document.addEventListener('keydown', taste);

    const knopf = (text, aktion, klasse = 'pin-taste') =>
      el('button', { class: klasse, type: 'button', text, onclick: aktion });

    const box = el('div', { class: 'pin-box' },
      el('div', { class: 'pin-symbol' }, icon('schloss')),
      el('h2', { text: 'PIN eingeben' }),
      punkte,
      meldung,
      el('div', { class: 'pin-tasten' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((z) => knopf(z, () => ziffer(z))),
        knopf('Vergessen?', pinVergessen, 'pin-taste klein'),
        knopf('0', () => ziffer('0')),
        knopf('Löschen', loeschen, 'pin-taste klein'),
      ),
    );
    const overlay = el('div', { class: 'sperre', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'App gesperrt' }, box);
    document.body.append(overlay);

    function aufheben() {
      document.removeEventListener('keydown', taste);
      overlay.remove();
      document.body.classList.remove('gesperrt');
      sperreOffen = false;
      resolve();
    }
  });
}

// PIN vergessen: Es gibt keine Hintertür. Nur alles löschen hilft (danach Backup einspielen).
async function pinVergessen() {
  if (!await bestaetigen({
    titel: 'PIN vergessen?',
    text: 'Die PIN lässt sich nicht zurücksetzen.\nDu kannst nur ALLE Daten auf diesem Gerät löschen und danach ein Backup einspielen.',
    knopf: 'Alle Daten löschen', gefahr: true,
  })) return;
  if (!await bestaetigen({
    titel: 'Wirklich alles löschen?',
    text: 'ALLE Klassen, SuS und Beobachtungen auf diesem Gerät werden endgültig gelöscht.',
    knopf: 'Endgültig löschen', gefahr: true,
  })) return;
  await db.alleDatenLoeschen();
  location.reload();
}

// Automatisch sperren, wenn die App eine Weile im Hintergrund war.
// (Am iPhone wird eine Homescreen-App oft nicht neu gestartet, sondern nur fortgesetzt.)
export function automatischSperren() {
  let verstecktSeit = null;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { verstecktSeit = Date.now(); return; }
    if (verstecktSeit === null) return;
    const minuten = await db.ladeEinstellung('pinSperreNach', 5);
    if (Date.now() - verstecktSeit >= minuten * 60000) sperren();
    verstecktSeit = null;
  });
}

// ----------------------------------------------------------------- Einstellungen

// Karte für die Seite "Mehr": PIN aktivieren, ändern, entfernen
export async function pinKarte(neuZeichnen) {
  const gespeichert = await pinLaden();
  const karte = el('div', { class: 'karte' }, kartenKopf('schloss', 'PIN-Sperre'));

  const pinFelder = () => {
    const opt = { type: 'password', inputmode: 'numeric', pattern: '[0-9]{4,8}', maxlength: 8, autocomplete: 'off', required: true };
    return [el('input', opt), el('input', opt)];
  };
  const neuForm = (knopfText) => {
    const [a, b] = pinFelder();
    return el('form', {
      class: 'pin-form',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!/^\d{4,8}$/.test(a.value)) return toast('Die PIN muss 4 bis 8 Ziffern haben.');
        if (a.value !== b.value) return toast('Die beiden Eingaben stimmen nicht überein.');
        await pinSetzen(a.value);
        toast('PIN gespeichert.');
        neuZeichnen();
      },
    }, feld('Neue PIN (4–8 Ziffern)', a), feld('PIN wiederholen', b),
    el('button', { class: 'knopf primaer', type: 'submit', text: knopfText }));
  };

  if (!gespeichert) {
    karte.append(
      el('p', { class: 'hinweis', text: 'Optional. Beim Öffnen der App wird eine PIN abgefragt. Das ist ein Sichtschutz – den eigentlichen Schutz bietet die Sperre deines Geräts.' }),
      neuForm('PIN aktivieren'),
    );
    return karte;
  }

  const sperreNach = el('select', {
    onchange: async (e) => { await db.speichereEinstellung('pinSperreNach', Number(e.target.value)); toast('Gespeichert.'); },
  }, [[0, 'sofort'], [1, 'nach 1 Minute'], [5, 'nach 5 Minuten'], [15, 'nach 15 Minuten'], [60, 'nach 1 Stunde']]
    .map(([w, t]) => el('option', { value: w, text: t })));
  sperreNach.value = String(await db.ladeEinstellung('pinSperreNach', 5));

  const aendern = el('details', {}, el('summary', { class: 'knopf', text: 'PIN ändern' }), neuForm('Neue PIN speichern'));

  karte.append(
    el('p', { class: 'status gut' }, icon('haken'), 'PIN-Sperre ist aktiv.'),
    feld('Sperren, wenn die App im Hintergrund war', sperreNach),
    el('div', { class: 'leiste fuellen' },
      el('button', { class: 'knopf', onclick: sperren }, icon('schloss'), 'Jetzt sperren'),
      el('button', {
        class: 'knopf gefahr-leise', text: 'PIN entfernen',
        onclick: async () => {
          if (!await bestaetigen({ titel: 'PIN-Sperre ausschalten?', knopf: 'Ausschalten' })) return;
          await pinEntfernen();
          toast('PIN-Sperre ausgeschaltet.');
          neuZeichnen();
        },
      }),
    ),
    aendern,
  );
  return karte;
}
