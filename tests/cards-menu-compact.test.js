/* ☰ 메뉴 시트 정리 (대표 지시 2026-08-21 「메뉴함 정리가 필요하다 너무 정신없다」)

   무엇이 정신없었나 — 폰 화면을 재어 보니 둘이었다.
     ① 열여섯 칸이 한 칸에 51px 씩 써서 속 길이가 1187px 이었다(화면은 736px).
     ② 떠다니는 것 셋(즐겨찾기 손잡이·백업·복구 알약·「● 최신」)이 시트 «위» 에
        떠서 칸 다섯을 덮고 있었다 — 「전체 비우기」가 알약에 가려 「…체 비우기」였다.

   ★ 고치는 방향은 «접기» 가 아니라 «낮추기» 다.
     바로 하루 전(2026-08-20) 「환경설정」 안에 메일을 넣어 두었다가
     「메일 송부함은 없다」는 말씀을 들었다 — 안 보이면 없는 것이다.
     그래서 칸은 하나도 안 없애고 여백만 깎았다: 1187 → 887px (-25%).

   ⚠ 이 검사는 「몇 px 인가」를 박지 않는다(CLAUDE.md). 박는 것은 규칙이다 —
     칸이 그대로 다 있는가 · 덮는 것을 비켜 두는가 · 닫을 ✕ 가 늘 있는가. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sliceFn } = require('./fnslice.js');

const cards = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const menu = sliceFn(cards, 'function openMenu(){');

test('★ 칸을 하나도 안 없앴다 — 좁히는 것과 감추는 것은 다르다', () => {
  /* 메일 넷은 특히 그렇다. 어제 「환경설정」 안에 있다는 이유만으로 «없는 것»이 됐다. */
  ['openMailPage()', 'openSentBox()', 'openSchedBox()', 'openMatPage()',
    'openCleanupCenter()', 'importInput.click()', /* 2026-08-29 — 내보내기가 «셋 중 고르는 창»(openExportPick)으로 바뀌었다.
       칸은 그대로 있고 여는 문만 새것이다. 지킬 것은 «칸이 있다»이지 함수 이름이 아니다. */
        'openExportPick()', 'printList()',
    'backupNow()', 'restoreInput.click()', 'openErpNameCheck()', 'openErpClosedTidy()',
    'openViewManager()', 'openSettings()', 'doLogoutCards()', 'wipeAll()',
  ].forEach(function (fn) {
    assert.ok(menu.includes(fn), '★ ☰ 메뉴에서 ' + fn + ' 가 사라졌습니다 — 좁히려고 없애면 안 됩니다.');
  });
  /* 접어서 감추지도 않았다 — <details> 나 hidden 뒤로 넣으면 「없다」와 같아진다 */
  assert.doesNotMatch(menu, /<details|hidden>/,
    '★ 접으면 못 찾습니다 — 메뉴에서 접기는 없애기와 같습니다(2026-08-20 메일 사건).');
});

test('★ 시트가 떠 있는 동안에는 떠다니는 것들이 비켜선다', () => {
  /* 셋 다 시트보다 위에 뜬다(z-index 9998 / 2147483645 / 2147483000).
     덮는 것은 곧 못 누르는 것이다 — 손가락이 알약을 먼저 만난다. */
  const at = cards.indexOf('body:has(.modalbg.open)');
  assert.ok(at > 0, '★ 시트가 열렸을 때 떠다니는 것을 치우는 규칙이 없습니다.');
  const blk = cards.slice(at, cards.indexOf('}', at) + 1);
  ['[data-pu-appbar-btn]', '#pu-backup-admin-button', '#pu-version-fab'].forEach(function (sel) {
    assert.ok(cards.slice(at - 200, at + 400).includes(sel),
      '★ ' + sel + ' 이 시트를 덮은 채로 남습니다.');
  });
  assert.match(blk, /display:\s*none\s*!important/,
    '떠 있는 것들은 안쪽 style= 로 자리를 잡아 두어 !important 없이는 안 비켜섭니다.');
});

test('닫을 ✕ 는 늘 손에 닿는다 — 머리를 붙여 둔다', () => {
  /* 칸이 열여섯이라 아래로 내려가면 머리가 화면 밖으로 사라졌다. */
  const at = cards.indexOf('#menuM>.mhead{');
  assert.ok(at > 0, '#menuM 머리 규칙을 찾지 못했습니다.');
  assert.match(cards.slice(at, cards.indexOf('}', at)), /position:\s*sticky/);
  assert.match(menu, /class="mhead"[\s\S]{0,200}menuBg\.classList\.remove\('open'\)/,
    '머리에 닫기 단추가 있어야 붙여 둘 값어치가 있습니다.');
});

test('★ 설명은 class 로 붙인다 — 안쪽 style= 은 스타일시트를 이긴다', () => {
  /* 이 저장소에서 여러 번 당한 함정이다. 설명을 안쪽 style= 로 적어 두면
     좁히는 규칙(#menuM .msub)이 통째로 무시되고, 좁아진 칸에서 설명만 커진 채 남는다. */
  assert.doesNotMatch(menu, /<span style="margin-left:auto/,
    '★ 안쪽 style= 로 되돌리면 #menuM .msub 규칙이 안 먹습니다.');
  assert.ok(menu.includes('class="msub"'), '설명 칸에 붙일 class 가 없습니다.');
  /* 설명이 길어도 줄을 바꾸지 않는다 — 한 줄이 두 줄이 되면 좁힌 뜻이 없다 */
  const at = cards.indexOf('#menuM .sheetbtn .msub{');
  assert.ok(at > 0, '#menuM .msub 규칙이 없습니다.');
  const rule = cards.slice(at, cards.indexOf('}', at));
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /text-overflow:\s*ellipsis/);
  assert.match(rule, /min-width:\s*0/, 'min-width:0 이 없으면 flex 칸이 안 줄어 …이 안 생깁니다.');
});

test('좁히는 규칙은 ☰ 메뉴 안에서만 듣는다', () => {
  /* 다른 시트(폴더·가져오기 …)는 칸이 몇 개뿐이라 낮출 까닭이 없고,
     낮추면 손가락 자리만 좁아진다. */
  assert.match(cards, /#menuM \.sheetbtn\{/, '#menuM 로 좁히지 않았습니다.');
  const at = cards.indexOf('.sheetbtn{display:flex');
  assert.match(cards.slice(at, cards.indexOf('}', at)), /padding:15px 12px/,
    '검사고정-허용 — 공용 .sheetbtn 은 그대로여야 한다는 것이 이 검사의 뜻이다');
});

test('첫 묶음 위에는 겹줄이 지지 않는다', () => {
  /* :first-of-type 은 «같은 태그» 중 첫째다 — .mhead 도 div 라 영영 안 맞고,
     머리 밑줄과 첫 묶음 윗줄이 겹쳐 두 줄이 된다. 붙은 형제로 집는다. */
  assert.match(cards, /#menuM>\.mhead\+\.mgrp\{/,
    '★ .mgrp:first-of-type 은 .mhead(도 div) 때문에 안 맞습니다.');
  assert.doesNotMatch(cards, /#menuM \.mgrp:first-of-type/);
});
