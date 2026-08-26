/* 기업정보함 — 구독이 끊겼을 때 원인을 «맞게» 말한다.
   실행: node --test tests/*.test.js

   대표 콘솔 2026-08-16: 맨 아래에 「[App Check] …FB_APPCHECK_ON 을 true 로…」가
   찍혀 있었다. 그런데 App Check 는 콘솔에서 «모니터링»(강제 아님)임을 대표가 이미
   확인했다(2026-08-14 기록). 같은 PERMISSION_DENIED 가 나는 훨씬 흔한 길은 로그인
   토큰 만료·다른 탭 로그아웃이다 — 규칙(auth != null)이 모든 구독을 끊는다.
   엉뚱한 원인을 대면 사람이 App Check 를 뒤지느라 시간을 버린다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function load(){
  const i = src.indexOf('function deniedCauseOf(');
  assert.ok(i >= 0, 'deniedCauseOf 를 못찾음');
  const j = src.indexOf('function itemsDeniedTell(', i);
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

test('로그인이 비어 있으면 「로그인 문제」라고 한다 — 가장 흔한 원인이 먼저다', () => {
  const C = load();
  assert.equal(C.deniedCauseOf(null, false), 'auth');
  assert.equal(C.deniedCauseOf(null, true), 'auth');
});

test('로그인이 살아 있고 App Check 를 꺼 둔 채면 App Check·규칙을 짚는다', () => {
  const C = load();
  assert.equal(C.deniedCauseOf({ uid: 'u1' }, false), 'appcheck');
});

test('로그인도 App Check 도 멀쩡하면 규칙을 짚는다', () => {
  const C = load();
  assert.equal(C.deniedCauseOf({ uid: 'u1' }, true), 'rules');
});

test('구독 오류 자리가 새 안내를 쓴다 — 옛 한 줄짜리 단정이 사라졌다', () => {
  assert.ok(src.includes('itemsDeniedTell(e)'), '명함 구독이 새 안내를 안 쓴다');
  /* 옛 코드: 로그인 여부를 보지 않고 무조건 App Check 를 지목했다 */
  assert.ok(!src.includes("if(!FB_APPCHECK_ON && isDenied(e)) console.error('[App Check]"),
    '옛 단정이 남아 있다');
});

test('로그인이 풀린 경우에는 화면(toast)으로도 알린다 — 콘솔은 아무도 안 본다', () => {
  const i = src.indexOf('function itemsDeniedTell(');
  const fn = src.slice(i, i + 900);
  assert.match(fn, /toast\(/, '콘솔에만 적으면 대표가 모른다');
  assert.match(fn, /다시 로그인/, '무엇을 하면 되는지 말해야 한다');
});
