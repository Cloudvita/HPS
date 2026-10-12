#!/usr/bin/env node
// Weekly news collector. Reads data/feeds.json, fetches each RSS feed,
// keeps the last 7 days of stories and writes data/news.json.
// Requires Node 18+ (built-in fetch). No npm dependencies.
//
// Optional: set NEWSAPI_KEY to also pull Reuters/WSJ tech stories from newsapi.org.

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const DAYS = 7;
const PER_SOURCE = 12;
const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

const { keywords, feeds } = JSON.parse(await readFile(new URL('data/feeds.json', ROOT), 'utf8'));
const kwRegex = new RegExp(`\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|")})\\b`, "i");
const isTech = (a) => kwRegex.test(`${a.title} ${a.summary}`);

const decode = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, '&');

const stripTags = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
};

function parseRss(xml, feed) {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return items.map((item) => {
    let title = stripTags(tag(item, 'title'));
    // Google News appends " - Publisher" to every headline
    title = title.replace(/\s+-\s+[^-]+$/, (m) => (feed.url.includes('news.google.com') ? '' : m));
    const summary = stripTags(tag(item, 'description')).slice(0, 280);
    return {
      title,
      link: tag(item, 'link'),
      published: new Date(tag(item, 'pubDate') || Date.now()).toISOString(),
      source: feed.id,
      sourceName: feed.name,
      // Google News descriptions just repeat the headline
      summary: feed.url.includes('news.google.com') ? '' : summary,
    };
  });
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0 (IT Career Hub news bot)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text(), feed);
}

async function fetchNewsApi(key) {
  const from = new Date(cutoff).toISOString().slice(0, 10);
  const url = `https://newsapi.org/v2/everything?domains=reuters.com,wsj.com&q=technology OR software OR AI&from=${from}&language=en&sortBy=publishedAt&pageSize=40`;
  const res = await fetch(url, { headers: { 'X-Api-Key': key } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { articles = [] } = await res.json();
  return articles.map((a) => {
    const isWsj = a.url?.includes('wsj.com');
    return {
      title: a.title,
      link: a.url,
      published: a.publishedAt,
      source: isWsj ? 'wsj' : 'reuters',
      sourceName: isWsj ? 'Wall Street Journal' : 'Reuters',
      summary: (a.description || '').slice(0, 280),
    };
  });
}

const all = [];
const errors = [];

for (const feed of feeds) {
  try {
    const items = await fetchFeed(feed);
    console.log(`✓ ${feed.name}: ${items.length} items`);
    all.push(...items);
  } catch (err) {
    console.warn(`✗ ${feed.name}: ${err.message}`);
    errors.push({ source: feed.id, error: err.message });
  }
}

if (process.env.NEWSAPI_KEY) {
  try {
    const items = await fetchNewsApi(process.env.NEWSAPI_KEY);
    console.log(`✓ NewsAPI: ${items.length} items`);
    all.push(...items);
  } catch (err) {
    console.warn(`✗ NewsAPI: ${err.message}`);
  }
}

// De-duplicate by normalised title, keep last 7 days, cap per source
const seen = new Set();
const perSource = {};
const articles = all
  .filter((a) => a.title && a.link && Date.parse(a.published) >= cutoff && isTech(a))
  .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
  .filter((a) => {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    perSource[a.source] = (perSource[a.source] || 0) + 1;
    return perSource[a.source] <= PER_SOURCE;
  });

if (!articles.length) {
  console.error('No articles fetched — leaving existing data/news.json untouched.');
  process.exit(1);
}

const out = { generatedAt: new Date().toISOString(), windowDays: DAYS, errors, articles };
await writeFile(new URL('data/news.json', ROOT), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${articles.length} articles to data/news.json`);
