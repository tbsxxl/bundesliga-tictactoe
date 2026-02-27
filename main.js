let currentPlayer = 'X';

const teams = [
  "FC Bayern München", "Borussia Dortmund", "RB Leipzig", "Bayer Leverkusen",
  "VfB Stuttgart", "Eintracht Frankfurt", "TSG Hoffenheim", "1. FC Heidenheim",
  "Werder Bremen", "SC Freiburg", "FC Augsburg", "VfL Wolfsburg",
  "Borussia Mönchengladbach", "1. FC Union Berlin", "1. FSV Mainz 05",
  "1. FC Köln", "FC St. Pauli", "Hamburger SV"
];

let boardState = [];
let topTeams = [];
let sideTeams = [];
let lastSize = 3;
let moveHistory = []; // Stack: { type:'move', r, c, player } | { type:'skip', player }
let gameLocked = false;

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

function undoMove(){
  if (moveHistory.length === 0) return;

  const size = lastSize;
  const last = moveHistory.pop();

  if (last.type === "skip") {
    // Restore the player who had the skipped turn
    currentPlayer = last.player;
    setCurrentPlayerLabel();
    setUndoButtonState();
    return;
  }

  // Default: normal move
  boardState[last.r][last.c] = "?";

  // DOM-Update
  const cellEls = Array.from(document.querySelectorAll(".cell"));
  const idx = last.r * size + last.c;
  const cell = cellEls[idx];
  if (cell) {
    const span = cell.querySelector(".cell-content");
    if (span) {
      span.textContent = "?";
      span.classList.remove("player-x","player-o");
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
}

function skipTurn(){
  if (gameLocked) return;

  // Skip is undoable
  moveHistory.push({ type: "skip", player: currentPlayer });
  setUndoButtonState();

  currentPlayer = currentPlayer === "X" ? "O" : "X";
  setCurrentPlayerLabel();
}


function generateBoard(forceNewTeams = true) {
  currentPlayer = 'X';
  moveHistory = [];
  gameLocked = false;
  setUndoButtonState();

  const size = lastSize;

  if (forceNewTeams) {
    const selected = shuffleFisherYates(teams).slice(0, size * 2);
    topTeams = selected.slice(0, size);
    sideTeams = selected.slice(size);
  }

  boardState = Array.from({ length: size }, () => Array(size).fill("?"));

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
        if (boardState[r][c] !== "?") return;

        boardState[r][c] = currentPlayer;
        moveHistory.push({ type: 'move', r, c, player: currentPlayer });
        span.textContent = currentPlayer;
        span.classList.add(`player-${currentPlayer.toLowerCase()}`);

        setUndoButtonState();

        if (navigator.vibrate) navigator.vibrate(12);

        const winner = checkWin(size);
        if (winner) {
          setResult(`🏆 Spieler ${winner} gewinnt!`, winner === "X" ? "x" : "o");
          lockBoard();
          if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
          return;
        }

        currentPlayer = currentPlayer === "X" ? "O" : "X";
        setCurrentPlayerLabel();
      });

      grid.appendChild(cell);
    }
  }

  setResult("");
  setCurrentPlayerLabel();
  setUndoButtonState();

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

  setSize(3);
});
