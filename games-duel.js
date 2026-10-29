/* The shared engine for the two-player arcade games (Light Trails, Box King, Sumo Cats, Air Hockey, …). A game gives
   its rules and the engine does the rest: the canvas, the keyboard, mouse and touch controls, the 3-2-1, playing
   online, the bot in Practice, effects, the score and the K.O. screen.

   There are two kinds of game:
   - 'host' (most of them): the host's app runs the whole game from both players' controls, 60 times a second, and
     sends what happened to the guest's app 20 times a second. The guest's app sends its controls and draws what the
     host sends, smoothed out. So both always agree on collisions, goals and who won.
   - 'own' (Block Battle and Pond Duel): each app runs its own player's half, so it reacts instantly, and sends it to
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
const SEND_MS = 50;        // the host sends what happened this often
const INPUT_MS = 33;       // the guest sends its controls this often
const VIEW_DELAY = 100;    // the guest draws the game this many ms in the past, so it moves smoothly
const TEAM = [
  { main: '#2f7bff', light: '#a9cbff', dark: '#163f99' }, // the host (and you, against a bot): blue
  { main: '#ff8a1f', light: '#ffd0a1', dark: '#9a4700' }, // the guest: orange
];
const NO_INPUT = { mx: 0, my: 0, ax: 0, ay: 0, held: {}, hit: {} };

// A cat's picture (with its arms), looking right or left, mouth closed or open: pics[1 or -1][0 or 1].
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

// Smooths between two snaps: every number goes part of the way (f) from a to b. Angles (keys in `angles`) take the
// short way round; anything that jumped further than `jump` (like a respawn) just snaps there.
function deepLerp(a, b, f, angles, jump, key) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (angles && angles.includes(key)) {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + d * f;
    }
    return Math.abs(b - a) > jump ? b : a + (b - a) * f;
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
  }
  const release = k => { held[k] = false; };
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

  let phase = 'ready', readyT = 0, count3 = 0, goAt = 0, winner = null, endText = '';
  let simT = 0;                       // seconds of play (the host's clock)
  let off = null;                     // (guest) how far ahead the host's clock is
  let score = [0, 0];
  let lastMsg = performance.now();
  let guestRaw = null;                // (host) the guest's latest controls
  const T = () => (host || off === null ? simT : simT + off);

  const api = {
    rng: ctx.rng, skill, bot: !!ctx.bot, names, W, H, host, me: meI,
    get t() { return simT; },
    T,
    ev(type, data) {
      const e = Object.assign({ type }, data || {});
      runEvent(e);
      if (online && host) ctx.send({ t: 'e', e });
    },
    score(a, b) {
      score = [a, b];
      ctx.score(score[meI], score[themI]);
    },
    note(text) { api.ev('note', { text }); },
    end(w, text) { if (host) endGame(w, text || ''); },
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
  } else if (host) S = def.init(api);

  function endGame(w, text) {
    if (phase === 'ko') return;
    phase = 'ko';
    winner = w;
    endText = text;
    if (host && online) ctx.send({ t: 'end', w, x: text });
    sound(w === meI ? 'point' : w < 0 ? 'draw' : 'miss');
    ctx.note(w < 0 ? "It's a draw!" : w === meI ? 'You win!' : names[themI] + ' wins!');
    ctx.later(() => ctx.finish(w < 0 ? 'draw' : w === meI ? 'win' : 'lose'), 2600);
  }

  function step() {
    simT += DT;
    if (own) {
      def.stepMine(mine, toStep(readInput(), meI), DT, api.mine);
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
    inp[meI] = toStep(readInput(), meI);
    inp[themI] = ctx.bot ? Object.assign({}, NO_INPUT, def.bot(S, themI, DT, api) || {}) : toStep(guestRaw, themI);
    def.step(S, inp, DT, api);
  }

  /* ---------- online ---------- */

  const sbuf = [];                    // (guest) the host's recent snaps
  ctx.on(m => {
    if (!m || typeof m !== 'object') return;
    lastMsg = performance.now();
    if (m.t === 's' && !host && !own) {
      sbuf.push({ at: performance.now(), g: m.g });
      if (sbuf.length > 30) sbuf.shift();
      clock(m.T);
      if (Array.isArray(m.sc)) { score = [num(m.sc[0], 0), num(m.sc[1], 0)]; ctx.score(score[meI], score[themI]); }
    } else if (m.t === 'i' && host && m.i && typeof m.i === 'object') {
      guestRaw = m.i;
    } else if (m.t === 'o' && own) {
      theirs = m.p;
      if (!host) clock(m.T);
      if (!host && Array.isArray(m.sc)) { score = [num(m.sc[0], 0), num(m.sc[1], 0)]; ctx.score(score[meI], score[themI]); }
    } else if (m.t === 'm' && own && def.onMsg) {
      def.onMsg(mine, m.m, api.mine);
    } else if (m.t === 'e' && !host && m.e && typeof m.e === 'object') {
      const e = m.e;
      ctx.later(() => runEvent(e), own ? 0 : VIEW_DELAY);
    } else if (m.t === 'end' && !host && [-1, 0, 1].includes(m.w)) {
      endGame(m.w, typeof m.x === 'string' ? m.x.slice(0, 20) : '');
    }
  });
  function clock(hostT) {
    if (!Number.isFinite(hostT)) return;
    const d = hostT - simT;
    off = off === null ? d : Math.max(off, d); // (messages arrive a little late, never early: the biggest is the closest)
  }

  // (guest) the game as it was VIEW_DELAY ms ago, smoothed between two snaps
  function guestView(now) {
    if (!sbuf.length) return null;
    const rt = now - VIEW_DELAY;
    let k = sbuf.length - 1;
    while (k > 0 && sbuf[k].at > rt) k--;
    const a = sbuf[k], b = sbuf[k + 1];
    if (!b) return a.g;
    const f = clamp((rt - a.at) / Math.max(1, b.at - a.at), 0, 1);
    return def.lerp ? def.lerp(a.g, b.g, f) : deepLerp(a.g, b.g, f, def.angles, def.jump || 80);
  }

  /* ---------- the view: what the drawing code gets ---------- */

  const fx = [];
  let shake = 0, msgText = '', msgBad = false;
  const view = {
    g, W, H, me: meI, them: themI, host, online, bot: !!ctx.bot, skill, names, team: TEAM, looks, rng: ctx.rng,
    now: 0, dt: 0, aim, held, touch: () => touchMode, T, t: () => simT, phase: () => phase,
    dot: paint.dot, star: paint.star, heart: paint.heart, roundRect: paint.roundRect, label: paint.label, bigText: paint.bigText,
    press, hold(k, on) { if (on) press(k); else release(k); },
    msg(text, bad) { msgText = text; msgBad = !!bad; },
    note(text) { ctx.note(text); },
    sound,
    shake(n) { shake = Math.max(shake, n); },
    burst(x, y, color, n, speed) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.8);
        fx.push({ k: 'bit', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, r: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: color, gy: 0 });
      }
    },
    ring(x, y, color, r) { fx.push({ k: 'ring', x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, r: r || 10, c: color }); },
    pop(x, y, text, color) { fx.push({ k: 'word', x, y, vx: 0, vy: -40, life: 1.1, max: 1.1, text, c: color || '#ffd23f' }); },
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
      F.drawBody(g, looks[i], 0, 0, { tilt: o.tilt || 0, lookRight: o.lookRight !== false, open: talking(i), alpha: o.alpha == null ? 1 : o.alpha });
      g.restore();
      if (o.label !== false) paint.label(i === meI ? 'You' : names[i], x, y + 31 * k + 2, 12, i === meI ? '#ffd23f' : '#ffffff');
    },
    // A cat seen from the side, standing with its feet at (x, y).
    catSide(i, x, y, size, o) {
      o = o || {};
      g.save();
      g.translate(x, y);
      g.scale(size || 1, size || 1);
      F.drawBody(g, looks[i], 0, 0, { tilt: o.tilt || 0, lookRight: o.lookRight !== false, open: talking(i), alpha: o.alpha == null ? 1 : o.alpha, squash: o.squash || 0 });
      g.restore();
    },
  };
  const talking = i => F.mouth(i === meI ? 'talk-me' : 'talk-opp') > 0.12;
  ready = true;
  early.splice(0).forEach(runEvent);

  function updateFx(dt) {
    for (let k = fx.length - 1; k >= 0; k--) {
      const p = fx[k];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(k, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === 'bit') { const f = Math.pow(0.05, dt); p.vx *= f; p.vy *= f; p.rot += p.vr * dt; }
    }
  }
  function drawFx() {
    for (const p of fx) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.k === 'bit') {
        g.globalAlpha = a;
        g.fillStyle = p.c;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
        g.restore();
      } else if (p.k === 'ring') { g.globalAlpha = a; g.strokeStyle = p.c; g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, p.r + (1 - a) * 24, 0, Math.PI * 2); g.stroke(); }
      else if (p.k === 'word') { g.globalAlpha = 1; paint.label(p.text, p.x, p.y, 24 + (1 - a) * 6, p.c, Math.min(1, a * 2)); }
    }
    g.globalAlpha = 1;
  }

  /* ---------- the loop ---------- */

  let acc = 0, simAt = performance.now(), lastFrame = performance.now();
  function advance(now, cap) {
    const speed = window.__duelSpeed || 1; // (the tests can make games run faster)
    acc += Math.min(cap, Math.max(0, (now - simAt) / 1000)) * speed * (phase === 'ko' ? 0.45 : 1);
    simAt = now;
    if (phase === 'ready') {
      readyT += acc;
      acc = 0;
      const n = Math.ceil((READY - readyT) / 0.6);
      if (n !== count3) { count3 = n; if (n > 0) sound('tick'); }
      if (readyT >= READY) { phase = 'play'; goAt = now; sound('go'); }
      return;
    }
    let steps = 0;
    while (acc >= DT && steps < 600) { acc -= DT; steps++; if (host || own) step(); else simT += DT; }
  }

  function frame(now) {
    if (!ctx.alive()) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
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
      const s = host ? def.snap(S) : guestView(now);
      if (def.local) def.local(view, s); // (things each app does for itself every frame, like reading the camera)
      if (s) def.draw(view, s);
      else { g.fillStyle = '#1a1530'; g.fillRect(0, 0, W, H); paint.bigText('Connecting…', H / 2, 34, '#ffffff', 1); }
    }
    if (!def.bigCams) CA.camWalls.draw(g); // (the camera walls in the top corners: see cam-walls.js)
    drawFx();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (phase === 'ready' && count3 > 0) paint.bigText(String(count3), H / 2 - 20, 110, '#ffd23f', 1);
    if (phase !== 'ready' && now - goAt < 700) paint.bigText('GO!', H / 2 - 20, 110, '#7dff8a', 1 - (now - goAt) / 700);
    if (phase === 'ko') {
      g.fillStyle = 'rgba(10, 8, 24, .35)';
      g.fillRect(0, 0, W, H);
      paint.bigText(endText || (winner < 0 ? 'DRAW!' : 'WINNER!'), H / 2 - 40, endText.length > 8 ? 70 : 100, '#ff5a5a', 1);
      paint.bigText(winner < 0 ? "It's a draw!" : winner === meI ? 'You win! 🏆' : names[themI] + ' wins!', H / 2 + 40, 40, '#ffffff', 1);
    }
    const text = phase === 'ready' ? 'Get ready!' : phase === 'ko' ? '' : msgText || (touchMode && def.helpTouch ? def.helpTouch : def.help || '');
    const el = $('dlMsg');
    if (el.textContent !== text) setMsg('dlMsg', text);
    el.classList.toggle('wd-bad', msgBad);
  }

  requestAnimationFrame(frame);
  // (Browsers stop drawing in a hidden tab: the game keeps going anyway, just without the drawing.)
  ctx.every(() => { const now = performance.now(); if (now - lastFrame > 300) advance(now, 1.5); }, 250);
  if (online) {
    if (own) ctx.every(() => ctx.send({ t: 'o', p: def.snapMine(mine), T: host ? Math.round(simT * 1000) / 1000 : undefined, sc: host ? score : undefined }), def.sendMs || SEND_MS);
    else if (host) ctx.every(() => { if (S) ctx.send({ t: 's', g: def.snap(S), T: Math.round(simT * 1000) / 1000, sc: score }); }, def.sendMs || SEND_MS);
    else ctx.every(() => ctx.send({ t: 'i', i: readInput() }), INPUT_MS);
    ctx.every(() => { if (phase !== 'ko' && performance.now() - lastMsg > 15000) ctx.afk(); }, 1000);
  }
  ctx.score(0, 0);
  if (def.note) ctx.note(def.note);
  if (window.__testHooks) {
    window.__duel = {
      id: def.id, api, view, held, count, aim, press, release, phase: () => phase, winner: () => winner,
      state: () => (own ? { mine, theirs: botP || theirs } : host ? S : guestView(performance.now())),
      snaps: () => sbuf.length, guestInput: () => guestRaw, end: (w, x) => endGame(w, x || 'TEST'),
    };
  }
}

CA.duel = { run, TEAM, pictures, deepLerp, nearest, clamp, DT };

})();
