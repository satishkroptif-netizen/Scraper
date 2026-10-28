import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Chrome,
  CircleHelp,
  Code2,
  ListChecks,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Logo } from './Logo';
import { ProgressBar } from './ProgressBar';
import { useSystem } from '@/lib/system-context';
import { useTasks } from '@/lib/task-context';
import { cx } from '@/lib/format';

function SidebarLink({
  to,
  icon,
  label,
  end = false,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cx('nav-link', isActive && 'is-active')}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </NavLink>
  );
}

export function AppShell() {
  const { info } = useSystem();
  const { tasks } = useTasks();
  const location = useLocation();

  const activeTask =
    tasks.find((task) => task.status === 'running') || tasks.find((task) => task.status === 'queued');
  const showRunBar = activeTask && location.pathname !== `/tasks/${activeTask.id}`;
  const activeCount = tasks.filter((task) => task.status === 'running' || task.status === 'queued').length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo />
        </div>

        <Link to="/" className="sidebar-cta">
          <span className="sidebar-cta-icon">
            <Plus size={17} />
          </span>
          <span>
            <strong>New search</strong>
            <small>Start finding leads</small>
          </span>
        </Link>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Workspace</span>
          <SidebarLink to="/" end icon={<Sparkles size={17} />} label="New search" />
          <SidebarLink
            to="/tasks"
            icon={<ListChecks size={17} />}
            label="Task history"
            badge={activeCount > 0 ? activeCount : undefined}
          />
          <SidebarLink to="/guide" icon={<BookOpen size={17} />} label="Guide" />

          <span className="nav-section-label nav-section-spaced">Developers</span>
          <SidebarLink to="/api" icon={<Code2 size={17} />} label="Local API" />

          <span className="nav-section-label nav-section-spaced">Preferences</span>
          <SidebarLink to="/settings" icon={<Settings2 size={17} />} label="Settings" />
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-help">
          <span className="sidebar-help-icon">
            <CircleHelp size={18} />
          </span>
          <div>
            <strong>First time here?</strong>
            <p>Learn how to get a clean lead list in three steps.</p>
            <Link to="/guide">Read the quick guide →</Link>
          </div>
        </div>

        <div className="sidebar-footer">
          <Link to="/settings" className={`chrome-pill ${info?.chrome?.found ? 'is-ready' : 'is-missing'}`}>
            <Chrome size={15} />
            <span>
              {info?.chrome?.found
                ? `${info.chrome.name?.replace('Google ', '') || 'Chrome'} ready${info.chrome.version ? ` · ${info.chrome.version.split('.')[0]}` : ''}`
                : 'Chrome not found'}
            </span>
          </Link>
          <div className="sidebar-legal">
            <ShieldCheck size={13} />
            <span>For educational &amp; lawful use only</span>
          </div>
          <span className="sidebar-version">Step in Scraper v{info?.version || '1.0.0'} · local-first</span>
        </div>
      </aside>

      <div className="app-content">
        <div className="mobile-bar">
          <Link to="/" aria-label="Step in Scraper home">
            <Logo compact />
          </Link>
          <div className="mobile-nav">
            <NavLink to="/" end aria-label="New search">
              <Sparkles size={18} />
            </NavLink>
            <NavLink to="/tasks" aria-label="Task history">
              <ListChecks size={18} />
            </NavLink>
            <NavLink to="/guide" aria-label="Guide">
              <BookOpen size={18} />
            </NavLink>
            <NavLink to="/settings" aria-label="Settings">
              <Settings2 size={18} />
            </NavLink>
          </div>
        </div>

        {showRunBar && activeTask ? (
          <div className="run-bar">
            <span className={cx('run-dot', activeTask.status === 'running' && 'is-live')} />
            <div className="run-bar-copy">
              <strong>{activeTask.title}</strong>
              <span>{activeTask.progress?.message || (activeTask.status === 'queued' ? 'Waiting to start…' : 'Working…')}</span>
            </div>
            <div className="run-bar-progress">
              <ProgressBar value={activeTask.progress?.percent || 0} thin animated={activeTask.status === 'running'} />
            </div>
            <span className="run-bar-percent">{Math.round(activeTask.progress?.percent || 0)}%</span>
            <Link to={`/tasks/${activeTask.id}`} className="run-bar-link">
              View progress
            </Link>
          </div>
        ) : null}

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
