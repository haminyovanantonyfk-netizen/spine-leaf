# Third-party notices

SpineLeaf's own code is original and licensed under the Apache License 2.0
(see `LICENSE`). The following redistributable components are bundled in
`vendor/` so the app works fully offline. No component phones home.

| Component | Version | License | Used for | SHA-256 (key file) |
|---|---|---|---|---|
| Tesseract.js | 5.1.1 | Apache-2.0 | OCR engine (browser/WASM wrapper) | tesseract.min.js `a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8` |
| Tesseract core (WASM, LSTM + SIMD-LSTM) | 5.x (tesseract.js-core) | Apache-2.0 | OCR compute | tesseract-core-simd-lstm.wasm `66b601224a0c4a8977bc9d92dd39841189f9ca22cc4122fcd7208cdb0961eeef` |
| Tesseract language data `eng` (tessdata_fast best_int) | 4.0.0 | Apache-2.0 | English OCR model | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` |
| Tesseract language data `mal` (tessdata_fast best_int) | 4.0.0 | Apache-2.0 | Malayalam OCR model | `a4a5b24474889dbbe9943bb3cb7b24819c1cd594f2f371340bba83c30fd81bf0` |
| pdf-lib | 1.17.1 | MIT | PDF creation / searchable export | pdf-lib.min.js `0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f` |
| @pdf-lib/fontkit | 1.1.1 | MIT | Embedding the Malayalam font into PDFs | fontkit.umd.min.js (see vendor/) |
| regenerator-runtime | 0.14.1 | MIT | Required runtime helper for fontkit | runtime.js (see vendor/) |
| pdf.js (pdfjs-dist) | 4.2.67 | Apache-2.0 | PDF import: text extraction + page rendering | pdf.min.mjs `c3caae2cf1fe9d6e25588d0d239d02454422778ed5897314981496a4656eab82` |
| Noto Sans Malayalam (Regular) | — | SIL Open Font License 1.1 | Malayalam text layer in exported PDFs | font file in `vendor/fonts/` |

License texts for the bundled libraries are in `vendor/LICENSE-*.txt`.
The underlying Tesseract OCR engine is Copyright the Tesseract contributors,
Apache-2.0. Language data provenance: github.com/tesseract-ocr/tessdata_fast.

## Models and voices
- OCR models are the stock `tessdata_fast` LSTM models above — no custom
  training, no user data involved.
- Read-aloud uses the operating system's own speech voices
  (Android TextToSpeech / iOS Spoken Content via the web speech API).
  No voice files are bundled and no text is sent to any speech cloud.

## Not used
No analytics, no advertising SDKs, no crash reporters, no cloud OCR,
no cloud speech, no accounts, no backend.
