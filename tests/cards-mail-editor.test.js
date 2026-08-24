'use strict';
/* 쓰기 화면을 다음메일과 같게 — 서식이 실제로 나가는 편집기
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「다음 이메일 보내는 방식과 완전하게 같게 푸른메일함 디자인 해줘」

   무엇이 문제였나: 도구줄에 글꼴·크기·굵게·기울임 단추가 있는데 **받는 사람에게는
   아무 영향이 없었다.** 본문이 <textarea> 평문이고 setBodyStyle 은 state.bodyFont 만
   바꿔 그 textarea 의 style 에만 썼다. 즉 «대표 화면의 글씨만» 바뀌는 가짜였다.

   ★ 여기서 못 박는 것
     ① 본문은 contenteditable 이다 — textarea 로는 서식을 담을 수 없다
     ② 도구를 누르면 화면을 «다시 그리지 않는다» — 다시 그리면 글자 자리(캐럿)를 잃는다
     ③ 누른 결과는 곧바로 담아 둔다 — 안 담으면 다음 렌더에서 사라진다
     ④ 서버로 html 을 «실제로» 넘긴다 (안 넘기면 도구줄이 다시 가짜가 된다)
     ⑤ 평문으로 저장된 옛 본문·틀을 열면 서식으로 바꿔 보여 준다
     ⑥ 다음메일 도구줄에 있는 것이 다 있다
   실행: node --test tests/cards-mail-editor.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = src.indexOf('\n}', i);
  return src.slice(i, j + 2);
}
function cut(from, to){
  const i = src.indexOf(from); assert.ok(i >= 0, '못 찾음: ' + from);
  const j = src.indexOf(to, i); assert.ok(j > i, '끝을 못 찾음: ' + to);
  return src.slice(i, j);
}

/* ══════ ① 본문은 contenteditable ══════ */

test('본문이 contenteditable 이다 — textarea 로는 서식을 담을 수 없다', () => {
  const fn = fnBody('mailWriteHtml');
  assert.match(fn, /id="cpBody"[^>]*contenteditable="true"|contenteditable="true"[^>]*id="cpBody"/,
    '본문이 contenteditable 이 아니다');
  assert.ok(fn.indexOf('<textarea id="cpBody"') < 0, 'textarea 가 남아 있으면 서식이 갈 데가 없다');
});

test('빈 본문에도 안내 글이 뜬다 — contenteditable 은 placeholder 가 없다', () => {
  assert.match(src, /\.cpbody(\[contenteditable\])?:empty:before|\.cpbody:empty::before/,
    '빈 칸이 그냥 하얗게 비면 어디에 쓰는지 모른다');
});

/* ══════ ② · ③ 도구를 눌러도 다시 안 그린다 ══════ */

test('도구를 누르면 화면을 다시 그리지 않는다 — 캐럿을 잃는다', () => {
  const fn = fnBody('edCmd');
  assert.ok(fn.indexOf('renderMailPage()') < 0,
    '★ edCmd 가 renderMailPage 를 부르면 글자를 쓰던 자리가 매번 맨 앞으로 튄다');
  assert.match(fn, /execCommand\(/, '실제 명령을 안 낸다 — 다시 가짜가 된다');
});

test('누른 결과를 곧바로 담아 둔다', () => {
  assert.match(fnBody('edCmd'), /grabCompose\(\)/,
    '★ 안 담으면 다음에 화면을 그릴 때 방금 넣은 서식이 사라진다');
});

test('켜짐 표시는 브라우저에 물어서 칠한다 — 우리가 세지 않는다', () => {
  const fn = fnBody('edSyncBar');
  assert.match(fn, /queryCommandState\(/,
    '★ 우리가 따로 세면 마우스로 딴 데를 눌렀을 때 표시가 어긋난다');
  assert.ok(fn.indexOf('renderMailPage()') < 0, '표시만 칠해야 한다');
});

/* ══════ ④ 서버로 html 을 실제로 넘긴다 ══════ */

test('grabCompose 가 서식(innerHTML)과 평문을 둘 다 담는다', () => {
  const fn = fnBody('grabCompose');
  assert.match(fn, /innerHTML/, '★ value 만 읽으면 contenteditable 에서 빈 값이 온다');
  assert.match(fn, /_compose\.html\s*=/, 'html 을 안 담으면 보낼 것이 없다');
  assert.match(fn, /_compose\.body\s*=/, '평문 몫을 안 담으면 서식 못 읽는 곳에서 빈 편지가 된다');
});

test('보낼 때 html 을 서버로 넘긴다', () => {
  const fn = fnBody('sendCompose');
  assert.match(fn, /html:\s*c\.html/, '★ 이 줄이 없으면 서식이 화면에만 남고 안 나간다');
  assert.match(fn, /body:\s*c\.body/, '평문 몫도 같이 보내야 한다');
});

test('예약·묶음 발송도 같은 것을 넘긴다 — 길이 갈려도 서식은 같아야 한다', () => {
  for (const n of ['sendCompose', 'bulkSendAll']) {
    assert.match(fnBody(n), /html:/, n + ' 이 서식을 안 넘긴다');
  }
});

/* ══════ ⑤ 옛 평문을 열면 서식으로 바꿔 준다 ══════ */

test('평문을 서식으로 바꾸는 길이 있다', () => {
  const fn = fnBody('textToHtml');
  assert.match(fn, /replace/, '바꾸는 일을 안 한다');
});

test('평문의 <, & 는 글자로 지켜진다 — 태그로 새면 편지가 깨진다', () => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fnBody('textToHtml') + '\n' + fnBody('htmlToTextC'), ctx);
  const h = ctx.textToHtml('<주식>회사 A&B');
  assert.ok(h.indexOf('&lt;주식&gt;') >= 0, '< 가 태그로 새 나갔다: ' + h);
  assert.ok(h.indexOf('A&amp;B') >= 0, '& 가 안 지켜졌다: ' + h);
});

test('평문 줄바꿈은 <br> 이 된다', () => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fnBody('textToHtml'), ctx);
  assert.match(ctx.textToHtml('가\n나'), /가<br>나/);
});

test('서식 → 평문도 화면 쪽에 있다 (보낸 목록·미리보기에 쓴다)', () => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fnBody('htmlToTextC'), ctx);
  assert.equal(ctx.htmlToTextC('<p>가</p><p><b>나</b></p>'), '가\n나');
  assert.equal(ctx.htmlToTextC('&lt;가&gt;'), '<가>');
});

test('본문을 열 때 평문이면 바꿔서 넣는다', () => {
  const fn = fnBody('mailWriteHtml');
  assert.match(fn, /composeHtml\(/, '★ 평문 틀을 그대로 넣으면 줄바꿈이 다 사라져 한 줄이 된다');
  assert.match(fnBody('composeHtml'), /textToHtml\(/);
});

/* ══════ 화면 쪽과 서버 쪽이 «같은 답»을 내는가 ══════
   서식 → 평문 뽑기가 두 곳에 있다. 화면은 서버 모듈을 부를 수 없어서 어쩔 수 없이
   두 벌인데, 두 벌이면 언젠가 한쪽만 고친다 — 이 저장소에서 여러 번 겪은 일이다.
   그래서 「같은 답을 내는가」를 여기서 못 박는다. 하나를 고치면 이 검사가 걸린다. */

test('★ 서식 → 평문 뽑기가 화면과 서버에서 같은 답을 낸다', () => {
  const MS = require(path.join(ROOT, 'functions', 'mail-send.js'));
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fnBody('htmlToTextC'), ctx);
  const CASES = [
    '<p>가</p><p>나</p>',
    '가<br>나<br><br>다',
    '<div>가</div><div>나</div>',
    '<ul><li>가</li><li>나</li></ul>',
    '&lt;주식&gt; A&amp;B&nbsp;회사 &quot;가&quot; &#39;나&#39;',
    '가<br><br><br><br>나',
    '<p><b>굵게</b>와 <i>기울임</i></p>',
    '<p>가</p><hr><p>나</p>',
    '<p>  띄어쓰기  </p>',
    '',
    '<p><br></p>'
  ];
  for (const h of CASES) {
    assert.equal(ctx.htmlToTextC(h), MS.htmlToText(h),
      '★ 두 쪽이 다른 답을 냈다 — 받는 편지의 서식 몫과 평문 몫이 다른 말을 한다: ' + JSON.stringify(h));
  }
});

test('두 쪽이 같은 답을 내야 한다는 것이 코드에 적혀 있다', () => {
  assert.match(fnBody('htmlToTextC'), /mail-send/,
    '다음 사람이 한쪽만 고치지 않도록 서로를 가리켜야 한다');
});

/* ══════ 다른 길로도 서식이 새지 않는가 ══════ */

test('임시저장·다시 쓰기·서명·미리보기가 모두 서식을 다룬다', () => {
  assert.match(fnBody('draftOf'),    /html:/,        '★ 임시저장이 서식을 안 담으면 이어 쓸 때 사라진다');
  assert.match(fnBody('resendFrom'), /html:/,        '★ 다시 쓰기가 서식을 잃는다');
  assert.match(fnBody('insertSign'), /_compose\.html\s*=/, '★ 서명을 평문에만 붙이면 화면에 안 나타난다');
  assert.match(fnBody('previewMail'), /composeHtml\(/, '★ 미리보기가 꾸민 모양을 안 보여 준다');
});

/* ══════ ⑥ 다음메일 도구줄에 있는 것이 다 있다 ══════ */

const TOOLS = cut('const ED_TOOLS', '\nfunction ');

test('다음메일 도구가 다 있다', () => {
  const want = [
    ['bold', '굵게'], ['italic', '기울임'], ['underline', '밑줄'],
    ['strikeThrough', '취소선'], ['foreColor', '글자색'], ['hiliteColor', '배경색'],
    ['justifyLeft', '왼쪽'], ['justifyCenter', '가운데'], ['justifyRight', '오른쪽'],
    ['insertOrderedList', '번호'], ['insertUnorderedList', '글머리'],
    ['indent', '들여쓰기'], ['outdent', '내어쓰기'],
    ['createLink', 'URL'], ['insertHorizontalRule', '구분선']
  ];
  for (const [cmd] of want) {
    assert.ok(TOOLS.indexOf(cmd) >= 0, '★ ' + cmd + ' 도구가 없다 — 다음메일에는 있다');
  }
});

test('글꼴과 글자 크기는 실제 명령을 낸다', () => {
  const fn = fnBody('mailWriteHtml');
  assert.match(fn, /edCmd\('fontName'/, '글꼴이 아직 가짜다');
  assert.match(fn, /edFontSize\(/, '글자 크기가 아직 가짜다');
  assert.match(fnBody('edFontSize'), /execCommand|edCmd\('fontSize'/);
});

test('가짜였던 setBodyStyle 은 없앴다', () => {
  assert.ok(src.indexOf('function setBodyStyle(') < 0,
    '★ 남겨 두면 다음 사람이 그것을 고쳐 「왜 안 나가나」로 하루를 쓴다');
});

/* ══════ Editor / HTML / TEXT 전환 ══════ */

test('아래에 Editor · HTML · TEXT 전환이 있다', () => {
  const fn = fnBody('mailWriteHtml');
  for (const m of ['Editor', 'HTML', 'TEXT']) {
    assert.ok(fn.indexOf(m) >= 0, m + ' 전환이 없다 — 다음메일에는 있다');
  }
  assert.match(fn, /edMode\(/, '누를 수 없는 이름표만 있다');
});

test('HTML·TEXT 로 본 뒤 Editor 로 돌아와도 내용을 잃지 않는다', () => {
  const fn = fnBody('edMode');
  assert.match(fn, /grabCompose\(\)/, '★ 담지 않고 갈래를 바꾸면 쓰던 글이 날아간다');
});

/* ══════ 다음메일과 같은 차림새 ══════ */

test('받는사람 옆에 「주소록」이 있다 (다음메일과 같은 자리)', () => {
  const fn = fnBody('mailWriteHtml');
  assert.match(fn, /openAddrBook\(\)/, '★ 다음메일에는 받는사람 오른쪽에 주소록이 있다');
});

test('주소록은 명함에서 고르고, 한 번에 넣을 수 있는 수를 지킨다', () => {
  const fn = fnBody('addrBookAdd');
  assert.match(fn, /MAIL_MAX_TO|5/, '★ 한 번에 보낼 수 있는 수를 넘겨 넣으면 보낼 때 거절당한다');
});

test('주소록은 이메일 없는 명함을 고르게 하지 않는다', () => {
  /* 2026-08-24: 한글 조합이 끊기지 않게 목록을 addrBookListHtml 로 떼어 냈다 */
  assert.match(fnBody('addrBookListHtml'), /normEmail\(/,
    '★ 이메일 없는 사람을 고르면 「받는 사람이 없다」로 되돌아온다');
});

test('첨부 칸을 접을 수 있다 (다음메일과 같게)', () => {
  const fn = fnBody('mailWriteHtml');
  assert.match(fn, /toggleAtt\(\)/, '★ 다음메일의 첨부는 ⌃ 로 접힌다');
  assert.match(fnBody('toggleAtt'), /grabCompose\(\)/, '접기 전에 담지 않으면 쓰던 글이 날아간다');
});

test('보내는사람에 «가짜» 펼치기 표시를 달지 않았다', () => {
  /* 다음메일에는 보내는사람 옆에 ⌄ 가 있다. 그것은 다음 계정이 보내는 주소를 여러 개
     가질 수 있기 때문이다. 우리는 자료함에서 정한 «한 개»뿐이다 — 열리지 않는 ⌄ 를
     달면 이번에 고친 「가짜 단추」를 새로 만드는 것이 된다. */
  const fn = fnBody('mailWriteHtml');
  const i = fn.indexOf('class="cpfrom"');
  assert.ok(i > 0, '보내는사람 줄이 없다');
  const row = fn.slice(Math.max(0, i - 200), i + 200);
  assert.ok(row.indexOf('⌄') < 0, '★ 열리지 않는 펼치기 표시를 달았다');
});

/* ══════ 예약 발송 자리 ══════ */

test('예약 발송은 아래 왼쪽에 있다 (다음메일과 같은 자리)', () => {
  const fn = fnBody('mailWriteHtml');
  const bar = fn.indexOf('class="edbar"');
  const sched = fn.indexOf('toggleSchedule(this.checked)');
  const body = fn.indexOf('id="cpBody"');
  assert.ok(bar > 0 && sched > 0 && body > 0, '세 조각이 다 있어야 한다');
  assert.ok(sched > body, '★ 예약 발송이 아직 도구줄에 있다 — 다음메일은 본문 아래다');
});
