/* The replay check: replays an online Classic Game from the host's record of it, with the game's own code, and says
   whether the host's app played it straight. (The website doesn't load this file: the server's checker, the "verify"
   Edge Function in server/verify/index.ts, does. The tests run it in the browser too: see tools/autotest.js.)

   How it works (see "The replay check" in games-duel.js): the host's app runs the game, 60 steps a second, from both
   players' controls. It writes down the seed, the camera walls and both players' controls at every step they changed,
   and how it ended. The guest's app writes down every set of controls it sent. Here, the game's code runs again from
   the same seed and the same controls. A straight game ends the same way, at the same step, with the same score.
   A hacked host's app (faster, stronger, a goal that never happened, a different winner) doesn't. And every control the
   host says the guest pressed must be one the guest really sent, in the same order.

   CAReplay.files(game)                → the files the game needs, in order
   CAReplay.run(sources, host, guest, expect) → { verdict, note, … }
     sources: { 'cam-walls.js': code, … }, host and guest: the two records, expect: { seed } (what the server expects)
     verdict: 'ok'          it replays exactly, and the guest's controls match
              'partial'     it replays exactly, but there's no record from the guest to check their controls with
              'cheat'       it doesn't replay the same (the host's app was changed), or the seed was wrong
              'inputs'      the host's record has the guest pressing things the guest never sent
              'unsure'      it doesn't replay the same, but the host's browser isn't Chrome-like, so it may be rounding
              'unverified'  this game can't be checked (no record, a game that isn't replayable, …) */
(() => {
'use strict';

const DT = 1 / 60;
// The games that run on the shared engine (games-duel.js) with the host's app running everything. (Shadow Boxing and
// Staring Contest go by each player's camera, and the board games by the board: those can't be replayed this way.)
const FILES = {
  sumo: 'games-sumo.js', swords: 'games-swords.js', trails: 'games-trails.js', box: 'games-box.js', hockey: 'games-hockey.js',
  kart: 'games-kart.js', paint: 'games-paint.js', cannons: 'games-cannons.js', golf: 'games-golf.js', mouse: 'games-mouse.js',
  pond: 'games-pond.js', dodge: 'games-dodge.js', parkour: 'games-parkour.js', poop: 'games-poop.js', gator: 'games-gator.js',
  cheese: 'games-cheesegrab.js', laser: 'games-cheese.js',
};
const BASE = ['cam-walls.js', 'games-floppy.js', 'games-duel.js'];

function files(game) { return FILES[game] ? BASE.concat(FILES[game]) : null; }

function seeded(a) { // (mulberry32: the same as games-duel.js)
  a >>>= 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// (the same as seedFor in solos.js)
function seedFor(matchId, no) {
  let h = 0x811c9dc5;
  for (const ch of 'ca:' + matchId + ':' + no) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

// A pretend web page, just enough for the games' files to load. (Their drawing never runs here.)
function fakePage() {
  const noop = () => {};
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const el = () => ({ getContext: () => ctx2d, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) });
  const document = { createElement: el, getElementById: () => null, getElementsByClassName: () => [], querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} }, body: el() };
  const window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener: noop, removeEventListener: noop };
  class Image { set src(v) { /* never loads */ } }
  return { document, window, Image, navigator: { userAgent: 'replay' }, requestAnimationFrame: noop, performance: { now: () => 0 } };
}

// Loads the game's files into a fresh, separate CA, and gets the game's rules (what it gives CA.duel.run).
function loadGame(sources, game, walls) {
  const page = fakePage();
  const GAMES = {};
  const gauss = (mean, sd) => { // (the same as solos.js)
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const noop = () => {};
  const CA = {
    games: { add(id, def) { GAMES[id] = def; }, kit: { $: () => null, setMsg: noop, sound: noop, skillOf: () => 0.5, gauss, esc: s => s, shuffle: a => a } },
    profile: { equip: {} }, catSVG: () => '<svg></svg>', esc: s => s,
    ITEM: { 'skin-orange': { slot: 'skin', c: ['#ffb366', '#ff9a3c', '#c96a1e'] } }, // (the cats' colours, for drawing only)
  };
  for (const name of files(game)) {
    const code = sources[name];
    if (typeof code !== 'string') throw new Error('missing ' + name);
    new Function('CA', 'window', 'document', 'Image', 'navigator', 'requestAnimationFrame', 'performance', code)(
      CA, page.window, page.document, page.Image, page.navigator, page.requestAnimationFrame, page.performance);
    if (name === 'cam-walls.js' && walls) CA.camWalls.size(walls[0], walls[1]); // (before the game's file reads them)
  }
  let def = null;
  CA.duel.run = (ctx, d) => { def = d; };
  const g = GAMES[game];
  if (!g) throw new Error('no game ' + game);
  g.start({ isHost: true, bot: null, oppName: 'them', oppEquip: {}, seed: 0, rng: seeded(1), stage: page.document.body,
    listen: noop, on: noop, onEnd: noop, later: noop, every: noop, note: noop, score: noop, send: noop, stream: noop });
  if (!def || !def.init || !def.step) throw new Error('not a replayable game');
  if (def.mode === 'own' || def.local) throw new Error('not a replayable game');
  return { def, CA };
}

// Controls as the game gets them, from the packed record (the same as toStep in games-duel.js).
function stepper(W, H) {
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NO = { mx: 0, my: 0, ax: 0, ay: 0, held: {}, hit: {} };
  const used = [{}, {}];
  return (p, i) => {
    if (!p) return NO;
    if (!Array.isArray(p)) return p.s ? Object.assign({}, NO, p.s) : NO; // (the test player and the bot: as the game got them)
    const [mx, my, ax, ay, hs, c] = p;
    const hit = {}, held = {};
    const cc = c && typeof c === 'object' ? c : {};
    for (const k in cc) {
      const n = Math.floor(num(cc[k], 0)), was = used[i][k] || 0;
      if (n > was) { hit[k] = true; used[i][k] = was + 1; }
    }
    String(hs || '').split(',').forEach(k => { if (k) held[k] = true; });
    return { mx: clamp(num(mx, 0), -1, 1), my: clamp(num(my, 0), -1, 1), ax: clamp(num(ax, W / 2), -W, 2 * W), ay: clamp(num(ay, H / 2), -H, 2 * H), held, hit };
  };
}

// Every set of controls the host says the guest pressed must be one the guest sent, in the order it sent them.
function checkInputs(hostIn, sent) {
  const where = new Map();
  sent.forEach((p, k) => { const key = JSON.stringify(p); if (!where.has(key)) where.set(key, []); where.get(key).push(k); });
  let at = -1;
  for (const [, p] of hostIn) {
    if (p === null) continue; // (before the guest's first controls arrived)
    if (!Array.isArray(p)) return { ok: false, why: 'the host recorded the guest as a bot' };
    const list = where.get(JSON.stringify(p));
    const next = list && list.find(k => k >= at);
    if (next === undefined) return { ok: false, why: 'the host had the guest pressing ' + JSON.stringify(p).slice(0, 80) + ', which the guest never sent' };
    at = next;
  }
  return { ok: true };
}

function run(sources, host, guest, expect) {
  const out = (verdict, note, extra) => Object.assign({ verdict, note }, extra || {});
  if (!host || host.v !== 1 || host.role !== 'host') return out('unverified', 'no record from the host');
  if (!files(host.game)) return out('unverified', host.game + " can't be replayed");
  if (host.overflow) return out('unverified', 'the record was too long');
  if (!host.end) return out('unverified', "the game didn't end by its rules");
  if (expect && Number.isFinite(expect.seed) && host.seed !== expect.seed) return out('cheat', 'the host played with the wrong seed (' + host.seed + ', not ' + expect.seed + ')');
  if (host.bot && !(expect && expect.practice)) return out('cheat', 'the host recorded a bot as the other player');

  const walls0 = host.walls.length && host.walls[0][0] === 0 ? host.walls[0].slice(1) : null;
  const { def, CA } = loadGame(sources, host.game, walls0);
  const W = def.W || 960, H = def.H || 540;
  if (W !== host.W || H !== host.H) return out('cheat', 'the arena was the wrong size');

  const rand = seeded(host.seed);
  let simT = 0, tick = 0, score = [0, 0], end = null;
  const real = Math.random;
  const sim = fn => { Math.random = rand; try { return fn(); } finally { Math.random = real; } };
  const api = {
    rng: () => Math.random(), skill: host.skill, bot: false, names: ['host', 'guest'], W, H, host: true, me: 0,
    get t() { return simT; }, T: () => simT,
    ev() {}, note() {}, toOther: null,
    score(a, b) { score = [a, b]; },
    end(w) { if (!end) end = { tick, w, sc: score.slice() }; },
  };
  const toStep = stepper(W, H);
  const S = sim(() => def.init(api));
  const ins = [host.in[0], host.in[1]], at = [0, 0], cur = [null, null];
  let wk = 0;
  const last = host.end.tick;
  for (tick = 0; tick <= last; tick++) {
    for (let i = 0; i < 2; i++) while (at[i] < ins[i].length && ins[i][at[i]][0] <= tick) cur[i] = ins[i][at[i]++][1];
    while (wk < host.walls.length && host.walls[wk][0] <= tick) { CA.camWalls.size(host.walls[wk][1], host.walls[wk][2]); wk++; }
    simT += DT;
    const inp = [toStep(cur[0], 0), toStep(cur[1], 1)];
    sim(() => def.step(S, inp, DT, api));
    if (end) break;
  }
  const same = end && end.tick === host.end.tick && end.w === host.end.w && end.sc[0] === host.end.sc[0] && end.sc[1] === host.end.sc[1];
  const info = { replay: end, claimed: host.end, ticks: last + 1 };
  if (!same) {
    const what = !end ? 'the replay never ended (the host ended it at step ' + host.end.tick + ')'
      : 'the replay ended at step ' + end.tick + ' with ' + end.w + ' winning ' + end.sc.join('-') + '; the host said step ' + host.end.tick + ', ' + host.end.w + ' winning ' + host.end.sc.join('-');
    return out(host.eng === 'v8' ? 'cheat' : 'unsure', what, info);
  }
  if (host.bot) return out('ok', 'practice game', info);
  if (!guest || guest.role !== 'guest' || !Array.isArray(guest.sent)) return out('partial', 'it replays exactly; no record from the guest', info);
  const c = checkInputs(host.in[1], guest.sent);
  if (!c.ok) return out('inputs', c.why, info);
  return out('ok', 'it replays exactly, and the guest pressed what the host said', info);
}

(typeof globalThis !== 'undefined' ? globalThis : window).CAReplay = { files, run, seedFor, checkInputs, FILES };
})();
