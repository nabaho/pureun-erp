'use strict';
/* ══════ 사람 색은 «한 곳»에서 정한다 ══════
   실행: node --test tests/*.test.js

   대표 지시(2026-08-30) 「푸른이알피 법인대시보드의 본인 색으로, 전체 시스템을
   일치시켜라 · 담당자 색으로 하되 연하게」.

   ■ 무엇이 문제였나
     ① 달력 칩은 «사람» 색이 아니라 컨설팅 «종류» 색이었다 — 기본 여덟 가운데
        주황·빨강이 셋이라 화면이 온통 붉었고, 정작 «누가 가는지»는 말해 주지 않았다.
        같은 일정을 타임라인은 담당자 색으로 칠했다 — 화면마다 색의 뜻이 달랐다.
     ② 색표가 둘이었다(컨설팅일정 여섯 · 푸른이알피 열하나).
     ③ 대표가 손수 고른 색은 «그 PC 브라우저»에만 있어 다른 앱이 볼 수가 없었다.

   ★ 여기서 못 박는 것
     · 정하는 곳은 «푸른이알피 한 곳». 컨설팅일정은 읽기만 한다.
     · 사람은 «사번»으로 맞춘다(이름은 동명이인·개명에 흔들린다).
     · 못 읽어도 화면은 돌아간다.
     · 「연하게」를 두 벌로 만들지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const GOV = fs.readFileSync(path.join(R, 'gov-consulting.html'), 'utf8');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const RULES = JSON.parse(
  fs.readFileSync(path.join(R, 'docs', 'firebase-rules-전체-적용본.json'), 'utf8')).rules;

function fnSrc(src, name) {
  const m = new RegExp('(?:^|\\n)((?:async )?function ' + name + '\\s*\\()').exec(src);
  assert.ok(m, '함수를 찾을 수 없습니다: ' + name);
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  let i = src.indexOf('{', start), d = 0, k = i;
  while (k < src.length) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) break; }
    k++;
  }
  return src.slice(start, k + 1);
}

/* 진짜 staffColor 를 태운다 */
function colorBox(shared) {
  const box = { console, _erpColors: shared || {}, String, Object };
  vm.createContext(box);
  vm.runInContext(fnSrc(GOV, 'staffColor'), box);
  return box;
}

test('★ 푸른이알피가 정한 색이 «이긴다» — 그것이 일치시킨다는 뜻이다', () => {
  const b = colorBox({ khh: '#2563eb' });
  assert.equal(b.staffColor({ erpSid: 'khh', color: '#c0392b' }), '#2563eb',
    '★ 컨설팅일정이 들고 있던 옛 색이 이깁니다 — 두 앱 색이 갈립니다');
});

test('★ 사번으로 맞춘다 — 이름으로 맞추면 동명이인·개명에 흔들린다', () => {
  const b = colorBox({ khh: '#2563eb' });
  const src = fnSrc(GOV, 'staffColor');
  assert.match(src, /erpSid/, '★ 사번을 안 씁니다');
  assert.doesNotMatch(src, /\.name/, '★ 이름으로 맞춥니다');
  /* 사번이 안 이어져 있으면 이 앱 색으로 떨어진다 */
  assert.equal(b.staffColor({ color: '#c0392b' }), '#c0392b');
});

test('★ 색표를 못 읽어도 화면은 돈다 — 색 하나 때문에 달력이 비면 안 된다', () => {
  const b = colorBox({});
  assert.equal(b.staffColor({ erpSid: 'khh', color: '#c0392b' }), '#c0392b');
  assert.ok(b.staffColor(null), '★ 사람이 없을 때 빈 색을 돌려줍니다');
  assert.ok(b.staffColor({}), '★ 색이 하나도 없을 때 빈 색을 돌려줍니다');
});

test('★ 달력 칩은 «사람» 색이다 — 종류 색이면 누가 가는지 알 수 없다', () => {
  const chip = fnSrc(GOV, 'chipHtml');
  assert.match(chip, /const col\s*=\s*staffColor\(att\)/, '★ 칩이 사람 색이 아닙니다');
  assert.doesNotMatch(chip, /ty\?\.color/, '★ 아직 컨설팅 종류 색을 씁니다');
});

test('★ 「연하게」는 gcalTint 하나로 — 두 벌이 되면 화면마다 달라진다', () => {
  const chip = fnSrc(GOV, 'chipHtml');
  assert.match(chip, /gcalTint\(col\)/, '★ 칩이 연한 바탕을 안 씁니다');
  /* 같은 일을 하는 함수를 새로 만들지 않았는가 */
  assert.doesNotMatch(GOV, /function softColor\s*\(/, '★ 연하게 만드는 함수가 둘입니다');
});

test('★ 연한 바탕 위에서 «글자가 읽힌다» — 열한 색을 실제로 돌려 본다', () => {
  /* 색은 사람이 고른다. 노랑·연두처럼 밝은 색에서 대비가 무너지면 안 된다. */
  const box = { console, Math, String, parseInt };
  vm.createContext(box);
  vm.runInContext([
    fnSrc(GOV, 'gcalHexToHsl'), fnSrc(GOV, 'gcalHslToHex'),
    fnSrc(GOV, 'gcalLum'), fnSrc(GOV, 'gcalRatio'), fnSrc(GOV, 'gcalTint')
  ].join('\n'), box);
  const PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#64748b',
    '#1e40af', '#4ade80', '#991b1b', '#fbbf24', '#854d0e', '#475569'];
  PALETTE.forEach(function (c) {
    const t = box.gcalTint(c);
    const r = box.gcalRatio(t.bg, t.fg);
    assert.ok(r >= 4.0, '★ ' + c + ' 에서 글자가 안 읽힙니다 (대비 ' + r.toFixed(2) + ')');
  });
});

test('★ 정하는 곳은 푸른이알피 «한 곳» — 컨설팅일정은 읽기만 한다', () => {
  /* 두 곳에서 정하면 언젠가 어긋나고, 그때 어느 쪽이 맞는지 아무도 모른다. */
  const code = GOV.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  /* ⚠ 색표 자리를 «가리키는 줄»을 모아, 그 가운데 쓰는 줄이 하나라도 있으면 걸린다.
     예전에는 한 줄짜리 set 을 놓쳤다 — 「어디에도 없다」를 좁게 물었기 때문이다. */
  const touch = code.match(/.*(ERP_COLOR_NODE|staff_colors).*/g) || [];
  const writes = touch.filter(function (l) { return /\.(set|update|push|remove)\s*\(/.test(l); });
  assert.deepEqual(writes, [], '★ 컨설팅일정이 색표에 씁니다: ' + writes.join(' | '));
  assert.match(code, /ERP_COLOR_NODE\s*\+\s*'\/v'\)\.on\(/, '★ 색표를 안 읽습니다');
});

test('★ 색 고르개는 «보기만» — 두 곳에서 정할 수 있으면 언젠가 어긋난다', () => {
  /* 대표 결정 2026-08-30 ④㉯. 색은 보이되 못 바꾸고, 어디서 정하는지 적어 둔다. */
  const vis = GOV.replace(/<!--[\s\S]*?-->/g, ' ');
  const picks = vis.match(/<input class="staff-color"[^>]*>/g) || [];
  assert.ok(picks.length >= 2, '색 고르개를 못 찾았습니다');
  picks.forEach(function (p) {
    assert.match(p, /\bdisabled\b/, '★ 아직 색을 바꿀 수 있습니다: ' + p.slice(0, 60));
    assert.match(p, /법인대시보드/, '★ 어디서 정하는지 안 알려 줍니다');
  });
  /* 색을 저장하던 길이 남아 있으면 언젠가 되살아난다 */
  assert.doesNotMatch(vis, /saveStaffField\([^)]*'color'/, '★ 색을 저장하는 길이 남아 있습니다');
});

test('★ 푸른이알피는 «다 푼 색»을 올린다 — 읽는 쪽이 순번을 흉내 내면 어긋난다', () => {
  /* 순번 색까지 함께 올려야, 직원이 드나들어 차례가 밀려도 두 앱이 같다. */
  const at = ERP.indexOf("dbSet('staff_colors'");
  assert.ok(at > 0, '★ 색표를 안 올립니다');
  /* ⚠ «올리는 그 덩이 안»만 본다 — 이 글귀는 파일 곳곳에 열여덟 번 나와서,
     그냥 찾으면 지켜 주는 것이 하나도 없다(2026-08-30 이빨 확인에서 잡았다). */
  const blk = ERP.slice(Math.max(0, at - 900), at);
  assert.match(blk, /CURRENT_USER && CURRENT_USER\.isAdmin/, '★ 쓸 수 없는 사람도 씁니다');
  /* 같으면 안 쓴다 — 화면을 그릴 때마다 부르는 자리다 */
  assert.match(blk, /JSON\.stringify\(was\) === JSON\.stringify\(staffColorMap\)/,
    '★ 같은 값을 또 씁니다(쓰기가 폭주합니다)');
});

test('★ 규칙에 이름이 있고, 쓰기는 «아무나»가 아니다', () => {
  const c = RULES.data && RULES.data.staff_colors;
  assert.ok(c, '★ data/staff_colors 가 규칙에 없습니다 — 이름 없는 자리로 떨어집니다');
  assert.match(String(c['.read']), /auth != null/, '★ 읽기가 안 열려 있습니다');
  assert.match(String(c['.write']), /isAdmin/, '★ 직원 누구나 남의 색을 바꿀 수 있습니다');
});
