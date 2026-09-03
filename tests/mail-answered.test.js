/* 답장한 메일에 «답장 보냄» 표시 (대표 지시 2026-09-03)
   「메일 답변을 준 것은 답변 보낸 것으로 모두 표시되어야 한다」

   ★ 자료는 «진작부터 와 있었다» — 서버가 IMAP 의 \Answered 를 row.w 로 담아 두는데
     (functions/mail-box.js msgRow), 화면이 그 칸을 한 번도 안 썼다. 새로 받아 올 것이 없다.
   ★ 그런데 그것만으로는 「모두」가 안 된다 — 다음메일은 «제 창에서» 답장했을 때만
     \Answered 를 켠다. 우리 앱이 SMTP 로 보낸 답장은 다음이 그 메일의 답장인 줄 모른다.
     그래서 보낸 뒤 우리가 직접 켜 준다.

   지키는 것.
   ① 목록이 row.w 를 «본다» — PC 와 폰 «둘 다»
   ② 답장 봉투는 읽음 봉투와 «다르게» 그린다
   ③ 답장은 읽음과 «따로» 논다 — 안 읽음으로 되돌려도 답장한 사실은 남는다
   ④ 서버가 answer 표시를 받는다 — 칸 이름은 msgRow 와 같아야 한다(w)
   ⑤ 우리가 보낸 답장은 «보낸 뒤»에 켠다 — 먼저 켜면 실패했을 때 거짓이 된다
   ⑥ 예약은 «안 켠다» — 아직 안 나갔다
   ⑦ 이미 켜져 있으면 서버를 안 두드린다
   ⑧ 표시가 실패해도 «보내기는 성공»이다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'functions', 'mail-sync.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
const box = fs.readFileSync(path.join(root, 'functions', 'mail-box.js'), 'utf8');

/* ══════ ① 목록이 본다 ══════ */

test('★★ 목록이 답장 표(row.w)를 «본다» — PC 와 폰 둘 다', () => {
  const all = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* 봉투를 그리는 두 자리가 모두 w 를 넘기는가.
     ⚠ [^)]* 로 자르면 안 된다 — 인자 안에 Number(...) 가 있어 «첫 닫는 괄호»에서
       끊긴다(처음에 그렇게 써서 멀쩡한 코드가 틀렸다고 나왔다). 넉넉히 잘라 본다.
     ⚠ «만드는 자리»(function mbEnvSvg…)는 부르는 자리가 아니다 — 빼고 센다. */
  const calls = all.match(/(?<!function\s)mbEnvSvg\([\s\S]{0,60}/g) || [];
  assert.ok(calls.length >= 2, '봉투를 그리는 자리가 ' + calls.length + '곳뿐입니다(PC·폰 둘이어야 합니다)');
  calls.forEach(c => assert.match(c, /v\.w/,
    '봉투 하나가 답장 표를 안 봅니다: ' + c + ' — 한쪽만 고치면 그 화면에서만 표시가 없습니다'));
});

test('★★ 서버가 담아 주는 칸과 «같은 이름»을 본다 — 다르면 조용히 늘 꺼져 보인다', () => {
  assert.match(box, /w:\s*hasFlag\(m\.flags,\s*'\\\\Answered'\)/,
    '서버가 \\Answered 를 w 로 안 담습니다');
});

/* ══════ ②③ 그리는 모양 ══════ */

test('★★ 답장 봉투를 «따로» 그린다 — 읽음과 같으면 표시한 뜻이 없다', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function mbEnvSvg('), ctx);
  const unread = ctx.mbEnvSvg(0, 0);
  const read = ctx.mbEnvSvg(1, 0);
  const ans = ctx.mbEnvSvg(1, 1);
  assert.notEqual(ans, read, '답장한 봉투가 읽은 봉투와 똑같습니다');
  assert.notEqual(ans, unread, '답장한 봉투가 안 읽은 봉투와 똑같습니다');
  assert.match(ans, /<svg/, '그림이 아닙니다');
});

test('★★ 답장은 읽음과 «따로» 논다 — 안 읽음으로 되돌려도 답장 표시는 남는다', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function mbEnvSvg('), ctx);
  assert.equal(ctx.mbEnvSvg(0, 1), ctx.mbEnvSvg(1, 1),
    '안 읽음으로 되돌리면 답장 표시가 사라집니다');
});

/* ══════ ④ 서버 ══════ */

test('★★ 서버가 answer 표시를 받는다 — 칸 이름이 msgRow 와 같아야 한다', () => {
  assert.match(sync, /answer:\s*'\\\\Answered'/, '서버가 answer 를 모릅니다');
  assert.match(sync, /KEYS\s*=\s*\{[^}]*answer:\s*'w'/, '우리 목록에 적는 칸이 w 가 아닙니다');
  assert.ok(!/const key = \(String\(b\.flag\) === 'star'\) \? 'g' : 'r';/.test(sync),
    '옛 두 갈래 그대로입니다 — answer 가 읽음(r) 칸에 적힙니다');
});

/* ══════ ⑤⑥⑦⑧ 우리가 보낸 답장 ══════ */

test('★★ 답장 화면이 «어느 메일의 답장인지»를 들고 간다', () => {
  const rep = sliceFn(app, 'function mbReply(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(rep, /replyTo:\s*\{\s*slug:\s*o\.slug,\s*uid:\s*String\(o\.uid\)\s*\}/,
    '답장할 때 원래 메일을 안 들고 갑니다 — 보낸 뒤 표를 켤 수가 없습니다');
  const build = sliceFn(app, 'function mailPageBuild(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(build, /replyTo:\s*p\.replyTo/, '편지를 지을 때 그것을 안 담습니다');
});

test('★★ «보낸 뒤»에 켠다 — 먼저 켜면 실패했을 때 답장한 것으로 남는다', () => {
  const send = sliceFn(app, 'async function sendCompose(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const iSend = send.indexOf('await postAutoMail(');
  const iMark = send.indexOf('mbAnswered(');
  assert.ok(iSend > 0 && iMark > 0, '보내는 자리나 표시하는 자리를 못 찾았습니다');
  assert.ok(iMark > iSend, '보내기 «전»에 표시합니다 — 실패해도 답장한 것으로 남습니다');
});

test('★★ 예약은 «안 켠다» — 아직 안 나갔다', () => {
  const send = sliceFn(app, 'async function sendCompose(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(send, /const rep = \(!r\.scheduled && c\.replyTo\)/,
    '예약해 둔 것도 답장 보낸 것으로 표시합니다');
});

test('★★ 이미 켜져 있으면 서버를 «안 두드린다»', () => {
  const f = sliceFn(app, 'function mbAnswered(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = f.indexOf('if(row && Number(row.w||0)) return;');
  const j = f.indexOf('fetch(');
  assert.ok(i > 0, '이미 켜졌는지 안 봅니다');
  assert.ok(j > i, '보기도 전에 서버에 붙습니다');
});

test('★★ 표시가 실패해도 «보내기는 성공»이다 — 붉은 알림을 띄우면 또 보내게 된다', () => {
  const f = sliceFn(app, 'function mbAnswered(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/toast\(/.test(f), '실패를 사람에게 붉게 알립니다 — 「안 갔나?」 하고 다시 보냅니다');
  assert.match(f, /console\.warn/, '실패를 아무 데도 안 남깁니다');
  /* 되돌리지 않는다 — 보낸 것은 나갔다 */
  assert.ok(!/row\.w = 0/.test(f), '실패했다고 표시를 되돌립니다 — 보낸 것은 나갔습니다');
});

test('★ 답장 봉투에 «무엇인지» 적어 준다 — 그림만으로는 모른다', () => {
  const all = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const n = (all.match(/답장을 보낸 메일입니다/g) || []).length;
  assert.ok(n >= 2, '귀띔이 ' + n + '곳뿐입니다 — PC·폰 둘 다 있어야 합니다');
});
