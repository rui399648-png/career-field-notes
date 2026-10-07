'use strict';
// Independently recalculate teaching data. Does not import an implementation or
// compare copied answer prose; each expected value comes from the agreed brief.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('data materials agree with independently recalculated CSV evidence', () => {
  const kit = path.resolve(__dirname, '..');
  const file = name => path.join(kit, 'materials', name);
  for (const name of ['data-events.csv', 'data-status.csv', 'data-workflow.md', 'data-reference.md', 'data-table.html']) {
    assert.ok(fs.existsSync(file(name)), `missing teaching material: ${name}`);
  }
  function csv(name) {
    const lines = fs.readFileSync(file(name), 'utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
    const headers = lines.shift().split(',');
    return lines.map((line, index) => {
      // These synthetic CSVs have no quoted commas or line breaks in fields.
      const values = line.split(',');
      assert.equal(values.length, headers.length, `${name} row ${index + 2} has wrong field count`);
      return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
    });
  }
  const rows = csv('data-events.csv');
  assert.equal(rows.length, 29, 'raw event row count');
  assert.equal(new Set(rows.map(row => row.row_id)).size, rows.length, 'row IDs are unique');
  const start = Date.parse('2026-10-01T00:00:00+08:00');
  const end = Date.parse('2026-10-08T00:00:00+08:00');
  const seenEvent = new Set();
  const acceptedRows = [];
  const rejected = [];
  let normalized = 0;
  for (const row of rows) {
    assert.ok(['A', 'B'].includes(row.channel), `unknown channel in ${row.row_id}`);
    assert.ok(['visit', 'click', 'submit_success'].includes(row.event), `unknown event in ${row.row_id}`);
    assert.ok(['0', '1'].includes(row.is_test), `bad is_test in ${row.row_id}`);
    const user = row.user_id.trim().toLowerCase();
    const at = Date.parse(row.occurred_at);
    assert.ok(Number.isFinite(at), `invalid timestamp in ${row.row_id}`);
    let reason;
    if (!user) reason = 'missing_user_id';
    else if (row.is_test === '1') reason = 'test';
    else if (at < start || at >= end) reason = 'outside_window';
    else if (seenEvent.has(row.event_id)) reason = 'duplicate_event';
    if (reason) {
      rejected.push({row: row.row_id, reason});
      continue;
    }
    seenEvent.add(row.event_id);
    if (user !== row.user_id) normalized += 1;
    acceptedRows.push({...row, user});
  }
  assert.equal(acceptedRows.length, 25, 'included event count');
  assert.equal(normalized, 1, 'one included identity is normalized without dropping its row');
  assert.deepEqual(rejected, [
    {row:'R26', reason:'duplicate_event'},
    {row:'R27', reason:'missing_user_id'},
    {row:'R28', reason:'test'},
    {row:'R29', reason:'outside_window'},
  ]);
  const sources = {};
  for (const channel of ['A', 'B']) {
    const byEvent = event => new Set(acceptedRows.filter(row => row.channel === channel && row.event === event).map(row => row.user));
    const visits = byEvent('visit');
    const clicks = byEvent('click');
    const submissions = byEvent('submit_success');
    assert.ok([...clicks].every(id => visits.has(id)), `${channel} click users must have visited`);
    assert.ok([...submissions].every(id => clicks.has(id)), `${channel} submit users must have clicked`);
    sources[channel] = {visits, clicks, submissions};
  }
  assert.ok([...sources.A.visits].every(id => !sources.B.visits.has(id)), 'channels are disjoint in this simulation');
  for (const id of new Set(acceptedRows.map(row => row.user))) {
    assert.equal(new Set(acceptedRows.filter(row => row.user === id).map(row => row.channel)).size, 1, 'channel is fixed by user');
  }
  const statusRows = csv('data-status.csv');
  assert.equal(statusRows.length, 4, 'status snapshot has four submitted users');
  const statuses = new Map();
  for (const row of statusRows) {
    const id = row.user_id.trim().toLowerCase();
    assert.ok(!statuses.has(id), `duplicate status for ${id}`);
    assert.ok(['accepted', 'cancelled', 'waitlist'].includes(row.status), `unknown status for ${id}`);
    assert.equal(Date.parse(row.snapshot_at), Date.parse('2026-10-07T18:00:00+08:00'), 'common snapshot time');
    assert.ok(sources.A.submissions.has(id) || sources.B.submissions.has(id), 'status belongs to period submission');
    statuses.set(id, row.status);
  }
  const result = Object.fromEntries(Object.entries(sources).map(([channel, group]) => {
    assert.ok([...group.submissions].every(id => statuses.has(id)), `${channel} submitted users have a status`);
    const current = [...group.submissions].filter(id => statuses.get(id) === 'accepted').length;
    return [channel, {
      visits:group.visits.size, clicks:group.clicks.size, submissions:group.submissions.size, accepted:current,
      submitPerVisit:group.submissions.size / group.visits.size,
      submitPerClick:group.submissions.size / group.clicks.size,
      acceptedPerVisit:current / group.visits.size,
    }];
  }));
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
  assert.deepEqual([result.A.visits, result.A.clicks, result.A.submissions, result.A.accepted], [8, 4, 2, 2]);
  assert.deepEqual([result.B.visits, result.B.clicks, result.B.submissions, result.B.accepted], [6, 3, 2, 0]);
  close(result.A.submitPerVisit, 1/4);
  close(result.B.submitPerVisit, 1/3);
  close(result.A.submitPerClick, 1/2);
  close(result.B.submitPerClick, 2/3);
  close(result.A.acceptedPerVisit, 1/4);
  close(result.B.acceptedPerVisit, 0);
  const totals = Object.values(result).reduce((total, row) => {
    for (const key of ['visits','clicks','submissions','accepted']) total[key] += row[key];
    return total;
  }, {visits:0, clicks:0, submissions:0, accepted:0});
  assert.deepEqual(totals, {visits:14, clicks:7, submissions:4, accepted:2});
  close(totals.submissions/totals.visits, 2/7);
  close(totals.submissions/totals.clicks, 4/7);
  close(totals.accepted/totals.visits, 1/7);
  assert.ok(totals.accepted <= 20, 'accepted count stays within the shared activity capacity');
  // Check the browser-readable table presents the CSV rather than a separate copy.
  const html = fs.readFileSync(file('data-table.html'), 'utf8');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  for (const row of rows) {
    const cells = Object.values(row).map(value => `<td>${escape(value)}</td>`).join('');
    assert.ok(html.includes(`<tr>${cells}</tr>`), `table is missing raw row ${row.row_id}`);
  }
  assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<tr>/g) || []).length, rows.length, 'HTML table includes exactly all raw events');
  const descriptor = fs.readFileSync(path.join(kit, 'tasks-data.js'), 'utf8');
  const task = vm.runInNewContext(`const TASKS = {};\n${descriptor}\nTASKS.data;`);
  assert.equal(task.newRole, true);
  assert.equal(task.sourceDate, '2026-10-07');
  assert.deepEqual(Array.from(task.fields, field => field.phase), ['work','feedback','handoff']);
  assert.deepEqual(Array.from(task.fields, field => field.key), ['analysis','revision','handoff']);
  for (const link of [...task.files, ...task.feedback.files, {path:task.reference.path}]) {
    assert.ok(fs.existsSync(path.join(kit, link.path)), `broken descriptor material link: ${link.path}`);
  }
  assert.ok(!task.files.some(link => /data-status|data-reference/.test(link.path)), 'initial files exclude feedback snapshot and reference');
});
