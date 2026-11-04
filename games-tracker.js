/* The camera trackers (Google's MediaPipe, Apache 2.0): the body tracker for Pose Match, Simon Says and Shadow Boxing,
   and the face tracker for the Staring Contest. They run on your own computer, in a background thread
   (tracker-worker.js), because looking at one picture takes a while and doing it in the page freezes the game each time.
   Browsers that can't do that run them in the page, like before.

   CA.tracker.load('pose' or 'face') → a promise of a tracker, and tracker.look(video) → { n, res }: the latest answer
   (res, or null when it failed) and how many answers there have been so far (n), so a game can tell when one is new.
   Calling look() asks about the video's newest picture, unless the tracker is still busy with the last one. */
(() => {
'use strict';

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};
const WORKER_WAIT = 60000; // (ms for the background thread to get ready, before trying in the page instead)
const STUCK_MS = 3000;     // (no answer about a picture for this long: stop waiting for it)

// In a background thread. Rejects if the browser can't do that.
function inWorker(kind) {
  return new Promise((resolve, reject) => {
    if (!window.Worker || !window.createImageBitmap || !window.OffscreenCanvas || window.__trackerInPage) { reject(new Error('no background thread')); return; }
    const worker = new Worker('tracker-worker.js?v=96');
    const t = { n: 0, res: null, inWorker: true, look };
    let busy = false, sentAt = 0, vt = -1, id = 0, done = false;
    const fail = err => { if (done) return; done = true; clearTimeout(wait); worker.terminate(); reject(err); };
    const wait = setTimeout(() => fail(new Error('took too long')), WORKER_WAIT);
    worker.onerror = e => fail(new Error(e.message || 'worker error'));
    worker.onmessage = e => {
      const m = e.data;
      if (m.failed) { fail(new Error(m.failed)); return; }
      if (m.ready) { done = true; clearTimeout(wait); resolve(t); return; }
      if (m.id === id) busy = false;
      t.res = m.res;
      t.n++;
    };
    function look(video) {
      const now = performance.now();
      if (busy && now - sentAt > STUCK_MS) busy = false;
      if (!busy && video.readyState >= 2 && video.currentTime !== vt) {
        vt = video.currentTime;
        busy = true;
        sentAt = now;
        const mine = ++id;
        createImageBitmap(video).then(bitmap => {
          worker.postMessage({ bitmap, stamp: performance.now(), id: mine }, [bitmap]);
        }, () => { if (id === mine) busy = false; });
      }
      return t;
    }
    worker.postMessage({ load: true, kind, cdn: CDN, model: MODELS[kind] });
  });
}

// In the page.
async function inPage(kind) {
  const vision = await import(CDN + '/vision_bundle.mjs');
  const files = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
  const make = delegate => (kind === 'face'
    ? vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS.face, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })
    : vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS.pose, delegate }, runningMode: 'VIDEO', numPoses: 1 }));
  let detector;
  try { detector = await make('GPU'); } catch (e) { detector = await make('CPU'); }
  const t = { n: 0, res: null, inWorker: false, look };
  let vt = -1, lastStamp = 0;
  function look(video) {
    if (video.readyState >= 2 && video.currentTime !== vt) {
      vt = video.currentTime;
      lastStamp = Math.max(performance.now(), lastStamp + 1);
      try { t.res = detector.detectForVideo(video, lastStamp); } catch (e) { t.res = null; }
      t.n++;
    }
    return t;
  }
  return t;
}

const loading = {};
function load(kind) {
  if (!loading[kind]) {
    loading[kind] = inWorker(kind).catch(err => {
      console.warn('Camera tracker (' + kind + ') stays in the page:', err.message);
      return inPage(kind);
    });
    loading[kind].catch(err => { console.warn('Camera tracker (' + kind + '):', err); loading[kind] = null; });
  }
  return loading[kind];
}

CA.tracker = { load };

})();
