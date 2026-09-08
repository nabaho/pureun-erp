/* 6-3단계: 실제 가져오기/이관 함수를 실행하며 운영 DB는 사용하지 않는다. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const O=require('../js/pu-ontology.js');
const erp=fs.readFileSync(path.join(__dirname,'..','pu-erp.html'),'utf8');
const helpers=erp.slice(erp.indexOf('function erpCheckWorkReferences(store,form){'),erp.indexOf('function ContractModal(props){'));
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){return {user_dir:[{sid:'P1',name:'동명이인',status:'active'},{sid:'P2',name:'동명이인',status:'active'}],user_accounts:[],
  companies:[{id:'A',name:'기업',bizNo:'1112233333',note:'원래메모',monthlyAdvisoryFee:500,createdAt:'original'}],
  contracts:[{id:'CT1',contractNo:'계약-1',updatedAt:1,companyId:'A',companyName:'기업',bizNo:'1112233333',
    company:{companyId:'A',name:'기업',bizNo:'1112233333',contacts:[]},managerMain:'P1',managerSubs:[],
    kinds:['company','case'],typeCodes:{company:'ADV',case:'LAB',consulting:'CONS',fund:'FUND',other:'OTHER'},signDate:'2026-01-02',amounts:{}}],
  cases:[],consultings:[],funds:[],other_projects:[]};}
function context(){
  const data=fixture(),calls={writes:[],removes:[],toasts:[]};
  const ctx={window:{PuOntology:O},dbGet:(k,s)=>data[k]||s,showToast:m=>calls.toasts.push(m),console:{error(){}},
    dbUpsert:(k,r)=>{if(ctx.failStore===k)return false;calls.writes.push({k,r:clone(r)});const rows=data[k]||(data[k]=[]),i=rows.findIndex(x=>x.id===r.id);if(i<0)rows.push(clone(r));else rows[i]=clone(r);return true;},
    dbRemove:(k,id)=>{calls.removes.push({k,id});data[k]=data[k].filter(x=>x.id!==id);return true;},
    getUserAssignStatus:()=>({assignable:true}),getLoaStatus:()=>null,
    h:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(Boolean)})};
  vm.createContext(ctx);new vm.Script(helpers).runInContext(ctx);return {ctx,data,calls};
}

test('배치는 이름·중복/불법 ID·기존 ID 덮기·삭제된 ID 재생성을 모두 거부하고 입력을 보존한다',()=>{
  const data=fixture(),base={id:'new',managerMain:'P1',managerSubs:[]};
  const rows=[base,{id:'bad/key',managerMain:'동명이인'}],before=JSON.stringify({data,rows});
  assert.equal(O.validateWorkBatch('cases',rows,data).ok,false);
  assert.equal(JSON.stringify({data,rows}),before);
  assert.equal(O.validateWorkBatch('cases',[base,base],data).ok,false);
  assert.equal(O.validateWorkBatch('cases',[{...base,id:' new '}],data).ok,false);
  data.cases=[base];assert.equal(O.validateWorkBatch('cases',[base],data).ok,false);
  assert.equal(O.validateWorkBatch('cases',[base],data,{allowExisting:true}).ok,true);
  data.cases=[{...base,_deleted:true}];assert.equal(O.validateWorkBatch('cases',[base],data,{allowExisting:true}).ok,false);
  assert.equal(O.validateWorkBatch('unknown',[base],data).ok,false);
  assert.equal(O.validateWorkBatch('cases',null,data).ok,false);
  assert.equal(O.validateWorkBatch('cases',[null],data).ok,false);
});

function intake(){
  const env=context(),{ctx,data,calls}=env;
  Object.assign(ctx,{types:[{code:'LAB',name:'노동사건'}],users:data.user_dir,CASE_STATUS:[{v:'pending',label:'대기'}],
    genCaseNo:()=> '사건-2026-001',refreshCases(){},
    dbUpsertMany:(k,rows)=>{if(ctx.failSave)return false;calls.writes.push({k,rows:clone(rows)});return true;}});
  ctx.setDropPreview=v=>{ctx.dropPreview=typeof v==='function'?v(ctx.dropPreview):v;};
  const start=erp.indexOf('  function caseUpsertMany(');
  new vm.Script(erp.slice(start,erp.indexOf('  function openAdd()',start))).runInContext(ctx);
  return env;
}
function row(manager='P1',subs=''){return ['', 'LAB','의뢰인',manager,subs,'기관','담당','전화','메일','2026-01-02','','100','16.3','pending','원본 비고'];}
test('실제 일괄 가져오기는 한 행 오류면 정상 행도 저장하지 않고, 저장 실패에도 미리보기를 유지한다',()=>{
  const {ctx,calls}=intake();ctx.dropPreview=[row(),row('동명이인')];const before=clone(ctx.dropPreview);
  ctx.confirmDropAdd();assert.equal(calls.writes.length,0);assert.deepEqual(ctx.dropPreview,before);
  ctx.dropPreview=[row(),row('P2')];ctx.failSave=true;ctx.confirmDropAdd();
  assert.equal(calls.writes.length,0);assert.ok(ctx.dropPreview);
  ctx.failSave=false;ctx.confirmDropAdd();assert.equal(calls.writes.length,1);assert.equal(ctx.dropPreview,null);
  const saved=calls.writes[0].rows;assert.equal(new Set(saved.map(x=>x.caseNo)).size,saved.length);
  assert.equal(saved[1].managerMain,'P2');assert.equal(saved[0].successFee,16.3);assert.equal(saved[0].entityType,'Case');
});
test('미리보기의 담당자 선택은 동명이인 SID를 구별하며 부담당 원본도 자동으로 버리지 않는다',()=>{
  const {ctx,calls}=intake();ctx.dropPreview=[row('동명이인','이름만있는부담당')];const original=ctx.dropPreview;
  const main=ctx.dropStaffSelect(0,3,'동명이인',0);
  assert.ok(main.children.some(x=>x.props.value==='P1'));assert.ok(main.children.some(x=>x.props.value==='P2'));
  main.props.onChange({target:{value:'P2'}});ctx.confirmDropAdd();assert.equal(calls.writes.length,0);
  ctx.dropStaffSelect(0,4,'이름만있는부담당',0).props.onChange({target:{value:'P1'}});
  assert.equal(original[0][3],'동명이인');assert.equal(original[0][4],'이름만있는부담당');
  ctx.confirmDropAdd();assert.equal(calls.writes[0].rows[0].managerMain,'P2');
  assert.deepEqual(calls.writes[0].rows[0].managerSubs,['P1']);
});
test('모듈 누락·퇴직 담당자·사건번호 중복·알 수 없는 유형/상태도 성공 처리하지 않는다',()=>{
  for(const mode of ['module','retired','duplicate','type','status']){
    const {ctx,calls,data}=intake();ctx.dropPreview=[row()];
    if(mode==='module')delete ctx.window.PuOntology;
    if(mode==='retired')data.user_accounts=[{sid:'P1',status:'retired'}];
    if(mode==='duplicate'){data.cases=[{id:'old',caseNo:'중복번호'}];ctx.dropPreview[0][0]='중복번호';}
    if(mode==='type')ctx.dropPreview[0][1]='없는유형';
    if(mode==='status')ctx.dropPreview[0][13]='없는상태';
    ctx.confirmDropAdd();assert.equal(calls.writes.length,0,mode);assert.ok(ctx.dropPreview,mode);
  }
});

function transfer(){
  const env=context(),{ctx}=env;
  const kinds=['consult','company','case','consulting','fund','other'];
  Object.assign(ctx,{CONTRACT_KINDS:kinds.map(v=>({v})),kindInfo:v=>({label:v}),briefTrim:v=>v||'',
    localYMD:d=>d.toISOString().slice(0,10),arvStamp:()=>({arrivedFrom:'계약'}),
    mergeCompanyContacts:(a,b)=>({added:b.length,contacts:a.concat(b)}),
    getCaseTypes:()=>[{code:'LAB',short:'노동',name:'노동사건'}],reorderConsultingNos(){},
    BIZ_CONS_SEED:[{code:'CONS',short:'컨설팅'}],BIZ_FUND_SEED:[{code:'FUND',short:'기금'}],BIZ_OTHER_SEED:[{code:'OTHER',short:'기타'}],
    CompanyRef:{findCompany(){throw new Error('이름으로 자동 연결해서는 안 됨');}}});
  /* 계약기간·부가세는 erpContractToCoFields «한 곳»에서 뽑는다(2026-09-08) —
     흉내를 세우지 않고 진짜 함수를 실어야 여기서만 맞는 일이 안 생긴다. */
  const cf=erp.indexOf('function erpContractToCoFields(ct){');
  new vm.Script(erp.slice(cf,erp.indexOf('\n}',cf)+2)).runInContext(ctx);
  const start=erp.indexOf('function transferContract(contract){');
  new vm.Script(erp.slice(start,erp.indexOf('// ============ 계약관리로 복귀',start))).runInContext(ctx);
  return env;
}
test('계약 자동 이관의 모든 업무에 실제 원본 ID를 남기고 업체는 선택한 ID에만 잇는다',()=>{
  const {ctx,calls,data}=transfer();data.companies.push({...data.companies[0],id:'B'});
  const untouched=clone(data.companies[1]);data.contracts[0].kinds=['company','case','consulting','fund','other'];
  const results=ctx.transferContract(data.contracts[0]);assert.equal(results.length,data.contracts[0].kinds.length);
  assert.deepEqual(data.companies.find(x=>x.id==='B'),untouched);
  for(const write of calls.writes){assert.equal(write.r.sourceContractId,'CT1');assert.equal(write.r.sourceKind,'contract');assert.equal(write.r.sourceId,'CT1');}
  for(const store of ['cases','consultings','funds','other_projects'])assert.equal(data[store][0].companyId,'A');
  const graph=O.audit(data);
  for(const write of calls.writes)assert.ok(graph.edges.some(e=>e.sourceStore===write.k&&e.sourceId===write.r.id&&e.predicate==='derivedFrom'&&e.object==='Contract:CT1'));
});
test('이관 중 실패해도 기존 업체는 삭제하지 않으며 빈 칸 보완 외 기존 값은 보존한다',()=>{
  const {ctx,calls,data}=transfer();ctx.failStore='cases';
  assert.equal(ctx.transferContract(data.contracts[0]).length,0);
  assert.equal(calls.removes.length,0);assert.equal(data.companies[0].id,'A');
  assert.equal(data.companies[0].monthlyAdvisoryFee,500);assert.equal(data.companies[0].createdAt,'original');
  assert.ok(data.companies[0].note.startsWith('원래메모'));assert.ok(data.contracts[0]);
});
test('새로 만든 업체의 실패 정리는 그 생성분만 대상으로 한다',()=>{
  const {ctx,calls,data}=transfer();ctx.failStore='cases';const source=data.contracts[0];
  source.companyId='';source.company.companyId='';source.companyLinkStatus='pending';source.companyName=source.company.name='신규';source.bizNo=source.company.bizNo='';
  assert.equal(ctx.transferContract(source).length,0);assert.equal(calls.removes.length,1);
  assert.notEqual(calls.removes[0].id,'A');assert.equal(data.companies.length,1);assert.equal(data.companies[0].id,'A');
});
test('이관 전 원본 ID·업체 ID·최신상태·신규 배정을 확인하여 실패하면 어떤 자료도 쓰지 않는다',()=>{
  for(const mode of ['missing','duplicate','stale','retired','company','pendingMatch']){
    const {ctx,calls,data}=transfer();let source=clone(data.contracts[0]);
    if(mode==='missing')source.id='missing';
    if(mode==='duplicate')data.contracts.push(clone(data.contracts[0]));
    if(mode==='stale')source.updatedAt=0;
    if(mode==='retired')data.user_accounts=[{sid:'P1',status:'retired'}];
    if(mode==='company')data.companies=[];
    if(mode==='pendingMatch'){data.contracts[0].companyId='';data.contracts[0].company.companyId='';data.contracts[0].companyLinkStatus='pending';source=clone(data.contracts[0]);}
    assert.equal(ctx.transferContract(source).length,0,mode);assert.equal(calls.writes.length,0,mode);assert.equal(calls.removes.length,0,mode);
  }
});

test('재이관 판단은 같은 번호의 다른 계약을 혼동하지 않으며 과거 번호만으로 완료 처리하지 않는다',()=>{
  const {ctx}=context(),contract={id:'CT1',contractNo:'같은번호'};
  assert.equal(ctx.erpTransferReferenceMatch({sourceContractId:'CT1',sourceContractNo:'옛번호'},contract),'id');
  assert.equal(ctx.erpTransferReferenceMatch({sourceKind:'contract',sourceId:'CT1'},contract),'id');
  assert.equal(ctx.erpTransferReferenceMatch({sourceContractId:'CT2',sourceContractNo:'같은번호'},contract),'');
  assert.equal(ctx.erpTransferReferenceMatch({sourceContractNo:'같은번호'},contract),'legacy');
  assert.equal(ctx.erpTransferReferenceMatch({sourceContractId:'CT2',sourceKind:'contract',sourceId:'CT1'},contract),'conflict');
  const start=erp.indexOf('  async function doTransfer(id){'),body=erp.slice(start,erp.indexOf('  // 필터 (다중 kinds',start));
  assert.ok(body.indexOf('if(_unverifiedT.length)')<body.indexOf('archiveContract('));
  assert.match(body,/erpTransferReferenceMatch\(x,ct\)/);
});

test('일부 이관 흔적이나 번호 단독 연결이 있으면 실제 재이관 함수도 계약을 완료 처리하지 않는다',async()=>{
  for(const ref of [{sourceContractId:'CT1'},{sourceContractNo:'계약-1'}]){
    const {ctx,data,calls}=transfer();Object.assign(data.companies[0],ref);
    Object.assign(ctx,{contracts:data.contracts,archiveContract(){throw new Error('부분 이관을 완료 처리하면 안 됨');},
      popConfirm:async()=>{throw new Error('미검증 완료 확인창을 열면 안 됨');}});
    const start=erp.indexOf('  async function doTransfer(id){');
    new vm.Script(erp.slice(start,erp.indexOf('  // 필터 (다중 kinds',start))).runInContext(ctx);
    await ctx.doTransfer('CT1');assert.equal(calls.writes.length,0);assert.equal(calls.removes.length,0);
    assert.ok(calls.toasts.some(x=>x.includes('완료 처리')));
  }
});
