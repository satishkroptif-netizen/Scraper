const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = path.join(process.cwd(), '.probe');
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'profile2'), {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1360, height: 950 },
    locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://www.google.com/maps/search/dentists+in+Austin,+TX?hl=en&gl=us', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  for (let i = 0; i < 8; i++) {
    const res = await page.evaluate(async () => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return { err: 'no feed' };
      feed.scrollTop = feed.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 800));
      const links = [...document.querySelectorAll('a[href*="/maps/place/"]')];
      const hrefs = [...new Set(links.map((a) => a.href))];
      return { scrollHeight: feed.scrollHeight, scrollTop: feed.scrollTop, unique: hrefs.length, last: links.at(-1)?.getAttribute('aria-label') };
    });
    console.log('scroll', i, res);
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: path.join(OUT, 'search-scrolled.png') });

  const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/maps/place/"]')].map((a) => a.href))]);
  console.log('total unique', hrefs.length);
  console.log('URLs sample', hrefs.slice(0, 2));

  const target = hrefs.find((h) => /ATX\+Family/.test(h)) || hrefs[0];
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.locator('[role="tab"]', { hasText: /reviews/i }).first().click();
  await page.waitForTimeout(4000);

  for (let i = 0; i < 4; i++) {
    await page.evaluate(async () => {
      const main = document.querySelector('div[role="main"]');
      const scroller = [...document.querySelectorAll('div')].find((d) => {
        const s = getComputedStyle(d);
        return /auto|scroll/.test(s.overflowY) && d.scrollHeight > d.clientHeight + 300 && d.clientHeight > 400;
      });
      (scroller || main)?.scrollBy(0, 1600);
      await new Promise((r) => setTimeout(r, 500));
    });
    await page.waitForTimeout(1200);
  }

  const data = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div.jftiEf[data-review-id]')];
    const uniq = new Map();
    for (const n of nodes) uniq.set(n.getAttribute('data-review-id'), n);
    const list = [...uniq.values()];
    const sample = list.slice(0, 2).map((n) => {
      const pick = (sel) => n.querySelector(sel)?.innerText?.trim() || null;
      return {
        id: n.getAttribute('data-review-id'),
        name: pick('.d4r55'),
        meta: pick('.RfnDt'),
        date: pick('.rsqaWe'),
        text: pick('.MyEned'),
        textHtml: n.querySelector('.MyEned')?.innerHTML?.slice(0, 700),
        stars: [...n.querySelectorAll('[role="img"][aria-label*="star"]')].map((e) => e.getAttribute('aria-label')),
        starClass: pick('.kvMYJc'),
        ownerResponse: pick('.CDe7pd'),
        allClasses: [...n.querySelectorAll('*')].map((e) => e.className).filter((c) => typeof c === 'string' && c.includes(' ')).slice(0, 60),
        html: n.outerHTML.slice(0, 4000),
      };
    });
    return { count: list.length, sample, moreBtn: [...document.querySelectorAll('button')].map((b) => b.innerText).filter((t) => /more/i.test(t)).slice(0, 10) };
  });
  console.log('REVIEWS', JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(OUT, 'reviews.json'), JSON.stringify(data, null, 2));
  await context.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
