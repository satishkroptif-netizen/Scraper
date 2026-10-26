const { chromium } = require('playwright-core');
const { detectBrowser } = require('../electron/chrome');
const path = require('path');

const url = process.argv[2];
async function main() {
  const browser = detectBrowser();
  const context = await chromium.launchPersistentContext(path.join(process.cwd(), '.probe', 'reviewcount'), {
    executablePath: browser.path, headless: true, viewport: { width: 1280, height: 900 }, locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  const data = await page.evaluate(() => ({
    f7: document.querySelector('div.F7nice')?.outerHTML,
    f7text: document.querySelector('div.F7nice')?.innerText,
    arias: [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).filter((a) => /review|star/i.test(a)).slice(0, 20),
    h1: document.querySelector('h1')?.innerText,
    body: document.body.innerText.slice(0, 500),
  }));
  console.log(JSON.stringify(data, null, 2));
  await context.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
