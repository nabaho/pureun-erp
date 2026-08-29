'use strict';
/* 사이트에 올려 둔 휴대폰 앱(hana-bridge.apk)이 «지금 소스»와 같은 판인가 — 2026-08-29

   왜 필요한가: 대표 말 「이거 다운받아 옮기는 것 귀찮다」.
   그래서 APK 를 사이트에 올려 두고 폰에서 바로 누르게 했다.
   그런데 올려 둔 파일은 «손으로» 갱신한다 — 소스만 고치고 APK 를 안 바꾸면
   대표는 새것을 받은 줄 알고 «옛 앱»을 깐다. 그리고 그걸 알아챌 길이 없다.
   (그날 실제로 「깔았는데 그대로다」를 확인하려고 APK 를 풀어 봐야 했다.)

   ★ 그래서 이 검사는 «파일 안»을 연다. 판 번호를 적어 둔 글자만 보는 것으로는
     APK 가 옛것이어도 통과한다 — 그게 정확히 막아야 할 일이다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const R = path.join(__dirname, '..');
const APK = path.join(R, 'hana-bridge.apk');
const GRADLE = fs.readFileSync(
  path.join(R, 'android', 'hana-sms-bridge', 'app', 'build.gradle.kts'), 'utf8');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const FLOW = fs.readFileSync(path.join(R, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');

const wantVer = (GRADLE.match(/versionName\s*=\s*"([^"]+)"/) || [])[1];

/* APK 는 zip 이다. 안의 DEX·AndroidManifest 를 풀어 글자를 본다.
   ⚠ 길이를 못 박아 자르지 않는다 — 파일 머리(PK\x03\x04)를 훑는다. */
function apkText() {
  const buf = fs.readFileSync(APK);
  const out = [];
  for (let i = 0; i + 30 < buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const method = buf.readUInt16LE(i + 8);
    const comp = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    if (!/\.dex$|AndroidManifest\.xml$/.test(name)) continue;
    if (!comp || comp === 0xffffffff) continue;
    const raw = buf.slice(i + 30 + nameLen + extraLen, i + 30 + nameLen + extraLen + comp);
    try { out.push(method === 8 ? zlib.inflateRawSync(raw) : raw); } catch (e) { /* 넘어간다 */ }
  }
  assert.ok(out.length, 'APK 안을 열지 못했습니다 — 망가진 파일일 수 있습니다');
  return Buffer.concat(out);
}

test('★ 폰 앱 파일이 사이트에 있다 — 없으면 대표가 또 Actions 를 뒤져야 한다', () => {
  assert.ok(fs.existsSync(APK), '★ hana-bridge.apk 가 없습니다');
  const kb = Math.round(fs.statSync(APK).size / 1024);
  assert.ok(kb > 500, '★ 파일이 ' + kb + 'KB 뿐입니다 — 빈 파일이나 받다 만 것입니다');
});

test('★★ 올려 둔 APK 가 «지금 소스»와 같은 판이다 — 옛 앱을 새것인 줄 알고 깐다', () => {
  assert.ok(wantVer, 'build.gradle.kts 에서 versionName 을 못 찾았습니다');
  const inside = apkText().toString('utf8');
  assert.ok(inside.includes(wantVer),
    '★ 소스는 ' + wantVer + ' 인데 올려 둔 APK 안에는 그 판이 없습니다 — ' +
    '앱을 고치고 APK 를 새로 안 올렸습니다');
});

test('★ 화면에 적은 판과 실제 파일이 같다 — 「판 1.2.0」이라 써 놓고 딴것을 주지 않는다', () => {
  const shown = (ERP.match(/var HANA_APK_VER\s*=\s*'([^']+)'/) || [])[1];
  assert.ok(shown, 'pu-erp.html 에서 HANA_APK_VER 을 못 찾았습니다');
  assert.equal(shown, wantVer,
    '★ 화면은 ' + shown + ', 소스는 ' + wantVer + ' 입니다');
});

test('★ 받기 단추가 그 파일을 가리킨다 — 링크가 어긋나면 404 만 본다', () => {
  assert.match(ERP, /href:'hana-bridge\.apk'/,
    '★ 앱 받기 단추가 사이트의 APK 를 안 가리킵니다');
});

test('★ 새 거르개가 들어 있는 APK 다 — 카드 문자를 또 버리는 판을 올리지 않는다', () => {
  /* 2026-08-29 오전에 폰이 카드 문자를 통째로 버렸다. 그 고침이 든 판만 올린다. */
  const inside = apkText().toString('latin1');
  assert.ok(inside.includes('\\d{3,4}'),
    '★ 「하나9950 승인」 꼴을 알아보는 규칙이 APK 안에 없습니다 — 옛 판입니다');
  assert.ok(inside.includes('SmsHistoryReader'),
    '★ 지난 문자 가져오기가 안 든 판입니다');
});

test('★ 문자를 가로채는 권한이 든 APK 는 올리지 않는다', () => {
  assert.ok(!apkText().toString('latin1').includes('RECEIVE_SMS'),
    '★ 가로채기 권한이 든 앱을 사람들에게 내려주고 있습니다');
});

test('배포가 이 파일을 지우지 않는다 — 지우면 링크가 죽는다', () => {
  /* ⚠ 파일 전체에서 이름을 찾으면 «주석»에 걸려 통과한다 — 실제로 그렇게 통과했다
       (일부러 목록에서 빼 보고서야 알았다). 「남길 것」 목록만 잘라 본다. */
  const m = FLOW.match(/for keep in([\s\S]*?);\s*do/);
  assert.ok(m, '배포 워크플로의 「남길 것」 목록을 못 찾았습니다');
  assert.match(m[1], /hana-bridge\.apk/,
    '★ 「남길 것」 목록에 APK 가 없습니다 — 배포 때 지워져 링크가 죽습니다');
});
