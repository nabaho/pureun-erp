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
    wiccok: { store: 'wiccok' }, award: { store: 'wiccok' }, work: { store: 'work' },
    meetfee: { store: 'meetfee' }, etcfee: { store: 'etcfee' }
  }) + ';', ctx);
  ['var _pasteCtx=null;', 'var _pasteUndo=null;'].forEach((l) => vm.runInContext(l, ctx));
  ['function pasteCols(', 'function _pasteNorm(', 'function pasteSplit(', 'function pasteNormCell(', 'function pasteRec(',
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
/* ══════ ⑧ 회의·비용관리도 «똑같이» (대표 지시 2026-09-06) ══════ */
test('★ 비용도 여러 건이 번호를 따로 받는다', () => {
  const ctx = 세상({ meetfee: [] });
  붙여(ctx, 'meetfee', ['2026-09-01\t식대\t팀 점심\t45,000원\t가나식당',
                        '2026-09-01\t식대\t야근 저녁\t62,000원\t가나식당'].join('\n'));
  vm.runInContext('pasteSave()', ctx);
  const db = ctx._store.meetfee;
  assert.equal(db.length, 2, '두 건이 다 들어가야 합니다: ' + JSON.stringify(db.map((r) => r.content)));
  assert.equal(new Set(db.map((r) => r.id)).size, 2, '번호가 겹쳤습니다');
});

test('★ 「45,000원」처럼 붙여넣은 금액에서 숫자만 남긴다 — 그대로 두면 합계가 안 더해진다', () => {
  const ctx = 세상({ meetfee: [] });
  붙여(ctx, 'meetfee', '2026-09-01\t식대\t팀 점심\t45,000원\t가나식당');
  vm.runInContext('pasteSave()', ctx);
  assert.equal(ctx._store.meetfee[0].amt, '45000');
});

test('★ 고르개에 없는 「구분」은 기본값으로 맞추고, 그 값을 미리보기에 «그대로» 보여 준다', () => {
  const ctx = 세상({ meetfee: [] });
  const rows = 붙여(ctx, 'meetfee', '2026-09-01\t점심값\t팀 점심\t45000\t가나식당');
  const 보이는것 = rows[0].v[1];
  const 고르개 = vm.runInContext('FORM_DEFS.meetfee.fields.filter(function(f){return f.key==="type";})[0]', ctx);
  assert.ok(Array.prototype.indexOf.call(고르개.options, 보이는것) >= 0,
    '고르개에 없는 말이 그대로 남았습니다: ' + 보이는것);
  /* ⚠ 넣기 뒤에는 창이 닫혀 _pasteCtx 가 없다 — 세어 둔 개수는 «넣기 전»에 본다 */
  assert.ok(vm.runInContext('_pasteCtx.snapped', ctx) >= 1, '바꾼 개수를 안 셌습니다');
  vm.runInContext('pasteSave()', ctx);
  assert.equal(ctx._store.meetfee[0].type, 보이는것, '표에 보인 값과 다른 것이 들어갔습니다');
});

test('★ 「비어서 뺀다」는 «필수 칸» 기준이다 — 화면마다 첫 칸이 다르다(비용은 일자)', () => {
  const ctx = 세상({ meetfee: [] });
  붙여(ctx, 'meetfee', ['\t식대\t날짜 없는 것\t1000\t가나식당',
                        '2026-09-01\t식대\t팀 점심\t45000\t가나식당'].join('\n'));
  vm.runInContext('pasteSave()', ctx);
  assert.equal(ctx._store.meetfee.length, 1, '일자 없는 줄이 들어갔습니다');
  assert.equal(ctx._store.meetfee[0].content, '팀 점심');
  const 필수 = vm.runInContext('pasteCols("meetfee").filter(function(c){return c.req;}).map(function(c){return c.key;})', ctx);
  assert.ok(Array.prototype.indexOf.call(필수, 'date') >= 0, '일자가 필수로 잡혀야 합니다');
});

test('★ 필수 칸이 «첫 칸이 아닐 때»도 그 칸을 본다 — 첫 칸으로 굳히면 조용히 어긋난다', () => {
  /* ⚠ 오늘은 여섯 화면 모두 «첫 칸이 곧 필수 칸»이라, 첫 칸으로 굳혀도 결과가 같다.
     그래서 규칙을 못 박으려면 «다른 화면»을 하나 만들어 봐야 한다 —
     안 그러면 다음 사람이 필수 칸이 둘째인 화면을 더했을 때 아무도 못 잡는다. */
  /* ⚠ 앞칸은 org 로 둔다 — dupKey 의 사슬에 든 칸이라야 두 줄이 «다른 건»으로 잡힌다.
     사슬에 없는 이름(a·b)만 쓰면 두 줄의 열쇠가 똑같아 둘째가 「이 안에서 겹침」으로
     꺼지고, 그러면 이 검사는 필수 칸과 상관없이 늘 0건이 된다(실측에서 걸렸다). */
  const ctx = 세상({ _시험: [] });
  vm.runInContext('FORM_DEFS._시험={title:"시험",store:"_시험",prefix:"TS",fields:['
    + '{key:"org",label:"앞칸"},{key:"b",label:"뒷칸",required:true}]};'
    + 'PASTE_COLS._시험=["org","b"]; CAREER_CFG._시험={store:"_시험"};', ctx);
  붙여(ctx, '_시험', ['앞값만\t', '다른앞값\t뒷값'].join('\n'));
  vm.runInContext('pasteSave()', ctx);
  assert.equal(ctx._store._시험.length, 1,
    '뒷칸(필수)이 빈 줄이 들어갔습니다: ' + JSON.stringify(ctx._store._시험));
  assert.equal(ctx._store._시험[0].b, '뒷값');
  assert.equal(ctx._store._시험[0].org, '다른앞값');
});

test('★ 같은 날 같은 지출처의 «다른» 비용은 중복이 아니다 — 영수증 둘이 한 건으로 묻혔다', () => {
  /* 실측 2026-09-06: dupKey 사슬에 비용의 라벨(content)이 없어
     「가나식당 점심」과 「가나식당 야근저녁」이 열쇠 «가나식당||20260901» 로 같았다.
     OCR 로 영수증 둘을 떨어뜨리면 둘째는 기록조차 안 만들어졌다. */
  const ctx = 세상({});
  const 열쇠 = (r) => vm.runInContext('dupKey(' + JSON.stringify(r) + ')', ctx);
  const 점심 = { date: '2026.09.01', type: '식대', content: '팀 점심', amt: '45000', org: '가나식당' };
  const 저녁 = { date: '2026.09.01', type: '식대', content: '야근 저녁', amt: '62000', org: '가나식당' };
  assert.notEqual(열쇠(점심), 열쇠(저녁), '내용이 달라도 한 건으로 봅니다: ' + 열쇠(점심));
  assert.equal(열쇠(점심), 열쇠(Object.assign({}, 점심, { amt: '99999' })),
    '금액만 다른 같은 건을 둘로 봅니다 — 그러면 중복이 걸러지지 않습니다');
});

test('★ 같음 판정의 «앞 사슬»은 그대로다 — 위촉장·자격증 판정이 달라지면 안 된다', () => {
  const ctx = 세상({});
  const 열쇠 = (r) => vm.runInContext('dupKey(' + JSON.stringify(r) + ')', ctx);
  /* 라벨이 앞 사슬에 있으면 content 가 섞여 있어도 «앞 것»으로 잡아야 한다 */
  const 가 = { title: '공인노무사', content: '딴것', org: '가기관', date: '2020.01.02' };
  const 나 = { title: '공인노무사', content: '또 딴것', org: '가기관', date: '2020.01.02' };
  assert.equal(열쇠(가), 열쇠(나), 'content 가 앞 사슬을 밀어냈습니다');
  const 위촉 = { titleVal: '노동권익보호관', org: '충청남도', issueDate: '2025.01.01' };
  assert.notEqual(열쇠(위촉), 열쇠(Object.assign({}, 위촉, { titleVal: '인사위원' })),
    '위촉내용이 달라도 한 건으로 봅니다');
});

test('★ 붙여넣기를 받는 화면마다 단추가 달려 있다 — 사전에만 있고 화면에 없으면 못 쓴다', () => {
  const keys = Object.keys(vm.runInContext('PASTE_COLS', 세상({})));
  assert.ok(keys.length >= 8, '받는 화면이 줄었습니다: ' + keys.join(','));
  ['meetfee', 'etcfee'].forEach((k) => assert.ok(keys.indexOf(k) >= 0,
    '회의·비용관리가 빠졌습니다 — 대표 지시로 «항상 함께» 고친다: ' + keys.join(',')));
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
