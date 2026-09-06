'use strict';
/* 업체관리 — 대표자·계약시작·월자문료는 «한 줄»이다.
   실행: node --test tests/*.test.js

   대표 지시 2026-09-06: 「대표자와 계약시작일 월 자문료를 한 줄로 나오게 해달라」
   (앞선 지시 2026-08-30: 「데이터 정보 넣을 때 줄의 공간이 넓으면 2줄로 만들지 마라」)

   ── 왜 두 줄이 되었나 ────────────────────────────────────────────────
   폭을 정할 때 «안쪽 여백»을 빼먹었다. 칸 하나의 구조는 이렇다:
       td (여백 5px 8px = 16)  >  div.co-edit-cell (여백 2px 4px = 8)  >  글자
   그래서 글자가 쓸 수 있는 자리는 «칸 폭 − 24» 다. 16 만 빼고 잡은 탓에
   대표자 50px 은 글자 자리가 26px 뿐이라 「이상균」(34.5px)이 «이상 / 균» 으로,
   계약시작 72px 은 48px 뿐이라 「2007-03-01」(61px)이 «2007-03- / 01» 로 흘렀다.
   한 줄만 두 줄이 되어도 표 전체가 그만큼 길어진다 — 373줄이면 화면 한 장이 반이 된다.

   ── 두 가지를 함께 해야 한다 ──────────────────────────────────────────
   ① 폭을 값에 맞게 넓힌다 (실측: 대표자 70 · 계약시작 85 · 월자문료 78)
   ② 그래도 «줄바꿈 자체»를 막는다 — 폭만 넓히면 값이 조금 길어지는 날 도로 두 줄이 된다.
      .co-1line 이 그 일을 하고, 넘치면 … 로 자른 뒤 온값은 말풍선에 남긴다.
   ★ ② 는 «안쪽 co-edit-cell» 에 걸어야 한다. td 에만 걸면 그 안의 div 가 그대로 줄을 내린다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(R, 'css', 'pu-erp.css'), 'utf8').replace(/\r\n/g, '\n');
/* 주석에 적힌 글자에 속지 않는다 */
const bare = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

function widths(){
  const from = src.indexOf('var COMPANY_TABLE_WIDTHS = ');
  const to = src.indexOf('function coTableColgroup', from);
  assert.ok(from >= 0 && to > from, '폭표를 못 찾았습니다');
  const ctx = {}; vm.createContext(ctx);
  new vm.Script(src.slice(from, to)).runInContext(ctx);
  return ctx.COMPANY_TABLE_WIDTHS;
}

/* ══════ ① 줄바꿈을 막는 자리가 «안쪽»이다 ══════ */

test('★★ 한 줄 규칙은 안쪽 칸(co-edit-cell)에 건다 — td 에만 걸면 안 먹는다', () => {
  const m = css.match(/\.dt\.co-table td\.co-1line[^{]*\{[^}]*\}/);
  assert.ok(m, '★★ .co-1line 규칙이 없습니다 — 폭만 넓히면 값이 길어지는 날 도로 두 줄이 됩니다');
  assert.match(m[0], /\.co-edit-cell/,
    '★★ td 에만 걸었습니다. 값은 그 «안»의 div 에 있어서 그대로 줄을 내립니다');
  assert.match(m[0], /white-space:\s*nowrap/, '★★ 줄바꿈을 안 막습니다');
  assert.match(m[0], /text-overflow:\s*ellipsis/, '★ 넘칠 때 … 가 없으면 잘린 줄도 모릅니다');
  assert.match(m[0], /overflow:\s*hidden/, '★ overflow 가 없으면 … 가 안 나옵니다');
});

/* ══════ ② 세 칸에 실제로 붙어 있다 ══════ */

test('★★ 대표자·계약시작·월자문료 칸에 한 줄 규칙이 붙어 있다', () => {
  const 대표자 = bare.match(/h\('td',\s*\{[^}]*co-1line[^}]*\}[^]{0,400}?renderCell\(co,\s*'ceo'/g) || [];
  assert.equal(대표자.length, 2,
    '★★ 대표자 칸은 두 표(전체·사무대행)에 있습니다 — 붙은 것 ' + 대표자.length + '개');
  assert.match(bare, /h\('td',\s*\{[^}]*co-1line[^}]*\},\s*renderCell\(co,\s*'contractStartDate'/,
    '★★ 계약시작 칸에 한 줄 규칙이 없습니다');
  assert.match(bare, /h\('td',\s*\{[^}]*co-1line[^}]*\},\s*renderCell\(co,\s*'monthlyAdvisoryFee'/,
    '★★ 월자문료 칸에 한 줄 규칙이 없습니다');
});

test('★ 잘릴 수 있는 칸은 모두 말풍선에 온값을 남긴다 — 자르되 감추지 않는다', () => {
  /* 폭은 «오늘의» 값에 맞춘 것이다. 내일 더 긴 값이 들어오면 … 로 잘리는데,
     그때 말풍선까지 없으면 어디서도 못 읽는다(월자문료는 «돈» 이라 특히 그렇다). */
  const start = bare.match(/renderCell\(co,\s*'contractStartDate'[^]{0,260}?\}\)/);
  assert.ok(start && /tipTitle:/.test(start[0]),
    '★ 계약시작 칸이 잘렸을 때 온날짜를 볼 곳이 없습니다');
  const fee = bare.match(/renderCell\(co,\s*'monthlyAdvisoryFee'[^]{0,300}?\}\)/);
  assert.ok(fee && /tipTitle:/.test(fee[0]),
    '★★ 월자문료가 잘렸을 때 온금액을 볼 곳이 없습니다 — 돈은 반드시 읽을 수 있어야 합니다');
});

/* ══════ ③ 폭이 값을 담는다 (안쪽 여백 8px 까지 세어서) ══════ */

test('★★ 세 칸의 폭이 «값 + 여백 24px» 를 담는다', () => {
  const w = widths();
  /* 아래 숫자는 값 373건을 화면과 같은 글꼴로 «재어» 나온 것이다(2026-09-06).
     크거나 같은지만 보므로 나중에 더 넓혀도 안 깨진다. */
  assert.ok(w.full[10] >= 70,   // 검사고정-허용: 실측 — 세 글자 이름 34.5px + td 16 + 안쪽 8
    '★★ 대표자 칸이 좁아 「이상균」이 두 글자·한 글자로 쪼개집니다 (지금 ' + w.full[10] + 'px)');
  assert.ok(w.suboffice[8] >= 70, // 검사고정-허용: 같은 값(사무대행 표)
    '★★ 사무대행 표의 대표자 칸도 같이 넓혀야 합니다 (지금 ' + w.suboffice[8] + 'px)');
  assert.ok(w.full[21] >= 85,   // 검사고정-허용: 실측 — 「2007-03-01」 61px + 24
    '★★ 계약시작 칸이 좁아 날짜가 두 줄로 흐릅니다 (지금 ' + w.full[21] + 'px)');
  assert.ok(w.full[23] >= 78,   // 검사고정-허용: 실측 — 「220,000원」은 고정폭 글꼴이라 54px + 24
    '★★ 월자문료 칸이 좁아 금액이 두 줄로 흐릅니다 (지금 ' + w.full[23] + 'px)');
});

test('폭표의 자리번호가 정말 그 칸이다 — 머리글 차례로 확인한다', () => {
  /* ⚠ 위 검사가 «엉뚱한 자리»를 넓히고도 통과하면 아무것도 못 지킨다.
     머리글이 실제로 그 차례에 있는지 함께 본다. */
  const head = bare.slice(bare.indexOf("key:'a0'"), bare.indexOf("key:'a19'"));
  const order = ['a0','a1','a1n','a2','a3','a4','a5','a6','a6b','a6c','a7'];
  let at = -1;
  order.forEach(function(k, i){
    const p = head.indexOf("key:'" + k + "'");
    assert.ok(p > at, '머리글 차례가 어긋났습니다: ' + k);
    at = p;
  });
  assert.match(head.slice(head.indexOf("key:'a7'")), /^[^]{0,80}?'대표자'/,
    '★ 11번째(자리 10) 칸이 대표자가 아닙니다 — 폭표의 자리번호를 다시 세십시오');
  assert.match(head.slice(head.indexOf("key:'a15'")), /^[^]{0,300}?'계약시작'/,
    '★ 계약시작 칸의 차례가 바뀌었습니다');
  assert.match(head.slice(head.indexOf("key:'a17'")), /^[^]{0,300}?'월자문료'/,
    '★ 월자문료 칸의 차례가 바뀌었습니다');
});

/* ══════ ④ 대표자 둘이어도 한 줄 · 온이름은 말풍선에 ══════ */

test('★★ 대표자가 둘이어도 위아래로 쌓지 않는다', () => {
  assert.doesNotMatch(bare, /renderCell\(co,\s*'ceo2'[^]{0,120}?marginTop/,
    '★★ 둘째 대표자를 아랫줄로 내렸습니다 — 그 한 줄 때문에 표 전체가 두 배로 길어집니다');
  assert.doesNotMatch(bare, /marginTop:'2px'\s*\}\s*\},\s*renderCell\(co,\s*'ceo2'/,
    '★★ 둘째 대표자가 아랫줄에 있습니다');
  const two = bare.match(/co\.ceo2\s*\?[^]{0,400}?renderCell\(co,\s*'ceo2'/g) || [];
  assert.equal(two.length, 2, '두 표 모두 둘째 대표자를 한 줄에 그려야 합니다');
  two.forEach(function(seg, i){
    assert.match(seg, /display:'flex'/,
      (i + 1) + '번째 대표자 칸이 둘을 나란히 두지 않습니다');
  });
});

test('★★ 잘려도 온이름은 말풍선에서 읽는다', () => {
  const from = src.indexOf('function coCeoTip(co){');
  assert.ok(from >= 0, '★★ 대표자 말풍선을 만드는 곳이 없습니다');
  const ctx = {}; vm.createContext(ctx);
  new vm.Script(src.slice(from, src.indexOf('\n}', from) + 2)
    + '\nthis.coCeoTip = coCeoTip;').runInContext(ctx);
  const tip = ctx.coCeoTip;
  assert.match(tip({ ceo: '하태주, XUXINGLIANG' }), /하태주, XUXINGLIANG/,
    '★★ 긴 이름이 … 로 잘리는데 말풍선에도 없으면 어디서도 못 읽습니다');
  assert.match(tip({ ceo: '김승기', ceo2: '김기창' }), /김승기 · 김기창/,
    '★ 둘일 때 두 이름이 다 나와야 합니다');
  assert.equal(tip({}), '더블클릭으로 편집', '값이 없을 때는 원래 안내만 남깁니다');
  assert.equal(tip({ ceo2: '김기창' }), '김기창 — 더블클릭으로 편집',
    '첫째가 비어 있어도 둘째는 보여야 합니다');
  /* 세 칸 모두 말풍선을 넘긴다 */
  assert.equal((bare.match(/tipTitle:\s*coCeoTip\(co\)/g) || []).length, 6,
    '두 표 × (한 사람·둘 중 첫째·둘째) = 6 자리에 말풍선이 붙어야 합니다');
});

/* ══════ ⑤ 고친 CSS 가 화면에 닿는다 ══════ */

test('CSS 를 고쳤으니 캐시 번호가 올라가 있다', () => {
  const m = src.match(/css\/pu-erp\.css\?v=(\d+)/);
  assert.ok(m, '스타일 캐시 번호가 없습니다');
  assert.ok(Number(m[1]) >= 6,   // 검사고정-허용: 이 변경이 들어간 판
    '★★ 캐시 번호를 안 올리면 브라우저가 «옛 스타일»을 써서 화면은 그대로 두 줄입니다');
});
