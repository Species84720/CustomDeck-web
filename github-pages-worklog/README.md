# Work Log Cloud (GitHub Pages)

Static work logger with:
- Google sign-in (Firebase Auth)
- Cloud persistence (Firestore)
- Jira read access via Cloudflare Worker proxy
- Per-user Jira settings stored in each Firebase account instead of shared public config
- JSON import for migrating existing local `work_logs/log.json`
- Quick-action deep links so the desktop `WORK_LOG` / `WORK_CLOSE` shortcuts can submit into the cloud app
- Day/Week/Month/Sprint views with calendar-style block creation
- Work window + overtime helper blocks, plus default template save/load
- Excel-ready overtime-month export rows (`Date`, `Location`, `From`, `To`)

## 1) Configure Firebase

1. Create a Firebase project.
2. Enable **Authentication > Google**.
3. Create **Firestore** database (production mode is fine).
4. Add GitHub Pages domain to Auth allowed domains:
   - `your-user.github.io`
5. Copy `config.example.js` to `config.js` and fill values.

### Recommended Firestore rules

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/entries/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid}/settings/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 2) Configure Jira worker

Set this in `config.js`:
- `jiraWorkerUrl`

Deploy worker from `workers/jira-proxy` (see worker README).

After sign-in, each user should open **Jira Settings** in the page and save:

- Jira base URL
- Project key
- Jira email
- Jira API token
- Encryption passphrase used to encrypt the Jira API token before it is stored in Firestore

Optionally, the user can enable **Remember passphrase on this device** so that browser stores the Jira unlock passphrase locally and automatically unlocks Jira after sign-in on that same device/browser profile.

The Jira API token is encrypted client-side with that passphrase before it is stored in the user's Firebase settings document. It is only decrypted in-memory for the signed-in browser session after the user unlocks it, unless the user has explicitly opted into device-local remembered unlocking.

## 3) Run locally

```bash
npm install
npm run dev
```

## 4) Publish to GitHub Pages

Push this folder content to a Pages branch/folder and serve as static site.

## 5) Desktop shortcut bridge

The Python desktop logger can now hand off start/end actions to this cloud app by opening a quick-action URL in the signed-in browser session.

Configure one of these in your desktop app settings:

- `work_logs/settings.json` → `cloud_app_url`
- or `app_settings.json` → `worklog_cloud_url`

Set the value to your deployed GitHub Pages worklog URL, for example:

```json
{
  "cloud_app_url": "https://your-user.github.io/worklog"
}
```

When that URL is configured, the existing Custom Deck work logger shortcuts keep their current popup UX on desktop, but they also send a quick start/quick end action into the cloud app.

## Notes

- Firebase web config is public by design; Jira secrets are no longer stored in `config.js`.
- Jira requests go through Cloudflare Worker using each signed-in user's saved Jira settings.
- Jira token encryption is client-side; users need their passphrase again on a new session or browser unless they enabled **Remember passphrase on this device** in that browser.
- The remembered unlock option stores the Jira passphrase locally in that browser profile, so avoid enabling it on shared machines.
- Use the **Import JSON** button after sign-in to upload your existing local log file.








