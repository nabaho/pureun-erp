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

/* ══════ mgTableHtml — emitted 는 칸 번호가 아니라 칸 객체로 가려야 한다 (Finding 2) ══════
   cell 번호가 표 안에서 유일하다는 보장은 pu-hwp-edit.js 의 몫이고 여기서는 확인할 길이 없다.
   그 불변식이 깨졌을 때(번호가 겹칠 때) 번호로 가리면 살아남은 칸의 번호가 밀려난 칸 몫까지
   "이미 나갔다"고 잘못 답해, 밀려난 칸이 표에도 orphan 에도 없이 통째로 사라진다. */
test('칸 번호(cell)가 같아도 칸 객체로 가려 잃어버리지 않는다', () => {
  const c = loadMgTableHtml();
  c._mg = { grid: { units: mkGrid(['A','B']) }, edited: {} };
  const b = {
    rows: 1, cols: 1,
    cells: [
      { cell:3, row:0, col:0, rowSpan:1, colSpan:1, units:[0] },  /* A — 같은 자리·같은 번호(3) */
      { cell:3, row:0, col:0, rowSpan:1, colSpan:1, units:[1] },  /* B — last-writer-wins 로 표에 남는다 */
    ]
  };
  const html = c.mgTableHtml(b);
  assert.match(html, />B</, '살아남은 칸은 그대로 표에 있어야 한다');
  /* 번호로 가리던 옛 코드라면 emitted[3] 이 B 때문에 이미 참이 되어, A 가 orphan 검사에서도
     "이미 나갔다"고 잘못 걸러져 표에도 orphan 에도 없이 사라진다 — A 가 안 보이면 그 결함이다. */
  assert.match(html, />A</, 'A 가 표에도 orphan 에도 없으면 영영 못 고친다');
  assert.match(html, /자리를 모르는 칸 1개/);
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
  /* 차례표가 낡았을 때 doc 을 꼭 놓아야 한다 — 안 그러면 WASM 쪽 문서가 샌다.
     indexOf('gen!==_mgGen') 처럼 리터럴로 찾으면 'gen !== _mgGen'으로 띄어 쓰는 순간
     -1이 나와 완전히 다른 자리를 조용히 들여다보게 된다 — 실제 찾은 정규식 위치에서 잘라야
     검사가 검사하려는 자리를 계속 가리킨다. */
  const m = /gen\s*!==\s*_mgGen/.exec(fn);
  assert.ok(m, '차례표 비교 자리를 찾지 못했습니다');
  const guard = fn.slice(Math.max(0, m.index - 40), m.index + 80);
  assert.match(guard, /doc\.free\(\)/);
});

/* ══════ openMatEditor — 실행해서 검증: 옛 호출의 실패가 새 편집기를 지우면 안 된다 ══════
   위 두 테스트는 소스 모양만 본다. catch(e){ mgFail(...) } 에 차례표 검사가 없다는 결함은
   모양만으로는 못 잡는다 — 실제로 두 호출을 겹쳐 실행해야 드러난다.
   PureunHwp·Firebase 전체를 갖출 필요는 없다: openMatEditor 가 실제로 건드리는 것은
   matBytes 와 PureunHwp.openDoc 뿐이라 이 둘만 손으로 쥐는 deferred promise 로 갈아 끼우고,
   나머지(문서 엔진 내부)는 mgRender 안쪽 얘기라 여기서는 몰라도 된다. */
function loadOpenMatEditor(){
  const i = source.indexOf('let _mg = null;');
  const j = source.indexOf('function mgRender()');
  assert.ok(i > 0, 'let _mg = null; 을 찾지 못했습니다');
  assert.ok(j > i, 'openMatEditor 블록 끝(mgRender 시작)을 찾지 못했습니다');
  const code = source.slice(i, j);

  /* 진짜 DOM의 "붙은 걸 떼면 그 안의 것도 통째로 없어진다"는 성질이 이 재현의 핵심이라
     대충 흉내내면 안 된다 — appendChild 로 붙인 것만 getElementById 로 찾고, remove() 로
     떼면 그 밑에서 innerHTML 로 흉내낸 id 들도 같이 사라진다. */
  const bodyChildren = [];
  function makeEl(tag){
    return {
      tagName: tag, id: '', className: '', style:{}, _html:'', _idMap: new Map(),
      classList: { toggle(){}, add(){}, remove(){} },
      children: [],
      get innerHTML(){ return this._html; },
      set innerHTML(v){
        this._html = v; this._idMap = new Map();
        const re = /id="([^"]+)"/g; let m;
        while((m = re.exec(v))) if(!this._idMap.has(m[1])) this._idMap.set(m[1], makeEl('div'));
      },
      appendChild(child){ this.children.push(child); },
      addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
      querySelector(){ return makeEl('div'); },
      remove(){ const idx = bodyChildren.indexOf(this); if(idx>=0) bodyChildren.splice(idx,1); }
    };
  }
  function findById(node, id){
    if(!node) return null;
    if(node.id === id) return node;
    if(node._idMap.has(id)) return node._idMap.get(id);
    return null;
  }
  const fakeDoc = {
    createElement: tag => makeEl(tag),
    getElementById: id => { for(const c of bodyChildren){ const f=findById(c,id); if(f) return f; } return null; },
    body: { appendChild: el => bodyChildren.push(el) }
  };

  const pending = {};                              /* id → {resolve, reject} — matBytes 를 손으로 쥐고 흔든다 */
  const renderLog = [];
  const ctx = {
    document: fakeDoc,
    $: id => fakeDoc.getElementById(id),
    esc: s => String(s),
    toast: () => {},
    confirm: () => true,
    matExt: () => 'hwp',
    _matMeta: { x:{id:'x', name:'엑스.hwp', fileName:'엑스.hwp'}, y:{id:'y', name:'와이.hwp', fileName:'와이.hwp'} },
    matBytes: id => new Promise((resolve, reject) => { pending[id] = { resolve, reject }; }),
    PureunHwp: { openDoc: async () => ({ freed:false, free(){ this.freed = true; } }) },
    PuHwpEdit: { readGrid: () => ({units:[], blocks:[], warn:{badCellInfo:0,textBoxes:0}}), changedRows: () => [] },
    /* mgRender 는 이 슬라이스 밖(표를 실제로 그리는 mgTableHtml 쪽)이다 — 여기서는
       "성공하면 화면에 무언가 그려진다"만 흉내내면 이 결함을 보는 데 충분하다. */
    mgRender: () => { renderLog.push(1); const b = fakeDoc.getElementById('mgedBody'); if(b) b.innerHTML = 'RENDERED#'+renderLog.length; }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._pending = pending;
  ctx._fakeDoc = fakeDoc;
  return ctx;
}

test('[실행] 겹쳐 열었을 때 나중에 도착한 옛 호출의 실패가 새 편집기 화면을 지우지 않는다', async () => {
  const ctx = loadOpenMatEditor();
  const openMatEditor = ctx.openMatEditor;

  const pX = openMatEditor('x');                   /* X 를 먼저 연다 — matBytes 가 걸린 채 멈춘다 */
  await Promise.resolve();
  assert.ok(ctx._pending.x, 'X 의 matBytes 호출이 걸려 있어야 한다');

  const pY = openMatEditor('y');                   /* X 가 안 끝난 채 Y 를 덮어 연다 */
  await Promise.resolve();
  assert.ok(ctx._pending.y, 'Y 의 matBytes 호출도 걸려 있어야 한다');

  ctx._pending.y.resolve(new Uint8Array([1,2,3])); /* Y 는 먼저 끝까지 연다 */
  await pY;
  const afterY = ctx._fakeDoc.getElementById('mgedBody').innerHTML;
  assert.match(afterY, /^RENDERED#/, 'Y 는 정상적으로 화면에 그려져야 한다');

  ctx._pending.x.reject(new Error('DB 오류'));     /* 그 뒤에야 X 의 실패가 도착한다 */
  await pX;                                        /* openMatEditor 안에서 잡으니 던지지 않아야 한다 */

  const afterX = ctx._fakeDoc.getElementById('mgedBody').innerHTML;
  assert.equal(afterX, afterY, 'X 의 실패가 Y 의 화면을 건드리면 안 된다');
  assert.doesNotMatch(afterX, /DB 오류/, '옛 호출의 실패 메시지가 새 편집기 화면에 쓰이면 안 된다');
  assert.equal(vm.runInContext('_mg.id', ctx), 'y', '_mg 는 여전히 Y 를 가리켜야 한다');
});

test('[실행] 겹치지 않은 보통 실패는 그대로 오류 메시지를 보여준다', async () => {
  const ctx = loadOpenMatEditor();
  const p = ctx.openMatEditor('x');
  await Promise.resolve();
  ctx._pending.x.reject(new Error('DB 오류'));
  await p;
  const body = ctx._fakeDoc.getElementById('mgedBody').innerHTML;
  assert.match(body, /한글 문서를 열지 못했습니다/, '겹쳐 열리지 않았으면 실패 메시지를 그대로 보여줘야 한다');
  assert.match(body, /DB 오류/);
});

test('[실행] 창을 사용자가 직접 닫은 뒤 옛 호출이 실패해도 조용하다', async () => {
  const ctx = loadOpenMatEditor();
  const p = ctx.openMatEditor('x');
  await Promise.resolve();
  ctx.closeMatEditor();                            /* 사용자가 결과를 기다리지 않고 닫았다 */
  ctx._pending.x.reject(new Error('DB 오류'));
  await p;                                         /* 던지면 안 된다 */
  assert.equal(ctx._fakeDoc.getElementById('mgedBody'), null, '팝업이 없으니 mgedBody 도 없어야 한다');
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
