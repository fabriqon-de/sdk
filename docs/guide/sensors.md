# Sensorimport und Datenquellen

**Status: versionierter Vertrag v1 mit JSON-Schemas und Beispielen, dazu ein abhängigkeitsfreies Laufzeitmodul (`@fabriqon/sdk/sensors`) und eine MQTT-Brücke mit injiziertem Client (`@fabriqon/sdk/sensors/mqtt`).** Eine Zeitreihendatenbank, ein Live-Panel und eine Home-Assistant-Verbindung gehören nicht zum SDK. Beides sind Entwicklungsstand im Quell-Repository, noch kein veröffentlichtes Paket.

Der Ablauf für den Nutzer lautet: **Sensor im Modell auswählen → Zustand und Alter sehen → Verlauf öffnen → Quellsystem erreichen.** Die Website oder App ersetzt dabei weder den Broker noch das bestehende Messwertsystem.

## Vier getrennte Datenbereiche

| Bereich | Zweck und Lebensdauer |
| --- | --- |
| Sensorkatalog | Quellen, Geräte, Messgrößen, stabile Identitäten und Lesezuordnung. Versionierter JSON-Import. |
| Modellbindungen | Bewusste Zuordnung zu vorhandenen Assets, lokale Anzeigenamen und bestätigte Links. Projektbezogen und mit eigenem Versionszähler gespeichert. |
| Laufzeitstatus | Letzter dekodierter Wert, Verfügbarkeit, Frische und Verbindungszustand. Kein Teil des gespeicherten 3D-Modells oder historischer Freigaben. |
| Verlauf | Vom gewählten Backend gelieferte Zeitreihe oder ausdrücklich verknüpftes Dashboard. MQTT Discovery allein liefert keinen Verlauf. |

Die vorhandenen SDK-Modelle bleiben bei schemaVersion 1, Studio-Projektdateien bei Format 3. Keine neuen Eigenschaften in diese streng validierten Dokumente schreiben. Katalog und Bindungen sind getrennte, versionierte Dokumente. Eine spätere Einbettung in Projektdateien benötigt eine eigene Kompatibilitätsentscheidung; die Datenbankzuordnung kann zunächst separat erfolgen.

## Dateien und Paketierung

- `/contracts/sensor-catalog.v1.schema.json`
- `/contracts/sensor-bindings.v1.schema.json`
- `/contracts/sensor-state.v1.schema.json`

Die Dateien werden mit der Dokumentation unter denselben Pfaden ausgeliefert und im SDK-Paket unter `contracts/` mitgegeben. Nach lokalem Bau und Paketinstallation kann ein Werkzeug `import.meta.resolve('@fabriqon/sdk/contracts/sensor-catalog.v1.schema.json')` verwenden. Das ist ein Dateiformat, kein neuer MQTT-Client und kein installierbares Registry-Release.

Alle Dokumente haben `schemaVersion: 1` und einen eindeutigen `kind`. Unbekannte Felder sind Fehler. Strukturprüfungen reichen nicht für Referenzen und Identitäten: Die zusätzlichen Regeln unten gelten ebenfalls. `scripts/validate-sensor-contracts.mjs` enthält die durch `npm test` ausgeführten Entwicklungschecks, kein zusätzlicher Runtime-Entry-Point. Ajv und Formatprüfungen sind reine Entwicklungsabhängigkeiten; SDK-Core und DXF bleiben ohne externe Laufzeitpakete.

## Sensorkatalog

Ein Katalog hat `catalogId`, `revision`, `generatedAt`, `sources`, `devices` und `signals`. Die Beispiele liegen unter `examples/sensors/` im SDK-Repository.

| Feld | Bedeutung |
| --- | --- |
| source.id | Dauerhafte lokale Kennung einer Instanz, unabhängig von Adresse oder Anzeigename. |
| source.kind | `mqtt-discovery`, `aas-interfaces`, `home-assistant`, `csv` oder `json`. Adapter für `home-assistant`, `csv` und `json` sind hier nicht implementiert. `aas-interfaces` beschreibt MQTT-Signale aus der Asset Interfaces Description (IDTA 02017) einer Verwaltungsschale. |
| device.externalIds | Typisierte Gerätealiaswerte (identifier oder connection mit Typ) innerhalb dieser Quelle. Keine Zusammenführung nur anhand eines Namens. |
| signal.id | Lokale, dauerhafte Messgrößen-ID. Eine Temperatur- und eine Feuchtemessung sind zwei Signale desselben Geräts. |
| signal.identity | Quellkennung als Tupel aus `sourceId`, `component`, Identitätsart und Wert. Namen und sichtbare MQTT-Topics sind keine Ersatz-IDs. |
| signal.dataType | `number`, `boolean` oder `string`. Einheit und stateClass sind nur für Zahlen erlaubt. |
| signal.lifecycle | `active` oder `removed`; entfernt bedeutet nicht, dass ein platziertes Modellobjekt gelöscht wird. |
| signal.mqtt | Aufgelöste Topics und begrenzter, deklarativer Extraktor für den lesenden Adapter. Bei Quellen `mqtt-discovery` ist `discoveryTopic` Pflicht, bei `aas-interfaces` nicht erlaubt (es gibt keine Discovery-Konfiguration). Signale von `aas-interfaces` haben die Identitätsart `external-id`, empfohlen als `<globalAssetId>#<Interface>/<Property>`. |
| signal.staleAfterSeconds | Optionale lokale Frischevorgabe. Nicht aus fehlender Aktivität raten und beim Reimport nicht durch Quellmetadaten überschreiben. |

IDs eigener Dokumentobjekte sind 1–128 Zeichen aus Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich, mit Buchstabe/Ziffer am Anfang. Asset-Referenzen erlauben auch die bestehenden SDK-IDs mit führendem Unterstrich. Maximal: 64 Quellen, 2.000 Geräte, 10.000 Signale bzw. Bindungen; Namen 200 Zeichen, Zustandstext 1.024 Zeichen, Links 2.048 Zeichen. Netzwerkadapter begrenzen rohe Discovery-Nachrichten zusätzlich auf 256 KiB und Katalogdateien auf 5 MiB UTF-8 vor dem JSON-Parsing. JSON-Objekte mit doppelten Schlüsseln müssen bereits beim Rohimport zurückgewiesen werden; ein späterer Schema-Check kann diese nach JSON.parse nicht mehr erkennen.

## MQTT-Discovery-Profil v1

Gemeint ist das [Home-Assistant-Discovery-Protokoll](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery). Das Profil übernimmt `sensor` und `binary_sensor`, sowohl einzeln als auch aus `device`/`components` (`cmps`). Gerätetopics benötigen zusätzlich `componentKey`. Ein konfigurierbarer Prefix wird exakt geprüft; `node_id` ist optional. Kurzformen und `~` werden vor der Normalisierung aufgelöst. Widersprüchliche Lang-/Kurzformen sind Fehler.

| Discovery | Normalisiertes Feld |
| --- | --- |
| unique_id / uniq_id | identity.kind = unique-id, identity.value |
| device / dev; identifiers / ids | Gerätealiaswerte |
| state_topic / stat_t | mqtt.stateTopic |
| unit_of_measurement / unit_of_meas | unit |
| device_class / dev_cla | deviceClass |
| state_class / stat_cla | stateClass |
| payload_on / pl_on; payload_off / pl_off | mqtt.booleanPayloads; Standard ON/OFF |
| availability_topic / avty_t oder availability / avty | mqtt.availability mit all/any/latest |
| expire_after / exp_aft | mqtt.expireAfterSeconds, nur wenn größer null |
| device.configuration_url / cu | Unbestätigter configurationUrlCandidate, kein automatisch freigegebener Link |

Details der Zustandsfelder: [MQTT Sensor](https://www.home-assistant.io/integrations/sensor.mqtt/) und [MQTT Binary Sensor](https://www.home-assistant.io/integrations/binary_sensor.mqtt/). `default_entity_id` oder ein Name belegen keine tatsächliche HA-Registry-Zuordnung. Eine solche Verbindung erfordert den HA-Adapter.

### Extraktion

`selector.kind` ist `text` oder `json-pointer`. Ein JSON-Pointer folgt RFC 6901: `/temperature`, `/channels/0/value`, `~0` für Tilde und `~1` für Schrägstrich in Schlüsseln. Ein leerer Pointer wählt das ganze JSON-Dokument; Container sind keine gültigen skalaren Messwerte. Pfadzugriffe verwenden ausschließlich eigene Objekteigenschaften, keine Prototypenkette.

Die erste Adapterumsetzung darf ein einfaches Template wie <code v-pre>{{ value_json.temperature }}</code> in `/temperature` übersetzen. Sonstige Jinja-Filter, Formeln, Verfügbarkeitstemplates oder fremder Code werden mit einer sichtbaren Meldung als nicht unterstützt markiert. **Ein unbekanntes Template darf nicht durch Weglassen falsch interpretiert werden.** Der betroffene Kandidat bleibt ohne aktive Livebindung, bis ein passender Adapter oder ein vorgeschalteter Transformationsschritt vorhanden ist. Geräte-/Origin-Zusatzmetadaten ohne Bedeutung für die Zustandsdekodierung dürfen mit Hinweis entfallen. MQTT-Befehlsfelder werden nicht in den lesenden Vertrag übernommen.

Zahlen werden nach Entfernen äußerer Leerzeichen strikt als endliche JSON-Zahlen dekodiert: keine leere Zeichenfolge als 0, kein NaN, Infinity oder Hexadezimalwert. Bei boolean gilt ein ausdrücklicher Vergleich mit zwei verschiedenen Payloads; niemals JavaScript-Truthiness verwenden. Nicht passende Werte liefern quality = invalid und value = null. Einheiten werden nicht stillschweigend umgerechnet.

### Identität, Aktualisierung und Entfernen

Die Normalisierung verwaltet eine dauerhafte Zuordnung vom externen Tupel zur internen signal.id. Das Tupel wird als JSON-Array verglichen, nicht mit einem mehrdeutigen Trennzeichen verkettet. Eine Änderung von Name, Gerätetext, Discovery-Locator oder stateTopic bei gleicher unique_id erzeugt keine neue Messgröße. Bei einem Wechsel von Einzel- zu Geräte-Discovery bleibt diese Zuordnung erhalten. Identifier und Verbindungstupel behalten getrennte Namensräume; etwa eine MAC-Verbindung wird nicht mit einer zufällig gleichlautenden Geräte-ID gleichgesetzt. Zugeordnete Gerätealiaswerte werden abgeglichen, bevor neue IDs entstehen; geänderte Reihenfolge oder zusätzliche Aliase allein dürfen kein Gerät duplizieren.

Fehlt unique_id, lautet die vorsichtige Ersatzidentität `JSON.stringify([discoveryTopic, componentKey ?? null])` mit kind = discovery-topic. Dieser Kandidat wird als schwache Identität gekennzeichnet; bei einem Topicwechsel ist ein manueller Abgleich erforderlich. Verschiedene Brokerinstanzen und Komponenten werden nie nur wegen gleicher Namen zusammengeführt. Wenn ein bislang schwacher Kandidat später eine unique_id erhält, wird eine mögliche Wiederzuordnung zur Bestätigung vorgeschlagen.

Eine leere Discovery-Nachricht oder explizite Komponentenentfernung erzeugt einen Entfernungskandidaten. Reine Abwesenheit in einem unvollständigen Scan löscht nichts. Migrationskennzeichen pausieren eine Discovery-Zuordnung; sie sind keine Aufforderung zur Löschung des Modells. Positionsdaten, Raumzuordnung, eigene Anzeigenamen, Links und Messwerthistorie bleiben erhalten. Entfernte Signale starten keine Live-Subscription mehr; ihre Bindung kann für eine sichtbare Archiv-/Verlaufszuordnung bestehen bleiben. Ein überarbeitetes, ungültiges Config-Paket darf die letzte gültige Definition nicht durch Teilwerte ersetzen; der bestehende Zustand erhält einen sichtbaren Konfigurationsfehler.

Der Importablauf ist **Lesen → Validieren → Vorschau (neu/geändert/entfernt/mehrdeutig/nicht unterstützt) → explizit übernehmen**. Beim Übernehmen werden erwartete Katalog-, Modell- und Bindungsversionen geprüft. Ein Konflikt erhält die Vorschau und verlangt erneuten Abgleich; kein stilles Überschreiben. Ein SDK-Parser führt diese Übernahme noch nicht aus.

## Modellbindungen und Links

Eine Bindungsdatei benennt catalogId, projectId, revision und modelRevision. Jeder Eintrag verbindet genau eine signalId mit einer existierenden assetId dieses Projekts. Ein Asset kann mehrere Messgrößen enthalten; ein Signal hat in dieser Datei höchstens eine Asset-Zuordnung. Für dasselbe physische Gerät aus mehreren Quellen braucht es eine bewusste Alias-/Quellauswahl statt doppelter oder zufälliger Zusammenführung.

Die Bindungen gehören dem Nutzer. Discovery aktualisiert diese Datei nicht. Auch wenn device.suggestedArea bekannt ist, wird keine Position, kein Raum und keine Sicherheitszone automatisch festgelegt. Ein verschobenes Asset bleibt mit denselben Messgrößen verbunden.

`links.history` und `links.source` sind optionale, bestätigte HTTP(S)-Links mit verständlichem Label. Beispiele: ein auf genau diese Messgröße gefiltertes Grafana-Dashboard und die Geräteoberfläche des Quellsystems. Keine Benutzerdaten im URL-Authority-Teil oder Zugangsdaten in Query/Fragmenten. Schemaform allein erkennt nicht alle Geheimnisse: zusätzlich mit einem URL-Parser, der Workspace-Hostfreigabe und der Verknüpfungsrichtlinie des Betreibers prüfen. Importierte configurationUrlCandidate-Werte sind Vorschläge, keine klickbaren Freigaben.

Der Browser öffnet bestätigte Links mit noopener/noreferrer. Kein automatischer Serverabruf, kein eingebettetes fremdes HTML und keine Ableitung einer URL aus ungeprüften Topicnamen. Fehlende Verknüpfungen werden als „Verlauf nicht angebunden“ bzw. „Kein Quellsystem verknüpft“ angezeigt. Vorhandene Ziele nutzen ihre reguläre Anmeldung; der Import enthält weder Brokerpasswörter noch Zugriffstokens.

## Laufzeitstatus

Jede Nachricht trägt catalogId/sourceId/signalId, streamId und sequence. Eine authentifizierte Subscription bestätigt zunächst den aktiven Stream und einen Snapshot. Danach gelten nur größere Sequenzen innerhalb dieses Streams und Signals. Ein fremder Stream darf nicht allein durch Eintreffen einer Nachricht aktiv werden. Nach Wiederverbindung liefert der Server einen neuen bestätigten Snapshot; Zeitstempel der Quelle dienen nicht als Sortierschlüssel.

Der Status unterscheidet:

- **sourceConnection:** connected, disconnected, unknown.
- **availability:** online, offline, unknown, nach dem bestätigten Verfügbarkeitsprofil aggregiert.
- **freshness:** fresh, stale, unknown.
- **reading:** letzter dekodierter Wert oder null; mit quality (valid/unknown/invalid), receivedAt, optional bekanntem observedAt und retained.

Ein retained-Wert ohne Messzeit wird nicht durch die neue Empfangszeit zu einer frischen Messung. Online-Meldung und Netzverbindung allein beweisen kein aktuelles Messergebnis. Ohne konfigurierte Verfügbarkeit ist online nur eine begrenzte Aussage aus einer tatsächlich empfangenen Live-Messung, kein Beleg für physische Gerätereichweite. Für ereignisgesteuerte Kontakte wird keine willkürliche Inaktivitätsfrist erfunden. Ein veralteter Zahlenwert bleibt mit Alter und Status sichtbar, erscheint aber nicht als aktueller Normalwert.

`expireAfterSeconds` übernimmt das explizite Ablaufverhalten der Quelle; Ablauf zeigt stale und offline mit dem Grund „Messwert abgelaufen“. Die zusätzliche lokale staleAfterSeconds-Vorgabe kann vorher warnen, ohne eine behauptete physische Offline-Meldung zu erfinden. Netzwerkverlust setzt die effektive Anzeige auf „Quelle getrennt“ und macht bekannte Werte veraltet; er erzeugt weder 0 noch false. Ohne Wert wird „Noch kein Messwert“ angezeigt.

Retained-Werte dürfen nur dann fresh sein, wenn observedAt bekannt ist und ein ausdrücklich vertrauenswürdiges Zeit-/Frischeprofil das belegt. Der Entwicklungschecker kann die Existenz dieser Betriebskonfiguration nicht beweisen. quality = invalid/unknown verlangt value = null. Ein UI darf einen separat gepufferten letzten gültigen Wert zeigen, muss ihn dann als solchen benennen. Über neue Werte, Duplikate und Verbindungsereignisse wird nicht die Projekt-Autospeicherung ausgelöst.

## Auswahl → Zustand → Verlauf → Quelle

1. Auswahl eines Sensors im 3D-, 2D- oder Listenmodell lädt nur die ausdrücklich zugeordneten Messgrößen. Die Auswahl selbst führt keinen neuen Import aus.
2. Das Detailpanel zeigt Gerätename, Messgrößenwahl, Wert mit Einheit oder Binärzustand, Mess-/Empfangszeit mit verständlichem Alter sowie Verbindung, Verfügbarkeit und Frische. „22,4 °C · vor 12 s“ ist zulässig; unbekanntes Messalter wird ausdrücklich genannt.
3. Bei mehreren Messgrößen am selben Asset kann etwa zwischen Temperatur und Feuchte gewechselt werden. Alle Aktionen bleiben auf die aktive signalId bezogen.
4. **Verlauf öffnen:** interne Historienansicht des gewählten Backends oder bestätigter externer Link. Zeitraum (z. B. 1 h / 24 h / 7 d), Einheit und Signal bleiben erkennbar. Keine Daten ergibt einen leeren Zustand, keinen erfundenen Verlauf.
5. **Quellsystem öffnen:** bestätigtes Ziel mit erkennbarem Anbieter/Host; reguläre Anmeldung im Zielsystem. Ein Fehler beim Verlauf oder ein fehlender Link verändert den Sensorzustand nicht.

History-Speicherung erhält nur akzeptierte Messereignisse. Die Adapter-Ereignisidentität ist (streamId, signalId, sequence); wiederholte Übermittlung desselben Envelopes erzeugt keinen weiteren Punkt. Gleiche Werte in verschiedenen echten Messereignissen bleiben hingegen gültige Messpunkte. Connection-/Availability-Updates und ein beim Reconnect wiederholter retained-Wert dürfen keinen neuen Messpunkt „jetzt“ erzeugen. Eine lückenlose Historie seit Gerätestart wird nicht aus Discovery versprochen. Ein späterer Historienadapter muss Zeiträume, maximale Punktzahl, Aggregation und Zugriffsrechte begrenzen.

## Laufzeitmodul und MQTT-Brücke

Das SDK enthält die neutrale Logik hinter dem Vertrag. Sie braucht keine Laufzeitpakete und läuft ohne DOM.

```ts
import { parseSensorCatalog, scanDiscovery, previewImport, applyImport, SensorConnector, planSubscriptions } from '@fabriqon/sdk/sensors';
```

| Funktion | Aufgabe |
| --- | --- |
| `parseSensorCatalog`, `parseSensorBindings`, `parseSensorState` | Strikte Prüfung wie die JSON-Schemas, dazu Referenz-, Identitäts- und Transportregeln. Wirft bei ungültiger Eingabe nicht, sondern liefert `{ ok: false, error }`. Zugangsdaten und auffällige Schlüssel in Links werden zurückgewiesen. |
| `parseStrictJson` | JSON mit Größenlimit, ohne doppelte Schlüssel und ohne `__proto__`. |
| `scanDiscovery`, `previewImport`, `applyImport` | Home-Assistant-Discovery zu Kandidaten, Vorschau gegen den Katalog, ausdrückliche Übernahme. Reine Abwesenheit löscht nichts. Nicht unterstützte Templates werden gemeldet und nicht geraten. |
| `decodeReading`, `evaluateRuntime` | Rohwert dekodieren, Verbindung, Verfügbarkeit und Frische bewerten. Gründe sind stabile Codes (`no-reading`, `expired`, `denied` und weitere); die Anzeigesprache bestimmt die Anwendung. |
| `planSubscriptions`, `isTopicAllowed`, `SensorConnector` | Nur exakte Topics innerhalb vom Betreiber freigegebener Präfixe. Der Connector erzeugt Zustandsdokumente mit Stream-ID und Sequenz. Nach einer Wiederverbindung beginnt ein neuer Stream. |

Die MQTT-Brücke liegt in einem eigenen Einstiegspunkt, weil sie Zeitgeber braucht. Das SDK hängt nicht von einer MQTT-Bibliothek ab. Der Aufrufer übergibt eine Funktion, die den Client erzeugt, zum Beispiel mit mqtt.js:

```ts
import mqtt from 'mqtt';
import { MqttSourceLink, attachConnector } from '@fabriqon/sdk/sensors/mqtt';

const link = new MqttSourceLink(
  { id: 'mqtt-home', allowedTopicPrefixes: ['lab'], discoveryPrefix: 'homeassistant' },
  () => mqtt.connect('mqtts://broker.example.test:8883', { username: 'reader', password: process.env.MQTT_PASSWORD, resubscribe: false }),
);
const { detach } = attachConnector(link, catalog, (states) => states.forEach(publishToViewers));
```

Eigenschaften der Brücke:

- Nur lesend. Es gibt keine Funktion zum Veröffentlichen.
- Abonniert nur exakte Topics der freigegebenen Präfixe, nie Wildcards. Die einzige Ausnahme ist `scanDiscovery` mit den zwei Discovery-Mustern unter dem Präfix. Nur Administratoren sollten sie auslösen.
- Verwirft Nachrichten über 64 KiB und über dem Ratenlimit (Standard 100 pro Sekunde).
- Erkennt verweigerte Abonnements im SUBACK (Code ab 128). Mosquitto nimmt gesperrte Abonnements mit `acl_file` still an. Fehlende Nachrichten sind deshalb kein Beleg für Zugriff.
- Verbindet beim ersten Abonnement und trennt nach Leerlauf. Ein später hinzukommender Abnehmer bekommt die letzte Nachricht je Topic mit der ursprünglichen Empfangszeit (der Broker liefert retained nur beim echten Abonnieren).
- Fehler erscheinen nur als kurzer Code, nie mit Adresse oder Zugangsdaten.

Nicht Teil des SDK: Betreiberkonfiguration und Geheimnisse, Persistenz von Katalog und Bindungen, Historie, Mehrinstanz-Betrieb und die Auslieferung an Browser. Das bleibt Aufgabe der Anwendung. Getestet ist die Brücke mit einem simulierten Client. Ein Test gegen einen echten Broker liegt in der Anwendung, die das SDK nutzt.

## Geplante Adaptergrenze

Backend-Konfiguration ordnet sourceId einem zugelassenen Connector zu. Brokeradresse, TLS, Zugangsdaten und Topic-Berechtigungen bleiben dort. Eine Projektdatei darf keine neue Brokerverbindung oder weitergehende Subscription auslösen. Nur die konfigurierten Quellen und exakten freigegebenen State-/Availability-Topics abonnieren; der Connector veröffentlicht keine Steuerbefehle.

Vorgesehene Anwendungsschnittstellen sind ein katalogbezogener Importvorschau-/Übernahmedienst, versionierte Bindungen, eine autorisierte Status-Subscription mit Snapshot/Stream-ID und ein History-Adapter bzw. bestätigte Deep Links. **Es gibt mit diesem Vertrag noch keine zusätzlichen HTTP-Endpunkte.** Alle späteren Aufrufe prüfen Projekt-/Quellrechte serverseitig. Der SceneModel-Core, MQTT-Decodierung, Historienanbieter und Produktoberfläche bleiben getrennte Adapter.

Für Haus Blick kann derselbe Vertrag verwendet werden. Seine Räume und HA-Bereiche bleiben eigene Zuordnungen; industrielle Netz- und Sicherheitszonen werden nicht auf Wohnhäuser übertragen. Eine Haus-Blick-Runtime-Anbindung ist noch nicht vorhanden.

## Abnahme der nächsten Umsetzung

- Repräsentative Discovery-Nachrichten des getesteten Importers gegen die Beispiele und Grenzen abgleichen.
- Einzel- und Geräte-Discovery einschließlich Kurzformen, Referenz-Topics, Verfügbarkeit und sichtbaren Unsupported-Fällen normalisieren.
- Wiederholter Import erzeugt keine Duplikate und erhält lokale Bindungen; Entfernung und konkurrierende Bearbeitung werden sichtbar behandelt.
- Sensorwahl zeigt reale Zustände; Testfälle für retained ohne Alter, Offline, ungültige Payloads, Topicwechsel und Wiederverbindung bestehen.
- Verlauf und Quellziel führen für die gewählte Messgröße zum richtigen autorisierten Ziel; fehlende Dienste ergeben verständliche Zustände.
- Kein Messwert landet unbeabsichtigt in Modellfreigaben, öffentlichen Beispielen oder Logs mit Zugangsdaten.
