// Shared feed logic used by both the browser (js/app.js) and the weekly
// updater (scripts/update-news.mjs). Plain ES module, no dependencies.
//
// Supported feed types:
//   hn    – Hacker News Search API (Algolia), JSON
//   devto – DEV Community / Forem API, JSON
//   rss   – RSS 2.0 XML
//   atom  – Atom XML

/** JSON APIs send CORS headers, so browsers can call them directly. */
export const isJsonFeed = (feed) => feed.type === 'hn' || feed.type === 'devto';

export function feedUrl(feed, windowDays) {
  const since = Math.floor(Date.now() / 1000) - windowDays * 86400;
  return feed.url.replace('{since}', since);
}

const decode = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const stripTags = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s = '', n = 240) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
};

function article(feed, { title, link, published, summary }) {
  return {
    title: stripTags(decode(title)),
    link,
    published: new Date(published || Date.now()).toISOString(),
    source: feed.id,
    sourceName: feed.name,
    summary: feed.showSummary === false ? '' : clip(stripTags(decode(summary))),
  };
}

/** Turn a feed response body (string) into article objects. */
export function parseFeed(feed, body) {
  switch (feed.type) {
    case 'hn':
      return JSON.parse(body).hits.map((h) => article(feed, {
        title: h.title,
        link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        published: h.created_at,
        summary: `${h.points} points · ${h.num_comments} comments on Hacker News`,
      }));
    case 'devto':
      return JSON.parse(body).map((a) => article(feed, {
        title: a.title,
        link: a.url,
        published: a.published_at,
        summary: `${a.description || ''} — by ${a.user?.name || 'DEV author'}`,
      }));
    case 'atom':
      return (body.match(/<entry[\s\S]*?<\/entry>/gi) || []).map((e) => article(feed, {
        title: tag(e, 'title'),
        link: (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || e.match(/<link[^>]*href="([^"]+)"/i) || [])[1],
        published: tag(e, 'published') || tag(e, 'updated'),
        summary: tag(e, 'summary') || tag(e, 'content'),
      }));
    default: // rss
      return (body.match(/<item[\s\S]*?<\/item>/gi) || []).map((i) => article(feed, {
        title: tag(i, 'title'),
        link: tag(i, 'link'),
        published: tag(i, 'pubDate') || tag(i, 'dc:date'),
        summary: tag(i, 'description'),
      }));
  }
}

/** Keep the time window, newest first, drop duplicates, cap per source. */
export function finalize(articles, { windowDays = 7, perSource = 12 } = {}) {
  const cutoff = Date.now() - windowDays * 86400000;
  const seen = new Set();
  const counts = {};
  return articles
    .filter((a) => a.title && a.link && Date.parse(a.published) >= cutoff)
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .filter((a) => {
      const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      counts[a.source] = (counts[a.source] || 0) + 1;
      return counts[a.source] <= perSource;
    });
}
