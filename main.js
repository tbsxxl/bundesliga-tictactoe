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
  gameLocked = true;
  document.querySelectorAll(".cell").forEach(cell => {
    cell.style.pointerEvents = "none";
    cell.style.opacity = "0.98";
  });
}

function unlockBoard(){
  gameLocked = false;
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

// Der zuverlässigste Name steckt im URL-Slug selbst (.../keven-schlotterbeck/.../spieler/413843),
// nicht im umgebenden Fließtext. Pro Spieler-ID wird der längste (aussagekräftigste) Slug behalten;
// Platzhalter wie "-" oder "x" werden ignoriert.
function extractPlayerCandidates(markdown) {
  const bySlug = new Map();
  const re = /transfermarkt\.(?:de|com|co\.uk)\/([a-z0-9\-]+)\/[a-z\-]+\/spieler\/(\d+)/gi;
  let m;
  while ((m = re.exec(markdown || ""))) {
    const slug = m[1];
    const id = m[2];
    if (!slug || slug.length < 3 || slug === "x") continue;
    const prev = bySlug.get(id);
    if (!prev || slug.length > prev.length) bySlug.set(id, slug);
  }
  return [...bySlug.entries()].map(([id, slug]) => ({ id, slug, name: slugToName(slug) }));
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
  const candidates = extractPlayerCandidates(md);
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
  const baseNamesSeen = new Set();
  const add = (value) => {
    if (!value) return;
    let name = value.replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    name = name.replace(/^[-•*]\s*/, '').replace(/\s*\|\s*$/, '').trim();
    if (!name || name.length < 3) return;
    if (/^(Transfermarkt|Transferdetails|Transferzeitpunkt|Saison|Wettbewerb|Liga|Liga-Art|Trainer|Manager|Marktwert|Alter|Ablöse|Restvertragslaufzeit|Datum|Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland|Frankreich|France|England|Spain|Spanien|Italy|Italien|Niederlande|Netherlands)$/i.test(name)) return;
    if (/nationalmannschaft|nationalteam|\b(?:U(?:15|16|17|18|19|20|21|23))\b/i.test(name)) return;
    if (/^(image|logo|wappen|news|community|statistik|detailsuche)/i.test(name)) return;
    // Saison-Label wie "26/27" oder "2025/26" ist kein Verein (Reste von Saison-Auswahl-Links).
    if (/^\d{2,4}\s*\/\s*\d{2,4}$/.test(name)) return;
    const key = normalizeName(name);
    if (seen.has(key)) return;
    // Reserve-/Zweitmannschaften (" II", " 2") mit der Hauptmannschaft zusammenfassen,
    // wenn diese ohnehin schon in der Liste steht.
    const baseKey = normalizeName(name.replace(/\s+(ii|2)$/i, ''));
    if (baseKey !== key && baseNamesSeen.has(baseKey)) return;
    seen.add(key);
    baseNamesSeen.add(baseKey === key ? key : baseKey);
    clubs.push(name);
  };

  // 1) Current/regular club links. Saison-Auswahl-Links (.../saison_id/2015) werden
  //    übersprungen – deren Linktext ist ein Saisonlabel ("15/16"), kein Vereinsname.
  const re = /\[([^\]\n]{2,100})\]\((https?:\/\/www\.transfermarkt\.(?:de|com|co\.uk)\/[^\s)]*\/verein\/\d+[^\s)]*)\)/gi;
  let m;
  while ((m = re.exec(markdown))) {
    if (/saison_id/i.test(m[2])) continue;
    add(m[1]);
  }

  // 2) Transfermarkt's youth-club summary is plain text, not reliably linked.
  const youth = markdown.match(/(?:Jugendvereine|Youth clubs|Clubs juveniles|Clubes juveniles)\s*\n+([^\n]+)/i);
  if (youth) youth[1].split(/,\s*/).forEach(x => add(x.replace(/\s*\([^)]*\)/g, '')));

  // 3) Transfer-detail rows. Reader output commonly renders the two clubs as a pipe-separated line.
  const lines = markdown.split(/\n+/).map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\|/.test(line)) continue;
    const parts = line.split('|').map(x => x.replace(/\[|\]/g, '').trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) continue;
    const joined = parts.join(' ');
    if (/Wettbewerb|Liga|Trainer|Manager|Marktwert|Alter|Ablöse|Restvertrags|Transferzeitpunkt|Saison/i.test(joined)) continue;
    parts.slice(0,2).forEach(x => add(x));
  }

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

async function tryAutoCheck(name, teamA, teamB){
  try {
    const best = await searchTransfermarktPlayer(name);
    if (!best || !best.id) return { status: "not_found" };

    const transfersMd = await fetchTransfermarktTransfers(best.id, best.slug || "");
    const diagnostics = buildDiagnosticsSummary(transfersMd, teamA, teamB);
    console.log(`[TM-Check] Spieler-ID ${best.id}\n${diagnostics}`);

    const careerClubs = extractCareerClubs(transfersMd);
    const careerText = careerClubs.join(" | ");
    const hasA = textContainsTeam(careerText, teamA) || textContainsTeam(transfersMd, teamA);
    const hasB = textContainsTeam(careerText, teamB) || textContainsTeam(transfersMd, teamB);
    const photoUrl = extractPortraitUrl(transfersMd, best.id);

    // Show all identifiable clubs in the player's Transfermarkt career.
    if (hasA && hasB) {
      return { status: "valid", id: best.id, displayName: best.name || name, matchedTeams: [teamA, teamB], clubs: careerClubs, transfers: careerClubs, raw: diagnostics, photoUrl };
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
  const looksIncomplete = rows && rows.length > 0 && rows.length < 3;

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
async function fetchNameSuggestions(query){
  try {
    const searchUrl = `${TM_READER_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(searchUrl, 8000);
    if (!res.ok) return;
    const md = await res.text();
    const candidates = extractPlayerCandidates(md).slice(0, 8);
    const datalist = document.getElementById("playerSuggestions");
    if (!datalist) return;
    datalist.innerHTML = "";
    candidates.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.name;
      datalist.appendChild(opt);
    });
  } catch (err) {
    // Vorschläge sind reiner Komfort – ein Fehlschlag blockiert nie die Eingabe
  }
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
  document.getElementById("modalConfirm").disabled = false;
  setModalFeedback(`✓ ${raw}: direkt bestätigt – ohne automatische Prüfung.`, "success");
  showManualConfirm(false);
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
    showDebugRaw(result.raw);
    pending.candidateName = result.displayName;
    pending.candidatePhoto = result.photoUrl || null;
    confirmBtn.disabled = false;
  } else if (result.status === "checked_no_match") {
    setModalFeedback(`${result.displayName} gefunden, aber laut Karrierestationen nicht eindeutig für beide Vereine. Selbst prüfen und bei Einigkeit bestätigen.`, "warn");
    showManualConfirm(true);
    showTransfermarktLink(true, result.displayName, result.id);
    showTransferHistory(result.transfers, true, pending.teamA, pending.teamB);
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
  } else {
    currentPlayer = 'X';
    moveHistory = [];
    usedPlayers = [];
    gameLocked = false;

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

  if (restored && gameLocked) {
    checkWin(size); // stellt die Gewinn-Hervorhebung der Linie wieder her
  }

  if (!restored) {
    saveState(""); // frisch gestartete Runde ebenfalls sichern
  }

  // Fit Board nach Render
  requestAnimationFrame(() => fitBoardToViewport(size));
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

  document.getElementById("newRoundBtn").addEventListener("click", () => generateBoard(true));

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

  document.getElementById("playerInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const confirmBtn = document.getElementById("modalConfirm");
    if (!confirmBtn.disabled) {
      commitMove();
    } else {
      checkAnswer();
    }
  });

  document.getElementById("playerInput").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearTimeout(suggestDebounceTimer);
    if (q.length < 3) return;
    suggestDebounceTimer = setTimeout(() => fetchNameSuggestions(q), 450);
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
