let currentPlayer = 'X';

const teams = [
  "FC Bayern München", "Borussia Dortmund", "RB Leipzig", "Bayer Leverkusen",
  "VfB Stuttgart", "Eintracht Frankfurt", "TSG Hoffenheim", "1. FC Heidenheim",
  "Werder Bremen", "SC Freiburg", "FC Augsburg", "VfL Wolfsburg",
  "Borussia Mönchengladbach", "1. FC Union Berlin", "1. FSV Mainz 05",
  "1. FC Köln", "FC St. Pauli", "Hamburger SV"
];

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function generateBoard() {
  currentPlayer = 'X';
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
      const span = document.createElement("span");
      span.className = "cell-content";
      span.textContent = "?";

      cell.appendChild(span);
      cell.addEventListener("click", () => {
        if (span.textContent === "?") {
          span.textContent = currentPlayer;
          span.className = `cell-content player-${currentPlayer.toLowerCase()}`;
          checkWin(size);
          currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
          document.getElementById("currentPlayer").textContent = `Spieler ${currentPlayer} ist am Zug`;
        }
      });

      grid.appendChild(cell);
    }
  }

  document.getElementById("result").textContent = "";
  document.getElementById("currentPlayer").textContent = `Spieler ${currentPlayer} ist am Zug`;
}

function createTeamCell(name) {
  const div = document.createElement("div");
  div.className = "team-logo";

  if (teamData[name]) {
    div.style.backgroundColor = teamData[name].color;
    div.style.color = "#ffffff";

    if (teamData[name].logo) {
      const img = document.createElement("img");
      img.src = teamData[name].logo;
      img.alt = name;
      img.style.height = "28px";
      img.style.width = "28px";
      img.style.objectFit = "contain";
      img.style.marginRight = "0.5rem";
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
    lines.push([...Array(size).keys()].map(j => i * size + j));
    lines.push([...Array(size).keys()].map(j => j * size + i));
  }

  lines.push([...Array(size).keys()].map(i => i * size + i));
  lines.push([...Array(size).keys()].map(i => i * size + (size - 1 - i)));

  for (const line of lines) {
    const first = values[line[0]];
    if (first && first !== "?" && line.every(idx => values[idx] === first)) {
      line.forEach(idx => {
        cells[idx].classList.add("correct");
      });
      document.getElementById("result").textContent = `🏆 Spieler ${first} gewinnt!`;
      return;
    }
  }

  document.getElementById("result").textContent = "";
}

window.onload = generateBoard;