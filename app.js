/* SpineLeaf — app shell: Library, Scan, Reader. Original code. */
'use strict';
const $view = document.getElementById('view');
const $toast = document.getElementById('toast');
let objectUrls = [];
function urlFor(blob) { const u = URL.createObjectURL(blob); objectUrls.push(u); return u; }
function clearUrls() { objectUrls.forEach(u => URL.revokeObjectURL(u)); objectUrls = []; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, ms = 2600) { $toast.textContent = msg; $toast.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => $toast.classList.remove('show'), ms); }
const progressEl = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
let progressCancelFn = null;
document.getElementById('progressCancel').addEventListener('click', () => { if (progressCancelFn) progressCancelFn(); hideProgress(); });
function showProgress(label, frac) {
  progressEl.hidden = false;
  progressLabel.textContent = label;
  progressBar.value = Math.round((frac || 0) * 100);
}
function hideProgress() { progressEl.hidden = true; progressCancelFn = null; }
function download(blob, filename) {
  const a = document.createElement('a');
  a.href = urlFor(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
function fmtBytes(n) { if (!n) return '0 MB'; return (n / 1048576).toFixed(1) + ' MB'; }

const state = {
  tab: 'library',
  bookId: null,
  readerPage: 0,
  readerMode: 'clean',
  cleanSize: 19,
  cleanTheme: 'paper',
  currentSent: 0,
  searchQuery: ''
};

/* ---------------- theme ---------------- */
const themeSelect = document.getElementById('themeSelect');
function applyTheme(t) {
  if (t === 'light') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('sl-theme', t);
  themeSelect.value = t;
}
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
applyTheme(localStorage.getItem('sl-theme') || 'light');

/* ---------------- tabs ---------------- */
const tabs = { library: document.getElementById('tabLibrary'), scan: document.getElementById('tabScan'), reader: document.getElementById('tabReader') };
function go(tab) {
  state.tab = tab;
  for (const k in tabs) { tabs[k].classList.toggle('active', k === tab); tabs[k].setAttribute('aria-selected', k === tab ? 'true' : 'false'); }
  clearUrls();
  if (tab === 'library') renderLibrary();
  else if (tab === 'scan') renderScan();
  else renderReader();
}
tabs.library.addEventListener('click', () => go('library'));
tabs.scan.addEventListener('click', () => go('scan'));
tabs.reader.addEventListener('click', () => go('reader'));

/* ---------------- Library ---------------- */
async function renderLibrary() {
  const books = await SLDB.listBooks();
  const est = await SLDB.storageEstimate();
  let html = `<h1>Your library</h1>
  <p class="lede">Books you scan or import live only on this device. No account, no uploads.</p>
  <div class="row">
    <button class="btn" id="newBook">＋ New book</button>
    <button class="btn ghost" id="impImgBook">Import images</button>
    <button class="btn ghost" id="impPdfBook">Import PDF</button>
    <button class="btn ghost" id="backupBtn">Backup</button>
    <button class="btn ghost" id="restoreBtn">Restore</button>
  </div>
  <div class="searchbar"><input type="search" id="libSearch" placeholder="Search titles, tags, and inside every book…" value="${esc(state.searchQuery)}" aria-label="Search library">
  <button class="btn small" id="libSearchBtn">Search</button></div>
  <div id="searchResults"></div>
  <p class="meta">Storage used by this device for SpineLeaf: ~${fmtBytes(est.usage)}${est.quota ? ' of ' + fmtBytes(est.quota) : ''}</p>`;
  if (!books.length) html += `<p>No books yet. Tap <b>Scan</b> to photograph your first chapter, or import a PDF.</p>`;
  html += `<div class="grid">`;
  for (const b of books) {
    let cover = '';
    if (b.pageIds.length) {
      const p = await SLDB.getPage(b.pageIds[0]);
      if (p && p.blob) cover = `<img alt="" src="${urlFor(p.blob)}">`;
    }
    if (!cover) cover = `<img alt="" src="icon.svg">`;
    html += `<article class="book-card">
      ${cover}
      <h3>${b.favorite ? '<span class="fav">★</span> ' : ''}${esc(b.title)}</h3>
      <p class="meta">${b.pageIds.length} page${b.pageIds.length === 1 ? '' : 's'} · ${new Date(b.updatedAt).toLocaleDateString()}</p>
      ${b.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}
      <div class="row" style="margin-top:8px">
        <button class="btn small" data-open="${b.id}">Open</button>
        <button class="btn small ghost" data-read="${b.id}">Read</button>
      </div>
    </article>`;
  }
  html += `</div>`;
  $view.innerHTML = html;
  document.getElementById('newBook').addEventListener('click', async () => {
    const title = prompt('Book title:', 'Untitled book');
    if (title === null) return;
    const b = await SLDB.createBook(title.trim() || 'Untitled book');
    openBook(b.id);
  });
  document.getElementById('impImgBook').addEventListener('click', () => pickImages(null));
  document.getElementById('impPdfBook').addEventListener('click', () => pickPdf(null));
  document.getElementById('backupBtn').addEventListener('click', backupAll);
  document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('restoreInput').click());
  const runSearch = async () => {
    state.searchQuery = document.getElementById('libSearch').value;
    await renderSearchResults(books);
  };
  document.getElementById('libSearchBtn').addEventListener('click', runSearch);
  document.getElementById('libSearch').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
  if (state.searchQuery) renderSearchResults(books);
  $view.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => openBook(btn.dataset.open)));
  $view.querySelectorAll('[data-read]').forEach(btn => btn.addEventListener('click', async () => {
    state.bookId = btn.dataset.read;
    const b = await SLDB.getBook(state.bookId);
    state.readerPage = Math.min(b.readPos.page || 0, Math.max(0, b.pageIds.length - 1));
    go('reader');
  }));
}

async function renderSearchResults(books) {
  const box = document.getElementById('searchResults');
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const hits = [];
  for (const b of books) {
    if (b.title.toLowerCase().includes(q) || b.tags.some(t => t.toLowerCase().includes(q))) {
      hits.push({ book: b, page: -1, snippet: 'Title or tag match' });
      continue;
    }
    const pages = await SLDB.getPages(b);
    for (let i = 0; i < pages.length; i++) {
      const t = pages[i].text || '';
      const idx = t.toLowerCase().indexOf(q);
      if (idx >= 0) {
        const snip = t.slice(Math.max(0, idx - 40), idx + q.length + 60).replace(/\s+/g, ' ');
        hits.push({ book: b, page: i, snippet: snip, qAt: idx });
        break;
      }
    }
  }
  if (!hits.length) { box.innerHTML = `<p class="meta">No matches for “${esc(state.searchQuery)}”. Pages need OCR (or embedded PDF text) before their words can be searched.</p>`; return; }
  box.innerHTML = `<h2>Results</h2>` + hits.map((h, i) => {
    let snip = esc(h.snippet);
    if (h.qAt !== undefined) {
      const qEsc = esc(state.searchQuery);
      snip = snip.replace(new RegExp(qEsc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), m => `<b>${m}</b>`);
    }
    return `<p><button class="btn small ghost" data-hit="${i}">📖 ${esc(h.book.title)}${h.page >= 0 ? ' — page ' + (h.page + 1) : ''}</button><br><span class="snippet">${snip}</span></p>`;
  }).join('');
  box.querySelectorAll('[data-hit]').forEach(btn => btn.addEventListener('click', () => {
    const h = hits[+btn.dataset.hit];
    state.bookId = h.book.id;
    state.readerPage = Math.max(0, h.page);
    state.readerMode = 'clean';
    go('reader');
  }));
}

/* ---------------- Book view ---------------- */
async function openBook(id) {
  state.bookId = id;
  clearUrls();
  const book = await SLDB.getBook(id);
  if (!book) { go('library'); return; }
  const pages = await SLDB.getPages(book);
  let html = `<div class="row between"><h1>${book.favorite ? '★ ' : ''}${esc(book.title)}</h1>
  <button class="btn small ghost" id="backLib">← Library</button></div>
  <div class="row">
    <button class="btn" id="bScan">📷 Scan pages</button>
    <button class="btn ghost" id="bRead">📖 Read</button>
    <button class="btn ghost" id="bOcrAll">🔤 OCR all pages</button>
    <button class="btn ghost" id="bImg">Add images</button>
    <button class="btn ghost" id="bPdf">Add PDF</button>
  </div>
  <div class="row" style="margin-top:10px">
    <button class="btn small" id="expSearch">Export searchable PDF</button>
    <button class="btn small ghost" id="expImage">Export image PDF</button>
    <button class="btn small ghost" id="expTxt">Export text (.txt)</button>
  </div>
  <div class="field"><label for="bookTitle">Title</label><input type="text" id="bookTitle" value="${esc(book.title)}"></div>
  <div class="field"><label for="bookTags">Tags <span class="hint">(comma separated)</span></label><input type="text" id="bookTags" value="${esc(book.tags.join(', '))}"></div>
  <div class="row">
    <button class="btn small" id="saveMeta">Save title & tags</button>
    <button class="btn small ghost" id="favBtn">${book.favorite ? '★ Favorited' : '☆ Favorite'}</button>
    <button class="btn small warn" id="delBook">Delete book</button>
  </div>
  <h2>Pages (${pages.length})</h2>`;
  if (!pages.length) html += `<p class="meta">No pages yet — scan or import some.</p>`;
  html += `<div class="grid">`;
  pages.forEach((p, i) => {
    html += `<article class="page-card">
      <img alt="Page ${i + 1}" src="${p.blob ? urlFor(p.blob) : 'icon.svg'}">
      <p class="meta">Page ${i + 1} · ${p.ocrDone ? 'text ready ✓' : (p.srcText ? 'PDF text ✓' : 'no text yet')}</p>
      <div class="row">
        <button class="btn small" data-pread="${i}">Read</button>
        <button class="btn small ghost" data-pocr="${p.id}">${p.ocrDone ? 'Re-OCR' : 'OCR'}</button>
        <button class="btn small ghost" data-ptext="${p.id}">Text</button>
      </div>
      <div class="row" style="margin-top:6px">
        <button class="btn small ghost" data-pup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move page up">↑</button>
        <button class="btn small ghost" data-pdown="${i}" ${i === pages.length - 1 ? 'disabled' : ''} aria-label="Move page down">↓</button>
        <button class="btn small ghost" data-prot="${p.id}">Rotate</button>
        <button class="btn small ghost" data-pdup="${p.id}">Copy</button>
        <button class="btn small ghost" data-pimg="${p.id}">Save img</button>
        <button class="btn small warn" data-pdel="${p.id}">Delete</button>
      </div>
      ${p.origBlob ? `<button class="btn small ghost" data-porig="${p.id}" style="margin-top:6px">View original photo</button>` : ''}
    </article>`;
  });
  html += `</div>`;
  $view.innerHTML = html;
  const B = id => document.getElementById(id);
  B('backLib').addEventListener('click', () => go('library'));
  B('bScan').addEventListener('click', () => go('scan'));
  B('bRead').addEventListener('click', () => { state.readerPage = Math.min(book.readPos.page || 0, Math.max(0, pages.length - 1)); go('reader'); });
  B('bImg').addEventListener('click', () => pickImages(book.id));
  B('bPdf').addEventListener('click', () => pickPdf(book.id));
  B('bOcrAll').addEventListener('click', () => ocrAllPages(book.id));
  B('expSearch').addEventListener('click', () => exportPdf(book.id, true));
  B('expImage').addEventListener('click', () => exportPdf(book.id, false));
  B('expTxt').addEventListener('click', () => exportTxt(book.id));
  B('saveMeta').addEventListener('click', async () => {
    book.title = B('bookTitle').value.trim() || book.title;
    book.tags = B('bookTags').value.split(',').map(s => s.trim()).filter(Boolean);
    await SLDB.saveBook(book); toast('Saved'); openBook(book.id);
  });
  B('favBtn').addEventListener('click', async () => { book.favorite = !book.favorite; await SLDB.saveBook(book); openBook(book.id); });
  B('delBook').addEventListener('click', async () => {
    if (!confirm(`Delete “${book.title}” and its ${pages.length} pages? It goes to trash in the database (recoverable only by restore from backup).`)) return;
    await SLDB.deleteBook(book.id); toast('Book deleted'); go('library');
  });
  $view.querySelectorAll('[data-pread]').forEach(b => b.addEventListener('click', () => { state.readerPage = +b.dataset.pread; go('reader'); }));
  $view.querySelectorAll('[data-pocr]').forEach(b => b.addEventListener('click', () => ocrOnePage(b.dataset.pocr, true)));
  $view.querySelectorAll('[data-ptext]').forEach(b => b.addEventListener('click', () => editPageText(b.dataset.ptext)));
  $view.querySelectorAll('[data-pup]').forEach(b => b.addEventListener('click', () => movePage(book, +b.dataset.pup, -1)));
  $view.querySelectorAll('[data-pdown]').forEach(b => b.addEventListener('click', () => movePage(book, +b.dataset.pdown, 1)));
  $view.querySelectorAll('[data-prot]').forEach(b => b.addEventListener('click', async () => {
    const p = await SLDB.getPage(b.dataset.prot);
    const c = await SLImg.blobToCanvas(p.blob);
    p.blob = await SLImg.canvasToBlob(SLImg.rotate(c, 90));
    p.words = null; p.ocrDone = false;
    await SLDB.savePage(p); openBook(book.id);
  }));
  $view.querySelectorAll('[data-pdup]').forEach(b => b.addEventListener('click', async () => {
    const p = await SLDB.getPage(b.dataset.pdup);
    const copy = await SLDB.addPage(book.id, { blob: p.blob, origBlob: p.origBlob, text: p.text, words: p.words, ocrDone: p.ocrDone, srcText: p.srcText });
    const bk = await SLDB.getBook(book.id);
    bk.pageIds = bk.pageIds.filter(x => x !== copy.id);
    bk.pageIds.splice(bk.pageIds.indexOf(p.id) + 1, 0, copy.id);
    await SLDB.saveBook(bk); openBook(book.id);
  }));
  $view.querySelectorAll('[data-pimg]').forEach(b => b.addEventListener('click', async () => {
    const p = await SLDB.getPage(b.dataset.pimg);
    download(p.blob, `${book.title.replace(/[^\w]+/g, '_')}-page.jpg`);
  }));
  $view.querySelectorAll('[data-pdel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this page?')) return;
    await SLDB.deletePage(book.id, b.dataset.pdel); openBook(book.id);
  }));
  $view.querySelectorAll('[data-porig]').forEach(b => b.addEventListener('click', async () => {
    const p = await SLDB.getPage(b.dataset.porig);
    window.open(urlFor(p.origBlob), '_blank');
  }));
}
async function movePage(book, idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= book.pageIds.length) return;
  [book.pageIds[idx], book.pageIds[j]] = [book.pageIds[j], book.pageIds[idx]];
  await SLDB.saveBook(book); openBook(book.id);
}
async function editPageText(pageId) {
  const p = await SLDB.getPage(pageId);
  const t = prompt('Page text (edit OCR mistakes here):', p.text || '');
  if (t === null) return;
  p.text = t; p.ocrDone = true;
  await SLDB.savePage(p);
  toast('Text saved');
  if (state.bookId) openBook(state.bookId);
}

/* ---------------- Scan ---------------- */
let camStream = null;
let scanState = null;
function stopCamera() { if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } }

async function renderScan() {
  stopCamera();
  const books = await SLDB.listBooks();
  if (!state.bookId && books.length) state.bookId = books[0].id;
  $view.innerHTML = `<h1>Scan</h1>
  <p class="lede">Photograph a page or a two-page spread. Everything is processed on this device.</p>
  <div class="field"><label for="scanBook">Add pages to</label>
    <select id="scanBook">${books.map(b => `<option value="${b.id}" ${b.id === state.bookId ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></div>
  <div class="row"><button class="btn small" id="scanNewBook">＋ New book</button>
  <button class="btn small ghost" id="scanImportImg">Import images instead</button>
  <button class="btn small ghost" id="scanImportPdf">Import PDF instead</button></div>
  <div class="field"><label>Mode</label>
    <div class="row" role="radiogroup" aria-label="Scan mode">
      <label><input type="radio" name="scanMode" value="spread" checked> 📖 Book spread (2 pages)</label>
      <label><input type="radio" name="scanMode" value="single"> 📄 Single page / document</label>
    </div></div>
  <div id="camArea">
    <div class="cam-wrap">
      <video id="camVideo" playsinline muted aria-label="Camera preview"></video>
      <svg id="camOverlay" class="cam-overlay" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
        <polygon id="camQuad" points="" fill="rgba(14,124,134,.14)" stroke="#2bb3bf" stroke-width="0.7"/>
      </svg>
    </div>
    <p class="row between"><span id="stableNote" class="stable">Camera off</span>
    <label><input type="checkbox" id="autoCap"> Auto-capture when steady</label></p>
    <p id="camQuality" class="meta"></p>
    <button class="shutter" id="shutterBtn" aria-label="Take photo"></button>
    <div class="row">
      <button class="btn" id="camStart">Start camera</button>
      <button class="btn ghost" id="camStop" disabled>Stop camera</button>
    </div>
    <p class="kbd-hint">Fit the page inside the teal outline. For a book spread, the middle line is the spine — you can fine-tune corners and the gutter after the shot. If the camera is unavailable, use Import instead.</p>
  </div>
  <div id="editorArea"></div>`;
  scanState = { rawCanvas: null, corners: null, mode: 'spread', stableCount: 0, lastDiff: 0, lastFrame: null, autoCooldown: 0, raf: 0 };
  const video = document.getElementById('camVideo');
  const sel = document.getElementById('scanBook');
  sel.addEventListener('change', () => { state.bookId = sel.value; });
  document.getElementById('scanNewBook').addEventListener('click', async () => {
    const title = prompt('Book title:', 'Untitled book'); if (title === null) return;
    const b = await SLDB.createBook(title.trim() || 'Untitled book');
    state.bookId = b.id; renderScan();
  });
  document.getElementById('scanImportImg').addEventListener('click', () => pickImages(state.bookId));
  document.getElementById('scanImportPdf').addEventListener('click', () => pickPdf(state.bookId));
  $view.querySelectorAll('input[name="scanMode"]').forEach(r => r.addEventListener('change', () => { scanState.mode = r.value; drawCamQuad(); }));
  document.getElementById('camStart').addEventListener('click', startCamera);
  document.getElementById('camStop').addEventListener('click', () => { stopCamera(); document.getElementById('stableNote').textContent = 'Camera off'; document.getElementById('camStart').disabled = false; document.getElementById('camStop').disabled = true; });
  document.getElementById('shutterBtn').addEventListener('click', capturePhoto);
  drawCamQuad();

  function drawCamQuad() {
    const q = document.getElementById('camQuad');
    if (!q) return;
    if (scanState.mode === 'spread') q.setAttribute('points', '4,6 96,6 96,94 4,94');
    else q.setAttribute('points', '18,4 82,4 82,96 18,96');
  }
  async function startCamera() {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
    } catch (e) {
      toast('Camera unavailable: ' + e.message + ' — try Import instead.', 4200);
      return;
    }
    video.srcObject = camStream;
    await video.play().catch(() => {});
    document.getElementById('camStart').disabled = true;
    document.getElementById('camStop').disabled = false;
    stabilityLoop();
  }
  function stabilityLoop() {
    if (!camStream) return;
    const small = document.createElement('canvas'); small.width = 64; small.height = 48;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (!camStream || state.tab !== 'scan') return;
      if (video.readyState >= 2 && video.videoWidth) {
        sctx.drawImage(video, 0, 0, 64, 48);
        const d = sctx.getImageData(0, 0, 64, 48).data;
        if (scanState.lastFrame) {
          let diff = 0;
          for (let i = 0; i < d.length; i += 16) diff += Math.abs(d[i] - scanState.lastFrame[i]);
          diff /= (d.length / 16);
          scanState.lastDiff = diff;
          const note = document.getElementById('stableNote');
          if (note) {
            if (diff < 2.2) { scanState.stableCount++; note.textContent = '● Steady — ready'; note.className = 'stable ok'; }
            else { scanState.stableCount = 0; note.textContent = '● Hold steady…'; note.className = 'stable'; }
          }
          const auto = document.getElementById('autoCap');
          if (auto && auto.checked && scanState.stableCount >= 3 && Date.now() > scanState.autoCooldown) {
            scanState.autoCooldown = Date.now() + 4000;
            capturePhoto();
          }
        }
        scanState.lastFrame = d;
      }
      scanState.raf = setTimeout(tick, 300);
    };
    tick();
  }
  function capturePhoto() {
    if (!camStream || !video.videoWidth) { toast('Start the camera first.'); return; }
    if (!state.bookId) { toast('Choose or create a book first.'); return; }
    const [w, h] = SLImg.fitSize(video.videoWidth, video.videoHeight);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(video, 0, 0, w, h);
    scanState.rawCanvas = c;
    const inset = scanState.mode === 'spread' ? 0.05 : 0.16;
    scanState.corners = [[w * inset, h * 0.06], [w * (1 - inset), h * 0.06], [w * (1 - inset), h * 0.94], [w * inset, h * 0.94]];
    openEditor();
  }
}

function openEditor() {
  const area = document.getElementById('editorArea');
  const raw = scanState.rawCanvas;
  const q = SLImg.quality(raw);
  const spread = scanState.mode === 'spread';
  area.innerHTML = `<h2>Adjust this ${spread ? 'spread' : 'page'}</h2>
  <p>${q.blurry ? '<span class="warn-text">⚠ Looks blurry — hold steady and retake if text is soft.</span>' : '<span class="ok-text">Sharpness looks OK.</span>'}
  ${q.glare ? ` <span class="warn-text">⚠ Glare on ~${q.glarePct}% of the page — tilt the book to move the reflection.</span>` : ''}</p>
  <canvas id="editCanvas" class="editor-canvas" aria-label="Captured page. Drag the corner handles to match the page edges."></canvas>
  <p class="kbd-hint">Drag the four teal handles onto the page corners.</p>
  <div class="field" id="gutterField" ${spread ? '' : 'hidden'}><label for="gutterRange">Spine (gutter) position <span class="hint">where the two pages meet</span></label>
    <input type="range" id="gutterRange" min="25" max="75" value="50"></div>
  <div class="field"><label for="dewarpRange">Curve correction <span class="hint">unbends print that curves into the spine</span></label>
    <input type="range" id="dewarpRange" min="0" max="100" value="35"></div>
  <div class="field"><label for="filterSel">Finish</label>
    <select id="filterSel"><option value="color">Colour</option><option value="gray" selected>Greyscale (clean)</option><option value="bw">Black &amp; white (smallest files)</option></select></div>
  <div class="row">
    <label>Contrast <input type="range" id="contrastRange" min="-50" max="50" value="10" style="width:110px"></label>
    <label>Brightness <input type="range" id="brightRange" min="-50" max="50" value="0" style="width:110px"></label>
    <label><input type="checkbox" id="sharpenChk" checked> Sharpen</label>
  </div>
  <div class="row" style="margin-top:12px">
    <button class="btn" id="usePage">✓ Use ${spread ? 'these pages' : 'this page'}</button>
    <button class="btn ghost" id="retakeBtn">↩ Retake</button>
    <button class="btn ghost" id="rotateRaw">Rotate 90°</button>
  </div>`;
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const ec = document.getElementById('editCanvas');
  const dispW = Math.min(raw.width, area.clientWidth - 4 || raw.width);
  const scale = dispW / raw.width;
  ec.width = Math.round(raw.width * scale); ec.height = Math.round(raw.height * scale);
  const draw = () => {
    const ctx = ec.getContext('2d');
    ctx.drawImage(raw, 0, 0, ec.width, ec.height);
    const cs = scanState.corners;
    ctx.strokeStyle = '#2bb3bf'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    cs.forEach((p, i) => { const x = p[0] * scale, y = p[1] * scale; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
    if (spread) {
      const g = (+document.getElementById('gutterRange').value) / 100;
      const tl = cs[0], tr = cs[1], br = cs[2], bl = cs[3];
      const topX = (tl[0] + (tr[0] - tl[0]) * g) * scale, botX = (bl[0] + (br[0] - bl[0]) * g) * scale;
      ctx.strokeStyle = '#e9a13b'; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(topX, tl[1] * scale); ctx.lineTo(botX, bl[1] * scale); ctx.stroke(); ctx.setLineDash([]);
    }
    cs.forEach(p => {
      ctx.fillStyle = '#0e7c86';
      ctx.beginPath(); ctx.arc(p[0] * scale, p[1] * scale, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0] * scale, p[1] * scale, 5, 0, Math.PI * 2); ctx.fill();
    });
  };
  draw();
  scanState._drawEditor = draw;
  let dragIdx = -1;
  const toCanvasCoords = e => {
    const r = ec.getBoundingClientRect();
    return [ (e.clientX - r.left) * (raw.width / r.width), (e.clientY - r.top) * (raw.height / r.height) ];
  };
  ec.addEventListener('pointerdown', e => {
    const [x, y] = toCanvasCoords(e);
    let best = 1e9;
    scanState.corners.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < best) { best = d; dragIdx = i; } });
    if (best > raw.width * 0.14) dragIdx = -1;
    if (dragIdx >= 0) { ec.setPointerCapture(e.pointerId); }
  });
  ec.addEventListener('pointermove', e => {
    if (dragIdx < 0) return;
    const [x, y] = toCanvasCoords(e);
    scanState.corners[dragIdx] = [Math.max(0, Math.min(raw.width, x)), Math.max(0, Math.min(raw.height, y))];
    draw();
  });
  ec.addEventListener('pointerup', () => { dragIdx = -1; });
  document.getElementById('gutterRange').addEventListener('input', draw);
  document.getElementById('retakeBtn').addEventListener('click', () => { area.innerHTML = ''; scanState.rawCanvas = null; });
  document.getElementById('rotateRaw').addEventListener('click', () => {
    scanState.rawCanvas = SLImg.rotate(scanState.rawCanvas, 90);
    const w = scanState.rawCanvas.width, h = scanState.rawCanvas.height;
    const inset = spread ? 0.05 : 0.16;
    scanState.corners = [[w * inset, h * 0.06], [w * (1 - inset), h * 0.06], [w * (1 - inset), h * 0.94], [w * inset, h * 0.94]];
    openEditor();
  });
  document.getElementById('usePage').addEventListener('click', useCapturedPage);
}

async function useCapturedPage() {
  const bookId = state.bookId;
  if (!bookId) { toast('Choose a book first.'); return; }
  showProgress('Straightening page…', 0.2);
  await new Promise(r => setTimeout(r, 60)); // let the progress paint
  try {
    const raw = scanState.rawCanvas;
    const origBlob = await SLImg.canvasToBlob(raw, 'image/jpeg', 0.88);
    let warped = SLImg.warpPerspective(raw, scanState.corners);
    const dewarpVal = +document.getElementById('dewarpRange').value;
    if (dewarpVal > 0) warped = SLImg.dewarp(warped, dewarpVal);
    const filter = document.getElementById('filterSel').value;
    const adj = { contrast: +document.getElementById('contrastRange').value, bright: +document.getElementById('brightRange').value, sharpen: document.getElementById('sharpenChk').checked };
    const spread = scanState.mode === 'spread';
    if (spread) {
      const g = (+document.getElementById('gutterRange').value) / 100;
      const [left, right] = SLImg.splitSpread(warped, g);
      const rtl = confirm('Two pages saved. OK = left page first (English style). Cancel = right page first (right-to-left books).');
      const ordered = rtl ? [left, right] : [right, left];
      for (const c of ordered) {
        const fin = SLImg.applyFilter(c, filter, adj);
        await SLDB.addPage(bookId, { blob: await SLImg.canvasToBlob(fin), origBlob });
      }
      toast('2 pages added ✓');
    } else {
      const fin = SLImg.applyFilter(warped, filter, adj);
      await SLDB.addPage(bookId, { blob: await SLImg.canvasToBlob(fin), origBlob });
      toast('Page added ✓');
    }
    hideProgress();
    document.getElementById('editorArea').innerHTML = '';
    scanState.rawCanvas = null;
    scanState.autoCooldown = Date.now() + 2500;
  } catch (e) {
    hideProgress();
    toast('Could not process that photo: ' + e.message, 4200);
  }
}

/* ---------------- Import ---------------- */
function pickImages(bookId) {
  const inp = document.getElementById('imgInput');
  inp.onchange = async () => {
    const files = [...inp.files]; inp.value = '';
    if (!files.length) return;
    let bid = bookId;
    if (!bid) { const b = await SLDB.createBook(files[0].name.replace(/\.[^.]+$/, '') || 'Imported images'); bid = b.id; }
    showProgress('Importing images…', 0);
    let i = 0;
    for (const f of files) {
      const canvas = await SLImg.blobToCanvas(f);
      await SLDB.addPage(bid, { blob: await SLImg.canvasToBlob(canvas), origBlob: f });
      showProgress(`Importing images… ${++i}/${files.length}`, i / files.length);
    }
    hideProgress();
    toast(`${files.length} image${files.length === 1 ? '' : 's'} imported ✓`);
    state.bookId = bid;
    openBook(bid);
  };
  inp.click();
}
function pickPdf(bookId) {
  const inp = document.getElementById('pdfInput');
  inp.onchange = async () => {
    const f = inp.files[0]; inp.value = '';
    if (!f) return;
    try { await importPdf(f, bookId); } catch (e) { hideProgress(); toast('PDF import failed: ' + e.message, 4500); }
  };
  inp.click();
}
async function importPdf(file, bookId) {
  showProgress('Opening PDF…', 0.02);
  const pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.mjs';
  const buf = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: buf }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      const pw = prompt('This PDF is password-protected. Enter its password (it is used once and never saved):');
      if (!pw) { hideProgress(); return; }
      pdf = await pdfjs.getDocument({ data: buf, password: pw }).promise;
    } else throw e;
  }
  let bid = bookId;
  if (!bid) { const b = await SLDB.createBook(file.name.replace(/\.pdf$/i, '') || 'Imported PDF'); bid = b.id; }
  const total = pdf.numPages;
  for (let n = 1; n <= total; n++) {
    showProgress(`Importing PDF page ${n} of ${total}…`, n / total);
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    let text = '';
    let lastY = null;
    const words = [];
    const vp1 = page.getViewport({ scale: 1 });
    for (const it of tc.items) {
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      text += it.str + ' ';
      lastY = y;
    }
    text = text.replace(/[ \t]+\n/g, '\n').trim();
    const hasText = text.replace(/\s/g, '').length >= 20;
    const scale = hasText ? 1.6 : 2.2;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    if (hasText) {
      for (const it of tc.items) {
        if (!it.str.trim()) continue;
        const x0 = it.transform[4] * scale;
        const y1 = (vp1.height - it.transform[5]) * scale;
        const hgt = (it.height || 10) * scale;
        words.push({ text: it.str, x0, y0: y1 - hgt, x1: x0 + (it.width || 10) * scale, y1, conf: 100 });
      }
    }
    await SLDB.addPage(bid, {
      blob: await SLImg.canvasToBlob(canvas), origBlob: null,
      text: hasText ? text : '', words: hasText ? words : null,
      ocrDone: hasText, srcText: hasText
    });
  }
  hideProgress();
  toast(`PDF imported — ${total} page${total === 1 ? '' : 's'} ✓`);
  state.bookId = bid;
  openBook(bid);
}

/* ---------------- OCR runners ---------------- */
async function ocrOnePage(pageId, refresh) {
  const p = await SLDB.getPage(pageId);
  if (!p) return;
  showProgress('Reading page text (on-device OCR)…', 0);
  progressCancelFn = () => SLOC.cancel();
  try {
    const canvas = await SLImg.blobToCanvas(p.blob);
    const res = await SLOC.recognize(canvas, f => showProgress('Reading page text (on-device OCR)…', f));
    p.text = res.text; p.words = res.words; p.ocrDone = true;
    await SLDB.savePage(p);
    hideProgress();
    toast(`OCR done — ${res.words.length} words found ✓`);
  } catch (e) {
    hideProgress();
    toast('OCR stopped: ' + e.message, 4000);
  }
  if (refresh && state.bookId) openBook(state.bookId);
}
async function ocrAllPages(bookId) {
  const book = await SLDB.getBook(bookId);
  const pages = await SLDB.getPages(book);
  const todo = pages.filter(p => !p.ocrDone);
  if (!todo.length) { toast('Every page already has text ✓'); return; }
  progressCancelFn = () => SLOC.cancel();
  let done = 0;
  for (const p of todo) {
    showProgress(`OCR page ${done + 1} of ${todo.length}…`, done / todo.length);
    try {
      const canvas = await SLImg.blobToCanvas(p.blob);
      const res = await SLOC.recognize(canvas, f => showProgress(`OCR page ${done + 1} of ${todo.length}…`, (done + f) / todo.length));
      p.text = res.text; p.words = res.words; p.ocrDone = true;
      await SLDB.savePage(p);
    } catch (e) { hideProgress(); toast('OCR stopped: ' + e.message, 4000); return; }
    done++;
  }
  hideProgress();
  toast(`OCR complete — ${done} page${done === 1 ? '' : 's'} ✓`);
  openBook(bookId);
}

/* ---------------- Reader ---------------- */
async function renderReader() {
  stopCamera();
  SLTTS.stop(false);
  const books = await SLDB.listBooks();
  if (!books.length) { $view.innerHTML = `<h1>Reader</h1><p>No books yet. Scan or import one from the Library tab.</p>`; return; }
  if (!state.bookId || !books.some(b => b.id === state.bookId)) state.bookId = books[0].id;
  const book = await SLDB.getBook(state.bookId);
  const pages = await SLDB.getPages(book);
  state.readerPage = Math.max(0, Math.min(state.readerPage, pages.length - 1));
  const page = pages[state.readerPage];
  const sentences = page ? SLSent.splitSentences(page.text || '') : [];
  const pageHasMl = page ? SLSent.ML_RE.test(page.text || '') : false;
  const mlVoiceMissing = pageHasMl && !SLTTS.hasMalayalamVoice();
  const highlights = new Set((book.highlights || []).filter(h => h.page === state.readerPage).map(h => h.sent));

  let body = '';
  if (!page) body = `<p class="meta">This book has no pages yet.</p>`;
  else if (state.readerMode === 'page') {
    body = `<img class="reader-img" alt="Scanned page ${state.readerPage + 1}" src="${urlFor(page.blob)}">
    ${!page.ocrDone ? `<div class="row" style="margin-top:10px"><button class="btn" id="rOcr">🔤 Run OCR on this page</button><span class="meta">Needed for search and Clean text view.</span></div>` : `<p class="meta">Text is ready — switch to Clean text to tap a sentence and hear it.</p>`}`;
  } else {
    if (!sentences.length) {
      body = `<p>This page has no text yet.</p><div class="row"><button class="btn" id="rOcr">🔤 Run OCR on this page</button><button class="btn ghost" id="rEditText">Type / paste text</button></div>`;
    } else {
      body = `<div class="clean-text ${state.cleanTheme === 'sepia' ? 'sepia' : ''}" id="cleanText" style="font-size:${state.cleanSize}px">
        ${sentences.map((s, i) => `<span class="sent ${highlights.has(i) ? 'hl' : ''}" data-sent="${i}" tabindex="0" role="button" aria-label="Sentence ${i + 1}. Activate to select it for reading.">${esc(s)}</span>`).join(' ')}
      </div>
      <p class="kbd-hint">Tap a sentence to select it, then “Read from here”. Double-tap a sentence to highlight it. Select any text with your finger, then use “Read selection”.</p>`;
    }
  }

  $view.innerHTML = `<div class="row between"><h1>📖 ${esc(book.title)}</h1>
  <button class="btn small ghost" id="rOpenBook">Book details</button></div>
  <div class="row">
    <label>Book <select id="rBookSel">${books.map(b => `<option value="${b.id}" ${b.id === book.id ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>
    <label>View <select id="rMode"><option value="clean" ${state.readerMode === 'clean' ? 'selected' : ''}>Clean text</option><option value="page" ${state.readerMode === 'page' ? 'selected' : ''}>Original page</option></select></label>
    ${state.readerMode === 'clean' ? `<label>Text size <input type="range" id="rSize" min="15" max="28" value="${state.cleanSize}" style="width:100px"></label>
    <label>Page theme <select id="rTheme"><option value="paper">Paper</option><option value="sepia" ${state.cleanTheme === 'sepia' ? 'selected' : ''}>Sepia</option></select></label>` : ''}
  </div>
  <div class="row between" style="margin:10px 0">
    <button class="btn small" id="rPrevPage" ${state.readerPage === 0 ? 'disabled' : ''}>← Page</button>
    <span class="meta">Page ${pages.length ? state.readerPage + 1 : 0} of ${pages.length}</span>
    <button class="btn small" id="rNextPage" ${state.readerPage >= pages.length - 1 ? 'disabled' : ''}>Page →</button>
  </div>
  ${body}
  ${mlVoiceMissing ? `<p class="warn-text">⚠ This page has Malayalam text but no Malayalam voice is installed on this device. English will still read aloud. To add one: Android — Settings → General management → Text-to-speech → install Malayalam voice data. iPhone — Settings → Accessibility → Spoken Content → Voices → Malayalam. SpineLeaf never sends your text to a cloud voice.</p>` : ''}
  ${!SLTTS.hasAnyVoice() ? `<p class="warn-text">⚠ No text-to-speech voices were found in this browser/device, so read-aloud is unavailable here.</p>` : ''}
  <div class="playbar" role="group" aria-label="Read aloud controls">
    <div class="row">
      <button class="btn small ghost" id="tPrev" aria-label="Previous sentence">⏮</button>
      <button class="btn small" id="tPlay">▶ Read page</button>
      <button class="btn small ghost" id="tStop" aria-label="Stop">⏹</button>
      <button class="btn small ghost" id="tNext" aria-label="Next sentence">⏭</button>
    </div>
    <div class="row" style="margin-top:6px">
      <button class="btn small ghost" id="tFromHere">Read from selected sentence</button>
      <button class="btn small ghost" id="tSelection">Read selection</button>
      <button class="btn small ghost" id="tContinue">Continue through book</button>
    </div>
    <div class="row" style="margin-top:6px">
      <label>Speed <select id="tRate"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
      <label>Voice <select id="tVoice"><option value="auto" selected>Auto (per sentence)</option><option value="en-IN">English</option><option value="ml-IN">Malayalam</option></select></label>
      <label>Sleep <select id="tSleep"><option value="0" selected>Off</option><option value="10">10 min</option><option value="20">20 min</option><option value="30">30 min</option></select></label>
      <span class="meta" id="tStatus"></span>
    </div>
  </div>`;

  const B = id => document.getElementById(id);
  B('rOpenBook').addEventListener('click', () => openBook(book.id));
  B('rBookSel').addEventListener('change', async e => {
    state.bookId = e.target.value;
    const nb = await SLDB.getBook(state.bookId);
    state.readerPage = Math.min(nb.readPos.page || 0, Math.max(0, nb.pageIds.length - 1));
    renderReader();
  });
  B('rMode').addEventListener('change', e => { state.readerMode = e.target.value; renderReader(); });
  if (B('rSize')) B('rSize').addEventListener('input', e => { state.cleanSize = +e.target.value; const ct = B('cleanText'); if (ct) ct.style.fontSize = state.cleanSize + 'px'; });
  if (B('rTheme')) B('rTheme').addEventListener('change', e => { state.cleanTheme = e.target.value; renderReader(); });
  const gotoPage = async n => {
    state.readerPage = n;
    book.readPos = { page: n, sent: 0 };
    await SLDB.saveBook(book);
    renderReader();
  };
  B('rPrevPage').addEventListener('click', () => gotoPage(state.readerPage - 1));
  B('rNextPage').addEventListener('click', () => gotoPage(state.readerPage + 1));
  if (B('rOcr')) B('rOcr').addEventListener('click', async () => { await ocrOnePage(page.id, false); renderReader(); });
  if (B('rEditText')) B('rEditText').addEventListener('click', async () => { await editPageText(page.id); renderReader(); });

  const spans = () => [...$view.querySelectorAll('.sent')];
  spans().forEach(sp => {
    sp.addEventListener('click', () => {
      state.currentSent = +sp.dataset.sent;
      spans().forEach(s => s.style.outline = '');
      sp.style.outline = '2px solid var(--teal)';
      B('tStatus').textContent = `Sentence ${state.currentSent + 1} selected`;
    });
    sp.addEventListener('dblclick', async () => {
      const idx = +sp.dataset.sent;
      book.highlights = book.highlights || [];
      const at = book.highlights.findIndex(h => h.page === state.readerPage && h.sent === idx);
      if (at >= 0) book.highlights.splice(at, 1); else book.highlights.push({ page: state.readerPage, sent: idx });
      await SLDB.saveBook(book);
      sp.classList.toggle('hl');
    });
  });

  const pageItems = fromSent => sentences.slice(fromSent).map((s, k) => ({ text: s, pageIdx: state.readerPage, sentIdx: fromSent + k }));
  const bookItems = async (fromPage, fromSent) => {
    const items = [];
    for (let pi = fromPage; pi < pages.length; pi++) {
      const ss = SLSent.splitSentences(pages[pi].text || '');
      ss.forEach((s, si) => { if (pi === fromPage && si < fromSent) return; items.push({ text: s, pageIdx: pi, sentIdx: si }); });
    }
    return items;
  };
  SLTTS.setOnEvent(async ev => {
    if (ev.type === 'sentence') {
      const it = ev.item;
      if (it.pageIdx !== state.readerPage) { state.readerPage = it.pageIdx; await renderReader(); }
      spans().forEach(s => s.classList.toggle('speaking', +s.dataset.sent === it.sentIdx));
      const cur = $view.querySelector(`.sent[data-sent="${it.sentIdx}"]`);
      if (cur) cur.scrollIntoView({ block: 'center', behavior: 'auto' });
      const st = B('tStatus'); if (st) st.textContent = `Reading page ${it.pageIdx + 1}, sentence ${it.sentIdx + 1}`;
      book.listenPos = { page: it.pageIdx, sent: it.sentIdx };
      SLDB.saveBook(book).catch(() => {});
      const pb = B('tPlay'); if (pb) pb.textContent = '⏸ Pause';
    } else if (ev.type === 'done') {
      const st = B('tStatus'); if (st) st.textContent = 'Finished reading.';
      const pb = B('tPlay'); if (pb) pb.textContent = '▶ Read page';
      spans().forEach(s => s.classList.remove('speaking'));
    } else if (ev.type === 'error') {
      toast(ev.message, 4500);
    } else if (ev.type === 'state') {
      const pb = B('tPlay'); if (pb) pb.textContent = ev.playing ? '⏸ Pause' : '▶ Read page';
    }
  });
  B('tPlay').addEventListener('click', () => {
    if (SLTTS.playing) { SLTTS.pause(); return; }
    if (SLTTS.queueLength && SLTTS.current()) { SLTTS.resume(); return; }
    if (!sentences.length) { toast('This page has no text yet — run OCR first.'); return; }
    SLTTS.load(pageItems(state.currentSent || 0));
    SLTTS.play();
  });
  B('tStop').addEventListener('click', () => { SLTTS.stop(); B('tStatus').textContent = 'Stopped.'; B('tPlay').textContent = '▶ Read page'; spans().forEach(s => s.classList.remove('speaking')); });
  B('tPrev').addEventListener('click', () => SLTTS.jump(-1));
  B('tNext').addEventListener('click', () => SLTTS.jump(1));
  B('tFromHere').addEventListener('click', () => {
    if (!sentences.length) { toast('No text on this page yet.'); return; }
    SLTTS.load(pageItems(state.currentSent || 0));
    SLTTS.play();
  });
  B('tSelection').addEventListener('click', () => {
    const sel = (window.getSelection && window.getSelection().toString()) || '';
    if (!sel.trim()) { toast('Select some text on the page first (long-press and drag), then tap Read selection.'); return; }
    const items = SLSent.splitSentences(sel).map((s, i) => ({ text: s, pageIdx: state.readerPage, sentIdx: i }));
    SLTTS.load(items);
    SLTTS.play();
  });
  B('tContinue').addEventListener('click', async () => {
    const items = await bookItems(state.readerPage, state.currentSent || 0);
    if (!items.length) { toast('No text found from here to the end. OCR the pages first.'); return; }
    SLTTS.load(items);
    SLTTS.play();
  });
  B('tRate').addEventListener('change', e => SLTTS.setRate(+e.target.value));
  B('tVoice').addEventListener('change', e => SLTTS.setVoicePref(e.target.value));
  B('tSleep').addEventListener('change', e => SLTTS.setSleep(+e.target.value));
}

/* ---------------- Exports ---------------- */
function groupLines(words) {
  const sorted = [...words].sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  const lines = [];
  for (const w of sorted) {
    const h = Math.max(6, w.y1 - w.y0);
    const line = lines[lines.length - 1];
    if (line && Math.abs(w.y0 - line.y0) <= h * 0.6) {
      line.words.push(w);
      line.y0 = Math.min(line.y0, w.y0); line.y1 = Math.max(line.y1, w.y1);
    } else lines.push({ words: [w], y0: w.y0, y1: w.y1 });
  }
  return lines.map(l => ({
    text: l.words.sort((a, b) => a.x0 - b.x0).map(w => w.text).join(' '),
    x0: Math.min(...l.words.map(w => w.x0)), y0: l.y0, y1: l.y1
  }));
}
async function exportPdf(bookId, searchable) {
  const book = await SLDB.getBook(bookId);
  const pages = await SLDB.getPages(book);
  if (!pages.length) { toast('Nothing to export yet.'); return; }
  showProgress('Building PDF…', 0);
  try {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    let mlFont = null;
    const getMlFont = async () => {
      if (!mlFont) {
        const buf = await (await fetch('vendor/fonts/NotoSansMalayalam-Regular.ttf')).arrayBuffer();
        mlFont = await doc.embedFont(buf, { subset: true });
      }
      return mlFont;
    };
    const DPI = 150, ptPerPxBase = 72 / DPI;
    for (let i = 0; i < pages.length; i++) {
      showProgress(`Building PDF… page ${i + 1} of ${pages.length}`, i / pages.length);
      const p = pages[i];
      const bmp = await SLImg.loadBitmap(p.blob);
      const W = bmp.width, H = bmp.height;
      bmp.close && bmp.close();
      const page = doc.addPage([W * ptPerPxBase, H * ptPerPxBase]);
      const jpg = await doc.embedJpg(await p.blob.arrayBuffer());
      page.drawImage(jpg, { x: 0, y: 0, width: W * ptPerPxBase, height: H * ptPerPxBase });
      if (searchable && p.text) {
        const drawLine = async (text, xPx, yBotPx, hPx) => {
          const isMl = SLSent.ML_RE.test(text);
          const font = isMl ? await getMlFont() : helv;
          try {
            page.drawText(text, {
              x: xPx * ptPerPxBase,
              y: (H - yBotPx) * ptPerPxBase + hPx * ptPerPxBase * 0.18,
              size: Math.max(4, hPx * ptPerPxBase * 0.92),
              font, color: rgb(0, 0, 0), opacity: 0
            });
          } catch (e) { /* characters outside the font are skipped; the scan image still shows them */ }
        };
        if (p.words && p.words.length) {
          for (const line of groupLines(p.words)) await drawLine(line.text, line.x0, line.y1, line.y1 - line.y0);
        } else {
          let y = 40;
          for (const rawLine of p.text.split('\n')) {
            const chunks = rawLine.match(/.{1,95}/g) || [];
            for (const ch of chunks) { await drawLine(ch, 30, y + 12, 12); y += 15; }
          }
        }
      }
    }
    const bytes = await doc.save();
    hideProgress();
    download(new Blob([bytes], { type: 'application/pdf' }), `${book.title.replace(/[^\w]+/g, '_')}${searchable ? '-searchable' : ''}.pdf`);
    toast('PDF exported ✓ — open it in any reader and try searching a word.');
  } catch (e) {
    hideProgress();
    toast('PDF export failed: ' + e.message, 4500);
  }
}
async function exportTxt(bookId) {
  const book = await SLDB.getBook(bookId);
  const pages = await SLDB.getPages(book);
  const out = pages.map((p, i) => `\n\n----- Page ${i + 1} -----\n\n${p.text || ''}`).join('');
  download(new Blob([book.title + out], { type: 'text/plain;charset=utf-8' }), `${book.title.replace(/[^\w]+/g, '_')}.txt`);
  toast('Text exported ✓');
}

/* ---------------- Backup / restore ---------------- */
function blobToDataUrl(blob) {
  return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}
async function backupAll() {
  showProgress('Preparing backup…', 0.1);
  try {
    const books = await SLDB._all('books');
    const pages = await SLDB._all('pages');
    const outPages = [];
    for (const p of pages) {
      outPages.push({ id: p.id, bookId: p.bookId, text: p.text, words: p.words, ocrDone: p.ocrDone, srcText: p.srcText,
        blob: p.blob ? await blobToDataUrl(p.blob) : null, origBlob: p.origBlob ? await blobToDataUrl(p.origBlob) : null });
    }
    const payload = { app: 'SpineLeaf', version: 1, exportedAt: new Date().toISOString(), books, pages: outPages };
    download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'spineleaf-backup.json');
    hideProgress();
    toast('Backup downloaded ✓ Keep it somewhere safe.');
  } catch (e) { hideProgress(); toast('Backup failed: ' + e.message, 4000); }
}
document.getElementById('restoreInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  showProgress('Restoring backup…', 0.2);
  try {
    const payload = JSON.parse(await f.text());
    if (payload.app !== 'SpineLeaf') throw new Error('That file is not a SpineLeaf backup.');
    for (const b of payload.books) await SLDB._put('books', b);
    for (const p of payload.pages) {
      await SLDB._put('pages', { id: p.id, bookId: p.bookId, text: p.text, words: p.words, ocrDone: p.ocrDone, srcText: p.srcText,
        blob: p.blob ? await (await fetch(p.blob)).blob() : null, origBlob: p.origBlob ? await (await fetch(p.origBlob)).blob() : null });
    }
    hideProgress();
    toast('Backup restored ✓');
    go('library');
  } catch (err) { hideProgress(); toast('Restore failed: ' + err.message, 4500); }
});

/* ---------------- init ---------------- */
go('library');
