# Changelog

## 1.0.0 — 2026-11-21
First release.
- Book-spread and single-page camera scanning with draggable corner correction,
  perspective warp, gutter split (left-to-right or right-to-left), curve
  correction slider, greyscale / black-and-white finishes, blur and glare warnings,
  stability detection and optional auto-capture.
- Image and PDF import (embedded PDF text is used when present; image-only PDFs
  can be OCR'd; password-protected PDFs prompt without saving the password).
- On-device OCR for printed English and Malayalam (Tesseract WASM, models bundled),
  with word positions and confidence; OCR text is editable.
- Library with folders-by-tags, favorites, full-text search with snippets,
  page reorder/duplicate/rotate/delete, backup and restore.
- Searchable PDF export with an aligned invisible text layer (English and
  Malayalam — Malayalam extraction verified in an independent reader, pdf.js),
  image-only PDF export, and plain-text export.
- Reader with Original page and Clean text views; tap a sentence to read exactly
  that sentence aloud; read page / read from here / continue through the book;
  speed, sleep timer, per-sentence language switching (English/Malayalam),
  synced sentence highlight, separate reading and listening positions.
- Paper-and-ink design with dark and high-contrast themes; fully offline;
  no accounts, ads, analytics, or uploads.
