'use strict';
// Page event regression: executes the current UX page script against IDs read from its HTML.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const UX = require(path.join(root, 'materials/ux-core.js'));
const html = fs.readFileSync(path.join(root, 'materials/ux-workbench.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'materials/ux-workbench.js'), 'utf8');
function desk() {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(item=>item[1]);
  const elements = new Map(ids.map(id=>[id,{id,value:'',checked:false,hidden:false,disabled:false,textContent:'',events:{},attrs:{},
    addEventListener(name,fn){this.events[name]=fn;},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},focus(){this.focused=true;},select(){this.selected=true;}
  }]));
  const el = id => {assert.ok(elements.has(id),'script uses an HTML ID: '+id);return elements.get(id);};
  el('action-label').value='下一步';el('error-style').value='generic';el('confirmation').value='generic';
  const blobs=[], links=[];
  const context=vm.createContext({CareerUX:UX,document:{getElementById:el,createElement(tag){assert.equal(tag,'a');const link={click(){this.clicked=true;}};links.push(link);return link;}},navigator:{},Blob,
    URL:{createObjectURL(blob){blobs.push(blob);return 'blob:review';},revokeObjectURL(){}},setTimeout(fn){fn();}});
  vm.runInContext(script,context);
  const trigger=(id,name)=>el(id).events[name]({preventDefault(){}});
  const exported=()=>JSON.parse(el('evidence').value.slice(el('evidence').value.indexOf('{')));
  return {el,trigger,exported,blobs,links};
}
test('actual UX events enforce two fresh rounds, invalidate trace, retain form inputs, and export both versions',async()=>{
  const {el,trigger,exported,blobs,links}=desk();
  trigger('save-v2','click');assert.match(el('snapshot-status').textContent,/V1/);
  trigger('prototype','submit');assert.match(el('outcome').textContent,/检查/);
  el('nickname').value='虚构读者';el('slot').value='sat';el('code').value='DEMO';
  trigger('prototype','submit');assert.match(el('outcome').textContent,/模拟提交成功/);
  trigger('save-v1','click');assert.equal(el('save-v1').disabled,true);
  trigger('save-v2','click');assert.match(el('snapshot-status').textContent,/新一轮/);
  const v1=exported().snapshots.V1;
  el('show-rules').checked=true;el('action-label').value='确认模拟预约';el('error-style').value='field';el('confirmation').value='details';
  trigger('action-label','input');assert.equal(el('rules').hidden,false);assert.equal(el('primary').textContent,'确认模拟预约');
  assert.equal(exported().current.trace.length,0);assert.deepEqual(exported().snapshots.V1,v1);
  trigger('save-v2','click');assert.match(el('snapshot-status').textContent,/错误与成功/);
  el('slot').value='';trigger('prototype','submit');assert.equal(el('slot').attrs['aria-invalid'],'true');
  assert.equal(el('slot-error').hidden,false);assert.match(el('slot-error').textContent,/选择/);
  assert.equal(el('nickname').value,'虚构读者');assert.equal(el('code').value,'DEMO');
  el('slot').value='sat';trigger('prototype','submit');assert.match(el('outcome').textContent,/周六 10:00/);assert.match(el('outcome').textContent,/一楼交换角/);
  assert.equal(el('slot').attrs['aria-invalid'],undefined);assert.equal(el('slot-error').hidden,true);
  trigger('save-v2','click');assert.equal(el('save-v2').disabled,true);assert.equal(exported().snapshots.V2.trace.length,2);
  assert.deepEqual(exported().snapshots.V1,v1);
  el('action-label').value='   ';trigger('action-label','input');assert.equal(el('primary').disabled,true);
  assert.equal(exported().current.valid,false);assert.equal(exported().current.trace.length,0);
  trigger('prototype','submit');assert.match(el('outcome').textContent,/设计参数无效/);assert.equal(exported().current.trace.length,0);
  await trigger('copy','click');assert.equal(el('evidence').selected,true);assert.match(el('copy-status').textContent,/Ctrl\+C/);
  trigger('download','click');assert.equal(links[0].clicked,true);assert.match(links[0].download,/\.txt$/);
  assert.match(await blobs[0].text(),/"V1"/);assert.match(await blobs[0].text(),/"V2"/);
});
