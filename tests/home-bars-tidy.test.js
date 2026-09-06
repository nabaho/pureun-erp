'use strict';
/* 단추 정리 — node --test tests/home-bars-tidy.test.js
 *
 * 대표 결정 2026-09-06 ㉯ (목업 docs/mockups/home-bars-one.html).
 *
 * ★ 무엇이 문제였나 — 세어 봤다
 *   한 사람을 고른 화면에 단추가 «15개, 네 자리»에 있었다. 그리고 「홈페이지」가 붙은
 *   단추가 «일곱»인데, 다섯은 «지금» 홈페이지(라이믹스, 우리가 못 고침)를,
 *   둘은 «새» 홈페이지(우리 거울, 자동으로 올라감)를 가리켰다.
 *   헷갈린 까닭은 단추가 많아서가 아니라 «어느 것이 무엇에 대한 것인지»가 안 적혀 있어서다.
 *
 * ★ 이 검사가 지키는 것
 *   ① 띠마다 «무엇에 대한 것인지» 이름표가 있다 (위=화면 전체, 아래=이 사람 하나)
 *   ② 「지금 / 새」로 갈라 적는다
 *   ③ 파란 단추는 띠마다 «하나»다 — 저장이 회색이면 안 된다
 *   ④ 자주 안 쓰는 것은 «⋯» 안으로 접되, 길이 사라지지는 않는다
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');
/* 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시키면 아무것도 안 지킨다 */
const H = RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function 함수(이름) {
  const i = H.search(new RegExp('(?:async )?function ' + 이름 + '\\('));
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았다');
  const j = H.indexOf('\nfunction ', i + 5), k = H.indexOf('\nasync function ', i + 5);
  return H.slice(i, Math.min(j < 0 ? H.length : j, k < 0 ? H.length : k));
}

/* ══════ ① 이름표 ══════ */
test('★★ 띠마다 «무엇에 대한 것인지» 이름표가 있다', () => {
  assert.match(함수('appbarHtml'), /class="tag">이 화면 전체</,
    '★★ 위 띠가 무엇에 대한 것인지 안 적혀 있습니다');
  assert.match(함수('memberEdit'), /class="tag">' \+ esc\(d\.name/,
    '★★ 아래 띠가 «이 사람 하나»에 대한 것임을 안 적습니다');
  const css = /(?:^|\n)\.tag\{([^}]*)\}/.exec(RAW);
  assert.ok(css, '★ 이름표 꾸밈이 없습니다');
});

/* ══════ ② 「지금 / 새」를 갈라 적는다 ══════ */
test('★★ 「홈페이지」를 «지금»과 «새»로 갈라 적는다', () => {
  /* 다섯은 지금(못 고침), 둘은 새(자동으로 올라감)를 가리킨다.
     낱말이 같으면 어디로 가는지 알 수 없다. */
  const 띠 = 함수('appbarHtml'), 편집 = 함수('memberEdit');
  assert.match(띠, /지금 홈페이지와 대조/, '★★ 대조가 어느 홈페이지 것인지 안 적습니다');
  assert.match(띠, /지금 홈페이지 보기/, '★★ 열기가 어느 홈페이지 것인지 안 적습니다');
  assert.match(띠, /새 홈페이지에 올리기/, '★★ 올리기가 어느 홈페이지 것인지 안 적습니다');
  assert.match(편집, /지금 홈페이지용 복사/, '★★ 복사가 어느 홈페이지 것인지 안 적습니다');
  assert.match(편집, /새 홈페이지에'/, '★★ 넣기·빼기가 어느 홈페이지 것인지 안 적습니다');
  assert.match(편집, />넣기<[\s\S]{0,200}>빼기</, '★ 넣기·빼기 단추가 없습니다');

  /* ★ 갈라 적지 «않은» 옛 이름이 남아 있으면 안 된다 — 한 화면에 두 말투가 섞인다 */
  ['>홈페이지 다시 확인<', '>홈페이지 열기<', '>홈페이지에 올리기<',
   '>홈페이지에 채우기용 복사<'].forEach(옛 => {
    assert.ok((띠 + 편집).indexOf(옛) < 0, '★ 옛 이름이 남아 있습니다: ' + 옛);
  });
});

test('★ 도메인을 옮기면 «한 자리»에서 끝나게 지었다', () => {
  /* 「새」가 「지금」이 되는 날, «지금» 붙은 것들을 통째로 지우고 「새」를 떼면 끝난다.
     그 계획이 코드에 적혀 있어야 다음 사람이 이름을 아무렇게나 안 바꾼다. */
  assert.match(RAW, /도메인을 옮기면[\s\S]{0,200}한 자리에서 끝난다/,
    '★ 이름을 왜 이렇게 지었는지가 안 적혀 있습니다');
});

/* ══════ ③ 파란 단추는 띠마다 하나 ══════ */
test('★★ 파란 단추는 띠마다 «하나»다 — 저장이 회색이면 안 된다', () => {
  /* 전에는 「다시 확인」과 「채우기용 복사」가 파랗고 정작 저장이 회색이었다 —
     고친 것을 저장 안 하고 복사부터 누르게 되어 있었다. */
  const 띠 = 함수('appbarHtml');
  assert.equal((띠.match(/class="btn pri"/g) || []).length, 1,
    '★★ 위 띠에 파란 단추가 하나가 아닙니다');
  assert.match(띠, /class="btn pri" onclick="publishPeople\(\)"/,
    '★ 위 띠의 으뜸은 «올리기»여야 합니다');

  const 발 = 함수('memberEdit');
  const 발띠 = 발.slice(발.indexOf('class="eft"'));
  assert.equal((발띠.match(/class="btn pri"/g) || []).length, 1,
    '★★ 아래 띠에 파란 단추가 하나가 아닙니다');
  assert.match(발띠, /class="btn pri" onclick="saveDraft\(\)"/,
    '★★ 아래 띠의 으뜸이 «저장»이 아닙니다 — 저장 안 하고 복사부터 누르게 됩니다');
});

/* ══════ ④ ⋯ 로 접되 길은 남는다 ══════ */
test('★★ 자주 안 쓰는 것은 «⋯» 안으로 접되, 길이 사라지지 않는다', () => {
  const s = 함수('memberEdit');
  assert.match(s, /<details class="more">/, '★★ 접는 칸이 없습니다');
  /* 한 해에 몇 번 쓰는 셋이 그 안에 있다 */
  const 안 = s.slice(s.indexOf('const 더보기'), s.indexOf('class="eft"'));
  ['openHistory()', 'keepOnSiteAsk()', 'copyPrivate('].forEach(f =>
    assert.ok(안.indexOf(f) > 0, '★★ 「' + f + '」로 갈 길이 사라졌습니다'));
  /* 접었다고 «없앤» 것이 아니다 — 늘 보이는 자리에는 안 둔다 */
  const 늘보임 = s.slice(s.indexOf('class="eft"'));
  assert.ok(늘보임.indexOf('openHistory()') < 0,
    '★ 되돌리기가 늘 보이는 자리에 남아 있습니다 — 접은 뜻이 없습니다');

  const css = /(?:^|\n)\.morebox\{([^}]*)\}/.exec(RAW);
  assert.ok(css, '★ 펴지는 칸의 꾸밈이 없습니다');
  /* ⚠ 아래 띠에 있으므로 «위로» 펴야 한다 — 아래로 펴면 화면 밖으로 나간다 */
  assert.match(css[1], /bottom: *calc/,
    '★★ 아래로 펴집니다 — 화면 밖으로 나가 안 보입니다');
  assert.match(css[1], /z-index/, '★ 층이 없어 다른 것에 가립니다');
});

/* ══════ 늘 보이는 단추 수 ══════ */
test('★★ 아래 띠에 늘 보이는 단추가 넷을 넘지 않는다', () => {
  /* 목업에서 15 → 8 로 줄이기로 했다. 아래 띠는 저장·복사·이 사람 글·⋯ 넷이다.
     ⚠ 「몇 개」가 규칙이 아니라 «늘어나지 않는가»가 규칙이다 — 넉넉히 잡되 문을 닫는다. */
  const s = 함수('memberEdit');
  const 띠 = s.slice(s.indexOf('class="eft"'));
  const 단추 = (띠.match(/<button|<a class="btn/g) || []).length;
  /* ⋯ 안의 것은 늘 보이는 것이 아니다 — 그것들은 더보기 배열에 있어 여기 안 센다 */
  assert.ok(단추 <= 5, '★★ 아래 띠에 늘 보이는 단추가 ' + 단추 + '개입니다 — 다시 늘었습니다');
});
