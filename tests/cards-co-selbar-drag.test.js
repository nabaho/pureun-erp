'use strict';
/* 기업 상세(PC) — ① 고른 회사 도구줄이 «늘 보인다» ② 고른 회사를 끌어서 옆줄 폴더에 놓는다
   (대표 지시 2026-08-17: "클릭한 것 마우스 드래그해서 폴더로 옮길 수 있게 하고,
    클릭한 사업장들 어떻게 해야할지 팝업이 나와야 할 것 같다")

   ★ 무엇이 문제였나
     도구줄(.coselbar)은 표 «맨 위»에 있었다. 4,138곳 가운데 171번째 줄까지 내려가
     14곳을 골랐을 때, 도구줄은 화면 밖 저 위에 있어 «무엇을 할 수 있는지»가 어디에도
     안 보였다. 기능은 다 있는데 그 순간에 안 보이면 없는 것과 같다.

   ★ 이 파일이 지키는 것
     - 도구줄은 고른 것이 있을 때만·0곳이면 사라진다
     - 예전 단추(폴더로 옮기기·서류 탭·＃탭·선택 해제·비우기·「N곳 모두」)가 그대로 있다
     - 표와 쪽넘김 «뒤»에 온다 — 붙어 따라와도(sticky) 마지막 줄·쪽넘김을 안 덮는다
     - 폰(renderCoMobileList)과 PC 명함/사업자(#selbar)로 새지 않는다
     - 체크한 줄만 끌린다 / 떨어뜨리면 coMoveSelTo 하나만 부른다
     - ★ 같은 폴더 줄이 받는 세 드래그(명함·순서·회사)가 서로 섞이지 않는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const src = source.replace(/\r\n/g, '\n');

/* ── 경계는 «이름»으로 잡는다. 글자수로 자르면 가운데 한 줄만 늘어도 소리 없이 어긋난다
      (이 저장소에서 두 번 겪은 사고다). ── */
function block(startMarker, endMarker){
  const at = src.indexOf(startMarker);
  assert.ok(at > 0, '시작을 찾지 못했습니다: ' + startMarker);
  const end = src.indexOf(endMarker, at + startMarker.length);
  assert.ok(end > at, '끝을 찾지 못했습니다: ' + endMarker);
  return src.slice(at, end);
}
const coListBlock  = () => block('function coListHtml(info){', 'function coDocsHtml(');
const mobileBlock  = () => block('function renderCoMobileList(){', '\nconst renderMobile = render;');
const sideBlock    = () => block('function renderPCSide', '\nfunction ');

/* ══════ ① 도구줄 — 실제로 coListHtml 을 돌려서 본다 ══════ */
function runList(rows, sel, extra){
  const ctx = { console: console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    "const esc = s => String(s??'').replace(/[&<>\"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));",
    'var state = ' + JSON.stringify(Object.assign(
      { coSel: sel || {}, coColFilter: {}, coSort: {}, coTag: '', coFolder: '' }, extra || {})) + ';',
    "function coArrow(){ return ''; }",
    'function coTagsOf(o){ return (o && o.tags) || []; }',
    "function coSizeSelHtml(){ return ''; }",
    "function coPagerHtml(){ return '<div class=\"copager\">쪽넘김</div>'; }",
    /* 2026-08-24(2순위): 회사 목록 위 «고아 기업정보» 알림 띠 — 이 검사는 안 본다 */
    "function coOrphanBarHtml(){ return ''; }",
    /* 2026-08-24(3순위): 줄마다 «빠진 칸»을 알린다 — 이 검사는 안 본다 */
    "function coMissing(){ return []; }",
    "function coCares(o){ return !!(o && (o.erp || ((o.tags||[]).length))); }"
  ].join('\n'), ctx);
  vm.runInContext(coListBlock(), ctx);
  const total = (extra && extra._total) || rows.length;
  return ctx.coListHtml({ rows: rows, total: total, page: 0, pages: 1, size: 200,
                          from: rows.length ? 1 : 0, to: rows.length });
}
const row = o => Object.assign({ cards: [], docs: 0, erp: null, tags: [], bizno: '' }, o);
const ROWS = [row({ key: 'k1', name: '가나기업' }), row({ key: 'k2', name: '다라기업' })];

test('고른 것이 없으면 도구줄이 아예 없다', () => {
  const h = runList(ROWS, {});
  assert.ok(h.indexOf('coselbar') < 0, '아무것도 안 골랐는데 도구줄이 떴다');
  assert.ok(h.indexOf('cosellift') < 0, '아무것도 안 골랐는데 감싸개가 떴다');
});

test('한 곳이라도 고르면 도구줄이 뜨고 몇 곳인지 말한다', () => {
  const h = runList(ROWS, { k1: 1 });
  assert.ok(h.indexOf('class="coselbar"') >= 0, '고른 것이 있는데 도구줄이 없다');
  assert.ok(h.indexOf('1곳 선택') >= 0, '몇 곳을 골랐는지 안 보인다');
  const h2 = runList(ROWS, { k1: 1, k2: 1 });
  assert.ok(h2.indexOf('2곳 선택') >= 0, '고른 수가 안 따라온다');
});

test('★ 예전 단추가 하나도 안 빠졌다 — 자리만 옮겼지 기능을 손대지 않았다', () => {
  const h = runList(ROWS, { k1: 1 }, { coFolder: 'f1' });
  ['onclick="coMoveToFolder()"', 'onclick="coAssignTag()"', 'onclick="coAssignFTab()"',
   'onclick="state.coSel={};renderCoAny()"', 'onclick="coClearOrg()"'
  ].forEach(s => assert.ok(h.indexOf(s) >= 0, '단추가 사라졌다: ' + s));
});

test('「→ N곳 모두」도 그대로 도구줄 안에 있다', () => {
  /* 이 쪽을 다 골랐는데 찾은 결과가 더 있을 때만 나온다 */
  const h = runList(ROWS, { k1: 1, k2: 1 }, { _total: 4138 });
  assert.ok(h.indexOf('coSelAllMatching()') >= 0, '「N곳 모두」가 사라졌다');
  const bar = h.slice(h.indexOf('class="coselbar"'));
  assert.ok(bar.indexOf('coSelAllMatching()') >= 0, '「N곳 모두」가 도구줄 밖으로 나갔다');
});

test('★ 도구줄은 표와 쪽넘김 «뒤»에 온다 — 붙어 따라와도 마지막 줄·쪽넘김을 안 덮는다', () => {
  const h = runList(ROWS, { k1: 1 });
  const tbl = h.indexOf('</table>');
  const pager = h.indexOf('class="copager"');
  const bar = h.indexOf('cosellift');
  assert.ok(tbl > 0 && pager > tbl, '표 뒤의 쪽넘김을 찾지 못했습니다');
  assert.ok(bar > pager,
    '도구줄이 쪽넘김보다 앞에 있다 — sticky 가 흐름의 마지막 자리에 없으면 쪽넘김을 덮는다');
});

test('★ 붙어 따라오는 감싸개는 «아래»에 붙는다 — 위는 표 머리(thead)가 이미 쓴다', () => {
  const css = block('.cosellift{', '\n.corow[draggable');
  assert.match(css, /position:sticky/, '감싸개가 붙어 따라오지 않는다');
  assert.match(css, /bottom:0/, '아래에 안 붙는다');
  assert.doesNotMatch(css, /top:0/, '위에 붙이면 표 머리(.cotbl thead th{top:0})와 겹친다');
  /* 표 머리가 여전히 위에 붙어 있어야 「전체 고르기」 네모가 안 사라진다 */
  assert.match(src, /\.cotbl thead th\{position:sticky;top:0/, '표 머리의 붙박이가 사라졌다');
});

test('★ 붙박이 감싸개가 폰으로 새지 않는다 — 폰에는 제 도구줄이 있다', () => {
  const m = mobileBlock();
  assert.ok(m.indexOf('coselbar') >= 0, '폰 도구줄이 사라졌다');
  assert.ok(m.indexOf('cosellift') < 0, '폰 목록에 PC 감싸개가 붙었다');
});

test('★ PC 명함/사업자 화면으로도 안 샌다 — 그쪽은 #selbar 가 맡는다', () => {
  /* .cosellift 는 «모양(CSS)»과 «기업 상세 표(coListHtml)» 두 자리에만 있어야 한다.
     그 둘을 덜어 낸 나머지 전부에 한 번도 안 나와야 다른 화면으로 안 샌 것이다. */
  assert.ok(coListBlock().indexOf('cosellift') >= 0, '기업 상세 표에 감싸개가 없다');
  const css = block('.cosellift{', '\n.corow[draggable');
  const rest = src.replace(css, '').replace(coListBlock(), '');
  assert.ok(rest.indexOf('cosellift') < 0,
    '.cosellift 가 모양·기업 상세 표 말고 다른 자리에도 있다 — 다른 화면으로 샌다');
  /* 명함 도구줄은 여전히 제 함수 하나가 맡는다 */
  assert.match(src, /function renderSelbar\(\)/, '명함 도구줄(renderSelbar)이 사라졌다');
  assert.ok(block('function renderSelbar()', '\nfunction setSelScope').indexOf('coselbar') < 0,
    '명함 도구줄이 기업 상세 도구줄을 쓰기 시작했다');
});

/* ══════ ② 끌어 옮기기 — 표 쪽 배선 ══════ */
test('★ 체크한 줄만 끌 수 있다 — 안 고른 줄은 끌어도 아무 일이 없다', () => {
  const h = runList(ROWS, { k1: 1 });
  /* ⚠ 닫는 따옴표까지 붙여 자르지 않는다 — 고른 줄에는 표시 클래스가 하나 더 붙는다
     (2026-08-17 끌어서 고르기). 여기서 볼 것은 «어느 줄이 끌리는가» 뿐이다. */
  const rows = h.split('<tr class="corow').slice(1);
  assert.equal(rows.length, 2, '줄이 둘이 아니다');
  assert.ok(rows[0].indexOf('draggable="true"') >= 0, '고른 줄이 안 끌린다');
  assert.ok(rows[1].indexOf('draggable="false"') >= 0, '안 고른 줄이 끌린다');
});

test('표 줄이 회사 드래그를 건다 — 순서 드래그(onOrdDragStart)와 다른 손잡이다', () => {
  const b = coListBlock();
  assert.match(b, /ondragstart="onCoRowDragStart\(event,'\$\{kJs\}'\)"/, '줄에 회사 드래그가 없다');
  assert.match(b, /ondragend="onCoRowDragEnd\(event\)"/, '끝냄 손잡이가 없다');
  assert.ok(b.indexOf('onOrdDragStart') < 0, '표 줄에 순서 드래그가 섞였다');
});

test('★ 옆줄 기업 상세 폴더 줄이 «회사 드롭»도 받는다 — 순서 손잡이는 그대로', () => {
  const s = sideBlock();
  const at = s.indexOf("onOrdDragStart(event,'cofolder'");
  assert.ok(at > 0, '기업 상세 폴더 줄을 찾지 못했습니다');
  const end = s.indexOf('</div>', at);
  const rowHtml = s.slice(at, end);
  assert.match(rowHtml, /onOrdDrop\(event,'cofolder'/, '순서 드롭이 사라졌다');
  assert.match(rowHtml, /onCoFolderDrop\(event,'\$\{f\.id\}'\)/, '회사 드롭이 안 걸렸다');
  assert.match(rowHtml, /onCoFolderDragOver\(event\)/, '「여기에 놓입니다」 표시가 없다');
  assert.match(rowHtml, /onCoFolderDragLeave\(event\)/, '표시를 지우는 손잡이가 없다');
  assert.match(rowHtml, /onOrdDragOver\(event\)/, '순서선 그리기가 사라졌다');
});

test('★ 회사를 폴더로 옮기는 것은 대표 전용이 아니다 — 직원도 하던 일이다', () => {
  const b = block('let _dragCo = null;', '/* ── 사이드바 폭 조절(PC) ── */');
  assert.ok(b.indexOf('isAdmin') < 0,
    '회사 끌어 옮기기가 state.isAdmin 뒤로 숨었다 — 「📁 폴더로 옮기기」는 누구나 쓴다');
  /* 폴더 «순서» 바꾸기는 여전히 대표만이다 */
  assert.match(block('function onOrdDragStart(', '\nfunction ordUnmark'), /if\(!state\.isAdmin\) return;/,
    '폴더 순서 드래그의 대표 관문이 사라졌다');
  assert.match(sideBlock(), /draggable="\$\{state\.isAdmin \? 'true' : 'false'\}"/,
    '옆줄 폴더 줄의 draggable 이 대표로 안 갈린다');
});

/* ══════ ② 끌어 옮기기 — 손놀림을 실제로 돌려 본다 ══════
   경계: reorderList 부터 onCoFolderDrop 의 끝까지 — 세 드래그가 갈리는 자리가 다 들어온다. */
function loadDrag(opts){
  opts = opts || {};
  const at = src.indexOf('function reorderList(');
  const dAt = src.indexOf('function onCoFolderDrop(', at);
  const end = src.indexOf('\n}', dAt) + 2;
  assert.ok(at > 0 && dAt > at && end > dAt, 'reorderList~onCoFolderDrop 사이를 찾지 못했습니다');
  const moved = [], saved = [], toasts = [];
  const ctx = {
    DB_ROOT: 'pucards',
    state: { isAdmin: opts.isAdmin !== false, coSel: opts.coSel || {},
             groups: opts.groups || {}, views: {}, priv: { groups: {} }, tab: 'card', group: 'all' },
    _coFolders: opts.coFolders || {},
    toast: m => toasts.push(m),
    render: () => {},
    document: { querySelectorAll: () => [] },
    coMoveSelTo: fid => { moved.push(fid); return Promise.resolve(); },
    Store: { mode: 'firebase', db: { ref: () => ({ update: () => Promise.resolve() }) } }
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('function coFTabList('),
                            src.indexOf('\n}', src.indexOf('function coFTabList(')) + 2), ctx);
  vm.runInContext(src.slice(at, end), ctx);
  /* saveOrder 는 실제로 저장까지 가므로 여기서 «불렸는지»만 본다 */
  ctx.saveOrder = function(){ saved.push(Array.prototype.slice.call(arguments)); };
  ctx._moved = moved; ctx._saved = saved; ctx._toasts = toasts;
  return ctx;
}
/* ⚠ 신호들은 let 으로 선언돼 있어 vm 바깥(ctx)의 칸으로 안 보인다 — realm 안에서 읽는다 */
const peek = (c, name) => vm.runInContext(name, c);
function fakeRow(rect){
  const on = new Set();
  return { _on: on, getBoundingClientRect: () => rect || { top: 0, bottom: 20, left: 0, right: 100 },
           classList: { add: c => on.add(c), remove: c => on.delete(c), contains: c => on.has(c) } };
}
const evt = el => ({ currentTarget: el, target: el, clientX: 5, clientY: 5,
  preventDefault(){ this._pd = true; }, stopPropagation(){}, dataTransfer: { setData(){}, } });

test('★ 고른 회사를 폴더 줄에 놓으면 coMoveSelTo 를 그 폴더로 부른다', () => {
  const c = loadDrag({ coSel: { k1: 1, k2: 1 } });
  const tr = fakeRow();
  c.onCoRowDragStart(evt(tr), 'k1');
  assert.ok(peek(c, '_dragCo'), '회사 드래그 신호가 안 켜졌다');
  /* vm 안에서 만든 배열은 realm 이 달라 그대로 견주면 어긋난다 — JSON 왕복으로 맞춘다 */
  assert.deepEqual(JSON.parse(JSON.stringify(peek(c, '_dragCo.keys'))).sort(), ['k1', 'k2'],
    '끌면 «고른 것 전부»가 함께 가야 한다');
  const fr = fakeRow();
  c.onCoFolderDrop(evt(fr), 'f9');
  assert.deepEqual(c._moved, ['f9'], 'coMoveSelTo 가 그 폴더로 안 불렸다');
  assert.equal(c._saved.length, 0, '회사를 옮기다가 폴더 순서까지 바뀌었다');
  assert.equal(peek(c, '_dragCo'), null, '놓고 나서 신호를 안 비웠다');
});

test('★ 옮기는 길은 하나뿐 — 드롭이 제 손으로 저장하지 않는다(coMoveSelTo 만 부른다)', () => {
  const fn = block('function onCoFolderDrop(', '\n}\n');
  assert.match(fn, /coMoveSelTo\(folderId\)/, 'coMoveSelTo 를 안 쓴다');
  assert.ok(fn.indexOf('Store.db') < 0, '드롭이 제 손으로 저장한다 — 옮기는 길이 두 벌이 된다');
  assert.ok(fn.indexOf('coInfo/') < 0, '드롭이 제 손으로 경로를 쓴다 — 옛 이름 열쇠 비우기가 빠진다');
});

test('★ 체크 안 한 줄을 끌면 아무 일도 안 일어난다 — 골라 둔 것도 안 흐트러진다', () => {
  const c = loadDrag({ coSel: { k1: 1 } });
  c.onCoRowDragStart(evt(fakeRow()), 'k9');
  assert.equal(peek(c, '_dragCo'), null, '안 고른 줄인데 회사 드래그가 켜졌다');
  c.onCoFolderDrop(evt(fakeRow()), 'f9');
  assert.deepEqual(c._moved, [], '안 고른 줄을 끌었는데 회사가 옮겨졌다');
  assert.deepEqual(Object.keys(c.state.coSel), ['k1'], '골라 둔 것이 흐트러졌다');
});

test('「여기에 놓입니다」 표시는 회사를 끌 때만 붙고, 떠나면 지워진다', () => {
  const c = loadDrag({ coSel: { k1: 1 } });
  const fr = fakeRow();
  c.onCoFolderDragOver(evt(fr));
  assert.ok(!fr._on.has('codrop'), '아무것도 안 끄는데 표시가 붙었다');
  c.onCoRowDragStart(evt(fakeRow()), 'k1');
  c.onCoFolderDragOver(evt(fr));
  assert.ok(fr._on.has('codrop'), '회사를 끄는데 표시가 안 붙었다');
  c.onCoFolderDragLeave(evt(fr));
  assert.ok(!fr._on.has('codrop'), '떠났는데 표시가 남았다');
});

/* ══════ ★ 세 드래그가 섞이지 않는다 ══════ */
test('★ 폴더 순서를 바꾸는 중에는 회사가 옮겨지지 않는다', () => {
  /* 옆줄 폴더 줄은 onOrdDrop 다음에 onCoFolderDrop 을 «차례로» 부른다 — 화면과 같은 차례로 돌린다.
     ⚠ 회사를 골라 «둔 채로» 폴더 순서를 바꾸는 것이 진짜 상황이다(14곳 골라 놓고 폴더를
       끌어 올린다). 고른 것이 없으면 신호를 안 가려도 우연히 통과한다. */
  const c = loadDrag({ coSel: { k1: 1, k2: 1 },
                       coFolders: { f1: { id: 'f1', order: 1 }, f2: { id: 'f2', order: 2 } } });
  c.onOrdDragStart(evt(fakeRow()), 'cofolder', 'f1', '');
  assert.ok(peek(c, '_dragOrd'), '순서 드래그 신호가 안 켜졌다');
  assert.equal(peek(c, '_dragCo'), null, '순서를 끄는데 회사 신호까지 켜졌다');
  const fr = fakeRow();
  c.onOrdDrop(evt(fr), 'cofolder', 'f2', '');
  c.onCoFolderDrop(evt(fr), 'f2');
  assert.equal(c._saved.length, 1, '폴더 순서 바꾸기가 안 일어났다 — 기존 기능이 깨졌다');
  assert.deepEqual(c._moved, [], '순서를 바꾸려다 회사가 옮겨졌다');
});

test('★ 회사를 끄는 중에는 폴더 순서가 바뀌지 않는다', () => {
  const c = loadDrag({ coSel: { k1: 1 }, coFolders: { f1: { id: 'f1', order: 1 }, f2: { id: 'f2', order: 2 } } });
  c.onCoRowDragStart(evt(fakeRow()), 'k1');
  const fr = fakeRow();
  c.onOrdDrop(evt(fr), 'cofolder', 'f2', '');
  c.onCoFolderDrop(evt(fr), 'f2');
  assert.equal(c._saved.length, 0, '회사를 옮기려는데 폴더 순서가 바뀌었다');
  assert.deepEqual(c._moved, ['f2'], '회사가 안 옮겨졌다');
});

test('★ 회사를 끌기 시작하면 명함·폴더 신호를 비운다 — 명함 줄에 떨어져도 명함이 안 움직인다', () => {
  const b = block('function onCoRowDragStart(', '\nfunction onCoRowDragEnd');
  assert.match(b, /dragId = null;\s*dragFolderId = null;\s*_dragOrd = null;/,
    '회사 드래그를 켤 때 나머지 신호를 안 비운다 — 두 신호가 같이 켜지면 사고가 난다');
});

test('★ 명함을 폴더로 끌어 넣는 기존 기능이 그대로다', () => {
  const fn = block('function onFolderOrCardDrop(', '\n}\n');
  assert.match(fn, /if\(_dragOrd\) return;/, '순서 드래그와 가르는 관문이 사라졌다');
  assert.match(fn, /it\.group\s*=\s*targetGid/, '명함을 폴더로 옮기는 길이 사라졌다');
  assert.match(fn, /Store\.put\(it\)/, '명함 저장이 사라졌다');
  /* 명함 폴더 줄의 배선도 그대로 */
  assert.match(sideBlock(), /onFolderOrCardDrop\(event,'\$\{g\.id\}'\)/, '명함 폴더 줄의 드롭이 사라졌다');
});

test('명함을 끄는 중에는 회사 드롭이 안 탄다 — 신호가 셋 따로다', () => {
  const c = loadDrag({ coSel: { k1: 1 } });
  c.dragId = 'card-1';                 /* 명함을 끄는 중 — 회사 신호는 꺼져 있다 */
  assert.equal(peek(c, '_dragCo'), null, '아무것도 안 끌었는데 회사 신호가 켜져 있다');
  const fr = fakeRow();
  c.onCoFolderDrop(evt(fr), 'f3');
  assert.deepEqual(c._moved, [], '명함을 끄는데 회사가 옮겨졌다');
});

test('★ 세 신호는 서로 다른 이름으로 «따로» 산다', () => {
  assert.match(src, /\nlet dragId=null;/, '명함 신호(dragId)가 사라졌다');
  assert.match(src, /\nlet _dragOrd = null;/, '순서 신호(_dragOrd)가 사라졌다');
  assert.match(src, /\nlet _dragCo = null;/, '회사 신호(_dragCo)가 사라졌다');
});
