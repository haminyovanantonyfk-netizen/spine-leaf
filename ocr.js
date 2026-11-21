/* SpineLeaf — on-device OCR (Tesseract WASM, English + Malayalam).
   Models are vendored in the app: nothing is uploaded, ever. */
'use strict';
const SLOC = (() => {
  let worker = null;
  let creating = null;
  let cancelled = false;

  async function getWorker(onProgress) {
    if (worker) return worker;
    if (creating) return creating;
    creating = (async () => {
      const w = await Tesseract.createWorker(['eng', 'mal'], Tesseract.OEM.LSTM_ONLY, {
        workerPath: 'vendor/worker.min.js',
        corePath: 'vendor/tesseract-core',
        langPath: 'vendor/tessdata',
        cacheMethod: 'none',
        gzip: true,
        logger: m => {
          if (onProgress && m.status === 'recognizing text') onProgress(m.progress);
        }
      });
      worker = w;
      return w;
    })();
    try { return await creating; } finally { creating = null; }
  }

  /* Recognize a canvas. Returns { text, words:[{text,x0,y0,x1,y1,conf}], width, height } */
  async function recognize(canvas, onProgress) {
    cancelled = false;
    const w = await getWorker(onProgress);
    if (cancelled) throw new Error('cancelled');
    const { data } = await w.recognize(canvas, {}, { blocks: true });
    const words = [];
    const walk = node => {
      if (!node) return;
      if (Array.isArray(node.words)) {
        for (const wd of node.words) {
          if (wd.text && wd.text.trim()) {
            words.push({ text: wd.text, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1, conf: Math.round(wd.confidence || 0) });
          }
        }
      }
      for (const key of ['paragraphs', 'lines', 'blocks']) if (Array.isArray(node[key])) node[key].forEach(walk);
    };
    if (data.blocks) data.blocks.forEach(walk);
    else if (data.words) data.words.forEach(wd => words.push({ text: wd.text, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1, conf: Math.round(wd.confidence || 0) }));
    return { text: (data.text || '').trim(), words, width: canvas.width, height: canvas.height };
  }

  function cancel() { cancelled = true; }
  async function terminate() {
    if (worker) { try { await worker.terminate(); } catch (e) {} worker = null; }
  }
  return { recognize, cancel, terminate };
})();
