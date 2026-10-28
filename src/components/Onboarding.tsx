import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Chrome,
  Compass,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
} from 'lucide-react';
import { Modal } from './Modal';
import { useSystem } from '@/lib/system-context';
import { openExternal } from '@/lib/bridge';
import { cx } from '@/lib/format';

const STORAGE_KEY = 'mapscraper.onboarded.v1';

const STEPS = [
  {
    title: 'Welcome to Step in Scraper',
    body: 'Turn Google Maps searches into a clean list of local businesses — complete with contact details, websites, ratings, and reviews.',
    icon: Sparkles,
  },
  {
    title: 'Chrome does the browsing',
    body: 'Step in Scraper uses the Google Chrome already on your computer. Nothing to configure, and no account is required for a normal search.',
    icon: Chrome,
  },
  {
    title: 'Run your first search',
    body: 'Type a search like “dentists in Austin”, press Run, and watch the leads arrive. Export everything to a spreadsheet when it finishes.',
    icon: Search,
  },
];

export function Onboarding() {
  const { info } = useSystem();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [step, setStep] = useState(0);

  const chromeReady = info?.chrome?.found;
  const active = STEPS[step];
  const Icon = active.icon;

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // The welcome can appear again if storage is unavailable.
    }
    setOpen(false);
  };

  const chromeSummary = useMemo(() => {
    if (!info) return 'Checking your computer…';
    if (!info.chrome.found) return 'Chrome was not found yet';
    return `${info.chrome.name || 'Google Chrome'} ${info.chrome.version || ''}`.trim();
  }, [info]);

  return (
    <Modal
      open={open}
      onClose={finish}
      size="lg"
      hideClose
      className="onboarding-modal"
      closeOnOverlay={false}
    >
      <div className="onboarding">
        <div className="onboarding-art">
          <span className="onboarding-orbit onboarding-orbit-one" />
          <span className="onboarding-orbit onboarding-orbit-two" />
          <span className="onboarding-pin">
            <MapPin size={30} />
          </span>
          <div className="onboarding-art-list">
            <span className="skeleton-chip skeleton-chip-long" />
            <span className="skeleton-chip" />
            <span className="skeleton-chip skeleton-chip-short" />
            <span className="skeleton-chip skeleton-chip-long" />
          </div>
          <span className="onboarding-art-badge">
            <Table2 size={14} /> CSV ready
          </span>
          <div className="onboarding-art-copy">
            <strong>Local leads, in minutes.</strong>
            <span>No setup. No account. Your data stays on this computer.</span>
          </div>
        </div>

        <div className="onboarding-main">
          <div className="onboarding-steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((item, index) => (
              <span
                key={item.title}
                className={cx('onboarding-dot', index === step && 'is-active', index < step && 'is-done')}
              >
                {index < step ? <Check size={11} /> : index + 1}
              </span>
            ))}
            <span className="onboarding-step-label">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>

          <span className="onboarding-icon">
            <Icon size={26} />
          </span>
          <h1>{active.title}</h1>
          <p className="onboarding-body">{active.body}</p>

          {step === 0 ? (
            <div className="onboarding-points">
              <span>
                <Compass size={16} /> Search a city or paste Maps links
              </span>
              <span>
                <Sparkles size={16} /> Emails &amp; socials found automatically
              </span>
              <span>
                <Table2 size={16} /> Export to CSV when you are done
              </span>
            </div>
          ) : null}

          {step === 1 ? (
            <div className={cx('onboarding-chrome', chromeReady ? 'is-ready' : 'is-missing')}>
              <span className="onboarding-chrome-icon">
                <Chrome size={22} />
              </span>
              <div>
                <strong>{chromeReady ? 'Chrome is ready' : 'Chrome is needed'}</strong>
                <span>{chromeSummary}</span>
              </div>
              {chromeReady ? (
                <span className="onboarding-check">
                  <Check size={15} />
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => void openExternal('https://www.google.com/chrome/')}
                >
                  Get Chrome
                </button>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="onboarding-samples">
              <span className="onboarding-samples-label">Try one of these:</span>
              <div className="onboarding-sample-grid">
                {['dentists in Austin, TX', 'coffee shops in Portland, OR', 'plumbers in Manchester, UK'].map(
                  (sample) => (
                    <Link key={sample} to={`/?q=${encodeURIComponent(sample)}`} className="onboarding-sample" onClick={finish}>
                      <Search size={14} />
                      {sample}
                    </Link>
                  )
                )}
              </div>
            </div>
          ) : null}

          <div className="onboarding-legal">
            <ShieldCheck size={15} />
            <span>
              Built for educational, research, and lawful lead generation. You are responsible for how you use the data.
            </span>
          </div>

          <div className="onboarding-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={finish}>
              Skip tour
            </button>
            <div className="onboarding-actions-right">
              {step > 0 ? (
                <button type="button" className="btn btn-ghost" onClick={() => setStep((current) => current - 1)}>
                  Back
                </button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={() => setStep((current) => current + 1)}>
                  Continue
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={finish}>
                  Start searching
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
