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

/* ── 어디를 가져올까 ──
   몇 년치를 한 번에 끌면 함수가 죽고 아무것도 안 남는다. 새것은 위에서,
   옛것은 아래에서 조금씩. */

test('★ 처음이면 맨 위에서 한 뭉치만 — 통째로 끌지 않는다', () => {
  const w = MB.backfillWindow({}, 5001, 300);
  assert.deepEqual(w.fresh, { from: 4701, to: 5000 });
  assert.equal(w.back, null);
  assert.equal(w.done, false);
});

test('★ 회차를 거듭하면 옛것이 1번까지 닿는다 — 그때 done', () => {
  let sync = MB.nextSync({}, [4701, 5000], 7, false);
  /* 한 뭉치씩 아래로 */
  let guard = 0;
  while (guard++ < 100) {
    const w = MB.backfillWindow(sync, 5001, 300);
    if (w.done && !w.back) break;
    const seen = [];
    if (w.back) { seen.push(w.back.from, w.back.to); }
    sync = MB.nextSync(sync, seen, 7, w.done);
  }
  assert.ok(guard < 100, '끝나지 않았다 — 옛것 방향이 멈춰 있다');
  assert.equal(sync.lo, 1, '1번까지 닿지 않았다');
});

test('새 메일이 오면 새것 방향이 먼저 열린다', () => {
  const w = MB.backfillWindow({ hi: 5000, lo: 4701, uv: 7 }, 5006, 300);
  assert.deepEqual(w.fresh, { from: 5001, to: 5005 });
  assert.ok(w.back, '옛것도 함께 이어간다');
});

test('빈 폴더는 볼 것이 없다 — 회차마다 헛되게 붙지 않는다', () => {
  const w = MB.backfillWindow({}, 1, 300);
  assert.equal(w.fresh, null);
  assert.equal(w.done, true);
});

test('★ 표시가 뒤로 가지 않는다 — 되돌아가면 같은 것을 영원히 다시 가져온다', () => {
  const s = MB.nextSync({ hi: 5000, lo: 100, uv: 7 }, [200, 300], 7, false);
  assert.equal(s.hi, 5000);
  assert.equal(s.lo, 100);
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
