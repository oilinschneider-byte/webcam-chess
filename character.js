/* My Cat: dress up your cat with what you own, and buy new things in the shop with fish. */
(() => {
'use strict';

const root = document.getElementById('scr-cat');
const $ = id => root.querySelector('#' + id);
let tab = 'shop';
let slot = 'hat';
let preview = null; // an item you're trying on before buying

function slotInfo(id) { return CA.SLOTS.find(s => s.id === id); }

function render() {
  const p = CA.profile;
  if (!p) return;
  const eq = Object.assign({}, p.equip);
  if (preview) eq[CA.ITEM[preview].slot] = preview;
  $('charStage').innerHTML = CA.catSVG(eq, { label: p.name, talker: 'me' });
  $('charName').textContent = p.name;
  $('charTalk').textContent = CA.voice.micOn() ? '🎤 Talk and watch your cat!' : '';
  $('csStreak').textContent = p.streak;
  $('csBest').textContent = p.best;
  $('csWins').textContent = p.wins;
  $('fishCount').textContent = p.fish;
  root.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $('slotChips').innerHTML = CA.SLOTS.map(s =>
    '<button class="chip' + (s.id === slot ? ' active' : '') + '" data-slot="' + s.id + '">' + s.icon + ' ' + s.name + '</button>').join('');
  renderPreviewBar();
  renderGrid();
}

function renderPreviewBar() {
  const bar = $('previewBar');
  if (!preview) { bar.classList.add('hidden'); return; }
  const it = CA.ITEM[preview];
  const p = CA.profile;
  bar.classList.remove('hidden');
  const buy = $('previewBuy');
  if (it.price == null) {
    $('previewText').innerHTML = 'Trying on <b>' + CA.esc(it.name) + '</b>. Unlock it at Streak Pass tier ' + it.tier + '.';
    buy.classList.add('hidden');
  } else {
    $('previewText').innerHTML = 'Trying on <b>' + CA.esc(it.name) + '</b>';
    buy.classList.remove('hidden');
    buy.textContent = 'Buy for 🐟 ' + it.price;
    buy.disabled = p.fish < it.price;
    buy.title = p.fish < it.price ? 'You need ' + (it.price - p.fish) + ' more fish' : '';
  }
}

function renderGrid() {
  const p = CA.profile;
  const info = slotInfo(slot);
  const all = CA.ITEMS.filter(i => i.slot === slot);
  const list = tab === 'wardrobe' ? all.filter(i => p.owned.includes(i.id)) : all;
  const tiles = [];
  if (tab === 'wardrobe' && !info.required) {
    const on = !p.equip[slot];
    tiles.push('<button class="item-tile' + (on ? ' equipped' : '') + '" data-none="1"><div class="item-art item-none">🚫</div>' +
      '<div class="item-name">No ' + CA.esc(info.name.toLowerCase()) + '</div><div class="item-foot' + (on ? ' ok' : '') + '">' + (on ? 'Wearing ✓' : 'Take off') + '</div></button>');
  }
  for (const it of list) {
    const owned = p.owned.includes(it.id);
    const worn = p.equip[slot] === it.id;
    let foot;
    let cls = 'item-tile';
    if (worn) { foot = '<div class="item-foot ok">Wearing ✓</div>'; cls += ' equipped'; }
    else if (owned) foot = '<div class="item-foot">' + (tab === 'shop' ? 'Owned · tap to wear' : 'Tap to wear') + '</div>';
    else if (it.price != null) foot = '<div class="item-foot price">🐟 ' + it.price + '</div>';
    else { foot = '<div class="item-foot">🔒 Pass tier ' + it.tier + '</div>'; cls += ' locked'; }
    if (preview === it.id) cls += ' previewing';
    tiles.push('<button class="' + cls + '" data-id="' + it.id + '"><div class="item-art">' + CA.previewSVG(it.id, p.equip.skin) + '</div>' +
      '<div class="item-name">' + CA.esc(it.name) + '</div>' + foot + '</button>');
  }
  $('itemGrid').innerHTML = tiles.join('');
  const onlyNone = tab === 'wardrobe' && !list.length;
  $('emptyNote').classList.toggle('hidden', !onlyNone);
  $('emptyNote').innerHTML = onlyNone
    ? "You don't own any " + CA.esc(info.name.toLowerCase()) + ' yet. <a href="#" data-go-shop="1">Visit the shop</a> or unlock some in the <a href="#/pass">Streak Pass</a>.'
    : '';
}

function tileClicked(el) {
  const p = CA.profile;
  if (el.dataset.none) { preview = null; CA.unequip(slot); return; }
  const it = CA.ITEM[el.dataset.id];
  if (!it) return;
  if (p.owned.includes(it.id)) {
    preview = null;
    if (p.equip[slot] === it.id && !slotInfo(slot).required) CA.unequip(slot);
    else CA.equip(it.id);
    return;
  }
  preview = preview === it.id ? null : it.id;
  render();
}

function buyPreview() {
  if (!preview) return;
  const it = CA.ITEM[preview];
  if (!CA.buy(it.id)) {
    const need = it.price - CA.profile.fish;
    CA.toast(need > 0 ? 'You need ' + need + ' more fish. Win Classic Games to catch more!' : "You can't buy that.");
    return;
  }
  preview = null;
  CA.equip(it.id);
  CA.sound('found');
  CA.toast('You bought the ' + it.name + '! Your cat is wearing it now.');
}

root.querySelector('.tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (!t) return;
  tab = t.dataset.tab;
  render();
});
$('slotChips').addEventListener('click', e => {
  const c = e.target.closest('[data-slot]');
  if (!c) return;
  slot = c.dataset.slot;
  render();
});
$('itemGrid').addEventListener('click', e => {
  const el = e.target.closest('.item-tile');
  if (el) tileClicked(el);
});
$('emptyNote').addEventListener('click', e => {
  if (!e.target.closest('[data-go-shop]')) return;
  e.preventDefault();
  tab = 'shop';
  render();
});
$('previewBuy').addEventListener('click', buyPreview);
$('previewClear').addEventListener('click', () => { preview = null; render(); });
window.addEventListener('ca:change', () => { if (CA.route === 'cat' && CA.profile) render(); });
window.addEventListener('ca:media', () => { if (CA.route === 'cat') $('charTalk').textContent = CA.voice.micOn() ? '🎤 Talk and watch your cat!' : ''; });

CA.register('cat', {
  enter(params) {
    CA.showScreen('scr-cat');
    const p = CA.profile;
    // New players don't own anything to wear yet, so they start in the shop.
    tab = params.get('tab') || (p.owned.length <= 2 ? 'shop' : 'wardrobe');
    preview = null;
    render();
  },
  leave() { preview = null; },
});

})();
