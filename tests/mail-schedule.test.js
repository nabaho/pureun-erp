/* 예약 발송 — 걸 때 걸러 내는 것과, 자리에 담는 값.
   때가 되어서야 「받는 사람이 없다」를 알면 이미 늦다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const MD = require('../functions/mail-deliver.js');

/* ── 걸기 전 검사 ── */

test('받는 사람이 없으면 예약을 걸 수 없다', () => {
  assert.match(MD.errorsBefore({ subject:'제', body:'본' }), /받는 사람/);
});

test('제목이나 본문이 비면 예약을 걸 수 없다', () => {
  assert.match(MD.errorsBefore({ to:'a@b.com', body:'본' }), /제목/);
  assert.match(MD.errorsBefore({ to:'a@b.com', subject:'제' }), /본문/);
});

test('멀쩡하면 빈 말 — 걸어도 된다', () => {
  assert.equal(MD.errorsBefore({ to:'a@b.com', subject:'제', body:'본' }), '');
});

test('첨부 크기는 걸 때 보지 않는다 — 자료를 아직 안 읽었다', () => {
  /* 첨부 없이도 통과해야 한다. 크기는 보낼 때 걸러진다. */
  assert.equal(MD.errorsBefore({ to:'a@b.com', subject:'제', body:'본', matIds:['x','y'] }), '');
});

/* ── 자리에 담는 값 ── */

test('내 PC 파일은 담지 않고 이름만 남긴다 — 8MB 를 며칠 재워 둘 수 없다', () => {
  const p = MD.slimPayload({ to:'a@b.com', files:[
    { name:'계약서_수정본.hwp', dataUrl:'data:x;base64,AAAA' },
    { name:'', dataUrl:'data:x;base64,AAAA' }
  ]});
  assert.equal(p.files, undefined, '파일 내용을 담으면 안 된다');
  assert.deepEqual(p.droppedFiles, ['계약서_수정본.hwp'], '이름 없는 것은 뺀다');
});

test('보낼 때 쓸 값은 빠짐없이 담는다', () => {
  const p = MD.slimPayload({
    cardId:'c1', to:'a@b.com', cc:'c@d.com', bcc:'e@f.com',
    toMe:true, oneByOne:true, subject:'제목', body:'본문',
    matIds:['m1','m2'], set:'신규 3종', toName:'홍길동'
  });
  assert.equal(p.cardId,'c1'); assert.equal(p.to,'a@b.com');
  assert.equal(p.cc,'c@d.com'); assert.equal(p.bcc,'e@f.com');
  assert.equal(p.toMe,true); assert.equal(p.oneByOne,true);
  assert.equal(p.subject,'제목'); assert.equal(p.body,'본문');
  assert.deepEqual(p.matIds,['m1','m2']);
  assert.equal(p.set,'신규 3종'); assert.equal(p.toName,'홍길동');
});

test('자료 번호는 10개까지, 글자가 아닌 것은 뺀다', () => {
  const many = Array.from({length:15},(_,i)=>'m'+i).concat([null, 7, {}]);
  const p = MD.slimPayload({ to:'a@b.com', matIds: many });
  assert.equal(p.matIds.length, 10);
  assert.ok(p.matIds.every(x=>typeof x==='string'));
});

test('빈 값으로 불러도 터지지 않는다', () => {
  const p = MD.slimPayload(null);
  assert.equal(p.to, ''); assert.deepEqual(p.matIds, []); assert.deepEqual(p.droppedFiles, []);
});

/* ── 접속 아이디 차례 ── */

test('@ 앞부분을 먼저, 그다음 주소 전체 — 환경변수가 있으면 그것이 맨 앞', () => {
  assert.deepEqual(MD.loginIds('370-6@daum.net', ''), ['370-6', '370-6@daum.net']);
  assert.deepEqual(MD.loginIds('370-6@daum.net', 'myid'), ['myid', '370-6', '370-6@daum.net']);
});

test('같은 아이디를 두 번 넣지 않는다', () => {
  assert.deepEqual(MD.loginIds('370-6@daum.net', '370-6'), ['370-6', '370-6@daum.net']);
});

/* ── 실패 안내 ── */

test('까닭에 따라 다음 걸음을 다르게 알린다', () => {
  assert.match(MD.errorHint({ code:'EAUTH', message:'535 auth failed' }), /앱 비밀번호/);
  assert.match(MD.errorHint({ message:'550 5.1.1 does not exist' }), /없는 주소/);
  assert.match(MD.errorHint({ message:'connect ETIMEDOUT' }), /IMAP\/SMTP/);
});

test('서버가 준 말을 그대로 담는다 — 우리 문구로 덮으면 원인을 잃는다', () => {
  assert.match(MD.errorHint({ message:'550 5.1.1 NoSuchUser xyz' }), /NoSuchUser xyz/);
});
