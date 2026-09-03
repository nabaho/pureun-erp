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
  assert.match(lib, /pairs\(문서의 \*\*모든\*\* 칸/, '아는 칸만 읽으면 매출액·근로자 수가 버려집니다');
  assert.match(lib, /체크 표시 칸은 v 에 선택된 것을/,
    '「● 있음 / ② 없음」 같은 칸에서 무엇이 골라졌는지가 정보입니다');
});

/* ── 문서 차례 그대로 (대표 지시 2026-08-13, 두 번째) ──
   "데이터를 읽을 때 맨 위에서부터 순서대로 읽었으면 좋겠다. 데이터 순서가 바뀐다." */
test('★ 문서에 적힌 차례대로, 아는 칸까지 빠짐없이 담으라고 시킨다', () => {
  /* ⚠ 주석이 아니라 **AI에게 실제로 가는 글**만 본다. 주석에 적어 둔 「예전에는
     …였다」가 검사에 걸리면, 옛 규칙이 살아 있는 것과 구분이 안 된다. */
  const prompt = lib.slice(lib.indexOf('var PROMPT_ALL ='),
    lib.indexOf("'JSON 외 텍스트 금지.';")).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(prompt, /문서에 적힌 \*\*모든 칸을 맨 위에서부터 아래 차례대로\*\* 담으세요/,
    '차례를 안 시키면 화면이 원본과 어긋납니다');
  assert.match(prompt, /\*\*위 키에 담은 칸도 빠짐없이 다시 담으세요\*\*/,
    '★ 아는 칸을 빼면 상호·대표자가 표에서 사라지거나 딴 덩어리로 갈립니다');
  assert.ok(!/위 키에 이미 담은 칸은 다시 담지 마세요/.test(prompt),
    '★ 옛 규칙이 남아 있습니다 — 차례가 두 덩어리로 갈립니다');
  assert.match(prompt, /k 는 \*\*문서에 적힌 이름 그대로\*\* 쓰세요/,
    '이름표를 우리 말로 바꾸면 원본과 짚어 갈 수 없습니다(대표 선택)');
  assert.match(prompt, /kind=card·bizreg·sme·contract·form 에 모두 해당/,
    '서식에만 걸면 계약서·사업자등록증은 그대로 뒤섞입니다');
  /* 서식 말고 다른 서류 종류의 키 줄에도 pairs 를 적어 둬야 AI가 담는다 —
     규칙만 있고 키 목록에 없으면 그 종류는 그냥 안 담는다 */
  ['bizreg', 'sme', 'contract'].forEach(function (k) {
    const at = prompt.indexOf('kind=' + k + ' 이면 키:');
    assert.ok(at > 0, k + ' 키 줄이 없습니다');
    assert.match(prompt.slice(at, prompt.indexOf('\\n', at + 10)), /pairs\(/,
      '★ ' + k + ' 의 키 목록에 pairs 가 없어 차례가 안 잡힙니다');
  });
  // 금액·개인정보를 안 읽기로 한 종류에는 담지 않는다
  assert.match(prompt, /급여서류\(payslip\)·근태표\(timesheet\)·대화\(chat\)·회의사진\(meeting\)에는 pairs 를 담지 마세요/);
});

test('★ 판 번호를 올려 이미 읽어 둔 서류가 다시 읽힌다', () => {
  const v = lib.match(/var READ_VERSION = (\d+);/);
  assert.ok(v && +v[1] >= 8,
    '★ 안 올리면 이미 읽어 둔 서류는 영영 옛 차례로 남습니다: ' + (v && v[1]));
});

test('★ 서식의 사업자번호는 있을 때만 검산한다 — 실제로 돌려 본다', async () => {
  /* ⚠ 함수 본문을 «베어» 오지 않는다(2026-08-26). 그렇게 두었더니 afterRead 가
     옆 함수를 부르기 시작하자 코드는 멀쩡한데 이 검사가 「없는 함수」로 넘어졌다.
     판독기를 통째로 싣고 그쪽이 낸 통로로 부른다 — 진짜 그대로 돌아간다. */
  const boot = function () {
    const ctx = { console, Promise, Object, Array, JSON, String, Number, Math, Date,
      RegExp, Error, isFinite, parseInt, parseFloat, setTimeout, clearTimeout };
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(lib, ctx);
    return { afterRead: ctx.PuDocRead._afterReadForTest };
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

/* ⚠ 2026-08-24 대표 지시로 뜻이 바뀌었다: 「계속해서 확인 필요가 나온다 … 제대로 완전히
   고쳐 달라」. 종전에는 서식이 **조건 없이** 할 일이라 확인필요가 서식으로 늘 찼다.
   이제 「기업 상세로 보낼 것이 남았을 때만」 할 일이다(formTodo). */
test('★ 보낼 것이 남은 서식은 무엇을 하라는지 적힌다', () => {
  const w = fnOf(app, 'checkWhy');
  /* ⚠ 2026-08-28: CMS 자동이체 신청서가 서식과 «같은 자리»로 간다 — 줄이
     `r.kind === 'form' || r.kind === 'cms'` 로 바뀌었다. 지킬 것은 그대로. */
  /* ⚠ 2026-09-03 다시 겨눔 — 종전에는 «삼항 한 줄»을 글자 그대로 박아 두었다.
     통장이 못 보냈을 때 까닭을 말하게 되면서 그 자리가 if 문으로 늘어나자,
     기능은 그대로인데 검사만 울었다. 지킬 것은 «보낼 것이 남으면 그 말을 내놓는가»다. */
  assert.match(w, /formTodo\(r\)/, '★ 보낼 것이 남았는지를 안 봅니다');
  assert.match(w, /'🏢 기업 상세로 아직 안 보냄 — 보내기'/,
    '★ 무엇을 하라는지 안 적으면 열어 봐야 압니다');
  /* ⚠ **코드 꼴로 찾는다**(`if (!r.auto)`). 그냥 `!r.auto` 로 찾으면 그 줄을 설명하는
     주석을 먼저 집어 순서가 거꾸로 나온다 — 실제로 그렇게 걸렸다. */
  assert.ok(w.indexOf("r.kind === 'form'") < w.indexOf('if (!r.auto)'),
    '★ auto 판정이 먼저면 서식은 언제나 할 일입니다 — 서식은 늘 auto:false 다');
  /* ⚠ 2026-08-27 다시 겨눔 — needsCheck 가 checkWhy 를 그대로 쓰게 됐다. 두 벌이
     «같은 조건·같은 순서인가»를 재던 검사는 이제 잴 것이 없다(어긋날 수가 없다). */
  assert.match(fnOf(app, 'needsCheck'), /return !!checkWhy\(it\);/,
    '★ 판정이 다시 두 벌로 갈라지면 목록과 이유가 어긋납니다');
});

/* readRows 를 실제로 돌린다 — 화면의 표는 이것이 낸 차례를 그대로 그린다 */
function rowsCtx() {
  const ctx = { Array, Object, String };
  vm.createContext(ctx);
  vm.runInContext(app.match(/const READ_ROWS = \[[\s\S]*?\n\];/)[0].replace('const ', 'var '), ctx);
  vm.runInContext(fnOf(app, 'docPairs') + '\n' + fnOf(app, 'readRows'), ctx);
  return ctx;
}
function boxCtx() {
  const ctx = rowsCtx();
  vm.runInContext('var esc = function(s){ return String(s); };', ctx);
  vm.runInContext(fnOf(app, 'formPairsBox'), ctx);
  return ctx;
}
/* 원본 서류 차례: 업체명 → 업종 → 사업자등록번호 → 대표자 → 매출액 → 담당자
   (아는 칸과 그 밖의 칸이 **서로 사이사이 끼어 있다** — 이것이 핵심이다) */
const FORM = { id: 'p1', meta: { read: { kind: 'form', fields: {
  docName: '정부지원 신청서', company: '㈜가야엔지니어링', bizno: '310-81-13809',
  ceo: '김대표', name: '박담당',
  pairs: [
    { k: '업체명', v: '㈜가야엔지니어링' },
    { k: '업종 / 주생산품', v: '제조업 / 2차전지장비' },
    { k: '사업자등록번호', v: '310-81-13809' },
    { k: '대표자', v: '김대표' },
    { k: '매출액(직전년도)', v: '32(억 원)' },
    { k: '담당자 성함', v: '박담당' },
    { k: '빈 칸', v: '  ' }
  ]
} } } };

test('★ 표가 문서에 적힌 차례 그대로 나온다 — 실제로 돌려 본다', () => {
  const rows = rowsCtx().readRows(FORM.meta.read);
  assert.equal(rows.map(function (r) { return r[0]; }).join(','),
    '업체명,업종 / 주생산품,사업자등록번호,대표자,매출액(직전년도),담당자 성함',
    '★ 원본 차례가 아닙니다 — 원본과 한 줄씩 대조할 수 없습니다');
  assert.equal(rows[1][1], '제조업 / 2차전지장비');
  assert.ok(!rows.some(function (r) { return r[0] === '빈 칸'; }),
    '값이 빈 칸까지 그리면 표만 길어집니다');
  // 아는 칸이 앞으로 몰리면(옛 방식) 업종이 뒤로 밀린다
  const names = rows.map(function (r) { return r[0]; });
  assert.ok(names.indexOf('업종 / 주생산품') < names.indexOf('사업자등록번호'),
    '★ 아는 칸을 앞으로 몰았습니다');
});

test('★ pairs 가 없는 옛 판독 결과는 아는 칸으로라도 그린다', () => {
  /* 8판 전에 읽어 둔 서류다 — 여기서 빈 표를 내면 다시 판독하기 전까지
     이미 읽어 둔 서류가 통째로 사라진 것처럼 보인다 */
  const rows = rowsCtx().readRows({ kind: 'bizreg', fields: { company: '가야', ceo: '김대표' } });
  assert.equal(rows.map(function (r) { return r[0]; }).join(','), '상호,대표자');
  assert.equal(rows[0][1], '가야');
  /* AI가 한 칸에 배열·객체를 돌려줄 때가 있다. 그대로 그리면 표에
     「가,나」나 [object Object] 가 찍혀 사람이 그것을 값으로 읽는다 — 걸러 낸다. */
  assert.equal(rowsCtx().readRows({ fields: { company: ['가야', '가야2'] } }).length, 0,
    '★ 문자열이 아닌 칸이 표에 샜습니다');
  assert.equal(rowsCtx().readRows({ fields: { ceo: { name: '김' } } }).length, 0);
  assert.equal(rowsCtx().readRows({ fields: { pairs: [], todos: [{ t: 'x' }] } }).length, 0);
});

test('★ 서식 상자는 표를 또 그리지 않는다 — 차례가 두 덩어리로 갈린다', () => {
  const h = boxCtx().formPairsBox(FORM);
  assert.ok(h.indexOf('<table>') < 0,
    '★ 표를 한 번 더 그리면 위 표와 겹쳐 같은 칸이 두 번 나옵니다');
  assert.match(h, /formCopy\(\)/, '복사 단추가 없으면 「정리」가 화면에서 끝나 버립니다');
  assert.equal(boxCtx().formPairsBox({ meta: { read: { kind: 'card', fields: {} } } }), '',
    '명함 패널에 서식 상자가 생기면 안 됩니다');
  assert.match(boxCtx().formPairsBox({ meta: { read: { kind: 'form', fields: {} } } }),
    /못 읽은 서식/, '못 읽었으면 말을 해야 합니다 — 빈 화면은 고장으로 읽힙니다');
  assert.ok(boxCtx().formPairsBox(FORM).indexOf('못 읽은 서식') < 0,
    '읽었는데 못 읽었다고 하면 안 됩니다');
});

test('★ 복사가 화면 표와 같은 차례로 나간다 — 실제로 돌려 본다', () => {
  let copied = '';
  const ctx = rowsCtx();
  Object.assign(ctx, {
    viewerId: 'p1',
    gridItems: [JSON.parse(JSON.stringify(FORM))],
    navigator: { clipboard: { writeText: function (t) {
      copied = t;
      return { then: function (ok) { ok(); return this; } };
    } } },
    toast: function () {}, alert: function () {}
  });
  vm.runInContext(fnOf(app, 'formCopy'), ctx);
  ctx.formCopy();
  assert.equal(copied,
    ['업체명\t㈜가야엔지니어링', '업종 / 주생산품\t제조업 / 2차전지장비',
     '사업자등록번호\t310-81-13809', '대표자\t김대표',
     '매출액(직전년도)\t32(억 원)', '담당자 성함\t박담당'].join('\n'),
    '★ 엑셀에 붙인 것과 화면이 어긋나면 대조하려고 복사한 뜻이 없습니다');
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
