'use strict';
const LogisticsCore = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const nodes = ['DEPOT','D1','D2','D3','D4','D5','D6'];
  const points = {DEPOT:[0,0],D1:[10,0],D2:[20,0],D3:[30,0],D4:[0,10],D5:[0,20],D6:[0,30]};
  const orders = [
    {id:'D1',place:'东一站',load:2,earliest:550,latest:575},
    {id:'D2',place:'东二站',load:1,earliest:565,latest:595},
    {id:'D3',place:'东三站',load:2,earliest:580,latest:610},
    {id:'D4',place:'北一站',load:2,earliest:550,latest:580},
    {id:'D5',place:'北二站',load:1,earliest:565,latest:605},
    {id:'D6',place:'北三站',load:2,earliest:585,latest:620}
  ];
  const baseTravel = Object.fromEntries(nodes.map(from => [from,Object.fromEntries(nodes.map(to =>
    [to,Math.abs(points[from][0]-points[to][0])+Math.abs(points[from][1]-points[to][1])]))]));
  const distanceKm = Object.fromEntries(nodes.map(from => [from,Object.fromEntries(nodes.map(to => [to,baseTravel[from][to]/2]))]));
  const delayedTravel = clone(baseTravel);
  delayedTravel.D1.D2 = 45; delayedTravel.D2.D1 = 45;
  const scenarios = {
    normal:{id:'normal',version:'L1',name:'初始路况',orders,travelMinutes:baseTravel,distanceKm,returnDeadline:630,
      note:'全部路段使用初始通行分钟数。'},
    delay:{id:'delay',version:'L2',name:'反馈后：D1↔D2 延误',orders,travelMinutes:delayedTravel,distanceKm,returnDeadline:630,
      note:'D1↔D2 两个方向耗时由10变为45分钟；路程仍为5公里。其他路段与资源不变。'}
  };
  function scenario(id) {
    if (!Object.prototype.hasOwnProperty.call(scenarios,id)) throw Error('场景不存在，请选择初始或反馈场景。');
    return clone(scenarios[id]);
  }
  function clock(minutes) {
    return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  }
  function integer(value,min,max,label) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw Error(label+'必须为'+min+'–'+max+'之间的整数。');
    return value;
  }
  function normalize(input) {
    if (!input || typeof input !== 'object') throw Error('请填写路线参数。');
    scenario(input.scenarioId);
    if (typeof input.startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) throw Error('出发时间必须为有效的 HH:MM。');
    const serviceMinutes = integer(input.serviceMinutes,1,30,'服务时间');
    const capacities = {}, routes = {}, all = [];
    for (const vehicle of ['A','B']) {
      capacities[vehicle] = integer(input.capacities?.[vehicle],1,20,'车辆'+vehicle+'容量');
      const sequence = input.routes?.[vehicle];
      if (typeof sequence !== 'string') throw Error('车辆'+vehicle+'路线必须为逗号分隔的ID。');
      const ids = sequence.trim() === '' ? [] : sequence.split(/[,，]/).map(id => id.trim().toUpperCase());
      if (ids.some(id => id === '')) throw Error('车辆'+vehicle+'路线有空项，请删除连续或末尾逗号。');
      routes[vehicle] = ids.join(','); all.push(...ids);
    }
    const known = new Set(orders.map(order => order.id)), seen = new Set(), errors = [];
    for (const id of all) {
      if (!known.has(id)) errors.push('未知ID：'+id);
      if (seen.has(id)) errors.push('重复ID：'+id);
      seen.add(id);
    }
    const missing = [...known].filter(id => !seen.has(id));
    if (missing.length) errors.push('遗漏配送：'+missing.join(','));
    if (errors.length) throw Error(errors.join('；')+'。本次未计算，请保留六笔订单各一次。');
    return {scenarioId:input.scenarioId,startTime:input.startTime,serviceMinutes,capacities,routes};
  }
  function fingerprint(input) { return JSON.stringify(normalize(input)); }
  function evaluate(input) {
    const params = normalize(input), data = scenario(params.scenarioId);
    const byId = Object.fromEntries(data.orders.map(order => [order.id,order]));
    const [hour,minute] = params.startTime.split(':').map(Number), start = hour*60+minute;
    const routes = {}, issues = [], totals = {deliveries:0,onTime:0,distanceKm:0,travelMinutes:0,waitMinutes:0,serviceMinutes:0};
    for (const vehicle of ['A','B']) {
      const sequence = params.routes[vehicle] ? params.routes[vehicle].split(',') : [];
      const load = sequence.reduce((sum,id) => sum+byId[id].load,0), stops = [];
      if (load > params.capacities[vehicle]) issues.push({code:'capacity',vehicle,message:'车辆'+vehicle+'装载'+load+'格，超过容量'+params.capacities[vehicle]+'格。'});
      let current = 'DEPOT', time = start, km = 0, travel = 0, waiting = 0;
      for (const id of sequence) {
        const order = byId[id], legMinutes = data.travelMinutes[current][id], legKm = data.distanceKm[current][id];
        const arrival = time+legMinutes, serviceStart = Math.max(arrival,order.earliest), wait = serviceStart-arrival;
        const departure = serviceStart+params.serviceMinutes, late = Math.max(0,serviceStart-order.latest);
        stops.push({id,place:order.place,load:order.load,from:current,legMinutes,legKm,arrival,wait,serviceStart,departure,late});
        if (late) issues.push({code:'late',vehicle,orderId:id,message:vehicle+'车 '+id+'服务开始'+clock(serviceStart)+'，晚于'+clock(order.latest)+' '+late+'分钟。'});
        else totals.onTime++;
        time = departure; current = id; km += legKm; travel += legMinutes; waiting += wait;
      }
      const returnMinutes = data.travelMinutes[current].DEPOT, returnKm = data.distanceKm[current].DEPOT;
      time += returnMinutes; km += returnKm; travel += returnMinutes;
      if (sequence.length && time > data.returnDeadline) issues.push({code:'return',vehicle,message:'车辆'+vehicle+'返回'+clock(time)+'，晚于'+clock(data.returnDeadline)+' '+(time-data.returnDeadline)+'分钟。'});
      routes[vehicle] = {sequence,load,capacity:params.capacities[vehicle],stops,returnTime:time,returnMinutes,returnKm,distanceKm:km,travelMinutes:travel,waitMinutes:waiting};
      totals.deliveries += stops.length; totals.distanceKm += km; totals.travelMinutes += travel; totals.waitMinutes += waiting;
      totals.serviceMinutes += stops.length*params.serviceMinutes;
    }
    const resourcesChanged = params.startTime !== '09:00' || params.serviceMinutes !== 5 || params.capacities.A !== 5 || params.capacities.B !== 5;
    return {inputFingerprint:JSON.stringify(params),scenarioId:data.id,scenarioVersion:data.version,params,routes,totals,issues,
      feasible:issues.length === 0,resourcesChanged,meetsBrief:issues.length === 0 && !resourcesChanged};
  }
  function snapshot(round,input,result,note = '') {
    if (!['V1','V2'].includes(round)) throw Error('只能保留V1或V2。');
    const params = normalize(input);
    if (!result || result.inputFingerprint !== JSON.stringify(params)) throw Error('参数或场景已变化，请重新计算后再保留。');
    if (round === 'V1' && params.scenarioId !== 'normal') throw Error('V1请使用初始路况。');
    if (round === 'V2' && params.scenarioId !== 'delay') throw Error('V2请使用反馈后路况。');
    return clone({round,inputs:params,scenario:scenario(params.scenarioId),result,note:String(note).slice(0,30000)});
  }
  function exportText(rounds) {
    const lines = ['# 我的物流规划两轮记录','','全部订单、路况、资源与结果为离线教学模拟。未执行真实调度。',''];
    for (const round of ['V1','V2']) {
      const saved = rounds[round];
      if (!saved) {lines.push('## '+round+'（尚未保留）',''); continue;}
      lines.push('## '+round,'','场景：'+saved.scenario.version+' / '+saved.scenario.name,
        '资源：出发'+saved.inputs.startTime+'；服务'+saved.inputs.serviceMinutes+'分钟/站；A/B容量'+saved.inputs.capacities.A+'/'+saved.inputs.capacities.B+'格。',
        'A路线：'+saved.inputs.routes.A,'B路线：'+saved.inputs.routes.B,
        '当前参数可行：'+(saved.result.feasible?'是':'否')+'；按任务既定资源可交接：'+(saved.result.meetsBrief?'是':'否'),
        '总路程：'+saved.result.totals.distanceKm+'公里；窗口内：'+saved.result.totals.onTime+'/6；等待：'+saved.result.totals.waitMinutes+'分钟。','');
      for (const vehicle of ['A','B']) {
        const route = saved.result.routes[vehicle];
        lines.push('### 车辆'+vehicle+'：'+route.load+'/'+route.capacity+'格','',
          '| ID | 到达 | 等待分钟 | 服务开始 | 离开 | 晚到分钟 |','|---|---|---:|---|---|---:|',
          ...route.stops.map(stop => '| '+stop.id+' | '+clock(stop.arrival)+' | '+stop.wait+' | '+clock(stop.serviceStart)+' | '+clock(stop.departure)+' | '+stop.late+' |'),
          '','返回：'+clock(route.returnTime)+'（含最后一站到仓库的路程与耗时）','');
      }
      lines.push('检查：'+(saved.result.issues.length?saved.result.issues.map(issue => issue.message).join('；'):'当前参数全部检查通过'),
        '说明：'+(saved.note||'尚未填写理由与未确认项'),'','### 本轮材料与参数快照','',JSON.stringify({inputs:saved.inputs,scenario:saved.scenario},null,2),'');
    }
    lines.push('交接补充：初版→修订改了什么；仍需谁确认；哪些实际条件未模拟。');
    return lines.join('\n');
  }
  return {scenario,clock,fingerprint,evaluate,snapshot,exportText};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LogisticsCore;
