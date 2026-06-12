// AI Web Worker — runs minimax in background thread
const COLS = 6;
const ROWS = 9;
const PIECE_MOVES = {
    1: { up: 1, left: 2, down: 3, right: 4 },
    2: { up: 2, left: 3, down: 4, right: 1 }
};

const WIN_SCORE = 100000;
const PIECE_VALUE = 1000;
const TIME_LIMITS = { easy: 200, medium: 1000, hard: 2000, expert: 3500 };

let abortSearch = false;
let nodesSearched = 0;

onmessage = function(e) {
    const { board, difficulty } = e.data;
    const result = cpuChooseMove(board, difficulty);
    postMessage(result);
};

function cpuChooseMove(board, difficulty) {
    const allMoves = getAllMovesForPlayer('red', board);
    if (allMoves.length === 0) return null;

    if (difficulty === 'easy') {
        const scored = allMoves.map(m => ({ ...m, score: quickEval(m, board) }));
        scored.sort((a, b) => b.score - a.score);
        const pick = Math.random();
        if (pick < 0.4) return scored[Math.floor(Math.random() * scored.length)];
        if (pick < 0.7) return scored[Math.floor(Math.random() * Math.min(5, scored.length))];
        return scored[0];
    }

    // Iterative deepening with time limit
    const timeLimit = TIME_LIMITS[difficulty] || 2000;
    const startTime = Date.now();
    let bestMove = allMoves[0];
    let bestScore = -Infinity;
    abortSearch = false;
    nodesSearched = 0;

    const maxDepth = difficulty === 'medium' ? 6 : difficulty === 'hard' ? 10 : 14;

    // Order moves for better pruning
    const orderedMoves = orderMoves(allMoves, board);

    // Check for instant win
    for (const move of orderedMoves) {
        if (move.to.row === ROWS - 1) return move;
    }

    for (let depth = 1; depth <= maxDepth; depth++) {
        let depthBest = null;
        let depthBestScore = -Infinity;
        abortSearch = false;

        for (const move of orderedMoves) {
            if (Date.now() - startTime > timeLimit) { abortSearch = true; break; }

            const newBoard = applyMoveToBoard(move, board);
            const score = minimax(newBoard, depth - 1, -Infinity, Infinity, false, startTime, timeLimit);

            if (abortSearch) break;

            if (score > depthBestScore) {
                depthBestScore = score;
                depthBest = move;
            }
        }

        if (!abortSearch && depthBest) {
            bestMove = depthBest;
            bestScore = depthBestScore;

            // Re-order moves: put best move first for next iteration
            const idx = orderedMoves.indexOf(depthBest);
            if (idx > 0) {
                orderedMoves.splice(idx, 1);
                orderedMoves.unshift(depthBest);
            }

            if (bestScore >= WIN_SCORE - 20) break;
        }

        if (abortSearch) break;
    }

    return bestMove;
}

function quickEval(move, board) {
    let score = move.to.captures.length * 100;
    if (move.to.row === ROWS - 1) score += 10000;
    score += move.to.row * 3;
    return score;
}

function orderMoves(moves, board) {
    return moves.slice().sort((a, b) => {
        let aScore = a.to.captures.length * 200;
        let bScore = b.to.captures.length * 200;
        if (a.to.row === ROWS - 1) aScore += 50000;
        if (b.to.row === ROWS - 1) bScore += 50000;
        aScore += a.to.row * 5;
        bScore += b.to.row * 5;
        return bScore - aScore;
    });
}

function minimax(boardState, depth, alpha, beta, isMaximizing, startTime, timeLimit) {
    nodesSearched++;

    // Time check every 1000 nodes
    if (nodesSearched % 1000 === 0 && Date.now() - startTime > timeLimit) {
        abortSearch = true;
        return 0;
    }

    const winner = checkWinOnBoard(boardState);
    if (winner === 'red') return WIN_SCORE + depth;
    if (winner === 'green') return -WIN_SCORE - depth;

    if (depth === 0) return evaluateBoard(boardState);

    const player = isMaximizing ? 'red' : 'green';
    const moves = getAllMovesForPlayer(player, boardState);
    if (moves.length === 0) return isMaximizing ? -WIN_SCORE : WIN_SCORE;

    // Move ordering
    moves.sort((a, b) => {
        let as = a.to.captures.length * 50;
        let bs = b.to.captures.length * 50;
        if (player === 'red') { as += a.to.row; bs += b.to.row; }
        else { as += (ROWS - 1 - a.to.row); bs += (ROWS - 1 - b.to.row); }
        return bs - as;
    });

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            if (abortSearch) return maxEval;
            const newBoard = applyMoveToBoard(move, boardState);
            const eval_ = minimax(newBoard, depth - 1, alpha, beta, false, startTime, timeLimit);
            if (eval_ > maxEval) maxEval = eval_;
            if (eval_ > alpha) alpha = eval_;
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            if (abortSearch) return minEval;
            const newBoard = applyMoveToBoard(move, boardState);
            const eval_ = minimax(newBoard, depth - 1, alpha, beta, true, startTime, timeLimit);
            if (eval_ < minEval) minEval = eval_;
            if (eval_ < beta) beta = eval_;
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function evaluateBoard(boardState) {
    let score = 0;
    let aiPieces = 0, oppPieces = 0;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = boardState[r][c];
            if (!piece) continue;

            if (piece.player === 'red') {
                aiPieces++;
                // Advancement (red wants to go to row 8)
                score += r * 18;
                // Close to winning
                if (r >= 7) score += (r - 6) * 80;
                if (r === ROWS - 1) return WIN_SCORE;
                // Center control
                score += (3 - Math.abs(c - 2.5)) * 6;
                // Back-row threat
                const moves = getValidMovesOnBoard(r, c, 'red', boardState);
                for (const m of moves) {
                    if (m.row === ROWS - 1) score += 250;
                    if (m.captures.length > 0) score += m.captures.length * 30;
                }
            } else {
                oppPieces++;
                // Green advancement (green wants to go to row 0)
                score -= (ROWS - 1 - r) * 18;
                if (r <= 1) score -= (2 - r) * 80;
                if (r === 0) return -WIN_SCORE;
                score -= (3 - Math.abs(c - 2.5)) * 6;
                const moves = getValidMovesOnBoard(r, c, 'green', boardState);
                for (const m of moves) {
                    if (m.row === 0) score -= 280;
                    if (m.captures.length > 0) score -= m.captures.length * 35;
                }
            }
        }
    }

    score += (aiPieces - oppPieces) * PIECE_VALUE;

    return score;
}

function checkWinOnBoard(boardState) {
    let greenPieces = 0, redPieces = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const p = boardState[r][c];
            if (!p) continue;
            if (p.player === 'green') { greenPieces++; if (r === 0) return 'green'; }
            else { redPieces++; if (r === ROWS - 1) return 'red'; }
        }
    }
    if (greenPieces === 0) return 'red';
    if (redPieces === 0) return 'green';
    return null;
}

function applyMoveToBoard(move, boardState) {
    const newBoard = boardState.map(row => row.slice());
    const piece = newBoard[move.fromRow][move.fromCol];
    newBoard[move.fromRow][move.fromCol] = null;
    for (const cap of move.to.captures) newBoard[cap.row][cap.col] = null;
    newBoard[move.to.row][move.to.col] = piece;
    return newBoard;
}

function getAllMovesForPlayer(player, boardState) {
    const allMoves = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (boardState[r][c] && boardState[r][c].player === player) {
                const moves = getValidMovesOnBoard(r, c, player, boardState);
                moves.forEach(m => allMoves.push({ fromRow: r, fromCol: c, to: m }));
            }
        }
    }
    return allMoves;
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
            if (midPiece && midPiece.player !== player) captures.push({ row: midRow, col: midCol });
        }

        if (targetPiece && targetPiece.player !== player) captures.push({ row: targetRow, col: targetCol });

        results.push({ row: targetRow, col: targetCol, captures });
    }

    return results;
}
