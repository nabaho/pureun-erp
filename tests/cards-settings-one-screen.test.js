/* ⚙️ 환경설정 — 탭을 없애고 «한 화면» (대표 결정 2026-09-05 「다」= 목업 ㉰)
   「목업 다시 만들어달라. 좀 직관적이고 쉽게 볼 수 있게」 → ㉮/㉯/㉰ 가운데 「다」

   ■ 무엇이 문제였나
   서른 개 단추를 여섯 탭에 나눠 두었더니, 무엇을 하러 들어와도 «어디에 있더라»로
   탭을 다 눌러 보게 됐다. 서른 개는 스크롤 한 번이면 다 보인다.

   ★ 못 박는 것
     ① 목록은 «한 화면»이다 — 탭이 없다. 띠 → 통계 칩 → 칸들 차례다.
     ② 하위 화면(정리 센터·내 탭 관리 등)은 «그것만» 보인다. 목록 밑에 딸려 붙으면
        어디에 펼쳐졌는지 못 찾는다. 되돌아가는 단추는 «하나»다.
     ③ 하위 화면은 팝업이 아니라 «인라인»으로 그린다(_panelTarget).
     ④ 모르는 이름이 들어오면 목록으로 되돌린다 — 빈 칸만 남으면 앱이 멈춘 줄 안다.
     ⑤ 「더 손볼 것 — 이상 없는 것들」은 정리하는 일끼리 «붙어» 있어야 한다.
     ⑥ 줄이 없는 칸은 제목도 안 나온다.

     node --test tests/cards-settings-one-screen.test.js */
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

/* 화면을 통째로 떠서 «그린다» — 글자만 찾으면 칸을 지워도 통과한다 */
function draw(opt) {
  const o = Object.assign({ admin: true, sub: '', trash: 0, sim: 0 }, opt || {});
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
      view: 'settings', tab: 'card', setSub: o.sub, isAdmin: o.admin,
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
  /* 하위 화면 열 명 — 누가 «불렸는지»와 그때 _panelTarget 이 무엇이었는지를 받아 적는다 */
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

/* ── ① 한 화면 ── */

test('★★ 탭이 «없다» — 서른 개가 한 화면에 다 있다', () => {
  const c = draw();
  assert.ok(c.html.indexOf('settab') < 0, '★ 탭이 되살아났다');
  const 단추 = c.html.split('class="setbtn').length - 1;
  assert.equal(단추, 30, '★ 단추가 ' + 단추 + '개다 — 22개 + 정리 8가지여야 한다');
});

test('★★ 갈 수 있는 곳이 «한 곳도» 안 빠졌다 — 옮기다 조용히 흘리면 영영 못 찾는다', () => {
  /* ⚠ 이 목록이 곧 「환경설정에서 할 수 있는 일」이다. 화면을 손으로 이어 붙이다
       한 줄이 빠져도 화면은 멀쩡해 보인다 — 여기서만 걸린다.
       일부러 «빠짐없이» 적는다. 새 단추를 넣으면 여기도 같이 늘려야 한다. */
  const c = draw();
  const got = c.SET_SECTIONS().map(s => s.rows.map(r => r.fn)).reduce((a, b) => a.concat(b), []);
  assert.equal(got.join('\n'), [
    'backupNow()', 'openExportPick()', 'openMatPage()',
    'importInput.click()', 'restoreInput.click()', 'printList()',
    "setSub('erpname')", 'openErpClosedTidy()', 'openCardFillCo()',
    'openCoDupDocs()', 'rebuildIdxAll()', 'openCoSentBatch()',
    "setSub('views')", 'openSettings()', "setSub('mailblock')",
    'openPrivateVault()', 'doLogoutCards()',
    'migrateInlineThumbs()', 'openExportLog()',
    'pucardsMovePhotosToStorage()', 'migrateLockedFolders()',
    'wipeAll()'
  ].join('\n'));
});

test('★★ 차례가 «띠 → 통계 칩 → 칸» 이다', () => {
  const c = draw({ trash: 41 });
  const 띠 = c.html.indexOf('지금 손볼 것');
  const 칩 = c.html.indexOf('class="setstat"');
  const 칸 = c.html.indexOf('class="setsec');
  assert.ok(띠 > 0 && 칩 > 띠 && 칸 > 칩,
    '★ 차례가 어긋났다 (띠 ' + 띠 + ' · 칩 ' + 칩 + ' · 칸 ' + 칸 + ')');
});

test('★★ 여섯 칸의 제목이 다 나온다', () => {
  const h = draw().html;
  ['자주 쓰는 것', '자료 넣고 빼기', '푸른이알피 연동', '탭 · 계정',
    '관리자 · 한 번만 하는 일', '위험 구역'].forEach(t =>
      assert.ok(h.indexOf('setsec') > 0 && h.indexOf(t) > 0, '「' + t + '」 칸이 없다'));
});

test('★★ 줄이 «없는» 칸은 제목도 안 나온다 — 빈 제목만 남으면 더 이상하다', () => {
  const h = draw({ admin: false }).html;
  assert.ok(h.indexOf('관리자 · 한 번만 하는 일') < 0, '★ 직원에게 빈 관리자 칸이 남았다');
  /* 「개인 폴더」는 대표 것이라 null 로 빠진다 — null 이 단추로 새면 안 된다 */
  assert.ok(h.indexOf('undefined') < 0 && h.indexOf('null') < 0,
    '★ 빠진 줄이 화면에 글자로 새어 나왔다');
});

/* ── ⑤ 「더 손볼 것」 ── */

test('★★ 「더 손볼 것」이 «푸른이알피 연동 앞»에 온다 — 정리하는 일끼리 붙어야 한다', () => {
  const h = draw({ sim: 3 }).html;
  const 더 = h.indexOf('더 손볼 것');
  const erp = h.indexOf('푸른이알피 연동');
  assert.ok(더 > 0, '★ 이상 없는 것들을 아무 데도 안 그렸다');
  assert.ok(더 < erp, '★ 「더 손볼 것」이 맨 뒤로 밀렸다 — 정리하는 일이 화면 양 끝에 흩어진다');
});

test('★★ 숫자가 «있는» 것은 띠에만, «없는» 것은 「더 손볼 것」에만 — 두 곳에 겹치지 않는다', () => {
  const c = draw({ sim: 3, trash: 41 });
  const 띠 = c.html.slice(c.html.indexOf('todorail'), c.html.indexOf('더 손볼 것'));
  const 더 = c.html.slice(c.html.indexOf('더 손볼 것'), c.html.indexOf('푸른이알피 연동'));
  assert.ok(띠.indexOf('유사 후보') > 0 && 더.indexOf('유사 후보') < 0, '★ 유사 후보가 두 곳에 있다');
  assert.ok(더.indexOf('확실한 중복') > 0 && 띠.indexOf('확실한 중복') < 0, '★ 이상 없는 것이 띠에 올랐다');
  assert.match(더, /✓ 이상 없음/);
});

test('★ 할 일이 하나도 없으면 「더 손볼 것」에 여덟이 다 모인다', () => {
  const c = draw();
  assert.equal(c.todoList().length, 0);
  const 더 = c.html.slice(c.html.indexOf('더 손볼 것'), c.html.indexOf('푸른이알피 연동'));
  assert.equal(더.split('class="setbtn').length - 1, 8, '★ 여덟 가운데 흘린 것이 있다');
});

/* ── ②③④ 하위 화면 ── */

test('★★ 하위 화면은 «그것만» 보인다 — 목록 밑에 딸려 붙으면 어디 펼쳐졌는지 못 찾는다', () => {
  const c = draw({ sub: 'similar' });
  assert.equal(c._called, 'openSimilar', '★ 엉뚱한 화면을 열었다: ' + c._called);
  assert.ok(c.html.indexOf('class="setsec') < 0, '★ 목록이 그대로 딸려 나왔다');
  assert.ok(c.html.indexOf('setInline') > 0, '★ 하위 화면을 담을 자리가 없다');
});

test('★★ 되돌아가는 단추는 «하나»다 — 둘이면 어느 쪽이 위인지 알 수 없다', () => {
  const c = draw({ sub: 'trash' });
  assert.equal(c.html.split('class="setback"').length - 1, 2,
    '★ 「← 목록으로」와 「← 환경설정으로」 말고 다른 되돌리기가 더 있다');
  assert.ok(c.html.indexOf('← 환경설정으로') > 0, '★ 환경설정으로 되돌아갈 길이 없다');
  /* showPanel 도 스스로 붙이면 화면에 둘이 선다 — 거기서는 안 붙인다 */
  const sp = SRC.slice(SRC.indexOf('function showPanel(html){'), SRC.indexOf('function setSub(s){'));
  assert.ok(sp.indexOf('setback') < 0, '★ showPanel 이 되돌리기 단추를 또 붙인다');
});

test('★★ 하위 화면은 «인라인»으로 그린다 — 팝업으로 뜨면 화면 뒤에 목록이 남는다', () => {
  const c = draw({ sub: 'views' });
  assert.equal(c._targetWhenCalled, 'inline', '★ 팝업으로 열렸다');
  assert.equal(c._panelTarget, 'modal', '★ 열고 나서 되돌려 놓지 않았다 — 다음 팝업이 엉뚱한 곳에 그려진다');
});

test('★★ 하위 화면이 터져도 _panelTarget 은 «되돌아온다»', () => {
  const c = draw({ sub: 'dedup' });
  c._panelTarget = 'modal';
  let 터짐 = 0;
  c.openDedup = () => { 터짐++; throw new Error('일부러 터뜨림'); };
  c.state.setSub = 'dedup';
  c.renderSettingsPage();                       /* 여기서 터지면 검사 자체가 실패한다 */
  assert.equal(터짐, 1, '★ 터뜨릴 화면을 아예 부르지도 않았다 — 검사가 헛돈 것이다');
  assert.equal(c._panelTarget, 'modal', '★ inline 인 채로 굳었다 — 이후 모든 팝업이 안 뜬다');
});

test('★★ 모르는 이름이 오면 «목록»으로 되돌린다 — 빈 칸만 남으면 앱이 멈춘 줄 안다', () => {
  const c = draw({ sub: '없는이름' });
  assert.equal(c.state.setSub, '', '★ 모르는 이름이 그대로 남았다');
  assert.ok(c.html.indexOf('class="setsec') > 0, '★ 빈 화면이 됐다');
});

test('★★ 열 갈래가 «다» 열린다 — 하나만 빠져도 그 화면은 영영 못 연다', () => {
  const keys = ['dedup', 'similar', 'mixed', 'namefix', 'trash',
    'erpname', 'rules', 'views', 'mailblock', 'clean'];
  keys.forEach(k => {
    const c = draw({ sub: k });
    assert.ok(SUB_NAMES.indexOf(c._called) >= 0, '★ 「' + k + '」 을 열 수 없다');
  });
  /* 열쇠와 여는 이가 «짝»이다 — 하나가 두 번 쓰이면 다른 하나가 죽는다 */
  const got = keys.map(k => draw({ sub: k })._called);
  assert.equal(new Set(got).size, keys.length, '★ 두 열쇠가 같은 화면을 연다: ' + got.join(','));
});

/* ── 띠에서 눌러 들어가기 ── */

test('★★ 띠에서 누른 것이 그 화면으로 «이어진다» — 띠와 하위 화면이 같은 이름을 쓴다', () => {
  const c = draw({ sim: 3 });
  c.todoGo('similar');
  assert.equal(c._called, 'openSimilar', '★ 띠에서 눌렀는데 안 열린다: ' + c._called);
});
