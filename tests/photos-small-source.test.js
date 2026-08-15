/* 원본이 작아 못 읽었을 수 있는 서류 (대표 지시 2026-08-13)
   "이 페이지는 글자가 작아서 제대로 안 읽힌 것 같다. 어떻게 해야 되나 이런 경우"

   실제 사례: 512×755 화면 캡처 한 장에 빽빽한 신청서 표가 통째로 들어 있었다.
   ⚠ 이 검사가 지키는 것은 「못 읽는 것」이 아니라 **지어낸 값이 조용히 흘러가는 것**이다.
     AI는 흐린 자리를 그럴듯한 문장으로 메운다. 말없이 넘어가면 그 값이 그대로
     업체관리·계약관리로 간다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const m = app.match(new RegExp('^(?:async )?function ' + name + '\\([\\s\\S]*?\\r?\\n\\}', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0];
}
function constOf(name) {
  const m = app.match(new RegExp('^const ' + name + ' = \\{[\\s\\S]*?\\n\\};', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0].replace('const ', 'var ');
}

/* tooSmall 을 실제로 돌린다 — 있는지만 보면 기준값을 0 으로 낮춰도 안 잡힌다 */
function load() {
  const ctx = { Number, Math, String };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(constOf('MIN_READ_EDGE') + '\n' + fnOf('tooSmall'), ctx);
  return ctx;
}
const doc = function (kind, w, h) { return { meta: { w: w, h: h, read: { kind: kind } } }; };

test('★ 512×755 짜리 서식은 작다고 잡는다 — 실제 사례', () => {
  const c = load();
  assert.equal(c.tooSmall(doc('form', 512, 755)), 755, '긴 변을 그대로 알려 줘야 사람이 판단합니다');
});

test('★ 넉넉한 서류는 안 건드린다 — 헛경고가 쌓이면 목록을 못 믿는다', () => {
  const c = load();
  assert.equal(c.tooSmall(doc('form', 2480, 3508)), 0);      // A4 300dpi
  assert.equal(c.tooSmall(doc('contract', 1600, 2263)), 0);
  assert.equal(c.tooSmall(doc('card', 1000, 600)), 0);
});

test('★ 기준은 종류마다 다르다 — 명함과 서식을 같이 재면 안 된다', () => {
  const c = load();
  /* 명함은 칸이 몇 개 안 되고 글씨가 커서 1000이면 읽힌다.
     같은 1000이라도 빽빽한 서식은 못 읽는다 — 여기가 갈려야 한다. */
  assert.equal(c.tooSmall(doc('card', 1000, 600)), 0, '명함 1000은 넉넉합니다');
  assert.equal(c.tooSmall(doc('form', 1000, 600)), 1000, '★ 서식 1000은 못 읽습니다');
  assert.equal(c.tooSmall(doc('bizreg', 1200, 900)), 1200);
  assert.equal(c.tooSmall(doc('bizreg', 1400, 900)), 0, '기준값과 같으면 통과입니다');
});

test('★ 글자를 읽는 물건이 아닌 것에는 말하지 않는다', () => {
  const c = load();
  assert.equal(c.tooSmall(doc('meeting', 400, 300)), 0, '회의·현장 사진에 경고하면 헛말입니다');
  assert.equal(c.tooSmall(doc('other', 400, 300)), 0);
  assert.equal(c.tooSmall({ meta: { w: 400, h: 300 } }), 0, '아직 안 읽은 사진');
  assert.equal(c.tooSmall(null), 0);
});

test('★ 크기를 모르는 옛 사진은 안 건드린다', () => {
  /* w·h 를 안 적던 시절 사진이 있다. 모르는 것을 「작다」로 몰면
     멀쩡한 서류가 죄다 할 일로 쌓여 목록이 쓸모없어진다. */
  const c = load();
  assert.equal(c.tooSmall({ meta: { read: { kind: 'form' } } }), 0);
  assert.equal(c.tooSmall({ meta: { w: 0, h: 0, read: { kind: 'form' } } }), 0);
});

test('★ 알림이 무엇을 하라는 것인지까지 적는다', () => {
  const fn = fnOf('smallBox');
  assert.match(fn, /지어냈을 수 있습니다/,
    '★ "작습니다"만 적으면 사람이 읽은 값을 그대로 믿습니다');
  assert.match(fn, /원본과 한 줄씩 대조/);
  assert.match(fn, /PDF로 저장해 올리기/, '할 수 있는 일을 안 적으면 알림이 잔소리가 됩니다');
  assert.match(fn, /150~200%/);
  assert.match(fn, /한 문서로 묶기/);
  // 실제 크기를 적어야 "얼마나 작은지"를 사람이 안다
  assert.match(fn, /m\.w \+ '×' \+ m\.h/);
  // 작지 않으면 아무것도 안 낸다
  const ctx = load();
  vm.runInContext(fnOf('smallBox'), ctx);
  assert.equal(ctx.smallBox(doc('form', 2480, 3508)), '');
  assert.match(ctx.smallBox(doc('form', 512, 755)), /512×755/);
});

test('★ 표보다 먼저 나온다 — 다 읽은 뒤에 알면 이미 믿은 뒤다', () => {
  const fn = fnOf('renderReadPanel');
  assert.match(fn, /smallBox\(it\)/, '함수만 있고 안 부르면 화면에 아무것도 없습니다');
  assert.ok(fn.indexOf('smallBox(it)') < fn.indexOf("'<table>' + rows"),
    '★ 표 뒤에 있습니다 — 값을 먼저 믿게 됩니다');
});

test('★ 할 일로 남는다 — 사람이 대조해야 끝난다', () => {
  const fn = fnOf('needsCheck');
  assert.match(fn, /if \(tooSmall\(it\)\) return true;/);
  /* 「확인했음」(ack)으로 치울 수 있어야 한다 — 못 치우는 할 일은 목록을 못 믿게 한다 */
  assert.ok(fn.indexOf('r.ack') < fn.indexOf('tooSmall(it)'),
    '★ 확인했음보다 앞에 있으면 영원히 안 지워지는 ⚠ 가 됩니다');
});

test('★ 걸린 이유에 원본 크기를 적는다 — 헛되이 「다시 판독」을 누르지 않게', () => {
  const fn = fnOf('checkWhy');
  assert.match(fn, /const small = tooSmall\(it\);/);
  assert.match(fn, /'원본이 작습니다\(' \+ small \+ 'px\) — 값을 원본과 대조'/);
  /* 「읽은 값이 미덥지 않음 — 열어서 확인」보다 먼저 말해야 원인을 안다.
     같은 그림을 또 읽어 봐야 결과가 같다. */
  assert.ok(fn.indexOf('tooSmall(it)') < fn.indexOf('읽은 값이 미덥지 않음'),
    '★ 원인을 안 알려주면 같은 그림을 되풀이해 읽습니다');
  // 급여서류·판독실패가 먼저다(지우거나 다시 올려야 하는 것이 우선)
  assert.ok(fn.indexOf("r.kind === 'payslip'") < fn.indexOf('tooSmall(it)'));
  assert.ok(fn.indexOf('r.error') < fn.indexOf('tooSmall(it)'));
});

test('앱이 작은 원본을 키우지 않는다는 사실은 그대로다', () => {
  /* 「앱이 줄인 것 아니냐」는 물음에 답하는 자리다 — 줄이기만 하고 키우지 않는다 */
  assert.match(fnOf('drawScaled'), /const scale = Math\.min\(1, maxEdge \/ Math\.max\(iw, ih\)\);/,
    '작은 그림을 억지로 키우면 흐린 그림이 커질 뿐이고, 판독은 더 나빠집니다');
});
