# Architektur und Grenzen

PlantFrame SDK stellt neutrale räumliche Daten und optionale Darstellung bereit. App-Server, Anmeldung, Datenbank, industrielle Bewertungsregeln und Home-Assistant-Betrieb bleiben in den jeweiligen Produkten.

| Baustein | Aufgabe | Abhängigkeiten zur Laufzeit |
| --- | --- | --- |
| Core | Modelle, Typen, begrenzte Validierung, JSON-Austausch | Keine externen Pakete, kein DOM |
| Drawing | Vorbereitete ASCII-DXF nach Mauern/Räumen | Core |
| Viewer | Three.js-Darstellung, Auswahl, Kamera, Ressourcenfreigabe | Core und ausdrücklich verfügbares Three.js |
| Sensor-Verträge | JSON-Schemas für Katalog, Bindungen und Status; Vertragsentwurf | Statische Dateien; Ajv nur für Entwicklungsprüfungen |
| Dokumentation | Guides, API, Beispiele und lokale Suche | VitePress/Vue nur im Build; statische Auslieferung |

## Daten und Kompatibilität

SceneModel und DrawingPlan verwenden Formatversion 1. Räume sind keine Sicherheitszonen, Positionen keine logischen Netzwerkzuordnungen. Einheiten werden ausdrücklich in Meter normalisiert. Externe Daten werden vor Verwendung mit dem passenden Vertrag geprüft.

Sensorkatalog, Modellbindungen und Live-Status bleiben getrennt; ihre Definition implementiert noch keinen MQTT-Client. Physische Platzierung, Projektberechtigungen und Historienspeicherung gehören zur Anwendung. Änderungen an Studio-Projektdateien werden nicht durch eine SDK-Änderung implizit freigegeben.

## Browser und Ressourcen

Core und DXF sind ohne DOM importierbar. Browserzugriffe entstehen erst beim Erzeugen des Viewers. Drei-dimensionales Rendering benötigt einen WebGL-fähigen Browser. Consumers können stattdessen eigene Renderer oder reine Datenverarbeitung verwenden.

Eigene Asset-/Verbindungsobjekte übertragen die Ressourcenverantwortung an den Viewer. Er entfernt Listener, Beobachter, Renderloop und GPU-Ressourcen beim Dispose. Beim Entfernen einer Ansicht muss die Anwendung dispose aufrufen. Zusätzliche Renderloops oder versteckte globale Zustände erschweren diese Garantie und gehören nicht zur Integrationsstrategie.

## Prüfungen

Die Werkzeugkette prüft Core/DXF zusätzlich mit ES2022 ohne DOM-Typen, packt das SDK in einen unabhängigen Consumer und installiert dort keine Fremdpakete. Viewer und Dokumentation werden im Browser geprüft; Containerchecks prüfen die statische Docs-Auslieferung. Das ersetzt keine Abnahme auf jedem Grafiktreiber, Browser oder Home-Assistant-Gerät.
