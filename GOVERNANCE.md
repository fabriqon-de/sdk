# Project governance

Fabriqon SDK is maintained in the fabriqon-de GitHub organization. Repository maintainers review changes and decide releases; this document does not establish a foundation, elected board or external ownership rights.

Contributors propose changes through issues and pull requests. Significant public API, format, dependency or architecture decisions should document the problem, alternatives, compatibility and trade-offs. Maintainers seek a clear technical rationale rather than consensus by vote count.

The public SDK remains separate from the private Studio application and the Haus Blick product. A contribution to one repository does not automatically change another product's release, license or deployment.

A normal change should receive review and the relevant green CI checks before merging. Repository settings such as required reviews, branch protection, CODEOWNERS permissions, private vulnerability reporting and npm trusted publishing must be configured by an authorized maintainer; adding Markdown does not enable those settings.

Releases follow docs/releases.md and retain MIT and third-party license notices. No npm publishing automation is currently configured. Maintainers should keep documentation, actual release availability and support claims consistent.
