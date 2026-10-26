import type { TaskMode, TaskStatus } from './types';

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value));
}

export function formatRating(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(1);
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: withTime ? 'numeric' : undefined,
    hour: withTime ? 'numeric' : undefined,
    minute: withTime ? '2-digit' : undefined,
  });
}

export function formatRelative(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function formatDuration(start: string | null, end: string | null) {
  if (!start) return '';
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return '';
  const seconds = Math.round((to - from) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function pluralize(count: number, singular: string, plural?: string) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural || `${singular}s`}`;
}

export function domainOf(url?: string | null) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

export function truncate(value: string | null | undefined, length: number) {
  const text = String(value || '');
  if (text.length <= length) return text;
  return text.slice(0, Math.max(1, length - 1)).trimEnd() + '…';
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusMeta(status: TaskStatus) {
  switch (status) {
    case 'running':
      return { label: 'Running', tone: 'running' as const };
    case 'queued':
      return { label: 'Queued', tone: 'queued' as const };
    case 'completed':
      return { label: 'Completed', tone: 'success' as const };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' as const };
    case 'failed':
    default:
      return { label: 'Needs attention', tone: 'danger' as const };
  }
}

export function modeMeta(mode: TaskMode) {
  switch (mode) {
    case 'links':
      return { label: 'Pasted links', short: 'Links' };
    case 'country':
      return { label: 'Multi-city', short: 'Cities' };
    default:
      return { label: 'Maps search', short: 'Search' };
  }
}

export function emailHref(email: string) {
  return `mailto:${email}`;
}

export function hoursPreview(hours: string) {
  if (!hours) return 'Hours not listed';
  return truncate(hours.replace(/;/g, ' · '), 72);
}
