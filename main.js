
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
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "?";
      input.addEventListener("input", () => {
        input.value = input.value.toUpperCase();
        checkWin(size);
      });
      cell.appendChild(input);
      grid.appendChild(cell);
    }
  }

  document.getElementById("result").textContent = "";
}

function createTeamCell(name) {
  const div = document.createElement("div");
  div.className = "team-logo";
  if (logoMap[name]) {
    const img = document.createElement("img");
    img.src = logoMap[name];
    img.alt = name;
    img.style.height = "36px";
    img.style.marginRight = "6px";
    div.appendChild(img);
  }
  const span = document.createElement("span");
  span.innerText = name;
  div.appendChild(span);
  return div;
}

function checkWin(size) {
  const inputs = Array.from(document.querySelectorAll(".cell input"));
  const values = inputs.map(i => i.value.trim());
  const lines = [];

  for (let i = 0; i < size; i++) {
    lines.push([...Array(size).keys()].map(j => i * size + j));
    lines.push([...Array(size).keys()].map(j => j * size + i));
  }

  lines.push([...Array(size).keys()].map(i => i * size + i));
  lines.push([...Array(size).keys()].map(i => i * size + (size - 1 - i)));

  for (const line of lines) {
    const first = values[line[0]];
    if (first && line.every(idx => values[idx] === first)) {
      line.forEach(idx => {
        inputs[idx].classList.add("correct");
        inputs[idx].disabled = true;
      });
      document.getElementById("result").textContent = "🏆 Tic Tac Toe!";
      return;
    }
  }
}

window.onload = generateBoard;
