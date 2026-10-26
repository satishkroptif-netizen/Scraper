const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');
const base = 'https://www.google.com/maps/place/ATX+Family+Dental/@30.2482229,-97.7559705,17z/data=!4m6!3m5!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!16s%2Fg%2F11cn2mvqwc?hl=en';

async function run(label, opts, viaSearch = false) {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'h-' + label), {
    channel: 'chrome',
    viewport: { width: 1360, height: 950 },
    locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled'],
    ...opts,
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  let openUrl = base;
  if (viaSearch) {
    await page.goto('https://www.google.com/maps/search/dentists+in+Austin,+TX?hl=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    openUrl = await page.locator('a[href*="/maps/place/"]').first().getAttribute('href');
  }
  await page.goto(openUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', e.message));
  await page.waitForTimeout(6000);
  const body = await page.evaluate(() => document.body.innerText);
  let tabs = await page.locator('[role="tab"]').allInnerTexts();
  console.log(label, { limited: body.includes('limited view'), tabs, url: page.url(), webdriver: await page.evaluate(() => navigator.webdriver) });
  await page.screenshot({ path: path.join(OUT, `h-${label}.png`) });
  await context.close();
}

async function main() {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === 'headful') await run('headful', { headless: false });
  if (which === 'all' || which === 'headful-search') await run('headful-search', { headless: false }, true);
  if (which === 'all' || which === 'headless-spoof') {
    await run('headless-spoof', { headless: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36' });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
