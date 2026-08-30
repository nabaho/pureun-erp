/* 색 팔레트 — 푸른이알피 말고 «다른 앱»도 지킨다 (대표 지시 2026-08-30)
 *
 * ★ 왜 필요한가
 *   2026-08-09 에 푸른이알피를 5계열 27색으로 정리했는데, 그것을 지키는 검사
 *   (tests/color-palette.test.js)가 «pu-erp.html 한 파일만» 봤다.
 *   그래서 한 해 동안 나머지 앱에 색이 계속 늘어 — 재 보니 열한 앱에 1,349가지,
 *   그중 1,196가지가 팔레트 밖이었다. 「위험·삭제」 빨강 하나에도 넉 점이 섞여 있었다.
 *   정리만 하고 이 검사를 안 넓히면 «다시 늘어난다».
 *
 * ★ 무엇을 못 박나 — 색값이 아니라 규칙 둘
 *   ① 그 앱이 쓰는 색은 팔레트 안에 있다 (정한 예외만 빼고)
 *   ② 같은 규칙 안 바탕·글자는 사람이 읽을 만큼 갈라진다
 */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const P = require('./lib-palette.js');

const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* 정리를 마친 앱들. ★ 새 앱을 정리했으면 여기에 더한다 —
   더하지 않으면 그 앱은 아무도 안 지킨다. */
const DONE = [
  ['gov-consulting.html', '정부컨설팅'],
  ['kcareer.html', '경력관리'],
  ['work.html', '업무관리'],
  ['pu-cards.html', '기업정보함'],
  ['pu-photos.html', '푸른사진첩'],
  ['rules.html', '취업규칙'],
  ['enter.html', '푸른포털'],
  ['fund.html', '근로복지기금'],
  ['pu-paydata.html', '급여데이터함'],
  ['pu-home.html', '푸른홈'],
  ['payroll-os.html', '급여OS'],
  ['docs-esign.html', '전자서명'],
  ['chwieop.html', '취업규칙작성'],
  ['fund-poc.html', '기금시안'],
  ['sign.html', '서명'],
  ['ieum-view.html', '이음보기'],
  ['install.html', '설치안내'],
];

/* 일부러 남긴 것. ★ 이 목록을 늘리지 말 것 — 예외가 늘면 팔레트가 무너진다. */
const EXCEPT = {
  'gov-consulting.html': new Set([
    /* 「구글 캘린더처럼」은 따로 승인된 결정이다(tests/gov-cal-google-look).
       구글 화면과 같아 보이려고 «구글이 쓰는 바로 그 색»을 박아 둔 것이라
       팔레트로 옮기면 그 결정이 조용히 뒤집힌다. */
    '#dadce0', '#3c4043', '#70757a', '#1a73e8', '#7b8089', '#e8eaed',
    /* 이 앱이 오래 써 온 제 색(테두리·바탕·위험·성공) — 화면 전체의 뼈대다 */
    '#b3cde8', '#e3f0fb', '#e94560', '#2a9d8f',
  ]),
  'pu-cards.html': new Set([
    '#ffaabb',   // 실제로는 색이 아니라 id 이름(#fab) 이다 — 바꾸면 그 화면이 깨진다
  ]),
  'work.html': new Set([]),
  /* 세 앱은 예외가 «하나도 없다» — 팔레트만으로 다 됐다는 뜻이다.
     ⚠ 여기에 색을 채워 넣어 통과시키지 말 것. 예외가 늘면 팔레트가 무너진다. */
  'pu-photos.html': new Set([]),
  'rules.html': new Set([]),
  'enter.html': new Set([]),
  'fund.html': new Set([]),
  'pu-paydata.html': new Set([]),
  'pu-home.html': new Set([]),
  'payroll-os.html': new Set([]),
  'docs-esign.html': new Set([]),
  'chwieop.html': new Set([]),
  'fund-poc.html': new Set([]),
  'sign.html': new Set([]),
  'ieum-view.html': new Set([]),
  'install.html': new Set([]),
  'kcareer.html': new Set([]),
};

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const PALETTE_SET = new Set([].concat(...Object.values(P.PALETTE), '#ffffff', '#000000'));

for (const [f, ko] of DONE) {
  const src = R(f);

  test('★★ ' + ko + ' — 팔레트 밖 색을 쓰지 않는다', () => {
    const out = new Map();
    for (const m of src.matchAll(HEX)) {
      if (![4, 7, 9].includes(m[0].length)) continue;
      const c = P.norm(m[0]);
      if (PALETTE_SET.has(c) || EXCEPT[f].has(c)) continue;
      out.set(c, (out.get(c) || 0) + 1);
    }
    const list = [...out.entries()].sort((a, b) => b[1] - a[1])
      .slice(0, 8).map(([c, n]) => c + '(' + n + ')').join(' ');
    assert.strictEqual(out.size, 0,
      ko + ' 에 팔레트 밖 색이 ' + out.size + '가지 생겼다: ' + list
      + '\n  → 새 색을 만들지 말고 5계열 27색에서 고르세요.'
      + ' 일부러 넣은 것이면 이 파일 EXCEPT 에 «까닭과 함께» 적으세요.');
  });

  test('★★ ' + ko + ' — 바탕 위 글자가 읽힌다', () => {
    /* 한 CSS 규칙 안에 background 와 color 가 함께 있으면 그건 확실한 «짝»이다.
       색을 옮기다 밝기 차례가 뒤집히면 글자가 바탕에 묻힌다 — 그것만 잡는다.
       ⚠ <style> 안만 본다. 파일 전체에서 `{…}` 를 찾으면 «자바스크립트 덩이»가
         규칙으로 잡혀, 서로 상관없는 바탕과 글자가 짝으로 묶인다(실제로 그랬다).
       ⚠ 투명도가 붙은 바탕(#1e293b20)은 건너뛴다 — 실제로 비치는 색은 훨씬 옅어서
         여기 셈으로는 「묻혔다」가 되지만 화면에서는 잘 읽힌다. */
    const css = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    const bad = [];
    for (const m of css.matchAll(/\{([^{}]{0,400})\}/g)) {
      const r = m[1];
      if (/background\s*:\s*#[0-9a-fA-F]{8}\b/.test(r)) continue;   // 투명도 붙은 바탕
      const bg = P.colorOf(r, 'background'), fg = P.colorOf(r, 'color');
      if (!bg || !fg) continue;
      const c = P.contrast(fg, bg);
      if (c < 3.0) bad.push(fg + ' on ' + bg + ' (' + c.toFixed(1) + ':1)');
    }
    assert.strictEqual(bad.length, 0,
      ko + ' 에 글자가 묻히는 자리가 ' + bad.length + '곳: ' + bad.slice(0, 6).join(' · '));
  });
}

test('★ 정리한 앱 목록이 비어 있지 않다 — 이 검사의 밑돌', () => {
  assert.ok(DONE.length >= 4, '지키는 앱이 줄었다 — 목록에서 빠지면 아무도 안 지킨다');
});

test('★ 예외 목록이 늘지 않았다 — 예외가 늘면 팔레트가 무너진다', () => {
  /* 2026-08-30 기준 열하나. 늘리려면 이 숫자와 «까닭»을 함께 고쳐야 한다 —
     검사고정-허용: 예외 개수는 「값」이 아니라 그 자체가 규칙이다. */
  const n = Object.values(EXCEPT).reduce((a, s) => a + s.size, 0);
  assert.strictEqual(n, 11,
    '예외가 ' + n + '개다. 늘렸다면 왜 팔레트로 못 옮기는지 여기에 적고 이 숫자를 고치세요.');
});
