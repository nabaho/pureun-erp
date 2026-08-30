'use strict';
/* 연결되자마자 문자 읽기를 «바로» 묻는다 — 2026-08-30 대표: 「휴대폰 문자 연결할 수 있게 해라」

   연결은 08-29 21:20 에 됐는데 문자는 0건이었다. 까닭:
   15분 훑기는 문자 읽기 권한이 있어야만 도는데, 그 권한은 「지난 문자 가져오기」를
   눌러야만 물어봤다. 그 한 번을 안 누르면 훑기가 조용히 아무것도 안 한다 —
   연결만 해 놓고 며칠을 기다린 것이 그래서다.

   ★ 이 검사가 지키는 것: «연결이 끝난 그 자리»에서 묻는다.
     방금 스스로 연결한 참이라 무엇에 쓰는 권한인지도 가장 분명하다.
   ⚠ 그렇다고 «앱을 열자마자» 묻지는 않는다 — 까닭을 모른 채 거절하면 되돌리기가 번거롭다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MAIN_RAW = fs.readFileSync(path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge', 'MainActivity.java'), 'utf8').split('\r\n').join('\n');
/* ⚠ 주석을 걷고 본다 — 안 걷으면 설명글을 코드로 착각해 헛통과한다 */
const MAIN = MAIN_RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* pair() 의 몸통만 — 괄호를 세어 함수 끝까지 본다(고정 폭 자르기 금지) */
function pairBody() {
  const at = MAIN.indexOf('private void pair()');
  assert.ok(at > 0, 'pair 를 못 찾았습니다');
  let d = 0, j = MAIN.indexOf('{', at);
  for (;; j++) { if (MAIN[j] === '{') d++; else if (MAIN[j] === '}') { d--; if (!d) { j++; break; } } }
  return MAIN.slice(at, j);
}

test('★★ 연결이 끝나면 그 자리에서 문자 읽기를 묻는다', () => {
  const body = pairBody();
  assert.match(body, /askThenImport\(\)/,
    '★ 연결만 하고 권한을 안 묻습니다 — 훑기가 돌지 않아 문자가 0건이 됩니다');
});

test('★ 연결에 «성공했을 때만» 묻는다 — 실패한 폰에 권한 창을 띄우지 않는다', () => {
  const body = pairBody();
  const ok = body.indexOf('SecureStore.saveConnection');
  const ask = body.indexOf('askThenImport()');
  const fail = body.indexOf('catch');
  assert.ok(ok > 0 && ask > ok, '★ 연결 저장보다 먼저 묻고 있습니다');
  assert.ok(fail < 0 || ask < fail, '★ 실패 갈래에서 묻고 있습니다');
});

test('★ 앱을 열자마자는 여전히 안 묻는다 — 까닭 모르고 거절하면 되돌리기가 번거롭다', () => {
  const a = MAIN.indexOf('protected void onCreate');
  const b = MAIN.indexOf('protected void onResume');
  assert.ok(a > 0 && b > a, 'onCreate 를 못 찾았습니다');
  assert.ok(!/requestPermissions\(|askThenImport\(\)/.test(MAIN.slice(a, b)),
    '★ 앱을 열자마자 권한 창이 뜹니다');
});

test('★ 거절해도 앱은 그대로 돈다 — 알림 길은 이 권한과 상관없다', () => {
  assert.match(MAIN, /새로 오는 문자는 그대로 보냅니다/,
    '거절했을 때 「그래도 새 문자는 온다」를 안 알려 줍니다');
  /* 거절해도 「문자 읽기 켜기」 단추가 남아 언제든 다시 켤 수 있어야 한다.
     ⚠ 2026-08-30 에 showSweepWarning 을 없애고 refresh 가 그 일을 이어받았다
       (대표: 「불필요한 설명 모두 없애라」). 함수 이름이 아니라 «다시 켤 길이
       남는가»를 본다. */
  assert.match(MAIN, /문자 읽기 켜기/, '★ 거절한 뒤 다시 켤 단추가 없습니다');
  assert.match(MAIN, /show\(grantSms,\s*true\)/, '★ 그 단추를 보여 주는 자리가 없습니다');
});

test('★ 판 번호를 올렸다 — 폰에서 새것인지 가릴 수 있어야 한다', () => {
  const g = fs.readFileSync(path.join(R, 'android', 'hana-sms-bridge', 'app', 'build.gradle.kts'), 'utf8');
  assert.ok(Number((g.match(/versionCode\s*=\s*(\d+)/) || [])[1]) >= 7,
    '★ 앱을 고쳤으면 판 번호를 올려야 합니다');
});
