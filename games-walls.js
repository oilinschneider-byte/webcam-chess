/* Classic Games: Wall Duel. A top-down shootout. Move with WASD, aim with the mouse and click to shoot. Space drops
   a dot where you stand, and it joins up with your nearest dots by walls in your color. You can walk and shoot through
   your own walls; bullets stop at the first wall of the other cat's they hit. Touching the other cat's walls hurts,
   and so does their bullet, and so does staying outside the safe zone (a circle that slowly shrinks towards the
   middle). Each cat has a shield that takes the first hit; the second is a K.O. Every piece of wall is shielded for 2
   seconds, then open for 1 second: a bullet breaks an open dot (and the walls joined to it) in one hit, and an open
   wall in two.

   Online, each app moves its own cat, fires its own bullets and builds its own walls (so it all feels instant), and
   decides when its own cat is knocked out. Both apps fly every bullet. The host's app decides which walls break and
   who won. Against a bot, everything runs here. */
(() => {
'use strict';

const { $, setMsg, sound, gauss, skillOf } = CA.games.kit;
const F = CA.floppy; // (the drawing helpers and controls: see games-floppy.js)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const num = (v, d) => (Number.isFinite(v) ? v : d);

const W = 960, H = 540;          // the arena (the canvas is scaled to fit the page)
const EDGE = 16;                 // how thick the border walls are
const DT = 1 / 120;              // the game runs in small, fixed steps
const CR = 15;                   // a cat's size (the circle that gets hit)
const SPEED = 130, ACCEL = 1000; // how fast a cat walks, and how quickly it gets going (and stops)
const BS = 220, BR = 5;          // a bullet's speed and size
const FIRE_WAIT = 0.6, MAX_SHOTS = 4, SHOT_LIFE = 6;
const DR = 8, LW = 6;            // a dot's size, and how thick the walls between dots are
const GAP = 40;                  // dots can't be closer together than this
const MAX_DOTS = 14;             // more than this, and your oldest dot goes
const BUILD_WAIT = 0.25;
const LINK = 170, LINKS = 2;     // a new dot joins up with your (up to 2) nearest dots within this distance
const SHIELD = 2, OPEN = 1, CYCLE = SHIELD + OPEN; // every piece of wall: 2 seconds shielded, then 1 second open
const LINE_HP = 2;               // an open wall takes 2 hits to break (an open dot just 1)
const READY = 1.8;               // the 3-2-1 countdown
const SAFE = 1.5;                // nobody can be knocked out this soon after GO
const HIT_SAFE = 1.2;            // after your shield breaks, nothing can hurt you for this long
const ZX = W / 2, ZY = H / 2;    // the middle of the safe zone
const ZONE_MAX = Math.hypot(W / 2, H / 2) + 10, ZONE_MIN = 90; // the zone's size (radius) at the start, and at its smallest
const ZONE_START = 8, ZONE_END = 110; // it starts shrinking 8 seconds in, and is at its smallest at 110
const ZONE_HURT = 1.5;           // this long outside the zone, and you take a hit
const DRAW_AT = 150;             // nobody knocked out by then: it's a draw
const HOME = [[96, 250], [W - 96, H - 250]]; // where the cats start (cat 0 is the host's), clear of the camera walls
const TEAM = [
  { main: '#2f7bff', light: '#a9cbff', dark: '#163f99' }, // the host: blue
  { main: '#ff8a1f', light: '#ffd0a1', dark: '#9a4700' }, // the guest: orange
];
const SEND_MS = 50;
const VIEW_DELAY = 110;          // the other player's cat is drawn this many ms in the past, so it moves smoothly
const HELP = 'WASD move · mouse aim · click or hold to shoot · Space build · enemy walls hurt · shoot walls when they flash open · stay in the zone';
const HELP_TOUCH = 'Stick moves · Shoot aims at the other cat · Build drops a dot · enemy walls hurt · shoot walls when they flash open · stay in the zone';

CA.games.add('walls', {
  name: 'Wall Duel', icon: '🚧',
  blurb: 'WASD to move, aim with the mouse, click (or hold) to shoot. Space drops a dot, and your dots that are close together join up into walls. ' +
    "Touching the other cat's walls hurts! Your shield takes the first hit, the second knocks you out. Walls flash open every few seconds: shoot them then to break them. Stay inside the shrinking zone!",
  start(ctx) { play(ctx); },
});

// The point on the line from (ax, ay) to (bx, by) nearest to (px, py), and how far away it is.
function nearest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const k = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  const x = ax + dx * k, y = ay + dy * k;
  return { x, y, d: Math.hypot(px - x, py - y) };
}

// A cat's picture (with its arms: these cats are small), looking right or left, with its mouth closed or open:
// pics[1 or -1][0 or 1]. (F.drawBody draws it.)
function pictures(eq) {
  const pics = { 1: [null, null], '-1': [null, null] };
  [1, -1].forEach(look => [0, 1].forEach(open => {
    const svg = CA.catSVG(eq, { bg: false, anim: false, mouth: open ? 'open' : 'closed', look: look * 6 })
      .replace('<svg ', '<svg width="200" height="240" ');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 240;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      pics[look][open] = c;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }));
  return pics;
}

function play(ctx) {
  const online = !ctx.bot;
  const host = ctx.isHost;              // (against a bot, you're always the host)
  const meI = host ? 0 : 1, themI = 1 - meI;
  const flip = meI === 1;               // the guest sees the arena mirrored, so you always start on the left
  const sx = x => (flip ? W - x : x);
  const skill = skillOf(ctx);

  ctx.stage.innerHTML =
    '<div class="g-walls"><canvas class="bb-canvas wd-canvas" id="wdCanvas" width="' + W + '" height="' + H + '"></canvas>' +
    '<div class="bb-pad wd-pad" id="wdPad"><div class="wd-stick" id="wdStick" aria-label="Move"><span id="wdKnob"></span></div>' +
    '<div><button class="wd-build" data-k="b" aria-label="Build a wall dot">🧱 Build</button>' +
    '<button class="bb-v wd-fire" data-k="f" aria-label="Shoot">Shoot</button></div></div>' +
    '<p class="g-msg" id="wdMsg"></p></div>';
  const cv = $('wdCanvas');
  const g = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR;
  cv.height = H * DPR;
  const { dot, label, bigText, roundRect } = F.painter(g, W);

  /* ---------- the cats ---------- */

  function newCat(i, eq, name) {
    const [x, y] = HOME[i], [ox, oy] = HOME[1 - i], d = Math.hypot(ox - x, oy - y);
    return {
      i, name, fur: F.fur(eq), pics: pictures(eq), x, y, vx: 0, vy: 0, ax: (ox - x) / d, ay: (oy - y) / d,
      shield: true, hurtT: 0, outT: 0, dead: false, why: '', spin: 0, fireCd: 0, buildCd: 0, lastBuild: -99, pb: false, rv: null,
    };
  }
  const cats = [];
  cats[meI] = newCat(meI, CA.profile.equip, 'You');
  cats[themI] = newCat(themI, ctx.oppEquip, ctx.oppName);
  const me = cats[meI], them = cats[themI];
  const local = ctx.bot ? [me, them] : [me];           // the cats this app moves
  const vw = c => c.rv || c;                           // a cat as this app shows it
  const other = c => cats[1 - c.i];

  /* ---------- the walls and the bullets ---------- */

  // Each player's walls: dots and the lines between them (each by id).
  const walls = [0, 1].map(() => ({ dots: new Map(), lines: new Map(), next: 1, nextLine: 1 }));
  const ends = (o, l) => [walls[o].dots.get(l.a), walls[o].dots.get(l.b)];
  const bullets = [];
  const shotN = [1, 1];
  const liveShots = o => bullets.reduce((n, b) => n + (b.o === o && !b.gone && b.fade < 0 ? 1 : 0), 0);

  let phase = 'ready', t = 0, count = 0, goAt = 0, winner = null, zoneNoted = false;
  let off = null;                // (guest) how far ahead the host's clock is
  // The clock both apps share: the host's seconds since the game started. Walls open and close by it.
  const T = () => (host || off === null ? t : t + off);
  const playT = () => T() - READY;
  let shake = 0, lastBounce = 0, lastMsg = performance.now();
  const fx = [];

  // The space inside the hedge around the arena.
  const ARENA = { l: EDGE, r: W - EDGE, t: EDGE, b: H - EDGE };
  const arena = () => ARENA;

  // How big (its radius) the safe zone is: it slowly shrinks towards the middle.
  function zoneR(at = T()) {
    const k = clamp((at - READY - ZONE_START) / (ZONE_END - ZONE_START), 0, 1);
    return ZONE_MAX + (ZONE_MIN - ZONE_MAX) * k;
  }
  const outside = (x, y, at) => Math.hypot(x - ZX, y - ZY) > zoneR(at);

  // Every piece of wall is shielded for 2 seconds, then open for 1 second, over and over, counting from when it was
  // built. This gives how many seconds it stays open (0 while it's shielded).
  function openLeft(p, at = T()) {
    const a = at - p.born;
    if (a < 0) return 0;
    const m = a % CYCLE;
    return m >= SHIELD ? CYCLE - m : 0;
  }

  // The pieces of wall within r of (x, y), as keys ('d0:5' is dot 5 of player 0, 'l1:7' line 7 of player 1).
  function overlaps(x, y, r) {
    const out = new Set();
    for (let o = 0; o < 2; o++) {
      for (const d of walls[o].dots.values()) if (Math.hypot(d.x - x, d.y - y) < r + DR) out.add('d' + o + ':' + d.id);
      for (const l of walls[o].lines.values()) {
        const [a, b] = ends(o, l);
        if (a && b && nearest(x, y, a.x, a.y, b.x, b.y).d < r + LW / 2) out.add('l' + o + ':' + l.id);
      }
    }
    return out;
  }

  /* ---------- building ---------- */

  // The dots of cat c's that a new dot at (x, y) would join up with: its nearest ones (up to 2) within LINK, as long
  // as the wall wouldn't go through the other cat or right past another dot.
  function linksFor(c, x, y) {
    const v = vw(other(c)), out = [];
    const near = [...walls[c.i].dots.values()].map(d => ({ d, r: Math.hypot(d.x - x, d.y - y) }))
      .filter(o => o.r <= LINK).sort((a, b) => a.r - b.r);
    for (const { d } of near) {
      if (out.length >= LINKS) break;
      if (!other(c).dead && nearest(v.x, v.y, d.x, d.y, x, y).d < CR + LW / 2 + 6) continue;
      let blocked = false;
      for (const w of walls) {
        for (const e of w.dots.values()) if (e !== d && nearest(e.x, e.y, d.x, d.y, x, y).d < DR + LW / 2 + 2) blocked = true;
      }
      if (!blocked) out.push(d);
    }
    return out;
  }

  // Drops a dot where cat c is standing, joined up with its nearest dots. (True if it built one.)
  function build(c) {
    if (phase !== 'play' || c.dead || c.buildCd > 0) return false;
    const now = T(), x = c.x, y = c.y;
    const no = text => { if (c === me) hint(text, true); return false; };
    for (const w of walls) for (const d of w.dots.values()) if (Math.hypot(d.x - x, d.y - y) < GAP) return no('Too close to another dot');
    for (let o = 0; o < 2; o++) {
      for (const l of walls[o].lines.values()) {
        const [a, b] = ends(o, l);
        if (a && b && nearest(x, y, a.x, a.y, b.x, b.y).d < DR + LW / 2 + 2) return no("Can't build on a line");
      }
    }
    const v = vw(other(c));
    if (!other(c).dead && Math.hypot(v.x - x, v.y - y) < CR + DR + 8) return no('Too close to the other cat');
    const w = walls[c.i];
    const to = linksFor(c, x, y);
    const id = w.next++;
    const d = { id, x, y, born: now, grace: false };
    w.dots.set(id, d);
    const lines = to.map(p => ({ id: w.nextLine++, a: p.id, b: id, born: now, hp: LINE_HP, grace: false }));
    lines.forEach(l => w.lines.set(l.id, l));
    const dropped = [];
    while (w.dots.size > MAX_DOTS) { const old = w.dots.keys().next().value; removeDot(c.i, old, true); dropped.push(old); }
    c.lastBuild = now;
    c.buildCd = BUILD_WAIT;
    graceFor(c.i, d, lines);
    fx.push({ k: 'ring', x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, r: DR, c: TEAM[c.i].main });
    sound([[440, 0, 0.04], [660, 0.03, 0.05]]);
    if (online && c === me) ctx.send({ t: 'dot', id, x: r1(x), y: r1(y), ls: lines.map(l => [l.id, l.a]), b: r3(now), dr: dropped });
    return true;
  }

  // A new piece of wall that's already touching the other cat (online, it can land right on you) doesn't knock it out
  // until it has stepped off it once.
  function graceFor(o, d, lines) {
    const c = cats[1 - o];
    if (!local.includes(c) || c.dead) return;
    if (d && Math.hypot(d.x - c.x, d.y - c.y) < CR + DR) d.grace = true;
    for (const l of lines) {
      const [a, b] = ends(o, l);
      if (a && b && nearest(c.x, c.y, a.x, a.y, b.x, b.y).d < CR + LW / 2) l.grace = true;
    }
  }

  // Takes away a dot and the walls joined to it. (quiet: no shatter, for your oldest dot going.)
  function removeDot(o, id, quiet) {
    const w = walls[o], d = w.dots.get(id);
    if (!d) return null;
    for (const l of [...w.lines.values()]) {
      if (l.a !== id && l.b !== id) continue;
      const [a, b] = ends(o, l);
      if (a && b) { if (quiet) fadeLine(o, a, b); else shatterLine(o, a, b); }
      w.lines.delete(l.id);
    }
    w.dots.delete(id);
    if (quiet) fx.push({ k: 'ring', x: d.x, y: d.y, vx: 0, vy: 0, life: 0.3, max: 0.3, r: DR, c: 'rgba(120, 130, 150, .7)' });
    else burst(d.x, d.y, TEAM[o].main, 12, 260);
    return d;
  }

  // (The host, or against a bot:) a bullet hit an open piece of wall. A dot breaks, and takes its walls with it;
  // a wall loses 1 of its 2 hit points.
  function breakPiece(o, k, id, b) {
    const w = walls[o];
    let hp = 0;
    if (k === 'd') {
      if (!removeDot(o, id)) return;
      sound([[1500, 0, 0.03], [900, 0.02, 0.05], [420, 0.05, 0.09]]);
    } else {
      const l = w.lines.get(id);
      if (!l) return;
      hp = --l.hp;
      const [a, c] = ends(o, l);
      if (hp <= 0) { w.lines.delete(id); if (a && c) shatterLine(o, a, c); sound([[1300, 0, 0.03], [700, 0.03, 0.08]]); }
      else { if (a && c) burst((a.x + c.x) / 2, (a.y + c.y) / 2, TEAM[o].main, 5, 160); sound([[900, 0, 0.04]]); }
    }
    shake = Math.max(shake, 4);
    if (online) ctx.send({ t: 'brk', o, k, id, hp, bo: b.o, bi: b.id });
  }

  /* ---------- shooting ---------- */

  function shoot(c, dx, dy) { // (true if it fired)
    if (phase !== 'play' || c.dead || c.fireCd > 0 || liveShots(c.i) >= MAX_SHOTS) return false;
    const len = Math.hypot(dx, dy);
    if (!len) return false;
    c.ax = dx / len;
    c.ay = dy / len;
    const b = addBullet(c.i, shotN[c.i]++, c.x, c.y, c.ax * BS, c.ay * BS);
    c.fireCd = FIRE_WAIT;
    fx.push({ k: 'ring', x: c.x + c.ax * (CR + 6), y: c.y + c.ay * (CR + 6), vx: 0, vy: 0, life: 0.15, max: 0.15, r: 3, c: '#fff6c8' });
    sound([[900, 0, 0.03], [600, 0.02, 0.05]]);
    if (online && c === me) ctx.send({ t: 'shot', id: b.id, x: r1(b.x), y: r1(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy) });
    return true;
  }

  // A bullet starts in the middle of its cat. It flies through any wall it starts on (like when you stand on your
  // own wall), until it's out of it.
  function addBullet(o, id, x, y, vx, vy) {
    const b = { key: o + ':' + id, o, id, x, y, vx, vy, age: 0, fade: -1, gone: false, ignore: overlaps(x, y, BR) };
    bullets.push(b);
    return b;
  }

  // Moves a bullet. It flies straight through its own player's walls. Gives { stop: true } when it hit the border or
  // a shielded piece of the other player's wall, or { open: … } when it hit an open piece (at: the clock for which
  // pieces are open). (Also used to plan the bot's shots.)
  function moveBullet(b, dt, at) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.age += dt;
    const a = arena();
    let stop = false;
    if (b.x < a.l + BR) { b.x = a.l + BR; b.vx = Math.abs(b.vx); stop = true; }
    if (b.x > a.r - BR) { b.x = a.r - BR; b.vx = -Math.abs(b.vx); stop = true; }
    if (b.y < a.t + BR) { b.y = a.t + BR; b.vy = Math.abs(b.vy); stop = true; }
    if (b.y > a.b - BR) { b.y = a.b - BR; b.vy = -Math.abs(b.vy); stop = true; }
    if (CA.camWalls.bounce(b, BR, 1)) stop = true; // (the camera walls in the top corners)
    if (stop) return { stop };
    let hit = null;
    const still = new Set();
    for (let o = 0; o < 2; o++) {
      if (o === b.o) continue;
      for (const d of walls[o].dots.values()) {
        const dist = Math.hypot(b.x - d.x, b.y - d.y);
        if (dist >= BR + DR) continue;
        const key = 'd' + o + ':' + d.id;
        if (b.ignore.has(key)) { still.add(key); continue; }
        if (!hit) hit = { o, k: 'd', id: d.id, key, p: d, nx: dist ? (b.x - d.x) / dist : 1, ny: dist ? (b.y - d.y) / dist : 0, r: BR + DR, dist };
      }
      for (const l of walls[o].lines.values()) {
        const [p, q] = ends(o, l);
        if (!p || !q) continue;
        const n = nearest(b.x, b.y, p.x, p.y, q.x, q.y);
        if (n.d >= BR + LW / 2) continue;
        const key = 'l' + o + ':' + l.id;
        if (b.ignore.has(key)) { still.add(key); continue; }
        if (!hit) {
          let nx = (b.x - n.x) / (n.d || 1), ny = (b.y - n.y) / (n.d || 1);
          if (!n.d) { const len = Math.hypot(q.x - p.x, q.y - p.y) || 1; nx = -(q.y - p.y) / len; ny = (q.x - p.x) / len; }
          hit = { o, k: 'l', id: l.id, key, p: l, nx, ny, px: n.x, py: n.y, r: BR + LW / 2, dist: n.d };
        }
      }
    }
    b.ignore = still;
    if (!hit) return null;
    if (openLeft(hit.p, at) > 0) return { open: hit };
    const vn = b.vx * hit.nx + b.vy * hit.ny;
    if (vn < 0) { b.vx -= 2 * vn * hit.nx; b.vy -= 2 * vn * hit.ny; }
    const cx = hit.k === 'd' ? hit.p.x : hit.px, cy = hit.k === 'd' ? hit.p.y : hit.py;
    b.x = cx + hit.nx * (hit.r + 0.2);
    b.y = cy + hit.ny * (hit.r + 0.2);
    return { stop: true };
  }

  function stepBullets(dt) {
    const at = T();
    for (const b of bullets) {
      if (b.gone) continue;
      if (b.fade >= 0) { b.fade -= dt; if (b.fade <= 0) b.gone = true; continue; }
      const r = moveBullet(b, dt, at);
      if (r && r.open) {
        b.gone = true; // (a bullet that breaks or cracks a wall is used up)
        if (host) breakPiece(r.open.o, r.open.k, r.open.id, b);
        else spark(b.x, b.y, TEAM[r.open.o].light); // (the host's app says what broke)
      } else if (r && r.stop) { // (a bullet stops at the first wall it hits)
        b.fade = 0.25;
        b.vx = 0;
        b.vy = 0;
        spark(b.x, b.y, '#ffffff');
        const now = performance.now();
        if (now - lastBounce > 60) { lastBounce = now; sound([[1250 + Math.random() * 250, 0, 0.025]]); }
      }
      if (b.age > SHOT_LIFE && b.fade < 0) b.fade = 0.3;
    }
    for (let k = bullets.length - 1; k >= 0; k--) if (bullets[k].gone) bullets.splice(k, 1);
  }

  /* ---------- moving, and getting knocked out ---------- */

  function stepCat(c, inp, dt) {
    c.fireCd = Math.max(0, c.fireCd - dt);
    c.buildCd = Math.max(0, c.buildCd - dt);
    c.hurtT = Math.max(0, c.hurtT - dt);
    if (c.dead) { // (knocked out: it slides and spins)
      c.spin += 9 * dt;
      c.vx *= Math.pow(0.05, dt);
      c.vy *= Math.pow(0.05, dt);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      return;
    }
    const free = phase === 'play';
    const top = SPEED * (inp.speed || 1);
    const tx = free ? inp.mx * top : 0, ty = free ? inp.my * top : 0;
    const dx = tx - c.vx, dy = ty - c.vy, d = Math.hypot(dx, dy), s = ACCEL * dt;
    if (d <= s) { c.vx = tx; c.vy = ty; } else { c.vx += dx / d * s; c.vy += dy / d * s; }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    const a = arena();
    if (c.x < a.l + CR) { c.x = a.l + CR; c.vx = Math.max(0, c.vx); }
    if (c.x > a.r - CR) { c.x = a.r - CR; c.vx = Math.min(0, c.vx); }
    if (c.y < a.t + CR) { c.y = a.t + CR; c.vy = Math.max(0, c.vy); }
    if (c.y > a.b - CR) { c.y = a.b - CR; c.vy = Math.min(0, c.vy); }
    CA.camWalls.bounce(c, CR, 0); // (the camera walls in the top corners)
    const al = Math.hypot(inp.ax, inp.ay);
    if (al > 1) { c.ax = inp.ax / al; c.ay = inp.ay / al; }
    if (!free) return;
    if (inp.build) build(c);
    if (inp.fire && al > 1) {
      let fx2 = inp.ax, fy2 = inp.ay;
      if (inp.spread) { const e = gauss(0, 0.06), cs = Math.cos(e), sn = Math.sin(e); fx2 = inp.ax * cs - inp.ay * sn; fy2 = inp.ax * sn + inp.ay * cs; }
      if (shoot(c, fx2, fy2) && c === me) { fireAt = -1e9; tapAim = null; }
    }
  }

  // Each app decides whether its own cat got hit: by touching the other cat's walls, by their bullet, or by staying
  // outside the zone too long.
  function checkCat(c, dt) {
    if (c.dead || phase !== 'play' || t - READY < SAFE || c.hurtT > 0) return;
    if (outside(c.x, c.y)) {
      c.outT += dt;
      if (c.outT >= ZONE_HURT) { hurt(c, 'zone', 2 * c.x - ZX, 2 * c.y - ZY); return; } // (pushed back towards the middle)
    } else c.outT = 0;
    const e = 1 - c.i, w = walls[e];
    for (const d of w.dots.values()) {
      const touch = Math.hypot(d.x - c.x, d.y - c.y) < CR + DR;
      if (!touch) d.grace = false;
      else if (!d.grace) { hurt(c, 'wall', d.x, d.y); return; }
    }
    for (const l of w.lines.values()) {
      const [a, b] = ends(e, l);
      if (!a || !b) continue;
      const n = nearest(c.x, c.y, a.x, a.y, b.x, b.y);
      const touch = n.d < CR + LW / 2;
      if (!touch) l.grace = false;
      else if (!l.grace) { hurt(c, 'wall', n.x, n.y); return; }
    }
    for (const b of bullets) {
      if (b.gone || b.fade >= 0) continue;
      if (b.o === c.i) continue;
      if (Math.hypot(b.x - c.x, b.y - c.y) < CR + BR) {
        b.gone = true;
        hurt(c, 'shot', b.x - b.vx * 0.01, b.y - b.vy * 0.01);
        return;
      }
    }
  }

  // A hit (from (x, y)) breaks your shield, and gives you a moment when nothing can hurt you. Without a shield, it's
  // a K.O.
  function hurt(c, why, x, y) {
    if (!c.shield) { knockOut(c, why, x, y); return; }
    c.shield = false;
    c.hurtT = HIT_SAFE;
    c.outT = 0;
    const d = Math.hypot(c.x - x, c.y - y) || 1;
    c.vx = (c.x - x) / d * 260;
    c.vy = (c.y - y) / d * 260;
    shieldFx(c);
    if (c === me && ctx.bot) ctx.oppCheer();
    if (online && c === me) ctx.send({ t: 'hurt', w: why });
  }

  function shieldFx(c) {
    const v = vw(c);
    burst(v.x, v.y, '#9fe7ff', 16, 260);
    fx.push({ k: 'ring', x: v.x, y: v.y, vx: 0, vy: 0, life: 0.45, max: 0.45, r: CR + 9, c: '#7dd3ff' });
    pop(v.x, v.y - 40, 'SHIELD BROKEN!', '#7dd3ff');
    shake = Math.max(shake, 8);
    sound([[1800, 0, 0.04], [1200, 0.03, 0.06], [700, 0.07, 0.12]]);
    showScore();
  }

  const hits = c => (c.shield ? 0 : 1) + (c.dead ? 1 : 0);
  const showScore = () => ctx.score(hits(them), hits(me)); // (how many hits each player has landed)

  function knockOut(c, why, x, y) {
    if (c.dead) return;
    c.dead = true;
    c.shield = false;
    c.why = why;
    const d = Math.hypot(c.x - x, c.y - y) || 1;
    c.vx = (c.x - x) / d * 320;
    c.vy = (c.y - y) / d * 320;
    koFx(c, why);
    if (c === me && ctx.bot) ctx.oppCheer();
    if (online && c === me) ctx.send({ t: 'dead', w: why });
  }

  function koFx(c, why) {
    const v = vw(c);
    burst(v.x, v.y, TEAM[c.i].main, 18, 320);
    fx.push({ k: 'ring', x: v.x, y: v.y, vx: 0, vy: 0, life: 0.4, max: 0.4, r: CR, c: '#fff3b0' });
    pop(v.x, v.y - 36, why === 'wall' ? 'OUCH!' : why === 'zone' ? 'ZONED!' : 'ZAP!', '#ffd23f');
    shake = Math.max(shake, 14);
    sound([[200, 0, 0.08], [120, 0.06, 0.18], [70, 0.16, 0.3]]);
    showScore();
  }

  function endGame(w) { // w: the winner (0 or 1), or -1 for a draw
    if (phase === 'ko') return;
    phase = 'ko';
    winner = w;
    if (host && online) ctx.send({ t: 'end', w });
    showScore();
    ctx.note(w < 0 ? "It's a draw!" : w === meI ? 'K.O.! You win!' : 'K.O.!');
    ctx.later(() => ctx.finish(w < 0 ? 'draw' : w === meI ? 'win' : 'lose'), 2400);
  }

  /* ---------- controls ---------- */

  const input = F.controls(ctx,
    { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'b' },
    { w: 'u', s: 'd', a: 'l', d: 'r', ' ': 'b' }, $('wdPad'));
  const keys = input.keys;
  const mouse = { x: 0, y: 0, seen: false };
  let touchMode = !!(window.matchMedia && matchMedia('(hover: none), (pointer: coarse)').matches);
  let fireAt = -1e9;   // when you last clicked to shoot (a click just before you can shoot again still counts)
  let held = false;    // holding the mouse button down keeps shooting
  let tapAim = null;   // (phones) where you tapped on the arena to shoot

  function toWorld(e) { // a pointer's position in the arena
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / (r.width || 1) * W, y = (e.clientY - r.top) / (r.height || 1) * H;
    return { x: flip ? W - x : x, y };
  }
  ctx.listen(document, 'pointermove', e => {
    if (e.pointerType === 'touch') return;
    const p = toWorld(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.seen = true;
    touchMode = false;
  });
  ctx.listen(cv, 'pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = toWorld(e);
    if (e.pointerType === 'touch') { touchMode = true; tapAim = p; }
    else { Object.assign(mouse, p, { seen: true }); touchMode = false; tapAim = null; held = true; }
    fireAt = performance.now();
  });
  ctx.listen(document, 'pointerup', e => { if (e.button === 0) held = false; });
  ctx.listen(window, 'blur', () => { held = false; });
  ctx.listen(cv, 'contextmenu', e => e.preventDefault());
  ctx.listen($('wdPad'), 'pointerdown', () => { touchMode = true; });

  // The stick on phones (left of the buttons): drag it the way you want to go.
  const stick = { x: 0, y: 0, id: null };
  const stickEl = $('wdStick'), knob = $('wdKnob');
  function moveStick(e) {
    const r = stickEl.getBoundingClientRect();
    let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    stick.x = len < 0.15 ? 0 : dx;
    stick.y = len < 0.15 ? 0 : dy;
    knob.style.transform = 'translate(' + Math.round(dx * 32) + 'px, ' + Math.round(dy * 32) + 'px)';
  }
  ctx.listen(stickEl, 'pointerdown', e => {
    e.preventDefault();
    stick.id = e.pointerId;
    try { stickEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    moveStick(e);
  });
  ctx.listen(stickEl, 'pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => ctx.listen(stickEl, type, e => {
    if (e.pointerId !== stick.id) return;
    stick.id = null;
    stick.x = stick.y = 0;
    knob.style.transform = '';
  }));

  function myInput() {
    let mx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0) + stick.x, my = (keys.d ? 1 : 0) - (keys.u ? 1 : 0) + stick.y;
    if (flip) mx = -mx; // (the guest's screen is mirrored)
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const v = vw(them);
    let ax, ay;
    if (tapAim) { ax = tapAim.x - me.x; ay = tapAim.y - me.y; }
    else if (touchMode || !mouse.seen) { ax = v.x - me.x; ay = v.y - me.y; } // (phones aim at the other cat)
    else { ax = mouse.x - me.x; ay = mouse.y - me.y; }
    const scale = 1 / Math.max(0.001, Math.hypot(ax, ay)) * 100; // (any length over 1 sets the aim)
    const build = !!keys.b && !me.pb;
    me.pb = !!keys.b;
    return {
      mx, my, ax: ax * scale, ay: ay * scale, build,
      fire: held || performance.now() - fireAt < 160 || !!keys.f, spread: !tapAim && (touchMode || !mouse.seen),
    };
  }

  /* ---------- online ---------- */

  function packCat(c) {
    return {
      x: r1(c.x), y: r1(c.y), vx: Math.round(c.vx), vy: Math.round(c.vy), ax: r2(c.ax), ay: r2(c.ay),
      sh: c.shield ? 1 : 0, h: c.hurtT > 0 ? 1 : 0, d: c.dead ? 1 : 0,
    };
  }

  const rbuf = [];   // the other cat's recent states

  function onRemoteCat(m) {
    const s = m.c;
    if (!s || typeof s !== 'object' || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
    rbuf.push({
      at: performance.now(), x: clamp(s.x, 0, W), y: clamp(s.y, 0, H), vx: clamp(num(s.vx, 0), -600, 600), vy: clamp(num(s.vy, 0), -600, 600),
      ax: clamp(num(s.ax, 1), -1, 1), ay: clamp(num(s.ay, 0), -1, 1), hurt: !!s.h,
    });
    if (rbuf.length > 40) rbuf.shift();
    if (s.sh === 0) remoteHurt();
    if (s.d) remoteOut('');
    if (!host && Number.isFinite(m.T)) { // (the host's clock, a little out of date by the time it gets here)
      const d = m.T - t;
      off = off === null ? d : Math.max(off, d);
    }
  }

  // The other app says its cat was knocked out. (It counts right away, so the host can end the game; the effects
  // show when it happens on this screen.)
  function remoteOut(why) {
    if (them.dead) return;
    them.dead = true;
    them.shield = false;
    them.why = ['wall', 'zone'].includes(why) ? why : 'shot';
    ctx.later(() => koFx(them, them.why), VIEW_DELAY);
  }

  // The other app says its cat's shield broke.
  function remoteHurt() {
    if (!them.shield || them.dead) return;
    them.shield = false;
    ctx.later(() => shieldFx(them), VIEW_DELAY);
  }

  function onDot(m) {
    const o = themI, w = walls[o];
    const id = m.id;
    if (!Number.isInteger(id) || id < 1 || w.dots.has(id) || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    if (Array.isArray(m.dr)) m.dr.slice(0, 20).forEach(k => { if (Number.isInteger(k)) removeDot(o, k, true); });
    const born = num(m.b, T());
    const d = { id, x: clamp(m.x, 0, W), y: clamp(m.y, 0, H), born, grace: false };
    w.dots.set(id, d);
    w.next = Math.max(w.next, id + 1);
    const lines = [];
    for (const p of Array.isArray(m.ls) ? m.ls.slice(0, LINKS) : []) {
      if (!Array.isArray(p) || !Number.isInteger(p[0]) || w.lines.has(p[0]) || !w.dots.has(p[1]) || p[1] === id) continue;
      const l = { id: p[0], a: p[1], b: id, born, hp: LINE_HP, grace: false };
      w.lines.set(l.id, l);
      w.nextLine = Math.max(w.nextLine, l.id + 1);
      lines.push(l);
    }
    while (w.dots.size > MAX_DOTS + 4) removeDot(o, w.dots.keys().next().value, true); // (never more than a few too many)
    graceFor(o, d, lines);
    fx.push({ k: 'ring', x: d.x, y: d.y, vx: 0, vy: 0, life: 0.35, max: 0.35, r: DR, c: TEAM[o].main });
  }

  function onShot(m) {
    const o = themI;
    if (!Number.isInteger(m.id) || !Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.vx) || !Number.isFinite(m.vy)) return;
    if (liveShots(o) >= MAX_SHOTS + 2) return;
    const len = Math.hypot(m.vx, m.vy);
    if (!len) return;
    addBullet(o, m.id, clamp(m.x, 0, W), clamp(m.y, 0, H), m.vx / len * BS, m.vy / len * BS);
    shotN[o] = Math.max(shotN[o], m.id + 1);
  }

  function onBreak(m) { // (guest) the host says a piece of wall broke
    const o = m.o, id = m.id;
    if ((o !== 0 && o !== 1) || !Number.isInteger(id)) return;
    if (m.k === 'd') removeDot(o, id);
    else if (m.k === 'l') {
      const w = walls[o], l = w.lines.get(id);
      if (l) {
        const [a, b] = ends(o, l);
        l.hp = clamp(Math.round(num(m.hp, 0)), 0, LINE_HP);
        if (l.hp <= 0) { w.lines.delete(id); if (a && b) shatterLine(o, a, b); }
        else if (a && b) burst((a.x + b.x) / 2, (a.y + b.y) / 2, TEAM[o].main, 5, 160);
      }
    }
    const b = bullets.find(x => x.o === m.bo && x.id === m.bi);
    if (b) b.gone = true;
  }

  ctx.on(m => {
    if (!m || typeof m !== 'object') return;
    lastMsg = performance.now();
    if (m.t === 's') onRemoteCat(m);
    else if (m.t === 'dot') onDot(m);
    else if (m.t === 'shot') onShot(m);
    else if (m.t === 'hurt') remoteHurt();
    else if (m.t === 'dead') remoteOut(m.w);
    else if (!host && m.t === 'brk') onBreak(m);
    else if (!host && m.t === 'end' && [-1, 0, 1].includes(m.w)) endGame(m.w);
  });

  /* ---------- the bot ---------- */

  const bot = ctx.bot ? {
    off: false, think: 0.3, goal: null, goalT: 0, aimX: them.ax, aimY: them.ay, fire: false, build: false, left: 0,
    nextWall: READY + 1.2 + Math.random() * 2, fireAt: READY + 0.6 + (1 - skill) * 0.8, seen: new Map(), speed: 0.6 + 0.4 * skill,
  } : null;

  function botInput(c, dt) {
    const inp = { mx: 0, my: 0, ax: bot.aimX * 100, ay: bot.aimY * 100, fire: false, build: false, speed: bot.speed };
    if (bot.off || c.dead || phase !== 'play') return inp;
    bot.think -= dt;
    bot.goalT -= dt;
    if (bot.think <= 0) { bot.think = 0.1 + (1 - skill) * 0.2 + Math.random() * 0.08; botThink(c); }
    const d = steer(c);
    inp.mx = d.x;
    inp.my = d.y;
    inp.ax = bot.aimX * 100;
    inp.ay = bot.aimY * 100;
    if (bot.fire) { bot.fire = false; inp.fire = true; }
    if (bot.build) { bot.build = false; inp.build = true; }
    return inp;
  }

  function botThink(c) {
    const o = me, now = T();
    // Dodge bullets coming this way (good bots see them a lot more often).
    let threat = null;
    for (const b of bullets) {
      if (b.gone || b.fade >= 0 || b.o === c.i) continue;
      const v2 = b.vx * b.vx + b.vy * b.vy || 1;
      const tc = clamp(((c.x - b.x) * b.vx + (c.y - b.y) * b.vy) / v2, 0, 0.5);
      if (Math.hypot(b.x + b.vx * tc - c.x, b.y + b.vy * tc - c.y) > CR + BR + 14) continue;
      if (!bot.seen.has(b.key)) bot.seen.set(b.key, Math.random() < 0.12 + 0.75 * skill);
      if (bot.seen.get(b.key)) { threat = b; break; }
    }
    if (threat) {
      const v = Math.hypot(threat.vx, threat.vy) || 1;
      let px = -threat.vy / v, py = threat.vx / v;
      if ((c.x - threat.x) * px + (c.y - threat.y) * py < 0) { px = -px; py = -py; }
      const away = { x: c.x + px * 90, y: c.y + py * 90 };
      bot.goal = inside(away) && safeAt(c, away.x, away.y) ? away : { x: c.x - px * 90, y: c.y - py * 90 };
      bot.goalT = 0.45;
    } else if (Math.hypot(c.x - ZX, c.y - ZY) > zoneR(now + 2) - 30) { // (the zone is closing in: head for the middle)
      bot.goal = { x: ZX + (c.x - ZX) * 0.4, y: ZY + (c.y - ZY) * 0.4 };
      bot.goalT = 0.8;
    } else if (!bot.goal || bot.goalT <= 0 || Math.hypot(bot.goal.x - c.x, bot.goal.y - c.y) < 14) {
      bot.goal = pickGoal(c, o);
      bot.goalT = 1.2 + Math.random() * 1.6;
    }
    // Build short walls between itself and the other cat: walk sideways, dropping 2 or 3 dots.
    if (bot.left > 0) {
      if (c.buildCd <= 0 && now - c.lastBuild > 0.55) { bot.build = true; bot.left--; }
    } else if (now >= bot.nextWall && !threat) {
      const dist = Math.hypot(o.x - c.x, o.y - c.y);
      if (dist > 110 && dist < 460) {
        bot.left = 2 + (Math.random() < 0.4 + 0.3 * skill ? 1 : 0);
        bot.nextWall = now + 2.8 + (1 - skill) * 3 + Math.random() * 2;
        const ux = (o.x - c.x) / dist, uy = (o.y - c.y) / dist;
        let px = -uy, py = ux;
        if (Math.random() < 0.5) { px = -px; py = -py; }
        let side = { x: c.x + px * 150 + ux * 20, y: c.y + py * 150 + uy * 20 };
        if (!inside(side, 40) || !clearPath(c, side)) side = { x: c.x - px * 150 + ux * 20, y: c.y - py * 150 + uy * 20 };
        bot.goal = side;
        bot.goalT = 1.6;
        bot.build = true;
        bot.left--;
      } else bot.nextWall = now + 0.5;
    }
    // Shoot, when there's a good shot.
    if (c.fireCd <= 0 && now >= bot.fireAt && liveShots(c.i) < MAX_SHOTS) {
      const s = planShot(c, o);
      if (s) {
        const e = gauss(0, 0.02 + 0.2 * (1 - skill)), cs = Math.cos(e), sn = Math.sin(e); // (easy bots miss a lot)
        bot.aimX = s.x * cs - s.y * sn;
        bot.aimY = s.x * sn + s.y * cs;
        bot.fire = true;
        bot.fireAt = now + 0.2 + (1 - skill) * 0.9 + Math.random() * 0.4;
        return;
      }
      bot.fireAt = now + 0.15 + (1 - skill) * 0.25;
    }
    const dx = o.x - c.x, dy = o.y - c.y, dl = Math.hypot(dx, dy) || 1;
    bot.aimX = dx / dl;
    bot.aimY = dy / dl;
  }

  const inside = (p, m = CR + 4) => { const a = arena(); return p.x > a.l + m && p.x < a.r - m && p.y > a.t + m && p.y < a.b - m && !CA.camWalls.inWall(p.x, p.y, m); };

  // Is (x, y) a safe place for cat c: not touching the other cat's walls (with room to spare)?
  function safeAt(c, x, y, m = 9) {
    const e = 1 - c.i, w = walls[e];
    for (const d of w.dots.values()) if (!d.grace && Math.hypot(d.x - x, d.y - y) < CR + DR + m) return false;
    for (const l of w.lines.values()) {
      const [a, b] = ends(e, l);
      if (a && b && !l.grace && nearest(x, y, a.x, a.y, b.x, b.y).d < CR + LW / 2 + m) return false;
    }
    return true;
  }

  function clearPath(c, p) {
    const n = Math.ceil(Math.hypot(p.x - c.x, p.y - c.y) / 14);
    for (let k = 1; k <= n; k++) if (!safeAt(c, c.x + (p.x - c.x) * k / n, c.y + (p.y - c.y) * k / n, 6)) return false;
    return true;
  }

  // Somewhere to go: a good distance from the other cat, inside the zone, without walking through its walls.
  function pickGoal(c, o) {
    const want = 240 + 70 * Math.sin(T() * 0.6);
    const a = arena(), zr = zoneR(T() + 2.5) - 35;
    let best = null, bestS = -Infinity;
    for (let k = 0; k < 14; k++) {
      const p = { x: a.l + 50 + Math.random() * Math.max(1, a.r - a.l - 100), y: a.t + 50 + Math.random() * Math.max(1, a.b - a.t - 100) };
      if (Math.hypot(p.x - ZX, p.y - ZY) > zr) { const f = Math.max(0, zr) / Math.hypot(p.x - ZX, p.y - ZY); p.x = ZX + (p.x - ZX) * f; p.y = ZY + (p.y - ZY) * f; }
      if (!safeAt(c, p.x, p.y, 24)) continue;
      let s = -Math.abs(Math.hypot(p.x - o.x, p.y - o.y) - want) - 0.25 * Math.hypot(p.x - c.x, p.y - c.y);
      if (!clearPath(c, p)) s -= 300;
      if (s > bestS) { bestS = s; best = p; }
    }
    return best || { x: c.x, y: c.y };
  }

  // Which way to walk towards the goal without touching the other cat's walls.
  function steer(c) {
    const gl = bot.goal;
    if (!gl) return { x: 0, y: 0 };
    let dx = gl.x - c.x, dy = gl.y - c.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) return { x: 0, y: 0 };
    dx /= len;
    dy /= len;
    for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
      const cs = Math.cos(turn), sn = Math.sin(turn);
      const ux = dx * cs - dy * sn, uy = dx * sn + dy * cs;
      if (safeAt(c, c.x + ux * 16, c.y + uy * 16) && safeAt(c, c.x + ux * 34, c.y + uy * 34)) return { x: ux, y: uy };
    }
    bot.goalT = 0; // (boxed in: go somewhere else)
    return { x: 0, y: 0 };
  }

  // Flies a pretend bullet from cat c in direction (dx, dy). Does it hit the target (target(seconds) is where the
  // target will be), or an open piece of wall (piece: its key)?
  function sim(c, dx, dy, target) {
    const now = T();
    const b = { o: c.i, x: c.x, y: c.y, vx: dx * BS, vy: dy * BS, age: 0, ignore: overlaps(c.x, c.y, BR) };
    for (let k = 0; k < 260; k++) {
      const r = moveBullet(b, 1 / 90, now + b.age);
      if (r && r.open) return { piece: r.open.key };
      if (r && r.stop) return {};
      if (target) { const p = target(b.age); if (Math.hypot(b.x - p.x, b.y - p.y) < CR + BR - 3) return { hit: true, t: b.age }; }
    }
    return {};
  }

  function planShot(c, o) {
    const now = T();
    // The other cat's dots are open: break one (good bots do this a lot more, and time it better).
    if (Math.random() < 0.15 + 0.6 * skill) {
      for (const d of walls[o.i].dots.values()) {
        const dist = Math.hypot(d.x - c.x, d.y - c.y);
        if (dist < 30 || dist > 520 || openLeft(d, now + dist / BS + 0.05) < 0.05 + 0.15 * (1 - skill)) continue;
        const ux = (d.x - c.x) / dist, uy = (d.y - c.y) / dist;
        if (sim(c, ux, uy, null).piece === 'd' + o.i + ':' + d.id) return { x: ux, y: uy };
      }
    }
    // Straight at the other cat (good bots aim ahead of a moving cat).
    const lead = 0.85 * skill;
    const target = tt => ({ x: o.x + o.vx * tt * lead, y: o.y + o.vy * tt * lead });
    const tp = target(Math.hypot(o.x - c.x, o.y - c.y) / BS);
    const dl = Math.hypot(tp.x - c.x, tp.y - c.y) || 1;
    const ux = (tp.x - c.x) / dl, uy = (tp.y - c.y) / dl;
    if (sim(c, ux, uy, target).hit) return { x: ux, y: uy };
    if (Math.random() < 0.25 * (1 - skill)) return { x: ux, y: uy }; // (easy bots sometimes just fire anyway)
    return null;
  }

  /* ---------- the game loop ---------- */

  function step(dt) {
    t += dt;
    if (phase === 'ready') {
      const n = Math.ceil((READY - t) / 0.6);
      if (n !== count) { count = n; if (n > 0) sound('tick'); }
      if (t >= READY) { phase = 'play'; goAt = performance.now(); sound('go'); }
    }
    stepCat(me, myInput(), dt);
    if (ctx.bot) stepCat(them, botInput(them, dt), dt);
    stepBullets(dt);
    for (const c of local) checkCat(c, dt);
    if (phase === 'play' && !zoneNoted && playT() >= ZONE_START) {
      zoneNoted = true;
      ctx.note('🌀 The zone is closing in! Stay inside it');
      sound('notify');
    }
    if (host && phase === 'play') {
      if (me.dead || them.dead) endGame(me.dead && them.dead ? -1 : me.dead ? themI : meI);
      else if (playT() >= DRAW_AT) endGame(-1);
    }
  }

  let simAt = performance.now(), acc = 0, lastFrame = performance.now();
  function advance(now, cap) {
    acc += Math.min(cap, Math.max(0, (now - simAt) / 1000)) * (phase === 'ko' ? 0.45 : 1); // (slow motion for the K.O.)
    simAt = now;
    while (acc >= DT) { acc -= DT; step(DT); }
  }

  function updateViews(now) {
    if (!online || !rbuf.length) return;
    them.rv = Object.assign(them.rv || {}, F.sample(rbuf, now - VIEW_DELAY, ['x', 'y', 'vx', 'vy', 'ax', 'ay']));
  }

  function frame(now) {
    if (!ctx.alive()) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    updateViews(now);
    advance(now, 0.25);
    render(now, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // (Browsers stop drawing in a hidden tab: the game keeps going anyway, just without the drawing.)
  ctx.every(() => { const now = performance.now(); if (now - lastFrame > 300) { updateViews(now); advance(now, 1.5); } }, 250);
  if (online) {
    ctx.every(() => ctx.send(host ? { t: 's', c: packCat(me), T: r3(t) } : { t: 's', c: packCat(me) }), SEND_MS);
    ctx.every(() => { if (phase !== 'ko' && performance.now() - lastMsg > 15000) ctx.afk(); }, 1000);
  }
  ctx.score(0, 0);
  ctx.note('🛡️ A shield and 1 life each · stay inside the zone');
  if (window.__testHooks) {
    window.__wd = {
      cats, me, them, walls, bullets, bot, keys, mouse, T, arena, openLeft, build, shoot, removeDot,
      phase: () => phase, winner: () => winner, zoneR, hurt, msg: () => (performance.now() < msgUntil ? msgText : ''), setT: v => { t = v; },
      shotN, endGame,
    };
  }

  /* ---------- effects ---------- */

  function burst(x, y, color, n, speed) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.8);
      fx.push({ k: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, r: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: color });
    }
  }
  function shatterLine(o, a, b) {
    const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 22));
    for (let k = 0; k <= n; k++) burst(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, TEAM[o].main, 2, 200);
  }
  function fadeLine(o, a, b) { fx.push({ k: 'ghost', x: 0, y: 0, vx: 0, vy: 0, ax: a.x, ay: a.y, bx: b.x, by: b.y, life: 0.4, max: 0.4, c: TEAM[o].main }); }
  function spark(x, y, color) {
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 140;
      fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25, max: 0.25, r: 2, c: color });
    }
  }
  function pop(x, y, text, color) { fx.push({ k: 'word', x, y, vx: 0, vy: -40, life: 1.1, max: 1.1, text, color }); }

  let msgText = '', msgBad = false, msgUntil = 0;
  function hint(text, bad) {
    msgText = text;
    msgBad = !!bad;
    msgUntil = performance.now() + 1500;
    if (bad) sound([[220, 0, 0.06]]);
  }

  /* ---------- drawing ---------- */

  const floorImg = makeFloor();

  function makeFloor() {
    const c = document.createElement('canvas');
    c.width = W * DPR;
    c.height = H * DPR;
    const b = c.getContext('2d');
    b.scale(DPR, DPR);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; // (the same park every time)
    const blob = (x, y, r) => { b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fill(); };
    // a mowed lawn
    const lawn = b.createLinearGradient(0, 0, 0, H);
    lawn.addColorStop(0, '#86c96f');
    lawn.addColorStop(1, '#6fb55c');
    b.fillStyle = lawn;
    b.fillRect(0, 0, W, H);
    b.fillStyle = 'rgba(255, 255, 255, .06)';
    for (let x = 0; x < W; x += 128) b.fillRect(x, 0, 64, H);
    for (let k = 0; k < 70; k++) {
      b.fillStyle = k % 2 ? 'rgba(30, 80, 20, .07)' : 'rgba(255, 255, 190, .06)';
      b.beginPath(); b.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 50, 12 + rnd() * 30, rnd() * 3, 0, Math.PI * 2); b.fill();
    }
    // a white circle in the middle, like a playing field
    b.strokeStyle = 'rgba(255, 255, 255, .45)';
    b.lineWidth = 3;
    b.beginPath(); b.arc(ZX, ZY, 70, 0, Math.PI * 2); b.stroke();
    b.fillStyle = 'rgba(255, 255, 255, .45)';
    blob(ZX, ZY, 5);
    // tufts of grass and little flowers
    b.lineCap = 'round';
    b.lineWidth = 1.6;
    for (let k = 0; k < 280; k++) {
      const x = rnd() * W, y = rnd() * H;
      b.strokeStyle = k % 3 ? '#4f9a44' : '#5fb052';
      b.beginPath();
      b.moveTo(x - 3, y - 4); b.lineTo(x, y + 2); b.lineTo(x + 1, y - 6); b.moveTo(x, y + 2); b.lineTo(x + 4, y - 3);
      b.stroke();
    }
    const petals = ['#ffffff', '#ffe46b', '#ffb3d1', '#c9b6ff'];
    for (let k = 0; k < 46; k++) {
      const x = 30 + rnd() * (W - 60), y = 30 + rnd() * (H - 60);
      b.fillStyle = petals[k % petals.length];
      for (let p = 0; p < 5; p++) blob(x + Math.cos(p * 1.257) * 3, y + Math.sin(p * 1.257) * 3, 2.4);
      b.fillStyle = '#f5a623';
      blob(x, y, 1.6);
    }
    HOME.forEach(([x, y], i) => { // the start corners, in each player's color
      const X = flip ? W - x : x;
      b.globalAlpha = 0.4;
      b.fillStyle = TEAM[i].light;
      blob(X, y, 46);
      b.globalAlpha = 0.7;
      b.strokeStyle = TEAM[i].main;
      b.lineWidth = 2.5;
      b.beginPath(); b.arc(X, y, 46, 0, Math.PI * 2); b.stroke();
      b.globalAlpha = 1;
    });
    // a bit darker towards the edges
    const shade = b.createRadialGradient(ZX, ZY, 200, ZX, ZY, 600);
    shade.addColorStop(0, 'rgba(0, 40, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 40, 0, .28)');
    b.fillStyle = shade;
    b.fillRect(0, 0, W, H);
    // the hedge all around
    b.fillStyle = '#2f6b34';
    b.fillRect(0, 0, W, EDGE);
    b.fillRect(0, H - EDGE, W, EDGE);
    b.fillRect(0, 0, EDGE, H);
    b.fillRect(W - EDGE, 0, EDGE, H);
    const bush = (x, y) => { b.fillStyle = '#3f8a42'; blob(x, y, 9); b.fillStyle = '#58a85a'; blob(x - 2, y - 3, 4); };
    for (let x = 8; x <= W - 8; x += 14) { bush(x, EDGE - 3); bush(x, H - EDGE + 3); }
    for (let y = 8; y <= H - 8; y += 14) { bush(EDGE - 3, y); bush(W - EDGE + 3, y); }
    return c;
  }

  function render(now, dt) {
    updateFx(dt);
    if (them.dead && !local.includes(them)) them.spin += 9 * dt; // (the other player's knocked-out cat spins too)
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.drawImage(floorImg, 0, 0, W, H);
    let ox = 0, oy = 0;
    if (shake > 0.4) {
      ox = (Math.random() - 0.5) * shake;
      oy = (Math.random() - 0.5) * shake;
      shake *= Math.pow(0.015, dt);
    } else shake = 0;
    g.translate(ox, oy);
    drawZone(now);
    drawWalls(now);
    drawPreview();
    drawBullets();
    drawCat(them, now);
    drawCat(me, now);
    drawFx();
    drawCrosshair();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    CA.camWalls.draw(g); // (the camera walls in the top corners: see cam-walls.js)
    drawHud();
    drawOverlay(now);
    updateMsg(now);
  }

  // The safe zone: everything outside it is tinted purple, and its edge glows.
  function drawZone(now) {
    const r = zoneR();
    g.fillStyle = 'rgba(120, 30, 110, .3)';
    g.beginPath();
    g.rect(0, 0, W, H);
    g.arc(ZX, ZY, r, 0, Math.PI * 2, true);
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(255, 90, 209, .25)';
    g.beginPath(); g.arc(ZX, ZY, r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([16, 10]);
    g.lineDashOffset = -now / 40;
    g.lineWidth = 3;
    g.strokeStyle = '#ff5ad1';
    g.beginPath(); g.arc(ZX, ZY, r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.lineDashOffset = 0;
  }

  function stroke(ax, ay, bx, by, color, width, alpha) {
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    g.globalAlpha = 1;
  }

  // Cracks along a wall (the same ones every time for the same wall).
  function cracks(ax, ay, bx, by, id, color, alpha) {
    const len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len;
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = 1.6;
    g.beginPath();
    const n = Math.max(3, Math.round(len / 18));
    for (let k = 0; k <= n; k++) {
      const f = k / n, s = (((id * 37 + k * 11) % 7) - 3) * 1.1 * (k % 2 ? 1 : -1);
      const x = ax + (bx - ax) * f + nx * s, y = ay + (by - ay) * f + ny * s;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawWalls(now) {
    const at = T();
    const blink = Math.floor(now / 70) % 2 ? 0.4 : 0.85; // (open pieces flicker)
    g.lineCap = 'round';
    for (let o = 0; o < 2; o++) {
      const col = TEAM[o], w = walls[o];
      for (const l of w.lines.values()) {
        const [a, b] = ends(o, l);
        if (!a || !b) continue;
        const ax = sx(a.x), bx = sx(b.x);
        if (openLeft(l, at) > 0) {
          stroke(ax, a.y, bx, b.y, col.main, LW, blink);
          cracks(ax, a.y, bx, b.y, l.id, col.dark, 0.9);
        } else {
          stroke(ax, a.y, bx, b.y, col.light, LW + 7, 0.6); // the shield's glow
          stroke(ax, a.y, bx, b.y, col.main, LW, 1);
          stroke(ax, a.y, bx, b.y, '#ffffff', 1.6, 0.75);
          if (l.hp < LINE_HP) cracks(ax, a.y, bx, b.y, l.id, col.dark, 0.7);
        }
      }
      for (const d of w.dots.values()) {
        const X = sx(d.x), left = openLeft(d, at);
        if (left > 0) {
          g.globalAlpha = blink;
          g.fillStyle = col.main;
          dot(X, d.y, DR);
          g.globalAlpha = 1;
          g.strokeStyle = col.dark;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(X - 5, d.y - 3); g.lineTo(X, d.y + 1); g.lineTo(X + 4, d.y - 4);
          g.moveTo(X, d.y + 1); g.lineTo(X - 1, d.y + 6);
          g.stroke();
          g.strokeStyle = col.dark; // a ring that shrinks while it stays open
          g.lineWidth = 2;
          g.beginPath(); g.arc(X, d.y, DR + 3 + 11 * left / OPEN, 0, Math.PI * 2); g.stroke();
        } else {
          g.globalAlpha = 0.6;
          g.fillStyle = col.light;
          dot(X, d.y, DR + 4);
          g.globalAlpha = 1;
          g.fillStyle = col.main;
          dot(X, d.y, DR);
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1.5;
          g.beginPath(); g.arc(X, d.y, DR - 1, 0, Math.PI * 2); g.stroke();
        }
      }
    }
  }

  // The walls a dot would get if you built one right here.
  function drawPreview() {
    if (me.dead || phase !== 'play') return;
    g.setLineDash([6, 7]);
    for (const p of linksFor(me, me.x, me.y)) stroke(sx(p.x), p.y, sx(me.x), me.y, TEAM[meI].main, 3, 0.4);
    g.setLineDash([]);
  }

  function drawBullets() {
    for (const b of bullets) {
      if (b.gone) continue;
      const a = b.fade >= 0 ? clamp(b.fade / 0.3, 0, 1) : 1;
      const col = TEAM[b.o], X = sx(b.x);
      if (b.fade < 0) stroke(sx(b.x - b.vx * 0.035), b.y - b.vy * 0.035, X, b.y, col.light, BR * 1.6, 0.6);
      g.globalAlpha = a;
      g.fillStyle = col.dark;
      dot(X, b.y, BR + 1.5);
      g.fillStyle = col.main;
      dot(X, b.y, BR);
      g.fillStyle = '#ffffff';
      dot(X, b.y, 1.8);
      g.globalAlpha = 1;
    }
  }

  function drawCat(c, now) {
    const v = vw(c);
    const X = sx(v.x), Y = v.y, col = TEAM[c.i];
    const ax = flip ? -v.ax : v.ax, ay = v.ay; // (which way it's aiming, on the screen)
    const fade = c.dead ? 0.55 : 1;
    g.globalAlpha = 0.18 * fade;
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(X, Y + 16, 17, 6, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.28 * fade;
    g.fillStyle = col.main;
    dot(X, Y, CR + 3);
    g.globalAlpha = fade;
    g.strokeStyle = col.main;
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(X, Y, CR + 3, 0, Math.PI * 2); g.stroke();
    if (!c.dead) { // which way it's aiming
      const px = X + ax * (CR + 13), py = Y + ay * (CR + 13);
      g.fillStyle = col.main;
      g.strokeStyle = col.dark;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(px + ax * 7, py + ay * 7);
      g.lineTo(px - ay * 5.5 - ax * 3, py + ax * 5.5 - ay * 3);
      g.lineTo(px + ay * 5.5 - ax * 3, py - ax * 5.5 - ay * 3);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.globalAlpha = 1;
    const hurting = c.rv ? !!v.hurt : c.hurtT > 0;
    const safe = phase === 'play' && (t - READY < SAFE || hurting) && Math.floor(now / 120) % 2; // (a flicker: it can't be hit just now)
    g.save();
    g.translate(X, Y + 17);
    g.scale(0.48, 0.48);
    F.drawBody(g, c, 0, 0, {
      tilt: c.dead ? c.spin : 0, lookRight: ax >= 0, open: F.mouth(c === me ? 'talk-me' : 'talk-opp') > 0.12,
      alpha: c.dead ? 0.6 : safe ? 0.5 : 1,
    });
    g.restore();
    if (c.shield && !c.dead) { // the shield: a shimmering bubble
      const r = CR + 12 + Math.sin(now / 260 + c.i) * 1.2;
      g.globalAlpha = 0.16;
      g.fillStyle = '#9fe7ff';
      dot(X, Y - 2, r);
      g.globalAlpha = 0.85;
      g.strokeStyle = '#7dd3ff';
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(X, Y - 2, r, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.9;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.beginPath(); g.arc(X, Y - 2, r - 4, -2.5 + now / 900, -1.7 + now / 900); g.stroke();
      g.globalAlpha = 1;
    }
    label((c === me ? 'You' : c.name) + (c.dead ? '' : c.shield ? ' 🛡️' : ' ❤️'), X, Y + 33, 12, c === me ? '#ffd23f' : '#ffffff');
  }

  function drawCrosshair() {
    if (touchMode || !mouse.seen || me.dead || phase === 'ko') return;
    const X = sx(mouse.x), Y = mouse.y;
    g.strokeStyle = TEAM[meI].dark;
    g.globalAlpha = 0.7;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(X, Y, 8, 0, Math.PI * 2);
    g.moveTo(X - 13, Y); g.lineTo(X - 4, Y);
    g.moveTo(X + 4, Y); g.lineTo(X + 13, Y);
    g.moveTo(X, Y - 13); g.lineTo(X, Y - 4);
    g.moveTo(X, Y + 4); g.lineTo(X, Y + 13);
    g.stroke();
    g.globalAlpha = 1;
  }

  function updateFx(dt) {
    for (let k = fx.length - 1; k >= 0; k--) {
      const p = fx[k];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(k, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === 'shard' || p.k === 'spark') { const f = Math.pow(0.04, dt); p.vx *= f; p.vy *= f; p.rot = (p.rot || 0) + (p.vr || 0) * dt; }
    }
  }

  function drawFx() {
    for (const p of fx) {
      const a = clamp(p.life / p.max, 0, 1);
      const X = sx(p.x);
      if (p.k === 'shard') {
        g.globalAlpha = a;
        g.fillStyle = p.c;
        g.save();
        g.translate(X, p.y);
        g.rotate(p.rot);
        g.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
        g.restore();
      } else if (p.k === 'spark') { g.globalAlpha = a; g.fillStyle = p.c; dot(X, p.y, p.r); }
      else if (p.k === 'ring') { g.globalAlpha = a; g.strokeStyle = p.c; g.lineWidth = 2.5; g.beginPath(); g.arc(X, p.y, p.r + (1 - a) * 22, 0, Math.PI * 2); g.stroke(); }
      else if (p.k === 'ghost') stroke(sx(p.ax), p.ay, sx(p.bx), p.by, p.c, LW, a * 0.5);
      else if (p.k === 'word') { g.globalAlpha = Math.min(1, a * 2); label(p.text, X, p.y, 24 + (1 - a) * 6, p.color); }
    }
    g.globalAlpha = 1;
  }

  const clock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // The clock at the top, and how many dots each player has.
  function drawHud() {
    if (phase !== 'ready') {
      const p = playT();
      const closingNow = p >= ZONE_START;
      const text = (closingNow ? '🌀 Zone closing · ' : '🌀 Zone closes in ' + Math.ceil(ZONE_START - p) + ' · ⏱ ') + clock(Math.max(0, DRAW_AT - p));
      g.font = '900 15px ' + F.FONT;
      const w = g.measureText(text).width + 26;
      g.fillStyle = closingNow ? 'rgba(110, 20, 100, .88)' : 'rgba(20, 24, 40, .78)';
      roundRect(W / 2 - w / 2, 4, w, 26, 13);
      g.fill();
      label(text, W / 2, 17, 15, '#ffffff');
    }
    const mine = walls[meI].dots.size, theirs = walls[themI].dots.size;
    label('🧱 ' + mine + '/' + MAX_DOTS, 58, H - 8, 12, TEAM[meI].main);
    label('🧱 ' + theirs + '/' + MAX_DOTS, W - 58, H - 8, 12, TEAM[themI].main);
  }

  function drawOverlay(now) {
    if (phase === 'ready' && count > 0) bigText(String(count), H / 2 - 30, 110, '#ffd23f', 1);
    if (phase !== 'ready' && now - goAt < 700) bigText('GO!', H / 2 - 30, 110, '#7dff8a', 1 - (now - goAt) / 700);
    if (phase === 'ko') {
      bigText(winner < 0 ? 'TIME!' : 'K.O.!', H / 2 - 50, 120, '#ff5a5a', 1);
      const text = winner < 0 ? "It's a draw!" : winner === meI ? 'You win! 🏆' : them.name + ' wins!';
      bigText(text, H / 2 + 40, 40, '#fff', 1);
    }
  }

  function updateMsg(now) {
    let text, bad = false;
    if (now < msgUntil) { text = msgText; bad = msgBad; }
    else if (phase === 'ready') text = 'Get ready!';
    else if (phase === 'ko') text = '';
    else if (me.dead) text = me.why === 'wall' ? 'K.O.! You touched their wall' : me.why === 'zone' ? 'K.O.! You stayed outside the zone' : 'K.O.! You got hit';
    else if (outside(me.x, me.y)) { text = "⚠️ You're outside the zone! Get back in"; bad = true; }
    else if (!me.shield && me.hurtT > 0) text = 'Your shield broke! One more hit and you are out';
    else text = touchMode ? HELP_TOUCH : HELP;
    const el = $('wdMsg');
    if (el.textContent !== text) setMsg('wdMsg', text);
    el.classList.toggle('wd-bad', bad);
  }
}

})();
