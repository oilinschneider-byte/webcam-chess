/* The automated two-browser test. tools/test-browsers.ps1 opens two hidden browsers on
   http://localhost:…/?autotest=a and ?autotest=b, and this script plays them like two people would.

   Round 1 (…&mode=teen):
     both  sign up through the form (a as an adult, b as a 15-year-old), skip the camera question, open Classic Games
     both  get paired by the server, connect to each other, and start a game
     both  check it's a cats-only match (b is under 18) and that the "Show my face" button is off
     a     leaves in the middle of the game
     b     gets the win, and checks the server didn't count it (both browsers are on this computer's connection)
     b     reports a
     both  delete their test accounts

   Round 2 (…&mode=cam), with two adults and pretend webcams:
     both  turn their cameras on, get paired and start a game
     both  check the other player sees their cat, not their camera
     a     presses 📷 Show my face, and b checks a's camera shows up (and that b's own camera still doesn't go to a)
     then the same leaving, reporting and clean-up as round 1

   Round 3 (…&mode=walls), Wall Duel with two adults:
     a     plays it against the bot first, and checks the rules one by one: building, dots joining up with nearby
           ones, "Too close to another dot", "Can't build on a line", a bullet stopping at a shielded wall, an open
           wall taking 2 hits, an open dot taking its wall with it, walking through your own walls,
           the shield taking the first hit, the zone, and getting knocked out by touching the other cat's wall
           (then the K.O. and the result screen)
     a     lets the bot play on easy, medium and hard, and checks it builds walls, shoots and never walks into yours
     both  get paired and play it online: each one checks it sees the other's walls in the same places, the host
           breaks one of the guest's open dots (the guest checks it broke there too), the guest walks into the host's
           wall, and both check they agree the host won
     both  delete their test accounts

   Each step is sent to the test server, which writes it to a file the test script reads. */
(() => {
'use strict';

const q = new URLSearchParams(location.search);
const role = q.get('autotest');
if (role !== 'a' && role !== 'b') return;
const camTest = q.get('mode') === 'cam';
const wallTest = q.get('mode') === 'walls';
const duelTest = q.get('mode') === 'duels';
const DUELS = (q.get('games') || 'trails,box,sumo,pond,hockey,paint,cannons,golf,mouse,kart,blocks,swords,stare,boxing').split(',');
const DUEL_ONLINE = q.get('online') || 'sumo';
const run = (q.get('run') || 'x').replace(/[^a-z0-9]/gi, '').slice(0, 8);
const NAME = 'zt' + run + role;
const PASS = 'test-pass-' + run;
const adult = role === 'a' || camTest || wallTest || duelTest;
window.__introMs = 1500;   // (shorter face-to-face screens)
window.__reactMs = 15000;
window.__forceGame = wallTest ? 'walls' : camTest ? 'ttt' : 'rps'; // (Tic-Tac-Toe waits for moves, so there's time to check the cameras)
if (wallTest || duelTest) window.__testHooks = true; // (the games then let the test look inside: window.__wd, window.__duel)
if (duelTest) {
  window.__forceGame = DUEL_ONLINE;
  window.__fakeFace = { face: true, blink: 0 }; // (Staring Contest: a pretend face that never blinks)
}

function log(step, ok, detail) {
  const line = { role, step, ok, detail: detail === undefined ? null : detail, t: Date.now() };
  console.log('[autotest] ' + JSON.stringify(line));
  return fetch('/__testlog', { method: 'POST', body: JSON.stringify(line) }).catch(() => {});
}
const check = (what, cond, detail) => log(what, !!cond, detail);
window.addEventListener('error', e => log('no errors on the page', false, String(e.message)));
window.addEventListener('unhandledrejection', e => log('no errors on the page', false, String((e.reason && e.reason.message) || e.reason)));

// Watch what the server says.
const seen = {};
const realCall = CAServer.call;
CAServer.call = async function (fn, args, opts) {
  try {
    const r = await realCall.call(CAServer, fn, args, opts);
    if (fn === 'ca_mm_poll' && r && r.match) seen.match = r.match;
    if (fn === 'ca_report') { seen.report = r; seen.reportArgs = args; }
    if (fn === 'ca_report_player') seen.reported = r;
    return r;
  } catch (err) {
    if (fn !== 'ca_visit' && fn !== 'ca_stats') log('server call ' + fn, false, err.code + ': ' + err.message);
    throw err;
  }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => document.getElementById(id);

async function until(test, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = test();
    if (v) return v;
    await sleep(100);
  }
  throw new Error('timed out waiting for ' + what);
}

function clickModal(text) {
  const b = Array.from($('caModalBtns').querySelectorAll('button')).find(x => x.textContent.includes(text));
  if (!b) throw new Error('no "' + text + '" button in the popup');
  b.click();
}

async function main() {
  await until(() => CA.route, 15000, 'the page to load');
  if (CA.user) CA.logOut();
  if (CA.route !== 'auth') { location.hash = '#/auth'; await until(() => CA.route === 'auth', 5000, 'the sign-up page'); }

  // Sign up through the form, like a person would.
  document.querySelector('[data-auth="signup"]').click();
  $('authUser').value = NAME;
  $('authPass').value = PASS;
  $('authPass2').value = PASS;
  $('authMonth').value = '1';
  $('authYear').value = String(adult ? 1990 : new Date().getFullYear() - 15);
  $('authRules').checked = true;
  $('authSubmit').click();
  await until(() => CA.user || ($('authMsg').classList.contains('error') && $('authMsg').textContent), 20000, 'sign up');
  if (!CA.user) throw new Error('sign up failed: ' + $('authMsg').textContent);
  await check('sign up through the form', CA.profile.name === NAME && CA.profile.streak === 0, { name: CA.profile.name });
  await check(adult ? 'an adult can video chat' : 'a 15-year-old plays as a cat only', CA.canVideoChat() === adult);

  await until(() => CA.route === 'perm', 5000, 'the camera question');
  if (camTest) {
    $('permAllow').click();
    await until(() => !$('permContinue').classList.contains('hidden') || $('permMsg').classList.contains('error'), 15000, 'the camera to turn on');
    if ($('permMsg').classList.contains('error')) throw new Error('camera: ' + $('permMsg').textContent);
    $('permContinue').click();
  } else {
    $('permSkip').click();
  }
  await until(() => CA.route === 'menu', 5000, 'the menu');
  if (wallTest) { await wallDuel(); return; }
  if (duelTest) { await duels(); return; }
  location.hash = '#/solos';
  await until(() => !$('caModal').classList.contains('hidden'), 5000, 'the safety tip');
  clickModal('find a match');
  await log('looking for a match', true);

  const m = await until(() => seen.match, 60000, 'the server to pair the two browsers');
  await check('the server paired the two browsers', m.opp && m.opp.name === 'zt' + run + (role === 'a' ? 'b' : 'a'), m);
  await check('same internet connection: the match is friendly (ranked_left 0)', m.same_net === true && m.ranked_left === 0, m);
  if (camTest) await check('two adults: cameras are allowed', m.cats_only === false, m);
  else await check('one player is 15: the match is cats-only', m.cats_only === true, m);

  await until(() => $('vs').classList.contains('hidden') && $('stage').children.length && !$('stage').querySelector('.stage-wait'),
    30000, 'the two browsers to connect and start the game');
  await check('the browsers connected and the game started', true, $('scGame').textContent);
  await check('the friendly-game note was shown', /Friendly game/.test($('vsNote').textContent), $('vsNote').textContent);
  const shows = id => !$(id).classList.contains('hidden');

  if (!camTest) {
    await check('"Show my face" is off in a cats-only match', $('faceBtn').disabled, $('faceBtn').textContent);
  } else {
    await check('my camera is on (for pose games), but the other player sees my cat', CA.voice.cameraOn() && !shows('meVideo'));
    await sleep(2500);
    await check("I can't see the other player's camera yet", !shows('themVideo'));
    if (role === 'a') {
      await sleep(500);
      $('faceBtn').click();
      await until(() => shows('meVideo'), 5000, 'my own camera tile to show what they see');
      await check('after "Show my face", my tile shows my camera', true, $('faceBtn').textContent);
      await sleep(5000); // (b checks it can see me)
      await check("b didn't press it, so I still see b's cat", !shows('themVideo'));
    } else {
      await until(() => shows('themVideo'), 12000, "a's camera to show up after a pressed Show my face");
      await check("a pressed Show my face: I see a's camera now", true);
      await check('...and a still sees my cat (I never pressed it)', !shows('meVideo'));
    }
  }

  if (role === 'a') {
    await sleep(2000);
    $('skipBtn').click();
    clickModal('Skip');
    const r = await until(() => seen.report, 15000, 'the server to take my report');
    await check('leaving mid-game reports a loss', r.status === 'pending' || (r.status === 'done' && r.result === 'lose'), r);
    await sleep(4000); // (let b report and look around before this account goes away)
  } else {
    let r = await until(() => seen.report, 30000, 'my win to be reported');
    for (let k = 0; k < 10 && r.status === 'pending'; k++) { // (my report got there first: the server waits for theirs, like the app does)
      await sleep(1000);
      r = await CAServer.call('ca_report', seen.reportArgs);
    }
    await check('the other player left: I get the win', r.status === 'done' && r.result === 'win', r);
    await check("but it didn't count, because we're on the same internet connection", r.ranked === false && r.why === 'same_net', r);
    await sleep(500);
    await check('my streak is still 0', CA.profile.streak === 0, { streak: CA.profile.streak });
    await until(() => !$('vs').classList.contains('hidden') && !$('vsReact').classList.contains('hidden'), 10000, 'the after-game screen');
    $('rxReportBtn').click();
    clickModal('Cheating');
    const rep = await until(() => seen.reported, 10000, 'the report to be sent');
    await check('the Report button sends a report', rep && rep.ok === true, rep);
  }

  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 5000, 'the menu');
  await CA.deleteAccount(PASS);
  await check('the test account was deleted', !CA.user);
  await log('done', true);
}

/* ---------- Wall Duel ---------- */

const put = (c, x, y) => { c.x = x; c.y = y; c.vx = 0; c.vy = 0; };

async function wallDuel() {
  if (role === 'a') {
    await wallRules();
    for (const level of ['easy', 'medium', 'hard']) await wallBot(level);
  }
  await wallOnline();
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 5000, 'the menu');
  await CA.deleteAccount(PASS);
  await check('the test account was deleted', !CA.user);
  await log('done', true);
}

async function practiceWalls(level) {
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 5000, 'the menu');
  document.querySelector('#practiceLevel [data-level="' + level + '"]').click();
  const before = window.__wd;
  location.hash = '#/practice?game=walls';
  const wd = await until(() => window.__wd !== before && window.__wd, 15000, 'Wall Duel to start');
  await until(() => wd.phase() === 'play', 8000, 'the countdown');
  return wd;
}

async function wallRules() {
  const wd = await practiceWalls('medium');
  await check('Wall Duel starts in Practice', /Wall Duel/.test($('scGame').textContent), $('scGame').textContent);
  const { me, them, walls, bullets } = wd;
  const mine = walls[me.i], theirs = walls[them.i];
  wd.bot.off = true; // (the bot stands still in a corner while the rules are checked)
  put(them, 880, 470);
  const build = (c, x, y) => { put(c, x, y); c.buildCd = 0; return wd.build(c); };

  const T0 = 1.8; // (when GO is, on the game clock)
  const lineOf = (a, b) => [...mine.lines.values()].find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  const linesAt = id => [...mine.lines.values()].filter(l => l.a === id || l.b === id).length;

  await check('Space drops a dot where you stand', build(me, 300, 270) && mine.dots.size === 1 && mine.dots.get(1).x === 300);
  await check('a dot close to another one joins up with it', build(me, 360, 270) && mine.dots.size === 2 && !!lineOf(1, 2));
  build(me, 460, 270);
  await check('...but not with a dot behind another dot', !!lineOf(2, 3) && !lineOf(1, 3) && mine.lines.size === 2);
  await check('a dot far from the others stays on its own', build(me, 880, 100) && linesAt(4) === 0);
  await check('a dot near two of yours joins up with both', build(me, 410, 180) && !!lineOf(5, 2) && !!lineOf(5, 3));
  await check('"Too close to another dot"', !build(me, 380, 270) && wd.msg() === 'Too close to another dot', wd.msg());
  await check('"Can\'t build on a line"', !build(me, 410, 278) && wd.msg() === "Can't build on a line", wd.msg());

  // My own bullets fly through my walls.
  const line = lineOf(2, 3);
  bullets.splice(0);
  put(me, 410, 330);
  me.fireCd = 0;
  wd.shoot(me, 0, -1);
  await sleep(500);
  await check('your bullets fly straight through your own walls', bullets.some(b => b.o === me.i && b.y < 250 && b.fade < 0) && line.hp === 2,
    bullets.map(b => [Math.round(b.y), b.fade]));
  put(me, 600, 470);

  // The bot shoots the wall between my dots 2 and 3 from below.
  const shootAt = async (x, y, dx, dy, clock) => {
    bullets.splice(0);
    put(them, x, y);
    them.fireCd = 0;
    wd.setT(clock);
    const fired = wd.shoot(them, dx, dy);
    await sleep(700);
    return fired;
  };
  await shootAt(410, 400, 0.2, -1, line.born + 3.2);
  await check('a bullet stops at a shielded wall (and the wall is fine)', mine.lines.has(line.id) && line.hp === 2 && bullets.every(b => b.fade >= 0),
    { hp: line.hp, bullets: bullets.length });
  await shootAt(410, 400, 0.2, -1, line.born + 2.15);
  await check('an open wall takes 1 of its 2 hits, and the bullet is used up', line.hp === 1 && mine.lines.has(line.id) && !bullets.length,
    { hp: line.hp, bullets: bullets.length });
  await shootAt(410, 400, 0.2, -1, line.born + 2.15);
  await check('a second hit while it is open breaks the wall (its dots stay)', !mine.lines.has(line.id) && mine.dots.has(2) && mine.dots.has(3));

  build(me, 200, 450);
  build(me, 300, 450);
  const d6 = mine.dots.get(6);
  await check('dots 6 and 7 are joined', d6 && !!lineOf(6, 7) && linesAt(6) === 1);
  await shootAt(200, 300, 0, 1, d6.born + 3.2);
  await check('a shielded dot doesn\'t break', mine.dots.has(6));
  await shootAt(200, 300, 0, 1, d6.born + 2.1);
  await check('one hit breaks an open dot, and the wall joined to it goes too', !mine.dots.has(6) && linesAt(7) === 0 && mine.dots.has(7));
  bullets.splice(0);

  put(me, 300, 450);
  await sleep(300);
  put(me, 330, 270);
  await sleep(300);
  await check('you can walk through your own dots and walls', !me.dead);

  put(them, 600, 120);
  put(me, 500, 120);
  me.fireCd = 0;
  wd.shoot(me, 1, 0);
  await sleep(700);
  await check('the first hit only breaks the shield', !them.shield && !them.dead, { shield: them.shield, dead: them.dead });

  put(them, 530, 330);
  wd.setT(T0 + 105); // (late in the game: the zone is small)
  put(me, 100, 480);
  await sleep(1900);
  await check('staying outside the zone costs you your shield', !me.shield && !me.dead && !them.dead, { shield: me.shield, dead: me.dead, r: wd.zoneR() });
  wd.setT(T0 + 4);
  await check('the zone was small, and is big again early in the game', wd.zoneR() > 500, wd.zoneR());

  build(them, 700, 300);
  build(them, 700, 380);
  put(them, 880, 470);
  await check("the bot's wall is there", theirs.dots.size === 2 && theirs.lines.size === 1);
  await until(() => { put(me, 700, 340); return me.dead; }, 4000, "touching the bot's wall to knock me out");
  await check("with no shield left, touching the other cat's wall knocks you out", me.why === 'wall');
  await until(() => wd.phase() === 'ko', 2000, 'the K.O.');
  await check('K.O.: the bot wins', wd.winner() === them.i);
  const result = await until(() => $('stage').querySelector('.result h2'), 8000, 'the result screen');
  await check('the result screen says "You lost"', result.textContent === 'You lost', result.textContent);
}

// Plays against the bot for about 25 seconds (as many games as that takes). The test's cat wanders about, keeping
// away from the bot's walls, and drops a wall now and then.
async function wallBot(level) {
  const near = (wd, x, y, r) => {
    const w = wd.walls[wd.them.i];
    for (const d of w.dots.values()) if (Math.hypot(d.x - x, d.y - y) < r) return true;
    for (const l of w.lines.values()) {
      const a = w.dots.get(l.a), b = w.dots.get(l.b);
      if (!a || !b) continue;
      for (let k = 0; k <= 10; k++) if (Math.hypot(a.x + (b.x - a.x) * k / 10 - x, a.y + (b.y - a.y) * k / 10 - y) < r) return true;
    }
    return false;
  };
  const s = { level, games: 0, botDots: 0, botShots: 0, botWins: 0, myWins: 0, draws: 0, botHitWall: 0, botOwnBullet: 0, iHitWall: 0 };
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    const wd = await practiceWalls(level);
    s.games++;
    const { me, them } = wd;
    let k = 0;
    while (wd.phase() === 'play' && Date.now() < end + 5000) {
      const keys = wd.keys;
      for (const key of ['u', 'd', 'l', 'r']) keys[key] = false;
      for (let tries = 0; tries < 12; tries++) {
        const dx = Math.floor(Math.random() * 3) - 1, dy = Math.floor(Math.random() * 3) - 1;
        if (!dx && !dy) continue;
        if (near(wd, me.x + dx * 50, me.y + dy * 50, 42) || near(wd, me.x + dx * 25, me.y + dy * 25, 42)) continue;
        if (dx < 0) keys.l = true; else if (dx > 0) keys.r = true;
        if (dy < 0) keys.u = true; else if (dy > 0) keys.d = true;
        break;
      }
      if (k++ % 3 === 0) { me.buildCd = 0; wd.build(me); }
      await sleep(250);
    }
    for (const key of ['u', 'd', 'l', 'r']) wd.keys[key] = false;
    s.botDots += wd.walls[them.i].next - 1;
    s.botShots += wd.shotN[them.i] - 1;
    if (wd.phase() !== 'ko') { wd.endGame(-1); continue; }
    const w = wd.winner();
    if (w === them.i) s.botWins++; else if (w === me.i) s.myWins++; else s.draws++;
    if (them.dead && them.why === 'wall') s.botHitWall++;
    if (them.dead && them.why === 'own') s.botOwnBullet++;
    if (me.dead && me.why === 'wall') s.iHitWall++;
    await sleep(500);
  }
  await check(level + ' bot: builds walls', s.botDots >= 1, s);
  await check(level + ' bot: shoots', s.botShots >= 1, s);
  await check(level + " bot: never walks into the player's walls", s.botHitWall === 0, s);
}

async function wallOnline() {
  const before = window.__wd;
  location.hash = '#/solos';
  await until(() => !$('caModal').classList.contains('hidden'), 5000, 'the safety tip');
  clickModal('find a match');
  await log('looking for a match', true);
  await until(() => seen.match, 240000, 'the server to pair the two browsers'); // (a plays against the bot first)
  const wd = await until(() => window.__wd !== before && window.__wd, 40000, 'Wall Duel to start online');
  await check('online: the game is Wall Duel', /Wall Duel/.test($('scGame').textContent), $('scGame').textContent);
  await until(() => wd.phase() === 'play', 10000, 'the countdown');
  const { me, walls } = wd;
  const host = me.i === 0;
  const HOST_DOTS = [[480, 150], [480, 230], [480, 310]], GUEST_DOTS = [[760, 150], [760, 250]];
  const at = (d, [x, y]) => !!d && Math.abs(d.x - x) < 0.5 && Math.abs(d.y - y) < 0.5;
  const build = async ([x, y]) => { put(me, x, y); me.buildCd = 0; const ok = wd.build(me); await sleep(300); return ok; };
  if (host) {
    for (const p of HOST_DOTS) await build(p);
    put(me, 200, 270);
    await check('online (host): I built 3 dots and 2 walls', walls[0].dots.size === 3 && walls[0].lines.size === 2);
    await until(() => walls[1].dots.size === 2, 20000, "the guest's 2 dots to show up here");
    await check("online (host): the guest's wall shows up where the guest built it",
      GUEST_DOTS.every((p, i) => at(walls[1].dots.get(i + 1), p)) && walls[1].lines.size === 1);
    const d = walls[1].dots.get(1);
    await until(() => wd.openLeft(d) > 0.5, 6000, "the guest's first dot to open");
    put(me, 680, 150);
    me.fireCd = 0;
    wd.shoot(me, 1, 0);
    await until(() => !walls[1].dots.has(1), 3000, 'the open dot to break');
    await check('online (host): my bullet broke the open dot, and its wall went with it', !walls[1].lines.size && walls[1].dots.has(2));
    put(me, 200, 270);
  } else {
    await until(() => walls[0].dots.size === 3, 20000, "the host's 3 dots to show up here");
    await check("online (guest): the host's wall shows up where the host built it",
      HOST_DOTS.every((p, i) => at(walls[0].dots.get(i + 1), p)) && walls[0].lines.size === 2);
    for (const p of GUEST_DOTS) await build(p);
    put(me, 860, 450);
    await until(() => !walls[1].dots.has(1), 20000, 'the host to break my open dot');
    await check('online (guest): the host broke my open dot here too, with its wall', walls[1].lines.size === 0 && walls[1].dots.has(2));
    await sleep(500);
    await until(() => { put(me, 480, 270); return !me.shield; }, 3000, "touching the host's wall to break my shield"); // (right on the host's wall)
    await until(() => { put(me, 480, 270); return me.dead; }, 4000, "touching the host's wall again to knock me out");
    await check("online (guest): touching the host's wall broke my shield, then knocked me out", me.why === 'wall');
  }
  await until(() => wd.phase() === 'ko', 8000, 'the K.O.');
  await check('online: both apps agree the host won', wd.winner() === 0, { winner: wd.winner(), host });
  await until(() => !$('vs').classList.contains('hidden') && !$('vsReact').classList.contains('hidden'), 10000, 'the after-game screen');
  await check('online: the after-game screen shows the right result', $('rxTitle').textContent === (host ? 'You win!' : 'You lost'), $('rxTitle').textContent);
  await sleep(3000); // (let the other browser finish its checks)
}

/* ---------- the arcade duels (games-duel.js) ---------- */

const DUEL_KEYS = ['u', 'd', 'l', 'r', 'a', 'e', 'fire', 'alt'];
function mash(d) { // random controls, changing every few moments
  for (const k of DUEL_KEYS) if (Math.random() < 0.25) { if (Math.random() < 0.5) d.press(k); else d.release(k); }
  d.aim.x = Math.random() * d.api.W;
  d.aim.y = Math.random() * d.api.H;
  d.aim.seen = true;
}
const letGo = d => DUEL_KEYS.forEach(k => d.release(k));

async function duels() {
  if (role === 'a') {
    for (const id of DUELS) {
      if (!CA.games.ids().includes(id)) { await check(id + ' is a game', false); continue; }
      await duelPractice(id);
    }
  }
  await duelOnline();
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 5000, 'the menu');
  await CA.deleteAccount(PASS);
  await check('the test account was deleted', !CA.user);
  await log('done', true);
}

// A whole game against the bot (at 6 times the speed), with random controls, has to end with a result.
async function duelPractice(id) {
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 5000, 'the menu');
  document.querySelector('#practiceLevel [data-level="medium"]').click();
  window.__duel = null;
  location.hash = '#/practice?game=' + id;
  const d = await until(() => window.__duel && window.__duel.id === id && window.__duel, 15000, id + ' to start');
  await until(() => d.phase() === 'play', 8000, id + ': the countdown');
  window.__duelSpeed = 6;
  const end = Date.now() + 60000;
  let result = null;
  while (Date.now() < end && !(result = $('stage').querySelector('.result h2'))) {
    if (d.phase() === 'play') mash(d);
    await sleep(150);
  }
  window.__duelSpeed = 1;
  letGo(d);
  await check(id + ': a whole game against the bot plays through to a result', !!result,
    result ? result.textContent : { phase: d.phase(), state: JSON.stringify(d.state()).slice(0, 300) });
}

// Online: the host's app runs the game, the guest's app sends its controls and draws what the host sends.
async function duelOnline() {
  const before = window.__duel;
  location.hash = '#/solos';
  await until(() => !$('caModal').classList.contains('hidden'), 5000, 'the safety tip');
  clickModal('find a match');
  await log('looking for a match', true);
  await until(() => seen.match, 600000, 'the server to pair the two browsers'); // (B waits while A plays every practice game first)
  const d = await until(() => window.__duel !== before && window.__duel && window.__duel.id === DUEL_ONLINE && window.__duel, 40000, DUEL_ONLINE + ' to start online');
  await until(() => d.phase() === 'play', 10000, 'the countdown');
  const host = d.api.host;
  const t0 = Date.now();
  while (Date.now() - t0 < 6000 && d.phase() === 'play') { mash(d); await sleep(150); }
  letGo(d);
  const st = d.state();
  if (st && st.mine) await check('online (' + DUEL_ONLINE + '): the other player\'s half of the game arrives', !!st.theirs, st.theirs);
  else if (host) await check('online (' + DUEL_ONLINE + ', host): the guest\'s controls arrive', !!d.guestInput(), d.guestInput());
  else await check('online (' + DUEL_ONLINE + ', guest): the host\'s game arrives', d.snaps() > 10, d.snaps());
  if (host && d.phase() === 'play') d.end(0, 'TEST');
  await until(() => d.phase() === 'ko', 8000, 'the end of the game');
  await check('online (' + DUEL_ONLINE + '): both apps agree who won (the host ended it with a win for itself)', d.winner() === 0, { winner: d.winner(), host });
  await log('online winner seen by ' + (host ? 'host' : 'guest') + ': ' + d.winner(), true);
  await until(() => !$('vs').classList.contains('hidden') && !$('vsReact').classList.contains('hidden'), 10000, 'the after-game screen');
  await sleep(3000);
}

main().catch(err => log('stopped', false, String(err.message || err)));

})();
