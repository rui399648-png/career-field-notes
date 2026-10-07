'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const UX = require('../materials/ux-core.js');
const good = {nickname:'演示读者', slot:'sat', code:'DEMO'};

test('prototype reports actual invalid and successful submissions without real booking', () => {
  const session = UX.createSession();
  const error = session.submit({nickname:'',slot:'',code:'wrong'});
  assert.equal(error.status, 'error');
  assert.equal(error.errors.length, 3);
  assert.equal(error.message, '请检查填写内容。');
  const success = session.submit(good);
  assert.equal(success.status, 'confirmed');
  assert.match(success.message, /模拟/);
  assert.equal(success.input.slot, 'sat');
});
test('designer changes affect rendered content, error association and confirmation', () => {
  const session = UX.createSession();
  session.configure({showRules:true,actionLabel:'确认模拟预约',errorStyle:'field',confirmation:'details'});
  assert.equal(session.config.actionLabel, '确认模拟预约');
  assert.match(session.submit({...good,code:''}).message, /演示代号/);
  assert.match(session.submit(good).message, /周六 10:00/);
  assert.match(session.submit(good).message, /一楼交换角/);
});
test('changing design clears current evidence and cannot pair old trace with new parameters', () => {
  const session = UX.createSession();
  session.submit({}); session.submit(good);
  const v1 = session.snapshot('V1');
  session.configure({...session.config,showRules:true});
  assert.equal(session.trace.length, 0);
  assert.throws(() => session.snapshot('V2'), /错误与成功/);
  session.submit({}); session.submit(good);
  const v2 = session.snapshot('V2');
  assert.equal(v1.config.showRules, false);
  assert.equal(v2.config.showRules, true);
  v2.config.showRules = false;
  assert.equal(session.snapshots.V2.config.showRules, true);
  assert.throws(() => session.snapshot('V1'), /已保存/);
});
test('invalid designer input blocks submission, export contains exact scenario and both rounds', () => {
  const session = UX.createSession();
  assert.throws(() => session.configure({...session.config,actionLabel:'  '}), /按钮/);
  assert.throws(() => session.submit(good), /设计参数/);
  session.configure(UX.defaults);
  session.submit({}); session.submit(good); session.snapshot('V1');
  const text = session.exportText();
  assert.match(text, /预约-2026-10-v1/);
  assert.match(text, /V1/);
  assert.match(text, /DEMO/);
  assert.match(text, /真实用户/);
  assert.throws(() => session.snapshot('V3'), /V1/);
});
test('V2 requires V1 and fresh actions in a later round, never duplicates the same trace', () => {
  const session = UX.createSession();
  session.submit({}); session.submit(good);
  assert.throws(() => session.snapshot('V2'), /V1/);
  session.snapshot('V1');
  assert.throws(() => session.snapshot('V2'), /新一轮/);
  session.restart();
  assert.throws(() => session.snapshot('V2'), /错误与成功/);
  session.submit({}); session.submit(good);
  assert.equal(session.snapshot('V2').round,2);
});
