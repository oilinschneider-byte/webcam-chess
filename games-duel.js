/* The shared engine for the two-player arcade games (Light Trails, Box King, Sumo Cats, Air Hockey, …). A game gives
   its rules and the engine does the rest: the canvas, the keyboard, mouse and touch controls, the 3-2-1, playing
   online, the bot in Practice, effects, the score and the K.O. screen.

   There are two kinds of game:
   - 'host' (most of them): the host's app runs the whole game from both players' controls, 60 times a second, and
     sends what happened to the guest's app after every step. The guest's app sends its controls as they change and
     draws what the host sends, smoothed out. So both always agree on collisions, goals and who won.
   - 'own' (Shadow Boxing): each app runs its own player's half, so it reacts instantly, and sends it to
     the other app. The host's app is the referee: it decides when the game is over and who won.

   A game is CA.duel.run(ctx, def), with def:
     W, H                 the arena size (960 × 540 if not given)
     keys, letters        extra keys: { KeyE: 'e' } (WASD and the arrows are u d l r, Space is a)
     mouse                true: the mouse (or a finger on the arena) aims, left button is 'fire', right is 'alt'
     doubleTap            true: tapping left or right twice, fast, gives 'dl' or 'dr'
     pad                  the buttons under the arena on phones: { stick: true, buttons: [{ k: 'a', label: 'Dash' }] }
     help, helpTouch      the line under the arena
     bigCams              true: the game shows both cameras itself, so the small ones (and their walls) step aside
     init(api)            → the game's state                                         ('host' games)
     step(s, inp, dt, api)  moves the game on (inp[0] and inp[1]: each player's controls, see below)
     snap(s)              → what the guest's app needs to draw it (plain numbers, strings, arrays)
     lerp(a, b, f)        (optional) smooths between two snaps; the default smooths every number
     bot(s, i, dt, api)   → the bot's controls in Practice
     draw(v, s)           draws a snap (v: the view, see below)
     event(v, e)          (optional) effects and sounds for something that happened (api.ev), on both screens
     local(v, s)          (optional) runs every frame on each screen, before drawing (like reading the camera)
     initMine(api, i), stepMine(p, inp, dt, api), snapMine(p), onMsg(p, m, api), referee(snaps, api)
                          ('own' games) each player's half, and the host's referee
   Controls (inp): { mx, my (-1 to 1), ax, ay (where the mouse aims), held: { k: true }, hit: { k: true } (just pressed) }
   api: { rng, skill, bot, names, t (seconds of play), T(), ev(type, data), score(a, b), note(text), end(winner, text),
          toOther(m) } */
(() => {
'use strict';

const { $, setMsg, sound, skillOf } = CA.games.kit;
const F = CA.floppy;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(v) ? v : d);
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

const READY = 1.8;         // the 3-2-1
const DT = 1 / 60;         // the game runs in fixed steps of this many seconds
const SEND_MS = 17;        // the host sends what happened this often: after every step (a game can ask for less often: def.sendMs)
const INPUT_MS = 33;       // the guest sends its controls at least this often (and right away when they change)
// The games where the score is points you win one at a time (a round, a goal, a fish), so a point gets a celebration.
// (Not the ones where it's a clock, a share of the floor, lives left or golf strokes.)
const POINTS = { poop: 1, sumo: 1, swords: 1, trails: 1, hockey: 1, gator: 1, stare: 1, mouse: 1, pond: 1, cheese: 1, cannons: 1, kart: 1, boxing: 1 };
const STREAK_WORDS = ['', '', '2 IN A ROW!', 'ON FIRE! 🔥', 'UNSTOPPABLE! ⚡', 'LEGENDARY! 👑'];
const TEAM = [
  { main: '#2f7bff', light: '#a9cbff', dark: '#163f99' }, // the host (and you, against a bot): blue
  { main: '#ff8a1f', light: '#ffd0a1', dark: '#9a4700' }, // the guest: orange
];
const NO_INPUT = { mx: 0, my: 0, ax: 0, ay: 0, held: {}, hit: {} };

/* The replay check (see verify-replay.js). In an online game, the host's app writes down everything that goes into
   the game: the seed, both players' controls tick by tick, the camera walls' size, and how it ended. The guest's app
   writes down every set of controls it sent. After the game, the server replays it with the same code and checks the
   host's app played it straight. For that, the game itself must not depend on anything else: while the game's rules
   run (init and step), Math.random gives the game's own seeded numbers, and effects and the end wait until after. */
function seeded(a) { // (mulberry32, the same as in solos.js and verify-replay.js)
  a >>>= 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Controls, packed small for the record: [mx, my, ax, ay, held, counts].
const pack = raw => (raw ? [raw.mx, raw.my, raw.ax, raw.ay, raw.h || '', raw.c || {}] : null);
// Does this browser run JavaScript with V8 (Chrome, Edge, Brave, Opera, Samsung Internet, Android)? The server replays
// with V8 too, so those replay exactly; Safari and Firefox can differ in the last digit of some maths.
const V8 = /Chrome\/|Chromium\//.test(navigator.userAgent) && !/CriOS|EdgiOS|FxiOS|Firefox/.test(navigator.userAgent);
const siteVersion = () => { const s = document.querySelector('script[src*="games-duel.js"]'); const m = s && /[?&]v=(\d+)/.exec(s.getAttribute('src')); return m ? m[1] : ''; };

// A cat's picture (with its arms), looking right or left, mouth closed or open: pics[1 or -1][0 or 1].
function pictures(eq) {
  const pics = { 1: [null, null], '-1': [null, null], face: F.faceCache(eq, {}, 200, 240) }; // (pics.face: with an expression)
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

// Smooths between two snaps: every number goes part of the way (f) from a to b. Angles (keys in `angles`) take the
// short way round; anything that jumped further than `jump` (like a respawn) just snaps there.
// With f over 1 it looks ahead, past b (see guestView): only where things are (x and y) keeps going, never a count or a clock.
function deepLerp(a, b, f, angles, jump, key) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (f > 1 && key !== 'x' && key !== 'y') return b;
    if (angles && angles.includes(key)) {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + d * f;
    }
    if (Math.abs(b - a) > jump) return b;
    const v = a + (b - a) * f;
    // (Whole numbers that aren't a place, like which sword a cat holds or how many lives are left, stay whole numbers:
    // half-way between sword 0 and sword 1 there is no sword.)
    return key !== 'x' && key !== 'y' && Number.isInteger(a) && Number.isInteger(b) ? Math.round(v) : v;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length || a.length > 400) return b;
    return b.map((v, i) => deepLerp(a[i], v, f, angles, jump, key));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const o = {};
    for (const k in b) o[k] = k in a ? deepLerp(a[k], b[k], f, angles, jump, k) : b[k];
    return o;
  }
  return b;
}

// The point on the line from (ax, ay) to (bx, by) nearest to (px, py), and how far away it is.
function nearest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const k = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  const x = ax + dx * k, y = ay + dy * k;
  return { x, y, d: Math.hypot(px - x, py - y), k };
}

function run(ctx, def) {
  const W = def.W || 960, H = def.H || 540;
  const online = !ctx.bot;
  const host = ctx.isHost;                // (against a bot, you're always the host)
  const meI = host ? 0 : 1, themI = 1 - meI;
  const own = def.mode === 'own';
  const points = !!POINTS[def.id];
  const sendMs = def.sendMs || SEND_MS;
  const sendTicks = Math.max(1, Math.round(sendMs / (DT * 1000))); // (the host sends after every this many steps)
  // A big part of what the host sends that changes slowly (like Turf War's floor) only goes with some of the updates, so
  // the others stay small and can go after every step: def.heavy lists those parts, def.heavyMs says how often they go.
  const heavy = def.heavy && def.heavy.length ? def.heavy : null;
  const heavyTicks = heavy ? Math.max(1, Math.round((def.heavyMs || 66) / (DT * 1000))) : 0;
  const kept = {};                                                 // (guest) the newest of each heavy part
  const calm = !!(CA.calmMotion && CA.calmMotion());               // (this player asked their device for less motion)
  const buzz = ms => { if (CA.buzz) CA.buzz(ms); };
  const skill = skillOf(ctx);
  const names = [];
  names[meI] = 'You';
  names[themI] = ctx.oppName || 'Bot';
  if (def.bigCams) { // (see style.css: the camera blocks hide while the game shows the cameras itself)
    const mv = document.getElementById('matchView');
    mv.classList.add('cams-in-stage');
    ctx.onEnd(() => mv.classList.remove('cams-in-stage'));
  }
  const looks = [];
  looks[meI] = { pics: pictures(CA.profile.equip), fur: F.fur(CA.profile.equip) };
  looks[themI] = { pics: pictures(ctx.oppEquip), fur: F.fur(ctx.oppEquip) };

  const pad = def.pad || {};
  ctx.stage.innerHTML =
    '<div class="g-duel"><canvas class="bb-canvas dl-canvas' + (def.mouse ? ' dl-aim' : '') + '" id="dlCanvas"></canvas>' +
    '<div class="bb-pad wd-pad" id="dlPad">' +
    (pad.stick ? '<div class="wd-stick" id="dlStick" aria-label="Move"><span id="dlKnob"></span></div>' : '') +
    '<div>' + (pad.buttons || []).map(b => '<button class="' + (b.main ? 'bb-v ' : '') + 'wd-build" data-k="' + b.k + '">' + b.label + '</button>').join('') + '</div></div>' +
    '<p class="g-msg" id="dlMsg"></p></div>';
  if (!pad.stick && !(pad.buttons || []).length) $('dlPad').remove();
  const cv = $('dlCanvas');
  const g = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR;
  cv.height = H * DPR;
  cv.style.aspectRatio = W + ' / ' + H;
  const paint = F.painter(g, W);

  /* ---------- controls ---------- */

  const KEYS = Object.assign({
    KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'a',
  }, def.keys || {});
  const LETTERS = Object.assign({ w: 'u', s: 'd', a: 'l', d: 'r', ' ': 'a' }, def.letters || {});
  const held = {}, count = {}, lastTap = { l: -1e9, r: -1e9 };
  const aim = { x: W / 2, y: H / 2, seen: false };
  let touchMode = !!(window.matchMedia && matchMedia('(hover: none), (pointer: coarse)').matches);
  const bump = k => { count[k] = (count[k] || 0) + 1; };
  function press(k) {
    if (held[k]) return;
    held[k] = true;
    bump(k);
    if (def.doubleTap && (k === 'l' || k === 'r')) {
      const now = performance.now();
      if (now - lastTap[k] < 280) { bump(k === 'l' ? 'dl' : 'dr'); lastTap[k] = -1e9; } else lastTap[k] = now;
    }
    sendInput();
  }
  const release = k => { held[k] = false; sendInput(); };
  // (guest) A press goes to the host right away, not when the next regular update is due.
  function sendInput() {
    if (online && !host && !own && !auto) sendRaw(readInput());
  }
  // (guest) Sends a set of controls to the host, and writes it down for the replay check (see "The replay check").
  let lastSent = '', lastRawKey = '';
  function sendRaw(raw) {
    const p = pack(raw), k = JSON.stringify(p);
    lastRawKey = k;
    if (sent && phase !== 'ko' && k !== lastSent && sent.length < 60000) { lastSent = k; sent.push(p); }
    ctx.stream({ t: 'i', i: raw });
  }
  // (guest) Every frame: if the controls changed at all (the stick, where the mouse aims), the host hears about it now,
  // not at the next regular update.
  function sendIfChanged() {
    const raw = readInput();
    if (JSON.stringify(pack(raw)) !== lastRawKey) sendRaw(raw);
  }
  ctx.listen(document, 'keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYS[e.code] || LETTERS[(e.key || '').toLowerCase()];
    if (!k) return;
    e.preventDefault();
    if (!e.repeat) press(k);
  });
  ctx.listen(document, 'keyup', e => { const k = KEYS[e.code] || LETTERS[(e.key || '').toLowerCase()]; if (k) release(k); });
  ctx.listen(window, 'blur', () => { for (const k in held) held[k] = false; });

  function toArena(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / (r.width || 1) * W, y: (e.clientY - r.top) / (r.height || 1) * H };
  }
  ctx.listen(document, 'pointermove', e => {
    if (e.pointerType === 'touch' && !e.target.closest('#dlCanvas')) return;
    const p = toArena(e);
    aim.x = p.x;
    aim.y = p.y;
    aim.seen = true;
    if (e.pointerType !== 'touch') touchMode = false;
  });
  ctx.listen(cv, 'pointerdown', e => {
    e.preventDefault();
    const p = toArena(e);
    Object.assign(aim, p, { seen: true });
    if (e.pointerType === 'touch') { touchMode = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    press(e.button === 2 ? 'alt' : 'fire');
  });
  ctx.listen(document, 'pointerup', e => { release(e.button === 2 ? 'alt' : 'fire'); if (e.pointerType === 'touch') release('alt'); });
  ctx.listen(document, 'pointercancel', () => { release('fire'); release('alt'); });
  ctx.listen(cv, 'contextmenu', e => e.preventDefault());

  const stick = { x: 0, y: 0, id: null };
  if (pad.stick) {
    const el = $('dlStick'), knob = $('dlKnob');
    const move = e => {
      const r = el.getBoundingClientRect();
      let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      stick.x = len < 0.15 ? 0 : dx;
      stick.y = len < 0.15 ? 0 : dy;
      knob.style.transform = 'translate(' + Math.round(dx * 32) + 'px, ' + Math.round(dy * 32) + 'px)';
    };
    ctx.listen(el, 'pointerdown', e => { e.preventDefault(); touchMode = true; stick.id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } move(e); });
    ctx.listen(el, 'pointermove', e => { if (e.pointerId === stick.id) move(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => ctx.listen(el, type, e => {
      if (e.pointerId !== stick.id) return;
      stick.id = null;
      stick.x = stick.y = 0;
      knob.style.transform = '';
    }));
  }
  if ($('dlPad')) {
    $('dlPad').querySelectorAll('[data-k]').forEach(btn => {
      const k = btn.dataset.k;
      const up = () => { release(k); btn.classList.remove('on'); };
      ctx.listen(btn, 'pointerdown', e => { e.preventDefault(); touchMode = true; press(k); btn.classList.add('on'); try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => ctx.listen(btn, type, up));
      ctx.listen(btn, 'contextmenu', e => e.preventDefault());
    });
  }

  // This player's controls, as sent to the host.
  function readInput() {
    let mx = (held.r ? 1 : 0) - (held.l ? 1 : 0) + stick.x, my = (held.d ? 1 : 0) - (held.u ? 1 : 0) + stick.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return {
      mx: r2(mx), my: r2(my), ax: Math.round(aim.x), ay: Math.round(aim.y),
      h: Object.keys(held).filter(k => held[k]).join(','), c: Object.assign({}, count),
    };
  }

  // Raw controls → what step() gets. A press counts once (if there were two between steps, the second waits a step).
  const used = [{}, {}];
  function toStep(raw, i) {
    if (!raw) return NO_INPUT;
    const hit = {}, h = {};
    const c = raw.c && typeof raw.c === 'object' ? raw.c : {};
    for (const k in c) {
      const n = Math.floor(num(c[k], 0)), was = used[i][k] || 0;
      if (n > was) { hit[k] = true; used[i][k] = was + 1; }
    }
    String(raw.h || '').split(',').forEach(k => { if (k) h[k] = true; });
    return { mx: clamp(num(raw.mx, 0), -1, 1), my: clamp(num(raw.my, 0), -1, 1), ax: clamp(num(raw.ax, W / 2), -W, 2 * W), ay: clamp(num(raw.ay, H / 2), -H, 2 * H), held: h, hit };
  }

  /* ---------- the game ---------- */

  let phase = 'ready', readyT = 0, count3 = 0, goAt = 0, koAt = 0, winner = null, endText = '';
  let simT = 0;                       // seconds of play (the host's clock)
  let off = null;                     // (guest) how far ahead the host's clock is
  let score = [0, 0];
  let lastMsg = performance.now();
  let guestRaw = null;                // (host) the guest's latest controls
  const T = () => (host || off === null ? simT : simT + off);

  // The game's own random numbers, and running its rules with them (see "The replay check" above).
  const simRand = seeded(Number.isFinite(ctx.seed) ? ctx.seed : (Math.random() * 4294967296) >>> 0);
  let inSim = false;
  const after = [];
  function sim(fn) {
    const real = Math.random;
    Math.random = simRand;
    inSim = true;
    try { return fn(); } finally { Math.random = real; inSim = false; after.splice(0).forEach(f => f()); }
  }
  // What the host's app writes down (and the guest's: every set of controls it sent). Practice games too, for the tests.
  const rec = host && !own && (online || window.__testHooks)
    ? { v: 1, role: 'host', game: def.id, ver: siteVersion(), seed: Number.isFinite(ctx.seed) ? ctx.seed >>> 0 : null, skill, eng: V8 ? 'v8' : 'other', bot: !!ctx.bot, W, H, walls: [], in: [[], []], ticks: 0, end: null }
    : null;
  const sent = online && !host && !own ? [] : null;
  let tick = 0, recN = 0;
  const lastRec = ['', '', ''];
  function note(slot, t, k, v) {
    if (lastRec[slot] === k) return;
    lastRec[slot] = k;
    if (++recN > 60000) { rec.overflow = true; return; } // (far more than any real game: stop writing)
    if (slot < 2) rec.in[slot].push([t, v]); else rec.walls.push([t].concat(v));
  }

  const api = {
    rng: () => Math.random(), // (inside the game's rules, Math.random is the game's own: see sim())
    skill, bot: !!ctx.bot, names, W, H, host, me: meI,
    get t() { return simT; },
    T,
    ev(type, data) {
      const e = Object.assign({ type }, data || {});
      const go = () => { runEvent(e); if (online && host) ctx.send({ t: 'e', e }); };
      if (inSim) after.push(go); else go();
    },
    score(a, b) {
      if (a === score[0] && b === score[1]) return;
      const was = score;
      score = [a, b];
      const go = () => { ctx.score(score[meI], score[themI], !points); scored(was, [a, b]); };
      if (inSim) after.push(go); else go();
    },
    note(text) { api.ev('note', { text }); },
    end(w, text) {
      if (!host) return;
      if (rec && !rec.end && phase !== 'ko') rec.end = { tick, w, sc: score.slice() };
      if (inSim) after.push(() => endGame(w, text || '')); else endGame(w, text || '');
    },
    toOther: null, // ('own' games: set for each player below)
  };

  let ready = false;                  // (events from setting up the game wait until the view is there)
  const early = [];
  function runEvent(e) {
    if (e.type === 'note') { ctx.note(e.text || ''); return; }
    if (!ready) { early.push(e); return; }
    if (def.event) def.event(view, e);
  }

  let S = null;                       // ('host' games) the state, on the host
  let mine = null, botP = null;       // ('own' games) this player's half, and the bot's half
  let theirs = null;                  // ('own' games) the other player's latest snap
  if (own) {
    const apiFor = i => Object.assign(Object.create(api), {
      me: i, self: i === meI,
      toOther(m) {
        if (ctx.bot) { const p = i === meI ? botP : mine; if (p && def.onMsg) def.onMsg(p, m, apiFor(1 - i)); }
        else ctx.send({ t: 'm', m });
      },
    });
    api.mine = apiFor(meI);
    api.theirs = apiFor(themI);
    mine = def.initMine(api.mine, meI);
    if (ctx.bot) botP = def.initMine(api.theirs, themI);
  } else if (host) S = sim(() => def.init(api));

  function endGame(w, text) {
    if (phase === 'ko') return;
    phase = 'ko';
    winner = w;
    endText = text;
    if (host && online) ctx.send({ t: 'end', w, x: text });
    // (the record of this game, for the replay check: solos.js sends it to the server with the result)
    if (rec && ctx.gameLog) { rec.ticks = tick; ctx.gameLog(rec); }
    if (sent && ctx.gameLog) ctx.gameLog({ v: 1, role: 'guest', game: def.id, ver: siteVersion(), sent });
    koAt = performance.now();
    sound(w === meI ? 'fanfare' : w < 0 ? 'draw' : 'thud');
    if (w >= 0) { view.mood(w, 'happy', 99); view.mood(1 - w, 'ko', 99); } else { view.mood(0, 'shock', 99); view.mood(1, 'shock', 99); }
    if (ready) { // (the big finish: see render)
      view.shake(14);
      if (w === meI) {
        view.confetti(70);
        ctx.later(() => view.confetti(45), 450);
        ctx.later(() => sound('sparkle'), 900);
        buzz([30, 40, 30, 40, 70]);
      } else if (w >= 0) buzz(120);
    }
    ctx.note(w < 0 ? "It's a draw!" : w === meI ? 'You win!' : names[themI] + ' wins!');
    ctx.later(() => ctx.finish(w < 0 ? 'draw' : w === meI ? 'win' : 'lose'), 2600);
  }

  // The owner's test player (testplayer.js) plays online by itself, with the Practice bot's moves.
  const auto = online && !!window.__autoplay;
  const autoCount = {};
  function autoInput() {
    try {
      const b = own ? def.bot(mine, meI, DT, api.mine) : def.bot(host ? S : guestView(performance.now()), meI, DT, api);
      return Object.assign({}, NO_INPUT, b || {});
    } catch (e) { return NO_INPUT; }
  }
  function autoRaw() { // (the guest sends its controls in readInput()'s form)
    const s = autoInput();
    for (const k in s.hit) if (s.hit[k]) autoCount[k] = (autoCount[k] || 0) + 1;
    return { mx: r2(s.mx), my: r2(s.my), ax: Math.round(s.ax), ay: Math.round(s.ay),
      h: Object.keys(s.held).filter(k => s.held[k]).join(','), c: Object.assign({}, autoCount) };
  }

  function step() {
    simT += DT;
    if (own) {
      def.stepMine(mine, auto ? autoInput() : toStep(readInput(), meI), DT, api.mine);
      if (botP) def.stepMine(botP, def.bot(botP, themI, DT, api.theirs) || NO_INPUT, DT, api.theirs);
      if (host && phase === 'play') {
        const snaps = [];
        snaps[meI] = def.snapMine(mine);
        snaps[themI] = botP ? def.snapMine(botP) : theirs;
        if (snaps[themI]) def.referee(snaps, api);
      }
      return;
    }
    const inp = [];
    const raw = auto ? null : readInput();
    inp[meI] = auto ? autoInput() : toStep(raw, meI);
    inp[themI] = ctx.bot ? Object.assign({}, NO_INPUT, def.bot(S, themI, DT, api) || {}) : toStep(guestRaw, themI);
    if (rec && !rec.end && !rec.overflow) {
      // (controls as they came in, or for the test player and the bot, as the game got them)
      const p0 = auto ? { s: inp[meI] } : pack(raw), p1 = ctx.bot ? { s: inp[themI] } : pack(guestRaw);
      note(0, tick, JSON.stringify(p0), p0);
      note(1, tick, JSON.stringify(p1), p1);
      const cw = [CA.camWalls.CAM_W, CA.camWalls.CAM_H];
      note(2, tick, cw.join(), cw);
    }
    sim(() => def.step(S, inp, DT, api));
    tick++;
  }

  /* ---------- online ---------- */

  const sbuf = [];                    // (guest) the host's recent snaps
  ctx.on(m => {
    if (!m || typeof m !== 'object') return;
    lastMsg = performance.now();
    if (m.t === 's' && !host && !own) {
      // (It's shown by the moment of the game it shows, not by when it arrived: a snap held up on the way, then two
      // arriving together, still play back evenly.)
      const at = ctx.netAt();
      if (heavy) { // (an update without its heavy parts shows the newest ones this app has; before the first, there's nothing to show)
        if (!m.g || typeof m.g !== 'object') return;
        for (const k of heavy) {
          if (k in m.g) kept[k] = m.g[k];
          else if (k in kept) m.g[k] = kept[k];
          else return;
        }
      }
      if (sbuf.length && at <= sbuf[sbuf.length - 1].at) sbuf.length = 0; // (the clocks were set again: start over from this one)
      sbuf.push({ at, g: m.g });
      if (sbuf.length > 64) sbuf.shift();
      clock(m.T);
      if (Array.isArray(m.sc)) gotScore(m.sc);
    } else if (m.t === 'i' && host && m.i && typeof m.i === 'object') {
      guestRaw = m.i;
    } else if (m.t === 'o' && own) {
      theirs = m.p;
      if (!host) clock(m.T);
      if (!host && Array.isArray(m.sc)) gotScore(m.sc);
    } else if (m.t === 'm' && own && def.onMsg) {
      def.onMsg(mine, m.m, api.mine);
    } else if (m.t === 'e' && !host && m.e && typeof m.e === 'object') {
      const e = m.e;
      ctx.later(() => runEvent(e), own ? 0 : ctx.viewDelay(sendMs));
    } else if (m.t === 'end' && !host && [-1, 0, 1].includes(m.w)) {
      endGame(m.w, typeof m.x === 'string' ? m.x.slice(0, 20) : '');
    }
  });
  function clock(hostT) {
    if (!Number.isFinite(hostT)) return;
    const d = hostT - simT;
    off = off === null ? d : Math.max(off, d); // (messages arrive a little late, never early: the biggest is the closest)
  }
  // (guest) The score the host sent. A point is celebrated a moment later: when the picture, drawn a little in the past, shows it.
  function gotScore(sc) {
    const a = num(sc[0], 0), b = num(sc[1], 0);
    if (a === score[0] && b === score[1]) return;
    const was = score;
    score = [a, b];
    ctx.score(score[meI], score[themI], !points);
    ctx.later(() => scored(was, [a, b]), own ? 0 : ctx.viewDelay(sendMs));
  }

  // (guest) the game a moment ago (see viewDelay in solos.js), smoothed between two snaps
  function guestView(now) {
    if (!sbuf.length) return null;
    const rt = now - ctx.viewDelay(sendMs);
    let k = sbuf.length - 1;
    while (k > 0 && sbuf[k].at > rt) k--;
    const a = sbuf[k], b = sbuf[k + 1];
    if (!b) {
      // The next snap is late. Rather than freezing and then jumping when it comes, keep things moving the way they were
      // going, for up to a tenth of a second, and draw a little further in the past from now on (see viewDelay).
      if (rt > a.at + 4 && ctx.netStarved) ctx.netStarved(rt - a.at);
      if (def.lerp || rt <= a.at) return a.g;
      let j = k - 1;
      while (j > 0 && a.at - sbuf[j].at < 12) j--; // (which way it was going: from a snap a little before, not one that came with it)
      const p = sbuf[j], span = p ? a.at - p.at : 0;
      if (span < 8 || span > 150) return a.g;
      return deepLerp(p.g, a.g, 1 + Math.min(100, rt - a.at) / span, def.angles, def.jump || 80);
    }
    const f = clamp((rt - a.at) / Math.max(1, b.at - a.at), 0, 1);
    return def.lerp ? def.lerp(a.g, b.g, f) : deepLerp(a.g, b.g, f, def.angles, def.jump || 80);
  }

  /* ---------- points ---------- */

  // A point! (In the games where the score is points: see POINTS.) The one who scored gets a little party, bigger for a
  // run of points; the other gets a thud. It's all for show, on each player's own screen.
  const streak = { who: -1, n: 0, at: -1e9, said: -1e9 };
  function scored(was, to) {
    if (!points || !ready || phase === 'ko') return;
    const d = [to[0] - was[0], to[1] - was[1]];
    if (d[0] <= 0 && d[1] <= 0) return;
    if (d[0] > 0 && d[1] > 0) { streak.who = -1; streak.n = 0; return; }
    const i = d[0] > 0 ? 0 : 1, t = performance.now();
    streak.n = streak.who === i ? streak.n + 1 : 1;
    streak.who = i;
    const quick = t - streak.at < 1300; // (points coming fast, like punches: just the sound, higher each time)
    streak.at = t;
    view.mood(i, 'happy', 1.6);
    view.mood(1 - i, quick ? 'hurt' : 'sad', 1.6);
    if (i === meI) {
      sound('cheer', 1 + Math.min(7, streak.n - 1) * 0.06);
      buzz([18, 30, 30]);
      if (!quick) { view.confetti(16 + Math.min(4, streak.n) * 8); view.flash(TEAM[meI].light, 0.16); }
      const word = was[themI] - was[meI] >= 2 && to[meI] >= to[themI] ? 'COMEBACK! 💪' : STREAK_WORDS[Math.min(streak.n, STREAK_WORDS.length - 1)];
      if (word && t - streak.said > 1500) { streak.said = t; view.banner(word, '#ffd23f'); }
    } else {
      sound('ouch');
      if (!quick) { view.flash('#ff3b3b', 0.13); view.shake(4); }
    }
  }

  /* ---------- the view: what the drawing code gets ---------- */

  const fx = [];
  const party = F.party(W, H); // (confetti and flashes: see games-floppy.js)
  let shake = 0, msgText = '', msgBad = false;
  const addFx = p => { if (fx.length > 420) fx.shift(); fx.push(p); };
  const view = {
    g, W, H, me: meI, them: themI, host, online, bot: !!ctx.bot, skill, names, team: TEAM, looks, rng: ctx.rng,
    now: 0, dt: 0, aim, held, touch: () => touchMode, T, t: () => simT, phase: () => phase,
    dot: paint.dot, star: paint.star, heart: paint.heart, roundRect: paint.roundRect, label: paint.label, bigText: paint.bigText,
    press, hold(k, on) { if (on) press(k); else release(k); },
    msg(text, bad) { msgText = text; msgBad = !!bad; },
    note(text) { ctx.note(text); },
    record(key, label, value) { ctx.record(key, label, value); },
    sound,
    // The screen shakes; a big one also flashes, and buzzes a phone.
    shake(n) {
      shake = Math.max(shake, calm ? n * 0.4 : n);
      if (calm) return;
      if (n >= 11) view.flash('#ffffff', Math.min(0.26, n / 60));
      if (n >= 8) buzz(Math.min(50, Math.round(n * 2.5)));
    },
    flash: party.flash,
    // Bits flying out from (x, y): chunks, round drops and a few bright streaks, with a quick glow in the middle.
    burst(x, y, color, n, speed) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.8), life = 0.45 + Math.random() * 0.35;
        addFx({ k: k % 4 === 3 ? 'spark' : 'bit', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, r: 2 + Math.random() * 3.2, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: color, round: k % 3 === 0 });
      }
      if (n >= 5) addFx({ k: 'glow', x, y, vx: 0, vy: 0, life: 0.18, max: 0.18, r: Math.min(60, 14 + n * 1.8), c: color });
    },
    ring(x, y, color, r) { addFx({ k: 'ring', x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, r: r || 10, c: color }); },
    pop(x, y, text, color) { addFx({ k: 'word', x, y, vx: 0, vy: -40, life: 1.1, max: 1.1, text, c: color || '#ffd23f', rot: (Math.random() - 0.5) * 0.16 }); },
    confetti: party.confetti, // (party paper: thrown up from (x, y), or with no place given, falling from the top)
    // Big words across the middle for a moment, like "ON FIRE!".
    banner(text, color) {
      for (let k = fx.length - 1; k >= 0; k--) if (fx[k].k === 'banner') fx.splice(k, 1);
      addFx({ k: 'banner', x: W / 2, y: H * 0.36, vx: 0, vy: 0, life: 1.5, max: 1.5, text, c: color || '#ffd23f' });
      sound('whoosh');
    },
    // A cat seen from above (or a little from the front), centered on (x, y), with a ring in its player's color.
    catTop(i, x, y, size, o) {
      o = o || {};
      const k = (size || 1);
      if (o.ring !== false) {
        g.globalAlpha = 0.25 * (o.alpha == null ? 1 : o.alpha);
        g.fillStyle = TEAM[i].main;
        paint.dot(x, y, 18 * k);
        g.globalAlpha = o.alpha == null ? 1 : o.alpha;
        g.strokeStyle = TEAM[i].main;
        g.lineWidth = 2.5;
        g.beginPath(); g.arc(x, y, 18 * k, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }
      g.save();
      g.translate(x, y + 17 * k);
      g.scale(0.48 * k, 0.48 * k);
      F.drawBody(g, looks[i], 0, 0, { tilt: o.tilt || 0, lookRight: o.lookRight !== false, open: talking(i), alpha: o.alpha == null ? 1 : o.alpha, face: faceOf(i, o), top: true, bob: o.bob, anim: o.anim });
      g.restore();
      if (o.label !== false) paint.label(i === meI ? 'You' : names[i], x, y + 31 * k + 2, 12, i === meI ? '#ffd23f' : '#ffffff');
    },
    // A cat seen from the side, standing with its feet at (x, y).
    catSide(i, x, y, size, o) {
      o = o || {};
      g.save();
      g.translate(x, y);
      g.scale(size || 1, size || 1);
      F.drawBody(g, looks[i], 0, 0, { tilt: o.tilt || 0, lookRight: o.lookRight !== false, open: talking(i), alpha: o.alpha == null ? 1 : o.alpha, squash: o.squash || 0, face: faceOf(i, o), bob: o.bob, anim: o.anim });
      g.restore();
    },
    // The same, without its arms, so the game can draw them in any pose (see view.arm). o is as for catSide. The picture
    // is 80 wide and 96 tall at size 1, the feet at the bottom, the shoulders 33 up and 12 either side of the middle.
    catBare(i, x, y, size, o) {
      o = o || {};
      const L = looks[i];
      if (!L.bare) L.bare = { pics: F.pictures(i === meI ? CA.profile.equip : ctx.oppEquip), fur: L.fur };
      g.save();
      g.translate(x, y);
      g.scale(size || 1, size || 1);
      F.drawBody(g, L.bare, 0, 0, { tilt: o.tilt || 0, lookRight: o.lookRight !== false, open: talking(i), alpha: o.alpha == null ? 1 : o.alpha, squash: o.squash || 0, face: faceOf(i, o) });
      g.restore();
    },
    // One arm, in cat i's fur, from the shoulder (sx, sy) to the paw (px, py), bending at the elbow toward bend (1 or -1).
    // fist: a clenched paw. w: how thick.
    arm(i, sx, sy, px, py, o) {
      o = o || {};
      const fur = looks[i].fur, w = o.w || 9, dx = px - sx, dy = py - sy, l = Math.hypot(dx, dy) || 1;
      const ex = (sx + px) / 2 - dy / l * l * 0.18 * (o.bend || 1), ey = (sy + py) / 2 + dx / l * l * 0.18 * (o.bend || 1);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      [[fur.dark, w + 3.5], [fur.mid, w]].forEach(([c, lw]) => {
        g.strokeStyle = c; g.lineWidth = lw;
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(ex, ey, px, py); g.stroke();
      });
      if (fur.sleeve) { g.strokeStyle = fur.sleeve; g.lineWidth = w + 3; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (ex - sx) * 0.5, sy + (ey - sy) * 0.5); g.stroke(); }
      const r = o.fist ? w * 0.85 : w * 0.75;
      g.fillStyle = fur.light;
      g.strokeStyle = fur.dark;
      g.lineWidth = 2;
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); g.stroke();
      if (o.fist) { g.beginPath(); g.moveTo(px - r * 0.5, py - r * 0.1); g.lineTo(px + r * 0.5, py - r * 0.1); g.stroke(); } // (the knuckles)
    },
  };
  const talking = i => F.mouth(i === meI ? 'talk-me' : 'talk-opp') > 0.12;
  // Each cat's mood: an expression (see FACES in common.js) for a moment, like 'hurt' after a hit. A game can give one
  // itself (o.face when it draws the cat), or set one with view.mood(i, face, seconds). The engine sets some on its own:
  // happy or sad for a point, and at the end the winner is happy and the loser knocked out.
  const moods = [{ face: null, until: 0 }, { face: null, until: 0 }];
  view.mood = (i, face, secs) => { if (moods[i]) { moods[i].face = face; moods[i].until = performance.now() + (secs == null ? 1 : secs) * 1000; } };
  const faceOf = (i, o) => o.face || (moods[i] && performance.now() < moods[i].until ? moods[i].face : null);
  view.faceOf = i => faceOf(i, {}); // (the mood just now, or null: for a game that draws its cats itself)
  ready = true;
  early.splice(0).forEach(runEvent);

  function updateFx(dt) {
    for (let k = fx.length - 1; k >= 0; k--) {
      const p = fx[k];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(k, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === 'bit' || p.k === 'spark') { const f = Math.pow(0.05, dt); p.vx *= f; p.vy *= f; p.rot += p.vr * dt; }
    }
  }
  // (0 → a little past 1 → 1: how the big words pop in)
  const popIn = t => { const u = clamp(t, 0, 1) - 1; return 1 + 2.70158 * u * u * u + 1.70158 * u * u; };
  function drawFx() {
    for (const p of fx) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.k === 'bit') {
        const r = p.r * (0.45 + 0.55 * a); // (they shrink as they fade)
        g.globalAlpha = Math.min(1, a * 1.6);
        g.fillStyle = p.c;
        if (p.round) { g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); continue; }
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
        g.restore();
      } else if (p.k === 'spark') { // (a bright streak, pointing the way it flies)
        g.globalAlpha = a;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
        g.stroke();
      } else if (p.k === 'glow') {
        g.globalAlpha = a * 0.5;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1.9 - a * 0.9), 0, Math.PI * 2); g.fill();
        g.globalAlpha = a * 0.55;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2); g.fill();
      } else if (p.k === 'ring') {
        const e = 1 - a * a; // (it flies out fast, then slows down)
        g.globalAlpha = a;
        g.strokeStyle = p.c;
        g.lineWidth = 1 + 4.5 * a;
        g.beginPath(); g.arc(p.x, p.y, p.r + e * 30, 0, Math.PI * 2); g.stroke();
      } else if (p.k === 'word') {
        const age = p.max - p.life, k = age < 0.14 ? 1.55 - 0.55 * (age / 0.14) : 1; // (it lands with a little bounce)
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot || 0);
        paint.label(p.text, 0, 0, (24 + (1 - a) * 6) * k, p.c, Math.min(1, a * 2.2));
        g.restore();
      } else if (p.k === 'banner') {
        const k = popIn((p.max - p.life) / 0.3);
        g.globalAlpha = 1;
        if (k > 0.05) paint.label(p.text, p.x, p.y, 46 * k, p.c, clamp(p.life / 0.35, 0, 1));
      }
    }
    g.globalAlpha = 1;
  }

  /* ---------- the loop ---------- */

  /* Smoothness. The game moves on in fixed steps, but screens don't all draw 60 times a second, and never exactly in
     time with the steps. So the host's own screen is drawn between the last two steps (by how far into the next step the
     clock is), and moves evenly on any screen. And what the host sends goes out right after a step, saying how old that
     step already is: the guest's app then plays every step back at exactly the moment it happened (see netAt in solos.js). */
  let acc = 0, simAt = performance.now(), lastFrame = performance.now();
  const smooth = host && !own && !def.local; // (a game that reads the camera every frame is drawn as it is)
  let prevSnap = null, curSnap = host && !own ? def.snap(S) : null; // (host) the game after each of the last two steps
  let sentTick = 0, lastStream = 0, heavyTick = -1e9;
  function sendSnap(snap, at, t, whole) {
    lastStream = performance.now();
    let g = snap;
    if (heavy) {
      if (whole || tick - heavyTick >= heavyTicks) heavyTick = tick;       // (this one carries everything)
      else { g = Object.assign({}, snap); for (const k of heavy) delete g[k]; } // (this one leaves the heavy parts out)
    }
    ctx.stream({ t: 's', g, T: Math.round(t * 1000) / 1000, sc: score }, lastStream - at);
  }
  function sendMine() {
    lastStream = performance.now();
    ctx.stream({ t: 'o', p: def.snapMine(mine), T: host ? Math.round(simT * 1000) / 1000 : undefined, sc: host ? score : undefined });
  }
  function advance(now, cap) {
    const rate = (window.__duelSpeed || 1) * (phase === 'ko' ? 0.45 : 1); // (the tests can make games run faster)
    acc += Math.min(cap, Math.max(0, (now - simAt) / 1000)) * rate;
    simAt = now;
    if (phase === 'ready') {
      readyT += acc;
      acc = 0;
      const n = Math.ceil((READY - readyT) / 0.6);
      if (n !== count3) { count3 = n; if (n > 0) sound('count', 1 + (3 - n) * 0.12); }
      if (readyT >= READY) {
        phase = 'play';
        goAt = now;
        sound('go');
        view.ring(W / 2, H / 2 - 20, '#7dff8a', 70);
        view.flash('#7dff8a', 0.14);
      }
      return;
    }
    const todo = Math.min(600, Math.floor(acc / DT + 1e-9));
    for (let k = 1; k <= todo; k++) {
      acc -= DT;
      if (host || own) step(); else simT += DT;
      if (host && !own && k > todo - 2) { prevSnap = curSnap; curSnap = def.snap(S); }
    }
    if (acc < 0) acc = 0;
    if (!online || !todo) return;
    if (own) sendMine();
    else if (host && tick - sentTick >= sendTicks) {
      const at = now - acc / rate * 1000; // (when the newest step happened, on this app's clock)
      // (two steps in one frame: both go, each with its own moment, so the guest still gets one for every step)
      if (sendTicks === 1 && todo >= 2 && tick - sentTick >= 2 && prevSnap) sendSnap(prevSnap, at - DT / rate * 1000, simT - DT);
      sendSnap(curSnap, at, simT);
      sentTick = tick;
    }
  }
  // (host) The game as it is right now: part of the way from the step before to the newest one.
  function hostView() {
    if (!smooth || !prevSnap) return def.snap(S);
    const f = clamp(acc / DT, 0, 1);
    return def.lerp ? def.lerp(prevSnap, curSnap, f) : deepLerp(prevSnap, curSnap, f, def.angles, def.jump || 80);
  }

  function frame(now) {
    if (!ctx.alive()) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (online && !host && !own && !auto && phase !== 'ko') sendIfChanged();
    advance(now, 0.25);
    render(now, dt);
    requestAnimationFrame(frame);
  }

  function render(now, dt) {
    view.now = now;
    view.dt = dt;
    msgText = '';
    msgBad = false;
    updateFx(dt);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    let ox = 0, oy = 0;
    if (shake > 0.4) { ox = (Math.random() - 0.5) * shake; oy = (Math.random() - 0.5) * shake; shake *= Math.pow(0.015, dt); } else shake = 0;
    g.translate(ox, oy);
    if (own) {
      const ts = botP ? def.snapMine(botP) : theirs;
      def.draw(view, def.snapMine(mine), ts);
    } else {
      const s = host ? hostView() : guestView(now);
      if (def.local) def.local(view, s); // (things each app does for itself every frame, like reading the camera)
      if (s) def.draw(view, s);
      else { g.fillStyle = '#1a1530'; g.fillRect(0, 0, W, H); paint.bigText('Connecting…', H / 2, 34, '#ffffff', 1); }
    }
    if (!def.bigCams) CA.camWalls.draw(g); // (the camera walls in the top corners: see cam-walls.js)
    drawFx();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    party.draw(g, dt);
    if (phase === 'ready' && count3 > 0) { // (each number lands big and settles, then fades as the next one comes)
      const into = clamp(readyT - (3 - count3) * 0.6, 0, 0.6);
      const k = 1 + 0.75 * Math.pow(1 - clamp(into / 0.22, 0, 1), 3);
      paint.bigText(String(count3), H / 2 - 20, 110 * k, count3 === 1 ? '#ff9a5a' : '#ffd23f', clamp((0.6 - into) / 0.14, 0, 1));
    }
    if (phase !== 'ready' && now - goAt < 700) { const t = (now - goAt) / 700; paint.bigText('GO!', H / 2 - 20, 110 * (1 + 0.45 * t), '#7dff8a', 1 - t * t); }
    if (phase === 'ko') {
      const age = (now - koAt) / 1000, k = popIn(age / 0.38);
      g.fillStyle = 'rgba(10, 8, 24, ' + (0.35 * clamp(age / 0.25, 0, 1)).toFixed(3) + ')';
      g.fillRect(0, 0, W, H);
      if (k > 0.05) paint.bigText(endText || (winner < 0 ? 'DRAW!' : 'WINNER!'), H / 2 - 40, (endText.length > 8 ? 70 : 100) * k, winner === meI ? '#ffd23f' : '#ff5a5a', 1);
      paint.bigText(winner < 0 ? "It's a draw!" : winner === meI ? 'You win! 🏆' : names[themI] + ' wins!', H / 2 + 40, 40, '#ffffff', clamp((age - 0.25) / 0.25, 0, 1));
    }
    const text = phase === 'ready' ? 'Get ready!' : phase === 'ko' ? '' : msgText || (touchMode && def.helpTouch ? def.helpTouch : def.help || '');
    const el = $('dlMsg');
    if (el.textContent !== text) setMsg('dlMsg', text);
    if (msgBad !== msgWasBad) { msgWasBad = msgBad; el.classList.toggle('wd-bad', msgBad); }
  }
  let msgWasBad = false;

  requestAnimationFrame(frame);
  // (Browsers stop drawing in a hidden tab: the game keeps going anyway, just without the drawing.)
  ctx.every(() => { const now = performance.now(); if (now - lastFrame > 300) advance(now, 1.5); }, 250);
  if (online) {
    // (Updates go out with the game's steps: see advance. Before the game starts, and whenever it isn't stepping, a slower
    // one keeps the other app in the picture.)
    if (own) ctx.every(() => { if (performance.now() - lastStream > 90) sendMine(); }, 50);
    else if (host) ctx.every(() => { const now = performance.now(); if (S && now - lastStream > 90) sendSnap(curSnap = def.snap(S), now, simT, true); }, 50);
    else ctx.every(() => sendRaw(auto ? autoRaw() : readInput()), INPUT_MS);
    ctx.every(() => { if (phase !== 'ko' && performance.now() - lastMsg > 15000) ctx.afk(); }, 1000);
  }
  ctx.score(0, 0);
  if (def.note) ctx.note(def.note);
  if (window.__testHooks) {
    window.__duel = {
      id: def.id, api, view, held, count, aim, press, release, phase: () => phase, winner: () => winner,
      state: () => (own ? { mine, theirs: botP || theirs } : host ? S : guestView(performance.now())),
      snaps: () => sbuf.length, guestInput: () => guestRaw, end: (w, x) => endGame(w, x || 'TEST'),
      snapBytes: () => JSON.stringify(own ? def.snapMine(mine) : def.snap(S)).length,
      rec: () => rec, sent: () => sent, fx: () => fx.map(p => p.k + (p.text ? ":" + p.text : "")),
    };
  }
}

CA.duel = { run, TEAM, pictures, deepLerp, nearest, clamp, DT };

})();
