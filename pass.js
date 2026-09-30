/* Streak Pass: 20 tiers of fish and cat items, unlocked with XP from Classic Games. */
(() => {
'use strict';

const root = document.getElementById('scr-pass');
const $ = id => root.querySelector('#' + id);

function tierArt(t) {
  if (t.fish) return '<div class="tier-fish">🐟<b>' + t.fish + '</b></div>';
  return CA.previewSVG(t.item, CA.profile.equip.skin);
}

function readyTiers() {
  const p = CA.profile;
  return CA.PASS.filter(t => t.tier <= CA.tierOf(p.xp) && !p.claimed.includes(t.tier));
}

function render() {
  const p = CA.profile;
  const tier = CA.tierOf(p.xp);
  const maxed = tier >= CA.PASS.length;
  const into = maxed ? CA.TIER_XP : p.xp - tier * CA.TIER_XP;
  $('ppTier').textContent = maxed ? 'Tier ' + tier + ' · Pass complete!' : 'Tier ' + tier;
  $('ppXp').textContent = maxed ? p.xp + ' XP' : into + ' / ' + CA.TIER_XP + ' XP to tier ' + (tier + 1);
  $('ppBar').style.width = Math.round(into / CA.TIER_XP * 100) + '%';
  $('ptStreak').textContent = p.streak;
  $('ptBest').textContent = p.best;
  const ready = readyTiers();
  $('claimAllBtn').disabled = !ready.length;
  $('claimAllBtn').textContent = ready.length ? '🎁 Claim all (' + ready.length + ')' : '🎁 Nothing to claim';
  $('tiers').innerHTML = CA.PASS.map(t => {
    const claimed = p.claimed.includes(t.tier);
    const unlocked = t.tier <= tier;
    const state = claimed ? 'claimed' : unlocked ? 'ready' : 'locked';
    const name = t.fish ? t.fish + ' fish' : CA.ITEM[t.item].name;
    const foot = claimed ? '<span class="tier-state ok">✓ Claimed</span>'
      : unlocked ? '<button class="btn small go" data-claim="' + t.tier + '">Claim</button>'
      : '<span class="tier-state">🔒 ' + (t.tier * CA.TIER_XP).toLocaleString() + ' XP</span>';
    return '<div class="tier-card ' + state + '" data-tier="' + t.tier + '"><div class="tier-num">Tier ' + t.tier + '</div>' +
      '<div class="tier-art">' + tierArt(t) + '</div><div class="tier-name">' + CA.esc(name) + '</div>' + foot + '</div>';
  }).join('');
}

function claim(n) {
  const t = CA.claimTier(n);
  if (!t) return;
  CA.sound('found');
  CA.toast(t.fish ? '+' + t.fish + ' fish! 🐟' : 'You got the ' + CA.ITEM[t.item].name + '! Put it on in My Cat.');
}

$('tiers').addEventListener('click', e => {
  const b = e.target.closest('[data-claim]');
  if (b) claim(+b.dataset.claim);
});

$('claimAllBtn').addEventListener('click', () => {
  const ready = readyTiers();
  let fish = 0;
  let items = 0;
  for (const t of ready) {
    const r = CA.claimTier(t.tier);
    if (r && r.fish) fish += r.fish;
    if (r && r.item) items++;
  }
  if (!ready.length) return;
  CA.sound('found');
  CA.toast('Claimed ' + ready.length + ' reward' + (ready.length > 1 ? 's' : '') + ': ' +
    [fish ? '+' + fish + ' fish' : '', items ? items + ' new item' + (items > 1 ? 's' : '') : ''].filter(Boolean).join(' and ') + '!');
});

window.addEventListener('ca:change', () => { if (CA.route === 'pass' && CA.profile) render(); });

CA.register('pass', {
  enter() {
    CA.showScreen('scr-pass');
    render();
  },
});

})();
