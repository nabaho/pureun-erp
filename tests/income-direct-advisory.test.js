/* 「➕ 직접 등록」에 자문료 (대표 결정 2026-08-22 · 김보람 건의 2026-08-18 3번)

   건의: "자문료 입금건인데 상담료나 기타수입으로만 매칭 가능한 경우입니다."

   ★ 자문료는 「기타수입」과 이름만 다른 것이 아니라 «셈이 다르다» — 세 가지가 걸린다.
     ① 항목      : inc-advisory. 기타(inc-other)로 적으면 자문료 매출에서 통째로 빠진다.
     ② 받을 달   : advisoryYm. 7월 자문료가 8월에 들어와도 7월 매출로 쳐야 한다.
                   이 칸이 없으면 입금월로 잡혀 7월 미입금이 «영영» 안 지워진다.
     ③ 성과급    : 자문료는 대상이 아니다. calcPerfShares 가 sourceKind==='company' 면
                   빈 배열을 돌려주므로, 확정창을 거친 자문료와 같은 규칙이 되려면
                   sourceKind 를 'company' 로 넣어야 한다.

   ⚠ 미입금 대기(addAdvisoryPending)는 «회사명|받을 달» «문자열» 로 맞춘다 — id 가 아니다.
     그래서 회사명이 업체관리와 한 글자라도 다르면 자문료를 등록해도 그 달 미입금이
     그대로 남아 «같은 돈이 두 번» 보인다. 창이 그 사실을 미리 알려 줘야 한다.

   이 검사는 「몇 px·무슨 글자」를 박지 않는다. 박는 것은 위 네 가지 규칙이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');

/* 중괄호 짝을 세어 함수를 통째로 자른다 — 줄 수에 안 매인다 */
function sliceFn(src, head) {
  const at = src.indexOf(head);
  assert.ok(at > 0, head + ' 를 찾지 못했습니다');
  let i = src.indexOf('{', at), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(at, i + 1); }
  }
  throw new Error(head + ' 의 닫는 중괄호를 못 찾았습니다');
}

/* 진짜 saveDirectIncome 을 떼어 돌린다 — 흉내 낸 것으로는 「무엇이 저장되나」를 못 본다 */
function runSave(d) {
  let saved = null;
  const ctx = {
    Date, Math, String, parseInt, Object,
    todayYMD: () => '2026-08-22',
    calcDeductions: (a) => ({ perfBaseAmount: a }),
    calcPerfShares: () => [{ sid: 'P001', amount: 999 }],   // 늘 «있다»고 답하게 해 둔다
    dbUpsert: (t, o) => { if (t === 'finance_income') saved = o; return true; },
    showToast: () => {}, _sidName: (x) => x, fileType: 'bank',
    erpMarkBankRowProcessed: () => {}, removeRow: () => {},
    /* 급여가 마감된 달은 잠겨 있지 않다고 둔다 — 여기서 보는 것은 자문료 규칙이다 */
    isPayrollLocked: () => false,
    CURRENT_USER: { sid: 'P001' }, window: {},
  };
  vm.createContext(ctx);
  /* 확정은 «성과급 마감 막이» 문을 지나 저장한다 — 흉내 내지 않고 진짜 문을 함께 싣는다 */
  ['function erpNextOpenYM(', 'function erpPerfYMFor(', 'function erpUpsertIncome(']
    .forEach((head) => vm.runInContext(sliceFn(erp, head), ctx));
  vm.runInContext(sliceFn(erp, 'function saveDirectIncome(d){'), ctx);
  ctx.saveDirectIncome(Object.assign({
    row: { amount: 165000, date: '2026-08-10', memo: '최건(아우어베이커리', _k: 'k1' },
    doc: 'tax',
  }, d));
  return saved;
}

test('★ 자문료로 등록하면 자문료 «항목»으로 들어간다 — 기타수입이 아니다', () => {
  const r = runSave({ name: '아우어베이커리', kind: '자문료' });
  assert.equal(r.kind, '자문료');
  assert.equal(r.category, 'inc-advisory',
    '★ inc-other 로 적으면 자문료 매출에서 통째로 빠집니다.');
});

test('★ 받을 달을 고르면 그 달 매출로 친다 — 밀려 들어온 자문료가 사라지지 않게', () => {
  /* 7월 자문료가 8월 10일에 들어온 경우. 입금월(8월)로 잡으면 7월 미입금이 안 지워진다. */
  const r = runSave({ name: '아우어베이커리', kind: '자문료', advYm: '2026-07' });
  assert.equal(r.advisoryYm, '2026-07');
});

test('받을 달을 안 고르면 입금월로 둔다 — 비워 두면 미입금 대조가 아예 안 된다', () => {
  const r = runSave({ name: '아우어베이커리', kind: '자문료' });
  assert.equal(r.advisoryYm, '2026-08');
});

test('★ 미입금 대기가 이 기록을 «찾을 수 있는» 모양이어야 한다', () => {
  /* addAdvisoryPending 은 kind==='자문료' 인 것만 모아 «회사명|받을 달» 로 더한다.
     셋 중 하나라도 어긋나면 그 달 미입금이 그대로 남아 같은 돈이 두 번 보인다. */
  const r = runSave({ name: '아우어베이커리', kind: '자문료', advYm: '2026-07' });
  const key = r.companyName + '|' + (r.advisoryYm || String(r.date).slice(0, 7));
  assert.equal(key, '아우어베이커리|2026-07');
  assert.equal(r.kind, '자문료', '★ kind 가 「자문료」가 아니면 합계에서 아예 안 셉니다.');

  /* ⚠ 첫 등장은 «다른 곳을 가리키는 주석» 이다 — 실제 함수 자리를 집어야 한다.
     (그냥 indexOf 로 잡았다가 엉뚱한 데를 재고 있었다) */
  const at = erp.indexOf('(function addAdvisoryPending(){');
  assert.ok(at > 0, 'addAdvisoryPending 함수를 찾지 못했습니다');
  const blk = erp.slice(at, at + 1200);
  assert.match(blk, /kind === '자문료'/, '모으는 조건이 바뀌었으면 이 검사도 함께 봐야 합니다.');
  assert.match(blk, /advisoryYm \|\| String\(i\.date\)\.slice\(0, ?7\)/,
    '★ 받을 달을 안 보면 밀려 들어온 자문료가 엉뚱한 달에 잡힙니다.');
});

test('★ 자문료에는 성과급이 안 붙는다 — 확정창을 거친 자문료와 같은 규칙', () => {
  /* calcPerfShares 스텁이 «늘 있다»고 답하는데도 비어야 한다 — 우리가 막는지 보는 것이다. */
  const r = runSave({ name: '아우어베이커리', kind: '자문료', perfOn: true, mainSid: 'P001' });
  /* ⚠ 배열이 vm 안에서 만들어져 prototype 이 다르다 — deepEqual 은 그것 때문에 걸린다.
     여기서 볼 것은 «비었는가» 이지 어느 realm 의 배열인가가 아니다. */
  assert.equal(r.perfShares.length, 0, '★ 자문료에 성과급이 붙으면 확정창 것과 금액이 갈립니다.');
  assert.equal(r.perfExclude, true);
  assert.equal(r.managerSid, '', '자문료는 담당자를 안 붙입니다(확정창과 같게).');
  assert.equal(r.sourceKind, 'company',
    "★ sourceKind 가 'company' 여야 calcPerfShares 가 스스로도 빈 배열을 냅니다.");
});

test('상담료·기타수입은 예전 그대로다 — 이번 변경이 옛 길을 건드리지 않았다', () => {
  const r = runSave({ name: '홍길동', kind: '상담료', perfOn: true, mainSid: 'P001' });
  assert.equal(r.category, 'inc-other');
  assert.equal(r.sourceKind, 'other');
  assert.equal(r.advisoryYm, undefined, '자문료가 아니면 받을 달을 안 적습니다.');
  assert.ok(r.perfShares.length >= 1, '★ 상담료의 성과급까지 꺼 버리면 안 됩니다.');
  assert.equal(r.managerSid, 'P001');
});

/* ── 창 ── */
test('종류에 자문료가 있다', () => {
  assert.match(erp, /seg\(dirPop\.kind,'자문료','자문료'/,
    '★ 「➕ 직접 등록」에서 자문료를 고를 수 없으면 이 건의는 안 풀린 것입니다.');
});

test('★ 업체관리에 없는 이름이면 창이 미리 알려 준다', () => {
  /* 미입금 대조가 «회사명 문자열» 이라, 이름이 다르면 등록해도 미입금이 안 지워진다.
     등록한 «뒤에» 알면 이미 두 번 잡힌 뒤다 — 그래서 창에서, 그리고 확인 글에서 알린다. */
  assert.match(erp, /erpCoIndexByName\(dbGet\('companies'/,
    '★ 업체관리에서 같은 이름을 찾아보지 않으면 알려 줄 수가 없습니다.');
  assert.match(erp, /업체관리에 없는 이름입니다/);
  const at = erp.indexOf('await popConfirm((dirPop.name');
  assert.ok(at > 0, '등록 확인 글을 찾지 못했습니다.');
  const blk = erp.slice(at, at + 1200);
  assert.match(blk, /받을 달/, '★ 확인 글에 받을 달이 없으면 엉뚱한 달로 넣고도 모릅니다.');
  assert.match(blk, /미입금/, '★ 미입금이 지워지는지도 확인 글에 있어야 합니다.');
});

test('★ 자문료를 고르면 성과급 칸이 사라진다 — 화면과 결과가 어긋나지 않게', () => {
  /* 칸을 남겨 두면 「⭐ 성과급 자동 반영」을 켠 채 등록하고도 결과는 0 이 되어
     화면이 거짓말을 한다. */
  assert.match(erp, /!_isAdv && h\('div',\{style:_fldS\},[\s\S]{0,120}'담당자 '/,
    '★ 자문료일 때 담당자 칸이 그대로 남아 있습니다.');
  assert.match(erp, /!_isAdv && h\('label',[\s\S]{0,400}성과급 자동 반영/,
    '★ 자문료일 때 성과급 켜기가 그대로 남아 있습니다.');
  assert.match(erp, /자문료는 성과급 대상이 아닙니다/,
    '칸을 감췄으면 «왜 없는지»는 적어 두어야 합니다.');
});
