/* More Duos games, 2 vs 2 (see duos.js and games-duos.js): Dodge, Hoops, Kart Dash, Cat Cannons and Poop Showdown,
   remade for four cats at once. Seats 0 and 1 are the blue team, 2 and 3 the orange team. */
(() => {
'use strict';

const D = CA.duos;
const { W, H, teamOf, clamp } = D;
const TAU = Math.PI * 2;
const r1 = v => Math.round(v * 10) / 10;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const keyX = n => (n.held.right ? 1 : 0) - (n.held.left ? 1 : 0);
const foesOf = (cs, i) => cs.filter((o, j) => teamOf(j) !== teamOf(i));
function roundDots(v, wins, need) {
  for (let t = 0; t < 2; t++) for (let k = 0; k < need; k++) {
    v.g.fillStyle = k < wins[t] ? v.team[t].main : 'rgba(255,255,255,.2)';
    v.dot(W / 2 + (t ? 1 : -1) * (40 + k * 22), 22, 8);
  }
  v.label('VS', W / 2, 26, 13, '#ffffff');
}
function hearts(v, x, y, n, max, col) {
  for (let k = 0; k < max; k++) { v.g.globalAlpha = k < n ? 1 : 0.25; v.label('❤', x + (k - (max - 1) / 2) * 13, y, 12, col); }
  v.g.globalAlpha = 1;
}
const allMood = (v, t, good, bad, secs) => [0, 1, 2, 3].forEach(i => v.mood(i, teamOf(i) === t ? good : bad, secs));

// Side-view running and jumping, on flat ground at gy (A/D run, W or Space jumps).
function runJump(c, n, dt, o) {
  const x = c.stun > 0 ? 0 : keyX(n);
  c.vx += ((x * o.speed) - c.vx) * Math.min(1, (c.ground ? 12 : 4) * dt);
  if (x) c.f = x;
  if (c.stun <= 0 && c.ground && (n.hit.up || (o.spaceJumps && n.hit.a))) { c.vy = -o.jump; c.ground = false; return true; }
  return false;
}
function fall(c, dt, gy, grav) {
  c.vy += grav * dt;
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.x = clamp(c.x, 24, W - 24);
  let landed = false;
  if (c.y >= gy) { if (!c.ground && c.vy > 300) landed = true; c.y = gy; c.vy = 0; c.ground = true; } else c.ground = false;
  return landed;
}

/* ================= DODGE 2 vs 2 ================= */
// Balls and shooting stars fall from the sky (a hit costs a life), bombs blow up where they land, and hearts give a
// life back. A/D run, W or Space jumps. 3 lives each: the last team with a cat standing wins (after 90 seconds, the
// team with more lives left).
const DG = { GY: 470, LIVES: 3, LEN: 90 };
D.add('dodge2', {
  name: 'Dodge 2v2', icon: '☄️',
  how: 'A/D to run, W or Space to jump. Dodge what falls, grab the hearts! Last team standing wins.',
  init() {
    return { t: 0, next: 1, things: [], c: [200, 300, 660, 760].map((x, i) => ({ x, y: DG.GY, vx: 0, vy: 0, f: teamOf(i) ? -1 : 1, ground: true, lives: DG.LIVES, inv: 1.5, stun: 0, out: false })) };
  },
  step(s, ins, dt, api) {
    s.t += dt;
    s.next -= dt;
    if (s.next <= 0) {
      const k = api.rng(), heavy = Math.min(1, s.t / 70);
      const type = k < 0.08 ? 'heart' : k < 0.3 + heavy * 0.1 ? 'bomb' : k < 0.55 ? 'star' : 'ball';
      s.things.push({ k: type, x: 40 + api.rng() * (W - 80), y: -20, vx: type === 'star' ? (api.rng() - 0.5) * 300 : (api.rng() - 0.5) * 80, vy: type === 'star' ? 260 : 60, fuse: 1.1, r: type === 'bomb' ? 15 : type === 'heart' ? 13 : 12, hit: false });
      s.next = Math.max(0.16, 0.65 - s.t * 0.006) * (0.6 + api.rng() * 0.8);
    }
    s.c.forEach((c, i) => {
      if (c.out) { c.vx *= 0.9; fall(c, dt, DG.GY, 1700); return; } // (knocked out: it drops to the floor)
      c.inv = Math.max(0, c.inv - dt); c.stun = Math.max(0, c.stun - dt);
      if (runJump(c, ins[i], dt, { speed: 260, jump: 640, spaceJumps: true })) api.ev('jump', { seat: i });
      fall(c, dt, DG.GY, 1700);
    });
    // (cats bump each other a little sideways, so you can shove)
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const p = s.c[a], q = s.c[b];
      if (p.out || q.out || Math.abs(p.y - q.y) > 50) continue;
      const dx = q.x - p.x;
      if (Math.abs(dx) < 36) { const push = (36 - Math.abs(dx)) / 2 * Math.sign(dx || 1); p.x -= push; q.x += push; }
    }
    for (let k = s.things.length - 1; k >= 0; k--) {
      const o = s.things[k];
      if (o.k === 'bomb' && o.landed) { o.fuse -= dt; if (o.fuse <= 0) { boom(s, o, api); s.things.splice(k, 1); } continue; }
      o.vy += (o.k === 'star' ? 300 : 700) * dt;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < o.r || o.x > W - o.r) o.vx = -o.vx;
      if (o.y >= DG.GY - o.r) {
        if (o.k === 'ball' && !o.bounced) { o.y = DG.GY - o.r; o.vy = -o.vy * 0.55; o.bounced = true; }
        else if (o.k === 'bomb') { o.y = DG.GY - o.r; o.vy = 0; o.vx = 0; o.landed = true; }
        else { s.things.splice(k, 1); continue; }
      }
      const c = s.c.find(cc => !cc.out && Math.abs(cc.x - o.x) < 26 + o.r && o.y > cc.y - 80 && o.y < cc.y + 4);
      if (!c) continue;
      const i = s.c.indexOf(c);
      if (o.k === 'heart') { c.lives = Math.min(DG.LIVES + 1, c.lives + 1); api.ev('heal', { seat: i, x: r1(o.x), y: r1(o.y) }); s.things.splice(k, 1); }
      else if (o.k === 'bomb') { boom(s, o, api); s.things.splice(k, 1); }
      else if (c.inv <= 0) { hurt(s, i, api, o.x, o.y); s.things.splice(k, 1); }
    }
    const left = [0, 1].map(t => s.c.filter((c, i) => teamOf(i) === t && !c.out).length);
    if (!left[0] || !left[1]) api.over(!left[0] && !left[1] ? -1 : left[0] ? 0 : 1, 'Last team standing');
    else if (s.t >= DG.LEN) {
      const lv = [0, 1].map(t => s.c.reduce((n, c, i) => n + (teamOf(i) === t ? c.lives : 0), 0));
      api.over(lv[0] === lv[1] ? -1 : lv[0] > lv[1] ? 0 : 1, 'More lives left when time ran out');
    }
  },
  snap: s => ({ c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, l: c.lives, o: c.out ? 1 : 0, iv: c.inv > 0 ? 1 : 0, g: c.ground ? 1 : 0 })), th: s.things.map(o => [o.k[0], r1(o.x), r1(o.y), o.landed ? r1(o.fuse) : -1]), tm: Math.max(0, Math.ceil(DG.LEN - s.t)) }),
  bot(s, i, dt, api) {
    const c = s.c[i], out = { held: {}, hit: {} };
    if (c.out) return out;
    // the most dangerous thing coming down near it, and the nearest heart
    let danger = null, dd = 1e9, heart = null, hd = 1e9;
    for (const o of s.things) {
      const d = Math.abs(o.x - c.x);
      if (o.k === 'heart') { if (d < hd) { hd = d; heart = o; } continue; }
      const near = o.k === 'bomb' && o.landed ? d < 110 : d < 70 && o.y > c.y - 330;
      if (near && d < dd) { dd = d; danger = o; }
    }
    let tx = heart && hd < 300 ? heart.x : c.x;
    if (danger && Math.random() < 0.7 + api.skill * 0.3) tx = c.x + (c.x < danger.x ? -1 : 1) * 140;
    if (tx < 40) tx = c.x + 140; if (tx > W - 40) tx = c.x - 140;
    if (Math.abs(tx - c.x) > 12) out.held[tx > c.x ? 'right' : 'left'] = true;
    if (danger && danger.k === 'ball' && danger.bounced && Math.abs(danger.x - c.x) < 60 && Math.random() < 0.1) out.hit.up = true;
    return out;
  },
  draw(v, s) {
    const g = v.g;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#7cc8ff'); sky.addColorStop(1, '#c9b8ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#8fe0a0'; g.beginPath(); g.ellipse(250, DG.GY + 10, 380, 90, 0, Math.PI, 0); g.fill(); g.beginPath(); g.ellipse(760, DG.GY + 10, 330, 70, 0, Math.PI, 0); g.fill();
    const cols = ['#ff6b6b', '#ffd23f', '#6be38f', '#5ac8ff', '#c38bff'];
    for (let x = 0; x < W; x += 80) { g.fillStyle = cols[(x / 80) % cols.length]; g.fillRect(x, DG.GY, 80, H - DG.GY); }
    for (const [k, x, y, fuse] of s.th) {
      if (k === 'b') { g.fillStyle = '#ff5ab4'; v.dot(x, y, 12); g.fillStyle = 'rgba(255,255,255,.6)'; v.dot(x - 4, y - 4, 4); }
      else if (k === 's') { g.fillStyle = '#ffe14d'; g.globalAlpha = 0.35; v.dot(x, y - 18, 8); g.globalAlpha = 1; v.label('★', x, y + 6, 26, '#ffe14d'); }
      else if (k === 'h') v.label('❤️', x, y + 6, 24, '#ff5a5a');
      else { const flash = fuse >= 0 && Math.floor(v.now / (fuse < 0.4 ? 60 : 140)) % 2; g.fillStyle = flash ? '#ff3b3b' : '#2b2b35'; v.dot(x, y, 15); g.strokeStyle = '#ffb000'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 6, y - 12); g.quadraticCurveTo(x + 14, y - 22, x + 10, y - 28); g.stroke(); }
    }
    s.c.forEach((c, i) => {
      if (c.o) { v.catSide(i, c.x, c.y, 0.9, { face: 'ko', alpha: 0.35, tilt: 1.4 * (c.f || 1), label: false }); return; }
      v.catSide(i, c.x, c.y, 0.9, { lookRight: c.f > 0, alpha: c.iv && Math.floor(v.now / 90) % 2 ? 0.45 : 1, face: c.l <= 1 ? 'shock' : null });
      hearts(v, c.x, c.y - 112, c.l, DG.LIVES, v.team[teamOf(i)].light);
    });
    v.label(s.tm + 's', W / 2, 26, 15, '#ffffff');
  },
  event(v, e) {
    if (e.type === 'hit') { v.burst(e.x, e.y, '#ffffff', 14, 240); v.pop(e.x, e.y - 30, '−1', '#ff5a5a'); v.shake(6); v.sound('thud'); v.mood(e.seat, 'hurt', 1.2); }
    if (e.type === 'out') { v.pop(e.x, e.y - 60, 'OUT!', '#ff5a5a'); v.sound('miss'); v.mood(e.seat, 'ko', 99); }
    if (e.type === 'boom') { v.burst(e.x, e.y, '#ffb000', 34, 380); v.ring(e.x, e.y, '#ff5a3b', 40); v.shake(12); v.sound('boom'); }
    if (e.type === 'heal') { v.pop(e.x, e.y - 20, '+1 ❤️', '#ff9ac8'); v.sound('point'); v.mood(e.seat, 'happy', 1.2); }
    if (e.type === 'jump') v.sound([[500, 0, 0.04]]);
  },
});
function hurt(s, i, api, x, y) {
  const c = s.c[i];
  c.lives--; c.inv = 1.4; c.stun = 0.25; c.vy = -300;
  api.ev('hit', { seat: i, x: r1(x), y: r1(y) });
  if (c.lives <= 0) { c.out = true; api.ev('out', { seat: i, x: r1(c.x), y: r1(c.y) }); }
}
function boom(s, o, api) {
  api.ev('boom', { x: r1(o.x), y: r1(o.y) });
  s.c.forEach((c, i) => { if (!c.out && c.inv <= 0 && Math.hypot(c.x - o.x, c.y - 40 - o.y) < 105) { c.vx = Math.sign(c.x - o.x || 1) * 420; hurt(s, i, api, c.x, c.y - 40); } });
}

/* ================= HOOPS 2 vs 2 ================= */
// One ball, two hoops: blue shoots at the hoop on the right, orange at the one on the left. A/D run, W jumps, and you
// pick the ball up by touching it. With the ball: Space shoots (further out is harder, and a cat of the other team
// close by makes it harder still; from beyond the line it's worth 3), E passes to your teammate. Without it: Space
// swats at the ball, and knocks it loose if you're close. Most points in 75 seconds.
const HP = { GY: 470, RIM_Y: 230, RIMS: [870, 90], ARC: 300, LEN: 75 };
D.add('hoops2', {
  name: 'Hoops 2v2', icon: '🏀',
  how: 'A/D run, W jump. With the ball: Space shoots, E passes. Without it: Space steals. Most points wins!',
  keys: { KeyE: 'e' },
  init(api) {
    const s = { t: 0, sc: [0, 0], c: [220, 330, 630, 740].map((x, i) => ({ x, y: HP.GY, vx: 0, vy: 0, f: teamOf(i) ? -1 : 1, ground: true, stun: 0, cd: 0 })) };
    hoopsTip(s, api);
    return s;
  },
  step(s, ins, dt, api) {
    s.t += dt;
    const b = s.ball;
    s.c.forEach((c, i) => {
      const n = ins[i];
      c.stun = Math.max(0, c.stun - dt); c.cd = Math.max(0, c.cd - dt);
      runJump(c, n, dt, { speed: b.h === i ? 230 : 255, jump: 700 });
      fall(c, dt, HP.GY, 1800);
      if (c.stun > 0) return;
      if (b.h === i) {
        if (n.hit.a) shoot(s, i, api);
        else if (n.hit.e) pass(s, i, api);
      } else if (n.hit.a && c.cd <= 0) { // a swat: knocks the ball loose from a cat of the other team close by
        c.cd = 0.6;
        const o = b.h >= 0 ? s.c[b.h] : null;
        if (o && teamOf(b.h) !== teamOf(i) && Math.abs(o.x - c.x) < 70 && Math.abs(o.y - c.y) < 60 && api.rng() < 0.55) {
          api.ev('steal', { by: i, from: b.h, x: r1(o.x), y: r1(o.y - 60) });
          s.c[b.h].stun = 0.5;
          Object.assign(b, { h: -1, x: o.x, y: o.y - 60, vx: (c.f || 1) * 180, vy: -260, shot: -1, noGrab: 0.2, by: -1 });
        }
      }
    });
    // the ball
    b.noGrab = Math.max(0, (b.noGrab || 0) - dt);
    if (b.h >= 0) { const c = s.c[b.h]; b.x = c.x + c.f * 22; b.y = c.y - 46; b.vx = c.vx; b.vy = c.vy; }
    else {
      const py = b.y;
      b.vy += 1100 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 12 || b.x > W - 12) { b.vx = -b.vx * 0.7; b.x = clamp(b.x, 12, W - 12); }
      if (b.y > HP.GY - 12) { b.y = HP.GY - 12; b.vy = -Math.abs(b.vy) * 0.6; b.vx *= 0.85; if (Math.abs(b.vy) < 60) b.vy = 0; b.shot = -1; }
      // through a hoop, going down?
      for (let h = 0; h < 2; h++) {
        const rx = HP.RIMS[h];
        if (py < HP.RIM_Y && b.y >= HP.RIM_Y && Math.abs(b.x - rx) < 26 && b.vy > 0) {
          const team = h === 0 ? 0 : 1, pts = b.shot === team ? b.pts : 2;
          s.sc[team] += pts;
          api.ev('basket', { t: team, pts, x: rx, y: HP.RIM_Y, by: b.by });
          b.vy *= 0.4; b.vx *= 0.3; b.shot = -1;
          s.after = 0.9; s.afterTeam = 1 - team;
        }
        // (the rim: bounces off its front edge)
        const ex = rx + (h === 0 ? -28 : 28);
        if (Math.hypot(b.x - ex, b.y - HP.RIM_Y) < 14) { const a = Math.atan2(b.y - HP.RIM_Y, b.x - ex); b.vx = Math.cos(a) * 260; b.vy = Math.sin(a) * 260; api.ev('rim', {}); }
      }
      if (b.noGrab <= 0 && !(s.after > 0)) {
        const c = s.c.find(cc => cc.stun <= 0 && Math.abs(cc.x - b.x) < 30 && b.y > cc.y - 95 && b.y < cc.y + 5);
        if (c) { b.h = s.c.indexOf(c); b.shot = -1; api.ev('grab', { seat: b.h }); }
      }
    }
    if (s.after > 0) { s.after -= dt; if (s.after <= 0) { Object.assign(b, { h: -1, x: W / 2, y: 120, vx: s.afterTeam ? -60 : 60, vy: 0 }); } }
    if (s.t >= HP.LEN) api.over(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, s.sc[0] + ' to ' + s.sc[1]);
  },
  snap: s => ({ c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, z: c.stun > 0 ? 1 : 0, g: c.ground ? 1 : 0 })), k: { x: r1(s.ball.x), y: r1(s.ball.y), h: s.ball.h }, sc: s.sc, tm: Math.max(0, Math.ceil(HP.LEN - s.t)) }),
  lerpBall: (a, b, f) => (Math.abs(a.x - b.x) > 150 ? b : { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: b.h }),
  bot(s, i, dt, api) {
    const c = s.c[i], b = s.ball, out = { held: {}, hit: {} }, team = teamOf(i), rim = HP.RIMS[team];
    const go = x => { if (Math.abs(x - c.x) > 14) out.held[x > c.x ? 'right' : 'left'] = true; };
    if (b.h === i) {
      const d = Math.abs(rim - c.x), mate = s.c[i ^ 1];
      const guarded = foesOf(s.c, i).some(o => Math.abs(o.x - c.x) < 60);
      if (d < 230 && (!guarded || Math.random() < 0.02)) { if (c.ground && Math.random() < 0.5) out.hit.up = true; else out.hit.a = true; }
      else if (guarded && Math.abs(mate.x - rim) < d - 60 && Math.random() < 0.05) out.hit.e = true;
      else go(rim + (team ? 150 : -150));
    } else if (b.h >= 0 && teamOf(b.h) === team) go(rim + (team ? 260 : -260) + (i % 2 ? 60 : -60)); // (get open)
    else if (b.h >= 0) { const o = s.c[b.h]; go(o.x + (team ? 30 : -30)); if (Math.abs(o.x - c.x) < 60 && Math.random() < dt * 3 * (0.4 + api.skill)) out.hit.a = true; }
    else { go(b.x); if (b.y < c.y - 110 && Math.abs(b.x - c.x) < 50 && c.ground) out.hit.up = true; }
    return out;
  },
  draw(v, s) {
    const g = v.g;
    g.fillStyle = '#2d2350'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let x = 0; x < W; x += 30) for (let y = 40; y < 200; y += 26) v.dot(x + (y % 52 ? 15 : 0), y, 6); // (the crowd)
    g.fillStyle = '#d99a5b'; g.fillRect(0, HP.GY, W, H - HP.GY);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(W / 2, HP.GY); g.lineTo(W / 2, H); g.stroke();
    [0, 1].forEach(h => {
      const rx = HP.RIMS[h], side = h === 0 ? 1 : -1, bx = rx + side * 34;
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(rx - side * HP.ARC, HP.GY + 4); g.lineTo(rx - side * HP.ARC, HP.GY + 30); g.stroke(); // (the 3-point line)
      g.fillStyle = '#9aa3b5'; g.fillRect(bx + side * 6 - 3, HP.RIM_Y - 70, 6, HP.GY - HP.RIM_Y + 70);
      g.fillStyle = '#ffffff'; g.fillRect(bx - 4, HP.RIM_Y - 70, 8, 80);
      g.strokeStyle = v.team[h === 0 ? 0 : 1].main; g.lineWidth = 3; g.strokeRect(bx - 4, HP.RIM_Y - 70, 8, 80);
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.beginPath();
      for (let k = 0; k <= 4; k++) { const x = rx - 26 + k * 13; g.moveTo(x, HP.RIM_Y); g.lineTo(rx - 12 + k * 6, HP.RIM_Y + 34); }
      g.stroke();
      g.strokeStyle = '#ff5a1f'; g.lineWidth = 5; g.beginPath(); g.moveTo(rx - 28, HP.RIM_Y); g.lineTo(rx + 28, HP.RIM_Y); g.stroke();
    });
    s.c.forEach((c, i) => v.catSide(i, c.x, c.y, 0.95, { lookRight: c.f > 0, face: c.z ? 'dizzy' : s.k.h === i ? 'smug' : null, tilt: c.z ? Math.sin(v.now / 50) * 0.2 : 0 }));
    g.fillStyle = '#ff8a2b'; v.dot(s.k.x, s.k.y, 12);
    g.strokeStyle = '#7a3a10'; g.lineWidth = 2; g.beginPath(); g.arc(s.k.x, s.k.y, 12, 0, TAU); g.moveTo(s.k.x - 12, s.k.y); g.lineTo(s.k.x + 12, s.k.y); g.stroke();
    v.label(s.sc[0] + '  :  ' + s.sc[1], W / 2, 30, 24, '#ffffff');
    v.label(s.tm + 's', W / 2, 54, 13, 'rgba(255,255,255,.75)');
  },
  event(v, e) {
    if (e.type === 'basket') { v.party.point(e.t === teamOf(v.me)); v.pop(e.x, e.y - 40, '+' + e.pts + (e.pts === 3 ? ' FROM DOWNTOWN!' : ''), v.team[e.t].light); v.burst(e.x, e.y, '#ffd23f', 20, 260); v.sound('point'); allMood(v, e.t, 'happy', 'sad', 1.6); }
    if (e.type === 'steal') { v.pop(e.x, e.y, 'STOLEN!', '#ffd23f'); v.sound('whoosh'); v.mood(e.by, 'smug', 1.2); v.mood(e.from, 'shock', 1.2); }
    if (e.type === 'shoot') v.mood(e.seat, 'squint', 0.7);
    if (e.type === 'rim') v.sound('thud');
    if (e.type === 'grab') v.sound('tick');
  },
});
function hoopsTip(s, api) { s.ball = { h: -1, x: W / 2, y: 120, vx: 0, vy: 0, shot: -1, pts: 2, noGrab: 0, by: -1 }; }
function shoot(s, i, api) {
  const c = s.c[i], b = s.ball, team = teamOf(i), rx = HP.RIMS[team];
  const d = Math.abs(rx - c.x), guard = foesOf(s.c, i).some(o => Math.abs(o.x - c.x) < 55 && Math.abs(o.y - c.y) < 70);
  const miss = (d / 900) * 0.6 + (guard ? 0.35 : 0) + (c.ground ? 0.08 : 0);
  const err = (api.rng() - 0.5) * 2 * miss * 90;
  // an arc that lands in the hoop (give or take the error)
  const T = 0.75 + d / 1400, tx = rx + err, ty = HP.RIM_Y - 6;
  Object.assign(b, { h: -1, x: c.x + c.f * 22, y: c.y - 60, shot: team, pts: d > HP.ARC ? 3 : 2, noGrab: 0.35, by: i });
  b.vx = (tx - b.x) / T; b.vy = (ty - b.y - 0.5 * 1100 * T * T) / T;
  api.ev('shoot', { seat: i });
}
function pass(s, i, api) {
  const c = s.c[i], m = s.c[i ^ 1], b = s.ball, T = 0.55;
  Object.assign(b, { h: -1, x: c.x, y: c.y - 60, shot: -1, noGrab: 0.15, by: i });
  b.vx = (m.x - b.x) / T; b.vy = ((m.y - 60) - b.y - 0.5 * 1100 * T * T) / T;
  api.ev('pass', { seat: i });
}

/* ================= KART DASH 2 vs 2 ================= */
// Four karts, three laps round the track (through every checkpoint, in order). W go, S brake, A/D steer, Space for a
// short boost now and then. Places score for your team: 1st 4 points, 2nd 3, 3rd 2, 4th 1. More points wins.
const KT = { CX: 480, CY: 290, RX: 330, RY: 175, WIDTH: 92, LAPS: 3, CPS: 8 };
D.add('kart2', {
  name: 'Kart Dash 2v2', icon: '🏎️',
  how: 'W go, S brake, A/D steer, Space boost. Places score for your team: race together!',
  init() {
    const s = { t: 0, done: [], endT: -1 };
    s.c = [0, 1, 2, 3].map(i => {
      const a = -Math.PI / 2 - 0.12 - Math.floor(i / 2) * 0.1, off = (i % 2 ? 1 : -1) * 22;
      return { x: KT.CX + Math.cos(a) * (KT.RX + off), y: KT.CY + Math.sin(a) * (KT.RY + off), h: 0, sp: 0, cp: 0, lap: 0, boost: 0, bcd: 0, fin: -1, f: 1 };
    });
    return s;
  },
  step(s, ins, dt, api) {
    s.t += dt;
    s.c.forEach((k, i) => {
      const n = ins[i];
      k.boost = Math.max(0, k.boost - dt); k.bcd = Math.max(0, k.bcd - dt);
      if (k.fin >= 0) { k.sp *= Math.pow(0.3, dt); }
      else {
        const off = offTrack(k.x, k.y), max = (off ? 170 : 330) * (k.boost > 0 ? 1.4 : 1);
        if (n.held.up) k.sp = Math.min(max, k.sp + 420 * dt);
        else if (n.held.down) k.sp = Math.max(-100, k.sp - 600 * dt);
        else k.sp *= Math.pow(0.5, dt);
        if (k.sp > max) k.sp -= 500 * dt;
        const steer = (n.held.right ? 1 : 0) - (n.held.left ? 1 : 0);
        k.h += steer * dt * 2.9 * clamp(Math.abs(k.sp) / 140, 0.3, 1) * Math.sign(k.sp || 1);
        if (n.hit.a && k.bcd <= 0) { k.boost = 0.8; k.bcd = 3.5; k.sp = Math.max(k.sp, 300); api.ev('boost', { seat: i }); }
      }
      k.x = clamp(k.x + Math.cos(k.h) * k.sp * dt, 20, W - 20); k.y = clamp(k.y + Math.sin(k.h) * k.sp * dt, 20, H - 20);
      if (Math.abs(Math.cos(k.h)) > 0.2) k.f = Math.cos(k.h) > 0 ? 1 : -1;
      // checkpoints: angles round the middle of the track
      const a = (Math.atan2((k.y - KT.CY) / KT.RY, (k.x - KT.CX) / KT.RX) + Math.PI / 2 + TAU) % TAU;
      const next = (k.cp + 1) % KT.CPS, at = next * TAU / KT.CPS;
      let da = a - at; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.25 && k.fin < 0) {
        k.cp = next;
        if (next === 0) { k.lap++; api.ev('lap', { seat: i, lap: k.lap }); if (k.lap >= KT.LAPS) { k.fin = s.done.length; s.done.push(i); api.ev('finish', { seat: i, place: k.fin + 1 }); if (s.endT < 0) s.endT = s.t + 12; } }
      }
    });
    // bumping
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const p = s.c[a], q = s.c[b], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d < 30 && d > 0.01) { const push = (30 - d) / 2; p.x -= dx / d * push; p.y -= dy / d * push; q.x += dx / d * push; q.y += dy / d * push; p.sp *= 0.92; q.sp *= 0.92; if (!s.bumpT || s.t - s.bumpT > 0.4) { s.bumpT = s.t; api.ev('bump', { x: r1((p.x + q.x) / 2), y: r1((p.y + q.y) / 2) }); } }
    }
    if (s.done.length === 4 || (s.endT >= 0 && s.t >= s.endT) || s.t > 150) {
      const order = s.done.slice();
      s.c.map((k, i) => [k, i]).filter(([k]) => k.fin < 0).sort((p, q) => progress(q[0]) - progress(p[0])).forEach(([, i]) => order.push(i));
      const pts = [0, 0];
      order.forEach((i, place) => { pts[teamOf(i)] += 4 - place; });
      api.over(pts[0] === pts[1] ? teamOf(order[0]) : pts[0] > pts[1] ? 0 : 1, 'Team points: ' + pts[0] + ' to ' + pts[1]);
    }
  },
  snap: s => ({ c: s.c.map(k => ({ x: r1(k.x), y: r1(k.y), h: Math.round(k.h * 100) / 100, f: k.f, l: k.lap, b: k.boost > 0 ? 1 : 0, fin: k.fin, cp: k.cp })) }),
  bot(s, i, dt, api) {
    const k = s.c[i], out = { held: { up: true }, hit: {} };
    // aim a little ahead round the middle of the track
    const a = Math.atan2((k.y - KT.CY) / KT.RY, (k.x - KT.CX) / KT.RX) + 0.55;
    const lane = (i % 2 ? 1 : -1) * 18 * (1 - api.skill * 0.5);
    const tx = KT.CX + Math.cos(a) * (KT.RX + lane), ty = KT.CY + Math.sin(a) * (KT.RY + lane);
    let d = Math.atan2(ty - k.y, tx - k.x) - k.h; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (d > 0.06) out.held.right = true; else if (d < -0.06) out.held.left = true;
    if (Math.abs(d) > 0.9) out.held.up = Math.random() < 0.5;
    if (k.bcd <= 0 && Math.abs(d) < 0.2 && Math.random() < dt * (0.3 + api.skill)) out.hit.a = true;
    return out;
  },
  draw(v, s) {
    const g = v.g;
    g.fillStyle = '#4caf50'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.06)'; for (let x = 0; x < W; x += 40) g.fillRect(x, 0, 20, H);
    const ring = (r, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.ellipse(KT.CX, KT.CY, KT.RX + r, KT.RY + r, 0, 0, TAU); g.stroke(); };
    ring(0, '#e74c3c', KT.WIDTH + 12); ring(0, '#ffffff', KT.WIDTH + 4); ring(0, '#555a66', KT.WIDTH);
    g.setLineDash([18, 16]); ring(0, 'rgba(255,255,255,.5)', 3); g.setLineDash([]);
    // the start line, and the next checkpoint for you
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 6; k++) for (let j = 0; j < 2; j++) if ((k + j) % 2) g.fillRect(KT.CX - 6 + j * 6, KT.CY - KT.RY - KT.WIDTH / 2 + k * (KT.WIDTH / 6), 6, KT.WIDTH / 6);
    const mine = s.c[v.me];
    if (mine && mine.fin < 0) { const a = ((mine.cp + 1) % KT.CPS) * TAU / KT.CPS - Math.PI / 2; g.strokeStyle = 'rgba(255,230,77,.8)'; g.lineWidth = 4; g.beginPath(); g.arc(KT.CX + Math.cos(a) * KT.RX, KT.CY + Math.sin(a) * KT.RY, 20 + Math.sin(v.now / 150) * 3, 0, TAU); g.stroke(); }
    s.c.map((k, i) => [k, i]).sort((p, q) => p[0].y - q[0].y).forEach(([k, i]) => {
      const col = v.team[teamOf(i)];
      g.save(); g.translate(k.x, k.y); g.rotate(k.h);
      if (k.b) { g.fillStyle = 'rgba(255,170,40,.7)'; g.beginPath(); g.moveTo(-18, -6); g.lineTo(-34 - Math.random() * 10, 0); g.lineTo(-18, 6); g.fill(); }
      g.fillStyle = '#222'; g.fillRect(-14, -14, 9, 5); g.fillRect(-14, 9, 9, 5); g.fillRect(7, -14, 9, 5); g.fillRect(7, 9, 9, 5);
      g.fillStyle = col.dark; v.roundRect(-17, -11, 34, 22, 7); g.fill();
      g.fillStyle = i % 2 ? col.light : col.main; v.roundRect(-14, -8, 28, 16, 5); g.fill();
      g.restore();
      v.catTop(i, k.x, k.y - 8, 0.55, { label: false, lookRight: k.f > 0, bob: 0.2, face: k.fin === 0 ? 'happy' : k.b ? 'squint' : null });
      v.label((k.fin >= 0 ? ['1st', '2nd', '3rd', '4th'][k.fin] : 'Lap ' + Math.min(KT.LAPS, k.l + 1)), k.x, k.y - 30, 11, i === v.me ? '#ffd23f' : col.light);
    });
  },
  event(v, e) {
    if (e.type === 'lap') { if (e.seat === v.me) { v.pop(W / 2, H / 2, e.lap >= KT.LAPS ? 'FINISH!' : 'Lap ' + (e.lap + 1) + '!', '#ffd23f'); v.sound('tick'); } v.mood(e.seat, 'happy', 1); }
    if (e.type === 'finish') { v.sound(e.place === 1 ? 'point' : 'tick'); v.mood(e.seat, e.place <= 2 ? 'happy' : 'sad', 3); }
    if (e.type === 'bump') { v.burst(e.x, e.y, '#ffffff', 6, 160); v.sound('thud'); }
    if (e.type === 'boost') v.mood(e.seat, 'squint', 0.8);
  },
});
const offTrack = (x, y) => { const d = Math.hypot((x - KT.CX) / KT.RX, (y - KT.CY) / KT.RY); return Math.abs(d - 1) * Math.min(KT.RX, KT.RY) > KT.WIDTH / 2 + 4; };
const progress = k => k.lap * KT.CPS + k.cp;

/* ================= CAT CANNONS 2 vs 2 ================= */
// Each cat has a cannon on its team's hill. Aim with the mouse, hold the button to charge, let go to fire (then it
// reloads). Watch the wind. A direct hit takes 2 hearts, a near miss 1; 3 hearts each. The last team with a cat left wins.
const CN = { GRAV: 520, POS: [130, 290, 670, 830], RELOAD: 2.6, CHARGE: 1.2, PMIN: 260, PMAX: 880 };
const cnGround = x => 470 - 70 * Math.exp(-Math.pow((x - 210) / 170, 2)) - 70 * Math.exp(-Math.pow((x - 750) / 170, 2)) - 50 * Math.exp(-Math.pow((x - 480) / 70, 2));
D.add('cannons2', {
  name: 'Cat Cannons 2v2', icon: '💥',
  how: 'Aim with the mouse, hold to charge, let go to fire. Watch the wind! Last team standing wins.',
  init(api) { return { t: 0, wind: (api.rng() - 0.5) * 160, windT: 6, balls: [], c: CN.POS.map((x, i) => ({ x, y: cnGround(x), f: teamOf(i) ? -1 : 1, hp: 3, rl: 0.8 + i * 0.2, ch: -1, a: teamOf(i) ? -2.4 : -0.75, out: false })) }; },
  step(s, ins, dt, api) {
    s.t += dt;
    s.windT -= dt;
    if (s.windT <= 0) { s.windT = 6; s.wind = (api.rng() - 0.5) * 200; api.ev('wind', {}); }
    s.c.forEach((c, i) => {
      if (c.out) return;
      const n = ins[i];
      c.rl = Math.max(0, c.rl - dt);
      const a = Math.atan2(n.ay - (c.y - 30), n.ax - c.x);
      c.a = clamp(a, -Math.PI + 0.1, -0.1);
      if (n.held.fire && c.rl <= 0) c.ch = c.ch < 0 ? 0 : Math.min(CN.CHARGE, c.ch + dt);
      else if (c.ch >= 0) {
        const p = CN.PMIN + (CN.PMAX - CN.PMIN) * (c.ch / CN.CHARGE);
        s.balls.push({ x: c.x + Math.cos(c.a) * 34, y: c.y - 30 + Math.sin(c.a) * 34, vx: Math.cos(c.a) * p, vy: Math.sin(c.a) * p, by: i });
        c.ch = -1; c.rl = CN.RELOAD;
        api.ev('fire', { seat: i, x: r1(c.x), y: r1(c.y - 30) });
      }
    });
    for (let k = s.balls.length - 1; k >= 0; k--) {
      const b = s.balls[k];
      b.vx += s.wind * dt; b.vy += CN.GRAV * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      let hit = b.x < -50 || b.x > W + 50 || b.y > H + 30;
      const direct = s.c.find(c => !c.out && Math.hypot(c.x - b.x, c.y - 30 - b.y) < 30);
      if (!hit && (direct || b.y >= cnGround(b.x))) {
        hit = true;
        api.ev('boom', { x: r1(b.x), y: r1(b.y) });
        s.c.forEach((c, i) => {
          if (c.out) return;
          const d = Math.hypot(c.x - b.x, c.y - 30 - b.y), dmg = c === direct ? 2 : d < 75 ? 1 : 0;
          if (!dmg) return;
          c.hp -= dmg;
          api.ev('hurt', { seat: i, by: b.by, dmg, x: r1(c.x), y: r1(c.y - 60) });
          if (c.hp <= 0) { c.out = true; api.ev('out', { seat: i }); }
        });
      }
      if (hit) s.balls.splice(k, 1);
    }
    const left = [0, 1].map(t => s.c.filter((c, i) => teamOf(i) === t && !c.out).length);
    if (!left[0] || !left[1]) api.over(!left[0] && !left[1] ? -1 : left[0] ? 0 : 1, 'Last team standing');
    else if (s.t > 120) { const hp = [0, 1].map(t => s.c.reduce((n, c, i) => n + (teamOf(i) === t ? Math.max(0, c.hp) : 0), 0)); api.over(hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1, 'More hearts left'); }
  },
  snap: s => ({ c: s.c.map(c => ({ x: c.x, y: r1(c.y), f: c.f, hp: c.hp, a: Math.round(c.a * 100) / 100, ch: c.ch >= 0 ? Math.round(c.ch / CN.CHARGE * 20) / 20 : -1, rl: c.rl > 0 ? 1 : 0, o: c.out ? 1 : 0 })), b: s.balls.map(b => [r1(b.x), r1(b.y)]), w: Math.round(s.wind) }),
  bot(s, i, dt, api) {
    const c = s.c[i], out = { held: {}, hit: {}, ax: c.x + c.f * 100, ay: c.y - 130 };
    if (c.out) return out;
    s.bs = s.bs || {};
    const b = s.bs[i] || (s.bs[i] = { aim: null, hold: 0 });
    const foes = foesOf(s.c, i).filter(o => !o.out);
    if (!foes.length) return out;
    if (!b.aim && c.rl <= 0) {
      // try some shots in its head (with the wind) and pick the one that lands closest
      const t = foes[Math.floor(Math.random() * foes.length)];
      let best = 1e9;
      for (let k = 0; k < 40; k++) {
        const a = -0.3 - Math.random() * 1.2, ang = c.f > 0 ? a : -Math.PI - a, ch = 0.3 + Math.random() * 0.7;
        const p = CN.PMIN + (CN.PMAX - CN.PMIN) * ch;
        let x = c.x, y = c.y - 30, vx = Math.cos(ang) * p, vy = Math.sin(ang) * p;
        for (let st = 0; st < 400 && y < cnGround(x) && x > 0 && x < W; st++) { vx += s.wind / 60; vy += CN.GRAV / 60; x += vx / 60; y += vy / 60; }
        const d = Math.abs(x - t.x) + (1 - api.skill) * Math.random() * 120;
        if (d < best) { best = d; b.aim = { ang, ch }; }
      }
      b.hold = 0;
    }
    if (b.aim) {
      out.ax = c.x + Math.cos(b.aim.ang) * 100; out.ay = c.y - 30 + Math.sin(b.aim.ang) * 100;
      b.hold += dt;
      if (b.hold < b.aim.ch * CN.CHARGE + 0.05) out.held.fire = true; else b.aim = null;
    }
    return out;
  },
  draw(v, s) {
    const g = v.g;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#ffb07a'); sky.addColorStop(1, '#ffe2b8');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5aa04a'; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, cnGround(x));
    g.lineTo(W, H); g.fill();
    g.fillStyle = '#4a8a3c'; g.fillRect(0, 488, W, H - 488);
    s.c.forEach((c, i) => {
      if (c.o) { v.catSide(i, c.x, c.y, 0.8, { face: 'ko', alpha: 0.4, label: false, tilt: 1.3 * c.f }); return; }
      v.catSide(i, c.x - c.f * 16, c.y, 0.8, { lookRight: c.f > 0, face: c.ch >= 0 ? 'angry' : c.hp <= 1 ? 'shock' : null });
      g.save(); g.translate(c.x, c.y - 30); g.rotate(c.a);
      g.fillStyle = '#3a3a44'; v.roundRect(0, -9, 44, 18, 6); g.fill();
      g.fillStyle = v.team[teamOf(i)].main; g.fillRect(30, -10, 6, 20);
      g.restore();
      g.fillStyle = '#5b3a1e'; v.dot(c.x, c.y - 24, 13);
      if (c.ch >= 0) { g.fillStyle = 'rgba(0,0,0,.4)'; v.roundRect(c.x - 24, c.y - 132, 48, 7, 3); g.fill(); g.fillStyle = '#ffd23f'; v.roundRect(c.x - 24, c.y - 132, 48 * c.ch, 7, 3); g.fill(); }
      hearts(v, c.x, c.y - 118, c.hp, 3, v.team[teamOf(i)].light);
    });
    g.fillStyle = '#2b2b35';
    for (const [x, y] of s.b) v.dot(x, y, 8);
    // the wind
    const wx = W / 2;
    v.label('Wind', wx, 52, 12, '#7a4a22');
    g.strokeStyle = '#7a4a22'; g.lineWidth = 4; g.beginPath(); g.moveTo(wx, 64); g.lineTo(wx + s.w * 0.5, 64); g.stroke();
    g.fillStyle = '#7a4a22'; g.beginPath(); g.moveTo(wx + s.w * 0.5 + Math.sign(s.w) * 8, 64); g.lineTo(wx + s.w * 0.5, 58); g.lineTo(wx + s.w * 0.5, 70); g.fill();
  },
  event(v, e) {
    if (e.type === 'fire') { v.burst(e.x, e.y, '#ffffff', 8, 160); v.sound('boom'); v.mood(e.seat, 'smug', 0.6); }
    if (e.type === 'boom') { v.burst(e.x, e.y, '#ff9a3b', 24, 320); v.ring(e.x, e.y, '#ff5a3b', 30); v.shake(8); }
    if (e.type === 'hurt') { v.pop(e.x, e.y, '−' + e.dmg, '#ff5a5a'); v.mood(e.seat, 'hurt', 1.3); if (teamOf(e.by) !== teamOf(e.seat)) v.mood(e.by, 'happy', 1.2); else v.mood(e.by, 'shock', 1.2); }
    if (e.type === 'out') { v.sound('miss'); v.mood(e.seat, 'ko', 99); }
  },
});

/* ================= POOP SHOWDOWN 2 vs 2 ================= */
// Two cats with big butts on each side of the bathroom. Space fires a poop out of your back (so turn your butt toward
// them: walk away from them, then fire), W jumps. A poop hit takes a third of your health and knocks you away. The team
// with a cat left wins the round; first to 2 rounds.
const PO = { GY: 460, HP: 100, DMG: 34, SPEED: 520, RELOAD: 0.9, WIN: 2 };
D.add('poop2', {
  name: 'Poop Showdown 2v2', icon: '💩',
  how: 'A/D walk, W jump, Space poops out of your back. Turn your butt toward them!',
  init() { const s = { wins: [0, 0] }; poopRound(s); return s; },
  step(s, ins, dt, api) {
    if (s.pause > 0) { s.pause -= dt; if (s.pause <= 0) { if (Math.max(...s.wins) >= PO.WIN) api.over(s.wins[0] > s.wins[1] ? 0 : 1, 'First to ' + PO.WIN + ' rounds'); else poopRound(s); } return; }
    s.t += dt;
    s.c.forEach((c, i) => {
      if (c.out) { c.vx *= 0.9; fall(c, dt, PO.GY, 1700); return; } // (knocked out: it drops to the floor)
      const n = ins[i];
      c.rl = Math.max(0, c.rl - dt); c.stun = Math.max(0, c.stun - dt); c.strain = Math.max(0, c.strain - dt);
      if (runJump(c, n, dt, { speed: 230, jump: 620 })) api.ev('jump', {});
      fall(c, dt, PO.GY, 1700);
      if (n.hit.a && c.rl <= 0 && c.stun <= 0) {
        c.rl = PO.RELOAD; c.strain = 0.2;
        s.poops.push({ x: c.x - c.f * 40, y: c.y - 34, vx: -c.f * PO.SPEED, vy: -60, by: i });
        api.ev('poop', { seat: i, x: r1(c.x - c.f * 40), y: r1(c.y - 34) });
      }
    });
    for (let k = s.poops.length - 1; k >= 0; k--) {
      const p = s.poops[k];
      p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      let gone = p.x < -20 || p.x > W + 20 || p.y > PO.GY + 4;
      if (!gone) {
        const j = s.c.findIndex((c, jj) => !c.out && jj !== p.by && Math.abs(c.x - p.x) < 30 && p.y > c.y - 80 && p.y < c.y);
        if (j >= 0) {
          const c = s.c[j], friendly = teamOf(j) === teamOf(p.by);
          c.hp -= friendly ? PO.DMG / 2 : PO.DMG; c.vx = Math.sign(p.vx) * 380; c.vy = -320; c.stun = 0.35;
          api.ev('splat', { seat: j, by: p.by, x: r1(p.x), y: r1(p.y) });
          if (c.hp <= 0) { c.out = true; api.ev('out', { seat: j }); }
          gone = true;
        }
      }
      if (gone) s.poops.splice(k, 1);
    }
    const left = [0, 1].map(t => s.c.filter((c, i) => teamOf(i) === t && !c.out).length);
    let w = null;
    if (!left[0] || !left[1]) w = !left[0] && !left[1] ? -1 : left[0] ? 0 : 1;
    else if (s.t > 50) { const hp = [0, 1].map(t => s.c.reduce((n, c, i) => n + (teamOf(i) === t && !c.out ? c.hp : 0), 0)); w = hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1; }
    if (w !== null) { if (w >= 0) s.wins[w]++; s.pause = 1.8; api.ev('round', { w }); }
  },
  snap: s => ({ c: s.c.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.f, hp: Math.max(0, Math.round(c.hp)), o: c.out ? 1 : 0, st: c.strain > 0 ? 1 : 0, z: c.stun > 0 ? 1 : 0, vx: Math.round(c.vx) })), p: s.poops.map(p => [r1(p.x), r1(p.y)]), w: s.wins }),
  bot(s, i, dt, api) {
    const c = s.c[i], out = { held: {}, hit: {} };
    if (c.out) return out;
    const foes = foesOf(s.c, i).filter(o => !o.out);
    if (!foes.length) return out;
    const e = foes.reduce((a, b) => (Math.abs(a.x - c.x) < Math.abs(b.x - c.x) ? a : b));
    const dx = e.x - c.x, butt = -c.f, far = Math.abs(dx); // (which way its butt points)
    // dodge a poop coming at it
    const incoming = s.poops.find(p => teamOf(p.by) !== teamOf(i) && Math.sign(c.x - p.x) === Math.sign(p.vx) && Math.abs(c.x - p.x) < 160);
    if (incoming && c.ground && Math.random() < 0.15 + api.skill * 0.3) out.hit.up = true;
    if (far > 230 + (i % 2) * 40) out.held[dx > 0 ? 'right' : 'left'] = true; // (too far: walk up to them, facing them)
    else if (Math.sign(dx) !== butt) out.held[dx > 0 ? 'left' : 'right'] = true; // (close: one step away turns its butt their way)
    else if (c.rl <= 0 && Math.abs(e.y - c.y) < 70 && Math.random() < dt * 6 * (0.4 + api.skill)) out.hit.a = true;
    return out;
  },
  draw(v, s) {
    const g = v.g;
    g.fillStyle = '#bfe6f2'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2;
    for (let x = 0; x < W; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, PO.GY); g.stroke(); }
    for (let y = 0; y < PO.GY; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    v.label('🚽', 70, PO.GY - 10, 70, '#fff'); v.label('🛁', W - 90, PO.GY - 10, 80, '#fff'); v.label('🧻', W / 2, 120, 40, '#fff');
    g.fillStyle = '#e9e1d4'; g.fillRect(0, PO.GY, W, H - PO.GY);
    g.fillStyle = 'rgba(0,0,0,.05)'; for (let x = 0; x < W; x += 60) g.fillRect(x, PO.GY, 30, H - PO.GY);
    s.c.forEach((c, i) => {
      if (c.o) { v.catSide(i, c.x, c.y, 0.9, { face: 'ko', alpha: 0.35, tilt: 1.4 * c.f, label: false }); return; }
      // the big butt, behind it
      // (two round cheeks in its fur, with a team-colored band, and a tail that wags faster while it strains)
      const bx = c.x - c.f * 20, wob = Math.sin(v.now / 120 + i) * 1.5, fur = v.fur(i), by = c.y - 26 + wob;
      const wag = Math.sin(v.now / (c.st ? 40 : 160) + i) * 0.5;
      g.strokeStyle = fur.dark; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx - c.f * 14, by - 14); g.quadraticCurveTo(bx - c.f * 34, by - 40 + wag * 20, bx - c.f * (30 + wag * 14), by - 62); g.stroke();
      g.strokeStyle = fur.mid; g.lineWidth = 4; g.stroke();
      for (const [ox, oy] of [[-c.f * 10, -6], [-c.f * 2, 4]]) {
        g.fillStyle = fur.dark; v.dot(bx + ox, by + oy, 20);
        g.fillStyle = fur.mid; v.dot(bx + ox, by + oy, 17.5);
        g.fillStyle = 'rgba(255,255,255,.28)'; v.dot(bx + ox - c.f * 5, by + oy - 7, 6);
      }
      g.fillStyle = v.team[teamOf(i)].main; g.fillRect(bx - 20, by - 22, 32, 5);
      if (c.st) { g.fillStyle = 'rgba(140, 200, 90, .55)'; for (let k = 0; k < 4; k++) v.dot(bx - c.f * (24 + k * 9), c.y - 30 + Math.sin(k * 2 + v.now / 50) * 6, 7 - k); }
      v.catSide(i, c.x, c.y, 0.9, { lookRight: c.f > 0, face: c.z ? 'dizzy' : c.st ? 'squint' : c.hp <= 34 ? 'shock' : null, tilt: c.z ? Math.sin(v.now / 60) * 0.15 : 0 });
      g.fillStyle = 'rgba(0,0,0,.35)'; v.roundRect(c.x - 24, c.y - 116, 48, 6, 3); g.fill();
      g.fillStyle = c.hp > 50 ? '#6be38f' : c.hp > 25 ? '#ffd23f' : '#ff5a5a'; v.roundRect(c.x - 24, c.y - 116, 48 * c.hp / PO.HP, 6, 3); g.fill();
    });
    for (const [x, y] of s.p) v.label('💩', x, y + 8, 26, '#7a4a22');
    roundDots(v, s.w, PO.WIN);
  },
  event(v, e) {
    if (e.type === 'poop') { v.sound([[160, 0, 0.12, { w: 'noise', to: 60 }]]); v.mood(e.seat, 'squint', 0.5); }
    if (e.type === 'splat') { v.burst(e.x, e.y, '#8a5a2b', 18, 260); v.pop(e.x, e.y - 30, 'SPLAT!', '#c98a4a'); v.shake(7); v.sound('thud'); v.mood(e.seat, 'hurt', 1.2); v.mood(e.by, teamOf(e.by) === teamOf(e.seat) ? 'shock' : 'smug', 1.1); }
    if (e.type === 'out') { v.sound('miss'); v.mood(e.seat, 'ko', 99); }
    if (e.type === 'round' && e.w >= 0) { v.party.point(e.w === teamOf(v.me)); allMood(v, e.w, 'happy', 'sad', 1.6); }
  },
});
function poopRound(s) {
  s.t = 0; s.pause = 0; s.poops = [];
  s.c = [160, 300, 660, 800].map((x, i) => ({ x, y: PO.GY, vx: 0, vy: 0, f: teamOf(i) ? 1 : -1, ground: true, hp: PO.HP, rl: 0.5, stun: 0, strain: 0, out: false }));
}

})();
