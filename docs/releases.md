# Versionierung und Releases

Das SDK ist eine unveröffentlichte Entwicklungsversion. Die Paketversion im Quelltext ist noch kein Nachweis einer npm-Veröffentlichung. Es gibt aktuell keinen eingerichteten npm-Publish-Workflow oder bestätigten npm Trusted Publisher.

## Vor einem Paket-Release

- Paketname und Besitz-/Veröffentlichungsrechte des npm-Scopes prüfen. Eine GitHub-Organisation begründet keine npm-Rechte.
- Public API, Entry Points, Browser-/Node-Anforderungen und unterstützte Formate festhalten.
- CHANGELOG.md pflegen; Versionsnummer und package-lock.json gemeinsam aktualisieren.
- MIT- und Drittanbieterhinweise erhalten. Paketinhalt prüfen: keine Secrets, privaten App-Quellen, Caches oder gebauten Docs.
- Alle anwendbaren CI-Prüfungen bestehen und das gepackte Paket in einem unabhängigen Consumer verwenden.

```sh
npm ci
npm run build
npm test
npm run test:package
npm run docs:build
npx playwright install chromium
npm run test:docs
npm run test:viewer
npm pack --dry-run
```

Das Paket bleibt bis zu einer bewusst vorbereiteten Veröffentlichung private:true. Eine spätere Veröffentlichung soll nachvollziehbare Herkunft, eingeschränkte Berechtigungen und vorzugsweise npm Trusted Publishing/Provenienz nutzen. Dieser Leitfaden richtet weder Zugangsdaten noch einen Publisher ein und führt kein Publish aus.

## Versionen und Verträge

SemVer beschreibt Paketänderungen. Solange die API vor Version 1.0 als instabil gilt, müssen inkompatible Änderungen auch bei einer kleineren Versionsnummer ausdrücklich dokumentiert werden. Keine Kompatibilitätsgarantie allein aus einer Versionszeichenfolge ableiten.

Ein bereits veröffentlichter JSON-Vertrag behält seine Bedeutung. Inkompatible Struktur- oder Semantikänderungen benötigen eine neue Schemaversion und dokumentierte Migration. Unveröffentlichte Entwürfe dürfen noch überarbeitet werden, müssen aber als solche erkennbar bleiben. SDK-Modell-, Sensor- und Studio-Projektversionen sind getrennte Verträge.

## Release und anschließende Docs-Auslieferung

Bei einer tatsächlichen Veröffentlichung Version/Tag, Commit, Paketdateien und Release Notes einander zuordnen. Erst danach Installationsbefehle für ein Registry-Paket nennen. Ältere Versionen nur dann als unterstützt aufführen, wenn die Wartung tatsächlich übernommen wird.

Die Dokumentation liegt im SDK-Repository und wird im Landingpage-Stack als eigener Docs-Dienst gebaut. Ein Paket-Release veröffentlicht die Website nicht automatisch. Nach übernommenen Änderungen den Docs-Dienst aus dem vorgesehenen Stand neu bauen und die neuen Routen unter docs.fabriqon.de prüfen; siehe [Hosting](/hosting).
