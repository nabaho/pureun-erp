'use strict';
/* 관리자 전용 타일은 «관리자에게는 반드시 보여야» 한다 (대표 보고 2026-08-17)

   "대표노무사에게는 화면이 보여야한다 앱 두개 내외관리 나에는 보여야한다."

   ⚠ 무슨 일이 있었나: 감추는 잣대로 sgIsAdmin() 을 썼는데, 그 값은 «건의함이 뜰 때»
     채워진다. 타일은 그보다 먼저 그려져서, 그리는 순간에는 늘 「관리자 아님」이었다.
     그래서 대표님 화면에서도 경력관리·홈페이지 관리가 통째로 사라졌다.
     ★ 감추는 쪽만 검사하고 «보이는 쪽»을 안 봐서 놓쳤다. 그래서 이 검사를 둔다.

   실행: node --test tests/*.test.js
   (이 환경의 node 는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob 으로.) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');

/* 타일을 그리는 자리에서 관리자인지 가리는 대목만 떼어 본다 */
function 판정대목(열쇠말) {
  const i = enter.indexOf(열쇠말);
  assert.ok(i > -1, 열쇠말 + ' 를 찾지 못했습니다');
  return enter.slice(Math.max(0, i - 600), i + 200);
}

test('★ 타일 판정이 «그릴 때 이미 손에 있는» role 을 본다', () => {
  const 대목 = 판정대목('app.adminOnly');
  assert.match(대목, /role\s*===\s*'admin'/,
    '타일이 role 을 안 보고 있습니다 — 늦게 채워지는 값만 보면 관리자에게도 안 보입니다');
});

test('★ 바로가기 판정도 늦게 채워지는 값만 보지 않는다', () => {
  const i = enter.indexOf('function accessibleApps');
  assert.ok(i > -1, 'accessibleApps 를 찾지 못했습니다');
  const 대목 = enter.slice(i, i + 700);
  assert.match(대목, /_curRole\s*===\s*'admin'/,
    '바로가기가 _curRole 을 안 보고 있습니다');
});

test('두 곳 다 sgIsAdmin() 만으로 판정하지 않는다 — 그것은 보조여야 한다', () => {
  [판정대목('app.adminOnly'), enter.slice(enter.indexOf('function accessibleApps'), enter.indexOf('function accessibleApps') + 700)]
    .forEach(function (대목) {
      /* sgIsAdmin 을 쓰는 것 자체는 괜찮다(보조). 다만 «그것만» 보면 안 된다. */
      if (/sgIsAdmin/.test(대목)) {
        assert.match(대목, /===\s*'admin'\s*\)?\s*\|\|/,
          'sgIsAdmin() 만으로 판정합니다 — 그리는 시점에는 아직 비어 있습니다');
      }
    });
});

test('감추기로 한 두 앱은 여전히 관리자 전용으로 표시돼 있다', () => {
  ['career', 'home'].forEach(function (k) {
    const 줄 = enter.split(/\r?\n/).find(l => l.includes("key:'" + k + "'") && l.includes('url:'));
    assert.match(줄 || '', /adminOnly\s*:\s*true/, k + ' 타일에 관리자 전용 표시가 없습니다');
  });
});
