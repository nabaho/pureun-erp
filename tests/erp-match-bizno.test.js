'use strict';
/* 푸른이알피 연결 — 이름이 같다고 «다른 회사»에 붙이지 않는다 (대표 보고 2026-08-28)
   ═══════════════════════════════════════════════════════════════════════════
   대표 보고: 「푸른이알피에 종료가 아닌데 종료로 되어 있는 사업장이 있다.
   명확하게 다시 정리해달라」

   ■ 까닭
     ErpMatch.match 는 «번호 → 이름» 차례로 찾는다. 번호가 안 맞으면 이름으로 넘어간다.
     그런데 이름 다듬기(_norm)는 「주식회사·(주)·공백·점·괄호」를 «다 지운다».
       「주식회사 행복한단홍갈비」  → 행복한단홍갈비
       「행복한 단홍갈비」          → 행복한단홍갈비
     두 이름이 «같아진다». 사업자번호는 213-87-03415 와 726-33-00338 로 «다른데»,
     한쪽이 푸른이알피에 없으면 이름으로 넘어가 «다른 회사의 업체 기록»에 붙었다.
     그 기록이 종료면 멀쩡히 계약 중인 회사가 🚪 종료로 찍힌다 — 담당 노무사도
     유형도 남의 것이 붙는다.

     ⚠ 번호는 «법으로 하나뿐인» 열쇠고 이름은 사람이 적는 글자다. 둘이 부딪히면
       번호가 이긴다. 번호가 다르면 그것으로 «끝»이다 — 이름이 아무리 같아도 다른 회사다.

   ■ 그대로 두는 것
     사업자번호가 «없는» 회사는 이름으로 붙이는 수밖에 없다(명함만 있는 회사가 그렇다).
     한쪽에만 번호가 있는 것도 막지 않는다 — 푸른이알피에 번호를 안 적어 둔 업체가 있다.
     막는 것은 «둘 다 번호가 있는데 서로 다른» 경우 하나뿐이다.

   ★ 여기서 못 박는 것
     ① 번호가 맞으면 그 업체 (하던 대로)
     ② 번호가 없으면 이름으로 (하던 대로 — 명함만 있는 회사)
     ③ ★ 둘 다 번호가 있는데 «다르면» 안 붙인다
     ④ 한쪽에만 번호가 있으면 이름으로 붙인다 (하던 대로)
     ⑤ 실제 사례: 「주식회사 행복한단홍갈비」와 「행복한 단홍갈비」가 안 섞인다
     ⑥ 푸른이알피 업체를 제 이름으로 되찾을 때도 남의 것을 안 집는다
   실행: node --test tests/erp-match-bizno.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* ErpMatch 통째를 떼어 온다 (const ErpMatch = { ... }; 까지) */
function loadErp(byBiz, byName){
  const i = src.indexOf('const ErpMatch = {');
  assert.ok(i > 0, 'ErpMatch 를 찾지 못했습니다');
  const open = src.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  assert.ok(end > 0, 'ErpMatch 의 끝을 찾지 못했습니다');
  const ctx = { console, Object, Array, String, Number, Math, JSON,
    Promise, Date, setTimeout: () => {}, render: () => {}, coListBust: () => {} };
  vm.createContext(ctx);
  /* ⚠ 최상위 const 는 vm 컨텍스트의 «속성이 되지 않는다» — var 로 바꿔 실어야 꺼내 쓴다 */
  vm.runInContext(src.slice(i, end).replace(/^const /, 'var ') + ';', ctx);
  ctx.ErpMatch.ready = true;
  ctx.ErpMatch.byBiz = byBiz || {};
  ctx.ErpMatch.byName = byName || {};
  return ctx.ErpMatch;
}
/* 푸른이알피 업체 기록 한 줄 */
const rec = (name, bizNo, o) => Object.assign({ company:name, bizNo:bizNo||'',
  main:'박성수', type:'자문', status:'active', left:false }, o||{});

/* ══════ ① 번호가 맞으면 그 업체 ══════ */

test('사업자번호가 맞으면 그 업체를 준다', () => {
  const E = loadErp({ '2138703415': rec('주식회사 행복한단홍갈비', '213-87-03415') }, {});
  const m = E.match({ bizno:'213-87-03415', company:'아무 이름' });
  assert.ok(m);
  assert.equal(m.bizNo, '213-87-03415');
});

/* ══════ ② 번호가 없으면 이름으로 ══════ */

test('사업자번호가 없는 회사는 이름으로 붙인다 — 명함만 있는 회사가 그렇다', () => {
  const E = loadErp({}, { '가나테크': rec('가나테크', '134-86-05772') });
  const m = E.match({ bizno:'', company:'(주) 가나테크' });
  assert.ok(m, '★ 번호 없는 회사까지 못 붙이면 담당 노무사가 통째로 사라진다');
  assert.equal(m.main, '박성수');
});

/* ══════ ③ ★ 둘 다 번호가 있는데 다르면 안 붙인다 ══════ */

test('★ 번호가 둘 다 있는데 «다르면» 안 붙인다 — 이것이 잘못된 「종료」의 까닭이다', () => {
  /* 푸른이알피에는 213-…(종료)만 있고, 우리 회사는 726-…(계약 중)이다.
     이름이 같아 예전에는 종료 기록에 붙어 🚪 종료로 찍혔다. */
  const 종료업체 = rec('주식회사 행복한단홍갈비', '213-87-03415',
    { status:'terminated', left:true, main:'신욱임' });
  const E = loadErp({ '2138703415': 종료업체 }, { '행복한단홍갈비': 종료업체 });
  const m = E.match({ bizno:'726-33-00338', company:'행복한 단홍갈비' });
  assert.equal(m, null,
    '★ 번호가 다르면 다른 회사다 — 남의 종료 기록이 붙으면 멀쩡한 거래처가 종료로 찍힌다');
});

test('★ 그래서 종료도 담당도 유형도 안 옮겨 붙는다', () => {
  const 종료업체 = rec('주식회사 행복한단홍갈비', '213-87-03415',
    { status:'terminated', left:true, main:'신욱임', type:'급여' });
  const E = loadErp({ '2138703415': 종료업체 }, { '행복한단홍갈비': 종료업체 });
  const m = E.match({ bizno:'726-33-00338', company:'행복한 단홍갈비' });
  assert.ok(!(m && m.left), '남의 종료가 붙었다');
  assert.ok(!(m && m.main), '남의 담당 노무사가 붙었다');
});

/* ══════ ④ 한쪽에만 번호가 있으면 그대로 붙인다 ══════ */

test('푸른이알피에 번호를 안 적어 둔 업체는 이름으로 붙인다 — 막지 않는다', () => {
  const E = loadErp({}, { '가나테크': rec('가나테크', '') });
  const m = E.match({ bizno:'134-86-05772', company:'(주)가나테크' });
  assert.ok(m, '★ 여기까지 막으면 번호를 안 적어 둔 거래처가 통째로 안 붙는다');
});

test('우리 쪽에만 번호가 없어도 이름으로 붙인다', () => {
  const E = loadErp({}, { '가나테크': rec('가나테크', '134-86-05772') });
  assert.ok(E.match({ bizno:'', company:'가나테크' }));
});

test('번호가 열 자리가 안 되면 «없는 것»으로 본다 — 잘못 적힌 번호로 막으면 안 된다', () => {
  const E = loadErp({}, { '가나테크': rec('가나테크', '134-86-05772') });
  assert.ok(E.match({ bizno:'134-86', company:'가나테크' }),
    '적다 만 번호 때문에 멀쩡한 연결이 끊기면 안 된다');
});

/* ══════ ⑤ 실제 사례 ══════ */

test('★ 「주식회사 행복한단홍갈비」와 「행복한 단홍갈비」가 서로 안 섞인다', () => {
  const a = rec('주식회사 행복한단홍갈비', '213-87-03415', { main:'신욱임', left:true });
  const b = rec('행복한 단홍갈비', '726-33-00338', { main:'김보람', left:false });
  const E = loadErp({ '2138703415': a, '7263300338': b }, { '행복한단홍갈비': a });
  assert.equal(E.match({ bizno:'213-87-03415', company:'주식회사 행복한단홍갈비' }).main, '신욱임');
  assert.equal(E.match({ bizno:'726-33-00338', company:'행복한 단홍갈비' }).main, '김보람',
    '★ 번호로 제 것을 찾아야 한다 — 이름으로 넘어가면 남의 기록이 붙는다');
});

test('이름 다듬기가 정말 둘을 같게 만든다 — 이 검사의 전제', () => {
  const E = loadErp({}, {});
  assert.equal(E._norm('주식회사 행복한단홍갈비'), E._norm('행복한 단홍갈비'),
    '전제가 깨지면 위 검사들이 아무것도 안 지킨다');
});

/* ══════ ⑥ 푸른이알피 업체를 제 이름으로 되찾을 때 ══════ */

test('★ 업체 하나를 제 기록으로 되찾는다 — 이름이 같은 남의 것을 안 집는다', () => {
  const a = rec('주식회사 행복한단홍갈비', '213-87-03415', { main:'신욱임', left:true });
  const b = rec('행복한 단홍갈비', '726-33-00338', { main:'김보람', left:false });
  const E = loadErp({ '2138703415': a, '7263300338': b }, { '행복한단홍갈비': a });
  assert.equal(E.recOfCo({ name:'행복한 단홍갈비', bizNo:'726-33-00338' }).main, '김보람',
    '★ 메일·담당 화면이 남의 종료를 보고 「끝난 곳」이라 하면 안 된다');
  assert.equal(E.recOfCo({ name:'주식회사 행복한단홍갈비', bizNo:'213-87-03415' }).main, '신욱임');
});

test('메일·담당 화면이 이름으로 직접 뒤지지 않는다 — 한 곳(recOfCo)을 거친다', () => {
  /* 세 화면이 저마다 ErpMatch.byName[_norm(c.name)] 을 뒤지고 있었다.
     그러면 같은 결함이 세 벌로 남아 한 곳만 고치게 된다. */
  const bad = src.match(/ErpMatch\.byName\[ErpMatch\._norm\(c\.name\)\]/g) || [];
  assert.deepEqual(bad, [],
    '★ 이름으로 직접 뒤지는 곳이 남아 있다 — recOfCo 를 거쳐야 한다');
});

/* ══════ ⑦ 하던 안전장치 ══════ */

test('푸른이알피가 아직 안 실렸으면 아무것도 안 붙인다', () => {
  const E = loadErp({}, { '가나테크': rec('가나테크', '') });
  E.ready = false;
  assert.equal(E.match({ bizno:'', company:'가나테크' }), null);
});

test('빈 값을 줘도 터지지 않는다', () => {
  const E = loadErp({}, {});
  assert.equal(E.match(null), null);
  assert.equal(E.match({}), null);
  assert.equal(E.recOfCo(null), null);
});
