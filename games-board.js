/* Classic Games: Panic Chess. Chess with no turns: both players move at the same time. A piece moves the way it does in
   chess, slides across the board so you can see it coming (and get out of the way), and then has to recharge before it
   can move again. There's no check: take the king and you win. The board burns away from the edges, a ring at a time, with
   a warning first, and anything left there is gone. (The host's app runs the game: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const T = 62, BX = (W - T * 8) / 2, BY = 22;      // the size of a square, and where the board starts
const SLIDE = 5.5, HOP = 0.45;                    // how fast a piece slides (squares a second), and how long a knight's hop takes
const RECHARGE = 2.2;
const BURN = [30, 50, 70], WARN = 5, LENGTH = 90; // when each ring of the board burns; the game ends after the last
const BEHIND = 5, BOOST = 0.8;                    // the comeback boost: a faster recharge for whoever's this many points of pieces behind
const VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const clampRound = v => Math.max(0, Math.min(7, Math.round(v)));

CA.games.add('speedchess', {
  name: 'Panic Chess', icon: '♟️',
  blurb: 'Chess with NO TURNS: move any piece, any time, then it recharges. See an attack coming? Get out of the way! Take the king to win. The board burns away from the edges, so nobody can hide.',
  start(ctx) {
    const orders = [];   // (host) the moves waiting to be made
    let picked = null;   // this player's chosen piece (its id)
    let queued = null;   // a move for a piece that's still recharging: it goes as soon as it's ready
    let dragFrom = null;
    let latest = null;   // the pieces as this screen shows them
    let burnNow = 0;
    const meC = ctx.isHost ? 0 : 1;

    ctx.on(m => {
      if (ctx.isHost && m && m.t === 'pm' && Number.isInteger(m.id) && Number.isInteger(m.x) && Number.isInteger(m.y)) orders.push({ c: 1, id: m.id, x: m.x, y: m.y });
    });
    function order(id, x, y) {
      if (ctx.isHost) orders.push({ c: meC, id, x, y });
      else ctx.send({ t: 'pm', id, x, y });
    }

    CA.duel.run(ctx, {
      id: 'speedchess', mouse: true,
      help: 'Click a piece, then where it should go (or drag it) · no turns · it recharges after each move · take the king to win!',
      helpTouch: 'Tap a piece, then where it should go · take the king to win!',
      note: 'No turns! Take the king.',
      init, snap, lerp, bot, event,
      step(s, inp, dt, api) {
        if (inp[0].order) orders.push(Object.assign({ c: 0 }, inp[0].order));
        if (inp[1].order) orders.push(Object.assign({ c: 1 }, inp[1].order));
        step(s, orders.splice(0), dt, api);
      },
      local(v, s) {
        if (!s) return;
        latest = viewPieces(s);
        burnNow = s.b;
        // a queued move goes as soon as its piece is ready
        if (queued) {
          const p = latest.find(q => q.id === queued.id);
          if (!p) queued = null;
          else if (!p.mv && p.cd <= 0) {
            if (legal(latest, burnNow, p, queued.x, queued.y)) order(queued.id, queued.x, queued.y);
            queued = null;
          }
        }
        if (picked !== null && !latest.some(q => q.id === picked)) picked = null;
      },
      draw(v, s) { draw(v, s, latest || viewPieces(s), picked, queued); },
    });

    // Clicking and dragging: the game only hears about a finished move.
    const cv = document.getElementById('dlCanvas');
    const flip = !ctx.isHost; // (each player has their own pieces at the bottom)
    function cellAt(e) {
      const r = cv.getBoundingClientRect();
      const ax = (e.clientX - r.left) / (r.width || 1) * W, ay = (e.clientY - r.top) / (r.height || 1) * H;
      const x = Math.floor((ax - BX) / T), y = Math.floor((ay - BY) / T);
      if (x < 0 || y < 0 || x > 7 || y > 7) return null;
      return flip ? [7 - x, 7 - y] : [x, y];
    }
    function tryMove(id, x, y) {
      const p = latest && latest.find(q => q.id === id);
      if (!p) return false;
      if (p.mv || p.cd > 0) { // still recharging: do it when it's ready, if it can still go there then
        if (!legal(latest, burnNow, Object.assign({}, p, { mv: null, cd: 0, x: p.mv ? p.mv.tx : p.x, y: p.mv ? p.mv.ty : p.y }), x, y)) return false;
        queued = { id, x, y };
        return true;
      }
      if (!legal(latest, burnNow, p, x, y)) return false;
      order(id, x, y);
      return true;
    }
    ctx.listen(cv, 'pointerdown', e => {
      const at = cellAt(e);
      if (!at || !latest) return;
      const here = latest.find(q => !q.mv && Math.round(q.x) === at[0] && Math.round(q.y) === at[1]);
      if (picked !== null && !(here && here.c === meC) && tryMove(picked, at[0], at[1])) { picked = null; dragFrom = null; return; }
      if (here && here.c === meC) { picked = here.id; dragFrom = here.id; queued = null; }
      else { picked = null; dragFrom = null; }
    });
    ctx.listen(document, 'pointerup', e => {
      if (dragFrom === null) return;
      const id = dragFrom, at = cellAt(e);
      dragFrom = null;
      const p = latest && latest.find(q => q.id === id);
      if (!at || !p || (Math.round(p.x) === at[0] && Math.round(p.y) === at[1])) return; // (just a click)
      if (tryMove(id, at[0], at[1])) picked = null;
    });
    if (window.__testHooks) window.__panic = { order, legal: (id, x, y) => { const p = latest && latest.find(q => q.id === id); return !!p && legal(latest, burnNow, p, x, y); }, pieces: () => latest, meC };
  },
});

/* ---------- the rules ---------- */

function init() {
  const pcs = [];
  let id = 1;
  const add = (t, c, x, y) => pcs.push({ id: id++, t, c, x, y, mv: null, cd: 0 });
  for (let x = 0; x < 8; x++) {
    add(BACK[x], 1, x, 0);
    add('p', 1, x, 1);
    add('p', 0, x, 6);
    add(BACK[x], 0, x, 7);
  }
  return { t: 0, pcs, b: 0, took: [0, 0], warned: 0, over: false, moves: [0, 0] };
}

const onBoard = (x, y, burn) => x >= burn && y >= burn && x < 8 - burn && y < 8 - burn;

// Can piece p go to square (x, y) right now? pcs: all the pieces. A square a piece of yours is moving to counts as taken.
function legal(pcs, burn, p, x, y) {
  if (!p || p.mv || p.cd > 0) return false;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !onBoard(x, y, burn)) return false;
  const px = Math.round(p.x), py = Math.round(p.y), dx = x - px, dy = y - py, ax = Math.abs(dx), ay = Math.abs(dy);
  if (!dx && !dy) return false;
  const at = (cx, cy) => pcs.find(q => q !== p && q.id !== p.id && !q.mv && Math.round(q.x) === cx && Math.round(q.y) === cy);
  const there = at(x, y);
  if (there && there.c === p.c) return false;
  if (pcs.some(q => q.id !== p.id && q.c === p.c && q.mv && q.mv.tx === x && q.mv.ty === y)) return false;
  const pathClear = () => {
    const sx = Math.sign(dx), sy = Math.sign(dy);
    for (let cx = px + sx, cy = py + sy; cx !== x || cy !== y; cx += sx, cy += sy) if (at(cx, cy)) return false;
    return true;
  };
  switch (p.t) {
    case 'p': {
      const dir = p.c === 0 ? -1 : 1, home = p.c === 0 ? 6 : 1;
      if (dx === 0) {
        if (dy === dir) return !there;
        if (dy === 2 * dir && py === home) return !there && !at(px, py + dir);
        return false;
      }
      return ax === 1 && dy === dir && !!there;
    }
    case 'n': return (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
    case 'b': return ax === ay && pathClear();
    case 'r': return (!dx || !dy) && pathClear();
    case 'q': return (!dx || !dy || ax === ay) && pathClear();
    case 'k': return ax <= 1 && ay <= 1;
  }
  return false;
}

function startMove(s, p, x, y) {
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  const time = p.t === 'n' ? HOP : d / SLIDE;
  p.mv = { tx: x, ty: y, fx: Math.round(p.x), fy: Math.round(p.y), vx: dx / time, vy: dy / time, left: time, at: s.t, hop: p.t === 'n' ? 1 : 0, quiet: p.t === 'p' && dx === 0 ? 1 : 0, dur: time };
}

function arrive(s, p, api) {
  p.x = p.mv.tx;
  p.y = p.mv.ty;
  p.mv = null;
  const behind = material(s, p.c) + BEHIND <= material(s, 1 - p.c);
  p.cd = RECHARGE * (behind ? BOOST : 1);
  p.max = p.cd;
  if (p.t === 'p' && p.y === (p.c === 0 ? 0 : 7)) { p.t = 'q'; api.ev('queen', { x: p.x, y: p.y }); }
}

function material(s, c) { return s.pcs.reduce((a, p) => a + (p.c === c ? VALUE[p.t] : 0), 0); }

function capture(s, by, gone, api) {
  s.pcs = s.pcs.filter(q => q !== gone);
  s.took[by.c]++;
  api.ev('take', { x: gone.x, y: gone.y, c: by.c, t: gone.t });
  if (gone.t === 'k') finish(s, by.c, 'KING TAKEN!', api);
}

function finish(s, winner, text, api) {
  if (s.over) return;
  s.over = true;
  api.ev('rec', { took: s.took });
  api.end(winner, text);
}

function step(s, orders, dt, api) {
  if (s.over) return;
  s.t += dt;
  for (const o of orders) {
    const p = s.pcs.find(q => q.id === o.id);
    if (p && p.c === o.c && legal(s.pcs, s.b, p, o.x, o.y)) {
      startMove(s, p, o.x, o.y);
      s.moves[o.c]++;
      api.ev('move', { c: o.c });
    }
  }
  for (const p of s.pcs.slice()) {
    if (s.over || !s.pcs.includes(p)) continue;
    if (!p.mv) { p.cd = Math.max(0, p.cd - dt); continue; }
    p.mv.left -= dt;
    p.x += p.mv.vx * dt;
    p.y += p.mv.vy * dt;
    if (p.mv.left <= 0) {
      p.x = p.mv.tx;
      p.y = p.mv.ty;
      if (p.mv.hop) { // (a knight only lands)
        const under = s.pcs.find(q => q !== p && q.c !== p.c && Math.hypot(q.x - p.x, q.y - p.y) < 0.5);
        if (under) capture(s, p, under, api);
      }
      if (s.pcs.includes(p) && p.mv) arrive(s, p, api);
      continue;
    }
    if (p.mv.hop) continue;
    // bumping into something on the way
    const hit = s.pcs.find(q => q !== p && !(q.mv && q.mv.hop) && Math.hypot(q.x - p.x, q.y - p.y) < 0.55);
    if (!hit) continue;
    if (hit.c === p.c) { // your own piece is in the way: stop short
      p.mv.tx = clampRound(p.x - Math.sign(p.mv.vx) * 0.5);
      p.mv.ty = clampRound(p.y - Math.sign(p.mv.vy) * 0.5);
      arrive(s, p, api);
      continue;
    }
    // Two moving pieces: the one that moved later wins. A pawn walking forward can't take anything: it stops.
    const hitWins = hit.mv && hit.mv.at > p.mv.at && !hit.mv.quiet;
    if (hitWins) { capture(s, hit, p, api); continue; }
    if (p.mv.quiet) {
      p.mv.tx = clampRound(p.x - Math.sign(p.mv.vx) * 0.5);
      p.mv.ty = clampRound(p.y - Math.sign(p.mv.vy) * 0.5);
      arrive(s, p, api);
      continue;
    }
    p.mv.tx = clampRound(hit.mv ? p.x : hit.x); // (it stops where it took the piece)
    p.mv.ty = clampRound(hit.mv ? p.y : hit.y);
    capture(s, p, hit, api);
    if (s.pcs.includes(p) && p.mv) arrive(s, p, api);
  }
  if (s.over) return;
  // the board burns
  const next = BURN[s.b];
  if (next !== undefined && s.warned <= s.b && s.t >= next - WARN) { s.warned = s.b + 1; api.ev('warn', {}); }
  if (next !== undefined && s.t >= next) {
    s.b++;
    const dead = s.pcs.filter(p => !onBoard(Math.round(p.x), Math.round(p.y), s.b));
    const kings = dead.filter(p => p.t === 'k');
    s.pcs = s.pcs.filter(p => !dead.includes(p));
    api.ev('burn', { n: dead.length });
    if (kings.length) {
      if (kings.length === 2) { byPieces(s, 'BOTH KINGS BURNED!', api); return; }
      finish(s, 1 - kings[0].c, 'KING BURNED!', api);
      return;
    }
  }
  const a = material(s, 0), b = material(s, 1);
  api.score(a, b);
  if (s.t >= LENGTH) byPieces(s, "TIME'S UP!", api);
}

function byPieces(s, text, api) {
  const a = material(s, 0), b = material(s, 1);
  finish(s, a === b ? -1 : a > b ? 0 : 1, text, api);
}

const r2 = v => Math.round(v * 100) / 100;
function snap(s) {
  return {
    t: Math.round(s.t * 10) / 10, b: s.b,
    p: s.pcs.map(p => [p.id, 'pnbrqk'.indexOf(p.t), p.c, r2(p.x), r2(p.y), Math.round(p.cd * 10) / 10, p.mv ? p.mv.tx : -1, p.mv ? p.mv.ty : -1, p.mv && p.mv.hop ? 1 : 0, r2(p.max || RECHARGE)]),
  };
}
function lerp(a, b, f) {
  return Object.assign({}, b, {
    p: b.p.map((q, k) => {
      const o = a.p[k];
      if (!o || o[0] !== q[0]) return q;
      const r = q.slice();
      r[3] = o[3] + (q[3] - o[3]) * f;
      r[4] = o[4] + (q[4] - o[4]) * f;
      r[5] = o[5] + (q[5] - o[5]) * f;
      return r;
    }),
  });
}
function viewPieces(s) {
  return s.p.map(q => ({ id: q[0], t: 'pnbrqk'[q[1]], c: q[2], x: q[3], y: q[4], cd: q[5], mv: q[6] >= 0 ? { tx: q[6], ty: q[7], hop: q[8] } : null, max: q[9] }));
}

// The bot looks at the moves its ready pieces can make, and likes taking pieces (above all the king), not moving somewhere
// it can be taken, saving a king or queen that's under attack, and getting off a ring that's about to burn. Worse bots think
// more slowly and make more mistakes.
function bot(s, i, dt, api) {
  const st = s.bs || (s.bs = { think: 0.8 });
  st.think -= dt;
  if (st.think > 0) return {};
  st.think = (1.05 - 0.75 * api.skill) * (0.7 + Math.random() * 0.6);
  const mine = s.pcs.filter(p => p.c === i), theirs = s.pcs.filter(p => p.c !== i);
  const next = BURN[s.b], soon = next !== undefined && s.t >= next - WARN - 6;
  const threatened = (x, y, without) => theirs.some(o => {
    if (o === without) return false;
    const free = Object.assign({}, o, { cd: 0, mv: null });
    if (o.t === 'p') { const dir = o.c === 0 ? -1 : 1; return Math.abs(x - Math.round(o.x)) === 1 && y - Math.round(o.y) === dir; }
    return legal(s.pcs, s.b, free, x, y);
  });
  let best = null, bestScore = -1e9;
  for (const p of mine) {
    if (p.mv || p.cd > 0) continue;
    const px = Math.round(p.x), py = Math.round(p.y);
    const danger = threatened(px, py) ? VALUE[p.t] + (p.t === 'k' ? 50 : 0) : 0;
    const burning = soon && !onBoard(px, py, s.b + 1);
    for (let y = s.b; y < 8 - s.b; y++) {
      for (let x = s.b; x < 8 - s.b; x++) {
        if (!legal(s.pcs, s.b, p, x, y)) continue;
        const prey = theirs.find(o => !o.mv && Math.round(o.x) === x && Math.round(o.y) === y);
        let score = (Math.random() - 0.5) * (1 + (1 - api.skill) * 6);
        if (prey) score += prey.t === 'k' ? 1000 : VALUE[prey.t] * 4;
        score += danger * 1.5;
        if (threatened(x, y, prey) && api.skill > Math.random() * 0.7) score -= (p.t === 'k' ? 60 : VALUE[p.t] * 3);
        if (burning && onBoard(x, y, s.b + 1)) score += p.t === 'k' ? 40 : 6;
        if (soon && !onBoard(x, y, s.b + 1)) score -= p.t === 'k' ? 80 : 10;
        score += (3.5 - Math.abs(x - 3.5)) * 0.15 + (3.5 - Math.abs(y - 3.5)) * 0.15; // (towards the middle)
        if (p.t === 'k' && !burning) score -= 2; // (kings stay out of it)
        if (score > bestScore) { bestScore = score; best = { id: p.id, x, y }; }
      }
    }
  }
  return best ? { order: best } : {};
}

function event(v, e) {
  if (e.type === 'move') v.sound(e.c === v.me ? [[520, 0, 0.03]] : [[360, 0, 0.03]]);
  if (e.type === 'take') {
    const [x, y] = screen(v, e.x, e.y);
    v.burst(x, y, e.c === v.me ? '#ffd23f' : '#ff5a5a', e.t === 'k' ? 50 : 16, 280);
    v.pop(x, y - 20, e.c === v.me ? (e.t === 'k' ? '👑 KING!' : '+' + VALUE[e.t]) : (e.t === 'k' ? '💀 KING!' : '-' + VALUE[e.t]), e.c === v.me ? '#ffd23f' : '#ff9a9a');
    v.shake(e.t === 'k' ? 14 : 4);
    v.sound(e.c === v.me ? 'point' : 'miss');
  }
  if (e.type === 'queen') { const [x, y] = screen(v, e.x, e.y); v.pop(x, y - 20, '♛ Queen!', '#ffd23f'); v.sound('notify'); }
  if (e.type === 'warn') { v.note('🔥 The edge of the board is about to burn!'); v.sound('notify'); }
  if (e.type === 'burn') { v.note('🔥 The board burned' + (e.n ? ': ' + e.n + ' piece' + (e.n === 1 ? '' : 's') + ' gone' : '')); v.shake(10); v.sound('boom'); }
  if (e.type === 'rec') v.record('took', 'Most pieces taken in a game', e.took[v.me]);
}

/* ---------- drawing ---------- */

const screen = (v, x, y) => (v.me === 1 ? [BX + (7 - x + 0.5) * T, BY + (7 - y + 0.5) * T] : [BX + (x + 0.5) * T, BY + (y + 0.5) * T]);

function drawPiece(v, p, picked) {
  const g = v.g, [x, y] = screen(v, p.x, p.y), hop = p.mv && p.mv.hop;
  const ready = !p.mv && p.cd <= 0;
  if (p.c === v.me && !ready && !p.mv) { // recharging
    const k = 1 - Math.min(1, p.cd / (p.max || RECHARGE));
    g.strokeStyle = 'rgba(0, 0, 0, .25)';
    g.lineWidth = 4;
    g.beginPath(); g.arc(x, y, 25, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#ffd23f';
    g.beginPath(); g.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
  }
  if (p.id === picked) { g.fillStyle = 'rgba(255, 210, 63, .45)'; v.dot(x, y, 29); }
  if (p.c === v.me && ready) { g.strokeStyle = 'rgba(40, 200, 110, .9)'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.stroke(); }
  g.save();
  g.font = '900 ' + (hop ? 52 : 44) + 'px "Segoe UI Symbol", "Noto Sans Symbols2", "DejaVu Sans", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 4;
  g.globalAlpha = p.c === v.me && !ready && !p.mv ? 0.72 : 1;
  const text = GLYPH[p.t] + '︎';
  g.strokeStyle = p.c === 0 ? '#1d2233' : '#f4f1e6';
  g.strokeText(text, x, y + 2 - (hop ? 8 : 0));
  g.fillStyle = p.c === 0 ? '#ffffff' : '#141624';
  g.fillText(text, x, y + 2 - (hop ? 8 : 0));
  g.restore();
}

function draw(v, s, pcs, picked, queued) {
  const g = v.g;
  g.fillStyle = '#0f2f55';
  g.fillRect(0, 0, W, H);
  const next = BURN[s.b], warn = next !== undefined && s.t >= next - WARN;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const [cx, cy] = screen(v, x, y), left = cx - T / 2, top = cy - T / 2;
      if (!onBoard(x, y, s.b)) { // burned
        g.fillStyle = (x + y) % 2 ? '#2a1414' : '#351a12';
        g.fillRect(left, top, T, T);
        continue;
      }
      g.fillStyle = (x + y) % 2 ? '#5b8fc4' : '#d9e6f2';
      g.fillRect(left, top, T, T);
      if (warn && !onBoard(x, y, s.b + 1)) { g.fillStyle = 'rgba(255, 60, 20, ' + (0.3 + 0.3 * Math.abs(Math.sin(v.now / 130))) + ')'; g.fillRect(left, top, T, T); }
    }
  }
  // the picked piece's moves
  const sel = picked !== null ? pcs.find(p => p.id === picked) : null;
  if (sel) {
    const free = sel.mv || sel.cd > 0 ? Object.assign({}, sel, { mv: null, cd: 0, x: sel.mv ? sel.mv.tx : sel.x, y: sel.mv ? sel.mv.ty : sel.y }) : sel;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (!legal(pcs, s.b, free, x, y)) continue;
        const [cx, cy] = screen(v, x, y), prey = pcs.some(p => !p.mv && p.c !== sel.c && Math.round(p.x) === x && Math.round(p.y) === y);
        g.fillStyle = prey ? 'rgba(255, 70, 70, .55)' : 'rgba(40, 200, 120, .55)';
        v.dot(cx, cy, prey ? 26 : 11);
      }
    }
  }
  if (queued) { const [qx, qy] = screen(v, queued.x, queued.y); g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.setLineDash([6, 5]); g.beginPath(); g.arc(qx, qy, 24, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  // pieces on the move: a line shows where they're headed
  pcs.forEach(p => {
    if (!p.mv) return;
    const [ax, ay] = screen(v, p.x, p.y), [bx, by] = screen(v, p.mv.tx, p.mv.ty);
    g.strokeStyle = p.c === v.me ? 'rgba(125, 255, 138, .75)' : 'rgba(255, 70, 70, .85)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.fillStyle = g.strokeStyle;
    v.dot(bx, by, 7);
  });
  pcs.forEach(p => { if (!p.mv) drawPiece(v, p, picked); });
  pcs.forEach(p => { if (p.mv) drawPiece(v, p, picked); });
  // the sides of the screen: the clock, and the next burn
  const left = Math.max(0, LENGTH - s.t);
  v.label('⏱ ' + Math.ceil(left), BX / 2 + 10, H / 2 - 40, 28, '#ffffff');
  if (next !== undefined) {
    const to = Math.max(0, Math.ceil(next - s.t));
    v.label('🔥 Burns in', BX / 2 + 10, H / 2, 16, warn ? '#ff9a6a' : '#cfe0f2');
    v.label(to + 's', BX / 2 + 10, H / 2 + 28, warn ? 34 : 24, warn ? '#ff5a3a' : '#ffffff');
  } else v.label('🔥 Last stand!', BX / 2 + 10, H / 2, 16, '#ff9a6a');
  const count = c => pcs.filter(p => p.c === c).length;
  v.label(v.names[v.them] + ': ' + count(v.them) + ' ♟', W - BX / 2 - 10, H / 2 - 20, 15, '#ffffff');
  v.label('You: ' + count(v.me) + ' ♟', W - BX / 2 - 10, H / 2 + 10, 15, '#ffd23f');
  v.msg(warn ? '🔥 Get off the glowing squares!' : sel && (sel.mv || sel.cd > 0) ? 'It\'s recharging: pick where it goes next and it will move as soon as it can' : sel ? 'Now click where it should go' : 'Click one of your pieces (the ones at the bottom)', warn);
}

})();
