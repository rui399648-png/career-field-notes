'use strict';
(() => {
  const session = CareerUX.createSession();
  const el = id => document.getElementById(id);
  function evidence() {el('evidence').value = session.exportText();}
  function clearOutcome() {
    for (const key of ['nickname','slot','code']) {
      el(key+'-error').hidden = true; el(key+'-error').textContent = '';
      el(key).removeAttribute('aria-invalid');
    }
    el('outcome').textContent = '设计已改变或本轮已清空，请重新走错误与成功路径。';
    el('trace-status').textContent = '本轮 0 次操作。';
  }
  function configure() {
    clearOutcome();
    try {
      const config = session.configure({showRules:el('show-rules').checked,actionLabel:el('action-label').value,errorStyle:el('error-style').value,confirmation:el('confirmation').value});
      el('rules').hidden = !config.showRules; el('primary').textContent = config.actionLabel;
      el('primary').disabled = false; el('design-status').textContent = '新设计已应用。本轮操作证据从零开始；已锁定的版本保留。';
    } catch (error) {el('primary').disabled = true; el('design-status').textContent = error.message;}
    evidence();
  }
  for (const id of ['show-rules','action-label','error-style','confirmation']) el(id).addEventListener('input',configure);
  el('prototype').addEventListener('submit',event => {
    event.preventDefault();
    for (const key of ['nickname','slot','code']) {el(key+'-error').hidden = true; el(key).removeAttribute('aria-invalid');}
    try {
      const result = session.submit({nickname:el('nickname').value,slot:el('slot').value,code:el('code').value});
      el('outcome').textContent = result.message;
      if (session.config.errorStyle === 'field') for (const error of result.errors) {
        el(error.field).setAttribute('aria-invalid','true'); el(error.field+'-error').hidden = false; el(error.field+'-error').textContent = error.message;
      }
      el('trace-status').textContent = `本轮 ${session.trace.length} 次操作；本次：${result.status === 'error' ? '错误路径' : '模拟确认'}。`;
    } catch (error) {el('outcome').textContent = error.message;}
    evidence(); el('outcome').focus();
  });
  for (const label of ['V1','V2']) el('save-'+label.toLowerCase()).addEventListener('click',() => {
    try {session.snapshot(label); el('save-'+label.toLowerCase()).disabled = true; el('snapshot-status').textContent = `${label} 已锁定，参数和操作不会随之后的修改变化。`;}
    catch (error) {el('snapshot-status').textContent = error.message;}
    evidence();
  });
  el('restart').addEventListener('click',() => {session.restart(); clearOutcome(); evidence();});
  el('copy').addEventListener('click',async () => {
    evidence();
    try {await navigator.clipboard.writeText(el('evidence').value); el('copy-status').textContent = '已复制。';}
    catch (_) {el('evidence').focus(); el('evidence').select(); el('copy-status').textContent = '请按 Ctrl+C / ⌘C 复制选中文本，或下载 TXT。';}
  });
  el('download').addEventListener('click',() => {
    evidence(); const url = URL.createObjectURL(new Blob([el('evidence').value],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'UX原型操作证据.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  evidence();
})();
