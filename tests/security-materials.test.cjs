'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('security materials preserve timeline, source consistency and offline filters', () => {
  const root = path.resolve(__dirname, '..');
  const materials = path.join(root, 'materials');
  const read = name => fs.readFileSync(path.join(materials, name), 'utf8');
  function csv(name) {
    const [head, ...lines] = read(name).trim().split(/\r?\n/);
    const keys = head.split(',');
    return lines.map((line, i) => {
      const values = line.split(',');
      assert.equal(values.length, keys.length, `${name} row ${i + 2}: malformed fields`);
      return Object.fromEntries(keys.map((key, n) => [key, values[n]]));
    });
  }
  const events = csv('security-events.csv');
  const alerts = csv('security-alerts.csv');
  assert.equal(events.length, 24, '24 event rows required');
  assert.equal(alerts.length, 6, '6 alerts required');
  const byId = new Map(events.map(event => [event.row_id, event]));
  assert.equal(byId.size, events.length, 'duplicate event ID');
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    assert.equal(event.row_id, `E${String(i + 1).padStart(2, '0')}`, 'event IDs must be stable');
    assert.ok(event.time.endsWith('+08:00') && Number.isFinite(Date.parse(event.time)), `${event.row_id}: invalid time`);
    if (i) assert.ok(Date.parse(events[i - 1].time) <= Date.parse(event.time), `${event.row_id}: unordered time`);
    assert.match(event.source_ip, /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/, `${event.row_id}: non-document IP`);
    if (event.result === 'failure') assert.ok(event.session_id.startsWith('T'), `${event.row_id}: failed attempt presented as authenticated session`);
  }
  assert.equal(new Set(alerts.map(alert => alert.alert_id)).size, 6, 'duplicate alert ID');
  for (const alert of alerts) {
    assert.ok(Number.isFinite(Date.parse(alert.time)), `${alert.alert_id}: invalid alert time`);
    for (const id of alert.event_rows.split('|')) assert.ok(byId.has(id), `${alert.alert_id}: missing event ${id}`);
    for (const id of alert.actors.split('|')) assert.ok(events.some(event => event.actor_id === id), `${alert.alert_id}: unknown actor ${id}`);
  }
  const getAlert = id => alerts.find(alert => alert.alert_id === id);
  assert.ok(getAlert('A04').event_rows.split('|').includes('E20'), 'A04 must include admin success');
  assert.ok(getAlert('A05').event_rows.split('|').includes('E20'), 'A05 must link back to admin success');
  for (const key of ['actor_id', 'device_id', 'source_ip', 'session_id']) assert.equal(byId.get('E20')[key], byId.get('E22')[key], `login/export mismatch: ${key}`);
  assert.equal(byId.get('E20').result, 'success');
  assert.equal(byId.get('E22').event_type, 'export');
  assert.ok(Date.parse(byId.get('E20').time) < Date.parse(byId.get('E22').time), 'export before login');
  assert.equal(byId.get('E23').reason, 'mfa_denied');
  assert.equal(byId.get('E24').event_type, 'log_health');
  const gapStart = Date.parse('2026-10-07T10:31:00+08:00');
  const gapEnd = Date.parse('2026-10-07T10:35:00+08:00');
  assert.ok(!events.some(event => event.event_type === 'login' && Date.parse(event.time) >= gapStart && Date.parse(event.time) <= gapEnd), 'A06 gap contradicted by login rows');

  const workflow = read('security-workflow.md');
  const tableLines = workflow.split(/\r?\n/).filter(line => /^\| E\d{2} \|/.test(line));
  assert.equal(tableLines.length, events.length, 'workflow table missing event');
  const mfaLabels = {not_applicable:'无关',not_reached:'未到',not_required:'未要求'};
  for (const line of tableLines) {
    const cells = line.split('|').slice(1, -1).map(value => value.trim());
    const event = byId.get(cells[0]);
    const expected = [event.row_id,event.time.slice(11, 16),`${event.actor_id} / ${event.role}`,`${event.source_ip} / ${event.device_id}`,`${event.event_type}→${event.resource}`,`${event.result} / ${event.reason}`,mfaLabels[event.mfa] || event.mfa,event.session_id];
    assert.deepEqual(cells, expected, `${event.row_id}: workflow/CSV drift`);
  }

  const descContext = vm.createContext({TASKS:{existing:{name:'keep'}}});
  vm.runInContext(fs.readFileSync(path.join(root, 'tasks-security.js'), 'utf8'), descContext);
  const task = descContext.TASKS.security;
  assert.equal(descContext.TASKS.existing.name, 'keep', 'descriptor replaces TASKS');
  assert.equal(task.name, '安全分析');
  assert.equal(task.newRole, true);
  assert.equal(task.sourceDate, '2026-10-07');
  assert.equal(task.steps.reduce((sum, step) => sum + parseInt(step[0], 10), 0), 45);
  assert.deepEqual(JSON.parse(JSON.stringify(task.fields.map(field => [field.key, field.phase]))), [['triage','work'],['revision','feedback'],['handoff','handoff']]);
  assert.ok(!JSON.stringify(task.materials).includes('C01'), 'context leaked into initial cards');

  const deskPath = path.join(materials, 'security-desk.html');
  assert.ok(fs.existsSync(deskPath), 'offline filter desk is not implemented');
  const desk = fs.readFileSync(deskPath, 'utf8');
  const dataMatch = desk.match(/<script id="security-data" type="application\/json">([\s\S]*?)<\/script>/);
  const appMatch = desk.match(/<script id="security-app">([\s\S]*?)<\/script>/);
  assert.ok(dataMatch && appMatch, 'missing embedded data or app');
  const embedded = JSON.parse(dataMatch[1]);
  assert.deepEqual(embedded.events, events, 'desk/events CSV drift');
  assert.deepEqual(embedded.alerts, alerts, 'desk/alerts CSV drift');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|https?:\/\//.test(appMatch[1]), 'offline desk attempts network access');
  const appContext = vm.createContext({});
  vm.runInContext(appMatch[1], appContext, {filename:'security-desk.html'});
  assert.equal(typeof appContext.selectSecurityEvents, 'function', 'filter function unavailable');
  const select = (alertId='', kind='', query='') => appContext.selectSecurityEvents(events, alerts, alertId, kind, query).map(event => event.row_id).join('|');
  const before = JSON.stringify({events, alerts});
  assert.equal(select(), events.map(event => event.row_id).join('|'), 'initial view must show all');
  assert.equal(select('A04'), 'E16|E17|E18|E19|E20', 'A04 view loses cross-account evidence');
  assert.equal(select('A04','login',' ADMIN_01 '), 'E18|E19|E20', 'filters must intersect and trim case-insensitive query');
  assert.equal(select('A05','export'), 'E22', 'A05 export not visible');
  assert.equal(select('A04','export'), '', 'incompatible filter must have no results');
  assert.equal(select('A06','','S40'), '', 'query leaks other-alert events');
  assert.equal(select('','','  '), events.map(event => event.row_id).join('|'), 'reset/blank query fails');
  assert.equal(JSON.stringify({events, alerts}), before, 'filter mutates source data');

  function verifyLink(base, href) {
    if (/^(https?:|#)/.test(href)) return;
    const target = path.resolve(path.dirname(base), href.split('#')[0]);
    assert.ok(target.startsWith(root + path.sep), `link escapes kit: ${href}`);
    assert.ok(fs.existsSync(target), `missing local link: ${href}`);
  }
  for (const item of [...task.files, ...task.feedback.files, task.reference]) verifyLink(path.join(root, 'index.html'), item.path);
  for (const file of ['security-workflow.md','security-context.md','security-reference.md','security-desk.html']) {
    const source = read(file);
    const regex = file.endsWith('.md') ? /\]\(([^)]+)\)/g : /(?:href|src)="([^"]+)"/g;
    for (const match of source.matchAll(regex)) verifyLink(path.join(materials, file), match[1]);
  }
});
