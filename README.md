# PlantFrame SDK

A renderer-independent JavaScript/TypeScript SDK for spatial models. Core and prepared DXF import have **zero external runtime dependencies**. Three.js is optional and used only by the separate viewer entry point. There is no React, Next.js, authentication, database or private assessment code in this repository.

This is a development preview. The source repository is https://github.com/plantframe-de/sdk. No package has been published to a registry. The SDK is MIT-licensed. `private: true` prevents accidental npm publication until a deliberate registry release. The private application and its backend are not licensed by this repository.

| Entry point | Purpose | Runtime requirements |
| --- | --- | --- |
| `@plantframe/sdk` | Types, validation and JSON serialization | None |
| `@plantframe/sdk/drawing` | Prepared ASCII DXF to walls and rooms | Core only; no external packages |
| `@plantframe/sdk/viewer` | Interactive 3D and procedural assets | Explicitly installed Three.js and a WebGL browser |

## Work with the source

```sh
npm ci
npm run build
npm test
npm run test:package
```

The build first checks Core and DXF with ES2022 libraries only, without DOM types. TypeScript, Vitest, Vite, type declarations and Three.js are development dependencies. They are not installed when consuming the packed SDK with production dependencies only. Three.js is an optional peer dependency, so Core consumers do not have to install it.

Until registry publication, consume an archive made with `npm pack` or use the built source checkout. Do not use a registry install command for this unpublished package. `test:package` packs and installs an archive offline into a temporary consumer, then proves that Core and DXF work without Three.js, Zod, React or Next.js.

## Core

```js
import { parseSceneModel, serializeSceneModel, ModelValidationError } from '@plantframe/sdk';

const model = parseSceneModel({
  schemaVersion: 1, name: 'Example',
  assets: [{ id: 'machine-1', name: 'Machine', shape: 'box',
    position: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 1 } }],
  connections: []
});
console.log(serializeSceneModel(model));
```

Parsing returns a detached, validated copy. Invalid input throws `ModelValidationError` with an `issues` array containing `path` and `message`. There are no Zod schema objects in the public API. The JSON format remains schema version 1. See [API and model contract](docs/api.md) for limits, geometry and units.

## Optional viewer

Install a compatible Three.js in your application only if you use the viewer. The source checkout already includes it as a development dependency.

```js
import { createViewer } from '@plantframe/sdk/viewer';
const viewer = createViewer(document.querySelector('#scene'), {
  onSelect: id => console.log(id)
});
viewer.setModel(model);
// When removing the component/page:
viewer.dispose();
```

The container needs a nonzero height. Arrow keys select assets; Escape clears selection. `setModel(model, {fit:false})` preserves the camera; `fit()` frames the model. `dispose()` is idempotent and frees observers, listeners and rendering resources. A disposed viewer cannot be reused. `assetFactory` objects transfer ownership of their geometry, materials and textures to the viewer.

## Drawings and examples

`importDxf(text, {unit:'mm', name:'Ground floor'})` from `@plantframe/sdk/drawing` accepts prepared ASCII DXF. Walls use LINE or straight LWPOLYLINE on WALL/WALLS/MAUERN layers; closed room outlines use ROOM/ROOMS/RAUM/RAEUME. `ROOM:Kitchen` gives a room name. Units come from `$INSUNITS` (4/5/6 for mm/cm/m) or an explicit option. Output uses metres and is centred by default; DXF Y becomes world -Z. Default walls are 2.7 m high and 0.15 m thick. Curves, 3D elevations, invalid polygons and unsupported entities on selected layers are rejected. No PDF/image recognition or full DXF implementation is claimed.

After building, serve the repository root with a static HTTP server. Open `examples/core/` for a browser example with no external imports, or `examples/browser/` for the optional Three.js viewer. No application server or database is required. Both examples load local files, without a CDN.

## Documentation

The VitePress documentation targets https://docs.plantframe.de and includes guides, API reference, an interactive viewer and local search. Run `npm run docs:dev` locally or `npm run docs:build` for static output. `npm run test:docs` checks the built site in Chromium. Deployment is documented in [hosting instructions](https://github.com/plantframe-de/sdk/blob/main/docs/hosting.md); Dockerfile.docs builds an unprivileged static nginx image. Documentation tooling is development-only and is excluded from the SDK package.

### Viewer extensions for interactive websites

The optional viewer accepts an existing canvas and supports pause, explicit camera positions, custom connection geometry, and scene/frame hooks. Websites can retain their visual design while the SDK owns rendering, picking and resource cleanup. Core still needs no external runtime packages. See the [viewer guide](docs/guide/viewer.md) for API details and ownership rules. `npm run test:viewer` exercises these features in a real browser; use `CHROMIUM_PATH` for an existing Chromium installation.

## Sensor import contract (proposal)

Versioned JSON Schemas define sensor catalogs, explicit model bindings and transient runtime state. The MQTT Discovery mapping and user flow (select a model sensor → see current state → open history → reach its source) are specified in [the sensor guide](docs/guide/sensors.md). Examples cover numeric and binary sensors, retained values, disconnection and invalid payloads. This adds static interchange contracts and development conformance tests; no MQTT connection, live UI, history database or Home Assistant integration is shipped. Core and DXF remain dependency-free. The schemas are included in the package under contracts/ and served by the built documentation.
