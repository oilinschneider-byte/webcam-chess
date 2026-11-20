/* Even more Duos games, 2 vs 2 (see duos.js and games-duos.js): Laser Pointer, Snake Sprint, Wall Duel, Pond War and
   Cheese Heist, remade for four cats at once. Seats 0 and 1 are the blue team, 2 and 3 the orange team. */
(() => {
'use strict';

const D = CA.duos;
const { W, H, teamOf, mateOf, clamp } = D;
const TAU = Math.PI * 2;
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function keyDir(n) {
  const x = (n.held.right ? 1 : 0) - (n.held.left ? 1 : 0), y = (n.held.down ? 1 : 0) - (n.held.up ? 1 : 0);
  const l = Math.hypot(x, y);
  return l ? [x / l, y / l] : [0, 0];
}
function toward(c, tx, ty, slack) {
  const dx = tx - c.x, dy = ty - c.y, held = {}, k = slack || 8;
  if (dx > k) held.right = true; else if (dx < -k) held.left = true;
  if (dy > k) held.down = true; else if (dy < -k) held.up = true;
  return held;
}
// Cats (circles of radius r) gently pushed apart when they overlap.
function softBump(cs, r) {
  for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
    const p = cs[a], q = cs[b];
    if (p.out || q.out) continue;
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    if (d >= r * 2 || d < 0.01) continue;
    const push = (r * 2 - d) / 2;
    p.x -= dx / d * push; p.y -= dy / d * push; q.x += dx / d * push; q.y += dy / d * push;
  }
}
function roundDots(v, wins, need) {
  for (let t = 0; t < 2; t++) for (let k = 0; k < need; k++) {
    v.g.fillStyle = k < wins[t] ? v.team[t].main : 'rgba(255,255,255,.2)';
    v.dot(W / 2 + (t ? 1 : -1) * (40 + k * 22), 22, 8);
  }
  v.label('VS', W / 2, 26, 13, '#ffffff');
}
// The two teams' scores at the top, with the time left in the middle.
function scores(v, sc, tm, fmt) {
  const g = v.g;
  g.fillStyle = 'rgba(0,0,0,.35)'; v.roundRect(W / 2 - 150, 6, 300, 36, 18); g.fill();
  v.label(fmt ? fmt(sc[0]) : String(sc[0]), W / 2 - 85, 24, 22, v.team[0].light);
  v.label(fmt ? fmt(sc[1]) : String(sc[1]), W / 2 + 85, 24, 22, v.team[1].light);
  v.label(tm + 's', W / 2, 24, 15, '#ffffff');
}
// How far (x, y) is from the line from (ax, ay) to (bx, by), and the nearest point on it.
function segNear(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
  const px = ax + dx * t, py = ay + dy * t;
  return { d: Math.hypot(x - px, y - py), x: px, y: py };
}
const allMood = (v, t, good, bad, secs) => [0, 1, 2, 3].forEach(i => v.mood(i, teamOf(i) === t ? good : bad, secs));

/* ================= LASER POINTER 2 vs 2 ================= */
// A red laser dot zips around the room, and your cat chases your mouse pointer (it can only speed up so fast, so
// nobody teleports). Every moment a cat of your team is on a dot, your team scores. It speeds up as it goes, and for
// the last 12 seconds it splits in two. 40 seconds, most time on the dots wins.
const LZ = { LEN: 40, SPEED: 560, ACC: 2100, HIT: 30, R: 20, SPLIT: 12 };
function lzDot(api, x, y) { return { x, y, vx: 0, vy: 0, tx: x, ty: y, wait: 0.4 }; }
function lzMove(s, d, dt, api) {
  if (d.wait > 0) { d.wait -= dt; d.vx = d.vy = 0; return; }
  const sp = Math.min(560, 210 + s.t * 8);
  const dx = d.tx - d.x, dy = d.ty - d.y, l = Math.hypot(dx, dy);
  if (l < 12) {
    const near = api.rng() < 0.3;
    d.tx = clamp(near ? d.x + (api.rng() - 0.5) * 200 : 60 + api.rng() * (W - 120), 60, W - 60);
    d.ty = clamp(near ? d.y + (api.rng() - 0.5) * 160 : 90 + api.rng() * (H - 140), 90, H - 50);
    if (api.rng() < 0.25) d.wait = 0.15 + api.rng() * 0.35;
    return;
  }
  d.vx = dx / l * sp; d.vy = dy / l * sp;
  d.x += d.vx * dt; d.y += d.vy * dt;
}
D.add('laser2', {
  name: 'Laser Pointer 2v2', icon: '🔴',
  how: 'Move the mouse: your cat chases it. Keep your team on the red dot! Most time on the dot wins.',
  init(api) {
    return { t: 0, sc: [0, 0], d: [lzDot(api, W / 2, H / 2 + 20)], c: [[200, 190], [200, 370], [760, 190], [760, 370]].map(([x, y], i) => ({ x, y, vx: 0, vy: 0, f: teamOf(i) ? -1 : 1, on: 0, pc: 0, bo: { x: 0, y: 0, t: 0 } })) };
  },
  step(s, ins, dt, api) {
    s.t += dt;
    s.c.forEach((c, i) => {
      const n = ins[i];
      let wx = (n.ax - c.x) * 9, wy = (n.ay - c.y) * 9;
      const l = Math.hypot(wx, wy);
      if (l > LZ.SPEED) { wx *= LZ.SPEED / l; wy *= LZ.SPEED / l; }
      const ax = wx - c.vx, ay = wy - c.vy, al = Math.hypot(ax, ay), m = LZ.ACC * dt;
      if (al > m) { c.vx += ax / al * m; c.vy += ay / al * m; } else { c.vx = wx; c.vy = wy; }
      c.x = clamp(c.x + c.vx * dt, 24, W - 24); c.y = clamp(c.y + c.vy * dt, 60, H - 24);
      if (Math.abs(c.vx) > 25) c.f = c.vx > 0 ? 1 : -1;
      c.pc = Math.max(0, c.pc - dt);
    });
    softBump(s.c, LZ.R);
    if (s.t >= LZ.LEN - LZ.SPLIT && s.d.length === 1) {
      const o = s.d[0], d2 = lzDot(api, o.x, o.y);
      d2.wait = 0; o.wait = 0;
      s.d.push(d2);
      api.ev('split', { x: r1(o.x), y: r1(o.y) });
    }
    s.d.forEach(d => lzMove(s, d, dt, api));
    const on = [false, false];
    s.c.forEach((c, i) => {
      const was = c.on;
      c.on = s.d.some(d => Math.hypot(d.x - c.x, d.y - c.y) < LZ.HIT) ? 1 : 0;
      if (c.on) on[teamOf(i)] = true;
      if (c.on && !was && c.pc <= 0) { c.pc = 0.8; api.ev('pounce', { seat: i }); }
    });
    for (let t = 0; t < 2; t++) if (on[t]) s.sc[t] += dt;
    if (s.t >= LZ.LEN) {
      const a = r1(s.sc[0]), b = r1(s.sc[1]);
      api.over(a === b ? -1 : a > b ? 0 : 1, 'Most time on the dot');
    }
  },
  snap: s => ({ c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, on: c.on })), d: s.d.map(d => [r1(d.x), r1(d.y)]), sc: s.sc.map(r1), tm: Math.max(0, Math.ceil(LZ.LEN - s.t)) }),
  bot(s, i, dt, api) {
    const c = s.c[i];
    // with two dots, teammates split up: take the dot your teammate isn't closer to
    let d = s.d[0];
    if (s.d.length > 1) {
      const m = s.c[mateOf(i)];
      const mine = s.d.map(o => Math.hypot(o.x - c.x, o.y - c.y)), mates = s.d.map(o => Math.hypot(o.x - m.x, o.y - m.y));
      const k = mine[0] + mates[1] < mine[1] + mates[0] ? 0 : 1;
      d = s.d[k];
    }
    c.bo.t -= dt;
    if (c.bo.t <= 0) { c.bo.t = 0.3 + Math.random() * 0.5; const e = (1 - api.skill) * 110 + 14; c.bo.x = (Math.random() - 0.5) * e; c.bo.y = (Math.random() - 0.5) * e; }
    return { held: {}, hit: {}, ax: d.x + d.vx * 0.16 + c.bo.x, ay: d.y + d.vy * 0.16 + c.bo.y };
  },
  draw(v, s) {
    const g = v.g;
    g.fillStyle = '#5b3f5f'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 60) { g.fillStyle = (x / 60) % 2 ? '#664869' : '#5b3f5f'; g.fillRect(x, 0, 60, H); }
    g.fillStyle = '#e8b86b'; g.beginPath(); g.ellipse(W / 2, H / 2 + 20, 400, 215, 0, 0, TAU); g.fill();
    g.strokeStyle = '#c98f3e'; g.lineWidth = 10; g.beginPath(); g.ellipse(W / 2, H / 2 + 20, 380, 198, 0, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(201,143,62,.5)'; g.lineWidth = 4; g.beginPath(); g.ellipse(W / 2, H / 2 + 20, 300, 150, 0, 0, TAU); g.stroke();
    for (const [x, y] of s.d) {
      const pulse = 1 + Math.sin(v.now / 70) * 0.12;
      const gr = g.createRadialGradient(x, y, 0, x, y, 34 * pulse);
      gr.addColorStop(0, 'rgba(255,40,40,.75)'); gr.addColorStop(1, 'rgba(255,40,40,0)');
      g.fillStyle = gr; v.dot(x, y, 34 * pulse);
      g.fillStyle = '#ff2a2a'; v.dot(x, y, 8);
      g.fillStyle = '#ffd0d0'; v.dot(x - 2, y - 2, 3);
    }
    s.c.forEach((c, i) => v.catTop(i, c.x, c.y, 1, { lookRight: c.f > 0, face: c.on ? 'happy' : null }));
    scores(v, s.sc, s.tm, n => n.toFixed(1) + 's');
  },
  event(v, e) {
    if (e.type === 'split') { v.pop(e.x, e.y - 30, 'Two dots!', '#ff6b6b'); v.ring(e.x, e.y, '#ff2a2a', 20); v.sound('whoosh'); }
    if (e.type === 'pounce') { v.mood(e.seat, 'happy', 0.8); if (e.seat === v.me) v.sound([[880, 0, 0.03]]); }
  },
});

/* ================= SNAKE SPRINT 2 vs 2 ================= */
// Four snakes on one board, a cat's head on each. WASD or the arrows turn. Every apple you eat scores for your team
// (a star is worth 3) and makes you longer. Crash into a wall or any snake and you start small again (and blink for a
// moment, when you can pass through everything). 60 seconds, most apples wins.
const SN = { CELL: 24, COLS: 40, ROWS: 21, TOP: 36, TICK: 0.11, LEN: 60, APPLES: 5 };
const SN_START = [[5, 5, 0], [5, 15, 0], [34, 5, 2], [34, 15, 2]];
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const DIR_KEYS = ['right', 'down', 'left', 'up'];
function snReset(c, i) {
  const [x, y, d] = SN_START[i];
  c.b = [];
  for (let k = 0; k < 3; k++) c.b.push([x - DIRS[d][0] * k, y - DIRS[d][1] * k]);
  c.d = d; c.q = []; c.grow = 0; c.dead = 0; c.ghost = 1.5;
}
function snApple(s, api) {
  for (let tries = 0; tries < 300; tries++) {
    const x = Math.floor(api.rng() * SN.COLS), y = Math.floor(api.rng() * SN.ROWS);
    if (s.ap.some(a => a.x === x && a.y === y)) continue;
    if (s.c.some(c => !c.dead && c.b.some(p => p[0] === x && p[1] === y))) continue;
    s.ap.push({ x, y, v: api.rng() < 0.12 ? 3 : 1 });
    return;
  }
}
const snPx = (x, y) => [x * SN.CELL + SN.CELL / 2, SN.TOP + y * SN.CELL + SN.CELL / 2];
function snTick(s, api) {
  s.n++;
  s.c.forEach(c => {
    if (c.dead) return;
    while (c.q.length) { const nd = c.q.shift(); if (nd !== c.d && (nd + 2) % 4 !== c.d) { c.d = nd; break; } }
  });
  const heads = s.c.map(c => (c.dead ? null : [c.b[0][0] + DIRS[c.d][0], c.b[0][1] + DIRS[c.d][1]]));
  const crash = new Set();
  s.c.forEach((c, i) => {
    const h = heads[i];
    if (!h) return;
    if (h[0] < 0 || h[1] < 0 || h[0] >= SN.COLS || h[1] >= SN.ROWS) { crash.add(i); return; }
    if (c.ghost > 0) return;
    s.c.forEach((o, j) => {
      if (o.dead || (j !== i && o.ghost > 0)) return;
      const n = o.grow > 0 ? o.b.length : o.b.length - 1;
      for (let k = 0; k < n; k++) if (o.b[k][0] === h[0] && o.b[k][1] === h[1]) { crash.add(i); return; }
      if (j !== i && heads[j] && heads[j][0] === h[0] && heads[j][1] === h[1]) crash.add(i);
    });
  });
  s.c.forEach((c, i) => {
    const h = heads[i];
    if (!h) return;
    if (crash.has(i)) {
      const [x, y] = snPx(clamp(h[0], 0, SN.COLS - 1), clamp(h[1], 0, SN.ROWS - 1));
      c.dead = 1.1; c.b = [];
      api.ev('crash', { seat: i, x, y });
      return;
    }
    c.b.unshift(h);
    const k = s.ap.findIndex(a => a.x === h[0] && a.y === h[1]);
    if (k >= 0) {
      const a = s.ap[k];
      c.grow += a.v; s.sc[teamOf(i)] += a.v;
      s.ap.splice(k, 1);
      const [x, y] = snPx(h[0], h[1]);
      api.ev('eat', { seat: i, x, y, v: a.v });
      snApple(s, api);
    }
    if (c.grow > 0) c.grow--; else c.b.pop();
  });
}
// How many cells a snake could still reach from (x, y) (up to cap), not counting the blocked ones.
function snRoom(blocked, x, y, cap) {
  const seen = new Set([x + ',' + y]), q = [[x, y]];
  let n = 0;
  while (q.length && n < cap) {
    const [cx, cy] = q.shift(); n++;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx >= SN.COLS || ny >= SN.ROWS || seen.has(k) || blocked.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return n;
}
D.add('snake2', {
  name: 'Snake Sprint 2v2', icon: '🐍',
  how: 'WASD or arrows to turn. Eat apples (⭐ = 3) for your team, and don\'t crash! Most apples wins.',
  init(api) {
    const s = { t: 0, acc: 0, n: 0, sc: [0, 0], ap: [], c: [0, 1, 2, 3].map(i => { const c = {}; snReset(c, i); return c; }) };
    for (let k = 0; k < SN.APPLES; k++) snApple(s, api);
    return s;
  },
  step(s, ins, dt, api) {
    s.t += dt;
    s.c.forEach((c, i) => {
      if (c.dead > 0) { c.dead -= dt; if (c.dead <= 0) { snReset(c, i); api.ev('back', { seat: i }); } return; }
      c.ghost = Math.max(0, c.ghost - dt);
      DIR_KEYS.forEach((k, d) => { if (ins[i].hit[k] && c.q.length < 3) c.q.push(d); });
    });
    s.acc += dt;
    while (s.acc >= SN.TICK) { s.acc -= SN.TICK; snTick(s, api); }
    if (s.t >= SN.LEN) api.over(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, 'Most apples eaten');
  },
  snap: s => ({
    c: s.c.map(c => { const p = c.b.length ? snPx(c.b[0][0], c.b[0][1]) : [-99, -99]; return { x: p[0], y: p[1] }; }),
    sn: s.c.map(c => ({ b: c.dead ? [] : c.b.flat(), d: c.d, g: c.ghost > 0 ? 1 : 0 })),
    ap: s.ap.map(a => [a.x, a.y, a.v]), sc: s.sc.slice(), tm: Math.max(0, Math.ceil(SN.LEN - s.t)),
  }),
  bot(s, i, dt, api) {
    const c = s.c[i], out = { held: {}, hit: {}, ax: 0, ay: 0 };
    if (c.dead || c.q.length || c.bn === s.n) return out;
    c.bn = s.n;
    const blocked = new Set();
    s.c.forEach((o, j) => { if (!o.dead && (j === i || (o.ghost <= 0 && c.ghost <= 0))) o.b.forEach((p, k) => { if (k < o.b.length - 1) blocked.add(p[0] + ',' + p[1]); }); });
    // (the cells right in front of the other snakes' heads are risky too)
    s.c.forEach((o, j) => { if (j !== i && !o.dead && o.ghost <= 0 && c.ghost <= 0) blocked.add((o.b[0][0] + DIRS[o.d][0]) + ',' + (o.b[0][1] + DIRS[o.d][1])); });
    const h = c.b[0];
    let best = null, bestV = -1e9;
    for (const d of [c.d, (c.d + 1) % 4, (c.d + 3) % 4]) {
      const x = h[0] + DIRS[d][0], y = h[1] + DIRS[d][1];
      if (x < 0 || y < 0 || x >= SN.COLS || y >= SN.ROWS || blocked.has(x + ',' + y)) continue;
      const room = snRoom(blocked, x, y, 80);
      let near = 99;
      for (const a of s.ap) near = Math.min(near, (Math.abs(a.x - x) + Math.abs(a.y - y)) / (a.v > 1 ? 1.6 : 1));
      const val = -near + Math.min(room, 40) * 0.6 - (room < c.b.length + 6 ? 60 : 0) + (d === c.d ? 0.3 : 0) + Math.random() * (1 - api.skill) * 6;
      if (val > bestV) { bestV = val; best = d; }
    }
    if (best != null && best !== c.d) out.hit[DIR_KEYS[best]] = true;
    return out;
  },
  draw(v, s) {
    const g = v.g, C = SN.CELL;
    g.fillStyle = '#1f3a2a'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < SN.ROWS; y++) for (let x = 0; x < SN.COLS; x++) { g.fillStyle = (x + y) % 2 ? '#8fd16a' : '#82c75e'; g.fillRect(x * C, SN.TOP + y * C, C, C); }
    for (const [x, y, val] of s.ap) { const [px, py] = snPx(x, y); v.label(val > 1 ? '⭐' : '🍎', px, py + 1, 20, '#ff3b3b'); }
    s.sn.forEach((sn, i) => {
      if (!sn.b.length) return;
      const col = v.team[teamOf(i)], fur = v.fur(i);
      g.globalAlpha = sn.g && Math.floor(v.now / 100) % 2 ? 0.4 : 1;
      for (let k = sn.b.length / 2 - 1; k >= 1; k--) {
        const [px, py] = snPx(sn.b[k * 2], sn.b[k * 2 + 1]);
        g.fillStyle = k % 2 ? col.main : fur.mid;
        v.dot(px, py, 10.5 - Math.min(4, k * 0.12));
        if (i === v.me) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, 10.5 - Math.min(4, k * 0.12), 0, TAU); g.stroke(); }
      }
      g.globalAlpha = 1;
      const [hx, hy] = snPx(sn.b[0], sn.b[1]);
      v.catTop(i, hx, hy, 0.78, { lookRight: sn.d !== 2, alpha: sn.g && Math.floor(v.now / 100) % 2 ? 0.45 : 1, label: false });
      if (i === v.me) v.label('You', hx, hy - 22, 12, '#ffd23f');
    });
    scores(v, s.sc, s.tm);
  },
  event(v, e) {
    if (e.type === 'eat') { v.pop(e.x, e.y - 14, '+' + e.v, e.v > 1 ? '#ffd23f' : '#ffffff'); v.sound(e.v > 1 ? 'coin' : 'pop'); v.mood(e.seat, 'happy', 0.8); }
    if (e.type === 'crash') { v.burst(e.x, e.y, v.team[teamOf(e.seat)].main, 18, 260); v.shake(5); v.sound('thud'); v.mood(e.seat, 'ko', 1.6); }
  },
});

/* ================= WALL DUEL 2 vs 2 ================= */
// A top-down shootout. WASD moves, the mouse aims and clicking shoots. Space drops a dot where you stand, and it joins
// up with your team's nearest dots by walls in your color: your team walks and shoots through them, but the other
// team's bullets stop at them, and touching the other team's walls hurts. So does staying outside the safe zone (a
// circle that slowly shrinks). Everyone has a shield that takes the first hit; the second is a K.O. Each piece of wall
// is shielded for 2 seconds, then open for 1: a bullet breaks an open dot (and its walls) at once, an open wall in two.
// Last team standing wins the round; first to 2 rounds.
const WL = { R: 16, SPEED: 230, BUL: 700, FIRE_CD: 0.34, DROP_CD: 0.7, MAXDOTS: 9, LINK: 230, LEN: 70, WIN: 2, CX: 480, CY: 292, TOP: 46 };
const wlOpen = (s, t0) => ((s.t - t0) % 3) >= 2;
function wlRound(s) {
  s.t = 0; s.pause = 0; s.dots = []; s.walls = []; s.bul = []; s.zr = 560;
  s.c = [[110, 190], [110, 400], [850, 190], [850, 400]].map(([x, y], i) => ({ x, y, vx: 0, vy: 0, f: teamOf(i) ? -1 : 1, aim: teamOf(i) ? Math.PI : 0, sh: 1, out: false, inv: 1, fcd: 0.6, dcd: 0, zone: 0, bt: 0, bs: 1, bo: { x: 0, y: 0, t: 0 } }));
}
function wlDropDot(s, team) {
  const mine = s.dots.filter(d => d.team === team);
  if (mine.length <= WL.MAXDOTS) return;
  wlRemoveDot(s, mine[0]);
}
function wlRemoveDot(s, d) {
  s.dots = s.dots.filter(o => o !== d);
  s.walls = s.walls.filter(w => w.a !== d && w.b !== d);
}
function wlHurt(s, i, api, kx, ky) {
  const c = s.c[i];
  if (c.out || c.inv > 0) return;
  const l = Math.hypot(kx, ky) || 1;
  c.vx += kx / l * 320; c.vy += ky / l * 320;
  if (c.sh) { c.sh = 0; c.inv = 1.1; api.ev('shield', { seat: i, x: r1(c.x), y: r1(c.y) }); }
  else { c.out = true; api.ev('ko', { seat: i, x: r1(c.x), y: r1(c.y) }); }
}
D.add('walls2', {
  name: 'Wall Duel 2v2', icon: '🧱',
  how: 'WASD move, mouse aims, click shoots. Space drops a wall dot. Shield takes 1 hit, 2nd is a K.O.!',
  init() { const s = { wins: [0, 0], round: 1 }; wlRound(s); return s; },
  step(s, ins, dt, api) {
    if (s.pause > 0) { s.pause -= dt; if (s.pause <= 0) { if (Math.max(...s.wins) >= WL.WIN) api.over(s.wins[0] > s.wins[1] ? 0 : 1, 'First to ' + WL.WIN + ' rounds'); else { s.round++; wlRound(s); } } return; }
    s.t += dt;
    if (s.t > 10) s.zr = Math.max(120, s.zr - 6.5 * dt);
    s.c.forEach((c, i) => {
      if (c.out) return;
      const n = ins[i], team = teamOf(i);
      c.inv = Math.max(0, c.inv - dt); c.fcd = Math.max(0, c.fcd - dt); c.dcd = Math.max(0, c.dcd - dt);
      const dir = keyDir(n), k = Math.min(1, 12 * dt);
      c.vx += (dir[0] * WL.SPEED - c.vx) * k; c.vy += (dir[1] * WL.SPEED - c.vy) * k;
      c.x = clamp(c.x + c.vx * dt, WL.R, W - WL.R); c.y = clamp(c.y + c.vy * dt, WL.TOP + WL.R, H - WL.R);
      c.aim = Math.atan2(n.ay - c.y, n.ax - c.x);
      c.f = Math.cos(c.aim) >= 0 ? 1 : -1;
      if ((n.hit.fire || n.held.fire) && c.fcd <= 0) {
        const ca = Math.cos(c.aim), sa = Math.sin(c.aim);
        s.bul.push({ x: c.x + ca * 22, y: c.y + sa * 22, vx: ca * WL.BUL, vy: sa * WL.BUL, team, life: 1.1 });
        c.fcd = WL.FIRE_CD;
        api.ev('shot', { seat: i });
      }
      if (n.hit.a && c.dcd <= 0) {
        const d = { team, x: c.x, y: c.y, t0: s.t };
        s.dots.filter(o => o.team === team && Math.hypot(o.x - d.x, o.y - d.y) < WL.LINK && Math.hypot(o.x - d.x, o.y - d.y) > 20)
          .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y)).slice(0, 2)
          .forEach(o => s.walls.push({ a: o, b: d, team, hp: 2, t0: s.t }));
        s.dots.push(d);
        wlDropDot(s, team);
        c.dcd = WL.DROP_CD;
        api.ev('drop', { x: r1(d.x), y: r1(d.y), team });
      }
    });
    softBump(s.c, WL.R);
    // bullets
    for (let k = s.bul.length - 1; k >= 0; k--) {
      const b = s.bul[k];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let gone = b.life <= 0 || b.x < 0 || b.x > W || b.y < WL.TOP || b.y > H;
      if (!gone) {
        const j = s.c.findIndex((c, jj) => !c.out && teamOf(jj) !== b.team && Math.hypot(c.x - b.x, c.y - b.y) < WL.R + 4);
        if (j >= 0) { wlHurt(s, j, api, b.vx, b.vy); gone = true; }
      }
      if (!gone) {
        const d = s.dots.find(o => o.team !== b.team && Math.hypot(o.x - b.x, o.y - b.y) < 10);
        if (d) {
          gone = true;
          if (wlOpen(s, d.t0)) { wlRemoveDot(s, d); api.ev('break', { x: r1(d.x), y: r1(d.y), team: d.team }); }
          else api.ev('ting', { x: r1(b.x), y: r1(b.y) });
        }
      }
      if (!gone) {
        const w = s.walls.find(o => o.team !== b.team && segNear(b.x, b.y, o.a.x, o.a.y, o.b.x, o.b.y).d < 6);
        if (w) {
          gone = true;
          if (wlOpen(s, w.t0)) { w.hp--; api.ev(w.hp <= 0 ? 'break' : 'crack', { x: r1(b.x), y: r1(b.y), team: w.team }); if (w.hp <= 0) s.walls = s.walls.filter(o => o !== w); }
          else api.ev('ting', { x: r1(b.x), y: r1(b.y) });
        }
      }
      if (gone) s.bul.splice(k, 1);
    }
    // touching the other team's walls, and the safe zone
    s.c.forEach((c, i) => {
      if (c.out) return;
      const team = teamOf(i);
      if (c.inv <= 0) {
        for (const d of s.dots) if (d.team !== team && Math.hypot(d.x - c.x, d.y - c.y) < WL.R + 8) { wlHurt(s, i, api, c.x - d.x, c.y - d.y); break; }
      }
      if (c.inv <= 0 && !c.out) {
        for (const w of s.walls) { if (w.team === team) continue; const p = segNear(c.x, c.y, w.a.x, w.a.y, w.b.x, w.b.y); if (p.d < WL.R + 4) { wlHurt(s, i, api, c.x - p.x, c.y - p.y); break; } }
      }
      if (Math.hypot(c.x - WL.CX, c.y - WL.CY) > s.zr) { c.zone += dt; if (c.zone > 1.6) { c.zone = 0; wlHurt(s, i, api, WL.CX - c.x, WL.CY - c.y); } }
      else c.zone = Math.max(0, c.zone - dt);
    });
    const left = [0, 1].map(t => s.c.filter((c, i) => teamOf(i) === t && !c.out).length);
    let w = null;
    if (!left[0] && !left[1]) w = -1; else if (!left[0]) w = 1; else if (!left[1]) w = 0;
    if (w === null && s.t > WL.LEN) {
      const hp = [0, 1].map(t => s.c.reduce((n, c, i) => n + (teamOf(i) === t && !c.out ? 1 + c.sh : 0), 0));
      w = hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1;
    }
    if (w !== null) { if (w >= 0) s.wins[w]++; s.pause = 1.8; s.bul = []; api.ev('round', { w }); }
  },
  snap: s => ({
    c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, a: r2(c.aim), sh: c.sh, o: c.out ? 1 : 0, iv: c.inv > 0 ? 1 : 0, z: c.zone > 0.2 ? 1 : 0 })),
    dt: s.dots.map(d => [r1(d.x), r1(d.y), d.team, wlOpen(s, d.t0) ? 1 : 0]),
    wl: s.walls.map(w => [r1(w.a.x), r1(w.a.y), r1(w.b.x), r1(w.b.y), w.team, wlOpen(s, w.t0) ? 1 : 0, w.hp]),
    bl: s.bul.map(b => [r1(b.x), r1(b.y), b.team]),
    zr: r1(s.zr), w: s.wins, tm: Math.max(0, Math.ceil(WL.LEN - s.t)), pz: s.pause > 0 ? 1 : 0,
  }),
  bot(s, i, dt, api) {
    const c = s.c[i], out = { held: {}, hit: {}, ax: c.x + c.f * 60, ay: c.y };
    if (c.out || s.pause > 0) return out;
    const team = teamOf(i), foes = s.c.filter((o, j) => !o.out && teamOf(j) !== team);
    if (!foes.length) return out;
    const e = foes.reduce((a, b) => (dist(a, c) < dist(b, c) ? a : b));
    c.bt -= dt;
    if (c.bt <= 0) { c.bt = 1 + Math.random() * 2; c.bs = Math.random() < 0.5 ? 1 : -1; }
    const ang = Math.atan2(c.y - e.y, c.x - e.x), want = 240;
    let tx = e.x + Math.cos(ang) * want + Math.cos(ang + Math.PI / 2) * c.bs * 90;
    let ty = e.y + Math.sin(ang) * want + Math.sin(ang + Math.PI / 2) * c.bs * 90;
    if (Math.hypot(tx - WL.CX, ty - WL.CY) > s.zr - 50) { const a2 = Math.atan2(ty - WL.CY, tx - WL.CX), rr = Math.max(0, s.zr - 70); tx = WL.CX + Math.cos(a2) * rr; ty = WL.CY + Math.sin(a2) * rr; }
    // keep away from the other team's walls
    for (const w of s.walls) {
      if (w.team === team) continue;
      const p = segNear(c.x, c.y, w.a.x, w.a.y, w.b.x, w.b.y);
      if (p.d < 60) { tx = c.x + (c.x - p.x) * 4; ty = c.y + (c.y - p.y) * 4; break; }
    }
    for (const d of s.dots) if (d.team !== team && Math.hypot(d.x - c.x, d.y - c.y) < 55) { tx = c.x + (c.x - d.x) * 4; ty = c.y + (c.y - d.y) * 4; break; }
    out.held = toward(c, clamp(tx, 30, W - 30), clamp(ty, WL.TOP + 30, H - 30), 12);
    c.bo.t -= dt;
    if (c.bo.t <= 0) { c.bo.t = 0.4; const er = (1 - api.skill) * 70 + 8; c.bo.x = (Math.random() - 0.5) * er; c.bo.y = (Math.random() - 0.5) * er; }
    const tt = dist(c, e) / WL.BUL;
    out.ax = e.x + e.vx * tt + c.bo.x; out.ay = e.y + e.vy * tt + c.bo.y;
    if (c.fcd <= 0 && Math.random() < dt * (1.8 + api.skill * 3)) out.hit.fire = true;
    if (c.dcd <= 0 && Math.random() < dt * 0.6) out.hit.a = true;
    return out;
  },
  draw(v, s) {
    const g = v.g;
    g.fillStyle = '#1c2130'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 48) for (let y = WL.TOP; y < H; y += 48) { g.fillStyle = ((x + y) / 48) % 2 ? '#22293b' : '#1f2536'; g.fillRect(x, y, 48, 48); }
    // the safe zone
    g.fillStyle = 'rgba(255,60,80,.2)';
    g.beginPath(); g.rect(0, WL.TOP, W, H - WL.TOP); g.arc(WL.CX, WL.CY, s.zr, 0, TAU, true); g.fill();
    g.strokeStyle = 'rgba(255,120,140,.8)'; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.arc(WL.CX, WL.CY, s.zr, 0, TAU); g.stroke(); g.setLineDash([]);
    g.lineCap = 'round';
    for (const [ax, ay, bx, by, t, open, hp] of s.wl) {
      g.globalAlpha = open ? 0.45 : 1;
      g.strokeStyle = v.team[t].dark; g.lineWidth = 11; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.strokeStyle = hp < 2 ? v.team[t].light : v.team[t].main; g.lineWidth = 6; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      if (!open) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
      g.globalAlpha = 1;
    }
    for (const [x, y, t, open] of s.dt) {
      g.fillStyle = v.team[t].dark; v.dot(x, y, 10);
      g.fillStyle = open ? v.team[t].light : v.team[t].main; v.dot(x, y, 7);
      if (!open) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 12, 0, TAU); g.stroke(); }
    }
    for (const [x, y, t] of s.bl) { g.fillStyle = v.team[t].light; v.dot(x, y, 5); g.fillStyle = '#ffffff'; v.dot(x, y, 2.5); }
    s.c.forEach((c, i) => {
      if (c.o) { v.catTop(i, c.x, c.y, 0.9, { face: 'ko', alpha: 0.35, label: false }); return; }
      const col = v.team[teamOf(i)];
      g.strokeStyle = col.dark; g.lineWidth = 7;
      g.beginPath(); g.moveTo(c.x + Math.cos(c.a) * 12, c.y + Math.sin(c.a) * 12); g.lineTo(c.x + Math.cos(c.a) * 30, c.y + Math.sin(c.a) * 30); g.stroke();
      v.catTop(i, c.x, c.y, 0.9, { lookRight: c.f > 0, alpha: c.iv && Math.floor(v.now / 90) % 2 ? 0.45 : 1, face: c.z ? 'hurt' : null });
      if (c.sh) { g.strokeStyle = 'rgba(160,230,255,' + (0.55 + Math.sin(v.now / 200) * 0.2) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, 25, 0, TAU); g.stroke(); }
    });
    g.lineCap = 'butt';
    roundDots(v, s.w, WL.WIN);
    v.label(s.tm + 's', W / 2, 42, 12, 'rgba(255,255,255,.7)');
  },
  event(v, e) {
    if (e.type === 'shot') { if (e.seat === v.me) v.sound([[620, 0, 0.03]]); }
    if (e.type === 'drop') v.sound([[300, 0, 0.05]]);
    if (e.type === 'shield') { v.ring(e.x, e.y, '#a0e6ff', 26); v.pop(e.x, e.y - 34, 'Shield broke!', '#a0e6ff'); v.sound('thud'); v.mood(e.seat, 'shock', 1.2); v.shake(4); }
    if (e.type === 'ko') { v.burst(e.x, e.y, '#ffffff', 22, 300); v.pop(e.x, e.y - 34, 'K.O.!', '#ff5a5a'); v.sound('boom'); v.mood(e.seat, 'ko', 99); v.shake(9); }
    if (e.type === 'break') { v.burst(e.x, e.y, v.team[e.team].main, 14, 220); v.sound('pop'); }
    if (e.type === 'crack') { v.burst(e.x, e.y, v.team[e.team].light, 6, 140); }
    if (e.type === 'ting') { v.ring(e.x, e.y, '#ffffff', 6); }
    if (e.type === 'round') { if (e.w >= 0) allMood(v, e.w, 'happy', 'sad', 1.6); v.sound(e.w < 0 ? 'draw' : e.w === teamOf(v.me) ? 'correct' : 'miss'); }
  },
});

/* ================= POND WAR 2 vs 2 ================= */
// Blue fishes from the left bank, orange from the right (W and S walk along it). Aim, click to cast near a fish, and
// when your bobber dips, click to hook it. Then REEL: mash Space, and every press pulls the fish in a bit; stop and it
// slips back (if it slips all the way, the line snaps). Now and then a letter pops up: press that key, quick! Right,
// and it's a big pull; wrong or too late, and the fish takes line back. Cast onto a fish the other team is reeling
// and it's a tug of war. E throws a rock where you aim: it scares fish away, ruins a waiting cast, and jolts a line.
// Fish are worth 1, big ones 2, and 15 seconds before the end a golden one (5) appears. Most points after 80 seconds.
const PD = { CX: 480, CY: 295, RX: 330, RY: 200, LEN: 80, FISH: 8, CAST_T: 0.45, LETTERS: 'FGHJKLRTUY' };
const PD_KEYS = {}; PD.LETTERS.split('').forEach(l => { PD_KEYS['Key' + l] = 'k' + l; });
PD_KEYS.KeyE = 'e';
function pdInside(x, y, k) {
  const dx = (x - PD.CX) / PD.RX, dy = (y - PD.CY) / PD.RY, l = Math.hypot(dx, dy), m = k || 0.9;
  return l > m ? [PD.CX + dx / l * m * PD.RX, PD.CY + dy / l * m * PD.RY] : [x, y];
}
function pdSpot(api) { const a = api.rng() * TAU, r = Math.sqrt(api.rng()) * 0.8; return [PD.CX + Math.cos(a) * r * PD.RX, PD.CY + Math.sin(a) * r * PD.RY]; }
function pdFish(s, api, gold) {
  const [x, y] = pdSpot(api), big = !gold && api.rng() < 0.35;
  const f = { id: s.nid++, x, y, tx: x, ty: y, a: 0, sp: gold ? 120 : big ? 55 : 75, big, gold: !!gold, v: gold ? 5 : big ? 2 : 1, w: gold ? 1.6 : big ? 1.35 : 1, st: 'swim', hk: [], pull: {}, lure: -1, biteT: 0, flee: 0, hx: 0, hy: 0 };
  s.fish.push(f);
  return f;
}
function pdLetGo(s, f, i) {
  f.hk = f.hk.filter(k => k !== i);
  delete f.pull[i];
  if (!f.hk.length) { f.st = 'flee'; f.flee = 1.2; }
}
function pdScare(s, f, x, y, api) {
  f.st = 'flee'; f.flee = 1.3; f.lure = -1;
  const a = Math.atan2(f.y - y, f.x - x);
  [f.tx, f.ty] = pdInside(f.x + Math.cos(a) * 200, f.y + Math.sin(a) * 200, 0.85);
}
D.add('pond2', {
  name: 'Pond War 2v2', icon: '🎣',
  how: 'Click to cast, click when it dips, mash Space to reel, press the letters! E throws a rock.',
  keys: PD_KEYS,
  init(api) {
    const s = { t: 0, sc: [0, 0], nid: 1, fish: [], rocks: [], gold: false, c: [[78, 200], [78, 390], [882, 200], [882, 390]].map(([x, y]) => ({ x, y, st: 'idle', t: 0, bx: 0, by: 0, fish: -1, pr: '', prT: 0, pn: 1.5, rk: 0, sx: 0, sy: 0 })) };
    for (let k = 0; k < PD.FISH; k++) pdFish(s, api);
    return s;
  },
  step(s, ins, dt, api) {
    s.t += dt;
    if (!s.gold && s.t >= PD.LEN - 15) { s.gold = true; const f = pdFish(s, api, true); api.ev('gold', { x: r1(f.x), y: r1(f.y) }); }
    const fishById = id => s.fish.find(f => f.id === id);
    s.c.forEach((c, i) => {
      const n = ins[i], team = teamOf(i);
      c.y = clamp(c.y + ((n.held.down ? 1 : 0) - (n.held.up ? 1 : 0)) * 190 * dt, 100, 490);
      c.rk = Math.max(0, c.rk - dt);
      if (n.hit.e && c.rk <= 0) {
        const [x, y] = pdInside(n.ax, n.ay, 0.95);
        s.rocks.push({ sx: c.x, sy: c.y, x, y, t: 0.5 });
        c.rk = 4;
        api.ev('throw', { seat: i });
      }
      if (c.st === 'idle') {
        if (n.hit.fire) { [c.bx, c.by] = pdInside(n.ax, n.ay); c.st = 'cast'; c.t = PD.CAST_T; api.ev('cast', { seat: i }); }
      } else if (c.st === 'cast') {
        c.t -= dt;
        if (c.t <= 0) {
          // landing right on a fish the other team is reeling in: a tug of war
          const f = s.fish.find(o => o.st === 'hooked' && o.hk.length === 1 && teamOf(o.hk[0]) !== team && Math.hypot(o.x - c.bx, o.y - c.by) < 50);
          if (f) { f.hk.push(i); f.pull[i] = 0.3; c.st = 'reel'; c.fish = f.id; c.pn = 1.2; api.ev('tug', { seat: i, x: r1(f.x), y: r1(f.y) }); }
          else { c.st = 'wait'; c.t = 0; api.ev('plop', { x: r1(c.bx), y: r1(c.by) }); }
        }
      } else if (c.st === 'wait') {
        c.t += dt;
        if (n.hit.fire || c.t > 14) c.st = 'idle';
      } else if (c.st === 'bite') {
        c.t -= dt;
        const f = fishById(c.fish);
        if (!f) c.st = 'idle';
        else if (n.hit.fire) { f.st = 'hooked'; f.hk = [i]; f.pull = { [i]: 0.15 }; f.hx = f.x; f.hy = f.y; f.lure = -1; c.st = 'reel'; c.pn = 1 + api.rng(); api.ev('hook', { seat: i, x: r1(f.x), y: r1(f.y) }); }
        else if (c.t <= 0) { pdScare(s, f, c.bx, c.by, api); c.st = 'wait'; c.t = 0; api.ev('missed', { seat: i }); }
      } else if (c.st === 'reel') {
        const f = fishById(c.fish);
        if (!f || f.st !== 'hooked' || !f.hk.includes(i)) { c.st = 'idle'; c.pr = ''; return; }
        const add = k => { f.pull[i] += k / f.w; f.hk.forEach(o => { if (o !== i) f.pull[o] -= k / f.w * 0.55; }); };
        if (n.hit.a) add(0.05);
        if (c.pr) {
          c.prT -= dt;
          const pressed = PD.LETTERS.split('').filter(l => n.hit['k' + l]);
          if (pressed.length) {
            if (pressed.includes(c.pr)) { add(0.09); api.ev('good', { seat: i }); } else { f.pull[i] -= 0.18; api.ev('bad', { seat: i }); }
            c.pr = ''; c.pn = 1.1 + api.rng() * 1.6;
          } else if (c.prT <= 0) { f.pull[i] -= 0.18; c.pr = ''; c.pn = 1.1 + api.rng() * 1.6; api.ev('bad', { seat: i }); }
        } else {
          c.pn -= dt;
          if (c.pn <= 0) { c.pr = PD.LETTERS[Math.floor(api.rng() * PD.LETTERS.length)]; c.prT = 1.3; api.ev('prompt', { seat: i }); }
        }
        f.pull[i] -= 0.1 * f.w * dt;
        if (f.pull[i] >= 1) {
          s.sc[team] += f.v;
          api.ev('land', { seat: i, v: f.v, gold: f.gold ? 1 : 0, x: r1(c.x), y: r1(c.y) });
          f.hk.forEach(o => { if (o !== i) { s.c[o].st = 'idle'; s.c[o].pr = ''; api.ev('lost', { seat: o }); } });
          s.fish = s.fish.filter(o => o !== f);
          if (!f.gold) pdFish(s, api);
          c.st = 'idle'; c.pr = '';
        } else if (f.pull[i] <= 0) {
          pdLetGo(s, f, i);
          c.st = 'stun'; c.t = 1.2; c.pr = '';
          api.ev('snap', { seat: i, x: r1(f.x), y: r1(f.y) });
        }
      } else if (c.st === 'stun') {
        c.t -= dt;
        if (c.t <= 0) c.st = 'idle';
      }
    });
    // (teammates on the same bank don't stand on each other)
    for (const [a, b] of [[0, 1], [2, 3]]) {
      const p = s.c[a], q = s.c[b], gap = q.y - p.y;
      if (Math.abs(gap) < 70) { const push = (70 - Math.abs(gap)) / 2 * (gap >= 0 ? 1 : -1); p.y = clamp(p.y - push, 100, 490); q.y = clamp(q.y + push, 100, 490); }
    }
    // the fish
    for (const f of s.fish) {
      if (f.lure >= 0 && s.c[f.lure].st !== 'wait' && s.c[f.lure].st !== 'bite') { f.lure = -1; if (f.st === 'bite') f.st = 'swim'; }
      if (f.st === 'hooked') {
        let x = f.hx, y = f.hy;
        f.hk.forEach(o => { const c = s.c[o]; x += (c.x - f.hx) * clamp(f.pull[o], 0, 1) * 0.85; y += (c.y - f.hy) * clamp(f.pull[o], 0, 1) * 0.85; });
        x += Math.sin(s.t * 13 + f.id) * 6; y += Math.cos(s.t * 11 + f.id) * 4;
        f.a = Math.atan2(y - f.y, x - f.x) || f.a;
        f.x = x; f.y = y;
        continue;
      }
      if (f.st === 'bite') continue;
      if (f.st === 'flee') { f.flee -= dt; if (f.flee <= 0) f.st = 'swim'; }
      if (f.st === 'swim' && f.lure < 0) {
        const k = s.c.findIndex(c => c.st === 'wait' && Math.hypot(c.bx - f.x, c.by - f.y) < 115 && !s.fish.some(o => o.lure === s.c.indexOf(c)));
        if (k >= 0) { f.lure = k; f.biteT = 0.5 + api.rng() * 1.6; }
      }
      let tx = f.tx, ty = f.ty, sp = f.st === 'flee' ? f.sp * 3 : f.sp;
      if (f.lure >= 0) {
        const c = s.c[f.lure];
        tx = c.bx; ty = c.by; sp = f.sp * 0.8;
        if (Math.hypot(tx - f.x, ty - f.y) < 10) {
          f.biteT -= dt;
          if (f.biteT <= 0) { f.st = 'bite'; c.st = 'bite'; c.fish = f.id; c.t = 0.85; api.ev('bite', { seat: f.lure, x: r1(c.bx), y: r1(c.by) }); }
          continue;
        }
      }
      const dx = tx - f.x, dy = ty - f.y, l = Math.hypot(dx, dy);
      if (l < 8) { if (f.lure < 0) [f.tx, f.ty] = pdSpot(api); continue; }
      f.a = Math.atan2(dy, dx);
      f.x += dx / l * sp * dt; f.y += dy / l * sp * dt;
    }
    // rocks
    for (let k = s.rocks.length - 1; k >= 0; k--) {
      const r = s.rocks[k];
      r.t -= dt;
      if (r.t > 0) continue;
      s.rocks.splice(k, 1);
      api.ev('splash', { x: r1(r.x), y: r1(r.y) });
      for (const f of s.fish) {
        const d = Math.hypot(f.x - r.x, f.y - r.y);
        if (f.st === 'hooked') { if (d < 90) f.hk.forEach(o => { f.pull[o] -= 0.15; }); continue; }
        if (d < 100) { if (f.st === 'bite' && f.lure >= 0) { s.c[f.lure].st = 'wait'; s.c[f.lure].t = 0; } pdScare(s, f, r.x, r.y, api); }
      }
      s.c.forEach((c, i) => { if ((c.st === 'wait' || c.st === 'bite') && Math.hypot(c.bx - r.x, c.by - r.y) < 80) { c.st = 'idle'; api.ev('ruined', { seat: i }); } });
    }
    if (s.t >= PD.LEN) api.over(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, 'Most fish points');
  },
  snap(s) {
    return {
      c: s.c.map(c => {
        const o = { x: r1(c.x), y: r1(c.y), s: c.st[0], pr: c.pr, rk: c.rk > 0 ? 1 : 0 };
        if (c.st === 'cast') { const p = 1 - c.t / PD.CAST_T; o.bx = r1(c.x + (c.bx - c.x) * p); o.by = r1(c.y + (c.by - c.y) * p - Math.sin(p * Math.PI) * 70); }
        else if (c.st === 'wait' || c.st === 'bite') { o.bx = r1(c.bx); o.by = r1(c.by); }
        else if (c.st === 'reel') { const f = s.fish.find(q => q.id === c.fish); if (f) { o.bx = r1(f.x); o.by = r1(f.y); o.pl = r2(clamp(f.pull[s.c.indexOf(c)] || 0, 0, 1)); } }
        return o;
      }),
      fs: s.fish.map(f => [r1(f.x), r1(f.y), f.gold ? 2 : f.big ? 1 : 0, r2(f.a), f.st === 'hooked' ? 1 : 0]),
      rk: s.rocks.map(r => { const p = 1 - r.t / 0.5; return [r1(r.sx + (r.x - r.sx) * p), r1(r.sy + (r.y - r.sy) * p - Math.sin(p * Math.PI) * 90)]; }),
      sc: s.sc.slice(), tm: Math.max(0, Math.ceil(PD.LEN - s.t)),
    };
  },
  bot(s, i, dt, api) {
    const c = s.c[i], b = c.bot || (c.bot = { t: 0.6 + Math.random(), r: 0, p: null, tug: false }), out = { held: {}, hit: {}, ax: c.x, ay: c.y };
    if (c.st !== 'bite') b.r = 0;
    if (!c.pr) b.p = null;
    if (c.st === 'idle') {
      const free = s.fish.filter(f => f.st === 'swim' || f.st === 'flee');
      const foeReel = s.fish.find(f => f.st === 'hooked' && f.hk.length === 1 && teamOf(f.hk[0]) !== teamOf(i));
      let f = free.find(o => o.gold) || free.reduce((a, o) => (!a || Math.hypot(o.x - c.x, o.y - c.y) - o.v * 40 < Math.hypot(a.x - c.x, a.y - c.y) - a.v * 40 ? o : a), null);
      if (foeReel && b.tug) f = foeReel;
      if (f) {
        if (Math.abs(f.y - c.y) > 30) out.held[f.y > c.y ? 'down' : 'up'] = true;
        b.t -= dt;
        if (b.t <= 0) {
          const e = (1 - api.skill) * 60 + 10;
          out.hit.fire = true; out.ax = f.x + (Math.random() - 0.5) * e; out.ay = f.y + (Math.random() - 0.5) * e;
          b.t = 0.5 + Math.random() * 1.2; b.tug = Math.random() < 0.3 * api.skill;
        }
      }
    } else if (c.st === 'wait') {
      if (c.t > 6 && Math.random() < dt * 0.3) out.hit.fire = true;
    } else if (c.st === 'bite') {
      if (!b.r) b.r = 0.2 + Math.random() * 0.4 * (1.4 - api.skill);
      b.r -= dt;
      if (b.r <= 0) out.hit.fire = true;
    } else if (c.st === 'reel') {
      if (Math.random() < dt * (5 + api.skill * 6)) out.hit.a = true;
      if (c.pr) {
        if (b.p == null) b.p = 0.35 + Math.random() * 0.55;
        b.p -= dt;
        if (b.p <= 0) { const l = Math.random() < 0.8 + 0.15 * api.skill ? c.pr : PD.LETTERS[Math.floor(Math.random() * PD.LETTERS.length)]; out.hit['k' + l] = true; b.p = 99; }
      }
    }
    if (c.rk <= 0 && Math.random() < dt * 0.12) {
      const f = s.fish.find(o => o.st === 'hooked' && o.hk.every(k => teamOf(k) !== teamOf(i)));
      if (f) { out.hit.e = true; out.ax = f.x; out.ay = f.y; delete out.hit.fire; }
    }
    return out;
  },
  draw(v, s) {
    const g = v.g;
    g.fillStyle = '#79c56b'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8d29a'; g.fillRect(0, 0, 118, H); g.fillRect(W - 118, 0, 118, H);
    g.fillStyle = '#6fb862';
    for (let k = 0; k < 14; k++) { const x = 140 + ((k * 137) % 680), y = (k * 211) % H; g.beginPath(); g.ellipse(x, y, 16, 8, 0, 0, TAU); g.fill(); }
    const gr = g.createRadialGradient(PD.CX, PD.CY, 40, PD.CX, PD.CY, PD.RX);
    gr.addColorStop(0, '#3fa7e0'); gr.addColorStop(1, '#1f6fae');
    g.fillStyle = '#5a9a4e'; g.beginPath(); g.ellipse(PD.CX, PD.CY, PD.RX + 10, PD.RY + 10, 0, 0, TAU); g.fill();
    g.fillStyle = gr; g.beginPath(); g.ellipse(PD.CX, PD.CY, PD.RX, PD.RY, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
    for (let k = 0; k < 3; k++) { const p = ((v.now / 3000) + k / 3) % 1; g.beginPath(); g.ellipse(PD.CX, PD.CY, PD.RX * p, PD.RY * p, 0, 0, TAU); g.stroke(); }
    g.fillStyle = '#4caf50';
    for (const [x, y] of [[300, 150], [660, 430], [610, 170], [340, 420]]) { g.beginPath(); g.arc(x, y, 20, 0.3, TAU - 0.3); g.lineTo(x, y); g.fill(); }
    for (const [x, y, k, a, hooked] of s.fs) {
      const col = k === 2 ? '#ffd23f' : k === 1 ? '#8a6dd8' : '#ff8a3d', sz = k === 1 ? 1.4 : k === 2 ? 1.3 : 1;
      g.save(); g.translate(x, y); g.rotate(a + (hooked ? Math.sin(v.now / 50) * 0.5 : Math.sin(v.now / 200 + x) * 0.15));
      g.globalAlpha = hooked ? 1 : 0.8;
      g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 15 * sz, 7 * sz, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-12 * sz, 0); g.lineTo(-22 * sz, -7 * sz); g.lineTo(-22 * sz, 7 * sz); g.fill();
      g.fillStyle = '#ffffff'; v.dot(8 * sz, -2 * sz, 2.5); g.fillStyle = '#111111'; v.dot(8.5 * sz, -2 * sz, 1.2);
      if (k === 2) { g.globalAlpha = 0.5 + Math.sin(v.now / 120) * 0.3; v.label('✨', 0, -14, 14, '#ffffff'); }
      g.restore(); g.globalAlpha = 1;
    }
    s.c.forEach((c, i) => {
      if (c.bx == null) return;
      const rx = c.x + (teamOf(i) ? -22 : 22), ry = c.y - 8;
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(rx, ry); g.quadraticCurveTo((rx + c.bx) / 2, Math.max(ry, c.by) + (c.s === 'r' ? 0 : 30), c.bx, c.by); g.stroke();
      if (c.s !== 'r') {
        const dip = c.s === 'b' ? 0.55 + Math.sin(v.now / 40) * 0.15 : 1;
        if (c.s === 'b') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(c.bx, c.by, 10 + (v.now / 8) % 14, 0, TAU); g.stroke(); }
        g.fillStyle = '#ffffff'; v.dot(c.bx, c.by, 6 * dip); g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(c.bx, c.by, 6 * dip, Math.PI, TAU); g.fill();
      }
    });
    for (const [x, y] of s.rk) { g.fillStyle = '#8a8a8a'; v.dot(x, y, 7); g.fillStyle = '#b4b4b4'; v.dot(x - 2, y - 2, 3); }
    s.c.forEach((c, i) => {
      const t = teamOf(i), col = v.team[t];
      v.catTop(i, c.x, c.y, 1.05, { lookRight: t === 0, face: c.s === 'x' ? 'sad' : c.s === 'b' ? 'shock' : null });
      if (c.s === 'r' && c.pl != null) {
        const bx = c.x - 22, by = c.y + 46;
        g.fillStyle = 'rgba(0,0,0,.4)'; v.roundRect(bx, by, 44, 8, 4); g.fill();
        g.fillStyle = col.main; v.roundRect(bx, by, 44 * c.pl, 8, 4); g.fill();
      }
      if (c.pr) {
        const px = c.x + (t ? -66 : 66), py = c.y - 34, big = i === v.me;
        const sz = big ? 42 : 30;
        g.fillStyle = '#ffffff'; v.roundRect(px - sz / 2, py - sz / 2, sz, sz, 8); g.fill();
        g.strokeStyle = col.main; g.lineWidth = 3; v.roundRect(px - sz / 2, py - sz / 2, sz, sz, 8); g.stroke();
        v.label(c.pr, px, py + 1, sz * 0.62, '#222222');
      }
    });
    const mc = s.c[v.me];
    if (mc && mc.pr) v.bigText('Press ' + mc.pr + '!', H - 40, 34, '#ffd23f', 1);
    scores(v, s.sc, s.tm);
  },
  event(v, e) {
    if (e.type === 'cast') v.sound('whoosh');
    if (e.type === 'plop') { v.ring(e.x, e.y, '#ffffff', 6); v.sound([[300, 0, 0.04]]); }
    if (e.type === 'bite') { v.ring(e.x, e.y, '#ffffff', 10); if (e.seat === v.me) v.sound('notify'); v.mood(e.seat, 'shock', 0.8); }
    if (e.type === 'hook') { v.pop(e.x, e.y - 20, 'Hooked!', '#ffd23f'); v.sound('pop'); }
    if (e.type === 'tug') { v.pop(e.x, e.y - 24, 'Tug of war!', '#ff9ac8'); v.sound('check'); }
    if (e.type === 'prompt' && e.seat === v.me) v.sound('tick');
    if (e.type === 'good' && e.seat === v.me) v.sound('correct');
    if (e.type === 'bad') { if (e.seat === v.me) v.sound('miss'); v.mood(e.seat, 'shock', 0.7); }
    if (e.type === 'land') { v.pop(e.x, e.y - 40, '+' + e.v + (e.gold ? ' GOLD!' : ''), e.gold ? '#ffd23f' : '#ffffff'); v.burst(e.x, e.y, e.gold ? '#ffd23f' : '#7fd8ff', e.gold ? 30 : 14, 240); v.sound(e.gold ? 'win' : 'coin'); v.mood(e.seat, 'happy', 1.5); }
    if (e.type === 'snap') { v.pop(e.x, e.y - 20, 'Snap!', '#ff5a5a'); v.sound('miss'); v.mood(e.seat, 'sad', 1.2); }
    if (e.type === 'lost') v.mood(e.seat, 'sad', 1.2);
    if (e.type === 'missed') v.mood(e.seat, 'sad', 0.8);
    if (e.type === 'splash') { v.ring(e.x, e.y, '#bfe8ff', 14); v.burst(e.x, e.y, '#bfe8ff', 12, 180); v.sound('thud'); }
    if (e.type === 'ruined') v.mood(e.seat, 'shock', 1);
    if (e.type === 'gold') { v.pop(e.x, e.y - 20, 'Golden fish!', '#ffd23f'); v.ring(e.x, e.y, '#ffd23f', 24); v.sound('found'); }
  },
});

/* ================= CHEESE HEIST 2 vs 2 ================= */
// A dark maze. One team are the mice, the other the cats, and then they swap. You only see what your flashlight and
// your teammate's show, plus noises. Mice steal cheese (1 point each) and then get out through the exit (2 more).
// Space leaps over a wall (noisily), they squeeze through mouse holes the cats can't use, and E throws a squeak where
// you aim, to fool the cats. Cats are a little faster, dash with Space, and each can set one trap (E). A caught mouse
// is out until the swap. The cats never see the cheese or the exit unless their light is on them. Most points wins.
const HZ = { COLS: 16, ROWS: 8, CELL: 60, TOP: 60, HALF: 60, MOUSE: 150, CAT: 165, MR: 13, CR: 16, LIGHT_M: 105, LIGHT_C: 125 };
function hzMaze(rng) {
  const C = HZ.COLS, R = HZ.ROWS, N = C * R, rw = new Array(N).fill(1), dn = new Array(N).fill(1), seen = new Array(N).fill(false);
  const st = [[0, 0]]; seen[0] = true;
  while (st.length) {
    const [x, y] = st[st.length - 1], nb = [];
    if (x < C - 1 && !seen[y * C + x + 1]) nb.push([x + 1, y, 0]);
    if (y < R - 1 && !seen[(y + 1) * C + x]) nb.push([x, y + 1, 1]);
    if (x > 0 && !seen[y * C + x - 1]) nb.push([x - 1, y, 2]);
    if (y > 0 && !seen[(y - 1) * C + x]) nb.push([x, y - 1, 3]);
    if (!nb.length) { st.pop(); continue; }
    const [nx, ny, d] = nb[Math.floor(rng() * nb.length)];
    if (d === 0) rw[y * C + x] = 0; else if (d === 1) dn[y * C + x] = 0; else if (d === 2) rw[y * C + x - 1] = 0; else dn[(y - 1) * C + x] = 0;
    seen[ny * C + nx] = true; st.push([nx, ny]);
  }
  for (let k = 0; k < N * 0.24; k++) { const i = Math.floor(rng() * N), x = i % C, y = Math.floor(i / C); if (rng() < 0.5) { if (x < C - 1) rw[i] = 0; } else if (y < R - 1) dn[i] = 0; }
  for (let t = 0, tries = 0; t < 9 && tries < 600; tries++) {
    const i = Math.floor(rng() * N), x = i % C, y = Math.floor(i / C);
    if (rng() < 0.5) { if (x < C - 1 && rw[i] === 1) { rw[i] = 2; t++; } } else if (y < R - 1 && dn[i] === 1) { dn[i] = 2; t++; }
  }
  return rw.map((r, i) => String((i % C === C - 1 ? 0 : r) + 3 * (Math.floor(i / C) === R - 1 ? 0 : dn[i]))).join('');
}
const segCache = new Map();
function hzSegs(mz) {
  if (segCache.has(mz)) return segCache.get(mz);
  const out = [], C = HZ.COLS, S = HZ.CELL, T = HZ.TOP;
  for (let i = 0; i < mz.length; i++) {
    const v = +mz[i], r = v % 3, d = Math.floor(v / 3), x = i % C, y = Math.floor(i / C);
    if (r) out.push([(x + 1) * S, T + y * S, (x + 1) * S, T + (y + 1) * S, r === 2]);
    if (d) out.push([x * S, T + (y + 1) * S, (x + 1) * S, T + (y + 1) * S, d === 2]);
  }
  out.push([0, T, W, T, false], [0, H, W, H, false], [0, T, 0, H, false], [W, T, W, H, false]);
  if (segCache.size > 6) segCache.clear();
  segCache.set(mz, out);
  return out;
}
// Can you go from cell (x, y) in direction d (0 right, 1 down, 2 left, 3 up)? Mice fit through the mouse holes.
function hzPass(mz, x, y, d, mouse) {
  const C = HZ.COLS;
  let t;
  if (d === 0) { if (x >= C - 1) return false; t = +mz[y * C + x] % 3; }
  else if (d === 1) { if (y >= HZ.ROWS - 1) return false; t = Math.floor(+mz[y * C + x] / 3); }
  else if (d === 2) { if (x <= 0) return false; t = +mz[y * C + x - 1] % 3; }
  else { if (y <= 0) return false; t = Math.floor(+mz[(y - 1) * C + x] / 3); }
  return t === 0 || (t === 2 && mouse);
}
const hzCell = (x, y) => [clamp(Math.floor(x / HZ.CELL), 0, HZ.COLS - 1), clamp(Math.floor((y - HZ.TOP) / HZ.CELL), 0, HZ.ROWS - 1)];
const hzMid = (cx, cy) => [cx * HZ.CELL + HZ.CELL / 2, HZ.TOP + cy * HZ.CELL + HZ.CELL / 2];
// The first cell on the way from (sx, sy) to (gx, gy), going round the walls (null if there's no way).
function hzNext(mz, sx, sy, gx, gy, mouse) {
  if (sx === gx && sy === gy) return [gx, gy];
  const C = HZ.COLS, from = new Map([[sy * C + sx, -1]]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (let d = 0; d < 4; d++) {
      if (!hzPass(mz, x, y, d, mouse)) continue;
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1], k = ny * C + nx;
      if (from.has(k)) continue;
      from.set(k, y * C + x);
      if (nx === gx && ny === gy) {
        let cur = k;
        while (from.get(cur) !== sy * C + sx) cur = from.get(cur);
        return [cur % C, Math.floor(cur / C)];
      }
      q.push([nx, ny]);
    }
  }
  return null;
}
function hzCollide(c, segs, r, mouse) {
  for (const [ax, ay, bx, by, hole] of segs) {
    if (hole && mouse) continue;
    const p = segNear(c.x, c.y, ax, ay, bx, by);
    if (p.d < r && p.d > 0.001) { c.x = p.x + (c.x - p.x) / p.d * r; c.y = p.y + (c.y - p.y) / p.d * r; }
  }
}
function hzHalf(s) {
  s.t = 0; s.pause = 0; s.traps = []; s.noise = [];
  s.ch = s.cheese.map(p => p.slice());
  const mt = s.mt;
  const mice = [[0, 3], [0, 4]], cats = [[12, 1], [12, 6]];
  s.c = [0, 1, 2, 3].map(i => {
    const mouse = teamOf(i) === mt, k = i % 2, [cx, cy] = (mouse ? mice : cats)[k], [x, y] = hzMid(cx, cy);
    return { x, y, vx: 0, vy: 0, f: mouse ? 1 : -1, fd: mouse ? 0 : 2, m: mouse, st: 0, got: 0, leap: null, lcd: 0, sq: 0, stuck: 0, dash: 0, dcd: 0, trap: 1 };
  });
}
function hzNoise(s, api, x, y) { s.noise.push({ x, y, t: s.t }); if (s.noise.length > 8) s.noise.shift(); api.ev('noise', { x: r1(x), y: r1(y) }); }
D.add('heist2', {
  name: 'Cheese Heist 2v2', icon: '🧀',
  how: 'Mice: steal 🧀, then escape! Space leaps a wall, E squeaks. Cats: catch them! Space dash, E trap.',
  keys: { KeyE: 'e' },
  init(api) {
    const s = { sc: [0, 0], half: 1, mt: 0, mz: hzMaze(api.rng) };
    const used = new Set(['12,1', '12,6', '0,3', '0,4']);
    s.cheese = [];
    while (s.cheese.length < 6) { const x = 3 + Math.floor(api.rng() * 10), y = Math.floor(api.rng() * HZ.ROWS); if (used.has(x + ',' + y)) continue; used.add(x + ',' + y); s.cheese.push(hzMid(x, y)); }
    s.exit = hzMid(HZ.COLS - 1, Math.floor(api.rng() * HZ.ROWS));
    hzHalf(s);
    return s;
  },
  step(s, ins, dt, api) {
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0) {
        if (s.half === 1) { s.half = 2; s.mt = 1; hzHalf(s); api.ev('swap', {}); }
        else api.over(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, 'Most points over both halves');
      }
      return;
    }
    s.t += dt;
    const segs = hzSegs(s.mz);
    s.c.forEach((c, i) => {
      if (c.st) return;
      const n = ins[i];
      c.lcd = Math.max(0, c.lcd - dt); c.sq = Math.max(0, c.sq - dt); c.dcd = Math.max(0, c.dcd - dt);
      if (c.leap) {
        c.leap.t += dt / 0.35;
        const p = Math.min(1, c.leap.t);
        c.x = c.leap.fx + (c.leap.tx - c.leap.fx) * p; c.y = c.leap.fy + (c.leap.ty - c.leap.fy) * p;
        if (p >= 1) c.leap = null;
        return;
      }
      if (c.stuck > 0) { c.stuck -= dt; c.vx = c.vy = 0; return; }
      const dir = keyDir(n);
      if (dir[0] || dir[1]) { c.fd = Math.abs(dir[0]) >= Math.abs(dir[1]) ? (dir[0] > 0 ? 0 : 2) : (dir[1] > 0 ? 1 : 3); if (dir[0]) c.f = dir[0] > 0 ? 1 : -1; }
      if (c.dash > 0) c.dash -= dt;
      const sp = c.m ? HZ.MOUSE : c.dash > 0 ? 430 : HZ.CAT;
      if (c.dash > 0 && !(dir[0] || dir[1])) { c.vx = DIRS[c.fd][0] * sp; c.vy = DIRS[c.fd][1] * sp; }
      else { c.vx = dir[0] * sp; c.vy = dir[1] * sp; }
      c.x += c.vx * dt; c.y += c.vy * dt;
      hzCollide(c, segs, c.m ? HZ.MR : HZ.CR, c.m);
      c.x = clamp(c.x, 14, W - 14); c.y = clamp(c.y, HZ.TOP + 14, H - 14);
      if (c.m) {
        if (n.hit.a && c.lcd <= 0) {
          const [cx, cy] = hzCell(c.x, c.y), nx = cx + DIRS[c.fd][0], ny = cy + DIRS[c.fd][1];
          if (nx >= 0 && ny >= 0 && nx < HZ.COLS && ny < HZ.ROWS) {
            const [tx, ty] = hzMid(nx, ny);
            c.leap = { fx: c.x, fy: c.y, tx, ty, t: 0 }; c.lcd = 3;
            hzNoise(s, api, c.x, c.y);
            api.ev('leap', { seat: i });
          }
        }
        if (n.hit.e && c.sq <= 0) { c.sq = 6; hzNoise(s, api, clamp(n.ax, 10, W - 10), clamp(n.ay, HZ.TOP + 10, H - 10)); }
      } else {
        if (n.hit.a && c.dcd <= 0) { c.dash = 0.25; c.dcd = 2.5; api.ev('dash', { seat: i }); }
        if (n.hit.e && c.trap) { c.trap = 0; s.traps.push({ x: c.x, y: c.y }); api.ev('trap', { seat: i }); }
      }
    });
    // mice and cheese, the exit, the traps, and the cats
    s.c.forEach((c, i) => {
      if (!c.m || c.st || c.leap) return;
      for (let k = s.ch.length - 1; k >= 0; k--) {
        const [x, y] = s.ch[k];
        if (Math.hypot(x - c.x, y - c.y) < 24) { s.ch.splice(k, 1); c.got++; s.sc[s.mt]++; api.ev('steal', { seat: i, x, y }); hzNoise(s, api, x, y); }
      }
      if (c.got && Math.hypot(s.exit[0] - c.x, s.exit[1] - c.y) < 24) { c.st = 2; s.sc[s.mt] += 2; api.ev('escape', { seat: i, x: r1(c.x), y: r1(c.y) }); return; }
      for (let k = s.traps.length - 1; k >= 0; k--) {
        const t = s.traps[k];
        if (Math.hypot(t.x - c.x, t.y - c.y) < 20) { s.traps.splice(k, 1); c.stuck = 2.5; api.ev('snapped', { seat: i, x: r1(t.x), y: r1(t.y) }); hzNoise(s, api, t.x, t.y); }
      }
      const cat = s.c.findIndex(o => !o.m && Math.hypot(o.x - c.x, o.y - c.y) < 28);
      if (cat >= 0) { c.st = 1; api.ev('caught', { seat: i, by: cat, x: r1(c.x), y: r1(c.y) }); }
    });
    const miceLeft = s.c.filter(c => c.m && !c.st).length;
    if (!miceLeft || s.t >= HZ.HALF) { s.pause = 2.6; api.ev('halfover', { half: s.half }); }
  },
  snap: s => ({
    c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, m: c.m ? 1 : 0, st: c.st, lp: c.leap ? 1 : 0, sk: c.stuck > 0 ? 1 : 0, d: c.dash > 0 ? 1 : 0, g: c.got, cd: Math.ceil(c.m ? c.lcd : c.dcd), sq: Math.ceil(c.sq), tr: c.trap })),
    ch: s.ch, ex: s.exit, tr: s.traps.map(t => [r1(t.x), r1(t.y)]), mz: s.mz, mt: s.mt, sc: s.sc.slice(), hf: s.half,
    tm: Math.max(0, Math.ceil(HZ.HALF - s.t)), pz: s.pause > 0 ? 1 : 0,
  }),
  bot(s, i, dt, api) {
    const c = s.c[i], out = { held: {}, hit: {}, ax: c.x, ay: c.y };
    if (c.st || c.leap || s.pause > 0) return out;
    const [cx, cy] = hzCell(c.x, c.y);
    const go = (gx, gy, px, py) => {
      const nx = hzNext(s.mz, cx, cy, gx, gy, c.m);
      if (!nx) return;
      const [tx, ty] = nx[0] === gx && nx[1] === gy && px != null ? [px, py] : hzMid(nx[0], nx[1]);
      out.held = toward(c, tx, ty, 4);
    };
    if (c.m) {
      const cats = s.c.filter(o => !o.m);
      const near = cats.reduce((a, o) => (!a || dist(o, c) < dist(a, c) ? o : a), null);
      const dc = near ? dist(near, c) : 1e9;
      if (dc < 120) {
        // run: the open neighbour cell furthest from that cat
        let best = null, bd = -1;
        for (let d = 0; d < 4; d++) {
          if (!hzPass(s.mz, cx, cy, d, true)) continue;
          const [mx, my] = hzMid(cx + DIRS[d][0], cy + DIRS[d][1]), dd = Math.hypot(mx - near.x, my - near.y);
          if (dd > bd) { bd = dd; best = [mx, my]; }
        }
        if (best) out.held = toward(c, best[0], best[1], 4);
        if (dc < 70 && c.lcd <= 0 && Math.random() < dt * 6 * api.skill) {
          const away = Math.abs(c.x - near.x) > Math.abs(c.y - near.y) ? (c.x > near.x ? 'right' : 'left') : (c.y > near.y ? 'down' : 'up');
          out.held = { [away]: true }; out.hit.a = true;
        }
        if (c.sq <= 0 && Math.random() < dt * 0.6) { out.hit.e = true; out.ax = 60 + Math.random() * (W - 120); out.ay = HZ.TOP + 30 + Math.random() * (H - HZ.TOP - 60); }
        return out;
      }
      const leaveNow = c.got && (!s.ch.length || s.t > HZ.HALF * 0.65 || c.got >= 2);
      if (leaveNow) { const [ex, ey] = hzCell(s.exit[0], s.exit[1]); go(ex, ey, s.exit[0], s.exit[1]); return out; }
      // the nearest cheese (teammates go for different ones)
      const mate = s.c[mateOf(i)];
      const pick = s.ch.slice().sort((a, b) => Math.hypot(a[0] - c.x, a[1] - c.y) - Math.hypot(b[0] - c.x, b[1] - c.y));
      let ch = pick[0];
      if (pick.length > 1 && !mate.st && Math.hypot(pick[0][0] - mate.x, pick[0][1] - mate.y) < Math.hypot(pick[0][0] - c.x, pick[0][1] - c.y)) ch = pick[1];
      if (ch) { const [gx, gy] = hzCell(ch[0], ch[1]); go(gx, gy, ch[0], ch[1]); }
      else { const [ex, ey] = hzCell(s.exit[0], s.exit[1]); go(ex, ey, s.exit[0], s.exit[1]); }
      return out;
    }
    // a cat: chase a mouse its team can see, else the last noise, else wander
    const lights = s.c.filter(o => !o.m);
    const seen = s.c.filter(o => o.m && !o.st && !o.leap && lights.some(l => dist(l, o) < HZ.LIGHT_C));
    let tgt = seen.reduce((a, o) => (!a || dist(o, c) < dist(a, c) ? o : a), null);
    if (tgt) {
      const [gx, gy] = hzCell(tgt.x, tgt.y);
      go(gx, gy, tgt.x, tgt.y);
      if (dist(tgt, c) < 130 && c.dcd <= 0 && Math.random() < dt * 3 * api.skill) out.hit.a = true;
      return out;
    }
    const heard = s.noise.filter(o => s.t - o.t < 4).pop();
    if (heard && (!c.bh || c.bh !== heard)) { c.bh = heard; c.bw = hzCell(heard.x, heard.y); }
    if (!c.bw || (c.bw[0] === cx && c.bw[1] === cy)) {
      c.bw = [Math.floor(Math.random() * HZ.COLS), Math.floor(Math.random() * HZ.ROWS)];
      if (c.trap && s.t > 8 && Math.random() < 0.3) out.hit.e = true;
    }
    go(c.bw[0], c.bw[1]);
    return out;
  },
  draw(v, s) {
    const g = v.g, segs = hzSegs(s.mz), myTeam = teamOf(v.me), iAmMouse = myTeam === s.mt;
    g.fillStyle = '#3b2b22'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < HZ.ROWS; y++) for (let x = 0; x < HZ.COLS; x++) { g.fillStyle = (x + y) % 2 ? '#6b4e3a' : '#634836'; g.fillRect(x * HZ.CELL, HZ.TOP + y * HZ.CELL, HZ.CELL, HZ.CELL); }
    // the lights: you and your teammate (while still in it)
    const lights = s.c.map((c, i) => ({ c, i })).filter(o => teamOf(o.i) === myTeam && !o.c.st).map(o => ({ x: o.c.x, y: o.c.y, r: o.c.m ? HZ.LIGHT_M : HZ.LIGHT_C }));
    const lit = (x, y) => lights.some(l => Math.hypot(l.x - x, l.y - y) < l.r * 0.95);
    const exitOpen = s.c.some(c => c.m && c.g > 0);
    const drawExit = () => { const [x, y] = s.ex; g.fillStyle = exitOpen ? '#5ee07a' : '#3a7a48'; v.roundRect(x - 20, y - 20, 40, 40, 8); g.fill(); v.label('🚪', x, y + 1, 22, '#ffffff'); };
    const drawCheese = () => { for (const [x, y] of s.ch) v.label('🧀', x, y + 1, 24, '#ffd23f'); };
    const drawTraps = () => { for (const [x, y] of s.tr) v.label('🪤', x, y + 1, 22, '#ffffff'); };
    if (!iAmMouse) { if (lit(s.ex[0], s.ex[1])) drawExit(); for (const [x, y] of s.ch) if (lit(x, y)) v.label('🧀', x, y + 1, 24, '#ffd23f'); drawTraps(); }
    else { drawExit(); drawCheese(); for (const [x, y] of s.tr) if (lit(x, y)) v.label('🪤', x, y + 1, 22, '#ffffff'); }
    g.lineCap = 'round';
    for (const [ax, ay, bx, by, hole] of segs) {
      g.strokeStyle = '#e2cf9e'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      if (hole) { const mx = (ax + bx) / 2, my = (ay + by) / 2; g.fillStyle = '#1a1210'; g.beginPath(); g.ellipse(mx, my, ax === bx ? 4 : 11, ax === bx ? 11 : 4, 0, 0, TAU); g.fill(); }
    }
    g.lineCap = 'butt';
    const drawAgent = (c, i) => {
      if (c.st) return;
      v.catTop(i, c.x, c.y, c.m ? (c.lp ? 0.85 : 0.68) : 0.92, { lookRight: c.f > 0, face: c.sk ? 'shock' : c.d ? 'angry' : null, alpha: c.lp ? 0.85 : 1 });
      if (c.m) v.label('🐭', c.x + 13, c.y - 12, 14, '#ffffff');
      if (c.m && c.g) v.label('🧀×' + c.g, c.x, c.y - 26, 12, '#ffd23f');
      if (c.sk) v.label('🪤', c.x, c.y + 4, 18, '#ffffff');
    };
    // the other team: only where your team's light falls
    s.c.forEach((c, i) => { if (teamOf(i) !== myTeam && lit(c.x, c.y)) drawAgent(c, i); });
    // the dark
    if (!darkC) { darkC = document.createElement('canvas'); darkC.width = W; darkC.height = H; }
    const d = darkC.getContext('2d');
    d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H);
    d.fillStyle = 'rgba(6,5,14,.88)'; d.fillRect(0, HZ.TOP, W, H - HZ.TOP);
    d.globalCompositeOperation = 'destination-out';
    for (const l of lights) { const gr = d.createRadialGradient(l.x, l.y, l.r * 0.35, l.x, l.y, l.r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = gr; d.beginPath(); d.arc(l.x, l.y, l.r, 0, TAU); d.fill(); }
    d.globalCompositeOperation = 'source-over';
    g.drawImage(darkC, 0, 0, W, H);
    if (iAmMouse) { g.globalAlpha = 0.55; drawExit(); drawCheese(); g.globalAlpha = 1; }
    s.c.forEach((c, i) => { if (teamOf(i) === myTeam) drawAgent(c, i); });
    // the top bar
    g.fillStyle = '#1b1420'; g.fillRect(0, 0, W, HZ.TOP);
    v.label(v.team[0].name + ' ' + s.sc[0], 90, 30, 22, v.team[0].light);
    v.label(v.team[1].name + ' ' + s.sc[1], W - 90, 30, 22, v.team[1].light);
    v.label('Half ' + s.hf + ' · ' + v.team[s.mt].name + ' are the mice 🐭 · ' + s.tm + 's', W / 2, 26, 15, '#ffffff');
    const me = s.c[v.me];
    if (me) {
      const t = me.m ? 'You\'re a mouse: ' + (me.st === 1 ? 'caught!' : me.st === 2 ? 'escaped!' : 'leap ' + (me.cd ? me.cd + 's' : 'ready') + ' · squeak ' + (me.sq ? me.sq + 's' : 'ready'))
        : 'You\'re a cat: dash ' + (me.cd ? me.cd + 's' : 'ready') + ' · trap ' + (me.tr ? 'ready' : 'used');
      v.label(t, W / 2, 50, 13, '#ffd23f');
    }
    // caught and escaped mice
    s.c.forEach((c, i) => { if (c.st) v.label((c.st === 1 ? '🔒 ' : '🏃 ') + (i === v.me ? 'You' : v.names[i]), teamOf(i) === 0 ? 220 : W - 220, 26 + (i % 2) * 20, 12, c.st === 1 ? '#ff8a8a' : '#8affa0'); });
    if (s.pz) v.bigText(s.hf === 1 ? 'Swap!' : 'Time!', H / 2, 70, '#ffffff', 1);
  },
  event(v, e) {
    if (e.type === 'noise') { v.ring(e.x, e.y, '#ffffff', 12); v.ring(e.x, e.y, '#ffffff', 26); v.pop(e.x, e.y - 10, '!', '#ffffff'); v.sound([[700, 0, 0.03], [900, 0.04, 0.03]]); }
    if (e.type === 'steal') { v.mood(e.seat, 'happy', 1); if (teamOf(e.seat) === teamOf(v.me)) v.sound('coin'); }
    if (e.type === 'escape') { v.pop(e.x, e.y - 30, '+2 Escaped!', '#8affa0'); v.sound('correct'); v.mood(e.seat, 'happy', 99); }
    if (e.type === 'caught') { v.burst(e.x, e.y, '#ffffff', 18, 240); v.pop(e.x, e.y - 30, 'Caught!', '#ff5a5a'); v.sound('capture'); v.mood(e.by, 'happy', 1.5); v.mood(e.seat, 'ko', 99); v.shake(6); }
    if (e.type === 'snapped') v.mood(e.seat, 'shock', 2.5);
    if (e.type === 'dash' && e.seat === v.me) v.sound('whoosh');
    if (e.type === 'leap' && e.seat === v.me) v.sound([[400, 0, 0.05], [700, 0.05, 0.05]]);
    if (e.type === 'trap' && teamOf(e.seat) === teamOf(v.me)) v.sound('flip');
    if (e.type === 'halfover') v.sound('notify');
    if (e.type === 'swap') v.sound('start');
  },
});
let darkC = null;

})();
