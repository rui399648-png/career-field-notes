'use strict';
(() => {
  const core = CareerEcommerce;
  const element = id => document.getElementById(id);
  const fixed = value => Number(value).toFixed(2);
  let scenario = 'initial';
  let result = null;
  const snapshots = [];
  function conditionTable() {
    element('condition-table').innerHTML = '<table><caption>当前商品条件 · 金额单位：元</caption><thead><tr><th>商品</th><th>最低/原价</th><th>促销阈值</th><th>常价/促销需求</th><th>库存</th><th>成本/发货/退货</th><th>每单投放</th><th>退货率</th></tr></thead><tbody>' + core.products(scenario).map(row => `<tr><td>${row.sku} ${row.name}</td><td>${row.minPrice}/${row.listPrice}</td><td>${row.promoCeiling}</td><td>${row.regularDemand}/${row.promoDemand}</td><td>${row.stock}</td><td>${row.unitCost}/${row.shipping}/${row.returnHandling}</td><td>${row.adOrderCost}</td><td>${row.returnRate * 100}%</td></tr>`).join('') + '</tbody></table>';
    element('scenario-label').textContent = '当前条件：' + (scenario === 'initial' ? '初始版' : '反馈版（S01库存18；S02退货20%、每单投放25元）') + ' · 数据版本 ' + core.VERSION;
  }
  element('plan-table').innerHTML = '<table><caption>可编辑方案 · 数量0代表不主推</caption><thead><tr><th>商品</th><th>活动价（元）</th><th>计划量（件）</th><th>投放金额（元）</th></tr></thead><tbody>' + core.products('initial').map(row => `<tr><td>${row.sku} ${row.name}</td><td><input id="${row.sku}-price" aria-label="${row.name}活动价" type="number" min="${row.minPrice}" max="${row.listPrice}" step="0.01" value="${row.listPrice}" required></td><td><input id="${row.sku}-units" aria-label="${row.name}计划量" type="number" min="0" step="1" value="0" required></td><td><input id="${row.sku}-adSpend" aria-label="${row.name}投放金额" type="number" min="0" step="0.01" value="0" required></td></tr>`).join('') + '</tbody></table>';
  function clearResult(message) {
    result = null;
    element('save-snapshot').disabled = true;
    element('result').innerHTML = '';
    element('result').textContent = message;
  }
  function readPlan() {
    return core.products('initial').map(product => {
      const row = {sku:product.sku};
      for (const key of ['price','units','adSpend']) {
        const value = element(product.sku + '-' + key).value.trim();
        if (!value) throw Error(product.sku + '参数有空值，请填数字；未主推数量和投放填0。');
        row[key] = Number(value);
      }
      return row;
    });
  }
  element('plan-table').addEventListener('input', () => clearResult('参数已修改。旧结果已失效，请重新核算；已保存快照保持原样。'));
  element('plan-form').addEventListener('submit', event => {
    event.preventDefault();
    clearResult('正在核算。');
    try {
      result = core.evaluate(readPlan(), scenario);
      const total = result.totals;
      element('result').textContent = '';
      element('result').innerHTML = `<p class="message ${result.feasible ? 'pass' : 'fail'}">${result.feasible ? '模拟约束通过：可交负责人审核。' : '还有约束未通过：保留证据再修改。'}</p><div class="metrics"><div class="metric">预期贡献额<b>${fixed(total.contribution)} 元</b></div><div class="metric">投放预算消耗<b>${fixed(total.adSpend)} / 400</b></div><div class="metric">主推商品 / 计划量<b>${result.activeSkus} 件 / ${total.units}</b></div></div><div class="scroll"><table><caption>本次计算证据 · ${scenario === 'initial' ? '初始版' : '反馈版'}条件</caption><thead><tr><th>商品</th><th>需求上限</th><th>计划/库存</th><th>留存收入</th><th>商品成本</th><th>发货费</th><th>退货处理</th><th>投放</th><th>贡献额</th></tr></thead><tbody>${result.rows.map(row => `<tr><td>${row.sku}</td><td>${row.baseDemand}+${row.paidOrders}=${row.demandLimit}</td><td>${row.units}/${row.stock}</td><td>${fixed(row.retainedRevenue)}</td><td>${fixed(row.goodsCost)}</td><td>${fixed(row.shippingCost)}</td><td>${fixed(row.returnCost)}</td><td>${fixed(row.adSpend)}</td><td>${fixed(row.contribution)}</td></tr>`).join('')}</tbody></table></div>${result.violations.length ? '<ul class="fail">' + result.violations.map(issue => `<li>${issue.message}</li>`).join('') + '</ul>' : '<p class="note">库存、需求、预算、主推数与贡献目标均按本情境检查；这不证明实际销售效果或净利润。</p>'}`;
      element('save-snapshot').disabled = false;
    } catch (error) {
      clearResult('未产生新结果：' + error.message);
    }
  });
  element('save-snapshot').addEventListener('click', () => {
    if (!result) return;
    const prefix = scenario === 'initial' ? 'V1' : 'V2';
    const count = snapshots.filter(item => item.scenario === scenario).length + 1;
    const label = prefix + '-' + String(count).padStart(2, '0');
    snapshots.push(core.snapshot(result, label));
    element('evidence').value = JSON.stringify({exercise:'离线电商经营模拟', model:'预设需求与期望退货；贡献额未计固定成本和税，不是净利润。未保存草稿不包含在导出中。', snapshots}, null, 2);
    element('receive-feedback').disabled = scenario === 'feedback';
    element('copy-evidence').disabled = false;
    element('download-evidence').disabled = false;
    element('action-status').textContent = label + '已保存到本页内存。继续修改不会改写它；关闭前请下载。';
  });
  element('receive-feedback').addEventListener('click', () => {
    if (scenario !== 'initial' || !snapshots.some(item => item.scenario === 'initial')) return;
    scenario = 'feedback';
    element('feedback-card').hidden = false;
    element('receive-feedback').disabled = true;
    conditionTable();
    clearResult('已切换反馈版条件，参数仍保留。先用原方案重算，再修订并保存V2。');
  });
  element('copy-evidence').addEventListener('click', async () => {
    if (!snapshots.length) return;
    try {
      if (!navigator.clipboard?.writeText) throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(element('evidence').value);
      element('action-status').textContent = '已复制保存快照。请把关键证据和修改理由记回主页面。';
    } catch (_) {
      element('evidence').focus();
      element('evidence').select();
      element('action-status').textContent = '浏览器未开放自动复制。证据已选中，请用Ctrl+C或系统复制菜单。';
    }
  });
  element('download-evidence').addEventListener('click', () => {
    if (!snapshots.length) return;
    const url = URL.createObjectURL(new Blob([element('evidence').value], {type:'application/json;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url; link.download = 'ecommerce-v1-v2-evidence.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    element('action-status').textContent = '已发起JSON证据下载；请确认文件已保存。';
  });
  conditionTable();
})();
