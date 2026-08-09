'use strict';
// App Check 스위치가 안전하게 걸려 있는지 — node --test tests/erp-appcheck.test.js
//
// 왜 껐나: 사무실에서 켤 때마다 reCAPTCHA 가 시간 초과로 두 번씩 실패했는데
// (Uncaught (in promise) Error: reCAPTCHA Timeout), 같은 로그에서 Firebase 읽기는
// «초기 동기화 완료» 로 멀쩡히 끝났다. 즉 콘솔에서 강제(enforce)가 꺼져 있다 —
// 켜져 있었다면 토큰 없는 읽기가 PERMISSION_DENIED 로 막혔을 것이다.
// 지키는 것 없이 20~30초짜리 실패만 두 번 만들고 있었다.
//
// ⚠ 위험한 것은 «콘솔에서 강제를 켰는데 이 스위치를 안 되돌리는» 경우다.
//    그러면 모든 읽기·쓰기가 막힌다. 그래서 되돌리는 길을 코드에 남겨 둔다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

test('스위치가 하나로 모여 있다', () => {
  assert.match(app, /var FB_APPCHECK_ON = (true|false);/);
});

test('스위치가 꺼져 있으면 reCAPTCHA 를 아예 부르지 않는다', () => {
  assert.match(app, /if\(FB_APPCHECK_ON && FB_APPCHECK_KEY && firebase\.appCheck\)/);
});

test('사이트키는 지우지 않고 남겨 둔다 (되돌릴 때 다시 발급받지 않게)', () => {
  assert.match(app, /var FB_APPCHECK_KEY = '[^']+';/);
});

test('왜 껐는지와 되돌리는 법이 코드에 적혀 있다', () => {
  const i = app.indexOf('var FB_APPCHECK_ON');
  const around = app.slice(Math.max(0, i - 1200), i);
  assert.ok(around.includes('reCAPTCHA Timeout'), '증상이 적혀 있어야 한다');
  assert.ok(around.includes('PERMISSION_DENIED'), '왜 강제가 꺼져 있다고 봤는지 적혀 있어야 한다');
  assert.ok(around.includes('true 로 되돌려'), '되돌리는 법이 적혀 있어야 한다');
});

test('권한 거부가 나면 App Check 를 의심하라고 알려 준다', () => {
  // 내 판단이 틀려 강제가 켜져 있었다면 즉시 알아채고 되돌릴 수 있어야 한다
  assert.match(app, /if\(!FB_APPCHECK_ON\) console\.error\('\[App Check\]/);
  assert.match(app, /FB_APPCHECK_ON 을 true 로 되돌려야 합니다/);
});

test('Rules 의 auth != null 은 그대로다 (App Check 를 껐다고 자료가 열리지 않는다)', () => {
  // 로그인 인증은 App Check 와 별개 — 익명 로그인은 이미 제거돼 있다
  assert.match(app, /익명 로그인 제거/);
});
