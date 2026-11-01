import { defineConfig } from 'vitepress';
import { existsSync } from 'node:fs';

export default defineConfig({
  lang: 'de-DE', title: 'Fabriqon Docs', description: 'Dokumentation für Fabriqon SDK, Core, Three.js-Viewer und DXF-Import.',
  cleanUrls: true, lastUpdated: existsSync(new URL('../../.git', import.meta.url)), srcExclude: ['**/AGENTS.md', '**/CLAUDE.md'],
  head: [['link', { rel: 'icon', href: '/favicon.svg' }], ['meta', { name: 'theme-color', content: '#0f1720' }]],
  sitemap: { hostname: 'https://docs.fabriqon.de', transformItems: items => items.filter(item => !item.url.includes('404')) },
  transformPageData(page) {
    if (page.relativePath === '404.md') return;
    const path = page.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const url = `https://docs.fabriqon.de/${path}`;
    page.frontmatter.head ??= [];
    page.frontmatter.head.push(['link', { rel: 'canonical', href: url }], ['meta', { property: 'og:url', content: url }]);
  },
  themeConfig: {
    logo: '/favicon.svg', siteTitle: 'Fabriqon Docs',
    nav: [{ text: 'Einstieg', link: '/guide/start' }, { text: 'API', link: '/api' }, { text: 'Beispiel', link: '/examples' }, { text: 'Fabriqon', link: 'https://fabriqon.de/' }],
    sidebar: [
      { text: 'SDK kennenlernen', items: [{ text: 'Überblick', link: '/overview' }, { text: 'Schnellstart', link: '/guide/start' }, { text: 'Core & Datenmodell', link: '/guide/core' }, { text: 'Optionaler Viewer', link: '/guide/viewer' }, { text: 'DXF-Grundrisse', link: '/guide/drawing' }, { text: 'Interaktives Beispiel', link: '/examples' }] },
      { text: 'Referenz & Integrationen', items: [{ text: 'API & Grenzen', link: '/api' }, { text: 'Studio & Demo', link: '/studio' }, { text: 'Lokales MCP', link: '/mcp' }, { text: 'Sensoren & MQTT Discovery', link: '/guide/sensors' }, { text: 'Haus Blick', link: '/haus-blick' }] },
      { text: 'Projekt & Community', items: [{ text: 'Architektur', link: '/architecture' }, { text: 'Mitwirken', link: '/contributing' }, { text: 'Support', link: '/support' }, { text: 'Security', link: '/security' }, { text: 'Code of Conduct', link: '/code-of-conduct' }, { text: 'Governance', link: '/governance' }, { text: 'Changelog', link: '/changelog' }, { text: 'Roadmap', link: '/roadmap' }] },
      { text: 'Betrieb & Releases', items: [{ text: 'Dokumentation bereitstellen', link: '/hosting' }, { text: 'Versionierung & Releases', link: '/releases' }, { text: 'MIT-Lizenz', link: '/license' }] }
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/fabriqon-de/sdk' }],
    search: { provider: 'local', options: { translations: { button: { buttonText: 'Suchen', buttonAriaLabel: 'Dokumentation durchsuchen' }, modal: { noResultsText: 'Keine Treffer für', resetButtonTitle: 'Suche zurücksetzen', footer: { selectText: 'auswählen', navigateText: 'navigieren', closeText: 'schließen' } } } } },
    outline: { label: 'Auf dieser Seite' }, docFooter: { prev: 'Zurück', next: 'Weiter' },
    lastUpdated: { text: 'Zuletzt aktualisiert' },
    footer: { message: '<a href="https://fabriqon.de/impressum.html" rel="nofollow">Impressum</a> · <a href="https://fabriqon.de/datenschutz.html" rel="nofollow">Datenschutz</a> · <a href="/license">SDK: MIT</a>', copyright: '© 2026 Fabriqon contributors' }
  }
});
