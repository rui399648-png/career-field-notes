'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const filename = path.resolve(__dirname, '..', 'materials', 'ai-core.js');
const context = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
const api = context.module.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const repaired = { activeOnly: true, unknownMode: 'refuse', aliases: { '摄影器材': '设备', '拍照工具': '设备' }, includeSource: true };

test('仅当前材料规则过滤归档，来源版本和回答实际改变', () => {
  const question = '活动在哪里、几点开始？';
  const before = api.answer(question, api.INITIAL_CONFIG);
  const after = api.answer(question, repaired);
  assert.equal(before.sources[0].id, 'K00');
  assert.equal(before.sources[0].status, 'archived');
  assert.match(before.response, /13:00/);
  assert.equal(after.sources[0].id, 'K01');
  assert.equal(after.sources[0].version, 'v2');
  assert.match(after.response, /14:00–15:00/);
  assert.match(after.response, /B203/);
  assert.doesNotMatch(after.response, /13:00|A101/);
  assert.equal(after.trace.candidates.find(card => card.id === 'K00').eligible, false);
});

test('证书问题不能带入往期证明；既有手机问题修订后仍有正确来源', () => {
  const certificate = api.answer('参加后有没有证书或学分？', repaired);
  assert.equal(certificate.sources[0].id, 'K03');
  assert.match(certificate.response, /不提供学分或证书/);
  const question = '我没有相机，只有手机，能参加吗？';
  for (const config of [api.INITIAL_CONFIG, repaired]) {
    const result = api.answer(question, config);
    assert.equal(result.sources[0].id, 'K02');
    assert.equal(result.sources[0].status, 'active');
    assert.match(result.response, /手机即可/);
    assert.match(result.response, /零基础/);
  }
});

test('未知模式改变停车答案为拒答，不伪造来源', () => {
  const before = api.answer('能提供停车位吗？', api.INITIAL_CONFIG);
  const after = api.answer('能提供停车位吗？', repaired);
  assert.equal(before.decision, 'guess');
  assert.match(before.response, /没有证据/);
  assert.equal(after.decision, 'refuse');
  assert.match(after.response, /没有说明/);
  assert.match(after.response, /确认/);
  assert.deepEqual(plain(after.sources), []);
  assert.equal(after.trace.selected, null);
});

test('别名规则对自写题生效，同一匹配算法给出真实匹配词', () => {
  const question = '自拟：专业摄影器材是不是必须的？';
  assert.equal(api.answer(question, api.INITIAL_CONFIG).decision, 'guess');
  const result = api.answer(question, repaired);
  assert.equal(result.sources[0].id, 'K02');
  assert.deepEqual(plain(result.trace.aliasMatches), [{ alias: '摄影器材', target: '设备' }]);
  assert.ok(result.trace.candidates.find(card => card.id === 'K02').matchedKeywords.includes('设备'));
  const newQuestion = api.answer('借来的拍照工具够用吗？', repaired);
  assert.equal(newQuestion.sources[0].id, 'K02');
  assert.match(newQuestion.response, /手机即可/);
});

test('任意知识卡摘录来自材料而非题号或固定问句答案表', () => {
  const docs = [{ id: 'CUSTOM', title: '练习新卡', status: 'active', version: 'v9', keywords: ['饮水'], facts: ['饮水点在西侧，现场自取。'] }];
  const result = api.answer('自写问题：饮水怎么安排？', repaired, docs);
  assert.match(result.response, /饮水点在西侧，现场自取/);
  assert.equal(result.sources[0].id, 'CUSTOM');
  assert.equal(result.sources[0].version, 'v9');
  assert.equal(result.trace.selected.id, 'CUSTOM');
});

test('非法JSON或规则字段直接报错，不把坏配置当成功运行', () => {
  assert.throws(() => api.parseConfig('{ broken JSON'), /JSON/);
  for (const change of [
    { activeOnly: 'true' }, { unknownMode: 'invent' }, { includeSource: 1 },
    { aliases: [] }, { aliases: { '器材': 5 } }, { aliases: { '': '设备' } },
    { extra: true }
  ]) assert.throws(() => api.parseConfig(JSON.stringify({ ...repaired, ...change })), /规则|字段|aliases|activeOnly|unknownMode|includeSource/);
  assert.throws(() => api.answer('手机', { ...repaired, activeOnly: 'true' }), /activeOnly/);
  assert.deepEqual(plain(api.parseConfig(JSON.stringify(repaired))), repaired);
});

test('一轮批量运行保留任意题目顺序和规则，来源开关实际控制引用文本', () => {
  const configBefore = JSON.stringify(repaired);
  const questions = ['今天是否提供接送服务？', '手机能参加吗？', '需要证书吗？'];
  const results = api.runBatch(questions, repaired);
  assert.equal(results.length, 3);
  assert.deepEqual(plain(results.map(result => result.question)), questions);
  assert.equal(results[0].decision, 'refuse');
  assert.equal(results[1].sources[0].id, 'K02');
  assert.equal(results[2].sources[0].id, 'K03');
  assert.equal(JSON.stringify(repaired), configBefore);
  assert.match(results[1].response, /K02\/v2/);
  const hiddenCitation = api.answer('手机能参加吗？', { ...repaired, includeSource: false });
  assert.doesNotMatch(hiddenCitation.response, /K02\/v2/);
  assert.equal(hiddenCitation.sources[0].id, 'K02');
});
