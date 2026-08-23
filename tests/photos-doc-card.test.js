'use strict';
/* 서류 칸은 「종이 카드」다 — 대표 지시 2026-08-16
   "서식·회사·담당자 이렇게 동시에 칸을 많이 차지하는데 이 부분 어떻게 정리하는 게 좋은가"

   종전에는 칸 아래에 20px 짜리 띠가 셋(제목·업체·올린사람) 쌓였다.
   폰 칸이 104px 이므로 60px — **절반이 넘게** 그림을 덮었다.

   그런데 진짜 문제는 띠 개수가 아니었다. **104px 짜리 종이 스캔은 안 읽힌다.**
   서류에서 정보는 그림이 아니라 글자인데, 안 읽히는 그림이 칸을 다 차지하고
   진짜 정보인 글자가 10px 띠에 눌려 있었다 — 거꾸로였다.
   그래서 서류만 흰 카드로 뒤집고, 일반 사진(회의·현장)은 그림 그대로 둔다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ⚠ 「function renderGrid( … \n} 까지」로 뽑지 않는다 — 그 정규식은 **열 0 의 첫 중괄호**
   에서 끊겨 함수 뒷부분(칸을 그리는 대목)을 통째로 놓친다. 실제로 여기서 한 번 걸렸다.
   자리를 못 박지 말고 시작점부터 넉넉히 잘라 쓴다. */
/* ⚠ 주석을 걷어내고 본다 — 안 그러면 **주석에 적힌 낱말**을 보고 통과한다.
   실제로 여기서 걸렸다: 「올린 사람이 어딘가에는 그려지는가」를 보는 검사가
   바로 위 주석의 `__ownerName` 글자를 읽고 통과해, 그리는 코드를 지워도 안 잡혔다. */
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' '); }

/* 글자를 찾는 대신 **함수를 실제로 돌린다.**
   ⚠ 「__ownerName 이라는 낱말이 있나」로는 못 잡는다 — 조건만 죽여도
     (`m.__ownerName ?` → `false ?`) 뒤쪽 문자열에 그 낱말이 그대로 남아 통과한다.
     실제로 이 뮤테이션이 한 번 살아남았다. 이름이 **결과에 찍히는지**를 본다. */
function whenBoxOf(src) {
  const i = src.indexOf('function whenBox(');
  const body = src.slice(i, src.indexOf('\n}', i) + 2);
  return new Function('whenText', 'dayKey', 'esc', body + '\nreturn whenBox;')(
    function () { return '때'; }, String, String);
}

const gi = app.indexOf('function renderGrid(');
const grid = gi < 0 ? '' : app.slice(gi, gi + 20000);
// ⚠ 넉넉히 자른다 — 12000 자로는 칸 그리는 대목(함수 시작에서 140 줄쯤 아래)에
//   **간발의 차이로 못 닿아** 검사가 헛돌았다. 실제로 한 번 걸렸다.

test('서류와 사진을 갈라 그린다', async (t) => {
  await t.test('서류만 종이 카드가 된다', () => {
    assert.match(grid, /kind === 'doc'/, '서류인지 가리지 않으면 사진까지 카드가 됩니다.');
    assert.match(grid, /class="cell doc/, '서류 카드 갈래가 없습니다.');
  });

  await t.test('일반 사진은 그림이 꽉 찬다 — 카드로 만들지 않는다', () => {
    // 회의사진·현장사진은 그림이 곧 내용이다. 카드로 바꾸면 오히려 안 보인다.
    // ⚠ 갈림길 그 자리에서 자른다 — 함수 앞에서부터 세면 길이를 잘못 잡아 헛돈다.
    const at = app.indexOf("if (it.meta.kind === 'doc') {");
    assert.ok(at > 0, '서류 갈림길을 찾지 못했습니다.');
    const elseArm = app.slice(at, at + 2000).split('} else {')[1] || '';
    assert.ok(elseArm.length > 0, '사진 쪽 갈래가 없습니다.');
    assert.ok(elseArm.indexOf('cell doc') < 0, '사진 쪽까지 카드로 그리고 있습니다.');
    assert.match(elseArm, /img \+ tag/, '사진 칸에서 그림이 빠졌습니다.');
  });
});

test('카드 안에서 글자가 제 자리를 갖는다', async (t) => {
  await t.test('제목이 두 줄까지 나온다', () => {
    /* 「위임계약서, 급여관리업무…」가 한 줄에서 잘렸다. 서류 제목은 길다. */
    const m = app.match(/#grid \.cell\.doc \.dttl\{[^}]*\}/);
    assert.ok(m, '서류 카드 제목 모양이 없습니다.');
    assert.match(m[0], /line-clamp:\s*2/, '제목이 한 줄이면 카드로 바꾼 뜻이 없습니다.');
  });

  await t.test('제목이 없으면 업체를 제목 자리로 올린다', () => {
    /* 아직 판독 전이거나 제목순으로 볼 때는 제목이 빈다.
       그대로 두면 카드 절반이 빈 줄로 남는다. */
    assert.match(grid, /const l1 = tt \|\| capTxt/, '제목이 없을 때 빈 줄이 남습니다.');
    assert.match(grid, /const l2 = tt \? capTxt : ''/, '제목이 없는데 업체를 두 번 적고 있습니다.');
  });

  await t.test('확인 필요 표가 마지막 줄 글자를 덮지 않는다', () => {
    /* ⚠ 딱지는 칸 오른쪽 아래에 절대위치로 뜬다. 카드 본문이 거기까지 차 있으면
       업체 이름 끝글자를 가린다.
       ⚠ 2026-08-21: 비우는 자리를 «표가 있는 칸»에만 준다(.wnpad). 예전에는 모든
         서류 카드가 비웠는데, 경고가 없는 카드에서는 그냥 빈 줄이었다 — 대표
         지적: "한 줄 일부러 차지 안 해도 되는데". 대개는 「서류」 딱지가 그대로
         경고가 되어(.tag.need) 표를 안 쓴다. 자세한 것은
         tests/photos-doc-warn-slot.test.js. */
    assert.match(app, /#grid \.cell\.doc\.wnpad \.bd\{padding-bottom:\s*\d+px\}/,
      '표가 뜨는 칸에 자리를 안 비워 두면 글자가 덮입니다.');
    assert.ok(!/#grid \.cell\.doc \.bd\{padding-bottom:\s*\d+px\}/.test(app),
      '★ 모든 서류 카드를 비우는 옛 규칙이 살아 있습니다 — 빈 줄이 다시 생깁니다.');
  });

  await t.test('미리보기는 종이 위쪽을 보여 준다', () => {
    /* 종이는 위쪽에 제목·기관명이 있다. 가운데를 자르면 빈 칸만 보인다. */
    assert.match(app, /#grid \.cell\.doc \.strip img\{object-position:\s*top\}/,
      '종이 가운데를 자르면 아무것도 안 보입니다.');
  });
});

test('올린 사람 띠는 칸에서 사라졌다', async (t) => {
  await t.test('칸에 이름 띠를 다시 그리지 않는다', () => {
    assert.equal(/<span class="who">/.test(grid), false,
      '칸에 이름 띠를 되살리면 띠가 다시 셋이 됩니다(폰에서 칸의 절반).');
  });

  await t.test('그래도 사진을 열면 누가 올렸는지 나온다', () => {
    /* ⚠ 이름이 담긴 곳은 __ownerName 하나뿐이다. 칸에서 빼면서 여기까지 지우면
       누구 사진인지 알 방법이 **아예 사라진다**. */
    const whenBox = whenBoxOf(app);
    const out = whenBox({ meta: { __ownerName: '김보람', upAt: 1786000000000 } });
    assert.match(out, /김보람/,
      '칸에서도 빼고 상세에도 없으면 올린 사람을 영영 못 봅니다.');
  });

  await t.test('올린 사람이 없는 사진에서는 빈 줄을 만들지 않는다', () => {
    const whenBox = whenBoxOf(app);
    const out = whenBox({ meta: { upAt: 1786000000000 } });
    assert.equal(/올린 사람/.test(out), false, '이름이 없는데 「올린 사람」 줄만 남습니다.');
  });

  await t.test('때가 하나도 없어도 올린 사람은 나온다', () => {
    /* 옛 사진은 upAt·takenAt 이 비어 있다. 그때 통째로 빈손이 되면 안 된다. */
    const whenBox = whenBoxOf(app);
    assert.match(whenBox({ meta: { __ownerName: '권형하' } }), /권형하/);
  });
});
