import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Facebook,
  FileSpreadsheet,
  Globe2,
  Instagram,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  MessageSquareQuote,
  MoreHorizontal,
  Music2,
  Phone,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Twitter,
  Users,
  X,
  XCircle,
  Youtube,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { RatingStars } from '@/components/RatingStars';
import { ActionMenu } from '@/components/ActionMenu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { InfoCallout } from '@/components/InfoCallout';
import { Modal } from '@/components/Modal';
import { useTasks } from '@/lib/task-context';
import { useSystem } from '@/lib/system-context';
import { api, openExternal } from '@/lib/bridge';
import { useToast } from '@/components/ToastProvider';
import { useBodyLock, useDebouncedValue, useEscape } from '@/lib/hooks';
import {
  cx,
  domainOf,
  formatDate,
  formatDuration,
  formatNumber,
  formatRating,
  formatRelative,
  initials,
  modeMeta,
  pluralize,
  titleCase,
  truncate,
} from '@/lib/format';
import type { Business, Review, Socials, Task, TaskSummary } from '@/lib/types';

type ResultFilter = 'all' | 'email' | 'website' | 'phone' | 'reviews';
type ResultSort = 'rating' | 'reviews' | 'name' | 'newest';

const FILTERS: Array<{ id: ResultFilter; label: string }> = [
  { id: 'all', label: 'All leads' },
  { id: 'email', label: 'Has email' },
  { id: 'website', label: 'Has website' },
  { id: 'phone', label: 'Has phone' },
  { id: 'reviews', label: 'Reviews' },
];

function taskEmails(business: Business) {
  return [...new Set([business.email, ...(business.emails || [])].filter(Boolean) as string[])];
}

function taskSocials(socials?: Socials) {
  return Object.entries(socials || {}).filter((entry): entry is [string, string] => Boolean(entry[1]));
}

function describeTask(task: TaskSummary) {
  if (task.mode === 'links') return pluralize(task.input?.links?.length || 0, 'pasted business', 'pasted businesses');
  if (task.mode === 'country') {
    return `${task.input?.businessType || 'Businesses'} across ${pluralize(task.input?.cities?.length || 0, 'city', 'cities')} in ${task.input?.country || 'a country'}`;
  }
  return task.input?.query || '';
}

function SocialIcon({ network, size = 14 }: { network: string; size?: number }) {
  switch (network) {
    case 'facebook':
      return <Facebook size={size} />;
    case 'instagram':
      return <Instagram size={size} />;
    case 'linkedin':
      return <Linkedin size={size} />;
    case 'twitter':
      return <Twitter size={size} />;
    case 'youtube':
      return <Youtube size={size} />;
    case 'tiktok':
      return <Music2 size={size} />;
    default:
      return <Globe2 size={size} />;
  }
}

export function ResultsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { tasks, rememberTask } = useTasks();
  const { info } = useSystem();
  const { pushToast } = useToast();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [sort, setSort] = useState<ResultSort>('rating');
  const [visibleCount, setVisibleCount] = useState(80);
  const [selected, setSelected] = useState<Business | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wasActive = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(query.trim().toLowerCase(), 200);
  const summary = tasks.find((item) => item.id === id);

  const load = useCallback(
    async (quiet = false) => {
      if (!id) return;
      if (!quiet) setLoading(true);
      try {
        const next = await api.getTask(id);
        setTask(next);
        setLoadError(null);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'This search could not be loaded.');
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    setTask(null);
    setLoadError(null);
    setQuery('');
    setFilter('all');
    setSelected(null);
    setLogOpen(false);
    void load();
  }, [id, load]);

  useEffect(() => {
    if (!summary) return;
    setTask((current) =>
      current
        ? {
            ...current,
            status: summary.status,
            progress: summary.progress,
            counts: summary.counts,
            error: summary.error,
            notices: summary.notices,
            startedAt: summary.startedAt,
            finishedAt: summary.finishedAt,
          }
        : current
    );
  }, [summary]);

  useEffect(() => {
    const unsubscribeResult = api.onTaskResult(({ taskId, result }) => {
      if (taskId !== id) return;
      setTask((current) => {
        if (!current) return current;
        const exists = (current.results || []).some(
          (item) => (item.placeId && item.placeId === result.placeId) || item.mapsUrl === result.mapsUrl
        );
        return exists ? current : { ...current, results: [...(current.results || []), result] };
      });
    });

    const unsubscribeLog = api.onTaskLog(({ taskId, entry }) => {
      if (taskId !== id) return;
      setTask((current) =>
        current ? { ...current, logs: [...(current.logs || []), entry].slice(-300) } : current
      );
    });

    const unsubscribeDone = api.onTaskDone(({ taskId, summary: doneSummary }) => {
      if (taskId !== id) return;
      rememberTask(doneSummary);
      void load(true);
      if (wasActive.current) {
        if (doneSummary.status === 'completed') {
          pushToast({
            kind: 'success',
            title: 'Search complete',
            message: `${formatNumber(doneSummary.counts.results)} leads ready to review.`,
          });
        } else if (doneSummary.status === 'failed') {
          pushToast({
            kind: 'error',
            title: 'Search needs attention',
            message: doneSummary.error?.message || 'The search stopped unexpectedly.',
          });
        } else {
          pushToast({ kind: 'info', title: 'Search cancelled', message: 'Partial results were saved.' });
        }
      }
    });

    const unsubscribeRemoved = api.onTaskRemoved(({ taskId }) => {
      if (taskId === id) navigate('/tasks', { replace: true });
    });

    return () => {
      unsubscribeResult();
      unsubscribeLog();
      unsubscribeDone();
      unsubscribeRemoved();
    };
  }, [id, load, navigate, pushToast, rememberTask]);

  useEffect(() => {
    if (task?.status === 'running' || task?.status === 'queued') {
      wasActive.current = true;
      setLogOpen(true);
    }
  }, [task?.status]);

  useEffect(() => {
    if (logOpen) logEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [task?.logs?.length, logOpen]);

  useEffect(() => {
    setVisibleCount(80);
  }, [filter, debouncedQuery, sort]);

  const results = task?.results || [];
  const isActive = task?.status === 'running' || task?.status === 'queued';

  const counts = useMemo(
    () => ({
      all: results.length,
      email: results.filter((business) => taskEmails(business).length > 0).length,
      website: results.filter((business) => Boolean(business.website)).length,
      phone: results.filter((business) => Boolean(business.phone)).length,
      reviews: results.filter((business) => (business.reviews || []).length > 0).length,
    }),
    [results]
  );

  const filtered = useMemo(() => {
    let list = [...results];
    if (filter === 'email') list = list.filter((business) => taskEmails(business).length > 0);
    if (filter === 'website') list = list.filter((business) => Boolean(business.website));
    if (filter === 'phone') list = list.filter((business) => Boolean(business.phone));
    if (filter === 'reviews') list = list.filter((business) => (business.reviews || []).length > 0);

    if (debouncedQuery) {
      list = list.filter((business) => {
        const haystack = [
          business.name,
          business.category,
          business.address,
          business.phone,
          business.website,
          ...taskEmails(business),
          ...Object.values(business.socials || {}),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(debouncedQuery);
      });
    }

    list.sort((a, b) => {
      if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      if (sort === 'reviews') return (b.reviewCount || 0) - (a.reviewCount || 0);
      if (sort === 'newest') return new Date(b.collectedAt || 0).getTime() - new Date(a.collectedAt || 0).getTime();
      return (b.rating || 0) - (a.rating || 0);
    });
    return list;
  }, [results, filter, debouncedQuery, sort]);

  const visible = filtered.slice(0, visibleCount);
  const percent = Math.round(task?.progress?.percent || 0);

  const exportTask = async (kind: 'leads' | 'reviews') => {
    if (!task) return;
    if (!results.length) {
      pushToast({ kind: 'info', title: 'Nothing to export yet', message: 'Leads will be available as soon as they are found.' });
      return;
    }
    if (kind === 'reviews' && counts.reviews === 0) {
      pushToast({
        kind: 'info',
        title: 'No reviews collected',
        message: 'Run the search again with “Collect reviews” enabled.',
      });
      return;
    }
    try {
      const result = await api.exportTask(task.id, kind);
      if (result.saved) {
        pushToast({
          kind: 'success',
          title: kind === 'leads' ? 'Leads exported' : 'Reviews exported',
          message: result.filename || result.path,
        });
      }
    } catch (error) {
      pushToast({
        kind: 'error',
        title: 'Export failed',
        message: error instanceof Error ? error.message : 'The CSV could not be saved.',
      });
    }
  };

  const rerun = async () => {
    if (!task) return;
    try {
      const copy = await api.rerunTask(task.id);
      rememberTask(copy);
      pushToast({ kind: 'success', title: 'Search queued again', message: copy.title });
      navigate(`/tasks/${copy.id}`);
    } catch (error) {
      pushToast({
        kind: 'error',
        title: 'Could not rerun the search',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const cancelTask = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await api.cancelTask(task.id);
      pushToast({ kind: 'info', title: 'Cancelling search', message: 'Partial results will be saved.' });
      setCancelOpen(false);
    } catch (error) {
      pushToast({
        kind: 'error',
        title: 'Could not cancel',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await api.deleteTask(task.id);
      pushToast({ kind: 'success', title: 'Search deleted' });
      navigate('/tasks');
    } catch (error) {
      pushToast({
        kind: 'error',
        title: 'Could not delete',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await api.copyText(value);
      pushToast({ kind: 'success', title: `${label} copied`, message: truncate(value, 70), duration: 2200 });
    } catch {
      pushToast({ kind: 'error', title: 'Could not copy', message: 'Select the text and copy it manually.' });
    }
  };

  const copyVisibleEmails = async () => {
    const emails = [...new Set(filtered.flatMap((business) => taskEmails(business)))];
    if (!emails.length) {
      pushToast({ kind: 'info', title: 'No emails in this view', message: 'Try the “All leads” filter or enrich a new search.' });
      return;
    }
    await copy(emails.join(', '), `${pluralize(emails.length, 'email')}`);
  };

  if (loading && !task) {
    return (
      <div className="page results-page">
        <PageHeader eyebrow="Results" title="Loading your leads…" backTo="/tasks" backLabel="Task history" />
        <div className="card page-loading">
          <Loader2 size={26} className="spin" />
          <span>Opening the saved search…</span>
        </div>
      </div>
    );
  }

  if (!task || loadError) {
    return (
      <div className="page results-page">
        <PageHeader eyebrow="Results" title="Search not available" backTo="/tasks" backLabel="Task history" />
        <div className="card">
          <EmptyState
            icon={<XCircle size={28} />}
            title="This search could not be opened"
            description={loadError || 'It may have been deleted. Open your task history to see saved searches.'}
            action={
              <Link to="/tasks" className="btn btn-primary">
                <ArrowLeft size={16} /> Back to task history
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const hasReviews = counts.reviews > 0 || task.options?.reviews;
  const createdMeta = [
    modeMeta(task.mode).label,
    ...(task.options?.reviews ? [`Up to ${formatNumber(task.options.maxReviews)} reviews each`] : []),
    ...(task.options?.enrich ? ['Website enrichment'] : []),
    ...(task.input?.cities?.length ? [`${task.input.cities.length} cities`] : []),
  ];

  return (
    <div className="page results-page">
      <PageHeader
        eyebrow="Results"
        backTo="/tasks"
        backLabel="Task history"
        title={
          <span className="results-title-row">
            <span>{task.title}</span>
            <StatusBadge status={task.status} />
          </span>
        }
        description={describeTask(task)}
        actions={
          <>
            {isActive ? (
              <button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(true)}>
                <XCircle size={16} /> Cancel
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void exportTask('leads')}
              disabled={!results.length}
            >
              <Download size={16} /> {isActive ? 'Export so far' : 'Export CSV'}
            </button>
            <ActionMenu
              items={[
                {
                  label: 'Export reviews (CSV)',
                  icon: <FileSpreadsheet size={15} />,
                  onClick: () => void exportTask('reviews'),
                  disabled: counts.reviews === 0,
                },
                {
                  label: 'Copy all visible emails',
                  icon: <Copy size={15} />,
                  onClick: () => void copyVisibleEmails(),
                  disabled: !counts.email,
                },
                {
                  label: 'Run this search again',
                  icon: <RefreshCcw size={15} />,
                  onClick: () => void rerun(),
                  disabled: isActive,
                },
                {
                  label: 'Delete this search',
                  icon: <Trash2 size={15} />,
                  onClick: () => setDeleteOpen(true),
                  disabled: isActive,
                  danger: true,
                },
              ]}
            />
          </>
        }
      >
        <div className="results-meta-row">
          {createdMeta.map((item) => (
            <span className="meta-tag" key={item}>
              {item}
            </span>
          ))}
          <span className="results-meta-divider" />
          <span>
            <CalendarDays size={13} /> {formatDate(task.createdAt, true)}
          </span>
          {task.startedAt ? (
            <span>
              <Clock3 size={13} /> {formatDuration(task.startedAt, task.finishedAt) || 'Running…'}
            </span>
          ) : null}
          <span>
            <ShieldCheck size={13} /> Saved on this computer
          </span>
        </div>
      </PageHeader>

      {task.error ? (
        <InfoCallout
          tone="error"
          title="This search stopped early"
          action={
            <button type="button" className="btn btn-soft btn-sm" onClick={() => void rerun()}>
              <RefreshCcw size={14} /> Run again
            </button>
          }
        >
          {task.error.message}
          {results.length ? ` ${formatNumber(results.length)} partial leads were saved below.` : ''}
        </InfoCallout>
      ) : null}

      {task.notices?.length ? (
        <div className="notice-stack">
          {task.notices.map((notice, index) => (
            <InfoCallout
              key={`${notice.type}-${index}`}
              tone={notice.type === 'error' ? 'error' : notice.type === 'warning' ? 'warning' : 'info'}
              title={notice.type === 'warning' ? 'Good to know' : undefined}
            >
              {notice.message}
              {/review/i.test(notice.message) ? (
                <Link to="/settings" className="inline-link">
                  Connect Google in Settings <ArrowRight size={13} />
                </Link>
              ) : null}
            </InfoCallout>
          ))}
        </div>
      ) : null}

      {isActive ? (
        <section className="card live-card">
          <div className="live-top">
            <div className="live-ring" style={{ background: `conic-gradient(var(--lime) ${percent * 3.6}deg, rgba(255,255,255,0.12) 0deg)` }}>
              <span>{percent}%</span>
            </div>
            <div className="live-copy">
              <span className="eyebrow live-eyebrow">
                <span className="live-dot" /> {task.status === 'queued' ? 'Waiting to start' : 'Live search'}
              </span>
              <h2>{task.progress?.message || (task.status === 'queued' ? 'Waiting for the current search to finish…' : 'Working…')}</h2>
              <p>
                {task.status === 'queued'
                  ? 'Your search is in the queue. It starts automatically.'
                  : task.options?.reviews
                    ? 'Keep the Chrome window open while reviews load. You can minimize it.'
                    : 'Chrome is collecting businesses in the background. Feel free to keep working.'}
              </p>
            </div>
            <div className="live-numbers">
              <div>
                <span>Leads found</span>
                <strong>{formatNumber(task.counts?.results || results.length)}</strong>
              </div>
              <div>
                <span>Emails</span>
                <strong>{formatNumber(task.counts?.withEmail || 0)}</strong>
              </div>
            </div>
          </div>

          <ProgressBar value={percent} animated={task.status === 'running'} />
          <div className="live-foot">
            <span>
              <Loader2 size={13} className="spin" />
              {task.progress?.current && task.progress?.total
                ? `Collecting ${task.progress.current} of ${task.progress.total}`
                : task.status === 'queued'
                  ? 'Queued'
                  : 'Scanning Google Maps'}
            </span>
            <span>
              <ChromeMini /> {task.options?.browserMode === 'hidden' ? 'Hidden Chrome' : 'Chrome is working'}
            </span>
            <button type="button" className="text-button" onClick={() => setCancelOpen(true)}>
              Stop search
            </button>
          </div>

          {results.length ? (
            <div className="live-peek">
              <span className="live-peek-label">Latest finds</span>
              <div className="live-peek-list">
                {results.slice(-4).reverse().map((business) => (
                  <button
                    type="button"
                    key={business.id || business.mapsUrl}
                    className="live-peek-item"
                    onClick={() => setSelected(business)}
                  >
                    <span className="mini-avatar">{initials(business.name || '?')}</span>
                    <span>{truncate(business.name, 34)}</span>
                    {business.rating ? (
                      <small>
                        <Star size={10} fill="currentColor" /> {formatRating(business.rating)}
                      </small>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="stat-grid results-stats">
        <div className="stat-card">
          <span className="stat-icon stat-icon-green">
            <Users size={18} />
          </span>
          <div>
            <span>Leads</span>
            <strong>{formatNumber(task.counts?.results || results.length)}</strong>
          </div>
          <span className="stat-foot">{filtered.length !== results.length ? `${formatNumber(filtered.length)} in view` : 'Collected on Maps'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue">
            <Mail size={18} />
          </span>
          <div>
            <span>With email</span>
            <strong>{formatNumber(task.counts?.withEmail || 0)}</strong>
          </div>
          <span className="stat-foot">Ready for outreach</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-purple">
            <Globe2 size={18} />
          </span>
          <div>
            <span>With website</span>
            <strong>{formatNumber(task.counts?.withWebsite || 0)}</strong>
          </div>
          <span className="stat-foot">Profiles enriched</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-amber">
            <Star size={18} />
          </span>
          <div>
            <span>Average rating</span>
            <strong>{task.counts?.avgRating ? formatRating(task.counts.avgRating) : '—'}</strong>
          </div>
          <span className="stat-foot">
            <RatingStars rating={task.counts?.avgRating || 0} size={11} /> out of 5
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-lime">
            <MessageSquareQuote size={18} />
          </span>
          <div>
            <span>Reviews saved</span>
            <strong>{formatNumber(task.counts?.reviews || 0)}</strong>
          </div>
          <span className="stat-foot">{hasReviews ? 'Full text & replies' : 'Not collected'}</span>
        </div>
      </div>

      <div className="results-card card">
        <div className="results-toolbar">
          <div className="results-toolbar-top">
            <div className="results-title-block">
              <h2>Businesses</h2>
              <span className="count-pill">
                {formatNumber(filtered.length)} {filtered.length === 1 ? 'lead' : 'leads'}
                {filtered.length !== results.length ? ` of ${formatNumber(results.length)}` : ''}
              </span>
            </div>
            <div className="results-toolbar-actions">
              <div className="search-small results-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, email, category…"
                  aria-label="Search results"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear result search">
                    <X size={14} />
                  </button>
                ) : null}
              </div>
              <div className="select-small">
                <select value={sort} onChange={(event) => setSort(event.target.value as ResultSort)} aria-label="Sort results">
                  <option value="rating">Highest rated</option>
                  <option value="reviews">Most reviewed</option>
                  <option value="name">Name A–Z</option>
                  <option value="newest">Recently added</option>
                </select>
                <ChevronDown size={14} />
              </div>
            </div>
          </div>

          <div className="filter-pills">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx('filter-pill', filter === item.id && 'is-active')}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                <span>{counts[item.id]}</span>
              </button>
            ))}
            <span className="filter-spacer" />
            <button
              type="button"
              className="text-button"
              onClick={() => void copyVisibleEmails()}
              disabled={!counts.email}
              title="Copy the emails of every lead matching the current filters"
            >
              <Copy size={13} /> Copy emails
            </button>
          </div>
        </div>

        {!results.length ? (
          <div className="results-empty">
            {isActive ? (
              <div className="scanning-state">
                <div className="scan-art" aria-hidden="true">
                  <span className="scan-ring scan-ring-one" />
                  <span className="scan-ring scan-ring-two" />
                  <span className="scan-ring scan-ring-three" />
                  <span className="scan-pin">
                    <MapPin size={26} />
                  </span>
                  <span className="scan-sweep" />
                </div>
                <h3>Scanning Google Maps…</h3>
                <p>Your first leads will appear here automatically as they are collected. There is no need to refresh.</p>
                <div className="scan-skeleton">
                  <span className="skeleton-block skeleton-title" />
                  <span className="skeleton-block" />
                  <span className="skeleton-block skeleton-short" />
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Search size={28} />}
                title="No businesses were found"
                description="Google Maps did not return results for this search. Try a broader search, remove the city from the query, or paste a direct business link."
                action={
                  <button type="button" className="btn btn-primary" onClick={() => void rerun()}>
                    <RefreshCcw size={16} /> Run again
                  </button>
                }
                secondary={
                  <Link to="/" className="btn btn-ghost">
                    Change the search
                  </Link>
                }
              />
            )}
          </div>
        ) : !filtered.length ? (
          <EmptyState
            icon={<Search size={26} />}
            title="No leads match those filters"
            description="Try a different filter or clear the search box. Every lead is still saved."
            action={
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setFilter('all');
                  setQuery('');
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <>
            <div className="results-table">
              <div className="results-table-head">
                <span>Lead</span>
                <span>Rating</span>
                <span>Contact</span>
                <span className="col-location">Location</span>
                <span>Outreach</span>
                <span aria-hidden="true" />
              </div>
              {visible.map((business, index) => (
                <BusinessRow
                  key={business.id || business.mapsUrl || `${business.name}-${index}`}
                  business={business}
                  index={index}
                  onOpen={() => setSelected(business)}
                />
              ))}
            </div>
            <div className="results-foot">
              <span>
                Showing {formatNumber(visible.length)} of {formatNumber(filtered.length)} leads
              </span>
              {visible.length < filtered.length ? (
                <button type="button" className="btn btn-soft btn-sm" onClick={() => setVisibleCount((current) => current + 80)}>
                  Show 80 more
                  <ChevronDown size={15} />
                </button>
              ) : (
                <span className="results-end">
                  <CheckCircle2 size={14} /> End of the list
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {(task.logs || []).length ? (
        <section className="card log-card">
          <button
            type="button"
            className="log-head"
            onClick={() => setLogOpen((current) => !current)}
            aria-expanded={logOpen}
          >
            <span className="log-title">
              <span className={cx('log-live-dot', isActive && 'is-live')} />
              Activity log
              <span className="count-pill">{(task.logs || []).length}</span>
            </span>
            <span className="log-sub">
              {isActive ? 'Updating live' : 'What happened during this search'}
              <ChevronDown size={15} className={cx('advanced-chevron', logOpen && 'is-open')} />
            </span>
          </button>
          {logOpen ? (
            <div className="log-body">
              {(task.logs || []).map((entry, index) => (
                <div className={cx('log-line', `log-${entry.level}`)} key={`${entry.time}-${index}`}>
                  <span className="log-time">
                    {new Date(entry.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="log-level">{entry.level}</span>
                  <span className="log-message">{entry.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="results-footer-note">
        <ShieldCheck size={14} />
        <span>
          MapScraper collects publicly visible business information for lawful research. Verify details before contacting
          anyone and follow anti-spam laws in your region.
        </span>
        <Link to="/guide" className="text-button">
          Usage guide <ArrowRight size={13} />
        </Link>
      </div>

      {selected ? <BusinessDrawer business={selected} onClose={() => setSelected(null)} info={info} copy={copy} /> : null}

      <ConfirmDialog
        open={cancelOpen}
        title="Stop this search?"
        message="Collection will stop and the leads found so far will be saved. You can run it again later."
        confirmLabel="Stop search"
        cancelLabel="Keep running"
        tone="brand"
        busy={busy}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancelTask}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this search?"
        message={`“${task.title}” and its ${pluralize(results.length, 'lead')} will be removed from this computer. This cannot be undone.`}
        confirmLabel="Delete search"
        busy={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteTask}
      />
    </div>
  );
}

function ChromeMini() {
  return (
    <span className="chrome-mini" aria-hidden="true">
      <span className="chrome-mini-dot" />
    </span>
  );
}

function BusinessRow({
  business,
  index,
  onOpen,
}: {
  business: Business;
  index: number;
  onOpen: () => void;
}) {
  const emails = taskEmails(business);
  const socials = taskSocials(business.socials);
  return (
    <div
      className="result-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="lead-cell">
        <span className={cx('lead-avatar', `avatar-${index % 5}`)}>{initials(business.name || '?')}</span>
        <div className="lead-copy">
          <strong title={business.name}>{truncate(business.name, 58)}</strong>
          <span className="lead-category">
            {business.category || 'Local business'}
            {business.priceLevel ? <span className="price-level">{business.priceLevel}</span> : null}
          </span>
          <span className="lead-address-inline">{business.address || 'Address not listed'}</span>
          <div className="lead-badges-mobile">
            {emails.length ? (
              <span className="mini-badge is-email">
                <Mail size={11} /> Email
              </span>
            ) : null}
            {business.website ? (
              <span className="mini-badge">
                <Globe2 size={11} /> Website
              </span>
            ) : null}
            {business.reviews?.length ? (
              <span className="mini-badge">
                <MessageSquareQuote size={11} /> {business.reviews.length}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rating-cell">
        {business.rating ? (
          <>
            <span className="rating-line">
              <Star size={12} fill="currentColor" /> <strong>{formatRating(business.rating)}</strong>
            </span>
            <RatingStars rating={business.rating} size={11} />
            <span className="rating-reviews">
              {business.reviewCount ? `${formatNumber(business.reviewCount)} reviews` : 'No review count'}
            </span>
          </>
        ) : (
          <span className="muted-cell">No rating</span>
        )}
        {business.reviews?.length ? (
          <span className="review-collected">
            <MessageSquareQuote size={11} /> {business.reviews.length} saved
          </span>
        ) : null}
      </div>

      <div className="contact-cell">
        {business.phone ? (
          <span className="contact-row" title={business.phone}>
            <Phone size={13} /> {truncate(business.phone, 24)}
          </span>
        ) : (
          <span className="contact-row is-empty">
            <Phone size={13} /> No phone
          </span>
        )}
        {business.website ? (
          <span className="contact-row" title={business.website}>
            <Globe2 size={13} /> {truncate(domainOf(business.website), 26)}
          </span>
        ) : (
          <span className="contact-row is-empty">
            <Globe2 size={13} /> No website
          </span>
        )}
        {emails.length ? (
          <span className="contact-row is-email" title={emails.join(', ')}>
            <Mail size={13} /> {truncate(emails[0], 26)}
            {emails.length > 1 ? <small>+{emails.length - 1}</small> : null}
          </span>
        ) : (
          <span className="contact-row is-empty">
            <Mail size={13} /> No email
          </span>
        )}
      </div>

      <div className="location-cell">
        <span>{truncate(business.address || 'Address not listed', 74)}</span>
        {business.plusCode ? <small>{truncate(business.plusCode, 40)}</small> : null}
      </div>

      <div className="outreach-cell">
        {emails.length ? (
          <span className="outreach-pill is-email">
            <Mail size={11} /> Email
          </span>
        ) : null}
        {socials.length ? (
          <div className="social-dots" title={socials.map(([name]) => titleCase(name)).join(', ')}>
            {socials.slice(0, 4).map(([network]) => (
              <span key={network} className="social-dot">
                <SocialIcon network={network} size={12} />
              </span>
            ))}
            {socials.length > 4 ? <span className="social-more">+{socials.length - 4}</span> : null}
          </div>
        ) : business.website ? (
          <span className="outreach-pill is-soft">
            <Globe2 size={11} /> Site
          </span>
        ) : (
          <span className="muted-cell">—</span>
        )}
      </div>

      <div className="row-actions">
        <span className="row-open">
          <ArrowUpRight size={17} />
        </span>
      </div>
    </div>
  );
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <article className="review-item">
      <div className="review-head">
        <span className={cx('review-avatar', review.rating && review.rating >= 4 ? 'is-good' : review.rating && review.rating <= 2 ? 'is-bad' : '')}>
          {initials(review.author || 'A')}
        </span>
        <div className="review-author">
          <strong>{review.author || 'Google user'}</strong>
          <span>{[review.meta, review.date].filter(Boolean).join(' · ') || 'Reviewer'}</span>
        </div>
        <div className="review-rating">
          <RatingStars rating={review.rating} size={12} />
          <small>{review.rating ? `${formatRating(review.rating)} / 5` : ''}</small>
        </div>
      </div>
      {review.text ? <p className="review-text">{review.text}</p> : <p className="review-text is-empty">No written review.</p>}
      {review.ownerResponse ? (
        <div className="owner-response">
          <span className="owner-label">
            <MessageSquareQuote size={13} /> Response from the business
            {review.ownerResponseDate ? <small>{review.ownerResponseDate}</small> : null}
          </span>
          <p>{review.ownerResponse}</p>
        </div>
      ) : null}
    </article>
  );
}

function BusinessDrawer({
  business,
  onClose,
  info,
  copy,
}: {
  business: Business;
  onClose: () => void;
  info: ReturnType<typeof useSystem>['info'];
  copy: (value: string, label: string) => Promise<void>;
}) {
  const [showAllReviews, setShowAllReviews] = useState(false);
  useBodyLock(true);
  useEscape(onClose, true);

  const emails = taskEmails(business);
  const socials = taskSocials(business.socials);
  const reviews = business.reviews || [];
  const shownReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  return createPortal(
    <div
      className="drawer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${business.name} details`}>
        <div className="drawer-topbar">
          <span className="drawer-eyebrow">
            <MapPin size={13} /> Lead details
          </span>
          <div className="drawer-topbar-actions">
            {business.mapsUrl ? (
              <button
                type="button"
                className="icon-button"
                onClick={() => void openExternal(business.mapsUrl)}
                title="Open in Google Maps"
                aria-label="Open in Google Maps"
              >
                <ExternalLink size={17} />
              </button>
            ) : null}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="drawer-scroll">
          <header className="drawer-head">
            <span className="drawer-avatar">{initials(business.name || '?')}</span>
            <div className="drawer-head-copy">
              <h2>{business.name}</h2>
              <span className="drawer-category">
                {business.category || 'Local business'}
                {business.priceLevel ? <span className="price-level">{business.priceLevel}</span> : null}
              </span>
              <div className="drawer-rating">
                {business.rating ? (
                  <>
                    <RatingStars rating={business.rating} size={14} />
                    <strong>{formatRating(business.rating)}</strong>
                    <span>({formatNumber(business.reviewCount)} reviews on Google)</span>
                  </>
                ) : (
                  <span>No rating on Google Maps</span>
                )}
              </div>
              <div className="drawer-quick-actions">
                {business.website ? (
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => void openExternal(business.website)}>
                    <Globe2 size={14} /> Website <ArrowUpRight size={12} />
                  </button>
                ) : null}
                {emails.length ? (
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => void copy(emails.join(', '), 'Email')}>
                    <Copy size={14} /> Copy email
                  </button>
                ) : null}
                {business.phone ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(business.phone, 'Phone')}>
                    <Copy size={14} /> Copy phone
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          {emails.length ? (
            <section className="drawer-section">
              <h3>
                <Mail size={15} /> Email addresses
                <span className="count-pill">{emails.length}</span>
              </h3>
              <div className="email-list">
                {emails.map((email) => (
                  <div className="email-row" key={email}>
                    <Mail size={14} />
                    <span>{email}</span>
                    <button type="button" className="icon-button" onClick={() => void copy(email, 'Email')} title="Copy email">
                      <Copy size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <InfoCallout tone="info" title="No email found">
              {business.website
                ? 'The website was checked but no public email was listed. Try the contact page or social profiles.'
                : 'This business has no website, so there was nowhere to look for an email.'}
            </InfoCallout>
          )}

          <section className="drawer-section">
            <h3>
              <MapPin size={15} /> Business details
            </h3>
            <dl className="detail-list">
              <div>
                <dt>Phone</dt>
                <dd>
                  {business.phone ? (
                    <button type="button" className="copyable-value" onClick={() => void copy(business.phone, 'Phone')}>
                      {business.phone} <Copy size={12} />
                    </button>
                  ) : (
                    <span className="muted-value">Not listed</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>
                  {business.website ? (
                    <button type="button" className="link-value" onClick={() => void openExternal(business.website)}>
                      {truncate(domainOf(business.website), 44)} <ArrowUpRight size={12} />
                    </button>
                  ) : (
                    <span className="muted-value">Not listed</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{business.address || <span className="muted-value">Not listed</span>}</dd>
              </div>
              {business.hours ? (
                <div>
                  <dt>Hours</dt>
                  <dd className="hours-value">{business.hours.split(';').slice(0, 8).join('; ')}</dd>
                </div>
              ) : null}
              {business.plusCode ? (
                <div>
                  <dt>Plus code</dt>
                  <dd>{business.plusCode}</dd>
                </div>
              ) : null}
              {business.latitude && business.longitude ? (
                <div>
                  <dt>Coordinates</dt>
                  <dd>
                    <button
                      type="button"
                      className="copyable-value"
                      onClick={() => void copy(`${business.latitude}, ${business.longitude}`, 'Coordinates')}
                    >
                      {business.latitude.toFixed(5)}, {business.longitude.toFixed(5)} <Copy size={12} />
                    </button>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Found via</dt>
                <dd>{business.sourceQuery || 'Google Maps'}</dd>
              </div>
              <div>
                <dt>Collected</dt>
                <dd>{formatDate(business.collectedAt, true)}</dd>
              </div>
            </dl>
            {business.enrichment?.error ? (
              <p className="enrich-error">
                <AlertTriangle size={13} /> Website check: {business.enrichment.error}
              </p>
            ) : null}
          </section>

          {socials.length ? (
            <section className="drawer-section">
              <h3>
                <Globe2 size={15} /> Social profiles
              </h3>
              <div className="social-links">
                {socials.map(([network, url]) => (
                  <button
                    type="button"
                    className="social-link"
                    key={network}
                    onClick={() => void openExternal(url)}
                    title={url}
                  >
                    <span className={`social-link-icon social-${network}`}>
                      <SocialIcon network={network} size={15} />
                    </span>
                    <span>
                      <strong>{titleCase(network)}</strong>
                      <small>{truncate(url.replace(/^https?:\/\/(www\.)?/, ''), 34)}</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="drawer-section">
            <h3>
              <MessageSquareQuote size={15} /> Reviews
              {reviews.length ? <span className="count-pill">{reviews.length} saved</span> : null}
            </h3>
            {reviews.length ? (
              <>
                {business.reviewsLimited ? (
                  <InfoCallout tone="info" title="Limited public reviews">
                    Google showed only the public preview while signed out. Connect a Google account in Settings and
                    rerun with reviews enabled for more.
                  </InfoCallout>
                ) : null}
                <div className="review-list">
                  {shownReviews.map((review) => (
                    <ReviewItem review={review} key={review.id || `${review.author}-${review.date}`} />
                  ))}
                </div>
                {reviews.length > 3 ? (
                  <button type="button" className="text-button review-more" onClick={() => setShowAllReviews((current) => !current)}>
                    {showAllReviews ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`}
                    <ChevronDown size={14} className={cx('advanced-chevron', showAllReviews && 'is-open')} />
                  </button>
                ) : null}
              </>
            ) : (
              <div className="reviews-empty">
                <MessageSquareQuote size={22} />
                <div>
                  <strong>No reviews saved</strong>
                  <p>
                    {business.reviewCount
                      ? `This business has ${formatNumber(business.reviewCount)} reviews on Google. Rerun the search with “Collect reviews” enabled to save them.`
                      : 'This business has no reviews on Google Maps, or reviews were not collected.'}
                  </p>
                </div>
              </div>
            )}
          </section>

          {business.mapsUrl ? (
            <button type="button" className="drawer-maps-link" onClick={() => void openExternal(business.mapsUrl)}>
              <MapPin size={15} /> Open this business in Google Maps <ArrowUpRight size={14} />
            </button>
          ) : null}

          <p className="drawer-legal">
            <ShieldCheck size={13} /> Public business information. Use it only for lawful purposes and follow privacy and
            anti-spam laws. {info?.packaged ? '' : ''}
          </p>
        </div>
      </aside>
    </div>,
    document.body
  );
}
