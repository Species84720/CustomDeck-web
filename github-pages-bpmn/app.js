import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, deleteDoc, getDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const cfg = window.BPMN_VAULT_CONFIG?.firebase;
const $ = id => document.getElementById(id);
const el = {
  login: $("login-panel"), vault: $("vault-panel"), library: $("library"), authStatus: $("auth-status"),
  signIn: $("google-sign-in"), signOut: $("sign-out"), userLabel: $("user-label"), welcome: $("welcome-label"),
  vaultStatus: $("vault-status"), password: $("vault-password"), unlock: $("unlock"), branchSearch: $("branch-search"),
  branchList: $("branch-list"), branchTitle: $("branch-title"), fileCount: $("file-count"), fileSearch: $("file-search"),
  fileList: $("file-list"), viewerStatus: $("viewer-status"), canvas: $("canvas"), uploadDialog: $("upload-dialog"),
  uploadOpen: $("upload-open"), uploadForm: $("upload-form"), uploadBranch: $("upload-branch"), uploadFiles: $("upload-files"),
  uploadCancel: $("upload-cancel"), uploadStatus: $("upload-status")
};

let auth, db, user, branches = [], activeBranch = null, viewer;
let vaultPassword = "";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_FILE_BYTES = 900000;

function status(message, error = false) {
  el.vaultStatus.textContent = message;
  el.vaultStatus.classList.toggle("error", error);
}
function bytesToBase64(bytes) { let binary = ""; bytes.forEach(byte => binary += String.fromCharCode(byte)); return btoa(binary); }
function base64ToBytes(value) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function randomBase64(size = 16) { return bytesToBase64(crypto.getRandomValues(new Uint8Array(size))); }
async function sha256(value) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: base64ToBytes(salt), iterations: 210000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}
async function open(key, payload) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(payload.iv) }, key, base64ToBytes(payload.data));
  return decoder.decode(plain);
}
function branchRef(branchId) { return doc(db, "users", user.uid, "bpmnVault", branchId); }
function fileCollection(branchId) { return collection(db, "users", user.uid, "bpmnVault", branchId, "files"); }
function isBpmn(file) { return /\.bpmn(?:20\.xml)?$/i.test(file.name); }

async function signIn() {
  if (!auth) return;
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (error) { el.authStatus.textContent = error.message || "Google sign-in failed."; }
}
async function loadBranches() {
  const snapshot = await getDocs(collection(db, "users", user.uid, "bpmnVault"));
  const loaded = [];
  for (const item of snapshot.docs) {
    const data = item.data();
    try {
      const key = await deriveKey(vaultPassword, data.salt);
      const name = await open(key, data.name);
      loaded.push({ id: item.id, name, key, count: Number(data.fileCount || 0) });
    } catch (_) { throw new Error("The vault password is incorrect or a branch is corrupted."); }
  }
  branches = loaded.sort((a, b) => a.name.localeCompare(b.name));
  renderBranches();
  el.library.hidden = false;
  if (branches.length) await selectBranch(branches[0].id);
  else { el.branchTitle.textContent = "No branches yet"; el.fileCount.textContent = ""; }
}
function renderBranches() {
  const term = el.branchSearch.value.trim().toLowerCase();
  el.branchList.replaceChildren();
  branches.filter(branch => branch.name.toLowerCase().includes(term)).forEach(branch => {
    const button = document.createElement("button");
    button.className = "branch-item" + (activeBranch?.id === branch.id ? " active" : "");
    button.textContent = branch.name;
    button.onclick = () => selectBranch(branch.id);
    el.branchList.appendChild(button);
  });
  if (!el.branchList.children.length) el.branchList.innerHTML = '<div class="empty small-empty">No matching branches.</div>';
}
async function selectBranch(branchId) {
  activeBranch = branches.find(branch => branch.id === branchId) || null;
  if (!activeBranch) return;
  renderBranches();
  el.branchTitle.textContent = activeBranch.name;
  el.viewerStatus.textContent = "Loading files...";
  const snapshot = await getDocs(fileCollection(activeBranch.id));
  activeBranch.files = [];
  for (const item of snapshot.docs) {
    try {
      const payload = JSON.parse(await open(activeBranch.key, item.data().payload));
      activeBranch.files.push({ id: item.id, path: payload.path, xml: payload.xml });
    } catch (_) { /* ignore an unreadable file rather than exposing ciphertext */ }
  }
  activeBranch.files.sort((a, b) => a.path.localeCompare(b.path));
  el.fileCount.textContent = `${activeBranch.files.length} file${activeBranch.files.length === 1 ? "" : "s"}`;
  renderFiles();
  el.viewerStatus.textContent = "";
}
function renderFiles() {
  const term = el.fileSearch.value.trim().toLowerCase();
  el.fileList.replaceChildren();
  (activeBranch?.files || []).filter(file => file.path.toLowerCase().includes(term)).forEach(file => {
    const button = document.createElement("button");
    button.className = "file-item";
    button.textContent = file.path;
    button.onclick = () => viewFile(file, button);
    el.fileList.appendChild(button);
  });
  if (!el.fileList.children.length) el.fileList.innerHTML = '<div class="empty small-empty">No matching files.</div>';
}
async function viewFile(file, button) {
  document.querySelectorAll(".file-item.active").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  el.viewerStatus.textContent = `Viewing ${file.path}`;
  try {
    if (!viewer) viewer = new BpmnJS({ container: el.canvas });
    await viewer.importXML(file.xml);
    viewer.get("canvas").zoom("fit-viewport");
  } catch (error) { el.canvas.innerHTML = `<div class="empty error">Could not display this BPMN: ${String(error.message || error)}</div>`; }
}
async function uploadBranch(event) {
  event.preventDefault();
  if (!vaultPassword) return;
  const branchName = el.uploadBranch.value.trim();
  const files = [...el.uploadFiles.files].filter(isBpmn);
  if (!branchName || !files.length) { el.uploadStatus.textContent = "Enter a branch and choose at least one BPMN file."; return; }
  if (files.some(file => file.size > MAX_FILE_BYTES)) { el.uploadStatus.textContent = "Each BPMN file must be smaller than 900 KB for Firestore."; return; }
  el.uploadStatus.textContent = "Encrypting and uploading...";
  try {
    const branchId = await sha256(`branch:${branchName}`);
    const existing = await getDoc(branchRef(branchId));
    const salt = existing.exists() ? existing.data().salt : randomBase64();
    const key = await deriveKey(vaultPassword, salt);
    const name = await seal(key, branchName);
    await setDoc(branchRef(branchId), { salt, name, fileCount: files.length, updatedAt: serverTimestamp() }, { merge: true });
    const oldFiles = await getDocs(fileCollection(branchId));
    await Promise.all(oldFiles.docs.map(item => deleteDoc(item.ref)));
    for (const file of files) {
      const path = file.webkitRelativePath || file.name;
      const root = path.indexOf("/");
      const relativePath = root >= 0 ? path.slice(root + 1) : path;
      const xml = await file.text();
      const fileId = await sha256(`file:${relativePath}`);
      const payload = await seal(key, JSON.stringify({ path: relativePath, xml }));
      await setDoc(doc(fileCollection(branchId), fileId), { payload, updatedAt: serverTimestamp() });
    }
    el.uploadDialog.close();
    el.uploadForm.reset();
    await loadBranches();
    status(`Branch “${branchName}” updated.`);
  } catch (error) { el.uploadStatus.textContent = error.message || "Upload failed."; }
}
async function unlock() {
  const password = el.password.value;
  if (password.length < 8) { status("Use a vault password of at least 8 characters.", true); return; }
  vaultPassword = password;
  el.unlock.disabled = true;
  status("Decrypting branches...");
  try { await loadBranches(); status("Vault unlocked."); }
  catch (error) { vaultPassword = ""; status(error.message, true); }
  finally { el.unlock.disabled = false; }
}
function wire() {
  el.signIn.onclick = signIn;
  el.signOut.onclick = () => signOut(auth);
  el.unlock.onclick = unlock;
  el.password.onkeydown = event => { if (event.key === "Enter") unlock(); };
  el.branchSearch.oninput = renderBranches;
  el.fileSearch.oninput = renderFiles;
  el.uploadOpen.onclick = () => { el.uploadStatus.textContent = ""; el.uploadDialog.showModal(); };
  el.uploadCancel.onclick = () => el.uploadDialog.close();
  el.uploadForm.onsubmit = uploadBranch;
}
function boot() {
  wire();
  if (!cfg || cfg.apiKey === "REPLACE_ME") { el.authStatus.textContent = "Copy config.example.js to config.js and add your Firebase web configuration."; el.signIn.disabled = true; return; }
  const app = initializeApp(cfg);
  auth = getAuth(app); db = getFirestore(app);
  onAuthStateChanged(auth, signedInUser => {
    user = signedInUser || null;
    el.login.hidden = !!user; el.vault.hidden = !user; el.signOut.hidden = !user;
    el.userLabel.textContent = user ? (user.email || user.displayName || "Signed in") : "";
    if (user) { el.welcome.textContent = `Signed in as ${user.email || user.displayName}`; status("Enter the vault password to load branches."); }
    else { vaultPassword = ""; branches = []; activeBranch = null; el.library.hidden = true; }
  });
}
boot();
