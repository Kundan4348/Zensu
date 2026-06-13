const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const DB_FILE = path.join(__dirname, 'players.json');

// ===== Player Database =====
let players = {};

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            players = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
    } catch (e) { players = {}; }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(players, null, 2));
}

function hashPassword(pass) {
    return crypto.createHash('sha256').update(pass).digest('hex');
}

function getRank(points) {
    if (points >= 500) return 'platinum';
    if (points >= 250) return 'gold';
    if (points >= 100) return 'silver';
    return 'bronze';
}

function getLeaderboard() {
    return Object.entries(players)
        .map(([username, data]) => ({
            username,
            points: data.points,
            rank: getRank(data.points),
            wins: data.wins,
            losses: data.losses
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 50);
}

loadDB();

// ===== Static file server =====
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

const httpServer = http.createServer((req, res) => {
    // API routes
    if (req.method === 'POST' && req.url === '/api/register') {
        return handleBody(req, res, (body) => {
            const { username, password } = body;
            if (!username || !password || username.length < 2 || password.length < 4) {
                return jsonRes(res, 400, { error: 'Username (2+ chars) and password (4+ chars) required' });
            }
            if (players[username]) {
                return jsonRes(res, 409, { error: 'Username already taken' });
            }
            players[username] = { passwordHash: hashPassword(password), points: 0, wins: 0, losses: 0, created: Date.now() };
            saveDB();
            jsonRes(res, 200, { success: true, points: 0, rank: 'bronze', wins: 0, losses: 0 });
        });
    }

    if (req.method === 'POST' && req.url === '/api/login') {
        return handleBody(req, res, (body) => {
            const { username, password } = body;
            const player = players[username];
            if (!player || player.passwordHash !== hashPassword(password)) {
                return jsonRes(res, 401, { error: 'Invalid username or password' });
            }
            jsonRes(res, 200, { success: true, username, points: player.points, rank: getRank(player.points), wins: player.wins, losses: player.losses });
        });
    }

    if (req.method === 'GET' && req.url === '/api/leaderboard') {
        return jsonRes(res, 200, { leaderboard: getLeaderboard() });
    }

    if (req.method === 'GET' && req.url.startsWith('/api/profile/')) {
        const username = decodeURIComponent(req.url.split('/api/profile/')[1]);
        const player = players[username];
        if (!player) return jsonRes(res, 404, { error: 'Player not found' });
        return jsonRes(res, 200, { username, points: player.points, rank: getRank(player.points), wins: player.wins, losses: player.losses });
    }

    // Static files
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
});

function handleBody(req, res, cb) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { cb(JSON.parse(body)); } catch(e) { jsonRes(res, 400, { error: 'Invalid JSON' }); } });
}

function jsonRes(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
}

httpServer.listen(PORT, () => {
    console.log(`\n  ┌─────────────────────────────────────────┐`);
    console.log(`  │           禅数 ZENSU SERVER              │`);
    console.log(`  ├─────────────────────────────────────────┤`);
    console.log(`  │  Game:   http://localhost:${PORT}           │`);
    console.log(`  │  WS:     same port (upgrade)            │`);
    console.log(`  └─────────────────────────────────────────┘\n`);
});

// ===== WebSocket server =====
const rooms = new Map();

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.roomCode = null;
    ws.username = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
        let data;
        try { data = JSON.parse(raw); } catch (e) { return; }

        switch (data.type) {
            case 'auth': {
                ws.username = data.username || null;
                break;
            }

            case 'create_room': {
                let code = generateCode();
                while (rooms.has(code)) code = generateCode();

                rooms.set(code, { green: ws, red: null, greenUser: ws.username, redUser: null, scored: false });
                ws.roomCode = code;
                ws.playerColor = 'green';

                ws.send(JSON.stringify({ type: 'room_created', code }));
                console.log(`Room ${code} created by ${ws.username || 'anon'}`);
                break;
            }

            case 'join_room': {
                const code = (data.code || '').toUpperCase();
                const room = rooms.get(code);

                if (!room) { ws.send(JSON.stringify({ type: 'error', message: 'Room not found' })); return; }
                if (room.red) { ws.send(JSON.stringify({ type: 'error', message: 'Room is full' })); return; }

                // Coin toss — randomly assign colors
                const creatorGetsGreen = Math.random() < 0.5;
                const creatorWs = room.green; // originally stored as green
                const creatorUser = room.greenUser;
                const joinerWs = ws;
                const joinerUser = ws.username;

                if (creatorGetsGreen) {
                    room.green = creatorWs;
                    room.greenUser = creatorUser;
                    room.red = joinerWs;
                    room.redUser = joinerUser;
                    if (creatorWs) creatorWs.playerColor = 'green';
                    joinerWs.playerColor = 'red';
                } else {
                    room.green = joinerWs;
                    room.greenUser = joinerUser;
                    room.red = creatorWs;
                    room.redUser = creatorUser;
                    if (creatorWs) creatorWs.playerColor = 'red';
                    joinerWs.playerColor = 'green';
                }

                joinerWs.roomCode = code;
                room.started = true;

                ws.send(JSON.stringify({ type: 'joined', code }));
                if (room.green && room.green.readyState === 1) {
                    room.green.send(JSON.stringify({ type: 'game_start', opponent: room.redUser, yourColor: 'green' }));
                }
                if (room.red && room.red.readyState === 1) {
                    room.red.send(JSON.stringify({ type: 'game_start', opponent: room.greenUser, yourColor: 'red' }));
                }
                console.log(`Room ${code}: ${joinerUser || 'anon'} joined. Coin toss: creator=${creatorGetsGreen ? 'green' : 'red'}`);
                break;
            }

            case 'move': {
                const room = rooms.get(ws.roomCode);
                if (!room) return;

                if (!room.moves) room.moves = [];
                room.moves.push(data.move);

                const opponent = ws.playerColor === 'green' ? room.red : room.green;
                if (opponent && opponent.readyState === 1) {
                    opponent.send(JSON.stringify({ type: 'opponent_move', move: data.move }));
                }
                break;
            }

            case 'undo': {
                const room = rooms.get(ws.roomCode);
                if (!room) return;
                if (room.moves && room.moves.length > 0) room.moves.pop();
                const opponent = ws.playerColor === 'green' ? room.red : room.green;
                if (opponent && opponent.readyState === 1) {
                    opponent.send(JSON.stringify({ type: 'opponent_undo' }));
                }
                break;
            }

            case 'rematch': {
                const room = rooms.get(ws.roomCode);
                if (room) { room.scored = false; room.moves = []; }
                break;
            }

            case 'rejoin': {
                const code = (data.code || '').toUpperCase();
                const color = data.color;
                const lastMoveIndex = data.lastMoveIndex || 0;
                const room = rooms.get(code);

                if (!room) {
                    ws.send(JSON.stringify({ type: 'rejoin_failed' }));
                    return;
                }

                // Re-attach player to room
                if (color === 'green') room.green = ws;
                else room.red = ws;

                ws.roomCode = code;
                ws.playerColor = color;
                ws.username = data.username || null;

                // Clear disconnect timer
                if (room.disconnectTimer) {
                    clearTimeout(room.disconnectTimer);
                    room.disconnectTimer = null;
                }

                // Send missed moves since the player disconnected
                const allMoves = room.moves || [];
                const missedMoves = allMoves.slice(lastMoveIndex);

                ws.send(JSON.stringify({ type: 'rejoined', code, missedMoves, totalMoves: allMoves.length, started: room.started || false }));

                // If game started while player was away, tell them
                if (room.started && missedMoves.length === 0 && lastMoveIndex === 0) {
                    const oppUser = color === 'green' ? room.redUser : room.greenUser;
                    ws.send(JSON.stringify({ type: 'game_start', opponent: oppUser }));
                }

                // Notify opponent
                const opponent = color === 'green' ? room.red : room.green;
                if (opponent && opponent.readyState === 1) {
                    opponent.send(JSON.stringify({ type: 'opponent_resumed' }));
                }
                break;
            }

            case 'game_over': {
                const room = rooms.get(ws.roomCode);
                if (!room || room.scored) return;
                room.scored = true; // Prevent double-scoring

                const winner = data.winner;
                const greenUser = room.greenUser;
                const redUser = room.redUser;

                if (greenUser && players[greenUser] && redUser && players[redUser]) {
                    const oldGreenRank = getRank(players[greenUser].points);
                    const oldRedRank = getRank(players[redUser].points);

                    if (winner === 'green') {
                        players[greenUser].points = Math.max(0, players[greenUser].points + 25);
                        players[greenUser].wins++;
                        players[redUser].points = Math.max(0, players[redUser].points - 15);
                        players[redUser].losses++;
                    } else if (winner === 'red') {
                        players[redUser].points = Math.max(0, players[redUser].points + 25);
                        players[redUser].wins++;
                        players[greenUser].points = Math.max(0, players[greenUser].points - 15);
                        players[greenUser].losses++;
                    }
                    saveDB();

                    const gp = players[greenUser];
                    const rp = players[redUser];
                    const newGreenRank = getRank(gp.points);
                    const newRedRank = getRank(rp.points);

                    room.green.send(JSON.stringify({
                        type: 'stats_update', points: gp.points, rank: newGreenRank,
                        wins: gp.wins, losses: gp.losses,
                        rankUp: newGreenRank !== oldGreenRank ? newGreenRank : null
                    }));
                    room.red.send(JSON.stringify({
                        type: 'stats_update', points: rp.points, rank: newRedRank,
                        wins: rp.wins, losses: rp.losses,
                        rankUp: newRedRank !== oldRedRank ? newRedRank : null
                    }));
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        if (ws.roomCode) {
            const room = rooms.get(ws.roomCode);
            if (!room) return;

            // Mark player as disconnected but keep room alive for 30s
            if (ws.playerColor === 'green') room.green = null;
            else room.red = null;

            const opponent = ws.playerColor === 'green' ? room.red : room.green;
            if (opponent && opponent.readyState === 1) {
                opponent.send(JSON.stringify({ type: 'opponent_paused' }));
            }

            // Grace period — delete room if player doesn't reconnect in 2min
            room.disconnectTimer = setTimeout(() => {
                const currentRoom = rooms.get(ws.roomCode);
                if (!currentRoom) return;
                const opp = ws.playerColor === 'green' ? currentRoom.red : currentRoom.green;
                if (opp && opp.readyState === 1) {
                    opp.send(JSON.stringify({ type: 'opponent_disconnected' }));
                }
                rooms.delete(ws.roomCode);
            }, 120000);
        }
    });
});

setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
