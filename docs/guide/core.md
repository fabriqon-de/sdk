# Core und Datenmodell

Der Core beschreibt Assets, Verbindungen, logische Zonen sowie optionale Grundrisse. Er enthält keine industriellen Bewertungsregeln, Benutzerverwaltung oder Persistenz.

## Validieren statt ungeprüft rendern

```js
import { parseSceneModel, ModelValidationError } from '@fabriqon/sdk';

try {
  const model = parseSceneModel(externalData);
  // model ist eine geprüfte, vom Eingang gelöste Kopie.
} catch (error) {
  if (error instanceof ModelValidationError) {
    console.error(error.issues); // path und message des ungültigen Feldes
  } else throw error;
}
```

Unbekannte Felder, ungültige Referenzen, nicht endliche Zahlen und übergroße Sammlungen werden abgewiesen. Die vollständigen Grenzen stehen in der [API-Referenz](/api).

## Einheiten und Zugehörigkeit

Alle Modellmaße sind Meter; positive Y-Werte zeigen nach oben. Die Position eines Assets bezeichnet seine Grundflächenmitte auf seiner Basis. Größen müssen positiv sein.

Zonen gehören über `assetIds` ausdrücklich zu Assets. Ein Asset wird durch räumliches Verschieben nicht automatisch einer anderen logischen Zone zugeordnet. Räume eines Grundrisses sind keine Sicherheitszonen.

SDK-Modelle tragen `schemaVersion: 1`. Das ist unabhängig vom Studio-Projektformat, das weitere private Anwendungsfakten enthält. Ein Studio-Projektexport ist daher nicht automatisch ein neutrales SDK-Modell.
