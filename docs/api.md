# API und Modellvertrag

## Core

Der Core ist renderer- und plattformunabhängig und benötigt keine externen Laufzeitpakete.

| Export | Rückgabe / Bedeutung |
| --- | --- |
| `parseSceneModel(value: unknown)` | Geprüfte, vom Eingang gelöste Kopie eines `SceneModel` |
| `parseDrawingPlan(value: unknown)` | Geprüfte Kopie eines `DrawingPlan` |
| `serializeSceneModel(model)` | Validiert das Modell und liefert formatiertes JSON |
| `ModelValidationError` | Fehler mit `issues` aus `path` und `message` |

Exportierte Typen: `SceneModel`, `SceneAsset`, `SceneConnection`, `SceneZone`, `DrawingPlan`, `DrawingWall`, `DrawingRoom`, `Point` und `Vector3`.

Modelle sind einfache JSON-Objekte. Unbekannte Felder, Typumwandlung, nicht endliche Zahlen und ungültige Referenzen werden abgewiesen. Optionale Werte dürfen fehlen; ausdrückliches `undefined` wird als Abwesenheit normalisiert. Parser verändern den Eingang nicht. SDK-JSON bleibt bei Version 1. Die früheren Zod-Schemaobjekte werden durch Parserfunktionen ersetzt; Anwendungen können diese bei Bedarf lokal in ihre eigene Validierung einbetten.

## Maße, Assets und Grenzen

Koordinaten und Größen sind Meter. Positionen beziehen sich auf die Grundflächenmitte an der Basis; positive Y-Werte zeigen nach oben. Koordinaten liegen zwischen −100000 und +100000, Größen sind positiv und höchstens 100000. IDs umfassen 1–128 ASCII-Wortzeichen, Punkte oder Bindestriche. Der Modellname hat 1–200 Zeichen; Asset-/Zonenbezeichnungen höchstens 200.

Assets unterstützen `box`, `cylinder` und `sphere`. Optionale prozedurale Typen sind `machine`, `robot`, `conveyor`, `controller`, `server`, `gateway`, `sensor` und `generic`. Farben sind ganzzahlige RGB-Werte von 0 bis `0xffffff`.

| Sammlung | Grenze |
| --- | --- |
| Assets | 2000 |
| Verbindungen | 10000 |
| Logische Zonen | 200 |
| Mauern pro Grundriss | 5000 |
| Räume pro Grundriss | 200 |
| Polygonpunkte pro Raum | 3–256 |

IDs sind innerhalb jeder Sammlung eindeutig. Verbindungen verbinden zwei verschiedene vorhandene Assets. Die logische Zonenzugehörigkeit steht ausdrücklich in `assetIds`; Grenzen leiten keine Zugehörigkeit ab und müssen eine positive Fläche haben.

Mauern brauchen verschiedene Endpunkte sowie positive Höhe und Stärke. Raumflächen dürfen weder degeneriert noch selbstschneidend sein. Die Zeichnungseinheit ist immer `m`. Räume werden nicht automatisch zu Sicherheitszonen.

## DXF-Import

`importDxf(text, options)` aus dem Entry Point `/drawing` liefert `{ plan, warnings }`. Optionen sind `unit` (`m`, `cm`, `mm`), `name`, `height`, `thickness` und `center` (standardmäßig `true`). Die Textgrenze beträgt 5 MB.

Zeichnungen nur mit Räumen erzeugen Mauern aus Raumkanten; vollständige gemeinsame Kanten werden dedupliziert. Explizite Wände haben Vorrang. Andere Layer werden mit Hinweis übersprungen; Elemente auf gewählten Layern müssen unterstützt sein. Es werden keine externen Referenzen oder Dateien geladen. Die unterstützten Elemente und Einheiten stehen im DXF-Leitfaden der Dokumentation.

## Optionaler Viewer

`createViewer(container, options)` aus `/viewer` liefert `setModel`, `select`, `fit`, `setCamera`, `setPaused`, `setAutoRotate` und `dispose`. Optionen sind `background`, `canvas`, `autoRotate`, `maxFps`, `keyboard`, `onSelect`, `assetFactory`, `connectionFactory`, `configure`, `onFrame` und `onContextLost`. Die Lebensdauer, Fabrikverantwortung und Frame-Zeitwerte beschreibt der [Viewer-Leitfaden](/guide/viewer#eigene-darstellung-und-animation). Erst das Erzeugen des Viewers benötigt Browser-APIs; Core greift nie auf DOM oder WebGL zu. Der Viewer-Entry-Point setzt ein ausdrücklich verfügbares Three.js voraus. Andere Renderer können dasselbe geprüfte Modell verwenden.

`createDrawingObject(plan)` erstellt eine validierte Three.js-Gruppe aus Raumflächen und Mauern. Außerhalb eines Viewers trägt der Aufrufer die Verantwortung für die Ressourcenfreigabe.

## Sensor-Verträge (Entwurf)

Drei statische JSON-Schema-Dateien beschreiben Sensorkatalog, explizite Modellbindungen und Laufzeitstatus. Sie sind im Paket über `@fabriqon/sdk/contracts/sensor-catalog.v1.schema.json`, `@fabriqon/sdk/contracts/sensor-bindings.v1.schema.json` und `@fabriqon/sdk/contracts/sensor-state.v1.schema.json` auflösbar. Ihre URLs in der gebauten Dokumentation liegen unter `/contracts/`.

Für die Laufzeit bietet das SDK zusätzlich `@fabriqon/sdk/sensors` (Prüfung, Discovery-Import, Dekodierung, Frische, Connector) und `@fabriqon/sdk/sensors/mqtt` (lesende Brücke mit injiziertem Client, ohne MQTT-Abhängigkeit). Siehe [Laufzeitmodul und MQTT-Brücke](/guide/sensors#laufzeitmodul-und-mqtt-brucke). Die [Sensor-/MQTT-Spezifikation](/guide/sensors) definiert zusätzliche Referenz- und Identitätsregeln sowie den Ablauf von Modellauswahl, Zustand, Verlauf und Quellsystem. Beispieldateien und Entwicklungsprüfungen begleiten den Entwurf. Die bestehenden SceneModel- und Studio-Dateiformate bleiben unverändert.
