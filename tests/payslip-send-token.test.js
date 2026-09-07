'use strict';
/* 급여명세서 발송 — 증표를 붙여 «한 번만» 부른다 (2026-09-07)

   ★ 왜 이 검사가 생겼나 — 실측으로 확인한 일이다.
     pu-erp 의 postMail 이 실패하면 «증표 없이 한 번 더» 걸고 있었다.
     서버(requireStaff)는 2026-09-05 부터 증표를 반드시 요구하므로 그 두 번째 요청은
     **성공할 수가 없다.** 구멍은 아니었다 — 나쁜 것은 «거짓말»이다:
     무슨 까닭으로 실패해도 두 번째 요청이 401 을 받아 와 사람에게는
     「로그인 후 이용해 주세요」가 뜬다. 로그인은 되어 있는데 로그인을 하라고 한다.
     서버 기록(2026-09-05)에 401 이 세 번, 성공은 한 번도 없었다.

   ★ 지키는 것
     ① 증표를 붙여 «한 번만» 부른다 — 증표 없는 되돌림을 만들지 않는다
     ② 실패 까닭이 «그대로» 올라온다 (401 로 덮이지 않는다)
     ③ 서버는 증표를 반드시 요구한다 · 열쇠보다 «먼저» 누구인지 본다
     ④ sendPayslip 은 비밀값을 «선언»한다 — 안 하면 다시 올릴 때 발송이 통째로 멎는다
   실행: node --test tests/payslip-send-token.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const fns = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* 주석은 걷어 놓고 본다 — 잘 쓴 주석이 검사를 통과시키면 아무것도 안 지킨다 */
function 알맹이(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function 떼기(이름, 글) {
  /* async 도 받는다 — requireStaff 가 async 라 「못 찾았습니다」로 헛돌았다 */
  const at = 글.search(new RegExp('^(?:async )?function ' + 이름 + '\\(', 'm'));
  assert.ok(at > 0, '★ ' + 이름 + ' 을 못 찾았습니다');
  return 글.slice(at, 글.indexOf('\n}', at) + 2);
}

/* 진짜 postMail 을 돌린다 — 글자만 보면 「되돌림이 없다」를 말로만 확인한다 */
function 발송상자(옵션) {
  const o = 옵션 || {};
  const 부른것 = [];
  const c = {
    부른것,
    Promise, Error, String, Object, JSON,
    fetchT(url, opts, ms) {
      부른것.push({ url, headers: Object.assign({}, opts && opts.headers), ms });
      if (o.실패) return Promise.reject(o.실패);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    },
    window: { firebase: { auth: () => ({ currentUser: o.로그인 === false ? null : {
      getIdToken: () => Promise.resolve('토큰123')
    } }) } }
  };
  c.firebase = c.window.firebase;
  vm.createContext(c);
  vm.runInContext(떼기('postMail', erp), c);
  return c;
}

test('★ 증표를 붙여 부른다 — 안 붙이면 서버가 401 로 되돌린다', async () => {
  const c = 발송상자();
  await c.postMail('https://x/sendPayslip', { to: 'a@b.c' });
  assert.equal(c.부른것.length, 1);
  assert.equal(c.부른것[0].headers.Authorization, 'Bearer 토큰123',
    '★ 로그인 증표를 안 붙였습니다 — 서버가 받지 않습니다');
});

test('★★★ 실패해도 «증표 없이 다시 걸지» 않는다', async () => {
  /* 2026-09-07 에 걷어낸 자리다. 되돌아오면 같은 거짓말이 되살아난다. */
  const c = 발송상자({ 실패: new Error('창구가 막혔습니다(CORS)') });
  await assert.rejects(() => c.postMail('https://x/sendPayslip', { to: 'a@b.c' }));
  assert.equal(c.부른것.length, 1,
    '★★★ 실패한 뒤 한 번 더 걸었습니다. 서버는 증표를 «반드시» 요구하므로 그 요청은\n' +
    '  성공할 수 없고, 401 을 받아 와 사람에게 「로그인 후 이용해 주세요」를 보여 줍니다 —\n' +
    '  로그인은 되어 있는데 로그인을 하라고 하니 고칠 데를 못 찾습니다.');
  c.부른것.forEach((x, i) => assert.ok(x.headers.Authorization,
    '★★★ ' + (i + 1) + '번째 요청에 증표가 없습니다'));
});

test('★★ 실패 까닭이 «그대로» 올라온다 — 401 로 덮이지 않는다', async () => {
  const c = 발송상자({ 실패: new Error('메일 열쇠가 서버에 없습니다') });
  await assert.rejects(() => c.postMail('https://x/sendPayslip', {}),
    /메일 열쇠가 서버에 없습니다/,
    '★★ 진짜 까닭이 사라졌습니다 — 무엇을 고쳐야 하는지 알 수 없습니다');
});

test('★ 로그인 안 되어 있으면 «부르지도» 않는다', async () => {
  const c = 발송상자({ 로그인: false });
  await assert.rejects(() => c.postMail('https://x/sendPayslip', {}), /로그인/);
  assert.equal(c.부른것.length, 0, '★ 증표도 없이 서버를 부릅니다');
});

test('★ 시간초과는 시간초과로 알린다 — 다시 걸어 30초를 또 기다리지 않는다', async () => {
  const e = new Error('시간이 지났습니다'); e.timeout = true;
  const c = 발송상자({ 실패: e });
  await assert.rejects(() => c.postMail('https://x/sendPayslip', {}), /시간/);
  assert.equal(c.부른것.length, 1, '★ 시간초과에 다시 걸어 기다림이 두 배가 됩니다');
});

/* ══════ 서버 쪽 ══════ */

/* 진짜 requireStaff 를 돌린다.
   ⚠ 처음엔 글자만 봤다(「status = 401 이 있는가」). 문을 `if (false)` 로 열어 두는
     되돌림이 그 검사를 «통과했다» — 401 을 내는 줄은 그대로 남아 있으니까.
     문이 실제로 닫히는지는 돌려 봐야 안다. */
function 문상자(옵션) {
  const o = 옵션 || {};
  const c = {
    Promise, Error, String, RegExp, Object,
    getAuth: () => ({
      verifyIdToken: (tok, checkRevoked) => {
        c.본것 = { tok, checkRevoked };
        if (o.토큰나쁨) return Promise.reject(new Error('토큰이 틀렸습니다'));
        return Promise.resolve({ uid: 'u1', firebase: { sign_in_provider: o.방식 || 'password' } });
      }
    })
  };
  vm.createContext(c);
  vm.runInContext(떼기('requireStaff', fns), c);
  return c;
}
const 요청 = (h) => ({ headers: h || {} });

test('★★★ 증표 없는 요청을 «막는다» — 안 막으면 우리 도메인이 공개 발송기가 된다', async () => {
  const c = 문상자();
  await assert.rejects(() => c.requireStaff(요청({})), (e) => {
    assert.equal(e.status, 401, '★★★ 증표가 없는데 401 이 아닙니다');
    return true;
  }, '★★★ 증표 없는 요청이 통과합니다 — 주소만 알면 누구나 푸른노무법인 이름으로\n' +
     '  메일을 보낼 수 있습니다.');
  /* Bearer 가 아닌 것도 막는다 */
  await assert.rejects(() => c.requireStaff(요청({ authorization: 'Basic abc' })),
    (e) => e.status === 401, '★★ Bearer 가 아닌 증표를 통과시킵니다');
});

test('★★ 증표가 «진짜인지» 서버에 물어본다 — 지어낸 글자를 통과시키지 않는다', async () => {
  const c = 문상자({ 토큰나쁨: true });
  await assert.rejects(() => c.requireStaff(요청({ authorization: 'Bearer 지어낸것' })),
    /토큰이 틀렸습니다/, '★★ 증표를 확인하지 않습니다 — 아무 글자나 통과합니다');
  const ok = 문상자();
  await ok.requireStaff(요청({ authorization: 'Bearer 진짜' }));
  assert.equal(ok.본것.tok, '진짜');
  assert.equal(ok.본것.checkRevoked, true,
    '★ 취소된 계정을 안 봅니다 — 내보낸 직원의 증표가 남아 있으면 그대로 보냅니다');
});

test('★ 이메일 로그인 계정만 보낸다', async () => {
  const c = 문상자({ 방식: 'google.com' });
  await assert.rejects(() => c.requireStaff(요청({ authorization: 'Bearer x' })),
    (e) => e.status === 403, '★ 다른 방식으로 들어온 계정도 메일을 보냅니다');
});

test('★★ 열쇠보다 «먼저» 누구인지 본다', () => {
  /* 순서가 뒤바뀌면 「메일 열쇠가 서버에 없습니다 — 대표님이 이렇게 넣어 주세요」가
     로그인도 안 한 아무에게나 나간다. 서버 속을 알려 주는 셈이다. */
  const at = fns.indexOf('exports.sendPayslip');
  assert.ok(at > 0, '★ sendPayslip 을 못 찾았습니다');
  const 몸 = 알맹이(fns.slice(at, at + 3000));
  const 누구 = 몸.indexOf('requireStaff(req)');
  /* ⚠ «선언»(runWith secrets)이 아니라 «읽는» 자리를 본다 — 선언은 늘 맨 앞이라
     그것으로 견주면 이 검사가 언제나 실패한다(처음에 그렇게 써서 헛돌았다). */
  const 열쇠 = 몸.indexOf('process.env.RESEND_API_KEY');
  assert.ok(누구 > 0 && 열쇠 > 0, '★ 확인하는 자리를 못 찾았습니다');
  assert.ok(누구 < 열쇠,
    '★★ 열쇠를 먼저 봅니다 — 로그인 안 한 사람에게 서버 안내가 나갑니다');
});

test('★★ sendPayslip 이 비밀값을 «선언»한다 — 안 하면 다시 올릴 때 발송이 멎는다', () => {
  /* 열쇠가 예전에 이 PC 의 functions/.env 에만 있었다. 그대로 다시 올리면
     RESEND_API_KEY 가 지워져 급여명세서 발송이 통째로 멎는다 — 지뢰였다. */
  const at = fns.indexOf('exports.sendPayslip');
  const 머리 = fns.slice(at, at + 400);
  assert.match(머리, /secrets:\s*\[\s*["']RESEND_API_KEY["']\s*\]/,
    '★★ 비밀값 선언이 없습니다 — 다시 올리는 순간 열쇠가 사라집니다');
});

test('★ 보내는 곳이 «인증된 도메인»이다 — 인증 안 된 곳을 넣으면 통째로 거절된다', () => {
  const m = /const FROM = process\.env\.PAYSLIP_FROM \|\| "([^"]+)"/.exec(fns);
  assert.ok(m, '★ 보내는 주소를 못 찾았습니다');
  /* ⚠ 값(fairrunlabor.com)을 박는다 — 이것이 «규칙»이다. Resend 에 인증을 마친
     도메인이 이곳뿐이고, 다른 곳으로 바꾸면 Resend 가 메일을 통째로 거절한다.
     바꾸려면 먼저 그 도메인의 DKIM 을 인증해야 한다. 검사고정-허용 */
  assert.match(m[1], /@fairrunlabor\.com>?$/,
    '★ 인증 안 된 도메인에서 보내려 합니다 — Resend 가 메일을 통째로 거절합니다.\n' +
    '  먼저 Resend 에서 그 도메인 인증(DNS 몇 줄)을 마쳐야 합니다.');
  assert.match(m[1], /^푸른노무법인 </, '★ 받는 사람에게 보낸 이가 누군지 안 보입니다');
});

test('★ 회신이 «사람이 보는 곳»으로 온다', () => {
  /* 본문에 「문의는 연락 주세요」라 써 놓고 회신이 아무도 안 보는 곳으로 가던 자리다 */
  assert.match(fns, /const REPLY_TO = process\.env\.PAYSLIP_REPLY_TO \|\| "[^"]+@[^"]+"/,
    '★ 회신 주소가 없습니다 — 근로자가 회신 단추를 누르면 아무도 안 봅니다');
});

test('★ 발송 창구는 «우리 화면»에서만 연다', () => {
  const m = /const MAIL_ORIGIN = "([^"]+)"/.exec(fns);
  assert.ok(m, '★ 창구 설정을 못 찾았습니다');
  assert.notEqual(m[1], '*',
    '★★ 아무 데서나 부를 수 있습니다 — 주소만 알면 푸른노무법인 이름으로 메일이 나갑니다');
  /* 화면이 실제로 그 자리에서 돈다 — 어긋나면 발송이 «창구 막힘»으로 조용히 실패한다 */
  assert.match(erp, new RegExp('https://us-central1-pureun-erp\\.cloudfunctions\\.net/sendPayslip'),
    '★ 화면이 부르는 주소가 바뀌었습니다');
});
