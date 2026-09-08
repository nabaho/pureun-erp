/* 유형 탭(자문·급여·노조·기금·🚪 해지)은 «폴더 안»에서만 (대표 지시 2026-09-08)
   「전체명함에 캡쳐2는 필요없다. 업체관리에 캡쳐2의 세부정보가 필요하다. …
    명함, 사업자 근로자 모두 같다. 전체에 자문 급여 노조 기금 해지 등은 필요없다.
    대시보드에 있기 때문에 2중으로 있고 많이 헤깔린다. 한번에 깔끔하게 정리하라.」

   ■ 무엇이 문제였나
   유형 탭은 `scope:'all'` 로 심겨 있어 «「전체」에서만» 보였다. 그래서
     ① 「전체」에서는 옆줄 폴더와 겹쳐 같은 것을 두 번 세는 줄이 되고,
     ② 정작 필요한 「업체관리 안의 자문 몇 곳」은 어디에서도 볼 수 없었다.
        전체의 「자문 231」은 어느 폴더의 수도 아니다.
     ③ 「노조 0 · 기금 0」이 늘 서 있어 줄만 길었다.

   ★ 못 박는 것
     ① 「전체」에서는 유형 탭을 «안 그린다».
     ② 폴더 안에서는 «그 폴더로 좁혀» 그린다 — 수가 전체 수와 달라야 한다.
     ③ 0 곳이면 그 칩은 빠진다.
     ④ 누르면 «지금 폴더를 그대로» 두고 조건만 입힌다. 폴더를 «값»으로 넘기지 않는다
        (state.group 은 빈 글자가 미분류라 `||'all'` 로 갈음하면 전체로 튄다).
     ⑤ 탭 자체는 «지우지 않는다». 폴더 안에서 대표가 직접 만든 유형 탭도 안 없앤다.
     ⑥ 그리는 곳과 누르는 곳은 «잣대 하나»(tabChipLent)를 본다.

     node --test tests/cards-type-tabs-in-folder.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
const NAMES = ['isErpTypeTab', 'tabChipLent', 'tabIcon', 'tabChipTip', 'tabChipAction',
  'tabChipClick', 'viewSnapshot', 'viewSig', 'applyView', 'updateView', 'renderMyTabsHtml'];

/* 명함 더미 — 「폴더로 좁혀 센다」를 확인할 수 있게 폴더마다 유형을 다르게 둔다.
   ⚠ 전체 수와 폴더 수가 «같으면» 좁혔는지 안 좁혔는지 구별할 수 없다. 일부러 다르게. */
const ITEMS = [
  { g: 'G1', t: '자문' }, { g: 'G1', t: '자문' }, { g: 'G1', t: '자문' },   /* 업체관리 자문 3 */
  { g: 'G1', t: '급여' },                                                   /* 업체관리 급여 1 */
  { g: 'G2', t: '자문' }, { g: 'G2', t: '자문' },                           /* 지인 자문 2 */
  { g: 'G2', t: '' }, { g: 'G3', t: '' }                                    /* 유형 없는 것 */
];
/* 「전체 자문」은 5 — 폴더 안에서 5 가 보이면 안 좁힌 것이다 */

function views() {
  const mk = (id, name, erpFilter, scope, extra) => Object.assign({
    id: id, name: name, kind: 'card', scope: scope, order: 1000,
    f: {
      q: '', group: (scope === 'all' ? 'all' : scope), owner: 'all', region: '',
      erpFilter: erpFilter, colFilter: {}, onlyPhone: false, onlyEmail: false,
      onlyIncomplete: false, onlyPrivate: false, onlyDup: false
    }
  }, extra || {});
  return {
    t1: mk('t1', '자문', '자문', 'all'),
    t2: mk('t2', '급여', '급여', 'all'),
    t3: mk('t3', '노조', '노조', 'all'),
    t4: mk('t4', '🚪 해지', 'closed', 'all'),
    m1: mk('m1', '변호사', '', 'G1', { manual: true }),      /* 폴더의 담는 탭 */
    b1: mk('b1', '사업자자문', '자문', 'all', { kind: 'biz' })
  };
}

function draw(opt) {
  const o = Object.assign({ group: 'all', views: views(), erpFilter: '', tab: 'card' }, opt || {});
  const ctx = {
    console, Object, String, Number, Array, JSON, Date, Math,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    state: {
      tab: o.tab, group: o.group, owner: 'all', region: '', erpFilter: o.erpFilter, erpMgr: '',
      colFilter: {}, onlyPhone: false, onlyEmail: false, onlyIncomplete: false,
      onlyPrivate: false, onlyDup: false, vtab: '', sort: 'date', sortKey: null, sortDir: 'desc',
      sel: {}, isAdmin: true, views: o.views,
      groups: { G1: { id: 'G1', name: '업체관리' }, G2: { id: 'G2', name: '지인' }, G3: { id: 'G3', name: '노무사' } }
    },
    allGroups: () => ctx.state.groups,
    $: () => null,                                    /* 찾기 칸은 없다 — viewSnapshot 이 '' 로 본다 */
    render: () => { ctx._drew = (ctx._drew || 0) + 1; },
    _syncSearchX: () => { },
    toast: m => { ctx._toast = m; },
    confirm: m => { ctx._asked = m; return o.yes !== false; },
    Store: { putView: v => { ctx._put = v; } },
    doAddToTab: () => { },
    /* 목록과 같은 잣대로 «센다» — 폴더와 유형 둘 다 본다 */
    countMatching: f => {
      f = f || {};
      ctx._counted = (ctx._counted || []).concat([[f.group || 'all', f.erpFilter || '']]);
      return ITEMS.filter(it =>
        ((f.group || 'all') === 'all' || it.g === f.group) &&
        (!f.erpFilter || it.t === f.erpFilter)).length;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(NAMES.map(fnBody).join('\n'), ctx);
  ctx.html = ctx.renderMyTabsHtml();
  /* 화면에 선 칩 이름들 — 「📋 전체」와 「＋ 탭 추가」는 칩이 아니다 */
  ctx.chips = (ctx.html.match(/onclick="tabChipClick\('[^']+'\)"[^>]*>[^<]*/g) || [])
    .map(s => s.replace(/^[\s\S]*?>/, '').replace(/^[＋🔍🏷\s]+/, '').trim());
  return ctx;
}

/* ── ① 「전체」에서는 안 보인다 ── */

test('★★★ 「전체」에서 유형 탭이 «한 개도» 안 보인다 — 대시보드와 두 번 세던 줄이다', () => {
  const c = draw({ group: 'all' });
  ['자문', '급여', '노조', '해지'].forEach(n => assert.ok(c.chips.indexOf(n) < 0
    && c.html.indexOf('>' + n) < 0,
    '★ 「전체」에 「' + n + '」 칩이 남아 있다 — 지금 지적받은 그 줄이다\n' + c.chips.join(' / ')));
  assert.equal(c.chips.length, 0, '★ 「전체」에 칩이 남았다: ' + c.chips.join(' / '));
});

test('★★ 그래도 「📋 전체」와 「＋ 탭 추가」는 남는다 — 돌아올 길과 만들 길이다', () => {
  const c = draw({ group: 'all' });
  assert.match(c.html, /onclick="showAllInFolder\(\)"/, '★ 「📋 전체」가 사라졌다');
  assert.match(c.html, /📋 전체/, '★ 「📋 전체」 글자가 없다');
  assert.match(c.html, /onclick="saveCurrentAsView\(\)"/, '★ 「＋ 탭 추가」가 사라졌다');
  assert.match(c.html, /＋ 탭 추가/, '★ 「＋ 탭 추가」 글자가 없다');
  /* 「📋 전체」의 수는 이 폴더 전체다 */
  assert.match(c.html, /📋 전체\s*\n?\s*<b[^>]*>8<\/b>/, '★ 「전체」 수가 8 이 아니다');
});

test('★★ 사업자·근로자도 «같다» — 화면마다 갈리면 또 헷갈린다', () => {
  /* 사업자(biz)도 같은 함수를 쓰고, 같은 잣대로 걸러진다 */
  const c = draw({ group: 'all', tab: 'biz' });
  assert.equal(c.chips.length, 0, '★ 전체 사업자등록증에 유형 칩이 남았다: ' + c.chips.join(' / '));
  /* 근로자 화면은 이 함수를 아예 안 쓴다 — 사건 탭을 그린다 */
  const wk = fnBody('renderWkTabsHtml');
  assert.ok(wk.indexOf('renderMyTabsHtml') < 0 && wk.indexOf('erpFilter') < 0,
    '★ 근로자 탭 줄에 유형 탭이 섞였다');
});

/* ── ② 폴더 안에서는 그 폴더로 «좁혀» ── */

test('★★★ 업체관리에서는 보이고, 수가 «그 폴더의» 수다 — 전체 수를 보이면 뜻이 없다', () => {
  const c = draw({ group: 'G1' });
  assert.ok(c.chips.indexOf('자문') >= 0, '★ 폴더 안에 「자문」 칩이 없다: ' + c.chips.join(' / '));
  /* 업체관리 자문은 3 곳. 전체 자문은 5 곳 — 5 가 보이면 안 좁힌 것이다. */
  assert.match(c.html, /자문\s*\n?\s*<b[^>]*>3<\/b>/,
    '★ 「자문」 수가 3(이 폴더)이 아니다 — 전체 수(5)를 그대로 보이고 있다');
  assert.ok(c.html.indexOf('>5</b>') < 0, '★ 어딘가에 전체 자문 수(5)가 남아 있다');
  /* 셀 때 폴더를 «끼워» 물었는가 */
  assert.ok(c._counted.some(p => p[0] === 'G1' && p[1] === '자문'),
    '★ 「G1 안의 자문」을 센 적이 없다 — 잰 것과 보인 것이 다르다');
  assert.ok(!c._counted.some(p => p[0] === 'all' && p[1] === '자문'),
    '★ 「전체 자문」을 세고 있다 — 폴더를 안 끼웠다');
  /* 세는 일은 목록을 통째로 훑는 것이다(listItems). 0 인지 보려고 한 번, 화면에 쓰려고
     또 한 번 세면 폴더를 열 때마다 6,309장을 두 벌씩 훑는다 — 미리 센 수를 들고 온다. */
  assert.equal(c._counted.filter(p => p[0] === 'G1' && p[1] === '자문').length, 1,
    '★ 같은 것을 두 번 센다 — 폴더를 열 때마다 목록을 두 벌씩 훑는다');
});

test('★★ 「어디의」 수인지 말해 준다 — 「자문」만으로는 어느 폴더인지 모른다', () => {
  const c = draw({ group: 'G1' });
  assert.match(c.html, /title="업체관리 안의 자문 — 3개"/,
    '★ 빌려 온 칩의 말풍선이 폴더 이름을 안 말한다');
});

/* ── ③ 0 곳이면 빠진다 ── */

test('★★★ 0 곳인 유형 탭은 «아예 빠진다» — 「노조 0 · 기금 0」이 어수선함의 정체였다', () => {
  const c = draw({ group: 'G1' });
  assert.ok(c.chips.indexOf('노조') < 0, '★ 0 곳인 「노조」가 서 있다: ' + c.chips.join(' / '));
  assert.ok(c.chips.indexOf('🚪 해지') < 0, '★ 0 곳인 「해지」가 서 있다');
  assert.equal(c.chips.sort().join(','), '급여,변호사,자문',
    '★ 업체관리에 선 칩이 다르다: ' + c.chips.join(' / '));
  /* 유형이 아예 없는 폴더는 예전 「전체」 모양 그대로다 */
  const g3 = draw({ group: 'G3' });
  assert.equal(g3.chips.length, 0, '★ 노무사 폴더에 칩이 섰다: ' + g3.chips.join(' / '));
});

/* ── ⑤ 지우지 않는다 ── */

test('★★★ 폴더의 «제» 탭은 그대로 남는다 — 빼기만 하면 자료를 잃은 것과 같다', () => {
  const c = draw({ group: 'G1' });
  assert.ok(c.chips.indexOf('변호사') >= 0, '★ 폴더의 담는 탭이 사라졌다');
  /* 폴더 «안에서» 직접 만든 유형 탭도 안 없앤다 */
  const vs = views();
  vs.own = { id: 'own', name: '자문', kind: 'card', scope: 'G1', order: 5,
    f: { q: '', group: 'G1', owner: 'all', region: '', erpFilter: '자문', colFilter: {} } };
  const d = draw({ group: 'G1', views: vs });
  assert.ok(d.chips.indexOf('자문') >= 0, '★ 폴더 안에서 만든 유형 탭이 사라졌다');
  /* 같은 유형이 둘 서면 어느 쪽을 눌러야 하는지 모른다 — 빌려 온 것은 물러난다 */
  assert.equal(d.chips.filter(n => n === '자문').length, 1,
    '★ 「자문」 칩이 둘이다: ' + d.chips.join(' / '));
  assert.ok(d.html.indexOf(`tabChipClick('own')`) > 0, '★ 폴더 제 것이 아니라 빌려 온 것이 섰다');
  assert.ok(d.html.indexOf(`tabChipClick('t1')`) < 0, '★ 빌려 온 것이 겹쳐 섰다');
});

test('★★ 탭을 저장소에서 지우지 «않는다» — 씨앗은 다시 심기지 않으니 되돌릴 길이 없다', () => {
  const c = draw({ group: 'all' });
  assert.equal(Object.keys(c.state.views).length, 6, '★ 탭이 사라졌다');
  assert.equal(c._put, undefined, '★ 그리는 중에 탭을 고쳐 썼다');
  /* 「내 탭 관리」는 화면에서 안 보이는 탭까지 «모두» 보여야 한다 */
  const mgr = fnBody('openViewManager');
  assert.match(mgr, /filter\(v=>v&&v\.id\)/, '★ 내 탭 관리가 탭을 걸러 낸다 — 관리할 자리가 없어진다');
  assert.ok(!/scope\|\|'all'\)===/.test(mgr), '★ 내 탭 관리가 폴더로 거른다');
});

/* ── ④ 누르면 폴더가 그대로 ── */

test('★★★ 폴더에서 유형 탭을 누르면 «그 폴더 안»의 그 유형이 된다', () => {
  const c = draw({ group: 'G1' });
  c.tabChipClick('t1');
  assert.equal(c.state.group, 'G1', '★ 폴더에서 튀어나왔다 — 전체 자문이 되었다');
  assert.equal(c.state.erpFilter, '자문', '★ 조건이 안 걸렸다');
  assert.ok(c._drew, '★ 다시 그리지 않았다');
});

test('★★★ 폴더를 «값»으로 넘기지 않는다 — 미분류(빈 글자)에서 전체로 튄다', () => {
  /* state.group 은 «빈 글자»가 미분류 폴더다. 넘겨받은 값을 `||'all'` 로 갈음하는
     순간 미분류에서 전체로 튄다 — 그래서 갈래를 참/거짓으로 넘긴다. */
  const c = draw({ group: '' });
  c.applyView('t1', true);
  assert.equal(c.state.group, '', '★ 미분류에서 전체로 튀었다');
  const fn = fnBody('applyView');
  assert.match(fn, /state\.group = keepFolder \? state\.group : \(f\.group\|\|'all'\)/,
    '★ 폴더를 값으로 넘기고 있다');
});

test('★★ keepFolder 를 안 주면 «예전 그대로» — 다른 곳에서 부르는 길을 바꾸지 않는다', () => {
  const c = draw({ group: 'G1' });
  c.applyView('t1');
  assert.equal(c.state.group, 'all', '★ 예전 방식(탭에 저장된 폴더)이 깨졌다');
  assert.equal(c.state.erpFilter, '자문');
});

test('★★ 눌러 둔 칩이 «켜져» 보인다 — 어디에 있는지 모르면 되돌릴 수 없다', () => {
  const c = draw({ group: 'G1', erpFilter: '자문' });
  const i = c.html.indexOf(`tabChipClick('t1')`);
  assert.ok(i > 0, '★ 자문 칩이 없다');
  const row = c.html.slice(c.html.lastIndexOf('<span draggable', i), i);
  assert.match(row, /background:#1e40af/, '★ 눌러 둔 자문 칩이 꺼져 보인다');
  /* 「📋 전체」는 반대로 꺼져 있어야 한다 */
  assert.ok(c.html.slice(0, c.html.indexOf('📋 전체')).indexOf('background:#1e293b') < 0,
    '★ 조건이 걸렸는데 「📋 전체」가 켜져 있다');
});

/* ── ⑥ 잣대는 한 곳 ── */

test('★★★ 그리는 곳과 누르는 곳이 «같은 잣대»(tabChipLent)를 본다', () => {
  const c = draw({ group: 'G1' });
  const vs = c.state.views;
  assert.equal(c.tabChipLent(vs.t1), true, '★ 폴더 안의 유형 탭을 빌려 온 것으로 안 본다');
  assert.equal(c.tabChipLent(vs.m1), false, '★ 담는 탭을 유형 탭으로 본다');
  /* 「빌려 온 것」이란 «남의 것»(scope 가 전체인 탭)이다. 이 폴더가 제 것으로 가진
     유형 탭은 빌려 온 것이 아니다 — 여기서 참이 되면 폴더 제 탭을 남의 것으로 다룬다. */
  assert.equal(c.tabChipLent({ scope: 'G1', f: { erpFilter: '자문' } }), false,
    '★ 이 폴더가 «제 것»으로 가진 유형 탭을 빌려 온 것이라 한다');
  c.state.group = 'all';
  assert.equal(c.tabChipLent(vs.t1), false, '★ 「전체」에서도 빌려 온 것이라 한다');
  /* 화면과 누르는 길이 둘 다 이 함수를 «부른다» */
  assert.match(fnBody('renderMyTabsHtml'), /all\.filter\(v=>tabChipLent\(v\)/,
    '★ 화면이 잣대를 안 쓴다 — 두 벌로 갈리면 보이는 수와 나오는 수가 달라진다');
  assert.match(fnBody('tabChipClick'), /applyView\(id, tabChipLent\(v\)\)/,
    '★ 누르는 길이 잣대를 안 쓴다');
});

test('★★ 유형 탭이 무엇인지 한 곳에서 정한다 — 담는 탭은 아니다', () => {
  const c = draw();
  assert.equal(c.isErpTypeTab({ f: { erpFilter: '자문' } }), true);
  assert.equal(c.isErpTypeTab({ manual: true, f: { erpFilter: '자문' } }), false,
    '★ 담는 탭을 유형 탭으로 본다 — 대표가 골라 담은 칸이 사라진다');
  assert.equal(c.isErpTypeTab({ f: { erpFilter: '' } }), false);
  assert.equal(c.isErpTypeTab(null), false);
});

/* ── 함정 하나 — 조건 갱신 ── */

test('★★★ 유형 탭에 «지금 폴더»를 박지 않는다 — 다른 폴더에서 통째로 사라진다', () => {
  /* 업체관리에서 「자문」을 켜 둔 채 ⋮ → 「지금 화면 조건으로 갱신」을 누른 자리 */
  const c = draw({ group: 'G1', erpFilter: '자문' });
  c.updateView('t1');
  assert.ok(c._asked, '★ 묻지 않고 덮어썼다');
  assert.ok(c._put, '★ 저장하지 않았다');
  assert.equal(c._put.f.group, 'all',
    '★ 유형 탭에 「G1」이 박혔다 — 다른 폴더에서는 0 곳이 되어 칩이 통째로 사라진다');
  assert.equal(c._put.f.erpFilter, '자문', '★ 유형이 사라졌다');
  /* 폴더의 «제» 탭은 예전대로 지금 폴더를 담는다 */
  const d = draw({ group: 'G1', erpFilter: '자문' });
  d.updateView('m1');
  assert.equal(d._put.f.group, 'G1', '★ 폴더 제 탭의 갱신이 깨졌다');
});
