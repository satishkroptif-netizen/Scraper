'use strict';

const dns = require('dns').promises;
const net = require('net');

const SOCIAL_HOSTS = [
  ['facebook', /(^|\.)facebook\.com$/i],
  ['instagram', /(^|\.)instagram\.com$/i],
  ['linkedin', /(^|\.)linkedin\.com$/i],
  ['twitter', /(^|\.)(twitter\.com|x\.com)$/i],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/i],
  ['tiktok', /(^|\.)tiktok\.com$/i],
];

const BAD_EMAIL_PARTS = [
  'example.com', 'domain.com', 'email.com', 'yourdomain', 'sentry.io', 'wixpress.com',
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'wordpress@', 'u003',
  'your-email', 'youremail', 'test@test', 'name@', 'user@',
];

const CONTACT_WORDS = /(contact|about|about-us|contact-us|kontakt|impressum|contacto|contatti|contato|quienes-somos|quem-somos|over-ons|neem-contact|get-in-touch)/i;

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (net.isIP(host)) {
    if (host === '::1' || host === '0.0.0.0') return true;
    if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (host.startsWith('169.254.') || host.startsWith('fc') || host.startsWith('fd')) return true;
  }
  return false;
}

async function assertPublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error('Website must use http or https.');
  if (isPrivateHost(url.hostname)) throw new Error('Private addresses are not allowed.');
  try {
    const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (records.some((record) => isPrivateHost(record.address))) {
      throw new Error('Private addresses are not allowed.');
    }
  } catch (error) {
    if (String(error.message).includes('Private')) throw error;
    // DNS failures will surface on fetch with a clearer message.
  }
  return url;
}

async function safeFetch(rawUrl, timeoutMs = 9000) {
  let current = await assertPublicUrl(rawUrl);
  for (let hop = 0; hop < 4; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { html: '', finalUrl: current.toString() };
      const next = new URL(location, current);
      await assertPublicUrl(next.toString());
      current = next;
      continue;
    }

    const finalUrl = new URL(response.url || current.toString());
    if (isPrivateHost(finalUrl.hostname)) throw new Error('Website redirected to a private address.');
    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      return { html: '', finalUrl: finalUrl.toString() };
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 4_000_000) return { html: '', finalUrl: finalUrl.toString() };
    const html = (await response.text()).slice(0, 2_000_000);
    return { html, finalUrl: finalUrl.toString() };
  }
  return { html: '', finalUrl: current.toString() };
}

function cleanEmail(value) {
  let email = String(value || '').trim().replace(/^mailto:/i, '').split('?')[0];
  try {
    email = decodeURIComponent(email);
  } catch {
    // keep raw
  }
  email = email.replace(/^["'<]+|[>"',.;:]+$/g, '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return null;
  if (/\.(png|jpe?g|gif|webp|svg|css|js|ico)$/i.test(email)) return null;
  if (BAD_EMAIL_PARTS.some((part) => email.includes(part))) return null;
  if (email.length > 120) return null;
  return email;
}

function extractEmails(html, baseUrl) {
  const found = new Set();
  const mailto = /href=["']mailto:([^"'?#]+)/gi;
  let match;
  while ((match = mailto.exec(html))) {
    const email = cleanEmail(match[1]);
    if (email) found.add(email);
  }
  const generic = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  while ((match = generic.exec(html))) {
    const email = cleanEmail(match[0]);
    if (email) found.add(email);
  }
  const baseHost = (() => {
    try {
      return new URL(baseUrl).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  })();
  return [...found].sort((a, b) => {
    const aSame = baseHost && a.endsWith('@' + baseHost);
    const bSame = baseHost && b.endsWith('@' + baseHost);
    if (aSame && !bSame) return -1;
    if (!aSame && bSame) return 1;
    return a.localeCompare(b);
  });
}

function normalizeSocial(kind, href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathName = url.pathname;
  if (kind === 'facebook' && /facebook\.com$/i.test(host)) {
    if (/^\/(sharer|dialog|plugins|tr|share|login|privacy|policies)/i.test(pathName)) return null;
    return `https://www.facebook.com${pathName.replace(/\/$/, '')}`;
  }
  if (kind === 'instagram' && /instagram\.com$/i.test(host)) {
    if (/^\/(p|reel|explore|accounts|developer|about|legal)\//i.test(pathName)) return null;
    return `https://www.instagram.com${pathName.replace(/\/$/, '')}`;
  }
  if (kind === 'linkedin' && /linkedin\.com$/i.test(host)) {
    if (!/^\/(company|in|school|showcase)\//i.test(pathName)) return null;
    return `https://www.linkedin.com${pathName.replace(/\/$/, '')}`;
  }
  if (kind === 'twitter' && /(twitter\.com|x\.com)$/i.test(host)) {
    if (/^\/(intent|share|home|i\/)/i.test(pathName)) return null;
    return `https://x.com${pathName.replace(/\/$/, '')}`;
  }
  if (kind === 'youtube' && /(youtube\.com|youtu\.be)$/i.test(host)) {
    if (host === 'youtu.be') return `https://youtu.be${pathName}`;
    if (!/^\/(@|channel\/|c\/|user\/)/i.test(pathName)) return null;
    return `https://www.youtube.com${pathName.replace(/\/$/, '')}`;
  }
  if (kind === 'tiktok' && /tiktok\.com$/i.test(host)) {
    if (!/^\/@/i.test(pathName)) return null;
    return `https://www.tiktok.com${pathName.replace(/\/$/, '')}`;
  }
  return null;
}

function extractSocials(html) {
  const socials = {};
  const hrefs = [];
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = anchor.exec(html))) hrefs.push(match[1]);
  const plain = /https?:\/\/[^\s"'<>]+/gi;
  while ((match = plain.exec(html))) hrefs.push(match[0]);
  for (const href of hrefs) {
    for (const [kind, pattern] of SOCIAL_HOSTS) {
      let url;
      try {
        url = new URL(href, 'https://example.invalid');
      } catch {
        continue;
      }
      if (!pattern.test(url.hostname)) continue;
      const normalized = normalizeSocial(kind, url.toString());
      if (normalized && !socials[kind]) socials[kind] = normalized;
    }
  }
  return socials;
}

function findContactPages(html, baseUrl) {
  const base = new URL(baseUrl);
  const pages = new Map();
  const anchor = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]{0,160}?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html))) {
    const href = match[2];
    const label = match[4].replace(/<[^>]*>/g, ' ');
    if (!CONTACT_WORDS.test(href) && !CONTACT_WORDS.test(label)) continue;
    let url;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.origin !== base.origin) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|webp|zip|docx?)$/i.test(url.pathname)) continue;
    const key = url.toString().replace(/#.*$/, '');
    pages.set(key, url.toString());
    if (pages.size >= 4) break;
  }
  return [...pages.values()].slice(0, 2);
}

function socialFromWebsite(website) {
  try {
    const url = new URL(website);
    for (const [kind, pattern] of SOCIAL_HOSTS) {
      if (!pattern.test(url.hostname)) continue;
      const normalized = normalizeSocial(kind, url.toString());
      if (normalized) return { [kind]: normalized };
    }
  } catch {
    // ignore
  }
  return {};
}

async function enrichWebsite(website, { log } = {}) {
  const result = { emails: [], socials: {}, pagesChecked: 0, error: null };
  if (!website) return result;
  const embedded = socialFromWebsite(website);
  Object.assign(result.socials, embedded);

  let home;
  try {
    home = await safeFetch(website);
  } catch (error) {
    result.error = String(error.message || 'Website could not be loaded.').slice(0, 200);
    if (log) log('debug', `Website enrichment failed for ${website}: ${result.error}`);
    return result;
  }
  result.pagesChecked = 1;
  if (!home.html) return result;

  const emailSet = new Set(extractEmails(home.html, home.finalUrl));
  Object.assign(result.socials, extractSocials(home.html));

  // Only pay for extra page loads when the homepage did not reveal an address.
  const contactPages = emailSet.size > 0 ? [] : findContactPages(home.html, home.finalUrl);
  for (const page of contactPages) {
    try {
      const fetched = await safeFetch(page, 7000);
      result.pagesChecked += 1;
      if (fetched.html) {
        for (const email of extractEmails(fetched.html, fetched.finalUrl)) emailSet.add(email);
        const socials = extractSocials(fetched.html);
        for (const [key, value] of Object.entries(socials)) {
          if (!result.socials[key]) result.socials[key] = value;
        }
      }
    } catch (error) {
      if (log) log('debug', `Contact page failed (${page}): ${String(error.message).slice(0, 120)}`);
    }
  }

  result.emails = [...emailSet];
  return result;
}

module.exports = { enrichWebsite, extractEmails, extractSocials, safeFetch };
