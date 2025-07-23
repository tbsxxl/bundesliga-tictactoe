let currentPlayer = 'X';
let boardSize = 3;
let board = [];

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateBoard() {
  boardSize = parseInt(document.getElementById('gridSize').value);
  const grid = document.getElementById('grid');
  const logoOnly = document.getElementById('logoOnly').checked;
  const allTeams = Object.values(teamData);
  const uniqueTeams = shuffle(allTeams).slice(0, boardSize * 2);
  const rowTeams = uniqueTeams.slice(0, boardSize);
  const colTeams = uniqueTeams.slice(boardSize, boardSize * 2);

  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${boardSize + 1}, auto)`;

  board = Array.from({ length: boardSize }, () => Array(boardSize).fill(''));

  // Spaltenköpfe
  grid.appendChild(document.createElement('div')); // leere Ecke
  for (let col = 0; col < boardSize; col++) {
    const team = colTeams[col];
    const header = document.createElement('div');
    header.className = 'team-logo';
    header.style.backgroundColor = team.color;
    if (logoOnly) {
      const img = document.createElement('img');
      img.src = team.logo;
      img.alt = '';
      header.appendChild(img);
    } else {
      header.innerHTML = `<img src="${team.logo}" alt="" /> <span>${team.name}</span>`;
    }
    grid.appendChild(header);
  }

  for (let row = 0; row < boardSize; row++) {
    const team = rowTeams[row];
    const sideCell = document.createElement('div');
    sideCell.className = 'team-logo';
    sideCell.style.backgroundColor = team.color;
    if (logoOnly) {
      const img = document.createElement('img');
      img.src = team.logo;
      img.alt = '';
      sideCell.appendChild(img);
    } else {
      sideCell.innerHTML = `<img src="${team.logo}" alt="" /> <span>${team.name}</span>`;
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
        } else if (span.textContent === 'X') {
          span.textContent = 'O';
          span.className = 'cell-content player-o';
          board[row][col] = 'O';
        } else if (span.textContent === 'O') {
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
  for (let i = 0; i < boardSize; i++) {
    if (board[i].every(cell => cell === player)) return true;
    if (board.map(row => row[i]).every(cell => cell === player)) return true;
  }
  if (board.map((row, i) => row[i]).every(cell => cell === player)) return true;
  if (board.map((row, i) => row[boardSize - 1 - i]).every(cell => cell === player)) return true;
  return false;
}

window.onload = generateBoard;