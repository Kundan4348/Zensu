// ===== Clean Animated Tutorial =====
let tutCanvas, tutCtx;
let tutStep = 0;
let tutAnimFrame = null;
let tutTime = 0;

const W = 320, H = 320;

const TUTORIALS = [
    {
        desc: 'The board is 6 columns × 9 rows. Green pieces start at the bottom, Red at the top.',
        draw: sceneBoard
    },
    {
        desc: 'Each piece shows how far it moves in each direction. The big number points toward your opponent.',
        draw: scenePiece
    },
    {
        desc: 'Tap a piece to see where it can go. You must move the exact number shown — no stopping short.',
        draw: sceneMove
    },
    {
        desc: 'Land on or jump over an enemy piece to capture it. One move can take multiple pieces!',
        draw: sceneCapture
    },
    {
        desc: 'Reach the opponent\'s back row to win instantly. Or capture all their pieces.',
        draw: sceneWin
    }
];

function showTutorial() {
    document.querySelector('.menu-container').classList.add('hidden');
    document.getElementById('play-options').classList.add('hidden');
    document.getElementById('tutorial-panel').classList.remove('hidden');
    history.pushState({ screen: 'submenu' }, '');

    tutCanvas = document.getElementById('tutorial-canvas');
    tutCtx = tutCanvas.getContext('2d');
    tutCanvas.width = W * 2;
    tutCanvas.height = H * 2;
    tutCanvas.style.width = '100%';
    tutCanvas.style.maxWidth = '300px';
    tutCtx.scale(2, 2);
    tutStep = 0;
    tutTime = 0;
    updateTutorial();
    startTutAnim();
}

function tutNext() { tutStep = (tutStep + 1) % TUTORIALS.length; tutTime = 0; updateTutorial(); }
function tutPrev() { tutStep = (tutStep - 1 + TUTORIALS.length) % TUTORIALS.length; tutTime = 0; updateTutorial(); }

function updateTutorial() {
    document.getElementById('tut-step-label').textContent = `${tutStep + 1} / ${TUTORIALS.length}`;
    document.getElementById('tut-description').textContent = TUTORIALS[tutStep].desc;
}

function startTutAnim() {
    if (tutAnimFrame) cancelAnimationFrame(tutAnimFrame);
    function loop() {
        tutTime += 0.016;
        const panel = document.getElementById('tutorial-panel');
        if (tutCtx && panel && !panel.classList.contains('hidden')) {
            TUTORIALS[tutStep].draw(tutCtx, tutTime);
        }
        tutAnimFrame = requestAnimationFrame(loop);
    }
    loop();
}

// ===== Utilities =====
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function lerp(a, b, t) { return a + (b - a) * t; }

function clear(ctx) {
    ctx.fillStyle = '#0f0f1f';
    ctx.fillRect(0, 0, W, H);
}

function drawCell(ctx, x, y, s, light) {
    ctx.fillStyle = light ? 'rgba(255,245,225,0.65)' : 'rgba(225,195,145,0.5)';
    ctx.beginPath();
    ctx.roundRect(x, y, s - 1, s - 1, 2);
    ctx.fill();
}

function drawBoard6x9(ctx, ox, oy, cs) {
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 6; c++)
            drawCell(ctx, ox + c * cs, oy + r * cs, cs, (r + c) % 2 === 0);
}

function drawPiece(ctx, x, y, size, color, nums, pointUp) {
    ctx.save();
    ctx.translate(x, y);

    // Shape
    ctx.beginPath();
    if (pointUp) {
        ctx.moveTo(0, -size * 0.48);
        ctx.lineTo(size * 0.38, -size * 0.3);
        ctx.lineTo(size * 0.38, size * 0.48);
        ctx.lineTo(-size * 0.38, size * 0.48);
        ctx.lineTo(-size * 0.38, -size * 0.3);
    } else {
        ctx.moveTo(-size * 0.38, -size * 0.48);
        ctx.lineTo(size * 0.38, -size * 0.48);
        ctx.lineTo(size * 0.38, size * 0.3);
        ctx.lineTo(0, size * 0.48);
        ctx.lineTo(-size * 0.38, size * 0.3);
    }
    ctx.closePath();

    const g = ctx.createLinearGradient(0, -size/2, 0, size/2);
    if (color === 'green') { g.addColorStop(0, '#6fcf97'); g.addColorStop(1, '#2e8b57'); }
    else { g.addColorStop(0, '#e8607a'); g.addColorStop(1, '#8b2040'); }
    ctx.fillStyle = g;
    ctx.fill();

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.1, -size * 0.2, size * 0.2, size * 0.15, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Numbers
    if (nums) {
        ctx.fillStyle = 'rgba(255,250,230,0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Top (big for green, small for red)
        ctx.font = `bold ${pointUp ? size * 0.3 : size * 0.18}px serif`;
        ctx.globalAlpha = pointUp ? 1 : 0.5;
        ctx.fillText(nums.up, 0, -size * 0.18);

        // Bottom
        ctx.font = `bold ${pointUp ? size * 0.18 : size * 0.3}px serif`;
        ctx.globalAlpha = pointUp ? 0.5 : 1;
        ctx.fillText(nums.down, 0, size * 0.25);

        // Left/Right
        ctx.font = `bold ${size * 0.17}px serif`;
        ctx.globalAlpha = 0.7;
        ctx.fillText(nums.left, -size * 0.22, size * 0.04);
        ctx.fillText(nums.right, size * 0.22, size * 0.04);
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}

function drawDot(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawDashedLine(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}

// ===== Scene 1: The Board =====
function sceneBoard(ctx, t) {
    clear(ctx);
    const cs = 28;
    const ox = (W - 6 * cs) / 2;
    const oy = (H - 9 * cs) / 2;

    drawBoard6x9(ctx, ox, oy, cs);

    // Highlight back rows with pulse
    const a = 0.2 + Math.sin(t * 2.5) * 0.12;

    ctx.fillStyle = `rgba(232,96,122,${a})`;
    for (let c = 0; c < 6; c++) ctx.fillRect(ox + c * cs, oy, cs - 1, cs - 1);

    ctx.fillStyle = `rgba(111,207,151,${a})`;
    for (let c = 0; c < 6; c++) ctx.fillRect(ox + c * cs, oy + 8 * cs, cs - 1, cs - 1);

    // Pieces — just silhouettes
    for (let c = 0; c < 6; c++) {
        drawPiece(ctx, ox + c * cs + cs/2, oy + cs/2, cs * 0.75, 'red', null, false);
        drawPiece(ctx, ox + c * cs + cs/2, oy + cs + cs/2, cs * 0.75, 'red', null, false);
        drawPiece(ctx, ox + c * cs + cs/2, oy + 7 * cs + cs/2, cs * 0.75, 'green', null, true);
        drawPiece(ctx, ox + c * cs + cs/2, oy + 8 * cs + cs/2, cs * 0.75, 'green', null, true);
    }

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Red\'s back row (Green\'s goal)', W/2, oy - 8);
    ctx.fillText('Green\'s back row (Red\'s goal)', W/2, oy + 9 * cs + 14);
}

// ===== Scene 2: The Piece =====
function scenePiece(ctx, t) {
    clear(ctx);

    const cx = W / 2;
    const cy = H / 2 - 10;
    const size = 110;
    const bob = Math.sin(t * 1.5) * 4;

    drawPiece(ctx, cx, cy + bob, size, 'green', { up: '1', down: '3', left: '2', right: '4' }, true);

    // Direction labels with lines
    ctx.strokeStyle = 'rgba(219,181,80,0.4)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(219,181,80,0.8)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';

    // Up
    ctx.beginPath(); ctx.moveTo(cx, cy + bob - size * 0.5); ctx.lineTo(cx, cy + bob - size * 0.75); ctx.stroke();
    ctx.fillText('Forward: 1 space', cx, cy + bob - size * 0.75 - 8);

    // Down
    ctx.beginPath(); ctx.moveTo(cx, cy + bob + size * 0.5); ctx.lineTo(cx, cy + bob + size * 0.72); ctx.stroke();
    ctx.fillText('Backward: 3 spaces', cx, cy + bob + size * 0.72 + 12);

    // Left
    ctx.textAlign = 'right';
    ctx.beginPath(); ctx.moveTo(cx - size * 0.4, cy + bob); ctx.lineTo(cx - size * 0.7, cy + bob); ctx.stroke();
    ctx.fillText('Left: 2', cx - size * 0.7 - 4, cy + bob + 4);

    // Right
    ctx.textAlign = 'left';
    ctx.beginPath(); ctx.moveTo(cx + size * 0.4, cy + bob); ctx.lineTo(cx + size * 0.7, cy + bob); ctx.stroke();
    ctx.fillText('Right: 4', cx + size * 0.7 + 4, cy + bob + 4);

    // Type label
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px sans-serif';
    ctx.fillText('Type I piece', cx, H - 20);
}

// ===== Scene 3: Movement =====
function sceneMove(ctx, t) {
    clear(ctx);

    const cs = 36;
    const cols = 5, rows = 5;
    const ox = (W - cols * cs) / 2;
    const oy = (H - rows * cs) / 2;

    // Mini board
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            drawCell(ctx, ox + c * cs, oy + r * cs, cs, (r + c) % 2 === 0);

    const pr = 2, pc = 2; // piece at center
    const px = ox + pc * cs + cs/2;
    const py = oy + pr * cs + cs/2;

    // Valid destinations (Type I: up1, left2, down3, right4... but clamped to board)
    const dests = [
        { r: 1, c: 2, label: '↑1' },
        { r: 2, c: 0, label: '←2' },
    ];

    const cycle = (t * 0.8) % 4;

    if (cycle < 2) {
        // Show piece with pulsing valid move dots
        drawPiece(ctx, px, py, cs * 0.85, 'green', { up: '1', down: '3', left: '2', right: '4' }, true);

        const da = 0.4 + Math.sin(t * 4) * 0.3;
        // Up 1
        drawDot(ctx, ox + 2 * cs + cs/2, oy + 1 * cs + cs/2, 5, `rgba(219,181,80,${da})`);
        // Left 2
        drawDot(ctx, ox + 0 * cs + cs/2, oy + 2 * cs + cs/2, 5, `rgba(219,181,80,${da})`);
        // Down 3 — off board, show X
        // Right 4 — off board
        // Just show the two valid

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Valid moves glow gold', W/2, oy + rows * cs + 18);
    } else {
        // Animate moving up 1
        const p = ease(Math.min(1, (cycle - 2) / 1));
        const fromY = py;
        const toY = oy + 1 * cs + cs/2;
        const animY = lerp(fromY, toY, p);

        drawDashedLine(ctx, px, fromY, px, animY, 'rgba(219,181,80,0.4)');
        drawPiece(ctx, px, animY, cs * 0.85, 'green', { up: '1', down: '3', left: '2', right: '4' }, true);

        if (p >= 1) {
            drawDot(ctx, px, toY, 18, 'rgba(111,207,151,0.15)');
        }

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Moves exactly 1 space forward', W/2, oy + rows * cs + 18);
    }
}

// ===== Scene 4: Capturing =====
function sceneCapture(ctx, t) {
    clear(ctx);

    const cs = 40;
    const cols = 4, rows = 5;
    const ox = (W - cols * cs) / 2;
    const oy = (H - rows * cs) / 2;

    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            drawCell(ctx, ox + c * cs, oy + r * cs, cs, (r + c) % 2 === 0);

    // Green at row 4 col 1, Red at row 2 col 1, target row 0 col 1
    const gc = 1;
    const gx = ox + gc * cs + cs/2;
    const startY = oy + 4 * cs + cs/2;
    const enemyY = oy + 2 * cs + cs/2;
    const endY = oy + 0 * cs + cs/2;

    const cycle = t % 5;

    if (cycle < 1.5) {
        // Show both pieces, arrow hint
        drawPiece(ctx, gx, enemyY, cs * 0.8, 'red', null, false);
        drawPiece(ctx, gx, startY, cs * 0.8, 'green', { up: '4', down: '2', left: '3', right: '1' }, true);

        // Dashed path
        const a = 0.3 + Math.sin(t * 3) * 0.15;
        drawDashedLine(ctx, gx, startY - cs * 0.4, gx, endY + cs * 0.3, `rgba(219,181,80,${a})`);

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Green moves 4 up, jumping over Red', W/2, oy + rows * cs + 16);

    } else if (cycle < 3.5) {
        // Animate green moving, red disappearing
        const p = ease(Math.min(1, (cycle - 1.5) / 1.2));
        const animY = lerp(startY, endY, p);

        // Red fades when green passes it
        const passFrac = (startY - enemyY) / (startY - endY);
        const redAlpha = p < passFrac ? 1 : Math.max(0, 1 - (p - passFrac) * 5);

        if (redAlpha > 0) {
            ctx.globalAlpha = redAlpha;
            drawPiece(ctx, gx, enemyY, cs * 0.8, 'red', null, false);
            ctx.globalAlpha = 1;
        }

        // Burst when captured
        if (p >= passFrac && p < passFrac + 0.3) {
            const bt = (p - passFrac) / 0.3;
            for (let i = 0; i < 6; i++) {
                const ang = (Math.PI * 2 / 6) * i;
                const d = bt * 25;
                drawDot(ctx, gx + Math.cos(ang) * d, enemyY + Math.sin(ang) * d, 3 * (1 - bt), `rgba(232,96,122,${1 - bt})`);
            }
        }

        drawDashedLine(ctx, gx, startY, gx, animY, 'rgba(219,181,80,0.3)');
        drawPiece(ctx, gx, animY, cs * 0.8, 'green', null, true);

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Red is captured!', W/2, oy + rows * cs + 16);

    } else {
        // Landed, show result
        drawPiece(ctx, gx, endY, cs * 0.8, 'green', null, true);
        drawDot(ctx, gx, endY, 22, 'rgba(111,207,151,0.12)');

        // X where red was
        ctx.strokeStyle = 'rgba(232,96,122,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gx - 10, enemyY - 10); ctx.lineTo(gx + 10, enemyY + 10);
        ctx.moveTo(gx + 10, enemyY - 10); ctx.lineTo(gx - 10, enemyY + 10);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Jumped over and captured', W/2, oy + rows * cs + 16);
    }
}

// ===== Scene 5: Winning =====
function sceneWin(ctx, t) {
    clear(ctx);

    const cs = 34;
    const cols = 5, rows = 5;
    const ox = (W - cols * cs) / 2;
    const oy = (H - rows * cs) / 2;

    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            drawCell(ctx, ox + c * cs, oy + r * cs, cs, (r + c) % 2 === 0);

    // Highlight top row
    const pa = 0.15 + Math.sin(t * 2.5) * 0.1;
    ctx.fillStyle = `rgba(219,181,80,${pa})`;
    for (let c = 0; c < cols; c++) ctx.fillRect(ox + c * cs, oy, cs - 1, cs - 1);

    ctx.fillStyle = 'rgba(219,181,80,0.5)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★ Goal row ★', W/2, oy - 8);

    const pc = 2;
    const px = ox + pc * cs + cs/2;
    const startY = oy + 3 * cs + cs/2;
    const endY = oy + cs/2;

    const cycle = t % 5;

    if (cycle < 2.5) {
        // Animate piece advancing
        const p = ease(Math.min(1, cycle / 2));
        const animY = lerp(startY, endY, p);

        if (p > 0.1) drawDashedLine(ctx, px, startY, px, animY, 'rgba(219,181,80,0.3)');
        drawPiece(ctx, px, animY, cs * 0.85, 'green', null, true);

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Reach the goal row...', W/2, oy + rows * cs + 16);
    } else {
        // Victory!
        drawPiece(ctx, px, endY, cs * 0.85, 'green', null, true);

        const bt = cycle - 2.5;

        // Ring expanding
        ctx.strokeStyle = `rgba(219,181,80,${Math.max(0, 0.6 - bt * 0.3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, endY, bt * 30, 0, Math.PI * 2);
        ctx.stroke();

        // 勝
        ctx.fillStyle = `rgba(219,181,80,${Math.min(1, bt * 1.5)})`;
        ctx.font = 'bold 36px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('勝', W/2, oy + rows * cs + 40);

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('You win!', W/2, oy + rows * cs + 60);
    }
}
