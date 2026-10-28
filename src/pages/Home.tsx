import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Chrome,
  Compass,
  FileSpreadsheet,
  Globe2,
  GripVertical,
  Link2,
  ListChecks,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import CITIES from '@shared/cities.json';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { Toggle } from '@/components/Toggle';
import { InfoCallout } from '@/components/InfoCallout';
import { EmptyState } from '@/components/EmptyState';
import { useSystem } from '@/lib/system-context';
import { useTasks } from '@/lib/task-context';
import { api } from '@/lib/bridge';
import { useToast } from '@/components/ToastProvider';
import { EXAMPLE_QUERIES, DEFAULT_SETTINGS } from '@/lib/defaults';
import { cx, formatNumber, formatRelative, pluralize } from '@/lib/format';
import type { TaskMode, TaskOptions } from '@/lib/types';

interface Country {
  code: string;
  name: string;
  cities: string[];
}

const COUNTRIES = CITIES as Country[];

const MODES: Array<{
  id: TaskMode;
  label: string;
  hint: string;
  icon: typeof Search;
}> = [
  { id: 'search', label: 'Search Maps', hint: 'Type what and where', icon: Search },
  { id: 'links', label: 'Paste links', hint: 'One or more businesses', icon: Link2 },
  { id: 'country', label: 'Multi-city', hint: 'One niche, many cities', icon: Globe2 },
];

const BROWSER_OPTIONS = [
  { id: 'auto', label: 'Auto', hint: 'Recommended' },
  { id: 'visible', label: 'Visible', hint: 'Show Chrome' },
  { id: 'hidden', label: 'Hidden', hint: 'Run quietly' },
] as const;

function estimateOptions(options: TaskOptions, mode: TaskMode, cities: number) {
  if (mode === 'country') return options.maxResultsPerCity * cities;
  return options.maxResults;
}

export function HomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialQuery = params.get('q') || '';
  const { info, settings, loading: systemLoading } = useSystem();
  const { tasks, rememberTask } = useTasks();
  const { pushToast } = useToast();

  const [mode, setMode] = useState<TaskMode>('search');
  const [query, setQuery] = useState(initialQuery);
  const [linksText, setLinksText] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [selectedCities, setSelectedCities] = useState<string[]>(() => {
    const us = COUNTRIES.find((country) => country.code === 'US');
    return us ? us.cities.slice(0, 3) : [];
  });
  const [extraCities, setExtraCities] = useState<string[]>([]);
  const [cityDraft, setCityDraft] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState<TaskOptions>({
    ...DEFAULT_SETTINGS,
    browserMode: 'auto',
    reviews: false,
    enrich: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [reviewsNoteDismissed, setReviewsNoteDismissed] = useState(false);

  const country = COUNTRIES.find((item) => item.code === countryCode) || COUNTRIES[0];
  const allCities = useMemo(
    () => [...extraCities, ...country.cities.filter((city) => !extraCities.includes(city))],
    [country, extraCities]
  );
  const filteredCities = useMemo(() => {
    const needle = cityFilter.trim().toLowerCase();
    return needle ? allCities.filter((city) => city.toLowerCase().includes(needle)) : allCities;
  }, [allCities, cityFilter]);

  useEffect(() => {
    if (systemLoading) return;
    setOptions((current) => ({
      ...current,
      maxResults: settings.maxResults,
      maxResultsPerCity: settings.maxResultsPerCity,
      reviews: settings.reviews,
      maxReviews: settings.maxReviews,
      enrich: settings.enrich,
      browserMode: settings.browserMode,
    }));
  }, [
    systemLoading,
    settings.maxResults,
    settings.maxResultsPerCity,
    settings.reviews,
    settings.maxReviews,
    settings.enrich,
    settings.browserMode,
  ]);

  useEffect(() => {
    if (!initialQuery) return;
    setMode('search');
    setQuery(initialQuery);
  }, [initialQuery]);

  const stats = useMemo(() => {
    const completed = tasks.filter((task) => task.status === 'completed');
    return {
      searches: tasks.length,
      leads: tasks.reduce((sum, task) => sum + (task.counts?.results || 0), 0),
      emails: tasks.reduce((sum, task) => sum + (task.counts?.withEmail || 0), 0),
      completed: completed.length,
      last: tasks[0] || null,
    };
  }, [tasks]);

  const recentTasks = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4),
    [tasks]
  );

  const linkCount = useMemo(
    () => linksText.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean).length,
    [linksText]
  );

  const estimate = estimateOptions(options, mode, selectedCities.length);
  const chromeReady = info?.chrome?.found;

  const toggleCity = (city: string) => {
    setSelectedCities((current) =>
      current.includes(city) ? current.filter((item) => item !== city) : [...current, city]
    );
  };

  const selectCities = (cities: string[]) => {
    setSelectedCities([...new Set(cities)]);
  };

  const changeCountry = (code: string) => {
    const next = COUNTRIES.find((item) => item.code === code);
    setCountryCode(code);
    setCityFilter('');
    setExtraCities([]);
    setSelectedCities(next ? next.cities.slice(0, 3) : []);
  };

  const addCity = () => {
    const city = cityDraft.trim().replace(/\s+/g, ' ');
    if (!city) return;
    const exists = allCities.some((item) => item.toLowerCase() === city.toLowerCase());
    if (!exists) setExtraCities((current) => [...current, city]);
    if (!selectedCities.some((item) => item.toLowerCase() === city.toLowerCase())) {
      setSelectedCities((current) => [...current, city]);
    }
    setCityDraft('');
    setCityFilter('');
  };

  const updateOption = <K extends keyof TaskOptions,>(key: K, value: TaskOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const validate = useCallback(() => {
    if (mode === 'search') {
      const value = query.trim();
      if (value.length < 3) return 'Type what you are looking for, for example “dentists in Austin”.';
      if (/^https?:\/\//i.test(value) || /google\.[a-z.]+\/maps/i.test(value)) {
        return 'That looks like a Maps link. Switch to “Paste links” and add it there.';
      }
    }
    if (mode === 'links') {
      if (linkCount === 0) return 'Paste at least one Google Maps business link.';
      if (linkCount > 100) return 'Paste up to 100 links at a time.';
    }
    if (mode === 'country') {
      if (businessType.trim().length < 2) return 'Type the business type, for example “dentists” or “coffee shops”.';
      if (!selectedCities.length) return 'Choose at least one city for the multi-city search.';
      if (selectedCities.length * options.maxResultsPerCity > 500) {
        return 'That is more than 500 businesses in one search. Reduce the cities or leads per city.';
      }
    }
    return null;
  }, [mode, query, linkCount, businessType, selectedCities, options.maxResultsPerCity]);

  const start = async () => {
    if (starting) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      pushToast({ kind: 'error', title: 'One thing to fix', message: problem });
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const payload =
        mode === 'search'
          ? { mode, query: query.trim(), options }
          : mode === 'links'
            ? { mode, links: linksText.split(/[\s,]+/).filter(Boolean), options }
            : {
                mode,
                businessType: businessType.trim(),
                country: country.name,
                cities: selectedCities,
                options,
              };

      const task = await api.createTask(payload);
      rememberTask(task);
      pushToast({
        kind: 'success',
        title: 'Search started',
        message:
          task.options.reviews && task.options.browserMode === 'auto'
            ? 'Chrome will open so reviews can load. You can minimize it.'
            : 'Progress is shown live on the results page.',
      });
      navigate(`/tasks/${task.id}`);
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : 'The search could not start.';
      setError(message);
      pushToast({ kind: 'error', title: 'Could not start the search', message });
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void start();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="page home-page">
      <PageHeader
        eyebrow="New search"
        title={
          <>
            Find local customers <span className="title-accent">on the map.</span>
          </>
        }
        description="Search Google Maps, collect verified business details, and export a clean list. No scripts or spreadsheets required."
        actions={
          <div className={`chrome-status-chip ${chromeReady ? 'is-ready' : 'is-missing'}`}>
            <span className="chrome-status-dot" />
            <Chrome size={15} />
            <span>{chromeReady ? 'Chrome ready' : 'Chrome needed'}</span>
            {!chromeReady ? (
              <Link to="/settings" className="chrome-status-link">
                Fix
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="home-grid">
        <section className="card builder-card">
          <div className="builder-head">
            <div>
              <span className="eyebrow">Build a search</span>
              <h2>What would you like to find?</h2>
            </div>
            <span className="builder-step">1 of 2</span>
          </div>

          <div className="mode-tabs" role="tablist" aria-label="Search type">
            {MODES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === item.id}
                  className={cx('mode-tab', mode === item.id && 'is-active')}
                  onClick={() => {
                    setMode(item.id);
                    setError(null);
                  }}
                >
                  <span className="mode-tab-icon">
                    <Icon size={18} />
                  </span>
                  <span className="mode-tab-copy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                  {mode === item.id ? <Check size={14} className="mode-tab-check" /> : null}
                </button>
              );
            })}
          </div>

          <div className="builder-body">
            {mode === 'search' ? (
              <div className="form-block">
                <label className="field-label" htmlFor="query">
                  Search Google Maps
                  <span className="field-hint">Business type + place works best</span>
                </label>
                <div className="search-field">
                  <Search size={19} className="search-field-icon" />
                  <input
                    id="query"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setError(null);
                    }}
                    placeholder="dentists in Austin, TX"
                    autoFocus
                    autoComplete="off"
                  />
                  {query ? (
                    <button
                      type="button"
                      className="search-clear"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  ) : null}
                </div>
                <div className="example-row">
                  <span className="example-label">
                    <Sparkles size={13} /> Try
                  </span>
                  {EXAMPLE_QUERIES.slice(0, 4).map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="example-chip"
                      onClick={() => {
                        setQuery(example);
                        setError(null);
                      }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === 'links' ? (
              <div className="form-block">
                <label className="field-label" htmlFor="links">
                  Google Maps business links
                  <span className="field-hint">One per line or separated by spaces</span>
                </label>
                <div className="textarea-field">
                  <Link2 size={18} className="textarea-icon" />
                  <textarea
                    id="links"
                    value={linksText}
                    onChange={(event) => {
                      setLinksText(event.target.value);
                      setError(null);
                    }}
                    rows={5}
                    placeholder={'https://maps.app.goo.gl/...\nhttps://www.google.com/maps/place/...'}
                    spellCheck={false}
                    autoFocus
                  />
                </div>
                <div className="link-hint-row">
                  <span className={cx('link-count', linkCount > 0 && 'is-filled')}>
                    {linkCount > 0 ? pluralize(linkCount, 'link') + ' ready' : 'No links yet'}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setLinksText(EXAMPLE_QUERIES.slice(0, 2).join('\n'))}
                    hidden
                  >
                    Use samples
                  </button>
                  <a
                    className="helper-link"
                    href="https://www.google.com/maps"
                    onClick={(event) => {
                      event.preventDefault();
                      void api.openExternal('https://www.google.com/maps');
                    }}
                  >
                    Open Google Maps <ArrowRight size={13} />
                  </a>
                </div>
                <InfoCallout tone="info" title="How to copy a link">
                  In Google Maps, open a business, choose <strong>Share</strong>, then <strong>Copy link</strong>. Short
                  <code>maps.app.goo.gl</code> links work too.
                </InfoCallout>
              </div>
            ) : null}

            {mode === 'country' ? (
              <div className="form-block country-block">
                <div className="country-top">
                  <div className="field grow">
                    <label className="field-label" htmlFor="businessType">
                      Business type
                    </label>
                    <div className="input-with-icon">
                      <Building2 size={17} />
                      <input
                        id="businessType"
                        value={businessType}
                        onChange={(event) => {
                          setBusinessType(event.target.value);
                          setError(null);
                        }}
                        placeholder="dentists"
                        autoComplete="off"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="field country-field">
                    <label className="field-label" htmlFor="country">
                      Country
                    </label>
                    <div className="select-wrap">
                      <Globe2 size={17} />
                      <select
                        id="country"
                        value={countryCode}
                        onChange={(event) => changeCountry(event.target.value)}
                      >
                        {COUNTRIES.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} className="select-chevron" />
                    </div>
                  </div>
                </div>

                <div className="city-panel">
                  <div className="city-panel-head">
                    <div>
                      <span className="field-label">
                        Cities <span className="count-pill">{selectedCities.length} selected</span>
                      </span>
                      <p className="field-sub">One search runs the same business type across every selected city.</p>
                    </div>
                    <div className="city-panel-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => selectCities([...country.cities.slice(0, 5), ...extraCities])}
                      >
                        Popular 5
                      </button>
                      <button type="button" className="text-button" onClick={() => selectCities(allCities)}>
                        All
                      </button>
                      <button type="button" className="text-button muted" onClick={() => selectCities([])}>
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="city-search">
                    <Search size={15} />
                    <input
                      value={cityFilter}
                      onChange={(event) => setCityFilter(event.target.value)}
                      placeholder={`Filter ${country.name} cities…`}
                      aria-label="Filter cities"
                    />
                  </div>

                  <div className="city-grid">
                    {filteredCities.map((city) => {
                      const checked = selectedCities.includes(city);
                      return (
                        <label key={city} className={cx('city-option', checked && 'is-selected')}>
                          <input type="checkbox" checked={checked} onChange={() => toggleCity(city)} />
                          <span className="city-checkbox">{checked ? <Check size={11} /> : null}</span>
                          <span className="city-name">{city}</span>
                          {extraCities.includes(city) ? <span className="city-extra">custom</span> : null}
                        </label>
                      );
                    })}
                    {!filteredCities.length ? (
                      <div className="city-empty">No cities match “{cityFilter}”. Add it below.</div>
                    ) : null}
                  </div>

                  <div className="city-add">
                    <MapPin size={15} />
                    <input
                      value={cityDraft}
                      onChange={(event) => setCityDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addCity();
                        }
                      }}
                      placeholder="City not listed? Type it here"
                      aria-label="Add a custom city"
                    />
                    <button type="button" className="btn btn-soft btn-sm" onClick={addCity} disabled={!cityDraft.trim()}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="builder-options">
              <div className="builder-options-head">
                <span className="field-label">What to collect</span>
                <span className="estimate-pill">
                  <ListChecks size={13} /> up to {formatNumber(estimate)} leads
                </span>
              </div>

              <div className="option-grid">
                <div className="option-card option-results">
                  <div className="option-card-head">
                    <span className="option-icon">
                      <Compass size={17} />
                    </span>
                    <div>
                      <strong>{mode === 'country' ? 'Leads per city' : 'Maximum leads'}</strong>
                      <span>
                        {mode === 'country'
                          ? `Across ${pluralize(selectedCities.length, 'city', 'cities')}`
                          : mode === 'links'
                            ? 'Uses the number of links'
                            : 'How many businesses to collect'}
                      </span>
                    </div>
                  </div>
                  {mode === 'links' ? (
                    <div className="option-static">{linkCount > 0 ? pluralize(linkCount, 'business', 'businesses') : '—'}</div>
                  ) : (
                    <>
                      <div className="range-row">
                        <input
                          type="range"
                          min={1}
                          max={mode === 'country' ? 50 : 100}
                          step={1}
                          value={mode === 'country' ? options.maxResultsPerCity : options.maxResults}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (mode === 'country') updateOption('maxResultsPerCity', value);
                            else updateOption('maxResults', value);
                          }}
                          aria-label={mode === 'country' ? 'Leads per city' : 'Maximum leads'}
                        />
                        <input
                          type="number"
                          className="range-number"
                          min={1}
                          max={mode === 'country' ? 50 : 100}
                          value={mode === 'country' ? options.maxResultsPerCity : options.maxResults}
                          onChange={(event) => {
                            const value = Math.max(1, Math.min(mode === 'country' ? 50 : 100, Number(event.target.value) || 1));
                            if (mode === 'country') updateOption('maxResultsPerCity', value);
                            else updateOption('maxResults', value);
                          }}
                        />
                      </div>
                      <div className="preset-row">
                        {[10, 20, 50].map((preset) => {
                          const active =
                            (mode === 'country' ? options.maxResultsPerCity : options.maxResults) === preset;
                          return (
                            <button
                              key={preset}
                              type="button"
                              className={cx('preset-chip', active && 'is-active')}
                              onClick={() =>
                                mode === 'country'
                                  ? updateOption('maxResultsPerCity', preset)
                                  : updateOption('maxResults', preset)
                              }
                            >
                              {preset}
                            </button>
                          );
                        })}
                        <span className="preset-hint">
                          {mode === 'country' ? `${formatNumber(estimate)} total` : 'Maps caps near 120'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="option-card">
                  <Toggle
                    checked={options.reviews}
                    onChange={(next) => updateOption('reviews', next)}
                    label="Collect reviews"
                    description="Adds review text to each lead. Slower."
                    icon={<Star size={16} />}
                  />
                  {options.reviews ? (
                    <div className="review-options">
                      <label htmlFor="maxReviews">Reviews per business</label>
                      <div className="review-options-row">
                        <input
                          id="maxReviews"
                          type="number"
                          min={1}
                          max={500}
                          value={options.maxReviews}
                          onChange={(event) =>
                            updateOption('maxReviews', Math.max(1, Math.min(500, Number(event.target.value) || 1)))
                          }
                        />
                        <span>Up to 500</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="option-card">
                  <Toggle
                    checked={options.enrich}
                    onChange={(next) => updateOption('enrich', next)}
                    label="Find emails & socials"
                    description="Visits each website to look for contact details."
                    icon={<Mail size={16} />}
                  />
                  <div className="enrich-hint">
                    <Zap size={13} />
                    <span>Recommended for outreach. Adds a little time per lead.</span>
                  </div>
                </div>
              </div>

              {options.reviews && !reviewsNoteDismissed ? (
                <InfoCallout
                  tone="warning"
                  title="Reviews use a visible Chrome window"
                  action={
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setReviewsNoteDismissed(true)}
                      aria-label="Dismiss review note"
                    >
                      <X size={15} />
                    </button>
                  }
                >
                  Google only shows about <strong>5 public reviews</strong> to signed-out visitors. Connect a Google
                  account in <Link to="/settings">Settings</Link> for more. Keep the Chrome window open while the search
                  runs.
                </InfoCallout>
              ) : null}

              <div className="advanced">
                <button
                  type="button"
                  className="advanced-toggle"
                  onClick={() => setShowAdvanced((current) => !current)}
                  aria-expanded={showAdvanced}
                >
                  <GripVertical size={14} />
                  Browser options
                  <span className="advanced-note">
                    {BROWSER_OPTIONS.find((item) => item.id === options.browserMode)?.label || 'Auto'}
                  </span>
                  <ChevronDown size={15} className={cx('advanced-chevron', showAdvanced && 'is-open')} />
                </button>
                {showAdvanced ? (
                  <div className="advanced-body">
                    <p>
                      <strong>Auto</strong> hides Chrome for normal searches and shows it when reviews are on.{' '}
                      <strong>Visible</strong> lets you watch. <strong>Hidden</strong> is fastest but less reliable for
                      reviews.
                    </p>
                    <div className="segmented small">
                      {BROWSER_OPTIONS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={cx('segment', options.browserMode === item.id && 'is-active')}
                          onClick={() => updateOption('browserMode', item.id)}
                        >
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="builder-footer">
            <div className="builder-footer-summary">
              <span className="summary-icon">
                <Wand2 size={16} />
              </span>
              <span>
                {mode === 'search'
                  ? query.trim() || 'Your search will appear here'
                  : mode === 'links'
                    ? linkCount
                      ? `${pluralize(linkCount, 'pasted business', 'pasted businesses')}`
                      : 'Paste business links above'
                    : businessType.trim()
                      ? `${businessType.trim()} in ${pluralize(selectedCities.length, 'city', 'cities')}`
                      : 'Choose a business type and cities'}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-run"
              onClick={() => void start()}
              disabled={starting}
            >
              {starting ? <Loader2 size={17} className="spin" /> : <Search size={17} />}
              {starting ? 'Starting…' : 'Start search'}
              <span className="btn-shortcut">Ctrl ↵</span>
            </button>
          </div>

          {error ? <div className="form-error">{error}</div> : null}

          {!chromeReady && info ? (
            <InfoCallout
              tone="warning"
              title="Chrome is required"
              action={
                <Link to="/settings" className="btn btn-soft btn-sm">
                  Check setup
                </Link>
              }
            >
              Step in Scraper could not find Google Chrome or Microsoft Edge. Install Chrome, then restart Step in Scraper.
            </InfoCallout>
          ) : null}
        </section>

        <aside className="home-aside">
          <section className="card how-card">
            <div className="aside-head">
              <span className="eyebrow">Three easy steps</span>
              <h2>From search to spreadsheet</h2>
            </div>
            <ol className="how-steps">
              <li>
                <span className="how-number">1</span>
                <div>
                  <strong>Describe who you want</strong>
                  <p>Type a niche and a place — or paste Google Maps links you already have.</p>
                </div>
              </li>
              <li>
                <span className="how-number">2</span>
                <div>
                  <strong>Let Chrome collect the details</strong>
                  <p>Names, addresses, phones, websites, ratings, emails and social profiles land in one place.</p>
                </div>
              </li>
              <li>
                <span className="how-number">3</span>
                <div>
                  <strong>Review and export</strong>
                  <p>Filter the results, open a business for full details, then export CSV for your CRM or sheet.</p>
                </div>
              </li>
            </ol>
            <div className="how-badges">
              <span>
                <FileSpreadsheet size={14} /> Excel-ready CSV
              </span>
              <span>
                <ShieldCheck size={14} /> Stays on your PC
              </span>
            </div>
          </section>

          <section className="card snapshot-card">
            <div className="aside-head row">
              <div>
                <span className="eyebrow">Your workspace</span>
                <h2>At a glance</h2>
              </div>
              <Link to="/tasks" className="text-button">
                History <ArrowRight size={13} />
              </Link>
            </div>
            <div className="snapshot-grid">
              <div className="snapshot-stat">
                <span>Leads collected</span>
                <strong>{formatNumber(stats.leads)}</strong>
              </div>
              <div className="snapshot-stat">
                <span>Emails found</span>
                <strong>{formatNumber(stats.emails)}</strong>
              </div>
              <div className="snapshot-stat">
                <span>Searches</span>
                <strong>{formatNumber(stats.searches)}</strong>
              </div>
            </div>
            {stats.last ? (
              <div className="snapshot-last">
                <div className="snapshot-last-head">
                  <span>Latest search</span>
                  <StatusBadge status={stats.last.status} size="sm" />
                </div>
                <Link to={`/tasks/${stats.last.id}`} className="snapshot-last-link">
                  <strong>{stats.last.title}</strong>
                  <span>
                    {formatNumber(stats.last.counts.results)} leads · {formatRelative(stats.last.createdAt)}
                  </span>
                </Link>
                {stats.last.status === 'running' || stats.last.status === 'queued' ? (
                  <ProgressBar value={stats.last.progress?.percent || 0} thin animated />
                ) : null}
              </div>
            ) : (
              <p className="snapshot-note">
                Your first search will show up here. Everything is saved automatically, so you can close the app and
                come back later.
              </p>
            )}
          </section>

          <section className="card recent-card">
            <div className="aside-head row">
              <div>
                <span className="eyebrow">Pick up where you left off</span>
                <h2>Recent searches</h2>
              </div>
            </div>
            {recentTasks.length ? (
              <div className="recent-list">
                {recentTasks.map((task) => (
                  <Link key={task.id} to={`/tasks/${task.id}`} className="recent-item">
                    <span className={cx('recent-dot', `dot-${task.status}`)} />
                    <span className="recent-copy">
                      <strong>{task.title}</strong>
                      <small>
                        {formatNumber(task.counts.results)} leads · {formatRelative(task.createdAt)}
                      </small>
                    </span>
                    <StatusBadge status={task.status} size="sm" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<Search size={24} />}
                title="No searches yet"
                description="Run your first search above — it only takes a minute."
              />
            )}
          </section>

          <InfoCallout tone="legal" title="Use it responsibly">
            Step in Scraper is for educational, research, and lawful lead generation only. Respect Google’s terms, privacy
            laws, and anti-spam rules. Only contact people with a legitimate reason to hear from you.
          </InfoCallout>
        </aside>
      </div>
    </div>
  );
}
