/* The owner's test player. Log into a test account (see "Test accounts" in server/schema.sql) in a second window, like
   a private/incognito one, and that window plays Classic Games by itself, so you can try online matches on your own:
   it searches, gets paired only with you, plays the arcade duels with the Practice bot's moves (in the other games it
   just waits), and always presses Rematch. A panel in the corner picks which game it starts. Its games never count. */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const DUELS = ['trails', 'box', 'sumo', 'pond', 'hockey', 'paint', 'cannons', 'golf', 'mouse', 'kart', 'blocks', 'swords', 'stare', 'boxing'];
const GAME_KEY = 'camarcade-testplayer-game';
let on = false;
let lastClick = 0;

const shown = el => !!el && el.offsetParent !== null && !el.disabled;
function press(el) {
  if (!shown(el) || Date.now() - lastClick < 1500) return false;
  lastClick = Date.now();
  el.click();
  return true;
}

function panel() {
  const p = document.createElement('div');
  p.id = 'testPlayer';
  p.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;background:#1d1f3a;color:#fff;border:2px solid #ffb84d;' +
    'border-radius:12px;padding:10px 12px;font:600 13px/1.4 system-ui,sans-serif;max-width:300px;box-shadow:0 6px 20px #0008';
  const ids = DUELS.concat(CA.games.ids().filter(id => !DUELS.includes(id)));
  p.innerHTML = '🤖 <b>Test player</b>: playing by itself' + (CA.profile.testWith ? ' against <b>' + CA.profile.testWith + '</b>' : '') +
    '<br><label>Game it starts: <select id="tpGame" style="max-width:170px"><option value="">Classic mix</option>' +
    ids.map(id => '<option value="' + id + '">' + CA.games.name(id) + (DUELS.includes(id) ? '' : ' (just waits)') + '</option>').join('') +
    '</select></label><div style="opacity:.75;font-weight:400;margin-top:4px">It plays the arcade duels. It starts the game when it was searching first, so open this window before you search.</div>';
  document.body.appendChild(p);
  const sel = $('tpGame');
  try { sel.value = localStorage.getItem(GAME_KEY) || ''; } catch (e) { /* ignore */ }
  const apply = () => {
    window.__forceGame = sel.value || undefined;
    try { localStorage.setItem(GAME_KEY, sel.value); } catch (e) { /* ignore */ }
  };
  sel.addEventListener('change', apply);
  apply();
}

// Every second: whatever screen it's on, do what a player would do next.
function tick() {
  if (!CA.user || !CA.profile || !CA.profile.test) return;
  if (!on) { on = true; window.__autoplay = true; panel(); }
  if (CA.route === 'perm') { press($('permSkip')); return; }
  if (CA.route !== 'solos') { if (CA.route !== 'auth') location.hash = '#/solos'; return; }
  const modal = $('caModal');
  if (modal && !modal.classList.contains('hidden')) {
    const b = Array.from($('caModalBtns').querySelectorAll('button')).find(x => /find a match/i.test(x.textContent));
    if (b) press(b);
    return;
  }
  if (press($('retryBtn'))) return;
  const rb = $('rematchBtn');
  if (shown(rb) && /Rematch/.test(rb.textContent)) { press(rb); return; }
  const next = document.querySelector('#scr-play [data-act="next"]');
  if (next) press(next);
}

setInterval(tick, 1000);
})();
