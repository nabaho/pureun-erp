/* 로그아웃·사람 바뀜을 모든 프로그램에 퍼뜨린다 (2026-08-16 대표 지시)
   대표 보고: "최기운으로 로그아웃하고 권형하로 다시 로그인했는데
              특정 프로그램에서는 여전히 최기운이 로그인된 상태로 남아 있었다."
   ★ 남의 계정으로 남의 자료를 보게 되는 일이라 «권한» 문제다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'pu-authsync.js'), 'utf8');

/* 브라우저를 흉내 내어 «실제로 돌려» 본다 */
function boot(opts) {
  opts = opts || {};
  const store = { local: {}, session: Object.assign({}, opts.session || {}) };
  Object.assign(store.local, opts.local || {});
  const timers = [];
  let authCb = null;
  const g = {
    PU_AUTHSYNC_GRACE_MS: 0,
    firebase: {
      auth: function () {
        return {
          currentUser: g._user || null,
          onAuthStateChanged: function (cb) { authCb = cb; }
        };
      }
    },
    localStorage: {
      getItem: (k) => (k in store.local ? store.local[k] : null),
      setItem: (k, v) => { store.local[k] = String(v); },
      removeItem: (k) => { delete store.local[k]; }
    },
    sessionStorage: {
      getItem: (k) => (k in store.session ? store.session[k] : null),
      setItem: (k, v) => { store.session[k] = String(v); },
      removeItem: (k) => { delete store.session[k]; }
    },
    document: { createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } },
    location: { replace: (u) => { g._went = u; }, reload: () => { g._went = 'reload'; } },
    addEventListener: (n, fn) => { if (n === 'storage') g._storage = fn; },
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    Date: Date, String: String, Object: Object, console
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(SRC, g);
  g._flush = function () { while (timers.length) { const f = timers.shift(); try { f(); } catch (e) {} } };
  g._setUser = function (uid, anon) { g._user = uid ? { uid: uid, isAnonymous: !!anon } : null; };
  g._fire = function (uid, anon) { g._setUser(uid, anon); g.PuAuthSync._onAuth(g._user); };
  g._store = store;
  return g;
}

test('로그아웃하면 끊고 포털로 보낸다', () => {
  const g = boot({ local: { pu_auth_uid: 'UID-최기운' } });
  g._fire(null);
  g._flush();
  assert.strictEqual(g.PuAuthSync._wasKicked(), true, '로그아웃인데 안 끊었다');
  g._flush();
  assert.ok(/enter\.html/.test(g._went || ''), '포털로 안 보냈다: ' + g._went);
});

test('다른 사람으로 바뀌면 끊는다', () => {
  /* ★ 이번 사고의 그 장면이다 — 최기운 화면이 권형하 로그인 뒤에도 살아 있었다 */
  const g = boot({ local: { pu_auth_uid: 'UID-최기운' } });
  g._fire('UID-권형하');
  assert.strictEqual(g.PuAuthSync._wasKicked(), true, '사람이 바뀌었는데 안 끊었다');
});

test('같은 사람이면 안 끊는다', () => {
  const g = boot({ local: { pu_auth_uid: 'UID-권형하' } });
  g._fire('UID-권형하');
  g._flush();
  assert.strictEqual(g.PuAuthSync._wasKicked(), false, '멀쩡한 세션을 끊었다');
});

test('처음 로그인은 안 끊는다', () => {
  /* 적어 둔 사람이 없으면 「바뀐 것」이 아니라 「처음」이다 */
  const g = boot({});
  g._fire('UID-권형하');
  g._flush();
  assert.strictEqual(g.PuAuthSync._wasKicked(), false);
  assert.strictEqual(g._store.local.pu_auth_uid, 'UID-권형하', '누구인지 적어 두지 않았다');
});

test('부팅 직후 잠깐 「없음」으로 와도 안 끊는다', () => {
  /* ★ 이걸 안 지키면 열자마자 로그인 화면으로 튕긴다 — 고치려다 더 나빠진다 */
  const g = boot({ local: { pu_auth_uid: 'UID-권형하' } });
  g.PuAuthSync._onAuth(null);   // 아직 복원 중
  g._setUser('UID-권형하');      // 그새 돌아왔다
  g._flush();
  assert.strictEqual(g.PuAuthSync._wasKicked(), false, '부팅 중인데 튕겼다');
});

test('로그인한 적 없는 화면은 그냥 둔다', () => {
  /* 적어 둔 사람이 없는데 「없음」이 와도 끊을 것이 없다 */
  const g = boot({});
  g._fire(null);
  g._flush();
  assert.strictEqual(g.PuAuthSync._wasKicked(), false);
});

test('푸른이알피의 자체 세션·자동로그인 열쇠를 함께 지운다', () => {
  /* ★ 여기가 뿌리다. 파이어베이스만 끊고 이걸 두면 그 탭은 계속 앞사람이고,
     자동로그인 열쇠가 남아 새로 열어도 다시 앞사람으로 들어간다. */
  const g = boot({
    local: { pu_auth_uid: 'UID-최기운', pureun_v6_autologin_sid: 'P009' },
    session: { pureun_v6_session_sid: 'P009' }
  });
  g._fire(null);
  g._flush();
  assert.strictEqual(g._store.session.pureun_v6_session_sid, undefined, '자체 세션이 남았다');
  assert.strictEqual(g._store.local.pureun_v6_autologin_sid, undefined, '자동로그인 열쇠가 남았다');
});

test('익명 로그인은 「다른 사람」이 아니다', () => {
  /* ★ 정부사업일정은 아무도 없으면 스스로 익명 로그인을 한다.
     그걸 사람으로 보면, 로그아웃한 사람이 그 앱을 열 때마다 엉뚱하게 튕기고
     다시 들어와도 또 튕기는 «되돌이» 가 된다. 익명은 「없음」과 같게 본다. */
  const g = boot({ local: { pu_auth_uid: 'UID-권형하' } });
  g._fire('UID-익명', true);
  assert.strictEqual(g.PuAuthSync._wasKicked(), false, '익명을 사람으로 보고 곧바로 튕겼다');
  g._flush();
  // 익명은 「없음」이므로, 로그인해 있던 화면이었다면 «로그아웃» 으로 본다
  assert.strictEqual(g.PuAuthSync._wasKicked(), true, '익명뿐인데 앞사람 화면을 그대로 뒀다');
});

test('익명만 쓰던 화면은 그냥 둔다', () => {
  /* 적어 둔 사람이 없으면 끊을 것도 없다 — 공개 화면이 튕기면 안 된다 */
  const g = boot({});
  g._fire('UID-익명', true);
  g._flush();
  assert.strictEqual(g.PuAuthSync._wasKicked(), false);
  assert.strictEqual(g._store.local.pu_auth_uid, undefined, '익명 uid 를 사람으로 적어 두었다');
});

test('다른 탭이 바꾼 것도 안다', () => {
  const g = boot({ local: { pu_auth_uid: 'UID-최기운' } });
  g._setUser('UID-최기운');
  g.PuAuthSync._onStorage({ key: 'pu_auth_uid', newValue: 'UID-권형하' });
  assert.strictEqual(g.PuAuthSync._wasKicked(), true, '옆 탭에서 사람이 바뀐 것을 못 봤다');
});

test('상관없는 열쇠에는 반응하지 않는다', () => {
  const g = boot({ local: { pu_auth_uid: 'UID-권형하' } });
  g._setUser('UID-권형하');
  g.PuAuthSync._onStorage({ key: '아무거나', newValue: 'x' });
  g._flush();
  assert.strictEqual(g.PuAuthSync._wasKicked(), false);
});

test('두 번 끊지 않는다', () => {
  /* 파이어베이스 신호와 옆 탭 신호가 겹쳐 와도 화면은 한 번만 넘어가야 한다 */
  const g = boot({ local: { pu_auth_uid: 'UID-최기운' } });
  assert.strictEqual(g.PuAuthSync._kick('signedout'), true);
  assert.strictEqual(g.PuAuthSync._kick('signedout'), false);
});

/* ── 어느 화면에 싣고 어느 화면에 안 싣는가 ── */
const NEEDS = ['pu-erp.html', 'pu-cards.html', 'pu-photos.html', 'pu-paydata.html', 'fund.html',
  'work.html', 'kcareer.html', 'rules.html', 'gov-consulting.html', 'payroll-os.html'];
const MUSTNOT = ['enter.html', 'sign.html', 'ieum-view.html'];

test('로그인이 필요한 프로그램에는 모두 실려 있다', () => {
  /* 한 곳이라도 빠뜨리면 그 프로그램만 앞사람으로 남는다 — 이번 사고가 딱 그것이다 */
  const missing = NEEDS.filter(function (f) {
    return !/pu-authsync\.js/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  });
  assert.deepStrictEqual(missing, [], '안 실린 프로그램: ' + missing.join(', '));
});

test('로그인 화면과 공개 화면에는 싣지 않는다', () => {
  /* ★ 로그인 화면에서 끊으면 로그인 자체를 못 하고,
     공개 화면(전자서명·공유보기)에서 끊으면 로그인 없이 보는 사람을 쫓아낸다 */
  const wrong = MUSTNOT.filter(function (f) {
    return /pu-authsync\.js/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  });
  assert.deepStrictEqual(wrong, [], '실리면 안 되는데 실린 화면: ' + wrong.join(', '));
});
