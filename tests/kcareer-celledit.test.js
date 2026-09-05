/* 경력관리 — 이미 «글자가 든 칸»도 화면에서 고친다 (대표 지시 2026-09-05)

   ■ 무엇이 문제였나
     대표 제보: 「왜 화면에서 바로 수정할 수 있도록 기능이 안되나?」
     입력판은 «빈 칸»에만 입력칸을 만들었다. 그래서 「내 정보로 채우기」가 한 번 값을
     넣고 나면 그 칸은 더는 빈 칸이 아니라 화면에서 고칠 길이 없었다
     (실측: 대표 화면에 노란 칸이 「(한자)」·「자택:」 두 곳만 남았다).

   ■ 한글 편집기로는 못 푼다 (실측 2026-09-05)
     rhwp 편집기는 뜨지만 getSelectionContext 가 editable:false — 읽기 전용이다.
     눌러 쳐도 changeSeq 가 0 이다. 게다가 남의 주소로 나가는 길이라 막았다.

   ■ 어떻게 고쳤나
     ⑴ scan 이 «왼쪽이 라벨인 값 칸»을 '글자칸' 으로 잡는다
     ⑵ 그 자리는 글자를 «덮는» 상자를 낸다(뒤에 붙이면 못 고친다)
     ⑶ 되돌려 넣을 때 setCellText 가 있던 글자를 «바꾼다»(fillCell 은 앞에 덧붙는다) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/kcareer-formmap.js');
const X = require('../js/kcareer-hwpxfill.js');
const O = require('../js/kcareer-overlay.js');
const H = require('../hwpx_gen.js');

function tbl(rows) { return H.tablePara(rows, H.cols(rows[0].map(() => 1 / rows[0].length))); }
const 서식 = tbl([['성명', '권형하'], ['현 주소', '충남 천안시 용곡4길 20'], ['생년월일', '']]);

test('★★ 왼쪽이 라벨인 «값 칸»을 고칠 자리로 잡는다', () => {
  const m = M.scan(서식);
  const 이름칸 = m.slots.filter((s) => s.row === 0 && s.col === 1)[0];
  const 주소칸 = m.slots.filter((s) => s.row === 1 && s.col === 1)[0];
  assert.ok(이름칸, '★ 채워진 칸이 자리 목록에서 빠지면 화면에서 못 고칩니다');
  assert.equal(이름칸.kind, '글자칸');
  assert.equal(이름칸.text, '권형하');
  assert.equal(주소칸.kind, '글자칸');
  /* 빈 칸은 그대로 빈칸이다 */
  assert.equal(m.slots.filter((s) => s.row === 2 && s.col === 1)[0].kind, '빈칸');
});

test('★★ 라벨 칸 자신은 «고칠 자리»가 아니다 — 서식 문구를 덮으면 안 된다', () => {
  const m = M.scan(서식);
  const 라벨 = m.slots.filter((s) => s.row === 0 && s.col === 0);
  assert.equal(라벨.length, 0, '★ 왼쪽 칸(「성명」)까지 잡으면 입력판이 서식 문구를 덮습니다');
});

test('★★ 자동 채우기는 글자칸을 «건드리지 않는다» — 기관이 적어 둔 글이 사라지면 안 된다', () => {
  const m = M.guess(M.scan(서식), { fields: { name: '홍길동', addr: '서울시' } });
  m.slots.filter((s) => s.kind === '글자칸').forEach((s) => {
    assert.equal(s.guess, '', '★ 글자칸에 열쇠를 주면 자동으로 덮어씁니다');
  });
});

test('★★ 사람이 고쳐 치면 «바꿔» 넣는다 — 앞에 덧붙으면 안 된다', () => {
  /* ⚠ 예전 fillCell 로 넣으면 「세종시충남 천안시 용곡4길 20」이 된다. */
  const r = M.apply(서식, { values: { 't0r1c1': '세종특별자치시 한누리대로 2130' } });
  assert.match(r.xml, /세종특별자치시 한누리대로 2130/);
  assert.doesNotMatch(r.xml, /충남 천안시/, '★ 있던 글자가 남아 있으면 두 번 적힌 것입니다');
  assert.equal(M.scan(r.xml).slots.filter((s) => s.row === 1 && s.col === 1)[0].text,
    '세종특별자치시 한누리대로 2130');
});

test('★★ 문서 뼈대를 부수지 않는다 — 글자만 바뀌어야 한다', () => {
  /* ■ 실제로 부순 적이 있다 (실측 2026-09-05)
       setCellText 의 여는 태그를 «<hp:t[^>]*>» 로 썼더니 칸 태그 «<hp:tc …>» 까지 잡아먹어
       795자짜리 칸이 500자로 줄고 <hp:tc> 여는 태그가 사라졌다. 한글 엔진이 그 문서를
       열기는 하는데 «글자 조각 0개»로 그렸다 — 화면이 하얗게 비었다.
     ⚠ 「글자가 바뀌었나」만 보는 검사는 이것을 못 잡는다. 뼈대 개수를 함께 세야 한다. */
  const r = M.apply(서식, { values: { 't0r1c1': '세종시' } });
  ['<hp:tc', '</hp:tc>', '<hp:p ', '<hp:run', '<hp:t>', '</hp:t>', '<hp:lineseg'].forEach((tag) => {
    assert.equal((r.xml.split(tag).length - 1), (서식.split(tag).length - 1),
      tag + ' 개수가 달라졌습니다 — 뼈대를 부순 것입니다');
  });
});

test('★★ 두 번 넣어도 두 번 적히지 않는다', () => {
  const once = M.apply(서식, { values: { 't0r0c1': '권형하A' } }).xml;
  const twice = M.apply(once, { values: { 't0r0c1': '권형하A' } }).xml;
  assert.equal((twice.match(/권형하A/g) || []).length, 1);
});

test('★ 글자칸에서 «빈 글자»는 지우라는 뜻이다 — 다른 자리에서는 손대지 않는다', () => {
  const 지움 = M.apply(서식, { values: { 't0r0c1': '' } });
  assert.doesNotMatch(지움.xml, /권형하/, '★ 사람이 지운 것은 지워져야 합니다');
  /* 빈칸 자리에 빈 글자를 주는 것은 「비워 두기」 — 아무 일도 일어나지 않는다 */
  const 그대로 = M.apply(서식, { values: { 't0r2c1': '' } });
  assert.equal(그대로.xml, 서식);
});

test('★★ 글자가 든 칸은 그 글자를 «덮는» 상자를 낸다 — 뒤에 붙으면 못 고친다', () => {
  /* 표식은 setCellText 가 글자를 «갈아 끼우»므로 원본 글자와 같은 자리에서 시작한다.
     그 자리에서 «다음 조각 앞»까지가 고쳐 쓸 폭이다. */
  const mark = { x: 100, y: 50, w: 40, h: 14, text: O.MARK + '3' + O.MARK };
  const clean = [{ x: 100, y: 50, w: 90, h: 14, text: '충남 천안시' },
                 { x: 300, y: 50, w: 50, h: 14, text: '다음 칸' }];
  const over = O.cellBox(mark, clean, 500, true);
  assert.equal(Math.round(over.x), 100, '★ 글자 «앞»에서 시작해야 덮습니다');
  assert.ok(over.w >= 90, '적어도 있던 글자만큼은 넓어야 합니다');
  assert.ok(over.x + over.w <= 300, '다음 칸을 침범하면 안 됩니다');
  /* 덮기가 아니면 예전처럼 글자 «뒤»에서 시작한다(「(한글)」 안내글 자리) */
  const after = O.cellBox(mark, clean, 500, false);
  assert.ok(after.x > 180, '안내글 뒤 자리는 글자 뒤에서 시작합니다');
});

test('★★ 한 칸의 글자가 «여러 조각»이어도 통째로 덮는다', () => {
  /* ■ 실측 2026-09-05: 「충남 천안시 용곡4길 20」이 엔진에서 네 조각으로 온다
       — 「충남 천안시 용곡」·「4」·「길 」·「20」 (글꼴·숫자에서 갈린다).
     첫 조각만 덮으면 폭이 104px 밖에 안 나와 뒷글자가 상자 밖으로 삐져나온다.
     ⚠ 붙어 있는 조각은 이어 보고, 눈에 띄게 벌어지면 «남의 자리»로 보아 끊는다. */
  const mark = { x: 100, y: 50, w: 30, h: 13, text: O.MARK + '1' + O.MARK };
  const clean = [
    { x: 100, y: 50, w: 104, h: 13, text: '충남 천안시 용곡' },
    { x: 204, y: 50, w: 8, h: 13, text: '4' },
    { x: 212, y: 50, w: 26, h: 13, text: '길 ' },
    { x: 238, y: 50, w: 16, h: 13, text: '20' },
    { x: 420, y: 50, w: 40, h: 13, text: '남의 칸' }
  ];
  const b = O.cellBox(mark, clean, 600, true);
  assert.equal(Math.round(b.x), 100);
  assert.ok(b.w >= 154, '네 조각 전부(254까지)를 덮어야 합니다 — 지금 ' + Math.round(b.w));
  assert.ok(b.x + b.w <= 420, '★ 옆 칸을 침범하면 안 됩니다');
});
