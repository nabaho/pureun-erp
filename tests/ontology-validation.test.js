/* 검증센터의 분류·화면 상태는 정본 쓰기와 완전히 분리되어야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const O = require('../js/pu-ontology.js');
const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
const panel = erp.slice(erp.indexOf('function OntologyAuditPanel(){'), erp.indexOf('function DataLogMasters(){'));

function fixture(){
  return O.auditIntegrated({
    companies:[{id:'co1',name:'검증기업'}],
    contracts:[{id:'CT1',companyName:'검증기업',managerMain:'absent'}]
  }, {work_items:{ok:true,value:{W1:{title:'확인할 업무',mgr_main:{sid:'absent'}}}},home_pages:{ok:false,error:'PERMISSION_DENIED'}}, {});
}

test('검증센터는 읽기 제한과 외부의 끊어진 관계도 보여 주고 입력을 유지한다', () => {
  const report = fixture(), before = JSON.stringify(report);
  const queue = O.buildValidationQueue(report);
  assert.ok(queue.items.some(x => x.code === 'source_unreadable' && x.program === 'home'));
  assert.ok(queue.items.some(x => x.code === 'dangling_relation' && x.program === 'work'));
  assert.equal(new Set(queue.items.map(x => x.reviewId)).size, queue.total);
  const item = queue.items.find(x => x.code === 'source_unreadable');
  const decisions = {[item.reviewId]:'deferred'}, decisionsBefore = JSON.stringify(decisions);
  const filtered = O.filterValidationQueue(queue, {query:'홈페이지',category:'source',severity:'medium',status:'deferred',decisions});
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].reviewId, item.reviewId);
  assert.equal(O.filterValidationQueue(queue, {query:'일치하지않는검색어'}).length, 0);
  assert.equal(JSON.stringify(decisions), decisionsBefore);
  assert.equal(JSON.stringify(report), before);
  assert.deepEqual(O.buildValidationQueue(report).items.map(x => x.reviewId), queue.items.map(x => x.reviewId));
});

function harness(report){
  let cursor = 0;
  const states = [report], opened = [], downloads = [];
  const context = {
    window:{PuOntology:O,open:(...args) => opened.push(args)},
    h:(tag,props,...children) => ({tag,props:props||{},children:children.flat(Infinity)}),
    useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],v=>{states[index]=v;}];},
    dbSet(){throw new Error('검토 중 원본 쓰기 금지');},
    fbDb:{ref(){throw new Error('검토 중 Firebase 접근 금지');}},
    Blob:class {constructor(parts){downloads.push(JSON.parse(parts.join('')));}},
    URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},
    document:{createElement(){return {click(){}};}},
    todayStr(){return '2026-09-03';},setTimeout(){},showToast(){},
    /* 2026-09-05 4-D — 화면 밖에 둔 값 셋. 이 검사는 «검토 손잡이»만 재므로 빈 값으로 세운다.
       ⚠ 안 세우면 그리는 도중에 멎어, 정작 재려던 것이 아니라 이것 때문에 깨진다. */
    _ontCurrentGen:'', _ontHeavyRaw:null, _ontIdxAt:0
  };
  vm.createContext(context);
  new vm.Script(panel).runInContext(context);
  return {states,opened,downloads,render(){cursor=0;return context.OntologyAuditPanel();}};
}
function nodes(tree){
  if(!tree||typeof tree!=='object')return [];
  return [tree,...tree.children.flatMap(nodes)];
}
function button(tree,label){return nodes(tree).find(x=>x.tag==='button'&&x.children.includes(label));}

test('검증센터 화면의 완료·보류·원본 이동·내보내기를 실제 핸들러로 검사한다', () => {
  const report=fixture(), before=JSON.stringify(report), app=harness(report);
  let tree=app.render();
  assert.ok(button(tree,'검토 완료'));
  button(tree,'원본 프로그램 열기').props.onClick();
  assert.ok(Object.values(O.PROGRAMS).some(p=>p.file===app.opened[0][0]));
  button(tree,'검토 완료').props.onClick();
  assert.equal(Object.values(app.states[8]).filter(x=>x==='completed').length,1);
  tree=app.render();
  const status=nodes(tree).find(x=>x.tag==='select'&&x.props.value==='open');
  status.props.onChange({target:{value:'completed'}});
  tree=app.render();
  assert.ok(button(tree,'검토 완료 취소'));
  nodes(tree).find(x=>x.tag==='button'&&x.children.some(c=>typeof c==='string'&&c.includes('검토목록 파일'))).props.onClick();
  assert.equal(app.downloads[0].sourceMutation,'never');
  assert.ok(app.downloads[0].items.some(x=>x.reviewStatus==='completed'));
  button(tree,'보류').props.onClick();
  assert.equal(Object.values(app.states[8]).filter(x=>x==='deferred').length,1);
  assert.equal(JSON.stringify(report),before);
});

test('진단 전 화면도 보고서 없이 정상 생성된다', () => {
  assert.doesNotThrow(()=>harness(null).render());
});
