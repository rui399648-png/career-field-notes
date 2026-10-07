'use strict';
const CareerState = (() => {
  const VERSION = 2;
  const KEY = 'career-field-notes-v2';
  const LEGACY_KEY = 'career-field-notes-v1';
  function empty() { return { version: VERSION, fields: {}, archives: [], timers: {}, updated: null }; }
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const booleanKey = key => key.endsWith('_done') || /_check_\d+$/.test(key);
  function validTimer(timer) {
    return object(timer) && Number.isFinite(timer.remainingMs) && timer.remainingMs >= 0 && (timer.deadline === null || Number.isFinite(timer.deadline)) && typeof timer.started === 'boolean' && (timer.started || timer.deadline === null);
  }
  function validState(value) {
    return object(value) && value.version === VERSION && object(value.fields)
      && Object.entries(value.fields).every(([key, field]) => booleanKey(key) ? typeof field === 'boolean' : typeof field === 'string')
      && Array.isArray(value.archives) && value.archives.every(validLegacy)
      && object(value.timers) && Object.values(value.timers).every(validTimer)
      && (value.updated === null || typeof value.updated === 'string');
  }
  function validLegacy(value) { return object(value) && value.version === 1 && object(value.fields); }
  function load(storage) {
    const session = { state: empty(), saveAllowed: true, rawBackup: null, expectedRaw: null, message: '尚未填写，记录尚未保存。', persisted: false };
    let raw;
    try {
      raw = storage.getItem(KEY);
      session.expectedRaw = raw;
    }
    catch (error) {
      session.saveAllowed = false;
      session.message = '无法读取浏览器中的旧记录，已禁止自动覆盖；当前填写只在内存中，请导出备份。';
      return session;
    }
    let legacy = false;
    if (raw === null) {
      try { raw = storage.getItem(LEGACY_KEY); legacy = true; }
      catch (error) {
        session.saveAllowed = false;
        session.message = '无法读取旧版记录，已禁止自动覆盖；当前填写只在内存中，请导出备份。';
        return session;
      }
      if (raw === null) return session;
    }
    try {
      const incoming = JSON.parse(raw);
      if (legacy) {
        if (!validLegacy(incoming)) throw Error('不兼容的旧版记录格式或版本');
        session.state.archives.push(incoming);
        session.message = '旧版记录已完整保留为只读归档；本轮答案尚未填写，归档尚未保存到新版。';
      } else {
        if (!validState(incoming)) throw Error('不兼容的记录格式或版本');
        session.state = incoming;
        session.persisted = true;
        session.message = '已读取当前浏览器中的记录。';
      }
    } catch (error) {
      session.saveAllowed = false;
      session.rawBackup = raw;
      session.message = '记录损坏或版本不兼容，原始内容已保留；当前填写只在内存中，请导出备份。';
    }
    return session;
  }
  function save(storage, session) {
    if (!session.saveAllowed) { session.persisted = false; return false; }
    let currentRaw;
    try { currentRaw = storage.getItem(KEY); }
    catch (error) {
      session.saveAllowed = false;
      session.persisted = false;
      session.message = '无法读取并核对浏览器记录，已停止自动覆盖；当前填写仍在本页内存中，请先导出备份，再刷新页面。';
      return false;
    }
    if (currentRaw !== session.expectedRaw) {
      session.saveAllowed = false;
      session.persisted = false;
      session.message = '另一页面已更新浏览器记录，已停止自动覆盖；当前填写仍在本页内存中，请先导出备份，再刷新读取最新记录。';
      return false;
    }
    session.state.updated = new Date().toISOString();
    try {
      const raw = JSON.stringify(session.state);
      storage.setItem(KEY, raw);
      session.expectedRaw = raw;
      session.persisted = true;
      session.message = '已保存在当前浏览器，建议导出备份。';
      return true;
    } catch (error) {
      session.persisted = false;
      session.message = '浏览器保存失败，当前填写仍在本页内存中；请导出备份后再离开。';
      return false;
    }
  }
  function mergeBackup(state, incoming, allowedKeys) {
    if (!object(incoming) || ![1, VERSION].includes(incoming.version) || !object(incoming.fields)) throw Error('备份格式或版本不正确');
    const next = JSON.parse(JSON.stringify(state));
    const fingerprints = new Set(next.archives.map(archive => JSON.stringify(archive)));
    let archived = 0;
    function addArchive(archive) {
      if (!validLegacy(archive)) return;
      const fingerprint = JSON.stringify(archive);
      if (fingerprints.has(fingerprint)) return;
      next.archives.push(JSON.parse(fingerprint));
      fingerprints.add(fingerprint);
      archived++;
    }
    if (incoming.version === 1) {
      addArchive(incoming);
      return { state: next, count: 0, archived };
    }
    if (Array.isArray(incoming.archives)) incoming.archives.forEach(addArchive);
    const allowed = new Set(allowedKeys);
    let count = 0;
    for (const [key, value] of Object.entries(incoming.fields)) {
      const booleanField = booleanKey(key);
      if (!allowed.has(key) || (booleanField ? typeof value !== 'boolean' : typeof value !== 'string') || (typeof value === 'string' && value.length > 30000)) continue;
      const exists = Object.prototype.hasOwnProperty.call(next.fields, key);
      if ((!exists || next.fields[key] === '') && (!exists || next.fields[key] !== value)) {
        next.fields[key] = value;
        count++;
      }
    }
    return { state: next, count, archived };
  }
  const DEFAULT_DURATION = 2700000;
  function remaining(state, id, now) {
    const timer = Object.prototype.hasOwnProperty.call(state.timers, id) ? state.timers[id] : null;
    if (!timer) return DEFAULT_DURATION;
    return Math.max(0, timer.deadline === null ? timer.remainingMs : timer.deadline - now);
  }
  function startTimer(state, id, now, durationMs = DEFAULT_DURATION) {
    if (!Object.prototype.hasOwnProperty.call(state.timers, id)) state.timers[id] = { remainingMs: durationMs, deadline: null, started: false };
    const timer = state.timers[id];
    const left = remaining(state, id, now);
    if (timer.deadline !== null && left > 0) return timer;
    timer.remainingMs = left;
    timer.deadline = left > 0 ? now + left : null;
    timer.started = true;
    return timer;
  }
  function pauseTimer(state, id, now) {
    if (!Object.prototype.hasOwnProperty.call(state.timers, id)) return null;
    const timer = state.timers[id];
    timer.remainingMs = remaining(state, id, now);
    timer.deadline = null;
    return timer;
  }
  function resetTimer(state, id, durationMs = DEFAULT_DURATION) {
    state.timers[id] = { remainingMs: durationMs, deadline: null, started: false };
    return state.timers[id];
  }
  return { VERSION, KEY, LEGACY_KEY, empty, load, save, mergeBackup, startTimer, pauseTimer, resetTimer, remaining };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CareerState;
