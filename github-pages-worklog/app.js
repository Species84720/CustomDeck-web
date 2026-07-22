import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const cfg = window.WORKLOG_CONFIG || {};
const TAGS = ["task", "story", "bug", "meeting", "support", "working-hours", "overtime", "other"];
const DAY_GRID_HEIGHT = 900;
const DAY_START = 5;
const DAY_END = 22;
const JIRA_REMEMBERED_PASSPHRASE_STORAGE_KEY = "worklog-jira-passphrase-v1";
const THEME_STORAGE_KEY = "worklog-theme";

const el = {
  importBtn: document.getElementById("btn-import"),
  themeBtn: document.getElementById("btn-theme"),
  importFile: document.getElementById("import-file"),
  jiraSettingsBtn: document.getElementById("btn-jira-settings"),
  login: document.getElementById("btn-login"),
  logout: document.getElementById("btn-logout"),
  authLabel: document.getElementById("auth-label"),
  jiraLabel: document.getElementById("jira-label"),
  dateControls: document.getElementById("date-controls"),
  dayPicker: document.getElementById("day-picker"),
  todayBtn: document.getElementById("btn-today"),
  prevDayBtn: document.getElementById("btn-prev-day"),
  nextDayBtn: document.getElementById("btn-next-day"),
  newBtn: document.getElementById("btn-new"),
  copyExcelBtn: document.getElementById("btn-copy-excel"),
  sprintSelect: document.getElementById("sprint-select"),
  dayNavControls: document.getElementById("day-nav-controls"),
  sprintControls: document.getElementById("sprint-controls"),
  viewTabs: document.getElementById("view-tabs"),
  filterTag: document.getElementById("filter-tag"),
  filterJira: document.getElementById("filter-jira"),
  timeline: document.getElementById("timeline"),
  weekView: document.getElementById("week-view"),
  monthView: document.getElementById("month-view"),
  sprintView: document.getElementById("sprint-view"),
  dayPopup: document.getElementById("day-popup"),
  dayStats: document.getElementById("day-stats"),
  sCount: document.getElementById("s-count"),
  sTime: document.getElementById("s-time"),
  sNormal: document.getElementById("s-normal"),
  sOvertime: document.getElementById("s-overtime"),
  sLinked: document.getElementById("s-linked"),
  sOverlap: document.getElementById("s-overlap"),
  dialog: document.getElementById("entry-dialog"),
  form: document.getElementById("entry-form"),
  title: document.getElementById("entry-title"),
  id: document.getElementById("entry-id"),
  task: document.getElementById("f-task"),
  note: document.getElementById("f-note"),
  date: document.getElementById("f-date"),
  location: document.getElementById("f-location"),
  start: document.getElementById("f-start"),
  end: document.getElementById("f-end"),
  tag: document.getElementById("f-tag"),
  jira: document.getElementById("f-jira"),
  jiraSelect: document.getElementById("f-jira-select"),
  reason: document.getElementById("f-reason"),
  overtime: document.getElementById("f-overtime"),
  noJira: document.getElementById("f-no-jira"),
  jiraLogged: document.getElementById("f-jira-logged"),
  sprintIssuesList: document.getElementById("sprint-issues-list"),
  sprintIssueCount: document.getElementById("sprint-issue-count"),
  slotTypeDialog: document.getElementById("slot-type-dialog"),
  slotTypeForm: document.getElementById("slot-type-form"),
  jiraSettingsDialog: document.getElementById("jira-settings-dialog"),
  jiraSettingsForm: document.getElementById("jira-settings-form"),
  jiraSettingsStatus: document.getElementById("jira-settings-status"),
  jiraBaseUrl: document.getElementById("f-jira-base-url"),
  jiraProject: document.getElementById("f-jira-project"),
  jiraEmail: document.getElementById("f-jira-email"),
  jiraApiToken: document.getElementById("f-jira-api-token"),
  desktopSyncUid: document.getElementById("f-desktop-sync-uid"),
  jiraPassphrase: document.getElementById("f-jira-passphrase"),
  jiraPassphraseConfirm: document.getElementById("f-jira-passphrase-confirm"),
  jiraRememberPassphrase: document.getElementById("f-jira-remember-passphrase"),
  jiraSettingsClear: document.getElementById("btn-jira-settings-clear"),
  jiraSettingsCancel: document.getElementById("btn-jira-settings-cancel"),
  deleteBtn: document.getElementById("btn-delete"),
  cancelBtn: document.getElementById("btn-cancel")
};

const today = new Date().toISOString().slice(0, 10);
el.dayPicker.value = today;
el.filterTag.innerHTML += TAGS.map(t => `<option value="${t}">${t}</option>`).join("");
el.tag.innerHTML = TAGS.map(t => `<option value="${t}">${t}</option>`).join("");

let auth;
let db;
let currentUser = null;
let allEntries = [];
let jiraIssueCache = [];
let jiraIssueTypeByKey = {};
let jiraIssueSummaryByKey = {};
let sprintCache = [];
let userJiraSettings = emptyJiraSettings();
let jiraUnlockSource = "";
let currentView = "day";
let dragState = null;
let suppressContextMenuUntil = 0;
const TODO_STORAGE_KEY = "worklog-todos-v1";
let todos = loadTodos();
const QUICK_ACTION_KEYS = ["quickAction", "source", "id", "task", "note", "date", "start", "end", "tag", "jiraIssue", "jiraLogged", "noJira", "isOvertime", "location", "reason", "closePreviousId"];
const quickActionState = {
  pending: parseQuickActionFromUrl(),
  processing: false,
  consumed: false
};
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function mins(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function minToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function durLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function normalizeLocation(value) {
  const raw = String(value || "work").trim().toLowerCase();
  return raw === "home" ? "home" : "work";
}

function locationLabel(value) {
  return normalizeLocation(value) === "home" ? "Home" : "Work";
}

function emptyJiraSettings() {
  return { baseUrl: "", project: "", email: "", apiToken: "", encryptedApiToken: null };
}

function bytesToBase64(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function normalizeEncryptedApiToken(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ciphertext = String(raw.ciphertext || raw.apiTokenCiphertext || "").trim();
  const iv = String(raw.iv || raw.apiTokenIv || "").trim();
  const salt = String(raw.salt || raw.apiTokenSalt || "").trim();
  const iterations = Number(raw.iterations || raw.apiTokenIterations || 250000);
  if (!ciphertext || !iv || !salt || !Number.isFinite(iterations) || iterations < 100000) return null;
  return {
    ciphertext,
    iv,
    salt,
    iterations,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256"
  };
}

async function derivePassphraseKey(passphrase, salt, iterations, usage) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}

async function encryptJiraApiToken(apiToken, passphrase) {
  const iterations = 250000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePassphraseKey(passphrase, salt, iterations, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(apiToken)
  );
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    iterations,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256"
  };
}

async function decryptJiraApiToken(bundle, passphrase) {
  const encrypted = normalizeEncryptedApiToken(bundle);
  if (!encrypted) throw new Error("No encrypted Jira API token is available.");
  try {
    const key = await derivePassphraseKey(passphrase, base64ToBytes(encrypted.salt), encrypted.iterations, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
      key,
      base64ToBytes(encrypted.ciphertext)
    );
    return textDecoder.decode(plaintext);
  } catch (_) {
    throw new Error("Invalid Jira encryption passphrase.");
  }
}

function normalizeJiraBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return raw.replace(/\/+$/, "");
  }
}

function normalizeJiraSettings(raw) {
  const encryptedApiToken = normalizeEncryptedApiToken(raw?.encryptedApiToken);
  return {
    baseUrl: normalizeJiraBaseUrl(raw?.baseUrl || raw?.jiraBaseUrl),
    project: String(raw?.project || raw?.jiraProject || "").trim().toUpperCase(),
    email: String(raw?.email || raw?.jiraEmail || "").trim(),
    apiToken: String(raw?.apiToken || raw?.jiraApiToken || "").trim(),
    encryptedApiToken
  };
}

function jiraSettingsSummary(settings = userJiraSettings) {
  if (!hasStoredJiraSettings(settings)) return "Jira not configured";
  try {
    const host = new URL(settings.baseUrl).hostname;
    return `${settings.project} · ${settings.email} @ ${host}`;
  } catch (_) {
    return `${settings.project} · ${settings.email}`;
  }
}

function hasStoredJiraSettings(settings = userJiraSettings) {
  return !!(settings.baseUrl && settings.project && settings.email && (settings.apiToken || settings.encryptedApiToken?.ciphertext));
}

function hasReadyJiraSettings(settings = userJiraSettings) {
  return !!(settings.baseUrl && settings.project && settings.email && settings.apiToken);
}

function isJiraTokenLocked(settings = userJiraSettings) {
  return !!(settings.encryptedApiToken?.ciphertext && !settings.apiToken);
}

function jiraSettingsDocPath(uid) {
  return `users/${uid}/settings/jira`;
}

function jiraEncryptedTokenFingerprint(encryptedApiToken = userJiraSettings.encryptedApiToken) {
  const encrypted = normalizeEncryptedApiToken(encryptedApiToken);
  if (!encrypted) return "";
  return [encrypted.ciphertext, encrypted.iv, encrypted.salt, encrypted.iterations].join(":");
}

function loadRememberedJiraPassphraseStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(JIRA_REMEMBERED_PASSPHRASE_STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch (_) {
    return {};
  }
}

function getRememberedJiraPassphrase(uid = currentUser?.uid, encryptedApiToken = userJiraSettings.encryptedApiToken) {
  const safeUid = String(uid || "").trim();
  const fingerprint = jiraEncryptedTokenFingerprint(encryptedApiToken);
  if (!safeUid || !fingerprint) return "";
  const store = loadRememberedJiraPassphraseStore();
  const entry = store[safeUid];
  if (!entry || typeof entry !== "object" || entry.fingerprint !== fingerprint) return "";
  return String(entry.passphrase || "");
}

function hasRememberedJiraPassphrase(uid = currentUser?.uid, encryptedApiToken = userJiraSettings.encryptedApiToken) {
  return !!getRememberedJiraPassphrase(uid, encryptedApiToken);
}

function rememberJiraPassphraseOnDevice(passphrase, uid = currentUser?.uid, encryptedApiToken = userJiraSettings.encryptedApiToken) {
  const safeUid = String(uid || "").trim();
  const fingerprint = jiraEncryptedTokenFingerprint(encryptedApiToken);
  if (!safeUid || !fingerprint || !passphrase) {
    throw new Error("Enter your Jira passphrase once to enable Remember on this device.");
  }
  try {
    const store = loadRememberedJiraPassphraseStore();
    store[safeUid] = { fingerprint, passphrase: String(passphrase), savedAt: new Date().toISOString() };
    localStorage.setItem(JIRA_REMEMBERED_PASSPHRASE_STORAGE_KEY, JSON.stringify(store));
  } catch (_) {
    throw new Error("Could not remember the Jira passphrase on this device. Check browser storage permissions.");
  }
}

function forgetRememberedJiraPassphrase(uid = currentUser?.uid) {
  const safeUid = String(uid || "").trim();
  if (!safeUid) return;
  try {
    const store = loadRememberedJiraPassphraseStore();
    if (!(safeUid in store)) return;
    delete store[safeUid];
    if (Object.keys(store).length) {
      localStorage.setItem(JIRA_REMEMBERED_PASSPHRASE_STORAGE_KEY, JSON.stringify(store));
    } else {
      localStorage.removeItem(JIRA_REMEMBERED_PASSPHRASE_STORAGE_KEY);
    }
  } catch (_) {
    // Ignore local device storage cleanup failures.
  }
}

function updateJiraStatus(message = "") {
  if (message) {
    el.jiraLabel.textContent = message;
    return;
  }
  if (!cfg.jiraWorkerUrl) {
    el.jiraLabel.textContent = "Jira: worker URL not configured";
    return;
  }
  if (!currentUser) {
    el.jiraLabel.textContent = "Jira: sign in to load your account settings";
    return;
  }
  if (!hasStoredJiraSettings()) {
    el.jiraLabel.textContent = "Jira: open Jira Settings to connect your own Jira account";
    return;
  }
  if (isJiraTokenLocked()) {
    el.jiraLabel.textContent = `Jira: ${jiraSettingsSummary()} · token locked (open Jira Settings to unlock or enable Remember on this device)`;
    return;
  }
  if (!userJiraSettings.encryptedApiToken && userJiraSettings.apiToken) {
    el.jiraLabel.textContent = `Jira: ${jiraSettingsSummary()} · legacy plain token loaded (re-save to encrypt)`;
    return;
  }
  if (jiraUnlockSource === "remembered") {
    el.jiraLabel.textContent = `Jira: ${jiraSettingsSummary()} · unlocked automatically on this device`;
    return;
  }
  el.jiraLabel.textContent = `Jira: ${jiraSettingsSummary()}`;
}

function resetJiraCaches() {
  jiraIssueCache = [];
  jiraIssueTypeByKey = {};
  jiraIssueSummaryByKey = {};
  sprintCache = [];
  updateJiraDropdown();
  refreshSprintSelect();
}

function fillJiraSettingsForm() {
  const settings = normalizeJiraSettings(userJiraSettings);
  el.jiraBaseUrl.value = settings.baseUrl;
  el.jiraProject.value = settings.project;
  el.jiraEmail.value = settings.email;
  el.jiraApiToken.value = "";
  el.desktopSyncUid.value = currentUser?.uid || "";
  el.jiraPassphrase.value = "";
  el.jiraPassphraseConfirm.value = "";
  el.jiraRememberPassphrase.checked = hasRememberedJiraPassphrase(currentUser?.uid, settings.encryptedApiToken);
  if (settings.encryptedApiToken?.ciphertext) {
    el.jiraApiToken.placeholder = settings.apiToken
      ? "Encrypted token loaded in memory. Enter a new token only if you want to replace it."
      : "Encrypted token saved. Leave blank to keep it; enter passphrase to unlock.";
    el.jiraSettingsStatus.textContent = settings.apiToken
      ? `Current saved account: ${jiraSettingsSummary(settings)} · token is unlocked for this session${el.jiraRememberPassphrase.checked ? " and will auto-unlock on this device." : "."}`
      : `Current saved account: ${jiraSettingsSummary(settings)} · token is encrypted and locked${el.jiraRememberPassphrase.checked ? ", but this device already has a saved unlock passphrase." : "."}`;
  } else if (settings.apiToken) {
    el.jiraApiToken.placeholder = "Enter Jira API token to replace or encrypt the current one.";
    el.jiraSettingsStatus.textContent = `Current saved account: ${jiraSettingsSummary(settings)} · legacy plain token detected; save with a passphrase to encrypt it.`;
  } else {
    el.jiraApiToken.placeholder = "Atlassian API token";
    el.jiraSettingsStatus.textContent = "No Jira account saved yet for this Firebase user.";
  }
}

function openJiraSettingsDialog() {
  if (!currentUser) {
    alert("Sign in first, then save your Jira settings to your Firebase user account.");
    return;
  }
  fillJiraSettingsForm();
  el.jiraSettingsDialog.showModal();
}

async function tryAutoUnlockJiraSettings() {
  if (!currentUser || !isJiraTokenLocked()) {
    if (!userJiraSettings.apiToken) jiraUnlockSource = "";
    return false;
  }
  const rememberedPassphrase = getRememberedJiraPassphrase(currentUser.uid, userJiraSettings.encryptedApiToken);
  if (!rememberedPassphrase) {
    jiraUnlockSource = "";
    return false;
  }
  try {
    const apiToken = await decryptJiraApiToken(userJiraSettings.encryptedApiToken, rememberedPassphrase);
    userJiraSettings = { ...userJiraSettings, apiToken };
    jiraUnlockSource = "remembered";
    return true;
  } catch (_) {
    forgetRememberedJiraPassphrase(currentUser.uid);
    jiraUnlockSource = "";
    return false;
  }
}

async function loadJiraSettings() {
  if (!currentUser) {
    userJiraSettings = emptyJiraSettings();
    jiraUnlockSource = "";
    resetJiraCaches();
    updateJiraStatus();
    return;
  }
  try {
    const snap = await getDoc(doc(db, jiraSettingsDocPath(currentUser.uid)));
    userJiraSettings = snap.exists() ? normalizeJiraSettings(snap.data()) : emptyJiraSettings();
    jiraUnlockSource = userJiraSettings.apiToken ? "manual" : "";
    await tryAutoUnlockJiraSettings();
    if (!hasStoredJiraSettings()) resetJiraCaches();
    updateJiraStatus();
  } catch (err) {
    userJiraSettings = emptyJiraSettings();
    jiraUnlockSource = "";
    resetJiraCaches();
    updateJiraStatus(`Jira: failed to load user settings (${String(err?.message || err)})`);
  }
}

async function saveJiraSettings(evt) {
  evt.preventDefault();
  if (!currentUser) return;
  try {
    const baseSettings = normalizeJiraSettings({
      baseUrl: el.jiraBaseUrl.value,
      project: el.jiraProject.value,
      email: el.jiraEmail.value,
      apiToken: userJiraSettings.apiToken,
      encryptedApiToken: userJiraSettings.encryptedApiToken
    });
    if (!baseSettings.baseUrl || !baseSettings.project || !baseSettings.email) {
      el.jiraSettingsStatus.textContent = "Fill in Jira base URL, project, and email.";
      return;
    }
    const tokenInput = String(el.jiraApiToken.value || "").trim();
    const passphrase = String(el.jiraPassphrase.value || "");
    const passphraseConfirm = String(el.jiraPassphraseConfirm.value || "");
    const rememberOnThisDevice = !!el.jiraRememberPassphrase.checked;
    const changedIdentity = ["baseUrl", "project", "email"].some(key => baseSettings[key] !== userJiraSettings[key]);
    let runtimeToken = userJiraSettings.apiToken || "";
    let encryptedApiToken = normalizeEncryptedApiToken(userJiraSettings.encryptedApiToken);

    if (tokenInput) {
      if (!passphrase) {
        el.jiraSettingsStatus.textContent = "Enter an encryption passphrase to save a Jira API token securely.";
        return;
      }
      if (passphrase !== passphraseConfirm) {
        el.jiraSettingsStatus.textContent = "Passphrase confirmation does not match.";
        return;
      }
      encryptedApiToken = await encryptJiraApiToken(tokenInput, passphrase);
      runtimeToken = tokenInput;
    } else if (encryptedApiToken && passphrase) {
      runtimeToken = await decryptJiraApiToken(encryptedApiToken, passphrase);
    } else if (!encryptedApiToken && runtimeToken && passphrase) {
      if (passphrase !== passphraseConfirm) {
        el.jiraSettingsStatus.textContent = "Passphrase confirmation does not match.";
        return;
      }
      encryptedApiToken = await encryptJiraApiToken(runtimeToken, passphrase);
    } else if (!encryptedApiToken && runtimeToken) {
      el.jiraSettingsStatus.textContent = "Enter an encryption passphrase to save your existing Jira token securely.";
      return;
    } else if (!encryptedApiToken && !runtimeToken) {
      el.jiraSettingsStatus.textContent = "Enter a Jira API token and an encryption passphrase to save it securely.";
      return;
    }

    const rememberedPassphrase = rememberOnThisDevice
      ? (passphrase || getRememberedJiraPassphrase(currentUser.uid, encryptedApiToken))
      : "";
    if (rememberOnThisDevice && encryptedApiToken && !rememberedPassphrase) {
      el.jiraSettingsStatus.textContent = "Enter your Jira passphrase once to enable Remember on this device in this browser.";
      return;
    }

    if (!encryptedApiToken && changedIdentity) {
      el.jiraSettingsStatus.textContent = "To save Jira account changes securely, enter the Jira API token and an encryption passphrase.";
      return;
    }

    el.jiraSettingsStatus.textContent = "Saving Jira settings to your Firebase account...";
    await setDoc(doc(db, jiraSettingsDocPath(currentUser.uid)), {
      baseUrl: baseSettings.baseUrl,
      project: baseSettings.project,
      email: baseSettings.email,
      encryptedApiToken,
      updatedAt: serverTimestamp()
    });
    userJiraSettings = {
      ...baseSettings,
      apiToken: runtimeToken,
      encryptedApiToken
    };
    jiraUnlockSource = runtimeToken ? "manual" : "";
    if (encryptedApiToken && rememberOnThisDevice) {
      rememberJiraPassphraseOnDevice(rememberedPassphrase, currentUser.uid, encryptedApiToken);
    } else {
      forgetRememberedJiraPassphrase(currentUser.uid);
    }
    updateJiraStatus(`Jira: saved ${jiraSettingsSummary(userJiraSettings)} · reloading...`);
    el.jiraSettingsDialog.close();
    await fetchJiraSprints();
    await fetchJiraIssues();
    updateJiraStatus();
    render();
  } catch (err) {
    const message = `Failed to save Jira settings: ${String(err?.message || err)}`;
    el.jiraSettingsStatus.textContent = message;
    updateJiraStatus(`Jira: ${message}`);
  }
}

async function clearJiraSettings() {
  if (!currentUser) return;
  if (!window.confirm("Remove your saved Jira settings from Firebase for this user account?")) return;
  try {
    await deleteDoc(doc(db, jiraSettingsDocPath(currentUser.uid)));
    forgetRememberedJiraPassphrase(currentUser.uid);
    userJiraSettings = emptyJiraSettings();
    jiraUnlockSource = "";
    resetJiraCaches();
    updateJiraStatus();
    el.jiraSettingsDialog.close();
    render();
  } catch (err) {
    const message = `Failed to clear Jira settings: ${String(err?.message || err)}`;
    el.jiraSettingsStatus.textContent = message;
    updateJiraStatus(`Jira: ${message}`);
  }
}

async function jiraWorkerFetch(path, extra = {}) {
  const worker = cfg.jiraWorkerUrl;
  if (!worker) throw new Error("Jira worker URL is not configured in config.js.");
  if (!hasReadyJiraSettings()) {
    throw new Error(isJiraTokenLocked()
      ? "Jira token is encrypted and locked. Open Jira Settings and enter your passphrase to unlock it."
      : "Open Jira Settings and save your Jira account details first.");
  }
  const payload = {
    baseUrl: userJiraSettings.baseUrl,
    project: userJiraSettings.project,
    email: userJiraSettings.email,
    apiToken: userJiraSettings.apiToken,
    ...extra
  };
  const response = await fetch(`${worker}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
  return data;
}

function formatExportDate(ds) {
  const [y, m, d] = String(ds || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(ds || "");
}

function escapeHtml(v) {
  return String(v || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function loadTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || "[]");
    return normalizeTodos(saved);
  } catch (_) { return []; }
}
function normalizeTodos(items) {
  return Array.isArray(items)
    ? items.filter(item => item && typeof item.text === "string" && item.text.trim()).map(item => ({
        id: String(item.id || crypto.randomUUID()),
        text: item.text.trim(),
        done: !!item.done
      }))
    : [];
}
async function saveTodos() {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
  if (!currentUser || !db) return;
  try {
    await setDoc(doc(db, `users/${currentUser.uid}/settings/todos`), {
      items: todos,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not save to-dos to Firebase:", err);
  }
}
async function loadCloudTodos() {
  if (!currentUser || !db) return;
  try {
    const snapshot = await getDoc(doc(db, `users/${currentUser.uid}/settings/todos`));
    if (snapshot.exists() && Array.isArray(snapshot.data()?.items)) {
      todos = normalizeTodos(snapshot.data().items);
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
    } else if (todos.length) {
      await saveTodos();
    }
    renderTodos();
  } catch (err) {
    console.warn("Could not load to-dos from Firebase:", err);
  }
}
function renderTodos() {
  const list = document.getElementById("todo-list");
  const empty = document.getElementById("todo-empty");
  const count = document.getElementById("todo-count");
  const clear = document.getElementById("todo-clear");
  const progress = document.getElementById("todo-progress-bar");
  if (!list) return;
  const remaining = todos.filter(todo => !todo.done).length;
  const completed = todos.length - remaining;
  count.textContent = `${remaining} left`;
  empty.hidden = todos.length > 0;
  clear.hidden = completed === 0;
  progress.style.width = todos.length ? `${Math.round((completed / todos.length) * 100)}%` : "0%";
  list.innerHTML = todos.map(todo => `
    <li class="todo-item${todo.done ? " done" : ""}">
      <label class="todo-check-label"><input type="checkbox" data-todo-action="toggle" data-todo-id="${todo.id}" ${todo.done ? "checked" : ""}><span class="todo-checkbox" aria-hidden="true">✓</span><span class="todo-text">${escapeHtml(todo.text)}</span></label>
      ${todo.done ? "" : `<button class="todo-edit" type="button" data-todo-action="edit" data-todo-id="${todo.id}" aria-label="Edit todo">✎</button>`}<button class="todo-delete" type="button" data-todo-action="delete" data-todo-id="${todo.id}" aria-label="Delete todo">×</button>
    </li>`).join("");
}
function wireTodoEvents() {
  const form = document.getElementById("todo-form");
  const input = document.getElementById("todo-input");
  const list = document.getElementById("todo-list");
  const clear = document.getElementById("todo-clear");
  form.addEventListener("submit", event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    todos.unshift({ id: crypto.randomUUID(), text, done: false });
    input.value = ""; saveTodos(); renderTodos();
  });
  list.addEventListener("click", event => {
    const control = event.target.closest("[data-todo-action]");
    if (!control) return;
    const id = control.dataset.todoId;
    if (control.dataset.todoAction === "edit") {
      const todo = todos.find(item => item.id === id && !item.done);
      if (!todo) return;
      const edited = window.prompt("Edit to-do item", todo.text);
      if (edited === null) return;
      const text = edited.trim();
      if (!text) return;
      todo.text = text;
    }
    if (control.dataset.todoAction === "delete") todos = todos.filter(todo => todo.id !== id);
    if (control.dataset.todoAction === "toggle") {
      const todo = todos.find(item => item.id === id);
      if (todo) todo.done = control.checked;
    }
    saveTodos(); renderTodos();
  });
  clear.addEventListener("click", () => { todos = todos.filter(todo => !todo.done); saveTodos(); renderTodos(); });
  renderTodos();
}

function offsetDate(ds, d) {
  const x = new Date(`${ds}T12:00:00`);
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
}

function parseBoolParam(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizeTimeParam(value) {
  const text = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : "";
}

function parseQuickActionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const type = String(params.get("quickAction") || "").trim().toLowerCase();
  if (!type || !["start", "end"].includes(type)) return null;
  return {
    type,
    id: String(params.get("id") || "").trim(),
    task: String(params.get("task") || "").trim(),
    note: String(params.get("note") || "").trim(),
    date: String(params.get("date") || "").slice(0, 10),
    start: normalizeTimeParam(params.get("start")),
    end: normalizeTimeParam(params.get("end")),
    tag: String(params.get("tag") || "task").trim() || "task",
    jiraIssue: String(params.get("jiraIssue") || "").trim().toUpperCase(),
    jiraLogged: parseBoolParam(params.get("jiraLogged")),
    noJira: parseBoolParam(params.get("noJira")),
    isOvertime: parseBoolParam(params.get("isOvertime")),
    location: normalizeLocation(params.get("location")),
    reason: String(params.get("reason") || "").trim(),
    closePreviousId: String(params.get("closePreviousId") || "").trim(),
    source: String(params.get("source") || "").trim()
  };
}

function clearQuickActionFromUrl() {
  const url = new URL(window.location.href);
  QUICK_ACTION_KEYS.forEach(key => url.searchParams.delete(key));
  history.replaceState({}, document.title, url.toString());
  quickActionState.pending = null;
  quickActionState.consumed = true;
}

function weekStart(ds) {
  const d = new Date(`${ds}T12:00:00`);
  const delta = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - delta);
  return d.toISOString().slice(0, 10);
}

function sortedEntries(entries) {
  return [...entries].sort((a, b) => `${a.date || ""}T${a.start || ""}`.localeCompare(`${b.date || ""}T${b.start || ""}`));
}

function latestOpenCloudEntry(date, beforeStart = "") {
  const candidates = sortedEntries(allEntries.filter(e =>
    e.date === date && !isBackgroundSlot(e) && !e.end &&
    (!beforeStart || mins(e.start) < mins(beforeStart))
  ));
  return candidates[candidates.length - 1] || null;
}

function sortSprintsDesc(items) {
  return [...items].sort((a, b) => String(b?.start || "").localeCompare(String(a?.start || "")));
}

function issueTypeColor(entry) {
  const key = String(entry?.jiraIssue || "").trim().toUpperCase();
  const t = String(jiraIssueTypeByKey[key] || "").toLowerCase();
  if (!t) return "#4f8cff";
  if (t.includes("bug")) return "#ef4444";
  if (t.includes("story")) return "#22c55e";
  if (t.includes("epic")) return "#f59e0b";
  if (t.includes("task") || t.includes("sub-task")) return "#3b82f6";
  if (t.includes("support") || t.includes("incident")) return "#ec4899";
  return "#4f8cff";
}

function sortedForDay(day, ignoreId = "") {
  return sortedEntries(allEntries.filter(e => e.date === day && e.id !== ignoreId));
}

function filterEntries(entries) {
  const tag = el.filterTag.value;
  const jiraMode = el.filterJira.value;
  return entries.filter(e => {
    if (isBackgroundSlot(e)) return false;
    if (tag && e.tag !== tag) return false;
    if (jiraMode === "linked" && !e.jiraIssue) return false;
    if (jiraMode === "unlinked" && (e.jiraIssue || e.noJira)) return false;
    if (jiraMode === "logged" && !e.jiraLogged) return false;
    return true;
  });
}

function isBackgroundSlot(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.isBackgroundSlot) return true;
  const tag = String(entry.tag || "").toLowerCase();
  return !!entry.noJira && (tag === "working-hours" || tag === "overtime") && /slot/i.test(String(entry.task || ""));
}

function isTimeslotTag(tag) {
  const t = String(tag || "").toLowerCase();
  return t === "working-hours" || t === "overtime";
}

function validateRange(entry, ignoreId = "") {
  if (!entry.date || !entry.start) return "Date and start are required.";
  if (entry.end && mins(entry.end) <= mins(entry.start)) return "End must be after start.";
  const currentIsSlot = isBackgroundSlot(entry) || isTimeslotTag(entry.tag);
  const entries = sortedForDay(entry.date, ignoreId).filter(e => {
    const otherIsSlot = isBackgroundSlot(e) || isTimeslotTag(e.tag);
    // Normal work/task blocks should ignore slot windows when checking overlap.
    if (!currentIsSlot && otherIsSlot) return false;
    // Slot windows should ignore normal blocks (they are background guides).
    if (currentIsSlot && !otherIsSlot) return false;
    return true;
  });
  const startMin = mins(entry.start);
  const endMin = entry.end ? mins(entry.end) : null;
  const next = entries.find(e => mins(e.start) > startMin);
  if (next && endMin !== null && endMin > mins(next.start)) return `Overlaps next block at ${next.start}.`;
  const prev = [...entries].reverse().find(e => mins(e.start) < startMin);
  if (prev && prev.end && mins(prev.end) > startMin) return `Overlaps previous block ending at ${prev.end}.`;
  return "";
}

function countOverlaps(entries) {
  const dayMap = new Map();
  entries.forEach(e => {
    if (!dayMap.has(e.date)) dayMap.set(e.date, []);
    dayMap.get(e.date).push(e);
  });
  let overlaps = 0;
  dayMap.forEach(dayEntries => {
    const sorted = sortedEntries(dayEntries);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (sorted[i].end && mins(sorted[i].end) > mins(sorted[i + 1].start)) overlaps += 1;
    }
  });
  return overlaps;
}

function updateStats(entries) {
  let total = 0;
  let normal = 0;
  let overtime = 0;
  let linked = 0;
  entries.forEach(e => {
    if (e.jiraIssue) linked += 1;
    const dur = e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0;
    total += dur;
    if (e.isOvertime || e.tag === "overtime") overtime += dur;
    else normal += dur;
  });
  el.sCount.textContent = String(entries.length);
  el.sTime.textContent = durLabel(total);
  el.sNormal.textContent = durLabel(normal);
  el.sOvertime.textContent = durLabel(overtime);
  el.sLinked.textContent = String(linked);
  el.sOverlap.textContent = String(countOverlaps(entries));
}

function updateJiraDropdown() {
  if (!el.jiraSelect) return;
  const cur = el.jiraSelect.value;
  el.jiraSelect.innerHTML = '<option value="">Pick from current sprint</option>';
  jiraIssueCache.forEach(issue => {
    const option = document.createElement("option");
    option.value = issue.key;
    const status = jiraIssueStatus(issue);
    option.textContent = `${issue.key} - ${(issue.summary || "").slice(0, 80)}${status ? ` [${status}]` : ""}`;
    el.jiraSelect.appendChild(option);
  });
  el.jiraSelect.value = cur;
  renderCurrentSprintIssues();
}

function jiraIssueStatus(issue) {
  const status = issue?.status ?? issue?.statusName ?? issue?.status_name ?? issue?.issueStatus ?? issue?.state ?? issue?.fields?.status;
  return String(status?.name || status?.value || status || "Status unavailable").trim();
}

function normalizeJiraIssue(issue) {
  const fields = issue?.fields || {};
  return {
    ...issue,
    key: String(issue?.key || "").trim().toUpperCase(),
    summary: String(issue?.summary || fields.summary || "").trim(),
    issuetype: String(issue?.issuetype?.name || issue?.issuetype || fields.issuetype?.name || fields.issuetype || "").trim(),
    status: jiraIssueStatus(issue)
  };
}

function currentSprint() {
  return sprintCache.find(s => s.start <= today && s.end >= today) || null;
}

function renderCurrentSprintIssues(message = "") {
  if (!el.sprintIssuesList || !el.sprintIssueCount) return;
  const sprint = currentSprint();
  el.sprintIssueCount.textContent = String(jiraIssueCache.length);
  if (message) {
    el.sprintIssuesList.innerHTML = `<div class="muted">${escapeHtml(message)}</div>`;
    return;
  }
  if (!sprint) {
    el.sprintIssuesList.innerHTML = '<div class="muted">No active Jira sprint found.</div>';
    return;
  }
  if (!jiraIssueCache.length) {
    el.sprintIssuesList.innerHTML = `<div class="muted">No assigned issues in ${escapeHtml(sprint.name)}.</div>`;
    return;
  }
  el.sprintIssuesList.innerHTML = jiraIssueCache.map(issue => `
    <button type="button" class="sprint-issue-item" data-jira-issue="${escapeHtml(issue.key)}">
      <span class="badge">${escapeHtml(issue.key)}</span>
      <span class="sprint-issue-copy"><span>${escapeHtml(issue.summary || "Summary unavailable")}</span><span class="jira-status">${escapeHtml(jiraIssueStatus(issue))}</span></span>
    </button>`).join("");
}

function resolveSprintSelection() {
  const selectedName = String(el.sprintSelect.value || "").trim();
  if (selectedName) {
    return {
      sprint: sprintCache.find(s => s.name === selectedName) || null,
      mode: "manual",
      anchorDate: el.dayPicker.value || today
    };
  }
  const anchorDate = el.dayPicker.value || today;
  const active = sprintCache.find(s => s.start <= anchorDate && s.end >= anchorDate);
  if (active) return { sprint: active, mode: "auto-date", anchorDate };
  return { sprint: sprintCache[0] || null, mode: sprintCache.length ? "auto-latest" : "none", anchorDate };
}

function updateSprintAutoOption() {
  const autoOption = el.sprintSelect?.querySelector('option[value=""]');
  if (!autoOption) return;
  const selection = resolveSprintSelection();
  if (!selection.sprint) {
    autoOption.textContent = "Auto / none";
    return;
  }
  if (selection.mode === "auto-date") autoOption.textContent = `Auto (${selection.sprint.name})`;
  else if (selection.mode === "auto-latest") autoOption.textContent = `Auto (latest: ${selection.sprint.name})`;
  else autoOption.textContent = "Auto / none";
}

function openEditor(entry, defaults = null) {
  const editing = !!entry;
  const preset = defaults || {};
  el.title.textContent = editing ? "Edit Block" : "New Block";
  el.id.value = editing ? entry.id : "";
  el.task.value = editing ? entry.task : "";
  el.note.value = editing ? (entry.note || "") : "";
  el.date.value = editing ? entry.date : (preset.date || el.dayPicker.value || today);
  el.location.value = editing ? normalizeLocation(entry.location) : normalizeLocation(preset.location);
  el.start.value = editing ? entry.start : (preset.start || "09:00");
  el.end.value = editing ? (entry.end || "") : (preset.end || "");
  el.tag.value = editing ? (entry.tag || "other") : (preset.tag || "task");
  el.jira.value = editing ? (entry.jiraIssue || "") : (preset.jiraIssue || "");
  el.jiraSelect.value = "";
  el.reason.value = editing ? (entry.reason || "Done") : "Done";
  el.overtime.checked = editing ? !!entry.isOvertime : !!preset.isOvertime;
  el.noJira.checked = editing ? !!entry.noJira : !!preset.noJira;
  el.jiraLogged.checked = editing ? !!entry.jiraLogged : false;
  el.deleteBtn.hidden = !editing;
  el.dialog.showModal();
}

function chooseSlotType() {
  return new Promise(resolve => {
    if (!el.slotTypeDialog || !el.slotTypeForm) {
      resolve("cancel");
      return;
    }
    const onClick = (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const value = String(target.value || "cancel").toLowerCase();
      cleanup();
      try { el.slotTypeDialog.close(); } catch (_) {}
      resolve(value);
    };
    const onCancel = () => {
      cleanup();
      resolve("cancel");
    };
    const cleanup = () => {
      el.slotTypeForm.removeEventListener("click", onClick);
      el.slotTypeDialog.removeEventListener("cancel", onCancel);
    };
    el.slotTypeForm.addEventListener("click", onClick);
    el.slotTypeDialog.addEventListener("cancel", onCancel, { once: true });
    el.slotTypeDialog.showModal();
  });
}

function renderList(targetEl, entries, emptyLabel = "No blocks") {
  if (!entries.length) {
    targetEl.innerHTML = `<div class='muted'>${emptyLabel}</div>`;
    return;
  }
  targetEl.innerHTML = entries.map(e => {
    const color = issueTypeColor(e);
    const duration = e.end ? durLabel(Math.max(0, mins(e.end) - mins(e.start))) : "Open";
    const jira = e.jiraIssue ? `<span class='badge'>${e.jiraIssue}</span>` : "<span class='badge warn'>No Jira</span>";
    const logged = e.jiraLogged ? "<span class='badge ok'>Logged</span>" : "";
    const ot = e.isOvertime ? "<span class='badge warn'>Overtime</span>" : "";
    return `<article class="block" data-id="${e.id}" style="border-left-color:${color};">
      <div class="head"><div class="task">${escapeHtml(e.task)}</div><div class="meta">${e.start}${e.end ? ` - ${e.end}` : ""} (${duration})</div></div>
      <div class="meta">Tag: ${e.tag || "other"}</div>
      ${e.note ? `<div class='meta'>${escapeHtml(e.note)}</div>` : ""}
      <div class="actions">${jira}${logged}${ot}<button class="btn" data-action="edit" data-id="${e.id}">Edit</button><button class="btn danger" data-action="delete" data-id="${e.id}">Delete</button></div>
    </article>`;
  }).join("");
}

function buildDayGrid(entries) {
  const grid = document.createElement("div");
  grid.className = "day-grid";
  grid.id = "day-grid";
  grid.style.height = `${DAY_GRID_HEIGHT}px`;
  const totalMinutes = (DAY_END - DAY_START) * 60;
  for (let h = DAY_START; h <= DAY_END; h += 1) {
    const y = ((h - DAY_START) / (DAY_END - DAY_START)) * DAY_GRID_HEIGHT;
    const line = document.createElement("div");
    line.className = "hour-line";
    line.style.top = `${y}px`;
    grid.appendChild(line);
    const label = document.createElement("div");
    label.className = "hour-label";
    label.style.top = `${y}px`;
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    grid.appendChild(label);
  }
  const slotEntries = allEntries.filter(e => e.date === el.dayPicker.value && isBackgroundSlot(e));
  slotEntries.forEach(slot => {
    if (!slot.start || !slot.end) return;
    const start = mins(slot.start);
    const end = mins(slot.end);
    if (!(end > start)) return;
    const cs = Math.max(start, DAY_START * 60);
    const ce = Math.min(end, DAY_END * 60);
    if (ce <= cs) return;
    const band = document.createElement("div");
    band.className = `work-band ${slot.isOvertime || slot.tag === "overtime" ? "overtime" : "normal"}`;
    band.style.top = `${((cs - DAY_START * 60) / totalMinutes) * DAY_GRID_HEIGHT}px`;
    band.style.height = `${Math.max(8, ((ce - cs) / totalMinutes) * DAY_GRID_HEIGHT)}px`;
    band.dataset.id = slot.id;
    band.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const entry = allEntries.find(x => x.id === slot.id);
      if (entry) openEditor(entry);
    });
    grid.appendChild(band);
  });

  entries.forEach(e => {
    if (!e.start) return;
    const start = mins(e.start);
    if (start < DAY_START * 60 || start > DAY_END * 60) return;
    const end = e.end ? mins(e.end) : Math.min(start + 30, DAY_END * 60);
    const top = ((start - DAY_START * 60) / totalMinutes) * DAY_GRID_HEIGHT;
    const height = Math.max(22, ((Math.max(end, start + 15) - start) / totalMinutes) * DAY_GRID_HEIGHT);
    const block = document.createElement("div");
    block.className = `day-block${e.isOvertime ? " ot" : ""}`;
    block.style.borderLeftColor = issueTypeColor(e);
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
    block.dataset.id = e.id;
    block.innerHTML = `<div class='task'>${escapeHtml(e.task)}</div><div class='meta'>${e.start}${e.end ? ` - ${e.end}` : ""}${e.jiraIssue ? ` | ${escapeHtml(e.jiraIssue)}` : ""}</div>`;
    block.addEventListener("click", () => {
      const entry = allEntries.find(x => x.id === e.id);
      if (entry) openEditor(entry);
    });
    block.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const entry = allEntries.find(x => x.id === e.id);
      if (entry) openEditor(entry);
    });
    block.addEventListener("mousedown", ev => {
      if (ev.button === 2) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    });
    grid.appendChild(block);
  });

  grid.addEventListener("mousedown", ev => {
    if (ev.button !== 0 && ev.button !== 2) return;
    if (ev.button === 2) {
      ev.preventDefault();
      suppressContextMenuUntil = Date.now() + 1200;
    }
    const target = ev.target;
    const targetElement = target instanceof Element ? target : null;
    if (targetElement && targetElement.closest(".day-block")) return;
    const rect = grid.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    const ghost = document.createElement("div");
    ghost.className = `drag-ghost${ev.button === 2 ? " work" : ""}`;
    ghost.style.top = `${y}px`;
    ghost.style.height = "2px";
    grid.appendChild(ghost);
    dragState = { startY: y, mode: ev.button === 2 ? "work" : "task", ghost };
  });

  grid.addEventListener("mousemove", ev => {
    if (!dragState?.ghost) return;
    const rect = grid.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    const lo = Math.min(dragState.startY, y);
    const hi = Math.max(dragState.startY, y);
    dragState.ghost.style.top = `${lo}px`;
    dragState.ghost.style.height = `${Math.max(2, hi - lo)}px`;
  });

  grid.addEventListener("mouseup", async ev => {
    if (ev.button !== 0 && ev.button !== 2) return;
    if (ev.button === 2) ev.preventDefault();
    if (!dragState) return;
    const rect = grid.getBoundingClientRect();
    const endY = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    const lo = Math.min(dragState.startY, endY);
    const hi = Math.max(dragState.startY, endY);
    if (dragState.ghost && dragState.ghost.parentElement) dragState.ghost.remove();
    const mode = dragState.mode;
    dragState = null;
    if (hi - lo < 10) return;
    const startMin = DAY_START * 60 + Math.round((lo / rect.height) * totalMinutes / 15) * 15;
    const endMin = DAY_START * 60 + Math.round((hi / rect.height) * totalMinutes / 15) * 15;
    if (mode === "work") {
      const chosen = await chooseSlotType();
      if (chosen === "cancel") return;
      await createTimeslotEntry(el.dayPicker.value, minToTime(startMin), minToTime(endMin), chosen === "overtime");
      return;
    }
    openEditor(null, {
      date: el.dayPicker.value,
      start: minToTime(startMin),
      end: minToTime(endMin),
      tag: "task",
      isOvertime: false,
      noJira: false
    });
  });

  grid.addEventListener("contextmenu", ev => ev.preventDefault());

  return grid;
}

function renderWeekView() {
  const start = weekStart(el.dayPicker.value);
  const cols = [];
  for (let i = 0; i < 7; i += 1) {
    const day = offsetDate(start, i);
    const dayEntries = filterEntries(sortedForDay(day));
    const list = dayEntries.slice(0, 6).map(e => {
      const d = e.end ? durLabel(Math.max(0, mins(e.end) - mins(e.start))) : "Open";
      return `<div class='week-entry-item'>${e.start}${e.end ? `-${e.end}` : ""} · ${escapeHtml(e.task)} · ${d}</div>`;
    }).join("");
    const more = dayEntries.length > 6 ? `<div class='meta'>+${dayEntries.length - 6} more...</div>` : "";
    cols.push(`<article class='block' data-action='go-day' data-day='${day}'><div class='task'>${day}</div><div class='meta'>${dayEntries.length} blocks</div><div class='meta'>${durLabel(dayEntries.reduce((s, e) => s + (e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0))}</div><div class='week-entry-list'>${list || "<div class='week-entry-item'>No entries</div>"}${more}</div></article>`);
  }
  el.weekView.innerHTML = `<div class='row-cards'>${cols.join("")}</div>`;
}

function hideDayPopup() {
  el.dayPopup.hidden = true;
  el.dayPopup.innerHTML = "";
}

function showDayPopup(ds) {
  const entries = filterEntries(sortedForDay(ds));
  const total = entries.reduce((s, e) => s + (e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0);
  const rows = entries.slice(0, 8).map(e => `<div class='meta'>${e.start}${e.end ? `-${e.end}` : ""} · ${escapeHtml(e.task)}${e.jiraIssue ? ` · ${escapeHtml(e.jiraIssue)}` : ""}</div>`).join("");
  el.dayPopup.innerHTML = `<h4>${ds}</h4><div class='meta'>${entries.length} block(s) · ${durLabel(total)}</div><div style='display:grid;gap:4px;margin-top:8px'>${rows || "<div class='meta'>No entries</div>"}</div><div class='meta' style='margin-top:8px'>Double click a month cell to open Day view.</div>`;
  el.dayPopup.hidden = false;
}

function renderMonthView() {
  const base = new Date(`${el.dayPicker.value}T12:00:00`);
  const y = base.getFullYear();
  const m = base.getMonth();
  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  el.monthView.innerHTML = "";
  for (let i = 0; i < startPad + days; i += 1) {
    const dayNum = i - startPad + 1;
    const ds = dayNum > 0 ? new Date(y, m, dayNum).toISOString().slice(0, 10) : "";
    const entries = ds ? filterEntries(sortedForDay(ds)) : [];
    const cell = document.createElement("div");
    cell.className = "month-cell";
    if (!ds) {
      cell.innerHTML = "<div class='muted'>-</div>";
    } else {
      cell.dataset.date = ds;
      cell.innerHTML = `<div class='month-day'>${ds}</div><div class='month-count'>${entries.length}</div><div class='meta'>${durLabel(entries.reduce((s, e) => s + (e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0))}</div>`;
      cell.addEventListener("click", () => {
        showDayPopup(ds);
      });
      cell.addEventListener("dblclick", () => {
        el.dayPicker.value = ds;
        setActiveView("day");
        el.viewTabs.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        const dayTab = el.viewTabs.querySelector('[data-view="day"]');
        if (dayTab) dayTab.classList.add("active");
        hideDayPopup();
        render();
      });
    }
    el.monthView.appendChild(cell);
  }
}

function setActiveView(view) {
  currentView = view;
  const showDateControls = view !== "sprint";
  el.timeline.hidden = view !== "day";
  el.weekView.hidden = view !== "week";
  el.monthView.hidden = view !== "month";
  el.sprintView.hidden = view !== "sprint";
  if (el.dateControls) el.dateControls.hidden = !showDateControls;
  if (el.dayNavControls) el.dayNavControls.hidden = view !== "day";
  if (el.dayStats) el.dayStats.hidden = view !== "day";
  if (el.sprintControls) el.sprintControls.hidden = view !== "sprint";
  if (view !== "month") hideDayPopup();
}

function selectedSprintEntries() {
  const { sprint } = resolveSprintSelection();
  if (!sprint) return [];
  return filterEntries(allEntries.filter(e => e.date >= sprint.start && e.date <= sprint.end));
}

function normalizeSprint(s) {
  return {
    name: String(s?.name || "").trim(),
    start: String(s?.start || "").slice(0, 10),
    end: String(s?.end || "").slice(0, 10)
  };
}

function refreshSprintSelect() {
  const combined = sprintCache.map(normalizeSprint)
    .filter(s => s.name && s.start && s.end)
    .sort((a, b) => b.start.localeCompare(a.start));
  const dedup = [];
  const seen = new Set();
  combined.forEach(s => {
    const key = `${s.name}|${s.start}|${s.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    dedup.push(s);
  });
  sprintCache = dedup;
  const cur = el.sprintSelect.value;
  el.sprintSelect.innerHTML = '<option value="">Auto / none</option>';
  sprintCache.forEach(s => {
    const op = document.createElement("option");
    op.value = s.name;
    op.textContent = `${s.name} (${s.start} -> ${s.end})`;
    el.sprintSelect.appendChild(op);
  });
  if (cur && sprintCache.some(s => s.name === cur)) el.sprintSelect.value = cur;
  else el.sprintSelect.value = "";
  updateSprintAutoOption();
}

function renderSprintView() {
  const selection = resolveSprintSelection();
  if (!selection.sprint) {
    el.sprintView.innerHTML = "<div class='muted'>No Jira sprint data available.</div>";
    return;
  }
  const entries = selectedSprintEntries();
  const selectionLabel = selection.mode === "manual"
    ? "Manual selection"
    : (selection.mode === "auto-date" ? `Auto matched ${selection.anchorDate}` : `Auto fallback from ${selection.anchorDate}`);
  const sprintHeader = `<article class='block' style='border-left-color:var(--ok)'><div class='head'><div class='task'>${escapeHtml(selection.sprint.name)}</div><div class='meta'>${selection.sprint.start} → ${selection.sprint.end}</div></div><div class='meta' style='margin-top:6px'>${selectionLabel}</div></article>`;
  if (!entries.length) {
    el.sprintView.innerHTML = `${sprintHeader}<div class='muted'>No sprint data for this selection.</div>`;
    return;
  }
  const internalRows = entries.filter(e => !!e.noJira);
  const scoped = entries.filter(e => !e.noJira);
  const byIssue = new Map();
  scoped.forEach(e => {
    const key = (e.jiraIssue || "UNLINKED").trim().toUpperCase();
    if (!byIssue.has(key)) byIssue.set(key, []);
    byIssue.get(key).push(e);
  });
  const issueHtml = [...byIssue.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([issue, rows]) => {
      const total = rows.reduce((s, e) => s + (e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0);
      const ot = rows.reduce((s, e) => s + ((e.isOvertime || e.tag === "overtime") && e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0);
      const allLogged = rows.length > 0 && rows.every(r => !!r.jiraLogged);
      const summary = issue === "UNLINKED" ? "" : String(jiraIssueSummaryByKey[issue] || "").trim();
      const issueTitle = issue === "UNLINKED"
        ? "<div class='sprint-issue-heading'><span class='badge warn'>Unlinked</span><span class='sprint-issue-summary'>No Jira issue linked</span></div>"
        : `<div class='sprint-issue-heading'><span class='badge'>${escapeHtml(issue)}</span><span class='sprint-issue-summary'>${escapeHtml(summary || "Summary unavailable")}</span></div>`;
      const rowList = rows
        .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`))
        .map(r => {
          const dur = r.end ? durLabel(Math.max(0, mins(r.end) - mins(r.start))) : "Open";
          return `<div class='meta' style='padding:4px 0;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap'>
            <label class='inline' style='font-size:11px'><input type='checkbox' data-action='toggle-row-logged' data-id='${r.id}' ${r.jiraLogged ? "checked" : ""}>Logged</label>
            <span>${r.date} ${r.start}${r.end ? `-${r.end}` : ""} · ${dur} · ${escapeHtml(r.task)}</span>
            <button class='btn' data-action='edit' data-id='${r.id}'>Edit</button>
          </div>`;
        }).join("");
      return `<article class='block'>
        <details>
          <summary class='head'><div class='task'>${issueTitle}</div><div class='meta'>${rows.length} blocks</div></summary>
          <div class='meta' style='margin-top:8px'>Total: ${durLabel(total)} | OT: ${durLabel(ot)}</div>
          <div class='actions'>
            <label class='inline'><input type='checkbox' data-action='toggle-issue-logged' data-issue='${issue}' ${allLogged ? "checked" : ""}> Mark all logged</label>
            <button class='btn' data-action='copy-issue' data-issue='${issue}'>Copy Issue Rows</button>
          </div>
          ${rowList}
        </details>
      </article>`;
    }).join("");

  let internalHtml = "";
  if (internalRows.length) {
    const total = internalRows.reduce((s, e) => s + (e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0);
    const ot = internalRows.reduce((s, e) => s + ((e.isOvertime || e.tag === "overtime") && e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0);
    const rowList = internalRows
      .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`))
      .map(r => {
        const dur = r.end ? durLabel(Math.max(0, mins(r.end) - mins(r.start))) : "Open";
        return `<div class='meta' style='padding:4px 0;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap'>
          <span>${r.date} ${r.start}${r.end ? `-${r.end}` : ""} · ${dur} · ${escapeHtml(r.task)}</span>
          <button class='btn' data-action='edit' data-id='${r.id}'>Edit</button>
        </div>`;
      }).join("");
    internalHtml = `<article class='block' style='border-left-color:var(--warn)'>
      <details open>
        <summary class='head'><div class='task'><span class='badge warn'>No Jira / Internal</span></div><div class='meta'>${internalRows.length} blocks</div></summary>
        <div class='meta' style='margin-top:8px'>Total: ${durLabel(total)} | OT: ${durLabel(ot)}</div>
        <div class='actions'><button class='btn' data-action='copy-internal'>Copy Internal Rows</button></div>
        ${rowList}
      </details>
    </article>`;
  }

  el.sprintView.innerHTML = `${sprintHeader}${internalHtml}${issueHtml}`;
}

async function toggleIssueLogged(issueKey, checked) {
  if (!currentUser) return;
  const key = String(issueKey || "").trim().toUpperCase();
  if (!key) return;
  const rows = selectedSprintEntries().filter(e => (e.jiraIssue || "UNLINKED").trim().toUpperCase() === key);
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    rows.slice(i, i + 400).forEach(r => {
      batch.set(doc(db, `users/${currentUser.uid}/entries/${r.id}`), {
        jiraLogged: !!checked,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  }
  await loadEntries();
}

async function toggleEntryLogged(id, checked) {
  if (!currentUser || !id) return;
  await setDoc(doc(db, `users/${currentUser.uid}/entries/${id}`), {
    jiraLogged: !!checked,
    updatedAt: serverTimestamp()
  }, { merge: true });
  const row = allEntries.find(e => e.id === id);
  if (row) row.jiraLogged = !!checked;
  render();
}

function render() {
  const dayEntries = filterEntries(sortedForDay(el.dayPicker.value));
  updateStats(dayEntries);
  setActiveView(currentView);

  if (currentView === "day") {
    el.timeline.innerHTML = "";
    if (!dayEntries.length) {
      const tip = document.createElement("div");
      tip.className = "muted";
      tip.textContent = "No blocks for this day. Drag on the calendar area to create one.";
      el.timeline.appendChild(tip);
    }
    el.timeline.appendChild(buildDayGrid(dayEntries));
  } else if (currentView === "week") {
    renderWeekView();
  } else if (currentView === "month") {
    renderMonthView();
  } else {
    renderSprintView();
  }
}

function parseEndReason(task) {
  const m = /^\[END:\s*(.*)\]$/.exec(String(task || "").trim());
  return m ? m[1].trim() : "";
}

function looksLikeCloudEntry(entry) {
  return !!entry && typeof entry === "object" && !!entry.date && !!entry.start && !!entry.task;
}

function makeStableImportId(entry) {
  if (entry.id) return String(entry.id);
  const raw = `${entry.date}|${entry.start}|${entry.task}|${entry.note || ""}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  const stamp = `${entry.date || "0000-00-00"}`.replaceAll("-", "") + (entry.start || "00:00").replaceAll(":", "");
  return `${stamp}_${Math.abs(hash)}`;
}

function normalizeCloudEntry(entry) {
  const tag = String(entry.tag || "other").trim() || "other";
  const slot = !!entry.isBackgroundSlot || isTimeslotTag(tag) || !!entry.noJira || !!entry.no_jira;
  return {
    id: makeStableImportId(entry),
    task: String(entry.task || "").trim(),
    note: String(entry.note || "").trim(),
    date: String(entry.date || "").slice(0, 10),
    location: normalizeLocation(entry.location),
    start: String(entry.start || "").slice(0, 5),
    end: String(entry.end || "").slice(0, 5),
    tag,
    jiraIssue: slot ? "" : String(entry.jiraIssue || entry.jira_issue || "").trim().toUpperCase(),
    jiraLogged: slot ? false : (!!entry.jiraLogged || !!entry.jira_logged),
    noJira: slot ? true : (!!entry.noJira || !!entry.no_jira),
    isBackgroundSlot: slot,
    isOvertime: !!entry.isOvertime,
    reason: String(entry.reason || "").trim()
  };
}

function parseLegacyEntries(rawEntries) {
  const sorted = [...rawEntries].filter(e => e && typeof e === "object").sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i];
    if ((cur.type || "start") === "end") continue;
    let nextSameDay = null;
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[j].date === cur.date) { nextSameDay = sorted[j]; break; }
      if (sorted[j].date && cur.date && sorted[j].date !== cur.date) break;
    }
    const tag = String(cur.tag || "other").trim() || "other";
    const slot = isTimeslotTag(tag) || !!cur.no_jira;
    out.push({
      id: makeStableImportId({ id: cur.id, date: cur.date, start: cur.time, task: cur.task, note: cur.note }),
      task: String(cur.task || "").trim(),
      note: String(cur.note || "").trim(),
      date: String(cur.date || "").slice(0, 10),
      location: "work",
      start: String(cur.time || "").slice(0, 5),
      end: nextSameDay ? String(nextSameDay.time || "").slice(0, 5) : "",
      tag,
      jiraIssue: slot ? "" : String(cur.jira_issue || "").trim().toUpperCase(),
      jiraLogged: slot ? false : !!cur.jira_logged,
      noJira: slot,
      isBackgroundSlot: slot,
      isOvertime: cur.tag === "overtime",
      reason: nextSameDay && nextSameDay.type === "end" ? parseEndReason(nextSameDay.task) : ""
    });
  }
  return out;
}

function normalizeImportPayload(payload) {
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.entries) ? payload.entries : (Array.isArray(payload?.logs) ? payload.logs : null));
  if (!rows) throw new Error("Expected a JSON array, or an object containing entries/logs array.");
  if (rows.every(looksLikeCloudEntry)) return rows.map(normalizeCloudEntry).filter(e => e.task && e.date && e.start);
  const seemsLegacy = rows.some(e => e && (e.type === "start" || e.type === "end" || e.timestamp || e.time));
  if (seemsLegacy) return parseLegacyEntries(rows).filter(e => e.task && e.date && e.start);
  throw new Error("Unrecognized JSON schema for log import.");
}

async function importEntries(entries) {
  if (!currentUser || !entries.length) return;
  if (!window.confirm(`Import ${entries.length} entries into your cloud log?`)) return;
  const colPath = `users/${currentUser.uid}/entries`;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    entries.slice(i, i + 400).forEach(entry => {
      const id = makeStableImportId(entry);
      batch.set(doc(db, `${colPath}/${id}`), { ...entry, id, updatedAt: serverTimestamp(), importedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  }
  await loadEntries();
  alert(`Imported ${entries.length} entries.`);
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    await importEntries(normalizeImportPayload(payload));
  } catch (err) {
    alert(`Import failed: ${String(err.message || err)}`);
  } finally {
    el.importFile.value = "";
  }
}

async function loadEntries() {
  if (!currentUser) return;
  const col = collection(db, `users/${currentUser.uid}/entries`);
  try {
    const snap = await getDocs(query(col, orderBy("date"), orderBy("start")));
    allEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (String(err?.code || "").includes("failed-precondition")) {
      const snap = await getDocs(col);
      allEntries = sortedEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      el.authLabel.textContent = "Signed in (fallback query active; create Firestore index for speed)";
    } else {
      throw err;
    }
  }
  render();
}

async function createTimeslotEntry(date, start, end, isOvertime) {
  if (!currentUser) return;
  if (!date || !start || !end) return;
  if (mins(end) <= mins(start)) return;
  const entry = {
    task: isOvertime ? "Overtime Slot" : "Working Slot",
    note: "Created from timeslot selection",
    date,
    location: "work",
    start,
    end,
    tag: isOvertime ? "overtime" : "working-hours",
    jiraIssue: "",
    jiraLogged: false,
    noJira: true,
    isBackgroundSlot: true,
    isOvertime: !!isOvertime,
    reason: "Scheduled",
    updatedAt: serverTimestamp()
  };
  const error = validateRange(entry, "");
  if (error) {
    alert(error);
    return;
  }
  const id = `${date.replaceAll("-", "")}${start.replaceAll(":", "")}_${crypto.randomUUID().slice(0, 8)}`;
  await setDoc(doc(db, `users/${currentUser.uid}/entries/${id}`), entry, { merge: true });
  await loadEntries();
}

async function saveEntry(evt) {
  evt.preventDefault();
  if (!currentUser) return;
  const rawId = el.id.value.trim();
  const endValue = String(el.end.value || "").trim();
  const reasonValue = String(el.reason.value || "").trim();
  const entry = {
    task: el.task.value.trim(),
    note: el.note.value.trim(),
    date: el.date.value,
    location: normalizeLocation(el.location.value),
    start: el.start.value,
    end: endValue,
    tag: el.tag.value || "other",
    jiraIssue: (el.jira.value || "").trim().toUpperCase(),
    jiraLogged: !!el.jiraLogged.checked,
    noJira: !!el.noJira.checked,
    isOvertime: !!el.overtime.checked,
    reason: endValue ? (reasonValue || "Done") : "",
    updatedAt: serverTimestamp()
  };
  if (isTimeslotTag(entry.tag)) {
    entry.noJira = true;
    entry.isBackgroundSlot = true;
  }
  if (entry.noJira) {
    entry.jiraIssue = "";
    entry.jiraLogged = false;
  }
  if (!entry.task) return alert("Task is required.");
  const error = validateRange(entry, rawId);
  if (error) return alert(error);
  const id = rawId || `${entry.date.replaceAll("-", "")}${entry.start.replaceAll(":", "")}_${crypto.randomUUID().slice(0, 8)}`;
  await setDoc(doc(db, `users/${currentUser.uid}/entries/${id}`), entry, { merge: true });
  el.dialog.close();
  await loadEntries();
}

async function applyQuickStartAction(action) {
  const entry = {
    task: action.task,
    note: action.note,
    date: action.date || el.dayPicker.value || today,
    location: normalizeLocation(action.location),
    start: action.start,
    end: "",
    tag: action.tag || "task",
    jiraIssue: action.jiraIssue,
    jiraLogged: !!action.jiraLogged,
    noJira: !!action.noJira,
    isOvertime: !!action.isOvertime,
    reason: "",
    updatedAt: serverTimestamp()
  };
  if (!entry.task) throw new Error("Quick start is missing a task.");
  if (!entry.date || !entry.start) throw new Error("Quick start requires date and start time.");
  if (entry.noJira) {
    entry.jiraIssue = "";
    entry.jiraLogged = false;
  }
  const id = action.id || `${entry.date.replaceAll("-", "")}${entry.start.replaceAll(":", "")}_${crypto.randomUUID().slice(0, 8)}`;
  const error = validateRange(entry, id);
  if (error) throw new Error(error);
  // Desktop ids belong to the legacy local log; resolve the open cloud block.
  const previous = action.source === "custom-deck-desktop"
    ? latestOpenCloudEntry(entry.date, entry.start)
    : (action.closePreviousId ? allEntries.find(e => e.id === action.closePreviousId) : null);
  const previousId = previous?.id || "";
  if (previousId && previousId !== id) {
    if (previous && previous.date === entry.date && !isBackgroundSlot(previous) && !previous.end && mins(previous.start) < mins(entry.start)) {
      await setDoc(doc(db, `users/${currentUser.uid}/entries/${previousId}`), {
        end: entry.start,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  }
  await setDoc(doc(db, `users/${currentUser.uid}/entries/${id}`), entry, { merge: true });
}

async function applyQuickEndAction(action) {
  const end = action.end;
  const date = action.date || el.dayPicker.value || today;
  if (!date || !end) throw new Error("Quick end requires date and end time.");
  let target = null;
  // Ignore local ids from the desktop bridge; Firestore is authoritative.
  if (action.id && action.source !== "custom-deck-desktop") {
    target = allEntries.find(e => e.id === action.id && !isBackgroundSlot(e));
  }
  if (!target) {
    target = latestOpenCloudEntry(date, end);
  }
  if (!target) throw new Error("No matching open cloud block was found to close.");
  const patch = {
    end,
    reason: action.reason || target.reason || "Done",
    updatedAt: serverTimestamp()
  };
  const error = validateRange({ ...target, ...patch }, target.id);
  if (error) throw new Error(error);
  await setDoc(doc(db, `users/${currentUser.uid}/entries/${target.id}`), patch, { merge: true });
}

async function applyQuickActionIfNeeded() {
  const action = quickActionState.pending;
  if (!currentUser || !action || quickActionState.processing || quickActionState.consumed) return;
  quickActionState.processing = true;
  try {
    if (action.type === "start") await applyQuickStartAction(action);
    else await applyQuickEndAction(action);
    clearQuickActionFromUrl();
    el.dayPicker.value = action.date || el.dayPicker.value || today;
    await loadEntries();
    render();
    el.authLabel.textContent = action.type === "start"
      ? `Quick start saved${action.task ? `: ${action.task}` : ""}`
      : `Quick end saved${action.reason ? `: ${action.reason}` : ""}`;
  } catch (err) {
    el.authLabel.textContent = `Quick action failed: ${String(err?.message || err)}`;
    alert(`Quick action failed: ${String(err?.message || err)}`);
  } finally {
    quickActionState.processing = false;
  }
}

async function removeEntry(id) {
  if (!currentUser || !id) return;
  if (!window.confirm("Delete this block?")) return;
  await deleteDoc(doc(db, `users/${currentUser.uid}/entries/${id}`));
  await loadEntries();
}

async function fetchJiraIssues() {
  if (!cfg.jiraWorkerUrl) {
    updateJiraStatus("Jira: worker URL not configured");
    return;
  }
  if (!hasStoredJiraSettings()) {
    resetJiraCaches();
    updateJiraStatus();
    return;
  }
  if (!hasReadyJiraSettings()) {
    resetJiraCaches();
    updateJiraStatus();
    return;
  }
  try {
    const sprint = currentSprint();
    if (!sprint) {
      jiraIssueCache = [];
      updateJiraDropdown();
      updateJiraStatus(`Jira: no active sprint found · ${jiraSettingsSummary()}`);
      return;
    }
    renderCurrentSprintIssues(`Loading ${sprint.name}...`);
    const data = await jiraWorkerFetch(`/jira/issues?sprint=${encodeURIComponent(sprint.name)}`);
    jiraIssueCache = (data.issues || []).map(normalizeJiraIssue).filter(issue => issue.key);
    jiraIssueTypeByKey = {};
    jiraIssueSummaryByKey = {};
    jiraIssueCache.forEach(issue => {
      const key = String(issue?.key || "").trim().toUpperCase();
      if (!key) return;
      jiraIssueTypeByKey[key] = String(issue?.issuetype || "");
      jiraIssueSummaryByKey[key] = String(issue?.summary || "").trim();
    });
    updateJiraStatus(`Jira: ${jiraIssueCache.length} issues in ${sprint.name} · ${jiraSettingsSummary()}`);
    updateJiraDropdown();
  } catch (err) {
    resetJiraCaches();
    renderCurrentSprintIssues(String(err.message || err));
    updateJiraStatus(`Jira: ${String(err.message || err)}`);
  }
}

async function fetchJiraSprints() {
  if (!cfg.jiraWorkerUrl || !hasReadyJiraSettings()) {
    sprintCache = [];
    refreshSprintSelect();
    renderCurrentSprintIssues();
    return;
  }
  try {
    const data = await jiraWorkerFetch("/jira/sprints");
    sprintCache = sortSprintsDesc((data.sprints || []).map(normalizeSprint));
    refreshSprintSelect();
    renderCurrentSprintIssues();
  } catch (_) {
    sprintCache = [];
    refreshSprintSelect();
    renderCurrentSprintIssues();
  }
}


function copyIssueRows(issueKey) {
  const rows = selectedSprintEntries().filter(e => (e.jiraIssue || "UNLINKED").trim().toUpperCase() === issueKey);
  if (!rows.length) return;
  const out = [["Date", "Start", "End", "Duration", "Type", "Jira", "Task", "Note"].join("\t")];
  rows.forEach(e => {
    out.push([
      e.date,
      e.start,
      e.end || "",
      e.end ? durLabel(Math.max(0, mins(e.end) - mins(e.start))) : "Open",
      (e.isOvertime || e.tag === "overtime") ? "Overtime" : "Normal",
      e.jiraIssue || "",
      e.task || "",
      (e.note || "").replaceAll("\n", " ")
    ].join("\t"));
  });
  navigator.clipboard.writeText(out.join("\n")).then(() => alert(`Copied ${rows.length} rows for ${issueKey}.`));
}

function copyInternalRows() {
  const rows = selectedSprintEntries().filter(e => !!e.noJira);
  if (!rows.length) return;
  const out = [["Date", "Start", "End", "Duration", "Type", "Task", "Note"].join("\t")];
  rows.forEach(e => {
    out.push([
      e.date,
      e.start,
      e.end || "",
      e.end ? durLabel(Math.max(0, mins(e.end) - mins(e.start))) : "Open",
      (e.isOvertime || e.tag === "overtime") ? "Overtime" : "Normal",
      e.task || "",
      (e.note || "").replaceAll("\n", " ")
    ].join("\t"));
  });
  navigator.clipboard.writeText(out.join("\n")).then(() => alert(`Copied ${rows.length} internal row(s).`));
}

function copyExcelRows() {
  const monthPrefix = String(el.dayPicker.value || today).slice(0, 7);
  const rows = sortedEntries(allEntries.filter(e => String(e.date || "").startsWith(monthPrefix) && !!e.end && (!!e.isOvertime || e.tag === "overtime")));
  if (!rows.length) return alert("No overtime rows found for the selected month.");
  const header = ["Date", "Location", "From", "To"];
  const out = [header.join("\t")];
  rows.forEach(e => {
    out.push([formatExportDate(e.date), locationLabel(e.location), e.start, e.end || ""].join("\t"));
  });
  navigator.clipboard.writeText(out.join("\n")).then(() => alert(`Copied ${rows.length} overtime row(s) for ${monthPrefix}.`));
}

// Timeslots are now created per day via right-click drag + slot type chooser.

function friendlyAuthError(err) {
  const code = String(err?.code || "");
  if (code.includes("popup-blocked")) return "Popup was blocked by browser. Allow popups and try again.";
  if (code.includes("popup-closed-by-user")) return "Sign-in popup was closed before completion.";
  if (code.includes("unauthorized-domain")) return "This domain is not in Firebase Auth allowed domains.";
  if (code.includes("operation-not-allowed")) return "Google sign-in is not enabled in Firebase Authentication.";
  if (code.includes("invalid-api-key")) return "Firebase API key is invalid. Check config.js.";
  return String(err?.message || err || "Unknown sign-in error");
}

function wireEvents() {
  const updateThemeButton = () => {
    const light = document.documentElement.dataset.theme === "light";
    el.themeBtn.textContent = light ? "☾ Dark" : "☀ Light";
    el.themeBtn.setAttribute("aria-label", `Switch to ${light ? "dark" : "light"} theme`);
  };
  updateThemeButton();
  el.themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_STORAGE_KEY, next);
    updateThemeButton();
  });
  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", async () => handleImportFile(el.importFile.files && el.importFile.files[0]));
  el.jiraSettingsBtn.addEventListener("click", openJiraSettingsDialog);
  el.login.addEventListener("click", async () => {
    if (!auth) return alert("Firebase is not initialized. Check web/github-pages-worklog/config.js.");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (err) { alert(`Sign-in failed: ${friendlyAuthError(err)}`); }
  });
  el.logout.addEventListener("click", () => signOut(auth));
  el.newBtn.addEventListener("click", () => openEditor(null));
  el.copyExcelBtn.addEventListener("click", copyExcelRows);
  el.filterTag.addEventListener("change", render);
  el.filterJira.addEventListener("change", render);
  el.dayPicker.addEventListener("change", () => {
    updateSprintAutoOption();
    render();
  });
  el.todayBtn.addEventListener("click", () => {
    el.dayPicker.value = today;
    updateSprintAutoOption();
    render();
  });
  el.prevDayBtn.addEventListener("click", () => {
    el.dayPicker.value = offsetDate(el.dayPicker.value || today, -1);
    updateSprintAutoOption();
    render();
  });
  el.nextDayBtn.addEventListener("click", () => {
    el.dayPicker.value = offsetDate(el.dayPicker.value || today, 1);
    updateSprintAutoOption();
    render();
  });
  el.sprintSelect.addEventListener("change", () => {
    updateSprintAutoOption();
    render();
  });
  el.form.addEventListener("submit", saveEntry);
  el.jiraSettingsForm.addEventListener("submit", saveJiraSettings);
  el.jiraSettingsCancel.addEventListener("click", () => el.jiraSettingsDialog.close());
  el.jiraSettingsClear.addEventListener("click", clearJiraSettings);
  el.cancelBtn.addEventListener("click", () => el.dialog.close());
  el.jiraSelect.addEventListener("change", () => {
    if (el.jiraSelect.value) el.jira.value = el.jiraSelect.value;
  });
  el.sprintIssuesList.addEventListener("click", event => {
    const issue = event.target.closest("[data-jira-issue]")?.dataset.jiraIssue;
    if (issue) openEditor(null, { jiraIssue: issue });
  });

  el.viewTabs.addEventListener("click", ev => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const v = target.dataset.view;
    if (!v) return;
    setActiveView(v);
    el.viewTabs.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    target.classList.add("active");
    render();
  });

  el.deleteBtn.addEventListener("click", async () => {
    const id = el.id.value.trim();
    el.dialog.close();
    await removeEntry(id);
  });

  document.addEventListener("click", async ev => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const actionEl = target.closest("[data-action]");
    if (!(actionEl instanceof HTMLElement)) return;
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;
    if (!action) return;
    if (el.dayPopup && !el.dayPopup.hidden) {
      const clickInsidePopup = target.closest("#day-popup");
      const clickMonthCell = target.closest(".month-cell");
      if (!clickInsidePopup && !clickMonthCell) hideDayPopup();
    }
    if (action === "copy-issue") {
      const issue = String(actionEl.dataset.issue || "").trim().toUpperCase();
      if (issue) copyIssueRows(issue);
      return;
    }
    if (action === "copy-internal") {
      copyInternalRows();
      return;
    }
    if (action === "go-day") {
      const day = String(actionEl.dataset.day || "").trim();
      if (!day) return;
      el.dayPicker.value = day;
      setActiveView("day");
      el.viewTabs.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      const dayTab = el.viewTabs.querySelector('[data-view="day"]');
      if (dayTab) dayTab.classList.add("active");
      render();
      return;
    }
    if (!id) return;
    if (action === "edit") {
      const entry = allEntries.find(x => x.id === id);
      if (entry) openEditor(entry);
    }
    if (action === "delete") await removeEntry(id);
  });

  document.addEventListener("change", async ev => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (action !== "toggle-issue-logged") return;
    const issue = String(target.dataset.issue || "").trim().toUpperCase();
    const checked = target instanceof HTMLInputElement ? target.checked : false;
    if (issue) await toggleIssueLogged(issue, checked);
  });

  document.addEventListener("change", async ev => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action !== "toggle-row-logged") return;
    const id = String(target.dataset.id || "").trim();
    const checked = target instanceof HTMLInputElement ? target.checked : false;
    if (id) await toggleEntryLogged(id, checked);
  });

  document.addEventListener("contextmenu", ev => {
    if (Date.now() < suppressContextMenuUntil) ev.preventDefault();
  });
}

function initFirebase() {
  const f = cfg.firebase || {};
  const ok = f.apiKey && f.authDomain && f.projectId && f.appId;
  if (!ok) {
    el.authLabel.textContent = "Set firebase config in config.js";
    el.login.disabled = true;
    el.importBtn.disabled = true;
    el.jiraSettingsBtn.disabled = true;
    el.newBtn.disabled = true;
    return false;
  }
  const app = initializeApp(f);
  auth = getAuth(app);
  db = getFirestore(app);
  return true;
}

async function boot() {
  wireEvents();
  wireTodoEvents();
  const ready = initFirebase();
  if (!ready) return;
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    const signedIn = !!user;
    el.login.hidden = signedIn;
    el.logout.hidden = !signedIn;
    el.newBtn.disabled = !signedIn;
    el.importBtn.disabled = !signedIn;
    el.jiraSettingsBtn.disabled = !signedIn;
    el.copyExcelBtn.disabled = !signedIn;
    el.authLabel.textContent = signedIn ? `Signed in as ${user.email}` : (quickActionState.pending ? "Quick action ready — sign in to submit it" : "Not signed in");
    if (!signedIn) {
      userJiraSettings = emptyJiraSettings();
      jiraUnlockSource = "";
      resetJiraCaches();
      updateJiraStatus();
      allEntries = [];
      render();
      return;
    }
    await loadCloudTodos();
    await loadJiraSettings();
    await Promise.all([loadEntries(), fetchJiraSprints()]);
    await fetchJiraIssues();
    await applyQuickActionIfNeeded();
    updateSprintAutoOption();
    updateJiraStatus();
    render();
  });
}

boot();
