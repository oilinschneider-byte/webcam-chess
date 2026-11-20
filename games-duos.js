/* The Duos games: 2 vs 2, four cats at once (see duos.js for how they run). Seats 0 and 1 are the blue team, 2 and 3
   the orange team. Each game: init(api) makes the state, step(s, inputs, dt, api) moves it on one step from all four
   players' controls (the host runs it), snap(s) is what gets sent and drawn (the cats in snap.c, with x and y, so the
   other screens can smooth them out), draw(v, snap, phase) draws it, bot(s, seat, dt, api) plays a seat nobody has,
   and event(v, e) shows the moments (api.ev) on every screen. api.over(team, why) ends it. */
(() => {
'use strict';

const D = CA.duos;
const { W, H, teamOf, mateOf, clamp } = D;
const TAU = Math.PI * 2;
const r1 = v => Math.round(v * 10) / 10;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Which way the keys point (a unit vector, or 0, 0).
function keyDir(n) {
  const x = (n.held.right ? 1 : 0) - (n.held.left ? 1 : 0), y = (n.held.down ? 1 : 0) - (n.held.up ? 1 : 0);
  const l = Math.hypot(x, y);
  return l ? [x / l, y / l] : [0, 0];
}
// A bot's "keys", heading for (tx, ty).
function toward(c, tx, ty, slack) {
  const dx = tx - c.x, dy = ty - c.y, held = {};
  if (dx > (slack || 8)) held.right = true; else if (dx < -(slack || 8)) held.left = true;
  if (dy > (slack || 8)) held.down = true; else if (dy < -(slack || 8)) held.up = true;
  return held;
}
// Speeds a cat up toward where its keys point, and slows it down when none are held.
function drive(c, dir, dt, speed, accel) {
  const tx = dir[0] * speed, ty = dir[1] * speed, k = Math.min(1, (accel || 9) * dt);
  c.vx += (tx - c.vx) * k;
  c.vy += (ty - c.vy) * k;
  if (dir[0]) c.f = dir[0] > 0 ? 1 : -1;
}
// Cats bump into each other (circles of radius r): pushed apart, and their speeds swap a little along the bump.
function bump(cs, r, api, hard) {
  for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
    const p = cs[a], q = cs[b];
    if (p.out || q.out) continue;
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    if (d >= r * 2 || d < 0.01) continue;
    const nx = dx / d, ny = dy / d, over = r * 2 - d, mp = p.dashT > 0 ? 3 : 1, mq = q.dashT > 0 ? 3 : 1;
    p.x -= nx * over * mq / (mp + mq); p.y -= ny * over * mq / (mp + mq);
    q.x += nx * over * mp / (mp + mq); q.y += ny * over * mp / (mp + mq);
    const rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
    if (rv < 0) {
      const j = -1.4 * rv / (1 / mp + 1 / mq);
      p.vx -= j * nx / mp; p.vy -= j * ny / mp; q.vx += j * nx / mq; q.vy += j * ny / mq;
    }
    if (hard) hard(p, q, nx, ny);
  }
}
// The four starting spots: blue on the left, orange on the right.
const starts = (lx, rx, y0, y1) => [[lx, y0], [lx, y1], [rx, y0], [rx, y1]];
const newCat = (seat, x, y) => ({ seat, x, y, vx: 0, vy: 0, f: teamOf(seat) ? -1 : 1, dashT: 0, dashCd: 0, daze: 0, out: false });
// Round wins at the top: a dot per round each team has won.
function roundDots(v, wins, need) {
  for (let t = 0; t < 2; t++) for (let k = 0; k < need; k++) {
    const x = W / 2 + (t ? 1 : -1) * (40 + k * 22), y = 22;
    v.g.fillStyle = k < wins[t] ? v.team[t].main : 'rgba(255,255,255,.18)';
    v.dot(x, y, 8);
  }
  v.label('VS', W / 2, 26, 13, '#ffffff');
}
const speedLines = (v, c) => {
  const g = v.g, sp = Math.hypot(c.vx, c.vy) || 1;
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath();
  for (const o of [-10, 0, 10]) { const ox = -c.vy / sp * o, oy = c.vx / sp * o; g.moveTo(c.x - c.vx / sp * 26 + ox, c.y - c.vy / sp * 26 + oy); g.lineTo(c.x - c.vx / sp * 52 + ox, c.y - c.vy / sp * 52 + oy); }
  g.stroke();
};

/* ================= SUMO 2 vs 2 ================= */
// Push both cats of the other team out of the ring. Space charges forward for a big shove (then a moment to recover).
// The ring shrinks after 8 seconds. First team to win 3 rounds.
const SU = { CX: 480, CY: 290, R0: 225, RMIN: 110, R: 23, SPEED: 210, DASH: 560, DASH_T: 0.22, DASH_CD: 1.3, WIN: 3 };
D.add('sumo2', {
  name: 'Sumo 2v2', icon: '🤼',
  how: 'WASD to move, Space to charge. Push both of the other team out of the ring!',
  init(api) { const s = { wins: [0, 0], round: 1 }; sumoRound(s); return s; },
  step(s, ins, dt, api) {
    if (s.pause > 0) { s.pause -= dt; if (s.pause <= 0) { if (Math.max(...s.wins) >= SU.WIN) api.over(s.wins[0] > s.wins[1] ? 0 : 1, 'First to ' + SU.WIN + ' rounds'); else { s.round++; sumoRound(s); } } return; }
    s.t += dt;
    if (s.t > 8) s.r = Math.max(SU.RMIN, s.r - 7 * dt);
    s.c.forEach((c, i) => {
      if (c.out) { c.fall += dt; return; }
      const n = ins[i];
      c.dashT = Math.max(0, c.dashT - dt); c.dashCd = Math.max(0, c.dashCd - dt); c.daze = Math.max(0, c.daze - dt);
      const dir = c.daze > 0 ? [0, 0] : keyDir(n);
      if (c.dashT <= 0) drive(c, dir, dt, SU.SPEED, 7);
      if (n.hit.a && c.dashCd <= 0 && c.daze <= 0) {
        const d = dir[0] || dir[1] ? dir : [c.f, 0];
        c.vx = d[0] * SU.DASH; c.vy = d[1] * SU.DASH; c.dashT = SU.DASH_T; c.dashCd = SU.DASH_CD;
        api.ev('charge', { seat: i });
      }
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.dashT <= 0) { c.vx *= Math.pow(0.2, dt); c.vy *= Math.pow(0.2, dt); }
    });
    bump(s.c, SU.R, api, (p, q, nx, ny) => {
      const a = p.dashT > 0 ? p : q.dashT > 0 ? q : null;
      if (!a) return;
      const b = a === p ? q : p, sgn = a === p ? 1 : -1;
      if (teamOf(a.seat) === teamOf(b.seat)) return;
      b.vx += nx * sgn * 380; b.vy += ny * sgn * 380; b.daze = 0.35; a.dashT = 0;
      api.ev('shove', { x: r1((p.x + q.x) / 2), y: r1((p.y + q.y) / 2), by: a.seat, to: b.seat });
    });
    s.c.forEach(c => {
      if (!c.out && Math.hypot(c.x - SU.CX, c.y - SU.CY) > s.r + 4) { c.out = true; c.fall = 0; api.ev('out', { seat: c.seat, x: r1(c.x), y: r1(c.y) }); }
    });
    const left = [0, 1].map(t => s.c.filter(c => teamOf(c.seat) === t && !c.out).length);
    let w = null;
    if (!left[0] && !left[1]) w = -1; else if (!left[0]) w = 1; else if (!left[1]) w = 0;
    if (w === null && s.t > 45) w = left[0] === left[1] ? -1 : left[0] > left[1] ? 0 : 1;
    if (w !== null) { if (w >= 0) s.wins[w]++; s.pause = 1.6; api.ev('round', { w }); }
  },
  snap: s => ({ c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, d: c.dashT > 0 ? 1 : 0, z: c.daze > 0 ? 1 : 0, o: c.out ? r1(c.fall) : -1, vx: Math.round(c.vx), vy: Math.round(c.vy), cd: c.dashCd > 0 ? 1 : 0 })), r: r1(s.r), w: s.wins, rd: s.round }),
  bot(s, i, dt, api) {
    const c = s.c[i], out = { held: {}, hit: {}, ax: 0, ay: 0 };
    if (c.out || s.pause > 0) return out;
    const fromC = Math.hypot(c.x - SU.CX, c.y - SU.CY);
    if (fromC > s.r - 45) { out.held = toward(c, SU.CX, SU.CY); return out; }
    const foes = s.c.filter(o => !o.out && teamOf(o.seat) !== teamOf(i));
    if (!foes.length) return out;
    const e = foes.reduce((a, b) => (dist(a, c) < dist(b, c) ? a : b));
    // get on the inside of them, then shove outward
    const ex = e.x - SU.CX, ey = e.y - SU.CY, el = Math.hypot(ex, ey) || 1;
    const tx = e.x - ex / el * 40, ty = e.y - ey / el * 40;
    out.held = dist(c, e) > 90 ? toward(c, tx, ty) : toward(c, e.x + ex / el * 30, e.y + ey / el * 30);
    if (dist(c, e) < 95 && c.dashCd <= 0 && Math.random() < dt * 4 * (0.4 + api.skill)) out.hit.a = true;
    return out;
  },
  draw(v, s) {
    const g = v.g;
    g.fillStyle = '#2a1d3a'; g.fillRect(0, 0, W, H);
    // the mat, and the ring on it
    g.fillStyle = '#e9d7a6'; v.dot(SU.CX, SU.CY, SU.R0 + 26);
    g.fillStyle = '#d6bf85'; v.dot(SU.CX, SU.CY, SU.R0 + 8);
    g.fillStyle = 'rgba(200, 40, 40, .18)'; v.dot(SU.CX, SU.CY, SU.R0 + 8);
    g.fillStyle = '#f4e4b8'; v.dot(SU.CX, SU.CY, s.r);
    g.strokeStyle = s.r < SU.R0 - 1 ? '#e8452c' : '#7a5a2a'; g.lineWidth = 6; g.beginPath(); g.arc(SU.CX, SU.CY, s.r, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(122, 90, 42, .5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(SU.CX - 30, SU.CY - 30); g.lineTo(SU.CX - 30, SU.CY + 30); g.moveTo(SU.CX + 30, SU.CY - 30); g.lineTo(SU.CX + 30, SU.CY + 30); g.stroke();
    s.c.map((c, i) => [c, i]).sort((a, b) => a[0].y - b[0].y).forEach(([c, i]) => {
      if (c.o >= 0 && c.o > 0.8) return;
      const k = c.o >= 0 ? Math.max(0.3, 1 - c.o) : 1.15;
      if (c.d) speedLines(v, c);
      v.catTop(i, c.x, c.y, k, { lookRight: c.f > 0, alpha: c.o >= 0 ? 1 - c.o : 1, tilt: c.z ? Math.sin(v.now / 50) * 0.3 : 0, face: c.o >= 0 ? 'shock' : c.z ? 'dizzy' : c.d ? 'angry' : null });
    });
    roundDots(v, s.w, SU.WIN);
  },
  event(v, e) {
    if (e.type === 'charge') v.mood(e.seat, 'angry', 0.6);
    if (e.type === 'shove') { v.burst(e.x, e.y, '#fff3b0', 12, 260); v.shake(7); v.sound('thud'); v.mood(e.by, 'smug', 1); v.mood(e.to, 'shock', 1); }
    if (e.type === 'out') { v.pop(e.x, e.y - 30, 'OUT!', '#ff5a5a'); v.sound('miss'); v.shake(5); }
    if (e.type === 'round' && e.w >= 0) { v.party.point(e.w === teamOf(v.me)); [0, 1, 2, 3].forEach(i => v.mood(i, teamOf(i) === e.w ? 'happy' : 'sad', 1.6)); }
  },
});
function sumoRound(s) {
  s.t = 0; s.r = SU.R0; s.pause = 0;
  s.c = starts(SU.CX - 120, SU.CX + 120, SU.CY - 60, SU.CY + 60).map(([x, y], i) => Object.assign(newCat(i, x, y), { fall: 0 }));
}

/* ================= LIGHT TRAILS 2 vs 2 ================= */
// Four bikes, always moving, each leaving a solid trail. Hit a wall or any trail and you're out. The last team with a
// bike still riding wins the round; first to 3.
const TR = { CELL: 20, CW: 48, CH: 27, WIN: 3 };
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
D.add('trails2', {
  name: 'Light Trails 2v2', icon: '🏍️',
  how: 'WASD or the arrows to turn. Box them in, and look after your teammate!',
  init() { const s = { wins: [0, 0], round: 1 }; trailsRound(s); return s; },
  step(s, ins, dt, api) {
    if (s.pause > 0) { s.pause -= dt; if (s.pause <= 0) { if (Math.max(...s.wins) >= TR.WIN) api.over(s.wins[0] > s.wins[1] ? 0 : 1, 'First to ' + TR.WIN + ' rounds'); else { s.round++; trailsRound(s); } } return; }
    s.t += dt;
    s.b.forEach((b, i) => {
      if (!b.alive) return;
      const n = ins[i];
      const want = n.held.right ? 0 : n.held.down ? 1 : n.held.left ? 2 : n.held.up ? 3 : -1;
      if (want >= 0 && want !== (b.d + 2) % 4 && want !== b.d) b.next = want;
    });
    s.acc += dt * Math.min(16, 9 + s.t * 0.25);
    while (s.acc >= 1) {
      s.acc -= 1;
      const heads = {};
      s.b.forEach((b, i) => {
        if (!b.alive) return;
        if (b.next >= 0 && b.next !== (b.d + 2) % 4) { if (b.next !== b.d) b.turns.push([b.x, b.y]); b.d = b.next; }
        b.next = -1;
        b.x += DIRS[b.d][0]; b.y += DIRS[b.d][1];
        const k = b.y * TR.CW + b.x;
        if (b.x < 0 || b.y < 0 || b.x >= TR.CW || b.y >= TR.CH || s.g[k]) { b.alive = false; api.ev('crash', { seat: i, x: b.x * TR.CELL + 10, y: b.y * TR.CELL + 10 }); return; }
        if (heads[k] != null) { b.alive = false; const o = s.b[heads[k]]; if (o.alive) { o.alive = false; api.ev('crash', { seat: heads[k], x: b.x * TR.CELL + 10, y: b.y * TR.CELL + 10 }); } api.ev('crash', { seat: i, x: b.x * TR.CELL + 10, y: b.y * TR.CELL + 10 }); return; }
        heads[k] = i;
      });
      s.b.forEach((b, i) => { if (b.alive) s.g[b.y * TR.CW + b.x] = i + 1; });
    }
    const left = [0, 1].map(t => s.b.filter((b, i) => teamOf(i) === t && b.alive).length);
    let w = null;
    if (!left[0] && !left[1]) w = -1; else if (!left[0]) w = 1; else if (!left[1]) w = 0;
    if (w !== null) { if (w >= 0) s.wins[w]++; s.pause = 1.8; api.ev('round', { w }); }
  },
  snap: s => ({
    c: s.b.map(b => ({ x: b.x * TR.CELL + 10, y: b.y * TR.CELL + 10, d: b.d, a: b.alive ? 1 : 0 })),
    tr: s.b.map(b => b.turns.concat([[b.x, b.y]])), st: s.b.map(b => [b.sx, b.sy]), w: s.wins,
  }),
  bot(s, i, dt, api) {
    const b = s.b[i], out = { held: {}, hit: {} };
    if (!b.alive || s.pause > 0) return out;
    // (once a cell: look at each way it could go, and pick the one with the most room)
    const key = b.x + ',' + b.y;
    s.bs = s.bs || {};
    const mem = s.bs[i] || (s.bs[i] = { at: '', d: -1 });
    if (mem.at !== key) {
      mem.at = key;
      let best = -1, bestD = b.d;
      for (const d of [b.d, (b.d + 1) % 4, (b.d + 3) % 4]) {
        const x = b.x + DIRS[d][0], y = b.y + DIRS[d][1];
        let room = roomFrom(s.g, x, y, 90);
        if (d === b.d) room += 3 + (Math.random() < 0.08 * (1 - api.skill) ? -50 : 0);
        // (good bots head for the other team's heads, to cut them off)
        const foe = s.b.find((o, j) => o.alive && teamOf(j) !== teamOf(i));
        if (foe && room > 40) room += 6 * api.skill * (Math.hypot(foe.x - b.x, foe.y - b.y) - Math.hypot(foe.x - x, foe.y - y));
        if (room > best) { best = room; bestD = d; }
      }
      mem.d = bestD;
    }
    out.held[['right', 'down', 'left', 'up'][mem.d]] = true;
    return out;
  },
  draw(v, s) {
    const g = v.g, C = TR.CELL;
    g.fillStyle = '#0b0f24'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(90, 120, 255, .08)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= TR.CW; x++) { g.moveTo(x * C, 0); g.lineTo(x * C, H); }
    for (let y = 0; y <= TR.CH; y++) { g.moveTo(0, y * C); g.lineTo(W, y * C); }
    g.stroke();
    s.c.forEach((b, i) => {
      const col = v.team[teamOf(i)], shade = i % 2 ? col.light : col.main, pts = [s.st[i]].concat(s.tr[i]);
      g.lineCap = 'square'; g.lineJoin = 'miter';
      for (const [lw, a] of [[14, 0.18], [6, 1]]) {
        g.globalAlpha = a * (b.a ? 1 : 0.45); g.strokeStyle = shade; g.lineWidth = lw;
        g.beginPath();
        pts.forEach(([x, y], k) => (k ? g.lineTo(x * C + 10, y * C + 10) : g.moveTo(x * C + 10, y * C + 10)));
        g.stroke();
      }
      g.globalAlpha = 1;
    });
    s.c.forEach((b, i) => { if (b.a) v.catTop(i, b.x, b.y - 6, 0.62, { label: false, lookRight: b.d !== 2, bob: 0.2 }); else v.catTop(i, b.x, b.y - 6, 0.55, { label: false, face: 'ko', alpha: 0.6 }); });
    roundDots(v, s.w, TR.WIN);
  },
  event(v, e) {
    if (e.type === 'crash') { v.burst(e.x, e.y, v.team[teamOf(e.seat)].light, 24, 300); v.ring(e.x, e.y, '#ffffff', 10); v.shake(8); v.sound('boom'); v.mood(e.seat, 'ko', 2); }
    if (e.type === 'round' && e.w >= 0) { v.party.point(e.w === teamOf(v.me)); [0, 1, 2, 3].forEach(i => v.mood(i, teamOf(i) === e.w ? 'happy' : 'sad', 1.6)); }
  },
});
function trailsRound(s) {
  s.t = 0; s.acc = 0; s.pause = 0;
  s.g = new Array(TR.CW * TR.CH).fill(0);
  const sp = [[6, 6, 0], [6, 20, 0], [41, 10, 2], [41, 16, 2]]; // (staggered, so nobody starts head-on)
  s.b = sp.map(([x, y, d], i) => ({ x, y, d, sx: x, sy: y, alive: true, next: -1, turns: [] }));
  s.b.forEach((b, i) => { s.g[b.y * TR.CW + b.x] = i + 1; });
  s.bs = {};
}
// How many empty cells can be reached from (x, y), up to max.
function roomFrom(gr, x, y, max) {
  if (x < 0 || y < 0 || x >= TR.CW || y >= TR.CH || gr[y * TR.CW + x]) return 0;
  const seen = new Set([y * TR.CW + x]), q = [[x, y]];
  for (let h = 0; h < q.length && seen.size < max; h++) {
    const [cx, cy] = q[h];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy, k = ny * TR.CW + nx;
      if (nx < 0 || ny < 0 || nx >= TR.CW || ny >= TR.CH || gr[k] || seen.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen.size;
}

/* ================= AIR HOCKEY 2 vs 2 ================= */
// Each cat has a paddle that follows its mouse (on its own team's half). Knock the puck into the other team's goal.
// First to 5 goals, or the most after 90 seconds.
const HK = { L: 40, R: 920, T: 50, B: 520, GOAL: 190, PR: 30, KR: 16, MAX: 1150, PAD: 950, WIN: 5, LEN: 90 };
D.add('hockey2', {
  name: 'Air Hockey 2v2', icon: '🏒',
  how: 'Move the mouse to move your paddle (or WASD). Score in their goal, and guard yours!',
  init(api) {
    const midY = (HK.T + HK.B) / 2;
    const s = { sc: [0, 0], t: 0, pause: 1, k: { x: W / 2, y: midY, vx: 0, vy: 0 } };
    s.c = [[HK.L + 120, midY - 90], [HK.L + 120, midY + 90], [HK.R - 120, midY - 90], [HK.R - 120, midY + 90]].map(([x, y], i) => Object.assign(newCat(i, x, y), { tx: x, ty: y }));
    return s;
  },
  step(s, ins, dt, api) {
    s.t += dt;
    const midX = W / 2;
    s.c.forEach((c, i) => {
      const n = ins[i], left = teamOf(i) === 0;
      const kd = keyDir(n);
      if (kd[0] || kd[1]) { c.tx = c.x + kd[0] * 120; c.ty = c.y + kd[1] * 120; } else if (n.ax != null) { c.tx = n.ax; c.ty = n.ay; }
      const minX = left ? HK.L + HK.PR : midX + HK.PR, maxX = left ? midX - HK.PR : HK.R - HK.PR;
      const tx = clamp(c.tx, minX, maxX), ty = clamp(c.ty, HK.T + HK.PR, HK.B - HK.PR);
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), step = HK.PAD * dt;
      const px = c.x, py = c.y;
      if (d <= step) { c.x = tx; c.y = ty; } else { c.x += dx / d * step; c.y += dy / d * step; }
      c.vx = (c.x - px) / dt; c.vy = (c.y - py) / dt;
      if (Math.abs(c.vx) > 20) c.f = c.vx > 0 ? 1 : -1;
    });
    if (s.pause > 0) { s.pause -= dt; return; }
    const k = s.k;
    const sub = 4;
    for (let n = 0; n < sub; n++) {
      const h = dt / sub;
      k.x += k.vx * h; k.y += k.vy * h;
      if (k.y < HK.T + HK.KR) { k.y = HK.T + HK.KR; k.vy = Math.abs(k.vy) * 0.9; api.ev('wall', {}); }
      if (k.y > HK.B - HK.KR) { k.y = HK.B - HK.KR; k.vy = -Math.abs(k.vy) * 0.9; api.ev('wall', {}); }
      const inMouth = Math.abs(k.y - (HK.T + HK.B) / 2) < HK.GOAL / 2;
      if (k.x < HK.L + HK.KR) { if (inMouth) { goal(s, 1, api); return; } k.x = HK.L + HK.KR; k.vx = Math.abs(k.vx) * 0.9; api.ev('wall', {}); }
      if (k.x > HK.R - HK.KR) { if (inMouth) { goal(s, 0, api); return; } k.x = HK.R - HK.KR; k.vx = -Math.abs(k.vx) * 0.9; api.ev('wall', {}); }
      s.c.forEach((c, i) => {
        const dx = k.x - c.x, dy = k.y - c.y, d = Math.hypot(dx, dy), min = HK.PR + HK.KR;
        if (d >= min || d < 0.01) return;
        const nx = dx / d, ny = dy / d;
        k.x = c.x + nx * min; k.y = c.y + ny * min;
        const rv = (k.vx - c.vx) * nx + (k.vy - c.vy) * ny;
        if (rv < 0) { k.vx -= 1.9 * rv * nx; k.vy -= 1.9 * rv * ny; if (-rv > 500) api.ev('hit', { seat: i, x: r1(k.x), y: r1(k.y) }); }
        s.lastBy = i;
      });
    }
    const sp = Math.hypot(k.vx, k.vy);
    if (sp > HK.MAX) { k.vx *= HK.MAX / sp; k.vy *= HK.MAX / sp; }
    k.vx *= Math.pow(0.55, dt); k.vy *= Math.pow(0.55, dt);
    if (s.t >= HK.LEN) api.over(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, s.sc[0] + ' to ' + s.sc[1]);
  },
  snap: s => ({ c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f })), k: { x: r1(s.k.x), y: r1(s.k.y) }, sc: s.sc, tm: Math.max(0, Math.ceil(HK.LEN - s.t)) }),
  lerpBall: (a, b, f) => (Math.abs(a.x - b.x) > 200 ? b : { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }),
  bot(s, i, dt, api) {
    const c = s.c[i], k = s.k, left = teamOf(i) === 0, own = left ? HK.L : HK.R, foe = left ? HK.R : HK.L, midY = (HK.T + HK.B) / 2;
    const defender = i % 2 === 1;
    let tx, ty;
    const onMySide = left ? k.x < W / 2 : k.x > W / 2;
    if (defender && !(onMySide && Math.abs(k.x - own) < 260)) { tx = own + (left ? 70 : -70); ty = clamp(midY + (k.y - midY) * 0.6, midY - HK.GOAL / 2, midY + HK.GOAL / 2); }
    else {
      // get behind the puck (on the side away from their goal), then hit it at their goal
      const gx = foe - k.x, gy = midY - k.y, gl = Math.hypot(gx, gy) || 1;
      const behindX = k.x - gx / gl * 34, behindY = k.y - gy / gl * 34;
      const lined = Math.hypot(c.x - behindX, c.y - behindY) < 30;
      tx = lined ? k.x + gx / gl * 30 : behindX; ty = lined ? k.y + gy / gl * 30 : behindY;
      tx += (Math.random() - 0.5) * 40 * (1 - api.skill);
    }
    return { held: {}, hit: {}, ax: tx, ay: ty };
  },
  draw(v, s) {
    const g = v.g, midY = (HK.T + HK.B) / 2;
    g.fillStyle = '#16233f'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8f4ff'; v.roundRect(HK.L - 10, HK.T - 10, HK.R - HK.L + 20, HK.B - HK.T + 20, 26); g.fill();
    g.fillStyle = '#f7fbff'; v.roundRect(HK.L, HK.T, HK.R - HK.L, HK.B - HK.T, 18); g.fill();
    g.strokeStyle = 'rgba(255, 70, 70, .5)'; g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2, HK.T); g.lineTo(W / 2, HK.B); g.stroke();
    g.beginPath(); g.arc(W / 2, midY, 60, 0, TAU); g.stroke();
    [0, 1].forEach(t => {
      const x = t ? HK.R : HK.L;
      g.fillStyle = v.team[t].main; g.fillRect(x - (t ? 0 : 10), midY - HK.GOAL / 2, 10, HK.GOAL);
      g.strokeStyle = v.team[t].light; g.globalAlpha = 0.5; g.lineWidth = 3; g.beginPath(); g.arc(x, midY, HK.GOAL / 2 + 20, t ? Math.PI / 2 : -Math.PI / 2, t ? Math.PI * 1.5 : Math.PI / 2); g.stroke(); g.globalAlpha = 1;
    });
    s.c.forEach((c, i) => {
      const col = v.team[teamOf(i)];
      g.fillStyle = 'rgba(0,0,0,.18)'; v.dot(c.x + 3, c.y + 5, HK.PR);
      g.fillStyle = col.dark; v.dot(c.x, c.y, HK.PR);
      g.fillStyle = i % 2 ? col.light : col.main; v.dot(c.x, c.y, HK.PR - 6);
      v.catTop(i, c.x, c.y - 6, 0.62, { label: false, lookRight: c.f > 0, bob: 0.3 });
      if (i === v.me) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, HK.PR + 4, 0, TAU); g.stroke(); }
    });
    g.fillStyle = 'rgba(0,0,0,.2)'; v.dot(s.k.x + 2, s.k.y + 4, HK.KR);
    g.fillStyle = '#222'; v.dot(s.k.x, s.k.y, HK.KR);
    g.fillStyle = '#555'; v.dot(s.k.x, s.k.y, HK.KR - 5);
    v.label(s.sc[0] + '  :  ' + s.sc[1], W / 2, 34, 22, '#ffffff');
    v.label(s.tm + 's', W / 2, HK.B + 14, 13, 'rgba(255,255,255,.7)');
  },
  event(v, e) {
    if (e.type === 'hit') { v.burst(e.x, e.y, '#ffffff', 6, 180); v.sound('tick'); v.mood(e.seat, 'angry', 0.5); }
    if (e.type === 'goal') { v.party.point(e.t === teamOf(v.me)); v.shake(10); v.sound('point'); v.pop(e.t ? 120 : W - 120, 270, 'GOAL!', v.team[e.t].light); [0, 1, 2, 3].forEach(i => v.mood(i, teamOf(i) === e.t ? 'happy' : 'sad', 1.8)); }
  },
});
function goal(s, t, api) {
  s.sc[t]++;
  api.ev('goal', { t });
  s.k = { x: W / 2 + (t ? 60 : -60), y: (HK.T + HK.B) / 2, vx: 0, vy: 0 };
  s.pause = 1.2;
  if (s.sc[t] >= HK.WIN) api.over(t, 'First to ' + HK.WIN + ' goals');
}

/* ================= TURF WAR 2 vs 2 ================= */
// Paint the floor your team's color: you paint wherever you walk, and holding the mouse button sprays a cone of paint
// at the pointer (it runs out; it refills when you stop). Spray a cat of the other team to splat them for a moment.
// Space dashes. The team with more floor after 50 seconds wins.
const PT = { CELL: 24, GW: 40, GH: 21, Y0: 18, SPEED: 205, INK: 100, LEN: 50, RANGE: 150 };
D.add('paint2', {
  name: 'Turf War 2v2', icon: '🎨',
  how: 'WASD to move (you paint as you go), hold the mouse to spray, Space to dash. Most floor wins!',
  init() {
    const s = { t: 0, g: new Array(PT.GW * PT.GH).fill(0) };
    s.c = starts(90, W - 90, PT.Y0 + 160, PT.Y0 + 340).map(([x, y], i) => Object.assign(newCat(i, x, y), { ink: PT.INK, spray: false, ax: x + 1, ay: y, splat: 0 }));
    return s;
  },
  step(s, ins, dt, api) {
    s.t += dt;
    s.c.forEach((c, i) => {
      const n = ins[i], team = teamOf(i) + 1;
      c.dashT = Math.max(0, c.dashT - dt); c.dashCd = Math.max(0, c.dashCd - dt); c.splat = Math.max(0, c.splat - dt);
      const under = s.g[cellAt(c.x, c.y)];
      const sp = PT.SPEED * (under === team ? 1.2 : under ? 0.8 : 1);
      const dir = c.splat > 0 ? [0, 0] : keyDir(n);
      if (c.dashT <= 0) drive(c, dir, dt, sp, 10);
      if (n.hit.a && c.dashCd <= 0 && c.splat <= 0) { const d = dir[0] || dir[1] ? dir : [c.f, 0]; c.vx = d[0] * 520; c.vy = d[1] * 520; c.dashT = 0.2; c.dashCd = 2; }
      c.x = clamp(c.x + c.vx * dt, 14, W - 14); c.y = clamp(c.y + c.vy * dt, PT.Y0 + 14, PT.Y0 + PT.GH * PT.CELL - 6);
      c.ax = n.ax; c.ay = n.ay;
      paintRound(s, c.x, c.y, 22, team);
      c.spray = !!n.held.fire && c.ink > 4 && c.splat <= 0;
      if (c.spray) {
        c.ink = Math.max(0, c.ink - 38 * dt);
        const a = Math.atan2(c.ay - c.y, c.ax - c.x);
        if (Math.abs(Math.cos(a)) > 0.2) c.f = Math.cos(a) > 0 ? 1 : -1;
        for (let r = 30; r <= PT.RANGE; r += 18) for (const da of [-0.32, -0.16, 0, 0.16, 0.32]) paintRound(s, c.x + Math.cos(a + da) * r, c.y + Math.sin(a + da) * r, 10, team);
        s.c.forEach((o, j) => {
          if (teamOf(j) === teamOf(i) || o.splat > 0) return;
          const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy);
          if (d > PT.RANGE + 10) return;
          let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) < 0.38) { o.hits = (o.hits || 0) + dt * 3; if (o.hits >= 1) { o.hits = 0; o.splat = 1.6; o.vx = dx / d * 300; o.vy = dy / d * 300; paintRound(s, o.x, o.y, 54, team); api.ev('splat', { seat: j, by: i, x: r1(o.x), y: r1(o.y) }); } }
        });
      } else c.ink = Math.min(PT.INK, c.ink + (under === team ? 40 : 22) * dt);
    });
    bump(s.c, 18, api);
    if (s.t >= PT.LEN) {
      const n = countTurf(s.g);
      api.over(n[0] === n[1] ? -1 : n[0] > n[1] ? 0 : 1, Math.round(n[0] / s.g.length * 100) + '% to ' + Math.round(n[1] / s.g.length * 100) + '%');
    }
  },
  snap: s => ({ c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, sp: c.spray ? 1 : 0, ax: Math.round(c.ax), ay: Math.round(c.ay), ink: Math.round(c.ink), sl: c.splat > 0 ? 1 : 0, d: c.dashT > 0 ? 1 : 0, vx: Math.round(c.vx), vy: Math.round(c.vy) })), g: rle(s.g), tm: Math.max(0, Math.ceil(PT.LEN - s.t)) }),
  bot(s, i, dt, api) {
    const c = s.c[i], team = teamOf(i) + 1, out = { held: {}, hit: {}, ax: c.x + c.f * 50, ay: c.y };
    s.bs = s.bs || {};
    const b = s.bs[i] || (s.bs[i] = { t: 0, tx: c.x, ty: c.y });
    b.t -= dt;
    if (b.t <= 0 || Math.hypot(b.tx - c.x, b.ty - c.y) < 20) {
      b.t = 1 + Math.random();
      let best = -1;
      for (let k = 0; k < 14; k++) {
        const x = 40 + Math.random() * (W - 80), y = PT.Y0 + 30 + Math.random() * (PT.GH * PT.CELL - 60);
        let v = 0;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const g = s.g[cellAt(x + dx * PT.CELL, y + dy * PT.CELL)]; v += g === team ? 0 : g ? 2 : 1; }
        v -= Math.hypot(x - c.x, y - c.y) / 60;
        if (v > best) { best = v; b.tx = x; b.ty = y; }
      }
    }
    out.held = toward(c, b.tx, b.ty, 10);
    const foe = s.c.filter((o, j) => teamOf(j) !== teamOf(i) && o.splat <= 0).sort((p, q) => dist(p, c) - dist(q, c))[0];
    if (foe && dist(foe, c) < PT.RANGE && c.ink > 15) { out.ax = foe.x + (Math.random() - 0.5) * 60 * (1 - api.skill); out.ay = foe.y; out.held.fire = true; }
    else if (c.ink > 60) { out.ax = b.tx; out.ay = b.ty; out.held.fire = Math.random() < 0.9; }
    if (Math.random() < dt * 0.3) out.hit.a = true;
    return out;
  },
  draw(v, s) {
    const g = v.g, C = PT.CELL;
    g.fillStyle = '#1d2433'; g.fillRect(0, 0, W, H);
    const cells = unrle(s.g, PT.GW * PT.GH);
    for (let y = 0; y < PT.GH; y++) for (let x = 0; x < PT.GW; x++) {
      const o = cells[y * PT.GW + x];
      g.fillStyle = o === 1 ? v.team[0].main : o === 2 ? v.team[1].main : (x + y) % 2 ? '#e9edf3' : '#dfe4ec';
      g.fillRect(x * C, PT.Y0 + y * C, C + 0.5, C + 0.5);
    }
    s.c.forEach((c, i) => {
      if (c.sp) { // the spray: a cone of drops
        const a = Math.atan2(c.ay - c.y, c.ax - c.x), col = v.team[teamOf(i)];
        g.fillStyle = col.light; g.globalAlpha = 0.35;
        g.beginPath(); g.moveTo(c.x, c.y); g.arc(c.x, c.y, PT.RANGE, a - 0.35, a + 0.35); g.closePath(); g.fill();
        g.globalAlpha = 1; g.fillStyle = col.main;
        for (let k = 0; k < 6; k++) { const r = 30 + ((v.now / 3 + k * 23) % (PT.RANGE - 30)), da = Math.sin(k * 7 + v.now / 90) * 0.3; v.dot(c.x + Math.cos(a + da) * r, c.y + Math.sin(a + da) * r, 4); }
      }
      if (c.d) speedLines(v, c);
      v.catTop(i, c.x, c.y, 1, { lookRight: c.f > 0, face: c.sl ? 'dizzy' : c.sp ? 'squint' : null, alpha: c.sl ? 0.6 : 1 });
      g.fillStyle = 'rgba(0,0,0,.35)'; v.roundRect(c.x - 18, c.y - 32, 36, 5, 2); g.fill();
      g.fillStyle = v.team[teamOf(i)].light; v.roundRect(c.x - 18, c.y - 32, 36 * c.ink / PT.INK, 5, 2); g.fill();
    });
    const n = countTurf(cells), tot = cells.length, bw = 360;
    g.fillStyle = 'rgba(0,0,0,.45)'; v.roundRect(W / 2 - bw / 2 - 4, 0, bw + 8, 16, 6); g.fill();
    g.fillStyle = v.team[0].main; g.fillRect(W / 2 - bw / 2, 3, bw * n[0] / tot, 10);
    g.fillStyle = v.team[1].main; g.fillRect(W / 2 + bw / 2 - bw * n[1] / tot, 3, bw * n[1] / tot, 10);
    v.label(Math.round(n[0] / tot * 100) + '%', W / 2 - bw / 2 - 30, 12, 13, v.team[0].light);
    v.label(Math.round(n[1] / tot * 100) + '%', W / 2 + bw / 2 + 30, 12, 13, v.team[1].light);
    v.label(s.tm + 's', W / 2, H - 6, 13, 'rgba(255,255,255,.8)');
  },
  event(v, e) {
    if (e.type === 'splat') { v.burst(e.x, e.y, v.team[teamOf(e.by)].main, 26, 300); v.pop(e.x, e.y - 30, 'SPLAT!', v.team[teamOf(e.by)].light); v.shake(6); v.sound('boom'); v.mood(e.seat, 'hurt', 1.6); v.mood(e.by, 'smug', 1.2); }
  },
});
const cellAt = (x, y) => clamp(Math.floor((y - PT.Y0) / PT.CELL), 0, PT.GH - 1) * PT.GW + clamp(Math.floor(x / PT.CELL), 0, PT.GW - 1);
function paintRound(s, x, y, r, team) {
  const C = PT.CELL;
  for (let gy = Math.floor((y - PT.Y0 - r) / C); gy <= Math.floor((y - PT.Y0 + r) / C); gy++) for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++) {
    if (gx < 0 || gy < 0 || gx >= PT.GW || gy >= PT.GH) continue;
    const cx = gx * C + C / 2, cy = PT.Y0 + gy * C + C / 2;
    if (Math.hypot(cx - x, cy - y) <= r + C * 0.35) s.g[gy * PT.GW + gx] = team;
  }
}
const countTurf = gr => { const n = [0, 0]; for (const o of gr) if (o) n[o - 1]++; return n; };
// (the floor, squeezed: "1a2c0z…" is runs of the same color, each a color and a count in base 36)
function rle(gr) {
  let out = '', k = 0;
  while (k < gr.length) { let n = 1; while (k + n < gr.length && gr[k + n] === gr[k] && n < 35) n++; out += gr[k] + n.toString(36); k += n; }
  return out;
}
function unrle(str, len) {
  if (Array.isArray(str)) return str;
  const out = [];
  for (let k = 0; k + 1 < str.length; k += 2) { const c = +str[k], n = parseInt(str[k + 1], 36) || 1; for (let j = 0; j < n; j++) out.push(c); }
  while (out.length < len) out.push(0);
  return out;
}

/* ================= BOX KING 2 vs 2 ================= */
// A big cardboard box in the middle of the room. Your team scores while one of you is in it and nobody from the other
// team is. Space is a shove: dash into a cat of the other team to knock them back and daze them for a moment. First
// team to 20 seconds in the box, or the most after 75.
const BX = { X: 380, Y: 180, W: 200, H: 180, SPEED: 225, NEED: 20, LEN: 75 };
D.add('box2', {
  name: 'Box King 2v2', icon: '📦',
  how: 'WASD to move, Space to shove. Hold the box with your team: nobody else in it!',
  init() {
    const s = { t: 0, sc: [0, 0], hold: -1 };
    s.c = starts(110, W - 110, 170, 370).map(([x, y], i) => newCat(i, x, y));
    return s;
  },
  step(s, ins, dt, api) {
    s.t += dt;
    s.c.forEach((c, i) => {
      const n = ins[i];
      c.dashT = Math.max(0, c.dashT - dt); c.dashCd = Math.max(0, c.dashCd - dt); c.daze = Math.max(0, c.daze - dt);
      const dir = c.daze > 0 ? [0, 0] : keyDir(n);
      if (c.dashT <= 0) drive(c, dir, dt, BX.SPEED, 9);
      if (n.hit.a && c.dashCd <= 0 && c.daze <= 0) { const d = dir[0] || dir[1] ? dir : [c.f, 0]; c.vx = d[0] * 600; c.vy = d[1] * 600; c.dashT = 0.2; c.dashCd = 1.4; api.ev('dash', { seat: i }); }
      c.x = clamp(c.x + c.vx * dt, 20, W - 20); c.y = clamp(c.y + c.vy * dt, 40, H - 20);
      if (c.dashT <= 0 && c.daze > 0) { c.vx *= Math.pow(0.05, dt); c.vy *= Math.pow(0.05, dt); }
    });
    bump(s.c, 20, api, (p, q, nx, ny) => {
      const a = p.dashT > 0 ? p : q.dashT > 0 ? q : null;
      if (!a) return;
      const b = a === p ? q : p, sgn = a === p ? 1 : -1;
      if (teamOf(a.seat) === teamOf(b.seat) || b.daze > 0) return;
      b.vx = nx * sgn * 460; b.vy = ny * sgn * 460; b.daze = 0.7; a.dashT = 0;
      api.ev('shove', { x: r1(b.x), y: r1(b.y), by: a.seat, to: b.seat });
    });
    const inBox = c => c.x > BX.X && c.x < BX.X + BX.W && c.y > BX.Y && c.y < BX.Y + BX.H;
    const there = [0, 1].map(t => s.c.some(c => teamOf(c.seat) === t && inBox(c)));
    const hold = there[0] && !there[1] ? 0 : there[1] && !there[0] ? 1 : there[0] ? -2 : -1;
    if (hold !== s.hold) { s.hold = hold; if (hold >= 0) api.ev('take', { t: hold }); }
    if (hold >= 0) s.sc[hold] += dt;
    if (s.sc[0] >= BX.NEED || s.sc[1] >= BX.NEED) api.over(s.sc[0] >= BX.NEED ? 0 : 1, 'First to ' + BX.NEED + ' seconds in the box');
    else if (s.t >= BX.LEN) api.over(Math.abs(s.sc[0] - s.sc[1]) < 0.05 ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, 'Most time in the box');
  },
  snap: s => ({ c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, d: c.dashT > 0 ? 1 : 0, z: c.daze > 0 ? 1 : 0, vx: Math.round(c.vx), vy: Math.round(c.vy) })), sc: s.sc.map(r1), h: s.hold, tm: Math.max(0, Math.ceil(BX.LEN - s.t)) }),
  bot(s, i, dt, api) {
    const c = s.c[i], out = { held: {}, hit: {} }, mine = teamOf(i);
    const bx = BX.X + BX.W / 2, by = BX.Y + BX.H / 2;
    const foesIn = s.c.filter(o => teamOf(o.seat) !== mine && o.x > BX.X - 30 && o.x < BX.X + BX.W + 30 && o.y > BX.Y - 30 && o.y < BX.Y + BX.H + 30);
    const target = foesIn.sort((p, q) => dist(p, c) - dist(q, c))[0];
    if (target) {
      out.held = toward(c, target.x, target.y, 6);
      if (dist(c, target) < 80 && c.dashCd <= 0 && Math.random() < dt * 6 * (0.4 + api.skill)) out.hit.a = true;
    } else {
      const off = i % 2 ? 40 : -40;
      out.held = toward(c, bx + off, by + (i % 2 ? 30 : -30), 14);
    }
    return out;
  },
  draw(v, s) {
    const g = v.g;
    g.fillStyle = '#c8a27a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120, 80, 40, .25)'; g.lineWidth = 2;
    for (let y = 0; y < H; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // the box, open at the top: flaps out on each side
    const glow = s.h >= 0 ? v.team[s.h].main : s.h === -2 ? '#ffffff' : null;
    g.fillStyle = '#a8743f';
    g.beginPath(); g.moveTo(BX.X, BX.Y); g.lineTo(BX.X + 30, BX.Y - 34); g.lineTo(BX.X + BX.W - 30, BX.Y - 34); g.lineTo(BX.X + BX.W, BX.Y); g.fill();
    g.beginPath(); g.moveTo(BX.X, BX.Y + BX.H); g.lineTo(BX.X + 30, BX.Y + BX.H + 34); g.lineTo(BX.X + BX.W - 30, BX.Y + BX.H + 34); g.lineTo(BX.X + BX.W, BX.Y + BX.H); g.fill();
    g.fillStyle = '#7a4f24'; g.fillRect(BX.X, BX.Y, BX.W, BX.H);
    g.fillStyle = '#93622f'; g.fillRect(BX.X + 8, BX.Y + 8, BX.W - 16, BX.H - 16);
    if (glow) { g.strokeStyle = glow; g.lineWidth = 6; g.globalAlpha = 0.6 + 0.3 * Math.sin(v.now / 150); g.strokeRect(BX.X - 3, BX.Y - 3, BX.W + 6, BX.H + 6); g.globalAlpha = 1; }
    v.label(s.h === -2 ? 'CONTESTED!' : '📦', BX.X + BX.W / 2, BX.Y + BX.H / 2 + 6, s.h === -2 ? 18 : 30, '#ffffff', 0.5);
    s.c.map((c, i) => [c, i]).sort((a, b) => a[0].y - b[0].y).forEach(([c, i]) => {
      if (c.d) speedLines(v, c);
      v.catTop(i, c.x, c.y, 1.05, { lookRight: c.f > 0, tilt: c.z ? Math.sin(v.now / 50) * 0.3 : 0, face: c.z ? 'dizzy' : c.d ? 'angry' : null });
      if (c.z) v.label('💫', c.x, c.y - 36, 16, '#fff');
    });
    // each team's time in the box
    [0, 1].forEach(t => {
      const x = t ? W - 250 : 30, f = Math.min(1, s.sc[t] / BX.NEED);
      g.fillStyle = 'rgba(0,0,0,.35)'; v.roundRect(x, 10, 220, 18, 8); g.fill();
      g.fillStyle = v.team[t].main; v.roundRect(x, 10, 220 * f, 18, 8); g.fill();
      v.label(v.team[t].name + ' ' + s.sc[t].toFixed(1) + 's' + (s.h === t ? ' 👑' : ''), x + 110, 24, 13, '#ffffff');
    });
    v.label(s.tm + 's', W / 2, 24, 14, '#ffffff');
  },
  event(v, e) {
    if (e.type === 'dash') v.mood(e.seat, 'angry', 0.5);
    if (e.type === 'shove') { v.burst(e.x, e.y, '#fff3b0', 12, 240); v.pop(e.x, e.y - 30, 'BONK!', '#ffd23f'); v.shake(6); v.sound('thud'); v.mood(e.to, 'dizzy', 0.8); v.mood(e.by, 'smug', 1); }
    if (e.type === 'take') { v.sound('tick'); [0, 1, 2, 3].forEach(i => v.mood(i, teamOf(i) === e.t ? 'happy' : 'shock', 0.9)); }
  },
});

})();
