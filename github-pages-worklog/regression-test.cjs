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
  'pbiFieldLabel', 'createPbiField', 'openPbiCreatorDialog', 'refreshLiveData',
  'mins', 'isBackgroundSlot', 'mergeTimeRanges', 'unrecordedTimeRanges', 'quickBlockDefaults',
  'closestFibonacciEstimate', 'isBufferIssue', 'worklogEstimateForIssue', 'sprintEstimateComparison',
  'sprintIssueGroupRank', 'compareSprintIssueGroups'].forEach(load);
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
  context.jiraIssueCache = [{ key: 'CPM-1', issuetype: 'Story', storyPoints: 5 }, { key: 'CPM-2', issuetype: 'Buffer', storyPoints: 6 }];
  assert.equal(context.closestFibonacciEstimate(10), 8);
  assert.equal(context.worklogEstimateForIssue('CPM-2', 5.5), 6);
  assert.equal(context.sprintEstimateComparison('CPM-1', 10).mismatch, true);
  context.jiraIssueCache[0].storyPoints = 8;
  assert.equal(context.sprintEstimateComparison('CPM-1', 10).mismatch, false);
  assert.equal(context.sprintEstimateComparison('CPM-2', 5.5).mismatch, false);
  context.jiraIssueCache[1].storyPoints = 5;
  assert.equal(context.sprintEstimateComparison('CPM-2', 5.5).mismatch, true);
  context.jiraIssueCache[1].storyPoints = '';
  assert.equal(context.sprintEstimateComparison('CPM-2', 5.5).mismatch, false, 'Missing estimate is not a numeric mismatch');
  context.jiraIssueCache[1].storyPoints = 0;
  assert.equal(context.worklogEstimateForIssue('CPM-2', 0.4), 0);
  assert.equal(context.sprintEstimateComparison('CPM-2', 0.4).mismatch, false);
  assert.equal(context.sprintEstimateComparison('GROUP: Food', 2).mismatch, false);
  const ordered = [
    ['GROUP: Food', [{ noJira: true }]], ['CPM-3', [{ jiraLogged: true }]], ['UNLINKED', [{}]],
    ['GROUP: Future', [{ noJira: false }]], ['CPM-4', [{ jiraLogged: false }, { jiraLogged: true }]]
  ].sort(context.compareSprintIssueGroups);
  assert.deepEqual(ordered.map(([key]) => key), ['CPM-4', 'UNLINKED', 'CPM-3', 'GROUP: Future', 'GROUP: Food']);
  const slot = (start, end) => ({ start, end, isBackgroundSlot: true });
  const gapEntries = [slot('07:00', '12:00'), slot('11:00', '16:00'),
    { start: '08:00', end: '09:00' }, { start: '08:45', end: '10:00' }, { start: '12:00', end: '13:00', noJira: true }];
  assert.equal(JSON.stringify(context.unrecordedTimeRanges(gapEntries)), JSON.stringify([[420, 480], [600, 720], [780, 960]]));
  assert.equal(JSON.stringify(context.unrecordedTimeRanges(gapEntries, 690)), JSON.stringify([[420, 480], [600, 690]]));
  assert.equal(context.unrecordedTimeRanges(gapEntries, 0).length, 0, 'Future hours are not missing time');
  assert.equal(context.unrecordedTimeRanges([{ start: '09:00', end: '10:00' }]).length, 0, 'No schedule means no inferred gaps');
  const daily = context.quickBlockDefaults('daily', '2026-10-21');
  assert.equal(daily.task, 'Daily'); assert.equal(daily.start, '08:45'); assert.equal(daily.noJira, true);
  assert.equal(context.quickBlockDefaults('food', '2026-10-21').jiraIssue, 'GROUP: Food');
  assert.equal(context.quickBlockDefaults('invalid', '2026-10-21'), null);
  ['escapeHtml', 'effortPointsLabel', 'renderSprintView', 'openQuickBlock'].forEach(load);
  context.el.sprintView.querySelectorAll = () => [];
  context.resolveSprintSelection = () => ({ mode: 'manual', sprint: { name: 'Fixture sprint', start: '2026-10-06', end: '2026-10-26' } });
  context.durLabel = minutes => minutes + 'm';
  context.sprintIssueColor = () => '#000';
  context.linkedIssueSummaryLabel = key => key;
  context.jiraIssueStatusBadge = () => '';
  context.jiraIssueSummaryByKey = { 'CPM-1': 'Story', 'CPM-3': 'Logged story' };
  const row = (jiraIssue, extra = {}) => ({ id: jiraIssue || 'internal', jiraIssue, task: 'Activity', date: '2026-10-20', start: '09:00', end: '10:30', ...extra });
  context.selectedSprintEntries = () => [row('GROUP: Food', { noJira: true }), row('CPM-3', { jiraLogged: true }), row(''), row('GROUP: Future'), row('CPM-1', { start: '05:00', end: '20:00' }), row('', { noJira: true })];
  context.jiraIssueCache[0].storyPoints = 5;
  context.renderSprintView();
  const html = context.el.sprintView.innerHTML;
  assert.ok(html.includes('has-estimate-mismatch'));
  assert.ok(html.includes('Fibonacci effort is 8 pt; Jira estimate is 5 pt.'));
  const expectedKeys = ['CPM-1', 'UNLINKED', 'CPM-3', 'GROUP: Future', 'GROUP: Food', '__internal__'];
  const offsets = expectedKeys.map(key => html.indexOf("data-sprint-issue='" + key + "'"));
  assert.ok(offsets.every((offset, index) => offset >= 0 && (!index || offset > offsets[index - 1])), 'Rendered cards follow the requested six-category order');
  context.el.dayPicker.value = '2026-10-21';
  context.openEditor = (entry, defaults) => { context.opened = { entry, defaults }; };
  context.openQuickBlock('food');
  assert.equal(context.opened.defaults.task, 'Food');
  assert.equal(context.opened.defaults.end, '12:30');
  context.allEntries = [{ id: 'existing-daily', date: '2026-10-21', task: 'Daily' }];
  context.openQuickBlock('daily');
  assert.equal(context.opened.entry.id, 'existing-daily', 'Preset opens an existing activity instead of duplicating it');
  console.log('Passed: outside-sprint status guard and estimate cache, zero estimate, manual PBI editor, growing goal textarea, non-loggable group storage and redraw only on change.');
  console.log('Passed: Fibonacci mismatch, Buffer rounding, sprint priority order, editable Daily/Food presets and gaps without double-counting overlaps or future hours.');
  if (process.argv[2]) {
    const log = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const snapshot = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Malta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(log.exportedAt));
    const snapshotDate = snapshot.slice(0, 10);
    const snapshotMinutes = context.mins(snapshot.slice(11, 16));
    const days = [...new Set(log.entries.map(entry => entry.date))].sort();
    const results = days.map(date => {
      const entries = log.entries.filter(entry => entry.date === date);
      const gaps = context.unrecordedTimeRanges(entries, date < snapshotDate ? 1440 : (date === snapshotDate ? snapshotMinutes : 0));
      return { date, gapMinutes: gaps.reduce((sum, [start, end]) => sum + end - start, 0),
        gaps: gaps.map(([start, end]) => [start, end].map(value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0')).join('–')) };
    });
    console.log(JSON.stringify({ entryCount: log.entries.length, activityCount: log.entries.filter(entry => !context.isBackgroundSlot(entry)).length, days: results }, null, 2));
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
