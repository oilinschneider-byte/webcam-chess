/* Classic Games: Cheese Heist. A dark maze; one player is the mouse, the other the cat, and then they swap. You only see
   what your flashlight shows, plus noises.
   The mouse has a mission: steal the cheese (1 point each) and get out through the exit (2 more), which opens once it has
   at least one. It leaps over walls with Space (noisily), squeezes through tunnels the cat can't use, and can throw a
   squeak to fool the cat (E). The cat is a little faster, dashes with Space, and can set one trap (E), though never one
   that blocks the only way to the exit. The cat doesn't know where the cheese and the exit are: it only sees them in its
   flashlight, like everything else.
   After both have been the mouse, the most points wins. A tie goes to sudden death: lights almost out, one cheese, one exit.
   Every steal makes a noise the cat can hear through the dark. (The host's app runs the game: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const CW = 23, CH = 13, TILE = 40, X0 = (W - CW * TILE) / 2, Y0 = (H - CH * TILE) / 2;
const R = 13;
const SPEED = { cat: 172, mouse: 158 }, DASH = 2.2, DASH_TIME = 0.25, DASH_WAIT = 3;   // (only the cat dashes)
const ROUND = 45, SUDDEN = 25, HEAD_START = 1.2;
const JUMP_TIME = 0.34, JUMP_SPEED = 300, JUMP_WAIT = 4;   // the mouse can leap over a wall (Space), then waits this long
const TRAP_STUN = 1.3, DECOYS = 2, TUNNEL_WAIT = 3;
const BEAM = 260, GLOW = 84, BEAM_WIDE = 0.62;             // how far your flashlight reaches, the glow around you, and its width
const NEAR = 190;                                          // the mouse's heart starts pounding when the cat is this close
const BOOST = 1.08, BOOST_BEHIND = 3;                      // the comeback boost: the mouse is faster if its player is this far behind
const START = { mouse: [0, CH - 1], cat: [11, 6] };        // (the same spots every round, clear of the camera walls)
const EXIT = [CW - 1, CH - 1];
// The cells under the camera walls (the top corners: see cam-walls.js) aren't part of the maze.
const BLOCKED = (x, y) => y <= 3 && (x <= 3 || x >= CW - 4);
const center = (cx, cy) => [X0 + (cx + 0.5) * TILE, Y0 + (cy + 0.5) * TILE];

CA.games.add('mouse', {
  name: 'Cheese Heist', icon: '🐭', duos: true,
  blurb: 'A dark maze! As the mouse, steal the cheese and escape through the exit. As the cat, stop them. You only see what your flashlight shows. Then you swap. Most points wins.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'mouse', angles: ['fa'], keys: { KeyE: 'e' }, letters: { e: 'e' },
      pad: { stick: true, buttons: [{ k: 'e', label: 'E: 📢 squeak · 🪤 trap' }, { k: 'a', label: '⎵ Jump · Dash', main: true }] },
      help: 'WASD move · Mouse: 🧀 then 🚪, Space jumps a wall, E throws a squeak, 🕳️ are shortcuts · Cat: Space dashes, E sets a trap',
      helpTouch: 'Stick moves · Mouse: steal 🧀 then get to 🚪 · Cat: catch the mouse',
      note: 'Steal the cheese, then escape!',
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
  for (let h = 0; h < q.length; h++) {
    const [cx, cy] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!canGo(m, cx, cy, dx, dy)) continue;
      const k = (cy + dy) * CW + cx + dx;
      if (d[k] < 0) { d[k] = d[cy * CW + cx] + 1; q.push([cx + dx, cy + dy]); }
    }
  }
  return d;
}
// Would a trap at (x, y) block the only way to the exit? Yes if the exit is that cell or next to it, or if the mouse
// couldn't walk to the exit any more without going through that cell.
function blocksExit(s, x, y) {
  const [tx, ty] = cellOf(x, y);
  if (Math.abs(tx - EXIT[0]) + Math.abs(ty - EXIT[1]) <= 1) return true;
  const m = s.movers.find(c => c.role === 'mouse');
  const [mx, my] = m ? cellOf(m.x, m.y) : START.mouse;
  if (mx === tx && my === ty) return false; // (on top of the mouse: it can still go any way)
  const seen = new Array(CW * CH).fill(false), q = [[mx, my]];
  seen[my * CW + mx] = seen[ty * CW + tx] = true;
  for (let h = 0; h < q.length; h++) {
    const [cx, cy] = q[h];
    if (cx === EXIT[0] && cy === EXIT[1]) return false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (cy + dy) * CW + cx + dx;
      if (canGo(s.maze, cx, cy, dx, dy) && !seen[k]) { seen[k] = true; q.push([cx + dx, cy + dy]); }
    }
  }
  return true;
}
const cellOf = (x, y) => [Math.max(0, Math.min(CW - 1, Math.floor((x - X0) / TILE))), Math.max(0, Math.min(CH - 1, Math.floor((y - Y0) / TILE)))];

function init(api) {
  const maze = makeMaze(api.rng);
  // Three cheeses, spread across the maze, and two tunnels: the same in every round, so both players get the same job.
  const pick = (x1, x2) => {
    for (let k = 0; k < 40; k++) {
      const x = x1 + Math.floor(api.rng() * (x2 - x1 + 1)), y = 1 + Math.floor(api.rng() * (CH - 1)); // (not the top row: the score goes there)
      if (!BLOCKED(x, y) && !(x === START.cat[0] && y === START.cat[1])) return [x, y];
    }
    return [x1, CH - 2];
  };
  const spots = [pick(3, 8), pick(9, 14), pick(15, 20)];
  const tunnels = [[pick(0, 5), pick(17, 22)], [pick(6, 10), pick(12, 16)]];
  const s = { n: api.n || 2, team: api.team || (i => i), maze, mz: maze.join(''), walls: wallsOf(maze), spots, tunnels, round: 0, sc: [0, 0], phase: 'chase', pause: 0, t: 0, movers: [], sudden: false, bestSteal: [0, 0], ping: null, ended: false };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.t = 0;
  s.sudden = s.round > 2;
  s.phase = 'chase';
  const mouseI = s.round === 1 ? 0 : s.round === 2 ? 1 : api.rng() < 0.5 ? 0 : 1;
  s.mouseI = mouseI;
  s.mt = mouseI; // (the mice's side: in Duos a team, in 1 vs 1 the player)
  s.cheese = (s.sudden ? [s.spots[1]] : s.spots).map(([cx, cy]) => { const [x, y] = center(cx, cy); return { x, y, on: true }; });
  s.got = 0;
  s.trap = null;
  s.ping = null;
  s.steps = [];
  s.stepIn = 0;
  const behind = !s.sudden && s.sc[1 - mouseI] - s.sc[mouseI] >= BOOST_BEHIND;
  s.traps = [];
  // (Duos: the mice team's two cats are both mice, side by side; the other two are cats)
  const spots = { mouse: [START.mouse, [1, CH - 1]], cat: [[10, 6], [12, 6]] };
  s.movers = Array.from({ length: s.n }, (_, i) => {
    const role = (s.n > 2 ? s.team(i) : i) === mouseI ? 'mouse' : 'cat';
    const [x, y] = s.n > 2 ? center(...spots[role][i % 2]) : center(...START[role]);
    return { out: 0, role, x, y, vx: 0, vy: 0, dash: 0, wait: 0.5, fx: 1, fa: role === 'cat' ? Math.PI : 0, jump: 0, jw: 0, stun: 0, tw: 0, hold: role === 'cat' ? HEAD_START : 0, used: 0, boost: role === 'mouse' && behind };
  });
  api.ev('round', { m: s.n > 2 ? s.movers.findIndex(c => c.role === 'mouse') : mouseI, n: s.round, sd: s.sudden ? 1 : 0 });
}

function endRound(s, api, how) {
  const m = s.movers[s.mouseI];
  if (s.sudden) {
    if (s.ended) return;
    s.ended = true;
    s.phase = 'over';
    api.ev(how, { x: m.x, y: m.y, m: s.mouseI, p: 0 });
    records(s, api);
    api.end(how === 'escaped' ? s.mouseI : 1 - s.mouseI, how === 'escaped' ? 'ESCAPED!' : 'CAUGHT!');
    return;
  }
  const bonus = how === 'escaped' ? 2 : 0;
  s.sc[s.mouseI] += bonus;
  s.bestSteal[s.mouseI] = Math.max(s.bestSteal[s.mouseI], s.got + bonus);
  api.score(s.sc[0], s.sc[1]);
  api.ev(how, { x: m.x, y: m.y, m: s.mouseI, p: s.got + bonus });
  s.phase = 'pause';
  s.pause = 2.2;
}
function records(s, api) { api.ev('rec', { best: s.bestSteal }); }

function noise(s, api, x, y, fake) {
  s.ping = { x, y, t: s.t };
  api.ev('ping', { x: Math.round(x), y: Math.round(y), fake: fake ? 1 : 0 });
}

function step(s, inp, dt, api) {
  if (s.phase === 'over') return;
  if (s.phase === 'pause') {
    s.pause -= dt;
    if (s.pause <= 0) {
      if (s.round === 1) newRound(s, api);
      else if (s.n > 2) { s.phase = 'over'; records(s, api); api.end(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, 'HEIST OVER!'); }
      else if (s.sc[0] === s.sc[1]) newRound(s, api); // (a tie: sudden death)
      else { s.phase = 'over'; records(s, api); api.end(s.sc[0] > s.sc[1] ? 0 : 1, 'HEIST OVER!'); }
    }
    return;
  }
  s.t += dt;
  s.movers.forEach((c, i) => {
    const n = inp[i];
    if (c.out) return; // (Duos: caught or escaped, for the rest of the round)
    c.wait = Math.max(0, c.wait - dt);
    c.jw = Math.max(0, c.jw - dt);
    c.stun = Math.max(0, c.stun - dt);
    c.tw = Math.max(0, c.tw - dt);
    c.hold = Math.max(0, c.hold - dt);
    const free = c.stun <= 0 && c.hold <= 0;
    if (c.role === 'cat' && free && n.hit.a && c.wait <= 0) { c.dash = DASH_TIME; c.wait = DASH_WAIT; api.ev('dash', { x: c.x, y: c.y }); }
    if (c.role === 'cat' && free && n.hit.e && !c.used && !s.sudden) { // one trap a round, where you stand
      if (blocksExit(s, c.x, c.y)) api.ev('notrap', { i }); // (not on the only way out)
      else {
        c.used = 1;
        if (s.n > 2) s.traps.push({ x: c.x, y: c.y }); else s.trap = { x: c.x, y: c.y };
        api.ev('settrap', { i });
      }
    }
    if (c.role === 'mouse' && free && n.hit.e && c.used < DECOYS) { // a squeak, thrown ahead, to fool the cat
      c.used++;
      const a = c.fa, far = 170 + Math.random() * 160;
      noise(s, api, Math.max(X0 + 10, Math.min(X0 + CW * TILE - 10, c.x + Math.cos(a) * far)), Math.max(Y0 + 10, Math.min(Y0 + CH * TILE - 10, c.y + Math.sin(a) * far)), true);
    }
    if (c.role === 'mouse' && free && c.jump <= 0 && n.hit.a && c.jw <= 0) { // the mouse leaps over a wall with Space (then waits a bit)
      let jx = n.mx, jy = n.my;
      if (!jx && !jy) { jx = Math.cos(c.fa); jy = Math.sin(c.fa); }
      const jl = Math.hypot(jx, jy) || 1;
      c.jump = JUMP_TIME; c.jw = JUMP_WAIT; c.jx = jx / jl; c.jy = jy / jl;
      api.ev('leap', { x: c.x, y: c.y });
      noise(s, api, c.x, c.y, false); // (a leap isn't quiet)
    }
    const flying = c.jump > 0;
    let sp = SPEED[c.role] * (c.dash > 0 ? DASH : 1) * (c.boost ? BOOST : 1) * (n.slow || 1);
    if (!free) sp = 0;
    c.dash = Math.max(0, c.dash - dt);
    if (flying) { c.jump -= dt; c.vx = c.jx * JUMP_SPEED; c.vy = c.jy * JUMP_SPEED; }
    else { c.vx = n.mx * sp; c.vy = n.my * sp; }
    if (c.vx || c.vy) c.fa = Math.atan2(c.vy, c.vx);
    if (n.mx) c.fx = Math.sign(n.mx);
    for (let k = 0; k < 2; k++) {
      c.x += c.vx * dt / 2;
      c.y += c.vy * dt / 2;
      if (flying) { // (over the walls, but not out of the maze)
        c.x = Math.max(X0 + R + 3, Math.min(X0 + CW * TILE - R - 3, c.x));
        c.y = Math.max(Y0 + R + 3, Math.min(Y0 + CH * TILE - R - 3, c.y));
        continue;
      }
      for (const [x1, y1, x2, y2] of s.walls) {
        const p = CA.duel.nearest(c.x, c.y, x1, y1, x2, y2);
        if (p.d >= R + 2) continue;
        const nx = (c.x - p.x) / (p.d || 1), ny = (c.y - p.y) / (p.d || 1);
        c.x = p.x + nx * (R + 2.01);
        c.y = p.y + ny * (R + 2.01);
      }
    }
    const [bx, by] = cellOf(c.x, c.y);
    if (BLOCKED(bx, by)) c.y = Y0 + 4.5 * TILE; // (a leap can't land behind a camera)
  });
  if (s.n > 2) { duoAfter(s, api, dt); return; }
  const m = s.movers[s.mouseI], cat = s.movers[1 - s.mouseI];
  // tunnels: only the mouse fits
  if (m.tw <= 0 && m.jump <= 0) {
    for (const [a, b] of s.tunnels) {
      for (const [from, to] of [[a, b], [b, a]]) {
        const [fx, fy] = center(...from);
        if (m.tw <= 0 && Math.hypot(m.x - fx, m.y - fy) < 15) {
          [m.x, m.y] = center(...to);
          m.tw = TUNNEL_WAIT;
          api.ev('tele', { x: m.x, y: m.y, ax: fx, ay: fy });
        }
      }
    }
  }
  // footprints
  s.stepIn -= dt;
  if (s.stepIn <= 0 && (m.vx || m.vy) && m.jump <= 0) {
    s.stepIn = 0.28;
    s.steps.push([Math.round(m.x), Math.round(m.y), s.t]);
    if (s.steps.length > 14) s.steps.shift();
  }
  // stealing
  for (const c of s.cheese) {
    if (!c.on || Math.hypot(c.x - m.x, c.y - m.y) > R + 12) continue;
    c.on = false;
    s.got++;
    if (!s.sudden) { s.sc[s.mouseI]++; api.score(s.sc[0], s.sc[1]); }
    api.ev('steal', { x: c.x, y: c.y, n: s.got });
    noise(s, api, c.x, c.y, false);
  }
  // the trap
  if (s.trap && Math.hypot(s.trap.x - m.x, s.trap.y - m.y) < R + 8 && m.jump <= 0) {
    m.stun = TRAP_STUN;
    api.ev('trap', { x: s.trap.x, y: s.trap.y });
    noise(s, api, s.trap.x, s.trap.y, false);
    s.trap = null;
  }
  // the exit
  const [ex, ey] = center(...EXIT);
  if (s.got > 0 && Math.hypot(ex - m.x, ey - m.y) < R + 10) { endRound(s, api, 'escaped'); return; }
  if (m.jump <= 0 && Math.hypot(m.x - cat.x, m.y - cat.y) < R * 2 - 2) { endRound(s, api, 'caught'); return; }
  if (s.t >= (s.sudden ? SUDDEN : ROUND)) endRound(s, api, s.sudden ? 'caught' : 'time');
}

// (Duos) After everyone moved: tunnels, footprints, cheese, traps, the exit and getting caught, for each mouse still in.
// A mouse that escapes (+2) or is caught is out until the next round; the round ends when both are out, or on time.
function duoAfter(s, api, dt) {
  const mice = s.movers.map((c, i) => i).filter(i => s.movers[i].role === 'mouse' && !s.movers[i].out);
  const cats = s.movers.filter(c => c.role === 'cat');
  mice.forEach(i => {
    const m = s.movers[i];
    if (m.tw <= 0 && m.jump <= 0) {
      for (const [a, b] of s.tunnels) for (const [from, to] of [[a, b], [b, a]]) {
        const [fx, fy] = center(...from);
        if (m.tw <= 0 && Math.hypot(m.x - fx, m.y - fy) < 15) { [m.x, m.y] = center(...to); m.tw = TUNNEL_WAIT; api.ev('tele', { x: m.x, y: m.y, ax: fx, ay: fy }); }
      }
    }
    m.stepIn = (m.stepIn || 0) - dt;
    if (m.stepIn <= 0 && (m.vx || m.vy) && m.jump <= 0) { m.stepIn = 0.28; s.steps.push([Math.round(m.x), Math.round(m.y), s.t]); if (s.steps.length > 20) s.steps.shift(); }
    for (const c of s.cheese) {
      if (!c.on || Math.hypot(c.x - m.x, c.y - m.y) > R + 12) continue;
      c.on = false;
      s.got++;
      s.sc[s.mt]++;
      api.score(s.sc[0], s.sc[1]);
      api.ev('steal', { x: c.x, y: c.y, n: s.got });
      noise(s, api, c.x, c.y, false);
    }
    s.traps = s.traps.filter(t => {
      if (Math.hypot(t.x - m.x, t.y - m.y) >= R + 8 || m.jump > 0) return true;
      m.stun = TRAP_STUN;
      api.ev('trap', { x: t.x, y: t.y });
      noise(s, api, t.x, t.y, false);
      return false;
    });
    const [ex, ey] = center(...EXIT);
    if (s.got > 0 && Math.hypot(ex - m.x, ey - m.y) < R + 10) {
      m.out = 2; s.sc[s.mt] += 2; s.bestSteal[s.mt] = Math.max(s.bestSteal[s.mt], s.got + 2);
      api.score(s.sc[0], s.sc[1]);
      api.ev('escaped', { x: m.x, y: m.y, m: i, p: 2 });
    } else if (m.jump <= 0 && cats.some(c => Math.hypot(m.x - c.x, m.y - c.y) < R * 2 - 2)) {
      m.out = 1;
      api.ev('caught', { x: m.x, y: m.y, m: i, p: 0 });
    }
  });
  const left = s.movers.some(c => c.role === 'mouse' && !c.out);
  if (!left || s.t >= ROUND) {
    if (left) api.ev('time', {});
    s.bestSteal[s.mt] = Math.max(s.bestSteal[s.mt], s.got);
    s.phase = 'pause';
    s.pause = 2.2;
  }
}

function snap(s) {
  return {
    mz: s.mz, rd: s.round, mi: s.mouseI, trs: s.n > 2 ? s.traps.map(t => [Math.round(t.x), Math.round(t.y)]) : undefined, t: Math.round(s.t * 10) / 10, ph: s.phase, sc: s.sc, got: s.got, sd: s.sudden ? 1 : 0,
    ch: s.cheese.map(c => [Math.round(c.x), Math.round(c.y), c.on ? 1 : 0]), tu: s.tunnels, tr: s.trap ? [Math.round(s.trap.x), Math.round(s.trap.y)] : 0,
    fp: s.steps.map(p => [p[0], p[1], Math.round((s.t - p[2]) * 10) / 10]),
    c: s.movers.map(c => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, r: c.role === 'cat' ? 1 : 0, d: c.dash > 0 ? 1 : 0, f: c.fx, fa: Math.round(c.fa * 100) / 100, w: Math.round(c.wait * 10) / 10, j: c.jump > 0 ? 1 : 0, jw: Math.round(c.jw * 10) / 10, st: c.stun > 0 ? 1 : 0, u: c.used, cb: c.boost ? 1 : 0, o: c.out })),
  };
}

// Walks the bot towards a cell, along the shortest way.
function stepTowards(s, st, me, goal) {
  const [mx, my] = cellOf(me.x, me.y);
  const d = distances(s.maze, goal[0], goal[1]);
  let next = [mx, my];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (canGo(s.maze, mx, my, dx, dy) && d[(my + dy) * CW + mx + dx] >= 0 && d[(my + dy) * CW + mx + dx] < d[next[1] * CW + next[0]]) next = [mx + dx, my + dy];
  }
  [st.tx, st.ty] = center(...next);
  return d[my * CW + mx];
}

// The bot plays by what it could know. As the cat: it goes for the mouse when it's close enough to notice it (better bots
// notice from further), to the last noise it heard, or else wanders the maze (it doesn't know where the cheese and the
// exit are either). As the mouse: it goes for the
// nearest cheese and then the exit (better bots take all the cheese first), and runs when the cat gets close.
function bot(s, i, dt, api) {
  const fresh = () => ({ think: 0, tx: 0, ty: 0, dash: false, jump: false, patrol: null, heard: null, heardAt: -1 });
  const st = s.n > 2 ? ((s.bss || (s.bss = {}))[i] || (s.bss[i] = fresh())) : s.bs || (s.bs = fresh());
  if (s.phase !== 'chase') return { hit: {} };
  const me = s.movers[i];
  if (me.out) return { hit: {} };
  // (Duos: the nearest one of the other role still in the round)
  let them = s.movers[1 - i];
  if (s.n > 2) { let bd = 1e9; s.movers.forEach(o => { if (o.role !== me.role && !o.out) { const d = Math.hypot(o.x - me.x, o.y - me.y); if (d < bd) { bd = d; them = o; } } }); }
  st.think -= dt;
  if (st.think <= 0) {
    st.think = 0.12 + (1 - api.skill) * 0.25;
    const [mx, my] = cellOf(me.x, me.y), [ox, oy] = cellOf(them.x, them.y);
    const near = Math.hypot(them.x - me.x, them.y - me.y);
    if (me.role === 'cat') {
      const notices = near < 90 + 180 * api.skill;
      if (s.ping && s.ping.t !== st.heardAt) { st.heardAt = s.ping.t; st.heard = cellOf(s.ping.x, s.ping.y); }
      let goal;
      if (notices) goal = [ox, oy];
      else if (st.heard) { goal = st.heard; if (mx === goal[0] && my === goal[1]) st.heard = null; }
      else {
        if (!st.patrol || (mx === st.patrol[0] && my === st.patrol[1])) {
          let p = null; // (somewhere at random, a few steps away)
          for (let k = 0; k < 20 && !p; k++) { const x = Math.floor(Math.random() * CW), y = Math.floor(Math.random() * CH); if (!BLOCKED(x, y) && Math.abs(x - mx) + Math.abs(y - my) > 4) p = [x, y]; }
          st.patrol = p || [mx, my];
        }
        goal = st.patrol;
      }
      const left = stepTowards(s, st, me, goal);
      st.dash = notices && left <= 3 && Math.random() < 0.3 + 0.6 * api.skill;
      if (!me.used && !s.sudden && !notices && Math.random() < 0.01 + 0.03 * api.skill) st.trap = true;
    } else {
      const dc = distances(s.maze, ox, oy), here = my * CW + mx;
      const danger = dc[here] >= 0 && dc[here] <= 3 + 3 * api.skill;
      if (danger) { // away from the cat
        const dm = distances(s.maze, mx, my);
        let best = -1e9, goal = [mx, my];
        for (let k = 0; k < CW * CH; k++) {
          if (dm[k] < 0 || dm[k] > 6) continue;
          const score = dc[k] * 2 - dm[k] * 0.5 + (Math.random() - 0.5) * (1 - api.skill) * 6;
          if (score > best && dc[k] > dm[k]) { best = score; goal = [k % CW, Math.floor(k / CW)]; }
        }
        stepTowards(s, st, me, goal);
        st.jump = Math.random() < 0.3 + 0.5 * api.skill;
        if (me.used < DECOYS && Math.random() < 0.05 * api.skill) st.decoy = true;
      } else {
        const left = s.cheese.filter(c => c.on).map(c => cellOf(c.x, c.y));
        const greedy = api.skill > 0.5 || s.got === 0 || Math.random() < 0.5;
        const dm = distances(s.maze, mx, my);
        let goal = EXIT;
        if (left.length && greedy && s.t < (s.sudden ? SUDDEN : ROUND) - 10) {
          goal = left.reduce((a, b) => (dm[b[1] * CW + b[0]] < dm[a[1] * CW + a[0]] ? b : a));
        } else if (!s.got && left.length) goal = left[0];
        stepTowards(s, st, me, goal);
      }
    }
  }
  const dx = st.tx - me.x, dy = st.ty - me.y, d = Math.hypot(dx, dy);
  const out = { mx: d > 3 ? dx / d : 0, my: d > 3 ? dy / d : 0, slow: 0.85 + 0.15 * api.skill, hit: {} };
  if (me.role === 'cat') {
    if (st.dash && me.wait <= 0) { out.hit.a = true; st.dash = false; }
    if (st.trap) { out.hit.e = true; st.trap = false; }
  } else {
    if (st.jump && me.jw <= 0 && d > 3) { out.hit.a = true; st.jump = false; }
    if (st.decoy) { out.hit.e = true; st.decoy = false; }
  }
  return out;
}

function event(v, e) {
  // (the cats' faces: see view.mood in games-duel.js)
  if (e.type === 'settrap') v.mood(e.i, 'smug', 1.6);
  if (e.type === 'notrap') v.mood(e.i, 'sad', 1.2);
  if (e.type === 'dash') v.sound([[640, 0, 0.04], [460, 0.03, 0.05]]);
  if (e.type === 'leap') { v.burst(e.x, e.y, '#ffffff', 8, 200); v.sound([[300, 0, 0.05], [520, 0.05, 0.08]]); }
  if (e.type === 'ping') { // a noise: everyone hears it, through the dark
    v.ring(e.x, e.y, '#ffffff', 12);
    v.ring(e.x, e.y, '#ffd23f', 34);
    v.pop(e.x, e.y - 20, '❗', '#ffd23f');
    v.sound([[1500, 0, 0.04], [1200, 0.05, 0.05]]);
  }
  if (e.type === 'steal') { v.pop(e.x, e.y - 30, '🧀 STOLEN! ' + e.n, '#ffd23f'); v.burst(e.x, e.y, '#ffd23f', 14, 220); v.sound('point'); }
  if (e.type === 'tele') { v.ring(e.ax, e.ay, '#c58bff', 12); v.burst(e.x, e.y, '#c58bff', 8, 160); }
  if (e.type === 'notrap' && e.i === v.me) { v.note("You can't set a trap on the only way to the exit!"); v.sound([[200, 0, 0.08]]); }
  if (e.type === 'settrap') { if (e.i === v.me) v.note('Trap set. The mouse can\'t see it until it\'s close.'); v.sound([[300, 0, 0.04]]); }
  if (e.type === 'trap') { v.pop(e.x, e.y - 24, '🪤 SNAP!', '#ff5a5a'); v.burst(e.x, e.y, '#ff5a5a', 12, 240); v.shake(6); v.sound('miss'); }
  if (e.type === 'caught') { v.burst(e.x, e.y, '#ffd23f', 22, 300); v.pop(e.x, e.y - 30, 'CAUGHT!' + (e.p ? ' Kept ' + e.p : ''), '#ff5a5a'); v.shake(10); v.sound(v.teamOf(e.m) === v.myTeam ? 'miss' : 'point'); }
  if (e.type === 'escaped') { v.burst(e.x, e.y, '#7dff8a', 26, 320); v.pop(e.x, e.y - 30, 'ESCAPED!' + (e.p ? ' +' + e.p : ''), '#7dff8a'); v.shake(5); v.sound(v.teamOf(e.m) === v.myTeam ? 'win' : 'miss'); }
  if (e.type === 'time') { v.pop(W / 2, H / 2, "Time's up! No escape bonus", '#ffffff'); v.sound('draw'); }
  if (e.type === 'round') {
    v.sound('notify');
    const you = v.teamOf(e.m) === v.myTeam ? 'you are the mouse 🐭: steal the 🧀, get out through the 🚪' : 'you are the cat 🐱: stop the mouse';
    v.note((e.sd ? '⚡ SUDDEN DEATH, lights almost out: ' : 'Round ' + e.n + ': ') + you);
  }
  if (e.type === 'rec') v.record('heist', 'Best heist (points in a round)', e.best[v.myTeam]);
}

let art = { key: '', c: null, walls: null };
function mazeArt(mz) {
  if (art.key === mz) return art;
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
  const walls = wallsOf(m);
  walls.forEach(([x1, y1, x2, y2]) => { b.moveTo(x1, y1); b.lineTo(x2, y2); });
  b.stroke();
  b.strokeStyle = '#a7774c';
  b.lineWidth = 2;
  b.stroke();
  art = { key: mz, c, walls };
  return art;
}

// What you can see: rays from you stop at the first wall. They reach far along your flashlight, and only a little elsewhere.
const RAYS = 90;
function lightShape(x, y, fa, walls, k) {
  const pts = [];
  for (let r = 0; r < RAYS; r++) {
    const a = fa + (r / RAYS - 0.5) * Math.PI * 2, off = Math.abs(r / RAYS - 0.5) * Math.PI * 2;
    const reach = (off < BEAM_WIDE ? GLOW + (BEAM - GLOW) * Math.min(1, (BEAM_WIDE - off) / 0.14) : GLOW) * k;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = reach;
    for (const [x1, y1, x2, y2] of walls) {
      const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-6) continue;
      const t = ((x1 - x) * ey - (y1 - y) * ex) / den, u = ((x1 - x) * dy - (y1 - y) * dx) / den;
      if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
    }
    pts.push(x + dx * best, y + dy * best);
  }
  return pts;
}
function tracePts(g, pts) {
  g.moveTo(pts[0], pts[1]);
  for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
  g.closePath();
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

function drawMover(v, i, c) {
  const g = v.g, up = c.j ? 14 : 0;
  if (c.d) { g.globalAlpha = 0.35; g.fillStyle = v.team[i].light; v.dot(c.x - c.f * 12, c.y, 14); g.globalAlpha = 1; }
  if (c.j) { g.fillStyle = 'rgba(0, 0, 0, .25)'; g.beginPath(); g.ellipse(c.x, c.y + 12, 16, 6, 0, 0, Math.PI * 2); g.fill(); }
  if (c.r) v.catTop(i, c.x, c.y - 2, 0.85, { lookRight: c.f >= 0 });
  else drawMouse(v, i, c.x, c.y - up, c.f >= 0 ? 1 : -1);
  if (c.st) v.label('💫', c.x, c.y - 28, 20, '#ffffff');
}

let beatAt = 0;
let darkC = null;

// (Duos) Your team sees through both its flashlights; the other team shows only where that light falls.
function drawDuo(v, s, a) {
  const g = v.g, me = s.c[v.me], playing = s.ph === 'chase', mouseTeam = !me.r;
  const mine = s.c.map((c, i) => i).filter(i => v.teamOf(i) === v.myTeam && !s.c[i].o);
  const shapes = playing ? mine.map(i => lightShape(s.c[i].x, s.c[i].y, s.c[i].fa, a.walls, 1)) : [];
  const inLight = fn => { g.save(); if (playing) { g.beginPath(); shapes.forEach(p => tracePts(g, p)); g.clip(); } fn(); g.restore(); };
  const goals = () => {
    (s.ch || []).forEach(([x, y, on]) => { if (on) v.label('🧀', x, y + Math.sin(v.now / 250 + x) * 2, 25, '#000000'); });
    const [ex, ey] = center(...EXIT), open = s.got > 0;
    g.globalAlpha = open ? 1 : 0.4; v.label('🚪', ex, ey, open ? 30 + Math.sin(v.now / 140) * 3 : 26, '#000000'); g.globalAlpha = 1;
  };
  inLight(() => {
    if (!mouseTeam) {
      (s.fp || []).forEach(([x, y, age]) => { g.globalAlpha = Math.max(0, 0.6 - age * 0.12); v.label('🐾', x, y, 13, '#000000'); });
      g.globalAlpha = 1;
      goals();
    }
    (s.trs || []).forEach(([x, y]) => v.label('🪤', x, y, 22, '#000000'));
    s.c.forEach((c, i) => { if (v.teamOf(i) !== v.myTeam && !c.o) drawMover(v, i, c); });
  });
  if (playing) {
    if (!darkC) { darkC = document.createElement('canvas'); darkC.width = W; darkC.height = H; }
    const d = darkC.getContext('2d');
    d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H);
    d.fillStyle = 'rgba(9, 7, 22, .84)'; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out'; d.beginPath(); shapes.forEach(p => tracePts(d, p)); d.fill();
    d.globalCompositeOperation = 'source-over';
    g.drawImage(darkC, 0, 0, W, H);
  }
  if (mouseTeam || !playing) goals();
  (s.tu || []).forEach(pair => pair.forEach(([cx, cy]) => { const [x, y] = center(cx, cy); g.globalAlpha = me.r ? 0.35 : 0.85; v.label('🕳️', x, y, 22, '#000000'); g.globalAlpha = 1; }));
  s.c.forEach((c, i) => { if (v.teamOf(i) === v.myTeam && !c.o) drawMover(v, i, c); });
  g.fillStyle = 'rgba(30, 20, 15, .85)';
  v.roundRect(W / 2 - 230, 3, 460, 24, 12); g.fill();
  const left = Math.max(0, Math.ceil(ROUND - s.t));
  const outs = s.c.map((c, i) => (c.o ? (c.o === 2 ? '🏃' : '🔒') + (i === v.me ? 'You' : v.names[i]) : '')).filter(Boolean).join(' ');
  v.label('Round ' + s.rd + '/2 · ⏱ ' + left + ' · 🧀 ' + s.got + '/3 · Blue ' + s.sc[0] + ' – ' + s.sc[1] + ' Orange' + (outs ? ' · ' + outs : ''), W / 2, 15, 12, left <= 10 ? '#ffb0b0' : '#ffffff');
  if (!playing) return;
  if (me.o) v.msg(me.o === 2 ? 'You escaped! Your teammate is still in there…' : 'You were caught! Cheer on your teammate');
  else v.msg(me.r ? 'Your team are the CATS: catch both mice! Listen for noises.' + (me.w > 0 ? ' · dash in ' + me.w.toFixed(1) + 's' : ' · Space to dash') + (me.u ? '' : ' · E sets your trap')
    : (s.got ? 'The 🚪 is open: get out (+2 each), or grab more 🧀!' : 'Steal a 🧀 to open the 🚪!') + (me.jw > 0 ? ' · jump in ' + me.jw.toFixed(1) + 's' : ' · Space jumps a wall') + (me.u < DECOYS ? ' · E throws a squeak' : ''));
}
function draw(v, s) {
  const g = v.g, a = mazeArt(s.mz);
  g.drawImage(a.c, 0, 0, W, H);
  if (v.duo) { drawDuo(v, s, a); return; }
  const me = s.c[v.me], them = s.c[v.them];
  const playing = s.ph === 'chase';
  const shape = playing ? lightShape(me.x, me.y, me.fa, a.walls, s.sd ? 0.62 : 1) : null;
  // what only shows inside your light: the other player, their trap, the mouse's footprints
  const inLight = fn => { g.save(); if (shape) { g.beginPath(); tracePts(g, shape); g.clip(); } fn(); g.restore(); };
  inLight(() => {
    if (me.r) {
      (s.fp || []).forEach(([x, y, age]) => { // (only the cat needs these)
        g.globalAlpha = Math.max(0, 0.6 - age * 0.12);
        v.label('🐾', x, y, 13, '#000000');
      });
      g.globalAlpha = 1;
    }
    if (s.tr) { g.globalAlpha = 0.9; v.label('🪤', s.tr[0], s.tr[1], 22, '#000000'); g.globalAlpha = 1; }
    if (me.r) drawGoals(); // (the cat only knows where the cheese and the exit are once its light finds them)
    drawMover(v, v.them, them);
  });
  if (playing) { // the dark
    g.fillStyle = 'rgba(9, 7, 22, .84)';
    g.beginPath();
    g.rect(0, 0, W, H);
    tracePts(g, shape);
    g.fill('evenodd');
  }
  // the mouse always knows where the cheese and the exit are (and the tunnels, which only it fits through)
  if (!me.r || !playing) drawGoals();
  (s.tu || []).forEach(pair => pair.forEach(([cx, cy]) => { const [x, y] = center(cx, cy); g.globalAlpha = me.r ? 0.35 : 0.85; v.label('🕳️', x, y, 22, '#000000'); g.globalAlpha = 1; }));
  function drawGoals() {
    const open = s.got > 0;
    (s.ch || []).forEach(([x, y, on]) => { if (on) v.label('🧀', x, y + Math.sin(v.now / 250 + x) * 2, 25, '#000000'); });
    const [ex, ey] = center(...EXIT);
    g.globalAlpha = open ? 1 : 0.4;
    v.label('🚪', ex, ey, open ? 30 + Math.sin(v.now / 140) * 3 : 26, '#000000');
    g.globalAlpha = 1;
    if (open && !me.r) { g.strokeStyle = '#7dff8a'; g.lineWidth = 3; g.beginPath(); g.arc(ex, ey, 22 + Math.sin(v.now / 140) * 2, 0, Math.PI * 2); g.stroke(); }
  }
  drawMover(v, v.me, me);
  // the mouse's heart pounds when the cat is close
  if (playing && !me.r) {
    const d = Math.hypot(me.x - them.x, me.y - them.y);
    if (d < NEAR) {
      const k = 1 - d / NEAR, every = 700 - 400 * k;
      if (v.now - beatAt > every) { beatAt = v.now; v.sound([[70 + 30 * k, 0, 0.08], [55 + 30 * k, 0.12, 0.09]]); }
      const pulse = 0.5 + 0.5 * Math.cos((v.now - beatAt) / every * Math.PI * 2);
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      vg.addColorStop(0, 'rgba(200, 0, 0, 0)');
      vg.addColorStop(1, 'rgba(200, 0, 0, ' + (0.15 + 0.45 * k * pulse) + ')');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }
  }
  g.fillStyle = 'rgba(30, 20, 15, .85)';
  v.roundRect(W / 2 - 215, 3, 430, 24, 12); g.fill();
  const limit = s.sd ? SUDDEN : ROUND, left = Math.max(0, Math.ceil(limit - s.t));
  const rd = s.sd ? '⚡ Sudden death' : 'Round ' + s.rd + '/2';
  v.label(rd + ' · ⏱ ' + left + ' · 🧀 ' + s.got + (s.sd ? '/1' : '/3') + ' · ' + v.names[0] + ' ' + s.sc[0] + ' – ' + s.sc[1] + ' ' + v.names[1], W / 2, 15, 12, left <= 10 ? '#ffb0b0' : '#ffffff');
  if (playing) {
    v.msg(me.r
      ? "You're the CAT: stop the mouse! You don't know where the 🧀 or the 🚪 are: listen for noises." + (me.w > 0 ? ' · dash in ' + me.w.toFixed(1) + 's' : ' · Space to dash') + (me.u || s.sd ? '' : ' · E sets your trap')
      : (s.got ? 'The 🚪 is open: get out (+2), or risk it for more 🧀!' : 'Steal a 🧀 to open the 🚪!') + (me.jw > 0 ? ' · jump in ' + me.jw.toFixed(1) + 's' : ' · Space jumps a wall') + (me.u < DECOYS ? ' · E throws a squeak' : '') + (me.cb ? ' · 🔥 Comeback boost' : ''));
  }
}

})();
