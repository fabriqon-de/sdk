# Optionaler Three.js-Viewer

Nur wer eine 3D-Darstellung benötigt, installiert Three.js ausdrücklich in der eigenen Anwendung. Der Viewer unterstützt die im SDK-Paket angegebene Reihe `^0.186.0`:

```sh
npm install 'three@^0.186.0'
```

Nach Installation des lokal gebauten SDK-Pakets:

```js
import { createViewer } from '@fabriqon/sdk/viewer';

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

## Eigene Darstellung und Animation

Der Viewer kann ein vorhandenes `canvas` übernehmen. Ohne diese Option erzeugt und entfernt er sein eigenes Canvas. Ein übergebenes Canvas bleibt bei `dispose()` im DOM; dessen WebGL-Ressourcen werden trotzdem freigegeben.

```js
const viewer = createViewer(container, {
  canvas: document.querySelector('canvas'),
  keyboard: 'camera', // Standard: 'select'
  autoRotate: true,
  configure({ scene, renderer }) {
    // Eigene Hallengeometrie zur Szene hinzufügen oder den Renderer konfigurieren.
    // Die Ressourcen angehängter Objekte übernimmt der Viewer.
  },
  onFrame({ camera, delta, elapsed }) {
    // Geometrie anhand von elapsed animieren oder HTML-Labels projizieren.
    // delta und elapsed sind Sekunden. Pause friert elapsed ein und setzt delta auf 0.
  },
  onContextLost() {
    // Statische Ersatzansicht anzeigen. Der Viewer stoppt sein Rendering.
  }
});
viewer.setModel(model);
viewer.setCamera({ x: 20, y: 18, z: 25 }, { x: 0, y: 1, z: 0 });
viewer.setPaused(true);
viewer.setAutoRotate(false);
```

`configure` läuft einmal beim Aufbau, `onFrame` vor dem Rendern sichtbarer Frames. Keine eigene Animationsschleife starten. Bei ausgeblendeter Seite oder außerhalb des sichtbaren Bereichs werden Animation und Darstellung ausgesetzt. Reduzierte Bewegung startet pausiert; ein Wechsel zu reduzierter Bewegung pausiert ebenfalls. `setPaused(false)` setzt eine ausdrücklich vom Nutzer gestartete Animation fort. Die automatische Kameradrehung bleibt bei reduzierter Bewegung aus.

Mit `keyboard: 'camera'` drehen Links/Rechts die Kamera, Auf/Ab verändern die Höhe und Plus/Minus den Abstand. Im Standardmodus wählen Links/Rechts Assets; Escape hebt die Auswahl auf. Eine Zeigerinteraktion beendet die automatische Kameradrehung. `setCamera(position, target?)` setzt die Ansicht ohne verbleibenden Drag-Impuls; `fit()` passt sie an die Modellgeometrie an.

`connectionFactory(connection, sourceObject, targetObject)` liefert eine eigene Three.js-Geometrie für einen zuvor validierten Modell-Link, beispielsweise einen gebogenen Datenweg. Sie ersetzt die Standardlinie. `assetFactory` und `connectionFactory` müssen neue Objekte liefern; der Viewer positioniert Assets anhand von `position.y + size.y / 2`. Beide Fabriken übertragen die Ressourcenverantwortung. Ungültige Modelle und Fabrikfehler lassen die bestehende Darstellung erhalten; bereits erzeugte Objekte eines fehlgeschlagenen Aufbaus werden freigegeben. `onSelect` wird nur bei einer tatsächlichen Änderung ausgelöst und darf die Auswahl anderer Bedienelemente synchronisieren.

Bei dauerhaft verlorenem WebGL-Kontext bleibt die Ersatzansicht aktiv. Für einen Neuaufbau den bisherigen Viewer entsorgen und einen neuen erzeugen. `dispose()` entfernt eigene Ereignislistener und Beobachter und stoppt die Animationsschleife; wiederholte Aufrufe bleiben erlaubt.

## Renderbudget

Mit `maxFps` (1–60, Standard 60) begrenzt eine Anwendung Animationsupdates und Rendering, beispielsweise auf 30 Bilder pro Sekunde für eine Landingpage. Die Animation verwendet weiterhin Sekunden statt Bildzähler und läuft dadurch nicht langsamer. Verdeckte und außerhalb des Viewports liegende Szenen werden weiterhin übersprungen.

```js
const viewer = createViewer(container, { maxFps: 30 });
viewer.setModel(model);
```

Ein Renderbudget beseitigt die synchrone WebGL-Initialisierung nicht. Für eine Website kann eine statische 3D-Vorschau mit ausdrücklichem Start des interaktiven Viewers sinnvoll sein. Eigene Geometrien möglichst in kleinen Arbeitsschritten erzeugen und zwischen größeren Blöcken dem Browser Rechenzeit geben. Modelle und Validierung bleiben unverändert.
