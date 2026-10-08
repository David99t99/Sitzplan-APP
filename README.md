# Sitzplan – PWA für Lehrkräfte

Sitzordnungen pro Klasse anlegen und im Unterricht nutzen.
Alle Daten bleiben **nur auf dem Gerät** (IndexedDB). Kein Server, keine Cloud, kein Tracking.

**Stand: Phase 2**
- Phase 1: Klassen, Raumraster, SuS (mit Foto und Namensliste), Zuweisen per Ziehen oder Antippen, Zufallsverteilung, Unterrichts-/Bearbeitungsmodus, offline-fähig.
- Phase 2: Beobachtungen. Im Unterrichtsmodus öffnet Antippen einer Person das Schnellmenü (Mitarbeit +/−, Verhalten +/−, Schnellbuttons, Notiz) mit „Rückgängig“. Am Platz stehen die Zähler von heute. Dazu kommen der Verlauf pro Person (Filter, Summen, bearbeiten, löschen, nachtragen), die Klassenübersicht (sortierbar) und konfigurierbare Schnellbuttons unter „Klasse“.

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
js/util/ziehen.js       Drag & Drop mit dem Finger
js/util/foto.js         Fotos verkleinern (400 × 400 px, JPEG)
js/util/ui.js           Helfer: Elemente bauen, Dialoge, Meldungen, Avatare
js/util/beobachtung.js  Kategorien, Zeiträume (Heute … Schuljahr), Summen, Datumsformat
js/views/plan.js        Ansicht "Sitzplan"
js/views/raum.js        Ansicht "Raum" (Raster-Editor)
js/views/schueler.js    Ansicht "SuS"
js/views/klasse.js      Ansicht "Klasse" + Dialog "Neue Klasse" + Schnellbuttons
js/views/schnellmenue.js  Schnellmenü im Unterrichtsmodus
js/views/person.js      Verlauf einer Person (+ Filterleiste, Eintrag-Dialog)
js/views/uebersicht.js  Klassenübersicht (Tabelle)
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
- Wird die Homescreen-App gelöscht, sind auch ihre Daten weg. Export/Backup kommt in Phase 3.
- Der Code ist öffentlich sichtbar (bei öffentlichem Repo) – die **Daten nicht**,
  die liegen nur auf deinem Handy.

## Am Laptop (Windows) nutzen

Die GitHub-Pages-Adresse in **Edge oder Chrome** öffnen und rechts in der Adressleiste
„App installieren“ wählen. Dann läuft der Sitzplan wie ein eigenes Programm im
eigenen Fenster, auch offline. Am Laptop funktioniert alles mit der Maus: Ziehen,
Anklicken, Escape schließt Fenster.

**Wichtig:** Laptop und iPhone haben **getrennte Daten**, weil alles lokal gespeichert wird
und es absichtlich keine Cloud gibt. Daten von einem Gerät aufs andere übertragen
geht ab Phase 3 mit Export/Import (eine Datei, z. B. per USB-Kabel, OneDrive oder Mail an dich selbst).

## Updates einspielen

1. Code ändern.
2. In `sw.js` die Zeile `const VERSION = 'sitzplan-v3';` erhöhen (v4, v5 …).
   Diese Nummer wird in der App oben rechts angezeigt – so siehst du, ob das Update angekommen ist.
   Neue Dateien zusätzlich in die Liste `DATEIEN` eintragen.
3. Hochladen / pushen.
4. App am iPhone schließen und neu öffnen (manchmal zweimal). Die Daten bleiben erhalten.
