/* Classic Games: Block Battle. Falling-block puzzles side by side. Clear lines to send junk rows (with one gap) to
   the other player's board: 2 lines send 1 row, 3 send 2, 4 send 4. If a new piece can't fit at the top, you're
   out. Both players get the same pieces in the same order (from the match's seed). Each app runs its own board so it
   reacts instantly; the host's app is the referee (see games-duel.js). */
(() => {
'use strict';

const W = 960, H = 540;
const COLS = 10, ROWS = 20, CELL = 22;
const SHAPES = { // each piece: its 4 rotations, as [x, y] cells
  I: [[[0, 1], [1, 1], [2, 1], [3, 1]], [[2, 0], [2, 1], [2, 2], [2, 3]], [[0, 2], [1, 2], [2, 2], [3, 2]], [[1, 0], [1, 1], [1, 2], [1, 3]]],
  O: [[[1, 0], [2, 0], [1, 1], [2, 1]]],
  T: [[[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]]],
  S: [[[1, 0], [2, 0], [0, 1], [1, 1]], [[1, 0], [1, 1], [2, 1], [2, 2]], [[1, 1], [2, 1], [0, 2], [1, 2]], [[0, 0], [0, 1], [1, 1], [1, 2]]],
  Z: [[[0, 0], [1, 0], [1, 1], [2, 1]], [[2, 0], [1, 1], [2, 1], [1, 2]], [[0, 1], [1, 1], [1, 2], [2, 2]], [[1, 0], [0, 1], [1, 1], [0, 2]]],
  J: [[[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]]],
  L: [[[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]], [[0, 1], [1, 1], [2, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]]],
};
const TYPES = 'IOTSZJL';
const COLORS = ['#000', '#3fd8e8', '#f5d43b', '#b05ce8', '#5ad65a', '#ef4f4f', '#4a6cf0', '#f59a3b', '#8a8f9c'];
const SEND = [0, 0, 1, 2, 4];
const LIMIT = 180;

function hash(seed, n, k) {
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
// Piece number n: the pieces come in shuffled bags of all seven, the same bags for both players.
function pieceAt(seed, n) {
  const bag = Math.floor(n / 7), order = TYPES.split('');
  for (let k = 6; k > 0; k--) { const j = Math.floor(hash(seed, bag, k) * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
  return order[n % 7];
}
const cells = (t, r) => SHAPES[t][r % SHAPES[t].length];
function fits(b, t, r, x, y) {
  return cells(t, r).every(([cx, cy]) => {
    const X = x + cx, Y = y + cy;
    return X >= 0 && X < COLS && Y < ROWS && (Y < 0 || !b[Y * COLS + X]);
  });
}

CA.games.add('blocks', {
  name: 'Block Battle', icon: '🧱',
  blurb: 'Falling blocks, side by side! Fill rows to clear them and send junk to the other board. A/D move, W rotates, S drops faster, Space drops all the way. Don\'t reach the top!',
  start(ctx) {
    const seed = Math.floor(ctx.rng() * 4294967296) >>> 0;
    const sound = CA.games.kit.sound;
    const newPiece = (p, api) => {
      const t = pieceAt(seed, p.n++);
      Object.assign(p, { t, r: 0, x: 3, y: t === 'I' ? -1 : 0, ground: 0, moves: 0 });
      if (!fits(p.b, p.t, p.r, p.x, p.y)) { p.dead = true; if (api.self) sound('lose'); }
    };
    const lock = (p, api) => {
      cells(p.t, p.r).forEach(([cx, cy]) => { if (p.y + cy >= 0) p.b[(p.y + cy) * COLS + p.x + cx] = TYPES.indexOf(p.t) + 1; });
      if (cells(p.t, p.r).some(([, cy]) => p.y + cy < 0)) { p.dead = true; return; }
      let cleared = 0;
      for (let y = ROWS - 1; y >= 0; y--) {
        let full = true;
        for (let x = 0; x < COLS; x++) if (!p.b[y * COLS + x]) { full = false; break; }
        if (!full) continue;
        p.b.copyWithin(COLS, 0, y * COLS);
        p.b.fill(0, 0, COLS);
        cleared++;
        y++;
      }
      if (cleared) {
        p.lines += cleared;
        let send = SEND[cleared];
        const cancel = Math.min(send, p.inc); // (sending cancels junk that's on its way to you)
        p.inc -= cancel;
        send -= cancel;
        if (send > 0) { p.sent += send; api.toOther({ g: send, hole: Math.floor(hash(seed, 999, p.lines) * COLS) }); }
        p.flash = 0.3;
        if (api.self) sound(cleared >= 4 ? 'win' : 'point');
      } else if (api.self) sound([[180, 0, 0.04]]);
      if (p.inc > 0) { // junk arrives: rows at the bottom with one gap
        const n = Math.min(p.inc, ROWS);
        p.b.copyWithin(0, n * COLS);
        for (let k = 0; k < n; k++) {
          const y = ROWS - 1 - k, hole = p.holes.length ? p.holes.shift() : 0;
          for (let x = 0; x < COLS; x++) p.b[y * COLS + x] = x === hole ? 0 : 8;
        }
        p.inc = 0;
        if (api.self) sound([[110, 0, 0.12]]);
      }
      newPiece(p, api);
    };
    CA.duel.run(ctx, {
      id: 'blocks', mode: 'own', sendMs: 80,
      keys: { KeyX: 'u', KeyZ: 'u' },
      pad: { buttons: [{ k: 'l', label: '◀' }, { k: 'r', label: '▶' }, { k: 'u', label: '⟳' }, { k: 'd', label: '▼' }, { k: 'a', label: '⤓ Drop', main: true }] },
      help: 'A/D move · W rotate · S drop faster · Space drop · clear lines to send junk',
      note: 'Last one standing',
      initMine(api) {
        const p = { b: new Uint8Array(COLS * ROWS), n: 0, t: 'I', r: 0, x: 3, y: 0, fall: 0, ground: 0, moves: 0, lines: 0, sent: 0, inc: 0, holes: [], dead: false, time: 0, rep: { l: 0, r: 0 }, flash: 0, bot: null };
        newPiece(p, api);
        return p;
      },
      stepMine(p, inp, dt, api) {
        if (p.dead) return;
        p.time += dt;
        p.flash = Math.max(0, p.flash - dt);
        const tryMove = (dx, dy, dr) => {
          const r = (p.r + dr) % 4;
          for (const kx of dr ? [0, -1, 1, -2, 2] : [0]) {
            for (const ky of dr ? [0, -1] : [0]) {
              if (fits(p.b, p.t, r, p.x + dx + kx, p.y + dy + ky)) { p.x += dx + kx; p.y += dy + ky; p.r = r; if (p.ground > 0 && p.moves++ < 12) p.ground = 0.001; return true; }
            }
          }
          return false;
        };
        for (const k of ['l', 'r']) { // moving, with auto-repeat while held
          const dx = k === 'l' ? -1 : 1;
          if (inp.hit[k]) { tryMove(dx, 0, 0); p.rep[k] = 0.16; }
          else if (inp.held[k]) { p.rep[k] -= dt; while (p.rep[k] <= 0) { tryMove(dx, 0, 0); p.rep[k] += 0.05; } }
        }
        if (inp.hit.u) { if (tryMove(0, 0, 1) && api.self) sound([[620, 0, 0.03]]); }
        if (inp.hit.a) { while (fits(p.b, p.t, p.r, p.x, p.y + 1)) p.y++; lock(p, api); return; }
        const gravity = Math.max(0.07, 0.75 - p.time * 0.0045);
        p.fall += dt;
        const every = inp.held.d ? Math.min(0.04, gravity) : gravity;
        while (p.fall >= every) {
          p.fall -= every;
          if (fits(p.b, p.t, p.r, p.x, p.y + 1)) { p.y++; p.ground = 0; } else if (!p.ground) p.ground = 0.001;
        }
        if (p.ground) { p.ground += dt; if (p.ground > 0.45) lock(p, api); }
      },
      onMsg(p, m) {
        if (!m || !Number.isFinite(m.g)) return;
        const n = Math.max(0, Math.min(8, Math.round(m.g)));
        p.inc += n;
        for (let k = 0; k < n; k++) p.holes.push(Math.max(0, Math.min(COLS - 1, Math.round(m.hole) || 0)));
      },
      snapMine(p) {
        return { b: p.b.join(''), t: p.t, r: p.r, x: p.x, y: p.y, nx: pieceAt(seed, p.n), ln: p.lines, sn: p.sent, inc: p.inc, d: p.dead ? 1 : 0, f: p.flash > 0 ? 1 : 0 };
      },
      referee(sn, api) {
        api.score(sn[0].ln, sn[1].ln);
        if (sn[0].d || sn[1].d) api.end(sn[0].d && sn[1].d ? -1 : sn[0].d ? 1 : 0, 'TOP OUT!');
        else if (api.t >= LIMIT) api.end(sn[0].ln === sn[1].ln ? -1 : sn[0].ln > sn[1].ln ? 0 : 1, 'TIME!');
      },
      bot(p, i, dt, api) {
        const out = { held: {}, hit: {} };
        if (p.dead) return out;
        const b = p.bot || (p.bot = { plan: null, n: -1, wait: 0 });
        if (b.n !== p.n) { b.n = p.n; b.plan = plan(p); b.wait = 0.25 + (1 - api.skill) * 0.4; b.acts = 0; }
        b.wait -= dt;
        if (b.wait > 0 || !b.plan) return out;
        b.wait = 0.035 + (1 - api.skill) * 0.16;
        if (++b.acts > 14) out.hit.a = true; // (stuck: just drop it)
        else if (p.r !== b.plan.r) out.hit.u = true;
        else if (p.x < b.plan.x) out.hit.r = true;
        else if (p.x > b.plan.x) out.hit.l = true;
        else out.hit.a = true;
        if (Math.random() < 0.04 * (1 - api.skill)) { out.hit = { a: true }; } // (easy bots drop too soon now and then)
        return out;
      },
      draw,
    });
  },
});

// The bot's choice: try every rotation and column, and score the board you'd get (lines are good; holes, height and
// bumps are bad).
function plan(p) {
  let best = null, bestS = -Infinity;
  for (let r = 0; r < SHAPES[p.t].length; r++) {
    for (let x = -2; x < COLS; x++) {
      if (!fits(p.b, p.t, r, x, p.y)) continue;
      let y = p.y;
      while (fits(p.b, p.t, r, x, y + 1)) y++;
      const b = p.b.slice();
      cells(p.t, r).forEach(([cx, cy]) => { if (y + cy >= 0) b[(y + cy) * COLS + x + cx] = 1; });
      let lines = 0;
      for (let yy = 0; yy < ROWS; yy++) { let f = true; for (let xx = 0; xx < COLS; xx++) if (!b[yy * COLS + xx]) f = false; if (f) lines++; }
      const hts = [];
      let holes = 0;
      for (let xx = 0; xx < COLS; xx++) {
        let h = 0, seen = false;
        for (let yy = 0; yy < ROWS; yy++) {
          if (b[yy * COLS + xx]) { if (!seen) { h = ROWS - yy; seen = true; } } else if (seen) holes++;
        }
        hts.push(h);
      }
      const agg = hts.reduce((a, c) => a + c, 0);
      let bump = 0;
      for (let xx = 1; xx < COLS; xx++) bump += Math.abs(hts[xx] - hts[xx - 1]);
      const s = -0.51 * agg + 0.76 * lines - 0.36 * holes * 3 - 0.18 * bump;
      if (s > bestS) { bestS = s; best = { r, x }; }
    }
  }
  return best;
}

function drawBoard(v, p, i, bx, by, nextLeft) {
  const g = v.g;
  g.fillStyle = 'rgba(10, 12, 30, .92)';
  v.roundRect(bx - 8, by - 8, COLS * CELL + 16, ROWS * CELL + 16, 10); g.fill();
  g.strokeStyle = v.team[i].main;
  g.lineWidth = 3;
  v.roundRect(bx - 8, by - 8, COLS * CELL + 16, ROWS * CELL + 16, 10); g.stroke();
  g.strokeStyle = 'rgba(255, 255, 255, .04)';
  g.lineWidth = 1;
  for (let x = 1; x < COLS; x++) { g.beginPath(); g.moveTo(bx + x * CELL, by); g.lineTo(bx + x * CELL, by + ROWS * CELL); g.stroke(); }
  if (!p) { v.label('Waiting…', bx + COLS * CELL / 2, by + ROWS * CELL / 2, 18, '#ffffff'); return; }
  const block = (x, y, c, a) => {
    if (y < 0) return;
    g.globalAlpha = a == null ? 1 : a;
    g.fillStyle = COLORS[c];
    g.fillRect(bx + x * CELL + 1, by + y * CELL + 1, CELL - 2, CELL - 2);
    g.fillStyle = 'rgba(255, 255, 255, .25)';
    g.fillRect(bx + x * CELL + 1, by + y * CELL + 1, CELL - 2, 4);
    g.globalAlpha = 1;
  };
  for (let k = 0; k < COLS * ROWS; k++) { const c = +p.b[k]; if (c) block(k % COLS, Math.floor(k / COLS), c); }
  if (!p.d) {
    const c = TYPES.indexOf(p.t) + 1;
    let gy = p.y; // where it would land
    const board = p.b.split('').map(Number);
    while (fits(board, p.t, p.r, p.x, gy + 1)) gy++;
    cells(p.t, p.r).forEach(([cx, cy]) => block(p.x + cx, gy + cy, c, 0.22));
    cells(p.t, p.r).forEach(([cx, cy]) => block(p.x + cx, p.y + cy, c));
  }
  if (p.f) { g.fillStyle = 'rgba(255, 255, 255, .15)'; g.fillRect(bx, by, COLS * CELL, ROWS * CELL); }
  if (p.inc > 0) { // junk on its way
    g.fillStyle = '#ff4d4d';
    g.fillRect(bx - 18, by + ROWS * CELL - Math.min(ROWS, p.inc) * CELL, 6, Math.min(ROWS, p.inc) * CELL);
  }
  // next piece
  const nx = nextLeft ? bx - 84 : bx + COLS * CELL + 24, ny = by + 10;
  v.label('Next', nx + 30, ny, 12, '#cccccc');
  cells(p.nx, 0).forEach(([cx, cy]) => { g.fillStyle = COLORS[TYPES.indexOf(p.nx) + 1]; g.fillRect(nx + cx * 14, ny + 14 + cy * 14, 13, 13); });
  v.label((i === v.me ? 'You' : v.names[i]) + ' · ' + p.ln + ' lines', bx + COLS * CELL / 2, by - 22, 15, v.team[i].light);
  if (p.d) v.label('TOPPED OUT', bx + COLS * CELL / 2, by + ROWS * CELL / 2, 22, '#ff5a5a');
}

function draw(v, mine, theirs) {
  const g = v.g;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1b1440');
  bg.addColorStop(1, '#0d2a4a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const by = (H - ROWS * CELL) / 2 + 12;
  drawBoard(v, mine, v.me, 176, by); // (both boards between the camera walls in the top corners; the right one shows the next piece on its left)
  drawBoard(v, theirs, v.them, 566, by, true);
  v.label('VS', W / 2, H / 2, 30, '#ffd23f');
  v.label('⏱ ' + Math.max(0, Math.ceil(LIMIT - v.t())), W / 2, H / 2 + 40, 14, '#ffffff');
}

})();
