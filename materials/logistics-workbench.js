'use strict';
(() => {
  const get = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const rounds = {V1:null,V2:null};
  let latest = null;
  function readInputs() {
    return {scenarioId:get('scenario').value,startTime:get('start-time').value,serviceMinutes:Number(get('service-minutes').value),
      capacities:{A:Number(get('capacity-A').value),B:Number(get('capacity-B').value)},routes:{A:get('route-A').value,B:get('route-B').value}};
  }
  function buttons() {
    get('keep-v1').disabled = !latest || get('scenario').value !== 'normal';
    get('keep-v2').disabled = !latest || get('scenario').value !== 'delay' || !rounds.V1;
  }
  function materials() {
    const data = LogisticsCore.scenario(get('scenario').value), nodes = Object.keys(data.travelMinutes);
    get('orders').innerHTML = '<table><thead><tr><th>ID</th><th>站点</th><th>装载格</th><th>最早开始</th><th>最晚开始</th></tr></thead><tbody>'+data.orders.map(order =>
      '<tr><td>'+order.id+'</td><td>'+esc(order.place)+'</td><td>'+order.load+'</td><td>'+LogisticsCore.clock(order.earliest)+'</td><td>'+LogisticsCore.clock(order.latest)+'</td></tr>').join('')+'</tbody></table>';
    get('matrix-note').textContent = data.version+'：'+data.note;
    get('matrix').innerHTML = '<table><thead><tr><th>从 / 到</th>'+nodes.map(id => '<th>'+id+'</th>').join('')+'</tr></thead><tbody>'+nodes.map(from => '<tr><th>'+from+'</th>'+nodes.map(to =>
      '<td'+(data.travelMinutes[from][to] === 45?' class="delayed"':'')+'>'+data.travelMinutes[from][to]+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  }
  function exports() {
    get('export-text').value = LogisticsCore.exportText(rounds);
    get('round-status').textContent = 'V1：'+(rounds.V1?'已保留 '+rounds.V1.scenario.version:'尚未保留')+'；V2：'+(rounds.V2?'已保留 '+rounds.V2.scenario.version:'尚未保留')+'。刷新前请复制或下载。';
    get('copy').disabled = get('download').disabled = !rounds.V1 && !rounds.V2;
  }
  function invalidate() {
    latest = null; get('results').innerHTML = ''; buttons();
    get('status').textContent = '路线、参数或场景已变，请重新计算；已保留的两轮仍在下方。';
  }
  function show(result) {
    const metrics = '<div class="metrics"><span>已安排 '+result.totals.deliveries+'/6 笔</span><span>窗口内 '+result.totals.onTime+'/6</span><span>总路程 '+result.totals.distanceKm+' km</span><span>总行驶 '+result.totals.travelMinutes+' 分钟</span><span>总等待 '+result.totals.waitMinutes+' 分钟</span></div>';
    const resourceNote = result.resourcesChanged ? '<p class="warning">资源参数偏离题目约定。这里只是探索结果，需要模拟负责人确认；即使当前参数可行，也未满足本题交付条件。</p>' : '';
    const checks = result.issues.length ? '<ul class="warning">'+result.issues.map(issue => '<li>'+esc(issue.message)+'</li>').join('')+'</ul>' : '<p>当前参数下：六单、容量、时间窗与返仓检查通过。</p>';
    const tables = ['A','B'].map(vehicle => {
      const route = result.routes[vehicle];
      return '<h3>车辆'+vehicle+' · 装载 '+route.load+'/'+route.capacity+' 格</h3><div class="table-scroll"><table><thead><tr><th>ID</th><th>路段分钟</th><th>到达</th><th>等待</th><th>服务开始</th><th>离开</th><th>晚到</th></tr></thead><tbody>'+route.stops.map(stop =>
        '<tr><td>'+stop.id+'</td><td>'+stop.legMinutes+'</td><td>'+LogisticsCore.clock(stop.arrival)+'</td><td>'+stop.wait+'</td><td>'+LogisticsCore.clock(stop.serviceStart)+'</td><td>'+LogisticsCore.clock(stop.departure)+'</td><td>'+stop.late+'</td></tr>').join('')+'</tbody></table></div><p>返仓段 '+route.returnKm+' km / '+route.returnMinutes+'分钟；返回 '+LogisticsCore.clock(route.returnTime)+'。</p>';
    }).join('');
    get('results').innerHTML = metrics+resourceNote+checks+tables;
  }
  get('run').addEventListener('click',() => {
    latest = null; get('results').innerHTML = '';
    try {
      const inputs = readInputs(), result = LogisticsCore.evaluate(inputs);
      latest = {inputs,result}; show(result);
      get('status').textContent = result.meetsBrief?'本次给定约束通过，可保留这一轮。':result.feasible?'当前参数可行，但资源变更尚需确认。':'本次存在约束冲突，按结果调整；失败方案也可保留作为证据。';
    } catch (error) {get('status').textContent = '本次未计算：'+error.message;}
    buttons();
  });
  function keep(round) {
    try {
      if (!latest) throw Error('请先重新计算当前路线。');
      if (round === 'V2' && !rounds.V1) throw Error('请先保留初始V1。');
      rounds[round] = LogisticsCore.snapshot(round,readInputs(),latest.result,get('notes').value);
      exports(); buttons(); get('status').textContent = round+'已保留完整快照。修改下一轮前可先下载备份。';
    } catch (error) {get('status').textContent = '未保留：'+error.message;}
  }
  get('keep-v1').addEventListener('click',() => keep('V1'));
  get('keep-v2').addEventListener('click',() => keep('V2'));
  for (const id of ['start-time','service-minutes','capacity-A','capacity-B','route-A','route-B']) get(id).addEventListener('input',invalidate);
  get('scenario').addEventListener('change',() => {invalidate(); materials();});
  get('copy').addEventListener('click',async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error('无剪贴板接口');
      await navigator.clipboard.writeText(get('export-text').value);
      get('status').textContent = '已复制保留的两轮；回主页面留下摘要与体验。';
    } catch (error) {get('export-text').focus(); get('export-text').select(); get('status').textContent = '请复制下方已选中的完整文本。';}
  });
  get('download').addEventListener('click',() => {
    const url = URL.createObjectURL(new Blob([get('export-text').value],{type:'text/markdown;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href=url; anchor.download='物流规划-V1-V2.md';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url),1500);
    get('status').textContent = '已生成下载；若未响应，请复制下方文本。';
  });
  materials(); exports(); buttons();
})();
