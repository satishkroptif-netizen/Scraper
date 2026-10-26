const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');
const url = 'https://www.google.com/maps/place/ATX+Family+Dental/@30.2482229,-97.7559705,17z/data=!4m8!3m7!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!9m1!1b1!16s%2Fg%2F11cn2mvqwc?hl=en';

async function main() {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'headful-dismiss'), {
    channel: 'chrome', headless: false, viewport: { width: 1360, height: 950 }, locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled', '--window-position=40,40'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, 'dismiss-before.png') });
  const dismiss = page.locator('button', { hasText: /^Dismiss$/ }).first();
  if (await dismiss.count()) {
    console.log('dismissing');
    await dismiss.click();
    await page.waitForTimeout(1500);
  } else {
    const signIn = page.locator('div[role="dialog"] button', { hasText: /^Sign in$/ }).first();
    console.log('dialog?', await signIn.count());
  }

  for (let i = 0; i < 8; i++) {
    const r = await page.evaluate(async () => {
      const rev = document.querySelector('div.jftiEf[data-review-id]');
      let el = rev;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 80) {
          el.scrollTop = el.scrollHeight;
        }
        el = el.parentElement;
      }
      await new Promise((r) => setTimeout(r, 400));
      return {
        count: new Set([...document.querySelectorAll('div.jftiEf[data-review-id]')].map((n) => n.getAttribute('data-review-id'))).size,
        dialog: !!document.querySelector('div[role="dialog"]'),
        moreBtn: [...document.querySelectorAll('button')].map((b) => b.innerText).filter((t) => /more review/i.test(t)),
        signInModal: document.body.innerText.includes('Sign-in to get the best'),
      };
    });
    console.log('scroll', i, JSON.stringify(r));
    if (!r.signInModal && i > 2 && r.count <= 5) {
      // try clicking see more again if it appears
      const more = page.locator('button', { hasText: /See more reviews/i }).first();
      if (await more.count()) { await more.click().catch(() => {}); await page.waitForTimeout(2500); }
    }
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: path.join(OUT, 'dismiss-after.png') });
  const count = await page.locator('div.jftiEf[data-review-id]').evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-review-id'))).size);
  console.log('final count', count);
  await context.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
