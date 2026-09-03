/* 6-2단계: 새로운 연결은 실제 ID만, 변경하지 않은 과거 기록은 경고와 함께 보존한다. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const O=require('../js/pu-ontology.js');
const erp=fs.readFileSync(path.join(__dirname,'..','pu-erp.html'),'utf8');
const wrapper=erp.slice(erp.indexOf('function erpCheckWorkReferences(store,form){'),erp.indexOf('function ContractModal(props){'));
const fixture=()=>({user_dir:[{sid:'P1',name:'같은이름',status:'active'},{sid:'P2',name:'같은이름',status:'active'}],
  user_accounts:[],contracts:[{id:'CT1',contractNo:'계약번호-1'}],cases:[{id:'CS1',caseNo:'사건번호-1'}]});
const form=()=>({id:'NEW',managerMain:'P1',managerSubs:[]});
function validate(record,data=fixture(),options={}){return O.validateWorkReferences(record,data,{store:'cases',requireMain:true,...options});}

test('담당자는 공개 명부의 SID로 확인하고 이름이나 seed만으로 승인하지 않는다',()=>{
  assert.equal(validate(form()).ok,true);
  assert.equal(validate({...form(),managerMain:'같은이름'}).ok,false);
  assert.equal(validate(form(),{}).ok,false);
  assert.equal(validate({...form(),managerMain:''}).ok,false);
  assert.equal(validate({...form(),managerSubs:'P2'}).ok,false);
  assert.equal(validate({...form(),managerSubs:['P1']}).ok,false);
  assert.equal(validate({...form(),managerSubs:['P2','P2']}).ok,false);
  assert.equal(validate({...form(),managerSubs:['']}).ok,false);
  const data=fixture();data.user_dir.push({...data.user_dir[0]});
  assert.equal(validate(form(),data).ok,false);
});

test('계정의 퇴직·삭제·잠금·배제 및 휴직 상태는 신규 배정을 막고 기존 배정은 보존한다',()=>{
  for(const flags of [{status:'retired'},{_deleted:true},{accessLocked:true},{excludeFromAssign:true}]){
    const data=fixture();data.user_accounts=[{sid:'P1',...flags}];
    assert.equal(validate(form(),data).ok,false);
    const old=validate(form(),data,{previous:form()});
    assert.equal(old.ok,true);assert.ok(old.warnings.some(x=>x.code==='manager_not_assignable'));
  }
  assert.equal(validate(form(),fixture(),{unassignableSids:['P1']}).ok,false);
  assert.equal(validate(form(),fixture(),{previous:form(),unassignableSids:['P1']}).ok,true);
  const legacy={...form(),managerMain:'과거이름',managerSubs:['옛사번']};
  assert.equal(validate(legacy,fixture(),{previous:legacy}).ok,true);
  assert.equal(validate(legacy).ok,false);
});

test('원본 종류와 실제 ID가 함께 있어야 하고 삭제·중복·자기참조·번호 오대입을 거부한다',()=>{
  for(const ref of [{sourceKind:'contract',sourceId:'CT1',sourceContractNo:'계약번호-1'},{sourceKind:'case',sourceId:'CS1'},{sourceContractId:'CT1',sourceContractNo:'계약번호-1'}])
    assert.equal(validate({...form(),...ref}).ok,true);
  for(const ref of [{sourceKind:'contract'}, {sourceId:'CT1'}, {sourceKind:'manual',sourceId:'CT1'},
    {sourceKind:'contract',sourceId:'계약번호-1'},{sourceKind:'case',sourceId:'NEW'},{sourceContractId:'missing'},
    {sourceKind:'contract',sourceId:'CT1',sourceContractId:'CT2'}])
    assert.equal(validate({...form(),...ref}).ok,false,JSON.stringify(ref));
  for(const contracts of [[{id:'CT1',_deleted:true}],[{id:'CT1'},{id:'CT1'}]])
    assert.equal(validate({...form(),sourceContractId:'CT1'},{...fixture(),contracts}).ok,false);
});

test('과거 번호 단독·끊어진 참조는 수정하지 않고 경고하며 새 번호 연결은 차단한다',()=>{
  for(const ref of [{sourceContractNo:'과거-계약번호'},{sourceKind:'contract',sourceId:'missing'},{sourceContractId:'missing'}]){
    const record={...form(),...ref},data=fixture(),before=JSON.stringify({record,data});
    const result=validate(record,data,{previous:record});
    assert.equal(result.ok,true);assert.ok(result.warnings.length>0);
    assert.equal(validate(record,data).ok,false);
    assert.equal(JSON.stringify({record,data}),before);
  }
  const record={...form(),sourceContractId:'CT1',sourceContractNo:'옛번호'};
  assert.equal(validate(record,fixture(),{previous:record}).ok,true);
  assert.equal(validate(record).ok,false);
});

function context(data=fixture()){
  const calls={writes:[],patches:[],toasts:[]};
  const ctx={window:{PuOntology:O},dbGet:(k,seed)=>data[k]||seed,showToast:x=>calls.toasts.push(x),
    dbUpsert:(k,r)=>{calls.writes.push({k,r});return true;},lockGuard:()=>true,refreshContracts(){},refreshCases(){},
    useState:()=>['',()=>{}],h:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(Boolean)})};
  vm.createContext(ctx);new vm.Script(wrapper).runInContext(ctx);return {ctx,calls,data};
}
function nodes(tree,type){return (!tree||typeof tree!=='object')?[]:[...(tree.type===type?[tree]:[]),...tree.children.flatMap(x=>nodes(x,type))];}

test('공통 입력 패널은 명시적 선택 때 draft만 바꾸고 렌더링이나 검색으로 원본을 쓰지 않는다',()=>{
  const {ctx,calls}=context();const record={...form(),sourceContractNo:'옛번호'},before=JSON.stringify(record);
  const tree=ctx.OntologyWorkReferencePanel({store:'cases',value:record,onChange:p=>calls.patches.push(p)});
  assert.equal(calls.patches.length,0);assert.equal(calls.writes.length,0);
  nodes(tree,'select')[0].props.onChange({target:{value:'contract:CT1'}});
  assert.equal(calls.patches[0].sourceContractId,'CT1');
  assert.equal(calls.patches[0].sourceContractNo,'계약번호-1');
  nodes(tree,'button')[0].props.onClick();
  assert.equal(calls.patches[1].sourceContractNo,'');
  assert.equal(JSON.stringify(record),before);assert.equal(calls.writes.length,0);
  assert.ok(O.workReferenceCandidates(fixture(),'계약번호').every(x=>x.kind==='contract'));
  assert.ok(!O.workReferenceCandidates(fixture(),'',{store:'contracts',id:'CT1'}).some(x=>x.id==='CT1'));
  assert.match(erp,/h\(OntologyWorkReferencePanel,\{store:'contracts'/);
  assert.match(erp,/h\(OntologyWorkReferencePanel,\{store:'cases'/);
});

test('최종 건별 저장도 재검증하여 확인 도중 사라진 원본·퇴직 담당자의 신규 연결을 차단한다',()=>{
  const {ctx,calls,data}=context();
  const start=erp.indexOf('  function persistOne(item){');
  const caseStart=erp.indexOf('  function caseUpsert(item){');
  new vm.Script(erp.slice(start,erp.indexOf('  function patchOne(',start))+
    erp.slice(caseStart,erp.indexOf('  function casePatch(',caseStart))).runInContext(ctx);
  const record={...form(),companyLinkStatus:'pending',company:{name:'신규'},sourceContractId:'CT1'};
  assert.equal(ctx.erpCheckWorkReferences('cases',record).ok,true);
  data.contracts=[];
  assert.equal(ctx.caseUpsert(record),false);assert.equal(ctx.persistOne(record),false);
  assert.equal(calls.writes.length,0);
  data.contracts=[{id:'CT1'}];data.user_accounts=[{sid:'P1',status:'retired'}];
  assert.equal(ctx.caseUpsert(record),false);assert.equal(ctx.persistOne(record),false);
  data.cases=[record];
  assert.equal(ctx.caseUpsert({...record,note:'기존 업무 수정'}),true);
  assert.equal(calls.writes.length,1);
  delete ctx.window.PuOntology;
  assert.equal(ctx.erpValidateWorkReferences('cases',record),false);
});

test('실제 계약 담당자 선택창은 동명이인도 SID로 구별하고 선택부터 건별 저장까지 성공한다',()=>{
  const {ctx,calls,data}=context();
  Object.assign(ctx,{f:{...form(),companyLinkStatus:'pending',company:{name:'신규'}},users:data.user_dir,lawyers:data.user_dir,
    assignable:data.user_dir,SUBMGR_ADD_OPT:'추가',REASSIGN_SUFFIX:')',getUserAssignStatus:()=>({assignable:true,label:''})});
  ctx.setF=fn=>{ctx.f=fn(ctx.f);};
  const helpers=erp.indexOf('  function changeMgrMain(newSid){');
  new vm.Script(erp.slice(helpers,erp.indexOf('  function setSimple(k)',helpers))).runInContext(ctx);
  const start=erp.indexOf("  } else if(tab === 'manager'){");
  const body=erp.slice(erp.indexOf('    tabBody =',start),erp.indexOf("  } else if(tab === 'journal'){",start));
  function render(){new vm.Script(body).runInContext(ctx);return nodes(ctx.tabBody,'select');}
  let selects=render();
  assert.ok(nodes(selects[0],'option').some(x=>x.props.value==='P2'&&x.children.join('').includes('P2')));
  assert.ok(!nodes(selects[0],'option').some(x=>x.props.value==='같은이름'));
  selects[0].props.onChange({target:{value:'P2'}});
  selects=render();selects[1].props.onChange({target:{value:'P1'}});
  assert.equal(ctx.f.managerMain,'P2');assert.equal(ctx.f.managerSubs[0],'P1');
  const saveStart=erp.indexOf('  function persistOne(item){');
  new vm.Script(erp.slice(saveStart,erp.indexOf('  function patchOne(',saveStart))).runInContext(ctx);
  assert.equal(ctx.persistOne(ctx.f),true);assert.equal(calls.writes[0].r.managerMain,'P2');
  ctx.f={...ctx.f,managerMain:'과거이름'};
  const before=JSON.stringify(ctx.f);selects=render();
  assert.ok(nodes(selects[0],'option').some(x=>x.props.value==='과거이름'));
  assert.equal(JSON.stringify(ctx.f),before);
});

test('명시적이고 유일한 업무 ID만 derivedFrom으로 진단하며 번호·모순 참조는 색인하지 않는다',()=>{
  const data=fixture();data.cases=[{...form(),sourceKind:'contract',sourceId:'CT1',sourceContractId:'CT1'}];
  let result=O.audit(data),edges=result.edges.filter(x=>x.predicate==='derivedFrom');
  assert.equal(edges.length,1);assert.equal(edges[0].object,'Contract:CT1');assert.equal(edges[0].confidence,1);
  for(const ref of [{sourceContractNo:'계약번호-1'},{sourceContractId:'missing'},
    {sourceContractId:'CT1',sourceKind:'contract',sourceId:'different'}]){
    data.cases=[{...form(),...ref}];result=O.audit(data);
    assert.equal(result.edges.filter(x=>x.predicate==='derivedFrom').length,0);
    assert.ok(result.issues.some(x=>x.code==='orphan_source'));
  }
});
