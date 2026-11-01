# PlantFrame SDK

[![SDK checks](https://github.com/plantframe-de/sdk/actions/workflows/checks.yml/badge.svg?branch=main)](https://github.com/plantframe-de/sdk/actions/workflows/checks.yml)

A renderer-independent JavaScript/TypeScript SDK for spatial models, prepared DXF import and an optional Three.js viewer. **Core and DXF have zero external runtime dependencies.** No React, Next.js, application server, database or private assessment code is required.

[Documentation](https://docs.plantframe.de/) · [API](https://docs.plantframe.de/api) · [Examples](https://docs.plantframe.de/examples) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Status and license

This is an **unpublished development preview**, licensed under [MIT](LICENSE). This SDK has not been published to npm. `private: true` prevents accidental registry publication. Use the public source or a locally built archive; do not infer a released package from its name/version in package.json. Studio remains a separate private application, and Haus Blick has its own release lifecycle.

| Entry point | Purpose | Runtime requirements |
| --- | --- | --- |
| `@plantframe/sdk` | Scene/drawing types, validation and JSON serialization | None |
| `@plantframe/sdk/drawing` | Prepared ASCII DXF to walls and rooms | Core only |
| `@plantframe/sdk/viewer` | Interactive 3D, procedural assets and selection | Explicitly installed Three.js and a WebGL browser |
| `@plantframe/sdk/contracts/*.v1.schema.json` | Sensor catalog, bindings and state contracts | Static JSON files; proposal on this development branch |

Sensor contracts define data and behavior. They do not implement an MQTT connection, live application panel or history service.

## Quick start from source

Node.js 22+ and npm are required; CI covers Node 22, 24 and 26.

```sh
git clone https://github.com/plantframe-de/sdk.git
cd sdk
npm ci
npm run build
npm test
npm run test:package
npm pack
```

`npm pack` creates a local archive. Install that archive by file path in a separate project. Three.js is an optional peer and must be installed explicitly only if the viewer is used. Build tools, Ajv and documentation packages are development-only. The isolated package check verifies that Core/DXF and the schema files work without installing those runtime packages.

```js
import { parseSceneModel, serializeSceneModel } from '@plantframe/sdk';

const model = parseSceneModel({
  schemaVersion: 1,
  name: 'Example plant',
  assets: [{
    id: 'machine-1', name: 'Machine', shape: 'box', kind: 'machine',
    position: { x: 0, y: 0, z: 0 },
    size: { x: 2, y: 2, z: 1 }
  }],
  connections: []
});
console.log(serializeSceneModel(model));
```

The parser returns a detached copy and rejects invalid types, references, bounds and unknown fields with ModelValidationError. Dimensions are metres; positions refer to the ground footprint. See [the model contract](https://docs.plantframe.de/api) for limits.

## Optional viewer

Install a compatible Three.js (`^0.186.0`) in the consuming application. The container needs a nonzero height; initialize the viewer only in a browser.

```js
import { createViewer } from '@plantframe/sdk/viewer';

const viewer = createViewer(document.querySelector('#scene'), {
  maxFps: 30,
  onSelect: id => console.log(id)
});
viewer.setModel(model);
// When removing the component/page:
viewer.dispose();
```

Selection, explicit camera views, pause, custom geometry/connection factories and scene/frame hooks are available. Returned factory objects transfer resource ownership to the viewer. Preserve keyboard access, reduced motion and fallback behavior; dispose is idempotent. See [the viewer guide](https://docs.plantframe.de/guide/viewer).

## Drawing import and sensor contracts

The DXF importer handles prepared ASCII LINE/straight LWPOLYLINE walls and closed room contours on documented layers. It checks units and geometry; it does not claim arbitrary PDF/image recognition or complete DXF/IFC support. [Drawing guide](https://docs.plantframe.de/guide/drawing).

The sensor contract proposal separates catalog facts, model bindings and transient runtime values. It specifies MQTT Discovery mapping and the flow **select sensor → inspect state → open history → reach its source**. Native/normalized synthetic examples are in examples/sensors/. [Sensor guide](https://docs.plantframe.de/guide/sensors).

## Documentation and examples

VitePress builds [docs.plantframe.de](https://docs.plantframe.de/), including guides, API reference, examples, project policies and local search. Run `npm run docs:dev` for authoring or `npm run docs:build` for static output. Documentation uses self-hosted fonts and no tracking/CDN dependency.

After building, serve the repository root with a static HTTP server and open examples/core/ or examples/browser/. These examples need no App backend. Deployment uses Dockerfile.docs and the existing landingpage stack's docs service, not a second Home Assistant or Studio instance. [Hosting and live-update verification](https://docs.plantframe.de/hosting).

A source merge or successful CI does not automatically update the live documentation. New pages appear after the intended SDK stand is included and the docs service is rebuilt.

## Development and community

```sh
npm run build
npm test
npm run test:package
npm run docs:build
npx playwright install chromium
npm run test:docs
npm run test:viewer
```

Use CHROMIUM_PATH=/usr/bin/chromium for an installed browser. Run relevant checks for a focused change; do not claim unexecuted checks passed.

- [Contributing](CONTRIBUTING.md): setup, architecture boundaries, checks and PR expectations.
- [Support](SUPPORT.md): minimal reproductions and the right repository.
- [Security policy](SECURITY.md): private reporting and supported-source scope.
- [Code of Conduct](CODE_OF_CONDUCT.md) and [governance](GOVERNANCE.md).
- [Roadmap](https://docs.plantframe.de/roadmap), [release preparation](https://docs.plantframe.de/releases) and [changelog](CHANGELOG.md).

Preserve MIT and third-party notices. Do not contribute credentials, customer plans, private App sources or material you do not have permission to share.
