# Überblick

Fabriqon trennt ein neutrales räumliches Modell von seiner Darstellung und von produktbezogenen Funktionen.

| Baustein | Zweck | Externe Laufzeit-Abhängigkeiten |
| --- | --- | --- |
| SDK Core | Modelle validieren und als JSON austauschen | Keine |
| DXF-Import | Vorbereitete Zeichnungen in Mauern und Räume umwandeln | Keine |
| Optionaler Viewer | Modelle mit Three.js interaktiv darstellen | Three.js |
| Studio | Industrieller Editor mit Anmeldung, Datenbank, Regeln und Freigaben | Private Anwendung; kein Bestandteil des SDK |
| Lokales MCP | Kontrollierter Zugriff auf Studio-Projektexporte | Separater App-Konnektor |
| Haus Blick | Geplante räumliche Übersicht für Home Assistant | Separates Add-on mit eigenem Entwicklungsstand |

Ein Core-Nutzer muss weder Three.js noch ein Frontend-Framework installieren. VitePress, Vue und die Werkzeuge dieser Dokumentation sind reine Entwicklungsabhängigkeiten und gelangen nicht in die Core-Produktionsinstallation.

Die MIT-Lizenz gilt für den SDK-Code. Sie veröffentlicht weder den privaten Studio-Code noch dessen Backend. Eine Registrierung in npm und eine Haus-Blick-SDK-Integration sind noch nicht erfolgt.
