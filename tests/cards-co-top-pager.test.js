'use strict';
/* 기업 상세 — 쪽 옮기기를 «위에도» 둔다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「캡쳐2 부분 캡쳐3 아래에도 넣어달라」
   (캡쳐2 = 명함 표의 「◀ 이전 1–100 / 6,282개 (1/63쪽) 다음 ▶」 / 캡쳐3 = 기업 상세)

   조사해서 알아낸 것: 기업 상세 «맨 아래»에는 이미 쪽 옮기기가 있다
   (coListHtml 끝의 coPagerHtml(info)). 없던 것은 «위»다. 위쪽 띠(copgbar)에는
   「모두 4,143곳 · 지금 1–100번째」와 몇 개씩 고르는 칸만 있었다.
   한 쪽이 100~500줄이라, 다음 쪽으로 가려면 화면을 한참 내려야 했다.

   ★ 여기서 못 박는 것
     ① 위쪽 띠에 ◀ 이전 · 다음 ▶ 와 「몇 쪽 중 몇 쪽」이 있다
     ② 맨 아래 것은 «그대로» 남는다 (내려간 자리에서 다음 쪽으로 갈 수 있어야 한다)
     ③ 한 쪽밖에 없으면 아무 것도 안 보인다 (누를 수 없는 단추를 두지 않는다)
     ④ 위·아래가 «같은 함수»를 쓴다 — 두 벌로 만들면 한쪽만 고친다
   실행: node --test tests/cards-co-top-pager.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 중괄호를 세어 자른다 — 한 줄 함수도 안전하다 */
function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

/* ══════ ④ 위·아래가 같은 함수 ══════ */

test('★ 표 «앞»에도 쪽 옮기기가 있다 — 100줄을 내려가지 않아도 다음 쪽으로 간다', () => {
  const fn = fnBody('coListHtml');
  const bar = fn.indexOf('class="copgbar"');
  const table = fn.indexOf('<table class="cotbl"');
  const first = fn.indexOf('coPagerHtml(');
  assert.ok(bar > 0 && table > bar, '위쪽 띠와 표를 찾지 못했습니다');
  assert.ok(first > bar && first < table,
    '★ 쪽 옮기기가 표보다 앞에 없다 — 위쪽에서는 쪽을 못 옮긴다');
});

test('★ 위쪽도 아래와 «같은» 함수를 쓴다 — 두 벌이면 한쪽만 고친다', () => {
  const fn = fnBody('coListHtml');
  const table = fn.indexOf('<table class="cotbl"');
  const top = fn.slice(0, table);
  assert.ok(top.indexOf('◀ 이전') < 0 && top.indexOf('다음 ▶') < 0,
    '★ 위쪽 띠가 제 단추를 손으로 만들었다 — 아래와 글귀·동작이 갈라진다');
});

test('아래쪽 쪽 옮기기는 그대로 남아 있다', () => {
  const fn = fnBody('coListHtml');
  /* 표가 끝난 «뒤»에 하나 더 있어야 한다 */
  const tbl = fn.lastIndexOf('</tbody></table>');
  assert.ok(tbl > 0, '표의 끝을 찾지 못했습니다');
  assert.match(fn.slice(tbl), /coPagerHtml\(/,
    '★ 아래 것을 없애면 100줄을 다 올라와야 다음 쪽으로 갈 수 있다');
});

test('쪽 옮기기가 두 곳에서 불린다 — 위와 아래', () => {
  const n = fnBody('coListHtml').split('coPagerHtml(').length - 1;
  assert.equal(n, 2, '쪽 옮기기가 ' + n + '곳에서 불린다 (위·아래 두 곳이어야 한다)');
});

/* ══════ ① · ③ 실제로 그려 본다 ══════ */

function pager(total, page, size){
  const ctx = { console, Math, Number, String, Array, Object };
  vm.createContext(ctx);
  /* pageStep 은 function 이 아니라 const 화살표다 — 줄째로 떠서 var 로 바꿔 넣는다
     (vm 에서 맨 위 const 는 context 속성이 안 된다) */
  const step = src.match(/^const pageStep = .*$/m);
  assert.ok(step, 'pageStep 을 찾지 못했습니다');
  vm.runInContext(
    'var LIST_PAGE_DEFAULT = 100;\n' +
    step[0].replace(/^const /, 'var ') + '\n' +
    fnBody('pageCount') + '\n' + fnBody('pageClamp') + '\n' +
    fnBody('pageSlice') + '\n' + fnBody('pagerHtml') + '\n' + fnBody('coPagerHtml'), ctx);
  const list = []; for (let i = 0; i < total; i++) list.push({ key: 'k' + i });
  return { html: ctx.coPagerHtml(ctx.pageSlice(list, page, size)), info: ctx.pageSlice(list, page, size) };
}

test('★ 여러 쪽이면 ◀ 이전 · 다음 ▶ 와 「몇 쪽 중 몇 쪽」이 나온다', () => {
  const r = pager(4143, 0, 100);
  assert.ok(r.html.indexOf('◀ 이전') > 0, '이전 단추가 없다');
  assert.ok(r.html.indexOf('다음 ▶') > 0, '다음 단추가 없다');
  assert.ok(r.html.indexOf('/42쪽') > 0, '★ 몇 쪽 중 몇 쪽인지 안 알려 준다: ' + r.html);
  assert.ok(r.html.indexOf('4,143곳') > 0, '전체 곳수가 없다');
  assert.ok(r.html.indexOf('1–100') > 0, '지금 몇 번째인지 없다');
});

test('첫 쪽에서는 ◀ 이전을 못 누른다', () => {
  assert.match(pager(4143, 0, 100).html, /disabled[\s\S]*◀ 이전/,
    '누를 수 없어야 하는데 눌린다 — 누르면 아무 일도 안 나 고장으로 보인다');
});

test('마지막 쪽에서는 다음 ▶ 을 못 누른다', () => {
  const r = pager(4143, 41, 100);
  const i = r.html.indexOf('다음 ▶');
  assert.ok(/disabled/.test(r.html.slice(Math.max(0, i - 120), i)), '마지막 쪽에서 다음이 눌린다');
});

test('★ 한 쪽밖에 없으면 아무 것도 안 보인다', () => {
  assert.equal(pager(30, 0, 100).html, '',
    '★ 쪽이 하나인데 단추를 두면 누를 수 없는 단추가 화면을 차지한다');
  assert.equal(pager(0, 0, 100).html, '', '회사가 없을 때도 안 보여야 한다');
});

test('「전체」로 보면 한 쪽이 되어 사라진다', () => {
  assert.equal(pager(4143, 0, 999999).html, '');
});
