# Getting help

Start with [docs.plantframe.de](https://docs.plantframe.de/), the [API reference](https://docs.plantframe.de/api) and the source examples. The SDK is a development preview and has not been published to npm; building or consuming a local archive is currently the supported documented path.

## Questions, bugs and feature requests

Use the issue forms in [plantframe-de/sdk](https://github.com/plantframe-de/sdk/issues/new/choose). Search existing issues first. Include the source commit, entry point, Node/browser and Three.js versions where relevant, expected/actual results and a small runnable example.

Use synthetic data. Remove credentials, broker addresses where private, personal information, proprietary files and real house/plant plans. Describe unsupported imports honestly; an arbitrary PDF/image or an arbitrary Jinja template is not a supported input just because a parser exists.

For viewer reports include browser/OS, WebGL availability, reduced-motion setting and a short reproduction. For drawing reports include units and a minimal permitted DXF. For sensor contract reports include the schema version and anonymized normalized/discovery messages.

## Scope and support expectations

Studio application issues belong in plantframe-de/app; Home Assistant installation or house-plan issues belong in [plantframe-de/haus-blick](https://github.com/plantframe-de/haus-blick). SDK documentation includes a [Haus Blick testing guide](https://docs.plantframe.de/haus-blick).

There is no published commercial support SLA or guaranteed compatibility with every browser, device or drawing producer. The issue tracker is not an emergency channel. Suspected vulnerabilities and conduct reports use the private reporting routes in SECURITY.md and CODE_OF_CONDUCT.md.
