'use strict';
/* 구성원 편집칸 — 상단 틀고정 + 한 줄로 줄이기 (대표 지시 2026-09-03)
 *   「이부분 더 줄여줄수 없나 그리고 상단은 틀고정하는게 맞다」
 *   고른 안: 「안 나 — 라벨을 칸 안으로」 + 「구분·올림 + 이름·직책 줄까지 붙이기」
 *
 * ★ 이 검사가 지키는 것
 *   ① 위 두 줄이 «붙어 있다» (구르는 곳은 .esc 다)
 *   ② 붙이는 것은 «두 줄까지» — 메인 설명·담당 업무·경력까지 붙이면 굴릴 자리가 없다
 *   ③ 이름·직책1·직책2·글번호가 «한 줄»에 있다
 *   ④ 라벨이 «남아 있다» — placeholder 로 밀어넣지 않았다(값을 채우면 사라진다)
 *   ⑤ 좁은 자리에서는 «접힌다» — 안 접히면 폰에서 이름 칸이 짜부라진다
 *
 * 실행: node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

/* 주석은 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시키면 아무것도 안 지킨다 */
function 알맹이(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const H = 알맹이(RAW);

function 함수(이름) {
  const i = H.search(new RegExp('(?:async )?function ' + 이름 + '\\('));
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았다');
  let j = H.indexOf('\nfunction ', i + 5);
  const k = H.indexOf('\nasync function ', i + 5);
  if (k >= 0 && (j < 0 || k < j)) j = k;
  return H.slice(i, j < 0 ? H.length : j);
}

/* CSS 규칙 한 덩이를 꺼낸다 */
function 꾸밈(고르개) {
  const m = new RegExp(고르개.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(H);
  return m ? m[1] : '';
}

/* ══════ ① 위 두 줄이 붙어 있다 ══════ */

test('★★ 편집칸 «위 두 줄»이 붙어 있다 — 경력을 고치다 누구 자료인지 잃지 않게', () => {
  const s = 함수('memberEdit');
  const 붙임 = s.indexOf('class="stick');
  assert.ok(붙임 >= 0,
    '★★ 붙여 두는 칸(.stick)이 없다 — 굴리면 이름·구분·올림이 위로 사라진다');

  const css = 꾸밈('.stick');
  assert.ok(css, '★ 붙이는 모양(CSS)이 없다 — 클래스만 붙고 아무 일도 안 한다');
  assert.match(css, /position: *sticky/,
    '★★ .stick 이 실제로 안 붙는다 — 클래스 이름만 「stick」이다');
  assert.match(css, /top: *0/, '★ 어디에 붙을지(top)를 안 정했다');
  assert.match(css, /background/,
    '★ 바탕색이 없다 — 아래 글이 붙은 칸을 «통과해» 겹쳐 보인다');
  assert.match(css, /z-index/, '★ 층(z-index)이 없다 — 아래 글이 위로 올라온다');
});

test('★★ 붙는 것은 «구르는 칸 안»이다 — 경고 띠 자리로 옮기지 않는다', () => {
  const s = 함수('memberEdit');
  /* .ehd 는 퇴사·남김 경고 띠 자리다. 여기에 입력칸까지 넣으면
     폰에서 머리가 화면 절반을 먹는다. */
  const 머리 = s.indexOf('class="ehd"');
  const 구르는칸 = s.indexOf('class="esc"');
  const 붙임 = s.indexOf('class="stick');
  assert.ok(머리 >= 0 && 구르는칸 > 머리, '★ 편집칸 뼈대(.ehd → .esc)가 바뀌었다');
  assert.ok(붙임 > 구르는칸,
    '★★ 붙는 칸이 «경고 띠(.ehd)» 쪽에 있다 — 폰에서 머리가 화면 절반을 먹는다');
});

test('★★ 붙이는 것은 «두 줄까지» — 메인 설명 아래는 굴러야 한다', () => {
  const s = 함수('memberEdit');
  const 붙임시작 = s.indexOf('class="stick');
  assert.ok(붙임시작 >= 0, '★ 붙는 칸이 없다');
  /* 붙는 칸이 «어디서 닫히는가»를 본다 — 메인 설명보다 앞에서 닫혀야 한다.
     ★ 다 붙여 버리면 굴릴 자리가 남지 않는다. 그건 틀고정이 아니라 그냥 안 구르는 것이다. */
  const 설명 = s.indexOf('메인 설명', 붙임시작);
  assert.ok(설명 > 붙임시작, '★ 「메인 설명」 칸을 못 찾았다');
  const 사이 = s.slice(붙임시작, 설명);
  assert.match(사이, /<\/div>/,
    '★★ 「메인 설명」까지 붙여 두었다 — 굴릴 자리가 남지 않는다');
  /* 경력사항은 확실히 밖이어야 한다 */
  const 경력 = s.indexOf('경력사항', 붙임시작);
  if (경력 > 0) {
    const 닫은수 = (s.slice(붙임시작, 경력).match(/<\/div>/g) || []).length;
    assert.ok(닫은수 >= 1, '★★ 경력사항까지 붙여 두었다');
  }
});

/* ══════ ② 네 칸이 한 줄 · 라벨은 남는다 ══════ */

test('★★ 이름·직책1·직책2·글번호가 «한 줄»에 있다', () => {
  const s = 함수('memberEdit');
  /* 이름이 줄 하나를 통째로 쓰고 있었다 — 세 글자에 너비 1,180px 였다 */
  const 줄시작 = s.indexOf('class="two"');
  assert.ok(줄시작 >= 0, '★ 나란히 놓는 줄(.two)이 없다');
  /* ★ 「첫 </div> 까지」로 자르지 않는다 — 칸마다 </div> 가 있어 첫 칸에서 끊긴다.
     그 줄의 «다음 줄»이 시작하기 전까지, 없으면 넉넉한 창까지 본다. */
  const 다음 = s.indexOf('메인 설명', 줄시작);
  const 한줄 = s.slice(줄시작, 다음 > 줄시작 ? 다음 : 줄시작 + 1600);
  /* ⚠ 소스에서는 따옴표가 탈출되어 있다 — fieldEdit(\'name\' 꼴이다.
     탈출 없는 꼴만 찾으면 «못 찾고 실패»한다(고쳐 놓았는데 빨간불이 난다). */
  ['name', 'position1', 'position2', 'srl'].forEach(f =>
    assert.match(한줄, new RegExp("fieldEdit\\(\\\\?'" + f + "\\\\?'"),
      '★★ ' + f + ' 칸이 그 줄 밖에 있다 — 한 줄로 모으지 않으면 높이가 안 줄어든다'));
});

test('★★ 라벨을 placeholder 로 밀어넣지 «않는다» — 값을 채우면 사라진다', () => {
  const s = 함수('memberEdit');
  const 줄시작 = s.indexOf('class="two"');
  const 다음 = s.indexOf('메인 설명', 줄시작);
  const 한줄 = s.slice(줄시작, 다음 > 줄시작 ? 다음 : 줄시작 + 1600);
  /* 이름표가 «글자로» 남아 있어야 한다. placeholder 는 값이 들어오면 사라져
     「직책2 가 무엇이었는지」를 알 수 없게 된다. */
  ['이름', '직책1', '직책2', '글 번호'].forEach(l =>
    assert.ok(한줄.indexOf('>' + l) >= 0 || 한줄.indexOf(l + '<') >= 0
      || 한줄.indexOf(l) >= 0,
      '★★ 「' + l + '」 이름표가 사라졌다'));
  /* 네 칸의 placeholder 로 이름표를 대신하지 않았나 */
  ['직책1', '직책2', '글 번호'].forEach(l =>
    assert.ok(한줄.indexOf('placeholder="' + l + '"') < 0,
      '★★ 「' + l + '」을 placeholder 로 넣었다 — 값을 채우면 이름표가 사라진다'));

  /* 라벨이 칸 «안»에 있는 모양(.inl)이 실제로 나란히 세우는지 */
  const css = 꾸밈('.inl');
  assert.ok(css, '★ 칸 안 라벨 모양(.inl CSS)이 없다');
  assert.match(css, /display: *flex/, '★ 이름표와 값이 나란히 서지 않는다');
  const b = 꾸밈('.inl > b');
  assert.ok(b, '★ 이름표 모양이 없다');
  assert.match(b, /white-space: *nowrap/,
    '★ 이름표가 줄바꿈된다 — 「글 번호」가 두 줄이 되면 칸이 높아진다');
});

test('★ 「글 번호」 칸이 «이름 칸보다 좁다» — 숫자 몇 자리다', () => {
  const s = 함수('memberEdit');
  const 너비 = (라벨) => {
    const m = new RegExp('flex: *0 *0 *(\\d+)px[\\s\\S]{0,90}?' + 라벨).exec(s)
           || new RegExp(라벨 + '[\\s\\S]{0,90}?flex: *0 *0 *(\\d+)px').exec(s);
    return m ? Number(m[1]) : null;
  };
  const 글번호 = 너비('글 번호'), 이름 = 너비('이름');
  assert.ok(글번호, '★ 글 번호 칸의 너비를 못 찾았다');
  if (이름) assert.ok(글번호 < 이름,
    '★ 글 번호(' + 글번호 + 'px)가 이름(' + 이름 + 'px)보다 넓다 — 숫자 몇 자리인데');
});

/* ══════ ③ 좁은 자리에서는 접힌다 ══════ */

test('★★ 좁은 자리에서 네 칸이 «접힌다» — 안 접히면 이름 칸이 짜부라진다', () => {
  /* 실측 2026-09-03: 375px 에서 두 줄로 접히고 칸 너비 128px 이 된다.
     접히지 않으면 「권형하」가 두 글자 너비가 된다. */
  const 질의 = /@media *\([^)]*max-width: *(\d+)px[^)]*\)\s*\{([\s\S]{0,400}?)\n\}/g;
  let m, 찾음 = false;
  while ((m = 질의.exec(H))) {
    if (/\.two\s*\{[^}]*flex-wrap: *wrap/.test(m[2])) { 찾음 = true; break; }
  }
  assert.ok(찾음,
    '★★ 좁은 자리에서 .two 가 접히지 않는다 — 네 칸을 한 줄에 두었으니 반드시 접혀야 한다');
});
