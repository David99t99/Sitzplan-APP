// state.js – der aktuelle Zustand der Oberfläche (NICHT die gespeicherten Daten).
// Alle Ansichten lesen und ändern dieses eine Objekt. Danach rufen sie
// app.neuZeichnen() auf, und die Oberfläche wird neu aufgebaut.

export const state = {
  klassen: [],          // alle Klassen (aus der Datenbank geladen)
  klasseId: null,       // die gerade geöffnete Klasse
  ansicht: 'plan',      // 'plan' | 'uebersicht' | 'schueler' | 'stundenplan' | 'raum' | 'klasse' | 'person' | 'versionen'
  modus: 'unterricht',  // 'unterricht' (gesperrt) | 'bearbeiten'
  lehrersicht: true,    // true = Tafel unten (Blick vom Lehrertisch)
  auswahl: null,        // im Bearbeitungsmodus angetippte Person (id)
  werkzeug: 'sitz',     // im Raum-Editor gewähltes Werkzeug
  raumId: null,         // in "Räume" geöffneter Raum (null = Liste aller Räume)

  // Ab Phase 2: Beobachtungen
  personId: null,       // Person in der Verlaufsansicht
  zurueck: 'plan',      // wohin der Zurück-Knopf der Verlaufsansicht führt
  // Filter für Verlauf und Übersicht (gemeinsam, damit man beim Wechseln nicht neu filtern muss)
  filter: { zeitraum: 'semester', von: '', bis: '', kategorie: 'alle' },
  sortierung: { spalte: 'name', absteigend: false }, // Sortierung der Übersichtstabelle

  // Ab Phase 3
  versionId: null,      // in der Versionsliste aufgeklappte Version
  backupFaellig: null,  // Text der Backup-Erinnerung (oder null)

  // Ab v9: Schulen und Stundenplan
  schulen: [],               // alle Schulen (für die Farbstriche an den Klassen-Tabs)
  schuleId: null,            // im Stundenplan geöffnete Schule (null = der Stundenplan selbst)
  stundenplanAnsicht: 'tag', // 'tag' | 'woche'
  stundenplanTag: null,      // gewählter Wochentag (1 = Mo … 5 = Fr, null = heute)
  stundenplanSchule: null,   // Schule, deren Woche gezeigt wird
};

// app.js trägt hier seine Funktionen ein (vermeidet zirkuläre Importe).
export const app = {
  neuZeichnen: async () => {},
  klasseWechseln: async () => {},
};

// Kleine Hilfsfunktion: die gerade geöffnete Klasse
export function aktuelleKlasse() {
  return state.klassen.find((k) => k.id === state.klasseId) || null;
}
