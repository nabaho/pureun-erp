/* 삭제 권한 규칙을 진짜 Firebase 규칙 엔진에 물어보는 검사.
   ─────────────────────────────────────────────────────────────────────────
   다른 tests/*.test.js 와 달리 에뮬레이터가 필요해서 `node --test` 에 섞지 않는다.
   (파일 이름을 .test.js 로 두면 평소 전체 검사가 에뮬레이터 없이 돌다가 죽는다)

   실행 방법
     1) 준비 — 한 번만
        npm i -g firebase-tools     (java 필요)
     2) 규칙을 담은 임시 폴더를 만들고 에뮬레이터를 띄운다
        mkdir -p /tmp/rulestest && cd /tmp/rulestest
        cp "<저장소>/docs/firebase-rules-전체-적용본.json" rules.json
        printf '{"database":{"rules":"rules.json"},"emulators":{"database":{"port":9000,"host":"127.0.0.1"},"ui":{"enabled":false}}}' > firebase.json
        firebase emulators:start --only database --project pureun-erp
     3) 다른 창에서
        node <저장소>/tests/firebase-rules-delete-permission.emulator.mjs

   ⚠ 빠지기 쉬운 함정 두 가지 (둘 다 "전부 통과"라는 가짜 성공을 만든다)
     · 네임스페이스는 반드시 <프로젝트>-default-rtdb 여야 한다. 다른 이름으로 부르면
       에뮬레이터가 규칙 없는 새 DB를 만들어 무엇이든 통과시킨다.
     · 사용자 토큰은 ?auth=<JWT> 로 보낸다. Authorization: Bearer 는 관리자 자격으로
       해석되어 규칙을 아예 타지 않는다(자료를 심을 때만 쓴다). */

const BASE = 'http://127.0.0.1:9000';
const NS = 'pureun-erp-default-rtdb';
const OWNER = '__owner__';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function tok(uid, email) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'none', typ: 'JWT' }),
    b64({
      sub: uid, user_id: uid, email, email_verified: true,
      iat: now, exp: now + 3600, aud: 'pureun-erp',
      iss: 'https://securetoken.google.com/pureun-erp',
      firebase: { sign_in_provider: 'password', identities: { email: [email] } },
    }),
    '',
  ].join('.');
}
const ADMIN = tok('U_ADMIN', 'admin@pureun.kr');
const STAFF = tok('U_STAFF', 'staff@pureun.kr');

async function call(method, path, auth, body) {
  const isOwner = auth === OWNER;
  const url = `${BASE}/${path}.json?ns=${NS}` + (isOwner ? '' : `&auth=${auth}`);
  const headers = {};
  if (isOwner) headers.Authorization = 'Bearer owner';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r.status;
}
const ok = (s) => s >= 200 && s < 300;

let pass = 0, fail = 0;
async function expect(label, method, path, auth, body, want) {
  const s = await call(method, path, auth, body);
  const got = ok(s) ? '허용' : '거부';
  const good = got === want;
  good ? pass++ : fail++;
  console.log(`  ${good ? '✓' : '✗'} ${label.padEnd(46)} 기대=${want} 실제=${got} (${s})`);
}

async function seed() {
  await call('PUT', 'uid_roles/U_ADMIN', OWNER, { isAdmin: true, sid: 'admin', status: 'active' });
  await call('PUT', 'uid_roles/U_STAFF', OWNER, { isAdmin: false, sid: 'staff', status: 'active' });
  await call('PUT', 'pucards', OWNER, {
    items: { BIZ1: { C1: { n: 'a' }, C2: { n: 'b' } }, BIZ2: { C1: { n: 'c' } } },
    idx: { C1: 1, C2: 2 },
  });
  await call('PUT', 'work_erp', OWNER, { items: { W1: { t: 'x' } } });
  await call('PUT', 'kcareer', OWNER, { U_STAFF: { doc: 1 }, U_OTHER: { doc: 2 } });
}

// 아무 자격 없이 읽어서 통과하면 규칙이 안 걸린 것 — 그대로 두면 전부 통과하는 가짜 성공이 난다
const guard = await fetch(`${BASE}/pucards.json?ns=${NS}`).then((r) => r.status);
if (ok(guard)) {
  console.error('\n  규칙이 적용되지 않았습니다. 네임스페이스가 ' + NS + ' 인지 확인하세요.\n');
  process.exit(2);
}

console.log('\n── 직원(일반 계정) ──');
await seed();
await expect('레코드 추가  pucards/items/BIZ1/C3', 'PUT', 'pucards/items/BIZ1/C3', STAFF, { n: 'd' }, '허용');
await expect('레코드 삭제  pucards/items/BIZ1/C3', 'DELETE', 'pucards/items/BIZ1/C3', STAFF, undefined, '허용');
await expect('색인 통째 set  pucards/idx', 'PUT', 'pucards/idx', STAFF, { C1: 1 }, '허용');
await expect('한 회사 통째 삭제  pucards/items/BIZ2', 'DELETE', 'pucards/items/BIZ2', STAFF, undefined, '허용');
await expect('★ 섹션 통째 삭제  pucards/items', 'DELETE', 'pucards/items', STAFF, undefined, '거부');
await expect('★ 노드 통째 삭제  pucards', 'DELETE', 'pucards', STAFF, undefined, '거부');
await expect('★ 노드 통째 교체  pucards', 'PUT', 'pucards', STAFF, { x: 1 }, '거부');
await expect('업무관리 레코드 삭제  work_erp/items/W1', 'DELETE', 'work_erp/items/W1', STAFF, undefined, '허용');
await expect('★ 업무관리 노드 삭제  work_erp', 'DELETE', 'work_erp', STAFF, undefined, '거부');

console.log('\n── 관리자 (정리·복구는 계속 가능해야 한다) ──');
await seed();
await expect('섹션 통째 삭제  pucards/items', 'DELETE', 'pucards/items', ADMIN, undefined, '허용');
await expect('노드 통째 삭제  pucards', 'DELETE', 'pucards', ADMIN, undefined, '허용');
await expect('백업 복구식 통째 쓰기  pucards', 'PUT', 'pucards', ADMIN, { items: {} }, '허용');

console.log('\n── 기존 소유자 검증 회귀 ──');
await seed();
await expect('내 이력서 쓰기  kcareer/U_STAFF', 'PUT', 'kcareer/U_STAFF/doc', STAFF, 9, '허용');
await expect('남의 이력서 읽기  kcareer/U_OTHER', 'GET', 'kcareer/U_OTHER', STAFF, undefined, '거부');
await expect('남의 이력서 삭제  kcareer/U_OTHER', 'DELETE', 'kcareer/U_OTHER', STAFF, undefined, '거부');

console.log(`\n  통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
