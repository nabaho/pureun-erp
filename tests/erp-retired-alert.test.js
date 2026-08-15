'use strict';
// 퇴사자 미정산 알림 겹침 정리 — node --test tests/erp-retired-alert.test.js
//
// 왜: 미정산 «건마다» 알림이 한 줄씩 떴다. 열 건이면 종에 같은 이름이 열 번 뜬다.
//     같은 말이 반복되면 종을 아예 안 보게 되고, 그러면 진짜 알림도 같이 묻힌다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

// 알림을 만드는 토막만 떼어 돌린다 (7만 줄을 통째로 실행할 수는 없다)
const FROM = app.indexOf('        /* 퇴사자 미정산 성과급 (admin만)');
const TO   = app.indexOf('      // 확인(✓)한 알림은 숨김');
assert.ok(FROM > 0 && TO > FROM, '퇴사자 알림 토막을 찾을 수 없습니다');
// ⚠ 이 토막은 「관리자만」 if 안에 있다 — 그 if 를 닫는 } 까지 물면 괄호가 안 맞는다
const BLK = app.slice(FROM, TO).replace(/\s*\}\s*$/, '\n');
assert.ok(!/\}\s*$/.test(BLK.trim()) || BLK.trim().endsWith('}'), '토막을 잘못 잘랐다');

function run(users, incomes){
  const box = { alerts: [], Object, String, Number,
    dbGet: (k, d) => (k === 'user_accounts' ? users : k === 'finance_income' ? incomes : d),
    _reads: 0 };
  box.dbGet = function(k, d){
    if(k === 'finance_income'){ box._reads++; return incomes; }
    if(k === 'user_accounts') return users;
    return d;
  };
  vm.createContext(box);
  vm.runInContext('var alerts = this.alerts;\n' + BLK, box);
  return box;
}

const U = (o) => Object.assign({ sid:'P-006', name:'임혜미', status:'retired', retireDate:'2026-06-30' }, o);
const INC = (date, name, shares) => ({ id:'fi'+date+name, date:date, companyName:name, perfShares:shares });

test('★ 미정산이 여러 건이어도 사람마다 한 줄', () => {
  const r = run([U()], [
    INC('2026-07-01', '가', [{ sid:'P-006', amount:100000 }]),
    INC('2026-07-05', '나', [{ sid:'P-006', amount:200000 }]),
    INC('2026-07-09', '다', [{ sid:'P-006', amount:300000 }]),
  ]);
  assert.equal(r.alerts.length, 1, '전에는 3줄이었다');
  assert.match(r.alerts[0].text, /임혜미 3건 600,000원/);
});

test('건수와 금액을 알려 준다 — 어느 건인지는 화면이 말한다', () => {
  const r = run([U()], [INC('2026-07-01', '가', [{ sid:'P-006', amount:100000 }])]);
  assert.match(r.alerts[0].text, /퇴사자 미정산 성과급 · 임혜미 1건 100,000원/);
  assert.match(r.alerts[0].text, /근로자명부 › 퇴사 후 현황에서 정산/, '갈 곳을 가리킨다');
  assert.ok(r.alerts[0].text.indexOf('가') < 0 || !/\(가\)/.test(r.alerts[0].text), '업체명을 늘어놓지 않는다');
});

test('사람이 여럿이면 사람 수만큼', () => {
  const r = run([U(), U({ sid:'P-009', name:'김아무' })], [
    INC('2026-07-01', '가', [{ sid:'P-006', amount:1 }, { sid:'P-009', amount:2 }]),
    INC('2026-07-02', '나', [{ sid:'P-006', amount:3 }]),
  ]);
  assert.equal(r.alerts.length, 2);
  assert.match(r.alerts[0].text, /임혜미 2건 4원/);
  assert.match(r.alerts[1].text, /김아무 1건 2원/);
});

test('정산이 끝난 건은 세지 않는다', () => {
  const r = run([U()], [
    INC('2026-07-01', '가', [{ sid:'P-006', amount:100000, paid:true }]),
    INC('2026-07-02', '나', [{ sid:'P-006', amount:200000 }]),
  ]);
  assert.equal(r.alerts.length, 1);
  assert.match(r.alerts[0].text, /1건 200,000원/);
});

test('다 정산했으면 알림이 없다', () => {
  const r = run([U()], [INC('2026-07-01', '가', [{ sid:'P-006', amount:100000, paid:true }])]);
  assert.equal(r.alerts.length, 0);
});

test('퇴사일 전 것은 세지 않는다', () => {
  const r = run([U()], [
    INC('2026-05-01', '가', [{ sid:'P-006', amount:100000 }]),   // 퇴사 전
    INC('2026-07-01', '나', [{ sid:'P-006', amount:200000 }]),
  ]);
  assert.match(r.alerts[0].text, /1건 200,000원/);
});

test('퇴사일이 없으면 건너뛴다 (기준이 없다)', () => {
  const r = run([U({ retireDate:'' })], [INC('2026-07-01', '가', [{ sid:'P-006', amount:100000 }])]);
  assert.equal(r.alerts.length, 0);
});

test('재직자는 여기 안 나온다', () => {
  const r = run([U({ status:'active' })], [INC('2026-07-01', '가', [{ sid:'P-006', amount:1 }])]);
  assert.equal(r.alerts.length, 0);
});

test('이름으로만 적힌 옛 자료도 찾아낸다', () => {
  // 옛 분배 기록은 sid 대신 이름이 들어 있기도 하다 — 종전 판정 규칙 그대로 지킨다
  const r = run([U()], [
    INC('2026-07-01', '가', [{ sid:'임혜미', amount:100000 }]),
    INC('2026-07-02', '나', [{ name:'임혜미', amount:200000 }]),
  ]);
  assert.match(r.alerts[0].text, /2건 300,000원/);
});

test('★ 입금 자료를 사람 수만큼 다시 읽지 않는다', () => {
  const r = run([U(), U({ sid:'P-009', name:'김아무' }), U({ sid:'P-010', name:'박아무' })],
    [INC('2026-07-01', '가', [{ sid:'P-006', amount:1 }])]);
  assert.equal(r._reads, 1, '전에는 사람 수만큼(3번) 읽고 풀었다');
});

test('퇴사자가 없으면 입금 자료를 아예 안 읽는다', () => {
  const r = run([U({ status:'active' })], [INC('2026-07-01', '가', [{ sid:'P-006', amount:1 }])]);
  assert.equal(r._reads, 0);
});

test('알림 종류는 그대로 retired (숨김 기록·묶음이 그대로 돈다)', () => {
  const r = run([U()], [INC('2026-07-01', '가', [{ sid:'P-006', amount:1 }])]);
  assert.equal(r.alerts[0].type, 'retired');
  assert.equal(r.alerts[0].color, '#2563eb');
});
