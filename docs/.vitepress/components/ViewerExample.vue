<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { FabriqonViewer } from '../../../dist/viewer.js';
const container = ref<HTMLElement | null>(null), selected = ref('Noch kein Bauteil ausgewählt.'), error = ref('');
let viewer: FabriqonViewer | undefined, disposed = false;
onMounted(async () => {
  try {
    const { createViewer } = await import('../../../dist/viewer.js');
    if (disposed || !container.value) return;
    viewer = createViewer(container.value, { onSelect: id => { selected.value = id ? `Auswahl: ${id}` : 'Keine Auswahl'; } });
    viewer.setModel({ schemaVersion: 1, name: 'Dokumentationsbeispiel', assets: [
      { id: 'machine-1', name: 'Maschine', shape: 'box', kind: 'machine', position: { x: -2, y: 0, z: 0 }, size: { x: 2, y: 2, z: 1 }, color: 0xffb703 },
      { id: 'controller-1', name: 'Steuerung', shape: 'box', kind: 'controller', position: { x: 2, y: 0, z: 0 }, size: { x: 1, y: 2, z: 1 }, color: 0x61aee0 }
    ], connections: [{ id: 'link-1', sourceId: 'machine-1', targetId: 'controller-1' }] });
  } catch { error.value = 'Die 3D-Ansicht benötigt einen WebGL-fähigen Browser. Das Modell und die API bleiben ohne Darstellung nutzbar.'; }
});
onUnmounted(() => { disposed = true; viewer?.dispose(); });
</script>
<template>
  <p>Ziehen dreht die Ansicht. Mit Pfeiltasten Bauteile auswählen; Escape hebt die Auswahl auf.</p>
  <div ref="container" class="docs-viewer" aria-label="Interaktives SDK-Beispiel"></div>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-else role="status">{{ selected }}</p>
</template>
