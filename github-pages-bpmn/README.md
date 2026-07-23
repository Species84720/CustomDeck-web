# BPMN Vault

Static GitHub Pages viewer for encrypted BPMN files stored in Firebase Firestore.

Configure `config.js` from `config.example.js`, enable Google sign-in in Firebase Authentication, and add the Firestore rules from `firestore.rules`. The vault password derives the browser-only encryption key; it is never uploaded or stored.
