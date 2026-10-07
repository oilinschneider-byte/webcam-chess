/* Classic Games: Claw Climb. A race to the top of a giant cat tower, a bit like Getting Over It: your cat climbs
   with one very long arm. Move the mouse (or trackpad) and the paw follows. Press it against something and the claws
   hold, so moving the mouse on moves your whole cat instead: press down on a ledge to push yourself up, swing, and
   fling yourself higher. There's no jump button. Shiny metal and glass are slippery.

   V takes out a giant fish in your other paw (V again puts it away). While it's out, the mouse swings the fish, and
   your climbing paw just keeps holding on where it is. A fast swing that hits the other cat knocks them loose and
   down the tower, but the fish only lasts 2 slaps. First to the top wins (after 4 minutes, whoever is higher wins).

   The cats are solid, but when they're stuck against each other for a moment they slip through each other for a few
   seconds, so nobody can block the way. The gaps in the tower are all wide enough for a cat.

   Online, each app moves its own cat and sends where it is, and each app decides when its own fish hits. The host's
   app decides who got to the top first. Against a bot, the bot climbs along a path up the tower (and falls like
   anyone else when it's slapped). Both players get the same tower, built from the match's shared random numbers. */
(() => {
'use strict';

const { $, setMsg, sound, L, skillOf } = CA.games.kit;
const F = CA.floppy; // (the cat pictures and drawing helpers: see games-floppy.js)
const { FONT } = F;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(v) ? v : d);
const r1 = v => Math.round(v * 10) / 10;

const W = 960, H = 540;          // the view (the canvas is scaled to fit the page)
const DT = 1 / 120;              // the physics runs in small, fixed steps
const G = 1500;                  // gravity
const HEAD = { x: 0, y: -32, r: 26 }, BODY = { x: 0, y: 0, r: 17 }; // a cat's two solid circles, from the middle of its body
const CIRCLES = [HEAD, BODY];
const SHOULDERS = [{ x: 9, y: -9 }, { x: -9, y: -9 }]; // the climbing arm's shoulder, and the fish arm's
const REACH = 130;               // how far an arm reaches
const PAW_R = 9;
const PAW_SPEED = 2600;          // a paw that isn't touching anything moves this fast toward where you point
const K = 2300, DAMP = 55, PUSH = 5200; // the arm is a stiff spring: how hard pressing your paw on something pushes your cat
const MAX_V = 1400;
const MU = { carpet: 3, box: 2.6, wood: 2.4, gold: 2.6, wall: 0.35, metal: 0.12, glass: 0.06 }; // how well claws grip it
const SLIPPERY = { wall: 1, metal: 1, glass: 1 };
const THICK = { carpet: 20, box: 22, wood: 16, metal: 16, glass: 14, gold: 22 }; // (thin, so a cat always fits under the platform above)
const ROWS = 21;                 // rows of platforms in the tower
const SENS = 1.1;                // how far the paw moves for the mouse
const FISH_LEN = 112, FISH_USES = 2, SLAP_SPEED = 950; // a slap needs the fish swinging at least this fast
const TIME_LIMIT = 240;          // seconds; then whoever is higher wins
const READY = 2.4;               // the 3-2-1 countdown
const GHOST_AFTER = 1.1, GHOST_FOR = 2.5; // stuck against each other this long: slip through each other this long
const SEND_MS = 50, VIEW_DELAY = 100; // (the other cat is drawn this many ms in the past, so it moves smoothly)
const START_X = [325, 635];      // where the cats start (the host's on the left)

CA.games.add('climb', {
  name: 'Claw Climb', icon: '🧗',
  blurb: 'Race to the top of the cat tower! Move the mouse and your long claw arm follows: press the paw on things to push ' +
    'and pull yourself up (no jumping!). V takes out a giant fish: swing it fast to slap the other cat down (2 slaps). V puts it away.',
  start(ctx) { play(ctx); },
});

/* ---------- the tower ---------- */

// Rows of platforms, taking turns between three (left, middle, right) and two (in between), so every platform has one
// below it on each side to climb up from. Higher up, the platforms get narrower and further apart, some go missing,
// and more of them are slippery metal and glass. Every gap is wide enough for a cat, so there are no tight spots to
// get stuck in (or to block someone in).
function makeTower(rng) {
  const R = (a, b) => a + rng() * (b - a);
  const rows = [];
  let y = 0;
  for (let k = 1; k <= ROWS; k++) {
    const t = (k - 1) / (ROWS - 1);
    y -= Math.round(R(114, 120) + t * 12); // (always room for a cat under the platform above, and always within reach)
    const three = k % 2 === 1;
    const plats = (three ? [175, 480, 785] : [325, 635]).map(c0 => {
      const w = Math.round((three ? R(150, 180) : R(160, 190)) - t * 60);
      const cx = Math.round(c0 + R(-1, 1) * (three ? 18 : 10));
      let x1 = cx - (w >> 1), x2 = cx + (w >> 1);
      if (x1 < 100) x1 = 20; // (it reaches the wall: no thin gap to wedge into)
      if (x2 > 860) x2 = 940;
      return { x1, x2, m: 'wood' };
    });
    rows.push({ y, t, plats });
  }
  // Higher up, a platform here and there goes missing (but you can always still get up from every row).
  const linked = (a, b) => Math.max(0, b.x1 - a.x2, a.x1 - b.x2) <= 150;
  for (let k = 1; k < rows.length - 1; k++) {
    const row = rows[k];
    if (row.t < 0.3 || rng() > 0.35 || row.plats.length < 2) continue;
    const j = Math.floor(rng() * row.plats.length);
    const rest = row.plats.filter((p, i) => i !== j);
    if (rows[k + 1].plats.every(u => rest.some(p => linked(p, u))) && rows[k - 1].plats.every(l => rest.some(p => linked(l, p)))) row.plats = rest;
  }
  for (const row of rows) {
    for (const p of row.plats) {
      const r = rng();
      p.m = row.t < 0.25 ? (r < 0.35 ? 'box' : r < 0.7 ? 'carpet' : 'wood')
        : row.t < 0.6 ? (r < 0.18 ? 'metal' : r < 0.75 ? 'wood' : 'box')
        : (r < 0.2 ? 'glass' : r < 0.32 ? 'metal' : r < 0.85 ? 'wood' : 'carpet');
    }
    if (row.plats.every(p => SLIPPERY[p.m])) row.plats[0].m = 'wood'; // (always something to grab)
  }
  const top = rows[rows.length - 1].y - 125;
  const shift = 330 - top; // (so the finish is 330 below the top of the world)
  const rects = [];
  for (const row of rows) for (const p of row.plats) rects.push({ x1: p.x1, y1: row.y + shift, x2: p.x2, y2: row.y + shift + THICK[p.m], m: p.m });
  const finish = { x1: 380, y1: top + shift, x2: 580, y2: top + shift + THICK.gold, m: 'gold' };
  rects.push(finish);
  const floor = shift;
  rects.push({ x1: -60, y1: floor, x2: W + 60, y2: floor + 80, m: 'carpet', floor: true });
  rects.push({ x1: -60, y1: -400, x2: 20, y2: floor + 80, m: 'wall' }, { x1: 940, y1: -400, x2: W + 60, y2: floor + 80, m: 'wall' });
  rects.push({ x1: -60, y1: -400, x2: W + 60, y2: finish.y1 - 190, m: 'wall' });
  // pictures on the wallpaper (just for show)
  const frames = [];
  for (let k = 0; k < rows.length; k += 3) frames.push({ x: Math.round(R(140, 820)), y: rows[k].y + shift - 62, w: Math.round(R(46, 70)), h: Math.round(R(36, 52)), e: ['🐟', '🐭', '🧶', '🐈', '🌙', '🐦'][Math.floor(R(0, 6))] });
  return { rects, finish, floor, h: floor + 80, frames };
}

// Pushes a circle (o: { x, y }, radius r) out of the rects. Returns the surface it ends up against (within `slack`
// px) as { nx, ny, m }: which way is out of the surface, and its material. Or null.
function pushOut(o, r, rects, slack) {
  let hit = null;
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (const b of rects) {
      if (o.x < b.x1 - r - slack || o.x > b.x2 + r + slack || o.y < b.y1 - r - slack || o.y > b.y2 + r + slack) continue;
      const cx = clamp(o.x, b.x1, b.x2), cy = clamp(o.y, b.y1, b.y2);
      const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
      if (d === 0) { // the middle of the circle is inside: out through the nearest side
        let depth = o.x - b.x1, nx = -1, ny = 0;
        if (b.x2 - o.x < depth) { depth = b.x2 - o.x; nx = 1; ny = 0; }
        if (o.y - b.y1 < depth) { depth = o.y - b.y1; nx = 0; ny = -1; }
        if (b.y2 - o.y < depth) { depth = b.y2 - o.y; nx = 0; ny = 1; }
        o.x += nx * (depth + r);
        o.y += ny * (depth + r);
        hit = { nx, ny, m: b.m };
        moved = true;
      } else if (d < r + slack) {
        const nx = dx / d, ny = dy / d;
        if (d < r) { o.x += nx * (r - d); o.y += ny * (r - d); moved = true; }
        hit = { nx, ny, m: b.m };
      }
    }
    if (!moved) break;
  }
  return hit;
}

function bodyClear(rects, x, y, margin) {
  for (const s of CIRCLES) {
    const cx = x + s.x, cy = y + s.y, r = s.r + margin;
    for (const b of rects) {
      const dx = cx - clamp(cx, b.x1, b.x2), dy = cy - clamp(cy, b.y1, b.y2);
      if (dx * dx + dy * dy < r * r) return false;
    }
  }
  return true;
}

// How far a point is from the shortest line between a and b.
function segDist(a, b, x, y) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

/* ---------- the bot's way up ---------- */

// A grid over the tower: where a cat fits, and where it's within an arm's reach of something to grab (not the walls,
// and nothing slippery). The bot climbs along the cheapest path through it (A*), so it stays near things to hold on to.
function makeGrid(tw) {
  const CS = 10, GW = Math.ceil(W / CS), GH = Math.ceil(tw.h / CS);
  const free = new Uint8Array(GW * GH), held = new Uint8Array(GW * GH), goal = new Uint8Array(GW * GH);
  const grips = tw.rects.filter(b => !SLIPPERY[b.m]);
  const f = tw.finish;
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const x = i * CS + CS / 2, y = j * CS + CS / 2, n = j * GW + i;
      if (!bodyClear(tw.rects, x, y, 2)) continue;
      free[n] = 1;
      const sx = x + SHOULDERS[0].x, sy = y + SHOULDERS[0].y;
      let best = Infinity;
      for (const b of grips) best = Math.min(best, Math.hypot(sx - clamp(sx, b.x1, b.x2), sy - clamp(sy, b.y1, b.y2)));
      if (best < REACH - 15) held[n] = 1;
      if (x > f.x1 + 20 && x < f.x2 - 20 && y > f.y1 - 50 && y < f.y1 - BODY.r) goal[n] = 1;
    }
  }
  return { CS, GW, GH, free, held, goal };
}

function findPath(grid, tw, sx, sy) {
  const { CS, GW, GH, free, held, goal } = grid;
  const si = clamp(Math.floor(sx / CS), 0, GW - 1), sj = clamp(Math.floor(sy / CS), 0, GH - 1);
  let start = -1;
  for (let rad = 0; rad <= 7 && start < 0; rad++) {
    for (let dj = -rad; dj <= rad && start < 0; dj++) {
      for (let di = -rad; di <= rad && start < 0; di++) {
        const i = si + di, j = sj + dj;
        if (i >= 0 && j >= 0 && i < GW && j < GH && free[j * GW + i]) start = j * GW + i;
      }
    }
  }
  if (start < 0) return null;
  const N = GW * GH;
  const cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const gx = (tw.finish.x1 + tw.finish.x2) / 2 / CS, gy = (tw.finish.y1 - 30) / CS;
  const hf = [], hn = [];
  const push = (fv, n) => {
    let i = hf.length;
    hf.push(fv); hn.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= hf[i]) break;
      const tf = hf[p]; hf[p] = hf[i]; hf[i] = tf;
      const tn = hn[p]; hn[p] = hn[i]; hn[i] = tn;
      i = p;
    }
  };
  const pop = () => {
    const n = hn[0];
    const lf = hf.pop(), ln = hn.pop();
    if (hf.length) {
      hf[0] = lf; hn[0] = ln;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < hf.length && hf[l] < hf[m]) m = l;
        if (r < hf.length && hf[r] < hf[m]) m = r;
        if (m === i) break;
        const tf = hf[m]; hf[m] = hf[i]; hf[i] = tf;
        const tn = hn[m]; hn[m] = hn[i]; hn[i] = tn;
        i = m;
      }
    }
    return n;
  };
  cost[start] = 0;
  push(0, start);
  let end = -1;
  while (hf.length) {
    const n = pop();
    if (done[n]) continue;
    done[n] = 1;
    if (goal[n]) { end = n; break; }
    const i = n % GW, j = (n - i) / GW;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
        const m = b * GW + a;
        if (!free[m] || done[m]) continue;
        if (di && dj && (!free[j * GW + a] || !free[b * GW + i])) continue; // (no cutting corners)
        const c = cost[n] + (di && dj ? 1.414 : 1) * (held[m] ? 1 : 9);
        if (c < cost[m]) { cost[m] = c; from[m] = n; push(c + Math.hypot(a - gx, b - gy), m); }
      }
    }
  }
  if (end < 0) return null;
  const cells = [];
  for (let n = end; n >= 0; n = from[n]) cells.push({ x: (n % GW) * CS + CS / 2, y: Math.floor(n / GW) * CS + CS / 2 });
  cells.reverse();
  // Straighten it out: skip ahead while a straight line stays clear and within reach of something.
  const ok = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6);
    for (let k = 1; k < n; k++) {
      const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
      const c = Math.floor(y / CS) * GW + Math.floor(x / CS);
      if (!free[c] || !held[c]) return false;
    }
    return true;
  };
  const path = [cells[0]];
  for (let i = 0; i < cells.length - 1;) {
    let j = Math.min(cells.length - 1, i + 24);
    while (j > i + 1 && !ok(cells[i], cells[j])) j--;
    path.push(cells[j]);
    i = j;
  }
  return path;
}

/* ---------- the cat pictures ---------- */

// A cat's picture without its arms and legs (those are drawn separately), mouth closed [0] and open [1].
function bodyPics(eq) {
  const pics = [null, null];
  [0, 1].forEach(open => {
    const svg = CA.catSVG(eq, { bg: false, anim: false, arms: false, mouth: open ? 'open' : 'closed' })
      .replace('<svg ', '<svg width="200" height="192" ').replace('viewBox="0 0 200 240"', 'viewBox="0 0 200 192"');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 192;
      c.getContext('2d').drawImage(img, 0, 0);
      pics[open] = c;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  return pics;
}

/* ---------- the game ---------- */

function play(ctx) {
  const online = !ctx.bot;
  const host = ctx.isHost;              // (against a bot, you're always the host)
  const meI = host ? 0 : 1;
  const skill = skillOf(ctx);
  const tower = makeTower(ctx.rng);
  const LIMIT = L(TIME_LIMIT * 1000) / 1000;

  ctx.stage.innerHTML =
    '<div class="g-climb"><div class="cc-wrap"><canvas class="cc-canvas" id="ccCanvas" width="' + W + '" height="' + H + '"></canvas>' +
    '<button class="btn primary cc-lock hidden" id="ccLock">🖱️ Click here to use your mouse</button></div>' +
    '<div class="cc-pad"><span>Drag on the game to move your paw</span><button class="btn" id="ccFish">🐟 Fish</button></div>' +
    '<p class="g-msg" id="ccMsg"></p></div>';
  const cv = $('ccCanvas');
  const g = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR;
  cv.height = H * DPR;
  const { dot, star, roundRect, label, bigText, dizzy } = F.painter(g, W);

  function newCat(i, eq, name) {
    const x = START_X[i], y = tower.floor - BODY.r - 0.5;
    const aim = { x: i ? -44 : 44, y: 6 };
    const S = { x: x + SHOULDERS[0].x, y: y + SHOULDERS[0].y };
    return {
      i, name, fur: F.fur(eq), pics: bodyPics(eq),
      x, y, vx: 0, vy: 0, ground: null,
      aim, aimV: { x: 0, y: 0 }, paw: { x: S.x + aim.x, y: S.y + aim.y }, hold: null,
      fish: false, uses: FISH_USES, fishAim: { x: i ? 50 : -50, y: 20 }, fishPaw: { x: x, y: y }, tip: { x: x, y: y }, tipV: { x: 0, y: 0 },
      slapCd: 0, stun: 0, done: false, legs: null, arm2: null, landV: 0,
    };
  }
  const me = newCat(meI, CA.profile.equip, 'You');
  const them = newCat(1 - meI, ctx.oppEquip, ctx.oppName);

  let phase = 'ready', readyT = 0, count = 0, goAt = 0, clock = 0, winner = null;
  let touchT = 0, ghostT = 0;    // (see "the cats are solid")
  let camY = tower.floor - H + 60;
  let lastMsg = performance.now(), sentTop = false;
  const fxs = []; // effects: dust, rings, words

  /* ---------- controls ---------- */

  let inX = 0, inY = 0;          // how far the mouse moved since the last frame (in screen pixels)
  let locked = false, touchAt = null, everLocked = false;
  const fine = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  function lock() {
    if (phase === 'over' || !cv.requestPointerLock) return;
    try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* (no pointer lock: the mouse still works over the game) */ }
  }
  ctx.listen(cv, 'pointerdown', e => {
    if (e.pointerType === 'touch') { touchAt = { x: e.clientX, y: e.clientY, id: e.pointerId }; e.preventDefault(); return; }
    if (!locked) lock();
  });
  ctx.listen(cv, 'pointermove', e => {
    if (e.pointerType === 'touch') {
      if (!touchAt || touchAt.id !== e.pointerId) return;
      inX += (e.clientX - touchAt.x) * 1.4;
      inY += (e.clientY - touchAt.y) * 1.4;
      touchAt.x = e.clientX;
      touchAt.y = e.clientY;
      e.preventDefault();
      return;
    }
    inX += e.movementX || 0;
    inY += e.movementY || 0;
  });
  ['pointerup', 'pointercancel'].forEach(type => ctx.listen(cv, type, e => { if (touchAt && touchAt.id === e.pointerId) touchAt = null; }));
  ctx.listen(document, 'pointerlockchange', () => { locked = document.pointerLockElement === cv; if (locked) everLocked = true; });
  ctx.listen($('ccLock'), 'click', lock);
  ctx.listen($('ccFish'), 'click', () => toggleFish());
  ctx.listen(document, 'keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyV' || (e.key || '').toLowerCase() === 'v') { e.preventDefault(); if (!e.repeat) toggleFish(); }
  });
  ctx.onEnd(() => { if (document.pointerLockElement === cv) document.exitPointerLock(); });

  function fitAim(a) {
    const l = Math.hypot(a.x, a.y);
    if (l > REACH) { a.x *= REACH / l; a.y *= REACH / l; }
    else if (l < 24) { if (l < 0.01) { a.x = 0; a.y = 24; } else { a.x *= 24 / l; a.y *= 24 / l; } }
  }
  // The mouse moves your paw (or, while it's out, your fish), always measured from your shoulder. It also notes how
  // fast the paw is being moved: while the paw holds on, your cat moves that fast the other way (that's a fling).
  let inputAt = performance.now(), testAim = null;
  const prevAim = { x: me.aim.x, y: me.aim.y };
  function applyInput(now) {
    const fdt = Math.max(0.004, (now - inputAt) / 1000);
    inputAt = now;
    if (phase === 'play' && !me.done && (inX || inY)) {
      const k = SENS * W / Math.max(1, cv.clientWidth);
      const a = me.fish ? me.fishAim : me.aim;
      a.x += inX * k;
      a.y += inY * k;
      fitAim(a);
    }
    if (testAim && phase === 'play') { me.aim.x = testAim.x; me.aim.y = testAim.y; fitAim(me.aim); testAim = null; }
    inX = inY = 0;
    me.aimV.x = me.aimV.x * 0.4 + (me.aim.x - prevAim.x) / fdt * 0.6;
    me.aimV.y = me.aimV.y * 0.4 + (me.aim.y - prevAim.y) / fdt * 0.6;
    prevAim.x = me.aim.x;
    prevAim.y = me.aim.y;
  }

  function toggleFish() {
    if (phase !== 'play' || me.done) return;
    if (!me.fish && me.uses <= 0) { hint('🐟 No fish left!'); return; }
    me.fish = !me.fish;
    if (me.fish) { showFish(me); sound([[300, 0, 0.06], [190, 0.05, 0.1]]); } else sound('flip');
  }
  function showFish(c) {
    const S = shoulder(c, 1);
    c.fishPaw = { x: S.x + c.fishAim.x, y: S.y + c.fishAim.y };
    c.tip = fishTip(c);
    c.tipV = { x: 0, y: 0 };
  }

  /* ---------- your cat ---------- */

  function shoulder(c, k) { return { x: c.x + SHOULDERS[k].x, y: c.y + SHOULDERS[k].y }; }

  // The climbing arm. The paw goes where you point (from your shoulder) until it touches something. Then it stays
  // put while you keep pressing it into that surface, and the arm pushes your cat instead. Pull the paw away from the
  // surface and it lets go. Pushing it too much sideways makes it slide (a lot, on something slippery). Returns the
  // push on your cat.
  function stepArm(c, dt) {
    const S = shoulder(c, 0);
    const tx = S.x + c.aim.x, ty = S.y + c.aim.y;
    if (c.stun > 0) { // dazed: the claws don't hold
      c.hold = null;
      movePaw(c, tx, ty, PAW_SPEED * dt);
      return [0, 0];
    }
    let fx = 0, fy = 0;
    if (c.hold) {
      const h = c.hold;
      const dx = h.x - tx, dy = h.y - ty;
      const dn = dx * h.nx + dy * h.ny; // > 0 while you press into the surface
      if (dn <= -8) c.hold = null; // pulled away: let go
      else if (dn <= 0.3) { c.paw.x = h.x; c.paw.y = h.y; } // (just touching: it stays put, but doesn't push)
      else {
        const sx = dx - dn * h.nx, sy = dy - dn * h.ny, sl = Math.hypot(sx, sy), lim = MU[h.m] * dn;
        if (sl > lim) { // too sideways for the claws: it slides
          const k = lim / sl;
          const o = { x: tx + dn * h.nx + sx * k, y: ty + dn * h.ny + sy * k };
          const hit = pushOut(o, PAW_R, tower.rects, 1.5);
          if (!hit) c.hold = null;
          else { h.x = o.x; h.y = o.y; h.nx = hit.nx; h.ny = hit.ny; h.m = hit.m; }
        }
        if (c.hold) { c.paw.x = h.x; c.paw.y = h.y; fx = (h.x - tx) * K; fy = (h.y - ty) * K; }
      }
    }
    if (!c.hold) {
      const hit = movePaw(c, tx, ty, PAW_SPEED * dt);
      if (hit) {
        c.hold = { x: c.paw.x, y: c.paw.y, nx: hit.nx, ny: hit.ny, m: hit.m };
        fx = (c.paw.x - tx) * K;
        fy = (c.paw.y - ty) * K;
        if (c === me && !SLIPPERY[hit.m]) clawTick();
      }
    }
    const f = Math.hypot(fx, fy);
    if (f > PUSH) { fx *= PUSH / f; fy *= PUSH / f; }
    return [fx, fy];
  }

  // Moves a paw toward (tx, ty) in small steps, and stops on the first thing it touches (returns that surface).
  function movePaw(c, tx, ty, step) {
    const p = c.paw;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d < 0.01) return c.stun > 0 ? null : pushOut(p, PAW_R, tower.rects, 0.6);
    const go = Math.min(d, step), n = Math.max(1, Math.ceil(go / 5));
    for (let k = 1; k <= n; k++) {
      p.x += dx / d * go / n;
      p.y += dy / d * go / n;
      const hit = pushOut(p, PAW_R, tower.rects, 0);
      if (hit) return c.stun > 0 ? null : hit;
    }
    return null;
  }

  let lastClaw = 0;
  function clawTick() {
    const now = performance.now();
    if (now - lastClaw < 160) return;
    lastClaw = now;
    sound([[1400 + Math.random() * 300, 0, 0.025]]);
  }

  // The fish arm: the paw holding the fish goes where you point (it doesn't bump into anything), and the fish sticks
  // out past it.
  function fishTip(c) {
    const S = shoulder(c, 1);
    const ax = c.fishPaw.x - S.x, ay = c.fishPaw.y - S.y, al = Math.hypot(ax, ay) || 1;
    return { x: c.fishPaw.x + ax / al * FISH_LEN, y: c.fishPaw.y + ay / al * FISH_LEN };
  }
  function stepFish(c, dt) {
    const S = shoulder(c, 1);
    const tx = S.x + c.fishAim.x, ty = S.y + c.fishAim.y;
    const dx = tx - c.fishPaw.x, dy = ty - c.fishPaw.y, d = Math.hypot(dx, dy), go = Math.min(d, 3200 * dt);
    if (d > 0.01) { c.fishPaw.x += dx / d * go; c.fishPaw.y += dy / d * go; }
    const tip = fishTip(c);
    c.tipV.x = (tip.x - c.tip.x) / dt;
    c.tipV.y = (tip.y - c.tip.y) / dt;
    c.tip = tip;
  }

  // Moves a cat's body one step: gravity, the push from its arm, and bumping into the tower (and the other cat).
  function moveBody(c, dt, ax, ay, o) {
    c.vx += ax * dt;
    c.vy += (ay + G) * dt;
    if (ax || ay) { // (the arm is springy: damp it, toward moving the way the mouse moves your cat)
      const f = Math.hypot(ax, ay), ux = ax / f, uy = ay / f, k = Math.min(1, DAMP * dt);
      const along = (c.vx + c.aimV.x) * ux + (c.vy + c.aimV.y) * uy;
      c.vx -= along * ux * k;
      c.vy -= along * uy * k;
    }
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > MAX_V) { c.vx *= MAX_V / sp; c.vy *= MAX_V / sp; }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.ground = null;
    if (o) bump(c, o, dt);
    let hard = 0;
    for (let it = 0; it < 2; it++) {
      for (const s of CIRCLES) {
        const p = { x: c.x + s.x, y: c.y + s.y };
        const hit = pushOut(p, s.r, tower.rects, 0.5);
        if (!hit) continue;
        c.x = p.x - s.x;
        c.y = p.y - s.y;
        const vn = c.vx * hit.nx + c.vy * hit.ny;
        if (vn < 0) { hard = Math.max(hard, -vn); c.vx -= vn * hit.nx; c.vy -= vn * hit.ny; }
        if (hit.ny < -0.5) c.ground = hit;
      }
    }
    if (c.ground) c.vx *= Math.exp(-(SLIPPERY[c.ground.m] ? 0.6 : 12) * dt); // (slippery things are slippery)
    if (hard > 380 && c.landV <= 0) { // a thud
      c.landV = 0.2;
      for (let k = 0; k < 5 && fxs.length < 80; k++) fxDust(c.x + (Math.random() - 0.5) * 30, c.y + BODY.r);
      if (c === me || !online) sound([[110 + Math.random() * 30, 0, 0.07]]);
    }
    c.landV = Math.max(0, c.landV - dt);
  }

  /* ---------- the cats are solid ---------- */

  // Each app pushes its own cat out of the other one. If they've been stuck together for a moment, they slip through
  // each other for a few seconds, so nobody can sit in the way.
  function bump(c, o, dt) {
    if (ghostT > 0) return;
    let touching = false;
    for (const a of CIRCLES) {
      for (const b of CIRCLES) {
        const dx = c.x + a.x - (o.x + b.x), dy = c.y + a.y - (o.y + b.y), d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d >= min + 1.5) continue;
        touching = true;
        if (d >= min || d < 0.001) continue;
        const nx = dx / d, ny = dy / d;
        c.x += nx * (min - d);
        c.y += ny * (min - d);
        const vn = c.vx * nx + c.vy * ny;
        if (vn < 0) { c.vx -= vn * nx; c.vy -= vn * ny; }
      }
    }
    if (c === me) touchT = touching ? touchT + dt : Math.max(0, touchT - dt * 0.5);
  }
  function overlap(a, b) {
    for (const s of CIRCLES) for (const t of CIRCLES) if (Math.hypot(a.x + s.x - b.x - t.x, a.y + s.y - b.y - t.y) < s.r + t.r - 2) return true;
    return false;
  }
  function stepGhost(dt, tv) {
    if (touchT > GHOST_AFTER) { touchT = 0; ghostT = GHOST_FOR; }
    if (ghostT > 0) {
      ghostT -= dt;
      if (ghostT <= 0 && overlap(me, tv)) ghostT = 0.2; // (wait until you're apart)
    }
  }

  /* ---------- slaps ---------- */

  // c's fish hitting cat view v, fast enough.
  function checkSlap(c, v) {
    if (!c.fish || c.slapCd > 0 || c.uses <= 0 || phase !== 'play') return false;
    const sx = c.tipV.x - c.vx, sy = c.tipV.y - c.vy, sp = Math.hypot(sx, sy); // (how fast you swing it, not how fast you fly)
    if (sp < SLAP_SPEED) return false;
    if (!CIRCLES.some(s => segDist(c.fishPaw, c.tip, v.x + s.x, v.y + s.y) < s.r + 14)) return false;
    c.uses--;
    c.slapCd = 0.6;
    const k = clamp(sp * 0.7, 560, 1000) / sp;
    const vx = sx * k, vy = sy * k - 120;
    pop(v.x, v.y - 70, 'SLAP!', '#7dd3ff');
    ring(v.x, v.y - 20);
    sound([[230, 0, 0.05], [150, 0.04, 0.12], [90, 0.1, 0.12]]);
    if (c.uses <= 0) ctx.later(() => { c.fish = false; if (c === me) hint('That was your last fish slap! 🐟'); }, 450);
    return { vx: Math.round(vx), vy: Math.round(vy) };
  }
  function getSlapped(c, vx, vy) {
    c.vx = clamp(c.vx * 0.3 + vx, -MAX_V, MAX_V);
    c.vy = clamp(c.vy * 0.3 + vy, -MAX_V, MAX_V);
    c.hold = null;
    c.stun = 0.8;
    if (c === me) {
      pop(me.x, me.y - 70, 'SLAP!', '#ff8a8a');
      sound([[230, 0, 0.05], [150, 0.04, 0.12], [90, 0.1, 0.12]]);
      hint('Slapped with a fish! 🐟');
    }
  }

  /* ---------- the race ---------- */

  function atTop(v) {
    const f = tower.finish;
    return v.x > f.x1 - 6 && v.x < f.x2 + 6 && v.y + BODY.r <= f.y1 + 3 && v.y > f.y1 - 150;
  }
  const height = v => clamp((tower.floor - BODY.r - v.y) / (tower.floor - BODY.r - tower.finish.y1 + BODY.r), 0, 1);

  function reachedTop() {
    me.done = true;
    me.hold = null;
    if (!online || host) endGame(meI);
    else if (!sentTop) { sentTop = true; ctx.send({ t: 'top' }); hint('You made it! Checking who was first…'); }
  }
  function timeUp() {
    const a = height(me), b = height(theirView(performance.now()));
    endGame(Math.abs(a - b) < 0.004 ? -1 : a > b ? meI : 1 - meI, true);
  }
  function endGame(w, timeout) { // w: the winner (0 or 1), or -1 for a draw
    if (phase === 'over') return;
    phase = 'over';
    winner = { w, timeout: !!timeout };
    if (host && online) ctx.send({ t: 'end', w, o: timeout ? 1 : 0 });
    if (document.pointerLockElement === cv) document.exitPointerLock();
    ctx.score(w === meI ? 1 : 0, w === 1 - meI ? 1 : 0);
    ctx.note(w < 0 ? "It's a draw!" : w === meI ? 'You win!' : them.name + ' wins!');
    sound(w === meI ? 'point' : w < 0 ? 'tick' : 'miss');
    ctx.later(() => ctx.finish(w < 0 ? 'draw' : w === meI ? 'win' : 'lose'), 2600);
  }

  /* ---------- online ---------- */

  const rbuf = []; // the other cat's recent states
  function packMe() {
    return {
      t: 's', x: r1(me.x), y: r1(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy), px: r1(me.paw.x), py: r1(me.paw.y),
      h: me.hold ? 1 : 0, f: me.fish ? 1 : 0, fx: r1(me.fishPaw.x), fy: r1(me.fishPaw.y), u: me.uses, s: me.stun > 0 ? 1 : 0,
    };
  }
  function onRemote(s) { // (it comes from the other app: check everything)
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
    const x = clamp(s.x, -100, W + 100), y = clamp(s.y, -600, tower.h + 200);
    rbuf.push({
      at: performance.now(), x, y, vx: clamp(num(s.vx, 0), -3000, 3000), vy: clamp(num(s.vy, 0), -3000, 3000),
      px: clamp(num(s.px, x), x - 300, x + 300), py: clamp(num(s.py, y), y - 300, y + 300),
      fx: clamp(num(s.fx, x), x - 300, x + 300), fy: clamp(num(s.fy, y), y - 300, y + 300),
      hold: !!s.h, fish: !!s.f, stun: !!s.s,
    });
    them.uses = clamp(Math.floor(num(s.u, them.uses)), 0, FISH_USES);
    if (rbuf.length > 40) rbuf.shift();
  }
  // The other cat as this app shows it: { x, y, vx, vy, px, py (the claw paw), hold, fish, fx, fy (the fish paw), stun }
  const viewOf = c => ({ x: c.x, y: c.y, vx: c.vx, vy: c.vy, px: c.paw.x, py: c.paw.y, hold: !!c.hold, fish: c.fish, fx: c.fishPaw.x, fy: c.fishPaw.y, stun: c.stun > 0 });
  function theirView(now) {
    if (!online || !rbuf.length) return viewOf(them);
    return F.sample(rbuf, now - VIEW_DELAY, ['x', 'y', 'px', 'py', 'fx', 'fy']);
  }

  ctx.on(m => {
    if (!m || typeof m !== 'object') return;
    lastMsg = performance.now();
    if (m.t === 's') onRemote(m);
    else if (m.t === 'slap' && Number.isFinite(m.vx) && Number.isFinite(m.vy)) { // (their fish hit you on their screen)
      if (phase === 'play' && !me.done) getSlapped(me, clamp(m.vx, -1200, 1200), clamp(m.vy, -1200, 1200));
    } else if (host && m.t === 'top') {
      if (phase === 'play') endGame(1 - meI);
    } else if (!host && m.t === 'end' && [-1, 0, 1].includes(m.w)) {
      endGame(m.w, !!m.o);
    }
  });

  /* ---------- the bot ---------- */

  const bot = ctx.bot ? {
    grid: null, path: null, pi: 1, phys: false, rest: 0, retry: 0, wave: Math.random() * 6, anchor: null, next: 0, swing: null,
    speed: 34 + 34 * skill, slip: 0.05 - 0.035 * skill,
  } : null;
  if (bot) { bot.grid = makeGrid(tower); replan(); }
  function replan() { bot.path = findPath(bot.grid, tower, them.x, them.y); bot.pi = 1; bot.anchor = null; }

  function stepBot(dt, mv) {
    const c = them;
    c.stun = Math.max(0, c.stun - dt);
    c.slapCd = Math.max(0, c.slapCd - dt);
    if (phase !== 'play' || bot.phys || c.done) {
      moveBody(c, dt, 0, 0, mv);
      botPaw(c, dt, true);
      if (bot.phys) {
        bot.rest = c.ground && Math.hypot(c.vx, c.vy) < 40 ? bot.rest + dt : 0;
        if (bot.rest > 0.35 && c.stun <= 0) { bot.phys = false; replan(); }
      }
      return;
    }
    if (!bot.path || bot.pi >= bot.path.length) {
      bot.retry -= dt;
      if (!bot.path && bot.retry <= 0) { bot.retry = 1; replan(); }
      botPaw(c, dt, !bot.path);
      return;
    }
    // Along its path, in little surges (like it's pulling itself up).
    const x0 = c.x, y0 = c.y;
    bot.wave += dt * 6;
    let left = bot.speed * (0.35 + 0.65 * Math.max(0, Math.sin(bot.wave))) * dt;
    while (left > 0 && bot.pi < bot.path.length) {
      const p = bot.path[bot.pi];
      const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
      if (d <= left) { c.x = p.x; c.y = p.y; left -= d; bot.pi++; } else { c.x += dx / d * left; c.y += dy / d * left; left = 0; }
    }
    c.vx = (c.x - x0) / dt;
    c.vy = (c.y - y0) / dt;
    const probe = { x: c.x, y: c.y + 4 };
    const standing = !!pushOut(probe, BODY.r, tower.rects, 1);
    if (!standing && Math.random() < bot.slip * dt) { // it slips
      bot.phys = true;
      c.vx = (Math.random() - 0.5) * 160;
      c.vy = 0;
      c.hold = null;
    }
    botPaw(c, dt, false);
    botFish(c, dt);
  }

  // The bot's paw grabs the nearest edge ahead of it, and moves on when it's out of reach.
  function botPaw(c, dt, dangle) {
    const S = shoulder(c, 0);
    bot.next -= dt;
    if (dangle || c.stun > 0) {
      bot.anchor = null;
      c.hold = null;
      movePaw(c, S.x + 18, S.y + 70, PAW_SPEED * dt);
      return;
    }
    if (!bot.anchor || bot.next <= 0 || Math.hypot(bot.anchor.x - S.x, bot.anchor.y - S.y) > REACH) {
      bot.next = 0.4;
      const p = bot.path[Math.min(bot.pi + 1, bot.path.length - 1)];
      const gx = S.x + clamp(p.x - c.x, -90, 90) * 0.8, gy = S.y - 80;
      let best = null, bd = Infinity;
      for (const b of tower.rects) {
        if (SLIPPERY[b.m]) continue;
        const q = { x: clamp(gx, b.x1, b.x2), y: clamp(gy, b.y1, b.y2) };
        const hit = pushOut(q, PAW_R, [b], 0);
        if (!hit || Math.hypot(q.x - S.x, q.y - S.y) > REACH) continue;
        const d = Math.hypot(q.x - gx, q.y - gy);
        if (d < bd) { bd = d; best = { x: q.x, y: q.y, nx: hit.nx, ny: hit.ny, m: b.m }; }
      }
      bot.anchor = best;
    }
    const a = bot.anchor;
    if (!a) { c.hold = null; movePaw(c, S.x + 30, S.y - 90, PAW_SPEED * dt); return; }
    const dx = a.x - c.paw.x, dy = a.y - c.paw.y, d = Math.hypot(dx, dy), go = Math.min(d, PAW_SPEED * 0.6 * dt);
    if (d > 0.01) { c.paw.x += dx / d * go; c.paw.y += dy / d * go; }
    c.hold = d < 2 ? a : null;
  }

  // Now and then, when you're near, the bot takes out its fish and swings it at you.
  function botFish(c, dt) {
    if (bot.swing) {
      bot.swing.t += dt;
      const k = Math.min(1, bot.swing.t / 0.3), ang = bot.swing.a0 + (bot.swing.a1 - bot.swing.a0) * k;
      c.fishAim.x = Math.cos(ang) * 105;
      c.fishAim.y = Math.sin(ang) * 105;
      stepFish(c, dt);
      const hit = !me.done && checkSlap(c, me);
      if (hit) getSlapped(me, hit.vx, hit.vy);
      if (bot.swing.t > 0.45) { bot.swing = null; c.fish = false; }
      return;
    }
    if (c.uses <= 0 || c.stun > 0 || me.done) return;
    const S = shoulder(c, 1);
    const dx = me.x - S.x, dy = me.y - 15 - S.y;
    if (Math.hypot(dx, dy) < REACH + FISH_LEN * 0.7 && Math.random() < (0.25 + 0.5 * skill) * dt) {
      const toward = Math.atan2(dy, dx), side = Math.random() < 0.5 ? -1 : 1;
      bot.swing = { t: 0, a0: toward - side * 1.6, a1: toward + side * 1.0 };
      c.fishAim.x = Math.cos(bot.swing.a0) * 105;
      c.fishAim.y = Math.sin(bot.swing.a0) * 105;
      c.fish = true;
      showFish(c);
      sound([[300, 0, 0.06], [190, 0.05, 0.1]]);
    }
  }

  /* ---------- the game loop ---------- */

  function step(dt, tv) {
    if (phase === 'ready') {
      readyT += dt;
      const n = Math.ceil((READY - readyT) / 0.8);
      if (n !== count) { count = n; if (n > 0) sound('tick'); }
      if (readyT >= READY) { phase = 'play'; goAt = performance.now(); sound('go'); }
    }
    if (phase === 'play') clock += dt;
    me.stun = Math.max(0, me.stun - dt);
    me.slapCd = Math.max(0, me.slapCd - dt);
    const [ax, ay] = me.done ? [0, 0] : stepArm(me, dt);
    if (me.fish) stepFish(me, dt);
    moveBody(me, dt, ax, ay, tv);
    if (bot) {
      stepBot(dt, viewOf(me));
      if (them.fish && !bot.swing) them.fish = false;
    }
    if (me.fish) {
      const hit = checkSlap(me, tv);
      if (hit) { if (bot) { getSlapped(them, hit.vx, hit.vy); bot.phys = true; bot.swing = null; them.fish = false; } else ctx.send(Object.assign({ t: 'slap' }, hit)); }
    }
    stepGhost(dt, tv);
    if (phase === 'play') {
      if (!me.done && atTop(me)) reachedTop();
      if (bot && !them.done && atTop(them)) { them.done = true; endGame(1 - meI); }
      if (host && clock >= LIMIT) timeUp();
    }
  }

  let simAt = performance.now(), acc = 0, lastFrame = performance.now();
  // (The mouse moves once a frame, but the physics runs in smaller steps: the aim slides over to where the mouse put
  // it during those steps, so your cat moves smoothly instead of in jerks.)
  function advance(now, cap) {
    const a0 = { x: me.aim.x, y: me.aim.y }, f0 = { x: me.fishAim.x, y: me.fishAim.y };
    applyInput(now);
    const a1 = { x: me.aim.x, y: me.aim.y }, f1 = { x: me.fishAim.x, y: me.fishAim.y };
    acc += Math.min(cap, Math.max(0, (now - simAt) / 1000));
    simAt = now;
    const tv = bot ? null : theirView(now);
    const n = Math.floor(acc / DT);
    for (let k = 1; k <= n; k++) {
      me.aim.x = a0.x + (a1.x - a0.x) * k / n;
      me.aim.y = a0.y + (a1.y - a0.y) * k / n;
      me.fishAim.x = f0.x + (f1.x - f0.x) * k / n;
      me.fishAim.y = f0.y + (f1.y - f0.y) * k / n;
      step(DT, tv || viewOf(them));
    }
    acc -= n * DT;
    me.aim.x = a1.x; me.aim.y = a1.y;
    me.fishAim.x = f1.x; me.fishAim.y = f1.y;
  }

  function frame(now) {
    if (!ctx.alive()) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    advance(now, 0.25);
    render(now, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // (Browsers stop drawing in a hidden tab: the game keeps going anyway, just without the drawing.)
  ctx.every(() => { const now = performance.now(); if (now - lastFrame > 300) advance(now, 1.5); }, 250);
  if (online) {
    ctx.every(() => ctx.send(packMe()), SEND_MS);
    ctx.every(() => { if (phase !== 'over' && performance.now() - lastMsg > 15000) ctx.afk(); }, 1000);
  }
  ctx.score(0, 0);
  ctx.note('First to the top wins · 🐟 2 slaps each');
  if (window.__testHooks) {
    window.__cc = {
      tower, me, them, bot, host, phase: () => phase, ghost: () => ghostT, clock: () => clock, view: () => theirView(performance.now()),
      move: (dx, dy) => { inX += dx; inY += dy; }, fish: toggleFish, setAim: (x, y) => { testAim = { x, y }; },
    };
  }

  /* ---------- effects ---------- */

  function fxDust(x, y) { fxs.push({ k: 'dust', x, y, vx: (Math.random() - 0.5) * 100, vy: -Math.random() * 50, life: 0.5, max: 0.5, r: 4 + Math.random() * 4 }); }
  function pop(x, y, text, color) { fxs.push({ k: 'word', x, y, vx: 0, vy: -50, life: 1.1, max: 1.1, text, color }); }
  function ring(x, y) { fxs.push({ k: 'ring', x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, r: 10 }); }
  let msgText = '', msgUntil = 0;
  function hint(text) { msgText = text; msgUntil = performance.now() + 2200; }

  /* ---------- drawing ---------- */

  function render(now, dt) {
    const tv = bot ? viewOf(them) : theirView(now);
    const mv = viewOf(me);
    const want = clamp(me.y - H * 0.58, 0, tower.h - H);
    camY += (want - camY) * Math.min(1, dt * 6);
    g.setTransform(DPR, 0, 0, DPR, 0, -camY * DPR);
    drawRoom();
    for (const b of tower.rects) if (b.y2 > camY - 20 && b.y1 < camY + H + 20 && !(b.m === 'wall')) drawRect(b);
    drawFinish(now);
    stepLimbs(them, tv, dt);
    stepLimbs(me, mv, dt);
    drawCat(them, tv, now, ghostT > 0, false);
    drawCat(me, mv, now, false, true);
    for (const p of fxs) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = fxs.length - 1; i >= 0; i--) if (fxs[i].life <= 0) fxs.splice(i, 1);
    drawFx();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawHud(now, mv, tv);
    $('ccLock').classList.toggle('hidden', !fine || locked || phase === 'over');
    updateMsg(now);
  }

  function drawRoom() {
    const t = camY / tower.h;
    const sky = g.createLinearGradient(0, camY, 0, camY + H);
    sky.addColorStop(0, t < 0.33 ? '#3a2a5c' : t < 0.66 ? '#2e3c5e' : '#4a2f45');
    sky.addColorStop(1, t < 0.33 ? '#4b3570' : t < 0.66 ? '#3a4c72' : '#5d3a52');
    g.fillStyle = sky;
    g.fillRect(0, camY, W, H);
    g.fillStyle = 'rgba(255, 255, 255, .035)'; // wallpaper stripes
    for (let x = 40; x < W; x += 80) g.fillRect(x, camY, 26, H);
    g.font = '24px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of tower.frames) {
      if (f.y + f.h < camY || f.y - f.h > camY + H) continue;
      g.fillStyle = 'rgba(30, 18, 40, .45)';
      g.fillRect(f.x - f.w / 2 - 5, f.y - f.h / 2 - 5, f.w + 10, f.h + 10);
      g.fillStyle = 'rgba(255, 240, 210, .18)';
      g.fillRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
      g.globalAlpha = 0.5;
      g.fillText(f.e, f.x, f.y + 1);
      g.globalAlpha = 1;
    }
    g.fillStyle = '#21182f'; // the side walls
    g.fillRect(0, camY, 20, H);
    g.fillRect(940, camY, 20, H);
  }

  function drawRect(b) {
    const w = b.x2 - b.x1, h = b.y2 - b.y1;
    if (b.floor) {
      g.fillStyle = '#7a4a6a';
      g.fillRect(b.x1, b.y1, w, h);
      g.fillStyle = '#93597f';
      g.fillRect(b.x1, b.y1, w, 8);
      return;
    }
    g.save();
    if (b.m === 'wood') {
      g.fillStyle = '#5b3a1f';
      if (b.x1 > 20) { g.beginPath(); g.moveTo(b.x1 + 14, b.y2); g.lineTo(b.x1 + 26, b.y2); g.lineTo(b.x1 + 14, b.y2 + 16); g.fill(); }
      if (b.x2 < 940) { g.beginPath(); g.moveTo(b.x2 - 14, b.y2); g.lineTo(b.x2 - 26, b.y2); g.lineTo(b.x2 - 14, b.y2 + 16); g.fill(); }
      g.fillStyle = '#8a5a32';
      roundRect(b.x1, b.y1, w, h, 4); g.fill();
      g.fillStyle = '#a8743f';
      g.fillRect(b.x1 + 3, b.y1 + 2, w - 6, 4);
      g.strokeStyle = 'rgba(60, 35, 15, .35)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = b.x1 + 30; x < b.x2 - 10; x += 47) { g.moveTo(x, b.y1 + 8); g.lineTo(x + 18, b.y1 + 8); }
      g.stroke();
    } else if (b.m === 'carpet') {
      g.fillStyle = 'rgba(120, 80, 50, .5)'; // (a cat-tree post behind it)
      g.fillRect((b.x1 + b.x2) / 2 - 12, b.y2, 24, 70);
      g.fillStyle = '#c9b48f';
      roundRect(b.x1, b.y1 + 2, w, h - 2, 10); g.fill();
      g.fillStyle = '#e9d7b5';
      roundRect(b.x1, b.y1, w, h - 6, 10); g.fill();
    } else if (b.m === 'box') {
      g.fillStyle = '#a87842';
      g.fillRect(b.x1, b.y1, w, h);
      g.fillStyle = '#c8955a';
      g.fillRect(b.x1 + 2, b.y1 + 2, w - 4, h - 6);
      g.fillStyle = '#e6c48a';
      g.fillRect((b.x1 + b.x2) / 2 - 10, b.y1 + 2, 20, h - 6);
    } else if (b.m === 'metal') {
      const gr = g.createLinearGradient(0, b.y1, 0, b.y2);
      gr.addColorStop(0, '#f1f5fa');
      gr.addColorStop(1, '#8d99a8');
      g.fillStyle = gr;
      roundRect(b.x1, b.y1, w, h, 5); g.fill();
      g.strokeStyle = 'rgba(255, 255, 255, .8)';
      g.lineWidth = 2;
      g.beginPath();
      for (let x = b.x1 + 16; x < b.x2 - 16; x += 38) { g.moveTo(x, b.y1 + h - 5); g.lineTo(x + 10, b.y1 + 5); }
      g.stroke();
    } else if (b.m === 'glass') {
      g.fillStyle = 'rgba(170, 225, 255, .5)';
      roundRect(b.x1, b.y1, w, h, 4); g.fill();
      g.strokeStyle = 'rgba(235, 250, 255, .95)';
      g.lineWidth = 2;
      g.stroke();
      g.beginPath();
      g.moveTo(b.x1 + 12, b.y2 - 4); g.lineTo(b.x1 + 26, b.y1 + 4);
      g.moveTo(b.x1 + 34, b.y2 - 4); g.lineTo(b.x1 + 42, b.y1 + 4);
      g.stroke();
    } else if (b.m === 'gold') {
      const gr = g.createLinearGradient(0, b.y1, 0, b.y2);
      gr.addColorStop(0, '#fff1a8');
      gr.addColorStop(1, '#d9a300');
      g.fillStyle = gr;
      roundRect(b.x1, b.y1, w, h, 6); g.fill();
    }
    g.restore();
  }

  function drawFinish(now) {
    const f = tower.finish;
    if (f.y1 > camY + H + 60 || f.y1 < camY - 200) return;
    const cx = (f.x1 + f.x2) / 2;
    g.fillStyle = '#ffd23f'; // the trophy: a golden fish on a cup
    g.beginPath(); g.moveTo(cx - 22, f.y1 - 40); g.lineTo(cx + 22, f.y1 - 40); g.lineTo(cx + 10, f.y1 - 14); g.lineTo(cx - 10, f.y1 - 14); g.closePath(); g.fill();
    g.fillRect(cx - 4, f.y1 - 14, 8, 8);
    g.fillRect(cx - 14, f.y1 - 7, 28, 7);
    g.save();
    g.translate(cx, f.y1 - 58 + Math.sin(now / 300) * 3);
    g.fillStyle = '#ffe066';
    g.beginPath(); g.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-18, 0); g.lineTo(-32, -10); g.lineTo(-32, 10); g.closePath(); g.fill();
    g.fillStyle = '#5b3a00';
    dot(11, -3, 2.5);
    g.restore();
    g.fillStyle = 'rgba(255, 255, 255, .9)';
    for (let k = 0; k < 3; k++) { const a = now / 500 + k * 2.1; star(cx + Math.cos(a) * 46, f.y1 - 50 + Math.sin(a) * 18, 5); }
    label('FINISH', cx, f.y1 + 40, 18, '#ffd23f');
  }

  /* the cats */

  function chain(x, y, n, seg) { const pts = []; for (let i = 0; i <= n; i++) pts.push({ x, y: y + i * seg, px: x, py: y + i * seg }); return pts; }
  // A dangling chain of points (legs, and the arm that's not holding anything): it swings and drags on things.
  function stepChain(pts, x, y, seg, dt) {
    if (Math.hypot(pts[0].x - x, pts[0].y - y) > 120) { pts.splice(0, pts.length, ...chain(x, y, pts.length - 1, seg)); return; }
    pts[0].x = pts[0].px = x;
    pts[0].y = pts[0].py = y;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], vx = (p.x - p.px) * 0.96, vy = (p.y - p.py) * 0.96;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + 1600 * dt * dt;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, f = (d - seg) / d;
        if (i === 0) { b.x -= dx * f; b.y -= dy * f; } else { a.x += dx * f / 2; a.y += dy * f / 2; b.x -= dx * f / 2; b.y -= dy * f / 2; }
      }
      for (let i = 1; i < pts.length; i++) pushOut(pts[i], 4, tower.rects, 0);
    }
  }
  function stepLimbs(c, v, dt) {
    if (!c.legs) c.legs = [chain(v.x - 7, v.y + 9, 3, 9), chain(v.x + 7, v.y + 9, 3, 9)];
    stepChain(c.legs[0], v.x - 7, v.y + 9, 9, dt);
    stepChain(c.legs[1], v.x + 7, v.y + 9, 9, dt);
    const S = { x: v.x + SHOULDERS[1].x, y: v.y + SHOULDERS[1].y };
    if (!c.arm2) c.arm2 = chain(S.x, S.y, 3, 12);
    stepChain(c.arm2, S.x, S.y, 12, dt);
  }

  // Where the elbow goes for an arm from shoulder S to paw P (it bends down and out).
  function elbow(S, P, bx) {
    const a = REACH * 0.52;
    const dx = P.x - S.x, dy = P.y - S.y, full = Math.hypot(dx, dy) || 1, d = clamp(full, 1, a * 2 - 0.5);
    const ux = dx / full, uy = dy / full, h = Math.sqrt(Math.max(0, a * a - d * d / 4));
    const mx = S.x + ux * d / 2, my = S.y + uy * d / 2;
    const e1 = { x: mx - uy * h, y: my + ux * h }, e2 = { x: mx + uy * h, y: my - ux * h };
    const score = e => e.y + Math.abs(e.x - bx) * 0.4;
    return score(e1) >= score(e2) ? e1 : e2;
  }
  function limb(pts, fur, sleeve) {
    const path = () => { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) g.lineTo(p.x, p.y); };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    path(); g.strokeStyle = fur.dark; g.lineWidth = 11; g.stroke();
    path(); g.strokeStyle = fur.mid; g.lineWidth = 7.5; g.stroke();
    if (sleeve && fur.sleeve) {
      const a = pts[0], b = pts[1];
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + (b.x - a.x) * 0.5, a.y + (b.y - a.y) * 0.5);
      g.strokeStyle = fur.sleeve; g.lineWidth = 12; g.stroke();
    }
  }
  function pawDot(x, y, fur, r) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fur.light; g.fill();
    g.lineWidth = 2; g.strokeStyle = fur.dark; g.stroke();
  }

  function drawFish(c, v) {
    const S = { x: v.x + SHOULDERS[1].x, y: v.y + SHOULDERS[1].y };
    const P = { x: v.fx, y: v.fy };
    limb([S, elbow(S, P, v.x), P], c.fur, true);
    const ang = Math.atan2(P.y - S.y, P.x - S.x);
    g.save();
    g.translate(P.x, P.y);
    g.rotate(ang);
    g.fillStyle = '#3f7fc4'; // the tail (your paw holds the fish by its tail)
    g.beginPath(); g.moveTo(14, 0); g.lineTo(-6, -15); g.lineTo(-2, 0); g.lineTo(-6, 15); g.closePath(); g.fill();
    const gr = g.createLinearGradient(0, -18, 0, 18);
    gr.addColorStop(0, '#9fd2ff');
    gr.addColorStop(0.5, '#5aa2e6');
    gr.addColorStop(1, '#d9ecff');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(FISH_LEN * 0.56, 0, FISH_LEN * 0.46, 18, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 2; g.strokeStyle = '#2d5f99'; g.stroke();
    g.fillStyle = '#3f7fc4';
    g.beginPath(); g.moveTo(FISH_LEN * 0.4, -16); g.lineTo(FISH_LEN * 0.58, -27); g.lineTo(FISH_LEN * 0.68, -15); g.closePath(); g.fill();
    g.fillStyle = '#fff'; dot(FISH_LEN * 0.9, -5, 4.5);
    g.fillStyle = '#122'; dot(FISH_LEN * 0.92, -5, 2.2);
    g.strokeStyle = '#2d5f99'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(FISH_LEN - 3, 5); g.lineTo(FISH_LEN * 0.9, 7); g.stroke();
    g.restore();
    pawDot(P.x, P.y, c.fur, 7);
  }

  function drawCat(c, v, now, faded, mine) {
    if (faded) g.globalAlpha = 0.45;
    for (const leg of c.legs) {
      limb(leg, c.fur, false);
      const e = leg[leg.length - 1];
      g.beginPath(); g.ellipse(e.x, e.y + 2, 7, 5, 0, 0, Math.PI * 2);
      g.fillStyle = c.fur.light; g.fill();
      g.lineWidth = 2; g.strokeStyle = c.fur.dark; g.stroke();
    }
    if (!v.fish) { limb(c.arm2, c.fur, true); const e = c.arm2[c.arm2.length - 1]; pawDot(e.x, e.y, c.fur, 6.5); }
    const talk = F.mouth(mine ? 'talk-me' : 'talk-opp') > 0.15;
    const pic = c.pics[talk ? 1 : 0] || c.pics[0];
    if (pic) g.drawImage(pic, v.x - 40, v.y - 67.2, 80, 76.8);
    else { g.fillStyle = c.fur.mid; dot(v.x, v.y - 30, 26); dot(v.x, v.y, 15); }
    // the climbing arm, claws out while it holds on
    const S = { x: v.x + SHOULDERS[0].x, y: v.y + SHOULDERS[0].y }, P = { x: v.px, y: v.py };
    const E = elbow(S, P, v.x);
    limb([S, E, P], c.fur, true);
    pawDot(P.x, P.y, c.fur, 7.5);
    if (v.hold) {
      const a = Math.atan2(P.y - E.y, P.x - E.x);
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.lineCap = 'round';
      for (const k of [-0.7, 0, 0.7]) {
        const x = P.x + Math.cos(a + k) * 6, y = P.y + Math.sin(a + k) * 6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a + k * 0.5) * 6, y + Math.sin(a + k * 0.5) * 6); g.stroke();
      }
    }
    if (v.fish) drawFish(c, v);
    g.globalAlpha = 1;
    if (v.stun) dizzy(v.x, v.y + 24, now);
    label(mine ? 'You' : c.name, v.x, v.y + 50, 13, mine ? '#ffd23f' : '#ffffff');
    if (mine && phase === 'play' && !me.done) { // where you're pointing (a faint ring)
      const T = me.fish ? { x: v.x + SHOULDERS[1].x + me.fishAim.x, y: v.y + SHOULDERS[1].y + me.fishAim.y } : { x: S.x + me.aim.x, y: S.y + me.aim.y };
      g.strokeStyle = me.fish ? 'rgba(125, 211, 255, .6)' : 'rgba(255, 255, 255, .45)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(T.x, T.y, 6, 0, Math.PI * 2); g.stroke();
    }
  }

  function drawFx() {
    for (const p of fxs) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.k === 'dust') { g.globalAlpha = a * 0.5; g.fillStyle = '#d9c7b0'; dot(p.x, p.y, p.r * (1.6 - a * 0.6)); }
      else if (p.k === 'ring') { g.globalAlpha = a; g.strokeStyle = '#bfeaff'; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, p.r + (1 - a) * 46, 0, Math.PI * 2); g.stroke(); }
      else if (p.k === 'word') { g.globalAlpha = Math.min(1, a * 2); label(p.text, p.x, p.y, 28 + (1 - a) * 6, p.color); }
    }
    g.globalAlpha = 1;
  }

  function drawHud(now, mv, tv) {
    // how high you both are
    const x = W - 34, top = 70, bottom = H - 70;
    g.fillStyle = 'rgba(15, 10, 25, .55)';
    roundRect(x - 7, top - 8, 14, bottom - top + 16, 7); g.fill();
    label('🏁', x, top - 24, 18, '#fff');
    const mark = (v, color, size) => { const y = bottom - height(v) * (bottom - top); g.fillStyle = color; dot(x, y, size); g.lineWidth = 2; g.strokeStyle = '#1c1530'; g.stroke(); };
    mark(tv, '#ffffff', 7);
    mark(mv, '#ffd23f', 8);
    // your fish
    g.font = '22px ' + FONT;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let k = 0; k < FISH_USES; k++) { g.globalAlpha = k < me.uses ? 1 : 0.25; g.fillText('🐟', 18 + k * 28, 28); }
    g.globalAlpha = 1;
    label(me.fish ? 'V: put it away' : 'V', 18 + FISH_USES * 28 + (me.fish ? 62 : 14), 28, 15, me.fish ? '#7dd3ff' : '#ffd23f');
    // the clock
    const left = Math.max(0, LIMIT - clock), s = Math.ceil(left);
    label(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'), W / 2, 26, 22, left < 30 && phase === 'play' ? '#ff8a8a' : '#ffffff');
    if (ghostT > 0) label('👻 Slipping past each other', W / 2, 54, 14, '#d6c8ff');
    if (phase === 'ready' && count > 0) bigText(String(count), H / 2 - 30, 110, '#ffd23f', 1);
    if (phase === 'play' && now - goAt < 700) bigText('CLIMB!', H / 2 - 30, 90, '#7dff8a', 1 - (now - goAt) / 700);
    if (phase === 'over' && winner) {
      const w = winner.w;
      bigText(winner.timeout ? "Time's up!" : w < 0 ? "It's a draw!" : w === meI ? 'You made it! 🏆' : them.name + ' made it first!', H / 2 - 20, 46, w === meI ? '#7dff8a' : '#fff', 1);
      if (winner.timeout && w >= 0) bigText(w === meI ? 'You got higher!' : them.name + ' got higher', H / 2 + 30, 26, '#fff', 1);
    }
  }

  function updateMsg(now) {
    let text;
    if (now < msgUntil) text = msgText;
    else if (phase === 'ready') text = 'Get ready! Your paw follows your mouse.';
    else if (phase === 'over') text = '';
    else if (me.done) text = 'You made it! Checking who was first…';
    else if (fine && !locked && !everLocked) text = 'Click the game, then move your mouse: the paw follows it';
    else if (me.stun > 0) text = 'Slapped! 🐟';
    else if (me.fish) text = '🐟 Swing the fish fast at ' + them.name + '! Your other paw keeps holding on. V puts the fish away';
    else if (clock < 15) text = 'Press your paw on a ledge, then ' + (fine ? 'move the mouse' : 'drag') + ' down to push yourself up. No jumping: just your arm!';
    else text = 'Push off ledges · fast moves fling you · metal and glass are slippery · V: 🐟 fish (' + me.uses + ' slap' + (me.uses === 1 ? '' : 's') + ' left)';
    if ($('ccMsg').textContent !== text) setMsg('ccMsg', text);
  }
}

CA.games.climb = { makeTower, makeGrid, findPath, pushOut }; // (for the tests)

})();
