/* Classic Games: Staring Contest. Both players look into their cameras and try not to blink: the first to blink loses
   the round. First to 2 rounds; a round that reaches 40 seconds is a draw.

   Your camera is checked on your own computer with Google's MediaPipe face detector (Apache 2.0, about 4 MB, loaded
   the first time). It measures how open your eyes are; nothing is recorded, and no video goes anywhere for this.
   The line for "closed" moves up a little (never far) for eyes the camera sees as partly closed even when wide open,
   so squinting doesn't help (squinted eyes count as closed). A blink has to shut both eyes: a wink doesn't count.
   Each round starts once both players' eyes are properly open, and a blink only counts when your eyes are closed for
   a couple of checks in a row, so a flicker of the tracking doesn't count.
   If a camera loses the face, the round pauses (and starts over if it stays lost), instead of anyone losing. It's a
   casual game: a camera can be fooled.
   The host's app keeps the score (see games-duel.js). */
(() => {
'use strict';

const W = 960, H = 540;

const WIN = 2, MAX_ROUNDS = 4, ROUND = 40, SETUP_WAIT = 25, LOST_PAUSE = 0.4, LOST_RESET = 8, GRACE = 0.7;
let detector = null;
let dis = null;                                   // the latest distraction: { to, k, at }

function loadDetector() {
  return CA.tracker.load('face').then(d => { detector = d; return d; }); // (see games-tracker.js)
}

CA.games.add('stare', {
  name: 'Staring Contest', icon: '😐', camera: true,
  blurb: 'Look into your camera and DON\'T BLINK! The first to blink loses the round. First to 2. (Your camera is only checked on your own computer: nothing is recorded or sent.)',
  prepare() { loadDetector().catch(() => {}); },
  start(ctx) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const their = document.createElement('video');
    their.muted = true;
    their.playsInline = true;
    ctx.onEnd(() => { video.srcObject = null; their.srcObject = null; });
    let status = detector ? 'ready' : 'loading';
    loadDetector().then(() => { status = 'ready'; }, () => { status = 'failed'; });
    // thr: the line for "closed" (how closed your eyes are, 0 to 1). It starts at BASE_THR, and each round it moves up a
    // little for eyes that the camera sees as partly closed even when they're wide open (some eyes, glasses, or looking
    // down at a laptop screen): it sits a step above how your eyes looked while the round got ready, but never above
    // MAX_THR. So squinting while it gets ready helps hardly at all (squinted eyes are past MAX_THR: they count as closed).
    // Real blinks are quick (about a tenth of a second), so the camera is read on every new video frame (about 30 times
    // a second) and a blink counts after two closed frames in a row, or one frame of eyes squeezed fully shut.
    const BASE_THR = 0.27, MAX_THR = 0.36, ABOVE = 0.17;
    const eye = { open: 1, face: false, last: 0, openSince: 0, thr: BASE_THR, strong: 0.5, rdy: 0.45, closed: 0, sent: false, ph: '', rd: 0, raw: null, seen: -1, flash: 0, calm: [] };

    // Reads the camera (about 15 times a second) and turns it into controls: 'face' (held while your face is
    // seen), 'ready' (held once your eyes are properly open) and 'blink' (pressed once when you blink).
    function local(v, s) {
      if (!s) return;
      if (s.ph !== eye.ph || s.rd !== eye.rd) { // a new round or a new phase
        if (s.ph === 'calib' && s.rd !== eye.rd) { eye.calm = []; eye.thr = BASE_THR; } // (a new round: measure your open eyes afresh)
        if (s.ph === 'calib') { eye.openSince = 0; v.hold('ready', false); }
        if (s.ph === 'stare' && eye.calm.length >= 5) { // the line for this round, from your open eyes (see eye.thr)
          const sorted = eye.calm.slice().sort((a, b) => a - b);
          eye.thr = Math.max(BASE_THR, Math.min(MAX_THR, sorted[sorted.length >> 1] + ABOVE));
        }
        eye.closed = 0;
        eye.sent = false;
        eye.ph = s.ph;
        eye.rd = s.rd;
      }
      const now = performance.now();
      if (now - eye.last < 30) return;
      eye.last = now;
      let blink = eye.raw, fresh = true;
      const fake = window.__fakeFace; // (the tests use a made-up face)
      if (fake) blink = fake.face ? fake.blink : null;
      else {
        const cam = CA.voice.camera;
        if (cam && video.srcObject !== cam) { video.srcObject = cam; video.play().catch(() => {}); }
        if (detector && CA.voice.cameraOn() && video.readyState >= 2) {
          const got = detector.look(video);
          if (got.n === eye.seen) fresh = false; // (no new answer yet: keep the last reading, count nothing)
          else {
            eye.seen = got.n;
            blink = null;
            try {
              const res = got.res;
              const bs = res && res.faceBlendshapes && res.faceBlendshapes[0];
              if (bs) {
                const get = n => { const c = bs.categories.find(x => x.categoryName === n); return c ? c.score : 0; };
                const l = get('eyeBlinkLeft'), r = get('eyeBlinkRight');
                // (mostly the more open eye: a blink shuts both, but a wink, or the tracking slipping on one eye, doesn't count)
                blink = 0.75 * Math.min(l, r) + 0.25 * Math.max(l, r);
              }
            } catch (e) { blink = null; }
          }
        } else blink = null;
      }
      eye.raw = blink;
      eye.face = blink != null;
      v.hold('face', eye.face);
      if (!eye.face) { eye.closed = 0; eye.openSince = 0; return; }
      eye.open = 1 - blink;
      if (!fresh) return;
      if (s.ph === 'calib') { // ready once your eyes have been properly open for a moment (squinting doesn't count)
        if (blink > eye.rdy) eye.openSince = 0;
        else {
          if (!eye.openSince) eye.openSince = now;
          eye.calm.push(blink);
          if (eye.calm.length > 90) eye.calm.shift();
        }
        if (eye.openSince && now - eye.openSince >= 600) v.hold('ready', true);
        else v.hold('ready', false);
      } else if (s.ph === 'stare') {
        eye.closed = blink > eye.thr ? eye.closed + 1 : 0;
        if ((eye.closed >= 2 || blink > eye.strong) && !eye.sent) { eye.sent = true; v.press('blink'); v.hold('blink', false); } // (a press, not held: so the next blink counts too)
      }
    }

    function draw(v, s) {
      const g = v.g;
      const bgr = g.createLinearGradient(0, 0, 0, H);
      bgr.addColorStop(0, '#134a86');
      bgr.addColorStop(1, '#0f2f55');
      g.fillStyle = bgr;
      g.fillRect(0, 0, W, H);
      const panel = (x, i) => {
        g.save();
        v.roundRect(x, 110, 400, 300, 22);
        g.clip();
        g.fillStyle = '#1b5a9c';
        g.fillRect(x, 110, 400, 300);
        let shown = false;
        if (i === v.me && CA.voice.cameraOn() && video.readyState >= 2) {
          g.translate(x + 400, 110); g.scale(-1, 1); // (mirrored, like a mirror)
          const k = Math.max(400 / video.videoWidth, 300 / video.videoHeight);
          g.drawImage(video, (400 - video.videoWidth * k) / 2, (300 - video.videoHeight * k) / 2, video.videoWidth * k, video.videoHeight * k);
          shown = true;
        } else if (i !== v.me) {
          const src = ctx.theirCam && ctx.theirCam();
          if (src && their.srcObject !== src) { their.srcObject = src; their.play().catch(() => {}); }
          if (!src) their.srcObject = null;
          if (src && their.readyState >= 2) {
            const k = Math.max(400 / their.videoWidth, 300 / their.videoHeight);
            g.drawImage(their, x + (400 - their.videoWidth * k) / 2, 110 + (300 - their.videoHeight * k) / 2, their.videoWidth * k, their.videoHeight * k);
            shown = true;
          }
        }
        g.restore();
        if (!shown) v.catSide(i, x + 200, 400, 2.6, { lookRight: i === 0 });
        g.strokeStyle = v.team[i].main;
        g.lineWidth = 4;
        v.roundRect(x, 110, 400, 300, 22); g.stroke();
        if (s.ph === 'result' && s.rw >= 0 && s.rw !== i) { // whoever blinked
          g.fillStyle = 'rgba(255, 60, 60, .3)';
          v.roundRect(x, 110, 400, 300, 22); g.fill();
          v.label('😵 Blinked!', x + 200, 270, 32, '#ffffff');
        }
        v.label(i === v.me ? 'You' : v.names[i], x + 200, 95, 18, v.team[i].light);
        g.fillStyle = 'rgba(255, 255, 255, .15)';
        for (let k = 0; k < WIN; k++) v.star(x + 170 + k * 60, 440, 12);
        g.fillStyle = v.team[i].main;
        for (let k = 0; k < s.w[i]; k++) v.star(x + 170 + k * 60, 440, 9);
        if (!s.f[i] && s.ph !== 'result') v.label("😶 Can't see a face", x + 200, 260, 20, '#ff9a9a');
        else if (s.ph === 'calib' && s.rdy[i]) v.label('✓ Ready', x + 200, 380, 18, '#7dff8a');
      };
      panel(40, v.me === 0 ? 0 : 1);
      panel(520, v.me === 0 ? 1 : 0);
      if (s.ph === 'calib') v.bigText('Look at the camera… eyes open!', 50, 26, '#ffffff', 1);
      else if (s.ph === 'stare') v.bigText("DON'T BLINK! " + s.t.toFixed(1) + 's', 52, 34, '#ffd23f', 1);
      else if (s.ph === 'paused') v.bigText("Paused: can't see a face", 52, 28, '#ff9a9a', 1);
      else if (s.ph === 'result') v.bigText(s.rw < 0 ? 'Nobody blinked: a draw!' : s.rw === v.me ? 'They blinked! Round to you' : 'You blinked!', 52, 32, s.rw === v.me ? '#7dff8a' : '#ff9a9a', 1);
      if (s.ph === 'stare') { // how long until a draw
        g.fillStyle = 'rgba(255, 255, 255, .12)';
        v.roundRect(40, 66, 880, 8, 4); g.fill();
        g.fillStyle = '#ffd23f';
        v.roundRect(40, 66, Math.max(8, 880 * Math.min(1, s.t / ROUND)), 8, 4); g.fill();
      }
      // your eyes, as the camera sees them
      if (eye.face) { // the calm bar: full when your eyes are wide open, and the nearer it gets to the white line, the nearer you are to blinking
        const closeness = Math.max(0, Math.min(1, (1 - eye.open) / eye.thr)); // 0 = wide open, 1 = at the line
        g.fillStyle = 'rgba(0, 0, 0, .55)';
        v.roundRect(40, 472, 880, 22, 11); g.fill();
        g.fillStyle = closeness > 0.75 ? '#ff5a5a' : closeness > 0.45 ? '#ffd23f' : '#7dff8a';
        v.roundRect(42, 474, Math.max(8, 876 * (1 - closeness * 0.85)), 18, 9); g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(40 + 880 * 0.15 - 1, 468, 3, 30); // (the blink line)
        v.label(closeness > 0.75 ? '😬 ABOUT TO BLINK!' : '👁 stay calm: eyes wide open', 480, 508, 13, closeness > 0.75 ? '#ff9a9a' : '#cccccc');
      }
      if (s.ph === 'stare') { // the distraction button
        const cd = Math.max(0, s.dc[v.me] || 0);
        v.label(cd > 0 ? '😜 Distract them in ' + Math.ceil(cd) + 's' : '😜 Space: distract them!', 480, 456, 13, cd > 0 ? '#999999' : '#ffd23f');
      }
      if (dis && v.now - dis.at < 1500) { // a (harmless) distraction on the panel of whoever it was aimed at
        const t = (v.now - dis.at) / 1500, onLeft = v.me === dis.to ? 40 : 520;
        g.save();
        g.beginPath(); v.roundRect(onLeft, 110, 400, 300, 22); g.clip();
        if (dis.k === 0) { v.label('🙀', onLeft + 200, 260, 140 * Math.sin(Math.min(1, t * 1.6) * Math.PI), '#ffffff'); }
        else if (dis.k === 1) { g.fillStyle = 'rgba(255, 255, 255, ' + 0.5 * Math.sin(t * Math.PI) + ')'; g.fillRect(onLeft, 110, 400, 300); }
        else if (dis.k === 2) { for (let k = 0; k < 9; k++) v.label('🐟', onLeft + 40 + k * 40, 100 + ((t * 420 + k * 70) % 330), 34, '#ffffff'); }
        else { v.label('BOO!', onLeft + 200 + Math.sin(v.now / 40) * 8, 260, 70, '#ff5aa5'); }
        g.restore();
      }
      if (!CA.voice.cameraOn() && !window.__fakeFace) v.msg('Turn your camera on to play (📷 at the top)! It\'s only checked on this computer.', true);
      else if (status === 'loading' && !window.__fakeFace) v.msg('Getting the face detector ready…');
      else if (status === 'failed' && !window.__fakeFace) v.msg("The face detector couldn't load. It needs the internet the first time.", true);
    }

    CA.duel.run(ctx, {
      id: 'stare', bigCams: true,
      pad: { buttons: [{ k: 'a', label: '😜 Distract', main: true }] },
      help: "Don't blink! · Space sends a (harmless) distraction to the other player · your camera is only checked on this computer",
      note: 'First to ' + WIN + ' rounds',
      init: () => ({ ph: 'calib', rd: 1, w: [0, 0], rw: -1, t: 0, wait: 0, lost: 0, paused: 0, grace: 0, res: 0, face: [false, false], ready: [false, false], dc: [4, 4] }),
      step(s, inp, dt, api) {
        s.face = inp.map(n => !!n.held.face);
        s.ready = inp.map(n => !!n.held.ready && !!n.held.face);
        if (s.ph === 'calib') {
          s.wait += dt;
          if (s.ready[0] && s.ready[1]) { s.ph = 'stare'; s.t = 0; s.grace = GRACE; s.lost = 0; api.ev('go', {}); }
          else if (s.wait > SETUP_WAIT) api.end(s.w[0] === s.w[1] ? -1 : s.w[0] > s.w[1] ? 0 : 1, 'NO FACE');
        } else if (s.ph === 'stare' || s.ph === 'paused') {
          const both = s.face[0] && s.face[1];
          if (!both) {
            s.lost += dt;
            if (s.lost > LOST_PAUSE) s.ph = 'paused';
            if (s.lost > LOST_RESET) { s.ph = 'calib'; s.wait = 0; } // (the face stayed lost: this round starts over)
            return;
          }
          if (s.ph === 'paused') { s.ph = 'stare'; s.grace = GRACE; }
          s.lost = 0;
          s.t += dt;
          s.grace -= dt;
          s.dc = s.dc.map((d, i) => { // distractions: one every few seconds, aimed at the other player
            d = Math.max(0, d - dt);
            if (d <= 0 && inp[i].hit.a && s.grace <= 0) { d = 7; api.ev('distract', { to: 1 - i, k: Math.floor(Math.random() * 4) }); }
            return d;
          });
          const blinked = inp.map(n => !!n.hit.blink && s.grace <= 0);
          if (blinked[0] || blinked[1] || s.t >= ROUND) {
            const rw = blinked[0] && blinked[1] ? -1 : blinked[0] ? 1 : blinked[1] ? 0 : -1;
            if (rw >= 0) s.w[rw]++;
            s.rw = rw;
            s.ph = 'result';
            s.res = 2.6;
            api.score(s.w[0], s.w[1]);
            api.ev('round', { rw, t: Math.round(s.t * 10) / 10 });
          }
        } else if (s.ph === 'result') {
          s.res -= dt;
          if (s.res <= 0) {
            if (s.w[0] >= WIN || s.w[1] >= WIN || s.rd >= MAX_ROUNDS) api.end(s.w[0] === s.w[1] ? -1 : s.w[0] > s.w[1] ? 0 : 1, 'BLINK!');
            else { s.rd++; s.ph = 'calib'; s.wait = 0; }
          }
        }
      },
      snap: s => ({ ph: s.ph, rd: s.rd, w: s.w, rw: s.rw, t: Math.round(s.t * 10) / 10, f: s.face.map(Number), rdy: s.ready.map(Number), dc: s.dc.map(d => Math.round(d * 10) / 10) }),
      // The bot has its eyes open from the start, and blinks after a while (good bots last a lot longer).
      bot(s, i, dt, api) {
        const b = s.bs || (s.bs = { at: 0, rd: 0 });
        const out = { held: { face: true }, hit: {} };
        if (s.ph === 'calib' && s.wait > 1.5) out.held.ready = true;
        if (s.ph !== 'calib') out.held.ready = true;
        if (b.rd !== s.rd) { b.rd = s.rd; b.at = Math.max(3, CA.games.kit.gauss(9 + 22 * api.skill, 5)); }
        if (s.ph === 'stare' && s.t >= b.at) out.hit.blink = true;
        if (s.ph === 'stare' && Math.random() < 0.003 * (0.5 + api.skill)) out.hit.a = true;
        return out;
      },
      local, draw,
      event(v, e) {
        if (e.type === 'go') { v.sound('go'); }
        if (e.type === 'distract') { dis = { to: e.to, k: e.k, at: v.now }; v.sound(e.to === v.me ? [[500, 0, 0.06], [420, 0.06, 0.08]] : [[700, 0, 0.04]]); }
        if (e.type === 'round') v.sound(e.rw === v.me ? 'point' : e.rw < 0 ? 'draw' : 'miss');
      },
    });
  },
});

})();
