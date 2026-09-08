/* 마지막 본 화면 — 다시 들어오면 그 자리로 (대표 지시 2026-08-10)
   "로그아웃 또는 다른 화면을 보다가 다시 명함·메일로 들어오면 마지막 들어왔던
    화면으로 기록해서 들어오게 해달라. 그리고 로그인 하는 사람마다 다를 텐데
    그 사람마다 각자 마지막 본 화면으로 보게 해라."

   ⚠ 이 기능에서 가장 위험한 것은 **남의 화면이 열리는 것**이다.
     한 PC를 여러 사람이 쓴다 — 열쇠에 계정이 안 들어가면 앞사람이 보던 화면이
     뒷사람에게 열리고, 그것이 「보낸 메일」이면 남의 일까지 보인다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');   // 함수를 «통째로» 자른다(줄 수에 안 매인다)

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');

/* 중괄호 짝을 세어 자른다 — 한 줄이든 여러 줄이든 똑같이 먹는다.
   예전에는 「한 줄꼴을 먼저 본다」는 규칙을 두 곳에 베껴 두었는데, 그 규칙은
   함수가 «몇 줄로 쓰였는지»를 검사가 알고 있어야 한다는 뜻이라 늘 깨졌다. */
function fn(name) { return sliceFn(app, 'function ' + name + '('); }

/* 진짜로 돌려 본다 — 적고, 사람이 바뀌고, 다시 읽는 흐름 전체 */
function boot(who) {
  const store = {};
  const opened = [];
  const ctx = {
    JSON, Object,
    myUid: who || '', myEmail: '',
    /* 「푸른 메일」 아이콘으로 들어오면 주소가 첫 화면을 정한다 — 여기서는 보통 주소다 */
    location: { search: '' },
    state: { view: 'list', tab: 'card', mailSent: false },
    /* 쓰다 만 편지 — 「쓰기 화면을 기억할까」를 이것으로 가른다 (2026-08-30).
       null 이면 빈 창이라 기억하지 않는다. */
    _compose: null,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    __store: store,
    opened: opened,
    /* ⚠ this 를 쓰지 않는다 — 화면 코드가 openSentBox() 처럼 그냥 부르므로
       vm 안에서 this 가 없다(처음에 여기서 터졌다). */
    openMatPage() { opened.push('mat'); },
    openMailPage() { opened.push('mail'); },
    /* 2026-08-24: 메일 아이콘으로 들어오면 «받은메일함»이 열린다(예전엔 쓰기 화면).
       열리는 화면 이름은 그대로 'mail' 로 센다 — 이 검사가 보는 것은 «메일 창이
       열렸는가»이지, 그 안 어느 칸인가가 아니다. */
    openMailBox(id) { opened.push('box:' + (id || '')); },
    openSentBox() { opened.push('sent'); },
    openSchedBox() { opened.push('sched'); },
    /* 2026-09-05 — 업무관리에서 「이 사업장과 오간 것」으로 건너오는 길
       (?view=mail&mail=co&co=…). 저장된 마지막 화면(s.mail==='co')도 여기로 온다. */
    openCoThread(id) { opened.push('co:' + (id || '')); },
    /* 2026-09-08 — 기업정보함의 「🚪 퇴사한 담당 — 이어받기」 띠로 건너오는 길
       (?view=mail&mail=succ). 메일 창이 열렸는가만 보므로 여기서도 'mail' 로 센다. */
    openWhoPage(t) { opened.push('who:' + (t || '')); },
    switchTab(t) { opened.push('tab:' + t); }
  };
  vm.createContext(ctx);
  vm.runInContext(app.match(/const LASTV_PREFIX = [^\n]*/)[0], ctx);
  vm.runInContext("var _lastScreenSig = ''; var _lastScreenDone = false;", ctx);
  /* 2026-08-29 — 이메일을 눌러 열린 창이면 「받은메일함」이 아니라 그 사람에게 쓰기다.
     그것을 가르는 mailToFromUrl 이 restoreLastScreen 안에서 돌므로 함께 실어 준다. */
  ctx.URLSearchParams = URLSearchParams;
  ctx.String = String;
  /* MAIL_WHO_TABS 는 최상위 const 라 컨텍스트 값이 되지 않는다 — var 로 바꿔 싣는다 */
  vm.runInContext("var MAIL_WHO_TABS = ['succ','addr','end','notco'];", ctx);
  ['lastScreenKey', 'mailToFromUrl', 'mailCoFromUrl', 'mailWhoFromUrl', 'urlWantsMail', 'composeTouched', 'saveLastScreen', 'restoreLastScreen']
    .forEach(n => vm.runInContext(fn(n), ctx));
  return ctx;
}

/* ── 사람마다 따로 (가장 중요) ── */
test('★ 사람마다 자기 화면만 기억한다 — 앞사람 화면이 열리면 안 된다', () => {
  const a = boot('uid-A');
  a.state.view = 'mail'; a.state.mailSent = true;   // 갑이 「보낸 메일」을 보고 나감
  a.saveLastScreen();

  /* 같은 PC 에 을이 로그인 — 갑의 자리를 그대로 물려받으면 안 된다 */
  const b = boot('uid-B');
  Object.keys(a.__store).forEach(k => { b.__store[k] = a.__store[k]; });
  b.restoreLastScreen();
  assert.deepEqual(Array.from(b.opened), [],
    '앞사람이 보던 화면이 뒷사람에게 열립니다: ' + JSON.stringify(b.opened));

  /* 갑이 다시 들어오면 제 화면으로 */
  const a2 = boot('uid-A');
  Object.keys(a.__store).forEach(k => { a2.__store[k] = a.__store[k]; });
  a2.restoreLastScreen();
  assert.deepEqual(Array.from(a2.opened), ['sent'], '자기 화면으로 안 돌아옵니다');
});

test('★ 누구인지 모르는 동안에는 적지 않는다', () => {
  /* 로그인 전에도 render 가 돈다 — 거기서 적으면 빈 계정 자리에 남아 샌다. */
  const c = boot('');
  c.state.view = 'mail'; c.state.mailSent = 'sched';
  c.saveLastScreen();
  assert.deepEqual(Object.keys(c.__store), [], '로그인 전에 화면을 적고 있습니다');
});

test('★ 로그인 전에 부른 것이 「다 했다」로 처리되면 안 된다', () => {
  /* 여기가 이 기능에서 가장 조용히 깨지는 자리다 — 로그인 전에 한 번 부르고
     「했다」고 표시해 버리면, 정작 로그인한 뒤에는 **영영 안 옮겨진다.**
     화면은 멀쩡해 보이고 기능만 죽는다. */
  const w = boot('uid-A');
  w.state.view = 'mat'; w.saveLastScreen();

  const r = boot('');                          // 아직 로그인 전
  Object.keys(w.__store).forEach(k => { r.__store[k] = w.__store[k]; });
  r.restoreLastScreen();
  assert.deepEqual(Array.from(r.opened), [], '로그인 전에 화면을 옮기고 있습니다');

  r.myUid = 'uid-A';                            // 이제 로그인됐다
  r.restoreLastScreen();
  assert.deepEqual(Array.from(r.opened), ['mat'],
    '로그인 전에 한 번 불렸다고 그 뒤로 영영 안 옮겨집니다');
});

test('★ 열쇠에 계정이 들어간다', () => {
  const a = boot('uid-A'), b = boot('uid-B');
  assert.notEqual(a.lastScreenKey(), b.lastScreenKey(), '두 사람이 같은 자리를 씁니다');
  assert.match(a.lastScreenKey(), /uid-A/);
});

/* ── 어느 화면이든 그 자리로 ── */
test('★ 화면마다 제자리로 돌아온다', () => {
  const cases = [
    [{ view: 'mat' }, 'mat'],
    /* 2026-08-30 — «빈» 쓰기 화면은 메일함으로 돌아온다(아래 전용 검사 참고).
       쓰다 만 편지가 있을 때만 쓰기로 돌아온다. */
    [{ view: 'mail', mailSent: true }, 'sent'],
    [{ view: 'mail', mailSent: 'sched' }, 'sched'],
    [{ view: 'list', tab: 'biz' }, 'tab:biz']
  ];
  cases.forEach(function (c) {
    const w = boot('uid-A');
    Object.assign(w.state, { view: 'list', tab: 'card', mailSent: false }, c[0]);
    w.saveLastScreen();
    const r = boot('uid-A');
    Object.keys(w.__store).forEach(k => { r.__store[k] = w.__store[k]; });
    r.restoreLastScreen();
    assert.deepEqual(Array.from(r.opened), [c[1]],
      JSON.stringify(c[0]) + ' 에서 나갔는데 ' + JSON.stringify(r.opened) + ' 으로 옵니다');
  });
});

test('★ 보던 자리와 같으면 화면을 흔들지 않는다', () => {
  /* 명함 목록에서 나갔다가 명함 목록으로 들어오는데 switchTab 을 부르면
     걸어 둔 조건·고른 것이 다 풀린다. */
  const w = boot('uid-A');
  w.saveLastScreen();                       // view:list, tab:card (기본 그대로)
  const r = boot('uid-A');
  Object.keys(w.__store).forEach(k => { r.__store[k] = w.__store[k]; });
  r.restoreLastScreen();
  assert.deepEqual(Array.from(r.opened), [], '같은 자리인데 화면을 다시 그립니다');
});

test('★ 처음 오신 분은 기본 화면 그대로', () => {
  const r = boot('uid-새사람');
  r.restoreLastScreen();
  assert.deepEqual(Array.from(r.opened), [], '적어 둔 것이 없는데 어딘가로 옮깁니다');
});

test('★ 두 번 부르지 않는다', () => {
  const w = boot('uid-A');
  w.state.view = 'mat'; w.saveLastScreen();
  const r = boot('uid-A');
  Object.keys(w.__store).forEach(k => { r.__store[k] = w.__store[k]; });
  r.restoreLastScreen();
  r.restoreLastScreen();
  assert.equal(r.opened.length, 1,
    '명함 목록이 새로 올 때마다 화면이 튕겨 나갑니다 — 일하다 말고 자꾸 옮겨집니다');
});

test('★ 망가진 값이 있어도 앱이 죽지 않는다', () => {
  const r = boot('uid-A');
  r.__store[r.lastScreenKey()] = '{{망가진 값';
  assert.doesNotThrow(() => r.restoreLastScreen());
  assert.deepEqual(Array.from(r.opened), []);
});

/* ── 붙어 있는 자리 ── */
test('★ 화면이 바뀔 때마다 적는다', () => {
  assert.match(app, /function render\(\)\{[^\n]*saveLastScreen\(\)/,
    'render 에서 안 적으면 어느 화면에서 나갔는지 모릅니다');
});

test('★ 명함이 도착한 뒤에 옮긴다', () => {
  /* 먼저 옮기면 빈 화면이 잠깐 보이고, 자료함·보낸 메일은 아직 읽히지도 않았다. */
  const i = app.indexOf("watchCardMap(this.db.ref(DB_ROOT+'/items')");
  assert.ok(i > 0, '명함 구독을 찾을 수 없습니다');
  assert.match(app.slice(i, i + 400), /restoreLastScreen\(\)/,
    '자료가 오기 전에 화면을 옮깁니다');
});

test('★ 이 기기에만 적는다 — 서버에 올리지 않는다', () => {
  /* 화면 취향은 자리마다 다르다. 서버에 두면 사무실 PC 에서 보던 것이 폰에서 열린다. */
  const s = fn('saveLastScreen');
  assert.match(s, /localStorage\.setItem/, '기기에 안 적습니다');
  assert.ok(!/firebase|database\(\)|\.ref\(/.test(s), '서버에 올리고 있습니다');
});

test('★ 바뀔 때만 적는다 (render 는 수시로 돈다)', () => {
  /* render 는 명함 하나 고칠 때마다도 돈다. 그때마다 저장소에 쓰면 헛일이다.
     ⚠ 겉모습(_lastScreenSig 라는 글자)만 보면 안 된다 — 견주는 줄을 지워도
        그 글자는 남아 통과한다. 실제로 몇 번 적었는지 센다. */
  const c = boot('uid-A');
  let writes = 0;
  const orig = c.localStorage.setItem;
  c.localStorage.setItem = function (k, v) { writes++; orig(k, v); };
  c.saveLastScreen();
  c.saveLastScreen();
  c.saveLastScreen();
  assert.equal(writes, 1, '안 바뀌었는데 ' + writes + '번 적었습니다');
  c.state.view = 'mat';
  c.saveLastScreen();
  assert.equal(writes, 2, '바뀌었는데 안 적었습니다');
});

/* ── 「푸른 메일」 아이콘으로 들어온 창 (대표 지시 2026-08-21) ── */
test('★ 주소가 메일이면 저장된 화면을 이긴다 — 아이콘을 눌렀는데 명함이 열리면 안 된다', () => {
  const c = boot('uid-A');
  c.state.view = 'co'; c.state.tab = 'biz';        // 마지막엔 기업 상세를 보고 있었다
  c.saveLastScreen();
  const back = boot('uid-A');
  back.__store[back.lastScreenKey()] = c.__store[c.lastScreenKey()];
  back.location.search = '?view=mail';             // 메일 아이콘으로 들어왔다
  back.restoreLastScreen();
  /* 2026-08-24: 메일 아이콘으로 들어오면 «받은메일함»이 열린다(예전엔 쓰기 화면).
     칸을 안 넘기면(box:'') mbNow() 가 받은메일함을 골라 준다. */
  assert.deepEqual(back.opened, ['box:'], '★ 메일 아이콘을 눌렀으면 메일함이 열려야 합니다.');
});

test('보통 주소로 들어오면 예전 그대로 — 마지막 보던 화면이 열린다', () => {
  const c = boot('uid-B');
  c.state.view = 'mail'; c.state.mailSent = true;
  c.saveLastScreen();
  const back = boot('uid-B');
  back.__store[back.lastScreenKey()] = c.__store[c.lastScreenKey()];
  back.restoreLastScreen();
  assert.deepEqual(back.opened, ['sent']);
});

/* ══════ 다음메일함 (2026-08-24) ══════ */

test('★ 메일함을 보다 나갔다 들어오면 «그 칸»으로 돌아온다 — 「보낸 메일」이 열리면 안 된다', () => {
  /* mailSent 가 'box' 인데 restoreLastScreen 의 "else if (s.mail)" 이 먼저 걸려
     보낸 메일이 열렸다. 값이 있으면 참이 되는 자리라, 갈래를 더할 때마다 이 함정이
     다시 생긴다 — 그래서 이 검사를 둔다. */
  const c = boot('uid-M');
  c.state.view = 'mail'; c.state.mailSent = 'box'; c.state.mbBox = 'INBOX-abc12345';
  c.saveLastScreen();
  const back = boot('uid-M');
  back.__store[back.lastScreenKey()] = c.__store[c.lastScreenKey()];
  back.restoreLastScreen();
  assert.deepEqual(back.opened, ['box:INBOX-abc12345'],
    '메일함이 아니라 딴 화면이 열립니다: ' + JSON.stringify(back.opened));
});

/* ══════ 「누른 것도 아닌데 자꾸 메일 쓰기 창이 열린다」 (대표 2026-08-30) ══════
   Ctrl+C(복사)가 「C = 새 메일」 단축키에 걸려 빈 편지창이 열렸다. 그 창이
   「마지막 본 화면」으로 적혀, 그 뒤로는 «들어올 때마다» 편지 쓰기가 열렸다.
   단축키는 mail-ctrl-key.test.js 가, 기억하는 자리는 여기가 지킨다. */

test('★ «빈» 쓰기 화면은 기억하지 않는다 — 한 번 잘못 열린 창이 영영 따라오면 안 된다', () => {
  const c = boot('uid-N');
  c.state.view = 'mail'; c.state.mailSent = false;   // 빈 편지창 (_compose 는 null)
  c.state.mbBox = 'INBOX-abc12345';                  // 그 전에 보던 칸
  c.saveLastScreen();
  const back = boot('uid-N');
  back.__store[back.lastScreenKey()] = c.__store[c.lastScreenKey()];
  back.restoreLastScreen();
  assert.deepEqual(back.opened, ['box:INBOX-abc12345'],
    '빈 편지창을 기억해 들어올 때마다 쓰기가 열립니다: ' + JSON.stringify(back.opened));
});

test('★ 쓰다 «만» 편지는 예전 그대로 기억한다 — 돌아갈 자리가 진짜로 있다', () => {
  const c = boot('uid-N2');
  c.state.view = 'mail'; c.state.mailSent = false;
  c._compose = { to: 'kim@example.com', base: {} };   // 받는 곳을 적어 두었다
  c.saveLastScreen();
  const back = boot('uid-N2');
  back.__store[back.lastScreenKey()] = c.__store[c.lastScreenKey()];
  back.restoreLastScreen();
  assert.deepEqual(back.opened, ['mail'],
    '쓰다 만 편지가 있는데 쓰기로 안 돌아옵니다: ' + JSON.stringify(back.opened));
});

test('제목·본문만 건드린 편지도 기억한다 (받는 곳이 아직 비어 있어도)', () => {
  const c = boot('uid-N3');
  c.state.view = 'mail'; c.state.mailSent = false;
  c._compose = { to: '', subject: '급여자료 요청', base: { subject: '' } };
  c.saveLastScreen();
  const back = boot('uid-N3');
  back.__store[back.lastScreenKey()] = c.__store[c.lastScreenKey()];
  back.restoreLastScreen();
  assert.deepEqual(back.opened, ['mail']);
});
