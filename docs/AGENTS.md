# Fabriqon-Dokumentation

Die Regeln in ../AGENTS.md gelten. VitePress erzeugt ausschließlich statische Seiten für docs.fabriqon.de. Nach Änderungen npm run docs:build und npm run test:docs prüfen. Interne Links und Canonicals müssen zum Build passen; cleanUrls und nginx-Auflösung gemeinsam erhalten.

- SDK ist MIT-lizenziert, App bleibt privat. Keine Registry-Veröffentlichung behaupten, solange kein Paket existiert.
- Beispiele müssen die tatsächlichen Parser und Viewer verwenden. Keine privaten Backendquellen, Anmeldedaten oder Kundenmodelle veröffentlichen.
- Core ohne Renderer darstellen; Viewer erst bei Browser-Mount erzeugen und beim Verlassen entsorgen. Inhalt ohne JavaScript und WebGL-Fallback erhalten.
- Lokale Suche und Schriften verwenden; keine Remote-Fonts oder Trackingdienste ergänzen. OFL-Hinweise beibehalten.
- Buildausgaben und Cache unter .vitepress ignorieren; nicht in das SDK-Paket aufnehmen.
- Rechtliche Links führen zur bestehenden Landingpage. Keine eigenen Anbieterangaben erfinden oder Impressum/Datenschutz in die Docs-Sitemap aufnehmen.
