'use strict';
/* 로고 붙여넣기 (Ctrl+V) — 대표 요청 2026-09-02
 *   「로고의 경우 홈페이지에서 화면 캡쳐후 붙여넣기로 쉽게 해결하고 싶다」
 *   목업 docs/mockups/logo-paste.html 승인본.
 *
 * ★ 이 검사가 지키는 것 — 「쉽게」가 「조용히 망가짐」이 되지 않게:
 *   ① 캡쳐로 넣으면 흰 네모가 생긴다 → «미리보기를 실제 배경색 위에» 깔아 눈에 보이게 한다
 *   ② 흰 배경을 «자동으로 투명하게 만들지 않는다» — 로고 안 흰 글자에 구멍이 뚫린다
 *   ③ 붙이면 «담기»까지다 — 홈페이지에 바로 실리지 않는다
 *   ④ 담는 길은 «하나»다 — 파일 고르기와 붙여넣기가 갈리면 한쪽만 고쳐진다
 *   ⑤ 창을 닫으면 붙여넣기를 끈다 — 안 끄면 다른 화면의 Ctrl+V 를 가로챈다
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

/* 함수 하나를 떼어 온다 — 다음 함수가 시작하는 곳까지 */
function 함수(이름) {
  const i = H.search(new RegExp('(?:async )?function ' + 이름 + '\\('));
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았다');
  const j = H.indexOf('\nfunction ', i + 5);
  const k = H.indexOf('\nasync function ', i + 5);
  const 끝 = Math.min(j < 0 ? H.length : j, k < 0 ? H.length : k);
  return H.slice(i, 끝);
}

/* ══════ 붙여넣기를 «받는가» ══════ */
test('★★ Ctrl+V 로 그림을 받는다 — 듣는 이가 «한 번만» 달려 있다', () => {
  assert.match(H, /addEventListener\('paste', *onLogoPaste\)/,
    '★ 붙여넣기를 아무도 안 듣는다');
  /* 창을 그릴 때마다 달면 겹쳐서 여러 번 돈다 — 로고가 두 장씩 담긴다 */
  const 단곳 = (H.match(/addEventListener\('paste'/g) || []).length;
  assert.strictEqual(단곳, 1,
    '★★ 붙여넣기 듣는 이가 ' + 단곳 + '곳에 달렸다 — 겹치면 한 번 붙여도 여러 번 담긴다');
});

test('★★ 그림이 아니면 «아무것도 안 한다» — 글자 붙여넣기를 막지 않는다', () => {
  const s = 함수('onLogoPaste');
  assert.match(s, /indexOf\('image\/'\)/, '★ 그림인지 안 가린다');
  /* 그림이 아닐 때 preventDefault 를 부르면 다른 칸에 글자를 못 붙인다.
     ★ 「먼저 찾고, 없으면 돌아간 뒤에» 막는다」는 차례가 지켜져야 한다. */
  const 찾은곳 = s.indexOf('if (!f) return');
  const 막는곳 = s.indexOf('preventDefault');
  assert.ok(찾은곳 >= 0, '★ 그림을 못 찾았을 때 그냥 돌아가지 않는다');
  assert.ok(찾은곳 < 막는곳,
    '★★ 그림이 아닌데도 붙여넣기를 막는다 — 다른 칸에 글자를 못 붙이게 된다');
});

test('★★ 로고 창이 열려 있을 때만 받는다 — 닫으면 끈다', () => {
  assert.match(함수('onLogoPaste'), /if \(!App\.logoPasteOn\) return/,
    '★ 창이 닫혀 있어도 Ctrl+V 를 가로챈다');
  assert.match(함수('drawPartnerLogos'), /App\.logoPasteOn = true/,
    '★ 로고 창을 열어도 붙여넣기가 안 켜진다');
  const 닫기 = 함수('closeModal');
  assert.match(닫기, /App\.logoPasteOn = false/,
    '★★ 창을 닫아도 붙여넣기가 켜져 있다 — 다른 화면의 Ctrl+V 를 가로챈다');
  assert.match(닫기, /App\.logoPick = null/,
    '★ 담지 않고 닫았는데 그림이 남는다 — 다음에 열면 남의 그림이 떠 있다');
});

/* ══════ 캡쳐가 로고를 망가뜨리지 않게 ══════ */
test('★★ 흰 배경을 «자동으로 투명하게 만들지 않는다»', () => {
  /* 흰 픽셀을 지우면 로고 안의 흰 글자·흰 도형에 구멍이 뚫린다.
     조용히 망가지는 쪽이라, 알려만 주고 사람이 고른다(목업에서 정한 것). */
  const 다루기 = 함수('로고그림다루기');
  assert.ok(!/globalCompositeOperation|putImageData/.test(다루기),
    '★★ 그림의 픽셀을 고친다 — 흰 배경을 지우면 로고 안 흰 글자에 구멍이 뚫린다');
});

test('★★ 흰 테두리를 «가려서 알려» 준다 — 투명 로고에는 경고하지 않는다', () => {
  assert.match(H, /function 흰테두리인가/, '★ 흰 배경인지 가리는 것이 없다');
  const s = 함수('흰테두리인가');
  /* 투명 로고는 변이 «비어 있다»(알파가 낮다). 그것을 흰색으로 세면
     제대로 넣은 로고에도 경고가 떠서, 다음부터 경고를 안 읽게 된다. */
  assert.match(s, /\[3\] *< *\d+/,
    '★★ 알파(비쳐 보이는 정도)를 안 본다 — 투명 로고에도 흰 배경이라고 경고한다');
  assert.match(s, /return false/, '★ 투명 로고일 때 「아니다」로 빠지는 길이 없다');

  /* 화면이 그 결과로 «권함»을 띄우는가 */
  const 그리기 = 함수('drawPartnerLogos');
  assert.match(그리기, /흰테두리/, '★ 흰 배경을 알려 주지 않는다');
  assert.match(그리기, /이미지 복사/,
    '★ 더 나은 길(우클릭 「이미지 복사」)을 안 알려 준다 — 캡쳐만 계속 쓰게 된다');
});

/* ══════ 흰 테두리 가리기를 «진짜로» 돌려 본다 ══════
   경고를 띄울지 정하는 자리라, 글자만 보고 넘길 수 없다.
   ★ 가짜 캔버스를 만들어 준다 — 브라우저 없이 픽셀만 돌려주면 된다. */
function 가짜캔버스(w, h, 점찍기) {
  return {
    width: w, height: h,
    getContext: function () {
      return {
        getImageData: function (x, y) {
          const d = 점찍기(x, y);           /* [r,g,b,a] */
          return { data: d };
        }
      };
    }
  };
}
const 흰테두리인가 = new Function('return ' + 함수('흰테두리인가'))();

test('★★ 캡쳐로 넣은 그림(흰 배경)은 «흰 테두리»로 잡는다', () => {
  /* 가운데는 색이 있고 변은 흰색 — 캡쳐의 모습이다 */
  const cv = 가짜캔버스(200, 80, function (x, y) {
    const 가장자리 = x < 6 || y < 6 || x > 193 || y > 73;
    return 가장자리 ? [255, 255, 255, 255] : [20, 60, 160, 255];
  });
  assert.strictEqual(흰테두리인가(cv), true, '★★ 캡쳐를 못 잡는다 — 흰 네모가 그대로 올라간다');
});

test('★★ 투명 배경 로고에는 «경고하지 않는다» — 헛경고가 잦으면 아무도 안 읽는다', () => {
  /* 변이 «비어 있다»(알파 0) — 제대로 넣은 로고의 모습이다 */
  const cv = 가짜캔버스(200, 80, function (x, y) {
    const 가장자리 = x < 6 || y < 6 || x > 193 || y > 73;
    return 가장자리 ? [0, 0, 0, 0] : [20, 60, 160, 255];
  });
  assert.strictEqual(흰테두리인가(cv), false, '★★ 투명 로고에 흰 배경이라고 경고한다');
});

test('★ 흰 로고를 흰 바탕에 올린 것도 잡는다 (헷갈리는 짝)', () => {
  const cv = 가짜캔버스(200, 80, function () { return [252, 252, 252, 255]; });
  assert.strictEqual(흰테두리인가(cv), true);
});

test('★ 색이 꽉 찬 그림은 흰 테두리가 아니다', () => {
  const cv = 가짜캔버스(200, 80, function () { return [30, 90, 60, 255]; });
  assert.strictEqual(흰테두리인가(cv), false);
});

test('★ 아주 작은 그림에서 터지지 않는다', () => {
  assert.strictEqual(흰테두리인가(가짜캔버스(2, 2, function () { return [255, 255, 255, 255]; })), false,
    '★ 너무 작은 그림은 재지 않는다(변과 속을 가를 수 없다)');
});

test('★★ 미리보기를 «실제 홈페이지 배경색» 위에 깐다 — 흰 네모가 눈에 보이게', () => {
  /* 2026-09-02 실측: 로고가 앉는 자리는 회색 칸이다(#eee).
     흰 바탕 위에 미리 보여 주면 캡쳐의 흰 네모가 «안 보여», 올린 뒤에야 알게 된다.

     ★ 값이 아니라 뜻을 못 박는다: 「흰색이 아니다」.
       처음에는 #eee 를 그대로 박았다가 고쳤다 — 그 색은 팔레트 밖이고,
       팔레트 예외 목록은 일부러 잠가 둔 것이다(color-palette-apps).
       여기서 지킬 것은 정확한 색이 아니라 «흰 네모가 눈에 보이나»다. */
  const css = /\.lpick-card\{([^}]*)\}/.exec(H);
  assert.ok(css, '★ 미리보기 칸의 모양이 없다');
  const bg = /background: *(#[0-9a-fA-F]{3,8}|[a-z]+)/.exec(css[1]);
  assert.ok(bg, '★ 미리보기 바탕색이 없다 — 흰 네모가 보일지 알 수 없다');
  const 흰색들 = ['#fff', '#ffffff', 'white', 'transparent', 'none'];
  assert.ok(흰색들.indexOf(bg[1].toLowerCase()) < 0,
    '★★ 미리보기 바탕이 흰색(' + bg[1] + ')이다 — 캡쳐의 흰 네모가 안 보인다.'
    + ' 올린 뒤에야 알게 되면 미리보기가 하는 일이 없다');
  assert.match(함수('drawPartnerLogos'), /lpick-card/, '★ 미리보기를 안 그린다');
});

test('★ 캡쳐가 커도 줄여서 담는다 — 700KB 한도에 걸리지 않게', () => {
  assert.match(H, /LOGO_MAX_W/, '★ 줄일 기준 폭이 없다');
  const m = /const LOGO_MAX_W = (\d+)/.exec(H);
  assert.ok(m, '★ 기준 폭을 못 읽었다');
  const w = Number(m[1]);
  /* 홈페이지에서 로고는 120~180px 로 보인다 — 너무 작으면 흐리고, 너무 크면 한도에 걸린다 */
  assert.ok(w >= 300 && w <= 1200,
    '★ 기준 폭이 ' + w + 'px 다 — 300~1200px 사이라야 화질도 한도도 지킨다');
  assert.match(함수('로고그림다루기'), /LOGO_MAX_W/, '★ 줄이지 않고 그대로 담는다');
});

/* ══════ 담는 길은 하나 ══════ */
test('★★ 파일 고르기와 붙여넣기가 «같은 길»로 담는다', () => {
  assert.match(H, /async function 로고담기/, '★ 담는 일을 모아 둔 곳이 없다');
  assert.match(함수('addPartnerLogo'), /로고담기\(/, '★ 파일 고르기가 딴 길로 담는다');
  assert.match(함수('keepPastedLogo'), /로고담기\(/, '★ 붙여넣기가 딴 길로 담는다');

  /* 길이 둘이면 한도·이름 규칙이 두 벌이 된다 — 실제로 그럴 자리였다 */
  const 담기 = 함수('로고담기');
  assert.match(담기, /700 \* 1024/, '★ 700KB 한도를 안 본다');
  assert.match(담기, /App\.isAdmin/, '★ 누구인지 안 보고 담는다');
  assert.ok(!/f\.name/.test(담기.replace(/사연/g, '')),
    '★ 남이 준 파일 이름을 주소로 쓴다');
  assert.match(담기, /'n' \+ Date\.now\(\)/,
    '★ 파일 이름을 우리가 짓지 않는다 — 붙여넣기에는 이름이 아예 없다');
});

test('★★ 붙이면 «담기»까지다 — 홈페이지에 바로 실리지 않는다', () => {
  const 담기 = 함수('로고담기');
  assert.ok(!/site\/partner\/index\.html/.test(담기),
    '★★ 담으면서 자문사 쪽까지 덮어쓴다 — 되돌릴 틈이 없다');
  assert.match(함수('keepPastedLogo'), /올리기|눌러야/,
    '★ 「담은 뒤 올려야 실린다」를 안 알려 준다 — 담고 끝난 줄 안다');
});

test('★ 버리는 길이 있다 — 잘못 붙였을 때', () => {
  assert.match(H, /function dropPastedLogo/, '★ 붙인 그림을 버릴 수 없다');
  assert.match(함수('drawPartnerLogos'), /dropPastedLogo\(\)/, '★ 버리는 단추가 화면에 없다');
});

/* ══════ 「메인 설명」 빈 칸이 한 줄 ══════ */
test('★★ 빈 「메인 설명」은 라벨까지 «한 줄»이다 (대표 지적 「한줄 안되나」)', () => {
  const s = 함수('memberEdit');
  /* 라벨이 위에 따로 있으면 빈 칸 하나가 두 줄을 쓴다.
     ★ 글이 «있으면» 라벨을 위로 올린다 — 여러 줄로 늘어나는데 라벨이 옆에 붙어 있으면
       어디까지가 그 칸인지 흐려진다. 그래서 «비었을 때만» 한 줄이다. */
  /* ★ 「어느 클래스인가」를 박지 않는다 — 2026-09-03 에 .fld.oneline 에서 .inl 로
       바뀌었다(라벨을 칸 «안»으로 넣어 더 줄였다). 지켜야 하는 것은 «라벨이 칸과
       한 줄에 선다»는 규칙이고, 클래스 이름은 그 규칙을 담는 그릇일 뿐이다.
       그래서 «빈 칸 쪽이 쓰는 클래스»를 찾아, 그 클래스가 실제로 나란히 세우는지 본다. */
  const 빈칸 = /class="([^"]*)"[^>]*>\s*(?:<b>|<label>)?메인 설명[\s\S]{0,400}?placeholder="/.exec(s)
            || /(?:oneline|inl)[\s\S]{0,600}?메인 설명/.exec(s);
  assert.ok(빈칸, '★★ 빈 「메인 설명」 칸을 못 찾았다');
  const 이름들 = String(빈칸[1] || 빈칸[0]).split(/\s+/);
  const 한줄클래스 = 이름들.find(c => /^(inl|oneline)$/.test(c))
    || (/\boneline\b/.test(빈칸[0]) ? 'oneline' : (/\binl\b/.test(빈칸[0]) ? 'inl' : ''));
  assert.ok(한줄클래스,
    '★★ 빈 칸이 라벨을 위에 따로 세운다 — 빈 칸 하나가 두 줄을 쓴다'
    + ' (쓰인 클래스: ' + 이름들.join(' ') + ')');
  const css = new RegExp('\\.(?:fld\\.)?' + 한줄클래스 + '\\{([^}]*)\\}').exec(H);
  assert.ok(css, '★ 한 줄 모양(CSS)이 없다 — 클래스만 붙고 아무 일도 안 한다');
  assert.match(css[1], /display: *flex/, '★ 라벨과 칸이 나란히 서지 않는다');

  /* 안내 글도 짧아야 한다 — 칸보다 길면 잘려서 무슨 말인지 모른다 */
  const ph = /placeholder="([^"]*)"[^>]*oninput="fieldEdit\('intro'/.exec(s)
          || /메인 설명[\s\S]{0,500}?placeholder="([^"]*)"/.exec(s);
  assert.ok(ph, '★ 빈 칸에 안내 글이 없다');
  assert.ok(ph[1].length <= 12,
    '★ 안내 글이 「' + ph[1] + '」 — 칸보다 길다. 열두 글자 안으로 줄일 것');
});
