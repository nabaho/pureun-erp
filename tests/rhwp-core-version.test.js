'use strict';
/* rhwp 엔진 판 번호 — 한 곳에서 올리고, 브라우저에 적힌 옛 판에 발목잡히지 않는다

   왜 올렸나(2026-08-16 실측): 0.7.19 는 가운뎃점(·)을 그리지 않고 흘렸다.
   같은 신구대조표를 두 판으로 렌더해 견주니 차이가 «· 단 하나»였다 —
   0.7.19 는 3쪽 합쳐 0개, 0.8.4 는 12개(981자 → 993자). 잃은 글자는 없었고
   쪽수·용지(A4 가로)·표선·렌더 속도는 같았다.
   법률 문안에서 「질병·사고·노령」이 「질병사고노령」으로 보이면 제출 전 확인이
   어긋난다. 내려받는 .hwpx 자체는 원래 정상이었고, 흘린 것은 미리보기 렌더였다.

   왜 «더 새것을 고르는» 규칙이 필요한가: 예전 코드는 저장값이 있으면 무조건 그것을
   썼다. pu-erp 의 자동 갱신은 같은 minor 안에서만 올리므로(0.7.x→0.7.y),
   0.7.19 가 적힌 브라우저는 기본값만 올려도 영영 0.7.19 를 쓴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const Hwp = require(path.join(root, 'js', 'pu-hwp-engine.js'));
const rules = fs.readFileSync(path.join(root, 'rules.html'), 'utf8');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

test('★ 판 번호는 한 곳에만 적는다', () => {
  assert.equal(Hwp.CORE_VERSION, '0.8.4');
});

test('★ 브라우저에 적힌 것이 없으면 기본 판을 쓴다', () => {
  assert.equal(Hwp.pickVer(null), '0.8.4');
  assert.equal(Hwp.pickVer(undefined), '0.8.4');
  assert.equal(Hwp.pickVer(''), '0.8.4');
});

test('★ 브라우저에 옛 판이 적혀 있어도 기본 판으로 올라간다 — 이게 핵심이다', () => {
  assert.equal(Hwp.pickVer('0.7.19'), '0.8.4',
    '저장값을 그대로 쓰면 한 번 0.7.19 가 적힌 브라우저는 영영 · 를 못 봅니다');
  assert.equal(Hwp.pickVer('0.6.0'), '0.8.4');
});

test('★ 브라우저 쪽이 더 새것이면 그것을 지킨다 — 자동 갱신을 되돌리지 않는다', () => {
  assert.equal(Hwp.pickVer('0.8.7'), '0.8.7');
  assert.equal(Hwp.pickVer('1.0.0'), '1.0.0');
});

test('같은 판이면 그대로', () => {
  assert.equal(Hwp.pickVer('0.8.4'), '0.8.4');
});

test('★ 자리별 숫자로 견준다 — 글자로 견주면 0.10.0 이 0.9.9 보다 낮아진다', () => {
  assert.equal(Hwp.pickVer('0.10.0', '0.9.9'), '0.10.0');
  assert.equal(Hwp.verNewer('0.10.0', '0.9.9'), true);
  assert.equal(Hwp.verNewer('0.9.9', '0.10.0'), false);
});

test('이상한 값이 적혀 있으면 기본 판으로 물러난다', () => {
  ['최신', 'v0.8.4', '0.8.4-beta', '  ', 'null'].forEach(bad => {
    assert.equal(Hwp.pickVer(bad), '0.8.4', '이상한 값: ' + JSON.stringify(bad));
  });
});

test('앞뒤 공백은 털어낸다', () => {
  assert.equal(Hwp.pickVer(' 0.9.1 '), '0.9.1');
});

/* ── 두 앱이 실제로 그 규칙을 쓰는가 ── */
test('★ 규정관리가 판 고르기 규칙을 쓴다', () => {
  assert.match(rules, /PureunHwp\.pickVer\(/, '저장값을 그대로 쓰면 옛 판에 발목잡힙니다');
});

test('★ 푸른이알피도 같은 규칙을 쓴다', () => {
  assert.match(erp, /PureunHwp\.pickVer\(/);
  assert.match(erp, /PureunHwp\.CORE_VERSION/, '판 번호를 두 곳에 적으면 반드시 어긋납니다');
});

test('★ 두 앱에 옛 판 번호가 남아 있지 않다', () => {
  assert.ok(!rules.includes('0.7.19'), 'rules.html 에 0.7.19 가 남았습니다');
  assert.ok(!erp.includes("'0.7.19'"), 'pu-erp.html 에 0.7.19 가 남았습니다');
});
