/**
 * Cloudflare Worker für Bundesliga Tic Tac Toe.
 *
 * - Liefert die statischen Dateien aus ./public (über das ASSETS-Binding).
 * - /api/tm?path=/... : Proxy zu Transfermarkt über den r.jina.ai-Reader.
 *   Antworten werden im Edge-Cache von Cloudflare gespeichert, damit dieselbe
 *   Suche bzw. dasselbe Spielerprofil beim zweiten Mal sofort da ist und
 *   r.jina.ai nicht ständig neu rendern muss (Rate-Limits!).
 *
 * Optional: Secret JINA_API_KEY setzen (`npx wrangler secret put JINA_API_KEY`)
 * für höhere Rate-Limits bei r.jina.ai.
 */

const TM_HOST = "www.transfermarkt.de";
const READER = "https://r.jina.ai/";

// Nur diese Transfermarkt-Pfade dürfen abgefragt werden – kein offener Proxy.
const ALLOWED_PATHS = [
  { re: /^\/schnellsuche\/ergebnis\/schnellsuche\?query=[^&]{1,200}$/, ttl: 60 * 60 * 6, scheme: "http" },
  { re: /^\/(?:[a-z0-9-]{1,80}\/)?(?:transfers|rueckennummern|profil)\/spieler\/\d{1,9}$/i, ttl: 60 * 60 * 24, scheme: "https" },
];

const UPSTREAM_TIMEOUT_MS = 12000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function textResponse(body, status, extra = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(), ...extra },
  });
}

async function handleTransfermarkt(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "GET") return textResponse("Method not allowed", 405);

  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  const rule = ALLOWED_PATHS.find(r => r.re.test(path));
  if (!rule) return textResponse("Pfad nicht erlaubt", 400);

  // Cache-Key unabhängig von sonstigen Query-Parametern des Clients.
  const cacheKey = new Request(`${url.origin}/api/tm?path=${encodeURIComponent(path)}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set("X-Cache", "HIT");
    return res;
  }

  const headers = {
    "Accept": "text/plain",
    "X-Timeout": "8",
    "X-Return-Format": "markdown",
  };
  if (env.JINA_API_KEY) headers["Authorization"] = `Bearer ${env.JINA_API_KEY}`;

  let upstream;
  try {
    upstream = await fetch(`${READER}${rule.scheme}://${TM_HOST}${path}`, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    return textResponse(`Upstream nicht erreichbar: ${err && err.name}`, 504);
  }

  if (!upstream.ok) return textResponse(`Upstream HTTP ${upstream.status}`, 502);

  const body = await upstream.text();
  // Zu kurze Antworten sind meist Fehlerseiten/Captchas – nicht cachen.
  const cacheable = body.length > 500;
  const res = textResponse(body, 200, {
    "Cache-Control": cacheable ? `public, max-age=${rule.ttl}` : "no-store",
    "X-Cache": "MISS",
  });
  if (cacheable) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/tm") return handleTransfermarkt(request, env, ctx);
    if (url.pathname === "/api/health") return textResponse("ok", 200);
    return env.ASSETS.fetch(request);
  },
};
