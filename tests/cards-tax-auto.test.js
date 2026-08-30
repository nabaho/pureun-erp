'use strict';
/* 세금계산서 발급처를 «저절로» 채운다 (대표 지시 2026-08-30 「자동으로 채우게」)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 왜 단추만으로는 모자랐나
     값이 들어오는 길이 «둘»이다 —
       ① 기업정보함에서 등록증을 손으로 고치거나 찍어 넣을 때(saveEditor)
       ② 사진첩이 판독해 pucards/items 에 «직접» 쓸 때(pu-doc-file fillOne·createOne)
     ②는 기업정보함의 저장 함수를 거치지 않는다. 그래서 저장 자리에만 걸면 사진첩으로
     들어온 값은 영영 이알피로 못 간다.
     자료가 바뀌는 «문»은 하나다(coListBust) — 거기 걸면 두 길이 다 잡힌다.

   ■ 값싸게 만드는 것이 이 고침의 어려운 점
     회사가 4,000곳이라, 바뀔 때마다 서버를 읽으면 요금이 그대로 는다.
     · 「이알피에 이미 들어 있나」는 «손에 든» 색인(ErpMatch)으로 가린다 — 읽지 않는다.
     · 채울 것이 하나도 없으면 서버를 아예 안 건드린다.
     · 여러 곳을 한 번에 모아 «한 번만» 쓴다.
     · 이 판에서 이미 해 본 회사는 다시 안 한다(되풀이 쓰기 금지).

   ★ 여기서 못 박는 것
     ① 이알피 색인이 계산서 발급처를 들고 있다 — 안 들면 「이미 있나」를 못 가린다
     ② 자료가 바뀌는 문(coListBust)에서 자동 채우기가 깨어난다
     ③ 채울 것이 없으면 서버를 안 건드린다
     ④ 이미 이알피에 들어 있으면 안 건드린다
     ⑤ 업체관리에 없는 회사는 건너뛴다
     ⑥ 한 판에 같은 회사를 두 번 하지 않는다
     ⑦ 조용히 한다 — 저절로 하는 일이 말을 걸면 안 된다
   실행: node --test tests/cards-tax-auto.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
function code(s){
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}
function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

/* ══════ ① 색인이 값을 들고 있다 ══════ */
test('★ 이알피 색인이 계산서 발급처를 들고 있다 — 없으면 「이미 있나」를 서버로 물어야 한다', () => {
  const i = src.indexOf('taxPhone: co.taxPhone');
  assert.ok(i > 0, '색인 만드는 자리를 찾을 수 없습니다');
  const seg = src.slice(i - 400, i + 1400);
  ['taxInvoiceEmail', 'taxInvoiceContact'].forEach(k => {
    assert.match(seg, new RegExp(k + '\\s*:\\s*co\\.' + k),
      '★ 색인에 「' + k + '」 이 없다 — 회사마다 서버를 읽어야 하고 그게 그대로 요금이다');
  });
});

/* ══════ ② 문에서 깨어난다 ══════ */
test('★ 자료가 바뀌는 문(coListBust)에서 자동 채우기가 깨어난다', () => {
  const b = code(fnBody('coListBust'));
  assert.match(b, /taxAutoSoon\(\)/,
    '★ 저장 자리에만 걸면 사진첩으로 들어온 값은 영영 이알피로 못 간다');
});

/* ══════ ③~⑥ 고르는 셈 ══════ */
/* ⚠ vm 이 돌려주는 배열은 «다른 realm» 것이라 deepEqual 이 그대로는 안 맞는다 —
   내용만 견주도록 평범한 배열로 옮겨 담는다. */
const plain = v => Array.from(v || []);
function loadPick(){
  const ctx = { console, Object, String, Array, Boolean };
  vm.createContext(ctx);
  vm.runInContext(fnBody('taxAutoTargets'), ctx);
  return ctx;
}
const CO = (o) => Object.assign({ key:'1234567890', name:'가나테크', bizno:'123-45-67890',
  taxInvoiceEmail:'bill@gana.co.kr', taxInvoiceContact:'김경리' }, o || {});
/* 대역: coVal 은 값 그대로, ErpMatch 는 넘겨 준 업체를 돌려준다 */
const opt = (erp, done) => ({
  coVal: (o, f) => String(o[f] == null ? '' : o[f]).trim(),
  match: () => erp,
  done: done || {}
});

test('★ 채울 것이 있으면 고른다', () => {
  const C = loadPick();
  const out = plain(C.taxAutoTargets([CO()], opt({ id:'c1' })));
  assert.deepEqual(out, ['1234567890']);
});

test('★ 이알피에 이미 들어 있으면 안 건드린다 — 서버를 읽지도 않는다', () => {
  const C = loadPick();
  const out = plain(C.taxAutoTargets([CO()],
    opt({ id:'c1', taxInvoiceEmail:'bill@gana.co.kr', taxInvoiceContact:'김경리' })));
  assert.deepEqual(out, [], '★ 이미 같은 값이 있는데 또 쓰면 요금만 는다');
});

test('한쪽만 비어 있으면 그 회사는 고른다', () => {
  const C = loadPick();
  const out = plain(C.taxAutoTargets([CO()], opt({ id:'c1', taxInvoiceEmail:'bill@gana.co.kr' })));
  assert.deepEqual(out, ['1234567890'], '담당자가 비어 있으니 채울 것이 남았다');
});

test('★ 업체관리에 없는 회사는 건너뛴다 — 쓸 자리가 없다', () => {
  const C = loadPick();
  assert.deepEqual(plain(C.taxAutoTargets([CO()], opt(null))), []);
});

test('등록증에 값이 없으면 고르지 않는다', () => {
  const C = loadPick();
  const out = plain(C.taxAutoTargets([CO({ taxInvoiceEmail:'', taxInvoiceContact:'' })], opt({ id:'c1' })));
  assert.deepEqual(out, []);
});

/* ⚠ 위 검사만으로는 «값이 없을 때 일찍 빠지는 것»을 못 지킨다 — 뒤쪽 판정에도 걸리기
   때문이다. 그런데 일찍 안 빠지면 회사 4,000곳마다 업체 찾기(ErpMatch.match)가 돌고,
   그게 자료가 바뀔 때마다 되풀이된다. 「몇 번 뒤졌나」로 못 박는다. */
test('★ 값이 없는 회사는 업체 찾기조차 안 한다 — 4,000곳을 매번 뒤지면 화면이 멈춘다', () => {
  const C = loadPick();
  let looked = 0;
  const o = opt({ id:'c1' });
  o.match = () => { looked++; return { id:'c1' }; };
  C.taxAutoTargets([CO({ taxInvoiceEmail:'', taxInvoiceContact:'' }),
                    CO({ key:'k2', taxInvoiceEmail:'', taxInvoiceContact:'' })], o);
  assert.equal(looked, 0, '★ 값도 없는 회사를 업체관리에서 찾고 있다 — 헛일이 4,000번 돈다');
});

test('★ 한 판에 같은 회사를 두 번 하지 않는다 — 되풀이 쓰기가 그대로 요금이다', () => {
  const C = loadPick();
  const out = plain(C.taxAutoTargets([CO()], opt({ id:'c1' }, { '1234567890': 1 })));
  assert.deepEqual(out, []);
});

/* ══════ ⑦ 조용히 ══════ */
/* ⚠ 그냥 /quiet/ 를 찾으면 「const quiet = false」로 바꿔도 통과한다 — 글자는 남아 있다.
   조용함이 «부르는 쪽에서» 정해지는지, 그리고 말을 거는 자리마다 그것을 보는지 본다. */
test('★ 저절로 하는 일은 조용하다 — 채울 것이 없다고 말을 걸지 않는다', () => {
  const b = code(fnBody('pushTaxInvoiceToErp'));
  assert.match(b, /const quiet = !!\(opt && opt\.quiet\)/,
    '★ 조용할지는 «부르는 쪽»이 정한다 — 안에서 못 박으면 단추도 조용해지거나 그 반대가 된다');
  const says = b.match(/toast\(/g) || [];
  const guarded = b.match(/if\(!quiet\)\s*toast\(/g) || [];
  assert.ok(says.length - guarded.length <= 1,
    '★ 말을 거는 자리 ' + says.length + '곳 중 ' + guarded.length + '곳만 막혀 있다 —'
    + ' 저절로 도는 것이 「채울 곳이 없습니다」를 띄우면 화면마다 알림이 뜬다');
});

test('★ 자동 채우기는 로그인·연결이 되었을 때만 돈다', () => {
  const b = code(fnBody('taxAutoSoon')) + code(fnBody('taxAutoRun'));
  assert.match(b, /Store\.mode\s*!==\s*'firebase'|Store\.mode\s*===\s*'firebase'/,
    '★ 서버에 안 붙은 채로 돌면 헛일이고, 저장도 안 된다');
});
