const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const OUT = path.join(process.cwd(), '.probe');
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const context = await chromium.launchPersistentContext(path.join(OUT, 'profile'), {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1360, height: 950 },
    locale: 'en-US',
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled'],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  });
  const page = context.pages()[0] || (await context.newPage());
  console.log('goto search...');
  await page.goto('https://www.google.com/maps/search/dentists%20in%20Austin%2C%20TX?hl=en&gl=us', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(6000);
  console.log('url:', page.url());
  console.log('title:', await page.title());
  await page.screenshot({ path: path.join(OUT, 'search.png'), fullPage: false });

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  console.log('--- BODY ---\n', bodyText);

  const info = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/maps/place/"]')];
    const feed = document.querySelector('div[role="feed"]');
    return {
      placeLinkCount: links.length,
      firstLinks: links.slice(0, 3).map((a) => ({ href: a.href, label: a.getAttribute('aria-label') })),
      feedExists: !!feed,
      feedChildren: feed ? feed.children.length : 0,
      roleMain: !!document.querySelector('div[role="main"]'),
      buttons: [...document.querySelectorAll('button')].slice(0, 15).map((b) => ({
        aria: b.getAttribute('aria-label'),
        text: b.innerText.slice(0, 60),
      })),
    };
  });
  console.log('--- INFO ---\n', JSON.stringify(info, null, 2));

  if (info.firstLinks.length) {
    console.log('goto first place...');
    await page.goto(info.firstLinks[0].href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    console.log('detail url:', page.url());
    await page.screenshot({ path: path.join(OUT, 'detail.png') });
    const detail = await page.evaluate(() => {
      const q = (s) => [...document.querySelectorAll(s)];
      return {
        title: document.title,
        h1: q('h1').map((e) => e.innerText),
        ariaButtons: q('button[aria-label]')
          .slice(0, 40)
          .map((b) => ({ al: b.getAttribute('aria-label'), di: b.getAttribute('data-item-id'), text: b.innerText.slice(0, 80) })),
        links: q('a[href]')
          .filter((a) => /authority|maps\/place|instagram|facebook/.test(a.getAttribute('data-item-id') || '') || /instagram\.com|facebook\.com/.test(a.href))
          .slice(0, 15)
          .map((a) => ({ href: a.href, di: a.getAttribute('data-item-id'), text: a.innerText.slice(0, 60) })),
        ratingEls: q('[role="img"][aria-label]')
          .slice(0, 12)
          .map((e) => e.getAttribute('aria-label')),
        ratingClasses: q('div.F7nice, span.ceNzKf, div.fontBodyLarge').slice(0, 8).map((e) => ({ c: e.className, t: e.innerText.slice(0, 80) })),
        tabs: q('[role="tab"]').map((t) => ({ text: t.innerText.slice(0, 40), al: t.getAttribute('aria-label'), sel: t.getAttribute('aria-selected') })),
        reviewNodes: q('[data-review-id]').length,
        text: document.body.innerText.slice(0, 3000),
      };
    });
    console.log('--- DETAIL ---\n', JSON.stringify(detail, null, 2));

    const reviewsTab = page.locator('[role="tab"]', { hasText: /reviews/i }).first();
    if (await reviewsTab.count()) {
      console.log('clicking reviews tab...');
      await reviewsTab.click();
      await page.waitForTimeout(4500);
      await page.screenshot({ path: path.join(OUT, 'reviews.png') });
      const rev = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('[data-review-id]')];
        return {
          count: nodes.length,
          sample: nodes.slice(0, 3).map((n) => ({
            id: n.getAttribute('data-review-id'),
            aria: n.getAttribute('aria-label'),
            text: n.innerText.slice(0, 500),
            html: n.outerHTML.slice(0, 1800),
          })),
          body: document.body.innerText.slice(0, 2000),
        };
      });
      console.log('--- REVIEWS ---\n', JSON.stringify(rev, null, 2));
    }
  }

  await context.close();
}

main().catch((e) => {
  console.error('PROBE ERROR', e);
  process.exit(1);
});
