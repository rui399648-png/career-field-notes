'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CareerUX = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const defaults = Object.freeze({showRules:false,actionLabel:'下一步',errorStyle:'generic',confirmation:'generic'});
  const slots = Object.freeze({sat:'周六 10:00–10:30',sun:'周日 15:00–15:30'});
  const scenario = '预约-2026-10-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  function validate(config) {
    if (!config || typeof config.showRules !== 'boolean') throw new Error('规则显示参数必须为开或关。');
    if (typeof config.actionLabel !== 'string' || !config.actionLabel.trim() || config.actionLabel.trim().length > 24) throw new Error('按钮文字需要 1–24 个字。');
    if (!['generic','field'].includes(config.errorStyle) || !['generic','details'].includes(config.confirmation)) throw new Error('请选择有效的错误和确认样式。');
    return {showRules:config.showRules,actionLabel:config.actionLabel.trim(),errorStyle:config.errorStyle,confirmation:config.confirmation};
  }
  function createSession() {
    let config = clone(defaults), invalid = false, trace = [], snapshots = {}, round = 1;
    return {
      get config() {return clone(config);},
      get trace() {return clone(trace);},
      get snapshots() {return clone(snapshots);},
      configure(next) {
        trace = []; round++; invalid = true;
        config = validate(next); invalid = false;
        return clone(config);
      },
      submit(raw) {
        if (invalid) throw new Error('设计参数无效，请先修正。');
        const input = {};
        for (const key of ['nickname','slot','code']) input[key] = typeof raw?.[key] === 'string' ? raw[key].trim().slice(0,80) : '';
        const errors = [];
        if (!input.nickname || input.nickname.length > 20) errors.push({field:'nickname',message:'填写 1–20 字的虚构称呼。'});
        if (!Object.hasOwn(slots,input.slot)) errors.push({field:'slot',message:'选择一个取书时段。'});
        if (input.code !== 'DEMO') errors.push({field:'code',message:'演示代号请填写 DEMO；不使用真实联系方式。'});
        const status = errors.length ? 'error' : 'confirmed';
        const message = errors.length
          ? (config.errorStyle === 'field' ? errors.map(error => error.message).join(' ') : '请检查填写内容。')
          : (config.confirmation === 'details' ? `模拟预约已确认：${input.nickname}，${slots[input.slot]}，一楼交换角。此为演示，未预留真实图书。` : '模拟提交成功。');
        const result = {step:trace.length+1,status,input,errors,message};
        if (trace.length >= 100) throw new Error('本轮已记录 100 次，请重新开始本轮。');
        trace.push(clone(result));
        return clone(result);
      },
      restart() {trace = []; round++;},
      snapshot(label) {
        if (!['V1','V2'].includes(label)) throw new Error('只支持 V1 或 V2。');
        if (snapshots[label]) throw new Error(`${label} 已保存，请下载后刷新页面才可重做。`);
        if (label === 'V2' && !snapshots.V1) throw new Error('先锁定 V1，再进行修改复验。');
        if (label === 'V2' && round <= snapshots.V1.round) throw new Error('请修改设计或清空本轮开启新一轮，再实际复验。');
        if (invalid || !trace.some(item => item.status === 'error') || !trace.some(item => item.status === 'confirmed')) throw new Error('请先实际走一次错误与成功路径，再保存快照。');
        snapshots[label] = {label,scenario,round,config:clone(config),trace:clone(trace)};
        return clone(snapshots[label]);
      },
      exportText() {
        return '交互／UX 原型操作证据\n教学模拟，不代表真实用户测试或实际预约。关闭页面前保存。\n'+JSON.stringify({scenario,snapshots,current:{config,valid:!invalid,trace}},null,2);
      }
    };
  }
  return {defaults,slots,scenario,createSession};
});
