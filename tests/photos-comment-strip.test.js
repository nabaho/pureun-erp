'use strict';
/* 주석 걷개가 «진짜 코드»를 삼키지 않는다 (2026-08-30 에 실제로 삼켰다)

   ■ 무슨 일이 있었나
   이 저장소에는 「소스를 글자로 보는 검사는 주석을 먼저 걷는다」는 규칙이 있다.
   잘 쓴 주석이 검사를 통과시키는 일을 막으려는 것이고, 옳다. 그 걷개가 이렇게 생겼다:

       app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')

   그런데 2026-08-30, HTML 주석 안에 «그림 전체를 받는 적기»를 글자 그대로 적었다.
   그 표기에는 **자바스크립트 주석을 여는 두 글자가 그대로 들어 있다.** 걷개는 그것을
   블록 주석의 시작으로 읽고 다음 닫는 표까지 —— **673KB 중 230KB(34%)** 를 삼켰다.

   ■ 왜 무서운가
   삼켜져도 **검사는 조용히 초록이다.** `assert.ok(!/나쁜것/.test(bare))` 는 소스가
   통째로 사라져도 통과한다. 그날 이 얼개를 쓰던 검사 **일곱 파일**이 한꺼번에
   반쯤 눈을 감고 있었고, 아무도 몰랐다 — 돌연변이 하나가 살아남아서야 드러났다.

   ■ 그래서 이 검사가 하는 일
   걷개를 돌린 뒤 **화면에 반드시 있어야 할 것들이 아직 있는지** 본다.
   다음에 누가 주석에 그런 글자를 또 적으면, 그 자리에서 이 검사가 걸린다.
   ⚠ 고칠 곳은 «검사»가 아니라 **그 주석**이다 — 표기를 풀어 쓰면 된다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

const { stripComments } = require('./strip-comments');
const strip = stripComments;

/* 화면이 살아 있으면 «반드시» 있는 것들 — 하나라도 사라지면 걷개가 삼킨 것이다 */
const MUST = [
  'id="kindPopupTitle"', 'id="kindPopupBox"', 'id="docInput"', 'id="picInput"',
  'id="sharePickBox"', 'id="shareSideBtn"', 'id="gridCount"', 'id="selAllBtn"',
  'function renderGridBar(', 'function openSharePeople(', 'function addFiles('
];

test('★★ 주석을 걷어도 «진짜 코드»가 남는다 — 삼키면 검사 일곱이 눈을 감는다', () => {
  const bare = strip(app);
  const lost = MUST.filter(function (m) { return app.indexOf(m) >= 0 && bare.indexOf(m) < 0; });
  assert.deepEqual(lost, [],
    '★★ 주석 걷개가 진짜 코드를 삼켰습니다: ' + lost.join(', ') + '\n' +
    '  까닭은 거의 언제나 «주석 안에 자바스크립트 주석 여는 두 글자»입니다.\n' +
    '  (예: 그림 전체를 받는 적기를 글자 그대로 적은 자리 — 2026-08-30)\n' +
    '  ⚠ 고칠 곳은 검사가 아니라 **그 주석**입니다. 표기를 풀어 쓰십시오.');
});

test('★★ 삼킨 양이 «터무니없지» 않다 — 34%가 사라진 적이 있다', () => {
  /* ⚠⚠ **줄끝을 먼저 맞춘다** (2026-09-07). 이 저장소는 CRLF 로 받아 두는데 CI 는
     LF 로 본다. 줄끝 하나가 글자 수에 섞이면 같은 파일이 여기서는 33.8%, CI 에서는
     34.1% 가 되어 **이 PC 에서만 초록**이 된다 — 그러면 배포가 CI 에서 막히고,
     고친 사람은 제 화면에서 아무 이상을 못 본다(메모리 tests-crlf-vs-ci-lf 와 같은 병).
     비율을 재는 검사는 «줄끝을 세지 않아야» 두 곳에서 같은 답이 나온다. */
  const src = app.replace(/\r\n/g, '\n');
  const bare = strip(src).replace(/\r\n/g, '\n');
  const gone = (src.length - bare.length) / src.length;
  /* 주석이 촘촘한 파일이라 3할 넘게 걷히는 것 자체는 있을 수 있다. 다만 «갑자기»
     크게 늘면 삼킨 것이다 — 그래서 위 MUST 와 함께 본다(이 줄만으로는 못 잡는다).
     ⚠ 문턱을 0.34 → 0.36 으로 올렸다(2026-09-07, 판독 문지기를 붙이며 34.1% 가 됨).
       이 숫자는 «삼켰나»의 근거가 아니라 «갑자기 늘었나»의 눈금이다 — 삼킨 것을 잡는
       것은 위 MUST 다. 올릴 때는 **왜 늘었는지**를 여기 함께 적는다. 안 적으면 다음
       사람이 그냥 또 올리고, 그때는 정말 삼킨 것을 놓친다. */
  assert.ok(gone < 0.36,
    '★★ 주석으로 ' + Math.round(gone * 100) + '% 가 걷혔습니다 — 코드를 삼키고 있을 수 있습니다.\n' +
    '  위 검사(반드시 있어야 할 것)를 함께 보십시오.');
});

test('★★ 걷개가 «주석은 확실히» 걷는다 — 안 걷으면 잘 쓴 주석이 검사를 통과시킨다', () => {
  /* ⚠ 삼키지 않는 것만 보면, 「아무것도 안 걷는 걷개」가 만점을 받는다.
     그래서 반대쪽도 함께 본다 — 심어 둔 주석 셋이 실제로 사라지는가. */
  const src =
    '<!-- 여기는 지웠다 HTMLMARK -->\n' +
    '<input id="keepMe" accept="image/*,.tif">\n' +
    '<style>.a{color:red} /* CSSMARK */</style>\n' +
    '<script>\n/* BLOCKMARK */\n  // LINEMARK\n  const url = "https://a.b/c"; // 뒤 주석\n' +
    '  function keepFn() { return 1; }\n</' + 'script>';
  const out = strip(src);
  ['HTMLMARK', 'CSSMARK', 'BLOCKMARK', 'LINEMARK'].forEach(function (m) {
    assert.ok(out.indexOf(m) < 0, '★★ 주석을 안 걷었습니다: ' + m);
  });
  /* 코드와 마크업은 그대로 */
  assert.ok(out.indexOf('id="keepMe"') >= 0, '★★ 마크업을 삼켰습니다');
  assert.ok(out.indexOf('accept="image/*,.tif"') >= 0,
    '★★ accept 의 별표빗금을 주석으로 읽고 삼켰습니다 — 이것이 그 병입니다');
  assert.ok(out.indexOf('function keepFn()') >= 0, '★★ 코드를 삼켰습니다');
  assert.ok(out.indexOf('https://a.b/c') >= 0,
    '★ 줄 주석을 걷다가 주소의 빗금 둘을 잘랐습니다');
});

test('★★ 이 검사에 «이빨이 있다» — 옛 걷개를 넣어 보고 걸리는지', () => {
  /* ⚠ 걷개 검사야말로 헛돌기 쉽다(무엇을 봐도 「있다」로 끝나기 때문에).
     그래서 **2026-08-30 까지 쓰던 그 걷개**를 그대로 돌려 보고, 위 검사가 쓰는
     판정이 실제로 무너지는지 확인한다. 안 무너지면 이 파일은 아무것도 안 지킨다. */
  const old = function (s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  };
  const bare = old(app);
  const lost = MUST.filter(function (m) { return app.indexOf(m) >= 0 && bare.indexOf(m) < 0; });
  assert.ok(lost.length > 0,
    '★★ 옛 걷개로도 안 삼켜집니다 — 이 검사는 아무것도 안 지키고 있습니다.\n' +
    '  (그날 실제로 삼킨 것: id="kindPopupTitle" 등 6가지, 673KB 중 230KB)');
});
