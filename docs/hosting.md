# Dokumentation bereitstellen

Die Dokumentation wird mit VitePress gebaut und als statische Website ausgeliefert. Node, Vue und VitePress sind nur für den Build nötig. Das Laufzeitimage enthält nginx und die fertigen Seiten.

## Lokal entwickeln und prüfen

```sh
npm ci
npm run docs:dev
npm run docs:build
npm run docs:preview
```

Die Vorschau verwendet standardmäßig Port 4173. Ein vorhandenes Chromium lässt sich mit `CHROMIUM_PATH=/usr/bin/chromium npm run test:docs` verwenden; sonst zuerst `npx playwright install chromium` ausführen.

## Zusammen mit Landingpage und Demo

Die Dokumentation ist fest im Standard-Stack des privaten Landingpage-Repositories enthalten. Es ist keine zusätzliche Docs-Compose-Datei nötig:

```sh
# Im aktualisierten Landingpage-Checkout; vorhandene .env beibehalten.
docker compose up -d --build --wait --wait-timeout 600
```

Docker baut Docs standardmäßig direkt aus dem öffentlichen SDK-Git-Repository (main); ein zusätzlicher SDK-Checkout oder Token ist dafür nicht erforderlich. Der Build benötigt Internetzugriff. SDK_SOURCE_DIR kann alternativ einen vorhandenen lokalen Checkout oder eine öffentliche Git-Referenz mit Commit-SHA wählen. Bereits konfigurierte Werte bleiben gültig; lokale Checkouts müssen aktuell sein. Das private App-Repository wird weiterhin nur aus dem vorhandenen autorisierten APP_SOURCE_DIR gebaut.

Der vorhandene Traefik übernimmt TLS über das konfigurierte Proxy-Netz. DNS für docs.fabriqon.de muss auf diesen Server zeigen. Die Dokumentation hat keine Laufzeit-Abhängigkeit von App, Datenbank oder Home Assistant.

Nur die Dokumentation aktualisieren:

```sh
docker compose up -d --build docs
```

Für eine lokale Vorschau ohne vorhandenen Traefik:

```sh
docker compose -f compose.yml -f compose.local.yml up -d --build landing docs
npm run test:container
npm run test:docs
```

Die Dokumentation ist dann unter http://127.0.0.1:8081 erreichbar. Die früheren Docs-Overlays bleiben als leere Kompatibilitätsdateien erhalten und sind nicht mehr erforderlich. Die Landingpage-CI prüft die statischen Standarddienste ohne privaten App-Checkout.

## Eigenständiges Image

```sh
docker build -f Dockerfile.docs -t fabriqon-docs .
docker run --rm --read-only --tmpfs /tmp:uid=101,gid=101,mode=1777 -p 127.0.0.1:8081:8080 fabriqon-docs
```

Die Bereitstellung führt kein automatisches Live-Update durch. Nach Änderungen SDK-Checkout aktualisieren und den Docs-Dienst neu bauen. Quellen, `.env`, Buildcache und Node-Abhängigkeiten gehören nicht ins Laufzeitimage.

Änderungsdaten werden nur bei einem vorhandenen Git-Checkout angezeigt. Docker-Buildkontexte und Quellarchive bauen ohne Git-Metadaten; dafür wird weder Git installiert noch das .git-Verzeichnis ins Image kopiert.

## Neue Projektseiten auf docs.fabriqon.de sichtbar machen

Die Community-Seiten werden aus den kanonischen Dateien im Repository-Stamm eingebunden. Dadurch sind CONTRIBUTING, Security, Support, Conduct, Governance und Changelog auf GitHub und in den Docs inhaltlich konsistent. Die Sensorverträge stammen aus dem noch separat zu übernehmenden SDK-Vertrags-PR; diese Dokumentationsstufe baut auf dessen Entwicklungszweig auf.

Ein grüner Build stellt die Seiten bereit, aktualisiert aber keinen entfernten Server. Nach Übernahme der vorgesehenen PRs in den SDK-Hauptzweig im bestehenden Landingpage-Checkout nur Docs neu bauen:

```sh
docker compose build --no-cache docs
docker compose up -d --no-deps --wait --wait-timeout 300 docs
curl --fail https://docs.fabriqon.de/contributing
curl --fail https://docs.fabriqon.de/haus-blick
```

Die Befehle bauen und starten ausschließlich Docs; Demo, Datenbank und HA werden nicht gestartet. Falls SDK_SOURCE_DIR auf einen lokalen Checkout oder festen Commit zeigt, muss zuerst genau diese Quelle aktualisiert werden. `.env` und private App-Quellen bleiben erhalten. Die Befehle setzen einen vorhandenen, passenden Landingpage-Checkout und den eingerichteten Traefik voraus.

Für eine bewusst gewählte Vorabversion kann SDK_SOURCE_DIR einmalig auf eine öffentliche Git-Referenz mit vollem Commit zeigen. Den verwendeten Commit dokumentieren; ein späterer Standardaufruf verwendet wieder die regulär konfigurierte Quelle. Keine Credentials in Git-URLs hinterlegen.

Nach dem Neubau HTTP 200 und den tatsächlichen Inhalt von /contributing, /security, /changelog und /haus-blick prüfen. Die Anzeige von Version 0.2.0 als Haus-Blick-Teststand belegt nur die neue Anleitung, keine abgeschlossene HA-Abnahme. Die Root-URL kann schon mit einem älteren Build HTTP 200 liefern und beweist daher nicht, dass neue Unterseiten veröffentlicht wurden.
