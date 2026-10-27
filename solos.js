/* Classic Games: random 1v1 matches with real players, talking cats, streaks and fish.
   CamArcade's server (server.js) pairs players up and settles every game's result; the game itself, your voice and
   your camera go straight between the two browsers over PeerJS.
   Also runs Practice mode: the same games against a bot, with nothing counted. */
(() => {
'use strict';

const playRoot = document.getElementById('scr-play');
const practiceRoot = document.getElementById('scr-practice');
const $ = id => playRoot.querySelector('#' + id) || practiceRoot.querySelector('#' + id);

const PROTOCOL = 32;              // bump when the games or the match flow change, so old and new versions don't meet
const PEER_PREFIX = 'camarcade-';
const PEER_OPTS = { debug: 0 };   // (a peer we were paired with may have just left: we handle those errors ourselves)
const CONN_OPTS = { reliable: true, serialization: 'json' };
const POLL_MS = 1500;             // how often a searching player asks the server for a match
const PAIR_LIMIT = 3;             // games a day between the same two players that count (the server decides; this is for messages)
const BOT_NAMES = ['Whiskers', 'Mittens', 'Biscuit', 'Pumpkin', 'Noodle', 'Pickles', 'Muffin', 'Nugget', 'Tofu', 'Waffles'];
const BOT_LEVEL = { easy: 1, medium: 5, hard: 9 };
const DEFAULT_MATH = {
  duration: 120,
  ops: [
    { kind: 'add', on: true, a1: 2, a2: 100, b1: 2, b2: 100 },
    { kind: 'sub', on: true, a1: 2, a2: 100, b1: 2, b2: 100 },
    { kind: 'mul', on: true, a1: 2, a2: 12, b1: 2, b2: 100 },
    { kind: 'div', on: true, a1: 2, a2: 12, b1: 2, b2: 100 },
  ],
};
const CLASSIC_MATH = Object.assign({}, DEFAULT_MATH, { duration: 35 });

let mode = 'solos';      // 'solos' = real players, 'practice' = bots
let practiceGame = null;
let practiceMix = false; // "Classic mode vs bots": a random game every time
let mathSettings = DEFAULT_MATH;

let peer = null;
let searching = false;
let pollInFlight = null;
let searchStarted = 0;
let searchTick = null;
let searchGen = 0;       // counts searches, so leftovers from an older search know to stop
let pairing = null;      // who the server paired us with: { id, role, opp, oppPeer, catsOnly, sameNet, rankedLeft, played, gameNo, … }
let conn = null;
let isHost = false;
let opp = null;
let outCall = null;
let inCall = null;
let lastSeen = 0;
let pingTimer = null;
let avoidId = 0;         // the player we just left: the server won't pair us again right away
let avoidUntil = 0;
let recentUntil = 0;
let showFace = false;    // does this opponent see your camera? Every new opponent starts out seeing your cat.
let talkOff = null;
let lastTalk = -1;
let lastTalkAt = 0;
let oppTalkTimer = null;
let muteThem = false;
let hideThem = false;
let remoteHasVideo = false;
let lastCallSig = '';     // which of mic ('a') / camera ('v') the call to the opponent carries

let match = null;        // { ctx, gameId, started, over }
let lastGame = null;
let gameBag = [];        // the games still to come in this round of "every game once"
let nextTimer = null;    // the countdown to the next opponent after a game
let recentName = '';

/* ================= SMALL HELPERS ================= */

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randSeed() { return (Math.random() * 4294967296) >>> 0; }
function gauss(mean, sd) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function setMsg(id, text) { const el = $(id); if (el) el.textContent = text; }
function esc(s) { return CA.esc(s); }
function sound(kind) { CA.sound(kind); }
function practiceLevel() { try { return localStorage.getItem('camarcade-practice-level') || 'medium'; } catch (e) { return 'medium'; } }

function startTimer(id, ms) {
  const bar = $(id);
  if (!bar) return;
  bar.style.transition = 'none';
  bar.style.width = '100%';
  bar.getBoundingClientRect();
  bar.style.transition = 'width ' + ms + 'ms linear';
  bar.style.width = '0%';
}
function stopTimer(id) {
  const bar = $(id);
  if (!bar) return;
  const w = bar.getBoundingClientRect().width;
  bar.style.transition = 'none';
  bar.style.width = w + 'px';
}
function resetTimer(id) {
  const bar = $(id);
  if (!bar) return;
  bar.style.transition = 'none';
  bar.style.width = '100%';
}

/* ================= THE MINI-GAMES ================= */

// Shared flow for games where both players act at once each round (then both answers are revealed).
// Optional extras: cfg.points(mine, theirs) -> [myPoints, theirPoints] when both can score in a round,
// cfg.over(my, op, round) for a custom end, cfg.botNow(round) for races (the bot's result the moment you finish, or
// undefined to wait for it), and cfg.afkMs (how long to wait for the other player before they count as gone).
function roundMatch(ctx, cfg) {
  const theirs = {};
  let round = 0;
  let my = 0;
  let op = 0;
  let mine = null;
  let resolvedRound = 0;
  let afkTimer = null;

  ctx.on(msg => {
    if (!msg || msg.t !== 'v' || !Number.isInteger(msg.r)) return;
    theirs[msg.r] = msg.v;
    if (msg.r === round) {
      if (cfg.onTheirs && mine === null) cfg.onTheirs(round, msg.v);
      resolve();
    }
  });

  function start() {
    round++;
    mine = null;
    const r = round;
    cfg.play(r, value => {
      if (r !== round || mine !== null || !ctx.alive()) return;
      mine = value;
      ctx.send({ t: 'v', r, v: value });
      resolve();
    });
    if (ctx.bot) {
      const v = cfg.botValue(r);
      ctx.later(() => {
        theirs[r] = v;
        if (r !== round) return;
        if (cfg.onTheirs && mine === null) cfg.onTheirs(r, v);
        resolve();
      }, cfg.botDelay(r, v));
    } else if (r in theirs && cfg.onTheirs) {
      cfg.onTheirs(r, theirs[r]);
    }
  }

  function resolve() {
    if (resolvedRound === round || mine === null) return;
    if (!(round in theirs) && ctx.bot && cfg.botNow) { const v = cfg.botNow(round); if (v !== undefined) theirs[round] = v; }
    if (!(round in theirs)) {
      if (!ctx.bot && !afkTimer) {
        const r = round;
        afkTimer = ctx.later(() => { afkTimer = null; if (round === r && !(r in theirs)) ctx.afk(); }, cfg.afkMs || 45000);
      }
      return;
    }
    if (afkTimer) { ctx.cancel(afkTimer); afkTimer = null; }
    resolvedRound = round;
    const t = theirs[round];
    let w;
    if (cfg.points) {
      const [pm, po] = cfg.points(mine, t, round);
      my += pm;
      op += po;
      w = Math.sign(pm - po);
    } else {
      w = cfg.compare(mine, t);
      if (w > 0) my++;
      else if (w < 0) op++;
    }
    if (w < 0) ctx.oppCheer();
    ctx.score(my, op);
    cfg.reveal(round, mine, t, w);
    sound(w > 0 ? 'point' : w < 0 ? 'miss' : 'tick');
    const r = round;
    ctx.later(() => {
      const over = cfg.over ? cfg.over(my, op, r) : my >= cfg.target || op >= cfg.target || r >= cfg.maxRounds;
      if (over) ctx.finish(cfg.outcome ? cfg.outcome(my, op) : my > op ? 'win' : my < op ? 'lose' : 'draw');
      else start();
    }, cfg.revealMs || 2100);
  }

  ctx.score(0, 0);
  start();
}

const GAMES = {};

GAMES.rps = {
  name: 'Rock Paper Scissors', icon: '✊', blurb: 'Pick at the same time. First to win 2 rounds wins.',
  start(ctx) {
    const CH = { r: ['🪨', 'Rock'], p: ['📄', 'Paper'], s: ['✂️', 'Scissors'] };
    const BEATS = { r: 's', p: 'r', s: 'p' };
    ctx.stage.innerHTML =
      '<div class="g-rps">' +
      '<div class="rps-arena"><div class="rps-hand" id="rpsMe">❔</div><div class="rps-vs">VS</div><div class="rps-hand them" id="rpsThem">❔</div></div>' +
      '<div class="timer"><i id="rpsTimer"></i></div>' +
      '<div class="rps-picks">' + Object.keys(CH).map((k, i) =>
        '<button class="rps-pick" data-c="' + k + '"><span>' + CH[k][0] + '</span>' + CH[k][1] + '<kbd>' + (i + 1) + '</kbd></button>').join('') + '</div>' +
      '<p class="g-msg" id="rpsMsg"></p></div>';
    const picks = [...ctx.stage.querySelectorAll('.rps-pick')];
    let onPick = null;
    picks.forEach(b => ctx.listen(b, 'click', () => { if (onPick) onPick(b.dataset.c); }));
    ctx.listen(document, 'keydown', e => {
      const k = { 1: 'r', 2: 'p', 3: 's' }[e.key];
      if (k && onPick) onPick(k);
    });
    roundMatch(ctx, {
      target: 2,
      maxRounds: 5,
      play(r, submit) {
        ctx.note('Round ' + r + ' · first to 2');
        setMsg('rpsMe', '❔');
        setMsg('rpsThem', '❔');
        $('rpsMe').className = 'rps-hand';
        $('rpsThem').className = 'rps-hand them';
        picks.forEach(b => { b.disabled = false; b.classList.remove('picked'); });
        setMsg('rpsMsg', 'Pick one!');
        startTimer('rpsTimer', 6000);
        let picked = false;
        onPick = c => {
          if (picked) return;
          picked = true;
          onPick = null;
          picks.forEach(b => { b.disabled = true; b.classList.toggle('picked', b.dataset.c === c); });
          setMsg('rpsMe', CH[c][0]);
          $('rpsMe').classList.add('locked');
          setMsg('rpsMsg', 'Locked in! Waiting for ' + ctx.oppName + '…');
          stopTimer('rpsTimer');
          sound('tick');
          submit(c);
        };
        ctx.later(() => {
          if (picked) return;
          const c = 'rps'[Math.floor(Math.random() * 3)];
          onPick(c);
          setMsg('rpsMsg', 'Too slow! We picked ' + CH[c][1] + ' for you.');
        }, 6000);
      },
      onTheirs() { setMsg('rpsThem', '✅'); },
      compare(a, b) {
        if (!CH[b]) return 1;
        return a === b ? 0 : BEATS[a] === b ? 1 : -1;
      },
      reveal(r, a, b, w) {
        setMsg('rpsMe', CH[a][0]);
        setMsg('rpsThem', CH[b] ? CH[b][0] : '❔');
        $('rpsMe').classList.add(w > 0 ? 'won' : w < 0 ? 'lost' : 'tied');
        $('rpsThem').classList.add(w < 0 ? 'won' : w > 0 ? 'lost' : 'tied');
        setMsg('rpsMsg',
          w > 0 ? CH[a][1] + ' beats ' + CH[b][1] + '. Point for you!'
          : w < 0 ? CH[b][1] + ' beats ' + CH[a][1] + '. Point for ' + ctx.oppName + '.'
          : 'You both picked ' + CH[a][1] + '. Tie!');
      },
      botValue() { return 'rps'[Math.floor(Math.random() * 3)]; },
      botDelay() { return 600 + Math.random() * 2400; },
    });
  },
};

GAMES.draw = {
  name: 'Quick Draw', icon: '⚡', blurb: 'Wait for GO, then click as fast as you can. Clicking too early loses the round! First to 2.',
  start(ctx) {
    const delays = [];
    for (let i = 0; i < 9; i++) delays.push(1600 + Math.floor(ctx.rng() * 3000));
    ctx.stage.innerHTML =
      '<div class="g-draw"><button class="draw-pad" id="drawPad"><span class="draw-big" id="drawBig">Get ready…</span>' +
      '<span class="draw-sub" id="drawSub">Click here or press Space when it turns green</span></button>' +
      '<p class="g-msg" id="drawMsg"></p></div>';
    const pad = $('drawPad');
    let hit = null;
    ctx.listen(pad, 'pointerdown', e => { e.preventDefault(); if (hit) hit(); });
    ctx.listen(document, 'keydown', e => {
      if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); if (hit) hit(); }
    });
    roundMatch(ctx, {
      target: 2,
      maxRounds: 5,
      play(r, submit) {
        ctx.note('Round ' + r + ' · first to 2');
        let state = 'wait';
        let goAt = 0;
        pad.className = 'draw-pad wait';
        setMsg('drawBig', 'Wait for it…');
        setMsg('drawSub', "Don't click yet!");
        setMsg('drawMsg', '');
        const goTimer = ctx.later(() => {
          state = 'go';
          goAt = performance.now();
          pad.className = 'draw-pad go';
          setMsg('drawBig', 'GO!');
          setMsg('drawSub', 'Click!');
          sound('go');
          ctx.later(() => {
            if (state !== 'go') return;
            state = 'done';
            hit = null;
            pad.className = 'draw-pad done';
            setMsg('drawBig', 'Too slow!');
            submit({ ms: 3000 });
          }, 3000);
        }, delays[r - 1]);
        hit = () => {
          if (state === 'wait') {
            state = 'done';
            hit = null;
            ctx.cancel(goTimer);
            pad.className = 'draw-pad foul';
            setMsg('drawBig', 'Too early!');
            setMsg('drawSub', 'You clicked before GO');
            submit({ foul: true });
          } else if (state === 'go') {
            state = 'done';
            hit = null;
            const ms = Math.round(performance.now() - goAt);
            pad.className = 'draw-pad done';
            setMsg('drawBig', ms + ' ms');
            setMsg('drawSub', 'Waiting for ' + ctx.oppName + '…');
            submit({ ms });
          }
        };
      },
      compare(a, b) {
        const fa = !!a.foul;
        const fb = !b || !!b.foul || !Number.isFinite(b.ms);
        if (fa && fb) return 0;
        if (fa) return -1;
        if (fb) return 1;
        return a.ms === b.ms ? 0 : a.ms < b.ms ? 1 : -1;
      },
      reveal(r, a, b, w) {
        const f = v => (!v || v.foul ? 'too early' : v.ms >= 3000 ? 'too slow' : v.ms + ' ms');
        setMsg('drawSub', '');
        setMsg('drawMsg', 'You: ' + f(a) + ' · ' + ctx.oppName + ': ' + f(b) + ' · ' +
          (w > 0 ? 'point for you!' : w < 0 ? 'point for ' + ctx.oppName + '.' : 'tie!'));
      },
      botValue() {
        if (Math.random() < 0.05) return { foul: true };
        return { ms: Math.max(165, Math.round(gauss(410 - ctx.bot.level * 16, 45))) };
      },
      botDelay(r, v) { return v.foul ? delays[r - 1] * 0.6 : delays[r - 1] + v.ms; },
    });
  },
};

GAMES.tap = {
  name: 'Tap Race', icon: '👆', blurb: 'Tap the button (or press Space) as fast as you can for 5 seconds. Best of 3.',
  start(ctx) {
    const LEN = 5000;
    ctx.stage.innerHTML =
      '<div class="g-tap">' +
      '<div class="tap-bars">' +
      '<div class="tap-row"><span>You</span><div class="tap-bar"><i id="tapMeBar"></i></div><b id="tapMe">0</b></div>' +
      '<div class="tap-row them"><span id="tapThemName"></span><div class="tap-bar"><i id="tapThemBar"></i></div><b id="tapThem">0</b></div>' +
      '</div>' +
      '<button class="tap-btn" id="tapBtn" disabled>Get ready…</button>' +
      '<div class="timer"><i id="tapTimer"></i></div>' +
      '<p class="g-msg" id="tapMsg"></p></div>';
    setMsg('tapThemName', ctx.oppName);
    const btn = $('tapBtn');
    let tap = null;
    let liveRound = 0;
    const botCounts = {};
    const botCount = r => botCounts[r] || (botCounts[r] =
      Math.max(8, Math.round((5.4 + ctx.bot.level * 0.4 + (Math.random() - 0.5) * 1.6) * LEN / 1000)));
    const setBar = (who, n) => {
      $(who === 'me' ? 'tapMeBar' : 'tapThemBar').style.width = Math.min(100, n / 60 * 100) + '%';
      setMsg(who === 'me' ? 'tapMe' : 'tapThem', n);
    };
    ctx.listen(btn, 'pointerdown', e => { e.preventDefault(); if (tap) tap(); });
    ctx.listen(document, 'keydown', e => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); if (tap) tap(); } });
    ctx.on(msg => { if (msg && msg.t === 'live' && msg.r === liveRound && Number.isFinite(msg.n)) setBar('them', msg.n); });
    roundMatch(ctx, {
      target: 2,
      maxRounds: 3,
      revealMs: 2400,
      play(r, submit) {
        ctx.note('Round ' + r + ' of 3');
        liveRound = r;
        let n = 0;
        setBar('me', 0);
        setBar('them', 0);
        btn.disabled = true;
        btn.className = 'tap-btn';
        resetTimer('tapTimer');
        setMsg('tapMsg', '');
        ['3', '2', '1'].forEach((s, i) => ctx.later(() => { btn.textContent = s; sound('tick'); }, i * 700));
        ctx.later(() => {
          btn.disabled = false;
          btn.classList.add('live');
          btn.textContent = 'TAP!';
          sound('go');
          startTimer('tapTimer', LEN);
          tap = () => {
            n++;
            setBar('me', n);
            btn.classList.remove('bump');
            void btn.offsetWidth;
            btn.classList.add('bump');
          };
          const live = ctx.every(() => ctx.send({ t: 'live', r, n }), 250);
          let botLive = null;
          if (ctx.bot) {
            const total = botCount(r);
            const t0 = performance.now();
            botLive = ctx.every(() => setBar('them', Math.min(total, Math.round(total * (performance.now() - t0) / LEN))), 120);
          }
          ctx.later(() => {
            tap = null;
            ctx.stopEvery(live);
            if (botLive) ctx.stopEvery(botLive);
            btn.disabled = true;
            btn.classList.remove('live');
            btn.textContent = "Time's up!";
            setMsg('tapMsg', 'Waiting for ' + ctx.oppName + '…');
            submit(n);
          }, LEN);
        }, 2100);
      },
      compare(a, b) {
        if (!Number.isFinite(b)) return 1;
        return a === b ? 0 : a > b ? 1 : -1;
      },
      reveal(r, a, b, w) {
        setBar('me', a);
        setBar('them', Number.isFinite(b) ? b : 0);
        setMsg('tapMsg', 'You: ' + a + ' taps · ' + ctx.oppName + ': ' + b + ' taps · ' +
          (w > 0 ? 'you win the round!' : w < 0 ? ctx.oppName + ' wins the round.' : 'tie!'));
      },
      botValue(r) { return botCount(r); },
      botDelay() { return 2100 + LEN + 200; },
    });
  },
};

// Math Sprint problems work like the "Napkin" setup: subtraction is addition in reverse, division is multiplication in reverse.
function makeProblem(settings, rng) {
  const ops = settings.ops.filter(o => o.on);
  const op = ops[Math.floor(rng() * ops.length)];
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const a = int(op.a1, op.a2);
  const b = int(op.b1, op.b2);
  if (op.kind === 'add') return { text: a + ' + ' + b, answer: a + b };
  if (op.kind === 'sub') return { text: (a + b) + ' − ' + a, answer: b };
  if (op.kind === 'mul') return { text: a + ' × ' + b, answer: a * b };
  return { text: (a * b) + ' ÷ ' + a, answer: b };
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

GAMES.math = {
  name: 'Math Sprint', icon: '🧮', blurb: 'Answer as many sums as you can in 35 seconds. Most right answers wins!',
  start(ctx) {
    const settings = ctx.math || (window.__mathSeconds ? Object.assign({}, DEFAULT_MATH, { duration: window.__mathSeconds }) : CLASSIC_MATH);
    const LEN = settings.duration * 1000;
    const problems = [];
    const problem = i => { while (problems.length <= i) problems.push(makeProblem(settings, ctx.rng)); return problems[i]; };
    ctx.stage.innerHTML =
      '<div class="g-math sprint">' +
      '<div class="sprint-top"><span class="sprint-time" id="spTime">' + fmtTime(LEN) + '</span>' +
      '<span class="sprint-score">You <b id="spMe">0</b></span>' +
      (ctx.solo ? '' : '<span class="sprint-score them"><span id="spThemName"></span> <b id="spThem">0</b></span>') + '</div>' +
      '<div class="math-q" id="mathQ">Get ready…</div>' +
      '<input class="math-in" id="mathIn" inputmode="numeric" autocomplete="off" placeholder="?" maxlength="5" aria-label="Your answer" disabled>' +
      '<div class="timer"><i id="mathTimer"></i></div><p class="g-msg" id="mathMsg">Type the answer. The next one comes as soon as you get it right.</p></div>';
    if (!ctx.solo) setMsg('spThemName', ctx.oppName);
    const input = $('mathIn');
    let check = null;
    ctx.listen(input, 'input', () => {
      const clean = input.value.replace(/[^0-9]/g, '');
      if (clean !== input.value) input.value = clean;
      if (check) check();
    });
    ctx.on(msg => { if (msg && msg.t === 'ms' && Number.isFinite(msg.n)) setMsg('spThem', msg.n); });

    const run = submit => {
      let i = 0;
      let score = 0;
      const t0 = performance.now();
      const show = () => { setMsg('mathQ', problem(i).text + ' ='); input.value = ''; };
      input.disabled = false;
      input.focus();
      show();
      startTimer('mathTimer', LEN);
      sound('go');
      check = () => {
        const want = String(problem(i).answer);
        const v = input.value;
        if (v === want) {
          score++;
          i++;
          setMsg('spMe', score);
          sound('correct');
          ctx.send({ t: 'ms', n: score });
          show();
        } else if (v.length >= want.length) {
          input.classList.remove('wrong');
          void input.offsetWidth;
          input.classList.add('wrong');
          const typed = v;
          ctx.later(() => { if (check && input.value === typed) input.value = ''; }, 260);
        }
      };
      const tick = ctx.every(() => setMsg('spTime', fmtTime(LEN - (performance.now() - t0))), 200);
      if (ctx.bot) {
        let botScore = 0;
        const next = () => ctx.later(() => { botScore++; setMsg('spThem', botScore); next(); }, Math.max(900, gauss(5200 - ctx.bot.level * 330, 900)));
        next();
      }
      ctx.later(() => {
        check = null;
        ctx.stopEvery(tick);
        setMsg('spTime', '0:00');
        input.disabled = true;
        setMsg('mathQ', "Time's up!");
        setMsg('mathMsg', 'You got ' + score + ' right.' + (ctx.solo ? '' : ' Waiting for ' + ctx.oppName + '…'));
        submit(score);
      }, LEN);
    };

    if (ctx.solo) { run(score => ctx.finishSolo(score)); return; }
    roundMatch(ctx, {
      target: 1,
      maxRounds: 1,
      revealMs: 2600,
      play(r, submit) { ctx.note(Math.round(LEN / 1000) + ' seconds · most right answers wins'); run(submit); },
      compare(a, b) {
        if (!Number.isFinite(b)) return 1;
        return a === b ? 0 : a > b ? 1 : -1;
      },
      reveal(r, a, b, w) {
        setMsg('spThem', b);
        setMsg('mathMsg', 'You: ' + a + ' right · ' + ctx.oppName + ': ' + b + ' right · ' +
          (w > 0 ? 'you win!' : w < 0 ? ctx.oppName + ' wins.' : "it's a tie!"));
      },
      botValue() { return 0; }, // the bot's live score above is what counts
      botDelay() { return LEN + 400; },
    });
  },
};

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function lineWinner(b) {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return b[l[0]];
  return null;
}
function minimax(b, turn, me) {
  const w = lineWinner(b);
  if (w) return w === me ? 10 : -10;
  if (b.every(Boolean)) return 0;
  let best = turn === me ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const s = minimax(b, turn === 'X' ? 'O' : 'X', me);
    b[i] = null;
    best = turn === me ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}
function bestMove(b, me) {
  let best = -Infinity;
  let picks = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = me;
    const s = minimax(b, me === 'X' ? 'O' : 'X', me);
    b[i] = null;
    if (s > best) { best = s; picks = [i]; } else if (s === best) picks.push(i);
  }
  return picks[Math.floor(Math.random() * picks.length)];
}

GAMES.ttt = {
  name: 'Tic-Tac-Toe', icon: '⭕', blurb: 'Get three in a row to win! A tie means you play again. After 3 ties in a row, you both move on (your streak is safe).',
  start(ctx) {
    const hostFirst = ctx.rng() < 0.5;
    ctx.stage.innerHTML =
      '<div class="g-ttt"><div class="ttt-board">' +
      Array.from({ length: 9 }, (_, i) => '<button class="ttt-cell" data-i="' + i + '"></button>').join('') +
      '</div><div class="timer"><i id="tttTimer"></i></div><p class="g-msg" id="tttMsg"></p></div>';
    const cells = [...ctx.stage.querySelectorAll('.ttt-cell')];
    const pending = [];
    let g = 0;
    let my = 0;
    let op = 0;
    let board = [];
    let myMark = 'X';
    let turnMine = false;
    let moves = 0;
    let locked = true;
    let turnTimer = null;
    const theirMark = () => (myMark === 'X' ? 'O' : 'X');
    const empties = () => board.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
    const randomEmpty = () => { const e = empties(); return e[Math.floor(Math.random() * e.length)]; };

    cells.forEach(c => ctx.listen(c, 'click', () => myMove(+c.dataset.i)));
    ctx.on(msg => {
      if (!msg || msg.t !== 'm' || !Number.isInteger(msg.i)) return;
      if (msg.g === g) theirMove(msg.i, msg.n);
      else if (msg.g > g) pending.push(msg);
    });

    function render() {
      cells.forEach((c, i) => {
        c.textContent = board[i] || '';
        c.className = 'ttt-cell' + (board[i] ? ' ' + board[i].toLowerCase() : '') + (!locked && turnMine && !board[i] ? ' open' : '');
      });
    }

    function newGame() {
      g++;
      board = Array(9).fill(null);
      moves = 0;
      locked = false;
      const hostStarts = g % 2 === 1 ? hostFirst : !hostFirst;
      const iStart = hostStarts === ctx.isHost;
      myMark = iStart ? 'X' : 'O';
      turnMine = iStart;
      ctx.note((g > 1 ? 'Game ' + g + ' · ' : '') + 'you are ' + myMark);
      render();
      nextTurn();
      const now = pending.filter(m => m.g === g);
      const later = pending.filter(m => m.g > g);
      pending.length = 0;
      pending.push(...later);
      now.forEach(m => theirMove(m.i, m.n));
    }

    function nextTurn() {
      if (turnTimer) ctx.cancel(turnTimer);
      startTimer('tttTimer', 10000);
      const m = moves;
      if (turnMine) {
        setMsg('tttMsg', 'Your turn! You are ' + myMark + '.');
        turnTimer = ctx.later(() => { if (turnMine && moves === m && !locked) myMove(randomEmpty()); }, 10000);
      } else {
        setMsg('tttMsg', ctx.oppName + ' is thinking…');
        turnTimer = ctx.bot
          ? ctx.later(() => { if (!turnMine && moves === m && !locked) place(botPick(), theirMark()); }, 500 + Math.random() * 900)
          : ctx.later(() => { if (!turnMine && moves === m && !locked) ctx.afk(); }, 40000);
      }
      render();
    }

    function botPick() {
      if (Math.random() < 0.3 + ctx.bot.level * 0.065) return bestMove(board.slice(), theirMark());
      return randomEmpty();
    }

    function myMove(i) {
      if (locked || !turnMine || board[i] || i == null) return;
      ctx.send({ t: 'm', g, i, n: moves });
      place(i, myMark);
    }

    function theirMove(i, n) {
      if (locked || turnMine || board[i] || i < 0 || i > 8 || n !== moves) return;
      place(i, theirMark());
    }

    function place(i, mark) {
      board[i] = mark;
      moves++;
      sound('tick');
      const w = lineWinner(board);
      if (w || moves === 9) { endGame(w); return; }
      turnMine = !turnMine;
      nextTurn();
    }

    function endGame(w) {
      locked = true;
      if (turnTimer) ctx.cancel(turnTimer);
      stopTimer('tttTimer');
      render();
      if (w) {
        const line = LINES.find(l => l.every(k => board[k] === w));
        line.forEach(k => cells[k].classList.add('win'));
        if (w === myMark) my++; else { op++; ctx.oppCheer(); }
      }
      ctx.score(my, op);
      setMsg('tttMsg', !w ? "It's a tie game!" : w === myMark ? 'Three in a row. You win this game!' : ctx.oppName + ' got three in a row.');
      sound(!w ? 'tick' : w === myMark ? 'point' : 'miss');
      ctx.later(() => {
        if (my >= 1 || op >= 1) ctx.finish(my > op ? 'win' : 'lose');
        else if (g >= 3) ctx.finish('draw', { noRematch: true, text: '3 ties in a row, so you both move on. Your streak is safe!' });
        else newGame();
      }, 1900);
    }

    ctx.score(0, 0);
    newGame();
  },
};

// Every game gets exactly the same chance: all of them come up once, in a random order, before any game repeats.
// Games that need cameras (Pose Match) are only picked when opts.camera says everyone's camera is on.
function pickGame(opts) {
  const forced = window.__forceGame; // lets the automated tests pick a game
  if (forced && GAMES[forced]) return forced;
  const ok = id => !GAMES[id].camera || !!(opts && opts.camera);
  if (!gameBag.some(ok)) gameBag = shuffle(Object.keys(GAMES), Math.random);
  const allowed = gameBag.map((id, i) => i).filter(i => ok(gameBag[i]));
  let i = allowed[allowed.length - 1];
  if (gameBag[i] === lastGame && allowed.length > 1) i = allowed[Math.floor(Math.random() * (allowed.length - 1))]; // not the same game twice in a row
  return gameBag.splice(i, 1)[0];
}

// (The tests set window.__timeScale to make the timed games shorter.)
function L(ms) { return Math.round(ms * (window.__timeScale || 1)); }
function skillOf(ctx) { return ctx.bot ? (ctx.bot.level - 1) / 8 : 0; } // 0 = easy bot … 1 = hard bot
const msOf = v => (v && Number.isFinite(v.ms) ? v.ms : Infinity);

// A timed race: both players play the same thing on their own screen at the same time. Highest score wins; with the
// same score, whoever got there first (0 to 0 is a tie). cfg.endsRace: finishing (say, reaching the exit) ends it for
// both players. cfg.untilBeaten: no clock (cfg.len is only a safety limit). You play until you're out, and once the
// other player is out, you play on until you pass them. cfg.extra() adds to your final result (like the words you found).
function scoreRace(ctx, cfg) {
  const LEN = cfg.len;
  const until = !!cfg.untilBeaten;
  const bars = raceBars(ctx, cfg.barMax || 10);
  const fmt = cfg.fmt || (n => String(Math.floor(n)));
  const barOf = cfg.barValue || (n => n);
  ctx.stage.innerHTML = '<div class="g-race">' + cfg.html(bars.html) + '</div>';
  let score = 0;
  let scoreAt = 0;
  let running = false;
  let t0 = 0;
  let finish = null;
  let capped = false;      // the safety limit ran out
  let theirFinal = null;   // (untilBeaten) the other player's score once they're out
  const bot = ctx.bot ? cfg.bot(skillOf(ctx)) : null; // { final, at }: the bot's final score, and when it gets there
  const botScore = ms => (cfg.botCurve ? cfg.botCurve(bot, ms) : bot.final * Math.min(1, ms / bot.at));
  const botExtra = ms => (cfg.botExtra ? cfg.botExtra(bot, ms) : null);
  let botLive = !!bot;     // the bot's bar keeps moving until its result is in
  let botTimer = null;
  const api = {
    get score() { return score; },
    get theirs() { return theirFinal; },
    set(n) {
      if (!running || n === score) return;
      score = n;
      scoreAt = Math.round(performance.now() - t0);
      bars.set('me', barOf(n), fmt(n));
      ctx.send({ t: 'live', n });
      if (until && theirFinal !== null && score > theirFinal) finish(); // you passed them: that's the win
    },
    add(k) { api.set(score + (k == null ? 1 : k)); },
    done() { if (finish) finish(); }, // you're out, or finished: your score is final
    running: () => running,
    elapsed: () => performance.now() - t0,
    later: (fn, ms) => ctx.later(fn, ms),
  };
  ctx.on(msg => { if (msg && msg.t === 'live' && Number.isFinite(msg.n)) bars.set('them', barOf(msg.n), fmt(msg.n)); });
  const scoreOf = v => (v && Number.isFinite(v.n) ? v.n : -Infinity);
  const timeOf = v => (v && Number.isFinite(v.t) ? v.t : Infinity);
  // (untilBeaten, against a bot) the bot's result arrives like a real player's would
  const botArrives = (v, ms) => {
    if (botTimer) ctx.cancel(botTimer);
    botTimer = ctx.later(() => {
      botLive = false;
      bars.set('them', barOf(v.n), fmt(v.n));
      ctx.deliver({ t: 'v', r: 1, v });
    }, Math.max(0, ms - (performance.now() - t0)));
  };
  const theyreOut = n => {
    theirFinal = n;
    if (!running) return;
    if (score > n) { finish(); return; }
    ctx.note(cfg.passNote ? cfg.passNote(n) : ctx.oppName + ' is out with ' + fmt(n) + '. Beat it to win!');
  };
  roundMatch(ctx, {
    target: 1,
    maxRounds: 1,
    revealMs: cfg.revealMs || 2600,
    afkMs: until ? LEN + 20000 : undefined, // (they might play on for a while after you're out)
    play(r, submit) {
      ctx.note(cfg.note);
      running = true;
      t0 = performance.now();
      if (cfg.timerId) startTimer(cfg.timerId, LEN);
      finish = () => {
        if (!running) return;
        if (cfg.stop) cfg.stop(); // (the game can still set its final score here)
        running = false;
        if (cfg.timerId) stopTimer(cfg.timerId);
        if (until && bot && botLive && !capped) { // the bot plays on: it passes you, or it's out below you
          if (bot.final > score) botArrives({ n: score + 1, t: Math.round(bot.at * (score + 1) / bot.final) }, bot.at * (score + 1) / bot.final);
          else botArrives({ n: bot.final, t: Math.round(bot.at) }, bot.at);
        }
        submit(Object.assign({ n: score, t: score > 0 ? scoreAt : null }, cfg.extra ? cfg.extra() : null));
      };
      ctx.later(() => { capped = true; finish(); }, LEN);
      if (bot) {
        ctx.every(() => { if (running || (until && botLive)) { const n = botScore(performance.now() - t0); bars.set('them', barOf(n), fmt(n)); } }, 250);
        if (until && bot.at < LEN) botArrives({ n: bot.final, t: Math.round(bot.at) }, bot.at); // the bot is out
      }
      cfg.start(api);
    },
    onTheirs(r, v) {
      if (cfg.endsRace && finish) finish();
      if (until) theyreOut(scoreOf(v));
    },
    compare(a, b) {
      const sa = scoreOf(a), sb = scoreOf(b);
      if (sa !== sb) return sa > sb ? 1 : -1;
      if (sa <= 0) return 0; // nobody scored
      const ta = timeOf(a), tb = timeOf(b);
      return ta === tb ? 0 : ta < tb ? 1 : -1;
    },
    reveal(r, a, b, w) {
      bars.set('me', barOf(scoreOf(a)), fmt(scoreOf(a)));
      bars.set('them', barOf(scoreOf(b)), fmt(scoreOf(b)));
      if (cfg.reveal) cfg.reveal(scoreOf(a), scoreOf(b), w, a, b);
    },
    botValue() { return Object.assign({ n: bot.final, t: Math.round(bot.at) }, botExtra(Infinity)); },
    botDelay() { return until ? LEN + 60000 : cfg.endsRace && bot.at < LEN ? bot.at : LEN + 150; },
    botNow() {
      if (until && !capped) return undefined; // (it arrives by itself, see botArrives)
      const ms = performance.now() - t0;
      return Object.assign({ n: cfg.botNow ? cfg.botNow(bot, ms) : Math.floor(botScore(ms)), t: Math.round(ms) }, botExtra(ms));
    },
  });
}

// Question rounds: both players get the same question, and the fastest right answer wins the round.
// cfg.rounds: [{ q: question HTML, options: [labels], answer: index, after: text for the reveal }]
function quizRounds(ctx, cfg) {
  const ROUND = cfg.roundMs;
  const skill = skillOf(ctx);
  ctx.stage.innerHTML = '<div class="g-quiz' + (cfg.cls ? ' ' + cfg.cls : '') + '"><div class="qz-q" id="qzQ"></div><div class="qz-opts" id="qzOpts"></div>' +
    '<div class="timer"><i id="qzTimer"></i></div><p class="g-msg" id="qzMsg"></p><p class="muted small center" id="qzThem"></p></div>';
  let onPick = null;
  ctx.listen($('qzOpts'), 'click', e => {
    const b = e.target.closest && e.target.closest('.qz-opt');
    if (b && onPick) onPick(+b.dataset.i);
  });
  ctx.listen(document, 'keydown', e => {
    const k = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
    if (k !== undefined && onPick) onPick(k);
  });
  const pickOf = v => (v && Number.isInteger(v.pick) ? v.pick : -1);
  const round = r => cfg.rounds[r - 1];
  roundMatch(ctx, {
    target: cfg.target,
    maxRounds: cfg.maxRounds,
    revealMs: cfg.revealMs || 2200,
    points(a, b, r) {
      const ok = round(r).answer;
      const ca = pickOf(a) === ok, cb = pickOf(b) === ok;
      if (ca && cb) { const ma = msOf(a), mb = msOf(b); return ma === mb ? [0, 0] : ma < mb ? [1, 0] : [0, 1]; }
      return [ca ? 1 : 0, cb ? 1 : 0];
    },
    play(r, submit) {
      const rd = round(r);
      if (window.__testHooks) window.__peek = { answer: rd.answer };
      ctx.note(cfg.note(r));
      $('qzQ').innerHTML = rd.q;
      $('qzOpts').className = 'qz-opts' + (rd.options.length === 2 ? ' two' : '');
      $('qzOpts').innerHTML = rd.options.map((o, i) => '<button class="qz-opt" data-i="' + i + '"><kbd>' + (i + 1) + '</kbd>' + o + '</button>').join('');
      setMsg('qzMsg', cfg.ask || 'Pick the right answer!');
      setMsg('qzThem', '');
      startTimer('qzTimer', ROUND);
      const t0 = performance.now();
      let picked = false;
      onPick = i => {
        if (picked) return;
        picked = true;
        onPick = null;
        const ms = Math.round(performance.now() - t0);
        ctx.stage.querySelectorAll('.qz-opt').forEach((b, k) => { b.disabled = true; b.classList.toggle('picked', k === i); });
        stopTimer('qzTimer');
        setMsg('qzMsg', i < 0 ? "Time's up!" : 'Locked in! Waiting for ' + ctx.oppName + '…');
        sound('tick');
        submit({ pick: i, ms });
      };
      if (cfg.onRound) cfg.onRound(rd, ctx);
      ctx.later(() => { if (!picked) onPick(-1); }, ROUND);
    },
    onTheirs() { setMsg('qzThem', ctx.oppName + ' has answered'); },
    reveal(r, a, b, w) {
      const rd = round(r);
      ctx.stage.querySelectorAll('.qz-opt').forEach((btn, k) => {
        btn.classList.toggle('right', k === rd.answer);
        btn.classList.toggle('wrong', k === pickOf(a) && k !== rd.answer);
      });
      const res = v => (pickOf(v) === rd.answer ? '✅ ' + (msOf(v) / 1000).toFixed(1) + 's' : '❌');
      setMsg('qzMsg', (rd.after ? rd.after + ' ' : '') + (w > 0 ? 'Point for you!' : w < 0 ? 'Point for ' + ctx.oppName + '.' : 'No point.'));
      setMsg('qzThem', 'You ' + res(a) + ' · ' + ctx.oppName + ' ' + res(b));
    },
    botValue(r) {
      const rd = round(r);
      const right = Math.random() < (cfg.botRight ? cfg.botRight(skill) : 0.5 + skill * 0.4);
      const wrongs = rd.options.map((o, k) => k).filter(k => k !== rd.answer);
      const ms = Math.round(Math.min(ROUND - 300, Math.max(900, gauss((cfg.botMs || 4200) - skill * 1800, 800))));
      return { pick: right ? rd.answer : wrongs[Math.floor(Math.random() * wrongs.length)], ms };
    },
    botDelay(r, v) { return v.ms; },
  });
}

// Mind-reading rounds: pick your own answer, then guess the other player's. A right guess scores a point.
function predictRounds(ctx, cfg) {
  const ROUND = cfg.roundMs;
  ctx.stage.innerHTML = '<div class="g-predict"><div class="pr-q" id="prQ"></div><p class="pr-step" id="prStep"></p><div class="pr-opts" id="prOpts"></div>' +
    '<div class="timer"><i id="prTimer"></i></div><p class="g-msg" id="prMsg"></p></div>';
  let onPick = null;
  ctx.listen($('prOpts'), 'click', e => {
    const b = e.target.closest && e.target.closest('.pr-opt');
    if (b && onPick) onPick(+b.dataset.i);
  });
  const valid = (v, n) => v && Number.isInteger(v.mine) && v.mine >= 0 && v.mine < n;
  roundMatch(ctx, {
    revealMs: 2500,
    points: cfg.points || ((a, b, r) => {
      const n = cfg.rounds[r - 1].options.length;
      return [valid(b, n) && a.guess === b.mine ? 1 : 0, valid(a, n) && b && b.guess === a.mine ? 1 : 0];
    }),
    over: (my, op, r) => r >= cfg.rounds.length,
    outcome: cfg.outcome,
    play(r, submit) {
      const rd = cfg.rounds[r - 1];
      ctx.note('Round ' + r + ' of ' + cfg.rounds.length);
      $('prQ').innerHTML = rd.q;
      const draw = sel => { $('prOpts').innerHTML = rd.options.map((o, i) => '<button class="pr-opt' + (sel === i ? ' picked' : '') + '" data-i="' + i + '">' + o + '</button>').join(''); };
      draw(-1);
      setMsg('prStep', cfg.guess ? '1. Pick YOUR answer' : 'Pick your answer');
      setMsg('prMsg', '');
      startTimer('prTimer', ROUND);
      const pick = { mine: -1, guess: -1 };
      let sent = false;
      const send = () => {
        if (sent) return;
        sent = true;
        onPick = null;
        stopTimer('prTimer');
        ctx.stage.querySelectorAll('.pr-opt').forEach(b => { b.disabled = true; });
        setMsg('prMsg', 'Locked in! Waiting for ' + ctx.oppName + '…');
        submit({ mine: pick.mine, guess: pick.guess });
      };
      onPick = i => {
        sound('tick');
        if (pick.mine < 0) {
          pick.mine = i;
          if (!cfg.guess) { draw(i); send(); return; }
          draw(-1);
          setMsg('prStep', '2. What will ' + ctx.oppName + ' pick?');
          $('prOpts').classList.add('guess');
          return;
        }
        pick.guess = i;
        draw(i);
        $('prOpts').classList.remove('guess');
        send();
      };
      $('prOpts').classList.remove('guess');
      ctx.later(() => {
        if (sent) return;
        const n = rd.options.length;
        if (pick.mine < 0) pick.mine = Math.floor(Math.random() * n);
        if (cfg.guess && pick.guess < 0) pick.guess = Math.floor(Math.random() * n);
        setMsg('prStep', "Time's up! We picked for you.");
        send();
      }, ROUND);
    },
    onTheirs() { setMsg('prMsg', ctx.oppName + ' has answered'); },
    reveal(r, a, b) {
      const rd = cfg.rounds[r - 1];
      const n = rd.options.length;
      const name = i => (i >= 0 && i < n ? rd.options[i] : 'nothing');
      $('prStep').textContent = '';
      $('prOpts').classList.remove('guess');
      $('prOpts').innerHTML = rd.options.map((o, i) =>
        '<div class="pr-opt shown">' + o + '<span>' + (a && a.mine === i ? '<i class="me">You</i>' : '') + (b && b.mine === i ? '<i class="them">' + CA.esc(ctx.oppName) + '</i>' : '') + '</span></div>').join('');
      setMsg('prMsg', cfg.reveal ? cfg.reveal(a, b, rd, name) : 'You guessed ' + name(a && a.guess) + (b && a && a.guess === b.mine ? ' ✅' : ' ❌') +
        ' · ' + ctx.oppName + ' guessed ' + name(b && b.guess) + (a && b && b.guess === a.mine ? ' ✅' : ' ❌'));
    },
    botValue(r) {
      const n = cfg.rounds[r - 1].options.length;
      return { mine: Math.floor(Math.random() * n), guess: Math.floor(Math.random() * n) };
    },
    botDelay() { return 1500 + Math.random() * 3500; },
  });
}

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Two progress bars (you and the other player) for the race games.
function raceBars(ctx, max) {
  const html = '<div class="tap-bars race-bars">' +
    '<div class="tap-row"><span>You</span><div class="tap-bar"><i data-bar="me"></i></div><b data-num="me">0</b></div>' +
    '<div class="tap-row them"><span>' + esc(ctx.oppName) + '</span><div class="tap-bar"><i data-bar="them"></i></div><b data-num="them">0</b></div></div>';
  function set(who, n, text) {
    const bar = ctx.stage.querySelector('[data-bar="' + who + '"]');
    const num = ctx.stage.querySelector('[data-num="' + who + '"]');
    if (bar) bar.style.width = Math.max(0, Math.min(100, n / max * 100)) + '%';
    if (num) num.textContent = text != null ? text : n;
  }
  return { html, set };
}

// The other game files (games-*.js) add their games through this.
CA.games = {
  add(id, def) { GAMES[id] = def; },
  pick: opts => pickGame(opts), // (the tests use this to check that every game gets the same chance)
  ids: () => Object.keys(GAMES),
  kit: {
    $, setMsg, esc, sound, sleep, gauss, shuffle, startTimer, stopTimer, resetTimer, roundMatch, raceBars, fmtTime,
    L, skillOf, msOf, scoreRace, quizRounds, predictRounds,
  },
};

/* ================= MATCH FLOW ================= */

function makeCtx(gameId, seed, extra) {
  const timers = new Set();
  const intervals = new Set();
  const listeners = [];
  const handlers = [];
  const queue = [];
  const enders = [];
  const ctx = Object.assign({
    stage: $('stage'),
    rng: mulberry32(seed),
    isHost,
    bot: opp && opp.bot ? { level: opp.level } : null,
    oppName: opp ? opp.name : '',
    oppEquip: opp ? opp.equip : null, // (for games that draw the other player's cat)
    theirCam: () => theirStream(),    // (for games that show the other player's camera themselves)
    started: false,
    alive: () => !!match && match.ctx === ctx && !match.over,
    send(msg) { if (opp && !opp.bot) send({ t: 'g', m: msg }); },
    on(fn) { handlers.push(fn); },
    deliver(msg) {
      if (!ctx.alive()) return;
      if (!ctx.started) { queue.push(msg); return; }
      handlers.forEach(h => h(msg));
    },
    flush() { ctx.started = true; queue.splice(0).forEach(m => handlers.forEach(h => h(m))); },
    later(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); if (ctx.alive()) fn(); }, ms);
      timers.add(id);
      return id;
    },
    cancel(id) { clearTimeout(id); timers.delete(id); },
    every(fn, ms) {
      const id = setInterval(() => { if (ctx.alive()) fn(); }, ms);
      intervals.add(id);
      return id;
    },
    stopEvery(id) { clearInterval(id); intervals.delete(id); },
    listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); },
    onEnd(fn) { enders.push(fn); }, // runs when the match ends, however it ends (like stopping a voice that's talking)
    score(a, b) { setMsg('scMe', a); setMsg('scThem', b); },
    note(text) { setMsg('scNote', text || ''); },
    oppCheer() { if (opp && opp.bot) botTalk(700); },
    finish(outcome, opts) { if (ctx.alive()) endMatch(outcome, null, opts); }, // opts: { noRematch, text }
    finishSolo(score) { if (ctx.alive()) endSolo(score); },
    afk() { if (ctx.alive()) endMatch('win', 'afk'); },
    cleanup() {
      timers.forEach(clearTimeout);
      timers.clear();
      intervals.forEach(clearInterval);
      intervals.clear();
      listeners.splice(0).forEach(([t, ty, fn, o]) => t.removeEventListener(ty, fn, o));
      enders.splice(0).forEach(fn => { try { fn(); } catch (e) { console.warn('Game cleanup failed:', e); } });
    },
  }, extra || {});
  return ctx;
}

function beginMatch(gameId, seed, extra) {
  if (match) { match.over = true; match.ctx.cleanup(); }
  cancelNext();
  lastGame = gameId;
  const ctx = makeCtx(gameId, seed, extra);
  const solo = !!(extra && extra.solo);
  const online = mode === 'solos' && !!pairing && !!opp && !opp.bot;
  if (online) pairing.gameNo++; // (both players count the games of a match the same way: the server checks the numbers)
  match = { ctx, gameId, started: false, over: false, solo, gameNo: online ? pairing.gameNo : 0, counted: online && counts() };
  const g = GAMES[gameId];
  CA.voice.setInGame(true); // your camera turns on for every game (if you allowed it)
  CA.showScreen('scr-play');
  $('matchView').classList.toggle('solo-run', solo);
  renderPlayers();
  setMsg('scMode', mode !== 'practice' ? '⚡ Classic Games'
    : solo ? '🎯 Practice'
    : (practiceMix ? '🎲 Classic vs bots' : '🎯 Practice') + ' · ' + practiceLevel());
  setMsg('scGame', g.icon + ' ' + g.name);
  ctx.score(0, 0);
  ctx.note('');
  $('stage').innerHTML = '<div class="stage-wait">Get ready…</div>';
  const go = () => {
    match.started = true;
    g.start(ctx);
    ctx.flush();
  };
  if (g.prepare) g.prepare(ctx); // (e.g. load the word list while you look at each other)
  if (solo) countdown(ctx, go); else faceToFace(ctx, g, go);
}

function countdown(ctx, then) {
  let n = 3;
  const step = () => {
    if (n === 0) { then(); return; }
    $('stage').innerHTML = '<div class="stage-count">' + n + '</div>';
    sound('tick');
    n--;
    ctx.later(step, 800);
  };
  step();
}

/* ================= FACE TO FACE ================= */
// Before every round: 5 seconds of seeing each other (big cameras, or cats) while the game's rules show.
// After it: a few seconds to react, with Rematch / Next.

function showFaces() {
  const p = CA.profile;
  $('vsMeCat').innerHTML = CA.catSVG(p.equip, { label: p.name, talker: 'me' });
  $('vsThemCat').innerHTML = opp ? CA.catSVG(opp.equip, { label: opp.name, talker: 'opp' }) : '';
  setMsg('vsMeName', p.name);
  setMsg('vsThemName', opp ? opp.name : '');
  setMsg('vsMeTag', mode === 'practice' ? '🎯 Practice' : '🔥 ' + p.streak);
  setMsg('vsThemTag', !opp ? '' : opp.bot ? '🤖 ' + practiceLevel() : '🔥 ' + opp.streak);
  syncFaceVideos();
}

function syncFaceVideos() {
  const mv = $('vsMeVideo');
  const mine = myVideoShown();
  if (mine && mv.srcObject !== CA.voice.camera) { mv.srcObject = CA.voice.camera; mv.play().catch(() => {}); }
  if (!mine) mv.srcObject = null;
  mv.classList.toggle('hidden', !mine);
  const tv = $('vsThemVideo');
  const src = theirStream();
  if (src && tv.srcObject !== src) { tv.srcObject = src; tv.play().catch(() => {}); }
  if (!src) tv.srcObject = null;
  tv.classList.toggle('hidden', !src);
}

// The other player's camera, while they show it and you haven't hidden it (otherwise null).
function theirStream() {
  const src = $('themVideo').srcObject;
  return !!opp && !opp.bot && !opp.gone && opp.face && remoteHasVideo && !hideThem && src ? src : null;
}

function faceToFace(ctx, g, then) {
  stopReaction(true);
  showFaces();
  setMsg('vsIcon', g.icon);
  setMsg('vsGame', g.name);
  setMsg('vsBlurb', g.blurb);
  const note = mode === 'solos' && !match.counted ? '🤝 ' + friendlyText() : '';
  setMsg('vsNote', note);
  $('vsNote').classList.toggle('hidden', !note);
  $('vsIntro').classList.remove('hidden');
  $('vsReact').classList.add('hidden');
  const len = window.__introMs != null ? window.__introMs : 5000; // (the tests make this shorter)
  let n = Math.max(1, Math.round(len / 1000));
  const per = len / n;
  setMsg('vsCount', n);
  $('vs').classList.remove('hidden');
  sound('match');
  if (opp.bot) botTalk(900);
  const step = () => {
    n--;
    if (n > 0) { setMsg('vsCount', n); sound('tick'); ctx.later(step, per); return; }
    $('vs').classList.add('hidden');
    then();
  };
  ctx.later(step, per);
}

let react = null; // the few seconds after a round: { mine, theirs, due, iv } (did you / they press Rematch?)

function startReaction(outcome, res, opts) {
  stopReaction(true);
  const online = mode === 'solos';
  const noRematch = !!(opts && opts.noRematch); // (e.g. 3 tied Tic-Tac-Toe games: on to someone new)
  const ms = window.__reactMs != null ? window.__reactMs : 5000;
  react = { mine: false, theirs: false, due: Date.now() + ms, iv: null };
  showFaces();
  $('vsIntro').classList.add('hidden');
  const box = $('vsReact');
  box.className = 'f2f-react ' + outcome;
  setMsg('rxBadge', outcome === 'win' ? '🏆' : outcome === 'lose' ? '😿' : '🤝');
  setMsg('rxTitle', outcome === 'win' ? 'You win!' : outcome === 'lose' ? 'You lost' : "It's a draw");
  let reward = '';
  if (res) {
    reward = '🔥 ' + res.before.streak + ' → ' + res.after.streak + (res.fish ? ' · +' + res.fish + ' 🐟' : '') + ' · +' + res.xp + ' XP' +
      (res.after.tier > res.before.tier ? '<a href="#/pass">🎁 Tier ' + res.after.tier + ' unlocked!</a>' : '');
  } else if (mode === 'practice') {
    reward = '🎯 Practice: nothing is counted';
  } else {
    reward = '🤝 Friendly game: nothing is counted';
  }
  $('rxReward').innerHTML = reward;
  const rb = $('rematchBtn');
  const gone = online && (!conn || !conn.open || !opp || opp.gone);
  const blocked = online && !!opp && !!opp.blocked;
  rb.disabled = gone || noRematch || blocked;
  rb.classList.remove('chosen');
  rb.textContent = '🔁 Rematch';
  setMsg('nextBtn', online ? '⏭ Next player' : '⏭ New bot');
  $('rxReportBtn').classList.toggle('hidden', !online || blocked);
  setMsg('rxNote', gone ? opp.name + ' has left.' : blocked ? "You blocked " + opp.name + ", so you'll get someone new."
    : noRematch ? '3 ties in a row: on to ' + (online ? 'someone new' : 'a new bot') + '!' : '');
  $('vs').classList.remove('hidden');
  startTimer('rxTimer', ms); // (after showing it: a hidden bar doesn't animate)
  react.iv = setInterval(reactTick, 150);
}

function reactTick() {
  if (!react || Date.now() < react.due) return;
  if (react.mine && react.theirs && Date.now() < react.due + 3000) return; // the rematch is starting
  if (document.visibilityState !== 'visible') { // don't match you with someone while you're away
    clearInterval(react.iv);
    react.iv = null;
    setMsg('rxNote', '⏸ Paused while you were away. Pick Rematch or Next.');
    return;
  }
  goNext(mode === 'solos' ? 'next' : 'bot');
}

function stopReaction(keepOverlay) {
  if (react) clearInterval(react.iv);
  react = null;
  if (!keepOverlay) $('vs').classList.add('hidden');
}

function maybeRematch() {
  if (!react || !react.mine || !react.theirs || !isHost || (opp && opp.blocked)) return;
  const game = pickGame({ camera: CA.voice.cameraOn() && !!opp && opp.cam });
  const seed = randSeed();
  send({ t: 'start', game, seed, no: pairing ? pairing.gameNo + 1 : 0 });
  beginMatch(game, seed);
}

$('rematchBtn').addEventListener('click', () => {
  if (!react || react.mine) return;
  if (mode !== 'solos') { // the bot always says yes: same bot, a new game
    stopReaction(true);
    beginMatch(practiceMix ? pickGame({ camera: CA.voice.cameraOn() }) : practiceGame, randSeed());
    return;
  }
  react.mine = true;
  const rb = $('rematchBtn');
  rb.classList.add('chosen');
  rb.textContent = react.theirs ? '🔁 Starting…' : '⏳ Waiting for ' + opp.name + '…';
  send({ t: 'again' });
  maybeRematch();
});
$('nextBtn').addEventListener('click', () => { if (react) goNext(mode === 'solos' ? 'next' : 'bot'); });
$('rxMenuBtn').addEventListener('click', () => { stopReaction(); CA.go('menu'); });
$('rxReportBtn').addEventListener('click', () => reportPressed());

function endMatch(outcome, reason, opts) {
  if (!match || match.over) return;
  match.over = true;
  match.ctx.cleanup();
  $('vs').classList.add('hidden');
  if (!match.started) {
    showNoContest(opp.name + ' left before the game started. Nothing was counted.');
    return;
  }
  const online = mode === 'solos' && !opp.bot;
  const res = match.counted ? CA.applyResult(outcome) : null; // (shown right away; the server settles the real streak)
  if (online) {
    if (match.counted) {
      pairing.played++;
      if (outcome === 'win') opp.streak = 0; else if (outcome === 'lose') opp.streak++;
    }
    reportResult(match, outcome);
  }
  send({ t: 'card', card: myCard() });
  showResult(outcome, reason, res, opts);
  sound(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'draw');
  if (opp.bot && outcome === 'lose') botTalk(1400);
  if (mode === 'solos' || practiceMix) startReaction(outcome, res, opts); // react face to face, then Rematch or Next
}

function endSolo(score) {
  match.over = true;
  match.ctx.cleanup();
  const best = CA.setMathBest(score);
  sound(best ? 'win' : 'draw');
  $('stage').innerHTML =
    '<div class="result"><div class="result-badge">' + (best ? '🏆' : '🧮') + '</div><h2>' + score + ' right!</h2>' +
    '<p class="muted">' + (best ? 'New personal best!' : 'Your best is ' + CA.profile.mathBest + '.') + '</p>' +
    '<div class="row center result-btns"><button class="btn go big" data-act="again">↻ Try again</button>' +
    '<button class="btn big" data-act="settings">⚙️ Change settings</button><button class="btn ghost" data-act="menu">Menu</button></div></div>';
  wireResultButtons();
}

function showNoContest(text) {
  $('stage').innerHTML =
    '<div class="result"><div class="result-badge">👋</div><h2>Match cancelled</h2><p class="muted">' + esc(text) + '</p>' +
    '<div class="row center result-btns"><button class="btn solos-btn big" data-act="next">⚡ Next player now</button>' +
    '<button class="btn ghost" data-act="menu">Menu</button></div><p class="next-note" id="nextNote"></p></div>';
  wireResultButtons();
  autoNext('next', 2500);
}

function showResult(outcome, reason, res, opts) {
  const g = GAMES[match.gameId];
  const title = outcome === 'win' ? 'You win!' : outcome === 'lose' ? 'You lost' : "It's a draw";
  const badge = outcome === 'win' ? '🏆' : outcome === 'lose' ? '😿' : '🤝';
  const text =
    reason === 'left' ? opp.name + ' left the match, so the win is yours.'
    : reason === 'afk' ? opp.name + ' stopped playing, so the win is yours.'
    : opts && opts.text ? opts.text
    : (outcome === 'win' ? 'You beat ' : outcome === 'lose' ? 'You lost to ' : 'You tied with ') + opp.name + ' at ' + g.name + '.';
  let body;
  if (mode === 'practice') {
    body = '<div class="streak-change">🎯 Practice game: your streak and fish stay the same.</div>';
  } else if (!res) {
    body = '<div class="streak-change">🤝 ' + esc(friendlyText()) + '</div>';
  } else {
    let streakLine;
    if (outcome === 'win') {
      streakLine = '<div class="streak-change up">🔥 ' + res.before.streak + ' → <b>' + res.after.streak + '</b>' +
        (res.newBest ? ' <span class="best-tag">New best!</span>' : '') + '</div>';
    } else if (outcome === 'lose') {
      streakLine = res.before.streak > 0
        ? '<div class="streak-change down">Streak lost 😿 🔥 ' + res.before.streak + ' → <b>0</b></div>'
        : '<div class="streak-change">🔥 Streak: 0. Win the next one to start a streak!</div>';
    } else {
      streakLine = '<div class="streak-change">🔥 ' + res.after.streak + ' (a draw keeps your streak)</div>';
    }
    const tier = res.after.tier;
    const maxed = tier >= CA.PASS.length;
    const into = maxed ? CA.TIER_XP : res.after.xp - tier * CA.TIER_XP;
    body = streakLine +
      '<div class="rewards">' + (res.fish ? '<span class="reward fish">+' + res.fish + ' 🐟</span>' : '') + '<span class="reward xp">+' + res.xp + ' XP</span></div>' +
      '<div class="pass-mini"><div class="pass-mini-top"><span>🎟️ Streak Pass · Tier ' + tier + '</span><span>' +
      (maxed ? 'All tiers unlocked!' : into + ' / ' + CA.TIER_XP + ' XP') + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.round(into / CA.TIER_XP * 100) + '%"></i></div>' +
      (res.after.tier > res.before.tier ? '<a class="tier-up" href="#/pass">🎁 You reached tier ' + tier + '! Claim your reward</a>' : '') +
      '</div>';
  }
  const buttons =
    mode !== 'practice' ? '<button class="btn solos-btn big" data-act="next">⚡ Next player now</button>'
    : practiceMix ? '<button class="btn solos-btn big" data-act="bot">🎲 Next game now</button>'
    : '<button class="btn go big" data-act="again">↻ Play again</button>';
  $('stage').innerHTML =
    '<div class="result ' + outcome + '"><div class="result-badge">' + badge + '</div><h2>' + title + '</h2>' +
    '<p class="muted">' + esc(text) + '</p>' + body +
    '<div class="row center result-btns">' + buttons + '<button class="btn ghost" data-act="menu">Menu</button></div>' +
    '<p class="next-note" id="nextNote"></p></div>';
  wireResultButtons();
}

function wireResultButtons() {
  $('stage').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'next' || act === 'bot') goNext(act);
    else if (act === 'again') playAgain();
    else if (act === 'settings') CA.go('practice', { game: 'math' });
    else CA.go('menu');
  }));
}

// A short countdown on the result screen, then on to someone new (used when a match gets cancelled).
function autoNext(act, ms) {
  cancelNext();
  const wait = window.__nextMs != null ? window.__nextMs : ms; // (the tests can change this)
  const due = Date.now() + wait;
  const tick = () => {
    const note = $('nextNote');
    if (!note) { cancelNext(); return; }
    const left = due - Date.now();
    if (left > 0) {
      note.textContent = (act === 'bot' ? '🎲 Next game with a new bot in ' : '⚡ Finding you a new player in ') + Math.ceil(left / 1000) + '…';
      return;
    }
    cancelNext();
    if (document.visibilityState !== 'visible') { note.textContent = '⏸ Paused while you were away. Press the button to keep playing.'; return; }
    goNext(act);
  };
  nextTimer = setInterval(tick, 200);
  tick();
}

function cancelNext() {
  clearInterval(nextTimer);
  nextTimer = null;
}

function goNext(act) {
  cancelNext();
  stopReaction();
  if (act === 'bot') nextBot();
  else nextOpponent();
}

function playAgain() {
  if (match && match.solo) startSolo();
  else if (opp && opp.bot) nextBot();
}

function skipPressed() {
  if (mode === 'practice') { CA.go('menu'); return; }
  if (match && match.started && !match.over) {
    CA.confirmBox('Skip this match?', 'Leaving in the middle of a game counts as a loss and resets your streak.', 'Skip', () => {
      forfeitIfPlaying();
      nextOpponent();
    });
    return;
  }
  nextOpponent();
}

// keepalive: the page is closing (the report still gets to the server).
function forfeitIfPlaying(keepalive) {
  if (!match || !match.started || match.over) return;
  match.over = true;
  match.ctx.cleanup();
  if (mode === 'solos' && opp && !opp.bot) {
    if (match.counted) {
      CA.applyResult('lose');
      CA.toast('You left the match, so it counted as a loss.');
    }
    reportResult(match, 'lose', keepalive);
  }
}

function nextOpponent() {
  rememberOpponent();
  mode = 'solos';
  startSearch();
}

// Don't get matched with the same person again right away (unless nobody else turns up for a while).
function rememberOpponent() {
  if (!opp || opp.bot || !opp.id) return;
  avoidId = opp.id;
  avoidUntil = Date.now() + 120000; // (the server lifts it after 20 seconds of nobody else turning up)
  recentName = opp.name;
  recentUntil = Date.now() + (window.__recentMs != null ? window.__recentMs : 20000);
}

/* ================= RESULTS ================= */
// Both players' browsers tell the server how every game ended. It only counts a game when the two agree,
// the two players are on different internet connections, and they haven't already played 3 counted games today.

// Will the game that's starting count for streaks? (The server has the last word.)
function counts() {
  return mode === 'solos' && !!pairing && !pairing.sameNet && pairing.played < pairing.rankedLeft && !!opp && !opp.bot;
}

function friendlyText() {
  const name = opp ? opp.name : 'them';
  if (pairing && pairing.sameNet) return "Friendly game: you're on the same internet connection as " + name + ", so it doesn't change your streak.";
  return "Friendly game: you've already played " + PAIR_LIMIT + ' games with ' + name + " today that counted, so this one doesn't change your streak.";
}

function reportResult(m, outcome, keepalive) {
  const pr = pairing;
  if (!pr || !m.gameNo || !CA.token) return;
  const args = { p_token: CA.token, p_match: pr.id, p_game_no: m.gameNo, p_game: m.gameId, p_outcome: outcome };
  const name = opp ? opp.name : 'the other player';
  const attempt = n => CA.server.call('ca_report', args, { keepalive }).then(r => settled(r, m, name)).catch(err => {
    if (err.code === 'offline' && n < 3) setTimeout(() => attempt(n + 1), 1500 * n);
    else console.warn('Could not report the result:', err.message);
  });
  attempt(1);
}

function settled(r, m, name) {
  if (r.status !== 'done') { // (the other player's report is on its way: get the settled streak in a moment)
    setTimeout(() => CA.refresh(), 4000);
    return;
  }
  if (r.me) CA.setStats(r.me);
  if (r.result === 'disputed') CA.toast('You and ' + name + " reported different results, so that game didn't count.");
  else if (m.counted && !r.ranked && r.result !== 'void') {
    CA.toast(r.why === 'pair_limit' ? "You've played " + name + ' ' + PAIR_LIMIT + " times today, so that game didn't count."
      : r.why === 'same_net' ? "You're on the same internet connection as " + name + ", so that game didn't count."
      : "That game didn't count.");
  }
}

/* ================= PLAYERS ON SCREEN ================= */

function renderPlayers() {
  const p = CA.profile;
  $('meCat').innerHTML = CA.catSVG(p.equip, { label: p.name, talker: 'me' });
  $('themCat').innerHTML = opp ? CA.catSVG(opp.equip, { label: opp.name, talker: 'opp' }) : '';
  setMsg('scThemName', opp ? opp.name : '');
  updateTiles();
}

function updateTiles() {
  const human = !!opp && !opp.bot;
  const share = canShare();
  if (opp) {
    setMsg('themName', opp.name + (opp.bot ? ' 🤖' : ''));
    setMsg('themMic', human && share && !opp.gone && !opp.mic ? ' 🔇' : '');
    setMsg('themStreak', opp.bot ? '🤖 ' + practiceLevel() : '🔥 ' + opp.streak);
    $('oppDot').className = 'dot ' + (opp.bot ? 'on' : opp.gone ? 'off' : 'on');
  }
  setMsg('meStreak', mode === 'practice' ? '🎯' : '🔥 ' + CA.profile.streak);
  setMsg('meMic', CA.voice.micOn() ? '' : ' 🔇');
  $('muteThemBtn').classList.toggle('hidden', !human || !share);
  setMsg('muteThemBtn', muteThem ? '🔊 Unmute them' : '🔈 Mute them');
  if ($('unmuteBtn').classList.contains('hidden')) $('themVideo').muted = muteThem; // (stays muted until "Tap to hear them")
  setMsg('skipBtn', mode === 'practice' ? '✕ Quit' : '⏭ Skip');
  $('reportBtn').classList.toggle('hidden', !human || !!opp.blocked);
  const mic = $('micBtn');
  mic.textContent = CA.voice.micOn() ? '🎤 Mic on' : CA.voice.hasMic() ? '🔇 Mic off' : '🎤 Turn on mic';
  mic.classList.toggle('off', CA.voice.hasMic() && !CA.voice.micOn());

  // Your camera (only while the other player sees it, or against a bot) and theirs (while they show it and you
  // haven't hidden it); otherwise the cats.
  const meVideo = $('meVideo');
  const mine = myVideoShown();
  if (mine && meVideo.srcObject !== CA.voice.camera) { meVideo.srcObject = CA.voice.camera; meVideo.play().catch(() => {}); }
  if (!mine) meVideo.srcObject = null;
  meVideo.classList.toggle('hidden', !mine);
  const face = $('faceBtn');
  if (!human) {
    face.disabled = false;
    face.textContent = CA.voice.cameraOn() || CA.voice.camPending ? '🐱 Show my cat' : '📷 Show my face';
  } else {
    face.disabled = !share;
    face.textContent = !CA.canVideoChat() ? '🐱 Cats only (under 18)' : !share ? '🐱 Cats-only match' : showFace ? '🐱 Hide my face' : '📷 Show my face';
  }
  const showThem = human && share && !opp.gone && opp.face && remoteHasVideo && !hideThem;
  $('themVideo').classList.toggle('hidden', !showThem);
  $('hideThemBtn').classList.toggle('hidden', !human || !share || !opp.face);
  setMsg('hideThemBtn', hideThem ? '👀 Show their camera' : '🙈 Hide their camera');
  const note = !human ? ''
    : !CA.canVideoChat() ? "🐱 You're under 18, so other players never see or hear you: they see your cat."
    : !share ? '🐱 Cats-only match: no cameras or voices with this player.'
    : showFace ? '📷 ' + opp.name + ' can see you. Press 🐱 Hide my face any time.'
    : '🐱 ' + opp.name + ' sees your cat. Press 📷 Show my face if you want them to see you.';
  setMsg('safetyNote', note);
  $('safetyNote').classList.toggle('hidden', !note);
  syncFaceVideos();
}

/* ================= CAMERA + VOICE RULES ================= */
// Under 18: other players never see or hear you, and you never see or hear them.
// When either player is under 18, the server makes the match "cats only" for both.
// 18 and over: every new opponent sees your cat until you press 📷 Show my face. They hear your voice.

function canShare() { return CA.canVideoChat() && !!pairing && !pairing.catsOnly && !!opp && !opp.bot; }
function sendingVideo() { return canShare() && showFace && CA.voice.cameraOn(); }
function myVideoShown() { return mode === 'practice' ? CA.voice.cameraOn() : sendingVideo(); }

// The bot "meows" (moves its mouth) now and then.
let botTalkTimer = null;
function botTalk(ms) {
  clearInterval(botTalkTimer);
  const end = Date.now() + ms;
  botTalkTimer = setInterval(() => {
    const done = Date.now() > end;
    CA.setMouths('talk-opp', done ? 0 : 0.3 + Math.random() * 0.7);
    if (done) clearInterval(botTalkTimer);
  }, 110);
}

function setOppMouth(v) {
  CA.setMouths('talk-opp', v);
  clearTimeout(oppTalkTimer);
  if (v > 0) oppTalkTimer = setTimeout(() => CA.setMouths('talk-opp', 0), 600);
}

/* ================= SEARCHING ================= */

const SEARCH_TIP = $('searchTip').textContent;

function showSearch() {
  const fresh = Date.now() < recentUntil;
  $('searchCat').innerHTML = CA.catSVG(CA.profile.equip, { bg: false, label: 'You', talker: 'me' });
  setMsg('searchTitle', fresh ? 'Looking for a new player…' : 'Looking for a player…');
  setMsg('searchSub', 'Searching…');
  setMsg('searchTip', fresh
    ? 'Nobody new is searching right now. If nobody else joins soon, you will play ' + recentName + ' again.'
    : SEARCH_TIP);
  $('searchTip').classList.add('hidden');
  $('retryBtn').classList.add('hidden');
  $('searchView').classList.remove('hidden');
  searchStarted = Date.now();
  clearInterval(searchTick);
  searchTick = setInterval(updateSearch, 500);
}

function updateSearch() {
  const s = Math.floor((Date.now() - searchStarted) / 1000);
  setMsg('searchSub', 'Searching for ' + s + 's');
  if (s >= 10) $('searchTip').classList.remove('hidden');
}

function hideSearch() {
  clearInterval(searchTick);
  $('searchView').classList.add('hidden');
}

function searchFailed(text) {
  if (searching && !pairing && CA.token) CA.server.call('ca_mm_leave', { p_token: CA.token }).catch(() => {});
  searching = false;
  clearInterval(searchTick);
  releasePeer();
  setMsg('searchTitle', "Can't find players right now");
  setMsg('searchSub', text);
  $('searchTip').classList.add('hidden');
  $('retryBtn').classList.remove('hidden');
}

// Several players reported you: no Classic Games for a while (Practice mode still works).
function showBanned(until) {
  searching = false;
  clearInterval(searchTick);
  releasePeer();
  const when = until ? new Date(until) : null;
  setMsg('searchTitle', "You can't play Classic Games right now");
  setMsg('searchSub', 'Several players reported you, so you are taking a break' +
    (when && !isNaN(when) ? ' until ' + when.toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }) : '') +
    '. You can still play Practice mode.');
  setMsg('searchOnline', '');
  $('searchTip').classList.add('hidden');
  $('retryBtn').classList.add('hidden');
}

/* ================= MATCHMAKING ================= */
// 1. You open a PeerJS connection with a random id, and ask the server for a match every second or so.
// 2. The server pairs you with someone. The one who waited longer is the "host"; the other one connects to them.
// 3. The host only lets in the player the server paired them with, and picks the first game.
// Nothing here limits how many people can search at once.

function myCard() {
  const p = CA.profile;
  return { name: p.name, streak: p.streak, equip: p.equip, mic: canShare() && CA.voice.micOn(), face: sendingVideo(), cam: CA.voice.cameraOn() };
}

function readCard(c) {
  const card = c && typeof c === 'object' ? c : {};
  const equip = {};
  if (card.equip && typeof card.equip === 'object') {
    for (const s of CA.SLOTS) {
      const id = card.equip[s.id];
      if (typeof id === 'string' && CA.ITEM[id] && CA.ITEM[id].slot === s.id) equip[s.id] = id;
    }
  }
  return {
    name: CA.cleanName(card.name) || 'Player', streak: Math.max(0, Math.floor(Number(card.streak) || 0)), equip,
    mic: !!card.mic, face: !!card.face, cam: !!card.cam, bot: false, gone: false,
  };
}

function randomId() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, x => x.toString(36).padStart(2, '0')).join('');
}

function startSearch() {
  hangUp();
  const gen = ++searchGen; // (a new search: anything still running from an older one stops)
  opp = null;
  mode = 'solos';
  practiceMix = false;
  searching = true;
  CA.voice.setInGame(true); // start the camera now so it's ready when someone is found
  CA.showScreen('scr-play');
  $('matchView').classList.remove('solo-run');
  $('stage').innerHTML = '';
  setMsg('searchOnline', '');
  showSearch();
  const p = CA.profile;
  if (p.bannedUntil && new Date(p.bannedUntil) > new Date()) { showBanned(p.bannedUntil); return; }
  if (!CA.server.configured) { searchFailed(CA.server.message('not_configured')); return; }
  openPeer(gen)
    .then(() => { if (searching && gen === searchGen) pollLoop(gen); })
    .catch(err => {
      if (!searching || gen !== searchGen) return;
      console.warn('PeerJS failed:', err);
      searchFailed("Can't reach the video connection server. Check your internet connection.");
    });
}

function openPeer(gen) {
  return new Promise((resolve, reject) => {
    const p = new Peer(PEER_PREFIX + randomId(), PEER_OPTS);
    let settled = false;
    p.on('open', () => {
      if (settled) return;
      settled = true;
      if (!searching || gen !== searchGen) { p.destroy(); reject(new Error('cancelled')); return; }
      peer = p;
      wirePeer(p);
      resolve();
    });
    p.on('error', err => {
      if (settled) return;
      settled = true;
      try { p.destroy(); } catch (e) { /* ignore */ }
      reject(err);
    });
  });
}

// (After you move on, your old peer lingers for a moment before it's destroyed. It must not start a new match:
// that match would die the moment the peer goes. So only the current peer takes connections and calls.)
function wirePeer(p) {
  p.on('connection', c => { if (peer === p) onIncoming(c, p); else { try { c.close(); } catch (e) { /* ignore */ } } });
  p.on('call', call => { if (peer === p) onIncomingCall(call); else { try { call.close(); } catch (e) { /* ignore */ } } });
  p.on('error', err => {
    if (peer !== p || err.type === 'peer-unavailable') return; // (the player we were paired with just left: handled in knock)
    console.warn('PeerJS error:', err.type, err);
    if (searching && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
      searchFailed('Lost the connection to the video connection server.');
    }
  });
  p.on('disconnected', () => {
    setTimeout(() => { if (peer === p && !p.destroyed && p.disconnected) p.reconnect(); }, 1000);
  });
}

async function pollLoop(gen) {
  let fails = 0;
  while (searching && !conn && gen === searchGen) {
    if (!pairing) {
      try {
        await pollOnce(gen);
        fails = 0;
      } catch (err) {
        if (!searching || gen !== searchGen) return;
        if (err.code === 'not_logged_in') { CA.sessionLost(); return; }
        if (++fails >= 4) { searchFailed(err.message); return; }
      }
    }
    await sleep(pairing ? 400 : POLL_MS + Math.random() * 500);
  }
}

// One question to the server at a time (the loop and an early knock can both ask).
function pollOnce(gen) {
  if (!pollInFlight) {
    const p = peer;
    if (!p) return Promise.resolve(null);
    const avoid = Date.now() < avoidUntil ? avoidId : null;
    pollInFlight = CA.server.call('ca_mm_poll', { p_token: CA.token, p_peer: p.id, p_avoid: avoid })
      .then(r => { gotPoll(r, gen, p); return r; })
      .finally(() => { pollInFlight = null; });
  }
  return pollInFlight;
}

function gotPoll(r, gen, p) {
  if (!r || !searching || gen !== searchGen || conn || pairing || peer !== p) return;
  if (r.banned) { showBanned(r.until); return; }
  if (r.match) { startPairing(r.match); return; }
  if (r.online) setMsg('searchOnline', '🟢 ' + r.online + ' player' + (r.online === 1 ? '' : 's') + ' online now');
}

function startPairing(m) {
  pairing = {
    id: m.id, role: m.role, opp: m.opp || {}, oppPeer: m.opp_peer, catsOnly: !!m.cats_only, sameNet: !!m.same_net,
    rankedLeft: Math.max(0, m.ranked_left | 0), played: 0, gameNo: 0, timer: null, conn: null,
  };
  setMsg('searchTitle', 'Found ' + (pairing.opp.name || 'a player') + '! Connecting…');
  if (m.role === 'guest') knock(pairing);
  else pairing.timer = setTimeout(() => { if (!conn) pairingFailed(pairing); }, 15000); // (they connect to us)
}

// Their browsers couldn't connect: tell the server, and look again.
function pairingFailed(pr) {
  if (!pr || pairing !== pr || pr.live) return; // (once the match has started, a closed connection is handled by onConnClosed)
  clearTimeout(pr.timer);
  pairing = null;
  if (pr.conn && pr.conn !== conn) { try { pr.conn.close(); } catch (e) { /* ignore */ } }
  CA.server.call('ca_mm_fail', { p_token: CA.token, p_match: pr.id }).catch(() => {});
  if (searching) setMsg('searchTitle', 'Looking for a player…');
}

// The guest connects to the host the server paired us with.
function knock(pr) {
  const p = peer;
  if (!p || p.destroyed) { pairingFailed(pr); return; }
  let done = false;
  let c = null;
  const onErr = err => { if (err.type === 'peer-unavailable' && String(err.message || '').includes(pr.oppPeer)) giveUp(); };
  const timer = setTimeout(giveUp, 12000);
  function finish() {
    done = true;
    clearTimeout(timer);
    p.off('error', onErr);
  }
  function giveUp() {
    if (done) return;
    finish();
    if (c) { try { c.close(); } catch (e) { /* ignore */ } }
    pairingFailed(pr);
  }
  p.on('error', onErr);
  try { c = p.connect(pr.oppPeer, CONN_OPTS); } catch (e) { giveUp(); return; }
  if (!c) { giveUp(); return; }
  pr.conn = c;
  c.on('open', () => { if (!done) c.send({ t: 'hi', v: PROTOCOL, match: pr.id, card: myCard() }); });
  c.on('data', msg => {
    if (conn === c) { onNet(msg); return; }
    if (done || !msg) return;
    if (msg.t === 'busy') { giveUp(); return; }
    if (msg.t === 'welcome' && msg.match === pr.id && GAMES[msg.game]) {
      if (pairing !== pr || !searching || conn || peer !== p) { giveUp(); return; }
      finish();
      c.send({ t: 'go' });
      commit(c, false, readCard(msg.card), msg.game, msg.seed >>> 0);
    }
  });
  c.on('close', () => { if (conn === c) onConnClosed(); else giveUp(); });
  c.on('error', () => giveUp());
}

// The host lets in only the player the server paired it with.
function onIncoming(c, p) {
  let greeted = false;
  c.on('data', async msg => {
    if (conn === c) { onNet(msg); return; }
    if (!msg) return;
    if (!greeted) {
      if (msg.t !== 'hi') return;
      greeted = true;
      // (They can find us a moment before our own next question to the server tells us about them.)
      if (!pairing && searching && peer === p) await pollOnce(searchGen).catch(() => null);
      const pr = pairing;
      if (peer !== p || !searching || conn || !pr || pr.role !== 'host' || pr.conn || msg.match !== pr.id ||
          c.peer !== pr.oppPeer || msg.v !== PROTOCOL) {
        try { c.send({ t: 'busy' }); } catch (e) { /* ignore */ }
        setTimeout(() => { try { c.close(); } catch (e) { /* ignore */ } }, 400);
        return;
      }
      pr.conn = c;
      pr.card = readCard(msg.card);
      pr.game = pickGame({ camera: CA.voice.cameraOn() && pr.card.cam });
      pr.seed = randSeed();
      c.send({ t: 'welcome', match: pr.id, card: myCard(), game: pr.game, seed: pr.seed });
      return;
    }
    const pr = pairing;
    if (!pr || pr.conn !== c || msg.t !== 'go') return;
    if (peer !== p || !searching || conn) { try { c.send({ t: 'bye' }); c.close(); } catch (e) { /* ignore */ } return; }
    commit(c, true, pr.card, pr.game, pr.seed);
  });
  c.on('close', () => {
    if (conn === c) onConnClosed();
    else if (pairing && pairing.conn === c) pairingFailed(pairing);
  });
  c.on('error', err => console.warn('Connection error:', err));
}

function commit(c, asHost, card, game, seed) {
  clearTimeout(pairing.timer);
  pairing.live = true;
  searching = false;
  hideSearch();
  conn = c;
  isHost = asHost;
  // (Their name and streak come from the server, so nobody can pretend to be someone else.)
  opp = Object.assign(card, { id: pairing.opp.id, name: pairing.opp.name || card.name, streak: pairing.opp.streak | 0 });
  showFace = false; // every new opponent starts out seeing your cat
  muteThem = false;
  hideThem = false;
  lastSeen = Date.now();
  startHeartbeat();
  startTalking();
  callOpponent();
  sendMediaState(); // the camera may have finished starting while we were matching
  sound('found');
  beginMatch(game, seed);
}

function sendMediaState() { send({ t: 'media', mic: canShare() && CA.voice.micOn(), face: sendingVideo(), cam: CA.voice.cameraOn() }); }

function send(msg) {
  if (conn && conn.open) {
    try { conn.send(msg); } catch (e) { console.warn('Send failed:', e); }
  }
}

function onNet(msg) {
  lastSeen = Date.now();
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'ping':
      return;
    case 'talk':
      if (Number.isFinite(msg.v)) setOppMouth(Math.max(0, Math.min(1, msg.v)));
      return;
    case 'g':
      if (match && !match.over) match.ctx.deliver(msg.m);
      return;
    case 'media':
      if (opp) { opp.mic = !!msg.mic; opp.face = !!msg.face; opp.cam = !!msg.cam; updateTiles(); }
      return;
    case 'again': // they pressed Rematch
      if (react && opp && !opp.blocked) {
        react.theirs = true;
        setMsg('rxNote', opp.name + ' wants a rematch! 🔁');
        if (react.mine) setMsg('rematchBtn', '🔁 Starting…');
        sound('notify');
        maybeRematch();
      }
      return;
    case 'start': // both pressed Rematch, and the host picked the next game
      if (!isHost && GAMES[msg.game] && react && react.mine && pairing) {
        if (msg.no > 0) pairing.gameNo = (msg.no | 0) - 1;
        beginMatch(msg.game, msg.seed >>> 0);
      }
      return;
    case 'card': // (their cat's outfit; their name and streak come from the server)
      if (opp) {
        opp.equip = readCard(msg.card).equip;
        updateTiles();
      }
      return;
    case 'bye':
      onConnClosed();
      return;
  }
}

function startHeartbeat() {
  clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    if (!conn || !conn.open) return;
    send({ t: 'ping' });
    if (Date.now() - lastSeen > 45000) onConnClosed();
  }, 3000);
}

// Send how loud you are (a few times a second) so your cat's mouth moves on their screen too.
function startTalking() {
  stopTalking();
  talkOff = CA.voice.onLevel(v => {
    const q = Math.round(v * 10) / 10;
    const now = performance.now();
    if (q === lastTalk || (now - lastTalkAt < 70 && q !== 0)) return;
    lastTalk = q;
    lastTalkAt = now;
    send({ t: 'talk', v: q });
  });
}

function stopTalking() {
  if (talkOff) { talkOff(); talkOff = null; }
  lastTalk = -1;
}

function onConnClosed() {
  if (!conn && (!opp || opp.gone)) return;
  const c = conn;
  conn = null;
  clearInterval(pingTimer);
  stopTalking();
  closeCalls();
  setOppMouth(0);
  try { if (c) c.close(); } catch (e) { /* ignore */ }
  if (!opp || opp.bot || opp.gone) return;
  opp.gone = true;
  updateTiles();
  if (match && !match.over) endMatch('win', 'left');
  else if (react) { // they pressed Next: move on to someone new right away
    CA.toast(opp.name + ' moved on to someone new.');
    goNext('next');
  }
}

// Leave the current opponent (or stop searching).
function hangUp() {
  cancelNext();
  stopReaction();
  if (searching && !conn && CA.token) {
    if (pairing) pairingFailed(pairing);
    else CA.server.call('ca_mm_leave', { p_token: CA.token }).catch(() => {});
  }
  searching = false;
  if (pairing) clearTimeout(pairing.timer);
  pairing = null;
  clearInterval(pingTimer);
  stopTalking();
  if (match) { match.over = true; match.ctx.cleanup(); }
  $('vs').classList.add('hidden');
  if (conn && conn.open) { try { conn.send({ t: 'bye' }); } catch (e) { /* ignore */ } }
  const c = conn;
  conn = null;
  if (opp) opp.gone = true;
  closeCalls();
  releasePeer(c);
}

function releasePeer(c) {
  const p = peer;
  peer = null;
  setTimeout(() => {
    try { if (c) c.close(); } catch (e) { /* ignore */ }
    try { if (p) p.destroy(); } catch (e) { /* ignore */ }
  }, 250);
}

/* ================= REPORT + BLOCK ================= */

function reportPressed() {
  if (!opp || opp.bot || !pairing || opp.blocked) return;
  const target = opp;
  const pr = pairing;
  const pick = reason => () => sendReport(target, pr, reason);
  CA.modal({
    icon: '🚩', title: 'Report ' + target.name + '?', stack: true,
    text: "Pick what happened. Their camera and voice are hidden right away, and you won't be matched with " + target.name + ' again.',
    buttons: [
      { label: '🔞 Showed or said something sexual', fn: pick('nudity') },
      { label: '🧒 Looks younger than 13', fn: pick('young') },
      { label: '😠 Bullying, hate or threats', fn: pick('hate') },
      { label: '🃏 Cheating', fn: pick('cheating') },
      { label: '❓ Something else', fn: pick('other') },
      { label: '🚫 Just block them', fn: () => blockOnly(target) },
      { label: 'Cancel' },
    ],
  });
}

// Right away: hide their camera, mute them, and no rematches. (A game that's going on can still be finished, or skipped.)
function protectFrom(target) {
  target.blocked = true;
  if (opp !== target) return;
  hideThem = true;
  muteThem = true;
  updateTiles();
  if (react) startReactionAgain();
}

async function sendReport(target, pr, reason) {
  protectFrom(target);
  try {
    await CA.server.call('ca_report_player', { p_token: CA.token, p_match: pr.id, p_reason: reason });
    CA.toast("Thanks for telling us. You won't be matched with " + target.name + ' again.');
  } catch (err) {
    CA.toast(err.message);
  }
}

async function blockOnly(target) {
  protectFrom(target);
  try {
    await CA.server.call('ca_block', { p_token: CA.token, p_player: target.id });
    CA.toast("Blocked. You won't be matched with " + target.name + ' again.');
  } catch (err) {
    CA.toast(err.message);
  }
}

// (After a report on the reaction screen: no rematch, and on to someone new.)
function startReactionAgain() {
  $('rematchBtn').disabled = true;
  $('rxReportBtn').classList.add('hidden');
  setMsg('rxNote', 'On to someone new…');
  setTimeout(() => { if (react) goNext('next'); }, 1200);
}

/* ================= VOICE + CAMERA ================= */

function callSig() { return (canShare() && CA.voice.hasMic() ? 'a' : '') + (sendingVideo() ? 'v' : ''); }

// Sends your microphone (and camera, if you pressed 📷 Show my face). Called again whenever either one starts or stops.
function callOpponent() {
  const stream = canShare() ? CA.voice.outgoing({ video: showFace }) : null;
  if (outCall) { const o = outCall; outCall = null; o.close(); }
  lastCallSig = callSig();
  if (!peer || !conn || !conn.open || !stream || !opp || opp.bot) return;
  const call = peer.call(conn.peer, stream);
  if (!call) return;
  outCall = call;
  call.on('close', () => { if (outCall === call) outCall = null; });
  call.on('error', err => console.warn('Outgoing call error:', err));
}

function onIncomingCall(call) {
  // (Under 18, or a cats-only match: their voice and camera are never taken in, whatever their browser sends.)
  if (!conn || call.peer !== conn.peer || !canShare()) { call.close(); return; }
  if (inCall) { const o = inCall; inCall = null; o.close(); }
  inCall = call;
  call.on('stream', stream => {
    if (inCall !== call) return;
    remoteHasVideo = stream.getVideoTracks().length > 0;
    const v = $('themVideo');
    v.srcObject = stream;
    v.muted = muteThem;
    const p = v.play();
    if (p && p.catch) {
      p.then(() => $('unmuteBtn').classList.add('hidden')).catch(() => {
        // the browser blocked sound until the page is clicked: play muted and offer a button
        v.muted = true;
        v.play().catch(() => {});
        $('unmuteBtn').classList.remove('hidden');
      });
    }
    updateTiles();
  });
  call.on('close', () => {
    if (inCall !== call) return;
    inCall = null;
    remoteHasVideo = false;
    $('themVideo').srcObject = null;
    updateTiles();
  });
  call.on('error', err => console.warn('Incoming call error:', err));
  call.answer(); // receive only: my own voice and camera go out on my own call
}

function closeCalls() {
  for (const c of [outCall, inCall]) if (c) { try { c.close(); } catch (e) { /* ignore */ } }
  outCall = inCall = null;
  remoteHasVideo = false;
  $('themVideo').srcObject = null;
  $('unmuteBtn').classList.add('hidden');
}

/* ================= PRACTICE ================= */

function startPractice(game) {
  hangUp();
  mode = 'practice';
  practiceMix = game === 'mix';
  practiceGame = practiceMix ? null : game;
  isHost = true;
  nextBot();
}

// A new bot (a different one from last time) and, in "Classic mode vs bots", a new random game.
function nextBot() {
  const last = opp && opp.bot ? opp.name : '';
  const names = BOT_NAMES.filter(n => n !== last);
  opp = {
    name: names[Math.floor(Math.random() * names.length)], bot: true, level: BOT_LEVEL[practiceLevel()] || 5,
    equip: randomOutfit(), streak: 0, mic: true, device: '', gone: false,
  };
  beginMatch(practiceMix ? pickGame({ camera: CA.voice.cameraOn() }) : practiceGame, randSeed());
}

function startSolo() {
  hangUp();
  mode = 'practice';
  practiceMix = false;
  practiceGame = 'math';
  opp = null;
  beginMatch('math', randSeed(), { solo: true, math: mathSettings });
}

function randomOutfit() {
  const pick = slot => { const list = CA.ITEMS.filter(i => i.slot === slot); return list[Math.floor(Math.random() * list.length)].id; };
  const eq = { skin: pick('skin'), bg: pick('bg') };
  if (Math.random() < 0.6) eq.hat = pick('hat');
  if (Math.random() < 0.45) eq.eyes = pick('eyes');
  if (Math.random() < 0.6) eq.shirt = pick('shirt');
  if (Math.random() < 0.3) eq.neck = pick('neck');
  if (Math.random() < 0.25) eq.hand = pick('hand');
  return eq;
}

const NK = ['Add', 'Sub', 'Mul', 'Div'];

function showMathSettings() {
  hangUp();
  mode = 'practice';
  practiceMix = false;
  CA.voice.setInGame(false); // not playing yet: the camera waits for Start
  CA.showScreen('scr-practice');
  setMsg('nkBest', CA.profile.mathBest);
  setMsg('nkMsg', '');
}

function readMathSettings() {
  const num = id => Math.floor(Number($(id).value));
  const ops = NK.map(k => ({
    kind: k.toLowerCase(), on: $('nk' + k).checked,
    a1: num('nk' + k + 'A1'), a2: num('nk' + k + 'A2'), b1: num('nk' + k + 'B1'), b2: num('nk' + k + 'B2'),
  }));
  if (!ops.some(o => o.on)) return 'Tick at least one kind of problem.';
  for (const o of ops.filter(x => x.on)) {
    if (![o.a1, o.a2, o.b1, o.b2].every(n => Number.isFinite(n) && n >= 0 && n <= 9999)) return 'Use whole numbers from 0 to 9999.';
    if (o.a1 > o.a2 || o.b1 > o.b2) return 'In each "from … to …", the first number must be the smaller one.';
    if (o.kind === 'div' && o.a1 < 1) return "Division can't use 0 (you can't divide by zero).";
  }
  const duration = num('nkTime');
  if (!Number.isFinite(duration) || duration < 10 || duration > 600) return 'Pick a duration from 10 to 600 seconds.';
  return { duration, ops };
}

$('nkStart').addEventListener('click', () => {
  const s = readMathSettings();
  if (typeof s === 'string') { setMsg('nkMsg', s); $('nkMsg').className = 'msg center error'; return; }
  mathSettings = s;
  startSolo();
});

/* ================= WIRING ================= */

$('cancelSearchBtn').addEventListener('click', () => CA.go('menu'));
$('retryBtn').addEventListener('click', startSearch);
$('skipBtn').addEventListener('click', skipPressed);
$('micBtn').addEventListener('click', async () => {
  if (CA.voice.micOn()) CA.voice.setMic(false);
  else if (CA.voice.hasMic()) CA.voice.setMic(true);
  else if (await CA.voice.startMic()) CA.voice.setChoice('on');
  else CA.toast('The microphone is blocked. Allow it with the lock icon in the address bar.');
});
$('muteThemBtn').addEventListener('click', () => { muteThem = !muteThem; updateTiles(); });
$('faceBtn').addEventListener('click', async () => {
  if (!opp || opp.bot) { // against a bot: just your camera on or off
    const on = !(CA.voice.cameraOn() || CA.voice.camPending);
    CA.voice.setCamWanted(on);
    if (!on) CA.toast('Now showing your cat. 🐱');
    return;
  }
  if (!canShare()) return;
  if (showFace) {
    showFace = false;
    CA.toast('Now ' + opp.name + ' sees your cat. 🐱');
  } else {
    if (!CA.voice.cameraOn()) await CA.voice.setCamWanted(true);
    if (!CA.voice.cameraOn() || !canShare()) { updateTiles(); return; } // (the camera is blocked: that has its own message)
    showFace = true;
    CA.toast(opp.name + ' can see you now. 📷');
  }
  mediaChanged();
});
$('reportBtn').addEventListener('click', () => reportPressed());
$('hideThemBtn').addEventListener('click', () => { hideThem = !hideThem; updateTiles(); });
function unmuteThem() {
  const v = $('themVideo');
  $('unmuteBtn').classList.add('hidden');
  v.muted = muteThem;
  v.play().catch(() => { // still blocked: keep their video playing without sound
    v.muted = true;
    v.play().catch(() => {});
    $('unmuteBtn').classList.remove('hidden');
  });
}
$('unmuteBtn').addEventListener('click', unmuteThem);
// Any click or key press is the "tap" the browser wants before it plays their voice.
['pointerdown', 'pointerup', 'keydown'].forEach(type => window.addEventListener(type, () => {
  if (!$('unmuteBtn').classList.contains('hidden')) unmuteThem();
}, { capture: true }));

function mediaChanged() {
  if (CA.route !== 'solos' && CA.route !== 'practice') return;
  updateTiles();
  if (conn && conn.open && opp && !opp.bot) {
    sendMediaState();
    if (callSig() !== lastCallSig) callOpponent(); // the microphone or camera just started or stopped
  }
}
window.addEventListener('ca:media', mediaChanged);
window.addEventListener('ca:change', () => {
  if ((CA.route === 'solos' || CA.route === 'practice') && CA.profile) setMsg('meStreak', mode === 'practice' ? '🎯' : '🔥 ' + CA.profile.streak);
});
window.addEventListener('pagehide', () => {
  forfeitIfPlaying(true); // closing the page in the middle of a game counts as a loss, same as pressing Skip
  if (searching && !conn && CA.token) CA.server.call('ca_mm_leave', { p_token: CA.token }, { keepalive: true }).catch(() => {});
  if (conn && conn.open) { try { conn.send({ t: 'bye' }); } catch (e) { /* ignore */ } }
  if (peer) { try { peer.destroy(); } catch (e) { /* ignore */ } }
});

const screenDef = {
  leave() {
    forfeitIfPlaying();
    rememberOpponent();
    hangUp();
    hideSearch();
    opp = null;
    match = null;
    clearInterval(botTalkTimer);
    clearTimeout(oppTalkTimer);
    CA.setMouths('talk-opp', 0);
    CA.voice.setInGame(false); // camera off outside games
  },
  canLeave(proceed) {
    if (mode !== 'solos' || !match || !match.started || match.over) return true;
    CA.confirmBox('Leave this match?', 'Leaving in the middle of a game counts as a loss and resets your streak.', 'Leave', () => {
      forfeitIfPlaying();
      proceed();
    });
    return false;
  },
};

// The first time you look for strangers, explain how cameras and reports work.
const TIP_KEY = 'camarcade-safety-tip-v2';
function enterSolos() {
  let seen = false;
  try { seen = localStorage.getItem(TIP_KEY) === '1'; } catch (e) { /* ignore */ }
  if (seen) { startSearch(); return; }
  CA.showScreen('scr-play');
  showSearch();
  clearInterval(searchTick); // nothing runs until you answer
  setMsg('searchSub', '');
  const adult = CA.canVideoChat();
  CA.modal({
    icon: '🐱', locked: true,
    title: adult ? 'Everyone starts out as a cat' : 'You play as your cat',
    text: (adult
      ? "Classic Games matches you with people you don't know. Each new player sees your cat. Press 📷 Show my face if you want that player to see you, and they can hear you. "
      : "Classic Games matches you with people you don't know. You're under 18, so they never see you or hear you: they see your cat. ") +
      'Never share personal things like your real name, school or address. Press 🚩 Report if someone is mean or rude, and ⏭ Skip to leave any match.',
    buttons: [
      { label: 'Got it, find a match', primary: true, fn: () => { rememberTip(); startSearch(); } },
      { label: 'Cancel', fn: () => CA.go('menu') },
    ],
  });
}

function rememberTip() { try { localStorage.setItem(TIP_KEY, '1'); } catch (e) { /* ignore */ } }

CA.register('solos', Object.assign({ enter: enterSolos }, screenDef));
CA.register('practice', Object.assign({
  enter(params) {
    const game = params.get('game');
    if (game === 'math') showMathSettings();
    else if (GAMES[game] || game === 'mix') startPractice(game);
    else CA.go('menu');
  },
}, screenDef));

})();
