const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'profile3'), {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1360, height: 950 },
    locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://www.google.com/maps/place/ATX+Family+Dental/@30.2482229,-97.7559705,17z/data=!4m6!3m5!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!16s%2Fg%2F11cn2mvqwc?hl=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('url', page.url());
  console.log('title', await page.title());
  console.log('h1', await page.locator('h1').allInnerTexts());
  console.log('tabs', await page.locator('[role="tab"]').allInnerTexts());
  console.log('buttons', (await page.locator('button').allInnerTexts()).slice(0, 30));
  console.log('body', (await page.evaluate(() => document.body.innerText)).slice(0, 700));
  await page.screenshot({ path: path.join(OUT, 'detail2.png') });

  const reviewTab = page.locator('[role="tab"]', { hasText: /reviews/i }).first();
  if (await reviewTab.count()) {
    await reviewTab.click();
  } else {
    await page.locator('button[aria-label*="Reviews for"]').first().click();
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, 'reviews2.png') });

  // click all "More" buttons to expand text
  const more = page.locator('button', { hasText: /^More$/ });
  console.log('more count', await more.count());
  for (let i = 0; i < Math.min(await more.count(), 10); i++) {
    try { await more.nth(i).click({ timeout: 1000 }); } catch {}
  }
  await page.waitForTimeout(800);

  const data = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div.jftiEf[data-review-id]')];
    const uniq = new Map();
    for (const n of nodes) uniq.set(n.getAttribute('data-review-id'), n);
    const list = [...uniq.values()];
    const sample = list.slice(0, 3).map((n) => {
      const pick = (sel) => n.querySelector(sel)?.innerText?.trim() || null;
      return {
        id: n.getAttribute('data-review-id'),
        name: pick('.d4r55'),
        meta: pick('.RfnDt'),
        date: pick('.rsqaWe'),
        text: pick('.MyEned'),
        textLen: pick('.MyEned')?.length,
        textHtml: n.querySelector('.MyEned')?.innerHTML?.slice(0, 1200),
        stars: [...n.querySelectorAll('[role="img"][aria-label*="star"]')].map((e) => e.getAttribute('aria-label')),
        starClass: pick('.kvMYJc'),
        ownerResponse: pick('.CDe7pd'),
        ownerName: pick('.nM6d2c'),
        html: n.outerHTML.slice(0, 5000),
      };
    });
    return { count: list.length, sample };
  });
  console.log('REVIEWS', JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(OUT, 'reviews2.json'), JSON.stringify(data, null, 2));
  await context.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
