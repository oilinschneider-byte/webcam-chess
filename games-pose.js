/* Classic Games: Pose Match. Your camera checks your pose with Google's MediaPipe pose detector (Apache 2.0),
   which runs on your own computer. It downloads (about 10 MB) the first time this game comes up. */
(() => {
'use strict';

const { $, setMsg, sound, gauss, shuffle, startTimer, stopTimer, roundMatch, L, skillOf, msOf } = CA.games.kit;

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let detector = null;
let loading = null;

function loadDetector() {
  if (detector) return Promise.resolve(detector);
  if (!loading) {
    loading = (async () => {
      const vision = await import(CDN + '/vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
      const make = delegate => vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1,
      });
      try { detector = await make('GPU'); } catch (e) { detector = await make('CPU'); }
      return detector;
    })();
    loading.catch(err => { console.warn('Pose detector:', err); loading = null; });
  }
  return loading;
}

// Body points (MediaPipe numbering): 0 nose, 11/12 left/right shoulder, 13/14 elbows, 15/16 wrists, 23/24 hips.
function body(p) {
  const seen = i => p[i] && (p[i].visibility == null || p[i].visibility > 0.5);
  if (![0, 11, 12, 15, 16].every(seen)) return null;
  const sw = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y); // shoulder width: poses are measured in these
  if (sw < 0.03) return null;
  return { n: p[0], ls: p[11], rs: p[12], lw: p[15], rw: p[16], sw };
}
const up = (w, b, k) => w.y < b.n.y - k * b.sw; // a wrist higher than the nose (y grows downwards)

const POSES = {
  v: { icon: '🙌', text: 'Arms up in a big V!', test: b => up(b.lw, b, 0.5) && up(b.rw, b, 0.5) && Math.abs(b.lw.x - b.rw.x) > 2.2 * b.sw,
    arms: 'M40,38L22,8M60,38L78,8' },
  one: { icon: '🙋', text: 'Raise just ONE hand!', test: b => (up(b.lw, b, 0.6) && b.rw.y > b.rs.y) || (up(b.rw, b, 0.6) && b.lw.y > b.ls.y),
    arms: 'M40,38L35,64M60,38L64,6' },
  t: { icon: '✈️', text: 'T-pose: arms straight out to the sides!', arms: 'M40,38L10,38M60,38L90,38',
    test: b => Math.abs(b.lw.y - b.ls.y) < 0.5 * b.sw && Math.abs(b.rw.y - b.rs.y) < 0.5 * b.sw && Math.abs(b.lw.x - b.rw.x) > 2.6 * b.sw },
  head: { icon: '🤯', text: 'Both hands on your head!', arms: 'M40,38L27,26L43,13M60,38L73,26L57,13',
    test: b => [b.lw, b.rw].every(w => w.y < b.n.y + 0.1 * b.sw && w.y > b.n.y - 1.1 * b.sw && Math.abs(w.x - b.n.x) < b.sw) },
  circle: { icon: '🙆', text: 'Make a circle: hands together above your head!', arms: 'M40,38L27,18L48,4M60,38L73,18L52,4',
    test: b => up(b.lw, b, 0.9) && up(b.rw, b, 0.9) && Math.abs(b.lw.x - b.rw.x) < b.sw },
};

function figure(name) {
  return '<svg class="ps-fig" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="22" r="9"/><path d="M50,31V70M50,70L39,96M50,70L61,96M40,38H60' +
    POSES[name].arms + '"/></svg>';
}

// Made-up body points for each pose (the tests use these to check the game without a real person on camera).
function fakeBody(name) {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, visibility: 0.9 }));
  const set = (i, x, y) => { p[i] = { x, y, visibility: 0.99 }; };
  set(0, 0.5, 0.3); set(11, 0.6, 0.45); set(12, 0.4, 0.45); set(23, 0.57, 0.85); set(24, 0.43, 0.85);
  const wrists = { v: [0.85, 0.08, 0.15, 0.08], one: [0.62, 0.7, 0.35, 0.1], t: [0.95, 0.46, 0.05, 0.46], head: [0.56, 0.2, 0.44, 0.2],
    circle: [0.53, 0.05, 0.47, 0.05], rest: [0.62, 0.8, 0.38, 0.8] }[name] || [0.62, 0.8, 0.38, 0.8];
  set(15, wrists[0], wrists[1]); set(16, wrists[2], wrists[3]);
  set(13, (0.6 + wrists[0]) / 2, (0.45 + wrists[1]) / 2); set(14, (0.4 + wrists[2]) / 2, (0.45 + wrists[3]) / 2);
  return p;
}
CA.games.pose = { POSES, body, fakeBody, loadDetector };

const LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]];

CA.games.add('pose', {
  name: 'Pose Match', icon: '🕺', camera: true,
  blurb: 'Copy the pose on screen! Your camera checks it. The first to hold the pose wins the round. First to 2!',
  prepare() { loadDetector().catch(() => {}); },
  start(ctx) {
    const ROUND = L(10000);
    const HOLD = 400;
    const order = window.__poseOrder || shuffle(Object.keys(POSES), ctx.rng).slice(0, 3); // (the tests can pick the poses)
    ctx.stage.innerHTML = '<div class="g-pose"><div class="ps-card" id="psCard"></div>' +
      '<div class="ps-cam"><video id="psVideo" class="mirror" autoplay playsinline muted></video><canvas class="mirror" id="psDots" width="640" height="480"></canvas>' +
      '<div class="ps-ok hidden" id="psOk">✓ Hold it!</div></div></div><div class="timer"><i id="psTimer"></i></div><p class="g-msg" id="psMsg"></p>';
    const video = $('psVideo');
    const canvas = $('psDots');
    const g = canvas.getContext('2d');
    let status = detector ? 'ready' : 'loading';
    let target = null;
    let onMatch = null;
    let giveUp = null;
    let heldSince = 0;
    let lastRun = 0;
    loadDetector().then(() => { status = 'ready'; }, () => { status = 'failed'; setMsg('psMsg', "The pose detector couldn't load. It needs the internet the first time."); });

    function draw(p) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (!p) return;
      g.strokeStyle = '#1ed49b';
      g.lineWidth = 6;
      g.lineCap = 'round';
      for (const [a, b] of LINKS) {
        if (!p[a] || !p[b]) continue;
        g.beginPath();
        g.moveTo(p[a].x * canvas.width, p[a].y * canvas.height);
        g.lineTo(p[b].x * canvas.width, p[b].y * canvas.height);
        g.stroke();
      }
      g.fillStyle = '#ffb938';
      for (const i of [0, 11, 12, 13, 14, 15, 16]) if (p[i]) { g.beginPath(); g.arc(p[i].x * canvas.width, p[i].y * canvas.height, 8, 0, Math.PI * 2); g.fill(); }
    }

    const loop = () => {
      if (!ctx.alive()) return;
      requestAnimationFrame(loop);
      const cam = CA.voice.camera;
      if (cam && video.srcObject !== cam) { video.srcObject = cam; video.play().catch(() => {}); }
      const now = performance.now();
      if (now - lastRun < 70) return;
      lastRun = now;
      let p = window.__fakeBody || null; // (the tests put made-up body points here)
      if (!p && detector && CA.voice.cameraOn() && video.readyState >= 2) {
        try { const res = detector.detectForVideo(video, now); p = res.landmarks && res.landmarks[0]; } catch (e) { p = null; }
      }
      draw(p);
      const b = p ? body(p) : null;
      const ok = !!(target && b && POSES[target].test(b));
      $('psOk').classList.toggle('hidden', !ok);
      if (!ok) { heldSince = 0; return; }
      if (!heldSince) heldSince = now;
      if (now - heldSince >= HOLD && onMatch) onMatch();
    };
    requestAnimationFrame(loop);

    roundMatch(ctx, {
      target: 2,
      maxRounds: 3,
      revealMs: 2300,
      play(r, submit) {
        target = order[r - 1];
        heldSince = 0;
        if (window.__testHooks) window.__peek = { pose: target };
        ctx.note('Pose ' + r + ' · first to 2');
        $('psCard').innerHTML = figure(target) + '<b>' + POSES[target].icon + ' ' + POSES[target].text + '</b>';
        setMsg('psMsg', !CA.voice.cameraOn() ? 'Turn your camera on to play (📷 at the top)!' : status === 'failed' ? "The pose detector couldn't load." :
          status === 'loading' ? 'Getting the pose detector ready…' : 'Do the pose and hold it!');
        startTimer('psTimer', ROUND);
        const t0 = performance.now();
        let done = false;
        const finish = v => { if (done) return; done = true; onMatch = null; giveUp = null; stopTimer('psTimer'); submit(v); };
        onMatch = () => {
          const ms = Math.round(performance.now() - t0);
          sound('correct');
          setMsg('psMsg', 'Got it in ' + (ms / 1000).toFixed(1) + 's! 🎉');
          finish({ ms });
        };
        giveUp = () => finish({ ms: null }); // they did it first
        ctx.later(() => { if (!done) { setMsg('psMsg', "Time's up!"); finish({ ms: null }); } }, ROUND);
      },
      onTheirs() { if (giveUp) giveUp(); },
      compare(a, b) { const ma = msOf(a), mb = msOf(b); return ma === mb ? 0 : ma < mb ? 1 : -1; },
      reveal(r, a, b, w) {
        target = null;
        const t = v => (msOf(v) === Infinity ? 'no' : (msOf(v) / 1000).toFixed(1) + 's');
        setMsg('psMsg', (w > 0 ? 'You got it first! ' : w < 0 ? ctx.oppName + ' got it first. ' : 'Nobody got it. ') + 'You: ' + t(a) + ' · ' + ctx.oppName + ': ' + t(b));
      },
      botValue() {
        if (Math.random() < 0.1) return { ms: null };
        return { ms: Math.round(Math.min(ROUND - 300, Math.max(1200, gauss(3800 - skillOf(ctx) * 1600, 900)))) };
      },
      botDelay(r, v) { return v.ms == null ? ROUND : v.ms; },
      botNow() { return { ms: null }; },
    });
  },
});

})();
