const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = value => JSON.parse(JSON.stringify(value));
const currentRecord = fields => ({ version: 2, fields, archives: [], timers: {}, updated: null });

function workbook({ stored = {}, hash = '#test', now = 1000000, readError = false, writeError = false } = {}) {
  const root = path.resolve(__dirname, '..');
  const data = new Map(Object.entries(stored));
  const writes = [];
  const nodes = new Map();
  const documentEvents = new Map();
  const windowEvents = new Map();
  const intervals = new Map();
  const downloads = [];
  let intervalId = 0;
  let pendingHash = false;
  let route = hash;
  const register = (map, name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };

  function element(id = '', tagName = 'DIV') {
    const localEvents = new Map();
    const childIds = [];
    let html = '';
    const el = {
      id, tagName, textContent: '', hidden: false, value: '', checked: false, dataset: {}, type: '',
      files: [], disabled: false, style: {}, className: '', focused: false, localEvents,
      focus() { this.focused = true; }, scrollIntoView() {}, select() {}, remove() { if (id) nodes.delete(id); }, appendChild() {},
      setAttribute(name, value) { this[name] = String(value); },
      addEventListener(name, fn) { register(localEvents, name, fn); },
      closest(selector) {
        if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1)) ? this : null;
        const match = selector.match(/^\[data-([a-z-]+)\]$/);
        const key = match && match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        return key && Object.hasOwn(this.dataset, key) ? this : null;
      },
      click() { for (const fn of localEvents.get('click') || []) fn({ target: this }); },
      get innerHTML() { return html; },
      set innerHTML(value) {
        html = String(value);
        for (const oldId of childIds.splice(0)) nodes.delete(oldId);
        const tags = /<([a-z][\w-]*)\b([^>]*)>/gi;
        let match;
        while ((match = tags.exec(html))) {
          const foundId = match[2].match(/\bid=["']([^"']+)["']/);
          if (!foundId) continue;
          const child = element(foundId[1], match[1].toUpperCase());
          const close = html.indexOf(`</${match[1]}>`, tags.lastIndex);
          const content = close < 0 ? '' : html.slice(tags.lastIndex, close);
          child.textContent = decode(content.replace(/<[^>]*>/g, ''));
          child.value = match[1].toLowerCase() === 'textarea' ? decode(content) : decode((match[2].match(/\bvalue=["']([^"']*)["']/) || [])[1] || '');
          child.type = (match[2].match(/\btype=["']([^"']+)["']/) || [])[1] || '';
          child.hidden = /\bhidden\b/.test(match[2]);
          nodes.set(child.id, child);
          childIds.push(child.id);
        }
      }
    };
    return el;
  }

  const body = element('body', 'BODY');
  const index = fs.readFileSync(`${root}/index.html`, 'utf8');
  body.innerHTML = index;
  const document = {
    body, getElementById: id => nodes.get(id) || null,
    createElement: tag => element('', tag.toUpperCase()),
    addEventListener: (name, fn) => register(documentEvents, name, fn),
    execCommand: () => true
  };
  const window = { addEventListener: (name, fn) => register(windowEvents, name, fn), scrollTo() {} };
  const location = {
    get hash() { return route; },
    set hash(value) { const next = value.startsWith('#') ? value : '#' + value; if (next !== route) { route = next; pendingHash = true; } }
  };
  const sandbox = {
    document, window, location,
    localStorage: {
      getItem(key) { if (readError) throw Error('read denied'); return data.has(key) ? data.get(key) : null; },
      setItem(key, value) { if (writeError) throw Error('quota'); data.set(key, value); writes.push({ key, value }); }
    },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    setInterval(fn) { const id = ++intervalId; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout() { return 1; }, clearTimeout() {}, Blob,
    URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:test-download-' + downloads.length; }, revokeObjectURL() {} },
    navigator: {}, console
  };
  window.localStorage = sandbox.localStorage;
  vm.createContext(sandbox);
  const scripts = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(match => match[1]);
  for (const file of scripts) vm.runInContext(fs.readFileSync(`${root}/${file}`, 'utf8'), sandbox, { filename: `${root}/${file}` });
  const run = code => vm.runInContext(code, sandbox);
  async function dispatch(map, name, target) {
    const event = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of map.get(name) || []) await fn(event);
    return event;
  }
  async function flushHash() {
    if (!pendingHash) return;
    pendingHash = false;
    await dispatch(windowEvents, 'hashchange', window);
  }
  return {
    run, data, writes, node: id => nodes.get(id) || null,
    async clickId(id) {
      const target = nodes.get(id);
      assert.ok(target, `actual rendered control #${id} is present`);
      await dispatch(target.localEvents, 'click', target);
      await dispatch(documentEvents, 'click', target);
      await flushHash();
    },
    async navigate(id) {
      assert.ok((nodes.get('navigation').innerHTML + nodes.get('main').innerHTML).includes(`data-go="${id}"`), `navigation control ${id} is present`);
      const target = element(); target.dataset.go = id;
      await dispatch(documentEvents, 'click', target);
      await flushHash();
    },
    async skip() {
      assert.match(index, /<a\b[^>]*href=["']#main["'][^>]*class=["']skip["']/);
      const target = element('', 'A'); target.className = 'skip'; target.href = '#main';
      const event = await dispatch(documentEvents, 'click', target);
      if (!event.defaultPrevented) location.hash = '#main';
      await flushHash();
      return event;
    },
    async exportJSON() {
      assert.ok(nodes.get('main').innerHTML.includes('data-export="json"'), 'actual JSON export control is present');
      const target = element('', 'BUTTON'); target.dataset.export = 'json';
      await dispatch(documentEvents, 'click', target);
      assert.ok(downloads.length > 0, 'actual export generated a Blob');
      return downloads.at(-1);
    },
    async input(key, value, type = 'textarea') {
      assert.ok(nodes.get('main').innerHTML.includes(`data-field="${key}"`), `actual rendered field ${key} is present`);
      const target = element(); target.dataset.field = key; target.type = type;
      if (type === 'checkbox') target.checked = value; else target.value = value;
      await dispatch(documentEvents, 'input', target);
    },
    async importFile(incoming) {
      const target = nodes.get('import-file');
      assert.ok(target, 'actual import-file input is present');
      const text = JSON.stringify(incoming);
      target.files = [{ size: Buffer.byteLength(text), text: async () => text }];
      await dispatch(target.localEvents, 'change', target);
      await dispatch(documentEvents, 'change', target);
    },
    async importBlob(blob) {
      const target = nodes.get('import-file');
      assert.ok(target, 'actual import-file input is present');
      target.files = [blob];
      await dispatch(target.localEvents, 'change', target);
      await dispatch(documentEvents, 'change', target);
    },
    async unload() { await dispatch(windowEvents, 'beforeunload', window); },
    advance(ms) { now += ms; for (const fn of [...intervals.values()]) fn(); },
    time: () => now
  };
}

test('v2 实际 input 与卸载都不覆盖损坏记录，填写仍可从 report 导出', async () => {
  const raw = '{"version":2,"fields":{"test_cases":"原答案"},';
  const page = workbook({ stored: { 'career-field-notes-v2': raw } });
  await page.input('test_cases', '当前内存成果');
  await page.unload();
  assert.equal(page.data.get('career-field-notes-v2'), raw);
  assert.equal(page.writes.length, 0);
  assert.equal(page.run('session.saveAllowed'), false);
  assert.match(page.run('report()'), /当前内存成果/);
  assert.match(page.node('save-status').textContent, /内存|禁止|无法|损坏/);
});

test('v2 实际 JSON 导入保留当前 false 和文字，补入空答案', async () => {
  const page = workbook();
  await page.input('test_done', false, 'checkbox');
  await page.input('test_check_0', false, 'checkbox');
  await page.input('test_cases', '当前自己的用例');
  await page.navigate('compare');
  await page.importFile(currentRecord({ test_done: true, test_check_0: true, test_cases: '备份旧用例', test_verification: '备份修复确认与回归证据' }));
  assert.equal(page.run('value("test_done")'), false);
  assert.equal(page.run('value("test_check_0")'), false);
  assert.equal(page.run('value("test_cases")'), '当前自己的用例');
  assert.equal(page.run('value("test_verification")'), '备份修复确认与回归证据');
  assert.equal(JSON.parse(page.data.get('career-field-notes-v2')).fields.test_done, false);
});

test('v2 实际点击当前方向不重置35分钟，离开暂停，重载继续运行', async () => {
  const page = workbook();
  await page.clickId('timer-toggle');
  page.advance(600000);
  assert.equal(page.node('timer-display').textContent, '35:00');
  await page.navigate('test');
  assert.equal(page.node('timer-display').textContent, '35:00');
  await page.navigate('compare');
  page.advance(600000);
  await page.navigate('test');
  assert.equal(page.node('timer-display').textContent, '35:00');
  await page.clickId('timer-toggle');
  const reloaded = workbook({ stored: Object.fromEntries(page.data), now: page.time() + 600000 });
  assert.equal(reloaded.node('timer-display').textContent, '25:00');
  await reloaded.clickId('timer-reset');
  assert.equal(reloaded.node('timer-display').textContent, '45:00');
});

test('v2 实际初始化与输入保留旧记录，report 使用旧标签并保留未知旧字段', async () => {
  const old = { version: 1, fields: { test_cases: '旧版六条完整用例', product_wireframe: '旧版线框证据', compare_choices: '旧版两个选择', old_custom_note: '历史未知字段原值' }, updated: '2026-10-01' };
  const raw = JSON.stringify(old);
  const page = workbook({ stored: { 'career-field-notes-v1': raw } });
  assert.deepEqual(plain(page.run('record.fields')), {});
  await page.input('test_cases', '新版四条风险用例');
  assert.equal(page.data.get('career-field-notes-v1'), raw);
  assert.ok(page.writes.every(write => write.key === 'career-field-notes-v2'));
  const text = page.run('report()');
  assert.match(text, /旧版|v1|第一版/i);
  assert.match(text, /我的 6 条测试用例/);
  assert.match(text, /旧版六条完整用例/);
  assert.match(text, /页面草图与验收条件/);
  assert.match(text, /旧版线框证据/);
  assert.match(text, /历史未知字段原值/);
  assert.match(text, /新版四条风险用例/);
});

test('v2 对照页显示实际阶段、复核意愿和具体证据，而不只显示主观选择', async () => {
  const page = workbook();
  await page.input('test_stage', '已复核并留下交接', 'select-one');
  await page.input('test_review', '愿意再改一轮', 'select-one');
  await page.input('test_cases', '第二次复现后定位了同邮箱大小写问题');
  await page.input('test_verification', '原缺陷确认通过，关联容量回归通过');
  await page.input('test_handoff', '尚未覆盖多个浏览器，建议下一轮复核');
  await page.input('test_moment', '最投入的是用相同步骤对比两个版本');
  await page.navigate('compare');
  const html = page.node('main').innerHTML;
  assert.match(html, /已复核并留下交接/);
  assert.match(html, /愿意再改一轮/);
  assert.match(html, /第二次复现后定位了同邮箱大小写问题/);
  assert.match(html, /原缺陷确认通过，关联容量回归通过/);
  assert.match(html, /尚未覆盖多个浏览器，建议下一轮复核/);
  assert.match(html, /最投入的是用相同步骤对比两个版本/);
  assert.match(page.run('report()'), /已复核并留下交接/);
});

test('v2 合法大记录实际导出超过 1 MB 的 JSON，仍可完整导入恢复', async () => {
  const page = workbook();
  const groups = [
    ['test', ['cases', 'verification', 'handoff']],
    ['build', ['approach', 'change', 'handoff']],
    ['product', ['plan', 'revision', 'handoff']],
    ['content', ['draft', 'revision', 'handoff']]
  ];
  const expected = {};
  for (const [role, fields] of groups) {
    await page.navigate(role);
    for (const key of fields) {
      const name = role + '_' + key;
      const prefix = name + ': ';
      expected[name] = prefix + '文'.repeat(30000 - prefix.length);
      await page.input(name, expected[name]);
    }
  }
  await page.navigate('compare');
  const blob = await page.exportJSON();
  assert.ok(blob.size > 1000000, 'fixture is an actual exported backup over the previous 1 MB limit');
  const exported = JSON.parse(await blob.text());
  assert.equal(Object.keys(exported.fields).length, 12);
  const fresh = workbook({ hash: '#compare' });
  await fresh.importBlob(blob);
  assert.equal(fresh.run('Object.keys(record.fields).length'), 12, 'all 12 valid fields were restored from the actual exported file');
  for (const [key, text] of Object.entries(expected)) {
    assert.equal(fresh.run(`value(${JSON.stringify(key)})`) === text, true, key + ' restored exactly');
  }
  assert.equal(JSON.parse(fresh.data.get('career-field-notes-v2')).fields.content_handoff === expected.content_handoff, true, 'restored large record was persisted');
});

test('v2 跳到主要内容只移动焦点，保留当前任务、hash 和运行计时', async () => {
  const page = workbook();
  await page.clickId('timer-toggle');
  page.advance(600000);
  const deadline = page.run('record.timers.test.deadline');
  const before = page.writes.length;
  const event = await page.skip();
  assert.equal(page.run('currentPage'), 'test', 'skip does not render the welcome page');
  assert.equal(page.run('location.hash'), '#test');
  assert.equal(event.defaultPrevented, true);
  assert.equal(page.node('main').focused, true);
  assert.equal(page.run('record.timers.test.deadline'), deadline, 'skip does not pause the active timer');
  assert.equal(page.node('timer-display').textContent, '35:00');
  assert.equal(page.writes.length, before, 'skip causes no storage mutation');
  page.advance(60000);
  assert.equal(page.node('timer-display').textContent, '34:00');
});

test('扩展目录的10项任务均进入导航、对照与进度，原字段兼容', async () => {
  const prior = currentRecord({test_cases:'用户原有测试记录', product_plan:'用户原有产品方案'});
  const page = workbook({stored:{'career-field-notes-v2':JSON.stringify(prior)}});
  assert.equal(page.run('ids.length'), 10);
  for (const role of ['data', 'ai', 'security', 'ecommerce', 'logistics', 'ux']) {
    await page.navigate(role);
    assert.equal(page.run('currentPage'), role);
    const key = page.run(`TASKS[${JSON.stringify(role)}].fields.find(item => item.phase === 'work').key`);
    await page.input(role + '_' + key, role + ' 的本人初版证据');
  }
  await page.input('ux_done', true, 'checkbox');
  assert.match(page.node('progress').textContent, /1 \/ 10/);
  assert.equal(page.run('value("test_cases")'), '用户原有测试记录');
  assert.equal(page.run('value("product_plan")'), '用户原有产品方案');
  await page.navigate('compare');
  for (const text of ['数据分析', 'AI 应用开发', '安全分析', 'data 的本人初版证据', 'ai 的本人初版证据', 'security 的本人初版证据']) assert.ok(page.node('main').innerHTML.includes(text), text);
});

test('六个扩展方向实际JSON导出/导入完整，旧v1按旧4题标签保留', async () => {
  const old = {version:1,fields:{test_cases:'旧六用例',product_wireframe:'旧线框',old_custom:'保留未知旧字段'}};
  const page = workbook({stored:{'career-field-notes-v1':JSON.stringify(old)}});
  const expected = {};
  for (const role of ['data', 'ai', 'security', 'ecommerce', 'logistics', 'ux']) {
    await page.navigate(role);
    const keys = plain(page.run(`TASKS[${JSON.stringify(role)}].fields.map(item => item.key)`));
    for (const key of keys) {
      expected[role + '_' + key] = role + '/' + key + ' 真实记录';
      await page.input(role + '_' + key, expected[role + '_' + key]);
    }
  }
  await page.navigate('compare');
  const blob = await page.exportJSON();
  assert.equal(JSON.parse(await blob.text()).version, 2, '兼容既有备份schema');
  const target = workbook({hash:'#compare'});
  await target.importBlob(blob);
  for (const [key, text] of Object.entries(expected)) assert.equal(target.run(`value(${JSON.stringify(key)})`), text);
  assert.equal(target.run('record.archives.length'), 1);
  const report = target.run('report()');
  assert.match(report, /我的 6 条测试用例/);
  assert.match(report, /旧六用例/);
  assert.match(report, /旧线框/);
  assert.match(report, /保留未知旧字段/);
  assert.match(report, /AI 应用开发/);
  await target.navigate('history');
  assert.match(target.node('main').innerHTML, /旧版归档 1/);
  assert.match(target.node('main').innerHTML, /旧六用例/);
});

test('六个扩展方向计时独立且往返不重置，导入不套用其它方向计时', async () => {
  const page = workbook();
  for (const role of ['data', 'ai', 'security', 'ecommerce', 'logistics', 'ux']) {
    await page.navigate(role);
    assert.equal(page.node('timer-display').textContent, '45:00');
    await page.clickId('timer-toggle');
    page.advance(300000);
    assert.equal(page.node('timer-display').textContent, '40:00');
    await page.navigate('compare');
  }
  page.advance(900000);
  for (const role of ['data', 'ai', 'security', 'ecommerce', 'logistics', 'ux']) {
    await page.navigate(role);
    assert.equal(page.node('timer-display').textContent, '40:00');
  }
  assert.equal(page.run('record.timers.test'), undefined);
});

test('v4 home groups only current three additions, and exports current version while retaining schema2', async () => {
  const page = workbook({hash:'#welcome'});
  assert.equal(page.run('APP_INFO.version'),4);
  assert.deepEqual(plain(page.run('APP_INFO.newRoles')),['ecommerce','logistics','ux']);
  const html = page.node('main').innerHTML;
  assert.match(html,/VERSION 4/);
  assert.match(html,/新增 3 种/);
  assert.match(html,/独立/);
  assert.ok(!html.includes('本聊天'));
  assert.match(page.run('report()'),/记录 · v4/);
  await page.navigate('compare');
  const blob = await page.exportJSON();
  assert.equal(JSON.parse(await blob.text()).version,2);
});
