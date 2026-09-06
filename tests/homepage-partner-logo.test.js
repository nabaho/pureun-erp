'use strict';
/* 자문사 로고 — 「할 수 있는 것」과 「화면이 하는 말」이 어긋나지 않는다
 *
 * ★ 왜 이 검사가 생겼나 (2026-09-02)
 *   로고 넣기는 «다 만들어져 있었다» — 크기 검사, 확장자 검사, 파일 이름 새로 짓기,
 *   저장소에 담기까지. 그런데 같은 화면 맨 위에 이런 문장이 남아 있었다:
 *
 *     「새 로고를 «넣는» 것은 아직 안 됩니다 — 그림을 어디에 둘지 정하고 붙이겠습니다」
 *
 *   되는 고르개는 그 문장에서 스무 줄 아래에 있었다. 화면을 연 사람은 위를 읽고
 *   아래를 안 눌러 본다. **기능이 없는 것보다 나쁘다 — 만들어 두고 없다고 말하는 것이다.**
 *   실제로 이 문장 때문에 「그림은 못 바꾼다」고 판단했고, 목업까지 새로 그렸다.
 *
 * ★ 그래서 못 박는 것은 «문장»이 아니라 규칙이다:
 *     화면에 로고 고르개가 있으면, 그 화면은 「안 된다」고 말하지 않는다.
 *   고르개를 떼면 이 검사는 조용해진다(할 말이 없어진다) — 그래서 고르개가
 *   «있는지»도 함께 본다. 안 그러면 고르개를 지워도 통과하는 검사가 된다.
 *
 * 실행: node --test tests/*.test.js
 * (이 환경의 node 는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob 으로.)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

/* 소스를 글자로 볼 때는 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시킨다.
   (저장소 규칙: tests-must-strip-comments) */
function 알맹이(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const H = 알맹이(RAW);

/* 자문사 로고 화면을 그리는 곳만 떼어 낸다 */
function 로고화면() {
  const i = H.indexOf('function drawPartnerLogos');
  assert.ok(i >= 0, '★ 자문사 로고 화면을 그리는 곳을 못 찾았다');
  /* 다음 함수가 시작하는 곳까지 — 죽은 이름을 이름표로 쓰지 않는다 */
  const j = H.indexOf('\nasync function ', i + 10);
  const k = H.indexOf('\nfunction ', i + 10);
  const 끝 = Math.min(j < 0 ? H.length : j, k < 0 ? H.length : k);
  return H.slice(i, 끝);
}

test('★ 로고를 고르는 곳이 «있다» (없으면 아래 검사가 아무것도 안 지킨다)', () => {
  const s = 로고화면();
  assert.match(s, /type="file"/, '★ 로고 고르개가 사라졌다');
  assert.match(s, /addPartnerLogo\(this\)/, '★ 고르개가 아무도 안 부른다 — 눌러도 아무 일이 없다');
  assert.match(RAW, /async function addPartnerLogo/, '★ 로고를 담는 함수가 없다');
});

test('★★ 로고를 넣을 수 있는데 «안 된다»고 말하지 않는다', () => {
  const s = 로고화면();
  /* 「아직 안 된다 / 아직 없다 / 나중에 붙이겠다」 결의 말 */
  const 안된다는말 = [
    /아직\s*안\s*[됩되]/,
    /아직\s*없습니다/,
    /나중에\s*붙이/,
    /안\s*됩니다\s*—/
  ];
  안된다는말.forEach((re) => {
    assert.ok(!re.test(s),
      '★★ 로고 넣기가 «되는데» 화면이 안 된다고 말한다: ' + re
      + '\n   만들어 두고 없다고 말하면, 쓰는 사람은 그 단추를 평생 안 누른다.'
      + '\n   기능을 뺐다면 고르개도 같이 빼고, 남겼다면 이 문장을 지울 것.');
  });
});

test('★ 담기와 «올리기»가 갈라져 있다고 말해 준다 — 담아도 아직 안 실린다', () => {
  const s = 로고화면();
  /* 이 화면은 담기만 한다. 실리는 것은 「홈페이지에 올리기」를 눌렀을 때다.
     그 말을 안 해 주면 담고 나서 홈페이지를 보고 「안 올라갔다」고 여긴다. */
  assert.match(s, /올리기/, '★ 올리는 단추가 없다');
  assert.ok(/올려야|눌러야/.test(s),
    '★ 「담은 뒤 올려야 실린다」를 안 알려 준다 — 담고 끝난 줄 안다');
});

/* ── 담는 쪽이 스스로 지켜야 하는 것 ── */
/* ⚠ 2026-09-02 붙여넣기를 붙이면서 «담는 일»을 로고담기() 한 곳으로 모았다 —
   파일 고르기와 붙여넣기가 길이 갈리면 한도·이름 규칙이 두 벌이 된다.
   그래서 여기서 보는 것도 addPartnerLogo 가 아니라 그 공용 함수다. */
function 담기() {
  const i = RAW.indexOf('async function 로고담기');
  const j = RAW.indexOf('\nasync function addPartnerLogo', i);
  assert.ok(i >= 0 && j > i, '★ 로고담기 를 못 찾았다 — 담는 일을 모아 둔 곳이 없다');
  return 알맹이(RAW.slice(i, j));
}

test('★★ 파일 이름을 «우리가» 짓는다 — 남이 준 이름을 주소로 쓰지 않는다', () => {
  const s = 담기();
  /* 한글·빈칸·따옴표가 든 이름이 주소가 되면 깨진다. 서버도 영문·숫자만 받는다.
     ★ 값이 아니라 규칙을 본다: «f.name 을 자리(path)에 그대로 끼우지 않는다». */
  const 자리줄 = /'site\/files\/logo\/'\s*\+\s*([A-Za-z가-힣_$][\w가-힣_$]*)/.exec(s);
  assert.ok(자리줄, '★ 로고를 담는 자리를 못 찾았다');
  assert.notStrictEqual(자리줄[1], 'f', '★ 파일 이름을 그대로 주소에 넣는다');
  assert.ok(!/site\/files\/logo\/'\s*\+\s*f\.name/.test(s),
    '★★ 남이 준 파일 이름을 주소로 쓴다 — 한글 이름이면 서버가 거부하고, 까닭도 안 보인다');
});

test('★★ 700KB 한도를 «고르는 순간» 잡는다 — 올릴 때 실패하면 늦다', () => {
  /* ⚠ 2026-09-02 담는 일이 둘로 나뉘었다(붙여넣기가 생겨서):
       · addPartnerLogo — 파일을 «고르는 순간» f.size 로 잡는다 (가장 이르다)
       · 로고담기       — 담기 직전에 한 번 더 잡는다 (붙여넣기도 지나는 길)
     둘 다 있어야 한다 — 하나만 있으면 다른 길로 들어온 큰 그림이 서버까지 가서 거부된다. */
  /* ⚠ 2026-09-06 「여러장 한번에」로 파일 한 장을 살피는 일이 로고파일담기 로 옮겨졌다.
     지킬 것은 «어느 함수에 있나»가 아니라 «파일을 읽기 전에 크기를 보는가»다 —
     다 읽고 나서 막으면 큰 파일을 통째로 메모리에 올린 뒤 버리게 된다. */
  const 고르기 = (function () {
    const i = RAW.indexOf('async function 로고파일담기');
    const j = RAW.indexOf('\n}', i);
    assert.ok(i >= 0 && j > i, '★ 로고파일담기 를 못 찾았다');
    return 알맹이(RAW.slice(i, j));
  })();
  assert.match(고르기, /f\.size\s*>/, '★ 고른 그림의 크기를 «고르는 순간» 안 본다');
  assert.ok(고르기.indexOf('f.size') < 고르기.indexOf('FileReader'),
    '★★ 파일을 다 읽은 «뒤에» 크기를 본다 — 읽기 전에 막아야 한다');

  const s = 담기();
  /* ⚠ 처음에 «바이트 셈»(length*3/4)만 봐도 통과하게 썼다가 고쳤다 —
       셈은 남겨 두고 «비교»만 없애도 통과해 버렸다. 재는 것이 아니라 «막는 것»을 봐야 한다. */
  assert.match(s, /바이트\s*>\s*[가-힣A-Za-z0-9]/,
    '★ 담기 직전에 크기를 «견주지» 않는다 — 붙여넣기로 들어온 큰 그림이 그냥 지나간다');
  assert.match(s, /throw new Error\([^)]*너무 큽니다|너무 큽니다/,
    '★ 크다는 것을 알고도 «막지» 않는다');

  /* 서버 한도와 어긋나면 «화면은 통과시키고 서버가 거부»한다 — 가장 나쁜 짝이다 */
  const 서버 = fs.readFileSync(path.join(R, 'functions', 'site-publish.js'), 'utf8');
  const m = /MAX_IMAGE_BYTES\s*=\s*(\d+)\s*\*\s*1024/.exec(서버);
  assert.ok(m, '★ 서버의 그림 한도를 못 읽었다');
  [['고르는 순간', 고르기], ['담기 직전', s]].forEach(function (짝) {
    const 화면 = /(\d+)\s*\*\s*1024/.exec(짝[1]);
    assert.ok(화면, '★ ' + 짝[0] + '의 한도를 못 읽었다');
    assert.strictEqual(화면[1], m[1],
      '★★ ' + 짝[0] + ' 한도(' + 화면[1] + 'KB)와 서버 한도(' + m[1] + 'KB)가 다르다'
      + ' — 화면이 통과시킨 그림을 서버가 거부한다');
  });
});

test('★ 관리자만 담을 수 있다 (홈페이지는 관리자 전용 — 대표 지시)', () => {
  assert.match(담기(), /App\.isAdmin/, '★ 누구인지 안 보고 담는다');
});

test('★ 담기만 하고 «쪽은 안 건드린다» — 실리는 것은 올리기를 눌렀을 때다', () => {
  const s = 담기();
  assert.ok(!/site\/partner\/index\.html/.test(s),
    '★ 로고를 담으면서 자문사 쪽까지 덮어쓴다 — 되돌릴 틈이 없다');
});
