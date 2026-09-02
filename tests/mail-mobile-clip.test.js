/* 폰 메일함 — 글자가 화면 밖으로 안 나간다 · 폴더에 담당자도 있다
   대표 지적 2026-08-30: 「메일함 글자가 화면밖 안나가게  폴더 피시는 담당자도 있다 폰에서도」

   ① 무슨 일이었나 — 자르라고 적어 두었는데 «한 줄도 안 잘리고» 있었다.
      .dmm-l2(제목)·.dmm-l3(미리보기)는 <span> 이다. 인라인 요소에는
      overflow:hidden 도 text-overflow:ellipsis 도 «아무 효과가 없다».
      실측(411px 폰, 실제 크로미움): 글이 681px 까지 삐져나갔다 — 270px 가 화면 밖.
      display:block 한 줄로 411px 에 딱 맞는다.
      ⚠ 그래서 이 검사는 «자르는 규칙이 적혀 있는가»가 아니라
        «그 규칙이 실제로 듣는 모양인가(블록인가)»를 본다. 적혀만 있으면 소용없다.

   ② PC 옆줄에는 「👤 담당자 / 📂 업무별」 고르개가 있는데 폰 서랍에는 업무별뿐이었다.
      같은 메일을 담당자로 갈라 보는 길이 폰에서만 막혀 있었다.
   실행: node --test tests/mail-mobile-clip.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 규칙 덩어리를 그대로 떼어 온다 */
function 규칙(선택자) {
  const re = new RegExp('\\' + 선택자 + '\\{([^}]*)\\}');
  const m = re.exec(src);
  assert.ok(m, 선택자 + ' 규칙이 사라졌습니다');
  return m[1].replace(/\s+/g, '');
}

test('★ 제목·미리보기는 «블록»이어야 자르기가 듣는다 — 인라인이면 규칙이 헛돈다', () => {
  for (const 줄 of ['.dmm-l2', '.dmm-l3']) {
    const r = 규칙(줄);
    assert.match(r, /display:block/,
      '★ ' + 줄 + ' 이 인라인입니다 — 자르라고 적어도 글자가 화면 밖으로 나갑니다');
    assert.match(r, /overflow:hidden/, 줄 + ' 에 넘침 자르기가 없습니다');
    assert.match(r, /text-overflow:ellipsis/, 줄 + ' 에 … 이 없습니다');
    assert.match(r, /white-space:nowrap/, 줄 + ' 이 여러 줄로 흐릅니다');
  }
});

test('글자가 든 칸이 줄어들 수 있어야 한다 (min-width:0)', () => {
  /* flex 칸은 기본이 «안 줄어든다» — min-width:0 이 없으면 자식이 아무리 잘려도
     칸 자체가 넓어져 화면 밖으로 밀린다. 자르기와 «짝»으로 있어야 한다. */
  assert.match(규칙('.dmm-tx'), /min-width:0/,
    '★ 글자 칸이 안 줄어듭니다 — 자르기가 있어도 화면이 옆으로 늘어납니다');
  assert.match(규칙('.dmm-l1 .who'), /min-width:0/, '보낸이 칸이 안 줄어듭니다');
});

test('세 줄(보낸이·제목·미리보기)이 모두 자기 칸 안에 머문다', () => {
  for (const 줄 of ['.dmm-l1 .who', '.dmm-l2', '.dmm-l3']) {
    const r = 규칙(줄);
    assert.match(r, /overflow:hidden/, 줄 + ' 만 안 잘립니다');
  }
});

/* ── ② 폰 서랍의 담당자 ── */
function 서랍() {
  const at = src.indexOf('function mbDrawerHtml()');
  assert.ok(at > 0, '폰 서랍을 그리는 함수가 사라졌습니다');
  return src.slice(at, src.indexOf('\nfunction ', at + 10));
}

test('★ 폰 서랍에도 「담당자 / 업무별」 고르개가 있다', () => {
  const d = 서랍();
  assert.match(d, /dmm-seg/, '★ 폰에는 고르개가 없습니다 — PC 에만 있으면 폰에서 갇힙니다');
  assert.match(d, /mbSetDash\('who'\)/, '담당자로 바꾸는 길이 없습니다');
  assert.match(d, /mbSetDash\('topic'\)/, '업무별로 돌아오는 길이 없습니다');
});

test('★ 담당자 줄을 실제로 그린다 — 고르개만 있고 목록이 없으면 빈 화면이다', () => {
  const d = 서랍();
  assert.match(d, /dash === 'who'/, '담당자 갈래가 없습니다');
  assert.match(d, /MB_WHO_P \+ w\.name/, '담당자 칸으로 가는 길이 없습니다');
  assert.match(d, /mbWhoList\(\)/, '담당자 목록을 안 읽습니다');
  assert.match(d, /meTag/, '본인 줄에 「나」 표가 없습니다');
});

test('★ PC 와 «같은 잣대»를 쓴다 — 따로 두면 화면을 옮길 때 튄다', () => {
  const d = 서랍();
  /* state.mbDash·mbMyBox 는 PC 옆줄이 쓰는 것과 같아야 한다.
     폰만 제 것을 따로 들면, PC 에서 담당자를 보다 폰을 열었을 때 업무별로 튄다. */
  assert.match(d, /state\.mbDash/, '폰이 제 잣대를 따로 듭니다');
  assert.match(d, /mbMyBox\(\)/, '처음 열 때의 기본값이 PC 와 다릅니다');
  const pc = src.slice(src.indexOf('const dash = state.mbDash'));
  assert.match(pc, /state\.mbDash === 'who' \? 'who' : 'topic'/, 'PC 쪽 잣대가 바뀌었습니다');
});

test('업무별 목록은 그대로 남아 있다 — 담당자를 더하며 없애지 않았다', () => {
  const d = 서랍();
  assert.match(d, /dash === 'topic'/, '업무별 갈래가 없습니다');
  assert.match(d, /mbBinMenu\(/, '폰에서 칸 이름 바꾸기·숨기기가 사라졌습니다');
});
