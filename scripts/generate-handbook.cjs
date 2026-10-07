const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const taskScripts = [...index.matchAll(/<script\b[^>]*src="(tasks-[^"]+\.js)"/g)].map(match => match[1]);
for (const file of taskScripts) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const tasks = vm.runInContext('TASKS', context);
vm.runInContext(fs.readFileSync(path.join(root, 'app-info.js'), 'utf8'), context);
const version = vm.runInContext('APP_INFO.version', context);
const lines = [`# 职业试玩盒 · v${version} 文字手册`, '', `${Object.keys(tasks).length}种工作，每项约45分钟，最后5分钟记录体验。先选两项分天做即可。模板可写要点或自己文件的位置；部分完成也能结束本轮。可选加做20分钟另计。`, '', '全部活动、人物、工时、反馈、业务数据、知识卡与安全日志均为教学模拟。真实岗位只提供工作活动参考，不构成招聘信息、统一入门门槛或职业适合度结论。', '', '原活动题事实：手机摄影入门，免费，活动日周六14:00–15:00，教学楼B203，20名，手机即可，零基础，无学分或证书。测试与开发演示容量另设，安全、电商、物流、预约原型另设独立背景；各题数据切片不合并。', '', '交互页面见 [index.html](index.html)。先解压完整包；记录保存在当前浏览器，定期导出。旧版记录按旧标签归档。v4沿用v2数据格式，原七项答案保留。', '', '新增方向的需求参考和限制见[新增岗位与依据](新增岗位与依据.md)。', ''];
function appendCard(card) {
  lines.push('### ' + card.title, '', ...card.lines.flatMap(line => [line, '']));
  if (card.files) lines.push(...card.files.map(file => '- [' + file.label + '](' + file.path + ')'), '');
  if (card.commands) lines.push('```powershell', ...card.commands, '```', '');
}
for (const [id, task] of Object.entries(tasks)) {
  lines.push('---', '', '## ' + task.name, '', task.pitch, '', '**本轮交付：** ' + task.deliverable, '', task.mission, '', '| 用时 | 工作 |', '| --- | --- |', ...task.steps.map(step => '| ' + step.join(' | ') + ' |'), '', '### brief 与工作材料', '');
  task.materials.filter(card => !card.afterClarification).forEach(appendCard);
  lines.push(...task.files.map(file => '- [' + file.label + '](' + file.path + ')'), '');
  if (task.commands) lines.push('```powershell', ...task.commands, '```', '');
  if (task.clarification) {lines.push('<details>', '<summary>' + task.clarification.title + '</summary>', ''); appendCard(task.clarification); task.materials.filter(card => card.afterClarification).forEach(appendCard); lines.push('</details>', '');}
  for (const phase of ['work', 'feedback', 'handoff']) {
    if (phase === 'feedback') {lines.push('<details>', '<summary>' + task.feedback.title + '</summary>', ''); appendCard(task.feedback); lines.push('</details>', '');}
    if (phase === 'handoff' && task.result) {lines.push('<details>', '<summary>' + task.result.title + '</summary>', ''); appendCard(task.result); lines.push('</details>', '');}
    for (const field of task.fields.filter(field => field.phase === phase)) lines.push('### ' + field.label, '', '```text', field.template, '```', '');
  }
  lines.push('### 自查（本人记录，不评分）', '', ...task.checks.map(check => '- [ ] ' + check), '', '### 体验记录', '', '先记录实际阶段、一个投入或卡住的具体时刻、反馈后的修改意愿与换题再试意愿。', '', '<details>', '<summary>补充体验背景（可稍后填写）</summary>', '', '开始前熟悉程度；帮助程度；卡点与提示后继续意愿；愿意重复或想避开的琐事；再给30分钟会改什么；做完状态；环境另花分钟。', '', '</details>', '', '<details>', '<summary>保留初版、尝试回应反馈后，按需查看提示与参考</summary>', '', ...task.hints.flatMap((hint, index) => ['提示 ' + (index + 1) + '：' + hint, '']), task.reference.note, '', '[打开参考](' + task.reference.path + ')', '', '</details>', '', '<details>', '<summary>' + task.deepening.title + '（可选，另计）</summary>', '');
  appendCard(task.deepening);
  lines.push('</details>', '', '### 真实职责与范围', '', task.boundary, '', ...task.sources.map(source => '- [' + source.label + '](' + source.url + ')'), '', '来源访问：' + (task.sourceDate || '2026-10-06') + '。', '');
}
lines.push('---', '', '## 最后的体验对照', '', '将实际成果阶段、自查状态、具体证据、熟悉程度、帮助、环境障碍和继续意愿并排看。自查是本人记录，不是职业适合度分数。', '', '保留两个方向，并各写一个具体经历作为理由。下一轮换场景或倒序，以减少题目和疲劳的影响。', '', '记录不会自动发给AI；在交互页导出Markdown和JSON。更多信息见[审查与改进](审查与改进.md)和[岗位参考与任务映射](岗位参考与任务映射.md)。');
fs.writeFileSync(path.join(root, '试玩手册.md'), lines.join('\n'), 'utf8');
console.log(`${version} handbook generated from actual task scripts: ${Object.keys(tasks).length} roles`);
