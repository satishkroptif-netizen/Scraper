import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  Inbox,
  ListChecks,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Search,
  SearchX,
  Star,
  Trash2,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { ActionMenu } from '@/components/ActionMenu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { RatingStars } from '@/components/RatingStars';
import { useTasks } from '@/lib/task-context';
import { useSystem } from '@/lib/system-context';
import { api } from '@/lib/bridge';
import { useToast } from '@/components/ToastProvider';
import { useDebouncedValue } from '@/lib/hooks';
import {
  cx,
  formatDate,
  formatDuration,
  formatNumber,
  formatRating,
  formatRelative,
  modeMeta,
  pluralize,
  truncate,
} from '@/lib/format';
import type { TaskStatus, TaskSummary } from '@/lib/types';

type StatusFilter = 'all' | 'running' | 'completed' | 'attention';
type SortKey = 'newest' | 'oldest' | 'leads';

const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All searches' },
  { id: 'running', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'attention', label: 'Needs attention' },
];

function describeInput(task: TaskSummary) {
  if (task.mode === 'links') {
    return `${pluralize(task.input?.links?.length || 0, 'pasted link')}`;
  }
  if (task.mode === 'country') {
    return `${task.input?.businessType || 'Businesses'} · ${pluralize(task.input?.cities?.length || 0, 'city', 'cities')} · ${task.input?.country || ''}`;
  }
  return task.input?.query || '';
}

function joinCities(cities?: string[]) {
  if (!cities?.length) return '';
  return cities.length <= 4 ? cities.join(', ') : `${cities.slice(0, 4).join(', ')} +${cities.length - 4} more`;
}

export function TasksPage() {
  const navigate = useNavigate();
  const { tasks, loading, error, refresh } = useTasks();
  const { info } = useSystem();
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [deleteTarget, setDeleteTarget] = useState<TaskSummary | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TaskSummary | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 180);
  const activeCount = tasks.filter((task) => task.status === 'running' || task.status === 'queued').length;

  const stats = useMemo(() => {
    const leads = tasks.reduce((sum, task) => sum + (task.counts?.results || 0), 0);
    const emails = tasks.reduce((sum, task) => sum + (task.counts?.withEmail || 0), 0);
    const reviews = tasks.reduce((sum, task) => sum + (task.counts?.reviews || 0), 0);
    const rated = tasks.filter((task) => task.counts?.results > 0 && task.counts?.avgRating > 0);
    const avg =
      rated.length > 0
        ? rated.reduce((sum, task) => sum + task.counts.avgRating, 0) / rated.length
        : 0;
    return { leads, emails, reviews, avg, total: tasks.length };
  }, [tasks]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      running: tasks.filter((task) => task.status === 'running' || task.status === 'queued').length,
      completed: tasks.filter((task) => task.status === 'completed').length,
      attention: tasks.filter((task) => task.status === 'failed' || task.status === 'cancelled').length,
    }),
    [tasks]
  );

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (statusFilter === 'running') list = list.filter((task) => task.status === 'running' || task.status === 'queued');
    if (statusFilter === 'completed') list = list.filter((task) => task.status === 'completed');
    if (statusFilter === 'attention') list = list.filter((task) => task.status === 'failed' || task.status === 'cancelled');

    if (debouncedSearch) {
      list = list.filter((task) => {
        const haystack = [
          task.title,
          task.input?.query,
          task.input?.businessType,
          task.input?.country,
          ...(task.input?.cities || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(debouncedSearch);
      });
    }

    list.sort((a, b) => {
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === 'leads') return (b.counts?.results || 0) - (a.counts?.results || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [tasks, statusFilter, debouncedSearch, sort]);

  const exportTask = async (task: TaskSummary, kind: 'leads' | 'reviews') => {
    try {
      const result = await api.exportTask(task.id, kind);
      if (result.saved) {
        pushToast({
          kind: 'success',
          title: kind === 'leads' ? 'Leads exported' : 'Reviews exported',
          message: result.filename || result.path,
        });
      }
    } catch (exportError) {
      pushToast({
        kind: 'error',
        title: 'Export failed',
        message: exportError instanceof Error ? exportError.message : 'The CSV could not be saved.',
      });
    }
  };

  const rerun = async (task: TaskSummary) => {
    try {
      const copy = await api.rerunTask(task.id);
      pushToast({ kind: 'success', title: 'Search queued again', message: copy.title });
      navigate(`/tasks/${copy.id}`);
    } catch (rerunError) {
      pushToast({
        kind: 'error',
        title: 'Could not rerun the search',
        message: rerunError instanceof Error ? rerunError.message : 'Please try again.',
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteTask(deleteTarget.id);
      pushToast({ kind: 'success', title: 'Search deleted', message: deleteTarget.title });
      setDeleteTarget(null);
    } catch (deleteError) {
      pushToast({
        kind: 'error',
        title: 'Could not delete',
        message: deleteError instanceof Error ? deleteError.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api.cancelTask(cancelTarget.id);
      pushToast({ kind: 'info', title: 'Cancelling search', message: 'Partial results will be saved.' });
      setCancelTarget(null);
    } catch (cancelError) {
      pushToast({
        kind: 'error',
        title: 'Could not cancel',
        message: cancelError instanceof Error ? cancelError.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmClear = async () => {
    setBusy(true);
    try {
      await api.clearTasks();
      pushToast({ kind: 'success', title: 'History cleared', message: 'All saved searches were removed.' });
      setClearOpen(false);
    } catch (clearError) {
      pushToast({
        kind: 'error',
        title: 'Could not clear history',
        message: clearError instanceof Error ? clearError.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page tasks-page">
      <PageHeader
        eyebrow="Workspace"
        title="Task history"
        description="Every search is saved automatically on this computer. Open one to review leads, export a spreadsheet, or run it again."
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setClearOpen(true)}
              disabled={!tasks.length}
            >
              <Trash2 size={16} /> Clear history
            </button>
            <Link to="/" className="btn btn-primary">
              <Plus size={16} /> New search
            </Link>
          </>
        }
      />

      <div className="stat-grid task-stats">
        <div className="stat-card">
          <span className="stat-icon stat-icon-green">
            <ListChecks size={18} />
          </span>
          <div>
            <span>Searches saved</span>
            <strong>{formatNumber(stats.total)}</strong>
          </div>
          <span className="stat-foot">{activeCount ? `${activeCount} active now` : 'All local to this PC'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-amber">
            <Users size={18} />
          </span>
          <div>
            <span>Leads collected</span>
            <strong>{formatNumber(stats.leads)}</strong>
          </div>
          <span className="stat-foot">{stats.reviews ? `${formatNumber(stats.reviews)} reviews saved` : 'Across every search'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue">
            <Mail size={18} />
          </span>
          <div>
            <span>Emails found</span>
            <strong>{formatNumber(stats.emails)}</strong>
          </div>
          <span className="stat-foot">
            {stats.leads ? `${Math.round((stats.emails / stats.leads) * 100)}% of all leads` : 'From website enrichment'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-lime">
            <Star size={18} />
          </span>
          <div>
            <span>Average rating</span>
            <strong>{stats.avg ? formatRating(stats.avg) : '—'}</strong>
          </div>
          <span className="stat-foot">
            <RatingStars rating={stats.avg} size={12} /> across searches
          </span>
        </div>
      </div>

      <div className="card list-card">
        <div className="list-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.id}
                className={cx('filter-tab', statusFilter === tab.id && 'is-active')}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label}
                <span className="filter-count">{counts[tab.id]}</span>
              </button>
            ))}
          </div>
          <div className="toolbar-right">
            <div className="search-small">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search history…"
                aria-label="Search history"
              />
              {search ? (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search filter">
                  ×
                </button>
              ) : null}
            </div>
            <div className="select-small">
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort searches">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="leads">Most leads</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="list-loading">
            {[0, 1, 2].map((item) => (
              <div className="skeleton-row" key={item}>
                <span className="skeleton-block skeleton-title" />
                <span className="skeleton-block" />
                <span className="skeleton-block" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="list-error">
            <EmptyState
              icon={<XCircle size={26} />}
              title="History could not be loaded"
              description={error}
              action={
                <button className="btn btn-primary" onClick={() => void refresh()}>
                  Try again
                </button>
              }
            />
          </div>
        ) : !tasks.length ? (
          <EmptyState
            icon={<Inbox size={28} />}
            title="Your first lead list is one search away"
            description="Searches, results, and exports are saved automatically. Start with something simple like “dentists in Austin”."
            action={
              <Link to="/" className="btn btn-primary">
                <Search size={16} /> Start a search
              </Link>
            }
            secondary={
              <Link to="/guide" className="btn btn-ghost">
                Read the guide
              </Link>
            }
          />
        ) : !filtered.length ? (
          <EmptyState
            icon={<SearchX size={26} />}
            title="No searches match those filters"
            description="Try a different status, or clear the search box."
            action={
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="task-list">
            <div className="task-list-head">
              <span>Search</span>
              <span>Collected</span>
              <span>Contacts</span>
              <span>Status</span>
              <span>Date</span>
              <span aria-hidden="true" />
            </div>
            {filtered.map((task) => {
              const isActive = task.status === 'running' || task.status === 'queued';
              const hasReviews = (task.counts?.reviews || 0) > 0;
              return (
                <div
                  key={task.id}
                  className={cx('task-row', isActive && 'is-active')}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/tasks/${task.id}`);
                    }
                  }}
                >
                  <div className="task-primary">
                    <span className={cx('task-mode-icon', `mode-${task.mode}`)}>
                      {task.mode === 'links' ? (
                        <ArrowRight size={16} />
                      ) : task.mode === 'country' ? (
                        <Users size={16} />
                      ) : (
                        <Search size={16} />
                      )}
                    </span>
                    <div className="task-title-block">
                      <strong>{task.title}</strong>
                      <span title={describeInput(task)}>{truncate(describeInput(task), 76)}</span>
                      <div className="task-meta-line">
                        <span className={cx('mode-pill', `mode-pill-${task.mode}`)}>{modeMeta(task.mode).short}</span>
                        {task.options?.reviews ? <span className="meta-tag">Reviews</span> : null}
                        {task.options?.enrich ? <span className="meta-tag">Enriched</span> : null}
                        {task.input?.cities?.length ? (
                          <span className="meta-tag" title={task.input.cities.join(', ')}>
                            {joinCities(task.input.cities)}
                          </span>
                        ) : null}
                      </div>
                      {isActive ? (
                        <div className="task-live">
                          <ProgressBar value={task.progress?.percent || 0} thin animated />
                          <span>{task.progress?.message || 'Waiting…'}</span>
                          <strong>{Math.round(task.progress?.percent || 0)}%</strong>
                        </div>
                      ) : null}
                      {task.error ? (
                        <span className="task-error-line" title={task.error.message}>
                          {truncate(task.error.message, 88)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="task-cell task-results-cell">
                    <strong>{formatNumber(task.counts?.results || 0)}</strong>
                    <span>leads</span>
                    {task.counts?.avgRating > 0 ? (
                      <span className="task-rating">
                        <Star size={11} fill="currentColor" /> {formatRating(task.counts.avgRating)}
                      </span>
                    ) : null}
                  </div>

                  <div className="task-cell task-contacts-cell">
                    <span className="contact-line">
                      <Mail size={13} /> {formatNumber(task.counts?.withEmail || 0)} emails
                    </span>
                    <span className="contact-line">
                      <FileSpreadsheet size={13} /> {formatNumber(task.counts?.reviews || 0)} reviews
                    </span>
                  </div>

                  <div className="task-cell task-status-cell">
                    <StatusBadge status={task.status} size="sm" />
                    <span className="task-duration">
                      <Clock3 size={12} />
                      {task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
                        ? formatDuration(task.startedAt, task.finishedAt) || '—'
                        : task.progress?.phase === 'starting'
                          ? 'Starting'
                          : 'In progress'}
                    </span>
                  </div>

                  <div className="task-cell task-date-cell">
                    <span>{formatDate(task.createdAt)}</span>
                    <small>{formatRelative(task.createdAt)}</small>
                  </div>

                  <div className="task-actions" onClick={(event) => event.stopPropagation()}>
                    <Link to={`/tasks/${task.id}`} className="icon-button task-open" aria-label="Open results" title="Open results">
                      <Eye size={17} />
                    </Link>
                    <ActionMenu
                      items={[
                        {
                          label: 'Open results',
                          icon: <Eye size={15} />,
                          onClick: () => navigate(`/tasks/${task.id}`),
                        },
                        {
                          label: 'Export leads (CSV)',
                          icon: <Download size={15} />,
                          onClick: () => void exportTask(task, 'leads'),
                          disabled: !(task.counts?.results > 0),
                        },
                        {
                          label: 'Export reviews (CSV)',
                          icon: <FileSpreadsheet size={15} />,
                          onClick: () => void exportTask(task, 'reviews'),
                          disabled: !hasReviews,
                        },
                        {
                          label: 'Run this search again',
                          icon: <RefreshCcw size={15} />,
                          onClick: () => void rerun(task),
                          disabled: isActive,
                        },
                        {
                          label: isActive ? 'Cancel search' : 'Delete search',
                          icon: isActive ? <XCircle size={15} /> : <Trash2 size={15} />,
                          danger: true,
                          onClick: () => (isActive ? setCancelTarget(task) : setDeleteTarget(task)),
                        },
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="tasks-footnote">
        <span>
          <CalendarDays size={14} /> Saved under {info?.paths?.dataDir || 'your local app data folder'}
        </span>
        <Link to="/guide" className="text-button">
          How history works <ArrowRight size={13} />
        </Link>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this search?"
        message={`“${deleteTarget?.title || ''}” and its ${pluralize(deleteTarget?.counts?.results || 0, 'lead')} will be removed from this computer. This cannot be undone.`}
        confirmLabel="Delete search"
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this search?"
        message="Collection will stop and any leads found so far will be saved. You can run the search again later."
        confirmLabel="Cancel search"
        cancelLabel="Keep running"
        tone="brand"
        busy={busy}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />

      <ConfirmDialog
        open={clearOpen}
        title="Clear all search history?"
        message="Every saved search, lead, and review on this computer will be deleted. Export any lists you want to keep first."
        confirmLabel="Clear everything"
        busy={busy}
        onClose={() => setClearOpen(false)}
        onConfirm={confirmClear}
      />
    </div>
  );
}
