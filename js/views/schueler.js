// schueler.js – Schülerinnen und Schüler einer Klasse verwalten:
// anlegen, bearbeiten (Name, Foto, Notiz), löschen, Namensliste einfügen.

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, tipp, zeigeDialog, bestaetigen, feld, avatar, vollerName } from '../util/ui.js';
import { icon } from '../util/icons.js';
import { sitzplaetze } from '../util/raster.js';
import { fotoVerkleinern } from '../util/foto.js';

export async function zeichneSchueler(container) {
  const klasse = aktuelleKlasse();
  const [personen, plan, raum] = await Promise.all([
    db.ladePersonen(klasse.id),
    db.ladeAktuellenPlan(klasse.id),
    db.ladeRaum(klasse.raumId),
  ]);

  if (personen.length === 0) {
    container.append(el('div', { class: 'karte leer-hinweis' },
      el('div', { class: 'leer-symbol' }, icon('sus')),
      el('h2', { text: 'Noch keine SuS' }),
      el('p', { class: 'hinweis', text: 'Am schnellsten geht es mit einer kopierten Namensliste, z. B. aus Untis oder Excel.' }),
      el('button', { class: 'knopf primaer breit', onclick: () => listeImportieren(personen) }, icon('liste'), 'Namensliste einfügen'),
      el('button', { class: 'knopf breit', onclick: () => personBearbeiten(null) }, icon('plus'), 'Einzelne Person anlegen'),
    ));
    return;
  }

  container.append(el('div', { class: 'leiste fuellen' },
    el('button', { class: 'knopf primaer', onclick: () => personBearbeiten(null) }, icon('plus'), 'Person'),
    el('button', { class: 'knopf', onclick: () => listeImportieren(personen) }, icon('liste'), 'Liste einfügen'),
  ));

  // Nächster Schritt, solange nicht alle einen Platz haben
  const besetzt = new Set(Object.values(plan.zuordnung));
  const ohnePlatz = personen.filter((p) => !besetzt.has(p.id)).length;
  const hatPlaetze = !!raum && sitzplaetze(raum).length > 0;
  if (!hatPlaetze) {
    container.append(tipp(
      raum ? `In „${raum.name}“ sind noch keine Sitzplätze festgelegt.` : 'Diese Klasse hat noch keinen Raum.',
      raum ? 'Zum Raum' : 'Raum wählen',
      () => { state.ansicht = 'raum'; state.raumId = raum?.id ?? null; app.neuZeichnen(); }));
  } else if (ohnePlatz > 0) {
    container.append(tipp(
      ohnePlatz === personen.length ? 'Noch niemand hat einen Platz.' : `${ohnePlatz} SuS haben noch keinen Platz.`,
      'Plätze zuweisen',
      () => { state.ansicht = 'plan'; state.modus = 'bearbeiten'; app.neuZeichnen(); }));
  }

  container.append(
    el('p', { class: 'unterzeile', text: `${personen.length} Schülerinnen und Schüler` }),
    el('ul', { class: 'liste' }, personen.map((p) => el('li', {},
      el('button', { class: 'zeile', onclick: () => personBearbeiten(p) },
        avatar(p),
        el('span', { class: 'zeile-text' },
          el('strong', { text: `${p.nachname} ${p.vorname}`.trim() }),
          p.notiz ? el('small', { text: p.notiz }) : null,
        ),
        hatPlaetze && !besetzt.has(p.id) ? el('span', { class: 'etikett', text: 'ohne Platz' }) : null,
        el('span', { class: 'pfeil' }, icon('rechts')),
      ),
    ))),
  );
}

// Dialog zum Anlegen (person = null) oder Bearbeiten einer Person
async function personBearbeiten(person) {
  const klasse = aktuelleKlasse();
  const daten = person
    ? { ...person }
    : { klasseId: klasse.id, vorname: '', nachname: '', notiz: '', foto: null };

  const vorname = el('input', { required: true, value: daten.vorname, autocomplete: 'off', autocapitalize: 'words' });
  const nachname = el('input', { value: daten.nachname, autocomplete: 'off', autocapitalize: 'words' });
  const notiz = el('textarea', { rows: 2, value: daten.notiz || '', placeholder: 'z. B. Brille, sitzt besser vorne …' });

  // Foto-Vorschau (zeigt Initialen, solange kein Foto da ist).
  // "Foto entfernen" erscheint nur, wenn es ein Foto gibt.
  const vorschau = el('div', { class: 'foto-vorschau' });
  const entfernen = el('button', {
    type: 'button', class: 'knopf klein leise', text: 'Foto entfernen',
    onclick: () => { daten.foto = null; zeigeVorschau(); },
  });
  const zeigeVorschau = () => {
    vorschau.replaceChildren(avatar({ ...daten, vorname: vorname.value, nachname: nachname.value }));
    entfernen.hidden = !daten.foto;
  };
  zeigeVorschau();
  vorname.addEventListener('input', zeigeVorschau);
  nachname.addEventListener('input', zeigeVorschau);

  // Zwei unsichtbare Datei-Felder: eines öffnet direkt die Kamera, eines die Galerie
  const kamera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const galerie = el('input', { type: 'file', accept: 'image/*', hidden: true });
  for (const eingabe of [kamera, galerie]) {
    eingabe.addEventListener('change', async () => {
      const datei = eingabe.files[0];
      if (!datei) return;
      try {
        daten.foto = await fotoVerkleinern(datei);
        zeigeVorschau();
      } catch {
        toast('Das Foto konnte nicht geladen werden.');
      }
    });
  }

  const fotoBereich = el('div', { class: 'foto-bereich' },
    vorschau,
    el('div', { class: 'foto-knoepfe' },
      el('button', { type: 'button', class: 'knopf klein', onclick: () => kamera.click() }, icon('kamera'), 'Kamera'),
      el('button', { type: 'button', class: 'knopf klein', onclick: () => galerie.click() }, icon('bild'), 'Galerie'),
      entfernen,
    ),
    kamera, galerie,
  );

  // Von hier direkt zu den Beobachtungen der Person (schließt den Dialog mit dem Wert "verlauf").
  // type="button", damit die Enter-Taste weiterhin "Speichern" auslöst.
  const verlaufKnopf = person ? el('button', {
    type: 'button', class: 'knopf',
    onclick: (e) => e.currentTarget.closest('dialog').close('verlauf'),
  }, icon('verlauf'), 'Beobachtungen ansehen') : null;

  const knoepfe = [{ text: 'Abbrechen' }, { text: 'Speichern', wert: 'ok', primaer: true }];
  if (person) knoepfe.unshift({ text: 'Löschen', wert: 'loeschen', gefahr: true });

  const ergebnis = await zeigeDialog({
    titel: person ? 'Person bearbeiten' : 'Neue Person',
    inhalt: [fotoBereich, feld('Vorname', vorname), feld('Nachname', nachname), feld('Notiz (optional)', notiz), verlaufKnopf],
    knoepfe,
  });

  if (ergebnis === 'ok') {
    daten.vorname = vorname.value.trim();
    daten.nachname = nachname.value.trim();
    daten.notiz = notiz.value.trim();
    await db.speicherePerson(daten);
    toast(person ? 'Gespeichert.' : `${daten.vorname} angelegt.`);
    app.neuZeichnen();
  } else if (ergebnis === 'loeschen') {
    if (!await bestaetigen({
      titel: `${vollerName(person)} löschen?`,
      text: 'Alle Beobachtungen dieser Person werden ebenfalls gelöscht.',
      knopf: 'Löschen', gefahr: true,
    })) return;
    await db.loeschePerson(person);
    toast('Gelöscht.');
    app.neuZeichnen();
  } else if (ergebnis === 'verlauf') {
    state.personId = person.id;
    state.zurueck = 'schueler';
    state.ansicht = 'person';
    app.neuZeichnen();
  }
}

// Namensliste einfügen: eine Zeile pro Person
async function listeImportieren(vorhandene) {
  const klasse = aktuelleKlasse();
  const text = el('textarea', { rows: 10, placeholder: 'Anna Huber\nBen Gruber\nLena Maria Hofer\n…' });
  const format = el('select', {},
    el('option', { value: 'vn', text: 'Vorname Nachname' }),
    el('option', { value: 'nv', text: 'Nachname Vorname' }),
  );

  const ergebnis = await zeigeDialog({
    titel: 'Namensliste einfügen',
    inhalt: [
      el('p', { class: 'hinweis', text: 'Eine Zeile pro Person. „Nachname, Vorname“ mit Komma wird automatisch erkannt, ebenso aus Excel kopierte Spalten.' }),
      feld('Reihenfolge der Namen', format),
      text,
    ],
    knoepfe: [{ text: 'Abbrechen' }, { text: 'Importieren', wert: 'ok', primaer: true }],
  });
  if (ergebnis !== 'ok') return;

  // Schon vorhandene Namen merken, damit niemand doppelt angelegt wird
  const schonDa = new Set(vorhandene.map((p) => vollerName(p).toLowerCase()));
  let neu = 0, doppelt = 0;
  for (const zeile of text.value.split('\n')) {
    const name = zeileZerlegen(zeile, format.value);
    if (!name) continue;
    const schluessel = vollerName(name).toLowerCase();
    if (schonDa.has(schluessel)) { doppelt++; continue; }
    schonDa.add(schluessel);
    await db.speicherePerson({ klasseId: klasse.id, ...name, notiz: '', foto: null });
    neu++;
  }
  toast(`${neu} SuS angelegt` + (doppelt ? `, ${doppelt} übersprungen (schon vorhanden).` : '.'), { dauer: 3500 });
  app.neuZeichnen();
}

// Eine Zeile in { vorname, nachname } zerlegen.
// format: 'vn' = "Vorname Nachname", 'nv' = "Nachname Vorname"
// Mehrteilige Vornamen: Bei 'vn' ist das LETZTE Wort der Nachname.
export function zeileZerlegen(zeile, format) {
  zeile = zeile.trim().replace(/^\d+[.)]?\s+/, ''); // "1. Anna Huber" -> "Anna Huber"
  if (!zeile) return null;

  // Aus Excel/Untis kopiert: Spalten sind durch Tabulator getrennt
  if (zeile.includes('\t')) {
    const [a, b] = zeile.split('\t').map((t) => t.trim());
    if (b) return format === 'vn' ? { vorname: a, nachname: b } : { vorname: b, nachname: a };
    zeile = a;
  }
  // "Huber, Anna"
  if (zeile.includes(',')) {
    const [nach, vor] = zeile.split(',').map((t) => t.trim());
    return { vorname: vor || nach, nachname: vor ? nach : '' };
  }
  const teile = zeile.split(/\s+/);
  if (teile.length === 1) return { vorname: teile[0], nachname: '' };
  return format === 'vn'
    ? { vorname: teile.slice(0, -1).join(' '), nachname: teile.at(-1) }
    : { vorname: teile.slice(1).join(' '), nachname: teile[0] };
}
