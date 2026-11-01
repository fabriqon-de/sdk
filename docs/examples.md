<script setup>
import ViewerExample from './.vitepress/components/ViewerExample.vue';
</script>

# Interaktives SDK-Beispiel

Dieses Beispiel lädt den tatsächlichen optionalen Viewer aus dem SDK. Es verarbeitet ausschließlich ein lokales Beispielmodell. Kein App-Server, Benutzerkonto oder Datenbankzugriff ist beteiligt.

<ViewerExample />

## Ohne JavaScript oder WebGL

Der [Core](/guide/core) bleibt unabhängig von der Darstellung nutzbar. Das Beispielmodell besteht aus einer Maschine, einer Steuerung und einer Verbindung:

```js
const model = {
  schemaVersion: 1, name: 'Dokumentationsbeispiel',
  assets: [
    { id: 'machine-1', name: 'Maschine', shape: 'box', kind: 'machine',
      position: { x: -2, y: 0, z: 0 }, size: { x: 2, y: 2, z: 1 } },
    { id: 'controller-1', name: 'Steuerung', shape: 'box', kind: 'controller',
      position: { x: 2, y: 0, z: 0 }, size: { x: 1, y: 2, z: 1 } }
  ],
  connections: [{ id: 'link-1', sourceId: 'machine-1', targetId: 'controller-1' }]
};
```
