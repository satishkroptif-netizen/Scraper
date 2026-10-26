const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');

const base = 'https://www.google.com/maps/place/ATX+Family+Dental/@30.2482229,-97.7559705,17z/data=!4m6!3m5!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!16s%2Fg%2F11cn2mvqwc';
const full = 'https://www.google.com/maps/place/ATX+Family+Dental/data=!4m7!3m6!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!16s%2Fg%2F11cn2mvqwc!19sChIJb5gBC-u0RIYRHkntaUcdJGs?authuser=0&hl=en&g_ep=EgoyMDI2MTAyMC4wIJJjKgBIAVAD&rclk=1';

const variants = [
  ['clean+hl', base + '?hl=en'],
  ['clean+rclk', base + '?hl=en&rclk=1'],
  ['full', full],
  ['clean+authuser', base + '?authuser=0&hl=en'],
];

async function main() {
  for (const [label, url] of variants) {
    const context = await chromium.launchPersistentContext(path.join(OUT, 'matrix-' + label), {
      channel: 'chrome', headless: true, viewport: { width: 1360, height: 950 }, locale: 'en-US',
      args: ['--lang=en-US', '--disable-blink-features=AutomationControlled'],
    });
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(6000);
    let tabs = await page.locator('[role="tab"]').allInnerTexts();
    let limited = (await page.locator('body').innerText()).includes('limited view');
    if (!tabs.some((t) => /review/i.test(t))) {
      const seeMore = page.locator('button', { hasText: /^See more$/ }).first();
      if (await seeMore.count()) {
        console.log(label, 'clicking See more');
        await seeMore.click().catch(() => {});
        await page.waitForTimeout(4000);
        tabs = await page.locator('[role="tab"]').allInnerTexts();
        limited = (await page.locator('body').innerText()).includes('limited view');
      }
    }
    let reviews = 0;
    if (tabs.some((t) => /review/i.test(t))) {
      await page.locator('[role="tab"]', { hasText: /reviews/i }).first().click().catch(() => {});
      await page.waitForTimeout(4000);
      reviews = await page.locator('div.jftiEf[data-review-id]').count();
    }
    console.log(JSON.stringify({ label, tabs, limited, reviews, url: page.url() }));
    await page.screenshot({ path: path.join(OUT, `matrix-${label.replace(/\W/g, '')}.png`) });
    await context.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
