'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const materials = path.resolve(__dirname, '..', 'materials');
const html = fs.readFileSync(path.join(materials, 'ai-workbench.html'), 'utf8');
const core = fs.readFileSync(path.join(materials, 'ai-core.js'), 'utf8');
const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(text => text.trim());
const decode = value => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[key]));

function page() {
  const elements = new Map();
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const node = { id, value: '', checked: false, textContent: '', className: '', listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      focus() { this.focused = true; }, select() { this.selected = true; },
      closest() { return { setAttribute() {} }; } };
    let content = '';
    Object.defineProperty(node, 'innerHTML', { get: () => content, set: value => { content = value; parseMarkup(value); } });
    elements.set(id, node);
    return node;
  }
  function parseMarkup(markup) {
    for (const match of markup.matchAll(/\bid="([^"]+)"/g)) element(match[1]);
    for (const match of markup.matchAll(/<textarea\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) element(match[1]).value = decode(match[2]);
    for (const match of markup.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<option\s+value="([^"]*)"/g)) element(match[1]).value = decode(match[2]);
  }
  parseMarkup(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
  const document = {
    getElementById(id) { assert.ok(elements.has(id), 'UI请求了不存在的元素：' + id); return elements.get(id); },
    body: { appendChild() {} }, createElement() { return { click() {}, remove() {} }; }
  };
  const context = { document, navigator: {}, window: { confirm: () => true }, setTimeout: () => 1,
    URL: { createObjectURL: () => 'blob:offline', revokeObjectURL() {} }, Blob: class {} };
  vm.createContext(context);
  vm.runInContext(core, context, { filename: 'ai-core.js' });
  for (const script of inline) vm.runInContext(script, context, { filename: 'ai-workbench-inline.js' });
  return { get: id => elements.get(id), click: id => elements.get(id).listeners.click(), context };
}

function keepBaseline(ui) {
  ui.click('run');
  ui.get('verdict-0').value = '失败';
  ui.get('reason-0').value = '实际来源为归档K00，时间与地点不是本次活动。';
  ui.click('keep-v1');
  return ui.get('saved-v1').value;
}

test('注册事件保留实际V1配置、trace和本人判定，规则修改不会改变V1快照', () => {
  const ui = page();
  const original = keepBaseline(ui);
  const v1 = JSON.parse(original);
  assert.equal(v1.config.activeOnly, false);
  assert.equal(v1.cases.length, 5);
  assert.equal(v1.cases[0].actual.sources[0].id, 'K00');
  assert.equal(v1.cases[0].actual.trace.selected.id, 'K00');
  assert.equal(v1.cases[0].pass_fail, '失败');
  assert.match(v1.cases[0].reason, /归档K00/);
  ui.get('config').value = JSON.stringify({ activeOnly: true, unknownMode: 'refuse', aliases: { '摄影器材': '设备' }, includeSource: true });
  ui.get('question-E06').value = '借来的摄影器材能参加吗？';
  ui.get('expected-E06').value = '来源K02/v2，说明手机即可。';
  ui.click('run');
  ui.click('keep-v2');
  const v2 = JSON.parse(ui.get('saved-v2').value);
  assert.equal(v2.cases.length, 6);
  assert.equal(v2.cases[0].actual.sources[0].id, 'K01');
  assert.equal(v2.cases[1].actual.sources[0].id, 'K02');
  assert.equal(v2.cases[4].actual.decision, 'refuse');
  assert.equal(v2.cases[5].actual.sources[0].id, 'K02');
  assert.equal(ui.get('saved-v1').value, original);
  assert.deepEqual(JSON.parse(ui.get('saved-all').value).rounds.V1, v1);
});

test('运行非法JSON或字段后清空本次结果，不回退旧规则、不破坏已保留两轮', () => {
  const ui = page();
  const original = keepBaseline(ui);
  for (const invalid of ['{bad json', '{"activeOnly":"true","unknownMode":"refuse","aliases":{},"includeSource":true}']) {
    ui.get('config').value = invalid;
    ui.click('run');
    assert.equal(ui.get('results').innerHTML, '');
    assert.match(ui.get('status').textContent, /运行失败/);
    assert.match(ui.get('status').textContent, /没有继续使用旧规则/);
    assert.equal(ui.get('saved-v1').value, original);
    ui.click('keep-v2');
    assert.match(ui.get('status').textContent, /先成功运行/);
    assert.equal(ui.get('saved-v2').value, '');
  }
});

test('编辑后的未运行规则不得伪配旧输出；V2要求新问题与运行前预期', () => {
  const ui = page();
  ui.click('run');
  const config = JSON.parse(ui.get('config').value);
  config.activeOnly = true;
  ui.get('config').value = JSON.stringify(config);
  ui.click('keep-v1');
  assert.match(ui.get('status').textContent, /已改变/);
  assert.equal(ui.get('saved-v1').value, '');
  ui.click('run');
  ui.click('keep-v2');
  assert.match(ui.get('status').textContent, /自写题/);
  assert.equal(ui.get('saved-v2').value, '');
  ui.get('question-E06').value = '只带手机可以吗？';
  ui.click('run');
  assert.match(ui.get('status').textContent, /E06/);
  assert.equal(ui.get('results').innerHTML, '');
});

test('file环境没有剪贴板接口时可选择两轮完整文本，保留可用复制退路', async () => {
  const ui = page();
  keepBaseline(ui);
  await ui.click('copy-all');
  assert.equal(ui.get('saved-all').selected, true);
  assert.match(ui.get('status').textContent, /Ctrl\+C/);
  assert.equal(JSON.parse(ui.get('saved-all').value).rounds.V1.cases[0].actual.sources[0].id, 'K00');
});
