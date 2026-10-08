# Sitzplan – PWA für Lehrkräfte

Sitzordnungen pro Klasse anlegen und im Unterricht nutzen.
Alle Daten bleiben **nur auf dem Gerät** (IndexedDB). Kein Server, keine Cloud, kein Tracking.

**Stand: Phase 3 (alle geplanten Funktionen)**
- Phase 1: Klassen, Raumraster, SuS (mit Foto und Namensliste), Zuweisen per Ziehen oder Antippen, Zufallsverteilung, Unterrichts-/Bearbeitungsmodus, offline-fähig.
- Phase 2: Beobachtungen. Im Unterrichtsmodus öffnet Antippen einer Person das Schnellmenü (Mitarbeit +/−, Verhalten +/−, Schnellbuttons, Notiz) mit „Rückgängig“. Am Platz stehen die Zähler von heute. Dazu kommen der Verlauf pro Person (Filter, Summen, bearbeiten, löschen, nachtragen), die Klassenübersicht (sortierbar) und konfigurierbare Schnellbuttons.
- Phase 3: Backup als Datei (inkl. Fotos) und Import, CSV-Export (Übersicht und alle Einträge), Backup-Erinnerung, Versionen der Sitzordnung (speichern, ansehen, wiederherstellen), Raumvorlagen, PIN-Sperre, Reihenfolge der Klassen-Tabs.
- v6: Oberfläche überarbeitet. Der Sitzplan passt am Handy ganz auf den Bildschirm (Gänge werden schmal gezeichnet, Tafel und Lehrertisch als beschriftete Blöcke), im Bearbeitungsmodus bleibt die Leiste „Ohne Platz“ unten stehen, einheitliche Symbole, eigene Sicherheitsfragen statt Browser-Fenstern, Hinweise auf den jeweils nächsten Schritt.
- v7: Räume sind eigenständig (siehe „Räume“ unten) und ersetzen die Raumvorlagen. Die Klassen-Tabs oben lassen sich durch Ziehen umsortieren (am Handy: Tab gedrückt halten, dann ziehen).

## Projektstruktur

```
index.html              Grundgerüst der Seite
manifest.webmanifest    App-Name, Icons (für "Zum Home-Bildschirm")
sw.js                   Service Worker: macht die App offline-fähig
css/app.css             Aussehen (Farben oben als Variablen)
lib/dexie.mjs           Dexie 4 (IndexedDB-Bibliothek), lokal statt CDN
js/app.js               Start, Klassen-Tabs, Navigation, neu zeichnen
js/state.js             Zustand der Oberfläche (gewählte Klasse, Modus …)
js/db.js                Datenmodell + alle Datenbankzugriffe
js/util/raster.js       Rechnen mit dem Raster (Plätze, Tauschen, Zufall)
js/util/ziehen.js       Drag & Drop mit dem Finger (SuS setzen, Klassen-Tabs umsortieren)
js/util/foto.js         Fotos verkleinern (400 × 400 px, JPEG)
js/util/ui.js           Helfer: Elemente bauen, Dialoge, Sicherheitsfragen, Meldungen, Avatare
js/util/icons.js        Symbole als SVG (überall gleich, statt Emojis)
js/util/beobachtung.js  Kategorien, Zeiträume (Heute … Schuljahr), Summen, Datumsformat
js/util/datei.js        Datei speichern (Laptop: Download, iPhone: Teilen) und Datei wählen
js/util/sicherung.js    Backup (JSON), Prüfen beim Import, CSV, Backup-Erinnerung
js/views/plan.js        Ansicht "Sitzplan"
js/views/raum.js        Ansicht "Räume" (Liste aller Räume, Raster-Editor, Raum zuteilen)
js/views/schueler.js    Ansicht "SuS"
js/views/klasse.js      Ansicht "Mehr": Klasse, Datensicherung, PIN, Schnellbuttons + Dialog "Neue Klasse"
js/views/schnellmenue.js  Schnellmenü im Unterrichtsmodus
js/views/person.js      Verlauf einer Person (+ Filterleiste, Eintrag-Dialog)
js/views/uebersicht.js  Klassenübersicht (Tabelle) + CSV-Export
js/views/versionen.js   Frühere Sitzordnungen
js/views/sperre.js      PIN-Sperre (Sperrbildschirm, Einstellungen)
```

Prinzip: Jede Änderung wird sofort in der Datenbank gespeichert, danach baut
`app.neuZeichnen()` die Oberfläche neu auf. Kein Framework, kein Build-Schritt.

## Lokal testen (am Computer)

Die Dateien müssen über einen kleinen Webserver laufen (Doppelklick auf
`index.html` reicht nicht, weil Module und Service Worker das verbieten).

Unter Windows (Eingabeaufforderung oder PowerShell im Ordner `sitzplan`):

```
py -m http.server 8000
```

(Mac/Linux: `python3 -m http.server 8000`.) Falls `py` fehlt: Python von python.org
installieren, oder in VS Code die Erweiterung „Live Server“ verwenden.

Dann im Browser `http://localhost:8000` öffnen. Handy-Ansicht: In Chrome oder
Safari die Entwicklerwerkzeuge öffnen und die Geräte-Ansicht (iPhone) wählen.

**Achtung Cache:** Der Service Worker liefert die gespeicherte Version aus.
Beim Entwickeln deshalb in den Entwicklerwerkzeugen unter *Application → Service Workers*
„Update on reload“ aktivieren (Chrome), oder nach Änderungen `VERSION` in `sw.js` erhöhen.

## Auf das iPhone bringen (GitHub Pages)

Das iPhone braucht **https**, sonst gibt es keinen Offline-Modus. GitHub Pages liefert das kostenlos.

1. Auf github.com ein neues Repository anlegen, z. B. `sitzplan` (öffentlich oder privat mit Pro-Account).
2. Den Inhalt dieses Ordners hochladen (Weboberfläche „Add file → Upload files“ oder `git push`).
3. Im Repository: *Settings → Pages → Source: Deploy from a branch → Branch: main / (root)* → Save.
4. Nach ca. 1 Minute ist die App unter `https://<dein-name>.github.io/sitzplan/` erreichbar.
5. Auf dem iPhone in **Safari** öffnen → Teilen-Symbol → **Zum Home-Bildschirm**.
6. Ab jetzt nur noch über das Icon am Homescreen starten.

Wichtig fürs iPhone:
- Die Homescreen-App und Safari haben **getrennte Speicher**. Daten immer in der
  Homescreen-App eingeben, nicht im Safari-Tab.
- Wird die Homescreen-App gelöscht, sind auch ihre Daten weg. Deshalb regelmäßig ein Backup machen (siehe unten).
- Der Code ist öffentlich sichtbar (bei öffentlichem Repo) – die **Daten nicht**,
  die liegen nur auf deinem Handy.

## Am Laptop (Windows) nutzen

Die GitHub-Pages-Adresse in **Edge oder Chrome** öffnen und rechts in der Adressleiste
„App installieren“ wählen. Dann läuft der Sitzplan wie ein eigenes Programm im
eigenen Fenster, auch offline. Am Laptop funktioniert alles mit der Maus: Ziehen,
Anklicken, Escape schließt Fenster.

**Wichtig:** Laptop und iPhone haben **getrennte Daten**, weil alles lokal gespeichert wird
und es absichtlich keine Cloud gibt. Übertragen geht mit einer Backup-Datei (siehe unten).

## Räume

Ein Raum (z. B. „EDV Nord“) wird **einmal** unter „Räume“ gezeichnet und gehört zu keiner Klasse.
Jeder Klasse teilst du einen Raum zu: unter „Räume“ → „Diese Klasse sitzt in“, oder gleich beim Anlegen der Klasse.

- Änderst du einen Raum, gilt das sofort für **alle** Klassen, die darin sitzen. Fällt dabei ein besetzter
  Platz weg, kommt die Person in „Ohne Platz“ (bei einem einzelnen Feld mit „Rückgängig“).
- Die Sitzordnung (wer wo sitzt) gehört weiterhin der Klasse.
- „Kopie anlegen“ macht aus einem Raum einen zweiten, eigenen Raum, z. B. für „EDV Süd“ mit fast gleicher Einrichtung.
- Wechselt eine Klasse den Raum, behalten die SuS ihren Platz, wenn es ihn im neuen Raum auch gibt. Sonst wird
  die bisherige Sitzordnung vorher automatisch als Version gespeichert.
- Ein Raum lässt sich erst löschen, wenn keine Klasse mehr darin sitzt.

Beim Update von v6 werden die Daten automatisch umgestellt: Klassen mit demselben Raster kommen in denselben Raum
(außer es waren verschiedene Raumnamen eingetragen), aus jeder Raumvorlage wird ein Raum. Namen und Zuteilung
lassen sich danach unter „Räume“ anpassen.

## Datensicherung und Übertragung

- **Backup erstellen:** „Mehr“ → „Backup erstellen“.
  - iPhone: Es öffnet sich das Teilen-Menü → „In Dateien sichern“ (iCloud Drive oder „Auf meinem iPhone“).
  - Laptop: Die Datei landet im Ordner „Downloads“.
- **Backup einspielen:** „Mehr“ → „Backup einspielen“ (bei einer leeren App direkt auf dem Startbildschirm).
  **Ersetzt alle Daten auf diesem Gerät.**
- **iPhone → Laptop:** Am iPhone Backup erstellen, die Datei auf den Laptop bringen (iCloud Drive im
  Browser, Mail an dich selbst, USB-Kabel) und dort einspielen. Umgekehrt genauso.
  Am besten immer nur auf **einem** Gerät eintragen und dann übertragen, sonst überschreibt der Import
  die Einträge des anderen Geräts.
- Backups aus älteren App-Versionen lassen sich weiterhin einspielen. Umgekehrt nicht: Ein Backup aus v7 braucht
  auf dem anderen Gerät ebenfalls mindestens v7 (sonst erscheint „Bitte zuerst die App aktualisieren“).
- Die PIN und die Erinnerungs-Einstellungen bleiben auf dem jeweiligen Gerät, sie sind nicht im Backup.
- Die Backup-Datei enthält Schülerdaten und Fotos: nicht weitergeben, nicht unverschlüsselt in fremde Clouds legen.
- **CSV für Excel:** „Übersicht“ → „Übersicht als CSV“ (Summen pro Person im gewählten Zeitraum) oder
  „Alle Einträge als CSV“ (jede Beobachtung einzeln). Öffnet sich in Excel direkt mit Umlauten.

## PIN-Sperre

„Mehr“ → „PIN-Sperre“. Die PIN wird beim Öffnen abgefragt und nach einer einstellbaren Zeit im
Hintergrund erneut. Sie ist ein Sichtschutz, keine Verschlüsselung. **PIN vergessen** = nur alle Daten
auf dem Gerät löschen und ein Backup einspielen. Deshalb: Backup machen, bevor du eine PIN setzt.

## Updates einspielen

1. Code ändern.
2. In `sw.js` die Zeile `const VERSION = 'sitzplan-v7';` erhöhen (v8, v9 …).
   Diese Nummer wird in der App oben rechts angezeigt – so siehst du, ob das Update angekommen ist.
   Neue Dateien zusätzlich in die Liste `DATEIEN` eintragen.
3. Hochladen / pushen.
4. App am iPhone schließen und neu öffnen (manchmal zweimal). Die Daten bleiben erhalten.
