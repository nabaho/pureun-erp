/* 일반 서식 — 아는 종류가 아니어도 모든 칸을 읽는다 (대표 지시 2026-08-13)
   "캡처되거나 PDF로 들어온 서식들 글자를 선명하게 읽고 정리하고 싶은데
    명확하게 이런 기능을 넣는 건 어렵나? 문서들을 인식하는 거다."

   실사례: 정부지원 신청서(가야엔지니어링)가 「서류로 보이지 않음」 —
   아는 일곱 종류에 안 들면 아무것도 안 읽고 버리는 것이 원인이었다.

   ⚠ 지키는 것: 아는 칸은 이름 붙은 키로, 나머지는 **하나도 버리지 않고**
     이름:값 쌍으로. 사업자번호는 있을 때만 검산(없는 서식이 더 많다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'js', 'pu-doc-read.js'), 'utf8');

function fnOf(src, name, indent) {
  const pad = indent || '';
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n' + pad + '\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* ── 판독 층 ── */
test('★ 판독기가 form 을 알고, 판 번호가 올랐다', () => {
  assert.match(lib, /var KINDS = \{[^}]*form: 1/, '모르면 other 로 뭉개져 아무것도 안 읽힙니다');
  const v = lib.match(/var READ_VERSION = (\d+);/);
  assert.ok(v && +v[1] >= 6,
    '판 번호를 안 올리면 「서류로 보이지 않음」으로 굳은 서식이 다시 안 읽힙니다: ' + (v && v[1]));
});

test('★ 모든 칸을 이름:값 쌍으로 담으라고 시킨다', () => {
  assert.match(lib, /pairs\(그 밖의 \*\*모든\*\* 칸/, '아는 칸만 읽으면 매출액·근로자 수가 버려집니다');
  assert.match(lib, /위 키에 이미 담은 칸은 다시 담지 마세요/,
    '같은 칸이 두 번 나오면 어느 쪽이 맞는지 사람이 헷갈립니다');
  assert.match(lib, /체크 표시 칸은 v 에 선택된 것을/,
    '「● 있음 / ② 없음」 같은 칸에서 무엇이 골라졌는지가 정보입니다');
});

test('★ 서식의 사업자번호는 있을 때만 검산한다 — 실제로 돌려 본다', async () => {
  const boot = function () {
    const ctx = { Promise, Object, String };
    vm.createContext(ctx);
    vm.runInContext(lib.match(/var KINDS = \{[^\n]*/)[0], ctx);
    vm.runInContext('var deps = {};', ctx);
    ['bizNoDigits', 'bizNoValid', 'fmtBizNo', 'afterRead'].forEach(function (n) {
      vm.runInContext(fnOf(lib, n, '  '), ctx);
    });
    return ctx;
  };
  /* 진짜 번호(체크섬 통과) — 화면 캡처의 310-81-13809 */
  const ok = await boot().afterRead({ kind: 'form', company: '가야', bizno: '3108113809',
    pairs: [{ k: '매출액', v: '32억' }] });
  assert.equal(ok.bizNoOk, true, '맞는 번호가 검산을 통과해야 합니다');
  assert.equal(ok.fields.bizno, '310-81-13809', '보기 좋은 꼴로 바꿔 담아야 합니다');
  assert.ok(Array.isArray(ok.fields.pairs), '쌍 배열이 사라졌습니다');

  const bad = await boot().afterRead({ kind: 'form', bizno: '1234567890' });
  assert.equal(bad.bizNoOk, false, '틀린 번호는 걸려야 합니다');

  const none = await boot().afterRead({ kind: 'form', company: '번호 없는 서식' });
  assert.equal(none.bizNoOk, null,
    '번호 없는 서식에 false 를 주면 멀쩡한 서식이 죄다 「검증 실패」로 보입니다');
});

test('★ 서식은 어디로도 안 보낸다 (autoOk)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(lib.match(/var KINDS = \{[^\n]*/)[0], ctx);
  vm.runInContext('var bizNoValid = function(){ return false; };', ctx);
  vm.runInContext(fnOf(lib, 'autoOk', '  '), ctx);
  const v = ctx.autoOk({ kind: 'form', fields: { pairs: [] }, error: null });
  assert.equal(v.auto, false);
  assert.equal(v.done, true, 'done 이 없으면 넣을 곳 없는 것이 할 일로 쌓입니다');
  assert.match(v.why, /서식/);
});

/* ── 화면 ── */
test('★ 서식 탭이 있고 이름표가 붙는다', () => {
  assert.match(app, /form: '서식·신청서'/, '이름표가 없으면 「알 수 없음」으로 뜹니다');
  const tabs = app.match(/const KIND_TABS = \[[\s\S]*?\n\];/)[0];
  assert.match(tabs, /key: 'form'[^\n]*kinds: \['form'\], main: 'form'/,
    'main 이 없으면 끌어다 놓기·분류 지정으로 이 칸에 못 넣습니다');
});

test('★ 새 서식은 「읽은 칸 확인」으로 눈에 띈다', () => {
  const w = fnOf(app, 'checkWhy');
  assert.match(w, /form'\) return '서식 — 읽은 칸 확인'/);
  assert.ok(w.indexOf("kind === 'form'") < w.indexOf('!r.auto'),
    'needsCheck 와 순서가 어긋나면 걸린 이유와 적힌 이유가 달라집니다');
});

function boxCtx() {
  const ctx = { Array, Object, String };
  vm.createContext(ctx);
  vm.runInContext('var esc = function(s){ return String(s); };', ctx);
  vm.runInContext(fnOf(app, 'formPairsBox'), ctx);
  return ctx;
}
const FORM = { id: 'p1', meta: { read: { kind: 'form', fields: {
  docName: '정부지원 신청서', company: '㈜가야엔지니어링', bizno: '310-81-13809',
  pairs: [
    { k: '매출액(직전년도)', v: '32(억 원)' },
    { k: '근로자 수', v: '25(명)' },
    { k: '희망시기', v: '2026년 8월 부터' },
    { k: '빈 칸', v: '  ' }
  ]
} } } };

test('★ 그 밖의 칸이 전부 표로 그려진다', () => {
  const h = boxCtx().formPairsBox(FORM);
  assert.match(h, /매출액\(직전년도\)/);
  assert.match(h, /32\(억 원\)/);
  assert.match(h, /근로자 수/);
  assert.ok(h.indexOf('빈 칸') < 0, '값이 빈 칸까지 그리면 표만 길어집니다');
  assert.match(h, /formCopy\(\)/, '복사 단추가 없으면 「정리」가 화면에서 끝나 버립니다');
  assert.equal(boxCtx().formPairsBox({ meta: { read: { kind: 'card', fields: {} } } }), '',
    '명함 패널에 서식 상자가 생기면 안 됩니다');
  assert.match(boxCtx().formPairsBox({ meta: { read: { kind: 'form', fields: {} } } }),
    /못 읽은 서식/, '못 읽었으면 말을 해야 합니다 — 빈 화면은 고장으로 읽힙니다');
});

test('★ 복사가 아는 칸 + 나머지 칸을 함께 담는다 — 실제로 돌려 본다', () => {
  let copied = '';
  const ctx = {
    Array, Object, String,
    viewerId: 'p1',
    gridItems: [JSON.parse(JSON.stringify(FORM))],
    navigator: { clipboard: { writeText: function (t) {
      copied = t;
      return { then: function (ok) { ok(); return this; } };
    } } },
    toast: function () {}, alert: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext(app.match(/const READ_ROWS = \[[\s\S]*?\n\];/)[0].replace('const ', 'var '), ctx);
  vm.runInContext(fnOf(app, 'formCopy'), ctx);
  ctx.formCopy();
  assert.match(copied, /상호\t㈜가야엔지니어링/, '아는 칸이 이름표와 함께 나가야 합니다');
  assert.match(copied, /사업자번호\t310-81-13809/);
  assert.match(copied, /매출액\(직전년도\)\t32\(억 원\)/, '나머지 칸도 함께 나가야 합니다');
  assert.ok(copied.indexOf('빈 칸') < 0, '빈 값은 복사에서도 뺍니다');
});

test('★ 서식의 칸 이름·값이 찾기에 걸린다', () => {
  assert.match(fnOf(app, 'hayOf'), /Array\.isArray\(f\.pairs\)/,
    '「가야엔지니어링」이나 「매출액」으로 치면 이 서식이 나와야 합니다');
});

test('★ 패널이 서식 상자를 실제로 끼워 넣는다', () => {
  assert.match(fnOf(app, 'renderReadPanel'), /formPairsBox\(it\)/,
    '함수만 있고 안 부르면 화면에 아무것도 없습니다');
});
