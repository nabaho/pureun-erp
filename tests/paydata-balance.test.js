'use strict';
/* 좌우 균형 · 담당자 번호(사번 순) · 총괄관리자 열람 (대표 지시 2026-08-17)
   실행: node --test tests/*.test.js · 목업 docs/mockups/paydata-balance.html */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

/* 업체 한 곳 — 담당자 사번과 이 달 도착 여부만 있으면 된다. */
function co(id, sid) { return { id: id, name: id + '상사', typeCode: '급여', managerMain: sid }; }

function load(opt) {
  opt = opt || {};
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1", isAdmin:' + (opt.isAdmin === false ? 'false' : 'true') + '});',
    'const $ = id => document.getElementById(id);',
    'const App = ' + JSON.stringify(Object.assign({
      companies: [], dir: null, owners: {}, arrivals: {}, shares: {},
      me: { uid: 'U1', email: 'a-001@pureun.kr' }, month: '2026-08', sideView: 'mine',
      viewingUid: '', viewingName: '', viewingDeputy: false, viewingAdmin: false, sharedBanner: null
    }, opt.app || {})) + ';',
    'App.render = function(){};',
    cut('esc'), cut('jsq'), cut('thisMonth'), cut('canWrite'), cut('bannerHtml'),
    cut('companyDocCount'), cut('coArrivedAt'), cut('sideViewModel'), cut('sideCtx'), cut('viewBarHtml'),
    'window.App = App; window.S = S; window.sideViewModel = sideViewModel;',
    'window.sideCtx = sideCtx; window.viewBarHtml = viewBarHtml;',
    'window.bannerHtml = bannerHtml; window.canWrite = canWrite;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

/* ══════ ③ 담당자 번호 — 사번 순 ══════ */

/* 「A-9」가 「A-10」보다 뒤로 가면 번호가 사번을 안 따라간다. 하이픈은 있기도
   없기도 하다 — 두 꼴이 뒤섞이면 같은 사람이 두 군데로 갈린다. */
test('★ 사번 줄 세우기 — 자릿수와 하이픈에 안 흔들린다', () => {
  const S = load().S;
  const k = S.sidKey;
  assert.ok(k('A-009') < k('A-010'), '9가 10보다 앞이어야 합니다');
  assert.ok(k('A-9') < k('A-10'), '하이픈 없는 자릿수도 맞아야 합니다');
  assert.equal(k('A-001'), k('A1'), '하이픈 있고 없고가 같은 사람입니다');
  assert.ok(k('A-100') < k('P-001'), '글자가 먼저입니다');
  assert.ok(k('a-002') > k('A-001'), '대소문자가 갈라 세우면 안 됩니다');
});

test('★ 담당자를 사번 순으로 세운다 — 가나다순이 아니다', () => {
  const S = load().S;
  const r = S.managerRoster(
    [co('c1', 'A-003'), co('c2', 'A-001'), co('c3', 'A-002')],
    [{ sid: 'A-001', name: '최기운' }, { sid: 'A-002', name: '박은비' }, { sid: 'A-003', name: '김보람' }],
    {});
  assert.equal(r.people.map(p => p.sid).join(','), 'A-001,A-002,A-003');
});

/* 「김보람(박은비)」 처럼 사번이 아닌 값이 중간에 끼어 번호를 받으면, 멀쩡한
   담당자처럼 보여 **고쳐야 할 것이 목록에 묻힌다**. */
test('★ 사번이 아닌 줄은 맨 아래로 내리고 번호를 안 준다', () => {
  const W = load({ app: { companies: [co('c1', 'P-002'), co('c2', 'A-001'), co('c3', '김보람(박은비)')] } });
  const m = W.sideViewModel(W.sideCtx());
  assert.equal(m.people.map(p => p.no).join(','), '1,2,–');
  assert.equal(m.people[2].badSid, true, '맨 아래가 잘못된 줄이어야 합니다');
  assert.equal(m.people.map(p => p.sid).join(','), 'A-001,P-002,김보람(박은비)');
});

test('★ 번호가 1부터 빠짐없이 이어진다', () => {
  const W = load({ app: { companies: ['A-001', 'A-002', 'A-003', 'A-004'].map((s, i) => co('c' + i, s)) } });
  const m = W.sideViewModel(W.sideCtx());
  assert.equal(m.people.map(p => p.no).join(','), '1,2,3,4');
});

test('★ 담당자 줄에 번호가 그려진다', () => {
  const W = load({ app: { companies: [co('c1', 'A-001')] } });
  const h = W.viewBarHtml();
  assert.match(h, /class="pno">1</, '번호 칸이 없습니다');
});

/* 사번은 업체관리에서 담당자를 고칠 때 필요한 값이다 — 줄에 적으면 이름이
   잘리므로 마우스를 얹었을 때 나오게 둔다. */
test('★ 사번 자체는 마우스를 얹으면 보인다', () => {
  const W = load({ app: { companies: [co('c1', 'A-001')] } });
  assert.match(W.viewBarHtml(), /title="[^"]*A-001/);
});

/* ══════ ② 좌우 균형 ══════ */

/* 가운데 정렬이면 화면이 넓을수록 **목록 칸과 본문 사이에 빈 자리**가 뜬다 —
   목록에서 고른 것이 본문에 나오는데 둘이 떨어져 같은 화면으로 안 읽힌다. */
test('★ 본문이 목록 칸에 붙어 있다 — 가운데로 밀려나지 않는다', () => {
  const m = html.match(/\nmain\{[^}]*\}/);
  assert.ok(m, 'main 규칙을 찾을 수 없습니다');
  assert.ok(!/margin:\s*0\s+auto/.test(m[0]),
    '★ 가운데 정렬이면 목록과 본문 사이가 벌어집니다: ' + m[0]);
});

/* 표가 화면 끝까지 늘어지면 눈이 줄을 놓친다 — 붙이되 끝없이 넓히지는 않는다. */
test('본문이 무한정 넓어지지는 않는다', () => {
  assert.match(html.match(/\nmain\{[^}]*\}/)[0], /max-width:\s*\d+px/);
});

/* 안내가 여섯 줄이면 담당자 이름이 그만큼 아래로 밀려 화면 밖으로 나간다.
   ⚠ 줄이되 **말을 없애지는 않는다** — title 로 옮겨 얹으면 그대로 나온다. */
test('★ 안내는 한 줄이고, 자세한 말은 마우스에 남겨 둔다', () => {
  const v = cut('viewBarHtml');
  const notes = v.match(/class="pnote[^"]*"[^>]*>/g) || [];
  assert.ok(notes.length >= 2, '안내 두 가지가 다 있어야 합니다');
  notes.forEach(n => assert.match(n, /title="/, '자세한 말이 사라졌습니다: ' + n));
  assert.match(v, /업체관리에서 사번으로 고쳐 주세요/, '고치는 방법을 지우면 안 됩니다');
  assert.match(html, /\.pnote\{[^}]*text-overflow:ellipsis/, '한 줄로 접히지 않습니다');
});

/* ══════ ① 총괄관리자 열람 ══════ */

test('★ 총괄관리자는 사유를 묻지 않고 연다 — 두 길 모두', () => {
  ['pickStaff', 'sideOpenCompany'].forEach(fn => {
    const src = cut(fn);
    assert.match(src, /S\.amAdmin\(\)/, fn + ' 에 관리자 갈림길이 없습니다');
    assert.match(src, /adminOpen\(/, fn + ' 이 관리자 길로 안 갑니다');
  });
});

/* 「사유는 안 묻지만 기록은 남는다」가 이 결정의 전부다 — 기록이 빠지면
   몰래 보는 것이 된다. */
test('★ 사유는 안 물어도 열람 기록은 남긴다', () => {
  const src = cut('adminOpen');
  assert.match(src, /S\.logAccess\(/, '기록을 안 남기면 몰래 보는 것입니다');
  assert.match(src, /총괄 점검/, '무엇으로 남는지가 적혀 있어야 합니다');
});

/* 기록에 실패했는데 그냥 들여보내면 「기록은 남는다」가 조용히 거짓말이 된다. */
test('★ 기록에 실패하면 들여보내지 않고 사유를 묻는다', () => {
  assert.match(cut('adminOpen'), /catch[\s\S]*return false/, '실패를 알리지 않습니다');
  ['pickStaff', 'sideOpenCompany'].forEach(fn =>
    assert.match(cut(fn), /if \(!ok\) askReason\(\)/, fn + ' 에 되돌리는 길이 없습니다'));
});

/* 관리자라도 **남의 자리는 보기만** 한다 — 고치는 것은 대리로 맡은 자리뿐이다. */
test('★ 총괄관리자라도 남의 자리를 고치지는 못한다', () => {
  const W = load({ app: { viewingUid: 'U9', viewingName: '박은비', viewingAdmin: true } });
  assert.equal(W.canWrite(), false, '★ 관리자에게 쓰기를 열면 남의 서랍이 바뀝니다');
});

test('★ 관리자로 연 자리는 기록이 남는다고 띠에 적는다', () => {
  const W = load({ app: { viewingUid: 'U9', viewingName: '박은비', viewingAdmin: true } });
  const b = W.bannerHtml();
  assert.match(b, /총괄관리자/);
  assert.match(b, /기록/, '기록이 남는다는 말이 있어야 사유를 안 물어도 됩니다');
  assert.match(b, /박은비/, '누구 자리인지 없으면 남의 자료를 내 것으로 봅니다');
});

test('대리로 맡은 자리 띠는 그대로다 — 관리자 띠가 덮어쓰지 않는다', () => {
  const W = load({ app: { viewingUid: 'U9', viewingName: '박은비', viewingDeputy: true, viewingAdmin: true } });
  assert.match(W.bannerHtml(), /맡은 자리/);
  assert.equal(W.canWrite(), true);
});

/* 자리를 떠날 때 표시를 안 지우면, 내 자리로 돌아온 뒤에도 남의 자리 띠가 남는다. */
test('★ 내 자리로 돌아오면 관리자 표시도 함께 지운다', () => {
  assert.match(cut('leaveSeat'), /App\.viewingAdmin = false/);
});

/* 관리자가 아닌 사람은 예전 그대로 — 사유를 적어야 열린다. */
test('★ 관리자가 아니면 사유 화면이 그대로 뜬다', () => {
  const src = cut('pickStaff');
  assert.match(src, /askReason\(\);\s*\}\)/, '관리자가 아닐 때 사유를 안 묻습니다');
});
