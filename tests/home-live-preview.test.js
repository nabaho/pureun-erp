'use strict';
/* 실시간 미리보기 (대표 결정 2026-09-02 ㉮ 오른쪽·접었다 펴기)
 *   「수정하고 있는 내용을 실시간으로 볼 수 있을까 — 바로 보이면 수정이 편할 것 같다」
 *   목업 docs/mockups/home-live-preview.html 승인본.
 *
 * ★ 이 검사가 지키는 것 — 「미리보기가 거짓말을 하지 않는다」:
 *   ① 보여 주는 것은 «올릴 바로 그 HTML»이다 (딴 길로 다시 만들지 않는다)
 *   ② 미리보기를 열어도 «아무것도 올라가지 않는다»
 *   ③ 표시(노란색)는 미리보기에만 붙고 «올릴 글자»는 안 건드린다
 *   ④ 기본은 «접힘» — 안 쓸 때 편집칸을 좁히지 않는다
 *   ⑤ 못 그릴 때는 «왜»를 말한다 (빈 칸을 보여 주면 고장으로 읽는다)
 *   ⑥ 그림·스타일이 깨지지 않게 base 를 끼운다
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

/* 소스를 글자로 볼 때는 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시킨다 */
function 알맹이(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const H = 알맹이(RAW);

function 함수(이름) {
  const i = H.search(new RegExp('(?:async )?function ' + 이름 + '\\('));
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았다');
  const j = H.indexOf('\nfunction ', i + 5);
  const k = H.indexOf('\nasync function ', i + 5);
  const 끝 = Math.min(j < 0 ? H.length : j, k < 0 ? H.length : k);
  return H.slice(i, 끝);
}

/* ══════ ① 올릴 것과 같은 글자를 보여 준다 ══════ */
test('★★ 미리보기가 «올릴 때와 같은 부품»으로 글자를 만든다', () => {
  const s = 함수('미리보기HTML');
  /* 올리는 쪽(publishPage)과 «같은» 부품을 지나야 한다.
     딴 길로 다시 만들면 「화면에선 좋았는데 올리니 다르다」가 생긴다. */
  assert.match(s, /PuSitePage\.쪽고치기\(/, '★★ 쪽을 딴 길로 만든다 — 올릴 것과 달라진다');
  assert.match(s, /PuHomeFill\.applyLineEdits/, '★ 줄 갈아 끼우는 부품이 올릴 때와 다르다');
  assert.match(s, /PuSitePeople\.쪽그리기\(/, '★★ 구성원 쪽을 딴 길로 만든다');

  const 올리기 = 함수('publishPage');
  assert.match(올리기, /PuSitePage\.쪽고치기\(/, '★ 올리는 쪽이 그 부품을 안 쓴다');
});

test('★★ 미리보기를 열어도 «아무것도 올라가지 않는다»', () => {
  ['미리보기HTML', 'prevHtml', 'markPreview', 'openPreviewWindow'].forEach(function (f) {
    const s = 함수(f);
    assert.ok(!/PUBLISH_URL|올리기\(/.test(s),
      '★★ ' + f + ' 가 홈페이지에 올린다 — 미리 보려다 올라가면 되돌릴 틈이 없다');
    assert.ok(!/savePartnerLogos|db\.ref/.test(s),
      '★ ' + f + ' 가 자료를 고친다 — 미리보기는 «보는 것»뿐이다');
  });
});

/* ══════ ② 표시는 미리보기에만 ══════ */
test('★★ 노란 표시를 «올릴 글자»에 섞지 않는다 — 다 그린 뒤 DOM 에서 붙인다', () => {
  const s = 함수('미리보기HTML');
  assert.ok(!/pu-mk/.test(s),
    '★★ 올릴 HTML 에 표시를 섞는다 — 그 표시가 홈페이지에 그대로 올라간다');
  const m = 함수('markPreview');
  assert.match(m, /contentDocument/, '★ 표시를 DOM 에서 붙이지 않는다');
  assert.match(m, /pu-mk/, '★ 표시할 꾸밈이 없다');
});

test('★ 표시할 것이 없으면 «아무것도 안 한다»', () => {
  const m = 함수('markPreview');
  assert.match(m, /if \(!말들\.length\) return/, '★ 바뀐 줄이 없어도 화면을 훑는다 — 헛일이다');
  /* 틀 안을 못 읽는 상황(다른 곳에서 온 쪽)에서 터지면 화면이 멈춘다 */
  assert.match(m, /catch/, '★ 틀 안을 못 읽을 때 터진다');
});

/* ══════ ③ 기본은 접힘 ══════ */
test('★★ 기본은 «접힘» — 안 쓸 때 편집칸을 좁히지 않는다', () => {
  const m = /preview: *(true|false)/.exec(H);
  assert.ok(m, '★ 미리보기 상태를 못 찾았다');
  assert.strictEqual(m[1], 'false',
    '★★ 미리보기가 켜진 채로 열린다 — 편집칸이 좁아 「왜 좁나」로 읽힌다');
  /* 접혔을 때는 지금 화면과 «똑같아야» 한다 */
  const sc = 함수('screen');
  assert.match(sc, /App\.preview *\?/,
    '★★ 미리보기를 켜든 끄든 같은 것을 그린다 — 접어도 자리를 먹는다');
  assert.match(sc, /pane2/, '★ 나란히 놓는 칸이 없다');
});

test('★ 켜고 끄는 단추가 «어느 쪽인지» 알려 준다', () => {
  const bar = 함수('appbarHtml');
  assert.match(bar, /togglePreview\(\)/, '★ 미리보기 단추가 없다');
  assert.match(bar, /미리보기 끄기/,
    '★ 켜진 상태에서 글자가 안 바뀐다 — 지금 켜져 있는지 알 수 없다');
});

/* ══════ ④ 못 그릴 때는 왜인지 말한다 ══════ */
test('★★ 못 그릴 때 «빈 칸»을 보여 주지 않는다 — 왜인지 말한다', () => {
  const s = 함수('미리보기HTML');
  /* 갈래마다 못 그리는 까닭이 다르다. 하나라도 말없이 비면 고장으로 읽힌다.
     ⚠ 처음에 «why: 가 넷 이상»으로 세었다가 고쳤다 — 하나를 지워도 넷이 남아
       통과해 버렸다. 개수가 아니라 «어떤 까닭들인지»를 봐야 한다. */
  [['쪽을 안 골랐을 때', /왼쪽 목록에서/],
   ['쪽을 안 읽었을 때', /이 쪽을 아직 안 읽었습니다/],
   ['구성원 쪽을 안 읽었을 때', /구성원 쪽을 아직 안 읽었습니다/],
   ['자문사현황일 때', /자문사현황은/]].forEach(function (짝) {
    assert.match(s, 짝[1],
      '★★ ' + 짝[0] + ' 말없이 빈 칸을 보여 준다 — 고장으로 읽힌다');
  });

  const p = 함수('prevHtml');
  assert.match(p, /r\.why/, '★ 까닭을 화면에 안 그린다');
  assert.match(p, /읽어오기/, '★ 안 읽었을 때 «읽는 길»을 안 준다 — 막다른 길이 된다');
});

test('★ 자문사현황은 «여기서 미리 볼 것이 없다»고 밝힌다', () => {
  /* 로고 «그림»이라 글 미리보기로 할 일이 없다. 말없이 비면 고장으로 읽힌다. */
  const s = 함수('미리보기HTML');
  assert.match(s, /partner/, '★ 자문사 갈래를 가리지 않는다');
  assert.match(s, /자문사 로고 관리/,
    '★ 자문사는 어디서 봐야 하는지 안 알려 준다');
});

/* ══════ ⑤ 그림·스타일이 깨지지 않게 ══════ */
test('★★ base 를 끼운다 — 안 끼우면 그림·스타일이 통째로 깨진다', () => {
  /* srcdoc 은 «주소가 없다». 상대 주소로 된 그림·CSS 가 다 깨진다.
     2026-09-02 확인: base 를 끼우면 깨진 그림 0개. */
  assert.match(H, /function base끼우기/, '★ base 를 끼우는 곳이 없다');
  const b = 함수('base끼우기');
  assert.match(b, /<base href=/, '★ base 를 안 만든다');
  assert.match(b, /<head/, '★ 머리에 안 끼운다 — 몸통에 넣으면 늦다');

  const p = 함수('prevHtml');
  assert.match(p, /base끼우기\(/, '★★ 미리보기가 base 없이 그린다 — 그림이 다 깨진다');
});

test('★★ 바탕은 «우리 사본»을 가리킨다 — 도메인이 붙어도 안 깨지게', () => {
  /* 올릴 때 진짜 홈페이지와 우리 사본에 «둘 다» 올린다. 사본은 이 화면과 같은 곳에
     있고 딴 데로 넘겨지지 않으므로, 홈페이지에 도메인이 붙어도 그림이 그대로 온다. */
  const s = 함수('사본주소');
  assert.match(s, /'site\/'/, '★ 우리 사본을 안 가리킨다');
  assert.match(s, /location\.href/,
    '★ 주소를 박아 두었다 — 이 화면이 어디로 옮겨가도 따라오게 할 것');
  assert.ok(!/raw\.githubusercontent|pureun-site/.test(s),
    '★★ 바탕이 우리 사본이 아니다 — 도메인이 붙으면 그림이 깨질 수 있다');
});

/* ══════ ⑥ 읽어 온 원본을 남긴다 ══════ */
test('★★ 읽어 온 쪽의 «원본 HTML»을 남긴다 — 안 남기면 미리 볼 것이 없다', () => {
  const s = 함수('keepPageHtml');
  /* ⚠ 값이 아니라 규칙을 본다: 「그 쪽 자리에 html 을 넣는다」.
       처음에 «App.pageHtml[mid] = html» 을 글자 그대로 박았다가 고쳤다 —
       모래상자에서 터지지 않게 «(App.pageHtml || (App.pageHtml = {}))[mid]» 로
       감싸자마자 내 검사가 못 맞췄다. 감싸는 방식은 안 따진다. */
  assert.match(s, /pageHtml[^;]*\[mid\][^;]*= *html/,
    '★★ 원본을 버린다 — 미리보기가 쪽을 다시 받아야 한다');
  assert.match(함수('미리보기HTML'), /App\.pageHtml\[mid\]/, '★ 미리보기가 그것을 안 쓴다');
});

/* ══════ ⑦ 「지금 / 고친 뒤」 견주기 ══════ */
test('★ 「지금」과 「고친 뒤」를 번갈아 볼 수 있다 — 무엇이 바뀌는지 알게', () => {
  const s = 함수('미리보기HTML');
  assert.match(s, /previewMode === 'now'/, '★ 「지금」을 볼 수 없다');
  const p = 함수('prevHtml');
  /* ⚠ 소스에서는 따옴표가 «감싸져» 있다(\\'now\\') — 그대로 찾으면 안 맞는다.
       처음에 그렇게 썼다가 고쳤다: 무늬가 안 맞아 「단추가 없다」고 걸렸는데
       실제로는 있었다. 감싼 따옴표도 맞게 둔다. */
  assert.match(p, /setPreviewMode\(\\?'now\\?'\)/, '★ 「지금」으로 바꾸는 단추가 없다');
  assert.match(p, /setPreviewMode\(\\?'after\\?'\)/, '★ 「고친 뒤」로 돌아오는 단추가 없다');
});

/* ══════ ⑧ 단추가 «있는 함수»를 부른다 ══════
   ⚠ 이 화면에는 그것을 지키는 검사가 «없었다» — `tests/cards-onclick-exists.test.js` 는
     pu-cards.html 만 본다. 이빨 시험에서 드러났다: setPreviewMode 를 이름만 바꿔도
     단추는 없는 함수를 부르는데 검사가 다 통과했다.
   ★ 그래서 이 화면 전체를 여기서 함께 지킨다 (2026-09-02 훑어보니 53가지 다 있었다). */
test('★★ 단추가 부르는 함수가 «이 파일에 다 있다»', () => {
  const 부르는것 = new Set();
  const re = /\bon(?:click|change|input|focus|submit|paste)\s*=\s*(["'])([\s\S]*?)\1/g;
  let m;
  while ((m = re.exec(H))) {
    let f;
    const re2 = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    while ((f = re2.exec(m[2]))) {
      const n = f[2];
      if (['if', 'return', 'function', 'this', 'typeof', 'new', 'true', 'false'].indexOf(n) >= 0) continue;
      부르는것.add(n);
    }
  }
  assert.ok(부르는것.size > 20,
    '★ 단추를 ' + 부르는것.size + '가지만 찾았다 — 훑기가 헛돌고 있다(빈손으로 초록)');

  /* ⚠ 「window.X = X」 는 «정의가 아니다» — 밖으로 내놓는 것뿐이다.
       처음에 그것도 「있다」로 셌더니, 함수 이름만 바꿔도 통과해 버렸다
       (선언은 사라졌는데 window.X = X 가 남아 있어서다. 그러면 쪽이 열릴 때
       바로 죽는다). 그래서 «자기 이름을 다시 붙이는 것»은 안 센다. */
  const 있나 = function (n) {
    /* 「window.X = X;」 는 다시 내놓는 것뿐이라 «정의로 세지 않는다».
       ⚠ 처음에 부정형 미리보기(?!…)로 걸렀는데 \s* 가 느슨해 빠져나갔다 —
         공백을 0개로 잡으면 미리보기가 어긋나 통과했다. 그래서 «따로» 가른다. */
    const 재수출 = new RegExp('window\\.' + n + '\\s*=\\s*' + n + '\\s*;').test(H);
    const 창에붙임 = new RegExp('window\\.' + n + '\\s*=').test(H);
    return new RegExp('function\\s+' + n + '\\s*\\(').test(H)
      || new RegExp('(?:const|let|var)\\s+' + n + '\\s*=').test(H)
      || new RegExp('\\b' + n + '\\s*[:=]\\s*(?:async\\s*)?(?:function|\\()').test(H)
      || (창에붙임 && !재수출);
  };
  const 없는것 = [...부르는것].filter(function (n) { return !있나(n); });
  assert.deepStrictEqual(없는것, [],
    '★★ 단추가 «없는 함수»를 부른다: ' + 없는것.join(', ')
    + ' — 눌러도 아무 일이 없고, 오류도 화면에 안 보인다');
});

/* ══════ ⑨ 홈페이지에 편집용 스크립트를 심지 않는다 ══════ */
test('★★ 홈페이지에 «편집용 스크립트를 심지» 않는다 — 방문자에게도 나간다', () => {
  /* 가장 쉬운 길이지만, 그 스크립트가 손님 화면에서도 돈다.
     미리보기는 우리 화면 안(iframe)에서만 돌아야 한다. */
  const s = 함수('미리보기HTML') + 함수('prevHtml') + 함수('markPreview');
  assert.ok(!/postMessage/.test(s),
    '★★ 홈페이지 쪽과 쪽지를 주고받는다 — 받는 코드를 홈페이지에 심어야 한다');
  const 올릴것 = 함수('미리보기HTML');
  assert.ok(!/<script/.test(올릴것),
    '★★ 올릴 HTML 에 스크립트를 끼운다 — 그것이 방문자에게 나간다');
});
