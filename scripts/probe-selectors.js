const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');
const url = 'https://www.google.com/maps/place/ATX+Family+Dental/@30.2482229,-97.7559705,17z/data=!4m6!3m5!1s0x8644b4eb0b01986f:0x6b241d4769ed491e!8m2!3d30.2482229!4d-97.7559705!16s%2Fg%2F11cn2mvqwc?hl=en';

async function main() {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'selectors'), {
    channel: 'chrome', headless: false, viewport: { width: 1360, height: 950 }, locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled', '--window-position=40,40'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  const data = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const info = [];
    let root = h1?.parentElement;
    for (let i = 0; i < 4 && root; i += 1) {
      info.push({ i, html: root.outerHTML.slice(0, 2500), text: root.innerText.slice(0, 300) });
      root = root.parentElement;
    }
    const candidates = [...document.querySelectorAll('button, div, span')].filter((el) => {
      const t = (el.innerText || '').trim();
      return t && t.length < 40 && /^(Dentist|Dental clinic|Doctor|Restaurant|Cafe|Coffee shop|$$|$$$|$$$$|·)$/.test(t) && el.children.length <= 2;
    }).slice(0, 20).map((el) => ({
      tag: el.tagName, cls: el.className, text: el.innerText.slice(0, 50), jsaction: el.getAttribute('jsaction'), al: el.getAttribute('aria-label'),
    }));
    const buttons = [...document.querySelectorAll('button[aria-label]')].filter((b) => /hour|price|category|Dentist|website/i.test(b.getAttribute('aria-label')))
      .slice(0, 20).map((b) => ({ al: b.getAttribute('aria-label'), di: b.getAttribute('data-item-id'), cls: b.className }));
    const tables = [...document.querySelectorAll('table')].map((t) => ({ text: t.innerText.slice(0, 600), cls: t.className, html: t.outerHTML.slice(0, 900) }));
    const f7 = document.querySelector('div.F7nice');
    return { info, candidates, buttons, tables, f7: f7?.outerHTML, body: document.body.innerText.slice(0, 1000) };
  });
  console.log(JSON.stringify(data, null, 2).slice(0, 18000));
  await page.screenshot({ path: path.join(OUT, 'selectors.png') });
  await context.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
