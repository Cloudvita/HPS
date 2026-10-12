#!/usr/bin/env node
// Weekly news collector. Reads data/feeds.json, fetches every open feed/API,
// keeps the last week of stories and writes data/news.json.
// Requires Node 18+ (built-in fetch). No npm dependencies.

import { readFile, writeFile } from 'node:fs/promises';
import { feedUrl, parseFeed, finalize } from '../js/feeds-core.js';

const ROOT = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('data/feeds.json', ROOT), 'utf8'));

const all = [];
const errors = [];

for (const feed of config.feeds) {
  try {
    const res = await fetch(feedUrl(feed, config.windowDays), {
      headers: { 'User-Agent': 'Mozilla/5.0 (IT Launchpad news bot)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(feed, await res.text());
    console.log(`✓ ${feed.name}: ${items.length} items`);
    all.push(...items);
  } catch (err) {
    console.warn(`✗ ${feed.name}: ${err.message}`);
    errors.push({ source: feed.id, error: err.message });
  }
}

const articles = finalize(all, config);

if (!articles.length) {
  console.error('No articles fetched — leaving existing data/news.json untouched.');
  process.exit(1);
}

const out = { generatedAt: new Date().toISOString(), windowDays: config.windowDays, errors, articles };
await writeFile(new URL('data/news.json', ROOT), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${articles.length} articles to data/news.json`);
