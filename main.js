document.addEventListener("DOMContentLoaded", function() {
const teamsOnly = [
    "FC Bayern München", "Borussia Dortmund", "RB Leipzig", "Bayer Leverkusen",
    "VfB Stuttgart", "Eintracht Frankfurt", "TSG Hoffenheim", "1. FC Heidenheim",
    "Werder Bremen", "SC Freiburg", "FC Augsburg", "VfL Wolfsburg",
    "Borussia Mönchengladbach", "1. FC Union Berlin", "1. FSV Mainz 05",
    "1. FC Köln", "FC St. Pauli", "Hamburger SV"
  ];

  const extras = ["Deutscher Meister", "DFB-Pokal-Sieger"];

  

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function injectExtrasInTeamList(teamList, count) {
    const result = [...teamList];
    for (let i = 0; i < count; i++) {
      const index = Math.floor(Math.random() * result.length);
      const extra = extras[Math.floor(Math.random() * extras.length)];
      result[index] = extra;
    }
    return result;
  }

function generateBoard() {
  const size = parseInt(document.getElementById("gridSize").value);
  let pool = shuffle([...teamsOnly]);
  const required = size * 2;
  if (document.getElementById("withExtras").checked) {
    pool = injectExtrasInTeamList(pool, Math.max(1, Math.floor(size / 2)));
  }
  pool = [...new Set(pool)].slice(0, required);
  if (pool.length < required) return alert("Nicht genug Teams verfügbar.");
  const topRow = pool.slice(0, size);
  const leftCol = pool.slice(size, required);
  const gridContainer = document.getElementById("gridContainer");
  gridContainer.innerHTML = "";
  gridContainer.style.display = "grid";
  gridContainer.style.gridTemplateColumns = "repeat(" + (size + 1) + ", 1fr)";
  gridContainer.style.gridTemplateRows = "repeat(" + (size + 1) + ", 80px)";
  gridContainer.style.gap = "0.5rem";
  gridContainer.appendChild(createEmptyCell());
  for (let i = 0; i < size; i++) {
    gridContainer.appendChild(createTeamLogo(topRow[i]));
  }
  for (let row = 0; row < size; row++) {
    gridContainer.appendChild(createTeamLogo(leftCol[row]));
    for (let col = 0; col < size; col++) {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "?";
      input.oninput = () => {
        input.value = input.value.toUpperCase();
        checkWin(size);
      };
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.appendChild(input);
      gridContainer.appendChild(cell);
    }
  }
  document.getElementById("result").innerText = "";
}

    for (let row = 0; row < size; row++) {
      gridContainer.appendChild(createTeamLogo(leftCol[row]));
      for (let col = 0; col < size; col++) {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "?";
        input.oninput = () => {
          input.value = input.value.toUpperCase();
          checkWin(size);
        };
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.appendChild(input);
        gridContainer.appendChild(cell);
      }
    }

    document.getElementById("result").innerText = "";
  }

  function createEmptyCell() {
    const div = document.createElement("div");
    div.className = "empty";
    return div;
  }

  function createTeamLogo(name) {
    const div = document.createElement("div");
    div.className = "team-logo";
    if (logoMap[name]) {
      const img = document.createElement("img");
      img.src = logoMap[name];
      img.alt = name;
      img.style.height = "36px";
      img.style.marginBottom = "4px";
      div.appendChild(img);
    }
    const span = document.createElement("span");
    span.innerText = name;
    div.appendChild(span);
    return div;
  }

  function checkWin(size) {
    const inputs = Array.from(document.querySelectorAll(".cell input"));
    const grid = inputs.map(input => input.value.trim());

    let lines = [];
    for (let i = 0; i < size; i++) {
      lines.push([...Array(size).keys()].map(j => i * size + j));
      lines.push([...Array(size).keys()].map(j => j * size + i));
    }
    lines.push([...Array(size).keys()].map(i => i * size + i));
    lines.push([...Array(size).keys()].map(i => i * size + (size - 1 - i)));

    for (const line of lines) {
      const first = grid[line[0]];
      if (first && line.every(index => grid[index] === first)) {
        line.forEach(i => {
          inputs[i].classList.add("correct");
          inputs[i].disabled = true;
        });
        document.getElementById("result").innerText = "🏆 Tic Tac Toe!";
        return;
      }
    }
  }
generateBoard();
});
window.generateBoard = generateBoard;