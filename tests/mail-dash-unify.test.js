/* 푸른 메일 — 두 대시보드의 «위치·분위기·색»이 하나인가 (대표 지시 2026-08-29)
   "한번도 같은 위치 분위기 색등을 모두 일치하게 조정해달라"

   ★ 어떻게 지키나 — 픽셀을 재는 대신 «어긋날 수 있는 길»을 막는다.
     옆줄 하나에 색이 세 갈래였다: 담당자 보라(#8b7bb8·#f2ecfd·#4c2a8f) ·
     업무별 초록(#8fbfa9·#0f8a5f) · 고른 줄 파랑(#eef3fb·#123a86).
     칩을 바꾸면 화면 분위기가 통째로 달라져, 같은 옆줄인지 알기 어려웠다.

   ⚠ 픽셀 견주기는 «어긋난 뒤»에 잡는다. 여기서는 «두 대시보드가 색을 따로 정하는
     규칙을 갖지 못하게» 막는다 — 어긋남이 아예 못 생긴다.
   ⚠ 뜻이 있어 «달라도 되는» 것 셋만 열어 둔다:
       .meRow   — 내 메일 줄(눈에 띄어야 한다. 다만 «같은 색 갈래»여야 한다)
       .endbin  — 자문종료(살아 있는 칸과 갈려 보여야 한다)
       .grip    — 끌어서 차례 옮기기는 업무 칸에만 있다(자리는 담당자 줄도 비워 둔다)
     이 셋을 늘리려면 여기 적고 왜인지 남겨야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
/* 주석을 먼저 걷는다 — 규칙 위의 설명이 선택자 자리에 묻어 들어온다(2026-08-29 에 겪었다) */
const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 두 대시보드 줄을 겨누는 규칙을 모두 모은다 */
function rulesFor(mark) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  const out = [];
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    if (sel.length > 120) continue;           /* 선택자가 아니라 글 덩어리다 */
    if (sel.indexOf(mark) < 0) continue;
    out.push({ sel, body: m[2].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

const ALLOW = ['meRow', 'endbin', '.grip'];   /* 뜻이 있어 달라도 되는 것 */
const LOOK = ['color', 'background', 'font-weight', 'font-size', 'height', 'padding', 'width'];

test('★★ 담당자 줄만 «따로» 꾸미는 규칙이 없다 — 있으면 칩을 바꿀 때 분위기가 달라진다', () => {
  const bad = rulesFor('whobin')
    .filter(r => !ALLOW.some(a => r.sel.indexOf(a) >= 0))
    .filter(r => LOOK.some(p => new RegExp('(^|;)\\s*' + p + '\\s*:').test(r.body)));
  assert.deepEqual(bad.map(r => r.sel + ' {' + r.body + '}'), [],
    '담당자 줄에만 걸리는 꾸밈이 있습니다 — 업무 칸과 다르게 보입니다');
});

test('★★ 업무 칸 줄만 «따로» 꾸미는 규칙도 없다', () => {
  const bad = rulesFor('topicbin')
    .filter(r => !ALLOW.some(a => r.sel.indexOf(a) >= 0))
    .filter(r => LOOK.some(p => new RegExp('(^|;)\\s*' + p + '\\s*:').test(r.body)));
  assert.deepEqual(bad.map(r => r.sel + ' {' + r.body + '}'), [],
    '업무 칸 줄에만 걸리는 꾸밈이 있습니다 — 담당자와 다르게 보입니다');
});

test('★ 고른 줄 색이 «한 벌»이다 — 두 대시보드가 같은 규칙(.dm-f.on)을 쓴다', () => {
  const on = rulesFor('.dm-f.on').filter(r => /background/.test(r.body));
  assert.ok(on.length, '고른 줄 색을 정한 곳이 없습니다');
  /* 그 위에 덧칠하는 규칙이 없어야 한다 */
  const over = rulesFor('.on')
    .filter(r => /whobin|topicbin/.test(r.sel))
    .filter(r => !ALLOW.some(a => r.sel.indexOf(a) >= 0))
    .filter(r => /background|(^|;)\s*color\s*:/.test(r.body));
  assert.deepEqual(over.map(r => r.sel), [],
    '고른 줄을 대시보드마다 덧칠합니다 — 칩을 바꾸면 고른 줄 색이 달라집니다');
});

test('★ 아이콘 색을 두 줄이 «같은 규칙»에서 받는다', () => {
  /* 아이콘 칸은 이름이 «하나»(.ic)다 — 둘로 가르면 언젠가 한쪽만 바뀐다 */
  assert.match(css, /\.dm-f \.ic\{[^}]*color:/,
    '아이콘 색을 두 줄이 따로 받습니다');
  assert.match(css, /\.dm-f\.on \.ic\{[^}]*color:/,
    '고른 줄 아이콘 색을 따로 받습니다');
});

test('★ 옛 보라·초록이 옆줄에서 사라졌다 — 세 갈래였던 색이 하나로', () => {
  /* 옆줄(.dm-*)을 겨누는 규칙 안에 옛 색이 남아 있으면 안 된다 */
  const OLD = ['#8b7bb8', '#8fbfa9', '#f2ecfd', '#4c2a8f', '#9a8fc0', '#7b4bd1', '#e9dffb', '#0f8a5f'];
  const re = /([^{}]+)\{([^}]*)\}/g;
  const bad = [];
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    if (sel.length > 120 || !/^\.dm-/.test(sel)) continue;
    /* 「푸른 분류」 머리줄의 초록은 «두 대시보드가 함께 쓰는» 색이라 그대로 둔다 */
    if (/dm-fsec/.test(sel)) continue;
    OLD.forEach(c => { if (m[2].indexOf(c) >= 0) bad.push(sel + ' -> ' + c); });
  }
  assert.deepEqual(bad, [], '옆줄 줄에 옛 색이 남아 있습니다');
});

test('★ 「나」 딱지가 옆줄과 같은 갈래다 — 혼자 보라면 그쪽만 딴 화면이다', () => {
  const tag = rulesFor('.meTag')[0];
  assert.ok(tag, '「나」 딱지 규칙이 없습니다');
  assert.ok(tag.body.indexOf('#7b4bd1') < 0, '「나」 딱지가 아직 보라입니다');
});

test('★ 갈래 머리줄(노무사·직원)이 «없다» — 한쪽에만 머리줄이 있으면 줄이 다시 짜인다', () => {
  /* 대표 지시 2026-08-29 「노무사 직원구분 없애고 항상 로그인하는 본인이 제일 위에」.
     담당자 쪽에만 머리줄이 셋(내 메일·노무사·직원) 있어, 칩을 누를 때마다 옆줄이
     통째로 다시 짜였다.
     ⚠ 되살리려면 «업무별 쪽에도 같은 머리줄»을 넣어야 한다 — 한쪽에만 넣으면
       오늘 고친 흔들림이 그대로 돌아온다. 그 말을 여기 남긴다. */
  assert.equal(rulesFor('.dm-whogrp').length, 0,
    '갈래 머리줄 규칙이 되살아났습니다 — 업무별 쪽에도 같은 머리줄이 있어야 합니다');
  /* ⚠ 주석을 걷고 본다 — 「여기 있던 자리다」라고 적어 둔 설명이 걸리면
       잘 쓴 주석 때문에 검사가 실패한다(2026-08-29 에 겪었다). */
  assert.ok(css.indexOf('dm-whogrp') < 0,
    '갈래 머리줄을 그리는 자리가 남아 있습니다');
});

test('★ 목록에 붙는 담당자 딱지도 옆줄과 같은 갈래 — 그 옆에 나란히 보이는 자리다', () => {
  const chip = rulesFor('.dm-who{')[0] || rulesFor('.dm-who')[0];
  assert.ok(chip, '담당자 딱지 규칙이 없습니다');
  assert.ok(chip.body.indexOf('#5b3a9c') < 0 && chip.body.indexOf('#f2ecfd') < 0,
    '옆줄은 파랑인데 목록의 담당자 딱지만 보라입니다');
});

test('★ 담당자 «기능 전체»에 보라가 안 남았다 — 옆줄만 파랑이고 그 화면은 보라면 반쪽이다', () => {
  /* 「담당 모름 정해 주기」·「자문사 이메일 잇기」·담당자 창은 옆줄에서 들어가는 자리다.
     옆줄만 맞추고 그 화면을 두면, 눌러 들어간 순간 다시 딴 화면이 된다.
     ⚠ 「메일 쓰기」의 문구 서랍(.edbtn.edtpl·.tplkeys, #5b3a9c)은 «그대로 둔다» —
       다른 화면의 다른 기능이고, 거기서는 눈에 띄라고 일부러 보라로 둔 것이다. */
  const GONE = ['#4c2a8f', '#7b4bd1'];
  const left = [];
  GONE.forEach(c => {
    let i = -1;
    while ((i = src.indexOf(c, i + 1)) >= 0) {
      const a = src.lastIndexOf('\n', i) + 1, b = src.indexOf('\n', i);
      left.push(c + '  ' + src.slice(a, b < 0 ? src.length : b).trim().slice(0, 70));
    }
  });
  assert.deepEqual(left, [], '담당자 기능에 보라가 남아 있습니다:\n  ' + left.join('\n  '));
});
