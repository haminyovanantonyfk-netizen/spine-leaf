# SpineLeaf — free book scanner & reader 📖🍃

**Scan a curved book chapter, get one searchable PDF, tap any sentence and hear just that sentence read aloud.**

SpineLeaf is a free, open-source book scanner and document reader for Android,
iPhone, and the web. Every feature is free: no subscriptions, no scan limits,
no watermarks, no ads, no accounts, no analytics, no backend. All processing —
scanning, OCR, PDF export, read-aloud — happens **on your device**.

> **Name note:** "SpineLeaf" is a working name. An unrelated eBook reader with
> the same name exists on GitHub; this project is a scanner + reader and is
> not affiliated with it.

## Install

- **Web / iPhone (works today):** open the GitHub Pages site, then
  *Share → Add to Home Screen*. It installs as an app and works offline.
- **Android APK:** built by GitHub Actions from this repo
  (`.github/workflows` — copy `ci/build-apk.yml` there, run it, download the
  `SpineLeaf-APK` artifact). The same pipeline attaches the APK to GitHub
  Releases when a `v*` tag is pushed.
- **Signed iPhone IPA / App Store:** requires the owner's Apple Developer
  account and macOS signing — see **Release status & blockers** below. An
  unsigned iOS build workflow (`ci/build-ios.yml`) is included and clearly
  labeled; it is *not* an installable IPA.

## What it does

**Scanning**
- Book-spread mode (one shot → two pages, adjustable spine/gutter, LTR or RTL
  page order) and single-page/document mode
- Live preview with page outline, stability detection, optional auto-capture,
  big shutter, blur and glare warnings
- Draggable corner handles → true perspective correction; a separate
  **curve-correction** slider unbends print near the spine
- Colour / greyscale / black-and-white finishes, contrast, brightness, sharpen
- Originals are always kept; pages can be reordered, rotated, duplicated,
  deleted, and re-OCR'd

**Import** — images (single or batch) and PDFs. Embedded PDF text is used when
present; image-only PDFs can be OCR'd. Password-protected PDFs prompt for the
password, which is never stored.

**OCR** — on-device Tesseract (WASM) for printed **English and Malayalam**,
including mixed pages, with word positions and confidence. Text is editable.
Models are bundled in the repo (`vendor/tessdata`) — verified offline.

**Library** — full-text search with snippets and page jumps, tags, favorites,
recent ordering, per-book reading *and* listening positions, highlights,
backup/restore as a single file, and a storage readout.

**Export** — searchable PDF (scan image + aligned invisible text layer;
Malayalam text layers use an embedded subset of Noto Sans Malayalam),
image-only PDF, plain text, and per-page images, via the system share sheet /
download.

**Reader & read-aloud**
- *Original page* view and a reflowed *Clean text* view (size, sepia theme)
- Tap a sentence to select it; **Read selection** speaks exactly what you
  selected and stops; **Read from here**, **Read page**, and **Continue
  through the book**; previous/next sentence; synced sentence highlighting
  and follow-along scrolling
- Per-sentence language detection switches voices between English and
  Malayalam automatically; speed control and sleep timer; an honest
  "no Malayalam voice installed" state with instructions instead of a
  silent cloud fallback — speech text is never sent anywhere

## Architecture (and why not Flutter)

The brief asked to evaluate Flutter. It was evaluated and **not** chosen for
v1, for reliability reasons: there is no Flutter/Android toolchain or macOS in
the build environment, so a Flutter app could not have been compiled or
verified here at all, and iOS signing is blocked by the same missing Apple
account either way. SpineLeaf instead uses the stack that could be built *and
verified* end-to-end in this environment:

- A dependency-light web app (vanilla JS + Canvas + IndexedDB) with all heavy
  libraries vendored and pinned (`vendor/`, with hashes in
  `THIRD_PARTY_NOTICES.md`)
- **Capacitor** wrappers for Android/iOS from the same source, built by the
  included GitHub Actions workflows — the Android pipeline is the same one
  that already ships the author's other apps
- Native platform speech (Android TTS / iOS voices) reached through the
  device speech engine; Tesseract WASM for OCR; pdf.js for import; pdf-lib
  for export

Minimums: any modern Android (Chrome/WebView 100+) or iOS 16+ Safari for the
web app; the Capacitor APK targets current Android versions per the workflow.

## Honest limits of v1.0

- Curve correction is a geometric strip-remap controlled by the user, not an
  ML dewarping model (a UVDoc-style model is the top roadmap item, pending
  license/performance verification on phones).
- Page detection is a guided outline + manual corners, not automatic edge
  detection; finger removal and handwriting cleanup are *not* claimed —
  retake is recommended when a finger covers text.
- DOCX export, PDF/A, and password-protected export are not in v1.0.
- Searchable-PDF text alignment follows OCR word boxes; it is aligned per
  line, not per character.
- Read-aloud quality and Malayalam availability depend on voices installed
  on the device (the app tells you when one is missing).

## Test matrix (2026-11-21, build environment: Linux, Node 24)

**Verified**
- ✅ OCR English synthetic page (Tesseract WASM, vendored `eng` data):
  4/4 lines recognized exactly
- ✅ OCR Malayalam synthetic page (vendored `mal` data): 3/3 lines recognized
  exactly, correct grapheme clusters in output
- ✅ OCR mixed worker (`eng+mal`) on the Malayalam page: exact
- ✅ Searchable-PDF round trip: pdf-lib export with invisible text →
  text extracted and searched successfully by pdf.js (an independent reader
  engine)
- ✅ Malayalam PDF text layer: Noto Sans Malayalam subset embedded via
  fontkit → Malayalam extracted character-perfect by pdf.js
- ✅ All app JavaScript passes syntax checks; all files serve HTTP 200 locally

**Not verified (needs hardware/accounts this environment does not have)**
- ⏳ Physical-device camera quality, dewarp on a real curved book, and
  100-page memory behaviour (no POCO M7 Plus 5G or iPhone attached)
- ⏳ Android APK from CI for this repo (workflow included; runs after the
  owner copies `ci/build-apk.yml` into `.github/workflows/`)
- ⏳ VoiceOver/TalkBack pass and on-device Malayalam TTS voices
- ⏳ Airplane-mode run on a phone (the web build is fully offline by design:
  service worker caches the shell, OCR models, and fonts)

## Release status & blockers

| Output | Status |
|---|---|
| Source code (this repo) | ✅ Complete |
| Web app (GitHub Pages) | ✅ Ready — owner enables Pages (Settings → Pages → main / root) |
| Android APK | ⏳ CI workflow ready; produces a signed-with-debug-key installable APK artifact; a permanent release APK is attached automatically on a `v*` tag. A Play-ready AAB + upload key are the owner's to authorize |
| iPhone IPA (signed) | ⛔ **Blocked:** no macOS/Xcode and no Apple Developer account in this environment. Owner steps: enroll at developer.apple.com (Apple charges $99/yr — not purchased without the owner's authorization), then sign the included iOS project in Xcode or via CI with their certificates, and distribute via TestFlight/App Store |
| iOS unsigned build | ✅ Workflow included, clearly labeled *not installable* |

## Build it yourself

```bash
# Web (no build step)
python3 -m http.server 8765   # open http://localhost:8765

# Android APK / iOS project (Capacitor)
npm install
mkdir -p www && cp index.html styles.css manifest.webmanifest service-worker.js \
  icon.svg db.js imaging.js ocr.js reader.js app.js www/ && cp -r vendor www/
npx cap add android   # or: npx cap add ios  (iOS requires macOS/Xcode)
npx cap sync
# Android: open android/ in Android Studio → Build APK
# iOS: open ios/ in Xcode → set your team → Archive / TestFlight
```

## Data & privacy

See [PRIVACY.md](PRIVACY.md). Short version: everything stays on your device;
nothing is uploaded; delete the app's data and it's gone.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Third-party components and their
licenses/hashes: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
