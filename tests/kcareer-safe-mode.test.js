/* 경력관리 — 안전 모드 (대표 제보 2026-09-05 「경력관리 클릭이 안된다 갑자기 모두 멈춘것 같다」)

   ■ 왜 필요한가
     화면이 굳으면 「환경설정 › 자동 동기화 끄기」조차 누를 수 없다.
     끄러 들어가는 길이 «굳은 화면 안»에 있으니 빠져나올 방법이 없었다.
     주소에 ?safe=1 을 붙이는 문으로 그 고리를 끊는다.

   ■ 무엇을 멈추나 / 무엇은 그대로인가
     멈춤 — 자동 올리기·받기·손실 검사·배치 동기화·pu-erp 동기화(클라우드로 오가는 것만)
     그대로 — 이 기기 자료 보기·고치기·지우기·정리·내려받기, 그리고 신원 확인
     ⚠ 신원 확인까지 끄면 대표 잠금에 걸려 «안전 모드로도» 못 들어간다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const BOOT_MARK = 'if(u){ authGate(false);';

function bootBlock() {
  const at = bare.indexOf(BOOT_MARK);
  assert.ok(at > 0, '부팅 자리를 찾지 못했습니다');
  return bare.slice(at, at + 700);
}

test('★★ ?safe=1 로 들어갈 수 있다', () => {
  assert.match(bare, /var KC_SAFE = \(function\(\)\{[\s\S]*?safe=1/);
});

test('★★ 판정이 «쓰는 곳보다 먼저» 있다 — 늦으면 undefined 다', () => {
  /* 실측: 늦게 두었더니 띠를 켜는 때에 undefined 라 띠가 안 떴다.
     var 는 끌어올려져도 «값»은 그 줄에 가서야 들어간다. */
  const def = bare.indexOf('var KC_SAFE =');
  const use = bare.indexOf("document.getElementById('kcSafeBar')");
  assert.ok(def > 0 && use > 0, '둘 다 있어야 합니다');
  assert.ok(def < use, '★ 정의가 먼저 와야 합니다 (지금 정의 ' + def + ' / 사용 ' + use + ')');
});

test('★★ 클라우드로 오가는 길을 «모두» 막는다 — 한 곳만 막으면 새 나간다', () => {
  assert.match(cutFn(bare, 'function fbAutoOn('), /if\(KC_SAFE\) return false;/);
  assert.match(cutFn(bare, 'function fbScheduleAuto('), /if\(KC_SAFE\) return;/);
  assert.match(cutFn(bare, 'function fbAutoPush('), /if\(KC_SAFE\) return;/);
  const boot = bootBlock();
  assert.match(boot, /if\(!KC_SAFE\)\{/);
  ['puSyncAuto', 'navSyncWatch', 'fbCheckLoss'].forEach((f) =>
    assert.ok(boot.indexOf(f) > boot.indexOf('if(!KC_SAFE){'), f + ' 도 안에 있어야 합니다'));
});

test('★★ 신원 확인은 «끄지 않는다» — 끄면 대표 잠금에 걸려 못 들어간다', () => {
  const boot = bootBlock();
  assert.ok(boot.indexOf('resolveMe') < boot.indexOf('if(!KC_SAFE){'),
    '★ resolveMe 가 안전 모드 밖에 있어야 합니다');
});

test('★★ 안전 모드임을 «늘» 밝힌다 — 모르고 쓰면 「저장이 안 된다」가 된다', () => {
  const at = source.indexOf('id="kcSafeBar"');
  assert.ok(at > 0, '띠가 있어야 합니다');
  const band = source.slice(at, at + 700);
  assert.ok(band.indexOf('안 올라갑니다') > 0, '고친 것이 클라우드에 안 간다고 적어야 합니다');
  assert.ok(band.indexOf('safe=1') > 0, '빠져나오는 법을 적어야 합니다');
});

test('★ 이 기기 자료는 건드리지 않는다', () => {
  /* 「안전 모드로 열었다가 자료가 사라졌다」가 되면 안 된다 —
     KC_SAFE 는 클라우드 함수만 막고 담고·꺼내고·되살리는 데는 손대지 않는다. */
  assert.doesNotMatch(cutFn(bare, 'function set(key,arr)'), /KC_SAFE/);
  assert.doesNotMatch(cutFn(bare, 'function kcApplyRestore('), /KC_SAFE/);
});
