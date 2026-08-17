'use strict';
// 연차대장 덮어쓰기 막기 — node --test tests/erp-leave-ledger-merge.test.js
//
// 왜: dbSet 은 «모든 항목에 id 가 있는 배열»만 트랜잭션으로 병합한다.
//     연차대장 행은 {이름, 연도, …} 라 id 가 없어 병합을 못 타고 통째 덮어쓰기로 빠졌다.
//     게다가 화면이 열 때 대장을 한 번 찍어 두고 그걸 통째로 되썼다 —
//     열어 둔 사이 남이 넣은 행이 사라지는 길.
//     ⚠ 이 자리엔 2026-07 실데이터 사고 이력이 코드 주석에 남아 있다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(app[j] === '{') d++; else if(app[j] === '}'){ d--; if(!d){ j++; break; } } }
  return app.slice(i, j);
}
const TAB = app.slice(app.indexOf('function LeaveLedgerTab(){'), app.indexOf('function numInput(r, field){'));

function withIds(){
  const box = { Object, Array, String };
  vm.createContext(box);
  vm.runInContext(grab('leaveLedgerWithIds') + '\nthis.f = leaveLedgerWithIds;', box);
  return box.f;
}

/* ── 열쇠를 붙인다 ── */
test('이름+연도로 열쇠를 만든다', () => {
  const f = withIds();
  const r = f([{ name:'홍길동', year:2026 }, { name:'김철수', year:2025 }]);
  assert.equal(r.rows[0].id, 'll-홍길동|2026');
  assert.equal(r.rows[1].id, 'll-김철수|2025');
  assert.equal(r.changed, 2);
});

test('이미 붙은 것은 그대로 둔다 (헛저장하지 않게)', () => {
  const f = withIds();
  const once = f([{ name:'홍길동', year:2026 }]).rows;
  const twice = f(once);
  assert.equal(twice.changed, 0);
  assert.equal(twice.rows[0], once[0], '같은 객체를 그대로 돌려준다');
});

test('★ 같은 사람·같은 해가 둘이어도 열쇠가 겹치지 않는다', () => {
  // 겹치면 dbSet 의 중복제거가 «한 줄을 지운다» — 자료가 사라진다
  const f = withIds();
  const r = f([
    { name:'홍길동', year:2026, note:'첫째' },
    { name:'홍길동', year:2026, note:'둘째' },
    { name:'홍길동', year:2026, note:'셋째' },
  ]);
  const ids = r.rows.map(x => x.id);
  assert.equal(new Set(ids).size, 3, '셋 다 다른 열쇠여야 한다');
  assert.deepEqual(ids, ['ll-홍길동|2026', 'll-홍길동|2026#2', 'll-홍길동|2026#3']);
  assert.equal(r.dup, 2, '겹친 건수를 알려 준다');
});

test('겹친 것을 지우지 않는다', () => {
  const f = withIds();
  const r = f([{ name:'ㄱ', year:2026 }, { name:'ㄱ', year:2026 }]);
  assert.equal(r.rows.length, 2, '한 줄도 버리지 않는다');
});

test('이름·연도가 비어도 터지지 않는다', () => {
  const f = withIds();
  const r = f([{}, { name:null, year:null }, null, 'x']);
  assert.equal(r.rows.length, 4);
  assert.equal(r.rows[0].id, 'll-|');
  assert.equal(r.rows[2], null, '이상한 값은 그대로 흘려보낸다');
});

test('배열이 아니면 빈 손으로', () => {
  // vm 밖으로 나온 배열은 이쪽 Array 와 겨레가 달라 deepEqual 이 걸린다 — 길이로 본다
  const f = withIds();
  assert.equal(f(null).rows.length, 0);
  assert.equal(f({}).rows.length, 0);
  assert.equal(f(undefined).changed, 0);
});

/* ── 낡은 대장을 통째로 되쓰지 않는다 ── */
test('★ 저장 직전에 최신을 다시 읽어 내가 고친 행만 얹는다', () => {
  assert.match(TAB, /var cur = leaveLedgerWithIds\(dbGet\('leave_ledger', \[\]\)\)\.rows;/);
  assert.match(TAB, /var merged = cur\.map\(function\(r\)\{ return \(r && r\.id && byId\[r\.id\]\) \? byId\[r\.id\] : r; \}\);/);
  assert.match(TAB, /next\.forEach\(function\(r\)\{ if\(r && r\.id && !have\[r\.id\]\) merged\.push\(r\); \}\);/, '내가 새로 만든 행도 살린다');
  assert.match(TAB, /dbSet\('leave_ledger', merged\);/);
});

test('★ 서버가 바뀌면 화면을 다시 읽는다', () => {
  assert.match(TAB, /window\.addEventListener\('fb_data_changed', onChange\);/);
  assert.match(TAB, /window\.removeEventListener\('fb_data_changed', onChange\);/, '떠날 때 걷는다');
  assert.match(TAB, /if\(k !== 'leave_ledger' && k !== 'batch'\) return;/);
});

test('★ 치고 있는 중에는 화면을 갈아끼우지 않는다', () => {
  // 치던 숫자가 눈앞에서 사라지면 더 나쁘다
  assert.match(TAB, /if\(_editing\.current\) return;/);
  assert.match(app, /onFocus:function\(e\)\{ _editing\.current = true;/);
  assert.match(app, /onBlur:function\(\)\{ _editing\.current = false; \}/);
});

/* ── 한 줄만 고친다 ── */
test('★ 이름·연도가 아니라 열쇠로 그 줄만 짚는다', () => {
  // 같은 사람·같은 해가 둘이면 이름으로 찾을 때 «둘 다» 바뀐다
  assert.match(app, /function updField\(id, field, value\)\{/);
  assert.match(app, /if\(r && r\.id === id\)\{/);
  assert.ok(app.indexOf('updField(r.name,r.year') < 0, '옛 호출이 남으면 안 된다');
  assert.match(app, /updField\(r\.id, field,/);
  assert.match(app, /updField\(r\.id,'note',/);
});

/* ── 사고 경로를 다시 열지 않는다 ── */
test('★ 빈 대장을 서버로 올리지 않는다 (2026-07 사고 경로)', () => {
  const mig = TAB.slice(TAB.indexOf('var cur = dbGet(\'leave_ledger\', []);'));
  assert.match(mig, /if\(!Array\.isArray\(cur\) \|\| !cur\.length\) return;/);
  assert.ok(mig.indexOf('if(!Array.isArray(cur) || !cur.length) return;') < mig.indexOf('dbSet('),
    '저장 «전» 에 막아야 한다');
});

test('바뀐 게 없으면 저장하지 않는다', () => {
  assert.match(TAB, /if\(!r\.changed\) return;/);
});

test('겹친 행이 있으면 사람에게 말해 준다', () => {
  assert.match(TAB, /같은 사람·같은 해 행이 '\+r\.dup\+'건 겹쳐 있습니다 — 지우지 않고 그대로 두었습니다/);
});

/* ── 자료가 병합 길을 타는지 ── */
test('열쇠가 붙으면 dbSet 의 병합 조건을 만족한다', () => {
  // dbSet: 서버·로컬이 배열이고 모든 항목에 id 가 있어야 트랜잭션 병합
  assert.match(app, /_srvArr\.every\(function\(x\)\{ return x && x\.id; \}\)/);
  const f = withIds();
  const rows = f([{ name:'ㄱ', year:2026 }, { name:'ㄴ', year:2026 }, { name:'ㄱ', year:2026 }]).rows;
  assert.ok(rows.every(x => x && x.id), '모든 항목에 id 가 있어야 한다');
});
