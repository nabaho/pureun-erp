/* 메일 쓰기는 «딴 창»에서 — 보던 화면을 덮지 않는다 (대표 지시 2026-09-08)
   「이메일 작성시 새로운 팝업창이 떠야되는데 현재 창에서 팝업으로 덮인다 이부분 개선해라」

   ■ 무엇이 문제였나 — 문이 «넷»인데 그중 하나만 딴 창으로 갔다
     ① 목록의 이메일 «칸»          → clickMailCell → openMailWindow (딴 창) ✓
     ② 상세 패널의 이메일 «줄»      → openSendMaterials ✗
     ③ 상세 패널의 「📧 메일」 단추  → openSendMaterials ✗
     ④ 폰 상세의 「📧 메일」        → openSendMaterials ✗
   `openSendMaterials` 는 «이 창»에서 자료 고르기 화면(#sendMatBg)을 덮어 띄우거나
   («기본 설정»이 그것이다), 「바로 보내기」면 이 창을 편지 화면으로 갈아 버린다.
   그래서 보던 명함 목록이 사라졌다.

   ■ 곁들여 있던 함정 — 새 창이 «안내문만» 보이던 길
   메일 쓰기에는 길이 둘이다: 「회사 메일로 바로 보내기」(auto)면 편지 화면으로 바로,
   그 밖(기본값)이면 «자료 고르기»를 거친다. 그런데 새 창을 받는 자리는
   `openMailPage` 만 불렀고, 그것은 auto 가 아니면 **안내 토스트만** 내놓는다.
   → 기본 설정인 사람에게는 창이 떠서 아무 편지지도 없었다. 어느 길로 갈지는
     `openSendMaterials` 가 «한 곳»에서 정하므로, 새 창에서도 그것을 부른다.

   ★ 못 박는 것
     ① 「메일 쓰기로 간다」는 문은 `openMailWindow` «하나»다. 화면 코드가
        `openSendMaterials` 를 바로 부르지 않는다.
     ② 창에 «이름»이 있다 — 여러 번 눌러도 창은 하나다(2026-08-29 지시).
     ③ 이미 열린 창은 `focus()` 로 앞으로 끌어온다. 안 하면 아무 일도 안 한 것처럼 보인다.
     ④ 팝업이 막히면 «예전 길»로 되돌아간다. 아무 일도 안 하면 눌러도 반응 없는 화면이 된다.
     ⑤ 새 창은 «두 길 모두» 열 수 있다 — auto 든 아니든.
     ⑥ 딴 창까지 건너온 뒤에는 «다시 묻지 않는다». 되돌림 길(같은 창)에서는 묻는다.

     node --test tests/cards-mail-always-own-window.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}

/* ══════ ① 문이 하나다 ══════ */

test('★★★ 화면 코드가 openSendMaterials 를 «바로» 부르지 않는다 — 그 화면이 덮인다', () => {
  /* 남아도 되는 자리는 둘뿐이다:
       · 팝업이 막혔을 때 되돌아가는 자리(openMailWindow 안)
       · 설정을 읽고 다시 들어오는 자리(자기 자신)
     화면(onclick=)에서 부르면 보던 화면이 덮인다 — 대표가 지적한 그것이다. */
  const hits = SRC.split('\n')
    .map((ln, i) => [i + 1, ln])
    .filter(([, ln]) => /openSendMaterials\(/.test(ln));
  const onClick = hits.filter(([, ln]) => /onclick=/.test(ln));
  assert.equal(onClick.length, 0,
    '★★★ 화면에서 바로 부르는 자리가 남았다 (' + onClick.map(h => h[0]).join('·') + '줄) — '
    + '메일 쓰기는 openMailWindow 로 간다');
  /* 문이 통째로 사라지지도 않았다 — 되돌림 길과 재진입은 있어야 한다 */
  assert.ok(hits.length >= 3, '★ openSendMaterials 를 부르는 자리가 없다 (' + hits.length + ')');
});

test('★★★ 네 문이 «모두» openMailWindow 로 간다', () => {
  /* 이메일 «줄»(상세 두 곳) — 폰과 PC 가 같은 글귀를 쓴다 */
  const rows = SRC.split('\n').filter(ln => /k==='email'\) v=`<a href="#"/.test(ln));
  assert.equal(rows.length, 2, '★ 이메일 줄을 그리는 자리가 둘이 아니다 (' + rows.length + ')');
  rows.forEach(ln => assert.match(ln, /openMailWindow\('\$\{it\.id\}'\)/,
    '★★★ 상세의 이메일 줄이 아직 이 창에서 열린다'));
  /* 「📧 메일」 — 폰(a)과 PC(button) */
  const btns = SRC.split('\n').filter(ln => /📧 메일<\/(a|button)>/.test(ln));
  assert.equal(btns.length, 2, '★ 「📧 메일」 단추가 둘이 아니다 (' + btns.length + ')');
  btns.forEach(ln => assert.match(ln, /openMailWindow\('\$\{id\}'\)/,
    '★★★ 「📧 메일」 단추가 아직 이 창에서 열린다'));
  /* 목록의 이메일 «칸» — 예전부터 딴 창이었다. 그대로다. */
  assert.match(fnBody('clickMailCell'), /openMailWindow\(id\)/, '★ 목록 칸의 길이 바뀌었다');
});

/* ══════ ②③④ 딴 창 열기 ══════ */

function runWin(opt) {
  const o = Object.assign({ email: 'a@b.kr', blocked: false }, opt || {});
  const ctx = {
    console, Object, String, encodeURIComponent,
    state: { items: { c1: { id: 'c1', name: '홍길동', company: '가나테크', email: o.email } } },
    normEmail: s => String(s || '').trim(),
    toast: (m) => { ctx._toast = m; },
    openSendMaterials: (id, op) => { ctx._fell = { id: id, opt: op }; },
    window: {
      open: (url, name) => {
        ctx._open = { url: url, name: name };
        if (o.blocked) return null;
        return { focus: () => { ctx._focused = true; } };
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(SRC.slice(SRC.indexOf('const MAIL_WIN ='), SRC.indexOf('\nfunction openSendMaterials'))
    .replace('const MAIL_WIN', 'var MAIL_WIN'), ctx);
  ctx.openMailWindow('c1');
  return ctx;
}

test('★★★ 딴 창을 «이름 붙여» 연다 — 여러 번 눌러도 창은 하나다', () => {
  const c = runWin();
  assert.ok(c._open, '★★★ 창을 아예 안 열었다');
  assert.equal(c._open.name, 'puMailWrite',
    '★★ 창 이름이 없거나 다르다 — 이름이 없으면 누를 때마다 새 창이 쌓인다');
  assert.equal(c.MAIL_WIN, 'puMailWrite');
});

test('★★★ 주소에 «누구에게·어느 명함»을 실어 보낸다', () => {
  const c = runWin();
  const u = new URL('https://x.io/pureunall/' + c._open.url);
  assert.equal(u.pathname, '/pureunall/pu-cards.html', '★ 다른 화면을 연다');
  assert.equal(u.searchParams.get('view'), 'mail', '★ 메일 문으로 안 간다 — 명함 목록이 열린다');
  assert.equal(u.searchParams.get('to'), 'a@b.kr', '★ 받는 곳을 안 실었다 — 빈 편지지가 열린다');
  assert.equal(u.searchParams.get('name'), '홍길동', '★ 누구인지 안 실었다');
  assert.equal(u.searchParams.get('card'), 'c1',
    '★★ 어느 명함인지 안 실었다 — 새 창이 자료 고르기로 갈 수 없다');
});

test('★★ 이미 열려 있던 창을 «앞으로» 끌어온다 — 안 하면 아무 일도 안 한 것처럼 보인다', () => {
  assert.equal(runWin()._focused, true, '★★ focus() 를 안 부른다');
});

test('★★★ 팝업이 막히면 «예전 길»로 되돌아간다 — 아무 일도 안 하면 안 된다', () => {
  const c = runWin({ blocked: true });
  assert.ok(c._fell, '★★★ 팝업이 막혔는데 아무 일도 안 했다 — 눌러도 반응 없는 화면이 된다');
  assert.equal(c._fell.id, 'c1');
  /* 되돌림 길은 «같은 창»이라, 갑자기 화면이 바뀌지 않게 묻는 것이 맞다 */
  assert.ok(!(c._fell.opt && c._fell.opt.asked),
    '★★ 되돌림 길에서 묻지 않는다 — 보던 목록이 갑자기 편지 화면으로 바뀐다');
});

test('★★ 이메일이 없으면 «알린다» — 창을 열지 않는다', () => {
  const c = runWin({ email: '' });
  assert.equal(c._open, undefined, '★ 빈 편지지 창을 열었다');
  assert.match(String(c._toast), /이메일이 없습니다/, '★ 왜 안 열리는지 안 알려 준다');
});

/* ══════ ⑤⑥ 새 창이 «두 길 모두» 연다 ══════ */

function runDoor(opt) {
  const o = Object.assign({ card: 'c1', has: true }, opt || {});
  const ctx = {
    console, Object, String, Number, JSON, URLSearchParams, setTimeout,
    location: { search: '?view=mail&to=a%40b.kr&name=%ED%99%8D&card=' + o.card },
    localStorage: { getItem: () => null },
    myUid: 'u1', myEmail: 'me@pureun.kr',
    state: { items: o.has ? { c1: { id: 'c1', email: 'a@b.kr' } } : {} },
    _lastScreenDone: false,
    openSendMaterials: (id, op) => { ctx._sent = { id: id, opt: op }; },
    openMailPage: (pre) => { ctx._page = pre; },
    openMailBox: () => { ctx._box = true; },
    openCoThread: () => { ctx._thread = true; },
    lastScreenKey: () => 'k',
    addMailIcon: () => { }
  };
  vm.createContext(ctx);
  vm.runInContext([fnBody('mailToFromUrl'), fnBody('mailCoFromUrl'), fnBody('urlWantsMail'),
    fnBody('restoreLastScreen')].join('\n'), ctx);
  ctx.restoreLastScreen();
  return ctx;
}

test('★★★ 새 창은 «어느 길로 갈지 정하는 곳»으로 간다 — 안내문만 보이던 길을 막는다', () => {
  const c = runDoor();
  assert.ok(c._sent, '★★★ openMailPage 만 부른다 — 기본 설정인 사람에게는 안내문만 뜬다');
  assert.equal(c._sent.id, 'c1', '★ 어느 명함인지 안 넘긴다');
  assert.equal(c._sent.opt && c._sent.opt.asked, true,
    '★★ 다시 묻는다 — 창까지 열린 뒤에 「메일을 쓸까요?」는 뜻이 없다');
  assert.equal(c._page, undefined, '★ 두 길을 함께 부른다');
});

test('★★ 명함이 아직 없으면 «예전 그대로» — 자료 고르기는 명함 없이는 못 연다', () => {
  const c = runDoor({ has: false });
  assert.equal(c._sent, undefined, '★ 없는 명함으로 자료 고르기를 연다');
  assert.ok(c._page, '★★ 아무것도 안 열었다 — 창이 비어 있게 된다');
  assert.equal(c._page.to, 'a@b.kr', '★ 받는 곳을 안 넘긴다');
});

test('★★ card= 가 없이 들어온 길도 열린다', () => {
  const c = runDoor({ card: '' });
  assert.ok(c._page, '★ 아무것도 안 열었다');
  assert.equal(c._sent, undefined);
});

test('★★ to= 가 없으면 예전대로 «받은메일함»이다 — 빈 편지지가 아니다', () => {
  const ctx = runDoor({ card: 'c1' });
  /* 위와 같은 얼개로 to 없이 한 번 더 */
  const c2 = (() => {
    const o = Object.assign({}, ctx);
    const ctx2 = {
      console, Object, String, Number, JSON, URLSearchParams, setTimeout,
      location: { search: '?view=mail' }, localStorage: { getItem: () => null },
      myUid: 'u1', myEmail: 'me@pureun.kr', state: { items: {} }, _lastScreenDone: false,
      openSendMaterials: () => { ctx2._sent = true; }, openMailPage: () => { ctx2._page = true; },
      openMailBox: () => { ctx2._box = true; }, openCoThread: () => { }, lastScreenKey: () => 'k',
      addMailIcon: () => { }
    };
    vm.createContext(ctx2);
    vm.runInContext([fnBody('mailToFromUrl'), fnBody('mailCoFromUrl'), fnBody('urlWantsMail'),
      fnBody('restoreLastScreen')].join('\n'), ctx2);
    ctx2.restoreLastScreen();
    return ctx2;
  })();
  assert.equal(c2._box, true, '★★ 메일함을 여는 길이 깨졌다 (대표 지시 2026-08-24)');
  assert.equal(c2._sent, undefined, '★ 받는 곳도 없는데 쓰기로 간다');
});

/* ══════ ⑥ 묻기 ══════ */

test('★★★ asked 면 안 묻고, 아니면 «묻는다»', () => {
  const fn = fnBody('openSendMaterials');
  /* ⚠ `assert.match(fn, /confirm\(/)` 로는 부족하다 — `false && confirm(` 도 통과한다.
       「묻지 않고 넘어가는 길」이 asked 하나로만 갈리는지 «글귀로» 못 박는다. */
  assert.match(fn, /if\(!\(opt && opt\.asked\)\s*\n?\s*&& !confirm\(/,
    '★★★ 묻는 자리가 바뀌었다 — 늘 묻거나 늘 안 묻게 되면 한쪽이 놀란다');
  /* 설정을 읽고 다시 들어올 때 갈래를 «들고» 가야 한다 */
  assert.match(fn, /loadMaterials\(\(\)=>openSendMaterials\(id, opt\)\)/,
    '★★ 다시 들어올 때 갈래를 잃는다 — 딴 창에서도 다시 묻게 된다');
});
