/* 정부사업일정 — 로그인 때마다 백업 파일이 기기로 내려받아지던 것
   (대표 지시 2026-08-17: "로그인 하면 항상 자동 다운받게 되어 있다 —
    이 부분 다운 더 이상 안 받게 해라")

   무슨 일이었나: 화면을 열고 9초 뒤 `autoDownloadDaily()` 가 돌고, 기본값이
   «켜짐»이라 백업 JSON 이 실제로 내려받아졌다. 폰에서는 그때마다 내려받기
   알림이 뜨고 「다운로드」 폴더가 쌓인다 — 특히 마지막 받은 날 표시
   (`p_lastAutoDl`)가 없는 기기·탭에서는 **열 때마다** 받았다.

   실제 브라우저로 확인한 값(가짜 카메라 아닌 진짜 내려받기 감시):
     정한 적 없는 기기 → 안 받음 · 일부러 켜 둔 분 → 그대로 받음 · 끈 분 → 안 받음 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gov = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

test('파일 자동 다운로드는 기본이 꺼짐이다', () => {
  /* ★ `!== '0'`(기본 켜짐)으로 되돌리면 다시 매번 받게 된다 */
  assert.match(gov, /function autoDlOn\(\)\{ return localStorage\.getItem\('p_autoDl'\)==='1'; \}/,
    "★ '==='1'' 이어야 «정한 적 없는» 기기가 꺼집니다");
  assert.doesNotMatch(gov, /localStorage\.getItem\('p_autoDl'\)!=='0'/,
    '★ 기본 켜짐으로 되돌아갔습니다');
});

test('일부러 켜 둔 사람의 선택은 그대로 둔다', () => {
  // 켜고 끄는 스위치 자체는 남아 있어야 한다 — 없애면 되살릴 길이 없다
  assert.match(gov, /id="autoDlChk"/);
  assert.match(gov, /lsSet\('p_autoDl',dl\.checked\?'1':'0'\)/);
});

test('안전망은 그대로 — 파일 내려받기만 껐다', () => {
  /* 날마다 이 기기에 뜨는 스냅샷은 계속 돈다(내려받기가 아니라 localStorage 다).
     이것까지 끄면 「자동 백업이 사라졌다」가 된다. */
  assert.match(gov, /setTimeout\(autoSnapshotDaily,8000\)/);
  assert.match(gov, /function autoSnapshotDaily\(\)\{/);
});
