/* 사진첩이 한글(.hwp/.hwpx)을 받아 «글자로» 읽는가 (대표 지시 2026-09-05).
 *
 * 지키려는 규칙 — «지금 값»이 아니라 규칙이다:
 *   ① 한글 파일을 «고를 수» 있어야 한다(파일 고르기 목록에 있어야 한다)
 *   ② 한글이면 읽개를 불러 «쪽»으로 펼친다 — PDF·TIF 와 같은 모양이어야
 *      아래 올리기 길(묶음 번호·쪽 번호·글자 판독)이 하나로 유지된다
 *   ③ 펼친 쪽에는 글자가 붙어 판독이 «글자로» 간다(그림 왕복 없음)
 *   ④ 한글은 「따로냐 합치냐」를 묻지 않는다 — 그 쪽은 원본의 쪽이 아니라
 *      우리가 만든 쪽이라, 갈라 놓으면 한 계약서가 낱장으로 흩어진다
 *   ⑤ 읽개(hwp_extract.js)는 «안 고친다» — 취업규칙·급여데이터함이 쓰는 것이다
 *
 * ⑥ 그리고 이 검사는 **진짜 한글 파일을 만들어 진짜로 읽는다.**
 *    저장소의 hwpx 만들개(hwpx_gen.js)로 파일을 짓고, 읽개로 도로 읽어
 *    글자가 나오는지 본다 — 「부르더라」가 아니라 「나오더라」를 본다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn.js');
const { stripComments } = require('./strip-comments.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');
const SRC = stripComments(HTML);

/* ── ① 고를 수 있는가 ── */
test('한글 파일을 고를 수 있다 — 파일 고르기 목록에 hwp·hwpx 가 있다', () => {
  const inp = /<input[^>]*id="docInput"[^>]*>/.exec(HTML);
  assert.ok(inp, 'docInput 을 못 찾았다');
  const accept = /accept="([^"]*)"/.exec(inp[0]);
  assert.ok(accept, '받는 종류(accept)가 없다');
  assert.match(accept[1], /\.hwp\b/, '.hwp 가 빠졌다 — 고르는 창에서 흐리게 나와 안 잡힌다');
  assert.match(accept[1], /\.hwpx\b/, '.hwpx 가 빠졌다');
  /* 지금까지 받던 것도 그대로 받아야 한다 — 한글을 넣다가 그림·PDF 를 잃으면 안 된다 */
  assert.match(accept[1], /image\//, '그림을 못 받게 됐다');
  assert.match(accept[1], /pdf/i, 'PDF 를 못 받게 됐다');
});

/* ── ② 한글이면 «쪽»으로 펼친다 ── */
test('올리기 길이 한글을 알아보고 쪽으로 펼친다 — PDF 와 같은 모양으로', () => {
  const body = cutFn(SRC, 'function isHwp(');
  assert.ok(body, 'isHwp 가 없다');
  /* 갈래를 «파일 이름»으로 가린다 — 한글은 브라우저가 주는 type 이 비어 있는 일이 흔하다 */
  assert.match(body, /hwpx\?/, '.hwp 와 .hwpx 를 함께 가리지 않는다');

  /* 펼치는 자리에서 isHwp 를 보고 hwpToPages 로 가야 한다 */
  /* ⚠ 정의가 아니라 «부르는 자리»를 본다 — 정의가 위에 있어 그냥 이름으로 찾으면 그쪽이 걸린다 */
  const i = SRC.indexOf('if (isHwp(f))');
  assert.ok(i > 0, '올리기 길에서 isHwp 를 안 본다');
  /* ⚠ «한글 갈래 안»만 본다. 넉넉히 자르면 바로 아래 PDF 갈래의 alert 가 걸려
     한글 쪽 알림을 지워도 검사가 통과한다(뮤테이션에서 실제로 그랬다). */
  const seg = SRC.slice(i, SRC.indexOf('continue;', i));
  assert.ok(seg.length > 40 && seg.length < 700, '한글 갈래를 제대로 못 잘랐다');
  assert.match(seg, /hwpToPages\(/, '한글을 쪽으로 안 펼친다');
  /* 못 열면 «말하고» 넘어간다 — 조용히 지나가면 사람이 올린 줄 안다 */
  assert.match(seg, /catch/, '못 여는 경우를 안 다룬다');
  assert.match(seg, /alert\(/, '못 열었을 때 아무 말도 안 한다');
});

/* ── ③ 글자가 붙어 «글자로» 판독된다 ── */
test('펼친 쪽에 글자가 실려 판독이 글자로 간다', () => {
  const body = cutFn(SRC, 'async function hwpToPages(');
  assert.ok(body, 'hwpToPages 가 없다');
  /* PDF 와 «같은 모양»을 돌려줘야 아래 길이 하나로 유지된다 */
  assert.match(body, /\bpages\b/, '쪽 목록을 안 돌려준다');
  assert.match(body, /\btaken\b/, '실제로 담은 쪽수를 안 돌려준다');
  assert.match(body, /text:/, '쪽에 글자를 안 싣는다 — 그러면 그림으로 읽어 비싸진다');
  /* 글자가 없는 한글은 담지 않고 말해 준다 */
  assert.match(body, /pdfTextUsable\(/, '글자가 쓸 만한지 안 가린다');
  assert.match(body, /throw new Error/, '글자 없는 한글을 조용히 담는다');
});

test('한글 읽는 도구는 «올릴 때만» 내려받는다', () => {
  const body = cutFn(SRC, 'function loadHwpLib(');
  assert.ok(body, 'loadHwpLib 가 없다');
  /* 화면을 열 때 미리 싣지 않는다 — 셋을 합치면 1MB 가 넘는다 */
  assert.ok(!/<script[^>]+src="hwp_extract\.js"/.test(HTML),
    '한글 읽개를 처음부터 싣고 있다 — 한글을 안 올리는 사람에게 헛 내려받기다');
  assert.ok(!/<script[^>]+src="vendor\/xlsx/.test(HTML), '엑셀 도구를 처음부터 싣고 있다');
  /* 급여데이터함과 같은 셋이어야 한다 */
  ['vendor/xlsx.full.min.js', 'vendor/pako.min.js', 'hwp_extract.js'].forEach(function (f) {
    assert.ok(body.indexOf(f) >= 0, f + ' 를 안 부른다');
  });
  /* ── 한 번만 받는가 — «글자»가 아니라 실제로 돌려서 센다 ──
     ⚠ 종전에는 hwpLibP 라는 «글자»만 봤다. 그런데 앞을 막는 한 줄을 지워도
       그 글자는 남아 있어 검사가 통과했다(뮤테이션에서 확인). 그래서 센다. */
  const ctxObj = { window: {}, Promise: Promise, loads: [] };
  vm.createContext(ctxObj);
  vm.runInContext(
    'function loadScriptOnce(s) { loads.push(s); return Promise.resolve(); }\n' +
    'let hwpLibP = null;\n' + body.replace(/^let hwpLibP = null;\s*/, ''), ctxObj);
  return Promise.all([ctxObj.loadHwpLib(), ctxObj.loadHwpLib()]).then(function () {
    assert.strictEqual(ctxObj.loads.length, 3,
      '두 번 불렀더니 도구를 ' + ctxObj.loads.length + '번 내려받았다 — 한 벌(3개)이어야 한다');
  });
});

/* ── ④ 한글은 「따로냐 합치냐」를 묻지 않는다 ── */
test('한글은 쪽 나누기를 묻지 않고 늘 한 문서다', () => {
  const i = SRC.indexOf('const asks =');
  assert.ok(i > 0, '묻는 자리를 못 찾았다');
  const seg = SRC.slice(i, i + 300);
  assert.match(seg, /!x\.hwp/, '한글에도 「따로냐 합치냐」를 묻는다');

  const j = SRC.indexOf('const apart =');
  assert.ok(j > 0, '「따로 담기」 판정 자리를 못 찾았다');
  assert.match(SRC.slice(j, j + 120), /!x\.hwp/,
    '한글이 낱장으로 갈라질 수 있다 — 한 계약서가 남남인 사진이 된다');
});

test('한글은 서식이 안 담긴다고 «말해 준다»', () => {
  const i = SRC.indexOf('const hwpN =');
  assert.ok(i > 0, '한글 개수를 안 센다');
  const seg = SRC.slice(i, i + 400);
  assert.match(seg, /toast\(|alert\(/, '아무 말 없이 서식을 버린다');
  assert.match(seg, /서식/, '무엇이 빠지는지 말하지 않는다');
});

/* ── ⑤ 읽개는 그대로 쓴다 ── */
test('읽개(hwp_extract.js)는 취업규칙·급여데이터함과 같은 것을 쓴다', () => {
  const api = require(path.join(ROOT, 'hwp_extract.js'));
  assert.strictEqual(typeof api.extractDocText, 'function');
  assert.strictEqual(typeof api.extractHwpxText, 'function');
  /* 다른 두 앱도 같은 파일을 부른다 — 여기만 갈라지면 셋이 조용히 달라진다 */
  ['rules.html', 'pu-paydata.html'].forEach(function (f) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(s.indexOf('hwp_extract.js') >= 0, f + ' 가 더 이상 이 읽개를 안 쓴다');
  });
});

/* ── ⑥ 진짜로 읽히는가 — 파일을 지어 도로 읽는다 ── */
test('진짜 hwpx 를 지어 읽으면 글자가 그대로 나온다', () => {
  const HWPX = require(path.join(ROOT, 'hwpx_gen.js'));
  const api = require(path.join(ROOT, 'hwp_extract.js'));
  const 줄 = ['근 로 계 약 서', '사업장: 푸른물산', '사업자등록번호: 128-81-39938',
    '근로자: 김푸른', '임금: 월 2,500,000원', '계약기간: 2026-09-01 ~ 2027-08-31'];
  const xml = 줄.map(function (t) { return HWPX.para(t); }).join('');
  const u8 = HWPX.build(xml);
  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

  const got = api.extractHwpxText(ab, require(path.join(ROOT, 'vendor/pako.min.js')));
  줄.forEach(function (t) {
    assert.ok(got.indexOf(t) >= 0, '「' + t + '」 가 안 읽혔다. 읽힌 것: ' + JSON.stringify(got.slice(0, 200)));
  });
  /* 사진첩이 「글자로 읽을 만하다」고 볼 만큼 나와야 한다(PDF_TEXT_MIN = 40자) */
  const min = Number(/const PDF_TEXT_MIN = (\d+)/.exec(SRC)[1]);
  assert.ok(got.replace(/\s/g, '').length >= min,
    '뽑힌 글자가 문턱(' + min + '자)에 못 미친다 — 사진첩이 그림으로 읽으려 든다');
});

/* ── 쪽 나누기가 실제로 도는가 — 브라우저 함수를 그대로 돌려 본다 ── */
test('긴 글이 쪽으로 갈라지고, 줄은 재어서 자른다', () => {
  const ctxObj = {};
  vm.createContext(ctxObj);
  vm.runInContext(cutFn(SRC, 'function hwpWrapLines('), ctxObj);
  /* 글자 폭을 «재는» 흉내 — 한 글자 10 */
  const fake = { measureText: function (s) { return { width: s.length * 10 }; } };
  const lines = ctxObj.hwpWrapLines(fake, '가나다라마바사아자차', 45);
  assert.ok(lines.length >= 3, '넓이를 넘겨도 안 자른다: ' + JSON.stringify(lines));
  lines.forEach(function (l) {
    assert.ok(l.length * 10 <= 45 || l.length === 1, '자른 줄이 넓이를 넘는다: ' + l);
  });
  /* 빈 줄은 살린다 — 문단 사이가 붙으면 판독이 문단을 못 가린다 */
  /* ⚠ vm 안에서 만든 배열이라 deepStrictEqual 은 «다른 세상의 배열»이라며 어긋난다 */
  assert.deepStrictEqual(Array.prototype.slice.call(ctxObj.hwpWrapLines(fake, '가\n\n나', 100)),
    ['가', '', '나']);
});

/* ── 「글자가 없는 스캔」 안내가 판독 실패로 안 읽히는가 ── */
test('글자층 없는 스캔 안내는 «쪽 나누기» 이야기임을 밝히고 판독은 된다고 말한다', () => {
  const ctxObj = { PuDocRead: { bizNoValid: function () { return false; } } };
  vm.createContext(ctxObj);
  vm.runInContext(cutFn(SRC, 'function bizNosInText('), ctxObj);
  vm.runInContext('const PDF_TEXT_MIN = ' + /const PDF_TEXT_MIN = (\d+)/.exec(SRC)[1] + ';', ctxObj);
  vm.runInContext(cutFn(SRC, 'function pdfTextUsable('), ctxObj);
  vm.runInContext(cutFn(SRC, 'function pdfSplitHint('), ctxObj);

  const hint = ctxObj.pdfSplitHint([{ text: '' }, { text: '' }]);
  assert.strictEqual(hint.split, false, '글자가 없는데 「따로」를 권한다');
  /* ★ 이것이 이 고침의 핵심이다 — 사람이 이 줄을 「판독 실패」로 읽고 취소했다 */
  assert.match(hint.why, /판독/, '판독이 어떻게 되는지 말하지 않는다 — 못 읽는 줄 알고 취소한다');
  assert.ok(!/무엇인지 가릴 수 없/.test(hint.why),
    '판독 실패로 읽히는 옛 문구가 돌아왔다');
  assert.match(hint.why, /쪽/, '이 줄이 «쪽 나누기» 이야기임을 안 밝힌다');
});

test('안내가 두 줄이어도 화면에서 줄이 살아 있고, 글자가 새지 않는다', () => {
  const i = SRC.indexOf('class="hint">🔍');
  assert.ok(i > 0, '안내를 그리는 자리를 못 찾았다');
  /* ── «글자»가 아니라 실제로 그려 본다 ──
     ⚠ 순서를 글자로만 보면(어느 것이 앞에 나오나) 뒤집힌 것을 못 잡는다 —
       뮤테이션에서 esc(…replace…) 로 뒤집었는데 그대로 통과했다.
       그래서 진짜 esc 를 붙여 그려 보고 «나온 결과»를 본다. */
  const expr = /'<div class="hint">🔍 ' \+ ([\s\S]*?) \+ '<\/div>'/.exec(SRC);
  assert.ok(expr, '안내를 그리는 식을 못 찾았다');
  const draw = vm.runInNewContext('(function (esc, r) { return ' + expr[1] + '; })', {});
  const esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const out = draw(esc, { hint: { why: '첫 줄 <b>굵게</b>\n둘째 줄' } });
  assert.ok(out.indexOf('<br>') >= 0, '줄바꿈이 안 살아 두 줄이 한 줄로 붙는다');
  assert.ok(out.indexOf('&lt;b&gt;') >= 0,
    '안내를 그대로 넣는다 — 파일 이름에 든 <> 가 화면을 깨뜨린다');
  assert.ok(out.indexOf('<b>') < 0, '글자가 새어 나가 화면 꾸밈으로 읽힌다');
});

/* ── 「취소」가 무슨 일을 하는지 이름에 적혀 있는가 ── */
test('쪽 나누기를 물을 때는 단추 이름이 «올리지 않기»이고, 닫으면 되돌린다', () => {
  assert.match(HTML, /id="kindPopupCancel"/, '취소 단추에 손잡이가 없어 이름을 못 바꾼다');

  const ask = cutFn(SRC, 'function askPdfSplit(');
  assert.ok(ask, 'askPdfSplit 가 없다');
  assert.match(ask, /kindPopupCancel'\)\.textContent *= *'올리지 않기'/,
    '「취소」인 채로 둔다 — 이 물음만 접는 줄 알고 누르면 올리기가 통째로 없던 일이 된다');

  const close = cutFn(SRC, 'function closeKindPopup(');
  assert.ok(close, 'closeKindPopup 가 없다');
  assert.match(close, /kindPopupCancel'\)\.textContent *= *'취소'/,
    '이름을 안 되돌린다 — 다른 창에도 「올리지 않기」가 남는다');
});
