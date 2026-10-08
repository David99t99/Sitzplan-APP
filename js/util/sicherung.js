// sicherung.js – Backup (JSON inkl. Fotos), Import und CSV-Export.

import * as db from '../db.js';
import { dateiAusgeben } from './datei.js';
import { kategorieName } from './beobachtung.js';

const FORMAT = 'sitzplan-backup';
// 1 = bis App v6 (Raster im Sitzplan, Raumvorlagen), 2 = ab v7 (eigenständige Räume).
// Ältere Backups stellt db.alleDatenErsetzen() beim Einspielen um.
const FORMAT_VERSION = 2;

const heuteText = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

// ---------------------------------------------------------------- Backup

// Alle Daten als eine JSON-Datei ausgeben. Fotos stecken als Text (Data-URL) mit drin.
export async function backupExportieren() {
  const daten = await db.alleDatenLesen();
  const inhalt = JSON.stringify({
    format: FORMAT,
    version: FORMAT_VERSION,
    erstellt: new Date().toISOString(),
    daten,
  });
  const ok = await dateiAusgeben(`sitzplan-backup-${heuteText()}.json`, inhalt, 'application/json');
  if (ok) await db.speichereEinstellung('letztesBackup', new Date().toISOString());
  return ok;
}

// Prüft eine eingelesene Backup-Datei. Rückgabe: { daten, zusammenfassung } oder Fehler (throw).
export function backupPruefen(text) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges Backup (kein JSON).'); }
  if (json?.format !== FORMAT || !json.daten) throw new Error('Die Datei ist kein Sitzplan-Backup.');
  if (json.version > FORMAT_VERSION) throw new Error('Das Backup stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.');
  for (const name of ['klassen', 'sitzplaene', 'personen', 'beobachtungen']) {
    if (!Array.isArray(json.daten[name])) throw new Error(`Das Backup ist unvollständig („${name}“ fehlt).`);
  }
  const d = json.daten;
  return {
    daten: d,
    erstellt: json.erstellt,
    zusammenfassung: `${d.klassen.length} Klassen, ${d.personen.length} SuS, ${d.beobachtungen.length} Beobachtungen`,
  };
}

// ---------------------------------------------------------------- Erinnerung
//
// Liefert einen Erinnerungstext, wenn ein Backup fällig ist, sonst null.
// Einstellungen: backupIntervall (Tage, 0 = aus), letztesBackup, ersteNutzung, backupErinnerungBis
export async function backupErinnerung(anzahlKlassen) {
  if (anzahlKlassen === 0) return null;
  const jetzt = Date.now();
  const TAG = 24 * 60 * 60 * 1000;

  let erste = await db.ladeEinstellung('ersteNutzung');
  if (!erste) { erste = new Date().toISOString(); await db.speichereEinstellung('ersteNutzung', erste); }

  const intervall = await db.ladeEinstellung('backupIntervall', 30);
  if (!intervall) return null;
  const spaeter = await db.ladeEinstellung('backupErinnerungBis');
  if (spaeter && Date.parse(spaeter) > jetzt) return null;

  const letztes = await db.ladeEinstellung('letztesBackup');
  if (!letztes) {
    // Noch nie gesichert: nach einer Woche Nutzung erinnern
    return jetzt - Date.parse(erste) >= Math.min(intervall, 7) * TAG ? 'Du hast noch kein Backup erstellt.' : null;
  }
  const tage = Math.floor((jetzt - Date.parse(letztes)) / TAG);
  return tage >= intervall ? `Letztes Backup vor ${tage} Tagen.` : null;
}

export async function erinnerungVerschieben(tage = 3) {
  await db.speichereEinstellung('backupErinnerungBis', new Date(Date.now() + tage * 86400000).toISOString());
}

// ---------------------------------------------------------------- CSV
//
// Semikolon als Trennzeichen + BOM am Anfang: so öffnet Excel (deutsch) die Datei
// direkt richtig, inklusive Umlauten.

function csv(zeilen) {
  const zelle = (w) => {
    const t = String(w ?? '');
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + zeilen.map((z) => z.map(zelle).join(';')).join('\r\n');
}

const dateiname = (klasse, art) =>
  `${klasse.name}-${art}-${heuteText()}.csv`.replace(/[\\/:*?"<>|]/g, '_');

// Alle Beobachtungen (eine Zeile pro Eintrag)
export async function csvEintraege(klasse, beobachtungen, personen, schnellbuttons) {
  const nachId = new Map(personen.map((p) => [p.id, p]));
  const datum = new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const zeit = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' });
  const zeilen = [['Datum', 'Uhrzeit', 'Nachname', 'Vorname', 'Kategorie', 'Wertung', 'Notiz']];
  for (const b of [...beobachtungen].sort((x, y) => x.zeitpunkt.localeCompare(y.zeitpunkt))) {
    const p = nachId.get(b.personId);
    if (!p) continue;
    const d = new Date(b.zeitpunkt);
    zeilen.push([datum.format(d), zeit.format(d), p.nachname, p.vorname,
      kategorieName(b.kategorie, schnellbuttons), b.wert, b.text]);
  }
  return dateiAusgeben(dateiname(klasse, 'Beobachtungen'), csv(zeilen), 'text/csv');
}

// Die Übersichtstabelle (eine Zeile pro Person)
export async function csvUebersicht(klasse, kopf, zeilen) {
  return dateiAusgeben(dateiname(klasse, 'Uebersicht'), csv([kopf, ...zeilen]), 'text/csv');
}
