import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Braces,
  CheckCircle2,
  ChevronDown,
  CircleOff,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  KeyRound,
  Laptop,
  Lock,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  UploadCloud,
  XCircle,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { InfoCallout } from '@/components/InfoCallout';
import { CopyButton } from '@/components/CopyButton';
import { useSystem } from '@/lib/system-context';
import { useToast } from '@/components/ToastProvider';
import { api } from '@/lib/bridge';
import { cx } from '@/lib/format';

type SampleId = 'search' | 'links' | 'country';
type CodeLang = 'curl' | 'javascript' | 'python';

const SAMPLES: Record<SampleId, { label: string; description: string; body: string }> = {
  search: {
    label: 'Search a city',
    description: 'The most common request: a business type and a place.',
    body: JSON.stringify(
      {
        mode: 'search',
        query: 'dentists in Austin, TX',
        options: { maxResults: 20, reviews: false, enrich: true },
      },
      null,
      2
    ),
  },
  links: {
    label: 'Paste links',
    description: 'Collect specific businesses from Google Maps share links.',
    body: JSON.stringify(
      {
        mode: 'links',
        links: ['https://maps.app.goo.gl/example1', 'https://www.google.com/maps/place/example2'],
        options: { reviews: false, enrich: true },
      },
      null,
      2
    ),
  },
  country: {
    label: 'Multiple cities',
    description: 'One business type across several cities in a single task.',
    body: JSON.stringify(
      {
        mode: 'country',
        businessType: 'coffee shops',
        country: 'United States',
        cities: ['Austin, TX', 'Dallas, TX', 'Houston, TX'],
        options: { maxResultsPerCity: 10, reviews: false, enrich: true },
      },
      null,
      2
    ),
  },
};

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/health',
    title: 'Health check',
    description: 'Confirms the API is running and reports the app version.',
    icon: CheckCircle2,
  },
  {
    method: 'GET',
    path: '/api/v1/tasks',
    title: 'List searches',
    description: 'All saved tasks, newest first. Optional ?status= and ?mode= filters.',
    icon: Search,
  },
  {
    method: 'POST',
    path: '/api/v1/tasks',
    title: 'Create a search',
    description: 'Queues a search. Returns 202 with the new task summary.',
    icon: Plus,
  },
  {
    method: 'GET',
    path: '/api/v1/tasks/:id',
    title: 'Get a search',
    description: 'Full task, progress, and counts. Add ?include=results for leads.',
    icon: Braces,
  },
  {
    method: 'GET',
    path: '/api/v1/tasks/:id/results',
    title: 'Get results',
    description: 'Just the business records for a task.',
    icon: Globe2,
  },
  {
    method: 'GET',
    path: '/api/v1/tasks/:id/export',
    title: 'Export CSV',
    description: 'Leads by default. Add ?format=reviews for the reviews sheet.',
    icon: Download,
  },
  {
    method: 'POST',
    path: '/api/v1/tasks/:id/cancel',
    title: 'Cancel a search',
    description: 'Stops a running task and saves partial results.',
    icon: XCircle,
  },
  {
    method: 'POST',
    path: '/api/v1/tasks/:id/rerun',
    title: 'Rerun a search',
    description: 'Queues a fresh copy with the same inputs and options.',
    icon: RefreshCcw,
  },
  {
    method: 'DELETE',
    path: '/api/v1/tasks/:id',
    title: 'Delete a search',
    description: 'Removes the task and its results from this computer.',
    icon: Trash2,
  },
  {
    method: 'GET',
    path: '/api/v1/meta',
    title: 'Metadata',
    description: 'Countries, major cities, and app defaults for building clients.',
    icon: Server,
  },
];

const RESPONSE_SAMPLE = `{
  "task": {
    "id": "tsk_k3f9a2x7",
    "title": "Dentists in Austin, TX",
    "mode": "search",
    "status": "running",
    "progress": {
      "percent": 42,
      "message": "Collecting business 9 of 20"
    },
    "counts": {
      "results": 8,
      "withEmail": 5,
      "withWebsite": 7,
      "reviews": 0,
      "avgRating": 4.6
    }
  },
  "urls": { "self": "/api/v1/tasks/tsk_k3f9a2x7" }
}`;

export function ApiDocsPage() {
  const { info, settings } = useSystem();
  const { pushToast } = useToast();
  const [sample, setSample] = useState<SampleId>('search');
  const [lang, setLang] = useState<CodeLang>('curl');
  const [openPayload, setOpenPayload] = useState(true);

  const base = info?.api?.url || `http://127.0.0.1:${settings.apiPort || 4319}`;
  const token = info?.apiTokenRequired ? 'YOUR_API_TOKEN' : '';
  const sampleBody = SAMPLES[sample].body;

  const codes = useMemo(() => {
    const authHeader = token ? `\n  -H "Authorization: Bearer ${token}"` : '';
    const create = `curl -X POST ${base}/api/v1/tasks \\\n  -H "Content-Type: application/json"${authHeader} \\\n  -d '${sampleBody.replace(/\n\s*/g, ' ')}'`;

    const poll = `curl "${base}/api/v1/tasks/TASK_ID?include=results" \\\n  -H "Authorization: Bearer ${token || 'YOUR_API_TOKEN'}"`;

    const download = `curl -L "${base}/api/v1/tasks/TASK_ID/export?format=leads" \\\n  -H "Authorization: Bearer ${token || 'YOUR_API_TOKEN'}" \\\n  -o leads.csv`;

    const js = `const BASE = "${base}";
const TOKEN = "${token || 'YOUR_API_TOKEN'}";

async function runSearch() {
  const response = await fetch(\`\${BASE}/api/v1/tasks\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${TOKEN}\`,
    },
    body: JSON.stringify(${sampleBody}),
  });

  if (!response.ok) throw new Error(await response.text());
  const { task } = await response.json();

  // Poll until the search finishes
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const status = await fetch(\`\${BASE}/api/v1/tasks/\${task.id}\`).then((r) => r.json());
    console.log(status.progress?.message);

    if (["completed", "failed", "cancelled"].includes(status.status)) {
      console.log(\`Done: \${status.counts.results} leads\`);
      return status;
    }
  }
}`;

    const python = `import json
import time
import requests

BASE = "${base}"
TOKEN = "${token || 'YOUR_API_TOKEN'}"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

PAYLOAD = json.loads("""${sampleBody}""")

response = requests.post(f"{BASE}/api/v1/tasks", json=PAYLOAD, headers=HEADERS, timeout=30)
response.raise_for_status()
task_id = response.json()["task"]["id"]

while True:
    time.sleep(3)
    task = requests.get(f"{BASE}/api/v1/tasks/{task_id}", headers=HEADERS, timeout=30).json()
    print(task["progress"]["message"])
    if task["status"] in ("completed", "failed", "cancelled"):
        print(task["counts"])
        break

csv_data = requests.get(
    f"{BASE}/api/v1/tasks/{task_id}/export?format=leads",
    headers=HEADERS,
    timeout=30,
).text
open("leads.csv", "w", encoding="utf-8").write(csv_data)`;

    return {
      curl: create + '\n\n# 2. Poll the task until it finishes\n' + poll + '\n\n# 3. Download the CSV\n' + download,
      javascript: js,
      python,
    };
  }, [base, token, sampleBody]);

  const code = codes[lang];

  const copyValue = async (value: string, label: string) => {
    try {
      await api.copyText(value);
      pushToast({ kind: 'success', title: `${label} copied`, message: value, duration: 2400 });
    } catch {
      pushToast({ kind: 'error', title: 'Could not copy', message: 'Select the text and copy it manually.' });
    }
  };

  return (
    <div className="page api-page">
      <PageHeader
        eyebrow="Developers"
        title={
          <>
            A local API, <span className="title-accent">for your own tools.</span>
          </>
        }
        description="Control MapScraper from scripts, Sheets, or another app. The REST API listens only on this computer and stores everything locally."
        actions={
          <Link to="/settings" className="btn btn-ghost">
            <KeyRound size={16} /> API settings
          </Link>
        }
      />

      <section className={cx('api-status-card card', info?.api?.url ? 'is-online' : 'is-offline')}>
        <span className="api-status-icon">
          {info?.api?.url ? <Server size={22} /> : <CircleOff size={22} />}
        </span>
        <div className="api-status-copy">
          <span className="eyebrow">Local API</span>
          <h2>{info?.api?.url ? 'Running on this computer' : info?.api?.error ? 'API could not start' : 'Starting the API…'}</h2>
          <p>
            {info?.api?.url
              ? 'Use the base URL below in any local script or tool. The API is not reachable from other devices.'
              : info?.api?.error || 'The app starts the API automatically. If this stays offline, check the port in Settings.'}
          </p>
        </div>
        <div className="api-base">
          <span>Base URL</span>
          <div className="api-base-row">
            <code>{base}</code>
            <CopyButton text={base} label="Copy base URL" copiedLabel="API URL copied" className="icon-button" />
          </div>
          <span className={cx('api-token-status', info?.apiTokenRequired && 'is-locked')}>
            {info?.apiTokenRequired ? <Lock size={12} /> : <ShieldCheck size={12} />}
            {info?.apiTokenRequired ? 'Bearer token required' : 'No token required'}
          </span>
        </div>
      </section>

      {info?.apiTokenRequired ? (
        <InfoCallout tone="warning" title="Add your API token to every request">
          A token is configured in Settings. Send it as <code>Authorization: Bearer &lt;token&gt;</code> or{' '}
          <code>X-API-Key: &lt;token&gt;</code>. Without it, the API returns 401.
        </InfoCallout>
      ) : (
        <InfoCallout tone="info" title="Protect the API if you share this computer">
          For extra safety, set an API token in <Link to="/settings">Settings</Link>. The API only binds to{' '}
          <code>127.0.0.1</code>, so it is never exposed to your local network.
        </InfoCallout>
      )}

      <div className="api-grid">
        <section className="card api-quickstart">
          <div className="section-head row">
            <div>
              <span className="eyebrow">Quick start</span>
              <h2>Run a search in four steps</h2>
            </div>
            <span className="api-docs-badge">
              <Zap size={13} /> REST · JSON · CSV
            </span>
          </div>
          <ol className="api-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Keep MapScraper open</strong>
                <p>The API runs inside the desktop app and stops when the app quits.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Send a task</strong>
                <p>
                  <code>POST /api/v1/tasks</code> with <code>mode</code> set to <code>search</code>,{' '}
                  <code>links</code>, or <code>country</code>.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Poll for progress</strong>
                <p>
                  Read <code>status</code> and <code>counts</code> from <code>GET /api/v1/tasks/:id</code> until it is
                  completed.
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Download results</strong>
                <p>
                  Use <code>?include=results</code> for JSON or <code>/export</code> for a ready-to-open CSV.
                </p>
              </div>
            </li>
          </ol>

          <div className="api-note-row">
            <span>
              <Laptop size={14} /> Local only
            </span>
            <span>
              <ShieldCheck size={14} /> Same data as the app
            </span>
            <span>
              <Terminal size={14} /> No SDK needed
            </span>
          </div>
        </section>

        <section className="card api-request-card">
          <div className="section-head row">
            <div>
              <span className="eyebrow">Try a request</span>
              <h2>Request body</h2>
            </div>
          </div>
          <div className="segmented small api-sample-tabs">
            {(Object.keys(SAMPLES) as SampleId[]).map((id) => (
              <button
                key={id}
                type="button"
                className={cx('segment', sample === id && 'is-active')}
                onClick={() => setSample(id)}
              >
                <strong>{SAMPLES[id].label}</strong>
              </button>
            ))}
          </div>
          <p className="api-sample-description">{SAMPLES[sample].description}</p>
          <div className="code-block">
            <div className="code-head">
              <span>
                <Braces size={13} /> JSON body
              </span>
              <CopyButton text={sampleBody} label="Copy request body" copiedLabel="Body copied" className="icon-button code-copy" />
            </div>
            <pre>{sampleBody}</pre>
          </div>
          <button
            type="button"
            className="api-payload-toggle"
            onClick={() => setOpenPayload((current) => !current)}
            aria-expanded={openPayload}
          >
            <ChevronDown size={15} className={cx('advanced-chevron', openPayload && 'is-open')} />
            {openPayload ? 'Hide' : 'Show'} response shape
          </button>
          {openPayload ? (
            <div className="code-block response-block">
              <div className="code-head">
                <span>
                  <UploadCloud size={13} /> 202 response
                </span>
                <CopyButton text={RESPONSE_SAMPLE} label="Copy response sample" copiedLabel="Response copied" className="icon-button code-copy" />
              </div>
              <pre>{RESPONSE_SAMPLE}</pre>
            </div>
          ) : null}
        </section>
      </div>

      <section className="card api-code-card">
        <div className="section-head row">
          <div>
            <span className="eyebrow">Copy, paste, run</span>
            <h2>Code examples</h2>
          </div>
          <div className="segmented small code-lang-tabs">
            {(['curl', 'javascript', 'python'] as CodeLang[]).map((item) => (
              <button
                key={item}
                type="button"
                className={cx('segment', lang === item && 'is-active')}
                onClick={() => setLang(item)}
              >
                <strong>{item === 'javascript' ? 'JavaScript' : item === 'python' ? 'Python' : 'cURL'}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="code-block code-large">
          <div className="code-head">
            <span>
              <Code2 size={13} /> {lang === 'javascript' ? 'fetch' : lang === 'python' ? 'requests' : 'terminal'}
            </span>
            <CopyButton text={code} label="Copy code" copiedLabel="Code copied" className="icon-button code-copy" />
          </div>
          <pre>{code}</pre>
        </div>
        <p className="api-code-foot">
          Replace <code>TASK_ID</code>, the sample link URLs, and <code>YOUR_API_TOKEN</code> with your own values.
          Searches run one at a time — additional tasks are queued automatically.
        </p>
      </section>

      <section className="card api-endpoints">
        <div className="section-head row">
          <div>
            <span className="eyebrow">Reference</span>
            <h2>Endpoints</h2>
          </div>
          <span className="count-pill">{ENDPOINTS.length} routes</span>
        </div>
        <div className="endpoint-list">
          {ENDPOINTS.map((endpoint) => {
            const Icon = endpoint.icon;
            return (
              <div className="endpoint-row" key={`${endpoint.method}-${endpoint.path}`}>
                <span className={cx('method-badge', `method-${endpoint.method.toLowerCase()}`)}>{endpoint.method}</span>
                <code className="endpoint-path">{endpoint.path}</code>
                <div className="endpoint-copy">
                  <strong>{endpoint.title}</strong>
                  <span>{endpoint.description}</span>
                </div>
                <span className="endpoint-icon">
                  <Icon size={16} />
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="api-bottom-grid">
        <section className="card api-options-card">
          <div className="section-head row">
            <div>
              <span className="eyebrow">Options</span>
              <h2>Search options</h2>
            </div>
          </div>
          <div className="api-option-list">
            <div>
              <code>maxResults</code>
              <span>1–100 for a normal search. Default 20.</span>
            </div>
            <div>
              <code>maxResultsPerCity</code>
              <span>1–50 per city for a country search. Default 10.</span>
            </div>
            <div>
              <code>reviews</code>
              <span>Collect review text. Slower and more reliable with a visible browser.</span>
            </div>
            <div>
              <code>maxReviews</code>
              <span>1–500 reviews per business when reviews are enabled.</span>
            </div>
            <div>
              <code>enrich</code>
              <span>Visit business websites to collect emails and social profiles. Default true.</span>
            </div>
            <div>
              <code>browserMode</code>
              <span>
                <code>auto</code>, <code>visible</code>, or <code>hidden</code>. Auto shows Chrome when reviews are on.
              </span>
            </div>
          </div>
        </section>

        <aside className="api-side">
          <InfoCallout tone="success" title="Data lives on this computer">
            The API reads and writes the same local JSON files as the app. There is no cloud service, account, or sync.
          </InfoCallout>
          <section className="card api-security-card">
            <span className="api-security-icon">
              <Lock size={20} />
            </span>
            <h2>Security notes</h2>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={14} /> Bound to 127.0.0.1 only.
              </li>
              <li>
                <CheckCircle2 size={14} /> Optional bearer token.
              </li>
              <li>
                <CheckCircle2 size={14} /> CORS allows local origins only.
              </li>
              <li>
                <CheckCircle2 size={14} /> No request body over 1 MB.
              </li>
            </ul>
            <Link to="/settings" className="text-button">
              Manage token &amp; port <ArrowRight size={13} />
            </Link>
          </section>
          <section className="card api-help-card">
            <span className="api-help-icon">
              <Play size={18} />
            </span>
            <h2>First request?</h2>
            <p>Start with the cURL health check, then create a small 5-lead search while you test your script.</p>
            <div className="api-health-code">
              <code>GET {base}/api/v1/health</code>
              <CopyButton
                text={`curl ${base}/api/v1/health`}
                label="Copy health check"
                copiedLabel="cURL copied"
                className="icon-button"
              />
            </div>
          </section>
        </aside>
      </div>

      <p className="api-legal">
        <ShieldCheck size={13} /> Use this API for lawful, research, and educational purposes. You are responsible for
        respecting Google’s Terms of Service and applicable data-protection and anti-spam laws.
      </p>
    </div>
  );
}
