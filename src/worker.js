/**
 * Cloudflare Worker für Bundesliga Tic Tac Toe.
 *
 * - Liefert die statischen Dateien aus ./public (über das ASSETS-Binding).
 * - /api/tm?path=/... : Transfermarkt-Abfrage für Spielersuche und Karriereprüfung.
 *
 * Geschwindigkeit: Zuerst wird Transfermarkt DIREKT abgefragt (HTML bzw. die
 * JSON-Transferhistorie) und serverseitig in dasselbe Markdown-Format gebracht,
 * das r.jina.ai liefert – das dauert meist < 1 s. Nur wenn das scheitert oder
 * unbrauchbar aussieht, wird der langsamere r.jina.ai-Reader (3–10 s) genutzt.
 * Alle Antworten landen im Edge-Cache.
 *
 * Optional: Secret JINA_API_KEY setzen für höhere Rate-Limits bei r.jina.ai.
 */

const TM_ORIGIN = "https://www.transfermarkt.de";
const READER = "https://r.jina.ai/";
const CACHE_VERSION = "v2";

const DIRECT_TIMEOUT_MS = 5000;
const READER_TIMEOUT_MS = 12000;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.6",
};

// Nur diese Transfermarkt-Pfade dürfen abgefragt werden – kein offener Proxy.
const ROUTES = [
  { kind: "search", re: /^\/schnellsuche\/ergebnis\/schnellsuche\?query=[^&]{1,200}$/, ttl: 60 * 60 * 6, readerScheme: "http" },
  { kind: "transfers", re: /^\/(?:[a-z0-9-]{1,80}\/)?transfers\/spieler\/(\d{1,9})$/i, ttl: 60 * 60 * 24, readerScheme: "https" },
  { kind: "page", re: /^\/(?:[a-z0-9-]{1,80}\/)?(?:rueckennummern|profil)\/spieler\/\d{1,9}$/i, ttl: 60 * 60 * 24, readerScheme: "https" },
];

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

/* ---------- HTML -> Markdown (genau so viel, wie der Client-Parser braucht) ---------- */

function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function absUrl(href) {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/")) return TM_ORIGIN + href;
  return "";
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : "";
}

function imgToMd(tag) {
  const src = absUrl(attr(tag, "data-src") || attr(tag, "src"));
  const alt = (attr(tag, "alt") || attr(tag, "title")).replace(/[[\]]/g, "");
  return src ? `![${alt}](${src})` : "";
}

function htmlToMarkdown(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head>/i, "");

  // Links: sichtbarer Text, sonst alt/title des Wappens als Linktext.
  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, inner) => {
    const href = absUrl(attr(`<a ${attrs}>`, "href"));
    const imgs = [...inner.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
    const text = decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().replace(/[[\]]/g, "");
    const label = text || (imgs.length ? (attr(imgs[0], "alt") || attr(imgs[0], "title")) : "") || attr(`<a ${attrs}>`, "title");
    const imgMd = imgs.map(imgToMd).filter(Boolean).join(" ");
    if (!href) return ` ${imgMd} ${label} `;
    return ` ${imgMd ? imgMd + " " : ""}[${label.replace(/[[\]]/g, "")}](${href}) `;
  });

  s = s.replace(/<img\b[^>]*>/gi, m => ` ${imgToMd(m)} `);
  s = s.replace(/<\/(td|th)>/gi, " | ");
  s = s.replace(/<(br|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/?(p|div|tr|li|ul|ol|table|thead|tbody|section|article|header|footer|h[1-6]|dt|dd)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);

  return s
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/* ---------- Transferhistorie als JSON (ceapi) -> Markdown ---------- */

function transfersJsonToMarkdown(json, path) {
  const lines = [`Transferhistorie ${TM_ORIGIN}${path}`];
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const name = node.clubName || node.clubname || node.name && node.href && /verein/.test(node.href) && node.name;
    if (typeof name === "string" && name.trim()) {
      const href = typeof node.href === "string" ? node.href : "";
      const m = href.match(/\/([a-z0-9-]+)\/[a-z_-]+\/verein\/(\d+)/i);
      const slug = m ? m[1] : name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const id = m ? m[2] : "0";
      const key = `${slug}:${id}`;
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(`[${name.trim().replace(/[[\]]/g, "")}](${TM_ORIGIN}/${slug}/startseite/verein/${id})`);
      }
    }
    Object.values(node).forEach(visit);
  };
  visit(json);
  return { md: lines.join("\n"), clubs: seen.size };
}

/* ---------- Upstream-Abfragen ---------- */

async function fetchDirect(route, path) {
  if (route.kind === "transfers") {
    const id = path.match(route.re)[1];
    const res = await fetch(`${TM_ORIGIN}/ceapi/transferHistory/list/${id}`, {
      headers: { ...BROWSER_HEADERS, "Accept": "application/json", "X-Requested-With": "XMLHttpRequest", "Referer": TM_ORIGIN + path },
      signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`direct ${res.status}`);
    const { md, clubs } = transfersJsonToMarkdown(await res.json(), path);
    if (clubs < 1) throw new Error("direct: keine Vereine");
    return md;
  }

  const res = await fetch(TM_ORIGIN + path, {
    headers: { ...BROWSER_HEADERS, "Accept": "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`direct ${res.status}`);
  const html = await res.text();
  // Captcha-/Blockseiten erkennen: echte TM-Seiten sind groß und enthalten Spielerlinks.
  if (html.length < 5000 || !/transfermarkt/i.test(html)) throw new Error("direct: unerwartete Seite");
  const md = htmlToMarkdown(html);
  if (route.kind === "search" && !/\/profil\/spieler\/\d+/.test(md) && !/keine\s+(treffer|ergebnisse)|0\s+treffer/i.test(md)) {
    throw new Error("direct: keine Spielerliste");
  }
  if (route.kind === "page" && !/\/verein\/\d+/.test(md)) throw new Error("direct: keine Vereinslinks");
  return md;
}

async function fetchReader(route, path, env) {
  const headers = { "Accept": "text/plain", "X-Timeout": "8", "X-Return-Format": "markdown" };
  if (env.JINA_API_KEY) headers["Authorization"] = `Bearer ${env.JINA_API_KEY}`;
  const res = await fetch(`${READER}${route.readerScheme}://www.transfermarkt.de${path}`, {
    headers,
    signal: AbortSignal.timeout(READER_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`reader ${res.status}`);
  return res.text();
}

async function handleTransfermarkt(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "GET") return textResponse("Method not allowed", 405);

  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  const route = ROUTES.find(r => r.re.test(path));
  if (!route) return textResponse("Pfad nicht erlaubt", 400);

  const cacheKey = new Request(`${url.origin}/api/tm/${CACHE_VERSION}?path=${encodeURIComponent(path)}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set("X-Cache", "HIT");
    return res;
  }

  let body = "";
  let source = "direct";
  try {
    body = await fetchDirect(route, path);
  } catch (directErr) {
    source = "reader";
    try {
      body = await fetchReader(route, path, env);
    } catch (readerErr) {
      return textResponse(`Transfermarkt nicht erreichbar (${directErr.message}; ${readerErr.message})`, 502);
    }
  }

  const cacheable = body.length > 300;
  const res = textResponse(body, 200, {
    "Cache-Control": cacheable ? `public, max-age=${route.ttl}` : "no-store",
    "X-Cache": "MISS",
    "X-Source": source,
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
