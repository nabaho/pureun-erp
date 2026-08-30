'use strict';
/* 목록 아래 영역 — 쪽번호 · 보기설정 (대표 지시 2026-08-30, 다음메일 캡처3·4)
   "화면 가장아래에 다음개수 볼수 있게 해달라. 캡쳐3 과같이 모든 메일 아래 영역
    넣어달라. 캡쳐4도 넣어달라."

   ★ 여기서 못 박는 것
     ① 「앞에서 N통」이 아니라 «그 쪽»을 그린다 (쪽 넘김이 실제로 먹는다)
     ② 쪽수는 거르개가 걸리면 «받아 둔 것» 안에서만 센다
        (서버가 대신 걸러 주지 않으므로, 칸 전체 통수로 매기면 빈 쪽이 나온다)
     ③ 아직 안 받아 온 쪽을 누르면 «먼저 받아 온다» — 빈 화면이 나오면 안 된다
     ④ 쪽번호가 붙잡힌다 — 0쪽·99쪽을 눌러도 1..끝 안에 머문다
     ⑤ 지금 쪽은 «누를 수 없다» — 눌러도 아무 일이 안 나는 단추를 만들지 않는다
     ⑥ 보기설정 세 줄이 다 있다 — 목록개수 · 목록크기 · 보기방식
     ⑦ 목록개수는 «이미 있던 자리»(mbSetPageSize)를 부른다 — 두 벌이 되면 한쪽만 고쳐진다
     ⑧ 나눠 보기에서도 목록은 «한 쪽»만 그린다 — 그 상한이 속도의 뿌리다
     ⑨ ★ 「이름이 안 겹친다」는 여기 있었으나 `tests/no-dup-function-names.test.js` 로
        옮겼다 — 한 파일만 보다가 사진첩에서 같은 사고를 또 겪었다(loadImg).
        (여기서 잡힌 첫 사고는 mbGo 였다 — 겹쳐서 쪽 넘김이 통째로 안 먹었다)

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 걷고 본다 — 잘 쓴 «설명»이 검사를 통과시키면 안 된다 */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

function fnBody(name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  return src.slice(i, src.indexOf('\n}', i) + 2);
}

/* ══════ ⑨ 이름이 안 겹친다 — «저장소 전체» 검사로 옮겼다 ══════
   여기 있던 것은 pu-cards.html 한 파일만 봤다. 같은 사고를 사진첩(loadImg)에서
   또 겪어 `tests/no-dup-function-names.test.js` 로 넓혔다 — 그쪽이 이 파일도 본다.
   ⚠ 여기에 다시 쓰지 말 것. 같은 규칙이 두 곳에 있으면 언젠가 한쪽만 고쳐진다. */

/* ══════ ① 그 쪽을 그린다 ══════ */
test('★★ 「앞에서 N통」이 아니라 «그 쪽»을 그린다', () => {
  const fn = fnBody('mbVisibleRows');
  assert.match(fn, /slice\(\s*\(p-1\)\s*\*\s*n\s*,\s*p\s*\*\s*n\s*\)/,
    '★ 쪽을 안 건너뜁니다 — 2쪽을 눌러도 1쪽이 나옵니다');
  assert.match(fn, /state\.mbPage/, '★ 몇 쪽인지를 안 봅니다');
});

test('★ 칸·거르개·찾는 말이 바뀌면 «첫 쪽»으로 돌아간다', () => {
  const fn = fnBody('mbVisibleRows');
  assert.match(fn, /mbPageFor[\s\S]{0,120}state\.mbPage = 1/,
    '★ 딴 칸으로 옮겼는데 8쪽이 그려집니다 — 비어 보입니다');
});

/* ══════ ② 쪽수 세기 ══════ */
test('★★ 거르개가 걸리면 «받아 둔 것» 안에서만 쪽수를 센다', () => {
  const fn = fnBody('mbPageCount');
  assert.match(fn, /mbFiltering\(\)/,
    '★ 거르개를 안 봅니다 — 칸 전체 통수로 쪽을 매기면 눌러도 빈 쪽이 나옵니다');
  assert.match(fn, /Math\.ceil\(/, '★ 쪽수를 안 올림합니다 — 마지막 몇 통을 못 봅니다');
  assert.match(fn, /Math\.max\(1/, '★ 쪽수가 0이 될 수 있습니다');
  const f2 = fnBody('mbFiltering');
  assert.match(f2, /state\.mbFilter/, '★ 거르개를 안 봅니다');
  assert.match(f2, /state\.mbQ/, '★ 찾는 말을 안 봅니다');
});

/* ══════ ③④ 쪽 넘김 ══════ */
test('★★ 아직 안 받아 온 쪽을 누르면 «먼저 받아 온다»', () => {
  const fn = fnBody('mbPageGo');
  assert.match(fn, /loadMailBox\(/,
    '★ 안 받아 온 쪽을 눌러도 안 가져옵니다 — 빈 화면이 나옵니다');
  assert.match(fn, /mbBoxTotal\(\)\s*>\s*mbMatchedRows\(\)\.length/,
    '★ 더 있는지 안 따집니다 — 다 받아 왔는데도 서버를 또 부릅니다');
  assert.match(fn, /!mbFiltering\(\)/,
    '★ 거르개가 걸린 채로 더 받아 옵니다 — 서버는 안 걸러 주므로 헛걸음입니다');
});

test('★★ 쪽번호가 붙잡힌다 — 0쪽·99쪽을 눌러도 1..끝 안에 머문다', () => {
  const fn = fnBody('mbPageGo');
  assert.match(fn, /Math\.min\(Math\.max\(1[\s\S]{0,40}last\)/,
    '★ 없는 쪽으로 갑니다 — 빈 화면이 나옵니다');
});

/* ══════ ⑤ 지금 쪽 ══════ */
test('★★ 지금 쪽은 «누를 수 없다» — 눌러도 아무 일이 안 나는 단추를 만들지 않는다', () => {
  const fn = fnBody('mbPagerHtml');
  const i = fn.indexOf('i===p');
  assert.ok(i > 0, '지금 쪽을 가려내지 않습니다');
  /* ⚠ 「i===p 뒤 몇 글자」로 보면 안 된다 — 바로 뒤에 «아닐 때» 가지가 붙어 있어
       그 손잡이까지 함께 읽힌다. 지금 쪽이 만드는 글(<b class="on"…)만 집어 본다. */
  const on = fn.slice(fn.indexOf('<b class="on"', i));
  const tag = on.slice(0, on.indexOf('</b>'));
  assert.ok(tag.indexOf('onclick') < 0, '★ 지금 쪽에도 손잡이가 달려 있습니다: ' + tag);
  const r = src.indexOf('\n.dm-pg b.on{');
  assert.ok(r > 0, '.dm-pg b.on 규칙이 없습니다');
  assert.match(src.slice(r, src.indexOf('}', r)), /cursor:\s*default/,
    '★ 지금 쪽에 손 모양 커서가 뜹니다 — 눌리는 줄 압니다');
});

test('★ 끝에 닿으면 화살표를 «끈다»', () => {
  const fn = fnBody('mbPagerHtml');
  assert.match(fn, /off/, '★ 못 가는 쪽으로도 눌립니다');
  assert.match(fn, /p > 1/, '★ 첫 쪽에서도 «맨 앞»이 눌립니다');
  assert.match(fn, /p < last/, '★ 끝 쪽에서도 «맨 뒤»가 눌립니다');
});

test('★ 쪽이 하나뿐이면 쪽번호를 안 그린다 — 「1」만 있으면 무엇을 누르라는지 모른다', () => {
  const fn = fnBody('mbPagerHtml');
  assert.match(fn, /last > 1/, '★ 쪽이 하나여도 쪽번호가 나옵니다');
  /* 그래도 보기설정은 남아야 한다 — 몇 통씩 볼지는 늘 고칠 수 있어야 한다 */
  const i = fn.indexOf('return `<div class="dm-foot"');
  assert.ok(i > 0, '아래 영역을 안 그립니다');
  assert.match(fn.slice(i), /mbViewSetHtml\(\)/, '★ 쪽이 하나면 보기설정까지 사라집니다');
});

/* ══════ ⑥⑦ 보기설정 ══════ */
test('★★ 보기설정 세 줄이 다 있다 — 목록개수 · 목록크기 · 보기방식', () => {
  const fn = fnBody('mbViewSetHtml');
  for (const k of ['목록개수', '목록크기', '보기방식']) {
    assert.ok(fn.indexOf(k) > 0, '★ 「' + k + '」 줄이 없습니다 (다음메일 캡처4)');
  }
});

test('★★ 목록개수는 «이미 있던 자리»를 부른다 — 두 벌이 되면 한쪽만 고쳐진다', () => {
  const fn = fnBody('mbViewSetHtml');
  assert.match(fn, /mbSetPageSize\(/, '★ 새로 만든 길로 갑니다');
  assert.match(fn, /MB_SIZES\.map/, '★ 고를 수 있는 값을 따로 적었습니다');
});

test('★ 「보통」이 대표께서 고르신 크기다 — 기준을 딴 데 두면 되돌릴 곳이 없다', () => {
  const m = src.match(/const MB_DENSES\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(m, 'MB_DENSES 를 찾지 못했습니다');
  assert.match(m[1], /\[\s*''\s*,\s*'보통'\s*\]/,
    '★ 「보통」이 빈 값(=손 안 댄 기본)이 아닙니다 — 고르신 크기로 못 돌아갑니다');
  /* 작게·크게만 CSS 로 덮어쓴다 */
  assert.ok(src.indexOf('.dm-list.sm .dm-row{') > 0, '★ 「작게」 규칙이 없습니다');
  assert.ok(src.indexOf('.dm-list.lg .dm-row{') > 0, '★ 「크게」 규칙이 없습니다');
  assert.ok(src.indexOf('.dm-list. .dm-row{') < 0, '★ 「보통」에 덧칠하는 규칙이 있습니다');
});

test('★ 고른 것을 기억한다 — 새로고침마다 되돌아가면 아무도 안 쓴다', () => {
  for (const [fn, what] of [['mbSetDense', '목록크기'], ['mbSetViewMode', '보기방식']]) {
    assert.match(fnBody(fn), /localStorage\.setItem/, '★ ' + what + ' 를 안 기억합니다');
  }
});

/* ══════ ⑧ 나눠 보기 ══════ */
test('★★ 나눠 보기에서도 목록은 «한 쪽»만 그린다 — 그 상한이 속도의 뿌리다', () => {
  const fn = fnBody('mbBoxHtml');
  assert.match(fn, /mbListHtml\(\)/, '★ 목록을 딴 길로 그립니다');
  /* 목록을 그리는 자리는 여전히 mbVisibleRows(100통 상한)를 쓴다 */
  assert.match(fnBody('mbListHtml'), /mbVisibleRows\(\)/,
    '★ 상한 없이 그립니다 — 2026-08-29 에 고친 느림이 되살아납니다');
});

test('★★ 메일을 «안 열었을 때»는 안 나눈다 — 빈 칸을 절반 띄우면 목록만 좁아진다', () => {
  const fn = fnBody('mbBoxHtml');
  assert.match(fn, /if\(!state\.mbOpen\) return mbListHtml\(\);/,
    '★ 메일을 안 열어도 화면을 나눕니다');
});

test('★ 「목록만」은 예전과 같다 — 읽는 화면이 목록을 대신한다', () => {
  const fn = fnBody('mbBoxHtml');
  assert.match(fn, /'list'[\s\S]{0,40}return mbReadHtml\(\)/,
    '★ 「목록만」에서도 화면을 나눕니다');
});

test('★ 나눈 칸은 «각각» 굴린다 — 긴 본문에 목록이 밀려 올라가면 안 된다', () => {
  const i = src.indexOf('\n.dm-split .lst,.dm-split .rd{');
  assert.ok(i > 0, '나눈 칸 규칙이 없습니다');
  const r = src.slice(i, src.indexOf('}', i));
  assert.match(r, /overflow:\s*auto/, '★ 따로 안 굴러갑니다');
  assert.match(r, /max-height/, '★ 높이 한도가 없어 한없이 길어집니다');
});

test('★ 좁은 화면에서는 안 나눈다 — 반으로 갈라 봐야 둘 다 못 읽는다', () => {
  const m = src.match(/@media\(max-width:900px\)\{[\s\S]{0,400}?\n\}/);
  assert.ok(m, '좁은 화면 규칙이 없습니다');
  assert.match(m[0], /\.dm-split\{flex-direction:column\}/,
    '★ 폰에서도 좌우로 가릅니다');
});
