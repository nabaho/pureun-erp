'use strict';
/* 거래내역 상단을 한 줄로 + 「휴대폰 연결」을 찾을 수 있게 — 대표 2026-08-30
     「캡쳐2 2줄 1줄로 줄여라 아이콘으로 또는 셀로 해서 양을 줄여라」
     「휴대폰 연결 되게 화면 어떻게 실행하나」

   두 물음은 «같은 자리»였다. 하나문자 손잡이 셋(연결·가져오기·붙여넣기)이 각각
   한 자리씩 차지해 줄이 둘로 접혔고, 접힌 줄은 밀려나 «단추가 아예 없는 것처럼» 보였다.

   ★ 셋을 단추 하나(📱 하나문자 ▾)로 묶는다 — 줄도 줄고, 늘 보인다.
   ⚠ 가리개를 isOwner → isAdmin 으로 넓혔다. isOwner 는 role==='admin' 하나만 보는데
     화면 오른쪽 위 ADMIN 딱지는 isAdmin 으로 뜬다 — 「ADMIN 이라고 적혀 있는데
     단추는 없는」 상태가 될 수 있었다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const CODE = bare(app);

test('★★ 하나문자 손잡이 셋이 «단추 하나»로 묶였다 — 줄이 둘로 접히던 까닭', () => {
  assert.match(CODE, /📱 하나문자 ▾/, '★ 묶은 단추가 없습니다');
  /* 셋이 각각 상단에 늘어서 있으면 안 된다 */
  assert.ok(!/'🔗 휴대폰 연결'\)/.test(CODE), '★ 「휴대폰 연결」이 아직 따로 나와 있습니다');
  assert.ok(!/'📋 PC 에서 붙여넣기'\)/.test(CODE), '★ 「PC 에서 붙여넣기」가 아직 따로 나와 있습니다');
});

test('★★ 묶어 놓고 «못 누르게» 하지 않았다 — 셋 다 차림표에서 부를 수 있다', () => {
  const at = CODE.indexOf('📱 하나문자 ▾');
  assert.ok(at > 0);
  const menu = CODE.slice(at, at + 1600);
  assert.match(menu, /startHanaSmsPair\(\)/, '★ 「휴대폰 연결」을 못 부릅니다');
  assert.match(menu, /importHanaSms\(\)/, '★ 「문자 가져오기」를 못 부릅니다');
  assert.match(menu, /setPasteOpen\(true\)/, '★ 「PC 에서 붙여넣기」를 못 부릅니다');
});

test('★★ 묶어도 «권형하만» 보인다 — 2026-08-26 대표 지시를 흔들지 않는다', () => {
  /* ⚠ 묶으면서 가리개를 isAdmin 으로 넓혔다가 되돌렸다. 안 보이는 까닭이
       «접힌 줄»인지 «권한»인지 확인하지 않은 채 규칙을 흔든 것이었다.
       tests/card-cancel-pair.test.js 가 같은 규칙을 반대편에서 지킨다. */
  const at = CODE.indexOf('📱 하나문자 ▾');
  const before = CODE.slice(Math.max(0, at - 900), at);
  assert.match(before, /_meNow\(\)\.isOwner &&/,
    '★ 「휴대폰 연결은 권형하만」이 풀렸습니다 (2026-08-26 대표 지시)');
});

test('★ 차림표를 열고 닫을 수 있다 — 열기만 되면 화면을 가린다', () => {
  assert.match(CODE, /setHanaMenu\(!hanaMenu\)/, '★ 여닫는 자리가 없습니다');
  assert.match(CODE, /setHanaMenu\(false\)/, '★ 고르고 나서 안 닫힙니다');
  assert.match(CODE, /var hanaMenuS = useState\(false\)/, '★ 처음부터 열려 있습니다');
});

test('★ 상단에 늘 보이는 하나문자 손잡이는 «하나»뿐이다', () => {
  /* ⚠ 「글자 몇 개인가」로 세면 안 된다 — 차림표 안의 항목 이름까지 세어져
       뜻과 어긋난다(처음에 그렇게 헛걸렸다). 늘 보이는 단추가 하나인지만 본다. */
  const n = (CODE.match(/📱 하나문자 ▾/g) || []).length;
  assert.equal(n, 1, '★ 늘 보이는 하나문자 단추가 ' + n + '개입니다');
});

test('★ 차림표는 «열었을 때만» 그린다 — 늘 펼쳐 있으면 줄인 뜻이 없다', () => {
  assert.match(CODE, /hanaMenu && h\('div'/,
    '★ 차림표가 늘 펼쳐져 있습니다 — 줄을 줄인 뜻이 없어집니다');
});
