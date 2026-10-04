/* Classic Games: Simon Says. Simon, a cat with a very deep voice (and a top hat and a monocle), calls out poses.
   Copy the pose, but ONLY when he starts with "Simon says"! Your camera checks your pose with the same pose detector
   as Pose Match, and lines show what it sees, on your camera and on theirs. Every command comes a little faster, and
   Simon talks faster too. The first player to mess up loses: doing a pose Simon didn't say, or not doing one he did
   in time. (If you both mess up on the same command, it keeps going.)

   Online, each app checks its own player and sends its result for every command, plus its body points ten times a
   second, so the lines show on the other player's camera too. Simon talks with the browser's built-in voice. */
(() => {
'use strict';

const { $, setMsg, esc, sound, gauss, startTimer, stopTimer, resetTimer, roundMatch, L, skillOf } = CA.games.kit;
const { loadDetector } = CA.games.pose;

const HOLD = 250;            // ms to hold a pose Simon said
const TRICK_HOLD = 600;      // ms of doing a pose Simon didn't say before it counts (so just passing through it is fine)
const PITCH = 0.25;          // Simon's deep voice (1 is a normal voice)
const COMMANDS = 80;         // (if nobody has messed up after this many, it's a draw)
const BOT_MOVE = 320;        // how long the bot's cat takes to get into a pose
const SEND_MS = 100;         // how often your body points go to the other player
const CW = 640, CH = 480;    // the canvases the lines are drawn on (4:3, like the cameras)
const SIMON = { skin: 'skin-gray', hat: 'hat-tophat', eyes: 'eyes-monocle', shirt: 'shirt-tux' };
const INTRO = 'I am Simon! Do what Simon says, but only if Simon says it!';
const SPEEDS = ['🐢', '🐈', '🐇', '🐆', '🚀'];

// It all speeds up until command 17, and Simon gives you a little less time after that.
const speed = r => Math.min(1, (r - 1) / 16);                  // 0 at the start, 1 from command 17 on
const level = r => 1 + Math.floor((r - 1) / 4);                // the speed meter: 1, 2, 3…
const rateOf = r => 0.95 + 0.55 * speed(r);                    // how fast Simon talks
const actOf = r => (r <= 17 ? 4000 - 150 * (r - 1) : Math.max(1300, 1600 - 30 * (r - 17))); // time to do it once he stops
const pauseOf = r => Math.max(800, 1400 - 40 * (r - 1));       // the short break after each command

/* ---------- the poses ---------- */

// Body points (MediaPipe numbering): 0 nose, 11/12 left/right shoulder, 13/14 elbows, 15/16 wrists, 23/24 hips.
// tall: the camera picture's height ÷ its width. (The detector gives x across the picture and y down it, both from 0
// to 1, so y is scaled by this to measure both the same way.) Everything is measured in shoulder widths, so it works
// near or far from the camera. Hands count as seen even when the detector is only fairly sure, and hands raised past
// the top of the picture count too (the detector still guesses where they are).
function bodyOf(p, tall) {
  if (!p) return null;
  const pt = (i, sure) => {
    const q = p[i];
    if (!q) return null;
    const v = q.visibility == null ? 1 : q.visibility;
    return { x: q.x, y: q.y * tall, seen: v > sure || (i >= 15 && q.y < 0.03 && v > 0.05) };
  };
  const n = pt(0, 0.4), ls = pt(11, 0.4), rs = pt(12, 0.4);
  if (!seen(n) || !seen(ls) || !seen(rs)) return null;
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (sw < 0.03) return null;
  return { n, ls, rs, lw: pt(15, 0.3), rw: pt(16, 0.3), sw, cx: (ls.x + rs.x) / 2, sy: (ls.y + rs.y) / 2 };
}
const seen = w => !!w && w.seen;
const hi = (b, w) => (b.n.y - w.y) / b.sw;               // how far a hand is above the nose
const sh = (b, w) => (b.sy - w.y) / b.sw;                // above the shoulders
const out = (b, w) => Math.abs(w.x - b.cx) / b.sw;       // out to the side
const dist = (b, a, c) => Math.hypot(a.x - c.x, a.y - c.y) / b.sw;
const both = (b, f) => seen(b.lw) && seen(b.rw) && f(b.lw) && f(b.rw);
const down = (b, w) => !w || !w.seen || sh(b, w) < -0.1; // (a hand out of sight counts as down)
const near = (b, w, s) => dist(b, w, s) < 0.85;

// The checks are generous, but no body can match two of these at once, so Simon can't catch you out for the pose
// you're already doing.
const POSES = {
  v: { label: 'Arms up in a V', say: 'put your arms up in a big V', arms: 'M40,38L22,8M60,38L78,8',
    test: b => both(b, w => hi(b, w) > 0.45) && Math.abs(b.lw.x - b.rw.x) / b.sw > 1.6 },
  circle: { label: 'Circle over your head', say: 'make a circle over your head', arms: 'M40,38L27,18L48,4M60,38L73,18L52,4',
    test: b => both(b, w => hi(b, w) > 0.6) && dist(b, b.lw, b.rw) < 1.1 },
  head: { label: 'Hands on your head', say: 'put your hands on your head', arms: 'M40,38L27,26L43,13M60,38L73,26L57,13',
    test: b => both(b, w => hi(b, w) > -0.25 && hi(b, w) <= 0.6 && out(b, w) < 0.6) && (dist(b, b.lw, b.rw) >= 0.5 || both(b, w => hi(b, w) > 0)) },
  one: { label: 'One hand up', say: 'raise one hand', arms: 'M40,38L35,64M60,38L64,6',
    test: b => (seen(b.lw) && hi(b, b.lw) > 0.45 && down(b, b.rw)) || (seen(b.rw) && hi(b, b.rw) > 0.45 && down(b, b.lw)) },
  t: { label: 'Arms out like a T', say: 'stretch your arms out like a T', arms: 'M40,38L10,38M60,38L90,38',
    test: b => both(b, w => Math.abs(sh(b, w)) < 0.5 && out(b, w) > 1) },
  muscles: { label: 'Muscles', say: 'show me your muscles', arms: 'M40,38L22,38L22,20M60,38L78,38L78,20',
    test: b => both(b, w => sh(b, w) >= 0.5 && hi(b, w) <= 0.45 && out(b, w) >= 0.6) },
  together: { label: 'Hands together', say: 'put your hands together', arms: 'M40,38L33,54L50,46M60,38L67,54L50,46',
    test: b => both(b, w => hi(b, w) < 0 && hi(b, w) > -1.8 && out(b, w) < 0.8) && dist(b, b.lw, b.rw) < 0.4 },
  shoulders: { label: 'Hands on your shoulders', say: 'put your hands on your shoulders', arms: 'M40,38L33,56L42,40M60,38L67,56L58,40',
    test: b => both(b, w => sh(b, w) < 0.2 && out(b, w) < 0.9) && dist(b, b.lw, b.rw) >= 0.4 &&
      ((near(b, b.lw, b.ls) && near(b, b.rw, b.rs)) || (near(b, b.lw, b.rs) && near(b, b.rw, b.ls))) },
};
const IDS = Object.keys(POSES);
const poseOf = b => (b && IDS.find(k => POSES[k].test(b))) || null;
// Poses that a sloppy version of the other one can pass for (like a low circle and hands on your head), so Simon never
// tricks you with one of them right after saying the other for real.
const NEAR = {
  circle: ['head', 'v'], head: ['circle', 'muscles', 'together', 'shoulders'], v: ['circle', 'muscles', 'one'], one: ['v'],
  muscles: ['v', 't', 'head'], t: ['muscles', 'shoulders'], shoulders: ['together', 't', 'head'], together: ['shoulders', 'head'],
};

function figure(id) {
  return '<svg class="sm-fig" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="22" r="9"/>' +
    '<path d="M50,31V70M50,70L39,96M50,70L61,96M40,38H60' + POSES[id].arms + '"/></svg><small>' + POSES[id].label + '</small>';
}

// Made-up body points for each pose (they move the bot's cat, and the tests use them too).
const FAKE = { // [left wrist, right wrist, left elbow, right elbow] as [x, y] in a 4:3 camera picture
  rest: [[0.63, 0.82], [0.37, 0.82], [0.62, 0.64], [0.38, 0.64]],
  v: [[0.79, 0.09], [0.21, 0.09], [0.7, 0.27], [0.3, 0.27]],
  circle: [[0.53, 0.06], [0.47, 0.06], [0.66, 0.2], [0.34, 0.2]],
  head: [[0.56, 0.2], [0.44, 0.2], [0.72, 0.28], [0.28, 0.28]],
  one: [[0.63, 0.82], [0.36, 0.1], [0.62, 0.64], [0.37, 0.27]],
  t: [[0.93, 0.46], [0.07, 0.46], [0.77, 0.455], [0.23, 0.455]],
  muscles: [[0.76, 0.25], [0.24, 0.25], [0.78, 0.45], [0.22, 0.45]],
  together: [[0.51, 0.6], [0.49, 0.6], [0.64, 0.66], [0.36, 0.66]],
  shoulders: [[0.57, 0.48], [0.43, 0.48], [0.66, 0.66], [0.34, 0.66]],
};
function fakeBody(name) {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, visibility: 0.9 }));
  const set = (i, q) => { p[i] = { x: q[0], y: q[1], visibility: 0.99 }; };
  set(0, [0.5, 0.3]); set(11, [0.6, 0.45]); set(12, [0.4, 0.45]); set(23, [0.57, 0.85]); set(24, [0.43, 0.85]);
  const f = FAKE[name] || FAKE.rest;
  set(15, f[0]); set(16, f[1]); set(13, f[2]); set(14, f[3]);
  return p;
}

/* ---------- the commands ---------- */

const cap = s => s[0].toUpperCase() + s.slice(1);
function commandText(id, says, front) {
  if (says) return 'Simon says, ' + POSES[id].say + '!';
  if (!front) return cap(POSES[id].say) + '!';
  return front + (/!\s*$/.test(front) ? cap(POSES[id].say) : POSES[id].say) + '!';
}

// Both players get the same commands (from the match's shared random numbers). Simon never asks for the pose you're
// already doing, and his tricks (no "Simon says") are never the pose he just said for real, or one near it.
function makeCommands(rng) {
  const forced = window.__simonCmds || []; // (the tests can pick the commands: [{ pose, says }, …])
  const list = [];
  let real = '', trick = '';
  for (let r = 1; r <= COMMANDS; r++) {
    const prevTrick = list.length > 0 && !list[list.length - 1].says;
    let says = r <= 2 || rng() >= (prevTrick ? 0.18 : !trick && r >= 4 ? 0.6 : 0.3); // (the first trick comes soon)
    const ok = IDS.filter(k => k !== real && (says || (k !== trick && !(NEAR[real] || []).includes(k))));
    let id = ok[Math.floor(rng() * ok.length)];
    const fronts = r < 6 ? [''] : r < 10 ? ['', 'Quick! ', 'Now '] : ['', 'Quick! ', 'Now ', 'Everybody, ', 'Simon wants you to '];
    const front = fronts[Math.floor(rng() * fronts.length)];
    const f = forced[r - 1];
    if (f && POSES[f.pose]) { id = f.pose; says = !!f.says; }
    list.push({ id, says, text: commandText(id, says, front) });
    if (says) real = id; else trick = id;
  }
  return list;
}

const caption = (cmd, ok) => (cmd.says ? (ok ? 'Got it!' : 'Too slow!') : ok ? "Didn't fall for it!" : "Simon didn't say!");
const spoken = name => String(name || '').replace(/[_\d]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Your opponent';

/* ---------- Simon's voice ---------- */

// The deepest-sounding English voice the browser has: a man's voice if there is one, on this computer if possible
// (those start talking right away).
let voicePick; // (undefined until the browser's voices have loaded)
// Voices don't agree on what a speaking rate means (Chrome's Windows voices hardly speed up at all), so Simon times
// himself: when a line takes longer than it should, he says the next one faster, and the other way round.
let rateBoost = 1;
if (window.speechSynthesis && speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', () => { voicePick = undefined; rateBoost = 1; });
function pickVoice() {
  if (voicePick !== undefined) return voicePick;
  const all = speechSynthesis.getVoices();
  if (!all.length) return null;
  const MALE = /\b(david|mark|guy|christopher|eric|roger|steffan|andrew|brian|davis|tony|jason|daniel|fred|alex|aaron|arthur|gordon|ralph|bruce|oliver|george|ryan|thomas|william|male)\b/i;
  const FEMALE = /\b(zira|aria|jenny|michelle|ana|emma|ava|sonia|libby|clara|samantha|susan|hazel|karen|moira|tessa|victoria|fiona|serena|female)\b/i;
  const score = v => (/^en/i.test(v.lang) ? 8 : 0) + (MALE.test(v.name) ? 4 : 0) - (FEMALE.test(v.name) ? 6 : 0) +
    (v.localService ? 2 : 0) + (/^en[-_]us/i.test(v.lang) ? 1 : 0);
  voicePick = all.slice().sort((a, b) => score(b) - score(a))[0];
  return voicePick;
}

// How long Simon should take to say a line (about 165 words a minute at rate 1). The words pop up at this pace when
// the voice can't say where it's up to.
function sayMs(text, rate) {
  const letters = text.replace(/[^A-Za-z]/g, '').length;
  const stops = (text.match(/[,.!?]/g) || []).length;
  return (300 + 75 * letters + 150 * stops) / rate;
}

/* ---------- drawing ---------- */

const LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]];
const SENT = [0, 11, 12, 13, 14, 15, 16, 23, 24];         // the body points that go to the other player
const shows = q => !!q && (q.visibility == null || q.visibility > 0.5);
const r3 = v => Math.round(v * 1000) / 1000;
const pack = p => SENT.map(i => (shows(p[i]) ? [r3(p[i].x), r3(p[i].y)] : 0));
function unpack(list) {
  if (!Array.isArray(list) || list.length !== SENT.length) return null;
  const p = [];
  SENT.forEach((i, k) => {
    const q = list[k];
    if (Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]) && Math.abs(q[0]) < 3 && Math.abs(q[1]) < 3) p[i] = { x: q[0], y: q[1], visibility: 1 };
  });
  return p;
}

// The lines on a body, like Pose Match's. at(point) gives where a body point lands on the canvas.
function drawLines(g, p, at, color, width) {
  g.lineWidth = width || 6;
  g.lineCap = 'round';
  g.strokeStyle = color;
  for (const [a, b] of LINKS) {
    if (!shows(p[a]) || !shows(p[b])) continue;
    const pa = at(p[a]), pb = at(p[b]);
    g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
  }
  g.fillStyle = '#ffb938';
  for (const i of [0, 11, 12, 13, 14, 15, 16]) {
    if (!shows(p[i])) continue;
    const q = at(p[i]);
    g.beginPath(); g.arc(q[0], q[1], (width || 6) + 2, 0, Math.PI * 2); g.fill();
  }
}

// A video fills its box (object-fit: cover), so a camera picture that isn't 4:3 gets cropped at the sides or at the
// top and bottom. This puts body points (0 to 1 across and down the picture) in the same place on the canvas.
function coverMap(vw, vh) {
  const w = vw || CW, h = vh || CH;
  const s = Math.max(CW / w, CH / h);
  const ox = (CW - w * s) / 2, oy = (CH - h * s) / 2;
  return q => [ox + q.x * w * s, oy + q.y * h * s];
}

// A cat's head, cut out of its picture, with its mouth closed [0] and open [1] (for the puppet below).
function heads(eq) {
  const pics = [null, null];
  [0, 1].forEach(open => {
    const svg = CA.catSVG(eq, { bg: false, anim: false, arms: false, mouth: open ? 'open' : 'closed' }).replace('<svg ', '<svg width="400" height="480" ');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 292;
      c.getContext('2d').drawImage(img, 40, 0, 320, 292, 0, 0, 320, 292);
      pics[open] = c;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  return pics;
}

// The other player's cat, moved by their body points: shown when you can't see their camera, and for the bot.
function drawPuppet(g, p, at, fur, pics, open) {
  const P = i => (shows(p[i]) ? at(p[i]) : null);
  const n = P(0), ls = P(11), rs = P(12);
  if (!n || !ls || !rs) return false;
  const sw = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]);
  const cx = (ls[0] + rs[0]) / 2;
  const hip = (h, s) => h || [s[0] + (cx - s[0]) * 0.2, s[1] + sw * 1.8];
  const lh = hip(P(23), ls), rh = hip(P(24), rs);
  const top = [cx, (ls[1] + rs[1]) / 2], low = [(lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2];
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const h of [lh, rh]) { // legs
    g.strokeStyle = fur.dark;
    g.lineWidth = sw * 0.34;
    g.beginPath(); g.moveTo(h[0], h[1]); g.lineTo(h[0], h[1] + sw * 1.3); g.stroke();
  }
  // the body: a rounded shape from the shoulders to the hips, in its shirt's color (or with a pale belly)
  const ry = Math.hypot(low[0] - top[0], low[1] - top[1]) / 2 + sw * 0.12;
  const tilt = -Math.atan2(low[0] - top[0], low[1] - top[1]);
  const mid = [(top[0] + low[0]) / 2, (top[1] + low[1]) / 2];
  g.beginPath(); g.ellipse(mid[0], mid[1], sw * 0.62, ry, tilt, 0, Math.PI * 2);
  g.fillStyle = fur.sleeve || fur.mid; g.fill();
  g.lineWidth = 3; g.strokeStyle = fur.dark; g.stroke();
  if (!fur.sleeve) { g.beginPath(); g.ellipse(mid[0], mid[1] + ry * 0.12, sw * 0.36, ry * 0.62, tilt, 0, Math.PI * 2); g.fillStyle = fur.light; g.fill(); }
  for (const [s, e, w] of [[ls, P(13), P(15)], [rs, P(14), P(16)]]) { // arms: a short sleeve (if it wears a shirt), then fur
    const pts = [s, e, w].filter(Boolean);
    if (pts.length < 2) continue;
    const path = () => { g.beginPath(); g.moveTo(s[0], s[1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); };
    path(); g.strokeStyle = fur.dark; g.lineWidth = sw * 0.26 + 5; g.stroke();
    path(); g.strokeStyle = fur.mid; g.lineWidth = sw * 0.26; g.stroke();
    if (fur.sleeve) {
      const q = pts[1];
      g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[0] + (q[0] - s[0]) * 0.55, s[1] + (q[1] - s[1]) * 0.55);
      g.strokeStyle = fur.sleeve; g.lineWidth = sw * 0.32; g.stroke();
    }
    const end = pts[pts.length - 1];
    g.beginPath(); g.arc(end[0], end[1], sw * 0.16, 0, Math.PI * 2);
    g.fillStyle = fur.light; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = fur.dark; g.stroke();
  }
  const pic = pics[open ? 1 : 0] || pics[0];
  const k = sw * 1.2 / 130; // (the head is 130 wide in the cat's picture, and its nose is at 80, 104 in the cut-out)
  if (pic) g.drawImage(pic, n[0] - 80 * k, n[1] - 104 * k, 160 * k, 146 * k);
  else { g.fillStyle = fur.mid; g.beginPath(); g.arc(n[0], n[1] - 10 * k, 62 * k, 0, Math.PI * 2); g.fill(); }
  drawLines(g, p, at, 'rgba(30, 212, 155, .85)', 4);
  return true;
}

/* ---------- the game ---------- */

CA.games.add('simon', {
  name: 'Simon Says', icon: '🗣️', camera: true,
  blurb: 'Do what Simon says, but ONLY when he starts with "Simon says"! Your camera checks your pose. ' +
    'He gets faster and faster, and the first to mess up loses.',
  prepare() {
    loadDetector().catch(() => {});
    if (window.speechSynthesis) speechSynthesis.getVoices(); // (Chrome loads its voices the first time someone asks)
  },
  start(ctx) { play(ctx); },
});

function play(ctx) {
  const skill = skillOf(ctx);
  const cmds = makeCommands(ctx.rng);
  const view = ctx.stage.closest('.match');
  ctx.stage.innerHTML =
    '<div class="g-simon">' +
    '<div class="sm-pane me" id="smMe"><div class="sm-cat hidden" id="smMeCat"></div>' +
    '<video id="smVideo" class="mirror" autoplay playsinline muted></video><canvas class="mirror" id="smDots" width="' + CW + '" height="' + CH + '"></canvas>' +
    '<p class="sm-off hidden" id="smOff">Turn your camera on to play (📷 at the top)!</p>' +
    '<div class="sm-see" id="smSee"></div><div class="sm-ok hidden" id="smOk">✓ Hold it!</div><div class="sm-tag">You</div><div class="sm-stamp" id="smMeStamp"></div></div>' +
    '<div class="sm-mid" id="smMid"><div class="sm-bubble"><span class="sm-figbox" id="smFig"></span><p class="sm-say wait" id="smSay">…</p></div>' +
    '<div class="sm-host"><div class="sm-simon" id="smSimon">' + CA.catSVG(SIMON, { bg: false, label: 'Simon', talker: 'simon' }) + '</div>' +
    '<div class="sm-name">Simon</div></div><div class="timer"><i id="smTimer"></i></div><div class="sm-speed" id="smSpeed"></div></div>' +
    '<div class="sm-pane them" id="smThem"><div class="sm-cat hidden" id="smThemCat"></div>' +
    '<video id="smThemVideo" class="hidden" autoplay playsinline muted></video><canvas id="smThemDots" width="' + CW + '" height="' + CH + '"></canvas>' +
    '<div class="sm-tag">' + esc(ctx.oppName) + (ctx.bot ? ' 🤖' : '') + '<span id="smThemNote"></span></div><div class="sm-stamp" id="smThemStamp"></div>' +
    '<button class="btn small primary unmute hidden" id="smUnmute">🔊 Tap to hear them</button></div>' +
    '</div><p class="g-msg" id="smMsg" aria-live="polite"></p>';
  view.classList.add('cams-in-stage'); // (the big cameras in the game take the place of the small ones above it)
  $('smMeCat').innerHTML = CA.catSVG(CA.profile.equip, { label: CA.profile.name, talker: 'me' });
  $('smThemCat').innerHTML = CA.catSVG(ctx.oppEquip, { label: ctx.oppName, talker: 'opp' });
  ctx.listen($('smUnmute'), 'click', () => $('unmuteBtn').click());
  const video = $('smVideo'), tv = $('smThemVideo');
  const mg = $('smDots').getContext('2d'), tg = $('smThemDots').getContext('2d');
  const theirFur = CA.floppy.fur(ctx.oppEquip), theirHeads = heads(ctx.oppEquip);

  let detector = null;
  let status = 'loading';
  let live = null;               // the command going on now: { r, cmd, from, done, submit, mine, theirs }
  let cur = null, curSince = 0, curAt = 0; // the pose you're doing (see track)
  let lastRun = 0, lastSent = 0;
  let theirs = null;             // their latest body points: { p, tall, at }
  let shownStream, shownCam, theirMode = '';
  let doubles = 0;               // commands in a row that you both messed up
  let pause = L(pauseOf(1));
  let shownLevel = 0;
  let meReady = false, themReady = !!ctx.bot, onReady = null; // (see "getting ready")
  const bot = { from: fakeBody('rest'), to: fakeBody('rest'), t0: -1e9, pose: 'rest' }; // the bot's cat (see "the bot")

  ctx.on(msg => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'rdy') { themReady = true; bothReady(); }
    if (msg.t === 'pts') {
      const p = msg.p === null ? null : unpack(msg.p);
      theirs = p ? { p, tall: Number.isFinite(msg.a) && msg.a > 0.2 && msg.a < 3 ? msg.a : 0.75, at: performance.now() } : null;
    }
  });

  /* ---------- getting ready ---------- */

  // Both players wait until their pose detectors are ready (it downloads the first time), so nobody starts behind.
  function imReady() {
    if (meReady) return;
    meReady = true;
    ctx.send({ t: 'rdy' });
    bothReady();
  }
  function bothReady() {
    if (!meReady || !themReady || !onReady) return;
    const f = onReady;
    onReady = null;
    f();
  }
  loadDetector().then(d => { detector = d; status = 'ready'; imReady(); }, () => {
    status = 'failed';
    setMsg('smMsg', "The pose detector couldn't load. It needs the internet the first time.");
    imReady();
  });
  ctx.later(imReady, L(15000)); // (don't keep the other player waiting forever for a slow download)

  function warning() {
    if (!CA.voice.cameraOn()) return 'Turn your camera on to play (📷 at the top)!';
    if (status === 'failed') return "The pose detector couldn't load. It needs the internet the first time.";
    if (status === 'loading') return 'Getting the pose detector ready…';
    return '';
  }

  /* ---------- Simon talks ---------- */

  let lineGen = 0;     // counts Simon's lines, so the end of an old one can't touch a new one
  let utter = null;    // (kept, so the browser doesn't drop the line before it's finished)
  let flap = null;
  let talking = false;
  let quiet = [];      // things waiting for Simon to finish his line

  const canTalk = () => CA.soundOn && !!window.speechSynthesis && typeof SpeechSynthesisUtterance === 'function';

  // Simon says a line: the words pop up in his speech bubble as he says them, and his mouth moves. o.hl: how many
  // words at the start to highlight ("Simon says,"), o.fig: a pose to draw, o.done: runs when he has finished.
  // Returns about how long it takes.
  function say(text, rate, o) {
    const gen = ++lineGen;
    const words = text.split(' ');
    const box = $('smSay');
    box.classList.remove('wait');
    box.parentNode.classList.remove('says');
    box.innerHTML = words.map((w, i) => '<span class="w' + (i < (o.hl || 0) ? ' ss' : '') + '">' + esc(w) + '</span>').join(' ');
    $('smFig').innerHTML = o.fig ? figure(o.fig) : '';
    const spans = [...box.children];
    const est = L(sayMs(text, rate));
    let pos = 0;
    const starts = words.map(w => { const s = pos; pos += w.length + 1; return s; });
    const weight = w => 2 + w.replace(/[^A-Za-z]/g, '').length + (/[,.!?]$/.test(w) ? 3 : 0);
    const total = words.reduce((a, w) => a + weight(w), 0);
    let acc = 0;
    const due = words.map(w => { const t = acc / total * est; acc += weight(w); return t; });
    let shown = 0, began = 0, over = false, blips = !canTalk() && CA.soundOn;
    const show = n => {
      while (shown < Math.min(n, spans.length)) {
        const sp = spans[shown++];
        sp.classList.add('on');
        if (sp.classList.contains('ss')) box.parentNode.classList.add('says'); // (it lights up: Simon said it!)
        if (blips && !over) sound([[78 + Math.random() * 30, 0, 0.09]]); // (no voice: deep little blips instead)
      }
    };
    const begin = () => {
      if (began || gen !== lineGen) return;
      began = performance.now();
      talk(true, rate);
      const iv = ctx.every(() => {
        if (over || gen !== lineGen) { ctx.stopEvery(iv); return; }
        const t = performance.now() - began;
        let k = 0;
        while (k < due.length && due[k] <= t) k++;
        show(k);
      }, 40);
    };
    const end = () => {
      if (over || gen !== lineGen) return;
      over = true;
      show(spans.length);
      talk(false);
      const waiting = quiet;
      quiet = [];
      waiting.forEach(f => ctx.later(f, L(150)));
      if (o.done) o.done();
    };
    if (canTalk()) {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.pitch = PITCH;
      u.rate = Math.min(10, Math.max(0.1, rate * rateBoost));
      let spokeAt = 0;
      u.onstart = () => { spokeAt = performance.now(); begin(); };
      u.onboundary = e => {
        if (gen !== lineGen || e.name === 'sentence') return;
        begin();
        let k = 0;
        while (k < starts.length && starts[k] <= e.charIndex) k++;
        show(k);
      };
      u.onend = () => {
        const took = spokeAt ? performance.now() - spokeAt : 0;
        if (took > 400) rateBoost = Math.min(6, Math.max(0.6, rateBoost * Math.pow(took / est, 0.8)));
        end();
      };
      u.onerror = e => {
        if (gen !== lineGen) return;
        if (e && (e.error === 'interrupted' || e.error === 'canceled')) { end(); return; }
        blips = CA.soundOn; // (the voice didn't work: carry on without it)
        begin();
        ctx.later(end, Math.max(0, est - (performance.now() - began)));
      };
      utter = u;
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      speechSynthesis.speak(u);
      ctx.later(begin, L(700));            // (if the voice is slow to start, the words show anyway)
      ctx.later(end, est * 2 + L(1500));   // (and if the browser never says it has finished)
    } else {
      begin();
      ctx.later(end, est);
    }
    return est;
  }

  function talk(on, rate) {
    if (flap) { ctx.stopEvery(flap); flap = null; }
    talking = on;
    $('smSimon').classList.toggle('talking', on);
    if (on) flap = ctx.every(() => CA.setMouths('talk-simon', Math.random() < 0.2 ? 0.15 : 0.5 + Math.random() * 0.5), Math.round(110 / rate));
    else CA.setMouths('talk-simon', 0);
    duck(on);
  }

  // While Simon talks, the other player's sound is turned down: their microphone may pick up their own Simon.
  function duck(on) {
    const v = $('themVideo');
    if (!v || ctx.bot) return;
    if (on) v.volume = 0.25;
    else ctx.later(() => { if (!talking) v.volume = 1; }, 400);
  }

  function whenQuiet(fn) { if (talking) quiet.push(fn); else fn(); }

  ctx.onEnd(() => {
    lineGen++;
    if (utter && window.speechSynthesis) speechSynthesis.cancel();
    const v = $('themVideo');
    if (v) v.volume = 1;
    view.classList.remove('cams-in-stage');
  });

  /* ---------- your camera ---------- */

  function syncMine() {
    const cam = CA.voice.cameraOn() ? CA.voice.camera : null;
    if (cam && video.srcObject !== cam) { video.srcObject = cam; video.play().catch(() => {}); }
    if (!cam && video.srcObject) video.srcObject = null;
    if (!!cam === shownCam) return;
    shownCam = !!cam;
    video.classList.toggle('hidden', !cam);
    $('smMeCat').classList.toggle('hidden', !!cam);
    $('smOff').classList.toggle('hidden', !!cam);
  }

  function look(now) {
    let p = window.__fakeBody || null; // (the tests put made-up body points here)
    if (!p && detector && CA.voice.cameraOn() && video.readyState >= 2) {
      try { const res = detector.detectForVideo(video, now); p = res.landmarks && res.landmarks[0]; } catch (e) { p = null; }
    }
    const tall = video.videoWidth ? video.videoHeight / video.videoWidth : 0.75;
    const b = bodyOf(p, tall);
    track(poseOf(b), now);
    judge(now);
    showSeen(p, b);
    mg.clearRect(0, 0, CW, CH);
    if (p) drawLines(mg, p, coverMap(video.videoWidth, video.videoHeight), lineColor());
    if (!ctx.bot && now - lastSent >= (p ? SEND_MS : 500)) {
      lastSent = now;
      ctx.send({ t: 'pts', p: p ? pack(p) : null, a: r3(tall) });
    }
  }

  // Tells you what Simon sees, so you know what to fix when a pose doesn't count.
  let seenText = null;
  function showSeen(p, b) {
    let text = '';
    if (!p && !CA.voice.cameraOn()) text = ''; // (the camera is off: that has its own message)
    else if (!b) text = "👀 Simon can't see you: face the camera";
    else if (cur) text = '👀 <span>Simon sees: </span>' + POSES[cur].label;
    else if (!seen(b.lw) || !seen(b.rw)) text = '👀 Step back so Simon sees both hands';
    else text = '👀 Simon sees you';
    if (text === seenText) return;
    seenText = text;
    $('smSee').innerHTML = text; // (on a phone it shows just the pose's name)
    $('smSee').classList.toggle('hidden', !text);
  }

  // The pose you're doing, smoothed a little: a moment of something else (the detector blinked) doesn't break a hold.
  function track(pose, now) {
    if (pose === cur) { curAt = now; return; }
    if (cur && now - curAt < 250) return;
    cur = pose;
    curSince = now;
    curAt = now;
  }

  // (A trick can't catch you for the pose you were already doing when Simon started talking.)
  function judge(now) {
    const c = live;
    const on = !!c && !c.done && cur === c.cmd.id;
    $('smOk').classList.toggle('hidden', !(on && c.cmd.says));
    if (!on) return;
    if (c.was === c.cmd.id && !c.cmd.says) {
      if (curSince <= c.from) return;
      c.was = null; // (you left it and came back: that counts)
    }
    const held = now - Math.max(curSince, c.from);
    if (c.cmd.says) $('smOk').style.setProperty('--p', Math.min(1, held / L(HOLD)).toFixed(2));
    if (c.cmd.says && held >= L(HOLD)) done({ ok: true });
    else if (!c.cmd.says && held >= L(TRICK_HOLD)) done({ ok: false });
  }

  function lineColor() {
    const c = live;
    if (c && c.mine && !c.mine.ok) return '#ff5a78';
    if (c && !c.done && c.cmd.says && cur === c.cmd.id) return '#ffd23f';
    return '#1ed49b';
  }

  /* ---------- their camera ---------- */

  function drawThem(now) {
    const stream = ctx.theirCam();
    if (stream !== shownStream) {
      shownStream = stream;
      tv.srcObject = stream;
      if (stream) tv.play().catch(() => {});
      tv.classList.toggle('hidden', !stream);
    }
    const p = ctx.bot ? botBody(now) : theirs && now - theirs.at < 1500 ? theirs.p : null;
    tg.clearRect(0, 0, CW, CH);
    let mode = 'cat';
    if (stream) {
      mode = 'video';
      if (p) drawLines(tg, p, coverMap(tv.videoWidth, tv.videoHeight), '#1ed49b');
    } else if (p) {
      const at = ctx.bot ? coverMap(CW, CH) : coverMap(1000, 1000 * theirs.tall);
      if (drawPuppet(tg, p, at, theirFur, theirHeads, CA.floppy.mouth('talk-opp') > 0.2)) mode = 'puppet';
    }
    if (mode !== theirMode) {
      theirMode = mode;
      $('smThemCat').classList.toggle('hidden', mode !== 'cat');
      setMsg('smThemNote', mode === 'cat' && !ctx.bot ? ' · camera off' : '');
    }
    $('smUnmute').classList.toggle('hidden', ctx.bot || $('unmuteBtn').classList.contains('hidden'));
  }

  function frame(now) {
    if (!ctx.alive()) return;
    requestAnimationFrame(frame);
    syncMine();
    if (now - lastRun >= 70) { lastRun = now; look(now); }
    drawThem(now);
  }
  requestAnimationFrame(frame);

  /* ---------- the commands ---------- */

  function stamp(who, kind, text) {
    const el = $(who === 'me' ? 'smMeStamp' : 'smThemStamp');
    const pane = $(who === 'me' ? 'smMe' : 'smThem');
    el.className = 'sm-stamp' + (kind ? ' ' + kind : '');
    el.innerHTML = kind ? '<span>' + { ok: '✅', bad: '❌', out: 'OUT!', win: '🏆' }[kind] + '</span>' + (text ? '<small>' + esc(text) + '</small>' : '') : '';
    pane.classList.toggle('good', kind === 'ok' || kind === 'win');
    pane.classList.toggle('bad', kind === 'bad' || kind === 'out');
  }

  function speedUp(r) {
    const lv = level(r);
    setMsg('smSpeed', SPEEDS[Math.min(SPEEDS.length - 1, lv - 1)] + ' Speed ' + lv);
    $('smSimon').style.setProperty('--beat', (0.95 - 0.6 * speed(r)).toFixed(2) + 's'); // (Simon bobs faster too)
    if (shownLevel && lv > shownLevel) {
      const f = document.createElement('div');
      f.className = 'sm-flash';
      f.textContent = '⚡ Faster!';
      $('smMid').appendChild(f);
      ctx.later(() => f.remove(), 1200);
      sound([[523, 0, 0.07], [659, 0.07, 0.07], [784, 0.14, 0.07], [1047, 0.21, 0.14]]);
    }
    shownLevel = lv;
  }

  function command(r, submit) {
    const cmd = cmds[r - 1];
    live = { r, cmd, from: performance.now(), done: false, submit, mine: null, theirs: undefined, was: cur };
    if (window.__testHooks) window.__peek = { r, pose: cmd.id, says: cmd.says };
    stamp('me', '');
    stamp('them', '');
    resetTimer('smTimer');
    ctx.note('Command ' + r + ' · speed ' + level(r));
    speedUp(r);
    setMsg('smMsg', warning());
    say(cmd.text, rateOf(r), { hl: cmd.says ? 2 : 0, fig: cmd.id, done: () => act(r) });
  }

  // Simon has finished saying it: now the clock runs.
  function act(r) {
    if (!live || live.r !== r) return;
    const ms = L(actOf(r));
    if (!live.done) startTimer('smTimer', ms);
    ctx.later(() => {
      if (!live || live.r !== r || live.done) return;
      done({ ok: !live.cmd.says }); // (too slow, or you didn't fall for it)
    }, ms);
    if (ctx.bot) botTurn(r, ms);
  }

  function done(v) {
    const c = live;
    c.done = true;
    c.mine = v;
    stopTimer('smTimer');
    $('smOk').classList.add('hidden');
    stamp('me', v.ok ? 'ok' : 'bad', caption(c.cmd, v.ok));
    if (!v.ok) sound('miss');
    else if (c.cmd.says) sound('correct');
    const text = !v.ok ? (c.cmd.says ? 'Too slow! 😿' : "Simon didn't say! 😱") : c.cmd.says ? 'Got it! 🎉' : "Phew! Simon didn't say.";
    setMsg('smMsg', text + (c.theirs === undefined ? ' Waiting for ' + ctx.oppName + '…' : ''));
    c.submit(v);
  }

  const okOf = v => !!(v && v.ok === true);

  roundMatch(ctx, {
    play(r, submit) {
      if (r > 1) { whenQuiet(() => command(r, submit)); return; }
      onReady = () => {
        setMsg('smMsg', warning() || (CA.soundOn ? '' : '🔇 Sound is off, so read what Simon says in his speech bubble (🔊 at the top turns it on).'));
        say(INTRO, rateOf(1), { done: () => ctx.later(() => command(1, submit), L(500)) });
      };
      ctx.later(() => { if (onReady) setMsg('smMsg', status === 'loading' ? 'Getting the pose detector ready…' : 'Waiting for ' + ctx.oppName + '…'); }, 400);
      ctx.later(() => { meReady = themReady = true; bothReady(); }, L(25000)); // (start anyway in the end)
      bothReady();
    },
    onTheirs(r, v) {
      if (!live || live.r !== r) return;
      live.theirs = v;
      stamp('them', okOf(v) ? 'ok' : 'bad', caption(live.cmd, okOf(v)));
    },
    points(a, b) {
      const ma = okOf(a), mb = okOf(b);
      if (ma !== mb) return ma ? [1, 0] : [0, 1];
      doubles = ma ? 0 : doubles + 1;
      return [0, 0];
    },
    over: (my, op, r) => my !== op || doubles >= 3 || r >= cmds.length,
    outcome: (my, op) => (my > op ? 'win' : my < op ? 'lose' : 'draw'),
    get revealMs() { return pause; },
    reveal(r, a, b) {
      const cmd = cmds[r - 1];
      const ma = okOf(a), mb = okOf(b);
      stamp('me', ma ? 'ok' : 'bad', caption(cmd, ma));
      stamp('them', mb ? 'ok' : 'bad', caption(cmd, mb));
      pause = L(pauseOf(r));
      let text = '';
      if (ma && mb) {
        if (r >= cmds.length) text = "You're both too good for me! It's a draw.";
        else setMsg('smMsg', 'You both got it!');
      } else if (!ma && !mb) {
        text = doubles >= 3 ? "Nobody is listening to Simon! It's a draw." : 'Oops! You both messed up. Keep going!';
      } else {
        const name = spoken(ctx.oppName);
        text = (cmd.says ? 'Too slow! ' : "Ha! Simon didn't say! ") + (ma ? name + ' is out!' : "You're out!");
        stamp(ma ? 'them' : 'me', 'out', caption(cmd, false));
        stamp(ma ? 'me' : 'them', 'win', ma ? 'You win!' : ctx.oppName + ' wins!');
      }
      if (text) {
        setMsg('smMsg', text);
        pause = Math.max(pause, say(text, Math.min(1.3, rateOf(r)), {}) * 1.2 + L(600));
      }
    },
    botValue: () => null,
    botDelay: () => 1e9, // (the bot's answers come from its cat instead, through ctx.deliver: see botTurn)
  });

  /* ---------- the bot ---------- */

  // The bot's cat moves from pose to pose (and sways a little while it waits).
  function botPose(now) {
    const k = Math.min(1, Math.max(0, (now - bot.t0) / L(BOT_MOVE)));
    const e = k * k * (3 - 2 * k);
    return bot.from.map((q, i) => ({ x: q.x + (bot.to[i].x - q.x) * e, y: q.y + (bot.to[i].y - q.y) * e, visibility: 1 }));
  }
  function botBody(now) {
    const sway = Math.sin(now / 520) * 0.005;
    return botPose(now).map(q => ({ x: q.x + sway, y: q.y + Math.abs(sway) * 0.6, visibility: 1 }));
  }
  // part: only that much of the way there (a twitch)
  function botGo(pose, delay, part) {
    ctx.later(() => {
      const now = performance.now();
      const from = botPose(now), target = fakeBody(pose);
      bot.from = from;
      bot.to = part ? from.map((q, i) => ({ x: q.x + (target[i].x - q.x) * part, y: q.y + (target[i].y - q.y) * part, visibility: 1 })) : target;
      bot.t0 = now;
      if (!part) bot.pose = pose;
    }, Math.max(0, delay));
  }

  // The bot's go at command r, once Simon has finished saying it. It slips up more as things speed up.
  function botTurn(r, actMs) {
    const cmd = cmds[r - 1];
    const sloppy = (1.35 - 0.7 * skill) * (1 + Math.max(0, r - 17) * 0.08);
    const slip = Math.random() < Math.min(0.9, (cmd.says ? 0.015 + 0.13 * speed(r) : 0.06 + 0.2 * speed(r)) * sloppy);
    const react = L(Math.max(60, gauss(430 - 330 * skill - 100 * speed(r), 90)));
    const move = L(BOT_MOVE);
    const answer = (v, ms) => ctx.later(() => ctx.deliver({ t: 'v', r, v }), ms);
    if (cmd.says) {
      const need = react + move + L(HOLD) + L(80);
      if (!slip && need < actMs - L(40)) { botGo(cmd.id, react); answer({ ok: true }, need); return; }
      const wrong = IDS.filter(k => k !== cmd.id && k !== bot.pose);
      if (Math.random() < 0.5) botGo(wrong[Math.floor(Math.random() * wrong.length)], react); // the wrong pose
      else botGo(cmd.id, actMs - L(120)); // too slow
      answer({ ok: false }, actMs);
    } else if (slip) {
      botGo(cmd.id, react); // fell for it
      answer({ ok: false }, Math.min(actMs - L(30), react + move + L(TRICK_HOLD) + L(80)));
    } else {
      if (Math.random() < 0.25) { const was = bot.pose; botGo(cmd.id, react, 0.35); botGo(was, react + L(260)); } // almost!
      answer({ ok: true }, actMs);
    }
  }

  if (window.__testHooks) window.__simon = { cmds, live: () => live, pose: () => cur, bot, status: () => status };
}

CA.games.simon = { POSES, NEAR, bodyOf, poseOf, fakeBody, makeCommands }; // (for the tests)

})();
