// db.js – Datenmodell und alle Zugriffe auf die Datenbank.
//
// Die Daten liegen in IndexedDB (einer Datenbank im Browser, nur auf diesem Gerät).
// Dexie ist eine kleine Bibliothek, die IndexedDB deutlich angenehmer macht.
// Alle anderen Dateien greifen NUR über die Funktionen hier auf Daten zu.

import Dexie from '../lib/dexie.mjs';

export const db = new Dexie('sitzplan');

// ---------------------------------------------------------------------------
// Schema (Version 1)
// In der Zeichenkette stehen nur Primärschlüssel + Felder, nach denen gesucht wird.
// Alle weiteren Felder eines Objekts werden trotzdem gespeichert.
//
// Klasse      { id, name, fach, raum, schuljahr, sortierung }
// Sitzplan    { id, klasseId, aktuell (1 = aktuell, 0 = alte Version), datum, bezeichnung,
//               zeilen, spalten,
//               felder:    { "zeile-spalte": "sitz" | "pult" | "tafel" | "tuer" },
//               zuordnung: { "zeile-spalte": personId } }
// Person      { id, klasseId, vorname, nachname, foto (JPEG als Data-URL), notiz, farbe, archiviert }
// Beobachtung { id, personId, klasseId, zeitpunkt, kategorie, wert, text }   (ab Phase 2)
// Vorlage     { id, name, zeilen, spalten, felder }                          (ab Phase 3)
// Einstellung { schluessel, wert }
//
// Hinweis: "aktuell" ist 1/0 statt true/false, weil IndexedDB nach
// Wahrheitswerten nicht suchen kann.
// ---------------------------------------------------------------------------
db.version(1).stores({
  klassen: 'id, sortierung',
  sitzplaene: 'id, klasseId, [klasseId+aktuell]',
  personen: 'id, klasseId',
  beobachtungen: 'id, klasseId, personId, zeitpunkt',
  vorlagen: 'id',
  einstellungen: 'schluessel',
});

// Standardgröße eines neuen Rasters: 8 Spalten passen im Hochformat ohne Scrollen
// bei mindestens 44 px pro Feld.
export const STANDARD_SPALTEN = 8;
export const STANDARD_ZEILEN = 10;

// Eindeutige IDs (Texte statt fortlaufender Zahlen -> später problemlos
// zwischen Geräten exportierbar, ohne dass sich IDs überschneiden).
export function neueId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Rückfall für unsichere Verbindungen (http im WLAN), wo randomUUID fehlt
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ============================ Klassen ======================================

export async function ladeKlassen() {
  return db.klassen.orderBy('sortierung').toArray();
}

// Legt eine Klasse an und gleich dazu einen aktuellen Sitzplan
// (leer oder – wenn angegeben – mit dem Raster einer Raumvorlage).
export async function legeKlasseAn({ name, fach = '', raum = '', schuljahr = '' }, vorlage = null) {
  const alle = await db.klassen.toArray();
  const sortierung = alle.reduce((max, k) => Math.max(max, k.sortierung), 0) + 1;
  const klasse = { id: neueId(), name, fach, raum, schuljahr, sortierung };
  const plan = leererPlan(klasse.id);
  if (vorlage) vorlageAnwenden(plan, vorlage);

  await db.transaction('rw', db.klassen, db.sitzplaene, async () => {
    await db.klassen.add(klasse);
    await db.sitzplaene.add(plan);
  });
  return klasse;
}

export async function speichereKlasse(klasse) {
  await db.klassen.put(klasse);
}

// Löscht eine Klasse mit ALLEM, was dazugehört (SuS, Pläne, Beobachtungen).
export async function loescheKlasse(klasseId) {
  await db.transaction('rw', db.klassen, db.sitzplaene, db.personen, db.beobachtungen, async () => {
    await db.sitzplaene.where('klasseId').equals(klasseId).delete();
    await db.personen.where('klasseId').equals(klasseId).delete();
    await db.beobachtungen.where('klasseId').equals(klasseId).delete();
    await db.klassen.delete(klasseId);
  });
}

// ============================ Sitzpläne ====================================

function leererPlan(klasseId) {
  return {
    id: neueId(),
    klasseId,
    aktuell: 1,
    datum: new Date().toISOString(),
    bezeichnung: '',
    zeilen: STANDARD_ZEILEN,
    spalten: STANDARD_SPALTEN,
    felder: {},
    zuordnung: {},
  };
}

// Der aktuelle Sitzplan einer Klasse (wird angelegt, falls er fehlt).
export async function ladeAktuellenPlan(klasseId) {
  let plan = await db.sitzplaene.where({ klasseId, aktuell: 1 }).first();
  if (!plan) {
    plan = leererPlan(klasseId);
    await db.sitzplaene.add(plan);
  }
  return plan;
}

export async function speicherePlan(plan) {
  await db.sitzplaene.put(plan);
}

// ============================ Personen (SuS) ===============================

// Alle (nicht archivierten) SuS einer Klasse, alphabetisch nach Nachname.
export async function ladePersonen(klasseId) {
  const liste = await db.personen.where('klasseId').equals(klasseId).toArray();
  return liste
    .filter((p) => !p.archiviert)
    .sort((a, b) =>
      (a.nachname + ' ' + a.vorname).localeCompare(b.nachname + ' ' + b.vorname, 'de'));
}

// Neue Person (ohne id) oder bestehende Person speichern.
export async function speicherePerson(person) {
  if (!person.id) {
    person.id = neueId();
    // Zufällige Farbe (Farbton 0–359) für den Initialen-Kreis
    person.farbe = Math.floor(Math.random() * 360);
    person.archiviert = false;
  }
  await db.personen.put(person);
  return person;
}

// Löscht eine Person, entfernt sie aus dem aktuellen Sitzplan und löscht ihre Beobachtungen.
export async function loeschePerson(person) {
  await db.transaction('rw', db.personen, db.sitzplaene, db.beobachtungen, async () => {
    const plan = await db.sitzplaene.where({ klasseId: person.klasseId, aktuell: 1 }).first();
    if (plan) {
      for (const key of Object.keys(plan.zuordnung)) {
        if (plan.zuordnung[key] === person.id) delete plan.zuordnung[key];
      }
      await db.sitzplaene.put(plan);
    }
    await db.beobachtungen.where('personId').equals(person.id).delete();
    await db.personen.delete(person.id);
  });
}

// ============================ Beobachtungen ================================
//
// Eine Beobachtung hängt an der PERSON (nicht am Platz) und übersteht daher jedes Umsetzen.
//   kategorie: 'mitarbeit' | 'verhalten' | 'notiz' | 'sb-<id>' (Schnellbutton, z. B. 'sb-hue')
//   wert:      +1, -1 oder 0 (Notizen)
//   zeitpunkt: ISO-Zeitstempel, z. B. "2026-10-08T07:45:12.000Z" (lässt sich als Text sortieren)
//   text:      optionale Notiz

export async function legeBeobachtungAn({ personId, klasseId, kategorie, wert, text = '' }) {
  const b = { id: neueId(), personId, klasseId, kategorie, wert, text, zeitpunkt: new Date().toISOString() };
  await db.beobachtungen.add(b);
  return b;
}

export async function speichereBeobachtung(b) {
  await db.beobachtungen.put(b);
}

export async function loescheBeobachtung(id) {
  await db.beobachtungen.delete(id);
}

// Alle Beobachtungen einer Klasse ab einem Zeitpunkt (ISO-Text oder null = alle), neueste zuerst
export async function ladeBeobachtungenKlasse(klasseId, ab = null, bis = null) {
  const liste = await db.beobachtungen.where('klasseId').equals(klasseId).toArray();
  return liste
    .filter((b) => (!ab || b.zeitpunkt >= ab) && (!bis || b.zeitpunkt < bis))
    .sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
}

// Alle Beobachtungen einer Person, neueste zuerst
export async function ladeBeobachtungenPerson(personId) {
  const liste = await db.beobachtungen.where('personId').equals(personId).toArray();
  return liste.sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
}

export async function ladePerson(id) {
  return db.personen.get(id);
}

// ============================ Schnellbuttons ===============================
//
// Die frei konfigurierbaren Knöpfe im Schnellmenü (gelten für alle Klassen).
// Gelöschte Knöpfe bleiben mit "geloescht: true" in der Liste, damit alte
// Einträge weiterhin ihren Namen anzeigen.

export const STANDARD_SCHNELLBUTTONS = [
  { id: 'hue', name: 'Hausübung vergessen', wert: -1 },
  { id: 'material', name: 'Material vergessen', wert: -1 },
];

export async function ladeSchnellbuttons() {
  return ladeEinstellung('schnellbuttons', STANDARD_SCHNELLBUTTONS);
}

export async function speichereSchnellbuttons(liste) {
  await speichereEinstellung('schnellbuttons', liste);
}

// ============================ Versionen der Sitzordnung ====================
//
// Eine Version ist eine eingefrorene Kopie des Sitzplans (aktuell = 0).
// Sie enthält auch das Raumraster, damit sie nach einem Umbau noch stimmt.

const kopie = (x) => JSON.parse(JSON.stringify(x)); // tiefe Kopie (Objekte in Objekten)

export async function ladeVersionen(klasseId) {
  const liste = await db.sitzplaene.where({ klasseId, aktuell: 0 }).toArray();
  return liste.sort((a, b) => b.datum.localeCompare(a.datum)); // neueste zuerst
}

export async function ladeVersion(id) {
  return db.sitzplaene.get(id);
}

// Speichert den übergebenen (aktuellen) Plan als neue Version
export async function speichereVersion(plan, bezeichnung = '') {
  const version = {
    ...kopie(plan),
    id: neueId(),
    aktuell: 0,
    datum: new Date().toISOString(),
    bezeichnung,
  };
  await db.sitzplaene.add(version);
  return version;
}

// Holt eine Version zurück. Der bisherige Plan wird vorher automatisch als Version gesichert.
export async function stelleVersionWiederHer(version) {
  const plan = await ladeAktuellenPlan(version.klasseId);
  await speichereVersion(plan, 'Automatisch gesichert vor Wiederherstellen');
  plan.zeilen = version.zeilen;
  plan.spalten = version.spalten;
  plan.felder = kopie(version.felder);
  plan.zuordnung = kopie(version.zuordnung);
  await speicherePlan(plan);
}

export async function loescheVersion(id) {
  await db.sitzplaene.delete(id);
}

// ============================ Raumvorlagen =================================
//
// Vorlage { id, name, zeilen, spalten, felder } – nur das Raster, keine SuS.

export async function ladeVorlagen() {
  const liste = await db.vorlagen.toArray();
  return liste.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export async function speichereVorlage(name, plan) {
  const vorlage = { id: neueId(), name, zeilen: plan.zeilen, spalten: plan.spalten, felder: kopie(plan.felder) };
  await db.vorlagen.add(vorlage);
  return vorlage;
}

export async function loescheVorlage(id) {
  await db.vorlagen.delete(id);
}

// Überträgt eine Vorlage auf einen Plan. SuS behalten ihren Platz, wenn er weiterhin ein Sitzplatz ist.
export function vorlageAnwenden(plan, vorlage) {
  plan.zeilen = vorlage.zeilen;
  plan.spalten = vorlage.spalten;
  plan.felder = kopie(vorlage.felder);
  for (const key of Object.keys(plan.zuordnung)) {
    if (plan.felder[key] !== 'sitz') delete plan.zuordnung[key];
  }
}

// ============================ Reihenfolge der Klassen ======================

// richtung: -1 = nach links, +1 = nach rechts
export async function verschiebeKlasse(klasseId, richtung) {
  const liste = await ladeKlassen();
  const i = liste.findIndex((k) => k.id === klasseId);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= liste.length) return;
  [liste[i].sortierung, liste[j].sortierung] = [liste[j].sortierung, liste[i].sortierung];
  await db.klassen.bulkPut([liste[i], liste[j]]);
}

// ============================ Sicherung (Export/Import) ====================

// Diese Einstellungen gehören zu den Daten und wandern mit ins Backup.
// Gerätebezogenes (PIN, letztes Backup, Ansicht) bleibt auf dem Gerät.
const EINSTELLUNGEN_IM_BACKUP = ['schnellbuttons'];

export async function alleDatenLesen() {
  const einstellungen = (await db.einstellungen.toArray())
    .filter((e) => EINSTELLUNGEN_IM_BACKUP.includes(e.schluessel));
  return {
    klassen: await db.klassen.toArray(),
    sitzplaene: await db.sitzplaene.toArray(),
    personen: await db.personen.toArray(),
    beobachtungen: await db.beobachtungen.toArray(),
    vorlagen: await db.vorlagen.toArray(),
    einstellungen,
  };
}

// Ersetzt ALLE Klassen-Daten durch die übergebenen (Import eines Backups).
export async function alleDatenErsetzen(daten) {
  const tabellen = [db.klassen, db.sitzplaene, db.personen, db.beobachtungen, db.vorlagen, db.einstellungen];
  await db.transaction('rw', tabellen, async () => {
    for (const name of ['klassen', 'sitzplaene', 'personen', 'beobachtungen', 'vorlagen']) {
      await db[name].clear();
      await db[name].bulkAdd(daten[name] || []);
    }
    for (const e of daten.einstellungen || []) {
      if (EINSTELLUNGEN_IM_BACKUP.includes(e.schluessel)) await db.einstellungen.put(e);
    }
    await db.einstellungen.delete('letzteKlasse');
  });
}

// Löscht wirklich alles (z. B. wenn die PIN vergessen wurde)
export async function alleDatenLoeschen() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
}

// ============================ Einstellungen ================================

export async function ladeEinstellung(schluessel, standard = null) {
  const eintrag = await db.einstellungen.get(schluessel);
  return eintrag ? eintrag.wert : standard;
}

export async function speichereEinstellung(schluessel, wert) {
  await db.einstellungen.put({ schluessel, wert });
}

// ============================ Speicherschutz ===============================

// Bittet den Browser, die Daten nicht automatisch zu löschen, wenn der
// Speicher knapp wird. Gibt true zurück, wenn das gewährt wurde.
export async function dauerhaftSpeichern() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
