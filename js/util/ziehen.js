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
