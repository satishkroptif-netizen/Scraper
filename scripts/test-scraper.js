const path = require('path');
const { MapsScraper } = require('../scraper/maps-scraper');
const { detectBrowser } = require('../electron/chrome');
const { validateTaskPayload } = require('../shared/validation');

const query = process.argv[2] || 'dentists in Austin, TX';
const max = Number(process.argv[3] || 2);
const reviews = process.argv[4] !== 'noreviews';
const enrich = process.argv[5] !== 'noenrich';
const mode = process.argv[6] || 'search';

async function main() {
  const browser = detectBrowser();
  console.log('browser', browser);
  const payload = mode === 'links'
    ? { mode: 'links', links: [query], options: { maxResults: max, reviews, maxReviews: 10, enrich, browserMode: 'auto' } }
    : { mode: 'search', query, options: { maxResults: max, reviews, maxReviews: 10, enrich, browserMode: 'auto' } };
  const validated = validateTaskPayload(payload);
  if (!validated.ok) throw new Error(validated.error);
  const task = { ...validated.data, id: 'test', options: validated.data.options };

  const scraper = new MapsScraper({
    profileDir: path.join(process.cwd(), '.probe', 'test-profile'),
    browser,
    emit: (type, data) => {
      if (type === 'progress') console.log('PROGRESS', data.percent, data.message);
      else if (type === 'result') {
        console.log('RESULT', JSON.stringify({
          name: data.name,
          category: data.category,
          address: data.address,
          phone: data.phone,
          website: data.website,
          rating: data.rating,
          reviewCount: data.reviewCount,
          email: data.email,
          emails: data.emails,
          socials: data.socials,
          placeId: data.placeId,
          mapsUrl: data.mapsUrl,
          reviews: data.reviews,
          reviewsTotal: data.reviewsTotal,
          reviewsLimited: data.reviewsLimited,
        }, null, 2));
      } else console.log('EVENT', type, data);
    },
    log: (level, message) => console.log('LOG', level, message),
  });

  const result = await scraper.run(task);
  console.log('DONE', result, 'found', scraper.foundCount);
  await scraper.close();
}

main().catch((error) => {
  console.error('FAILED', error);
  process.exitCode = 1;
});
