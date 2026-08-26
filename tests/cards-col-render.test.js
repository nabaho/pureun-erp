/* 표의 열 이름과 «그리는 함수»가 짝이 맞나 (대표 보고 2026-08-26)
   "오류 났다 사업자 인데 명함이 나온다."

   ★ 무슨 일이 있었나
     COL_DEFS.biz 에 「서류이름」(docName) 열을 넣고, 그 칸을 그리는 함수(TD.docName)를
     빠뜨렸다. renderPCTable 은
        ① 먼저 제목·개수를 새 탭 것으로 바꾸고 (#pcCount ← 347)
        ② 나중에 표와 쪽넘김을 그린다
     그 사이 order.map(k=>TD[k](it)) 에서 undefined 를 부르며 터졌다. 그래서
     제목만 「사업자등록증 347개」로 바뀌고, 표와 쪽넘김은 «직전 명함 화면»
     (명함 열 · 6,286개)이 그대로 남았다 — 사업자 탭인데 명함이 나왔다.

   ★ 여기서 못 박는 것
     ① COL_DEFS 의 «모든» 열에 그리는 함수가 있다 (두 탭 다)
     ② 없어도 표 전체를 잃지 않는다 (빈 칸으로 넘기고 콘솔에 적는다)
     ③ 조용히 넘기지 않는다 — 적어 두지 않으면 빈 칸인 채로 굳는다 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}

/* COL_DEFS 를 그대로 떠 온다 */
function colDefs() {
  const ctx = {};
  vm.createContext(ctx);
  /* ⚠ const 는 vm 컨텍스트의 «속성»이 되지 않는다(렉시컬 선언이라 ctx 에 안 붙는다).
       var 로 바꿔 실어야 ctx.COL_DEFS 로 꺼낼 수 있다 — 이 저장소가 여러 번 밟은 함정. */
  const code = slice('const COL_DEFS = {', 'function colHidden(').replace(/^const /, 'var ');
  new vm.Script(code).runInContext(ctx);
  assert.ok(ctx.COL_DEFS, 'COL_DEFS 를 꺼내지 못했다');
  return ctx.COL_DEFS;
}
/* TD 두 벌의 «열쇠»를 글에서 읽어 낸다 — 함수 본문은 화면(esc·state)에 얽혀 있어
   그대로 돌릴 수 없다. 우리가 볼 것은 «어떤 열쇠가 있나» 뿐이다. */
function tdKeys() {
  const body = slice("const TD = state.tab==='card' ? {", '  };');
  const cut = body.indexOf('} : {');
  assert.ok(cut > 0, 'TD 두 벌의 가름을 못 찾았다');
  const grab = src => (src.match(/^\s{4}([A-Za-z]\w*):/gm) || [])
    .map(s => s.trim().replace(':', ''));
  return { card: grab(body.slice(0, cut)), biz: grab(body.slice(cut)) };
}

/* ── ① 짝이 맞나 ── */

test('★ COL_DEFS 의 모든 열에 그리는 함수가 있다 — 하나만 빠져도 표가 통째로 안 나온다', () => {
  const defs = colDefs();
  const keys = tdKeys();
  ['card', 'biz'].forEach(tab => {
    const need = defs[tab].map(c => c[0]);
    const have = keys[tab];
    const missing = Array.from(need).filter(k => have.indexOf(k) < 0);
    /* ⚠ deepStrictEqual 로 빈 배열과 견주지 않는다 — vm 안에서 만든 배열은
         «다른 세상»의 Array 라 비어 있어도 틀렸다고 한다. 이어 붙여 견준다. */
    assert.strictEqual(missing.join(','), '',
      tab + ' 탭에서 그리는 함수가 없는 열: ' + missing.join(', '));
  });
});

test('서류이름 열에도 그리는 함수가 있다 — 이번에 빠졌던 그 칸', () => {
  const keys = tdKeys();
  assert.ok(keys.biz.indexOf('docName') >= 0, 'docName 을 그릴 함수가 없다');
  assert.match(HTML, /docName: it => `<td class="col-docName"/);
});

test('명함 탭에는 서류이름이 없다 — 명함에는 그런 칸이 없다', () => {
  const defs = colDefs();
  assert.ok(defs.card.every(c => c[0] !== 'docName'));
});

test('열마다 너비가 정해져 있다 — 없으면 칸이 찌그러진다', () => {
  const defs = colDefs();
  const w = slice('const COL_DEFAULT_W = {', '/* 열 너비 더블클릭');
  ['card', 'biz'].forEach(tab => {
    defs[tab].forEach(c => {
      assert.ok(w.indexOf(c[0] + ':') >= 0, tab + ' 탭 「' + c[0] + '」 너비가 없다');
    });
  });
});

/* ── ② 없어도 표를 잃지 않는다 ── */

test('그리는 함수가 없으면 빈 칸으로 넘긴다 — 표 전체를 잃지 않는다', () => {
  const ctx = { console: { warn() {} } };
  vm.createContext(ctx);
  new vm.Script(slice('const _tdWarned = {};', 'function renderPCTable(){')).runInContext(ctx);
  const out = ctx.tdOf({}, 'nosuch', { id: 'x' });
  assert.strictEqual(out, '<td class="col-nosuch"></td>', '터지지 말고 빈 칸을 내야 한다');
});

test('있는 함수는 그대로 부른다', () => {
  const ctx = { console: { warn() {} } };
  vm.createContext(ctx);
  new vm.Script(slice('const _tdWarned = {};', 'function renderPCTable(){')).runInContext(ctx);
  const TD = { bizno: it => '<td>' + it.bizno + '</td>' };
  assert.strictEqual(ctx.tdOf(TD, 'bizno', { bizno: '312' }), '<td>312</td>');
});

test('함수 자리에 함수가 아닌 것이 있어도 안 터진다', () => {
  const ctx = { console: { warn() {} } };
  vm.createContext(ctx);
  new vm.Script(slice('const _tdWarned = {};', 'function renderPCTable(){')).runInContext(ctx);
  assert.match(ctx.tdOf({ x: '글자' }, 'x', {}), /^<td class="col-x">/);
  assert.match(ctx.tdOf(null, 'x', {}), /^<td class="col-x">/);
});

test('★ 조용히 넘기지 않는다 — 콘솔에 적는다', () => {
  const said = [];
  const ctx = { console: { warn: function () { said.push(Array.from(arguments).join(' ')); } } };
  vm.createContext(ctx);
  new vm.Script(slice('const _tdWarned = {};', 'function renderPCTable(){')).runInContext(ctx);
  ctx.tdOf({}, 'nosuch', {});
  assert.strictEqual(said.length, 1, '적어 두지 않으면 빈 칸인 채로 굳는다');
  assert.match(said[0], /nosuch/);
  assert.match(said[0], /COL_DEFS/, '어디가 어긋났는지 짚어 줘야 한다');
});

test('같은 열을 두 번 적지 않는다 — 100줄이면 100번 찍힌다', () => {
  const said = [];
  const ctx = { console: { warn: function () { said.push(1); } } };
  vm.createContext(ctx);
  new vm.Script(slice('const _tdWarned = {};', 'function renderPCTable(){')).runInContext(ctx);
  ctx.tdOf({}, 'nosuch', {}); ctx.tdOf({}, 'nosuch', {}); ctx.tdOf({}, 'nosuch', {});
  assert.strictEqual(said.length, 1);
});

test('표를 그릴 때 이 도우미를 실제로 쓴다', () => {
  /* ⚠ 도우미를 만들어 두고 안 쓰면 아무것도 막아 주지 않는다 */
  assert.match(HTML, /\$\{order\.map\(k=>tdOf\(TD,k,it\)\)\.join\(''\)\}/);
  assert.ok(!/order\.map\(k=>TD\[k\]\(it\)\)/.test(HTML), '옛 길이 남아 있으면 그 길로 터진다');
});

/* ── ③ 왜 「명함이 나왔나」 — 제목이 표보다 먼저 바뀐다 ── */

test('제목·개수가 표보다 «먼저» 바뀐다 — 그래서 중간에 터지면 옛 표가 남는다', () => {
  /* 이 차례 자체는 고치지 않는다(제목을 나중에 바꿔도 같은 문제가 반대로 생긴다).
     대신 «터지지 않게» 막았다. 이 검사는 그 까닭을 코드에 붙들어 둔다. */
  const fn = slice('function renderPCTable(){', '/* ══════ 🔖 내 탭');
  const countAt = fn.indexOf("$('pcCount')");
  const tableAt = fn.indexOf("$('pcTable').innerHTML");
  assert.ok(countAt > 0 && tableAt > countAt,
    '차례가 바뀌었으면 이 검사의 설명도 함께 고쳐야 한다');
});
