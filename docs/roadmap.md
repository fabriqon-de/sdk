# Entwicklungsstand und Roadmap

Diese Übersicht unterscheidet vorhandenen Quellcode, definierte Verträge und weitere Vorhaben. Sie nennt keine verbindlichen Liefertermine.

| Bereich | Stand |
| --- | --- |
| Core, Validierung und JSON-Austausch | Im SDK implementiert, ohne externe Laufzeitpakete |
| Begrenzter ASCII-DXF-Import | Implementiert für vorbereitete gerade Mauern und geschlossene Räume |
| Optionaler Three.js-Viewer | Implementiert, einschließlich Auswahl, Kamera, eigener Geometrien und Renderbudget |
| VitePress-Dokumentation | Implementiert und für docs.plantframe.de paketiert |
| npm-Release | Noch nicht veröffentlicht; private:true schützt vor versehentlicher Veröffentlichung |
| Sensor-/MQTT-Importformat | Vertragsentwurf mit Schemas und Beispielen auf diesem Entwicklungszweig |
| MQTT-Brokeradapter, Live-Sensorpanel und Historienadapter | Weitere Umsetzung; nicht durch den Datenvertrag fertiggestellt |
| Haus Blick | Eigenständiges Add-on; Hausplaner im Entwicklungszweig, reale HA-OS-Abnahme offen |
| Weitere Zeichnungsformate, beliebige PDF-/Bildauswertung | Nicht Teil des vorhandenen DXF-Parsers |
| Öffentlicher Remote-MCP | Nicht Teil des SDK; vorhandener lokaler Dateikonnektor gehört zur App |

## Nächste sinnvolle Schritte

1. Verträge und öffentliche API anhand echter, anonymisierter Integrationen prüfen und die erste Paket-/Versionsstrategie abschließen.
2. Den getesteten MQTT-Import an den Sensorvertrag anschließen und Zustands-, Reimport- und Linkverhalten in der Anwendung abnehmen.
3. Haus Blick auf Home Assistant OS testen; gemeinsame SDK-Komponenten erst mit klarer Adaptergrenze übernehmen.
4. Neue Formate oder Renderer anhand konkreter Anwenderfälle ergänzen, ohne den Core mit unnötigen Laufzeitpaketen zu belasten.

Der [Release-Leitfaden](/releases) beschreibt Voraussetzungen für eine tatsächliche Veröffentlichung. Ein Merge oder grüner Build ist weder ein npm-Release noch ein Live-Deployment.
