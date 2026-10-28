import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Chrome,
  CircleHelp,
  Compass,
  Download,
  Filter,
  Globe2,
  Layers,
  Link2,
  Mail,
  MapPin,
  MessageSquareQuote,
  MousePointerClick,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  TriangleAlert,
  UserRoundSearch,
  Wand2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { InfoCallout } from '@/components/InfoCallout';
import { useSystem } from '@/lib/system-context';

const QUICKSTART = [
  {
    number: '01',
    icon: Search,
    title: 'Describe the businesses you want',
    body: 'Use a plain-English search such as “dentists in Austin, TX”. You can also paste Google Maps business links, or search one business type across many cities in a country.',
    tip: 'Best results: niche + city + state or country.',
  },
  {
    number: '02',
    icon: MousePointerClick,
    title: 'Press Start and let Chrome work',
    body: 'Step in Scraper opens Google Chrome and collects the public business profile. With enrichment on, it also visits each website to look for emails and social profiles.',
    tip: 'Keep the Chrome window open until the search finishes.',
  },
  {
    number: '03',
    icon: Download,
    title: 'Filter, open, and export',
    body: 'Search inside your results, focus on leads with an email, open a business for reviews and full contact details, then export a CSV that opens straight in Excel or Google Sheets.',
    tip: 'Export leads and reviews as separate spreadsheets.',
  },
];

const PIPELINE = [
  { icon: Search, label: 'Business search', note: 'Maps query, links, or cities' },
  { icon: Layers, label: 'Strategies', note: 'Batch and scroll' },
  { icon: Filter, label: 'Filters', note: 'Remove duplicates' },
  { icon: UserRoundSearch, label: 'Profiles', note: 'Details & contact' },
  { icon: MessageSquareQuote, label: 'Reviews', note: 'Optional collection' },
  { icon: Globe2, label: 'Enrichment', note: 'Emails & socials' },
  { icon: Table2, label: 'Fields', note: 'Clean, consistent data' },
  { icon: Download, label: 'Export', note: 'CSV for your tools' },
];

const FIELDS = [
  {
    icon: Building2,
    title: 'Business name & category',
    body: 'The public name and primary category shown on the Google Maps profile.',
  },
  {
    icon: MapPin,
    title: 'Address & plus code',
    body: 'Full street address, plus code, and coordinates when Google provides them.',
  },
  {
    icon: Mail,
    title: 'Phone, website & email',
    body: 'Phone and website come from Maps. Emails are found by checking the business website.',
  },
  {
    icon: Star,
    title: 'Rating & review count',
    body: 'The average star rating and total number of Google reviews at the time of collection.',
  },
  {
    icon: Globe2,
    title: 'Social profiles',
    body: 'Links to Facebook, Instagram, LinkedIn, X, YouTube, or TikTok found on the website.',
  },
  {
    icon: MessageSquareQuote,
    title: 'Review text & replies',
    body: 'Optional: review author, rating, date, full text, and any owner response.',
  },
  {
    icon: Link2,
    title: 'Google Maps link',
    body: 'A direct link back to the business profile so you can verify every lead.',
  },
  {
    icon: Compass,
    title: 'Source & timestamp',
    body: 'The query that found the business and when it was collected, for clean record-keeping.',
  },
];

const TROUBLESHOOTING = [
  {
    title: 'Chrome is not found',
    body: 'Install Google Chrome from google.com/chrome, then restart Step in Scraper. Microsoft Edge is also supported when it is detected.',
    icon: Chrome,
  },
  {
    title: 'No businesses were found',
    body: 'Try a broader search, remove the city from the query, or switch to a nearby larger city. You can also paste a direct Maps link.',
    icon: Search,
  },
  {
    title: 'Google is asking for a captcha',
    body: 'Google is limiting automated traffic. Wait 10–15 minutes, reduce the number of leads, keep Chrome visible, and avoid running several searches at once.',
    icon: TriangleAlert,
  },
  {
    title: 'Reviews are missing or limited',
    body: 'Signed-out Google shows about 5 public reviews per business. Connect a Google account in Settings, keep the browser visible, and use Auto browser mode.',
    icon: MessageSquareQuote,
  },
  {
    title: 'Chrome profile is already in use',
    body: 'Step in Scraper uses its own Chrome profile. Close any Chrome window that Step in Scraper opened, then run the search again.',
    icon: Layers,
  },
  {
    title: 'Emails were not found',
    body: 'Not every business publishes an email. Try opening the lead’s website or social profile manually before ruling it out.',
    icon: Mail,
  },
];

const FAQS = [
  {
    question: 'Do I need a Google account?',
    answer:
      'No. A normal search and enrichment work without signing in. A Google account is only useful for collecting more than the handful of public reviews Google shows to signed-out visitors.',
  },
  {
    question: 'Where is my data stored?',
    answer:
      'Everything is saved as JSON files in Step in Scraper’s local app-data folder on this computer. Nothing is sent to a Step in Scraper server. You can open the folder from Settings.',
  },
  {
    question: 'How many leads can I collect?',
    answer:
      'Up to 100 per search, or up to 50 per city for a multi-city search. A single task is capped at 500 businesses. Google Maps itself usually stops returning new results somewhere near 120 per query.',
  },
  {
    question: 'Is this allowed?',
    answer:
      'Step in Scraper is for educational, research, and lawful lead generation use. You are responsible for following Google’s Terms of Service and applicable privacy, data-protection, and anti-spam laws. Collect only public business information and contact people who have a legitimate reason to hear from you.',
  },
  {
    question: 'Can I use the results commercially?',
    answer:
      'You may use publicly available business information for legitimate outreach where the law allows it. Always verify details, honour opt-outs, and avoid bulk unsolicited messages that violate anti-spam rules.',
  },
  {
    question: 'Why does a search take a while?',
    answer:
      'Each business profile is opened to read its details. Review collection and website enrichment add more page visits. A typical 20-lead search takes a few minutes, depending on your connection and Google’s response time.',
  },
];

export function GuidePage() {
  const { info } = useSystem();
  return (
    <div className="page guide-page">
      <PageHeader
        eyebrow="Guide"
        title={
          <>
            Your first lead list, <span className="title-accent">step by step.</span>
          </>
        }
        description="A practical guide to searching, reviewing, and exporting local business leads — plus the details behind each field."
        actions={
          <Link to="/" className="btn btn-primary">
            <Search size={16} /> Start a search
          </Link>
        }
      />

      <section className="guide-intro card">
        <div className="guide-intro-main">
          <span className="guide-intro-icon">
            <BookOpen size={24} />
          </span>
          <div>
            <h2>No coding. No setup. Just Chrome.</h2>
            <p>
              Step in Scraper is a desktop app that reads public Google Maps business profiles and turns them into a tidy
              spreadsheet. This page explains how to get the best results and what to do when something looks off.
            </p>
          </div>
        </div>
        <div className="guide-intro-chips">
          <span>
            <Chrome size={14} /> {info?.chrome?.found ? 'Chrome detected' : 'Chrome needed'}
          </span>
          <span>
            <ShieldCheck size={14} /> Local-first storage
          </span>
          <span>
            <Table2 size={14} /> CSV export built in
          </span>
        </div>
      </section>

      <div className="section-head">
        <div>
          <span className="eyebrow">Quick start</span>
          <h2>Three steps to a clean list</h2>
        </div>
        <Link to="/" className="text-button">
          Try it now <ArrowRight size={14} />
        </Link>
      </div>

      <div className="quickstart-grid">
        {QUICKSTART.map((step) => {
          const Icon = step.icon;
          return (
            <article className="quickstart-card card" key={step.number}>
              <div className="quickstart-top">
                <span className="quickstart-number">{step.number}</span>
                <span className="quickstart-icon">
                  <Icon size={19} />
                </span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="quickstart-tip">
                <Sparkles size={13} /> {step.tip}
              </span>
            </article>
          );
        })}
      </div>

      <section className="card pipeline-card">
        <div className="section-head row">
          <div>
            <span className="eyebrow">Under the hood</span>
            <h2>How a search becomes a spreadsheet</h2>
          </div>
          <span className="pipeline-note">
            <Wand2 size={14} /> Fully automatic
          </span>
        </div>
        <div className="pipeline">
          {PIPELINE.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <div className="pipeline-stage" key={stage.label}>
                <span className="pipeline-index">{index + 1}</span>
                <span className="pipeline-icon">
                  <Icon size={18} />
                </span>
                <strong>{stage.label}</strong>
                <small>{stage.note}</small>
                {index < PIPELINE.length - 1 ? <span className="pipeline-arrow">→</span> : null}
              </div>
            );
          })}
        </div>
        <p className="pipeline-caption">
          A single search uses a private Chrome profile, visits Google Maps, opens each business profile, optionally
          collects reviews, checks websites for contact details, and then saves everything locally so you can export it.
        </p>
      </section>

      <div className="guide-grid-two">
        <section className="card guide-panel">
          <div className="section-head row">
            <div>
              <span className="eyebrow">What you get</span>
              <h2>Every field, explained</h2>
            </div>
          </div>
          <div className="field-list">
            {FIELDS.map((field) => {
              const Icon = field.icon;
              return (
                <div className="field-item" key={field.title}>
                  <span className="field-item-icon">
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{field.title}</strong>
                    <p>{field.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="guide-side">
          <section className="card guide-tip-card">
            <span className="guide-tip-icon">
              <MessageSquareQuote size={20} />
            </span>
            <h2>About reviews</h2>
            <p>
              When you enable <strong>Collect reviews</strong>, Step in Scraper opens each business’s Reviews tab and saves the
              text, star rating, author, and owner replies.
            </p>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={14} /> Public preview: about 5 reviews per business.
              </li>
              <li>
                <CheckCircle2 size={14} /> More results with a connected Google account.
              </li>
              <li>
                <CheckCircle2 size={14} /> Visible Chrome gives the most reliable results.
              </li>
            </ul>
            <Link to="/settings" className="btn btn-soft btn-sm">
              Connect Google in Settings <ArrowRight size={14} />
            </Link>
          </section>

          <section className="card guide-tip-card is-lime">
            <span className="guide-tip-icon">
              <Globe2 size={20} />
            </span>
            <h2>Multi-city searches</h2>
            <p>
              Pick a business type and a country, then tick every city you want. Step in Scraper runs the same search in each
              one and combines the leads into one task.
            </p>
            <ul className="check-list">
              <li>
                <CheckCircle2 size={14} /> Start with 3–5 cities, then expand.
              </li>
              <li>
                <CheckCircle2 size={14} /> Leads per city keeps runtime predictable.
              </li>
              <li>
                <CheckCircle2 size={14} /> Add any city that is not in the list.
              </li>
            </ul>
          </section>

          <InfoCallout tone="warning" title="Tips to stay under Google’s limits">
            <ul className="callout-list">
              <li>Run one search at a time; the app queues the rest.</li>
              <li>Keep the number of leads modest (10–30 is plenty to start).</li>
              <li>Avoid repeated identical searches back to back.</li>
              <li>Pause for 10–15 minutes if Google shows a captcha.</li>
            </ul>
          </InfoCallout>
        </div>
      </div>

      <div className="section-head">
        <div>
          <span className="eyebrow">If something goes wrong</span>
          <h2>Common fixes</h2>
        </div>
      </div>

      <div className="troubleshoot-grid">
        {TROUBLESHOOTING.map((item) => {
          const Icon = item.icon;
          return (
            <article className="troubleshoot-card card" key={item.title}>
              <span className="troubleshoot-icon">
                <Icon size={18} />
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="guide-grid-two faq-section">
        <section className="card faq-card">
          <div className="section-head row">
            <div>
              <span className="eyebrow">Questions</span>
              <h2>Frequently asked</h2>
            </div>
            <span className="guide-faq-icon">
              <CircleHelp size={20} />
            </span>
          </div>
          <div className="faq-list">
            {FAQS.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>
                  {faq.question}
                  <span className="faq-plus">+</span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <aside className="guide-side">
          <InfoCallout tone="legal" title="Use Step in Scraper responsibly">
            Step in Scraper is for educational, research, and lawful lead generation only. You are responsible for following
            Google’s Terms of Service, applicable privacy and data-protection laws, and anti-spam regulations. Only
            contact people who have a legitimate reason to hear from you.
          </InfoCallout>

          <section className="card guide-cta">
            <span className="guide-cta-art" aria-hidden="true">
              <MapPin size={26} />
            </span>
            <h2>Ready to find your first leads?</h2>
            <p>A 10-lead search is a great place to start. You can always run more later.</p>
            <Link to="/" className="btn btn-primary">
              <Search size={16} /> Start a search
            </Link>
            <Link to="/api" className="text-button">
              Explore the local API <ArrowRight size={13} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
