# Fabriqon sensor contracts, version 1

These JSON Schema 2020-12 documents define a sensor catalog, explicit model bindings and runtime state. They are a contract proposal, not an MQTT client, broker connection or shipped Studio/Home Assistant integration. The SDK scene model remains unchanged.

The schemas are standalone and included in the SDK package. Documentation builds copy them to `/contracts/` on docs.fabriqon.de. Their `$id` values are the canonical documentation URLs. Examples are in `examples/sensors/`; fake hosts use `.example.test`.

Schema validation must be followed by semantic checks: unique IDs and external identities, existing source/device/asset references, matching source/transport and data types, canonical topic fallback identities, one assignment per signal/project, and conservative freshness claims. `scripts/validate-sensor-contracts.mjs` provides an executable development conformance checker. It uses development-only Ajv packages and is deliberately not a new runtime dependency or public parser API.

The full normative mapping, reimport ownership, runtime ordering, history/deep-link behavior and application acceptance criteria are in `docs/guide/sensors.md`. MQTT protocol references are linked there. Native MQTT examples represent alternative discovery encodings; no converter is shipped by these schema files.
