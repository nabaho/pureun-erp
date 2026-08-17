/* 부분입금 · 마무리 확정 (2026-08-16 대표 지시)
   - 들어온 돈에 적요를 남긴다 (누가 낸 돈인지 알 수 있어야 한다)
   - 못 받기로 한 남은 돈을 「여기까지로」 닫는다 (까닭 필수 · 관리자만 · 되돌리기 가능)
   ★ 글자만 보지 말고 «실제로 돌려» 본다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

function cut(from, to) {
  const s = SRC.indexOf(from);
  assert.ok(s > 0, '코드를 찾지 못했다: ' + from);
  const e = SRC.indexOf(to, s);
  assert.ok(e > s, '끝을 찾지 못했다: ' + to);
  return SRC.slice(s, e);
}

/* ── 닫힘 판정 + 미입금 목록을 실제로 돌린다 ── */
const CODE = cut('function erpClosedUnpaid(', 'function erpItemClosedTag(');

function box() {
  const ctx = {
    Object, Math, String, Array, parseInt, isNaN, console,
    window: {},
    caseSuccessFeeAmount: function (it) { return parseInt(it.successFee, 10) || 0; },
    // 받은 돈 합계는 여기서 볼 것이 아니다 — 여기서 보는 것은 「닫힌 것이 빠지는가」다
    erpPaidSoFar: function () { return 0; }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  return ctx;
}
const C = box();

test('닫은 종류를 찾아낸다', () => {
  const it = { unpaidClosed: { '착수금': { amount: 120000, reason: '미납' } } };
  assert.ok(C.erpClosedUnpaid(it, '착수금'));
  assert.strictEqual(C.erpClosedUnpaid(it, '착수금').amount, 120000);
});

test('안 닫은 종류는 null', () => {
  const it = { unpaidClosed: { '착수금': { amount: 120000 } } };
  assert.strictEqual(C.erpClosedUnpaid(it, '성공보수'), null);
});

test('빈 표·없는 칸에 걸려 잘못 닫히지 않는다', () => {
  assert.strictEqual(C.erpClosedUnpaid({}, '착수금'), null);
  assert.strictEqual(C.erpClosedUnpaid(null, '착수금'), null);
  assert.strictEqual(C.erpClosedUnpaid({ unpaidClosed: {} }, '착수금'), null);
});

test('금액 0은 닫힌 것으로 보지 않는다', () => {
  /* 0원짜리 껍데기가 남아 있다고 건이 사라지면, 왜 사라졌는지 알 길이 없다 */
  assert.strictEqual(C.erpClosedUnpaid({ unpaidClosed: { '착수금': { amount: 0 } } }, '착수금'), null);
});

test('닫은 종류가 미입금 목록에서 빠진다', () => {
  const it = { id: 'c1', retainerFee: 6000000, successFee: 3000000,
    unpaidClosed: { '착수금': { amount: 120000, reason: '미납' } } };
  const kinds = C.erpUnpaidParts(it).map(u => u.kindLabel);
  assert.strictEqual(kinds.indexOf('착수금'), -1, '닫은 착수금이 남아 있다');
});

test('닫지 않은 종류는 그대로 남는다', () => {
  /* 한 종류를 닫았다고 다른 종류까지 사라지면 돈을 통째로 놓친다 */
  const it = { id: 'c1', retainerFee: 6000000, successFee: 3000000,
    unpaidClosed: { '착수금': { amount: 120000, reason: '미납' } } };
  const kinds = C.erpUnpaidParts(it).map(u => u.kindLabel);
  assert.ok(kinds.indexOf('성공보수') >= 0, '성공보수까지 사라졌다');
});

test('닫기 전에는 둘 다 남아 있다', () => {
  const it = { id: 'c1', retainerFee: 6000000, successFee: 3000000 };
  const kinds = C.erpUnpaidParts(it).map(u => u.kindLabel);
  assert.ok(kinds.indexOf('착수금') >= 0 && kinds.indexOf('성공보수') >= 0);
});

test('계약금·잔금도 따로 닫힌다', () => {
  const it = { id: 'p1', contractFee: 1000000, balanceFee: 2000000,
    unpaidClosed: { '잔금': { amount: 50000, reason: 'x' } } };
  const kinds = C.erpUnpaidParts(it).map(u => u.kindLabel);
  assert.ok(kinds.indexOf('계약금') >= 0);
  assert.strictEqual(kinds.indexOf('잔금'), -1);
});

test('닫을 때 「받았다」 플래그를 세우지 않는다', () => {
  /* ★ xxxPaid 를 세우면 「다 받았다」가 되어 «받지도 않은 돈이 받은 것으로» 보인다.
     닫힘은 「안 받기로 했다」이지 「받았다」가 아니다. */
  const close = cut('function erpCloseUnpaid(', 'function erpReopenUnpaid(');
  assert.strictEqual(/retainerPaid\s*[:=]|balancePaid\s*[:=]|contractPaid\s*[:=]|successPaid\s*[:=]/.test(close), false);
});

/* ── 닫는 함수 자체를 돌려 본다 ── */
const WCODE = cut('function erpCloseUnpaid(', '/* 통장에 들어올');
function wbox() {
  const patched = [];
  const ctx = { Object, Math, String, Array, parseInt, Date, console,
    dbPatch: function (k, id, patch) { patched.push({ k: k, id: id, patch: patch }); return true; } };
  vm.createContext(ctx);
  vm.runInContext(WCODE, ctx);
  ctx.__patched = patched;
  return ctx;
}

test('까닭 없이는 닫히지 않는다', () => {
  /* ★ 화면에서 막는 것만으로는 부족하다 — 왜 12만을 포기했는지가 없으면
     나중에 아무도 설명할 수 없다. 저장하는 함수가 스스로 거절해야 한다. */
  const W = wbox();
  assert.strictEqual(W.erpCloseUnpaid('cases', 'c1', {}, '착수금', 120000, '', {}), false);
  assert.strictEqual(W.erpCloseUnpaid('cases', 'c1', {}, '착수금', 120000, '   ', {}), false);
  assert.strictEqual(W.__patched.length, 0, '까닭이 없는데 저장했다');
});

test('금액이 0이면 닫히지 않는다', () => {
  const W = wbox();
  assert.strictEqual(W.erpCloseUnpaid('cases', 'c1', {}, '착수금', 0, '까닭', {}), false);
});

test('까닭이 있으면 닫고 누가 언제인지 남긴다', () => {
  const W = wbox();
  assert.strictEqual(W.erpCloseUnpaid('cases', 'c1', {}, '착수금', 120000, ' 미납 ', { sid: 'P001', name: '권형하' }), true);
  const rec = W.__patched[0].patch.unpaidClosed['착수금'];
  assert.strictEqual(rec.amount, 120000);
  assert.strictEqual(rec.reason, '미납');
  assert.strictEqual(rec.byName, '권형하');
  assert.ok(rec.at);
});

test('다른 종류가 이미 닫혀 있으면 지우지 않는다', () => {
  /* 한 종류를 닫으면서 다른 종류의 기록을 날리면 돈이 통째로 사라진다 */
  const W = wbox();
  const it = { unpaidClosed: { '성공보수': { amount: 500, reason: 'x' } } };
  W.erpCloseUnpaid('cases', 'c1', it, '착수금', 120000, '미납', {});
  const m = W.__patched[0].patch.unpaidClosed;
  assert.ok(m['성공보수'] && m['착수금']);
});

test('되돌리면 그 종류만 지운다', () => {
  const W = wbox();
  const it = { unpaidClosed: { '착수금': { amount: 1 }, '성공보수': { amount: 2 } } };
  assert.strictEqual(W.erpReopenUnpaid('cases', 'c1', it, '착수금'), true);
  const m = W.__patched[0].patch.unpaidClosed;
  assert.strictEqual(m['착수금'], undefined);
  assert.ok(m['성공보수']);
});

test('닫히지 않은 것을 되돌리려 하면 아무것도 안 한다', () => {
  const W = wbox();
  assert.strictEqual(W.erpReopenUnpaid('cases', 'c1', {}, '착수금'), false);
  assert.strictEqual(W.__patched.length, 0);
});

/* ── 적요를 남긴다 ── */
test('들어온 돈 기록마다 적요 칸이 있다', () => {
  /* ★ 지금은 {id,date,amount,kind} 뿐이라 «누가 낸 돈인지» 를 모른다.
     39명이 나눠 내는 건에서 다음 달 마무리할 때 통장을 다시 뒤져야 한다.
     ★ 개수를 세지 않고 «자리마다» 본다 — 한 곳만 빠뜨려도 그 길로 확정한 건이 이름을 잃는다. */
  const entries = SRC.match(/\{[\s\S]{0,30}?id:'sp-'[\s\S]{0,400}?\}/g) || [];
  assert.ok(entries.length >= 3, '분할기록을 만드는 자리가 셋 이상이어야 한다 (지금 ' + entries.length + ')');
  entries.forEach(function (e, i) {
    assert.strictEqual(/memo:/.test(e), true, (i + 1) + '번째 자리에 적요가 없다 — ' + e.slice(0, 90));
  });
});

test('적요가 없으면 빈 값 — 거짓으로 채우지 않는다', () => {
  /* 통장에서 열지 않고 손으로 확정한 건은 적요가 없다. 없는 것을 지어내면 안 된다. */
  const mk = SRC.match(/memo:\s*([^,\n]+)/g) || [];
  assert.ok(mk.some(x => /\|\|\s*''/.test(x)), "적요가 없을 때 '' 로 두는 자리가 있어야 한다");
});

test('splitPayments 의 kind 는 그대로다', () => {
  /* ★ erpPaidSoFar 가 sp.kind === kindLabel 로 합계를 낸다.
     이름을 건드리면 지금까지 받은 돈이 통째로 0이 된다. */
  const p = cut('function erpPaidSoFar(', 'function erpPartPaidNote(');
  assert.strictEqual(/sp\.kind === kindLabel/.test(p), true);
});

/* ── 미수금관리 ── */
test('미수금관리가 닫은 건을 안 센다', () => {
  const r = cut('function _remain(item, fee, kindLabel, legacyField)', '// 1. 사건');
  assert.strictEqual(/erpClosedUnpaid\(item, kindLabel\)/.test(r), true);
});

test('정리된 미수를 따로 보여 준다', () => {
  /* 따옴표까지 본다 — 주석에 적힌 낱말에 속지 않으려면 «그려지는 글자» 여야 한다
     (2026-08-16 에 실제로 주석을 읽고 통과했다) */
  const fr = cut('function FinanceReceivable(', 'function MonthClose(');
  assert.strictEqual(/'🏁 정리된 미수'/.test(fr), true);
  assert.strictEqual(/'↺ 되돌리기'/.test(fr), true);
});

/* ── 화면 ── */
const PEND = cut('function IncomePendingTab(', 'function IncomeListTab(');

test('「마무리」 단추는 일부라도 받은 건에만 뜬다', () => {
  /* 한 푼도 안 받은 건에 뜨면 아직 마무리할 것이 없는데 누르게 된다.
     ※ 글자수 거리로 재지 않는다 — 코드가 조금만 길어져도 엉뚱하게 깨진다.
       「그 조건 바로 뒤에 단추가 있고, 그 안에 마무리가 있다」는 구조로 본다. */
  assert.strictEqual(/\(p\.paidSoFar > 0\) && h\('button', \{[\s\S]*?'마무리'\)/.test(PEND), true);
});

test('마무리는 세 갈래를 준다', () => {
  assert.strictEqual(/나머지/.test(PEND) && /여기까지로/.test(PEND) && /약정액/.test(PEND), true);
});

test('닫기 갈래는 관리자에게만 보인다', () => {
  /* 돈을 안 받기로 하는 결정이다. 담당자가 조용히 닫으면 미수가 사라진 줄도 모른다 */
  assert.strictEqual(/_canClose\s*\r?\n?\s*\?[\s\S]*?여기까지로/.test(PEND), true,
    '「여기까지로 닫는다」가 _canClose 갈래 안에 있어야 한다');
  assert.strictEqual(/_canClose = [\s\S]{0,120}?isAdminByUser\(CURRENT_USER\)/.test(PEND), true,
    '_canClose 는 관리자 판정에서 와야 한다');
});

test('저장할 때도 관리자인지 다시 본다', () => {
  /* 화면에서 감추는 것만으로는 부족하다 — 콘솔로 부르면 그냥 닫힌다 */
  const fn = PEND.slice(PEND.indexOf('function doCloseUnpaid('), PEND.indexOf('function doConfirm('));
  assert.strictEqual(/_canClose/.test(fn), true);
  assert.strictEqual(/closeReason\.trim\(\)/.test(fn), true);
});

test('까닭이 비면 닫기 단추가 막힌다', () => {
  assert.strictEqual(/closeReason[\s\S]{0,200}?trim\(\)/.test(PEND), true);
});

test('약정액 고치기는 새로 만들지 않고 그 화면으로 보낸다', () => {
  /* 계약 금액은 세금계산서·부가세·성과 기준과 얽혀 있다. 여기서 숫자만 바꾸면 어긋난다 */
  assert.strictEqual(/onNavigate|goItem|openItem/.test(PEND), true);
});

/* ── 입금확정 창의 「들어온 돈」 표 ── */
/* 따옴표까지 본다 — 바로 위 주석에 같은 낱말이 있어, 글자만 찾으면 주석을 읽고 통과한다 */
const _mi = SRC.indexOf("'📥 이 건에 들어온 돈'");
const MODAL = _mi > 0 ? SRC.slice(_mi - 3000, _mi + 2500) : '';

test('입금확정 창에 들어온 돈 표가 있다', () => {
  assert.ok(_mi > 0, '그려지는 제목을 찾지 못했다 (주석 말고)');
});

test('표가 날짜·적요·금액을 적는다', () => {
  assert.strictEqual(/'적요'/.test(MODAL) && /'금액'/.test(MODAL) && /'날짜'/.test(MODAL), true);
});

test('이번에 확정할 줄도 함께 보여 준다', () => {
  /* 확정된 것만 보이면 「지금 얼마를 붙이는지」를 다른 데서 찾아야 한다 */
  assert.strictEqual(/← 지금/.test(MODAL), true);
});

test('옛 「기납입 … 잔액 …」 한 줄은 없앤다', () => {
  /* 같은 것을 두 번 적으면 둘이 어긋났을 때 어느 쪽이 맞는지 알 수 없다 */
  assert.strictEqual(/'◐ 기납입 '/.test(SRC), false);
});
