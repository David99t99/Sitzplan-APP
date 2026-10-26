// stundenplan.js – die Ansicht "Stundenplan" und die Schulen.
//
// Eine Schule hat eine Farbe und ihre Stundenzeiten (1. Stunde 07:50–08:40 …).
// Die Farbe erscheint als Strich unter den Klassen-Tabs, die Stundenzeiten im
// Sitzplan ("3. Stunde 09:50–10:40 · noch 12 Min").
//
//   Tag     – die Stunden eines Wochentags mit Uhrzeit, Pausen und "noch … Min"
//   Woche   – der Stundenplan einer Schule als Raster: Feld antippen = Klasse eintragen
//   Schule  – Stundenzeiten, Name, Farbe und Klassen einer Schule (state.schuleId)

import { state, app, aktuelleKlasse } from '../state.js';
import * as db from '../db.js';
import { el, toast, zeigeDialog, bestaetigen, feld, kartenKopf } from '../util/ui.js';
import { icon } from '../util/icons.js';
import { TAGE, minuten, uhrzeit, dauerText, wochentag, sekunden, stundeJetzt, mitlaufend } from '../util/zeit.js';

// Farben zur Auswahl. "hell": der Haken darauf ist dunkel statt weiß (besser lesbar)
const SCHULFARBEN = [
  { name: 'Gelb', wert: '#eab308', hell: true },
  { name: 'Orange', wert: '#f97316' },
  { name: 'Rot', wert: '#dc2626' },
  { name: 'Pink', wert: '#db2777' },
  { name: 'Lila', wert: '#9333ea' },
  { name: 'Blau', wert: '#2563eb' },
  { name: 'Hellblau', wert: '#0ea5e9' },
  { name: 'Türkis', wert: '#0d9488' },
  { name: 'Grün', wert: '#16a34a' },
  { name: 'Grau', wert: '#64748b' },
];

// So viel Pause kommt vor eine neu hinzugefügte Stunde
const NEUE_PAUSE = 5;

export async function zeichneStundenplan(container) {
  const [schulen, eintraege] = await Promise.all([db.ladeSchulen(), db.ladeStundenplan()]);
  const schule = schulen.find((s) => s.id === state.schuleId);
  if (schule) return zeichneSchule(container, schule, eintraege);
  state.schuleId = null;

  // ---------- Noch keine Schule: nur den ersten Schritt zeigen ----------
  if (schulen.length === 0) {
    container.append(el('div', { class: 'karte leer-hinweis' },
      el('div', { class: 'leer-symbol' }, icon('kalender')),
      el('h2', { text: 'Noch keine Schule' }),
      el('p', { class: 'hinweis', text: 'Lege deine Schule mit Farbe und Stundenzeiten an. Dann siehst du im Sitzplan, von wann bis wann die Stunde geht und wie lange sie noch dauert. Die Klassen-Tabs oben bekommen einen Strich in der Farbe ihrer Schule.' }),
      el('button', { class: 'knopf primaer', onclick: neueSchuleDialog }, icon('plus'), 'Schule anlegen'),
    ));
    return;
  }

  container.append(el('div', { class: 'umschalter', role: 'group', 'aria-label': 'Ansicht' },
    ansichtKnopf('tag', 'Tag'),
    ansichtKnopf('woche', 'Woche'),
  ));
  if (state.stundenplanAnsicht === 'woche') zeichneWoche(container, schulen, eintraege);
  else zeichneTag(container, schulen, eintraege);

  // ---------- Alle Schulen ----------
  container.append(
    el('h3', { class: 'abschnitt-titel', text: 'Schulen' }),
    el('ul', { class: 'liste' }, schulen.map((s) => {
      const klassen = state.klassen.filter((k) => k.schuleId === s.id).map((k) => k.name);
      const anzahl = s.stunden.length === 1 ? '1 Stunde' : `${s.stunden.length} Stunden`;
      const zeiten = s.stunden.length ? `${anzahl}, ${s.stunden[0].von}–${s.stunden.at(-1).bis}` : 'keine Stundenzeiten';
      return el('li', {},
        el('button', { class: 'zeile', onclick: () => { state.schuleId = s.id; app.neuZeichnen(); } },
          farbPunkt(s.farbe, true),
          el('span', { class: 'zeile-text' },
            el('strong', { text: s.name }),
            el('small', { text: `${zeiten} · ${klassen.join(', ') || 'keine Klasse'}` }),
          ),
          el('span', { class: 'pfeil' }, icon('rechts')),
        ));
    })),
    el('div', { class: 'leiste fuellen' },
      el('button', { class: 'knopf', onclick: neueSchuleDialog }, icon('plus'), 'Neue Schule')),
  );
}

function ansichtKnopf(id, text) {
  const aktiv = state.stundenplanAnsicht === id;
  return el('button', {
    class: 'umschalter-knopf' + (aktiv ? ' aktiv' : ''),
    'aria-pressed': String(aktiv),
    onclick: () => { state.stundenplanAnsicht = id; app.neuZeichnen(); },
  }, text);
}

const farbPunkt = (farbe, gross = false) =>
  el('span', { class: 'farbpunkt' + (gross ? ' gross' : ''), style: { background: farbe } });

// ============================ Tag ==========================================

function zeichneTag(container, schulen, eintraege) {
  const heute = wochentag();
  const tag = state.stundenplanTag ?? (heute <= 5 ? heute : 1);
  const klasseNachId = new Map(state.klassen.map((k) => [k.id, k]));

  container.append(el('div', { class: 'umschalter tage', role: 'group', 'aria-label': 'Wochentag' },
    TAGE.map((t) => el('button', {
      class: 'umschalter-knopf' + (t.nr === tag ? ' aktiv' : '') + (t.nr === heute ? ' heute' : ''),
      'aria-pressed': String(t.nr === tag),
      'aria-label': t.name + (t.nr === heute ? ' (heute)' : ''),
      onclick: () => { state.stundenplanTag = t.nr; app.neuZeichnen(); },
    }, t.kurz)),
  ));

  // Je Schule, in der an diesem Tag etwas eingetragen ist: die Stunden von der ersten
  // bis zur letzten eingetragenen (dazwischen Freistunden). Ist an diesem Tag gar
  // nichts eingetragen, stehen die Stundenzeiten der Schule der geöffneten Klasse da.
  let zeilen = [];
  for (const schule of schulen) {
    const eigene = eintraege.filter((e) => e.schuleId === schule.id && e.tag === tag
      && e.stunde <= schule.stunden.length && klasseNachId.has(e.klasseId));
    if (!eigene.length) continue;
    const nummern = eigene.map((e) => e.stunde);
    for (let nr = Math.min(...nummern); nr <= Math.max(...nummern); nr++) {
      const klasseId = eigene.find((e) => e.stunde === nr)?.klasseId;
      zeilen.push({ schule, nr, zeit: schule.stunden[nr - 1], klasse: klasseNachId.get(klasseId) });
    }
  }
  const nichtsEingetragen = zeilen.length === 0;
  const schuleDesTages = zeilen[0]?.schule
    || schulen.find((s) => s.id === aktuelleKlasse()?.schuleId) || schulen[0];
  if (nichtsEingetragen) {
    zeilen = schuleDesTages.stunden.map((zeit, i) => ({ schule: schuleDesTages, nr: i + 1, zeit, klasse: null }));
    container.append(el('p', { class: 'hinweis', text:
      `Am ${TAGE[tag - 1].name} ist noch keine Klasse eingetragen. Tippe eine Stunde an, um eine einzutragen.`
      + (schulen.length > 1 ? ` Hier die Stundenzeiten von „${schuleDesTages.name}“.` : '') }));
  }
  zeilen = zeilen.filter((z) => minuten(z.zeit.von) !== null && minuten(z.zeit.bis) !== null);
  zeilen.sort((a, b) => a.zeit.von.localeCompare(b.zeit.von));

  if (zeilen.length === 0) {
    container.append(el('div', { class: 'tipp' },
      el('span', { class: 'wachsen', text: `Für „${schuleDesTages.name}“ sind noch keine Stundenzeiten eingetragen.` }),
      el('button', { class: 'knopf klein primaer', onclick: () => { state.schuleId = schuleDesTages.id; app.neuZeichnen(); } },
        'Stundenzeiten', icon('rechts')),
    ));
    return;
  }

  const liste = el('ul', { class: 'liste stunden' });
  zeilen.forEach((z, i) => {
    if (i > 0) {
      const pause = minuten(z.zeit.von) - minuten(zeilen[i - 1].zeit.bis);
      // Eine Stunde oder mehr (z. B. zwischen zwei Schulen) ist keine Pause mehr, sondern frei
      if (pause > 0) liste.append(el('li', { class: 'std-pause', text: `${dauerText(pause)} ${pause < 60 ? 'Pause' : 'frei'}` }));
    }
    liste.append(stundenZeile(z, tag, tag === heute, schulen.length > 1));
  });
  container.append(liste);
}

// Eine Stunde im Tagesplan. Antippen öffnet die Klasse – oder trägt in einer freien Stunde eine ein.
function stundenZeile({ schule, nr, zeit, klasse }, tag, heute, mitSchule) {
  const li = el('li', { class: 'std' + (klasse ? '' : ' frei'), style: { '--schulfarbe': schule.farbe } });
  li.append(el('button', {
    class: 'zeile',
    onclick: klasse
      ? () => { state.ansicht = 'plan'; app.klasseWechseln(klasse.id); }
      : () => stundeWaehlen(schule, tag, nr),
  },
    el('span', { class: 'std-zeit' }, el('strong', { text: zeit.von }), el('small', { text: zeit.bis })),
    el('span', { class: 'std-strich' }),
    el('span', { class: 'zeile-text' },
      el('strong', { text: klasse ? klasse.name : 'frei' }),
      el('small', { text: [`${nr}. Stunde`, klasse?.fach, mitSchule ? schule.name : null].filter(Boolean).join(' · ') }),
    ),
    heute ? mitlaufend(el('span', { class: 'std-status' }), (e) => stundeStatus(e, li, zeit)) : null,
    el('span', { class: 'pfeil' }, icon(klasse ? 'rechts' : 'plus')),
  ));
  return li;
}

// Läuft die Stunde gerade ("noch 12 Min" + Balken), ist sie vorbei (blass) oder beginnt sie bald?
function stundeStatus(e, li, zeit) {
  const sek = sekunden();
  const von = minuten(zeit.von) * 60, bis = minuten(zeit.bis) * 60;
  const laeuft = sek >= von && sek < bis;
  li.classList.toggle('jetzt', laeuft);
  li.classList.toggle('vorbei', sek >= bis);
  if (laeuft) li.style.setProperty('--anteil', (sek - von) / (bis - von));
  e.textContent = laeuft ? `noch ${Math.ceil((bis - sek) / 60)} Min`
    : sek < von && von - sek <= 30 * 60 ? `in ${Math.ceil((von - sek) / 60)} Min` : '';
}

// ============================ Woche ========================================

function zeichneWoche(container, schulen, eintraege) {
  const schule = schulen.find((s) => s.id === state.stundenplanSchule)
    || schulen.find((s) => s.id === aktuelleKlasse()?.schuleId) || schulen[0];
  const klasseNachId = new Map(state.klassen.map((k) => [k.id, k]));

  if (schulen.length > 1) {
    container.append(el('div', { class: 'chips', role: 'group', 'aria-label': 'Schule' }, schulen.map((s) => el('button', {
      class: 'chip schul-chip' + (s.id === schule.id ? ' aktiv' : ''),
      'aria-pressed': String(s.id === schule.id),
      onclick: () => { state.stundenplanSchule = s.id; app.neuZeichnen(); },
    }, farbPunkt(s.farbe), s.name))));
  }
  if (schule.stunden.length === 0) {
    container.append(el('div', { class: 'tipp' },
      el('span', { class: 'wachsen', text: `Für „${schule.name}“ sind noch keine Stundenzeiten eingetragen.` }),
      el('button', { class: 'knopf klein primaer', onclick: () => { state.schuleId = schule.id; app.neuZeichnen(); } },
        'Stundenzeiten', icon('rechts')),
    ));
    return;
  }

  const heute = wochentag();
  const lage = stundeJetzt(schule.stunden);
  const raster = el('div', { class: 'woche', style: { '--schulfarbe': schule.farbe } },
    el('div', {}),
    TAGE.map((t) => el('div', { class: 'woche-tag' + (t.nr === heute ? ' heute' : ''), text: t.kurz })),
  );
  schule.stunden.forEach((zeit, i) => {
    const nr = i + 1;
    raster.append(el('div', { class: 'woche-zeit' },
      el('strong', { text: `${nr}.` }), el('small', { text: zeit.von }), el('small', { text: zeit.bis })));
    for (const t of TAGE) {
      const eintrag = eintraege.find((e) => e.schuleId === schule.id && e.tag === t.nr && e.stunde === nr);
      const klasse = klasseNachId.get(eintrag?.klasseId);
      const jetzt = t.nr === heute && lage?.art === 'stunde' && lage.nr === nr;
      raster.append(el('button', {
        class: 'woche-feld' + (klasse ? ' belegt' : '') + (jetzt ? ' jetzt' : ''),
        'aria-label': `${t.name}, ${nr}. Stunde: ${klasse ? klasse.name : 'frei'}`,
        title: klasse?.fach || null,
        onclick: () => stundeWaehlen(schule, t.nr, nr),
      }, klasse ? klasse.name : ''));
    }
  });
  container.append(
    el('div', { class: 'woche-huelle' }, raster),
    el('p', { class: 'unterzeile', text: 'Feld antippen, um eine Klasse einzutragen oder zu ändern.' }),
  );
}

// Dialog: Welche Klasse ist in dieser Stunde? Zur Wahl stehen die Klassen der Schule
// und die Klassen ohne Schule (die gehören danach zu dieser Schule).
async function stundeWaehlen(schule, tag, nr) {
  const eintrag = (await db.ladeStundenplan())
    .find((e) => e.schuleId === schule.id && e.tag === tag && e.stunde === nr);
  const zeit = schule.stunden[nr - 1];
  const eigene = state.klassen.filter((k) => k.schuleId === schule.id);
  const ohne = state.klassen.filter((k) => !k.schuleId);
  // Jede Klasse ist ein Absende-Knopf: zeigeDialog() liefert dann ihre id
  const wahl = (liste) => el('div', { class: 'klassen-wahl' }, liste.map((k) => el('button', {
    type: 'submit', value: k.id,
    class: 'knopf' + (eintrag?.klasseId === k.id ? ' primaer' : ''),
    'aria-pressed': String(eintrag?.klasseId === k.id),
  }, k.name)));

  const ergebnis = await zeigeDialog({
    titel: `${TAGE[tag - 1].name}, ${nr}. Stunde`,
    inhalt: [
      el('p', { class: 'hinweis', text: `${zeit.von}–${zeit.bis}` + (state.schulen.length > 1 ? ` · ${schule.name}` : '') }),
      eigene.length ? wahl(eigene) : null,
      ohne.length ? el('h3', { text: eigene.length ? 'Noch ohne Schule' : 'Klassen' }) : null,
      ohne.length ? wahl(ohne) : null,
      ohne.length ? el('p', { class: 'hinweis', text: `Wählst du eine Klasse ohne Schule, gehört sie danach zu „${schule.name}“.` }) : null,
      !eigene.length && !ohne.length
        ? el('p', { text: `Zu „${schule.name}“ gehört noch keine Klasse. Ordne sie unter „Schulen“ zu.` }) : null,
    ],
    knoepfe: [{ text: 'Abbrechen' }, eintrag ? { text: 'Stunde leeren', wert: 'leeren', gefahr: true } : null].filter(Boolean),
  });
  if (!ergebnis) return;

  const klasse = state.klassen.find((k) => k.id === ergebnis);
  if (ergebnis !== 'leeren' && !klasse) return;
  await db.setzeStunde({ schuleId: schule.id, tag, stunde: nr, klasseId: klasse?.id ?? null });
  if (klasse && !klasse.schuleId) {
    klasse.schuleId = schule.id;
    await db.speichereKlasse(klasse);
    toast(`„${klasse.name}“ gehört jetzt zu „${schule.name}“.`);
  }
  app.neuZeichnen();
}

// ============================ Eine Schule ==================================

async function zeichneSchule(container, schule, alleEintraege) {
  const eintraege = alleEintraege.filter((e) => e.schuleId === schule.id);

  container.append(el('div', { class: 'leiste' },
    el('button', { class: 'knopf klein', onclick: () => { state.schuleId = null; app.neuZeichnen(); } }, icon('links'), 'Stundenplan'),
    el('h2', { class: 'wachsen schul-titel' }, farbPunkt(schule.farbe, true), el('span', { text: schule.name })),
  ));

  // ---------- Stundenzeiten ----------
  // Wird sofort gespeichert, aber ohne die Seite neu zu zeichnen: Sonst verlöre das
  // Zeitfeld mitten im Tippen den Fokus. Dauer und Pausen rechnet anzeigen() nach.
  const reihen = schule.stunden.map((s, i) => {
    const von = el('input', { type: 'time', value: s.von, required: true, 'aria-label': `${i + 1}. Stunde Beginn`, onchange: zeitenSpeichern });
    const bis = el('input', { type: 'time', value: s.bis, required: true, 'aria-label': `${i + 1}. Stunde Ende`, onchange: zeitenSpeichern });
    const dauer = el('span', { class: 'zeit-dauer' });
    return {
      von, bis, dauer,
      zeile: el('div', { class: 'zeit-zeile' }, el('span', { class: 'zeit-nr', text: `${i + 1}.` }), von, el('span', { text: '–' }), bis, dauer),
      pause: el('div', { class: 'zeit-pause' }),
    };
  });

  function anzeigen() {
    reihen.forEach((r, i) => {
      const von = minuten(r.von.value), bis = minuten(r.bis.value);
      const ok = von !== null && bis !== null && bis > von;
      r.zeile.classList.toggle('fehler', !ok);
      r.dauer.textContent = ok ? `${bis - von} Min` : 'prüfen';
      const danach = minuten(reihen[i + 1]?.von.value);
      const pause = bis !== null && danach !== null ? danach - bis : 0;
      r.pause.hidden = !pause;
      r.pause.classList.toggle('fehler', pause < 0);
      r.pause.textContent = pause > 0 ? `${dauerText(pause)} Pause` : 'überschneidet sich mit der nächsten Stunde';
    });
  }

  async function zeitenSpeichern() {
    anzeigen();
    schule.stunden = reihen.map((r) => ({ von: r.von.value, bis: r.bis.value }));
    await db.speichereSchule(schule);
  }

  // Neue Stunde nach der letzten: gleich lang, mit kurzer Pause davor
  async function stundeDazu() {
    const letzte = schule.stunden.at(-1);
    const ende = minuten(letzte?.bis), anfang = minuten(letzte?.von);
    const von = ende !== null ? ende + NEUE_PAUSE : minuten(db.STANDARD_STUNDEN[0].von);
    const dauer = ende !== null && anfang !== null && ende > anfang ? ende - anfang : 50;
    schule.stunden.push({ von: uhrzeit(von), bis: uhrzeit(von + dauer) });
    await db.speichereSchule(schule);
    app.neuZeichnen();
  }

  async function letzteEntfernen() {
    const nr = schule.stunden.length;
    const betroffen = eintraege.filter((e) => e.stunde === nr).length;
    if (betroffen && !await bestaetigen({
      titel: `${nr}. Stunde entfernen?`,
      text: (betroffen === 1 ? 'In dieser Stunde ist eine Klasse eingetragen.' : `In dieser Stunde sind ${betroffen} Klassen eingetragen.`)
        + ' Die Einträge im Stundenplan werden gelöscht.',
      knopf: 'Entfernen', gefahr: true,
    })) return;
    schule.stunden.pop();
    await db.speichereSchule(schule);
    await db.loescheStundenAb(schule.id, nr);
    app.neuZeichnen();
  }

  container.append(
    el('div', { class: 'karte' },
      kartenKopf('uhr', 'Stundenzeiten'),
      el('p', { class: 'hinweis', text: 'Von wann bis wann geht jede Stunde? Änderungen werden sofort gespeichert.' }),
      reihen.length
        ? el('div', { class: 'zeiten' }, reihen.flatMap((r) => [r.zeile, r.pause]))
        : el('p', { class: 'hinweis', text: 'Noch keine Stunden eingetragen.' }),
      el('div', { class: 'leiste fuellen' },
        el('button', { class: 'knopf', onclick: stundeDazu }, icon('plus'), 'Stunde'),
        reihen.length ? el('button', { class: 'knopf gefahr-leise', onclick: letzteEntfernen }, icon('minus'), 'Letzte entfernen') : null,
      ),
    ),
    el('div', { class: 'leiste fuellen' },
      el('button', {
        class: 'knopf primaer',
        onclick: () => {
          state.schuleId = null;
          state.stundenplanAnsicht = 'woche';
          state.stundenplanSchule = schule.id;
          app.neuZeichnen();
        },
      }, eintraege.length ? 'Zum Stundenplan' : 'Weiter: Stundenplan eintragen', icon('rechts')),
    ),
  );
  anzeigen();

  // ---------- Name und Farbe ----------
  const name = el('input', { required: true, maxlength: 40, value: schule.name });
  let farbe = schule.farbe;
  container.append(el('form', {
    class: 'karte',
    onsubmit: async (e) => {
      e.preventDefault();
      schule.name = name.value.trim() || schule.name;
      schule.farbe = farbe;
      await db.speichereSchule(schule);
      state.schulen = await db.ladeSchulen();
      toast('Gespeichert.');
      app.neuZeichnen(); // Farbstriche an den Tabs
    },
  },
    kartenKopf('schule', 'Name und Farbe'),
    feld('Name', name),
    farbFeld(farbe, (f) => { farbe = f; }),
    el('button', { class: 'knopf primaer', type: 'submit', text: 'Speichern' }),
  ));

  // ---------- Klassen ----------
  container.append(el('div', { class: 'karte' },
    kartenKopf('klasse', 'Klassen dieser Schule'),
    el('p', { class: 'hinweis', text: 'Diese Klassen bekommen oben einen Strich in der Farbe der Schule, und ihr Sitzplan zeigt die Stundenzeiten dieser Schule.' }),
    klassenHaken(schule.id, async (klasse, dabei) => {
      klasse.schuleId = dabei ? schule.id : null;
      await db.speichereKlasse(klasse);
      app.neuZeichnen();
    }),
  ));

  // ---------- Löschen ----------
  container.append(
    el('h3', { class: 'abschnitt-titel', text: 'Gefahrenbereich' }),
    el('div', { class: 'karte' },
      kartenKopf('papierkorb', 'Schule löschen', true),
      el('p', { class: 'hinweis', text: 'Löscht die Stundenzeiten und den Stundenplan dieser Schule. Die Klassen bleiben mit allen Daten erhalten, sie gehören dann zu keiner Schule.' }),
      el('button', {
        class: 'knopf gefahr-leise', text: `„${schule.name}“ löschen`,
        onclick: async () => {
          if (!await bestaetigen({
            titel: `„${schule.name}“ löschen?`,
            text: 'Die Stundenzeiten und der Stundenplan dieser Schule werden gelöscht. Die Klassen bleiben erhalten.',
            knopf: 'Löschen', gefahr: true,
          })) return;
          await db.loescheSchule(schule.id);
          state.klassen = await db.ladeKlassen();
          state.schulen = await db.ladeSchulen();
          state.schuleId = null;
          toast('Schule gelöscht.');
          app.neuZeichnen();
        },
      }),
    ),
  );
}

// Häkchen-Liste aller Klassen: angehakt = gehört zu dieser Schule (schuleId; null = neue Schule).
// beiAenderung(klasse, angehakt) – oder ohne: dann liest man die Häkchen später über .auswahl()
function klassenHaken(schuleId, beiAenderung = null) {
  const kaesten = state.klassen.map((k) => {
    const andere = state.schulen.find((s) => s.id === k.schuleId && s.id !== schuleId);
    // Bei einer neuen Schule sind die Klassen ohne Schule vorausgewählt
    const box = el('input', {
      type: 'checkbox',
      checked: schuleId ? k.schuleId === schuleId : !k.schuleId,
      onchange: beiAenderung ? (e) => beiAenderung(k, e.target.checked) : null,
    });
    return { k, box, label: el('label', { class: 'haken' }, box, el('span', { text: k.name + (andere ? ` (bisher ${andere.name})` : '') })) };
  });
  const liste = el('div', { class: 'haken-liste' }, kaesten.map((x) => x.label));
  liste.auswahl = () => kaesten.filter((x) => x.box.checked).map((x) => x.k);
  return liste;
}

// Farbauswahl (runde Farbknöpfe). beiWahl(farbe) meldet die gewählte Farbe.
// Ein <div> statt <label>: Ein Klick auf eine Beschriftung würde den ersten Knopf auslösen.
function farbFeld(aktuell, beiWahl) {
  const knoepfe = SCHULFARBEN.map((f) => el('button', {
    type: 'button',
    class: 'farbe' + (f.hell ? ' hell' : '') + (f.wert === aktuell ? ' aktiv' : ''),
    style: { background: f.wert },
    title: f.name,
    'aria-label': f.name,
    'aria-pressed': String(f.wert === aktuell),
    onclick: (e) => {
      for (const k of knoepfe) {
        k.classList.toggle('aktiv', k === e.currentTarget);
        k.setAttribute('aria-pressed', String(k === e.currentTarget));
      }
      beiWahl(f.wert);
    },
  }, icon('haken')));
  return el('div', { class: 'feld' }, el('span', { text: 'Farbe' }), el('div', { class: 'farben', role: 'group', 'aria-label': 'Farbe' }, knoepfe));
}

// Dialog "Neue Schule" – danach geht es gleich zu ihren Stundenzeiten
export async function neueSchuleDialog() {
  const name = el('input', { required: true, maxlength: 40, placeholder: 'z. B. BG Musterstadt' });
  // Vorschlag: die erste Farbe, die noch keine Schule hat
  let farbe = (SCHULFARBEN.find((f) => !state.schulen.some((s) => s.farbe === f.wert)) || SCHULFARBEN[0]).wert;
  const klassen = klassenHaken(null);

  const ergebnis = await zeigeDialog({
    titel: 'Neue Schule',
    inhalt: [
      feld('Name der Schule', name),
      farbFeld(farbe, (f) => { farbe = f; }),
      state.klassen.length ? el('div', { class: 'feld' }, el('span', { text: 'Diese Klassen gehören dazu' }), klassen) : null,
      el('p', { class: 'hinweis', text: 'Die Stundenzeiten stellst du im nächsten Schritt ein.' }),
    ],
    knoepfe: [{ text: 'Abbrechen' }, { text: 'Anlegen', wert: 'ok', primaer: true }],
  });
  if (ergebnis !== 'ok') return;

  const schule = await db.legeSchuleAn({ name: name.value.trim(), farbe });
  for (const k of klassen.auswahl()) {
    k.schuleId = schule.id;
    await db.speichereKlasse(k);
  }
  state.schulen = await db.ladeSchulen();
  state.ansicht = 'stundenplan';
  state.schuleId = schule.id;
  await app.neuZeichnen();
  toast('Schule angelegt. Prüfe jetzt die Stundenzeiten.', { dauer: 3500 });
}

// ============================ Für andere Ansichten =========================

// Kopfzeile des Sitzplans: "3. Stunde 09:50–10:40 · noch 12 Min" mit Fortschrittsbalken,
// in der Pause "Pause · 4. Stunde ab 10:45 · in 4 Min". Sonst steht nur "Fach · Raum" da.
// zusatz (z. B. "2 abwesend") steht immer dabei; ort (Fach · Raum) fällt neben der
// Stunde am Handy weg, weil der Platz nicht reicht.
export function stundeInfo(schule, ort, zusatz = '') {
  return mitlaufend(el('span', { class: 'stunde-info' }), (e) => {
    const lage = schule ? stundeJetzt(schule.stunden) : null;
    e.classList.toggle('laeuft', !!lage);
    if (!lage) { e.replaceChildren([ort, zusatz].filter(Boolean).join(' · ')); return; }
    const stunde = lage.art === 'stunde';
    e.replaceChildren(
      el('span', { class: 'stunde-zeit' }, icon('uhr'),
        stunde ? `${lage.nr}. Stunde ${lage.von}–${lage.bis}`
          : `${lage.art === 'pause' ? 'Pause · ' : ''}${lage.nr}. Stunde ab ${lage.von}`),
      el('strong', { text: stunde ? `noch ${lage.rest} Min` : `in ${lage.rest} Min` }),
      zusatz ? el('span', { class: 'stunde-zusatz', text: '· ' + zusatz }) : null,
      ort ? el('span', { class: 'stunde-ort', text: '· ' + ort }) : null,
      stunde ? el('span', { class: 'stunde-balken', style: { '--anteil': lage.anteil } }) : null,
    );
  });
}

// Welche Klasse ist laut Stundenplan jetzt dran? Die laufende Stunde – oder in der
// Pause (bzw. kurz vor der ersten Stunde) die nächste. Sonst null.
export function klasseJetzt(schulen, eintraege, jetzt = new Date()) {
  const tag = wochentag(jetzt);
  let naechste = null;
  for (const schule of schulen) {
    const lage = stundeJetzt(schule.stunden, jetzt);
    const eintrag = lage && eintraege.find((e) => e.schuleId === schule.id && e.tag === tag && e.stunde === lage.nr);
    if (!eintrag) continue;
    if (lage.art === 'stunde') return eintrag.klasseId;
    naechste ??= eintrag.klasseId;
  }
  return naechste;
}
