'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const coreFile = path.join(root, 'materials', 'ecommerce-core.js');
const api = () => fs.existsSync(coreFile) ? require(coreFile) : {};
const v1 = () => [
  {sku:'S01', price:49, units:40, adSpend:96},
  {sku:'S02', price:59, units:26, adSpend:0},
  {sku:'S03', price:39, units:0, adSpend:0},
  {sku:'S04', price:29, units:0, adSpend:0}
];
const v2 = () => v1().map(row => ({...row, units:row.sku === 'S03' ? 34 : row.sku === 'S04' ? 40 : 0, adSpend:0}));

test('ecommerce calculates expected contribution from actual plan parameters', () => {
  const core = api();
  assert.equal(typeof core.evaluate, 'function', 'missing ecommerce calculator');
  const result = core.evaluate(v1(), 'initial');
  assert.equal(result.scenario, 'initial');
  assert.equal(result.feasible, true);
  assert.equal(result.activeSkus, 2);
  assert.equal(result.totals.adSpend, 96);
  assert.equal(result.totals.units, 66);
  // S01: 40*.95*49 - 40*28 - 40*5 - 40*.05*8 - 96 = 430.
  assert.equal(result.rows[0].contribution, 430);
  // S02: 26*.96*59 - 26*35 - 26*5 - 26*.04*10 = 422.24.
  assert.equal(result.rows[1].contribution, 422.24);
  assert.equal(result.totals.contribution, 852.24);
  assert.equal(result.rows[0].demandLimit, 40);
  const regular = v1(); regular[0].price = 59;
  assert.equal(core.evaluate(regular, 'initial').rows[0].demandLimit, 20);
  assert.ok(core.evaluate(regular, 'initial').violations.some(item => item.code === 'demand'));
});

test('feedback changes stock and returns, requiring a revised feasible plan', () => {
  const core = api();
  assert.equal(typeof core.evaluate, 'function', 'missing ecommerce calculator');
  const unchanged = core.evaluate(v1(), 'feedback');
  assert.equal(unchanged.feasible, false);
  assert.ok(unchanged.violations.some(item => item.code === 'stock' && item.sku === 'S01'));
  assert.equal(unchanged.rows[1].contribution, 135.2);
  const revised = core.evaluate(v2(), 'feedback');
  assert.equal(revised.feasible, true);
  assert.equal(revised.totals.adSpend, 0);
  assert.equal(revised.totals.contribution, 752.7);
});

test('calculator reports operational constraints separately from malformed input', () => {
  const core = api();
  assert.equal(typeof core.evaluate, 'function', 'missing ecommerce calculator');
  const over = v1(); over[0].adSpend = 500;
  assert.ok(core.evaluate(over, 'initial').violations.some(item => item.code === 'budget'));
  const all = v1(); all[2].units = 1;
  assert.ok(core.evaluate(all, 'initial').violations.some(item => item.code === 'sku-count'));
  const weak = v1(); weak[0].units = 1; weak[1].units = 0; weak[0].adSpend = 0;
  assert.ok(core.evaluate(weak, 'initial').violations.some(item => item.code === 'target'));
  for (const field of ['price','units','adSpend']) {
    for (const value of [-1, NaN, Infinity, '2']) {
      const bad = v1(); bad[0][field] = value;
      assert.throws(() => core.evaluate(bad, 'initial'), /参数|金额|数量|价格/);
    }
  }
  const fraction = v1(); fraction[0].units = 1.5;
  assert.throws(() => core.evaluate(fraction, 'initial'), /数量/);
  const pennies = v1(); pennies[0].adSpend = 1.005;
  assert.throws(() => core.evaluate(pennies, 'initial'), /金额/);
  const lowPrice = v1(); lowPrice[0].price = 38;
  assert.throws(() => core.evaluate(lowPrice, 'initial'), /价格/);
  const duplicate = v1(); duplicate[3].sku = 'S01';
  assert.throws(() => core.evaluate(duplicate, 'initial'), /商品/);
  assert.throws(() => core.evaluate(v1().slice(1), 'initial'), /商品/);
  assert.throws(() => core.evaluate(v1(), 'unknown'), /场景/);
  const inactiveSpend = v1(); inactiveSpend[2].adSpend = 10;
  assert.throws(() => core.evaluate(inactiveSpend, 'initial'), /未主推/);
});

test('saved snapshots keep the old parameters and calculations after edits', () => {
  const core = api();
  assert.equal(typeof core.snapshot, 'function', 'missing ecommerce snapshots');
  const input = v1();
  const result = core.evaluate(input, 'initial');
  const saved = core.snapshot(result, 'V1-01');
  input[0].price = 39;
  result.rows[0].contribution = 0;
  assert.equal(saved.plan[0].price, 49);
  assert.equal(saved.rows[0].contribution, 430);
  assert.equal(saved.label, 'V1-01');
  assert.equal(saved.version, 'ecommerce-2026-10-07');
});

test('catalog and reference arithmetic match the CSV, including feedback assumptions', () => {
  const core = api();
  const rows = fs.readFileSync(path.join(root, 'materials', 'ecommerce-products.csv'), 'utf8').trim().split(/\r?\n/);
  const headers = rows.shift().split(',');
  const csv = rows.map(line => Object.fromEntries(line.split(',').map((value, i) => [headers[i], value])));
  const fields = {listPrice:'list_price', minPrice:'min_price', promoCeiling:'promo_ceiling', regularDemand:'regular_demand', promoDemand:'promo_demand', unitCost:'unit_cost', shipping:'shipping', returnHandling:'return_handling'};
  for (const scenario of ['initial','feedback']) {
    for (const item of core.products(scenario)) {
      const row = csv.find(source => source.sku === item.sku);
      assert.ok(row, 'known SKU');
      for (const [key, field] of Object.entries(fields)) assert.equal(item[key], Number(row[field]));
      assert.equal(item.stock, Number(row[scenario + '_stock']));
      assert.equal(item.adOrderCost, Number(row[scenario + '_ad_order_cost']));
      assert.equal(item.returnRate, Number(row[scenario + '_return_rate']));
    }
  }
});

test('workbench events invalidate stale outputs and export frozen V1/V2 evidence', () => {
  const deskFile = path.join(root, 'materials', 'ecommerce-workbench.js');
  assert.ok(fs.existsSync(deskFile), 'missing ecommerce workbench');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value:'', innerHTML:'', textContent:'', hidden:false, disabled:false, events:{}, addEventListener(name, fn) { this.events[name] = fn; }});
    return elements.get(id);
  };
  const context = vm.createContext({CareerEcommerce:api(), document:{getElementById:element}, navigator:{}, console});
  vm.runInContext(fs.readFileSync(deskFile, 'utf8'), context);
  const trigger = (id, event) => element(id).events[event]({preventDefault(){}});
  function setPlan(plan) {
    for (const row of plan) for (const key of ['price','units','adSpend']) element(row.sku + '-' + key).value = String(row[key]);
    trigger('plan-table', 'input');
  }
  setPlan(v1());
  trigger('plan-form', 'submit');
  assert.equal(element('save-snapshot').disabled, false);
  assert.ok(element('result').innerHTML.includes('852.24'));
  trigger('save-snapshot', 'click');
  const before = JSON.parse(element('evidence').value);
  assert.equal(before.snapshots[0].label, 'V1-01');
  element('S01-price').value = '39';
  trigger('plan-table', 'input');
  assert.equal(element('save-snapshot').disabled, true);
  assert.ok(!element('result').innerHTML.includes('852.24'));
  assert.equal(JSON.parse(element('evidence').value).snapshots[0].plan[0].price, 49);
  trigger('receive-feedback', 'click');
  assert.equal(element('feedback-card').hidden, false);
  assert.equal(element('save-snapshot').disabled, true);
  setPlan(v2());
  trigger('plan-form', 'submit');
  assert.ok(element('result').innerHTML.includes('752.70'));
  trigger('save-snapshot', 'click');
  const exported = JSON.parse(element('evidence').value);
  assert.equal(exported.snapshots.length, 2);
  assert.equal(exported.snapshots[1].label, 'V2-01');
  assert.equal(exported.snapshots[1].scenario, 'feedback');
  assert.equal(exported.snapshots[0].totals.contribution, 852.24);
  element('S03-units').value = '';
  trigger('plan-table', 'input');
  trigger('plan-form', 'submit');
  assert.equal(element('save-snapshot').disabled, true);
  assert.ok(!element('result').innerHTML.includes('752.70'));
  assert.ok(element('result').textContent.includes('空'));
});
