/* 외부기관 실적 — 번호 + 열 정렬 + 연도 순 (대표 지시 2026-08-30)
   「컨설팅 왼쪽에 넘버링과 열 정렬 하고 년도 정렬, 사업 그리고 수행기관 등
     각각 정리해서 정렬해라」

   ■ 무엇이 문제였나 (실측)
     줄을 display:flex 로 그려서, 고객사 이름 길이에 따라 사업명이 «줄마다 다른 자리»에서
     시작했다. 「(주)종합건축사사무소미당」 다음 줄은 「대흥실업」이라 사업명이 100px 넘게
     어긋났다 — 세로로 훑어 읽을 수가 없다.
     연도도 뒤죽박죽이라 「-」(연도 없음)가 맨 위에 몰려 있었다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const css = bare.slice(bare.indexOf('<style'), bare.lastIndexOf('</style>'));

/* ── 열이 줄을 선다 ── */

test('★ 줄을 «격자»로 그린다 — flex 면 고객사 길이에 따라 사업명이 밀린다', () => {
  const r = (css.match(/\.pa-row\{[^}]*\}/) || [])[0];
  assert.ok(r, '.pa-row 규칙이 있어야 합니다');
  assert.match(r, /display:grid/, 'flex 로는 열이 안 맞습니다');
  assert.match(r, /grid-template-columns:/, '열 너비를 못 박아야 줄이 섭니다');
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.doesNotMatch(fn, /display:flex;gap:6px;align-items:center;font-size:12px;padding:5px 0/,
    '옛 flex 줄이 남아 있습니다');
});

test('열 일곱 칸이 머리줄과 «같은 격자»를 쓴다 — 다르면 이름표가 어긋난다', () => {
  const r = (css.match(/\.pa-row\{[^}]*grid-template-columns:([^;]*);/) || [])[1];
  assert.ok(r, '열 정의를 찾지 못했습니다');
  assert.equal(r.trim().split(/\s+(?![^(]*\))/).length, 7, '№·유형·연도·고객사·사업명·담당자·출처 일곱 칸');
  /* 머리줄은 같은 .pa-row 를 쓰고 꾸밈만 덧댄다 — 따로 만들면 언젠가 어긋난다 */
  assert.match(bare, /class="pa-row pa-head"/);
  assert.ok((css.match(/\.pa-head\{[^}]*grid-template-columns/) || []).length === 0,
    '머리줄이 제 격자를 따로 가지면 안 됩니다');
});

test('긴 이름은 «…»으로 줄인다 — 줄바꿈되면 격자가 무너진다', () => {
  assert.match(css, /\.pa-c\{[^}]*text-overflow:ellipsis/);
  assert.match(css, /\.pa-c\{[^}]*white-space:nowrap/);
  assert.match(css, /\.pa-row>\*\{min-width:0\}/, 'grid 칸은 min-width:0 이라야 줄어듭니다');
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /title="'\s*\+\s*escapeHtml\(r\.org/, '잘린 이름은 마우스로 볼 수 있어야 합니다');
});

test('번호와 연도는 자릿수가 흔들리지 않는다', () => {
  assert.match(css, /\.pa-n\{[^}]*tabular-nums/);
  assert.match(css, /\.pa-y\{[^}]*tabular-nums/);
  assert.match(css, /\.pa-n\{[^}]*text-align:right/, '번호는 오른쪽 맞춤이라야 자릿수가 섭니다');
});

/* ── 번호 ── */

test('★ 컨설팅 왼쪽에 번호가 붙는다', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /class="pa-n">'\s*\+\s*\(i\+1\)/, '1부터 세어야 합니다');
  /* 번호가 «유형 딱지보다 앞»이어야 한다 — 오른쪽에 붙으면 「컨설팅 왼쪽」이 아니다 */
  const iN = fn.indexOf('class="pa-n">\' + (i+1)');
  const iTag = fn.indexOf('tag navy');
  assert.ok(iN > 0 && iTag > 0, '번호 칸과 유형 딱지를 찾지 못했습니다');
  assert.ok(iN < iTag, '번호가 유형 딱지 앞이어야 합니다');
});

/* ── 연도 순 ── */

test('★ 최근 해가 위로 — 연도가 «없는» 줄은 맨 뒤로', () => {
  /* 전에는 「-」가 맨 위에 몰려 있었다(대표 화면 실측 2026-08-30). */
  const fn = cutFn(bare, 'function _paOrder(');
  const _paOrder = new Function('return ' + fn)();
  const rows = [
    { year: '', org: '나중회사' }, { year: '2025', org: '나사' },
    { year: '2026', org: '가사' }, { year: '2025', org: '가사' }, { year: '', org: '가나회사' }
  ];
  const got = rows.slice().sort(_paOrder).map((r) => (r.year || '-') + ':' + r.org);
  assert.deepEqual(got, ['2026:가사', '2025:가사', '2025:나사', '-:가나회사', '-:나중회사']);
});

test('같은 해면 고객사 «이름 순» — 순서가 뒤죽박죽이면 번호를 붙여도 못 읽는다', () => {
  const _paOrder = new Function('return ' + cutFn(bare, 'function _paOrder('))();
  const got = [{ year: '2025', org: '하나' }, { year: '2025', org: '가나' }, { year: '2025', org: '다나' }]
    .sort(_paOrder).map((r) => r.org);
  assert.deepEqual(got, ['가나', '다나', '하나']);
});

test('빠진 값이 있어도 «터지지 않는다» — 실데이터에는 빈 칸이 흔하다', () => {
  const _paOrder = new Function('return ' + cutFn(bare, 'function _paOrder('))();
  assert.doesNotThrow(() => [{}, { year: null }, { org: undefined }, { year: '2025' }].sort(_paOrder));
});

test('그리는 쪽이 그 순서를 «실제로 쓴다» — 함수만 있고 안 쓰면 소용없다', () => {
  const fn = cutFn(bare, 'function renderPuAgency(');
  assert.match(fn, /\.sort\(_paOrder\)/);
  assert.match(fn, /g\.rows\.slice\(\)/, '원본 배열을 그 자리에서 뒤집으면 안 됩니다');
});

test('좁은 화면에서도 격자를 지킨다 — 줄바꿈되면 다시 어긋난다', () => {
  assert.match(css, /@media\(max-width:900px\)\{[\s\S]{0,160}\.pa-row\{grid-template-columns:/);
});
