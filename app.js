/* The app shell: sign up / log in, the camera + microphone question, the main menu and the top bar. */
(() => {
'use strict';

const $ = id => document.getElementById(id);

/* ================= SIGN UP / LOG IN ================= */

let authMode = 'signup';

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('[data-auth]').forEach(b => b.classList.toggle('active', b.dataset.auth === mode));
  const signup = mode === 'signup';
  $('authPass2Row').classList.toggle('hidden', !signup);
  $('rememberRow').classList.toggle('hidden', signup);
  $('authPass').autocomplete = signup ? 'new-password' : 'current-password';
  $('authSubmit').textContent = signup ? 'Create account' : 'Log in';
  $('authHint').textContent = signup
    ? 'Your account is saved in this browser on this computer.'
    : "Don't have an account yet? Press Sign up.";
  $('authMsg').textContent = '';
  $('authMsg').className = 'msg';
}

async function submitAuth(e) {
  e.preventDefault();
  const name = $('authUser').value.trim();
  const pass = $('authPass').value;
  const msg = $('authMsg');
  msg.className = 'msg error';
  if (!name) { msg.textContent = 'Type a username.'; $('authUser').focus(); return; }
  if (!pass) { msg.textContent = 'Type a password.'; $('authPass').focus(); return; }
  if (authMode === 'signup') {
    const bad = CA.checkUsername(name);
    if (bad) { msg.textContent = bad; $('authUser').focus(); return; }
    if (pass.length < 4) { msg.textContent = 'Pick a password with at least 4 characters.'; $('authPass').focus(); return; }
    if (pass !== $('authPass2').value) { msg.textContent = "The two passwords don't match."; $('authPass2').focus(); return; }
  }
  $('authSubmit').disabled = true;
  msg.className = 'msg';
  msg.textContent = authMode === 'signup' ? 'Creating your account…' : 'Logging in…';
  try {
    if (authMode === 'signup') await CA.signUp(name, pass);
    else await CA.logIn(name, pass, $('authRemember').checked);
    $('authPass').value = '';
    $('authPass2').value = '';
    msg.textContent = '';
    CA.toast(authMode === 'signup' ? 'Welcome to CamArcade, ' + CA.profile.name + '! 🐱' : 'Welcome back, ' + CA.profile.name + '!');
    CA.resume();
  } catch (err) {
    msg.className = 'msg error';
    msg.textContent = err.message;
  } finally {
    $('authSubmit').disabled = false;
  }
}

CA.register('auth', {
  public: true,
  enter() {
    if (CA.user) { CA.resume(); return; }
    CA.showScreen('scr-auth');
    $('authCat').innerHTML = CA.catSVG({ skin: 'skin-orange', bg: 'bg-space' }, { label: 'CamArcade cat' });
    setAuthMode(CA.hasAccounts() ? 'login' : 'signup');
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
  $('permHint').textContent = cam
    ? 'Your camera turns on by itself when you play, and turns off when you leave the game.'
    : 'No camera was found, so you will play as your cat.';
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
  let mic;
  if (CA.voice.micOn()) mic = '🎤 Microphone on: your cat talks when you do.';
  else if (CA.voice.hasMic()) mic = '🔇 Microphone muted. Press 🎤 at the top to unmute.';
  else mic = '🔇 Microphone off. <button class="linkish" id="menuMicOn">Turn it on</button>';
  const cam = CA.voice.camWanted()
    ? '📷 Camera on: it turns on when you play.'
    : '🐱 Camera off: you play as your cat. <button class="linkish" id="menuCamOn">Turn it on</button>';
  el.innerHTML = mic + '<br>' + cam;
  const b = $('menuMicOn');
  if (b) b.addEventListener('click', turnMicOn);
  const c = $('menuCamOn');
  if (c) c.addEventListener('click', () => toggleCamera(true));
}

CA.register('menu', {
  enter() {
    CA.showScreen('scr-menu');
    renderMenu();
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

// Came back to the site with "Keep me logged in", or refreshed the page: turn the microphone back on.
if (CA.user && CA.voice.choice() === 'on') CA.voice.startMic();

CA.render();

})();
