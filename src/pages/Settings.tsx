import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Chrome,
  Copy,
  Database,
  Eye,
  EyeOff,
  FolderOpen,
  Globe2,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageSquareQuote,
  MonitorPlay,
  RefreshCcw,
  RotateCcw,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  Wand2,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Toggle } from '@/components/Toggle';
import { InfoCallout } from '@/components/InfoCallout';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CopyButton } from '@/components/CopyButton';
import { useSystem } from '@/lib/system-context';
import { useTasks } from '@/lib/task-context';
import { api, openExternal } from '@/lib/bridge';
import { useToast } from '@/components/ToastProvider';
import { cx, formatNumber } from '@/lib/format';
import type { BrowserMode, Settings } from '@/lib/types';

interface SettingsForm {
  maxResults: number;
  maxResultsPerCity: number;
  reviews: boolean;
  maxReviews: number;
  enrich: boolean;
  browserMode: BrowserMode;
  apiPort: number;
  apiToken: string;
}

function formFrom(settings: Settings): SettingsForm {
  return {
    maxResults: settings.maxResults,
    maxResultsPerCity: settings.maxResultsPerCity,
    reviews: settings.reviews,
    maxReviews: settings.maxReviews,
    enrich: settings.enrich,
    browserMode: settings.browserMode,
    apiPort: settings.apiPort,
    apiToken: settings.apiToken,
  };
}

const BROWSER_MODES: Array<{ id: BrowserMode; label: string; description: string; icon: typeof Chrome }> = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Hide Chrome for normal searches, show it for reviews.',
    icon: Wand2,
  },
  {
    id: 'visible',
    label: 'Visible',
    description: 'Always show the Chrome window while working.',
    icon: MonitorPlay,
  },
  {
    id: 'hidden',
    label: 'Hidden',
    description: 'Run quietly. Reviews can be less reliable.',
    icon: Chrome,
  },
];

export function SettingsPage() {
  const { info, settings, refresh, updateSettings } = useSystem();
  const { tasks, refresh: refreshTasks } = useTasks();
  const { pushToast } = useToast();

  const [form, setForm] = useState<SettingsForm>(() => formFrom(settings));
  const [saving, setSaving] = useState(false);
  const [signInState, setSignInState] = useState<'idle' | 'checking' | 'signed-in' | 'signed-out' | 'error'>('idle');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    setForm(formFrom(settings));
  }, [settings]);

  const dirty = useMemo(() => {
    const base = formFrom(settings);
    return (Object.keys(base) as Array<keyof SettingsForm>).some((key) => base[key] !== form[key]);
  }, [form, settings]);

  const activeTasks = tasks.filter((task) => task.status === 'running' || task.status === 'queued').length;

  const setValue = <K extends keyof SettingsForm,>(key: K, value: SettingsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (saving) return;
    if (!Number.isFinite(form.apiPort) || form.apiPort < 1024 || form.apiPort > 65535) {
      pushToast({ kind: 'error', title: 'Choose a valid port', message: 'Use a number between 1024 and 65535.' });
      return;
    }
    const portChanged = form.apiPort !== settings.apiPort;
    setSaving(true);
    try {
      await updateSettings({
        maxResults: Math.max(1, Math.min(100, form.maxResults)),
        maxResultsPerCity: Math.max(1, Math.min(50, form.maxResultsPerCity)),
        reviews: form.reviews,
        maxReviews: Math.max(1, Math.min(500, form.maxReviews)),
        enrich: form.enrich,
        browserMode: form.browserMode,
        apiPort: form.apiPort,
        apiToken: form.apiToken.trim(),
      });
      pushToast({
        kind: 'success',
        title: 'Settings saved',
        message: portChanged ? 'The local API restarted on the new port.' : 'New searches will use these defaults.',
      });
    } catch (error) {
      pushToast({
        kind: 'error',
        title: 'Could not save settings',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(formFrom(settings));
    pushToast({ kind: 'info', title: 'Changes discarded' });
  };

  const generateToken = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    setValue('apiToken', token);
    setShowToken(true);
    pushToast({ kind: 'info', title: 'Token generated', message: 'Save changes to activate it.' });
  };

  const openSignIn = async () => {
    try {
      await api.openSignIn();
      setSignInState('idle');
      setSignInError(null);
      pushToast({
        kind: 'info',
        title: 'Chrome sign-in opened',
        message: 'Sign in to Google, then come back and choose “Check connection”.',
      });
    } catch (error) {
      pushToast({
        kind: 'error',
        title: 'Could not open sign-in',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const checkSignIn = async () => {
    setSignInState('checking');
    setSignInError(null);
    try {
      const result = await api.checkSignIn();
      if (result.signedIn) {
        setSignInState('signed-in');
        pushToast({ kind: 'success', title: 'Google is connected', message: 'Review collection can now use your account.' });
      } else {
        setSignInState('signed-out');
        setSignInError(result.error || null);
      }
    } catch (error) {
      setSignInState('error');
      setSignInError(error instanceof Error ? error.message : 'The connection could not be checked.');
    }
  };

  const clearHistory = async () => {
    setClearing(true);
    try {
      await api.clearTasks();
      await refreshTasks();
      setClearOpen(false);
      pushToast({ kind: 'success', title: 'History cleared', message: 'All saved searches and leads were removed.' });
    } catch (error) {
      pushToast({
        kind: 'error',
        title: 'Could not clear history',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setClearing(false);
    }
  };

  const openFolder = async (kind: 'data' | 'profile') => {
    try {
      if (kind === 'data') await api.openDataFolder();
      else await api.openProfileFolder();
    } catch (error) {
      pushToast({
        kind: 'error',
        title: 'Could not open the folder',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const replayTour = () => {
    try {
      localStorage.removeItem('mapscraper.onboarded.v1');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Set the defaults for new searches, connect Google for reviews, and manage this computer’s local API and data."
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={!dirty || saving}>
              <RotateCcw size={15} /> Discard
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
          </>
        }
      />

      {dirty ? (
        <div className="unsaved-bar">
          <span>
            <Sparkles size={15} /> You have unsaved changes.
          </span>
          <div>
            <button type="button" className="text-button" onClick={reset}>
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
              Save now
            </button>
          </div>
        </div>
      ) : null}

      <div className="settings-layout">
        <div className="settings-main">
          <section className="card settings-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <Chrome size={19} />
              </span>
              <div>
                <h2>Browser &amp; Google</h2>
                <p>Step in Scraper drives the Chrome on your computer using its own private profile.</p>
              </div>
              <span className={cx('settings-status', info?.chrome?.found ? 'is-ready' : 'is-missing')}>
                {info?.chrome?.found ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                {info?.chrome?.found ? 'Ready' : 'Not found'}
              </span>
            </div>

            <div className="settings-chrome-row">
              <div className="settings-chrome-mark">
                <Chrome size={26} />
              </div>
              <div className="settings-chrome-copy">
                <strong>{info?.chrome?.name || 'Google Chrome'}</strong>
                <span>
                  {info?.chrome?.version ? `Version ${info.chrome.version}` : 'Version could not be detected'}
                  {info?.chrome?.channel === 'msedge' ? ' · Edge fallback' : ''}
                </span>
                {info?.chrome?.path ? <code>{info.chrome.path}</code> : null}
              </div>
              {!info?.chrome?.found ? (
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => void openExternal('https://www.google.com/chrome/')}
                >
                  Download Chrome <ArrowRight size={14} />
                </button>
              ) : null}
            </div>

            <div className="settings-divider" />

            <div className="settings-google">
              <div className="settings-google-copy">
                <span className="settings-google-icon">
                  <UserRound size={19} />
                </span>
                <div>
                  <strong>Google account for reviews</strong>
                  <p>
                    Optional. Signed-out Google shows about 5 public reviews per business. Connecting an account lets
                    Step in Scraper collect more, and the login stays inside its private Chrome profile.
                  </p>
                </div>
              </div>
              <div className="settings-google-actions">
                <button type="button" className="btn btn-soft btn-sm" onClick={() => void openSignIn()}>
                  <Globe2 size={14} /> Open sign-in
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void checkSignIn()}
                  disabled={signInState === 'checking'}
                >
                  {signInState === 'checking' ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
                  Check connection
                </button>
              </div>
            </div>

            {signInState === 'signed-in' ? (
              <div className="settings-signin-result is-good">
                <CheckCircle2 size={16} />
                <span>Google is connected. Sign out from the Chrome window if you want to disconnect.</span>
              </div>
            ) : null}
            {signInState === 'signed-out' ? (
              <div className="settings-signin-result">
                <Info size={16} />
                <span>{signInError || 'No signed-in Google account was found in Step in Scraper’s Chrome profile yet.'}</span>
              </div>
            ) : null}
            {signInState === 'error' ? (
              <div className="settings-signin-result is-bad">
                <AlertTriangle size={16} />
                <span>{signInError || 'The connection could not be checked.'}</span>
              </div>
            ) : null}

            {activeTasks > 0 ? (
              <div className="settings-inline-note">
                <Info size={14} /> Google sign-in checks are unavailable while a search is running.
              </div>
            ) : null}
          </section>

          <section className="card settings-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <Settings2 size={19} />
              </span>
              <div>
                <h2>Search defaults</h2>
                <p>These values pre-fill every new search. You can still change them on the search page.</p>
              </div>
            </div>

            <div className="settings-field-grid">
              <div className="settings-field">
                <label htmlFor="maxResults">
                  <span>Leads per search</span>
                  <small>1–100 for a normal Maps search</small>
                </label>
                <div className="number-control">
                  <button
                    type="button"
                    onClick={() => setValue('maxResults', Math.max(1, form.maxResults - 5))}
                    aria-label="Decrease default leads"
                  >
                    −
                  </button>
                  <input
                    id="maxResults"
                    type="number"
                    min={1}
                    max={100}
                    value={form.maxResults}
                    onChange={(event) => setValue('maxResults', Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                  />
                  <button
                    type="button"
                    onClick={() => setValue('maxResults', Math.min(100, form.maxResults + 5))}
                    aria-label="Increase default leads"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="settings-field">
                <label htmlFor="maxResultsPerCity">
                  <span>Leads per city</span>
                  <small>1–50 per city in a multi-city search</small>
                </label>
                <div className="number-control">
                  <button
                    type="button"
                    onClick={() => setValue('maxResultsPerCity', Math.max(1, form.maxResultsPerCity - 1))}
                    aria-label="Decrease leads per city"
                  >
                    −
                  </button>
                  <input
                    id="maxResultsPerCity"
                    type="number"
                    min={1}
                    max={50}
                    value={form.maxResultsPerCity}
                    onChange={(event) =>
                      setValue('maxResultsPerCity', Math.max(1, Math.min(50, Number(event.target.value) || 1)))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setValue('maxResultsPerCity', Math.min(50, form.maxResultsPerCity + 1))}
                    aria-label="Increase leads per city"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-toggle-stack">
              <Toggle
                checked={form.reviews}
                onChange={(next) => setValue('reviews', next)}
                label="Collect reviews by default"
                description="Adds review text, ratings, authors, and owner replies to each lead. Makes searches slower."
                icon={<Star size={16} />}
              />
              {form.reviews ? (
                <div className="settings-subfield">
                  <label htmlFor="maxReviews">Reviews per business</label>
                  <div className="number-control compact">
                    <input
                      id="maxReviews"
                      type="number"
                      min={1}
                      max={500}
                      value={form.maxReviews}
                      onChange={(event) =>
                        setValue('maxReviews', Math.max(1, Math.min(500, Number(event.target.value) || 1)))
                      }
                    />
                    <span>of the most recent public reviews</span>
                  </div>
                </div>
              ) : null}

              <Toggle
                checked={form.enrich}
                onChange={(next) => setValue('enrich', next)}
                label="Find emails & social profiles by default"
                description="Visits each business website in search of contact details. Recommended for outreach lists."
                icon={<Mail size={16} />}
              />
            </div>
          </section>

          <section className="card settings-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <MonitorPlay size={19} />
              </span>
              <div>
                <h2>How Chrome appears</h2>
                <p>Choose whether searches run in a visible or hidden browser window.</p>
              </div>
            </div>
            <div className="browser-mode-grid">
              {BROWSER_MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cx('browser-mode-card', form.browserMode === item.id && 'is-active')}
                    onClick={() => setValue('browserMode', item.id)}
                  >
                    <span className="browser-mode-icon">
                      <Icon size={19} />
                    </span>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                    {form.browserMode === item.id ? (
                      <span className="browser-mode-check">
                        <Check size={12} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="settings-hint">
              <Info size={14} /> Auto is the best choice for most people. Visible Chrome is the most reliable option when
              collecting reviews.
            </p>
          </section>

          <section className="card settings-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <Server size={19} />
              </span>
              <div>
                <h2>Local API</h2>
                <p>A small REST server for scripts and automations. It listens only on this computer.</p>
              </div>
              <Link to="/api" className="text-button settings-card-link">
                API docs <ArrowRight size={13} />
              </Link>
            </div>

            <div className="settings-api-status">
              <span className={cx('api-dot', info?.api?.url ? 'is-online' : 'is-offline')} />
              <div>
                <strong>{info?.api?.url ? 'API is running' : info?.api?.error ? 'API is offline' : 'API is starting'}</strong>
                <code>{info?.api?.url || `http://127.0.0.1:${form.apiPort}`}</code>
              </div>
              {info?.api?.url ? (
                <CopyButton
                  text={info.api.url}
                  label="Copy API URL"
                  copiedLabel="API URL copied"
                  className="icon-button"
                />
              ) : null}
            </div>

            <div className="settings-field-grid api-fields">
              <div className="settings-field">
                <label htmlFor="apiPort">
                  <span>Port</span>
                  <small>1024–65535. The API restarts when this changes.</small>
                </label>
                <input
                  id="apiPort"
                  type="number"
                  min={1024}
                  max={65535}
                  value={form.apiPort}
                  onChange={(event) => setValue('apiPort', Number(event.target.value) || 4319)}
                />
              </div>
              <div className="settings-field">
                <label htmlFor="apiToken">
                  <span>Bearer token</span>
                  <small>Optional. Leave blank to allow local requests without a token.</small>
                </label>
                <div className="token-field">
                  <KeyRound size={15} />
                  <input
                    id="apiToken"
                    type={showToken ? 'text' : 'password'}
                    value={form.apiToken}
                    onChange={(event) => setValue('apiToken', event.target.value.slice(0, 200))}
                    placeholder="No token"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="token-action"
                    onClick={() => setShowToken((current) => !current)}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                    title={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  {form.apiToken ? (
                    <CopyButton
                      text={form.apiToken}
                      label="Copy token"
                      copiedLabel="Token copied"
                      className="token-action"
                    />
                  ) : null}
                </div>
                <div className="token-actions">
                  <button type="button" className="text-button" onClick={generateToken}>
                    <RefreshCcw size={13} /> Generate token
                  </button>
                  {form.apiToken ? (
                    <button type="button" className="text-button muted" onClick={() => setValue('apiToken', '')}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <InfoCallout tone="info" title="How token protection works">
              When a token is set, every API request must include it as <code>Authorization: Bearer &lt;token&gt;</code>{' '}
              or <code>X-API-Key</code>. The token is stored locally in your settings file.
            </InfoCallout>
          </section>

          <section className="card settings-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <Database size={19} />
              </span>
              <div>
                <h2>Data &amp; storage</h2>
                <p>Your searches, leads, and Chrome profile live on this computer only.</p>
              </div>
            </div>

            <div className="storage-list">
              <div className="storage-row">
                <span className="storage-icon">
                  <Database size={17} />
                </span>
                <div>
                  <strong>Search data</strong>
                  <code>{info?.paths?.dataDir || 'Loading…'}</code>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openFolder('data')}>
                  <FolderOpen size={14} /> Open folder
                </button>
              </div>
              <div className="storage-row">
                <span className="storage-icon">
                  <Chrome size={17} />
                </span>
                <div>
                  <strong>Chrome profile</strong>
                  <code>{info?.paths?.profileDir || 'Loading…'}</code>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openFolder('profile')}>
                  <FolderOpen size={14} /> Open folder
                </button>
              </div>
              <div className="storage-row">
                <span className="storage-icon">
                  <DownloadIcon />
                </span>
                <div>
                  <strong>Default export folder</strong>
                  <code>{info?.paths?.documents || 'Loading…'}</code>
                </div>
                <span className="storage-note">CSV save dialog opens here</span>
              </div>
            </div>

            <div className="settings-danger">
              <div>
                <strong>Clear all search history</strong>
                <p>
                  Removes {formatNumber(tasks.length)} saved {tasks.length === 1 ? 'search' : 'searches'}. Export any
                  lists you want to keep first. Settings are not affected.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-danger-soft btn-sm"
                onClick={() => setClearOpen(true)}
                disabled={!tasks.length || activeTasks > 0}
              >
                <Trash2 size={14} /> Clear history
              </button>
            </div>
            {activeTasks > 0 ? (
              <p className="settings-inline-note">
                <Info size={14} /> Clear history is unavailable while a search is running.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="settings-aside">
          <section className="card settings-about">
            <span className="settings-about-logo">
              <MapPinIcon />
            </span>
            <h2>Step in Scraper</h2>
            <p className="settings-version">Version {info?.version || '1.0.0'}</p>
            <p>
              A beginner-friendly Google Maps lead finder. Built to run locally, keep your data on your computer, and
              export clean spreadsheets.
            </p>
            <div className="settings-about-facts">
              <span>
                <ShieldCheck size={13} /> Local-first
              </span>
              <span>
                <Lock size={13} /> No cloud account
              </span>
              <span>
                <Chrome size={13} /> Chrome powered
              </span>
            </div>
            <button type="button" className="btn btn-soft btn-sm" onClick={replayTour}>
              <Sparkles size={14} /> Show welcome tour
            </button>
          </section>

          <InfoCallout tone="legal" title="Responsible use">
            {info?.disclaimer ||
              'Step in Scraper is for educational, research, and lawful lead generation use only. Follow Google’s terms, privacy laws, and anti-spam rules.'}
          </InfoCallout>

          {info?.reviewNote ? (
            <InfoCallout tone="info" title="About Google reviews">
              {info.reviewNote}
            </InfoCallout>
          ) : null}

          <section className="card settings-aside-links">
            <h2>Need a hand?</h2>
            <Link to="/guide">
              <BookIcon /> Read the guide <ArrowRight size={13} />
            </Link>
            <Link to="/api">
              <CodeIcon /> Local API reference <ArrowRight size={13} />
            </Link>
            <Link to="/tasks">
              <HistoryIcon /> Open task history <ArrowRight size={13} />
            </Link>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={clearOpen}
        title="Clear all search history?"
        message="Every saved search, lead, and review on this computer will be deleted. This cannot be undone."
        confirmLabel="Clear everything"
        busy={clearing}
        onClose={() => setClearOpen(false)}
        onConfirm={clearHistory}
      />
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}
