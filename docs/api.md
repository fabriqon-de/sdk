# API and model contract

## Core: no renderer or platform dependency

- `parseSceneModel(value: unknown): SceneModel` validates and clones a model.
- `parseDrawingPlan(value: unknown): DrawingPlan` validates and clones drawing geometry.
- `serializeSceneModel(model): string` validates before producing JSON.
- `ModelValidationError` reports the failing field through `issues` and `message`.
- Exported types include `SceneModel`, `SceneAsset`, `SceneConnection`, `SceneZone`, `DrawingPlan`, `DrawingWall`, `DrawingRoom`, `Point` and `Vector3`.

Models are plain JSON objects. Unknown fields, coercion, non-finite numbers and dangling references are rejected. Optional values may be absent; explicit undefined is normalized to absence. The parser does not mutate inputs. Version 1 JSON remains compatible with the original development model. The former Zod schema objects are replaced by parser functions; applications needing Zod can adapt those functions locally without adding Zod to the SDK.

Coordinates and sizes are metres. Positions refer to the centre of an asset footprint at its base; positive Y is up. Coordinate bounds are ±100000, sizes must be positive and at most 100000. IDs are 1–128 ASCII word/dot/hyphen characters. The model name is 1–200 characters; asset/zone labels are at most 200.

Assets support box, cylinder and sphere shapes, plus optional procedural kinds: machine, robot, conveyor, controller, server, gateway, sensor and generic. Colors are integer RGB values from 0 to 0xffffff.

Limits per model: 2000 assets, 10000 connections and 200 zones. IDs are unique within each collection. Connections join two different existing assets. Logical zone membership is explicit through assetIds; bounds never infer membership. Zone bounds must have positive area.

Drawings support 5000 walls and 200 rooms, each room with 3–256 polygon vertices. Walls need distinct endpoints and positive height/thickness. Rooms need non-degenerate, non-self-intersecting polygons. Drawing unit is always m. Walls and rooms have unique IDs within their own collections. Rooms do not become security zones automatically.

## Drawing import: no external packages

`importDxf(text, options)` returns `{plan, warnings}`. Options are `unit` (m/cm/mm), `name`, `height`, `thickness` and `center` (default true). The input limit is 5 MB of text. Room-only drawings derive walls and deduplicate complete shared edges. Explicit wall layers take precedence over inferred room walls. Other layers are ignored with a warning; entities on selected layers must be supported. No external references or files are loaded.

## Optional viewer

`createViewer(container, options)` returns `setModel`, `select`, `fit` and `dispose`. Options include `background`, `autoRotate`, `onSelect` and `assetFactory`. Only calling this function requires browser APIs; Core never accesses DOM/WebGL. The viewer entry point requires Three.js to be explicitly available. A different renderer may consume the same validated model without this entry point.

`createDrawingObject(plan)` creates a validated Three.js group of room floors and wall meshes. The caller owns its rendering resources if the object is used outside a viewer.
