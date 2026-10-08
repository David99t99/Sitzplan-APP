// ziehen.js – Drag & Drop mit dem Finger (oder der Maus).
//
// Wir nutzen "Pointer Events": die funktionieren gleich für Touch, Maus und Stift.
// Ablauf:
//   1. Finger auf eine Person legen (pointerdown)
//   2. Bewegt sich der Finger mehr als ein paar Pixel, beginnt das Ziehen:
//      eine Kopie ("Geist") folgt dem Finger.
//   3. Finger loslassen: Wir schauen, welches Element unter dem Finger liegt,
//      und melden es über onDrop(zielElement).
//
// Ziele erkennen wir am Attribut data-ziel (z. B. Sitzplätze, die Leiste "Ohne Platz").

const SCHWELLE = 8; // Pixel Bewegung, ab der es als "Ziehen" statt "Tippen" zählt
let zuletztGezogen = 0;

// Nach dem Loslassen feuert der Browser oft noch ein "click".
// Damit das nicht als Antippen gilt, fragen die Klick-Handler das hier ab.
export function warGeradeGezogen() {
  return Date.now() - zuletztGezogen < 400;
}

export function ziehbarMachen(element, { onDrop }) {
  element.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    let geist = null;   // die Kopie, die dem Finger folgt
    let hover = null;   // aktuell hervorgehobenes Ziel

    // Bewegung und Loslassen am ganzen Fenster abhören, damit wir den
    // Finger/die Maus auch außerhalb des Elements weiter verfolgen.
    function bewegen(ev) {
      if (ev.pointerId !== e.pointerId) return;
      if (!geist) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < SCHWELLE) return;
        // Ziehen beginnt: Geist erzeugen
        const r = element.getBoundingClientRect();
        geist = element.cloneNode(true);
        geist.classList.add('geist');
        geist.style.width = r.width + 'px';
        geist.style.height = r.height + 'px';
        // Die Schriftgrößen im Feld hängen an --zelle; außerhalb des Rasters fehlt der Wert
        const zelle = getComputedStyle(element).getPropertyValue('--zelle');
        if (zelle) geist.style.setProperty('--zelle', zelle);
        document.body.append(geist);
        element.classList.add('wird-gezogen');
      }
      // Geist mittig unter den Finger setzen
      geist.style.transform =
        `translate(${ev.clientX - geist.offsetWidth / 2}px, ${ev.clientY - geist.offsetHeight / 2}px) scale(1.15)`;

      // Ziel unter dem Finger hervorheben
      const ziel = zielBei(ev.clientX, ev.clientY);
      if (ziel !== hover) {
        hover?.classList.remove('ziel-hover');
        ziel?.classList.add('ziel-hover');
        hover = ziel;
      }
    }

    function loslassen(ev) {
      if (ev.pointerId !== e.pointerId) return;
      const ziel = geist && ev.type === 'pointerup' ? zielBei(ev.clientX, ev.clientY) : null;
      const warZiehen = !!geist;
      // aufräumen
      geist?.remove();
      hover?.classList.remove('ziel-hover');
      element.classList.remove('wird-gezogen');
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', loslassen);
      window.removeEventListener('pointercancel', loslassen);

      if (warZiehen) {
        zuletztGezogen = Date.now();
        if (ziel) onDrop(ziel);
      }
    }

    window.addEventListener('pointermove', bewegen);
    window.addEventListener('pointerup', loslassen);
    window.addEventListener('pointercancel', loslassen);
  });
}

// Welches Ziel liegt an dieser Bildschirmposition?
// (Der Geist hat pointer-events: none und stört deshalb nicht.)
function zielBei(x, y) {
  const unten = document.elementFromPoint(x, y);
  return unten ? unten.closest('[data-ziel]') : null;
}

// ---------------------------------------------------------------------------
// Reihenfolge ändern: die Elemente einer waagrechten Leiste durch Ziehen
// umsortieren (die Klassen-Tabs oben).
//
// Maus: einfach ziehen. Finger: erst kurz gedrückt halten, dann ziehen – so
// bleibt das seitliche Wischen durch die Leiste erhalten.
// Das gezogene Element folgt dem Finger, die Nachbarn rücken sofort zur Seite.
// Beim Loslassen meldet onFertig(elemente) die neue Reihenfolge – aber nur,
// wenn sie sich geändert hat.
// ---------------------------------------------------------------------------
const HALTEN = 350;  // so viele Millisekunden muss der Finger ruhen, bevor das Verschieben beginnt
const RAND = 36;     // so nah am Rand der Leiste (px) scrollt sie beim Verschieben mit

export function sortierbarMachen(leiste, selektor, onFertig) {
  let aktiv = null; // das Element, das gerade verschoben wird
  const reihenfolge = () => [...leiste.querySelectorAll(selektor)];
  const mitteVon = (e) => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; };

  // Solange verschoben wird, darf der Finger die Leiste nicht scrollen und kein
  // Menü öffnen. (Von Anfang an angemeldet: iOS beachtet später hinzugefügte Handler nicht.)
  leiste.addEventListener('touchmove', (e) => { if (aktiv) e.preventDefault(); }, { passive: false });
  leiste.addEventListener('contextmenu', (e) => { if (aktiv) e.preventDefault(); });

  for (const element of reihenfolge()) {
    element.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || aktiv) return;
      const finger = e.pointerType !== 'mouse';
      let x = e.clientX;   // aktuelle Position des Fingers
      // Abstand vom Finger zur linken Kante des Elements (bleibt beim Verschieben gleich)
      const griff = e.clientX - element.getBoundingClientRect().left;
      let vorher = [];     // Reihenfolge vor dem Verschieben
      let bild = 0;        // laufende Animation für das Mitscrollen am Rand
      let warten = finger ? setTimeout(beginnen, HALTEN) : null;

      function beginnen() {
        warten = null;
        aktiv = element;
        vorher = reihenfolge();
        element.classList.add('wird-verschoben');
        navigator.vibrate?.(15); // kurzes Signal "jetzt verschiebbar" (nicht am iPhone)
        bild = requestAnimationFrame(amRandScrollen);
        folgen();
      }

      // Element unter den Finger setzen und mit den Nachbarn tauschen, sobald
      // seine Mitte über deren Mitte hinaus ist.
      function folgen() {
        element.style.transform = '';
        const breite = element.getBoundingClientRect().width;
        const mitte = x - griff + breite / 2;
        for (;;) {
          const davor = element.previousElementSibling;
          const danach = element.nextElementSibling;
          if (davor?.matches(selektor) && mitte < mitteVon(davor)) davor.before(element);
          else if (danach?.matches(selektor) && mitte > mitteVon(danach)) danach.after(element);
          else break;
        }
        element.style.transform = `translateX(${x - griff - element.getBoundingClientRect().left}px)`;
      }

      function amRandScrollen() {
        const r = leiste.getBoundingClientRect();
        const schritt = x < r.left + RAND ? -8 : x > r.right - RAND ? 8 : 0;
        if (schritt) {
          const alt = leiste.scrollLeft;
          leiste.scrollLeft += schritt;
          if (leiste.scrollLeft !== alt) folgen();
        }
        bild = requestAnimationFrame(amRandScrollen);
      }

      function bewegen(ev) {
        if (ev.pointerId !== e.pointerId) return;
        x = ev.clientX;
        if (aktiv) { folgen(); return; }
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < SCHWELLE) return;
        if (finger) aufhoeren(); // Finger bewegt sich vor Ablauf der Haltezeit: das ist Wischen
        else beginnen();
      }

      function aufhoeren(ev) {
        if (ev && ev.pointerId !== e.pointerId) return;
        clearTimeout(warten);
        cancelAnimationFrame(bild);
        window.removeEventListener('pointermove', bewegen);
        window.removeEventListener('pointerup', aufhoeren);
        window.removeEventListener('pointercancel', aufhoeren);
        if (!aktiv) return;

        aktiv = null;
        element.style.transform = '';
        element.classList.remove('wird-verschoben');
        zuletztGezogen = Date.now(); // das folgende "click" soll den Tab nicht öffnen
        const neu = reihenfolge();
        if (neu.some((n, i) => n !== vorher[i])) onFertig(neu);
      }

      window.addEventListener('pointermove', bewegen);
      window.addEventListener('pointerup', aufhoeren);
      window.addEventListener('pointercancel', aufhoeren);
    });
  }
}
