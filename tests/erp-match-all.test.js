'use strict';
/* 푸른이알피 연결 — 번호가 먼저, 이름은 «임자 없는 것»만 (대표 보고 2026-08-28 두 번째)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 앞선 고침이 너무 셌다
     2026-08-28 오전에 「번호가 둘 다 있는데 다르면 안 붙인다」로 고쳤다. 잘못된 「종료」는
     사라졌지만, 대표 보고: 「거래처인데 목록에서 사라진 회사가 있다」.
     푸른이알피에 사업자번호가 «다르게 적힌» 멀쩡한 거래처까지 끊어 버린 것이다.
     (번호를 옮겨 적다 틀렸거나, 법인 전환 전 번호가 남아 있거나.)

   ■ 올바른 규칙 — 하나씩 보면 알 수 없다, 전체를 봐야 안다
     문제의 뿌리는 «우리 회사 둘이 업체 기록 하나를 두고 다투는 것»이었다.
       푸른이알피 : 주식회사 행복한단홍갈비 (213-87-03415, 종료)
       기업정보함 : 주식회사 행복한단홍갈비 (213-87-03415)
                    행복한 단홍갈비        (726-33-00338)   ← 이름이 같아진다
     213 은 «번호로» 그 기록의 임자다. 726 이 이름으로 같은 기록을 또 가져가면 안 된다.
     그런데 그것은 «726 하나만 봐서는 알 수 없다» — 213 이 있는지를 알아야 안다.

     그래서 회사 목록 «전체»를 한 번에 맞춘다:
       ① 번호가 딱 맞는 것부터 다 집는다 (가장 확실하다)
       ② 남은 회사는 이름으로 — 다만 «이미 임자가 있는» 기록은 안 준다

     이러면 둘 다 지켜진다:
       · 213 이 임자이므로 726 은 종료를 물려받지 않는다 (오전에 고친 것)
       · 아무도 안 가져간 기록은 이름으로 그대로 붙는다 (사라지지 않는다)

   ★ 여기서 못 박는 것
     ① 번호가 맞으면 그 업체 — 이름과 상관없이
     ② 번호로 임자가 정해진 기록은 남이 이름으로 못 가져간다
     ③ 임자가 없는 기록은 이름으로 붙는다 — 번호가 달라도 (사라지면 안 된다)
     ④ 번호가 없는 회사도 이름으로 붙는다 (명함만 있는 회사)
     ⑤ 한 기록이 회사 둘에 겹쳐 붙지 않는다
   실행: node --test tests/erp-match-all.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function loadErp(byBiz, byName){
  const i = src.indexOf('const ErpMatch = {');
  const open = src.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  assert.ok(end > 0, 'ErpMatch 의 끝을 찾지 못했습니다');
  const ctx = { console, Object, Array, String, Number, Math, JSON, Set,
    Promise, Date, setTimeout: () => {}, render: () => {}, coListBust: () => {} };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, end).replace(/^const /, 'var ') + ';', ctx);
  ctx.ErpMatch.ready = true;
  ctx.ErpMatch.byBiz = byBiz || {};
  ctx.ErpMatch.byName = byName || {};
  return ctx.ErpMatch;
}
const rec = (name, bizNo, o) => Object.assign({ company:name, bizNo:bizNo||'',
  main:'박성수', type:'자문', status:'active', left:false }, o||{});
const co = (key, name, bizno) => ({ key, name, bizno: bizno || '' });

/* 실제 사례 — 이름이 같아지는 두 회사 */
const 종료기록 = rec('주식회사 행복한단홍갈비', '213-87-03415',
  { status:'terminated', left:true, main:'신욱임', type:'급여' });

/* ══════ ①② 번호로 임자가 정해지면 남이 못 가져간다 ══════ */

test('★ 번호로 임자가 된 기록을 «이름으로» 남이 가져가지 못한다 — 잘못된 종료의 뿌리', () => {
  const E = loadErp({ '2138703415': 종료기록 }, { '행복한단홍갈비': 종료기록 });
  const got = E.matchAll([
    co('a', '주식회사 행복한단홍갈비', '213-87-03415'),
    co('b', '행복한 단홍갈비', '726-33-00338')
  ]);
  assert.ok(got.a, '번호로 맞은 회사가 못 붙었다');
  assert.equal(got.a.left, true, '진짜 종료가 안 붙었다');
  assert.equal(got.b, undefined,
    '★ 남의 종료 기록이 붙으면 멀쩡한 거래처가 🚪 종료로 찍힌다');
});

test('★ 차례가 바뀌어도 임자는 «번호» 쪽이다 — 목록 순서에 흔들리면 안 된다', () => {
  const E = loadErp({ '2138703415': 종료기록 }, { '행복한단홍갈비': 종료기록 });
  const got = E.matchAll([
    co('b', '행복한 단홍갈비', '726-33-00338'),      /* 이름 쪽이 «먼저» 와도 */
    co('a', '주식회사 행복한단홍갈비', '213-87-03415')
  ]);
  assert.ok(got.a, '번호로 맞은 회사가 밀렸다');
  assert.equal(got.b, undefined);
});

/* ══════ ③ 임자 없는 기록은 이름으로 붙는다 — 사라지면 안 된다 ══════ */

test('★ 번호가 달라도 «임자가 없으면» 이름으로 붙는다 — 거래처가 사라지면 안 된다', () => {
  /* 푸른이알피에 번호가 잘못 적힌 거래처. 그 번호를 가진 우리 회사는 «없다».
     오전 고침은 이것까지 끊어 대표 화면에서 회사가 사라졌다. */
  const E = loadErp({ '9999999999': rec('가나테크', '999-99-99999') },
                    { '가나테크': rec('가나테크', '999-99-99999') });
  const got = E.matchAll([ co('a', '(주) 가나테크', '134-86-05772') ]);
  assert.ok(got.a,
    '★ 아무도 안 가져간 기록인데 끊으면, 멀쩡한 거래처가 목록에서 사라진다');
  assert.equal(got.a.main, '박성수');
});

test('★ 번호가 «아예 없는» 회사도 이름으로 붙는다 — 명함만 있는 회사', () => {
  const E = loadErp({}, { '가나테크': rec('가나테크', '134-86-05772') });
  const got = E.matchAll([ co('a', '가나테크', '') ]);
  assert.ok(got.a);
});

test('푸른이알피에 번호를 안 적어 둔 업체도 붙는다', () => {
  const E = loadErp({}, { '가나테크': rec('가나테크', '') });
  const got = E.matchAll([ co('a', '(주)가나테크', '134-86-05772') ]);
  assert.ok(got.a);
});

/* ══════ ⑤ 한 기록이 둘에 겹쳐 붙지 않는다 ══════ */

test('★ 한 업체 기록이 회사 «둘»에 겹쳐 붙지 않는다', () => {
  const r = rec('가나테크', '');
  const E = loadErp({}, { '가나테크': r });
  const got = E.matchAll([ co('a', '가나테크', ''), co('b', '(주) 가나테크', '') ]);
  const 붙은수 = [got.a, got.b].filter(Boolean).length;
  assert.equal(붙은수, 1,
    '★ 하나뿐인 업체 기록을 둘이 나눠 가지면 담당·유형·종료가 두 곳에 겹쳐 나온다');
});

/* ══════ 안전장치 ══════ */

test('푸른이알피가 아직 안 실렸으면 아무것도 안 붙인다', () => {
  const E = loadErp({}, { '가나테크': rec('가나테크', '') });
  E.ready = false;
  assert.deepEqual(Object.keys(E.matchAll([ co('a', '가나테크', '') ])), []);
});

test('빈 목록·헛값을 줘도 터지지 않는다', () => {
  const E = loadErp({}, {});
  assert.deepEqual(Object.keys(E.matchAll([])), []);
  assert.deepEqual(Object.keys(E.matchAll(null)), []);
  assert.deepEqual(Object.keys(E.matchAll([null, {}])), []);
});

/* ══════ 회사 목록이 실제로 이것을 쓴다 ══════ */

test('★ 회사 목록(coListBuild)이 «전체를 한 번에» 맞춘다 — 하나씩 맞추면 임자를 알 수 없다', () => {
  const i = src.indexOf('function coListBuild(');
  const fn = src.slice(i, src.indexOf('\nfunction ', i + 20));
  assert.match(fn, /matchAll\(/,
    '★ 하나씩 ErpMatch.match 로 맞추면 「이 기록의 임자가 따로 있는가」를 알 수 없다');
});
