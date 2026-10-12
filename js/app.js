// IT Launchpad — front-end logic (vanilla JS, no build step)

const CONFIG = {
  newsUrl: 'data/news.json',
  feedsUrl: 'data/feeds.json',
  postsUrl: 'data/posts.json',
  // Optional: URL of your deployed proxy/worker.js (e.g. 'https://itl-news.<you>.workers.dev/?url=').
  // RSS feeds block cross-origin requests, so in-browser "Refresh live" needs it.
  // Leave empty to rely only on the weekly GitHub Action that rewrites data/news.json.
  rssProxy: '',
  maxAgeDays: 7,       // auto-refresh in the browser when data is older than this
  pageSize: 12,
  perSource: 12,
};

const SOURCE_COLORS = { reuters: 'var(--src-reuters)', pti: 'var(--src-pti)', yahoo: 'var(--src-yahoo)', wsj: 'var(--src-wsj)' };
const LIVE_CACHE_KEY = 'itl-live-news';
const $ = (sel) => document.querySelector(sel);

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ } },
};

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripTags = (s = '') => new DOMParser().parseFromString(s, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();

function timeAgo(iso) {
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.round(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ---------------- Theme & nav ---------------- */
function initTheme() {
  const saved = store.get('itl-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  $('#themeToggle').addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('itl-theme', next);
  });
  const toggle = $('.nav-toggle');
  const links = $('.nav-links');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  links.addEventListener('click', (e) => { if (e.target.tagName === 'A') links.classList.remove('open'); });
}

/* ---------------- News ---------------- */
const news = { all: [], feeds: [], keywords: null, source: 'all', query: '', shown: CONFIG.pageSize, generatedAt: null, live: false };

async function loadNews() {
  $('#newsGrid').innerHTML = Array(6).fill('<div class="card skeleton"></div>').join('');
  const [feedCfg, data] = await Promise.all([
    fetch(CONFIG.feedsUrl).then((r) => r.json()),
    fetch(CONFIG.newsUrl, { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({ articles: [] })),
  ]);
  news.feeds = feedCfg.feeds;
  news.keywords = new RegExp(`\\b(${feedCfg.keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
  setNews(data.articles, data.generatedAt, false);

  // Prefer a newer live cache saved by this browser
  const cached = store.get(LIVE_CACHE_KEY);
  if (cached && Date.parse(cached.generatedAt) > Date.parse(data.generatedAt || 0)) {
    setNews(cached.articles, cached.generatedAt, true);
  }
  // Weekly auto-update: if what we have is older than maxAgeDays, refresh live
  const age = Date.now() - Date.parse(news.generatedAt || 0);
  if (age > CONFIG.maxAgeDays * 86400000) {
    if (CONFIG.rssProxy) refreshLive();
    else $('#newsMeta').textContent += ' · this digest is more than a week old';
  }
}

function setNews(articles, generatedAt, live) {
  news.all = articles || [];
  news.generatedAt = generatedAt;
  news.live = live;
  news.shown = CONFIG.pageSize;
  $('#statNews').textContent = news.all.length;
  renderChips();
  renderNews();
  const when = generatedAt ? new Date(generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
  $('#newsMeta').textContent = `Last 7 days of IT & tech headlines · updated ${when}${live ? ' (live refresh)' : ''}`;
}

function renderChips() {
  const counts = news.all.reduce((m, a) => ((m[a.source] = (m[a.source] || 0) + 1), m), {});
  const chips = [{ id: 'all', name: 'All sources' }, ...news.feeds];
  $('#sourceChips').innerHTML = chips.map((f) => `
    <button class="chip" role="tab" data-source="${f.id}" aria-selected="${news.source === f.id}">
      ${escapeHtml(f.name)}<span class="count">${f.id === 'all' ? news.all.length : counts[f.id] || 0}</span>
    </button>`).join('');
}

function renderNews() {
  const q = news.query.toLowerCase();
  const list = news.all.filter((a) =>
    (news.source === 'all' || a.source === news.source) &&
    (!q || `${a.title} ${a.summary}`.toLowerCase().includes(q)));
  const grid = $('#newsGrid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty">No stories match. Try another source or search term.</div>';
  } else {
    grid.innerHTML = list.slice(0, news.shown).map((a) => `
      <article class="card news-card">
        <span class="badge" style="--dot:${SOURCE_COLORS[a.source] || 'var(--primary)'}">${escapeHtml(a.sourceName)}</span>
        <h3><a href="${escapeHtml(a.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a></h3>
        ${a.summary ? `<p>${escapeHtml(a.summary)}</p>` : ''}
        <div class="news-meta"><time datetime="${a.published}">${timeAgo(a.published)}</time><span>Read ↗</span></div>
      </article>`).join('');
  }
  $('#moreNews').hidden = list.length <= news.shown;
}

async function fetchFeedLive(feed) {
  const res = await fetch(CONFIG.rssProxy + encodeURIComponent(feed.url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
  const isGoogle = feed.url.includes('news.google.com');
  return [...xml.querySelectorAll('item')].map((item) => {
    const get = (tag) => item.querySelector(tag)?.textContent.trim() || '';
    const title = get('title');
    return {
      title: isGoogle ? title.replace(/\s+-\s+[^-]+$/, '') : title,
      link: get('link'),
      published: new Date(get('pubDate') || Date.now()).toISOString(),
      source: feed.id,
      sourceName: feed.name,
      summary: isGoogle ? '' : stripTags(get('description')).slice(0, 280),
    };
  });
}

async function refreshLive() {
  const btn = $('#refreshNews');
  btn.disabled = true;
  btn.textContent = '↻ Refreshing…';
  try {
    const results = await Promise.allSettled(news.feeds.map(fetchFeedLive));
    const cutoff = Date.now() - 7 * 86400000;
    const seen = new Set();
    const perSource = {};
    const articles = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((a) => a.title && Date.parse(a.published) >= cutoff && news.keywords.test(`${a.title} ${a.summary}`))
      .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
      .filter((a) => {
        const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        perSource[a.source] = (perSource[a.source] || 0) + 1;
        return perSource[a.source] <= CONFIG.perSource;
      });
    if (!articles.length) throw new Error('No articles returned');
    const payload = { generatedAt: new Date().toISOString(), articles };
    store.set(LIVE_CACHE_KEY, payload);
    setNews(articles, payload.generatedAt, true);
  } catch (err) {
    console.warn('Live refresh failed:', err);
    $('#newsMeta').textContent += ' · live refresh unavailable right now';
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Refresh live';
  }
}

function initNews() {
  $('#sourceChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    news.source = chip.dataset.source;
    news.shown = CONFIG.pageSize;
    renderChips();
    renderNews();
  });
  $('#newsSearch').addEventListener('input', (e) => { news.query = e.target.value.trim(); news.shown = CONFIG.pageSize; renderNews(); });
  $('#moreNews').addEventListener('click', () => { news.shown += CONFIG.pageSize; renderNews(); });
  $('#refreshNews').hidden = !CONFIG.rssProxy;
  $('#refreshNews').addEventListener('click', refreshLive);
  loadNews().catch((err) => {
    console.error(err);
    $('#newsGrid').innerHTML = '<div class="empty">Couldn\'t load news. If you opened the file directly, serve the folder with a local web server.</div>';
    $('#newsMeta').textContent = '';
  });
}

/* ---------------- Blog ---------------- */
async function initBlog() {
  const posts = await fetch(CONFIG.postsUrl).then((r) => r.json()).catch(() => []);
  posts.sort((a, b) => b.date.localeCompare(a.date));
  $('#blogGrid').innerHTML = posts.map((p) => `
    <button class="card post-card" data-id="${p.id}">
      <div class="tags">${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.excerpt)}</p>
      <span class="muted small">${new Date(p.date + 'T00:00').toLocaleDateString(undefined, { dateStyle: 'medium' })} · ${p.readMins} min read</span>
    </button>`).join('') || '<div class="empty">No posts yet.</div>';

  const dialog = $('#postDialog');
  const open = (id) => {
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    // Post bodies are authored by the site owner in posts.json, so HTML is allowed.
    $('#postContent').innerHTML = `
      <div class="tags">${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
      <h2>${escapeHtml(p.title)}</h2>
      <p class="muted small">${new Date(p.date + 'T00:00').toLocaleDateString(undefined, { dateStyle: 'long' })} · ${p.readMins} min read</p>
      ${p.body}`;
    dialog.showModal();
    history.replaceState(null, '', `#post/${id}`);
  };
  $('#blogGrid').addEventListener('click', (e) => { const c = e.target.closest('.post-card'); if (c) open(c.dataset.id); });
  $('#closePost').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => history.replaceState(null, '', '#blog'));
  const m = location.hash.match(/^#post\/(.+)/);
  if (m) open(m[1]);
}

/* ---------------- Careers ---------------- */
function initCareers() {
  const tracks = window.CAREER_TRACKS;
  let active = tracks[0].id;
  const render = () => {
    $('#trackTabs').innerHTML = tracks.map((t) =>
      `<button class="tab" role="tab" data-id="${t.id}" aria-selected="${t.id === active}">${t.name}</button>`).join('');
    const t = tracks.find((x) => x.id === active);
    const pills = (arr) => `<ul class="pill-list">${arr.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    $('#trackPanel').className = 'card track-panel';
    $('#trackPanel').innerHTML = `
      <div>
        <h3>${t.name}</h3>
        <p class="muted">${t.summary}</p>
        <h4>Starter roles</h4>${pills(t.roles)}
        <h4>Core skills</h4>${pills(t.skills)}
        <h4>Useful certifications</h4>${pills(t.certs)}
        <div class="salary"><strong>Who hires:</strong> ${t.employers}</div>
      </div>
      <div>
        <h4>6-month learning plan</h4>
        <ol class="timeline">${t.plan.map(([m, d]) => `<li><strong>${m}</strong>${d}</li>`).join('')}</ol>
      </div>`;
  };
  $('#trackTabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) { active = b.dataset.id; render(); } });
  render();

  // Checklist with saved progress
  const done = new Set(store.get('itl-checklist') || []);
  const items = window.JOB_CHECKLIST;
  $('#checklist').innerHTML = items.map((txt, i) =>
    `<li><label><input type="checkbox" data-i="${i}" ${done.has(i) ? 'checked' : ''}> ${txt}</label></li>`).join('');
  const update = () => { $('#checkProgress').style.width = `${(done.size / items.length) * 100}%`; };
  $('#checklist').addEventListener('change', (e) => {
    const i = Number(e.target.dataset.i);
    e.target.checked ? done.add(i) : done.delete(i);
    store.set('itl-checklist', [...done]);
    update();
  });
  update();
}

/* ---------------- Boot ---------------- */
$('#year').textContent = new Date().getFullYear();
initTheme();
initNews();
initBlog();
initCareers();
