// datei.js – eine Datei (Backup, CSV) aus der App heraus speichern.
//
// Laptop (Maus):  normaler Download in den Ordner "Downloads".
// iPhone (Touch): Teilen-Menü von iOS. Dort "In Dateien sichern", AirDrop oder Mail wählen.
//
// Warum zwei Schritte am iPhone ("Datei vorbereiten" -> "Teilen")?
// Safari erlaubt das Teilen-Menü nur direkt nach einem Fingertipp. Das Zusammenstellen
// der Daten dauert einen Moment, deshalb braucht es einen zweiten Tipp.

import { el } from './ui.js';

// Rückgabe: true, wenn die Datei (wahrscheinlich) gespeichert wurde, sonst false.
export function dateiAusgeben(dateiname, inhalt, typ) {
  const datei = new File([inhalt], dateiname, { type: typ });
  const touch = matchMedia('(pointer: coarse)').matches;

  if (touch && navigator.canShare && navigator.canShare({ files: [datei] })) {
    return teilenDialog(datei);
  }
  herunterladen(datei);
  return Promise.resolve(true);
}

function herunterladen(datei) {
  const url = URL.createObjectURL(datei);
  const a = el('a', { href: url, download: datei.name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function teilenDialog(datei) {
  return new Promise((resolve) => {
    let ergebnis = false;
    const groesse = datei.size > 1024 * 1024
      ? (datei.size / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'
      : Math.ceil(datei.size / 1024) + ' KB';

    const dialog = el('dialog', { class: 'dialog' },
      el('h2', { text: 'Datei ist bereit' }),
      el('p', { class: 'hinweis', text: `${datei.name} (${groesse})` }),
      el('p', { class: 'hinweis', text: 'Im nächsten Schritt „In Dateien sichern“ wählen (z. B. iCloud Drive oder „Auf meinem iPhone“) oder per AirDrop/Mail senden.' }),
      el('div', { class: 'dialog-knoepfe' },
        el('button', {
          class: 'knopf primaer', type: 'button', text: 'Teilen / Sichern …',
          onclick: async () => {
            try {
              await navigator.share({ files: [datei], title: datei.name });
              ergebnis = true;
              dialog.close();
            } catch (e) {
              // AbortError = im Teilen-Menü abgebrochen -> Dialog bleibt offen
              if (e.name !== 'AbortError') { herunterladen(datei); ergebnis = true; dialog.close(); }
            }
          },
        }),
        el('button', { class: 'knopf', type: 'button', text: 'Abbrechen', onclick: () => dialog.close() }),
      ),
    );
    dialog.addEventListener('close', () => { dialog.remove(); resolve(ergebnis); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

// Eine vom Benutzer gewählte Datei als Text lesen (für den Import)
export function dateiWaehlen(accept) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', async () => {
      const datei = input.files[0];
      input.remove();
      resolve(datei ? { name: datei.name, text: await datei.text() } : null);
    });
    // Auswahl abgebrochen (neuere Browser melden das mit "cancel")
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    document.body.append(input);
    input.click();
  });
}
