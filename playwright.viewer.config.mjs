import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/viewer',
  use: { baseURL:'http://127.0.0.1:4175', launchOptions: { executablePath:process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] } },
  webServer: { command:'python3 -m http.server 4175 --bind 127.0.0.1',url:'http://127.0.0.1:4175/tests/viewer/index.html',reuseExistingServer:false }
});
