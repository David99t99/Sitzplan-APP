// state.js – der aktuelle Zustand der Oberfläche (NICHT die gespeicherten Daten).
// Alle Ansichten lesen und ändern dieses eine Objekt. Danach rufen sie
// app.neuZeichnen() auf, und die Oberfläche wird neu aufgebaut.

export const state = {
  klassen: [],          // alle Klassen (aus der Datenbank geladen)
  klasseId: null,       // die gerade geöffnete Klasse
  ansicht: 'plan',      // 'plan' | 'uebersicht' | 'schueler' | 'raum' | 'klasse' | 'person' | 'versionen'
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
};

// app.js trägt hier seine Zeichenfunktion ein (vermeidet zirkuläre Importe).
export const app = {
  neuZeichnen: async () => {},
};

// Kleine Hilfsfunktion: die gerade geöffnete Klasse
export function aktuelleKlasse() {
  return state.klassen.find((k) => k.id === state.klasseId) || null;
}
