# Security policy

PlantFrame SDK is a development preview. No stable npm release or long-term support series has been published. Maintainers handle current-source reports on a best-effort basis; historical commits have no promised backport or response-time guarantee.

## Report a suspected vulnerability privately

If GitHub shows a private "Report a vulnerability" action on this repository's Security tab, use it. Its availability is a repository setting, not something this file enables.

Otherwise use the published contact details at [PlantFrame's legal notice](https://plantframe.de/impressum.html) to request a private reporting channel. Do not put exploit details, tokens, broker credentials, private plans or personal data in a public issue. This policy does not advertise a separate security mailbox or a guaranteed response deadline.

Provide the affected commit/version, module, impact, a small synthetic reproduction and relevant environment details. Discuss disclosure and a fix with maintainers before publishing sensitive details. Ordinary usage questions and non-sensitive bugs belong in the issue tracker.

## Boundaries

- Core and drawing imports validate untrusted model/geometry input and must remain bounded and renderer-independent.
- Viewer resource cleanup, link handling and DOM presentation must not execute imported content as code or HTML.
- Sensor contracts define interchange data. They do not grant broker access, authorize subscriptions, confirm imported links or provide a live connector.
- A consuming application owns authorization, credentials, transport configuration, host/topic policy, persistence and deployment security.
- MIT licensing is not a security certification or warranty.

## Maintainer handling

Reproduce with synthetic data, determine affected versions and consumers, prepare a regression test where useful, and coordinate an appropriate fix and disclosure. Record security-relevant changes in release notes without exposing secrets. Dependency update automation and passing CI complement review; they do not establish the absence of vulnerabilities.
