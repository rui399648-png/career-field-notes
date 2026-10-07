'use strict';
// 离线、确定性的字面关键词检索与摘录模板。没有模型、网络请求或题号答案表。
const CareerAI = (() => {
  const KNOWLEDGE_VERSION = 'campus-qa-2026-10-07';
  const KNOWLEDGE = [
    { id: 'K00', title: '往期通知：不可用于本次回答', status: 'archived', version: 'v0',
      keywords: ['活动', '哪里', '几点', '开始', '时间', '地点', '证书', '学分'],
      facts: ['往期活动在13:00于A101开始，曾有参与证明。此卡已归档，不是本次活动事实。'] },
    { id: 'K01', title: '本次时间地点与名额', status: 'active', version: 'v2',
      keywords: ['活动', '哪里', '几点', '开始', '时间', '地点', '费用', '免费'],
      facts: ['本次手机摄影入门工作坊免费，周六14:00–15:00在教学楼B203举行，共20名。'] },
    { id: 'K02', title: '设备与基础', status: 'active', version: 'v2',
      keywords: ['手机', '相机', '设备', '零基础'],
      facts: ['手机即可，不需要相机，零基础可参加。'] },
    { id: 'K03', title: '证书与学分', status: 'active', version: 'v2',
      keywords: ['证书', '学分'], facts: ['本次活动不提供学分或证书。'] }
  ];
  const INITIAL_CONFIG = { activeOnly: false, unknownMode: 'guess', aliases: {}, includeSource: true };
  const CASES = [
    { id: 'E01', question: '活动在哪里、几点开始？', expected: '14:00–15:00、B203；来源K01/v2；不得使用K00。' },
    { id: 'E02', question: '我没有相机，只有手机，能参加吗？', expected: '手机即可、零基础；来源K02/v2；修改后仍应通过。' },
    { id: 'E03', question: '参加后有没有证书或学分？', expected: '不提供学分或证书；来源K03/v2；不得引用往期证明。' },
    { id: 'E04', question: '我需要带专业摄影器材吗？', expected: '用设备知识说明手机即可；来源K02/v2；不能无证据猜测。' },
    { id: 'E05', question: '能提供停车位吗？', expected: '当前材料没有说明，建议确认；应拒答具体事实且来源为空。' }
  ];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function validateConfig(config) {
    if (!object(config)) throw Error('规则必须是JSON对象。');
    const allowed = ['activeOnly', 'unknownMode', 'aliases', 'includeSource'];
    const unexpected = Object.keys(config).find(key => !allowed.includes(key));
    if (unexpected) throw Error('未知规则字段：' + unexpected);
    if (typeof config.activeOnly !== 'boolean') throw Error('activeOnly字段必须为true或false。');
    if (!['guess', 'refuse'].includes(config.unknownMode)) throw Error('unknownMode字段只能为"guess"或"refuse"。');
    if (typeof config.includeSource !== 'boolean') throw Error('includeSource字段必须为true或false。');
    if (!object(config.aliases)) throw Error('aliases字段必须是对象，例如{"器材":"设备"}。');
    for (const [alias, target] of Object.entries(config.aliases)) {
      if (!alias.trim() || typeof target !== 'string' || !target.trim()) throw Error('aliases的词和目标都须为非空文字。');
    }
    return config;
  }
  function parseConfig(text) {
    let config;
    try { config = JSON.parse(text); }
    catch (error) { throw Error('JSON无法解析：' + error.message); }
    return validateConfig(config);
  }
  function answer(question, config, knowledge = KNOWLEDGE) {
    validateConfig(config);
    if (typeof question !== 'string' || !question.trim()) throw Error('问题须为非空文字。');
    const original = question.trim().toLowerCase();
    const aliasMatches = Object.entries(config.aliases)
      .filter(([alias]) => original.includes(alias.trim().toLowerCase()))
      .map(([alias, target]) => ({ alias, target }));
    const expandedQuestion = [original, ...aliasMatches.map(item => item.target.trim().toLowerCase())].join(' ');
    const candidates = knowledge.map(card => {
      const matchedKeywords = card.keywords.filter(keyword => expandedQuestion.includes(keyword.toLowerCase()));
      return { id: card.id, title: card.title, status: card.status, version: card.version,
        eligible: !config.activeOnly || card.status === 'active', matchedKeywords, score: matchedKeywords.length };
    });
    // 严格大于才替换，分数相同时保留知识卡数组中在前的一张。
    const selected = candidates.reduce((best, card) => card.eligible && card.score > 0 && (!best || card.score > best.score) ? card : best, null);
    const trace = { algorithm: '字面关键词数量；同分按知识卡顺序；只摘录一张卡',
      activeOnly: config.activeOnly, unknownMode: config.unknownMode, expandedQuestion, aliasMatches,
      candidates, selected: selected ? { id: selected.id, version: selected.version, score: selected.score } : null };
    if (!selected) {
      const refuse = config.unknownMode === 'refuse';
      return { question, decision: refuse ? 'refuse' : 'guess',
        response: refuse ? '当前材料没有说明，请向组织者确认。' : '【原型缺陷：没有证据】应该可以，请直接参加。', sources: [], trace };
    }
    const card = knowledge.find(item => item.id === selected.id);
    const source = { id: card.id, title: card.title, status: card.status, version: card.version };
    return { question, decision: 'excerpt', response: card.facts.join(' ') + (config.includeSource ? ` [来源：${card.id}/${card.version} · ${card.status}]` : ''), sources: [source], trace };
  }
  function runBatch(questions, config, knowledge = KNOWLEDGE) {
    validateConfig(config);
    if (!Array.isArray(questions)) throw Error('问题列表须为数组。');
    return questions.map(question => answer(question, config, knowledge));
  }
  return { KNOWLEDGE_VERSION, KNOWLEDGE, INITIAL_CONFIG, CASES, validateConfig, parseConfig, answer, runBatch };
})();
if (typeof globalThis !== 'undefined') globalThis.CareerAI = CareerAI;
if (typeof module !== 'undefined' && module.exports) module.exports = CareerAI;
