'use strict';
// 값 층 — 원본과 값을 두 층으로 나눈다(설계서 3장). 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStore() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-paydata-store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}

const PARSED = {
  company: '화담원', period: '2026-08', docName: '급여대장',
  rows: [
    { name: '홍길동', pairs: [{ item: '기본급', value: '3,200,000' }, { item: '실수령', value: '2,950,000' }] },
    { name: '김철수', pairs: [{ item: '기본급', value: '2,800,000' }] }
  ]
};

test('★ 사진 한 장에 근로자가 여럿이면 값도 여러 줄이 나온다 — 한 장=한 줄이 아니다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, '홍길동');
  assert.equal(rows[1].name, '김철수');
});

test('★ 값 한 줄마다 출처(원본 번호)가 반드시 붙는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  rows.forEach(r => assert.equal(r.sourceId, 'a1'));
});

test('★ 항목·값은 문서에 적힌 이름 그대로 담는다 — 바꿔 적지 않는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  assert.equal(rows[0].pairs[0].item, '기본급');
  assert.equal(rows[0].pairs[0].value, '3,200,000');
});

test('출처·사업장·귀속월이 없으면 값을 만들지 않고 알린다', () => {
  const S = loadStore();
  assert.throws(() => S.buildValueRows(PARSED, { companyId: 'co_1', month: '2026-08' }), /출처/);
  assert.throws(() => S.buildValueRows(PARSED, { sourceId: 'a1', month: '2026-08' }), /사업장/);
  assert.throws(() => S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1' }), /귀속월/);
});

test('근로계약서 같은 keep 성 자료는 slot 을 직접 줄 수 있다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', slot: 'keep', at: 1 });
  assert.equal(rows[0].month, 'keep');
});

test('사람이 없으면 빈 목록을 준다 — 터지지 않는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows({ rows: [] }, { sourceId: 'a1', companyId: 'co_1', month: '2026-08' });
  assert.equal(rows.length, 0);
  const rows2 = S.buildValueRows(null, { sourceId: 'a1', companyId: 'co_1', month: '2026-08' });
  assert.equal(rows2.length, 0);
});

test('새 값 줄마다 번호가 겹치지 않는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  assert.notEqual(rows[0].id, rows[1].id);
});

/* ══════ 같은 자료 중복 ══════
   값 줄 하나 = 「근로자 × 원본 서류」 하나다. 중복은 **같은 서류를 다시 읽은
   것**뿐이다 — 사람만 같고 서류가 다르면 새 줄이지 중복이 아니다. */

test('★ 같은 사업장·월·근로자·같은 서류 값이 있으면 그 자리 번호를 알려준다', () => {
  const S = loadStore();
  const existing = { r1: { companyId: 'co_1', month: '202608', name: '홍길동', sourceId: 'a1' } };
  assert.equal(S.findDuplicateValue(existing, 'co_1', '202608', '홍길동', 'a1'), 'r1');
});

test('업체·월·이름 중 하나라도 다르면 중복이 아니다', () => {
  const S = loadStore();
  const existing = { r1: { companyId: 'co_1', month: '202608', name: '홍길동', sourceId: 'a1' } };
  assert.equal(S.findDuplicateValue(existing, 'co_2', '202608', '홍길동', 'a1'), null);
  assert.equal(S.findDuplicateValue(existing, 'co_1', '202609', '홍길동', 'a1'), null);
  assert.equal(S.findDuplicateValue(existing, 'co_1', '202608', '김철수', 'a1'), null);
});

/* 같은 근로자라도 서류가 다르면 덮을 자리가 아니다 — 덮으면 근태표에서 나온
   유급일수가 수당변경 카톡 저장 한 번에 통째로 사라진다. */
test('★ 사람은 같아도 서류가 다르면 중복이 아니다 — 앞 서류 값을 덮으면 안 된다', () => {
  const S = loadStore();
  const existing = { r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '근태표a' } };
  assert.equal(S.findDuplicateValue(existing, 'co_1', '202608', '배영승', '카톡b'), null,
    '다른 서류를 「이미 있다」로 잡으면 앞 서류 값이 통째로 지워집니다');
});

/* 옛 자료에 이름만 같은 줄이 여럿 남아 있어도, 훑는 차례가 흔들리면 어느 줄을
   덮을지가 새로고침마다 달라진다. 열쇠 이름 오름차순으로 못 박는다. */
test('★ 맞는 줄을 고르는 차례가 흔들리지 않는다', () => {
  const S = loadStore();
  const existing = {
    zz: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a9' },
    aa: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a9' }
  };
  assert.equal(S.findDuplicateValue(existing, 'co_1', '202608', '배영승', 'a9'), 'aa');
});

test('아무것도 없으면 중복이 없다', () => {
  const S = loadStore();
  assert.equal(S.findDuplicateValue({}, 'co_1', '202608', '홍길동', 'a1'), null);
  assert.equal(S.findDuplicateValue(null, 'co_1', '202608', '홍길동', 'a1'), null);
});

/* ══════ 다른 서류와 항목 겹침 ══════ */

test('★ 같은 사람·같은 항목이 다른 서류에도 있으면 알려준다', () => {
  const S = loadStore();
  const existing = { r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '근태표a',
    pairs: [{ item: '유급일수', value: '22일' }, { item: '기본급', value: '100' }] } };
  const laps = S.findValueOverlaps(existing,
    { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '대장b',
      pairs: [{ item: '기본급', value: '200' }] });
  assert.equal(laps.length, 1);
  assert.equal(laps[0].name, '배영승');
  assert.equal(laps[0].item, '기본급');
  assert.equal(laps[0].sourceId, '근태표a', '어느 서류와 겹쳤는지까지 알려야 합니다');
});

test('겹치는 항목이 없으면 알릴 것도 없다 — 근태표+수당카톡이 보통이다', () => {
  const S = loadStore();
  const existing = { r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '근태표a',
    pairs: [{ item: '유급일수', value: '22일' }] } };
  const laps = S.findValueOverlaps(existing,
    { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '카톡b',
      pairs: [{ item: '식대', value: '200,000' }] });
  assert.equal(laps.length, 0);
});

test('같은 서류는 겹침이 아니라 다시 읽기다 — 알리지 않는다', () => {
  const S = loadStore();
  const existing = { r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a1',
    pairs: [{ item: '기본급', value: '100' }] } };
  const laps = S.findValueOverlaps(existing,
    { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a1',
      pairs: [{ item: '기본급', value: '200' }] });
  assert.equal(laps.length, 0);
});

test('겹침 찾기는 빈 자료에도 터지지 않는다', () => {
  const S = loadStore();
  assert.equal(S.findValueOverlaps(null, { name: '배영승', pairs: [] }).length, 0);
  assert.equal(S.findValueOverlaps({}, null).length, 0);
});

/* ══════ 실제로 쓰는 층 ══════ */

test('★ 값 줄들을 한 묶음으로 쓴다', () => {
  const S = loadStore();
  let written = null;
  S.init({ db: { ref: () => ({ update: (u) => { written = u; return Promise.resolve(); } }) } });
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  return S.saveValues('202608', rows).then(n => {
    assert.equal(n, 2);
    assert.ok(written[S.valuePath('202608', rows[0].id)]);
    assert.ok(written[S.valuePath('202608', rows[1].id)]);
  });
});

test('값 목록을 읽는다', () => {
  const S = loadStore();
  S.init({ db: { ref: (p) => ({ once: () => Promise.resolve({ val: () => ({ r1: {} }) }) }) } });
  return S.listValues('202608').then(v => assert.equal(Object.keys(v).length, 1));
});

/* ══════ 확인 표시는 부르는 쪽이 정한다 (2026-08-15) ══════
   예전에는 buildValueRows 가 confirmed 를 false 로 못 박았다. 그러면 사람이
   원본과 견주어 고치고 저장한 값까지 값 표에서 영영 노랗게 뜬다 — 설계서 3장 ②가
   막으라고 한 상태다. 한 달만 지나면 노랑을 「원래 그런 것」으로 읽게 되고,
   그때 정말 확인 안 된 값이 그대로 바깥 급여프로그램에 들어간다. */

test('★ 사람이 확인해 저장한 값은 확인 표시가 붙는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED,
    { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1, confirmed: true });
  rows.forEach(r => assert.equal(r.confirmed, true,
    '저장을 누른 것이 곧 사람의 확인입니다 — 안 붙이면 노란 표시가 영영 안 걷힙니다'));
});

test('★ 사람이 받아들이지 않은 값은 여전히 확인 안 됨으로 남는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  rows.forEach(r => assert.equal(r.confirmed, false,
    '기계가 만들기만 한 값까지 확인된 것으로 두면 표시 자체가 뜻이 없어집니다'));
});

/* ══════ 저장 경계에서 iffy 가 사라지면 안 된다 (2026-08-15) ══════
   판독기(js/pu-doc-read.js)는 흐려서 못 읽은 줄에 note 「일부 판독 불확실」을
   달고, rowsFromRead 가 그것을 값 줄의 iffy 로 옮겨 판독 패널까지 노랗게 살려
   보낸다(위 isIffyNote 머리말). 그런데 saveVals 는 통째로 confirmed:true 인
   tag 하나만 buildValueRows 에 건넨다 — 스무 줄 중 AI가 못 읽었다고 한 한 줄만
   골라 false 로 남기는 것은 여기, buildValueRows 안에서만 할 수 있다.
   여기서 p.iffy 를 안 보면, 사람이 그 줄을 보지도 않았는데 「저장」 한 번으로
   확인됨이 되어 노란 칠이 걷힌다 — 값 표도 「확인 안 된 값 0개」로 읽혀,
   AI가 스스로 못 읽었다고 한 그 숫자가 그대로 더존에 들어간다. */

test('★ AI가 못 읽었다고 한 줄(iffy)은 저장 확인을 받아도 확인됨이 되지 않는다', () => {
  const S = loadStore();
  const parsed = { rows: [
    { name: '이옥자', pairs: [{ item: '유급일수', value: '5일' }], iffy: true }
  ] };
  const rows = S.buildValueRows(parsed,
    { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1, confirmed: true });
  assert.equal(rows[0].confirmed, false,
    'tag.confirmed 가 true 여도 이 줄은 AI 스스로 못 읽었다고 한 줄입니다 — ' +
    '사람이 보지도 않았는데 확인됨이 되면 노란 칠이 걷혀 다시 못 찾습니다');
});

test('iffy 가 아닌 줄(사람이 고쳤거나 AI가 확신한 줄)은 같은 저장으로 확인됨이 된다', () => {
  const S = loadStore();
  const parsed = { rows: [
    { name: '홍길동', pairs: [{ item: '기본급', value: '3,200,000' }], iffy: false },
    { name: '김철수', pairs: [{ item: '기본급', value: '2,800,000' }] }   // iffy 자체가 없는 줄도 같다
  ] };
  const rows = S.buildValueRows(parsed,
    { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1, confirmed: true });
  rows.forEach(r => assert.equal(r.confirmed, true,
    '같은 저장인데 iffy 만 다르다고 이 줄까지 확인 안 됨으로 남으면, ' +
    '스무 명 중 확실한 열아홉 줄까지 매달 다시 들여다봐야 합니다'));
});

test('줄 하나만 따로 확인 처리하는 길은 두지 않는다 — 부르는 곳이 없었다', () => {
  const S = loadStore();
  assert.equal(S.confirmValue, undefined,
    '아무도 안 부르는 함수가 남아 있으면 다음 사람이 「확인 처리는 이미 된다」고 믿습니다');
});

test('실시간DB가 없으면 알리고 거절한다', () => {
  const S = loadStore();
  return S.saveValues('202608', []).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /실시간DB/)
  );
});
