
const teams = [
  "FC Bayern München", "Borussia Dortmund", "RB Leipzig", "Bayer Leverkusen",
  "VfB Stuttgart", "Eintracht Frankfurt", "TSG Hoffenheim", "1. FC Heidenheim",
  "Werder Bremen", "SC Freiburg", "FC Augsburg", "VfL Wolfsburg",
  "Borussia Mönchengladbach", "1. FC Union Berlin", "1. FSV Mainz 05",
  "1. FC Köln", "FC St. Pauli", "Hamburger SV"
];

const teamColors = {
  "FC Bayern München": "#dc052d",
  "Borussia Dortmund": "#fdee00",
  "RB Leipzig": "#c8102e",
  "Bayer Leverkusen": "#e32219",
  "VfB Stuttgart": "#ed1c24",
  "Eintracht Frankfurt": "#ed1c24",
  "TSG Hoffenheim": "#005ca9",
  "1. FC Heidenheim": "#004494",
  "Werder Bremen": "#008557",
  "SC Freiburg": "#000000",
  "FC Augsburg": "#a51e36",
  "VfL Wolfsburg": "#65b32e",
  "Borussia Mönchengladbach": "#000000",
  "1. FC Union Berlin": "#d40511",
  "1. FSV Mainz 05": "#ed1c24",
  "1. FC Köln": "#e32219",
  "FC St. Pauli": "#6c2e1f",
  "Hamburger SV": "#0f1e44"
};

let currentPlayer = "X";
let gameOver = false;

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function generateBoard() {
  currentPlayer = "X";
  gameOver = false;
  const size = parseInt(document.getElementById("gridSize").value);
  const required = size * 2;
  const selected = shuffle(teams).slice(0, required);
  const top = selected.slice(0, size);
  const left = selected.slice(size);

  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${size + 1}, 1fr)`;

  grid.appendChild(document.createElement("div"));
  top.forEach(t => {
    grid.appendChild(createTeamCell(t));
  });

  for (let r = 0; r < size; r++) {
    grid.appendChild(createTeamCell(left[r]));
    for (let c = 0; c < size; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const content = document.createElement("div");
      content.className = "cell-content";
      content.innerText = "";
      cell.appendChild(content);

      cell.addEventListener("click", () => toggleCell(cell, content, size));
      grid.appendChild(cell);
    }
  }

  document.getElementById("result").textContent = "";
}

function toggleCell(cell, content, size) {
  if (gameOver) return;

  if (content.innerText === "") {
    // Leeres Feld → Spieler setzt Zeichen
    content.innerText = currentPlayer;
    content.className = "cell-content " + (currentPlayer === "X" ? "player-x" : "player-o");
    checkWinByGrid(size);
    if (!gameOver) {
      currentPlayer = currentPlayer === "X" ? "O" : "X";
    }
  } else {
    // Belegtes Feld → wird gelöscht
    content.innerText = "";
    content.className = "cell-content";
    document.getElementById("result").innerText = "";
    gameOver = false;
  }
}

function createTeamCell(name) {
  const div = document.createElement("div");
  div.className = "team-logo";

  if (teamColors[name]) {
    div.style.backgroundColor = teamColors[name];
    div.style.color = "#ffffff";
  }

  if (logoMap[name]) {
    const img = document.createElement("img");
    img.src = logoMap[name];
    img.alt = name;
    img.style.height = "28px";
    img.style.width = "28px";
    img.style.objectFit = "contain";
    img.style.marginRight = "0.5rem";
    div.appendChild(img);
  }

  const logoOnly = document.getElementById("logoOnly");
  if (!logoOnly || !logoOnly.checked) {
    const span = document.createElement("span");
    span.innerText = name;
    div.appendChild(span);
  }

  return div;
}

function checkWinByGrid(size) {
  const grid = Array.from(document.querySelectorAll(".cell .cell-content"))
    .map(el => el.innerText.trim());

  let lines = [];

  for (let i = 0; i < size; i++) {
    lines.push([...Array(size).keys()].map(j => i * size + j));
    lines.push([...Array(size).keys()].map(j => j * size + i));
  }

  lines.push([...Array(size).keys()].map(i => i * size + i));
  lines.push([...Array(size).keys()].map(i => i * size + (size - 1 - i)));

  for (const line of lines) {
    const first = grid[line[0]];
    if (first && line.every(idx => grid[idx] === first)) {
      const contents = document.querySelectorAll(".cell .cell-content");
      line.forEach(idx => contents[idx].classList.add("correct"));
      document.getElementById("result").innerText = `🏆 Spieler ${first} gewinnt!`;
      gameOver = true;
      return true;
    }
  }

  return false;
}

window.onload = generateBoard;
