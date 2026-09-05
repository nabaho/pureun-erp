/* 👷 근로자 — 사건별 명단 탭 (대표 지시 2026-09-05)

   「근로자에게는 [명함·사업자 유형 탭 줄]이 필요가 없다. 탭추가 기능만 넣고
    근로자들이 사건이 있을 경우 사건별로 명단을 정리할 수 있다. 종료시에는 해당
    근로자들 종료로 푸른이알피에서 클릭 되면 종료로 분류되었으면 좋겠다.」

   ■ 그 띠는 «근로자 화면 것이 아니었다»
   renderPC 가 근로자 화면에서 renderErpTabs 를 아예 안 불러, 명함 화면에서 그리고 온
   띠가 지워지지 않은 채 남아 있었다 — 근로자 14명을 보는데 「전체 6,309 · 자문 228」이
   떠 있었다. 눌러도 명함 화면으로 튄다.

   ★ 못 박는 것
     ① 탭 하나 = 사건 하나. 조건을 짜 넣지 않는다(사람이 사건에 드나들면 저절로 따라온다).
     ② 근로자 탭은 명함 탭 줄에 «절대» 안 섞이고, 그 반대도 안 된다.
     ③ 끝난 사건은 🚪 로 접는다 — 다만 «지금 보고 있는» 탭은 안 접는다.
     ④ 「없어진 사건」과 「끝난 사건」은 다르다 — 0명 탭은 그대로 서 있어야 지울 수 있다.
     ⑤ 명함 탭 얼개(applyView·countMatching·viewSig)를 쓰지 않는다 — state.tab 을 건드린다.

     node --test tests/cards-worker-case-tabs.test.js */
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

/* 사람 하나를 짓는다 — wkListBuild 가 내놓는 모양 그대로 */
function P(name, cases) {
  return { key: name, name: name, company: (cases[0] || {}).company || '',
           cases: cases, docs: [], primaryOf: {}, paid: {}, rank: 0 };
}
function C(caseKey, o) {
  return Object.assign({ caseKey: caseKey, caseNo: caseKey, title: '사건 ' + caseKey,
                         company: '가나상사', stat: 'run', year: 2026, n: 1 }, o || {});
}

/* 알맹이를 통째로 떠서 «돌린다» */
function load(opt) {
  const o = Object.assign({ people: [], views: {}, wkCase: '', wkTabDone: false }, opt || {});
  const ctx = {
    console,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    $: () => null,
    document: { body: { classList: { contains: () => true } } },
    state: { view: 'wk', tab: 'card', wkCase: o.wkCase, wkTabDone: o.wkTabDone,
             wkFolder: '', wkQ: '', wkPage: 0, views: o.views },
    wkList: () => o.people,
    wkFolderPick: () => (() => true),
    wkMatch: () => true,
    closeWkDetail: () => { ctx._closed = (ctx._closed || 0) + 1; },
    renderWkPage: () => { ctx._drew = (ctx._drew || 0) + 1; },
    renderWkMobile: () => { },
    renderErpTabs: () => { ctx._tabs = (ctx._tabs || 0) + 1; },
    renderPCSide: () => { },
    toast: (m) => { ctx._toast = m; },
    prompt: () => ctx._answer,
    confirm: () => !!ctx._yes,
    showPanel: h => { ctx._panel = h; },
    _closeBtn: () => '',
    uid: () => 'newid',
    Store: { putView: v => { (ctx._put = ctx._put || []).push(v); },
             delView: id => { (ctx._del = ctx._del || []).push(id); } }
  };
  vm.createContext(ctx);
  const a = SRC.indexOf('function wkRepaint(){');
  /* ⚠ 「🔗 회사 열쇠」라는 글자는 위쪽 설계 주석에도 있다 — a «뒤»에서 찾아야 한다 */
  const b = SRC.indexOf('/* ══════ 🔗 회사 열쇠', a);
  assert.ok(a > 0 && b > a, '알맹이를 못 찾았다');
  /* ⚠ 최상위 let/const 는 컨텍스트 값이 되지 않는다 — var 로 바꿔 실어야 꺼내 본다 */
  vm.runInContext(SRC.slice(a, b).replace(/\nlet /g, '\nvar ').replace(/\nconst /g, '\nvar '), ctx);
  /* 거르개는 목록 쪽에 있다 — 함께 실어야 「사건 탭이 정말 거르나」를 볼 수 있다 */
  const ca = SRC.indexOf('function wkCasePick(caseKey){');
  const cb = SRC.indexOf('/* ── 주민번호는 가려서');
  assert.ok(ca > 0 && cb > ca, '거르개를 못 찾았다');
  vm.runInContext(SRC.slice(ca, cb), ctx);
  return ctx;
}
const V = (id, caseKey, o) => Object.assign(
  { id: id, name: '탭' + id, kind: 'wk', scope: 'all', order: 1, f: { wkCase: caseKey } }, o || {});
const views = (...vs) => { const m = {}; vs.forEach(v => { m[v.id] = v; }); return m; };

/* ── ① 탭 하나 = 사건 하나 ── */

test('★★ 사건 목록은 «사람에게 걸린» 사건만 — 사람이 없는 사건은 고를 수 없다', () => {
  const c = load({ people: [P('가', [C('k1')]), P('나', [C('k1'), C('k2')])] });
  const cs = c.wkCases();
  assert.equal(cs.map(x => x.caseKey).sort().join(','), 'k1,k2');
  assert.equal(cs.filter(x => x.caseKey === 'k1')[0].n, 2, '★ 사람 수를 잘못 센다');
  assert.equal(cs.filter(x => x.caseKey === 'k2')[0].n, 1);
});

test('★★ 사건 탭이 정말 «거른다» — 그 사건에 걸린 사람만 남는다', () => {
  const c = load({ people: [P('가', [C('k1')]), P('나', [C('k2')]), P('다', [C('k1'), C('k2')])],
                   wkCase: 'k1' });
  assert.equal(c.wkVisible().map(p => p.name).join(','), '가,다');
});

test('★★ 아무 탭도 안 골랐으면 «전부» 보인다 — 거르개가 늘 걸려 있으면 안 된다', () => {
  const c = load({ people: [P('가', [C('k1')]), P('나', [C('k2')])] });
  assert.equal(c.wkVisible().length, 2);
});

test('★ 탭 수는 «그 사건에 걸린 사람 수»다 — 화면에 보이는 것과 같아야 한다', () => {
  const c = load({ people: [P('가', [C('k1')]), P('나', [C('k1')]), P('다', [C('k2')])] });
  assert.equal(c.wkTabCount(V('t1', 'k1')), 2);
  assert.equal(c.wkTabCount(V('t2', 'k2')), 1);
  assert.equal(c.wkTabCount(V('t3', '없는열쇠')), 0);
});

/* ── ①-2 같은 이름 사건을 «가려 준다» ──
   ⚠ 사건 이름은 «갈래 이름»이라 겹친다. 대표 화면(2026-09-05)에 「산업재해등사건대리」가
     둘, 「임금퇴직금기타체불노동부대리」가 넷이었다. 사업장이 비어 있는 사건도 많아
     이름만 늘어놓으면 어느 것을 고르는지 알 수 없다. */

test('★★ 사업장이 있으면 사업장으로 가른다 — 사람 이름은 «안» 붙인다', () => {
  const c = load({ people: [P('강미향', [C('k1', { company: '중원대학교' })])] });
  const w = c.wkCaseWhich(c.wkCaseOf('k1'));
  assert.ok(w.indexOf('중원대학교') >= 0, '★ 사업장을 안 붙인다: ' + w);
  assert.ok(w.indexOf('1명') > 0, '★ 사람 수를 안 붙인다: ' + w);
  /* 둘 다 붙이면 탭 곁줄이 길어져 잘린다 — 가려 주는 것 «하나»면 된다 */
  assert.ok(w.indexOf('강미향') < 0, '★ 사업장이 있는데 사람 이름까지 붙였다: ' + w);
});

test('★ 같은 사람이 한 사건에 두 번 적혀 있어도 이름은 «한 번»만 — 이알피에 실제로 있다', () => {
  const c = load({ people: [P('심진숙', [C('k1', { company: '' }), C('k1', { company: '' })])] });
  const w = c.wkCaseWhich(c.wkCaseOf('k1'));
  assert.equal(w.indexOf('심진숙 · 심진숙'), -1, '★ 같은 이름이 두 번 적힌다: ' + w);
});

test('★★ 사업장이 «비었으면» 사람 이름으로 가른다 — 실제로 그런 사건이 많다', () => {
  const c = load({ people: [P('심진숙', [C('k1', { company: '', caseNo: '산재등-2026-001' })])] });
  const w = c.wkCaseWhich(c.wkCaseOf('k1'));
  assert.ok(w.indexOf('심진숙') >= 0, '★ 「산업재해등사건대리」 둘을 가릴 길이 없다: ' + w);
  assert.ok(w.indexOf('산재등-2026-001') > 0, '★ 사건번호도 없으면 정말 못 가른다: ' + w);
});

test('★ 이름 셋까지만 적고 나머지는 「외」 — 집단 진정은 스무 명도 된다', () => {
  const many = ['가', '나', '다', '라', '마'].map(n => P(n, [C('k1', { company: '' })]));
  const c = load({ people: many });
  const w = c.wkCaseWhich(c.wkCaseOf('k1'));
  assert.ok(w.indexOf('가 · 나 · 다 외') === 0, '★ 곁줄이 이름으로 넘친다: ' + w);
  assert.ok(w.indexOf('5명') > 0);
  assert.ok(w.indexOf('라') < 0 && w.indexOf('마') < 0);
});

test('★★ 고르는 창이 «같은 이름» 사건을 갈라 보여 준다 — 안 그러면 아무거나 누른다', () => {
  const c = load({ people: [P('故 권상석', [C('k1', { title: '산업재해등사건대리', company: '상대방미정' })]),
                            P('심진숙',   [C('k2', { title: '산업재해등사건대리', company: '' })])] });
  c.wkTabAdd();
  assert.equal(c._panel.split('산업재해등사건대리').length - 1, 2, '★ 두 건이 다 안 나온다');
  /* ⚠ 말풍선(title=)에만 있으면 «보이지 않는다» — 눈에 보이는 곁줄(.sdesc)을 본다.
       말풍선까지 세면, 곁줄을 통째로 지워도 초록이 된다(2026-09-05 에 실제로 샜다). */
  const 곁줄 = (c._panel.match(/<span class="sdesc">([^<]*)<\/span>/g) || []).join(' ');
  assert.ok(곁줄.indexOf('상대방미정') > 0 && 곁줄.indexOf('심진숙') > 0,
    '★ 이름이 같은 두 사건을 «화면에서» 가릴 길이 없다 — 아무거나 누르게 된다: ' + 곁줄);
});

test('★★ 탭 이름 기본값도 «다르게» 나온다 — 같은 이름 탭이 둘이면 못 가른다', () => {
  const c = load({ people: [P('심진숙', [C('k1', { title: '산업재해등사건대리', company: '' })])] });
  c._answer = '심진숙 산업재해등사건대리';        /* 사람이 그대로 눌렀다고 본다 */
  c.wkTabMake('k1');
  assert.equal(c._put[0].name, '심진숙 산업재해등사건대리');
  /* 기본값을 «무엇으로 내미는지»가 알맹이다 — prompt 의 둘째 값이다 */
  const seg = SRC.slice(SRC.indexOf('function wkTabMake(caseKey){'),
                        SRC.indexOf('/* ── 고치기·지우기 ── */'));
  assert.match(seg, /c\.company \|\| \(c\.who\|\|\[\]\)\[0\]/,
    '★ 사건 이름만 내민다 — 「산업재해등사건대리」 탭이 둘 생긴다');
});

/* ── ② 명함 탭과 안 섞인다 ── */

test('★★ 근로자 탭은 kind:\'wk\' 다 — 명함 탭 줄은 state.tab 으로 걸러 절대 안 섞인다', () => {
  const c = load({ views: views(V('t1', 'k1'), { id: 'c1', name: '자문', kind: 'card', f: {} }) });
  assert.equal(c.wkTabs().map(v => v.id).join(','), 't1', '★ 명함 탭이 근로자 줄에 섞였다');
  /* 반대쪽 — 명함 줄이 kind 로 거르는 그 한 줄이 살아 있어야 한다 */
  assert.match(fnBody('renderMyTabsHtml'), /\(v\.kind\|\|'card'\)===state\.tab/,
    '★ 명함 탭 줄이 kind 로 안 거른다 — 근로자 탭이 명함 화면에 샌다');
});

test('★★ 사건 열쇠가 «없는» 줄은 탭이 아니다 — 빈 탭은 눌러도 아무 일이 없다', () => {
  const c = load({ views: views(V('t1', 'k1'), V('t2', ''), { id: 't3', kind: 'wk' }) });
  assert.equal(c.wkTabs().map(v => v.id).join(','), 't1');
});

test('★★ 명함 탭 얼개를 «쓰지 않는다» — applyView 는 state.tab 을 바꿔 목록 화면으로 튄다', () => {
  const a = SRC.indexOf('function wkRepaint(){');
  const b = SRC.indexOf('/* ══════ 🔗 회사 열쇠', a);
  const seg = SRC.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, ' ');
  ['applyView(', 'countMatching(', 'viewSig(', 'viewSnapshot('].forEach(fn =>
    assert.ok(seg.indexOf(fn) < 0, '★ ' + fn + ' 를 부른다 — 명함 목록 화면이 바뀐다'));
});

/* ── ③ 종료 분류 ── */

test('★★ 푸른이알피에서 «종료»가 되면 그 탭이 🚪 로 접힌다', () => {
  const c = load({ people: [P('가', [C('k1')]), P('나', [C('k2', { stat: 'done' })])],
                   views: views(V('t1', 'k1'), V('t2', 'k2')) });
  const t = c.wkTabRows('');
  assert.equal(t.run.map(v => v.id).join(','), 't1', '★ 끝난 사건이 앞줄에 남았다');
  assert.equal(t.done.map(v => v.id).join(','), 't2', '★ 끝난 사건을 못 가렸다');
  assert.equal(c.wkTabDone(V('t2', 'k2')), true);
  assert.equal(c.wkTabDone(V('t1', 'k1')), false);
});

test('★★ 「없어진 사건」은 끝난 것이 아니다 — 0명 탭은 그대로 서 있어야 지울 수 있다', () => {
  const c = load({ people: [P('가', [C('k1')])], views: views(V('t9', '사라진열쇠')) });
  assert.equal(c.wkTabDone(V('t9', '사라진열쇠')), false,
    '★ 사람이 다 빠진 사건을 「종료」로 읽었다 — 🚪 안에 숨어 영영 못 찾는다');
  assert.equal(c.wkTabRows('').run.map(v => v.id).join(','), 't9');
});

test('★★ «지금 보고 있는» 끝난 탭은 안 접는다 — 보던 탭이 사라지면 어디인지 모른다', () => {
  const c = load({ people: [P('가', [C('k2', { stat: 'done' })])], views: views(V('t2', 'k2')) });
  assert.equal(c.wkTabRows('k2').run.map(v => v.id).join(','), 't2');
  assert.equal(c.wkTabRows('k2').done.length, 0);
  assert.equal(c.wkTabRows('').done.map(v => v.id).join(','), 't2');
});

test('★ 상태 잣대는 «푸른이알피 한 곳»이다 — 여기서 다시 판정하지 않는다', () => {
  const seg = SRC.slice(SRC.indexOf('function wkTabDone(v){'), SRC.indexOf('function wkTabCount(v){'));
  assert.match(seg, /c\.stat === 'done'/, '★ 사건 상태를 안 본다');
  assert.ok(!/closeDate|endDate|status/.test(seg),
    '★ 종료를 여기서 «다시» 판정한다 — 잣대가 둘이면 한쪽만 고쳐진다');
});

/* ── 탭 줄 그림 ── */

test('★★ 탭 줄에 「📋 전체」와 「＋ 탭 추가」가 있다 — 대표 지시 「탭추가 기능만」', () => {
  const h = load({ people: [P('가', [C('k1')])], views: views(V('t1', 'k1')) }).renderWkTabsHtml();
  assert.ok(h.indexOf('📋 전체') > 0, '★ 전체로 돌아갈 길이 없다');
  assert.ok(h.indexOf('＋ 탭 추가') > 0, '★ 탭을 만들 길이 없다');
  assert.ok(h.indexOf('wkTabAdd()') > 0, '★ 탭을 만드는 길이 없다 — 단추 글자만 남았다');
  /* 명함 유형 탭(자문·급여·노조…)은 이 줄에 «없어야» 한다 */
  assert.ok(h.indexOf('renderMyTabsHtml') < 0 && h.indexOf('tabChipClick') < 0,
    '★ 명함 탭 줄이 근로자 화면에 그대로 남았다');
});

test('★★ 🚪 접이는 «끝난 것이 있을 때만» 나온다', () => {
  const one = load({ people: [P('가', [C('k1')])], views: views(V('t1', 'k1')) });
  assert.ok(one.renderWkTabsHtml().indexOf('🚪 끝난 사건') < 0, '★ 끝난 것이 없는데 접이가 있다');
  const two = load({ people: [P('나', [C('k2', { stat: 'done' })])], views: views(V('t2', 'k2')) });
  const h = two.renderWkTabsHtml();
  assert.ok(h.indexOf('🚪 끝난 사건') > 0, '★ 접이가 없다');
  assert.ok(h.indexOf('탭t2') < 0, '★ 접어 두지 않고 펼쳐 놨다');
});

test('★ 펼치면 끝난 탭이 나온다', () => {
  const c = load({ people: [P('나', [C('k2', { stat: 'done' })])],
                   views: views(V('t2', 'k2')), wkTabDone: true });
  assert.ok(c.renderWkTabsHtml().indexOf('탭t2') > 0, '★ 펼쳤는데 안 나온다');
});

test('★★ 탭 줄은 명함 화면과 «같은 칸»에 그려지고, 근로자 화면에서 갈아 그린다', () => {
  const fn = fnBody('renderErpTabs');
  assert.match(fn, /state\.view==='wk' \? renderWkTabsHtml\(\)/, '★ 근로자 것으로 안 간다');
  assert.match(fn, /\$\('pcErpTabs'\)/, '★ 다른 칸에 그린다');
  const pc = fnBody('renderPC');
  assert.match(pc, /if\(isWk\)\{ renderErpTabs\(\); renderWkPage\(\); return; \}/,
    '★ 근로자 화면에서 탭 줄을 다시 안 그린다 — 명함 화면 띠가 그대로 남는다');
});

/* ── 누르기 ── */

test('★★ 같은 탭을 다시 누르면 «풀린다» — 「전체」를 찾아 누르는 걸음을 아낀다', () => {
  const c = load({ people: [P('가', [C('k1')])], views: views(V('t1', 'k1')) });
  c.wkTabPick('t1');
  assert.equal(c.state.wkCase, 'k1');
  c.wkTabPick('t1');
  assert.equal(c.state.wkCase, '', '★ 다시 눌러도 안 풀린다');
  assert.equal(c._drew, 2, '★ 다시 그리지 않으면 아무 일도 안 일어난 것처럼 보인다');
});

test('★ 「📋 전체」를 누르면 사건 거르개가 풀린다', () => {
  const c = load({ people: [P('가', [C('k1')])], wkCase: 'k1' });
  c.wkAllTab();
  assert.equal(c.state.wkCase, '');
  assert.equal(c._drew, 1);
});

/* ── 만들기 ── */

test('★★ 이미 탭이 있는 사건은 «다시 못 만든다» — 같은 탭이 둘이면 어느 쪽이 참인지 모른다', () => {
  const c = load({ people: [P('가', [C('k1')]), P('나', [C('k2')])], views: views(V('t1', 'k1')) });
  c.wkTabAdd();
  assert.ok(c._panel.indexOf('k2') > 0, '★ 아직 없는 사건이 안 나온다');
  assert.ok(c._panel.indexOf("wkTabMake('k1')") < 0, '★ 이미 있는 사건을 또 고르게 한다');
});

test('★ 걸린 사건이 아예 없으면 «그렇게 말한다» — 빈 창이 뜨면 고장인 줄 안다', () => {
  const c = load({ people: [] });
  c.wkTabAdd();
  assert.equal(c._panel, undefined, '★ 빈 창을 띄웠다');
  assert.match(String(c._toast), /사건에 걸린 근로자가 아직 없습니다/,
    '★ 걸린 사건이 없다고 말하지 않는다');
});

test('★ 다 만들어 두었으면 그것도 말한다', () => {
  const c = load({ people: [P('가', [C('k1')])], views: views(V('t1', 'k1')) });
  c.wkTabAdd();
  assert.equal(c._panel, undefined, '★ 고를 것이 하나도 없는 빈 창을 띄웠다');
  assert.match(String(c._toast), /모두 탭으로 나와 있습니다/, '★ 그렇게 말하지 않는다');
});

test('★★ 만들면 pucards/views 에 kind:\'wk\' 로 적고, 그 탭을 바로 «켠다»', () => {
  const c = load({ people: [P('가', [C('k1', { title: '부당해고' })])] });
  c._answer = '부당해고 명단';
  c.wkTabMake('k1');
  assert.equal((c._put || []).length, 1, '★ 저장하지 않았다');
  const v = c._put[0];
  assert.equal(v.kind, 'wk', '★ kind 가 wk 가 아니면 명함 탭 줄에 샌다');
  assert.equal(v.f.wkCase, 'k1');
  assert.equal(v.name, '부당해고 명단');
  assert.equal(c.state.wkCase, 'k1', '★ 만들고도 그 탭이 안 켜진다');
  /* ⚠ 서버가 되돌려 줄 때까지 기다리면 화면이 안 바뀌어 한 번 더 누른다 */
  assert.ok(c.state.views['newid'], '★ 화면 쪽에 바로 안 담았다 — 만든 탭이 잠깐 사라진다');
});

test('★ 이름을 안 적으면 아무것도 안 만든다', () => {
  const c = load({ people: [P('가', [C('k1')])] });
  c._answer = '   ';
  c.wkTabMake('k1');
  assert.equal(c._put, undefined, '★ 이름 없는 탭이 생겼다');
});

test('★ 없는 사건으로는 못 만든다', () => {
  const c = load({ people: [P('가', [C('k1')])] });
  c._answer = '아무개';
  c.wkTabMake('없는열쇠');
  assert.equal(c._put, undefined);
});

/* ── 지우기 ── */

test('★★ 묻고 지운다 — 「아니오」면 아무것도 안 지운다', () => {
  const c = load({ people: [P('가', [C('k1')])], views: views(V('t1', 'k1')) });
  c._yes = false;
  c.wkTabDel('t1');
  assert.equal(c._del, undefined, '★ 묻지도 않고 지웠다');
  assert.ok(c.state.views['t1'], '★ 화면에서도 지워 버렸다');
});

test('★★ 지우면 «보고 있던 것»도 함께 푼다 — 안 그러면 없는 탭으로 걸러진 채 남는다', () => {
  const c = load({ people: [P('가', [C('k1')]), P('나', [C('k2')])],
                   views: views(V('t1', 'k1')), wkCase: 'k1' });
  c._yes = true;
  c.wkTabDel('t1');
  assert.equal((c._del || []).join(','), 't1');
  assert.equal(c.state.views['t1'], undefined, '★ 화면 쪽에 남아 탭이 잠깐 되살아난다');
  assert.equal(c.state.wkCase, '', '★ 지운 탭으로 계속 걸러진다 — 목록이 통째로 빈다');
  assert.equal(c.wkVisible().length, 2);
});

test('★ 다른 탭을 지울 때는 보고 있던 것을 안 건드린다', () => {
  const c = load({ people: [P('가', [C('k1')])],
                   views: views(V('t1', 'k1'), V('t2', 'k2')), wkCase: 'k1' });
  c._yes = true;
  c.wkTabDel('t2');
  assert.equal(c.state.wkCase, 'k1', '★ 남의 탭을 지웠는데 보던 것이 풀렸다');
});

test('★ 이름 변경은 이름«만» 바꾼다 — 사건 열쇠가 바뀌면 명단이 통째로 달라진다', () => {
  const c = load({ people: [P('가', [C('k1')])], views: views(V('t1', 'k1')) });
  c._answer = '새 이름';
  c.wkTabRename('t1');
  assert.equal(c._put[0].name, '새 이름');
  assert.equal(c._put[0].f.wkCase, 'k1',
    '★ 이름을 바꾸며 사건 열쇠까지 갈아엎었다 — 명단이 통째로 달라진다');
  assert.equal(c._put[0].kind, 'wk', '★ kind 가 날아갔다 — 명함 탭 줄에 샌다');
  assert.equal(c.state.views['t1'].name, '새 이름', '★ 화면 쪽이 안 바뀌어 옛 이름이 남는다');
});

test('★ 이름을 비우면 안 바꾼다', () => {
  const c = load({ people: [P('가', [C('k1')])], views: views(V('t1', 'k1')) });
  c._answer = '';
  c.wkTabRename('t1');
  assert.equal(c._put, undefined);
});

/* ── 지우는 일은 여기서 안 한다 ── */

test('★★ 탭을 지워도 «사건과 근로자»는 안 건드린다 — 임자는 푸른이알피다', () => {
  const seg = SRC.slice(SRC.indexOf('function wkTabDel(id){'), SRC.indexOf('function wkTabDel(id){') + 900);
  assert.ok(!/erp|workerInfo|Store\.(del|put)\(|hardDel/.test(seg.replace(/delView|putView/g, '')),
    '★ 탭을 지우면서 다른 것도 건드린다');
});
