'use strict';

const { safeFilePart } = require('./util');

const LEAD_COLUMNS = [
  ['Business Name', (b) => b.name],
  ['Category', (b) => b.category],
  ['Address', (b) => b.address],
  ['Phone', (b) => b.phone],
  ['Website', (b) => b.website],
  ['Email', (b) => b.email],
  ['All Emails', (b) => (Array.isArray(b.emails) ? b.emails.join('; ') : b.email || '')],
  ['Facebook', (b) => b.socials?.facebook],
  ['Instagram', (b) => b.socials?.instagram],
  ['LinkedIn', (b) => b.socials?.linkedin],
  ['X (Twitter)', (b) => b.socials?.twitter],
  ['YouTube', (b) => b.socials?.youtube],
  ['TikTok', (b) => b.socials?.tiktok],
  ['Rating', (b) => b.rating],
  ['Review Count', (b) => b.reviewCount],
  ['Price Level', (b) => b.priceLevel],
  ['Hours', (b) => b.hours],
  ['Google Maps URL', (b) => b.mapsUrl],
  ['Place ID', (b) => b.placeId],
  ['Latitude', (b) => b.latitude],
  ['Longitude', (b) => b.longitude],
  ['Plus Code', (b) => b.plusCode],
  ['Reviews Collected', (b) => (Array.isArray(b.reviews) ? b.reviews.length : 0)],
  ['Source Search', (b) => b.sourceQuery],
  ['Collected At', (b) => b.collectedAt],
];

const REVIEW_COLUMNS = [
  ['Business Name', (b) => b.name],
  ['Category', (b) => b.category],
  ['Address', (b) => b.address],
  ['Phone', (b) => b.phone],
  ['Website', (b) => b.website],
  ['Reviewer', (b, r) => r.author],
  ['Rating', (b, r) => r.rating],
  ['Date', (b, r) => r.date],
  ['Review Text', (b, r) => r.text],
  ['Owner Response', (b, r) => r.ownerResponse],
  ['Owner Response Date', (b, r) => r.ownerResponseDate],
  ['Reviewer Profile', (b, r) => r.authorUrl],
  ['Review ID', (b, r) => r.id],
  ['Google Maps URL', (b) => b.mapsUrl],
];

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function csvCell(value) {
  let text = clean(value);
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function row(values) {
  return values.map(csvCell).join(',');
}

function leadsToCsv(results) {
  const lines = [row(LEAD_COLUMNS.map(([label]) => label))];
  for (const business of results || []) {
    lines.push(row(LEAD_COLUMNS.map(([, get]) => get(business))));
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

function reviewsToCsv(results) {
  const lines = [row(REVIEW_COLUMNS.map(([label]) => label))];
  for (const business of results || []) {
    for (const review of business.reviews || []) {
      lines.push(row(REVIEW_COLUMNS.map(([, get]) => get(business, review))));
    }
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

function exportFileName(task, kind) {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = safeFilePart(task?.title || 'mapscraper-leads');
  return `${base} - ${kind === 'reviews' ? 'reviews' : 'leads'} - ${stamp}.csv`;
}

module.exports = { exportFileName, leadsToCsv, reviewsToCsv };
