/* Classic Games: Staring Contest. Both players look into their cameras and try not to blink: the first to blink loses
   the round. First to 2 rounds; a round that reaches 40 seconds is a draw.

   Your camera is checked on your own computer with Google's MediaPipe face detector (Apache 2.0, about 4 MB, loaded
   the first time). It measures how open your eyes are; nothing is recorded, and no video goes anywhere for this.
   Everybody has the same line for "closed": it isn't measured from your eyes at the start, so squinting doesn't
   help (squinted eyes count as closed). Each round starts once both players' eyes are properly open, and a blink
   only counts when your eyes are closed for a couple of checks in a row, so a flicker of the tracking doesn't count.
   If a camera loses the face, the round pauses (and starts over if it stays lost), instead of anyone losing. It's a
   casual game: a camera can be fooled.
   The host's app keeps the score (see games-duel.js). */
(() => {
'use strict';

const W = 960, H = 540;
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WIN = 2, MAX_ROUNDS = 4, ROUND = 40, SETUP_WAIT = 25, LOST_PAUSE = 0.4, LOST_RESET = 8, GRACE = 0.7;
let detector = null, loading = null;

function loadDetector() {
  if (detector) return Promise.resolve(detector);
  if (!loading) {
    loading = (async () => {
      const vision = await import(CDN + '/vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
      const make = delegate => vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      });
      try { detector = await make('GPU'); } catch (e) { detector = await make('CPU'); }
      return detector;
    })();
    loading.catch(err => { console.warn('Face detector:', err); loading = null; });
  }
  return loading;
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
    // thr: one fixed line for everybody (how closed your eyes are, 0 to 1). It isn't measured from your own eyes at
    // the start, so squinting while it gets ready doesn't help: squinted eyes count as closed.
    const eye = { open: 1, face: false, last: 0, cal: [], thr: 0.5, closed: 0, sent: false, ph: '', rd: 0 };

    // Reads the camera (about 15 times a second) and turns it into controls: 'face' (held while your face is
    // seen), 'ready' (held once your eyes are properly open) and 'blink' (pressed once when you blink).
    function local(v, s) {
      if (!s) return;
      if (s.ph !== eye.ph || s.rd !== eye.rd) { // a new round or a new phase
        if (s.ph === 'calib') { eye.cal = []; v.hold('ready', false); }
        eye.closed = 0;
        eye.sent = false;
        eye.ph = s.ph;
        eye.rd = s.rd;
      }
      const now = performance.now();
      if (now - eye.last < 66) return;
      eye.last = now;
      let blink = null;
      const fake = window.__fakeFace; // (the tests use a made-up face)
      if (fake) blink = fake.face ? fake.blink : null;
      else {
        const cam = CA.voice.camera;
        if (cam && video.srcObject !== cam) { video.srcObject = cam; video.play().catch(() => {}); }
        if (detector && CA.voice.cameraOn() && video.readyState >= 2) {
          try {
            const res = detector.detectForVideo(video, now);
            const bs = res.faceBlendshapes && res.faceBlendshapes[0];
            if (bs) {
              const get = n => { const c = bs.categories.find(x => x.categoryName === n); return c ? c.score : 0; };
              blink = (get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2;
            }
          } catch (e) { blink = null; }
        }
      }
      eye.face = blink != null;
      v.hold('face', eye.face);
      if (!eye.face) { eye.closed = 0; return; }
      eye.open = 1 - blink;
      if (s.ph === 'calib') { // ready once your eyes have been properly open for a moment (squinting doesn't count)
        eye.cal.push(blink);
        if (blink > eye.thr) eye.cal = [];
        if (eye.cal.length >= 10) v.hold('ready', true);
      } else if (s.ph === 'stare') {
        eye.closed = blink > eye.thr ? eye.closed + 1 : 0;
        if (eye.closed >= 2 && !eye.sent) { eye.sent = true; v.press('blink'); }
      }
    }

    function draw(v, s) {
      const g = v.g;
      const bgr = g.createLinearGradient(0, 0, 0, H);
      bgr.addColorStop(0, '#20163a');
      bgr.addColorStop(1, '#0e0b1c');
      g.fillStyle = bgr;
      g.fillRect(0, 0, W, H);
      const panel = (x, i) => {
        g.save();
        v.roundRect(x, 110, 400, 300, 22);
        g.clip();
        g.fillStyle = '#2a2050';
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
      // your eyes, as the camera sees them
      if (eye.face) {
        g.fillStyle = 'rgba(0, 0, 0, .5)';
        v.roundRect(40, 478, 400, 14, 7); g.fill();
        g.fillStyle = eye.open > 1 - eye.thr ? '#7dff8a' : '#ff5a5a';
        v.roundRect(41, 479, Math.max(6, 398 * eye.open), 12, 6); g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(40 + 400 * (1 - eye.thr), 474, 2, 22);
        v.label('👁 how open your eyes are', 240, 508, 12, '#cccccc');
      }
      if (!CA.voice.cameraOn() && !window.__fakeFace) v.msg('Turn your camera on to play (📷 at the top)! It\'s only checked on this computer.', true);
      else if (status === 'loading' && !window.__fakeFace) v.msg('Getting the face detector ready…');
      else if (status === 'failed' && !window.__fakeFace) v.msg("The face detector couldn't load. It needs the internet the first time.", true);
    }

    CA.duel.run(ctx, {
      id: 'stare', bigCams: true,
      help: "Don't blink! · your camera is only checked on this computer: nothing is recorded or sent",
      note: 'First to ' + WIN + ' rounds',
      init: () => ({ ph: 'calib', rd: 1, w: [0, 0], rw: -1, t: 0, wait: 0, lost: 0, paused: 0, grace: 0, res: 0, face: [false, false], ready: [false, false] }),
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
      snap: s => ({ ph: s.ph, rd: s.rd, w: s.w, rw: s.rw, t: Math.round(s.t * 10) / 10, f: s.face.map(Number), rdy: s.ready.map(Number) }),
      // The bot has its eyes open from the start, and blinks after a while (good bots last a lot longer).
      bot(s, i, dt, api) {
        const b = s.bs || (s.bs = { at: 0, rd: 0 });
        const out = { held: { face: true }, hit: {} };
        if (s.ph === 'calib' && s.wait > 1.5) out.held.ready = true;
        if (s.ph !== 'calib') out.held.ready = true;
        if (b.rd !== s.rd) { b.rd = s.rd; b.at = Math.max(3, CA.games.kit.gauss(9 + 22 * api.skill, 5)); }
        if (s.ph === 'stare' && s.t >= b.at) out.hit.blink = true;
        return out;
      },
      local, draw,
      event(v, e) {
        if (e.type === 'go') { v.sound('go'); }
        if (e.type === 'round') v.sound(e.rw === v.me ? 'point' : e.rw < 0 ? 'draw' : 'miss');
      },
    });
  },
});

})();
