/* 큰 첨부 — 파일이 «창고를 거쳐» 간다 (대표 물음 2026-08-31)
   "용량이 너무 작은 것 아닌가. 좀 더 용량을 넓혀야 되는 것 아닌가?"

   ★ 8MB 는 다음메일 한도가 아니었다 — 다음은 18MB 를 준다.
     막고 있던 것은 «우리 서버로 가는 길»이다. 보내는 함수는 1세대라 요청 하나에
     10MB 까지만 받는데, 파일을 글자로 바꿔 실으면(base64) 1.33배로 분다.
     ⚠ 그래서 8MB 는 실려 갈 때 10.7MB — «이미 한도를 넘은 숫자»였다.
       숫자만 올리면 「서버 응답 413」으로 조용히 실패한다.

   지키는 것.
   ① 브라우저가 창고에 먼저 올리고, 요청에는 «자리»만 실어 보낸다
   ② 서버는 «보낸 사람 제 자리»만 꺼낸다 — 안 막으면 주소만 바꿔 남의 파일을 빼낸다
   ③ 예전 길(dataUrl)도 그대로 받는다 — 창고 규칙이 아직 없을 때 되돌아갈 길
   ④ 되돌아갈 때 «큰 것은 막고 말해 준다» — 조용히 빠뜨리면 「보냈는데 없다」가 된다
   ⑤ 보낸 «뒤»에 치운다 — 먼저 치우면 못 붙이고, 안 치우면 창고에 쌓인다
   ⑥ 치우다 실패해도 «보내기는 성공»이다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const MD = require(path.join(root, 'functions', 'mail-deliver.js'));
const md = fs.readFileSync(path.join(root, 'functions', 'mail-deliver.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ══════ ② 남의 자리 (가장 위험한 자리) ══════ */

test('★★ 보낸 사람 «제 자리»만 꺼낸다 — 안 막으면 남의 파일을 첨부로 빼낸다', () => {
  assert.equal(MD.mailOutPathOk('pucards/mailout/uidA/f1', 'uidA'), true, '제 자리를 막습니다');
  [
    ['pucards/mailout/uidB/f1', 'uidA', '남의 자리'],
    ['pucards/photos/abc', 'uidA', '명함 사진 자리'],
    ['pucards/mailout/uidA/../uidB/f1', 'uidA', '거슬러 올라가는 자리'],
    ['pucards/mailout/uidAB/f1', 'uidA', '이름이 겹치는 자리'],
    ['', 'uidA', '빈 자리'],
    ['pucards/mailout/uidA/f1', '', '누구인지 모를 때']
  ].forEach(([p, uid, why]) =>
    assert.equal(MD.mailOutPathOk(p, uid), false, why + '를 통과시킵니다: ' + p));
});

/* ══════ ①③④ 브라우저 쪽 ══════ */

function boot(o) {
  const opt = o || {};
  const put = [];
  const toasts = [];
  const ctx = {
    Object, String, Number, Math, Date, Promise, Array, JSON,
    _compose: { files: [] },
    grabCompose() {}, redrawCompose() {},
    toast: (m) => { toasts.push(String(m)); },
    fmtMB: (n) => (Number(n || 0) / 1024 / 1024).toFixed(1) + 'MB',
    FileReader: function () {
      this.readAsDataURL = (f) => { this.result = 'data:x;base64,AAA'; setTimeout(() => this.onload(), 0); };
    },
    firebase: {
      auth: () => ({ currentUser: { uid: 'uidA' } }),
      storage: () => ({ ref: (p) => ({ put: (f) => {
        put.push({ path: p, name: f.name });
        return opt.bucketBad ? Promise.reject(new Error('permission-denied')) : Promise.resolve();
      } }) })
    },
    put, toasts
  };
  vm.createContext(ctx);
  /* ⚠ 줄 끝까지 잘라 오면 «뒤에 붙은 주석»이 함께 딸려 와 여러 줄 주석이 안 닫힌다 */
  vm.runInContext(app.match(/const MAIL_FILE_MAX\s*=[^;]*;/)[0], ctx);
  vm.runInContext(app.match(/const MAIL_INLINE_MAX\s*=[^;]*;/)[0], ctx);
  vm.runInContext(sliceFn(app, 'function mailOutRef('), ctx);
  /* ⚠ async 를 함께 떼어 와야 한다 — 「function …」에서 자르면 async 가 떨어져
       안의 await 가 구문오류가 된다(여기서 한 번 걸렸다). */
  vm.runInContext(sliceFn(app, 'async function addLocalFiles('), ctx);
  return ctx;
}
const MB = (n) => n * 1024 * 1024;
const flush = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 0)); };

test('★★ 큰 파일이 «창고로» 간다 — 요청에는 자리만 실린다', async () => {
  const c = boot();
  await c.addLocalFiles({ files: [{ name: '태양농산_착수보고서.pptx', size: MB(11.7) }] });
  await flush();
  assert.equal(c.put.length, 1, '창고에 안 올렸습니다');
  assert.match(c.put[0].path, /^pucards\/mailout\/uidA\//, '엉뚱한 자리에 올립니다: ' + c.put[0].path);
  const f = c._compose.files[0];
  assert.ok(f && f.path, '자리를 안 들고 갑니다');
  assert.ok(!f.dataUrl, '창고에 올려 놓고 글자로도 실어 보냅니다 — 요청이 다시 무거워집니다');
});

test('★★ 18MB 까지 붙는다 — 다음메일이 주는 만큼', async () => {
  const c = boot();
  await c.addLocalFiles({ files: [{ name: '큰것.pdf', size: MB(17.5) }] });
  await flush();
  assert.equal(c._compose.files.length, 1, '17.5MB 를 막았습니다: ' + c.toasts.join(' '));
});

test('★ 그보다 크면 «미리» 막고 크기를 말해 준다', async () => {
  const c = boot();
  await c.addLocalFiles({ files: [{ name: '너무큰것.zip', size: MB(25) }] });
  await flush();
  assert.equal(c._compose.files.length, 0, '18MB 넘는 것을 붙였습니다');
  assert.match(c.toasts.join(' '), /25\.0MB/, '얼마나 큰지 안 알려 줍니다');
});

test('★★ 창고가 막히면 «예전 길»로 되돌아간다 — 작은 것은 그대로 붙는다', async () => {
  const c = boot({ bucketBad: true });
  await c.addLocalFiles({ files: [{ name: '작은것.hwp', size: MB(3) }] });
  await flush();
  const f = c._compose.files[0];
  assert.ok(f, '창고가 막혔다고 작은 파일까지 못 붙입니다 — 규칙 올라가기 전까지 통째로 죽습니다');
  assert.ok(f.dataUrl, '되돌아간 길에서 글자로 안 실었습니다');
  assert.ok(!f.path, '올리지도 못한 자리를 들고 갑니다');
});

test('★★ 되돌아갈 때 «큰 것은 막고 왜 안 되는지 말한다» — 조용하면 보낸 뒤에 안다', async () => {
  const c = boot({ bucketBad: true });
  await c.addLocalFiles({ files: [{ name: '큰것.pptx', size: MB(11.7) }] });
  await flush();
  assert.equal(c._compose.files.length, 0, '10MB 한도를 넘는 것을 예전 길로 밀어 넣습니다');
  const t = c.toasts.join(' ');
  assert.match(t, /창고 규칙/, '왜 안 되는지 안 알려 줍니다: ' + t);
  assert.match(t, /큰것\.pptx/, '어느 파일인지 안 알려 줍니다');
});

test('★★ 되돌아가는 길의 한도가 «요청 한도 안»이다 — 넘으면 413 으로 조용히 실패한다', () => {
  const c = boot();
  /* ⚠ const 는 상자 바깥으로 안 새어 나온다 — 상자 «안에서» 읽어야 한다 */
  const inline = vm.runInContext('MAIL_INLINE_MAX', c);
  const big = vm.runInContext('MAIL_FILE_MAX', c);
  /* 글자로 바꾸면 4/3 배가 된다. 1세대 함수는 요청 하나에 10MB 까지다. */
  assert.ok(inline * 4 / 3 < 10 * 1024 * 1024,
    '되돌아가는 길 한도(' + (inline / 1048576) + 'MB)가 실려 갈 때 10MB 를 넘습니다');
  assert.ok(big > inline, '창고 길이 예전 길보다 넓지 않습니다');
  assert.ok(big >= 18 * 1024 * 1024, '다음메일이 주는 18MB 를 다 못 씁니다');
});

test('★★ 자리에 «파일 이름»을 쓰지 않는다 — 한글·빈칸이 든 이름은 안 올라간다', async () => {
  const c = boot();
  await c.addLocalFiles({ files: [{ name: '태양 농산 착수 보고서(최종).pptx', size: MB(2) }] });
  await flush();
  assert.ok(!/태양|\s|\(/.test(c.put[0].path), '이름이 자리에 들어갔습니다: ' + c.put[0].path);
  assert.equal(c._compose.files[0].name, '태양 농산 착수 보고서(최종).pptx', '이름을 잃었습니다');
});

/* ══════ ①③ 보낼 때 자리를 실어 보내나 ══════ */

test('★★ 보낼 때 자리(path)를 «함께» 실어 보낸다 — 빼면 큰 첨부가 조용히 빠진다', () => {
  const send = app.slice(app.indexOf('const r = await postAutoMail({'), app.indexOf('const r = await postAutoMail({') + 900)
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(send, /path:\s*f\.path/, '자리를 안 실어 보냅니다');
  assert.match(send, /dataUrl:\s*f\.dataUrl/, '예전 길을 잃었습니다');
});

/* ══════ ⑤⑥ 서버 쪽 ══════ */

test('★★ 창고 이름이 브라우저와 «같다» — 다르면 첨부가 조용히 빠진 채 나간다', () => {
  const inApp = (app.match(/storageBucket:\s*'([^']+)'/) || [])[1];
  assert.equal(MD.CARDS_BUCKET, inApp,
    '서버(' + MD.CARDS_BUCKET + ')와 브라우저(' + inApp + ')가 다른 창고를 봅니다');
});

test('★★ 보낸 «뒤»에 치운다 — 먼저 치우면 못 붙인다', () => {
  const iSend = md.search(/sendMail|transporter\.sendMail|await\s+MS\.send/);
  const iSweep = md.indexOf('sweepMailOut(deps, got.used)');
  assert.ok(iSweep > 0, '치우는 자리가 없습니다 — 창고에 임시 파일이 영영 쌓입니다');
  if (iSend > 0) assert.ok(iSweep > iSend, '보내기 전에 치웁니다 — 첨부가 빈 채로 나갑니다');
});

test('★★ 치우다 실패해도 «보내기는 성공»이다', async () => {
  const bad = { getStorage: () => ({ bucket: () => ({ file: () => ({
    delete: () => Promise.reject(new Error('없는 파일')) }) }) }) };
  await assert.doesNotReject(() => MD.sweepMailOut(bad, ['pucards/mailout/uidA/f1']),
    '치우다 실패하면 보내기까지 실패로 보입니다');
});

test('★ 서버도 크기를 «다시» 본다 — 브라우저 검사는 건너뛸 수 있다', () => {
  assert.ok(MD.MAILOUT_MAX >= 18 * 1024 * 1024, '서버 한도가 18MB 보다 좁습니다');
  assert.match(md, /getMetadata\(\)/, '창고에서 크기를 안 봅니다');
  assert.match(md, /MAILOUT_MAX/, '크기 한도를 안 씁니다');
});

test('★★ 창고를 열 길이 없으면 «건너뛴다» — 터지지 않는다', () => {
  assert.match(md, /if \(!deps \|\| !uid\)/,
    '창고를 열 길 없이 꺼내려 듭니다 — 예약 발송처럼 uid 가 없는 길에서 터집니다');
});

test('★ 보내는 함수가 창고 열 길과 «누구인지»를 넘긴다', () => {
  const idx = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = idx.indexOf('const r = await MD.deliver({');
  const seg = idx.slice(i, i + 500);
  assert.match(seg, /deps:\s*\{\s*getStorage/, '창고 열 길을 안 넘깁니다');
  assert.match(seg, /uid:\s*sender\.uid/, '누구 자리인지 안 넘깁니다');
});
