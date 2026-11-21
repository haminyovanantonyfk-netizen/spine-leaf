# SpineLeaf privacy policy

SpineLeaf is built so that your books never leave your device.

- **No accounts.** There is nothing to sign up for.
- **No uploads.** Scanning, OCR, PDF export, and read-aloud all run locally.
  The app contains no analytics, advertising, or tracking code, and makes no
  network requests with your documents or text.
- **Your data stays in app storage.** Photos, scans, OCR text, notes,
  highlights, and reading positions are stored in the app's private local
  database (IndexedDB / the app sandbox). They leave the device only when
  *you* export a file or create a backup through the system share sheet or
  file picker.
- **Permissions.** Camera access is requested only when you open the scanner.
  File access happens only through the system pickers you invoke. Denying a
  permission disables only that feature.
- **Passwords.** If you open a password-protected PDF, the password is used
  once in memory to unlock that file and is never stored or transmitted.
- **Speech.** Read-aloud uses your device's built-in speech voices. If your
  device is configured to use a cloud voice, that is an operating-system
  setting outside the app's control; SpineLeaf itself sends nothing.
- **Deleting data.** Deleting a book removes its pages from the library.
  Clearing the app/browser site data removes everything.

Questions: open an issue in this repository.
