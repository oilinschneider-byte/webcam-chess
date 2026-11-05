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

   Round …&mode=rules (one browser): the rules of Turf War, Cheese Heist, Pond War and Panic Chess, one by one, and a whole
   game of each against the bot.

   Each step is sent to the test server, which writes it to a file the test script reads. */
(() => {
'use strict';

const q = new URLSearchParams(location.search);
const role = q.get('autotest');
if (role !== 'a' && role !== 'b') return;
const camTest = q.get('mode') === 'cam';
const wallTest = q.get('mode') === 'walls';
const duelTest = q.get('mode') === 'duels';
const glingusTest = q.get('mode') === 'glingus';
const perfTest = q.get('mode') === 'perf';
const rulesTest = q.get('mode') === 'rules'; // (the rules of Turf War, Cheese Heist, Pond War and Panic Chess, one by one)
const lookTest = q.get('mode') === 'look'; // (just stops at the home screen, for a screenshot)
const netTest = q.get('mode') === 'net'; // (one online game, chosen with &online=, on a good and then on a bad connection)
const withCam = camTest || !!q.get('cam');
if (q.get('nofast') === role) window.__noFast = true;
const DUELS = (q.get('games') || 'trails,box,sumo,pond,hockey,paint,cannons,golf,mouse,kart,swords,stare,boxing,dodge,parkour,poop,speedchess').split(',');
const DUEL_ONLINE = q.get('online') || 'sumo';
const run = (q.get('run') || 'x').replace(/[^a-z0-9]/gi, '').slice(0, 8);
const NAME = 'zt' + run + role;
const PASS = 'test-pass-' + run;
const adult = role === 'a' || camTest || wallTest || duelTest || glingusTest || perfTest || netTest || rulesTest;
window.__introMs = 1500;   // (shorter face-to-face screens)
window.__reactMs = 15000;
if (glingusTest) { window.__standInMs = 2000; window.__reactMs = 60000; window.__testHooks = true; } else window.__noStandIn = true; // (the other rounds wait a long time for each other: no stand-ins)
window.__forceGame = wallTest ? 'walls' : camTest ? 'ttt' : 'rps'; // (Tic-Tac-Toe waits for moves, so there's time to check the cameras)
if (wallTest || duelTest || perfTest || netTest || camTest || rulesTest) window.__testHooks = true; // (the games then let the test look inside: window.__wd, window.__duel)
if (netTest) window.__forceGame = DUEL_ONLINE;
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

// (A guest needs no password: logging out is all it takes for it to be gone.)
async function leave() {
  if (CA.profile && CA.profile.guest) { CA.logOut(); await sleep(800); } else await CA.deleteAccount(PASS);
}

async function main() {
  await until(() => CA.route, 15000, 'the page to load');
  if (CA.user) CA.logOut();
  if (CA.route !== 'auth') { location.hash = '#/auth'; await until(() => CA.route === 'auth', 5000, 'the sign-up page'); }

  if (q.get('guest')) { // (&guest=1, for rounds that don't need an account: see -Guests in test-browsers.ps1)
    $('guestBtn').click();
    await until(() => CA.user, 15000, 'the guest to start');
    await sleep(500);
  } else {
  // Sign up through the form, like a person would.
  document.querySelector('[data-auth="signup"]').click();
  $('authUser').value = NAME;
  $('authPass').value = PASS;
  $('authPass2').value = PASS;
  $('authMonth').value = '1';
  $('authYear').value = String(adult ? 1990 : new Date().getFullYear() - 15);
  $('authRules').checked = true;
  await new Promise(r => setTimeout(r, 1700)); // (the sign-up form turns away anything filled in faster than a person could)
  $('authSubmit').click();
  await until(() => CA.user || ($('authMsg').classList.contains('error') && $('authMsg').textContent), 20000, 'sign up');
  if (!CA.user) throw new Error('sign up failed: ' + $('authMsg').textContent);
  await check('sign up through the form', CA.profile.name === NAME && CA.profile.streak === 0, { name: CA.profile.name });
  await check(adult ? 'an adult can video chat' : 'a 15-year-old plays as a cat only', CA.canVideoChat() === adult);

  await until(() => CA.route === 'perm', 5000, 'the camera question');
  }
  if (withCam && CA.route !== 'perm') { // (a guest goes straight to the home screen: turn the camera on from there)
    await CA.voice.startCamera();
    await check('the camera is on', CA.voice.cameraOn());
  } else if (withCam) {
    $('permAllow').click();
    await until(() => !$('permContinue').classList.contains('hidden') || $('permMsg').classList.contains('error'), 15000, 'the camera to turn on');
    if ($('permMsg').classList.contains('error')) throw new Error('camera: ' + $('permMsg').textContent);
    $('permContinue').click();
  } else if (CA.route === 'perm') {
    $('permSkip').click();
  }
  await until(() => CA.route === 'menu', 5000, 'the menu');
  if (glingusTest && role === 'b') { // the home screen has no chess with a friend, old links go home, and Chess vs Computer still works
    await check('no Chess card on the home screen', !document.querySelector('.mode-card.chess') && !!document.querySelector('.mode-card.classic'));
    location.hash = '#/chess?room=ABCDEF';
    await sleep(800);
    await check('an old chess invite link goes to the home screen', CA.route === 'menu', CA.route);
    location.hash = '#/chess?bot=1';
    await until(() => CA.route === 'chess', 5000, 'Chess vs Computer');
    await sleep(800);
    await check('Chess vs Computer still starts', !$('leaveBtn').closest('.hidden'), CA.route);
    $('leaveBtn').click();
    await sleep(800);
    if (!$('caModal').classList.contains('hidden')) { $('caModalBtns').querySelector('button:last-child').click(); await sleep(800); }
    await check('leaving it goes back to the home screen, not a chess lobby', CA.route === 'menu', CA.route);
    location.hash = '#/menu';
    await until(() => CA.route === 'menu', 5000, 'the menu');
  }
  if (wallTest) { await wallDuel(); return; }
  if (lookTest) return;
  if (perfTest) { await perf(); return; }
  if (netTest) { await netRound(); return; }
  if (rulesTest) { await rules(); return; }
  if (duelTest) { await duels(); return; }
  if (glingusTest) { await glingus(); return; }
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
      await until(() => window.__videoCapped, 15000, 'my camera to get its limit');
      await check('my camera has a limit, so it can\'t hold up the game', true);
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
  await leave();
  await check('the test account was deleted', !CA.user);
  await log('done', true);
}

/* ---------- nobody turns up: the stand-ins ---------- */

// a searches and nobody turns up (b stays on the menu, and never searches): first the bot, then Glingus.
async function glingus() {
  if (role === 'a') {
    window.__glingusChance = 0;
    window.__mockMs = 1500;
    location.hash = '#/solos';
    await until(() => !$('caModal').classList.contains('hidden'), 5000, 'the safety tip');
    clickModal('find a match');
    await log('looking for a match', true);
    await until(() => $('themName').textContent.includes('🤖'), 20000, 'the bot');
    await check('nobody turned up: you are told it is a bot', $('scMode').textContent.includes('Bot game') && $('themStreak').textContent.includes('Bot'), [$('scMode').textContent, $('themStreak').textContent]);
    const name = $('themName').textContent.replace(' 🤖', '');
    await until(() => !$('caToast').classList.contains('hidden') && $('caToast').textContent.includes(name), 8000, 'the bot to make fun of you');
    await check('the bot makes fun of you', true, $('caToast').textContent);
    await until(() => !$('vs').classList.contains('hidden') && !$('vsReact').classList.contains('hidden'), 150000, 'the game against the bot to end');
    await check('the game ends and says it did not count', $('rxReward').textContent.includes('nothing is counted'), $('rxReward').textContent);
    await check('my streak is still 0', CA.profile.streak === 0);
    window.__glingusChance = 1;
    window.__clipInMs = 500;
    $('nextBtn').click();
    await until(() => !$('searchView').classList.contains('hidden'), 5000, 'the search');
    await check('after the bot, it goes back to looking for real players', true);
    await until(() => $('themName').textContent.includes('omegakilla6769'), 20000, 'Glingus');
    await check('Glingus looks like a player', !$('themName').textContent.includes('🤖') && $('themStreak').textContent.includes('🔥') && $('scMode').textContent.includes('Classic Games'),
      [$('themName').textContent, $('themStreak').textContent, $('scMode').textContent]);
    await until(() => $('themVideo').srcObject && !$('themVideo').classList.contains('hidden'), 90000, "Glingus's camera to come on");
    await check("Glingus's camera comes on", window.__glingusClip && !window.__glingusClip.paused, { t: window.__glingusClip.currentTime });
    const c = window.__glingusClip;
    await until(() => c.ended && $('themVideo').classList.contains('hidden'), 25000, 'the clip to finish');
    await check('the clip plays to the end, and his camera turns off', c.currentTime > c.duration - 0.5 && !c.loop && !$('themVideo').srcObject, { at: c.currentTime, of: c.duration });
    await sleep(2000);
    await check("it doesn't repeat", c.ended && $('themVideo').classList.contains('hidden'));
    await until(() => !$('vs').classList.contains('hidden') && !$('vsReact').classList.contains('hidden'), 150000, 'the game against Glingus to end');
    await check('his game says friendly, and nothing is counted', $('rxReward').textContent.includes('Friendly') && CA.profile.streak === 0, $('rxReward').textContent);
    window.__glingusChance = 0;
    window.__standInMs = 3600000;
    $('nextBtn').click();
    await until(() => !$('searchView').classList.contains('hidden'), 5000, 'the search');
    $('cancelSearchBtn').click();
  }
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 5000, 'the menu');
  await leave();
  await check('the test account was deleted', !CA.user);
  if (role === 'b') { // the ads choice and the Privacy Policy, with an adult account
    const consents = () => window.dataLayer.filter(d => d[0] === 'consent').map(d => [d[1], d[2].ad_storage]);
    await check('the Google tag starts with a consent setting', consents().some(c => c[0] === 'default'), consents());
  }
  if (role === 'b') { // play as a guest, from the first screen
    location.hash = '#/privacy';
    await sleep(500);
    await check('the Privacy Policy opens without logging in', CA.route === 'privacy' && $('privacyChoice').offsetParent !== null, CA.route);
    location.hash = '#/terms';
    await sleep(500);
    await check('the Terms of Service open without logging in', CA.route === 'terms' && $('scr-terms').offsetParent !== null, CA.route);
    await check('the $100 tournament only begins at 5,000 users', $('lbPrizeRules').textContent.includes('$100') && $('lbPrizeRules').textContent.includes('5,000 users') && !document.documentElement.innerHTML.includes('$100 every week'));
    location.hash = '#/privacy';
    await sleep(500);
    await check('the ads banner shows', !$('consentBar').classList.contains('hidden'));
    $('consentNo').click();
    await sleep(300);
    const last = window.dataLayer.filter(d => d[0] === 'consent').pop();
    await check('declining turns the Google tag off and hides the banner', last[1] === 'update' && last[2].ad_storage === 'denied' && $('consentBar').classList.contains('hidden') && localStorage.getItem('camarcade-ads-consent') === 'no', [last[1], last[2]]);
    await until(() => CA.route === 'auth' || !CA.user, 5000, 'being logged out');
    location.hash = '#/auth';
    await until(() => CA.route === 'auth', 5000, 'the first screen');
    $('guestBtn').click();
    await until(() => CA.user, 15000, 'the guest to start');
    await check('a guest gets a funny name, and counts as under 18', CA.profile.guest && /^[A-Za-z]+[0-9]{2}$/.test(CA.profile.name) && !CA.canVideoChat(), CA.profile.name);
    await until(() => CA.route === 'perm' || CA.route === 'menu', 5000, 'the next screen');
    if (CA.route === 'perm') $('permSkip').click();
    await until(() => CA.route === 'menu', 5000, 'the menu');
    await check('the home screen says nothing is saved', getComputedStyle(document.querySelector('.guest-note')).display !== 'none');
    await until(() => !$('todayCard').classList.contains('hidden'), 10000, "today's top players");
    await check("today's top players shows next to Classic Games", !!$('todayTitle').textContent, $('todayTitle').textContent);
    location.hash = '#/cat';
    await sleep(600);
    await check('a guest has no shop', CA.route === 'menu', CA.route);
    location.hash = '#/pass';
    await sleep(600);
    await check('a guest has no Streak Pass', CA.route === 'menu', CA.route);
    await check('the shop and Streak Pass links are hidden', getComputedStyle(document.querySelector('[data-nav="cat"]')).display === 'none' && getComputedStyle(document.querySelector('[data-nav="pass"]')).display === 'none');
    const before = { xp: CA.profile.xp, fish: CA.profile.fish };
    CA.applyResult('win');
    await check('a guest earns no XP or fish', CA.profile.xp === before.xp && CA.profile.fish === before.fish, { xp: CA.profile.xp, fish: CA.profile.fish });
    CA.logOut();
    await check('leaving as a guest ends it', !CA.user && !document.body.classList.contains('guest'));
  }
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
  await leave();
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

// How smoothly each game runs (tools/perf.ps1 shows the results): frames a second, how long the slowest frames took, how
// much time the code takes each frame, tasks that froze the page for over 50 ms, and how big one online update is.
async function perf() {
  const realRaf = window.requestAnimationFrame.bind(window);
  let cost = 0, rec = null;
  window.requestAnimationFrame = fn => realRaf(t => { const a = performance.now(); try { fn(t); } finally { cost += performance.now() - a; } });
  try { new PerformanceObserver(l => { if (rec) rec.long += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* not in this browser */ }
  const beat = t => { if (rec) { if (rec.last) { rec.gaps.push(t - rec.last); rec.js.push(cost); } rec.last = t; } cost = 0; realRaf(beat); };
  realRaf(beat);
  const pct = (list, p) => { const a = list.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0; };
  const avg = list => list.reduce((x, y) => x + y, 0) / (list.length || 1);
  const r1 = v => Math.round(v * 10) / 10;
  async function sample(ms, tick) {
    rec = { gaps: [], js: [], long: 0, last: 0 };
    const end = performance.now() + ms;
    while (performance.now() < end) { if (tick) tick(); await sleep(150); }
    const r = rec;
    rec = null;
    return { fps: r1(1000 / (avg(r.gaps) || 1)), gap95: r1(pct(r.gaps, 0.95)), worst: r1(pct(r.gaps, 1)), js: r1(avg(r.js)), js95: r1(pct(r.js, 0.95)), long: r.long };
  }
  await sleep(1500);
  await log('perf home screen', true, Object.assign(await sample(4000), { bytes: 0 }));
  const wanted = q.get('games');
  const ids = wanted === 'all' ? CA.games.ids() : wanted ? wanted.split(',') : ['trails', 'box', 'sumo', 'pond', 'hockey', 'paint', 'cannons', 'golf', 'mouse', 'kart', 'swords', 'stare', 'boxing', 'dodge', 'parkour', 'poop', 'hoops', 'barrel', 'walls', 'climb', 'snake', 'stack', 'simon'];
  if (!withCam) window.__fakeFace = { face: true, blink: 0 };
  for (const id of ids) {
    if (!CA.games.ids().includes(id)) { await check(id + ' is a game', false); continue; }
    location.hash = '#/menu';
    await until(() => CA.route === 'menu', 8000, 'the menu');
    window.__duel = null;
    location.hash = '#/practice?game=' + id;
    await until(() => CA.route === 'practice' || CA.route === 'solos', 8000, id);
    await until(() => $('stage').children.length && !$('stage').querySelector('.stage-wait'), 20000, id + ' to start');
    await sleep(3500);
    const d = window.__duel;
    const stats = await sample(7000, d ? () => { if (d.phase() === 'play') mash(d); } : null);
    if (d) letGo(d);
    stats.bytes = d && d.snapBytes ? d.snapBytes() : 0;
    await log('perf ' + id, true, stats);
    if (!$('caModal').classList.contains('hidden')) clickModal('Leave');
  }
  await sleep(500);
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 8000, 'the menu');
  await sleep(1500);
  await log('perf home, after', true, Object.assign(await sample(4000), { bytes: 0 }));
  // The body tracker: how long it holds up the page each time it looks at a camera picture.
  if (!wanted || wanted.includes('tracker')) {
    try {
      const P = CA.games.pose;
      const loaded = sample(5000);
      const det = await P.loadDetector();
      await loaded.then(st => log('perf tracker load', true, Object.assign(st, { bytes: 0 })));
      await log('body tracker runs in a background thread', det.inWorker, det.inWorker);
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      const v = document.createElement('video');
      v.muted = true;
      v.srcObject = cam;
      await v.play();
      const read = P.reader(), times = [];
      for (let k = 0; k < 40; k++) {
        await sleep(50);
        const a = performance.now();
        read(v);
        times.push(performance.now() - a);
      }
      cam.getTracks().forEach(t => t.stop());
      await log('body tracker, ms per look', true, { first: r1(times[0]), usual: r1(pct(times.slice(5), 0.5)), slow: r1(pct(times.slice(5), 0.95)) });
      // And does it still find a real person, and their face? (the clip has someone in it)
      const clip = document.createElement('video');
      clip.muted = true;
      clip.loop = true;
      clip.src = 'glingus.mp4';
      await clip.play();
      const read2 = P.reader();
      let body = null;
      for (let k = 0; k < 150 && !body; k++) { await sleep(100); body = read2(clip); }
      await check('the body tracker finds the person in a video', !!body, body ? { nose: [r1(body[0].x * 100), r1(body[0].y * 100)], seen: r1(body[0].visibility * 100) } : null);
      const face = await CA.tracker.load('face');
      let eyes = null, seenN = -1;
      for (let k = 0; k < 150 && !eyes; k++) {
        await sleep(100);
        const got = face.look(clip);
        if (got.n === seenN) continue;
        seenN = got.n;
        const bs = got.res && got.res.faceBlendshapes && got.res.faceBlendshapes[0];
        if (bs && bs.categories.length) eyes = bs.categories.map(c => [c.categoryName, r1(c.score * 100)]);
      }
      await check('the face tracker reads the eyes of the person in a video', !!eyes, { eyes, inWorker: face.inWorker });
      clip.pause();
    } catch (e) { await log('body tracker', false, String(e)); }
  }
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 8000, 'the menu');
  await leave();
  await log('done', true);
}

// One online game, on a good connection and then on a bad one: everything has to keep arriving, without a single error.
async function netRound() {
  if (q.get('revenge')) { await revengeRound(); return; }
  location.hash = '#/solos';
  await until(() => !$('caModal').classList.contains('hidden'), 5000, 'the safety tip');
  clickModal('find a match');
  await until(() => seen.match, 90000, 'the server to pair the two browsers');
  await until(() => $('vs').classList.contains('hidden') && $('stage').children.length && !$('stage').querySelector('.stage-wait'), 40000, 'the game to start');
  if (role === 'a') await videoLimit();
  await sleep(6000);
  if (DUEL_ONLINE === 'speedchess') { // both move a pawn: each checks the other's move shows up
    const P = window.__panic, mine = P.pieces().filter(p => p.c === P.meC && p.t === 'p').sort((x, y) => x.id - y.id)[role === 'a' ? 2 : 5];
    const toY = Math.round(mine.y) + (P.meC === 0 ? -1 : 1);
    P.order(mine.id, Math.round(mine.x), toY);
    await sleep(2000);
    const after = P.pieces().find(p => p.id === mine.id);
    await check('speedchess: my move happens', Math.round(after.y) === toY, { y: after.y, toY });
    const movedTheirs = P.pieces().filter(p => p.c !== P.meC && p.t === 'p' && Math.round(p.y) !== (P.meC === 0 ? 1 : 6)).length;
    await check("speedchess: I see the other player's move", movedTheirs === 1, movedTheirs);
  }
  const noFast = !!q.get('nofast');
  const a = window.__net();
  if (noFast) await check(DUEL_ONLINE + ': with no fast lane, it uses the normal connection', !a.fast && a.got > 5, a);
  else await check(DUEL_ONLINE + ': updates take the fast lane', a.fast && a.got > 5, a);
  await sleep(3000);
  const b = window.__net();
  await check(DUEL_ONLINE + ': updates keep coming', b.got > a.got, b);
  // (Only some players use this: not the host of an arcade duel, who runs the game, and not in Shadow Boxing, where each app
  // runs its own half. Turf War sends its big updates less often, so it stays about the same.)
  if (!noFast && b.used && DUEL_ONLINE !== 'paint') await check(DUEL_ONLINE + ': the other player is drawn less far in the past than before (100 ms), now ' + b.delay + ' ms', b.delay < 100, b);
  if (!noFast && !q.get('nochaos')) {
    window.__netChaos = { drop: 0.1, late: 70 };
    await sleep(5000);
    window.__netChaos = null;
    const c = window.__net();
    await check(DUEL_ONLINE + ': on a bad connection, updates keep coming', c.got > b.got, c);
    if (b.used) await check(DUEL_ONLINE + ': on a bad connection, it draws further in the past to stay smooth, now ' + c.delay + ' ms', c.delay > b.delay, { before: b.delay, after: c.delay });
  }
  await sleep(1000);
  await check(DUEL_ONLINE + ': the game is still going', !$('stage').querySelector('.result'), $('scGame').textContent);
  if (role === 'b') await sleep(6000); // (a got here later: it stopped to check the camera limit, and b leaving ends a's game)
  if ($('skipBtn') && !$('skipBtn').closest('.hidden')) { $('skipBtn').click(); try { clickModal('Skip'); } catch (e) { /* no question this time */ } }
  await sleep(1500);
  location.hash = '#/menu';
  await sleep(1000);
  if (!$('caModal').classList.contains('hidden')) { $('caModalBtns').querySelector('button:last-child').click(); await sleep(800); }
  await until(() => CA.route === 'menu', 8000, 'the menu');
  await leave();
  await log('done', true);
}

// After a game: the loser's button says Revenge, both see the score between them, and pressing it plays on.
async function revengeRound() {
  location.hash = '#/solos';
  await until(() => !$('caModal').classList.contains('hidden'), 5000, 'the safety tip');
  clickModal('find a match');
  await until(() => seen.match, 90000, 'the server to pair the two browsers');
  const d = await until(() => window.__duel && window.__duel.id === DUEL_ONLINE && window.__duel, 40000, 'the game');
  await until(() => d.phase() === 'play', 10000, 'the countdown');
  const host = d.api.host;
  await sleep(1500);
  if (host) d.end(0, 'TEST');
  await until(() => !$('vsReact').classList.contains('hidden') && $('vsReact').offsetParent !== null, 12000, 'the screen after the game');
  const btn = $('rematchBtn'), vs = $('rxVs').textContent;
  await check(host ? 'after a win, the button says Rematch' : 'after a loss, the button says Revenge', host ? /Rematch/.test(btn.textContent) : /Revenge/.test(btn.textContent), btn.textContent);
  await check('both see the score between them', host ? /You 1 – 0/.test(vs) : /You 0 – 1/.test(vs), vs);
  window.__duel = null;
  btn.click();
  const d2 = await until(() => window.__duel && window.__duel !== d && window.__duel.id === DUEL_ONLINE && window.__duel, 15000, 'the next game');
  await check('pressing it starts another game against the same player', !!d2);
  await until(() => d2.phase() === 'play', 10000, 'the countdown');
  await sleep(1000);
  if (host) d2.end(1, 'TEST');
  await until(() => !$('vsReact').classList.contains('hidden') && $('vsReact').offsetParent !== null, 12000, 'the screen after the game');
  const vs2 = $('rxVs').textContent;
  await check('the score keeps count', /You 1 – 1/.test(vs2), vs2);
  await sleep(1500);
  location.hash = '#/menu';
  await sleep(1000);
  if (!$('caModal').classList.contains('hidden')) { $('caModalBtns').querySelector('button:last-child').click(); await sleep(800); }
  await until(() => CA.route === 'menu', 8000, 'the menu');
  await leave();
  await log('done', true);
}

// The limit on the camera, on a connection from this page to itself. (A real one needs two adult accounts: see round 2.)
async function videoLimit() {
  const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  const one = new RTCPeerConnection(), two = new RTCPeerConnection();
  one.onicecandidate = e => { if (e.candidate) two.addIceCandidate(e.candidate); };
  two.onicecandidate = e => { if (e.candidate) one.addIceCandidate(e.candidate); };
  cam.getTracks().forEach(t => one.addTrack(t, cam));
  await one.setLocalDescription(await one.createOffer());
  await two.setRemoteDescription(one.localDescription);
  await two.setLocalDescription(await two.createAnswer());
  await one.setRemoteDescription(two.localDescription);
  CA.capVideo({ peerConnection: one });
  const sender = one.getSenders().find(s => s.track && s.track.kind === 'video');
  const on = () => { const e = sender.getParameters().encodings; return e && e[0] && e[0].maxBitrate === 700000 && e[0].maxFramerate === 24; };
  await until(on, 10000, 'the camera limit');
  await check('the camera gets its limit once it is connected', true, sender.getParameters().encodings[0].maxBitrate);
  one.close();
  two.close();
  cam.getTracks().forEach(t => t.stop());
}

/* ---------- the rules of the four big games ---------- */

async function startPractice(id) {
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 8000, 'the menu');
  window.__duel = null;
  location.hash = '#/practice?game=' + id;
  const d = await until(() => window.__duel && window.__duel.id === id && window.__duel, 15000, id + ' to start');
  await until(() => d.phase() === 'play', 8000, id + ': the countdown');
  return d;
}
// (a picture of the game, for checking how it looks: the test server writes it to the log)
function shot(name) {
  const c = $('dlCanvas');
  return c ? log('shot ' + name, true, c.toDataURL('image/png')) : null;
}
const wait = sleep;

async function rules() {
  if (!q.get('skip') || !q.get('skip').includes('paint')) await turfRules();
  if (!q.get('skip') || !q.get('skip').includes('mouse')) await heistRules();
  if (!q.get('skip') || !q.get('skip').includes('pond')) await pondRules();
  if (!q.get('skip') || !q.get('skip').includes('chess')) await chessRules();
  location.hash = '#/menu';
  await until(() => CA.route === 'menu', 8000, 'the menu');
  await leave();
  await log('done', true);
}

async function turfRules() {
  const d = await startPractice('paint');
  const S = d.state(), me = S.cats[0], them = S.cats[1];
  const gone = () => { them.dead = 500; them.spray = false; them.x = 900; them.y = 500; };
  gone();
  S.t = 2;
  const speedOn = async color => {
    for (let k = 0; k < S.grid.length; k++) if (S.grid[k] !== 3) S.grid[k] = color;
    me.x = 200; me.y = 300; me.vx = 0; me.vy = 0;
    d.press('r');
    await wait(150);
    const x0 = me.x, t0 = performance.now();
    await wait(400);
    const sp = (me.x - x0) / ((performance.now() - t0) / 1000);
    d.release('r');
    return sp;
  };
  const own = await speedOn(1), theirs = await speedOn(2);
  await check('Turf War: you run much faster on your own paint than on theirs', own > theirs * 1.5, { own: Math.round(own), theirs: Math.round(theirs) });
  // claiming land: a closed square of your paint
  for (let k = 0; k < S.grid.length; k++) if (S.grid[k] !== 3) S.grid[k] = 0;
  S.count = [0, 0];
  const CS = 15, GC = 64;
  for (let gy = 16; gy <= 26; gy++) for (let gx = 20; gx <= 30; gx++) {
    if (gy === 16 || gy === 26 || gx === 20 || gx === 30) { S.grid[gy * GC + gx] = 1; S.count[0]++; }
  }
  them.dead = 0; them.x = 900; them.y = 500; them.safe = 0;
  await until(() => S.grid[21 * GC + 25] === 1, 3000, 'the land inside a loop to be claimed').catch(() => {});
  await check('Turf War: paint a closed loop and the land inside is yours', S.grid[21 * GC + 25] === 1, { count: S.count });
  await shot('turf-claim');
  // bursting the other cat
  S.bs = { think: 1e9, gx: 900, gy: 500, spray: false, hunt: false };
  them.hp = 8; them.safe = 0; them.dead = 0; them.x = 500; them.y = 300;
  me.x = 400; me.y = 300; me.ink = 100; me.dead = 0;
  d.aim.x = 500; d.aim.y = 300;
  d.press('fire');
  await until(() => them.dead > 0, 3000, 'the other cat to burst').catch(() => {});
  d.release('fire');
  await check('Turf War: spray the other cat and they burst, and it leaves your color', them.dead > 0 && S.grid[Math.floor(300 / CS) * GC + Math.floor(500 / CS)] === 1, { hp: them.hp, dead: them.dead });
  await wait(2300);
  await check('Turf War: they come back after a moment', them.dead <= 0 && them.hp === 100 && them.safe > 0, { dead: them.dead, safe: them.safe });
  gone();
  // the middle counts triple
  const K = 21 * GC + 25;
  S.t = 36;
  await wait(100);
  await check('Turf War: in the last 10 seconds the middle counts triple', S.sc[0] > S.count[0] || S.count[0] === 0, { sc: S.sc, count: S.count });
  await shot('turf-gold');
  // the comeback boost
  for (let k = 0; k < S.grid.length; k++) if (S.grid[k] !== 3) S.grid[k] = 2;
  S.count = [0, 2000];
  await wait(100);
  await check('Turf War: whoever is far behind gets the comeback boost', me.boost === true && them.boost === false);
  // a whole game against a real bot
  d.end(0, 'TEST');
  await until(() => $('stage').querySelector('.result'), 6000, 'the result').catch(() => {});
  const d2 = await startPractice('paint');
  window.__duelSpeed = 6;
  const end = Date.now() + 20000;
  let best = 0, splats = 0;
  while (Date.now() < end && d2.phase() === 'play') { mash(d2); const st = d2.state(); best = Math.max(best, st.best[1]); splats = Math.max(splats, st.splats[1]); st.best[0] = Math.max(st.best[0], 50); await sleep(150); }
  window.__duelSpeed = 1;
  letGo(d2);
  await log('Turf War, a whole game: the bot', true, { score: d2.state().sc, botClaim: best, botSplats: splats });
  await until(() => $('stage').querySelector('.result'), 8000, 'the result').catch(() => {});
  const wasGuest = CA.profile.guest;
  if (wasGuest) {
    await check('a guest has no personal records', !$('stage').querySelector('.result').textContent.includes('New record') && !CA.profile.records.paint);
    CA.profile.guest = false; // (only on this screen, to see what an account gets: the server still saves nothing for a guest)
    const d3 = await startPractice('paint');
    d3.state().best[0] = 50;
    d3.state().t = 44.8;
    await until(() => $('stage').querySelector('.result'), 8000, 'the result').catch(() => {});
  }
  const shown = $('stage').querySelector('.result').textContent;
  await check('a personal record is shown after the game', shown.includes('New record! Biggest land claim'), shown.slice(0, 200));
  await check('...and kept', CA.profile.records.paint && CA.profile.records.paint.claim >= 50, CA.profile.records);
  await check('...and only beaten by a bigger one', CA.setRecord('paint', 'claim', 5) === false && CA.setRecord('paint', 'claim', 1000) === true);
  if (wasGuest) { CA.profile.guest = true; CA.profile.records = {}; }
}

async function heistRules() {
  const d = await startPractice('mouse');
  const S = d.state(), me = S.movers[0], cat = S.movers[1];
  const park = () => { cat.hold = 1e6; cat.x = 700; cat.y = 80; };
  S.bs = { think: 1e9, tx: 700, ty: 80, dash: false, jump: false, patrol: null, heard: null, heardAt: -1 };
  park();
  await check('Cheese Heist: you start as the mouse in round 1, with 3 cheeses', S.mouseI === 0 && S.cheese.length === 3 && S.round === 1);
  const [ex, ey] = [20 + 22.5 * 40, 10 + 12.5 * 40];
  me.x = ex; me.y = ey;
  await wait(200);
  await check("Cheese Heist: the exit stays shut until you've stolen a cheese", S.phase === 'chase', S.phase);
  me.x = 30; me.y = 500;
  await wait(100);
  const ch = S.cheese[0];
  me.x = ch.x; me.y = ch.y;
  await until(() => S.got === 1, 2000, 'the cheese to be stolen').catch(() => {});
  await check('Cheese Heist: stealing a cheese scores 1 and makes a noise the cat can hear', S.got === 1 && S.sc[0] === 1 && !ch.on && !!S.ping, { got: S.got, sc: S.sc });
  await shot('heist-mouse');
  // a tunnel
  const [a, b] = S.tunnels[0];
  const cx = c => 20 + (c[0] + 0.5) * 40, cy = c => 10 + (c[1] + 0.5) * 40;
  me.tw = 0; me.x = cx(a); me.y = cy(a);
  await wait(120);
  await check('Cheese Heist: a tunnel takes the mouse across the maze', Math.hypot(me.x - cx(b), me.y - cy(b)) < 40 && me.tw > 0, { at: [me.x, me.y], to: [cx(b), cy(b)] });
  // the exit
  me.x = ex; me.y = ey;
  await until(() => S.phase === 'pause', 2000, 'the mouse to escape').catch(() => {});
  await check('Cheese Heist: escaping scores 2 more', S.phase === 'pause' && S.sc[0] === 3, { sc: S.sc, phase: S.phase });
  await until(() => S.round === 2, 4000, 'round 2');
  const me2 = S.movers[0], m2 = S.movers[1];
  await check('Cheese Heist: then you swap', S.mouseI === 1 && me2.role === 'cat' && m2.role === 'mouse');
  await shot('heist-cat');
  // a tie goes to sudden death
  S.sc = [1, 1];
  m2.hold = 1e6;
  m2.x = me2.x; m2.y = me2.y;
  await until(() => S.phase === 'pause', 2000, 'the catch').catch(() => {});
  await check('Cheese Heist: touching the mouse catches it', S.phase === 'pause');
  await until(() => S.round === 3, 4000, 'sudden death').catch(() => {});
  await check('Cheese Heist: a tie goes to sudden death, with one cheese', S.round === 3 && S.sudden && S.cheese.length === 1, { round: S.round });
  await shot('heist-sudden');
  const mi = S.mouseI, mm = S.movers[mi], cc = S.movers[1 - mi];
  mm.x = cc.x; mm.y = cc.y;
  await until(() => d.phase() === 'ko', 3000, 'the end').catch(() => {});
  await check('Cheese Heist: caught in sudden death, the cat wins', d.winner() === 1 - mi, { winner: d.winner(), mouse: mi });
  await until(() => $('stage').querySelector('.result'), 6000, 'the result').catch(() => {});
  // a whole game against a real bot, to see what it does
  const d2 = await startPractice('mouse');
  window.__duelSpeed = 6;
  const end = Date.now() + 25000;
  let botSteals = 0;
  while (Date.now() < end && d2.phase() === 'play') {
    mash(d2);
    const st = d2.state();
    if (st.mouseI === 1) botSteals = Math.max(botSteals, st.got);
    await sleep(150);
  }
  window.__duelSpeed = 1;
  letGo(d2);
  await log('Cheese Heist, a whole game: the bot', true, { score: d2.state().sc, botSteals, round: d2.state().round, winner: d2.winner() });
  await until(() => $('stage').querySelector('.result'), 8000, 'the result').catch(() => {});
}

async function pondRules() {
  const d = await startPractice('pond');
  const S = d.state(), me = S.cats[0], them = S.cats[1];
  const parkThem = () => { them.ph = 'parked'; them.k = 1e6; them.fish = null; }; // (the bot does nothing in a phase it doesn't know)
  parkThem();
  const oneFish = (t, x, y) => { S.fish.length = 0; S.fish.push({ t, x, y, a: 0, st: 'swim', k: 0, on: [false, false], p: 0, hx: 0, hy: 0, run: false, runK: 1, fade: 0, by: -1 }); return S.fish[0]; };
  const tap = async k => { d.press(k); await wait(70); d.release(k); };
  const f = oneFish(0, 420, 330);
  d.aim.x = 420; d.aim.y = 330; d.aim.seen = true;
  await wait(60);
  await tap('fire');
  await until(() => me.ph === 'bite', 6000, 'a bite').catch(() => {});
  await check('Pond War: cast near a fish and it comes and bites', me.ph === 'bite', me.ph);
  await shot('pond-bite');
  await tap('fire');
  await check('Pond War: press when it bites to hook it', me.ph === 'reel' && f.st === 'hooked', me.ph);
  await shot('pond-reel');
  f.runK = 1e6; f.run = false;
  // one long pull: it snaps, even on the smallest fish
  d.press('fire');
  await until(() => me.ph !== 'reel', 5000, 'the long pull to end').catch(() => {});
  d.release('fire');
  await check("Pond War: one long pull can't land a fish: the line snaps", me.ph === 'snapped' && me.got === 0, { ph: me.ph, got: me.got });
  await until(() => me.ph === 'idle', 3000, 'idle').catch(() => {});
  // a quick click while waiting reels back in; holding hooks the next bite
  S.fish.length = 0;
  await tap('fire');
  await until(() => me.ph === 'wait', 2000, 'the cast').catch(() => {});
  await wait(150);
  await tap('fire');
  await wait(100);
  await check('Pond War: a quick click while waiting reels back in', me.ph === 'back' || me.ph === 'idle', me.ph);
  await until(() => me.ph === 'idle', 2000, 'idle').catch(() => {});
  const f1 = oneFish(0, 420, 330);
  await tap('fire');
  await until(() => me.ph === 'wait', 2000, 'the cast').catch(() => {});
  d.press('fire');
  await until(() => me.ph === 'reel', 6000, 'the fish to hook itself').catch(() => {});
  await check('Pond War: press and hold, and the bite hooks and starts reeling by itself', me.ph === 'reel' && f1.st === 'hooked', me.ph);
  f1.runK = 1e6; f1.run = false;
  // pull and let go, keeping the needle in the green
  let pulls = 0, holding = true;
  const reelEnd = Date.now() + 15000;
  while (Date.now() < reelEnd && me.ph === 'reel') {
    if (holding && me.ten > 0.8) { d.release('fire'); holding = false; pulls++; }
    else if (!holding && me.ten < 0.5) { d.press('fire'); holding = true; }
    await sleep(16);
  }
  d.release('fire');
  await check('Pond War: pulling and letting go lands it, takes several pulls, and scores right away', me.sc === 1 && me.got === 1 && pulls >= 2, { sc: me.sc, ph: me.ph, pulls });
  await until(() => me.ph === 'idle', 3000, 'idle').catch(() => {});
  // too much tension
  const f2 = oneFish(1, 420, 330);
  d.aim.x = 420; d.aim.y = 330;
  await tap('fire');
  await until(() => me.ph === 'bite', 6000, 'a bite').catch(() => {});
  await tap('fire');
  f2.runK = 1e6; f2.run = true;
  d.press('fire');
  await until(() => me.ph === 'snapped', 3000, 'the line to snap').catch(() => {});
  d.release('fire');
  await check('Pond War: pull while it runs and the line snaps, and you keep your score', me.ph === 'snapped' && me.sc === 1, { ph: me.ph, sc: me.sc });
  await until(() => me.ph === 'idle', 3000, 'idle').catch(() => {});
  // a tug of war: cast onto the other cat's fish
  const f3 = oneFish(2, 500, 330);
  Object.assign(f3, { st: 'hooked', hx: 500, hy: 330, runK: 1e6, on: [false, true] });
  Object.assign(them, { ph: 'reel', fish: f3, ten: 0, k: 0, slack: 0 });
  S.bs = { 1: { wait: 1e6, react: -1, hold: false, tx: 480, ty: 330, think: 0, waited: 0 } };
  d.aim.x = 500; d.aim.y = 330;
  them.ten = 0.95; // (the bot lets go when its line is tight, so the fish stays where it is while the cast flies)
  await tap('fire');
  await until(() => me.ph === 'reel', 2000, 'the snag').catch(() => {});
  await check('Pond War: cast onto their hooked fish and you both have it', f3.on[0] && f3.on[1] && me.fish === f3, { ph: me.ph, on: f3.on });
  await shot('pond-tug');
  d.press('fire');
  const tugEnd = Date.now() + 8000;
  while (Date.now() < tugEnd && me.ph === 'reel') { me.ten = 0; them.ten = 0.95; await sleep(30); }
  d.release('fire');
  await check('Pond War: winning the tug of war takes the fish from them', me.ph === 'caught' && them.fish === null && them.ph !== 'reel', { me: me.ph, them: them.ph, sc: me.sc });
  parkThem();
  await until(() => me.ph === 'idle', 3000, 'idle').catch(() => {});
  // a rock
  const f4 = oneFish(0, 600, 330);
  d.aim.x = 600; d.aim.y = 330;
  await tap('e');
  await until(() => f4.st === 'flee', 2000, 'the fish to flee').catch(() => {});
  await check('Pond War: a rock scares the fish away, then you wait for the next rock', f4.st === 'flee' && me.rock > 0, { st: f4.st, rock: me.rock });
  // the legend, and the bucket at the end
  S.t = 45.5;
  await wait(100);
  await check('Pond War: the legendary fish appears for the last 15 seconds', S.fish.some(x => x.t === 6));
  await shot('pond-legend');
  me.ph = 'idle'; me.sc = 10; them.sc = 13;
  S.t = 59.9;
  await until(() => d.phase() === 'ko', 3000, 'the end').catch(() => {});
  await check('Pond War: at the end, the most points wins', d.winner() === 1, { winner: d.winner(), me: me.sc, them: them.sc });
  await until(() => $('stage').querySelector('.result'), 6000, 'the result').catch(() => {});
  const d2 = await startPractice('pond');
  window.__duelSpeed = 6;
  const end = Date.now() + 20000;
  const seenPh = {}; let bestP = 0, bestTen = 0, lastT = 0;
  while (Date.now() < end && d2.phase() === 'play') { const z = d2.state().cats[1]; seenPh[z.ph] = (seenPh[z.ph] || 0) + 1; if (z.fish) bestP = Math.max(bestP, z.fish.p); bestTen = Math.max(bestTen, z.ten); lastT = d2.state().t; await sleep(50); }
  window.__duelSpeed = 1;
  const st = d2.state();
  await log('Pond War, a whole game: the bot', true, { sc: st.cats[1].sc, got: st.cats[1].got, big: st.cats[1].big, seenPh, bestP, bestTen, lastT, level: d2.api.skill });
  await check('Pond War: the bot catches fish', st.cats[1].got > 0 && st.cats[1].sc > 0, st.cats[1].got);
  await until(() => $('stage').querySelector('.result'), 8000, 'the result').catch(() => {});
}

async function chessRules() {
  const d = await startPractice('speedchess');
  const S = d.state(), P = window.__panic;
  S.bs = { think: 1e9 };
  await wait(100);
  const at = (x, y) => P.pieces().find(p => Math.round(p.x) === x && Math.round(p.y) === y);
  const pawn = at(4, 6), rook = at(0, 7), knight = at(1, 7);
  await check('Panic Chess: pieces start in place, with no turns', !!pawn && !!rook && !!knight && pawn.t === 'p' && rook.t === 'r' && knight.t === 'n');
  await check('Panic Chess: a pawn goes forward 1 or 2', P.legal(pawn.id, 4, 5) && P.legal(pawn.id, 4, 4));
  await check("Panic Chess: a pawn can't go sideways, or take nothing", !P.legal(pawn.id, 5, 6) && !P.legal(pawn.id, 5, 5));
  await check("Panic Chess: a rook can't go through its own pawn", !P.legal(rook.id, 0, 4));
  await check('Panic Chess: a knight can hop over', P.legal(knight.id, 2, 5));
  await shot('chess-start');
  P.order(pawn.id, 4, 4);
  P.order(knight.id, 2, 5);
  await wait(120);
  const live = id => S.pcs.find(p => p.id === id);
  await check('Panic Chess: both can move at the same time', !!live(pawn.id).mv && !!live(knight.id).mv);
  await shot('chess-moving');
  await until(() => !live(pawn.id).mv, 3000, 'the pawn to arrive').catch(() => {});
  await check('Panic Chess: it arrives, then has to recharge', live(pawn.id).y === 4 && live(pawn.id).cd > 0, { y: live(pawn.id).y, cd: live(pawn.id).cd });
  P.order(pawn.id, 4, 3);
  await wait(100);
  await check("Panic Chess: it can't move while it recharges", !live(pawn.id).mv && live(pawn.id).y === 4);
  // dodging: a slow attack can miss
  const queen = S.pcs.find(p => p.t === 'q' && p.c === 0), bk = S.pcs.find(p => p.t === 'k' && p.c === 1), wk = S.pcs.find(p => p.t === 'k' && p.c === 0);
  const blackPawn = S.pcs.find(p => p.t === 'p' && p.c === 1);
  S.pcs = [queen, bk, wk, blackPawn];
  Object.assign(queen, { x: 3, y: 5, cd: 0, mv: null });
  Object.assign(blackPawn, { x: 3, y: 1, cd: 0, mv: null });
  Object.assign(bk, { x: 7, y: 0, cd: 0, mv: null });
  Object.assign(wk, { x: 4, y: 7, cd: 0, mv: null });
  await wait(100);
  P.order(queen.id, 3, 1); // (going for the pawn, which steps aside)
  await wait(150);
  blackPawn.x = 2; blackPawn.y = 2; // (stepped aside)
  await until(() => !queen.mv, 2000, 'the queen to arrive').catch(() => {});
  await check('Panic Chess: a piece that gets out of the way survives', S.pcs.includes(blackPawn) && queen.y === 1, { y: queen.y });
  // taking something
  Object.assign(blackPawn, { x: 3, y: 4, cd: 0, mv: null });
  Object.assign(queen, { x: 3, y: 1, cd: 0, mv: null });
  await wait(100);
  P.order(queen.id, 3, 4);
  await until(() => !S.pcs.includes(blackPawn), 2000, 'the capture').catch(() => {});
  await check('Panic Chess: moving onto a piece takes it', !S.pcs.includes(blackPawn) && S.took[0] >= 1, { took: S.took });
  await until(() => !queen.mv, 2000, 'the queen to stop').catch(() => {});
  // the board burns
  Object.assign(wk, { x: 4, y: 5, cd: 0, mv: null });
  Object.assign(bk, { x: 4, y: 1, cd: 0, mv: null });
  const doomed = { id: 99, t: 'r', c: 0, x: 0, y: 7, mv: null, cd: 0 };
  S.pcs.push(doomed);
  S.warned = 0;
  S.t = 25.2;
  await wait(100);
  await shot('chess-warning');
  S.t = 29.95;
  await until(() => S.b === 1, 2000, 'the burn').catch(() => {});
  await check('Panic Chess: the edge of the board burns, and what was on it is gone', S.b === 1 && !S.pcs.includes(doomed), { b: S.b });
  await shot('chess-burned');
  // taking the king
  Object.assign(queen, { x: 4, y: 3, cd: 0, mv: null });
  await wait(100);
  P.order(queen.id, 4, 1);
  await until(() => d.phase() === 'ko', 3000, 'the end').catch(() => {});
  await check('Panic Chess: take the king and you win', d.winner() === 0, d.winner());
  await until(() => $('stage').querySelector('.result'), 6000, 'the result').catch(() => {});
  // a whole game against a real bot
  const d2 = await startPractice('speedchess');
  window.__duelSpeed = 4;
  const end = Date.now() + 28000;
  while (Date.now() < end && d2.phase() === 'play') await sleep(150);
  const st = d2.state();
  window.__duelSpeed = 1;
  await log('Panic Chess, a whole game against the bot', true, { botMoves: st.moves[1], took: st.took, t: st.t, winner: d2.winner(), burn: st.b });
  await check('Panic Chess: the bot moves and takes pieces', st.moves[1] > 10 && d2.winner() === 1, { moves: st.moves[1], winner: d2.winner() });
  await until(() => $('stage').querySelector('.result'), 8000, 'the result').catch(() => {});
}

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
  await leave();
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
  const n = window.__net();
  await check('online: updates take the fast lane', n.fast, n);
  if (n.used) await check('online: the game is drawn less far in the past than before (100 ms), now ' + n.delay + ' ms', n.delay < 100, n);
  if (d.phase() === 'play') { // a bad connection: some updates get lost, the rest come late and out of order
    const before = d.snaps();
    window.__netChaos = { drop: 0.1, late: 70 };
    const t1 = Date.now();
    while (Date.now() - t1 < 5000 && d.phase() === 'play') { mash(d); await sleep(150); }
    window.__netChaos = null;
    const bad = window.__net();
    await check('online, on a bad connection: the game keeps going', d.api.host ? !!d.guestInput() : d.snaps() >= Math.min(before, 20), { snaps: d.snaps(), net: bad });
    if (d.phase() === 'play' && n.used) await check('online, on a bad connection: it draws further in the past to stay smooth, now ' + bad.delay + ' ms', bad.delay > n.delay, { before: n, after: bad });
  }
  letGo(d);
  const st = d.state();
  if (st && st.mine) await check('online (' + DUEL_ONLINE + '): the other player\'s half of the game arrives', !!st.theirs, st.theirs);
  else if (host) await check('online (' + DUEL_ONLINE + ', host): the guest\'s controls arrive', !!d.guestInput(), d.guestInput());
  else await check('online (' + DUEL_ONLINE + ', guest): the host\'s game arrives', d.snaps() > 10, d.snaps());
  if (host && d.phase() === 'play') d.end(0, 'TEST');
  await until(() => d.phase() === 'ko', 8000, 'the end of the game');
  // (The game may have ended by itself by now, with either player winning. Each app's answer is in the "seen by" line below.)
  await check('online (' + DUEL_ONLINE + '): the game ends with a winner', [-1, 0, 1].includes(d.winner()), { winner: d.winner(), host });
  await log('online winner seen by ' + (host ? 'host' : 'guest') + ': ' + d.winner(), true);
  await until(() => !$('vs').classList.contains('hidden') && !$('vsReact').classList.contains('hidden'), 10000, 'the after-game screen');
  await sleep(3000);
}

main().catch(err => log('stopped', false, String(err.message || err)));

})();
