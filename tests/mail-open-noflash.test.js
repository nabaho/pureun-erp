/* 푸른 메일을 열 때 «기업정보함 화면이 스치지» 않는다 (대표 제보 2026-09-02)
   「푸른 메일 클릭하면 … 이상한 화면 짧게」

   왜 스쳤나 — 푸른 메일과 기업정보함은 «같은 파일»이다(pu-cards.html?view=mail).
   그래서 문서에는 기업정보함의 갈래 줄(#tabs)과 거르개 줄(#subbar)이 그대로 들어 있고,
   자바스크립트가 돌기 «전»에 그것이 먼저 그려진다. render() 가 mailview 를 붙이는 것은
   그 뒤라, 이미 한 번 스친 뒤다.

   지키는 규칙:
     ① <head> 에서, body 가 만들어지기도 «전»에 표시해 둔다
     ② 표시는 <html> 에 붙인다 — 그때는 body 가 아직 없다
     ③ CSS 가 html 쪽도 «함께» 본다 — 한쪽만 적으면 표시해도 안 감춰진다
     ④ 명함 목록으로 돌아가면 떼어 준다 — 안 떼면 갈래 줄이 영영 안 나온다
     ⑤ ★ 문을 가르는 조건은 «한 벌»이다 — 아이콘 이름은 메일인데 화면은 명함이면 안 된다
   실행: node --test tests/mail-open-noflash.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const head = src.slice(0, src.indexOf('</head>'));

test('★① 그리기 «전»에 표시한다 — <head> 안에서', () => {
  assert.ok(head.indexOf("classList.add('mailview')") > 0,
    '★ 화면이 그려진 뒤에 감추면 이미 한 번 스친 뒤입니다');
});

test('★② 표시는 <html> 에 붙인다 — 그때는 body 가 아직 없다', () => {
  const at = head.indexOf("classList.add('mailview')");
  const 앞 = head.slice(Math.max(0, at - 120), at);
  assert.match(앞, /documentElement/,
    '★ body 에 붙이려 하면 그 시점에는 body 가 없어 아무 일도 안 일어납니다');
});

test('★③ CSS 가 html 쪽도 함께 본다', () => {
  assert.match(src, /html\.mailview #tabs/, '★ 표시만 하고 감추는 규칙이 없습니다');
  assert.match(src, /html\.mailview #subbar/, '거르개 줄이 그대로 스칩니다');
  /* body 쪽 규칙도 남아 있어야 한다 — 화면을 오가며 붙였다 떼는 것은 body 다 */
  assert.match(src, /body\.mailview #tabs/, 'body 쪽 규칙이 사라졌습니다');
});

test('④ 명함 목록으로 돌아가면 떼어 준다', () => {
  const at = src.indexOf("document.body.classList.toggle('mailview'");
  assert.ok(at > 0, '화면마다 표시를 갱신하는 자리가 없습니다');
  assert.match(src.slice(at, at + 400), /documentElement\.classList\.toggle\('mailview'/,
    '★ <html> 에 붙인 것을 안 떼면 「‹ 목록」으로 가도 갈래 줄이 안 나옵니다');
});

test('★⑤ 문을 가르는 조건이 «한 벌»이다 — 아이콘과 화면이 어긋나면 안 된다', () => {
  /* manifest 갈아 끼우기 · 첫 화면 정하기 · urlWantsMail 이 같은 조건을 써야 한다.
     한쪽만 고치면 아이콘 이름은 「푸른 메일」인데 열리는 화면은 명함이 된다. */
  const 조건 = /\/\(\^\|\[\?&\]\)view=mail\(&\|\$\)\//g;
  const 수 = (src.match(조건) || []).length;
  assert.ok(수 >= 3,
    '★ 문을 가르는 조건이 ' + 수 + '군데뿐입니다 — 세 곳(머리말·첫 화면·urlWantsMail)이 같아야 합니다');
});
