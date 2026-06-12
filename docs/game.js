// ===== CONSTANTS =====
const COLS = 6;
const ROWS = 9;
const PIECE_MOVES = {
    1: { up: 1, left: 2, down: 3, right: 4 },
    2: { up: 2, left: 3, down: 4, right: 1 }
};

// ===== GAME STATE =====
let board = [];
let currentPlayer = 'green';
let selectedPiece = null;
let validMoves = [];
let greenCapturedPieces = [];
let redCapturedPieces = [];
let gameOver = false;
let moveHistory = []; // For undo
let lastMove = null; // For highlighting

// Mode state
let gameMode = 'pvp'; // 'pvp', 'cpu', 'online'
let cpuDifficulty = 'medium';
let turnTimeLimit = 0; // 0 = unlimited, otherwise seconds
let turnTimer = null;
let turnTimeLeft = 0;
let winStreak = parseInt(localStorage.getItem('zensu_streak') || '0');
let onlineSocket = null;
let onlinePlayerColor = null;
let onlineRoomCode = null;

// ===== AUDIO =====
let audioCtx = null;
function playTone(freq, duration, type, vol = 0.12) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

const sounds = {
    select: () => playTone(800, 0.06, 'sine', 0.08),
    move: () => { playTone(300, 0.1, 'triangle'); playTone(450, 0.08, 'sine', 0.05); },
    capture: () => { playTone(150, 0.2, 'sawtooth', 0.1); setTimeout(() => playTone(100, 0.15, 'square', 0.08), 60); },
    invalid: () => playTone(80, 0.15, 'square', 0.06),
    win: () => {
        playTone(523, 0.15, 'sine', 0.1);
        setTimeout(() => playTone(659, 0.15, 'sine', 0.1), 120);
        setTimeout(() => playTone(784, 0.25, 'sine', 0.12), 240);
    }
};

// ===== HAPTIC FEEDBACK =====
function haptic(style) {
    if (!navigator.vibrate) return;
    switch (style) {
        case 'tap': navigator.vibrate(10); break;
        case 'move': navigator.vibrate(15); break;
        case 'capture': navigator.vibrate([20, 30, 40]); break;
        case 'win': navigator.vibrate([30, 50, 30, 50, 80]); break;
        case 'error': navigator.vibrate([40, 20, 40]); break;
        case 'timeout': navigator.vibrate([100, 50, 100]); break;
    }
}

// ===== SAKURA ANIMATION =====
function initSakura() {
    const canvas = document.getElementById('sakura-canvas');
    const ctx = canvas.getContext('2d');
    let petals = [];
    const PETAL_COUNT = 25;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Petal {
        constructor() { this.reset(true); }
        reset(initial = false) {
            this.x = Math.random() * canvas.width;
            this.y = initial ? Math.random() * canvas.height : -20;
            this.size = 4 + Math.random() * 8;
            this.speedY = 0.3 + Math.random() * 0.8;
            this.speedX = -0.2 + Math.random() * 0.5;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotSpeed = (Math.random() - 0.5) * 0.02;
            this.wobble = Math.random() * Math.PI * 2;
            this.wobbleSpeed = 0.01 + Math.random() * 0.02;
            this.opacity = 0.3 + Math.random() * 0.4;
            this.type = Math.random() > 0.3 ? 'petal' : 'leaf';
        }
        update() {
            this.y += this.speedY;
            this.wobble += this.wobbleSpeed;
            this.x += this.speedX + Math.sin(this.wobble) * 0.3;
            this.rotation += this.rotSpeed;
            if (this.y > canvas.height + 20) this.reset();
        }
        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.globalAlpha = this.opacity;
            if (this.type === 'petal') {
                ctx.fillStyle = `hsl(${340 + Math.random() * 5}, 70%, ${82 + Math.random() * 8}%)`;
                ctx.beginPath();
                ctx.ellipse(0, 0, this.size * 0.5, this.size, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(this.size * 0.3, 0, this.size * 0.4, this.size * 0.8, 0.3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = `hsla(${120 + Math.random() * 20}, 30%, 50%, 0.6)`;
                ctx.beginPath();
                ctx.ellipse(0, 0, this.size * 0.3, this.size * 0.8, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    for (let i = 0; i < PETAL_COUNT; i++) petals.push(new Petal());

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        petals.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();
}

// ===== TURN TIMER =====
function startTurnTimer() {
    stopTurnTimer();
    if (!turnTimeLimit || gameMode === 'cpu') return;

    turnTimeLeft = turnTimeLimit;

    // Show the correct timer bar based on current player
    const greenBar = document.getElementById('timer-bar');
    const redBar = document.getElementById('timer-bar-red');

    if (currentPlayer === 'green') {
        greenBar.classList.remove('hidden');
        redBar.classList.add('hidden');
    } else {
        greenBar.classList.add('hidden');
        if (gameMode === 'pvp') redBar.classList.remove('hidden');
        else greenBar.classList.remove('hidden'); // online: show at bottom
    }

    updateTimerDisplay();

    turnTimer = setInterval(() => {
        turnTimeLeft--;
        updateTimerDisplay();

        if (turnTimeLeft <= 0) {
            stopTurnTimer();
            handleTimeOut();
        }
    }, 1000);
}

function stopTurnTimer() {
    if (turnTimer) { clearInterval(turnTimer); turnTimer = null; }
    document.getElementById('timer-bar').classList.add('hidden');
    document.getElementById('timer-bar-red').classList.add('hidden');
}

function updateTimerDisplay() {
    const isRed = currentPlayer === 'red' && gameMode === 'pvp';
    const el = document.getElementById(isRed ? 'timer-text-red' : 'timer-text');
    const bar = document.getElementById(isRed ? 'timer-fill-red' : 'timer-fill');
    if (!el || !bar) return;

    el.textContent = turnTimeLeft + 's';
    const pct = (turnTimeLeft / turnTimeLimit) * 100;
    bar.style.width = pct + '%';

    if (turnTimeLeft <= 10) {
        bar.classList.add('timer-urgent');
        el.classList.add('timer-urgent');
    } else {
        bar.classList.remove('timer-urgent');
        el.classList.remove('timer-urgent');
    }
}

function handleTimeOut() {
    if (gameOver) return;
    haptic('timeout');
    const winner = currentPlayer === 'green' ? 'red' : 'green';
    showWin(winner, '時間切れ — Time\'s up!');
}

// ===== MENU LOGIC =====
function selectTimer(el) {
    document.querySelectorAll('.timer-opt').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    turnTimeLimit = parseInt(el.dataset.time) || 0;
}

function showPlayOptions() {
    document.querySelector('.menu-container').classList.add('hidden');
    document.getElementById('play-options').classList.remove('hidden');
    history.pushState({ screen: 'submenu' }, '');
}

function showAiOptions() {
    document.getElementById('play-options').classList.add('hidden');
    document.getElementById('ai-options').classList.remove('hidden');
    history.pushState({ screen: 'submenu' }, '');
}

function showOnlineOptions() {
    document.getElementById('play-options').classList.add('hidden');
    document.getElementById('online-options').classList.remove('hidden');
    history.pushState({ screen: 'submenu' }, '');

    const warning = document.getElementById('online-login-warning');
    if (!currentUser) {
        warning.classList.remove('hidden');
    } else {
        warning.classList.add('hidden');
    }
}

function hideSubMenus() {
    document.querySelector('.menu-container').classList.remove('hidden');
    document.getElementById('play-options').classList.add('hidden');
    document.getElementById('ai-options').classList.add('hidden');
    document.getElementById('online-options').classList.add('hidden');
    document.getElementById('online-status').classList.add('hidden');
    document.getElementById('account-panel').classList.add('hidden');
    document.getElementById('leaderboard-panel').classList.add('hidden');
    document.getElementById('tutorial-panel').classList.add('hidden');
}

// ===== ACCOUNT SYSTEM =====
let currentUser = null;

function loadSavedSession() {
    const saved = localStorage.getItem('zensu_user');
    if (saved) {
        try { currentUser = JSON.parse(saved); updateAccountUI(); } catch(e) {}
    }
}

function updateAccountUI() {
    const cornerBtn = document.getElementById('account-corner-btn');
    const cornerIcon = document.getElementById('account-corner-icon');
    const profileMini = document.getElementById('profile-mini');

    if (currentUser) {
        cornerBtn.classList.add('logged-in');
        cornerIcon.textContent = currentUser.username[0].toUpperCase();

        profileMini.classList.remove('hidden');
        document.getElementById('profile-mini-name').textContent = currentUser.username;
        document.getElementById('profile-mini-rank').textContent = currentUser.rank;
        document.getElementById('profile-mini-pts').textContent = currentUser.points + ' pts';

        const badge = document.getElementById('profile-mini-badge');
        badge.className = 'profile-mini-badge ' + currentUser.rank;
        badge.textContent = currentUser.rank[0].toUpperCase();
    } else {
        cornerBtn.classList.remove('logged-in');
        cornerIcon.textContent = '人';
        profileMini.classList.add('hidden');
    }
}

function showAccountPanel() {
    document.querySelector('.menu-container').classList.add('hidden');
    document.getElementById('play-options').classList.add('hidden');
    document.getElementById('ai-options').classList.add('hidden');
    document.getElementById('online-options').classList.add('hidden');
    document.getElementById('leaderboard-panel').classList.add('hidden');
    document.getElementById('account-panel').classList.remove('hidden');
    history.pushState({ screen: 'submenu' }, '');

    if (currentUser) {
        document.getElementById('auth-form').classList.add('hidden');
        document.getElementById('profile-view').classList.remove('hidden');
        document.getElementById('profile-name').textContent = currentUser.username;
        document.getElementById('profile-rank-text').textContent = currentUser.rank;
        document.getElementById('stat-points').textContent = currentUser.points;
        document.getElementById('stat-wins').textContent = currentUser.wins;
        document.getElementById('stat-losses').textContent = currentUser.losses;

        const badge = document.getElementById('profile-rank-badge');
        badge.className = 'profile-rank-badge ' + currentUser.rank;
        badge.textContent = currentUser.rank[0].toUpperCase();
        updateLeagueProgress();
    } else {
        document.getElementById('auth-form').classList.remove('hidden');
        document.getElementById('profile-view').classList.add('hidden');
    }
}

async function doLogin() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.textContent = '';

    if (!username || !password) { errEl.textContent = 'Enter username and password'; return; }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }

        currentUser = { username: data.username, points: data.points, rank: data.rank, wins: data.wins, losses: data.losses };
        localStorage.setItem('zensu_user', JSON.stringify(currentUser));
        updateAccountUI();
        showAccountPanel();
    } catch (e) { errEl.textContent = 'Server not reachable'; }
}

async function doRegister() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.textContent = '';

    if (!username || username.length < 2) { errEl.textContent = 'Username must be 2+ characters'; return; }
    if (!password || password.length < 4) { errEl.textContent = 'Password must be 4+ characters'; return; }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }

        currentUser = { username, points: 0, rank: 'bronze', wins: 0, losses: 0 };
        localStorage.setItem('zensu_user', JSON.stringify(currentUser));
        updateAccountUI();
        showAccountPanel();
    } catch (e) { errEl.textContent = 'Server not reachable'; }
}

function doLogout() {
    currentUser = null;
    localStorage.removeItem('zensu_user');
    updateAccountUI();
    showAccountPanel();
}

function showRankUpModal(newRank) {
    const modal = document.getElementById('rankup-modal');
    const badge = document.getElementById('rankup-badge');
    const rankName = document.getElementById('rankup-rank-name');

    badge.className = 'rankup-badge ' + newRank;
    badge.textContent = newRank[0].toUpperCase();
    rankName.textContent = newRank.charAt(0).toUpperCase() + newRank.slice(1);

    modal.classList.remove('hidden');
}

function closeRankUp() {
    document.getElementById('rankup-modal').classList.add('hidden');
}

function updateLeagueProgress() {
    if (!currentUser) return;
    const pts = currentUser.points;
    const ranks = [
        { name: 'bronze', min: 0, max: 99 },
        { name: 'silver', min: 100, max: 249 },
        { name: 'gold', min: 250, max: 499 },
        { name: 'platinum', min: 500, max: Infinity }
    ];

    const currentRank = ranks.find(r => pts >= r.min && pts <= r.max);
    const currentIdx = ranks.indexOf(currentRank);
    const nextRank = currentIdx < ranks.length - 1 ? ranks[currentIdx + 1] : null;

    const currentEl = document.getElementById('league-current');
    const nextEl = document.getElementById('league-next');
    const fillEl = document.getElementById('league-fill');

    if (currentEl) currentEl.textContent = currentRank.name;

    if (nextRank && nextEl) {
        nextEl.textContent = `→ ${nextRank.name} (${nextRank.min}pts)`;
        const progress = (pts - currentRank.min) / (nextRank.min - currentRank.min) * 100;
        if (fillEl) fillEl.style.width = Math.min(100, progress) + '%';
    } else {
        if (nextEl) nextEl.textContent = '★ Max rank!';
        if (fillEl) fillEl.style.width = '100%';
    }

    // Highlight current rank in the ranks list
    ranks.forEach(r => {
        const item = document.getElementById('rank-item-' + r.name);
        if (item) {
            item.classList.toggle('current-rank', r.name === currentRank.name);
        }
    });
}

async function showLeaderboard() {
    document.querySelector('.menu-container').classList.add('hidden');
    document.getElementById('leaderboard-panel').classList.remove('hidden');
    history.pushState({ screen: 'submenu' }, '');

    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<p class="loading-text">Loading...</p>';

    try {
        const res = await fetch('/api/leaderboard');
        const data = await res.json();

        if (data.leaderboard.length === 0) {
            list.innerHTML = '<p class="loading-text">No players yet. Be the first!</p>';
            return;
        }

        list.innerHTML = data.leaderboard.map((p, i) => `
            <div class="lb-row">
                <span class="lb-pos ${i < 3 ? 'top3' : ''}">#${i + 1}</span>
                <div class="lb-badge ${p.rank}">${p.rank[0].toUpperCase()}</div>
                <span class="lb-name">${p.username}</span>
                <span class="lb-points">${p.points}</span>
                <span class="lb-record">${p.wins}W/${p.losses}L</span>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<p class="loading-text">Server not reachable</p>';
    }
}

function startGame(mode, difficulty) {
    gameMode = mode;
    if (difficulty) cpuDifficulty = difficulty;

    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    if (mode === 'cpu') initAiWorker();
    pushGameState();

    // Flip red bar 180 in PvP so opponent across can read it
    const redBar = document.getElementById('red-bar');
    if (mode === 'pvp') redBar.classList.add('flipped');
    else redBar.classList.remove('flipped');

    resetGame();
}

function backToMenu() {
    document.getElementById('menu-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('win-modal').classList.add('hidden');
    hideSubMenus();
    disconnectOnline();
    stopTurnTimer();
    gameOver = true;
}

// ===== ONLINE MULTIPLAYER =====
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

function createRoom() {
    const status = document.getElementById('online-status');
    const statusText = document.getElementById('online-status-text');
    status.classList.remove('hidden');
    statusText.textContent = 'Creating room...';

    connectOnline((data) => {
        if (data.type === 'room_created') {
            onlineRoomCode = data.code;
            onlinePlayerColor = 'green';
            statusText.textContent = `Room: ${data.code} — Waiting for opponent...`;
        } else if (data.type === 'game_start') {
            startGame('online');
        }
    }, () => {
        onlineSocket.send(JSON.stringify({ type: 'create_room' }));
    });
}

function joinRoom() {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code || code.length < 4) return;

    const status = document.getElementById('online-status');
    const statusText = document.getElementById('online-status-text');
    status.classList.remove('hidden');
    statusText.textContent = 'Joining room...';

    connectOnline((data) => {
        if (data.type === 'joined') {
            onlineRoomCode = code;
            onlinePlayerColor = 'red';
            statusText.textContent = 'Joined! Starting game...';
            setTimeout(() => startGame('online'), 500);
        } else if (data.type === 'game_start') {
            startGame('online');
        } else if (data.type === 'error') {
            statusText.textContent = data.message || 'Failed to join room';
        }
    }, () => {
        onlineSocket.send(JSON.stringify({ type: 'join_room', code }));
    });
}

function connectOnline(onMessage, onOpen) {
    if (onlineSocket) onlineSocket.close();

    try {
        onlineSocket = new WebSocket(WS_URL);
    } catch (e) {
        document.getElementById('online-status-text').textContent = 'Server not running. Start server first.';
        return;
    }

    onlineSocket.onopen = () => {
        if (currentUser) {
            onlineSocket.send(JSON.stringify({ type: 'auth', username: currentUser.username }));
        }
        if (onOpen) onOpen();
    };

    onlineSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'opponent_move') {
            const move = data.move;
            executeMove(move.fromRow, move.fromCol, move.to, true);
        } else if (data.type === 'opponent_disconnected') {
            if (!gameOver) {
                showWin(onlinePlayerColor, 'Opponent disconnected — 相手退出');
            }
        } else if (data.type === 'stats_update') {
            if (currentUser) {
                const oldRank = currentUser.rank;
                currentUser.points = data.points;
                currentUser.rank = data.rank;
                currentUser.wins = data.wins;
                currentUser.losses = data.losses;
                localStorage.setItem('zensu_user', JSON.stringify(currentUser));
                updateAccountUI();

                const promoted = data.rankUp || (data.rank !== oldRank && data.points > 0);
                if (promoted) {
                    setTimeout(() => showRankUpModal(data.rank), 2000);
                }
            }
        } else {
            if (onMessage) onMessage(data);
        }
    };

    onlineSocket.onerror = () => {
        document.getElementById('online-status-text').textContent = 'Cannot connect. Is the server running?';
    };

    onlineSocket.onclose = () => {};
}

function disconnectOnline() {
    if (onlineSocket) {
        onlineSocket.close();
        onlineSocket = null;
    }
    onlineRoomCode = null;
    onlinePlayerColor = null;
}

function sendMoveOnline(fromRow, fromCol, move) {
    if (gameMode === 'online' && onlineSocket && onlineSocket.readyState === WebSocket.OPEN) {
        onlineSocket.send(JSON.stringify({
            type: 'move',
            move: { fromRow, fromCol, to: move }
        }));
    }
}

// ===== AI ENGINE (Web Worker + Iterative Deepening) =====
let aiWorker = null;

function initAiWorker() {
    if (aiWorker) aiWorker.terminate();
    aiWorker = new Worker('ai-worker.js');
}

function cpuTurn() {
    if (gameOver || gameMode !== 'cpu' || currentPlayer !== 'red') return;

    document.getElementById('cpu-thinking').classList.remove('hidden');

    if (!aiWorker) initAiWorker();

    aiWorker.onmessage = function(e) {
        const move = e.data;
        document.getElementById('cpu-thinking').classList.add('hidden');

        if (move && !gameOver) {
            selectedPiece = { row: move.fromRow, col: move.fromCol };
            renderBoard();
            setTimeout(() => {
                executeMove(move.fromRow, move.fromCol, move.to);
            }, 150);
        }
    };

    aiWorker.postMessage({ board, difficulty: cpuDifficulty });
}

function getValidMovesOnBoard(row, col, player, boardState) {
    const piece = boardState[row][col];
    if (!piece || piece.player !== player) return [];

    const baseMoves = PIECE_MOVES[piece.type];
    let moves;
    if (player === 'green') {
        moves = { up: baseMoves.up, down: baseMoves.down, left: baseMoves.left, right: baseMoves.right };
    } else {
        moves = { up: baseMoves.down, down: baseMoves.up, left: baseMoves.right, right: baseMoves.left };
    }

    const results = [];
    const directions = [
        { dr: -1, dc: 0, dist: moves.up },
        { dr: 1, dc: 0, dist: moves.down },
        { dr: 0, dc: -1, dist: moves.left },
        { dr: 0, dc: 1, dist: moves.right }
    ];

    for (const dir of directions) {
        const targetRow = row + dir.dr * dir.dist;
        const targetCol = col + dir.dc * dir.dist;
        if (targetRow < 0 || targetRow >= ROWS || targetCol < 0 || targetCol >= COLS) continue;

        const targetPiece = boardState[targetRow][targetCol];
        if (targetPiece && targetPiece.player === player) continue;

        const captures = [];
        for (let step = 1; step <= dir.dist; step++) {
            const midRow = row + dir.dr * step;
            const midCol = col + dir.dc * step;
            if (midRow === targetRow && midCol === targetCol) break;
            const midPiece = boardState[midRow][midCol];
            if (midPiece && midPiece.player !== player) {
                captures.push({ row: midRow, col: midCol });
            }
        }

        if (targetPiece && targetPiece.player !== player) {
            captures.push({ row: targetRow, col: targetCol });
        }

        results.push({ row: targetRow, col: targetCol, captures });
    }

    return results;
}

// ===== BOARD LOGIC =====
function initBoard() {
    board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    for (let col = 0; col < COLS; col++) {
        board[0][col] = { player: 'red', type: 2 };
        board[1][col] = { player: 'red', type: 1 };
    }
    for (let col = 0; col < COLS; col++) {
        board[7][col] = { player: 'green', type: 1 };
        board[8][col] = { player: 'green', type: 2 };
    }
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.classList.add((row + col) % 2 === 0 ? 'cell-light' : 'cell-dark');
            cell.dataset.row = row;
            cell.dataset.col = col;

            if (row === 0) cell.classList.add('back-row-red');
            if (row === ROWS - 1) cell.classList.add('back-row-green');

            if (selectedPiece && selectedPiece.row === row && selectedPiece.col === col) {
                cell.classList.add('selected');
            }

            if (lastMove) {
                if (lastMove.fromRow === row && lastMove.fromCol === col) cell.classList.add('last-move-from');
                if (lastMove.toRow === row && lastMove.toCol === col) cell.classList.add('last-move-to');
            }

            const move = validMoves.find(m => m.row === row && m.col === col);
            if (move) {
                if (move.captures.length > 0 || (board[row][col] && board[row][col].player !== currentPlayer)) {
                    cell.classList.add('valid-capture');
                } else {
                    cell.classList.add('valid-move');
                }
            }

            const piece = board[row][col];
            if (piece) {
                cell.appendChild(createPieceElement(piece, row, col));
            }

            cell.addEventListener('click', () => handleCellClick(row, col));
            cell.addEventListener('touchend', (e) => { e.preventDefault(); handleCellClick(row, col); });

            boardEl.appendChild(cell);
        }
    }
}

function createPieceElement(piece, row, col) {
    const el = document.createElement('div');
    el.className = `piece ${piece.player}`;
    if (selectedPiece && selectedPiece.row === row && selectedPiece.col === col) {
        el.classList.add('piece-selected');
    }

    const moves = getMoveDistances(piece);
    el.innerHTML = `
        <div class="piece-arrows">
            <span class="arrow arrow-top">${moves.up}</span>
            <span class="arrow arrow-left">${moves.left}</span>
            <span class="piece-type">${piece.type === 1 ? 'I' : 'II'}</span>
            <span class="arrow arrow-right">${moves.right}</span>
            <span class="arrow arrow-bottom">${moves.down}</span>
        </div>
    `;
    return el;
}

function getMoveDistances(piece) {
    const baseMoves = PIECE_MOVES[piece.type];
    if (piece.player === 'green') {
        return { up: baseMoves.up, down: baseMoves.down, left: baseMoves.left, right: baseMoves.right };
    }
    return { up: baseMoves.down, down: baseMoves.up, left: baseMoves.right, right: baseMoves.left };
}

function getValidMoves(row, col) {
    return getValidMovesOnBoard(row, col, currentPlayer, board);
}

// ===== INTERACTION =====
function handleCellClick(row, col) {
    if (gameOver || replayMode) return;

    // In online mode, only allow moves for your color
    if (gameMode === 'online' && currentPlayer !== onlinePlayerColor) return;

    // In CPU mode, block during red's turn
    if (gameMode === 'cpu' && currentPlayer === 'red') return;

    const piece = board[row][col];

    if (selectedPiece) {
        const move = validMoves.find(m => m.row === row && m.col === col);
        if (move) {
            sendMoveOnline(selectedPiece.row, selectedPiece.col, move);
            executeMove(selectedPiece.row, selectedPiece.col, move);
            return;
        }
        if (piece && piece.player === currentPlayer) { selectPiece(row, col); return; }
        if (piece && piece.player !== currentPlayer) { triggerInvalidFeedback(row, col); return; }
        deselectPiece();
        return;
    }

    if (piece && piece.player === currentPlayer) selectPiece(row, col);
    else if (piece) triggerInvalidFeedback(row, col);
}

function selectPiece(row, col) {
    selectedPiece = { row, col };
    validMoves = getValidMoves(row, col);
    sounds.select();
    haptic('tap');
    updateHint();
    renderBoard();
}

function deselectPiece() {
    selectedPiece = null;
    validMoves = [];
    updateHint();
    renderBoard();
}

function triggerInvalidFeedback(row, col) {
    sounds.invalid();
    haptic('error');
    const cells = document.querySelectorAll('.cell');
    const idx = row * COLS + col;
    if (cells[idx]) {
        cells[idx].classList.add('invalid-shake');
        setTimeout(() => cells[idx].classList.remove('invalid-shake'), 350);
    }
}

function executeMove(fromRow, fromCol, move, isRemote = false) {
    const piece = board[fromRow][fromCol];
    const hadCaptures = move.captures.length > 0;

    // Save state for undo
    const capturedInMove = [];
    for (const cap of move.captures) {
        const cp = board[cap.row][cap.col];
        if (cp) capturedInMove.push({ row: cap.row, col: cap.col, piece: { ...cp } });
    }
    moveHistory.push({
        fromRow, fromCol,
        toRow: move.row, toCol: move.col,
        piece: { ...piece },
        captured: capturedInMove,
        player: currentPlayer
    });

    if (hadCaptures) { sounds.capture(); haptic('capture'); spawnCaptureParticles(move); shakeBoard(); }
    else { sounds.move(); haptic('move'); }

    for (const cap of move.captures) {
        const capturedPiece = board[cap.row][cap.col];
        if (capturedPiece) {
            if (currentPlayer === 'green') greenCapturedPieces.push({ ...capturedPiece });
            else redCapturedPieces.push({ ...capturedPiece });
            board[cap.row][cap.col] = null;
        }
    }

    board[fromRow][fromCol] = null;
    board[move.row][move.col] = piece;
    selectedPiece = null;
    validMoves = [];
    lastMove = { fromRow, fromCol, toRow: move.row, toCol: move.col };

    renderBoard();
    renderCapturedTrays();
    animatePlacedPiece(move.row, move.col);

    if (checkWin(piece, move.row)) return;

    currentPlayer = currentPlayer === 'green' ? 'red' : 'green';
    updateTurnIndicator();
    updateHint();
    flashTurnChange();
    startTurnTimer();

    // Trigger CPU turn
    if (gameMode === 'cpu' && currentPlayer === 'red' && !gameOver) {
        stopTurnTimer();
        setTimeout(cpuTurn, 300);
    }
}

function undoMove() {
    if (gameOver || moveHistory.length === 0) return;

    // In CPU mode, undo both CPU and player move
    if (gameMode === 'cpu') {
        if (moveHistory.length >= 2 && moveHistory[moveHistory.length - 1].player === 'red') {
            undoSingleMove();
            undoSingleMove();
        } else if (moveHistory.length >= 1) {
            undoSingleMove();
        }
    } else if (gameMode === 'online') {
        return; // No undo in online mode
    } else {
        undoSingleMove();
    }

    selectedPiece = null;
    validMoves = [];
    renderBoard();
    renderCapturedTrays();
    updateTurnIndicator();
    updateHint();
}

function undoSingleMove() {
    const last = moveHistory.pop();
    if (!last) return;

    // Move piece back
    board[last.toRow][last.toCol] = null;
    board[last.fromRow][last.fromCol] = last.piece;

    // Restore captured pieces
    for (const cap of last.captured) {
        board[cap.row][cap.col] = cap.piece;
        // Remove from captured trays
        if (last.player === 'green') greenCapturedPieces.pop();
        else redCapturedPieces.pop();
    }

    currentPlayer = last.player;
}

function animatePlacedPiece(row, col) {
    const cells = document.querySelectorAll('.cell');
    const idx = row * COLS + col;
    const pieceEl = cells[idx]?.querySelector('.piece');
    if (pieceEl) {
        pieceEl.classList.add('piece-placed');
        setTimeout(() => pieceEl.classList.remove('piece-placed'), 350);
    }
}

function spawnCaptureParticles(move) {
    const colors = currentPlayer === 'green'
        ? ['#ffb7c5', '#ff8fa3', '#c94058', '#fff']
        : ['#90ee90', '#5ba67a', '#2d6b4f', '#fff'];

    for (const cap of move.captures) {
        const cells = document.querySelectorAll('.cell');
        const idx = cap.row * COLS + cap.col;
        const cell = cells[idx];
        if (!cell) continue;

        const rect = cell.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const splash = document.createElement('div');
        splash.className = 'ink-splash';
        cell.appendChild(splash);
        setTimeout(() => splash.remove(), 600);

        for (let i = 0; i < 10; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle particle-burst';
            const size = 4 + Math.random() * 6;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            particle.style.background = colors[i % colors.length];
            particle.style.left = cx + 'px';
            particle.style.top = cy + 'px';

            const angle = (Math.PI * 2 / 10) * i + Math.random() * 0.3;
            const dist = 25 + Math.random() * 45;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;

            particle.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            document.body.appendChild(particle);
            requestAnimationFrame(() => {
                particle.style.transform = `translate(${dx}px, ${dy}px) scale(0)`;
                particle.style.opacity = '0';
            });
            setTimeout(() => particle.remove(), 700);
        }
    }
}

function shakeBoard() {
    const container = document.getElementById('board-container');
    container.classList.add('shake');
    setTimeout(() => container.classList.remove('shake'), 350);
}

function flashTurnChange() {
    const badge = document.getElementById('turn-indicator');
    badge.classList.add('turn-flash');
    setTimeout(() => badge.classList.remove('turn-flash'), 500);
}

function renderCapturedTrays() {
    const greenTray = document.getElementById('green-captured-tray');
    const redTray = document.getElementById('red-captured-tray');
    greenTray.innerHTML = '';
    redTray.innerHTML = '';

    greenCapturedPieces.forEach((p, i) => {
        const mini = document.createElement('div');
        mini.className = `captured-piece-mini ${p.player}`;
        mini.textContent = p.type === 1 ? 'I' : 'II';
        mini.style.animationDelay = `${i * 50}ms`;
        greenTray.appendChild(mini);
    });

    redCapturedPieces.forEach((p, i) => {
        const mini = document.createElement('div');
        mini.className = `captured-piece-mini ${p.player}`;
        mini.textContent = p.type === 1 ? 'I' : 'II';
        mini.style.animationDelay = `${i * 50}ms`;
        redTray.appendChild(mini);
    });
}

function checkWin(piece, targetRow) {
    if (piece.player === 'green' && targetRow === 0) {
        showWin('green', '陣地到達 — Reached the back row!');
        return true;
    }
    if (piece.player === 'red' && targetRow === ROWS - 1) {
        showWin('red', '陣地到達 — Reached the back row!');
        return true;
    }

    let greenPieces = 0, redPieces = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) {
                if (board[r][c].player === 'green') greenPieces++;
                else redPieces++;
            }
        }
    }

    if (greenPieces === 0) { showWin('red', '全滅 — All pieces captured!'); return true; }
    if (redPieces === 0) { showWin('green', '全滅 — All pieces captured!'); return true; }
    return false;
}

function showWin(winner, reason) {
    gameOver = true;
    stopTurnTimer();
    sounds.win();
    haptic('win');

    // Track win streak (green = human in PvP/CPU, your color in online)
    const playerWon = (gameMode === 'cpu' && winner === 'green')
        || (gameMode === 'online' && winner === onlinePlayerColor)
        || (gameMode === 'pvp');

    if (gameMode !== 'pvp') {
        if (playerWon) { winStreak++; }
        else { winStreak = 0; }
        localStorage.setItem('zensu_streak', winStreak);
    }
    updateStreakDisplay();

    // Send game result to server for online ranked games
    if (gameMode === 'online' && onlineSocket && onlineSocket.readyState === WebSocket.OPEN) {
        onlineSocket.send(JSON.stringify({ type: 'game_over', winner }));
    }

    setTimeout(() => {
        const modal = document.getElementById('win-modal');
        const message = document.getElementById('win-message');
        const reasonEl = document.getElementById('win-reason');
        const kanjiEl = document.getElementById('win-kanji');
        const streakEl = document.getElementById('win-streak');

        message.textContent = `${winner === 'green' ? '先手' : '後手'} (${winner.charAt(0).toUpperCase() + winner.slice(1)}) Wins!`;
        message.style.color = winner === 'green' ? '#5ba67a' : '#c94058';
        reasonEl.textContent = reason;
        kanjiEl.textContent = '勝';

        if (winStreak >= 2 && gameMode !== 'pvp' && playerWon) {
            streakEl.textContent = `🔥 ${winStreak} win streak!`;
            streakEl.classList.remove('hidden');
        } else {
            streakEl.classList.add('hidden');
        }

        modal.classList.remove('hidden');
    }, 500);
}

function updateStreakDisplay() {
    const el = document.getElementById('streak-badge');
    if (el) {
        if (winStreak >= 2) {
            el.textContent = `🔥${winStreak}`;
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }
}

function updateTurnIndicator() {
    const badge = document.getElementById('turn-indicator');
    const kanji = document.getElementById('turn-kanji');
    badge.className = 'turn-badge ' + (currentPlayer === 'green' ? 'green-turn' : 'red-turn');
    kanji.textContent = currentPlayer === 'green' ? '緑' : '赤';

    document.getElementById('green-panel').classList.toggle('active', currentPlayer === 'green');
    document.getElementById('red-panel').classList.toggle('active', currentPlayer === 'red');
}

function updateHint() {
    const hintText = document.getElementById('hint-text');

    if (gameMode === 'online' && currentPlayer !== onlinePlayerColor) {
        hintText.textContent = '相手の番 — Waiting for opponent...';
        return;
    }
    if (gameMode === 'cpu' && currentPlayer === 'red') {
        hintText.textContent = 'CPU考え中... — CPU thinking...';
        return;
    }

    if (selectedPiece) {
        if (validMoves.length === 0) {
            hintText.textContent = '動けません — No valid moves';
        } else {
            const captures = validMoves.filter(m => m.captures.length > 0).length;
            if (captures > 0) {
                hintText.textContent = `${validMoves.length}手 (${captures}取) — ${validMoves.length} moves (${captures} capture${captures > 1 ? 's' : ''})`;
            } else {
                hintText.textContent = `${validMoves.length}手 — ${validMoves.length} move${validMoves.length > 1 ? 's' : ''} available`;
            }
        }
    } else {
        hintText.textContent = '駒を選んでください — Select a piece';
    }
}

function resetGame() {
    board = [];
    currentPlayer = 'green';
    selectedPiece = null;
    validMoves = [];
    greenCapturedPieces = [];
    redCapturedPieces = [];
    moveHistory = [];
    lastMove = null;
    gameOver = false;

    document.getElementById('win-modal').classList.add('hidden');
    document.getElementById('cpu-thinking').classList.add('hidden');

    // Tell server to reset scored flag for rematch
    if (gameMode === 'online' && onlineSocket && onlineSocket.readyState === WebSocket.OPEN) {
        onlineSocket.send(JSON.stringify({ type: 'rematch' }));
    }

    initBoard();
    renderBoard();
    renderCapturedTrays();
    updateTurnIndicator();
    updateHint();
    startTurnTimer();
    updateStreakDisplay();
}

function toggleRules() {
    document.getElementById('rules-panel').classList.toggle('hidden');
}

// ===== GAME REPLAY =====
let replayMoves = [];
let replayIndex = 0;
let replayMode = false;
let replayAutoInterval = null;

function startReplay() {
    if (moveHistory.length === 0) return;

    replayMoves = [...moveHistory];
    replayIndex = 0;
    replayMode = true;

    document.getElementById('win-modal').classList.add('hidden');
    document.getElementById('controls').classList.add('hidden');
    document.getElementById('replay-bar').classList.remove('hidden');

    // Reset board to initial state
    initBoard();
    greenCapturedPieces = [];
    redCapturedPieces = [];
    currentPlayer = 'green';
    lastMove = null;
    selectedPiece = null;
    validMoves = [];

    renderBoard();
    renderCapturedTrays();
    updateTurnIndicator();
    updateReplayStep();
}

function exitReplay() {
    replayMode = false;
    stopReplayAuto();
    document.getElementById('controls').classList.remove('hidden');
    document.getElementById('replay-bar').classList.add('hidden');

    // Restore the final game state
    initBoard();
    greenCapturedPieces = [];
    redCapturedPieces = [];
    currentPlayer = 'green';
    lastMove = null;

    for (const move of replayMoves) {
        applyReplayMove(move);
    }

    renderBoard();
    renderCapturedTrays();
    updateTurnIndicator();
    gameOver = true;
}

function replayNext() {
    if (replayIndex >= replayMoves.length) return;
    const move = replayMoves[replayIndex];
    applyReplayMove(move);
    replayIndex++;
    renderBoard();
    renderCapturedTrays();
    updateTurnIndicator();
    updateReplayStep();
}

function replayPrev() {
    if (replayIndex <= 0) return;
    replayIndex--;

    // Rebuild from scratch up to replayIndex
    initBoard();
    greenCapturedPieces = [];
    redCapturedPieces = [];
    currentPlayer = 'green';
    lastMove = null;

    for (let i = 0; i < replayIndex; i++) {
        applyReplayMove(replayMoves[i]);
    }

    renderBoard();
    renderCapturedTrays();
    updateTurnIndicator();
    updateReplayStep();
}

function replayFirst() {
    replayIndex = 0;
    initBoard();
    greenCapturedPieces = [];
    redCapturedPieces = [];
    currentPlayer = 'green';
    lastMove = null;
    renderBoard();
    renderCapturedTrays();
    updateTurnIndicator();
    updateReplayStep();
}

function replayLast() {
    initBoard();
    greenCapturedPieces = [];
    redCapturedPieces = [];
    currentPlayer = 'green';
    lastMove = null;

    for (let i = 0; i < replayMoves.length; i++) {
        applyReplayMove(replayMoves[i]);
    }
    replayIndex = replayMoves.length;

    renderBoard();
    renderCapturedTrays();
    updateTurnIndicator();
    updateReplayStep();
}

function replayAutoToggle() {
    const btn = document.getElementById('replay-play-btn');
    if (replayAutoInterval) {
        stopReplayAuto();
    } else {
        btn.textContent = '⏸';
        btn.classList.add('playing');
        replayAutoInterval = setInterval(() => {
            if (replayIndex >= replayMoves.length) {
                stopReplayAuto();
                return;
            }
            replayNext();
        }, 800);
    }
}

function stopReplayAuto() {
    const btn = document.getElementById('replay-play-btn');
    if (replayAutoInterval) { clearInterval(replayAutoInterval); replayAutoInterval = null; }
    btn.textContent = '⏵';
    btn.classList.remove('playing');
}

function applyReplayMove(move) {
    const piece = board[move.fromRow][move.fromCol];
    for (const cap of move.captured) {
        const cp = board[cap.row][cap.col];
        if (cp) {
            if (currentPlayer === 'green') greenCapturedPieces.push({ ...cp });
            else redCapturedPieces.push({ ...cp });
        }
        board[cap.row][cap.col] = null;
    }
    board[move.fromRow][move.fromCol] = null;
    board[move.toRow][move.toCol] = piece;
    lastMove = { fromRow: move.fromRow, fromCol: move.fromCol, toRow: move.toRow, toCol: move.toCol };
    currentPlayer = currentPlayer === 'green' ? 'red' : 'green';
}

function updateReplayStep() {
    document.getElementById('replay-step').textContent = `${replayIndex} / ${replayMoves.length}`;
}

// ===== BROWSER BACK BUTTON HANDLING =====
function pushGameState() {
    history.pushState({ screen: 'game' }, '');
}

function pushMenuState() {
    history.pushState({ screen: 'menu' }, '');
}

window.addEventListener('popstate', function(e) {
    const gameScreen = document.getElementById('game-screen');
    const gameVisible = !gameScreen.classList.contains('hidden');

    const subMenuOpen = !document.getElementById('play-options').classList.contains('hidden')
        || !document.getElementById('ai-options').classList.contains('hidden')
        || !document.getElementById('online-options').classList.contains('hidden')
        || !document.getElementById('account-panel').classList.contains('hidden')
        || !document.getElementById('leaderboard-panel').classList.contains('hidden')
        || !document.getElementById('tutorial-panel').classList.contains('hidden');

    if (subMenuOpen && !gameVisible) {
        hideSubMenus();
        return;
    }

    if (gameVisible) {
        if (!gameOver && moveHistory.length > 0) {
            undoMove();
            pushGameState();
        } else {
            showLeaveModal();
            pushGameState();
        }
    }
});

function showLeaveModal() {
    document.getElementById('leave-modal').classList.remove('hidden');
}

function confirmLeave() {
    document.getElementById('leave-modal').classList.add('hidden');
    backToMenu();
}

function cancelLeave() {
    document.getElementById('leave-modal').classList.add('hidden');
}

// ===== INIT =====
initSakura();
pushMenuState();
loadSavedSession();

