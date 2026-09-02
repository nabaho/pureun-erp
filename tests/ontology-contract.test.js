/* 푸른통합 온톨로지 계약. 새 프로그램·용어가 공통 사전을 건너뛰지 못하게 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../js/pu-ontology.js');

const root = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');

function portalApps(){
  const at = portal.indexOf('var APPS = [');
  const end = portal.indexOf('];', at);
  assert.ok(at > 0 && end > at, '포털 APPS 목록을 찾지 못했습니다');
  return [...portal.slice(at, end).matchAll(/key:'([^']+)'/g)].map(m => m[1]);
}

test('포털의 모든 프로그램이 온톨로지 등록부에 있다', () => {
  const keys = portalApps();
  const result = O.auditPrograms(keys);
  assert.equal(result.ok, true, '미등록 프로그램: ' + result.missing.join(', '));
  assert.equal(result.registered, keys.length, '포털과 등록부 수가 다릅니다');
});

test('모든 프로그램에 파일·소유 저장뿌리·개체 종류가 있다', () => {
  Object.entries(O.PROGRAMS).forEach(([key, p]) => {
    assert.ok(p.name && p.file, key + ': 이름 또는 파일 없음');
    assert.ok(Array.isArray(p.primaryRoots) && p.primaryRoots.length, key + ': 소유 저장뿌리 없음');
    assert.ok(Array.isArray(p.entityTypes) && p.entityTypes.length, key + ': 개체 종류 없음');
    p.entityTypes.forEach(t => assert.ok(O.TERMS.entityTypes[t], key + ': 미등록 개체어 ' + t));
  });
});

test('관계어의 시작·도착 개체가 사전에 등록돼 있다', () => {
  Object.entries(O.TERMS.predicates).forEach(([name, pair]) => {
    assert.equal(pair.length, 2, name + ': 관계 정의는 시작·도착 두 칸이어야 합니다');
    pair.join('|').split('|').forEach(t => assert.ok(O.TERMS.entityTypes[t], name + ': 미등록 개체어 ' + t));
  });
});

test('진단은 끊어진 업체·담당자·원본을 찾고 확실한 관계 후보를 만든다', () => {
  const data = {
    companies:[{id:'co1',name:'가나다산업',bizNo:'123-45-67890'}],
    user_accounts:[{id:'u1',sid:'P-001',name:'담당자'}],
    contracts:[
      {id:'ct1',companyId:'co1',companyName:'가나다산업',managerMain:'P-001'},
      {id:'ct2',companyId:'missing',companyName:'없는업체',managerMain:'P-999'},
      {id:'ct3',companyName:'가나다산업'}
    ],
    finance_income:[{id:'fi1',sourceKind:'case',sourceId:'missing-case',amount:1000}]
  };
  const before = JSON.stringify(data);
  const r = O.audit(data);
  const codes = new Set(r.issues.map(x => x.code));
  assert.ok(codes.has('orphan_company'));
  assert.ok(codes.has('orphan_person'));
  assert.ok(codes.has('orphan_source'));
  assert.ok(codes.has('missing_company_id'));
  assert.ok(r.edges.some(e => e.predicate === 'contractedWith'));
  assert.ok(r.edges.some(e => e.predicate === 'assignedTo'));
  assert.equal(JSON.stringify(data), before, '읽기 전용 진단이 원본을 바꿨습니다');
  assert.equal(r.readOnly, true);
});

test('온톨로지 모듈에는 서버·원본 쓰기 명령이 없다', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'pu-ontology.js'), 'utf8');
  assert.doesNotMatch(src, /\bdbSet\s*\(|\.remove\s*\(|\.update\s*\(|\.set\s*\(/);
});

test('푸른ERP에서 공통 사전과 읽기 전용 진단 화면을 실제로 사용한다', () => {
  assert.match(erp, /js\/pu-ontology\.js\?v=\d+/);
  assert.match(erp, /function OntologyAuditPanel\(/);
  assert.match(erp, /O\.auditIntegrated\(data,sources/);
  assert.match(erp, /O\.buildSnapshot\(report\)/);
  assert.match(erp, /확정 관계망 파일/);
  assert.match(erp, /원본을 수정하거나 서버에 저장하지 않습니다/);
});

test('향후 새 프로그램도 온톨로지를 먼저 따르도록 저장소 지침에 못 박혀 있다', () => {
  assert.match(guide, /모든 새 프로그램·데이터에 필수/);
  assert.match(guide, /PuOntology\.PROGRAMS/);
  assert.match(guide, /사람 이름·업체명을 관계 열쇠로 쓰지 않는다/);
});

test('2단계 읽기 계획은 모든 프로그램을 다루되 민감 본문 경로를 읽지 않는다', () => {
  const covered = new Set(Object.values(O.READ_ADAPTERS).map(a => a.program));
  Object.keys(O.PROGRAMS).forEach(key => assert.ok(covered.has(key), key + ': 읽기 어댑터 없음'));
  const plan = O.getReadPlan({ uid:'user-1' });
  assert.ok(plan.some(x => x.path === 'work_erp/items'));
  assert.ok(plan.some(x => x.path === 'puphotos/u/user-1/items'));
  assert.ok(plan.some(x => x.path === 'paydata/u/user-1/items'));
  const paths = plan.map(x => x.path).join('\n');
  assert.doesNotMatch(paths, /(?:blobs|thumbs|texts|submissions|secret|payroll\/emp|values|mailbox)/);
});

test('통합 진단은 프로그램별 개체와 관계를 만들고 원본을 바꾸지 않는다', () => {
  const local = {
    companies:[{id:'co1',name:'가나다산업'}],
    user_accounts:[{id:'u1',sid:'P-001',name:'담당자'}]
  };
  const sources = {
    work_items:{ok:true,value:{W1:{title:'자문 업무',co_id:'co1',mgr_main:{sid:'P-001'}}}},
    career_counts:{ok:true,value:{total:3}},
    cards_index:{ok:true,value:{C1:{k:'card',n:'홍길동',c:'가나다산업'}}},
    photos_items:{ok:true,value:{2026:{PH1:{filename:'현장.jpg',companyId:'co1'}}}},
    payroll_index:{ok:true,value:{가나다산업:[{id:'PAY1','월':'2026-08'}]}},
    paydata_items:{ok:true,value:{202608:{D1:{filename:'급여대장.xlsx',companyId:'co1'}}}},
    home_members:{ok:true,value:{M1:{name:'구성원'}}},
    home_pages:{ok:true,value:{about:{label:'소개'}}}
  };
  const before = JSON.stringify({local,sources});
  const r = O.auditIntegrated(local, sources, {uid:'user-1'});
  const workId = O.sourceCanonicalId('Task','work','W1');
  assert.ok(r.entities[workId]);
  assert.ok(r.entities[O.sourceCanonicalId('MediaAsset','photos','PH1')]);
  assert.ok(r.entities[O.sourceCanonicalId('PayrollRecord','payroll','PAY1')]);
  assert.ok(r.entities[O.sourceCanonicalId('Document','paydata','D1')]);
  assert.ok(r.edges.some(e => e.subject === workId && e.predicate === 'assignedTo'));
  assert.ok(r.edges.some(e => e.subject === workId && e.predicate === 'forOrganization'));
  assert.equal(r.coverage.work.state, 'ready');
  assert.equal(r.coverage.mail.state, 'in_app');
  assert.equal(JSON.stringify({local,sources}), before);
  assert.equal(r.readOnly, true);
});

test('읽지 못한 프로그램은 삭제나 추정 대신 확인 필요로 남긴다', () => {
  const r = O.auditIntegrated({}, {
    work_items:{ok:false,error:'PERMISSION_DENIED'},
    home_members:{ok:true,value:{}},
    home_pages:{ok:false,error:'PERMISSION_DENIED'}
  }, {});
  assert.equal(r.coverage.work.state, 'denied');
  assert.equal(r.coverage.home.state, 'partial');
  assert.ok(r.issues.some(x => x.code === 'source_unreadable' && x.store === 'work_items'));
});

test('3단계 관계망은 확정 관계만 권한별로 나누고 이름·본문을 싣지 않는다', () => {
  const data = {
    companies:[{id:'co.1',name:'가나다산업'}],
    user_accounts:[{id:'account-1',sid:'P-001',name:'담당자'}],
    contracts:[{id:'CT1',companyId:'co.1',companyName:'가나다산업',managerMain:'P-001'}]
  };
  const sources = {
    work_items:{ok:true,value:{W1:{title:'민감한 업무명',co_id:'co.1',mgr_main:{sid:'P-001'}}}},
    payroll_index:{ok:true,value:{가나다산업:[{id:'PAY1','월':'2026-08'}]}}
  };
  const report = O.auditIntegrated(data, sources, {}), before = JSON.stringify(report);
  const snap = O.buildSnapshot(report, {generatedAt:'2026-09-02T00:00:00.000Z'});
  const checked = O.validateSnapshot(snap);
  assert.equal(checked.ok, true, checked.errors.join(', '));
  assert.equal(snap.meta.schema, 'ontology/v1');
  assert.equal(snap.meta.sourceMutation, 'never');
  assert.ok(snap.meta.confirmedEdges > 0);
  assert.ok(snap.meta.excludedCandidates > 0, '업체명 추정 관계는 관계망에서 제외해야 합니다');
  assert.ok(snap.partitions.personal.entities[O.canonicalId('Person','P-001')]);
  assert.ok(snap.partitions.financial.entities[O.sourceCanonicalId('PayrollRecord','payroll','PAY1')]);
  assert.doesNotMatch(JSON.stringify(snap), /가나다산업|민감한 업무명|담당자/);
  assert.equal(JSON.stringify(report), before, '관계망 생성이 진단 결과를 바꿨습니다');
});

test('관계망 검증은 Firebase 금지 열쇠와 민감 필드를 거부한다', () => {
  const bad = {meta:{schema:'ontology/v1',sourceMutation:'never'},partitions:{
    internal:{entities:{'Task:bad.key':{label:'비밀'}},edges:{}},source:{entities:{},edges:{}},personal:{entities:{},edges:{}},financial:{entities:{},edges:{}}
  }};
  const r = O.validateSnapshot(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(x => x.startsWith('firebaseKey:')));
  assert.ok(r.errors.some(x => x.startsWith('sensitiveField:')));
});
