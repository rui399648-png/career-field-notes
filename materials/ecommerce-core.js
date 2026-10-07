'use strict';
// 全部数据和需求公式为教学模拟；不读取账号、网络或真实订单。
const CareerEcommerce = (() => {
  const VERSION = 'ecommerce-2026-10-07';
  const PRODUCTS = [
    {sku:'S01', name:'香氛手作包', listPrice:59, minPrice:39, promoCeiling:49, regularDemand:12, promoDemand:32, unitCost:28, shipping:5, returnHandling:8, stock:45, adOrderCost:12, returnRate:0.05},
    {sku:'S02', name:'便携杯', listPrice:79, minPrice:49, promoCeiling:59, regularDemand:10, promoDemand:26, unitCost:35, shipping:5, returnHandling:10, stock:40, adOrderCost:15, returnRate:0.04},
    {sku:'S03', name:'桌面收纳', listPrice:49, minPrice:29, promoCeiling:39, regularDemand:14, promoDemand:34, unitCost:20, shipping:4, returnHandling:6, stock:55, adOrderCost:10, returnRate:0.05},
    {sku:'S04', name:'轻量托特', listPrice:39, minPrice:25, promoCeiling:29, regularDemand:18, promoDemand:40, unitCost:16, shipping:4, returnHandling:5, stock:65, adOrderCost:8, returnRate:0.03}
  ];
  const RULES = {adBudget:400, minContribution:700, maxSkus:2};
  const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
  function products(scenario) {
    if (!['initial','feedback'].includes(scenario)) throw Error('未知场景。');
    return PRODUCTS.map(item => ({...item, ...(scenario === 'feedback' && item.sku === 'S01' ? {stock:18} : {}), ...(scenario === 'feedback' && item.sku === 'S02' ? {returnRate:0.20, adOrderCost:25} : {})}));
  }
  function evaluate(plan, scenario) {
    const catalog = products(scenario);
    if (!Array.isArray(plan) || plan.length !== catalog.length || new Set(plan.map(item => item?.sku)).size !== catalog.length || plan.some(item => !catalog.some(product => product.sku === item?.sku))) throw Error('商品参数须包含四个不同的已知商品。');
    const rows = catalog.map(product => {
      const item = plan.find(row => row.sku === product.sku);
      if (!amount(item.price) || item.price < product.minPrice || item.price > product.listPrice) throw Error(product.sku + '价格须在最低价和原价之间，最多两位小数。');
      if (typeof item.units !== 'number' || !Number.isSafeInteger(item.units) || item.units < 0 || item.units > 1000000) throw Error(product.sku + '数量须为0到1000000之间的整数。');
      if (!amount(item.adSpend)) throw Error(product.sku + '投放金额须为非负有限金额，最多两位小数。');
      if (item.units === 0 && item.adSpend !== 0) throw Error(product.sku + '未主推商品的投放金额须为0。');
      const baseDemand = item.price <= product.promoCeiling ? product.promoDemand : product.regularDemand;
      const paidOrders = Math.floor(item.adSpend / product.adOrderCost);
      const demandLimit = baseDemand + paidOrders;
      const expectedReturns = item.units * product.returnRate;
      const retainedRevenue = item.units * (1 - product.returnRate) * item.price;
      const goodsCost = item.units * product.unitCost;
      const shippingCost = item.units * product.shipping;
      const returnCost = expectedReturns * product.returnHandling;
      return {...product, price:item.price, units:item.units, adSpend:item.adSpend, baseDemand, paidOrders, demandLimit,
        expectedReturns:money(expectedReturns), retainedRevenue:money(retainedRevenue), goodsCost:money(goodsCost), shippingCost:money(shippingCost), returnCost:money(returnCost),
        contribution:money(retainedRevenue - goodsCost - shippingCost - returnCost - item.adSpend)};
    });
    const totals = rows.reduce((result, row) => {
      for (const key of Object.keys(result)) result[key] += row[key];
      return result;
    }, {units:0, adSpend:0, retainedRevenue:0, goodsCost:0, shippingCost:0, returnCost:0, contribution:0});
    for (const key of Object.keys(totals)) totals[key] = money(totals[key]);
    const violations = [];
    const issue = (code, message, sku) => violations.push({code, message, ...(sku ? {sku} : {})});
    const activeSkus = rows.filter(row => row.units > 0).length;
    if (activeSkus < 1 || activeSkus > RULES.maxSkus) issue('sku-count', '选择1到2个主推商品（计划量大于0）。');
    if (totals.adSpend > RULES.adBudget) issue('budget', '投放总额超过400元预算。');
    for (const row of rows) {
      if (row.units > row.stock) issue('stock', row.sku + '计划量超过可用库存。', row.sku);
      if (row.units > row.demandLimit) issue('demand', row.sku + '计划量超过本情境需求上限。', row.sku);
    }
    if (totals.contribution < RULES.minContribution) issue('target', '预期贡献额低于700元，需修改或说明暂停条件。');
    return {version:VERSION, scenario, rules:{...RULES}, plan:rows.map(row => ({sku:row.sku, price:row.price, units:row.units, adSpend:row.adSpend})), rows, totals, activeSkus, violations, feasible:violations.length === 0};
  }
  function snapshot(result, label) {
    if (!result || result.version !== VERSION || !['initial','feedback'].includes(result.scenario) || typeof label !== 'string' || !label.trim()) throw Error('快照须来自本次计算并有名称。');
    return JSON.parse(JSON.stringify({...result, label:label.trim()}));
  }
  return {VERSION, RULES, products, evaluate, snapshot};
})();
if (typeof globalThis !== 'undefined') globalThis.CareerEcommerce = CareerEcommerce;
if (typeof module !== 'undefined' && module.exports) module.exports = CareerEcommerce;
