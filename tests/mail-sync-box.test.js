/* 다음메일함 통째 동기화 — 값 판단 검사.
   실제 메일함에 붙지 않는다. 여기서 틀리면 「모두 동기화」가 조용히 절반만 되거나,
   폴더 하나가 다른 폴더 자리를 덮어쓴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const MB = require('../functions/mail-box.js');

/* ── 폴더 열쇠 ──
   다음메일 폴더 경로에는 점이 들어간다(INBOX.1.자문사답변). 실시간DB 열쇠에는
   점을 못 쓴다 — 그대로 쓰면 저장이 통째로 실패한다. */

test('★ 점이 든 폴더 경로도 실시간DB 열쇠로 쓸 수 있다', () => {
  const k = MB.slugOf('INBOX.1.자문사답변');
  assert.equal(/[.#$/[\]]/.test(k), false, '못 쓰는 글자가 남아 있다');
  assert.ok(k.length > 0);
});

test('★ 바꾼 뒤에 겹치지 않는다 — 두 폴더가 한 자리를 다투면 하나가 사라진다', () => {
  assert.notEqual(MB.slugOf('INBOX.a'), MB.slugOf('INBOX_a'));
  assert.notEqual(MB.slugOf('INBOX/a'), MB.slugOf('INBOX.a'));
});

test('같은 경로는 늘 같은 열쇠 — 회차마다 새 폴더가 생기면 안 된다', () => {
  assert.equal(MB.slugOf('보낸메일함'), MB.slugOf('보낸메일함'));
});

/* ── 어떤 칸인가 ──
   이름을 못 박지 않는다. IMAP 표시를 먼저 믿는다. */

test('★ 특수용도표시가 있으면 그것을 믿는다 — 이름이 무엇이든', () => {
  assert.equal(MB.folderKind({ specialUse: '\\Sent', name: '아무이름' }), 'sent');
  assert.equal(MB.folderKind({ specialUse: '\\Drafts', name: 'zzz' }), 'drafts');
  assert.equal(MB.folderKind({ specialUse: '\\Trash', name: 'zzz' }), 'trash');
});

test('표시가 없으면 이름으로 짚는다 — 한글·영문 둘 다', () => {
  assert.equal(MB.folderKind({ name: 'INBOX', path: 'INBOX' }), 'inbox');
  assert.equal(MB.folderKind({ name: '보낸메일함', path: '보낸메일함' }), 'sent');
  assert.equal(MB.folderKind({ name: 'Sent Messages', path: 'Sent Messages' }), 'sent');
  assert.equal(MB.folderKind({ name: '휴지통', path: '휴지통' }), 'trash');
});

test('아무것도 안 맞으면 손으로 만든 폴더로 둔다 — 버리지 않는다', () => {
  assert.equal(MB.folderKind({ name: '1.자문사답변', path: 'INBOX.1.자문사답변' }), 'custom');
});

test('고를 수 없는 껍데기 폴더는 세지 않는다 — 늘 0통으로 남는다', () => {
  assert.equal(MB.isSyncable({ path: 'INBOX', flags: new Set(['\\Noselect']) }), false);
  assert.equal(MB.isSyncable({ path: 'INBOX', flags: ['\\NonExistent'] }), false);
  assert.equal(MB.isSyncable({ path: 'INBOX', flags: new Set(['\\HasChildren']) }), true);
});

/* ── 첨부 개수 ──
   서명 로고까지 세면 거의 모든 메일에 📎 가 붙어 표시가 뜻을 잃는다. */

test('★ 본문에 박힌 그림(서명 로고)은 첨부로 세지 않는다', () => {
  const structure = {
    childNodes: [
      { type: 'text/html' },
      { type: 'image/png', disposition: 'inline', id: '<logo@sig>',
        dispositionParameters: { filename: 'logo.png' } },
    ],
  };
  assert.equal(MB.attCount(structure, 0), 0);
});

test('진짜 첨부는 센다', () => {
  const structure = {
    childNodes: [
      { type: 'text/plain' },
      { type: 'application/pdf', disposition: 'attachment',
        dispositionParameters: { filename: '급여대장.pdf' } },
      { type: 'application/vnd.ms-excel', disposition: 'attachment',
        dispositionParameters: { filename: '명부.xls' } },
    ],
  };
  assert.equal(MB.attCount(structure, 0), 2);
});

test('disposition 이 없는 옛 메일도 이름이 붙은 것은 첨부로 본다', () => {
  const structure = {
    childNodes: [
      { type: 'text/plain' },
      { type: 'application/octet-stream', parameters: { name: '계약서.hwp' } },
    ],
  };
  assert.equal(MB.attCount(structure, 0), 1);
});

/* ── 목록 한 줄 ── */

test('★ 보낸이 이름이 없으면 주소를 이름 자리에도 쓴다 — 칸이 비면 무엇이 왔는지 모른다', () => {
  const row = MB.msgRow({
    uid: 12,
    envelope: { from: [{ address: 'Boss@Example.COM' }], subject: '문의', date: '2026-08-24T06:00:00Z' },
  });
  assert.equal(row.f, 'Boss@Example.COM');
  assert.equal(row.e, 'boss@example.com');
});

test('제목의 줄바꿈은 한 줄로 편다 — 목록이 두 줄로 벌어지면 차림이 무너진다', () => {
  const row = MB.msgRow({ uid: 3, envelope: { subject: '첫줄\r\n둘째줄', from: [] } });
  assert.equal(row.s.indexOf('\n'), -1);
  assert.equal(row.s, '첫줄 둘째줄');
});

test('읽음·중요 표시를 그대로 옮긴다', () => {
  const seen = MB.msgRow({ uid: 1, flags: new Set(['\\Seen', '\\Flagged']), envelope: {} });
  assert.equal(seen.r, 1);
  assert.equal(seen.g, 1);
  const fresh = MB.msgRow({ uid: 2, flags: new Set(), envelope: {} });
  assert.equal(fresh.r, 0);
  assert.equal(fresh.g, 0);
});

test('날짜를 못 알아보면 0 — 목록이 1970년으로 튀지 않게', () => {
  assert.equal(MB.msgRow({ uid: 1, envelope: { date: '알수없음' } }).d, 0);
  assert.equal(MB.msgRow({ uid: 1, envelope: {} }).d, 0);
});

/* ── 어느 번호를 가져올까 ──
   ⚠ 예전에는 번호를 300씩 «훑어 내려갔다». 그런데 이 계정의 번호는 폴더별이 아니라
     계정 전체에서 하나씩 매겨져 171,876번까지 가 있고, 폴더 하나에는 그중 400개만
     있다(실측 2026-08-24). 훑어 내려가면 거의 언제나 «빈 구간»을 열게 되어 400통
     폴더 하나에 430바퀴가 걸렸다. 이제 메일함이 알려 준 번호 목록을 보고 고른다. */

test('★ 번호가 흩어져 있어도 빈 구간을 열지 않는다 — 훑어 내려가던 방식의 값이 여기서 갈린다', () => {
  /* 번호가 17만번대에 400개만 흩어져 있다 */
  const uids = [];
  for (let i = 0; i < 400; i++) uids.push(171876 - i * 37);
  const pick = MB.pickToFetch(uids, {}, 400);
  assert.equal(pick.back.length, 400, '한 바퀴에 다 고르지 못했다');
  assert.equal(pick.done, true, '더 볼 것이 없는데 안 끝났다고 한다');
  /* 고른 것은 모두 «실제로 있는» 번호다 — 없는 번호를 달라고 하지 않는다 */
  pick.back.forEach((u) => assert.ok(uids.indexOf(u) >= 0, u + ' 는 없는 번호다'));
});

test('★ 처음이면 새것에 가까운 쪽부터 한 뭉치 — 사람이 먼저 볼 것이 먼저 찬다', () => {
  const uids = [10, 20, 30, 40, 50];
  const pick = MB.pickToFetch(uids, {}, 3);
  assert.deepEqual(pick.back, [50, 40, 30]);
  assert.equal(pick.done, false);
});

test('★ 바퀴를 거듭하면 옛것까지 다 닿는다 — 그때 done', () => {
  const uids = [];
  for (let i = 1; i <= 950; i++) uids.push(i * 11);
  let sync = {};
  const got = {};
  let guard = 0;
  while (guard++ < 50) {
    const pick = MB.pickToFetch(uids, sync, 400);
    const seen = pick.fresh.concat(pick.back);
    if (!seen.length) break;
    seen.forEach((u) => { got[u] = 1; });
    sync = MB.nextSync(sync, seen, 7, pick.done);
    if (pick.done) break;
  }
  assert.ok(guard < 50, '끝나지 않았다');
  assert.equal(Object.keys(got).length, 950, '빠진 번호가 있다');
  assert.equal(sync.done, true);
});

test('새 메일이 오면 새것을 먼저 고른다 — 뭉치로 자르지 않는다(보통 몇 통뿐이다)', () => {
  const uids = [100, 200, 300, 400, 500];
  const pick = MB.pickToFetch(uids, { hi: 300, lo: 200, uv: 7 }, 400);
  assert.deepEqual(pick.fresh, [500, 400]);
  assert.deepEqual(pick.back, [100]);
  assert.equal(pick.done, true);
});

test('빈 폴더는 볼 것이 없다 — 바퀴마다 헛되게 붙지 않는다', () => {
  const pick = MB.pickToFetch([], {}, 400);
  assert.deepEqual(pick.back, []);
  assert.deepEqual(pick.fresh, []);
  assert.equal(pick.done, true);
});

test('★ 번호는 낱개로 적어 보낸다 — 구간으로 줄이면 없는 번호까지 달라고 하는 셈이다', () => {
  assert.equal(MB.uidSet([30, 10, 20]), '10,20,30');
  assert.equal(MB.uidSet([5, 0, -1, 7]), '5,7');
  assert.equal(MB.uidSet([]), '');
});

test('★ 표시가 뒤로 가지 않는다 — 되돌아가면 같은 것을 영원히 다시 가져온다', () => {
  const s = MB.nextSync({ hi: 5000, lo: 100, uv: 7 }, [200, 300], 7, false);
  assert.equal(s.hi, 5000);
  assert.equal(s.lo, 100);
});

test('★ 지난 회차의 셈과 정리 때를 떨어뜨리지 않는다 — 떨어지면 폴더 전체를 헛되게 다시 읽는다', () => {
  /* 여기서 둘을 잃으면 「우리 것과 통수가 다르다」가 늘 참이 되어, 6시간마다 폴더
     전체를 읽는다(그것이 곧 요금이다). 2026-08-24 에 실제로 그랬고 고쳤다. */
  const s = MB.nextSync({ hi: 500, lo: 200, uv: 7, n: 301, prunedAt: 1756000000000 },
                        [150, 199], 7, false);
  assert.equal(s.n, 301);
  assert.equal(s.prunedAt, 1756000000000);
});

test('번호가 갈리면 셈도 버린다 — 다른 메일을 세어 둔 값이다', () => {
  const s = MB.nextSync({ hi: 500, lo: 1, uv: 7, n: 500, prunedAt: 9 }, [10], 9, true);
  assert.equal(s.n, 0);
  assert.equal(s.prunedAt, 0);
});

test('★ 서버가 번호를 다시 매겼으면(uidValidity 변경) 처음부터 다시 한다', () => {
  assert.equal(MB.uidReset({ uv: 7 }, 9), true);
  assert.equal(MB.uidReset({ uv: 7 }, 7), false);
  assert.equal(MB.uidReset({}, 7), false, '처음이면 다시 할 것이 없다');
  const s = MB.nextSync({ hi: 5000, lo: 1, uv: 7 }, [10, 20], 9, false);
  assert.equal(s.uv, 9);
  assert.equal(s.hi, 20, '지난 표시를 그대로 두면 새 번호를 건너뛴다');
  assert.equal(s.lo, 10);
});
