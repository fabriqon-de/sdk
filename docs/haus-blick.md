# Haus Blick testen

Haus Blick startet neu als **HACS-Dashboard-Karte**. Sie stellt vorhandene Home-Assistant-Entitäten in einem konfigurierbaren 3D-Hausmodell dar und verwendet den Fabriqon-Core sowie den optionalen Three.js-Viewer. Das [Repository](https://github.com/fabriqon-de/haus-blick) wurde dafür neu erstellt; frühere Add-on-Branches und deren Installationsanleitungen gelten nicht mehr.

## Entwicklungsstand 0.1.0

Rechteckige Räume, manuelle Entitäts-/Positionszuordnung, bestehende HA-Zustandswerte, ein visueller Karteneditor und der normale HA-Entitätsdialog sind implementiert. Zustandsänderungen kommen über `hass.states`; die Karte benötigt keinen eigenen Server, Container, Supervisor oder MQTT-Zugang. Sie funktioniert unabhängig von HA OS, sofern Home Assistant und HACS für Dashboard-Karten eingerichtet sind.

Die gebündelte Karte und der echte SDK-Viewer werden mit simuliertem Home Assistant im Browser geprüft. Reale HA-/HACS-Installation und Companion Apps sind noch nicht abgenommen. Es gibt noch keinen automatischen Haus-/Zeichnungsimport und keinen offiziellen HACS-Verzeichniseintrag.

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

## Auf deiner HA-Instanz prüfen

- Karte über HACS herunterladen, Modul laden und über den Kartenwähler hinzufügen.
- Echte Temperatur-, Licht- und Kontaktentitäten zuordnen; Raummaße und Positionen nach Dashboard-Speicherung und Neuladen prüfen.
- Zustandsänderungen, unbekannte/nicht verfügbare sowie entfernte Entitäten prüfen.
- Sensor im Modell oder in der Liste anklicken: Der normale HA-Entitätsdialog muss die richtige Entität öffnen. Verlaufsdaten setzen eine entsprechende Recorder-Konfiguration voraus.
- Mobile Touch-Bedienung, Dashboard-Wechsel, HACS-Update und HA-Sicherung/Wiederherstellung prüfen.

Versionen von Home Assistant, HACS und Browser/Companion App im Testbericht festhalten. Keine Tokens, privaten Grundrisse oder Sensordaten in öffentliche Issues kopieren. Die [Abnahme- und Testanleitung](https://github.com/fabriqon-de/haus-blick/blob/main/docs/testing.md) unterscheidet automatisierte Browserfixtures von tatsächlichen HA-Tests.

Das ist eine Frontend-Karte und keine Python-Integration. MQTT bleibt bei der bestehenden HA-Anbindung deiner Geräte; die Karte verbindet sich nicht zusätzlich mit dem Broker.
