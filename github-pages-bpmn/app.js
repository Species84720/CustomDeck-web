import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, deleteDoc, getDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const cfg = window.BPMN_VAULT_CONFIG?.firebase;
const $ = id => document.getElementById(id);
const el = {
  login: $("login-panel"), vault: $("vault-panel"), library: $("library"), authStatus: $("auth-status"),
  signIn: $("google-sign-in"), signOut: $("sign-out"), userLabel: $("user-label"), welcome: $("welcome-label"),
  vaultStatus: $("vault-status"), password: $("vault-password"), unlock: $("unlock"), branchSearch: $("branch-search"),
  branchList: $("branch-list"), branchTitle: $("branch-title"), fileCount: $("file-count"), fileSearch: $("file-search"),
  branchSidebar: $("branch-sidebar"), libraryGrid: $("library"), contentGrid: $("content-grid"), filePane: $("file-pane"),
  fileList: $("file-list"), viewerStatus: $("viewer-status"), canvas: $("canvas"), diagramHost: $("diagram-host"), canvasEmpty: $("canvas-empty"),
  toggleBranches: $("toggle-branches"), toggleBranchesToolbar: $("toggle-branches-toolbar"), toggleFiles: $("toggle-files"), toggleProps: $("toggle-props"),
  zoomIn: $("zoom-in"), zoomOut: $("zoom-out"), zoomFit: $("zoom-fit"), propsPanel: $("props-panel"), propsContent: $("props-content"), uploadDialog: $("upload-dialog"),
  uploadOpen: null, uploadForm: $("upload-form"), uploadBranch: $("upload-branch"), uploadFiles: $("upload-files"),
  uploadCancel: $("upload-cancel"), uploadStatus: $("upload-status")
};

let auth, db, user, branches = [], activeBranch = null, viewer;
let vaultPassword = "";
let activeFileId = null;
let activeElement = null;
let branchesOpen = true;
let filesOpen = true;
let propsOpen = true;
let panState = null;
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
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function fileNameFromPath(path) {
  const parts = String(path).split("/");
  return parts[parts.length - 1] || path;
}
function fileDirFromPath(path) {
  const parts = String(path).split("/");
  parts.pop();
  return parts.join("/") || "Root folder";
}
function asArray(value) { return Array.isArray(value) ? value : []; }
function nsKey(name) { return String(name || "").split(":").pop(); }
function readNamedValue(source, ...names) {
  const wanted = names.flatMap(name => [name, nsKey(name)]).map(name => String(name));
  for (const name of names) {
    if (source?.[name] !== undefined && source[name] !== null && source[name] !== "") return source[name];
  }
  for (const [key, value] of Object.entries(source?.$attrs || {})) {
    if (wanted.includes(key) || wanted.includes(nsKey(key))) return value;
  }
  return "";
}
function expressionBody(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.body === "string") return value.body;
  if (typeof value.$body === "string") return value.$body;
  if (typeof value.text === "string") return value.text;
  return "";
}
function section(title, body) {
  return `<section class="prop-section"><div class="prop-section-title">${escapeHtml(title)}</div>${body}</section>`;
}
function propRow(label, value) {
  return `<div class="prop-row"><div class="prop-label">${escapeHtml(label)}</div><div class="prop-value">${escapeHtml(value)}</div></div>`;
}
function propCard(title, rows, badge = "") {
  return `<article class="prop-card">${badge ? `<div class="prop-badge">${escapeHtml(badge)}</div>` : ""}<div class="prop-card-title">${escapeHtml(title)}</div><div class="prop-keyvals">${rows.join("")}</div></article>`;
}
function extensionValues(bo, ...types) {
  const names = new Set(types.map(type => nsKey(type)));
  return asArray(bo?.extensionElements?.values).filter(value => names.has(nsKey(value?.$type)));
}
function deepFindExtensions(source, ...types) {
  const names = new Set(types.map(type => nsKey(type)));
  const results = [];
  const seen = new WeakSet();
  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (names.has(nsKey(value.$type))) results.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$") || key === "parent" || key === "labels" || key === "sourceRef" || key === "targetRef" || key === "incoming" || key === "outgoing") continue;
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === "object") walk(child);
    }
  }
  walk(source?.extensionElements);
  return results;
}
function listenerImplementation(listener) {
  const className = readNamedValue(listener, "class");
  const delegateExpression = readNamedValue(listener, "delegateExpression");
  const expression = readNamedValue(listener, "expression");
  if (className) return { type: "Java class", value: className };
  if (delegateExpression) return { type: "Delegate expression", value: delegateExpression };
  if (expression) return { type: "Expression", value: expression };
  return { type: "Implementation", value: "—" };
}
function listenerFields(listener) {
  const directFields = asArray(listener?.fields);
  const extFields = asArray(listener?.extensionElements?.values).filter(value => nsKey(value?.$type) === "Field");
  return [...directFields, ...extFields];
}
function fieldDetails(field) {
  return {
    name: readNamedValue(field, "name") || "Unnamed field",
    stringValue: readNamedValue(field, "stringValue", "string") || expressionBody(field?.string) || "—",
    expression: readNamedValue(field, "expression") || expressionBody(field?.expression) || "—"
  };
}
function readListeners(bo, kind) {
  const types = kind === "task" ? ["activiti:TaskListener", "camunda:TaskListener"] : ["activiti:ExecutionListener", "camunda:ExecutionListener"];
  const sources = [bo, ...asArray(bo?.eventDefinitions)];
  return sources.flatMap(source => deepFindExtensions(source, ...types)).map(listener => {
    const impl = listenerImplementation(listener);
    return {
      event: readNamedValue(listener, "event") || "—",
      type: impl.type,
      value: impl.value,
      fields: listenerFields(listener).map(fieldDetails)
    };
  });
}
function readFields(bo) {
  return deepFindExtensions(bo, "activiti:Field", "camunda:Field").map(fieldDetails);
}
function readMappings(bo) {
  return [
    ...deepFindExtensions(bo, "activiti:In", "camunda:In").map(item => ({
      dir: "In",
      source: readNamedValue(item, "source", "sourceExpression") || "—",
      target: readNamedValue(item, "target", "targetExpression") || "—"
    })),
    ...deepFindExtensions(bo, "activiti:Out", "camunda:Out").map(item => ({
      dir: "Out",
      source: readNamedValue(item, "source", "sourceExpression") || "—",
      target: readNamedValue(item, "target", "targetExpression") || "—"
    }))
  ];
}
function readInputOutputParameters(bo) {
  return deepFindExtensions(bo, "camunda:InputOutput", "activiti:InputOutput").flatMap(io => [
    ...asArray(io.inputParameters).map(param => ({
      dir: "Input",
      name: readNamedValue(param, "name") || "Unnamed input",
      value: expressionBody(param.value) || readNamedValue(param, "value") || param.textContent || "—"
    })),
    ...asArray(io.outputParameters).map(param => ({
      dir: "Output",
      name: readNamedValue(param, "name") || "Unnamed output",
      value: expressionBody(param.value) || readNamedValue(param, "value") || param.textContent || "—"
    }))
  ]);
}
function readProperties(bo) {
  return deepFindExtensions(bo, "camunda:Properties", "activiti:Properties").flatMap(group =>
    asArray(group.values).map(item => ({
      name: readNamedValue(item, "name", "id") || "Unnamed property",
      value: readNamedValue(item, "value") || expressionBody(item.value) || "—"
    }))
  );
}
function modelPropertyRows(bo) {
  const skip = new Set(["$type", "id", "name", "$parent", "$attrs", "documentation", "extensionElements", "eventDefinitions", "incoming", "outgoing", "sourceRef", "targetRef", "rootElements", "flowElements", "laneSets", "artifacts"]);
  const rows = [];
  for (const [key, value] of Object.entries(bo || {})) {
    if (skip.has(key) || key.startsWith("$")) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") rows.push([key, value]);
    else {
      const expr = expressionBody(value);
      if (expr) rows.push([key, expr]);
      else if (value && typeof value === "object" && typeof value.id === "string") rows.push([key, value.id]);
    }
  }
  for (const [key, value] of Object.entries(bo?.$attrs || {})) {
    if (value !== undefined && value !== null && value !== "") rows.push([key, value]);
  }
  return rows
    .filter(([, value]) => value !== "")
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([key, value]) => propRow(key, value));
}
function eventDefinitionRows(bo) {
  return asArray(bo?.eventDefinitions).map(definition => {
    const rows = [propRow("Type", nsKey(definition?.$type) || "—")];
    if (definition?.messageRef?.id) rows.push(propRow("Message ref", definition.messageRef.id));
    if (definition?.signalRef?.id) rows.push(propRow("Signal ref", definition.signalRef.id));
    if (expressionBody(definition?.condition)) rows.push(propRow("Condition", expressionBody(definition.condition)));
    return propCard(nsKey(definition?.$type) || "Event definition", rows);
  });
}
function showCanvasMessage(message, error = false) {
  el.diagramHost.hidden = true;
  el.canvasEmpty.textContent = message;
  el.canvasEmpty.hidden = false;
  el.canvasEmpty.classList.toggle("error", error);
}
function showDiagram() {
  el.canvasEmpty.hidden = true;
  el.canvasEmpty.classList.remove("error");
  el.diagramHost.hidden = false;
}
function currentScale() {
  try { return viewer?.get("canvas")?.viewbox()?.scale || 1; }
  catch (_) { return 1; }
}
function setZoom(nextScale) {
  if (!viewer) return;
  const canvas = viewer.get("canvas");
  const clamped = Math.min(4, Math.max(0.2, nextScale));
  canvas.zoom(clamped);
}
function adjustZoom(factor) {
  setZoom(currentScale() * factor);
}
function fitDiagram() {
  if (!viewer) return;
  viewer.get("canvas").zoom("fit-viewport");
}
function beginPan(event) {
  if (!viewer || event.button !== 0) return;
  if (event.target.closest(".djs-element")) return;
  const canvas = viewer.get("canvas");
  const viewbox = canvas.viewbox();
  panState = { x: event.clientX, y: event.clientY, viewbox };
  el.canvas.classList.add("is-panning");
}
function movePan(event) {
  if (!panState || !viewer) return;
  const canvas = viewer.get("canvas");
  const dx = (event.clientX - panState.x) / panState.viewbox.scale;
  const dy = (event.clientY - panState.y) / panState.viewbox.scale;
  canvas.viewbox({ x: panState.viewbox.x - dx, y: panState.viewbox.y - dy, width: panState.viewbox.width, height: panState.viewbox.height });
}
function endPan() {
  panState = null;
  el.canvas.classList.remove("is-panning");
}
function renderProps(element = activeElement) {
  activeElement = element || null;
  if (!activeElement) {
    el.propsContent.innerHTML = '<div class="empty small-empty">Open a BPMN file and click an element to inspect it.</div>';
    return;
  }
  const businessObject = activeElement.businessObject || {};
  const docs = asArray(businessObject.documentation).map(item => item?.text).filter(Boolean).join("\n\n");
  const implementationRows = [];
  const className = readNamedValue(businessObject, "class");
  const delegateExpression = readNamedValue(businessObject, "delegateExpression");
  const expression = readNamedValue(businessObject, "expression");
  if (className) implementationRows.push(propRow("Java class", className));
  if (delegateExpression) implementationRows.push(propRow("Delegate expression", delegateExpression));
  if (expression) implementationRows.push(propRow("Expression", expression));
  const knownRows = [
    ["Form key", readNamedValue(businessObject, "formKey")],
    ["Initiator", readNamedValue(businessObject, "initiator")],
    ["Assignee", readNamedValue(businessObject, "assignee")],
    ["Candidate users", readNamedValue(businessObject, "candidateUsers")],
    ["Candidate groups", readNamedValue(businessObject, "candidateGroups")],
    ["Priority", readNamedValue(businessObject, "priority")],
    ["Due date", readNamedValue(businessObject, "dueDate")],
    ["Called element", readNamedValue(businessObject, "calledElement")],
    ["Result variable", readNamedValue(businessObject, "resultVariable")],
    ["Script format", readNamedValue(businessObject, "scriptFormat")],
    ["Script", readNamedValue(businessObject, "script") || expressionBody(businessObject.script)],
    ["Condition expression", expressionBody(businessObject.conditionExpression)],
    ["Collection", readNamedValue(businessObject, "collection")],
    ["Element variable", readNamedValue(businessObject, "elementVariable")],
    ["Async before", String(!!readNamedValue(businessObject, "asyncBefore", "async"))],
    ["Async after", String(!!readNamedValue(businessObject, "asyncAfter"))],
    ["Exclusive", String(!!readNamedValue(businessObject, "exclusive"))],
    ["Cancel activity", String(!!readNamedValue(businessObject, "cancelActivity"))],
    ["Triggered by event", String(!!readNamedValue(businessObject, "triggeredByEvent"))],
    ["Auto store variables", String(!!readNamedValue(businessObject, "autoStoreVariables"))]
  ].filter(([, value]) => value && value !== "false");
  implementationRows.push(...knownRows.map(([label, value]) => propRow(label, value)));

  const executionListeners = readListeners(businessObject, "execution");
  const taskListeners = readListeners(businessObject, "task");
  const injectedFields = readFields(businessObject);
  const mappings = readMappings(businessObject);
  const ioParameters = readInputOutputParameters(businessObject);
  const properties = readProperties(businessObject);
  const sections = [
    section("General", `<div class="prop-group">${[
      propRow("Type", activeElement.type?.replace("bpmn:", "") || businessObject.$type?.replace("bpmn:", "") || "Unknown"),
      propRow("ID", businessObject.id || activeElement.id || "Unknown"),
      propRow("Name", businessObject.name || "—"),
      propRow("Parent", businessObject.$parent?.id || "—"),
      propRow("Incoming", Array.isArray(activeElement.incoming) ? activeElement.incoming.length : 0),
      propRow("Outgoing", Array.isArray(activeElement.outgoing) ? activeElement.outgoing.length : 0),
      propRow("Documentation", docs || "—")
    ].join("")}</div>`)
  ];
  if (implementationRows.length) sections.push(section("Implementation", `<div class="prop-group">${implementationRows.join("")}</div>`));
  const eventCards = eventDefinitionRows(businessObject);
  if (eventCards.length) sections.push(section("Event Definitions", `<div class="prop-inline-list">${eventCards.join("")}</div>`));
  if (executionListeners.length) sections.push(section("Execution Listeners", `<div class="prop-inline-list">${executionListeners.map((listener, index) => propCard(`Listener ${index + 1}`, [
    propRow("Event", listener.event),
    propRow("Type", listener.type),
    propRow("Implementation", listener.value),
    propRow("Field injections", listener.fields.length)
  ], listener.event) + (listener.fields.length ? `<div class="prop-sublist">${listener.fields.map(field => `<div class="prop-subitem">${propRow("Name", field.name)}${propRow("String value", field.stringValue)}${propRow("Expression", field.expression)}</div>`).join("")}</div>` : "")).join("")}</div>`));
  if (taskListeners.length) sections.push(section("Task Listeners", `<div class="prop-inline-list">${taskListeners.map((listener, index) => propCard(`Task listener ${index + 1}`, [
    propRow("Event", listener.event),
    propRow("Type", listener.type),
    propRow("Implementation", listener.value),
    propRow("Field injections", listener.fields.length)
  ], listener.event) + (listener.fields.length ? `<div class="prop-sublist">${listener.fields.map(field => `<div class="prop-subitem">${propRow("Name", field.name)}${propRow("String value", field.stringValue)}${propRow("Expression", field.expression)}</div>`).join("")}</div>` : "")).join("")}</div>`));
  if (injectedFields.length) sections.push(section("Field Injections", `<div class="prop-inline-list">${injectedFields.map(field => propCard(field.name, [
    propRow("String value", field.stringValue),
    propRow("Expression", field.expression)
  ])).join("")}</div>`));
  if (ioParameters.length) sections.push(section("Input / Output Parameters", `<div class="prop-inline-list">${ioParameters.map((param, index) => propCard(`${param.dir} parameter ${index + 1}`, [
    propRow("Direction", param.dir),
    propRow("Name", param.name),
    propRow("Value", param.value)
  ], param.dir)).join("")}</div>`));
  if (properties.length) sections.push(section("Properties", `<div class="prop-inline-list">${properties.map(property => propCard(property.name, [
    propRow("Name", property.name),
    propRow("Value", property.value)
  ])).join("")}</div>`));
  if (mappings.length) sections.push(section("Variable Mappings", `<div class="prop-inline-list">${mappings.map((mapping, index) => propCard(`${mapping.dir} mapping ${index + 1}`, [
    propRow("Direction", mapping.dir),
    propRow("Source", mapping.source),
    propRow("Target", mapping.target)
  ], mapping.dir)).join("")}</div>`));
  const modelRows = modelPropertyRows(businessObject);
  if (modelRows.length) sections.push(section("All Model Properties", `<div class="prop-group">${modelRows.join("")}</div>`));
  el.propsContent.innerHTML = sections.join("");
}
function setBranchesOpen(open) {
  branchesOpen = open;
  el.branchSidebar.hidden = !branchesOpen;
  el.libraryGrid.classList.toggle("branches-collapsed", !branchesOpen);
  el.toggleBranches.classList.toggle("primary", branchesOpen);
  el.toggleBranches.classList.toggle("subtle", !branchesOpen);
  el.toggleBranchesToolbar.classList.toggle("primary", branchesOpen);
  el.toggleBranchesToolbar.classList.toggle("subtle", !branchesOpen);
}
function setFilesOpen(open) {
  filesOpen = open;
  el.filePane.hidden = !filesOpen;
  el.contentGrid.classList.toggle("files-collapsed", !filesOpen);
  el.toggleFiles.classList.toggle("primary", filesOpen);
  el.toggleFiles.classList.toggle("subtle", !filesOpen);
}
function setPropsOpen(open) {
  propsOpen = open;
  el.propsPanel.classList.toggle("hidden", !propsOpen);
  el.contentGrid.classList.toggle("props-collapsed", !propsOpen);
  el.toggleProps.classList.toggle("primary", propsOpen);
  el.toggleProps.classList.toggle("subtle", !propsOpen);
}
function bindViewerEvents() {
  const eventBus = viewer.get("eventBus");
  eventBus.on("element.click", event => renderProps(event.element));
  eventBus.on("canvas.click", () => renderProps(null));
  el.canvas.addEventListener("pointerdown", beginPan);
  window.addEventListener("pointermove", movePan);
  window.addEventListener("pointerup", endPan);
  el.canvas.addEventListener("wheel", event => {
    if (!viewer || !event.ctrlKey) return;
    event.preventDefault();
    adjustZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });
}

async function signIn() {
  if (!auth) return;
  try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
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
  activeFileId = null;
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
  showCanvasMessage(activeBranch.files.length ? "Select a BPMN file to view it." : "This branch has no BPMN files.");
  renderProps(null);
  el.viewerStatus.textContent = "";
}
function renderFiles() {
  const term = el.fileSearch.value.trim().toLowerCase();
  el.fileList.replaceChildren();
  (activeBranch?.files || []).filter(file => file.path.toLowerCase().includes(term)).forEach(file => {
    const button = document.createElement("button");
    button.className = "file-item" + (activeFileId === file.id ? " active" : "");
    button.innerHTML = `<span class="file-name">${escapeHtml(fileNameFromPath(file.path))}</span><span class="file-path">${escapeHtml(fileDirFromPath(file.path))}</span>`;
    button.onclick = () => viewFile(file);
    el.fileList.appendChild(button);
  });
  if (!el.fileList.children.length) el.fileList.innerHTML = '<div class="empty small-empty">No matching files.</div>';
}
async function viewFile(file) {
  activeFileId = file.id;
  renderFiles();
  el.viewerStatus.textContent = `Viewing ${file.path}`;
  try {
    showDiagram();
    if (!viewer) {
      viewer = new BpmnJS({ container: el.diagramHost });
      bindViewerEvents();
    }
    await viewer.importXML(file.xml);
    fitDiagram();
    renderProps(null);
  } catch (error) { showCanvasMessage(`Could not display this BPMN: ${String(error.message || error)}`, true); }
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
  el.toggleBranches.onclick = () => setBranchesOpen(!branchesOpen);
  el.toggleBranchesToolbar.onclick = () => setBranchesOpen(!branchesOpen);
  el.toggleFiles.onclick = () => setFilesOpen(!filesOpen);
  el.toggleProps.onclick = () => setPropsOpen(!propsOpen);
  el.zoomIn.onclick = () => adjustZoom(1.2);
  el.zoomOut.onclick = () => adjustZoom(1 / 1.2);
  el.zoomFit.onclick = fitDiagram;
  el.password.onkeydown = event => { if (event.key === "Enter") unlock(); };
  el.branchSearch.oninput = renderBranches;
  el.fileSearch.oninput = renderFiles;
}
function boot() {
  wire();
  setBranchesOpen(true);
  setFilesOpen(true);
  setPropsOpen(true);
  renderProps(null);
  if (!cfg || cfg.apiKey === "REPLACE_ME") { el.authStatus.textContent = "Copy config.example.js to config.js and add your Firebase web configuration."; el.signIn.disabled = true; return; }
  const app = initializeApp(cfg);
  auth = getAuth(app); db = getFirestore(app);
  onAuthStateChanged(auth, signedInUser => {
    user = signedInUser || null;
    el.login.hidden = !!user; el.vault.hidden = !user; el.signOut.hidden = !user;
    el.userLabel.textContent = user ? (user.email || user.displayName || "Signed in") : "";
    if (user) { el.welcome.textContent = `Signed in as ${user.email || user.displayName}`; status("Enter the vault password to load branches."); }
    else { vaultPassword = ""; branches = []; activeBranch = null; activeFileId = null; el.library.hidden = true; showCanvasMessage("Select a BPMN file to view it."); }
  });
}
boot();
