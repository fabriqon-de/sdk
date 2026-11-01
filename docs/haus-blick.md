# Haus Blick testen

Haus Blick ist der eigenständige Haus- und Geräteplaner für eine vorhandene Home-Assistant-OS-Installation. Der Website-/Docs-Stack enthält weder Home Assistant noch einen Supervisor oder eine zusätzliche Haus-Blick-Anwendung.

## Welcher Stand ist testbar?

Der [Hausplaner in PR #9](https://github.com/fabriqon-de/haus-blick/pull/9) ist eine Entwicklungsversion 0.2.0 auf dem Branch `feat/house-planner`. Er baut auf dem offenen Grundlagen-PR #6 auf. Im Hauptzweig liegt noch keine installierbare Add-on-Version; das normale Hinzufügen der Repository-URL liefert diesen Entwicklungsstand daher noch nicht.

Geprüfter Quellstand für diese Anleitung: `a88bcf765a2cd2ce6359707ffeeb7805410d2543`. Unterstützte Zielarchitekturen sind amd64 und aarch64. Automatisierte Prüfungen sind vorhanden; eine reale HA-OS-Installation, Supervisor-Ingress und Backup/Restore müssen noch abgenommen werden. Eine separate Testinstallation ist dafür der sinnvollste erste Ort.

## Quellversion holen

Auf deinem Rechner mit Git:

```sh
git -c core.autocrlf=false clone --branch feat/house-planner --single-branch https://github.com/fabriqon-de/haus-blick.git
cd haus-blick
git checkout a88bcf765a2cd2ce6359707ffeeb7805410d2543
git rev-parse HEAD
```

Damit ist die Testversion reproduzierbar. Für einen späteren Stand den beabsichtigten Commit ausdrücklich wählen und im Testprotokoll notieren. Die Shell-Datei run.sh muss Unix-Zeilenenden (LF) behalten.

## Lokal in Home Assistant installieren

1. Den lokalen Apps-Ordner über die vorhandene Samba-Freigabe oder Terminal/SSH öffnen. Aktuelle HA-Versionen nennen ihn `local_apps` bzw. `/local_apps`; ältere Add-on-Installationen verwenden `/addons`. Den tatsächlich vorhandenen Ordner deiner Installation verwenden, keinen Systempfad auf Verdacht anlegen.
2. **Nur den inneren Ordner `haus_blick`** aus dem Checkout dorthin kopieren. config.yaml und Dockerfile müssen direkt unter `/local_apps/haus_blick/` bzw. `/addons/haus_blick/` liegen, nicht noch eine Repo-Ebene tiefer.
3. In HA den App-/Add-on-Store öffnen: aktuell Einstellungen → Apps → App installieren; ältere Oberflächen nennen den Bereich Add-ons.
4. Im Store „Auf Updates prüfen“ wählen und die Seite bei Bedarf neu laden. Unter „Lokale Apps/Add-ons“ Haus Blick auswählen und installieren. Der Supervisor baut das Image aus dem lokalen Dockerfile; dazu werden die öffentlichen Image-/Paketquellen benötigt.
5. Starten, das Protokoll ansehen und anschließend **„Weboberfläche öffnen“** verwenden. Die Anwendung ist für Ingress vorgesehen. Kein zusätzlicher Host-Port oder direkter Aufruf von Port 8099 ist erforderlich; direkter Zugriff wird absichtlich abgewiesen.

Die lokalen Ordner und Installationsschritte folgen dem [offiziellen HA-Tutorial](https://contributors.home-assistant.io/apps/first-app/). Diese Schritte setzen HA OS mit App-Verwaltung voraus; ein reiner Home-Assistant-Container bietet diese Verwaltung nicht.

## Was du in Version 0.2.0 prüfen kannst

- Eine Etage anlegen, Maße setzen und zwei rechteckige Räume erstellen.
- Ein Gerät platzieren, ausdrücklich einem Raum zuordnen und manuelle Entitäts-IDs wie sensor.test_temperatur hinterlegen.
- Speichern, Browser neu laden und anschließend das Add-on neu starten: Plan und Zuordnungen müssen erhalten bleiben.
- Den Plan als JSON exportieren. Einen Import zunächst als Entwurf ansehen; erst Speichern darf ihn dauerhaft übernehmen.
- Den Plan in zwei Tabs öffnen. Nach Speichern im ersten Tab muss der zweite einen Versionskonflikt anzeigen und den eigenen Entwurf behalten.
- Auf Mobilgerät/Tablet die Auswahl, Gerätebewegung und Bedienelemente testen.

Die Entitäts-IDs sind **nur manuelle Referenzen**. Automatischer HA-/MQTT-Geräteimport, aktuelle Sensorwerte, Schaltaktionen, SDK-3D, DXF/PDF und MCP sind damit noch nicht verfügbar. Dafür ist keine bereits bestehende gemeinsame SDK-Runtime zu behaupten.

## Backup und Fehlerberichte

Vor Updates eine vollständige HA-Sicherung erstellen. Backup/Restore auf einer getrennten Testinstallation prüfen. Datenbank und Installationsmarker gehören zusammen; ein Plan-JSON ersetzt kein vollständiges Backup. Keine Datenbankdateien löschen, um einen Startfehler zu übergehen.

Im Testbericht Commit, App-Version, Architektur, HA-OS-/Supervisor-Version und Ergebnis festhalten. Bei einem nicht sichtbaren lokalen Add-on die Verzeichnistiefe und YAML prüfen und danach die Supervisor-Logs ansehen. Keine Tokens, Datenbanken, privaten Grundrisse oder Zugangsdaten in öffentliche Fehlerberichte kopieren.

Die vollständige Checkliste liegt im [Abnahmedokument des Testzweigs](https://github.com/fabriqon-de/haus-blick/blob/feat/house-planner/docs/acceptance.md), Bedienung und Restore unter [haus_blick/DOCS.md](https://github.com/fabriqon-de/haus-blick/blob/feat/house-planner/haus_blick/DOCS.md).
