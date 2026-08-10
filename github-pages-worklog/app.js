import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const cfg = window.WORKLOG_CONFIG || {};
const TODO_PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"];
const TODO_PRIORITY_RANK = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 };
const TODO_PRIORITY_RGB = { Highest: [139, 0, 0], High: [220, 38, 38], Medium: [249, 115, 22], Low: [37, 99, 235], Lowest: [6, 182, 212] };
const TAGS = ["task", "story", "bug", "meeting", "support", "working-hours", "overtime", "other"];
const PBI_ISSUE_TYPE_OPTIONS = [
  "Story",
  "Bug",
  "Task",
  "Epic",
  "Support",
  "Discovery",
  "Kaizen",
  "Planning",
  "SRE Task",
  "Marval Call",
  "Technical Governance",
  "Impediment",
  "Buffer"
];
const DAY_GRID_HEIGHT = 900;
const DAY_START_MINUTES = 5 * 60;
const DAY_END_DEFAULT_MINUTES = 16 * 60;
const JIRA_REMEMBERED_PASSPHRASE_STORAGE_KEY = "worklog-jira-passphrase-v1";
const PBI_HISTORY_STORAGE_KEY = "worklog-pbi-history-v1";
const THEME_STORAGE_KEY = "worklog-theme";

const JIRA_SCRUM_TEAM_URL = "https://malta-customs.atlassian.net/jira/people/team/439a8253-3b82-4dda-ad02-35c4eb8bf919?ref=jira$&src=issue";
async function jiraScrumTeamCommentBody() {
  const teamUrl = String(userJiraSettings.qaTeamUrl || JIRA_SCRUM_TEAM_URL).trim();
  const data = await jiraWorkerFetch("/jira/team-members", { teamUrl });
  const members = Array.isArray(data.members) ? data.members : [];
  if (!members.length) throw new Error("The configured Jira team has no readable members.");
  const teamName = String(data.name || userJiraSettings.qaTeamName || "Jira Team").trim();
  const content = [{ type: "text", text: teamName, marks: [{ type: "link", attrs: { href: teamUrl } }] }, { type: "text", text: " (" }];
  members.forEach((member, index) => { if (index) content.push({ type: "text", text: " " }); content.push({ type: "mention", attrs: { id: member.accountId, text: "@" + member.displayName, accessLevel: "" } }); });
  content.push({ type: "text", text: ") for testing." });
  return { type: "doc", version: 1, content: [{ type: "paragraph", content }] };
}
const el = {
  importBtn: document.getElementById("btn-import"),
  themeBtn: document.getElementById("btn-theme"),
  importFile: document.getElementById("import-file"),
  pbiCreatorBtn: document.getElementById("btn-pbi-creator"),
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
  jiraIssueDialog: document.getElementById("jira-issue-dialog"),
  jiraIssueTitle: document.getElementById("jira-issue-title"),
  jiraIssueBody: document.getElementById("jira-issue-body"),
  jiraIssueSave: document.getElementById("jira-issue-save"),
  todoEditDialog: document.getElementById("todo-edit-dialog"),
  todoEditForm: document.getElementById("todo-edit-form"),
  todoEditId: document.getElementById("todo-edit-id"),
  todoEditText: document.getElementById("todo-edit-text"),
  todoEditJira: document.getElementById("todo-edit-jira"),
  todoEditPriority: document.getElementById("todo-edit-priority"),
  todoEditCancel: document.getElementById("todo-edit-cancel"),
  slotTypeDialog: document.getElementById("slot-type-dialog"),
  slotTypeForm: document.getElementById("slot-type-form"),
  jiraTransitionDialog: document.getElementById("jira-transition-dialog"),
  jiraTransitionTitle: document.getElementById("jira-transition-title"),
  jiraTransitionSubtitle: document.getElementById("jira-transition-subtitle"),
  jiraTransitionOptions: document.getElementById("jira-transition-options"),
  jiraTransitionCancel: document.getElementById("jira-transition-cancel"),
  jiraSettingsDialog: document.getElementById("jira-settings-dialog"),
  jiraSettingsForm: document.getElementById("jira-settings-form"),
  jiraSettingsStatus: document.getElementById("jira-settings-status"),
  jiraBaseUrl: document.getElementById("f-jira-base-url"),
  jiraProject: document.getElementById("f-jira-project"),
  jiraEmail: document.getElementById("f-jira-email"),
  jiraApiToken: document.getElementById("f-jira-api-token"),
  jiraPbiDraftUrl: document.getElementById("f-pbi-draft-url"),
  jiraUatApiUrl: document.getElementById("f-uat-api-url"),
  jiraStoryPointsFieldId: document.getElementById("f-story-points-field-id"),
  jiraQaTeamUrl: document.getElementById("f-jira-qa-team-url"),
  jiraQaTeamName: document.getElementById("f-jira-qa-team-name"),
  desktopSyncUid: document.getElementById("f-desktop-sync-uid"),
  jiraPassphrase: document.getElementById("f-jira-passphrase"),
  jiraPassphraseConfirm: document.getElementById("f-jira-passphrase-confirm"),
  jiraRememberPassphrase: document.getElementById("f-jira-remember-passphrase"),
  jiraSettingsClear: document.getElementById("btn-jira-settings-clear"),
  jiraSettingsCancel: document.getElementById("btn-jira-settings-cancel"),
  pbiDialog: document.getElementById("pbi-dialog"),
  pbiStatus: document.getElementById("pbi-status"),
  pbiHistoryList: document.getElementById("pbi-history-list"),
  pbiInput: document.getElementById("pbi-initial-input"),
  pbiAnalyzeBtn: document.getElementById("btn-pbi-analyze"),
  pbiClassification: document.getElementById("pbi-classification"),
  pbiEditorSection: document.getElementById("pbi-editor-section"),
  pbiDynamicForm: document.getElementById("pbi-dynamic-form"),
  pbiSubmitBtn: document.getElementById("btn-pbi-submit"),
  pbiDebugRequest: document.getElementById("pbi-debug-request"),
  pbiDebugResponse: document.getElementById("pbi-debug-response"),
  uatDialog: document.getElementById("uat-dialog"),
  uatStatus: document.getElementById("uat-status"),
  uatSearchPanel: document.getElementById("uat-search-panel"),
  uatResultPanel: document.getElementById("uat-result-panel"),
  uatIssueInput: document.getElementById("uat-issue-input"),
  uatFetchBtn: document.getElementById("btn-uat-fetch"),
  uatOpenSettingsBtn: document.getElementById("btn-uat-open-settings"),
  uatError: document.getElementById("uat-error"),
  uatIssueKeyLabel: document.getElementById("uat-issue-key-label"),
  uatIssueSummary: document.getElementById("uat-issue-summary"),
  uatIssueUrl: document.getElementById("uat-issue-url"),
  uatCopyLinkBtn: document.getElementById("btn-uat-copy-link"),
  uatTestCaseName: document.getElementById("uat-test-case-name"),
  uatTestPurpose: document.getElementById("uat-test-purpose"),
  uatRequirements: document.getElementById("uat-requirements"),
  uatInputTestData: document.getElementById("uat-input-test-data"),
  uatStepsBody: document.getElementById("uat-steps-body"),
  uatCopyBtn: document.getElementById("btn-uat-copy"),
  uatResetBtn: document.getElementById("btn-uat-reset"),
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
let jiraDropdownSearchBuffer = "";
let jiraDropdownSearchTimer = null;
let jiraIssueTypeByKey = {};
let jiraIssueSummaryByKey = {};
const jiraIssueLookupPending = new Set();
let jiraIssueEditMeta = {};
let jiraIssueDraft = null;
let todoBeingEdited = null;
let todoSearchQuery = "";
let sprintCache = [];
let userJiraSettings = emptyJiraSettings();
let jiraUnlockSource = "";
let currentPbiClassification = "";
let currentPbiIssueType = "";
let currentPbiDraftFields = null;
let currentUatIssueKey = "";
let currentUatData = null;
let currentView = "day";
let dragState = null;
let suppressContextMenuUntil = 0;
let dragSelectionGuardWired = false;
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
function ceilToStep(value, step) {
  return Math.ceil(value / step) * step;
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
  return {
    baseUrl: "",
    project: "",
    email: "",
    apiToken: "",
    encryptedApiToken: null,
    pbiDraftUrl: String(cfg.pbiDraftUrl || "").trim(),
    uatApiUrl: String(cfg.uatApiUrl || "").trim(),
    storyPointsFieldId: "",
    qaTeamUrl: String(cfg.qaTeamUrl || "").trim(),
    qaTeamName: String(cfg.qaTeamName || "").trim()
  };
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
    encryptedApiToken,
    pbiDraftUrl: String(raw?.pbiDraftUrl || cfg.pbiDraftUrl || "").trim(),
    uatApiUrl: String(raw?.uatApiUrl || cfg.uatApiUrl || "").trim(),
    storyPointsFieldId: String(raw?.storyPointsFieldId || "").trim(),
    qaTeamUrl: String(raw?.qaTeamUrl || cfg.qaTeamUrl || "").trim(),
    qaTeamName: String(raw?.qaTeamName || cfg.qaTeamName || "").trim()
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
  jiraIssueLookupPending.clear();
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
  el.jiraPbiDraftUrl.value = settings.pbiDraftUrl || "";
  el.jiraUatApiUrl.value = settings.uatApiUrl || "";
  el.jiraStoryPointsFieldId.value = settings.storyPointsFieldId || "";
  el.jiraQaTeamUrl.value = settings.qaTeamUrl || "";
  el.jiraQaTeamName.value = settings.qaTeamName || "";
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
      pbiDraftUrl: el.jiraPbiDraftUrl.value,
      uatApiUrl: el.jiraUatApiUrl.value,
      storyPointsFieldId: el.jiraStoryPointsFieldId.value,
      qaTeamUrl: el.jiraQaTeamUrl.value,
      qaTeamName: el.jiraQaTeamName.value,
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
      pbiDraftUrl: baseSettings.pbiDraftUrl,
      uatApiUrl: baseSettings.uatApiUrl,
      storyPointsFieldId: baseSettings.storyPointsFieldId,
      qaTeamUrl: baseSettings.qaTeamUrl,
      qaTeamName: baseSettings.qaTeamName,

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

function getPbiDraftUrl(settings = userJiraSettings) {
  return String(settings?.pbiDraftUrl || cfg.pbiDraftUrl || "").trim();
}

function getUatApiUrl(settings = userJiraSettings) {
  return String(settings?.uatApiUrl || cfg.uatApiUrl || "").trim();
}

function isAzureAiDraftEndpoint(url) {
  const host = String(url?.hostname || "").toLowerCase();
  const path = String(url?.pathname || "").toLowerCase();
  return host.endsWith(".openai.azure.com")
    || host.endsWith(".services.ai.azure.com")
    || host.endsWith(".cognitiveservices.azure.com")
    || path.includes("/openai/")
    || path.includes("/models");
}

function buildPbiDraftRequestUrl() {
  const targetUrl = getPbiDraftUrl();
  if (!targetUrl) throw new Error("Open Jira Settings and save the PBI Draft API endpoint first.");
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_) {
    return targetUrl;
  }
  if (isAzureAiDraftEndpoint(parsed) && !parsed.searchParams.has("api-version")) {
    parsed.searchParams.set("api-version", "2024-10-01");
  }
  return parsed.toString();
}

function getPbiHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(PBI_HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.map(item => String(item || "").trim()).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function renderPbiHistory() {
  if (!el.pbiHistoryList) return;
  const history = getPbiHistory();
  if (!history.length) {
    el.pbiHistoryList.innerHTML = '<div class="pbi-history-empty">No history yet.</div>';
    return;
  }
  const items = history.map(text => `<button type="button" class="btn pbi-history-item" data-pbi-history-text="${escapeHtml(text)}" title="${escapeHtml(text)}">${escapeHtml(text.length > 120 ? `${text.slice(0, 120)}...` : text)}</button>`).join("");
  el.pbiHistoryList.innerHTML = `${items}<button type="button" class="btn danger pbi-history-item" data-pbi-history-clear="1">Clear History</button>`;
}

function addPbiHistory(text) {
  const value = String(text || "").trim();
  if (!value) return;
  const history = getPbiHistory().filter(item => item !== value);
  history.unshift(value);
  localStorage.setItem(PBI_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 10)));
  renderPbiHistory();
}

function updatePbiStatus(message = "", kind = "") {
  if (!el.pbiStatus) return;
  el.pbiStatus.textContent = message;
  el.pbiStatus.classList.toggle("pbi-status-ok", kind === "ok");
  el.pbiStatus.classList.toggle("pbi-status-error", kind === "error");
}

function updateUatStatus(message = "", kind = "") {
  if (!el.uatStatus) return;
  el.uatStatus.textContent = message;
  el.uatStatus.classList.toggle("pbi-status-ok", kind === "ok");
  el.uatStatus.classList.toggle("pbi-status-error", kind === "error");
}

function resetPbiDraftEditor() {
  currentPbiClassification = "";
  currentPbiIssueType = "";
  currentPbiDraftFields = null;
  el.pbiClassification.textContent = "";
  el.pbiClassification.hidden = true;
  el.pbiEditorSection.hidden = true;
  el.pbiDynamicForm.innerHTML = "";
}

function resetUatDialog() {
  currentUatIssueKey = "";
  currentUatData = null;
  el.uatIssueInput.value = "";
  el.uatIssueKeyLabel.textContent = "";
  el.uatIssueSummary.textContent = "";
  el.uatIssueUrl.href = "#";
  el.uatIssueUrl.textContent = "Open in Jira";
  el.uatTestCaseName.textContent = "";
  el.uatTestPurpose.textContent = "";
  el.uatRequirements.innerHTML = "";
  el.uatInputTestData.textContent = "";
  el.uatStepsBody.innerHTML = "";
  el.uatSearchPanel.hidden = false;
  el.uatResultPanel.hidden = true;
  el.uatError.hidden = true;
  el.uatError.textContent = "";
}

function showUatError(message) {
  el.uatError.textContent = message;
  el.uatError.hidden = false;
}

function hideUatError() {
  el.uatError.hidden = true;
  el.uatError.textContent = "";
}

function normalizeUatIssueKey(value) {
  return String(value || "").trim().toUpperCase();
}

function buildUatRequestUrl(issueKey) {
  const base = getUatApiUrl();
  if (!base) throw new Error("Open Jira Settings and save the UAT API endpoint first.");
  return base.includes("{issueKey}")
    ? base.replaceAll("{issueKey}", encodeURIComponent(issueKey))
    : base;
}

function openUatDialog(issueKey = "") {
  resetUatDialog();
  const normalizedIssueKey = normalizeUatIssueKey(issueKey);
  if (normalizedIssueKey) el.uatIssueInput.value = normalizedIssueKey;
  updateUatStatus(getUatApiUrl()
    ? "UAT API endpoint loaded from Jira Settings."
    : "Open Jira Settings and save the UAT API endpoint first.");
  el.uatDialog.showModal();
  if (normalizedIssueKey && getUatApiUrl()) {
    fetchUatIssue();
  }
}

function normalizeUatRequirements(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => typeof item === "object" && item !== null ? String(item.item || item.name || item.value || "").trim() : String(item || "").trim())
    .filter(Boolean);
}

function normalizeUatSteps(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => typeof item === "object" && item !== null ? String(item.item || item.name || item.value || "").trim() : String(item || "").trim())
    .filter(Boolean);
}

function renderUatData(data, issueKey) {
  currentUatIssueKey = issueKey;
  currentUatData = data || {};
  el.uatSearchPanel.hidden = true;
  el.uatResultPanel.hidden = false;
  el.uatIssueKeyLabel.textContent = issueKey;
  el.uatIssueSummary.textContent = String(data?.issue_summary || "No Summary");
  const issueUrl = String(data?.issue_url || "").trim() || (userJiraSettings.baseUrl ? `${userJiraSettings.baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(issueKey)}` : "#");
  el.uatIssueUrl.href = issueUrl;
  el.uatIssueUrl.textContent = issueUrl === "#" ? "Open in Jira" : "Open in Jira";
  el.uatTestCaseName.textContent = String(data?.test_case_name || "N/A");
  el.uatTestPurpose.textContent = String(data?.test_purpose || "N/A");
  el.uatInputTestData.textContent = String(data?.input_test_data || "N/A");
  const requirements = normalizeUatRequirements(data?.requirements_covered);
  el.uatRequirements.innerHTML = requirements.length
    ? requirements.map(item => `<span class="req-item">${escapeHtml(item)}</span>`).join("")
    : "<span class='muted'>N/A</span>";
  const steps = normalizeUatSteps(data?.test_steps);
  el.uatStepsBody.innerHTML = steps.length
    ? steps.map(step => `<tr><td class="data-content">${escapeHtml(step)}</td></tr>`).join("")
    : "<tr><td class='muted'>No test steps returned.</td></tr>";
}

async function fetchUatIssue() {
  const issueKey = normalizeUatIssueKey(el.uatIssueInput.value);
  if (!issueKey) {
    showUatError("Enter a Jira issue key first.");
    return;
  }
  el.uatFetchBtn.disabled = true;
  hideUatError();
  updateUatStatus("Loading test details...", "");
  try {
    const targetUrl = buildUatRequestUrl(issueKey);
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: { "content-type": "application/json" }
    });
    if (!response.ok) throw new Error("Server returned error: " + response.status);
    const data = await response.json().catch(() => ({}));
    renderUatData(data, issueKey);
    updateUatStatus(`Loaded UAT details for ${issueKey}.`, "ok");
  } catch (err) {
    updateUatStatus(String(err?.message || err), "error");
    showUatError(String(err?.message || err).includes("fetch") ? "Connection error. Check the UAT API URL in Jira Settings." : String(err?.message || err));
  } finally {
    el.uatFetchBtn.disabled = false;
  }
}

async function copyUatConfluenceTable() {
  if (!currentUatData || !currentUatIssueKey) return;
  const requirements = normalizeUatRequirements(currentUatData.requirements_covered);
  const steps = normalizeUatSteps(currentUatData.test_steps);
  const rows = [
    ["Issue Key", currentUatIssueKey],
    ["Issue Summary", String(currentUatData.issue_summary || "No Summary")],
    ["Test Case Name", String(currentUatData.test_case_name || "N/A")],
    ["Test Purpose", String(currentUatData.test_purpose || "N/A")],
    ["Requirements Covered", requirements.length ? requirements.join("<br>") : "N/A"],
    ["Input Test Data", escapeHtml(String(currentUatData.input_test_data || "N/A")).replaceAll("\n", "<br>")],
    ["Execution Steps", steps.length ? steps.map(step => escapeHtml(step)).join("<br><br>") : "N/A"]
  ];
  const html = `<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${value}</td></tr>`).join("")}</tbody></table>`;
  const text = rows.map(([label, value]) => `${label}\t${String(value).replaceAll("<br>", " | ").replace(/<[^>]+>/g, "")}`).join("\n");
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" })
    });
    await navigator.clipboard.write([item]);
  } else {
    await navigator.clipboard.writeText(text);
  }
  updateUatStatus("Confluence table copied.", "ok");
}

async function copyUatIssueLink() {
  const issueUrl = String(el.uatIssueUrl?.href || "").trim();
  if (!issueUrl || issueUrl === "#") return;
  await navigator.clipboard.writeText(issueUrl);
  updateUatStatus("Jira link copied.", "ok");
}

function openPbiCreatorDialog() {
  renderPbiHistory();
  if (!el.pbiInput.value.trim()) el.pbiInput.value = "";
  if (!currentPbiDraftFields) resetPbiDraftEditor();
  updatePbiStatus(getPbiDraftUrl()
    ? "Draft endpoint loaded from Jira Settings."
    : "Open Jira Settings and add the PBI Draft API endpoint before generating a draft.");
  el.pbiDialog.showModal();
}

async function fetchPbiDraft(payloadObject) {
  const targetUrl = buildPbiDraftRequestUrl();
  el.pbiDebugRequest.textContent = JSON.stringify(payloadObject, null, 2);
  el.pbiDebugResponse.textContent = `Sending to: ${targetUrl} ...`;
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadObject)
  });
  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    data = { rawText };
  }
  el.pbiDebugResponse.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (!response.ok) {
    throw new Error(String(data?.error || data?.message || rawText || `HTTP ${response.status}`));
  }
  return data;
}

function coercePbiDraftFields(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      return { summary: "", description: raw };
    }
  }
  return { summary: "", description: "" };
}

function extractPbiDraftFields(responseData) {
  const jsonCode = responseData?.JSONCode;
  if (jsonCode !== undefined && jsonCode !== null && jsonCode !== "") {
    return coercePbiDraftFields(jsonCode);
  }
  if (responseData?.fields && typeof responseData.fields === "object" && !Array.isArray(responseData.fields)) {
    return coercePbiDraftFields(responseData.fields);
  }
  return {
    summary: String(responseData?.summary || "").trim(),
    description: String(responseData?.description || responseData?.body || responseData?.rawText || "").trim()
  };
}

function normalizePbiIssueType(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const exact = PBI_ISSUE_TYPE_OPTIONS.find(option => option.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const normalized = raw.toLowerCase();
  if (normalized.includes("bug")) return "Bug";
  if (normalized.includes("enhancement")) return "Story";
  if (normalized.includes("story")) return "Story";
  if (normalized.includes("epic")) return "Epic";
  if (normalized.includes("support")) return "Support";
  if (normalized.includes("discovery")) return "Discovery";
  if (normalized.includes("kaizen")) return "Kaizen";
  if (normalized.includes("planning")) return "Planning";
  if (normalized.includes("sre task")) return "SRE Task";
  if (normalized.includes("marval call")) return "Marval Call";
  if (normalized.includes("technical governance")) return "Technical Governance";
  if (normalized.includes("impediment")) return "Impediment";
  if (normalized.includes("buffer")) return "Buffer";
  if (normalized.includes("task")) return "Task";
  return raw;
}

function pbiFieldKeysForIssueType(issueType) {
  const normalized = normalizePbiIssueType(issueType).toLowerCase();
  if (normalized === "bug") return ["summary", "description", "priority", "module_or_screen", "steps_to_reproduce", "expected_behavior"];
  if (normalized === "story") return ["summary", "description", "priority", "actor", "use_case_goal", "acceptance_criteria"];
  if (normalized === "task") return ["summary", "description", "priority", "outcome"];
  return ["summary", "description", "priority"];
}

function buildPbiIssueTypeSelect(selectedIssueType) {
  const wrap = document.createElement("label");
  wrap.className = "pbi-field";
  wrap.textContent = "Issue Type";
  const select = document.createElement("select");
  select.name = "issueType";
  select.className = "form-control";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose issue type";
  select.appendChild(placeholder);
  PBI_ISSUE_TYPE_OPTIONS.forEach(option => {
    const item = document.createElement("option");
    item.value = option;
    item.textContent = option;
    if (option === selectedIssueType) item.selected = true;
    select.appendChild(item);
  });
  wrap.appendChild(select);
  return wrap;
}

function pbiFieldLabel(key) {
  return String(key || "").replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function createPbiField(key, value) {
  const wrap = document.createElement("label");
  wrap.className = "pbi-field";
  wrap.textContent = pbiFieldLabel(key);
  const fieldValue = key === "priority" ? (jiraDetailText(value) || "Medium") : value;
  if (key === "priority") {
    const select = document.createElement("select");
    select.name = key;
    select.className = "form-control";
    ["Highest", "High", "Medium", "Low", "Lowest"].forEach(optionValue => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      option.selected = optionValue.toLowerCase() === String(fieldValue).toLowerCase();
      select.appendChild(option);
    });
    wrap.appendChild(select);
    return wrap;
  }
  const useTextarea = Array.isArray(fieldValue) || typeof fieldValue === "object" || String(fieldValue || "").includes("\n") || String(fieldValue || "").length > 160 || key === "description" || key === "steps_to_reproduce" || key === "expected_behavior" || key === "acceptance_criteria" || key === "outcome";
  const input = document.createElement(useTextarea ? "textarea" : "input");
  input.name = key;
  input.className = "form-control";
  if (useTextarea) {
    input.rows = Array.isArray(fieldValue) ? Math.min(Math.max(fieldValue.length + 1, 4), 8) : 4;
    input.value = Array.isArray(fieldValue) ? fieldValue.join("\n") : (typeof fieldValue === "object" && fieldValue !== null ? JSON.stringify(fieldValue, null, 2) : String(fieldValue || ""));
    if (Array.isArray(fieldValue)) input.dataset.pbiArrayLines = "1";
    if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) input.dataset.pbiJsonObject = "1";
  } else {
    input.type = "text";
    input.value = String(fieldValue || "");
  }
  wrap.appendChild(input);
  return wrap;
}
function snapshotPbiVisibleFields() {
  if (!currentPbiDraftFields) return;
  const values = collectPbiDraftValues();
  delete values.issueType;
  currentPbiDraftFields = { ...currentPbiDraftFields, ...values };
}

function renderPbiDraftForm() {
  const values = coercePbiDraftFields(currentPbiDraftFields);
  const selectedIssueType = normalizePbiIssueType(currentPbiIssueType || currentPbiClassification);
  currentPbiIssueType = selectedIssueType;
  const orderedKeys = pbiFieldKeysForIssueType(selectedIssueType);
  el.pbiDynamicForm.innerHTML = "";
  el.pbiDynamicForm.appendChild(buildPbiIssueTypeSelect(selectedIssueType));
  orderedKeys.forEach(key => el.pbiDynamicForm.appendChild(createPbiField(key, values[key])));
  currentPbiDraftFields = values;
  el.pbiClassification.textContent = currentPbiClassification ? `AI: ${currentPbiClassification}` : "AI draft ready";
  el.pbiClassification.hidden = !currentPbiClassification;
  el.pbiEditorSection.hidden = false;
}

function collectPbiDraftValues() {
  const values = {};
  el.pbiDynamicForm.querySelectorAll("[name]").forEach(field => {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
    const key = String(field.name || "").trim();
    if (!key) return;
    const raw = String(field.value || "").trim();
    if (field.dataset.pbiArrayLines === "1") {
      values[key] = raw.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      return;
    }
    if (field.dataset.pbiJsonObject === "1") {
      if (!raw) {
        values[key] = {};
        return;
      }
      try {
        values[key] = JSON.parse(raw);
      } catch (_) {
        values[key] = raw;
      }
      return;
    }
    values[key] = raw;
  });
  return values;
}

async function analyzePbiDraft() {
  const description = String(el.pbiInput.value || "").trim();
  if (!description) {
    alert("Enter a description first.");
    return;
  }
  el.pbiAnalyzeBtn.disabled = true;
  el.pbiAnalyzeBtn.textContent = "Analyzing...";
  updatePbiStatus("Generating draft...", "");
  try {
    addPbiHistory(description);
    const responseData = await fetchPbiDraft({ body: description, accept: false });
    currentPbiClassification = String(responseData?.classification || responseData?.type || "").trim();
    currentPbiIssueType = normalizePbiIssueType(currentPbiClassification);
    currentPbiDraftFields = extractPbiDraftFields(responseData);
    renderPbiDraftForm();
    updatePbiStatus(currentPbiIssueType
      ? `Draft ready. Suggested issue type: ${currentPbiIssueType}.`
      : "Draft ready. Choose the issue type before creating the ticket.", "ok");
  } catch (err) {
    resetPbiDraftEditor();
    updatePbiStatus(String(err?.message || err), "error");
  } finally {
    el.pbiAnalyzeBtn.disabled = false;
    el.pbiAnalyzeBtn.textContent = "Analyze & Generate Draft";
  }
}

async function submitPbiDraft() {
  if (!currentPbiClassification) {
    if (!currentPbiDraftFields) {
      alert("Generate a draft first.");
      return;
    }
  }
  snapshotPbiVisibleFields();
  const issueType = normalizePbiIssueType(el.pbiDynamicForm.querySelector('[name="issueType"]')?.value || currentPbiIssueType);
  if (!issueType) {
    alert("Choose the Jira issue type first.");
    return;
  }
  const fields = collectPbiDraftValues();
  delete fields.issueType;
  if (!String(fields.summary || "").trim()) {
    alert("Summary is required.");
    return;
  }
  el.pbiSubmitBtn.disabled = true;
  el.pbiSubmitBtn.textContent = "Creating...";
  currentPbiIssueType = issueType;
  currentPbiDraftFields = { ...currentPbiDraftFields, ...fields };
  const requestPayload = {
    body: String(el.pbiInput.value || "").trim(),
    classification: currentPbiClassification,
    issueType,
    fields: currentPbiDraftFields
  };
  el.pbiDebugRequest.textContent = JSON.stringify(requestPayload, null, 2);
  el.pbiDebugResponse.textContent = "Creating Jira issue through worker...";
  updatePbiStatus("Creating Jira issue...", "");
  try {
    const result = await jiraWorkerFetch("/jira/pbi-create", requestPayload);
    el.pbiDebugResponse.textContent = JSON.stringify(result, null, 2);
    updatePbiStatus(result?.key ? `Created ${result.key}.` : "Ticket created.", "ok");
  } catch (err) {
    el.pbiDebugResponse.textContent = JSON.stringify({ error: String(err?.message || err) }, null, 2);
    updatePbiStatus(String(err?.message || err), "error");
  } finally {
    el.pbiSubmitBtn.disabled = false;
    el.pbiSubmitBtn.textContent = "Confirm & Create Ticket";
  }
}

function formatExportDate(ds) {
  const [y, m, d] = String(ds || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(ds || "");
}

function formatDisplayDate(ds) {
  const [y, m, d] = String(ds || "").slice(0, 10).split("-");
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || !month || !day) return String(ds || "");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1] || String(m).padStart(2, "0")} ${year}`;
}

function effortPointsLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const points = Math.round((minutes / 90) * 100) / 100;
  return Number.isInteger(points) ? String(points) : String(points).replace(/\.?0+$/, "");
}

function issueWorkDescription(entry) {
  const task = String(entry?.task || "").trim();
  const note = String(entry?.note || "").replaceAll("\n", " ").trim();
  if (task && note) return `${task} - ${note}`;
  return task || note;
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
function localDateKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}
function localDateTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${localDateKey(date)} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
function beginDragSelectionGuard() {
  document.body.classList.add("is-dragging");
}
function endDragSelectionGuard() {
  document.body.classList.remove("is-dragging");
}
function wireDragSelectionGuard() {
  if (dragSelectionGuardWired) return;
  dragSelectionGuardWired = true;
  window.addEventListener("mouseup", () => {
    if (dragState?.ghost?.parentElement) dragState.ghost.remove();
    dragState = null;
    endDragSelectionGuard();
  });
  document.addEventListener("selectstart", event => {
    if (!dragState) return;
    event.preventDefault();
  });
}
function selectedTodoDate() {
  return String(el.dayPicker?.value || localDateKey()).slice(0, 10);
}
function todoIsLocked(todo) {
  return !!todo?.done && !!todo?.completedDate && todo.completedDate !== localDateKey();
}
function todoCanChange(todo) {
  return !todoIsLocked(todo);
}
function todoMatchesSelectedFinishedDate(todo, date = selectedTodoDate()) {
  return !!todo?.done && !!todo.completedDate && todo.completedDate === date;
}
function normalizeTodoPriority(value) { return TODO_PRIORITIES.includes(String(value || "").trim()) ? String(value).trim() : "Medium"; }
function todoPriorityRank(todo) { return TODO_PRIORITY_RANK[normalizeTodoPriority(todo?.priority)] ?? TODO_PRIORITY_RANK.Medium; }
function todoAgeDays(todo) { const time = Date.parse(todo?.createdAt || ""); return Number.isFinite(time) ? Math.min(7, Math.max(0, (Date.now() - time) / 86400000)) : 0; }
function todoPriorityStyle(todo) { const base = TODO_PRIORITY_RGB[normalizeTodoPriority(todo?.priority)]; const lightness = Math.max(0, 0.78 - (todoAgeDays(todo) / 7) * 0.78); const rgb = base.map(channel => Math.round(channel + (255 - channel) * lightness)); return "--todo-priority-color: rgb(" + rgb.join(",") + ")"; }
function sortedTodos(items) { return [...items].sort((a, b) => todoPriorityRank(a) - todoPriorityRank(b) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))); }
function todoPriorityLabel(todo) { return normalizeTodoPriority(todo?.priority); }
function normalizeTodos(items) {
  return Array.isArray(items)
    ? items.filter(item => item && typeof item.text === "string" && item.text.trim()).map(item => ({
        id: String(item.id || crypto.randomUUID()),
        text: item.text.trim(),
        done: !!item.done,
        jiraIssue: String(item.jiraIssue || "").trim().toUpperCase(),
        priority: normalizeTodoPriority(item.priority),
        createdAt: String(item.createdAt || item.addedAt || ""),
        completedAt: item.done ? String(item.completedAt || item.finishedAt || item.closedAt || new Date().toISOString()) : "",
        completedDate: item.done ? String(item.completedDate || item.finishedDate || item.closedDate || localDateKey(item.completedAt || item.finishedAt || item.closedAt || new Date())).slice(0, 10) : ""
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
  const addButton = document.getElementById("todo-add-button");
  const addDialog = document.getElementById("todo-add-dialog");
  const addCancel = document.getElementById("todo-add-cancel");
  const search = document.getElementById("todo-search");
  const progress = document.getElementById("todo-progress-bar");
  const finishedSection = document.getElementById("todo-finished-section");
  const finishedTitle = document.getElementById("todo-finished-title");
  const finishedList = document.getElementById("todo-finished-list");
  if (!list) return;
  const query = String(todoSearchQuery || "").trim().toLowerCase();
  const matchesSearch = todo => !query || [todo.text, todo.jiraIssue].some(value => String(value || "").toLowerCase().includes(query));
  const visibleOpen = sortedTodos(todos.filter(todo => !todo.done && matchesSearch(todo)));
  const visibleFinished = sortedTodos(todos.filter(todo => todoMatchesSelectedFinishedDate(todo) && matchesSearch(todo)));
  const remaining = visibleOpen.length;
  const completed = todos.filter(todo => todo.done).length;
  const viewingToday = selectedTodoDate() === localDateKey();
  count.textContent = viewingToday ? `${remaining} left` : `${visibleFinished.length} finished`;
  empty.hidden = visibleOpen.length > 0 || visibleFinished.length > 0;
  clear.hidden = true;
  progress.style.width = todos.length ? `${Math.round((completed / todos.length) * 100)}%` : "0%";
  list.innerHTML = visibleOpen.map(todo => `
    <li class="todo-item" style="${todoPriorityStyle(todo)}">
      <label class="todo-check-label"><input type="checkbox" data-todo-action="toggle" data-todo-id="${todo.id}"><span class="todo-checkbox" aria-hidden="true">✓</span><span class="todo-text-wrap"><span class="todo-text">${escapeHtml(todo.text)}${todo.jiraIssue ? ` <span class="badge todo-jira" data-jira-issue="${escapeHtml(todo.jiraIssue)}">${escapeHtml(todo.jiraIssue)}</span>` : ""}</span>${todo.createdAt ? `<span class="todo-meta">Added ${escapeHtml(localDateTimeLabel(todo.createdAt))}</span>` : ""}</span></label>
      <button class="todo-edit" type="button" data-todo-action="edit" data-todo-id="${todo.id}" aria-label="Edit todo">✎</button><button class="todo-delete" type="button" data-todo-action="delete" data-todo-id="${todo.id}" aria-label="Delete todo">×</button>
    </li>`).join("");
  if (finishedList && finishedSection && finishedTitle) {
    finishedTitle.textContent = `Finished on ${selectedTodoDate()}`;
    finishedSection.hidden = visibleFinished.length === 0;
    finishedList.innerHTML = visibleFinished.map(todo => {
      const locked = todoIsLocked(todo);
      const canUndo = !locked;
      return `<li class="todo-item done${locked ? " locked" : ""}" style="${todoPriorityStyle(todo)}">
        <label class="todo-check-label">${canUndo ? `<input type="checkbox" data-todo-action="toggle" data-todo-id="${todo.id}" checked>` : ""}<span class="todo-checkbox" aria-hidden="true">✓</span><span class="todo-text-wrap"><span class="todo-text">${escapeHtml(todo.text)}${todo.jiraIssue ? ` <span class="badge todo-jira" data-jira-issue="${escapeHtml(todo.jiraIssue)}">${escapeHtml(todo.jiraIssue)}</span>` : ""}</span>${todo.createdAt ? `<span class="todo-meta">Added ${escapeHtml(localDateTimeLabel(todo.createdAt))}</span>` : ""}<span class="todo-meta">Finished ${escapeHtml(localDateTimeLabel(todo.completedAt || todo.completedDate))}${locked ? " · locked" : " · can undo today"}</span></span></label>
      </li>`;
    }).join("");
  }
}
function openTodoEditDialog(todo) {
  if (!todo || !todoCanChange(todo)) return;
  todoBeingEdited = todo;
  el.todoEditId.value = todo.id;
  el.todoEditText.value = todo.text || "";
  el.todoEditJira.value = todo.jiraIssue || "";
  el.todoEditPriority.value = normalizeTodoPriority(todo.priority);
  el.todoEditDialog.showModal();
}

function wireTodoEvents() {
  const form = document.getElementById("todo-add-form");
  const input = document.getElementById("todo-input");
  const jiraInput = document.getElementById("todo-jira");
  const priorityInput = document.getElementById("todo-priority");
  const list = document.getElementById("todo-list");
  const finishedList = document.getElementById("todo-finished-list");
  const clear = document.getElementById("todo-clear");
  const addButton = document.getElementById("todo-add-button");
  const addDialog = document.getElementById("todo-add-dialog");
  const addCancel = document.getElementById("todo-add-cancel");
  const search = document.getElementById("todo-search");
  const handleTodoToggle = event => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement) || control.dataset.todoAction !== "toggle") return;
    const id = control.dataset.todoId;
    const todo = todos.find(item => item.id === id);
    if (!todo || !todoCanChange(todo)) return;
    if (control.checked) {
      todo.done = true;
      todo.completedAt = new Date().toISOString();
      todo.completedDate = localDateKey();
    } else {
      todo.done = false;
      todo.completedAt = "";
      todo.completedDate = "";
    }
    saveTodos(); renderTodos();
  };
  addButton?.addEventListener("click", () => { addDialog?.showModal(); input?.focus(); });
  addCancel?.addEventListener("click", () => addDialog?.close());
  form.addEventListener("submit", event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const jiraIssue = String(jiraInput?.value || "").trim().toUpperCase();
    todos.unshift({ id: crypto.randomUUID(), text, jiraIssue, priority: normalizeTodoPriority(priorityInput?.value), done: false, createdAt: new Date().toISOString(), completedAt: "", completedDate: "" });
    input.value = "";
    if (jiraInput) jiraInput.value = "";
    if (priorityInput) priorityInput.value = "Medium";
    saveTodos(); renderTodos();
  });
  list.addEventListener("change", handleTodoToggle);
  finishedList?.addEventListener("change", handleTodoToggle);
  list.addEventListener("click", event => {
    const control = event.target.closest("[data-todo-action]");
    if (!control) return;
    if (control.dataset.todoAction === "toggle") return;
    const id = control.dataset.todoId;
    if (control.dataset.todoAction === "edit") {
      const todo = todos.find(item => item.id === id);
      if (!todo) return;
      openTodoEditDialog(todo);
      return;
    }
    const todo = todos.find(item => item.id === id);
    if (!todo || !todoCanChange(todo)) return;
    if (control.dataset.todoAction === "delete") todos = todos.filter(item => item.id !== id);
    saveTodos(); renderTodos();
  });
  search?.addEventListener("input", event => { todoSearchQuery = String(event.target.value || ""); renderTodos(); });
  clear.addEventListener("click", () => { renderTodos(); });
  el.todoEditCancel.addEventListener("click", () => {
    todoBeingEdited = null;
    el.todoEditDialog.close();
  });
  el.todoEditForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!todoBeingEdited || !todoCanChange(todoBeingEdited)) return;
    const text = el.todoEditText.value.trim();
    if (!text) return;
    todoBeingEdited.text = text;
    todoBeingEdited.jiraIssue = el.todoEditJira.value.trim().toUpperCase();
    todoBeingEdited.priority = normalizeTodoPriority(el.todoEditPriority.value);
    saveTodos(); renderTodos();
    todoBeingEdited = null;
    el.todoEditDialog.close();
  });
  list.addEventListener("contextmenu", event => {
    const issue = event.target.closest("[data-jira-issue]")?.dataset.jiraIssue;
    if (!issue) return;
    event.preventDefault();
    event.stopPropagation();
    showJiraContextMenu(issue, event.clientX, event.clientY);
  });
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
  if (t.includes("impediment")) return "#f97316";
  if (t.includes("buffer")) return "#6b7280";
  if (t.includes("support")) return "#ef4444";
  if (t.includes("discovery")) return "#eab308";
  if (t.includes("kaizen")) return "#22c55e";
  if (t.includes("epic")) return "#a855f7";
  if (t.includes("planning")) return "#2563eb";
  if (t.includes("sre task")) return "#84cc16";
  if (t.includes("marval call")) return "#facc15";
  if (t.includes("technical governance")) return "#06b6d4";
  if (t.includes("task") || t.includes("sub-task")) return "#60a5fa";
  if (t.includes("incident")) return "#ef4444";
  return "#4f8cff";
}

function sprintIssueColor(issueKey) {
  const key = String(issueKey || "").trim().toUpperCase();
  if (!key || key === "UNLINKED") return "#6b7280";
  return issueTypeColor({ jiraIssue: key });
}

function allowBrowserContextMenu(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest("#day-grid") && !target.closest(".day-block, .work-band");
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
  });
  const selectedDate = el.dayPicker.value;
  allEntries.filter(e => e.date === selectedDate && isBackgroundSlot(e)).forEach(e => {
    const dur = e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0;
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

function jiraIssueMatchesDropdownSearch(issue, query) {
  const text = [issue.key, issue.summary, jiraIssueStatus(issue)].join(" ").toLowerCase();
  return !query || text.includes(query.toLowerCase());
}

function initJiraIssueSelect() {
  const $ = window.jQuery;
  if (!$ || !$.fn?.select2 || !el.jiraSelect) return;
  const select = $(el.jiraSelect);
  if (!select.hasClass("select2-hidden-accessible")) {
    select.select2({
      width: "100%",
      dropdownParent: $(el.dialog),
      placeholder: "Pick from current sprint",
      allowClear: true,
      dropdownAutoWidth: true,
      matcher: (params, data) => {
        const term = String(params.term || "").trim().toLowerCase();
        if (!term) return data;
        const issue = jiraIssueCache.find(item => item.key === data.id);
        const haystack = [data.text, issue?.key, issue?.summary, jiraIssueStatus(issue)].join(" ").toLowerCase();
        return haystack.includes(term) ? data : null;
      }
    });
  }
}

function setJiraIssueSelectValue(issueKey) {
  if (!el.jiraSelect) return;
  const key = String(issueKey || "").trim().toUpperCase();
  if (key && !Array.from(el.jiraSelect.options).some(option => option.value === key)) {
    const issue = jiraIssueCache.find(item => String(item?.key || "").trim().toUpperCase() === key);
    const option = document.createElement("option");
    option.value = key;
    option.textContent = issue ? key + " - " + (issue.summary || "").slice(0, 80) : key;
    el.jiraSelect.appendChild(option);
  }
  el.jiraSelect.value = key;
  initJiraIssueSelect();
  if (window.jQuery && window.jQuery.fn?.select2) window.jQuery(el.jiraSelect).trigger("change");
}
function updateJiraDropdown() {
  if (!el.jiraSelect) return;
  const cur = el.jiraSelect.value;
  el.jiraSelect.innerHTML = '<option value="">Pick from current sprint</option>';
  sortedCurrentSprintIssues().forEach(issue => {
    const option = document.createElement("option");
    option.value = issue.key;
    const status = jiraIssueStatus(issue);
    option.textContent = issue.key + " - " + (issue.summary || "").slice(0, 80) + (status ? " [" + status + "]" : "");
    el.jiraSelect.appendChild(option);
  });
  el.jiraSelect.value = cur;
  initJiraIssueSelect();
  if (window.jQuery && window.jQuery.fn?.select2) window.jQuery(el.jiraSelect).trigger("change");
  renderCurrentSprintIssues();
}
function jiraIssueStatus(issue) {
  const status = issue?.status ?? issue?.statusName ?? issue?.status_name ?? issue?.issueStatus ?? issue?.state ?? issue?.fields?.status;
  return String(status?.name || status?.value || status || "Status unavailable").trim();
}

function sprintIssueStatusRank(issue) {
  const status = jiraIssueStatus(issue).trim().toLowerCase();
  if (status.includes("in progress")) return 0;
  if (status === "to do" || status.includes("todo")) return 1;
  if (status.includes("qa testing") || status.includes("qa") || status.includes("testing")) return 2;
  if (status === "done" || status.includes("done")) return 3;
  return 4;
}

function sortedCurrentSprintIssues() {
  return [...jiraIssueCache].sort((a, b) => {
    const rankDiff = sprintIssueStatusRank(a) - sprintIssueStatusRank(b);
    if (rankDiff !== 0) return rankDiff;
    const statusDiff = jiraIssueStatus(a).localeCompare(jiraIssueStatus(b));
    if (statusDiff !== 0) return statusDiff;
    return String(a.key || "").localeCompare(String(b.key || ""));
  });
}

function jiraIssueStoryPoints(issue) {
  const fieldId = String(userJiraSettings.storyPointsFieldId || "").trim();
  if (!fieldId) return "";
  const fields = issue?.fields || {};
  const value = issue?.storyPoints ?? fields[fieldId];
  if (value && typeof value === "object") return String(value.value ?? value.name ?? "").trim();
  return value === null || value === undefined ? "" : String(value).trim();
}
function normalizeJiraIssue(issue) {
  const fields = issue?.fields || {};
  return {
    ...issue,
    key: String(issue?.key || "").trim().toUpperCase(),
    summary: String(issue?.summary || fields.summary || "").trim(),
    issuetype: String(issue?.issuetype?.name || issue?.issuetype || fields.issuetype?.name || fields.issuetype || "").trim(),
    status: jiraIssueStatus(issue),
    storyPoints: jiraIssueStoryPoints(issue)
  };
}

function fallbackIssueSummary(issueKey, rows = []) {
  const key = String(issueKey || "").trim().toUpperCase();
  for (const row of rows) {
    const task = String(row?.task || "").trim();
    if (!task) continue;
    const normalizedTask = task.toUpperCase();
    if (normalizedTask === key) continue;
    const prefixMatch = task.match(new RegExp(`^${key}\\s*[:\\-]\\s*(.+)$`, "i"));
    if (prefixMatch?.[1]?.trim()) return prefixMatch[1].trim();
    return task;
  }
  return "";
}

async function ensureJiraIssueCached(issueKey) {
  const key = String(issueKey || "").trim().toUpperCase();
  if (!key || key === "UNLINKED" || jiraIssueLookupPending.has(key)) return;
  if (Object.prototype.hasOwnProperty.call(jiraIssueSummaryByKey, key) || !currentUser) return;
  jiraIssueLookupPending.add(key);
  try {
    const data = await jiraWorkerFetch("/jira/issue?key=" + encodeURIComponent(key), { key });
    const issue = normalizeJiraIssue(data.issue || { key });
    if (issue.key) {
      jiraIssueSummaryByKey[issue.key] = String(issue.summary || "").trim();
      jiraIssueTypeByKey[issue.key] = String(issue.issuetype || "");
    }
  } catch (_) {
    jiraIssueSummaryByKey[key] = "";
  } finally {
    jiraIssueLookupPending.delete(key);
    if (currentView === "sprint") renderSprintView();
  }
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
  el.sprintIssuesList.innerHTML = sortedCurrentSprintIssues().map(issue => `
    <button type="button" class="sprint-issue-item" data-jira-issue="${escapeHtml(issue.key)}" style="--issue-accent:${issueTypeColor({ jiraIssue: issue.key })}">
      <span class="badge">${escapeHtml(issue.key)}</span>
      <span class="sprint-issue-copy"><span>${escapeHtml(issue.summary || "Summary unavailable")}</span><span class="jira-issue-meta"><span class="jira-status">${escapeHtml(jiraIssueStatus(issue))}</span>${jiraIssueStoryPoints(issue) ? `<span class="jira-story-points">SP ${escapeHtml(jiraIssueStoryPoints(issue))}</span>` : ""}</span></span>
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
  const selectedJiraIssue = editing ? (entry.jiraIssue || "") : (preset.jiraIssue || "");
  el.jira.value = selectedJiraIssue;
  setJiraIssueSelectValue(selectedJiraIssue);
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

function dayGridRangeMinutes(entries, date = el.dayPicker.value) {
  const dayEntries = [...entries, ...allEntries.filter(e => e.date === date && isBackgroundSlot(e))];
  let latestMinute = DAY_END_DEFAULT_MINUTES;
  dayEntries.forEach(entry => {
    const startMinute = entry.start ? mins(entry.start) : null;
    const endMinute = entry.end ? mins(entry.end) : null;
    if (Number.isFinite(startMinute)) latestMinute = Math.max(latestMinute, startMinute + 30);
    if (Number.isFinite(endMinute)) latestMinute = Math.max(latestMinute, endMinute);
  });
  const endMinutes = Math.max(DAY_END_DEFAULT_MINUTES, ceilToStep(latestMinute, 30));
  return { startMinutes: DAY_START_MINUTES, endMinutes };
}

function buildDayGrid(entries) {
  const grid = document.createElement("div");
  grid.className = "day-grid";
  grid.id = "day-grid";
  grid.style.height = `${DAY_GRID_HEIGHT}px`;
  const { startMinutes, endMinutes } = dayGridRangeMinutes(entries, el.dayPicker.value);
  const totalMinutes = endMinutes - startMinutes;
  for (let marker = startMinutes; marker <= endMinutes; marker += 60) {
    const y = ((marker - startMinutes) / totalMinutes) * DAY_GRID_HEIGHT;
    const line = document.createElement("div");
    line.className = "hour-line";
    line.style.top = `${y}px`;
    grid.appendChild(line);
    const label = document.createElement("div");
    label.className = "hour-label";
    label.style.top = `${y}px`;
    label.textContent = minToTime(marker);
    grid.appendChild(label);
  }
  const slotEntries = allEntries.filter(e => e.date === el.dayPicker.value && isBackgroundSlot(e));
  slotEntries.forEach(slot => {
    if (!slot.start || !slot.end) return;
    const start = mins(slot.start);
    const end = mins(slot.end);
    if (!(end > start)) return;
    const cs = Math.max(start, startMinutes);
    const ce = Math.min(end, endMinutes);
    if (ce <= cs) return;
    const band = document.createElement("div");
    band.className = `work-band ${slot.isOvertime || slot.tag === "overtime" ? "overtime" : "normal"}`;
    band.style.top = `${((cs - startMinutes) / totalMinutes) * DAY_GRID_HEIGHT}px`;
    band.style.height = `${Math.max(8, ((ce - cs) / totalMinutes) * DAY_GRID_HEIGHT)}px`;
    band.dataset.id = slot.id;
    band.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const entry = allEntries.find(x => x.id === slot.id);
      if (entry) openEditor(entry);
    });
    band.addEventListener("mousedown", ev => {
      if (ev.button === 2) {
        ev.stopPropagation();
      }
    });
    grid.appendChild(band);
  });

  entries.forEach(e => {
    if (!e.start) return;
    const start = mins(e.start);
    if (start < startMinutes || start > endMinutes) return;
    const end = e.end ? mins(e.end) : Math.min(start + 30, endMinutes);
    const top = ((start - startMinutes) / totalMinutes) * DAY_GRID_HEIGHT;
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
    const target = ev.target;
    const targetElement = target instanceof Element ? target : null;
    const dayBlock = targetElement?.closest(".day-block");
    const workBand = targetElement?.closest(".work-band");
    if (dayBlock) return;
    if (workBand && ev.button === 2) return;
    ev.preventDefault();
    if (ev.button === 2) {
      ev.preventDefault();
      suppressContextMenuUntil = Date.now() + 1200;
    }
    const rect = grid.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    const ghost = document.createElement("div");
    ghost.className = `drag-ghost${ev.button === 2 ? " work" : ""}`;
    ghost.style.top = `${y}px`;
    ghost.style.height = "2px";
    grid.appendChild(ghost);
    beginDragSelectionGuard();
    dragState = { startY: y, mode: ev.button === 2 ? "work" : "task", ghost };
  });

  grid.addEventListener("mousemove", ev => {
    if (!dragState?.ghost) return;
    ev.preventDefault();
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
    endDragSelectionGuard();
    const rect = grid.getBoundingClientRect();
    const endY = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    const lo = Math.min(dragState.startY, endY);
    const hi = Math.max(dragState.startY, endY);
    if (dragState.ghost && dragState.ghost.parentElement) dragState.ghost.remove();
    const mode = dragState.mode;
    dragState = null;
    if (hi - lo < 10) return;
    const startMin = startMinutes + Math.round((lo / rect.height) * totalMinutes / 15) * 15;
    const endMin = startMinutes + Math.round((hi / rect.height) * totalMinutes / 15) * 15;
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

  grid.addEventListener("contextmenu", ev => {
    const target = ev.target instanceof Element ? ev.target : null;
    if (target?.closest(".day-block, .work-band")) return;
    ev.preventDefault();
    ev.stopPropagation();
  });

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
  const openIssues = new Set(
    [...el.sprintView.querySelectorAll("details[data-sprint-issue][open]")]
      .map(node => node.dataset.sprintIssue)
      .filter(Boolean)
  );
  const selection = resolveSprintSelection();
  if (!selection.sprint) {
    el.sprintView.innerHTML = "<div class='muted'>No Jira sprint data available.</div>";
    return;
  }
  const entries = selectedSprintEntries();
  const sprintTotalMinutes = entries.reduce((sum, entry) => sum + (entry.end ? Math.max(0, mins(entry.end) - mins(entry.start)) : 0), 0);
  const sprintTotalPoints = effortPointsLabel(sprintTotalMinutes);
  const selectionLabel = selection.mode === "manual"
    ? "Manual selection"
    : (selection.mode === "auto-date" ? `Auto matched ${selection.anchorDate}` : `Auto fallback from ${selection.anchorDate}`);
  const sprintHeader = `<article class='block' style='border-left-color:var(--ok)'><div class='head'><div class='task'>${escapeHtml(selection.sprint.name)}</div><div class='meta'>${selection.sprint.start} → ${selection.sprint.end}</div></div><div class='meta' style='margin-top:6px'>${selectionLabel}</div><div class='meta' style='margin-top:6px'>Sprint total: ${durLabel(sprintTotalMinutes)}${sprintTotalPoints ? ` (${sprintTotalPoints} pt)` : ""}</div></article>`;
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
      if (issue !== "UNLINKED" && !Object.prototype.hasOwnProperty.call(jiraIssueSummaryByKey, issue)) ensureJiraIssueCached(issue);
      const total = rows.reduce((s, e) => s + (e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0);
      const ot = rows.reduce((s, e) => s + ((e.isOvertime || e.tag === "overtime") && e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0), 0);
      const totalPoints = effortPointsLabel(total);
      const allLogged = rows.length > 0 && rows.every(r => !!r.jiraLogged);
      const summary = issue === "UNLINKED" ? "" : String(jiraIssueSummaryByKey[issue] || "").trim();
      const fallbackSummary = issue === "UNLINKED" ? "" : fallbackIssueSummary(issue, rows);
      const summaryLabel = issue === "UNLINKED"
        ? ""
        : (summary || fallbackSummary || (jiraIssueLookupPending.has(issue) ? "Loading Jira summary..." : "Summary unavailable"));
      const issueEffortLabel = totalPoints ? `${totalPoints} pt` : "";
      const issueTitle = issue === "UNLINKED"
        ? `<div class='sprint-issue-heading'><span class='badge warn'>Unlinked</span><span class='sprint-issue-summary'>No Jira issue linked</span>${issueEffortLabel ? `<span class='badge sprint-issue-effort'>${escapeHtml(issueEffortLabel)}</span>` : ""}</div>`
        : `<div class='sprint-issue-heading' data-jira-issue='${escapeHtml(issue)}'><span class='badge'>${escapeHtml(issue)}</span><span class='sprint-issue-summary'>${escapeHtml(summaryLabel)}</span>${issueEffortLabel ? `<span class='badge sprint-issue-effort'>${escapeHtml(issueEffortLabel)}</span>` : ""}</div>`;
      const openAttr = openIssues.has(issue) ? " open" : "";
      const cardClasses = `block sprint-issue-card${allLogged ? " is-fully-logged" : ""}`;
      const borderColor = sprintIssueColor(issue);
      const rowList = rows
        .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`))
        .map(r => {
          const minutes = r.end ? Math.max(0, mins(r.end) - mins(r.start)) : 0;
          const dur = r.end ? durLabel(minutes) : "Open";
          const points = effortPointsLabel(minutes);
          return `<div class='meta' style='padding:4px 0;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap'>
            <label class='inline' style='font-size:11px'><input type='checkbox' data-action='toggle-row-logged' data-id='${r.id}' ${r.jiraLogged ? "checked" : ""}>Logged</label>
            <span>${r.date} ${r.start}${r.end ? `-${r.end}` : ""} · ${dur}${points ? ` · ${points} pt` : ""} · ${escapeHtml(r.task)}</span>
            <button class='btn' data-action='edit' data-id='${r.id}'>Edit</button>
          </div>`;
        }).join("");
      return `<article class='${cardClasses}' style='border-left-color:${borderColor}'>
        <details data-sprint-issue='${escapeHtml(issue)}'${openAttr}>
          <summary class='head'><div class='task'>${issueTitle}</div><div class='meta'>${rows.length} blocks</div></summary>
          <div class='meta' style='margin-top:8px'>Total: ${durLabel(total)}${totalPoints ? ` (${totalPoints} pt)` : ""} | OT: ${durLabel(ot)}</div>
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
    internalHtml = `<article class='block sprint-issue-card sprint-internal-card' style='border-left-color:#6b7280'>
      <details data-sprint-issue='__internal__'${openIssues.has("__internal__") ? " open" : ""}>
        <summary class='head'><div class='task'><span class='badge warn'>No Jira / Internal</span></div><div class='meta'>${internalRows.length} blocks</div></summary>
        <div class='meta' style='margin-top:8px'>Total: ${durLabel(total)} | OT: ${durLabel(ot)}</div>
        <div class='actions'><button class='btn' data-action='copy-internal'>Copy Internal Rows</button></div>
        ${rowList}
      </details>
    </article>`;
  }

  el.sprintView.innerHTML = `${sprintHeader}${issueHtml}${internalHtml}`;
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
  renderTodos();
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
    jiraIssue: String(el.jiraSelect?.value || el.jira.value || "").trim().toUpperCase(),
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
  if (entry.jiraIssue && !entry.noJira) {
    if (!rawId) await moveNewBlockJiraIssueToInProgress(entry.jiraIssue);
    ensureJiraIssueCached(entry.jiraIssue);
  }
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

function jiraDetailText(value, depth = 0) {
  if (value === null || value === undefined || depth > 4) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(item => jiraDetailText(item, depth + 1)).filter(Boolean).join(", ");
  if (value.type === "doc" || value.type === "paragraph" || value.type === "bulletList" || value.type === "orderedList" || value.type === "listItem") {
    return (value.content || []).map(item => jiraDetailText(item, depth + 1)).filter(Boolean).join(value.type === "paragraph" ? "" : String.fromCharCode(10));
  }
  if (value.text) return String(value.text);
  if (value.displayName) return String(value.displayName);
  if (value.name) return String(value.name);
  if (value.value) return jiraDetailText(value.value, depth + 1);
  return Object.entries(value).map(([key, item]) => key + ": " + jiraDetailText(item, depth + 1)).filter(row => row.trim()).join(String.fromCharCode(10));
}

function jiraEditableText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(jiraEditableText).filter(Boolean).join(", ");
  if (typeof value === "object") return String(value.displayName || value.name || value.value || value.accountId || "");
  return String(value);
}

function jiraAdfFromText(text) {
  return { type: "doc", version: 1, content: String(text || "").split(String.fromCharCode(10)).map(line => ({
    type: "paragraph", content: line ? [{ type: "text", text: line }] : []
  })) };
}

function jiraAdfTableFromRows(headers, rows) {
  const cell = (type, value) => ({
    type,
    content: [{ type: "paragraph", content: [{ type: "text", text: String(value ?? "") }] }]
  });
  return {
    type: "doc",
    version: 1,
    content: [{
      type: "table",
      attrs: { isNumberColumnEnabled: false, layout: "default" },
      content: [
        { type: "tableRow", content: headers.map(header => cell("tableHeader", header)) },
        ...rows.map(row => ({ type: "tableRow", content: row.map(value => cell("tableCell", value)) }))
      ]
    }]
  };
}
function pbiJiraFieldSpecs(issue, editMeta = {}) {
  const type = normalizePbiIssueType(issue?.fields?.issuetype?.name || issue?.fields?.issuetype || issue?.issuetype).toLowerCase();
  const specs = [
    { key: "summary", jiraId: "summary", label: "Summary" },
    { key: "description", jiraId: "description", label: "Description" },
    { key: "priority", jiraId: "priority", label: "Priority" }
  ];
  const storyPointsFieldId = String(userJiraSettings.storyPointsFieldId || "").trim();
  if (storyPointsFieldId) specs.push({ key: "story_points", jiraId: storyPointsFieldId, label: "Story point estimate" });
  if (type === "bug") specs.push({ key: "module_or_screen", jiraId: "customfield_10086", label: "Module or screen" }, { key: "expected_behavior", jiraId: "customfield_10085", label: "Expected behavior" });
  if (type === "story") specs.push({ key: "actor", jiraId: "customfield_10081", label: "Actor" }, { key: "use_case_goal", jiraId: "customfield_10080", label: "Use case goal" }, { key: "acceptance_criteria", jiraId: "customfield_10083", label: "Acceptance criteria" });
  if (type === "task") specs.push({ key: "outcome", jiraId: "customfield_10121", label: "Outcome" });
  return specs;
}

function jiraFieldInput(fieldId, meta, currentValue, logicalKey = fieldId) {
  const value = jiraDetailText(currentValue);
  if (logicalKey === "story_points") return '<input type="number" min="0" step="0.5" data-jira-field="' + escapeHtml(fieldId) + '" data-jira-pbi-key="story_points" value="' + escapeHtml(value) + '">';
  if (logicalKey === "priority") return '<select data-jira-field="' + escapeHtml(fieldId) + '" data-jira-pbi-key="priority">' + ["Highest", "High", "Medium", "Low", "Lowest"].map(option => '<option value="' + option + '"' + (option.toLowerCase() === value.toLowerCase() ? " selected" : "") + '>' + option + '</option>').join("") + "</select>";
  const allowed = Array.isArray(meta?.allowedValues) ? meta.allowedValues : [];
  if (allowed.length) return '<select data-jira-field="' + escapeHtml(fieldId) + '" data-jira-pbi-key="' + escapeHtml(logicalKey) + '"><option value=""></option>' + allowed.map(item => { const optionValue = String(item.id || item.value || item.name || ""); const optionLabel = String(item.name || item.value || optionValue); return '<option value="' + escapeHtml(optionValue) + '"' + (optionValue === value || optionLabel === value ? " selected" : "") + '>' + escapeHtml(optionLabel) + "</option>"; }).join("") + "</select>";
  const multiline = ["description", "expected_behavior", "use_case_goal", "acceptance_criteria", "outcome"].includes(logicalKey);
  return multiline ? '<textarea data-jira-field="' + escapeHtml(fieldId) + '" data-jira-pbi-key="' + escapeHtml(logicalKey) + '" rows="4">' + escapeHtml(value) + "</textarea>" : '<input data-jira-field="' + escapeHtml(fieldId) + '" data-jira-pbi-key="' + escapeHtml(logicalKey) + '" value="' + escapeHtml(value) + '">';
}

function showJiraIssueDetails(issue, editMeta = {}) {
  jiraIssueDraft = issue;
  jiraIssueEditMeta = editMeta || {};
  const fields = issue.fields || {};
  const specs = pbiJiraFieldSpecs(issue, jiraIssueEditMeta);
  el.jiraIssueTitle.textContent = String(issue.key || "Jira Issue") + " · " + String(fields.summary || "");
  el.jiraIssueBody.innerHTML = specs.map(spec => {
    const meta = jiraIssueEditMeta[spec.jiraId];
    const value = jiraDetailText(fields[spec.jiraId]);
    const editable = !!meta && Array.isArray(meta.operations) && meta.operations.includes("set");
    const content = editable ? '<div class="jira-field-display">' + escapeHtml(value || "Not set") + '</div><button type="button" class="btn jira-edit-field" data-jira-edit-field="' + escapeHtml(spec.jiraId) + '" data-jira-pbi-key="' + escapeHtml(spec.key) + '">Edit</button>' : '<div class="jira-detail-value">' + escapeHtml(value || "Not set") + "</div>";
    return '<div class="jira-detail-row"><div class="jira-detail-label">' + escapeHtml(spec.label) + (editable ? ' <span class="jira-editable-label">editable</span>' : "") + "</div>" + content + "</div>";
  }).join("");
  el.jiraIssueSave.hidden = true;
  el.jiraIssueDialog.showModal();
}
async function viewJiraIssue(issueKey) {
  try {
    const results = await Promise.all([
      jiraWorkerFetch("/jira/issue?key=" + encodeURIComponent(issueKey), { key: issueKey }),
      jiraWorkerFetch("/jira/editmeta?key=" + encodeURIComponent(issueKey), { key: issueKey })
    ]);
    showJiraIssueDetails(results[0].issue || {}, results[1].fields || {});
  } catch (err) {
    alert("Could not load " + issueKey + ": " + String(err.message || err));
  }
}

async function saveJiraIssueChanges() {
  if (!jiraIssueDraft?.key) return;
  const fields = {};
  el.jiraIssueBody.querySelectorAll("[data-jira-field]").forEach(control => {
    const fieldId = control.dataset.jiraField;
    const logicalKey = control.dataset.jiraPbiKey || fieldId;
    const meta = jiraIssueEditMeta[fieldId] || {};
    const value = control.value.trim();
    if (logicalKey === "story_points") fields[fieldId] = value === "" ? null : Number(value);
    else if (logicalKey === "priority") fields[fieldId] = value ? { name: value } : null;
    else if (["description", "expected_behavior", "use_case_goal", "acceptance_criteria", "outcome"].includes(logicalKey)) fields[fieldId] = jiraAdfFromText(value);
    else if (String(meta.schema?.type || "").toLowerCase() === "array") fields[fieldId] = value ? value.split(",").map(item => item.trim()).filter(Boolean) : [];
    else fields[fieldId] = value || null;
  });
  if (!Object.keys(fields).length) return;
  try {
    await jiraWorkerFetch("/jira/update?key=" + encodeURIComponent(jiraIssueDraft.key), { key: jiraIssueDraft.key, fields });
    const refreshed = await jiraWorkerFetch("/jira/issue?key=" + encodeURIComponent(jiraIssueDraft.key), { key: jiraIssueDraft.key });
    showJiraIssueDetails(refreshed.issue || jiraIssueDraft, jiraIssueEditMeta);
    await fetchJiraIssues();
    alert("Jira issue updated.");
  } catch (err) {
    alert("Could not save Jira changes: " + String(err.message || err));
  }
}

function chooseJiraTransition(issueKey, transitions, currentStatus = "") {
  const current = String(currentStatus || "").trim().toLowerCase();
  const available = transitions.filter(item => {
    const destination = String(item.to || "").trim().toLowerCase();
    return destination && (!current || destination !== current);
  });
  if (!available.length) return Promise.resolve(null);
  return new Promise(resolve => {
    const dialog = el.jiraTransitionDialog;
    const options = el.jiraTransitionOptions;
    if (!dialog || !options) { resolve(null); return; }
    el.jiraTransitionTitle.textContent = "Move " + issueKey;
    el.jiraTransitionSubtitle.textContent = "Choose the destination status:";
    options.replaceChildren();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("cancel", onCancel);
      options.removeEventListener("click", onClick);
      el.jiraTransitionCancel.onclick = null;
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onCancel = event => { event.preventDefault(); finish(null); };
    const onClick = event => {
      const button = event.target.closest("[data-jira-transition-index]");
      if (!button) return;
      finish(available[Number(button.dataset.jiraTransitionIndex)] || null);
    };
    available.forEach((transition, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jira-transition-option";
      button.dataset.jiraTransitionIndex = String(index);
      const destination = String(transition.to || "Next status");
      const transitionName = String(transition.name || "").trim();
      button.innerHTML = "<strong></strong><span></span>";
      button.querySelector("strong").textContent = destination;
      button.querySelector("span").textContent = transitionName && transitionName.toLowerCase() !== destination.toLowerCase() ? " via " + transitionName : "";
      options.appendChild(button);
    });
    options.addEventListener("click", onClick);
    el.jiraTransitionCancel.onclick = () => finish(null);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });
}

async function addQaTestingMentionComment(issueKey) {
  try {
    await jiraWorkerFetch("/jira/comment?key=" + encodeURIComponent(issueKey), { key: issueKey, commentBody: await jiraScrumTeamCommentBody(), comment: "Scrum Team for QA Testing" });
    return true;
  } catch (err) {
    console.warn("Could not add Scrum Team QA testing comment to", issueKey, err);
    return false;
  }
}
async function moveJiraIssue(issueKey) {
  try {
    const [transitionData, issueData] = await Promise.all([
      jiraWorkerFetch("/jira/transitions?key=" + encodeURIComponent(issueKey), { key: issueKey }),
      jiraWorkerFetch("/jira/issue?key=" + encodeURIComponent(issueKey), { key: issueKey })
    ]);
    const transitions = transitionData.transitions || [];
    const currentStatus = issueData.issue?.fields?.status?.name || "";
    const available = transitions.filter(item => {
      const destination = String(item.to || "").trim().toLowerCase();
      return destination && (!currentStatus || destination !== String(currentStatus).trim().toLowerCase());
    });
    if (!available.length) return alert("No status changes are available for " + issueKey + ".");
    const transition = await chooseJiraTransition(issueKey, available, currentStatus);
    if (!transition) return;
    await jiraWorkerFetch("/jira/transition?key=" + encodeURIComponent(issueKey), {
      key: issueKey,
      transitionId: transition.id
    });
    const movedToQaTesting = String(transition.to || "").trim().toLowerCase() === "qa testing";
    const movedFromInProgress = String(currentStatus || "").trim().toLowerCase() === "in progress";
    const qaMentionAdded = movedFromInProgress && movedToQaTesting ? await addQaTestingMentionComment(issueKey) : false;
    await fetchJiraIssues();
    alert(issueKey + " moved to " + (transition.to || transition.name) + (movedToQaTesting && !qaMentionAdded ? ". Scrum Team comment was not added." : "."));
  } catch (err) {
    alert("Could not move " + issueKey + ": " + String(err.message || err));
  }
}

async function moveNewBlockJiraIssueToInProgress(issueKey) {
  const key = String(issueKey || "").trim().toUpperCase();
  if (!key) return false;

  try {
    const [issueData, transitionData] = await Promise.all([
      jiraWorkerFetch("/jira/issue?key=" + encodeURIComponent(key), { key }),
      jiraWorkerFetch("/jira/transitions?key=" + encodeURIComponent(key), { key })
    ]);
    const currentStatus = String(issueData.issue?.fields?.status?.name || "").trim().toLowerCase();
    if (currentStatus !== "to do" && !currentStatus.includes("todo")) return false;

    const transition = (transitionData.transitions || []).find(item => String(item?.to || "").trim().toLowerCase() === "in progress");
    if (!transition?.id) return false;
    await jiraWorkerFetch("/jira/transition?key=" + encodeURIComponent(key), { key, transitionId: transition.id });

    const cached = jiraIssueCache.find(item => String(item?.key || "").trim().toUpperCase() === key);
    if (cached) cached.status = "In Progress";
    updateJiraDropdown();
    return true;
  } catch (err) {
    console.warn("Could not move new block Jira issue to In Progress", key, err);
    return false;
  }
}
async function commentOnJiraIssue(issueKey) {
  const comment = window.prompt("Comment on " + issueKey + " (you can include @ mentions):");
  if (comment === null || !comment.trim()) return;
  try {
    await jiraWorkerFetch("/jira/comment?key=" + encodeURIComponent(issueKey), {
      key: issueKey,
      comment
    });
    alert("Comment added to " + issueKey + ".");
  } catch (err) {
    alert("Could not add the comment: " + String(err.message || err));
  }
}

async function addTodoForJira(issueKey) {
  const summary = jiraIssueSummaryByKey[issueKey] || "";
  const existing = todos.find(item => item.jiraIssue === issueKey && !item.done);
  if (existing) return alert(issueKey + " is already in your open to-do list.");
  todos.unshift({
    id: crypto.randomUUID(),
    text: summary ? issueKey + ": " + summary : issueKey,
    jiraIssue: issueKey,
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: "",
    completedDate: ""
  });
  await saveTodos();
  renderTodos();
}

function hideJiraContextMenu() {
  document.querySelector(".jira-context-menu")?.remove();
}

function showJiraContextMenu(issueKey, x, y) {
  hideJiraContextMenu();
  const menu = document.createElement("div");
  menu.className = "jira-context-menu";
  menu.innerHTML = "<button data-jira-menu='view'>View issue</button><button data-jira-menu='uat'>UAT test case</button><button data-jira-menu='rows-description'>Add rows to Description</button><button data-jira-menu='rows-comment'>Add rows to comments</button><button data-jira-menu='comment'>Add comment</button><button data-jira-menu='move'>Change status</button><button data-jira-menu='todo'>Add to to-do list</button>";
  menu.style.left = Math.min(x, window.innerWidth - 190) + "px";
  menu.style.top = Math.min(y, window.innerHeight - 290) + "px";
  menu.addEventListener("click", async event => {
    const action = event.target.closest("[data-jira-menu]")?.dataset.jiraMenu;
    hideJiraContextMenu();
    if (action === "view") await viewJiraIssue(issueKey);
    if (action === "uat") openUatDialog(issueKey);
    if (action === "rows-description") await addIssueRowsToDescription(issueKey);
    if (action === "rows-comment") await addIssueRowsToComment(issueKey);
    if (action === "move") await moveJiraIssue(issueKey);
    if (action === "comment") await commentOnJiraIssue(issueKey);
    if (action === "todo") await addTodoForJira(issueKey);
  });
  document.body.appendChild(menu);
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


function issueRowsForJiraIssue(issueKey) {
  const key = String(issueKey || "").trim().toUpperCase();
  const rows = selectedSprintEntries().filter(e => (e.jiraIssue || "UNLINKED").trim().toUpperCase() === key);
  return {
    rows,
    headers: ["Effort", "Description", "Date"],
    values: rows.map(e => [
      effortPointsLabel(e.end ? Math.max(0, mins(e.end) - mins(e.start)) : 0),
      issueWorkDescription(e),
      formatDisplayDate(e.date)
    ])
  };
}

function issueRowsText(issueKey) {
  const data = issueRowsForJiraIssue(issueKey);
  if (!data.rows.length) return "";
  return [data.headers, ...data.values].map(row => row.join(" | ")).join("\n");
}

async function addIssueRowsToDescription(issueKey) {
  const data = issueRowsForJiraIssue(issueKey);
  if (!data.rows.length) return alert("No worklog rows found for " + issueKey + " in the selected sprint.");
  if (!window.confirm("Replace the Jira description for " + issueKey + " with its worklog rows?")) return;
  try {
    await jiraWorkerFetch("/jira/update?key=" + encodeURIComponent(issueKey), {
      key: issueKey,
      fields: { description: jiraAdfTableFromRows(data.headers, data.values) }
    });
    alert("Description updated for " + issueKey + ".");
  } catch (err) {
    alert("Could not update the description for " + issueKey + ": " + String(err.message || err));
  }
}

async function addIssueRowsToComment(issueKey) {
  const data = issueRowsForJiraIssue(issueKey);
  if (!data.rows.length) return alert("No worklog rows found for " + issueKey + " in the selected sprint.");
  try {
    await jiraWorkerFetch("/jira/comment?key=" + encodeURIComponent(issueKey), {
      key: issueKey,
      commentBody: jiraAdfTableFromRows(data.headers, data.values)
    });
    alert("Worklog rows added as a comment to " + issueKey + ".");
  } catch (err) {
    alert("Could not add worklog rows to " + issueKey + ": " + String(err.message || err));
  }
}function copyIssueRows(issueKey) {
  const data = issueRowsForJiraIssue(issueKey);
  if (!data.rows.length) return;
  writeTableClipboard(data.headers, data.values).then(() => alert(`Copied ${data.rows.length} rows for ${issueKey}.`));
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

async function writeTableClipboard(headers, rows) {
  const textRows = [headers, ...rows].map(row => row.join("\t")).join("\n");
  const htmlRows = rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  const html = `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${htmlRows}</tbody></table>`;
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const item = new ClipboardItem({
      "text/plain": new Blob([textRows], { type: "text/plain" }),
      "text/html": new Blob([html], { type: "text/html" })
    });
    await navigator.clipboard.write([item]);
    return;
  }
  await navigator.clipboard.writeText(textRows);
}

function copyExcelRows() {
  const monthPrefix = String(el.dayPicker.value || today).slice(0, 7);
  const rows = sortedEntries(allEntries.filter(e => String(e.date || "").startsWith(monthPrefix) && !!e.end && (!!e.isOvertime || e.tag === "overtime")));
  if (!rows.length) return alert("No overtime rows found for the selected month.");
  const out = [];
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
  wireDragSelectionGuard();
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
  el.pbiCreatorBtn.addEventListener("click", openPbiCreatorDialog);
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
  el.uatFetchBtn.addEventListener("click", fetchUatIssue);
  el.uatOpenSettingsBtn.addEventListener("click", openJiraSettingsDialog);
  el.uatCopyLinkBtn.addEventListener("click", copyUatIssueLink);
  el.uatResetBtn.addEventListener("click", resetUatDialog);
  el.uatCopyBtn.addEventListener("click", copyUatConfluenceTable);
  el.uatIssueInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    fetchUatIssue();
  });
  el.pbiDynamicForm.addEventListener("change", event => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!(target instanceof HTMLSelectElement) || target.name !== "issueType") return;
    snapshotPbiVisibleFields();
    currentPbiIssueType = normalizePbiIssueType(target.value);
    renderPbiDraftForm();
  });
  el.pbiAnalyzeBtn.addEventListener("click", analyzePbiDraft);
  el.pbiSubmitBtn.addEventListener("click", submitPbiDraft);
  el.pbiHistoryList.addEventListener("click", event => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const clear = target?.closest("[data-pbi-history-clear]");
    if (clear) {
      localStorage.removeItem(PBI_HISTORY_STORAGE_KEY);
      renderPbiHistory();
      return;
    }
    const item = target?.closest("[data-pbi-history-text]");
    if (!item) return;
    el.pbiInput.value = item.dataset.pbiHistoryText || "";
  });
  el.jiraIssueSave.addEventListener("click", saveJiraIssueChanges);
  el.jiraIssueBody.addEventListener("click", event => {
    const button = event.target.closest("[data-jira-edit-field]");
    if (!button) return;
    const fieldId = button.dataset.jiraEditField;
    const row = button.closest(".jira-detail-row");
    const meta = jiraIssueEditMeta[fieldId] || {};
    const raw = jiraIssueDraft?.fields?.[fieldId];
    button.remove();
    row.querySelector(".jira-field-display")?.replaceWith(document.createRange().createContextualFragment(jiraFieldInput(fieldId, meta, raw, button.dataset.jiraPbiKey || fieldId)));
    el.jiraIssueSave.hidden = false;
  });
  el.jiraSettingsCancel.addEventListener("click", () => el.jiraSettingsDialog.close());
  el.jiraSettingsClear.addEventListener("click", clearJiraSettings);
  el.cancelBtn.addEventListener("click", () => el.dialog.close());
  const syncJiraSelectToInput = () => {
    el.jira.value = el.jiraSelect.value || "";
  };
  el.jiraSelect.addEventListener("change", syncJiraSelectToInput);
  if (window.jQuery && window.jQuery.fn?.select2) {
    window.jQuery(el.jiraSelect).on("change.worklogJiraSelect", syncJiraSelectToInput);
  }
  el.sprintIssuesList.addEventListener("click", event => {
    const issue = event.target.closest("[data-jira-issue]")?.dataset.jiraIssue;
    if (issue) openEditor(null, { jiraIssue: issue });
  });
  el.sprintIssuesList.addEventListener("contextmenu", event => {
    const issue = event.target.closest("[data-jira-issue]")?.dataset.jiraIssue;
    if (!issue) return;
    event.preventDefault();
    event.stopPropagation();
    showJiraContextMenu(issue, event.clientX, event.clientY);
  });
  el.sprintView.addEventListener("contextmenu", event => {
    const issue = event.target.closest(".sprint-issue-heading[data-jira-issue]")?.dataset.jiraIssue;
    if (!issue) return;
    event.preventDefault();
    event.stopPropagation();
    showJiraContextMenu(issue, event.clientX, event.clientY);
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".jira-context-menu")) hideJiraContextMenu();
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
    const target = ev.target instanceof Element ? ev.target : null;
    if (Date.now() < suppressContextMenuUntil) { ev.preventDefault(); return; }
    if (!allowBrowserContextMenu(target)) ev.preventDefault();
  }, true);
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
