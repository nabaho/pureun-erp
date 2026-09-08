/* ⚙️ 환경설정 — 상위 탭 + 내용 (대표 지시 2026-09-07)
   「환경설정 다시 정리해달라 너무 정신없다. 탭방식으로 정리해달라 너무 정신없어
    찾기 힘들다 상위탭 과 내용으로 다시 정리해라」

   ■ 오간 길 — 세 번째다. 그 까닭을 여기 적어 둔다.
     ① 여섯 탭 → 「내부가 통일이 안 되어 있다」 → 결을 맞췄다(#956)
     ② 목업 검토 → 대표가 「다」(탭을 없애고 한 화면)를 고름 → 만들었다(#970)
     ③ **써 보니 「너무 정신없다」** → 다시 탭. 서른 개가 한 화면에 서면 비슷한 줄이
        스물 몇 개라 눈이 훑을 곳을 못 정한다 — 목업에서는 안 보이던 것이다.
   ★ 목업이 아니라 **써 본 것이 이긴다.** 되돌리는 것을 부끄러워할 일이 아니다.

   ★ 못 박는 것
     ① 탭은 «넷»이다(자료·정리·이알피·계정·관리). 여섯이던 때는 비슷한 이름이 섞여
        어디에 뭐가 있는지 못 외웠다.
     ② 🔔 할 일 띠는 탭 «위»에 늘 있다(대표 결정 「나」). 안 눌러도 보여야 한다.
     ③ 「정리」 탭에는 여덟 갈래가 «전부» 온다 — 띠는 빠른 길이고 여기가 제 자리다.
        한쪽에만 두면 「어디 있더라」가 다시 생긴다(그것이 이번 지시의 까닭이다).
     ④ 칸은 여전히 «자료»(SET_SECTIONS)다 — 검사가 서른 개를 셀 수 있다.
     ⑤ 하위 화면은 «그것만» 보인다. 모르는 탭 이름이 오면 첫 탭으로 되돌린다.

     node --test tests/cards-settings-tabs.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

const SUB_NAMES = ['openDedup', 'openSimilar', 'openMixedFix', 'openNameFix', 'openTrash',
  'openErpNameCheck', 'openClassifyRules', 'openViewManager', 'openMailBlock', 'openCleanupCenter'];

/* 화면을 통째로 떠서 «그린다» — 글자만 찾으면 탭을 지워도 통과한다 */
function draw(opt) {
  const o = Object.assign({ admin: true, sub: '', tab: 'data', trash: 0, sim: 0 }, opt || {});
  const trash = {};
  for (let i = 0; i < o.trash; i++) trash['t' + i] = {};
  const el = { innerHTML: '' };
  const N = v => ({ length: v });
  const ctx = {
    console,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    $: id => (id === 'pcSettings' ? el : { innerHTML: '' }),
    render: () => { },
    state: {
      view: 'settings', tab: 'card', setSub: o.sub, setTab: o.tab, isAdmin: o.admin,
      items: { a: { kind: 'card' }, b: { kind: 'biz' } },
      views: {}, groups: {}, mailBlock: {}, trash: trash, privOpen: false
    },
    Store: { mode: 'firebase' },
    aiReady: () => true,
    findDupGroups: () => N(0), findSimilarGroups: () => N(o.sim),
    emptyTargets: () => N(0), mojibakeTargets: () => N(0),
    mixedFixList: () => N(0), nameFixList: () => N(0),
    classifyPlan: () => ({ targetN: 0 })
  };
  SUB_NAMES.forEach(n => {
    ctx[n] = () => { ctx._called = n; ctx._targetWhenCalled = ctx._panelTarget; };
  });
  vm.createContext(ctx);
  const a = SRC.indexOf('let _todoMemo = null;');
  const b = SRC.indexOf('function _syncSearchX(){');
  assert.ok(a > 0 && b > a, '알맹이를 못 찾았다');
  /* ⚠ 최상위 let/const 는 컨텍스트 값이 되지 않는다 — var 로 바꿔 실어야 꺼내 본다 */
  vm.runInContext(SRC.slice(a, b).replace(/\nlet /g, '\nvar ').replace(/\nconst /g, '\nvar '), ctx);
  ctx._panelTarget = 'modal';
  ctx.setSub = s => { ctx.state.setSub = s || ''; ctx.renderSettingsPage(); };
  ctx.renderSettingsPage();
  ctx.html = el.innerHTML;
  return ctx;
}
/* 화면에 보이는 단추 이름들 */
const labels = h => (h.match(/class="setbtn[^"]*"[^>]*>([^<]*)/g) || [])
  .map(s => s.replace(/^[\s\S]*?>/, '').trim());

/* ── ① 탭 넷 ── */

test('★★ 상위 탭이 «넷»이고, 첫 탭은 자료다', () => {
  const c = draw();
  assert.equal(c.SET_TABS.map(t => t.k).join(','), 'data,clean,erp,acct',
    '★ 탭 목록이 바뀌었다 — 넷(자료·정리·이알피·계정·관리)이어야 한다');
  assert.equal(c.SET_TABS.length, 4, '★ 탭 수가 넷이 아니다 — 여섯이던 때는 못 외웠다');
  c.SET_TABS.forEach(t => {
    assert.ok(t.label && t.label.length <= 12, '★ 탭 이름이 길다: ' + t.label);
    assert.ok(t.hint && t.hint.length <= 24, '★ 탭 말풍선이 없거나 길다: ' + t.k);
  });
  assert.match(c.html, /class="settabs"/, '★ 탭 줄을 안 그렸다');
  /* ⚠ `class="settab` 만 세면 껍데기(`class="settabs"`)까지 하나로 세어 다섯이 된다 */
  assert.equal((c.html.match(/class="settab(?: on)?"/g) || []).length, 4,
    '★ 탭 단추가 넷이 아니다');
  assert.match(c.html, /class="settab on"/, '★ 켜진 탭이 없다 — 어디에 있는지 모른다');
});

test('★★ 칸마다 «어느 탭»인지 적혀 있고, 그 탭에서만 나온다', () => {
  const c = draw();
  const secs = c.SET_SECTIONS();
  secs.forEach(s => assert.ok(['data', 'erp', 'acct'].indexOf(s.tab) >= 0,
    '★ 「' + s.t + '」 칸에 탭이 없거나 모르는 탭이다: ' + s.tab));
  /* 자료 탭에는 이알피·관리자 것이 «안» 나온다 */
  const data = draw({ tab: 'data' }).html;
  assert.ok(data.indexOf('자주 쓰는 것') > 0 && data.indexOf('자료 넣고 빼기') > 0);
  assert.ok(data.indexOf('푸른이알피 연동') < 0, '★ 자료 탭에 이알피 칸이 섞였다');
  assert.ok(data.indexOf('관리자 · 한 번만') < 0, '★ 자료 탭에 관리자 칸이 섞였다');
  const erp = draw({ tab: 'erp' }).html;
  assert.ok(erp.indexOf('푸른이알피 연동') > 0);
  assert.ok(erp.indexOf('자주 쓰는 것') < 0, '★ 이알피 탭에 자료 칸이 섞였다');
  const acct = draw({ tab: 'acct' }).html;
  ['탭 · 계정', '관리자 · 한 번만 하는 일', '위험 구역'].forEach(t =>
    assert.ok(acct.indexOf(t) > 0, '★ 계정·관리 탭에 「' + t + '」 칸이 없다'));
});

test('★★★ 갈 수 있는 곳이 «한 곳도» 안 빠졌다 — 탭으로 나누다 흘리기 쉽다', () => {
  /* ⚠ 탭마다 그리므로, 어느 탭에도 안 든 칸은 «영영 안 보인다». 네 탭을 합쳐 센다. */
  const c = draw();
  const 전부 = c.SET_SECTIONS().map(s => s.rows.map(r => r.fn)).reduce((a, b) => a.concat(b), []);
  const 탭에서 = ['data', 'erp', 'acct'].map(k => draw({ tab: k }).html).join('');
  전부.forEach(fn => assert.ok(탭에서.indexOf(fn) > 0,
    '★ 「' + fn + '」 이 어느 탭에도 안 나온다 — 영영 못 찾는다'));
  assert.equal(전부.length, 22, '★ 갈 수 있는 곳이 ' + 전부.length + '개다 (22개여야 한다)');
});

/* ── ② 띠는 탭 «위» ── */

test('★★★ 🔔 할 일 띠는 탭 «위»에 늘 있다 — 안 눌러도 보여야 한다 (대표 결정 「나」)', () => {
  const c = draw({ trash: 41, sim: 105 });
  const 띠 = c.html.indexOf('지금 손볼 것');
  const 칩 = c.html.indexOf('class="setstat"');
  const 탭 = c.html.indexOf('class="settabs"');
  assert.ok(띠 > 0, '★ 띠를 안 그렸다');
  assert.ok(띠 < 칩 && 칩 < 탭, '★ 차례가 어긋났다 (띠 ' + 띠 + ' · 칩 ' + 칩 + ' · 탭 ' + 탭 + ')');
  /* 어느 탭에서도 띠가 보인다 — 탭을 옮겨도 밀린 것이 사라지면 안 된다 */
  ['data', 'clean', 'erp', 'acct'].forEach(k =>
    assert.ok(draw({ tab: k, trash: 41 }).html.indexOf('지금 손볼 것') > 0,
      '★ ' + k + ' 탭에서 띠가 사라진다'));
});

test('★★ 「정리」 탭에 «숫자 배지»가 붙는다 — 안 눌러도 밀린 것이 보인다', () => {
  const c = draw({ trash: 41, sim: 105 });
  assert.match(c.html, /class="settab[^"]*"[^>]*>🧹 정리 <span class="tbdg">2<\/span>/,
    '★ 정리 탭에 배지가 없거나 수가 틀렸다');
  /* 0 이면 배지도 없다 — 늘 켜진 등은 아무것도 못 알린다 */
  assert.ok(draw().html.indexOf('tbdg') < 0, '★ 할 일이 없는데 배지가 붙었다');
});

/* ── ③ 정리 탭은 여덟을 «전부» ── */

test('★★★ 「정리」 탭에 여덟 갈래가 «전부» 온다 — 한쪽에만 두면 「어디 있더라」가 다시 생긴다', () => {
  const c = draw({ tab: 'clean', trash: 41, sim: 105 });
  const 이름 = ['확실한 중복', '유사 후보', '빈 명함', '깨진 글자',
    '전화·주소가 섞임', '이름 칸에 회사명', '규칙으로 한 번에 분류', '휴지통'];
  이름.forEach(n => assert.ok(c.html.indexOf(n) > 0, '★ 「' + n + '」 이 정리 탭에 없다'));
  /* ⚠ 띠에도 .setbtn 이 있다 — 통째로 세면 띠의 줄까지 함께 세어 부풀어난다.
       탭 줄 «뒤»(= 그 탭의 내용)만 센다. */
  const 내용 = c.html.slice(c.html.indexOf('class="settabs"'));
  assert.equal(내용.split('class="setbtn').length - 1, 8,
    '★ 정리 탭의 줄이 여덟이 아니다');
  /* 숫자가 있는 것은 숫자로, 없는 것은 ✓ 로.
     ⚠ 통째로 보면 안 된다 — «띠»에도 「유사 후보 105묶음」이 있어, 정리 탭에서
       숫자를 지워도 초록이 된다(2026-09-07 고장넣기에서 실제로 샜다). */
  assert.match(내용, /유사 후보[\s\S]{0,120}105묶음/, '★ 숫자를 안 보여 준다');
  assert.match(내용, /확실한 중복[\s\S]{0,120}✓ 이상 없음/, '★ 이상 없음을 안 보여 준다');
});

test('★★ 정리 탭의 줄은 «데려가기만» 한다 — 지우는 일을 여기서 바로 실행하지 않는다', () => {
  const c = draw({ tab: 'clean', trash: 41 });
  assert.match(c.html, /todoGo\('/, '★ 누르면 갈 곳이 없다');
  assert.ok(!/cleanEmpty\(|openMojibakeCleanup\(|Store\.(del|hardDel)|wipeAll\(/.test(c.html),
    '★ 정리 탭에서 바로 지운다 — 여기는 한눈에 보고 «들어가는» 자리다');
});

/* ── ④ 탭 옮기기 ── */

test('★★ 탭을 누르면 그 탭이 켜지고, 다시 그리고, 하위 화면은 «풀린다»', () => {
  const c = draw({ tab: 'data', sub: '' });
  /* ⚠ 「값이 바뀌었나」만 보면 안 된다 — 다시 그리지 않으면 화면은 그대로다.
       2026-09-07 고장넣기에서 renderSettingsPage 를 떼도 초록이었다.
       그려 준 글자가 «바뀌는지»까지 본다. */
  const 전 = c.html;
  c.setSetTab('erp');
  assert.equal(c.state.setTab, 'erp');
  assert.equal(c.state.setSub, '', '★ 탭을 옮겼는데 하위 화면이 남아 있다');
  const 후 = c.$('pcSettings').innerHTML;
  assert.notEqual(후, 전, '★ 탭을 옮겼는데 다시 안 그린다 — 화면이 그대로다');
  assert.ok(후.indexOf('푸른이알피 연동') > 0, '★ 옮긴 탭의 내용이 안 나온다');
  /* 하위 화면을 보다가 탭을 누르면 그 탭 목록으로 나와야 한다 */
  const d = draw({ sub: 'views' });
  d.setSetTab('clean');
  assert.equal(d.state.setSub, '', '★ 하위 화면에서 탭을 눌렀는데 안 풀린다');
});

test('★★ 모르는 탭 이름이 오면 «첫 탭»으로 — 빈 화면이 되면 앱이 멈춘 줄 안다', () => {
  const c = draw({ tab: '없는탭' });
  assert.ok(c.html.indexOf('자주 쓰는 것') > 0, '★ 빈 화면이 됐다');
  assert.match(c.html, /class="settab on"/, '★ 켜진 탭이 없다');
});

/* ── ⑤ 하위 화면 ── */

test('★★ 하위 화면은 «그것만» 보인다 — 목록 밑에 딸려 붙으면 어디 펼쳐졌는지 못 찾는다', () => {
  const c = draw({ sub: 'similar' });
  assert.equal(c._called, 'openSimilar', '★ 엉뚱한 화면을 열었다: ' + c._called);
  assert.ok(c.html.indexOf('class="settabs"') < 0, '★ 탭 줄이 그대로 딸려 나왔다');
  assert.ok(c.html.indexOf('class="setsec') < 0, '★ 목록이 그대로 딸려 나왔다');
  assert.ok(c.html.indexOf('setInline') > 0, '★ 하위 화면을 담을 자리가 없다');
});

test('★★ 하위 화면은 «인라인»이고, 터져도 _panelTarget 은 되돌아온다', () => {
  const c = draw({ sub: 'views' });
  assert.equal(c._targetWhenCalled, 'inline', '★ 팝업으로 열렸다');
  assert.equal(c._panelTarget, 'modal', '★ 열고 나서 되돌려 놓지 않았다');
  let 터짐 = 0;
  c.openDedup = () => { 터짐++; throw new Error('일부러 터뜨림'); };
  c.state.setSub = 'dedup';
  c.renderSettingsPage();
  assert.equal(터짐, 1, '★ 터뜨릴 화면을 부르지도 않았다 — 검사가 헛돈 것이다');
  assert.equal(c._panelTarget, 'modal', '★ inline 인 채로 굳었다 — 이후 팝업이 다 안 뜬다');
});

test('★★ 열 갈래가 «다» 열린다 — 하나만 빠져도 그 화면은 영영 못 연다', () => {
  const keys = ['dedup', 'similar', 'mixed', 'namefix', 'trash',
    'erpname', 'rules', 'views', 'mailblock', 'clean'];
  const got = keys.map(k => draw({ sub: k })._called);
  got.forEach((v, i) => assert.ok(SUB_NAMES.indexOf(v) >= 0,
    '★ 「' + keys[i] + '」 을 열 수 없다'));
  assert.equal(new Set(got).size, keys.length, '★ 두 열쇠가 같은 화면을 연다: ' + got.join(','));
});

/* ── 줄이 없는 칸·관리자 ── */

test('★★ 대표가 아니면 관리자 칸이 «통째로» 사라진다 — 빈 제목만 남으면 더 이상하다', () => {
  const h = draw({ tab: 'acct', admin: false }).html;
  assert.ok(h.indexOf('관리자 · 한 번만 하는 일') < 0, '★ 직원에게 관리자 칸이 보인다');
  ['migrateInlineThumbs()', 'openExportLog()', 'openPrivateVault()'].forEach(fn =>
    assert.ok(h.indexOf(fn) < 0, '★ 직원에게 ' + fn + ' 가 보인다'));
  /* 그래도 그 탭이 비지는 않는다 — 탭·계정과 위험 구역은 남는다 */
  assert.ok(h.indexOf('탭 · 계정') > 0, '★ 직원의 계정 탭이 통째로 비었다');
  assert.ok(h.indexOf('undefined') < 0 && h.indexOf('null') < 0,
    '★ 빠진 줄이 화면에 글자로 새어 나왔다');
});

test('★ 「자주 쓰는 것」만 눈에 띈다 — 다 크면 아무것도 안 크다', () => {
  const c = draw();
  const hero = c.SET_SECTIONS().filter(s => s.rows.some(r => r.cls === 'hero'));
  assert.equal(hero.length, 1, '★ hero 가 여러 칸에 흩어져 있다');
  assert.equal(hero[0].t, '자주 쓰는 것');
  assert.ok(hero[0].rows.every(r => r.cls === 'hero'), '★ 그 칸 안에서도 결이 다르다');
});
