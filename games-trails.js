/* Classic Games: Light Trails. Two cats ride glowing bikes around an arena, and every bike leaves a solid trail behind
   it. Hitting a wall (the camera walls in the top corners too) or any trail (yours too) puts you out. Last bike
   riding wins the round; first to 3 rounds.
   The bikes move on a grid of small cells, so a trail is just the cells it has filled. (See games-duel.js for how
   the game runs online.) */
(() => {
'use strict';

const CELL = 8, COLS = 118, ROWS = 65;
const X0 = (960 - COLS * CELL) / 2, Y0 = (540 - ROWS * CELL) / 2;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // right, down, left, up
const KEY_DIR = { r: 0, d: 1, l: 2, u: 3 };
const SPEED = 17, SPEED_MAX = 30;                 // cells a second, at the start of a round and at most
const WIN = 3;
const START = [[Math.round(COLS * 0.2), Math.floor(ROWS / 2), 0], [Math.round(COLS * 0.8), Math.floor(ROWS / 2), 2]];
const px = (c, k) => (k ? Y0 : X0) + (c + 0.5) * CELL;

CA.games.add('trails', {
  name: 'Light Trails', icon: '🏍️',
  blurb: 'Steer your glowing bike with WASD or the arrows. Every bike leaves a solid trail: hit a wall or any trail and you\'re out! Last bike riding wins the round. First to 3!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'trails',
      pad: { buttons: [{ k: 'l', label: '◀' }, { k: 'u', label: '▲' }, { k: 'd', label: '▼' }, { k: 'r', label: '▶' }] },
      help: 'WASD or the arrows to steer · never touch a trail or the wall · first to 3 rounds',
      helpTouch: 'The arrow buttons steer · never touch a trail or the wall · first to 3 rounds',
      note: 'First to ' + WIN + ' rounds',
      init, step, snap, bot, draw, event,
    });
  },
});

function init(api) {
  const s = { wins: [0, 0], round: 0, grid: new Uint8Array(COLS * ROWS), bikes: [], phase: 'run', pause: 0, t: 0, rw: -1 };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.grid.fill(0);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (CA.camWalls.inWall(px(x, 0), px(y, 1), CELL / 2)) s.grid[y * COLS + x] = 9; // (the camera walls)
  s.t = 0;
  s.phase = 'run';
  s.rw = -1;
  s.bikes = START.map(([x, y, d], i) => {
    s.grid[y * COLS + x] = i + 1;
    return { x, y, d, alive: true, prog: 0, queue: [], pts: [[x, y]], stick: -1 };
  });
  if (api) api.note('Round ' + s.round + ' · first to ' + WIN);
}

const free = (s, x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !s.grid[y * COLS + x];

function step(s, inp, dt, api) {
  if (s.phase === 'pause') {
    s.pause -= dt;
    if (s.pause <= 0) newRound(s, api);
    return;
  }
  s.t += dt;
  s.bikes.forEach((b, i) => {
    const want = [];
    for (const k in KEY_DIR) if (inp[i].hit[k]) want.push(KEY_DIR[k]);
    const { mx, my } = inp[i];
    const sd = Math.abs(mx) > 0.5 || Math.abs(my) > 0.5 ? (Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 0 : 2) : (my > 0 ? 1 : 3)) : -1;
    if (sd >= 0 && sd !== b.stick && !want.length) want.push(sd); // (the stick on phones)
    b.stick = sd;
    for (const d of want) if (b.queue.length < 2) b.queue.push(d);
  });
  const speed = Math.min(SPEED_MAX, SPEED + s.t * 0.35);
  // Both bikes move one cell at a time, together, so it's always fair who hit what first.
  const bs = s.bikes;
  bs.forEach(b => { if (b.alive) b.prog += speed * dt; });
  while (bs.some(b => b.alive && b.prog >= 1)) {
    const next = bs.map(b => {
      if (!b.alive || b.prog < 1) return null;
      b.prog -= 1;
      while (b.queue.length) { // the next turn (an about-turn into your own trail isn't allowed)
        const d = b.queue.shift();
        if (d !== b.d && d !== (b.d + 2) % 4) { b.d = d; b.pts.push([b.x, b.y]); break; }
      }
      return [b.x + DIRS[b.d][0], b.y + DIRS[b.d][1]];
    });
    const crash = next.map(n => !!n && !free(s, n[0], n[1]));
    if (next[0] && next[1] && next[0][0] === next[1][0] && next[0][1] === next[1][1]) { crash[0] = crash[1] = true; } // (head on)
    bs.forEach((b, i) => {
      if (!next[i]) return;
      if (crash[i]) {
        b.alive = false;
        b.prog = 0;
        api.ev('crash', { x: px(b.x, 0) + DIRS[b.d][0] * CELL / 2, y: px(b.y, 1) + DIRS[b.d][1] * CELL / 2, i });
        return;
      }
      b.x = next[i][0];
      b.y = next[i][1];
      s.grid[b.y * COLS + b.x] = i + 1;
    });
  }
  const alive = bs.filter(b => b.alive).length;
  if (alive <= 1) {
    const w = alive === 1 ? (bs[0].alive ? 0 : 1) : -1;
    if (w >= 0) s.wins[w]++;
    api.score(s.wins[0], s.wins[1]);
    s.rw = w;
    if (s.wins[0] >= WIN || s.wins[1] >= WIN) { api.end(s.wins[0] >= WIN ? 0 : 1, 'GAME!'); return; }
    s.phase = 'pause';
    s.pause = 1.8;
  }
}

function snap(s) {
  return {
    w: s.wins, rd: s.round, ph: s.phase, rw: s.rw,
    b: s.bikes.map(b => {
      const ahead = b.alive ? Math.min(1, b.prog) : 0;
      const hx = px(b.x, 0) + DIRS[b.d][0] * ahead * CELL, hy = px(b.y, 1) + DIRS[b.d][1] * ahead * CELL;
      const pts = [];
      for (const [x, y] of b.pts) pts.push(px(x, 0), px(y, 1));
      return { x: Math.round(hx * 10) / 10, y: Math.round(hy * 10) / 10, d: b.d, al: b.alive ? 1 : 0, p: pts };
    }),
  };
}

// The bot looks at each way it could go next and picks the one with the most open space behind it (easy bots look
// less far and sometimes turn for no reason).
function bot(s, i, dt, api) {
  const b = s.bikes[i];
  const out = { hit: {} };
  if (s.phase !== 'run' || !b.alive || b.queue.length) return out;
  const look = 40 + Math.round(api.skill * 500);
  const room = (x, y) => { // how many cells it could reach from (x, y), up to `look`
    if (!free(s, x, y)) return -1;
    const seen = new Set([y * COLS + x]);
    const q = [[x, y]];
    while (q.length && seen.size < look) {
      const [cx, cy] = q.shift();
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy, k = ny * COLS + nx;
        if (free(s, nx, ny) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    return seen.size;
  };
  const other = s.bikes[1 - i];
  let best = b.d, bestScore = -Infinity;
  for (const d of [b.d, (b.d + 1) % 4, (b.d + 3) % 4]) {
    const nx = b.x + DIRS[d][0], ny = b.y + DIRS[d][1];
    let sc = room(nx, ny);
    if (sc < 0) { sc = -1000; } else {
      if (d === b.d) sc += 3; // (no need to wiggle)
      const ox = other.x + DIRS[other.d][0], oy = other.y + DIRS[other.d][1];
      if (other.alive && nx === ox && ny === oy) sc -= 500; // (don't drive into the other bike's next cell)
      // good bots try to cut the other bike off
      sc -= api.skill * 0.02 * Math.hypot(nx - (other.x + DIRS[other.d][0] * 8), ny - (other.y + DIRS[other.d][1] * 8));
    }
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  if (Math.random() < (1 - api.skill) * 0.012) best = (b.d + (Math.random() < 0.5 ? 1 : 3)) % 4; // (easy bots wobble)
  if (best !== b.d) out.hit[['r', 'd', 'l', 'u'][best]] = true;
  return out;
}

function event(v, e) {
  if (e.type === 'crash') {
    v.burst(e.x, e.y, v.team[e.i].main, 26, 340);
    v.burst(e.x, e.y, '#ffffff', 10, 220);
    v.ring(e.x, e.y, v.team[e.i].light, 10);
    v.shake(10);
    v.sound([[160, 0, 0.1], [90, 0.06, 0.3]]);
  }
}

let floor = null;
function makeFloor() {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 540;
  const b = c.getContext('2d');
  b.fillStyle = '#05060f';
  b.fillRect(0, 0, 960, 540);
  b.strokeStyle = 'rgba(80, 120, 255, .12)';
  b.lineWidth = 1;
  b.beginPath();
  for (let x = 0; x <= COLS; x += 4) { b.moveTo(X0 + x * CELL + 0.5, Y0); b.lineTo(X0 + x * CELL + 0.5, Y0 + ROWS * CELL); }
  for (let y = 0; y <= ROWS; y += 4) { b.moveTo(X0, Y0 + y * CELL + 0.5); b.lineTo(X0 + COLS * CELL, Y0 + y * CELL + 0.5); }
  b.stroke();
  b.strokeStyle = '#7d5cff';
  b.lineWidth = 3;
  b.shadowColor = '#7d5cff';
  b.shadowBlur = 14;
  b.strokeRect(X0 - 2, Y0 - 2, COLS * CELL + 4, ROWS * CELL + 4);
  return c;
}

function draw(v, s) {
  const g = v.g;
  if (!floor) floor = makeFloor();
  g.drawImage(floor, 0, 0, 960, 540);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  s.b.forEach((b, i) => {
    const col = v.team[i];
    const path = () => {
      g.beginPath();
      g.moveTo(b.p[0], b.p[1]);
      for (let k = 2; k < b.p.length; k += 2) g.lineTo(b.p[k], b.p[k + 1]);
      g.lineTo(b.x, b.y);
    };
    g.globalAlpha = b.al ? 1 : 0.45;
    path(); g.strokeStyle = col.main; g.lineWidth = 9; g.globalAlpha *= 0.35; g.stroke();
    g.globalAlpha = b.al ? 1 : 0.45;
    path(); g.strokeStyle = col.light; g.lineWidth = 4; g.stroke();
    path(); g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.stroke();
    g.globalAlpha = 1;
  });
  s.b.forEach((b, i) => {
    if (!b.al) return;
    const ang = [0, Math.PI / 2, Math.PI, -Math.PI / 2][b.d];
    g.save();
    g.translate(b.x, b.y);
    g.rotate(ang);
    g.fillStyle = v.team[i].main;
    g.shadowColor = v.team[i].light;
    g.shadowBlur = 16;
    v.roundRect(-14, -7, 26, 14, 7);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.fillRect(8, -3, 5, 6);
    g.restore();
    v.catTop(i, b.x, b.y - 8, 0.62, { ring: false, lookRight: b.d !== 2, label: false });
    v.label(i === v.me ? 'You' : v.names[i], b.x, b.y + 20, 11, i === v.me ? '#ffd23f' : '#ffffff');
  });
  v.label('🏍️ ' + v.names[0] + ' ' + s.w[0] + ' – ' + s.w[1] + ' ' + v.names[1] + '  ·  Round ' + s.rd, 480, 22, 15, '#ffffff');
  if (s.ph === 'pause') v.bigText(s.rw < 0 ? 'Both crashed! No point' : s.rw === v.me ? 'You win the round!' : v.names[s.rw] + ' wins the round!', 270, 38, '#ffd23f', 1);
}

})();
