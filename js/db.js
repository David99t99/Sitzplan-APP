// db.js – Datenmodell und alle Zugriffe auf die Datenbank.
//
// Die Daten liegen in IndexedDB (einer Datenbank im Browser, nur auf diesem Gerät).
// Dexie ist eine kleine Bibliothek, die IndexedDB deutlich angenehmer macht.
// Alle anderen Dateien greifen NUR über die Funktionen hier auf Daten zu.

import Dexie from '../lib/dexie.mjs';
import { ohneSitzplatz } from './util/raster.js';

export const db = new Dexie('sitzplan');

// ---------------------------------------------------------------------------
// Schema
// In der Zeichenkette stehen nur Primärschlüssel + Felder, nach denen gesucht wird.
// Alle weiteren Felder eines Objekts werden trotzdem gespeichert.
//
// Klasse      { id, name, fach, schuljahr, sortierung, raumId (oder null) }
// Raum        { id, name, zeilen, spalten,
//               felder: { "zeile-spalte": "sitz" | "pult" | "tafel" | "tuer" } }
// Sitzplan    { id, klasseId, aktuell (1 = aktuell, 0 = alte Version), datum, bezeichnung,
//               zuordnung: { "zeile-spalte": personId } }
//               Alte Versionen enthalten zusätzlich zeilen, spalten, felder:
//               das Raster des Raums, wie es beim Speichern war.
// Person      { id, klasseId, vorname, nachname, foto (JPEG als Data-URL), notiz, farbe, archiviert }
// Beobachtung { id, personId, klasseId, zeitpunkt, kategorie, wert, text }   (ab Phase 2)
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

// Version 2 (App v7): Räume sind eigenständig und gelten für alle Klassen, die
// darin sitzen. Vorher steckte das Raster in jedem Sitzplan, und "Raumvorlagen"
// waren nur Kopiervorlagen. Vorhandene Daten werden beim ersten Start umgestellt.
db.version(2).stores({
  raeume: 'id',
  vorlagen: null, // Tabelle entfällt, die Vorlagen werden zu Räumen
}).upgrade(async (tx) => {
  const neu = aufRaeumeUmstellen({
    klassen: await tx.table('klassen').toArray(),
    sitzplaene: await tx.table('sitzplaene').toArray(),
    vorlagen: await tx.table('vorlagen').toArray(),
  });
  await tx.table('raeume').bulkAdd(neu.raeume);
  await tx.table('klassen').bulkPut(neu.klassen);
  await tx.table('sitzplaene').bulkPut(neu.sitzplaene);
});

// Standardgröße eines neuen Rasters: 8 Spalten passen am Handy im Hochformat
// ohne seitliches Schieben in den Raum-Editor.
export const STANDARD_SPALTEN = 8;
export const STANDARD_ZEILEN = 10;

// Eindeutige IDs (Texte statt fortlaufender Zahlen -> später problemlos
// zwischen Geräten exportierbar, ohne dass sich IDs überschneiden).
export function neueId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Rückfall für unsichere Verbindungen (http im WLAN), wo randomUUID fehlt
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const kopie = (x) => JSON.parse(JSON.stringify(x)); // tiefe Kopie (Objekte in Objekten)

// ============================ Klassen ======================================

export async function ladeKlassen() {
  return db.klassen.orderBy('sortierung').toArray();
}

// Legt eine Klasse an und gleich dazu einen leeren aktuellen Sitzplan.
export async function legeKlasseAn({ name, fach = '', schuljahr = '', raumId = null }) {
  const alle = await db.klassen.toArray();
  const sortierung = alle.reduce((max, k) => Math.max(max, k.sortierung), 0) + 1;
  const klasse = { id: neueId(), name, fach, schuljahr, sortierung, raumId };
  const plan = leererPlan(klasse.id);

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
// Ihr Raum bleibt bestehen.
export async function loescheKlasse(klasseId) {
  await db.transaction('rw', db.klassen, db.sitzplaene, db.personen, db.beobachtungen, async () => {
    await db.sitzplaene.where('klasseId').equals(klasseId).delete();
    await db.personen.where('klasseId').equals(klasseId).delete();
    await db.beobachtungen.where('klasseId').equals(klasseId).delete();
    await db.klassen.delete(klasseId);
  });
}

// ============================ Räume ========================================
//
// Ein Raum gehört zu keiner Klasse: Mehrere Klassen können im selben Raum sitzen
// (klasse.raumId). Wer den Raum ändert, ändert ihn für alle diese Klassen.

export async function ladeRaeume() {
  const liste = await db.raeume.toArray();
  return liste.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
}

// Ein Raum, oder null (auch wenn id leer ist: Klasse ohne Raum)
export async function ladeRaum(id) {
  return id ? (await db.raeume.get(id)) ?? null : null;
}

async function ladeRaumDerKlasse(klasseId) {
  const klasse = await db.klassen.get(klasseId);
  return ladeRaum(klasse?.raumId);
}

// Neuer Raum. Mit zeilen/spalten/felder eines anderen Raums entsteht eine Kopie.
export async function legeRaumAn({ name, zeilen = STANDARD_ZEILEN, spalten = STANDARD_SPALTEN, felder = {} }) {
  const raum = { id: neueId(), name, zeilen, spalten, felder: kopie(felder) };
  await db.raeume.add(raum);
  return raum;
}

// Speichert einen Raum. Sitzt in einer seiner Klassen jemand auf einem Feld, das
// kein Sitzplatz mehr ist, verliert die Person den Platz.
// Rückgabe: die entfernten Zuordnungen [{ klasseId, key, personId }] – damit
// lässt sich ein Versehen mit gibPlaetzeZurueck() zurücknehmen.
export async function speichereRaum(raum) {
  const entfernt = [];
  await db.transaction('rw', db.raeume, db.klassen, db.sitzplaene, async () => {
    await db.raeume.put(raum);
    const klassen = await db.klassen.filter((k) => k.raumId === raum.id).toArray();
    for (const klasse of klassen) {
      const plan = await db.sitzplaene.where({ klasseId: klasse.id, aktuell: 1 }).first();
      const weg = plan ? ohneSitzplatz(plan.zuordnung, raum) : [];
      if (weg.length === 0) continue;
      for (const key of weg) {
        entfernt.push({ klasseId: klasse.id, key, personId: plan.zuordnung[key] });
        delete plan.zuordnung[key];
      }
      await db.sitzplaene.put(plan);
    }
  });
  return entfernt;
}

// Setzt Personen zurück auf die Plätze, die sie durch speichereRaum() verloren haben
// (sofern der Platz noch frei ist und die Person inzwischen nicht woanders sitzt).
export async function gibPlaetzeZurueck(entfernt) {
  await db.transaction('rw', db.sitzplaene, async () => {
    for (const { klasseId, key, personId } of entfernt) {
      const plan = await db.sitzplaene.where({ klasseId, aktuell: 1 }).first();
      if (!plan || plan.zuordnung[key] || Object.values(plan.zuordnung).includes(personId)) continue;
      plan.zuordnung[key] = personId;
      await db.sitzplaene.put(plan);
    }
  });
}

// Nur für Räume, in denen keine Klasse mehr sitzt (das prüft die Ansicht).
export async function loescheRaum(id) {
  await db.raeume.delete(id);
}

// Teilt einer Klasse einen Raum zu (raumId = null: kein Raum).
// SuS behalten ihren Platz, wenn es ihn im neuen Raum auch gibt. Verliert jemand
// den Platz, wird die bisherige Sitzordnung vorher als Version gesichert.
export async function weiseRaumZu(klasse, raumId) {
  const plan = await ladeAktuellenPlan(klasse.id);
  const weg = ohneSitzplatz(plan.zuordnung, await ladeRaum(raumId));
  if (weg.length) await speichereVersion(plan, 'Automatisch gesichert vor Raumwechsel');
  for (const key of weg) delete plan.zuordnung[key];
  klasse.raumId = raumId;
  await db.transaction('rw', db.klassen, db.sitzplaene, async () => {
    await db.klassen.update(klasse.id, { raumId });
    await db.sitzplaene.put(plan);
  });
}

// ============================ Sitzpläne ====================================
//
// Der Sitzplan einer Klasse enthält nur, WER auf welchem Feld sitzt (zuordnung).
// Wo die Plätze sind, steht im Raum der Klasse.

function leererPlan(klasseId) {
  return {
    id: neueId(),
    klasseId,
    aktuell: 1,
    datum: new Date().toISOString(),
    bezeichnung: '',
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
// Sie enthält auch das Raster des Raums von damals, damit die Vorschau nach
// einem Umbau oder Raumwechsel noch stimmt.

export async function ladeVersionen(klasseId) {
  const liste = await db.sitzplaene.where({ klasseId, aktuell: 0 }).toArray();
  return liste.sort((a, b) => b.datum.localeCompare(a.datum)); // neueste zuerst
}

export async function ladeVersion(id) {
  return db.sitzplaene.get(id);
}

// Speichert den übergebenen (aktuellen) Plan als neue Version
export async function speichereVersion(plan, bezeichnung = '') {
  const raum = await ladeRaumDerKlasse(plan.klasseId);
  const version = {
    ...kopie(plan),
    id: neueId(),
    aktuell: 0,
    datum: new Date().toISOString(),
    bezeichnung,
    zeilen: raum?.zeilen ?? STANDARD_ZEILEN,
    spalten: raum?.spalten ?? STANDARD_SPALTEN,
    felder: kopie(raum?.felder ?? {}),
  };
  await db.sitzplaene.add(version);
  return version;
}

// Holt eine Version zurück. Der bisherige Plan wird vorher automatisch als Version gesichert.
// Das Raster gehört dem Raum und bleibt, wie es heute ist: Wer damals auf einem
// Platz saß, den es im Raum nicht (mehr) gibt, kommt in "Ohne Platz".
export async function stelleVersionWiederHer(version) {
  const plan = await ladeAktuellenPlan(version.klasseId);
  await speichereVersion(plan, 'Automatisch gesichert vor Wiederherstellen');
  plan.zuordnung = kopie(version.zuordnung);
  const raum = await ladeRaumDerKlasse(version.klasseId);
  for (const key of ohneSitzplatz(plan.zuordnung, raum)) delete plan.zuordnung[key];
  await speicherePlan(plan);
}

export async function loescheVersion(id) {
  await db.sitzplaene.delete(id);
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

// Neue Reihenfolge nach dem Ziehen der Tabs: ids = alle Klassen von links nach rechts
export async function sortiereKlassen(ids) {
  await db.transaction('rw', db.klassen, async () => {
    for (const [i, id] of ids.entries()) await db.klassen.update(id, { sortierung: i + 1 });
  });
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
    raeume: await db.raeume.toArray(),
    sitzplaene: await db.sitzplaene.toArray(),
    personen: await db.personen.toArray(),
    beobachtungen: await db.beobachtungen.toArray(),
    einstellungen,
  };
}

// Ersetzt ALLE Klassen-Daten durch die übergebenen (Import eines Backups).
export async function alleDatenErsetzen(daten) {
  if (!daten.raeume) daten = aufRaeumeUmstellen(daten); // Backup aus der Zeit vor den Räumen
  const tabellen = [db.klassen, db.raeume, db.sitzplaene, db.personen, db.beobachtungen, db.einstellungen];
  await db.transaction('rw', tabellen, async () => {
    for (const name of ['klassen', 'raeume', 'sitzplaene', 'personen', 'beobachtungen']) {
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

// ============================ Umstellung auf Räume =========================
//
// Bis v6 hatte jede Klasse ihr eigenes Raster im Sitzplan und einen frei
// eingetippten Raumnamen; "Raumvorlagen" waren Kopiervorlagen. Diese Funktion
// macht daraus Räume – beim Update der Datenbank und beim Einspielen eines
// älteren Backups. Sie ändert die übergebenen Klassen und Sitzpläne.
//
// Klassen mit demselben Raster kommen in denselben Raum – außer sie hatten
// verschiedene Raumnamen eingetragen (z. B. "EDV Nord" und "EDV Süd").
// Aus jeder Vorlage wird ein Raum; die Sitzordnungen bleiben, wie sie sind.
export function aufRaeumeUmstellen(daten) {
  const raeume = (daten.vorlagen || []).map(({ id, name, zeilen, spalten, felder }) => ({ id, name, zeilen, spalten, felder }));
  const eingetragen = new Map(); // Raum -> Raumname (klein geschrieben), den seine Klassen eingetippt hatten
  const gleich = (a, b) =>
    Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

  const planVon = new Map(daten.sitzplaene.filter((p) => p.aktuell === 1).map((p) => [p.klasseId, p]));
  const gezeichnet = (k) => Object.keys(planVon.get(k.id)?.felder || {}).length > 0;
  // Zuerst die Klassen mit gezeichnetem Raster – die übrigen finden dann deren Räume am Namen
  const klassen = [...daten.klassen].sort((a, b) => gezeichnet(b) - gezeichnet(a) || a.sortierung - b.sortierung);

  for (const klasse of klassen) {
    const plan = planVon.get(klasse.id);
    const text = (klasse.raum || '').trim();
    const felder = plan?.felder || {};

    let raum = gezeichnet(klasse)
      ? raeume.find((r) => gleich(r.felder, felder)
        && (!text || !eingetragen.has(r) || eingetragen.get(r) === text.toLowerCase()))
      : raeume.find((r) => text && eingetragen.get(r) === text.toLowerCase());

    // Kein passender Raum: einen anlegen. Nur wer weder Raster noch Raumnamen hatte, bleibt ohne Raum.
    if (!raum && (text || gezeichnet(klasse))) {
      // "12" -> "Raum 12", "EDV Nord" bleibt; ohne Angabe "Raum 5a"
      let name = !text ? `Raum ${klasse.name}` : /^\d/.test(text) ? `Raum ${text}` : text;
      if (raeume.some((r) => r.name === name)) name += ` (${klasse.name})`;
      raum = {
        id: neueId(), name,
        zeilen: plan?.zeilen ?? STANDARD_ZEILEN,
        spalten: plan?.spalten ?? STANDARD_SPALTEN,
        felder,
      };
      raeume.push(raum);
    }
    if (raum && text && !eingetragen.has(raum)) eingetragen.set(raum, text.toLowerCase());

    klasse.raumId = raum ? raum.id : null;
    delete klasse.raum;
    if (plan) { delete plan.zeilen; delete plan.spalten; delete plan.felder; }
  }

  const { vorlagen, ...rest } = daten;
  return { ...rest, raeume };
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
