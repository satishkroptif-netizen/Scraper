'use strict';

const { chromium } = require('playwright-core');
const { enrichWebsite } = require('./enrich');
const { REVIEW_NOTE } = require('../shared/constants');

class ScrapeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ScrapeError';
    this.code = code;
  }
}

function abortError() {
  return new ScrapeError('CANCELLED', 'Search cancelled.');
}

function decodePlaceName(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/maps\/place\/([^/]+)/);
    if (!match) return '';
    return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
  } catch {
    return '';
  }
}

function isSearchUrl(raw) {
  try {
    return /\/maps\/search\//i.test(new URL(raw).pathname);
  } catch {
    return false;
  }
}

function queryFromMapsUrl(raw) {
  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/\/maps\/search\/([^/@]+)/i);
    if (!match) return '';
    return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
  } catch {
    return '';
  }
}

function placeKey(url, name = '') {
  const value = String(url || '');
  const feature = value.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (feature) return feature[1].toLowerCase();
  const cid = value.match(/[?&]cid=(\d+)/);
  if (cid) return `cid:${cid[1]}`;
  const coords = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (coords) return `${coords[1]},${coords[2]}`;
  return `${value.split('?')[0]}|${name.toLowerCase()}`;
}

function cleanMapsUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}?hl=en`;
  } catch {
    return raw;
  }
}

function parseIds(rawUrl) {
  const value = String(rawUrl || '');
  const feature = value.match(/!1s(0x[0-9a-f]+):0x([0-9a-f]+)/i);
  let placeId = feature ? `${feature[1]}:0x${feature[2]}` : null;
  let cid = null;
  if (feature) {
    try {
      cid = BigInt(`0x${feature[2]}`).toString();
    } catch {
      cid = null;
    }
  }
  const cidParam = value.match(/[?&]cid=(\d+)/);
  if (!cid && cidParam) cid = cidParam[1];
  if (!placeId && value.match(/!1s(0x[0-9a-f]+%3A0x[0-9a-f]+)/i)) {
    placeId = decodeURIComponent(value.match(/!1s(0x[0-9a-f]+%3A0x[0-9a-f]+)/i)[1]);
  }
  const coords = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return {
    placeId,
    cid,
    latitude: coords ? Number(coords[1]) : null,
    longitude: coords ? Number(coords[2]) : null,
  };
}

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWebsite(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) text = 'https://' + text;
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

class MapsScraper {
  constructor({ profileDir, browser, emit, log, appVersion } = {}) {
    this.profileDir = profileDir;
    this.browser = browser;
    this.emit = emit || (() => {});
    this.log = log || (() => {});
    this.appVersion = appVersion;
    this.context = null;
    this.page = null;
    this.aborted = false;
    this.closed = false;
    this.signedIn = false;
    this.notices = new Set();
    this.currentQuery = '';
  }

  async run(task) {
    this.task = task;
    this.options = task.options || {};
    this.headless =
      this.options.browserMode === 'hidden' || (this.options.browserMode === 'auto' && !this.options.reviews);

    this.progress(1, 'Starting Chrome\u2026');
    await this.launch();

    if (this.options.reviews && !this.signedIn) {
      this.notice('review-limit', 'info', REVIEW_NOTE);
    }

    const candidates = await this.discover();
    if (this.aborted) return { status: 'cancelled' };

    if (!candidates.length) {
      this.log('warn', 'No businesses were found. Try a broader search, a different city, or a direct Google Maps link.');
      this.notice(
        'no-results',
        'warning',
        'No businesses were found. Try a broader search term, remove the city, or paste a direct Google Maps link.'
      );
      this.progress(100, 'No results found');
      return { status: 'completed' };
    }

    this.progress(10, `Found ${candidates.length} ${candidates.length === 1 ? 'business' : 'businesses'} to collect`, 0, candidates.length);
    await this.processCandidates(candidates);
    if (this.aborted) return { status: 'cancelled' };
    this.progress(100, 'All done', candidates.length, candidates.length);
    return { status: 'completed' };
  }

  progress(percent, message, current = 0, total = 0) {
    if (this.aborted) return;
    this.emit('progress', {
      phase: percent >= 100 ? 'done' : percent < 10 ? 'searching' : 'collecting',
      percent: Math.round(Math.max(0, Math.min(100, percent))),
      message,
      current,
      total,
      found: this.foundCount || 0,
    });
  }

  notice(key, type, message) {
    if (this.notices.has(key)) return;
    this.notices.add(key);
    this.emit('notice', { type, message });
  }

  async launch() {
    if (!this.browser?.found) {
      throw new ScrapeError('CHROME_NOT_FOUND', 'Google Chrome was not found. Install Chrome or Microsoft Edge, then try again.');
    }
    this.log(
      'info',
      this.headless
        ? 'Starting a hidden Chrome window.'
        : 'Starting Chrome. Keep this window open while the search runs — you can minimize it.'
    );

    const args = [
      '--lang=en-US',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,OptimizationHints,MediaRouter',
      '--window-size=1280,900',
      '--window-position=70,60',
    ];
    if (this.options.reviews && this.headless) {
      this.log('warn', 'Hidden browser mode is on. Google may hide the reviews tab; use the visible browser for reviews.');
      this.notice(
        'hidden-reviews',
        'warning',
        'Reviews are more reliable with the visible Chrome window. Set Browser to “Auto” or “Visible” in Settings.'
      );
    }

    try {
      this.context = await chromium.launchPersistentContext(this.profileDir, {
        executablePath: this.browser.path,
        headless: this.headless,
        viewport: { width: 1280, height: 900 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        args,
      });
    } catch (error) {
      const message = String(error.message || '');
      if (/ProcessSingleton|already in use|user data directory is already in use|browser is already running/i.test(message)) {
        throw new ScrapeError(
          'PROFILE_BUSY',
          'Chrome is already using MapScraper’s profile. Close the Chrome window opened by MapScraper, then try again.'
        );
      }
      throw new ScrapeError('BROWSER_LAUNCH_FAILED', `Chrome could not start. ${message.slice(0, 300)}`);
    }

    this.context.setDefaultTimeout(25000);
    this.context.setDefaultNavigationTimeout(45000);
    this.context.on('close', () => {
      this.closed = true;
    });

    this.page = this.context.pages()[0] || (await this.context.newPage());
    await this.page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      } catch {
        // ignore
      }
    });
    this.page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));

    const cookies = await this.context.cookies('https://www.google.com').catch(() => []);
    const names = new Set(cookies.map((cookie) => cookie.name));
    this.signedIn = ['SAPISID', 'SID', '__Secure-1PSID', '__Secure-3PSID'].some((name) => names.has(name));
    if (this.options.reviews) {
      this.log(
        'info',
        this.signedIn
          ? 'Google account connected. Collecting up to the requested number of reviews.'
          : 'Google account not connected. Google shows about 5 public reviews per business.'
      );
    }
  }

  async close() {
    await this.context?.close().catch(() => {});
    this.context = null;
    this.page = null;
  }

  abort() {
    this.aborted = true;
    this.context?.close().catch(() => {});
  }

  async bodyText() {
    try {
      return await this.page.evaluate(() => document.body?.innerText || '');
    } catch {
      return '';
    }
  }

  async detectBlocked() {
    if (this.closed) {
      throw new ScrapeError('BROWSER_CLOSED', 'The Chrome window was closed. Keep it open while a search runs.');
    }
    const url = this.page.url();
    const text = (await this.bodyText()).toLowerCase();
    if (
      /\/sorry\//i.test(url) ||
      text.includes('unusual traffic') ||
      text.includes('our systems have detected') ||
      text.includes('not a robot') ||
      text.includes('automated queries') ||
      text.includes('access denied')
    ) {
      throw new ScrapeError(
        'GOOGLE_BLOCKED',
        'Google is temporarily limiting automated requests. Wait 10–15 minutes, reduce the number of results, keep the browser visible, and try again. See Help for tips.'
      );
    }
  }

  async handleConsent() {
    const url = this.page.url();
    if (!/consent\.google\./i.test(url)) {
      const text = await this.bodyText();
      if (!/before you continue|we value your privacy|consent\.google/i.test(text)) return;
    }
    const labels = ['Reject all', 'Accept all', 'I agree'];
    for (const frame of this.page.frames()) {
      for (const label of labels) {
        try {
          const button = frame.getByRole('button', { name: label, exact: false }).first();
          if ((await button.count()) > 0) {
            await button.click({ timeout: 3000 });
            this.log('info', 'Closed Google’s cookie prompt.');
            await this.page.waitForTimeout(1200);
            return;
          }
        } catch {
          // try the next frame/label
        }
      }
    }
  }

  async goto(url) {
    if (this.aborted) throw abortError();
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await this.page.waitForTimeout(1200);
        await this.handleConsent();
        if (this.closed) {
          throw new ScrapeError('BROWSER_CLOSED', 'The Chrome window was closed. Keep it open while a search runs.');
        }
        await this.detectBlocked();
        return;
      } catch (error) {
        if (error instanceof ScrapeError) throw error;
        lastError = error;
        if (this.aborted) throw abortError();
        if (/closed|Target page, context or browser/i.test(String(error.message))) {
          throw new ScrapeError('BROWSER_CLOSED', 'The Chrome window was closed. Keep it open while a search runs.');
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    throw new ScrapeError(
      'PAGE_LOAD_FAILED',
      `Google Maps did not load. Check your internet connection and try again. ${String(lastError?.message || '').slice(0, 200)}`
    );
  }

  async discover() {
    const { mode, input } = this.task;
    if (mode === 'search') {
      this.currentQuery = input.query;
      this.progress(3, `Searching Maps for “${input.query}”`);
      const candidates = await this.collectSearchLinks(input.query, this.options.maxResults);
      this.log('info', `Found ${candidates.length} ${candidates.length === 1 ? 'business' : 'businesses'} in the search results.`);
      return candidates;
    }

    if (mode === 'links') {
      this.progress(3, 'Opening pasted links\u2026');
      return this.resolveLinks(input.links || []);
    }

    const cities = input.cities || [];
    const country = input.country || '';
    const perCity = this.options.maxResultsPerCity || 10;
    const candidates = [];
    const seen = new Set();
    let firstError = null;
    let failedCities = 0;

    for (let i = 0; i < cities.length; i += 1) {
      if (this.aborted) break;
      const city = cities[i];
      const query = `${input.businessType} in ${city}, ${country}`;
      this.progress(
        3 + ((i + 1) / cities.length) * 11,
        `Searching ${city} (${i + 1} of ${cities.length})\u2026`,
        candidates.length,
        candidates.length
      );
      try {
        const found = await this.collectSearchLinks(query, perCity);
        for (const candidate of found) {
          const key = placeKey(candidate.url, candidate.name);
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ ...candidate, sourceQuery: query });
        }
        this.log('info', `${city}: ${found.length} ${found.length === 1 ? 'result' : 'results'} found.`);
      } catch (error) {
        if (error instanceof ScrapeError && ['GOOGLE_BLOCKED', 'BROWSER_CLOSED', 'CANCELLED'].includes(error.code)) throw error;
        failedCities += 1;
        firstError = firstError || error;
        this.log('error', `${city}: ${error.message || 'Search failed.'}`);
      }
      await this.page.waitForTimeout(600);
    }

    if (this.aborted) return [];
    if (!candidates.length && firstError) {
      throw new ScrapeError(
        'COUNTRY_SEARCH_FAILED',
        `No cities could be searched. ${String(firstError.message || '').slice(0, 300)}`
      );
    }
    if (failedCities > 0) {
      this.notice(
        'cities-failed',
        'warning',
        `${failedCities} ${failedCities === 1 ? 'city' : 'cities'} could not be searched. Partial results are shown.`
      );
    }
    return candidates;
  }

  async resolveLinks(links) {
    const candidates = [];
    const seen = new Set();
    let index = 0;
    for (const raw of links) {
      if (this.aborted) break;
      index += 1;
      this.progress(3 + (index / links.length) * 4, `Checking link ${index} of ${links.length}\u2026`);
      if (isSearchUrl(raw)) {
        const query = queryFromMapsUrl(raw);
        if (query) {
          const found = await this.collectSearchLinks(query, 20);
          for (const candidate of found) {
            const key = placeKey(candidate.url, candidate.name);
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({ ...candidate, sourceQuery: 'Pasted link' });
          }
          continue;
        }
      }

      const shortLink = /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\//i.test(raw);
      if (shortLink) {
        await this.goto(raw);
        await this.page.waitForTimeout(1800);
        if (this.aborted) break;
        const hasFeed = (await this.page.locator('div[role="feed"]').count().catch(() => 0)) > 0;
        if (hasFeed) {
          const found = await this.collectFromCurrentFeed(20);
          for (const candidate of found) {
            const key = placeKey(candidate.url, candidate.name);
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({ ...candidate, sourceQuery: 'Pasted link' });
          }
        } else {
          candidates.push({ url: this.page.url(), name: '', sourceQuery: 'Pasted link' });
        }
        continue;
      }

      const name = decodePlaceName(raw);
      const key = placeKey(raw, name);
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({ url: raw, name, sourceQuery: 'Pasted link' });
      }
    }
    this.log('info', `Prepared ${candidates.length} pasted ${candidates.length === 1 ? 'business' : 'businesses'}.`);
    return candidates;
  }

  async collectSearchLinks(query, limit) {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    await this.goto(searchUrl);
    await this.page.waitForTimeout(2200);
    await this.detectBlocked();

    const feedCount = await this.page.locator('div[role="feed"]').count().catch(() => 0);
    if (!feedCount) {
      const h1 = await this.page.locator('h1').first().innerText().catch(() => '');
      if (h1) {
        return [
          {
            url: this.page.url(),
            name: cleanText(h1),
            sourceQuery: query,
          },
        ];
      }
      const text = (await this.bodyText()).toLowerCase();
      if (text.includes('no results') || text.includes('couldn’t find') || text.includes("couldn't find")) return [];
      throw new ScrapeError('NO_RESULTS_PANEL', 'Google Maps did not show a results list. Try a different search.');
    }

    return this.collectFromCurrentFeed(limit, query);
  }

  async collectFromCurrentFeed(limit, query = '') {
    if (limit <= 0) return [];
    const feed = this.page.locator('div[role="feed"]').first();
    await feed.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const collected = new Map();
    let stagnant = 0;
    let lastCount = 0;
    const maxRounds = Math.min(30, Math.max(8, Math.ceil(limit / 7) + 6));

    for (let round = 0; round < maxRounds; round += 1) {
      if (this.aborted) break;
      const links = await feed
        .evaluate((feedElement) => {
          const anchors = [...feedElement.querySelectorAll('a[href*="/maps/place/"]')];
          return anchors
            .map((anchor) => ({
              url: anchor.href,
              name: (anchor.getAttribute('aria-label') || anchor.innerText || '').trim(),
            }))
            .filter((item) => item.url && !/\/maps\/place\/?$/i.test(new URL(item.url).pathname));
        })
        .catch(() => []);

      for (const link of links) {
        if (!link.url) continue;
        const key = placeKey(link.url, link.name);
        if (!collected.has(key)) {
          collected.set(key, {
            url: link.url,
            name: cleanText(link.name) || decodePlaceName(link.url),
            sourceQuery: query,
          });
        }
      }

      if (collected.size >= limit) break;
      if (collected.size === lastCount) stagnant += 1;
      else stagnant = 0;
      lastCount = collected.size;
      if (stagnant >= 3) break;

      const endReached = await feed
        .evaluate((element) => {
          element.scrollTop = element.scrollHeight;
          element.dispatchEvent(new Event('scroll', { bubbles: true }));
          const text = element.innerText || '';
          return /reached the end of the list|no more results/i.test(text);
        })
        .catch(() => false);
      if (endReached) break;
      await this.page.waitForTimeout(1200);
    }

    return [...collected.values()].slice(0, limit);
  }

  async processCandidates(candidates) {
    let success = 0;
    let failures = 0;
    let lastError = null;

    for (let i = 0; i < candidates.length; i += 1) {
      if (this.aborted) return;
      const candidate = candidates[i];
      const label = candidate.name || `business ${i + 1}`;
      this.progress(
        10 + (i / candidates.length) * 87,
        `Collecting ${label} (${i + 1} of ${candidates.length})\u2026`,
        i,
        candidates.length
      );

      try {
        const business = await this.extractBusiness(candidate);
        if (!business) {
          failures += 1;
          continue;
        }
        const key = business.placeId || business.mapsUrl || `${business.name}|${business.address}`;
        if (this.seenResults?.has(key)) continue;
        this.seenResults = this.seenResults || new Set();
        this.seenResults.add(key);

        if (this.options.enrich && business.website) {
          this.progress(
            10 + (i / candidates.length) * 87,
            `Finding emails for ${business.name}\u2026`,
            i,
            candidates.length
          );
          try {
            const enrichment = await enrichWebsite(business.website, { log: this.log });
            business.emails = enrichment.emails;
            business.email = enrichment.emails[0] || null;
            business.socials = enrichment.socials;
            business.enrichment = {
              pagesChecked: enrichment.pagesChecked,
              error: enrichment.error || null,
            };
          } catch (error) {
            this.log('debug', `Email lookup failed for ${business.name}: ${String(error.message).slice(0, 160)}`);
            business.emails = [];
            business.email = null;
            business.socials = {};
            business.enrichment = { pagesChecked: 0, error: String(error.message).slice(0, 160) };
          }
        } else {
          business.emails = [];
          business.email = null;
          business.socials = {};
          business.enrichment = null;
        }

        this.foundCount = (this.foundCount || 0) + 1;
        this.emit('result', business);
        success += 1;
        this.log(
          'info',
          `Collected ${business.name}${business.email ? ` · ${business.email}` : ''}${business.reviews?.length ? ` · ${business.reviews.length} reviews` : ''}`
        );
      } catch (error) {
        if (this.aborted) return;
        if (error instanceof ScrapeError && ['GOOGLE_BLOCKED', 'BROWSER_CLOSED', 'CANCELLED'].includes(error.code)) throw error;
        failures += 1;
        lastError = error;
        this.log('warn', `Skipped ${label}: ${String(error.message || 'could not read details').slice(0, 250)}`);
      }

      this.progress(
        10 + ((i + 1) / candidates.length) * 87,
        `Collected ${this.foundCount || 0} of ${candidates.length}\u2026`,
        i + 1,
        candidates.length
      );
      await this.page.waitForTimeout(300);
    }

    if (!success && failures && lastError) {
      throw new ScrapeError(
        'ALL_RESULTS_FAILED',
        `Could not read any business details. ${String(lastError.message || '').slice(0, 300)}`
      );
    }
  }

  async extractBusiness(candidate) {
    await this.goto(candidate.url);
    await this.page.waitForTimeout(1200);

    const h1 = this.page.locator('h1').first();
    await h1.waitFor({ state: 'visible', timeout: 18000 }).catch(() => {});
    if (!(await h1.count().catch(() => 0))) {
      const hasFeed = (await this.page.locator('div[role="feed"]').count().catch(() => 0)) > 0;
      if (hasFeed) {
        throw new ScrapeError('NOT_A_PLACE', 'That link points to a list of places, not one business.');
      }
      throw new ScrapeError('PAGE_LOAD_FAILED', 'The business page did not open. The link may be old or unavailable.');
    }
    await this.page.waitForTimeout(1300);

    const details = await this.page.evaluate(extractBusinessScript);
    const name = cleanText(details.name) || candidate.name || '';
    if (!name) throw new ScrapeError('NO_NAME', 'The business name could not be read.');

    const ids = parseIds(this.page.url());
    const website = normalizeWebsite(details.website);
    const business = {
      id: ids.placeId || ids.cid || this.page.url(),
      name,
      category: cleanText(details.category),
      address: cleanText(details.address),
      phone: cleanText(details.phone),
      website,
      rating: Number.isFinite(details.rating) ? details.rating : null,
      reviewCount: Number.isFinite(details.reviewCount) ? details.reviewCount : null,
      mapsUrl: cleanMapsUrl(this.page.url()),
      placeId: ids.placeId,
      cid: ids.cid,
      latitude: ids.latitude,
      longitude: ids.longitude,
      plusCode: cleanText(details.plusCode),
      hours: cleanText(details.hours),
      priceLevel: cleanText(details.priceLevel),
      sourceQuery: candidate.sourceQuery || this.currentQuery || '',
      collectedAt: new Date().toISOString(),
      reviews: [],
      reviewsTotal: Number.isFinite(details.reviewCount) ? details.reviewCount : null,
      reviewsLimited: false,
    };

    if (this.options.reviews && this.options.maxReviews > 0) {
      try {
        const result = await this.extractReviews(business, this.options.maxReviews);
        business.reviews = result.reviews;
        business.reviewsLimited = result.limited;
        if (Number.isFinite(result.total) && result.total > 0) business.reviewsTotal = result.total;
      } catch (error) {
        if (error instanceof ScrapeError && ['GOOGLE_BLOCKED', 'BROWSER_CLOSED', 'CANCELLED'].includes(error.code)) throw error;
        this.log('warn', `Reviews could not be collected for ${business.name}: ${String(error.message).slice(0, 160)}`);
        business.reviews = [];
        business.reviewsLimited = true;
      }
    }

    return business;
  }

  async findReviewsTab() {
    const tab = this.page.locator('[role="tab"]').filter({ hasText: /reviews/i }).first();
    if (await tab.count().catch(() => 0)) return tab;
    const button = this.page.locator('button[aria-label*="Reviews for"]').first();
    if (await button.count().catch(() => 0)) return button;
    return null;
  }

  async extractReviews(business, maxReviews) {
    const desired = this.signedIn ? maxReviews : Math.min(5, maxReviews);
    const tab = await this.findReviewsTab();
    if (!tab) {
      this.notice(
        'reviews-unavailable',
        'info',
        'Google did not show the reviews tab for this search. Reviews are more reliable in the visible Chrome window.'
      );
      return { reviews: [], total: business.reviewsTotal, limited: true };
    }

    try {
      const selected = await tab.getAttribute('aria-selected').catch(() => null);
      if (selected !== 'true') {
        await tab.click({ timeout: 5000 });
        await this.page.waitForTimeout(2200);
      }
    } catch (error) {
      if (this.closed) throw new ScrapeError('BROWSER_CLOSED', 'The Chrome window was closed.');
      return { reviews: [], total: business.reviewsTotal, limited: true };
    }

    if (this.signedIn && maxReviews > 5) {
      const seeMore = this.page.locator('button', { hasText: /See more reviews/i }).first();
      if (await seeMore.count().catch(() => 0)) {
        await seeMore.click({ timeout: 5000 }).catch(() => {});
        await this.page.waitForTimeout(2600);
        const signInDialog = await this.page
          .locator('div[role="dialog"]')
          .filter({ hasText: /sign in|sign-in/i })
          .count()
          .catch(() => 0);
        if (signInDialog) {
          this.log('warn', 'Google asked for sign-in again. Collecting the reviews that are publicly visible.');
          this.signedIn = false;
        }
      }
    }

    const wanted = this.signedIn ? maxReviews : Math.min(maxReviews, 5, desired || 5);
    let lastCount = 0;
    let stagnant = 0;
    const rounds = Math.min(24, Math.max(4, Math.ceil(wanted / 5) + 4));

    for (let i = 0; i < rounds; i += 1) {
      const count = await this.reviewNodeCount();
      if (count >= wanted) break;
      if (count === lastCount) stagnant += 1;
      else stagnant = 0;
      lastCount = count;
      if (stagnant >= 3) break;
      await this.scrollReviews();
      await this.page.waitForTimeout(1000);
    }

    await this.expandReviewText();
    const reviews = await this.readReviews();
    const cut = reviews.slice(0, Math.max(1, wanted));
    if (!this.signedIn && (business.reviewsTotal || 0) > 5) {
      this.notice('review-limit', 'info', REVIEW_NOTE);
    }
    return { reviews: cut, total: business.reviewsTotal, limited: !this.signedIn && (business.reviewsTotal || 0) > cut.length };
  }

  async reviewNodeCount() {
    return this.page
      .evaluate(() => new Set([...document.querySelectorAll('div.jftiEf[data-review-id]')].map((n) => n.getAttribute('data-review-id'))).size)
      .catch(() => 0);
  }

  async scrollReviews() {
    await this.page
      .evaluate(async () => {
        const node = document.querySelector('div.jftiEf[data-review-id]');
        if (!node) return;
        let element = node;
        while (element && element !== document.body) {
          const style = getComputedStyle(element);
          if (/auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 100) {
            element.scrollTop = Math.min(element.scrollHeight, element.scrollTop + 1500);
            element.dispatchEvent(new Event('scroll', { bubbles: true }));
            break;
          }
          element = element.parentElement;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      })
      .catch(() => {});
  }

  async expandReviewText() {
    for (let round = 0; round < 2; round += 1) {
      const clicked = await this.page
        .evaluate(() => {
          let count = 0;
          for (const node of document.querySelectorAll('div.jftiEf[data-review-id]')) {
            for (const button of node.querySelectorAll('button')) {
              if ((button.innerText || '').trim() === 'More' && button.offsetParent !== null) {
                try {
                  button.click();
                  count += 1;
                } catch {
                  // ignore
                }
              }
            }
          }
          return count;
        })
        .catch(() => 0);
      if (!clicked) break;
      await this.page.waitForTimeout(500);
    }
  }

  async readReviews() {
    return this.page.evaluate(() => {
      const nodes = new Map();
      for (const node of document.querySelectorAll('div.jftiEf[data-review-id]')) {
        const id = node.getAttribute('data-review-id');
        if (id && !nodes.has(id)) nodes.set(id, node);
      }
      const clean = (value) =>
        String(value || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      return [...nodes.entries()].map(([id, node]) => {
        const pick = (selector) => node.querySelector(selector);
        const author = clean(pick('.d4r55')?.innerText || node.getAttribute('aria-label'));
        const ratingLabel = pick('.kvMYJc')?.getAttribute('aria-label') || '';
        const ratingMatch = ratingLabel.match(/(\d+(?:[.,]\d+)?)/);
        const rating = ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null;
        const text = clean(pick('.MyEned .wiI7pd')?.innerText || pick('.MyEned')?.innerText);
        const ownerNode = pick('.CDe7pd');
        let ownerResponse = '';
        let ownerResponseDate = '';
        if (ownerNode) {
          ownerResponseDate = clean(pick('.CDe7pd .DZSIDd')?.innerText);
          const responseText = clean(pick('.CDe7pd .wiI7pd')?.innerText);
          ownerResponse = responseText || clean(ownerNode.innerText)
            .replace(/^Response from the owner\s*/i, '')
            .replace(ownerResponseDate, '')
            .trim();
        }
        const authorButton = pick('.al6Kxe') || node.querySelector('button[data-href*="/maps/contrib/"]');
        const photoButtons = node.querySelectorAll('[data-photo-index]');
        return {
          id,
          author,
          rating,
          date: clean(pick('.rsqaWe')?.innerText),
          text,
          ownerResponse,
          ownerResponseDate,
          authorUrl: authorButton?.getAttribute('data-href') || '',
          photos: photoButtons.length,
          meta: clean(pick('.RfnDt')?.innerText),
        };
      });
    });
  }
}

const extractBusinessScript = () => {
  const clean = (value) =>
    String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const text = (selector) => clean(document.querySelector(selector)?.innerText);
  const attr = (selector, name) => clean(document.querySelector(selector)?.getAttribute(name));

  const name = text('h1') || clean(document.title.replace(/\s*-\s*Google Maps.*$/i, ''));
  let address = attr('button[data-item-id="address"]', 'aria-label').replace(/^Address:\s*/i, '');
  if (!address) address = text('button[data-item-id="address"]');
  let phone = attr('button[data-item-id^="phone:tel:"]', 'aria-label').replace(/^Phone:\s*/i, '');
  if (!phone) phone = text('button[data-item-id^="phone:tel:"]');
  const website = document.querySelector('a[data-item-id="authority"]')?.href || '';

  let rating = null;
  let reviewCount = null;
  const ratingBox = document.querySelector('div.F7nice');
  if (ratingBox) {
    const ratingValue = ratingBox.querySelector('span[aria-hidden="true"]')?.innerText;
    const parsed = Number(String(ratingValue || '').replace(',', '.'));
    if (Number.isFinite(parsed)) rating = parsed;
    const reviewLabel = ratingBox.querySelector('[role="img"][aria-label*="review"]')?.getAttribute('aria-label') || '';
    const reviewMatch = reviewLabel.match(/([\d,.]+)/);
    if (reviewMatch) reviewCount = Number(reviewMatch[1].replace(/[,.]/g, ''));
  }
  if (!rating) {
    const star = document.querySelector('span[role="img"][aria-label*="stars"], div[role="img"][aria-label*="stars"]');
    const match = (star?.getAttribute('aria-label') || '').match(/(\d+(?:[.,]\d+)?)/);
    if (match) rating = Number(match[1].replace(',', '.'));
  }
  if (!reviewCount) {
    const match = document.body.innerText.match(/([\d,]+)\s+reviews/i);
    if (match) reviewCount = Number(match[1].replace(/,/g, ''));
  }

  let category = text('button.DkEaL') || text('button[jsaction*=".category"]') || text('div.DkEaL');
  category = category.replace(/[·•]+$/g, '').trim();
  let priceLevel = text('span.mgr77e');
  if (!priceLevel) {
    const price = document.querySelector('span[aria-label*="Price"], span[aria-label*="price"]');
    if (price) priceLevel = price.getAttribute('aria-label') || '';
  }

  const dayLabels = [];
  for (const button of document.querySelectorAll('button[aria-label*="Copy open hours"]')) {
    const label = clean(button.getAttribute('aria-label'))
      .replace(/,\s*Copy open hours.*$/i, '')
      .trim();
    if (label) dayLabels.push(label);
  }
  let hours = dayLabels.join('; ');
  if (!hours) {
    const rows = [...document.querySelectorAll('table.eK4R0e tr, table tr')].slice(0, 7);
    const parts = [];
    for (const row of rows) {
      const cells = [...row.querySelectorAll('td, th')].map((cell) => clean(cell.innerText)).filter(Boolean);
      if (cells.length >= 2 && /^(mon|tue|wed|thu|fri|sat|sun)/i.test(cells[0])) {
        parts.push(`${cells[0]}: ${cells[1]}`);
      }
    }
    hours = [...new Set(parts)].join('; ');
  }

  let plusCode = text('button[data-item-id="oloc"]') || attr('button[data-item-id="oloc"]', 'aria-label');
  plusCode = plusCode.replace(/^Plus code:\s*/i, '');

  let photos = '';
  const photoButton = [...document.querySelectorAll('button, div')].find((element) =>
    /^[\d,]+\s+photos?$/i.test(clean(element.innerText))
  );
  if (photoButton) photos = clean(photoButton.innerText);

  return {
    name: clean(name),
    category,
    address,
    phone,
    website,
    rating,
    reviewCount,
    plusCode,
    hours,
    priceLevel,
    photos,
  };
};

module.exports = { MapsScraper, ScrapeError, parseIds, placeKey, cleanMapsUrl };
