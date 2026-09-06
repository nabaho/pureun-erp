'use strict';
/* 자문사 «한 번에» 고르기 — node --test tests/home-partner-pick.test.js
 *
 * 대표 지시 2026-09-05 「자문사 현황은 여기 화면에서 찾아보기 힘들다.
 *   팝업으로 확인하고 ㅁ에 체크해서 한 번에 넣는 게 좋은 건지」 → 2026-09-06 「가」.
 *
 * ★ 왜 만들었나 — 272곳을 한 곳씩 눌러 고르게 되어 있었고, 그래서 올림이 «0곳»이었다.
 *   화면이 있어도 아무도 못 쓴 것이다.
 *
 * ★ 이 검사가 지키는 것
 *   ① 거래가 끝난 곳은 고르는 창에도 안 나온다
 *   ② 열면 «지금 올라가 있는 것»이 체크돼 있다 (고르는 창이자 보는 창이다)
 *   ③ 체크를 풀면 내려간다
 *   ④ 안 고른 것을 «건드리지 않는다» — 남이 적어 둔 사유가 날아가면 안 된다
 *   ⑤ 통째로 덮지 않는다 (update 로 «적은 열쇠만»)
 *   ⑥ 커서와 굴린 자리가 안 튄다
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

/* 주석은 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시키면 아무것도 안 지킨다 */
function 알맹이(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const H = 알맹이(RAW);

function 함수(이름) {
  const i = H.search(new RegExp('(?:async )?function ' + 이름 + '\\('));
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았다');
  const j = H.indexOf('\nfunction ', i + 5);
  const k = H.indexOf('\nasync function ', i + 5);
  const 끝 = Math.min(j < 0 ? H.length : j, k < 0 ? H.length : k);
  return H.slice(i, 끝);
}

/* ── 고르는 셈만 떼어 실제로 «돌려» 본다 ──
   글자로만 보면 「안 건드린다」 같은 규칙은 확인할 길이 없다.
   ⚠ 새 pick* 함수를 만들면 여기에도 넣을 것 — 안 넣으면 「못 찾았다」로 한꺼번에 깨진다. */
function 상자(회사들, 표시들) {
  const ctx = {
    App: { companies: 회사들, partners: 표시들 || {} },
    Pick: { open: false, sel: {}, q: '', type: '', saving: false, err: '' },
    POSTED_TEXT: { yes: '올림', no: '안 올림', '': '표시 안 함' },
    currentUserName: () => '권형하',
    todayString: () => '2026-09-06',
    /* 떼어 온 조각 끝에 «window.x = x» 가 붙어 온다 — 받아 줄 그릇을 둔다 */
    window: {}
  };
  vm.createContext(ctx);
  ['partnerMark', 'postedOf', 'partnerRows', 'pickRows', 'pickVisible', 'pickTypes',
   'pickChanges', 'openPartnerPick'].forEach(n => vm.runInContext(함수(n), ctx));
  /* openPartnerPick 은 그리기까지 부른다 — 셈만 볼 것이므로 그리기는 삼킨다 */
  vm.runInContext('function renderPartnerPick(){}', ctx);
  return ctx;
}

const 회사들 = [
  { id: 'c1', name: '가온전자', typeCode: '자문', status: 'active' },
  { id: 'c2', name: '대성물류', typeCode: '자문', status: 'active' },
  { id: 'c3', name: '세종정밀', typeCode: '급여', status: 'active' },
  { id: 'c4', name: '삼정테크', typeCode: '자문', status: 'closed', closedDate: '2026-03-31' },
  { id: 'c5', name: '한빛식품', typeCode: '급여', status: 'active' }
];
const 표시들 = {
  c1: { posted: true,  by: '권형하', at: '2026-08-20' },
  c2: { posted: false, why: '로고 파일을 못 받음', by: '권형하', at: '2026-08-21' },
  c4: { posted: true,  by: '권형하', at: '2026-08-01' }
};

/* ══════ ① 거래가 끝난 곳 ══════ */
test('★★ 거래가 끝난 곳은 고르는 창에도 안 나온다', () => {
  /* 2026-09-03 「업체 종료된 곳은 모두 자동으로 명단 빼라」. 목록에서만 빼고
     고르는 창에는 남겨 두면, 거기서 체크해 도로 올릴 수 있게 된다. */
  const ctx = 상자(회사들, 표시들);
  const 이름들 = ctx.pickRows().map(r => r.name);
  assert.ok(이름들.indexOf('삼정테크') < 0, '★★ 거래가 끝난 곳이 고르는 창에 있다');
  회사들.filter(c => c.status !== 'closed').forEach(c =>
    assert.ok(이름들.indexOf(c.name) >= 0, '★ 거래 중인 곳이 빠졌다: ' + c.name));
});

/* ══════ ② 열면 지금 올라가 있는 것이 체크돼 있다 ══════ */
test('★★ 열면 «지금 올림»인 곳이 체크돼 있다 — 고르는 창이자 보는 창이다', () => {
  const ctx = 상자(회사들, 표시들);
  ctx.openPartnerPick();
  assert.equal(ctx.Pick.sel.c1, true, '★★ 이미 올라가 있는 곳이 안 체크돼 있다 — 풀린 줄 알고 다시 올린다');
  assert.ok(!ctx.Pick.sel.c2, '★ 「안 올림」인 곳이 체크돼 있다');
  assert.ok(!ctx.Pick.sel.c3, '★ 표시 안 한 곳이 체크돼 있다');
  assert.ok(!ctx.Pick.sel.c4, '★ 거래 끝난 곳이 체크돼 있다 — 창에 없는 것이 골라져 있다');
});

/* ══════ ③④ 무엇을 쓰고 무엇을 «안 쓰는가» ══════ */
test('★★ 체크한 곳만 올리고, 안 고른 곳은 «건드리지 않는다»', () => {
  const ctx = 상자(회사들, 표시들);
  ctx.openPartnerPick();          // c1 체크된 상태로 열린다
  ctx.Pick.sel.c3 = true;         // 새로 고름 (표시 안 함 → 올림)
  const 고침 = ctx.pickChanges();

  assert.equal(고침.c3 && 고침.c3.posted, true, '★★ 새로 고른 곳이 안 올라간다');
  assert.ok(!('c1' in 고침), '★ 이미 올림인 곳을 또 쓴다 — 안 바뀐 것은 안 써야 한다');
  /* ★ 이 둘이 이 검사의 핵심이다 */
  assert.ok(!('c2' in 고침),
    '★★ 「안 올림」으로 사유를 적어 둔 곳을 덮어쓴다 — 남이 적은 사유가 날아간다');
  assert.ok(!('c5' in 고침),
    '★★ 아직 표시 안 한 곳을 「안 올림」으로 써 버린다 — 「아직 안 봤다」와 「보고 안 올린다」가 뒤섞인다');
});

test('★★ 체크를 풀면 내려간다', () => {
  const ctx = 상자(회사들, 표시들);
  ctx.openPartnerPick();
  delete ctx.Pick.sel.c1;         // 올라가 있던 것을 푼다
  const 고침 = ctx.pickChanges();
  assert.equal(고침.c1 && 고침.c1.posted, false, '★★ 체크를 풀었는데 안 내려간다');
});

test('★ 메모(사유)는 있던 것을 그대로 옮긴다 — 이 창은 메모를 다루지 않는다', () => {
  const ctx = 상자(회사들, 표시들);
  ctx.openPartnerPick();
  ctx.Pick.sel.c2 = true;         // 「안 올림 + 사유」였던 곳을 올린다
  const 고침 = ctx.pickChanges();
  assert.equal(고침.c2.posted, true);
  assert.equal(고침.c2.why, '로고 파일을 못 받음', '★ 적어 둔 사유가 지워졌다');
  assert.equal(고침.c2.by, '권형하', '★ 누가 바꿨는지가 안 남는다');
  assert.equal(고침.c2.at, '2026-09-06', '★ 언제 바꿨는지가 안 남는다');
});

/* ══════ 걸러 보기 ══════ */
test('★ 이름과 종류로 거른다 — 「보이는 것 전부」는 걸러진 것만 고른다', () => {
  const ctx = 상자(회사들, 표시들);
  ctx.Pick.q = '세종';
  assert.deepEqual(ctx.pickVisible().map(r => r.name), ['세종정밀'], '★ 이름 찾기가 안 된다');

  ctx.Pick.q = ''; ctx.Pick.type = '급여';
  const 급여 = ctx.pickVisible().map(r => r.name);
  assert.deepEqual(급여.slice().sort(), ['세종정밀', '한빛식품'].sort(), '★ 종류로 안 걸러진다');
  assert.ok(급여.indexOf('삼정테크') < 0, '★ 거래 끝난 곳이 걸러 보기로 되살아난다');

  /* 종류 목록에도 거래 끝난 곳은 안 센다 — 「자문 3」이라 적고 2곳만 보이면 안 된다 */
  const 종류 = ctx.pickTypes();
  const 자문 = 종류.find(t => t.code === '자문');
  assert.equal(자문 && 자문.n, 2, '★ 종류 셈에 거래 끝난 곳이 섞였다');
});

test('★★ 「보이는 것 전부 고르기」는 «걸러진 것만» 건드린다', () => {
  /* 안 보이는 것까지 고르면 무엇을 골랐는지 눈으로 확인할 길이 없다 */
  const s = 함수('pickAllVisible');
  assert.match(s, /pickVisible\(\)/, '★★ 보이는 것이 아니라 다른 목록을 고른다');
  assert.ok(s.indexOf('pickRows()') < 0, '★★ 걸러 놓았는데 안 보이는 것까지 고른다');
});

/* ══════ ⑤ 통째로 덮지 않는다 ══════ */
test('★★ 저장이 자문사 표시를 «통째로 덮지» 않는다', () => {
  const s = 함수('pickSave');
  /* PARTNER_PATH 를 set 하면 이 창에 없는 회사(거래 끝난 곳)의 표시가 통째로 지워진다 */
  assert.ok(!/ref\(PARTNER_PATH\)\.set\(/.test(s),
    '★★ 자문사 표시를 통째로 set 한다 — 창에 없는 회사의 표시가 다 지워진다');
  assert.match(s, /ref\(PARTNER_PATH\)\.update\(/,
    '★★ 적은 열쇠만 바꾸는 update 가 아니다');
  /* 한 번에 쓴다 — 24곳을 24번 쓰면 한 번에 넣는 뜻이 없다 */
  assert.ok(!/for *\(|\.forEach\([^)]*await/.test(s.replace(/열쇠\.forEach/g, '')),
    '★ 한 곳씩 나눠 쓴다 — 한 번에 넣는 창이 아니게 된다');
});

test('★★ 저장이 실패하면 화면도 되돌린다 — 올라간 줄 알고 넘어가면 안 된다', () => {
  const s = 함수('pickSave');
  const at = s.indexOf('catch');
  assert.ok(at > 0, '★ 실패를 안 잡는다');
  /* ⚠ 「어딘가에 옛것[k] 가 있나」로 보면 안 된다 — 값을 «챙기는» 줄에도 그 글자가 있어,
     되돌리는 줄을 지워도 통과했다(2026-09-06 되돌림 검사가 잡았다).
     되돌리는 일이 «catch 안»에서 일어나는지를 본다. */
  assert.match(s.slice(at), /App\.partners\[k\] *= *옛것\[k\]/,
    '★★ 실패했는데 화면만 바뀐 채 남는다 — 올라간 줄 알고 넘어간다');
  assert.match(s.slice(at), /Pick\.err/, '★ 왜 안 됐는지 사람에게 안 알린다');
});

test('★ 총괄관리자만 저장한다', () => {
  assert.match(함수('pickSave'), /App\.isAdmin/,
    '★★ 다른 직원이 홈페이지에 올릴 회사를 바꿀 수 있다');
});

/* ══════ ⑥ 커서와 굴린 자리 ══════ */
test('★★ 체크할 때 목록을 다시 그리지 «않는다» — 굴린 자리가 맨 위로 돌아간다', () => {
  const s = 함수('pickToggle');
  assert.match(s, /pickCounts\(\)/, '★ 셈이 안 고쳐진다');
  assert.ok(s.indexOf('renderPartnerPick') < 0,
    '★★ 체크 한 번에 창을 다시 그린다 — 272곳에서 굴린 자리가 맨 위로 돌아간다');
  assert.ok(s.indexOf('pickRefresh') < 0,
    '★★ 체크 한 번에 목록을 다시 그린다 — 굴린 자리가 맨 위로 돌아간다');
});

test('★★ 찾기 칸은 다시 그리지 «않는다» — 치는 도중 커서가 튄다', () => {
  /* 찾기 칸은 renderPartnerPick 이 «한 번만» 그리고, 그 뒤로는 목록과 셈만 고친다 */
  const s = 함수('pickFind');
  assert.match(s, /pickRefresh\(\)/, '★ 걸러 보기가 안 고쳐진다');
  assert.ok(s.indexOf('renderPartnerPick') < 0,
    '★★ 한 글자마다 창을 통째로 다시 그린다 — 커서가 튀어 회사 이름을 못 친다');
  const r = 함수('pickRefresh');
  assert.ok(r.indexOf('class="find"') < 0, '★★ 다시 그리는 조각에 찾기 칸이 들어 있다');
});

/* ══════ 넓은 창 ══════ */
test('★★ 넓게 연 창은 «되돌린다» — 다음에 뜨는 작은 창까지 벌어진다', () => {
  const s = 함수('openModal');
  assert.match(s, /classList\.toggle\('wide'/,
    '★★ 넓힘을 끄지 않는다 — 사유 입력 창까지 1000px 로 벌어진다');
  assert.match(함수('renderPartnerPick'), /openModal\([^)]*, *true\)/,
    '★ 자문사 고르기가 좁은 창으로 뜬다 — 272곳을 한 칸으로 세우게 된다');
  const css = /(?:^|\n)\.modalCard\.wide\{([^}]*)\}/.exec(RAW);
  assert.ok(css, '★ 넓은 창 꾸밈이 없다');
  assert.match(css[1], /max-width: *\d/, '★ 넓은 창에 너비가 없다');
});

test('★ 여러 칸은 «자리에 맞춰» 늘어난다 — 칸 수를 숫자로 박지 않는다', () => {
  /* 3 을 박으면 좁은 화면에서 회사 이름이 짜부라진다 */
  const css = /(?:^|\n)\.pgrid\{([^}]*)\}/.exec(RAW);
  assert.ok(css, '★ 고르는 칸(.pgrid) 꾸밈이 없다');
  assert.match(css[1], /repeat\(auto-fill/, '★★ 칸 수를 숫자로 박았다 — 좁은 화면에서 이름이 짜부라진다');
  assert.match(css[1], /minmax\(\s*[\d.]+rem/, '★ 한 칸이 얼마까지 좁아질지 안 정했다');
});

/* ══════ 목록은 짧게, 훑어보기는 고르는 창에서 (2026-09-06) ══════ */
test('★★ 아무 곳도 안 골랐을 때 «빈 목록»으로 두지 않는다 — 무엇을 할지 말한다', () => {
  /* 272곳을 기본에서 뺐으므로 여기가 비면 사람은 「업체가 없나?」 하고 만다.
     이 화면이 올림 0곳으로 몇 달을 지낸 까닭이 바로 «다음에 뭘 할지» 안 알려 준 것이다. */
  /* ⚠ 글자로만 보면 안 된다 — 실제로 «그려» 보는 검사는 pu-home-screen 쪽에 있다
     (거기에 rowsHtml 을 돌릴 모래통이 있다). 여기서는 안내 글이 통째로
     사라지지 않았는지만 지킨다. */
  const s = 함수('rowsHtml');
  const at = s.indexOf('아무 곳도 안 골랐습니다');
  assert.ok(at > 0, '★★ 자문사가 비었을 때 할 말이 통째로 사라졌습니다');
  const 빈말 = s.slice(Math.max(0, at - 500), at + 500);
  assert.match(빈말, /openPartnerPick\(\)/,
    '★★ 비었는데 «어디서 고르는지»를 안 알려 줍니다 — 빈 화면만 남습니다');
  assert.match(빈말, /곳이 있습니다|고를 수 있|업체관리에/,
    '★ 몇 곳에서 고를 수 있는지 안 말합니다 — 업체가 없는 줄 압니다');
});

test('★★ 딱지 셈과 «실제로 보이는 줄»이 같은 규칙을 쓴다', () => {
  /* 「전체 272」라 적고 눌러 보니 0줄이면 사람은 목록이 고장 났다고 여긴다.
     visibleRows 가 손댄 것만 세우면, chipsHtml 의 첫 딱지도 손댄 것을 세야 한다. */
  const v = 함수('visibleRows'), c = 함수('chipsHtml');
  assert.match(v, /r\.posted !== ''/, '★★ 기본 목록이 다시 272줄이 됐습니다');
  assert.match(c, /r\.posted !== ''/, '★★ 딱지 셈이 목록과 다른 규칙을 씁니다');
});

test('★★ 「아직 안 고름」은 감춘 것이 아니라 «기본에서 뺀» 것이다', () => {
  const c = 함수('chipsHtml');
  assert.match(c, /'posted:none'[\s\S]{0,60}아직 안 고름/,
    '★★ 뺀 272곳을 볼 딱지가 없습니다 — 그러면 빼는 것이 아니라 감추는 것입니다');
  /* 「표시 안 함」이 아니라 「아직 안 고름」 — 표시를 안 한 것이 아니라 차례가 안 온 것이다 */
  assert.ok(c.indexOf("label: '표시 안 함'") < 0,
    '★ 옛 이름(표시 안 함)으로 되돌아갔습니다 — 왜 기본에서 빠졌는지가 안 보입니다');
});

test('★★ 자문사 화면을 열 때 딱지가 «저절로 눌려» 있지 않다', () => {
  /* 전에는 올림이 있으면 posted:yes 를 미리 걸었다 — 목록 기본이 272줄이라 그랬다.
     이제 기본이 짧으므로 걸 까닭이 없다. 저절로 눌려 있으면
     「안 올림」으로 둔 곳이 왜 안 보이는지 알 길이 없다. */
  const s = 함수('defaultFilterOf');
  assert.ok(s.indexOf('posted:yes') < 0,
    '★★ 화면을 열자마자 「올림」만 걸러 보입니다 — 안 올림으로 둔 곳이 사라집니다');
});

/* ══════ 들어가는 문 ══════ */
test('★★ 자문사 화면에 «고르기» 단추가 있다 — 없으면 창을 못 연다', () => {
  assert.match(H, /onclick="openPartnerPick\(\)"/,
    '★★ 고르는 창을 열 단추가 어디에도 없다');
  /* 자문사를 볼 때만 나온다 — 구성원 보다가 눌러 엉뚱한 창이 뜨면 안 된다 */
  const at = H.indexOf('onclick="openPartnerPick()"');
  const 앞 = H.slice(Math.max(0, at - 400), at);
  assert.match(앞, /App\.group === 'partner'/,
    '★ 자문사 화면이 아닐 때도 「자문사 고르기」가 보인다');
});
