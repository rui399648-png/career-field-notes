'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const coreFile = path.join(root, 'materials', 'logistics-core.js');

function loadCore() {
  assert.ok(fs.existsSync(coreFile), 'logistics core must exist');
  return require(coreFile);
}
const base = () => ({scenarioId:'normal', startTime:'09:00', serviceMinutes:5,
  capacities:{A:5, B:5}, routes:{A:'D1,D2,D3', B:'D4,D5,D6'}});

test('six deliveries produce independently hand-calculated arrival, waiting, distance and returns', () => {
  const core = loadCore();
  const plan = base();
  const result = core.evaluate(plan);
  assert.equal(result.feasible, true);
  assert.deepEqual(result.routes.A.stops.map(stop => stop.arrival), [550,565,580]);
  assert.deepEqual(result.routes.B.stops.map(stop => stop.wait), [0,0,5]);
  assert.equal(result.routes.A.returnTime, 615);
  assert.equal(result.routes.B.returnTime, 620);
  assert.equal(result.routes.A.load, 5);
  assert.equal(result.totals.distanceKm, 60);
  assert.equal(result.totals.onTime, 6);
  assert.equal(result.totals.waitMinutes, 5);
  assert.deepEqual(plan, base(), 'evaluation must not alter user inputs');
});

test('feedback matrix makes initial route late and reordered route feasible with actual recalculation', () => {
  const core = loadCore();
  const delayed = {...base(), scenarioId:'delay'};
  const before = core.evaluate(delayed);
  assert.equal(before.feasible, false);
  assert.equal(before.routes.A.stops[1].arrival, 600);
  assert.equal(before.routes.A.returnTime, 650);
  assert.ok(before.issues.some(issue => issue.code === 'late' && issue.orderId === 'D2'));
  assert.ok(before.issues.some(issue => issue.code === 'late' && issue.orderId === 'D3'));
  assert.ok(before.issues.some(issue => issue.code === 'return' && issue.vehicle === 'A'));
  delayed.routes = {...delayed.routes, A:'D1,D3,D2'};
  const after = core.evaluate(delayed);
  assert.equal(after.feasible, true);
  assert.equal(after.routes.A.stops[2].serviceStart, 595, 'latest service-start boundary is inclusive');
  assert.equal(after.routes.A.returnTime, 620);
  assert.equal(after.totals.distanceKm, 60, 'road delay changes time, not distance');
});

test('capacity and user parameters really affect checks, and all orders remain accounted for', () => {
  const core = loadCore();
  const overloaded = base(); overloaded.capacities.A = 4;
  const result = core.evaluate(overloaded);
  assert.equal(result.feasible, false);
  assert.ok(result.issues.some(issue => issue.code === 'capacity' && issue.vehicle === 'A'));
  assert.equal(result.totals.deliveries, 6);
  const later = base(); later.startTime = '09:10';
  assert.equal(core.evaluate(later).routes.A.stops[0].arrival, 560);
  const slowerService = base(); slowerService.serviceMinutes = 10;
  assert.equal(core.evaluate(slowerService).routes.A.returnTime, 630);
});

test('unknown, duplicate, missing deliveries and malformed parameters reject calculation', () => {
  const core = loadCore();
  for (const [routes, pattern] of [
    [{A:'D1,D2,X',B:'D4,D5,D6'}, /未知.*X/],
    [{A:'D1,D2,D3',B:'D3,D4,D5,D6'}, /重复.*D3/],
    [{A:'D1,D2',B:'D4,D5,D6'}, /遗漏.*D3/],
    [{A:'D1,,D2,D3',B:'D4,D5,D6'}, /空项/]
  ]) assert.throws(() => core.evaluate({...base(),routes}), pattern);
  assert.throws(() => core.evaluate({...base(),scenarioId:'unknown'}), /场景/);
  assert.throws(() => core.evaluate({...base(),startTime:'25:00'}), /出发时间/);
  assert.throws(() => core.evaluate({...base(),serviceMinutes:-1}), /服务时间/);
  assert.throws(() => core.evaluate({...base(),capacities:{A:0,B:5}}), /容量/);
  assert.throws(() => core.evaluate({...base(),capacities:{A:Infinity,B:5}}), /容量/);
  assert.throws(() => core.evaluate({...base(),capacities:{A:5.5,B:5}}), /容量/);
});

test('retained rounds contain immutable inputs, scenario matrix and matching evaluated outputs', () => {
  const core = loadCore();
  const inputs = base();
  const result = core.evaluate(inputs);
  const v1 = core.snapshot('V1', inputs, result, '先保留原版');
  inputs.routes.A = 'D1,D3,D2';
  assert.equal(v1.inputs.routes.A, 'D1,D2,D3');
  assert.equal(v1.scenario.travelMinutes.D1.D2, 10);
  assert.throws(() => core.snapshot('V2', inputs, result), /重新计算/);
  const v2Inputs = {...base(),scenarioId:'delay',routes:{A:'D1,D3,D2',B:'D4,D5,D6'}};
  const v2 = core.snapshot('V2', v2Inputs, core.evaluate(v2Inputs), '避开延误路段');
  assert.equal(v2.scenario.travelMinutes.D1.D2, 45);
  assert.equal(v2.result.routes.A.returnTime, 620);
  result.routes.A.returnTime = 0;
  assert.equal(v1.result.routes.A.returnTime, 615);
  const text = core.exportText({V1:v1,V2:v2});
  assert.match(text, /V1[\s\S]*09:10[\s\S]*10:15/);
  assert.match(text, /V2[\s\S]*D1,D3,D2[\s\S]*10:20/);
  assert.match(text, /45/);
});

test('task and offline workbench expose real controls, three phases, copy and download without network', () => {
  const taskFile = path.join(root, 'tasks-logistics.js');
  const htmlFile = path.join(root, 'materials', 'logistics-workbench.html');
  assert.ok(fs.existsSync(taskFile), 'task descriptor must exist');
  assert.ok(fs.existsSync(htmlFile), 'offline workbench must exist');
  const context = vm.createContext({TASKS:{}});
  vm.runInContext(fs.readFileSync(taskFile,'utf8'), context);
  const task = vm.runInContext('TASKS.logistics', context);
  assert.equal(task.steps.reduce((sum,step) => sum + parseInt(step[0],10),0),45);
  assert.deepEqual(Array.from(task.fields, field => field.phase),['work','feedback','handoff']);
  for (const file of task.files) assert.ok(fs.existsSync(path.join(root,file.path)),file.path);
  assert.ok(fs.existsSync(path.join(root,task.reference.path)));
  const html = fs.readFileSync(htmlFile,'utf8');
  const script = fs.readFileSync(path.join(root,'materials','logistics-workbench.js'),'utf8');
  for (const id of ['route-A','route-B','run','keep-v1','keep-v2','export-text','download']) assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(script,/LogisticsCore\.evaluate\(/);
  assert.match(script,/LogisticsCore\.snapshot\(/);
  assert.match(script,/createObjectURL/);
  assert.doesNotMatch(script,/\bfetch\(|XMLHttpRequest|localStorage/);
});

function workbench() {
  const scriptFile = path.join(root,'materials','logistics-workbench.js');
  assert.ok(fs.existsSync(scriptFile), 'workbench behavior must exist');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{id,value:'',textContent:'',innerHTML:'',disabled:false,
      listeners:{},addEventListener(type,fn) {this.listeners[type]=fn;},
      emit(type) {this.listeners[type]?.({target:this});},select(){},focus(){}});
    return elements.get(id);
  };
  const defaults = {'scenario':'normal','start-time':'09:00','service-minutes':'5','capacity-A':'5','capacity-B':'5','route-A':'D1,D2,D3','route-B':'D4,D5,D6','notes':''};
  for (const [id,value] of Object.entries(defaults)) element(id).value=value;
  const context = vm.createContext({LogisticsCore:loadCore(),document:{getElementById:element,createElement:() => ({click(){},remove(){}}),body:{appendChild(){}}},
    URL:{createObjectURL:() => 'blob:mock',revokeObjectURL(){}},Blob:function(){},setTimeout:fn => {fn();},navigator:{}});
  vm.runInContext(fs.readFileSync(scriptFile,'utf8'),context);
  return element;
}

test('actual workbench events invalidate old calculations while preserving V1 and producing changed V2 export', () => {
  const element = workbench();
  element('run').emit('click');
  assert.equal(element('keep-v1').disabled,false);
  element('keep-v1').emit('click');
  assert.match(element('export-text').value,/V1[\s\S]*D1,D2,D3/);
  element('scenario').value='delay'; element('scenario').emit('change');
  assert.equal(element('keep-v2').disabled,true);
  assert.match(element('status').textContent,/重新计算/);
  element('run').emit('click');
  assert.match(element('results').innerHTML,/晚于/);
  element('route-A').value='D1,D3,D2'; element('route-A').emit('input');
  assert.equal(element('keep-v2').disabled,true);
  element('run').emit('click'); element('keep-v2').emit('click');
  assert.match(element('export-text').value,/V1[\s\S]*D1,D2,D3[\s\S]*V2[\s\S]*D1,D3,D2/);
  assert.match(element('export-text').value,/10:20/);
  element('route-A').value='D1,X,D2'; element('run').emit('click');
  assert.equal(element('keep-v2').disabled,true);
  assert.match(element('status').textContent,/未知ID/);
  assert.doesNotMatch(element('results').innerHTML,/窗口内/);
  assert.match(element('export-text').value,/V2[\s\S]*D1,D3,D2/);
});
