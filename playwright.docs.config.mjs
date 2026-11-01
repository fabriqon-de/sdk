import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/docs', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4174', launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run docs:preview -- --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: false }
});
