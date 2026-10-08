// raster.js – Rechnen mit dem Raumraster (ohne Oberfläche, gut testbar).
//
// Jedes Feld hat einen Schlüssel "zeile-spalte", z. B. "0-3".
// Gespeichert wird immer aus SCHÜLERSICHT: Zeile 0 = vorne (bei der Tafel).
// Die Lehrersicht dreht nur die Anzeige um 180°.
//
// "raum" = der Raum mit seinem Raster (raum.felder), "plan" = der Sitzplan
// einer Klasse (plan.zuordnung: wer sitzt auf welchem Feld).

export const feldKey = (zeile, spalte) => `${zeile}-${spalte}`;
export const ausKey = (key) => key.split('-').map(Number);

// Die Feldtypen mit Beschriftung. "kurz" passt auch in ein einzelnes Feld.
export const FELDTYPEN = {
  sitz: { name: 'Sitzplatz', kurz: '' },
  pult: { name: 'Lehrertisch', kurz: 'Pult' },
  tafel: { name: 'Tafel', kurz: 'Tafel' },
  tuer: { name: 'Tür', kurz: 'Tür' },
};

// Liefert die Zeilen- und Spaltennummern in der Reihenfolge, in der sie
// angezeigt werden. Lehrersicht = alles umgedreht (180° gedreht).
export function anzeigeReihenfolge(von, bis, lehrersicht) {
  const liste = [];
  for (let i = von; i <= bis; i++) liste.push(i);
  return lehrersicht ? liste.reverse() : liste;
}

// Kleinstes Rechteck, das alle markierten Felder enthält.
// Damit zeigt der Sitzplan keine leeren Ränder an.
// (Geht auch mit einer gespeicherten Version – die hat ihr Raster in version.felder.)
export function belegterBereich(raum) {
  const keys = Object.keys(raum.felder);
  if (keys.length === 0) return null;
  let zMin = Infinity, zMax = -Infinity, sMin = Infinity, sMax = -Infinity;
  for (const key of keys) {
    const [z, s] = ausKey(key);
    zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    sMin = Math.min(sMin, s); sMax = Math.max(sMax, s);
  }
  return { zMin, zMax, sMin, sMax };
}

// Alle Sitzplatz-Schlüssel, sortiert von vorne links nach hinten rechts
export function sitzplaetze(raum) {
  return Object.keys(raum.felder)
    .filter((k) => raum.felder[k] === 'sitz')
    .sort((a, b) => {
      const [za, sa] = ausKey(a), [zb, sb] = ausKey(b);
      return za - zb || sa - sb;
    });
}

// Die Schlüssel einer Zuordnung, an denen der Raum keinen Sitzplatz hat
// (raum = null: Klasse ohne Raum, also alle).
export function ohneSitzplatz(zuordnung, raum) {
  return Object.keys(zuordnung).filter((key) => raum?.felder[key] !== 'sitz');
}

// Auf welchem Platz sitzt eine Person? (Schlüssel oder null)
export function platzVon(plan, personId) {
  return Object.keys(plan.zuordnung).find((k) => plan.zuordnung[k] === personId) || null;
}

// Person auf einen Platz setzen. Sitzt dort schon jemand, wird getauscht:
// Die andere Person bekommt den alten Platz (oder kommt in die Leiste "Ohne Platz").
export function platzieren(plan, personId, zielKey) {
  const alterKey = platzVon(plan, personId);
  const andere = plan.zuordnung[zielKey];
  if (alterKey) delete plan.zuordnung[alterKey];
  if (andere && alterKey) plan.zuordnung[alterKey] = andere;
  plan.zuordnung[zielKey] = personId;
}

// Person vom Platz nehmen (-> Leiste "Ohne Platz")
export function freigeben(plan, personId) {
  const key = platzVon(plan, personId);
  if (key) delete plan.zuordnung[key];
}

// Entfernt Zuordnungen, deren Platz kein Sitzplatz mehr ist
// oder deren Person nicht mehr existiert.
export function aufraeumen(plan, raum, personenIds) {
  for (const key of Object.keys(plan.zuordnung)) {
    if (raum?.felder[key] !== 'sitz' || (personenIds && !personenIds.has(plan.zuordnung[key]))) {
      delete plan.zuordnung[key];
    }
  }
}

// Zufallsverteilung: mischt die Personen (Fisher-Yates) und setzt sie der Reihe nach.
// Gibt die Anzahl der Personen zurück, die keinen Platz bekommen haben.
export function zufaelligVerteilen(plan, raum, personen) {
  const gemischt = personen.map((p) => p.id);
  for (let i = gemischt.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gemischt[i], gemischt[j]] = [gemischt[j], gemischt[i]];
  }
  const plaetze = sitzplaetze(raum);
  plan.zuordnung = {};
  plaetze.forEach((key, i) => { if (i < gemischt.length) plan.zuordnung[key] = gemischt[i]; });
  return Math.max(0, gemischt.length - plaetze.length);
}
