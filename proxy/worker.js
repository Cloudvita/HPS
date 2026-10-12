// Optional Cloudflare Worker that lets the browser "Refresh live" button read RSS feeds.
// Only hosts used in data/feeds.json are allowed, so it can't be abused as an open proxy.
// Deploy: npx wrangler deploy proxy/worker.js --name itl-news --compatibility-date 2024-09-01
// Then set CONFIG.rssProxy in js/app.js to 'https://itl-news.<your-subdomain>.workers.dev/?url='

const ALLOWED_HOSTS = ['news.google.com', 'feeds.finance.yahoo.com', 'feeds.a.dj.com'];

export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url');
    let url;
    try { url = new URL(target); } catch { return new Response('Missing or invalid ?url=', { status: 400 }); }
    if (!ALLOWED_HOSTS.includes(url.hostname)) return new Response('Host not allowed', { status: 403 });

    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (IT Launchpad news proxy)' },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=1800',
      },
    });
  },
};
