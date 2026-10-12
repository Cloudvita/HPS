# IT Launchpad

A simple static website (HTML + CSS + vanilla JavaScript, no build step) for fresh entrants to the IT industry and for school students:

- **Industry News**: a weekly tech digest built only from open APIs and openly licensed feeds
- **Personal Blog**: posts stored in `data/posts.json`
- **Career Guide**: five career tracks with 6-month plans, a job-ready checklist, interview prep and free resources
- **Student Resources**: SAT, Middle & High School Math and Robotics tutoring, a contact form that emails each enquiry, and free practice links

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
| `js/feeds-core.js` | Shared parsing for JSON APIs, RSS and Atom. The weekly script and the browser both use it. |
| `scripts/update-news.mjs` | Node 18+ script with no dependencies. Fetches every source in `data/feeds.json`, keeps the last 7 days, removes duplicates and writes `data/news.json`. |
| `.github/workflows/weekly-news.yml` | Runs the script **every Monday** and commits the new `news.json`. |
| **↻ Refresh live** | Fetches Hacker News and DEV directly in the browser (both APIs allow cross-origin requests). The page also does this on its own when `news.json` is more than 7 days old. RSS sources need the optional proxy in `proxy/worker.js`; without it they keep their weekly stories. |

Run the update yourself any time with `node scripts/update-news.mjs`.

### Sources and licences

These sources were chosen to keep IP risk low. They are either openly licensed or public APIs that are meant to be reused, and the site shows only headlines, short excerpts and links back.

| Source | Type | Licence or terms |
|---|---|---|
| [Hacker News](https://hn.algolia.com/api) | Public JSON API (Algolia) | Titles and links; free public API, no key |
| [DEV Community](https://developers.forem.com/api) | Public JSON API (Forem), `#career` tag | Titles and excerpts; free public API, no key |
| [The Conversation](https://theconversation.com/republishing-guidelines) | Atom feed, AI topic | CC BY-ND 4.0 (shown as title and link only, no excerpt) |
| [Global Voices](https://globalvoices.org/about/global-voices-attribution-policy/) | RSS, Technology topic | CC BY 3.0 |

The footer credits each source and its licence automatically. To add a source, add an entry to `data/feeds.json` with a `type` of `rss`, `atom`, `hn` or `devto`.

## Student contact form

Enquiries are delivered by email through [FormSubmit](https://formsubmit.co), so no backend is needed.

The page source never contains your real email address. Instead, `CONFIG.contactEndpoint` in `js/app.js` uses a FormSubmit alias. To set one up:

1. **Activate (one time).** Send a single request to `https://formsubmit.co/ajax/<your-email>` from your own machine. Don't commit the address. FormSubmit then emails you an *Activate Form* link; click it.
2. **Use the alias.** The confirmation gives you a random alias string. Set `contactEndpoint` to `https://formsubmit.co/ajax/<alias>`. Until you do, the form shows a "temporarily unavailable" message.
3. Each email lists the name, phone, email, program and description, and **Reply** goes straight to the person who filled in the form.
4. After a successful submission, visitors see: *"Thank you! Your request has been received. One of our support personnel will contact you shortly."*

A hidden honeypot field filters out simple spam bots.

## Customise

- **Blog posts**: add entries to `data/posts.json`. The `body` field accepts HTML.
- **News sources**: edit `data/feeds.json`. Both the script and the browser read this file.
- **Tutoring programs**: edit the Student Resources section in `index.html`.
- **Career content**: edit `js/careers.js`.
- **Branding**: edit `index.html`.
- **Colours**: edit the CSS variables at the top of `css/styles.css`. Light and dark themes are included.

## Deploy on GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages** and choose to deploy from the `main` branch, root folder.
3. Go to **Settings → Actions → General** and set workflow permissions to **Read and write**.
4. Optionally run **Actions → Weekly news update → Run workflow** once to check that it works.
