'use strict';
/* 📋 붙여넣어 여러 건 넣기 (대표 승인 2026-09-06 「이대로」)
   ─────────────────────────────────────────────────────────────
   자격증 세 건을 넣으려고 창을 세 번 열고 칸을 스물네 번 치던 것을 없앤 기능.

   ⚠ 글자 찾기로는 못 박히지 않는다 — 「단추가 있다」만 봐서는 눌러서 아무 일도
     안 나는 것을 못 잡는다. 그래서 **함수를 뽑아 실제로 돌려** 확인한다.

   여기서 못 박는 것은 «값»이 아니라 «규칙»이다:
     ① 여러 건을 넣으면 번호가 서로 «다르다» — 하나로 겹치면 안 된다
     ② 이미 있는 것은 «새로 만들지 않는다» — 판정은 dupKey 하나를 쓴다
     ③ 첫 칸(필수)이 빈 줄은 넣지 않는다
     ④ 머리글 줄을 함께 붙여넣어도 한 건으로 들어가지 않는다
     ⑤ 되돌리면 «방금 넣은 것만» 빠진다
     ⑥ 대표 기록을 바로 만드는 손잡이이므로 직원 화면에서는 감춘다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripComments } = require('./strip-comments');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'kcareer.html'), 'utf8');
const CODE = stripComments(SRC);

/* 선언 하나를 중괄호 짝을 세어 통째로 잘라 낸다.
   ⚠ 비탐욕 정규식은 «0칸 여는 중괄호»에서 먼저 끊긴다 — 짝을 센다. */
function cutFn(src, decl) {
  const head = src.indexOf(decl);
  assert.notEqual(head, -1, decl + ' 을 찾지 못했습니다 — 이름이 바뀌었나요?');
  let i = src.indexOf('{', head + decl.length), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(head, i + 1);
}

/* ── 가짜 화면 한 칸 ── */
function 칸() {
  return { value: '', innerHTML: '', textContent: '', placeholder: '',
           style: {}, lastElementChild: null, focus() {},
           classList: { _s: {}, add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
                        contains(c) { return !!this._s[c]; } } };
}

/* 붙여넣기 엔진을 가짜 세상에 올린다. store 는 {가게이름: [레코드…]} */
function 세상(store) {
  const 칸들 = {};
  ['pasteHead', 'pasteGuide', 'pasteSrc', 'pastePrev', 'pasteSum', 'pasteHint', 'pasteFoot', 'modalPaste']
    .forEach((id) => { 칸들[id] = 칸(); });
  const 알림 = [], 되살림 = [];
  const ctx = {
    console, JSON, String, Number, Array, Object, Error, Date, Math, RegExp, isNaN, parseInt, parseFloat,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); },
    document: { getElementById: (id) => 칸들[id] || null, querySelectorAll: () => [] },
    toast: (m) => 알림.push(String(m)),
    kcUndoBar: (msg, tid, fn) => 되살림.push({ msg: String(msg), fn: fn }),
    renderCareer: () => {},
    get: (k) => (store[k] || []).slice(),
    set: (k, arr) => { store[k] = arr.slice(); },
    _store: store, _칸: 칸들, _알림: 알림, _되살림: 되살림
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* 실제 코드를 그대로 쓴다 — 흉내 낸 사본을 두면 앱이 바뀌어도 검사는 통과한다 */
  vm.runInContext(cutFn(CODE, 'function escapeHtml('), ctx);
  vm.runInContext(cutFn(CODE, 'function formatDate('), ctx);
  vm.runInContext(cutFn(CODE, 'function dupKey('), ctx);
  vm.runInContext(cutFn(CODE, 'function wiccokId('), ctx);
  /* ⚠ 이름이 겹친다 — 화면 안쪽에도 `function nextId()` 가 하나 더 있다.
     이름만 찾으면 그 «다른» 함수가 잘려 나와 「db is not defined」로 터진다(실측). */
  vm.runInContext(cutFn(CODE, 'function nextId(prefix,store)'), ctx);
  vm.runInContext('var ' + cutFn(CODE, 'const FORM_DEFS=').replace(/^const /, ''), ctx);
  vm.runInContext('var ' + cutFn(CODE, 'var PASTE_COLS =').replace(/^var /, ''), ctx);
  vm.runInContext('var CAREER_CFG=' + JSON.stringify({
    license: { store: 'cert' }, complete: { store: 'cert' }, edu: { store: 'edu' },
    wiccok: { store: 'wiccok' }, award: { store: 'wiccok' }, work: { store: 'work' }
  }) + ';', ctx);
  ['var _pasteCtx=null;', 'var _pasteUndo=null;'].forEach((l) => vm.runInContext(l, ctx));
  ['function pasteCols(', 'function _pasteNorm(', 'function pasteSplit(', 'function pasteRec(',
   'function pasteExisting(', 'function openPasteIn(', 'function closePasteIn(', 'function pasteClear(',
   'function pasteParse(', 'function pasteDraw(', 'function pasteTally(', 'function pasteToggle(',
   'function pasteEdit(', 'function pasteSave(', 'function pasteUndoRun(']
    .forEach((d) => vm.runInContext(cutFn(CODE, d), ctx));
  return ctx;
}

/* 붙여넣고 미리보기까지 */
function 붙여(ctx, page, text) {
  vm.runInContext('openPasteIn(' + JSON.stringify(page) + ')', ctx);
  ctx._칸.pasteSrc.value = text;
  vm.runInContext('pasteParse()', ctx);
  return vm.runInContext('_pasteCtx.rows', ctx);
}

/* ══════ ① 번호가 겹치지 않는다 ══════ */
test('★ 여러 건을 넣으면 번호가 서로 «다르다» — 하나로 겹치면 두 건이 사라진다', () => {
  const ctx = 세상({ cert: [] });
  붙여(ctx, 'license', ['가자격\t2020-01-02\t가기관', '나자격\t2021-03-04\t나기관', '다자격\t2022-05-06\t다기관'].join('\n'));
  vm.runInContext('pasteSave()', ctx);
  const db = ctx._store.cert;
  assert.equal(db.length, 3, '세 건이 다 들어가야 합니다: ' + JSON.stringify(db.map((r) => r.id)));
  const ids = db.map((r) => r.id);
  assert.equal(new Set(ids).size, 3, '번호가 겹쳤습니다: ' + JSON.stringify(ids));
  assert.ok(db.every((r) => r.id), '번호 없는 기록이 있습니다');
});

test('위촉장·표창도 번호가 겹치지 않는다 — 여기는 번호 짜임이 다르다(유형+연도-순번)', () => {
  const ctx = 세상({ wiccok: [] });
  붙여(ctx, 'wiccok', ['가기관\t가직책\t2025-01-01', '나기관\t나직책\t2025-06-01'].join('\n'));
  vm.runInContext('pasteSave()', ctx);
  const ids = ctx._store.wiccok.map((r) => r.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, '번호가 겹쳤습니다: ' + JSON.stringify(ids));
});

/* ══════ ② 이미 있는 것 ══════ */
test('★ 이미 있는 것은 체크가 꺼진 채로 나온다 — 중복이 쌓이면 목록을 못 믿는다', () => {
  const 있던 = { id: 'C0001', title: '가자격', date: '2020.01.02', org: '가기관' };
  const ctx = 세상({ cert: [있던] });
  const rows = 붙여(ctx, 'license', ['가자격\t2020-01-02\t가기관', '나자격\t2021-03-04\t나기관'].join('\n'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].use, false, '이미 있는 것이 켜져 있습니다');
  assert.ok(rows[0].dup, '이미 있음 표시가 없습니다');
  assert.equal(rows[1].use, true, '새것이 꺼져 있습니다');
  vm.runInContext('pasteSave()', ctx);
  assert.equal(ctx._store.cert.length, 2, '중복이 하나 더 들어갔습니다');
});

test('★ 「이미 있음」을 고쳐 새 건이 되면 «다시 켜진다» — 고쳐 놓고 안 들어가면 안 된다', () => {
  const 있던 = { id: 'C0001', title: '가자격', date: '2020.01.02', org: '가기관' };
  const ctx = 세상({ cert: [있던] });
  const rows = 붙여(ctx, 'license', '가자격\t2020-01-02\t가기관');
  assert.equal(rows[0].use, false, '이미 있는 것이 켜져 있습니다(전제)');
  vm.runInContext('pasteEdit(0,1,"2099-12-31")', ctx);   /* 취득일을 바꾸면 다른 건이다 */
  assert.equal(rows[0].dup, '', '고쳤는데 아직 이미 있음입니다');
  assert.equal(rows[0].use, true, '고쳐서 새 건이 되었는데 체크가 꺼진 채입니다');
});

test('사람이 «손으로» 끈 줄은 고쳐도 켜지지 않는다 — 「이건 빼라」는 뜻이다', () => {
  /* ⚠ 「이미 있음 → 새것」으로 «바뀌는» 순간에만 앱이 체크를 만진다. 그래서 그 순간을
     만들어야 이 규칙에 이빨이 생긴다 — 안 만들면 무엇을 고쳐도 검사가 통과한다(실측). */
  const 있던 = { id: 'C0001', title: '가자격', date: '2020.01.02', org: '가기관' };
  const ctx = 세상({ cert: [있던] });
  const rows = 붙여(ctx, 'license', '가자격\t2020-01-02\t가기관');
  assert.equal(rows[0].dup, '이미 있음', '전제: 이미 있음으로 잡혀야 합니다');
  vm.runInContext('pasteToggle(0,false)', ctx);            /* 사람이 「빼라」고 정한다 */
  vm.runInContext('pasteEdit(0,1,"2099-12-31")', ctx);     /* 고쳐서 새 건이 된다 */
  assert.equal(rows[0].dup, '', '전제: 고쳐서 새 건이 되어야 합니다');
  assert.equal(rows[0].use, false, '사람이 끈 줄을 앱이 다시 켰습니다');
});

test('붙여넣은 것 «안»에서 같은 줄이 두 번 있으면 둘째는 꺼 둔다', () => {
  const ctx = 세상({ cert: [] });
  const rows = 붙여(ctx, 'license', ['가자격\t2020-01-02\t가기관', '가자격\t2020-01-02\t가기관'].join('\n'));
  assert.equal(rows.filter((r) => r.use).length, 1, '같은 줄이 두 건으로 들어갑니다');
});

test('중복 판정은 «dupKey 하나»를 쓴다 — 자를 새로 만들면 중복관리 화면과 어긋난다', () => {
  const 엔진 = cutFn(CODE, 'function pasteExisting(') + cutFn(CODE, 'function pasteParse(')
             + cutFn(CODE, 'function pasteEdit(');
  assert.match(엔진, /dupKey\(/, '붙여넣기가 dupKey 를 안 씁니다');
  assert.doesNotMatch(엔진, /function\s+\S*[dD]up\S*Key/, '중복 열쇠를 새로 만들었습니다');
});

/* ══════ ③ 빈 줄 ══════ */
test('★ 첫 칸(필수)이 빈 줄은 넣지 않는다 — 이름 없는 기록은 지우기도 어렵다', () => {
  const ctx = 세상({ cert: [] });
  붙여(ctx, 'license', ['\t2020-01-02\t가기관', '나자격\t2021-03-04\t나기관'].join('\n'));
  vm.runInContext('pasteSave()', ctx);
  assert.equal(ctx._store.cert.length, 1, '이름 없는 줄이 들어갔습니다: ' + JSON.stringify(ctx._store.cert));
  assert.equal(ctx._store.cert[0].title, '나자격');
  assert.ok(ctx._되살림.length && /빈 1줄/.test(ctx._되살림[0].msg),
    '몇 줄을 뺐는지 알려야 합니다: ' + JSON.stringify(ctx._되살림.map((x) => x.msg)));
});

/* ══════ ④ 머리글 ══════ */
test('★ 머리글 줄을 함께 붙여넣어도 한 건으로 들어가지 않는다', () => {
  const ctx = 세상({ cert: [] });
  const rows = 붙여(ctx, 'license', ['자격명\t취득일\t발급기관', '가자격\t2020-01-02\t가기관'].join('\n'));
  assert.equal(rows.length, 1, '머리글이 한 건으로 들어갔습니다: ' + JSON.stringify(rows.map((r) => r.v[0])));
  assert.equal(rows[0].v[0], '가자격');
});

/* ══════ ⑤ 가르는 자 ══════ */
test('탭·쉼표·두 칸 띄우기를 모두 받는다 — 한 칸 띄우기로는 가르지 않는다', () => {
  const ctx = 세상({ cert: [] });
  /* ⚠ 가짜 세상(vm)에서 온 배열은 «다른 Array» 라 deepEqual 이 값이 같아도 틀렸다고 한다.
     그래서 글자로 이어 붙여 견준다. */
  const 한줄 = (t) => Array.prototype.slice.call(붙여(ctx, 'license', t)[0].v, 0, 3).join('｜');
  assert.equal(한줄('가자격\t2020-01-02\t가기관'), '가자격｜2020.01.02｜가기관');
  assert.equal(한줄('가자격, 2020-01-02, 가기관'), '가자격｜2020.01.02｜가기관');
  assert.equal(한줄('직업상담사 2급   2020-01-02   가기관'), '직업상담사 2급｜2020.01.02｜가기관',
    '한 칸 띄우기로 갈라 「직업상담사」와 「2급」이 쪼개졌습니다');
});

test('날짜는 앱의 formatDate 를 지난다 — 화면마다 다른 모양으로 쌓이면 못 고른다', () => {
  const ctx = 세상({ cert: [] });
  const v = 붙여(ctx, 'license', '가자격\t2020/1/2\t가기관')[0].v;
  assert.equal(v[1], '2020.01.02', '날짜가 그대로 들어갔습니다: ' + v[1]);
});

/* ══════ ⑥ 되돌리기 ══════ */
test('★ 되돌리면 «방금 넣은 것만» 빠진다 — 그 사이에 넣은 다른 기록은 그대로', () => {
  const 있던 = { id: 'C0009', title: '옛자격', date: '2010.01.01', org: '옛기관' };
  const ctx = 세상({ cert: [있던] });
  붙여(ctx, 'license', ['가자격\t2020-01-02\t가기관', '나자격\t2021-03-04\t나기관'].join('\n'));
  vm.runInContext('pasteSave()', ctx);
  assert.equal(ctx._store.cert.length, 3);
  const bar = ctx._되살림[ctx._되살림.length - 1];
  assert.equal(typeof bar.fn, 'function', '되돌릴 손잡이를 안 줬습니다');
  bar.fn();
  assert.equal(ctx._store.cert.length, 1, '되돌린 뒤에도 남았습니다');
  assert.equal(ctx._store.cert[0].id, 'C0009', '남의 기록을 지웠습니다');
});

/* ══════ ⑦ 화면에 달려 있고, 직원에게는 감춘다 ══════ */
test('★ 붙여넣기를 받는 화면마다 단추가 달려 있다 — 사전에만 있고 화면에 없으면 못 쓴다', () => {
  const keys = Object.keys(vm.runInContext('PASTE_COLS', 세상({})));
  assert.ok(keys.length >= 6, '받는 화면이 줄었습니다: ' + keys.join(','));
  keys.forEach((page) => {
    const at = SRC.indexOf('id="page-' + page + '"');
    assert.notEqual(at, -1, page + ' 화면을 찾지 못했습니다');
    const end = SRC.indexOf('</section>', at);
    const 구역 = SRC.slice(at, end);
    assert.match(구역, /data-act="paste"/, page + ' 화면에 붙여넣기 단추가 없습니다');
  });
});

test('★ 단추가 실제로 창을 연다 — 이어 두지 않으면 눌러도 아무 일이 없다', () => {
  assert.match(CODE, /a===['"]paste['"]\s*\)\s*openPasteIn\(/,
    'data-act="paste" 가 openPasteIn 으로 이어져 있지 않습니다');
});

test('★ 직원 화면에서는 감춘다 — 대표 기록을 «바로» 만드는 손잡이다', () => {
  assert.match(SRC, /body\.kc-staff \[data-act="paste"\]/, 'CSS 로 감추지 않았습니다');
  assert.match(CODE, /\[data-act="new"\],\[data-act="paste"\],\[data-act="csv"\]/,
    '제한 화면(JS)에서 감추지 않았습니다');
});

test('열 이름은 서식(FORM_DEFS)에서 가져온다 — 두 곳에 적으면 엉뚱한 칸에 들어간다', () => {
  const ctx = 세상({});
  const cols = vm.runInContext('pasteCols("license")', ctx);
  const def = vm.runInContext('FORM_DEFS.license.fields', ctx);
  cols.forEach((c) => {
    const f = def.find((x) => x.key === c.key);
    assert.ok(f, 'license 서식에 없는 칸입니다: ' + c.key);
    assert.equal(c.label, f.label, c.key + ' 의 이름이 서식과 다릅니다');
  });
});

test('CSV 업로드 길을 없애지 않았다 — 쓰던 사람이 갈 곳이 사라지면 안 된다', () => {
  assert.match(CODE, /function importCsv\(/, 'importCsv 가 사라졌습니다');
  assert.match(SRC, /data-act="import"/, 'CSV 업로드 단추가 사라졌습니다');
});
