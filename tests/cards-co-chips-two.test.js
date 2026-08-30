'use strict';
/* 기업 상세 탭 줄은 「거래관계 여부」만 나눈다 (대표 지시 2026-08-28)
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시: 「기업상세 전체에 캡쳐1의 탭은 거래관계가 있었는지 여부만 나누면 된다」

   ■ 무엇이 문제였나
     탭 줄에 칩이 다섯이었다 — 거래처·전체·종료·번호없음·정보부족(+고유번호증).
     둘은 «어느 회사를 볼까»(고르기)이고 넷은 «할 일»(거르기)인데 한 줄에 섞여 있었다.
     그래서 대표 화면에서 「종료」를 켜자 거래처 16 · 전체 16 · 정보부족 16 —
     모든 수가 16으로 붙어 「데이터가 이상하다」로 보였다. 한 줄에 뜻이 둘이면
     서로의 수를 갉아먹는다.

   ■ 어떻게 나눴나
     · 탭 줄  = 「거래관계가 있었는가」 하나. 🏢 거래처 / 🏢 전체 둘뿐이다.
     · 옆줄   = 「할 일」. 종료·번호없음·정보부족·고유번호증을 옆줄로 내렸다.
       기능은 하나도 안 없앴다 — 자리만 옮겼다.

   ★ 여기서 못 박는 것
     ① 탭 줄에는 «거래처·전체»만 있다 (할 일 넷이 없다)
     ② 할 일 넷은 옆줄에 «그대로» 있다 — 기능이 사라지면 안 된다
     ③ 옆줄 할 일도 0곳이면 안 보인다 (누를 값이 없는 줄을 두지 않는다)
     ④ 옆줄 할 일을 눌러 켜고 끈다 · 첫 쪽으로 돌아온다
     ⑤ 두 곳이 «같은 state»를 본다 — 두 벌이면 한쪽만 고쳐진다
   실행: node --test tests/cards-co-chips-two.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

function constBody(name){
  const i = src.indexOf(LFCH + "const " + name + " = [");
  assert.ok(i >= 0, name + " 를 찾을 수 없습니다");
  const end = src.indexOf("];", i);
  return src.slice(i, end + 2);
}
const LFCH = String.fromCharCode(10);

/* 탭 줄 */
function drawTools(state){
  const ctx = { console, Object, Array, String, Number,
    esc: s => String(s==null?'':s),
    state: Object.assign({ coPageSize:100, coOnlyCares:true }, state||{}),
    coSizeSelHtml: () => '<select></select>',
    coScopeCounts: () => ({ cares: 312, all: 4147 }) };
  vm.createContext(ctx);
  /* 거르개 단추는 탭 줄이 부른다 — 세는 함수는 «안» 부른다(아래 검사가 그것을 지킨다) */
  
  vm.runInContext(fnBody('coFilters') + '\n' + fnBody('coFilterOnCount'), ctx);
  vm.runInContext(fnBody('coFilterBtnHtml'), ctx);
  vm.runInContext(fnBody('coToolsHtml'), ctx);
  return ctx.coToolsHtml();
}
/* 거르개 메뉴 — 옆줄에서 내려온 넷 (2026-08-31 대표 지시).
   메뉴를 «열어» 보고, 항목을 눌러 무슨 일이 일어나는지까지 본다. */
function drawFilterMenu(state, counts){
  const c = Object.assign({ closed:0, nobiz:0, lack:0, uid:0 }, counts||{});
  const box = { style:{}, innerHTML:"" };
  const ctx = { console, Object, Array, String, Number,
    esc: s => String(s==null?"":s),
    state: Object.assign({ coOnlyClosed:false, coOnlyNoBiz:false,
      coOnlyIncomplete:false, coOnlyUid:false, coPage:3 }, state||{}),
    coClosedCount: () => c.closed, coNoBizCount: () => c.nobiz,
    coIncompleteCount: () => c.lack, coUidCount: () => c.uid,
    closeFolderMenu(){}, renderCoAny(){ ctx.drew = (ctx.drew||0) + 1; },
    setTimeout(){}, document: { addEventListener(){} },
    window: { innerWidth: 1600 },
    $: () => box };
  vm.createContext(ctx);
  vm.runInContext(fnBody("coFilters"), ctx);
  vm.runInContext(fnBody("coFilterDefs"), ctx);
  vm.runInContext(fnBody("openCoFilterMenu"), ctx);
  ctx.openCoFilterMenu({ preventDefault(){}, stopPropagation(){},
    currentTarget: { getBoundingClientRect: () => ({ left:100, bottom:200 }) } });
  return { html: box.innerHTML, ctx: ctx };
}

/* ══════ ① 탭 줄에는 둘만 ══════ */

test('★ 탭 줄에 「거래처」와 「전체」가 있다', () => {
  const h = drawTools({});
  assert.ok(h.indexOf('거래처') > 0, '거래처 칩이 없다');
  assert.ok(h.indexOf('전체') > 0, '전체 칩이 없다');
  assert.ok(h.indexOf('312') > 0 && h.indexOf('4,147') > 0, '두 수가 다 보여야 고를 수 있다');
});

test('★ 탭 줄에 «할 일» 넷이 없다 — 한 줄에 뜻이 둘이면 서로의 수를 갉아먹는다', () => {
  /* ⚠ 도움말(title="…")은 걷어내고 본다. 지키는 것은 «칩이 없다»이지 «글자가 하나도
     없다»가 아니다 — 거르개 단추의 도움말에는 무엇이 들어 있는지 적혀 있어야 한다. */
  const h = drawTools({}).replace(/title="[^"]*"/g, '');
  ['종료', '번호 없음', '정보부족', '고유번호증'].forEach(function (label) {
    assert.equal(h.indexOf(label), -1,
      '★ 「' + label + '」이 탭 줄에 칩으로 남아 있다 — 대표 지시는 「거래관계 여부만」이다');
  });
});

test('탭 줄이 세는 함수도 «거래처·전체»뿐이다 — 넷을 세면 그만큼 4,147곳을 더 훑는다', () => {
  const fn = fnBody('coToolsHtml');
  ['coClosedCount', 'coNoBizCount', 'coIncompleteCount', 'coUidCount'].forEach(function (f) {
    assert.equal(fn.indexOf(f), -1, f + ' 를 탭 줄에서 아직 부른다');
  });
  assert.match(fn, /coScopeCounts\(\)/);
});

test('쪽 크기 고르기는 그대로 오른쪽 끝에 남는다', () => {
  const fn = fnBody('coToolsHtml');
  assert.match(fn, /margin-left:auto/);
  assert.match(fn, /coSizeSelHtml\(/);
});

/* ══════ ② 할 일 넷은 «거르개 메뉴»에 그대로 ══════ */

test('★ 할 일 넷이 거르개 메뉴에 «그대로» 있다 — 자리만 옮겼지 기능을 없앤 것이 아니다', () => {
  const r = drawFilterMenu({}, { closed:47, nobiz:88, lack:37, uid:3 });
  ['종료', '번호 없음', '정보부족', '고유번호증'].forEach(function (label) {
    assert.ok(r.html.indexOf(label) > 0, '★ 「' + label + '」이 거르개에도 없다 — 기능이 사라졌다');
  });
  ['47', '88', '37', '3'].forEach(function (n) {
    assert.ok(r.html.indexOf(n) > 0, n + '곳이라는 수가 안 보인다');
  });
});

test('★ 거르개가 «목록 위 줄에서» 열린다 — 함수만 있고 안 부르면 소용없다', () => {
  /* 옆줄에서 내려왔으니 이제 탭 줄이 그 단추를 내놓아야 한다. */
  assert.match(fnBody('coToolsHtml'), /coFilterBtnHtml\(\)/,
    '★ 목록 위 줄이 거르개 단추를 안 그린다 — 넷이 화면 어디에서도 안 보이게 된다');
  assert.match(fnBody('coFilterBtnHtml'), /openCoFilterMenu\(event\)/,
    '단추를 눌러도 메뉴가 안 열린다');
});

test('★ 옆줄에는 할 일이 «없다» — 폴더와 같은 것을 두 번 세면 어느 쪽이 진짜인지 모른다', () => {
  /* 대표 지시 2026-08-31: 「계약해지 사업장으로 분류하려는데 중복되어서 이상하다」.
     같은 17곳이 「2. 계약해지사업장」 폴더와 「할 일 · 종료」 두 군데 있었다. */
  const i = src.indexOf("if(state.view==='co'){");
  const end = src.indexOf("$('pcSide').innerHTML", i);
  assert.ok(i > 0 && end > i, '기업 상세 옆줄을 찾지 못했습니다');
  assert.equal(src.slice(i, end).indexOf('coTodoSideHtml('), -1,
    '★ 옆줄이 아직 할 일을 그린다 — 폴더와 겹쳐 보인다');
});

/* ══════ ③ 0곳이어도 «흐리게» 보인다 ══════ */

test('★ 0곳인 것도 메뉴에는 흐리게 남는다 — 열 때마다 항목이 달라지면 못 찾는다', () => {
  /* ⚠ 옛 규칙을 «일부러» 뒤집었다. 옆줄에 있을 때는 0곳이면 숨겼다(늘 보이는 자리라
     빈 줄이 눈에 거슬렸다). 메뉴는 열어야 보이는 자리라 규칙이 반대다. */
  const r = drawFilterMenu({}, { closed:0, nobiz:5, lack:0, uid:0 });
  ['종료', '번호 없음', '정보부족', '고유번호증'].forEach(function (label) {
    assert.ok(r.html.indexOf(label) > 0, label + ' 가 메뉴에서 사라졌다');
  });
  assert.match(row(r.html, '종료'), /fmoff/, '0곳인데 흐리게 안 보인다');
  assert.equal(/fmoff/.test(row(r.html, '번호 없음')), false, '5곳인데 흐리다');
});

/* ══════ ④ 눌러서 켜고 끈다 ══════ */

function row(html, label){
  const at = html.indexOf(label);
  assert.ok(at > 0, label + ' 줄이 없다');
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('</div>', at);
  return html.slice(start, end);
}

test('★ 저마다 켜고 끈다 · 첫 쪽으로 돌아온다', () => {
  const r = drawFilterMenu({}, { closed:47, nobiz:88, lack:37, uid:3 });
  [['종료','coOnlyClosed'], ['번호 없음','coOnlyNoBiz'],
   ['정보부족','coOnlyIncomplete'], ['고유번호증','coOnlyUid']].forEach(function (p) {
    const one = row(r.html, p[0]);
    assert.match(one, new RegExp('state\\.' + p[1] + '\\s*=\\s*!state\\.' + p[1]),
      p[0] + ' 가 눌러도 안 뒤집힌다 — 켜기만 되면 전체로 못 돌아온다');
    assert.match(one, /coPage\s*=\s*0/, p[0] + ' 가 쪽수를 안 되돌린다 — 5쪽에서 걸면 빈 화면이다');
  });
});

test('★ 지금 켜진 것이 눈에 보인다 — 메뉴 안에서도, 단추에서도', () => {
  const on = drawFilterMenu({ coOnlyClosed:true }, { closed:47, nobiz:88 });
  assert.match(row(on.html, '종료'), /✓/, '켜 놓고도 안 켜져 보인다');
  assert.equal(/✓/.test(row(on.html, '번호 없음')), false, '안 켠 것이 켜져 보인다');
  /* 단추 자체에도 몇 개 걸렸는지 숫자가 붙는다 — 메뉴를 열지 않아도 알 수 있어야 한다 */
  const btn = drawTools({ coOnlyClosed:true, coOnlyIncomplete:true });
  assert.match(btn, /거르개/, '거르개 단추가 없다');
  assert.match(btn, />2</, '걸린 수(2)가 단추에 안 붙는다');
});

/* ══════ ⑤ 두 곳이 같은 state 를 본다 ══════ */

test('★ 거르는 일은 coFilteredList 한 곳에만 둔다 — 옮겼다고 딴 곳에서 거르면 안 된다', () => {
  const fn = fnBody('coFilteredList');
  ['coOnlyCares', 'coOnlyClosed', 'coOnlyNoBiz', 'coOnlyIncomplete', 'coOnlyUid']
    .forEach(function (k) { assert.match(fn, new RegExp(k), k + ' 가 거르기에서 빠졌다'); });
  /* 옆줄은 «켜고 끄기»만 한다 — 회사 목록을 제 나름으로 거르면 화면마다 결과가 어긋난다.
     (세는 것은 coClosedCount 등에 맡기고, 그것들이 coFilteredList 를 거친다) */
  const side = fnBody('openCoFilterMenu') + fnBody('coFilterBtnHtml');
  ['coList(', 'coFilteredList(', 'coVisible('].forEach(function (bad) {
    assert.equal(side.indexOf(bad), -1,
      '★ 거르개가 «' + bad + '»으로 회사를 직접 훑는다 — 거르기는 한 곳에만 있어야 한다');
  });
});

test('★ 새 Firebase 쓰기가 없다 — 자리만 옮겼다', () => {
  const moved = fnBody('coFilterDefs') + fnBody('coFilterBtnHtml') + fnBody('openCoFilterMenu');
  assert.equal(/db\.ref\(|Store\.db|Store\.put|\.update\(/.test(moved), false);
});
