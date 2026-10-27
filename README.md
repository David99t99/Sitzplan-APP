# Sitzplan – PWA für Lehrkräfte

Sitzordnungen pro Klasse anlegen und im Unterricht nutzen.
Alle Daten bleiben **nur auf dem Gerät** (IndexedDB). Kein Server, keine Cloud, kein Tracking.

**Stand: Phase 3 (alle geplanten Funktionen)**
- Phase 1: Klassen, Raumraster, SuS (mit Foto und Namensliste), Zuweisen per Ziehen oder Antippen, Zufallsverteilung, Unterrichts-/Bearbeitungsmodus, offline-fähig.
- Phase 2: Beobachtungen. Im Unterrichtsmodus öffnet Antippen einer Person das Schnellmenü (Mitarbeit +/−, Verhalten +/−, Schnellbuttons, Notiz) mit „Rückgängig“. Am Platz stehen die Zähler von heute. Dazu kommen der Verlauf pro Person (Filter, Summen, bearbeiten, löschen, nachtragen), die Klassenübersicht (sortierbar) und konfigurierbare Schnellbuttons.
- Phase 3: Backup als Datei (inkl. Fotos) und Import, CSV-Export (Übersicht und alle Einträge), Backup-Erinnerung, Versionen der Sitzordnung (speichern, ansehen, wiederherstellen), Raumvorlagen, PIN-Sperre, Reihenfolge der Klassen-Tabs.
- v6: Oberfläche überarbeitet. Der Sitzplan passt am Handy ganz auf den Bildschirm (Gänge werden schmal gezeichnet, Tafel und Lehrertisch als beschriftete Blöcke), im Bearbeitungsmodus bleibt die Leiste „Ohne Platz“ unten stehen, einheitliche Symbole, eigene Sicherheitsfragen statt Browser-Fenstern, Hinweise auf den jeweils nächsten Schritt.
- v7: Räume sind eigenständig (siehe „Räume“ unten) und ersetzen die Raumvorlagen. Die Klassen-Tabs oben lassen sich durch Ziehen umsortieren (am Handy: Tab gedrückt halten, dann ziehen).
- v8: Abwesenheit. Im Schnellmenü „Abwesend“ antippen. Die Person erscheint an diesem Tag ausgegraut im Sitzplan („Wieder anwesend“ nimmt es zurück). Abwesenheiten stehen im Verlauf, werden in der Übersicht gezählt und sind in CSV und Backup enthalten.
- v9: Schulen und Stundenplan (siehe unten). Jede Schule hat eine Farbe (Strich unter den Klassen-Tabs) und ihre Stundenzeiten; der Sitzplan zeigt die laufende Stunde mit „noch … Min“.
- v10: Fächer im Stundenplan. Jede Stunde lässt sich als Informatik, GWB … markieren (Kürzel und Farbe), das Wochenraster zeigt die Stunden in der Fachfarbe. Dazu kleinere Design-Verbesserungen: eine Leiste „Mo–Fr | Woche“ statt zwei, Übersicht am Laptop mittig, kompakterer Kopf im Verlauf.
- v11: Eigenes Layout für den Laptop (ab 1000 px Fensterbreite): Navigation links statt unten, Kopf des Sitzplans in einer Zeile, „Ohne Platz“ und die Bearbeiten-Aktionen rechts neben dem Raster. Der Sitzplan passt so ohne Scrollen auf den Bildschirm und die Plätze werden größer. Am Handy bleibt alles wie bisher.
  Mitarbeit hat jetzt drei Knöpfe: + / ✓ / − (✓ = passt, nichts Auffälliges; zählt nicht in die Summe, steht aber als eigene Spalte in Übersicht und CSV). Im Schnellmenü löscht „Diese Stunde löschen“ alle Einträge der Person seit Beginn der laufenden Stunde (mit „Rückgängig“).
- v12: Automatisches Backup am Laptop: Die App speichert jede Woche (oder jeden Tag) von selbst ein Backup in einen Ordner, den man einmal auswählt (siehe „Datensicherung“).
- v13: Neues App-Symbol (abgerundete Kachel mit Tafel und Sitzplätzen, eigene Varianten für iPhone und Android, Symbol im Browser-Tab). „Mehr“ → „Automatisches Backup“ zeigt, wann das nächste Backup fällig ist und ob der Zugriff auf den Ordner erlaubt ist.
- v14: Knopf „Sperren“ oben rechts, immer sichtbar: sperrt die App sofort (PIN-Eingabe zum Entsperren).

## Projektstruktur

```
index.html              Grundgerüst der Seite
manifest.webmanifest    App-Name, Icons (für "Zum Home-Bildschirm" bzw. "App installieren")
icons/                  App-Symbole; icons/symbole-erzeugen.py zeichnet sie neu (Python + Pillow)
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
js/util/autobackup.js   Automatisches Backup in einen Ordner am Laptop (Edge/Chrome)
js/util/zeit.js         Uhrzeiten: welche Stunde läuft gerade, "noch … Min", mitlaufende Anzeige
js/views/plan.js        Ansicht "Sitzplan"
js/views/raum.js        Ansicht "Räume" (Liste aller Räume, Raster-Editor, Raum zuteilen)
js/views/schueler.js    Ansicht "SuS"
js/views/stundenplan.js Ansicht "Stundenplan" (Tag, Woche) und Schulen (Farbe, Stundenzeiten, Klassen)
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

Ab einer Fensterbreite von 1000 px nutzt die App ein eigenes Laptop-Layout: Die Navigation
steht links, und neben dem Sitzplan steht rechts eine Spalte mit „Ohne Platz“ (beim Bearbeiten
auch „Zufällig verteilen“, „Version speichern“, „Versionen“). Ausgelegt ist es auf einen
15"-Laptop mit Full HD und 125 % Skalierung (Fenster etwa 1536 × 780). Ist das Fenster
schmaler, erscheint die Handy-Ansicht.

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

## Schulen und Stundenplan

Wer an mehreren Schulen unterrichtet, legt unter „Stundenplan“ für jede Schule einen Eintrag an:

- **Farbe:** Jede Klasse dieser Schule bekommt oben unter ihrem Namen einen Strich in dieser Farbe
  (z. B. gelb für die eine, rot für die andere Schule). Welche Klassen dazugehören, stellst du bei der
  Schule ein oder unter „Mehr“ → „Angaben zur Klasse“ → „Schule“.
- **Stundenzeiten:** Von wann bis wann jede Stunde geht (vorgeschlagen sind 50-Minuten-Stunden, bitte anpassen).
  Im Sitzplan steht dann oben z. B. „3. Stunde 09:50–10:40 · noch 12 Min“ mit einem Balken,
  in der Pause „Pause · 4. Stunde ab 10:45 · in 4 Min“. Dafür reicht schon die Schule – der Stundenplan
  muss nicht ausgefüllt sein.
- **Stundenplan:** Unter „Woche“ ein Feld antippen, Klasse und Fach wählen, „Speichern“. Mo–Fr zeigt die Stunden
  eines Tages mit Uhrzeiten, Pausen und Freistunden; die laufende Stunde ist markiert. Antippen öffnet die Klasse.
- **Fächer:** Ein Fach (z. B. Informatik, GWB) hat ein Kürzel (INF) und eine Farbe. Damit sind die Stunden markiert:
  im Wochenraster farbig mit Kürzel, in der Tagesansicht mit farbigem Etikett, im Sitzplan vor der Stunde.
  Beim Eintragen schlägt die App das Fach vor, das die Klasse sonst hat. Fächer gelten für alle Schulen
  und stehen unter „Stundenplan“ → „Fächer“.
- Ist laut Stundenplan gerade eine andere Klasse dran, wechselt der Sitzplan beim Öffnen der App dorthin
  (auch nach mehr als 5 Minuten im Hintergrund). Ein Hinweis unten bietet „Zurück zu …“ an.
- Schule löschen löscht nur ihre Stundenzeiten und ihren Stundenplan, nicht die Klassen.

## Datensicherung und Übertragung

**Wo liegen die Daten?** In einer Datenbank des Browsers (IndexedDB), nicht im Cache. „Cache leeren“
löscht nur die App-Dateien, die Daten bleiben. Weg sind sie, wenn man im Browser die **Website-Daten**
(„Cookies und andere Websitedaten“) dieser Seite löscht oder die App deinstalliert. Deshalb Backups machen –
am Laptop am besten automatisch:

- **Automatisches Backup (Laptop, Edge/Chrome):** „Mehr“ → „Automatisches Backup“ → „Ordner wählen und
  einschalten“, z. B. einen neuen Ordner `Dokumente\Sitzplan-Backups`. Die App schreibt dann jede Woche
  (einstellbar: jeden Tag) beim Öffnen eine Datei `sitzplan-backup-JJJJ-MM-TT-automatisch.json` hinein und behält
  die letzten 10. Fragt der Browser nach dem Zugriff, „Bei jedem Besuch zulassen“ wählen. Sonst erscheint nach
  einem Neustart oben ein Hinweis, und ein Klick auf „Jetzt sichern“ genügt.
- **Backup erstellen:** „Mehr“ → „Backup erstellen“.
  - iPhone: Es öffnet sich das Teilen-Menü → „In Dateien sichern“ (iCloud Drive oder „Auf meinem iPhone“).
  - Laptop: Die Datei landet im Ordner „Downloads“.
- **Backup einspielen:** „Mehr“ → „Backup einspielen“ (bei einer leeren App direkt auf dem Startbildschirm).
  **Ersetzt alle Daten auf diesem Gerät.**
- **iPhone → Laptop:** Am iPhone Backup erstellen, die Datei auf den Laptop bringen (iCloud Drive im
  Browser, Mail an dich selbst, USB-Kabel) und dort einspielen. Umgekehrt genauso.
  Am besten immer nur auf **einem** Gerät eintragen und dann übertragen, sonst überschreibt der Import
  die Einträge des anderen Geräts.
- Backups aus älteren App-Versionen lassen sich weiterhin einspielen. Umgekehrt nicht: Ein Backup aus v9 braucht
  auf dem anderen Gerät ebenfalls mindestens v9 (sonst erscheint „Bitte zuerst die App aktualisieren“).
- Die PIN und die Erinnerungs-Einstellungen bleiben auf dem jeweiligen Gerät, sie sind nicht im Backup.
- Die Backup-Datei enthält Schülerdaten und Fotos: nicht weitergeben, nicht unverschlüsselt in fremde Clouds legen.
- **CSV für Excel:** „Übersicht“ → „Übersicht als CSV“ (Summen pro Person im gewählten Zeitraum) oder
  „Alle Einträge als CSV“ (jede Beobachtung einzeln). Öffnet sich in Excel direkt mit Umlauten.

## PIN-Sperre

„Mehr“ → „PIN-Sperre“. Die PIN wird beim Öffnen abgefragt und nach einer einstellbaren Zeit im
Hintergrund erneut. Der Knopf **„Sperren“ oben rechts** (immer sichtbar) sperrt die App sofort, z. B. wenn du
kurz aufstehst; gibt es noch keine PIN, fragt er zuerst danach. Die PIN ist ein Sichtschutz, keine Verschlüsselung. **PIN vergessen** = nur alle Daten
auf dem Gerät löschen und ein Backup einspielen. Deshalb: Backup machen, bevor du eine PIN setzt.

## Updates einspielen

1. Code ändern.
2. In `sw.js` die Zeile `const VERSION = 'sitzplan-v14';` erhöhen (v15, v16 …).
   Diese Nummer wird in der App oben rechts angezeigt – so siehst du, ob das Update angekommen ist.
   Neue Dateien zusätzlich in die Liste `DATEIEN` eintragen.
3. Hochladen / pushen.
4. App am iPhone schließen und neu öffnen (manchmal zweimal). Die Daten bleiben erhalten.
