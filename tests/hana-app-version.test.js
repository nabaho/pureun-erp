'use strict';
/* 「깔았는데 그대로다」를 폰에서 가릴 수 있어야 한다 — 2026-08-29

   그날 새 APK 를 깐 뒤 「정말 새것이 들어갔나」를 확인할 길이 없어
   빌드된 APK 의 DEX 를 풀어 규칙 글자를 찾아봐야 했다. 사람이 할 일이 아니다.
   판 번호를 올리고 화면에 적어 두면 폰만 보고 안다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const A = path.join(R, 'android', 'hana-sms-bridge');
const read = (p) => fs.readFileSync(p, 'utf8').split('\r\n').join('\n');
const GRADLE = read(path.join(A, 'app', 'build.gradle.kts'));
const MAIN = read(path.join(A, 'app', 'src', 'main', 'java', 'kr', 'pureun', 'hanabridge', 'MainActivity.java'));

test('★ 판 번호가 첫 판(1)에 머물러 있지 않다 — 올려야 폰에서 새것인지 안다', () => {
  const code = GRADLE.match(/versionCode\s*=\s*(\d+)/);
  const name = GRADLE.match(/versionName\s*=\s*"([^"]+)"/);
  assert.ok(code && name, '판 번호를 못 찾았습니다');
  assert.ok(Number(code[1]) >= 2,
    '★ versionCode 가 ' + code[1] + ' 입니다 — 앱을 고쳤으면 올려야 합니다');
  assert.notEqual(name[1], '1.0.0', '★ versionName 이 첫 판 그대로입니다');
});

test('★ 판 번호를 «화면»에 보여 준다 — 안 보이면 깔았는지 알 길이 없다', () => {
  assert.match(MAIN, /BuildConfig\.VERSION_NAME/,
    '★ 판 번호가 화면에 없습니다 — APK 를 풀어 봐야 알게 됩니다');
});

test('BuildConfig 를 켜 두었다 — 안 켜면 그 자리에서 컴파일이 깨진다', () => {
  /* AGP 8 부터 기본이 꺼짐이다. 화면에서 쓰면서 안 켜면 빌드가 실패한다. */
  assert.match(GRADLE, /buildConfig\s*=\s*true/,
    '★ BuildConfig.VERSION_NAME 을 쓰는데 buildConfig 가 꺼져 있습니다');
});
