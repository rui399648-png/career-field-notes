'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const moduleFile = path.resolve(__dirname, '..', 'state-core.js');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(moduleFile, 'utf8'), sandbox, { filename: moduleFile });
const api = sandbox.module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

function storage(initial = {}, options = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  return {
    data, writes,
    getItem(key) { if (options.readError) throw Error('read denied'); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { if (options.writeError) throw Error('quota exceeded'); writes.push(key); data.set(key, value); }
  };
}

test('首次进入不声称已保存，填写后真实写入 v2 键', () => {
  const disk = storage();
  const session = api.load(disk);
  assert.deepEqual(plain(session.state), { version: 2, fields: {}, archives: [], timers: {}, updated: null });
  assert.equal(session.saveAllowed, true);
  assert.equal(session.persisted, false);
  assert.equal(disk.writes.length, 0);
  session.state.fields.test_cases = '六条自己的用例';
  assert.equal(api.save(disk, session), true);
  assert.equal(session.persisted, true);
  assert.deepEqual(disk.writes, ['career-field-notes-v2']);
  assert.equal(JSON.parse(disk.data.get(api.KEY)).fields.test_cases, '六条自己的用例');
});

test('当前记录损坏或版本不兼容时仅保留内存，不覆盖原始字符串', () => {
  for (const raw of ['', '{"version":2,"fields":', JSON.stringify({ version: 1, fields: { old: '记录' } }), JSON.stringify({ version: 2, fields: [] })]) {
    const disk = storage({ 'career-field-notes-v2': raw });
    const session = api.load(disk);
    assert.equal(session.saveAllowed, false);
    assert.equal(session.persisted, false);
    assert.equal(session.rawBackup, raw);
    assert.match(session.message, /损坏|不兼容|格式/);
    session.state.fields.test_cases = '这次仍可继续填写';
    assert.equal(api.save(disk, session), false);
    assert.equal(disk.writes.length, 0);
    assert.equal(disk.data.get(api.KEY), raw);
    assert.equal(session.state.fields.test_cases, '这次仍可继续填写');
  }
});

test('读取异常后继续填写也不能把旧磁盘记录覆盖为空', () => {
  const raw = JSON.stringify({ version: 2, fields: { test_cases: '此前成果' }, archives: [], timers: {}, updated: null });
  const disk = storage({ 'career-field-notes-v2': raw }, { readError: true });
  const session = api.load(disk);
  assert.equal(session.saveAllowed, false);
  assert.equal(session.persisted, false);
  assert.equal(session.rawBackup, null);
  assert.match(session.message, /读取/);
  session.state.fields.test_cases = '当前内存填写';
  assert.equal(api.save(disk, session), false);
  assert.equal(disk.data.get(api.KEY), raw);
  assert.equal(disk.writes.length, 0);
});

test('旧版完整归档，当前答案留空，保存和重新加载都不写旧键', () => {
  const old = { version: 1, fields: { test_cases: '旧版六条用例', test_done: false, extra_old_field: { original: 7 } }, updated: '2026-10-01T00:00:00Z', custom: ['完整原值'] };
  const raw = JSON.stringify(old);
  const disk = storage({ 'career-field-notes-v1': raw });
  const session = api.load(disk);
  assert.deepEqual(plain(session.state.fields), {});
  assert.deepEqual(plain(session.state.archives), [old]);
  assert.equal(session.persisted, false);
  assert.equal(session.saveAllowed, true);
  assert.equal(api.save(disk, session), true);
  assert.equal(disk.data.get(api.LEGACY_KEY), raw);
  assert.deepEqual(disk.writes, [api.KEY]);
  assert.deepEqual(plain(api.load(disk).state.archives), [old]);
});

test('配额失败不丢内存、不显示保存成功，并允许恢复后重试', () => {
  const settings = { writeError: false };
  const disk = storage({}, settings);
  const session = api.load(disk);
  session.state.fields.test_cases = '第一版';
  assert.equal(api.save(disk, session), true);
  const saved = disk.data.get(api.KEY);
  settings.writeError = true;
  session.state.fields.test_cases = '第二版还在内存';
  assert.equal(api.save(disk, session), false);
  assert.equal(session.persisted, false);
  assert.equal(session.saveAllowed, true);
  assert.match(session.message, /内存/);
  assert.match(session.message, /导出/);
  assert.equal(session.state.fields.test_cases, '第二版还在内存');
  assert.equal(disk.data.get(api.KEY), saved);
  settings.writeError = false;
  assert.equal(api.save(disk, session), true);
  assert.equal(session.persisted, true);
});

test('两会话先后编辑时拒绝旧快照覆盖，保留另一页成果和本页待导出答案', () => {
  const disk = storage();
  const firstPage = api.load(disk);
  const stalePage = api.load(disk);
  firstPage.state.fields.test_cases = '另一页刚保存的测试证据';
  assert.equal(api.save(disk, firstPage), true);
  const saved = disk.data.get(api.KEY);
  stalePage.state.fields.build_approach = '本页尚未保存的实现';
  assert.equal(api.save(disk, stalePage), false);
  assert.equal(disk.data.get(api.KEY), saved);
  assert.equal(stalePage.state.fields.build_approach, '本页尚未保存的实现');
  assert.equal(stalePage.saveAllowed, false);
  assert.equal(stalePage.persisted, false);
  assert.equal(stalePage.rawBackup, null);
  assert.match(stalePage.message, /另一.*页|其他.*页/);
  assert.match(stalePage.message, /导出/);
  assert.match(stalePage.message, /刷新/);
  stalePage.state.fields.build_approach += '，又写了下一步';
  assert.equal(api.save(disk, stalePage), false);
  assert.equal(disk.writes.length, 1);
  assert.equal(disk.data.get(api.KEY), saved);
  assert.equal(api.load(disk).state.fields.test_cases, '另一页刚保存的测试证据');
});

test('另一页导入新旧版归档后，旧会话编辑不能抹掉该归档', () => {
  const disk = storage();
  const setup = api.load(disk);
  setup.state.fields.test_cases = '已有新版证据';
  assert.equal(api.save(disk, setup), true);
  const importPage = api.load(disk);
  const stalePage = api.load(disk);
  const legacy = { version: 1, fields: { content_draft: '需要保留的旧稿' }, updated: '2026-10-01' };
  importPage.state = api.mergeBackup(importPage.state, legacy, []).state;
  assert.equal(api.save(disk, importPage), true);
  const saved = disk.data.get(api.KEY);
  stalePage.state.fields.content_draft = '本页的新稿';
  assert.equal(api.save(disk, stalePage), false);
  assert.equal(disk.data.get(api.KEY), saved);
  assert.deepEqual(JSON.parse(saved).archives, [legacy]);
  assert.equal(stalePage.state.fields.content_draft, '本页的新稿');
  assert.equal(stalePage.saveAllowed, false);
  assert.equal(stalePage.persisted, false);
  assert.equal(stalePage.rawBackup, null);
});

test('保存前重新读取发生异常时停止覆盖，已有记录和本页内存都保留', () => {
  const settings = { readError: false };
  const disk = storage({}, settings);
  const session = api.load(disk);
  session.state.fields.test_cases = '已保存的证据';
  assert.equal(api.save(disk, session), true);
  const saved = disk.data.get(api.KEY);
  session.state.fields.test_cases = '仍在内存的修订证据';
  settings.readError = true;
  assert.equal(api.save(disk, session), false);
  assert.equal(disk.data.get(api.KEY), saved);
  assert.equal(disk.writes.length, 1);
  assert.equal(session.state.fields.test_cases, '仍在内存的修订证据');
  assert.equal(session.saveAllowed, false);
  assert.equal(session.persisted, false);
  assert.equal(session.rawBackup, null);
  assert.match(session.message, /读取|核对/);
  assert.match(session.message, /导出/);
  assert.match(session.message, /刷新/);
  settings.readError = false;
  assert.equal(api.save(disk, session), false);
  assert.equal(disk.data.get(api.KEY), saved);
});

test('补入备份保护既存 false 和文字，只恢复允许且类型正确的空字段', () => {
  const state = api.empty();
  state.fields = { test_done: false, test_check_0: false, test_cases: '当前用例', compare_action: '' };
  const incoming = { version: 2, fields: {
    test_done: true, test_check_0: true, test_cases: '旧版用例', compare_action: '换场景再做',
    test_bug: '正常缺陷文本', test_check_1: true, product_done: 'true', product_plan: 8,
    content_draft: '字'.repeat(30001), content_revision: '字'.repeat(30000), unknown_key: '不应导入'
  }, archives: [] };
  const allowed = new Set(['test_done', 'test_check_0', 'test_check_1', 'test_cases', 'test_bug', 'compare_action', 'product_done', 'product_plan', 'content_draft', 'content_revision']);
  const result = api.mergeBackup(state, incoming, allowed);
  assert.equal(result.state.fields.test_done, false);
  assert.equal(result.state.fields.test_check_0, false);
  assert.equal(result.state.fields.test_cases, '当前用例');
  assert.equal(result.state.fields.compare_action, '换场景再做');
  assert.equal(result.state.fields.test_bug, '正常缺陷文本');
  assert.equal(result.state.fields.test_check_1, true);
  assert.equal(result.state.fields.content_revision.length, 30000);
  for (const key of ['product_done', 'product_plan', 'content_draft', 'unknown_key']) assert.equal(Object.hasOwn(result.state.fields, key), false);
  assert.equal(result.count, 4);
  assert.equal(result.archived, 0);
  assert.deepEqual(plain(state.fields), { test_done: false, test_check_0: false, test_cases: '当前用例', compare_action: '' });
});

test('旧版备份只完整归档，重复恢复不重复归档，新版备份携带的归档也保留', () => {
  const old = { version: 1, fields: { test_cases: '不混入新版答案', test_done: false, custom: ['原值', 9] }, updated: '2026-10-01', note: { source: '旧版' } };
  const state = api.empty();
  state.fields.test_cases = '新版已写';
  const first = api.mergeBackup(state, old, ['test_cases', 'test_done']);
  assert.deepEqual(plain(first.state.fields), { test_cases: '新版已写' });
  assert.equal(first.count, 0);
  assert.equal(first.archived, 1);
  assert.deepEqual(plain(first.state.archives), [old]);
  assert.deepEqual(plain(state.archives), []);
  const again = api.mergeBackup(first.state, old, []);
  assert.equal(again.archived, 0);
  assert.deepEqual(plain(again.state.archives), [old]);
  const other = { version: 1, fields: { content_draft: '另一次旧稿' }, updated: '2026-10-02' };
  const v2 = api.mergeBackup(again.state, { version: 2, fields: {}, archives: [old, other] }, []);
  assert.equal(v2.archived, 1);
  assert.deepEqual(plain(v2.state.archives), [old, other]);
});

test('45 分钟计时在方向往返及存储重载后继续按原截止时间运行', () => {
  const disk = storage();
  const session = api.load(disk);
  const now = 1000000;
  api.startTimer(session.state, 'test', now);
  assert.equal(api.remaining(session.state, 'test', now + 600000), 2100000);
  const originalDeadline = session.state.timers.test.deadline;
  api.startTimer(session.state, 'product', now + 600000);
  assert.equal(api.remaining(session.state, 'test', now + 600000), 2100000);
  api.startTimer(session.state, 'test', now + 600000);
  assert.equal(session.state.timers.test.deadline, originalDeadline);
  assert.equal(api.save(disk, session), true);
  const reloaded = api.load(disk);
  assert.equal(api.remaining(reloaded.state, 'test', now + 1200000), 1500000);
  assert.equal(reloaded.state.timers.test.started, true);
  assert.equal(reloaded.state.timers.test.deadline, originalDeadline);
  assert.equal(api.remaining(reloaded.state, 'content', now + 1200000), 2700000);
  assert.equal(Object.hasOwn(reloaded.state.timers, 'content'), false);
});

test('暂停保存剩余时间，重新加载后暂停时间不流失，继续从剩余时间开始', () => {
  const disk = storage();
  const session = api.load(disk);
  api.startTimer(session.state, 'test', 0);
  api.pauseTimer(session.state, 'test', 600000);
  assert.deepEqual(plain(session.state.timers.test), { remainingMs: 2100000, deadline: null, started: true });
  assert.equal(api.remaining(session.state, 'test', 1200000), 2100000);
  api.save(disk, session);
  const reloaded = api.load(disk);
  assert.equal(api.remaining(reloaded.state, 'test', 1800000), 2100000);
  api.startTimer(reloaded.state, 'test', 1800000);
  assert.equal(reloaded.state.timers.test.deadline, 3900000);
  assert.equal(api.remaining(reloaded.state, 'test', 2400000), 1500000);
});

test('时间截止不出现负数、不自行重新开始，仅明确重置恢复参考时长', () => {
  const state = api.empty();
  api.startTimer(state, 'test', 0);
  api.startTimer(state, 'product', 1000);
  assert.equal(api.remaining(state, 'test', 2699999), 1);
  assert.equal(api.remaining(state, 'test', 2700000), 0);
  assert.equal(api.remaining(state, 'test', 9999999), 0);
  api.pauseTimer(state, 'test', 9999999);
  api.startTimer(state, 'test', 9999999);
  assert.deepEqual(plain(state.timers.test), { remainingMs: 0, deadline: null, started: true });
  const otherDeadline = state.timers.product.deadline;
  api.resetTimer(state, 'test');
  assert.deepEqual(plain(state.timers.test), { remainingMs: 2700000, deadline: null, started: false });
  assert.equal(state.timers.product.deadline, otherDeadline);
  api.resetTimer(state, 'content', 60000);
  api.startTimer(state, 'content', 10000);
  assert.equal(api.remaining(state, 'content', 30000), 40000);
});

test('有效 JSON 内部计时或字段结构损坏也保留原始内容并禁止覆盖', () => {
  const broken = [
    { fields: { test_done: 'true' } },
    { fields: { test_cases: { invalid: '对象' } } },
    { timers: { test: null } },
    { timers: { test: { remainingMs: 2100000, deadline: 'broken', started: true } } },
    { timers: { test: { remainingMs: -1, deadline: null, started: false } } },
    { archives: [null] }
  ];
  for (const change of broken) {
    const raw = JSON.stringify({ ...plain(api.empty()), ...change });
    const disk = storage({ 'career-field-notes-v2': raw });
    const session = api.load(disk);
    assert.equal(session.saveAllowed, false);
    assert.equal(session.rawBackup, raw);
    assert.equal(api.save(disk, session), false);
    assert.equal(disk.data.get(api.KEY), raw);
  }
});
