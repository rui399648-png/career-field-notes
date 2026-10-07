'use strict';
const ids = Object.keys(TASKS);
const labels = {welcome:'开始试玩', ...Object.fromEntries(ids.map(id => [id, TASKS[id].name])), compare:'体验对照', history:'历史记录'};
const reflectionLabels = {stage:'实际成果阶段', familiar:'开始前熟悉程度', help:'帮助程度', moment:'投入时刻', obstacle:'卡点与继续意愿', repetitive:'重复工作的感受', next:'再给 30 分钟', review:'收到反馈后的修改意愿', energy:'做完状态', again:'再试意愿', setup:'环境准备分钟'};
const main = document.getElementById('main');
// 访问 localStorage 本身也可能抛错；统一交给 load/save 的保护逻辑处理。
const storage = {getItem:key => window.localStorage.getItem(key), setItem:(key, text) => window.localStorage.setItem(key, text)};
const session = CareerState.load(storage);
let record = session.state;
let currentPage = null;
let timerInterval = null;
const esc = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const value = key => record.fields[key] ?? '';
const route = () => Object.hasOwn(labels, (location.hash || '#welcome').slice(1)) ? (location.hash || '#welcome').slice(1) : 'welcome';

function toast(text) {
  const element = document.getElementById('toast');
  element.textContent = text;
  element.hidden = false;
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => { element.hidden = true; }, 4200);
}
function save() {
  session.state = record;
  const saved = CareerState.save(storage, session);
  updateStatus();
  updateNav();
  return saved;
}
function updateStatus() {
  document.getElementById('save-status').textContent = session.message;
}
function updateNav() {
  document.getElementById('navigation').innerHTML = Object.entries(labels).map(([id, label]) =>
    `<button class="nav-button" type="button" data-go="${id}"${currentPage === id ? ' aria-current="page"' : ''}><span>${esc(label)}</span><span>${ids.includes(id) ? (value(id + '_done') ? '已记录' : '45 分钟') : id === 'history' ? String(record.archives.length) : id === 'compare' ? '回顾' : '入口'}</span></button>`).join('');
  document.getElementById('progress').textContent = `已记录 ${ids.filter(id => value(id + '_done')).length} / ${ids.length} 个方向`;
}
function go(id) {
  if (!Object.hasOwn(labels, id) || currentPage === id) return;
  location.hash = id;
}
function field(key, title, placeholder = '', short = false) {
  return `<label class="field"><span>${esc(title)}</span><textarea aria-label="${esc(title)}" data-field="${esc(key)}" maxlength="30000" class="${short ? 'short' : ''}" placeholder="${esc(placeholder)}">${esc(value(key))}</textarea></label>`;
}
function select(key, title, options) {
  return `<label class="field"><span>${esc(title)}</span><select data-field="${esc(key)}"><option value="">尚未选择</option>${options.map(option => `<option${value(key) === option ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select></label>`;
}
function files(items = []) {
  return `<div class="downloads">${items.map(file => `<a class="file-link" href="${esc(file.path)}" target="_blank" rel="noopener">${esc(file.label)}</a>`).join('')}</div>`;
}
function commands(items = []) {
  if (!items.length) return '';
  return `<div class="material"><h3>在解压后的 materials 文件夹运行</h3>${items.map(command => `<p><code>${esc(command)}</code></p>`).join('')}<p>Windows 也可用 py。需要 Python 3.10+；先保存自己的代码，验收失败就保留错误。</p></div>`;
}
function card(data, extraClass = '') {
  return `<div class="material ${extraClass}"><h3>${esc(data.title)}</h3>${data.lines.map(line => `<p>${esc(line)}</p>`).join('')}${files(data.files)}${commands(data.commands)}</div>`;
}
function sourceLinks(task) {
  return `<p>${task.sources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)}</a>`).join(' · ')}</p>`;
}
function welcome() {
  const roleCards = roleIds => `<div class="grid">${roleIds.map(id => {const task = TASKS[id]; return `<article class="role-card"><span class="num">${String(ids.indexOf(id) + 1).padStart(2, '0')} / ${esc(task.short)}</span><h2>${esc(task.name)}</h2><p>${esc(task.pitch)}</p><p class="small">留下：${esc(task.deliverable)}</p><button data-go="${id}">进入${esc(task.name)} →</button></article>`;}).join('')}</div>`;
  const additions = ids.filter(id => TASKS[id].newRole);
  return `<header class="hero"><p class="eyebrow">VERSION 3 / ${ids.length} WORK SAMPLES</p><h1>做一小段工作，<br>看自己想不想继续。</h1><p class="lead">${ids.length} 项约 45 分钟的小任务。先澄清、动手，再接反馈、复核与交接；把完成质量和继续意愿放在一起看。</p></header>
  ${additions.length ? `<section class="role-group"><h2>新增方向 · 需求增长参考</h2><p class="group-note">结合公开需求报告与真实岗位职责，新增 ${additions.length} 种工作体验。趋势资料不等于本地岗位排名；<a href="新增岗位与依据.md">查看选择依据与范围</a>。</p>${roleCards(additions)}</section>` : ''}
  <section class="role-group"><h2>原有方向 · 继续深化</h2>${roleCards(ids.filter(id => !TASKS[id].newRole))}</section>
  <section class="banner"><h2>从同一个模拟活动，试不同工作方式</h2><p>校园技能交换日的活动、人物、反馈和业务数据全部虚构。安全分析另设虚构后台日志，范围见题内材料。</p><div class="facts"><span>手机摄影入门工作坊</span><span>免费 · 零基础 · 手机即可</span><span>活动日周六 14:00–15:00</span><span>教学楼 B203 · 20 名</span><span>不提供学分或证书</span></div></section>
  <section class="block"><h2>把体验做小，把证据留下</h2><ol><li>每次选一项，分天做；选最想了解的两项开始即可。第二轮换场景或倒序，观察题目与疲劳的影响。</li><li>45 分钟含最后 5 分钟体验记录。模板可以只写要点或文件位置；没有做完就写真实进度。可选加做 20 分钟另记，不占核心计时。</li><li>先独立试 10 分钟，再逐级看提示、反馈与参考。需要帮助时记录谁解释或代写了哪一部分。</li><li>计时按方向保存；切换页面会暂停，刷新保留剩余时间。计时只辅助控制范围，不评价能力。</li><li>本地填写不会自动发送给我。导出记录后可带回聊天；旧版答案在历史记录中保留，不会套入改版任务。</li></ol><p class="noscore">这里不计算职业适合度。一次模拟只能提供探索线索；真正的工作还包括团队协作、交付压力、反复修改和更大规模的问题。</p><div class="actions"><button data-go="data">先试新增方向：数据分析</button><a class="file-link" href="试玩手册.md">文字版手册</a><a class="file-link" href="审查与改进.md">本次审查与改进</a></div></section>
  <section class="block sources"><h3>真实岗位怎样变成小练习？</h3><p>参考国内外雇主公开岗位与官方工作流程，提取可体验的动作，再裁剪到本轮范围。地区、资历和岗位侧重不同；这些样本不代表统一入门门槛或应聘结果。</p>${ids.map(id => `<details class="hint"><summary>${esc(TASKS[id].name)}：职责与来源</summary><p>${esc(TASKS[id].boundary)}</p>${sourceLinks(TASKS[id])}</details>`).join('')}<p class="note">原四项来源核对：2026-10-06；新增三项：2026-10-07。<a href="岗位参考与任务映射.md">查看完整映射、限制与来源</a></p></section>`;
}

function timerDisplay() {
  if (!ids.includes(currentPage)) return;
  const milliseconds = CareerState.remaining(record, currentPage, Date.now());
  const seconds = Math.ceil(milliseconds / 1000);
  const display = document.getElementById('timer-display');
  if (display) display.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const timer = record.timers[currentPage];
  const toggle = document.getElementById('timer-toggle');
  if (toggle) {toggle.textContent = seconds === 0 ? '时间到' : timer?.deadline !== null && timer?.deadline !== undefined ? '暂停' : timer?.started ? '继续' : '开始计时'; toggle.disabled = seconds === 0;}
}
function attachTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerDisplay();
  if (!ids.includes(currentPage) || record.timers[currentPage]?.deadline == null) return;
  timerInterval = setInterval(() => {
    timerDisplay();
    if (CareerState.remaining(record, currentPage, Date.now()) <= 0) {
      CareerState.pauseTimer(record, currentPage, Date.now());
      clearInterval(timerInterval);
      timerInterval = null;
      save();
      timerDisplay();
      toast('本轮计时结束，可以保留进度并填写体验记录。');
    }
  }, 500);
}
function timerAction() {
  if (!ids.includes(currentPage)) return;
  if (record.timers[currentPage]?.deadline != null) CareerState.pauseTimer(record, currentPage, Date.now());
  else CareerState.startTimer(record, currentPage, Date.now());
  save();
  attachTimer();
}
function task(id) {
  const data = TASKS[id];
  const phaseFields = phase => data.fields.filter(item => item.phase === phase).map(item => field(id + '_' + item.key, item.label, item.template)).join('');
  return `<header class="hero hero-flex"><div><p class="eyebrow">${esc(data.short)} / 45 MINUTES</p><h1>${esc(data.name)}</h1><p class="lead">${esc(data.pitch)}</p><p class="note">本轮交付：${esc(data.deliverable)}</p></div><div class="timer"><div class="time" id="timer-display">45:00</div><div class="timer-buttons"><button id="timer-toggle">开始计时</button><button id="timer-reset" class="outline">重置</button></div><span class="small">按方向保存 · 切换页面暂停</span></div></header>
  <section class="block"><h2>你的任务</h2><p>${esc(data.mission)}</p><ol class="steps">${data.steps.map(step => `<li><b>${esc(step[0])}</b>${esc(step[1])}</li>`).join('')}</ol><p class="note">45 分钟包含最后 5 分钟体验记录。环境另计；半成品也可记录，要点或文件位置即可。</p></section>
  <section class="block"><h2>01 · brief 与工作材料</h2>${data.materials.filter(item => !item.afterClarification).map(item => card(item)).join('')}${files(data.files)}${commands(data.commands)}${data.clarification ? `<details class="hint feedback"><summary>${esc(data.clarification.title)}</summary>${card(data.clarification)}${data.materials.filter(item => item.afterClarification).map(item => card(item)).join('')}</details>` : ''}</section>
  <section class="block"><h2>02 · 先留下自己的版本</h2><p class="muted">模板仅作提示。保留初版，反馈后另写修订，不用完成所有空格才继续。</p>${phaseFields('work')}<div class="support">${data.hints.map((hint, index) => `<details class="hint"><summary>提示 ${index + 1} · ${index ? '再具体一点' : '先想一个方向'}</summary><p>${esc(hint)}</p></details>`).join('')}</div></section>
  <section class="block"><h2>03 · 接收反馈，再验证或修改</h2><details class="hint feedback"><summary>${esc(data.feedback.title)}</summary>${card(data.feedback)}</details>${phaseFields('feedback')}</section>
  <section class="block"><h2>04 · 复核与交接</h2>${data.result ? `<details class="hint feedback"><summary>${esc(data.result.title)}</summary>${card(data.result)}</details>` : ''}${phaseFields('handoff')}<details class="hint"><summary>保留初版、尝试回应反馈后，按需查看参考</summary><p>${esc(data.reference.note)}</p>${files([{label:'打开参考材料', path:data.reference.path}])}</details><h3 class="section-gap">本轮成果自查</h3>${data.checks.map((check, index) => `<label class="checkline"><input type="checkbox" data-field="${id}_check_${index}"${value(id + '_check_' + index) === true ? ' checked' : ''}><span>${esc(check)}</span></label>`).join('')}<p class="note">这些是自报的检查状态，不是评分。没通过时留下问题；不要求全部勾选才记录体验。</p></section>
  ${reflection(id)}
  <section class="block"><details class="hint"><summary>${esc(data.deepening.title)}（可选，另计时间）</summary>${card(data.deepening)}${field(id + '_deepening', '加做结果与另花的时间', '另花分钟：\n新增成果、证据与体验：', true)}</details></section>
  <section class="block sources"><h3>这项练习借用了哪些真实职责？</h3><p>${esc(data.boundary)}</p>${sourceLinks(data)}<p class="note">这是缩小的工作样本，未覆盖完整岗位。来源访问：${esc(data.sourceDate || '2026-10-06')}。</p></section><div class="actions"><button data-go="compare">查看 ${ids.length} 项体验对照 →</button><button class="outline" data-go="welcome">回到入口</button></div>`;
}
function reflection(id) {
  return `<section class="block"><h2>最后 5 分钟：留下探索线索</h2><p class="muted">先记录实际阶段、一个具体时刻和继续意愿。其余背景可以稍后补充。</p>${select(id + '_stage', '实际留下了哪一阶段的成果？', ['只读了材料', '留下了初稿或部分实现', '接收反馈并做了修改', '已复核并留下交接'])}${field(id + '_moment', '什么时候最投入？', '记录一个具体动作或时刻。没有投入时刻，也可写原因。', true)}<div class="two">${select(id + '_review', '收到反馈后，还愿意再改一轮吗？', ['愿意再改一轮', '看情况愿意', '还不确定', '暂时不想改'])}${select(id + '_again', '换一个题目，愿意再做一次吗？', ['愿意主动再试', '有条件地愿意', '还不确定', '目前不愿意'])}</div><details class="hint"><summary>补充体验背景（可稍后填写，原记录保留）</summary><div class="two">${select(id + '_familiar', '开始前的熟悉程度', ['大多做过', '做过一部分', '大多第一次接触'])}${select(id + '_help', '这次用了什么帮助', ['独立完成', '看过提示', 'AI解释或点评了局部', 'AI代写了主要成果'])}</div>${field(id + '_obstacle', '卡在哪里？提示之后还想继续吗？', '卡点、帮助与之后的感受；环境障碍也可记录。', true)}${field(id + '_repetitive', '愿意重复或想避开哪件琐事？', '例如复验、排错、协调意见、反复改稿，写具体经历。', true)}${field(id + '_next', '再给 30 分钟，会主动改进什么？', '不想继续也写原因：疲劳、题目、环境或工作方式。', true)}${select(id + '_energy', '做完之后的状态', ['有些疲劳，但想继续', '有精力，也想继续', '感觉平常，需要换题再试', '明显消耗，暂时想停'])}<label class="field"><span>准备环境另花了多少分钟？</span><input type="number" min="0" max="180" data-field="${id}_setup" value="${esc(value(id + '_setup'))}" placeholder="0"></label></details><label class="checkline final"><input type="checkbox" data-field="${id}_done"${value(id + '_done') === true ? ' checked' : ''}><span>本轮已结束，我已记录实际成果与感受。</span></label></section>`;
}

function recordLines(fields, tasks, prefix = '') {
  const lines = [];
  for (const [id, data] of Object.entries(tasks)) {
    const get = key => fields[id + '_' + key] ?? '';
    lines.push('## ' + prefix + data.name, '', '状态：' + (get('done') === true ? '已记录本轮' : '未标记结束'), '');
    const entries = [...data.fields.map(item => [item.key, item.label]), ...Object.entries(reflectionLabels), ['deepening', '可选加做结果']];
    for (const [key, label] of entries) {
      if (tasks === LEGACY_TASKS && ['stage', 'review', 'deepening'].includes(key)) continue;
      const text = get(key);
      lines.push('### ' + label, '', text !== '' ? String(text) : '（尚未填写）', '');
    }
    lines.push('### 成果自查（本人记录）', '', ...data.checks.map((check, index) => '- [' + (get('check_' + index) === true ? 'x' : ' ') + '] ' + check), '');
  }
  lines.push('## ' + prefix + '下一步', '', '保留的两个方向：' + (fields.compare_choices || '（尚未填写）'), '', '具体任务：' + (fields.compare_action || '（尚未填写）'), '');
  return lines;
}
function report() {
  const lines = ['# 我的职业试玩记录 · v3', '', '活动与业务数据均为模拟。用于探索体验，不构成职业适合度结论。', '', '当前记录更新时间：' + (record.updated || '尚未保存'), '', ...recordLines(record.fields, TASKS)];
  record.archives.forEach((archive, index) => {
    lines.push('---', '', '# 旧版只读归档 ' + (index + 1) + ' · v1', '', '旧版题目与新版不同，以下使用旧字段与旧自查标签。', '', '旧更新时间：' + (archive.updated || '未记录'), '', ...recordLines(archive.fields, LEGACY_TASKS, '旧版 · '), '### 完整原始旧版记录', '', JSON.stringify(archive, null, 2), '');
  });
  return lines.join('\n');
}
function exportPanel() {
  return `<section class="block"><h2>保存下来，继续聊</h2><p>导出后可以把记录带回本聊天。当前页面不会自动发送填写内容。Markdown 便于阅读，JSON 用于恢复，均包含旧版归档。</p><div class="actions"><button data-export="md">下载 Markdown 记录</button><button class="outline" data-export="json">下载备份 JSON</button><label class="file-link" for="import-file">恢复 JSON 备份</label><input id="import-file" type="file" accept="application/json,.json" hidden>${session.rawBackup !== null ? '<button class="outline" data-export="raw">下载受保护的原始内容</button>' : ''}</div><p class="note">v2/v3 备份只补入未填写字段，保留已写答案和明确取消的勾选；v1 完整放入只读历史。导入不会改变计时。下载未响应时展开下方文本复制。</p><details class="hint"><summary>查看并复制当前导出记录</summary><textarea class="export-preview" id="report-preview" aria-label="可复制的导出记录" readonly>${esc(report())}</textarea></details><details class="hint"><summary>查看并复制 JSON 备份</summary><textarea class="export-preview" id="json-preview" aria-label="可复制的 JSON 备份" readonly>${esc(JSON.stringify(record, null, 2))}</textarea></details></section>`;
}
function compare() {
  return `<header class="hero"><p class="eyebrow">EVIDENCE / EXPERIENCE / NEXT STEP</p><h1>看成果，也看<br>自己愿不愿意再做。</h1><p class="lead">已记录 ${ids.filter(id => value(id + '_done')).length} 项。自查与实际证据反映本轮进度；继续意愿、帮助和环境说明体验条件，不换算成适合度。</p></header><section class="block"><h2>${ids.length} 项对照</h2><div class="table-scroll"><table><thead><tr><th>方向 / 实际成果</th><th>自查</th><th>熟悉与帮助</th><th>修改意愿</th><th>再试与状态</th></tr></thead><tbody>${ids.map(id => `<tr><td><button class="outline" data-go="${id}">${esc(labels[id])}</button><p>${esc(value(id + '_stage') || '阶段尚未记录')}</p><small>${value(id + '_done') ? '已记录本轮' : '本轮还没结束'}</small></td><td>${TASKS[id].checks.filter((_, index) => value(id + '_check_' + index) === true).length} / ${TASKS[id].checks.length}<br><small>本人勾选，非评分</small></td><td>${esc(value(id + '_familiar') || '未填熟悉程度')}<br>${esc(value(id + '_help') || '未填帮助程度')}<br><small>环境：${esc(value(id + '_setup') || '未填')} 分钟</small></td><td>${esc(value(id + '_review') || '尚未填写')}</td><td>${esc(value(id + '_again') || '未填再试意愿')}<br>${esc(value(id + '_energy') || '未填状态')}</td></tr>`).join('')}</tbody></table></div><p class="noscore">“会做”与“愿意反复做”分别观察。没体验的方向不据此排序；场景、疲劳与帮助程度会影响判断。勾选更多不代表职业更适合。</p></section>
  <section class="block"><h2>具体证据与感受</h2>${ids.map(id => `<details class="hint"><summary>${esc(labels[id])}：展开成果与体验证据</summary>${TASKS[id].fields.map(item => `<h3 class="section-gap">${esc(item.label)}</h3><p class="evidence">${esc(value(id + '_' + item.key) || '尚未留下成果')}</p>`).join('')}${['moment', 'obstacle', 'repetitive', 'next'].map(key => `<h3 class="section-gap">${esc(reflectionLabels[key])}</h3><p class="evidence">${esc(value(id + '_' + key) || '尚未填写')}</p>`).join('')}</details>`).join('')}</section>
  <section class="block"><h2>你下一次想试什么？</h2>${field('compare_choices', '先保留两个方向，以具体经历解释', '方向 A 与证据：\n方向 B 与证据：', true)}${field('compare_action', '安排下一次更有信息量的体验', '换场景或倒序：\n具体任务与时间：\n要验证的工作细节：', true)}<p class="note">可以先做一周的小项目，或了解从业者在协作、反复修改和交付中的日常。观察喜欢哪种过程，不只看成品好不好看。</p></section>${exportPanel()}`;
}
function history() {
  return `<header class="hero"><p class="eyebrow">VERSION HISTORY / READ ONLY</p><h1>把旧答案，<br>留在当时的任务里。</h1><p class="lead">新版规则与自查已经变化。旧版记录按原题标签保留为只读历史，不填入当前试玩；浏览器的旧版存储键始终保留。</p></header>${record.archives.length ? record.archives.map((archive, index) => `<section class="block"><h2>旧版归档 ${index + 1} · v1</h2><p class="muted">更新时间：${esc(archive.updated || '未记录')}</p><details class="hint"><summary>展开原题标签下的记录</summary><textarea class="export-preview" aria-label="旧版归档 ${index + 1}" readonly>${esc(recordLines(archive.fields, LEGACY_TASKS, '旧版 · ').join('\n'))}</textarea></details><details class="hint"><summary>查看完整原始旧记录</summary><textarea class="export-preview" aria-label="旧版原始记录 ${index + 1}" readonly>${esc(JSON.stringify(archive, null, 2))}</textarea></details></section>`).join('') : '<section class="block"><p>当前未发现旧版记录。可在下方导入旧版 JSON，作为只读归档保存。</p></section>'}${session.rawBackup !== null ? `<section class="block"><h2>受保护的原始内容</h2><p>读取到的内容未能安全解析或版本不兼容，本页不会自动覆盖它。先下载原始内容与当前填写的 JSON，再离开页面。</p><textarea class="export-preview" aria-label="受保护的原始内容" readonly>${esc(session.rawBackup)}</textarea></section>` : ''}${exportPanel()}`;
}
function render() {
  const next = route();
  if (currentPage !== next && ids.includes(currentPage) && record.timers[currentPage]?.deadline != null) {
    CareerState.pauseTimer(record, currentPage, Date.now());
    save();
  }
  clearInterval(timerInterval);
  timerInterval = null;
  currentPage = next;
  main.innerHTML = next === 'welcome' ? welcome() : next === 'compare' ? compare() : next === 'history' ? history() : task(next);
  updateNav();
  updateStatus();
  attachTimer();
}
function allowedKeys() {
  const keys = new Set(['compare_choices', 'compare_action']);
  for (const id of ids) {
    TASKS[id].fields.forEach(item => keys.add(id + '_' + item.key));
    [...Object.keys(reflectionLabels), 'deepening', 'done'].forEach(key => keys.add(id + '_' + key));
    TASKS[id].checks.forEach((_, index) => keys.add(id + '_check_' + index));
  }
  return keys;
}
function applyIncoming(incoming) {
  const merged = CareerState.mergeBackup(record, incoming, allowedKeys());
  record = merged.state;
  session.state = record;
  const saved = save();
  render();
  toast(`已补入 ${merged.count} 个当前字段、增加 ${merged.archived} 份旧版归档。${saved ? '已保存。' : '请导出备份后再离开。'}`);
  return merged;
}
function download(text, name, type) {
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(new Blob([text], {type}));
  anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('已生成导出内容；请查看下载位置，也可展开文本复制。');
}
function exportAs(kind) {
  if (kind === 'raw') {if (session.rawBackup !== null) download(session.rawBackup, '职业试玩受保护原始内容.txt', 'text/plain;charset=utf-8'); return;}
  // 导出内存中的数据不依赖浏览器写入成功。
  if (kind === 'json') download(JSON.stringify(record, null, 2), '职业试玩记录-v3-备份.json', 'application/json;charset=utf-8');
  else download(report(), '我的职业试玩记录-v3.md', 'text/markdown;charset=utf-8');
}
document.addEventListener('click', event => {
  if (event.target.closest('.skip')) {
    event.preventDefault();
    main.focus();
    window.scrollTo({top:main.offsetTop || 0, behavior:'auto'});
    return;
  }
  const navigation = event.target.closest('[data-go]');
  if (navigation) {go(navigation.dataset.go); return;}
  const exportButton = event.target.closest('[data-export]');
  if (exportButton) {exportAs(exportButton.dataset.export); return;}
  if (event.target.id === 'timer-toggle') timerAction();
  if (event.target.id === 'timer-reset' && ids.includes(currentPage)) {CareerState.resetTimer(record, currentPage); save(); attachTimer();}
});
document.getElementById('export').addEventListener('click', () => exportAs('md'));
document.addEventListener('input', event => {
  const key = event.target.dataset.field;
  if (!key || !allowedKeys().has(key)) return;
  record.fields[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
  save();
  const preview = document.getElementById('report-preview');
  if (preview) preview.value = report();
  const jsonPreview = document.getElementById('json-preview');
  if (jsonPreview) jsonPreview.value = JSON.stringify(record, null, 2);
});
document.addEventListener('change', async event => {
  if (event.target.id !== 'import-file' || !event.target.files?.[0]) return;
  try {
    const file = event.target.files[0];
    applyIncoming(JSON.parse(await file.text()));
  } catch (error) {toast('无法恢复：' + error.message);}
});
window.addEventListener('hashchange', () => {render(); main.focus(); window.scrollTo({top:0, behavior:'auto'});});
// 不在离开页时无条件重写数据。字段编辑、计时和导入均立即经保护逻辑保存。
render();
