# Changelog

Notable changes are recorded here. This project is still an unpublished development preview; the entries below do not claim that an npm package or tagged release already exists.

## Unreleased

### Available in source

- Renderer-independent scene models, validation and JSON exchange with no external Core runtime dependencies.
- Prepared ASCII DXF import for straight walls and closed room contours.
- Optional Three.js viewer with procedural assets, selection, camera controls, custom geometry hooks, resource cleanup and an optional frame budget.
- MIT license and VitePress documentation for docs.fabriqon.de.
- Asset Administration Shell module (`@fabriqon/sdk/aas`, metamodel V3 JSON): bounded parser, Digital Nameplate (IDTA 02006-3-0) builder and reader, one-level bill of material (IDTA 02011-1-1), Asset Interfaces Description reader (IDTA 02017) and credential stripping. No runtime dependencies; output is checked against aas-core3.0-typescript in tests.
- Sensor contract v1 gains the source kind `aas-interfaces` (additive): MQTT signals taken from an Asset Interfaces Description. `mqtt.discoveryTopic` becomes optional in the schema and parser; it stays required for `mqtt-discovery` sources and is rejected for `aas-interfaces` sources. Their source ID is `aas.<operator source>` (`operatorSourceId`). Existing catalogs remain valid.
- Sensor contract v1 gains the source kind `opcua` (additive): read-only OPC UA nodes. Signals carry `opcua` (`nodeId` in text form, optional `samplingIntervalMs` and `deadband`) instead of `mqtt`; the identity is `external-id` with the NodeId as its value. Endpoint, security mode and credentials never belong to the catalog. Existing catalogs remain valid. The SDK validates the contract only; it has no OPC UA client.

### Proposals on this development branch

- `@fabriqon/sdk/sensors`: dependency-free validation of the sensor contract, strict JSON, Home Assistant discovery import (scan, preview, explicit adoption), decoding, availability and freshness evaluation with stable reason codes, and a network-free connector.
- `@fabriqon/sdk/sensors/mqtt`: read-only MQTT bridge with an injected client (no MQTT dependency), exact approved topics, refusal detection from SUBACK, rate and size limits, idle close, replay of the last message and a bounded discovery scan. Tested with a simulated client, not against a real broker in this repository.

- Version 1 sensor catalog, model-binding and runtime-state contracts, with MQTT Discovery mapping, synthetic examples and development conformance checks. Studio integration lives in the application, not in the SDK.

### Project documentation

- Contribution, conduct, support, security and governance policies.
- Architecture, roadmap, release preparation and shared community pages in the documentation.
- House-planner development-version testing and docs rollout instructions.

Record actual release versions and dates only when a release is made. Incompatible changes to a published interchange format need a separate version and migration notes.
