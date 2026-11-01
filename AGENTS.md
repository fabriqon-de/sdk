# PlantFrame SDK

Dieses Paket muss als eigener Quell-Checkout baubar und ohne App-Server nutzbar bleiben. Es enthält neutrale Modelle, prozedurale Geometrien, Three.js-Viewer und vorbereiteten DXF-Import. Kein Import aus dem privaten App-Verzeichnis src/, keine Next.js-/React-/Prisma-/Authentifizierungsabhängigkeit und keine privaten Bewertungsregeln.

- Core und DXF-Import haben keine externen Laufzeit-Abhängigkeiten. Core muss ohne DOM importierbar sein. Browserzugriff erst beim Erzeugen des Viewers.
- Einheiten sind Meter; Dateieinheiten ausdrücklich umrechnen. Räume und Sicherheitszonen sind unterschiedliche Fakten.
- Externe Modelle und Zeichnungen vor dem Rendern mit dem gemeinsamen Schema validieren. Ungültige Formen, Referenzen und übergroße Eingaben zurückweisen.
- Viewer gibt Beobachter, Listener, Animationen, Geometrien, Materialien, Texturen und WebGL-Kontext frei. dispose bleibt wiederholbar. Eigene assetFactory überträgt die Ressourcenverantwortung.
- Öffentliche API und Beispiel bei Änderungen gemeinsam pflegen. Im App-Checkout yarn sdk:build und yarn test verwenden; im eigenständigen Paket npm install, npm run build und npm test. dist und Archive nicht einchecken.
- Vor Veröffentlichung ein gepacktes Paket in einem eigenen Consumer ohne App-Abhängigkeiten prüfen. Das Viewer-Beispiel benötigt einen statischen HTTP-Server und optional installiertes Three.js. Das Core-Beispiel benötigt keinerlei Fremdpakete. npm run test:package prüft eine isolierte Produktionsinstallation ohne Three.js/Zod.
- Das öffentliche SDK-Quellrepository ist plantframe-de/sdk. Der SDK-Code ist MIT-lizenziert; Lizenzhinweise erhalten. Die Registry-Veröffentlichung ist noch nicht erfolgt; private:true bleibt bis zu einer bewussten Paketveröffentlichung gesetzt. Keine privaten App-Quellen übernehmen.

## Dokumentation

VitePress unter docs/ baut docs.plantframe.de. Framework, Vue und Browser-Testwerkzeuge sind reine Entwicklungsabhängigkeiten. Core und DXF bleiben ohne externe Laufzeitpakete. Nutze npm run docs:build und npm run test:docs nach Inhalts-/Theme-Änderungen. docs/.vitepress/dist und cache bleiben ignoriert und dürfen nicht ins SDK-Paket geraten. Keine Installationsbefehle für unveröffentlichte Registry-Pakete behaupten. Der interaktive Viewer wird erst im Browser erzeugt und beim Verlassen freigegeben. Farben/Schriften entsprechen der Landingpage; Schriften lokal mit ihren OFL-Lizenzen ausliefern. Dockerfile.docs liefert nur die statische Website unter unprivilegiertem nginx. Keine privaten App-Quellen, Konten oder Zugangsdaten in Beispielen.
