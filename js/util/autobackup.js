// autobackup.js – automatisches Backup in einen Ordner auf dem Laptop.
//
// Edge und Chrome am Computer erlauben einer Web-App, mit Erlaubnis in einen Ordner zu
// schreiben (File System Access API). Der Ordner wird einmal gewählt und in der Datenbank
// gemerkt – nur auf diesem Gerät, er kommt nicht ins Backup. Ist ein Backup fällig, schreibt
// die App beim Öffnen "sitzplan-backup-JJJJ-MM-TT-automatisch.json" hinein und behält die
// letzten AUFBEWAHREN davon (eigene, von Hand erstellte Backups im Ordner bleiben unberührt).
//
// Erlaubnis: Der Browser fragt nach. Mit "Bei jedem Besuch zulassen" läuft es danach ohne
// Nachfrage. Sonst muss nach einem Neustart des Browsers einmal geklickt werden – das darf
// der Browser nur direkt nach einem Klick fragen (deshalb "mitNachfrage").
//
// Einstellungen: autoBackupOrdner (der Ordner), autoBackupTage (1 oder 7), letztesAutoBackup (ISO)

import * as db from '../db.js';
import { backupInhalt, backupDateiname } from './sicherung.js';

const AUFBEWAHREN = 10;
const ENDUNG = '-automatisch.json';
const TAG = 24 * 60 * 60 * 1000;

// Geht das in diesem Browser? (nicht am iPhone, nicht in Firefox/Safari)
export const moeglich = () => 'showDirectoryPicker' in window;

export async function ladeOrdner() {
  return db.ladeEinstellung('autoBackupOrdner');
}

// Ordner wählen lassen. Rückgabe: der Ordner, oder null bei Abbrechen.
export async function ordnerWaehlen() {
  let ordner;
  try {
    ordner = await window.showDirectoryPicker({ id: 'sitzplan-backup', mode: 'readwrite', startIn: 'documents' });
  } catch (e) {
    if (e.name === 'AbortError') return null;
    throw e;
  }
  await db.speichereEinstellung('autoBackupOrdner', ordner);
  return ordner;
}

export async function ausschalten() {
  await db.speichereEinstellung('autoBackupOrdner', null);
}

// Fällig, wenn seit dem letzten automatischen Backup so viele Kalendertage vergangen sind
// (wöchentlich: Montag gesichert -> nächsten Montag wieder, egal zu welcher Uhrzeit)
export async function faellig() {
  if (!moeglich() || !await ladeOrdner()) return false;
  const tage = await db.ladeEinstellung('autoBackupTage', 7);
  const letztes = await db.ladeEinstellung('letztesAutoBackup');
  if (!letztes) return true;
  const mitternacht = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((mitternacht(new Date()) - mitternacht(new Date(letztes))) / TAG) >= tage;
}

// Schreibt ein Backup in den Ordner.
// Rückgabe: 'ok' | 'erlaubnis' (es braucht einen Klick zum Erlauben) | 'fehler' | 'aus'
export async function sichern({ mitNachfrage = false } = {}) {
  const ordner = await ladeOrdner();
  if (!ordner) return 'aus';
  let erlaubnis = await ordner.queryPermission({ mode: 'readwrite' });
  if (erlaubnis === 'prompt' && mitNachfrage) erlaubnis = await ordner.requestPermission({ mode: 'readwrite' });
  if (erlaubnis !== 'granted') return 'erlaubnis';

  try {
    const datei = await ordner.getFileHandle(backupDateiname().replace('.json', ENDUNG), { create: true });
    const schreiben = await datei.createWritable();
    await schreiben.write(await backupInhalt());
    await schreiben.close();
    await aufraeumen(ordner);
  } catch (e) {
    console.warn('Automatisches Backup:', e); // z. B. Ordner gelöscht oder umbenannt
    return 'fehler';
  }
  const jetzt = new Date().toISOString();
  await db.speichereEinstellung('letztesAutoBackup', jetzt);
  await db.speichereEinstellung('letztesBackup', jetzt); // keine Backup-Erinnerung mehr nötig
  return 'ok';
}

// Nur die letzten AUFBEWAHREN automatischen Backups behalten. Das Datum im Namen
// sortiert alphabetisch richtig (alt -> neu).
async function aufraeumen(ordner) {
  const namen = [];
  for await (const name of ordner.keys()) {
    if (name.startsWith('sitzplan-backup-') && name.endsWith(ENDUNG)) namen.push(name);
  }
  namen.sort();
  for (const name of namen.slice(0, -AUFBEWAHREN)) await ordner.removeEntry(name);
}
