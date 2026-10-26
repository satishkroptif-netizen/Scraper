const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');
const base = 'https://www.google.com/maps/place/ATX+Family+Dental/@30.2482229,-97.7559705,17z/data=!4m6!3m5!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!16s%2Fg%2F11cn2mvqwc?hl=en';

async function main() {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'headful-scroll'), {
    channel: 'chrome', headless: false, viewport: { width: 1360, height: 950 }, locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled', '--window-position=40,40'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.locator('[role="tab"]', { hasText: /reviews/i }).first().click();
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const review = document.querySelector('div.jftiEf[data-review-id]');
    const chain = [];
    let el = review;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (/auto|scroll/.test(s.overflowY)) {
        chain.push({
          tag: el.tagName, cls: el.className, role: el.getAttribute('role'), id: el.id,
          sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop,
        });
      }
      el = el.parentElement;
    }
    const roleMain = document.querySelector('div[role="main"]');
    return {
      chain,
      main: roleMain ? { cls: roleMain.className, sh: roleMain.scrollHeight, ch: roleMain.clientHeight, st: roleMain.scrollTop } : null,
      count: document.querySelectorAll('div.jftiEf[data-review-id]').length,
      bodyClasses: [...document.querySelectorAll('div[role="main"] > div')].map((d) => ({ cls: d.className, sh: d.scrollHeight, ch: d.clientHeight })).slice(0, 20),
    };
  });
  console.log('INFO', JSON.stringify(info, null, 2));

  // scroll role=main itself
  for (let i = 0; i < 6; i++) {
    const r = await page.evaluate(async () => {
      const main = document.querySelector('div[role="main"]');
      if (main) {
        main.scrollTop = main.scrollHeight;
        main.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
      const rev = document.querySelector('div.jftiEf[data-review-id]');
      let el = rev, scrolled = null;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 200) {
          el.scrollTop = el.scrollHeight;
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
          scrolled = { cls: el.className, st: el.scrollTop, sh: el.scrollHeight };
        }
        el = el.parentElement;
      }
      await new Promise((r) => setTimeout(r, 400));
      return {
        scrolled,
        main: main ? { st: main.scrollTop, sh: main.scrollHeight, ch: main.clientHeight } : null,
        count: new Set([...document.querySelectorAll('div.jftiEf[data-review-id]')].map((n) => n.getAttribute('data-review-id'))).size,
        moreReviews: [...document.querySelectorAll('button')].map((b) => b.innerText).filter((t) => /more review/i.test(t)),
      };
    });
    console.log('scroll', i, JSON.stringify(r));
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: path.join(OUT, 'headful-scroll.png') });
  await context.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
