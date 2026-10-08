// icons.js – kleine Strich-Symbole als SVG.
//
// Warum eigene Symbole statt Emojis? Emojis sehen auf jedem Gerät anders aus
// (iPhone, Windows, Android). Diese Symbole sind überall gleich, übernehmen die
// Textfarbe des Knopfs und funktionieren offline (keine Schrift-Datei nötig).
//
//   icon('plus')  ->  <svg class="icon">…</svg>
//
// Jedes Symbol ist auf einem 24 × 24-Raster gezeichnet. Die Größe steuert CSS (.icon).

const NS = 'http://www.w3.org/2000/svg';

const SYMBOLE = {
  // Navigation
  sitzplan: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  uebersicht: '<path d="M3.5 3.5v15a2 2 0 0 0 2 2h15"/><path d="M8.5 16v-4.5M13 16V7.5M17.5 16v-6.5"/>',
  sus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18.3 14.5c1.9.9 3.2 2.9 3.2 5.5"/>',
  raum: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9.5h18M9.5 9.5V21"/>',
  mehr: '<path d="M4 6h9M19 6h1M4 12h1M11 12h9M4 18h7M17 18h3"/><circle cx="16" cy="6" r="2.5"/><circle cx="8" cy="12" r="2.5"/><circle cx="14" cy="18" r="2.5"/>',

  // Sitzplan
  unterricht: '<path d="M2.5 4h19M4.5 4v10a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V4M12 15.5V18M8 21l4-3 4 3"/>',
  stift: '<path d="M4 20l1.2-4.3L16.4 4.5a2.2 2.2 0 0 1 3.1 3.1L8.3 18.8 4 20z"/><path d="M14.5 6.5l3 3"/>',
  wuerfel: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
  merken: '<path d="M7 3h10a1.5 1.5 0 0 1 1.5 1.5V21L12 17l-6.5 4V4.5A1.5 1.5 0 0 1 7 3z"/><path d="M12 7.5v5M9.5 10h5"/>',
  verlauf: '<path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2L3.5 8.3"/><path d="M3.5 3.5v4.8h4.8M12 7.5V12l3.2 2"/>',
  drehen: '<path d="M20 11a8 8 0 0 0-14-4.3L4 9M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4.3l2-2.3M20 20v-5h-5"/>',
  tuer: '<path d="M6.5 21V4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21M3.5 21h17M14 12.5h.01"/>',

  // Allgemein
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  links: '<path d="M14.5 5l-7 7 7 7"/>',
  rechts: '<path d="M9.5 5l7 7-7 7"/>',
  unten: '<path d="M5 9l7 7 7-7"/>',
  haken: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  herunter: '<path d="M12 4v11.5M7 11l5 5 5-5M4.5 20h15"/>',
  hinauf: '<path d="M12 16V4.5M7 9l5-5 5 5M4.5 20h15"/>',
  kamera: '<path d="M4.5 8h2.7L8.8 5.5h6.4L16.8 8h2.7A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8z"/><circle cx="12" cy="13" r="3.3"/>',
  bild: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15.5l-4.7-4.7L7 20"/>',
  liste: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  papierkorb: '<path d="M4 7h16M9.5 7V4h5v3M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M10 11v6M14 11v6"/>',
  schloss: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  sicherung: '<path d="M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  blitz: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
  speicher: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  klasse: '<path d="M12 4L2.5 9l9.5 5 9.5-5L12 4z"/><path d="M6.5 11.5V16c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2v-4.5M21.5 9v5.5"/>',
  hand: '<path d="M8.5 12.5V5.5a1.5 1.5 0 0 1 3 0v5M11.5 10V4.5a1.5 1.5 0 0 1 3 0V10M14.5 10.5V6.5a1.5 1.5 0 0 1 3 0v8c0 3.9-2.6 6.5-6 6.5-2.5 0-4-1-5.3-3L4 14.3a1.5 1.5 0 0 1 2.5-1.6l2 2.3"/>',
};

export function icon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = SYMBOLE[name] || '';
  return svg;
}
