'use strict';
/* 기업 상세 — 탭 줄과 쪽 크기 고르기를 «한 줄»로, 사업자와 같은 모양
   ═══════════════════════════════════════════════════════════════════════════
   대표 화면 2026-08-24: 「화면 중간에 이상하다 깔끔하게 사업자와 똑같은 형태로 다시 만들어라」

   무엇이 이상했나: 기업 상세는 탭 줄(＃ 전체 180 · ＋ 탭 만들기) «아래»에 따로 만든
   줄(모두 180곳 · 지금 1–100번째 · 100개▾)이 있었고, 그 아래 또 쪽 옮기기 줄이 있었다 —
   표 위에 줄이 셋이었다. 사업자·명함은 탭 줄 «한 줄»에 몇 개씩 볼지 등 도구가 오른쪽에
   나란히 있다(#pcHead 가 flex 라 #pcErpTabs 와 #pcTools 가 한 줄에 나온다. 기업 상세는
   #pcTools 가 CSS 로 꺼져 있어(#pcHead.cohead>#pcTools{display:none}) 따로 만든 것이다).

   ★ 여기서 못 박는 것
     ① 쪽 크기 고르기(coSizeSelHtml)가 탭 줄(renderCoFTabsHtml) «안»에 있다
     ② 탭 줄 안에서 오른쪽 끝으로 밀린다(margin-left:auto) — 사업자의 #pcTools 와 같은 자리
     ③ 표 위에 있던 별도 줄(모두 N곳 · 지금 1–N번째)이 사라졌다
     ④ 표 위의 쪽 옮기기(맨 위 것)도 사라졌다 — 사업자에는 그런 줄이 없다
     ⑤ 표 «아래» 쪽 옮기기는 그대로 남는다 — 사업자도 표 아래에는 있다
     ⑥ 몇 개씩 볼지 고르면 그대로 반영된다 (기능은 그대로, 자리만 바뀐다)
   실행: node --test tests/cards-co-header-row.test.js */
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

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
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* renderCoFTabsHtml 을 실제로 돌려 나온 HTML 을 본다 — 주석 속 글자(예: 「margin-left:auto
   를 준 조각을」)를 소스에서 그냥 찾으면 «설명 문장»과 «실제 코드»를 구별 못 한다.
   실제로 한 번 이 함정에 걸렸다: margin-left:auto 를 코드에서 지웠는데, 바로 위 주석에
   같은 글자가 있어 검사가 통과해 버렸다. */
function renderTabsRow(state, cos){
  const ctx = { console, Object, Array, String, Number, Math, esc,
    state: Object.assign({ coFolder:'f1', coFTab:'', isAdmin:true, coPageSize:100 }, state || {}),
    _coFolders: { f1: { id:'f1', name:'업체관리' } },
    coList: () => cos || [],
    coSizeSelHtml: sz => '<select class="copgsize" onchange="coSetPageSize(this.value)">'
      + '<option value="' + sz + '" selected>테스트</option></select>',
    /* 2026-08-24: 종료 토글이 탭 줄에 붙었다 — 이 파일은 쪽 크기 자리만 보므로 0곳으로 둔다 */
    coClosedCount: () => 0,
    /* 2026-08-24(2순위): 탭 줄에 「번호 없음」 토글도 붙었다 — 이 검사들은
       그 부분을 안 보므로 0곳으로 둔다(안 넣으면 renderCoFTabsHtml 이 던진다). */
    coNoBizCount: () => 0,
    /* 2026-08-24(3순위): 탭 줄에 「정보부족」 토글도 붙었다 — 이 검사들은 그 부분을
       안 보므로 0곳으로 둔다(안 넣으면 renderCoFTabsHtml 이 던진다). */
    coIncompleteCount: () => 0,
    /* 2026-08-27: 도구줄에 「🏢 거래처 / 🏢 전체」 두 칩이 붙었다 — 이 검사는 안 본다 */
    coScopeCounts: () => ({ cares: 0, all: 0 }),
    /* 2026-08-26: 도구줄에 「🏢 고유번호증」 단추도 붙었다 — 이 검사는 그 부분을
       안 보므로 0곳으로 둔다(안 넣으면 coToolsHtml 이 던진다). */
    coUidCount: () => 0,
    /* 2026-08-26: 도구줄이 「전체」에서도 나오게 갈라지면서, 개수 글귀도 이 줄에 붙었다.
       이 검사들은 그 글귀를 안 보므로 빈 대역을 준다(안 넣으면 coToolsHtml 이 던진다). */
    coPagerHtml: () => '', coPage: () => ({ page:0, pages:1, total:0, from:0, to:0 }),
  };
  vm.createContext(ctx);
  const a = '/* ══════ 폴더 안의 탭 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 폴더 안의 탭 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  vm.runInContext(src.slice(i, j) + '\n' + fnBody('coFTabChipsHtml') + '\n' + fnBody('coFilters') + '\n' + fnBody('coFilterOnCount') + '\n' + fnBody('coFilterBtnHtml') + '\n' + fnBody('coToolsHtml') + '\n' + fnBody('renderCoFTabsHtml'), ctx);
  return ctx.renderCoFTabsHtml();
}

/* ══════ ① · ② 쪽 크기 고르기가 탭 줄 안, 오른쪽 끝에 ══════ */

test('★ 쪽 크기 고르기가 탭 줄에 «실제로» 나온다', () => {
  const h = renderTabsRow();
  assert.match(h, /class="copgsize"/,
    '★ 사업자처럼 한 줄에 나오려면 탭 줄 함수가 실제로 만들어 내야 한다');
});

test('★ 쪽 크기 고르기가 오른쪽 끝으로 밀려 있다 — 사업자의 #pcTools 와 같은 자리', () => {
  const h = renderTabsRow();
  const i = h.indexOf('class="copgsize"');
  /* ⚠ 거리를 넓게 잡는다 — 2026-08-31 에 이 앞으로 「🔎 거르개」 단추가 들어왔다.
     지키는 것은 «오른쪽으로 미는가»이지 몇 자 앞에 있는가가 아니다. */
  const before = h.slice(Math.max(0, i - 400), i);
  assert.match(before, /margin-left:\s*auto/,
    '★ 밀지 않으면 탭 옆에 바짝 붙어 사업자의 오른쪽 정렬과 달라 보인다');
});

/* ══════ ③ · ④ 표 위의 옛 줄들이 사라졌다 ══════ */

test('★ 「모두 N곳 · 지금 1–N번째」 줄이 없어졌다', () => {
  const fn = fnBody('coListHtml');
  assert.equal(fn.indexOf('class="copgbar"'), -1,
    '★ 옛 줄(copgbar)이 남아 있다 — 탭 줄의 개수와 겹쳐 보인다');
  assert.equal(fn.indexOf('번째</b>'), -1, '「지금 1–N번째」 글자가 남아 있다');
});

test('★ 표 위의 쪽 옮기기가 없어졌다 — 사업자에는 그런 줄이 없다', () => {
  const fn = fnBody('coListHtml');
  const table = fn.indexOf('<table class="cotbl"');
  assert.ok(table > 0, '표를 찾지 못했습니다');
  const before = fn.slice(0, table);
  assert.equal(before.indexOf('coPagerHtml('), -1,
    '★ 표보다 앞에 쪽 옮기기가 남아 있다 — 사업자 화면과 다른 모양이 된다');
});

/* ══════ ⑤ 표 아래 쪽 옮기기는 그대로 ══════ */

test('쪽 옮기기가 여전히 있다 — 아예 없애면 다음 쪽으로 못 간다', () => {
  /* 2026-08-26: 표 «안»에서 안 구르는 바닥(renderCoPage 의 .cofoot)으로 옮겼다.
     표와 함께 굴러가면 200줄 아래로 숨어 4,143곳에서는 못 본다. */
  assert.match(fnBody('renderCoPage'), /coPagerHtml\(info\)/,
    '★ 쪽 옮기기가 없으면 다음 쪽으로 갈 길이 없다');
  assert.equal(fnBody('coListHtml').indexOf('coPagerHtml('), -1,
    '표 안에 남아 있으면 두 곳에 나온다');
});

test('쪽 옮기기 호출이 «한 곳»뿐이다 — 위·아래 두 벌로 만들지 않는다', () => {
  /* 그리는 자리가 둘이면 같은 글귀가 두 번 나오고 4,143곳을 두 번 거른다 */
  const n = (fnBody('renderCoPage') + fnBody('coListHtml') + fnBody('coToolsHtml'))
    .split('coPagerHtml(').length - 1;
  assert.equal(n, 1, '쪽 옮기기가 ' + n + '곳에서 불린다 — 하나여야 한다');
});

/* ══════ ⑥ 기능은 그대로 ══════ */

test('쪽 크기를 고르면 이미 있는 coSetPageSize 를 그대로 부른다', () => {
  assert.match(fnBody('coSizeSelHtml'), /coSetPageSize\(/,
    '★ 새 길을 만들면 두 벌이 된다 — 이미 있는 것을 그대로 써야 한다');
});

test('폴더를 안 골라도 개수 고르기는 나온다 — 탭 칩만 폴더에 딸린다', () => {
  /* ⚠ 2026-08-26 에 «뒤집힌» 결정이다. 예전에는 폴더가 없으면 이 줄이 통째로
     빈 값이었고, 이 검사가 그것을 못 박고 있었다. 그런데 그 바람에 「전체」에서
     개수 고르기·종료·번호없음·정보부족 넷이 다 사라져, 4,143곳을 보면서
     몇 개씩 볼지 고를 길이 없었다(대표 화면 2026-08-26).
     이제 탭 «칩»만 폴더에 딸리고, 도구는 늘 나온다. */
  const fn = fnBody('renderCoFTabsHtml');
  assert.ok(fn.indexOf("if(!f) return ''") < 0, '폴더가 없다고 도구까지 없애면 안 된다');
  assert.match(fn, /f \? coFTabChipsHtml\(f\) : ''/, '칩만 폴더에 딸려야 한다');
  assert.match(fn, /coToolsHtml\(\)/, '도구는 늘 이어 붙여야 한다');
  assert.match(fnBody('coToolsHtml'), /coSizeSelHtml\(/, '개수 고르기는 도구 쪽에 있다');
});
