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

   Each step is sent to the test server, which writes it to a file the test script reads. */
(() => {
'use strict';

const q = new URLSearchParams(location.search);
const role = q.get('autotest');
if (role !== 'a' && role !== 'b') return;
const camTest = q.get('mode') === 'cam';
const run = (q.get('run') || 'x').replace(/[^a-z0-9]/gi, '').slice(0, 8);
const NAME = 'zt' + run + role;
const PASS = 'test-pass-' + run;
const adult = role === 'a' || camTest;
window.__introMs = 1500;   // (shorter face-to-face screens)
window.__reactMs = 15000;
window.__forceGame = camTest ? 'ttt' : 'rps'; // (Tic-Tac-Toe waits for moves, so there's time to check the cameras)

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
    if (fn === 'ca_report') seen.report = r;
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
    const r = await until(() => seen.report, 30000, 'my win to be reported');
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

main().catch(err => log('stopped', false, String(err.message || err)));

})();
