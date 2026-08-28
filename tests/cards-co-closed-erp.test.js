'use strict';
/* 기업 상세 — 푸른이알피 종료 업체를 자동으로 「종료」로 보여준다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「푸른이알피에서 계약종료등 관련 되어 있는 것들 찾아서
   만약 계약종료가 되어 있으면 종료로 모두 분류해서 자동으로 연동될 수 있게 해달라」

   ■ 조사해서 알아낸 것
     푸른이알피가 업체를 종료 처리할 때 쓰는 값은 «하나»다 — companies[].status
     ='closed' (functions/index.js 가 아니라 pu-erp.html confirmCloseCompany 가 쓴다).
     기업정보함(pu-cards.html)의 ErpMatch 가 이미 이 값을 읽어 회사마다
     .left(종료 여부) 를 계산해 메모리에 갖고 있다 — «새로 받아올 데이터가 없다».

     그런데 기업 상세 화면은 이 값을 완전히 무시했다. coListBuild() 가 o.erp 에
     통째로 담아 두는데도(o.erp.left), 정렬·거르기·화면 어디에도 안 썼다.
     명함 목록에는 이미 같은 배지(🚪, class="mgq")가 있다 — 그 모양을 그대로 쓴다.

   ■ 왜 폴더로 자동 옮기지 않는가
     회사 폴더(_coFolders)는 100% 대표가 손으로 만드는 자리다. 여기에 자동 쓰기를
     넣으면 회사 전체가 보는 자리에 매번 대량 쓰기가 나간다 — 2026-08-16 에 겪은
     5,000건 오류 사고가 이 패턴(회사마다 Store.put)이었다. 그래서 «새 쓰기 없이»
     이미 불러온 데이터로 화면만 그린다 — 매번 자동으로 반영되고 비용이 안 는다.

   ★ 여기서 못 박는 것
     ① 종료 배지가 명함 목록과 «같은 모양·같은 문구»다 (class="mgq", 🚪, 같은 title)
     ② 거르는 일은 coFilteredList 한 곳에만 둔다 — 새 거르개를 딴 데 만들지 않는다
     ③ 종료 개수(토글의 N)는 토글 자신을 껐다 켰다 해도 안 흔들린다
     ④ ERP 미연동 회사(o.erp 없음)는 종료로 안 몰린다 — 정보가 없을 뿐이다
     ⑤ 종료 토글을 켜면 폴더·태그·검색과 «함께» 좁혀진다 (덮어쓰지 않는다)
     ⑥ 새 Firebase 쓰기가 없다 — 화면만 읽는다
   실행: node --test tests/cards-co-closed-erp.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

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
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const co = (key, o) => Object.assign({ key, name: '회사' + key, cards: [], docs: 0, erp: null }, o || {});

function loadFilter(state, cos){
  const ctx = { console, Object, Array, String, Number,
    state: Object.assign({ coFolder:'', coFTab:'', coTag:'', coQ:'', coColFilter:{}, coOnlyClosed:false }, state || {}),
    coList: () => cos || [],
    coFTabsOf: () => [], coTagsOf: () => [],
    CO_SORT: { type: o => (o.erp && o.erp.type) || '' },
    coSorted: list => list };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coFilteredList') + '\n' + fnBody('coVisible') + '\n' + fnBody('coClosedCount'), ctx);
  return ctx;
}

/* ⚠ coClosedCount 는 「종료 토글 자신을 빼고 센다」가 «아니다» — 마지막에 붙이는
   .filter(erp.left) 가 이미 종료만 남기므로, coOnlyClosed 가 켜져 있어 한 번 더
   걸려도 같은 조건을 두 번 거는 것일 뿐 결과가 안 바뀐다(뺄셈이 필요 없는 경우).
   그래서 여기서 못 박는 것은 «따로 뺄 필요가 없다는 사실 자체»다. */

const COS = [
  co('a', { erp: { type:'자문', status:'active', left:false } }),
  co('b', { erp: { type:'급여', status:'closed', left:true } }),
  co('c', { erp: { type:'노조', status:'closed', left:true } }),
  co('d', { erp: null }),                                          // ERP 미연동
  co('e', { erp: { type:'컨설팅', status:'active', left:false } })
];

/* ══════ ① 배지 모양 — 명함 목록과 같다 ══════ */

test('★ 종료 배지가 명함 목록과 같은 모양(class="mgq")·같은 문구다', () => {
  const cardBadge = src.match(/<span class="mgq"[^>]*>🚪<\/span>/);
  assert.ok(cardBadge, '명함 목록의 배지를 못 찾았다');
  const coDesktop = fnBody('coListHtml');
  const coMobile = fnBody('renderCoMobileList');
  for (const [name, fn] of [['데스크톱 표', coDesktop], ['폰 목록', coMobile]]) {
    assert.match(fn, /class="mgq"[^>]*>🚪</, name + '에 종료 배지가 없다');
    assert.match(fn, /업체관리에서 종료·해지·폐업으로 표시된 거래처/,
      name + '의 배지 문구가 명함 목록과 다르다');
  }
});

test('배지는 o.erp.left 를 그대로 본다 — 새 판정을 만들지 않는다', () => {
  for (const fn of [fnBody('coListHtml'), fnBody('renderCoMobileList')]) {
    assert.match(fn, /o\.erp\s*&&\s*o\.erp\.left/, '이미 있는 ErpMatch 판정을 안 쓴다');
  }
});

/* ══════ ② 거르는 일은 coFilteredList 한 곳뿐 ══════ */

test('★ 종료 거르기가 coFilteredList 안에 있다', () => {
  assert.match(fnBody('coFilteredList'), /coOnlyClosed/,
    '★ 딴 곳에서 거르면 두 벌이 되어 화면마다 결과가 어긋난다');
});

test('★ coVisible 이 실제로 종료만 남긴다', () => {
  const C = loadFilter({ coOnlyClosed: true }, COS);
  assert.deepEqual(C.coVisible().map(o=>o.key), ['b','c']);
});

test('꺼져 있으면 전부 보인다', () => {
  const C = loadFilter({ coOnlyClosed: false }, COS);
  assert.deepEqual(C.coVisible().map(o=>o.key), ['a','b','c','d','e']);
});

/* ══════ ③ 개수는 토글 자신에 안 흔들린다 ══════ */

test('★ 종료 개수가 토글을 켜도 꺼도 같다', () => {
  const off = loadFilter({ coOnlyClosed: false }, COS).coClosedCount();
  const on  = loadFilter({ coOnlyClosed: true  }, COS).coClosedCount();
  assert.equal(off, 2, '꺼진 상태에서 개수가 틀리다');
  assert.equal(on, 2, '★ 켜면 개수가 스스로에 걸려 줄어든다 — 자기 자신은 빼고 세야 한다');
});

test('폴더를 좁히면 그 안에서만 센다', () => {
  const cos = [co('a', { folder:'f1', erp:{left:true} }), co('b', { folder:'f2', erp:{left:true} })];
  const C = loadFilter({ coFolder:'f1' }, cos);
  assert.equal(C.coClosedCount(), 1);
});

/* ══════ ④ ERP 미연동은 종료가 아니다 ══════ */

test('★ ERP 에 없는 회사는 종료로 안 몰린다 — 정보가 없을 뿐이다', () => {
  const C = loadFilter({ coOnlyClosed: true }, COS);
  assert.ok(C.coVisible().every(o=>o.key!=='d'), 'ERP 미연동 회사가 종료에 섞였다');
});

test('컨설팅(auto 등록) 유형도 left 값 그대로 본다 — 유형으로 따로 안 가린다', () => {
  const cos = [co('e', { erp:{ type:'컨설팅', left:true } })];
  const C = loadFilter({ coOnlyClosed: true }, cos);
  assert.deepEqual(C.coVisible().map(o=>o.key), ['e']);
});

/* ══════ ⑤ 다른 거르기와 함께 좁혀진다 ══════ */

test('★ 종료 토글이 폴더·검색과 함께 좁혀진다 — 덮어쓰지 않는다', () => {
  const cos = [
    co('a', { folder:'f1', erp:{left:true} }),
    co('b', { folder:'f2', erp:{left:true} }),
    co('c', { folder:'f1', erp:{left:false} })
  ];
  const C = loadFilter({ coFolder:'f1', coOnlyClosed:true }, cos);
  assert.deepEqual(C.coVisible().map(o=>o.key), ['a']);
});

/* ══════ 화면에 걸린 단추 ══════ */

test('★ 탭 줄에 종료 토글 단추가 있다', () => {
  /* 2026-08-26: 탭 칩과 도구가 갈라졌다 — 토글은 도구 쪽(coToolsHtml)에 있다.
     탭 줄에 «나온다»는 뜻은 그대로다: renderCoFTabsHtml 이 둘을 이어 붙인다. */
  const fn = fnBody('coToolsHtml');
  assert.match(fn, /coOnlyClosed/, '도구줄에서 토글을 안 켠다');
  assert.match(fn, /coClosedCount\(\)/, '개수를 안 보여 준다');
  assert.match(fn, /class="pctool/, '기존 토글 단추 모양(.pctool)을 안 쓴다');
});

test('종료가 0곳이면 단추가 안 보인다 — 늘 있는 회색 단추는 눌러볼 값이 없다', () => {
  const noClosed = COS.filter(o => !(o.erp && o.erp.left));   /* 종료 0곳으로 만든다 */
  const ctx = { console, Object, Array, String, esc,
    state: { coFolder:'f1', isAdmin:true, coOnlyClosed:false, coPageSize:100, coColFilter:{}, coQ:'' },
    _coFolders: { f1: { id:'f1', name:'업체관리' } },
    coList: () => noClosed, coFTabsOf: () => [], coTagsOf: () => [],
    CO_SORT: { type: () => '' }, coSorted: l => l,
    coSizeSelHtml: () => '<select class="copgsize"></select>',
    /* 2026-08-24(2순위): 탭 줄에 「번호 없음」 토글도 붙었다 — 여기서는 종료 단추만
       보므로 0곳으로 둔다(안 넣으면 renderCoFTabsHtml 이 던진다). */
    coNoBizCount: () => 0,
    /* 2026-08-24(3순위): 탭 줄에 「정보부족」 토글도 붙었다 — 이 검사들은 그 부분을
       안 보므로 0곳으로 둔다(안 넣으면 renderCoFTabsHtml 이 던진다). */
    coIncompleteCount: () => 0,
    /* 2026-08-27: 도구줄에 「🏢 거래처 / 🏢 전체」 두 칩이 붙었다 — 이 검사는 안 본다 */
    coScopeCounts: () => ({ cares: 0, all: 0 }),
    /* 2026-08-26: 도구줄에 「🏢 고유번호증」 단추도 붙었다 — 이 검사는 그 부분을
       안 보므로 0곳으로 둔다(안 넣으면 coToolsHtml 이 던진다). */
    coUidCount: () => 0,
    /* 2026-08-26: 도구줄이 「전체」에서도 나오게 갈라지면서, 개수 글귀도 이 줄에 붙었다.
       이 검사들은 그 글귀를 안 보므로 빈 대역을 준다(안 넣으면 coToolsHtml 이 던진다). */
    coPagerHtml: () => '', coPage: () => ({ page:0, pages:1, total:0, from:0, to:0 }),
  };
  vm.createContext(ctx);
  const a = '/* ══════ 폴더 안의 탭 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 폴더 안의 탭 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  vm.runInContext(src.slice(i, j) + '\n' + fnBody('coFilteredList') + '\n'
    + fnBody('coClosedCount') + '\n' + fnBody('coFTabChipsHtml') + '\n' + fnBody('coToolsHtml') + '\n' + fnBody('renderCoFTabsHtml'), ctx);
  const h = ctx.renderCoFTabsHtml();
  assert.equal(h.indexOf('🚪'), -1,
    '★ 0곳이어도 단추가 늘 보이면 무엇을 누르라는 건지 모른다');
});

/* ══════ ⑥ 새 Firebase 쓰기가 없다 ══════ */

test('★ 이 기능은 화면만 읽는다 — .set(·.update(·.push( 이 없다', () => {
  for (const n of ['coFilteredList', 'coClosedCount', 'renderCoFTabsHtml']) {
    const fn = fnBody(n);
    assert.equal(/\.set\(|\.update\(|\.push\(/.test(fn), false,
      '★ ' + n + ' 이 Firebase 에 쓴다 — 회사 전체가 보는 자리에 대량 쓰기가 나간다');
  }
});
