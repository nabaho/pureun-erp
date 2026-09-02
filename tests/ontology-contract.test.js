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
  assert.match(erp, /O\.audit\(data\)/);
  assert.match(erp, /원본을 수정하거나 서버에 저장하지 않습니다/);
});

test('향후 새 프로그램도 온톨로지를 먼저 따르도록 저장소 지침에 못 박혀 있다', () => {
  assert.match(guide, /모든 새 프로그램·데이터에 필수/);
  assert.match(guide, /PuOntology\.PROGRAMS/);
  assert.match(guide, /사람 이름·업체명을 관계 열쇠로 쓰지 않는다/);
});
