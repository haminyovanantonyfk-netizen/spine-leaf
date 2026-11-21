/* SpineLeaf — image pipeline: EXIF-aware loading, perspective correction,
   spread splitting, curved-page correction, filters, quality checks.
   All original code; all processing on-device on canvas. */
'use strict';
const SLImg = (() => {
  const MAXDIM = 2200; // processing cap for speed/memory on phones

  async function loadBitmap(blob) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch (e) {
      return await createImageBitmap(blob);
    }
  }
  function toCanvas(src, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c;
  }
  function fitSize(w, h, cap = MAXDIM) {
    const s = Math.min(1, cap / Math.max(w, h));
    return [Math.round(w * s), Math.round(h * s)];
  }
  async function blobToCanvas(blob) {
    const bmp = await loadBitmap(blob);
    const [w, h] = fitSize(bmp.width, bmp.height);
    const c = toCanvas(bmp, w, h);
    bmp.close && bmp.close();
    return c;
  }
  function canvasToBlob(canvas, type = 'image/jpeg', q = 0.85) {
    return new Promise(res => canvas.toBlob(res, type, q));
  }
  function clone(canvas) { return toCanvas(canvas, canvas.width, canvas.height); }

  /* ---- homography (DLT, Gaussian elimination) ---- */
  function solve8(A, b) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      let piv = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
      const d = A[i][i] || 1e-12;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const f = A[r][i] / d;
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    return b.map((v, i) => v / (A[i][i] || 1e-12));
  }
  function homography(src, dst) {
    // maps src points -> dst points; returns function (x,y)=>[X,Y]
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [X, Y] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
    }
    const h = solve8(A, b);
    return (x, y) => {
      const d = h[6] * x + h[7] * y + 1;
      return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
    };
  }
  /* Perspective-correct: corners = [TL,TR,BR,BL] in source pixels. */
  function warpPerspective(srcCanvas, corners) {
    const [tl, tr, br, bl] = corners;
    const wTop = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
    const wBot = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
    const hL = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
    const hR = Math.hypot(br[0] - tr[0], br[1] - tr[1]);
    const W = Math.max(2, Math.round(Math.max(wTop, wBot)));
    const H = Math.max(2, Math.round(Math.max(hL, hR)));
    const inv = homography([[0, 0], [W, 0], [W, H], [0, H]], corners);
    const sctx = srcCanvas.getContext('2d');
    const sData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d');
    const oData = octx.createImageData(W, H);
    const sw = srcCanvas.width, sh = srcCanvas.height, sd = sData.data, od = oData.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [sx, sy] = inv(x, y);
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const fx = sx - x0, fy = sy - y0;
        const di = (y * W + x) * 4;
        if (x0 < 0 || y0 < 0 || x0 + 1 >= sw || y0 + 1 >= sh) { od[di + 3] = 255; continue; }
        for (let ch = 0; ch < 3; ch++) {
          const i00 = (y0 * sw + x0) * 4 + ch, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
          od[di + ch] = sd[i00] * (1 - fx) * (1 - fy) + sd[i10] * fx * (1 - fy) + sd[i01] * (1 - fx) * fy + sd[i11] * fx * fy;
        }
        od[di + 3] = 255;
      }
    }
    octx.putImageData(oData, 0, 0);
    return out;
  }
  /* Split a two-page spread at gutter fraction gx (0..1). */
  function splitSpread(canvas, gx) {
    const cut = Math.round(canvas.width * gx);
    const left = toCanvas(canvas, cut, canvas.height);
    const lc = left.getContext('2d'); lc.drawImage(canvas, 0, 0);
    const rightC = document.createElement('canvas');
    rightC.width = canvas.width - cut; rightC.height = canvas.height;
    rightC.getContext('2d').drawImage(canvas, -cut, 0);
    return [left, rightC];
  }
  /* Curved-page correction: gentle strip remap. strength 0..100.
     Unbends the horizontal squeeze near the spine and the vertical bow. */
  function dewarp(canvas, strength) {
    const s = strength / 100;
    if (s <= 0) return clone(canvas);
    const W = canvas.width, H = canvas.height;
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const STRIPS = 96;
    for (let i = 0; i < STRIPS; i++) {
      const u0 = i / STRIPS, u1 = (i + 1) / STRIPS;
      const f = u => u + s * 0.16 * Math.sin(Math.PI * u) * (u - 0.5) * 2;
      const sx0 = f(u0) * W, sx1 = f(u1) * W;
      const bow = -s * H * 0.045 * Math.sin(Math.PI * (u0 + u1) / 2);
      ctx.drawImage(canvas, sx0, 0, Math.max(1, sx1 - sx0), H, u0 * W, bow, W / STRIPS + 1, H);
    }
    return out;
  }
  function rotate(canvas, deg) {
    const rad = deg * Math.PI / 180;
    const swap = Math.abs(deg % 180) === 90;
    const out = document.createElement('canvas');
    out.width = swap ? canvas.height : canvas.width;
    out.height = swap ? canvas.width : canvas.height;
    const ctx = out.getContext('2d');
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }
  function otsu(data, n) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < n; i++) hist[data[i]]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = i; }
    }
    return thr;
  }
  /* filter: 'color' | 'gray' | 'bw' ; adjust: {contrast:-50..50, bright:-50..50, sharpen:bool} */
  function applyFilter(canvas, filter, adjust = {}) {
    const out = clone(canvas);
    const ctx = out.getContext('2d');
    const img = ctx.getImageData(0, 0, out.width, out.height);
    const d = img.data, n = out.width * out.height;
    const gray = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      gray[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    }
    let thr = 0;
    if (filter === 'bw') thr = otsu(gray, n);
    const cf = 1 + (adjust.contrast || 0) / 100 * 0.8;
    const bf = (adjust.bright || 0) * 1.6;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      if (filter === 'bw') {
        const v = gray[i] > thr ? 255 : 0;
        d[j] = d[j + 1] = d[j + 2] = v;
      } else if (filter === 'gray') {
        const v = Math.max(0, Math.min(255, (gray[i] - 128) * cf + 128 + bf));
        d[j] = d[j + 1] = d[j + 2] = v;
      } else {
        for (let ch = 0; ch < 3; ch++) d[j + ch] = Math.max(0, Math.min(255, (d[j + ch] - 128) * cf + 128 + bf));
      }
    }
    ctx.putImageData(img, 0, 0);
    if (adjust.sharpen) sharpen(out);
    return out;
  }
  function sharpen(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const src = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const s = src.data, o = out.data, k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { for (let ch = 0; ch < 4; ch++) o[di + ch] = s[di + ch]; continue; }
      for (let ch = 0; ch < 3; ch++) {
        let v = 0, ki = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += s[((y + dy) * w + (x + dx)) * 4 + ch] * k[ki++];
        o[di + ch] = v;
      }
      o[di + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }
  /* Quality checks on a downscaled copy. */
  function quality(canvas) {
    const w = 256, h = Math.max(2, Math.round(canvas.height * 256 / canvas.width));
    const c = toCanvas(canvas, w, h);
    const d = c.getContext('2d').getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let glare = 0;
    for (let i = 0; i < w * h; i++) {
      const j = i * 4;
      g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
      if (g[i] > 248 && d[j] > 248 && d[j + 1] > 248) glare++;
    }
    let lapSum = 0, lapSq = 0, cnt = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      lapSum += lap; lapSq += lap * lap; cnt++;
    }
    const mean = lapSum / cnt;
    const blurVar = lapSq / cnt - mean * mean;
    return { blurry: blurVar < 55, blurScore: Math.round(blurVar), glare: glare / (w * h) > 0.02, glarePct: +(100 * glare / (w * h)).toFixed(1) };
  }
  return { loadBitmap, toCanvas, fitSize, blobToCanvas, canvasToBlob, clone, warpPerspective, splitSpread, dewarp, rotate, applyFilter, quality, MAXDIM };
})();
