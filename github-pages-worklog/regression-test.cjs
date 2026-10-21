const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
function element(tag = 'input') {
  return { tagName: tag.toUpperCase(), value: '', checked: false, innerHTML: '', hidden: true, style: {}, dataset: {}, children: [], listeners: {},
    appendChild(child) { this.children.push(child); }, addEventListener(event, callback) { this.listeners[event] = callback; },
    showModal() { this.open = true; }, close() { this.open = false; } };
}
const elements = {};
const context = vm.createContext({ console, Date, Set, Map, Number, String, Array, Object, JSON, crypto: require('node:crypto').webcrypto,
  WORKLOG_GROUP_PREFIX: 'GROUP:', document: { createElement: element }, requestAnimationFrame(callback) { callback(); },
  el: new Proxy(elements, { get(target, key) { return target[key] ||= element(); } }),
  currentUser: { uid: 'fixture' }, db: {}, cfg: {}, allEntries: [], jiraIssueCache: [], linkedJiraIssues: {}, jiraIssueSummaryByKey: {}, jiraIssueTypeByKey: {},
  userJiraSettings: { storyPointsFieldId: 'customfield_10036' },
  currentPbiDraftFields: null, currentPbiIssueType: '', currentPbiClassification: '',
  liveRefreshPromise: null, hasReadyJiraSettings() { return true; }, refreshCurrentDate() {},
  async fetchJiraSprints() { return false; }, async fetchJiraIssues() { return context.issuesChanged; },
  async refreshLinkedJiraIssues() { return false; }, updateSprintAutoOption() {}, render() { context.redraws++; },
  getPbiDraftUrl() { return ''; }, renderPbiHistory() {}, updatePbiStatus() {},
  renderPbiDraftForm() { context.el.pbiEditorSection.hidden = false; },
  normalizeLocation() { return 'work'; }, isTimeslotTag() { return false; }, validateRange() { return ''; },
  serverTimestamp() { return 'now'; }, doc(...args) { return args; }, async setDoc(path, entry) { context.saved = entry; },
  async loadEntries() {}, toast() {}, jiraDetailText(value) { return String(value || ''); },
  async jiraWorkerFetch() { throw new Error('Unexpected Jira request'); }
});
function load(name) {
  const start = source.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/^(?:async )?function /m);
  vm.runInContext(next < 0 ? tail : tail.slice(0, next + 1), context);
}
['isJiraIssueKey', 'isWorklogGroupKey', 'worklogGroupLabel', 'formatWorklogGroup', 'normalizeLinkedIssueValue', 'linkedIssueKey', 'linkedIssueDisplayLabel', 'isRealJiraIssueValue',
  'saveEntry', 'moveNewBlockJiraIssueToInProgress', 'jiraIssueStoryPoints', 'jiraIssueStatus', 'normalizeJiraIssue', 'rememberLinkedJiraIssue', 'cachedJiraIssue',
  'pbiFieldLabel', 'createPbiField', 'openPbiCreatorDialog', 'refreshLiveData'].forEach(load);
(async () => {
  assert.equal(await context.moveNewBlockJiraIssueToInProgress('CPM-999'), false);
  assert.equal(context.jiraIssueStoryPoints({ storyPoints: 0 }), '0');
  context.rememberLinkedJiraIssue({ key: 'CPM-999', fields: { summary: 'Outside sprint', customfield_10036: 8, status: { name: 'Backlog' } } });
  assert.equal(context.jiraIssueStoryPoints(context.cachedJiraIssue('CPM-999')), '8');
  assert.equal(context.jiraIssueCache.length, 0, 'Linked issues must not become active sprint issues');
  context.openPbiCreatorDialog();
  assert.equal(context.currentPbiIssueType, 'Story');
  assert.equal(context.el.pbiEditorSection.hidden, false, 'Manual editor is available immediately');
  const goal = context.createPbiField('use_case_goal', 'Short goal').children[0];
  assert.equal(goal.tagName, 'TEXTAREA');
  goal.scrollHeight = 240;
  goal.listeners.input();
  assert.equal(goal.style.height, '240px');
  context.el.task.value = 'Internal work'; context.el.date.value = '2026-10-21'; context.el.start.value = '09:00';
  context.el.end.value = '10:00'; context.el.jira.value = 'Research'; context.el.noJira.checked = true;
  await context.saveEntry({ preventDefault() {} });
  assert.equal(context.saved.jiraIssue, 'GROUP: Research');
  assert.equal(context.saved.noJira, true);
  assert.equal(context.saved.jiraLogged, false);
  context.redraws = 0;
  await context.refreshLiveData();
  assert.equal(context.redraws, 0, 'Unchanged data must not redraw');
  context.issuesChanged = true;
  await context.refreshLiveData();
  assert.equal(context.redraws, 1, 'Changed data must redraw');
  console.log('Passed: outside-sprint status guard and estimate cache, zero estimate, manual PBI editor, growing goal textarea, non-loggable group storage and redraw only on change.');
})().catch(err => { console.error(err); process.exitCode = 1; });
