/* Classic Games: Speed Chess (with the nuke). */
(() => {
'use strict';

const { $, setMsg, sound, shuffle, startTimer, stopTimer, fmtTime } = CA.games.kit;

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
  name: 'Speed Chess', icon: '♟️', blurb: '8 seconds per move. No winner after 40 seconds? 💣 A nuke hits the middle of the board: it glows red with a warning first, so get your pieces out of the middle!',
  start(ctx) {
    if (typeof window.Chess !== 'function') { ctx.stage.innerHTML = '<div class="stage-wait">Chess could not load.</div>'; ctx.later(() => ctx.finish('draw'), 1500); return; }
    const PHASES = window.__chessPhases || [40000, 25000]; // (the tests make these shorter)
    const MOVE_MS = window.__chessMoveMs || 8000;
    const hostWhite = ctx.rng() < 0.5;
    const myColor = hostWhite === ctx.isHost ? 'w' : 'b';
    // The nuke hits the middle of the board (files c to f, ranks 3 to 6): everything there but the kings goes. From 15
    // seconds before, the middle glows red and you're told to get out of it.
    const inZone = sq => { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return f >= 2 && f <= 5 && r >= 2 && r <= 5; };
    const zoneName = 'middle';
    const WARN = 15000;
    const warning = () => phase === 1 && !over && phaseEnds - performance.now() <= WARN;
    const theirColor = myColor === 'w' ? 'b' : 'w';
    const chess = new Chess();
    let ply = 0;          // counts moves across the nuke (loading the new position resets chess.js's own history)
    let phase = 1;        // 1 = normal chess, 2 = after the nuke
    let nukeDue = false;
    let endDue = false;
    let over = false;
    let selected = null;
    let pre = null;      // a premove: { from, to }, picked while it is the other player's turn, played as soon as it is yours
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
          (pre && (sq === pre.from || sq === pre.to) ? ' pre' : '') +
          (tset.has(sq) ? (p ? ' capture' : ' target') : '') +
          (sq === check ? ' check' : '') +
          (warning() && inZone(sq) ? ' danger' : '');
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
      setMsg('scClock', over ? (phase === 1 ? '♟️ Game over' : '💥 Game over') : phase === 1 ? '💣 Nuke on the ' + zoneName + ' in ' + fmtTime(left) : '⏱ ' + fmtTime(left) + ' left');
      if (warning()) {
        setMsg('scMsg', '⚠️ Get out of the ' + zoneName + '! It gets nuked in ' + Math.ceil(left / 1000) + 's');
        render(); // (the zone glows red)
      }
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
      if (over) return;
      if (!myTurn()) { // premove: pick your piece, then where it should go (it is played, if it is legal then, when your turn comes)
        const own = chess.get(sq);
        if (pre && pre.from === sq) { pre = null; selected = null; render(); return; }
        if (selected && !(own && own.color === myColor)) {
          pre = { from: selected, to: sq };
          selected = null;
          setMsg('scMsg', 'Premove set: it plays as soon as it is your turn (tap the piece to cancel)');
          render();
          return;
        }
        selected = own && own.color === myColor ? sq : null;
        pre = null;
        render();
        return;
      }
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
        if (pre) {
          const p = pre;
          pre = null;
          ctx.later(() => { if (!over && myTurn() && ply === at && !tryMove(p.from, p.to)) { setMsg('scMsg', 'Your premove was not possible any more'); render(); } }, 150);
        }
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

    function makeNuke() { // everything in the zone goes, except the kings
      const kings = {}, keep = [];
      for (const sq of ALL_SQUARES) {
        const p = chess.get(sq);
        if (!p) continue;
        if (p.type === 'k') kings[p.color] = sq; else if (!inZone(sq)) keep.push({ sq, p });
      }
      const fen = toFen(kings, keep, chess.turn());
      return fenOk(fen, false) ? fen : randomNuke();
    }
    function randomNuke() { // (if that leaves an impossible position: keep both kings and up to 3 random pieces per side)
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
      pre = null;
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
      setMsg('scMsg', '💥 The ' + zoneName + ' got NUKED! Play on!');
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
