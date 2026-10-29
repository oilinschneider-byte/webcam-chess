/* Classic Games: Cat and Mouse. A maze; one player is the cat, the other the mouse. The cat is a little faster, but
   the mouse's dash comes back sooner. When the cat catches the mouse (or 45 seconds pass), the players swap and play
   the same maze from the same spots again. Whoever survived longer as the mouse wins. (The host's app runs the
   chase: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const CW = 23, CH = 13, TILE = 40, X0 = (W - CW * TILE) / 2, Y0 = (H - CH * TILE) / 2;
const R = 13;
const SPEED = { cat: 172, mouse: 158 }, DASH = 2.2, DASH_TIME = 0.25, DASH_WAIT = { cat: 3, mouse: 1.6 };
const ROUND = 45;
const START = { mouse: [0, CH - 1], cat: [CW - 1, 4] };      // (the same spots in both rounds, clear of the camera walls)
// The cells under the camera walls (the top corners: see cam-walls.js) aren't part of the maze.
const BLOCKED = (x, y) => y <= 3 && (x <= 3 || x >= CW - 4);
const center = (cx, cy) => [X0 + (cx + 0.5) * TILE, Y0 + (cy + 0.5) * TILE];

CA.games.add('mouse', {
  name: 'Cat and Mouse', icon: '🐭',
  blurb: 'One of you is the cat, the other the mouse: then you swap! The cat is faster, but the mouse dashes more often (Space). Whoever survives longer as the mouse wins.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'mouse',
      pad: { stick: true, buttons: [{ k: 'a', label: '💨 Dash', main: true }] },
      help: 'WASD move · Space dash · as the mouse, survive · as the cat, catch!',
      helpTouch: 'Stick moves · Dash · as the mouse, survive · as the cat, catch!',
      note: 'Survive longer as the mouse',
      init, step, snap, bot, draw, event,
    });
  },
});

// A maze from the match's seed: every cell is reached, with some extra openings so there are loops to hide in.
// Each cell: bit 1 = wall on its right, bit 2 = wall below.
function makeMaze(rng) {
  const m = new Array(CW * CH).fill(3), seen = new Array(CW * CH).fill(false).map((v, k) => BLOCKED(k % CW, Math.floor(k / CW)));
  const stack = [[0, CH - 1]];
  seen[(CH - 1) * CW] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < CW && ny < CH && !seen[ny * CW + nx]);
    if (!next.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = next[Math.floor(rng() * next.length)];
    open(m, x, y, dx, dy);
    seen[ny * CW + nx] = true;
    stack.push([nx, ny]);
  }
  for (let k = 0; k < 70; k++) { // loops
    const x = Math.floor(rng() * (CW - 1)), y = Math.floor(rng() * (CH - 1));
    if (BLOCKED(x, y) || BLOCKED(x + 1, y) || BLOCKED(x, y + 1)) continue;
    open(m, x, y, rng() < 0.5 ? 1 : 0, 0);
    open(m, x, y, 0, rng() < 0.5 ? 1 : 0);
  }
  return m;
}
function open(m, x, y, dx, dy) {
  if (dx === 1) m[y * CW + x] &= ~1;
  if (dx === -1) m[y * CW + x - 1] &= ~1;
  if (dy === 1) m[y * CW + x] &= ~2;
  if (dy === -1) m[(y - 1) * CW + x] &= ~2;
}
function wallsOf(m) {
  const w = [[X0, Y0, X0 + CW * TILE, Y0], [X0, Y0, X0, Y0 + CH * TILE], [X0 + CW * TILE, Y0, X0 + CW * TILE, Y0 + CH * TILE], [X0, Y0 + CH * TILE, X0 + CW * TILE, Y0 + CH * TILE]];
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const c = m[y * CW + x], px = X0 + x * TILE, py = Y0 + y * TILE;
    if (c & 1 && x < CW - 1 && !(BLOCKED(x, y) && BLOCKED(x + 1, y))) w.push([px + TILE, py, px + TILE, py + TILE]);
    if (c & 2 && y < CH - 1 && !(BLOCKED(x, y) && BLOCKED(x, y + 1))) w.push([px, py + TILE, px + TILE, py + TILE]);
  }
  return w;
}
// Can you go from cell (x, y) one step in (dx, dy)?
function canGo(m, x, y, dx, dy) {
  const nx = x + dx, ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) return false;
  if (dx === 1) return !(m[y * CW + x] & 1);
  if (dx === -1) return !(m[y * CW + nx] & 1);
  if (dy === 1) return !(m[y * CW + x] & 2);
  return !(m[ny * CW + x] & 2);
}
// How many steps from (x, y) to every cell.
function distances(m, x, y) {
  const d = new Array(CW * CH).fill(-1);
  d[y * CW + x] = 0;
  const q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!canGo(m, cx, cy, dx, dy)) continue;
      const k = (cy + dy) * CW + cx + dx;
      if (d[k] < 0) { d[k] = d[cy * CW + cx] + 1; q.push([cx + dx, cy + dy]); }
    }
  }
  return d;
}
const cellOf = (x, y) => [Math.max(0, Math.min(CW - 1, Math.floor((x - X0) / TILE))), Math.max(0, Math.min(CH - 1, Math.floor((y - Y0) / TILE)))];

function init(api) {
  const maze = makeMaze(api.rng);
  const s = { maze, mz: maze.join(''), walls: wallsOf(maze), round: 0, times: [null, null], phase: 'chase', pause: 0, t: 0, movers: [] };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.t = 0;
  s.phase = 'chase';
  const mouseI = s.round === 1 ? 0 : 1;
  s.mouseI = mouseI;
  s.movers = [0, 1].map(i => {
    const role = i === mouseI ? 'mouse' : 'cat';
    const [x, y] = center(...START[role]);
    return { role, x, y, vx: 0, vy: 0, dash: 0, wait: 0.5, fx: 1 };
  });
  api.ev('round', { m: mouseI });
}

function step(s, inp, dt, api) {
  if (s.phase === 'pause') {
    s.pause -= dt;
    if (s.pause <= 0) {
      if (s.round === 1) newRound(s, api);
      else {
        const [a, b] = s.times;
        api.end(Math.abs(a - b) < 0.05 ? -1 : a > b ? 0 : 1, 'CAUGHT!');
      }
    }
    return;
  }
  s.t += dt;
  s.movers.forEach((c, i) => {
    const n = inp[i];
    c.wait = Math.max(0, c.wait - dt);
    if (n.hit.a && c.wait <= 0) { c.dash = DASH_TIME; c.wait = DASH_WAIT[c.role]; api.ev('dash', { x: c.x, y: c.y }); }
    const sp = SPEED[c.role] * (c.dash > 0 ? DASH : 1) * (n.slow || 1);
    c.dash = Math.max(0, c.dash - dt);
    c.vx = n.mx * sp;
    c.vy = n.my * sp;
    if (n.mx) c.fx = Math.sign(n.mx);
    for (let k = 0; k < 2; k++) {
      c.x += c.vx * dt / 2;
      c.y += c.vy * dt / 2;
      for (const [x1, y1, x2, y2] of s.walls) {
        const p = CA.duel.nearest(c.x, c.y, x1, y1, x2, y2);
        if (p.d >= R + 2) continue;
        const nx = (c.x - p.x) / (p.d || 1), ny = (c.y - p.y) / (p.d || 1);
        c.x = p.x + nx * (R + 2.01);
        c.y = p.y + ny * (R + 2.01);
      }
    }
  });
  const [a, b] = s.movers;
  const caught = Math.hypot(a.x - b.x, a.y - b.y) < R * 2 - 2;
  if (caught || s.t >= ROUND) {
    const m = s.movers[s.mouseI];
    s.times[s.mouseI] = Math.min(ROUND, s.t);
    api.score(Math.floor(s.times[0] || 0), Math.floor(s.times[1] || 0));
    api.ev(caught ? 'caught' : 'safe', { x: m.x, y: m.y, m: s.mouseI, t: Math.round(s.t * 10) / 10 });
    s.phase = 'pause';
    s.pause = 2.2;
  }
}

function snap(s) {
  return {
    mz: s.mz, rd: s.round, mi: s.mouseI, t: Math.round(s.t * 10) / 10, ph: s.phase, tm: s.times.map(v => (v == null ? -1 : Math.round(v * 10) / 10)),
    c: s.movers.map(c => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, r: c.role === 'cat' ? 1 : 0, d: c.dash > 0 ? 1 : 0, f: c.fx, w: Math.round(c.wait * 10) / 10 })),
  };
}

// The bot finds its way through the maze: as the cat, along the shortest way to the mouse; as the mouse, to the
// nearby spot that's furthest (by the maze) from the cat. Easy bots think slower and walk a bit slower.
function bot(s, i, dt, api) {
  const st = s.bs || (s.bs = { think: 0, tx: 0, ty: 0, dash: false });
  if (s.phase !== 'chase') return {};
  const me = s.movers[i], them = s.movers[1 - i];
  st.think -= dt;
  if (st.think <= 0) {
    st.think = 0.1 + (1 - api.skill) * 0.25;
    const [mx, my] = cellOf(me.x, me.y), [ox, oy] = cellOf(them.x, them.y);
    let goal;
    if (me.role === 'cat') {
      const d = distances(s.maze, ox, oy);
      goal = [mx, my];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (canGo(s.maze, mx, my, dx, dy) && d[(my + dy) * CW + mx + dx] < d[goal[1] * CW + goal[0]]) goal = [mx + dx, my + dy];
      if (goal[0] === mx && goal[1] === my) { st.tx = them.x; st.ty = them.y; } else [st.tx, st.ty] = center(...goal);
      st.dash = d[my * CW + mx] <= 2 && Math.random() < 0.3 + 0.6 * api.skill;
    } else {
      const dc = distances(s.maze, ox, oy), dm = distances(s.maze, mx, my);
      let best = -1e9;
      goal = [mx, my];
      for (let k = 0; k < CW * CH; k++) {
        if (dm[k] < 0 || dm[k] > 6) continue;
        const score = dc[k] * 2 - dm[k] * 0.5 + (Math.random() - 0.5) * (1 - api.skill) * 6;
        if (score > best && dc[k] > dm[k]) { best = score; goal = [k % CW, Math.floor(k / CW)]; }
      }
      // first step towards that spot
      const dg = distances(s.maze, goal[0], goal[1]);
      let next = [mx, my];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (canGo(s.maze, mx, my, dx, dy) && dg[(my + dy) * CW + mx + dx] < dg[next[1] * CW + next[0]]) next = [mx + dx, my + dy];
      [st.tx, st.ty] = center(...next);
      st.dash = dc[my * CW + mx] <= 2 && Math.random() < 0.4 + 0.5 * api.skill;
    }
  }
  const dx = st.tx - me.x, dy = st.ty - me.y, d = Math.hypot(dx, dy);
  const out = { mx: d > 3 ? dx / d : 0, my: d > 3 ? dy / d : 0, slow: 0.85 + 0.15 * api.skill, hit: {} };
  if (st.dash && me.wait <= 0) { out.hit.a = true; st.dash = false; }
  return out;
}

function event(v, e) {
  if (e.type === 'dash') v.sound([[640, 0, 0.04], [460, 0.03, 0.05]]);
  if (e.type === 'caught') { v.burst(e.x, e.y, '#ffd23f', 22, 300); v.pop(e.x, e.y - 30, 'CAUGHT! ' + e.t + 's', '#ff5a5a'); v.shake(10); v.sound(e.m === v.me ? 'miss' : 'point'); }
  if (e.type === 'safe') { v.pop(e.x, e.y - 30, 'SURVIVED!', '#7dff8a'); v.sound(e.m === v.me ? 'win' : 'miss'); }
  if (e.type === 'round') { v.sound('notify'); v.note(e.m === v.me ? 'Round ' + (e.m + 1) + ': you are the mouse 🐭' : 'Round ' + (e.m + 1) + ': you are the cat 🐱'); }
}

let art = { key: '', c: null };
function mazeArt(mz) {
  if (art.key === mz) return art.c;
  const m = mz.split('').map(Number), c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  b.fillStyle = '#3b2a20';
  b.fillRect(0, 0, W, H);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    b.fillStyle = (x + y) % 2 ? '#e9dcc3' : '#f1e6d0'; // a checked kitchen floor
    b.fillRect(X0 + x * TILE, Y0 + y * TILE, TILE, TILE);
  }
  b.strokeStyle = '#6b4a2f';
  b.lineWidth = 6;
  b.lineCap = 'round';
  b.beginPath();
  wallsOf(m).forEach(([x1, y1, x2, y2]) => { b.moveTo(x1, y1); b.lineTo(x2, y2); });
  b.stroke();
  b.strokeStyle = '#a7774c';
  b.lineWidth = 2;
  b.stroke();
  b.fillStyle = 'rgba(255, 210, 63, .4)';
  b.font = '20px sans-serif';
  b.textAlign = 'center';
  b.textBaseline = 'middle';
  b.fillText('🧀', ...center(...START.mouse));
  art = { key: mz, c };
  return c;
}

function drawMouse(v, i, x, y, f) {
  const g = v.g;
  g.fillStyle = 'rgba(0, 0, 0, .2)';
  g.beginPath(); g.ellipse(x, y + 10, 14, 5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = v.team[i].main;
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#d58fa3'; // tail
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - f * 10, y + 4); g.quadraticCurveTo(x - f * 22, y + 2, x - f * 20, y - 10); g.stroke();
  g.fillStyle = '#9aa0ad';
  g.beginPath(); g.ellipse(x, y + 2, 12, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b6bcc8';
  v.dot(x + f * 6, y - 6, 7);
  g.fillStyle = '#f2b6c6';
  v.dot(x + f * 2, y - 13, 4);
  v.dot(x + f * 10, y - 12, 4);
  g.fillStyle = '#222';
  v.dot(x + f * 9, y - 6, 1.6);
  v.dot(x + f * 12, y - 4, 1.4);
  v.label(i === v.me ? 'You 🐭' : v.names[i] + ' 🐭', x, y + 26, 11, i === v.me ? '#ffd23f' : '#ffffff');
}

function draw(v, s) {
  const g = v.g;
  g.drawImage(mazeArt(s.mz), 0, 0, W, H);
  s.c.forEach((c, i) => {
    if (c.d) { g.globalAlpha = 0.35; g.fillStyle = v.team[i].light; v.dot(c.x - c.f * 12, c.y, 14); g.globalAlpha = 1; }
    if (c.r) v.catTop(i, c.x, c.y - 2, 0.85, { lookRight: c.f >= 0 });
    else drawMouse(v, i, c.x, c.y, c.f >= 0 ? 1 : -1);
  });
  g.fillStyle = 'rgba(30, 20, 15, .8)';
  v.roundRect(W / 2 - 210, 3, 420, 24, 12); g.fill();
  const tm = i => (s.tm[i] < 0 ? '—' : s.tm[i].toFixed(1) + 's');
  v.label('Round ' + s.rd + '/2 · ⏱ ' + Math.max(0, Math.ceil(ROUND - s.t)) + ' · as the mouse: ' + v.names[0] + ' ' + tm(0) + ', ' + v.names[1] + ' ' + tm(1), W / 2, 15, 12, '#ffffff');
  const mineC = s.c[v.me];
  if (mineC && s.ph === 'chase') v.msg((mineC.r ? "You're the CAT: catch the mouse!" : "You're the MOUSE: don't get caught!") + (mineC.w > 0 ? ' · dash in ' + mineC.w.toFixed(1) + 's' : ' · Space to dash'));
}

})();
