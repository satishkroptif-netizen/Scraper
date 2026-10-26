const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');
const base = 'https://www.google.com/maps/place/ATX+Family+Dental/@30.2482229,-97.7559705,17z/data=!4m6!3m5!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!16s%2Fg%2F11cn2mvqwc?hl=en';

async function main() {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'headful-reviews'), {
    channel: 'chrome', headless: false, viewport: { width: 1360, height: 950 }, locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled', '--window-position=40,40'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  const tabs = await page.locator('[role="tab"]').allInnerTexts();
  console.log('tabs', tabs);
  if (tabs.some((t) => /reviews/i.test(t))) {
    await page.locator('[role="tab"]', { hasText: /reviews/i }).first().click();
    await page.waitForTimeout(4000);
  }

  // scroll review pane a few times
  for (let i = 0; i < 5; i++) {
    await page.evaluate(async () => {
      const scroller = [...document.querySelectorAll('div')].find((d) => {
        const s = getComputedStyle(d);
        return /auto|scroll/.test(s.overflowY) && d.scrollHeight > d.clientHeight + 300 && d.clientHeight > 400;
      });
      scroller?.scrollBy(0, 1800);
      await new Promise((r) => setTimeout(r, 400));
    });
    await page.waitForTimeout(900);
  }

  // expand "More" buttons
  for (let round = 0; round < 2; round++) {
    const buttons = page.locator('button', { hasText: /^More$/ });
    const n = await buttons.count();
    for (let i = 0; i < Math.min(n, 15); i++) {
      try { await buttons.nth(i).click({ timeout: 800 }); } catch {}
    }
    await page.waitForTimeout(600);
  }

  const data = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div.jftiEf[data-review-id]')];
    const uniq = new Map();
    for (const n of nodes) uniq.set(n.getAttribute('data-review-id'), n);
    const list = [...uniq.values()];
    const sample = list.slice(0, 4).map((n) => {
      const pick = (sel) => n.querySelector(sel)?.innerText?.trim() || null;
      return {
        id: n.getAttribute('data-review-id'),
        name: pick('.d4r55'),
        meta: pick('.RfnDt'),
        date: pick('.rsqaWe'),
        text: pick('.MyEned'),
        textLen: pick('.MyEned')?.length,
        stars: [...n.querySelectorAll('[role="img"][aria-label*="star"]')].map((e) => e.getAttribute('aria-label')),
        starClass: pick('.kvMYJc'),
        ownerResponse: pick('.CDe7pd'),
        html: n.outerHTML.slice(0, 4500),
      };
    });
    return { count: list.length, sample };
  });
  console.log('REVIEWS', JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(OUT, 'headful-reviews.json'), JSON.stringify(data, null, 2));
  await page.screenshot({ path: path.join(OUT, 'headful-reviews.png') });
  await context.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
