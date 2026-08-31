'use strict';
/* 「사업내역」을 정리한다 — 이관·컨설팅에 따른 선택·취소는 늘 숨긴다 (대표 지시 2026-08-31)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 지시
     「사업이 중복되거나 잘못된 경우가 있다. 그리고 계약의 경우 계약에서 이관된 경우
      계약은 사라져야한다. 그리고 계약에서도 컨설팅에 따른 선택이 있는데 그부분은
      굳이 표시할 필요 없다. 그리고 취소된 경우는 잘못입력한 경우가 많기 때문에
      입력을 안한는게 좋다.」

   ■ 왜 중복·잘못으로 보였나
     ① «이관된» 계약 — 이알피는 계약이 사건·컨설팅·기금·기타로 넘어가면 그 계약에
        status:'transferred' 를 적는다(계약관리의 「이관완료」 딱지와 같은 값).
        넘어간 결과물(예: 컨설팅 「현장클리닉」)이 이미 따로 한 줄로 잡히므로,
        원본 계약까지 같이 보이면 «같은 일»이 두 줄로 보인다.
     ② «컨설팅에 따른 선택» 계약 — kind:'biz_cons' 인 계약. 실제 일감은 이관된
        뒤 컨설팅 기록으로 잡히므로, 그 전 단계인 이 계약 자체는 늘어놓을 필요가 없다.
     ③ 취소(cancel) — 잘못 입력한 경우가 많다. 갈래를 안 가린다 — 계약뿐 아니라
        사건·컨설팅·기금·기타 어디서든 취소는 잘못 입력일 확률이 높다.

   ■ ⚠ 사람이 거르개(칩)로 켜고 끄는 것과 «다르다»
     이 셋은 사람이 «전체»를 눌러도 안 나온다 — 애초에 all(합계·건수의 바탕)에서
     빠진다. 안 그러면 「모두 3,210,000원 · 4건」이 정작 안 보이는 계약까지 센 거짓
     숫자가 된다.

   ★ 여기서 못 박는 것
     ① 취소는 갈래와 상관없이 숨는다
     ② status:'transferred' 계약은 숨는다 (사건·컨설팅 등은 transferred 를 안 본다)
     ③ kind:'biz_cons' 계약은 숨는다
     ④ 정상 계약(진행중·미이관·advisory 등)은 그대로 보인다
     ⑤ 숨은 것은 합계·건수·갈래 칩에도 안 들어간다
   실행: node --test tests/cards-co-hist-tidy.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  const i = SRC.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했다');
}
function decl(name){
  const at = SRC.indexOf('const ' + name + ' =');
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const end = SRC.indexOf('\n];', at) >= 0 && SRC.indexOf('\n];', at) < SRC.indexOf('};', at)
    ? SRC.indexOf('\n];', at) + 3 : SRC.indexOf('};', at) + 2;
  return SRC.slice(at, end).replace(/^const /, 'var ');
}
function load(){
  const ctx = { console, Object, String, Number, Array, JSON };
  vm.createContext(ctx);
  vm.runInContext(SRC.match(/^const ERP_HIST_STAT = \{[\s\S]*?\};/m)[0].replace(/^const /, 'var '), ctx);
  ['erpHistStat', 'erpHistVisible'].forEach(n => vm.runInContext(fnBody(n), ctx));
  return ctx;
}

const 계약 = (x) => Object.assign({ _kind:'contract', kind:'advisory', status:'active' }, x || {});
const 컨설팅 = (x) => Object.assign({ _kind:'consulting', status:'active' }, x || {});
const 사건 = (x) => Object.assign({ _kind:'case', status:'active' }, x || {});

/* ══════ ① 취소는 갈래 상관없이 숨는다 ══════ */
test('★ 취소된 계약은 숨는다', () => {
  const c = load();
  assert.equal(c.erpHistVisible(계약({ status:'cancelled' })), false);
});
test('★ 취소된 컨설팅도 숨는다 — 계약만이 아니다', () => {
  const c = load();
  assert.equal(c.erpHistVisible(컨설팅({ status:'cancelled' })), false);
});
test('취소된 사건도 숨는다', () => {
  const c = load();
  assert.equal(c.erpHistVisible(사건({ status:'canceled' })), false);
});

/* ══════ ② 이관된 계약은 숨는다 ══════ */
test('★ 이관된(transferred) 계약은 숨는다 — 결과물이 이미 따로 한 줄로 잡힌다', () => {
  const c = load();
  assert.equal(c.erpHistVisible(계약({ status:'transferred' })), false);
});
test('컨설팅·사건은 transferred 라는 상태 자체가 없다 — 계약에만 있는 판정이다', () => {
  const c = load();
  /* 다른 갈래에 실수로 status:'transferred' 가 적혀도(원래 없는 값이지만) 숨기지 않는다 —
     이 판정은 «계약» 갈래에만 매인 규칙이다 */
  assert.equal(c.erpHistVisible(컨설팅({ status:'transferred' })), true);
});

/* ══════ ③ 컨설팅에 따른 선택(biz_cons) 계약은 숨는다 ══════ */
test('★ kind:biz_cons 계약은 숨는다 — 실제 일감은 이관된 뒤 컨설팅으로 잡힌다', () => {
  const c = load();
  assert.equal(c.erpHistVisible(계약({ kind:'biz_cons', status:'active' })), false);
});

/* ══════ ④ 멀쩡한 것은 그대로 보인다 ══════ */
test('진행 중인 보통 계약(advisory)은 그대로 보인다', () => {
  const c = load();
  assert.equal(c.erpHistVisible(계약({ kind:'advisory', status:'active' })), true);
});
test('진행 중인 컨설팅·사건은 그대로 보인다', () => {
  const c = load();
  assert.equal(c.erpHistVisible(컨설팅()), true);
  assert.equal(c.erpHistVisible(사건()), true);
});

/* ══════ ⑤ coHistPaint 가 실제로 이 판정을 쓴다 ══════ */
test('★★ coHistPaint 가 all 을 만들 때 erpHistVisible 로 거른다 — 안 그러면 합계가 거짓말을 한다', () => {
  const fn = fnBody('coHistPaint');
  assert.match(fn, /recs\.filter\(erpHistVisible\)|erpHistVisible\(/,
    '★★ 숨겨야 할 것이 all 에 섞이면 「모두 N건」 합계에 안 보이는 것까지 세어진다');
});
