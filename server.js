const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 8080;
const WS_PORT = 8081;

// ===== Static file server =====
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

const httpServer = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
});

httpServer.listen(PORT, () => {
    console.log(`\n  ┌─────────────────────────────────────────┐`);
    console.log(`  │           禅数 ZENSU SERVER              │`);
    console.log(`  ├─────────────────────────────────────────┤`);
    console.log(`  │  Game:   http://localhost:${PORT}           │`);
    console.log(`  │  WS:     ws://localhost:${WS_PORT}            │`);
    console.log(`  ├─────────────────────────────────────────┤`);
    console.log(`  │  Share your IP for online play:         │`);
    console.log(`  │  http://<your-ip>:${PORT}                 │`);
    console.log(`  └─────────────────────────────────────────┘\n`);
});

// ===== WebSocket server for online multiplayer =====
const rooms = new Map();

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.roomCode = null;

    ws.on('message', (raw) => {
        let data;
        try { data = JSON.parse(raw); } catch (e) { return; }

        switch (data.type) {
            case 'create_room': {
                let code = generateCode();
                while (rooms.has(code)) code = generateCode();

                rooms.set(code, { green: ws, red: null });
                ws.roomCode = code;
                ws.playerColor = 'green';

                ws.send(JSON.stringify({ type: 'room_created', code }));
                console.log(`Room ${code} created`);
                break;
            }

            case 'join_room': {
                const code = (data.code || '').toUpperCase();
                const room = rooms.get(code);

                if (!room) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
                    return;
                }
                if (room.red) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
                    return;
                }

                room.red = ws;
                ws.roomCode = code;
                ws.playerColor = 'red';

                ws.send(JSON.stringify({ type: 'joined', code }));
                room.green.send(JSON.stringify({ type: 'game_start' }));
                room.red.send(JSON.stringify({ type: 'game_start' }));
                console.log(`Room ${code}: player joined, game starting`);
                break;
            }

            case 'move': {
                const room = rooms.get(ws.roomCode);
                if (!room) return;

                const opponent = ws.playerColor === 'green' ? room.red : room.green;
                if (opponent && opponent.readyState === 1) {
                    opponent.send(JSON.stringify({ type: 'opponent_move', move: data.move }));
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        if (ws.roomCode) {
            const room = rooms.get(ws.roomCode);
            if (room) {
                const opponent = ws.playerColor === 'green' ? room.red : room.green;
                if (opponent && opponent.readyState === 1) {
                    opponent.send(JSON.stringify({ type: 'opponent_disconnected' }));
                }
                rooms.delete(ws.roomCode);
                console.log(`Room ${ws.roomCode} closed`);
            }
        }
    });
});

// Keep-alive ping
setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    ws.on('pong', () => { ws.isAlive = true; });
});
