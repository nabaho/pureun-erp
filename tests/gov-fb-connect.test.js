'use strict';
/* ══════ 로그인해도 «연결이 안 되던» 자리 ══════
   실행: node --test tests/*.test.js

   ■ 무엇이 문제였나 (대표 보고 2026-08-30
     「컨설팅일정을 다른 직원들이 로그인할 경우 가끔씩 연결이 안 되는 경우가 있다」)

     보안 규칙은 «비밀번호(또는 지문)로 로그인한 사람»만 들여보낸다 —
        auth != null && (sign_in_provider === 'password' || passkey === true)
     그런데 앱은 아무도 없으면 signInAnonymously() 로 «익명» 로그인을 했다.
     익명 사용자는 scal_* 를 하나도 못 읽는다. 그런데도 코드는
       ① 익명도 FB_READY 로 쳐서  ② 🟢 「클라우드 연결이 정상입니다」를 띄우고
       ③ 그 자격으로 구독을 걸었다 — 규칙에 막혀 «조용히» 끊겼다
          (on('value', cb) 에 끊김 콜백이 없어 아무도 몰랐다)
       ④ 뒤이어 진짜 로그인해도 FB_READY 가 이미 true 라 «다시 걸지 않았다».
     그래서 새로고침하기 전까지 자료가 영영 안 왔다.

     ★ 「가끔」인 까닭 — 자동로그인이 켜져 있거나 포털을 거쳐 오면 처음부터
       진짜 사용자라 익명 단계가 없다. 새 PC·새 브라우저·자동로그인 안 켠 사람이
       «처음 로그인»할 때만 걸린다. 대표는 자동로그인이라 늘 멀쩡했다.

   ★ 여기서 못 박는 것
     · 익명은 «연결됨»이 아니다 (규칙이 아무것도 안 열어 준다)
     · 익명 뒤에 진짜 로그인하면 «그때» 구독한다
     · 다시 걸기 전에 먼저 걷는다 (안 그러면 두 번 받아 요금이 두 배)
     · 구독이 막히면 «말한다» — 조용히 끊기지 않는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

function fnSrc(name) {
  const m = new RegExp('(?:^|\\n)((?:async )?function ' + name + '\\s*\\()').exec(SRC);
  assert.ok(m, '함수를 찾을 수 없습니다: ' + name);
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  let i = SRC.indexOf('{', start), d = 0, k = i;
  while (k < SRC.length) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) break; }
    k++;
  }
  return SRC.slice(start, k + 1);
}

/* 가짜 파이어베이스 — 진짜 fbInit 을 그대로 태운다 */
function world(denyReads) {
  const log = { subs: [], offs: [], anon: 0, status: [], save: [] };
  let authCb = null;
  const denied = () => { const e = new Error('permission_denied at /scal_scheds'); e.code = 'PERMISSION_DENIED'; return e; };

  function makeQuery(pathName) {
    const q = {
      _path: pathName,
      on(ev, cb, cancel) { log.subs.push({ path: pathName, cancel: !!cancel }); return cb; },
      off(ev) { log.offs.push(pathName); },
      once() { return Promise.resolve({ val: () => ({}), exists: () => false }); },
      get() {
        if (denyReads) return Promise.reject(denied());
        return Promise.resolve({ val: () => ({}), exists: () => false });
      },
      limitToLast() { return makeQuery(pathName); },
    };
    return q;
  }

  const box = {
    console: { warn() { }, log() { }, error() { } },
    firebase: {
      initializeApp() { },
      database: () => ({ ref: p => makeQuery(p) }),
      auth: () => ({
        onAuthStateChanged(cb) { authCb = cb; },
        signInAnonymously() { log.anon++; return Promise.resolve(); },
      }),
    },
    FB_CONFIG: {},
    FB_NODES: { p_staff: 'scal_staff', p_scheds: 'scal_scheds' },
    PHOTO_LOG_NODE: 'scal_photoLog',
    PHOTO_LOG_KEEP: 600,
    ERP_COLOR_NODE: 'data/staff_colors',
    FB_READY: false,
    _fbDB: null,
    _savePending: 0,
    _photoLog: [], _roundLog: [], _erpColors: {},
    _chgTab: 'photo',
    /* ⚠ 흉내가 아니라 «진짜»를 태운다 — 아래에서 덮어쓴다 */
    fbSyncDown: null,
    _syncMark() { log.subs.push({ path: '(내려받기)', cancel: true }); },
    publishTypeColors() { },
    updateFbStatus(i) { log.status.push(i); },
    setSaveState(kind, text, title) { log.save.push({ kind, text, title }); },
    getSession: () => ({ id: 'a1', name: '권형하' }),
    _fetchRoster: () => Promise.resolve([]),
    getStaff: () => [],
    setSession() { }, lsSet() { }, closeModal() { }, applySession() { },
    renderSummaryBar() { }, renderDash() { }, renderCal() { }, renderNotifBadge() { },
    renderPhotoLog() { }, renderRoundLog() { },
    q: () => null,
    localStorage: { getItem: () => null, setItem() { } },
    JSON, Object, Array, String, Number, Promise, Date, window: {},
  };
  vm.createContext(box);
  const NAMES = ['fbInit', 'fbSyncDown', 'fbSubscribe', 'subscribeRoundLog', 'subscribePhotoLog', 'subscribeErpColors'];
  /* 아직 없는 함수는 건너뛴다 — 고치기 «전»에도 이 검사가 돌아가야 한다(그래야 재현이 된다) */
  const extra = ['fbUnsubscribeAll', 'fbUsable', '_fbOn', '_isDeniedErr'].filter(n =>
    new RegExp('function ' + n + '\\s*\\(').test(SRC));
  /* ⚠ 칸 이름표는 «진짜 것»을 쓴다 — 흉내 내면 사람 말로 안 바뀌는 것을 못 잡는다 */
  const nodeKo = (SRC.match(/const _NODE_KO=\{[\s\S]*?\};/) || ['const _NODE_KO={};'])[0];
  vm.runInContext(nodeKo + '\n' + NAMES.concat(extra).map(fnSrc).join('\n')
    + '\nvar _fbSubs = [];\nvar _fbAuthUid = "";', box);
  const realSync = box.fbSyncDown;
  box.fbSyncDown = function () { box._syncMark(); return realSync.apply(null, arguments); };
  box.fbInit();
  return { box, log, fire: u => authCb && authCb(u) };
}

const ANON = { uid: 'anon1', isAnonymous: true };
const REAL = { uid: 'u1', isAnonymous: false, email: 'p001@pureun.kr' };

test('★ 익명은 «연결됨»이 아니다 — 규칙이 아무것도 안 열어 준다', () => {
  const w = world();
  w.fire(null);
  assert.equal(w.log.anon, 1, '아무도 없으면 익명으로 들어간다');
  w.fire(ANON);
  assert.equal(w.box.FB_READY, false,
    '★ 익명인데 «연결됨»으로 쳤습니다 — 규칙상 scal_* 를 하나도 못 읽습니다');
  assert.ok(!w.log.status.includes('🟢'),
    '★ 익명인데 🟢 를 띄웠습니다 — 「연결이 정상」이라는 거짓말이 됩니다');
});

test('★★ 익명 뒤에 «진짜 로그인»하면 그때 구독한다 — 이것이 대표가 겪은 고장이다', () => {
  const w = world();
  w.fire(null);
  w.fire(ANON);
  const before = w.log.subs.length;
  w.fire(REAL);
  assert.equal(w.box.FB_READY, true, '★ 진짜 로그인인데 연결로 안 칩니다');
  assert.ok(w.log.subs.length > before,
    '★ 로그인해도 구독을 다시 안 겁니다 — 새로고침 전까지 자료가 영영 안 옵니다');
  const paths = w.log.subs.map(s => s.path).join(' ');
  assert.match(paths, /scal_scheds/, '★ 일정 구독이 없습니다');
  assert.match(paths, /내려받기/, '★ 처음 한 번 내려받기를 안 합니다');
});

test('★ 사람이 «바뀌면» 먼저 걷고 다시 건다 — 안 걷으면 두 번 받아 요금이 두 배', () => {
  /* ⚠ 익명일 때는 아예 구독을 안 걸므로 걷을 것도 없다(그것이 고침의 핵심이다).
     진짜 위험한 자리는 «한 화면에서 사람이 바뀔 때»다 —
     로그아웃하고 다른 직원이 로그인하면, 앞사람 구독을 걷지 않으면 두 벌이 된다. */
  const w = world();
  w.fire(null); w.fire(ANON); w.fire(REAL);
  const n = w.log.subs.length;
  assert.ok(n > 0, '첫 사람 구독이 없습니다');
  const OTHER = { uid: 'u2', isAnonymous: false, email: 'p002@pureun.kr' };
  w.fire(OTHER);
  assert.ok(w.log.offs.length > 0,
    '★ 앞사람 구독을 안 걷었습니다 — 같은 자료를 두 벌 받습니다');
  assert.ok(w.log.subs.length > n, '★ 바뀐 사람으로 다시 안 걸었습니다');
});

test('★ 로그아웃하면 걸어 둔 구독을 «걷는다» — 남의 자료가 계속 흘러들면 안 된다', () => {
  const w = world();
  w.fire(null); w.fire(ANON); w.fire(REAL);
  const before = w.log.offs.length;
  w.fire(null);
  assert.ok(w.log.offs.length > before,
    '★ 로그아웃했는데 구독이 살아 있습니다');
});

test('같은 사람이 다시 알려 와도 «두 번» 걸지 않는다', () => {
  const w = world();
  w.fire(null); w.fire(ANON); w.fire(REAL);
  const n = w.log.subs.length;
  w.fire(REAL);                       // 토큰 새로고침 등으로 또 불릴 수 있다
  assert.equal(w.log.subs.length, n, '★ 같은 사람인데 또 구독했습니다');
});

test('★ 구독이 막히면 «말한다» — 조용히 끊기면 아무도 모른다', () => {
  const w = world();
  w.fire(null); w.fire(ANON); w.fire(REAL);
  const real = w.log.subs.filter(s => s.path !== '(내려받기)');
  assert.ok(real.length > 0, '구독이 하나도 없습니다');
  real.forEach(s => {
    assert.ok(s.cancel,
      '★ ' + s.path + ' 구독에 «끊김 콜백»이 없습니다 — 권한에 막혀도 아무도 모릅니다');
  });
});

test('★ 로그아웃하면 «연결됨»을 거둔다 — 남의 자료가 남아 있으면 안 된다', () => {
  const w = world();
  w.fire(null); w.fire(ANON); w.fire(REAL);
  assert.equal(w.box.FB_READY, true);
  w.fire(null);
  assert.equal(w.box.FB_READY, false, '★ 로그아웃했는데 연결됨으로 남아 있습니다');
});

test('★ 내려받기가 «막히면» 화면에 말한다 — 콘솔에만 적으면 아무도 안 본다', async () => {
  /* 예전에는 catch 가 비어 있어, 권한에 막힌 것과 자료가 없는 것이 화면에서
     똑같아 보였다. ⚠ 「빈 catch 가 아닌가」만 보면 부족하다 — console.warn 만
     남겨도 통과한다. 실제로 막아 보고 «사람에게 보이는 자리»에 뜨는지 잰다. */
  const w = world(true);            // 모든 읽기를 권한 오류로
  w.box.FB_READY = true;
  await w.box.fbSyncDown();
  const said = w.log.save.map(s => (s.kind || '') + ' ' + (s.text || '') + ' ' + (s.title || '')).join(' | ');
  assert.match(said, /권한/, '★ 막혔는데 화면에 아무 말이 없습니다: ' + (said || '(빈칸)'));
  assert.ok(w.log.status.includes('🔒'),
    '★ 막혔는데 표시가 그대로입니다 — 「연결됨」으로 보입니다');
});

test('내려받기가 «되면» 괜한 경고를 띄우지 않는다', async () => {
  const w = world();
  w.box.FB_READY = true;
  await w.box.fbSyncDown();
  const said = w.log.save.map(s => s.text || '').join(' ');
  assert.doesNotMatch(said, /권한|실패/, '★ 멀쩡한데 경고를 띄웁니다: ' + said);
});
