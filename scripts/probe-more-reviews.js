const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');
const base = 'https://www.google.com/maps/place/ATX+Family+Dental/@30.2482229,-97.7559705,17z/data=!4m6!3m5!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!16s%2Fg%2F11cn2mvqwc?hl=en';

async function main() {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'headful-more'), {
    channel: 'chrome', headless: false, viewport: { width: 1360, height: 950 }, locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled', '--window-position=40,40'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.locator('[role="tab"]', { hasText: /reviews/i }).first().click();
  await page.waitForTimeout(3000);
  const more = page.locator('button', { hasText: /See more reviews/i }).first();
  console.log('see more count', await more.count());
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(5000);
  }
  console.log('url after', page.url());
  await page.screenshot({ path: path.join(OUT, 'headful-more.png') });

  const info = await page.evaluate(() => {
    const review = document.querySelector('div.jftiEf[data-review-id]');
    const chain = [];
    let el = review;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 100) {
        chain.push({ cls: el.className, role: el.getAttribute('role'), sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop });
      }
      el = el.parentElement;
    }
    return { chain, count: new Set([...document.querySelectorAll('div.jftiEf[data-review-id]')].map((n) => n.getAttribute('data-review-id'))).size };
  });
  console.log('INFO', JSON.stringify(info, null, 2));

  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(async () => {
      const rev = document.querySelector('div.jftiEf[data-review-id]');
      let el = rev, scrolled;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 100) {
          el.scrollTop += 1600;
          scrolled = { cls: el.className, st: el.scrollTop, sh: el.scrollHeight };
        }
        el = el.parentElement;
      }
      await new Promise((r) => setTimeout(r, 300));
      return { scrolled, count: new Set([...document.querySelectorAll('div.jftiEf[data-review-id]')].map((n) => n.getAttribute('data-review-id'))).size };
    });
    console.log('scroll', i, JSON.stringify(r));
    await page.waitForTimeout(1500);
  }

  const data = await page.evaluate(() => {
    const list = [...document.querySelectorAll('div.jftiEf[data-review-id]')];
    return {
      count: list.length,
      sample: list.slice(-2).map((n) => ({
        name: n.querySelector('.d4r55')?.innerText,
        date: n.querySelector('.rsqaWe')?.innerText,
        stars: n.querySelector('.kvMYJc')?.getAttribute('aria-label'),
        text: n.querySelector('.MyEned')?.innerText?.slice(0, 120),
      })),
    };
  });
  console.log('DATA', JSON.stringify(data, null, 2));
  await context.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
