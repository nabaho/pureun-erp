/* 📤 「이 갈래를 못 받은 사업장만 보기」 — 4걸음 (대표 지시 2026-09-03)
   설계안이 말한 「이 구조가 공짜로 주는 것」이 이것이다 —
   배포를 «묶음»으로 남겨 두었으니, 지금 목록에서 그 묶음에 안 든 곳을 빼면 된다.

   ★ 지켜야 하는 것
     ① 회사 4,159곳의 기록을 통째로 읽지 않는다 — 묶음 몇 줄이면 된다.
     ② 계약해지(🚪)는 여기서도 뺀다 — 3걸음이 애초에 안 보낸 곳이다.
     ③ 묶음을 «아직 못 읽었으면» 안 거른다 — 빈 것으로 거르면 전부가 「안 받은 곳」이 된다.
     ④ 켜는 길과 «푸는 길»이 함께 있다.

     node --test tests/cards-co-not-sent.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
function load(extra) {
  const ctx = Object.assign({ console, DB_ROOT: 'pucards', state: {} }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(fnBody('coSentGotKeys') + '\n' + fnBody('coSentKindRows')
    + '\n' + fnBody('coPickNotSent'), ctx);
  return ctx;
}

const BATCHES = {
  B1: { kind: '근로계약서', name: '2026년 서식', keys: ['a', 'b'] },
  B2: { kind: '근로계약서', name: '개정판', keys: ['b', 'c'] },
  B3: { kind: '연차', name: '연차 안내', keys: ['a'] }
};

/* ── 받은 곳 세기 ── */

test('★ 같은 갈래의 «여러 묶음»을 합쳐서 본다 — 두 번에 나눠 보냈어도 받은 것은 받은 것이다', () => {
  const c = load();
  const got = c.coSentGotKeys(BATCHES, '근로계약서');
  assert.equal(Object.keys(got).sort().join(','), 'a,b,c');
});

test('★ 다른 갈래는 «안 섞는다» — 연차를 받았다고 근로계약서를 받은 것이 아니다', () => {
  const c = load();
  assert.equal(Object.keys(c.coSentGotKeys(BATCHES, '연차')).join(','), 'a');
  assert.equal(Object.keys(c.coSentGotKeys(BATCHES, '임금')).length, 0);
});

test('갈래를 안 주면 «아무도» 받은 것으로 안 친다 — 빈 갈래로 온 목록을 거르면 안 된다', () => {
  const c = load();
  assert.equal(Object.keys(c.coSentGotKeys(BATCHES, '')).length, 0);
  assert.equal(Object.keys(c.coSentGotKeys(BATCHES, null)).length, 0);
  assert.equal(Object.keys(c.coSentGotKeys(null, '연차')).length, 0);
});

/* ── 메뉴에 늘어놓기 ── */

test('★ «보낸 적 있는» 갈래만 메뉴에 뜬다 — 눌러도 아무 일이 없는 줄을 여섯 만들지 않는다', () => {
  const c = load();
  const rows = c.coSentKindRows(BATCHES);
  assert.equal(rows.length, 2, '배포한 것은 근로계약서·연차 둘뿐이다');
  assert.equal(rows.map(r => r.kind).join(','), '근로계약서,연차');
});

test('갈래마다 «몇 번 보냈고 몇 곳이 받았는지» 센다 — 같은 곳을 두 번 세지 않는다', () => {
  const c = load();
  const rows = c.coSentKindRows(BATCHES);
  const 근로 = rows.filter(r => r.kind === '근로계약서')[0];
  assert.equal(근로.묶음, 2);
  assert.equal(근로.받은곳, 3, 'b 가 두 묶음에 다 있어도 한 곳이다');
});

test('배포가 없으면 늘어놓을 것도 없다 — 「못 받은 곳」 줄이 아예 안 뜬다', () => {
  const c = load();
  assert.equal(c.coSentKindRows({}).length, 0);
  assert.equal(c.coSentKindRows(null).length, 0);
});

test('★★ 갈래가 «없는» 옛 묶음은 셈에도 메뉴에도 안 든다 — 어느 서식인지 알 수 없다', () => {
  /* 지금 코드는 갈래를 반드시 적지만(sentKindOf), 밖에서 들어온 줄이나 옛 줄에는
     갈래가 없을 수 있다. 그런 줄이 «빈 갈래»로 걸러지면 아무나 「받은 곳」이 되고,
     메뉴에는 이름 없는 줄이 떠 눌러도 뜻이 없다. */
  const c = load();
  const B = { B9: { keys: ['z'] }, B8: { kind: '', keys: ['y'] } };
  assert.equal(Object.keys(c.coSentGotKeys(B, '')).length, 0,
    '★ 빈 갈래로 걸렀더니 갈래 없는 묶음이 「받은 곳」이 됐다');
  assert.equal(c.coSentKindRows(B).length, 0,
    '★ 이름 없는 줄이 메뉴에 떴다 — 눌러도 뜻이 없다');
});

/* ── 켜고 끄기 ── */

test('★ 같은 갈래를 다시 누르면 «풀린다» — 켜지기만 하면 전체로 못 돌아온다', () => {
  let 그렸나 = 0;
  const c = load({ state: { coNotSent: '', coPage: 5 }, renderCoAny: () => { 그렸나++; } });
  c.coPickNotSent('연차');
  assert.equal(c.state.coNotSent, '연차');
  assert.equal(c.state.coPage, 0, '거르면 첫 쪽으로 돌아와야 한다 — 5쪽에서 걸면 빈 화면이다');
  c.coPickNotSent('연차');
  assert.equal(c.state.coNotSent, '', '★ 다시 눌러도 안 풀린다');
  assert.equal(그렸나, 2);
});

test('다른 갈래를 누르면 «갈아탄다»', () => {
  const c = load({ state: { coNotSent: '연차', coPage: 0 }, renderCoAny: () => {} });
  c.coPickNotSent('근로계약서');
  assert.equal(c.state.coNotSent, '근로계약서');
});

/* ── 거르개를 «실제로 돌려» 본다 ────────────────────────────────────
   ⚠ 글자만 찾는 검사는 기능을 꺼 버려도 통과한다 — coFilteredList 를 떠서 돌린다. */

/* 회사 넷: a 받음 · b 받음 · c 안 받음 · d 안 받았지만 «계약해지» */
const COS = [
  { key: 'a', name: '가', bizno: '1', erp: null, folder: '' },
  { key: 'b', name: '나', bizno: '2', erp: null, folder: '' },
  { key: 'c', name: '다', bizno: '3', erp: null, folder: '' },
  { key: 'd', name: '라', bizno: '4', erp: { left: true }, folder: '' }
];
function 거르기(coNotSent, batches) {
  const state = { coQ: '', coFolder: '', coFTab: '', coTag: '', coColFilter: {},
    coOnlyCares: false, coOnlyClosed: false, coOnlyNoBiz: false,
    coOnlyIncomplete: false, coOnlyUid: false, coNoFolder: false,
    coNotSent: coNotSent, coPage: 0 };
  const b = { console, state, _coBatches: batches,
    coList: () => COS.slice(),
    coCares: () => true, coLacks: () => false, coIsUid: () => false,
    coFTabsOf: () => [], coTagsOf: () => [], CO_SORT: {},
    ErpMatch: { ready: true }, esc: s => String(s == null ? '' : s) };
  vm.createContext(b);
  vm.runInContext(fnBody('coSentGotKeys') + '\n' + fnBody('coFilteredList'), b);
  return vm.runInContext('coFilteredList()', b).map(o => o.key).join(',');
}

test('★★ 「근로계약서 못 받은 곳」을 켜면 «안 받은 곳»만 남는다', () => {
  /* a·b 는 근로계약서를 받았다 → c 만 남아야 한다(d 는 계약해지라 빠진다) */
  assert.equal(거르기('근로계약서', { B1: { kind: '근로계약서', keys: ['a', 'b'] } }), 'c');
});

test('★★ 계약해지된 곳은 «안 받았어도» 안 나온다 — 3걸음이 애초에 안 보낸 곳이다', () => {
  const 남은 = 거르기('연차', { B1: { kind: '연차', keys: [] } });
  assert.equal(남은, 'a,b,c', '★ 라(계약해지)가 「안 받은 곳」으로 올라왔다: ' + 남은);
});

test('★★ 묶음을 아직 «못 읽었으면» 안 거른다 — 전부가 「안 받은 곳」이 되면 거짓말이다', () => {
  assert.equal(거르기('근로계약서', null), 'a,b,c,d',
    '★ 못 읽은 채로 걸렀다 — 화면이 거짓말을 한다');
});

test('안 켜면 아무것도 안 거른다', () => {
  assert.equal(거르기('', { B1: { kind: '근로계약서', keys: ['a'] } }), 'a,b,c,d');
});

test('다른 갈래를 받은 것은 «셈에 안 든다»', () => {
  /* 연차만 받은 a·b 는 근로계약서 쪽에서는 여전히 「못 받은 곳」이다 */
  assert.equal(거르기('근로계약서', { B1: { kind: '연차', keys: ['a', 'b'] } }), 'a,b,c');
});

/* ── 거르는 자리 ── */

test('★★ 계약해지(🚪)는 «여기서도» 뺀다 — 3걸음이 애초에 안 보낸 곳이다', () => {
  const seg = SRC.slice(SRC.indexOf('if(state.coNotSent && !skipTodo'), SRC.indexOf('if(state.coNotSent && !skipTodo') + 400);
  assert.match(seg, /!\(o\.erp && o\.erp\.left\)/,
    '★ 빼지 않으면 끝난 곳이 죄다 「안 받은 곳」으로 올라와 목록이 못 쓰게 된다');
});

test('★★ 묶음을 «아직 못 읽었으면» 안 거른다 — 빈 것으로 거르면 4,159곳이 통째로 「안 받은 곳」이 된다', () => {
  const at = SRC.indexOf('if(state.coNotSent && !skipTodo');
  assert.ok(at > 0, '거르는 자리를 못 찾았다');
  assert.match(SRC.slice(at, at + 60), /&& _coBatches\)/,
    '★ 못 읽은 채로 거르면 화면이 거짓말을 한다');
});

test('★ 거르는 일은 coFilteredList «한 곳»에서 한다 — 두 곳에서 거르면 화면마다 답이 다르다', () => {
  assert.equal(SRC.split('list = list.filter(o=>o && !받은[o.key]').length - 1, 1);
});

/* ── 돈이 새지 않게 ── */

test('★★ 회사 기록(sentDocs)을 «통째로» 읽지 않는다 — 묶음 몇 줄이면 된다', () => {
  const load = fnBody('loadCoBatches');
  assert.match(load, /sentBatch/, '묶음을 읽어야 한다');
  assert.ok(!/sentDocs/.test(load), '★ 회사별 기록을 통째로 읽으면 4,159곳어치가 온다');
  assert.match(load, /once\('value'\)/, '읽기는 «한 번»만 한다');
  assert.ok(!/\.on\(/.test(load), '살아 있는 구독을 걸면 계속 돈다');
});

test('★ 한 번 읽어 두면 다시 안 읽는다 · 새로 남기거나 되돌리면 «버린다»', () => {
  const load = fnBody('loadCoBatches');
  assert.match(load, /if\(_coBatches\)\{ if\(cb\) cb\(_coBatches\); return; \}/, '받아 둔 것을 안 쓴다');
  assert.match(fnBody('coSentBatchGo'), /coBatchesBust\(\)/, '새로 남겼는데 옛 묶음을 본다');
  assert.match(fnBody('coSentBatchUndo'), /coBatchesBust\(\)/, '되돌렸는데 옛 묶음을 본다');
});

/* ── 화면에 보이기 ── */

test('★★ 켜져 있으면 «갈래 이름과 함께» 띠에 뜬다 — 어느 서식인지 알아야 한다', () => {
  const ctx = { console, state: { coNotSent: '근로계약서' },
    CO_TODO_LABEL: { coOnlyNoBiz: '🔢 번호 없음' },
    esc: s => String(s == null ? '' : s) };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coTodoLabels') + '\n' + fnBody('condChipHtml')
    + '\n' + fnBody('coTodoChipsHtml'), ctx);
  const h = vm.runInContext('coTodoChipsHtml()', ctx);
  assert.match(h, /근로계약서/, '★ 「못 받은 곳만 보는 중」만 뜨면 어느 서식인지 모른다');
  assert.match(h, /clearCoTodo\('coNotSent'\)/, '✕ 로 풀 길이 없다');
});

test('안 켜져 있으면 그 줄이 안 뜬다', () => {
  const ctx = { console, state: { coNotSent: '' },
    CO_TODO_LABEL: {}, esc: s => String(s == null ? '' : s) };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coTodoLabels') + '\n' + fnBody('condChipHtml')
    + '\n' + fnBody('coTodoChipsHtml'), ctx);
  assert.equal(vm.runInContext('coTodoChipsHtml()', ctx), '');
});

test('★★ 다시 그리기 잣대에 들어 있다 — 안 넣으면 갈래를 골라도 목록이 그대로다', () => {
  assert.match(fnBody('coListShapeKey'), /s\.coNotSent/);
});

test('★ 메뉴가 묶음을 «먼저 읽고» 그린다 — 안 읽고 그리면 배포한 것이 없는 것처럼 보인다', () => {
  assert.match(fnBody('openCoFilterMenu'), /loadCoBatches\(\(\)=>coFilterMenuPaint\(r\)\)/);
});

test('★ 메뉴 줄에 «몇 곳이 못 받았는지»가 붙는다 — 세지 않으면 고를 값이 없다', () => {
  const paint = fnBody('coFilterMenuPaint');
  assert.match(paint, /coNotSentCount\(k\.kind\)/);
  assert.match(paint, /coPickNotSent\(/, '눌러서 켤 길이 없다');
});

test('세는 것도 «할 일끼리는» 서로 안 걸고 센다 — 다른 조건 안에서 세면 수가 붙는다', () => {
  assert.match(fnBody('coNotSentCount'), /coFilteredList\(null, false, true\)/);
});
