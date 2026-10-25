# Tube Archivist

Hol deinen [Tube-Archivist](https://www.tubearchivist.com)-Server (das selbst
gehostete Archiv von YouTube-Kanälen, auf Basis von yt-dlp) über dein lokales
Netzwerk in Gladys: die archivierten Videos, die abonnierten Kanäle, die Größe
der Bibliothek, die Download-Warteschlange und ihre Fehler, die laufende
Aufgabe, die neuesten Videos auf einem Dashboard, Szenen, die auf ein neues
Video, einen fehlgeschlagenen Download oder eine leere Warteschlange reagieren,
und Szenenaktionen, um ein Video hinzuzufügen oder deine Abos nach Neuem zu
durchsuchen.

Die Integration wurde mit einem echten Tube Archivist v0.5.12 getestet (die
offiziellen Docker-Images, mit echten Downloads von YouTube), noch nicht in
einer echten Gladys-Installation: Rückmeldungen sind im
[Gladys-Forum](https://community.gladysassistant.com) oder in den
[Issues](https://github.com/guim31/gladys-tubearchivist/issues) willkommen.

## Was du brauchst

- Gladys Assistant 5.2.0 oder neuer.
- Einen **Tube Archivist**-Server ab v0.5, von Gladys aus erreichbar (gleiches
  Netzwerk), auf dem Port seiner Weboberfläche (standardmäßig `8000`).
- Das **API-Token** eines Admins von Tube Archivist: Melde dich als Admin an,
  öffne **Settings → Application** und kopiere das Token unter **API token**.
  Warteschlange und Aufgaben sind in Tube Archivist den Admins vorbehalten.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **Adresse** von Tube Archivist ein (zum
   Beispiel `192.168.1.2:8000`; ohne Port wird `8000` verwendet) und das
   **API-Token**.
3. Speichere und klicke auf **Verbindung testen**: Die Meldung unter der
   Schaltfläche nennt die Version von Tube Archivist, die Videos und die Größe
   der Bibliothek, die abonnierten Kanäle, die Warteschlange und die Fehler.
4. Öffne den Tab **Entdecken**: ein Gerät für den Server. Klicke auf
   **Hinzufügen**, wähle einen Raum und speichere.

Optionen:

- **Aktualisierungsintervall**: 1 bis 10 Minuten (standardmäßig 2 Minuten).
  Jede Aktualisierung sind acht kleine Anfragen an die API von Tube Archivist.
- **Sprache der Funktionsnamen**: die Namen, die die Funktionen beim Hinzufügen
  des Geräts erhalten (standardmäßig Französisch), der Text der laufenden
  Aufgabe und die Sätze der Szenenaktionen.

Die Integration liest Tube Archivist. Etwas ändert die Integration dort nur, wenn du es
verlangst: **Video hinzufügen** und **Neu suchen** (Schaltflächen des Widgets
oder Szenenaktionen).

## Das Gerät

Ein Gerät, **Tube Archivist** gefolgt von der Adresse des Servers:

| Funktion                    | Was sie liefert                                                      |
| --------------------------- | -------------------------------------------------------------------- |
| Online                      | 1, wenn Tube Archivist antwortet, sonst 0                            |
| Archivierte Videos          | Videos in der Bibliothek                                             |
| Abonnierte Kanäle           | Kanäle, die du in Tube Archivist abonniert hast                      |
| Größe der Bibliothek        | Größe der Videos auf der Festplatte, in GB                           |
| Videos in der Warteschlange | Videos, die auf den Download warten (ohne fehlgeschlagene)           |
| Fehlgeschlagene Downloads   | Videos der Warteschlange, deren Download fehlgeschlagen ist          |
| Heute heruntergeladen       | seit Mitternacht heruntergeladene Videos, gezählt von Tube Archivist |
| Laufende Aufgabe            | was Tube Archivist gerade tut (Download, Suche…), oder „Keine“       |
| Zuletzt archiviertes Video  | sein Titel und sein Kanal, als Text                                  |

Die Zahlen ändern sich bei jeder Aktualisierung. **Laufende Aufgabe** nennt das
Video, das gerade heruntergeladen wird, oder den Kanal, der gerade durchsucht
wird, mit dem Fortschritt.

## Dashboard

Das Widget **Tube Archivist** zeigt drei Kacheln (heute, in der Warteschlange,
fehlgeschlagen), die laufende Aufgabe, die Liste der zuletzt archivierten
Videos (Titel, Kanal und Datum) und zwei Schaltflächen:

- **Video hinzufügen**: ein Formular mit dem YouTube-Link (ein Video, eine
  Playlist oder ein Kanal) und dem Zeitpunkt des Downloads: **Sofort** (an der
  Spitze der Warteschlange, der Download startet) oder **Der Reihe nach** (am
  Ende der Warteschlange).
- **Neu suchen**: sucht jetzt nach neuen Videos deiner abonnierten Kanäle.

Füge es im Dashboard-Editor hinzu; es braucht keine Einstellung und
funktioniert schon, bevor das Gerät hinzugefügt ist.

## Szenen

### Auslöser

- **Video von Tube Archivist archiviert**: Tube Archivist hat gerade ein neues
  Video in die Bibliothek heruntergeladen. Filter: **Kanal** (der Name des
  YouTube-Kanals, genau wie Tube Archivist ihn anzeigt; leer: beliebig).
  Informationen für die Aktionen: der Kanal, der Titel, das
  Veröffentlichungsdatum auf YouTube, die Dauer, die Seite des Videos in Tube
  Archivist und die Zahl der heute heruntergeladenen Videos.
- **Tube-Archivist-Download fehlgeschlagen**: Der Download eines Videos der
  Warteschlange ist fehlgeschlagen (nicht verfügbar, nur für Mitglieder,
  blockiert, yt-dlp-Fehler). Gleicher Filter. Informationen: der Kanal, der
  Titel, die Fehlermeldung und der Link des Videos auf YouTube.
- **Tube-Archivist-Warteschlange leer**: Tube Archivist hat kein Video mehr
  herunterzuladen (fehlgeschlagene bleiben in seiner Warteschlange und zählen
  nicht). Informationen: die heute heruntergeladenen Videos und die
  fehlgeschlagenen Downloads.

Jedes Ereignis wird nur einmal gemeldet, auch nach einem Neustart der
Integration. Was Tube Archivist beim Start der Integration schon hatte, wird
nicht gemeldet.

### Aktionen

- **Neueste Tube-Archivist-Videos lesen**: liest Tube Archivist sofort und
  liefert einen Satz für eine Nachricht oder eine Sprachansage, etwa „Tube
  Archivist: 2 Videos heute heruntergeladen; zuletzt: „…“ (…), „…“ (…). 4 in
  der Warteschlange, 1 fehlgeschlagen.“, dazu die Zahlen einzeln (heute
  heruntergeladen, in der Warteschlange, fehlgeschlagen, archivierte Videos,
  Titel und Kanal des neuesten Videos). Option: die Zahl der im Satz genannten
  Videos (standardmäßig 3).
- **Tube-Archivist-Abos nach Neuem durchsuchen**: sucht jetzt nach neuen Videos
  deiner abonnierten Kanäle, wie **Rescan your Subscriptions** in Tube
  Archivist. Die neuen Videos kommen in die Warteschlange; Kanäle mit Autostart
  werden danach heruntergeladen.
- **Video zu Tube Archivist hinzufügen**: fügt einen YouTube-Link (Video,
  Playlist, Kanal) zur Warteschlange hinzu, heruntergeladen **Sofort**
  (standardmäßig) oder **Der Reihe nach**. Ein Link, den Tube Archivist
  ablehnt, lässt die Aktion mit dem Grund fehlschlagen.

### Szenen-Ideen

- Wenn ein Video deines Lieblingskanals archiviert wird, schick dir eine
  Nachricht: „Neu im Archiv: {title} ({channel}, {duration})“.
- Jeden Abend um 19 Uhr die Abos nach Neuem durchsuchen; wenn die
  Warteschlange leer ist, die neuesten Tube-Archivist-Videos lesen und den Satz
  auf dem Lautsprecher im Wohnzimmer ansagen.
- Wenn ein Download fehlschlägt, schick dir die Fehlermeldung, um die Cookies
  von yt-dlp zu erneuern oder das Video zu prüfen.

## Fehlerbehebung

- **„Tube Archivist antwortet nicht“**: Prüfe die Adresse und den Port
  (`8000`) und dass Gladys den Server erreicht (gleiches Netzwerk, Firewall).
- **„API-Token abgelehnt“**: Kopiere das Token erneut aus **Settings →
  Application** in Tube Archivist (ein widerrufenes Token ändert sich).
- **„Dieses Token kann die Download-Warteschlange nicht lesen“**: Das Token
  gehört einem Benutzer ohne Admin-Rechte; nimm das Token eines Admins.
- **„Kein Tube Archivist ab v0.5 unter dieser Adresse“**: Ein anderer Dienst
  antwortet auf diesem Port, oder Tube Archivist ist älter als v0.5 (die Pfade
  seiner API waren anders): Aktualisiere es.
- **„Die Adresse leitet um“**: Ein Reverse Proxy leitet auf eine Anmeldeseite
  oder auf HTTPS um; gib die direkte Adresse von Tube Archivist in deinem
  Netzwerk ein.
- **Heute heruntergeladen** bleibt bei 0, obwohl Videos ankommen: Tube
  Archivist zählt die Tage in seiner eigenen Zeitzone (`TZ` seines
  Containers); gib ihm die Zeitzone von Gladys.
- Mehr Details: Setze das `LOG_LEVEL` der Integration auf `debug` und öffne
  ihre Protokolle.

## Grenzen

- Zahlen, Ereignisse und laufende Aufgabe sind so frisch wie das
  Aktualisierungsintervall: Eine kurze Aufgabe zwischen zwei Aktualisierungen
  wird nicht gesehen.
- Nur die 25 neuesten Downloads werden bei jeder Aktualisierung verglichen:
  Über 10 neue Videos hinaus (eine große Playlist auf einmal) werden die Videos
  gezählt, nicht alle gemeldet. Ein importiertes oder neu indiziertes Video mit
  altem Download-Datum wird nicht gemeldet.
- Die 25 bis 50 neuesten fehlgeschlagenen Downloads werden gelesen; die anderen werden
  gezählt.
- **Video hinzufügen** wartet bis zu 15 Sekunden, bis Tube Archivist den Link
  annimmt; eine Playlist oder ein Kanal kann länger dauern: Die Aktion gelingt
  dann, und die Videos erscheinen bei der nächsten Aktualisierung in der
  Warteschlange.
- Die Integration wurde für die API von Tube Archivist v0.5 geschrieben
  (getestet mit v0.5.12): Eine künftige Version, die sie ändert, kann ein
  Update der Integration nötig machen.
- Nicht verbunden mit Tube Archivist, YouTube oder Google.
