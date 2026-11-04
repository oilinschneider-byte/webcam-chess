/* The background thread for the camera trackers (see games-tracker.js). Google's MediaPipe detectors run here, so however
   long one takes to look at a camera picture, the game keeps drawing. */
'use strict';

self.exports = {};
self.module = { exports: self.exports };
let detector = null, kind = '', lastStamp = 0;

async function load(m) {
  kind = m.kind;
  // (jsDelivr doesn't label this file as a script, so importScripts would refuse it straight from there)
  const res = await fetch(m.cdn + '/vision_bundle.cjs');
  if (!res.ok) throw new Error('vision_bundle: ' + res.status);
  const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/javascript' }));
  importScripts(url);
  URL.revokeObjectURL(url);
  const vision = self.module.exports;
  const files = await vision.FilesetResolver.forVisionTasks(m.cdn + '/wasm');
  const make = delegate => (kind === 'face'
    ? vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: m.model, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })
    : vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: m.model, delegate }, runningMode: 'VIDEO', numPoses: 1 }));
  try { detector = await make('GPU'); } catch (e) { detector = await make('CPU'); }
}

// Only what the games use goes back.
function brief(res) {
  if (kind !== 'face') return { landmarks: res.landmarks };
  const bs = res.faceBlendshapes && res.faceBlendshapes[0];
  return { faceBlendshapes: bs ? [{ categories: bs.categories.filter(c => c.categoryName === 'eyeBlinkLeft' || c.categoryName === 'eyeBlinkRight').map(c => ({ categoryName: c.categoryName, score: c.score })) }] : [] };
}

self.onmessage = async e => {
  const m = e.data;
  if (m.load) {
    try {
      await load(m);
      self.postMessage({ ready: true });
    } catch (err) {
      self.postMessage({ failed: String((err && err.message) || err) });
    }
    return;
  }
  let res = null;
  try {
    lastStamp = Math.max(m.stamp, lastStamp + 1); // (the detector throws if a time isn't later than the last one)
    res = brief(detector.detectForVideo(m.bitmap, lastStamp));
  } catch (err) { res = null; }
  m.bitmap.close();
  self.postMessage({ id: m.id, res });
};
