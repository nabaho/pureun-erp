'use strict';
/* ══════ 기업 상세의 「할 일」이 화면을 조용히 걸러 놓던 것 (대표 보고 2026-08-30) ══════
   대표님: 「메디움 등 사업장 업체관리로 이동시켰는데 이상하게 나온다 이동 안 하고
   남아있다. 올드밀 충주시설관리공단은 계약해지사업장으로 보냈는데 안 간다」

   ■ 옮기기는 «되고 있었다»
     옆줄 수가 어제 「업체관리 180 · 계약해지 4」에서 「167 · 17」로 바뀌어 있었다.
     안 간 것이 아니라 «안 보인 것»이다.

   ■ 까닭 둘
     ① 옆줄 「할 일」(종료·번호 없음·정보부족·고유번호증)을 켜 두면, 폴더를 눌러도
        그 조건이 «안 풀린다». 「2. 계약해지사업장」을 눌러도 「그 폴더 ∩ 번호 없음」만
        남아 텅 빈다 — 옮긴 회사가 안 간 것처럼 보인다.
        게다가 켜져 있다는 표시가 «옆줄 한 줄이 진해지는 것»뿐이라 눈에 안 걸린다.
     ② 할 일 수를 «이미 걸러진 목록»에서 셌다. 그래서 하나를 켜면 나머지 수까지 그 수로
        붙는다 — 대표님 화면의 「종료 5 · 번호 없음 5 · 정보부족 5」다.
        2026-08-28 에 탭 줄에서 똑같은 것을 고쳤는데(「거래처 16·전체 16·정보부족 16」)
        옆줄로 내리면서 그 결함이 따라왔다.

   ★ 여기서 못 박는 것
     ① 걸린 할 일은 «목록 위 띠»로 늘 보이고 ✕ 로 풀린다
     ② 할 일 수는 «다른 할 일을 뺀» 목록에서 센다 — 서로의 수를 갉아먹지 않는다
     ③ 옮기고 나면 «어느 폴더로» 옮겼는지 이름으로 말한다 */
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
/* ⚠ 주석을 걷어 내고 본다 — 안 걷으면 «내가 쓴 설명»을 코드로 착각해 통과한다 */
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function topConst(name) {
  const at = SRC.search(new RegExp('const ' + name + '\\s*='));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const end = SRC.indexOf('};', at);
  assert.ok(end > at, name + ' 의 끝을 찾지 못했다');
  return SRC.slice(at, end + 2).replace(/^const /, 'var ');
}

/* 회사 넷: 번호없음+종료 / 번호없음만 / 종료만 / 아무것도 아님 */
const COS = [
  { key: 'n메디움', name: '메디움', bizno: '', erp: { left: true }, folder: '' },
  { key: 'n올드밀', name: '올드밀', bizno: '', erp: null, folder: '' },
  { key: '1112233333', name: '가나', bizno: '111-22-33333', erp: { left: true }, folder: '' },
  { key: '4445566666', name: '다라', bizno: '444-55-66666', erp: null, folder: '' }
];

function ctx(extra) {
  const state = Object.assign({
    coQ: '', coFolder: '', coFTab: '', coTag: '', coColFilter: {},
    coOnlyCares: false, coOnlyClosed: false, coOnlyNoBiz: false,
    coOnlyIncomplete: false, coOnlyUid: false, coPage: 3
  }, extra || {});
  const b = {
    state, rendered: 0, _list: COS,
    coList: () => b._list,
    coCares: o => !!o.erp,
    coLacks: () => false,
    coIsUid: () => false,
    coFTabsOf: () => [],
    coTagsOf: () => [],
    CO_SORT: {},
    ErpMatch: { ready: true },
    renderCoAny() { b.rendered++; },
    render() { b.rendered++; },
    closePcDetail() {},
    esc: s => String(s == null ? '' : s)
  };
  vm.createContext(b);
  vm.runInContext(fn('coFilteredList'), b);
  return b;
}

/* ── ① 할 일 수가 서로를 갉아먹지 않는다 ─────────────────────────── */
function counts(extra) {
  const b = ctx(extra);
  ['coClosedCount', 'coNoBizCount'].forEach(n => vm.runInContext(fn(n), b));
  return {
    closed: vm.runInContext('coClosedCount()', b),
    nobiz: vm.runInContext('coNoBizCount()', b)
  };
}

test('아무것도 안 켜면 각자 제 수를 센다', () => {
  const c = counts({});
  assert.equal(c.closed, 2, '종료는 둘이다');
  assert.equal(c.nobiz, 2, '번호 없음은 둘이다');
});

test('★ 「번호 없음」을 켜도 종료 수가 «그 수로 붙지» 않는다', () => {
  /* 대표님 화면의 「종료 5 · 번호 없음 5 · 정보부족 5」가 이것이다 */
  const c = counts({ coOnlyNoBiz: true });
  assert.equal(c.nobiz, 2, '번호 없음은 제 수 그대로여야 한다');
  assert.equal(c.closed, 2,
    '★ 종료 수가 번호없음 목록 안에서 세어졌다 — 수가 서로 붙어 「데이터가 이상하다」로 보인다');
});

test('★ 「종료」를 켜도 번호 없음 수가 안 붙는다', () => {
  const c = counts({ coOnlyClosed: true });
  assert.equal(c.closed, 2);
  assert.equal(c.nobiz, 2);
});

test('폴더·검색은 그대로 지킨다 — 그 안에서 셀 뜻이 있다', () => {
  const b = ctx({ coQ: '메디움' });
  ['coClosedCount', 'coNoBizCount'].forEach(n => vm.runInContext(fn(n), b));
  assert.equal(vm.runInContext('coNoBizCount()', b), 1,
    '검색까지 무시하면 「지금 보는 것 안에서 몇 곳인가」를 알 수 없다');
});

/* ── ② 걸린 할 일이 «띠»로 보이고 ✕ 로 풀린다 ────────────────────── */
test('아무 할 일도 안 켜면 띠가 없다', () => {
  const b = ctx({});
  vm.runInContext(topConst('CO_TODO_LABEL'), b);
  vm.runInContext(fn('condChipHtml'), b);
  vm.runInContext(fn('coTodoChipsHtml'), b);
  assert.equal(vm.runInContext('coTodoChipsHtml()', b), '',
    '조건이 없는데 띠가 뜨면 눈이 그것을 배경으로 배운다');
});

test('★ 켠 할 일만 띠에 뜨고 ✕ 로 풀 길이 있다', () => {
  const b = ctx({ coOnlyNoBiz: true });
  vm.runInContext(topConst('CO_TODO_LABEL'), b);
  vm.runInContext(fn('condChipHtml'), b);
  vm.runInContext(fn('coTodoChipsHtml'), b);
  const h = vm.runInContext('coTodoChipsHtml()', b);
  assert.ok(h.includes('번호 없음'), '켠 조건이 띠에 없다 — 왜 몇 곳만 나오는지 알 길이 없다');
  assert.ok(!h.includes('정보부족'), '안 켠 조건까지 띠에 나왔다');
  assert.ok(h.includes("clearCoTodo('coOnlyNoBiz')"), '✕ 로 풀 길이 없다');
});

test('둘을 켜면 둘 다 뜬다', () => {
  const b = ctx({ coOnlyNoBiz: true, coOnlyClosed: true });
  vm.runInContext(topConst('CO_TODO_LABEL'), b);
  vm.runInContext(fn('condChipHtml'), b);
  vm.runInContext(fn('coTodoChipsHtml'), b);
  const h = vm.runInContext('coTodoChipsHtml()', b);
  assert.ok(h.includes('번호 없음') && h.includes('종료'), '둘을 켰는데 하나만 보인다');
});

test('★ clearCoTodo 는 «푸는 쪽»만 한다', () => {
  const b = ctx({ coOnlyUid: false });
  vm.runInContext(fn('clearCoTodo'), b);
  vm.runInContext("clearCoTodo('coOnlyUid')", b);
  assert.equal(b.state.coOnlyUid, false, '✕ 가 조건을 «켰다»');
  assert.equal(b.state.coPage, 0, '첫 쪽으로 안 갔다');
});

test('★ 띠를 목록 «위»에 실제로 내보낸다', () => {
  const src = bare(fn('renderCoPage'));
  assert.ok(/coTodoChipsHtml\(\)/.test(src), '★ 띠를 안 그린다 — 만들어 놓고 화면에 안 붙였다');
});

test('★ 찾은 것이 0곳이어도 띠가 뜬다 — 그때가 가장 알아야 할 때다', () => {
  /* coListHtml 은 0곳이면 「회사를 찾지 못했습니다」로 먼저 돌아나간다.
     띠를 그 안에 두면 텅 빈 화면에서 왜 비었는지 알 길이 없어진다. */
  const inner = bare(fn('coListHtml'));
  assert.ok(!/coTodoChipsHtml\(\)/.test(inner),
    '★ 띠가 coListHtml 안에 있다 — 0곳일 때 안 뜬다');
  const outer = bare(fn('renderCoPage'));
  const chips = outer.indexOf('coTodoChipsHtml()');
  const list = outer.indexOf('coListHtml(');
  assert.ok(chips >= 0 && list >= 0 && chips < list,
    '★ 띠가 목록보다 아래에 온다');
});

/* ── ③ 할 일 목록과 딱지 이름표가 «어긋나지 않는다» ──────────────── */
test('★ 옆줄 할 일 넷이 모두 딱지에 있다', () => {
  const side = bare(fn('coTodoSideHtml'));
  const keys = [...side.matchAll(/k:\s*'(coOnly[A-Za-z]+)'/g)].map(m => m[1]);
  assert.ok(keys.length >= 4, '할 일을 못 찾았다 (' + keys.length + '개)');
  const labels = topConst('CO_TODO_LABEL');
  keys.forEach(k => {
    assert.ok(labels.includes(k + ':'),
      '★ ' + k + ' 은(는) 켤 수 있는데 딱지에 없다 — 걸려도 아무 말이 없다');
  });
});

/* ── ④ 옮긴 뒤에 «어디로» 옮겼는지 말한다 ───────────────────────── */
test('★ 옮기기 알림이 폴더 이름을 말한다', () => {
  const src = bare(fn('coMoveSelTo'));
  /* ⚠ 앞쪽에 «실패» 알림이 따로 있다 — 첫 toast 를 잡으면 엉뚱한 것을 본다 */
  const at = src.lastIndexOf('toast(');
  assert.ok(at >= 0, '알림을 못 찾았다');
  /* 알림 줄과 그 앞에서 이름을 꺼내 오는 줄까지 본다 — 한 줄에 다 넣을 까닭은 없다 */
  const seg = src.slice(Math.max(0, src.lastIndexOf('\n', at - 200)), src.indexOf('\n', at));
  assert.ok(/_coFolders/.test(seg),
    '★ 「N곳을 옮겼습니다」로만 말한다 — 어디로 갔는지 몰라 옮겨졌는지 확인할 길이 없다');
  assert.ok(/폴더/.test(seg), '알림에 폴더라는 말이 없다');
});
