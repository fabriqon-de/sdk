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

Im privaten Landingpage-Checkout liegt `compose.docs.yml`. Der öffentliche SDK-Checkout liegt daneben als `../sdk` oder wird über `SDK_SOURCE_DIR` ausgewählt. `DOCS_DOMAIN` ist standardmäßig `docs.plantframe.de`.

```sh
# Im Landingpage-Checkout; vorhandene .env beibehalten.
docker compose -f compose.yml -f compose.docs.yml up -d --build docs
```

Der vorhandene Traefik übernimmt TLS und die Weiterleitung über das konfigurierte Proxy-Netz. DNS für docs.plantframe.de muss auf diesen Server zeigen. Die Dokumentation hat keine Abhängigkeit von App, Datenbank oder Home Assistant. Die bisherigen Dienste lassen sich weiterhin ohne das Docs-Overlay betreiben.

Für eine lokale Container-Vorschau ohne vorhandenen Traefik:

```sh
docker compose -f compose.yml -f compose.docs.yml -f compose.local.yml -f compose.docs.local.yml up -d --build docs
```

Die Dokumentation ist dann unter `http://127.0.0.1:8081` erreichbar. Für den gesamten Stack die Services nicht einschränken; dafür werden zusätzlich der autorisierte App-Checkout und die bisherige Demo-Konfiguration benötigt.

## Eigenständiges Image

```sh
docker build -f Dockerfile.docs -t plantframe-docs .
docker run --rm --read-only --tmpfs /tmp:uid=101,gid=101,mode=1777 -p 127.0.0.1:8081:8080 plantframe-docs
```

Die Bereitstellung führt kein automatisches Live-Update durch. Nach Änderungen SDK-Checkout aktualisieren und den Docs-Dienst neu bauen. Quellen, `.env`, Buildcache und Node-Abhängigkeiten gehören nicht ins Laufzeitimage.

Änderungsdaten werden nur bei einem vorhandenen Git-Checkout angezeigt. Docker-Buildkontexte und Quellarchive bauen ohne Git-Metadaten; dafür wird weder Git installiert noch das .git-Verzeichnis ins Image kopiert.
