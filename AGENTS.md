# PlantFrame SDK

Dieses Paket muss als eigener Quell-Checkout baubar und ohne App-Server nutzbar bleiben. Es enthält neutrale Modelle, prozedurale Geometrien, Three.js-Viewer und vorbereiteten DXF-Import. Kein Import aus dem privaten App-Verzeichnis src/, keine Next.js-/React-/Prisma-/Authentifizierungsabhängigkeit und keine privaten Bewertungsregeln.

- Core und DXF-Import haben keine externen Laufzeit-Abhängigkeiten. Core muss ohne DOM importierbar sein. Browserzugriff erst beim Erzeugen des Viewers.
- Einheiten sind Meter; Dateieinheiten ausdrücklich umrechnen. Räume und Sicherheitszonen sind unterschiedliche Fakten.
- Externe Modelle und Zeichnungen vor dem Rendern mit dem gemeinsamen Schema validieren. Ungültige Formen, Referenzen und übergroße Eingaben zurückweisen.
- Viewer gibt Beobachter, Listener, Animationen, Geometrien, Materialien, Texturen und WebGL-Kontext frei. dispose bleibt wiederholbar. Eigene assetFactory überträgt die Ressourcenverantwortung.
- Öffentliche API und Beispiel bei Änderungen gemeinsam pflegen. Im App-Checkout yarn sdk:build und yarn test verwenden; im eigenständigen Paket npm install, npm run build und npm test. dist und Archive nicht einchecken.
- Vor Veröffentlichung ein gepacktes Paket in einem eigenen Consumer ohne App-Abhängigkeiten prüfen. Das Viewer-Beispiel benötigt einen statischen HTTP-Server und optional installiertes Three.js. Das Core-Beispiel benötigt keinerlei Fremdpakete. npm run test:package prüft eine isolierte Produktionsinstallation ohne Three.js/Zod.
- Das öffentliche SDK-Quellrepository ist plantframe-de/sdk. Lizenz und Registry-Veröffentlichung sind noch nicht beschlossen. private:true und UNLICENSED bis zur Entscheidung beibehalten. Keine privaten App-Quellen übernehmen.
