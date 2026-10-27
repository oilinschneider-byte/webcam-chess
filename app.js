/* The app shell: sign up / log in, the camera + microphone question, the main menu and the top bar. */
(() => {
'use strict';

const $ = id => document.getElementById(id);

/* ================= SIGN UP / LOG IN ================= */

let authMode = 'signup';
const AGE_BLOCK_KEY = 'camarcade-age-block'; // (someone said they're under 13: no new accounts from this browser)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ageBlocked() { try { return localStorage.getItem(AGE_BLOCK_KEY) === '1'; } catch (e) { return false; } }
function blockAge() { try { localStorage.setItem(AGE_BLOCK_KEY, '1'); } catch (e) { /* ignore */ } }

// Age in whole years, counting from the end of the month you were born (the server counts the same way).
function ageOf(year, month) {
  const d = new Date();
  return d.getFullYear() - year - (d.getMonth() + 1 <= month ? 1 : 0);
}

// (Before accounts moved online, they were saved in this browser.)
function hadOldAccounts() {
  try { return Object.keys(JSON.parse(localStorage.getItem('camarcade-accounts-v1')) || {}).length > 0; } catch (e) { return false; }
}

function fillBirthday() {
  if ($('authMonth').options.length) return;
  $('authMonth').innerHTML = '<option value="">Month</option>' + MONTHS.map((m, i) => '<option value="' + (i + 1) + '">' + m + '</option>').join('');
  const now = new Date().getFullYear();
  let years = '<option value="">Year</option>';
  for (let y = now; y >= now - 100; y--) years += '<option value="' + y + '">' + y + '</option>';
  $('authYear').innerHTML = years;
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('[data-auth]').forEach(b => b.classList.toggle('active', b.dataset.auth === mode));
  const signup = mode === 'signup';
  $('authPass2Row').classList.toggle('hidden', !signup);
  $('authBirthRow').classList.toggle('hidden', !signup);
  $('authRulesRow').classList.toggle('hidden', !signup);
  $('rememberRow').classList.toggle('hidden', signup);
  $('authPass').autocomplete = signup ? 'new-password' : 'current-password';
  $('authSubmit').textContent = signup ? 'Create account' : 'Log in';
  $('authSubmit').disabled = signup && ageBlocked();
  $('authHint').textContent = signup
    ? 'Your account is saved online, so you can log in on any device. Played here before? Use the same username and password, and your cat and fish come along.'
    : "Don't have an account yet? Press Sign up.";
  $('authMsg').className = 'msg' + (CA.server.configured ? '' : ' error');
  $('authMsg').textContent = !CA.server.configured ? CA.server.message('not_configured')
    : signup && ageBlocked() ? 'Sorry, you have to be 13 or older to play CamArcade.' : '';
}

async function submitAuth(e) {
  e.preventDefault();
  const name = $('authUser').value.trim();
  const pass = $('authPass').value;
  const msg = $('authMsg');
  const signup = authMode === 'signup';
  let birth = null;
  msg.className = 'msg error';
  if (!name) { msg.textContent = 'Type a username.'; $('authUser').focus(); return; }
  if (!pass) { msg.textContent = 'Type a password.'; $('authPass').focus(); return; }
  if (signup) {
    if (ageBlocked()) { msg.textContent = 'Sorry, you have to be 13 or older to play CamArcade.'; return; }
    const bad = CA.checkUsername(name);
    if (bad) { msg.textContent = bad; $('authUser').focus(); return; }
    if (pass.length < 4) { msg.textContent = 'Pick a password with at least 4 characters.'; $('authPass').focus(); return; }
    if (pass !== $('authPass2').value) { msg.textContent = "The two passwords don't match."; $('authPass2').focus(); return; }
    birth = { month: +$('authMonth').value, year: +$('authYear').value };
    if (!birth.month || !birth.year) { msg.textContent = 'Pick the month and year you were born.'; $('authMonth').focus(); return; }
    if (ageOf(birth.year, birth.month) < 13) {
      blockAge();
      setAuthMode('signup');
      return;
    }
    if (!$('authRules').checked) { msg.textContent = 'Tick the box to promise to be kind to other players.'; $('authRules').focus(); return; }
  }
  $('authSubmit').disabled = true;
  msg.className = 'msg';
  msg.textContent = signup ? 'Creating your account…' : 'Logging in…';
  try {
    let imported = false;
    if (signup) imported = (await CA.signUp(name, pass, birth)).imported;
    else await CA.logIn(name, pass, $('authRemember').checked);
    $('authPass').value = '';
    $('authPass2').value = '';
    msg.textContent = '';
    CA.toast(!signup ? 'Welcome back, ' + CA.profile.name + '!'
      : imported ? 'Welcome back, ' + CA.profile.name + '! Your cat, fish and items came along. 🐱'
      : 'Welcome to CamArcade, ' + CA.profile.name + '! 🐱');
    CA.resume();
  } catch (err) {
    if (err.code === 'too_young') { blockAge(); setAuthMode('signup'); return; }
    msg.className = 'msg error';
    msg.textContent = err.message;
    if (err.code === 'no_such_name' && hadOldAccounts()) {
      msg.textContent = "There's no online account with that username yet. Accounts are online now: press Sign up and use the same username and password, and your cat and fish come along.";
    }
  } finally {
    $('authSubmit').disabled = signup && ageBlocked();
  }
}

CA.register('auth', {
  public: true,
  enter() {
    if (CA.user) { CA.resume(); return; }
    CA.showScreen('scr-auth');
    $('authCat').innerHTML = CA.catSVG({ skin: 'skin-orange', bg: 'bg-space' }, { label: 'CamArcade cat' });
    fillBirthday();
    setAuthMode(CA.lastUser() ? 'login' : 'signup');
    if (authMode === 'login' && !$('authUser').value) $('authUser').value = CA.lastUser();
    setTimeout(() => ($('authUser').value ? $('authPass') : $('authUser')).focus(), 50);
  },
});

document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
$('authForm').addEventListener('submit', submitAuth);

/* ================= CAMERA + MICROPHONE ================= */

let meterOff = null;

function permError(err) {
  const name = (err && err.name) || '';
  const m = (err && err.message) || '';
  if (name === 'InsecureError') return 'Your browser only allows the microphone on secure pages. Start CamArcade with start.bat.';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return /system/i.test(m)
      ? 'Windows is blocking your microphone. Open Settings → Privacy & security → Microphone, turn it on (also for desktop apps), then press Try again.'
      : 'The browser blocked the microphone. Click the lock or camera icon in the address bar, set Microphone to Allow, then press Try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Plug one in and press Try again, or continue without it.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Your microphone is busy in another app (Zoom, Discord, another tab). Close it and press Try again.';
  return 'The microphone could not start (' + (name || 'unknown error') + ').';
}

async function allowMedia() {
  const msg = $('permMsg');
  $('permAllow').disabled = true;
  msg.className = 'msg';
  msg.textContent = 'Click “Allow” in the box near the top of your browser.';
  try {
    await CA.voice.askBoth();
  } catch (err) {
    console.warn('Permission error:', err);
    msg.className = 'msg error';
    msg.textContent = permError(err);
    $('permAllow').disabled = false;
    $('permAllow').textContent = '↻ Try again';
    $('permSkip').textContent = 'Continue without';
    return;
  }
  CA.voice.setChoice(CA.voice.hasMic() ? 'on' : 'off');
  const cam = CA.voice.cameraOn();
  if (cam) {
    $('permVideo').srcObject = CA.voice.camera;
    $('permVideo').play().catch(() => {});
    $('permVideoBox').classList.remove('hidden');
  }
  msg.className = 'msg ok';
  msg.textContent = CA.voice.hasMic()
    ? 'Say something! Your cat talks when you talk. 👄'
    : 'No microphone was found, but your camera works.';
  $('permTitle').textContent = cam ? 'Your camera and microphone work!' : 'Your cat can hear you!';
  $('permHint').textContent = !cam ? 'No camera was found, so you will play as your cat.'
    : CA.canVideoChat() ? 'Your camera turns on when you play. Other players see your cat until you press 📷 Show my face.'
    : 'Your camera turns on when you play, only for pose games. Other players always see your cat.';
  $('permMeter').classList.toggle('hidden', !CA.voice.hasMic());
  $('permAllow').classList.add('hidden');
  $('permSkip').classList.add('hidden');
  $('permContinue').classList.remove('hidden');
  $('permContinue').focus();
  if (meterOff) meterOff();
  meterOff = CA.voice.onLevel(v => { $('permMeterBar').style.width = Math.round(v * 100) + '%'; });
}

CA.register('perm', {
  enter() {
    if (CA.voice.choice()) { CA.resume(); return; }
    CA.showScreen('scr-perm');
    $('permCat').innerHTML = CA.catSVG(CA.profile.equip, { label: CA.profile.name, talker: 'me' });
    $('permText').textContent = CA.canVideoChat()
      ? "Other players see your cat. In a match, you can press 📷 Show my face to let that player see you, and they hear your voice. Your cat's mouth moves when you talk."
      : "You're under 18, so other players never see you or hear you: they always see your cat, and its mouth moves when you talk. " +
        'Your camera is only used on this computer, for pose games like Simon Says.';
    $('permTitle').textContent = 'Turn on your camera and microphone?';
    $('permHint').textContent = 'Choose "No thanks" to play as your cat. You can turn the camera on later with 📷 at the top.';
    $('permVideoBox').classList.add('hidden');
    $('permMsg').textContent = '';
    $('permMeter').classList.add('hidden');
    $('permAllow').classList.remove('hidden');
    $('permAllow').disabled = false;
    $('permAllow').textContent = '🎤📷 Allow camera & microphone';
    $('permSkip').classList.remove('hidden');
    $('permSkip').textContent = 'No thanks';
    $('permContinue').classList.add('hidden');
  },
  leave() {
    if (meterOff) { meterOff(); meterOff = null; }
    $('permVideo').srcObject = null;
    CA.voice.syncCamera(); // the preview stops here; games turn the camera back on
  },
});

$('permAllow').addEventListener('click', allowMedia);
$('permSkip').addEventListener('click', () => {
  CA.voice.setChoice(CA.voice.hasMic() ? 'on' : 'off');
  CA.voice.setCamWanted(false);
  CA.resume();
});
$('permContinue').addEventListener('click', () => CA.resume());

/* ================= MENU ================= */

const ART = [
  ['bR', 0, 0], ['bQ', 3, 0], ['bR', 5, 0], ['bK', 6, 0], ['bP', 0, 1], ['bP', 1, 1], ['bP', 5, 1], ['bP', 6, 1], ['bP', 7, 1],
  ['bN', 2, 2], ['bP', 4, 3], ['wP', 4, 4], ['wB', 2, 4], ['wN', 5, 5], ['wP', 0, 6], ['wP', 1, 6], ['wP', 5, 6],
  ['wP', 6, 6], ['wP', 7, 6], ['wR', 0, 7], ['wQ', 3, 7], ['wR', 5, 7], ['wK', 6, 7],
];

function practiceLevel() {
  try { return localStorage.getItem('camarcade-practice-level') || 'medium'; } catch (e) { return 'medium'; }
}

function renderMenu() {
  const p = CA.profile;
  if (!p) return;
  $('menuCat').innerHTML = CA.catSVG(p.equip, { label: p.name, talker: 'me' });
  $('menuName').textContent = p.name;
  $('menuStreak').textContent = p.streak;
  $('menuBest').textContent = p.best;
  $('menuFish').textContent = p.fish;
  $('menuTier').textContent = CA.tierOf(p.xp);
  const ready = CA.PASS.filter(t => t.tier <= CA.tierOf(p.xp) && !p.claimed.includes(t.tier)).length;
  $('menuPassNote').textContent = ready ? '🎁 ' + ready + ' reward' + (ready > 1 ? 's' : '') + ' ready to claim!' : 'Tier ' + CA.tierOf(p.xp) + ' of 20 · win to unlock more';
  renderMenuMic();
  const lvl = practiceLevel();
  document.querySelectorAll('#practiceLevel [data-level]').forEach(b => b.classList.toggle('active', b.dataset.level === lvl));
}

function renderMenuMic() {
  const el = $('menuMic');
  const adult = CA.canVideoChat();
  let mic;
  if (CA.voice.micOn()) mic = adult ? '🎤 Microphone on: your cat talks when you do.' : "🎤 Microphone on: your cat's mouth moves when you talk (other players can't hear you).";
  else if (CA.voice.hasMic()) mic = '🔇 Microphone muted. Press 🎤 at the top to unmute.';
  else mic = '🔇 Microphone off. <button class="linkish" id="menuMicOn">Turn it on</button>';
  const cam = !CA.voice.camWanted() ? '🐱 Camera off: you play as your cat. <button class="linkish" id="menuCamOn">Turn it on</button>'
    : adult ? '📷 Camera on when you play. Strangers see your cat until you press 📷 Show my face.'
    : '📷 Camera on for pose games. Other players always see your cat.';
  el.innerHTML = mic + '<br>' + cam;
  const b = $('menuMicOn');
  if (b) b.addEventListener('click', turnMicOn);
  const c = $('menuCamOn');
  if (c) c.addEventListener('click', () => toggleCamera(true));
}

// "🟢 12 players online", from the server.
async function showOnline() {
  try {
    const s = await CA.server.call('ca_stats');
    if (CA.route !== 'menu') return;
    const n = Number(s.online) || 0;
    $('menuOnline').textContent = '🟢 ' + n + ' player' + (n === 1 ? '' : 's') + ' online now' +
      (s.searching ? ' · ' + s.searching + ' looking for a match' : '');
    $('menuOnline').classList.remove('hidden');
  } catch (e) {
    $('menuOnline').classList.add('hidden');
  }
}

CA.register('menu', {
  enter() {
    CA.showScreen('scr-menu');
    renderMenu();
    showOnline();
  },
});

$('menuBoard').innerHTML = '<div class="art-board">' +
  ART.map(([pc, x, y]) => '<span class="piece ' + pc + '" style="left:' + x * 12.5 + '%;top:' + y * 12.5 + '%"></span>').join('') + '</div>';

$('practiceLevel').addEventListener('click', e => {
  const b = e.target.closest('[data-level]');
  if (!b) return;
  try { localStorage.setItem('camarcade-practice-level', b.dataset.level); } catch (err) { /* ignore */ }
  document.querySelectorAll('#practiceLevel [data-level]').forEach(x => x.classList.toggle('active', x === b));
});

/* ================= TOP BAR ================= */

async function turnMicOn() {
  if (CA.voice.hasMic()) { CA.voice.setMic(true); return; }
  const ok = await CA.voice.startMic();
  if (ok) { CA.voice.setChoice('on'); CA.toast('Microphone on. Your cat can talk now! 🎤'); }
  else CA.toast('The microphone is blocked. Allow it with the lock icon in the address bar.');
}

function renderBar() {
  const p = CA.profile;
  const route = CA.route;
  const inApp = !!p && route !== 'auth' && route !== 'perm';
  $('appBar').classList.toggle('hidden', !inApp);
  if (!inApp) return;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === route));
  $('userName').textContent = p.name;
  $('caStats').innerHTML =
    '<a class="stat-chip" href="#/pass" title="Streak Pass tier">🎟️ <b>' + CA.tierOf(p.xp) + '</b></a>' +
    '<a class="stat-chip" href="#/menu" title="Your streak">🔥 <b>' + p.streak + '</b></a>' +
    '<a class="stat-chip fish" href="#/cat" title="Fish">🐟 <b>' + p.fish + '</b></a>' +
    '<a class="me-avatar" href="#/cat" title="My cat">' + CA.catSVG(p.equip, { bg: false, anim: false, talker: 'me', label: p.name }) + '</a>';
  renderMicBtn();
}

function renderMicBtn() {
  const b = $('topMicBtn');
  const on = CA.voice.micOn();
  b.textContent = on ? '🎤' : '🔇';
  b.classList.toggle('off', !on);
  b.title = on ? 'Microphone on (click to mute)' : CA.voice.hasMic() ? 'Microphone muted (click to unmute)' : 'Microphone off (click to turn on)';
  const c = $('topCamBtn');
  const cam = CA.voice.camWanted();
  c.textContent = cam ? '📷' : '🐱';
  c.classList.toggle('off', !cam);
  c.title = cam ? 'Camera on in games (click to play as your cat)' : 'Playing as your cat (click to turn the camera on in games)';
}

async function toggleCamera(on) {
  await CA.voice.setCamWanted(on);
  if (!CA.voice.camWanted()) { if (!on) CA.toast('Camera off: you play as your cat. 🐱'); return; }
  CA.toast(CA.voice.inGame ? 'Camera on! 📷' : 'Camera on: it turns on when you play. 📷');
}

$('topMicBtn').addEventListener('click', () => {
  if (CA.voice.micOn()) CA.voice.setMic(false);
  else turnMicOn();
});
$('topCamBtn').addEventListener('click', () => toggleCamera(!CA.voice.camWanted()));
$('soundBtn').addEventListener('click', () => {
  CA.setSound(!CA.soundOn);
  $('soundBtn').textContent = CA.soundOn ? '🔊' : '🔇';
  if (CA.soundOn) CA.sound('tick');
});
$('soundBtn').textContent = CA.soundOn ? '🔊' : '🔇';
$('userBtn').addEventListener('click', e => { e.stopPropagation(); $('userPop').classList.toggle('hidden'); });
document.addEventListener('click', () => $('userPop').classList.add('hidden'));
$('logoutBtn').addEventListener('click', () => {
  CA.confirmBox('Log out?', 'You can log back in with your username and password.', 'Log out', () => {
    CA.requestLeave(() => {
      CA.logOut();
      if (location.hash === '#/auth') CA.render(); else location.hash = '#/auth';
    });
  });
});
$('deleteAccountBtn').addEventListener('click', () => {
  CA.modal({
    icon: '🗑️', title: 'Delete your account?',
    text: 'This deletes your account, your cat, your fish and your streak from CamArcade for good. Type your password to confirm.',
    input: { type: 'password', placeholder: 'Your password' },
    buttons: [{ label: 'Delete my account', danger: true, fn: deleteAccount }, { label: 'Cancel' }],
  });
});

function deleteAccount(password) {
  if (!password) { CA.toast('Type your password to delete your account.'); return; }
  CA.requestLeave(async () => {
    try {
      await CA.deleteAccount(password);
      CA.toast('Your account was deleted. 👋');
      if (location.hash === '#/auth') CA.render(); else location.hash = '#/auth';
    } catch (err) {
      CA.toast(err.message);
    }
  });
}

$('caModal').addEventListener('click', e => { if (e.target.id === 'caModal' && !CA.modalLocked()) CA.closeModal(); });

window.addEventListener('ca:change', () => {
  renderBar();
  if (CA.route === 'menu') renderMenu();
});
window.addEventListener('ca:media', () => {
  renderMicBtn();
  if (CA.route === 'menu') renderMenuMic();
});
window.addEventListener('ca:route', () => setTimeout(renderBar, 0));

// The automated two-browser test (tools/test-browsers.ps1) opens the site with ?autotest=a or ?autotest=b.
if (/[?&]autotest=[ab]\b/.test(location.search)) {
  const s = document.createElement('script');
  s.src = 'tools/autotest.js?v=' + Date.now();
  document.head.appendChild(s);
}

// (Waits for the server to say whether you're still logged in, unless this browser already has a copy of your account.)
CA.restoring.then(() => {
  // Came back to the site with "Keep me logged in", or refreshed the page: turn the microphone back on.
  if (CA.user && CA.voice.choice() === 'on') CA.voice.startMic();
  CA.render();
});

})();
