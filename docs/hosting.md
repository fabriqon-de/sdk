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

Der vorhandene Traefik übernimmt TLS über das konfigurierte Proxy-Netz. DNS für docs.plantframe.de muss auf diesen Server zeigen. Die Dokumentation hat keine Laufzeit-Abhängigkeit von App, Datenbank oder Home Assistant.

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
docker build -f Dockerfile.docs -t plantframe-docs .
docker run --rm --read-only --tmpfs /tmp:uid=101,gid=101,mode=1777 -p 127.0.0.1:8081:8080 plantframe-docs
```

Die Bereitstellung führt kein automatisches Live-Update durch. Nach Änderungen SDK-Checkout aktualisieren und den Docs-Dienst neu bauen. Quellen, `.env`, Buildcache und Node-Abhängigkeiten gehören nicht ins Laufzeitimage.

Änderungsdaten werden nur bei einem vorhandenen Git-Checkout angezeigt. Docker-Buildkontexte und Quellarchive bauen ohne Git-Metadaten; dafür wird weder Git installiert noch das .git-Verzeichnis ins Image kopiert.
