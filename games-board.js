/* Classic Games: Connect Four and Speed Chess (with the nuke). */
(() => {
'use strict';

const { $, setMsg, sound, shuffle, startTimer, stopTimer, fmtTime } = CA.games.kit;

/* ================= CONNECT FOUR ================= */

const COLS = 7;
const ROWS = 6;
const DISC = { 1: '🔴', 2: '🟡' };
const C4_ORDER = [3, 2, 4, 1, 5, 0, 6]; // middle columns first: they're usually best
const WINDOWS = (() => { // every line of 4 cells on the board
  const w = [];
  const at = (r, c) => r * COLS + c;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 3 < COLS) w.push([at(r, c), at(r, c + 1), at(r, c + 2), at(r, c + 3)]);
      if (r + 3 < ROWS) w.push([at(r, c), at(r + 1, c), at(r + 2, c), at(r + 3, c)]);
      if (r + 3 < ROWS && c + 3 < COLS) w.push([at(r, c), at(r + 1, c + 1), at(r + 2, c + 2), at(r + 3, c + 3)]);
      if (r - 3 >= 0 && c + 3 < COLS) w.push([at(r, c), at(r - 1, c + 1), at(r - 2, c + 2), at(r - 3, c + 3)]);
    }
  }
  return w;
})();

function c4Drop(b, c) { // the cell a disc dropped in column c lands on (or -1 when it's full)
  for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + c]) return r * COLS + c;
  return -1;
}
function c4Winner(b) {
  for (const w of WINDOWS) {
    const v = b[w[0]];
    if (v && v === b[w[1]] && v === b[w[2]] && v === b[w[3]]) return { v, cells: w };
  }
  return null;
}
function c4Eval(b, p) {
  const o = 3 - p;
  let s = 0;
  for (let r = 0; r < ROWS; r++) { const v = b[r * COLS + 3]; if (v === p) s += 3; else if (v === o) s -= 3; }
  for (const w of WINDOWS) {
    let mp = 0, mo = 0;
    for (const i of w) { if (b[i] === p) mp++; else if (b[i] === o) mo++; }
    if (mp && mo) continue;
    if (mp === 3) s += 6; else if (mp === 2) s += 2;
    else if (mo === 3) s -= 8; else if (mo === 2) s -= 2;
  }
  return s;
}
function c4Negamax(b, depth, alpha, beta, p) {
  const win = c4Winner(b);
  if (win) return win.v === p ? 100000 + depth : -100000 - depth;
  if (depth === 0) return c4Eval(b, p);
  let best = -Infinity;
  for (const c of C4_ORDER) {
    const i = c4Drop(b, c);
    if (i < 0) continue;
    b[i] = p;
    const s = -c4Negamax(b, depth - 1, -beta, -alpha, 3 - p);
    b[i] = 0;
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? 0 : best; // a full board is a draw
}
function c4BotMove(b, p, level) {
  const legal = C4_ORDER.filter(c => c4Drop(b, c) >= 0);
  if (level <= 1 && Math.random() < 0.3) return legal[Math.floor(Math.random() * legal.length)];
  const depth = level <= 1 ? 2 : level >= 9 ? 6 : 4;
  let best = -Infinity;
  let pick = legal[0];
  for (const c of legal) {
    const i = c4Drop(b, c);
    b[i] = p;
    const s = -c4Negamax(b, depth - 1, -Infinity, Infinity, 3 - p) + Math.random() * 1.5;
    b[i] = 0;
    if (s > best) { best = s; pick = c; }
  }
  return pick;
}

CA.games.add('c4', {
  name: 'Connect Four', icon: '🟦', blurb: 'Take turns dropping discs, 5 seconds a turn. First to get 4 in a row (across, up and down, or diagonal) wins!',
  start(ctx) {
    const TURN_MS = 5000;
    const hostFirst = ctx.rng() < 0.5;
    const me = hostFirst === ctx.isHost ? 1 : 2; // 🔴 (1) always goes first
    const them = 3 - me;
    const b = Array(COLS * ROWS).fill(0);
    let turn = 1;
    let moves = 0;
    let over = false;
    let turnTimer = null;
    let hover = -1;
    let lastCell = -1;

    ctx.stage.innerHTML =
      '<div class="g-c4"><div class="c4-board" id="c4Board">' +
      Array.from({ length: COLS * ROWS }, (_, i) => '<div class="c4-cell" data-c="' + (i % COLS) + '"><i></i></div>').join('') +
      '</div><div class="timer"><i id="c4Timer"></i></div><p class="g-msg" id="c4Msg"></p></div>';
    const board = $('c4Board');
    const cells = [...board.querySelectorAll('.c4-cell')];

    function render() {
      const mine = !over && turn === me;
      board.classList.toggle('my-turn', mine);
      cells.forEach((el, i) => {
        el.className = 'c4-cell' + (b[i] ? ' p' + b[i] : '') + (mine && i % COLS === hover && c4Drop(b, hover) >= 0 ? ' hover' : '') + (i === lastCell ? ' last drop' : '');
      });
    }

    ctx.listen(board, 'pointermove', e => {
      const el = e.target.closest && e.target.closest('.c4-cell');
      const c = el ? +el.dataset.c : -1;
      if (c !== hover) { hover = c; render(); }
    });
    ctx.listen(board, 'pointerleave', () => { hover = -1; render(); });
    ctx.listen(board, 'click', e => {
      const el = e.target.closest && e.target.closest('.c4-cell');
      if (el && !over && turn === me) place(+el.dataset.c, me);
    });
    ctx.on(msg => {
      if (msg && msg.t === 'c4' && Number.isInteger(msg.c) && msg.n === moves && turn === them && !over) place(msg.c, them);
    });

    function place(c, p) {
      const i = c4Drop(b, c);
      if (i < 0 || over) return;
      b[i] = p;
      moves++;
      lastCell = i;
      if (p === me) ctx.send({ t: 'c4', c, n: moves - 1 });
      cells[i].style.setProperty('--fall', Math.floor(i / COLS) + 1);
      render();
      sound('move');
      const win = c4Winner(b);
      if (win || moves === COLS * ROWS) { end(win); return; }
      turn = 3 - p;
      nextTurn();
    }

    function nextTurn() {
      if (turnTimer) ctx.cancel(turnTimer);
      startTimer('c4Timer', TURN_MS);
      const m = moves;
      if (turn === me) {
        setMsg('c4Msg', 'Your turn! You are ' + DISC[me] + '. Click a column.');
        turnTimer = ctx.later(() => {
          if (turn !== me || moves !== m || over) return;
          const legal = C4_ORDER.filter(c => c4Drop(b, c) >= 0);
          place(legal[Math.floor(Math.random() * legal.length)], me);
          if (!over) setMsg('c4Msg', 'Too slow! We dropped one for you.');
        }, TURN_MS);
      } else {
        setMsg('c4Msg', ctx.oppName + ' ' + DISC[them] + ' is thinking…');
        turnTimer = ctx.bot
          ? ctx.later(() => { if (turn === them && moves === m && !over) place(c4BotMove(b.slice(), them, ctx.bot.level), them); }, 500 + Math.random() * 900)
          : ctx.later(() => { if (turn === them && moves === m && !over) ctx.afk(); }, TURN_MS + 25000);
      }
      render();
    }

    function end(win) {
      over = true;
      if (turnTimer) ctx.cancel(turnTimer);
      stopTimer('c4Timer');
      hover = -1;
      render();
      if (win) win.cells.forEach(i => cells[i].classList.add('win'));
      const outcome = !win ? 'draw' : win.v === me ? 'win' : 'lose';
      ctx.score(outcome === 'win' ? 1 : 0, outcome === 'lose' ? 1 : 0);
      setMsg('c4Msg', !win ? 'The board is full. Tie game!' : win.v === me ? 'Four in a row! 🎉' : ctx.oppName + ' got four in a row.');
      if (outcome === 'lose') ctx.oppCheer();
      ctx.later(() => ctx.finish(outcome), 2000);
    }

    ctx.score(0, 0);
    ctx.note('You are ' + DISC[me] + (me === 1 ? ' · you go first' : ' · ' + ctx.oppName + ' goes first'));
    render();
    nextTurn();
  },
});

/* ================= SPEED CHESS ================= */

const FILES = 'abcdefgh';
const VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };
const ALL_SQUARES = [];
for (let r = 8; r >= 1; r--) for (let f = 0; f < 8; f++) ALL_SQUARES.push(FILES[f] + r);

function toFen(kings, keep, turn) {
  const grid = {};
  grid[kings.w] = 'K';
  grid[kings.b] = 'k';
  for (const { sq, p } of keep) grid[sq] = p.color === 'w' ? p.type.toUpperCase() : p.type;
  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const ch = grid[FILES[f] + rank];
      if (ch) { if (empty) { row += empty; empty = 0; } row += ch; } else empty++;
    }
    rows.push(row + (empty || ''));
  }
  return rows.join('/') + ' ' + turn + ' - - 0 1';
}

function fenOk(fen, strict) {
  const g = new Chess();
  if (!g.load(fen)) return false;
  if (g.in_checkmate() || g.in_stalemate()) return false;
  if (strict && g.insufficient_material()) return false;
  const other = new Chess(); // the player who just moved can't be left in check
  if (!other.load(fen.replace(/ ([wb]) /, (m, t) => ' ' + (t === 'w' ? 'b' : 'w') + ' '))) return false;
  return !other.in_check();
}

CA.games.add('speedchess', {
  name: 'Speed Chess', icon: '♟️', blurb: '8 seconds per move. No winner after 40 seconds? 💣 The board gets nuked, and you play on with the few pieces left!',
  start(ctx) {
    if (typeof window.Chess !== 'function') { ctx.stage.innerHTML = '<div class="stage-wait">Chess could not load.</div>'; ctx.later(() => ctx.finish('draw'), 1500); return; }
    const PHASES = window.__chessPhases || [40000, 25000]; // (the tests make these shorter)
    const MOVE_MS = window.__chessMoveMs || 8000;
    const hostWhite = ctx.rng() < 0.5;
    const myColor = hostWhite === ctx.isHost ? 'w' : 'b';
    const theirColor = myColor === 'w' ? 'b' : 'w';
    const chess = new Chess();
    let ply = 0;          // counts moves across the nuke (loading the new position resets chess.js's own history)
    let phase = 1;        // 1 = normal chess, 2 = after the nuke
    let nukeDue = false;
    let endDue = false;
    let over = false;
    let selected = null;
    let targets = [];
    let dragFrom = null;
    let lastMove = null;
    let turnTimer = null;
    let phaseTimer = null;
    let phaseEnds = 0;
    if (window.__testHooks) window.__peek = { chess, myColor };

    ctx.stage.innerHTML =
      '<div class="g-chess">' +
      '<div class="sc-top"><span class="sc-clock" id="scClock"></span><span class="sc-turn" id="scTurn"></span></div>' +
      '<div class="sc-frame" id="scFrame"><div class="board sc-board" id="scBoard"></div><div class="sc-boom hidden" id="scBoom">💣 NUKE!</div></div>' +
      '<div class="timer"><i id="scMoveTimer"></i></div><p class="g-msg" id="scMsg"></p></div>';
    const boardEl = $('scBoard');
    const sqEls = {};
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7;
      const sq = myColor === 'w' ? FILES[c] + (8 - r) : FILES[7 - c] + (r + 1);
      const el = document.createElement('div');
      el.dataset.sq = sq;
      el.dataset.shade = (r + c) % 2 ? 'dark' : 'light';
      boardEl.appendChild(el);
      sqEls[sq] = el;
    }

    const myTurn = () => !over && chess.turn() === myColor;
    function material(color) {
      let s = 0;
      for (const sq of ALL_SQUARES) { const p = chess.get(sq); if (p && p.color === color) s += VALUE[p.type]; }
      return s;
    }
    function kingSquare(color) { return ALL_SQUARES.find(sq => { const p = chess.get(sq); return p && p.type === 'k' && p.color === color; }); }

    function render() {
      const check = chess.in_check() ? kingSquare(chess.turn()) : null;
      const tset = new Set(targets.map(m => m.to));
      for (const sq of ALL_SQUARES) {
        const el = sqEls[sq];
        const p = chess.get(sq);
        el.className = 'sq ' + el.dataset.shade +
          (lastMove && (sq === lastMove.from || sq === lastMove.to) ? ' last' : '') +
          (sq === selected ? ' sel' : '') +
          (tset.has(sq) ? (p ? ' capture' : ' target') : '') +
          (sq === check ? ' check' : '');
        const want = p ? p.color + p.type.toUpperCase() : '';
        if (el.dataset.p !== want) {
          el.dataset.p = want;
          const old = el.querySelector('.piece');
          if (old) old.remove();
          if (want) el.insertAdjacentHTML('afterbegin', '<div class="piece ' + want + '"></div>');
        }
      }
      boardEl.classList.toggle('can-move', myTurn());
      ctx.score(material(myColor), material(theirColor));
    }

    function tick() {
      const left = Math.max(0, phaseEnds - performance.now());
      setMsg('scClock', over ? (phase === 1 ? '♟️ Game over' : '💥 Game over') : phase === 1 ? '💣 Nuke in ' + fmtTime(left) : '⏱ ' + fmtTime(left) + ' left');
    }

    // Click a piece and then a square, or drag the piece there.
    const sqOf = el => (el && el.closest ? el.closest('.sq') : null);
    ctx.listen(boardEl, 'pointerdown', e => {
      const el = sqOf(e.target);
      if (!el) return;
      e.preventDefault();
      pick(el.dataset.sq);
    });
    ctx.listen(window, 'pointerup', e => {
      if (!dragFrom) return;
      const from = dragFrom;
      dragFrom = null;
      const el = sqOf(document.elementFromPoint(e.clientX, e.clientY));
      if (el && el.dataset.sq !== from && selected === from && targets.some(m => m.to === el.dataset.sq)) tryMove(from, el.dataset.sq);
    });

    function pick(sq) {
      if (!myTurn()) return;
      if (selected && targets.some(m => m.to === sq)) { tryMove(selected, sq); return; }
      const p = chess.get(sq);
      if (p && p.color === myColor && sq !== selected) {
        selected = sq;
        targets = chess.moves({ square: sq, verbose: true });
        dragFrom = sq;
      } else {
        selected = null;
        targets = [];
      }
      render();
    }

    function tryMove(from, to) {
      if (!myTurn()) return false;
      const m = chess.move({ from, to, promotion: 'q' });
      if (!m) return false;
      ply++;
      ctx.send({ t: 'cm', ply, from, to });
      afterMove(m, true);
      return true;
    }

    ctx.on(msg => {
      if (!msg || over) return;
      if (msg.t === 'cm' && msg.ply === ply + 1 && chess.turn() === theirColor) {
        const m = chess.move({ from: String(msg.from), to: String(msg.to), promotion: 'q' });
        if (m) { ply++; afterMove(m, false); }
      } else if (msg.t === 'nuke' && phase === 1 && msg.ply === ply && typeof msg.fen === 'string') {
        applyNuke(msg.fen);
      } else if (msg.t === 'end' && phase === 2 && msg.ply === ply) {
        byMaterial("Time's up!");
      }
    });

    function afterMove(m, mine) {
      lastMove = { from: m.from, to: m.to };
      selected = null;
      targets = [];
      sound(m.captured ? 'capture' : 'move');
      if (!mine && m.captured) ctx.oppCheer();
      render();
      if (chess.in_checkmate()) {
        finishGame(mine ? 'win' : 'lose', mine ? 'Checkmate! You win! 🎉' : 'Checkmate. ' + ctx.oppName + ' wins.');
        return;
      }
      if (chess.in_draw()) {
        if (phase === 2) { byMaterial('No one can win from here.'); return; }
        nukeDue = true; // a draw means nobody won, so: nuke!
      }
      setMsg('scMsg', chess.in_check() ? (chess.turn() === myColor ? 'You are in check!' : 'Check!') : '');
      if (tryNuke() || tryEnd()) return;
      nextTurn();
    }

    function nextTurn() {
      if (turnTimer) { ctx.cancel(turnTimer); turnTimer = null; }
      if (over) return;
      startTimer('scMoveTimer', MOVE_MS);
      const at = ply;
      if (myTurn()) {
        setMsg('scTurn', 'Your move');
        turnTimer = ctx.later(() => {
          if (ply !== at || !myTurn()) return;
          const all = chess.moves({ verbose: true });
          const m = all[Math.floor(Math.random() * all.length)];
          if (tryMove(m.from, m.to) && !over) setMsg('scMsg', 'Too slow! A random move was made for you.');
        }, MOVE_MS);
      } else {
        setMsg('scTurn', ctx.oppName + "'s move");
        turnTimer = ctx.bot
          ? ctx.later(botMove, 400 + Math.random() * 1200)
          : ctx.later(() => { if (!over && ply === at && !myTurn()) ctx.afk(); }, MOVE_MS + 25000);
      }
      render();
    }

    function botMove() {
      if (over || myTurn()) return;
      const lvl = ctx.bot.level <= 1 ? 'easy' : ctx.bot.level >= 9 ? 'hard' : 'medium';
      let m = CA.chessAI ? CA.chessAI.pickMove(chess.fen(), lvl) : null;
      if (!m) { const all = chess.moves({ verbose: true }); m = all[Math.floor(Math.random() * all.length)]; }
      const res = m && chess.move({ from: m.from, to: m.to, promotion: 'q' });
      if (!res) return;
      ply++;
      afterMove(res, false);
    }

    function startPhase(len, onEnd) {
      if (phaseTimer) ctx.cancel(phaseTimer);
      phaseEnds = performance.now() + len;
      phaseTimer = ctx.later(onEnd, len);
      tick();
    }

    // Only the player whose turn it is sets off the nuke (or ends the game), so both boards always match.
    function tryNuke() {
      if (!nukeDue || phase !== 1 || over) return false;
      if (!ctx.bot && !myTurn()) { setMsg('scMsg', '💣 The nuke is coming…'); return false; }
      const fen = makeNuke();
      ctx.send({ t: 'nuke', ply, fen });
      applyNuke(fen);
      return true;
    }

    function makeNuke() { // keep both kings and up to 3 random pieces per side
      const kings = {};
      const rest = { w: [], b: [] };
      for (const sq of ALL_SQUARES) {
        const p = chess.get(sq);
        if (!p) continue;
        if (p.type === 'k') kings[p.color] = sq; else rest[p.color].push({ sq, p });
      }
      const turn = chess.turn();
      for (let tries = 0; tries < 80; tries++) {
        const keep = [];
        for (const color of ['w', 'b']) keep.push(...shuffle(rest[color], Math.random).slice(0, 3));
        const fen = toFen(kings, keep, turn);
        if (fenOk(fen, tries < 60)) return fen;
      }
      return toFen(kings, [], turn);
    }

    function applyNuke(fen) {
      if (!new Chess().load(fen)) return;
      const before = ALL_SQUARES.filter(sq => chess.get(sq));
      chess.load(fen);
      phase = 2;
      nukeDue = false;
      selected = null;
      targets = [];
      dragFrom = null;
      lastMove = null;
      render();
      boom(before.filter(sq => !chess.get(sq)));
      sound('boom');
      setMsg('scMsg', '💥 NUKED! Only a few pieces survived. Play on!');
      ctx.note('After the nuke · more pieces left wins');
      startPhase(PHASES[1], () => { endDue = true; tryEnd(); });
      if (chess.in_checkmate() || chess.in_draw()) { byMaterial('Not much survived!'); return; }
      nextTurn();
    }

    function boom(gone) {
      const frame = $('scFrame');
      frame.classList.remove('shake');
      void frame.offsetWidth;
      frame.classList.add('shake');
      $('scBoom').classList.remove('hidden');
      ctx.later(() => $('scBoom').classList.add('hidden'), 1300);
      for (const sq of gone) {
        const fx = document.createElement('span');
        fx.className = 'fx';
        fx.textContent = '💥';
        sqEls[sq].appendChild(fx);
        ctx.later(() => fx.remove(), 1000);
      }
    }

    function tryEnd() {
      if (!endDue || phase !== 2 || over) return false;
      if (!ctx.bot && !myTurn()) { setMsg('scMsg', "⏱ Time's up! Finishing…"); return false; }
      ctx.send({ t: 'end', ply });
      byMaterial("Time's up!");
      return true;
    }

    function byMaterial(reason) {
      const a = material(myColor), b = material(theirColor);
      const outcome = a > b ? 'win' : a < b ? 'lose' : 'draw';
      finishGame(outcome, reason + ' ' + (outcome === 'draw' ? 'Same piece points left (' + a + ' each). Tie!'
        : outcome === 'win' ? 'You have more piece points left (' + a + ' vs ' + b + '). You win!'
        : ctx.oppName + ' has more piece points left (' + b + ' vs ' + a + ').'));
    }

    function finishGame(outcome, text) {
      if (over) return;
      over = true;
      if (turnTimer) ctx.cancel(turnTimer);
      if (phaseTimer) ctx.cancel(phaseTimer);
      stopTimer('scMoveTimer');
      selected = null;
      targets = [];
      render();
      tick();
      setMsg('scTurn', '');
      setMsg('scMsg', text);
      if (outcome === 'lose') ctx.oppCheer();
      ctx.later(() => ctx.finish(outcome), 2400);
    }

    ctx.note('You are ' + (myColor === 'w' ? 'White (you go first)' : 'Black') + ' · 8s a move');
    ctx.every(tick, 250);
    startPhase(PHASES[0], () => { nukeDue = true; tryNuke(); });
    render();
    nextTurn();
  },
});

})();
