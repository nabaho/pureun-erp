/* 여러 쪽 문서 — 한 칸으로 접고, 나누고, 묶는다 (대표 지시 2026-08-13)
   "계약서의 경우 2장이 있는데 각각 분리하는 것은 의미가 없다. 2장을 하나로
    정리하는 게 좋은데 어떻게 하는 게 가장 적절한가. 그리고 만약 각각 2장을
    나눠서 OCR 해야 되는데 합쳐서 처리한 건 어떻게 나누게 하는 게 좋은가"

   ⚠ 이 기능에서 가장 위험한 것은 **한 칸이 여섯 장을 대신한다는 사실을
     사람이 모르는 것**이다. 한 장인 줄 알고 지우면 여섯 장이 사라진다.
     그래서 칸에 「6쪽」을 적고, 고르기·세기가 전부 장 단위로 움직인다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js', 'pu-photo-store.js'), 'utf8');

function fnOf(src, name, indent) {
  const pad = indent || '';
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n' + pad + '\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

function load(names) {
  const ctx = { Object, Array, String };
  vm.createContext(ctx);
  names.forEach(function (n) { vm.runInContext(fnOf(app, n), ctx); });
  return ctx;
}

const doc = (g, page) => ({ doc: { group: g, page: page, total: 3, name: '위임계약서' } });

/* ⚠ vm 안에서 만든 배열은 밖의 배열과 **다른 종류**로 취급된다(deepEqual 이 튕긴다).
   알맹이만 견주려고 글자로 이어 붙인다. */
const joined = (a) => Array.prototype.join.call(a || [], ',');

/* ── ② 접기 ── */
test('★ 같은 문서의 쪽들이 한 칸으로 접힌다', () => {
  const c = load(['foldDocs']);
  const out = c.foldDocs([
    { id: 'a', meta: doc('g1', 1) },
    { id: 'b', meta: doc('g1', 2) },
    { id: 'c', meta: doc('g1', 3) },
    { id: 'z', meta: {} }
  ]);
  assert.equal(out.length, 2, '3쪽 문서 + 홑장 1장 = 두 칸이어야 합니다');
  assert.equal(out[0].id, 'a', '첫 쪽이 대표로 서야 합니다');
  assert.equal(joined(out[0]._pages), 'a,b,c', '쪽이 빠지면 지우기가 1장만 지웁니다');
  assert.equal(out[1].id, 'z');
  assert.equal(out[1]._pages, undefined, '홑장에 쪽 목록을 달면 헛일이 늡니다');
});

test('★ 원래 것을 고치지 않는다 — 접기는 보여 주는 방식일 뿐', () => {
  const c = load(['foldDocs']);
  const a = { id: 'a', meta: doc('g1', 1) };
  const out = c.foldDocs([a, { id: 'b', meta: doc('g1', 2) }]);
  assert.equal(a._pages, undefined,
    '원본에 쪽 목록을 달면 다음에 거를 때 옛 목록이 남아 엉뚱한 장이 딸려옵니다');
  assert.notEqual(out[0], a, '사본이어야 합니다');
  assert.equal(out[0].meta, a.meta, '정보는 그대로 가리켜야 판독 결과가 안 끊깁니다');
});

test('★ 걸러서 첫 쪽이 빠졌으면 남은 것 중 첫 쪽이 대표가 된다', () => {
  /* 대표를 못 찾아 문서가 통째로 사라지면 안 된다 */
  const c = load(['foldDocs']);
  const out = c.foldDocs([
    { id: 'b', meta: doc('g1', 2) },
    { id: 'c', meta: doc('g1', 3) }
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'b');
  assert.equal(joined(out[0]._pages), 'b,c');
});

test('★ 다른 문서끼리는 안 섞인다', () => {
  /* ⚠ 묶음 번호(group)가 아니라 「doc 이 있나」로만 가르면 **모든 문서가
     하나로 뭉친다** — 계약서 6쪽과 신청서 2쪽이 한 칸이 되고, 그 칸을 지우면
     남의 문서까지 함께 사라진다. 처음에 이 변형이 안 잡혔다. */
  const c = load(['foldDocs']);
  const out = c.foldDocs([
    { id: 'a', meta: doc('g1', 1) },
    { id: 'x', meta: doc('g2', 1) },
    { id: 'b', meta: doc('g1', 2) },
    { id: 'y', meta: doc('g2', 2) }
  ]);
  assert.equal(out.length, 2, '다른 문서 둘이 한 칸으로 뭉쳤습니다');
  assert.equal(joined(out[0]._pages), 'a,b', '계약서 쪽에 남의 문서가 섞였습니다');
  assert.equal(joined(out[1]._pages), 'x,y');
  /* 묶음 번호를 실제로 보는지 — 번호만 다르고 나머지가 같아도 갈려야 한다 */
  const two = c.foldDocs([
    { id: 'p', meta: { doc: { group: 'A', page: 1 } } },
    { id: 'q', meta: { doc: { group: 'B', page: 1 } } }
  ]);
  assert.equal(two.length, 2, '묶음 번호가 다른데 한 칸이 됐습니다');
});

test('★ 세는 것은 칸이 아니라 장이다', () => {
  /* 「5장」이라 해 놓고 「10장 지우기」가 되면 말이 어긋난다 */
  const ctx = { Object, Array };
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'idsOf'), ctx);
  vm.runInContext('var shownItems = function(){ return [' +
    '{ id: "a", _pages: ["a","b","c"] }, { id: "z" }' +
    ']; };', ctx);
  vm.runInContext(fnOf(app, 'shownCount'), ctx);
  assert.equal(ctx.shownCount(), 4, '접힌 문서를 한 장으로 세면 장수가 거짓말이 됩니다');
});

test('★ 도구줄이 장수를 쓴다 — 실제로 돌려 본다', () => {
  /* ⚠ 「shownCount 라는 글자가 있나」만 보면 안 잡힌다 — 도구줄이 다시
     shownItems().length 로 돌아가도 통과한다(처음에 그 변형이 안 잡혔다).
     그래서 돌려서 화면에 적히는 숫자를 본다. */
  const el = {};
  const mk = function (id) { return (el[id] = el[id] || { style: {}, textContent: '', innerHTML: '', disabled: false, title: '',
    /* 2026-08-30: 장수 딱지가 꾸밈을 붙였다 떼고 속을 갈아 끼운다 */
    classList: { _on: {},
      toggle: function (c, on) { if (on) this._on[c] = 1; else delete this._on[c]; },
      add: function (c) { this._on[c] = 1; }, remove: function (c) { delete this._on[c]; } } }); };
  const ctx = {
    Object, Array, Set, String,
    selected: new Set(),
    shownItems: function () { return [{ id: 'a', _pages: ['a', 'b', 'c'] }, { id: 'z' }]; },
    gridItems: [],
    needOnly: false, oldOnly: false, gridQ: '', reading: false, sending: false,
    gridYear: String(new Date().getFullYear()),
    viewingOther: function () { return false; },
    /* 2026-08-28: 도구줄이 «막는 쪽과 같은 기준»(mayTouch)을 본다 — 안 주면 멎는다 */
    mayTouch: function () { return true; },
    /* 2026-09-03: 공유 칸은 «넘길 수 있는 것»(shareableSel)으로 뜬다 — 안 주면 멎는다 */
    shareableSel: function () { return Array.from(ctx.selected); },
    canSend: function () { return false; },
    /* ⚠ 2026-08-24 — 「N장 판독」은 다시 걸어 볼 값이 있는 것만 세고(readableSel),
       「N장 확인했음」은 확인이 필요한 것만 센다(needsCheck). 둘을 안 주면 도구줄이
       그 자리에서 멎어 이 검사가 통째로 운다. */
    worthRetry: function () { return true; },
    /* ⚠ 2026-08-31: 자동 판독이 «실패한 것»도 다시 건다(직원 보고 「OCR 안 읽히는 게 많다」).
       이 파일의 주제는 여러 쪽 문서를 한 번만 읽는가이므로, 여기서는 실패한 것이
       없다고 둔다 — 안 주면 autoReadPending 이 그 자리에서 멎는다. */
    failedRead: function () { return false; },
    AUTO_RETRY_MAX: 5,
    needsCheck: function () { return false; },
    renderNeedBox() {}, renderOldBox() {}, renderBackBar() {},
    renderUidCard() {},   /* 2026-08-26: 서식으로 잡힌 고유번호증 칸이 늘었다 */
    renderPhMenuBtn() {}, renderPhNeedBtn() {}, renderGotCard() {}, renderOwnerSelLabel() {},
    /* 2026-08-30: 도구줄이 «왼쪽 칸 고르기»가 열려 있는지 본다 */
    _sharePick: null, closeSharePick() {},
    /* 2026-08-29: 내 사진에 공유받은 것이 섞인다 — 칩·거르기가 이 셋을 쓴다 */
    isSharedItem() { return false; }, sharedByName() { return ''; }, sharedOnly: false,
    ALL_OWNERS: '__all__', gridOwner: null, renderPayNote() {},
    $: mk
  };
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'idsOf'), ctx);
  vm.runInContext(fnOf(app, 'shownCount'), ctx);
  vm.runInContext(fnOf(app, 'readableSel'), ctx);
  /* 2026-08-28: 도구줄이 숫자 규칙(cnt)을 쓴다 — 안 주면 그 자리에서 멎는다 */
  vm.runInContext(fnOf(app, 'cnt'), ctx);
  /* 2026-08-29: 「👥 공유」가 도구줄에서 «누구 사진 아래»로 내려갔고, 기준이 하나여야
     하므로 도구줄이 그 칸을 함께 그린다 — 안 주면 그 자리에서 멎는다 */
  vm.runInContext(fnOf(app, 'renderShareCard'), ctx);
  vm.runInContext(fnOf(app, 'renderGridBar'), ctx);
  ctx.renderGridBar();
  /* ⚠ 2026-08-26 — 장수가 적히는 자리가 옮겨졌다. 예사 때는 「☑ 전부 N장」 단추가
     그 말을 하고, gridCount 는 비워 둔다(윗줄을 한 줄로 합치며 같은 말을 두 번
     적지 않기로 했다). 그래서 «화면 어딘가에» 4장이 적혔는지를 본다 —
     자리가 또 옮겨져도 숫자가 거짓이 되는 것만은 잡힌다. */
  /* ⚠ 2026-08-30 — 장수가 또 옮겨졌다. 「☑ 전부」 단추에서 숫자를 뺐다(같은 수가 바로
     위 칸에 이미 있었다). 이제 얹었을 때 나오는 말(title)과 고른 딱지에 있다.
     ⚠ 이 검사가 지키는 것은 **자리**가 아니라 「접힌 문서를 칸이 아니라 장으로 세는가」다.
       그래서 «적히는 곳을 다 모아» 본다 — 또 옮겨져도 숫자가 거짓이 되는 것만은 잡는다. */
  const said = Object.keys(el).map(function (k) {
    return [el[k].textContent, el[k].title, el[k].innerHTML].filter(Boolean).join(' ');
  }).join(' | ');
  assert.match(said, /4장/,
    '접힌 문서를 한 칸으로 세면 「2장」이라 적고 4장을 지웁니다: ' + said);
  assert.ok(!/(^|[^\d])2장/.test(said),
    '칸 수(2장)를 적고 있습니다 — 지우기는 4장을 지웁니다: ' + said);

  /* 찾는 중에는 단추가 말해 주지 않으므로 gridCount 가 장수를 적어야 한다 */
  ctx.gridQ = '세무';
  ctx.renderGridBar();
  assert.match(el.gridCount.textContent, /4장/,
    '찾은 결과의 장수가 칸 수로 적힙니다: ' + el.gridCount.textContent);
});

test('★ 칸에 몇 쪽짜리인지 적는다', () => {
  const g = app.match(/function renderGrid\(\)[\s\S]*?\n\}/)[0];
  assert.match(g, /const pageN = idsOf\(it\)\.length;/);
  assert.match(g, /pageN > 1 \? '<span class="pgs">📄 ' \+ pageN \+ '쪽<\/span>' : ''/,
    '몇 쪽인지 안 적으면 한 장인 줄 알고 지웠다가 여섯 장이 사라집니다');
  assert.match(g, /\+ tag \+ stack \+/, '만들어 놓고 안 붙이면 화면에 없습니다');
  assert.match(app, /#grid \.cell \.pgs\{/, '표 꾸밈이 없습니다');
  /* 날짜 줄 장수도 장 단위 */
  assert.match(g, /counts\[k\] = \(counts\[k\] \|\| 0\) \+ idsOf\(it\)\.length;/,
    '날짜 줄이 칸 수를 세면 「1장」이라 적고 6장을 고릅니다');
});

test('★ 걸러본 결과에 접기를 실제로 건다', () => {
  /* ⚠ 「return foldDocs(list);」 라는 **글자 그대로**를 보던 검사였다.
     2026-08-15 제목순 정렬이 들어오며 접은 결과를 한 번 변수에 받게 되자
     멀쩡한 코드에서 터졌다. 볼 것은 모양이 아니라 **접은 것을 돌려주는가** 다. */
  const f = fnOf(app, 'shownItemsFresh');
  assert.match(f, /foldDocs\(list\)/, '접기를 아예 안 겁니다');
  assert.doesNotMatch(f, /return list;/,
    '만들어만 두고 안 걸면 목록은 그대로 흩어져 보입니다');
});

test('★ 제목순으로 견주는 것은 접은 뒤다 — 쪽이 따로 흩어지면 안 된다', () => {
  /* 여러 쪽 문서는 대표 한 칸으로 접힌다. 접기 전에 정렬하면 2쪽·3쪽이
     제 자리를 잡았다가 접히며 사라져 묶음 장수가 어긋난다. */
  const f = fnOf(app, 'shownItemsFresh');
  const fold = f.indexOf('foldDocs(list)');
  const sort = f.indexOf('comparePhotosByTitle');
  assert.ok(fold > 0 && sort > fold, '★ 접기보다 먼저 정렬하면 쪽이 흩어집니다');
});

/* ── ③ 나누기·묶기 ── */
test('★ 저장 층이 묶음 칸만 한 번에 고친다', () => {
  const f = fnOf(store, 'setDocs', '  ');
  assert.match(f, /metaPath\(year, e\.id, owner\) \+ '\/doc'/, '엉뚱한 칸을 고칩니다');
  assert.match(f, /if \(!e \|\| !e\.id\) return;/,
    '번호가 없으면 상위 노드를 가리켜 그 해 사진이 통째로 날아갑니다');
  assert.match(f, /deps\.db\.ref\(\)\.update\(u\)/,
    '나눠 쓰면 중간에 끊겼을 때 반쪽만 묶인 상태가 됩니다');
  assert.ok(!/blobPath|thumbPath/.test(f), '사진 본문은 건드리면 안 됩니다');
  assert.match(store, /setDocs: setDocs/, '밖으로 내주지 않습니다');
});

test('★ 쪽마다 따로 읽기 — 묶음을 풀고 각각 다시 읽는다', () => {
  const f = fnOf(app, 'splitDocPages');
  assert.match(f, /blockedIfOther\(viewerId\)/, '남의 사진을 고치면 안 됩니다');
  assert.match(f, /confirm\(/, '읽어 둔 결과가 바뀌는 일이라 먼저 물어야 합니다');
  assert.match(f, /doc: null/, '묶음을 안 풀면 여전히 한 덩어리로 읽습니다');
  assert.match(f, /delete meta\.doc;/,
    '화면 값도 함께 풀어야 새로고침 전까지 접힌 채로 안 보입니다');
  assert.match(f, /queuePhotoRead\(id\)/, '풀기만 하고 다시 안 읽으면 옛 결과가 남습니다');
  assert.match(f, /catch\(/, '실패해도 조용하면 안 됩니다');
});

test('★ 이 쪽만 떼어내기 — 남은 쪽이 하나면 그것도 푼다', () => {
  /* 「1쪽짜리 문서」는 뜻이 없다 — 접힌 칸에 「1쪽」이라 적히는 우스운 상태가 된다 */
  const f = fnOf(app, 'detachOnePage');
  assert.match(f, /if \(rest\.length === 1\) ups\.push\(\{ id: rest\[0\]\.id, doc: null \}\);/,
    '남은 한 장이 「1쪽짜리 문서」로 남습니다');
  assert.match(f, /blockedIfOther\(viewerId\)/);
});

test('★ 한 문서로 묶기 — 촬영 시각 순으로 쪽을 매긴다', () => {
  const f = fnOf(app, 'mergeSelectedDoc');
  assert.match(f, /ids\.length < 2/, '한 장으로는 묶을 것이 없습니다');
  assert.match(f, /sort\(function \(a, b\) \{ return \(a\.meta\.takenAt \|\| 0\) - \(b\.meta\.takenAt \|\| 0\); \}\)/,
    '고른 차례로 매기면 사람마다 쪽 순서가 달라집니다');
  assert.match(f, /page: i \+ 1, total: total, taken: total, group: group/,
    '판독이 문서를 모으는 데 쓰는 칸이 빠지면 안 됩니다');
  assert.match(f, /blockedIfOther\(ids\)/);
  assert.match(f, /selected\.clear\(\)/, '묶고 나서도 골라진 채면 다음 손짓이 엉뚱해집니다');
});

test('★ 묶기 단추는 두 장 이상 골랐을 때만 뜬다', () => {
  const f = fnOf(app, 'renderGridBar');
  /* ⚠ 2026-08-28: 「남의 사진인가」 판정이 mayTouch 로 모였다 — 화면과 막는 쪽이
     같은 기준을 쓰게 하려는 것이다. 지킬 것은 그대로: 두 장 이상 + 손댈 수 있을 때. */
  assert.match(f, /\$\('mergeBtn'\)\.style\.display = \(n >= 2 && touch\) \? 'inline-block' : 'none';/,
    '한 장일 때도 뜨면 눌러도 아무 일이 없는 헛단추가 됩니다');
  assert.match(f, /const touch = mayTouch\(Array\.from\(selected\)\);/,
    '★ 화면이 막는 쪽과 다른 기준을 쓰면 「눌러도 되는데 단추가 없는」 자리가 생깁니다');
  assert.match(app, /id="mergeBtn"[^>]*onclick="mergeSelectedDoc\(\)"/);
});

/* 2026-08-13 부터 쪽 넘기기 **단추**는 맨 위 도구줄(docNavBtns)이 갖는다.
   본문의 docNav 는 「무엇의 몇 쪽인가」를 말로만 적는다 — 같은 일을 두 번 하지 않는다. */
test('★ 크게 보기에서 쪽을 넘길 수 있다', () => {
  const c = load(['docNavBtns']);
  vm.runInContext('var esc = function(s){ return String(s); };' +
    'var viewerId = "b";' +
    'var docPages = function(){ return [{id:"a"},{id:"b"},{id:"c"}]; };', c);
  const h = c.docNavBtns();
  assert.match(h, /2\/3쪽/, '몇 쪽 중 몇 쪽인지 안 적으면 어디인지 모릅니다');
  assert.match(h, /openViewer\('a'\)/, '앞쪽으로 못 갑니다');
  assert.match(h, /openViewer\('c'\)/, '다음쪽으로 못 갑니다');

  /* 첫 쪽에서는 앞쪽이 잠긴다 */
  vm.runInContext('viewerId = "a";', c);
  assert.match(c.docNavBtns(), /disabled title="◀"/, '없는 쪽으로 가는 단추가 살아 있습니다');

  /* 홑장에는 아예 안 그린다 */
  vm.runInContext('docPages = function(){ return [{id:"a"}]; };', c);
  assert.equal(c.docNavBtns(), '', '홑장에 쪽 넘기기가 뜨면 헛단추입니다');
});

test('본문에도 몇 쪽짜리 문서인지 적는다 — 접힌 문서를 알아볼 길', () => {
  const c = load(['docNav']);
  vm.runInContext('var esc = function(s){ return String(s); };' +
    'var docPages = function(){ return [{id:"a"},{id:"b"},{id:"c"}]; };', c);
  const h = c.docNav({ id: 'b', meta: { doc: { name: '위임계약서' } } });
  assert.match(h, /위임계약서/);
  assert.match(h, /3쪽 중 2쪽/);
  vm.runInContext('docPages = function(){ return [{id:"a"}]; };', c);
  assert.equal(c.docNav({ id: 'a' }), '', '홑장에는 안 적습니다');
});

test('★ 나누기 상자는 여러 쪽일 때만, 남의 사진에는 안 뜬다', () => {
  const c = load(['docSplitBox']);
  vm.runInContext('var viewingOther = function(){ return false; };' +
    'var docPages = function(){ return [{id:"a"},{id:"b"}]; };', c);
  const h = c.docSplitBox({ id: 'a' });
  assert.match(h, /쪽마다 따로 읽기/);
  assert.match(h, /이 쪽만 떼어내기/);

  vm.runInContext('viewingOther = function(){ return true; };', c);
  assert.equal(c.docSplitBox({ id: 'a' }), '', '남의 사진은 보기만 — 고치는 단추가 뜨면 안 됩니다');

  vm.runInContext('viewingOther = function(){ return false; };' +
    'docPages = function(){ return [{id:"a"}]; };', c);
  assert.equal(c.docSplitBox({ id: 'a' }), '', '홑장에 나누기가 뜨면 헛단추입니다');
});

/* ── 판독은 문서마다 한 번만 ──
   ⚠ 이 규칙에는 검사가 **없었다**(2026-08-13 변형 시험에서 드러남). 묶음 번호를
     안 보게 망가뜨려도 아무도 안 잡았고, 그러면 **문서 하나만 읽고 나머지 문서는
     조용히 건너뛴다**. 조용히 건너뛰는 것이 가장 나쁜 고장이다. */
test('★ 판독은 문서마다 한 번만, 그러나 다른 문서는 빠뜨리지 않는다', () => {
  const queued = [];
  const el = { style: {}, textContent: '' };
  const ctx = {
    Object, Array, String, Math,
    AUTO_READ_MAX: 20, AUTO_RESTALE_MAX: 3,
    /* 2026-08-13 부터 판정이 둘로 갈렸다 — 여기서는 「전부 안 읽은 것」으로 둔다.
       문서마다 한 번씩 거르는 규칙은 두 갈래에 **똑같이** 걸려야 한다. */
    neverRead: function () { return true; },
    staleRead: function () { return false; },
    /* 2026-08-31: 실패한 것도 자동으로 다시 건다 — 여기서는 실패한 것이 없다고 둔다.
       ⚠ 그 갈래에도 «문서마다 한 번» 규칙이 똑같이 걸려야 한다(화면에서 filter(oneDoc) 로). */
    failedRead: function () { return false; },
    AUTO_RETRY_MAX: 5,
    /* 2026-08-29: 자동 판독이 **손댈 수 있는 사진만** 읽는다(내 사진에 공유받은 것이
       섞이므로). 여기서는 전부 내 것으로 둔다 — 문서 거르기가 이 검사의 주제다. */
    mayTouch: function () { return true; },
    /* ⚠ needsRead 짝퉁을 걷어냈다(2026-08-27) — 그 함수는 아무도 안 부르던 것이라
       화면에서 사라졌다. 여기 남겨 두면 「아직 쓰는 것」처럼 보인다. */
    queuePhotoRead: function (id) { queued.push(id); },
    $: function () { return el; },
    /* 2026-09-07: 사진을 구글로 안 보내는 **문지기**가 붙었다. 여기서는 전부 통과로
       둔다 — 이 검사의 주제는 «문서마다 한 번»이다. 문지기 자체는 photos-read-gate 가 본다.
       ⚠ 한도(readQuotaOut)는 거짓으로 둔다. 참이면 한 장도 안 걸려 이 검사가 통째로 운다 —
         그것은 «판독을 멈춘 것»이지 문서 거르기가 틀린 것이 아니다. */
    readSkipWhy: function () { return ''; },
    renderReadAsk: function () { },
    gridItems: [
      { id: 'a', meta: doc('g1', 1) }, { id: 'b', meta: doc('g1', 2) },
      { id: 'x', meta: doc('g2', 1) }, { id: 'y', meta: doc('g2', 2) },
      { id: 'z', meta: {} }
    ]
  };
  vm.createContext(ctx);
  /* ⚠ 2026-09-08 — 판독이 «누를 때만»으로 바뀌었다(대표 지시). autoReadPending 은
       이제 «세기만» 하고, 실제로 거는 것은 readWaitRun 이다. 여기서 재는 것은
       «문서마다 한 번» 규칙이라 그대로이고, 겨눔만 누르는 쪽으로 옮겼다.
     ⚠ 대역을 만들지 «않는다» — 화면과 다른 규칙을 보게 된다. */
  /* ⚠ 2026-09-08 — 「이미 읽은 것은 다시 안 읽는다」(대표 지시 「중복이라고 중단해라」)로
       자동 목록이 갈렸다. 그 갈림(reReadWorth)도 «원본 그대로» 실어야 한다 —
       안 실으면 그 자리에서 멎어 이 검사가 통째로 운다.
     ⚠ 이 파일의 표본은 전부 「안 읽은 것」이라 다시 읽기 갈래는 안 쓰인다.
       그래도 부르는 자리가 있으므로 딸린 것(RESTALE_SKIP·readPromptVer)을 채워 준다. */
  vm.runInContext('var readQuotaOut = false;\nfunction renderGrid() {}\n'
    + 'var RESTALE_SKIP = {};\nfunction readPromptVer(){ return 0; }\n'
    + fnOf(app, 'reReadWorth') + '\n'
    + fnOf(app, 'autoReadPending') + '\n' + fnOf(app, 'readWaitRun'), ctx);
  ctx.readWaitRun();
  assert.equal(joined(queued), 'a,x,z',
    '문서마다 한 번(첫 쪽)씩 + 홑장 — 지금은 ' + joined(queued));
});

test('★ 판독 패널이 쪽 넘기기·나누기를 실제로 끼운다', () => {
  const p = fnOf(app, 'renderReadPanel');
  assert.match(p, /docNav\(it\)/, '함수만 있고 안 부르면 화면에 없습니다');
  assert.match(p, /docSplitBox\(it\)/);
});
