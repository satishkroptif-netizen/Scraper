'use strict';

const DEFAULTS = require('./defaults.json');
const { BROWSER_MODES } = require('./constants');

const LIMITS = {
  maxResults: 100,
  maxResultsPerCity: 50,
  maxReviews: 500,
  maxLinks: 100,
  maxCities: 30,
  maxBusinessesPerTask: 500,
};

function str(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function titleCaseFirst(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const isGoogle = host === 'google.com' || host === 'maps.google.com' || host.endsWith('.google.com');
  const isShort = host === 'maps.app.goo.gl' || host === 'goo.gl' || host === 'g.co';
  if (!isGoogle && !isShort) return null;
  if (isGoogle && !url.pathname.includes('/maps') && !url.searchParams.get('cid')) return null;
  return url.toString();
}

function normalizeLinks(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[\s,]+/);
  const links = [];
  const invalid = [];
  for (const item of raw) {
    const value = String(item || '').trim();
    if (!value) continue;
    const url = normalizeUrl(value);
    if (url) links.push(url);
    else invalid.push(value);
    if (links.length > LIMITS.maxLinks) break;
  }
  return { links: [...new Set(links)], invalid };
}

function normalizeOptions(raw = {}, mode = 'search') {
  const source = raw && typeof raw === 'object' ? raw : {};
  const reviews = Boolean(source.reviews);
  const options = {
    maxResults: clampInt(source.maxResults, DEFAULTS.maxResults, 1, LIMITS.maxResults),
    maxResultsPerCity: clampInt(
      source.maxResultsPerCity,
      DEFAULTS.maxResultsPerCity,
      1,
      LIMITS.maxResultsPerCity
    ),
    reviews,
    maxReviews: reviews ? clampInt(source.maxReviews, DEFAULTS.maxReviews, 1, LIMITS.maxReviews) : 0,
    enrich: source.enrich === undefined ? DEFAULTS.enrich : Boolean(source.enrich),
    browserMode: BROWSER_MODES.includes(source.browserMode) ? source.browserMode : DEFAULTS.browserMode,
  };
  if (mode !== 'country') options.maxResultsPerCity = options.maxResults;
  return options;
}

function validateTaskPayload(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const mode = body.mode;
  if (!['search', 'links', 'country'].includes(mode)) {
    return { ok: false, error: 'Choose a search type: a Google Maps search, pasted links, or cities in a country.' };
  }

  const options = normalizeOptions(body.options, mode);

  if (mode === 'search') {
    const query = str(body.query);
    if (query.length < 3) return { ok: false, error: 'Type what you are looking for, for example “dentists in Austin”.' };
    if (query.length > 300) return { ok: false, error: 'That search is too long. Keep it under 300 characters.' };
    if (/^https?:\/\//i.test(query) || /google\.[a-z.]+\/maps/i.test(query)) {
      return { ok: false, error: 'That looks like a Google Maps link. Use the “Paste a link” tab instead.' };
    }
    return {
      ok: true,
      data: {
        mode,
        title: titleCaseFirst(query).slice(0, 90),
        input: { query },
        options,
      },
    };
  }

  if (mode === 'links') {
    const { links, invalid } = normalizeLinks(body.links ?? body.query ?? '');
    if (!links.length) {
      return {
        ok: false,
        error: invalid.length
          ? 'Those links do not look like Google Maps links. Copy the share link from a business on Google Maps.'
          : 'Paste at least one Google Maps business link.',
      };
    }
    if (links.length > LIMITS.maxLinks) {
      return { ok: false, error: `Paste up to ${LIMITS.maxLinks} links at a time.` };
    }
    if (invalid.length) {
      return { ok: false, error: `This does not look like a Google Maps link: ${invalid[0].slice(0, 80)}` };
    }
    return {
      ok: true,
      data: {
        mode,
        title: `${links.length} pasted link${links.length === 1 ? '' : 's'}`,
        input: { links },
        options: { ...options, maxResults: links.length },
      },
    };
  }

  const businessType = str(body.businessType ?? body.query);
  const country = str(body.country);
  if (businessType.length < 2) {
    return { ok: false, error: 'Type the business type, for example “dentists” or “coffee shops”.' };
  }
  if (businessType.length > 120) return { ok: false, error: 'That business type is too long.' };
  if (country.length < 2) return { ok: false, error: 'Choose a country.' };

  const rawCities = Array.isArray(body.cities) ? body.cities : String(body.cities || '').split(/\r?\n/);
  const seen = new Set();
  const cities = [];
  for (const item of rawCities) {
    const city = str(item);
    if (!city) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push(city.slice(0, 100));
  }
  if (!cities.length) return { ok: false, error: 'Choose at least one city.' };
  if (cities.length > LIMITS.maxCities) {
    return { ok: false, error: `Choose up to ${LIMITS.maxCities} cities in one search.` };
  }
  if (cities.length * options.maxResultsPerCity > LIMITS.maxBusinessesPerTask) {
    return {
      ok: false,
      error: `This search could collect more than ${LIMITS.maxBusinessesPerTask} businesses. Reduce the cities or results per city.`,
    };
  }

  return {
    ok: true,
    data: {
      mode,
      title: `${titleCaseFirst(businessType)} \u00b7 ${cities.length} ${cities.length === 1 ? 'city' : 'cities'} in ${country}`.slice(0, 110),
      input: { businessType, country, cities },
      options,
    },
  };
}

module.exports = {
  LIMITS,
  DEFAULTS,
  normalizeLinks,
  normalizeOptions,
  normalizeUrl,
  validateTaskPayload,
};
