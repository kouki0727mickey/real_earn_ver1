const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1220, height: 1240 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'thumbnail.html'));
  await page.screenshot({ path: path.join(__dirname, 'thumbnail.png') });
  await browser.close();
})();
