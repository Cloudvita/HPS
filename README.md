# IT Launchpad

A simple static website (HTML + CSS + vanilla JavaScript, no build step) for fresh entrants to the IT industry:

- **Industry News**: a weekly digest of IT and tech headlines from Reuters, PTI, Yahoo Finance and the Wall Street Journal
- **Personal Blog**: posts stored in `data/posts.json`
- **Career Guide**: five career tracks with 6-month plans, a job-ready checklist, interview prep and free resources

## Run locally

Browsers block `fetch()` on `file://` URLs, so serve the folder:

```bash
cd it-career-hub
python3 -m http.server 8080
```

Then open http://localhost:8080.

## How the news updates

| Layer | What it does |
|---|---|
| `scripts/update-news.mjs` | Node 18+ script with no dependencies. Fetches every feed in `data/feeds.json`, keeps the last 7 days, filters to tech keywords, removes duplicates and writes `data/news.json`. |
| `.github/workflows/weekly-news.yml` | Runs the script **every Monday** and commits the new `news.json`. Hosting on GitHub Pages, Netlify or Vercel then redeploys the site automatically. |
| Optional live refresh | Deploy `proxy/worker.js` as a free Cloudflare Worker and set `CONFIG.rssProxy` in `js/app.js`. The **↻ Refresh live** button then appears, and the page fetches the feeds itself whenever `news.json` is more than 7 days old. Results are cached in localStorage. |

Run the update yourself any time with `node scripts/update-news.mjs`.

> Why a Worker proxy? Browsers block cross-origin RSS requests. Free public proxies (rss2json, allorigins, codetabs and similar) were all failing or rate-limited when this site was tested in October 2026. The Worker only proxies the hosts listed in `feeds.json`.

### About the sources

| Source | Feed used | Why |
|---|---|---|
| Yahoo Finance | Official RSS (`feeds.finance.yahoo.com`), filtered by tech tickers | Public RSS feed |
| Reuters | Google News RSS, `site:reuters.com` | Reuters retired its public RSS feeds in 2020 |
| PTI | Google News RSS, `site:ptinews.com` | PTI does not publish a free API or RSS feed |
| WSJ | Google News RSS, `site:wsj.com` | WSJ's own `feeds.a.dj.com` RSS has not updated since January 2025 |

**Optional:** add a [NewsAPI.org](https://newsapi.org) key as the repository secret `NEWSAPI_KEY` to pull extra Reuters and WSJ stories. The free NewsAPI plan only allows requests from localhost and development use, so check its terms before relying on it in production.

The site shows only headlines and short summaries, and each one links to the original publisher.

## Customise

- **Blog posts**: add entries to `data/posts.json`. The `body` field accepts HTML.
- **Sources and keywords**: edit `data/feeds.json`. Both the script and the browser read this file.
- **Career content**: edit `js/careers.js`.
- **About section and branding**: edit `index.html`.
- **Colours**: edit the CSS variables at the top of `css/styles.css`. Light and dark themes are included.

## Deploy on GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages** and choose to deploy from the `main` branch, root folder.
3. Go to **Settings → Actions → General** and set workflow permissions to **Read and write**.
4. Optionally run **Actions → Weekly news update → Run workflow** once to check that it works.
