/* 정부사업일정 — 로그인 때마다 백업 파일이 기기로 내려받아지던 것
   (대표 지시 2026-08-17: "로그인 하면 항상 자동 다운받게 되어 있다 —
    이 부분 다운 더 이상 안 받게 해라")

   무슨 일이었나: 화면을 열고 9초 뒤 `autoDownloadDaily()` 가 돌고, 기본값이
   «켜짐»이라 백업 JSON 이 실제로 내려받아졌다. 폰에서는 그때마다 내려받기
   알림이 뜨고 「다운로드」 폴더가 쌓인다 — 특히 마지막 받은 날 표시
   (`p_lastAutoDl`)가 없는 기기·탭에서는 **열 때마다** 받았다.

   처음에는 기본값만 «꺼짐»으로 돌렸다가, 대표 지시대로 **내려받기 자체를
   걷어냈다**(2026-08-21, 542ea00). 끌 것이 없으니 켜고 끄는 스위치도 함께
   없어졌다.
   ⚠ 그래서 이 검사는 「기본이 꺼짐인가」가 아니라 「아예 없는가」를 본다.
   예전 검사는 없어진 스위치(autoDlChk)를 계속 찾아 main 을 빨간불로 세워
   두었고, 그 하나가 모든 앱 배포를 막았다(2026-08-21에 찾음). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gov = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

test('★ 파일을 저절로 내려받는 길이 아예 없다', () => {
  // 되살리면 폰 「다운로드」 폴더가 다시 쌓인다
  assert.doesNotMatch(gov, /autoDownloadDaily/, '★ 자동 내려받기가 되살아났습니다');
  assert.doesNotMatch(gov, /p_autoDl/, '★ 자동 내려받기 설정이 되살아났습니다');
});

test('사람이 눌러서 내려받는 길은 그대로다 — 백업을 못 뽑으면 안 된다', () => {
  /* 저절로 받는 것만 껐다. 단추를 눌러 뽑는 것은 살아 있어야 한다 —
     이것까지 없으면 자료를 밖으로 꺼낼 방법이 사라진다. */
  assert.match(gov, /a\.download\s*=/, '내려받기를 만드는 곳이 아예 없습니다');
});

test('안전망은 그대로 — 파일 내려받기만 껐다', () => {
  /* 날마다 이 기기에 뜨는 스냅샷은 계속 돈다(내려받기가 아니라 localStorage 다).
     이것까지 끄면 「자동 백업이 사라졌다」가 된다. */
  assert.match(gov, /setTimeout\(autoSnapshotDaily,8000\)/);
  assert.match(gov, /function autoSnapshotDaily\(\)\{/);
});
