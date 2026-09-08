/* 푸른통합 온톨로지 저장 관문 — 계속 개발하면서도 옛 자료를 깨뜨리지 않는 계약.
 *
 * 기존 프로그램은 먼저 observe(기록만)로 붙이고, 새 프로그램은 별도 선언이 없으면
 * enforce(잘못된 저장 거부)다. 화면별 임의 검사가 아니라 Firebase 쓰기 문 자체를 감싼다.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const O = require('../js/pu-ontology.js');
const W = require('../js/pu-ontology-write.js');
const Inventory = require('../scripts/ontology-write-inventory.js');

const root = path.join(__dirname, '..');

test('새 레코드는 영구 ID·종류·판·시각·수정차수를 한 곳에서 붙인다', () => {
  const prepared = W.prepareRecord({ id:'case-1', companyId:'co-1' }, {
    entityType:'Case', now:1000, actor:'sid-1'
  });
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.value, {
    id:'case-1', companyId:'co-1', entityType:'Case', schemaVersion:O.VERSION,
    contractVersion:W.CONTRACT_VERSION, createdAt:1000, updatedAt:1000,
    createdBy:'sid-1', updatedBy:'sid-1', revision:1
  });
});

test('수정은 생성정보를 보존하고 수정차수를 올리며 옛 한 판도 읽는다', () => {
  const previous = { id:'case-1', entityType:'Case', schemaVersion:O.VERSION-1,
    contractVersion:W.CONTRACT_VERSION, createdAt:10, createdBy:'sid-0', updatedAt:20, revision:4 };
  const prepared = W.prepareRecord({ id:'case-1', companyId:'co-2' }, {
    entityType:'Case', previous, expectedRevision:4, now:30, actor:'sid-1'
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.value.createdAt, 10);
  assert.equal(prepared.value.createdBy, 'sid-0');
  assert.equal(prepared.value.updatedAt, 30);
  assert.equal(prepared.value.updatedBy, 'sid-1');
  assert.equal(prepared.value.revision, 5);
  assert.equal(prepared.value.schemaVersion, O.VERSION);
});

test('오래된 화면·이름 열쇠·반쪽 원본 참조·금지 ID는 강제 모드에서 거부한다', () => {
  const base = { entityType:'Case', schemaVersion:O.VERSION,
    contractVersion:W.CONTRACT_VERSION, createdAt:1, updatedAt:1, revision:1 };
  for (const value of [
    { ...base, id:'bad/id' },
    { ...base, id:'x', schemaVersion:O.VERSION-2 },
    { ...base, id:'x', companyName:'이름뿐인 업체' },
    { ...base, id:'x', sourceKind:'contract' },
    { ...base, id:'x', sourceId:'ct-1' }
  ]) {
    assert.equal(W.inspectWrite({ kind:'set', path:'data/cases/'+value.id, value, mode:'enforce' }).ok, false);
  }
});

test('관찰 모드는 옛 저장을 막지 않되 위반을 숨기지 않는다', () => {
  const seen = W.inspectWrite({ kind:'set', path:'data/cases/c1', value:{id:'c1'}, mode:'observe' });
  assert.equal(seen.ok, true);
  assert.equal(seen.valid, false);
  assert.ok(seen.issues.some(x => x.code === 'entity_type_missing'));
});

test('수정차수가 어긋나면 저장하지 않고, 삭제는 복구 가능한 표식으로 만든다', () => {
  const previous = { id:'case-1', entityType:'Case', schemaVersion:O.VERSION,
    contractVersion:W.CONTRACT_VERSION, createdAt:1, updatedAt:2, revision:7 };
  const stale = W.prepareRecord({id:'case-1'}, {
    entityType:'Case', previous, expectedRevision:6, now:3, actor:'sid-1'
  });
  assert.equal(stale.ok, false);
  assert.ok(stale.issues.some(x => x.code === 'revision_conflict'));

  const gone = W.tombstone(previous, { expectedRevision:7, now:4, actor:'sid-1' });
  assert.equal(gone.ok, true);
  assert.equal(gone.value._deleted, true);
  assert.equal(gone.value.deletedAt, 4);
  assert.equal(gone.value.deletedBy, 'sid-1');
  assert.equal(gone.value.revision, 8);
});

test('기존 자료 이관은 원본을 바꾸지 않고 자동 보완분과 사람 확인분을 가른다', () => {
  const rows=[{id:'c1',companyId:'co1'},{name:'ID 없는 자료'}];
  const before=JSON.stringify(rows);
  const plan=W.planMigration(rows,{entityType:'Case',now:10,actor:'sid-1'});
  assert.equal(plan.readOnly,true);
  assert.deepEqual(plan.counts,{ready:1,blocked:1});
  assert.equal(plan.ready[0].value.entityType,'Case');
  assert.equal(JSON.stringify(rows),before);
});

test('트랜잭션 저장은 서버의 최신 수정차수를 다시 비교한다', async () => {
  let current = { id:'case-1', entityType:'Case', schemaVersion:O.VERSION,
    contractVersion:W.CONTRACT_VERSION, createdAt:1, updatedAt:2, revision:2 };
  const ref = { transaction(fn){ const next=fn(current); if(next === undefined) return Promise.resolve({committed:false}); current=next; return Promise.resolve({committed:true,snapshot:{val:()=>current}}); } };
  const gateway = W.createGateway({mode:'enforce', actor:'sid-1', now:()=>5});
  const ok = await gateway.save(ref, {id:'case-1', companyId:'co-1'}, {entityType:'Case', expectedRevision:2});
  assert.equal(ok.committed, true);
  assert.equal(current.revision, 3);
  await assert.rejects(() => gateway.save(ref, {id:'case-1'}, {entityType:'Case', expectedRevision:2}), /다른 사용자가/);
});

function fakeFirebase(){
  const calls=[];
  function ref(path){
    return {
      child(p){return ref((path?path+'/':'')+p);},
      set(v){calls.push({kind:'set',path,value:v});return Promise.resolve();},
      update(v){calls.push({kind:'update',path,value:v});return Promise.resolve();},
      remove(){calls.push({kind:'remove',path});return Promise.resolve();},
      push(v){const r=ref((path?path+'/':'')+'new-key');if(arguments.length)r.set(v);return r;},
      transaction(fn){calls.push({kind:'transaction',path});return Promise.resolve({committed:true,snapshot:{val:()=>fn(null)}});}
    };
  }
  const db={ref};
  const database=function(){return db;};
  database.ServerValue={TIMESTAMP:{'.sv':'timestamp'}};
  return {firebase:{database},calls};
}

test('Firebase 직접 쓰기도 관문이 가로채며 기존 앱 관찰·새 앱 차단을 구별한다', async () => {
  W.clearIssues();
  const old=fakeFirebase();
  assert.equal(W.installFirebaseCompat(old.firebase,{mode:'observe',program:'erp',reporter:()=>{}}),true);
  await old.firebase.database().ref('data').child('cases').child('c1').set({id:'c1'});
  await old.firebase.database().ref('data/cases').update({c2:{id:'c2'},gone:null});
  await old.firebase.database().ref('data/cases').push().set({id:'c3'});
  assert.equal(old.calls.length,3);
  assert.ok(W.getIssues().some(x=>x.path==='data/cases/c1'&&x.code==='entity_type_missing'));
  assert.ok(W.getIssues().some(x=>x.path==='data/cases/c2'&&x.code==='entity_type_missing'));
  assert.ok(W.getIssues().some(x=>x.path==='data/cases/gone'&&x.code==='physical_delete'));
  assert.ok(W.getIssues().some(x=>x.path==='data/cases/{push}'&&x.code==='entity_type_missing'));
  assert.deepEqual(old.firebase.database.ServerValue.TIMESTAMP,{'.sv':'timestamp'});

  const fresh=fakeFirebase();
  W.clearIssues();
  W.installFirebaseCompat(fresh.firebase,{mode:'enforce',program:'new-app',reporter:()=>{}});
  await assert.rejects(()=>fresh.firebase.database().ref('new').child('x').set({id:'x'}),/개체 종류/);
  await assert.rejects(()=>fresh.firebase.database().ref('new/x').update({title:'우회'}),/부분 update/);
  await assert.rejects(()=>fresh.firebase.database().ref('new/x').transaction(()=>({id:'x'})),/공용 저장 관문/);
  assert.equal(fresh.calls.length,0);
  const good=W.prepareRecord({id:'x'},{entityType:'Task',now:1}).value;
  await fresh.firebase.database().ref('new/x').set(good);
  assert.equal(fresh.calls.length,1);
});

test('강제 모드의 공용 gateway는 감싼 Firebase ref에서도 원본 트랜잭션으로 안전하게 저장한다', async () => {
  const fresh=fakeFirebase();
  W.installFirebaseCompat(fresh.firebase,{mode:'enforce',program:'new-app',reporter:()=>{}});
  const ref=fresh.firebase.database().ref('new/x');
  const gateway=W.createGateway({mode:'enforce',actor:'sid-1',now:()=>10});
  const result=await gateway.save(ref,{id:'x'},{entityType:'Task'});
  assert.equal(result.committed,true);
  assert.equal(fresh.calls.filter(x=>x.kind==='transaction').length,1);
});

test('모든 등록 프로그램 화면이 Firebase 저장문 앞에서 공용 관문을 싣는다', () => {
  const files = [...new Set(Object.values(O.PROGRAMS).map(p => p.file.split('?')[0]))];
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const ontologyAt = src.search(/js\/pu-ontology\.js\?v=\d+/);
    const gateAt = src.search(/js\/pu-ontology-write\.js\?v=\d+[^>]*data-mode="observe"/);
    const initAt = src.search(/firebase\.initializeApp\s*\(/);
    assert.ok(ontologyAt >= 0, file+': 공통 온톨로지를 싣지 않습니다');
    assert.ok(gateAt > ontologyAt, file+': 저장 관문은 온톨로지 뒤에 있어야 합니다');
    assert.ok(initAt < 0 || gateAt < initAt, file+': Firebase를 연 뒤에 관문을 붙였습니다');
  }
});

test('Firebase를 여는 딸린 화면도 소유 프로그램의 관찰 관문을 빠짐없이 싣는다', () => {
  Object.values(O.SATELLITES).forEach(s => {
    const src = fs.readFileSync(path.join(root, s.file), 'utf8');
    if (!/firebase-database-compat\.js|firebase\.database\s*\(/.test(src)) return;
    const ontologyAt=src.search(/js\/pu-ontology\.js\?v=\d+/);
    const gateAt=src.search(/js\/pu-ontology-write\.js\?v=\d+[^>]*data-mode="observe"/);
    const initAt=src.search(/firebase\.initializeApp\s*\(/);
    assert.ok(ontologyAt>=0,s.file+': 공통 온톨로지 없음');
    assert.ok(gateAt>ontologyAt,s.file+': 저장 관문 순서 오류');
    assert.ok(initAt<0||gateAt<initAt,s.file+': Firebase 초기화 뒤에 관문을 붙임');
  });
  const inv=Inventory.inventory();
  assert.equal(inv.counts.gatedDatabaseSatellites,inv.counts.databaseSatellites);
});

test('전수조사기는 모든 프로그램·소유뿌리·서버 쓰기 흔적을 매번 계산한다', () => {
  const inv=Inventory.inventory();
  assert.equal(inv.counts.programs,Object.keys(O.PROGRAMS).length);
  assert.equal(inv.counts.gated,inv.counts.programs);
  assert.ok(inv.server.length>0);
  inv.programs.forEach(p=>{
    assert.ok(p.primaryRoots.length,p.key+': 소유 저장뿌리 없음');
    assert.notEqual(p.mode,'missing',p.key+': 관문 없음');
  });
});

test('ERP 검증센터에서 현재 세션의 저장 위반과 관찰 상태를 숨기지 않는다', () => {
  const erp=fs.readFileSync(path.join(root,'pu-erp.html'),'utf8');
  assert.match(erp,/PuOntologyWrite/);
  assert.match(erp,/getIssues\(\)/);
  assert.match(erp,/저장 관문 · 기존 프로그램 관찰 모드/);
  assert.match(erp,/새 프로그램은 기본으로 차단/);
});

test('새 프로그램은 관찰 선언이 없으면 기본으로 강제 모드다', () => {
  assert.equal(W.resolveMode(), 'enforce');
  assert.equal(W.resolveMode('observe'), 'observe');
  assert.equal(W.resolveMode('enforce'), 'enforce');
  assert.equal(W.runtimeMode('erp','observe'),'observe');
  assert.equal(W.runtimeMode('future-app','observe'),'enforce');
  Object.keys(W.LEGACY_OBSERVE_PROGRAMS).forEach(key=>assert.ok(O.PROGRAMS[key],key+': 없는 프로그램이 유예 목록에 남았습니다'));
  assert.equal(W.auditProgramContracts(O.PROGRAMS).ok,true);
  const future={...O.PROGRAMS,future:{name:'새 앱',file:'future.html',primaryRoots:['future'],entityTypes:['Task']}};
  assert.deepEqual(W.auditProgramContracts(future).missing,['future']);
  future.future.writeContracts=[{path:'future/items/{id}',entityType:'Task'}];
  assert.equal(W.auditProgramContracts(future).ok,true);
});

test('서버 규칙도 관계망 개체·관계의 필수 모양과 불변 판을 검사한다', () => {
  const out = execFileSync('node', [path.join(root, 'scripts/make-firebase-rules.js')], {encoding:'utf8'});
  const rules = JSON.parse(out).rules.ontology.v1;
  const gen = rules.gen.$gen;
  assert.match(gen.meta['.validate'], /schemaVersion/);
  for (const part of ['internal','source','personal','financial']) {
    assert.equal(gen[part].entities.$id['.write'].includes('!data.exists()'), true);
    assert.match(gen[part].entities.$id['.validate'], /entityType|type/);
    assert.match(gen[part].edges.$id['.validate'], /predicate/);
    assert.equal(gen[part].$other['.validate'], false);
  }
});
