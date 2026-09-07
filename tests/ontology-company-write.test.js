/* 6-1단계: 업체 이름은 검색 후보일 뿐, 쓰기 대상은 명시적 ID 한 건이다. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const O=require('../js/pu-ontology.js');
const erp=fs.readFileSync(path.join(__dirname,'..','pu-erp.html'),'utf8');
const masters=[{id:'A',name:'동명이업체',bizNo:'111-22-33333'},{id:'B',name:'동명이업체',bizNo:'222-33-44444'}];

test('이름이 같아도 업체를 자동 선택하지 않는다 — 보류는 명시적으로 선택해야 한다',()=>{
  const form={companyName:'동명이업체'};
  assert.equal(O.companyLinkCandidates(form,masters,'').length,2);
  assert.equal(O.validateCompanyLink(form,masters).ok,false);
  assert.equal(form.companyId,undefined);
  const pending=O.validateCompanyLink({...form,companyLinkStatus:'pending'},masters);
  assert.equal(pending.ok,true);
  assert.equal(pending.status,'pending');
  assert.equal(pending.companyId,'');
});

test('사업자번호가 유일하게 일치할 때만 업체를 자동 연결한다',()=>{
  const exact=O.companyLinkAutoMatch({company:{name:'입력한 표기',bizNo:'1112233333'}},masters);
  assert.equal(exact.ok,true);
  assert.equal(exact.companyId,'A');
  assert.equal(exact.companyName,'동명이업체');

  assert.equal(O.companyLinkAutoMatch({companyName:'동명이업체'},masters).ok,false);
  assert.equal(O.companyLinkAutoMatch({bizNo:'111-22-33333'},[masters[0],{...masters[0],id:'C'}]).code,'duplicate_business_number');
  assert.equal(O.companyLinkAutoMatch({bizNo:'111-22-33333'},[{...masters[0],_deleted:true}]).code,'business_number_not_found');
});

test('실제 업체 ID·사업자번호만 통과하며 틀린 ID·충돌·삭제·중복은 차단한다',()=>{
  const form={companyId:'A',company:{name:'동명이업체',bizNo:'1112233333',companyId:'A'}};
  const before=JSON.stringify({form,masters});
  assert.equal(O.validateCompanyLink(form,masters).status,'linked');
  assert.equal(O.validateCompanyLink({...form,companyId:'B'},masters).code,'conflicting_company_ids');
  assert.equal(O.validateCompanyLink({companyId:'C'},masters).code,'orphan_company');
  assert.equal(O.validateCompanyLink(form,[{...masters[0],_deleted:true}]).ok,false);
  assert.equal(O.validateCompanyLink(form,[masters[0],masters[0]]).code,'duplicate_company_id');
  assert.equal(O.validateCompanyLink({...form,company:{name:'동명이업체',bizNo:'2223344444'}},masters).code,'company_business_mismatch');
  assert.equal(O.validateCompanyLink({companyId:'A',companyName:'다른기업'},masters).code,'company_name_mismatch');
  assert.equal(O.validateCompanyLink(form,null).code,'companies_unavailable');
  assert.equal(O.validateCompanyLink({...form,companyLinkStatus:'pending'},masters).ok,false);
  assert.equal(JSON.stringify({form,masters}),before);
});

test('근로자 단독 의뢰는 무관한 업체를 강제 연결하지 않는다',()=>{
  assert.equal(O.validateCompanyLink({clientType:'worker'},masters).status,'not_required');
  assert.equal(O.validateCompanyLink({clientType:'worker',companyId:'missing'},masters).ok,false);
});

const panel=erp.slice(erp.indexOf('function ContractModal(props){'),erp.indexOf('function ContractHelpModal(props){'));
const saveStart=panel.indexOf('  async function save(){');
const modalSave=panel.slice(saveStart,panel.indexOf('// ====== 렌더 ======',saveStart));
const wrapper=erp.slice(erp.indexOf('function erpCheckWorkReferences(store,form){'),erp.indexOf('function ContractModal(props){'));

async function runSave(options={}){
  const companies=JSON.parse(JSON.stringify(masters));
  const form={id:'CT1',companyId:'B',company:{companyId:'B',name:'동명이업체',bizNo:'',contacts:[]},companyName:'동명이업체',
    kinds:['consult'],amounts:{consult:0},managerMain:'P1',managerSubs:[],mgrHistory:[],isCMS:true,srcPhoto:{id:'photo1',owner:'owner1',year:'2026'}};
  if(options.pending){form.companyId='';form.company.companyId='';form.companyLinkStatus='pending';}
  if(options.invalid)form.companyId='A';
  const calls={contract:0,writes:[],draft:0,photos:0,shares:0};
  const ctx={f:form,init:form,manualNo:'',CURRENT_USER:{name:'담당자'},
    props:{cur:form,onSave:async()=>{calls.contract++;if(options.reject)throw new Error('저장 실패');if(options.afterSave)options.afterSave(companies);return options.accepted!==false;}},
    window:{PuOntology:O,PuPhotoStore:{markUsed(){calls.photos++;return Promise.resolve();}}},
    erpGuardEdit:async()=>true,showToast(){},setTab(){},
    dbGet:(key,seed)=>key==='companies'?companies:key==='user_dir'?[{sid:'P1',status:'active'}]:key==='contracts'?[form]:seed,
    dbSet:(key,value)=>{calls.writes.push({key,value:JSON.parse(JSON.stringify(value))});return true;},
    localStorage:{removeItem(){calls.draft++;}},savedRef:{value:false},DRAFT_KEY:'test-draft',
    mergeCompanyContacts:()=>({added:0,skipped:0,contacts:[]}),erpSharePhotoWithMgrs(){calls.shares++;},
    BIZ_CONS_SEED:[],BIZ_FUND_SEED:[],BIZ_OTHER_SEED:[],BIZ_CASE_SEED:[],COMPANY_TYPE_SEED:[],
    console:{error(){}},setTimeout(){},Date,Object
  };
  ctx.PuPhotoStore=ctx.window.PuPhotoStore;
  vm.createContext(ctx);new vm.Script(wrapper+modalSave).runInContext(ctx);await ctx.save();
  return {calls,form,ctx};
}

test('계약 저장 성공 뒤에도 동명이 업체 중 선택한 ID 한 건에만 쓴다',async()=>{
  const {calls}=await runSave();
  assert.equal(calls.contract,1);
  assert.equal(calls.writes.length,1);
  const updated=calls.writes[0].value;
  assert.deepEqual(updated.find(x=>x.id==='A'),masters[0]);
  assert.equal(updated.find(x=>x.id==='B').isCMS,true);
  assert.equal(calls.draft,1);
  assert.equal(calls.photos,1);
});

test('계약 저장 취소·예외면 업체 쓰기·draft 삭제·사진 공유가 모두 없다',async()=>{
  for(const option of [{accepted:false},{reject:true},{invalid:true}]){
    const {calls,ctx}=await runSave(option);
    assert.equal(calls.writes.length,0);
    assert.equal(calls.draft,0);
    assert.equal(calls.photos,0);
    assert.equal(calls.shares,0);
    assert.equal(ctx.savedRef.value,false);
  }
});

test('연결 보류 저장 및 저장 도중 삭제된 업체에는 업체정보를 동기화하지 않는다',async()=>{
  for(const option of [{pending:true},{afterSave:cos=>{cos.find(x=>x.id==='B')._deleted=true;}}]){
    const {calls}=await runSave(option);
    assert.equal(calls.contract,1);
    assert.equal(calls.writes.length,0);
  }
});

test('과거 계약·사건의 자체 ID를 업체 ID로 가져오지 않는다',()=>{
  const code=panel.slice(panel.indexOf('  function _pastCoRecord(r){'),panel.indexOf('  var ERP_CO_FILL_KEYS'));
  const ctx={dbGet:key=>key==='contracts'?[{id:'ct-not-company',companyName:'과거기업',company:{name:'과거기업'}}]:[]};
  vm.createContext(ctx);new vm.Script(code).runInContext(ctx);
  assert.equal(ctx._coFieldsOf({label:'과거기업'}).companyId,'');
});

test('서버 쓰기 공통층은 바꾸지 않고 계약 저장 직전 같은 검증을 다시 쓴다',()=>{
  const at=erp.indexOf('  function persistOne(item){'),end=erp.indexOf('  function patchOne(',at);
  const body=erp.slice(at,end);
  assert.ok(body.indexOf('erpValidateContractCompany(item)')<body.indexOf("dbUpsert('contracts', item)"));
  assert.match(panel,/업체 연결 확인/);
  assert.match(panel,/업체 자동 확인/);
  assert.match(panel,/companyLinkManualOpen/);
  assert.match(panel,/deferCompanyLink/);
  assert.doesNotMatch(modalSave,/CompanyRef\.findCompany/);
});

test('회사명·사업자번호를 바꾸면 과거 ID와 보류 선택을 풀되 원본은 건드리지 않는다',()=>{
  const code=panel.slice(panel.indexOf('  function setCompanyField(k){'),panel.indexOf('  // 담당자 헬퍼'));
  const original={companyId:'A',companyLinkStatus:'linked',company:{companyId:'A',name:'기존기업',bizNo:'1112233333'}};
  let draft=original;
  const ctx={setF:fn=>{draft=fn(draft);}};
  vm.createContext(ctx);new vm.Script(code).runInContext(ctx);
  ctx.setCompanyField('name')({target:{type:'text',value:'새기업'}});
  assert.equal(draft.companyId,'');
  assert.equal(draft.company.companyId,'');
  assert.equal(draft.companyLinkStatus,'');
  assert.equal(original.companyId,'A');
});

test('사업자번호 입력을 마치면 유일한 업체 ID를 자동으로 넣고 이름은 덮지 않는다',()=>{
  const code=panel.slice(panel.indexOf('  function autoLinkCompanyByBiz(raw,notify){'),panel.indexOf('  /* 직접 입력뿐 아니라 기업정보함·OCR'))
    +panel.slice(panel.indexOf('  function onBizNoBlur(e){'),panel.indexOf('  // ========== 기업정보 =========='));
  let draft={companyId:'',companyLinkStatus:'',company:{companyId:'',name:'주식회사 메가터치',bizNo:'1112233333'}};
  const notices=[];
  const ctx={window:{PuOntology:O},props:{cur:null},f:draft,
    fmtBizNo:v=>v.slice(0,3)+'-'+v.slice(3,5)+'-'+v.slice(5),
    dbGet:(key,seed)=>key==='companies'?masters:seed,
    setF:fn=>{draft=fn(draft);ctx.f=draft;},setCompanyLinkManualOpen(){},
    searchPastCompanies:()=>[],setPastInitialQuery(){},showToast:m=>notices.push(m)};
  vm.createContext(ctx);new vm.Script(code).runInContext(ctx);
  ctx.onBizNoBlur({target:{value:'1112233333'}});
  assert.equal(draft.companyId,'A');
  assert.equal(draft.company.companyId,'A');
  assert.equal(draft.company.name,'주식회사 메가터치');
  assert.match(notices.join('\n'),/자동 연결/);
});

test('기업정보함·OCR이 사업자번호를 채워도 자동 연결 효과가 호출된다',()=>{
  const effect=panel.slice(panel.indexOf('  /* 직접 입력뿐 아니라 기업정보함·OCR'),panel.indexOf('  /* ★ 2026-09-07 대표 제보'));
  assert.match(effect,/useEffect/);
  assert.match(effect,/autoLinkCompanyByBiz\(biz,false\)/);
  assert.match(effect,/companyLinkStatus==='pending'/);
});

test('검증 모듈이 없으면 계약 저장을 허용하지 않는다',()=>{
  const ctx={window:{},showToast(){},dbGet(){throw new Error('모듈이 없으면 자료에도 접근하지 않음');}};
  vm.createContext(ctx);new vm.Script(wrapper).runInContext(ctx);
  assert.equal(ctx.erpValidateContractCompany({companyId:'A'}),null);
});
