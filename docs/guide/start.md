# Schnellstart

## 1. Quellcode bauen

Voraussetzung ist Node.js ab Version 22. Die CI prüft Node 22, 24 und 26. Ein Registry-Paket ist noch nicht veröffentlicht; verwende den Quellcode:

```sh
git clone https://github.com/plantframe-de/sdk.git
cd sdk
npm ci
npm run build
npm test
npm pack
```

`npm pack` erzeugt ein lokales Archiv wie `plantframe-sdk-0.1.0.tgz`. In deiner eigenen Anwendung installierst du dieses Archiv:

```sh
npm install /absoluter/pfad/sdk/plantframe-sdk-0.1.0.tgz
```

Für Core und DXF-Import werden keine Fremdpakete als Laufzeit-Abhängigkeit installiert. Die Entwicklungswerkzeuge im Quell-Checkout sind davon getrennt.

## 2. Modell prüfen und ausgeben

```js
import { parseSceneModel, serializeSceneModel } from '@plantframe/sdk';

const model = parseSceneModel({
  schemaVersion: 1,
  name: 'Meine Anlage',
  assets: [{
    id: 'machine-1', name: 'Maschine', shape: 'box',
    position: { x: 0, y: 0, z: 0 },
    size: { x: 2, y: 2, z: 1 }
  }],
  connections: []
});

console.log(serializeSceneModel(model));
```

Das funktioniert auch unter Node ohne DOM oder WebGL. Anschließend kannst du das Modell speichern, weiterverarbeiten oder einen [Viewer hinzufügen](/guide/viewer).

## 3. Beispiele öffnen

Stelle nach dem Build den Repository-Stamm mit einem statischen HTTP-Server bereit. `examples/core/` lädt nur den Core; `examples/browser/` zeigt den optionalen Viewer. Für die vollständige Dokumentationsvorschau:

```sh
npm run docs:dev
```

`npm run test:package` prüft ein separat installiertes Produktionspaket ohne Three.js, Zod, React oder Next.js. `private: true` schützt aktuell vor einer versehentlichen Registry-Veröffentlichung; es schränkt die MIT-Lizenz nicht ein.
