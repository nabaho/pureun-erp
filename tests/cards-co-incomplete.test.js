'use strict';
/* 기업 상세 — 「정보부족」 거르기 (대표 지시 2026-08-24, 보강 검토 3순위)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 문제였나
     회사가 4,143곳인데 «어디에 무엇이 빠졌는지» 볼 방법이 없었다. 명함 목록에는
     「정보부족」 단추가 진작 있는데(state.onlyIncomplete — 전화나 이메일이 없는 명함)
     기업 상세에는 없었다. 그래서 «어디부터 채워야 하는지»를 정할 수가 없었다.

   ■ 무엇을 「부족」으로 보나 — 계약서·신고서를 쓸 때 필요한 셋
     대표자 · 소재지 · 대표번호. 하나라도 비면 부족이다(명함 규칙과 같은 결 —
     명함도 「전화 또는 이메일이 없으면」 부족으로 본다).
     ⚠ 사업자번호는 «일부러 뺐다». 2순위에서 「🔢 번호 없음」 토글을 따로 만들었고,
       여기 넣으면 두 토글이 겹쳐 무엇을 보는 것인지 흐려진다. 둘은 다른 질문이다 —
       번호 없음은 「사진첩 정보를 못 받는 회사」, 정보부족은 「서류를 못 쓰는 회사」.

   ■ 값을 어디서 찾나
     상세 패널이 쓰는 규칙(o.extra[f] || o[f])을 «그대로» 쓴다. 따로 만들면 화면에는
     보이는데 부족으로 세거나, 그 반대가 된다 — 그 어긋남은 아무도 눈치 못 챈다.

   ★ 여기서 못 박는 것
     ① 셋 중 하나라도 비면 부족이다
     ② 값 찾는 규칙이 상세 패널과 «같은 함수»다 (두 벌이면 어긋난다)
     ③ 사업자번호는 여기서 안 본다 (2순위 토글과 겹치지 않게)
     ④ 폴더·검색과 함께 좁혀진다 — 덮어쓰지 않는다
     ⑤ 0곳이면 단추가 안 보인다
     ⑥ 무엇이 빠졌는지 «줄에서» 알려 준다 — 세기만 하면 고칠 수가 없다
     ⑦ 새 Firebase 쓰기가 없다
   실행: node --test tests/cards-co-incomplete.test.js */
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
function constLine(name){
  const m = src.match(new RegExp('^const ' + name + ' = [\\s\\S]*?\\];', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0];
}
const plain = v => JSON.parse(JSON.stringify(v));

/* 부족 판정만 떼어 돌린다 */
function loadMiss(){
  const ctx = { console, Object, Array, String };
  vm.createContext(ctx);
  vm.runInContext(constLine('CO_CORE').replace(/^const /, 'var ') + '\n'
    + fnBody('coVal') + '\n' + fnBody('coMissing'), ctx);
  return ctx;
}
/* 거르기 */
function loadFilter(state, cos){
  const ctx = { console, Object, Array, String, Number,
    state: Object.assign({ coFolder:'', coFTab:'', coTag:'', coQ:'', coColFilter:{},
                           coOnlyClosed:false, coOnlyNoBiz:false, coOnlyIncomplete:false }, state||{}),
    coList: () => cos || [],
    coFTabsOf: () => [], coTagsOf: o => (o && o.tags) || [],
    /* 2026-08-30: 줄이 «보여줄 이름»을 쓴다 (상호 못 읽은 회사도 남으므로) */
    coDisplayName: o => (o && String(o.name||'').trim()) || (o && o.bizno) || '',
    CO_SORT: { type: o => (o.erp && o.erp.type) || '' },
    coSorted: l => l };
  vm.createContext(ctx);
  vm.runInContext(constLine('CO_CORE').replace(/^const /, 'var ') + '\n'
    + fnBody('coVal') + '\n' + fnBody('coMissing') + '\n'
    + fnBody('coCares') + '\n' + fnBody('coLacks') + '\n'
    + fnBody('coFilteredList') + '\n' + fnBody('coVisible') + '\n'
    + fnBody('coIncompleteCount'), ctx);
  return ctx;
}
/* 기본은 «우리가 일하는 회사» — 푸른이알피 거래처. 그래야 정보부족으로 센다. */
const co = (key, o) => Object.assign({ key, name:'회사'+key, bizno:'', cards:[], docs:0,
  erp:{ status:'유지' }, tags:[], extra:{} }, o||{});
const FULL = { ceo:'홍길동', address:'충남 천안', companyTel:'041-556-0035' };

/* ══════ ① 셋 중 하나라도 비면 부족 ══════ */

test('★ 셋이 다 있으면 부족하지 않다', () => {
  assert.deepEqual(plain(loadMiss().coMissing(co('a', FULL))), []);
});

test('★ 하나씩 빠질 때마다 그 이름을 알려 준다', () => {
  const C = loadMiss();
  assert.deepEqual(plain(C.coMissing(co('a', { address:'충남', companyTel:'041' }))), ['대표자']);
  assert.deepEqual(plain(C.coMissing(co('a', { ceo:'홍', companyTel:'041' }))), ['소재지']);
  assert.deepEqual(plain(C.coMissing(co('a', { ceo:'홍', address:'충남' }))), ['대표번호']);
});

test('셋 다 없으면 셋 다 알려 준다', () => {
  assert.deepEqual(plain(loadMiss().coMissing(co('a'))), ['대표자','소재지','대표번호']);
});

test('빈칸·공백만 든 값은 «없는 것»으로 본다', () => {
  const C = loadMiss();
  assert.deepEqual(plain(C.coMissing(co('a', { ceo:'   ', address:'충남', companyTel:'041' }))), ['대표자']);
});

/* ══════ ② 값 찾는 규칙이 상세 패널과 같다 ══════ */

test('★ 상세 패널이 «같은 함수»(coVal)로 값을 찾는다 — 두 벌이면 어긋난다', () => {
  /* ⚠ 2026-08-31: 기업정보 접기/펼치기(대표 지시)로 값 찾는 자리가 coDetailPanelHtml
     에서 coInfoBoxHtml·coInfoSummary 로 옮겨 갔다 — 규칙은 그대로다. */
  assert.match(fnBody('coInfoBoxHtml'), /coVal\(/,
    '★ 상세 패널이 제 규칙을 따로 쓰면, 화면엔 보이는데 부족으로 세는 일이 생긴다');
  assert.match(fnBody('coInfoSummary'), /coVal\(/, '접힌 요약도 같은 함수로 값을 찾아야 한다');
});

test('★ 서식에서 읽은 값(extra)도 «있는 것»으로 센다', () => {
  const C = loadMiss();
  /* 사진첩이 보낸 값은 o.extra 에 들어온다 — 그것도 채워진 것이다 */
  assert.deepEqual(plain(C.coMissing(co('a', { extra: FULL }))), []);
});

test('extra 가 o 보다 앞선다 — 상세 패널과 같은 차례', () => {
  const C = loadMiss();
  assert.equal(C.coVal(co('a', { ceo:'옛값', extra:{ ceo:'새값' } }), 'ceo'), '새값');
});

test('★ 서식에 «공백만» 든 칸은 등록증 값을 가리지 않는다', () => {
  /* 2026-08-24(4순위를 만들다 드러났다): 예전에는 다듬기 «전» 값으로 골랐다.
     '   ' 은 참이라 서식 쪽이 이겨 버렸고, 등록증에서 온 멀쩡한 대표자가 화면에서
     사라진 채 「정보부족」으로도 세어졌다. */
  const C = loadMiss();
  assert.equal(C.coVal(co('a', { ceo:'나성환', extra:{ ceo:'   ' } }), 'ceo'), '나성환');
  assert.deepEqual(plain(C.coMissing(co('a', { ceo:'나성환', address:'충남', companyTel:'041',
    extra:{ ceo:'   ' } }))), [], '★ 값이 있는데도 부족으로 세면 채우러 갔다가 헛걸음한다');
});

/* ══════ ③ 사업자번호는 안 본다 ══════ */

test('★ 사업자번호가 없어도 셋이 차 있으면 «정보부족»이 아니다', () => {
  /* 번호는 2순위 「🔢 번호 없음」 토글이 맡는다 — 두 토글이 겹치면 뜻이 흐려진다 */
  const C = loadMiss();
  assert.deepEqual(plain(C.coMissing(co('n가나', Object.assign({ bizno:'' }, FULL)))), []);
});

test('부족 항목에 사업자번호가 안 들어간다', () => {
  assert.equal(constLine('CO_CORE').indexOf('bizno'), -1,
    '★ 사업자번호를 넣으면 「번호 없음」 토글과 겹친다');
});

/* ══════ ③-2 «우리가 일하는 회사»만 센다 ══════ */

test('★ 명함 한 장뿐인 회사는 「정보부족」으로 안 센다 — 4,140곳이 죄다 부족이 된다', () => {
  /* 표에서 빠진 것을 붉게 짚는 규칙과 «같은 잣대»다 (대표 화면 2026-08-13).
     거래처도 아니고 딱지도 없는 곳까지 세면, 정작 채워야 할 거래처가 묻힌다. */
  const cos = [ co('a', { erp:null, tags:[] }), co('b', {}) ];
  assert.equal(loadFilter({}, cos).coIncompleteCount(), 1);
});

test('사업 딱지가 붙은 회사는 거래처가 아니어도 센다', () => {
  const cos = [ co('a', { erp:null, tags:['장애인'] }) ];
  assert.equal(loadFilter({}, cos).coIncompleteCount(), 1);
});

test('★ 세는 잣대와 표에 붉게 짚는 잣대가 «같은 함수»다', () => {
  assert.match(fnBody('coListHtml'), /const care = coCares\(/,
    '★ 두 벌로 두면 「부족 3,900곳」이라 해 놓고 줄에는 아무것도 안 뜬다');
});

/* ══════ ④ 함께 좁혀진다 ══════ */

test('★ 정보부족만 골라 볼 수 있다', () => {
  const cos = [ co('a', FULL), co('b', { ceo:'홍' }), co('c', { extra: FULL }) ];
  const C = loadFilter({ coOnlyIncomplete:true }, cos);
  assert.deepEqual(C.coVisible().map(o=>o.key), ['b']);
});

test('꺼져 있으면 전부 보인다', () => {
  const cos = [ co('a', FULL), co('b', {}) ];
  assert.equal(loadFilter({}, cos).coVisible().length, 2);
});

test('★ 폴더와 «함께» 좁혀진다 — 덮어쓰지 않는다', () => {
  const cos = [ co('a', { folder:'f1' }), co('b', { folder:'f2' }),
                co('c', Object.assign({ folder:'f1' }, FULL)) ];
  const C = loadFilter({ coFolder:'f1', coOnlyIncomplete:true }, cos);
  assert.deepEqual(C.coVisible().map(o=>o.key), ['a']);
});

test('개수도 폴더 안에서만 센다', () => {
  const cos = [ co('a', { folder:'f1' }), co('b', { folder:'f2' }) ];
  assert.equal(loadFilter({ coFolder:'f1' }, cos).coIncompleteCount(), 1);
});

test('거르는 일은 coFilteredList 한 곳에만 둔다', () => {
  assert.match(fnBody('coFilteredList'), /coOnlyIncomplete/,
    '★ 딴 곳에서 거르면 화면마다 결과가 어긋난다');
});

/* ══════ ⑤ 옆줄 「할 일」에 뜬다 · 0곳이면 안 보인다 ══════
   ⚠ 2026-08-28 자리가 옮겨졌다 — 대표 지시 「기업상세 탭은 거래관계가 있었는지
     여부만 나누면 된다」. 탭 줄에 뜻이 둘(고르기·거르기)이라 서로의 수를 갉아먹었다.
     기능은 그대로고 자리만 옆줄(coFilterDefs)로 내렸다. */

/* 거르개 메뉴를 열어 「정보부족」 줄을 본다 (2026-08-31 — 옆줄에서 내려왔다) */
function drawTodo(lack, on){
  const box = { style:{}, innerHTML:"" };
  const ctx = { console, Object, Array, String, Number,
    esc: s => String(s==null?'':s),
    state: { coOnlyClosed:false, coOnlyNoBiz:false, coOnlyIncomplete:!!on, coOnlyUid:false, coPage:0 },
    coClosedCount: () => 0, coNoBizCount: () => 0,
    coIncompleteCount: () => lack, coUidCount: () => 0,
    closeFolderMenu(){}, renderCoAny(){}, setTimeout(){},
    document: { addEventListener(){} }, window: { innerWidth: 1600 },
    $: () => box };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coFilters'), ctx);
  vm.runInContext(fnBody('coFilterDefs'), ctx);
  /* 2026-09-03(4걸음): 메뉴가 배포 묶음을 «먼저 읽고» 그린다 — 이 검사는
     배포 기록을 안 보므로 빈 묶음을 바로 돌려주는 대역을 둔다. */
  ctx.loadCoBatches = cb => cb({});
  ctx._coBatches = {};
  vm.runInContext(fnBody('coSentKindRows'), ctx);
  vm.runInContext(fnBody('coFilterMenuPaint'), ctx);
  vm.runInContext(fnBody('openCoFilterMenu'), ctx);
  ctx.openCoFilterMenu({ preventDefault(){}, stopPropagation(){},
    currentTarget: { getBoundingClientRect: () => ({ left:100, bottom:200 }) } });
  return box.innerHTML;
}

test('★ 부족한 곳이 0이어도 «흐리게» 남는다 — 열 때마다 항목이 달라지면 못 찾는다', () => {
  /* ⚠ 옛 규칙을 일부러 뒤집었다. 옆줄(늘 보이는 자리)에서는 0곳이면 숨겼지만,
     메뉴는 열어야 보이는 자리라 항목이 사라지면 어디 있는지 못 찾는다. */
  const h = drawTodo(0, false);
  assert.ok(h.indexOf('정보부족') > 0, '메뉴에서 통째로 사라졌다');
  assert.match(h, /fmoff/, '0곳인데 흐리게 안 보인다');
});

test('부족한 곳이 있으면 뜨고 몇 곳인지 말한다', () => {
  const h = drawTodo(7, false);
  assert.ok(h.indexOf('정보부족') > 0, '줄이 없다');
  assert.ok(h.indexOf('7') > 0, '몇 곳인지 안 알려 준다');
  assert.match(h, /coOnlyIncomplete/, '눌러도 안 켜진다');
});

test('★ 탭 줄에는 도로 안 남아 있다 — 두 곳에서 같은 일을 하면 한쪽만 고쳐진다', () => {
  assert.equal(fnBody('coToolsHtml').indexOf('coOnlyIncomplete'), -1);
});

/* ══════ ⑥ 줄에서 «무엇이» 빠졌는지 ══════ */

/* ⚠ coListHtml 안에 coMissing( 이 «적혀 있는지» 보는 것으로는 모자란다.
     부르기만 하고 그 값을 안 쓰면 검사는 통과하는데 화면엔 아무것도 안 나온다
     (실제로 이 검사가 그렇게 새서 고쳤다 — 2026-08-24). 그러니 «그려서» 본다. */
function drawRow(o){
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    "const esc = s => String(s??'').replace(/[&<>\"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));",
    "var state = { coSel:{}, coColFilter:{}, coSort:{}, coTag:'' };",
    "function coArrow(){ return ''; }",
    "function coTagsOf(x){ return (x && x.tags) || []; }",
    "function coDisplayName(o){ return (o && String(o.name||'').trim()) || (o && o.bizno) || ''; }",
    "function coDocIcons(){ return ''; }",
    "function coMgrCell(){ return ''; }",
    "function coSizeSelHtml(){ return ''; }",
    "function coPagerHtml(){ return ''; }",
    "function coOrphanBarHtml(){ return ''; }",
    /* 2026-08-30: 도구줄의 「자주 쓰는 폴더」 단추 — 이 검사는 안 본다 */
    "function coQuickFolderBtns(){ return ''; }"
  ].join('\n'), ctx);
  /* 부족 판정은 «진짜» 것을 쓴다 — 스텁을 쓰면 아무것도 못 잡는다 */
  vm.runInContext(constLine('CO_CORE').replace(/^const /, 'var ') + '\n'
    + fnBody('coVal') + '\n' + fnBody('coMissing') + '\n' + fnBody('coCares'), ctx);
  vm.runInContext(src.slice(src.indexOf('function coListHtml(info){'),
                            src.indexOf('function coDocsHtml(')), ctx);
  const rows = [Object.assign({ tags:[] }, o)];
  return ctx.coListHtml({ rows, total:1, page:0, pages:1, size:200, from:1, to:1 });
}

test('★ 회사 줄이 무엇이 빠졌는지 «화면에» 알려 준다 — 세기만 하면 고칠 수가 없다', () => {
  const h = drawRow(co('a', { ceo:'홍길동' }));
  assert.ok(h.indexOf('소재지') > 0, '★ 무엇이 빠졌는지 안 보이면 회사를 하나씩 열어 봐야 한다');
  assert.ok(h.indexOf('대표번호') > 0, '★ 빠진 칸 하나만 알리고 나머지는 숨기면 두 번 일한다');
});

test('빠진 것이 없는 회사 줄에는 그 표시가 안 붙는다', () => {
  const h = drawRow(co('a', FULL));
  assert.equal(h.indexOf('소재지'), -1, '다 채운 회사에 부족 표시가 붙으면 표가 시끄러워진다');
});

/* ══════ ⑧ 켜지고 꺼진다 (옆줄) ══════ */

/* onclick 을 «실제로 실행»해 본다 — 글자만 맞춰 보면 =true 로 바꿔 놔도 못 잡는다 */
function clickIncomplete(h, state){
  /* 메뉴 항목이라 앞에 「closeFolderMenu();」가 붙는다 — 누르는 흉내는 그대로 낸다 */
  const m = h.match(/onclick="([^"]*coOnlyIncomplete[^"]*)"/);
  assert.ok(m, '정보부족 줄에 누를 코드가 없다');
  const cx = { state, renderCoAny: () => {}, closeFolderMenu: () => {} };
  vm.createContext(cx);
  vm.runInContext(m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"'), cx);
  return cx.state;
}

test('★ 한 번 더 누르면 «꺼진다» — 켜지기만 하면 전체로 못 돌아온다', () => {
  const st = { coOnlyIncomplete:true, coPage:0 };
  clickIncomplete(drawTodo(7, true), st);
  assert.equal(st.coOnlyIncomplete, false,
    '★ 꺼지지 않으면 다시 전체를 보려고 화면을 새로 고쳐야 한다');
});

test('꺼져 있을 때 누르면 켜진다', () => {
  const st = { coOnlyIncomplete:false, coPage:0 };
  clickIncomplete(drawTodo(7, false), st);
  assert.equal(st.coOnlyIncomplete, true);
});

test('★ 거르면 «첫 쪽»으로 돌아온다 — 5쪽에서 걸면 빈 화면이 뜬다', () => {
  const st = { coOnlyIncomplete:false, coPage:5 };
  clickIncomplete(drawTodo(7, false), st);
  assert.equal(st.coPage, 0,
    '★ 쪽수를 그대로 두면 결과가 3쪽뿐일 때 아무것도 없는 화면을 본다');
});

test('★ 처음 들어오면 «꺼져» 있다 — 전체가 먼저 보여야 한다', () => {
  const m = src.match(/coOnlyIncomplete\s*:\s*(true|false)/);
  assert.ok(m, 'state 에 coOnlyIncomplete 첫 값이 없다');
  assert.equal(m[1], 'false',
    '★ 켜진 채로 시작하면 회사가 사라진 줄 알고 놀란다');
});

/* ══════ ⑦ 새 쓰기가 없다 ══════ */

test('★ 화면만 읽는다 — 서버에 쓰지 않는다', () => {
  for (const n of ['coMissing', 'coVal', 'coIncompleteCount']) {
    const fn = fnBody(n);
    assert.equal(/db\.ref\(|Store\.db|firebase\.database\(|Store\.put\(/.test(fn), false,
      '★ ' + n + ' 이 서버에 쓴다 — 세는 일이 값을 바꾸면 안 된다');
  }
});
