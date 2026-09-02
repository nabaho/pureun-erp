'use strict';
/* 🔢 번호 없는 회사 채우기 (대표 승인 2026-09-02, 목업 안 ㉮ 「가」)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 문제였나
     기업정보함은 푸른이알피에서 대표자·전화·주소·업태·종목·팩스·이메일 **일곱 칸**을
     가져오는데 **사업자번호는 안 가져왔다.** 업체관리에 번호가 적혀 있어도 기업 상세는
     「번호 없음」이라 했다 — 우리가 이미 아는 번호다.

   ■ ⚠⚠ 여기서 가장 센 규칙
     **사람이 🔗 확정한 회사만** 자동으로 채운다. 번호는 법으로 하나뿐인 열쇠라
     틀리면 계약서·신고서에 그대로 나간다. 회사를 «상호로» 맞춘 곳은 틀릴 수 있다 —
     2026-08-30 점검에서 표본 열셋 중 여덟이 어긋나 있었다.

   ■ 그 밖에 못 박는 것
     ① 이미 번호가 있으면 안 건드린다(등록증·명함이 먼저다)
     ② 이알피에도 번호가 없으면 아무 일도 안 한다
     ③ 값이 어디서 왔는지 적는다(「푸른이알피」)
     ④ 번호를 **저장하지 않는다** — 볼 때 가져온다
     ⑤ 도구줄은 「번호 없음」만 볼 때만 뜬다
     ⑥ **한꺼번에 다 채우는 단추가 없다** — 상호 맞추기는 어긋난 적이 있다
     ⑦ 이름이 겹치는 업체는 「확인」이 아니라 「고르기」다

   실행: node --test tests/cards-co-nobiz-fill.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

function load(over) {
  const ctx = {
    console, Object, Array, String, Number, Boolean, Math, Date, JSON, RegExp,
    esc: v => String(v == null ? '' : v),
    digits: v => String(v || '').replace(/\D/g, ''),
    fmtBizno: v => String(v || ''),
    coDisplayName: o => (o && o.name) || '',
    state: { coOnlyNoBiz: true },
    toast: () => {},
    coFilteredList: () => ctx._list || [],
    ErpMatch: { ready: true, companies: [],
      _norm: s => String(s || '').toLowerCase().replace(/[\s()]|㈜|\(주\)|주식회사/g, ''),
      _digits: s => String(s || '').replace(/[^0-9]/g, '') }
  };
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  vm.runInContext([
    cutFn(SRC, 'function coErpPinOf('),
    cutFn(SRC, 'function coBiznoFromErp('),
    cutFn(SRC, 'function coNoBizSplit('),
    cutFn(SRC, 'function coNoBizBarHtml('),
    cutFn(SRC, 'function coNoBizNameDup(')
  ].join('\n'), ctx);
  return ctx;
}

/* 회사 하나 — 이알피 기록(erp)과 확정 열쇠(extra.erpCoId) */
const CO = (o) => Object.assign({ key: 'k1', name: '가나', bizno: '', erp: null, extra: {} }, o);
const ERP = (o) => Object.assign({ id: 'co-1', company: '가나', bizNo: '' }, o);

/* ══════════ ⚠⚠ 확정한 회사만 자동 ══════════ */

test('★★★ 확정한 회사는 이알피 번호를 «가져온다»', () => {
  const c = load();
  const o = CO({ erp: ERP({ bizNo: '312-81-49225' }), extra: { erpCoId: 'co-1' } });
  const hit = c.coBiznoFromErp(o);
  assert.ok(hit, '가져올 번호를 못 찾았습니다');
  assert.equal(hit.no, '3128149225');
  assert.equal(hit.pinned, true, '★★★ 확정한 회사가 «확인 대기»로 떨어집니다');
});

test('★★★ 상호로 맞춘 회사는 «사람이 볼 것»으로 남는다 — 자동으로 안 채운다', () => {
  const c = load();
  const o = CO({ erp: ERP({ bizNo: '312-81-49225' }), extra: {} });
  const hit = c.coBiznoFromErp(o);
  assert.ok(hit, '후보에서 빠졌습니다 — 사람이 볼 기회조차 없어집니다');
  assert.equal(hit.pinned, false,
    '★★★ 상호로 맞춘 회사를 자동으로 채웁니다 — 표본 열셋 중 여덟이 어긋났던 그 길입니다');
});

test('★★ 딴 업체로 확정해 두었으면 «자동이 아니다»', () => {
  /* 확정은 co-9 인데 지금 붙은 것은 co-1 — 그 번호를 자동으로 넣으면 안 된다 */
  const c = load();
  const o = CO({ erp: ERP({ id: 'co-1', bizNo: '312-81-49225' }), extra: { erpCoId: 'co-9' } });
  assert.equal(c.coBiznoFromErp(o).pinned, false);
});

test('★★ 이알피 기록에 열쇠(id)가 없으면 자동이 아니다 — 무엇으로 확정했는지 모른다', () => {
  const c = load();
  const o = CO({ erp: ERP({ id: '', bizNo: '312-81-49225' }), extra: { erpCoId: '' } });
  assert.equal(c.coBiznoFromErp(o).pinned, false);
});

/* ══════════ ①② 안 건드리는 자리 ══════════ */

test('★★ 이미 번호가 있으면 «안 건드린다» — 등록증·명함이 먼저다', () => {
  const c = load();
  const o = CO({ bizno: '111-11-11111', erp: ERP({ bizNo: '312-81-49225' }), extra: { erpCoId: 'co-1' } });
  assert.equal(c.coBiznoFromErp(o), null,
    '★★ 등록증에서 읽은 번호를 이알피 번호가 덮습니다');
});

test('★ 이알피에도 번호가 없으면 아무 일도 안 한다', () => {
  const c = load();
  assert.equal(c.coBiznoFromErp(CO({ erp: ERP({ bizNo: '' }), extra: { erpCoId: 'co-1' } })), null);
  assert.equal(c.coBiznoFromErp(CO({ erp: null })), null);
});

test('★ 번호가 열 자리가 안 되면 안 가져온다 — 반쪽 번호는 번호가 아니다', () => {
  const c = load();
  assert.equal(c.coBiznoFromErp(CO({ erp: ERP({ bizNo: '312-81' }), extra: { erpCoId: 'co-1' } })), null);
});

/* ══════════ 세 갈라짐 ══════════ */

test('★★ 확정·확인대기·이알피에도없음 셋으로 갈린다', () => {
  const c = load();
  const s = c.coNoBizSplit([
    CO({ key: 'a', erp: ERP({ id: 'co-1', bizNo: '111-11-11111' }), extra: { erpCoId: 'co-1' } }),
    CO({ key: 'b', erp: ERP({ id: 'co-2', bizNo: '222-22-22222' }), extra: {} }),
    CO({ key: 'c', erp: ERP({ id: 'co-3', bizNo: '' }), extra: {} }),
    CO({ key: 'd', erp: null }),
    CO({ key: 'e', bizno: '333-33-33333' })            /* 이미 있는 곳은 아예 안 센다 */
  ]);
  assert.deepEqual(Array.from(s.pinned.map(o => o.key)), ['a']);
  assert.deepEqual(Array.from(s.ask.map(o => o.key)), ['b']);
  assert.deepEqual(Array.from(s.none.map(o => o.key)), ['c', 'd']);
});

/* ══════════ ③④ 출처·저장 ══════════ */

test('★★ 값이 «어디서 왔는지» 적는다 — 일곱 칸과 같은 방식', () => {
  const build = cutFn(SRC, 'function coListBuild(');
  assert.match(build, /fromErp\('bizno', digits\(m\.bizNo\|\|''\)\)/,
    '★★ 일곱 칸을 가져오는 그 자리(fromErp)에서 안 가져옵니다 — 출처가 안 적힙니다');
  /* fromErp 가 srcOf 를 적는다 — 그 규칙이 살아 있는지 함께 본다 */
  assert.match(build, /o\.srcOf\[f\] = '푸른이알피'/, '★ 출처를 적는 규칙이 사라졌습니다');
});

test('★★★ 확정하지 않은 회사에는 번호를 안 넣는다 (조립 자리)', () => {
  const build = cutFn(SRC, 'function coListBuild(');
  assert.match(build, /if\(o\.erpCoId && String\(o\.erpCoId\) === String\(m\.id\|\|''\)\) fromErp\('bizno'/,
    '★★★ 확정 여부를 안 보고 번호를 넣습니다 — 상호로 맞춘 곳의 틀린 번호가 계약서로 갑니다');
});

test('★★★ 번호를 «저장하지 않는다» — 업체관리에서 고치면 옛 번호가 눌러앉는다', () => {
  ['coBiznoFromErp', 'coNoBizSplit', 'coNoBizBarHtml', 'coNoBizNameDup'].forEach(function (fn) {
    const src = cutFn(SRC, 'function ' + fn + '(');
    assert.doesNotMatch(src, /\.update\(|\.set\(|\.remove\(/,
      '★★★ ' + fn + ' 이 서버에 씁니다 — 번호는 볼 때 가져오는 값입니다');
  });
});

test('★★★ 푸른이알피 원장에는 «한 글자도» 안 쓴다', () => {
  const ask = cutFn(SRC, 'function renderCoNoBizAsk(');
  const bar = cutFn(SRC, 'function coNoBizBarHtml(');
  [ask, bar].forEach(function (s) {
    assert.doesNotMatch(s, /data\/companies|data\/cases|data\/contracts/,
      '★★★ 이알피 원장을 건드립니다 — 번호의 임자는 업체관리입니다');
  });
});

/* ══════════ ⑤⑥⑦ 도구줄·물음 창 ══════════ */

test('★ 도구줄은 「번호 없음」만 볼 때만 뜬다 — 늘 뜨면 한 줄을 늘 먹는다', () => {
  const c = load();
  c._list = [CO({ erp: ERP({ bizNo: '111-11-11111' }), extra: {} })];
  assert.notEqual(c.coNoBizBarHtml(), '', '그 갈래에서는 떠야 합니다');
  c.state.coOnlyNoBiz = false;
  assert.equal(c.coNoBizBarHtml(), '', '★ 다른 화면에서도 뜹니다');
});

test('★ 채울 것이 하나도 없으면 도구줄도 안 뜬다', () => {
  const c = load();
  c._list = [CO({ bizno: '111-11-11111' })];
  assert.equal(c.coNoBizBarHtml(), '');
});

test('★★ 확인할 것이 없으면 «없다고 말한다» — 빈 단추를 두지 않는다', () => {
  const c = load();
  c._list = [CO({ erp: null })];
  const h = c.coNoBizBarHtml();
  assert.match(h, /확인할 것이 없습니다/);
  assert.doesNotMatch(h, /openCoNoBizAsk/, '★ 눌러도 아무 일이 없는 단추가 있습니다');
});

test('★★★ 「한꺼번에 다 채우기」 단추가 «없다» — 상호 맞추기는 어긋난 적이 있다', () => {
  const bar = cutFn(SRC, 'function coNoBizBarHtml(');
  const ask = cutFn(SRC, 'function renderCoNoBizAsk(');
  [bar, ask].forEach(function (s) {
    assert.doesNotMatch(s, /모두 채우기|일괄 채우기|전부 채우기|fillAllNoBiz/,
      '★★★ 일괄로 밀면 표본 열셋 중 여덟의 어긋남이 그대로 계약서로 갑니다');
  });
});

test('★★ 이름이 겹치는 업체는 «먼저 말하고» 「고르기」를 준다', () => {
  const c = load();
  c.ErpMatch.companies = [{ id: 'co-1', name: '주식회사 대성' }, { id: 'co-2', name: '대성' }];
  assert.equal(c.coNoBizNameDup({ company: '대성' }), true,
    '★★ 다듬으면 같아지는 업체가 둘인데 안 짚어 줍니다');
  c.ErpMatch.companies = [{ id: 'co-1', name: '한서정공' }];
  assert.equal(c.coNoBizNameDup({ company: '한서정공' }), false);
});

test('★ 겹친 이름 줄은 «확인»이 아니라 «고르기»로 간다', () => {
  const ask = cutFn(SRC, 'function renderCoNoBizAsk(');
  assert.match(ask, /dup \? `<button class="conbpick"[^`]*openCoErpPicker/,
    '★ 겹친 이름을 그냥 「확인」으로 두면 남의 번호가 붙습니다');
  assert.match(ask, /openCoErpPicker/, '고르는 길이 없습니다');
});

test('★★ 「확인」은 곧 «확정»이다 — 새 저장 개념을 만들지 않았다', () => {
  const ask = cutFn(SRC, 'function renderCoNoBizAsk(');
  assert.match(ask, /coErpPin\(/,
    '★★ 확인이 확정으로 안 이어지면 번호가 따라오지 않습니다');
  /* ⚠ 「번호를 따로 저장하나」를 글자로 찾다가 조용히 빗나갔다(2026-09-02 되돌림 검사).
     보는 것을 바꾼다 — 이 그리개는 **서버에 아무것도 안 쓴다.** 쓰는 일은 coErpPin
     한 곳이 하고, 거기 쓰는 것은 확정 열쇠 하나뿐이다(cards-co-erp-key 가 지킨다). */
  assert.doesNotMatch(ask, /\.update\(|\.set\(|\.remove\(/,
    '★★ 물음 창이 서버에 씁니다 — 쓰는 일은 coErpPin 한 곳이 합니다');
});

test('★ 도구줄이 목록 위에 실제로 붙는다 — 함수만 있고 안 부르면 소용없다', () => {
  assert.match(SRC, /\$\{coTodoChipsHtml\(\)\}\$\{coNoBizBarHtml\(\)\}/,
    '★ coNoBizBarHtml 을 부르는 자리가 없습니다');
  assert.match(SRC, /id="coNbAskBg"/, '★ 물음 창 자리가 없습니다');
});
