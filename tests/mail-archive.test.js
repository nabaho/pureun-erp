'use strict';
/* 보낸 사본을 다음메일 「보낸메일함」에도 남긴다 — 실행: node --test tests/*.test.js

   무엇이 문제였나 (대표 2026-08-23): 앱에서 보낸 메일이 다음메일 보낸메일함에
   하나도 없었다. 오류가 아니라 **안 하고 있던 일**이었다 —
   보내는 길(SMTP)은 「전해 줘」만 하고, 보낸함에 사본을 넣는 것은
   보관하는 길(IMAP)이 따로 해야 한다. 웹메일·아웃룩은 둘 다 하고, 우리는 첫째만 했다.

   ★ 여기서 못 박는 것 — 이 중 하나라도 깨지면 「메일이 안 나간다」가 된다
     ① 사본 남기기가 실패해도 **배달 결과를 바꾸지 않는다** (배달은 이미 끝난 뒤다)
     ② 엉뚱한 폴더(임시보관함·휴지통·받은메일함)에 넣지 않는다
     ③ 연결을 반드시 닫는다 — 안 닫으면 함수가 안 끝나고 요금이 샌다
     ④ 「읽음」으로 넣는다 — 내가 보낸 것이 안 읽음으로 뜨면 안 된다
     ⑤ 한 번에 넣는 통 수에 상한이 있다 (한명씩 발송 200통을 다 넣으면 시간을 넘긴다)
     ⑥ 무거운 짐(imapflow·nodemailer)을 파일 맨 위에서 부르지 않는다 —
        검사 기기에는 그 짐이 없다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MA = require(path.join(R, 'functions', 'mail-archive.js'));
const SRC = fs.readFileSync(path.join(R, 'functions', 'mail-archive.js'), 'utf8');
const DEL = fs.readFileSync(path.join(R, 'functions', 'mail-deliver.js'), 'utf8');

/* ══════ 어느 폴더에 넣나 ══════ */

test('IMAP 이 「이게 보낸함이다」라고 알려 주면 그것을 쓴다', () => {
  const list = [
    { path: 'INBOX', name: '받은메일함' },
    { path: '보낸메일함', name: '보낸메일함' },
    { path: 'Sent', name: 'Sent', specialUse: '\\Sent' },
  ];
  assert.equal(MA.pickSentBox(list), 'Sent', '서버가 알려 준 표시를 이름보다 믿어야 한다');
});

test('표시가 없으면 이름으로 찾는다 — 한글 계정', () => {
  assert.equal(MA.pickSentBox([
    { path: 'INBOX', name: '받은메일함' },
    { path: '임시보관함', name: '임시보관함' },
    { path: '보낸메일함', name: '보낸메일함' },
  ]), '보낸메일함');
});

test('표시가 없으면 이름으로 찾는다 — 영문 계정', () => {
  assert.equal(MA.pickSentBox([
    { path: 'INBOX', name: 'INBOX' },
    { path: 'INBOX.Sent', name: 'Sent' },
  ]), 'INBOX.Sent');
});

test('임시보관함·휴지통·스팸에는 절대 안 넣는다', () => {
  for (const nm of ['임시보관함', '휴지통', '스팸함', 'Drafts', 'Trash', 'Junk']) {
    assert.equal(MA.pickSentBox([{ path: nm, name: nm }]), '',
      nm + ' 을 보낸함으로 골랐다');
  }
});

/* 위의 「임시보관함」 검사만으로는 못 넣을 폴더 규칙이 실제로 일하는지 안 드러난다
   (그 이름에는 「보낸」이 없어서 어차피 안 골린다). 대표가 손수 만든
   「9.보낸것보관」 같은 폴더가 진짜 보낸함보다 앞에 있을 때가 진짜 시험이다. */
test('「보낸」이 들어가도 보관 폴더는 건너뛰고 진짜 보낸함을 고른다', () => {
  assert.equal(MA.pickSentBox([
    { path: '9.보낸것보관', name: '9.보낸것보관' },
    { path: '보낸메일함', name: '보낸메일함' },
  ]), '보낸메일함', '앞에 있다고 보관 폴더를 고르면 사본이 엉뚱한 곳에 쌓인다');
});

test('보관 폴더만 있으면 아무 데도 안 넣는다', () => {
  assert.equal(MA.pickSentBox([{ path: '9.보낸것보관', name: '9.보낸것보관' }]), '');
});

test('받은메일함에는 절대 안 넣는다 — 넣으면 안 읽은 메일처럼 쌓인다', () => {
  assert.equal(MA.pickSentBox([{ path: 'INBOX', name: '받은메일함' }]), '');
});

test('보낸함이 없으면 빈 값 — 아무 폴더나 고르지 않는다', () => {
  assert.equal(MA.pickSentBox([{ path: '1.자문사답변', name: '1.자문사답변' }]), '');
  assert.equal(MA.pickSentBox([]), '');
  assert.equal(MA.pickSentBox(null), '');
});

/* ══════ 실제로 넣는 동작 — 가짜 서버로 ══════ */

function fakeClient(boxes, opt) {
  const o = opt || {};
  const log = [];
  return {
    log: log,
    list: async () => { log.push('list'); return boxes; },
    append: async (box, raw, flags) => {
      log.push('append:' + box + ':' + String(flags));
      if (o.appendThrows) throw new Error('넣기 실패');
      return { uid: 1 };
    },
    logout: async () => { log.push('logout'); },
    close: () => { log.push('close'); },
  };
}
const BOXES = [{ path: '보낸메일함', name: '보낸메일함' }];
const RAW = Buffer.from('Subject: hi\r\n\r\nbody');

test('사본 한 통을 보낸메일함에 「읽음」으로 넣는다', async () => {
  const c = fakeClient(BOXES);
  const r = await MA.archiveSent({ raws: [RAW], openClient: async () => c });
  assert.equal(r.ok, true);
  assert.equal(r.put, 1);
  assert.equal(r.box, '보낸메일함');
  assert.ok(c.log.some((l) => /^append:보낸메일함:.*Seen/.test(l)),
    '「읽음」 표시 없이 넣으면 내가 보낸 것이 안 읽음으로 뜬다: ' + c.log.join(','));
});

test('여러 통이면 그 수만큼 넣는다', async () => {
  const c = fakeClient(BOXES);
  const r = await MA.archiveSent({ raws: [RAW, RAW, RAW], openClient: async () => c });
  assert.equal(r.put, 3);
});

test('상한을 넘는 통은 넣지 않고 몇 통 빠졌는지 알려 준다', async () => {
  const many = [];
  for (let i = 0; i < MA.ARCHIVE_MAX + 5; i++) many.push(RAW);
  const c = fakeClient(BOXES);
  const r = await MA.archiveSent({ raws: many, openClient: async () => c });
  assert.equal(r.put, MA.ARCHIVE_MAX, '상한을 안 지키면 함수 시간을 넘긴다');
  assert.equal(r.dropped, 5, '빠진 수를 안 알려 주면 조용히 사라진다');
});

test('보낸함을 못 찾으면 한 통도 넣지 않고 연결을 닫는다', async () => {
  const c = fakeClient([{ path: 'INBOX', name: '받은메일함' }]);
  const r = await MA.archiveSent({ raws: [RAW], openClient: async () => c });
  assert.equal(r.ok, false);
  assert.equal(r.put, 0);
  assert.ok(!c.log.some((l) => l.indexOf('append') === 0), '엉뚱한 곳에 넣었다');
  assert.ok(c.log.indexOf('logout') >= 0, '연결을 안 닫으면 함수가 안 끝난다');
});

test('넣다가 실패해도 던지지 않는다 — 배달은 이미 끝났다', async () => {
  const c = fakeClient(BOXES, { appendThrows: true });
  const r = await MA.archiveSent({ raws: [RAW], openClient: async () => c });
  assert.equal(r.ok, false);
  assert.ok(r.why, '왜 못 넣었는지 남겨야 다음에 고칠 수 있다');
  assert.ok(c.log.indexOf('logout') >= 0, '실패해도 연결은 닫아야 한다');
});

test('접속 자체가 안 되어도 던지지 않는다', async () => {
  const r = await MA.archiveSent({
    raws: [RAW], openClient: async () => { throw new Error('접속 거부'); },
  });
  assert.equal(r.ok, false);
  assert.ok(r.why);
});

test('넣을 것이 없으면 접속조차 하지 않는다', async () => {
  let opened = false;
  const r = await MA.archiveSent({ raws: [], openClient: async () => { opened = true; } });
  assert.equal(r.put, 0);
  assert.equal(opened, false, '넣을 것도 없이 접속하면 요금만 나간다');
});

/* 배달은 이미 끝난 뒤라 메일은 나간다. 그런데 응답이 늦어 끊기면 화면에는
   「안 나갔다」로 보이고, 대표는 같은 메일을 두 번 보내게 된다. 사본보다 그게 나쁘다. */
test('첨부가 너무 크면 사본을 건너뛴다 — 응답이 늦으면 「안 나갔다」로 보인다', async () => {
  let opened = false;
  const r = await MA.archiveSent({
    raws: [RAW], bytes: MA.ARCHIVE_MAX_BYTES + 1,
    openClient: async () => { opened = true; },
  });
  assert.equal(r.put, 0);
  assert.equal(opened, false, '큰 첨부로 접속까지 하면 시간만 쓴다');
  assert.ok(r.why, '왜 건너뛰었는지 남겨야 한다');
});

test('작은 첨부는 그대로 사본을 남긴다', async () => {
  const c = fakeClient(BOXES);
  const r = await MA.archiveSent({ raws: [RAW], bytes: 1024, openClient: async () => c });
  assert.equal(r.put, 1, '크기 문턱이 정상 메일까지 막으면 안 된다');
});

test('기다리는 시간에 상한이 있다', () => {
  assert.match(SRC, /ARCHIVE_TIMEOUT_MS/, '상한이 없으면 대답 없는 서버에 매달린다');
  assert.match(SRC, /socketTimeout/, '실제 접속에 상한을 걸어야 한다');
});

/* ══════ 무거운 짐은 필요할 때만 ══════ */

test('imapflow·nodemailer 를 파일 맨 위에서 부르지 않는다', () => {
  const head = SRC.slice(0, SRC.indexOf('function '));
  assert.doesNotMatch(head, /require\(['"](imapflow|nodemailer)/,
    '맨 위에서 부르면 그 짐이 없는 기기에서 파일 자체를 못 읽는다');
  assert.match(SRC, /require\(['"]imapflow/, '어디선가는 불러야 실제로 넣는다');
});

/* ══════ 보내는 층과 어떻게 붙였나 ══════ */

test('사본 남기기는 배달이 끝난 «뒤»에 한다', () => {
  const send = DEL.indexOf('tx.sendMail(');
  const arch = DEL.indexOf('archiveSent(');
  assert.ok(send > 0 && arch > 0, '둘 다 있어야 한다');
  assert.ok(arch > send, '배달보다 먼저 넣으면 안 나간 메일이 보낸함에 남는다');
});

test('사본 남기기는 try 로 감싸 배달 결과를 흔들지 않는다', () => {
  const i = DEL.indexOf('archiveSent(');
  const before = DEL.slice(Math.max(0, i - 400), i);
  assert.ok(before.lastIndexOf('try {') > before.lastIndexOf('} catch'),
    'try 밖에 두면 사본 실패가 「메일이 안 나갔다」로 보고된다');
});

test('사본을 못 남겼다고 실패로 돌려주지 않는다', () => {
  const i = DEL.indexOf('archiveSent(');
  const after = DEL.slice(i, i + 700);
  assert.doesNotMatch(after, /return \{ ok: false/,
    '사본 실패로 되돌아가면 대표가 「안 나갔다」고 오해해 두 번 보낸다');
});

test('끌 수 있는 스위치가 있다 — 문제가 생기면 배포 없이 멈춘다', () => {
  assert.match(SRC, /MAIL_ARCHIVE_OFF/, '끄는 길이 없으면 사고 때 배포를 기다려야 한다');
});
