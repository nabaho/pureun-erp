'use strict';
/* ══════ 조건 띠가 두 벌이던 것 (점검 A3) ══════
   명함 쪽과 기업 상세 쪽에 «글자 하나만 다른» 같은 함수가 두 벌 있었다.
   내가 이틀에 걸쳐 각각 만들면서 생긴 것이다.

     condChipsHtml   ≡ coTodoChipsHtml   (이름표와 ✕ 함수 이름만 다름)
     clearCond       ≡ clearCoTodo       (쪽 이름과 다시 그리는 함수만 다름)

   한쪽만 고치면 다른 화면이 «조용히» 어긋난다 — 띠는 「왜 몇 곳만 나오나」에 답하는
   유일한 표시라, 한쪽이 낡으면 그 화면에서는 다시 갇힌다(2026-08-30 아침의 그 일).

   ★ 만드는 곳을 하나로 모은다. 다른 것은 «넘겨받는다» — 이름표·✕가 부를 것·쪽 이름. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const open = SRC.indexOf('{', at);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');

function ctx(state) {
  /* ⚠ esc 대역을 «진짜처럼» 만든다. 그냥 넘기는 대역을 쓰면 「꺾쇠를 안 내보낸다」가
     늘 통과한다 — 대역이 검사를 대신 통과시켜 버린다. */
  const b = { state: state || {},
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') };
  vm.createContext(b);
  vm.runInContext(fn('condChipHtml'), b);
  return b;
}

/* ── ① 만드는 곳이 하나다 ──────────────────────────────────────── */
test('★ 띠를 «만드는» 곳이 하나뿐이다', () => {
  ['condChipsHtml', 'coTodoChipsHtml'].forEach(n => {
    const src = bare(fn(n));
    assert.ok(/condChipHtml\(/.test(src),
      '★ ' + n + ' 이 제 손으로 띠를 만든다 — 한쪽만 고치면 다른 화면이 조용히 낡는다');
    assert.ok(!/mgrchip/.test(src), '★ ' + n + ' 안에 아직 띠 모양이 박혀 있다');
  });
});

test('★ 푸는 것도 한 규칙이다 — 켜는 쪽이 아니라 «푸는» 쪽만', () => {
  ['clearCond', 'clearCoTodo'].forEach(n => {
    const src = bare(fn(n));
    assert.ok(/=\s*false/.test(src), n + ' 이 조건을 뒤집는다 — ✕ 로 켜지면 안 된다');
    assert.ok(/[Pp]age\s*=\s*0/.test(src), n + ' 이 첫 쪽으로 안 보낸다');
  });
});

/* ── ② 만드는 곳이 제대로 만든다 ───────────────────────────────── */
test('걸린 것만 띠에 나온다', () => {
  const b = ctx({ a: true, b: false });
  const h = vm.runInContext(
    "condChipHtml({a:'🚪 퇴사자', b:'🏚 계약종료'}, 'clearCond')", b);
  assert.ok(h.includes('퇴사자'), '켠 조건이 없다');
  assert.ok(!h.includes('계약종료'), '안 켠 조건까지 나왔다');
});

test('아무것도 안 켜면 빈 글자다 — 늘 뜨는 띠는 안 읽힌다', () => {
  const b = ctx({ a: false });
  assert.equal(vm.runInContext("condChipHtml({a:'x'}, 'clearCond')", b), '');
});

test('★ ✕ 가 «넘겨받은» 함수를 부른다 — 화면마다 푸는 길이 다르다', () => {
  const b = ctx({ a: true });
  const h1 = vm.runInContext("condChipHtml({a:'x'}, 'clearCond')", b);
  const h2 = vm.runInContext("condChipHtml({a:'x'}, 'clearCoTodo')", b);
  assert.ok(h1.includes("clearCond('a')"), '명함 쪽 푸는 길이 안 붙었다');
  assert.ok(h2.includes("clearCoTodo('a')"), '기업 상세 쪽 푸는 길이 안 붙었다');
});

test('이름표에 든 글자를 그대로 내보내지 않는다', () => {
  const b = ctx({ a: true });
  const h = vm.runInContext("condChipHtml({a:'<b>x</b>'}, 'clearCond')", b);
  assert.ok(!h.includes('<b>x</b>'), '이름표의 꺾쇠가 그대로 나가 줄이 깨진다');
});

/* ── ③ 두 화면이 여전히 제 이름표를 쓴다 ───────────────────────── */
test('명함 쪽과 기업 상세 쪽이 «다른 이름표»를 넘긴다', () => {
  assert.ok(/COND_LABEL/.test(bare(fn('condChipsHtml'))), '명함 쪽 이름표가 안 쓰인다');
  /* ⚠ 2026-09-03(4걸음): 기업 상세 쪽 이름표는 «그때그때» 만든다 —
       「📤 근로계약서 못 받은 곳」처럼 갈래 이름이 들어가야 하기 때문이다.
       그래도 바탕은 CO_TODO_LABEL 하나이고, 띠를 «그리는» 곳은 여전히 한 벌이다. */
  assert.ok(/coTodoLabels\(\)/.test(bare(fn('coTodoChipsHtml'))), '기업 상세 쪽 이름표가 안 쓰인다');
  assert.ok(/CO_TODO_LABEL/.test(bare(fn('coTodoLabels'))), '바탕 이름표가 CO_TODO_LABEL 이 아니다');
});
