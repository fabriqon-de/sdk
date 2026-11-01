import { test, expect } from '@playwright/test';

test('guides, canonicals and license are available without JavaScript', async ({browser}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const [route, heading] of [['/guide/start','Schnellstart'], ['/api','API'], ['/mcp','Lokales MCP'], ['/license','MIT-Lizenz']]) {
      const response = await page.goto(route); expect(response.status()).toBe(200);
      await expect(page.locator('h1')).toContainText(heading);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://docs.plantframe.de${route}`);
    }
    await expect(page.locator('.vp-doc')).toContainText('MIT');
    const robots = await (await page.request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /datenschutz');
    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('https://docs.plantframe.de/guide/start');
    expect(sitemap).not.toContain('/404');
    expect(sitemap).not.toContain('AGENTS');
    expect(sitemap).not.toContain('CLAUDE');
  } finally { await context.close(); }
});

test('local documentation search finds DXF content', async ({page}) => {
  await page.goto('/');
  await page.locator('.VPNavBarSearch button').click();
  await page.locator('.VPLocalSearchBox input').fill('DXF');
  await expect(page.locator('.VPLocalSearchBox')).toContainText('DXF-Grundrisse');
  await page.keyboard.press('Escape');
  await expect(page.locator('.VPLocalSearchBox')).not.toBeVisible();
});

test('actual optional viewer renders and is removed during navigation', async ({page}) => {
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples');
  const canvas = page.getByRole('application');
  await expect(canvas).toBeVisible(); await canvas.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('status')).toHaveText('Auswahl: machine-1');
  await page.locator('a[href="/guide/core"]').first().click();
  await expect(page.locator('h1')).toHaveText('Core und Datenmodell');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('mobile layout remains readable and makes no third-party requests', async ({page}) => {
  const external=[]; page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4174/')) external.push(request.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/guide/start');
  await expect(page.locator('h1')).toHaveText('Schnellstart');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(external).toEqual([]);
});

test('WebGL failure leaves a useful guide and fallback', async ({page}) => {
  await page.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type.startsWith('webgl') ? null : get.call(this, type, ...args); }; });
  await page.goto('/examples');
  await expect(page.getByRole('alert')).toContainText('WebGL-fähigen Browser');
  await expect(page.locator('h1')).toHaveText('Interaktives SDK-Beispiel');
});
