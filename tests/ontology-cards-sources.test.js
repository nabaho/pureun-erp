'use strict';
/* 통합 온톨로지가 «기업 상세»와 «근로자 정보함»을 본다 (대표 지시 2026-09-02)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 빠져 있었나
     온톨로지가 기업정보함에서 읽는 자리는 pucards/idx **하나**였다.
     정작 값이 모여 있는 곳은 pucards/coInfo(4,158곳 — 업태·상시근로자수·매출액·
     은행계좌·세금계산서 발급처)인데 통합 진단 목록에 없었고,
     2026-09-01 에 만든 pucards/workerInfo 는 **등록조차 안 돼 있었다**(0건).

   ■ ★ 신뢰도 1.0 이 나오는 자리
     2단계 문서: 업체명이 유일하게 맞을 때 0.85, companyId 가 맞으면 1.0.
     기업정보함은 2026-09-02 부터 사람이 «확정한» 이알피 업체 열쇠를 erpCoId 에 적는다.
     그것을 companyId 로 넘기면 1.0 이 나온다 — 확정 관계만 저장하는 3단계로 넘어갈 수 있다.

   ■ 여기서 못 박는 것
     ① 두 자리가 읽는 목록에 있다
     ② 확정한 회사는 신뢰도 **1.0**, 확정 안 한 회사는 이름으로 0.85
     ③ ⚠⚠ 민감 본문은 안 읽는다 — 사진 원본·판독 글자·pairs·주민번호
     ④ 근로자 정보함의 사람은 «기업정보함 안의» 사람이다 — 직원 명부와 안 섞인다
     ⑤ 서류는 그 사람·그 회사에 붙는다(attachedTo)
     ⑥ 원본에 아무것도 안 쓴다

   실행: node --test tests/ontology-cards-sources.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../js/pu-ontology.js');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'js', 'pu-ontology.js'), 'utf8');

/* 이알피 원장 표본 — 업체 둘 */
const DATA = {
  companies: [
    { id: 'co-1', name: '(주)대명크라샤', bizNo: '312-81-49225' },
    { id: 'co-2', name: '한서정공', bizNo: '111-11-11111' }
  ],
  user_dir: [{ sid: 'p001', name: '권형하' }]
};

/* 기업 상세 표본 — 하나는 «확정», 하나는 이름만 */
const COINFO = {
  '3128149225': {
    company: '(주)대명크라샤',
    erpCoId: 'co-1',                       /* 사람이 확정한 열쇠 */
    bizType: '제조', workers: '42',
    docs: { '2026_-Oa': { kind: 'bizreg', docName: '사업자등록증', at: 100 } }
  },
  'n한서정공': {
    company: '한서정공',                   /* 확정 안 함 — 이름으로만 */
    docs: { '2026_-Ob': { kind: 'form', docName: '기술보호지원반 신청서', at: 200 } }
  }
};

/* 근로자 정보함 표본 — 담기는 칸은 다섯뿐이다 */
const WORKERS = {
  '대명크라샤__김수': {
    name: '김수', company: '(주) 대명크라샤',
    docs: { '2026_-Oc': { kind: 'idcard', docName: '주민등록증', period: '', at: 300,
                          photo: { year: '2026', id: '-Oc', owner: 'u1' } } }
  }
};

/* ⚠ sourceResults 는 «열쇠 표»다 — {읽는자리열쇠: {ok, value}}.
     배열로 주면 조용히 아무것도 안 읽고 통과한다(그래서 여기 꼴을 못 박는다). */
function audit(over) {
  return O.auditIntegrated(DATA, Object.assign({
    cards_coinfo: { ok: true, value: COINFO },
    cards_workers: { ok: true, value: WORKERS }
  }, over || {}), { uid: 'user-1' });
}

/* ══════════ ① 읽는 목록에 있다 ══════════ */

test('★★ 기업 상세와 근로자 정보함이 «읽는 목록»에 있다', () => {
  const plan = O.getReadPlan({ uid: 'user-1' });
  const paths = plan.map(x => x.path);
  assert.ok(paths.indexOf('pucards/coInfo') >= 0,
    '★★ 기업 상세(4,158곳)를 통합 화면이 못 봅니다: ' + paths.join(' '));
  assert.ok(paths.indexOf('pucards/workerInfo') >= 0,
    '★★ 근로자 정보함이 통합 화면에 등록되지 않았습니다');
  assert.ok(paths.indexOf('pucards/idx') >= 0, '예전 색인이 사라졌습니다');
});

test('★ 두 자리 모두 기업정보함 것으로 적혀 있다 — 소유는 그쪽이다', () => {
  const plan = O.getReadPlan({ uid: 'user-1' });
  ['pucards/coInfo', 'pucards/workerInfo'].forEach(function (p) {
    const a = plan.filter(x => x.path === p)[0];
    assert.ok(a, p + ' 를 못 찾았습니다');
    assert.equal(a.program, 'cards', p + ' 의 임자가 기업정보함이 아닙니다');
  });
});

/* ══════════ ② ★ 확정한 회사는 신뢰도 1.0 ══════════ */

test('★★★ 사람이 «확정한» 회사는 신뢰도 1.0 으로 이어진다 — 3단계로 넘어가는 자리', () => {
  const r = audit();
  const one = r.edges.filter(e => e.predicate === 'forOrganization'
    && e.object === 'Organization:co-1' && e.confidence === 1);
  assert.ok(one.length > 0,
    '★★★ 확정한 열쇠(erpCoId)가 1.0 을 못 만듭니다 — 확정 관계만 저장하는 3단계로 못 넘어갑니다\n'
    + '  나온 관계: ' + JSON.stringify(r.edges.filter(e => e.predicate === 'forOrganization')
        .map(e => e.object + '@' + e.confidence)));
});

test('★★ 확정 안 한 회사는 이름으로 0.85 — 예전 그대로다', () => {
  const r = audit();
  const two = r.edges.filter(e => e.predicate === 'forOrganization'
    && e.object === 'Organization:co-2');
  assert.ok(two.length > 0, '이름으로 잇던 길이 끊겼습니다');
  assert.ok(two.every(e => e.confidence === 0.85),
    '★★ 확정하지 않았는데 1.0 이 나옵니다 — 그러면 확정의 뜻이 없습니다: '
    + JSON.stringify(two.map(e => e.confidence)));
});

test('★ 확정 열쇠를 companyId 로 넘긴다 — addForOrganization 이 그것을 본다', () => {
  assert.match(SRC, /companyId:clean\(r\.erpCoId\)/,
    '★ erpCoId 를 companyId 로 넘기지 않으면 1.0 이 영영 안 나옵니다');
});

/* ══════════ ③ ⚠⚠ 민감 본문은 안 읽는다 ══════════ */

test('★★★ 읽는 경로에 사진 원본·판독 글자·급여 금액·메일 본문이 «없다»', () => {
  const plan = O.getReadPlan({ uid: 'user-1' });
  const paths = plan.map(x => x.path).join(' ');
  /* ⚠ 금지 목록은 계약검사(ontology-contract)와 «같아야» 한다 — 두 벌이면 한쪽만 고쳐진다.
     puphotos/u/{uid}/items 는 사진 «메타»라 허락된 자리다(본문은 blobs·thumbs·texts). */
  assert.doesNotMatch(paths, /blobs|thumbs|texts|submissions|secret|payroll\/emp|values|mailbox/,
    '★★★ 민감 본문 경로를 읽습니다: ' + paths);
});

test('★★★ 기업 상세에서 pairs(문서의 모든 칸)를 개체로 만들지 않는다', () => {
  /* pairs 에는 계좌·주민번호가 딸려 올 수 있다. 관계를 찾는다는 이유로 그것을
     한 화면에 모으지 않는다(2단계 문서의 원칙). */
  const r = audit({ cards_coinfo: { ok: true, value: { '3128149225': {
    company: '가나', erpCoId: 'co-1',
    docs: { d1: { kind: 'bizreg', docName: '등록증',
      pairs: [{ k: '주민등록번호', v: '900101-1234567' }] } } } } } });
  const flat = JSON.stringify(r);
  assert.ok(flat.indexOf('900101') < 0, '★★★ 주민번호가 통합 진단에 실렸습니다');
  assert.ok(flat.indexOf('주민등록번호') < 0, '★★★ pairs 칸 이름이 실렸습니다');
});

test('★★ 근로자 정보함에는 주민번호·주소가 «애초에 없다» — 있어도 안 싣는다', () => {
  const r = audit({ cards_workers: { ok: true, value: { 'k1': {
    name: '김수', company: '가나', rrn: '900101-1234567', address: '충남 천안시',
    docs: { d1: { kind: 'idcard', docName: '주민등록증' } } } } } });
  const flat = JSON.stringify(r);
  assert.ok(flat.indexOf('900101') < 0, '★★ 주민번호가 실렸습니다: ' + flat.slice(0, 300));
  assert.ok(flat.indexOf('충남') < 0, '★★ 주소가 실렸습니다');
});

/* ══════════ ④⑤ 사람·서류 ══════════ */

test('★★ 근로자 정보함의 사람은 «기업정보함 안의» 사람이다 — 직원 명부와 안 섞인다', () => {
  const r = audit();
  const id = O.sourceCanonicalId('Person', 'cards', '대명크라샤__김수');
  assert.ok(r.entities[id], '사람을 안 만들었습니다: ' + Object.keys(r.entities).join(' '));
  /* 직원 명부의 사람은 Person:사번 이다 — 이름으로 그것과 합쳐지면 안 된다 */
  assert.ok(!r.entities['Person:%EA%B9%80%EC%88%98'],
    '★★ 이름을 프로그램 사이 열쇠로 썼습니다 — 지침이 금한 것입니다');
  assert.notEqual(id, 'Person:p001');
});

test('★ 서류가 그 사람에게 붙는다(attachedTo)', () => {
  const r = audit();
  const who = O.sourceCanonicalId('Person', 'cards', '대명크라샤__김수');
  const doc = O.sourceCanonicalId('Document', 'cards', '대명크라샤__김수/2026_-Oc');
  assert.ok(r.entities[doc], '서류를 안 만들었습니다');
  assert.ok(r.edges.some(e => e.subject === doc && e.predicate === 'attachedTo' && e.object === who),
    '★ 서류가 사람에게 안 붙었습니다');
});

test('★ 기업 상세 서류가 그 회사에 붙는다', () => {
  const r = audit();
  const co = O.sourceCanonicalId('Organization', 'cards', 'coinfo:3128149225');
  const doc = O.sourceCanonicalId('Document', 'cards', '3128149225/2026_-Oa');
  assert.ok(r.entities[co] && r.entities[doc]);
  assert.ok(r.edges.some(e => e.subject === doc && e.predicate === 'attachedTo' && e.object === co),
    '★ 서류가 회사에 안 붙었습니다');
});

test('서류가 없는 회사도 개체로 남는다 — 있는 것을 안 지운다', () => {
  const r = audit({ cards_coinfo: { ok: true, value: { 'k1': { company: '서류 없는 곳' } } } });
  assert.ok(r.entities[O.sourceCanonicalId('Organization', 'cards', 'coinfo:k1')]);
});

/* ══════════ ⑥ 원본에 안 쓴다 ══════════ */

test('★★★ 통합 진단이 원본을 «한 글자도» 바꾸지 않는다', () => {
  const before = JSON.stringify(DATA) + JSON.stringify(COINFO) + JSON.stringify(WORKERS);
  const r = audit();
  assert.equal(JSON.stringify(DATA) + JSON.stringify(COINFO) + JSON.stringify(WORKERS), before,
    '★★★ 읽기 전용 진단이 원본을 바꿨습니다');
  assert.equal(r.readOnly, true);
});

test('★ 2단계 문서에도 두 자리가 적혀 있다 — 코드와 문서가 어긋나면 안 된다', () => {
  const doc = fs.readFileSync(path.join(R, 'docs', '푸른통합온톨로지-2단계.md'), 'utf8');
  assert.match(doc, /pucards\/coInfo/, '★ 문서에 기업 상세가 없습니다');
  assert.match(doc, /pucards\/workerInfo/, '★ 문서에 근로자 정보함이 없습니다');
});
