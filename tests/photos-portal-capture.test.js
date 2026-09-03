'use strict';
/* 정부포털 사업장 정보 «화면 캡처»를 담는 길 — 대표 지시 2026-08-23

   "기술보호컨설팅과 현장클리닉의 경우 화면캡처로 사업장의 정보를 저장해야 할
    경우가 많이 있다. 이럴 경우 별도로 저장셀을 만들 거다. 이 부분은 캡처해서
    넣으면 별도로 관리 가능할까?"

   코드를 짚어 보니 «대부분 이미 되어 있었다»: 캡처는 kind=form 으로 읽히고,
   제목(docName)이 그대로 기업정보함의 갈래(탭)가 되며, 사업자번호로 회사가 묶인다.
   그래서 새 저장칸을 만들 것이 아니라 «빠진 두 곳»을 메운다.

   ① 자격을 가리는 숫자가 기업 상세까지 오지 못했다.
      매출액·상시근로자수·주생산품은 pairs(사람이 눈으로 볼 차례)에만 있었고,
      기업정보함으로 넘어가는 것은 «이름 붙은 키»뿐이다. 기술보호·현장클리닉은
      바로 그 숫자로 자격을 보는데 정작 그것이 빠져 포털을 다시 열어야 했다.
   ② 캡처가 「원본이 작습니다 — 값을 원본과 대조」로 걸렸다.
      캡처는 그게 원본이라 더 크게 받을 길이 없다 — 헛되이 찾아다니게 만드는 안내다.
      ⚠ 서식은 크기와 무관하게 「서식 — 읽은 칸 확인」으로 여전히 할 일이다(8/13 결정).
        여기서 바꾸는 것은 «이유 문구»이지 할 일 여부가 아니다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const read = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const file = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

function fnOf(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* ══════ ① 자격 숫자가 끝까지 간다 ══════
   판독 프롬프트 → 넘기는 목록 → 화면 이름표. 세 곳이 다 있어야 값이 보인다.
   한 곳만 늘리면 「값은 쌓이는데 화면에 안 나온다」 또는 그 반대가 된다. */

const NEED = [
  ['sales', '직전년도 매출액'],
  ['workers', '상시근로자수'],
  ['product', '주생산품'],
  ['corpno', '법인등록번호'],
  ['openDate', '설립일자'],
  ['bizType', '업태'],
  ['bizItem', '업종'],
  ['homepage', '홈페이지']
];

test('★ 판독기가 서식에서 그 칸들을 «이름 붙은 키»로 뽑는다', () => {
  const i = read.indexOf('kind=form 이면 키');
  assert.ok(i > 0, '서식 키 목록을 찾지 못했습니다');
  const line = read.slice(i, read.indexOf('\n', i) + 1);
  NEED.forEach(function (p) {
    assert.ok(line.indexOf(p[0] + '(') >= 0,
      '★ ' + p[0] + '(' + p[1] + ') 가 없습니다 — pairs 에만 담기면 기업 상세까지 못 옵니다');
  });
});

test('★ 넘기는 목록(KEEP)에도 있다 — 없으면 읽어도 기업정보함에 안 들어간다', () => {
  const fn = fnOf(file, 'sendToCoInfo');
  const i = fn.indexOf('var KEEP');
  assert.ok(i > 0, 'KEEP 목록을 찾지 못했습니다');
  const seg = fn.slice(i, fn.indexOf('];', i));
  NEED.forEach(function (p) {
    assert.ok(seg.indexOf("'" + p[0] + "'") >= 0, '★ KEEP 에 ' + p[0] + ' 가 없습니다');
  });
});

test('★ 기업 상세 화면에 이름표가 있다 — 없으면 값은 쌓이는데 안 보인다', () => {
  const i = cards.indexOf('const CO_FIELDS = [');
  assert.ok(i > 0, 'CO_FIELDS 를 찾지 못했습니다');
  const seg = cards.slice(i, cards.indexOf('];', i));
  NEED.forEach(function (p) {
    assert.ok(seg.indexOf("['" + p[0] + "'") >= 0,
      '★ CO_FIELDS 에 ' + p[0] + ' 이름표가 없습니다 — 포털을 또 열게 됩니다');
  });
});

test('★ 프롬프트를 고쳤으니 판독기 판 번호를 올렸다 — 안 올리면 옛 사진이 안 고쳐진다', () => {
  const m = read.match(/var READ_VERSION = (\d+);/);
  assert.ok(m, 'READ_VERSION 을 찾지 못했습니다');
  assert.ok(Number(m[1]) >= 10, '★ 판 번호를 안 올렸습니다 — 이미 읽은 서식이 옛 칸으로 굳습니다');
});

test('★ .js 를 고쳤으니 ?v= 도 올렸다 — 안 올리면 캐시에 묻힌다', () => {
  const a = app.match(/js\/pu-doc-read\.js\?v=(\d+)/);
  const b = app.match(/js\/pu-doc-file\.js\?v=(\d+)/);
  assert.ok(a && Number(a[1]) >= 13, '★ pu-doc-read.js 의 ?v= 를 안 올렸습니다');
  assert.ok(b && Number(b[1]) >= 4, '★ pu-doc-file.js 의 ?v= 를 안 올렸습니다');
});

test('매출액·상근로자수는 숫자만 담으라고 이른다 — 「4199 백만원」이 들어오면 못 견준다', () => {
  const i = read.indexOf('kind=form 이면 키');
  const line = read.slice(i, read.indexOf('\n', i) + 1);
  assert.match(line, /sales\(직전년도 매출액 — 숫자만/);
  assert.match(line, /workers\(상시근로자수 — 숫자만\)/);
});

/* ══════ ② 캡처에 헛된 안내를 안 한다 ══════ */

function load() {
  const consts = ['MIN_READ_EDGE', 'KEEP_ONLY', 'CARD_KINDS', 'CO_KINDS', 'TEL_SHAPE', 'MAIL_SHAPE']
    .map(function (n) {
      const i = app.indexOf('const ' + n + ' =');
      assert.ok(i > 0, n + ' 를 찾지 못했습니다');
      return app.slice(i, app.indexOf(';', i) + 1);
    }).join('\n');
  /* ⚠ 2026-08-24: 서식·대화캡처가 「사람이 해서 달라지는 것이 있을 때만」 할 일이 되어
     formTodo·chatTodo(그리고 그것이 쓰는 canSendCoInfo)를 함께 떠야 한다 — 안 실으면
     needsCheck 가 그 줄에서 멎어 이 파일이 통째로 운다. */
  const src = consts + '\n' + app.match(/^const FIX_KEYS = \[[^\r\n]*\];/m)[0].replace('const ', 'var ') + '\n' +
    ['tooSmall', 'smallCheckedOk', 'readAnyField', 'coFilledOk', 'coTodo',
     /* ⚠ 2026-09-03 — canSendCoInfo 가 «사람이 채운 값»(readFields)을 본다 */
     'readFields', 'canSendCoInfo', 'formTodo', 'chatTodo', 'readFailKind', 'readFailAdvice',
     /* ⚠ 2026-09-02 💰 임금 확인 */
     'wageRead', 'wageOkOf', 'wageBoxOn', 'wageNeedsOk', 
     'needsCheck', 'checkWhy']
      .map(function (n) { return fnOf(app, n); }).join('\n');
  const rules = ['READ_FAIL_RULES', 'FAIL_GIVEUP'].map(function (n) {
    const m = app.match(new RegExp('^const ' + n + ' = [\\s\\S]*?;$', 'm'));
    assert.ok(m, n + ' 를 찾지 못했습니다');
    return m[0];
  }).join('\n');
  const c = { Math, Number, String, Object, Boolean, Date, RegExp, Array };
  vm.createContext(c); vm.runInContext(rules + '\n' + src, c);
  return c;
}
const S = load();

/* 정부포털 캡처 — 긴 변 1500 안팎(서식 기준 1600 보다 작다) */
function capture(extra, w, h) {
  return { meta: { w: w || 1525, h: h || 977,
    read: Object.assign({ kind: 'form', auto: false, bizNoOk: true,
      fields: { docName: '통합 기술보호지원반 신청서', company: '남양인텍', bizno: '312-81-28123' } },
      extra || {}) } };
}

test('★ 사업자번호를 읽은 캡처에 「원본이 작다」고 하지 않는다 — 캡처가 원본이다', () => {
  const x = capture();
  assert.equal(S.tooSmall(x), 1525, '작다는 판정 자체는 그대로여야 합니다');
  assert.equal(S.smallCheckedOk(x.meta.read), true,
    '★ 서식의 auto=false 는 「자동 등록 대상이 아니다」는 뜻입니다 — 검증 실패가 아닙니다');
  assert.ok(S.checkWhy(x).indexOf('원본이 작습니다') < 0,
    '★ 「원본과 대조」라고 하면 있지도 않은 큰 원본을 찾아다닙니다: ' + S.checkWhy(x));
});

/* ⚠⚠ 2026-08-13 결정을 **대표 지시로 뒤집었다**(2026-08-24):
     "계속해서 확인 필요가 나온다. 실제 화면에서는 전혀 문제가 없는데 어떻게 해야 하나.
      이 부분 제대로 완전히 고쳐 달라."
   8/13 에는 「서식은 읽은 칸을 한 번 본다」였고, 그래서 서식이 조건 없이 할 일이었다.
   그런데 서식은 상담 한 건에 여러 장씩 나오므로 확인필요가 서식으로 늘 차서, 정작
   손봐야 할 것이 묻혔다. 이제 「기업 상세로 보낼 것이 남았을 때만」 할 일이다.
   ⚠ 값이 틀렸을 위험은 그대로 지킨다 — 기업 상세로 스스로 가는 것은 기계가 번호를
     검산한 것만이고, 원본이 작은 서식은 크기 판정에서 먼저 걸린다. */
test('★ 보낼 것이 남은 캡처는 할 일이다 — 누르면 끝난다', () => {
  const x = capture();
  assert.equal(S.needsCheck(x), true, '★ 보낼 것이 남았는데 조용히 묻히면 안 됩니다');
  assert.match(S.checkWhy(x), /기업 상세로 아직 안 보냄/);
});

test('★ 기업 상세로 보낸 캡처는 할 일이 아니다 — 치울 수 없는 할 일을 만들지 않는다', () => {
  const x = capture({ filedInfo: { at: 1756000000000, by: '박은비', n: 5 } });
  assert.equal(S.needsCheck(x), false,
    '★ 보냈는데도 남으면 확인필요가 서식으로 차고 정작 손볼 것이 묻힙니다');
  assert.equal(S.checkWhy(x), '');
});

test('★ 사업자번호를 못 읽은 캡처는 그대로 「원본이 작다」다 — 확인할 것이 없다', () => {
  const x = capture({ bizNoOk: null, fields: { docName: '무슨 신청서' } });
  assert.equal(S.smallCheckedOk(x.meta.read), false);
  assert.match(S.checkWhy(x), /원본이 작습니다\(1525px\)/);
});

test('번호 체크섬에 걸린 캡처도 그대로다 — 지어낸 번호일 수 있다', () => {
  const x = capture({ bizNoOk: false });
  assert.equal(S.smallCheckedOk(x.meta.read), false);
});

test('넉넉히 큰 캡처는 애초에 크기 판정에 안 걸린다', () => {
  const x = capture({}, 1829, 1063);
  assert.equal(S.tooSmall(x), 0);
  assert.ok(S.checkWhy(x).indexOf('원본이 작습니다') < 0);
});

test('★ 다른 갈래는 여전히 auto 를 본다 — 폐업 업체가 통과하면 안 된다', () => {
  const biz = { meta: { w: 900, h: 1200, read: { kind: 'bizreg', auto: false, bizNoOk: true,
    fields: { company: '가나' } } } };
  assert.equal(S.smallCheckedOk(biz.meta.read), false,
    '★ 서식 예외가 사업자등록증까지 새면 국세청 이상이 통과합니다');
});

test('기계가 가릴 길 없는 갈래는 그대로다 — 근태표·대화캡처', () => {
  for (const k of ['timesheet', 'chat']) {
    const x = { meta: { w: 600, h: 800, read: { kind: k, auto: false, bizNoOk: true, fields: {} } } };
    assert.equal(S.smallCheckedOk(x.meta.read), false, k + ' 를 풀어 주고 있습니다');
  }
});
