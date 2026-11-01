# Optionaler Three.js-Viewer

Nur wer eine 3D-Darstellung benötigt, installiert Three.js ausdrücklich in der eigenen Anwendung. Der Viewer unterstützt die im SDK-Paket angegebene Reihe `^0.186.0`:

```sh
npm install 'three@^0.186.0'
```

Nach Installation des lokal gebauten SDK-Pakets:

```js
import { createViewer } from '@plantframe/sdk/viewer';

const viewer = createViewer(document.querySelector('#scene'), {
  onSelect: id => console.log(id)
});
viewer.setModel(model); // zuvor erstelltes oder validiertes SceneModel

// Bei einer Aktualisierung optional die Kamera behalten:
viewer.setModel(updatedModel, { fit: false });
// Beim Verlassen der Ansicht:
viewer.dispose();
```

Der Container braucht eine Höhe, beispielsweise `height: 400px`. Bauteile lassen sich mit Maus oder Pfeiltasten auswählen. `select(null)` hebt die Auswahl auf, `fit()` passt die Kamera ein. `dispose()` kann wiederholt aufgerufen werden und gibt Listener, Beobachter und Rendering-Ressourcen frei.

Über `assetFactory` sind eigene Geometrien möglich. Deren Ressourcenverantwortung geht an den Viewer über. Rendererunabhängige Anwendungen importieren ausschließlich den [Core](/guide/core) und können stattdessen eine eigene Darstellung verwenden.

[Interaktives Beispiel öffnen](/examples)
