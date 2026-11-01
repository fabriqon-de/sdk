# DXF-Grundrisse importieren

Der erste Import unterstützt **vorbereitete ASCII-DXF-Dateien**. Er interpretiert keine beliebigen PDFs, Bilder oder vollständigen CAD-Projekte.

```js
import { importDxf } from '@fabriqon/sdk/drawing';

const { plan, warnings } = importDxf(dxfText, {
  unit: 'mm', name: 'Erdgeschoss', height: 2.7, thickness: 0.15
});
```

## Zeichnung vorbereiten

| Geometrie | Element | Layer |
| --- | --- | --- |
| Wandmittellinie | LINE oder gerade LWPOLYLINE | WALL, WALLS oder MAUERN |
| Geschlossener Raum | Geschlossene LWPOLYLINE | ROOM, ROOMS, RAUM oder RAEUME |
| Benannter Raum | Geschlossene LWPOLYLINE | Beispielsweise ROOM:Technik |

Einheiten kommen aus `$INSUNITS`: 4 = mm, 5 = cm, 6 = m. Fehlen sie, muss `unit` angegeben werden. Die Ausgabe verwendet Meter und ist standardmäßig zentriert; `center: false` erhält den umgerechneten Ursprung. DXF-Y entspricht Modell-−Z.

Ohne explizite Wandlinien entstehen Mauern aus den Raumkanten; vollständig gemeinsame Kanten werden zusammengefasst. Mit expliziten Wänden werden nur diese übernommen. Andere Layer erzeugen einen Hinweis. Kurven, nicht unterstützte Elemente auf den gewählten Layern, ungültige Polygone und 3D-Höhen werden abgewiesen.

Der SDK-Import gibt nur Daten zurück. Eine Übernahme in ein Projekt ist Sache deiner Anwendung; Studio bietet dafür eine ausdrückliche Vorschau und Übernahme. Räume werden nicht automatisch zu Sicherheitszonen.
