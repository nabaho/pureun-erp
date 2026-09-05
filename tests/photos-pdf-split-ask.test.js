'use strict';
/* 여러 쪽 PDF — 「한 문서로」냐 「쪽마다 따로」냐 물어본다 (대표 지시 2026-08-24)

   "여러 장의 pdf 가 하나의 화일일 경우 팝업으로 질문하게 하는 건 어떤가"

   지금까지는 무조건 한 문서로 묶었다(2026-08-10 결정 — 계약서는 쪽마다 따로 보면
   2쪽 이후가 빈칸으로 온다). 그런데 **업체 열 곳의 사업자등록증을 한 번에 스캔**하면
   파일 하나에 열 쪽이고, 한 문서로 읽으면 **업체 하나만 기록되고 아홉 곳이 조용히
   사라진다.** 앱이 스스로 알 수 없는 일이라 묻는 것이 맞다.

   ⚠ 그냥 묻지 않는다 — **권하면서** 묻는다. 글자를 이미 뽑아 두므로(2026-08-24)
     쪽마다 사업자번호가 몇 가지인지 셀 수 있다. 「알아서 고르세요」는 떠넘기는 것이다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* 체크섬이 진짜 도는 판독기를 쓴다 — 가짜로 두면 「전화번호를 안 센다」를 증명할 수 없다. */
const readjs = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const RD = (function () {
  const c = { window: {}, console: { warn() {} }, Date, Promise, Object, String, Number, Math, JSON };
  c.globalThis = c;
  vm.createContext(c);
  new vm.Script(readjs, { filename: 'pu-doc-read.js' }).runInContext(c);
  return c.window.PuDocRead;
})();

const J = (function () {
  const c = { PuDocRead: RD, Object, String, Array, Number, Boolean };
  vm.createContext(c);
  vm.runInContext(app.match(/^const PDF_TEXT_MIN = \d+;$/m)[0] + '\n' +
    fnOf('pdfTextUsable') + '\n' + fnOf('bizNosInText') + '\n' + fnOf('pdfSplitHint'), c);
  return c;
})();

/* 체크섬을 통과하는 실제 꼴의 번호 둘 (실데이터에서 가져온 것) */
const B1 = '312-81-28123';
const B2 = '221-88-02146';
/* ⚠ 문턱(40자)을 넘게 넉넉히 둔다. 짧게 두면 「글자 없는 스캔」으로 갈려 엉뚱한
   것을 재게 된다(처음에 29자로 두어 그렇게 걸렸다). 실제 서류 쪽은 수백 자다. */
const PAD = ' 사업자등록증명 상호 대표자 성명 개업연월일 사업장소재지 업태 종목' +
  ' 발급기관 세무서장 발급일자 이 증명은 사업자등록증의 기재사항과 같음을 증명합니다 ';

/* ══════ ① 번호를 세는 것 ══════ */

test('★ 사업자번호를 찾아낸다 — 붙여 쓴 것도', () => {
  assert.deepEqual(J.bizNosInText('사업자등록번호 ' + B1).join(','), '3128128123');
  assert.deepEqual(J.bizNosInText('3128128123').join(','), '3128128123');
});

test('★ 체크섬을 통과한 것만 센다 — 전화번호·계좌번호가 섞이면 헛 권고가 된다', () => {
  /* 열 자리이지만 사업자번호 규칙에 안 맞는 수 */
  assert.equal(J.bizNosInText('010-1234-5678 041-583-1893').length, 0);
  assert.equal(J.bizNosInText('999-99-99999').length, 0, '★ 아무 열 자리나 세고 있습니다');
});

test('같은 번호가 여러 번 나와도 한 가지로 센다', () => {
  assert.equal(J.bizNosInText(B1 + ' ' + B1 + ' ' + B1).length, 1);
});

/* ══════ ② 권하는 판정 ══════ */
const page = function (t) { return { text: t }; };

test('★ 번호가 여러 가지면 「쪽마다 따로」를 권한다 — 아홉 업체가 사라지는 것을 막는다', () => {
  const h = J.pdfSplitHint([page(PAD + B1), page(PAD + B2)]);
  assert.equal(h.split, true, '★ 서로 다른 업체인데 한 문서로 묶으면 하나만 남습니다');
  assert.equal(h.kinds, 2);
  assert.match(h.why, /2가지/, '까닭을 안 알려 주면 왜 그런지 모릅니다');
});

test('★ 번호가 한 가지면 「한 문서로」를 권한다 — 계약서·앞뒤 서류', () => {
  const h = J.pdfSplitHint([page(PAD + B1), page(PAD + B1), page(PAD + '제2조 보수')]);
  assert.equal(h.split, false);
  assert.match(h.why, /1가지/);
});

test('번호가 안 보이면 한 문서로 — 계약서 본문에는 번호가 없는 쪽이 많다', () => {
  const h = J.pdfSplitHint([page(PAD + '제1조'), page(PAD + '제2조')]);
  assert.equal(h.split, false);
  assert.equal(h.kinds, 0);
});

/* ⚠ 여기 두 검사는 2026-09-05 까지 문구를 «글자 그대로» 박아 두었다
   (「글자가 없는 스캔」). 그런데 **그 문구 자체가 버그였다** — 대표님이 그것을
   판독 실패 선언으로 읽고 취소를 누르셨고, 취소하면 한 장도 안 올라간다
   (「데이터 입력할 때 계속 읽기가 안 된다」의 정체가 이것이었다).
   그래서 문구가 아니라 «규칙»을 본다: ①「따로」를 권하지 않는다
   ② 이 줄이 «쪽 나누기» 이야기임을 밝힌다 ③ 판독은 된다고 말한다. */
function assertNoTextHint(h, ko) {
  assert.equal(h.split, false, '★ 모르면서 「따로」를 권하면 계약서가 쪽마다 갈립니다 — ' + ko);
  assert.match(h.why, /글자/, '무엇을 못 봤는지 안 말합니다 — ' + ko);
  assert.match(h.why, /쪽/, '이 줄이 «쪽 나누기» 이야기임을 안 밝힙니다 — ' + ko);
  assert.match(h.why, /판독/,
    '판독이 어떻게 되는지 안 말합니다 — 못 읽는 줄 알고 취소합니다(대표 보고 2026-09-05) — ' + ko);
}

test('★ 글자가 없는 스캔은 「한 문서로」를 권하되, 판독은 된다고 말한다', () => {
  assertNoTextHint(J.pdfSplitHint([page(''), page('')]), '두 쪽 다 글자 없음');
});

test('한 쪽이라도 글자가 없으면 가릴 수 없다 — 그 쪽에 다른 업체가 있을 수 있다', () => {
  assertNoTextHint(J.pdfSplitHint([page(PAD + B1), page('')]), '한 쪽만 글자 없음');
});

test('★ 한 쪽짜리는 아예 묻지 않는다 — 물을 것이 없다', () => {
  assert.equal(J.pdfSplitHint([page(PAD + B1)]), null);
  assert.equal(J.pdfSplitHint([]), null);
  assert.equal(J.pdfSplitHint(null), null);
});

/* ══════ ③ 화면·배선 ══════ */

test('★ 여러 쪽짜리가 있을 때만, 그리고 «한 번만» 묻는다', () => {
  const i = app.indexOf('const asks = spread.filter');
  assert.ok(i > 0, '묻는 자리를 찾지 못했습니다');
  const seg = app.slice(i, i + 700);
  /* ⚠ 조건을 «글자 그대로» 박지 않는다 — 2026-09-05 에 한글을 걸러 내는 조건이
     사이에 끼면서 통째로 깨졌다. 지킬 것은 «쪽수가 둘 이상일 때만 묻는다»이다. */
  assert.match(seg, /x\.pdf\.pages\.length > 1/, '한 쪽짜리까지 묻고 있습니다');
  assert.match(seg, /x\.pdf &&/, 'PDF·스캔이 아닌 것까지 묻고 있습니다');
  assert.match(seg, /if \(asks\.length\) \{/, '★ 물을 것이 없는데 창을 띄웁니다');
  assert.match(seg, /await askPdfSplit\(asks\)/, '★ 파일마다 물으면 다섯 개에 다섯 번입니다');
});

test('★ 취소하면 한 장도 올리지 않는다 — 반쯤 올라가면 치우는 것이 더 일이다', () => {
  const i = app.indexOf('const ans = await askPdfSplit(asks);');
  const seg = app.slice(i, i + 300);
  assert.match(seg, /if \(!ans\) \{ toast\('올리기를 취소했습니다'\); return; \}/,
    '★ 취소했는데 올라가거나, 조용히 멈춥니다');
});

test('★ 창이 닫히면 기다리던 것을 풀어 준다 — 안 풀면 올리기가 영원히 멈춘다', () => {
  const fn = fnOf('closeKindPopup');
  assert.match(fn, /if \(_pdfAskCancel\) \{ const f = _pdfAskCancel; _pdfAskCancel = null; f\(\); \}/,
    '★ ESC·바깥 클릭으로 닫으면 아무 말 없이 멎습니다');
});

test('★ 「따로」를 고르면 묶음 번호를 아예 안 붙인다 — 새 번호로는 안 된다', () => {
  /* ⚠ 자리를 «글자 그대로» 찾지 않는다 — 2026-09-05 에 한글을 늘 한 문서로 두는
     조건(!x.hwp)이 붙으면서 이 검사가 자리를 통째로 못 찾게 됐다. */
  const i = app.indexOf('const apart =');
  assert.ok(i > 0, '갈라 담는 자리를 찾지 못했습니다');
  const seg = app.slice(i, i + 900);
  assert.match(seg, /const gid = apart \? '' : PuPhotoStore\.newId\(\);/);
  assert.match(seg, /if \(!apart\) \{\s*\r?\n\s*file\.__pdfDoc =/,
    '★ 묶음 표를 붙이면 화면이 「한 문서의 여러 쪽」으로 다뤄 함께 지워집니다');
});

test('따로 담아도 어느 파일 몇 쪽인지는 이름에 남는다 — 원본을 다시 찾을 실마리', () => {
  /* ⚠ 자리를 «글자 그대로» 찾지 않는다 — 2026-09-05 에 한글을 늘 한 문서로 두는
     조건(!x.hwp)이 붙으면서 이 검사가 자리를 통째로 못 찾게 됐다. */
  const i = app.indexOf('const apart =');
  const seg = app.slice(i, i + 900);
  assert.match(seg, /base \+ ' \(' \+ p\.page \+ '\/' \+ r\.total \+ '쪽\)'/);
});

test('★ 판독 횟수를 사람에게 말해 준다 — 10쪽 따로 담으면 10번이다', () => {
  const fn = fnOf('askPdfSplit');
  assert.match(fn, /쪽수만큼 <b>판독<\/b>|<b>쪽수만큼 판독<\/b>/,
    '★ 무엇을 고르면 얼마나 드는지 안 알려 줍니다');
  assert.match(fn, /업체가 안 사라집니다/, '왜 따로 담아야 하는지 안 알려 줍니다');
  assert.match(fn, /계약서처럼 한 서류가 여러 쪽인 것은/, '언제 합쳐야 하는지 안 알려 줍니다');
});

test('★ 처음 열 때 권하는 쪽이 켜져 있다 — 안 켜면 「알아서 고르세요」가 된다', () => {
  const fn = fnOf('askPdfSplit');
  assert.match(fn, /_pdfAskPick\[r\.name\] = !!\(r\.hint && r\.hint\.split\);/);
  assert.match(fn, /rows\.forEach\(function \(r, i\) \{ pdfAskSet\(i, _pdfAskPick\[r\.name\] \? 1 : 0\); \}\);/,
    '★ 값만 정해 두고 화면에 안 칠하면 아무것도 안 켜져 보입니다');
});

test('고른 것을 화면에 칠하고 값도 함께 바꾼다', () => {
  const fn = fnOf('pdfAskSet');
  assert.match(fn, /_pdfAskPick\[name\] = !!v;/);
  assert.match(fn, /classList\.toggle\('on'/);
});

test('묻는 칸 모양 규칙이 있다', () => {
  assert.match(app, /\.pdfask \.pick span\.on\{/);
});
