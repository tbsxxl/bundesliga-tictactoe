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

function generateBoard(forceNewTeams = true) {
  currentPlayer = 'X';

  const size = lastSize;

  if (forceNewTeams) {
    const selected = shuffleFisherYates(teams).slice(0, size * 2);
    topTeams = selected.slice(0, size);
    sideTeams = selected.slice(size);
  }

  boardState = Array.from({ length: size }, () => Array(size).fill("?"));

  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  // iOS-friendly: stabile Spaltenbreite über CSS Vars
  grid.style.gridTemplateColumns = `var(--label) repeat(${size}, var(--cell))`;

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
        // Aktueller Modus: ? -> X/O (mit Turn) und danach blocken? (hier: klassisch TicTacToe)
        if (boardState[r][c] !== "?") return;

        boardState[r][c] = currentPlayer;
        span.textContent = currentPlayer;
        span.classList.add(`player-${currentPlayer.toLowerCase()}`);

        // iOS Haptics (best effort)
        if (navigator.vibrate) navigator.vibrate(12);

        const winner = checkWin(size);
        if (winner) {
          setResult(`🏆 Spieler ${winner} gewinnt!`, winner === "X" ? "x" : "o");
          // Board lock (optional): nach Win keine weiteren Klicks
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
}

function lockBoard(){
  document.querySelectorAll(".cell").forEach(cell => {
    cell.style.pointerEvents = "none";
    cell.style.opacity = "0.98";
  });
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
    lines.push([...Array(size).keys()].map(j => [i, j])); // rows
    lines.push([...Array(size).keys()].map(j => [j, i])); // cols
  }

  lines.push([...Array(size).keys()].map(i => [i, i]));
  lines.push([...Array(size).keys()].map(i => [i, size - 1 - i]));

  // reset highlights
  document.querySelectorAll(".cell").forEach(el => el.classList.remove("correct-x","correct-o"));

  for (const line of lines) {
    const [r0, c0] = line[0];
    const first = boardState[r0][c0];
    if (first === "?" ) continue;

    if (line.every(([r,c]) => boardState[r][c] === first)) {
      // highlight cells
      const flatIndex = (r,c) => r * size + c;
      const cellEls = Array.from(document.querySelectorAll(".cell"));
      line.forEach(([r,c]) => {
        cellEls[flatIndex(r,c)]?.classList.add(`correct-${first.toLowerCase()}`);
      });
      return first;
    }
  }

  return null;
}

/* UI Wiring */
function setSize(size){
  lastSize = size;
  document.querySelectorAll(".segmented__btn").forEach(b => {
    const active = parseInt(b.dataset.size, 10) === size;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  generateBoard(true);
}

window.addEventListener("load", () => {
  // segmented
  document.querySelectorAll(".segmented__btn").forEach(btn => {
    btn.addEventListener("click", () => setSize(parseInt(btn.dataset.size, 10)));
  });

  document.getElementById("newRoundBtn").addEventListener("click", () => generateBoard(true));

  document.getElementById("logoOnly").addEventListener("change", (e) => {
    document.body.classList.toggle("only-logos", e.target.checked);
    generateBoard(false);
  });

  // init
  setSize(3);
});
