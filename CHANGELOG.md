# Changelog

Notable changes are recorded here. This project is still an unpublished development preview; the entries below do not claim that an npm package or tagged release already exists.

## Unreleased

### Available in source

- Renderer-independent scene models, validation and JSON exchange with no external Core runtime dependencies.
- Prepared ASCII DXF import for straight walls and closed room contours.
- Optional Three.js viewer with procedural assets, selection, camera controls, custom geometry hooks, resource cleanup and an optional frame budget.
- MIT license and VitePress documentation for docs.fabriqon.de.

### Proposals on this development branch

- `@fabriqon/sdk/sensors`: dependency-free validation of the sensor contract, strict JSON, Home Assistant discovery import (scan, preview, explicit adoption), decoding, availability and freshness evaluation with stable reason codes, and a network-free connector.
- `@fabriqon/sdk/sensors/mqtt`: read-only MQTT bridge with an injected client (no MQTT dependency), exact approved topics, refusal detection from SUBACK, rate and size limits, idle close, replay of the last message and a bounded discovery scan. Tested with a simulated client, not against a real broker in this repository.

- Version 1 sensor catalog, model-binding and runtime-state contracts, with MQTT Discovery mapping, synthetic examples and development conformance checks. Studio integration lives in the application, not in the SDK.

### Project documentation

- Contribution, conduct, support, security and governance policies.
- Architecture, roadmap, release preparation and shared community pages in the documentation.
- House-planner development-version testing and docs rollout instructions.

Record actual release versions and dates only when a release is made. Incompatible changes to a published interchange format need a separate version and migration notes.
