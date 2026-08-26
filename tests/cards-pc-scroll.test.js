/* 기업정보함 PC — 본문을 차지하는 화면이 «아래로 내려가지 않던» 것.
   실행: node --test tests/*.test.js

   대표 화면 2026-08-16: "아래로 내려가지 않는다 둘다 왜이런가?"
   (기업 상세 — 「거래처만 184곳」도 「전체 4,138곳」도 똑같이 안 내려갔다)

   ★ 무엇이 문제였나 (재서 확인함)
     #pcRoot 는 100vh, #pcMain 은 세로 flex 에 overflow:hidden 이다. 내려가는 일은
     «자식»이 해야 한다. 명함 표는 #pcTableWrap 에 flex:1 + overflow:auto 가 있어
     그 안에서 내려갔다. 그런데 나중에 붙은 네 화면(환경설정·자료함·기업 상세·메일)에는
     그것이 아예 없었다 — 창 900px 에 기업 상세 내용이 2,188px 이라 3분의 2가 잘렸다.

   ★ min-height:0 을 함께 못 박는 까닭
     flex 자식은 기본이 min-height:auto 다. 「내용만큼」이 최소 높이라서, overflow:auto
     만 줘도 칸이 줄어들지 않아 «스크롤 막대가 생기지 않는다». 이 한 줄이 빠지면
     고친 것처럼 보이지만 그대로 안 내려간다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 규칙 한 줄을 통째로 집어 온다 (선택자 → 여는 중괄호 → 닫는 중괄호) */
function ruleFor(selectorPart){
  const i = src.indexOf(selectorPart);
  assert.ok(i >= 0, selectorPart + ' 규칙을 못 찾음');
  const open = src.indexOf('{', i);
  const close = src.indexOf('}', open);
  assert.ok(open > 0 && close > open, selectorPart + ' 규칙이 깨졌다');
  return { selector: src.slice(i, open), body: src.slice(open + 1, close) };
}

const FULL_SCREENS = ['pcSettings', 'pcMat', 'pcCo', 'pcMail'];

test('본문 전체를 쓰는 네 화면이 모두 스스로 내려간다', () => {
  const r = ruleFor('#pcSettings,#pcMat,#pcCo,#pcMail');
  FULL_SCREENS.forEach(id => {
    assert.ok(r.selector.includes('#' + id), '#' + id + ' 이 규칙에서 빠졌다');
  });
  assert.match(r.body, /overflow:\s*auto/, '내려갈 수가 없다');
});

test('min-height:0 이 함께 있다 — 이것이 없으면 고친 척만 하고 안 내려간다', () => {
  const r = ruleFor('#pcSettings,#pcMat,#pcCo,#pcMail');
  assert.match(r.body, /min-height:\s*0/,
    'flex 자식의 기본 min-height:auto 때문에 칸이 안 줄어들어 스크롤이 안 생긴다');
});

test('남는 자리를 채운다 — 창 아래쪽이 비어 보이면 안 된다', () => {
  const r = ruleFor('#pcSettings,#pcMat,#pcCo,#pcMail');
  assert.match(r.body, /flex:\s*1/, '남는 높이를 안 받으면 내용만큼만 차지한다');
});

test('바깥 칸이 여전히 잘라내는 쪽이다 — 안쪽이 내려가야 하는 까닭', () => {
  /* #pcMain 이 overflow:hidden 을 놓으면 이 고침의 전제가 바뀐다. */
  const main = ruleFor('#pcMain{');
  assert.match(main.body, /display:\s*flex/);
  assert.match(main.body, /flex-direction:\s*column/);
  assert.match(main.body, /overflow:\s*hidden/);
});

test('명함 표의 내려가기는 건드리지 않았다 — 멀쩡하던 것을 바꾸면 안 된다', () => {
  const wrap = ruleFor('#pcTableWrap{');
  assert.match(wrap.body, /overflow:\s*auto/);
  assert.match(wrap.body, /flex:\s*1/);
});

test('네 화면은 모두 #pcMain 안에 나란히 있다 — 한 칸만 보이고 나머지는 숨는다', () => {
  /* 형제가 아니라 겹쳐 있으면 flex:1 이 엉뚱하게 나뉜다. */
  const mainAt = src.indexOf('<div id="pcTableWrap">');
  assert.ok(mainAt > 0);
  const tail = src.slice(mainAt, src.indexOf('</main>', mainAt));
  FULL_SCREENS.forEach(id => {
    assert.ok(tail.includes('id="' + id + '"'), '#' + id + ' 이 본문 칸 안에 없다');
  });
});

test('화면을 오갈 때 한 칸만 켜진다 — 두 칸이 같이 켜지면 높이를 나눠 갖는다', () => {
  const i = src.indexOf('function renderPC(){');
  const fn = src.slice(i, src.indexOf('renderErpTabs(); renderPCTable();', i));
  FULL_SCREENS.forEach(id => {
    assert.ok(fn.includes("$('" + id + "')") || fn.includes(id),
      'renderPC 가 #' + id + ' 를 켜고 끄지 않는다');
  });
  assert.match(fn, /style\.display\s*=/, '화면을 켜고 끄는 코드가 없다');
});
