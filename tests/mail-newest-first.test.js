'use strict';
/* 최근 것부터 훑고, 폴더마다 제 몫이 있다 — node --test tests/mail-newest-first.test.js
 *
 * ★ 2026-09-06 실측으로 드러난 «조용한 멈춤».
 *   수집기는 30분마다 멀쩡히 돌았는데 8/26 뒤로 메일이 **한 통도** 안 들어왔다.
 *   로그는 늘 `looked:30 · took:0 · unknown:0 · skipped:0` — 30통을 보고
 *   아무것도 안 담았다는 뜻이다. 까닭은 둘이었다.
 *
 *   ① IMAP 목록은 **오래된 것부터** 온다. 앞에서 30통을 끊으면 그 30통은 늘
 *      같은 옛 메일이고 이미 처리한 것이라 아무것도 안 담긴다. 그 뒤에 온
 *      새 메일에는 **영영 닿지 못한다** — 줄 맨 앞이 막고 서 있는 꼴이다.
 *   ② 한 회차 몫을 폴더가 «먼저 오는 쪽부터» 나눠 먹었다. 급여 폴더가 30통을
 *      다 먹어, 받은메일함은 훑는 목록에 들어와 있어도 **한 번도 열리지 않았다**
 *      (로그의 boxes 에는 INBOX 가 있는데 looked 는 늘 30이었다).
 *
 * ⚠ 「돌고 있다」와 「일하고 있다」는 다르다. 다음에 「메일이 안 온다」는 말이
 *   나오면 lastScan 이 도는지가 아니라 **took 이 0인 채로 looked 가 몫에
 *   딱 붙어 있는지**를 볼 것.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const MR = require(path.join(ROOT, 'functions', 'mail-receive.js'));
const IDX = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

/* ══════ ① 최근 것부터 ══════ */
test('★★ 최근 것부터 가져온다 — 앞에서 끊으면 새 메일에 영영 못 닿는다', () => {
  const 오래된것부터 = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];   // IMAP 이 주는 차례
  assert.deepEqual(MR.newestUids(오래된것부터, 3), [18, 19, 20],
    '앞에서 끊고 있다 — 옛 메일 셋만 계속 보고 새 것은 못 본다');
});

test('몫이 목록보다 크면 있는 대로 다 가져온다', () => {
  assert.deepEqual(MR.newestUids([5, 6], 10), [5, 6]);
});

test('몫이 0이면 아무것도 안 가져온다 — 자리가 없는데 열지 않는다', () => {
  assert.deepEqual(MR.newestUids([1, 2, 3], 0), []);
  assert.deepEqual(MR.newestUids([1, 2, 3], -4), []);
});

test('목록을 못 받았으면(배열이 아님) 빈 손으로 돌아간다 — 안 넘어진다', () => {
  for (const bad of [false, null, undefined, 0, '', {}, 'abc']) {
    assert.deepEqual(MR.newestUids(bad, 5), [], '넘어졌다: ' + JSON.stringify(bad));
  }
});

test('번호가 아닌 것은 걸러 낸다', () => {
  assert.deepEqual(MR.newestUids([0, -1, null, 7, 'x', 9], 5), [7, 9]);
});

/* ══════ ② 폴더마다 제 몫 ══════ */
test('★★ 폴더가 둘이면 몫을 나눈다 — 앞 폴더가 다 먹으면 뒤 폴더는 열리지도 않는다', () => {
  assert.equal(MR.boxShare(30, 2), 15);
  assert.equal(MR.boxShare(30, 3), 10);
});

test('폴더가 하나면 몫이 그대로다 — 예전과 똑같이 돈다', () => {
  assert.equal(MR.boxShare(30, 1), 30);
});

test('폴더가 아주 많아도 폴더마다 적어도 한 통은 본다 — 0이면 영영 안 열린다', () => {
  assert.equal(MR.boxShare(30, 100), 1);
  assert.equal(MR.boxShare(0, 5), 1);
  assert.equal(MR.boxShare(null, null), 1);
});

/* ══════ ③ 부르는 곳이 실제로 그 길로 간다 ══════ */
test('★ 수집기가 «번호를 먼저 받아» 최근 것부터 고른다', () => {
  /* ⚠ 헬퍼만 검사하면 부르는 곳이 옛 길로 가도 통과한다 — 실제로 그렇게 헛돌았다 */
  assert.match(IDX, /client\.search\(\{ since: since \}, \{ uid: true \}\)/,
    '번호만 먼저 받지 않는다 — 바로 fetch 하면 오래된 것부터 온다');
  assert.match(IDX, /MR\.newestUids\(uids, room\)/, '최근 것부터 고르지 않는다');
  assert.doesNotMatch(IDX, /for await \(const msg of client\.fetch\(\{ since: since \}/,
    '옛 길(바로 fetch)이 아직 남아 있다');
});

test('★ 수집기가 폴더마다 몫을 나눈다', () => {
  assert.match(IDX, /MR\.boxShare\(PAYMAIL_MAX_PER_RUN, boxes\.length\)/, '몫을 안 나눈다');
  assert.match(IDX, /const room = Math\.min\(share, PAYMAIL_MAX_PER_RUN - inbox\.length\)/,
    '폴더 몫과 전체 몫 중 작은 쪽을 안 쓴다');
});

test('★ 한 회차 몫에 «한도»가 있다 — 폴더가 늘어도 더 오래 안 붙어 있는다', () => {
  /* ⚠ 숫자를 글자로 박지 않는다 — `= 30` 은 `= 300` 에도 걸려 헛돈다(실제로 그랬다).
     지켜야 할 것은 「한 회차에 오래 붙어 있지 않는다」이지 30이라는 값이 아니다.
     메일 서버에 붙는 일이라 회차가 길어지면 계정이 잠긴다. */
  const m = IDX.match(/PAYMAIL_MAX_PER_RUN\s*=\s*(\d+)\s*;/);
  assert.ok(m, '한 회차 몫이 없다');
  const n = Number(m[1]);
  assert.ok(n >= 10, '몫이 너무 작다(' + n + ') — 폴더끼리 나누면 한 통도 못 본다');
  assert.ok(n <= 60, '몫이 너무 크다(' + n + ') — 메일 서버에 오래 붙어 있으면 계정이 잠긴다');
  assert.match(IDX, /if \(inbox\.length >= PAYMAIL_MAX_PER_RUN\) break;/,
    '전체 몫을 넘어도 안 멈춘다');
});

test('★ 목록을 못 받아도 그 폴더만 건너뛴다 — 회차가 통째로 멈추지 않는다', () => {
  const i = IDX.indexOf('uids = await client.search(');
  const 둘레 = IDX.slice(i - 200, i + 400);
  assert.match(둘레, /try \{/, '목록 받기를 감싸지 않았다');
  assert.match(둘레, /catch \(e\)/, '못 받았을 때 길이 없다');
});
