/* Classic Games: Barrel Brawl. Two cats with very long, floppy arms and one barrel. Press V next to it to pick it
   up: it hangs low behind you. Hold V to wind up and let go to throw it: it swings up over your head and shoots off
   (the longer you hold V, the further it goes). With no barrel nearby, V is a slap with those long arms: it knocks the
   other cat back and makes it drop the barrel, but doesn't cost a life. Tap left or right twice, fast, to dash. 3
   lives each and no clock, but after a while a few tiles of ground fall into the lava.

   Online, each app moves its own cat (so walking and throwing feel instant) and decides when its own cat gets hit or
   falls. The host's app runs the barrel and the ground, and decides who won. Against a bot, everything runs here. */
(() => {
'use strict';

const { $, setMsg, sound, gauss, L, skillOf } = CA.games.kit;
const F = CA.floppy; // (the cats with the long arms: see games-floppy.js)
const { ARM_N, FONT } = F;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
const r1 = v => Math.round(v * 10) / 10;
const num = (v, d) => (Number.isFinite(v) ? v : d);

const W = 960, H = 540;          // the arena (the canvas is scaled to fit the page)
const GY = 430;                  // the top of the ground
const LAVA = 500;                // the top of the lava
const TILE = 48, NT = W / TILE;  // the ground is 20 tiles
const DT = 1 / 120;              // the physics runs in small, fixed steps
const G = 2100;                  // gravity for cats
const GB = 2100;                 // gravity for the barrel
const BR = 24;                   // the barrel's radius
const HW = 22, HH = 80;          // a cat's hit box: HW to each side, HH up from its feet
const FOOT = 9;                  // a cat stands on the ground while either foot (x ± FOOT) is over a tile
const EDGE = 30;                 // how near the sides of the arena a cat can go
const PIVOT = 60, ORBIT = 52;    // the barrel swings in a circle of radius ORBIT around (x, y - PIVOT)
const CARRY = 48, WOUND = 95, TOP = 200; // where on that circle (degrees from your feet: behind you at 90, above your head at 180) you carry it, wind it up to, and let go
const WIND = 1.1;                // seconds of holding V for a full-power throw
const THROW_UP = 26 * Math.PI / 180; // every throw leaves from above your head, at this angle
const GRAB = 80;                 // how near the barrel has to be to pick it up
const SLAP_REACH = 108, SLAP_WAIT = 0.65; // how far a slap reaches in front of you, and how often you can slap
const DASH_SPEED = 780, DASH_TIME = 0.17, DASH_WAIT = 0.7;
const LIVES = 3;
const HOME = [200, W - 200];     // where the cats start (cat 0 is the host's, on the left)
const CRACK = 1.3;               // seconds a tile shakes before it falls
const READY = 1.8;               // the 3-2-1 countdown
const SEND_MS = 50;
const VIEW_DELAY = 110;          // the other player's cat is drawn this many ms in the past, so it moves smoothly
const BANNERS = {
  crack: '⚠️ The ground is cracking!', quake: '💥 EARTHQUAKE!', last: '🌋 The ground holds… for now!', fewer: '🌋 More ground is falling!',
};

CA.games.add('barrel', {
  name: 'Barrel Brawl', icon: '🛢️',
  blurb: 'V picks up the barrel. Hold V and let go to shoot it over your head at the other cat (hold longer to throw further). ' +
    'No barrel nearby? V slaps with your long arms: it knocks them back and makes them drop the barrel. Tap A or D twice to dash. 3 lives each!',
  start(ctx) { play(ctx); },
});

function play(ctx) {
  const online = !ctx.bot;
  const host = ctx.isHost;              // (against a bot, you're always the host)
  const meI = host ? 0 : 1, themI = 1 - meI;
  const flip = meI === 1;               // the guest sees the arena mirrored, so you're always on the left
  const sx = x => (flip ? W - x : x);
  const skill = skillOf(ctx);

  ctx.stage.innerHTML =
    '<div class="g-barrel"><canvas class="bb-canvas" id="bbCanvas" width="' + W + '" height="' + H + '"></canvas>' +
    '<div class="bb-pad" id="bbPad"><div><button data-k="l" aria-label="Move left (tap twice to dash)">◀</button><button data-k="r" aria-label="Move right (tap twice to dash)">▶</button></div>' +
    '<div><button data-k="j" aria-label="Jump">⤒</button>' +
    '<button class="bb-v" data-k="v" aria-label="Pick up, throw or slap">V</button></div></div>' +
    '<p class="g-msg" id="bbMsg"></p></div>';
  const cv = $('bbCanvas');
  const g = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR;
  cv.height = H * DPR;
  const { dot, heart, roundRect, label, bigText, speedLines, dizzy } = F.painter(g, W);

  /* ---------- the cats ---------- */

  function newCat(i, eq, name) {
    return {
      i, name, fur: F.fur(eq), pics: F.pictures(eq),
      x: HOME[i], y: GY, vx: 0, vy: 0, face: i ? -1 : 1, ground: true,
      lives: LIVES, out: false, hold: false, holdT: 0, stun: 0, inv: 0, respawn: 0, chute: false, kHit: 0, kFall: 0,
      power: -1, windT: 0, toss: -1, tossPow: 0,           // winding up a throw (0 to 1), then the swing over the head (degrees)
      slapT: 0, slapCd: 0, dashT: 0, dashDir: 1, dashCd: 0, airDash: false,
      pj: false, pb: false, pv: false, jumpBuf: 0, slapSeen: false,
      rv: null,                                         // (the other player's cat, as drawn: see updateViews)
      arms: null, walk: 0, squash: 0, spin: 0, spinV: 0, splashed: false,
    };
  }
  const cats = [];
  cats[meI] = newCat(meI, CA.profile.equip, 'You');
  cats[themI] = newCat(themI, ctx.oppEquip, ctx.oppName);
  const me = cats[meI], them = cats[themI];
  const local = ctx.bot ? [me, them] : [me];           // the cats this app moves
  const vw = c => c.rv || c;                           // a cat as this app shows it

  /* ---------- the barrel and the ground ---------- */

  const barrel = { x: W / 2, y: GY - BR, vx: 0, vy: 0, rot: 0, spin: 0, h: -1, live: false, by: -1, age: 9, chute: false, lava: 0 };
  let bv = 0, ack = 0, av = 0;   // (host) how often the barrel changed; the guest's last barrel event, and bv right after it

  const tiles = new Array(NT).fill(0);       // 0 = solid, 1 = cracking, 2 = gone
  const crackAt = new Array(NT).fill(0);     // (host) when each tile started to crack
  const crackSeen = new Array(NT).fill(0);   // when this app saw it start (for the shaking)
  const solidAt = x => { const i = Math.floor(x / TILE); return i >= 0 && i < NT && tiles[i] < 2; };
  const standable = x => solidAt(x - FOOT) || solidAt(x + FOOT);

  let phase = 'ready', readyT = 0, count = 0, goAt = 0, winner = null;
  let t = 0;                                 // (host) seconds of play: this drives the ground
  let nextCrumble = L(40000) / 1000, crumbles = 0, minLeft = 14, floorSince = -1;
  let bannerN = 0, bannerKey = '', bannerAt = -1e9;
  let shake = 0, lastThud = 0, lastMsg = performance.now();
  const fx = [];
  const chunks = [];

  /* ---------- controls ---------- */

  const input = F.controls(ctx,
    { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'j', KeyW: 'j', Space: 'j', KeyB: 'b', KeyV: 'v' },
    { a: 'l', d: 'r', w: 'j', ' ': 'j', b: 'b', v: 'v' }, $('bbPad'));
  const keys = input.keys;
  function myInput() { // (the guest's screen is mirrored)
    const d = input.takeDash();
    return flip ? { l: keys.r, r: keys.l, j: keys.j, b: keys.b, v: keys.v, dash: -d } : { l: keys.l, r: keys.r, j: keys.j, b: keys.b, v: keys.v, dash: d };
  }

  /* ---------- swinging and throwing ---------- */

  // Where the barrel is when it is phi degrees around the swing circle from your feet: behind you at 90, above your
  // head at 180, in front of you at 270.
  function orbit(x, y, face, phi) {
    const a = phi * Math.PI / 180;
    return { x: x - face * ORBIT * Math.sin(a), y: Math.min(y - BR, y - PIVOT + ORBIT * Math.cos(a)) };
  }
  // A held barrel hangs low behind the cat. Holding V pulls it further back, and letting go swings it over the head.
  function swingAngle(v) {
    if (v.toss >= 0) return v.toss;
    if (v.power >= 0) return CARRY + (WOUND - CARRY) * v.power;
    return CARRY;
  }
  function holdPos(v) { return orbit(v.x, v.y, v.face, swingAngle(v)); }
  function swingRot(v) { return v.face * (swingAngle(v) - CARRY) * Math.PI / 180; } // (it turns as it swings, like a ball on a string)
  // The throw leaves from above your head, flying up and forward in an arc: the more power, the further it goes.
  function launch(c, power) {
    const p = orbit(c.x, c.y, c.face, TOP);
    const v = 600 + 760 * power;
    return {
      x: p.x, y: p.y, vx: c.face * v * Math.cos(THROW_UP) + c.vx * 0.3, vy: -v * Math.sin(THROW_UP),
      rot: c.face * (TOP - CARRY) * Math.PI / 180, spin: c.face * v / 50,
    };
  }

  /* ---------- physics ---------- */

  // Down in a hole, the tiles on each side are walls.
  function sideWalls(o, hw, bounce) {
    if (solidAt(o.x)) return;
    if (solidAt(o.x + hw)) { o.x = Math.floor((o.x + hw) / TILE) * TILE - hw; o.vx = -Math.abs(o.vx) * bounce; }
    if (solidAt(o.x - hw)) { o.x = (Math.floor((o.x - hw) / TILE) + 1) * TILE + hw; o.vx = Math.abs(o.vx) * bounce; }
  }

  // Moves a free barrel. (Also used to guess where a throw will go: then quiet is true.)
  function stepBarrel(b, dt, quiet) {
    b.age += dt;
    b.vy += GB * dt;
    if (b.chute) b.vy = Math.min(b.vy, 190);
    const py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.spin * dt;
    if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx) * 0.6; b.spin *= -0.5; }
    if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx) * 0.6; b.spin *= -0.5; }
    if (b.y + BR > GY + 2) sideWalls(b, BR - 2, 0.3);
    if (b.vy >= 0 && b.y + BR >= GY && py + BR <= GY + 4 && solidAt(b.x)) {
      b.y = GY - BR;
      b.chute = false;
      if (b.vy > 170) {
        if (!quiet) thud(b);
        b.vy *= -0.5;
        b.vx *= 0.9;
      } else {
        b.vy = 0;
        b.vx = approach(b.vx, 0, 520 * dt);
        b.spin = b.vx / BR;
      }
    }
    if (b.live && b.y >= GY - BR - 1 && Math.hypot(b.vx, b.vy) < 360) b.live = false; // a slow barrel rolling along the ground doesn't hurt
  }

  function stepCat(c, inp, dt) {
    if (c.out) { tumble(c, dt); return; }
    if (c.respawn > 0) { c.respawn -= dt; if (c.respawn <= 0) { c.respawn = 0; spawnCat(c); } return; }
    c.stun = Math.max(0, c.stun - dt);
    c.inv = Math.max(0, c.inv - dt);
    c.slapT = Math.max(0, c.slapT - dt);
    c.slapCd = Math.max(0, c.slapCd - dt);
    c.dashCd = Math.max(0, c.dashCd - dt);
    const free = c.stun <= 0 && phase === 'play';
    const winding = c.power >= 0, tossing = c.toss >= 0;
    const dir = free ? (inp.r ? 1 : 0) - (inp.l ? 1 : 0) : 0;
    // Dash: tap left or right twice, fast. (A quick burst that can even carry you over a small hole.)
    if (inp.dash && free && !winding && !tossing && c.dashCd <= 0 && c.dashT <= 0 && (c.ground || !c.airDash)) {
      c.dashT = DASH_TIME;
      c.dashDir = inp.dash;
      c.dashCd = DASH_WAIT;
      c.face = inp.dash;
      if (!c.ground) c.airDash = true;
      puff(c.x, c.ground ? GY : c.y, 5);
      sound([[700, 0, 0.04], [520, 0.03, 0.06]]);
    }
    // (A jump press is remembered for a moment, so pressing it just before you land, or during a dash, still jumps.)
    c.jumpBuf = inp.j && !c.pj ? 0.15 : Math.max(0, (c.jumpBuf || 0) - dt);
    c.pj = inp.j;
    if (c.dashT > 0 && c.jumpBuf > 0 && c.ground && free) { c.dashT = 0; c.vx = c.dashDir * 285; } // (a jump ends the dash)
    if (c.dashT > 0) {
      c.dashT -= dt;
      c.vx = c.dashDir * DASH_SPEED * (c.hold ? 0.8 : 1);
      c.vy = 0;
      if (c.dashT <= 0) c.vx = c.dashDir * 285; // (it stops sharply)
    } else {
      const top = winding || tossing ? 150 : c.hold ? 205 : 285;
      if (dir) {
        c.vx = approach(c.vx, dir * top, (c.ground ? 2600 : 1600) * dt);
        if (!tossing) c.face = dir;
      } else {
        c.vx = approach(c.vx, 0, (c.ground ? (c.stun > 0 ? 700 : 2600) : 250) * dt);
      }
      if (c.jumpBuf > 0 && free && c.ground && !winding && !tossing) { // (always a full jump, however short the tap)
        c.jumpBuf = 0;
        c.vy = c.hold ? -720 : -860;
        c.ground = false;
        puff(c.x, GY, 4);
      }
      c.vy += G * dt;
      if (c.chute) c.vy = Math.min(c.vy, 230);
    }
    const py = c.y;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.x < EDGE) { c.x = EDGE; c.vx = 0; }
    if (c.x > W - EDGE) { c.x = W - EDGE; c.vx = 0; }
    if (c.y > GY + 1) sideWalls(c, 12, 0);
    c.ground = false;
    if (c.vy >= 0 && py <= GY + 1 && c.y >= GY && standable(c.x)) {
      if (c.vy > 520) { c.squash = 1; puff(c.x, GY, 5); }
      c.y = GY;
      c.vy = 0;
      c.ground = true;
      c.chute = false;
      c.airDash = false;
    }
    // V does it all: next to the barrel it picks it up; holding it, hold V to wind up and let go to throw; otherwise
    // it's a slap. (The bot also uses b, which only picks up.)
    const bPress = inp.b && !c.pb, vPress = inp.v && !c.pv, vRelease = !inp.v && c.pv;
    c.pb = inp.b;
    c.pv = inp.v;
    if (free) {
      if (bPress && !c.hold) tryGrab(c);
      if (vPress && c.hold && !winding && !tossing) { c.power = 0; c.windT = 0; }
      else if (vPress && !c.hold && !tryGrab(c, true) && c.slapCd <= 0) slap(c);
      if (vRelease && c.power >= 0) startToss(c);
    }
    if (c.power >= 0) {
      c.power = Math.min(1, c.power + dt / WIND);
      if ((c.windT += dt) > 3.5) startToss(c); // (you can't hold it back forever)
    }
    if (c.toss >= 0) {
      c.toss += 820 * dt; // the swing up and over your head
      if (c.toss >= TOP) throwBarrel(c);
    }
    if (c.hold && c.power < 0 && c.toss < 0 && (c.holdT += dt) > 8) {
      dropBarrel(c);
      pop(c.x, c.y - 110, 'Too heavy!', '#ffd23f');
    }
    if (c.y > LAVA + 30) loseLife(c, 'lava');
  }

  // A knocked-out cat goes flying.
  function tumble(c, dt) {
    if (c.y > LAVA + 60) return;
    c.vy += G * dt;
    const py = c.y;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.spin += c.spinV * dt;
    if (c.x < EDGE) { c.x = EDGE; c.vx = Math.abs(c.vx) * 0.5; }
    if (c.x > W - EDGE) { c.x = W - EDGE; c.vx = -Math.abs(c.vx) * 0.5; }
    if (c.y > GY + 1) sideWalls(c, 12, 0.3);
    if (c.vy > 0 && py <= GY + 1 && c.y >= GY && standable(c.x)) {
      c.y = GY;
      c.vy = c.vy > 200 ? -c.vy * 0.3 : 0;
      c.vx *= 0.6;
      c.spinV *= 0.5;
    }
    if (c.y > LAVA + 20 && !c.splashed) { c.splashed = true; splash(c.x, 14); }
  }

  // Back from the lava: float down on a parachute, as far from the other cat as possible.
  function spawnCat(c) {
    const other = vw(c === me ? them : me);
    let best = -1, score = -Infinity;
    for (let i = 0; i < NT; i++) {
      if (tiles[i] !== 0) continue;
      const x = (i + 0.5) * TILE;
      const s = Math.min(330, Math.abs(x - other.x)) - Math.abs(x - HOME[c.i]) * 0.5;
      if (s > score) { score = s; best = i; }
    }
    if (best < 0) best = Math.max(0, tiles.findIndex(s => s < 2));
    Object.assign(c, { x: (best + 0.5) * TILE, y: -40, vx: 0, vy: 0, chute: true, ground: false, inv: 2.4, stun: 0, power: -1, toss: -1, dashT: 0, airDash: false });
  }

  /* ---------- picking up, throwing, getting hit ---------- */

  function tryGrab(c, quiet) { // (true if you picked it up)
    const b = barrelNow();
    if (b.h >= 0 || b.live || b.lava > 0 || (b.chute && b.y < GY - 120)) return false;
    if (Math.hypot(b.x - c.x, b.y - (c.y - 30)) > GRAB) {
      if (c === me && !quiet) hint('Get closer to the barrel!');
      return false;
    }
    c.hold = true;
    c.power = -1;
    c.toss = -1;
    c.holdT = 0;
    sound('flip');
    if (host) setBarrel({ h: c.i, live: false, chute: false, vx: 0, vy: 0 });
    else guestEvent('grab', null);
    return true;
  }

  // Letting go of V: the barrel swings up over your head, and flies when it gets to the top.
  function startToss(c) {
    c.tossPow = Math.max(0, c.power);
    c.toss = swingAngle(c);
    c.power = -1;
  }

  function throwBarrel(c) {
    const s = launch(c, c.tossPow);
    c.hold = false;
    c.power = -1;
    c.toss = -1;
    sound([[330, 0, 0.05], [220, 0.04, 0.1]]);
    const nb = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, rot: s.rot, spin: s.spin, h: -1, live: true, by: c.i, age: 0, chute: false, lava: 0 };
    if (host) setBarrel(nb);
    else guestEvent('throw', nb);
  }

  function dropBarrel(c, push) { // (push: knocked out of your arms, towards that side)
    const p = holdPos(c);
    c.hold = false;
    c.power = -1;
    c.toss = -1;
    const nb = {
      x: p.x, y: p.y, vx: push ? push * 160 : c.vx * 0.5, vy: push ? -260 : Math.min(0, c.vy) * 0.5,
      spin: 0, h: -1, live: false, by: c.i, age: 9, chute: false, lava: 0,
    };
    if (host) setBarrel(nb);
    else guestEvent('drop', nb);
  }

  // V without the barrel: a big slap with those long arms. It knocks the other cat back and makes it drop the
  // barrel, but doesn't cost a life. (Online, the slapper's app decides whether the slap reached.)
  function slap(c) {
    c.slapT = 0.28;
    c.slapCd = SLAP_WAIT;
    F.whip(c, c.face);
    fx.push({ k: 'swoosh', x: c.x, y: c.y - 46, face: c.face, vx: 0, vy: 0, life: 0.2, max: 0.2 });
    sound([[520, 0, 0.04], [340, 0.03, 0.07]]);
    const o = c === me ? them : me;
    const v = vw(o);
    if (v.out || v.respawn > 0 || v.chute) return;
    const ahead = (v.x - c.x) * c.face;
    if (ahead < -18 || ahead > SLAP_REACH || Math.abs(v.y - c.y) > 75) return;
    if (local.includes(o)) knock(o, c.face);
    else { ctx.send({ t: 'slap', d: c.face }); whap(v.x, v.y - 50); }
  }

  function knock(c, dir) {
    if (c.out || c.respawn > 0 || c.chute) return;
    if (c.hold) dropBarrel(c, dir);
    c.power = -1;
    c.toss = -1;
    c.dashT = 0;
    c.vx = dir * 480;
    c.vy = -410;
    c.ground = false;
    c.stun = 0.4;
    whap(c.x, c.y - 50);
  }

  function setBarrel(o) { Object.assign(barrel, o); bv++; }

  // Each app decides whether its own cat got hit, from the barrel it shows: if it looks like you dodged, you dodged.
  function checkHit(c, b) {
    if (!b || !b.live || b.h >= 0 || b.lava > 0 || c.out || c.respawn > 0 || c.inv > 0) return;
    if (b.by === c.i && b.age < 0.3) return; // (not the moment you let go… but it can bounce back and get you!)
    const nx = clamp(b.x, c.x - HW, c.x + HW), ny = clamp(b.y, c.y - HH, c.y);
    if ((b.x - nx) ** 2 + (b.y - ny) ** 2 > BR * BR) return;
    const nb = { x: b.x, y: b.y, vx: -b.vx * 0.25, vy: -Math.abs(b.vy) * 0.25 - 330, spin: -b.spin * 0.5, h: -1, live: false, by: b.by, age: 9, chute: false, lava: 0 };
    loseLife(c, 'hit', b);
    if (host) setBarrel(nb);
    else guestEvent('hit', nb);
  }

  function loseLife(c, why, b) {
    if (c.out || c.respawn > 0) return;
    if (c.hold) dropBarrel(c);
    c.power = -1;
    c.toss = -1;
    c.dashT = 0;
    c.lives--;
    if (why === 'lava') {
      c.kFall++;
      splash(c.x, 22);
      pop(c.x, LAVA - 50, 'SPLASH!', '#ffb43c');
      c.vx = 0;
      c.vy = 0;
      if (c.lives > 0) c.respawn = 1.1;
      else { c.out = true; c.splashed = true; c.y = LAVA + 80; }
    } else {
      c.kHit++;
      const dir = Math.sign(c.x - b.x) || -c.face;
      const ko = c.lives <= 0;
      c.vx = dir * (ko ? 900 : 620);
      c.vy = ko ? -950 : -620;
      c.ground = false;
      c.stun = 0.9;
      c.inv = 1.8;
      if (ko) { c.out = true; c.spinV = dir * 9; }
      bonk(c.x, c.y - HH + 10);
    }
    lifeLost(c);
  }

  function lifeLost(c) {
    shake = Math.max(shake, 12);
    sound(c === me ? 'miss' : 'point');
    if (c === me && ctx.bot) ctx.oppCheer();
    ctx.score(LIVES - them.lives, LIVES - me.lives);
  }

  /* ---------- the host runs the barrel and the ground ---------- */

  function stepWorld(dt) {
    t += dt;
    for (let i = 0; i < NT; i++) if (tiles[i] === 1 && t - crackAt[i] >= CRACK) setTile(i, 2);
    if (phase === 'play' && t >= nextCrumble) crumble();
    const b = barrel;
    if (b.h >= 0) {
      const v = vw(cats[b.h]);
      const p = holdPos(v);
      Object.assign(b, { x: p.x, y: p.y, vx: v.vx, vy: v.vy, age: 9 });
    } else if (b.lava > 0) {
      b.lava -= dt;
      if (b.lava <= 0) respawnBarrel();
    } else {
      stepBarrel(b, dt);
      if (b.y > LAVA + BR) { splash(b.x, 12); setBarrel({ lava: 1, live: false }); }
    }
  }

  // After a calm start, a tile starts cracking every few seconds (a bit faster each time, with the odd earthquake),
  // until about half the ground is gone. That holds for a while, then one more tile can go now and then.
  function crumble() {
    crumbles++;
    const solid = [];
    for (let i = 0; i < NT; i++) if (tiles[i] === 0) solid.push(i);
    if (solid.length <= minLeft) {
      if (floorSince < 0) { floorSince = t; banner('last'); }
      else if (t - floorSince > 30 && minLeft > 12) { minLeft--; floorSince = t; banner('fewer'); }
      nextCrumble = t + 1;
      return;
    }
    const quake = crumbles % 8 === 0;
    const n = Math.min(quake ? 2 : 1, solid.length - minLeft);
    for (let k = 0; k < n; k++) {
      const left = solid.filter(i => tiles[i] === 0);
      const edges = left.filter(i => tiles[i - 1] === 2 || tiles[i + 1] === 2); // holes like to grow
      const list = edges.length && ctx.rng() < 0.45 ? edges : left;
      setTile(list[Math.floor(ctx.rng() * list.length)], 1);
    }
    if (crumbles === 1) banner('crack');
    else if (quake) banner('quake');
    nextCrumble = t + Math.max(3, 6 * Math.pow(0.97, crumbles));
  }

  function setTile(i, s) {
    if (tiles[i] === s) return;
    tiles[i] = s;
    if (s === 1) { crackAt[i] = t; crackSeen[i] = performance.now(); }
    if (s === 2) tileFell(i);
  }

  // A barrel that fell in the lava comes back from the sky, on a parachute, near the middle.
  function respawnBarrel() {
    let list = [];
    for (let i = 0; i < NT; i++) if (tiles[i] === 0) list.push(i);
    if (!list.length) for (let i = 0; i < NT; i++) if (tiles[i] < 2) list.push(i);
    list = list.sort((a, b) => Math.abs(a - (NT - 1) / 2) - Math.abs(b - (NT - 1) / 2));
    const i = list[Math.floor(ctx.rng() * Math.min(4, list.length))];
    setBarrel({ x: (i + 0.5) * TILE, y: -50, vx: 0, vy: 0, spin: 0, rot: 0, h: -1, live: false, by: -1, age: 9, chute: true, lava: 0 });
  }

  function banner(key) { bannerN++; showBanner(key); }
  function showBanner(key) {
    if (!BANNERS[key]) return;
    bannerKey = key;
    bannerAt = performance.now();
    if (key === 'quake') { shake = Math.max(shake, 16); sound('boom'); } else sound('notify');
    if (key === 'crack' || key === 'fewer') ctx.note('⚠️ The ground is cracking!');
    if (key === 'last') ctx.note('🌋 The ground holds… for now');
  }

  function endGame(w) { // w: the winner (0 or 1), or -1 for a draw
    if (phase === 'ko') return;
    phase = 'ko';
    winner = w;
    if (host && online) ctx.send({ t: 'end', w });
    ctx.note(w < 0 ? "It's a draw!" : w === meI ? 'K.O.! You win!' : 'K.O.!');
    ctx.later(() => ctx.finish(w < 0 ? 'draw' : w === meI ? 'win' : 'lose'), 2400);
  }

  /* ---------- online ---------- */

  function packCat(c) {
    return {
      x: r1(c.x), y: r1(c.y), vx: Math.round(c.vx), vy: Math.round(c.vy), f: c.face,
      pw: c.power < 0 ? -1 : Math.round(c.power * 100) / 100, ts: c.toss < 0 ? -1 : r1(c.toss),
      h: c.hold ? 1 : 0, s: c.stun > 0 ? 1 : 0, i: c.inv > 0 ? 1 : 0, l: c.lives, r: c.respawn > 0 ? 1 : 0, o: c.out ? 1 : 0,
      p: c.chute ? 1 : 0, kh: c.kHit, kf: c.kFall, w: c.slapT > 0 ? 1 : 0, ds: c.dashT > 0 ? 1 : 0,
    };
  }
  function packBarrel(b) {
    return {
      x: r1(b.x), y: r1(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), r: Math.round(b.rot * 100) / 100, s: r1(b.spin),
      h: b.h, l: b.live ? 1 : 0, by: b.by, a: r1(Math.min(b.age, 99)), c: b.chute ? 1 : 0, z: b.lava > 0 ? 1 : 0,
    };
  }
  function unpackBarrel(p) { // (it comes from the other app: check everything)
    return {
      x: clamp(num(p.x, W / 2), -200, W + 200), y: clamp(num(p.y, GY - BR), -3000, H + 500),
      vx: clamp(num(p.vx, 0), -4000, 4000), vy: clamp(num(p.vy, 0), -4000, 4000),
      rot: num(p.r, 0), spin: clamp(num(p.s, 0), -80, 80),
      h: p.h === 0 || p.h === 1 ? p.h : -1, live: !!p.l, by: p.by === 0 || p.by === 1 ? p.by : -1,
      age: num(p.a, 9), chute: !!p.c, lava: p.z ? 1 : 0,
    };
  }

  const rbuf = [], bbuf = [];  // the other cat's recent states; (guest) the host's recent barrels
  let gHost = null;            // (guest) the host's barrel, as drawn now
  let pred = null;             // (guest) our own guess of the barrel after we threw, dropped or got hit by it, until the host catches up
  let blend = null;            // (guest) then the barrel slides over to where the host has it
  let evId = 0;

  function barrelNow() { return host ? barrel : pred ? pred.b : gHost || barrel; }

  function guestEvent(kind, nb) {
    evId++;
    ctx.send({ t: kind, id: evId, b: nb ? packBarrel(nb) : null });
    if (nb) pred = { b: Object.assign({ rot: barrelNow().rot || 0 }, nb), id: evId, rest: 0, born: performance.now() };
  }

  function onGuestEvent(m) {
    const id = Number.isInteger(m.id) ? m.id : 0;
    if (id <= ack) return;
    let ok = true;
    if (m.t === 'grab') {
      ok = barrel.h < 0 && !barrel.live && barrel.lava <= 0;
      if (ok) setBarrel({ h: 1, live: false, chute: false });
    } else if (m.b && typeof m.b === 'object') {
      const nb = unpackBarrel(m.b);
      if (m.t === 'hit') {
        if (barrel.h < 0 && barrel.lava <= 0) setBarrel(Object.assign(nb, { h: -1, live: false, lava: 0 }));
      } else {
        ok = barrel.h === 1;
        if (ok) setBarrel(Object.assign(nb, { h: -1, live: m.t === 'throw', by: 1, age: 0, lava: 0 }));
      }
    }
    ack = id;
    av = bv;
    if (!ok) ctx.send({ t: 'deny', id });
  }

  function onRemoteCat(s) {
    if (!s || typeof s !== 'object' || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
    rbuf.push({
      at: performance.now(), x: s.x, y: s.y, vx: num(s.vx, 0), vy: num(s.vy, 0), face: s.f === -1 ? -1 : 1,
      power: clamp(num(s.pw, -1), -1, 1), toss: clamp(num(s.ts, -1), -1, TOP), hold: !!s.h, stun: !!s.s, inv: !!s.i,
      respawn: !!s.r, out: !!s.o, chute: !!s.p, slap: !!s.w, dash: !!s.ds,
    });
    if (rbuf.length > 40) rbuf.shift();
    const kh = num(s.kh, 0), kf = num(s.kf, 0);
    them.out = !!s.o;
    const lostOne = kh > them.kHit || kf > them.kFall;
    const fell = kf > them.kFall;
    them.kHit = Math.max(them.kHit, kh);
    them.kFall = Math.max(them.kFall, kf);
    them.lives = clamp(num(s.l, LIVES), 0, LIVES);
    if (lostOne) {
      lifeLost(them);
      ctx.later(() => { // (when it shows on this screen)
        const v = vw(them);
        if (fell) { splash(v.x, 22); pop(v.x, LAVA - 50, 'SPLASH!', '#ffb43c'); } else bonk(v.x, v.y - HH + 10);
      }, VIEW_DELAY);
    }
  }

  function onSnapshot(m) {
    if (m.b && typeof m.b === 'object') {
      const b = unpackBarrel(m.b);
      const last = bbuf[bbuf.length - 1];
      if (b.lava && last && !last.lava && !pred) ctx.later(() => splash(b.x, 12), VIEW_DELAY); // (the host's barrel fell in the lava)
      bbuf.push(Object.assign(b, { at: performance.now() }));
      if (bbuf.length > 40) bbuf.shift();
      const k = num(m.k, 0);
      if (pred && k >= pred.id && (num(m.n, 0) > num(m.v, 0) || pred.rest > 0.25 || b.h >= 0)) endPred();
      if (pred && performance.now() - pred.born > 6000) endPred();
      // Once the host has seen all our barrel moves, it has the final say on who holds it.
      if (k >= evId && !pred) {
        if (me.hold && b.h !== meI) { me.hold = false; me.power = -1; me.toss = -1; }
        else if (!me.hold && b.h === meI) { me.hold = true; me.power = -1; me.toss = -1; me.holdT = 0; }
      }
    }
    if (typeof m.g === 'string' && m.g.length === NT) {
      for (let i = 0; i < NT; i++) { const s = +m.g[i]; if (s >= 0 && s <= 2) setTile(i, s); }
    }
    if (Number.isFinite(m.bn) && m.bn > bannerN) { bannerN = m.bn; showBanner(m.bt); }
  }

  function endPred() {
    blend = { x: pred.b.x, y: pred.b.y, t: 0.25 };
    pred = null;
  }

  ctx.on(m => {
    if (!m || typeof m !== 'object') return;
    lastMsg = performance.now();
    if (m.t === 's') {
      onRemoteCat(m.c);
      if (!host) onSnapshot(m);
    } else if (host && ['grab', 'throw', 'drop', 'hit'].includes(m.t)) {
      onGuestEvent(m);
    } else if (m.t === 'slap' && (m.d === 1 || m.d === -1)) {
      knock(me, m.d); // (they reached you on their screen)
    } else if (!host && m.t === 'deny') {
      if (pred && num(m.id, 0) >= pred.id) endPred();
      if (num(m.id, 0) === evId) { me.hold = false; me.power = -1; me.toss = -1; }
    } else if (!host && m.t === 'end' && [-1, 0, 1].includes(m.w)) {
      endGame(m.w);
    }
  });

  function stepPred(dt) {
    if (!pred || pred.b.lava > 0) return;
    const b = pred.b;
    stepBarrel(b, dt);
    if (b.y > LAVA + BR) { b.lava = 1; b.live = false; splash(b.x, 12); }
    pred.rest = b.vy === 0 && Math.abs(b.vx) < 5 ? pred.rest + dt : 0;
  }

  /* ---------- the bot ---------- */

  const bot = ctx.bot ? {
    inp: { l: false, r: false, j: false, b: false, v: false, dash: 0 }, think: 0.4, goal: null, face: 0, jumpT: 0,
    tapB: false, tapV: false, dash: 0, aim: 0.5, err: 0, replan: false, seenV: -1, dodge: false,
  } : null;

  function botInput(c, dt) {
    const inp = bot.inp;
    inp.b = false;
    inp.dash = 0;
    if (c.power < 0) inp.v = false; // (V is a quick tap, except while winding up)
    if (c.out || c.respawn > 0 || c.stun > 0 || phase !== 'play') { inp.l = inp.r = inp.j = inp.v = false; bot.jumpT = 0; return inp; }
    bot.think -= dt;
    if (bot.think <= 0) { bot.think = 0.12 + (1 - skill) * 0.28 + Math.random() * 0.1; botThink(c); }
    if (c.power >= 0 || c.toss >= 0) { // winding up: keep facing the other cat, and let go at the planned power
      if (c.power >= 0 && bot.replan && c.power > 0.3) { bot.replan = false; bot.aim = clamp(planThrow(c) + bot.err, 0, 1); }
      if (c.power >= 0) inp.v = c.power < bot.aim;
      const want = Math.sign(me.x - c.x) || c.face;
      inp.l = c.power >= 0 && want < 0 && c.face > 0;
      inp.r = c.power >= 0 && want > 0 && c.face < 0;
      inp.j = false;
      return inp;
    }
    let dir = 0;
    if (!c.ground) {
      dir = airSteer(c);
    } else {
      if (bot.goal !== null && Math.abs(bot.goal - c.x) > 10) dir = Math.sign(bot.goal - c.x);
      else if (bot.face && bot.face !== c.face) dir = bot.face;
      if (dir && !standable(c.x + dir * 30)) { // a hole ahead: jump it, or stop
        const gap = gapAhead(c.x, dir);
        const across = bot.goal !== null && Math.abs(bot.goal - c.x) > 40;
        if (!across || gap > (c.hold ? 80 : 150)) dir = 0;
        else if (Math.abs(c.vx) > 140 || !standable(c.x + dir * 12)) bot.jumpT = 0.3;
      }
    }
    inp.l = dir < 0;
    inp.r = dir > 0;
    if (bot.jumpT > 0) { bot.jumpT -= dt; inp.j = true; } else inp.j = false;
    if (bot.tapB) { bot.tapB = false; inp.b = true; }
    if (bot.tapV) { bot.tapV = false; inp.v = true; }
    if (bot.dash) { inp.dash = bot.dash; bot.dash = 0; }
    return inp;
  }

  function botThink(c) {
    const o = me, b = barrel;
    bot.goal = null;
    bot.face = 0;
    const plat = platformAt(c.x);
    const stay = x => (plat ? clamp(x, plat[0] + 16, plat[1] - 16) : safeSpot(x)); // somewhere on this bit of ground
    const onPlat = x => plat && x > plat[0] + 10 && x < plat[1] - 10;
    if (c.ground && !plat) { bot.goal = safeSpot(c.x); return; } // standing on a cracking tile: get off it first!
    const dx = o.x - c.x;
    const toward = Math.sign(dx) || c.face;
    // Right next to the other cat (especially if it has the barrel)? Slap it!
    if (!c.hold && c.slapCd <= 0 && Math.abs(dx) < SLAP_REACH - 14 && Math.abs(o.y - c.y) < 60 && !o.chute && !(o.respawn > 0) && !o.out &&
        Math.random() < (o.hold ? 0.55 + 0.45 * skill : 0.1 + 0.35 * skill)) {
      if (c.face === toward) bot.tapV = true; else bot.face = toward;
      return;
    }
    if (c.hold) { // get in range, face the other cat, then wind up
      if (Math.abs(dx) > 760) bot.goal = stay(o.x - toward * 600);
      else if (Math.abs(dx) < 120) bot.goal = stay(c.x - toward * 140); // (too close to throw over: back off a bit)
      if (bot.goal === null || Math.abs(bot.goal - c.x) < 12) {
        bot.goal = null;
        if (c.face !== toward) bot.face = toward;
        else if (c.holdT > 0.3 + Math.random() * 0.5 + (1 - skill) * 0.8) {
          bot.tapV = true;
          bot.err = gauss(0, 0.4 - 0.37 * skill); // easy bots miss a lot more
          bot.aim = clamp(planThrow(c) + bot.err, 0, 1);
          bot.replan = true;
        }
      }
      return;
    }
    if (b.h < 0 && !b.live && b.lava <= 0 && !(b.chute && b.y < GY - 150)) { // go and get the barrel
      if (!solidAt(b.x) && b.y + BR >= GY) { bot.goal = safeSpot(c.x); return; } // (it's falling in a hole)
      bot.goal = b.x;
      if (Math.hypot(b.x - c.x, b.y - (c.y - 30)) < GRAB - 12) bot.tapB = true;
      else if (c.ground && c.dashCd <= 0 && onPlat(b.x) && Math.abs(b.x - c.x) > 220 && Math.random() < 0.6 * skill) bot.dash = Math.sign(b.x - c.x);
      return;
    }
    if (b.live && b.by !== c.i) { // incoming! maybe dodge it
      if (bot.seenV !== bv) { bot.seenV = bv; bot.dodge = Math.random() < 0.15 + 0.7 * skill; }
      const hit = bot.dodge ? predictHit(c, b) : null;
      if (hit && hit.low) { if (hit.t < 0.32 && c.ground) bot.jumpT = 0.3; }
      else if (hit) {
        const away = c.x < hit.x ? -1 : 1;
        if (c.dashCd <= 0 && onPlat(c.x + away * 150) && Math.random() < 0.3 + 0.6 * skill) bot.dash = away;
        else bot.goal = stay(c.x + away * 130);
      }
      return;
    }
    // Otherwise keep a good distance from the other cat, without jumping around the holes for no reason.
    const want = 360 + Math.sin(t * 0.8 + 1) * 110;
    let gx = c.x < o.x ? o.x - want : o.x + want;
    if (gx < 40 || gx > W - 40) gx = c.x < o.x ? o.x + want : o.x - want;
    bot.goal = plat && plat[1] - plat[0] >= TILE * 2 ? stay(gx) : safeSpot(clamp(gx, 40, W - 40));
    if (o.power >= 0 && c.ground && Math.random() < 0.1 * skill) bot.jumpT = 0.3; // (hop about while you wind up)
  }

  // The stretch of solid (not cracking) ground under x, as [left, right], or null.
  function platformAt(x) {
    let i = Math.floor(x / TILE);
    if (i < 0 || i >= NT || tiles[i] !== 0) {
      i = Math.floor((x + (x % TILE < TILE / 2 ? -FOOT : FOOT)) / TILE); // (standing on the edge of the next tile)
      if (i < 0 || i >= NT || tiles[i] !== 0) return null;
    }
    let l = i, r = i;
    while (l > 0 && tiles[l - 1] === 0) l--;
    while (r < NT - 1 && tiles[r + 1] === 0) r++;
    return [l * TILE, (r + 1) * TILE];
  }

  // In the air: steer so you come down on solid ground, as near the goal as you can.
  function airSteer(c) {
    const tl = c.chute ? Math.max(0, GY - c.y) / 230 : (c.vy + Math.sqrt(Math.max(0, c.vy * c.vy + 2 * G * (GY - c.y)))) / G;
    const land = c.x + c.vx * tl;
    const aim = bot.goal !== null ? bot.goal : land;
    const reach = 0.5 * 1600 * tl * tl * 0.7 + 10;
    let best = null;
    for (let x = land - reach; x <= land + reach; x += 4) {
      if (x < EDGE || x > W - EDGE || !solidAt(x) || tiles[Math.floor(x / TILE)] !== 0) continue;
      if (best === null || Math.abs(x - aim) < Math.abs(best - aim)) best = x;
    }
    if (best === null) return Math.sign(aim - land);
    return Math.abs(best - land) > 4 ? Math.sign(best - land) : 0;
  }

  function gapAhead(x, dir) { // how wide the hole in front of you is
    let e = 0;
    while (e < 60 && solidAt(x + dir * e)) e += 4;
    let d = 0;
    while (d < 500 && !solidAt(x + dir * (e + d))) d += 4;
    return d;
  }

  function safeSpot(x) { // the nearest place to x that isn't cracking or gone
    const i0 = clamp(Math.floor(x / TILE), 0, NT - 1);
    for (let d = 0; d < NT; d++) {
      for (const i of [i0 - d, i0 + d]) if (i >= 0 && i < NT && tiles[i] === 0) return d === 0 ? x : (i + 0.5) * TILE;
    }
    return x;
  }

  function predictHit(c, b) {
    const s = Object.assign({}, b);
    for (let k = 0; k < 90 && s.live; k++) {
      stepBarrel(s, 1 / 60, true);
      const nx = clamp(s.x, c.x - HW - 6, c.x + HW + 6), ny = clamp(s.y, c.y - HH, c.y);
      if ((s.x - nx) ** 2 + (s.y - ny) ** 2 < BR * BR) return { t: k / 60, x: s.x, low: s.y > c.y - 45 && Math.abs(s.vy) < 400 };
    }
    return null;
  }

  // Tries every power to throw with, and picks the one that comes closest to the other cat (without landing on itself).
  function planThrow(c, o = me) {
    const tx = o.x + o.vx * 0.25 * skill; // good bots aim a little ahead of a moving cat
    let best = 0.5, bestMiss = Infinity;
    for (let pw = 0; pw <= 1.0001; pw += 0.025) {
      const l = launch({ x: c.x, y: c.y, vx: 0, face: c.face }, pw);
      const s = { x: l.x, y: l.y, vx: l.vx, vy: l.vy, spin: 0, rot: 0, live: true, age: 0, chute: false, h: -1, lava: 0 };
      let miss = Infinity, self = false;
      for (let k = 0; k < 150 && s.live && s.y < LAVA; k++) {
        stepBarrel(s, 1 / 60, true);
        miss = Math.min(miss, Math.hypot(s.x - clamp(s.x, tx - HW, tx + HW), s.y - clamp(s.y, o.y - HH, o.y)));
        if (s.age > 0.3 && Math.hypot(s.x - clamp(s.x, c.x - HW, c.x + HW), s.y - clamp(s.y, c.y - HH, c.y)) < BR) self = true;
      }
      if (!self && miss < bestMiss - 0.5) { bestMiss = miss; best = pw; }
    }
    return best;
  }

  /* ---------- the game loop ---------- */

  function step(dt) {
    if (phase === 'ready') {
      readyT += dt;
      const n = Math.ceil((READY - readyT) / 0.6);
      if (n !== count) { count = n; if (n > 0) sound('tick'); }
      if (readyT >= READY) { phase = 'play'; goAt = performance.now(); sound('go'); }
    }
    stepCat(me, myInput(), dt);
    if (ctx.bot) stepCat(them, botInput(them, dt), dt);
    if (host) { if (phase !== 'ready') stepWorld(dt); }
    else stepPred(dt);
    const b = barrelNow();
    for (const c of local) checkHit(c, b);
    if (host && phase === 'play' && (me.out || them.out)) endGame(me.out && them.out ? -1 : me.out ? themI : meI);
  }

  let simAt = performance.now(), acc = 0, lastFrame = performance.now();
  function advance(now, cap) {
    acc += Math.min(cap, Math.max(0, (now - simAt) / 1000)) * (phase === 'ko' ? 0.45 : 1); // (slow motion for the K.O.)
    simAt = now;
    while (acc >= DT) { acc -= DT; step(DT); }
  }

  function updateViews(now) {
    if (!online) return;
    if (rbuf.length) {
      const s = F.sample(rbuf, now - VIEW_DELAY, ['x', 'y', 'vx', 'vy'], ['power', 'toss']);
      them.rv = Object.assign(them.rv || {}, s, { i: themI, ground: Math.abs(s.y - GY) < 1 });
      if (s.slap && !them.slapSeen) F.whip(them, s.face); // (their slap: fling their arms here too)
      them.slapSeen = s.slap;
    }
    if (!host && bbuf.length) gHost = F.sample(bbuf, now - VIEW_DELAY, ['x', 'y', 'vx', 'vy', 'rot']);
  }

  function frame(now) {
    if (!ctx.alive()) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    updateViews(now);
    advance(now, 0.25);
    render(now, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // (Browsers stop drawing in a hidden tab: the game keeps going anyway, just without the drawing.)
  ctx.every(() => { const now = performance.now(); if (now - lastFrame > 300) { updateViews(now); advance(now, 1.5); } }, 250);
  if (online) {
    ctx.every(() => ctx.send(host
      ? { t: 's', c: packCat(me), b: packBarrel(barrel), g: tiles.join(''), k: ack, v: av, n: bv, bn: bannerN, bt: bannerKey }
      : { t: 's', c: packCat(me) }), SEND_MS);
    ctx.every(() => { if (phase !== 'ko' && performance.now() - lastMsg > 15000) ctx.afk(); }, 1000);
  }
  ctx.score(0, 0);
  ctx.note(LIVES + ' lives each · no clock');
  if (window.__testHooks) {
    window.__bb = { cats, me, them, barrel, tiles, keys, bot, shown: () => shown, phase: () => phase, pred: () => pred, aim: () => planThrow(me, vw(them)) };
  }

  /* ---------- effects ---------- */

  function puff(x, y, n) {
    for (let k = 0; k < n; k++) {
      fx.push({ k: 'dust', x: x + (Math.random() - 0.5) * 20, y: y - 2, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, life: 0.5, max: 0.5, r: 4 + Math.random() * 5 });
    }
  }
  function splash(x, n, quiet) {
    for (let k = 0; k < n; k++) {
      fx.push({ k: 'drop', x: x + (Math.random() - 0.5) * 24, y: LAVA, vx: (Math.random() - 0.5) * 260, vy: -200 - Math.random() * 420, life: 0.9, max: 0.9, r: 3 + Math.random() * 4 });
    }
    fx.push({ k: 'ring', x, y: LAVA, vx: 0, vy: 0, life: 0.5, max: 0.5, r: 10 });
    if (!quiet) sound([[95, 0, 0.18], [70, 0.06, 0.28]]);
  }
  function bonk(x, y) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, s = 150 + Math.random() * 250;
      fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, r: 3 });
    }
    fx.push({ k: 'ring', x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, r: 8, c: '#fff3b0' });
    pop(x, y - 26, 'BONK!', '#ffd23f');
    sound([[180, 0, 0.06], [120, 0.05, 0.14]]);
  }
  function whap(x, y) {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 200;
      fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, max: 0.35, r: 3, c: '#bfeaff' });
    }
    pop(x, y - 30, 'WHAP!', '#7dd3ff');
    shake = Math.max(shake, 6);
    sound([[240, 0, 0.05], [160, 0.04, 0.09]]);
  }
  function pop(x, y, text, color) { fx.push({ k: 'word', x, y, vx: 0, vy: -50, life: 1.1, max: 1.1, text, color }); }
  function thud(b) {
    puff(b.x, GY, 3);
    const now = performance.now();
    if (now - lastThud > 90) { lastThud = now; sound([[110 + Math.random() * 30, 0, 0.07]]); }
  }
  function tileFell(i) {
    chunks.push({ x: (i + 0.5) * TILE, y: GY + (H - GY) / 2, vy: 40, rot: 0, vr: (Math.random() - 0.5) * 1.6 });
    puff((i + 0.5) * TILE, GY, 6);
    shake = Math.max(shake, 4);
  }

  let msgText = '', msgUntil = 0;
  function hint(text) { msgText = text; msgUntil = performance.now() + 1500; }

  /* ---------- drawing ---------- */

  const bgImg = makeBackground();
  const tileImg = makeTile();
  const heat = g.createLinearGradient(0, GY, 0, LAVA);
  heat.addColorStop(0, 'rgba(255,120,40,0)');
  heat.addColorStop(1, 'rgba(255,120,40,.45)');
  let shown = barrel;   // the barrel as drawn this frame
  let armAcc = 0;

  function makeBackground() {
    const c = document.createElement('canvas');
    c.width = W * DPR;
    c.height = H * DPR;
    const b = c.getContext('2d');
    b.scale(DPR, DPR);
    const sky = b.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, '#160f33');
    sky.addColorStop(0.55, '#3b1a4f');
    sky.addColorStop(1, '#8a2a44');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, GY);
    b.fillStyle = '#fff';
    for (let k = 0; k < 60; k++) {
      b.globalAlpha = 0.2 + (k % 5) * 0.12;
      b.fillRect((k * 151.7) % W, (k * 89.3) % 250, 2, 2);
    }
    b.globalAlpha = 1;
    b.fillStyle = 'rgba(255, 226, 168, .15)';
    b.beginPath(); b.arc(830, 84, 44, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#ffe2a8';
    b.beginPath(); b.arc(830, 84, 26, 0, Math.PI * 2); b.fill();
    // volcanoes far away, glowing at the top
    b.fillStyle = '#2b1236';
    b.beginPath();
    [[0, 350], [120, 300], [228, 214], [272, 216], [380, 306], [520, 326], [636, 246], [690, 250], [820, 326], [W, 296], [W, GY], [0, GY]]
      .forEach(([x, y], k) => (k ? b.lineTo(x, y) : b.moveTo(x, y)));
    b.fill();
    b.fillStyle = 'rgba(255, 110, 50, .55)';
    [[250, 215], [663, 248]].forEach(([x, y]) => { b.beginPath(); b.ellipse(x, y, 22, 5, 0, 0, Math.PI * 2); b.fill(); });
    b.fillStyle = '#1f0c26';
    b.beginPath();
    b.moveTo(0, GY);
    for (let x = 0; x <= W; x += 40) b.lineTo(x, 392 + Math.sin(x * 0.012) * 14 + Math.sin(x * 0.031) * 6);
    b.lineTo(W, GY);
    b.fill();
    // the deep pit under the ground
    const pit = b.createLinearGradient(0, GY, 0, H);
    pit.addColorStop(0, '#1a0a14');
    pit.addColorStop(1, '#5a1414');
    b.fillStyle = pit;
    b.fillRect(0, GY, W, H - GY);
    return c;
  }

  function makeTile() {
    const h = H - GY;
    const c = document.createElement('canvas');
    c.width = TILE * DPR;
    c.height = h * DPR;
    const b = c.getContext('2d');
    b.scale(DPR, DPR);
    const rock = b.createLinearGradient(0, 0, 0, h);
    rock.addColorStop(0, '#8a5a3c');
    rock.addColorStop(1, '#3a2220');
    b.fillStyle = rock;
    b.fillRect(0, 0, TILE, h);
    b.fillStyle = 'rgba(0, 0, 0, .18)';
    [[10, 24, 10, 6], [30, 42, 12, 7], [15, 66, 9, 5], [33, 86, 8, 5]].forEach(([x, y, w, hh]) => {
      b.beginPath(); b.ellipse(x, y, w / 2, hh / 2, 0, 0, Math.PI * 2); b.fill();
    });
    b.fillStyle = '#4fc65a';
    b.fillRect(0, 0, TILE, 9);
    b.fillStyle = '#86e690';
    b.fillRect(0, 0, TILE, 3);
    b.fillStyle = '#2f8a3c';
    for (let x = 2; x < TILE; x += 7) b.fillRect(x, 9, 3, 3 + (x % 3));
    b.fillStyle = 'rgba(0, 0, 0, .25)';
    b.fillRect(0, 0, 1.5, h);
    b.fillRect(TILE - 1.5, 0, 1.5, h);
    return c;
  }

  function render(now, dt) {
    updateShown(dt);
    armAcc = Math.min(0.1, armAcc + dt);
    while (armAcc >= DT) { armAcc -= DT; cats.forEach(c => armStep(c, DT)); }
    updateFx(dt);
    for (const c of cats) {
      const v = vw(c);
      c.walk += Math.abs(v.vx) * dt / 100;
      c.squash = Math.max(0, c.squash - dt * 5);
      if (c.rv && v.out && v.y < GY - 2) c.spin += Math.sign(v.vx || 1) * 9 * dt; // (the other player's knocked-out cat spins too)
    }

    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.drawImage(bgImg, 0, 0, W, H);
    let ox = 0, oy = 0;
    if (shake > 0.4) {
      ox = (Math.random() - 0.5) * shake;
      oy = (Math.random() - 0.5) * shake;
      shake *= Math.pow(0.015, dt);
    } else shake = 0;
    g.translate(ox, oy);
    drawLava(now / 1000);
    drawTiles(now);
    drawChunks(dt);
    const b = shown;
    const freeB = b.h < 0 && !b.lava;
    if (freeB) drawShadow(b.x, b.y, BR * 1.1);
    cats.forEach(c => { const v = vw(c); if (!hidden(v)) drawShadow(v.x, v.y - 2, 20); });
    drawCat(them, now);
    drawCat(me, now);
    if (freeB) drawFreeBarrel(b);
    drawFx();
    drawAim();
    drawTags(now);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawOverlay(now);
    updateMsg(now);
  }

  function updateShown(dt) {
    if (host) { shown = barrel; return; }
    if (me.hold) { shown = Object.assign({}, gHost || barrel, { h: meI, live: false, lava: 0 }); return; }
    if (pred) { shown = pred.b; return; }
    const b = gHost || barrel;
    if (blend && blend.t > 0 && b.h < 0) {
      if (blend.dx === undefined) { blend.dx = blend.x - b.x; blend.dy = blend.y - b.y; }
      blend.t -= dt;
      const k = Math.max(0, blend.t / 0.25);
      shown = Object.assign({}, b, { x: b.x + blend.dx * k, y: b.y + blend.dy * k });
    } else shown = b;
  }

  const hidden = v => (v.respawn > 0 && !v.chute) || (v.out && v.y > LAVA + 40);

  // The long, floppy arms (see games-floppy.js): they hold on to the barrel, or to the parachute's strings.
  function armStep(c, dt) {
    const v = vw(c);
    let pins = null;
    if (shown.h === c.i && !shown.lava) {
      const p = holdPos(v);
      pins = [[p.x - BR + 3, p.y + 2], [p.x + BR - 3, p.y + 2]];
    } else if (v.chute) {
      pins = [[v.x - 30, v.y - 122], [v.x + 30, v.y - 122]];
    }
    F.stepArms(c, v, dt, { pins, wild: v.stun || v.out, hidden: hidden(v), ground: armGround });
  }

  // Arms lie on the ground, and hang down the sides of the holes. (True if this bit of arm is lying on the ground.)
  function armGround(p) {
    if (p.y > GY - 4 && solidAt(p.x)) {
      const i = Math.floor(p.x / TILE);
      const holeL = i > 0 && tiles[i - 1] === 2, holeR = i < NT - 1 && tiles[i + 1] === 2;
      if (p.y > GY + 4 && (holeL || holeR)) {
        const l = i * TILE, r = l + TILE;
        p.x = holeL && (!holeR || p.x - l < r - p.x) ? l - 0.5 : r + 0.5;
        p.px = p.x;
      } else {
        p.y = GY - 4;
        if (p.py > p.y) p.py = p.y; // (no bounce: that would fling the arm up)
      }
    }
    return Math.abs(p.y - (GY - 4)) < 0.6 && solidAt(p.x);
  }

  function drawCat(c, now) {
    const v = vw(c);
    if (hidden(v)) return;
    if (v.chute) drawChute(v.x, v.y - 140, 42, c.arms && [c.arms[0][ARM_N], c.arms[1][ARM_N]]);
    const holding = shown.h === c.i && !shown.lava;
    const behind = holding && swingAngle(v) >= 20 && swingAngle(v) <= 160; // (held behind your back)
    const lookRight = (flip ? -v.face : v.face) > 0;
    if (v.dashT > 0 || v.dash === true) speedLines(sx(v.x), v.y, lookRight);
    if (behind) { drawHeld(v); F.drawArms(g, c, sx); }
    let tilt = 0;
    if (v.out) tilt = c.spin;
    else if (v.stun) tilt = Math.sin(now / 45) * 0.25;
    else tilt = clamp(v.vx / (v.ground ? 285 : 400), -1, 1) * (v.ground ? 0.12 : 0.2) * (flip ? -1 : 1);
    if (v.power >= 0) tilt -= (lookRight ? 1 : -1) * 0.14 * v.power; // (leaning back to wind up)
    const bob = v.ground && Math.abs(v.vx) > 40 ? -Math.abs(Math.sin(c.walk * 3)) * 3.5 : 0;
    F.drawBody(g, c, sx(v.x), v.y + bob, {
      tilt, squash: c.squash, lookRight, open: F.mouth(c === me ? 'talk-me' : 'talk-opp') > 0.12,
      alpha: v.inv && !v.out && Math.floor(now / 140) % 2 ? 0.75 : 1, // (a gentle flicker: you can't be hit just now)
    });
    if (!behind) { if (holding) drawHeld(v); F.drawArms(g, c, sx); }
    if (v.stun && !v.out) dizzy(sx(v.x), v.y, now);
  }

  function drawHeld(v) {
    const p = holdPos(v);
    drawBarrel(p.x, p.y, swingRot(v));
  }

  function drawFreeBarrel(b) {
    if (b.live) { // a little trail, so you can see it coming
      g.fillStyle = 'rgba(255, 230, 160, .25)';
      for (let k = 1; k <= 4; k++) {
        g.beginPath();
        g.arc(sx(b.x - b.vx * k * 0.018), b.y - b.vy * k * 0.018, BR * (1 - k * 0.15), 0, Math.PI * 2);
        g.fill();
      }
    }
    if (b.chute) drawChute(b.x, b.y - 52, 28, [{ x: b.x - BR * 0.8, y: b.y - BR }, { x: b.x + BR * 0.8, y: b.y - BR }]);
    if (b.y < -BR) { // up above the screen: show where it'll come down
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(sx(b.x), 6); g.lineTo(sx(b.x) - 9, 22); g.lineTo(sx(b.x) + 9, 22);
      g.closePath();
      g.fill();
      return;
    }
    drawBarrel(b.x, b.y, b.rot);
  }

  function drawBarrel(x, y, rot) {
    g.save();
    g.translate(sx(x), y);
    g.rotate(flip ? -rot : rot);
    const w = BR * 0.82, h = BR * 1.05;
    g.beginPath();
    g.moveTo(-w, -h);
    g.quadraticCurveTo(-w * 1.32, 0, -w, h);
    g.lineTo(w, h);
    g.quadraticCurveTo(w * 1.32, 0, w, -h);
    g.closePath();
    const wood = g.createLinearGradient(-w * 1.3, 0, w * 1.3, 0);
    wood.addColorStop(0, '#6b3a17');
    wood.addColorStop(0.45, '#c98040');
    wood.addColorStop(1, '#6b3a17');
    g.fillStyle = wood;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(61, 31, 11, .5)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-w * 0.4, -h); g.quadraticCurveTo(-w * 0.55, 0, -w * 0.4, h);
    g.moveTo(w * 0.4, -h); g.quadraticCurveTo(w * 0.55, 0, w * 0.4, h);
    g.stroke();
    g.fillStyle = '#596070';
    g.fillRect(-w * 1.5, -h * 0.62, w * 3, 5);
    g.fillRect(-w * 1.5, h * 0.62 - 5, w * 3, 5);
    g.restore();
    g.lineWidth = 2;
    g.strokeStyle = '#3d1f0b';
    g.stroke();
    g.restore();
  }

  function drawChute(x, y, r, hands) {
    const X = sx(x);
    if (hands) {
      g.strokeStyle = 'rgba(255, 255, 255, .75)';
      g.lineWidth = 1.2;
      g.beginPath();
      for (const p of hands) { g.moveTo(X - r, y); g.lineTo(sx(p.x), p.y); g.moveTo(X + r, y); g.lineTo(sx(p.x), p.y); }
      g.stroke();
    }
    g.fillStyle = '#ff5a7a';
    g.beginPath(); g.arc(X, y, r, Math.PI, 0); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(X, y); g.arc(X, y, r, Math.PI * 1.36, Math.PI * 1.64); g.closePath(); g.fill();
  }

  function drawShadow(x, y, r) {
    if (y > GY + 1 || !solidAt(x)) return;
    const d = clamp((GY - y) / 300, 0, 1);
    g.fillStyle = 'rgba(0, 0, 0, ' + (0.32 - d * 0.22) + ')';
    g.beginPath();
    g.ellipse(sx(x), GY + 3, r * (1 - d * 0.5), 5 * (1 - d * 0.5), 0, 0, Math.PI * 2);
    g.fill();
  }

  function drawLava(time) {
    const grd = g.createLinearGradient(0, LAVA - 8, 0, H);
    grd.addColorStop(0, '#ffd04a');
    grd.addColorStop(0.25, '#ff7a1f');
    grd.addColorStop(1, '#a3121c');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, LAVA + Math.sin(x * 0.035 + time * 2.4) * 3.5 + Math.sin(x * 0.013 - time * 1.4) * 3);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    g.fillStyle = heat;
    for (let i = 0; i < NT; i++) if (tiles[i] === 2) g.fillRect(flip ? W - (i + 1) * TILE : i * TILE, GY, TILE, LAVA - GY);
  }

  function drawTiles(now) {
    for (let i = 0; i < NT; i++) {
      if (tiles[i] === 2) continue;
      let x = flip ? W - (i + 1) * TILE : i * TILE, y = GY;
      const k = tiles[i] === 1 ? clamp((now - crackSeen[i]) / 1000 / CRACK, 0, 1) : 0;
      if (k) { x += (Math.random() - 0.5) * (1 + k * 4); y += (Math.random() - 0.5) * k * 3 + k * 2; }
      g.drawImage(tileImg, x, y, TILE, H - GY);
      if (!k) continue;
      g.fillStyle = 'rgba(255, 60, 30, ' + (0.15 + k * 0.35) + ')';
      g.fillRect(x, y, TILE, H - GY);
      const s = (i * 37) % 13;
      g.strokeStyle = 'rgba(40, 0, 0, .85)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + 10 + s, y); g.lineTo(x + 20 + s * 0.5, y + 14 + k * 8); g.lineTo(x + 14, y + 30 + k * 16);
      g.moveTo(x + 20 + s * 0.5, y + 14 + k * 8); g.lineTo(x + 36, y + 22 + k * 10);
      g.stroke();
    }
  }

  function drawChunks(dt) {
    const half = (H - GY) / 2;
    for (let k = chunks.length - 1; k >= 0; k--) {
      const ch = chunks[k];
      ch.vy += 900 * dt;
      ch.y += ch.vy * dt;
      ch.rot += ch.vr * dt;
      if (!ch.splashed && ch.y - half > LAVA) { ch.splashed = true; splash(ch.x, 8, true); }
      if (ch.y - half > H) { chunks.splice(k, 1); continue; }
      g.save();
      g.translate(sx(ch.x), ch.y);
      g.rotate(ch.rot);
      g.drawImage(tileImg, -TILE / 2, -half, TILE, H - GY);
      g.restore();
    }
  }

  function updateFx(dt) {
    for (let k = fx.length - 1; k >= 0; k--) {
      const p = fx[k];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(k, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === 'drop' || p.k === 'spark') p.vy += 900 * dt;
      if (p.k === 'dust') { p.vx *= 0.92; p.vy *= 0.92; }
    }
    if (Math.random() < dt * 8) { // lava bubbles in the holes
      const holes = [];
      for (let i = 0; i < NT; i++) if (tiles[i] === 2) holes.push(i);
      if (holes.length) {
        const i = holes[Math.floor(Math.random() * holes.length)];
        fx.push({ k: 'bub', x: (i + 0.15 + Math.random() * 0.7) * TILE, y: LAVA + 8, vx: 0, vy: -14, life: 0.7, max: 0.7, r: 2 + Math.random() * 3 });
      }
    }
  }

  function drawFx() {
    for (const p of fx) {
      const a = clamp(p.life / p.max, 0, 1);
      const X = sx(p.x);
      if (p.k === 'dust') { g.globalAlpha = a * 0.5; g.fillStyle = '#d9c7b0'; dot(X, p.y, p.r * (1.6 - a * 0.6)); }
      else if (p.k === 'drop') { g.globalAlpha = 1; g.fillStyle = a > 0.5 ? '#ffd04a' : '#ff7a1f'; dot(X, p.y, p.r); }
      else if (p.k === 'spark') { g.globalAlpha = a; g.fillStyle = p.c || '#fff3b0'; dot(X, p.y, p.r); }
      else if (p.k === 'swoosh') { // the slap
        const right = (flip ? -p.face : p.face) > 0;
        g.globalAlpha = a * 0.85;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 6 * a + 1;
        g.beginPath();
        if (right) g.arc(X, p.y, 56, -1.05, 0.7); else g.arc(X, p.y, 56, Math.PI - 0.7, Math.PI + 1.05);
        g.stroke();
      }
      else if (p.k === 'bub') { g.globalAlpha = 0.9; g.strokeStyle = '#ffd04a'; g.lineWidth = 1.5; g.beginPath(); g.arc(X, p.y, p.r, 0, Math.PI * 2); g.stroke(); }
      else if (p.k === 'ring') { g.globalAlpha = a; g.strokeStyle = p.c || '#ffb43c'; g.lineWidth = 3; g.beginPath(); g.arc(X, p.y, p.r + (1 - a) * 40, 0, Math.PI * 2); g.stroke(); }
      else if (p.k === 'word') { g.globalAlpha = Math.min(1, a * 2); label(p.text, X, p.y, 26 + (1 - a) * 6, p.color); }
    }
    g.globalAlpha = 1;
  }

  // Your swing: the circle the barrel goes around, and (once it's high enough) which way it would fly.
  // While you wind up: which way the throw would start off (it leaves from above your head).
  function drawAim() {
    const c = me;
    if (c.power < 0 || c.out || shown.h !== meI) return;
    const l = launch(c, c.power);
    const s = { x: l.x, y: l.y, vx: l.vx, vy: l.vy, spin: 0, rot: 0, live: true, age: 0, chute: false, h: -1, lava: 0 };
    g.fillStyle = '#fff0b4';
    for (let k = 1; k <= 14; k++) {
      for (let j = 0; j < 4; j++) stepBarrel(s, DT, true);
      g.globalAlpha = 0.9 * (1 - k / 15);
      dot(sx(s.x), s.y, 3.2);
    }
    g.globalAlpha = 1;
  }

  // Hearts above each cat (and how hard it's winding up), names below.
  function drawTags(now) {
    for (const c of cats) {
      const v = vw(c);
      if (hidden(v) || v.out) continue;
      const X = sx(v.x);
      for (let k = 0; k < LIVES; k++) heart(X + (k - (LIVES - 1) / 2) * 16, v.y - 100, k < c.lives);
      label(c === me ? 'You' : c.name, X, v.y + 16, 13, c === me ? '#ffd23f' : '#ffffff');
      if (v.power >= 0) {
        g.fillStyle = 'rgba(20, 10, 30, .85)';
        roundRect(X - 27, v.y - 124, 54, 11, 5);
        g.fill();
        g.fillStyle = v.power < 0.5 ? '#7dff8a' : v.power < 0.85 ? '#ffd23f' : '#ff5a5a';
        roundRect(X - 25, v.y - 122, Math.max(7, 50 * v.power), 7, 3.5);
        g.fill();
      }
    }
    const b = shown;
    const v = vw(me);
    if (phase === 'play' && !me.hold && !me.out && b.h < 0 && !b.live && !b.lava && Math.hypot(b.x - v.x, b.y - (v.y - 30)) < GRAB + 40) {
      const X = sx(b.x), Y = b.y - BR - 22 + Math.sin(now / 150) * 2; // a little "V" key: pick it up!
      g.fillStyle = '#fff';
      g.strokeStyle = '#1c1714';
      g.lineWidth = 2;
      roundRect(X - 12, Y - 12, 24, 24, 6);
      g.fill();
      g.stroke();
      g.fillStyle = '#1c1714';
      g.font = '900 15px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('V', X, Y + 1);
    }
  }

  function drawOverlay(now) {
    if (phase === 'ready' && count > 0) bigText(String(count), H / 2 - 30, 110, '#ffd23f', 1);
    if (phase !== 'ready' && now - goAt < 700) bigText('GO!', H / 2 - 30, 110, '#7dff8a', 1 - (now - goAt) / 700);
    const age = now - bannerAt;
    if (age < 2400 && bannerKey) {
      const a = Math.min(1, age / 150, (2400 - age) / 300);
      g.globalAlpha = a;
      g.font = '900 24px ' + FONT;
      const w = g.measureText(BANNERS[bannerKey]).width + 40;
      g.fillStyle = bannerKey === 'quake' ? 'rgba(160, 20, 30, .9)' : 'rgba(20, 10, 30, .85)';
      roundRect(W / 2 - w / 2, 18, w, 42, 21);
      g.fill();
      g.globalAlpha = 1;
      label(BANNERS[bannerKey], W / 2, 40, 24, '#fff', a);
    }
    if (phase === 'ko') {
      bigText('K.O.!', H / 2 - 50, 120, '#ff5a5a', 1);
      const text = winner < 0 ? "It's a draw!" : winner === meI ? 'You win! 🏆' : them.name + ' wins!';
      bigText(text, H / 2 + 40, 40, '#fff', 1);
    }
  }

  function updateMsg(now) {
    let text;
    const b = shown;
    if (now < msgUntil) text = msgText;
    else if (phase === 'ready') text = 'Get ready!';
    else if (phase === 'ko') text = '';
    else if (me.out) text = 'K.O.! Better luck next time';
    else if (me.respawn > 0 || me.chute) text = 'Steer your parachute with ← →';
    else if (me.power >= 0 || me.toss >= 0) text = 'Let go of V to throw it over your head! The longer you hold, the further it flies';
    else if (me.hold) text = 'Hold V to wind up, then let go to throw the barrel';
    else if (b.h < 0 && !b.live && !b.lava && Math.hypot(b.x - me.x, b.y - (me.y - 30)) < GRAB) text = 'Press V to pick up the barrel!';
    else text = '← → move (tap twice to dash) · ↑ jump · V pick up, throw or slap';
    if ($('bbMsg').textContent !== text) setMsg('bbMsg', text);
  }
}

})();
