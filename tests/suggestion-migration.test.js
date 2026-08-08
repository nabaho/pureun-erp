/* 건의함 옛 자료 이사 — 「해결 확인」 경로 만들기
   2026-08-07 실제 고장: 이사가 통째로 실패해 관리자 건의함이 아예 안 열렸다.

     update failed: values argument contains a path
     /suggestions_resolved_private/{uid} that is ancestor of another path
     /suggestions_resolved_private/{uid}/{건의id}

   옛 자료가 두 곳(uid로 적힌 것 · 메일로 적힌 것)에 나뉘어 있는데, 한쪽은
   **사람 통째로**(`.../{uid}`) 다른 쪽은 **건의 한 건씩**(`.../{uid}/{id}`) 적어서
   같은 사람이 양쪽에 다 있으면 위·아래 경로가 한 묶음에 들어갔다.
   파이어베이스는 이것을 서버에 보내기도 전에 거부한다 — 권한 문제가 아니다.

   그래서 **언제나 건의 한 건씩(잎사귀)만** 적어야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');

/* enter.html 안의 함수를 그대로 꺼내 돌린다 (다시 옮겨 적지 않는다 —
   옮겨 적으면 검사는 통과해도 진짜 코드는 고장난 채 남는다) */
/* vm 안에서 만든 객체는 프로토타입이 달라 deepEqual 이 그냥은 안 맞는다 — 값만 비교한다 */
const plain = (o) => JSON.parse(JSON.stringify(o));

function loadFn(name) {
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}');
  const m = source.match(re);
  assert.ok(m, `${name} 함수를 enter.html 에서 찾지 못했습니다.`);
  const ctx = {};
  vm.runInNewContext(m[0], ctx);
  return ctx[name];
}

const BASE = 'suggestions_resolved_private';
const UID_A = '6UlOw8aaOaZKt3zitZP4GhOybOJ2';   // 실제 고장 때의 uid
const UID_B = 'uid-two';
const ID1 = '-Oy3K3P8rtrma5IxuZi8';
const ID2 = '-Oy9zzzzzzzzzzzzzzzz';

const sgResolvedUpdates = loadFn('sgResolvedUpdates');

/* ── 진짜 고장 재현 ── */
test('같은 사람이 양쪽에 있어도 위·아래 경로가 섞이지 않는다 (실제 고장)', () => {
  const out = sgResolvedUpdates(BASE,
    { [UID_A]: { [ID2]: true } },                 // uid 로 적힌 것
    { 'a_at_b_com': { [ID1]: true } },            // 메일로 적힌 것 — 같은 사람
    { 'a_at_b_com': UID_A });

  const keys = Object.keys(out);
  assert.ok(!keys.includes(`${BASE}/${UID_A}`), '사람 통째로 적는 경로가 있으면 안 됩니다.');
  keys.forEach((k) => {
    keys.forEach((other) => {
      if (k !== other) assert.ok(!other.startsWith(k + '/'), `${k} 가 ${other} 의 윗길입니다.`);
    });
  });
  assert.deepEqual(plain(out), {
    [`${BASE}/${UID_A}/${ID2}`]: true,
    [`${BASE}/${UID_A}/${ID1}`]: true,
  });
});

/* ── 자료가 사라지지 않는다 ── */
test('한쪽에만 있는 사람도 그대로 옮겨진다', () => {
  const out = sgResolvedUpdates(BASE,
    { [UID_B]: { [ID1]: true } },
    { 'c_at_d_com': { [ID2]: 1699999999999 } },
    { 'c_at_d_com': UID_A });

  assert.deepEqual(plain(out), {
    [`${BASE}/${UID_B}/${ID1}`]: true,
    [`${BASE}/${UID_A}/${ID2}`]: 1699999999999,
  });
});

test('같은 건의가 양쪽에 있으면 uid 쪽이 최신값이다', () => {
  const out = sgResolvedUpdates(BASE,
    { [UID_A]: { [ID1]: 'uid쪽' } },
    { 'a_at_b_com': { [ID1]: '메일쪽' } },
    { 'a_at_b_com': UID_A });

  assert.equal(out[`${BASE}/${UID_A}/${ID1}`], 'uid쪽');
  assert.equal(Object.keys(out).length, 1);
});

/* ── 이상한 자료에도 안 죽는다 ── */
test('주인을 못 찾는 메일은 건너뛴다', () => {
  const out = sgResolvedUpdates(BASE, {}, { 'ghost_at_x_com': { [ID1]: true } }, {});
  assert.deepEqual(plain(out), {});
});

test('빈 자료·이상한 모양에도 터지지 않는다', () => {
  assert.deepEqual(plain(sgResolvedUpdates(BASE, {}, {}, {})), {});
  assert.deepEqual(plain(sgResolvedUpdates(BASE, null, null, null)), {});
  assert.deepEqual(plain(sgResolvedUpdates(BASE, { [UID_A]: true }, {}, {})), {},
    '사람 밑이 묶음이 아니면 건너뛴다');
  assert.deepEqual(plain(sgResolvedUpdates(BASE, { [UID_A]: {} }, {}, {})), {},
    '빈 사람은 경로를 만들지 않는다 (빈 칸을 쓰면 옛 자료를 덮어쓴다)');
});

/* ── 배선: 고쳐 놓고 안 쓰면 소용없다 ── */
test('이사 코드가 이 함수를 실제로 쓴다', () => {
  assert.ok(/updates *= *Object\.assign\(updates, *sgResolvedUpdates\(/.test(source)
    || /sgResolvedUpdates\(SG_RESOLVED_PRIVATE_PATH/.test(source),
    '이사 코드가 sgResolvedUpdates 를 불러야 합니다.');
  assert.ok(!/updates\[SG_RESOLVED_PRIVATE_PATH *\+ *'\/' *\+ *uid\] *=/.test(source),
    '사람 통째로 적던 옛 줄이 남아 있으면 안 됩니다.');
});

/* ── 이사가 실패해도 건의함은 열려야 한다 ── */
test('이사가 실패해도 목록은 뜬다', () => {
  const m = source.match(/function sgViewList\(\)[\s\S]*?\n  \}/);
  assert.ok(m, 'sgViewList 를 찾지 못했습니다.');
  assert.ok(/sgEnsurePrivateMigration\(\)\s*\.catch\(/.test(m[0]),
    '이사 실패를 삼키고 목록 읽기로 넘어가야 합니다 — 옛 자료 하나 때문에 건의함 전체가 안 보이면 안 됩니다.');
  assert.ok(/_sgMigrateWarn/.test(m[0]),
    '이사가 실패했으면 조용히 넘기지 말고 표시를 남겨야 합니다.');
  assert.ok(/warnHtml *=\s*_sgMigrateWarn\s*\?/.test(source),
    '실패했을 때 띄울 알림 문구를 만들어야 합니다.');
  assert.ok(/wrap\.innerHTML *= *warnHtml *\+/.test(source),
    '그 알림을 목록 맨 위에 실제로 붙여야 합니다.');
});
