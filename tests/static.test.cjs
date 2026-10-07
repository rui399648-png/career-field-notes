'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const indexFile = path.join(root, 'index.html');

function localLink(from, link) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(link)) return;
  const pathname = decodeURIComponent(link.split(/[?#]/)[0]);
  if (!pathname) return;
  const target = path.resolve(path.dirname(from), pathname);
  const relative = path.relative(root, target);
  assert.ok(relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative),
    'local link escapes repository: ' + link);
  assert.ok(fs.existsSync(target), 'missing link: ' + path.relative(root, from) + ' => ' + link);
}

function productSources(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || ['tests', 'node_modules', '__pycache__'].includes(entry.name)) return [];
      return productSources(file);
    }
    return entry.isFile() && /\.(?:md|html|js)$/.test(entry.name) ? [file] : [];
  });
}

test('all ten task descriptors expose 45-minute exercises and valid material links', () => {
  const context = vm.createContext({});
  const index = fs.readFileSync(indexFile, 'utf8');
  const taskScripts = [...index.matchAll(/<script\b[^>]*src="(tasks-[^"]+\.js)"/g)]
    .map(match => match[1]);
  for (const file of taskScripts) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  const tasks = vm.runInContext('TASKS', context);
  assert.deepEqual(Object.keys(tasks), ['test', 'build', 'product', 'content', 'data', 'ai', 'security','ecommerce','logistics','ux']);
  function checkPaths(item) {
    if (!item || typeof item !== 'object') return;
    if (typeof item.path === 'string') localLink(indexFile, item.path);
    for (const value of Object.values(item)) {
      if (value && typeof value === 'object') checkPaths(value);
    }
  }
  for (const task of Object.values(tasks)) {
    assert.equal(task.steps.reduce((sum, step) => sum + parseInt(step[0], 10), 0), 45);
    checkPaths(task);
    assert.ok(['work', 'feedback', 'handoff'].every(phase => task.fields.some(field => field.phase === phase)),
      'missing work phase in ' + task.name);
    assert.equal(new Set(task.fields.map(field => field.key)).size, task.fields.length,
      'duplicate field keys in ' + task.name);
    assert.ok(![...(task.commands || []), ...(task.feedback.commands || [])]
      .some(command => /--capacity\b/.test(command)), 'invalid CLI singular capacity');
  }
});

test('local Markdown and HTML links exist, and product JavaScript parses', () => {
  for (const file of productSources(root)) {
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.md')) {
      for (const match of source.matchAll(/\]\(([^)]+)\)/g)) localLink(file, match[1]);
    }
    if (file.endsWith('.html')) {
      for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) localLink(file, match[1]);
    }
    if (file.endsWith('.js')) new vm.Script(source, { filename: file });
  }
});
