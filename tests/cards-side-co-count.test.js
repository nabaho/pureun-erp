/* 기업정보함 옆줄 — 「기업 상세」 단추에도 개수를 보여준다.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-17: "기업상세에도 전체 숫자 넣어달라."
   명함(6,270)·사업자(346)에는 숫자가 있는데 기업 상세만 없었다.

   ★ 개수는 coList() 에서 가져온다 — 옆줄 「폴더 › 전체」와 «같은 셈»이어야 한다.
     따로 세면 두 숫자가 어긋나는데, 어느 쪽이 맞는지 아무도 모르게 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 갈래 단추 줄만 떼어 온다 (이름 있는 표식으로 자른다 — 길이로 자르면 근처가 길어질 때 터진다) */
function tabBar(){
  const i = src.indexOf('<div class="sidetab sidetabv">');
  assert.ok(i > 0, '갈래 단추 줄을 못찾음');
  const j = src.indexOf('</div></div>`;', i);
  assert.ok(j > i, '갈래 단추 줄 끝을 못찾음');
  return src.slice(i, j);
}

/* ⚠ 예전에는 「기업 상세」라는 «글자»로 이 단추를 찾았다. 2026-08-30 에 등록증
   서류함 단추의 말풍선에 「기업 상세」가 들어가자(회사는 저기서 본다는 안내다) 그것이
   먼저 걸려 엉뚱한 단추를 집었다 — 검사는 깨졌는데 화면은 멀쩡했다.
   단추가 «하는 일»(openCoPage)로 찾는다. 글귀는 바뀌어도 하는 일은 안 바뀐다. */
function coTabBtn(){
  const bar = tabBar();
  const i = bar.indexOf('openCoPage()');
  assert.ok(i > 0, '기업 상세로 가는 단추가 없다');
  return bar.slice(i, bar.indexOf('</button>', i));
}

test('기업 상세 단추에 개수가 붙어 있다', () => {
  assert.match(coTabBtn(), /<span>/, '개수 칸이 없다');
});

test('개수를 coList() 에서 가져온다 — 폴더 「전체」와 같은 셈이어야 한다', () => {
  assert.match(coTabBtn(), /coList\(\)\.length/, '따로 세면 두 숫자가 어긋난다');
});

test('폴더 「전체」도 같은 셈을 쓴다 — 두 곳이 갈라지지 않는다', () => {
  /* 옆줄 기업 상세 칸은 cos = coList() 를 만들어 「전체」에 그 길이를 쓴다. */
  const i = src.indexOf("if(state.view==='co'){");
  const side = src.slice(i, src.indexOf("innerHTML = h; return;", i));
  assert.match(side, /const cos = coList\(\)/, '폴더 칸이 coList 를 안 쓴다');
  assert.match(side, /'📋 전체', cos\.length/, '「전체」가 그 길이를 안 쓴다');
});

test('세 자리마다 쉼표를 넣는다 — 명함·사업자와 같은 차림새', () => {
  const bar = tabBar();
  ['명함', '사업자', '기업 상세'].forEach(name => {
    const i = bar.indexOf(name);
    assert.ok(i > 0, name + ' 단추가 없다');
    const btn = bar.slice(i, bar.indexOf('</button>', i));
    assert.match(btn, /toLocaleString\(\)/, name + ' 단추에 쉼표가 없다');
  });
});

test('켜짐 표시는 그대로 하나뿐이다 — 개수를 넣다가 망가지면 안 된다', () => {
  const bar = tabBar();
  assert.match(bar, /\$\{onCo\?'on':''\}/, '기업 상세 켜짐 조건이 사라졌다');
  /* 2026-08-24: 메일이 이 줄에서 빠져 「!onMail」로 가릴 일이 없어졌다 —
     메일 창에서는 줄 자체를 안 그린다(tests/cards-mail-own-window.test.js). */
  assert.match(bar, /!onCo&&state\.tab==='card'/, '명함 켜짐 조건이 사라졌다');
  assert.ok(bar.indexOf('openMailPage()') < 0, '갈래 줄에 메일이 되살아났다');
});

test('값을 치른 근거가 코드에 적혀 있다', () => {
  /* 명함 화면에서도 회사 목록을 만들게 된다 — 왜 그래도 되는지 다음 사람이 알아야 한다. */
  const bar = tabBar();
  assert.match(bar, /29ms/, '얼마나 드는지 안 적혀 있다');
});
