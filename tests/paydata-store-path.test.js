'use strict';
// js/pu-paydata-store.js 자리 계산 검사 — 실행: node --test tests/*.test.js
//   (이 환경의 node는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob으로 파일을 넘긴다.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStore() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-paydata-store.js' }).runInContext(sandbox);
  return sandbox.window.PuPaydataStore;
}

test('저장 층이 window에 붙는다', () => {
  assert.ok(loadStore(), 'window.PuPaydataStore 가 없습니다');
});

test('★ 다른 앱의 루트를 쓰지 않는다', () => {
  const S = loadStore();
  // data(포털)·pucards(기업정보함)·puphotos(사진첩)·payroll_os(급여관리)를 건드리면 실데이터가 오염된다.
  assert.equal(S.DB_ROOT, 'paydata');
  assert.equal(S.BUCKET_ROOT, 'pu_paydata');
});

test('귀속월 열쇠를 여러 표기에서 뽑는다', () => {
  const S = loadStore();
  assert.equal(S.monthKey('2026-08'), '202608');
  assert.equal(S.monthKey('202608'), '202608');
  assert.equal(S.monthKey('2026-8'), '202608');
  assert.equal(S.monthKey(new Date(2026, 7, 15).getTime()), '202608');
  assert.equal(S.monthKey(''), null);
  assert.equal(S.monthKey('올해'), null);
  assert.equal(S.monthKey('2026-13'), null);
});

test('근로계약서는 월과 상관없이 keep 칸으로 간다', () => {
  const S = loadStore();
  // 계약서는 월별 자료가 아니다. 월을 넘겨도 keep 이어야 한다.
  assert.equal(S.isKeepKind('contract'), true);
  assert.equal(S.isKeepKind('attend'), false);
  assert.equal(S.slotOf('contract', '2026-08'), S.KEEP);
  assert.equal(S.slotOf('attend', '2026-08'), '202608');
  assert.equal(S.slotOf('attend', ''), null);
});

test('★ 정보·미리보기·값 자리가 서로 갈라져 있다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  // 목록만 읽을 때 본문까지 내려받으면 앱이 느려진다. 반드시 분리한다.
  const item = S.itemPath('202608', 'a1');
  const thumb = S.thumbPath('202608', 'a1');
  const value = S.valuePath('202608', 'r1');
  assert.equal(item, 'paydata/u/U1/items/202608/a1');
  assert.equal(thumb, 'paydata/u/U1/thumbs/202608/a1');
  assert.equal(value, 'paydata/u/U1/values/202608/r1');
  assert.notEqual(item, thumb);
  assert.notEqual(item, value);
});

test('대기 칸은 사람별 자리와 공용 자리가 따로 있다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  assert.equal(S.pendingPath('p1'), 'paydata/u/U1/pending/p1');
  assert.equal(S.sharedPendingPath('p1'), 'paydata/pending_shared/p1');
});

test('남의 자리를 지정해 읽을 수 있다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  // 2차(권한)에서 쓴다 — 자리 계산은 지금 갖춰 둔다.
  assert.equal(S.itemPath('202608', 'a1', 'U2'), 'paydata/u/U2/items/202608/a1');
  assert.equal(S.pendingPath('p1', 'U2'), 'paydata/u/U2/pending/p1');
});

test('★ 로그인하지 않았으면 자리를 만들지 않고 알린다', () => {
  const S = loadStore();
  S.init({ uid: '' });
  // 빈 uid로 경로를 만들면 paydata/u//items 같은 자리에 실데이터가 들어간다.
  assert.throws(() => S.itemPath('202608', 'a1'), /로그인/);
});

test('★ 쓰기 경계가 되는 칸들이 규칙과 같은 이름이다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  // 콘솔 규칙은 u/$owner **아래 칸마다** 쓰기를 연다(deputy 는 주인만).
  // 여기 이름이 규칙과 어긋나면 그 칸은 아무도 쓸 수 없다 — 조용히 저장이 안 된다.
  const box = p => p.split('/')[3];
  assert.equal(box(S.itemPath('202608', 'a1')), 'items');
  assert.equal(box(S.pendingPath('p1')), 'pending');
  assert.equal(box(S.valuePath('202608', 'r1')), 'values');
  assert.equal(box(S.thumbPath('202608', 'a1')), 'thumbs');
  assert.equal(box(S.trashPath('a1')), 'trash');
  assert.equal(box(S.deputyPath('U2')), 'deputy');
});

test('도착 칸과 기록 자리는 사람 자리 밖에 있다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  // 도착 칸은 전 직원이 읽는다 — 사람 자리 안에 두면 남의 자리를 열어야 알 수 있다.
  assert.equal(S.arrivalPath('co_7', '202608'), 'paydata/arrivals/co_7/202608');
  assert.equal(S.accessLogPath('L1'), 'paydata/access_log/L1');
  assert.equal(S.handoffLogPath('H1'), 'paydata/handoff_log/H1');
  assert.equal(S.ownerPath('U2'), 'paydata/owners/U2');
});

test('★ 창고 파일은 올린 사람 자리에 놓인다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  // 창고 규칙은 실시간DB를 못 본다 → 대리인이 주인 자리에 직접 쓸 수 없다.
  // 그래서 파일은 항상 올린 사람 자리. 소속은 실시간DB가 정한다.
  assert.equal(S.filePath('202608', 'a1', 'pdf'), 'pu_paydata/U1/202608/a1.pdf');
  assert.equal(S.filePath(S.KEEP, 'a1', 'jpg'), 'pu_paydata/U1/keep/a1.jpg');
});

test('종류 목록에 다섯 가지가 있고 keep 은 근로계약서뿐이다', () => {
  const S = loadStore();
  const keys = S.KINDS.map(k => k.key);
  ['contract', 'attend', 'ledger', 'output', 'etc'].forEach(k => {
    assert.ok(keys.indexOf(k) >= 0, k + ' 종류가 없습니다');
  });
  // ⚠ vm 안에서 만든 배열은 Array 프로토타입이 달라 deepStrictEqual 이 실패한다
  //   (actual·expected 가 눈으로 같아 보여도 틀렸다고 나온다). 글자로 견준다.
  const keeps = S.KINDS.filter(k => k.keep).map(k => k.key).join(',');
  assert.equal(keeps, 'contract');
});

test('새 번호는 겹치지 않고 시간 순으로 늘어난다', () => {
  const S = loadStore();
  const a = S.newId(), b = S.newId();
  assert.notEqual(a, b);
  assert.ok(a < b, '번호가 시간 순이 아닙니다: ' + a + ' / ' + b);
});
