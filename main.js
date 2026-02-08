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
let lastSize = 0;

function shuffleFisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateBoard(forceNewTeams = true) {
  currentPlayer = 'X';

  const size = parseInt(document.getElementById("gridSize").value, 10);

  if (forceNewTeams || size !== lastSize) {
    const selected = shuffleFisherYates(teams).slice(0, size * 2);
    topTeams = selected.slice(0, size);
    sideTeams = selected.slice(size);
    lastSize = size;
  }

  boardState = Array.from({ length: size }, () => Array(size).fill("?"));

  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  // Wichtig: konsistent mit CSS-Variablen (iPhone-friendly)
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
        // “Editor”-Cycling beibehalten: ? -> X -> O -> ?
        const val = span.textContent;

        if (val === "?") {
          span.textContent = currentPlayer;
          span.className = `cell-content player-${currentPlayer.toLowerCase()}`;
          cell.style.boxShadow = currentPlayer === 'X'
            ? "0 0 8px #F042FF"
            : "0 0 8px #87F5F5";
          boardState[r][c] = currentPlayer;

          checkWin(size);

          currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
          document.getElementById("currentPlayer").textContent = `Spieler ${currentPlayer} ist am Zug`;
          return;
        }

        if (val === "X") {
          span.textContent = "O";
          span.className = "cell-content player-o";
          cell.style.boxShadow = "0 0 8px #87F5F5";
          boardState[r][c] = "O";
          checkWin(size);
          return;
        }

        if (val === "O") {
          span.textContent = "?";
          span.className = "cell-content";
          cell.style.boxShadow = "none";
          boardState[r][c] = "?";
          checkWin(size);
        }
      });

      grid.appendChild(cell);
    }
  }

  document.getElementById("result").textContent = "";
  const info = document.getElementById("currentPlayer");
  if (info) info.textContent = `Spieler ${currentPlayer} ist am Zug`;

  // iOS: beim Öffnen “snappy” starten – optional
  // requestAnimationFrame(() => grid.scrollIntoView({ block: "nearest" }));
}

function createTeamCell(name) {
  const div = document.createElement("div");
  div.className = "team-logo";

  if (typeof teamData !== "undefined" && teamData[name]) {
    div.style.backgroundColor = teamData[name].color || "#444";
    div.style.color = "#ffffff";

    if (teamData[name].logo) {
      const img = document.createElement("img");
      img.src = teamData[name].logo;
      img.alt = name;
      img.className = "team-img"; // Größe kommt aus CSS (wichtig für iPhone)
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
  const cells = Array.from(document.querySelectorAll(".cell-content"));
  const values = cells.map(s => s.textContent.trim());
  const lines = [];

  for (let i = 0; i < size; i++) {
    lines.push([...Array(size).keys()].map(j => i * size + j));     // rows
    lines.push([...Array(size).keys()].map(j => j * size + i));     // cols
  }

  lines.push([...Array(size).keys()].map(i => i * size + i));                 // diag
  lines.push([...Array(size).keys()].map(i => i * size + (size - 1 - i)));    // anti-diag

  // Reset vorherige Winner-Animationen
  document.querySelectorAll(".cell").forEach(el => {
    el.classList.remove("correct-x", "correct-o");
  });

  for (const line of lines) {
    const first = values[line[0]];
    if (first && first !== "?" && line.every(idx => values[idx] === first)) {
      line.forEach(idx => {
        cells[idx].parentElement.classList.add(`correct-${first.toLowerCase()}`);
      });

      const resultEl = document.getElementById("result");
      resultEl.textContent = `🏆 Spieler ${first} gewinnt!`;
      resultEl.className = first === "X" ? "player-x" : "player-o";

      // iOS Haptics (best effort)
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);

      return;
    }
  }

  document.getElementById("result").textContent = "";
}

window.onload = () => generateBoard(true);

document.getElementById("logoOnly").addEventListener("change", () => {
  document.body.classList.toggle("only-logos", document.getElementById("logoOnly").checked);
  generateBoard(false);
});

document.getElementById("gridSize").addEventListener("change", () => generateBoard(true));
