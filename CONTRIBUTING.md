# Contributing to Fabriqon SDK

Contributions are welcome through issues and pull requests in [fabriqon-de/sdk](https://github.com/fabriqon-de/sdk). Start with the [documentation](https://docs.fabriqon.de/) and [architecture](https://docs.fabriqon.de/architecture). Use English for shared API names; English and German issue reports are welcome.

## Set up the source checkout

Node.js 22 or newer and npm are required. CI tests Node 22, 24 and 26. Use package-lock.json and npm; do not introduce another package manager.

```sh
git clone https://github.com/fabriqon-de/sdk.git
cd sdk
npm ci
npm run build
npm test
npm run test:package
```

Core and drawing code must compile with ES2022 libraries and no DOM types. Three.js is an optional peer for the viewer. Ajv, VitePress, Vue, TypeScript and browser testing tools are development dependencies, not required by Core consumers.

## Choose the right repository

- SDK models, drawing import, optional viewer, neutral sensor contracts and docs: this repository.
- Private Studio application, authentication, persistence and industrial rules: fabriqon-de/app.
- Home Assistant app packaging, house editor and HA adapters: fabriqon-de/haus-blick.
- Marketing website, its preview and combined deployment: fabriqon-de/landingpage.

Do not copy private application code, customer plans, credentials or proprietary assessment rules into this public SDK. Examples must be synthetic and reproducible.

## Make a focused change

Open an issue for a substantial API or architecture change before investing in a large implementation. A small, well-scoped fix may go directly to a PR. Describe the user problem and expected behavior; follow existing source style and avoid unrelated formatting changes.

Keep units in metres, rooms separate from security zones, model identity stable and validation shared at boundaries. An import must not silently reinterpret unsupported geometry, run templates as code, or erase manual model bindings. A new dependency needs a concrete reason and an explicit runtime/development classification.

The viewer owns resources returned by asset/connection factories. Preserve idempotent disposal, keyboard access, reduced motion, visibility handling and WebGL fallback. Do not create another animation loop beside the viewer.

## Run relevant checks

For source/API changes, run build, unit tests and the isolated package test above. Add tests for observable behavior and meaningful edge cases. Keep public examples, type definitions and API docs aligned. Do not add tests that only repeat an implementation detail.

For viewer behavior:

```sh
npx playwright install chromium
npm run test:viewer
```

For docs, examples or theme changes:

```sh
npm run docs:build
npx playwright install chromium
npm run test:docs
```

Use CHROMIUM_PATH=/usr/bin/chromium if Chromium is already installed. Browser checks require a usable local server and WebGL for relevant cases. Report skipped or unavailable checks honestly; do not mark a check as passed because it was not run.

## Submit a pull request

Branch from the intended target, keep commits reviewable, and fill in the PR template. Explain the concrete before/after behavior, compatibility implications and executed checks. Add a short CHANGELOG.md entry when behavior or public contracts change; pure typo fixes need no release entry.

Do not edit dist/, documentation build output, caches or generated copies in docs/public/contracts/. Edit canonical sources instead. Use npm to update package-lock.json. Static schemas in contracts/ are source files; their documentation copies are generated.

For a schema change, distinguish an unreleased draft from a published contract. Breaking a published JSON contract requires a new version and a migration plan. Existing Studio/project formats are separate contracts and must not be modified implicitly.

## License and conduct

SDK contributions are submitted under the repository's MIT license; preserve third-party notices. Only contribute material you have the right to share. No CLA or DCO/sign-off process is currently required. See the [Code of Conduct](https://docs.fabriqon.de/code-of-conduct), [support guide](https://docs.fabriqon.de/support) and [security policy](https://docs.fabriqon.de/security).
