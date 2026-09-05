/* 「환경설정 → 정리 → 휴지통」 — 없는 자리를 가리키는 안내 (2026-09-05)

   ■ 무엇이 문제였나
   같은 날 환경설정의 여섯 탭을 없애고 한 화면으로 폈다(대표 결정 「다」). 그런데
   화면 곳곳의 안내 글은 그대로 남아, 「환경설정 → 정리 → 휴지통」·「환경설정 →
   계정·AI → 반출 기록」처럼 **이제 없는 탭**을 가리키고 있었다.
   길을 알려 주는 글이 없는 곳을 가리키면 안 알려 주느니만 못하다 — 사람은 그 탭을
   찾다가 「고장 났나」로 배운다.

   ★ 못 박는 것 — 없앤 탭 이름이 «사람이 읽는 글»에 남아 있으면 안 된다.
   ⚠ 주석은 본다. 「그때 그런 탭이 있었다」는 기록은 주석에 남겨도 되지만, 길을
     알려 주는 문장(→ · ›)은 주석이든 화면이든 지금 없는 곳을 가리키면 안 된다.

     node --test tests/cards-settings-path-alive.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FILES = ['pu-cards.html', 'enter.html'];

/* 2026-09-05 에 없앤 탭 이름들 — 「환경설정 → X」 꼴로 쓰이던 것 */
const 없앤탭 = ['정리', '데이터', '계정·AI', '탭·자료', '이알피'];

test('★★ 안내가 «없는 탭»을 가리키지 않는다 — 찾다가 고장인 줄 안다', () => {
  const 남은것 = [];
  FILES.forEach(f => {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    없앤탭.forEach(t => {
      /* 「환경설정 → 정리」·「환경설정 › 정리」 두 화살표를 다 본다 */
      const re = new RegExp('환경설정\\s*[→›]\\s*' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const hit = s.match(re);
      if (hit) 남은것.push(f + ' : ' + hit.join(' / '));
    });
  });
  assert.deepEqual(남은것, [],
    '★ 없앤 탭으로 가라는 안내가 남았다 (2026-09-05 에 탭을 없앴다):\n  ' + 남은것.join('\n  '));
});

test('★★ 「휴지통으로 옮겼습니다」라고 말하는 곳은 «모두» 되살릴 길을 함께 말한다', () => {
  /* ⚠ 한 곳만 보면 헛돈다 — 나머지 자리에서 길이 사라져도 초록이 된다.
       옮겼다고 말하는 «자리마다» 그 줄 안에 길이 있어야 한다. */
  const cards = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');
  const 말한곳 = [];
  let i = -1;
  while ((i = cards.indexOf('휴지통으로 옮겼습니다', i + 1)) > 0) {
    const 끝 = cards.indexOf('\n', i);
    const 줄 = cards.slice(cards.lastIndexOf('\n', i) + 1, 끝 < 0 ? cards.length : 끝 + 120);
    말한곳.push(줄.indexOf('환경설정 → 🗑 휴지통') > 0);
  }
  assert.ok(말한곳.length >= 3, '★ 훑을 자리를 못 찾았다 — 검사가 헛돌고 있다 (' + 말한곳.length + '곳)');
  assert.deepEqual(말한곳.filter(v => !v), [],
    '★ 휴지통으로 옮겼다고만 하고 어디서 되살리는지 안 알려 주는 자리가 있다 ('
    + 말한곳.filter(v => !v).length + '곳)');
});

test('★★ 반출 알림이 전체 기록을 어디서 보는지 말해 준다', () => {
  const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
  assert.ok(enter.indexOf('환경설정 → 🧾 반출 기록') > 0,
    '★ 반출 알림이 전체 기록을 어디서 보는지 안 알려 준다');
});

test('★ 가리키는 곳이 «정말 있다» — 글만 고치고 단추를 안 만들면 같은 일이 되풀이된다', () => {
  const cards = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');
  /* 환경설정 한 화면이 실제로 여는 하위 화면 목록 */
  const sub = cards.slice(cards.indexOf('function settingsSub(){'),
                          cards.indexOf('function renderSettingsPage(){'));
  assert.match(sub, /trash:openTrash/, '★ 환경설정에서 휴지통을 열 길이 없다');
  /* 반출 기록은 관리자 칸에 있다 */
  const sec = cards.slice(cards.indexOf("{ t:'관리자 · 한 번만 하는 일'"),
                          cards.indexOf('] : [] }', cards.indexOf("{ t:'관리자 · 한 번만 하는 일'")));
  assert.match(sec, /openExportLog\(\)/, '★ 환경설정에서 반출 기록을 열 길이 없다');
});
