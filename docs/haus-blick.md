# Haus Blick testen

Haus Blick startet neu als **HACS-Dashboard-Karte**. Sie stellt vorhandene Home-Assistant-Entitäten in einem konfigurierbaren 3D-Hausmodell dar und verwendet den Fabriqon-Core sowie den optionalen Three.js-Viewer. Das [Repository](https://github.com/fabriqon-de/haus-blick) wurde dafür neu erstellt; frühere Add-on-Branches und deren Installationsanleitungen gelten nicht mehr.

## Entwicklungsstand 0.2.0

Rechteckige und polygonale Räume, echte Wände mit Tür-/Fensteröffnungen, einfache Flach-/Satteldachabschnitte und eine Geschossauswahl sind implementiert. Außenansicht, offene Innenansicht und Grundriss lassen sich umschalten. Garten-/Terrassenflächen, Bäume, Sträucher, Töpfe und Beete ergänzen das Modell; vorhandene HA-Entitäten werden innen und außen mit Zuständen und dem normalen HA-Entitätsdialog dargestellt. Zustandsänderungen kommen über `hass.states`; die Karte benötigt keinen eigenen Server, Container, Supervisor oder MQTT-Zugang. Sie funktioniert unabhängig von HA OS, sofern Home Assistant und HACS für Dashboard-Karten eingerichtet sind.

Die gebündelte Karte und der echte SDK-Viewer werden mit simuliertem Home Assistant im Browser geprüft. Reale HA-/HACS-Installation und Companion Apps sind noch nicht abgenommen. Es gibt einen begrenzten lokalen Import vorbereiteter ASCII-DXF-Dateien und SDK DrawingPlan JSON mit Vorschau, Einheiten, Drehung, Maßstab und ausdrücklicher Sensor-Neuzuordnung. Kein IFC-/PDF-/Foto-Import, keine automatische Hausrekonstruktion und kein offizieller HACS-Verzeichniseintrag. Import zunächst für eine Ebene; Dächer werden als einfache Abschnitte je Raum erzeugt.

## Über HACS installieren

1. HACS → Menü → Benutzerdefinierte Repositories öffnen.
2. `https://github.com/fabriqon-de/haus-blick` hinzufügen, Kategorie **Dashboard** (ältere Oberflächen: Frontend), und herunterladen.
3. Dashboard-Ressource prüfen: `/hacsfiles/haus-blick/haus-blick.js`, Typ **JavaScript-Modul**. Falls HACS sie nicht automatisch registriert, einmalig hinzufügen.
4. Browser vollständig neu laden und die Karte **Haus Blick** im Kartenwähler hinzufügen.
5. Im Editor tatsächliche HA-Entitäten auswählen und Räume/Positionen festlegen; Dashboard speichern.

Ohne GitHub Release verwendet HACS die gebaute Datei `dist/haus-blick.js` aus dem Hauptzweig. Zum Testen eines noch offenen Implementierungs-PRs die Datei aus dessen Branch manuell nach `config/www/haus-blick.js` kopieren und `/local/haus-blick.js` als Modul laden. Die [Installationsanleitung](https://github.com/fabriqon-de/haus-blick/blob/main/docs/installation.md) beschreibt Ressourcen und Cache-Erneuerung.

## Beispielkonfiguration

```yaml
type: custom:haus-blick-card
title: Mein Zuhause
rooms:
  - id: wohnen
    name: Wohnen
    x: 0
    z: 0
    width: 6
    depth: 4
entities:
  - entity: sensor.wohnzimmer_temperatur
    room: wohnen
    x: 2
    z: 1.5
```

Die Entitäts-ID ist ein Beispiel und muss durch eine tatsächlich vorhandene ID ersetzt werden. Maße und lokale Sensorpositionen sind Meter. Der Standardgrundriss ist keine aus HA automatisch rekonstruierte Hausstruktur.

## Haus, Garten und Import

Im Karteneditor Räume als Innenraum, Garten oder Terrasse konfigurieren; alle Maße sind Meter. Geschosse werden über ihre Elevation unterschieden. Dachform/Wandhöhe, Tür-/Fensteröffnungen und Gartenobjekte haben eigene Editorfelder. Garten-Entitäten wie Bodenfeuchte oder Bewässerung einer Außenfläche zuordnen; Pflanzen sind dekorativ, der Zustand kommt weiterhin aus HA.

Eine vorbereitete DXF-/JSON-Datei bis 2 MB im Editor auswählen und **Vorschau erstellen**. Konturen und Gesamtmaße prüfen, bestehende Entitäten ihren Zielräumen und Positionen zuordnen, dann ausdrücklich **Grundriss übernehmen** und das Dashboard speichern. Ungültige Referenzen oder Positionen sperren die Übernahme. Garten-/Terrassenflächen bleiben beim Import erhalten. Keine Datei wird hochgeladen.

[Haus und Garten als Beispiel](https://github.com/fabriqon-de/haus-blick/blob/main/examples/house-garden.json) · [Importformat und Grenzen](https://github.com/fabriqon-de/haus-blick/blob/main/docs/import.md) · [Konfiguration](https://github.com/fabriqon-de/haus-blick/blob/main/docs/configuration.md).

## Auf deiner HA-Instanz prüfen

- Karte über HACS herunterladen, Modul laden und über den Kartenwähler hinzufügen.
- Echte Temperatur-, Licht- und Kontaktentitäten zuordnen; Raummaße und Positionen nach Dashboard-Speicherung und Neuladen prüfen.
- Zustandsänderungen, unbekannte/nicht verfügbare sowie entfernte Entitäten prüfen.
- Sensor im Modell oder in der Liste anklicken: Der normale HA-Entitätsdialog muss die richtige Entität öffnen. Verlaufsdaten setzen eine entsprechende Recorder-Konfiguration voraus.
- Eigenen Grundriss mit Vorschau importieren; Maßstab, Dach, Fenster/Türen, Geschosse und Garten-Sensoren nach Speichern und Neuladen prüfen.
- Mobile Touch-Bedienung, Dashboard-Wechsel, HACS-Update und HA-Sicherung/Wiederherstellung prüfen.

Versionen von Home Assistant, HACS und Browser/Companion App im Testbericht festhalten. Keine Tokens, privaten Grundrisse oder Sensordaten in öffentliche Issues kopieren. Die [Abnahme- und Testanleitung](https://github.com/fabriqon-de/haus-blick/blob/main/docs/testing.md) unterscheidet automatisierte Browserfixtures von tatsächlichen HA-Tests.

Das ist eine Frontend-Karte und keine Python-Integration. MQTT bleibt bei der bestehenden HA-Anbindung deiner Geräte; die Karte verbindet sich nicht zusätzlich mit dem Broker.
