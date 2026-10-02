/* Classic Games: Cat Hoops. 1v1 basketball with the long-armed cats (see games-floppy.js). Hold W to jump and shoot:
   a bar fills up next to you, and letting go in the green usually goes in (less often with someone right in your
   face). Close to the hoop, W dunks instead, and V is a quick shot without the bar. Without the ball: jump with W and
   press S to swat a shot away, and V (or S on the ground) slaps the ball out of their hands. Tap A or D twice to dash.
   You pick the ball up just by touching it. Most points in 60 seconds wins; a tie goes to overtime, and the next
   basket wins.

   Online, each app moves its own cat and decides its own shots, slaps and swats. The host's app runs the ball, the
   score and the clock. Against a bot, everything runs here. */
(() => {
'use strict';

const { $, setMsg, sound, gauss, L, skillOf } = CA.games.kit;
const F = CA.floppy;
const { FONT } = F;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
const r1 = v => Math.round(v * 10) / 10;
const num = (v, d) => (Number.isFinite(v) ? v : d);

const W = 960, H = 540;          // the gym (the canvas is scaled to fit the page)
const FLOOR = 488;               // where the cats stand
const DT = 1 / 120;              // the physics runs in small, fixed steps
const G = 2100;                  // gravity for cats
const GBALL = 1600;              // gravity for the ball
const BALL_R = 18;
const RIM_X = [110, 850];        // the two hoops (cat 0, the host's, shoots at the right one)
const RIM_Y = 250, RIM_R = 32;   // the rim's height, and half its width
const BOARD_X = [58, 902];       // the fronts of the backboards
const BOARD_TOP = 160, BOARD_BOT = 288;
const THREE = 300;               // shots from further than this from the hoop are worth 3
const DUNK_RANGE = 150;          // how near the hoop W dunks instead of shooting
const EDGE = 26;                 // how near the walls a cat can go
const JUMP = 860, SHOT_JUMP = 640, SHOT_GRAV = 0.6; // (a jump shot floats a little)
const METER = 0.95;              // seconds for the shot bar to fill up
const GREEN = 0.52, GREEN_HALF = 0.06; // the green part of the bar
const SWAT_REACH = 46, SLAP_REACH = 84;
const DASH_SPEED = 780, DASH_TIME = 0.17, DASH_WAIT = 0.7;
const READY = 1.8;               // the 3-2-1 countdown
const SEND_MS = 50;
const VIEW_DELAY = 110;          // the other player's cat is drawn this many ms in the past, so it moves smoothly

CA.games.add('hoops', {
  name: 'Cat Hoops', icon: '🏀',
  blurb: 'Hold W to jump and shoot: let go when the bar is in the green! Near the hoop, W dunks. V is a quick shot. ' +
    'On defense, jump with W and press S to block, or slap the ball away with V. Tap A or D twice to dash. Most points in 60 seconds wins!',
  start(ctx) { play(ctx); },
});

function play(ctx) {
  const online = !ctx.bot;
  const host = ctx.isHost;              // (against a bot, you're always the host)
  const meI = host ? 0 : 1, themI = 1 - meI;
  const flip = meI === 1;               // the guest sees the gym mirrored, so you always start on the left
  const sx = x => (flip ? W - x : x);
  const skill = skillOf(ctx);
  const GAME_LEN = L(60000) / 1000;
  const goal = i => 1 - i;              // the hoop each cat shoots at
  const goalDir = (i, x) => Math.sign(RIM_X[goal(i)] - x) || (i ? -1 : 1);

  ctx.stage.innerHTML =
    '<div class="g-barrel"><canvas class="bb-canvas" id="hbCanvas" width="' + W + '" height="' + H + '"></canvas>' +
    '<div class="bb-pad" id="hbPad"><div><button data-k="l" aria-label="Move left (tap twice to dash)">◀</button><button data-k="r" aria-label="Move right (tap twice to dash)">▶</button></div>' +
    '<div><button data-k="j" aria-label="Jump and shoot">W</button><button data-k="s" aria-label="Block or slap">S</button>' +
    '<button class="bb-v" data-k="v" aria-label="Quick shot, or slap">V</button></div></div>' +
    '<p class="g-msg" id="hbMsg"></p></div>';
  const cv = $('hbCanvas');
  const g = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR;
  cv.height = H * DPR;
  const { dot, roundRect, label, bigText, speedLines, dizzy } = F.painter(g, W);

  /* ---------- the cats, the ball, the score ---------- */

  function newCat(i, eq, name) {
    return {
      i, name, fur: F.fur(eq), pics: F.pictures(eq),
      x: i ? 580 : 380, y: FLOOR, vx: 0, vy: 0, face: i ? -1 : 1, ground: true,
      hold: false, holdT: 0, noGrab: 0, meter: -1, dunk: false, hang: 0, stun: 0,
      dashT: 0, dashDir: 1, dashCd: 0, airDash: false, swatT: 0, swatCd: 0, slapT: 0, slapCd: 0,
      pj: false, pv: false, ps: false, jumpBuf: 0,
      rv: null,                                    // (the other player's cat, as drawn: see updateViews)
      arms: null, walk: 0, squash: 0, dribble: 0, slapSeen: false, swatSeen: false,
    };
  }
  const cats = [];
  cats[meI] = newCat(meI, CA.profile.equip, 'You');
  cats[themI] = newCat(themI, ctx.oppEquip, ctx.oppName);
  const me = cats[meI], them = cats[themI];
  const local = ctx.bot ? [me, them] : [me];      // the cats this app moves
  const vw = c => c.rv || c;                      // a cat as this app shows it
  const other = c => (c === me ? them : me);

  const newBall = () => ({ x: W / 2, y: 150, vx: 0, vy: 0, rot: 0, h: -1, shot: false, by: -1, pts: 2, age: 9, scored: false, clean: true, dunk: false });
  const ball = newBall();         // (host) h: who holds it; shot: flying from a shot, untouched so far
  let bv = 0, ack = 0, av = 0;    // (host) how often the ball changed; the guest's last ball event, and bv right after it

  const score = [0, 0];
  let phase = 'ready', readyT = 0, count = 0, goAt = 0, winner = null;
  let t = 0, pauseT = 0, nextPoss = 0, overtime = false, resetN = 0;
  let timeLeft = GAME_LEN;
  let evN = 0, evText = '', evHoop = 0, seenEv = 0; // hoop events ("SWISH! +3"), so the guest sees them too
  let shake = 0, cheer = 0, lastMsg = performance.now(), lastBounce = 0, otAt = -1e9;
  const rimShake = [0, 0], netT = [0, 0];
  const fx = [];
  const playing = () => phase === 'play' || phase === 'ot';

  /* ---------- controls ---------- */

  const input = F.controls(ctx,
    { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'j', KeyW: 'j', Space: 'j', ArrowDown: 's', KeyS: 's', KeyV: 'v' },
    { a: 'l', d: 'r', w: 'j', ' ': 'j', s: 's', v: 'v' }, $('hbPad'));
  const keys = input.keys;
  function myInput() { // (the guest's screen is mirrored)
    const d = input.takeDash();
    return flip ? { l: keys.r, r: keys.l, j: keys.j, s: keys.s, v: keys.v, dash: -d } : { l: keys.l, r: keys.r, j: keys.j, s: keys.s, v: keys.v, dash: d };
  }

  /* ---------- moving ---------- */

  function stepCat(c, inp, dt) {
    for (const k of ['stun', 'dashCd', 'swatT', 'swatCd', 'slapT', 'slapCd', 'noGrab']) c[k] = Math.max(0, c[k] - dt);
    const free = c.stun <= 0 && playing();
    const jPress = inp.j && !c.pj, jRelease = !inp.j && c.pj, vPress = inp.v && !c.pv, sPress = inp.s && !c.ps;
    c.pj = inp.j;
    c.pv = inp.v;
    c.ps = inp.s;
    // (A W press is remembered for a moment, so pressing it just before you land, or during a dash, still jumps.)
    c.jumpBuf = jPress ? 0.15 : Math.max(0, (c.jumpBuf || 0) - dt);
    if (c.hold) c.holdT += dt;
    if (c.hang > 0) { // hanging on the rim after a dunk
      c.hang -= dt;
      if (c.hang <= 0) { c.vy = 60; c.ground = false; }
      return;
    }
    if (c.dunk) { stepDunk(c, dt); return; }
    // Dash: tap left or right twice, fast.
    if (inp.dash && free && c.meter < 0 && c.dashCd <= 0 && c.dashT <= 0 && (c.ground || !c.airDash)) {
      c.dashT = DASH_TIME;
      c.dashDir = inp.dash;
      c.dashCd = DASH_WAIT;
      c.face = inp.dash;
      if (!c.ground) c.airDash = true;
      puff(c.x, c.ground ? FLOOR : c.y, 5);
      sound([[700, 0, 0.04], [520, 0.03, 0.06]]);
    }
    if (c.dashT > 0 && c.jumpBuf > 0 && c.ground && free) { c.dashT = 0; c.vx = c.dashDir * 300; } // (a jump ends the dash)
    if (c.dashT > 0) {
      c.dashT -= dt;
      c.vx = c.dashDir * DASH_SPEED * (c.hold ? 0.85 : 1);
      c.vy = 0;
      if (c.dashT <= 0) c.vx = c.dashDir * 300; // (it stops sharply)
    } else {
      const shooting = c.meter >= 0;
      const top = shooting ? 110 : c.hold ? 270 : 300;
      const dir = free ? (inp.r ? 1 : 0) - (inp.l ? 1 : 0) : 0;
      if (dir) {
        c.vx = approach(c.vx, dir * top, (c.ground ? 2600 : 1500) * dt);
        if (!shooting) c.face = dir;
      } else {
        c.vx = approach(c.vx, 0, (c.ground ? (c.stun > 0 ? 800 : 2600) : 260) * dt);
      }
      // W: with the ball, a jump shot (or a dunk, near the hoop); without it, just a jump.
      if (c.jumpBuf > 0 && free && c.ground && !shooting && (inp.j || !c.hold)) {
        c.jumpBuf = 0;
        if (c.hold) {
          if (canDunk(c)) { startDunk(c); return; }
          startShot(c);
        } else { // (always a full jump, however short the tap)
          c.vy = -JUMP;
          c.ground = false;
          puff(c.x, FLOOR, 4);
        }
      }
      // Caught the ball in the air near your hoop, with W held down: dunk it right away.
      if (inp.j && c.hold && !c.ground && free && !shooting && canDunk(c)) { startDunk(c); return; }
      c.vy += (c.meter >= 0 ? G * SHOT_GRAV : G) * dt;
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.x < EDGE) { c.x = EDGE; c.vx = 0; }
    if (c.x > W - EDGE) { c.x = W - EDGE; c.vx = 0; }
    c.ground = false;
    if (c.y >= FLOOR) {
      if (c.vy > 520) { c.squash = 1; puff(c.x, FLOOR, 5); }
      c.y = FLOOR;
      c.vy = 0;
      c.ground = true;
      c.airDash = false;
    }
    // The shot bar fills up while you hold W: let go to shoot (at the top, it shoots by itself).
    if (c.meter >= 0) {
      if (!c.hold) c.meter = -1; // (it got knocked out of your hands)
      else {
        c.meter = Math.min(1, c.meter + dt / METER);
        if (jRelease || c.meter >= 1 || (c.ground && c.meter > 0.2)) shoot(c, c.meter);
      }
    }
    // V: a quick shot with the ball, a slap without it. S: a swat in the air, a slap on the ground.
    if (vPress && free) {
      if (c.hold && c.meter < 0) shoot(c, null);
      else if (!c.hold && c.slapCd <= 0) slap(c);
    }
    if (sPress && free && !c.hold) {
      if (!c.ground && c.swatCd <= 0) swat(c);
      else if (c.ground && c.slapCd <= 0) slap(c);
    }
    if (c.swatT > 0) tryBlock(c);
    if (!c.hold && free && c.noGrab <= 0) tryGrab(c);
  }

  /* ---------- shooting and dunking ---------- */

  // Where a cat holds the ball: bouncing it on the floor (dribbling), or up above its head to shoot or dunk.
  function holdPos(c) {
    const v = vw(c);
    if (v.dunk) return { x: v.x + v.face * 18, y: v.y - 120 };
    if (v.meter >= 0) return { x: v.x + v.face * 8, y: v.y - 112 };
    if (v.hang > 0) return { x: v.x + v.face * 16, y: v.y - 120 };
    if (!(v.ground || Math.abs(v.y - FLOOR) < 1)) return { x: v.x + v.face * 24, y: v.y - 62 };
    const up = Math.abs(Math.sin(c.dribble));
    return { x: v.x + v.face * 30, y: FLOOR - BALL_R - up * 44 };
  }

  function startShot(c) {
    c.meter = 0;
    c.vy = -SHOT_JUMP;
    c.vx *= 0.4;
    c.ground = false;
    c.face = goalDir(c.i, c.x);
    puff(c.x, FLOOR, 4);
  }

  // The launch speed for a ball from (x0, y0) to come down through (xt, yt), in a nice high arc.
  function aim(x0, y0, xt, yt) {
    const dx = xt - x0, ax = Math.max(30, Math.abs(dx)), dir = Math.sign(dx) || 1, dy = yt - y0;
    const tan = clamp(-2.4 * dy / ax, 1.25, 14);
    const a = Math.atan(tan), cos = Math.cos(a);
    const s = Math.sqrt(GBALL * ax * ax / Math.max(1, 2 * cos * cos * (dy + ax * tan)));
    return { vx: dir * s * cos, vy: -s * Math.sin(a) };
  }

  // How much the other cat is in your face: 1 = wide open, lower = harder to make.
  function contest(c) {
    const o = vw(other(c));
    const d = Math.hypot(o.x - c.x, (o.y - c.y) * 0.6);
    let f = d < 75 ? 0.45 : d < 135 ? 0.72 : d < 190 ? 0.9 : 1;
    if (d < 150 && o.y < FLOOR - 30) f *= 0.8; // (they jumped at you)
    return f;
  }

  // Let go of the ball towards your hoop. m: where the bar was (0 to 1), or null for a quick shot (V).
  function shoot(c, m) {
    const h = goal(c.i);
    if (m === null && c.ground) { c.vy = -380; c.ground = false; } // (a little hop)
    c.face = goalDir(c.i, c.x);
    c.meter = -1;
    const from = { x: c.x + c.face * 8, y: c.y - 112 };
    const dist = Math.abs(RIM_X[h] - c.x);
    const pts = dist > THREE ? 3 : 2;
    let chance, verdict = '';
    if (m === null) chance = dist < 190 ? 0.62 : pts === 2 ? 0.42 : 0.26;
    else {
      const off = Math.abs(m - GREEN);
      verdict = off <= GREEN_HALF ? 'perfect' : m < GREEN ? 'early' : 'late';
      chance = off <= GREEN_HALF ? 0.92 : off <= GREEN_HALF + 0.12 ? 0.45 : 0.08;
    }
    if (pts === 3) chance *= 0.85;
    if (dist > 640) chance *= 0.55;
    const guarded = contest(c);
    chance *= guarded;
    const make = Math.random() < chance;
    const dir = Math.sign(RIM_X[h] - from.x) || c.face;
    let aimX = RIM_X[h];
    if (!make) { // short (off the front of the rim) or long (off the back), or an air ball for a really bad one
      const wild = m !== null && Math.abs(m - GREEN) > GREEN_HALF + 0.12 && Math.random() < 0.4;
      aimX += (Math.random() < 0.5 ? -1 : 1) * dir * (wild ? 44 + Math.random() * 40 : 23 + Math.random() * 10);
    }
    const v = aim(from.x, from.y, aimX, RIM_Y - 2);
    c.hold = false;
    c.noGrab = 0.3;
    const nb = { x: from.x, y: from.y, vx: v.vx, vy: v.vy, rot: 0, h: -1, shot: true, by: c.i, pts, age: 0, scored: false, clean: true, dunk: false };
    if (host) setBall(nb);
    else guestEvent('shot', nb);
    sound([[440, 0, 0.04], [660, 0.03, 0.05]]);
    if (c === me) {
      if (verdict) pop(c.x, c.y - 150, verdict === 'perfect' ? 'PERFECT!' : verdict === 'early' ? 'EARLY' : 'LATE', verdict === 'perfect' ? '#7dff8a' : '#ffb43c');
      if (guarded < 0.8) pop(c.x, c.y - 178, 'CONTESTED', '#ff7a7a');
    }
  }

  // W dunks when you're close to your hoop.
  function canDunk(c) { return Math.abs(RIM_X[goal(c.i)] - c.x) < DUNK_RANGE; }

  // Fly up to the rim and slam it through.
  function startDunk(c) {
    const rx = RIM_X[goal(c.i)];
    const dir = Math.sign(rx - c.x) || c.face;
    c.dunk = true;
    c.face = dir;
    c.meter = -1;
    c.dashT = 0;
    c.vy = -Math.sqrt(2 * G * Math.max(60, c.y - (RIM_Y + 108))); // (high enough for the ball above your head to be over the rim)
    c.vx = (rx - dir * 16 - c.x) / (-c.vy / G);
    c.ground = false;
    puff(c.x, FLOOR, 6);
    sound([[392, 0, 0.06], [523, 0.06, 0.08]]);
  }

  function stepDunk(c, dt) {
    if (!c.hold) { c.dunk = false; return; } // (blocked!)
    c.vy += G * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.vy >= 0) slam(c);
  }

  function slam(c) {
    const h = goal(c.i), rx = RIM_X[h];
    c.dunk = false;
    c.hold = false;
    c.noGrab = 0.8;
    c.hang = 0.4;
    c.x = rx - c.face * 16;
    c.vx = 0;
    c.vy = 0;
    const nb = { x: rx, y: RIM_Y - 24, vx: 0, vy: 560, rot: 0, h: -1, shot: true, by: c.i, pts: 2, age: 0, scored: false, clean: true, dunk: true };
    if (host) setBall(nb);
    else guestEvent('shot', nb);
    rimShake[h] = 1;
    shake = Math.max(shake, 10);
    sound('boom');
  }

  /* ---------- picking up, slapping, blocking ---------- */

  // You pick up a loose ball just by touching it. (But not while it's up at a hoop, bouncing on the rim: nobody can
  // snatch a shot that might still go in.)
  const atRim = b => b.y < RIM_Y + 30 && RIM_X.some(rx => Math.abs(b.x - rx) < RIM_R + 40);
  function tryGrab(c) {
    const b = ballNow();
    if (b.h >= 0 || b.shot || b.scored || atRim(b)) return;
    if (Math.hypot(b.x - c.x, b.y - (c.y - 48)) > 54) return;
    c.hold = true;
    c.holdT = 0;
    sound('flip');
    if (host) setBall({ h: c.i, shot: false });
    else guestEvent('grab', null);
  }

  // V (or S on the ground) without the ball: a slap with those long arms. The other cat is stunned for a moment and
  // the ball rolls away from it: then it's a race for the loose ball. (Online, the slapper's app decides whether the
  // slap reached.)
  function slap(c) {
    c.slapT = 0.28;
    c.slapCd = 0.85;
    F.whip(c, c.face);
    fx.push({ k: 'swoosh', x: c.x, y: c.y - 46, face: c.face, vx: 0, vy: 0, life: 0.2, max: 0.2 });
    sound([[520, 0, 0.04], [340, 0.03, 0.07]]);
    const o = other(c), v = vw(o);
    const ahead = (v.x - c.x) * c.face;
    if (ahead < -12 || ahead > SLAP_REACH || Math.abs(v.y - c.y) > 55) return;
    const had = ballNow().h === o.i;
    if (had) c.noGrab = 0.45; // (you don't catch it straight away: it rolls off)
    if (local.includes(o)) stripped(o, c.face);
    else { ctx.send({ t: 'slap', d: c.face }); whap(v.x, v.y - 50, had ? 'LOOSE BALL!' : 'WHAP!'); }
  }

  // You got slapped: if you had the ball, you're stunned for a moment and it rolls away. (Without the ball, a slap
  // does nothing much, so nobody can keep you stunned.)
  function stripped(c, dir) {
    const had = c.hold;
    if (had) {
      c.vx = 0;
      c.stun = 0.8;
      c.meter = -1;
      c.dunk = false;
      c.dashT = 0;
      letGo(c, dir * 230, -160, 0.8);
    }
    whap(c.x, c.y - 50, had ? 'LOOSE BALL!' : 'WHAP!');
  }

  // The ball leaves your hands (knocked away): it flies off with that speed.
  function letGo(c, vx, vy, wait) {
    const p = holdPos(c);
    c.hold = false;
    c.noGrab = wait;
    const nb = { x: p.x, y: p.y, vx, vy, rot: 0, h: -1, shot: false, by: c.i, pts: 2, age: 9, scored: false, clean: true, dunk: false };
    if (host) setBall(nb);
    else guestEvent('drop', nb);
  }

  // S in the air: swing those long arms at the ball. Time it right to block a shot, or a dunk, on its way up.
  function swat(c) {
    c.swatT = 0.16;
    c.swatCd = 0.5;
    F.whip(c, c.face, -0.6);
    fx.push({ k: 'swoosh', x: c.x, y: c.y - 96, face: c.face, vx: 0, vy: 0, life: 0.2, max: 0.2 });
    sound([[600, 0, 0.03], [420, 0.03, 0.06]]);
  }

  // Where the ball is, if a swat by c would reach it right now (in the other cat's hands as it goes up to shoot or
  // dunk, or just after it lets go).
  function swatTarget(c) {
    const o = other(c), ov = vw(o), b = ballNow();
    let bp = null;
    if (b.h === o.i && (ov.meter >= 0 || ov.dunk)) bp = holdPos(o);
    else if (b.h < 0 && b.shot && b.by === o.i && b.age < 0.5) bp = b;
    if (!bp) return null;
    return Math.hypot(bp.x - (c.x + c.face * 22), bp.y - (c.y - 100)) <= SWAT_REACH ? bp : null;
  }

  function tryBlock(c) {
    const bp = swatTarget(c);
    if (!bp) return;
    c.swatT = 0;
    const o = other(c), b = ballNow();
    if (b.h === o.i) { // knocked out of their hands
      if (local.includes(o)) blocked(o, c.face);
      else { ctx.send({ t: 'block', d: c.face }); blockFx(bp); }
    } else { // swatted out of the air
      const nb = Object.assign({}, b, { vx: c.face * 300 - b.vx * 0.2, vy: 160, h: -1, shot: false, clean: false });
      if (host) setBall(nb);
      else guestEvent('swat', nb);
      blockFx(bp);
    }
  }

  // Your shot (or dunk) got swatted out of your hands.
  function blocked(c, dir) {
    if (!c.hold) return;
    const p = holdPos(c);
    c.meter = -1;
    c.dunk = false;
    letGo(c, dir * 320, 120, 0.5);
    blockFx(p);
  }

  function setBall(o) { Object.assign(ball, o); bv++; }

  /* ---------- the ball (the host runs it) ---------- */

  // Moves a free ball. real: this is the real ball on the host (not a guess or a plan), so it can score.
  function stepBall(b, dt, real) {
    b.age += dt;
    const py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt + 0.5 * GBALL * dt * dt; // (exactly, so a shot goes exactly where it was aimed)
    b.vy += GBALL * dt;
    b.rot += b.vx / BALL_R * dt;
    let touched = false;
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.7; touched = true; }
    if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.7; touched = true; }
    for (let h = 0; h < 2; h++) {
      // the backboard: a solid block, so the ball bounces off it from any side (its front, edges or top). It reaches
      // back to the wall, so the ball can't get wedged in a gap behind it.
      const left = h === 0 ? 0 : BOARD_X[1], right = h === 0 ? BOARD_X[0] : W;
      const top = BOARD_TOP - 6, bottom = BOARD_BOT + 6;
      const nx0 = clamp(b.x, left, right), ny0 = clamp(b.y, top, bottom);
      let dx = b.x - nx0, dy = b.y - ny0, d = Math.hypot(dx, dy);
      if (d < BALL_R) {
        if (d < 0.01) { // (the centre got inside: push it out the court side)
          dx = h === 0 ? 1 : -1;
          dy = 0;
          d = 1;
          b.x = (h === 0 ? right : left) + dx * BALL_R;
        } else {
          b.x = nx0 + dx / d * BALL_R;
          b.y = ny0 + dy / d * BALL_R;
        }
        const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 1.62 * vn * nx; b.vy -= 1.62 * vn * ny; }
        if (ny < -0.3) b.vx += (h === 0 ? 1 : -1) * 60; // (it doesn't stay up on top: it rolls off towards the court)
        touched = true;
        b.clean = false;
        if (real && vn < -60) { sound([[200, 0, 0.06]]); rimShake[h] = Math.max(rimShake[h], 0.3); }
      }
      // the rim: a little ball at each end
      for (const ex of [RIM_X[h] - RIM_R, RIM_X[h] + RIM_R]) {
        const dx = b.x - ex, dy = b.y - RIM_Y, d = Math.hypot(dx, dy), min = BALL_R + 5;
        if (d < min && d > 0.01) {
          const nx = dx / d, ny = dy / d;
          b.x = ex + nx * min;
          b.y = RIM_Y + ny * min;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; }
          touched = true;
          b.clean = false;
          if (real) { sound([[620, 0, 0.04], [310, 0.02, 0.08]]); rimShake[h] = Math.max(rimShake[h], 0.5); }
        }
      }
      // through the hoop, from above. (A ball that went up through it from underneath doesn't count when it comes
      // back down, until it has been well away from the hoop.)
      const inHoop = Math.abs(b.x - RIM_X[h]) < RIM_R - 4;
      if (py > RIM_Y && b.y <= RIM_Y && inHoop) b.under = h;
      if (b.under === h && Math.abs(b.x - RIM_X[h]) > RIM_R + BALL_R + 10) b.under = -1;
      if (!b.scored && py < RIM_Y && b.y >= RIM_Y && b.vy > 0 && inHoop && b.under !== h) {
        if (real) basket(h);
        else b.scored = true;
      }
    }
    if (b.scored) { b.vx *= 0.94; b.vy = Math.min(b.vy, 330); } // (the net slows it down)
    if (b.y > FLOOR - BALL_R) {
      b.y = FLOOR - BALL_R;
      if (b.vy > 120) {
        if (real && performance.now() - lastBounce > 80) { lastBounce = performance.now(); sound([[140, 0, 0.05]]); }
        b.vy *= -0.72;
        b.vx *= 0.9;
      } else {
        b.vy = 0;
        b.vx = approach(b.vx, 0, 260 * dt);
      }
      touched = true;
      b.under = -1;
    }
    if (touched) b.shot = false; // (it hit something: now anyone can grab it)
  }

  // (host) The ball went through hoop h: points for whoever shoots at that hoop.
  function basket(h) {
    const b = ball;
    b.scored = true;
    const scorer = goal(0) === h ? 0 : 1;
    const pts = b.by === scorer ? b.pts : 2;
    score[scorer] += pts;
    bv++;
    hoopEvent(h, b.dunk ? 'DUNK!' : (b.clean ? 'SWISH! ' : '') + '+' + pts);
    showScore();
    if (ctx.bot && scorer === themI) ctx.oppCheer();
    phase = 'score';
    pauseT = 1.5;
    nextPoss = 1 - scorer;
  }

  function hoopEvent(h, text) {
    evN++;
    evText = text;
    evHoop = h;
    showHoopEvent(h, text);
  }

  function showHoopEvent(h, text) {
    netT[h] = 1;
    cheer = 1;
    const big = text === 'DUNK!' || text.indexOf('+3') >= 0;
    pop(RIM_X[h], RIM_Y - 60, text, text === 'DUNK!' ? '#ff9a3c' : '#7dff8a');
    if (big) confetti(RIM_X[h], RIM_Y - 40);
    sound(text === 'DUNK!' ? [[523, 0, 0.08], [659, 0.08, 0.08], [784, 0.16, 0.16]] : [[1046, 0, 0.05], [1318, 0.05, 0.1]]);
  }

  function showScore() { ctx.score(score[meI], score[themI]); }

  // (host) After the little pause for a basket: the other cat gets the ball, unless the game is over.
  function afterScore() {
    if (overtime || t >= GAME_LEN) { timeUp(); return; }
    phase = 'play';
    giveBall(nextPoss);
  }

  function timeUp() {
    if (score[0] !== score[1]) { endGame(score[0] > score[1] ? 0 : 1); return; }
    overtime = true;
    otAt = performance.now();
    phase = 'ot';
    ctx.note('🏀 Overtime: the next basket wins!');
    tipOff();
  }

  // Everyone back in place: p gets the ball at half court (or nobody, for a jump ball).
  function giveBall(p) {
    const d = goal(p) === 1 ? 1 : -1;
    const pos = [];
    pos[p] = W / 2 - d * 70;
    pos[1 - p] = W / 2 + d * 90;
    reset(pos, p);
  }
  function tipOff() { reset([380, 580], -1); }

  function reset(pos, p) {
    resetN++;
    for (const c of local) place(c, pos[c.i], p);
    if (p >= 0) setBall({ x: pos[p], y: FLOOR - 60, vx: 0, vy: 0, h: p, shot: false, scored: false, by: -1, age: 9, clean: true, dunk: false });
    else setBall(newBall());
    if (online) ctx.send({ t: 'reset', pos, p, n: resetN });
    sound([[1900, 0, 0.1], [1900, 0.14, 0.18]]);
  }

  function place(c, x, p) {
    Object.assign(c, {
      x, y: FLOOR, vx: 0, vy: 0, ground: true, meter: -1, dunk: false, hang: 0, stun: 0, dashT: 0,
      hold: p === c.i, holdT: 0, noGrab: 0.3, face: goalDir(c.i, x),
    });
  }

  function endGame(w) { // w: the winner (0 or 1)
    if (phase === 'over') return;
    phase = 'over';
    winner = w;
    if (host && online) ctx.send({ t: 'end', w });
    sound([[200, 0, 0.6], [203, 0, 0.6]]);
    ctx.note(w === meI ? 'Final: you win!' : 'Final');
    ctx.later(() => ctx.finish(w === meI ? 'win' : 'lose'), 2600);
  }

  function stepWorld(dt) {
    if (phase === 'play') {
      t += dt;
      if (t >= GAME_LEN) { t = GAME_LEN; phase = 'buzz'; sound([[200, 0, 0.6], [203, 0, 0.6]]); }
    }
    if (phase === 'buzz' && !ball.shot && !ball.scored) timeUp(); // (a shot in the air when the clock runs out still counts)
    if (phase === 'score' && (pauseT -= dt) <= 0) afterScore();
    timeLeft = Math.max(0, GAME_LEN - t);
    const b = ball;
    if (b.h >= 0) {
      const p = holdPos(cats[b.h]);
      Object.assign(b, { x: p.x, y: p.y, vx: vw(cats[b.h]).vx, vy: 0, age: 9 });
    } else if (phase !== 'ready') {
      stepBall(b, dt, true);
    }
  }

  /* ---------- online ---------- */

  function packCat(c) {
    return {
      x: r1(c.x), y: r1(c.y), vx: Math.round(c.vx), vy: Math.round(c.vy), f: c.face, m: c.meter < 0 ? -1 : Math.round(c.meter * 100) / 100,
      dk: c.dunk ? 1 : 0, hg: c.hang > 0 ? 1 : 0, s: c.stun > 0 ? 1 : 0, w: c.slapT > 0 ? 1 : 0, sw: c.swatT > 0 ? 1 : 0, ds: c.dashT > 0 ? 1 : 0,
    };
  }
  function packBall(b) {
    return {
      x: r1(b.x), y: r1(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), r: Math.round(b.rot * 100) / 100, h: b.h,
      s: b.shot ? 1 : 0, by: b.by, p: b.pts, a: r1(Math.min(b.age, 99)), sc: b.scored ? 1 : 0, cl: b.clean ? 1 : 0, dk: b.dunk ? 1 : 0,
    };
  }
  function unpackBall(p) { // (it comes from the other app: check everything)
    return {
      x: clamp(num(p.x, W / 2), -100, W + 100), y: clamp(num(p.y, 150), -2000, H + 200),
      vx: clamp(num(p.vx, 0), -4000, 4000), vy: clamp(num(p.vy, 0), -4000, 4000), rot: num(p.r, 0),
      h: p.h === 0 || p.h === 1 ? p.h : -1, shot: !!p.s, by: p.by === 0 || p.by === 1 ? p.by : -1, pts: p.p === 3 ? 3 : 2,
      age: num(p.a, 9), scored: !!p.sc, clean: !!p.cl, dunk: !!p.dk,
    };
  }

  const rbuf = [], bbuf = [];  // the other cat's recent states; (guest) the host's recent balls
  let gHost = null;            // (guest) the host's ball, as drawn now
  let pred = null;             // (guest) our own guess of the ball after we shot or knocked it, until the host catches up
  let blend = null;            // (guest) then the ball slides over to where the host has it
  let evId = 0;

  function ballNow() { return host ? ball : pred ? pred.b : gHost || ball; }

  function guestEvent(kind, nb) {
    evId++;
    ctx.send({ t: kind, id: evId, b: nb ? packBall(nb) : null });
    if (nb) pred = { b: Object.assign({}, nb), id: evId, born: performance.now() };
  }

  function onGuestEvent(m) {
    const id = Number.isInteger(m.id) ? m.id : 0;
    if (id <= ack) return;
    let ok = true;
    if (m.t === 'grab') {
      ok = ball.h < 0 && !ball.shot && !ball.scored && playing();
      if (ok) setBall({ h: 1, shot: false });
    } else if (m.b && typeof m.b === 'object') {
      const nb = unpackBall(m.b);
      if (m.t === 'swat') {
        if (ball.h < 0 && !ball.scored) setBall(Object.assign(nb, { h: -1, shot: false, scored: false }));
      } else { // a shot, a dunk, or knocked out of their hands
        ok = ball.h === 1;
        if (ok) setBall(Object.assign(nb, { h: -1, by: 1, age: 0, scored: false }));
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
      meter: clamp(num(s.m, -1), -1, 1), dunk: !!s.dk, hang: s.hg ? 1 : 0, stun: !!s.s, slap: !!s.w, swat: !!s.sw, dash: !!s.ds,
    });
    if (rbuf.length > 40) rbuf.shift();
  }

  function onSnapshot(m) {
    if (m.b && typeof m.b === 'object') {
      const b = unpackBall(m.b);
      bbuf.push(Object.assign(b, { at: performance.now() }));
      if (bbuf.length > 40) bbuf.shift();
      const k = num(m.k, 0);
      if (pred && k >= pred.id && (num(m.n, 0) > num(m.v, 0) || b.h >= 0 || b.scored)) endPred();
      if (pred && performance.now() - pred.born > 3000) endPred();
      // Once the host has seen all our ball moves, it has the final say on who holds it.
      if (k >= evId && !pred) {
        if (me.hold && b.h !== meI) { me.hold = false; me.meter = -1; me.dunk = false; me.noGrab = 0.3; }
        else if (!me.hold && b.h === meI) { me.hold = true; me.holdT = 0; }
      }
    }
    if (Array.isArray(m.sc) && m.sc.length === 2) {
      const a = num(m.sc[0], 0), b2 = num(m.sc[1], 0);
      if (a !== score[0] || b2 !== score[1]) { score[0] = a; score[1] = b2; showScore(); }
    }
    if (Number.isFinite(m.tm)) timeLeft = clamp(m.tm, 0, GAME_LEN);
    if (typeof m.ph === 'string' && phase !== 'ready' && phase !== 'over' && ['play', 'score', 'buzz', 'ot'].includes(m.ph)) {
      if (m.ph === 'ot' && !overtime) { overtime = true; otAt = performance.now(); ctx.note('🏀 Overtime: the next basket wins!'); }
      phase = m.ph;
    }
    if (Array.isArray(m.ev) && num(m.ev[0], 0) > seenEv && typeof m.ev[1] === 'string' && (m.ev[2] === 0 || m.ev[2] === 1)) {
      seenEv = m.ev[0];
      showHoopEvent(m.ev[2], m.ev[1].slice(0, 20));
    }
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
    } else if (host && ['grab', 'shot', 'drop', 'swat'].includes(m.t)) {
      onGuestEvent(m);
    } else if (m.t === 'slap' && (m.d === 1 || m.d === -1)) {
      stripped(me, m.d); // (they reached you on their screen)
    } else if (m.t === 'block' && (m.d === 1 || m.d === -1)) {
      blocked(me, m.d);
    } else if (!host && m.t === 'reset' && Array.isArray(m.pos) && [-1, 0, 1].includes(m.p)) {
      place(me, clamp(num(m.pos[meI], W / 2), EDGE, W - EDGE), m.p);
      pred = null;
      blend = null;
    } else if (!host && m.t === 'deny') {
      if (pred && num(m.id, 0) >= pred.id) endPred();
      if (num(m.id, 0) === evId) { me.hold = false; me.meter = -1; me.dunk = false; me.noGrab = 0.3; }
    } else if (!host && m.t === 'end' && (m.w === 0 || m.w === 1)) {
      endGame(m.w);
    }
  });

  function stepPred(dt) {
    if (pred && pred.b.h < 0) stepBall(pred.b, dt, false);
  }

  /* ---------- the bot ---------- */

  const bot = ctx.bot ? {
    inp: { l: false, r: false, j: false, s: false, v: false, dash: 0 }, think: 0.3, goal: null, jumpT: 0,
    tapV: false, dash: 0, release: GREEN, block: false,
  } : null;

  function botInput(c, dt) {
    const inp = bot.inp;
    inp.v = false;
    inp.s = false;
    inp.dash = 0;
    if (c.stun > 0 || !playing() || c.hang > 0 || c.dunk) { inp.l = inp.r = inp.j = false; bot.jumpT = 0; return inp; }
    bot.think -= dt;
    if (bot.think <= 0) { bot.think = 0.1 + (1 - skill) * 0.25 + Math.random() * 0.1; botThink(c); }
    if (c.meter >= 0) { // shooting: let go at the planned spot on the bar
      inp.j = c.meter < bot.release;
      inp.l = inp.r = false;
      return inp;
    }
    if (c.ground && bot.jumpT <= 0) bot.block = false;
    if (bot.block && !c.ground && swatTarget(c)) { inp.s = true; bot.block = false; } // (swat it!)
    let dir = 0;
    if (bot.goal !== null && Math.abs(bot.goal - c.x) > 8) dir = Math.sign(bot.goal - c.x);
    inp.l = dir < 0;
    inp.r = dir > 0;
    if (bot.jumpT > 0) { bot.jumpT -= dt; inp.j = true; } else inp.j = false;
    if (bot.tapV) { bot.tapV = false; inp.v = true; }
    if (bot.dash) { inp.dash = bot.dash; bot.dash = 0; }
    return inp;
  }

  function botThink(c) {
    const o = me, b = ball;
    bot.goal = null;
    if (b.scored) { bot.goal = W / 2; return; }
    if (b.h === c.i) { // attack: drive to the hoop, and shoot when open (or dunk)
      const rx = RIM_X[goal(c.i)], dir = Math.sign(rx - c.x) || -1, adx = Math.abs(rx - c.x);
      const gap = Math.abs(o.x - c.x);
      const inTheWay = Math.sign(o.x - c.x) === dir && gap < 160;
      const open = !inTheWay || gap > 130;
      if (!c.ground) return;
      if (c.holdT < 0.5) bot.drive = Math.random() < 0.45; // (sometimes it goes all the way in for a dunk)
      if (adx < DUNK_RANGE - 15 && (!inTheWay || Math.random() < 0.4 + 0.3 * skill)) { bot.jumpT = 0.05; return; }
      const wantShot = (!bot.drive && adx < 330 && adx > 120 && open && Math.random() < 0.3 + 0.35 * skill) ||
        (adx > THREE + 20 && adx < 480 && open && Math.random() < 0.06 + 0.12 * skill) || c.holdT > 6;
      if (wantShot) {
        bot.release = clamp(GREEN + gauss(0, 0.13 - 0.1 * skill), 0.02, 1); // (easy bots are often early or late)
        bot.jumpT = 0.05;
        return;
      }
      if (inTheWay && gap < 110 && c.dashCd <= 0 && Math.random() < 0.25 + 0.4 * skill) bot.dash = dir; // (drive past)
      bot.goal = rx - dir * 45;
      return;
    }
    if (b.h === o.i) { // defend: stay between you and your hoop
      const dirO = goalDir(o.i, o.x);
      bot.goal = clamp(o.x + dirO * 70, EDGE, W - EDGE);
      const d = Math.abs(o.x - c.x);
      if ((o.meter >= 0 || o.dunk) && d < 140 && c.ground && !bot.block) {
        if (Math.random() < 0.2 + 0.6 * skill) { bot.block = true; bot.jumpT = 0.3; }
      } else if (d < SLAP_REACH - 8 && c.ground && c.slapCd <= 0 && o.meter < 0 && Math.random() < 0.12 + 0.28 * skill) {
        if (Math.sign(o.x - c.x) === c.face) bot.tapV = true;
        else bot.goal = o.x;
      }
      return;
    }
    // A loose ball (or one in the air): go and get it.
    const land = predictBall(b);
    bot.goal = clamp(land, EDGE, W - EDGE);
    if (c.ground && !b.shot && Math.abs(b.x - c.x) < 50 && b.y < c.y - 95 && b.y > c.y - 260 && b.vy > -150) bot.jumpT = 0.3;
    else if (c.ground && c.dashCd <= 0 && Math.abs(land - c.x) > 230 && Math.random() < 0.5 * skill) bot.dash = Math.sign(land - c.x);
  }

  function predictBall(b) { // where a loose ball comes down to about head height
    if (b.h >= 0) return b.x;
    const s = Object.assign({}, b);
    for (let k = 0; k < 120; k++) {
      stepBall(s, 1 / 60, false);
      if (s.vy > 0 && s.y > FLOOR - 120) break;
    }
    return s.x;
  }

  /* ---------- the game loop ---------- */

  function step(dt) {
    if (phase === 'ready') {
      readyT += dt;
      const n = Math.ceil((READY - readyT) / 0.6);
      if (n !== count) { count = n; if (n > 0) sound('tick'); }
      if (readyT >= READY) { phase = 'play'; goAt = performance.now(); sound([[1900, 0, 0.1], [1900, 0.14, 0.18]]); }
    }
    stepCat(me, myInput(), dt);
    if (ctx.bot) stepCat(them, botInput(them, dt), dt);
    if (host) stepWorld(dt);
    else stepPred(dt);
  }

  let simAt = performance.now(), acc = 0, lastFrame = performance.now();
  function advance(now, cap) {
    acc += Math.min(cap, Math.max(0, (now - simAt) / 1000));
    simAt = now;
    while (acc >= DT) { acc -= DT; step(DT); }
  }

  function updateViews(now) {
    if (!online) return;
    if (rbuf.length) {
      const s = F.sample(rbuf, now - VIEW_DELAY, ['x', 'y', 'vx', 'vy'], ['meter']);
      them.rv = Object.assign(them.rv || {}, s, { i: themI, ground: Math.abs(s.y - FLOOR) < 1 });
      if (s.slap && !them.slapSeen) F.whip(them, s.face); // (their slap or swat: fling their arms here too)
      if (s.swat && !them.swatSeen) F.whip(them, s.face, -0.6);
      them.slapSeen = s.slap;
      them.swatSeen = s.swat;
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
      ? { t: 's', c: packCat(me), b: packBall(ball), k: ack, v: av, n: bv, sc: score, tm: r1(timeLeft), ph: phase, ev: [evN, evText, evHoop] }
      : { t: 's', c: packCat(me) }), SEND_MS);
    ctx.every(() => { if (phase !== 'over' && performance.now() - lastMsg > 15000) ctx.afk(); }, 1000);
  }
  ctx.score(0, 0);
  ctx.note(Math.round(GAME_LEN) + ' seconds · most points wins');
  if (window.__testHooks) {
    window.__hb = { cats, me, them, ball, score, keys, bot, shown: () => shown, phase: () => phase, pred: () => pred, timeLeft: () => timeLeft };
  }

  /* ---------- effects ---------- */

  function puff(x, y, n) {
    for (let k = 0; k < n; k++) {
      fx.push({ k: 'dust', x: x + (Math.random() - 0.5) * 20, y: y - 2, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, life: 0.5, max: 0.5, r: 4 + Math.random() * 5 });
    }
  }
  function sparks(x, y, color, n) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 220;
      fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, r: 3, c: color });
    }
  }
  function whap(x, y, text) {
    sparks(x, y, '#bfeaff', 8);
    pop(x, y - 30, text, text === 'WHAP!' ? '#7dd3ff' : '#ffd23f');
    shake = Math.max(shake, 6);
    sound([[240, 0, 0.05], [160, 0.04, 0.09]]);
  }
  function blockFx(p) {
    sparks(p.x, p.y, '#ffffff', 10);
    fx.push({ k: 'ring', x: p.x, y: p.y, vx: 0, vy: 0, life: 0.35, max: 0.35, r: 10, c: '#ffffff' });
    pop(p.x, p.y - 34, 'BLOCKED!', '#ff5a7a');
    shake = Math.max(shake, 8);
    sound([[300, 0, 0.05], [150, 0.04, 0.12]]);
  }
  function confetti(x, y) {
    const colors = ['#ffd23f', '#ff5a7a', '#7dff8a', '#6cc8ff', '#b28cff', '#ff9a3c'];
    for (let k = 0; k < 36; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 200 + Math.random() * 320;
      fx.push({ k: 'conf', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.4, max: 1.4, r: 3 + Math.random() * 3, c: colors[k % colors.length], spin: Math.random() * 6 });
    }
  }
  function pop(x, y, text, color) { fx.push({ k: 'word', x, y, vx: 0, vy: -50, life: 1.1, max: 1.1, text, color }); }

  /* ---------- drawing ---------- */

  const gymBack = makeGymBack();
  const gymFront = makeGymFront();
  const crowd = makeCrowd();
  let shown = ball;   // the ball as drawn this frame
  let armAcc = 0;

  function layer() {
    const c = document.createElement('canvas');
    c.width = W * DPR;
    c.height = H * DPR;
    const b = c.getContext('2d');
    b.scale(DPR, DPR);
    return [c, b];
  }

  // The wall, the windows and the bleachers (the crowd sits on them, in front of this).
  function makeGymBack() {
    const [c, b] = layer();
    const wall = b.createLinearGradient(0, 0, 0, 380);
    wall.addColorStop(0, '#202a46');
    wall.addColorStop(1, '#34446a');
    b.fillStyle = wall;
    b.fillRect(0, 0, W, 380);
    for (const x of [175, 405, 635]) { // tall windows with the city outside
      b.fillStyle = '#141b33';
      b.fillRect(x - 8, 34, 166, 178);
      const sky = b.createLinearGradient(0, 40, 0, 206);
      sky.addColorStop(0, '#7fa6e6');
      sky.addColorStop(1, '#c3d6f5');
      b.fillStyle = sky;
      b.fillRect(x, 42, 150, 162);
      b.fillStyle = 'rgba(70, 90, 140, .55)';
      for (let k = 0; k < 6; k++) b.fillRect(x + 6 + k * 24, 120 + ((k * 37) % 40), 18, 84 - ((k * 37) % 40));
      b.fillStyle = '#141b33';
      b.fillRect(x + 72, 42, 6, 162);
      b.fillRect(x, 118, 150, 5);
    }
    for (const x of [80, 320, 640, 880]) { // the lights
      const glow = b.createRadialGradient(x, 0, 4, x, 0, 90);
      glow.addColorStop(0, 'rgba(255, 245, 210, .55)');
      glow.addColorStop(1, 'rgba(255, 245, 210, 0)');
      b.fillStyle = glow;
      b.fillRect(x - 90, 0, 180, 90);
      b.fillStyle = '#fff6d8';
      b.fillRect(x - 22, 0, 44, 6);
    }
    for (let x = 30; x < W; x += 70) { // pennants
      b.fillStyle = (x / 70) % 2 < 1 ? '#7b5cff' : '#ff9a3c';
      b.beginPath(); b.moveTo(x, 222); b.lineTo(x + 40, 222); b.lineTo(x + 20, 250); b.closePath(); b.fill();
    }
    b.fillStyle = 'rgba(255, 255, 255, .25)';
    b.fillRect(0, 220, W, 3);
    for (let k = 0; k < 5; k++) { // the bleachers' steps and seats
      const y = 256 + k * 26;
      b.fillStyle = k % 2 ? '#25314f' : '#2c3a5e';
      b.fillRect(0, y, W, 26);
      b.fillStyle = '#3c5a97';
      for (let x = 10 + (k % 2) * 18; x < W; x += 36) b.fillRect(x, y + 12, 26, 9);
    }
    return c;
  }

  // The padded wall, the court and the hoops' stands and backboards.
  function makeGymFront() {
    const [c, b] = layer();
    b.fillStyle = '#23845f';
    b.fillRect(0, 380, W, 56);
    b.fillStyle = '#35a679';
    b.fillRect(0, 380, W, 6);
    b.fillStyle = 'rgba(0, 0, 0, .18)';
    for (let x = 120; x < W; x += 120) b.fillRect(x, 386, 3, 50);
    const wood = b.createLinearGradient(0, 436, 0, H);
    wood.addColorStop(0, '#d9a066');
    wood.addColorStop(1, '#eab77a');
    b.fillStyle = wood;
    b.fillRect(0, 436, W, H - 436);
    b.strokeStyle = 'rgba(120, 70, 30, .18)';
    b.lineWidth = 1;
    for (let y = 446; y < H; y += 12) { b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); }
    // the court lines, in perspective
    b.strokeStyle = '#6b3fa0';
    b.lineWidth = 7;
    b.beginPath(); b.moveTo(20, 448); b.lineTo(W - 20, 448); b.lineTo(W + 40, 534); b.lineTo(-40, 534); b.closePath(); b.stroke();
    b.strokeStyle = 'rgba(255, 255, 255, .9)';
    b.lineWidth = 3;
    b.beginPath(); b.moveTo(30, 452); b.lineTo(W - 30, 452); b.lineTo(W + 20, 528); b.lineTo(-20, 528); b.closePath(); b.stroke();
    b.beginPath(); b.moveTo(W / 2, 452); b.lineTo(W / 2, 528); b.stroke();
    b.beginPath(); b.ellipse(W / 2, 490, 110, 26, 0, 0, Math.PI * 2); b.stroke();
    for (const s of [0, 1]) {
      const mx = x => (s ? W - x : x);
      b.strokeStyle = 'rgba(255, 255, 255, .9)';
      b.lineWidth = 3;
      b.fillStyle = 'rgba(123, 92, 255, .18)';
      b.beginPath(); b.moveTo(mx(30), 466); b.lineTo(mx(230), 466); b.lineTo(mx(250), 516); b.lineTo(mx(20), 516); b.closePath(); b.fill(); b.stroke();
      b.beginPath(); b.ellipse(mx(RIM_X[0]), 490, THREE, 40, 0, s ? Math.PI / 2 : -Math.PI / 2, s ? Math.PI * 1.5 : Math.PI / 2); b.stroke();
      // the stand: a padded base, a pole and an arm out to the backboard
      b.fillStyle = '#2d4fa3';
      b.fillRect(Math.min(mx(0), mx(40)), 412, 40, 66);
      b.fillStyle = '#4a72d1';
      b.fillRect(Math.min(mx(0), mx(40)), 412, 40, 7);
      b.fillStyle = '#9aa3b5';
      b.fillRect(Math.min(mx(16), mx(28)), 290, 12, 124);
      b.strokeStyle = '#9aa3b5';
      b.lineWidth = 8;
      b.beginPath(); b.moveTo(mx(22), 296); b.lineTo(mx(44), 268); b.stroke();
      // the backboard, seen a little from the side
      b.fillStyle = 'rgba(225, 240, 255, .62)';
      b.strokeStyle = '#ffffff';
      b.lineWidth = 3;
      b.beginPath(); b.moveTo(mx(36), BOARD_TOP - 8); b.lineTo(mx(66), BOARD_TOP + 8); b.lineTo(mx(66), BOARD_BOT + 8); b.lineTo(mx(36), BOARD_BOT - 6); b.closePath(); b.fill(); b.stroke();
      b.strokeStyle = '#ff5a5a';
      b.lineWidth = 3;
      b.beginPath(); b.moveTo(mx(46), 216); b.lineTo(mx(60), 222); b.lineTo(mx(60), 252); b.lineTo(mx(46), 246); b.closePath(); b.stroke();
      b.strokeStyle = '#c94a10';
      b.lineWidth = 4;
      b.beginPath(); b.moveTo(mx(62), RIM_Y + 4); b.lineTo(mx(RIM_X[0] - RIM_R), RIM_Y + 2); b.stroke();
    }
    return c;
  }

  // The crowd: rows of cats in the bleachers (they jump up when someone scores).
  function makeCrowd() {
    const furs = ['#f7a14a', '#aeb6c4', '#f1f3f8', '#f6deb0', '#44475a', '#ff7b3a', '#8be36c', '#6cc8ff', '#ff96d2', '#b394ff', '#ffd23f'];
    const shirts = ['#ff5a5a', '#4d8dff', '#ffd23f', '#1ed49b', '#b28cff', '#ff96d2', '#ffffff'];
    const rows = [];
    for (let r = 0; r < 4; r++) {
      const c = document.createElement('canvas');
      c.width = W * DPR;
      c.height = 60 * DPR;
      const b = c.getContext('2d');
      b.scale(DPR, DPR);
      for (let x = 20 + (r % 2) * 18; x < W; x += 36) {
        if (Math.random() < 0.12) continue; // (an empty seat)
        const fur = furs[Math.floor(Math.random() * furs.length)];
        b.fillStyle = shirts[Math.floor(Math.random() * shirts.length)];
        b.beginPath(); b.ellipse(x, 52, 13, 12, 0, 0, Math.PI * 2); b.fill();
        b.fillStyle = fur;
        b.beginPath(); b.moveTo(x - 11, 30); b.lineTo(x - 9, 15); b.lineTo(x - 2, 25); b.closePath(); b.fill();
        b.beginPath(); b.moveTo(x + 11, 30); b.lineTo(x + 9, 15); b.lineTo(x + 2, 25); b.closePath(); b.fill();
        b.beginPath(); b.arc(x, 33, 11, 0, Math.PI * 2); b.fill();
        b.fillStyle = '#1c1714';
        b.beginPath(); b.arc(x - 4, 32, 1.8, 0, Math.PI * 2); b.arc(x + 4, 32, 1.8, 0, Math.PI * 2); b.fill();
      }
      rows.push(c);
    }
    return rows;
  }

  function render(now, dt) {
    updateShown(dt);
    for (const c of cats) {
      const v = vw(c);
      c.walk += Math.abs(v.vx) * dt / 100;
      c.squash = Math.max(0, c.squash - dt * 5);
      const was = Math.floor(c.dribble / Math.PI);
      c.dribble += dt * (Math.abs(v.vx) > 40 ? 10 : 6.5);
      if (c === me && shown.h === meI && v.ground && Math.floor(c.dribble / Math.PI) !== was) sound([[110, 0, 0.03]]); // (bounce, bounce)
    }
    armAcc = Math.min(0.1, armAcc + dt);
    while (armAcc >= DT) { armAcc -= DT; cats.forEach(c => armStep(c, DT)); }
    updateFx(dt);
    cheer = Math.max(0, cheer - dt * 0.7);
    for (let h = 0; h < 2; h++) { rimShake[h] = Math.max(0, rimShake[h] - dt * 3); netT[h] = Math.max(0, netT[h] - dt * 1.6); }

    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.drawImage(gymBack, 0, 0, W, H);
    crowd.forEach((row, r) => {
      const hop = cheer > 0 ? -Math.abs(Math.sin(now / 90 + r * 1.3)) * 8 * cheer : 0;
      g.drawImage(row, 0, 236 + r * 26 + hop, W, 60);
    });
    g.drawImage(gymFront, 0, 0, W, H);
    let ox = 0, oy = 0;
    if (shake > 0.4) {
      ox = (Math.random() - 0.5) * shake;
      oy = (Math.random() - 0.5) * shake;
      shake *= Math.pow(0.015, dt);
    } else shake = 0;
    g.translate(ox, oy);
    for (let h = 0; h < 2; h++) drawRim(h, false);
    const b = shown;
    const free = b.h < 0;
    drawShadow(free ? b.x : holdPos(cats[b.h]).x, free ? b.y : holdPos(cats[b.h]).y, 11);
    cats.forEach(c => { const v = vw(c); drawShadow(v.x, v.y - 2, 20); });
    drawCat(them, now);
    drawCat(me, now);
    if (free) drawBall(b.x, b.y, b.rot);
    for (let h = 0; h < 2; h++) { drawNet(h); drawRim(h, true); }
    drawFx();
    drawTags(now);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawHud(now);
    updateMsg();
  }

  function updateShown(dt) {
    if (host) { shown = ball; return; }
    if (me.hold) { shown = Object.assign({}, gHost || ball, { h: meI }); return; }
    if (pred) { shown = pred.b; return; }
    const b = gHost || ball;
    if (blend && blend.t > 0 && b.h < 0) {
      if (blend.dx === undefined) { blend.dx = blend.x - b.x; blend.dy = blend.y - b.y; }
      blend.t -= dt;
      const k = Math.max(0, blend.t / 0.25);
      shown = Object.assign({}, b, { x: b.x + blend.dx * k, y: b.y + blend.dy * k });
    } else shown = b;
  }

  // The arms hold the ball: one paw on top while dribbling, both up above the head to shoot. After a dunk they hang
  // on to the rim.
  function armStep(c, dt) {
    const v = vw(c);
    let pins = null;
    if (v.hang > 0) {
      const h = Math.abs(v.x - RIM_X[0]) < Math.abs(v.x - RIM_X[1]) ? 0 : 1;
      const front = RIM_X[h] - Math.sign(RIM_X[h] - v.x) * (RIM_R - 4);
      pins = [[front - 7, RIM_Y + 2], [front + 7, RIM_Y + 2]];
    } else if (shown.h === c.i) {
      const p = holdPos(c);
      if (v.meter >= 0 || v.dunk || !v.ground) pins = [[p.x - BALL_R + 2, p.y], [p.x + BALL_R - 2, p.y]];
      else {
        pins = [null, null];
        pins[v.face > 0 ? 1 : 0] = [p.x, p.y - BALL_R + 2];
      }
    }
    F.stepArms(c, v, dt, { pins, wild: v.stun, ground: armGround });
  }

  function armGround(p) { // the floor and the walls (true if this bit of arm is lying on the floor)
    if (p.y > FLOOR - 4) { p.y = FLOOR - 4; if (p.py > p.y) p.py = p.y; }
    if (p.x < 2) p.x = 2;
    if (p.x > W - 2) p.x = W - 2;
    return Math.abs(p.y - (FLOOR - 4)) < 0.6;
  }

  function drawCat(c, now) {
    const v = vw(c);
    const lookRight = (flip ? -v.face : v.face) > 0;
    if (v.dashT > 0 || v.dash === true) speedLines(sx(v.x), v.y, lookRight);
    let tilt = 0;
    if (v.stun) tilt = Math.sin(now / 45) * 0.25;
    else tilt = clamp(v.vx / (v.ground ? 300 : 420), -1, 1) * (v.ground ? 0.12 : 0.2) * (flip ? -1 : 1);
    const bob = v.ground && Math.abs(v.vx) > 40 ? -Math.abs(Math.sin(c.walk * 3)) * 3.5 : 0;
    F.drawBody(g, c, sx(v.x), v.y + bob, { tilt, squash: c.squash, lookRight, open: F.mouth(c === me ? 'talk-me' : 'talk-opp') > 0.12 });
    if (shown.h === c.i) { const p = holdPos(c); drawBall(p.x, p.y, shown.rot + c.dribble * 0.4); }
    F.drawArms(g, c, sx);
    if (v.stun) dizzy(sx(v.x), v.y, now);
  }

  function drawBall(x, y, rot) {
    g.save();
    g.translate(sx(x), y);
    g.rotate(flip ? -rot : rot);
    const grd = g.createRadialGradient(-4, -5, 2, 0, 0, BALL_R);
    grd.addColorStop(0, '#ffb067');
    grd.addColorStop(1, '#e0620f');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, BALL_R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3b1d08';
    g.lineWidth = 1.6;
    g.stroke();
    g.beginPath();
    g.moveTo(-BALL_R, 0); g.lineTo(BALL_R, 0);
    g.moveTo(0, -BALL_R); g.lineTo(0, BALL_R);
    g.moveTo(-BALL_R * 0.6, -BALL_R * 0.8); g.quadraticCurveTo(-BALL_R * 0.15, 0, -BALL_R * 0.6, BALL_R * 0.8);
    g.moveTo(BALL_R * 0.6, -BALL_R * 0.8); g.quadraticCurveTo(BALL_R * 0.15, 0, BALL_R * 0.6, BALL_R * 0.8);
    g.stroke();
    g.restore();
  }

  function drawShadow(x, y, r) {
    const d = clamp((FLOOR - y) / 300, 0, 1);
    g.fillStyle = 'rgba(0, 0, 0, ' + (0.28 - d * 0.18) + ')';
    g.beginPath();
    g.ellipse(sx(x), FLOOR + 2, r * (1 - d * 0.5), 5 * (1 - d * 0.5), 0, 0, Math.PI * 2);
    g.fill();
  }

  // A rim, seen a little from above: the back half behind the ball, the front half in front of it.
  function drawRim(h, front) {
    const X = sx(RIM_X[h]), Y = RIM_Y + Math.sin(performance.now() / 30) * 3 * rimShake[h];
    g.strokeStyle = front ? '#ff6a1a' : '#c94a10';
    g.lineWidth = 7;
    g.beginPath();
    g.ellipse(X, Y, RIM_R + 2, 8, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    g.stroke();
  }

  function drawNet(h) {
    const X = sx(RIM_X[h]), top = RIM_Y + 4 + Math.sin(performance.now() / 30) * 3 * rimShake[h];
    const swish = netT[h];
    const bottom = top + 42 + swish * 12, sway = Math.sin(performance.now() / 70) * 4 * swish;
    g.strokeStyle = 'rgba(255, 255, 255, .85)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let k = 0; k <= 6; k++) {
      const f = k / 6 - 0.5;
      const xt = X + f * 2 * (RIM_R + 1), xb = X + sway + f * 2 * (RIM_R - 9);
      g.moveTo(xt, top);
      g.lineTo(xb, bottom);
    }
    for (let k = 1; k <= 3; k++) {
      const y = top + (bottom - top) * k / 4, w = RIM_R + 1 - (10 * k) / 4;
      g.moveTo(X - w + sway * k / 4, y);
      g.lineTo(X + w + sway * k / 4, y);
    }
    g.stroke();
  }

  // The shot bar, next to a cat while it shoots: it fills from the bottom to the top, with the green in the middle.
  function drawMeter(x, y, m) {
    const w = 18, h = 104, top = y;
    g.fillStyle = 'rgba(20, 10, 30, .85)';
    roundRect(x - w / 2 - 3, top - 3, w + 6, h + 6, 7);
    g.fill();
    const lo = GREEN - GREEN_HALF, hi = GREEN + GREEN_HALF;
    const grd = g.createLinearGradient(0, top + h, 0, top);
    grd.addColorStop(0, '#4a1210');
    grd.addColorStop(0.18, '#c2410c');
    grd.addColorStop(lo - 0.12, '#ffd23f');
    grd.addColorStop(lo - 0.002, '#c6f05a');
    grd.addColorStop(lo, '#22c55e');
    grd.addColorStop(hi, '#22c55e');
    grd.addColorStop(hi + 0.002, '#c6f05a');
    grd.addColorStop(hi + 0.12, '#ffd23f');
    grd.addColorStop(0.85, '#e8590c');
    grd.addColorStop(1, '#b3261e');
    g.fillStyle = grd;
    roundRect(x - w / 2, top, w, h, 5);
    g.fill();
    const my = top + h * (1 - m);
    g.fillStyle = '#111';
    g.fillRect(x - w / 2 - 6, my - 3, w + 12, 6);
    g.strokeStyle = '#fff';
    g.lineWidth = 1;
    g.strokeRect(x - w / 2 - 6, my - 3, w + 12, 6);
  }

  function updateFx(dt) {
    for (let k = fx.length - 1; k >= 0; k--) {
      const p = fx[k];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(k, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === 'spark') p.vy += 900 * dt;
      if (p.k === 'conf') { p.vy += 600 * dt; p.vx *= 0.98; }
      if (p.k === 'dust') { p.vx *= 0.92; p.vy *= 0.92; }
    }
  }

  function drawFx() {
    for (const p of fx) {
      const a = clamp(p.life / p.max, 0, 1);
      const X = sx(p.x);
      if (p.k === 'dust') { g.globalAlpha = a * 0.5; g.fillStyle = '#e8d2b4'; dot(X, p.y, p.r * (1.6 - a * 0.6)); }
      else if (p.k === 'spark') { g.globalAlpha = a; g.fillStyle = p.c || '#fff3b0'; dot(X, p.y, p.r); }
      else if (p.k === 'conf') { g.globalAlpha = Math.min(1, a * 2); g.fillStyle = p.c; g.fillRect(X - p.r, p.y - p.r / 2, p.r * 2, p.r * Math.abs(Math.sin(p.life * p.spin * 3))); }
      else if (p.k === 'ring') { g.globalAlpha = a; g.strokeStyle = p.c || '#ffb43c'; g.lineWidth = 3; g.beginPath(); g.arc(X, p.y, p.r + (1 - a) * 40, 0, Math.PI * 2); g.stroke(); }
      else if (p.k === 'swoosh') {
        const right = (flip ? -p.face : p.face) > 0;
        g.globalAlpha = a * 0.85;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 6 * a + 1;
        g.beginPath();
        if (right) g.arc(X, p.y, 56, -1.05, 0.7); else g.arc(X, p.y, 56, Math.PI - 0.7, Math.PI + 1.05);
        g.stroke();
      } else if (p.k === 'word') { g.globalAlpha = Math.min(1, a * 2); label(p.text, X, p.y, 26 + (1 - a) * 6, p.color); }
    }
    g.globalAlpha = 1;
  }

  // Names below each cat, the shot bars, and a "3PT" when you're past the line with the ball.
  function drawTags(now) {
    for (const c of cats) {
      const v = vw(c);
      const X = sx(v.x);
      label(c === me ? 'You' : c.name, X, v.y + 16, 13, c === me ? '#ffd23f' : '#ffffff');
      if (v.meter >= 0) {
        const lookRight = (flip ? -v.face : v.face) > 0;
        drawMeter(X + (lookRight ? -48 : 48), v.y - 172, v.meter);
      }
    }
    if (shown.h === meI && me.meter < 0) {
      const d = Math.abs(RIM_X[goal(meI)] - me.x);
      if (d > THREE) label('3PT', sx(me.x), me.y - 110, 14, '#ffd23f');
      else if (canDunk(me)) label('DUNK!', sx(me.x), me.y - 110, 14 + Math.sin(now / 90) * 1.5, '#ff9a3c');
    }
  }

  function drawHud(now) {
    // the scoreboard
    const x = W / 2;
    g.fillStyle = 'rgba(15, 18, 40, .9)';
    roundRect(x - 170, 8, 340, 50, 14);
    g.fill();
    g.strokeStyle = '#6b3fa0';
    g.lineWidth = 3;
    g.stroke();
    label(String(score[meI]), x - 120, 34, 30, '#ffd23f');
    label('You', x - 70, 34, 13, '#ffd23f');
    label(String(score[themI]), x + 120, 34, 30, '#ffffff');
    label(them.name.length > 9 ? them.name.slice(0, 8) + '…' : them.name, x + 66, 34, 13, '#ffffff');
    const clock = overtime ? 'OT' : Math.floor(timeLeft / 60) + ':' + String(Math.floor(timeLeft % 60)).padStart(2, '0');
    label(clock, x, 34, 24, timeLeft <= 10 && !overtime ? '#ff5a5a' : '#7dff8a');
    if (phase === 'ready' || now - goAt < 4000) { // which hoop is yours
      label('YOUR HOOP →', W - 150, 132, 16, '#ffd23f', phase === 'ready' ? 1 : clamp(1 - (now - goAt - 3000) / 1000, 0, 1));
    }
    if (phase === 'ready' && count > 0) bigText(String(count), H / 2 - 30, 110, '#ffd23f', 1);
    if (phase !== 'ready' && now - goAt < 700) bigText('TIP-OFF!', H / 2 - 30, 80, '#7dff8a', 1 - (now - goAt) / 700);
    if (phase === 'buzz') bigText("TIME'S UP!", H / 2 - 40, 60, '#ff5a5a', 1);
    if (overtime && now - otAt < 3000) bigText('OVERTIME: NEXT BASKET WINS!', 110, 30, '#ffd23f', 1);
    if (phase === 'over') {
      bigText('FINAL', H / 2 - 50, 90, '#ffd23f', 1);
      bigText(winner === meI ? 'You win! 🏆' : them.name + ' wins!', H / 2 + 30, 40, '#fff', 1);
    }
  }

  function updateMsg() {
    let text;
    if (phase === 'ready') text = 'Get ready! You shoot at the hoop on the right →';
    else if (!playing()) text = '';
    else if (me.meter >= 0) text = 'Let go of W when the bar is in the green!';
    else if (me.hold && canDunk(me)) text = 'Press W to DUNK!';
    else if (me.hold) text = 'Hold W to jump and shoot, let go in the green · V quick shot · tap A or D twice to dash';
    else if (shown.h === themI) text = 'Defend! Jump with W and press S to block · V slaps the ball away';
    else text = 'Get the ball! Just touch it to pick it up';
    if ($('hbMsg').textContent !== text) setMsg('hbMsg', text);
  }
}

})();
