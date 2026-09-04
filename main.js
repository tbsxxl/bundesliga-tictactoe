let currentPlayer = 'X';

const teams = [
  "FC Bayern München", "Borussia Dortmund", "RB Leipzig", "Bayer Leverkusen",
  "VfB Stuttgart", "Eintracht Frankfurt", "TSG Hoffenheim", "Werder Bremen",
  "SC Freiburg", "FC Augsburg", "Borussia Mönchengladbach", "1. FC Union Berlin",
  "1. FSV Mainz 05", "1. FC Köln", "Hamburger SV",
  "FC Schalke 04", "SV 07 Elversberg", "SC Paderborn 07"
];

let boardState = [];
let topTeams = [];
let sideTeams = [];
let lastSize = 3;
let moveHistory = []; // Stack: { type:'move', r, c, player, playerName } | { type:'skip', player }
let gameLocked = false;
let usedPlayers = []; // [{ norm, displayName }]
let roundStartedAt = Date.now();
let elapsedBeforePause = 0;
let timerHandle = null;
let pending = null;   // { r, c, span, teamA, teamB, candidateName }

function setUndoButtonState() {
  const btn = document.getElementById("undoBtn");
  if (!btn) return;
  btn.disabled = moveHistory.length === 0;
}

function shuffleFisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setCurrentPlayerLabel() {
  const el = document.getElementById("currentPlayer");
  if (el) el.textContent = `Spieler ${currentPlayer} ist am Zug`;
}

/* --- Spielstand-Persistenz (localStorage) ---
   Verhindert Datenverlust, wenn das Handy die Seite beim Tab-Wechsel
   (z. B. Antippen des Transfermarkt-Links) im Hintergrund neu lädt. */
const STORAGE_KEY = "bttt_state_v1";

function saveState(resultText){
  try {
    const state = {
      lastSize, topTeams, sideTeams, boardState,
      currentPlayer, moveHistory, usedPlayers, gameLocked,
      resultText: resultText || "",
      roundStartedAt, elapsedBeforePause,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // localStorage kann fehlen/voll sein (privater Modus etc.) – dann eben ohne Persistenz.
  }
}

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.boardState) || !Array.isArray(state.topTeams)) return null;
    return state;
  } catch (err) {
    return null;
  }
}

function getElapsedSeconds(){
  return Math.max(0, Math.floor((elapsedBeforePause + (gameLocked ? 0 : (Date.now() - roundStartedAt))) / 1000));
}
function formatTime(sec){
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function updateGameStats(){
  const moves = moveHistory.filter(m => m.type === 'move').length;
  const movesEl = document.getElementById('movesStat');
  const timeEl = document.getElementById('timeStat');
  if (movesEl) movesEl.textContent = `${moves} ${moves === 1 ? 'Zug' : 'Züge'}`;
  if (timeEl) timeEl.textContent = formatTime(getElapsedSeconds());
}
function startTimer(){
  clearInterval(timerHandle);
  timerHandle = setInterval(updateGameStats, 1000);
  updateGameStats();
}

function clearSavedState(){
  try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
}

function setResult(text, tone = "muted") {
  const el = document.getElementById("result");
  if (!el) return;
  el.textContent = text || "";
  el.style.color =
    tone === "x" ? "var(--accent)" :
    tone === "o" ? "var(--accent2)" :
    "var(--muted)";
}

/* --- Fit-to-Viewport: garantiert KEIN Scroll (auch 5x5) --- */
function fitBoardToViewport(size){
  const card = document.querySelector(".board-card");
  const root = document.documentElement;
  if (!card) return;

  const cardStyle = getComputedStyle(card);
  const padX = parseFloat(cardStyle.paddingLeft) + parseFloat(cardStyle.paddingRight);
  const padY = parseFloat(cardStyle.paddingTop) + parseFloat(cardStyle.paddingBottom);

  const availW = card.clientWidth - padX;
  const availH = card.clientHeight - padY;

  // Gap dynamisch setzen (je größer das Grid, desto kleiner Gap)
  const gap = size >= 5 ? 8 : size === 4 ? 9 : 10;

  const n = size + 1;

  const cellFromW = (availW - (n - 1) * gap) / n;
  const cellFromH = (availH - (n - 1) * gap) / n;

  let cell = Math.floor(Math.min(cellFromW, cellFromH));

  // Minimum Tap Target (iOS)
  cell = Math.max(44, cell);

  const logo = Math.floor(cell * 0.55);
  const mark = Math.floor(cell * 0.48);

  root.style.setProperty("--gap", `${gap}px`);
  root.style.setProperty("--cell", `${cell}px`);
  root.style.setProperty("--label", `${cell}px`);
  root.style.setProperty("--logo", `${logo}px`);
  root.style.setProperty("--mark", `${mark}px`);

  // Wenn es eng wird: automatisch Namen ausblenden
  document.body.classList.toggle("compact", cell < 72);
}

function lockBoard(){
  if (!gameLocked) elapsedBeforePause += Date.now() - roundStartedAt;
  gameLocked = true;
  document.querySelectorAll(".cell").forEach(cell => {
    cell.style.pointerEvents = "none";
    cell.style.opacity = "0.98";
  });
}

function unlockBoard(){
  gameLocked = false;
  roundStartedAt = Date.now();
  document.querySelectorAll(".cell").forEach(cell => {
    cell.style.pointerEvents = "auto";
    cell.style.opacity = "1";
  });
}

function clearWinHighlights(){
  document.querySelectorAll(".cell").forEach(el => el.classList.remove("correct-x","correct-o"));
}

function normalizeName(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* --- Automatische Transfermarkt-Prüfung ---
   Die alte fly.dev-Test-API ist unzuverlässig. Stattdessen wird Transfermarkt
   über Jina AI als serverseitigen HTML->Markdown-Reader abgefragt. Dadurch muss
   der Mitspieler nicht selbst auf Transfermarkt suchen.

   Ablauf:
   1. Transfermarkt-Schnellsuche nach dem eingegebenen Namen
   2. bestes exaktes/nahezu exaktes Spielerprofil bestimmen
   3. Spielerprofil abrufen und Karriere-/Jugendvereine auswerten
   4. beide gesuchten Vereine automatisch prüfen
*/
const TM_READER_BASE = "https://r.jina.ai/http://www.transfermarkt.de";
const TM_SITE = "https://www.transfermarkt.de";

const teamKeywords = {
  "FC Bayern München": ["bayern munchen", "bayern münchen", "bayern munich", "fc bayern"],
  "Borussia Dortmund": ["borussia dortmund", "dortmund"],
  "RB Leipzig": ["rb leipzig", "rasenballsport leipzig", "leipzig"],
  "Bayer Leverkusen": ["bayer leverkusen", "leverkusen"],
  "VfB Stuttgart": ["vfb stuttgart", "stuttgart"],
  "Eintracht Frankfurt": ["eintracht frankfurt", "frankfurt"],
  "TSG Hoffenheim": ["tsg hoffenheim", "1899 hoffenheim", "hoffenheim"],
  "Werder Bremen": ["werder bremen", "sv werder bremen", "bremen"],
  "SC Freiburg": ["sc freiburg", "freiburg"],
  "FC Augsburg": ["fc augsburg", "augsburg"],
  "Borussia Mönchengladbach": ["borussia monchengladbach", "borussia mönchengladbach", "monchengladbach", "gladbach"],
  "1. FC Union Berlin": ["1 fc union berlin", "union berlin", "fc union berlin"],
  "1. FSV Mainz 05": ["1 fsv mainz 05", "fsv mainz", "mainz 05", "mainz"],
  "1. FC Köln": ["1 fc koln", "1. fc köln", "fc koln", "fc köln", "koln", "köln"],
  "Hamburger SV": ["hamburger sv", "hamburg sv", "hsv"],
  "FC Schalke 04": ["fc schalke 04", "schalke 04", "schalke"],
  "SV 07 Elversberg": ["sv elversberg", "sv 07 elversberg", "elversberg"],
  "SC Paderborn 07": ["sc paderborn", "sc paderborn 07", "paderborn"],
};

function clubNameMatchesTeam(clubName, team) {
  const norm = normalizeName(clubName);
  if (team === "1. FC Köln" && (norm.includes("fortuna") || norm.includes("dusseldorf"))) return false;
  if (team === "1. FC Union Berlin" && !norm.includes("union")) return false;
  return (teamKeywords[team] || []).some(k => norm.includes(normalizeName(k)));
}

function textContainsTeam(text, team) {
  const norm = normalizeName(text);
  return (teamKeywords[team] || []).some(k => {
    const n = normalizeName(k);
    // word-ish matching prevents e.g. "hamburg" from matching unrelated text
    return norm.includes(n);
  });
}

async function fetchWithTimeout(url, ms){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "text/plain,text/html,application/json,*/*",
        // Weist r.jina.ai an, nicht ewig auf vollständiges JS-Rendering zu warten,
        // sondern nach ~6s mit dem zu antworten, was bis dahin da ist.
        "x-timeout": "6",
      }
    });
  } finally {
    clearTimeout(t);
  }
}

function slugToName(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Vereins-Slugs enthalten häufig gängige Kurzformen (sc, fc, tsg, ...), die als eigenes
// Wort groß geschrieben gehören ("SC Freiburg" statt "Sc Freiburg"), sowie deutsche
// Umlaute, die im URL-Slug ausgeschrieben sind (oe/ue/ae -> ö/ü/ä).
const CLUB_SLUG_UPPER = new Set(["fc","sc","sv","tsg","rb","vfb","vfl","fsv","hsv","dsc","bsc","asv","sg","spvgg"]);
function slugToClubName(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(w => {
      if (CLUB_SLUG_UPPER.has(w.toLowerCase())) return w.toUpperCase();
      if (/^\d+$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

// Der zuverlässigste Name steckt im URL-Slug selbst (.../keven-schlotterbeck/.../spieler/413843),
// nicht im umgebenden Fließtext. Pro Spieler-ID wird der längste (aussagekräftigste) Slug behalten;
// Platzhalter wie "-" oder "x" werden ignoriert.
function extractPlayerCandidates(markdown, fallbackName = "") {
  const byId = new Map();
  const add = (id, slug, name) => {
    if (!id) return;
    slug = (slug || "").replace(/^x$/i, "");
    name = (name || "").trim() || (slug ? slugToName(slug) : fallbackName);
    const prev = byId.get(id);
    if (!prev || (slug && !prev.slug) || (slug && slug.length > (prev.slug || "").length)) {
      byId.set(id, { id, slug, name });
    }
  };

  // Normaler Spielerlink: /spielername/profil/spieler/123
  const re = /transfermarkt\.(?:de|com|co\.uk)\/([a-z0-9\-]+)\/profil\/spieler\/(\d+)/gi;
  let m;
  while ((m = re.exec(markdown || ""))) add(m[2], m[1], slugToName(m[1]));

  // Transfermarkt/Jina liefert in der Schnellsuche sehr häufig den kanonischen
  // Kurzlink /x/profil/spieler/123. Der alte Parser hat genau diese Links übersehen,
  // wodurch bekannte Spieler wie Leon Goretzka als "kein Treffer" erschienen sind.
  const xRe = /transfermarkt\.(?:de|com|co\.uk)\/x\/profil\/spieler\/(\d+)/gi;
  while ((m = xRe.exec(markdown || ""))) add(m[1], "", fallbackName);

  // Fallback für seltene Reader-Varianten: /spieler/123 ohne Slug.
  const idRe = /transfermarkt\.(?:de|com|co\.uk)\/(?:x\/)?profil\/spieler\/(\d+)/gi;
  while ((m = idRe.exec(markdown || ""))) add(m[1], "", fallbackName);

  return [...byId.values()];
}

function scorePlayerCandidate(candidate, input) {
  const a = normalizeName(input), b = normalizeName(candidate.name);
  if (a === b) return 1000;
  if (b.includes(a) || a.includes(b)) return 700;
  const aw = new Set(a.split(' ')), bw = new Set(b.split(' '));
  let common = 0; aw.forEach(w => { if (w.length > 2 && bw.has(w)) common++; });
  return common * 100 - Math.abs(a.length - b.length);
}

function extractTransfermarktProfileUrls(markdown) {
  const urls = [];
  const seen = new Set();
  const re = /https?:\/\/www\.transfermarkt\.(?:de|com|co\.uk)\/[^\s)]+\/profil\/spieler\/\d+[^\s)]*/gi;
  let m;
  while ((m = re.exec(markdown || ""))) {
    const url = m[0].replace(/[.,;]+$/, '');
    if (!seen.has(url)) { seen.add(url); urls.push(url); }
  }
  return urls;
}

async function searchTransfermarktPlayer(name) {
  const searchUrl = `${TM_READER_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(name)}`;
  const res = await fetchWithTimeout(searchUrl, 9000);
  if (!res.ok) throw new Error(`Transfermarkt-Suche HTTP ${res.status}`);
  const md = await res.text();
  const candidates = extractPlayerCandidates(md, name);
  if (!candidates.length) {
    // Fallback: search page can sometimes be returned with links encoded differently.
    const urls = extractTransfermarktProfileUrls(md);
    if (!urls.length) return null;
    const idMatch = urls[0].match(/spieler\/(\d+)/i);
    return idMatch ? { id: idMatch[1], name, slug: (urls[0].match(/transfermarkt\.(?:de|com|co\.uk)\/([^/]+)\//i)||[])[1] || "" } : null;
  }
  candidates.sort((a,b) => scorePlayerCandidate(b,name) - scorePlayerCandidate(a,name));
  return candidates[0];
}

// Statt der allgemeinen Profilseite (voller Rauschen: Spieltermine, Marktwertverlauf, Geb.-Datum)
// wird direkt die Transfers-Unterseite geladen – dort steht die echte Wechselhistorie.
async function fetchTransfermarktTransfers(playerId, slug = "") {
  // Die /transfers-Seite kann von r.jina.ai gekürzt werden. Für die
  // "hat für Verein gespielt"-Prüfung laden wir zusätzlich die
  // Rückennummern-Historie, die Transfermarkt als Karriereübersicht führt.
  // Parallel statt nacheinander laden – das ist der größte Geschwindigkeitshebel,
  // da drei serielle Requests sich sonst zu bis zu ~30s aufaddieren können.
  const urls = [
    `${TM_SITE}/${slug ? slug + "/" : ""}transfers/spieler/${playerId}`,
    `${TM_SITE}/${slug ? slug + "/" : ""}rueckennummern/spieler/${playerId}`,
    `${TM_SITE}/${slug ? slug + "/" : ""}profil/spieler/${playerId}`
  ];
  const results = await Promise.allSettled(
    urls.map(url => fetchWithTimeout(`https://r.jina.ai/${url}`, 9000).then(res => ({ url, res })))
  );
  const chunks = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.res.ok) continue;
    const { url, res } = r.value;
    const md = await res.text();
    if (md && md.length > 200) chunks.push(`\n\n===== QUELLE: ${url} =====\n${md}`);
  }
  if (!chunks.length) throw new Error("Transfermarkt-Karrieredaten konnten nicht geladen werden");
  return chunks.join("\n");
}

// Best-effort: Zeilen mit Datum (DD.MM.YYYY) als "Transferzeile" interpretieren, aber
// Spieltermine (Wochentag + Uhrzeit) und Stammdaten (Geb./Marktwertverlauf) explizit rausfiltern.
// Robuste strukturierte Daten gibt es hier nicht (nur Markdown-Fließtext) – daher bleibt
// der Transfermarkt-Link immer sichtbar als verlässliche Rückfallebene.
function extractCareerClubs(markdown) {
  if (!markdown) return [];
  const clubs = [];
  const seen = new Set();
  const add = (value) => {
    if (!value) return;
    let name = value.replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    name = name.replace(/^[-•*]\s*/, '').replace(/\s*\|\s*$/, '').trim();
    if (!name || name.length < 3) return;
    // Niemals Saison-/Navigations-/Nationalmannschaftsreste als Verein übernehmen.
    if (/^(Transfermarkt|Transferdetails|Transferzeitpunkt|Saison|Wettbewerb|Liga|Liga-Art|Trainer|Manager|Marktwert|Alter|Ablöse|Restvertragslaufzeit|Datum)$/i.test(name)) return;
    if (/nationalmannschaft|nationalteam|\b(?:U(?:15|16|17|18|19|20|21|23))\b/i.test(name)) return;
    if (/^(Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland|Frankreich|France|England|Spain|Spanien|Italy|Italien|Niederlande|Netherlands)(?:\s|$)/i.test(name)) return;
    if (/^(image|logo|wappen|news|community|statistik|detailsuche)/i.test(name)) return;
    if (/^\d{2,4}\s*\/\s*\d{2,4}$/.test(name)) return;
    const key = normalizeName(name);
    if (seen.has(key)) return;
    seen.add(key); clubs.push(name);
  };

  // Wichtig: Vereinslinks werden NUR aus den Transfer-/Rückennummern-Quellen gelesen.
  // Profilseiten enthalten viele Navigations-, Gegner- und Empfehlungslinks und führten
  // früher zu falschen Treffern (z.B. Nico Schlotterbeck -> Bayern/HSV).
  const sections = markdown.split(/===== QUELLE:\s*/i);
  for (const section of sections) {
    const isTransferSource = /\/transfers\/spieler\/\d+/i.test(section) || /\/rueckennummern\/spieler\/\d+/i.test(section);
    if (!isTransferSource) continue;
    const re = /\[([^\]\n]{2,100})\]\((https?:\/\/www\.transfermarkt\.(?:de|com|co\.uk)\/[^\s)]*\/verein\/\d+[^\s)]*)\)/gi;
    let m;
    while ((m = re.exec(section))) {
      if (/saison_id/i.test(m[2])) continue;
      add(m[1]);
    }
    // Vereine werden auf der Transfers-/Rückennummern-Seite sehr häufig NUR über das
    // Wappen-Bild verlinkt: [![SC Freiburg](bild-url)](.../verein/60). Dann ist der
    // sichtbare Linktext leer oder nur "![...]" und obige Regex liefert nichts – genau
    // das führte bei Spielern wie Nico Schlotterbeck zu "Keine strukturierte Vereinsliste
    // gefunden". Der Vereinsname steckt aber zuverlässig im URL-Slug selbst
    // (.../sc-freiburg/startseite/verein/60), unabhängig vom Linktext-Format.
    // Transfermarkt/Jina kann Vereinslinks sowohl absolut als auch relativ liefern.
    // Die alte Regex akzeptierte nur absolute URLs und verlor dadurch komplette
    // Vereinsstationen (u. a. Nuri Sahin -> Werder Bremen). Wir akzeptieren beide
    // Varianten und lesen den ersten URL-Slug vor /verein/<id> aus.
    const clubLinkRe = /(?:https?:\/\/www\.transfermarkt\.(?:de|com|co\.uk))?\/([a-z0-9\-]+)(?:\/[a-z0-9\-]+)*\/verein\/\d+[^\s)"']*/gi;
    while ((m = clubLinkRe.exec(section))) {
      if (/saison_id/i.test(m[0])) continue;
      if (/^(spieler|profil|transfers|rueckennummern|x)$/i.test(m[1])) continue;
      add(slugToClubName(m[1]));
    }

    // Fallback: Bei manchen Reader-Ausgaben steht der Vereinsname als Markdown-Link
    // mit einem relativen href, während der sichtbare Text den exakten Namen enthält.
    const relativeClubTextRe = /\[([^\]\n]{2,100})\]\((\/[^)\n]*\/verein\/\d+[^)\n]*)\)/gi;
    while ((m = relativeClubTextRe.exec(section))) {
      if (/saison_id/i.test(m[2])) continue;
      const label = m[1].replace(/^!\[[^\]]*\]$/, '').trim();
      if (label && !/^(image|logo|wappen)$/i.test(label)) add(label);
    }
    // Einige Reader-Versionen liefern Transferzeilen ohne Markdown-Link, z.B. "Club A | Club B".
    for (const line of section.split(/\n+/)) {
      const clean = line.replace(/\*\*/g,'').trim();
      if (!clean.includes('|')) continue;
      const parts = clean.split('|').map(x => x.replace(/\[[^\]]+\]\([^)]*\)/g,'').trim()).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 4) {
        const joined = parts.join(' ');
        if (!/Wettbewerb|Liga|Trainer|Manager|Marktwert|Alter|Ablöse|Restvertrags|Transferzeitpunkt|Saison|Datum/i.test(joined)) {
          parts.slice(0,2).forEach(add);
        }
      }
    }
  }

  // Jugendvereine sind auf dem Profil häufig als plain text vorhanden. Sie werden
  // bewusst nur aus dem expliziten Jugendvereine-Block übernommen.
  const youth = markdown.match(/(?:Jugendvereine|Youth clubs|Clubs juveniles|Clubes juveniles)\s*\n+([^\n]+)/i);
  if (youth) youth[1].split(/,\s*/).forEach(x => add(x.replace(/\s*\([^)]*\)/g, '')));
  return clubs;
}
function extractTransferHistory(markdown) {
  // Kept for backwards compatibility with the UI; now returns the clean
  // career-club list rather than noisy dates/match links.
  return extractCareerClubs(markdown);
}

// Kompakte Diagnose statt riesigem Rohtext-Dump: zählt, ob typische Transfer-Stichwörter
// überhaupt IRGENDWO im Dokument vorkommen. So lässt sich schnell klären, ob die Transfer-
// tabelle im von r.jina.ai eingefangenen HTML überhaupt vorhanden ist (z. B. falls sie bei
// Transfermarkt per JavaScript nachgeladen wird und im Reader-Ergebnis fehlt).
function buildDiagnosticsSummary(markdown, teamA, teamB){
  if (!markdown) return "Keine Daten erhalten.";
  const lines = [`Gesamtlänge: ${markdown.length} Zeichen`, `Karrierequellen: Transferhistorie + Rückennummern-Historie + Profil`];
  const keywords = ["Saison", "Ablöse", "ablösefrei", "Vereinswechsel", "Leihe", "Transferhistorie", "Datum"];
  keywords.forEach(k => {
    const idx = markdown.indexOf(k);
    lines.push(`enthält "${k}": ${idx === -1 ? "nein" : "ja (Position " + idx + ")"}`);
  });
  lines.push(`enthält "${teamA}"-Stichwort: ${textContainsTeam(markdown, teamA)}`);
  lines.push(`enthält "${teamB}"-Stichwort: ${textContainsTeam(markdown, teamB)}`);

  const idx = markdown.search(/Saison|Ablöse|Vereinswechsel|Transferhistorie/i);
  lines.push("---");
  if (idx !== -1) {
    lines.push("Ausschnitt ab erstem Treffer:");
    lines.push(markdown.slice(Math.max(0, idx - 100), idx + 1500));
  } else {
    lines.push("Kein einziger Transfer-Marker im gesamten Dokument gefunden.");
    lines.push("Letzte 1000 Zeichen (oft das Seitenende, zur Kontrolle):");
    lines.push(markdown.slice(-1000));
  }
  return lines.join("\n");
}

// Rückgabe: { status: 'valid' | 'checked_no_match' | 'not_found' | 'error', id?, displayName?, matchedTeams?, transfers? }
// Portraitfotos stehen als ganz normale Bild-URL im Markdown der Profilseite
// (z. B. https://img.a.transfermarkt.technology/portrait/big/{id}-{hash}.jpg?lm=...).
// Anzeigen per <img src> braucht kein CORS (anders als fetch()), daher ist das
// deutlich zuverlässiger als der Rest der Datenextraktion.
function extractPortraitUrl(markdown, playerId){
  if (!markdown) return null;
  const re = new RegExp(`https:\\/\\/img\\.a\\.transfermarkt\\.technology\\/portrait\\/(?:big|header)\\/${playerId}-\\d+\\.jpg[^\\s)\\]"']*`, "i");
  const m = markdown.match(re);
  return m ? m[0] : null;
}

function renderMatchSummary(result, teamA, teamB){
  const el = document.getElementById("matchSummary");
  if (!el) return;
  el.innerHTML = "";
  if (!result || !result.id) return;
  const title = document.createElement("div");
  title.className = "match-summary__title";
  title.textContent = "Prüfung";
  const row = document.createElement("div");
  row.className = "match-summary__row";
  [teamA, teamB].forEach(team => {
    const item = document.createElement("span");
    item.className = "match-summary__team";
    const ok = team === teamA ? result.hasA : result.hasB;
    item.classList.add(ok ? "is-match" : "is-miss");
    item.textContent = `${ok ? "✓" : "×"} ${team}`;
    row.appendChild(item);
  });
  el.append(title, row);
}

async function tryAutoCheck(name, teamA, teamB){
  try {
    // Wenn der Nutzer einen Autocomplete-Treffer ausgewählt hat, kennen wir ID und
    // Namen bereits. Dadurch entfällt eine zweite Schnellsuche und die Prüfung startet
    // sofort mit der eigentlichen Karriereabfrage.
    let best = null;
    if (pending && pending.candidateId && normalizeName(pending.candidateName || "") === normalizeName(name)) {
      best = { id: pending.candidateId, slug: pending.candidateSlug || "", name: pending.candidateName || name };
    } else {
      best = await searchTransfermarktPlayer(name);
    }
    if (!best || !best.id) return { status: "not_found" };

    const transfersMd = await fetchTransfermarktTransfers(best.id, best.slug || "");
    const diagnostics = buildDiagnosticsSummary(transfersMd, teamA, teamB);
    console.log(`[TM-Check] Spieler-ID ${best.id}\n${diagnostics}`);

    const careerClubs = extractCareerClubs(transfersMd);
    const careerText = careerClubs.join(" | ");
    let hasA = textContainsTeam(careerText, teamA);
    let hasB = textContainsTeam(careerText, teamB);

    // WICHTIG: Transfermarkt/Jina liefert die Vereinsliste teilweise nur teilweise
    // als Markdown-Links. Die Transfers-Seite enthält die tatsächlichen Wechsel
    // jedoch häufig trotzdem als Text (auch bei Leihen). Deshalb darf eine fehlende
    // strukturierte Vereinszeile NICHT automatisch als "nicht gespielt" gelten.
    // Der Fallback ist bewusst nur auf der /transfers/-Quelle aktiv und nicht auf
    // der allgemeinen Profilseite, um Gegner-/News-Treffer zu vermeiden.
    const transferSections = transfersMd.split(/===== QUELLE:\s*/i)
      .filter(section => /\/transfers\/spieler\/\d+/i.test(section));
    const transferCareerText = transferSections.join("\n");
    if (!hasA && textContainsTeam(transferCareerText, teamA)) hasA = true;
    if (!hasB && textContainsTeam(transferCareerText, teamB)) hasB = true;

    // WICHTIGER FALLBACK: Transfermarkt rendert die Vereinskarriere je nach Spieler
    // nicht immer auf der /transfers/-Seite. Bei manchen Spielern (insbesondere
    // Leihen und Jugendstationen) steht der Verein ausschließlich auf der Profil-
    // bzw. Leistungsdaten-Seite als Vereinslink. Deshalb prüfen wir auch dort, aber
    // NUR für die beiden tatsächlich gesuchten Vereine. So werden News/Gegner-Links
    // nicht pauschal als Karrierestationen übernommen.
    const requestedTeams = [teamA, teamB].filter(Boolean);
    const allProfileSections = transfersMd.split(/===== QUELLE:\s*/i);
    const requestedTeamHit = (team) => {
      if (!team) return false;
      for (const section of allProfileSections) {
        // Exakte Vereinslinks: sichtbarer Name ODER Transfermarkt-Slug muss den
        // gesuchten Verein treffen. Der Link muss auf /verein/<id> zeigen.
        const clubLinkRe = /\[([^\]\n]{1,120})\]\((?:https?:\/\/www\.transfermarkt\.(?:de|com|co\.uk))?\/[^\s)]*\/verein\/\d+[^\s)]*\)/gi;
        let m;
        while ((m = clubLinkRe.exec(section))) {
          const label = m[1].replace(/^!\[[^\]]*\]$/, '').trim();
          if (clubNameMatchesTeam(label, team)) return true;
        }
        // Zusätzlich slug-basierte Vereinslinks, weil Jina bei Wappen-Links den
        // sichtbaren Vereinsnamen gelegentlich entfernt.
        const slugRe = /(?:https?:\/\/www\.transfermarkt\.(?:de|com|co\.uk))?\/([^\s\/()]+)(?:\/[^\s/()]+)*\/verein\/\d+/gi;
        while ((m = slugRe.exec(section))) {
          const slugName = slugToClubName(m[1]);
          if (clubNameMatchesTeam(slugName, team)) return true;
        }
      }
      return false;
    };
    if (!hasA) hasA = requestedTeamHit(teamA);
    if (!hasB) hasB = requestedTeamHit(teamB);

    const photoUrl = extractPortraitUrl(transfersMd, best.id);

    // Show all identifiable clubs in the player's Transfermarkt career.
    if (hasA && hasB) {
      return { status: "valid", id: best.id, displayName: best.name || name, hasA: true, hasB: true, matchedTeams: [teamA, teamB], clubs: careerClubs, transfers: careerClubs, raw: diagnostics, photoUrl };
    }
    return { status: "checked_no_match", id: best.id, displayName: best.name || name, hasA, hasB, clubs: careerClubs, transfers: careerClubs, raw: diagnostics, photoUrl };
  } catch (err) {
    console.warn("Transfermarkt-Autoprüfung fehlgeschlagen:", err);
    return { status: "error" };
  }
}

function showTransferHistory(rows, attempted, teamA, teamB){
  const wrap = document.getElementById("transferHistory");
  const list = document.getElementById("transferHistoryList");
  if (!wrap || !list) return;
  list.innerHTML = "";

  // Eine sehr kurze Liste (1-2 Einträge) ist bei Spielern mit langer Karriere fast immer
  // unvollständig (Transfermarkt lädt die volle Historie oft per JS nach, das fehlt hier).
  // Eine irreführend kurze Liste ist schlimmer als gar keine – deshalb Schwelle statt blind zeigen.
  const looksIncomplete = rows && rows.length > 0 && rows.length < 3 && !(teamA && teamB && rows.some(r => clubNameMatchesTeam(r, teamA)) && rows.some(r => clubNameMatchesTeam(r, teamB)));

  if (rows && rows.length) {
    // Vereine, die zu den gesuchten Feld-Teams passen, zuerst und mit Haken markieren.
    const isMatch = (club) => {
      if (!club) return false;
      return (teamA && clubNameMatchesTeam(club, teamA)) || (teamB && clubNameMatchesTeam(club, teamB));
    };
    const sorted = [...rows].sort((a, b) => Number(isMatch(b)) - Number(isMatch(a)));
    sorted.forEach(club => {
      const li = document.createElement("li");
      const match = isMatch(club);
      li.textContent = (match ? "✓ " : "• ") + club;
      if (match) li.classList.add("transfer-history__match");
      list.appendChild(li);
    });
    if (looksIncomplete) {
      const warn = document.createElement("li");
      warn.className = "transfer-history__empty";
      warn.textContent = "⚠ Vermutlich unvollständig (Transfermarkt lädt die volle Historie oft nach) – über den Link oben selbst prüfen.";
      list.appendChild(warn);
    }
    wrap.classList.add("is-visible");
    return;
  }

  if (attempted) {
    // Ehrlich sichtbar statt lautlos zu verschwinden: die Karrieredaten liefern nicht
    // immer eine saubere Vereinsliste (z. B. wenn Transfermarkt sie per JavaScript
    // nachlädt). Grün-Bestätigung basiert dann auf Texttreffer, nicht auf dieser Liste.
    const li = document.createElement("li");
    li.className = "transfer-history__empty";
    li.textContent = "Keine strukturierte Vereinsliste gefunden – über den Link oben selbst nachsehen.";
    list.appendChild(li);
    wrap.classList.add("is-visible");
    return;
  }

  wrap.classList.remove("is-visible");
}

let suggestDebounceTimer = null;
let suggestionCandidates = [];
let activeSuggestionIndex = -1;
async function fetchNameSuggestions(query){
  const list = document.getElementById("playerSuggestionList");
  if (!list) return;
  if (query.length < 2) { list.innerHTML = ""; list.classList.remove("is-visible"); suggestionCandidates = []; return; }
  try {
    const searchUrl = `${TM_READER_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(searchUrl, 8000);
    if (!res.ok) return;
    const md = await res.text();
    suggestionCandidates = extractPlayerCandidates(md, query)
      .filter(c => !usedPlayers.some(p => p.norm === normalizeName(c.name)))
      .sort((a,b) => scorePlayerCandidate(b, query) - scorePlayerCandidate(a, query))
      .slice(0, 7);
    activeSuggestionIndex = -1;
    list.innerHTML = "";
    suggestionCandidates.forEach((c, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "player-suggestion";
      row.setAttribute("role", "option");
      row.dataset.index = String(i);
      const title = document.createElement("strong");
      title.textContent = c.name;
      const meta = document.createElement("span");
      meta.textContent = "Transfermarkt-Spieler";
      row.append(title, meta);
      row.addEventListener("click", () => selectPlayerSuggestion(i));
      list.appendChild(row);
    });
    list.classList.toggle("is-visible", suggestionCandidates.length > 0);
  } catch (err) {
    // Komfortfunktion – ein Fehlschlag blockiert nie die manuelle Eingabe.
  }
}

let autoCheckToken = 0;
async function selectPlayerSuggestion(index){
  const c = suggestionCandidates[index];
  if (!c) return;
  const input = document.getElementById("playerInput");
  input.value = c.name;
  pending = pending || {};
  pending.candidateName = c.name;
  pending.candidateId = c.id;
  pending.candidateSlug = c.slug;
  const list = document.getElementById("playerSuggestionList");
  if (list) list.classList.remove("is-visible");
  // Automatische Prüfung direkt nach Auswahl – der Button "Prüfen" bleibt als erneuter Check.
  const token = ++autoCheckToken;
  setModalFeedback(`✓ ${c.name} ausgewählt – prüfe Vereine …`, "warn");
  await checkAnswer();
  if (token !== autoCheckToken) return;
}

function renderSuggestionActive(){
  const list = document.getElementById("playerSuggestionList");
  if (!list) return;
  [...list.children].forEach((el, i) => el.classList.toggle("is-active", i === activeSuggestionIndex));
}

function clearSuggestions(){
  const list = document.getElementById("playerSuggestionList");
  if (list) { list.innerHTML = ""; list.classList.remove("is-visible"); }
  suggestionCandidates = [];
  activeSuggestionIndex = -1;
}

function showDebugRaw(text){
  const toggle = document.getElementById("debugToggle");
  const box = document.getElementById("debugRaw");
  if (!toggle || !box) return;
  if (!text) {
    toggle.classList.remove("is-visible");
    box.classList.remove("is-visible");
    box.value = "";
    return;
  }
  box.value = text;
  toggle.classList.add("is-visible");
  toggle.textContent = "🐞 Rohdaten anzeigen (zum Debuggen kopieren)";
  box.classList.remove("is-visible");
}

function updateUsedPlayersDisplay(){
  const el = document.getElementById("usedPlayersList");
  if (!el) return;
  el.innerHTML = "";
  if (!usedPlayers.length) {
    el.textContent = "–";
    return;
  }
  usedPlayers.forEach(p => {
    const chip = document.createElement("span");
    chip.className = "player-chip";
    chip.textContent = p.displayName;
    el.appendChild(chip);
  });
}

function setModalFeedback(text, tone){
  const el = document.getElementById("modalFeedback");
  if (!el) return;
  el.textContent = text || "";
  el.className = "modal-feedback" + (tone ? ` is-${tone}` : "");
}

function showTransfermarktLink(show, name, id){
  const link = document.getElementById("transfermarktLink");
  const nameEl = document.getElementById("tmLinkName");
  if (!link) return;
  link.classList.toggle("is-visible", show);
  if (show) {
    nameEl.textContent = name || "Spieler";
    // Mit bekannter Spieler-ID: direkter, verlässlicher Profil-Link (Slug ist egal, TM leitet per ID um).
    // Ohne ID: Fallback auf die Schnellsuche nach dem eingegebenen Namen.
    link.href = id
      ? `https://www.transfermarkt.de/x/profil/spieler/${id}`
      : `https://www.transfermarkt.de/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(name || "")}`;
  }
}

function showManualConfirm(show){
  const row = document.getElementById("manualConfirmRow");
  const checkbox = document.getElementById("manualConfirm");
  if (!row) return;
  row.classList.toggle("is-visible", show);
  if (!show && checkbox) checkbox.checked = false;
}

function openNamePrompt(r, c, span, teamA, teamB){
  pending = { r, c, span, teamA, teamB, candidateName: null, candidatePhoto: null };

  document.getElementById("modalTeamA").textContent = teamA;
  document.getElementById("modalTeamB").textContent = teamB;

  const input = document.getElementById("playerInput");
  input.value = "";
  setModalFeedback("", "");
  showManualConfirm(false);
  showTransfermarktLink(false);
  showTransferHistory([]);
  showDebugRaw(null);
  clearSuggestions();
  const summary = document.getElementById("matchSummary");
  if (summary) summary.innerHTML = "";
  document.getElementById("modalConfirm").disabled = true;

  const modal = document.getElementById("nameModal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");

  setTimeout(() => input.focus(), 30);
}

function closeNamePrompt(){
  const modal = document.getElementById("nameModal");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  pending = null;
}

function directConfirmAnswer(){
  if (!pending) return;
  const input = document.getElementById("playerInput");
  const raw = input.value.trim();
  if (!raw) {
    setModalFeedback("Bitte einen Namen eingeben.", "error");
    return;
  }
  const norm = normalizeName(raw);
  if (usedPlayers.some(p => p.norm === norm)) {
    setModalFeedback("Dieser Spieler wurde in dieser Runde schon genannt.", "error");
    return;
  }
  pending.candidateName = raw;
  pending.candidatePhoto = null;
  setModalFeedback(`✓ ${raw}: direkt bestätigt.`, "success");
  showManualConfirm(false);
  // Direkt bestätigen ist bewusst ein Ein-Klick-Weg: sofort ins Feld übernehmen.
  commitMove();
}

async function checkAnswer(){
  if (!pending) return;
  const currentPending = pending;

  const input = document.getElementById("playerInput");
  const raw = input.value.trim();
  const confirmBtn = document.getElementById("modalConfirm");
  const checkBtn = document.getElementById("modalCheck");

  if (!raw) {
    setModalFeedback("Bitte einen Namen eingeben.", "error");
    showManualConfirm(false);
    showTransfermarktLink(false);
    showTransferHistory([]);
    renderMatchSummary(null);
    confirmBtn.disabled = true;
    pending.candidateName = null;
    return;
  }

  const norm = normalizeName(raw);
  if (usedPlayers.some(p => p.norm === norm)) {
    setModalFeedback("Dieser Spieler wurde in dieser Runde schon genannt.", "error");
    showManualConfirm(false);
    showTransfermarktLink(false);
    showTransferHistory([]);
    renderMatchSummary(null);
    confirmBtn.disabled = true;
    pending.candidateName = null;
    return;
  }

  // Fallback-Link steht sofort bereit, auch während/falls die Auto-Prüfung scheitert
  setModalFeedback("Prüfe automatisch über Transfermarkt …", "warn");
  showTransfermarktLink(true, raw);
  showManualConfirm(false);
  showTransferHistory([]);
  confirmBtn.disabled = true;
  checkBtn.disabled = true;

  const result = await tryAutoCheck(raw, pending.teamA, pending.teamB);

  // Falls der Dialog inzwischen geschlossen/gewechselt wurde: nichts mehr anfassen
  if (pending !== currentPending) return;
  checkBtn.disabled = false;

  if (result.status === "valid") {
    setModalFeedback(`✓ ${result.displayName}: automatisch bestätigt (laut Transfermarkt-Karriere für beide Vereine).`, "success");
    showManualConfirm(false);
    showTransfermarktLink(true, result.displayName, result.id);
    showTransferHistory(result.transfers, true, pending.teamA, pending.teamB);
    renderMatchSummary(result, pending.teamA, pending.teamB);
    showDebugRaw(result.raw);
    pending.candidateName = result.displayName;
    pending.candidatePhoto = result.photoUrl || null;
    confirmBtn.disabled = false;
  } else if (result.status === "checked_no_match") {
    setModalFeedback(`${result.displayName} gefunden, aber laut Karrierestationen nicht eindeutig für beide Vereine. Selbst prüfen und bei Einigkeit bestätigen.`, "warn");
    showManualConfirm(true);
    showTransfermarktLink(true, result.displayName, result.id);
    showTransferHistory(result.transfers, true, pending.teamA, pending.teamB);
    renderMatchSummary(result, pending.teamA, pending.teamB);
    showDebugRaw(result.raw);
    pending.candidateName = result.displayName;
    pending.candidatePhoto = result.photoUrl || null;
    confirmBtn.disabled = true;
  } else {
    // not_found oder error (Timeout, CORS, API down)
    const reason = result.status === "not_found" ? "Kein Treffer gefunden" : "Automatische Prüfung nicht möglich";
    setModalFeedback(`${reason}. Auf Transfermarkt nachschlagen und bei Einigkeit gemeinsam bestätigen.`, "warn");
    showManualConfirm(true);
    showTransfermarktLink(true, raw);
    showTransferHistory([]);
    showDebugRaw(null);
    pending.candidateName = raw;
    pending.candidatePhoto = null;
    confirmBtn.disabled = true;
  }
}

function renderCellMark(span, player, photoUrl, playerName){
  span.textContent = "";
  span.classList.add(`player-${player.toLowerCase()}`);
  span.classList.remove("has-photo");

  if (photoUrl) {
    span.classList.add("has-photo");
    const img = document.createElement("img");
    img.src = photoUrl;
    img.alt = "";
    img.className = "cell-photo";
    // Falls das Bild nicht lädt (z. B. tote URL): sauber auf X/O zurückfallen.
    img.addEventListener("error", () => {
      span.classList.remove("has-photo");
      span.innerHTML = "";
      span.textContent = player;
    });

    span.appendChild(img);

    if (playerName) {
      const nameTag = document.createElement("span");
      nameTag.className = "cell-photo__name";
      nameTag.textContent = playerName;
      span.appendChild(nameTag);
    }
  } else {
    span.textContent = player;
  }
}

function commitMove(){
  if (!pending || !pending.candidateName) return;

  const confirmBtn = document.getElementById("modalConfirm");
  if (confirmBtn.disabled) return;

  const { r, c, span, candidateName, candidatePhoto } = pending;

  boardState[r][c] = currentPlayer;
  usedPlayers.push({ norm: normalizeName(candidateName), displayName: candidateName });
  moveHistory.push({ type: "move", r, c, player: currentPlayer, playerName: candidateName, photoUrl: candidatePhoto || null });

  renderCellMark(span, currentPlayer, candidatePhoto, candidateName);

  updateUsedPlayersDisplay();
  setUndoButtonState();
  closeNamePrompt();

  if (navigator.vibrate) navigator.vibrate(12);
  updateGameStats();

  const winner = checkWin(lastSize);
  if (winner) {
    const winText = `🏆 Spieler ${winner} gewinnt!`;
    setResult(winText, winner === "X" ? "x" : "o");
    lockBoard();
    saveState(winText);
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    return;
  }

  currentPlayer = currentPlayer === "X" ? "O" : "X";
  setCurrentPlayerLabel();
  saveState("");
  updateGameStats();
}

function undoMove(){
  if (moveHistory.length === 0) return;

  const size = lastSize;
  const last = moveHistory.pop();

  if (last.type === "skip") {
    // Restore the player who had the skipped turn
    currentPlayer = last.player;
    setCurrentPlayerLabel();
    setUndoButtonState();
    saveState("");
    return;
  }

  // Default: normal move
  boardState[last.r][last.c] = "?";
  if (usedPlayers.length) usedPlayers.pop();
  updateUsedPlayersDisplay();

  // DOM-Update
  const cellEls = Array.from(document.querySelectorAll(".cell"));
  const idx = last.r * size + last.c;
  const cell = cellEls[idx];
  if (cell) {
    const span = cell.querySelector(".cell-content");
    if (span) {
      span.innerHTML = "";
      span.textContent = "?";
      span.classList.remove("player-x","player-o","has-photo");
    }
  }

  // Wenn vorher gewonnen wurde: Ergebnis/Highlights entfernen und wieder spielbar machen
  if (gameLocked) {
    unlockBoard();
    setResult("");
  }
  clearWinHighlights();

  // Spieler zurücksetzen (der Spieler des entfernten Zugs ist wieder dran)
  currentPlayer = last.player;
  setCurrentPlayerLabel();
  setUndoButtonState();
  saveState("");
  updateGameStats();
}

function skipTurn(){
  if (gameLocked) return;

  // Skip is undoable
  moveHistory.push({ type: "skip", player: currentPlayer });
  setUndoButtonState();

  currentPlayer = currentPlayer === "X" ? "O" : "X";
  setCurrentPlayerLabel();
  saveState("");
}


function generateBoard(forceNewTeams = true, restored = null) {
  if (restored) {
    lastSize = restored.lastSize;
    topTeams = restored.topTeams;
    sideTeams = restored.sideTeams;
    boardState = restored.boardState;
    currentPlayer = restored.currentPlayer;
    moveHistory = restored.moveHistory || [];
    usedPlayers = restored.usedPlayers || [];
    gameLocked = !!restored.gameLocked;
    roundStartedAt = restored.roundStartedAt || Date.now();
    elapsedBeforePause = restored.elapsedBeforePause || 0;
  } else {
    currentPlayer = 'X';
    moveHistory = [];
    usedPlayers = [];
    gameLocked = false;
    roundStartedAt = Date.now();
    elapsedBeforePause = 0;

    if (forceNewTeams) {
      const selected = shuffleFisherYates(teams).slice(0, lastSize * 2);
      topTeams = selected.slice(0, lastSize);
      sideTeams = selected.slice(lastSize);
    }

    boardState = Array.from({ length: lastSize }, () => Array(lastSize).fill("?"));
  }

  const size = lastSize;
  setUndoButtonState();
  updateUsedPlayersDisplay();
  updateGameStats();

  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  // Wichtig: Spalten/Rows sind (size+1)
  grid.style.gridTemplateColumns = `repeat(${size + 1}, var(--cell))`;

  const corner = document.createElement("div");
  corner.className = "corner-cell";
  grid.appendChild(corner);

  topTeams.forEach(t => grid.appendChild(createTeamCell(t)));

  for (let r = 0; r < size; r++) {
    grid.appendChild(createTeamCell(sideTeams[r]));

    for (let c = 0; c < size; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      const span = document.createElement("span");
      span.className = "cell-content";
      span.textContent = "?";
      cell.appendChild(span);

      cell.addEventListener("click", () => {
        if (gameLocked) return;
        if (boardState[r][c] !== "?") return;
        if (document.getElementById("nameModal").classList.contains("is-open")) return;

        openNamePrompt(r, c, span, sideTeams[r], topTeams[c]);
      });

      grid.appendChild(cell);
    }
  }

  // Bereits gesetzte Felder wiederherstellen (Foto/Name aus moveHistory, falls vorhanden)
  if (restored) {
    const moveByCell = {};
    moveHistory.forEach(mv => {
      if (mv.type === "move") moveByCell[`${mv.r},${mv.c}`] = mv;
    });
    const spans = Array.from(grid.querySelectorAll(".cell .cell-content"));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const mark = boardState[r][c];
        if (mark === "?") continue;
        const span = spans[r * size + c];
        const mv = moveByCell[`${r},${c}`];
        if (span) renderCellMark(span, mark, mv ? mv.photoUrl : null, mv ? mv.playerName : null);
      }
    }
  }

  setResult(restored && restored.resultText ? restored.resultText : "");
  setCurrentPlayerLabel();
  setUndoButtonState();
  updateGameStats();

  if (restored && gameLocked) {
    checkWin(size); // stellt die Gewinn-Hervorhebung der Linie wieder her
  }

  if (!restored) {
    saveState(""); // frisch gestartete Runde ebenfalls sichern
  }

  // Fit Board nach Render
  requestAnimationFrame(() => fitBoardToViewport(size));
  startTimer();
}

function createTeamCell(name) {
  const div = document.createElement("div");
  div.className = "team-logo";

  if (typeof teamData !== "undefined" && teamData[name]) {
    div.style.backgroundColor = teamData[name].color || "#444";

    if (teamData[name].logo) {
      const img = document.createElement("img");
      img.src = teamData[name].logo;
      img.alt = name;
      img.className = "team-img";
      div.appendChild(img);
    }
  }

  const logoOnly = document.getElementById("logoOnly");
  if (!logoOnly || !logoOnly.checked) {
    const span = document.createElement("span");
    span.innerText = name;
    div.appendChild(span);
  }

  return div;
}

function checkWin(size) {
  const lines = [];

  for (let i = 0; i < size; i++) {
    lines.push([...Array(size).keys()].map(j => [i, j]));
    lines.push([...Array(size).keys()].map(j => [j, i]));
  }

  lines.push([...Array(size).keys()].map(i => [i, i]));
  lines.push([...Array(size).keys()].map(i => [i, size - 1 - i]));

  document.querySelectorAll(".cell").forEach(el => el.classList.remove("correct-x","correct-o"));

  for (const line of lines) {
    const [r0, c0] = line[0];
    const first = boardState[r0][c0];
    if (first === "?") continue;

    if (line.every(([r,c]) => boardState[r][c] === first)) {
      const cellEls = Array.from(document.querySelectorAll(".cell"));
      const idx = (r,c) => r * size + c;

      line.forEach(([r,c]) => {
        cellEls[idx(r,c)]?.classList.add(`correct-${first.toLowerCase()}`);
      });

      return first;
    }
  }

  return null;
}

function setSize(size){
  lastSize = size;

  document.querySelectorAll(".segmented__btn").forEach(b => {
    const active = parseInt(b.dataset.size, 10) === size;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });

  generateBoard(true);
}

window.addEventListener("resize", () => fitBoardToViewport(lastSize));
window.addEventListener("orientationchange", () => {
  setTimeout(() => fitBoardToViewport(lastSize), 150);
});

window.addEventListener("load", () => {
  document.querySelectorAll(".segmented__btn").forEach(btn => {
    btn.addEventListener("click", () => setSize(parseInt(btn.dataset.size, 10)));
  });

  document.getElementById("newRoundBtn").addEventListener("click", () => {
    if (moveHistory.length && !confirm('Neue Runde starten? Der aktuelle Spielstand wird ersetzt.')) return;
    clearSavedState();
    generateBoard(true);
  });

  const undoBtn = document.getElementById("undoBtn");
  if (undoBtn) undoBtn.addEventListener("click", undoMove);

  const skipBtn = document.getElementById("skipBtn");
  if (skipBtn) skipBtn.addEventListener("click", skipTurn);

  // Cmd/Ctrl+Z als Shortcut
  document.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (e.key.toLowerCase() !== "z") return;
    // nicht in Eingabefeldern
    const t = e.target;
    const isTyping = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (isTyping) return;
    e.preventDefault();
    undoMove();
  });

  document.getElementById("logoOnly").addEventListener("change", (e) => {
    document.body.classList.toggle("only-logos", e.target.checked);
    generateBoard(false);
  });

  const rulesModal = document.getElementById('rulesModal');
  const closeRules = () => { rulesModal.classList.remove('is-open'); rulesModal.setAttribute('aria-hidden','true'); };
  document.getElementById('rulesBtn').addEventListener('click', () => { rulesModal.classList.add('is-open'); rulesModal.setAttribute('aria-hidden','false'); });
  document.getElementById('rulesClose').addEventListener('click', closeRules);
  rulesModal.addEventListener('click', e => { if (e.target === rulesModal) closeRules(); });

  // --- Spieler-Abfrage-Modal ---
  document.getElementById("modalCheck").addEventListener("click", checkAnswer);
  document.getElementById("modalDirect").addEventListener("click", directConfirmAnswer);

  document.getElementById("debugToggle").addEventListener("click", () => {
    const box = document.getElementById("debugRaw");
    const nowVisible = !box.classList.contains("is-visible");
    box.classList.toggle("is-visible", nowVisible);
    if (nowVisible) {
      box.focus();
      box.select();
    }
  });
  document.getElementById("modalConfirm").addEventListener("click", commitMove);
  document.getElementById("modalCancel").addEventListener("click", closeNamePrompt);

  document.getElementById("manualConfirm").addEventListener("change", (e) => {
    const confirmBtn = document.getElementById("modalConfirm");
    confirmBtn.disabled = !e.target.checked || !pending || !pending.candidateName;
  });

  document.getElementById("nameModal").addEventListener("click", (e) => {
    if (e.target.id === "nameModal") closeNamePrompt();
  });

  const careerToggle = document.getElementById("careerToggle");
  const careerBody = document.getElementById("careerBody");
  if (careerToggle && careerBody) careerToggle.addEventListener("click", () => {
    const collapsed = careerBody.classList.toggle("is-collapsed");
    careerToggle.classList.toggle("is-collapsed", collapsed);
    careerToggle.setAttribute("aria-expanded", String(!collapsed));
  });

  document.getElementById("playerInput").addEventListener("keydown", (e) => {
    if (["ArrowDown", "ArrowUp"].includes(e.key) && suggestionCandidates.length) {
      e.preventDefault();
      activeSuggestionIndex = e.key === "ArrowDown"
        ? Math.min(activeSuggestionIndex + 1, suggestionCandidates.length - 1)
        : Math.max(activeSuggestionIndex - 1, 0);
      renderSuggestionActive();
      return;
    }
    if (e.key === "Escape") { clearSuggestions(); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (activeSuggestionIndex >= 0) { selectPlayerSuggestion(activeSuggestionIndex); return; }
    const confirmBtn = document.getElementById("modalConfirm");
    if (!confirmBtn.disabled) commitMove(); else checkAnswer();
  });

  document.getElementById("playerInput").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    pending && (pending.candidateName = null, pending.candidateId = null, pending.candidatePhoto = null);
    clearTimeout(suggestDebounceTimer);
    if (q.length < 2) { clearSuggestions(); return; }
    suggestDebounceTimer = setTimeout(() => fetchNameSuggestions(q), 300);
  });

  document.getElementById("nameModal").addEventListener("click", (e) => {
    if (!e.target.closest(".player-search-wrap")) clearSuggestions();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("nameModal").classList.contains("is-open")) {
      closeNamePrompt();
    }
  });

  // Gespeicherten Spielstand wiederherstellen (z. B. nach Tab-Reload auf dem Handy),
  // sonst normal mit einer frischen 3×3-Runde starten.
  const saved = loadState();
  if (saved) {
    lastSize = saved.lastSize;
    document.querySelectorAll(".segmented__btn").forEach(b => {
      const active = parseInt(b.dataset.size, 10) === saved.lastSize;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    generateBoard(false, saved);
  } else {
    setSize(3);
  }
});
