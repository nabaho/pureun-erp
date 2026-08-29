/* ══════════════════════════════════════════════════════════════════════════════
   회사 메일함을 «누가» 볼 수 있나 — 대표 지시 2026-08-27 「전 직원에게 다 열기」
   ══════════════════════════════════════════════════════════════════════════════
   ★ 왜 이 검사가 필요한가
     직원이 메일함에 들어가도 화면이 통째로 비어 있었다. 화면이 잘못된 줄 알기 쉬웠지만,
     막고 있던 것은 «DB 규칙»이었다(mailbox.read = isAdmin, 그런데 isAdmin 은 한 명뿐).
     이제 문이 «두 곳»이다 — 콘솔 규칙과 서버 함수. 두 곳이 «같은 뜻»이 아니면
       · 규칙만 열면 → 목록은 보이는데 본문 열 때 403
       · 서버만 열면 → 본문은 열리는데 목록이 안 뜬다
     둘 다 「화면이 이상하다」로 보일 뿐 원인이 안 보인다. 사람 눈으로는 못 잡는 자리다.

   ⚠ 「직원」의 뜻을 «로그인한 사람»으로 두면 안 된다. requireStaff 는 「비밀번호로
     로그인했는가」만 본다 — 회사 계정이 아니어도 통과한다. 회사 메일함에는 고객사
     임직원의 신상이 제목에까지 들어 있다. 그래서 «사번이 적힌 재직자»만 통과시킨다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const build = require('../functions/mail-sync.js');

/* ── 가짜 부품 ──────────────────────────────────────────────────────────────
   IMAP 에 붙지 않는다. 문 앞에서 되돌아오는지만 본다. 그래서 «몸통에 안 닿는»
   요청을 쓴다(본문 없이 readMailMessage → 문을 지나면 400 「어느 메일인지…」).
   403 이면 막힌 것, 그 밖이면 «문은 지난» 것이다. */
function F() {
  const f = {};
  f.region = () => f;
  f.runWith = () => f;
  f.pubsub = { schedule: () => ({ timeZone: () => ({ onRun: (fn) => fn }) }) };
  f.https = { onRequest: (fn) => fn };
  return f;
}

function deps(roles) {
  return {
    functions: F(),
    MAIL_REGION: 'asia-northeast3',
    setCors: () => {},
    requireStaff: async () => ({ uid: 'U1' }),
    getDatabase: () => ({
      ref: (p) => ({
        once: async () => {
          /* uid_roles/U1 · uid_roles/U1/isAdmin 둘 다 이 자리로 온다 */
          const tail = String(p).split('/').slice(2).join('/');
          const v = tail ? (roles || {})[tail] : (roles || null);
          return { val: () => (v === undefined ? null : v) };
        },
      }),
    }),
  };
}

async function call(fn, body) {
  const out = {};
  const res = {
    status(c) { out.code = c; return res; },
    json(b) { out.body = b; return res; },
    send() { return res; },
  };
  await fn({ method: 'POST', headers: {}, body: body || {} }, res);
  return out;
}

const STAFF = { sid: 'P-003', status: 'active', isAdmin: false };
const BOSS = { sid: 'P-001', status: 'active', isAdmin: true };

/* ── 문 ─────────────────────────────────────────────────────────────────── */

test('★ 재직 중인 직원은 메일을 볼 수 있다 — 예전에는 여기서 403 이었다', async () => {
  const api = build(deps(STAFF));
  const r = await call(api.readMailMessage, {});
  assert.notEqual(r.code, 403,
    '★ 직원이 막혔습니다 — 대표 지시 「전 직원에게 다 열기」와 어긋납니다: '
    + JSON.stringify(r.body));
  assert.equal(r.code, 400, '문은 지났어야 합니다(몸통이 400 으로 답한다)');
});

test('★ 사번이 없는 계정은 못 본다 — 「로그인한 사람」이 아니라 「직원」이다', async () => {
  /* requireStaff 는 비밀번호 로그인만 본다. 회사 계정이 아니어도 통과한다 —
     그래서 여기서 한 번 더 따진다. 이 검사가 그 두 번째 자물쇠를 지킨다. */
  const api = build(deps({ status: 'active' }));
  const r = await call(api.readMailMessage, {});
  assert.equal(r.code, 403, '★ 사번 없는 계정이 회사 메일함에 들어왔습니다');
});

test('★ 재직 중이 아니면 못 본다', async () => {
  const api = build(deps({ sid: 'P-006', status: 'left' }));
  const r = await call(api.readMailMessage, {});
  assert.equal(r.code, 403, '★ 재직자가 아닌 계정이 회사 메일함에 들어왔습니다');
});

test('uid_roles 에 아예 없는 계정은 못 본다', async () => {
  const api = build(deps(null));
  const r = await call(api.readMailMessage, {});
  assert.equal(r.code, 403);
});

test('★ 목록 받아오기·읽음 표시·옮기기도 직원에게 열려 있다 — 한 창구만 열면 반쪽이다', async () => {
  const api = build(deps(STAFF));
  for (const name of ['flagMailMessages', 'moveMailMessages', 'readMailAttachment']) {
    const r = await call(api[name], {});
    assert.notEqual(r.code, 403, '★ ' + name + ' 이 직원을 막습니다: ' + JSON.stringify(r.body));
  }
});

/* ── 하나만 대표 몫으로 남긴 것 ──────────────────────────────────────────── */

test('★ 다음메일 «폴더 자체»를 만들고 지우는 것은 대표님만', async () => {
  /* 한 사람이 폴더를 지우면 열 사람 화면이 함께 바뀌고 그 안의 메일이 휴지통으로 간다.
     보고·읽음 표시하고·옮기는 것과는 무게가 다르다. */
  const no = await call(build(deps(STAFF)).manageMailFolder, { act: 'delete', slug: 'x' });
  assert.equal(no.code, 403, '★ 직원이 다음메일 폴더를 지울 수 있습니다');
  const yes = await call(build(deps(BOSS)).manageMailFolder, { act: '없는짓' });
  assert.notEqual(yes.code, 403, '대표님이 막혔습니다: ' + JSON.stringify(yes.body));
});

test('★ 폴더 창구도 «직원인지»를 먼저 본다 — 관리자 표만 보면 사번 없는 계정이 샌다', async () => {
  const r = await call(build(deps({ isAdmin: true })).manageMailFolder, { act: 'delete' });
  assert.equal(r.code, 403, '★ 사번 없는 계정에 isAdmin 만 붙으면 폴더를 지울 수 있습니다');
});

test('아무도 쓰지 못한다 — mailbox 는 서버만 적는다', () => {
  const rules = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'docs', 'firebase-rules-전체-적용본.json'), 'utf8'));
  assert.equal(rules.rules.mailbox['.write'], false,
    '★ mailbox 에 쓰기가 열렸습니다 — 앱이 메일 목록을 직접 고치게 됩니다');
});

/* ── 두 문이 «같은 뜻»인가 ───────────────────────────────────────────────── */

test('★ 콘솔 규칙과 서버 함수가 같은 것을 본다 — 한쪽만 열면 반쪽만 보인다', () => {
  const rules = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'docs', 'firebase-rules-전체-적용본.json'), 'utf8'));
  const r = String(rules.rules.mailbox['.read']);
  assert.match(r, /uid_roles/, '규칙이 uid_roles 를 안 봅니다');
  assert.match(r, /'sid'/, '★ 규칙이 «사번»을 안 봅니다 — 서버는 봅니다');
  assert.match(r, /'status'/, '★ 규칙이 «재직 여부»를 안 봅니다 — 서버는 봅니다');
  assert.match(r, /'active'/, '★ 규칙의 재직 표시가 서버와 다릅니다');
  assert.doesNotMatch(r, /isAdmin/,
    '★ 규칙이 아직 총괄관리자만 봅니다 — 직원 화면이 통째로 빕니다(2026-08-27 그 증상)');

  const src = fs.readFileSync(path.join(ROOT, 'functions', 'mail-sync.js'), 'utf8');
  assert.match(src, /v\.sid/, '서버가 사번을 안 봅니다');
  assert.match(src, /v\.status !== 'active'/, '서버가 재직 여부를 안 봅니다');
});

test('★ 규칙은 «콘솔»에 붙여넣어야 한다 — 그 안내가 저장소에 남아 있다', () => {
  /* 이 저장소의 규칙 파일을 배포하면 사진첩·성과확인이 막힌다(과거 사고).
     코드만 고치고 콘솔을 안 고치면 이 작업은 «아무것도 안 한 것»이 된다. */
  const doc = path.join(ROOT, 'docs', '메일함-직원공개-콘솔붙여넣기.md');
  assert.ok(fs.existsSync(doc), '★ 콘솔에 붙여넣을 안내 문서가 없습니다');
  const t = fs.readFileSync(doc, 'utf8');
  assert.match(t, /콘솔/, '콘솔에 붙여넣으라는 말이 없습니다');
  assert.match(t, /sid/, '붙여넣을 규칙 원문이 없습니다');
});

/* ── 화면 ────────────────────────────────────────────────────────────────── */

test('★ 폴더 만들기·지우기는 화면에서도 미리 막고 «말을 해 준다»', () => {
  /* 안 막으면 눌렀다가 한참 뒤에 붉은 403 만 뜬다. 서버 쪽이 진짜 자물쇠고 이건 안내다. */
  const cards = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');
  const i = cards.indexOf('function mbFolderDo(');
  assert.ok(i > 0, 'mbFolderDo 가 없습니다');
  /* 함수 «끝»까지 본다 — 글자 수로 창을 잘라 두면 함수가 자라는 날 조용히 반만 본다 */
  const j = cards.indexOf('\nfunction ', i + 1);
  const body = cards.slice(i, j > 0 ? j : i + 2000);
  assert.match(body, /state\.isAdmin/, '★ 화면이 직원을 그냥 통과시킵니다');
  assert.match(body, /대표님만/, '★ 왜 안 되는지 말해 주지 않습니다');
});
