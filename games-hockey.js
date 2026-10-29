/* Classic Games: Cat Air Hockey. Move the mouse to move your paddle (you stay on your half of the table) and knock the
   puck into the other cat's goal. First to 5. The paddles can only speed up so fast and the puck has a top speed,
   so nobody can teleport a paddle into it. (The host's app runs the puck: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const L = 60, Rt = 900, T = 60, B = 480, MID = (L + Rt) / 2; // the table
const GOAL_T = 200, GOAL_B = 340;                            // the goal mouths, on the left and right ends
const PR = 32, KR = 18;                                       // paddle and puck size
const PADDLE_MAX = 1300, PADDLE_ACCEL = 9000, PUCK_MAX = 1100;
const WIN = 5;

CA.games.add('hockey', {
  name: 'Cat Air Hockey', icon: '🏒',
  blurb: 'Move the mouse to move your paddle and smack the puck into the other cat\'s goal! You stay on your half of the table. First to 5 goals.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'hockey', mouse: true,
      help: 'Move the mouse to move your paddle · hit the puck into their goal · first to 5',
      helpTouch: 'Drag your finger on the table to move your paddle · first to 5',
      note: 'First to ' + WIN + ' goals',
      init, step, snap, bot, draw, event,
    });
  },
});

function init() {
  return {
    sc: [0, 0], pause: 0, last: -1,
    pads: [{ x: L + 90, y: H / 2, vx: 0, vy: 0 }, { x: Rt - 90, y: H / 2, vx: 0, vy: 0 }],
    puck: { x: MID, y: H / 2, vx: 0, vy: 0 },
  };
}

const halfOf = (i, x) => (i === 0 ? Math.max(L + PR, Math.min(MID - PR, x)) : Math.max(MID + PR, Math.min(Rt - PR, x)));
const clampY = y => Math.max(T + PR, Math.min(B - PR, y));

function movePaddle(p, i, tx, ty, dt, top) {
  tx = halfOf(i, tx);
  ty = clampY(ty);
  let wx = (tx - p.x) / dt, wy = (ty - p.y) / dt;               // the speed that would get there this step
  const ws = Math.hypot(wx, wy), max = top || PADDLE_MAX;
  if (ws > max) { wx *= max / ws; wy *= max / ws; }
  let ax = (wx - p.vx) / dt, ay = (wy - p.vy) / dt;             // …but it can only speed up so fast
  const as = Math.hypot(ax, ay);
  if (as > PADDLE_ACCEL) { ax *= PADDLE_ACCEL / as; ay *= PADDLE_ACCEL / as; }
  p.vx += ax * dt;
  p.vy += ay * dt;
  p.x = halfOf(i, p.x + p.vx * dt);
  p.y = clampY(p.y + p.vy * dt);
  const q = CA.camWalls.push(p.x, p.y, PR); // (the camera walls in the top corners)
  if (q) { p.x = q.x; p.y = q.y; }
}

function step(s, inp, dt, api) {
  for (let i = 0; i < 2; i++) movePaddle(s.pads[i], i, inp[i].ax, inp[i].ay, dt, inp[i].top);
  if (s.pause > 0) { s.pause -= dt; return; }
  const k = s.puck;
  const sub = 3;
  for (let n = 0; n < sub; n++) {
    const h = dt / sub;
    k.x += k.vx * h;
    k.y += k.vy * h;
    // the paddles
    s.pads.forEach((p, i) => {
      const dx = k.x - p.x, dy = k.y - p.y, d = Math.hypot(dx, dy);
      if (d >= PR + KR || d === 0) return;
      const nx = dx / d, ny = dy / d;
      k.x = p.x + nx * (PR + KR + 0.5);
      k.y = p.y + ny * (PR + KR + 0.5);
      const rv = (k.vx - p.vx) * nx + (k.vy - p.vy) * ny;
      if (rv < 0) {
        k.vx -= 1.9 * rv * nx;
        k.vy -= 1.9 * rv * ny;
        s.last = i;
        if (-rv > 150) api.ev('hit', { x: k.x, y: k.y, i, hard: -rv > 700 ? 1 : 0 });
      }
    });
    // the side walls
    if (k.y < T + KR) { k.y = T + KR; k.vy = Math.abs(k.vy) * 0.92; wall(api, k); }
    if (k.y > B - KR) { k.y = B - KR; k.vy = -Math.abs(k.vy) * 0.92; wall(api, k); }
    // the ends: a wall, except for the goal mouth
    const inMouth = k.y > GOAL_T + 4 && k.y < GOAL_B - 4;
    if (k.x < L + KR && !inMouth) { k.x = L + KR; k.vx = Math.abs(k.vx) * 0.92; wall(api, k); }
    if (k.x > Rt - KR && !inMouth) { k.x = Rt - KR; k.vx = -Math.abs(k.vx) * 0.92; wall(api, k); }
    if (CA.camWalls.bounce(k, KR, 0.92)) wall(api, k); // (the camera walls in the top corners)
    // A puck squeezed between a paddle and the rail pushes the paddle back (so it can't get stuck in a corner).
    s.pads.forEach((p, i) => {
      const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 0.01;
      if (d >= PR + KR) return;
      p.x = halfOf(i, k.x + dx / d * (PR + KR + 0.5));
      p.y = clampY(k.y + dy / d * (PR + KR + 0.5));
      const q = CA.camWalls.push(p.x, p.y, PR);
      if (q) { p.x = q.x; p.y = q.y; }
      p.vx = p.vy = 0;
    });
    const sp = Math.hypot(k.vx, k.vy);
    if (sp > PUCK_MAX) { k.vx *= PUCK_MAX / sp; k.vy *= PUCK_MAX / sp; }
    // a goal: the puck went all the way into a mouth
    if (k.x < L - KR || k.x > Rt + KR) {
      const w = k.x < L ? 1 : 0;
      s.sc[w]++;
      api.score(s.sc[0], s.sc[1]);
      api.ev('goal', { w, x: k.x, y: k.y });
      Object.assign(k, { x: MID, y: H / 2, vx: 0, vy: 0 });
      s.pause = 1.2;
      if (s.sc[w] >= WIN) api.end(w, 'GOAL!');
      return;
    }
  }
  const f = Math.pow(0.8, dt); // (a little air resistance)
  k.vx *= f;
  k.vy *= f;
  // A puck that has been sitting still for a while (somewhere nobody can reach) goes back to the middle.
  s.still = Math.hypot(k.vx, k.vy) < 15 ? (s.still || 0) + dt : 0;
  if (s.still > 4) { Object.assign(k, { x: MID, y: H / 2, vx: 0, vy: 0 }); s.still = 0; api.ev('reset', {}); }
}

function wall(api, k) { if (Math.hypot(k.vx, k.vy) > 250) api.ev('wall', { x: k.x, y: k.y }); }

function snap(s) {
  const p = o => ({ x: Math.round(o.x), y: Math.round(o.y) });
  return { sc: s.sc, ps: s.pads.map(p), k: p(s.puck), z: s.pause > 0 ? 1 : 0 };
}

// The bot stays between the puck and its goal, and hits the puck towards the other goal when it comes close.
function bot(s, i, dt, api) {
  const st = s.bs || (s.bs = { think: 0, tx: s.pads[i].x, ty: H / 2 });
  st.think -= dt;
  const k = s.puck, p = s.pads[i], own = i === 0 ? L : Rt, dir = i === 0 ? 1 : -1;
  if (st.think <= 0) {
    st.think = 0.04 + (1 - api.skill) * 0.2;
    const mine = i === 0 ? k.x < MID + 30 : k.x > MID - 30;
    const toward = (k.vx * dir) < 30;
    if (mine && (toward || Math.hypot(k.vx, k.vy) < 220)) {
      const gx = i === 0 ? Rt : L, gy = H / 2 + (Math.random() - 0.5) * 90;
      const ax = gx - k.x, ay = gy - k.y, al = Math.hypot(ax, ay) || 1;
      st.tx = k.x - ax / al * 14 + k.vx * 0.05; // (a little behind the puck, so it goes towards the goal)
      st.ty = k.y - ay / al * 14 + k.vy * 0.05;
    } else {
      st.tx = own + dir * 95;
      st.ty = H / 2 + (k.y - H / 2) * 0.6;
    }
    st.ty += (Math.random() - 0.5) * 40 * (1 - api.skill);
  }
  return { ax: st.tx, ay: st.ty, top: 650 + 650 * api.skill };
}

function event(v, e) {
  if (e.type === 'hit') { v.sound(e.hard ? [[300, 0, 0.04], [200, 0.03, 0.05]] : [[420, 0, 0.03]]); if (e.hard) { v.burst(e.x, e.y, '#ffffff', 8, 200); v.shake(4); } }
  if (e.type === 'wall') v.sound([[700, 0, 0.02]]);
  if (e.type === 'goal') {
    v.burst(e.x < MID ? L : Rt, H / 2, v.team[e.w].main, 30, 380);
    v.pop(e.x < MID ? L + 90 : Rt - 90, H / 2 - 40, 'GOAL!', v.team[e.w].light);
    v.shake(12);
    v.sound(e.w === v.me ? 'win' : 'miss');
  }
}

let table = null;
function makeTable() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  b.fillStyle = '#20263a';
  b.fillRect(0, 0, W, H);
  b.fillStyle = '#e9f3ff';
  b.fillRect(L, T, Rt - L, B - T);
  b.fillStyle = 'rgba(80, 140, 220, .08)'; // air holes
  for (let x = L + 15; x < Rt; x += 30) for (let y = T + 15; y < B; y += 30) b.fillRect(x, y, 2, 2);
  b.strokeStyle = '#ff6b6b';
  b.lineWidth = 4;
  b.beginPath(); b.moveTo(MID, T); b.lineTo(MID, B); b.stroke();
  b.beginPath(); b.arc(MID, H / 2, 60, 0, Math.PI * 2); b.stroke();
  b.strokeStyle = '#5aa0ff';
  b.lineWidth = 3;
  b.beginPath(); b.arc(L, H / 2, 95, -Math.PI / 2, Math.PI / 2); b.stroke();
  b.beginPath(); b.arc(Rt, H / 2, 95, Math.PI / 2, Math.PI * 1.5); b.stroke();
  b.fillStyle = '#7f8aa8'; // the rails
  b.fillRect(L - 12, T - 12, Rt - L + 24, 12);
  b.fillRect(L - 12, B, Rt - L + 24, 12);
  b.fillRect(L - 12, T - 12, 12, GOAL_T - T + 12);
  b.fillRect(L - 12, GOAL_B, 12, B - GOAL_B + 12);
  b.fillRect(Rt, T - 12, 12, GOAL_T - T + 12);
  b.fillRect(Rt, GOAL_B, 12, B - GOAL_B + 12);
  b.fillStyle = '#0d1020'; // the goal mouths
  b.fillRect(L - 30, GOAL_T, 30, GOAL_B - GOAL_T);
  b.fillRect(Rt, GOAL_T, 30, GOAL_B - GOAL_T);
  return c;
}

function draw(v, s) {
  const g = v.g;
  if (!table) table = makeTable();
  g.drawImage(table, 0, 0, W, H);
  [0, 1].forEach(i => { // goal mouths glow in the color of the player who defends them
    g.fillStyle = v.team[i].main;
    g.globalAlpha = 0.6;
    g.fillRect(i ? Rt + 26 : L - 30, GOAL_T, 4, GOAL_B - GOAL_T);
    g.globalAlpha = 1;
  });
  // the puck
  g.fillStyle = 'rgba(0, 0, 0, .2)';
  v.dot(s.k.x + 3, s.k.y + 4, KR);
  g.fillStyle = '#1c1c28';
  v.dot(s.k.x, s.k.y, KR);
  g.fillStyle = '#3c3c55';
  v.dot(s.k.x, s.k.y, KR - 5);
  g.fillStyle = 'rgba(255, 255, 255, .35)';
  v.dot(s.k.x - 5, s.k.y - 6, 4);
  s.ps.forEach((p, i) => {
    let { x, y } = p;
    if (i === v.me && !v.host && v.aim.seen) { // (your own paddle follows your mouse right away on your screen)
      x = halfOf(i, v.aim.x);
      y = clampY(v.aim.y);
    }
    g.fillStyle = 'rgba(0, 0, 0, .2)';
    v.dot(x + 3, y + 5, PR);
    g.fillStyle = v.team[i].dark;
    v.dot(x, y, PR);
    g.fillStyle = v.team[i].main;
    v.dot(x, y, PR - 5);
    g.fillStyle = v.team[i].light;
    v.dot(x, y, PR - 16);
    v.catTop(i, x, y - 4, 0.62, { ring: false, label: false, lookRight: i === 0 });
  });
  v.label(s.sc[0] + '  :  ' + s.sc[1], MID, 32, 28, '#ffffff');
  v.label(v.names[0], MID - 120, 32, 14, v.team[0].light);
  v.label(v.names[1], MID + 120, 32, 14, v.team[1].light);
}

})();
