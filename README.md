# Step in Scraper

**Google Maps lead finder** — a polished, beginner-friendly desktop app that turns Google Maps searches into clean, exportable business lead lists.

Find local customers on the map. Type a search like *“dentists in Austin”*, paste Google Maps business links, or run one business type across many cities in a country. Collect names, addresses, phones, websites, ratings, reviews, emails, and social profiles — then export everything to a spreadsheet.

Built for educational, research, and lawful lead generation use only. You are responsible for how you use the data.

## What it does

- **Search Google Maps** — business type + place (e.g. “plumbers in Seattle, WA”), one or more Google Maps links, or multi-city searches across a country.
- **Collect business details** — name, category, address, phone, website, rating, review count, Google Maps link, place ID, hours, plus code, coordinates.
- **Optional review scraping** — full review text and owner replies (visible Chrome window; signed-out Google shows ~5 public reviews per business).
- **Email & social enrichment** — visits each website to find contact emails and social profiles (Facebook, Instagram, LinkedIn, X/Twitter, YouTube, TikTok).
- **Live progress** — watch searches run in real time with logs, counts, and notifications.
- **Task history** — every search is saved automatically on your PC. Reopen, rerun, export, or delete past searches.
- **CSV export** — Excel-ready CSV with formula-injection protection and UTF-8 BOM. Export leads or reviews separately.
- **Local REST API** — control Step in Scraper from your own scripts, Sheets, or apps. Runs only on this computer (`127.0.0.1`), never exposed to your network.
- **No code required** — install and run like any desktop app. Your data stays on your computer; there is no cloud service, no account, and no tracking.

## Visual theme

Deep forest green (`#1a4a3a`) + lime (`#a3d635`) design system with Inter and Plus Jakarta Sans typefaces.

## Requirements

- Windows 10/11
- Google Chrome installed (Step in Scraper drives Chrome on your computer using its own private profile; no setup needed)
- No coding, no API keys, no Google account required for normal searching

## Installation

### Installer (recommended)

Download `StepInScraper-1.0.0-x64.exe` from the [Releases](https://github.com/) page, run it, and launch Step in Scraper from the Start menu or desktop shortcut. The installer is per-user (no admin rights required) and creates a Start Menu shortcut.

### Portable

Download `StepInScraper-Portable-1.0.0.exe`, run it from anywhere (USB drive, Downloads folder, etc.), and close it when you're done. No installation or registry changes.

Both packages include everything needed — just Chrome must already be installed.

### First launch

1. Open Step in Scraper. A welcome tour appears (you can skip it or reset it later in Settings).
2. On the **New search** page, type a search like `dentists in Austin, TX` and click **Run**.
3. Watch the leads arrive live. When finished, open a business to see its reviews, or click **Export CSV** to download a spreadsheet.

## Using the app

### New search (Home)

Choose one of three modes:

1. **Search Maps** — type what and where (e.g. “dentists in Austin, TX”). Business type + place works best.
2. **Paste links** — paste one or more Google Maps business links.
3. **Multi-city** — pick one business type and several cities in a country. Step in Scraper runs the same search in each city and combines the leads.

Then set how much to collect:

- **Maximum leads** (1–100 per search; default 20)
- **Collect reviews** — slower, but adds full review text and owner replies
- **Reviews per business** (up to 500; default 20)
- **Find emails & social profiles** — visits websites to find contact details

Click **Run**. A task is created and starts automatically. You can leave the page or even close the app — results save automatically, and you can reopen the task later from **Task history**.

### Task history

Every search is saved on this computer. From **Task history** you can:

- See all searches with lead counts, emails found, status, and average rating
- Filter by All searches / In progress / Completed / Needs attention
- Search and sort the list
- Open a finished task to review leads, filter, sort, copy emails, and export CSV
- Rerun a search, export it again, delete it, or clear all history

### Results page

- **Live panel** — progress ring, counts (leads, emails, websites, rating, reviews), and latest finds while a search runs
- **Notices** — warnings such as “Google was signed out, so only the first 5 public reviews per business were collected”
- **Table** — search, sort, and filter leads (All leads / Has email / Has website / Has phone / Reviews)
- **Business detail drawer** — open any lead to see emails, phone, website, address, hours, coordinates, social profiles, reviews (full text + owner replies), and a link to open the business in Google Maps
- **Activity log** — everything that happened during the search

### Guide

The **Guide** page walks you through:

- Three steps to a clean list
- How a search becomes a spreadsheet (search → strategies → filters → profiles → reviews → enrichment → fields → export)
- Every field explained
- Reviews, multi-city searches, and staying within Google’s limits
- Common fixes (Chrome not found, no businesses found, captcha, reviews missing or limited, emails not found)
- FAQ (Do I need a Google account? Where is my data stored? Is this allowed?)

### Local API

Step in Scraper includes a small REST API (`http://127.0.0.1:4319`) so you can control it from scripts, Sheets, or other apps. The API listens only on this computer and is never exposed to your network.

Open the **Local API** page for:

- Base URL and status
- A “try a request” JSON body builder
- Copy-paste-run cURL, JavaScript, and Python examples
- A full endpoint reference (health, tasks CRUD, results, cancel, rerun, export CSV, metadata)
- Search options reference
- Security notes (bound to 127.0.0.1 only, optional bearer token, 1 MB request body)

Quick example (cURL):

```bash
curl -X POST http://127.0.0.1:4319/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"mode":"search","query":"dentists in Austin, TX","options":{"maxResults":20,"reviews":false,"enrich":true}}'
```

Then poll `GET /api/v1/tasks/:id` until `status` is `completed`, and download results with `GET /api/v1/tasks/:id/results` or `/export`.

An optional bearer token can be set in **Settings → Local API** to protect the API if you share this computer.

### Settings

- **Browser & Google** — Chrome detection, optional Google sign-in for more reviews (separate persistent Chrome profile; sign in in a normal browser window, then check connection here)
- **Search defaults** — max leads, leads per city, collect reviews by default, reviews per business, find emails & socials by default
- **How Chrome appears** — Auto (hides Chrome for normal searches, shows it for reviews), Visible, or Hidden
- **Local API** — port, bearer token, token protection help
- **Data & storage** — open your data folder, Chrome profile folder, or default export folder; clear all search history
- **Reset welcome tour** — show the onboarding again

## Data & privacy

- Everything lives on **this computer only** under `%APPDATA%\Step in Scraper\data` (one JSON file per search plus an index; no database, no native modules).
- There is **no cloud service, no account, and no tracking**. Step in Scraper reads publicly visible Google Maps business information.
- Chrome is driven using its own private profile, separate from your daily browsing.
- Exports save to your Documents folder (or wherever you choose in the save dialog).

## Limitations (read before you rely on it)

- Step in Scraper uses **publicly visible** Google Maps information only. It does not bypass logins, paywalls, or private data.
- **Signed-out Google shows about 5 public reviews per business.** Connect a Google account in Settings for more reliable review collection (full text + owner replies).
- Review collection requires a **visible Chrome window**; normal searches can run hidden.
- Google may show a CAPTCHA or throttle automated traffic. Pause 10–15 minutes if that happens, keep lead numbers modest (10–30 per search is plenty), and avoid repeated identical searches.
- Not every business publishes a website or email. Emails are found by visiting websites, so businesses without websites yield no email.
- Results should be **verified before contacting anyone**. Follow Google’s Terms of Service, applicable privacy and data-protection laws, and anti-spam regulations. Only contact people with a legitimate reason.
- **Educational, research, and lawful lead generation use only.** You are responsible for how you use the data.

## Tech stack

- Electron 37 + React 19 + Vite 7 + TypeScript
- Custom CSS design system (forest green + lime)
- `playwright-core` driving installed Google Chrome
- Local JSON storage under `%APPDATA%\Step in Scraper\data`
- Local REST API on `127.0.0.1:4319` (Express)
- Packaged with electron-builder (NSIS + portable, code signing skipped — unsigned installer)

## Uninstall

Use **Add or remove programs** (Settings → Apps → Installed apps → Step in Scraper → Uninstall), or run the uninstaller from the Start Menu shortcut folder. Your data folder (`%APPDATA%\Step in Scraper\data`) is left in place so you can keep your search history; delete it manually if you want to remove all local data.

## License

MIT

---

Step in Scraper v1.0.0 · local-first · built for lawful lead generation