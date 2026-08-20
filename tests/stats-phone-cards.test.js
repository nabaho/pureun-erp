const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const work = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');

function phone520() {
  const at = work.indexOf('@media (max-width:520px)');
  assert.ok(at >= 0);
  const open = work.indexOf('{', at + 20);
  let depth = 0, i = open;
  for (; i < work.length; i++) {
    if (work[i] === '{') depth++;
    else if (work[i] === '}' && --depth === 0) break;
  }
  return work.slice(at, i + 1);
}

test('업무량은 폰에서 담당마다 카드로 선다 — 옆으로 밀지 않는다', () => {
  /* ★ 칸이 열이라 옆으로 밀어 보게 두면 오른쪽 끝에서 «담당 이름이 사라진다» —
     0% 와 75 만 늘어선 화면이 되어 누구 것인지 알 수 없다(대표 화면 2026-08-20). */
  const b = phone520();
  assert.match(b, /#stattbl thead\{display:none\}/);
  assert.match(b, /#stattbl tr\{display:flex;flex-wrap:wrap/);
  assert.match(b, /#stattbl table\{min-width:0!important/,
    '★ 표에 제 너비를 주면 카드가 아니라 다시 옆으로 미는 표가 됩니다.');
  assert.match(work, /id="stattbl"/, 'css 가 잡을 아이디가 없습니다.');
});

test('카드로 세워도 이름표를 잃지 않는다 — 머리(th)와 같은 말을 쓴다', () => {
  /* 표 머리를 감추므로 숫자마다 제 이름표가 붙어야 한다. 머리와 다른 말을 쓰면
     넓은 화면과 폰이 딴소리를 하게 된다. */
  const b = phone520();
  assert.match(b, /#stattbl td\[data-k\]::before\{content:attr\(data-k\)/);
  ['2주+ 방치', '기록 줄', '임박', '지남', '완료'].forEach(function (k) {
    assert.ok(work.includes("numTd('" + k + "'") || work.includes('data-k="기록률"'),
      k + ' 이름표가 없습니다.');
    assert.ok(work.includes(k), k + ' 가 표 머리에서 사라졌습니다.');
  });
});

test('0 인 칸은 접되 진행·기록률은 0 이어도 남긴다', () => {
  /* 「—」 가 늘어서면 카드가 산만해진다. 다만 진행 0·기록률 0% 는 «0 이라는 사실»
     자체가 볼 거리라 접으면 안 된다. */
  const b = phone520();
  assert.match(b, /#stattbl td\[data-empty\]\{display:none\}/);
  assert.match(work, /'<td data-k="'\+k\+'"'\+\(v\?'':' data-empty'\)/);
  /* 진행·기록률에는 data-empty 를 안 붙인다 — 접는 손잡이는 numTd 한 곳에서만 붙인다 */
  assert.match(work, /<td data-c="open"/);
  const stats = work.slice(work.indexOf('function renderStats'), work.indexOf('/* ── 보관함'));
  /* 실제로 «붙이는» 자리만 센다 — 풀이글(주석)에 적힌 것까지 세면 글을 못 적는다 */
  assert.equal((stats.match(/' data-empty'/g) || []).length, 1,
    '★ data-empty 를 numTd 밖에서도 붙이면 진행·기록률 0 까지 접힙니다.');
  assert.match(stats, /function numTd\(k,v,extra\)/, '숫자 칸을 한 곳에서 만들지 않습니다.');
});

test('넓은 화면의 업무량 표는 그대로다', () => {
  /* 카드는 폰에서만 — 열 칸짜리 표는 넓은 화면에서 한눈에 견주는 값어치가 있다. */
  const b = phone520();
  const at = b.indexOf('#stattbl');
  assert.ok(at > 0, '카드 규칙이 폰 구간 밖에 있습니다 — PC 까지 카드가 됩니다.');
  assert.match(work, /<th style="min-width:80px">담당<\/th>/, 'PC 표 머리가 사라졌습니다.');
});
