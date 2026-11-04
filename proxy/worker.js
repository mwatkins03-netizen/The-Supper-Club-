/**
 * Menu Lab proxy — Cloudflare Worker
 * Holds the Levanto Sage key as a secret and fetches NYPL menu scans with CORS so the page can resize them.
 * Stores nothing. Jev is called directly at the Jev Sandbox Worker.
 *
 * Deploy (from this folder):
 *   npx wrangler secret put SAGE_API_KEY      (paste key when prompted)
 *   npx wrangler deploy
 * Then paste the printed *.workers.dev URL into the Menu Lab connection dialog, or set SAGE_PROXY in app.js.
 */

const SAGE = "https://sage.levanto.ai/decide/batch";
const MAX_BODY_BYTES = 24_000_000;
const RATE_PER_MIN = 60;

const buckets = new Map();
function limited(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, t: now };
  if (now - b.t > 60_000) { b.n = 0; b.t = now; }
  b.n += 1;
  buckets.set(ip, b);
  return b.n > RATE_PER_MIN;
}

function cors(origin, env) {
  const allow = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
  const ok = allow.includes("*") || allow.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const base = cors(origin, env);
    const json = (status, obj) => new Response(typeof obj === "string" ? obj : JSON.stringify(obj),
      { status, headers: { ...base, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: base });

    if (request.method === "GET" && url.pathname.replace(/\/$/, "").endsWith("/img")) {
      const id = url.searchParams.get("id") || "", t = url.searchParams.get("t") || "q";
      if (!/^\d{1,12}$/.test(id) || !["w", "q", "r"].includes(t)) return json(400, { error: "id must be digits, t one of w q r" });
      const cache = caches.default;
      const cacheKey = new Request(`https://menu-lab.cache/img/${id}/${t}`);
      let res = await cache.match(cacheKey);
      if (!res) {
        const up = await fetch(`https://images.nypl.org/index.php?id=${id}&t=${t}`, { headers: { "User-Agent": "menu-lab-proxy" } });
        if (!up.ok) return json(up.status, { error: `NYPL returned ${up.status}` });
        res = new Response(up.body, { headers: { "Content-Type": up.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "public, max-age=604800" } });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
      }
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(base)) out.headers.set(k, v);
      return out;
    }

    if (request.method !== "POST") return json(200, { ok: true, service: "menu-lab-proxy", features: ["sage", "img"], sage_key: !!env.SAGE_API_KEY });
    if (!url.pathname.replace(/\/$/, "").endsWith("/sage")) return json(404, { error: "POST /sage only" });
    if (!env.SAGE_API_KEY) return json(500, { error: "Worker has no SAGE_API_KEY secret." });
    if (limited(request.headers.get("CF-Connecting-IP") || "anon")) return json(429, { error: `Rate limit: ${RATE_PER_MIN} requests per minute.` });
    if (+(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) return json(413, { error: "Request too large." });

    let body;
    try { body = await request.json(); } catch { return json(400, { error: "Bad JSON" }); }
    const reqs = body && body.requests;
    if (!Array.isArray(reqs) || reqs.length < 1 || reqs.length > 4 ||
        !reqs.every(g => Array.isArray(g.questions) && g.questions.length >= 1 && g.questions.length <= 8)) {
      return json(400, { error: "Body must be {requests:[1-4 groups of 1-8 questions]}" });
    }
    const up = await fetch(SAGE, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.SAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: reqs }),
    });
    return json(up.status, await up.text());
  },
};
