'use strict';
/* ✉️ 사진첩에서 «메일 첨부»로 보낸다 — 기록을 남기고 (대표 지시 2026-09-03)

   「기록 남기고 민감서류 메일」 · 승인 목업 docs/mockups/photos-mail-and-bankbook.html

   ■ 무엇이 없었나
   사진첩에서 메일로 보내려면 **반드시 내려받아 다시 붙여야** 했다. 그러면
   ① 보낼 때마다 사람 컴퓨터에 원본이 한 벌 더 굴러다니고
   ② 누가 무엇을 누구에게 보냈는지 **아무 데도 안 남았다.**

   ■ 이 검사가 지키는 것 — 조용히 어긋나면 가장 나쁜 것들
   ① **창고를 콕 집는다** — 사진첩 창고와 메일 첨부 창고가 «다른 곳»이다.
      틀리면 서버가 못 찾아 **첨부가 빠진 채로 메일이 나간다**(받는 쪽은 그걸 모른다)
   ② **원본 자리를 넘기지 않는다** — 서버는 보낸 뒤 그 자리를 치운다. 원본을 넘기면
      사진첩 사진이 지워진다
   ③ **남의 사진은 안 보낸다**
   ④ **민감 서류는 막지 않되 먼저 알린다** + 사진에 보낸 자국을 남긴다

   실행: node --test tests/photos-mail-send.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const deliver = fs.readFileSync(path.join(R, 'functions', 'mail-deliver.js'), 'utf8');
const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
const docFile = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
const { stripComments } = require('./strip-comments');

/* 순수 판정만 떼어 실제로 돌린다 */
function load() {
  const c = { String, Object, Array, Number, Boolean };
  vm.createContext(c);
  /* ⚠ 사람 찾기 알맹이는 «그 층» 것이다 — 화면은 명함이 어떻게 생겼는지 모른다
     (검사: 「다른 앱의 실제 클라우드 루트를 건드리지 않는다」). */
  vm.runInContext(cutFn(docFile, 'function pickMailPeople(') + '\n' +
    cutFn(app, 'function mailSensitiveCount('), c);
  return c;
}
const M = load();

/* ══════ ① 창고를 콕 집는다 ══════ */

test('★★★ 메일 첨부 창고가 «서버가 읽는 그 창고»다 — 어긋나면 첨부가 조용히 빠진다', () => {
  const mine = (/var CARDS_BUCKET = 'gs:\/\/([\w-]+)'/.exec(docFile) || [])[1];
  /* ⚠ 따옴표 종류를 가리지 않는다 — 작은따옴표만 보다 「undefined」와 견주고 있었다 */
  const server = (/const CARDS_BUCKET = ['"]([\w-]+)['"]/.exec(deliver) || [])[1];
  assert.ok(mine, 'MAIL_BUCKET 을 못 찾았습니다');
  assert.equal(mine, server,
    '★★★ 사진첩이 「' + mine + '」에 올리는데 서버는 「' + server + '」를 읽습니다.\n' +
    '  서버가 못 찾으면 **첨부가 빠진 채 메일이 나갑니다** — 받는 쪽은 그걸 모릅니다.');
});

test('★★★ 사진첩 제 창고에 올리지 «않는다» — 그냥 firebase.storage() 는 그리로 간다', () => {
  const own = (/storageBucket: '([\w-]+)'/.exec(app) || [])[1];
  const mail = (/var CARDS_BUCKET = 'gs:\/\/([\w-]+)'/.exec(docFile) || [])[1];
  assert.notEqual(own, mail,
    '★★ 두 창고가 같아졌습니다 — 이 검사의 전제가 바뀌었으니 아래 줄부터 다시 보세요');
  assert.match(cutFn(docFile, 'function putMailFile('), /cardsStorage\(\)/,
    '★★★ 버킷을 안 집으면 사진첩 창고(' + own + ')에 올라가고 서버는 못 찾습니다');
  /* ★★ 화면은 창고 이름을 아예 «모른다» — 알기 시작하면 그쪽이 바뀔 때 조용히 깨진다 */
  assert.ok(stripComments(app).indexOf('pucards') < 0,
    '★★★ 화면이 기업정보함 자리 이름을 들고 있습니다 — 그 층(js/pu-doc-file.js)에 맡기세요');
});

/* ══════ ② 원본을 넘기지 않는다 ══════ */

test('★★★ 사진첩 «원본 자리»를 넘기지 않는다 — 서버가 보낸 뒤 그 자리를 치운다', () => {
  const fn = cutFn(docFile, 'function putMailFile(');
  assert.match(fn, /CARDS_ROOT \+ '\/mailout\/' \+ u\.uid \+ '\/'/,
    '★★★ 임시 자리(mailout)에 «사본»을 올려야 합니다.\n' +
    '  원본 자리를 넘기면 서버가 보낸 뒤 그것을 치워 **사진첩 사진이 지워집니다.**');
  assert.ok(fn.indexOf('pu_photos') < 0,
    '★★★ 사진첩 원본 자리(pu_photos)를 가리키고 있습니다 — 사진이 지워집니다');
  /* 서버가 실제로 그 자리만 받는다는 것도 함께 못박는다 */
  assert.match(deliver, /p\.indexOf\('pucards\/mailout\/' \+ uid \+ '\/'\) === 0/,
    '★ 서버가 제 자리만 꺼내는 규칙이 사라졌습니다');
});

test('★★ 원본은 «저장 층»을 거쳐 받는다 — 민감 서류의 열람 기록이 거기서 남는다', () => {
  const fn = cutFn(app, 'function mailPutOne(');
  assert.match(fn, /PuPhotoStore\.loadFullDetail\(/,
    '★★ 저장 층을 안 거치면 민감 서류가 안 열리고, 열람 기록도 안 남습니다');
});

/* ══════ ③ 남의 사진 ══════ */

test('★★★ 나에게 열려 있지 «않은» 사진은 안 보낸다', () => {
  const fn = cutFn(app, 'function openMailSend(');
  assert.match(fn, /ids\.filter\(function \(id\) \{ return mayShare\(id\); \}\)/,
    '★★★ 남의 사진이 섞이면 서버가 막는데, 화면은 보낸 줄 압니다');
  assert.match(fn, /if \(!mine\.length\)/, '★ 하나도 못 보내면 그때는 말해 줘야 합니다');
  assert.match(app, /빠집니다/, '★ 몇 장이 왜 빠지는지 안 적으면 「내가 고른 건 그게 아닌데」가 됩니다');
});

/* ══════ ④ 민감 서류 — 막지 않되 먼저 알린다 ══════ */

test('★★ 민감 서류를 «막지는 않는다» — 대표 결정. 대신 몇 장인지 먼저 알린다', () => {
  const n = M.mailSensitiveCount([{ sensitive: true }, { sensitive: false }, { sensitive: true }]);
  assert.equal(n, 2);
  const fn = cutFn(app, 'function renderMailSend(');
  /* ⚠ 글자가 «어딘가 적혀 있는가»만 보면 안 된다 — (false ? …) 로 죽여도 통과한다.
     실제로 돌연변이가 살아남아 드러났다. 「그 값이 조건인가」를 본다. */
  assert.match(fn, /\(sens \? '<div class="mwarn">/,
    '★★ 민감 장수가 «조건»이 아닙니다 — 죽은 채로 적혀만 있으면 아무 말도 안 뜹니다');
  assert.match(fn, /민감 서류 ' \+ sens \+ '장이 들어 있습니다/,
    '★★ 보내기 «전»에 안 알리면, 보내고 나서 아는 수밖에 없습니다');
  assert.match(fn, /누가·언제·누구에게·무엇을 보냈는지 기록에 남습니다/,
    '★★ 기록이 남는다는 것을 알려야 합니다 — 그것이 막지 않는 대신 두는 문입니다');
  /* 막는 줄이 생기면 이 결정이 조용히 뒤집힌다 */
  const send = cutFn(app, 'function doMailSend(');
  assert.ok(!/sensitive[\s\S]{0,40}return/.test(send),
    '★★ 민감이라고 보내기를 막고 있습니다 — 대표 결정과 어긋납니다');
});

test('★★★ 사진에 «보낸 자국»이 남는다 — 「이 통장 누구한테 보냈지」에 답해야 한다', () => {
  const fn = cutFn(app, 'function markMailed(');
  assert.match(fn, /mailed: \{ at: Date\.now\(\), by: /, '★★★ 누가·언제가 없으면 자국이 아닙니다');
  assert.match(fn, /to: String\(name \|\| to \|\| ''\)/, '★★ 누구에게 보냈는지가 없습니다');
  assert.match(fn, /PuPhotoStore\.saveRead\(/, '★★★ 저장을 안 하면 새로고침에 사라집니다');
  assert.match(cutFn(app, 'function doMailSend('), /markMailed\(list, m\.to, m\.name\)/,
    '★★ 자국을 남기는 자리를 안 부르면 함수만 있고 소용없습니다');
  assert.match(app, /read\.mailed && read\.mailed\.at/,
    '★★ 사진 판에 안 그리면 남겨 놓고 아무도 못 봅니다');
});

/* ══════ ⑤ 받는 사람 ══════ */

test('★★ 받는 주소를 «손으로 치지 않는다» — 오타 한 글자가 남의 메일함으로 간다', () => {
  const fn = cutFn(app, 'function renderMailSend(');
  assert.match(fn, /기업정보함에서 이름·회사로 찾기/, '★★ 찾아서 고르는 길이 없습니다');
  assert.ok(!/type="email"/.test(fn), '★★ 주소를 직접 치는 칸이 생겼습니다');
});

test('★★ 이메일이 없는 명함은 «안 나온다» — 골라도 보낼 수가 없다', () => {
  const idx = {
    a: { k: 'card', n: '김동현', c: '대천맛김', e: 'kim@x.com' },
    b: { k: 'card', n: '김동수', c: '대천맛김' },              // 이메일 없음
    c: { k: 'biz', n: '대천맛김', e: 'biz@x.com' }             // 사람이 아니다
  };
  const out = M.pickMailPeople(idx, '대천맛김');
  assert.equal(out.length, 1, '★★ 이메일 없는 명함·업체 줄이 섞였습니다');
  assert.equal(out[0].email, 'kim@x.com');
});

test('★ 두 글자 미만으로는 안 찾는다 — 전부가 쏟아지면 고를 수가 없다', () => {
  const idx = { a: { k: 'card', n: '김동현', e: 'kim@x.com' } };
  assert.deepEqual(Array.prototype.slice.call(M.pickMailPeople(idx, '김')), []);
  assert.deepEqual(Array.prototype.slice.call(M.pickMailPeople(idx, '')), []);
});

test('★ 회사 표기가 달라도 찾는다 — 「(주)대천맛김」·「대천맛김」', () => {
  const idx = { a: { k: 'card', n: '김동현', c: '(주)대천맛김', e: 'kim@x.com' } };
  assert.equal(M.pickMailPeople(idx, '대천맛김').length, 1);
  assert.equal(M.pickMailPeople(idx, '주식회사 대천맛김').length, 1);
});

/* ══════ ⑥ 보내는 길이 기업정보함과 «같은 길»인가 ══════ */

test('★★ 기업정보함과 «같은 서버·같은 짐»을 쓴다 — 길이 둘이면 한쪽만 고쳐진다', () => {
  const mine = (/var MAIL_FN_URL = '([^']+)'/.exec(docFile) || [])[1];
  const theirs = (/const MAIL_FN_URL = '([^']+)'/.exec(cards) || [])[1];
  assert.equal(mine, theirs, '★★ 사진첩과 기업정보함이 다른 서버를 부릅니다');
  assert.match(cutFn(docFile, 'function sendMail('), /'Authorization': 'Bearer ' \+ token/,
    '★★ 로그인 열쇠를 안 실으면 서버가 막습니다');
  const fn = cutFn(app, 'function doMailSend(');
  assert.match(fn, /files: files/, '★★ 창고 자리를 안 실으면 첨부가 빈 채로 갑니다');
  assert.match(fn, /cardId: m\.cardId/,
    '★★ 명함 번호를 안 실으면 그 명함 밑의 「보낸 기록」에 안 남습니다');
});

test('★★ 서버가 «보낸 기록»을 남긴다 — 그것이 이 기능의 절반이다', () => {
  assert.match(deliver, /sendLog\/' \+ cardId/, '★★ 명함별 보낸 기록 자리가 사라졌습니다');
  assert.match(deliver, /sentBox/, '★★ 보낸 편지함 기록이 사라졌습니다');
});

test('★ 보내는 동안 «어디까지 갔는지» 보인다 — 큰 사진은 한참 걸린다', () => {
  const fn = cutFn(app, 'function doMailSend(');
  assert.match(fn, /올리는 중 ' \+ \(i \+ 1\) \+ '\/' \+ list\.length/,
    '★ 아무 말 없이 멎어 있으면 사람이 다시 누릅니다 — 두 번 갑니다');
  /* ⚠ 잠그는 자리는 «한 곳»뿐이다(photos-review-deadends 가 못박는다) —
     제 잠금을 또 만들지 말고 공용 잠금을 쓴다. */
  assert.match(fn, /lockSendBtn\('#mailGo', 'mailBox'\)/,
    '★★ 단추를 안 잠그면 두 번 눌러 두 번 나갑니다 — 그리고 잠금은 공용 하나를 씁니다');
});

test('★★ 실패하면 «되돌린다» — 눌러도 안 되는 단추로 남으면 안 된다', () => {
  const fn = cutFn(app, 'function doMailSend(');
  assert.match(fn, /catch \(e\)[\s\S]*go\.disabled = false/,
    '★★ 실패한 뒤 단추가 잠긴 채 남으면 다시 보낼 길이 없습니다');
  assert.match(fn, /alert\('보내지 못했습니다/, '★★ 조용히 실패하면 보낸 줄 압니다');
});

/* ══════ ⑤ 되돌릴 수 없는 발송은 «묻는다» (검토 2026-09-03) ══════
   ⚠ 확인이 «없었다» — 받는 사람을 고르고 제목만 있으면 한 번 눌러 나갔다.
     나간 메일은 회수하지 못한다. 통장 사본이 잘못된 사람에게 가면 되돌릴 길이 없다.
   ⚠ 「민감」 딱지는 화면에만 떴다 — 세어 놓고 보내기 앞에 다시 안 보여 주면
     그 딱지는 장식일 뿐이다.
   ★ 그래서 doMailSend 를 «돌려서» 본다: 묻는가 · 무엇을 묻는가 ·
     아니라고 하면 «정말로» 안 보내는가. */

function 발송상자(옵션) {
  const o = 옵션 || {};
  const 물음 = [], 보낸것 = [];
  const c = {
    String, Object, Array, Number, Boolean, JSON, Date, Math, Promise,
    console: { warn() {}, log() {} },
    /* 화면 부품은 «가짜»로 받쳐 준다 — 우리가 보는 것은 묻는지·보내는지다 */
    $: (id) => ({ mailSubj: { value: o.subject == null ? '서류 보냅니다' : o.subject },
                  mailBody: { value: '본문' },
                  mailGo: { disabled: false }, mailStat: { textContent: '' } }[id] || null),
    lockSendBtn() {}, closeMailSend() {}, toast() {}, alert() {},
    markMailed() {}, renderMailSend() {},
    mailPutOne: async (a) => ({ path: 'x/' + a.id }),
    PuDocFile: { sendMail: async (payload) => { 보낸것.push(payload); } },
    confirm: (msg) => { 물음.push(msg); return o.승낙 !== false; },
    _mailSend: { ids: ['a', 'b', 'c'], skipped: o.skipped || 0, sending: false,
                 to: 'hong@example.kr', name: '홍길동', cardId: 'c1' },
    /* 첨부 목록도 가짜 — 민감 두 장을 섞는다 */
    mailAttachList: () => [
      { id: 'a', title: '통장 사본', sensitive: true },
      { id: 'b', title: '신분증', sensitive: true },
      { id: 'c', title: '근로계약서', sensitive: false }
    ]
  };
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function mailSensitiveCount(') + '\n'
    + cutFn(app, 'async function doMailSend('), c);
  return { c, 물음, 보낸것 };
}

test('★★★ 보내기 전에 «묻는다» — 되돌릴 수 없는 발송이다', async () => {
  const { c, 물음, 보낸것 } = 발송상자({ skipped: 2 });
  await c.doMailSend();
  assert.equal(물음.length, 1, '★★★ 묻지 않고 보냈다 — 한 번 눌러 메일이 나간다');
  const q = 물음[0];
  assert.ok(q.indexOf('hong@example.kr') >= 0, '★★ 받는 사람을 안 보여 준다');
  assert.ok(q.indexOf('홍길동') >= 0, '★ 받는 사람 이름을 안 보여 준다');
  assert.ok(/3장/.test(q), '★★ 몇 장을 보내는지 안 보여 준다: ' + q);
  assert.ok(/민감/.test(q) && /2장/.test(q),
    '★★★ 민감 서류가 몇 장인지 안 보여 준다 — 딱지를 세어 놓고 안 쓰면 장식이다: ' + q);
  assert.ok(/되돌릴 수 없/.test(q), '★ 되돌릴 수 없다는 것을 안 말한다');
  assert.ok(/2장은 빠집니다|빠집니다/.test(q), '★ 빠지는 장수를 안 알린다');
  assert.equal(보낸것.length, 1, '★ 승낙했는데 안 보냈다');
});

test('★★★ 「아니오」면 «정말로» 안 보낸다', async () => {
  const { c, 물음, 보낸것 } = 발송상자({ 승낙: false });
  await c.doMailSend();
  assert.equal(물음.length, 1, '★ 묻지 않았다');
  assert.equal(보낸것.length, 0,
    '★★★ 「아니오」를 눌렀는데 메일이 나갔다 — 확인이 장식이다');
});

test('★ 제목이 비면 «묻기 전에» 막는다 — 헛되게 물어보지 않는다', async () => {
  const { c, 물음, 보낸것 } = 발송상자({ subject: '   ' });
  await c.doMailSend();
  assert.equal(물음.length, 0, '★ 제목도 없는데 사람에게 물었다');
  assert.equal(보낸것.length, 0, '★★ 제목 없이 보냈다');
});
