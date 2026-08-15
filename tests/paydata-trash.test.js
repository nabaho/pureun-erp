'use strict';
// 휴지통 — 실행: node --test tests/*.test.js
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
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}

const REC = { companyId: 'co_1', kind: 'attend', month: '202608', filename: '근태.jpg', filedAt: 10, file: 'pu_paydata/U1/202608/a1.jpg' };

test('★ 지우면 휴지통으로 가고 원본 파일은 그대로 남는다', () => {
  const S = loadStore();
  const up = S.trashUpdate('a1', REC);
  // 창고 파일을 함께 지우면 되살릴 수 없다. 정보만 옮긴다.
  assert.ok(up['paydata/u/U1/trash/a1'], '휴지통에 안 들어갔습니다');
  assert.equal(up['paydata/u/U1/items/202608/a1'], null);
  assert.equal(up['paydata/u/U1/trash/a1'].file, REC.file);
});

test('★ 지우면 도착 표시도 함께 내려간다', () => {
  const S = loadStore();
  const up = S.trashUpdate('a1', REC);
  // 안 내리면 자료가 없는데 수신함이 「도착」이라고 말한다.
  assert.equal(up['paydata/arrivals/co_1/202608/attend/a1'], null);
});

test('근로계약서(keep)를 지우면 keep 칸에서 빠진다', () => {
  const S = loadStore();
  const rec = Object.assign({}, REC, { month: 'keep', kind: 'contract' });
  const up = S.trashUpdate('k1', rec);
  assert.equal(up['paydata/u/U1/items/keep/k1'], null);
  assert.equal(up['paydata/arrivals/co_1/keep/contract/k1'], null);
});

test('되살리면 원래 칸으로 돌아가고 도착 표시도 다시 켜진다', () => {
  const S = loadStore();
  const t = Object.assign({}, REC, { trashedAt: 500 });
  const up = S.restoreUpdate('a1', t);
  assert.ok(up['paydata/u/U1/items/202608/a1'], '원래 칸으로 안 돌아갔습니다');
  assert.equal(up['paydata/u/U1/trash/a1'], null);
  assert.equal(typeof up['paydata/arrivals/co_1/202608/attend/a1'], 'number');
});

test('★ 되살린 자료에는 지운 흔적(trashedAt·trashedBy)이 안 남는다', () => {
  const S = loadStore();
  const t = Object.assign({}, REC, { trashedAt: 500, trashedBy: 'U1' });
  const up = S.restoreUpdate('a1', t);
  const back = up['paydata/u/U1/items/202608/a1'];
  assert.equal(back.trashedAt, undefined);
  assert.equal(back.trashedBy, undefined);
});

test('휴지통 30일이 지났는지 가려낸다', () => {
  const S = loadStore();
  const day = 86400000, now = 100 * day;
  assert.equal(S.trashExpired({ trashedAt: now - 10 * day }, now), false);
  assert.equal(S.trashExpired({ trashedAt: now - 40 * day }, now), true);
  assert.equal(S.TRASH_DAYS, 30);
});

test('지운 시각을 모르면 지난 것으로 보지 않는다', () => {
  const S = loadStore();
  assert.equal(S.trashExpired({}, Date.now()), false);
  assert.equal(S.trashExpired(null, Date.now()), false);
});

test('자료 번호나 정보가 없으면 아무것도 만들지 않는다', () => {
  const S = loadStore();
  assert.throws(() => S.trashUpdate('', REC), /찾을 수 없습니다/);
  assert.throws(() => S.trashUpdate('a1', null), /찾을 수 없습니다/);
  assert.throws(() => S.restoreUpdate('', REC), /찾을 수 없습니다/);
});

test('★ 자동으로 지우는 함수가 없다', () => {
  const S = loadStore();
  // 자동 삭제는 어디에도 만들지 않는다(설계서 9장). 사람이 확인해 지운다.
  Object.keys(S).forEach(k => {
    assert.equal(/^auto|^purgeAll|^sweep/.test(k), false, '자동 삭제로 보이는 함수가 있습니다: ' + k);
  });
});

/* ══════ 화면 배선 ══════ */
const html = fs.readFileSync(path.join(__dirname, '..', 'pu-paydata.html'), 'utf8');

test('★ 서랍 화면 자료 줄에 지우기 단추가 있다', () => {
  const m = html.match(/function screenDrawer[\s\S]*?\n\}/);
  assert.match(m[0], /toTrash\(/);
});

test('★ 지우기 전에 확인을 받는다 — 조용히 지우지 않는다', () => {
  const m = html.match(/function toTrash[\s\S]*?\n\}/);
  assert.ok(m, 'toTrash 함수를 찾을 수 없습니다');
  assert.match(m[0], /confirm\(/);
});

test('★ 지운 뒤 30일 안에는 되살릴 수 있다고 알린다', () => {
  const m = html.match(/function toTrash[\s\S]*?\n\}/);
  assert.match(m[0], /30일/);
});

test('휴지통 화면에 지난 자료를 표시한다', () => {
  const m = html.match(/function screenTrash[\s\S]*?\n\}/);
  assert.ok(m, 'screenTrash 함수를 찾을 수 없습니다');
  assert.match(m[0], /trashExpired/);
});

test('되살리기 단추가 있다', () => {
  const m = html.match(/function screenTrash[\s\S]*?\n\}/);
  assert.match(m[0], /onclick="restoreItem\(/);
});

test('휴지통은 첫 화면에서 들어갈 수 있다', () => {
  assert.match(html, /App\.go\(\\'trash\\'\)/);
});
