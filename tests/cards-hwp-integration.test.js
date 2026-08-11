const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* mgTableHtml 은 자리를 실제로 계산해야 검사할 수 있다 — 소스 문자열만 보는 정규식으로는
   "칸이 조용히 사라지지 않는다"를 증명할 수 없다. mgLineHtml·mgTableHtml·esc 세 조각만
   실제 함수로 뽑아 vm 샌드박스에서 돌린다(cards-material-shelf.test.js 와 같은 방식). */
function loadMgTableHtml(){
  const escAt = source.indexOf('const esc = s =>');
  assert.ok(escAt > 0, 'esc 정의를 찾지 못했습니다');
  const escEnd = source.indexOf('\n', escAt);
  const i = source.indexOf('function mgLineHtml');
  const j = source.indexOf('function mgFit(el)');
  assert.ok(i > 0, 'mgLineHtml 을 찾지 못했습니다');
  assert.ok(j > i, 'mgTableHtml 끝(mgFit 시작)을 찾지 못했습니다');
  const code = source.slice(escAt, escEnd) + '\n' + source.slice(i, j);
  const ctx = { PuHwpEdit: { clean: v => v }, _mg: null };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}
/* 표 안 칸이 실제로 렌더에 실렸는지는 그 칸의 글 내용(units 가 가리키는 unit.text)이
   결과 HTML에 있는지로 확인한다 — id 문자열이 아니라 눈에 보이는 값으로 증명한다. */
function mkGrid(texts){ return texts.map((t,i)=>({text:t, no:i+1})); }

test('명함첩은 공통 한글 엔진을 Firebase 사용 코드보다 먼저 읽는다', () => {
  const engine = source.indexOf('js/pu-hwp-engine.js');
  const auth = source.indexOf('firebase-auth-compat.js');
  assert.ok(engine > 0);
  assert.ok(auth > engine);
});

test('자료함의 HWP/HWPX는 다운로드 전에 공통 미리보기를 연다', () => {
  assert.match(source, /function openMaterialHwp/);
  assert.match(source, /PureunHwp\.validate\(bytes,name\)/);
  assert.match(source, /PureunHwp\.renderPreview\(\$\('matHwpBody'\),bytes,name\)/);
  assert.match(source, /if\(\/\^\(hwp\|hwpx\)\$\/\.test\(matExt\(m\.fileName\)\)\)/);
});

test('미리보기 실패 시에도 원본을 내려받을 수 있다', () => {
  assert.match(source, /function downloadMaterialOriginal/);
  assert.match(source, /PureunHwp\.download\(_matHwpCurrent\.bytes/);
  assert.match(source, /원본은 그대로 보관되어 있습니다/);
});

test('한글 자료 창은 모바일에서 화면을 넘지 않는다', () => {
  assert.match(source, /\.mat-hwp-modal\{width:min\(1100px,96vw\)/);
  assert.match(source, /@media\(max-width:760px\)[\s\S]*?\.mat-hwp-modal\{width:100%;height:94vh/);
});

test('자료 바이트 읽기는 한 곳에만 있다', () => {
  /* 같은 코드가 여러 벌이면 한 곳만 고쳐져 어긋난다.
     읽기(once)는 한 곳이어야 한다 — 쓰기(set)·지우기(remove)는 그대로 둔다.
     charCodeAt 으로 세지 않는다: 자료함과 상관없는 _unb64 도 그것을 쓴다. */
  assert.match(source, /async function matBytes\(id\)/);
  /* 따옴표·공백이 다르게 적힌 중복(예: DB_ROOT + '/materialFiles/' + id)도
     잡아야 한다 — 붙여쓴 모양만 세면 다시 베껴 써도 셈이 그대로 1로 나온다. */
  const reads = (source.match(/materialFiles\/\s*['"]?\s*\+?\s*id\s*\)\s*\.once\(/g) || []).length;
  assert.equal(reads, 1, '자료 파일을 읽는 곳이 아직 여러 곳입니다');
});

test('자료를 읽는 세 곳이 모두 matBytes 를 쓴다', () => {
  const each = ['async function downloadMaterial', 'async function fillMatPreview', 'async function previewMaterial'];
  each.forEach(head => {
    const at = source.indexOf(head);
    assert.ok(at > 0, head + ' 을 찾지 못했습니다');
    assert.match(source.slice(at, at + 2200), /await matBytes\(id\)/, head + ' 이 아직 직접 읽습니다');
  });
});

test('파일이 없으면 조용히 넘기지 않고 알린다', () => {
  const fn = source.slice(source.indexOf('async function matBytes'), source.indexOf('async function matBytes') + 600);
  assert.match(fn, /throw new Error/);
});

test('큰 팝업이 표를 세로 목록이 아니라 표로 그린다', () => {
  assert.match(source, /function openMatEditor/);
  assert.match(source, /PuHwpEdit\.readGrid\(/);
  assert.match(source, /rowspan="\$\{/);
  assert.match(source, /colspan="\$\{/);
});

test('격자를 그릴 때 자리를 짐작하지 않는다', () => {
  /* Math.floor(i/cols) 를 새로 쓰면 합친 칸이 있는 서식이 전부 어긋난다 */
  const mg = source.slice(source.indexOf('function mgTableHtml'), source.indexOf('function mgInput'));
  assert.ok(mg.length > 200, 'mgTableHtml 을 찾지 못했습니다');
  assert.doesNotMatch(mg, /Math\.floor\([^)]*cols/);
});

test('자리를 못 읽은 칸은 표 아래에 따로 내놓는다', () => {
  assert.match(source, /자리를 모르는 칸/);
});

test('큰 팝업이 화면을 꽉 채운다', () => {
  assert.match(source, /\.mged\{position:fixed;inset:0/);
  assert.match(source, /\.mged-box\{width:min\(1240px,97vw\)/);
});

/* ══════ mgTableHtml — 자리를 찾은 칸이 조용히 사라지면 안 된다 ══════
   화면에 못 나온 칸은 사용자가 영영 못 고친다. 세 가지 실제 결함을 그대로 재현해
   지금은 셋 다 orphan 상자로 건져지는지 함수를 직접 실행해 확인한다. */

test('표 크기가 실제 칸 수보다 작아도(0×0) 밀려난 칸을 orphan 으로 건진다', () => {
  const c = loadMgTableHtml();
  c._mg = { grid: { units: mkGrid(['A','B','C','D']) }, edited: {} };
  const b = {
    rows: 0, cols: 0,   /* num() 이 rowCount 없을 때 0 을 준다 — cellCount 는 별개 필드다 */
    cells: [
      { cell:1, row:0, col:0, rowSpan:1, colSpan:1, units:[0] },
      { cell:2, row:0, col:1, rowSpan:1, colSpan:1, units:[1] },
      { cell:3, row:1, col:0, rowSpan:1, colSpan:1, units:[2] },
      { cell:4, row:1, col:1, rowSpan:1, colSpan:1, units:[3] },
    ]
  };
  const html = c.mgTableHtml(b);
  /* Math.max(1,0)=1 이라 표는 1×1 — 칸 A만 표 안에 그려지고 B·C·D 는 표 밖으로 밀린다 */
  assert.match(html, />A</);
  assert.match(html, /자리를 모르는 칸 3개/, '표 밖으로 밀린 3개가 orphan 개수로 잡혀야 한다');
  assert.match(html, />B</, 'B 가 화면 어디에도 없으면 영영 못 고친다');
  assert.match(html, />C</, 'C 가 화면 어디에도 없으면 영영 못 고친다');
  assert.match(html, />D</, 'D 가 화면 어디에도 없으면 영영 못 고친다');
});

test('두 칸이 같은 자리를 가리키면(row·col 겹침) 밀려난 칸을 orphan 으로 건진다', () => {
  const c = loadMgTableHtml();
  c._mg = { grid: { units: mkGrid(['가','나','다','라']) }, edited: {} };
  const b = {
    rows: 2, cols: 2,
    cells: [
      { cell:1, row:0, col:0, rowSpan:1, colSpan:1, units:[0] },
      { cell:2, row:0, col:1, rowSpan:1, colSpan:1, units:[1] },
      { cell:3, row:1, col:1, rowSpan:1, colSpan:1, units:[2] },  /* 다 — 겹쳐서 밀려난다 */
      { cell:4, row:1, col:1, rowSpan:1, colSpan:1, units:[3] },  /* 라 — last-writer-wins 로 살아남는다 */
    ]
  };
  const html = c.mgTableHtml(b);
  assert.match(html, />라</, '살아남은 칸은 그대로 표에 있어야 한다');
  assert.match(html, /자리를 모르는 칸 1개/);
  assert.match(html, />다</, '자리가 겹쳐 밀린 칸도 사라지면 안 된다');
});

test('합친 칸이 덮은 자리에 있던 칸을 orphan 으로 건진다', () => {
  const c = loadMgTableHtml();
  c._mg = { grid: { units: mkGrid(['A','B','C','D']) }, edited: {} };
  const b = {
    rows: 2, cols: 2,
    cells: [
      { cell:1, row:0, col:0, rowSpan:2, colSpan:1, units:[0] },  /* A — 세로로 두 칸 합침 */
      { cell:2, row:0, col:1, rowSpan:1, colSpan:1, units:[1] },
      { cell:3, row:1, col:0, rowSpan:1, colSpan:1, units:[2] },  /* C — A 의 합친 자리에 깔린다 */
      { cell:4, row:1, col:1, rowSpan:1, colSpan:1, units:[3] },
    ]
  };
  const html = c.mgTableHtml(b);
  /* continue-on-taken 은 그대로 맞다 — <td> 를 두 번 찍으면 표가 깨진다.
     대신 덮인 칸(C)이 아예 사라지지 않고 orphan 으로 나와야 한다. */
  assert.match(html, /rowspan="2"/, '합친 칸 표시 자체는 그대로 있어야 한다');
  assert.match(html, /자리를 모르는 칸 1개/);
  assert.match(html, />C</, '합친 칸에 덮인 칸도 사라지면 안 된다');
  const tdCount = (html.match(/<td[ >]/g) || []).length;
  assert.equal(tdCount, 3, '덮인 자리에 <td> 를 또 찍으면 표가 깨진다 — 2행2열, 합침 1개 = td 3개');
});

test('자리가 겹치지 않는 정상 표는 orphan 이 생기지 않는다', () => {
  const c = loadMgTableHtml();
  c._mg = { grid: { units: mkGrid(['1','2','3','4']) }, edited: {} };
  const b = {
    rows: 2, cols: 2,
    cells: [
      { cell:1, row:0, col:0, rowSpan:1, colSpan:1, units:[0] },
      { cell:2, row:0, col:1, rowSpan:1, colSpan:1, units:[1] },
      { cell:3, row:1, col:0, rowSpan:1, colSpan:1, units:[2] },
      { cell:4, row:1, col:1, rowSpan:1, colSpan:1, units:[3] },
    ]
  };
  const html = c.mgTableHtml(b);
  assert.doesNotMatch(html, /자리를 모르는 칸/, '멀쩡한 칸까지 orphan 으로 잘못 건지면 안 된다');
});

/* ══════ openMatEditor — 겹쳐 열면 문서가 새고 화면 id 가 겹친다 ══════
   실행해서 재현하려면 WASM(PureunHwp)·Firebase 까지 갖춰야 해서 비현실적이다.
   대신 고쳐진 소스가 실제로 지켜야 할 모양을 못 박는다: 두 await 사이의 창을
   무조건 닫기 + 차례표로 막는다. */

test('겹쳐 열 때 조건부(if(_mg)) 로 닫지 않는다 — _mg 가 아직 null 인 창을 못 막는다', () => {
  const fn = source.slice(source.indexOf('async function openMatEditor'), source.indexOf('function mgFail'));
  assert.ok(fn.length > 200, 'openMatEditor 를 찾지 못했습니다');
  assert.doesNotMatch(fn, /if\(_mg\)\s*closeMatEditor\(\)/,
    '_mg 가 채워지기 전에 겹쳐 열리면 이 조건은 통과해 버린다');
  assert.match(fn, /^\s*closeMatEditor\(\);/m, '두 await 전에 조건 없이 먼저 닫아야 한다');
});

test('두 await 이후 자신이 최신 호출인지 차례표로 확인한다', () => {
  const fn = source.slice(source.indexOf('async function openMatEditor'), source.indexOf('function mgFail'));
  assert.match(fn, /const gen\s*=\s*\+\+_mgGen/, '호출마다 차례표를 찍어야 한다');
  assert.match(fn, /gen\s*!==\s*_mgGen/, 'await 이후 차례표가 낡았으면 그려서는 안 된다');
  /* 차례표가 낡았을 때 doc 을 꼭 놓아야 한다 — 안 그러면 WASM 쪽 문서가 샌다 */
  const guard = fn.slice(fn.indexOf('gen!==_mgGen') - 40, fn.indexOf('gen!==_mgGen') + 80);
  assert.match(guard, /doc\.free\(\)/);
});

/* ══════ 자료 삭제·교체 때 _mg 도 함께 접어야 한다 (Finding 3) ══════ */

test('자료를 지우거나 바꿀 때 _mg 도 _he 처럼 놓아준다', () => {
  const bulkDelete = source.slice(source.indexOf('async function pickDelMat'), source.indexOf('async function pickMoveMat'));
  assert.match(bulkDelete, /if\(_mg && _mg\.id===id\) mgClose\(\)/, '일괄 삭제가 _mg 를 안 놓는다');

  const replace = source.slice(source.indexOf('async function replaceMaterialFile'), source.indexOf('async function putMaterial'));
  assert.match(replace, /if\(_mg && _mg\.id===id\) mgClose\(\)/, '파일 교체가 _mg 를 안 놓는다');

  const del = source.slice(source.indexOf('async function deleteMaterial'), source.indexOf('const esc ='));
  assert.match(del, /if\(_mg && _mg\.id===id\) mgClose\(\)/, '자료 삭제가 _mg 를 안 놓는다');
});

test('강제 정리(mgClose)는 저장 여부를 묻지 않는다 — 이미 지워진 자료에는 저장할 곳이 없다', () => {
  const mgClose = source.slice(source.indexOf('function mgClose'), source.indexOf('function closeMatEditor'));
  assert.ok(mgClose.length > 10, 'mgClose 를 찾지 못했습니다');
  assert.doesNotMatch(mgClose, /confirm\(/, 'mgClose 안에서 물어보면 강제 정리가 막힌다');
});
