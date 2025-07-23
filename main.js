
let currentPlayer = 'X';
let boardSize = 3;
let board = [];

function generateBoard() {
  boardSize = parseInt(document.getElementById('gridSize').value);
  const grid = document.getElementById('grid');
  const logoOnly = document.getElementById('logoOnly').checked;

  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${boardSize + 1}, auto)`;

  board = Array.from({ length: boardSize }, () => Array(boardSize).fill(''));

  // Spaltenköpfe
  grid.appendChild(document.createElement('div')); // leere Ecke
  for (let col = 0; col < boardSize; col++) {
    const header = document.createElement('div');
    header.className = 'team-logo';
    const logo = getRandomTeam();
    header.style.backgroundColor = logo.color;
    if (logoOnly) {
      const img = document.createElement('img');
      img.src = logo.logo;
      img.alt = '';
      header.appendChild(img);
    } else {
      header.innerHTML = `<img src="${logo.logo}" alt="" /> <span>${logo.name}</span>`;
    }
    grid.appendChild(header);
  }

  for (let row = 0; row < boardSize; row++) {
    const side = getRandomTeam();
    const sideCell = document.createElement('div');
    sideCell.className = 'team-logo';
    sideCell.style.backgroundColor = side.color;
    if (logoOnly) {
      const img = document.createElement('img');
      img.src = side.logo;
      img.alt = '';
      sideCell.appendChild(img);
    } else {
      sideCell.innerHTML = `<img src="${side.logo}" alt="" /> <span>${side.name}</span>`;
    }
    grid.appendChild(sideCell);

    for (let col = 0; col < boardSize; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const span = document.createElement('span');
      span.className = 'cell-content';
      span.textContent = '?';

      cell.addEventListener('click', () => {
        if (span.textContent === '?') {
          span.textContent = currentPlayer;
          span.className = `cell-content player-${currentPlayer.toLowerCase()}`;
          board[row][col] = currentPlayer;
          if (checkWin(currentPlayer)) {
            document.getElementById('result').textContent = `Spieler ${currentPlayer} gewinnt!`;
          } else {
            currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
          }
        } else {
          span.textContent = '?';
          span.className = 'cell-content';
          board[row][col] = '';
        }
      });

      cell.appendChild(span);
      grid.appendChild(cell);
    }
  }

  document.getElementById('result').textContent = '';
}

function checkWin(player) {
  // Zeilen und Spalten
  for (let i = 0; i < boardSize; i++) {
    if (board[i].every(cell => cell === player)) return true;
    if (board.map(row => row[i]).every(cell => cell === player)) return true;
  }
  // Diagonalen
  if (board.map((row, i) => row[i]).every(cell => cell === player)) return true;
  if (board.map((row, i) => row[boardSize - 1 - i]).every(cell => cell === player)) return true;
  return false;
}

function getRandomTeam() {
  const teams = Object.values(teamData);
  return teams[Math.floor(Math.random() * teams.length)];
}

window.onload = generateBoard;
