# Entwicklungsstand und Roadmap

Diese Übersicht unterscheidet vorhandenen Quellcode, definierte Verträge und weitere Vorhaben. Sie nennt keine verbindlichen Liefertermine.

| Bereich | Stand |
| --- | --- |
| Core, Validierung und JSON-Austausch | Im SDK implementiert, ohne externe Laufzeitpakete |
| Begrenzter ASCII-DXF-Import | Implementiert für vorbereitete gerade Mauern und geschlossene Räume |
| Optionaler Three.js-Viewer | Implementiert, einschließlich Auswahl, Kamera, eigener Geometrien und Renderbudget |
| VitePress-Dokumentation | Implementiert und für docs.fabriqon.de paketiert |
| npm-Release | Noch nicht veröffentlicht; private:true schützt vor versehentlicher Veröffentlichung |
| Sensor-/MQTT-Importformat | Vertragsentwurf mit Schemas und Beispielen auf diesem Entwicklungszweig |
| Sensor-Laufzeitmodul und MQTT-Brücke (injizierter Client) | Implementiert, mit simuliertem Client getestet; Test gegen einen echten Broker liegt in der Anwendung |
| Live-Sensorpanel, Historie, Betreiberkonfiguration | Aufgabe der Anwendung, nicht des SDK |
| Haus Blick | Neue HACS-Dashboard-Karte mit bestehenden HA-Entitäten und SDK-Viewer; reale HA-/HACS-Abnahme offen |
| Weitere Zeichnungsformate, beliebige PDF-/Bildauswertung | Nicht Teil des vorhandenen DXF-Parsers |
| Öffentlicher Remote-MCP | Nicht Teil des SDK; vorhandener lokaler Dateikonnektor gehört zur App |

## Nächste sinnvolle Schritte

1. Verträge und öffentliche API anhand echter, anonymisierter Integrationen prüfen und die erste Paket-/Versionsstrategie abschließen.
2. Das Sensormodul gegen weitere Broker und reale Discovery-Daten prüfen (Zertifikatsketten, EMQX, HiveMQ, Home-Assistant-Add-on).
3. Haus Blick in einer tatsächlichen HA-/HACS-Instanz abnehmen; SDK-Modell und HA-Entitätsadapter getrennt halten.
4. Neue Formate oder Renderer anhand konkreter Anwenderfälle ergänzen, ohne den Core mit unnötigen Laufzeitpaketen zu belasten.

Der [Release-Leitfaden](/releases) beschreibt Voraussetzungen für eine tatsächliche Veröffentlichung. Ein Merge oder grüner Build ist weder ein npm-Release noch ein Live-Deployment.
